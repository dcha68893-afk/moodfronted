// authStorage.js - Persistent Authentication Storage
// VERSION: 1.5.0 - Silent refresh-first strategy, no redirect on token expiry + atomic old-token wipe on save
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
                // PATCH v1.4: Wipe ALL old token copies first so no stale token can
                // linger alongside the new one and cause auth header mismatches.
                LEGACY_TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
                LEGACY_USER_KEYS.forEach((key) => localStorage.removeItem(key));

                // Now write fresh values
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
                LEGACY_TOKEN_KEYS.forEach((key) => localStorage.setItem(key, payload.token));
                LEGACY_USER_KEYS.forEach((key) => localStorage.setItem(key, JSON.stringify(payload.user || null)));
                localStorage.setItem(LOGIN_STATE_KEY, 'true');
            });

            console.log('[AuthStorage] Auth saved to localStorage, token length:', payload.token.length);
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
        // PATCH v1.5: NEVER block on expiresAt here.
        // Token expiry is handled by the proactive refresh scheduler (api_auth.js) and
        // the periodic session check (auth_session_manager.js) — both attempt a silent
        // background refresh and only clear the session if the refresh itself fails.
        // Blocking here would cause flash-redirects to login on every app open when
        // the JWT has expired but the refresh token is still valid.
        return true;
    }

    // PATCH v1.5: Safe re-auth helper — called by UI when auth:session:ended fires.
    // Shows a gentle re-authentication prompt rather than a hard page redirect.
    // The UI layer should call this instead of doing window.location.href manually.
    function notifySessionEnded(reason) {
        try {
            window.dispatchEvent(new CustomEvent('auth:session:ended', {
                detail: { reason: reason || 'unknown', timestamp: Date.now() }
            }));
        } catch (_) {}
    }

    // PATCH v1.4: Returns milliseconds until the stored token expires, or 0 if already expired.
    // Returns null if no expiry information is present (non-expiring / unknown).
    function getTokenExpiresAt() {
        const auth = getAuth();
        if (!auth) return null;

        // Prefer the explicit expiresAt stored in our payload
        if (auth.expiresAt && typeof auth.expiresAt === 'number') {
            return auth.expiresAt;
        }

        // Fall back to decoding JWT exp claim directly
        try {
            const parts = (auth.token || '').split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                if (payload.exp) return payload.exp * 1000;
            }
        } catch (_) {}

        return null;
    }

    // PATCH v1.4: Returns true when the token is present but will expire within
    // `thresholdMs` milliseconds (default 5 minutes).  Used by the proactive
    // refresh scheduler to trigger a background refresh before the token actually
    // expires, so the user never notices a token change.
    function isTokenExpiringSoon(thresholdMs = 5 * 60 * 1000) {
        const auth = getAuth();
        if (!auth || !auth.token) return false;
        const expiresAt = getTokenExpiresAt();
        if (expiresAt === null) return false; // no expiry info → assume valid
        const msRemaining = expiresAt - Date.now();
        // Also return true when already expired so callers treat both cases uniformly
        return msRemaining <= thresholdMs;
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
        console.log('[AuthStorage] getToken() called, token present:', !!token);
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
        isValidSession, setSession, clearSession, getSession, getSessionSync,
        // v1.4 additions — proactive refresh support
        getTokenExpiresAt, isTokenExpiringSoon,
        // v1.5 additions — graceful re-auth without redirect
        notifySessionEnded
    };

    window.AuthStorage = AuthStorage;
    window.api = window.api || {};
    window.api.storage = AuthStorage;
})();