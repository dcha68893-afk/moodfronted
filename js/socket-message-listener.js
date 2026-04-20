/**
 * socket-message-listener.js  — HARDENED v2.0.0  (SHIM ONLY)
 *
 * ⚠️  IMPORTANT: In the hardened architecture this file no longer opens its own
 * Socket.IO connection.  That was the root cause of the duplicate-connection /
 * "realtime connect failed: Connection timeout" problem.
 *
 * app.realtime.socket.js (hardened) now:
 *   • Owns the single Socket.IO connection.
 *   • Registers message:new / new_message / chat:message / MESSAGE_RECEIVED
 *     listeners internally after authentication.
 *   • Routes them to MessagesCore + DOM events.
 *
 * This file now ONLY:
 *   1. Waits for KynectaRealtime to be ready.
 *   2. If (and only if) it is not ready within a generous timeout — meaning
 *      app.realtime.socket.js failed to load — it creates a minimal fallback
 *      connection so the iframe is never completely dark.
 *   3. Bridges SESSION_DATA from parent frames to the singleton.
 *
 * To fully disable the fallback (recommended once app.realtime.socket.js is
 * confirmed stable), set window.__KYNECTA_NO_FALLBACK_SOCKET = true before
 * loading this script.
 *
 * REMOVAL OPTION: If app.realtime.socket.js is always loaded before message.html
 * scripts, you can remove this file entirely.  The message bridge is embedded in
 * the hardened realtime manager.
 */
(function () {
    'use strict';

    const FALLBACK_WAIT_MS    = 4000;   // wait this long for KynectaRealtime before fallback
    const FALLBACK_RETRY_MAX  = 8;
    const BACKEND_URL = (function () {
        if (window.__kynAPI && window.__kynAPI.baseUrl)
            return window.__kynAPI.baseUrl.replace('/api', '');
        if (window.API_BASE_URL)
            return window.API_BASE_URL.replace('/api', '');
        return 'https://moodchat-fy56.onrender.com';
    })();

    // ── Bridge SESSION_DATA / AUTH_READY from parent to the singleton ────────
    window.addEventListener('message', function (evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        const { type, payload } = evt.data;
        if ((type === 'SESSION_DATA' || type === 'AUTH_READY') && payload) {
            const token = payload.token || (payload.session && payload.session.token);
            if (token) {
                window.__kynToken = token;
                // Hand off to the singleton if it exists
                const rt = window.KynectaRealtime;
                if (rt) {
                    rt._sessionToken = token;
                    if (!rt.isConnected()) {
                        rt.handleReconnect({ token, reason: 'session-data-bridge' });
                    }
                }
            }
        }
    });

    // ── Check if realtime manager is alive ───────────────────────────────────
    function isRealtimeAlive() {
        return window.KynectaRealtime && window.KynectaRealtime.__hardened;
    }

    // ── Fallback: minimal Socket.IO connection when main manager failed ───────
    let _fallbackSocket = null;
    let _fallbackRetries = 0;
    let _fallbackConnected = false;

    function startFallback() {
        if (window.__KYNECTA_NO_FALLBACK_SOCKET) return;
        if (_fallbackSocket || _fallbackConnected) return;

        if (typeof io === 'undefined') {
            if (_fallbackRetries++ < FALLBACK_RETRY_MAX) {
                setTimeout(startFallback, 1000);
            }
            return;
        }

        const token  = _getToken();
        const userId = _getCurrentUserId();
        console.warn('[SocketListener] FALLBACK: KynectaRealtime not ready. Opening secondary socket.');

        try {
            _fallbackSocket = io(BACKEND_URL, {
                transports:           ['websocket', 'polling'],
                auth:                 { token },
                query:                { token, userId },
                reconnection:         true,
                reconnectionDelay:    1000,
                reconnectionAttempts: 10,
                timeout:              20000
            });

            _fallbackSocket.on('connect', function () {
                _fallbackConnected = true;
                console.log('[SocketListener] FALLBACK connected, id:', _fallbackSocket.id);
                if (userId) {
                    _fallbackSocket.emit('join', { userId, room: `user:${userId}` });
                    _fallbackSocket.emit('join_user_room', { userId });
                }
                // If main singleton becomes available, destroy the fallback
                if (isRealtimeAlive()) {
                    _fallbackSocket.disconnect();
                    _fallbackSocket = null;
                    console.log('[SocketListener] FALLBACK closed — singleton is now available.');
                }
            });

            _fallbackSocket.on('disconnect', function () { _fallbackConnected = false; });

            const MESSAGE_EVENTS = ['message:new', 'new_message', 'chat:message', 'MESSAGE_RECEIVED'];
            MESSAGE_EVENTS.forEach(function (evt) {
                _fallbackSocket.on(evt, _handleFallbackMessage);
            });

            window.__socket    = _fallbackSocket;
            window.__kynSocket = _fallbackSocket;

        } catch (err) {
            console.error('[SocketListener] FALLBACK connect error:', err.message);
        }
    }

    function _handleFallbackMessage(data) {
        if (!data) return;
        const chatId = String(data.chatId || data.conversationId || '');
        if (!chatId) return;
        console.log('[SocketListener] FALLBACK 📨 message for chat', chatId);

        const core = window.MessagesCore || window.messagesCore;
        if (core) {
            if (typeof core._handleIncomingRealtimeMessage === 'function') {
                core._handleIncomingRealtimeMessage(data);
            } else if (typeof core.receiveMessage === 'function') {
                core.receiveMessage(data);
            } else if (typeof core.onNewMessage === 'function') {
                core.onNewMessage(data);
            } else if (core.eventBus && typeof core.eventBus.emit === 'function') {
                core.eventBus.emit('message:new', data);
            }
        }

        window.dispatchEvent(new CustomEvent('kyn:message:received', { detail: data }));
        document.dispatchEvent(new CustomEvent('message:new', { detail: data }));

        if (window.KynectaLocalStore && typeof window.KynectaLocalStore.saveMessage === 'function') {
            window.KynectaLocalStore.saveMessage({
                ...data,
                serverId:    String(data.id || ''),
                status:      'delivered',
                isLocalOnly: false
            }).catch(() => {});
        }
    }

    // ── Token / userId helpers (kept for fallback path only) ─────────────────
    function _getToken() {
        const keys = ['kynecta_token', 'auth_token', 'token', 'jwt', 'access_token', '__kyn_token'];
        for (const key of keys) {
            const t = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (t && t.length > 10) return t;
        }
        return window.__kynToken || null;
    }

    function _getCurrentUserId() {
        try {
            const cache = localStorage.getItem('kynecta_user_cache_v8');
            if (cache) {
                const u = JSON.parse(cache);
                return u.userId || u.id;
            }
        } catch (_) {}
        const core = window.MessagesCore || window.messagesCore;
        if (core) return core.currentUserId || core.userId || (core.state && core.state.userId);
        return null;
    }

    // ── Startup ───────────────────────────────────────────────────────────────
    function init() {
        if (isRealtimeAlive()) {
            console.log('[SocketListener] KynectaRealtime singleton active — shim mode only.');
            return; // Nothing to do; hardened manager owns the connection
        }

        // Wait generously for the singleton before falling back
        setTimeout(function () {
            if (!isRealtimeAlive()) {
                console.warn('[SocketListener] KynectaRealtime still not ready after', FALLBACK_WAIT_MS, 'ms — activating fallback.');
                // Ensure socket.io is loaded
                if (typeof io !== 'undefined') {
                    startFallback();
                } else {
                    const script = document.createElement('script');
                    script.src = BACKEND_URL + '/socket.io/socket.io.js';
                    script.onload = startFallback;
                    script.onerror = function () {
                        const fb = document.createElement('script');
                        fb.src    = 'https://cdn.socket.io/4.7.4/socket.io.min.js';
                        fb.onload = startFallback;
                        document.head.appendChild(fb);
                    };
                    document.head.appendChild(script);
                }
            }
        }, FALLBACK_WAIT_MS);
    }

    // Listen for the hardened realtime manager to become available later
    window.addEventListener('kyn:realtimeReady', function () {
        console.log('[SocketListener] kyn:realtimeReady received — closing any fallback socket.');
        if (_fallbackSocket) {
            try { _fallbackSocket.disconnect(); } catch (_) {}
            _fallbackSocket    = null;
            _fallbackConnected = false;
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[SocketListener] Shim initialized ✅');
})();