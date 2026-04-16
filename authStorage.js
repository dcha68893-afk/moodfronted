// authStorage.js - Persistent Authentication Storage
// VERSION: 1.1.0 - WhatsApp-style persistent auth layer
// PURPOSE: Single source of truth for auth persistence in localStorage

(function () {
    'use strict';

    const AUTH_STORAGE_KEY = 'kynecta_auth';
    const LOGIN_STATE_KEY = 'isLoggedIn';
    const LEGACY_TOKEN_KEYS = ['authToken', 'accessToken', 'token', 'moodchat_token', 'USER_TOKEN', 'kynecta_token'];
    const LEGACY_USER_KEYS = ['currentUser', 'user', 'moodchat_user'];

    function withAuthMutation(fn) {
        const previous = window.__allowAuthStorageMutation__;
        window.__allowAuthStorageMutation__ = true;
        try {
            return fn();
        } finally {
            window.__allowAuthStorageMutation__ = previous === true;
        }
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
                expiresAt: data.expiresAt || (Date.now() + 24 * 60 * 60 * 1000),
                issuedAt: data.issuedAt || Date.now(),
                savedAt: new Date().toISOString()
            };

            withAuthMutation(() => {
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
                LEGACY_TOKEN_KEYS.forEach((key) => localStorage.setItem(key, payload.token));
                LEGACY_USER_KEYS.forEach((key) => localStorage.setItem(key, JSON.stringify(payload.user || null)));
                localStorage.setItem(LOGIN_STATE_KEY, 'true');
            });

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
            return true;
        } catch (error) {
            console.error('[AuthStorage] clearAuth failed:', error.message);
            return false;
        }
    }

    function hasValidAuth() {
        const auth = getAuth();
        if (!auth || !auth.token) return false;
        if (auth.expiresAt && Date.now() > auth.expiresAt) return false;
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

    const AuthStorage = { saveAuth, getAuth, clearAuth, hasValidAuth, updateAuthTokens, getToken, getUser };

    window.AuthStorage = AuthStorage;
    window.api = window.api || {};
    window.api.storage = AuthStorage;
})();
