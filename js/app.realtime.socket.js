/**
 * Kynecta Realtime Connection Manager
 * Centralized WebSocket management with auto-reconnection and event routing
 * @version 1.0.0
 */

(function() {
    'use strict';

    // Connection states
    const CONNECTION_STATE = {
        DISCONNECTED: 'disconnected',
        CONNECTING: 'connecting',
        CONNECTED: 'connected',
        RECONNECTING: 'reconnecting',
        AUTHENTICATING: 'authenticating',
        AUTHENTICATED: 'authenticated',
        ERROR: 'error',
        DEGRADED: 'degraded'
    };

    // Configuration
    const SOCKET_CONFIG = {
        reconnectAttempts: 50,
        reconnectBaseDelay: 1000,
        reconnectMaxDelay: 30000,
        reconnectJitter: 0.3,
        heartbeatInterval: 30000,
        heartbeatTimeout: 5000,
        connectionTimeout: 10000,
        authTimeout: 5000,
        messageQueueLimit: 1000,
        debug: false
    };

    // Environment detection for WebSocket URL
    // FIXED: In production the frontend (moodfronted.onrender.com) and backend
    // (moodchat-fy56.onrender.com) are on different domains.  We must always
    // connect to the BACKEND domain, not window.location.host.
    function detectLocalEnvironment() {
        const h = window.location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.');
    }

    function getBackendBaseUrl() {
        // 1. Explicit override injected by chat.html / server
        if (window.__API_BASE_URL__) return window.__API_BASE_URL__.replace(/\/api\/?$/, '');
        // 2. api.core.js sets this after detecting production
        if (window.Environment && window.Environment.backendUrl) {
            return window.Environment.backendUrl.replace(/\/api\/?$/, '');
        }
        // 3. Hardcoded production fallback
        if (!detectLocalEnvironment()) {
            return 'https://moodchat-fy56.onrender.com';
        }
        return 'http://localhost:4000';
    }

    function getWebSocketUrl() {
        // 1. Explicit WS URL override
        if (window.Environment && window.Environment.wsBaseUrl) {
            return window.Environment.wsBaseUrl;
        }
        // 2. Derive from backend base URL (CORRECT for split-domain deployments)
        const base = getBackendBaseUrl();
        const wsBase = base.replace(/^http/, 'ws');
        // FIX: Try Socket.IO websocket transport first (most backends use Socket.IO, not raw /ws)
        // If your backend is raw WebSocket on /ws, change this back to `${wsBase}/ws`
        return `${wsBase}/socket.io/?EIO=4&transport=websocket`;
    }

    /**
     * Kynecta Realtime Manager
     */
    class KynectaRealtimeManager {
        constructor() {
            this._socket = null;
            this._state = CONNECTION_STATE.DISCONNECTED;
            this._url = getWebSocketUrl();
            this._reconnectAttempts = 0;
            this._reconnectTimer = null;
            this._heartbeatTimer = null;
            this._heartbeatTimeoutTimer = null;
            this._authTimer = null;
            this._messageQueue = [];
            this._pendingMessages = new Map(); // messageId -> { resolve, reject, timeout }
            this._messageIdCounter = 0;
            this._authenticated = false;
            this._sessionToken = null;
            this._listeners = new Map();
            this._onlineUsers = new Set();
            this._lastSignalPayload = null;
            this._manualDisconnect = false;
            this._stats = {
                messagesSent: 0,
                messagesReceived: 0,
                reconnections: 0,
                errors: 0,
                heartbeats: 0,
                queueSize: 0
            };

            // Bind methods
            this._onOpen = this._onOpen.bind(this);
            this._onMessage = this._onMessage.bind(this);
            this._onClose = this._onClose.bind(this);
            this._onError = this._onError.bind(this);

            // Monitor network status
            this._setupNetworkMonitoring();

            // Expose globally
            window.KynectaRealtime = this;

            console.log('[Realtime] ✅ Manager initialized');
        }

        // ========== PUBLIC API ==========

        /**
         * Connect to WebSocket server
         * @param {string} token - Authentication token
         * @returns {Promise} Resolves when connected and authenticated
         */
        connect(token = null) {
            if (this._state === CONNECTION_STATE.CONNECTED || 
                this._state === CONNECTION_STATE.AUTHENTICATED ||
                this._state === CONNECTION_STATE.RECONNECTING ||
                this._state === CONNECTION_STATE.CONNECTING) {
                return Promise.resolve(this);
            }

            if (token) {
                this._sessionToken = token;
            }

            return new Promise((resolve, reject) => {
                this._connectPromise = { resolve, reject };
                this._connect();
            });
        }

        /**
         * Disconnect from WebSocket server
         */
        disconnect() {
            this._manualDisconnect = true;
            this._clearReconnectTimer();
            this._clearHeartbeatTimer();
            
            if (this._socket) {
                this._socket.close(1000, 'Client disconnect');
                this._socket = null;
            }

            this._state = CONNECTION_STATE.DISCONNECTED;
            this._authenticated = false;
            this._emitStateChange();
        }

        /**
         * Send message through WebSocket
         * @param {string} type - Message type
         * @param {*} payload - Message payload
         * @param {Object} options - Send options
         * @param {boolean} options.expectAck - Wait for acknowledgment
         * @param {number} options.timeout - ACK timeout in ms
         * @param {boolean} options.retry - Retry on failure
         * @returns {Promise} Resolves with acknowledgment if expected
         */
        send(type, payload = {}, options = {}) {
            const messageId = this._generateMessageId();
            const timestamp = Date.now();

            const message = {
                type,
                payload,
                messageId,
                timestamp,
                source: 'client',
                version: '1.0'
            };

            // Add authentication if available
            if (this._authenticated && this._sessionToken) {
                message.token = this._sessionToken;
            }

            this._stats.messagesSent++;

            // If not connected, queue the message
            if (this._state !== CONNECTION_STATE.AUTHENTICATED) {
                return this._queueMessage(message, options);
            }

            // Send immediately
            return this._sendMessage(message, options);
        }

        /**
         * Subscribe to message types
         * @param {string} type - Message type or '*' for all
         * @param {Function} handler - Message handler
         * @param {Object} options - Subscription options
         * @returns {Function} Unsubscribe function
         */
        on(type, handler, options = {}) {
            if (!this._listeners.has(type)) {
                this._listeners.set(type, new Set());
            }

            const handlerWrapper = { handler, options };
            this._listeners.get(type).add(handlerWrapper);

            return () => {
                const listeners = this._listeners.get(type);
                if (listeners) {
                    listeners.delete(handlerWrapper);
                    if (listeners.size === 0) {
                        this._listeners.delete(type);
                    }
                }
            };
        }

        /**
         * Get connection state
         * @returns {string} Current state
         */
        getState() {
            return this._state;
        }

        /**
         * Check if connected and authenticated
         * @returns {boolean} Connection status
         */
        isConnected() {
            return this._state === CONNECTION_STATE.AUTHENTICATED;
        }

        isUserOnline(userId) {
            return this._onlineUsers.has(String(userId));
        }

        sendSignal(signalType, payload = {}, options = {}) {
            this._lastSignalPayload = {
                signalType,
                payload,
                options,
                timestamp: Date.now()
            };

            const signalEventType = payload.eventType ||
                payload.type ||
                signalType ||
                'call:signal';

            return this.send(signalEventType, {
                ...payload,
                signalType
            }, options);
        }

        handleReconnect(meta = {}) {
            if (this._manualDisconnect) {
                this._manualDisconnect = false;
            }

            if (meta && meta.token) {
                this._sessionToken = meta.token;
            }

            this._clearReconnectTimer();
            this._reconnectAttempts = 0;

            if (this._state === CONNECTION_STATE.AUTHENTICATED) {
                return Promise.resolve(this);
            }

            return this.connect(this._sessionToken);
        }

        emit(type, payload = {}, options = {}) {
            return this.send(type, payload, options);
        }

        /**
         * Get connection statistics
         * @returns {Object} Statistics
         */
        getStats() {
            return {
                ...this._stats,
                state: this._state,
                authenticated: this._authenticated,
                reconnectAttempts: this._reconnectAttempts,
                queueSize: this._messageQueue.length,
                pendingAcks: this._pendingMessages.size
            };
        }

        /**
         * Enable/disable debug mode
         * @param {boolean} enabled - Debug state
         */
        setDebug(enabled) {
            SOCKET_CONFIG.debug = enabled;
        }

        // ========== PRIVATE METHODS ==========

        _connect() {
            if (this._socket && 
                (this._socket.readyState === WebSocket.OPEN || 
                 this._socket.readyState === WebSocket.CONNECTING)) {
                return;
            }

            this._state = CONNECTION_STATE.CONNECTING;
            this._emitStateChange();

            try {
                // Build URL with authentication if available
                let url = this._url;
                if (this._sessionToken) {
                    url += `?token=${encodeURIComponent(this._sessionToken)}`;
                }

                this._socket = new WebSocket(url);
                this._socket.onopen = this._onOpen;
                this._socket.onmessage = this._onMessage;
                this._socket.onclose = this._onClose;
                this._socket.onerror = this._onError;

                // Connection timeout
                this._connectionTimeout = setTimeout(() => {
                    if (this._state === CONNECTION_STATE.CONNECTING) {
                        this._onError(new Error('Connection timeout'));
                    }
                }, SOCKET_CONFIG.connectionTimeout);

            } catch (error) {
                this._onError(error);
            }
        }

        _onOpen() {
            clearTimeout(this._connectionTimeout);
            this._reconnectAttempts = 0;
            this._manualDisconnect = false;

            // Check if this is a Socket.IO connection (URL contains /socket.io/)
            const isSocketIO = this._url && this._url.includes('/socket.io/');

            if (isSocketIO) {
                // Socket.IO: do NOT authenticate here — wait for the '0' open packet,
                // then '40' connect-to-namespace packet. Authentication is done in _onMessage.
                this._state = CONNECTION_STATE.CONNECTING;
                this._emitStateChange();
            } else {
                // Raw WebSocket: authenticate immediately
                this._state = CONNECTION_STATE.CONNECTED;
                this._emitStateChange();
                this._authenticated = true;
                this._state = CONNECTION_STATE.AUTHENTICATED;
                this._emitStateChange();
                this._resolveConnectPromise();
                this._processQueue();
                this._startHeartbeat();
            }
        }

        _authenticate() {
            this._state = CONNECTION_STATE.AUTHENTICATING;
            this._emitStateChange();

            const isSocketIO = this._url && this._url.includes('/socket.io/');

            if (isSocketIO) {
                // Socket.IO: emit authenticate event as  42["authenticate",{token}]
                try {
                    if (this._socket && this._socket.readyState === WebSocket.OPEN) {
                        this._socket.send(`42${JSON.stringify(['authenticate', { token: this._sessionToken }])}`);
                    }
                } catch (_) {}
                // Assume authenticated after short delay — most backends don't ACK this
                setTimeout(() => {
                    this._authenticated = true;
                    this._state = CONNECTION_STATE.AUTHENTICATED;
                    this._emitStateChange();
                    this._resolveConnectPromise();
                    this._processQueue();
                }, 300);
                return;
            }

            // Raw WebSocket path: send JSON auth frame
            const authMessage = {
                type: 'AUTHENTICATE',
                payload: { token: this._sessionToken },
                timestamp: Date.now()
            };

            this._sendMessage(authMessage, { expectAck: true, timeout: SOCKET_CONFIG.authTimeout })
                .then(() => {
                    this._authenticated = true;
                    this._state = CONNECTION_STATE.AUTHENTICATED;
                    this._emitStateChange();
                    this._resolveConnectPromise();
                    this._processQueue();
                })
                .catch((error) => {
                    this._stats.errors++;
                    this._onError(error);
                });
        }

        _onMessage(event) {
            try {
                if (typeof event.data !== 'string') return;
                const rawMessage = event.data.trim();
                if (!rawMessage) return;

                // ── Socket.IO protocol handling ──────────────────────────────
                // Socket.IO over raw WebSocket prefixes packets with a numeric code:
                //   0  = open (contains sid/pingInterval)
                //   2  = ping  →  reply with "3" (pong)
                //   3  = pong
                //   40 = connect  →  we are connected; now authenticate
                //   42 = event  →  ["eventName", payload]
                //   41 = disconnect
                if (/^\d/.test(rawMessage)) {
                    const code = rawMessage.match(/^(\d+)/)[1];

                    if (code === '0') {
                        // Open packet — connection established, send connect packet
                        try {
                            const openData = JSON.parse(rawMessage.slice(code.length));
                            this._socketIoPingInterval = openData.pingInterval || 25000;
                        } catch(_) {}
                        // Send Socket.IO connect packet for the default namespace
                        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
                            this._socket.send('40');
                        }
                        return;
                    }

                    if (code === '40') {
                        // Connected to namespace — authenticate
                        this._state = CONNECTION_STATE.CONNECTED;
                        this._emitStateChange();
                        this._startHeartbeat();
                        this._authenticate();
                        return;
                    }

                    if (code === '2') {
                        // Ping from server → reply with pong
                        this._clearHeartbeatTimeout();
                        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
                            this._socket.send('3');
                        }
                        return;
                    }

                    if (code === '3') {
                        // Pong
                        this._clearHeartbeatTimeout();
                        return;
                    }

                    if (code === '41') {
                        // Server disconnected namespace
                        this._onClose({ code: 1000, reason: 'namespace disconnect' });
                        return;
                    }

                    if (code === '42') {
                        // Event packet: 42["eventName", payload]
                        try {
                            const arr = JSON.parse(rawMessage.slice(2));
                            if (Array.isArray(arr) && arr.length >= 1) {
                                const eventName = arr[0];
                                const payload   = arr[1] !== undefined ? arr[1] : {};
                                // Synthesise a message object our router understands
                                const message = {
                                    type:    eventName,
                                    payload: payload,
                                    data:    payload
                                };
                                this._stats.messagesReceived++;
                                this._routeMessage(message);
                                if (window.KynectaEventBus) {
                                    window.KynectaEventBus.emit(`REALTIME_${eventName}`, payload, { async: true });
                                }
                            }
                        } catch(e) {
                            console.error('[Realtime] Socket.IO event parse error:', e);
                        }
                        return;
                    }

                    if (code === '43') {
                        // ACK packet: 43id[...args]
                        try {
                            const arr = JSON.parse(rawMessage.replace(/^43\d*/, ''));
                            if (Array.isArray(arr) && arr[0]) {
                                this._handleAck({ messageId: null, payload: arr[0] });
                            }
                        } catch(_) {}
                        return;
                    }

                    // Unknown numeric prefix — ignore silently
                    return;
                }

                // ── Non–Socket.IO path (raw WebSocket server) ──────────────
                if (rawMessage === 'connected' || rawMessage === 'ping' || rawMessage === 'pong' || rawMessage === 'PONG') {
                    if (rawMessage === 'pong' || rawMessage === 'PONG') this._clearHeartbeatTimeout();
                    return;
                }

                const message = JSON.parse(rawMessage);
                this._stats.messagesReceived++;

                const normalizedType = typeof message.type === 'string' ? message.type.toLowerCase() : '';

                // Handle acknowledgments
                if (message.type === 'ACK' && message.messageId) {
                    this._handleAck(message);
                    return;
                }

                // Handle heartbeat responses
                if (message.type === 'PONG' || normalizedType === 'pong') {
                    this._clearHeartbeatTimeout();
                    return;
                }

                // Handle authentication response
                if (message.type === 'AUTHENTICATED' || normalizedType === 'authenticated' || normalizedType === 'welcome') {
                    this._authenticated = true;
                    this._state = CONNECTION_STATE.AUTHENTICATED;
                    this._emitStateChange();
                    this._resolveConnectPromise();
                    this._processQueue();
                    return;
                }

                // Route to listeners
                this._routeMessage(message);

                // Emit through EventBus if available
                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit(`REALTIME_${message.type}`, message.payload, {
                        async: true
                    });
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
            
            this._socket = null;
            this._authenticated = false;

            // Handle intentional close
            if (event.code === 1000 && this._manualDisconnect) {
                this._state = CONNECTION_STATE.DISCONNECTED;
                this._emitStateChange();
                return;
            }

            // Handle unexpected close - attempt reconnect
            this._state = CONNECTION_STATE.RECONNECTING;
            this._emitStateChange();
            this._scheduleReconnect();
        }

        _onError(error) {
            this._stats.errors++;

            if (this._connectPromise) {
                this._connectPromise.reject(error);
                this._connectPromise = null;
            }

            this._state = CONNECTION_STATE.ERROR;
            this._emitStateChange();

            // Emit error through EventBus
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('REALTIME_ERROR', {
                    error: error.message,
                    timestamp: Date.now()
                });
            }

            // Schedule reconnect if socket exists
            if (this._socket) {
                this._socket.close();
            } else {
                this._scheduleReconnect();
            }
        }

        _sendMessage(message, options = {}) {
            return new Promise((resolve, reject) => {
                if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
                    if (options.retry !== false) {
                        this._queueMessage(message, options);
                        resolve({ queued: true });
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

                } catch (error) {
                    reject(error);
                }
            });
        }

        _queueMessage(message, options) {
            if (this._messageQueue.length >= SOCKET_CONFIG.messageQueueLimit) {
                this._messageQueue.shift(); // Remove oldest
            }

            return new Promise((resolve, reject) => {
                this._messageQueue.push({
                    message,
                    options,
                    resolve,
                    reject,
                    timestamp: Date.now()
                });
                this._stats.queueSize = this._messageQueue.length;
            });
        }

        _processQueue() {
            if (this._state !== CONNECTION_STATE.AUTHENTICATED || 
                this._messageQueue.length === 0) {
                return;
            }

            const queue = [...this._messageQueue];
            this._messageQueue = [];
            this._stats.queueSize = 0;

            queue.forEach(item => {
                this._sendMessage(item.message, item.options)
                    .then(item.resolve)
                    .catch(item.reject);
            });
        }

        _handleAck(message) {
            const pending = this._pendingMessages.get(message.messageId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(message.payload || { success: true });
                this._pendingMessages.delete(message.messageId);
            }
        }

        _routeMessage(message) {
            if (message && message.type === 'message' && message.message && typeof message.message === 'object') {
                const wrappedMessage = {
                    ...message.message,
                    transportMeta: {
                        from: message.from,
                        timestamp: message.timestamp
                    }
                };
                this._routeMessage(wrappedMessage);
            }

            if (message && (message.type === 'PRESENCE_UPDATE' || message.type === 'presence:update' ||
                            message.type === 'user:online' || message.type === 'user:offline')) {
                // FIX: Handle both PRESENCE_UPDATE {payload:{userId,online}} and
                // direct user:online / user:offline {userId} shapes from backend
                let presenceUserId, isOnline;
                if (message.type === 'user:online') {
                    presenceUserId = message.payload?.userId || message.userId;
                    isOnline = true;
                } else if (message.type === 'user:offline') {
                    presenceUserId = message.payload?.userId || message.userId;
                    isOnline = false;
                } else {
                    presenceUserId = message.payload?.userId || message.payload?.id;
                    isOnline = message.payload?.online;
                }
                if (presenceUserId !== undefined && presenceUserId !== null) {
                    if (isOnline) {
                        this._onlineUsers.add(String(presenceUserId));
                    } else {
                        this._onlineUsers.delete(String(presenceUserId));
                    }
                }
            }

            // Route to type-specific listeners
            if (this._listeners.has(message.type)) {
                this._listeners.get(message.type).forEach(({ handler, options }) => {
                    try {
                        handler(message.payload, message);
                    } catch (error) {
                        console.error('[Realtime] Listener error:', error);
                    }
                });
            }

            // Route to wildcard listeners
            if (this._listeners.has('*')) {
                this._listeners.get('*').forEach(({ handler, options }) => {
                    try {
                        handler(message.payload, message);
                    } catch (error) {
                        console.error('[Realtime] Wildcard listener error:', error);
                    }
                });
            }
        }

        _scheduleReconnect() {
            if (this._reconnectAttempts >= SOCKET_CONFIG.reconnectAttempts) {
                this._state = CONNECTION_STATE.ERROR;
                this._emitStateChange();
                return;
            }

            this._clearReconnectTimer();

            const baseDelay = SOCKET_CONFIG.reconnectBaseDelay * 
                Math.pow(1.5, this._reconnectAttempts);
            const jitter = 1 + (Math.random() * 2 - 1) * SOCKET_CONFIG.reconnectJitter;
            const delay = Math.min(baseDelay * jitter, SOCKET_CONFIG.reconnectMaxDelay);

            this._reconnectTimer = setTimeout(() => {
                this._reconnectAttempts++;
                this._stats.reconnections++;
                this._connect();
            }, delay);
        }

        _startHeartbeat() {
            this._clearHeartbeatTimer();

            const interval = this._socketIoPingInterval || SOCKET_CONFIG.heartbeatInterval;
            const isSocketIO = this._url && this._url.includes('/socket.io/');

            this._heartbeatTimer = setInterval(() => {
                if (this._state === CONNECTION_STATE.AUTHENTICATED && this._socket &&
                    this._socket.readyState === WebSocket.OPEN) {
                    this._stats.heartbeats++;

                    if (isSocketIO) {
                        // Socket.IO ping is just "2"
                        try { this._socket.send('2'); } catch(_) {}
                        this._heartbeatTimeoutTimer = setTimeout(() => {
                            this._onError(new Error('Heartbeat timeout'));
                        }, SOCKET_CONFIG.heartbeatTimeout);
                    } else {
                        this._sendMessage({ type: 'ping', timestamp: Date.now() })
                            .then(() => {
                                this._heartbeatTimeoutTimer = setTimeout(() => {
                                    this._onError(new Error('Heartbeat timeout'));
                                }, SOCKET_CONFIG.heartbeatTimeout);
                            })
                            .catch(() => {});
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

        _resolveConnectPromise() {
            if (this._connectPromise) {
                this._connectPromise.resolve(this);
                this._connectPromise = null;
            }
        }

        _setupNetworkMonitoring() {
            window.addEventListener('online', () => {
                if (this._state !== CONNECTION_STATE.AUTHENTICATED) {
                    this._reconnectAttempts = 0;
                    this.handleReconnect({ reason: 'network-online' });
                }
                
                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('NETWORK_ONLINE', { timestamp: Date.now() });
                }
            });

            window.addEventListener('offline', () => {
                this._state = CONNECTION_STATE.DISCONNECTED;
                this._authenticated = false;
                this._emitStateChange();
                
                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('NETWORK_OFFLINE', { timestamp: Date.now() });
                }
            });
        }

        _generateMessageId() {
            return `msg_${Date.now()}_${++this._messageIdCounter}_${Math.random().toString(36).substr(2, 6)}`;
        }

        _emitStateChange() {
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('REALTIME_STATE_CHANGED', {
                    state: this._state,
                    authenticated: this._authenticated,
                    timestamp: Date.now()
                });
            }
        }
    }

    // Initialize singleton
    const realtimeManager = new KynectaRealtimeManager();

    // Expose globally
    window.KynectaRealtime = realtimeManager;
    window.wsService = window.wsService || {
        connect: realtimeManager.connect.bind(realtimeManager),
        disconnect: realtimeManager.disconnect.bind(realtimeManager),
        send: realtimeManager.send.bind(realtimeManager),
        sendSignal: realtimeManager.sendSignal.bind(realtimeManager),
        emit: realtimeManager.emit.bind(realtimeManager),
        on: realtimeManager.on.bind(realtimeManager),
        getState: realtimeManager.getState.bind(realtimeManager),
        isConnected: realtimeManager.isConnected.bind(realtimeManager),
        isUserOnline: realtimeManager.isUserOnline.bind(realtimeManager),
        handleReconnect: realtimeManager.handleReconnect.bind(realtimeManager)
    };

    // Add to authorities if exists
    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.realtime = realtimeManager;
    }

    // FIX: Notify SyncEngine and other modules that KynectaRealtime is now available
    try {
        window.dispatchEvent(new CustomEvent('kyn:realtimeReady', { detail: { manager: realtimeManager } }));
    } catch (e) {}

    console.log('[Realtime] ✅ Ready');
})();