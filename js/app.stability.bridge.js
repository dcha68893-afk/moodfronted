(function () {
    'use strict';

    if (window.__APP_STABILITY_BRIDGE_READY__) {
        return;
    }
    window.__APP_STABILITY_BRIDGE_READY__ = true;

    const MODULE_REHYDRATE_EVENT = 'app:rehydrate';
    const NETWORK_RESTORED_EVENT = 'networkRestored';
    const NETWORK_OFFLINE_EVENT = 'networkOffline';

    function normalizeApiUrl(url, method, data) {
        if (typeof url !== 'string' || !url) {
            return url;
        }

        // Skip already-absolute URLs (http/https/ws/wss) — don't touch them
        if (/^https?:\/\/|^wss?:\/\//.test(url)) {
            return url;
        }

        let normalizedUrl = url;

        normalizedUrl = normalizedUrl.replace(/^\/api\/marketplace\b/, '/api/tools/marketplace');
        normalizedUrl = normalizedUrl.replace(/^\/api\/payments\b/, '/api/tools/payments');
        normalizedUrl = normalizedUrl.replace(/^\/api\/premium\b/, '/api/tools/premium');
        normalizedUrl = normalizedUrl.replace(/^\/api\/user\/subscription\b/, '/api/tools/user/subscription');
        normalizedUrl = normalizedUrl.replace(/^\/api\/statuses\b/, '/api/status');
        normalizedUrl = normalizedUrl.replace(/^\/api\/friends\/user\/([^/?#]+)(.*)$/i, '/api/friends/$1$2');
        normalizedUrl = normalizedUrl.replace(/^\/api\/groups\/invites\/pending\b/i, '/api/groups/invitations?status=pending');
        normalizedUrl = normalizedUrl.replace(/^\/api\/events\b/i, '/api/groups/events');
        // REMOVED: /api/settings/2fa -> /api/2fa rewrite.
        // /api/settings/2fa/* (settings.js) writes to User.mfaEnabled/mfaSecret,
        // which is what auth.js's login gate actually checks.
        // /api/2fa/* (twoFactor.js) writes to a separate user_totp_secrets table
        // that the login flow never reads — redirecting into it would let a user
        // "enable" 2FA that never actually protects their account. See report.

        if (/^\/api\/groups\/[^/]+\/members$/i.test(normalizedUrl) && String(method || 'GET').toUpperCase() === 'POST') {
            let body = data;
            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body);
                } catch (_) {}
            }
            const userId = body && (body.userId || body.memberId);
            if (userId) {
                normalizedUrl += `/${encodeURIComponent(userId)}`;
            }
        }

        // FIX: relative /api/* paths (no host prefix) resolve against the
        // current page origin (nexopa.onrender.com) instead of the
        // backend. Prepend the backend origin so inline scripts in calls.html,
        // marketplace-advanced.js, etc. that use bare '/api/...' paths work.
        // Applied AFTER all path rewrites above so the regex anchors (^) still work.
        if (normalizedUrl.startsWith('/api/') || normalizedUrl.startsWith('/socket.io/')) {
            const apiOrigin = (typeof window !== 'undefined' && window.__getApiOrigin)
                ? window.__getApiOrigin()
                : 'https://nexora-3bla.onrender.com';
            normalizedUrl = apiOrigin + normalizedUrl;
        }

        return normalizedUrl;
    }

    function emitDomEvent(type, detail) {
        try {
            window.dispatchEvent(new CustomEvent(type, { detail }));
        } catch (_) {}
    }

    function emitBusEvent(type, payload) {
        try {
            if (window.KynectaEventBus && typeof window.KynectaEventBus.emit === 'function') {
                window.KynectaEventBus.emit(type, payload, { async: true, persist: false });
            }
        } catch (_) {}
    }

    function normalizeSettingKey(rawKey) {
        return String(rawKey || '').replace(/^\.+|\.+$/g, '');
    }

    function normalizeSettingPayload(key, value) {
        const fullKey = normalizeSettingKey(key);
        const parts = fullKey.split('.').filter(Boolean);
        const section = parts[0] || 'general';
        const propKey = parts.length > 1 ? parts.slice(1).join('.') : section;
        return {
            fullKey,
            section,
            key: propKey,
            value
        };
    }

    function readAllSettings() {
        try {
            if (window.NexopaSettingsManager && typeof window.NexopaSettingsManager.getAllSettings === 'function') {
                return window.NexopaSettingsManager.getAllSettings();
            }
        } catch (_) {}
        try {
            if (window.SettingsStore && typeof window.SettingsStore.data === 'object' && window.SettingsStore.data) {
                return { ...window.SettingsStore.data };
            }
        } catch (_) {}
        return {};
    }

    function updateKynectaStoreSetting(fullKey, value) {
        try {
            if (window.KynectaStore && typeof window.KynectaStore.set === 'function' && fullKey) {
                window.KynectaStore.set(`settings.${fullKey}`, value, { persist: true, silent: false });
            }
        } catch (_) {}
    }

    function notifyAllModules(key, value) {
        const payload = normalizeSettingPayload(key, value);
        if (!payload.fullKey) {
            return;
        }

        updateKynectaStoreSetting(payload.fullKey, payload.value);

        emitDomEvent('settingChanged', {
            section: payload.section,
            key: payload.key,
            fullKey: payload.fullKey,
            value: payload.value,
            timestamp: Date.now()
        });

        emitDomEvent('settingsUpdated', {
            settings: readAllSettings(),
            changedKey: payload.fullKey,
            value: payload.value,
            timestamp: Date.now()
        });

        emitBusEvent('SETTINGS_UPDATED', {
            key: payload.fullKey,
            section: payload.section,
            value: payload.value,
            settings: readAllSettings(),
            timestamp: Date.now()
        });
    }

    window.notifyAllModules = window.notifyAllModules || notifyAllModules;

    function installSettingsBridge() {
        if (!window.SettingsStore || window.SettingsStore.__stabilityBridgeInstalled__) {
            return;
        }

        const store = window.SettingsStore;
        store.__stabilityBridgeInstalled__ = true;

        if (typeof store.load === 'function') {
            try {
                store.load();
            } catch (_) {}
        }

        const originalSet = typeof store.set === 'function' ? store.set.bind(store) : null;
        if (originalSet) {
            store.set = function patchedSet(key, value) {
                return originalSet(key, value);
            };
        }

        const originalSubscribe = typeof store.subscribe === 'function' ? store.subscribe.bind(store) : null;
        if (originalSubscribe) {
            store.subscribe = function patchedSubscribe(key, callback) {
                if (key === '*') {
                    return originalSubscribe(key, function wrappedCallback(value, changedKey) {
                        callback(value, changedKey);
                    });
                }
                return originalSubscribe(key, callback);
            };

            store.subscribe('*', function defaultStabilitySubscriber(value, changedKey) {
                notifyAllModules(changedKey, value);
            });
        }
    }

    function bridgeSettingsManager() {
        if (!window.NexopaSettingsManager || window.NexopaSettingsManager.__stabilityBridgeInstalled__) {
            return;
        }

        const manager = window.NexopaSettingsManager;
        manager.__stabilityBridgeInstalled__ = true;

        if (typeof manager.addChangeListener === 'function') {
            manager.addChangeListener('all', function onAnySettingChanged(value, key) {
                if (key && key !== 'all') {
                    notifyAllModules(key, value);
                }
            });
        }

        try {
            const settings = manager.getAllSettings();
            if (settings && typeof settings === 'object') {
                Object.entries(settings).forEach(function (entry) {
                    const section = entry[0];
                    const values = entry[1];
                    if (values && typeof values === 'object' && !Array.isArray(values)) {
                        Object.entries(values).forEach(function (nestedEntry) {
                            notifyAllModules(`${section}.${nestedEntry[0]}`, nestedEntry[1]);
                        });
                    }
                });
            }
        } catch (_) {}
    }

    async function apiRequest(method, url, data, token, extraOptions) {
        const normalizedMethod = String(method || 'GET').toUpperCase();
        const normalizedUrl = normalizeApiUrl(url, normalizedMethod, data);
        const options = { ...(extraOptions || {}) };
        const headers = new Headers(options.headers || {});

        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
        const isBodyAllowed = !['GET', 'HEAD'].includes(normalizedMethod);

        if (isBodyAllowed && data !== undefined && data !== null) {
            if (isFormData) {
                options.body = data;
            } else if (typeof data === 'string') {
                options.body = data;
                if (!headers.has('Content-Type')) {
                    headers.set('Content-Type', 'application/json');
                }
            } else {
                options.body = JSON.stringify(data);
                if (!headers.has('Content-Type')) {
                    headers.set('Content-Type', 'application/json');
                }
            }
        }

        options.method = normalizedMethod;
        options.headers = headers;
        if (!options.credentials) {
            options.credentials = 'include';
        }

        if (window.api && window.api.request && typeof window.api.request.request === 'function') {
            return window.api.request.request(normalizedUrl, options);
        }

        const response = await fetch(normalizedUrl, options);
        const payload = await response.json().catch(async function () {
            const text = await response.text().catch(function () { return ''; });
            return text ? { success: response.ok, raw: text } : { success: response.ok };
        });

        if (payload && typeof payload.success !== 'boolean') {
            payload.success = response.ok;
        }
        if (payload && typeof payload.status !== 'number') {
            payload.status = response.status;
        }

        return payload;
    }

    window.apiRequest = apiRequest;
    window.normalizeApiUrl = window.normalizeApiUrl || normalizeApiUrl;

    if (!window.__APP_FETCH_ALIAS_BRIDGE__) {
        window.__APP_FETCH_ALIAS_BRIDGE__ = true;
        const originalFetch = window.fetch ? window.fetch.bind(window) : null;

        if (originalFetch) {
            window.fetch = function patchedFetch(resource, init) {
                try {
                    const method = init && init.method ? init.method : (resource && resource.method) || 'GET';
                    const body = init && Object.prototype.hasOwnProperty.call(init, 'body')
                        ? init.body
                        : (resource && resource.body);

                    if (typeof resource === 'string') {
                        return originalFetch(normalizeApiUrl(resource, method, body), init);
                    }

                    if (resource instanceof Request) {
                        const normalizedResourceUrl = normalizeApiUrl(resource.url, method, body);
                        if (normalizedResourceUrl !== resource.url) {
                            const clonedInit = {
                                method: resource.method,
                                headers: resource.headers,
                                body: resource.body,
                                mode: resource.mode,
                                credentials: resource.credentials,
                                cache: resource.cache,
                                redirect: resource.redirect,
                                referrer: resource.referrer,
                                referrerPolicy: resource.referrerPolicy,
                                integrity: resource.integrity,
                                keepalive: resource.keepalive,
                                signal: resource.signal
                            };
                            return originalFetch(new Request(normalizedResourceUrl, clonedInit), init);
                        }
                    }
                } catch (_) {}

                return originalFetch(resource, init);
            };
        }
    }

    if (!window.__MODULE_INIT_REGISTRY__) {
        window.__MODULE_INIT_REGISTRY__ = new Set();
    }

    window.registerModuleInit = function registerModuleInit(moduleName) {
        const normalized = String(moduleName || '').trim().toLowerCase();
        if (!normalized) {
            return true;
        }
        if (window.__MODULE_INIT_REGISTRY__.has(normalized)) {
            return false;
        }
        window.__MODULE_INIT_REGISTRY__.add(normalized);
        return true;
    };

    function refreshStaticAssets() {
        const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'));
        stylesheets.forEach(function (link) {
            try {
                const href = link.getAttribute('href');
                if (!href) {
                    return;
                }
                const url = new URL(href, window.location.origin);
                if (url.origin !== window.location.origin) {
                    return;
                }
                link.href = url.pathname + url.search;
            } catch (_) {}
        });
    }

    let networkRestoreTimer = null;
    function scheduleRehydrate(reason) {
        clearTimeout(networkRestoreTimer);
        networkRestoreTimer = setTimeout(function () {
            refreshStaticAssets();

            emitDomEvent(NETWORK_RESTORED_EVENT, { reason, timestamp: Date.now() });
            emitDomEvent(MODULE_REHYDRATE_EVENT, { reason, timestamp: Date.now() });
            emitBusEvent('SYSTEM_NETWORK_ONLINE', { reason, timestamp: Date.now() });

            try {
                if (window.wsService && typeof window.wsService.handleReconnect === 'function') {
                    window.wsService.handleReconnect({ reason });
                }
            } catch (_) {}

            try {
                if (window.KynectaSync && typeof window.KynectaSync.syncAll === 'function') {
                    window.KynectaSync.syncAll();
                }
            } catch (_) {}
        }, 150);
    }

    window.addEventListener('online', function () {
        scheduleRehydrate('browser-online');

        // PHASE10: Flush offline queue and sync deletions when connectivity restores
        setTimeout(function () {
            try { window.__OfflineMessageQueue?.flushAll?.(); }  catch(_) {}
            try { window.__PHASE10_DeletionRegistry?.syncFromServer?.(Date.now() - 24 * 60 * 60 * 1000); } catch(_) {}
            try { window.__Phase10TransportRuntime && console.log('[Phase10Bridge] Transport best:', window.__Phase10TransportRuntime.getBestTransport()); } catch(_) {}
        }, 1500);
    });

    window.addEventListener('offline', function () {
        emitDomEvent(NETWORK_OFFLINE_EVENT, { timestamp: Date.now() });
        emitBusEvent('SYSTEM_NETWORK_OFFLINE', { timestamp: Date.now() });
        // PHASE10: Switch HybridTransportEngine to offline mode
        try { window.__HybridTransportEngine?.recordFailure?.('INTERNET'); } catch(_) {}
    });

    window.addEventListener('settings-store-ready', function () {
        installSettingsBridge();
        bridgeSettingsManager();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            installSettingsBridge();
            bridgeSettingsManager();
        });
    } else {
        installSettingsBridge();
        bridgeSettingsManager();
    }
})();
