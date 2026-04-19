/**
 * socket-message-listener.js
 * 
 * Add this script to message.html AFTER all other scripts.
 * 
 * PURPOSE:
 *  The app uses a postMessage bridge (API_REQUEST/API_RESPONSE) to send messages
 *  via the parent iframe. But for RECEIVING messages in real-time, it needs to
 *  connect to Socket.IO directly and listen for 'message:new' events.
 * 
 *  The console shows: "realtime connect failed: Connection timeout"
 *  This is because app.realtime.socket.js tries to connect from chat.html context,
 *  but message.html (the iframe) also needs its own socket connection.
 * 
 *  This script:
 *  1. Connects socket.io from within message.html iframe
 *  2. Listens for message:new, new_message events
 *  3. Routes them to the messages-core and UI for instant rendering
 *  4. Handles reconnect gracefully
 */
(function () {
    'use strict';

    // ── Config — read from the same env the rest of the app uses ─────────────
    const BACKEND_URL = (function () {
        // Try to get from API core
        if (window.__kynAPI && window.__kynAPI.baseUrl) return window.__kynAPI.baseUrl.replace('/api', '');
        if (window.API_BASE_URL) return window.API_BASE_URL.replace('/api', '');
        // Known production URL from the logs
        return 'https://moodchat-fy56.onrender.com';
    })();

    let socket = null;
    let connected = false;
    let retryCount = 0;
    const MAX_RETRIES = 10;

    // ── Get auth token ────────────────────────────────────────────────────────
    function getToken() {
        // Try known storage keys
        const keys = ['kynecta_token', 'auth_token', 'token', 'jwt', 'access_token', '__kyn_token'];
        for (const key of keys) {
            const t = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (t && t.length > 10) return t;
        }
        // Try the parent's token bridge
        if (window.__kynToken) return window.__kynToken;
        return null;
    }

    function getCurrentUserId() {
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

    // ── Connect socket.io ─────────────────────────────────────────────────────
    function connect() {
        if (connected || socket) return;

        // Socket.IO must be loaded
        if (typeof io === 'undefined') {
            console.warn('[SocketListener] socket.io not loaded, retrying...');
            if (retryCount++ < MAX_RETRIES) setTimeout(connect, 1000);
            return;
        }

        const token = getToken();
        const userId = getCurrentUserId();

        console.log('[SocketListener] Connecting to', BACKEND_URL, 'userId:', userId);

        try {
            socket = io(BACKEND_URL, {
                transports: ['websocket', 'polling'],
                auth: { token },
                query: { token, userId },
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 10,
                timeout: 20000,
            });

            socket.on('connect', function () {
                connected = true;
                retryCount = 0;
                console.log('[SocketListener] ✅ Connected, socketId:', socket.id);

                // Join user room
                if (userId) {
                    socket.emit('join', { userId, room: `user:${userId}` });
                    socket.emit('join_user_room', { userId });
                }
            });

            socket.on('disconnect', function (reason) {
                connected = false;
                console.warn('[SocketListener] Disconnected:', reason);
            });

            socket.on('connect_error', function (err) {
                connected = false;
                console.warn('[SocketListener] Connect error:', err.message);
            });

            // ── Message events ─────────────────────────────────────────────
            socket.on('message:new', handleNewMessage);
            socket.on('new_message', handleNewMessage);
            socket.on('chat:message', handleNewMessage);
            socket.on('MESSAGE_RECEIVED', handleNewMessage);

            // Expose socket globally so other parts of the app can use it
            window.__socket = socket;
            window.__kynSocket = socket;

        } catch (err) {
            console.error('[SocketListener] Failed to create socket:', err.message);
        }
    }

    // ── Handle incoming message ───────────────────────────────────────────────
    function handleNewMessage(data) {
        if (!data) return;
        const chatId = String(data.chatId || data.conversationId || '');
        if (!chatId) return;

        console.log('[SocketListener] 📨 message:new received for chat', chatId);

        // 1. Tell messages-core
        const core = window.MessagesCore || window.messagesCore;
        if (core) {
            if (typeof core._handleIncomingRealtimeMessage === 'function') {
                core._handleIncomingRealtimeMessage(data);
            } else if (typeof core.receiveMessage === 'function') {
                core.receiveMessage(data);
            } else if (typeof core.onNewMessage === 'function') {
                core.onNewMessage(data);
            } else {
                // Try dispatching on the core's event bus
                if (core.eventBus && typeof core.eventBus.emit === 'function') {
                    core.eventBus.emit('message:new', data);
                }
            }
        }

        // 2. Fire DOM events for the UI patch to catch
        window.dispatchEvent(new CustomEvent('kyn:message:received', { detail: data }));
        document.dispatchEvent(new CustomEvent('message:new', { detail: data }));

        // 3. Update local store
        if (window.KynectaLocalStore && typeof window.KynectaLocalStore.saveMessage === 'function') {
            window.KynectaLocalStore.saveMessage({
                ...data,
                serverId: String(data.id || ''),
                status: 'delivered',
                isLocalOnly: false,
            }).catch(() => {});
        }
    }

    // ── Also listen for session via postMessage from parent ───────────────────
    // When the parent sends SESSION_DATA, we can grab the token from it
    window.addEventListener('message', function (evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        const { type, payload } = evt.data;

        if ((type === 'SESSION_DATA' || type === 'AUTH_READY') && payload) {
            const token = payload.token || (payload.session && payload.session.token);
            if (token) {
                window.__kynToken = token;
                // If socket not yet connected, try now
                if (!connected) {
                    setTimeout(connect, 200);
                }
            }
        }
    });

    // ── Start ─────────────────────────────────────────────────────────────────
    // Wait for socket.io script to load
    function waitAndConnect() {
        if (typeof io !== 'undefined') {
            connect();
        } else {
            // Dynamically load socket.io from the backend if not present
            const script = document.createElement('script');
            script.src = BACKEND_URL + '/socket.io/socket.io.js';
            script.onload = function () {
                console.log('[SocketListener] socket.io loaded dynamically');
                connect();
            };
            script.onerror = function () {
                console.warn('[SocketListener] Could not load socket.io from', BACKEND_URL);
                // Try CDN fallback
                const fallback = document.createElement('script');
                fallback.src = 'https://cdn.socket.io/4.7.4/socket.io.min.js';
                fallback.onload = connect;
                document.head.appendChild(fallback);
            };
            document.head.appendChild(script);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitAndConnect);
    } else {
        waitAndConnect();
    }

    console.log('[SocketListener] Initialized ✅');
})();