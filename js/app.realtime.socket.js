/**
 * app.realtime.socket.js — RAW WEBSOCKET FIRST v3.2.0
 *
 * FIXES IN THIS VERSION:
 *  1. acquireToken() now checks window.__kynToken FIRST (set immediately after login)
 *  2. kynecta_auth parsing now tolerates missing issuedAt (schema mismatch guard)
 *  3. Added pre-connect token debug log so you can confirm token is present
 *  4. Token passed in BOTH auth.token AND query.token for max compatibility
 *  5. Reconnect loop prevention: auth errors don't auto-reconnect (avoids spam)
 */

(function () {
    'use strict';

    // ── Socket.IO client loader ───────────────────────────────────────────────
    let socketIOClient = null;
    let useRawWebSocket = true;

    // ── Singleton guard ───────────────────────────────────────────────────────
    if (window.KynectaRealtime && window.KynectaRealtime.__hardened) {
        console.log('[Realtime] Already initialized — skipping duplicate script load.');
        return;
    }

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

    const SOCKET_CONFIG = {
        reconnectAttempts:    15,
        reconnectBaseDelay:   3000,
        reconnectMaxDelay:    30000,
        reconnectJitter:      0.3,
        errorCooldown:        5000,
        maxConsecutiveErrors: 5,
        heartbeatInterval:    30000,
        heartbeatTimeout:     5000,
        connectionTimeout:    20000,
        authTimeout:          5000,
        messageQueueLimit:    500,
        tokenWaitMs:          10000,
        tokenPollInterval:    200,
        debug:                false
    };

    function detectLocalEnvironment() {
        const h = window.location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.');
    }

    function getBackendBaseUrl() {
        if (window.__kynAPI && window.__kynAPI.baseUrl) {
            return window.__kynAPI.baseUrl.replace(/\/api\/?$/, '');
        }
        if (window.BACKEND_URL) {
            return String(window.BACKEND_URL).replace(/\/api\/?$/, '').replace(/\/+$/, '');
        }
        if (window.Environment && window.Environment.backendUrl) {
            return window.Environment.backendUrl.replace(/\/api\/?$/, '');
        }
        if (typeof window.__getApiOrigin === 'function') {
            const origin = window.__getApiOrigin();
            if (origin) return String(origin).replace(/\/+$/, '');
        }
        if (!detectLocalEnvironment()) {
            return 'https://moodchat-fy56.onrender.com';
        }
        return 'http://localhost:3000';
    }

    // ── FIX #1: Token acquisition — check globals FIRST (set right after login) ──
    function acquireToken() {
        const TOKEN_KEYS = [
            'moodchat_token', 'kynecta_token', 'auth_token', 'token', 'jwt',
            'access_token', '__kyn_token', 'kyn_access_token',
            'kynecta_access_token', 'kyn_token', 'userToken', 'accessToken',
            'authToken', 'USER_TOKEN'
        ];

        // ── Priority 1: window globals (set immediately after login response) ─
        if (window.__kynToken && window.__kynToken.length > 10) return window.__kynToken;
        if (window.__accessToken && window.__accessToken.length > 10) return window.__accessToken;
        if (window.accessToken && typeof window.accessToken === 'string' && window.accessToken.length > 10) return window.accessToken;
        if (window.__userToken && window.__userToken.length > 10) return window.__userToken;
        if (window.__kynAPI && window.__kynAPI.token) return window.__kynAPI.token;

        // ── Priority 2: AuthSessionManager ───────────────────────────────────
        if (window.AuthSessionManager && typeof window.AuthSessionManager.getToken === 'function') {
            const t = window.AuthSessionManager.getToken();
            if (t && t.length > 10) return t;
        }

        // ── Priority 3: Flat localStorage / sessionStorage keys ───────────────
        for (const key of TOKEN_KEYS) {
            const t = localStorage.getItem(key) || sessionStorage.getItem(key);
            if (t && t.length > 10 && !t.startsWith('{')) return t;
        }

        // ── Priority 4: kynecta_auth object (FIX: tolerant parse) ────────────
        for (const key of ['kynecta_auth', 'kynecta_session', 'kyn_session', 'auth_session', 'moodchat_auth']) {
            try {
                const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
                if (!raw) continue;
                const obj = JSON.parse(raw);
                // FIX: extract token regardless of schema validity
                const t = obj.token || obj.accessToken || obj.access_token ||
                          (obj.session && (obj.session.token || obj.session.accessToken)) ||
                          (obj.data && obj.data.token);
                if (t && t.length > 10) return t;
            } catch (_) {}
        }

        // ── Priority 5: JWT pattern scan ──────────────────────────────────────
        try {
            const jwtPattern = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                const v = localStorage.getItem(k);
                if (v && jwtPattern.test(v.trim())) {
                    if (SOCKET_CONFIG.debug) console.log('[Realtime] Token found via JWT scan, key:', k);
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

    // ── Main manager class ────────────────────────────────────────────────────
    class KynectaRealtimeManager {
        constructor() {
            this.__hardened = true;

            this._socket = null;
            this._state = CONNECTION_STATE.DISCONNECTED;
            this._url = getBackendBaseUrl();
            this._reconnectAttempts = 0;
            this._reconnectTimer = null;
            this._heartbeatTimer = null;
            this._heartbeatTimeoutTimer = null;
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

            this._consecutiveErrors = 0;
            this._lastConnectionAttempt = 0;
            this._lastErrorTime = 0;
            this._lastReconnectLogAt = 0;
            this._hasJoinedUserRoom = false;
            this._bridgeListenersLogged = false;
            this._hasEverConnected = false;
            this._hasLoggedInitialError = false;
            this._registeredSocketListeners = new Set();

            this._stats = {
                messagesSent: 0,
                messagesReceived: 0,
                reconnections: 0,
                errors: 0,
                heartbeats: 0,
                queueSize: 0
            };

            this._setupNetworkMonitoring();

            window.KynectaRealtime = this;
            console.log('[Realtime] ✅ Socket.IO compatible manager initialized (v3.1.0)');
        }

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

                // ── FIX #3: Debug log before connection ───────────────────────
                if (this._sessionToken) {
                    console.log('[Realtime] 🔑 Connecting with token (first 20 chars):',
                        this._sessionToken.substring(0, 20) + '...',
                        'length:', this._sessionToken.length);
                } else {
                    console.warn('[Realtime] ⚠️ No auth token found — server will likely reject connection');
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
            this._bridgeListenersLogged = false;
            this._hasSyncedThisConnection = false;
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
        emit(type, payload = {}, options = {}) { return this.send(type, payload, options); }

        sendSignal(signalType, payload = {}, options = {}) {
            this._lastSignalPayload = { signalType, payload, options, timestamp: Date.now() };
            const eventType = payload.eventType || payload.type || signalType || 'call:signal';
            return this.send(eventType, { ...payload, signalType }, options);
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

        // ── Private methods ────────────────────────────────────────────────────

        async _connectInternal() {
            if (this._socket && (this._socket.connected || this._socket.connecting)) return;

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
            const socketUrl = getBackendBaseUrl();

            if (!this._hasEverConnected || this._reconnectAttempts === 0 || this._reconnectAttempts % 5 === 0) {
                console.log('[Realtime] Connecting Socket.IO to', socketUrl);
            }

            const socketOptions = {
                transports: ['websocket', 'polling'],
                timeout: SOCKET_CONFIG.connectionTimeout,
                reconnection: false  // we manage reconnection ourselves
            };

            // ── FIX #4: Pass token in BOTH auth and query for max compatibility ──
            if (this._sessionToken) {
                socketOptions.auth = { token: this._sessionToken };
                socketOptions.query = { token: this._sessionToken };
            } else {
                console.warn('[Realtime] Connecting WITHOUT token — expect auth/token-missing error');
            }

            this._socket = socketIOClient(socketUrl, socketOptions);

            this._lastConnectLogState = this._lastConnectLogState || 'disconnected';

            this._socket.on('connect', () => {
                if (this._lastConnectLogState !== 'connected') {
                    console.log('[Realtime] ✅ Socket.IO connected successfully, sid:', this._socket.id);
                    this._lastConnectLogState = 'connected';
                }
                this._onSocketIOConnect();
            });

            this._socket.on('connect_error', (err) => {
                const now = Date.now();
                const msg = err.message || String(err);

                // ── FIX #5: Don't loop on auth errors — they won't fix themselves ──
                const isAuthError = msg.includes('auth/') || msg.includes('invalid-token') ||
                                    msg.includes('token-missing') || msg.includes('Authentication');
                if (isAuthError) {
                    console.error('[Realtime] ❌ Auth error from server:', msg);
                    console.error('[Realtime] ⚠️  Token in use:', this._sessionToken
                        ? this._sessionToken.substring(0, 30) + '...'
                        : 'NONE');
                    console.error('[Realtime] Fix: ensure JWT_ACCESS_SECRET matches between token signing and verification');

                    // Don't keep reconnecting for auth errors — it won't help
                    this._state = CONNECTION_STATE.ERROR;
                    this._emitStateChange();

                    if (this._connectPromise) {
                        const p = this._connectPromise;
                        this._connectPromise = null;
                        try { p.reject(err); } catch (_) {}
                    }
                    return; // no reconnect for auth errors
                }

                if (!this._lastConnectErrLogAt || now - this._lastConnectErrLogAt > 60000) {
                    this._lastConnectErrLogAt = now;
                    console.error('[Realtime] Socket.IO connection error:', msg);
                }
                this._onError(err);
            });

            this._socket.on('disconnect', (reason) => {
                if (this._lastConnectLogState !== 'disconnected') {
                    console.log('[Realtime] Socket.IO disconnected:', reason);
                    this._lastConnectLogState = 'disconnected';
                }
                // Don't reconnect on server-forced auth disconnects
                if (reason === 'io server disconnect') {
                    console.warn('[Realtime] Server forcefully disconnected — likely auth issue, not reconnecting');
                    this._state = CONNECTION_STATE.ERROR;
                    this._authenticated = false;
                    this._emitStateChange();
                    return;
                }
                this._onClose();
            });

            this._socket.on('message', (data) => {
                this._onSocketIOMessage(data);
            });

            this._socket.on('authenticated', (data) => {
                console.log('[Realtime] ✅ Server confirmed authentication:', data);
            });
        }

        _onSocketIOConnect() {
            this._reconnectAttempts = 0;
            this._manualDisconnect = false;
            this._hasEverConnected = true;
            this._consecutiveErrors = 0;

            this._state = CONNECTION_STATE.CONNECTED;
            this._emitStateChange();

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

                    if (data.type === 'authenticated' || data.type === 'welcome') return;

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
                console.log('[Realtime] ✅ WebSocket OPEN');
            }

            this._state = CONNECTION_STATE.CONNECTED;
            this._emitStateChange();
            this._startHeartbeat();

            if (this._sessionToken && !this._authenticated) {
                this._authenticate();
            }
        }

        _authenticate() {
            if (!this._socket || this._authenticated) return;

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
            this._bridgeListenersLogged = false;
            this._hasSyncedThisConnection = false;

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
                : new Error((rawError && rawError.message) ? rawError.message : 'WebSocket connection error');

            const now = Date.now();
            if (!this._lastErrorLogAt || now - this._lastErrorLogAt > 60000) {
                this._lastErrorLogAt = now;
                if (!this._hasLoggedInitialError) {
                    console.warn('[Realtime] WebSocket connection failed, working without real-time updates');
                    this._hasLoggedInitialError = true;
                }
            }

            if (this._connectPromise) {
                const p = this._connectPromise;
                this._connectPromise = null;
                try { p.reject(error); } catch (_) {}
            }
            (this._connectWaiters || []).forEach(w => { try { w.reject(error); } catch (_) {} });
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
                console.warn('[Realtime] Max consecutive errors reached — entering DEGRADED mode');
                this._consecutiveErrors = 0;
                this._state = CONNECTION_STATE.DEGRADED;
                this._emitStateChange();

                if (!this._degradedRecoveryTimer) {
                    this._degradedRecoveryTimer = setTimeout(() => {
                        this._degradedRecoveryTimer = null;
                        if (this._state === CONNECTION_STATE.DEGRADED) {
                            console.log('[Realtime] Auto-recovering from DEGRADED...');
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

            if (this._listeners.has(message.type)) {
                this._listeners.get(message.type).forEach(({ handler }) => {
                    try { handler(message.payload, message); } catch (e) { console.error('[Realtime] Listener error:', e); }
                });
            }

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
                console.log('[Realtime] Network online — triggering reconnect.');
                this._reconnectAttempts = 0;
                this.handleReconnect({ reason: 'network-online' });
                if (window.KynectaEventBus) window.KynectaEventBus.emit('NETWORK_ONLINE', { timestamp: Date.now() });
            });

            window.addEventListener('offline', () => {
                console.warn('[Realtime] Network offline.');
                this._state = CONNECTION_STATE.DISCONNECTED;
                this._authenticated = false;
                this._emitStateChange();
                if (window.KynectaEventBus) window.KynectaEventBus.emit('NETWORK_OFFLINE', { timestamp: Date.now() });
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
                        this._socket.emit(message.type, message.payload);
                        resolve({ sent: true, messageId: message.messageId });
                    } else {
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
                    if (!this._socket.emit) {
                        this._sendMessage({ type: 'ping', timestamp: Date.now() }).catch(() => {});
                        this._heartbeatTimeoutTimer = setTimeout(() => {
                            this._onError(new Error('Heartbeat timeout'));
                        }, SOCKET_CONFIG.heartbeatTimeout);
                    }
                    // Socket.IO handles ping/pong automatically
                }
            }, SOCKET_CONFIG.heartbeatInterval);
        }

        _clearHeartbeatTimer() {
            if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
            this._clearHeartbeatTimeout();
        }

        _clearHeartbeatTimeout() {
            if (this._heartbeatTimeoutTimer) { clearTimeout(this._heartbeatTimeoutTimer); this._heartbeatTimeoutTimer = null; }
        }

        _clearReconnectTimer() {
            if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
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
            if (this._reconnectAttempts >= SOCKET_CONFIG.reconnectAttempts) {
                console.warn('[Realtime] Max reconnect attempts reached — stopping');
                this._state = CONNECTION_STATE.DEGRADED;
                this._emitStateChange();
                return;
            }

            this._clearReconnectTimer();

            const delay = Math.min(
                SOCKET_CONFIG.reconnectBaseDelay * Math.pow(2, this._reconnectAttempts),
                SOCKET_CONFIG.reconnectMaxDelay
            );
            const jitter = delay * SOCKET_CONFIG.reconnectJitter;
            const finalDelay = delay + (Math.random() * jitter - jitter / 2);

            const attemptNum = this._reconnectAttempts + 1;
            if (attemptNum === 1 || attemptNum % 5 === 0) {
                console.log(`[Realtime] Reconnecting in ${Math.round(finalDelay)}ms (attempt ${attemptNum}/${SOCKET_CONFIG.reconnectAttempts})`);
            }

            this._reconnectTimer = setTimeout(() => {
                this._reconnectAttempts++;
                this._connectInternal();
            }, finalDelay);
        }

        _registerMessageBridgeListeners() {
            this._bridgeListenersLogged = true;

            const messageEvents = [
                'message:new', 'new_message', 'chat:message', 'MESSAGE_RECEIVED',
                'message:delivered', 'message:read', 'message_delivered', 'message_read',
            ];

            const callEvents = [
                'call:incoming', 'call_incoming', 'incoming_call', 'CALL_INCOMING',
                'call:accepted', 'call_accepted', 'call:answered', 'call_answered',
                'call:rejected', 'call_rejected',
                'call:ended', 'call_ended', 'call_force_ended',
                'call:cancelled', 'call_cancelled',
                'call:initiated', 'call_initiated',
                'webrtc:signal', 'webrtc_signal',
                'call:ringing', 'call_ringing',
            ];

            // FIX: friend events were missing — without these the socket never
            // forwards friend:accepted / friend:request to the iframe bridge,
            // so the sender's client never knew their request was accepted.
            const friendEvents = [
                'friend:accepted',   // receiver accepted sender's request  (both users)
                'friend:request',    // new incoming friend request received
                'friend:rejected',   // request was rejected / cancelled
                'friend:removed',    // a friend unfriended the current user
                'friend:blocked',    // current user was blocked
                'friend:online',     // a friend came online
                'friend:offline',    // a friend went offline
            ];

            const allEvents = [...messageEvents, ...callEvents, ...friendEvents];

            if (this._socket && typeof this._socket.on === 'function') {
                allEvents.forEach(eventType => {
                    if (this._registeredSocketListeners.has(eventType)) return;
                    this._registeredSocketListeners.add(eventType);

                    this._socket.on(eventType, (payload) => {
                        // FIX: Always use eventType (e.g. 'message:new') as the routing key.
                        // The old code used payload.type when present — but for chat messages
                        // payload.type is the CONTENT type ('text', 'audio', 'image'), NOT
                        // the socket event name. This caused _routeMessage to route under 'text'
                        // instead of 'message:new', so the wildcard sent REALTIME_EVENT:text
                        // to iframes — which messages-core.js has no listener for.
                        const msg = {
                            type: eventType,
                            payload: (payload && typeof payload === 'object') ? payload : { data: payload }
                        };

                        this._routeMessage(msg);

                        if (window.KynectaEventBus) {
                            window.KynectaEventBus.emit(`REALTIME_${eventType}`, payload, { async: true });
                        }
                    });
                });

                console.log('[Realtime] ✅ Message bridge listeners registered');
            }
        }

        _triggerSync() {
            if (this._hasSyncedThisConnection) return;
            this._hasSyncedThisConnection = true;

            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('kyn:syncRequired', {
                    source: 'realtime-socket',
                    timestamp: Date.now()
                });
            }
        }
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────
    const realtimeManager = new KynectaRealtimeManager();

    window.KynectaRealtime = realtimeManager;

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

    try {
        window.dispatchEvent(new CustomEvent('kyn:realtimeReady', { detail: { manager: realtimeManager } }));
    } catch (_) {}

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

    function safeConnect(tokenOverride) {
        return Promise.resolve(
            realtimeManager.connect(tokenOverride || null)
        ).catch(function () { return null; });
    }

    function waitForSocketIO() {
        return new Promise((resolve) => {
            if (socketIOClient) { resolve(); return; }
            const deadline = Date.now() + 3000;
            const iv = setInterval(() => {
                if (socketIOClient || Date.now() >= deadline) {
                    clearInterval(iv);
                    resolve();
                }
            }, 50);
        });
    }

    // ── IFRAME GUARD: Only the TOP frame opens a Socket.IO connection ────────
    // When this script runs inside an iframe (message.html, calls.html, etc.),
    // it must NOT open its own Socket.IO connection. Multiple connections for the
    // same userId trigger _handleDuplicateSession on the server, which boots all
    // prior sockets with "io server disconnect" — causing the connect → auth →
    // immediate disconnect loop visible in the console.
    //
    // Instead, iframes receive real-time events forwarded by the parent frame via
    // the existing kyn:* postMessage bridge installed in chat.html. The
    // KynectaRealtime object is still created so modules can call .on()/.send()
    // without errors — send() will route through the parent via postMessage.
    const _isInIframe = (() => {
        try { return window.self !== window.top; } catch (_) { return true; }
    })();

    (async function _autoConnect() {
        if (_isInIframe) {
            // ── CHILD FRAME: skip direct connection, proxy through parent ──────
            console.log('[Realtime] Running in iframe — skipping direct Socket.IO connection, using parent bridge');

            // Mark the manager as using bridge mode so .send() routes via postMessage
            realtimeManager._isBridgeMode = true;

            // Override send() to forward to parent frame instead of a local socket
            const _originalSend = realtimeManager.send.bind(realtimeManager);
            realtimeManager.send = function (type, payload = {}, options = {}) {
                try {
                    window.parent.postMessage({
                        type: 'REALTIME_SEND',
                        eventType: type,
                        payload,
                        source: 'child-frame'
                    }, '*');
                } catch (_) {}
                return Promise.resolve();
            };
            realtimeManager.emit = realtimeManager.send;

            // Listen for real-time events forwarded by parent (kyn:* bridge)
            window.addEventListener('message', function (evt) {
                if (!evt.data || typeof evt.data !== 'object') return;
                const { type, payload } = evt.data;
                if (type && type.startsWith('REALTIME_EVENT:')) {
                    // Strip the REALTIME_EVENT: prefix to get the original socket event name.
                    // e.g. 'REALTIME_EVENT:message:new' → 'message:new'
                    const eventType = type.slice('REALTIME_EVENT:'.length);
                    if (!eventType) return;
                    const msg = { type: eventType, payload: payload || {} };
                    realtimeManager._routeMessage(msg);
                    if (window.KynectaEventBus) {
                        window.KynectaEventBus.emit(`REALTIME_${eventType}`, payload, { async: true });
                    }
                }
            });

            // Reflect connection state as AUTHENTICATED so modules don't block on it
            // (actual auth is held by the parent — iframes just trust the session token)
            const tok = await waitForToken();
            if (tok) {
                realtimeManager._sessionToken = tok;
                window.__kynToken = tok;
            }
            realtimeManager._state = CONNECTION_STATE.AUTHENTICATED;
            realtimeManager._authenticated = true;
            realtimeManager._emitStateChange();
            return;
        }

        // ── TOP FRAME: normal connection ─────────────────────────────────────
        try {
            await waitForSocketIO();
            const tok = await waitForToken();
            if (tok) {
                realtimeManager._sessionToken = tok;
                window.__kynToken = tok;
            }
            await safeConnect(tok);
        } catch (_) {}
    })();

    // ── TOP FRAME: forward received socket events to all child iframes ────────
    // This is the other half of the bridge — when a real-time event arrives at
    // the parent socket, we forward it to each iframe so their KynectaRealtime
    // instances can dispatch it to local listeners (.on() handlers).
    //
    // FIX: The on() handler signature is (payload, fullMessage). The old code used
    // `msg.type` where msg was the *payload* — which for chat messages has type='text'
    // (the content type), producing REALTIME_EVENT:text and REALTIME_EVENT:undefined.
    // We now use the second argument (fullMessage) to get the correct socket event name.
    // We also skip message types that chat.html's _fwdNewMessage already forwards
    // via wsService.on() to avoid double-delivery at the iframe.
    if (!_isInIframe) {
        // These are handled directly by chat.html's wsService.on() bridge — skip here
        // to prevent duplicate postMessages to the messages iframe.
        const _SKIP_WILDCARD = new Set([
            'message:new', 'new_message', 'newMessage', 'chat:message',
            'message:sent', 'message_sent',
            'message:delivered', 'message_delivered',
            'message:read', 'message_read'
        ]);

        realtimeManager.on('*', function (payload, fullMessage) {
            try {
                // fullMessage is the full {type, payload} object from _routeMessage.
                // payload is just fullMessage.payload — use fullMessage for the type.
                const eventType = (fullMessage && fullMessage.type) ? fullMessage.type : null;
                if (!eventType) return; // can't route without a type
                if (_SKIP_WILDCARD.has(eventType)) return; // already forwarded by chat.html wsService bridge

                const iframes = document.querySelectorAll('iframe');

                // FIX: for friend:accepted we must send TWO postMessages to iframes:
                //  1. REALTIME_EVENT:friend:accepted  — so any direct listener gets it
                //  2. REALTIME_EVENT:FRIEND_REQUEST_ACCEPTED — the exact type that
                //     friend-core.js's FRIEND_REQUEST_ACCEPTED handler listens for,
                //     so the SENDER's client updates its local store and friend list.
                //
                //  The server (friendController.js) already emits friend:accepted to
                //  user:${originalRequesterId} with { requestId, friendId, user }.
                //  We just need to make sure the iframe sees both event name forms.
                if (eventType === 'friend:accepted') {
                    const msgs = [
                        { type: 'REALTIME_EVENT:friend:accepted',           payload: payload || {} },
                        { type: 'REALTIME_EVENT:FRIEND_REQUEST_ACCEPTED',   payload: payload || {} },
                    ];
                    iframes.forEach(function (frame) {
                        msgs.forEach(function (m) {
                            try { frame.contentWindow.postMessage(m, '*'); } catch (_) {}
                        });
                    });
                    return;
                }

                // FIX: friend:request from server → translate to FRIEND_REQUEST_RECEIVED
                // so friendSync_engine.js KynectaEventBus listener fires correctly.
                if (eventType === 'friend:request') {
                    const msgs = [
                        { type: 'REALTIME_EVENT:friend:request',            payload: payload || {} },
                        { type: 'REALTIME_EVENT:FRIEND_REQUEST_RECEIVED',   payload: { request: payload } },
                    ];
                    iframes.forEach(function (frame) {
                        msgs.forEach(function (m) {
                            try { frame.contentWindow.postMessage(m, '*'); } catch (_) {}
                        });
                    });
                    return;
                }

                // FIX: friend:removed from server → also send FRIEND_REMOVED which is the
                // event type that friend-core.js's ParentCommunicationManager._handleMessage
                // listens for. Without this the friend list never updates in the iframes
                // when someone unfriends you (or when you unfriend someone on another tab).
                if (eventType === 'friend:removed') {
                    const msgs = [
                        { type: 'REALTIME_EVENT:friend:removed',  payload: payload || {} },
                        { type: 'FRIEND_REMOVED',                 payload: payload || {} },
                    ];
                    iframes.forEach(function (frame) {
                        msgs.forEach(function (m) {
                            try { frame.contentWindow.postMessage(m, '*'); } catch (_) {}
                        });
                    });
                    return;
                }

                // FIX: friend:rejected → also send FRIEND_REQUEST_REJECTED for friend-core listeners
                if (eventType === 'friend:rejected') {
                    const msgs = [
                        { type: 'REALTIME_EVENT:friend:rejected',       payload: payload || {} },
                        { type: 'FRIEND_REQUEST_REJECTED',              payload: payload || {} },
                    ];
                    iframes.forEach(function (frame) {
                        msgs.forEach(function (m) {
                            try { frame.contentWindow.postMessage(m, '*'); } catch (_) {}
                        });
                    });
                    return;
                }

                const eventMsg = {
                    type: `REALTIME_EVENT:${eventType}`,
                    payload: payload || {}
                };
                iframes.forEach(function (frame) {
                    try { frame.contentWindow.postMessage(eventMsg, '*'); } catch (_) {}
                });
            } catch (_) {}
        });
    }

    realtimeManager.safeConnect = safeConnect;

    console.log('[Realtime] ✅ Ready (Socket.IO compatible v3.1.0)');
})();
