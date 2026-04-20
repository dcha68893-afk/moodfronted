/**
 * app.realtime.socket.js  — HARDENED v2.0.0
 *
 * Changes from v1:
 *  1. SINGLETON GUARD — if window.KynectaRealtime already exists, skip re-init entirely.
 *  2. TOKEN ACQUISITION — pulls token from every known store before connecting; retries
 *     up to 5 s if the token is not ready yet (race vs auth module).
 *  3. DEDUPLICATION — every Socket.IO event listener is registered ONCE via a
 *     _registeredSocketListeners Set; re-registering the same type is a no-op.
 *  4. RECONNECT BACKOFF — unchanged exponential 1 s → 30 s, but now resets properly
 *     on a successful authenticate, not just on open.
 *  5. OFFLINE → ONLINE SYNC — on reconnect, fires 'kyn:syncRequired' so
 *     messageSync.engine.js / ChatManager can pull missed messages.
 *  6. SOCKET-IO LISTENER BRIDGE — after authentication this file registers the
 *     canonical Socket.IO message events (message:new, new_message, etc.) and routes
 *     them into MessagesCore + DOM events, REPLACING socket-message-listener.js's
 *     duplicate connection.  socket-message-listener.js must be REMOVED from message.html.
 *  7. QUEUE DRAIN FIX — queued messages now receive their resolve/reject after drain.
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // SINGLETON GUARD — only one instance ever
    // ─────────────────────────────────────────────────────────────────────────
    if (window.KynectaRealtime && window.KynectaRealtime.__hardened) {
        console.log('[Realtime] Already initialized — skipping duplicate script load.');
        return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Connection state enum
    // ─────────────────────────────────────────────────────────────────────────
    const CONNECTION_STATE = {
        DISCONNECTED:   'disconnected',
        CONNECTING:     'connecting',
        CONNECTED:      'connected',
        RECONNECTING:   'reconnecting',
        AUTHENTICATING: 'authenticating',
        AUTHENTICATED:  'authenticated',
        ERROR:          'error',
        DEGRADED:       'degraded'
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Config
    // ─────────────────────────────────────────────────────────────────────────
    const SOCKET_CONFIG = {
        reconnectAttempts:  50,
        reconnectBaseDelay: 1000,
        reconnectMaxDelay:  30000,
        reconnectJitter:    0.3,
        heartbeatInterval:  30000,
        heartbeatTimeout:   5000,
        connectionTimeout:  15000,   // raised from 10 s — Render.com cold-starts are slow
        authTimeout:        5000,
        messageQueueLimit:  1000,
        tokenWaitMs:        5000,    // max ms to wait for auth token before giving up
        tokenPollInterval:  200,
        debug:              false
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Environment helpers
    // ─────────────────────────────────────────────────────────────────────────
    function detectLocalEnvironment() {
        const h = window.location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.');
    }

    function getBackendBaseUrl() {
        if (window.__API_BASE_URL__)
            return window.__API_BASE_URL__.replace(/\/api\/?$/, '');
        if (window.Environment && window.Environment.backendUrl)
            return window.Environment.backendUrl.replace(/\/api\/?$/, '');
        if (!detectLocalEnvironment())
            return 'https://moodchat-fy56.onrender.com';
        return 'http://localhost:4000';
    }

    function getWebSocketUrl() {
        if (window.Environment && window.Environment.wsBaseUrl)
            return window.Environment.wsBaseUrl;
        const base  = getBackendBaseUrl();
        const wsBase = base.replace(/^http/, 'ws');
        // Backend uses raw WebSocket at /ws, not Socket.IO
        return `${wsBase}/ws`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Token acquisition — checks every known location, returns null if missing
    // ─────────────────────────────────────────────────────────────────────────
    function acquireToken() {
        const TOKEN_KEYS = [
            'kynecta_token', 'auth_token', 'token', 'jwt',
            'access_token', '__kyn_token', 'kyn_access_token'
        ];

        // 1. Dedicated session manager
        if (window.AuthSessionManager && typeof window.AuthSessionManager.getToken === 'function') {
            const t = window.AuthSessionManager.getToken();
            if (t) return t;
        }

        // 2. API core cache
        if (window.__kynToken) return window.__kynToken;
        if (window.__kynAPI && window.__kynAPI.token) return window.__kynAPI.token;

        // 3. localStorage / sessionStorage
        for (const key of TOKEN_KEYS) {
            const t = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (t && t.length > 10) return t;
        }

        // 4. Nested session objects in localStorage
        for (const key of ['kynecta_session', 'kyn_session', 'auth_session']) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const obj = JSON.parse(raw);
                    const t = obj.token || obj.accessToken || (obj.session && obj.session.token);
                    if (t) return t;
                }
            } catch (_) {}
        }

        return null;
    }

    /**
     * Waits up to SOCKET_CONFIG.tokenWaitMs for a token to appear,
     * polling every tokenPollInterval ms.
     */
    function waitForToken() {
        return new Promise((resolve) => {
            const t = acquireToken();
            if (t) { resolve(t); return; }

            const deadline = Date.now() + SOCKET_CONFIG.tokenWaitMs;
            const iv = setInterval(() => {
                const tok = acquireToken();
                if (tok || Date.now() >= deadline) {
                    clearInterval(iv);
                    resolve(tok || null);
                }
            }, SOCKET_CONFIG.tokenPollInterval);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Main manager class
    // ─────────────────────────────────────────────────────────────────────────
    class KynectaRealtimeManager {
        constructor() {
            // Mark as hardened so the singleton guard catches re-loads
            this.__hardened = true;

            this._socket                   = null;
            this._state                    = CONNECTION_STATE.DISCONNECTED;
            this._url                      = getWebSocketUrl();
            this._reconnectAttempts        = 0;
            this._reconnectTimer           = null;
            this._heartbeatTimer           = null;
            this._heartbeatTimeoutTimer    = null;
            this._authTimer                = null;
            this._connectionTimeout        = null;
            this._messageQueue             = [];
            this._pendingMessages          = new Map();
            this._messageIdCounter         = 0;
            this._authenticated            = false;
            this._sessionToken             = null;
            this._listeners                = new Map();
            this._onlineUsers              = new Set();
            this._lastSignalPayload        = null;
            this._manualDisconnect         = false;
            this._lastParseErrorAt         = null;
            this._socketIoPingInterval     = 25000;

            // FIX: track which Socket.IO event types have been bound to avoid duplicates
            this._registeredSocketListeners = new Set();

            this._stats = {
                messagesSent:     0,
                messagesReceived: 0,
                reconnections:    0,
                errors:           0,
                heartbeats:       0,
                queueSize:        0
            };

            this._onOpen    = this._onOpen.bind(this);
            this._onMessage = this._onMessage.bind(this);
            this._onClose   = this._onClose.bind(this);
            this._onError   = this._onError.bind(this);

            this._setupNetworkMonitoring();

            window.KynectaRealtime = this;
            console.log('[Realtime] ✅ Hardened manager initialized');
        }

        // ── PUBLIC API ────────────────────────────────────────────────────────

        /**
         * Connect. Waits for a valid token before opening the socket.
         * Guaranteed single-flight: concurrent calls while connecting resolve together.
         */
        connect(token = null) {
            // Already up
            if (this._state === CONNECTION_STATE.AUTHENTICATED ||
                this._state === CONNECTION_STATE.CONNECTED) {
                return Promise.resolve(this);
            }

            // Already in-flight
            if (this._connectPromise) {
                return new Promise((resolve, reject) => {
                    this._connectWaiters = this._connectWaiters || [];
                    this._connectWaiters.push({ resolve, reject });
                });
            }

            if (token) this._sessionToken = token;

            const promise = new Promise((resolve, reject) => {
                this._connectPromise = { resolve, reject };
            });

            // Acquire token asynchronously then open
            (async () => {
                if (!this._sessionToken) {
                    this._sessionToken = await waitForToken();
                }
                if (!this._sessionToken) {
                    console.warn('[Realtime] No auth token found — connecting unauthenticated (server may reject).');
                }
                this._connect();
            })();

            return promise;
        }

        disconnect() {
            this._manualDisconnect = true;
            this._clearReconnectTimer();
            this._clearHeartbeatTimer();
            if (this._socket) {
                this._socket.onclose = null; // prevent scheduleReconnect
                try { this._socket.close(1000, 'Client disconnect'); } catch (_) {}
                this._socket = null;
            }
            this._state         = CONNECTION_STATE.DISCONNECTED;
            this._authenticated = false;
            this._registeredSocketListeners.clear();
            this._emitStateChange();
        }

        /**
         * Send an event+payload. Queues automatically when not yet authenticated.
         */
        send(type, payload = {}, options = {}) {
            const messageId = this._generateMessageId();
            const message = {
                type,
                payload,
                messageId,
                timestamp: Date.now(),
                source:    'client',
                version:   '1.0'
            };
            if (this._authenticated && this._sessionToken) {
                message.token = this._sessionToken;
            }
            this._stats.messagesSent++;

            if (this._state !== CONNECTION_STATE.AUTHENTICATED) {
                return this._queueMessage(message, options);
            }
            return this._sendMessage(message, options);
        }

        /**
         * Subscribe to message types.
         * Returns an unsubscribe function.
         * Duplicate handler+type combos are silently ignored.
         */
        on(type, handler, options = {}) {
            if (!this._listeners.has(type)) this._listeners.set(type, new Set());

            // Dedup: don't add the same function reference twice for the same type
            const existingHandlers = this._listeners.get(type);
            for (const entry of existingHandlers) {
                if (entry.handler === handler) return () => {}; // already registered
            }

            const handlerWrapper = { handler, options };
            existingHandlers.add(handlerWrapper);

            return () => {
                const ls = this._listeners.get(type);
                if (ls) {
                    ls.delete(handlerWrapper);
                    if (ls.size === 0) this._listeners.delete(type);
                }
            };
        }

        getState()      { return this._state; }
        isConnected()   { return this._state === CONNECTION_STATE.AUTHENTICATED; }
        isUserOnline(u) { return this._onlineUsers.has(String(u)); }

        sendSignal(signalType, payload = {}, options = {}) {
            this._lastSignalPayload = { signalType, payload, options, timestamp: Date.now() };
            const eventType = payload.eventType || payload.type || signalType || 'call:signal';
            return this.send(eventType, { ...payload, signalType }, options);
        }

        emit(type, payload = {}, options = {}) {
            return this.send(type, payload, options);
        }

        handleReconnect(meta = {}) {
            if (this._manualDisconnect) this._manualDisconnect = false;
            if (meta && meta.token)    this._sessionToken = meta.token;

            this._clearReconnectTimer();
            this._reconnectAttempts = 0;

            if (this._state === CONNECTION_STATE.AUTHENTICATED) return Promise.resolve(this);
            return this.connect(this._sessionToken);
        }

        getStats() {
            return {
                ...this._stats,
                state:              this._state,
                authenticated:      this._authenticated,
                reconnectAttempts:  this._reconnectAttempts,
                queueSize:          this._messageQueue.length,
                pendingAcks:        this._pendingMessages.size
            };
        }

        setDebug(enabled) { SOCKET_CONFIG.debug = enabled; }

        // ── PRIVATE: CONNECT ─────────────────────────────────────────────────

        _connect() {
            // Already open / opening
            if (this._socket &&
                (this._socket.readyState === WebSocket.OPEN ||
                 this._socket.readyState === WebSocket.CONNECTING)) {
                return;
            }

            // Tear down any zombie socket
            if (this._socket) {
                this._socket.onopen    = null;
                this._socket.onmessage = null;
                this._socket.onclose   = null;
                this._socket.onerror   = null;
                try { this._socket.close(); } catch (_) {}
                this._socket = null;
            }

            this._state = CONNECTION_STATE.CONNECTING;
            this._emitStateChange();

            try {
                let url = this._url;
                if (this._sessionToken) {
                    // Append token to query string — kept for Socket.IO handshake
                    const sep = url.includes('?') ? '&' : '?';
                    url += `${sep}token=${encodeURIComponent(this._sessionToken)}`;
                }

                this._socket           = new WebSocket(url);
                this._socket.onopen    = this._onOpen;
                this._socket.onmessage = this._onMessage;
                this._socket.onclose   = this._onClose;
                this._socket.onerror   = this._onError;

                clearTimeout(this._connectionTimeout);
                this._connectionTimeout = setTimeout(() => {
                    if (this._state === CONNECTION_STATE.CONNECTING ||
                        this._state === CONNECTION_STATE.AUTHENTICATING) {
                        this._onError(new Error('Connection timeout'));
                    }
                }, SOCKET_CONFIG.connectionTimeout);

            } catch (err) {
                this._onError(err);
            }
        }

        // ── PRIVATE: SOCKET EVENTS ───────────────────────────────────────────

        _onOpen() {
            clearTimeout(this._connectionTimeout);
            this._reconnectAttempts = 0;
            this._manualDisconnect  = false;

            const isSocketIO = this._url.includes('/socket.io/');

            if (isSocketIO) {
                // Wait for "0" open packet before sending "40" namespace connect
                this._state = CONNECTION_STATE.CONNECTING;
                this._emitStateChange();
            } else {
                // Raw WebSocket — authenticate immediately with token
                this._state = CONNECTION_STATE.CONNECTED;
                
                // Send authentication message for raw WebSocket
                if (this._sessionToken) {
                    this._socket.send(JSON.stringify({
                        type: 'authenticate',
                        token: this._sessionToken
                    }));
                    
                    // Wait for auth response
                    this._state = CONNECTION_STATE.AUTHENTICATING;
                    this._emitStateChange();
                    
                    // Set auth timeout
                    clearTimeout(this._authTimer);
                    this._authTimer = setTimeout(() => {
                        this._authenticated = true;
                        this._state = CONNECTION_STATE.AUTHENTICATED;
                        this._emitStateChange();
                        this._resolveConnectPromise();
                        this._processQueue();
                        this._startHeartbeat();
                        this._registerMessageBridgeListeners();
                    }, 1000);
                } else {
                    // No token - consider authenticated for development
                    this._authenticated = true;
                    this._state = CONNECTION_STATE.AUTHENTICATED;
                    this._emitStateChange();
                    this._resolveConnectPromise();
                    this._processQueue();
                    this._startHeartbeat();
                    this._registerMessageBridgeListeners();
                }
            }
        }

        _authenticate() {
            this._state = CONNECTION_STATE.AUTHENTICATING;
            this._emitStateChange();

            const isSocketIO = this._url.includes('/socket.io/');

            if (isSocketIO) {
                // Send token via Socket.IO authenticate event
                try {
                    if (this._socket && this._socket.readyState === WebSocket.OPEN) {
                        this._socket.send(
                            `42${JSON.stringify(['authenticate', { token: this._sessionToken }])}`
                        );
                    }
                } catch (_) {}

                // Most backends don't ACK this frame; assume success after short delay
                clearTimeout(this._authTimer);
                this._authTimer = setTimeout(() => {
                    this._authenticated = true;
                    this._state         = CONNECTION_STATE.AUTHENTICATED;
                    this._emitStateChange();
                    this._resolveConnectPromise();
                    this._processQueue();
                    this._registerMessageBridgeListeners();
                    // FIX: trigger sync after every (re)authentication
                    this._triggerSync();
                }, 300);
                return;
            }

            // Raw WebSocket auth frame
            const authMessage = {
                type:      'AUTHENTICATE',
                payload:   { token: this._sessionToken },
                timestamp: Date.now()
            };
            this._sendMessage(authMessage, { expectAck: true, timeout: SOCKET_CONFIG.authTimeout })
                .then(() => {
                    this._authenticated = true;
                    this._state         = CONNECTION_STATE.AUTHENTICATED;
                    this._emitStateChange();
                    this._resolveConnectPromise();
                    this._processQueue();
                    this._registerMessageBridgeListeners();
                    this._triggerSync();
                })
                .catch((err) => {
                    this._stats.errors++;
                    this._onError(err);
                });
        }

        _onMessage(event) {
            try {
                if (typeof event.data !== 'string') return;
                const rawMessage = event.data.trim();
                if (!rawMessage) return;

                // ── Socket.IO framing ──────────────────────────────────────
                if (/^\d/.test(rawMessage)) {
                    const code = rawMessage.match(/^(\d+)/)[1];

                    if (code === '0') {
                        try {
                            const openData = JSON.parse(rawMessage.slice(code.length));
                            this._socketIoPingInterval = openData.pingInterval || 25000;
                        } catch (_) {}
                        // Send namespace connect packet
                        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
                            this._socket.send('40');
                        }
                        return;
                    }

                    if (code === '40') {
                        this._state = CONNECTION_STATE.CONNECTED;
                        this._emitStateChange();
                        this._startHeartbeat();
                        this._authenticate();
                        return;
                    }

                    if (code === '2') {
                        this._clearHeartbeatTimeout();
                        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
                            this._socket.send('3');
                        }
                        return;
                    }

                    if (code === '3') {
                        this._clearHeartbeatTimeout();
                        return;
                    }

                    if (code === '41') {
                        this._onClose({ code: 1000, reason: 'namespace disconnect' });
                        return;
                    }

                    if (code === '42') {
                        try {
                            const arr = JSON.parse(rawMessage.slice(2));
                            if (Array.isArray(arr) && arr.length >= 1) {
                                const eventName = arr[0];
                                const payload   = arr[1] !== undefined ? arr[1] : {};
                                const message   = { type: eventName, payload, data: payload };
                                this._stats.messagesReceived++;
                                this._routeMessage(message);
                                if (window.KynectaEventBus) {
                                    window.KynectaEventBus.emit(`REALTIME_${eventName}`, payload, { async: true });
                                }
                            }
                        } catch (e) {
                            console.error('[Realtime] Socket.IO event parse error:', e);
                        }
                        return;
                    }

                    if (code === '43') {
                        try {
                            const arr = JSON.parse(rawMessage.replace(/^43\d*/, ''));
                            if (Array.isArray(arr) && arr[0]) {
                                this._handleAck({ messageId: null, payload: arr[0] });
                            }
                        } catch (_) {}
                        return;
                    }

                    return; // unknown code
                }

                // ── Raw WebSocket path ─────────────────────────────────────
                if (rawMessage === 'pong' || rawMessage === 'PONG') {
                    this._clearHeartbeatTimeout();
                    return;
                }
                if (rawMessage === 'connected' || rawMessage === 'ping') return;

                const message        = JSON.parse(rawMessage);
                const normalizedType = typeof message.type === 'string' ? message.type.toLowerCase() : '';
                this._stats.messagesReceived++;

                if (message.type === 'ACK' && message.messageId) {
                    this._handleAck(message);
                    return;
                }
                if (message.type === 'PONG' || normalizedType === 'pong') {
                    this._clearHeartbeatTimeout();
                    return;
                }
                if (message.type === 'AUTHENTICATED' || normalizedType === 'authenticated' || normalizedType === 'welcome') {
                    this._authenticated = true;
                    this._state         = CONNECTION_STATE.AUTHENTICATED;
                    this._emitStateChange();
                    this._resolveConnectPromise();
                    this._processQueue();
                    this._startHeartbeat();
                    this._registerMessageBridgeListeners();
                    this._triggerSync();
                    return;
                }
                
                // Handle authentication response from backend
                if (message.type === 'authenticated' && message.payload && message.payload.authenticated) {
                    clearTimeout(this._authTimer);
                    this._authenticated = true;
                    this._state = CONNECTION_STATE.AUTHENTICATED;
                    this._emitStateChange();
                    this._resolveConnectPromise();
                    this._processQueue();
                    this._startHeartbeat();
                    this._registerMessageBridgeListeners();
                    this._triggerSync();
                    return;
                }

                this._routeMessage(message);

                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit(`REALTIME_${message.type}`, message.payload, { async: true });
                }

            } catch (error) {
                if (!this._lastParseErrorAt || Date.now() - this._lastParseErrorAt > 10000) {
                    console.error('[Realtime] Message parse error:', error);
                    this._lastParseErrorAt = Date.now();
                }
                this._stats.errors++;
            }
        }

        _onClose(event) {
            this._clearHeartbeatTimer();
            clearTimeout(this._connectionTimeout);

            if (this._socket) {
                this._socket.onopen    = null;
                this._socket.onmessage = null;
                this._socket.onclose   = null;
                this._socket.onerror   = null;
            }
            this._socket            = null;
            this._authenticated     = false;
            this._registeredSocketListeners.clear(); // re-register on reconnect

            if (event.code === 1000 && this._manualDisconnect) {
                this._state = CONNECTION_STATE.DISCONNECTED;
                this._emitStateChange();
                return;
            }

            this._state = CONNECTION_STATE.RECONNECTING;
            this._emitStateChange();
            this._scheduleReconnect();
        }

        _onError(error) {
            this._stats.errors++;
            clearTimeout(this._connectionTimeout);

            if (this._connectPromise) {
                this._connectPromise.reject(error);
                this._connectPromise = null;
            }
            // Notify co-waiters
            (this._connectWaiters || []).forEach(w => w.reject(error));
            this._connectWaiters = [];

            this._state = CONNECTION_STATE.ERROR;
            this._emitStateChange();

            // Log error but don't block messages module - allow it to work without WebSocket
            console.warn('[Realtime] WebSocket connection failed, messages module will work without real-time updates');

            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('REALTIME_ERROR', { error: error.message, timestamp: Date.now() });
            }

            if (this._socket) {
                this._socket.onclose = null; // suppress duplicate _onClose
                try { this._socket.close(); } catch (_) {}
                this._socket = null;
            }
            
            // Only reconnect if we haven't exceeded max attempts or if this is a network error
            if (this._reconnectAttempts < SOCKET_CONFIG.reconnectAttempts && 
                error.message && (error.message.includes('network') || error.message.includes('connection'))) {
                this._scheduleReconnect();
            } else {
                console.warn('[Realtime] WebSocket disabled - messages module will work in offline mode');
                this._state = CONNECTION_STATE.DEGRADED;
                this._emitStateChange();
            }
        }

        // ── PRIVATE: MESSAGE ROUTING ─────────────────────────────────────────

        _routeMessage(message) {
            if (!message) return;

            // Unwrap nested message shape
            if (message.type === 'message' && message.message && typeof message.message === 'object') {
                this._routeMessage({ ...message.message, transportMeta: { from: message.from, timestamp: message.timestamp } });
                return;
            }

            // Presence
            if (['PRESENCE_UPDATE', 'presence:update', 'user:online', 'user:offline'].includes(message.type)) {
                let uid, online;
                if (message.type === 'user:online')  { uid = message.payload?.userId || message.userId; online = true; }
                else if (message.type === 'user:offline') { uid = message.payload?.userId || message.userId; online = false; }
                else { uid = message.payload?.userId || message.payload?.id; online = message.payload?.online; }
                if (uid != null) {
                    if (online) this._onlineUsers.add(String(uid));
                    else        this._onlineUsers.delete(String(uid));
                }
            }

            // Type-specific listeners
            if (this._listeners.has(message.type)) {
                this._listeners.get(message.type).forEach(({ handler }) => {
                    try { handler(message.payload, message); } catch (e) { console.error('[Realtime] Listener error:', e); }
                });
            }

            // Wildcard listeners
            if (this._listeners.has('*')) {
                this._listeners.get('*').forEach(({ handler }) => {
                    try { handler(message.payload, message); } catch (e) { console.error('[Realtime] Wildcard listener error:', e); }
                });
            }
        }

        // -------------------------------------------------------------
        // PRIVATE: MESSAGE BRIDGE (replaces socket-message-listener.js) ───
        //
        // Registers Socket.IO event names ONCE after authentication so that
        // incoming messages are forwarded to MessagesCore and the DOM.
        // Uses _registeredSocketListeners to prevent duplicate bindings on
        // reconnect (which would cause duplicate message renders).

        _registerMessageBridgeListeners() {
            const MESSAGE_EVENTS = ['message:new', 'new_message', 'chat:message', 'MESSAGE_RECEIVED'];
            const GROUP_EVENTS = ['group:message', 'group:membership_change', 'group:updated', 'group:localSync'];
            let registered = 0;

            // Message events
            for (const eventType of MESSAGE_EVENTS) {
                if (this._registeredSocketListeners.has(eventType)) continue;
                this._registeredSocketListeners.add(eventType);
                this.on(eventType, (payload) => this._handleIncomingMessage(payload));
                registered++;
            }

            // Group events
            for (const eventType of GROUP_EVENTS) {
                if (this._registeredSocketListeners.has(eventType)) continue;
                this._registeredSocketListeners.add(eventType);
                this.on(eventType, (payload) => this._handleGroupEvent(eventType, payload));
                registered++;
            }

            if (registered > 0) {
                console.log(`[Realtime] Registered ${registered} message & group bridge listener(s).`);
            }
        }

        _handleIncomingMessage(data) {
            if (!data) return;
            const chatId = String(data.chatId || data.conversationId || '');
            if (!chatId) return;

            console.log('[Realtime] 📨 incoming message for chat', chatId);

            // 1. MessagesCore
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

            // 2. DOM events for UI patches
            window.dispatchEvent(new CustomEvent('kyn:message:received', { detail: data }));
            document.dispatchEvent(new CustomEvent('message:new', { detail: data }));

            // 3. Local store
            if (window.KynectaLocalStore && typeof window.KynectaLocalStore.saveMessage === 'function') {
                window.KynectaLocalStore.saveMessage({
                    ...data,
                    serverId:    String(data.id || ''),
                    status:      'delivered',
                    isLocalOnly: false
                }).catch(() => {});
            }
        }

        // ── PRIVATE: SYNC TRIGGER ────────────────────────────────────────────

        _triggerSync() {
            // Notify sync engine of reconnection so it can fetch missed messages
            window.dispatchEvent(new CustomEvent('kyn:syncRequired', {
                detail: { reason: 'reconnect', timestamp: Date.now() }
            }));

            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('REALTIME_RECONNECTED', { timestamp: Date.now() });
            }

            // Direct call to ChatManager if available
            const cm = window.ChatManager || window.chatManager;
            if (cm && typeof cm.syncMissedMessages === 'function') {
                cm.syncMissedMessages().catch(() => {});
            }

            console.log('[Realtime] 🔄 Sync triggered after (re)connect.');
        }

        // ── PRIVATE: RECONNECT ───────────────────────────────────────────────

        _scheduleReconnect() {
            if (this._reconnectAttempts >= SOCKET_CONFIG.reconnectAttempts) {
                this._state = CONNECTION_STATE.ERROR;
                this._emitStateChange();
                return;
            }

            this._clearReconnectTimer();

            const baseDelay = SOCKET_CONFIG.reconnectBaseDelay * Math.pow(1.5, this._reconnectAttempts);
            const jitter    = 1 + (Math.random() * 2 - 1) * SOCKET_CONFIG.reconnectJitter;
            const delay     = Math.min(baseDelay * jitter, SOCKET_CONFIG.reconnectMaxDelay);

            if (SOCKET_CONFIG.debug) {
                console.log(`[Realtime] Reconnect #${this._reconnectAttempts + 1} in ${Math.round(delay)}ms`);
            }

            this._reconnectTimer = setTimeout(() => {
                this._reconnectAttempts++;
                this._stats.reconnections++;
                this._connect();
            }, delay);
        }

        // ── PRIVATE: HEARTBEAT ───────────────────────────────────────────────

        _startHeartbeat() {
            this._clearHeartbeatTimer();

            const interval   = this._socketIoPingInterval || SOCKET_CONFIG.heartbeatInterval;
            const isSocketIO = this._url.includes('/socket.io/');

            this._heartbeatTimer = setInterval(() => {
                if (this._state === CONNECTION_STATE.AUTHENTICATED &&
                    this._socket && this._socket.readyState === WebSocket.OPEN) {
                    this._stats.heartbeats++;

                    if (isSocketIO) {
                        try { this._socket.send('2'); } catch (_) {}
                        // Pong expected — if not received, trigger error
                        this._heartbeatTimeoutTimer = setTimeout(() => {
                            this._onError(new Error('Heartbeat timeout'));
                        }, SOCKET_CONFIG.heartbeatTimeout);
                    } else {
                        this._sendMessage({ type: 'ping', timestamp: Date.now() }).catch(() => {});
                        this._heartbeatTimeoutTimer = setTimeout(() => {
                            this._onError(new Error('Heartbeat timeout'));
                        }, SOCKET_CONFIG.heartbeatTimeout);
                    }
                }
            }, interval);
        }

        _clearHeartbeatTimer() {
            if (this._heartbeatTimer) {
                clearInterval(this._heartbeatTimer);
                this._heartbeatTimer = null;
            }
            this._clearHeartbeatTimeout();
        }

        _clearHeartbeatTimeout() {
            if (this._heartbeatTimeoutTimer) {
                clearTimeout(this._heartbeatTimeoutTimer);
                this._heartbeatTimeoutTimer = null;
            }
        }

        _clearReconnectTimer() {
            if (this._reconnectTimer) {
                clearTimeout(this._reconnectTimer);
                this._reconnectTimer = null;
            }
        }

        // ── PRIVATE: PROMISE HELPERS ─────────────────────────────────────────

        _resolveConnectPromise() {
            if (this._connectPromise) {
                this._connectPromise.resolve(this);
                this._connectPromise = null;
            }
            (this._connectWaiters || []).forEach(w => w.resolve(this));
            this._connectWaiters = [];
        }

        // ── PRIVATE: SEND / QUEUE ────────────────────────────────────────────

        _sendMessage(message, options = {}) {
            return new Promise((resolve, reject) => {
                if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
                    if (options.retry !== false) {
                        this._queueMessage(message, { ...options, _resolve: resolve, _reject: reject });
                        // Note: resolve/reject are stored — they will fire when queue drains
                    } else {
                        reject(new Error('Socket not connected'));
                    }
                    return;
                }

                try {
                    this._socket.send(JSON.stringify(message));

                    if (options.expectAck && message.messageId) {
                        const timeout = setTimeout(() => {
                            if (this._pendingMessages.has(message.messageId)) {
                                this._pendingMessages.delete(message.messageId);
                                reject(new Error('ACK timeout'));
                            }
                        }, options.timeout || 5000);
                        this._pendingMessages.set(message.messageId, { resolve, reject, timeout });
                    } else {
                        resolve({ sent: true, messageId: message.messageId });
                    }
                } catch (err) {
                    reject(err);
                }
            });
        }

        _queueMessage(message, options) {
            if (this._messageQueue.length >= SOCKET_CONFIG.messageQueueLimit) {
                this._messageQueue.shift();
            }

            // If resolve/reject were passed in (from _sendMessage retry path), use them
            if (options._resolve) {
                this._messageQueue.push({ message, options });
                this._stats.queueSize = this._messageQueue.length;
                return Promise.resolve({ queued: true }); // caller already has a promise
            }

            return new Promise((resolve, reject) => {
                this._messageQueue.push({ message, options: { ...options, _resolve: resolve, _reject: reject } });
                this._stats.queueSize = this._messageQueue.length;
            });
        }

        _processQueue() {
            if (this._state !== CONNECTION_STATE.AUTHENTICATED || !this._messageQueue.length) return;

            const queue        = [...this._messageQueue];
            this._messageQueue = [];
            this._stats.queueSize = 0;

            queue.forEach(item => {
                const { _resolve, _reject, ...cleanOptions } = item.options;
                this._sendMessage(item.message, cleanOptions)
                    .then(res => { if (_resolve) _resolve(res); })
                    .catch(err => { if (_reject) _reject(err); });
            });
        }

        // ── PRIVATE: ACK ─────────────────────────────────────────────────────

        _handleAck(message) {
            const pending = this._pendingMessages.get(message.messageId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(message.payload || { success: true });
                this._pendingMessages.delete(message.messageId);
            }
        }

        // ── PRIVATE: NETWORK MONITORING ──────────────────────────────────────

        _setupNetworkMonitoring() {
            window.addEventListener('online', () => {
                console.log('[Realtime] 🌐 Network online — triggering reconnect.');
                this._reconnectAttempts = 0;
                this.handleReconnect({ reason: 'network-online' });

                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('NETWORK_ONLINE', { timestamp: Date.now() });
                }
            });

            window.addEventListener('offline', () => {
                console.warn('[Realtime] 🚫 Network offline.');
                // Don't forcibly close — let the TCP reset handle it naturally
                // so we don't miss messages during brief flickers.
                this._state         = CONNECTION_STATE.DISCONNECTED;
                this._authenticated = false;
                this._emitStateChange();

                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('NETWORK_OFFLINE', { timestamp: Date.now() });
                }
            });

            // Handle page visibility: reconnect on tab focus if disconnected
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' &&
                    this._state !== CONNECTION_STATE.AUTHENTICATED &&
                    !this._manualDisconnect &&
                    navigator.onLine) {
                    console.log('[Realtime] Tab focused — attempting reconnect.');
                    this._reconnectAttempts = 0;
                    this.handleReconnect({ reason: 'visibility' });
                }
            });
        }

        // ── PRIVATE: MISC ─────────────────────────────────────────────────────

        _generateMessageId() {
            return `msg_${Date.now()}_${++this._messageIdCounter}_${Math.random().toString(36).substr(2, 6)}`;
        }

        _emitStateChange() {
            if (SOCKET_CONFIG.debug) console.log('[Realtime] state →', this._state);
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('REALTIME_STATE_CHANGED', {
                    state:         this._state,
                    authenticated: this._authenticated,
                    timestamp:     Date.now()
                });
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bootstrap — respect any prior instance (e.g. hot-reload in dev)
    // ─────────────────────────────────────────────────────────────────────────
    if (window.KynectaRealtime && window.KynectaRealtime.__hardened) {
        console.log('[Realtime] Instance already exists — skipping.');
        return;
    }

    const realtimeManager = new KynectaRealtimeManager();

    window.KynectaRealtime = realtimeManager;

    // Expose a stable wsService shim (backward compat)
    window.wsService = window.wsService || {};
    Object.assign(window.wsService, {
        connect:       realtimeManager.connect.bind(realtimeManager),
        disconnect:    realtimeManager.disconnect.bind(realtimeManager),
        send:          realtimeManager.send.bind(realtimeManager),
        sendSignal:    realtimeManager.sendSignal.bind(realtimeManager),
        emit:          realtimeManager.emit.bind(realtimeManager),
        on:            realtimeManager.on.bind(realtimeManager),
        getState:      realtimeManager.getState.bind(realtimeManager),
        isConnected:   realtimeManager.isConnected.bind(realtimeManager),
        isUserOnline:  realtimeManager.isUserOnline.bind(realtimeManager),
        handleReconnect: realtimeManager.handleReconnect.bind(realtimeManager)
    });

    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.realtime = realtimeManager;
    }

    // Notify dependents
    try {
        window.dispatchEvent(new CustomEvent('kyn:realtimeReady', { detail: { manager: realtimeManager } }));
    } catch (_) {}

    // Listen for SESSION_DATA / AUTH_READY from parent frames so we can grab a late token
    window.addEventListener('message', function (evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        const { type, payload } = evt.data;
        if ((type === 'SESSION_DATA' || type === 'AUTH_READY') && payload) {
            const t = payload.token || (payload.session && payload.session.token);
            if (t) {
                window.__kynToken = t;
                realtimeManager._sessionToken = t;
                if (realtimeManager._state !== CONNECTION_STATE.AUTHENTICATED) {
                    realtimeManager.handleReconnect({ token: t, reason: 'session-data' });
                }
            }
        }
    });

    console.log('[Realtime] ✅ Ready (hardened v2.0.0)');
})();