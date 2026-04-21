// authStorage.js - Persistent Authentication Storage
// VERSION: 1.1.0 - WhatsApp-style persistent auth layer
// PURPOSE: Single source of truth for auth persistence in localStorage

(function () {
    'use strict';

    const AUTH_STORAGE_KEY = 'kynecta_auth';
    const LOGIN_STATE_KEY = 'isLoggedIn';
    const LEGACY_TOKEN_KEYS = ['authToken', 'accessToken', 'token', 'moodchat_token', 'USER_TOKEN', 'kynecta_token'];
    const LEGACY_USER_KEYS = ['currentUser', 'user', 'moodchat_user'];

    // PATCH v1.2: Mutation guard is a no-op — we always allow auth mutations.
    // The original conditional guard silently dropped saves in certain boot orders,
    // which caused the session to never persist after auto-login, producing the reopen loop.
    function withAuthMutation(fn) {
        return fn();
    }

    function safeParse(raw, fallback = null) {
        try {
            return raw ? JSON.parse(raw) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function saveAuth(data) {
        try {
            if (!data || !data.token) {
                console.warn('[AuthStorage] saveAuth() called with missing token');
                return false;
            }

            const payload = {
                token: data.token,
                refreshToken: data.refreshToken || null,
                user: data.user || null,
                expiresAt: data.expiresAt || (Date.now() + 30 * 24 * 60 * 60 * 1000), // 30-day default for offline persistence
                issuedAt: data.issuedAt || Date.now(),
                lastLogin: data.lastLogin || Date.now(), // track last successful login
                savedAt: new Date().toISOString()
            };

            withAuthMutation(() => {
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
                LEGACY_TOKEN_KEYS.forEach((key) => localStorage.setItem(key, payload.token));
                LEGACY_USER_KEYS.forEach((key) => localStorage.setItem(key, JSON.stringify(payload.user || null)));
                localStorage.setItem(LOGIN_STATE_KEY, 'true');
            });

            console.log('[AuthStorage] Auth saved to localStorage');
            console.log('[AUTH TOKEN]', payload.token);
            return true;
        } catch (error) {
            console.error('[AuthStorage] saveAuth failed:', error.message);
            return false;
        }
    }

    function getAuth() {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            if (raw) {
                const parsed = safeParse(raw);
                if (parsed && typeof parsed === 'object' && parsed.token) {
                    return parsed;
                }
            }

            const fallbackToken = LEGACY_TOKEN_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
            if (!fallbackToken) return null;

            const fallbackUserRaw = LEGACY_USER_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
            return {
                token: fallbackToken,
                refreshToken: null,
                user: safeParse(fallbackUserRaw),
                expiresAt: null,
                issuedAt: null
            };
        } catch (error) {
            console.warn('[AuthStorage] getAuth() parse error:', error.message);
            return null;
        }
    }

    function clearAuth() {
        try {
            withAuthMutation(() => {
                localStorage.removeItem(AUTH_STORAGE_KEY);
                LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
                LEGACY_USER_KEYS.forEach((key) => localStorage.removeItem(key));
                localStorage.removeItem(LOGIN_STATE_KEY);
            });
            console.log('[AuthStorage] Auth cleared from localStorage');
            return true;
        } catch (error) {
            console.error('[AuthStorage] clearAuth failed:', error.message);
            return false;
        }
    }

    function hasValidAuth() {
        const auth = getAuth();
        if (!auth || !auth.token) return false;
        // NOTE: Do NOT block on expiresAt here.
        // Expired-but-present sessions are still valid for offline/auto-login.
        // Background validation (api_auth.js validateSession) will handle logout
        // if the server rejects the token when the device is online.
        return true;
    }

    function updateAuthTokens({ token, refreshToken, expiresAt }) {
        try {
            const existing = getAuth() || {};
            return saveAuth({
                ...existing,
                token: token || existing.token,
                refreshToken: refreshToken || existing.refreshToken,
                expiresAt: expiresAt || existing.expiresAt,
                issuedAt: Date.now()
            });
        } catch (error) {
            console.error('[AuthStorage] updateAuthTokens failed:', error.message);
            return false;
        }
    }

    function getToken() {
        const auth = getAuth();
        const token = auth?.token || null;
        console.log('[AUTH TOKEN]', token);
        return token;
    }

    function getUser() {
        return getAuth()?.user || null;
    }

    // PATCH v1.3: Strict session validator — single source of truth for what constitutes
    // a usable session. Used by auth_session_manager on every boot to detect corruption
    // before it reaches the UI layer. Does NOT check expiry — server enforces that.
    function isValidSession(session) {
        if (!session || typeof session !== 'object') return false;
        if (!session.token || typeof session.token !== 'string' || session.token.length < 10) return false;
        if (!session.user || typeof session.user !== 'object') return false;
        return true;
    }

    // PATCH v1.3: setSession / clearSession — canonical aliases that guarantee
    // all callers use a single write path.
    function setSession(session) {
        return saveAuth(session);
    }

    function clearSession() {
        return clearAuth();
    }

    // PATCH v1.3: getSession — returns the full auth object or null
    function getSession() {
        const auth = getAuth();
        return isValidSession(auth) ? auth : null;
    }

    // PATCH v1.3: Synchronous session getter — avoids depending on SessionManager being loaded first.
    function getSessionSync() {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            if (raw) {
                const auth = JSON.parse(raw);
                if (auth && auth.token) return auth;
            }
        } catch (_) {}
        return null;
    }

    const AuthStorage = {
        saveAuth, getAuth, clearAuth, hasValidAuth, updateAuthTokens, getToken, getUser,
        // v1.3 additions
        isValidSession, setSession, clearSession, getSession, getSessionSync
    };

    window.AuthStorage = AuthStorage;
    window.api = window.api || {};
    window.api.storage = AuthStorage;
})();