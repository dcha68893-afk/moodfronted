/**
 * app.realtime.socket.js — RAW WEBSOCKET FIRST v3.4.0
 *
 * FIXES IN THIS VERSION:
 *  1. acquireToken() now checks window.__kynToken FIRST (set immediately after login)
 *  2. kynecta_auth parsing now tolerates missing issuedAt (schema mismatch guard)
 *  3. Added pre-connect token debug log so you can confirm token is present
 *  4. Token passed in BOTH auth.token AND query.token for max compatibility
 *  5. Reconnect loop prevention: auth errors don't auto-reconnect (avoids spam)
 *  6. [BUG 2 FIX] friend:request → now posts BOTH REALTIME_EVENT:friend:request AND
 *     FRIEND_REQUEST_RECEIVED to every iframe.
 *  7. [BUG 2 FIX] friend:accepted → same dual-post fix.
 *  8. [BUG FIX] REALTIME_SEND handler added — child iframe sends (calls, messages)
 *     now actually reach the Socket.IO server instead of being silently dropped.
 *  9. [BUG FIX] Console noise suppressed — repeated identical log lines are
 *     deduplicated; a message only re-logs when its content changes or a
 *     feature is re-triggered.
 * 10. [BUG FIX] SETTING_CHANGED storm eliminated — broadcasts only fire when the
 *     user actually changes a setting (userTriggered:true), not on every load/sync.
 */

(function () {
    'use strict';

    // ── Console dedup utility ─────────────────────────────────────────────────
    // Prevents repeated identical log messages from flooding the console.
    // A message re-logs only when its content changes or after a reset.
    //
    // FIX-QUIET: Routine subsystem status/banner logs (module init banners,
    // reconnect chatter, background-sync/reliability heartbeats) were flooding
    // the console on every tab-focus / reconnect cycle. These are now
    // suppressed by default and only re-enabled when window.__CHAT_DEBUG__ is
    // set to true (same debug flag the rest of the app already uses via
    // _chatLog). console.error is never touched here.
    if (!window.__consoleDedupInstalled) {
        window.__consoleDedupInstalled = true;
        (function() {
            const _logCache = new Map();
            const DEDUP_MS = 5000; // same message within 5s = suppressed

            // Tag prefixes for routine/status chatter — quiet unless debugging.
            const _QUIET_TAGS = [
                '[MeshEngine]', '[COR]', '[Phase6]', '[SW]',
                '[BGSync]', '[BGReliability]', '[Reconnect]'
            ];
            function _isQuietTag(firstArg) {
                if (window.__CHAT_DEBUG__) return false; // debug mode: show everything
                const msg = String(firstArg == null ? '' : firstArg);
                for (let i = 0; i < _QUIET_TAGS.length; i++) {
                    if (msg.indexOf(_QUIET_TAGS[i]) !== -1) return true;
                }
                return false;
            }

            ['log', 'warn', 'info'].forEach(function(method) {
                const _orig = console[method].bind(console);
                console[method] = function() {
                    try {
                        if (_isQuietTag(arguments[0])) return;
                        const key = Array.prototype.slice.call(arguments).join('|');
                        const now = Date.now();
                        const last = _logCache.get(key) || 0;
                        if (now - last < DEDUP_MS) return;
                        _logCache.set(key, now);
                        // Prune cache periodically
                        if (_logCache.size > 300) {
                            const cutoff = now - DEDUP_MS * 2;
                            _logCache.forEach(function(ts, k) { if (ts < cutoff) _logCache.delete(k); });
                        }
                    } catch(_) {}
                    _orig.apply(console, arguments);
                };
            });
        })();
    }

    // ── Socket.IO client loader ───────────────────────────────────────────────
    // Grab the Socket.IO client from window.io (loaded via <script> in chat.html).
    // We check immediately and also poll in waitForSocketIO() in case the CDN
    // script hasn't finished loading by the time this IIFE runs.
    let socketIOClient = (typeof window.io === 'function') ? window.io : null;
    let useRawWebSocket = false; // FIXED: always use Socket.IO; raw WS is a last-resort only

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
        reconnectAttempts:    20,
        reconnectBaseDelay:   3000,
        reconnectMaxDelay:    60000,
        reconnectJitter:      0.3,
        errorCooldown:        5000,
        maxConsecutiveErrors: 5,
        heartbeatInterval:    30000,
        heartbeatTimeout:     10000,
        connectionTimeout:    30000,
        authTimeout:          10000,
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
            return 'https://nexora-3bla.onrender.com';
        }
        return 'http://localhost:4000';
    }

    // ── FIX #1: Token acquisition — check globals FIRST (set right after login) ──
    function acquireToken() {
        const TOKEN_KEYS = [
            'nexopa_token', 'kynecta_token', 'auth_token', 'token', 'jwt',
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
        for (const key of ['kynecta_auth', 'kynecta_session', 'kyn_session', 'auth_session', 'nexopa_auth']) {
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
            this._isConnecting = false; // FIX: mutex to prevent concurrent _connectInternal() races

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

            // FIX-STALE-SOCKET-TOKEN: connect() only fetches a token from storage
            // when _sessionToken is still empty (i.e. the very first connect), and
            // reconnects triggered internally via _scheduleReconnect() call
            // _connectInternal() directly — never re-reading storage either. Once a
            // token refresh happens elsewhere in the app (auth.session.manager.js /
            // api.auth.js both dispatch 'auth:token:refreshed' on refresh), this
            // socket would otherwise keep authenticating every future reconnect with
            // the ORIGINAL, now-stale token — failing auth after any disconnect that
            // happens post-refresh (network blip, backend sleep/wake-up) until the
            // user manually reloads the page. Keep _sessionToken current so every
            // reconnect — internal or explicit — uses the live token.
            const _onTokenRefreshed = (evt) => {
                const newToken = evt && evt.detail && evt.detail.token;
                if (!newToken || newToken === this._sessionToken) return;
                this._sessionToken = newToken;
                if (SOCKET_CONFIG.debug) console.log('[Realtime] 🔄 Session token updated after refresh');
            };
            window.addEventListener('auth:token:refreshed', _onTokenRefreshed);
            window.addEventListener('session:restored', _onTokenRefreshed);

            // FIX-NO-DISCONNECT-ON-LOGOUT: confirmed via exhaustive search that
            // nothing anywhere in the frontend ever listened for the
            // 'user-logged-out' event api.auth.js dispatches on every logout (or
            // 'auth:session:ended', dispatched when a refresh genuinely fails and
            // the session ends). The authenticated socket was never disconnected —
            // it kept receiving messages/calls/presence for the logged-out session
            // indefinitely, and logging into a different account in the same tab
            // could inherit the stale connection/token instead of a fresh one.
            const _onLoggedOut = () => {
                if (SOCKET_CONFIG.debug) console.log('[Realtime] 🔒 Logout detected — disconnecting socket');
                this._sessionToken = null;
                this.disconnect(); // sets _manualDisconnect, prevents auto-reconnect
            };
            window.addEventListener('user-logged-out', _onLoggedOut);
            window.addEventListener('auth:session:ended', _onLoggedOut);

            if (SOCKET_CONFIG.debug) console.log('[Realtime] ✅ Socket.IO compatible manager initialized (v3.1.0)');
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
                    if (SOCKET_CONFIG.debug) console.log('[Realtime] 🔑 Connecting with token (first 20 chars):',
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

        off(type, handler = null) {
            const listeners = this._listeners.get(type);
            if (!listeners) return false;

            if (typeof handler !== 'function') {
                this._listeners.delete(type);
                return true;
            }

            let removed = false;
            for (const entry of Array.from(listeners)) {
                if (entry.handler === handler) {
                    listeners.delete(entry);
                    removed = true;
                }
            }

            if (listeners.size === 0) {
                this._listeners.delete(type);
            }

            return removed;
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
            // FIX: route through _scheduleReconnect so the _isConnecting mutex and
            // timer guard are always respected — calling this.connect() directly bypassed both.
            this._scheduleReconnect();
            return Promise.resolve(this);
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
            // FIX: mutex guard — prevents concurrent connection races
            if (this._isConnecting) return;
            this._isConnecting = true;

            if (this._socket && (this._socket.connected || this._socket.connecting)) {
                this._isConnecting = false;
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
                // Always prefer Socket.IO — only fall back to raw WS if the
                // socket.io client library failed to load (CDN down, etc.)
                if (socketIOClient) {
                    await this._connectSocketIO();
                } else {
                    console.warn('[Realtime] Socket.IO client not loaded — falling back to raw WebSocket');
                    await this._connectRawWebSocket();
                }
            } catch (err) {
                this._onError(err);
            } finally {
                // FIX: always release the mutex so future reconnect attempts can proceed
                this._isConnecting = false;
            }
        }

        async _connectSocketIO() {
            const socketUrl = getBackendBaseUrl();

            if (!this._hasEverConnected || this._reconnectAttempts === 0 || this._reconnectAttempts % 5 === 0) {
                if (SOCKET_CONFIG.debug) console.log('[Realtime] Connecting Socket.IO to', socketUrl);
            }

            const socketOptions = {
                transports: ['polling', 'websocket'], // polling first — establishes session even if WS upgrade blocked on Render, then auto-upgrades
                // ── FIX: 30s was too short for 1KB/s connections where the polling
                // handshake itself can take 20-40s. Bumped to 45s so slow links get
                // a real chance to complete the handshake instead of erroring out
                // before the first byte even arrives.
                timeout: Math.max(SOCKET_CONFIG.connectionTimeout, 45000),
                reconnection: false,  // we manage reconnection ourselves
                // ── FIX: Enable per-message compression so payloads on slow links
                // (1KB/s) take far less time to transmit. Default Socket.IO server
                // config must also have perMessageDeflate enabled (see backend fix).
                perMessageDeflate: { threshold: 256 },
                // ── FIX: Lower polling chunk size doesn't apply client-side, but
                // forcing base64=false avoids extra encoding overhead on slow links.
                forceBase64: false
            };

            // ── FIX #4: Pass token in BOTH auth and query for max compatibility ──
            if (this._sessionToken) {
                socketOptions.auth = { token: this._sessionToken };
                socketOptions.query = { token: this._sessionToken };
            } else {
                console.warn('[Realtime] Connecting WITHOUT token — expect auth/token-missing error');
            }

            this._socket = socketIOClient(socketUrl, socketOptions);

            // FIX-ROOT-CAUSE-SILENT-MESSAGE-LOSS: _registerMessageBridgeListeners()
            // (called below in _onSocketIOConnect on EVERY successful connect,
            // including reconnects) guards each event name with
            // `this._registeredSocketListeners.has(eventType) → return`, to avoid
            // attaching duplicate listeners on the SAME socket. But
            // `_registeredSocketListeners` was only ever created once in the
            // constructor and never cleared — while `this._socket` above is a
            // brand-new Socket.IO client instance on every reconnect. So after the
            // very first successful connect, every later reconnect's call to
            // _registerMessageBridgeListeners() silently no-ops for every event
            // ('message:new', 'call:incoming', etc.) because the event name is
            // already marked "registered" from the OLD (now-dead) socket. The new
            // socket object ends up with zero listeners for incoming messages/calls
            // — nothing throws, nothing logs, the event just has nowhere to go.
            // That's the "receiver's console shows nothing at all" bug: any device
            // that has reconnected even once (background/foreground, ping timeout,
            // DEGRADED recovery — all common, all visible in the app's own logs)
            // stops receiving real-time events for the rest of that page session.
            // Fix: reset the tracking Set (and the stale per-socket handler map)
            // whenever we create a new socket instance, so listeners are freshly
            // attached to the socket that's actually live.
            this._registeredSocketListeners = new Set();
            this._socketHandlerMap = new Map();
            this._bridgeListenersLogged = false;

            this._lastConnectLogState = this._lastConnectLogState || 'disconnected';

            this._socket.on('connect', () => {
                if (this._lastConnectLogState !== 'connected') {
                    if (SOCKET_CONFIG.debug) console.log('[Realtime] ✅ Socket.IO connected, sid:', this._socket.id);
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
                // FIX-PHASE15: Clear registered listener set so they re-bind on next connect.
                // Without this, after a reconnect no message:new/call:incoming listeners
                // are added (Set already contains them) → all real-time events silently drop.
                this._registeredSocketListeners.clear();
                if (this._lastConnectLogState !== 'disconnected') {
                    if (SOCKET_CONFIG.debug) console.log('[Realtime] Socket.IO disconnected:', reason);
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
                // FIX-DISCONNECT-LOOP: 'transport close' fires during the polling→WebSocket
                // upgrade handshake — a NORMAL, transient phase of Socket.IO.
                // If we immediately call _onClose() + _scheduleReconnect() the client
                // creates a new socket before the WS upgrade completes, causing the rapid
                // connect/disconnect cycle seen in the validator as alternating ✅ / ❌.
                // Fix: delay 800ms and only proceed if the socket is still truly gone.
                if (reason === 'transport close' || reason === 'transport error') {
                    const _savedSocket = this._socket;
                    setTimeout(() => {
                        if (_savedSocket && _savedSocket.connected) return; // upgraded — ignore
                        this._onClose();
                    }, 800);
                    return;
                }
                this._onClose();
            });

            this._socket.on('message', (data) => {
                this._onSocketIOMessage(data);
            });

            this._socket.on('authenticated', (data) => {
                if (SOCKET_CONFIG.debug) console.log('[Realtime] ✅ Server confirmed authentication:', data);
                // FIX-CALL-DELIVERY: Re-join user rooms on authenticated confirmation.
                // The connect-time join_user_room may fire before the server middleware
                // has finished auth, so the join silently fails.  Re-joining here (after
                // the server has confirmed auth) guarantees sendToUser() can reach us.
                try {
                    const myId = data?.userId || this._getUserId();
                    if (myId && this._socket && typeof this._socket.emit === 'function') {
                        const idStr = String(myId);
                        this._socket.emit('join_user_room', { userId: myId });
                        this._socket.emit('join', { room: 'user:' + idStr });
                        this._socket.emit('join', { room: 'user_' + idStr });
                        if (SOCKET_CONFIG.debug) console.log('[Realtime] ✅ Re-joined user rooms after auth confirmation, userId:', myId);
                    }
                } catch (_authJoinErr) {}
            });

            // FIX-SESSION-REPLACED: When server evicts this socket (e.g. max concurrent
            // sessions reached), it sends 'session_replaced'. Without a handler, the client
            // immediately tried to reconnect, which hit the limit again, triggering eviction
            // again — a tight disconnect/reconnect loop seen in the validator as ❌/✅ spam.
            // Fix: stop reconnecting for a cooldown period, then try once (the new tab is now
            // the active session). The reconnect is still desirable because the user may have
            // closed the other tab and wants this one to take over.
            this._socket.on('session_replaced', (data) => {
                console.warn('[Realtime] Session replaced by server:', data?.reason || 'new connection from same account');
                this._state = CONNECTION_STATE.DISCONNECTED;
                this._emitStateChange();
                // Wait 5s before reconnecting — the other session should be closing
                clearTimeout(this._sessionReplacedTimer);
                this._sessionReplacedTimer = setTimeout(() => {
                    if (this._state !== CONNECTION_STATE.AUTHENTICATED) {
                        this._reconnectAttempts = 0;
                        this._connectInternal().catch(() => {});
                    }
                }, 5000);
            });

            // FIX-AUTH-ERROR: Server emits auth_error when secondary token check fails.
            // Without a handler, this event was silently ignored and the socket stayed
            // connected in an unauthenticated state, never receiving messages.
            this._socket.on('auth_error', (data) => {
                console.error('[Realtime] ❌ Server auth_error:', data?.reason || 'unknown');
                this._authenticated = false;
                this._state = CONNECTION_STATE.ERROR;
                this._emitStateChange();
                // Don't reconnect — auth errors require a new login, not a retry
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

            // FIX-CALL-RECOVERY: app.runtime.authority.js emits SOCKET_CONNECTED
            // exactly once, at initial boot, based on whether the FIRST connection
            // attempt succeeded. It never fires again. But 16+ subsystems across the
            // app — including WebRTCSessionOrchestrator and AdaptiveBitrateEngine,
            // which restore call signaling and re-adapt call quality after a
            // reconnect — all listen for this exact event on every reconnect, not
            // just boot. That meant a mid-call backend blip (Render sleep/restart,
            // brief network drop) would reconnect the socket but never notify those
            // subsystems, silently breaking call recovery. This is the actual,
            // single source of truth for every real connect cycle (not just the
            // first), so it's emitted from here on every successful (re)connect.
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('SOCKET_CONNECTED', {
                    userId: this._getUserId(),
                    timestamp: Date.now(),
                    reconnect: this._reconnectCountSinceBoot > 0
                });
            }
            this._reconnectCountSinceBoot = (this._reconnectCountSinceBoot || 0) + 1;

            this._resolveConnectPromise();
            this._processQueue();
            this._registerMessageBridgeListeners();
            this._triggerSync();

            // CRITICAL FIX: Emit join_user_room so the server places this socket in the
            // correct user:<id> and user_<id> rooms. Without this, sendToUser() on the
            // backend cannot deliver messages or call:incoming events to this client.
            // The backend handler in webSocketService.js joins the rooms on this event.
            try {
                const myId = this._getUserId();
                if (myId && this._socket && typeof this._socket.emit === 'function') {
                    this._socket.emit('join_user_room', { userId: myId });
                    if (SOCKET_CONFIG.debug) console.log('[Realtime] ✅ Emitted join_user_room for userId:', myId);
                }
            } catch (_jrErr) {}
        }

        // Helper to get current user ID from multiple possible storage locations
        _getUserId() {
            try {
                // Try SessionManager first (fastest)
                if (window.SessionManager && typeof window.SessionManager.getUserId === 'function') {
                    const id = window.SessionManager.getUserId();
                    if (id) return id;
                }
                // Try common localStorage keys
                for (const key of ['nexopa_user', 'kynecta_auth', 'authUser', 'user']) {
                    const raw = localStorage.getItem(key);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        const id = parsed?.id || parsed?.user?.id || parsed?.userId;
                        if (id) return id;
                    }
                }
                // Try token decode (last resort)
                const token = localStorage.getItem('authToken') || localStorage.getItem('token') || localStorage.getItem('nexopa_token');
                if (token) {
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]));
                        return payload?.id || payload?.userId || payload?.sub || null;
                    }
                }
            } catch (_) {}
            return null;
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
                if (SOCKET_CONFIG.debug) console.log('[Realtime] Opening raw WebSocket fallback', wsUrl.replace(/token=[^&]+/, 'token=***'));
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
                if (SOCKET_CONFIG.debug) console.log('[Realtime] ✅ WebSocket OPEN');
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

            // FIX-CALL-RECOVERY: matching counterpart to the SOCKET_CONNECTED fix
            // above — subsystems (e.g. WebRTCSessionOrchestrator) need to know a
            // real disconnect happened, not just infer it from the next reconnect.
            if (window.KynectaEventBus) {
                window.KynectaEventBus.emit('SOCKET_DISCONNECTED', {
                    reason: (event && event.reason) || 'connection_lost',
                    timestamp: Date.now()
                });
            }

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
                    const recoveryDelay = 60000; // wait 60s before attempting recovery
                    if (SOCKET_CONFIG.debug) console.log(`[Realtime] DEGRADED — will attempt recovery in ${recoveryDelay / 1000}s`);
                    this._degradedRecoveryTimer = setTimeout(() => {
                        this._degradedRecoveryTimer = null;
                        if (this._state === CONNECTION_STATE.DEGRADED && navigator.onLine) {
                            if (SOCKET_CONFIG.debug) console.log('[Realtime] Auto-recovering from DEGRADED...');
                            this._reconnectAttempts = 0;
                            this._consecutiveErrors = 0;
                            this._connectInternal();
                        }
                    }, recoveryDelay);
                }
            }
        }

        _routeMessage(message) {
            if (!message) return;

            if (message.type === 'message' && message.message && typeof message.message === 'object') {
                this._routeMessage({ ...message.message, transportMeta: { from: message.from, timestamp: message.timestamp } });
                return;
            }

            // FIX-MSG-DELIVERY: Normalize chatId so messages-core always has a valid chatId.
            // Backend may send conversationId, chat_id, or roomId instead of chatId.
            if (message.payload && typeof message.payload === 'object') {
                const p = message.payload;
                if (!p.chatId && (p.conversationId || p.chat_id || p.roomId || p.conversation_id)) {
                    p.chatId = p.conversationId || p.chat_id || p.roomId || p.conversation_id;
                }
                // Also normalize nested message object
                if (p.message && typeof p.message === 'object' && !p.message.chatId) {
                    p.message.chatId = p.message.chatId || p.chatId || p.conversationId || p.chat_id;
                }
            }

            // FIX #15 — CANONICAL EVENT NORMALIZATION: alias events map to one canonical type.
            // This prevents duplicate UI updates when both 'new_message' and 'message:new' fire.
            const EVENT_CANONICAL = {
                'new_message':       'message:new',
                'chat:message':      'message:new',
                'MESSAGE_RECEIVED':  'message:new',
                'message_deleted':   'message:delete',
                'message_seen':      'message:read',
                'message_read':      'message:read',
                'message_delivered': 'message:delivered',
                'incoming_call':     'call:incoming',
                'CALL_INCOMING':     'call:incoming',
                'call_incoming':     'call:incoming',
                'call_accepted':     'call:accepted',
                'call_answered':     'call:accepted',
                'call_rejected':     'call:rejected',
                'call_cancelled':    'call:cancelled',
                'call_ended':        'call:ended',
                'call_force_ended':  'call:ended',
                'webrtc_signal':     'webrtc:signal',
            };
            const canonicalType = EVENT_CANONICAL[message.type] || message.type;
            if (canonicalType !== message.type) {
                message = { ...message, type: canonicalType };
            }

            // FIX #15 — DEDUP: drop identical payloads arriving within dedup window
            // Different event types get different windows:
            //   - call:incoming / call events: 5000ms (multiple socket bindings fire at once)
            //   - message events: 800ms (normal duplicate suppression)
            if (!this._recentRouted) this._recentRouted = new Map();
            if (message.payload?.id || message.payload?.messageId || message.payload?.callId) {
                const _isCallEvent = canonicalType.startsWith('call:') || canonicalType.startsWith('call_') || canonicalType.includes('call');
                const _dedupWindow = _isCallEvent ? 5000 : 800;
                const dedupKey = canonicalType + ':' + (message.payload.callId || message.payload.id || message.payload.messageId);
                const lastSeen = this._recentRouted.get(dedupKey) || 0;
                if (Date.now() - lastSeen < _dedupWindow) return; // duplicate — drop
                this._recentRouted.set(dedupKey, Date.now());
                // Prune map periodically
                if (this._recentRouted.size > 200) {
                    const cutoff = Date.now() - 10000;
                    for (const [k, v] of this._recentRouted) { if (v < cutoff) this._recentRouted.delete(k); }
                }
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

            // FIX: Dispatch kyn: CustomEvents so calls-core.js, group-core.js, friend-core.js
            // etc. can listen via window.addEventListener('kyn:call:incoming', ...) without
            // needing a direct Socket.IO connection inside the iframe.
            // Normalize event type: both colon-style and underscore-style produce the canonical kyn: event.
            if (message.type) {
                const evType = message.type;
                const payload = message.payload || {};

                // Always dispatch kyn:<original> form
                try { window.dispatchEvent(new CustomEvent('kyn:' + evType, { detail: payload })); } catch (_) {}

                // For call events: also normalize underscore→colon so 'call_ended' fires 'kyn:call:ended'
                // FIX-PHASE15: Fan out call:incoming and message:new to ALL iframes immediately.
                // calls.html and message.html run in iframes and MUST receive these events.
                if (evType === 'call:incoming' || evType === 'incoming_call' || evType === 'call_incoming') {
                    try {
                        var _callFrames = document.querySelectorAll('iframe');
                        _callFrames.forEach(function(f) {
                            try {
                                f.contentWindow.postMessage({ type: 'REALTIME_EVENT:call:incoming', payload: payload }, '*');
                                f.contentWindow.postMessage({ type: 'REALTIME_EVENT:incoming_call', payload: payload }, '*');
                                f.contentWindow.postMessage({ type: evType, payload: payload }, '*');
                            } catch(_) {}
                        });
                        window.dispatchEvent(new CustomEvent('kyn:call:incoming', { detail: payload }));
                        window.dispatchEvent(new CustomEvent('kyn:incoming_call',  { detail: payload }));
                    } catch(_) {}
                }

                if (evType === 'message:new' || evType === 'new_message' || evType === 'chat:message') {
                    try {
                        // FIX (MESSAGE-RELAY-CONSOLIDATION): this broadcasts to
                        // every iframe under two different event names AND
                        // dispatches kyn:message:new below (which chat.html's
                        // own relay listener also acts on) — confirmed to
                        // triple-deliver the same message alongside chat.html's
                        // two relay paths. Only proceed if the shared gate says
                        // nothing has claimed this message yet.
                        var _claimedFirst = !window.__kynRelayMessageOnce || window.__kynRelayMessageOnce(null, 'message:new', payload);
                        if (_claimedFirst) {
                            var _msgFrames = document.querySelectorAll('iframe');
                            _msgFrames.forEach(function(f) {
                                try {
                                    f.contentWindow.postMessage({ type: 'message:new', payload: payload }, '*');
                                    f.contentWindow.postMessage({ type: 'new_message',  payload: payload }, '*');
                                } catch(_) {}
                            });
                        }
                        // PHASE15 FIX: Also fire on parent window so chat.html catches it
                        // even when messages-core runs in the same frame (no iframe).
                        try { window.dispatchEvent(new CustomEvent('kyn:message:new', { detail: payload })); } catch(_) {}
                        try { window.dispatchEvent(new CustomEvent('kyn:new_message',  { detail: payload })); } catch(_) {}
                        // PHASE15 FIX: Persist incoming message to localStorage so it survives
                        // if the user is on a different screen when the message arrives.
                        // messages-core flushes kyn_pending_messages on load / tab focus.
                        try {
                            if (payload && payload.id) {
                                var _pq = JSON.parse(localStorage.getItem('kyn_pending_messages') || '[]');
                                var _alreadyQueued = _pq.some(function(m) { return String(m.id) === String(payload.id); });
                                if (!_alreadyQueued) {
                                    _pq.push(Object.assign({}, payload, { _arrivedAt: Date.now() }));
                                    // Keep last 200 messages max
                                    if (_pq.length > 200) _pq = _pq.slice(-200);
                                    localStorage.setItem('kyn_pending_messages', JSON.stringify(_pq));
                                }
                            }
                        } catch(_) {}
                        // PHASE15 FIX-PHASE-A: Also persist to IndexedDB immediately via
                        // KynectaLocalStore so messages survive page refresh / logout / restart.
                        // localStorage alone is wiped by browser private mode and storage quota.
                        try {
                            if (payload && payload.id && window.KynectaLocalStore) {
                                var _msg = Object.assign({}, payload);
                                // Ensure chatId is set — fall back to conversationId
                                if (!_msg.chatId && _msg.conversationId) _msg.chatId = _msg.conversationId;
                                if (_msg.chatId) {
                                    window.KynectaLocalStore.saveMessage(_msg).catch(function(){});
                                }
                            }
                        } catch(_) {}
                    } catch(_) {}
                }

                // PHASE15 FIX: Fan out ALL call and webrtc events to ALL iframes.
                // Previously only call:incoming was fanned out — this meant the calls.html
                // iframe NEVER received call:accepted, call:ended, call:rejected etc.
                // Result: caller stayed stuck on outgoing screen; ending/rejecting only
                // closed one side. Now every call-related event is forwarded in both
                // colon (call:accepted) and underscore (call_accepted) forms so all
                // listener patterns in calls-core.js and calls-ui.js are satisfied.
                if (evType.startsWith('call') || evType.startsWith('webrtc') || evType.startsWith('ice')) {
                    try {
                        var _callAllFrames = document.querySelectorAll('iframe');
                        var _colonForm = evType.indexOf('_') !== -1 ? evType.replace(/_/g, ':') : evType;
                        var _underForm = evType.indexOf(':') !== -1 ? evType.replace(/:/g, '_') : evType;
                        _callAllFrames.forEach(function(f) {
                            try {
                                // Always send original form
                                f.contentWindow.postMessage({ type: evType, payload: payload }, '*');
                                // Send colon form if different
                                if (_colonForm !== evType) f.contentWindow.postMessage({ type: _colonForm, payload: payload }, '*');
                                // Send underscore form if different
                                if (_underForm !== evType) f.contentWindow.postMessage({ type: _underForm, payload: payload }, '*');
                                // Also REALTIME_EVENT prefix form for compatibility
                                f.contentWindow.postMessage({ type: 'REALTIME_EVENT:' + evType, payload: payload }, '*');
                            } catch(_) {}
                        });
                        // Also normalise kyn: dispatch for same-frame listeners
                        if (_colonForm !== evType) {
                            try { window.dispatchEvent(new CustomEvent('kyn:' + _colonForm, { detail: payload })); } catch (_) {}
                        }
                    } catch(_) {}
                }

                // For message events: fire kyn:message:new, kyn:message:read etc.
                if (evType.startsWith('message') || evType === 'new_message' || evType === 'receive_message') {
                    const colonMsg = evType.replace(/_/g, ':');
                    if (colonMsg !== evType) {
                        try { window.dispatchEvent(new CustomEvent('kyn:' + colonMsg, { detail: payload })); } catch (_) {}
                    }
                }

                // ── PHASE11: COR canonical event normalization ──────────────────────
                const _corNorm = window.__COR?.normalize?.(evType);
                if (_corNorm && _corNorm !== evType) {
                    // Dispatch with canonical name too
                    try {
                        window.dispatchEvent(new CustomEvent(`kyn:${_corNorm}`, {
                            detail: payload
                        }));
                    } catch (_) {}
                }

                // ── PHASE10: entity:deleted → DeletionRegistry + cache eviction ───────
                if (evType === 'entity:deleted' || evType === 'entity_deleted') {
                    try {
                        const reg = window.__PHASE10_DeletionRegistry;
                        if (reg && payload) {
                            const eType = payload.entityType || 'unknown';
                            const eId   = payload.entityId  || payload.id;
                            if (eId) reg.mark(eType, String(eId), payload.reason || 'deleted');
                        }
                    } catch (_) {}
                }

                // ── PHASE10: message:patch → incremental entity update ────────────────
                if (evType === 'message:patch' || evType === 'message_patch') {
                    try {
                        if (payload && payload.op === 'delete' && payload.id) {
                            window.__PHASE10_DeletionRegistry?.mark('message', String(payload.id), 'deleted');
                        }
                    } catch (_) {}
                    // Forward to messages-core for processing
                    try { window.dispatchEvent(new CustomEvent('kyn:message:patch', { detail: payload })); } catch (_) {}
                }

                // ── PHASE10: lan:message → route to messages-core as normal message ──
                if (evType === 'lan:message' || evType === 'lan_message') {
                    try {
                        const lanMsg = payload?.message || payload?.data || payload;
                        if (lanMsg) {
                            window.dispatchEvent(new CustomEvent('kyn:new_message', { detail: { ...lanMsg, _transport: 'LAN' } }));
                        }
                    } catch (_) {}
                }

                // ── Phase 4+6: Group events fan-out to sibling iframes ───────────────────
                // FIX (PROFILE-LIVE-UPDATE): added 'profile:' so a profile:updated event
                // (emitted by the backend whenever a user changes their avatar/cover —
                // see profileController.js) reaches every module iframe (status, friend,
                // group, message) the same way group:/status: events already do, instead
                // of only ever updating the parent chat.html header.
                if (evType.startsWith('group:') || evType.startsWith('status:') ||
                    evType.startsWith('device:') || evType.startsWith('session:') ||
                    evType.startsWith('profile:')) {
                    // Fan-out to all iframes using REALTIME_EVENT pattern
                    var _iframesP4 = document.querySelectorAll('iframe');
                    _iframesP4.forEach(function(f) {
                        try { f.contentWindow.postMessage({ type: 'REALTIME_EVENT:' + evType, payload: payload }, '*'); } catch (_) {}
                    });
                    // Also emit on KynectaEventBus for same-frame Phase 4 modules
                    if (window.KynectaEventBus) {
                        window.KynectaEventBus.emit('REALTIME_' + evType, payload, { async: true });
                    }
                }
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
                if (document.visibilityState === 'hidden') {
                    this._hiddenAt = Date.now();
                    return;
                }
                // Tab became visible
                const hiddenMs = this._hiddenAt ? Date.now() - this._hiddenAt : 0;
                this._hiddenAt = null;

                if (!navigator.onLine || this._manualDisconnect) return;

                if (this._state !== CONNECTION_STATE.AUTHENTICATED) {
                    // Clearly disconnected — reconnect immediately
                    this._reconnectAttempts = 0;
                    this.handleReconnect({ reason: 'visibility-not-auth' });
                    return;
                }

                // FIX-020: Even if state says AUTHENTICATED, verify with a ping after
                // long background periods (browser may have throttled/killed the WS).
                if (hiddenMs > 10000 && this._socket && this._socket.connected) {
                    let pongReceived = false;
                    const pingTimeout = setTimeout(() => {
                        if (!pongReceived) {
                            console.warn('[Realtime] Ping timeout after background — forcing reconnect');
                            this._reconnectAttempts = 0;
                            this.handleReconnect({ reason: 'ping-timeout-visibility' });
                        }
                    }, 10000); // FIX: increased from 5s to 10s — 5s fired too quickly after throttled tabs
                    try {
                        this._socket.once('pong', () => {
                            pongReceived = true;
                            clearTimeout(pingTimeout);
                            // PHASE10: Tab returned and socket is alive — flush offline queue
                            setTimeout(() => {
                                try { window.__OfflineMessageQueue?.flushAll?.(); } catch(_) {}
                                try { window.__PHASE10_DeletionRegistry?.syncFromServer?.(Date.now() - 3_600_000); } catch(_) {}
                            }, 500);
                        });
                        this._socket.emit('ping');
                    } catch(_) {
                        clearTimeout(pingTimeout);
                        this.handleReconnect({ reason: 'ping-emit-failed' });
                    }
                } else if (hiddenMs > 0 && hiddenMs <= 10000) {
                    // Short background — just flush the queue in case anything queued
                    setTimeout(() => {
                        try { window.__OfflineMessageQueue?.flushAll?.(); } catch(_) {}
                    }, 300);
                }
            });
        }

        _sendMessage(message, options = {}) {
            return new Promise((resolve, reject) => {
                // FIX-ACK-LOST-ON-RECONNECT: this used to read
                // `!this._socket.readyState === WebSocket.OPEN`, which — due to JS
                // operator precedence — evaluates `!this._socket.readyState` FIRST
                // (a boolean) and then compares that boolean to the numeric constant
                // WebSocket.OPEN (1). A boolean is never strictly equal to 1, so this
                // half of the condition was always false, collapsing the whole check
                // down to just `!this._socket`. Practically: as long as a socket
                // object existed at all — even mid-reconnect, even fully
                // disconnected — this code skipped the retry-queue and emitted
                // directly on the old socket instance. _connectSocketIO() replaces
                // `this._socket` wholesale on every reconnect, so anything emitted
                // into a disconnected socket during that window (e.g. the receiver's
                // 'message:delivery_ack') was silently discarded when the old socket
                // got torn down — never retried, because _queueMessage()'s
                // reconnect-flush path was never reached. Fixed to properly check
                // readyState so a not-yet-open/torn-down socket falls through to
                // _queueMessage(), which _processQueue() correctly re-sends once the
                // new socket authenticates.
                if (!this._socket || (!this._socket.connected && this._socket.readyState !== WebSocket.OPEN)) {
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
            this._clearReconnectTimer();

            // FIX-WAKE: Backends on sleeping infra (e.g. Render free tier) can take
            // far longer than our normal backoff ceiling to wake up — a stalled
            // deploy, a slow migration, or a dyno that was fully spun down for hours.
            // We must NEVER stop trying permanently (that requires a manual refresh,
            // which real messaging apps never require). Once we exhaust the normal
            // exponential-backoff attempts, drop into an indefinite slow-poll mode:
            // keep retrying at a fixed interval forever, just less aggressively.
            const exhausted = this._reconnectAttempts >= SOCKET_CONFIG.reconnectAttempts;

            if (exhausted) {
                if (this._state !== CONNECTION_STATE.DEGRADED) {
                    console.warn('[Realtime] Max fast-reconnect attempts reached — switching to indefinite slow-poll (backend may still be waking up)');
                    this._state = CONNECTION_STATE.DEGRADED;
                    this._emitStateChange();
                }

                const slowPollDelay = SOCKET_CONFIG.reconnectMaxDelay; // e.g. 60s, forever
                this._reconnectTimer = setTimeout(() => {
                    // Don't increment _reconnectAttempts further — stay in slow-poll
                    // mode until a connection actually succeeds (which resets it to 0).
                    this._connectInternal();
                }, slowPollDelay);
                return;
            }

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
                'message:seen', 'message_seen', 'message:deleted', 'message_deleted',
                // PHASE10: entity:deleted carries tombstone payloads for cache invalidation
                'entity:deleted', 'message:patch',
                // PHASE10: LAN delivery events
                'lan:message',
            ];

            const callEvents = [
                'call:incoming', 'call_incoming', 'incoming_call', 'CALL_INCOMING',
                'call:accepted', 'call_accepted', 'call:answered', 'call_answered',
                'call:rejected', 'call_rejected',
                'call:ended', 'call_ended', 'call_force_ended',
                'call:cancelled', 'call_cancelled',
                'call:initiated', 'call_initiated',
                // FIX-CALLID-MISMATCH: the server emits 'call:initiated_ack' with the
                // real server-generated callId right after 'call:initiated', but this
                // event was never in the forwarded-events list — so the socket never
                // subscribed to it, calls-core.js's ready-and-waiting
                // handleCallInitiatedAck() never ran, and the client kept tracking
                // every call under its own locally-generated id forever. Every real
                // signal about that call from then on (accept/end/offer/answer) arrives
                // tagged with the server's real UUID, never matches, and gets rejected
                // as "mismatched callId" — which is also what causes the call to look
                // like it self-terminates almost immediately on the other end.
                'call:initiated_ack', 'call_initiated_ack',
                'webrtc:signal', 'webrtc_signal',
                'call:ringing', 'call_ringing',
                // FIX: These were missing — calls-core.js emits and listens for these
                'call:webrtc_offer', 'call:webrtc_answer',
                'call:ice_candidate', 'call_ice_candidate', 'ice_candidate',
                'call:receiver_offline', 'call:no_answer', 'call:receiver_ack',
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

            const marketplaceEvents = [
                'product:updated', 'product:created', 'product:deleted', 'product:stock_updated',
                'order:created', 'order:status_changed', 'payment:confirmed',
                'review:new', 'delivery:updated',
            ];
            // ── Phase 4+6 INTEGRATION: Group + Status events added to socket listener registration ──
            const groupEvents = [
                'group:message', 'group:reaction', 'group:reply', 'group:edit',
                'group:delete', 'group:deleted', 'group:typing', 'group:join',
                'group:leave', 'group:kick', 'group:ban', 'group:unban',
                'group:mute', 'group:unmute', 'group:presence', 'group:update',
                'group:updated', 'group:role_update', 'group:pin', 'group:announcement',
                'group:membership_change', 'group:slow_mode', 'group:read_receipt',
                'group:member_joined', 'group:member_left', 'group:rejoin_ack',
                // P1/P2 FIX: New server events
                'group:message:pinned', 'group:message:unpinned',
                'group:mention:everyone',
                'group:member:auto_muted', 'group:member:warned',
                'group:settings:updated',
                'group:poll:closed',
                'group:messages:disappeared',
                'group:verified',
                'group:finance:created',
            ];

            const statusEvents = [
                'status:new', 'status:created', 'status:viewed', 'status:view',
                'status:reaction', 'status:reply', 'status:deleted', 'status:expired',
                'status:privacy_updated', 'status:highlight_added',
            ];

            const phase5Events = [
                'device:registered', 'device:trust_updated', 'session:revoked',
                'session:restored', 'reconnect:required', 'turn:config',
                'security:replay_rejected',
                // FIX: presence events were never registered — user online/offline
                // indicators never updated without these
                'user:online', 'user:offline',
                // FIX: typing indicators were never forwarded to iframes
                'typing:start', 'typing:stop',
                // FIX: group:localSync for memberCount updates
                'group:localSync',
                // FIX: chat:read event
                'chat:read',
            ];

            const allEvents = [...messageEvents, ...callEvents, ...friendEvents, ...marketplaceEvents, ...groupEvents, ...statusEvents, ...phase5Events,
                // FIX-GROUP-INVITE: group invitation events were never forwarded to iframes
                'group:invitation', 'group:invite', 'group_invitation', 'group_invite',
                'group:invitation_received', 'invitation:received', 'group:invitation_sent',
                'notification:new',
            ];

            if (this._socket && typeof this._socket.on === 'function') {
                // Use RealtimeStabilizationLayer.safeOn if available to prevent duplicate listeners
                const _stabLayer = window.__RealtimeStabilizationLayer;
                // FIX-5: Store handlers in a Map so we can call socket.off(evt, handler)
                // before re-attaching on reconnect. This prevents MaxListenersExceededWarning
                // caused by accumulated duplicate listeners across reconnect cycles.
                if (!this._socketHandlerMap) this._socketHandlerMap = new Map();
                const _safeOn = (evt, fn) => {
                    if (_stabLayer?.safeOn) {
                        return _stabLayer.safeOn(this._socket, evt, fn);
                    }
                    // Remove any previously registered handler for this event first
                    if (this._socketHandlerMap.has(evt)) {
                        try { this._socket.off(evt, this._socketHandlerMap.get(evt)); } catch(_) {}
                    }
                    this._socketHandlerMap.set(evt, fn);
                    this._registeredSocketListeners.add(evt);
                    this._socket.on(evt, fn);
                    return () => { this._socket.off(evt, fn); this._socketHandlerMap.delete(evt); };
                };

                allEvents.forEach(eventType => {
                    if (this._registeredSocketListeners.has(eventType)) return;
                    this._registeredSocketListeners.add(eventType);

                    _safeOn(eventType, (payload) => {
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

                // ── FIX: settings_updated listener ────────────────────────────────────
                // Root cause: no listener was registered for this event, so even when
                // the server emitted it nothing happened client-side — settings changes
                // made on one device/tab were invisible to all other open tabs.
                //
                // Fix: register all known server-side naming variants, then for each:
                //   1. Post SOCKET_EVENT / settings_updated to the parent frame so
                //      chat.html picks it up and fans it out to every module iframe.
                //   2. Directly merge the updated settings into window.AppSettings if
                //      that object exists in this frame (covers same-frame consumers).
                const settingsEventNames = [
                    'settings_updated',   // canonical server event
                    'settings:updated',   // colon-style alias some backends use
                    'user_settings_updated',
                    'profile_updated',    // some backends fold profile + settings together
                ];

                settingsEventNames.forEach(eventType => {
                    if (this._registeredSocketListeners.has(eventType)) return;
                    this._registeredSocketListeners.add(eventType);

                    this._socket.on(eventType, (payload) => {
                        const settings = (payload && typeof payload === 'object')
                            ? (payload.settings || payload.data || payload)
                            : {};

                        // 1. Post to parent frame → chat.html fans out to all module iframes
                        const outbound = {
                            type:    'SOCKET_EVENT',
                            event:   'settings_updated',
                            payload: settings,
                            source:  'realtime-socket',
                            timestamp: Date.now()
                        };
                        try { window.parent.postMessage(outbound, '*'); } catch (_) {}
                        // Also dispatch as a local window event so same-frame listeners fire
                        try {
                            window.dispatchEvent(new CustomEvent('settings_updated', { detail: settings }));
                            window.dispatchEvent(new CustomEvent('kyn:settingsUpdated', { detail: settings }));
                        } catch (_) {}

                        // 2. Merge directly into window.AppSettings if available
                        if (window.AppSettings && typeof window.AppSettings === 'object' &&
                            settings && typeof settings === 'object') {
                            if (typeof window.AppSettings.merge === 'function') {
                                window.AppSettings.merge(settings, { silent: false, source: 'realtime-socket' });
                            }
                        }

                        // 3. Route through the standard bridge so EventBus subscribers also fire
                        this._routeMessage({ type: eventType, payload: settings });

                        if (window.KynectaEventBus) {
                            window.KynectaEventBus.emit('REALTIME_settings_updated', settings, { async: true });
                        }
                    });
                });
                // ── end settings_updated fix ──────────────────────────────────────────

                // ── FIX (IDENTITY-CENTRALIZATION): profile/avatar/cover/username/bio/
                // privacy update relay ──────────────────────────────────────────────
                // Root cause: the server now emits profile:update / avatar:update /
                // cover:update / username:update / bio:update / privacy:update
                // (see identityBroadcastService.js) whenever ANY user's identity
                // changes — the owner's own devices, but also every friend and group
                // co-member. Without a listener here, none of that reached the
                // module iframes (messages, friends, groups, calls, status,
                // marketplace, search, notifications all live in iframes off
                // chat.html), so the only thing that ever updated was the editor's
                // own settings screen. Relay it exactly like settings_updated above:
                // postMessage to the parent frame (which chat.html fans out to every
                // module iframe) + a local CustomEvent for same-frame listeners +
                // direct application to IdentityProfileStore.js's window.Identity
                // cache if that store is loaded in this frame.
                const identityEventNames = [
                    'profile:update', 'avatar:update', 'cover:update',
                    'username:update', 'bio:update', 'displayName:update', 'privacy:update',
                ];

                identityEventNames.forEach(eventType => {
                    if (this._registeredSocketListeners.has(eventType)) return;
                    this._registeredSocketListeners.add(eventType);

                    this._socket.on(eventType, (payload) => {
                        // 1. Post to parent frame -> chat.html fans out to all module iframes
                        const outbound = {
                            type: 'SOCKET_EVENT',
                            event: eventType,
                            payload,
                            source: 'realtime-socket',
                            timestamp: Date.now()
                        };
                        try { window.parent.postMessage(outbound, '*'); } catch (_) {}

                        // 2. Fan out directly to every iframe on THIS page too (covers the
                        //    case where this socket lives inside the parent shell itself).
                        try {
                            document.querySelectorAll('iframe').forEach((f) => {
                                try { f.contentWindow.postMessage(outbound, '*'); } catch (_) {}
                            });
                        } catch (_) {}

                        // 3. Same-frame consumers (kyn: CustomEvent + direct store update)
                        try { window.dispatchEvent(new CustomEvent('kyn:' + eventType, { detail: payload })); } catch (_) {}
                        try { if (window.Identity && typeof window.Identity.applyUpdate === 'function') window.Identity.applyUpdate(payload); } catch (_) {}

                        // 4. Standard bridge + EventBus, same as every other event above
                        this._routeMessage({ type: eventType, payload });
                        if (window.KynectaEventBus) {
                            window.KynectaEventBus.emit('REALTIME_' + eventType, payload, { async: true });
                        }
                    });
                });
                // ── end identity relay fix ─────────────────────────────────────────

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
        off: realtimeManager.off.bind(realtimeManager),
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

    // FIX (Issue 5): Dedup set to prevent FRIENDS_SYNC relay storm
    var _friendsSyncSeen = new Set();
    window.addEventListener('message', function (evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        const { type, payload } = evt.data;

        // FIX: Cross-module friend sync relay — rebroadcast FRIENDS_SYNC, FRIENDS_DATA
        // and FRIEND_RELATIONSHIP_CHANGED to every OTHER iframe so chat, calls, status,
        // groups all see updated friends instantly without a poll cycle.
        if (type === 'FRIENDS_SYNC' || type === 'FRIENDS_DATA' || type === 'FRIEND_RELATIONSHIP_CHANGED') {
            // FIX (Issue 5): Deduplicate by timestamp to prevent relay storm
            const _dedupKey = type + ':' + (evt.data.timestamp || 0);
            if (_friendsSyncSeen.has(_dedupKey)) return;
            _friendsSyncSeen.add(_dedupKey);
            // Prune old keys (keep last 50)
            if (_friendsSyncSeen.size > 50) {
                const _iter = _friendsSyncSeen.values();
                _friendsSyncSeen.delete(_iter.next().value);
            }
            var _iframes = document.querySelectorAll('iframe');
            _iframes.forEach(function (frame) {
                if (frame.contentWindow === evt.source) return; // don't echo back to sender
                try { frame.contentWindow.postMessage(evt.data, '*'); } catch (_) {}
            });
            if (evt.data.friends && Array.isArray(evt.data.friends)) {
                window.friends = evt.data.friends;
                window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { friends: evt.data.friends, source: type } }));
            }
            return;
        }

        // Relay FRIEND_ACCEPTED / FRIEND_REMOVED to all sibling iframes
        if (type === 'FRIEND_ACCEPTED' || type === 'FRIEND_REQUEST_ACCEPTED' ||
            type === 'FRIEND_REMOVED'  || type === 'FRIEND_REJECTED') {
            var _iframes2 = document.querySelectorAll('iframe');
            _iframes2.forEach(function (frame) {
                if (frame.contentWindow === evt.source) return;
                try { frame.contentWindow.postMessage(evt.data, '*'); } catch (_) {}
            });
            return;
        }

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

        // ── FIX: REALTIME_SEND relay — child iframes proxy socket sends through parent ──
        // When calls-core / messages-core / friend-core (inside iframes) call
        // KynectaRealtime.send() they post REALTIME_SEND to window.parent.
        // Without this handler the message was silently dropped — nothing ever
        // reached the Socket.IO server, so calls never rang and messages had no ACK.
        if (type === 'REALTIME_SEND' && evt.data.eventType) {
            const evType = evt.data.eventType;
            const evPayload = evt.data.payload || {};
            try {
                realtimeManager.send(evType, evPayload);
            } catch (_) {}
            return;
        }
    });

    function safeConnect(tokenOverride) {
        return Promise.resolve(
            realtimeManager.connect(tokenOverride || null)
        ).catch(function () { return null; });
    }

    function waitForSocketIO() {
        return new Promise((resolve) => {
            // Already loaded
            if (socketIOClient) { resolve(); return; }
            // Try picking it up from window.io immediately
            if (typeof window.io === 'function') {
                socketIOClient = window.io;
                resolve();
                return;
            }
            // Poll until window.io appears (CDN script loads async) or timeout
            const deadline = Date.now() + 5000;
            const iv = setInterval(() => {
                if (typeof window.io === 'function') {
                    socketIOClient = window.io;
                    clearInterval(iv);
                    resolve();
                } else if (Date.now() >= deadline) {
                    clearInterval(iv);
                    console.warn('[Realtime] socket.io client not found after 5s — will use raw WebSocket fallback');
                    resolve(); // resolve anyway; _connectInternal will fall back to raw WS
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
            'message:read', 'message_read',
            'message:seen', 'message_seen',
            'message:deleted', 'message_deleted'
        ]);

        realtimeManager.on('*', function (payload, fullMessage) {
            try {
                // fullMessage is the full {type, payload} object from _routeMessage.
                // payload is just fullMessage.payload — use fullMessage for the type.
                const eventType = (fullMessage && fullMessage.type) ? fullMessage.type : null;
                if (!eventType) return; // can't route without a type
                if (_SKIP_WILDCARD.has(eventType)) return; // already forwarded by chat.html wsService bridge

                const iframes = document.querySelectorAll('iframe');

                // BUG 2 FIX: Post BOTH the passthrough form AND the named-action form.
                // friend-core.js listens for FRIEND_REQUEST_ACCEPTED (named action).
                // Posting both forms ensures the sender's client updates its local
                // store and friend list regardless of which unwrapper path fires.
                if (eventType === 'friend:accepted') {
                    var _accId = 'rt_facc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                    iframes.forEach(function (frame) {
                        try {
                            // Passthrough form (for any direct REALTIME_EVENT:friend:accepted listeners)
                            frame.contentWindow.postMessage({ type: 'REALTIME_EVENT:friend:accepted', payload: payload || {}, id: _accId }, '*');
                            // Named-action form (for friend-core.js _handleMessage FRIEND_REQUEST_ACCEPTED case)
                            frame.contentWindow.postMessage({ type: 'FRIEND_REQUEST_ACCEPTED', payload: payload || {}, id: _accId + '_named' }, '*');
                        } catch (_) {}
                    });
                    return;
                }

                // BUG 2 FIX: Post BOTH the passthrough form AND the named-action form.
                // friend-core.js's _handleMessage switch-case listens for FRIEND_REQUEST_RECEIVED
                // (the named action). If only REALTIME_EVENT:friend:request is posted, the
                // REALTIME_EVENT: unwrapper must translate it — but if that path isn't matching,
                // the event is silently dropped and the receiver's incoming count stays 0.
                // Posting both forms guarantees delivery regardless of which unwrapper path fires.
                if (eventType === 'friend:request') {
                    var _reqId = 'rt_freq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                    iframes.forEach(function (frame) {
                        try {
                            // Passthrough form (for any direct REALTIME_EVENT:friend:request listeners)
                            frame.contentWindow.postMessage({ type: 'REALTIME_EVENT:friend:request', payload: payload || {}, id: _reqId }, '*');
                            // Named-action form (for friend-core.js _handleMessage FRIEND_REQUEST_RECEIVED case)
                            frame.contentWindow.postMessage({ type: 'FRIEND_REQUEST_RECEIVED', payload: payload || {}, id: _reqId + '_named' }, '*');
                        } catch (_) {}
                    });
                    return;
                }

                // FIX: friend:removed from server → also send FRIEND_REMOVED which is the
                // event type that friend-core.js's ParentCommunicationManager._handleMessage
                // listens for. Without this the friend list never updates in the iframes
                // when someone unfriends you (or when you unfriend someone on another tab).
                if (eventType === 'friend:removed') {
                    var _remId = 'rt_frem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                    iframes.forEach(function (frame) {
                        try { frame.contentWindow.postMessage({ type: 'REALTIME_EVENT:friend:removed', payload: payload || {}, id: _remId }, '*'); } catch (_) {}
                    });
                    return;
                }

                if (eventType === 'friend:rejected') {
                    var _rejId = 'rt_frej_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                    iframes.forEach(function (frame) {
                        try { frame.contentWindow.postMessage({ type: 'REALTIME_EVENT:friend:rejected', payload: payload || {}, id: _rejId }, '*'); } catch (_) {}
                    });
                    return;
                }

                // Marketplace events: also fire as CustomEvent for EcomMarketplace engines
                const _mpEvSet = new Set(['product:updated','product:created','product:deleted','product:stock_updated','order:created','order:status_changed','payment:confirmed','review:new','delivery:updated']);
                if (_mpEvSet.has(eventType)) {
                    try { window.dispatchEvent(new CustomEvent('realtime:' + eventType, { detail: payload || {} })); } catch (_) {}
                }

                var _evId = 'rt_ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                const eventMsg = {
                    type:    'REALTIME_EVENT:' + eventType,
                    payload: payload || {},
                    id:      _evId
                };
                iframes.forEach(function (frame) {
                    try { frame.contentWindow.postMessage(eventMsg, '*'); } catch (_) {}
                });

                // FIX: For group and status events, also dispatch kyn: CustomEvent
                // so modules listening via window.addEventListener('kyn:group:message') get it too
                if (eventType.startsWith('group:') || eventType.startsWith('status:')) {
                    try { window.dispatchEvent(new CustomEvent('kyn:' + eventType, { detail: payload || {} })); } catch (_) {}
                }

            } catch (_) {}
        });
    }

    realtimeManager.safeConnect = safeConnect;

    // ── FIX-6A: Guaranteed PARENT_READY broadcast to break AUTH_WAIT deadlock ────────
    // Child iframes (message.html, calls.html, group.html) wait for PARENT_READY before
    // proceeding. If AppStorage isn't ready within 8 seconds the iframes stall in AUTH_WAIT
    // indefinitely — calls never ring and messages never arrive.
    // Fix: broadcast PARENT_READY to ALL child frames after 8 seconds regardless of
    // AppStorage state, so iframes always unblock and can use their own token fallbacks.
    if (!_isInIframe) {
        (function _installParentReadyFallback() {
            var _parentReadySent = false;
            function _broadcastParentReady() {
                if (_parentReadySent) return;
                _parentReadySent = true;
                var iframes = document.querySelectorAll('iframe');
                var tok = window.__kynToken
                    || (window.AppStorage && (window.AppStorage.get('authToken') || window.AppStorage.get('token')))
                    || (() => { try { var ks = ['authToken','token','kyn_token','accessToken']; for (var k of ks) { var v = localStorage.getItem(k); if (v && v.startsWith('eyJ')) return v; } } catch(_){} return ''; })();
                var msg = { type: 'PARENT_READY', payload: { token: tok, timestamp: Date.now(), source: 'realtime-socket-fallback' } };
                iframes.forEach(function(f) { try { f.contentWindow.postMessage(msg, '*'); } catch(_) {} });
            }
            // Broadcast immediately when AppStorage signals ready
            window.addEventListener('AppStorageReady', _broadcastParentReady);
            // Guaranteed fallback: broadcast after 8 seconds regardless
            setTimeout(_broadcastParentReady, 8000);
        })();

        // ── FIX-6B: Guaranteed new_message / incoming_call fan-out ──────────────────
        // Intercept KynectaRealtime events at the source and push to ALL iframes.
        // This supplements the wildcard .on('*') bridge but fires EARLIER, directly
        // from the socket event, ensuring calls.html and message.html receive events
        // even if the wildcard bridge hasn't initialised yet.
        (function _installGuaranteedFanOut() {
            var _origOn = realtimeManager.on.bind(realtimeManager);
            var _fanOutEvents = new Set([
                'new_message', 'message:new', 'chat:message',
                'incoming_call', 'call:incoming', 'call_incoming'
            ]);
            // Monkey-patch on() so every time these events register we also fan-out
            // We do this by registering our own always-active listeners
            ['new_message', 'message:new', 'chat:message'].forEach(function(evt) {
                _origOn(evt, function(payload) {
                    // FIX (MESSAGE-RELAY-CONSOLIDATION): this is explicitly a
                    // third fan-out mechanism layered on top of the other two
                    // in this same file ("supplements the wildcard .on('*')
                    // bridge" per the comment above) — gate it through the
                    // shared registry so it only actually delivers if neither
                    // of the other paths already has.
                    var _claimed = !window.__kynRelayMessageOnce || window.__kynRelayMessageOnce(null, 'message:new', payload || {});
                    if (!_claimed) return;
                    var iframes = document.querySelectorAll('iframe');
                    iframes.forEach(function(f) {
                        try {
                            f.contentWindow.postMessage({ type: 'message:new',  payload: payload || {} }, '*');
                            f.contentWindow.postMessage({ type: 'new_message',  payload: payload || {} }, '*');
                        } catch(_) {}
                    });
                });
            });
            ['incoming_call', 'call:incoming', 'call_incoming'].forEach(function(evt) {
                _origOn(evt, function(payload) {
                    var iframes = document.querySelectorAll('iframe');
                    iframes.forEach(function(f) {
                        try {
                            f.contentWindow.postMessage({ type: 'incoming_call',              payload: payload || {} }, '*');
                            f.contentWindow.postMessage({ type: 'call:incoming',              payload: payload || {} }, '*');
                            f.contentWindow.postMessage({ type: 'REALTIME_EVENT:call:incoming', payload: payload || {} }, '*');
                            f.contentWindow.postMessage({ type: 'REALTIME_EVENT:incoming_call', payload: payload || {} }, '*');
                        } catch(_) {}
                    });
                    // Also dispatch as window CustomEvent for top-frame listeners
                    try { window.dispatchEvent(new CustomEvent('kyn:incoming_call', { detail: payload || {} })); } catch(_) {}
                });
            });
        })();

        // ── FIX-6C: Emit join_user_room after EVERY socket connection ─────────────
        // Ensure the server room join happens even when the socket reconnects silently
        realtimeManager.on('connected', function() {
            try {
                var myId = realtimeManager._getUserId ? realtimeManager._getUserId() : null;
                if (myId && realtimeManager._socket && typeof realtimeManager._socket.emit === 'function') {
                    realtimeManager._socket.emit('join_user_room', { userId: myId });
                }
            } catch(_) {}
        });
    }

    console.log('[Realtime] ✅ Ready (Socket.IO compatible v3.3.0)');
})();