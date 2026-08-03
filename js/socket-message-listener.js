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

    // FIX-005: Permanently disable fallback socket.
    // The fallback was opening a 2nd Socket.IO connection causing every event to arrive TWICE.
    // Primary KynectaRealtime in app.realtime.socket.js is the sole connection.
    window.__KYNECTA_NO_FALLBACK_SOCKET = true;

    const FALLBACK_WAIT_MS    = 4000;   // wait this long for KynectaRealtime before fallback
    const FALLBACK_RETRY_MAX  = 8;
    const BACKEND_URL = (function () {
        if (window.__kynAPI && window.__kynAPI.baseUrl)
            return window.__kynAPI.baseUrl.replace('/api', '');
        if (window.API_BASE_URL)
            return window.API_BASE_URL.replace('/api', '');
        return 'https://noxopa.onrender.com';
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
        // FIX-005: Fallback permanently disabled. window.__KYNECTA_NO_FALLBACK_SOCKET = true.
        // Duplicate socket was root cause of duplicate messages and duplicate call events.
        return;
        // DEAD CODE BELOW — kept for reference only, never executes
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

            const MESSAGE_EVENTS = ['message:new', 'new_message', 'chat:message', 'MESSAGE_RECEIVED', 'message:deleted', 'message_deleted', 'message:seen', 'message_seen', 'message:read', 'message_read', 'message:delivered', 'message_delivered'];
            MESSAGE_EVENTS.forEach(function (evt) {
                _fallbackSocket.on(evt, _handleFallbackMessage);
            });

            // ✅ FIX: Also bridge call events through the fallback so calls work
            // even when the primary singleton never came up.
            const CALL_EVENTS = [
                'call:incoming', 'incoming_call', 'call_incoming',
                'call:initiated', 'call_initiated',
                'call:accepted', 'call_accepted', 'call_answered',
                'call:rejected', 'call_rejected',
                'call:cancelled', 'call_cancelled',
                'call:ended', 'call_ended', 'call_force_ended',
                'webrtc:signal', 'webrtc_signal',
            ];
            CALL_EVENTS.forEach(function (evt) {
                _fallbackSocket.on(evt, function (data) {
                    console.log('[SocketListener] FALLBACK 📞 call event', evt, data);
                    window.dispatchEvent(new CustomEvent('kyn:' + evt, { detail: data }));
                    document.dispatchEvent(new CustomEvent(evt, { detail: data }));
                    if (window.KynectaEventBus && typeof window.KynectaEventBus.emit === 'function') {
                        window.KynectaEventBus.emit('REALTIME_' + evt, data, { async: true });
                    }
                });
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
        // ✅ FIX: Required log per spec
        console.log('[SocketListener] RECEIVED MESSAGE:', data);

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

        // ✅ FIX: updateMessageUI shim — delegates to whatever UI layer is available
        updateMessageUI(data);

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

    /**
     * updateMessageUI — thin shim that routes an incoming message payload to
     * whichever UI layer is present.  Called from _handleFallbackMessage and
     * can be called directly by other scripts via window.updateMessageUI.
     */
    function updateMessageUI(msg) {
        if (!msg) return;
        try {
            // 1. ChatManager (primary UI controller)
            const cm = window.ChatManager || window.chatManager;
            if (cm) {
                if (typeof cm.appendMessage  === 'function') { cm.appendMessage(msg);  return; }
                if (typeof cm.addMessage     === 'function') { cm.addMessage(msg);      return; }
                if (typeof cm.renderMessage  === 'function') { cm.renderMessage(msg);   return; }
                if (typeof cm.onNewMessage   === 'function') { cm.onNewMessage(msg);    return; }
            }
            // 2. Standalone render helper
            if (typeof window.renderNewMessage === 'function') { window.renderNewMessage(msg); return; }
            if (typeof window.appendChatMessage === 'function') { window.appendChatMessage(msg); return; }
        } catch (e) {
            console.warn('[SocketListener] updateMessageUI error:', e.message);
        }
    }
    // Expose globally so other modules can call it
    window.updateMessageUI = updateMessageUI;

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
