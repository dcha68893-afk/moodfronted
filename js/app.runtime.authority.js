(function () {
    'use strict';

    if (window.__KYNECTA_RUNTIME_AUTHORITY_LOADED__) return;
    window.__KYNECTA_RUNTIME_AUTHORITY_LOADED__ = true;

    const LOGIN_PATHS = new Set(['/', '/index.html']);
    const CHAT_ENTRY = 'chat.html';
    // FIX (auth bypass): this marker is set ONLY inside persistSession(), i.e.
    // only after a genuine successful login/token exchange, and is removed
    // inside clearSession() (explicit logout or invalidated session). It's the
    // thing that makes hasOfflineBootData() below actually mean "this device
    // was legitimately logged in before", instead of just "some cache blob
    // happens to exist" — see the FIX comment there for why that distinction
    // matters.
    const EVER_AUTHENTICATED_KEY = 'kynecta_ever_authenticated';
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
        postRenderTasksScheduled: false,
        lastRefreshDefinitive: false
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
        return detectLocalEnvironment() ? 'http://localhost:4000' : 'https://noxopa.onrender.com';
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
            localStorage.getItem('nexopa_token');

        if (!fallbackToken) return null;

        return normalizeAuth({
            token: fallbackToken,
            refreshToken: localStorage.getItem('refreshToken') || null,
            user:
                safeJsonParse(localStorage.getItem('currentUser')) ||
                safeJsonParse(localStorage.getItem('user')) ||
                safeJsonParse(localStorage.getItem('nexopa_user')),
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
        const tokenKeys = ['authToken', 'token', 'accessToken', 'USER_TOKEN', 'nexopa_token'];

        tokenKeys.forEach((key) => localStorage.setItem(key, auth.token));
        if (auth.refreshToken) localStorage.setItem('refreshToken', auth.refreshToken);
        localStorage.setItem('isLoggedIn', 'true');
        if (auth.userId) localStorage.setItem('currentUserId', auth.userId);
        if (userJson) {
            ['currentUser', 'user', 'nexopa_user'].forEach((key) => localStorage.setItem(key, userJson));
            window.currentUser = auth.user;
        }
    }

    function clearMirroredAuth() {
        [
            'authToken',
            'token',
            'accessToken',
            'USER_TOKEN',
            'nexopa_token',
            'refreshToken',
            'isLoggedIn',
            'currentUser',
            'user',
            'nexopa_user',
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
        try { localStorage.setItem(EVER_AUTHENTICATED_KEY, '1'); } catch (_error) {}

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
        try { localStorage.removeItem(EVER_AUTHENTICATED_KEY); } catch (_error) {}

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
        // Painting now goes through the single canonical engine
        // (js/theme.engine.js / window.ThemeManager) instead of this
        // function keeping its own copy of the same data-theme logic.
        if (window.ThemeManager) {
            window.ThemeManager.setTheme(theme);
        } else {
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.classList.toggle('theme-dark', theme === 'dark');
            document.documentElement.classList.toggle('theme-light', theme !== 'dark');
            document.body.classList.toggle('theme-dark', theme === 'dark');
        }

        const accentColor = settings.appearance?.accentColor || settings.accentColor;
        if (accentColor) {
            if (window.ThemeManager) window.ThemeManager.setAccentColor(accentColor);
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
            // FIX (auth bypass): this used to be "does ANY of these cache blobs
            // exist" — but several of them (knecta_settings_cache especially)
            // get written to localStorage on every visit regardless of login
            // state (e.g. default settings get cached for guests browsing the
            // landing page). That meant bootstrap()'s missing-session check
            // below almost never actually redirected to login: as soon as
            // *anyone* had ever loaded any page once, this returned true and
            // chat.html was reachable directly with zero authentication —
            // including via the landing page's "Open App" button, which just
            // navigates straight to chat.html and relies entirely on this
            // check to enforce login.
            //
            // The offline-access exception this function exists for is only
            // supposed to cover ONE case: a device that was genuinely logged
            // in before and is now offline (so a live token-refresh can't
            // happen). EVER_AUTHENTICATED_KEY is set exclusively by
            // persistSession() after a real successful login, and cleared by
            // clearSession() on logout / confirmed-invalid session — so it's
            // a true signal of "this device previously authenticated", unlike
            // the cache blobs, which prove nothing about auth state.
            if (localStorage.getItem(EVER_AUTHENTICATED_KEY) !== '1') return false;

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

    // FIX ("keeps popping up ... redirecting continues" on reopen): several
    // independent triggers can call this within the same boot cycle —
    // validateSessionInBackground() running from bootstrap() AND from the
    // 'online' listener, plus individual module iframes each detecting their
    // own 401 and posting SESSION_INVALIDATED up to chat.html, which also
    // routes back into a clearSession+redirect. Previously each one ran the
    // full clear+redirect independently, which — since redirectToLogin uses
    // location.replace and the page is still finishing rendering — could
    // fire more than once before the navigation actually took effect,
    // showing more than one "session expired" transition instead of a single
    // clean check-then-redirect. This flag makes the real logout a one-shot
    // per page load, regardless of how many places ask for it.
    let expiryHandled = false;

    function schedulePostRenderLogout(reason) {
        if (expiryHandled) return;
        expiryHandled = true;

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
        if (url.startsWith('/')) {
            const _b = (window.API_BASE_URL || window.BACKEND_URL || '').replace(/\/+$/, '');
            if (_b) url = _b + url;
        }
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

    // FIX (premature logout on refresh): this used to bail out instantly with
    // `if (!auth?.refreshToken) return null` — but the normalized `auth` object
    // here only carries a refreshToken if it happened to already be on the
    // `kynecta_auth` blob. auth.session.manager.js (the module actually
    // responsible for the "remember me" / 30-day session) stores/consults a
    // wider set of locations (REFRESH_TOKEN, refreshToken, kynecta_auth.refreshToken).
    // Any login path that left the refresh token in one of those other spots —
    // without it also being copied onto `auth.refreshToken` — caused this
    // function to give up with zero network attempt, which the caller
    // (validateSessionInBackground) then treated as "refresh failed" on the
    // very next backend hiccup and immediately logged the user out, no matter
    // what "Session Timeout" they'd configured in Settings.
    function findStoredRefreshToken(auth) {
        if (auth && auth.refreshToken) return auth.refreshToken;
        const tryKeys = ['REFRESH_TOKEN', 'refreshToken'];
        for (const key of tryKeys) {
            const val = localStorage.getItem(key);
            if (val) return val;
        }
        try {
            const raw = localStorage.getItem('kynecta_auth');
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && parsed.refreshToken) return parsed.refreshToken;
        } catch (_error) { /* ignore */ }
        return null;
    }

    async function refreshSession(auth) {
        const refreshToken = findStoredRefreshToken(auth);
        if (!refreshToken) {
            // No refresh token anywhere — there is genuinely no way to keep
            // this session alive, so this (unlike a network hiccup below) IS
            // a definitive failure.
            runtimeState.lastRefreshDefinitive = true;
            return null;
        }
        if (runtimeState.refreshingPromise) return runtimeState.refreshingPromise;

        runtimeState.refreshingPromise = (async function () {
            // FIX (premature logout on refresh, Render cold-start): a single
            // failed /auth/refresh call used to end the session immediately.
            // The backend is on a free-tier host that can take several seconds
            // to wake from a cold start, during which requests fail or time
            // out even though the local session is still perfectly valid per
            // the user's configured Session Timeout. Retry once after a short
            // delay before treating this as a genuine refresh failure — this
            // only ever adds latency to a real logout, it never prevents one.
            const attempt = async () => {
                try {
                    const { response, data } = await fetchJson('/api/auth/refresh', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ refreshToken })
                    });

                    if (!response.ok || !data) {
                        // Distinguish "server explicitly rejected this refresh
                        // token" (definitely expired/revoked — safe to give up)
                        // from "server errored/unreachable" (cold start, 5xx,
                        // etc — NOT evidence the session is actually invalid).
                        return { ok: false, definitive: response.status === 401 || response.status === 403 };
                    }

                    return { ok: true, data };
                } catch (_error) {
                    return { ok: false, definitive: false };
                }
            };

            try {
                let result = await attempt();
                if (!result.ok && !result.definitive) {
                    await new Promise((resolve) => setTimeout(resolve, 2500));
                    result = await attempt();
                }

                if (!result.ok) {
                    runtimeState.lastRefreshDefinitive = result.definitive;
                    return null;
                }
                runtimeState.lastRefreshDefinitive = true;

                const refreshed = persistSession({
                    token: result.data.token || result.data.accessToken,
                    refreshToken: result.data.refreshToken || refreshToken,
                    user: auth.user || result.data.user || null,
                    expiresAt: result.data.expiresAt || null
                }, { eventName: SESSION_EVENTS.refreshed });

                return refreshed;
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

                    // FIX (premature logout on refresh): only actually clear the
                    // session + redirect once refreshSession() has confirmed the
                    // session is genuinely unrecoverable (no refresh token at
                    // all, or the backend explicitly rejected the refresh token
                    // with 401/403). A failed refresh caused by a backend hiccup
                    // (cold start, 5xx, network blip) is NOT evidence the
                    // session actually expired — treating it as such was
                    // silently overriding the user's configured Session Timeout
                    // on ordinary page refreshes.
                    if (runtimeState.lastRefreshDefinitive) {
                        schedulePostRenderLogout('session-expired');
                    }
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
        });
        // FIX-ROOT-CAUSE-DUPLICATE-SOCKET_CONNECTED (double heartbeat / double
        // presence:active / double join_user_room / double sync:missed_events
        // & sync:missed_messages emits on every single connect, confirmed via
        // browser network capture — every event in the post-connect init
        // sequence fired exactly twice, ~1ms apart):
        //
        // This .then() used to ALSO emit 'SOCKET_CONNECTED' here, on top of the
        // 'SOCKET_CONNECTED' that app.realtime.socket.js's own
        // _onSocketIOConnect() already emits internally on every real (re)connect
        // (see FIX-CALL-RECOVERY comment there). Every subsystem listening for
        // 'SOCKET_CONNECTED' — ReconnectOrchestrator (session restore + missed-
        // event/missed-message resync), GroupOrchestrator (room rejoin),
        // PresenceEngineFoundation, OfflineMessageQueue, WebRTCSessionOrchestrator,
        // AdaptiveBitrateEngine, etc. — therefore ran its entire connect-handling
        // logic TWICE per connection: two full session restores, two
        // sync:missed_events/sync:missed_messages round-trips, two heartbeats,
        // two presence announcements, extra redundant join_user_room emits.
        // Concretely, this is the "notification fires but the message never
        // renders in the panel" bug: two overlapping sync/restore passes racing
        // against each other made it easy for one pass's state to clobber or
        // pre-empt the other's before the UI update landed.
        //
        // app.realtime.socket.js is the single source of truth for real connect
        // cycles (it's the module that actually owns the socket and emits this
        // exact event on every fresh connect AND every rebuild-after-reconnect —
        // see ReconnectOrchestrator.js's own comment on this). This module has no
        // more information than that event already provides, so it must not
        // re-emit it — just observe.
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
