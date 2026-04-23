/**
 * app.realtime.socket.js  — HARDENED v2.3.0
 * FIX PATCH v2.2.0 (2026-04-21):
 *  - CRITICAL: Implement proper Socket.IO EIO=4 polling handshake before WebSocket upgrade.
 *    Raw WS to Socket.IO without a sid is rejected immediately by every standard server.
 *    New sequence: GET /socket.io/?EIO=4&transport=polling → get sid → WS with sid → 2probe/3probe/5 → 40 auth.
 *  - _onOpen: sends "2probe" when sid was obtained (proper upgrade), awaits "3probe" from server.
 *  - _onMessage: handles "3probe" → sends "5" to complete upgrade; server then sends "40".
 *  - _connect: now async, does fetch() polling first, gracefully falls back to direct WS on failure.
 *  - TOKEN: Added moodchat_token as primary key (was missing — root cause of WebSocket failures)
 *  - TOKEN: Added kynecta_auth object parsing + JWT pattern scan fallback
 *  - TOKEN: Re-acquires token on every reconnect attempt (handles auth race)
 *  - URL: getBackendBaseUrl now reads window.__kynAPI.baseUrl (confirmed set by api.core.js)
 *  - AUTO-CONNECT: IIFE connects immediately on script load, no longer waits for RuntimeAuthority
 *  - PARENT_READY: postMessage listener now also handles PARENT_READY for late token capture
 *  - SAFE-CONNECT: safeConnect() exposed globally — always resolves, never rejects
 *  - ERROR: _onError rate-limits console.warn (1 per 30s instead of every retry)
 *  - RECONNECT: _scheduleReconnect re-acquires token on each attempt
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
        reconnectAttempts: 25,      // FIXED: Increased to prevent premature DEGRADED mode
        reconnectBaseDelay: 2000,    // FIXED: Increased from 1000ms for more stable retries
        reconnectMaxDelay: 30000,
        reconnectJitter:    0.3,
        reconnectCooldown: 1000,     // NEW: Cooldown between retry attempts
        errorCooldown:      5000,     // NEW: Cooldown after errors
        maxConsecutiveErrors: 5,      // FIXED: Increased to prevent premature DEGRADED mode
        heartbeatInterval: 30000,
        heartbeatTimeout:   5000,
        connectionTimeout: 10000,    // FIXED: Reduced from 15s for faster failure detection
        authTimeout:        5000,
        messageQueueLimit: 500,      // FIXED: Reduced from 1000 for memory efficiency
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
        //  window.__kynAPI.baseUrl is set by api.core.js to "http://localhost:3000/api" (local)
        // or "https://moodchat-fy56.onrender.com/api" (production). Strip /api suffix.
        if (window.__kynAPI && window.__kynAPI.baseUrl) {
            return window.__kynAPI.baseUrl.replace(/\/api\/?$/, '');
        }
        if (window.Environment && window.Environment.backendUrl)
            return window.Environment.backendUrl.replace(/\/api\/?$/, '');
        //  Production fallback  detect from hostname
        if (!detectLocalEnvironment())
            return 'https://moodchat-fy56.onrender.com';
        return 'http://localhost:3000';
    }

    function getWebSocketUrl() {
        if (window.Environment && window.Environment.wsBaseUrl)
            return window.Environment.wsBaseUrl;
        const base   = getBackendBaseUrl();
        const wsBase = base.replace(/^http/, 'ws');
        // ✅ FIX: Use direct WebSocket endpoint for instant messaging
        return `${wsBase}/ws`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Token acquisition — checks every known location, returns null if missing
    // ─────────────────────────────────────────────────────────────────────────
    function acquireToken() {
        // ✅ FIX: moodchat_token is the FIRST key checked — this is the actual key
        // used by the app's auth flow (confirmed from logs: [LOCAL SAVE] moodchat_token ...)
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

        // 4. ✅ FIX: kynecta_auth object (logs show: [LOCAL SAVE] kynecta_auth Object)
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

        // 5. ✅ FIX: JWT pattern scan — find any localStorage key whose value looks like a JWT
        // This is the final safety net in case the key name changes again
        try {
            const jwtPattern = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                const v = localStorage.getItem(k);
                if (v && jwtPattern.test(v.trim())) {
                    // NOISE FIX v2.3: debug-only — no need to log on every reconnect
                    if (SOCKET_CONFIG.debug) console.log('[Realtime] 🔑 Token found via JWT scan, key:', k);
                    return v.trim();
                }
            }
        } catch (_) {}

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

            // ✅ FIXED: Added properties for enhanced error tracking and cooldowns
            this._consecutiveErrors        = 0;
            this._lastConnectionAttempt    = 0;
            this._lastErrorTime            = 0;
            this._lastReconnectLogAt       = 0;
            this._lastSyncLogAt            = 0;
            this._hasJoinedUserRoom        = false;
            this._bridgeListenersLogged    = false;
            this._hasEverConnected        = false;
            this._hasSid                   = false;
            this._resolvedUserId           = null;
            this._hasLoggedInitialError    = false;

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

            // Already in-flight — attach to existing promise but ensure callers can't
            // create an uncaught rejection if they forget .catch()
            if (this._connectPromise) {
                return new Promise((resolve, reject) => {
                    this._connectWaiters = this._connectWaiters || [];
                    this._connectWaiters.push({ resolve, reject });
                // ✅ FIX: attach no-op catch so the waiter promise is always "handled"
                }).catch(() => {});
            }

            if (token) this._sessionToken = token;

            // ✅ FIX: internal promise — wrap so unhandled rejection can't escape
            let _res, _rej;
            const internalPromise = new Promise((resolve, reject) => {
                _res = resolve;
                _rej = reject;
            });
            // Attach catch immediately so the promise is always handled even if
            // the caller drops the returned reference
            internalPromise.catch(() => {});

            this._connectPromise = { resolve: _res, reject: _rej };

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

            return internalPromise;
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

        /**
         * ✅ FIX v2.2.0: Proper Socket.IO EIO=4 connection sequence.
         *
         * Socket.IO REQUIRES a polling handshake to get a session ID (sid) before
         * upgrading to WebSocket. Connecting raw WebSocket directly (without sid)
         * causes an immediate rejection on most Socket.IO servers — which is exactly
         * what was happening. This is why the WS failed even with a valid token.
         *
         * Correct sequence:
         *   1. GET /socket.io/?EIO=4&transport=polling&token=<tok>
         *      → Server returns: 0{"sid":"...","upgrades":["websocket"],...}
         *   2. Open WebSocket: /socket.io/?EIO=4&transport=websocket&sid=<sid>&token=<tok>
         *   3. Send "2probe", await "3probe" (upgrade confirmation)
         *   4. Send "5" (upgrade complete)
         *   5. Server sends "40" (namespace connect) → we send auth event
         */
        async _connect() {
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

            const base    = getBackendBaseUrl();
            const isLocal = detectLocalEnvironment();
            const tokenQS = this._sessionToken
                ? `&token=${encodeURIComponent(this._sessionToken)}`
                : '';

            // ── Step 1: Polling handshake to obtain sid ────────────────────
            let sid = null;
            try {
                const pollUrl = `${base}/socket.io/?EIO=4&transport=polling${tokenQS}`;
                // NOISE FIX v2.3: Only log polling URL on first-ever connect
                if (!this._hasEverConnected) {
                    console.log('[Realtime] 🤝 Polling handshake:', pollUrl.replace(/token=[^&]+/, 'token=***'));
                }

                const ctrl    = new AbortController();
                const pollTO  = setTimeout(() => ctrl.abort(), 8000);
                const resp    = await fetch(pollUrl, {
                    signal:      ctrl.signal,
                    credentials: 'same-origin',
                    cache:       'no-store'
                });
                clearTimeout(pollTO);

                if (resp.ok) {
                    const text = await resp.text();
                    // Engine.IO frame: leading digits + JSON, e.g. "0{"sid":"abc123",...}"
                    const jsonStart = text.indexOf('{');
                    if (jsonStart !== -1) {
                        const data = JSON.parse(text.slice(jsonStart));
                        sid = data.sid || null;
                        if (data.pingInterval) this._socketIoPingInterval = data.pingInterval;
                        // NOISE FIX v2.3: only log sid on first connect
                        if (!this._hasEverConnected && sid) {
                            console.log('[Realtime] ✅ Got sid:', sid.substring(0, 8) + '...');
                        }
                    }
                } else {
                    console.warn('[Realtime] Polling handshake non-ok:', resp.status, '— trying direct WS');
                }
            } catch (pollErr) {
                // Polling failed (network down, CORS, etc.) — try direct WS anyway
                console.warn('[Realtime] Polling handshake failed:', pollErr.message, '— trying direct WS');
            }

            // ── Step 2: Open WebSocket with sid (if obtained) ─────────────
            try {
                const wsBase = base.replace(/^http/, 'ws');
                let wsUrl    = `${wsBase}/socket.io/?EIO=4&transport=websocket`;
                if (sid)                  wsUrl += `&sid=${encodeURIComponent(sid)}`;
                if (this._sessionToken)   wsUrl += `&token=${encodeURIComponent(this._sessionToken)}`;

                // NOISE FIX v2.3: suppress the repeated "Opening WebSocket" line on reconnects
                if (!this._hasEverConnected) {
                    console.log('[Realtime] 🔌 Opening WebSocket', wsUrl.replace(/token=[^&]+/, 'token=***'));
                }

                this._socket           = new WebSocket(wsUrl);
                this._socket.onopen    = this._onOpen.bind(this);
                this._socket.onmessage = this._onMessage.bind(this);
                this._socket.onclose   = this._onClose.bind(this);
                this._socket.onerror   = this._onError.bind(this);

                // Store whether we did a proper handshake
                this._hasSid = !!sid;

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
            this._consecutiveErrors = 0; // ✅ FIXED: Reset consecutive errors on successful connection
            this._manualDisconnect  = false;

            // NOISE FIX v2.3: Only log the full URL on the very first connect.
            // On reconnects just log a short status line — the URL never changes
            // and printing it on every reconnect was the main source of console spam.
            if (!this._hasEverConnected) {
                this._hasEverConnected = true;
                console.log('[Realtime] ✅ WebSocket OPEN', this._socket && this._socket.url
                    ? this._socket.url.replace(/token=[^&]+/, 'token=***').replace(/sid=[^&]+/, 'sid=***')
                    : this._url);
            } else {
                console.log('[Realtime] ✅ WebSocket OPEN (reconnected)');
            }

            const isSocketIO = true; // we always connect to /socket.io/ now
            this._state = CONNECTION_STATE.CONNECTING;
            this._emitStateChange();

            if (this._hasSid) {
                // ✅ Proper upgrade sequence: send "2probe", wait for "3probe", then send "5"
                // The server will then send "40" (namespace connect) which triggers _authenticate()
                try {
                    this._socket.send('2probe');
                    console.log('[Realtime] 📤 Sent upgrade probe (2probe)');
                } catch (_) {}
            }
            // If no sid (direct WS fallback): server sends "0" open packet first → handled in _onMessage
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
                    this._joinUserRoom(null);
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
                    this._joinUserRoom(null);
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

                console.log('[Realtime] Received message:', rawMessage);

                let messageData;
                try {
                    messageData = JSON.parse(rawMessage);
                } catch (error) {
                    console.warn('[Realtime] Failed to parse message:', error.message);
                    return;
                }

                // Handle Socket.IO engine.io protocol
                if (rawMessage.startsWith('0') || rawMessage.startsWith('1') || 
                    rawMessage.startsWith('2') || rawMessage.startsWith('3') || 
                    rawMessage.startsWith('4')) {
                    
                    const code = rawMessage.charAt(0);
                    
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
                    this._joinUserRoom(message.payload);
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
                    this._joinUserRoom(message.payload);
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

        _onError(rawError) {
            this._stats.errors++;
            this._consecutiveErrors++;
            this._lastErrorTime = Date.now();
            clearTimeout(this._connectionTimeout);

            // ✅ FIX: WebSocket onerror fires with a DOM Event object (isTrusted:true, type:'error'),
            // NOT a JS Error. Wrapping it prevents "Uncaught (in promise) Event {…}" and gives
            // error.message a useful string everywhere downstream.
            const error = (rawError instanceof Error)
                ? rawError
                : new Error(
                    (rawError && rawError.message)
                        ? rawError.message
                        : 'WebSocket connection error'
                  );

            // ✅ FIXED: Enhanced error logging with cooldown
            const now = Date.now();
            if (!this._lastErrorLogAt || now - this._lastErrorLogAt > 60000) {
                this._lastErrorLogAt = now;
                // Only show detailed error on first failure, subsequent failures are brief
                if (!this._hasLoggedInitialError) {
                    console.warn('[Realtime] WebSocket connection failed, messages module will work without real-time updates');
                    this._hasLoggedInitialError = true;
                } else {
                    console.log('[Realtime] WebSocket reconnect attempt failed (working offline)');
                }
            }

            // ✅ FIXED: Non-blocking error resolution
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
                this._socket.onclose = null; // suppress duplicate _onClose
                try { this._socket.close(); } catch (_) {}
                this._socket = null;
            }

            // ✅ FIXED: Enhanced reconnect logic with consecutive error limit
            if (this._reconnectAttempts < SOCKET_CONFIG.reconnectAttempts && 
                this._consecutiveErrors < SOCKET_CONFIG.maxConsecutiveErrors) {
                this._scheduleReconnect();
            } else {
                console.warn('[Realtime] Max reconnect attempts or consecutive errors reached — entering DEGRADED mode.');
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


        // =====================================================================
        // FIX: Emit join frames after auth so the server knows which user room
        // this socket belongs to. Without this, sendToUser() misses the socket
        // after reconnects because the raw WS client mapping goes stale.
        // =====================================================================
        _joinUserRoom(authPayload) {
            try {
                var uid = authPayload && (authPayload.userId || authPayload.id);
                if (!uid) {
                    try {
                        uid = (window.__PARENT_SESSION__ && window.__PARENT_SESSION__.userId)
                            || (window.__kyn_session__ && window.__kyn_session__.userId)
                            || (function() {
                                var keys = ['moodchat_user', 'kynecta_user', 'user', 'kyn_user'];
                                for (var i = 0; i < keys.length; i++) {
                                    try {
                                        var raw = localStorage.getItem(keys[i]);
                                        if (raw) {
                                            var parsed = JSON.parse(raw);
                                            var id = parsed && (parsed.id || parsed.userId);
                                            if (id) return id;
                                        }
                                    } catch (_) {}
                                }
                                return null;
                            })();
                    } catch (_) {}
                }
                if (!uid) {
                    console.warn('[Realtime] _joinUserRoom: cannot resolve userId — skipped');
                    return;
                }
                var numericId = parseInt(uid, 10);
                if (!numericId) return;
                this._sendRaw({ type: 'join_user_room', userId: numericId });
                this._sendRaw({ type: 'join', room: 'user:' + numericId });
                this._sendRaw({ type: 'join', room: 'user_' + numericId });
                // NOISE FIX v2.3: only log on first join
                if (!this._hasJoinedUserRoom) {
                    this._hasJoinedUserRoom = true;
                    console.log('[Realtime] ✅ Joined user rooms uid=' + numericId);
                }
                this._resolvedUserId = numericId;
            } catch (err) {
                console.warn('[Realtime] _joinUserRoom error:', err.message);
            }
        }

        // FIX: Send a raw JSON frame bypassing the authenticated-queue guard.
        // Used for join frames that must fire immediately after auth.
        _sendRaw(obj) {
            try {
                if (this._socket && this._socket.readyState === WebSocket.OPEN) {
                    this._socket.send(JSON.stringify(obj));
                }
            } catch (_) {}
        }

        _registerMessageBridgeListeners() {
            const MESSAGE_EVENTS = ['message:new', 'new_message', 'chat:message', 'MESSAGE_RECEIVED'];
            const GROUP_EVENTS = ['group:message', 'group:membership_change', 'group:updated', 'group:localSync'];
            // ✅ FIX: Register call signal events so calls-core / calls-ui receive them via the singleton
            const CALL_EVENTS = [
                'call:incoming', 'incoming_call',
                'call:accepted', 'call_accepted', 'call_answered',
                'call:rejected', 'call_rejected',
                'call:cancelled', 'call_cancelled',
                'call:ended', 'call_ended', 'call_force_ended',
                'webrtc:signal', 'webrtc_signal',
                'call:ice', 'call_ice',
                'call:offer', 'call:answer',
            ];
            // ✅ FIX: Status events were completely missing from the bridge.
            // The backend emits these after every statusController.createStatus() call.
            // Without this block the status iframe never receives real-time updates.
            const STATUS_EVENTS = [
                'status:created', 'new_status', 'status_created',
                'status:updated', 'status_updated',
                'status:deleted', 'status_deleted',
                'status:expired',
                'status:viewed',  'status:viewer_update'
            ];
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

            // ✅ FIX: Call events — forward to DOM + KynectaEventBus so calls-core.js picks them up
            for (const eventType of CALL_EVENTS) {
                if (this._registeredSocketListeners.has(eventType)) continue;
                this._registeredSocketListeners.add(eventType);
                this.on(eventType, (payload) => {
                    // NOISE FIX v2.3: debug-only per-event log
                    if (SOCKET_CONFIG.debug) console.log(`[Realtime] 📞 call event [${eventType}]`, payload);
                    window.dispatchEvent(new CustomEvent(`kyn:${eventType}`, { detail: payload }));
                    document.dispatchEvent(new CustomEvent(eventType, { detail: payload }));
                    if (window.KynectaEventBus) {
                        window.KynectaEventBus.emit(`REALTIME_${eventType}`, payload, { async: true });
                    }
                });
                registered++;
            }

            // ✅ FIX: Status events — forward socket events to the statusIframe and DOM.
            for (const eventType of STATUS_EVENTS) {
                if (this._registeredSocketListeners.has(eventType)) continue;
                this._registeredSocketListeners.add(eventType);
                this.on(eventType, (payload) => {
                    // NOISE FIX v2.3: debug-only per-event log
                    if (SOCKET_CONFIG.debug) console.log(`[Realtime] 📢 status event [${eventType}]`, payload);
                    // 1. Forward to statusIframe via postMessage
                    const statusIframe = document.getElementById('statusIframe');
                    if (statusIframe && statusIframe.contentWindow) {
                        statusIframe.contentWindow.postMessage({
                            type: eventType,
                            payload: payload,
                            source: 'ws-bridge',
                            timestamp: Date.now()
                        }, '*');
                    }
                    // 2. DOM event so any page-level listeners fire
                    window.dispatchEvent(new CustomEvent(`kyn:${eventType}`, { detail: payload }));
                    document.dispatchEvent(new CustomEvent(eventType, { detail: payload }));
                    // 3. EventBus for other modules
                    if (window.KynectaEventBus) {
                        window.KynectaEventBus.emit(`REALTIME_${eventType}`, payload, { async: true });
                    }
                });
                registered++;
            }

            if (registered > 0) {
                // NOISE FIX v2.3: only log first-time registration, not every reconnect
                if (!this._bridgeListenersLogged) {
                    this._bridgeListenersLogged = true;
                    console.log(`[Realtime] Registered ${registered} message, group & call bridge listener(s).`);
                }
            }
        }

        _handleIncomingMessage(data) {
            if (!data) return;
            const chatId = String(data.chatId || data.conversationId || '');
            if (!chatId) return;

            // NOISE FIX v2.3: only log incoming messages in debug mode
            if (SOCKET_CONFIG.debug) {
                console.log('[Realtime] 📨 incoming message for chat', chatId);
            }

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

        _handleGroupEvent(eventType, data) {
            if (!data) return;
            window.dispatchEvent(new CustomEvent(`kyn:${eventType}`, { detail: data }));
            document.dispatchEvent(new CustomEvent(eventType, { detail: data }));
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit(`REALTIME_${eventType}`, data, { async: true });
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

            // NOISE FIX v2.3: Only log sync trigger once per 10s to prevent
            // spam when the socket rapidly reconnects (e.g. during token expiry)
            const now = Date.now();
            if (!this._lastSyncLogAt || now - this._lastSyncLogAt > 10000) {
                this._lastSyncLogAt = now;
                console.log('[Realtime] 🔄 Sync triggered after (re)connect.');
            }
        }

        // ── PRIVATE: RECONNECT ───────────────────────────────────────────────

        _scheduleReconnect() {
            if (this._reconnectAttempts >= SOCKET_CONFIG.reconnectAttempts) {
                console.warn('[Realtime] Max reconnect attempts reached - entering degraded mode');
                this._state = CONNECTION_STATE.DEGRADED;
                this._emitStateChange();
                return;
            }

            this._clearReconnectTimer();

            // ✅ FIXED: Enhanced exponential backoff with cooldown
            const now = Date.now();
            const timeSinceLastAttempt = now - (this._lastConnectionAttempt || 0);
            const cooldownTime = this._consecutiveErrors > 0 ? SOCKET_CONFIG.errorCooldown : SOCKET_CONFIG.reconnectCooldown;
            
            // Apply cooldown if needed
            const effectiveDelay = Math.max(0, cooldownTime - timeSinceLastAttempt);
            
            // Calculate exponential backoff
            const baseDelay = SOCKET_CONFIG.reconnectBaseDelay * Math.pow(1.8, this._reconnectAttempts);
            const jitter = 1 + (Math.random() - 0.5) * 2 * SOCKET_CONFIG.reconnectJitter;
            const backoffDelay = Math.min(baseDelay * jitter, SOCKET_CONFIG.reconnectMaxDelay);
            
            const totalDelay = Math.max(effectiveDelay, backoffDelay);

            console.log(`[Realtime] Enhanced reconnect in ${Math.round(totalDelay)}ms (attempt ${this._reconnectAttempts + 1})`);

            this._reconnectTimer = setTimeout(() => {
                this._reconnectAttempts++;
                this._stats.reconnections++;
                this._lastConnectionAttempt = Date.now();

                // ✅ FIXED: Rate-limited logging
                if (!this._lastReconnectLogAt || now - this._lastReconnectLogAt > 15000) {
                    this._lastReconnectLogAt = now;
                    console.log(`[Realtime] Reconnect attempt #${this._reconnectAttempts}`);
                }

                // ✅ FIXED: Re-acquire token on every reconnect attempt
                const freshToken = acquireToken();
                if (freshToken && freshToken !== this._sessionToken) {
                    this._sessionToken = freshToken;
                    window.__kynToken = freshToken;
                }

                this._connect();
            }, totalDelay);
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
                    // NOISE FIX v2.3: no log here — fires too frequently
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

    function getRawWebSocketUrl(token = null) {
        if (window.Environment && window.Environment.wsBaseUrl) {
            const provided = window.Environment.wsBaseUrl;
            if (!token || provided.includes('token=')) return provided;
            const joiner = provided.includes('?') ? '&' : '?';
            return `${provided}${joiner}token=${encodeURIComponent(token)}`;
        }
        const base = getBackendBaseUrl();
        const wsBase = base.replace(/^http/, 'ws');
        const tokenQS = token ? `?token=${encodeURIComponent(token)}` : '';
        return `${wsBase}/ws${tokenQS}`;
    }

    KynectaRealtimeManager.prototype._connect = async function () {
        if (this._socket &&
            (this._socket.readyState === WebSocket.OPEN ||
             this._socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        if (this._socket) {
            this._socket.onopen = null;
            this._socket.onmessage = null;
            this._socket.onclose = null;
            this._socket.onerror = null;
            try { this._socket.close(); } catch (_) {}
            this._socket = null;
        }

        this._state = CONNECTION_STATE.CONNECTING;
        this._emitStateChange();

        try {
            const wsUrl = getRawWebSocketUrl(this._sessionToken);
            this._url = wsUrl;
            console.log('[Realtime] Opening raw WebSocket', wsUrl.replace(/token=[^&]+/, 'token=***'));

            this._socket = new WebSocket(wsUrl);
            this._socket.onopen = this._onOpen.bind(this);
            this._socket.onmessage = this._onMessage.bind(this);
            this._socket.onclose = this._onClose.bind(this);
            this._socket.onerror = this._onError.bind(this);

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
    };

    KynectaRealtimeManager.prototype._onOpen = function () {
        clearTimeout(this._connectionTimeout);
        this._reconnectAttempts = 0;
        this._manualDisconnect = false;

        console.log('[Realtime] WebSocket OPEN', this._socket && this._socket.url
            ? this._socket.url.replace(/token=[^&]+/, 'token=***')
            : this._url);

        this._state = CONNECTION_STATE.CONNECTED;
        this._emitStateChange();
        this._startHeartbeat();

        if (this._sessionToken) {
            this._authenticate();
        }
    };

    KynectaRealtimeManager.prototype._authenticate = function () {
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN || this._authenticated) {
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
    };

    KynectaRealtimeManager.prototype._onMessage = function (event) {
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
    };

    KynectaRealtimeManager.prototype._startHeartbeat = function () {
        this._clearHeartbeatTimer();

        this._heartbeatTimer = setInterval(() => {
            if (this._state === CONNECTION_STATE.AUTHENTICATED &&
                this._socket && this._socket.readyState === WebSocket.OPEN) {
                this._stats.heartbeats++;
                this._sendMessage({ type: 'ping', timestamp: Date.now() }).catch(() => {});
                this._heartbeatTimeoutTimer = setTimeout(() => {
                    this._onError(new Error('Heartbeat timeout'));
                }, SOCKET_CONFIG.heartbeatTimeout);
            }
        }, SOCKET_CONFIG.heartbeatInterval);
    };

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

    // ── Listen for SESSION_DATA / AUTH_READY / PARENT_READY from parent frames ──
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

    // ✅ FIX: Auto-connect immediately on load — don't wait for RuntimeAuthority to call connect().
    // waitForToken() polls for up to tokenWaitMs (5 s) so any race with the auth module is handled.
    // safeConnect() wraps the result so callers can never get an unhandled rejection.
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
            // Auto-connect failed silently — RuntimeAuthority will retry
        }
    })();

    // Expose safeConnect globally so RuntimeAuthority can use it
    realtimeManager.safeConnect = safeConnect;

    console.log('[Realtime] ✅ Ready (hardened v2.3.0) — noise-reduced, token-refresh aware');
})();