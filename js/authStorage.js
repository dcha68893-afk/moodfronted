// authStorage.js - Persistent Authentication Storage
// VERSION: 1.0.0 - WhatsApp-style persistent auth layer
// PURPOSE: Single source of truth for auth persistence in localStorage
// USED BY: app.core.session.js, api.auth.js, app.core.bootstrap.js

(function () {
    'use strict';

    const AUTH_STORAGE_KEY = 'kynecta_auth';

    /**
     * Save full auth object to localStorage.
     * Stored fields: token, refreshToken, user, expiresAt, issuedAt
     */
    function saveAuth(data) {
        try {
            if (!data || !data.token) {
                console.warn('[AuthStorage] saveAuth() called with missing token');
                return false;
            }
            const payload = {
                token:        data.token,
                refreshToken: data.refreshToken || null,
                user:         data.user         || null,
                expiresAt:    data.expiresAt     || (Date.now() + 24 * 60 * 60 * 1000),
                issuedAt:     data.issuedAt      || Date.now(),
                savedAt:      new Date().toISOString()
            };
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
            console.log('[AuthStorage] ✅ Auth saved to localStorage');
            return true;
        } catch (error) {
            console.error('[AuthStorage] ❌ saveAuth failed:', error.message);
            return false;
        }
    }

    /**
     * Retrieve auth object from localStorage.
     * Returns null if not found, expired, or invalid.
     */
    function getAuth() {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            if (!raw) return null;

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (!parsed.token) return null;

            // Soft expiry check — still return if token exists; let Session module decide
            return parsed;
        } catch (error) {
            console.warn('[AuthStorage] getAuth() parse error:', error.message);
            return null;
        }
    }

    /**
     * Clear all auth data from localStorage.
     * Called on explicit logout only.
     */
    function clearAuth() {
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            console.log('[AuthStorage] ✅ Auth cleared from localStorage');
            return true;
        } catch (error) {
            console.error('[AuthStorage] ❌ clearAuth failed:', error.message);
            return false;
        }
    }

    /**
     * Check whether a valid (non-expired) token exists in storage.
     */
    function hasValidAuth() {
        const auth = getAuth();
        if (!auth || !auth.token) return false;
        if (auth.expiresAt && Date.now() > auth.expiresAt) return false;
        return true;
    }

    /**
     * Update just the token fields (used after refresh).
     */
    function updateAuthTokens({ token, refreshToken, expiresAt }) {
        try {
            const existing = getAuth() || {};
            return saveAuth({
                ...existing,
                token:        token        || existing.token,
                refreshToken: refreshToken || existing.refreshToken,
                expiresAt:    expiresAt    || existing.expiresAt,
                issuedAt:     Date.now()
            });
        } catch (error) {
            console.error('[AuthStorage] ❌ updateAuthTokens failed:', error.message);
            return false;
        }
    }

    // ── Public API ──────────────────────────────────────────────────────────────

    const AuthStorage = { saveAuth, getAuth, clearAuth, hasValidAuth, updateAuthTokens };

    // Expose globally
    window.AuthStorage = AuthStorage;

    // Also attach to window.api.storage for module consumers
    if (!window.api) window.api = {};
    window.api.storage = AuthStorage;

    console.log('[AuthStorage] ✅ Module loaded');

})();