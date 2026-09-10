// authStorage.js - Persistent Authentication Storage
// VERSION: 1.2.0 - account-isolated two-account switching
(function () {
    'use strict';

    const AUTH_STORAGE_KEY = 'kynecta_auth';
    const LOGIN_STATE_KEY = 'isLoggedIn';
    const LEGACY_TOKEN_KEYS = ['authToken','accessToken','token','nexopa_token','USER_TOKEN','kynecta_token','auth_token','kyn_token','kyn_access_token'];
    const LEGACY_USER_KEYS = ['currentUser','user','nexopa_user'];
    const ACCOUNT_LIST_KEY = 'kynecta_saved_accounts';

    function safeParse(raw, fallback = null) { try { return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
    function withAuthMutation(fn) {
        const previous = window.__allowAuthStorageMutation__;
        window.__allowAuthStorageMutation__ = true;
        try { return fn(); } finally { window.__allowAuthStorageMutation__ = previous === true; }
    }
    function getStoredUserId() {
        const auth = safeParse(localStorage.getItem(AUTH_STORAGE_KEY));
        return auth?.user?.id ?? auth?.user?.userId ?? auth?.user?.uid ?? auth?.user?._id ?? null;
    }

    // IMPORTANT: message history is account-scoped inside
    // nexopa_message_lifecycle_v1. Never delete that database during an
    // account switch. The previous implementation deleted every IndexedDB
    // database, including the message DB, which made switching from account
    // A to B destroy A's cached history and made switching back look empty.
    const NEVER_WIPE_INDEXEDDB = new Set(['nexopa_message_lifecycle_v1']);
    const WIPE_ALLOWLIST = new Set(['nexopa_theme','nexopa_nav_state',ACCOUNT_LIST_KEY]);

    function deleteOneDB(name) {
        return new Promise(resolve => {
            if (NEVER_WIPE_INDEXEDDB.has(name)) return resolve(true);
            try {
                const req = indexedDB.deleteDatabase(name);
                let settled = false;
                const finish = ok => { if (!settled) { settled = true; resolve(ok); } };
                req.onsuccess = () => finish(true);
                req.onerror = () => finish(false);
                req.onblocked = () => setTimeout(() => finish(false), 1500);
            } catch (_) { resolve(false); }
        });
    }

    function wipeIndexedDBData() {
        try {
            if (typeof indexedDB === 'undefined') return;
            const deleteAll = names => Promise.all(names.filter(n => !NEVER_WIPE_INDEXEDDB.has(n)).map(deleteOneDB));
            if (typeof indexedDB.databases === 'function') {
                indexedDB.databases().then(dbs => {
                    const names = Array.from(new Set([...(dbs || []).map(d => d?.name).filter(Boolean)]));
                    deleteAll(names);
                }).catch(() => {});
            }
        } catch (_) {}
    }

    function wipePreviousAccountData() {
        // This remains available for genuine full-account cleanup, but the
        // message DB is explicitly excluded because its records are keyed by
        // accountId and are therefore safe to retain for quick switching.
        try {
            withAuthMutation(() => Object.keys(localStorage).forEach(key => {
                if (!WIPE_ALLOWLIST.has(key)) { try { localStorage.removeItem(key); } catch (_) {} }
            }));
            sessionStorage.clear();
        } catch (_) {}
        try { window.dispatchEvent(new CustomEvent('kyn:accountSwitchWipe')); } catch (_) {}
        wipeIndexedDBData();
    }

    function saveAuth(data) {
        try {
            if (!data?.token) return false;
            const incomingUserId = data.user?.id ?? data.user?.uid ?? data.user?._id ?? null;
            const previousUserId = getStoredUserId();
            // A normal login into a different account still needs stale
            // account-agnostic caches cleared, but MUST NOT destroy the
            // account-isolated message DB.
            if (incomingUserId && previousUserId && String(previousUserId) !== String(incomingUserId)) wipePreviousAccountData();
            const payload = {
                token: data.token,
                refreshToken: data.refreshToken || null,
                user: data.user || null,
                expiresAt: data.expiresAt || (Date.now() + 30 * 24 * 60 * 60 * 1000),
                issuedAt: data.issuedAt || Date.now(),
                savedAt: new Date().toISOString(),
                _version: '1.2.0'
            };
            withAuthMutation(() => {
                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
                LEGACY_TOKEN_KEYS.forEach(k => { try { localStorage.setItem(k, payload.token); } catch (_) {} });
                LEGACY_USER_KEYS.forEach(k => { try { localStorage.setItem(k, JSON.stringify(payload.user)); } catch (_) {} });
                localStorage.setItem(LOGIN_STATE_KEY, 'true');
            });
            return true;
        } catch (e) { console.error('[AuthStorage] saveAuth failed:', e.message); return false; }
    }

    function getAuth() {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            if (raw) {
                const parsed = safeParse(raw);
                if (parsed?.token) { if (!window.currentUser && parsed.user) window.currentUser = parsed.user; return parsed; }
            }
            const token = LEGACY_TOKEN_KEYS.map(k => { try { return localStorage.getItem(k); } catch (_) { return null; } }).find(Boolean);
            if (!token) return null;
            const user = safeParse(LEGACY_USER_KEYS.map(k => { try { return localStorage.getItem(k); } catch (_) { return null; } }).find(Boolean));
            return { token, refreshToken: null, user, expiresAt: null, issuedAt: null, _fallback: true };
        } catch (_) { return null; }
    }
    function saveSession(data) { return saveAuth(data); }
    function getSession() {
        const a = getAuth();
        return a ? { token:a.token, refreshToken:a.refreshToken, user:a.user, userId:a.user?.id ?? a.user?.uid ?? null, expiresAt:a.expiresAt, issuedAt:a.issuedAt, authenticated:!!a.token } : null;
    }
    function clearAuth() {
        try {
            withAuthMutation(() => {
                localStorage.removeItem(AUTH_STORAGE_KEY);
                LEGACY_TOKEN_KEYS.forEach(k => localStorage.removeItem(k));
                LEGACY_USER_KEYS.forEach(k => localStorage.removeItem(k));
                localStorage.removeItem(LOGIN_STATE_KEY);
            });
            // Keep retained account/message data for quick switching. The
            // explicit account removal path is responsible for removing the
            // account from the saved-account list.
            return true;
        } catch (e) { return false; }
    }
    function hasValidAuth() {
        const a = getAuth();
        return !!(a?.token && (!a.expiresAt || Date.now() <= a.expiresAt));
    }
    function updateAuthTokens({token, refreshToken, expiresAt}) {
        const a = getAuth() || {};
        return saveAuth({ ...a, token: token || a.token, refreshToken: refreshToken || a.refreshToken, expiresAt: expiresAt || a.expiresAt, issuedAt: Date.now() });
    }
    function getToken() { return getAuth()?.token || null; }
    function getUser() { return getAuth()?.user || null; }
    function isValidSession(s) { return !!(s && typeof s === 'object' && typeof s.token === 'string' && s.token.length >= 10 && s.user && typeof s.user === 'object'); }

    window.AuthStorage = { saveAuth, saveSession, getAuth, getSession, clearAuth, hasValidAuth, updateAuthTokens, getToken, getUser, isValidSession, wipeAccountData: wipePreviousAccountData };
    window.api = window.api || {};
    window.api.storage = window.AuthStorage;
})();