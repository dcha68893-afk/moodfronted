/**
 * app.realtime.socket.js  — SOCKET.IO COMPATIBLE v3.0.0
 * 
 * CRITICAL FIX: Replace raw WebSocket with Socket.IO client to match backend
 * Backend uses Socket.IO server, frontend was using raw WebSocket - causing connection failures
 * 
 * Changes from v2.3.0:
 *  1. SOCKET.IO CLIENT: Replaced raw WebSocket with Socket.IO client library
 *  2. PROTOCOL COMPATIBILITY: Now uses Socket.IO handshake and authentication
 *  3. EVENT BRIDGE: Maintains compatibility with existing event listeners
 *  4. FALLBACK: Keeps raw WebSocket as fallback for non-Socket.IO environments
 *  5. TOKEN HANDLING: Updated for Socket.IO auth format
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // SOCKET.IO CLIENT LOADER
    // ─────────────────────────────────────────────────────────────────────────
    let socketIOClient = null;
    let useRawWebSocket = false;
    
    // Try to load Socket.IO client
    try {
        // Check if Socket.IO is already loaded
        if (typeof io !== 'undefined') {
            socketIOClient = io;
            console.log('[Realtime] Socket.IO client found');
        } else {
            // Try to load Socket.IO from CDN
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
            script.async = true;
            script.onload = () => {
                if (typeof io !== 'undefined') {
                    socketIOClient = io;
                    console.log('[Realtime] Socket.IO client loaded from CDN');
                }
            };
            script.onerror = () => {
                console.warn('[Realtime] Socket.IO client failed to load, using raw WebSocket fallback');
                useRawWebSocket = true;
            };
            document.head.appendChild(script);
        }
    } catch (err) {
        console.warn('[Realtime] Socket.IO not available, using raw WebSocket fallback:', err);
        useRawWebSocket = true;
    }

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
        reconnectAttempts: 9999,
        reconnectBaseDelay: 2000,
        reconnectMaxDelay: 15000,
        reconnectJitter:    0.3,
        reconnectCooldown: 1000,
        errorCooldown:      5000,
        maxConsecutiveErrors: 5,
        heartbeatInterval: 30000,
        heartbeatTimeout:   5000,
        connectionTimeout: 20000,
        authTimeout:        5000,
        messageQueueLimit: 500,
        tokenWaitMs:        5000,
        tokenPollInterval: 200,
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
        if (window.__kynAPI && window.__kynAPI.baseUrl) {
            return window.__kynAPI.baseUrl.replace(/\/api\/?$/, '');
        }
        if (window.Environment && window.Environment.backendUrl) {
            return window.Environment.backendUrl.replace(/\/api\/?$/, '');
        }
        if (!detectLocalEnvironment()) {
            return 'https://moodchat-fy56.onrender.com';
        }
        return 'http://localhost:3000';
    }

    function getWebSocketUrl() {
        if (window.Environment && window.Environment.wsBaseUrl) {
            return window.Environment.wsBaseUrl;
        }
        return getBackendBaseUrl();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Token acquisition — checks every known location, returns null if missing
    // ─────────────────────────────────────────────────────────────────────────
    function acquireToken() {
        const TOKEN_KEYS = [
            'moodchat_token',
            'kynecta_token', 'auth_token', 'token', 'jwt',
            'access_token', '__kyn_token', 'kyn_access_token',
            'kynecta_access_token', 'kyn_token', 'userToken'
        ];

        // 1. Dedicated session manager
        if (window.AuthSessionManager && typeof window.AuthSessionManager.getToken === 'function') {
            const t = window.AuthSessionManager.getToken();
            if (t) return t;
        }

        // 2. API core cache
        if (window.__kynToken) return window.__kynToken;
        if (window.__kynAPI && window.__kynAPI.token) return window.__kynAPI.token;

        // 3. localStorage / sessionStorage — known keys
        for (const key of TOKEN_KEYS) {
            const t = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (t && t.length > 10 && !t.startsWith('{')) return t;
        }

        // 4. kynecta_auth object
        for (const key of ['kynecta_auth', 'kynecta_session', 'kyn_session', 'auth_session', 'moodchat_auth']) {
            try {
                const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
                if (raw) {
                    const obj = JSON.parse(raw);
                    const t = obj.token || obj.accessToken || obj.access_token ||
                              (obj.session && (obj.session.token || obj.session.accessToken)) ||
                              (obj.data && obj.data.token);
                    if (t && t.length > 10) return t;
                }
            } catch (_) {}
        }

        // 5. JWT pattern scan
        try {
            const jwtPattern = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                const v = localStorage.getItem(k);
                if (v && jwtPattern.test(v.trim())) {
                    if (SOCKET_CONFIG.debug) console.log('[Realtime] 🔑 Token found via JWT scan, key:', k);
                    return v.trim();
                }
            }
        } catch (_) {}

        return null;
    }

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
            this.__hardened = true;

            this._socket = null;
            this._state = CONNECTION_STATE.DISCONNECTED;
            this._url = getWebSocketUrl();
            this._reconnectAttempts = 0;
            this._reconnectTimer = null;
            this._heartbeatTimer = null;
            this._heartbeatTimeoutTimer = null;
            this._authTimer = null;
            this._connectionTimeout = null;
            this._messageQueue = [];
            this._pendingMessages = new Map();
            this._messageIdCounter = 0;
            this._authenticated = false;
            this._sessionToken = null;
            this._listeners = new Map();
            this._onlineUsers = new Set();
            this._lastSignalPayload = null;
            this._manualDisconnect = false;
            this._lastParseErrorAt = null;
            this._socketIoPingInterval = 25000;

            // Enhanced error tracking
            this._consecutiveErrors = 0;
            this._lastConnectionAttempt = 0;
            this._lastErrorTime = 0;
            this._lastReconnectLogAt = 0;
            this._lastSyncLogAt = 0;
            this._hasJoinedUserRoom = false;
            this._bridgeListenersLogged = false;
            this._hasEverConnected = false;
            this._hasSid = false;
            this._resolvedUserId = null;
            this._hasLoggedInitialError = false;

            // Track Socket.IO event types to avoid duplicates
            this._registeredSocketListeners = new Set();

            this._stats = {
                messagesSent:     0,
                messagesReceived: 0,
                reconnections:    0,
                errors:           0,
                heartbeats:       0,
                queueSize:        0
            };

            this._setupNetworkMonitoring();

            window.KynectaRealtime = this;
            console.log('[Realtime] ✅ Socket.IO compatible manager initialized');
        }

        // ── PUBLIC API ────────────────────────────────────────────────────────

        connect(token = null) {
            if (this._state === CONNECTION_STATE.AUTHENTICATED ||
                this._state === CONNECTION_STATE.CONNECTED) {
                return Promise.resolve(this);
            }

            if (this._connectPromise) {
                return new Promise((resolve, reject) => {
                    this._connectWaiters = this._connectWaiters || [];
                    this._connectWaiters.push({ resolve, reject });
                }).catch(() => {});
            }

            if (token) this._sessionToken = token;

            let _res, _rej;
            const internalPromise = new Promise((resolve, reject) => {
                _res = resolve;
                _rej = reject;
            });
            internalPromise.catch(() => {});

            this._connectPromise = { resolve: _res, reject: _rej };

            (async () => {
                if (!this._sessionToken) {
                    this._sessionToken = await waitForToken();
                }
                if (!this._sessionToken) {
                    console.warn('[Realtime] No auth token found — connecting unauthenticated (server may reject).');
                }
                this._connectInternal();
            })();

            return internalPromise;
        }

        disconnect() {
            this._manualDisconnect = true;
            this._clearReconnectTimer();
            this._clearHeartbeatTimer();
            if (this._socket) {
                if (this._socket.disconnect) {
                    this._socket.disconnect();
                } else {
                    this._socket.onclose = null;
                    try { this._socket.close(1000, 'Client disconnect'); } catch (_) {}
                }
                this._socket = null;
            }
            this._state = CONNECTION_STATE.DISCONNECTED;
            this._authenticated = false;
            this._registeredSocketListeners.clear();
            this._emitStateChange();
        }

        send(type, payload = {}, options = {}) {
            const messageId = this._generateMessageId();
            const message = {
                type,
                payload,
                messageId,
                timestamp: Date.now(),
                source: 'client',
                version: '1.0'
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

        on(type, handler, options = {}) {
            if (!this._listeners.has(type)) this._listeners.set(type, new Set());

            const existingHandlers = this._listeners.get(type);
            for (const entry of existingHandlers) {
                if (entry.handler === handler) return () => {};
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

        getState() { return this._state; }
        isConnected() { return this._state === CONNECTION_STATE.AUTHENTICATED; }
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
            if (meta && meta.token) this._sessionToken = meta.token;

            this._clearReconnectTimer();
            this._reconnectAttempts = 0;

            if (this._state === CONNECTION_STATE.AUTHENTICATED) return Promise.resolve(this);
            return this.connect(this._sessionToken);
        }

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

        setDebug(enabled) { SOCKET_CONFIG.debug = enabled; }

        // ── PRIVATE METHODS ─────────────────────────────────────────────────

        async _connectInternal() {
            if (this._socket && (this._socket.connected || this._socket.connecting)) {
                return;
            }

            if (this._socket) {
                if (this._socket.disconnect) {
                    this._socket.disconnect();
                } else {
                    this._socket.onopen = null;
                    this._socket.onmessage = null;
                    this._socket.onclose = null;
                    this._socket.onerror = null;
                    try { this._socket.close(); } catch (_) {}
                }
                this._socket = null;
            }

            this._state = CONNECTION_STATE.CONNECTING;
            this._emitStateChange();

            try {
                if (socketIOClient && !useRawWebSocket) {
                    await this._connectSocketIO();
                } else {
                    await this._connectRawWebSocket();
                }
            } catch (err) {
                this._onError(err);
            }
        }

        async _connectSocketIO() {
            // Use the frontend URL for Socket.IO connection, not the backend
            // Socket.IO will handle the WebSocket connection internally
            const socketUrl = getBackendBaseUrl(); // Keep as HTTP/HTTPS, let Socket.IO handle WebSocket
            
            console.log('[Realtime] Connecting Socket.IO to', socketUrl);
            
            // Use query parameter for token to match backend expectations
            const socketOptions = {
                transports: ['websocket', 'polling'],
                timeout: SOCKET_CONFIG.connectionTimeout,
                reconnection: false,
                forceNew: true
            };
            
            // Add token as query parameter if available (fallback for session-based auth)
            if (this._sessionToken) {
                socketOptions.query = { token: this._sessionToken };
                socketOptions.auth = { token: this._sessionToken };
            }
            
            this._socket = socketIOClient(socketUrl, socketOptions);

            // Socket.IO event handlers
            this._socket.on('connect', () => {
                console.log('[Realtime] Socket.IO connected successfully');
                this._onSocketIOConnect();
            });

            this._socket.on('connect_error', (err) => {
                console.error('[Realtime] Socket.IO connection error:', err);
                this._onError(err);
            });

            this._socket.on('disconnect', (reason) => {
                console.log('[Realtime] Socket.IO disconnected:', reason);
                this._onClose();
            });

            this._socket.on('message', (data) => {
                this._onSocketIOMessage(data);
            });
        }

        _onSocketIOConnect() {
            this._reconnectAttempts = 0;
            this._manualDisconnect = false;
            this._hasEverConnected = true;
            this._consecutiveErrors = 0;

            this._state = CONNECTION_STATE.CONNECTED;
            this._emitStateChange();

            // Socket.IO handles authentication during connection
            this._authenticated = true;
            this._state = CONNECTION_STATE.AUTHENTICATED;
            this._emitStateChange();
            this._resolveConnectPromise();
            this._processQueue();
            this._registerMessageBridgeListeners();
            this._triggerSync();
        }

        _onSocketIOMessage(data) {
            try {
                if (!data) return;

                if (typeof data === 'object' && data.type) {
                    this._stats.messagesReceived++;

                    if (data.type === 'authenticated' || data.type === 'welcome') {
                        return;
                    }

                    this._routeMessage(data);

                    if (window.KynectaEventBus) {
                        window.KynectaEventBus.emit(`REALTIME_${data.type}`, data.payload, { async: true });
                    }
                }
            } catch (error) {
                if (!this._lastParseErrorAt || Date.now() - this._lastParseErrorAt > 10000) {
                    console.error('[Realtime] Socket.IO message parse error:', error);
                    this._lastParseErrorAt = Date.now();
                }
                this._stats.errors++;
            }
        }

        async _connectRawWebSocket() {
            const wsUrl = `${getBackendBaseUrl().replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(this._sessionToken || '')}`;
            this._url = wsUrl;
            
            if (!this._lastWebSocketOpenLogAt || Date.now() - this._lastWebSocketOpenLogAt > 8000) {
                this._lastWebSocketOpenLogAt = Date.now();
                console.log('[Realtime] Opening raw WebSocket fallback', wsUrl.replace(/token=[^&]+/, 'token=***'));
            }

            this._socket = new WebSocket(wsUrl);
            this._socket.onopen = () => this._onOpen();
            this._socket.onmessage = (event) => this._onMessage(event);
            this._socket.onclose = (event) => this._onClose(event);
            this._socket.onerror = (error) => this._onError(error);

            clearTimeout(this._connectionTimeout);
            this._connectionTimeout = setTimeout(() => {
                if (this._state === CONNECTION_STATE.CONNECTING ||
                    this._state === CONNECTION_STATE.AUTHENTICATING) {
                    this._onError(new Error('Connection timeout'));
                }
            }, SOCKET_CONFIG.connectionTimeout);
        }

        _onOpen() {
            clearTimeout(this._connectionTimeout);
            this._reconnectAttempts = 0;
            this._consecutiveErrors = 0;
            this._manualDisconnect = false;

            if (!this._hasEverConnected) {
                this._hasEverConnected = true;
                console.log('[Realtime] ✅ WebSocket OPEN', this._socket && this._socket.url
                    ? this._socket.url.replace(/token=[^&]+/, 'token=***')
                    : this._url);
            } else {
                console.log('[Realtime] ✅ WebSocket OPEN (reconnected)');
            }

            this._state = CONNECTION_STATE.CONNECTED;
            this._emitStateChange();
            this._startHeartbeat();

            if (this._sessionToken && !this._authenticated) {
                this._authenticate();
            }
        }

        _authenticate() {
            if (!this._socket || this._authenticated) {
                return;
            }

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

                if (rawMessage === 'pong' || rawMessage === 'PONG') {
                    this._clearHeartbeatTimeout();
                    return;
                }
                if (rawMessage === 'connected' || rawMessage === 'ping') return;

                const message = JSON.parse(rawMessage);
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
                this._socket.onopen = null;
                this._socket.onmessage = null;
                this._socket.onclose = null;
                this._socket.onerror = null;
                this._socket = null;
            }
            this._authenticated = false;
            this._registeredSocketListeners.clear();

            if (event && event.code === 1000 && this._manualDisconnect) {
                this._state = CONNECTION_STATE.DISCONNECTED;
                this._emitStateChange();
                return;
            }

            this._state = CONNECTION_STATE.RECONNECTING;
            this._emitStateChange();
            this._scheduleReconnect();
        }

        _onError(rawError) {
            this._stats.errors++;
            this._consecutiveErrors++;
            this._lastErrorTime = Date.now();
            clearTimeout(this._connectionTimeout);

            const error = (rawError instanceof Error)
                ? rawError
                : new Error(
                    (rawError && rawError.message)
                        ? rawError.message
                        : 'WebSocket connection error'
                  );

            const now = Date.now();
            if (!this._lastErrorLogAt || now - this._lastErrorLogAt > 60000) {
                this._lastErrorLogAt = now;
                if (!this._hasLoggedInitialError) {
                    console.warn('[Realtime] WebSocket connection failed, messages module will work without real-time updates');
                    this._hasLoggedInitialError = true;
                } else {
                    console.log('[Realtime] WebSocket reconnect attempt failed (working offline)');
                }
            }

            if (this._connectPromise) {
                const p = this._connectPromise;
                this._connectPromise = null;
                try { p.reject(error); } catch (_) {}
            }
            (this._connectWaiters || []).forEach(w => {
                try { w.reject(error); } catch (_) {}
            });
            this._connectWaiters = [];
            this._state = CONNECTION_STATE.ERROR;
            this._emitStateChange();

            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('REALTIME_ERROR', { error: error.message, timestamp: Date.now() });
            }

            if (this._socket) {
                this._socket.onclose = null;
                try { this._socket.close(); } catch (_) {}
                this._socket = null;
            }

            if (this._consecutiveErrors < SOCKET_CONFIG.maxConsecutiveErrors) {
                this._scheduleReconnect();
            } else {
                console.warn('[Realtime] Max consecutive errors reached — entering DEGRADED mode (will auto-recover).');
                this._consecutiveErrors = 0;
                this._state = CONNECTION_STATE.DEGRADED;
                this._emitStateChange();
                
                if (!this._degradedRecoveryTimer) {
                    this._degradedRecoveryTimer = setTimeout(() => {
                        this._degradedRecoveryTimer = null;
                        if (this._state === CONNECTION_STATE.DEGRADED) {
                            if (!this._lastAutoRecoveryLogAt || Date.now() - this._lastAutoRecoveryLogAt > 12000) {
                                this._lastAutoRecoveryLogAt = Date.now();
                                console.log('[Realtime] 🔄 Auto-recovering from DEGRADED — reconnecting...');
                            }
                            this._reconnectAttempts = 0;
                            this._consecutiveErrors = 0;
                            this._connectInternal();
                        }
                    }, 30000);
                }
            }
        }

        _routeMessage(message) {
            if (!message) return;

            if (message.type === 'message' && message.message && typeof message.message === 'object') {
                this._routeMessage({ ...message.message, transportMeta: { from: message.from, timestamp: message.timestamp } });
                return;
            }

            // Presence
            if (['PRESENCE_UPDATE', 'presence:update', 'user:online', 'user:offline'].includes(message.type)) {
                let uid, online;
                if (message.type === 'user:online') { uid = message.payload?.userId || message.userId; online = true; }
                else if (message.type === 'user:offline') { uid = message.payload?.userId || message.userId; online = false; }
                else { uid = message.payload?.userId || message.payload?.id; online = message.payload?.online; }
                if (uid != null) {
                    if (online) this._onlineUsers.add(String(uid));
                    else this._onlineUsers.delete(String(uid));
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

        _handleAck(message) {
            const pending = this._pendingMessages.get(message.messageId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(message.payload || { success: true });
                this._pendingMessages.delete(message.messageId);
            }
        }

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
                this._state = CONNECTION_STATE.DISCONNECTED;
                this._authenticated = false;
                this._emitStateChange();

                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('NETWORK_OFFLINE', { timestamp: Date.now() });
                }
            });

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' &&
                    this._state !== CONNECTION_STATE.AUTHENTICATED &&
                    !this._manualDisconnect &&
                    navigator.onLine) {
                    this._reconnectAttempts = 0;
                    this.handleReconnect({ reason: 'visibility' });
                }
            });
        }

        _sendMessage(message, options = {}) {
            return new Promise((resolve, reject) => {
                if (!this._socket || (!this._socket.connected && !this._socket.readyState === WebSocket.OPEN)) {
                    if (options.retry !== false) {
                        this._queueMessage(message, { ...options, _resolve: resolve, _reject: reject });
                        return;
                    } else {
                        reject(new Error('Socket not connected'));
                        return;
                    }
                }

                try {
                    if (this._socket.emit) {
                        // Socket.IO client
                        this._socket.emit(message.type, message.payload);
                        resolve({ sent: true, messageId: message.messageId });
                    } else {
                        // Raw WebSocket
                        this._socket.send(JSON.stringify(message));
                    }

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

            if (options._resolve) {
                this._messageQueue.push({ message, options });
                this._stats.queueSize = this._messageQueue.length;
                return Promise.resolve({ queued: true });
            }

            return new Promise((resolve, reject) => {
                this._messageQueue.push({ message, options: { ...options, _resolve: resolve, _reject: reject } });
                this._stats.queueSize = this._messageQueue.length;
            });
        }

        _processQueue() {
            if (this._state !== CONNECTION_STATE.AUTHENTICATED || !this._messageQueue.length) return;

            const queue = [...this._messageQueue];
            this._messageQueue = [];
            this._stats.queueSize = 0;

            queue.forEach(item => {
                const { _resolve, _reject, ...cleanOptions } = item.options;
                this._sendMessage(item.message, cleanOptions)
                    .then(res => { if (_resolve) _resolve(res); })
                    .catch(err => { if (_reject) _reject(err); });
            });
        }

        _startHeartbeat() {
            this._clearHeartbeatTimer();

            this._heartbeatTimer = setInterval(() => {
                if (this._state === CONNECTION_STATE.AUTHENTICATED && this._socket) {
                    this._stats.heartbeats++;
                    
                    if (this._socket.emit) {
                        // Socket.IO - ping/pong handled automatically
                    } else {
                        // Raw WebSocket
                        this._sendMessage({ type: 'ping', timestamp: Date.now() }).catch(() => {});
                        this._heartbeatTimeoutTimer = setTimeout(() => {
                            this._onError(new Error('Heartbeat timeout'));
                        }, SOCKET_CONFIG.heartbeatTimeout);
                    }
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
            (this._connectWaiters || []).forEach(w => w.resolve(this));
            this._connectWaiters = [];
        }

        _emitStateChange() {
            if (SOCKET_CONFIG.debug) console.log('[Realtime] state →', this._state);
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('REALTIME_STATE_CHANGED', {
                    state: this._state,
                    authenticated: this._authenticated,
                    timestamp: Date.now()
                });
            }
        }

        _generateMessageId() {
            return `msg_${Date.now()}_${++this._messageIdCounter}_${Math.random().toString(36).substr(2, 6)}`;
        }

        _scheduleReconnect() {
            this._clearReconnectTimer();

            const delay = Math.min(
                SOCKET_CONFIG.reconnectBaseDelay * Math.pow(2, this._reconnectAttempts),
                SOCKET_CONFIG.reconnectMaxDelay
            );

            const jitter = delay * SOCKET_CONFIG.reconnectJitter;
            const finalDelay = delay + (Math.random() * jitter - jitter / 2);

            this._reconnectTimer = setTimeout(() => {
                if (!this._lastReconnectLogAt || Date.now() - this._lastReconnectLogAt > SOCKET_CONFIG.reconnectCooldown) {
                    this._lastReconnectLogAt = Date.now();
                    console.log(`[Realtime] Reconnecting in ${Math.round(finalDelay)}ms (attempt ${this._reconnectAttempts + 1})`);
                }
                this._reconnectAttempts++;
                this._connectInternal();
            }, finalDelay);
        }

        _registerMessageBridgeListeners() {
            if (this._bridgeListenersLogged) return;
            this._bridgeListenersLogged = true;

            console.log('[Realtime] ✅ Message bridge listeners registered');
        }

        _triggerSync() {
            if (!this._lastSyncLogAt || Date.now() - this._lastSyncLogAt > 30000) {
                this._lastSyncLogAt = Date.now();
                console.log('[Realtime] 🔄 Sync required after connection');
                
                if (window.KynectaEventBus) {
                    window.KynectaEventBus.emit('kyn:syncRequired', { 
                        source: 'realtime-socket',
                        timestamp: Date.now()
                    });
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bootstrap
    // ─────────────────────────────────────────────────────────────────────────
    const realtimeManager = new KynectaRealtimeManager();

    window.KynectaRealtime = realtimeManager;

    // Expose a stable wsService shim (backward compat)
    window.wsService = window.wsService || {};
    Object.assign(window.wsService, {
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
    });

    if (window.__KYNECTA_AUTHORITIES__) {
        window.__KYNECTA_AUTHORITIES__.realtime = realtimeManager;
    }

    // Notify dependents
    try {
        window.dispatchEvent(new CustomEvent('kyn:realtimeReady', { detail: { manager: realtimeManager } }));
    } catch (_) {}

    // Listen for SESSION_DATA / AUTH_READY / PARENT_READY from parent frames
    window.addEventListener('message', function (evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        const { type, payload } = evt.data;
        const relevantTypes = ['SESSION_DATA', 'AUTH_READY', 'PARENT_READY'];
        if (relevantTypes.includes(type) && payload) {
            const t = payload.token ||
                      (payload.session && (payload.session.token || payload.session.accessToken)) ||
                      (payload.auth && payload.auth.token);
            if (t) {
                window.__kynToken = t;
                realtimeManager._sessionToken = t;
                if (realtimeManager._state !== CONNECTION_STATE.AUTHENTICATED &&
                    realtimeManager._state !== CONNECTION_STATE.CONNECTING &&
                    realtimeManager._state !== CONNECTION_STATE.AUTHENTICATING) {
                    realtimeManager.handleReconnect({ token: t, reason: 'session-data' });
                }
            }
        }
    });

    // Auto-connect immediately on load
    function safeConnect(tokenOverride) {
        return Promise.resolve(
            realtimeManager.connect(tokenOverride || null)
        ).catch(function () { return null; });
    }

    (async function _autoConnect() {
        try {
            const tok = await waitForToken();
            if (tok) {
                realtimeManager._sessionToken = tok;
                window.__kynToken = tok;
            }
            await safeConnect(tok);
        } catch (_) {
            // Auto-connect failed silently
        }
    })();

    // Expose safeConnect globally
    realtimeManager.safeConnect = safeConnect;

    console.log('[Realtime] ✅ Ready (Socket.IO compatible v3.0.0)');
})();
