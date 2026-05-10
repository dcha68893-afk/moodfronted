(function () {
    'use strict';

    if (window.__KYNECTA_RUNTIME_AUTHORITY_LOADED__) return;
    window.__KYNECTA_RUNTIME_AUTHORITY_LOADED__ = true;

    const LOGIN_PATHS = new Set(['/', '/index.html']);
    const CHAT_ENTRY = 'chat.html';
    const SESSION_EVENTS = {
        restored: 'SESSION_RESTORED',
        updated: 'SESSION_UPDATED',
        expired: 'SESSION_EXPIRED',
        refreshed: 'SESSION_REFRESHED'
    };

    const runtimeState = {
        realtimeListenersBound: false,
        networkListenersBound: false,
        validatingPromise: null,
        refreshingPromise: null,
        lastRealtimeToken: null,
        bootstrapped: false,
        postRenderTasksScheduled: false
    };

    function currentPath() {
        return window.location.pathname || '/';
    }

    function isLoginPage() {
        return LOGIN_PATHS.has(currentPath());
    }

    function isApplicationPage() {
        return !isLoginPage();
    }

    function safeJsonParse(raw, fallback = null) {
        if (!raw || typeof raw !== 'string') return fallback;
        try {
            return JSON.parse(raw);
        } catch (_error) {
            return fallback;
        }
    }

    function decodeTokenPayload(token) {
        try {
            const parts = String(token || '').split('.');
            if (parts.length !== 3) return null;
            const payload = JSON.parse(atob(parts[1]));
            return payload && typeof payload === 'object' ? payload : null;
        } catch (_error) {
            return null;
        }
    }

    function detectLocalEnvironment(hostname) {
        const host = String(hostname || window.location.hostname || '').toLowerCase();
        if (!host) return true;
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
        if (host.endsWith('.local')) return true;
        if (host.startsWith('192.168.') || host.startsWith('10.')) return true;
        return /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    }

    function getApiOrigin() {
        return detectLocalEnvironment() ? 'http://localhost:4000' : 'https://moodchat-fy56.onrender.com';
    }

    function getApiBase() {
        return `${getApiOrigin()}/api`;
    }

    window.__isLocalEnvironment = window.__isLocalEnvironment || detectLocalEnvironment;
    window.__getApiOrigin = window.__getApiOrigin || getApiOrigin;
    window.__getApiBase = window.__getApiBase || getApiBase;

    function emit(eventName, payload) {
        if (window.KynectaEventBus && typeof window.KynectaEventBus.emit === 'function') {
            window.KynectaEventBus.emit(eventName, payload);
        }
        try {
            window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
        } catch (_error) {}
    }

    function normalizeAuth(auth) {
        if (!auth || typeof auth !== 'object') return null;

        const token = auth.token || auth.accessToken || auth.access_token || null;
        if (!token) return null;

        const tokenPayload = decodeTokenPayload(token);
        const fallbackUser = tokenPayload ? {
            id: tokenPayload.userId || tokenPayload.id || tokenPayload.sub || null,
            userId: tokenPayload.userId || tokenPayload.id || tokenPayload.sub || null,
            username: tokenPayload.username || tokenPayload.name || tokenPayload.email?.split('@')[0] || '',
            displayName: tokenPayload.displayName || tokenPayload.username || tokenPayload.name || tokenPayload.email?.split('@')[0] || '',
            email: tokenPayload.email || ''
        } : null;
        const user = auth.user || auth.data?.user || fallbackUser || null;
        const expiresAt = auth.expiresAt || auth.expires_at || null;
        const refreshToken = auth.refreshToken || auth.refresh_token || null;
        const userId = user?.id || user?.userId || auth.userId || auth.id || null;

        return {
            token,
            refreshToken,
            user,
            userId: userId ? String(userId) : null,
            expiresAt,
            authenticated: true
        };
    }

    function getStoredAuth() {
        if (window.AuthStorage && typeof window.AuthStorage.getAuth === 'function') {
            return normalizeAuth(window.AuthStorage.getAuth());
        }

        const canonical = safeJsonParse(localStorage.getItem('kynecta_auth'));
        if (canonical) return normalizeAuth(canonical);

        const fallbackToken =
            localStorage.getItem('authToken') ||
            localStorage.getItem('accessToken') ||
            localStorage.getItem('token') ||
            localStorage.getItem('moodchat_token');

        if (!fallbackToken) return null;

        return normalizeAuth({
            token: fallbackToken,
            refreshToken: localStorage.getItem('refreshToken') || null,
            user:
                safeJsonParse(localStorage.getItem('currentUser')) ||
                safeJsonParse(localStorage.getItem('user')) ||
                safeJsonParse(localStorage.getItem('moodchat_user')),
            expiresAt: null
        });
    }

    function updateParentSession(auth) {
        window.__PARENT_SESSION__ = auth ? {
            token: auth.token,
            refreshToken: auth.refreshToken || null,
            user: auth.user || null,
            userId: auth.userId || auth.user?.id || auth.user?.userId || null,
            authenticated: true,
            expiresAt: auth.expiresAt || null
        } : {
            token: null,
            refreshToken: null,
            user: null,
            userId: null,
            authenticated: false,
            expiresAt: null
        };
    }

    function mirrorLegacyAuth(auth) {
        if (!auth || !auth.token) return;

        const userJson = auth.user ? JSON.stringify(auth.user) : null;
        const tokenKeys = ['authToken', 'token', 'accessToken', 'USER_TOKEN', 'moodchat_token'];

        tokenKeys.forEach((key) => localStorage.setItem(key, auth.token));
        if (auth.refreshToken) localStorage.setItem('refreshToken', auth.refreshToken);
        localStorage.setItem('isLoggedIn', 'true');
        if (auth.userId) localStorage.setItem('currentUserId', auth.userId);
        if (userJson) {
            ['currentUser', 'user', 'moodchat_user'].forEach((key) => localStorage.setItem(key, userJson));
            window.currentUser = auth.user;
        }
    }

    function clearMirroredAuth() {
        [
            'authToken',
            'token',
            'accessToken',
            'USER_TOKEN',
            'moodchat_token',
            'refreshToken',
            'isLoggedIn',
            'currentUser',
            'user',
            'moodchat_user',
            'currentUserId'
        ].forEach((key) => localStorage.removeItem(key));

        updateParentSession(null);
        window.currentUser = null;
    }

    function persistSession(auth, options = {}) {
        const normalized = normalizeAuth(auth);
        if (!normalized) return null;

        if (window.AuthStorage && typeof window.AuthStorage.saveAuth === 'function') {
            window.AuthStorage.saveAuth(normalized);
        } else {
            localStorage.setItem('kynecta_auth', JSON.stringify(normalized));
        }

        if (window.Session && typeof window.Session.setSession === 'function') {
            try {
                window.Session.setSession(normalized);
            } catch (_error) {}
        }

        updateParentSession(normalized);
        mirrorLegacyAuth(normalized);
        hydrateStoreFromSession(normalized);

        if (options.emit !== false) {
            emit(options.eventName || SESSION_EVENTS.updated, normalized);
            try {
                window.dispatchEvent(new CustomEvent('sessionUpdated', { detail: normalized }));
            } catch (_error) {}
        }

        return normalized;
    }

    function clearSession(options = {}) {
        if (window.AuthStorage && typeof window.AuthStorage.clearAuth === 'function') {
            window.AuthStorage.clearAuth();
        } else {
            localStorage.removeItem('kynecta_auth');
        }

        if (window.Session && typeof window.Session.clearSession === 'function') {
            try {
                window.Session.clearSession();
            } catch (_error) {}
        }

        clearMirroredAuth();

        if (window.KynectaStore) {
            window.KynectaStore.set('session', {
                authenticated: false,
                token: null,
                refreshToken: null,
                expiresAt: null,
                userId: null
            });
            window.KynectaStore.set('user', null);
        }

        if (options.emit !== false) {
            emit(SESSION_EVENTS.expired, { reason: options.reason || 'cleared' });
        }
    }

    function hydrateStoreFromSession(auth) {
        if (!window.KynectaStore || !auth) return;

        window.KynectaStore.set('session', {
            authenticated: true,
            token: auth.token,
            refreshToken: auth.refreshToken || null,
            expiresAt: auth.expiresAt || null,
            userId: auth.userId || auth.user?.id || null
        });

        if (auth.user) {
            window.KynectaStore.set('user', {
                ...(window.KynectaStore.get('user') || {}),
                ...auth.user,
                id: auth.user?.id || auth.userId || null
            });
        }
    }

    function hydrateSettings() {
        const settings =
            (window.AppSettings && typeof window.AppSettings.getAll === 'function'
                ? window.AppSettings.getAll()
                : null) ||
            (window.LocalStoreSettings && typeof window.LocalStoreSettings.getAll === 'function'
                ? window.LocalStoreSettings.getAll()
                : null) ||
            safeJsonParse(localStorage.getItem('knecta_settings_cache'))?.data ||
            null;

        if (!settings) return;

        if (window.KynectaStore) {
            const current = window.KynectaStore.get('settings') || {};
            window.KynectaStore.set('settings', {
                ...current,
                theme: settings.theme || current.theme,
                language: settings.language || current.language,
                privacy: settings.privacy || current.privacy || {},
                syncEnabled: settings.syncEnabled === true,
                notifications: settings.notifications?.messages !== false,
                soundEnabled: settings.notifications?.calls !== false
            });
        }

        applyThemeSettings(settings);
    }

    function applyThemeSettings(settings) {
        if (!settings) return;

        const theme = settings.appearance?.theme || settings.theme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.toggle('theme-dark', theme === 'dark');
        document.documentElement.classList.toggle('theme-light', theme !== 'dark');
        document.body.classList.toggle('theme-dark', theme === 'dark');

        const accentColor = settings.appearance?.accentColor || settings.accentColor;
        if (accentColor) {
            document.documentElement.style.setProperty('--theme-accent', accentColor);
            document.documentElement.style.setProperty('--primary-color', accentColor);
        }

        const language = settings.appearance?.language || settings.language;
        if (language) {
            document.documentElement.setAttribute('lang', language);
        }
    }

    function bridgeSettingsStore() {
        if (!window.SettingsStore || runtimeState.settingsBound) return;
        runtimeState.settingsBound = true;

        if (typeof window.SettingsStore.subscribe === 'function') {
            window.SettingsStore.subscribe('*', function (_value, key) {
                hydrateSettings();
                emit('SETTINGS_UPDATED', { key, value: window.SettingsStore.get ? window.SettingsStore.get(key) : _value });
            });
        }

        hydrateSettings();
    }

    function syncNetworkState() {
        const payload = {
            online: navigator.onLine,
            timestamp: Date.now()
        };

        if (window.KynectaStore) {
            window.KynectaStore.set('network.online', payload.online);
        }

        emit(payload.online ? 'SYSTEM_NETWORK_ONLINE' : 'SYSTEM_NETWORK_OFFLINE', payload);
    }

    function redirectToChat() {
        if (!isLoginPage()) return;
        window.location.replace(CHAT_ENTRY);
    }

    function redirectToLogin(reason) {
        if (!isApplicationPage()) return;
        const query = reason ? ('?reason=' + encodeURIComponent(reason)) : '';
        window.location.replace('index.html' + query);
    }

    function hasOfflineBootData() {
        try {
            const candidates = [
                'kynecta_messages_cache',
                'kynecta_friends_cache',
                'kynecta_groups_cache',
                'kynecta_status_cache',
                'knecta_settings_cache'
            ];
            return candidates.some(function (key) {
                return !!localStorage.getItem(key);
            });
        } catch (_error) {
            return false;
        }
    }

    function schedulePostRenderLogout(reason) {
        const performLogout = function () {
            clearSession({ emit: true, reason: reason || 'session-invalid' });
            redirectToLogin(reason || 'session-invalid');
        };

        if (document.documentElement.classList.contains('kynecta-booted')) {
            setTimeout(performLogout, 0);
            return;
        }

        const onRendered = function () {
            window.removeEventListener('KYNECTA_UI_RENDERED', onRendered);
            setTimeout(performLogout, 0);
        };
        window.addEventListener('KYNECTA_UI_RENDERED', onRendered);
    }

    function afterShellRender(callback) {
        if (document.documentElement.classList.contains('kynecta-booted')) {
            setTimeout(callback, 0);
            return;
        }

        const onRendered = function () {
            window.removeEventListener('KYNECTA_UI_RENDERED', onRendered);
            setTimeout(callback, 0);
        };

        window.addEventListener('KYNECTA_UI_RENDERED', onRendered);
    }

    async function fetchJson(url, options = {}) {
        const response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store',
            ...options
        });

        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (_error) {
            data = null;
        }

        return { response, data };
    }

    async function refreshSession(auth) {
        if (!auth?.refreshToken) return null;
        if (runtimeState.refreshingPromise) return runtimeState.refreshingPromise;

        runtimeState.refreshingPromise = (async function () {
            try {
                const { response, data } = await fetchJson('/api/auth/refresh', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ refreshToken: auth.refreshToken })
                });

                if (!response.ok || !data) return null;

                const refreshed = persistSession({
                    token: data.token || data.accessToken,
                    refreshToken: data.refreshToken || auth.refreshToken,
                    user: auth.user || data.user || null,
                    expiresAt: data.expiresAt || null
                }, { eventName: SESSION_EVENTS.refreshed });

                return refreshed;
            } catch (_error) {
                return null;
            } finally {
                runtimeState.refreshingPromise = null;
            }
        })();

        return runtimeState.refreshingPromise;
    }

    async function validateSessionInBackground(auth) {
        if (!auth?.token || !navigator.onLine) return auth;
        if (runtimeState.validatingPromise) return runtimeState.validatingPromise;

        runtimeState.validatingPromise = (async function () {
            try {
                const { response, data } = await fetchJson('/api/auth/me', {
                    headers: {
                        Authorization: 'Bearer ' + auth.token
                    }
                });

                if (response.ok && data) {
                    const user = data.data?.user || data.user || auth.user || null;
                    return persistSession({
                        ...auth,
                        user,
                        userId: user?.id || auth.userId || null
                    }, { eventName: SESSION_EVENTS.restored });
                }

                if (response.status === 401) {
                    const refreshed = await refreshSession(auth);
                    if (refreshed?.token) {
                        return validateSessionInBackground(refreshed);
                    }

                    schedulePostRenderLogout('session-expired');
                    return null;
                }

                return auth;
            } catch (_error) {
                return auth;
            } finally {
                runtimeState.validatingPromise = null;
            }
        })();

        return runtimeState.validatingPromise;
    }

    function handleIncomingRealtimeMessage(messageType, payload) {
        const type = String(messageType || '').toLowerCase();
        const body = payload || {};

        if (type === 'presence:update') {
            const userId = body.userId ? String(body.userId) : null;
            if (userId && window.KynectaStore) {
                const friendsById = { ...(window.KynectaStore.get('friends.byId') || {}) };
                friendsById[userId] = {
                    ...(friendsById[userId] || {}),
                    id: userId,
                    online: body.online === true,
                    lastSeen: body.timestamp || Date.now()
                };
                window.KynectaStore.set('friends.byId', friendsById);
            }
            emit(body.online ? 'FRIEND_ONLINE' : 'FRIEND_OFFLINE', body);
            return;
        }

        if (type === 'call:incoming') {
            if (window.KynectaStore) {
                window.KynectaStore.set('calls.ringing', body);
            }
            emit('CALL_INCOMING', body);
            return;
        }

        if (type === 'call:answered') {
            if (window.KynectaStore) {
                window.KynectaStore.set('calls.active', body);
                window.KynectaStore.set('calls.ringing', null);
            }
            emit('CALL_ACCEPTED', body);
            return;
        }

        if (type === 'call:rejected') {
            if (window.KynectaStore) {
                window.KynectaStore.set('calls.ringing', null);
            }
            emit('CALL_REJECTED', body);
            return;
        }

        if (type === 'call:cancelled') {
            if (window.KynectaStore) {
                window.KynectaStore.set('calls.ringing', null);
                window.KynectaStore.set('calls.active', null);
            }
            emit('CALL_CANCELLED', body);
            return;
        }

        if (type === 'call:ended' || type === 'call_force_ended') {
            if (window.KynectaStore) {
                window.KynectaStore.set('calls.ringing', null);
                window.KynectaStore.set('calls.active', null);
            }
            emit('CALL_ENDED', body);
            return;
        }

        if (type === 'webrtc:signal') {
            emit('CALL_SIGNAL', body);
            return;
        }

        if (type === 'notification:new') {
            emit('UI_NOTIFICATION', body);
            return;
        }

        if (type === 'message:delivered') {
            syncMessageStatus(body, 'delivered');
            emit('MESSAGE_DELIVERED', body);
            return;
        }

        if (type === 'message:read') {
            syncMessageStatus(body, 'read');
            emit('MESSAGE_READ', body);
            return;
        }

        if (type.indexOf('message') !== -1) {
            if (window.KynectaSyncEngine && typeof window.KynectaSyncEngine.ingestIncomingMessage === 'function') {
                window.KynectaSyncEngine.ingestIncomingMessage(body, body.chatId || body.conversationId).catch(function () {});
            }
            if (type === 'message:new') {
                try {
                    window.dispatchEvent(new CustomEvent('newMessage', {
                        detail: {
                            message: body
                        }
                    }));
                } catch (_error) {}
            }
            emit('MESSAGE_RECEIVED', body);
        }
    }

    function syncMessageStatus(payload, status) {
        const messageIds = []
            .concat(payload?.messageIds || [])
            .concat(payload?.messageId ? [payload.messageId] : []);

        if (window.KynectaLocalStore && typeof window.KynectaLocalStore.getMessageByServerId === 'function') {
            messageIds.forEach(function (messageId) {
                window.KynectaLocalStore.getMessageByServerId(String(messageId))
                    .then(function (existing) {
                        if (existing?.id) {
                            return window.KynectaLocalStore.updateMessageStatus(existing.id, status);
                        }
                        return null;
                    })
                    .catch(function () {});
            });
        }

        if (window.KynectaStore && payload?.chatId) {
            const chatId = String(payload.chatId);
            const existing = window.KynectaStore.get('messages.byChat.' + chatId) || [];
            if (!Array.isArray(existing) || existing.length === 0) return;

            const next = existing.map(function (message) {
                const serverId = message.serverId || message.id;
                if (messageIds.map(String).includes(String(serverId))) {
                    return { ...message, status };
                }
                return message;
            });

            window.KynectaStore.set('messages.byChat.' + chatId, next);
        }
    }

    function bindRealtimeListeners() {
        if (!window.KynectaRealtime || runtimeState.realtimeListenersBound) return;
        runtimeState.realtimeListenersBound = true;

        [
            'presence:update',
            'call:incoming',
            'call:answered',
            'call:rejected',
            'call:cancelled',
            'call:ended',
            'call_force_ended',
            'webrtc:signal',
            'notification:new',
            'message:new',
            'message:received',
            'message:delivered',
            'message:read'
        ].forEach(function (type) {
            window.KynectaRealtime.on(type, function (payload) {
                handleIncomingRealtimeMessage(type, payload);
            });
        });
    }

    function connectRealtime(auth) {
        if (!isApplicationPage() || !auth?.token || !window.KynectaRealtime) return;
        bindRealtimeListeners();

        if (runtimeState.lastRealtimeToken === auth.token && window.KynectaRealtime.isConnected()) {
            return;
        }

        runtimeState.lastRealtimeToken = auth.token;

        // ✅ FIX: Use safeConnect if available (never throws/rejects — always resolves null on failure)
        // This prevents "realtime connect failed: Event" from leaking raw DOM Event objects.
        const connectFn = (window.KynectaRealtime.safeConnect)
            ? () => window.KynectaRealtime.safeConnect(auth.token)
            : () => Promise.resolve(window.KynectaRealtime.connect(auth.token)).catch(function (e) {
                // Normalize raw DOM Event to Error so message is always a string
                const msg = (e instanceof Error) ? e.message
                    : (e && e.type) ? `WebSocket ${e.type} event`
                    : String(e || 'connect-failed');
                return Promise.reject(new Error(msg));
            });

        connectFn().catch(function (error) {
            const msg = (error instanceof Error) ? error.message : String(error || 'connect-failed');
            emit('SOCKET_DISCONNECTED', {
                reason: msg,
                timestamp: Date.now()
            });
            console.warn('[RuntimeAuthority] realtime connect failed:', msg);
        }).then(function () {
            if (window.KynectaRealtime && typeof window.KynectaRealtime.isConnected === 'function' && window.KynectaRealtime.isConnected()) {
                emit('SOCKET_CONNECTED', {
                    userId: auth.userId || auth.user?.id || null,
                    timestamp: Date.now()
                });
            }
        });
    }

    function ensureBootSession() {
        const auth = normalizeAuth(window.Session && typeof window.Session.getSession === 'function'
            ? window.Session.getSession()
            : null) || getStoredAuth();

        if (!auth) {
            updateParentSession(null);
            return null;
        }

        return persistSession(auth, { emit: false });
    }

    function bindNetworkListeners() {
        if (runtimeState.networkListenersBound) return;
        runtimeState.networkListenersBound = true;

        window.addEventListener('online', function () {
            syncNetworkState();
            const auth = getStoredAuth();
            if (auth) {
                connectRealtime(auth);
                if (window.KynectaSync && typeof window.KynectaSync.syncAll === 'function') {
                    window.KynectaSync.syncAll().catch(function () {});
                }
                validateSessionInBackground(auth).catch(function () {});
            }
        });

        window.addEventListener('offline', function () {
            syncNetworkState();
        });
    }

    function bootstrap() {
        if (runtimeState.bootstrapped) return;
        runtimeState.bootstrapped = true;

        const auth = ensureBootSession();
        bindNetworkListeners();
        bridgeSettingsStore();
        syncNetworkState();

        if (auth) {
            hydrateStoreFromSession(auth);
            if (isLoginPage()) {
                redirectToChat();
            }
            afterShellRender(function () {
                if (runtimeState.postRenderTasksScheduled) return;
                runtimeState.postRenderTasksScheduled = true;
                connectRealtime(auth);
                validateSessionInBackground(auth).catch(function () {});
                if (navigator.onLine && window.KynectaSync && typeof window.KynectaSync.syncAll === 'function') {
                    window.KynectaSync.syncAll().catch(function () {});
                }
            });
            return;
        }

        if (isApplicationPage()) {
            emit(SESSION_EVENTS.expired, { reason: 'missing-session', deferred: true });
            if (!hasOfflineBootData()) {
                afterShellRender(function () {
                    schedulePostRenderLogout('missing-session');
                });
            }
        }
    }

    window.AppRuntimeAuthority = {
        bootstrap,
        clearSession,
        persistSession,
        getSessionSnapshot: getStoredAuth,
        validateSessionInBackground
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    }

    bootstrap();
})();
