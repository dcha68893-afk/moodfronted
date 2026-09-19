/* Shared token-refresh helper for the small standalone iframe modules
 * (Friends, Groups) that talk to the backend with their own tiny fetch
 * wrappers instead of the full api.core.js/api.request.js gateway used by
 * chat.html/message.html.
 *
 * ROOT-CAUSE (FRIENDS/GROUPS-"TOKEN-EXPIRED"-AFTER-IDLE): those wrappers
 * never attempted a token refresh on a 401 — they just threw the backend's
 * raw error straight into the UI. api.core.js (chat.html) and
 * api.request.js (message.html) both already refresh silently on 401 via
 * POST /api/auth/refresh, which is exactly why those modules never show
 * this after a few idle hours while Friends/Groups did. Friend/group
 * iframes don't load either of those (different, isolated iframe
 * `window`), so this is a small, self-contained equivalent using the same
 * plain localStorage keys those modules already read (`authToken` /
 * `accessToken` / `token`, and `refreshToken` — the same plain copy
 * app.runtime.authority.js already keeps alongside api.core.js's own
 * encrypted SecureStorage copy, so no new storage scheme is introduced).
 */
(function (global) {
    'use strict';
    if (global.NecpaSessionResilience) return;

    function readRefreshToken() {
        try {
            const auth = JSON.parse(localStorage.getItem('kynecta_auth') || '{}');
            if (auth && auth.refreshToken) return auth.refreshToken;
        } catch (_) {}
        return localStorage.getItem('refreshToken') || localStorage.getItem('REFRESH_TOKEN') || null;
    }

    function writeNewToken(newToken) {
        // Keep every key these modules read in sync, but only ones already
        // present — don't invent new storage keys other modules never check.
        ['authToken', 'accessToken', 'token'].forEach(function (key) {
            if (localStorage.getItem(key) !== null) localStorage.setItem(key, newToken);
        });
        // authToken is the key every one of these modules checks first.
        localStorage.setItem('authToken', newToken);
    }

    function writeNewRefreshToken(newRefreshToken) {
        if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);
    }

    let inFlight = null;

    // Resolves true if the access token was refreshed and the caller's
    // failed request is worth retrying once; false if there's no refresh
    // token or the refresh itself failed (session is genuinely gone).
    function refreshAccessToken(base) {
        if (inFlight) return inFlight;
        const refreshToken = readRefreshToken();
        if (!refreshToken) return Promise.resolve(false);

        inFlight = (async () => {
            try {
                const resp = await fetch(base + '/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: refreshToken }),
                });
                if (!resp.ok) return false;
                const data = await resp.json().catch(() => ({}));
                const newToken = data.token || data.accessToken;
                if (!newToken) return false;
                writeNewToken(newToken);
                if (data.refreshToken) writeNewRefreshToken(data.refreshToken);
                return true;
            } catch (_) {
                return false;
            } finally {
                inFlight = null;
            }
        })();
        return inFlight;
    }

    global.NecpaSessionResilience = { refreshAccessToken: refreshAccessToken };
})(window);
