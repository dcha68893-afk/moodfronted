// authStorage.js - Persistent Authentication Storage
// VERSION: 1.1.0 - WhatsApp-style persistent auth layer
// PURPOSE: Single source of truth for auth persistence in localStorage

(function () {
    'use strict';

    const AUTH_STORAGE_KEY = 'kynecta_auth';
    const LOGIN_STATE_KEY = 'isLoggedIn';
    const LEGACY_TOKEN_KEYS = ['authToken', 'accessToken', 'token', 'moodchat_token', 'USER_TOKEN', 'kynecta_token', 'auth_token', 'kyn_token', 'kyn_access_token'];
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

    // ------------------------------------------------------------------
    // ACCOUNT-SWITCH ISOLATION
    // A device is allowed to hold accounts for different people over
    // time (Google sign-in or manual login), but data from account A
    // must never leak into account B's UI. The old "clear on logout"
    // paths only cleared a handful of keys and never ran at all when
    // someone signed straight into a *different* account without
    // explicitly logging out first (exactly what Google's "choose an
    // account" picker lets people do). We detect that switch here, at
    // the single choke point every login path (password login, Google
    // login) funnels through, and wipe everything belonging to the
    // previous account before the new token/user is written.
    // ------------------------------------------------------------------
    const KNOWN_INDEXEDDB_NAMES = [
        'KnectaToolsDB', 'kynectaMesh', 'AppDB', 'calls-db', 'KnectaStatusDB',
        'kyn_offline_queue', 'moodchat_repair_v1', 'kyn_stories_v1', 'moodchat_dq_v1'
    ];
    // Device-level (not account) keys that are safe to keep across switches.
    const WIPE_ALLOWLIST = ['moodchat_theme', 'moodchat_nav_state'];

    function getStoredUserId() {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            const parsed = raw ? safeParse(raw) : null;
            const user = parsed && parsed.user;
            if (user) return user.id || user.uid || user._id || null;
        } catch (_) { /* ignore */ }
        return null;
    }

    function wipeIndexedDBData() {
        try {
            if (typeof indexedDB === 'undefined') return;
            if (typeof indexedDB.databases === 'function') {
                indexedDB.databases().then((dbs) => {
                    (dbs || []).forEach((db) => {
                        if (db && db.name) {
                            try { indexedDB.deleteDatabase(db.name); } catch (_) { /* ignore */ }
                        }
                    });
                }).catch(() => {
                    KNOWN_INDEXEDDB_NAMES.forEach((name) => {
                        try { indexedDB.deleteDatabase(name); } catch (_) { /* ignore */ }
                    });
                });
            } else {
                KNOWN_INDEXEDDB_NAMES.forEach((name) => {
                    try { indexedDB.deleteDatabase(name); } catch (_) { /* ignore */ }
                });
            }
        } catch (_) { /* ignore */ }
    }

    function wipePreviousAccountData() {
        try {
            withAuthMutation(() => {
                Object.keys(localStorage).forEach((key) => {
                    if (WIPE_ALLOWLIST.indexOf(key) === -1) {
                        try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
                    }
                });
            });
        } catch (_) { /* ignore */ }
        try { sessionStorage.clear(); } catch (_) { /* ignore */ }
        wipeIndexedDBData();
        console.warn('[AuthStorage] Detected sign-in from a different account on this device — cleared previous account local data.');
    }

    function saveAuth(data) {
        try {
            if (!data || !data.token) {
                console.warn('[AuthStorage] saveAuth() called with missing token');
                return false;
            }

            const incomingUserId = data.user ? (data.user.id || data.user.uid || data.user._id || null) : null;
            const previousUserId = getStoredUserId();
            if (incomingUserId && previousUserId && String(previousUserId) !== String(incomingUserId)) {
                wipePreviousAccountData();
            }

            const payload = {
                token: data.token,
                refreshToken: data.refreshToken || null,
                user: data.user || null,
                expiresAt: data.expiresAt || (Date.now() + 24 * 60 * 60 * 1000),
                issuedAt: data.issuedAt || Date.now(),
                savedAt: new Date().toISOString(),
                _version: '1.2.0'
            };

            // CRITICAL: Non-blocking storage write with timeout protection
            const writeStartTime = Date.now();
            
            withAuthMutation(() => {
                try {
                    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
                    
                    // Set legacy keys for compatibility (non-blocking)
                    LEGACY_TOKEN_KEYS.forEach((key) => {
                        try {
                            localStorage.setItem(key, payload.token);
                        } catch (e) {
                            console.warn(`[AuthStorage] Failed to set legacy token key ${key}:`, e.message);
                        }
                    });
                    
                    LEGACY_USER_KEYS.forEach((key) => {
                        try {
                            localStorage.setItem(key, JSON.stringify(payload.user || null));
                        } catch (e) {
                            console.warn(`[AuthStorage] Failed to set legacy user key ${key}:`, e.message);
                        }
                    });
                    
                    localStorage.setItem(LOGIN_STATE_KEY, 'true');
                    
                    const writeDuration = Date.now() - writeStartTime;
                    if (writeDuration > 50) {
                        console.warn(`[AuthStorage] Slow storage write detected: ${writeDuration}ms`);
                    }
                    
                    console.log('[AuthStorage] ✅ Auth data saved successfully');
                } catch (storageError) {
                    console.error('[AuthStorage] Storage write error:', storageError.message);
                    throw storageError;
                }
            });

            return true;
        } catch (error) {
            console.error('[AuthStorage] saveAuth failed:', error.message);
            return false;
        }
    }

    function getAuth() {
        try {
            // CRITICAL: Instant read with performance tracking
            const readStartTime = Date.now();
            
            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            if (raw) {
                const parsed = safeParse(raw);
                // CRITICAL: Validate structure only, never throw
                if (parsed && typeof parsed === 'object' && parsed.token) {
                    const readDuration = Date.now() - readStartTime;
                    if (readDuration > 10) {
                        console.warn(`[AuthStorage] Slow auth read detected: ${readDuration}ms`);
                    }
                    
                    // Set global state immediately for UI rendering
                    if (!window.currentUser && parsed.user) {
                        window.currentUser = parsed.user;
                    }
                    
                    return parsed;
                }
            }

            // Fallback to legacy keys (non-blocking)
            const fallbackToken = LEGACY_TOKEN_KEYS.map((key) => {
                try {
                    return localStorage.getItem(key);
                } catch (e) {
                    console.warn(`[AuthStorage] Failed to read legacy token key ${key}:`, e.message);
                    return null;
                }
            }).find(Boolean);
            
            if (!fallbackToken) return null;

            const fallbackUserRaw = LEGACY_USER_KEYS.map((key) => {
                try {
                    return localStorage.getItem(key);
                } catch (e) {
                    console.warn(`[AuthStorage] Failed to read legacy user key ${key}:`, e.message);
                    return null;
                }
            }).find(Boolean);
            
            const fallbackAuth = {
                token: fallbackToken,
                refreshToken: null,
                user: safeParse(fallbackUserRaw),
                expiresAt: null,
                issuedAt: null,
                _fallback: true // Mark as fallback for debugging
            };
            
            // Set global state immediately for UI rendering
            if (!window.currentUser && fallbackAuth.user) {
                window.currentUser = fallbackAuth.user;
            }
            
            const readDuration = Date.now() - readStartTime;
            if (readDuration > 20) {
                console.warn(`[AuthStorage] Slow fallback auth read: ${readDuration}ms`);
            }
            
            return fallbackAuth;
        } catch (error) {
            // CRITICAL: NEVER throw, always return null on any error
            console.warn('[AuthStorage] getAuth() handled error safely:', error.message);
            return null;
        }
    }
    
    // CRITICAL: Add saveSession method that matches expected interface
    function saveSession(data) {
        return saveAuth(data);
    }
    
    // CRITICAL: Add getSession alias that never throws
    function getSession() {
        try {
            const auth = getAuth();
            if (!auth) {
                return null;
            }
            
            // Return session structure with required fields
            return {
                token: auth.token,
                refreshToken: auth.refreshToken,
                user: auth.user,
                userId: auth.user?.id || auth.user?.uid || null,
                expiresAt: auth.expiresAt,
                issuedAt: auth.issuedAt,
                authenticated: !!auth.token
            };
        } catch (error) {
            // CRITICAL: NEVER throw, always return null
            console.warn('[AuthStorage] getSession() handled corruption safely:', error.message);
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

    const AuthStorage = { saveAuth, saveSession, getAuth, getSession, clearAuth, hasValidAuth, updateAuthTokens, getToken, getUser };

    window.AuthStorage = AuthStorage;
    window.api = window.api || {};
    window.api.storage = AuthStorage;
})();