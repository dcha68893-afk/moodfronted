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
    function getWebSocketUrl() {
        if (window.Environment && window.Environment.wsBaseUrl) {
            return window.Environment.wsBaseUrl;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/ws`;
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
            
            this._state = CONNECTION_STATE.CONNECTED;
            this._reconnectAttempts = 0;
            this._manualDisconnect = false;
            this._emitStateChange();

            // The backend WS server authenticates via connection context/querystring
            // and does not ACK a dedicated AUTHENTICATE frame.
            this._authenticated = true;
            this._state = CONNECTION_STATE.AUTHENTICATED;
            this._emitStateChange();
            this._resolveConnectPromise();
            this._processQueue();

            // Start heartbeat
            this._startHeartbeat();
        }

        _authenticate() {
            this._state = CONNECTION_STATE.AUTHENTICATING;
            this._emitStateChange();

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

            this._heartbeatTimer = setInterval(() => {
                if (this._state === CONNECTION_STATE.AUTHENTICATED && this._socket) {
                    this._stats.heartbeats++;
                    
                    this._sendMessage({ type: 'ping', timestamp: Date.now() })
                        .then(() => {
                            this._heartbeatTimeoutTimer = setTimeout(() => {
                                this._onError(new Error('Heartbeat timeout'));
                            }, SOCKET_CONFIG.heartbeatTimeout);
                        })
                        .catch(() => {});
                }
            }, SOCKET_CONFIG.heartbeatInterval);
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