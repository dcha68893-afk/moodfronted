// =============================================
// MESSAGES-CORE.js - DETERMINISTIC STATE MACHINE v4.0.1
// PARENT-SYNCHRONIZED MESSAGING ENGINE
// WITH PROPER CONSOLE LOGGING
// =============================================

(function() {
    'use strict';

    // =============================================
    // STATE MACHINE DEFINITION
    // =============================================
    /**
     * STATE MACHINE TRANSITIONS:
     * 
     * UNINITIALIZED → REGISTERING → REGISTERED → WAITING_FOR_SESSION → SESSION_ACTIVE → WAITING_FOR_TOKEN → TOKEN_READY → WS_INITIALIZING → WS_READY → SERVICES_INITIALIZING → READY
     *                                              ↓                      ↓                      ↓
     *                                         SESSION_FAILED         TOKEN_FAILED          WS_FAILED → ERROR_RECOVERABLE
     *                                              ↓                      ↓                      ↓
     *                                         ERROR_RECOVERABLE      ERROR_RECOVERABLE     ERROR_FATAL (after max retries)
     * 
     * ERROR_RECOVERABLE → REGISTERING (with backoff)
     * ERROR_FATAL → (terminal state, requires reload)
     */
    
    // =============================================
    // ENVIRONMENT DETECTION
    // =============================================
    const ENV = {
        isLocal: window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1',
        isRender: window.location.hostname.includes('.onrender.com'),
        getApiBaseUrl: function() {
            if (this.isLocal) {
                return 'http://localhost:4000';
            } else if (this.isRender) {
                const parts = window.location.hostname.split('.');
                if (parts.length >= 3) {
                    return `https://${parts.slice(-3).join('.')}`;
                }
                return 'https://api.onrender.com';
            }
            return '';
        }
    };

    // =============================================
    // CONSTANTS & CONFIGURATION
    // =============================================
    const VERSION = '4.0.1';
    const APP_NAME = 'kynecta-messages';
    const SOURCE_IFRAME = 'iframe';
    const FRAME_ID = 'messagesIframe';
    
    const PROTOCOL = {
        VERSION: 'KYN-2.0'
    };

    const MESSAGE_TYPES = {
        // Registration
        IFRAME_REGISTERED: 'IFRAME_REGISTERED',
        PARENT_READY: 'PARENT_READY',
        CHILD_READY: 'CHILD_READY',
        REGISTRATION_ACK: 'REGISTRATION_ACK',
        
        // Session
        SESSION_INIT: 'SESSION_INIT',
        SESSION_UPDATE: 'SESSION_UPDATE',
        SESSION_SYNC: 'SESSION_SYNC',
        SESSION_DATA: 'SESSION_DATA',
        SESSION_ACK: 'SESSION_ACK',
        REQUEST_SESSION: 'REQUEST_SESSION',
        SESSION_EXPIRED: 'SESSION_EXPIRED',
        VERIFY_SESSION: 'VERIFY_SESSION',
        SESSION_VERIFIED: 'SESSION_VERIFIED',
        TOKEN_UPDATE: 'TOKEN_UPDATE',
        TOKEN_RESPONSE: 'TOKEN_RESPONSE',
        
        // API
        API_REQUEST: 'API_REQUEST',
        API_RESPONSE: 'API_RESPONSE',
        
        // Messages
        SEND_MESSAGE: 'SEND_MESSAGE',
        MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
        MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
        MESSAGE_READ: 'MESSAGE_READ',
        TYPING_START: 'TYPING_START',
        TYPING_STOP: 'TYPING_STOP',
        
        // WebSocket
        WS_CONNECT: 'WS_CONNECT',
        WS_CONNECTED: 'WS_CONNECTED',
        WS_AUTHENTICATED: 'WS_AUTHENTICATED',
        WS_DISCONNECTED: 'WS_DISCONNECTED',
        WS_ERROR: 'WS_ERROR',
        
        // System
        ACK: 'ACK',
        ERROR: 'ERROR',
        HEARTBEAT: 'HEARTBEAT',
        HEARTBEAT_ACK: 'HEARTBEAT_ACK',
        PAGE_ACTIVATED: 'PAGE_ACTIVATED',
        FORCE_RELOAD: 'FORCE_RELOAD',
        MESSAGES_STATUS_WARNING: 'MESSAGES_STATUS_WARNING',
        LOGOUT: 'LOGOUT',
        NAVIGATE: 'NAVIGATE',
        PING: 'PING',
        PONG: 'PONG'
    };

    const LOCAL_STORAGE_KEYS = {
        SESSION_CACHE: 'kynecta_session_cache',
        USER_CACHE: 'kynecta_user_cache',
        MESSAGES_PREFIX: 'kynecta_messages_',
        CHATS_CACHE: 'kynecta_chats_cache',
        CONTACTS_CACHE: 'kynecta_contacts_cache',
        CHAT_THEMES: 'kynecta_chat_themes',
        DRAFTS: 'kynecta_message_drafts',
        OFFLINE_QUEUE: 'kynecta_offline_queue',
        SCHEDULED_MESSAGES: 'kynecta_scheduled_messages',
        USER_SETTINGS: 'kynecta_user_settings',
        BLOCKED_USERS: 'kynecta_blocked_users',
        ARCHIVED_CHATS: 'kynecta_archived_chats',
        STARRED_MESSAGES: 'kynecta_starred_messages',
        UI_STATE: 'kynecta_ui_state',
        MESSAGE_QUEUE: 'kynecta_message_queue'
    };

    // FIXED: Log levels - show INFO in all environments for initialization
    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };
    
    // Show INFO logs in all environments, DEBUG only in local
    const CURRENT_LOG_LEVEL = ENV.isLocal ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

    // Heartbeat configuration
    const HEARTBEAT = {
        failures: 0,
        maxFailures: 3,
        lastHeartbeat: 0,
        interval: null
    };

    // =============================================
    // STATE MACHINE - SINGLE SOURCE OF TRUTH
    // =============================================
    const StateMachine = {
        // States
        UNINITIALIZED: 'UNINITIALIZED',
        REGISTERING: 'REGISTERING',
        REGISTERED: 'REGISTERED',
        WAITING_FOR_SESSION: 'WAITING_FOR_SESSION',
        SESSION_ACTIVE: 'SESSION_ACTIVE',
        WAITING_FOR_TOKEN: 'WAITING_FOR_TOKEN',
        TOKEN_READY: 'TOKEN_READY',
        WS_INITIALIZING: 'WS_INITIALIZING',
        WS_READY: 'WS_READY',
        SERVICES_INITIALIZING: 'SERVICES_INITIALIZING',
        READY: 'READY',
        ERROR_RECOVERABLE: 'ERROR_RECOVERABLE',
        ERROR_FATAL: 'ERROR_FATAL',
        SESSION_FAILED: 'SESSION_FAILED',
        TOKEN_FAILED: 'TOKEN_FAILED',
        WS_FAILED: 'WS_FAILED',
        
        _currentState: 'UNINITIALIZED',
        _stateLock: false,
        _stateChangeListeners: new Set(),
        _transitionHistory: [],
        _maxHistory: 20,
        _initPromise: null,
        _initResolve: null,
        _initReject: null,
        
        init() {
            if (this._initPromise) return this._initPromise;
            
            this._initPromise = new Promise((resolve, reject) => {
                this._initResolve = resolve;
                this._initReject = reject;
            });
            
            return this._initPromise;
        },
        
        getState() {
            return this._currentState;
        },
        
        async transition(newState, reason = '') {
            // Atomic state transition with lock
            while (this._stateLock) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            this._stateLock = true;
            
            try {
                const oldState = this._currentState;
                
                // Validate transition
                if (!this._isValidTransition(oldState, newState)) {
                    Logger.error('StateMachine', `Invalid transition: ${oldState} → ${newState}${reason ? ' - ' + reason : ''}`);
                    this._stateLock = false;
                    return false;
                }
                
                // Log state changes
                if (newState === this.READY) {
                    Logger.success('StateMachine', `✅ ${oldState} → ${newState}${reason ? ' - ' + reason : ''}`);
                } else if (newState.includes('ERROR')) {
                    Logger.error('StateMachine', `❌ ${oldState} → ${newState}${reason ? ' - ' + reason : ''}`);
                } else {
                    Logger.info('StateMachine', `🔄 ${oldState} → ${newState}${reason ? ' - ' + reason : ''}`);
                }
                
                this._currentState = newState;
                
                // Record transition
                this._transitionHistory.push({
                    from: oldState,
                    to: newState,
                    reason,
                    timestamp: Date.now()
                });
                
                if (this._transitionHistory.length > this._maxHistory) {
                    this._transitionHistory.shift();
                }
                
                // Notify listeners
                this._notifyListeners(oldState, newState, reason);
                
                // Resolve init promise when READY
                if (newState === this.READY && this._initResolve) {
                    this._initResolve(true);
                    this._initResolve = null;
                    this._initReject = null;
                }
                
                // Reject init promise on fatal error
                if (newState === this.ERROR_FATAL && this._initReject) {
                    this._initReject(new Error(`Fatal error: ${reason}`));
                    this._initResolve = null;
                    this._initReject = null;
                }
                
                return true;
            } finally {
                this._stateLock = false;
            }
        },
        
        _isValidTransition(from, to) {
            const validTransitions = {
                [this.UNINITIALIZED]: [this.REGISTERING, this.ERROR_FATAL],
                [this.REGISTERING]: [this.REGISTERED, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.REGISTERED]: [this.WAITING_FOR_SESSION, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.WAITING_FOR_SESSION]: [this.SESSION_ACTIVE, this.SESSION_FAILED, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.SESSION_ACTIVE]: [this.WAITING_FOR_TOKEN, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.WAITING_FOR_TOKEN]: [this.TOKEN_READY, this.TOKEN_FAILED, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.TOKEN_READY]: [this.WS_INITIALIZING, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.WS_INITIALIZING]: [this.WS_READY, this.WS_FAILED, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.WS_READY]: [this.SERVICES_INITIALIZING, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.SERVICES_INITIALIZING]: [this.READY, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.READY]: [this.ERROR_RECOVERABLE, this.ERROR_FATAL, this.WAITING_FOR_SESSION], // Session expiry
                [this.ERROR_RECOVERABLE]: [this.REGISTERING, this.ERROR_FATAL], // Retry
                [this.ERROR_FATAL]: [], // Terminal
                [this.SESSION_FAILED]: [this.REGISTERING, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.TOKEN_FAILED]: [this.REGISTERING, this.ERROR_RECOVERABLE, this.ERROR_FATAL],
                [this.WS_FAILED]: [this.REGISTERING, this.ERROR_RECOVERABLE, this.ERROR_FATAL]
            };
            
            return validTransitions[from]?.includes(to) || false;
        },
        
        isInState(state) {
            return this._currentState === state;
        },
        
        isAtLeast(state) {
            const stateOrder = [
                this.UNINITIALIZED,
                this.REGISTERING,
                this.REGISTERED,
                this.WAITING_FOR_SESSION,
                this.SESSION_ACTIVE,
                this.WAITING_FOR_TOKEN,
                this.TOKEN_READY,
                this.WS_INITIALIZING,
                this.WS_READY,
                this.SERVICES_INITIALIZING,
                this.READY
            ];
            
            const currentIndex = stateOrder.indexOf(this._currentState);
            const targetIndex = stateOrder.indexOf(state);
            
            return currentIndex >= targetIndex && this._currentState !== this.ERROR_FATAL && this._currentState !== this.ERROR_RECOVERABLE;
        },
        
        canTransitionTo(state) {
            return this._isValidTransition(this._currentState, state);
        },
        
        onStateChange(callback) {
            this._stateChangeListeners.add(callback);
            return () => this._stateChangeListeners.delete(callback);
        },
        
        _notifyListeners(oldState, newState, reason) {
            this._stateChangeListeners.forEach(cb => {
                try {
                    cb(oldState, newState, reason);
                } catch (e) {}
            });
            
            // Dispatch event for UI
            window.dispatchEvent(new CustomEvent('messagesStateChanged', {
                detail: { oldState, newState, reason }
            }));
        },
        
        getTransitionHistory() {
            return [...this._transitionHistory];
        },
        
        reset() {
            this._currentState = this.UNINITIALIZED;
            this._transitionHistory = [];
            this._initPromise = null;
            this._initResolve = null;
            this._initReject = null;
        }
    };

    // =============================================
    // SILENT LOGGER - FIXED TO SHOW INITIALIZATION
    // =============================================
    const Logger = {
        _warned: new Set(),
        _logged: new Set(),
        _errors: new Map(),
        _success: new Set(),
        
        debug(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
                console.debug(`[${module}] ${message}`, data || '');
            }
        },
        
        info(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
                console.log(`[${module}] ${message}`, data || '');
            }
        },
        
        success(module, message, data = null) {
            const key = `${module}:${message}`;
            if (!this._success.has(key)) {
                console.log(`[${module}] ✅ ${message}`, data || '');
                this._success.add(key);
                // Keep success messages visible longer
                setTimeout(() => this._success.delete(key), 5000);
            } else {
                if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
                    console.log(`[${module}] ✅ ${message}`, data || '');
                }
            }
        },
        
        warn(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
                const key = `${module}:${message}`;
                if (!this._warned.has(key)) {
                    console.warn(`[${module}] ⚠️ ${message}`, data || '');
                    this._warned.add(key);
                    setTimeout(() => this._warned.delete(key), 60000);
                }
            }
        },
        
        error(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
                const key = `${module}:${message}`;
                const now = Date.now();
                const lastLog = this._errors.get(key) || 0;
                
                if (now - lastLog > 30000) {
                    console.error(`[${module}] ❌ ${message}`, data || '');
                    this._errors.set(key, now);
                }
            }
        },
        
        once(module, message, data = null) {
            const key = `${module}:${message}`;
            if (!this._logged.has(key)) {
                console.log(`[${module}] ${message}`, data || '');
                this._logged.add(key);
            }
        }
    };

    // =============================================
    // TOKEN AUTHORITY - PROMISE-BASED GOVERNANCE
    // =============================================
    const TokenAuthority = {
        _token: null,
        _tokenPromise: null,
        _tokenResolve: null,
        _tokenReject: null,
        _tokenReceived: false,
        _waitingForToken: false,
        _tokenTimeout: null,
        _maxWaitTime: 10000, // 10 seconds
        
        init() {
            this._resetPromise();
            return this;
        },
        
        _resetPromise() {
            this._tokenPromise = new Promise((resolve, reject) => {
                this._tokenResolve = resolve;
                this._tokenReject = reject;
            });
            
            // Set timeout for token receipt
            if (this._tokenTimeout) clearTimeout(this._tokenTimeout);
            this._tokenTimeout = setTimeout(() => {
                if (!this._tokenReceived && this._waitingForToken) {
                    this._tokenReject(new Error('Token timeout'));
                    Logger.error('TokenAuthority', 'Token timeout - no token received');
                    StateMachine.transition(StateMachine.ERROR_RECOVERABLE, 'token-timeout');
                }
            }, this._maxWaitTime);
        },
        
        waitForToken() {
            if (this._tokenReceived) {
                return Promise.resolve(this._token);
            }
            Logger.info('TokenAuthority', 'Waiting for token from parent');
            this._waitingForToken = true;
            return this._tokenPromise;
        },
        
        receiveToken(token, source = 'parent') {
            if (this._tokenReceived && this._token === token) {
                return; // Idempotent
            }
            
            this._token = token;
            this._tokenReceived = true;
            this._waitingForToken = false;
            
            if (this._tokenTimeout) {
                clearTimeout(this._tokenTimeout);
                this._tokenTimeout = null;
            }
            
            if (this._tokenResolve) {
                this._tokenResolve(token);
            }
            
            Logger.success('TokenAuthority', `Token received from ${source}`);
            
            // Transition state if waiting for token
            if (StateMachine.isInState(StateMachine.WAITING_FOR_TOKEN)) {
                StateMachine.transition(StateMachine.TOKEN_READY, 'token-received');
            }
        },
        
        getToken() {
            return this._token;
        },
        
        hasToken() {
            return !!this._token;
        },
        
        clearToken() {
            this._token = null;
            this._tokenReceived = false;
            this._resetPromise();
        },
        
        isWaiting() {
            return this._waitingForToken;
        }
    }.init();

    // =============================================
    // SESSION AUTHORITY - SINGLETON WITH PROMISE
    // =============================================
    const SessionAuthority = {
        _session: null,
        _sessionPromise: null,
        _sessionResolve: null,
        _sessionReject: null,
        _sessionReceived: false,
        _verificationInProgress: false,
        _verificationRequestId: null,
        _verificationResolve: null,
        _verificationReject: null,
        
        init() {
            this._resetPromise();
            return this;
        },
        
        _resetPromise() {
            this._sessionPromise = new Promise((resolve, reject) => {
                this._sessionResolve = resolve;
                this._sessionReject = reject;
            });
        },
        
        waitForSession() {
            if (this._sessionReceived) {
                return Promise.resolve(this._session);
            }
            Logger.info('SessionAuthority', 'Waiting for session from parent');
            return this._sessionPromise;
        },
        
        receiveSession(session) {
            if (this._sessionReceived) {
                // Update existing session
                this._session = { ...this._session, ...session };
                Logger.info('SessionAuthority', 'Session updated');
                return;
            }
            
            this._session = session;
            this._sessionReceived = true;
            
            if (this._sessionResolve) {
                this._sessionResolve(session);
            }
            
            Logger.success('SessionAuthority', 'Session received');
            
            // Transition state
            if (StateMachine.isInState(StateMachine.WAITING_FOR_SESSION)) {
                StateMachine.transition(StateMachine.SESSION_ACTIVE, 'session-received');
            }
        },
        
        async verifyWithParent() {
            if (this._verificationInProgress) {
                Logger.info('SessionAuthority', 'Verification already in progress');
                return this._verificationPromise;
            }
            
            this._verificationInProgress = true;
            this._verificationPromise = new Promise((resolve, reject) => {
                this._verificationResolve = resolve;
                this._verificationReject = reject;
            });
            
            this._verificationRequestId = SecurityUtils.generateMessageId();
            
            Logger.info('SessionAuthority', `Verifying session with parent (${this._verificationRequestId})`);
            
            const result = await MessageFirewall.send(
                MESSAGE_TYPES.VERIFY_SESSION,
                {
                    timestamp: Date.now(),
                    frameId: FRAME_ID,
                    requestId: this._verificationRequestId
                },
                { 
                    requiresAck: true, 
                    timeout: 5000,
                    requestId: this._verificationRequestId
                }
            );
            
            if (result.success && result.payload?.valid) {
                Logger.success('SessionAuthority', 'Session verification successful');
                this._verificationResolve(true);
            } else {
                Logger.warn('SessionAuthority', 'Session verification failed');
                this._verificationReject(new Error('Session verification failed'));
            }
            
            this._verificationInProgress = false;
            return this._verificationPromise;
        },
        
        handleVerificationResponse(message) {
            const requestId = message.requestId || message.payload?.requestId;
            
            if (requestId === this._verificationRequestId && this._verificationResolve) {
                const valid = message.payload?.valid === true;
                
                if (valid) {
                    Logger.success('SessionAuthority', `Verification response received (valid: true)`);
                    this._verificationResolve(true);
                } else {
                    Logger.warn('SessionAuthority', `Verification response received (valid: false)`);
                    this._verificationReject(new Error('Session invalid'));
                }
                
                this._verificationRequestId = null;
                this._verificationResolve = null;
                this._verificationReject = null;
                this._verificationInProgress = false;
            }
        },
        
        getSession() {
            return this._session;
        },
        
        hasSession() {
            return !!this._session;
        },
        
        clearSession() {
            this._session = null;
            this._sessionReceived = false;
            this._resetPromise();
        }
    }.init();

    // =============================================
    // WEBSOCKET CONTROLLER - SINGLE INSTANCE
    // =============================================
    const WSController = {
        // States
        UNINITIALIZED: 'UNINITIALIZED',
        CONNECTING: 'CONNECTING',
        CONNECTED: 'CONNECTED',
        AUTHENTICATING: 'AUTHENTICATING',
        READY: 'READY',
        RECONNECTING: 'RECONNECTING',
        CLOSED: 'CLOSED',
        ERROR: 'ERROR',
        
        _state: 'UNINITIALIZED',
        _ws: null,
        _connectPromise: null,
        _connectResolve: null,
        _connectReject: null,
        _reconnectAttempts: 0,
        _maxReconnectAttempts: 5,
        _baseDelay: 1000,
        _maxDelay: 30000,
        _heartbeatInterval: null,
        _heartbeatTimeout: null,
        _pendingMessages: [],
        _authenticated: false,
        _url: null,
        
        init() {
            return this;
        },
        
        async connect(url) {
            this._url = url;
            
            if (this._state === this.CONNECTING || this._state === this.AUTHENTICATING) {
                Logger.info('WSController', 'Connection already in progress');
                return this._connectPromise;
            }
            
            if (this._state === this.READY) {
                Logger.info('WSController', 'Already connected');
                return Promise.resolve(true);
            }
            
            this._state = this.CONNECTING;
            Logger.info('WSController', `Connecting to WebSocket: ${url}`);
            
            this._connectPromise = new Promise((resolve, reject) => {
                this._connectResolve = resolve;
                this._connectReject = reject;
            });
            
            try {
                // Wait for token before connecting
                const token = await TokenAuthority.waitForToken();
                Logger.info('WSController', 'Token available, establishing connection');
                
                this._ws = new WebSocket(url);
                
                this._ws.onopen = () => {
                    Logger.success('WSController', 'WebSocket connected');
                    this._state = this.CONNECTED;
                    this._authenticate(token);
                };
                
                this._ws.onmessage = (event) => {
                    this._handleMessage(event);
                };
                
                this._ws.onerror = (error) => {
                    Logger.error('WSController', 'WebSocket error', error);
                    this._state = this.ERROR;
                    
                    if (this._connectReject) {
                        this._connectReject(error);
                        this._connectResolve = null;
                        this._connectReject = null;
                    }
                    
                    this._scheduleReconnect();
                };
                
                this._ws.onclose = () => {
                    Logger.warn('WSController', 'WebSocket closed');
                    
                    if (this._state === this.READY || this._state === this.CONNECTED || this._state === this.AUTHENTICATING) {
                        this._state = this.CLOSED;
                        this._scheduleReconnect();
                    }
                    
                    this._cleanup();
                };
                
            } catch (error) {
                Logger.error('WSController', 'Connection failed', error);
                this._connectReject(error);
                this._connectResolve = null;
                this._connectReject = null;
                this._scheduleReconnect();
            }
            
            return this._connectPromise;
        },
        
        _authenticate(token) {
            if (this._state !== this.CONNECTED) return;
            
            this._state = this.AUTHENTICATING;
            Logger.info('WSController', 'Authenticating with token');
            
            const authMessage = {
                type: 'auth',
                token: token,
                frameId: FRAME_ID,
                timestamp: Date.now()
            };
            
            try {
                this._ws.send(JSON.stringify(authMessage));
                
                // Wait for authentication response (handled in _handleMessage)
                this._authTimeout = setTimeout(() => {
                    if (this._state === this.AUTHENTICATING) {
                        Logger.error('WSController', 'Authentication timeout');
                        this._ws.close();
                        this._scheduleReconnect();
                    }
                }, 5000);
                
            } catch (error) {
                Logger.error('WSController', 'Authentication failed', error);
                this._ws.close();
                this._scheduleReconnect();
            }
        },
        
        _handleMessage(event) {
            try {
                const data = JSON.parse(event.data);
                
                // Handle authentication response
                if (data.type === 'auth_success' && this._state === this.AUTHENTICATING) {
                    clearTimeout(this._authTimeout);
                    this._state = this.READY;
                    this._authenticated = true;
                    
                    Logger.success('WSController', 'WebSocket authenticated');
                    
                    if (this._connectResolve) {
                        this._connectResolve(true);
                        this._connectResolve = null;
                        this._connectReject = null;
                    }
                    
                    this._startHeartbeat();
                    this._flushPendingMessages();
                    
                    // Transition state
                    if (StateMachine.isInState(StateMachine.WS_INITIALIZING)) {
                        StateMachine.transition(StateMachine.WS_READY, 'websocket-ready');
                    }
                    
                    return;
                }
                
                // Handle heartbeat
                if (data.type === 'pong') {
                    this._handleHeartbeatResponse();
                    return;
                }
                
                // Dispatch message to appropriate handler
                this._dispatchMessage(data);
                
            } catch (error) {
                Logger.error('WSController', 'Message parse error', error);
            }
        },
        
        _dispatchMessage(data) {
            switch (data.type) {
                case 'message':
                    this._handleIncomingMessage(data);
                    break;
                    
                case 'typing':
                    this._handleTypingIndicator(data);
                    break;
                    
                case 'read_receipt':
                    this._handleReadReceipt(data);
                    break;
                    
                case 'delivery_receipt':
                    this._handleDeliveryReceipt(data);
                    break;
                    
                default:
                    // Unknown message type - ignore
                    break;
            }
        },
        
        _handleIncomingMessage(data) {
            const message = {
                id: data.id || SecurityUtils.generateMessageId(),
                chatId: data.chatId,
                senderId: data.senderId,
                content: SecurityUtils.sanitizeString(data.content || ''),
                type: data.type || 'text',
                timestamp: data.timestamp || Date.now(),
                status: 'received'
            };
            
            // Add to messages array
            const idx = messages.findIndex(m => m.id === message.id);
            if (idx === -1) {
                messages.push(message);
                Logger.debug('WSController', `Received message: ${message.id}`);
            }
            
            // Save to storage
            if (currentChat && message.chatId === currentChat.id) {
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
            }
            
            // Dispatch event
            window.dispatchEvent(new CustomEvent('messageReceived', {
                detail: { message }
            }));
            
            // Play notification sound if not from self
            if (message.senderId !== SessionMirror.getUser()?.id) {
                playNotificationSound();
            }
        },
        
        _handleTypingIndicator(data) {
            const chatId = data.chatId;
            
            if (currentChat && currentChat.id === chatId) {
                window.dispatchEvent(new CustomEvent('typingIndicator', {
                    detail: {
                        userId: data.userId,
                        isTyping: data.isTyping,
                        chatId: chatId
                    }
                }));
            }
        },
        
        _handleReadReceipt(data) {
            const messageId = data.messageId;
            
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages[idx].status = 'read';
                messages[idx].readAt = data.timestamp;
                
                window.dispatchEvent(new CustomEvent('messageStatusChanged', {
                    detail: { message: messages[idx] }
                }));
            }
        },
        
        _handleDeliveryReceipt(data) {
            const messageId = data.messageId;
            
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1 && messages[idx].status === 'sent') {
                messages[idx].status = 'delivered';
                messages[idx].deliveredAt = data.timestamp;
                
                window.dispatchEvent(new CustomEvent('messageStatusChanged', {
                    detail: { message: messages[idx] }
                }));
            }
        },
        
        send(data) {
            if (this._state === this.READY && this._ws && this._ws.readyState === WebSocket.OPEN) {
                try {
                    this._ws.send(JSON.stringify(data));
                    return true;
                } catch (error) {
                    Logger.error('WSController', 'Send failed', error);
                    this._queueMessage(data);
                    return false;
                }
            } else {
                this._queueMessage(data);
                return false;
            }
        },
        
        _queueMessage(data) {
            this._pendingMessages.push({
                data,
                timestamp: Date.now(),
                attempts: 0
            });
            
            // Limit queue size
            if (this._pendingMessages.length > 100) {
                this._pendingMessages.shift();
            }
        },
        
        _flushPendingMessages() {
            if (this._state !== this.READY) return;
            
            const now = Date.now();
            const oneHour = 3600000;
            
            let flushed = 0;
            this._pendingMessages = this._pendingMessages.filter(msg => {
                if (now - msg.timestamp > oneHour) {
                    return false; // Expired
                }
                
                try {
                    this._ws.send(JSON.stringify(msg.data));
                    flushed++;
                    return false; // Remove from queue
                } catch (error) {
                    msg.attempts++;
                    return msg.attempts < 3; // Keep if under max attempts
                }
            });
            
            if (flushed > 0) {
                Logger.debug('WSController', `Flushed ${flushed} pending messages`);
            }
        },
        
        _startHeartbeat() {
            if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
            
            this._heartbeatInterval = setInterval(() => {
                if (this._state === this.READY && this._ws && this._ws.readyState === WebSocket.OPEN) {
                    try {
                        this._ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                        
                        // Set timeout for heartbeat response
                        this._heartbeatTimeout = setTimeout(() => {
                            Logger.warn('WSController', 'Heartbeat timeout');
                            this._ws.close();
                        }, 10000);
                        
                    } catch (error) {
                        Logger.error('WSController', 'Heartbeat failed', error);
                    }
                }
            }, 30000);
        },
        
        _handleHeartbeatResponse() {
            if (this._heartbeatTimeout) {
                clearTimeout(this._heartbeatTimeout);
                this._heartbeatTimeout = null;
            }
        },
        
        _scheduleReconnect() {
            if (this._reconnectAttempts >= this._maxReconnectAttempts) {
                Logger.error('WSController', 'Max reconnection attempts reached');
                StateMachine.transition(StateMachine.ERROR_FATAL, 'websocket-max-retries');
                return;
            }
            
            this._reconnectAttempts++;
            
            const delay = Math.min(
                this._baseDelay * Math.pow(1.5, this._reconnectAttempts - 1),
                this._maxDelay
            );
            
            Logger.warn('WSController', `Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})`);
            
            this._state = this.RECONNECTING;
            
            setTimeout(() => {
                if (StateMachine.isAtLeast(StateMachine.TOKEN_READY)) {
                    Logger.info('WSController', 'Attempting to reconnect...');
                    this.connect(this._url).catch(() => {});
                }
            }, delay);
        },
        
        _cleanup() {
            if (this._heartbeatInterval) {
                clearInterval(this._heartbeatInterval);
                this._heartbeatInterval = null;
            }
            
            if (this._heartbeatTimeout) {
                clearTimeout(this._heartbeatTimeout);
                this._heartbeatTimeout = null;
            }
            
            if (this._authTimeout) {
                clearTimeout(this._authTimeout);
                this._authTimeout = null;
            }
        },
        
        disconnect() {
            if (this._ws) {
                this._ws.close();
                this._ws = null;
            }
            
            this._cleanup();
            this._state = this.CLOSED;
            this._authenticated = false;
            Logger.info('WSController', 'Disconnected');
        },
        
        getState() {
            return this._state;
        },
        
        isReady() {
            return this._state === this.READY;
        }
    }.init();

    // =============================================
    // MINIMAL STATUS INDICATOR
    // =============================================
    const StatusIndicator = {
        currentStatus: null,
        statusMap: {
            'FAILED': '❌',
            'WARNING': '⚠️',
            'DISCONNECTED': '🔴',
            'CONNECTED': '🟢',
            'RECOVERING': '🟡'
        },
        
        show(status, reason = '') {
            if (!this.statusMap[status]) return;
            if (this.currentStatus === status) return;
            
            this.currentStatus = status;
            const emoji = this.statusMap[status];
            
            // Log status changes
            if (status === 'CONNECTED') {
                Logger.success('Status', `${emoji} ${status}${reason ? ': ' + reason : ''}`);
            } else if (status === 'FAILED' || status === 'DISCONNECTED') {
                Logger.error('Status', `${emoji} ${status}${reason ? ': ' + reason : ''}`);
            } else if (status === 'RECOVERING') {
                Logger.warn('Status', `${emoji} ${status}${reason ? ': ' + reason : ''}`);
            } else {
                Logger.info('Status', `${emoji} ${status}${reason ? ': ' + reason : ''}`);
            }
            
            window.dispatchEvent(new CustomEvent('statusChange', {
                detail: { status, emoji, reason }
            }));
        },
        
        reset() {
            this.currentStatus = null;
        }
    };

    // =============================================
    // SAFE STORAGE LAYER
    // =============================================
    const SafeStorage = {
        memoryStore: new Map(),
        storageAvailable: false,
        quotaExceeded: false,
        
        init() {
            this._checkStorage();
            return this;
        },
        
        _checkStorage() {
            try {
                const testKey = '_kynecta_test_';
                localStorage.setItem(testKey, 'test');
                localStorage.removeItem(testKey);
                this.storageAvailable = true;
                Logger.debug('SafeStorage', 'Local storage available');
            } catch (e) {
                this.storageAvailable = false;
                Logger.warn('SafeStorage', 'Local storage unavailable, using memory store');
            }
        },
        
        get(key, fallback = null) {
            if (this.storageAvailable) {
                try {
                    const value = localStorage.getItem(key);
                    if (value !== null) return value;
                } catch (e) {}
            }
            return this.memoryStore.has(key) ? this.memoryStore.get(key) : fallback;
        },
        
        set(key, value) {
            this.memoryStore.set(key, value);
            if (this.storageAvailable) {
                try {
                    localStorage.setItem(key, String(value));
                } catch (e) {
                    if (e.name === 'QuotaExceededError') {
                        this.quotaExceeded = true;
                        Logger.warn('SafeStorage', 'Storage quota exceeded');
                    }
                }
            }
            return true;
        },
        
        remove(key) {
            if (this.storageAvailable) {
                try { localStorage.removeItem(key); } catch (e) {}
            }
            this.memoryStore.delete(key);
        },
        
        getJSON(key, fallback = null) {
            const value = this.get(key, null);
            if (!value) return fallback;
            try {
                return JSON.parse(value);
            } catch (e) {
                return fallback;
            }
        },
        
        setJSON(key, value) {
            try {
                return this.set(key, JSON.stringify(value));
            } catch (e) {
                return false;
            }
        },
        
        clear() {
            if (this.storageAvailable) {
                try { localStorage.clear(); } catch (e) {}
            }
            this.memoryStore.clear();
        }
    }.init();

    // =============================================
    // SECURITY & VALIDATION UTILITIES
    // =============================================
    const SecurityUtils = {
        allowedOrigins: new Set([
            window.location.origin,
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com'
        ]),

        messageIdCounter: 0,
        replayWindow: 300000,
        replayCache: new Map(),
        maxReplayEntries: 1000,
        processedMessageIds: new Set(),

        initOriginTrust() {
            const hostname = window.location.hostname;
            this.allowedOrigins.add(`https://${hostname}`);
            this.allowedOrigins.add(`http://${hostname}`);
            this.allowedOrigins.add(window.location.origin);
            
            if (hostname.endsWith('.onrender.com')) {
                this.allowedOrigins.add(`https://${hostname}`);
            }
            Logger.debug('SecurityUtils', `Trusted origins: ${Array.from(this.allowedOrigins).join(', ')}`);
        },

        validateOrigin(origin) {
            if (!origin || origin === 'null') return true;
            if (this.allowedOrigins.has(origin)) return true;
            return origin === window.location.origin;
        },

        validateMessageStructure(data) {
            return !!(data && typeof data === 'object' && data.type && typeof data.type === 'string');
        },

        generateMessageId() {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 10);
            const counter = (this.messageIdCounter++ % 1000).toString(36);
            return `msg_${timestamp}_${random}_${counter}`;
        },

        generateRequestId() {
            return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        },

        sanitizeString(str) {
            if (!str || typeof str !== 'string') return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/javascript:/gi, '')
                .replace(/onload/gi, 'data-onload')
                .replace(/onerror/gi, 'data-onerror')
                .replace(/<script/gi, '&lt;script')
                .replace(/<\/script/gi, '&lt;/script');
        },

        sanitizePayload(payload) {
            if (!payload || typeof payload !== 'object') return {};
            
            const sanitized = {};
            for (const [key, value] of Object.entries(payload)) {
                const safeKey = String(key).replace(/[^\w\-\.]/g, '');
                
                if (typeof value === 'string') {
                    sanitized[safeKey] = this.sanitizeString(value);
                } else if (typeof value === 'number' || typeof value === 'boolean') {
                    sanitized[safeKey] = value;
                } else if (value === null || value === undefined) {
                    sanitized[safeKey] = null;
                } else if (Array.isArray(value)) {
                    sanitized[safeKey] = value.map(item => 
                        typeof item === 'string' ? this.sanitizeString(item) : 
                        typeof item === 'object' ? this.sanitizePayload(item) : item
                    );
                } else if (typeof value === 'object') {
                    sanitized[safeKey] = this.sanitizePayload(value);
                } else {
                    sanitized[safeKey] = String(value);
                }
            }
            return sanitized;
        },

        escapeHtml(text) {
            if (!text || typeof text !== 'string') return '';
            return String(text).replace(/[&<>"'`=\/]/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
                '/': '&#x2F;',
                '`': '&#x60;',
                '=': '&#x3D;'
            })[char] || char);
        },

        escapeRegex(string) {
            if (!string || typeof string !== 'string') return '';
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        checkReplay(messageId, timestamp) {
            if (!messageId) return false;
            
            if (this.processedMessageIds.has(messageId)) {
                Logger.debug('SecurityUtils', `Replay detected: ${messageId}`);
                return true;
            }
            
            const now = Date.now();
            const age = now - timestamp;
            
            if (age > this.replayWindow) return true;
            if (timestamp > now + 120000) return true;
            
            this.processedMessageIds.add(messageId);
            
            // Cleanup old IDs
            setTimeout(() => {
                this.processedMessageIds.delete(messageId);
            }, this.replayWindow);
            
            return false;
        },

        isForThisFrame(message) {
            const targetFrame = message.target || message.frameId;
            return !targetFrame || targetFrame === 'iframe' || targetFrame === FRAME_ID;
        }
    };

    SecurityUtils.initOriginTrust();

    // =============================================
    // MINIMAL DIAGNOSTICS AGENT
    // =============================================
    const DiagnosticsAgent = {
        enabled: ENV.isLocal,
        metrics: {
            messagesSent: 0,
            messagesReceived: 0,
            acksReceived: 0,
            acksSent: 0,
            errors: [],
            startTime: Date.now(),
            pingRtt: [],
            sessionRefreshes: 0,
            cacheHits: 0,
            cacheMisses: 0
        },
        loggedErrors: new Set(),
        
        init(enabled = false) {
            this.enabled = enabled && (window.location.hostname === 'localhost' || 
                                       window.location.hostname === '127.0.0.1' ||
                                       window.__IFRAME_DEBUG__ === true);
            return this;
        },

        increment(counter) {
            if (this.enabled && this.metrics.hasOwnProperty(counter)) {
                this.metrics[counter]++;
            }
        },

        recordError(error, context) {
            if (!this.enabled) return;
            const errorKey = error.message + context;
            if (this.loggedErrors.has(errorKey)) return;
            this.loggedErrors.add(errorKey);
            
            this.metrics.errors.push({
                timestamp: Date.now(),
                error: error.message || String(error),
                context,
                stack: error.stack
            });
            if (this.metrics.errors.length > 100) {
                this.metrics.errors.shift();
            }
        },

        recordPingRtt(rtt) {
            if (!this.enabled) return;
            this.metrics.pingRtt.push(rtt);
            if (this.metrics.pingRtt.length > 20) {
                this.metrics.pingRtt.shift();
            }
        },

        getMetrics() {
            return {
                ...this.metrics,
                uptime: Date.now() - this.metrics.startTime,
                avgPingRtt: this.metrics.pingRtt.length ? 
                    Math.round(this.metrics.pingRtt.reduce((a, b) => a + b, 0) / this.metrics.pingRtt.length) : 0,
                timestamp: Date.now()
            };
        },

        getUptime() {
            const ms = Date.now() - this.metrics.startTime;
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        },

        reset() {
            this.metrics = {
                messagesSent: 0,
                messagesReceived: 0,
                acksReceived: 0,
                acksSent: 0,
                errors: [],
                startTime: Date.now(),
                pingRtt: [],
                sessionRefreshes: 0,
                cacheHits: 0,
                cacheMisses: 0
            };
            this.loggedErrors.clear();
        }
    };

    // =============================================
    // MESSAGE LIFECYCLE MANAGER WITH ACK TRACKING
    // =============================================
    const MessageLifecycle = {
        TIMEOUT_DURATION: 7000,
        MAX_RETRIES: 1,
        pendingMessages: new Map(),
        outgoingRegistry: new Map(), // requestId -> message info
        maxRegistrySize: 1000,

        createMessage(messageData) {
            return {
                id: messageData.id || SecurityUtils.generateMessageId(),
                requestId: messageData.requestId || SecurityUtils.generateRequestId(),
                status: "sending",
                reason: null,
                timestamp: Date.now(),
                retryCount: 0,
                timeoutRef: null,
                ...messageData
            };
        },

        registerOutgoing(message, sendFn) {
            const requestId = message.requestId || message.id;
            
            // Check for duplicate
            if (this.outgoingRegistry.has(requestId)) {
                Logger.debug('MessageLifecycle', `Duplicate outgoing message: ${requestId}`);
                return this.outgoingRegistry.get(requestId).message;
            }
            
            const timeoutRef = setTimeout(() => {
                this.handleTimeout(requestId);
            }, this.TIMEOUT_DURATION);

            message.timeoutRef = timeoutRef;
            
            this.outgoingRegistry.set(requestId, { 
                message, 
                sendFn,
                timestamp: Date.now(),
                attempts: 0
            });
            
            Logger.debug('MessageLifecycle', `Registered outgoing message: ${requestId} (${message.type})`);
            
            // Cleanup old entries
            this._cleanupRegistry();
            
            return message;
        },

        handleAck(requestId) {
            const pending = this.outgoingRegistry.get(requestId);
            if (pending) {
                clearTimeout(pending.message.timeoutRef);
                pending.message.status = "delivered";
                pending.message.reason = null;
                this.updateMessageUI(pending.message);
                this.outgoingRegistry.delete(requestId);
                DiagnosticsAgent.increment('acksReceived');
                Logger.debug('MessageLifecycle', `ACK received for ${requestId}`);
                return true;
            }
            return false;
        },

        handleTimeout(requestId) {
            const pending = this.outgoingRegistry.get(requestId);
            if (!pending) return;

            const message = pending.message;
            
            // Determine failure reason
            if (!SessionMirror || !SessionMirror.isAuthenticated()) {
                message.reason = "No session";
            } else if (!TokenAuthority.hasToken()) {
                message.reason = "No token";
            } else if (!navigator.onLine) {
                message.reason = "Offline";
            } else if (!ParentDetector || !ParentDetector.isReady) {
                message.reason = "Parent unavailable";
            } else if (!WSController.isReady()) {
                message.reason = "WebSocket not ready";
            } else {
                message.reason = "No response";
            }

            if (pending.attempts < this.MAX_RETRIES) {
                pending.attempts++;
                message.retryCount = pending.attempts;
                message.status = "sending";
                message.reason = null;
                clearTimeout(message.timeoutRef);
                
                Logger.debug('MessageLifecycle', `Retrying message ${requestId} (attempt ${pending.attempts})`);
                
                try {
                    pending.sendFn();
                    message.timeoutRef = setTimeout(() => {
                        this.handleTimeout(requestId);
                    }, this.TIMEOUT_DURATION);
                    return;
                } catch (e) {}
            }

            message.status = "failed";
            clearTimeout(message.timeoutRef);
            
            // Show failure reason
            Logger.warn('MessageLifecycle', `Message ${requestId} failed: ${message.reason}`);
            StatusIndicator.show('FAILED', message.reason);
            
            this.updateMessageUI(message);
            this.outgoingRegistry.delete(requestId);
        },

        updateMessageUI(message) {
            const index = messages.findIndex(m => m.id === message.id);
            if (index !== -1) {
                messages[index] = { ...messages[index], ...message };
                
                window.dispatchEvent(new CustomEvent('messageStatusChanged', {
                    detail: { message: messages[index] }
                }));
            }
        },

        isReadyToSend() {
            if (!SessionMirror || !SessionMirror.isAuthenticated()) {
                return { ready: false, reason: "No session" };
            }
            if (!TokenAuthority.hasToken()) {
                return { ready: false, reason: "No token" };
            }
            if (!ParentDetector || !ParentDetector.isReady) {
                return { ready: false, reason: "Parent not ready" };
            }
            if (!WSController.isReady()) {
                return { ready: false, reason: "WebSocket not ready" };
            }
            if (!navigator.onLine) {
                return { ready: false, reason: "Offline" };
            }
            return { ready: true };
        },

        _cleanupRegistry() {
            if (this.outgoingRegistry.size > this.maxRegistrySize) {
                const now = Date.now();
                const oldest = now - 3600000; // 1 hour
                
                for (const [id, data] of this.outgoingRegistry) {
                    if (data.timestamp < oldest) {
                        this.outgoingRegistry.delete(id);
                    }
                    
                    if (this.outgoingRegistry.size <= this.maxRegistrySize) break;
                }
            }
        },

        getPendingCount() {
            return this.outgoingRegistry.size;
        }
    };

    // =============================================
    // MESSAGE TRANSPORT LAYER WITH ACK PROTOCOL
    // =============================================
    const MessageTransport = {
        pendingAcks: new Map(),
        messageQueue: [],
        sequenceNumber: 0,
        outboundMessages: new Map(),
        maxRetries: 0,
        maxQueueSize: 100,
        requestIdMap: new Map(), // Maps requestId to messageId
        parentOrigin: window.location.origin,
        
        init() {
            return this;
        },
        
        send(type, payload = {}, options = {}) {
            const messageId = options.messageId || SecurityUtils.generateMessageId();
            const requestId = options.requestId || SecurityUtils.generateRequestId();
            const timestamp = Date.now();

            // Store mapping
            this.requestIdMap.set(requestId, messageId);
            setTimeout(() => this.requestIdMap.delete(requestId), 60000);

            const readyCheck = MessageLifecycle.isReadyToSend();
            if (!readyCheck.ready) {
                const failedMessage = {
                    id: messageId,
                    requestId: requestId,
                    status: "failed",
                    reason: readyCheck.reason,
                    timestamp,
                    type,
                    payload
                };
                MessageLifecycle.updateMessageUI(failedMessage);
                StatusIndicator.show('FAILED', readyCheck.reason);
                Logger.warn('MessageTransport', `Send failed: ${readyCheck.reason}`);
                return Promise.resolve({ 
                    success: false, 
                    error: readyCheck.reason,
                    messageId,
                    requestId,
                    status: "failed",
                    reason: readyCheck.reason
                });
            }
            
            const message = {
                protocol: PROTOCOL.VERSION,
                messageId: messageId,
                requestId: requestId,
                type: type,
                source: SOURCE_IFRAME,
                target: 'parent',
                frameId: FRAME_ID,
                timestamp: timestamp,
                payload: SecurityUtils.sanitizePayload(payload),
                app: APP_NAME,
                version: VERSION,
                requiresAck: options.requiresAck !== false,
                sequence: ++this.sequenceNumber
            };

            Logger.debug('MessageTransport', `Sending ${type} (${requestId})`);
            return this._postMessage(message, options);
        },
        
        _postMessage(message, options = {}) {
            const targetOrigin = options.targetOrigin || this.parentOrigin;
            const requiresAck = options.requiresAck !== false;
            
            return new Promise((resolve) => {
                if (!window.parent || window.parent === window) {
                    Logger.debug('MessageTransport', 'No parent, queueing message');
                    this._queueMessage(message, requiresAck, resolve);
                    return;
                }

                if (requiresAck) {
                    const lifecycleMessage = MessageLifecycle.createMessage({
                        id: message.messageId,
                        requestId: message.requestId,
                        type: message.type,
                        payload: message.payload,
                        timestamp: message.timestamp
                    });

                    MessageLifecycle.registerOutgoing(lifecycleMessage, () => {
                        this._sendWithAck(message, targetOrigin, resolve, true);
                    });

                    this._sendWithAck(message, targetOrigin, resolve, false);
                } else {
                    try {
                        window.parent.postMessage(message, targetOrigin);
                        Logger.debug('MessageTransport', `Sent ${message.type} (no ack)`);
                        resolve({ success: true, messageId: message.messageId, requestId: message.requestId });
                    } catch (error) {
                        Logger.error('MessageTransport', 'PostMessage error', error);
                        this._queueMessage(message, false, resolve);
                    }
                }
            });
        },
        
        _sendWithAck(message, targetOrigin, resolve, isRetry = false) {
            const requestId = message.requestId;
            
            const timer = setTimeout(() => {
                const pending = this.pendingAcks.get(requestId);
                if (pending) {
                    this.pendingAcks.delete(requestId);
                    this.outboundMessages.delete(message.messageId);
                    
                    if (!isRetry) {
                        MessageLifecycle.handleTimeout(requestId);
                    }
                    
                    Logger.warn('MessageTransport', `Timeout for ${requestId}`);
                    
                    resolve({ 
                        success: false, 
                        error: 'timeout', 
                        messageId: message.messageId,
                        requestId: requestId,
                        status: 'failed',
                        reason: 'No response'
                    });
                }
            }, MessageLifecycle.TIMEOUT_DURATION);

            this.pendingAcks.set(requestId, {
                resolve,
                timer,
                type: message.type,
                timestamp: Date.now(),
                message
            });

            try {
                window.parent.postMessage(message, targetOrigin);
                Logger.debug('MessageTransport', `Sent ${message.type} with ack (${requestId})`);
            } catch (error) {
                clearTimeout(timer);
                this.pendingAcks.delete(requestId);
                
                if (!isRetry) {
                    MessageLifecycle.handleTimeout(requestId);
                }
                
                this._queueMessage(message, true, resolve);
            }
        },
        
        _queueMessage(message, requiresAck, resolve) {
            if (this.messageQueue.length >= this.maxQueueSize) {
                Logger.warn('MessageTransport', 'Queue full, dropping message');
                resolve({ 
                    success: false, 
                    error: 'queue_full', 
                    messageId: message.messageId,
                    requestId: message.requestId,
                    status: 'failed',
                    reason: 'Queue full'
                });
                return;
            }

            this.messageQueue.push({
                message,
                requiresAck,
                timestamp: Date.now(),
                messageId: message.messageId,
                requestId: message.requestId,
                resolve
            });
            
            Logger.debug('MessageTransport', `Queued message ${message.requestId} (queue size: ${this.messageQueue.length})`);
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE, this.messageQueue);
        },
        
        handleAck(ackMessage) {
            const originalRequestId = ackMessage.payload?.requestId || 
                                      ackMessage.payload?.messageId || 
                                      ackMessage.requestId || 
                                      ackMessage.messageId;
            
            if (!originalRequestId) return false;

            // Find messageId from requestId if needed
            const messageId = this.requestIdMap.get(originalRequestId) || originalRequestId;
            
            // Handle in lifecycle
            MessageLifecycle.handleAck(originalRequestId);

            const pending = this.pendingAcks.get(originalRequestId);
            if (pending) {
                clearTimeout(pending.timer);
                this.pendingAcks.delete(originalRequestId);
                this.outboundMessages.delete(messageId);
                
                pending.resolve({ 
                    success: true, 
                    ack: ackMessage.payload,
                    receivedAt: Date.now(),
                    status: 'delivered'
                });
                
                DiagnosticsAgent.increment('acksReceived');
                Logger.debug('MessageTransport', `ACK handled for ${originalRequestId}`);
                return true;
            }
            return false;
        },
        
        async processQueue() {
            if (this.messageQueue.length === 0 || !window.parent || window.parent === window) return;

            Logger.debug('MessageTransport', `Processing queue (${this.messageQueue.length} messages)`);

            const now = Date.now();
            const oneHour = 3600000;
            
            const freshQueue = this.messageQueue.filter(msg => msg.timestamp > now - oneHour);

            for (const queued of freshQueue) {
                try {
                    await this._postMessage(
                        queued.message,
                        { requiresAck: queued.requiresAck }
                    );
                    
                    const index = freshQueue.findIndex(q => q.requestId === queued.requestId);
                    if (index !== -1) freshQueue.splice(index, 1);
                } catch (error) {}
            }

            this.messageQueue = freshQueue;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE, this.messageQueue);
        },
        
        clearPending(requestId) {
            if (requestId) {
                const pending = this.pendingAcks.get(requestId);
                if (pending) {
                    clearTimeout(pending.timer);
                    this.pendingAcks.delete(requestId);
                }
                const messageId = this.requestIdMap.get(requestId);
                if (messageId) {
                    this.outboundMessages.delete(messageId);
                }
                MessageLifecycle.outgoingRegistry.delete(requestId);
                Logger.debug('MessageTransport', `Cleared pending for ${requestId}`);
            } else {
                for (const [_, pending] of this.pendingAcks) {
                    clearTimeout(pending.timer);
                }
                this.pendingAcks.clear();
                this.outboundMessages.clear();
                MessageLifecycle.outgoingRegistry.clear();
                this.requestIdMap.clear();
                Logger.debug('MessageTransport', 'Cleared all pending messages');
            }
        },
        
        getStats() {
            return {
                pendingAcks: this.pendingAcks.size,
                queuedMessages: this.messageQueue.length,
                outboundMessages: this.outboundMessages.size,
                sequenceNumber: this.sequenceNumber,
                pendingLifecycle: MessageLifecycle.getPendingCount(),
                requestIdMap: this.requestIdMap.size
            };
        }
    }.init();

    // =============================================
    // MESSAGE FIREWALL WITH IDEMPOTENCY
    // =============================================
    const MessageFirewall = {
        processedMessages: new Set(),
        messageSequence: 0,
        transport: MessageTransport,

        validate(event) {
            if (!SecurityUtils.validateOrigin(event.origin)) {
                Logger.debug('MessageFirewall', `Invalid origin: ${event.origin}`);
                return false;
            }
            if (!event.source || event.source === window) return false;
            if (!SecurityUtils.validateMessageStructure(event.data)) return false;

            const data = event.data;
            if (!SecurityUtils.isForThisFrame(data)) return false;

            const messageId = data.messageId || data.id;
            if (messageId && SecurityUtils.checkReplay(messageId, data.timestamp || 0)) return false;

            return true;
        },

        parse(event) {
            if (!this.validate(event)) return null;

            const data = event.data;
            
            if (data.protocol === PROTOCOL.VERSION) {
                return this._normalizeCanonical(data);
            }
            
            return this._convertLegacy(data);
        },

        _normalizeCanonical(data) {
            if (!data.sequence) {
                data.sequence = ++this.messageSequence;
            }

            if (!data.timestamp) {
                data.timestamp = Date.now();
            }

            if (data.payload) {
                data.payload = SecurityUtils.sanitizePayload(data.payload);
            }

            const normalized = {
                protocol: data.protocol,
                messageId: data.messageId || data.id,
                requestId: data.requestId || data.messageId || data.id,
                type: data.type,
                source: data.source || 'PARENT',
                target: data.target || 'iframe',
                frameId: data.frameId || FRAME_ID,
                timestamp: data.timestamp,
                payload: data.payload || {},
                token: data.token,
                signature: data.signature,
                sequence: data.sequence,
                receivedAt: Date.now()
            };

            // Handle ACKs
            if (data.type === MESSAGE_TYPES.ACK || 
                data.type === MESSAGE_TYPES.HEARTBEAT_ACK || 
                data.type === MESSAGE_TYPES.SESSION_ACK ||
                data.type === MESSAGE_TYPES.REGISTRATION_ACK) {
                
                this.transport.handleAck(data);
                
                // Handle session verification response
                if (data.payload?.requestId && data.type === MESSAGE_TYPES.ACK && data.originalType === MESSAGE_TYPES.VERIFY_SESSION) {
                    SessionAuthority.handleVerificationResponse(data);
                }
            }

            return normalized;
        },

        _convertLegacy(data) {
            const messageId = data.id || data.messageId || SecurityUtils.generateMessageId();
            const requestId = data.requestId || data.id || messageId;
            const timestamp = data.timestamp || Date.now();

            const canonical = {
                protocol: 'LEGACY',
                messageId: messageId,
                requestId: requestId,
                type: data.type,
                source: data.source || 'PARENT',
                target: 'iframe',
                frameId: data.frameId || FRAME_ID,
                timestamp: timestamp,
                payload: data.payload || {},
                token: data.token,
                signature: data.signature,
                sequence: ++this.messageSequence,
                legacy: true,
                original: data,
                receivedAt: Date.now()
            };

            if (canonical.payload) {
                canonical.payload = SecurityUtils.sanitizePayload(canonical.payload);
            }

            // Handle ACKs
            if (data.type === MESSAGE_TYPES.ACK || 
                data.type === MESSAGE_TYPES.HEARTBEAT_ACK ||
                data.type === MESSAGE_TYPES.SESSION_ACK) {
                this.transport.handleAck(data);
                
                // Handle session verification response
                if (data.payload?.requestId && data.type === MESSAGE_TYPES.ACK && data.originalType === MESSAGE_TYPES.VERIFY_SESSION) {
                    SessionAuthority.handleVerificationResponse(data);
                }
            }

            return canonical;
        },

        createOutbound(type, payload = {}, options = {}) {
            const messageId = options.messageId || SecurityUtils.generateMessageId();
            const requestId = options.requestId || SecurityUtils.generateRequestId();
            const timestamp = Date.now();
            
            const message = {
                protocol: PROTOCOL.VERSION,
                messageId,
                requestId,
                type,
                source: SOURCE_IFRAME,
                target: 'parent',
                frameId: FRAME_ID,
                timestamp,
                payload: SecurityUtils.sanitizePayload(payload),
                app: APP_NAME,
                version: VERSION,
                requiresAck: options.requiresAck !== false,
                sequence: ++this.messageSequence
            };

            return message;
        },

        send(type, payload = {}, options = {}) {
            return this.transport.send(type, payload, options);
        },

        processQueue() {
            return this.transport.processQueue();
        },

        getStats() {
            return {
                processedMessages: this.processedMessages.size,
                messageSequence: this.messageSequence,
                transport: this.transport.getStats()
            };
        }
    };

    // =============================================
    // REGISTRATION CONTROLLER - IDEMPOTENT
    // =============================================
    let registrationSent = false;
    let registrationPromise = null;
    let registrationResolve = null;
    let registrationReject = null;
    let parentOrigin = window.location.origin;

    function registerWithParent() {
    if (registrationSent && registrationPromise) {
        Logger.debug('Registration', 'Registration already in progress');
        return registrationPromise;
    }
    
    if (!window.parent || window.parent === window) {
        Logger.warn('Registration', 'No parent window detected');
        return Promise.resolve({ success: false, reason: 'no-parent' });
    }

    registrationSent = true;

    registrationPromise = new Promise((resolve, reject) => {
        registrationResolve = resolve;
        registrationReject = reject;
        
        const timeout = setTimeout(() => {
            if (registrationResolve) {
                Logger.warn('Registration', 'Registration timeout - assuming success');
                // Don't reject, assume success
                registrationResolve({ success: true, assumed: true, reason: 'timeout' });
                registrationResolve = null;
                registrationReject = null;
            }
        }, 3000);

        try {
            const requestId = SecurityUtils.generateRequestId();
            Logger.info('Registration', `Registering with parent (${requestId})`);
            
            window.parent.postMessage({
                type: MESSAGE_TYPES.IFRAME_REGISTERED,
                module: "messages",
                frameId: FRAME_ID,
                version: VERSION,
                timestamp: Date.now(),
                requestId: requestId,
                expectAck: true
            }, parentOrigin);
            
            // Store timeout
            MessageTransport.pendingAcks.set(requestId, {
                resolve: (result) => {
                    clearTimeout(timeout);
                    if (registrationResolve) {
                        Logger.success('Registration', 'Registration successful');
                        registrationResolve(result);
                        registrationResolve = null;
                        registrationReject = null;
                    }
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    if (registrationReject) {
                        // Don't reject, assume success
                        Logger.warn('Registration', 'Registration rejected - assuming success');
                        registrationResolve({ success: true, assumed: true, reason: 'rejected' });
                        registrationResolve = null;
                        registrationReject = null;
                    }
                },
                timer: timeout,
                type: 'REGISTRATION'
            });
            
        } catch (e) {
            clearTimeout(timeout);
            Logger.error('Registration', 'Registration failed', e);
            // Don't reject, assume success
            registrationResolve({ success: true, assumed: true, reason: 'error' });
            registrationResolve = null;
            registrationReject = null;
        }
    });

    return registrationPromise;
}
    // =============================================
    // PARENT DETECTOR & HEARTBEAT
    // =============================================
    // =============================================
// PARENT DETECTOR & HEARTBEAT
// =============================================
const ParentDetector = {
    isReady: false,
    pingInterval: null,
    lastPong: 0,
    listeners: new Set(),
    pingIntervalMs: 30000,
    connectionQuality: 'unknown',
    lastPingTime: 0,
    heartbeatEnabled: true,
    lastWarningTime: 0,
    lastDisconnectTime: 0,
    registrationAckReceived: false,
    _pendingSession: null,

    init() {
        this._checkParent();
        this._startPing(); // This will now work
        return this;
    },

    _checkParent() {
        const hasParent = window.parent && window.parent !== window;
        const canPostMessage = typeof window.parent?.postMessage === 'function';
        
        // Be optimistic - assume parent is ready even if we can't verify
        this.isReady = hasParent && canPostMessage;
        
        if (!this.isReady && !this.lastDisconnectTime) {
            this.lastDisconnectTime = Date.now();
            StatusIndicator.show('DISCONNECTED');
            Logger.warn('ParentDetector', 'Parent not available');
        } else if (this.isReady) {
            Logger.debug('ParentDetector', 'Parent detected');
        }
    },

    _startPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        this.pingInterval = setInterval(() => {
            if (!this.isReady) {
                this._checkParent();
                return;
            }

            this._sendPing();
        }, this.pingIntervalMs);
        Logger.debug('ParentDetector', 'Ping interval started');
    },

    _sendPing() {
        if (!this.heartbeatEnabled) return;
        
        try {
            this.lastPingTime = Date.now();
            
            const message = {
                protocol: PROTOCOL.VERSION,
                type: MESSAGE_TYPES.HEARTBEAT,
                source: SOURCE_IFRAME,
                target: 'parent',
                frameId: FRAME_ID,
                messageId: SecurityUtils.generateMessageId(),
                requestId: SecurityUtils.generateRequestId(),
                timestamp: this.lastPingTime,
                payload: { 
                    timestamp: this.lastPingTime,
                    frameId: FRAME_ID
                },
                expectAck: true
            };
            
            window.parent.postMessage(message, parentOrigin);
            Logger.debug('ParentDetector', 'Heartbeat sent');
            
        } catch (e) {
            Logger.debug('ParentDetector', 'Heartbeat send failed', e);
        }
    },

    handleHeartbeatAck(ackMessage) {
        const now = Date.now();
        const rtt = now - (ackMessage.payload?.timestamp || this.lastPingTime || now);
        
        this.lastPong = now;
        HEARTBEAT.failures = 0;
        HEARTBEAT.lastHeartbeat = now;
        
        if (!this.isReady) {
            this.isReady = true;
            this._notifyListeners();
        }
        
        DiagnosticsAgent.recordPingRtt(rtt);
        Logger.debug('ParentDetector', `Heartbeat ACK received (RTT: ${rtt}ms)`);
    },

    handleRegistrationAck() {
        this.registrationAckReceived = true;
        Logger.success('ParentDetector', 'Registration ACK received');
        
        // Transition state
        if (StateMachine.isInState(StateMachine.REGISTERING)) {
            StateMachine.transition(StateMachine.REGISTERED, 'registration-ack');
        }
    },

    handleHeartbeatMiss() {
        HEARTBEAT.failures++;
        HEARTBEAT.lastHeartbeat = Date.now();

        if (HEARTBEAT.failures < HEARTBEAT.maxFailures) {
            const now = Date.now();
            if (now - this.lastWarningTime > 30000) {
                StatusIndicator.show('WARNING');
                this.lastWarningTime = now;
                Logger.warn('ParentDetector', `Heartbeat miss (${HEARTBEAT.failures}/${HEARTBEAT.maxFailures})`);
            }
            return;
        }

        if (HEARTBEAT.failures === HEARTBEAT.maxFailures) {
            const now = Date.now();
            if (now - this.lastDisconnectTime > 60000) {
                StatusIndicator.show('DISCONNECTED');
                this.lastDisconnectTime = now;
                Logger.error('ParentDetector', 'Max heartbeat failures reached');
            }
            this._requestStatusRefresh();
        }
    },

    _requestStatusRefresh() {
        if (!window.parent || window.parent === window) return;

        try {
            window.parent.postMessage({
                type: MESSAGE_TYPES.MESSAGES_STATUS_WARNING,
                severity: "soft",
                frameId: FRAME_ID,
                timestamp: Date.now()
            }, parentOrigin);
        } catch (e) {}
    },

    subscribe(callback) {
        this.listeners.add(callback);
        if (this.isReady) callback({ ready: true, connectionQuality: this.connectionQuality });
        return () => this.listeners.delete(callback);
    },

    _notifyListeners() {
        const data = { 
            ready: this.isReady, 
            connectionQuality: this.connectionQuality,
            lastPong: this.lastPong
        };
        
        this.listeners.forEach(cb => {
            try {
                cb(data);
            } catch (e) {}
        });
        
        window.dispatchEvent(new CustomEvent('parentStatusChanged', { detail: data }));
    },

    waitForParentReady(timeoutMs = 5000) {
        return new Promise((resolve) => {
            if (this.isReady) {
                resolve(true);
                return;
            }
            
            const timeout = setTimeout(() => {
                window.removeEventListener('parentReady', handler);
                // Don't reject, just resolve with false
                resolve(false);
            }, timeoutMs);
            
            const handler = () => {
                clearTimeout(timeout);
                window.removeEventListener('parentReady', handler);
                resolve(true);
            };
            
            window.addEventListener('parentReady', handler);
            
            // Also check periodically
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (this.isReady) {
                    clearInterval(interval);
                    clearTimeout(timeout);
                    window.removeEventListener('parentReady', handler);
                    resolve(true);
                } else if (attempts > 10) {
                    clearInterval(interval);
                }
            }, 500);
        });
    },

    getStats() {
        return {
            isReady: this.isReady,
            connectionQuality: this.connectionQuality,
            lastPong: this.lastPong,
            heartbeatFailures: HEARTBEAT.failures,
            registrationAckReceived: this.registrationAckReceived
        };
    },

    destroy() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.listeners.clear();
    }
}.init();

    // =============================================
    // SESSION MIRROR
    // =============================================
    const SessionMirror = {
        _state: {
            authenticated: false,
            user: null,
            token: null,
            permissions: [],
            capabilities: [],
            expiresAt: 0,
            receivedAt: 0,
            fromCache: false,
            version: null,
            userId: null,
            sessionId: null,
            lastActivity: Date.now()
        },
        
        _subscribers: new Set(),
        _refreshTimer: null,
        _initPromise: null,
        _expiryCheckInterval: null,
        _refreshPromise: null,
        _tokenRefreshBuffer: 60000,

        init() {
            if (this._initPromise) return this._initPromise;
            
            this._initPromise = new Promise((resolve) => {
                const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE);
                if (cached && cached.expiresAt > Date.now()) {
                    this._state = {
                        ...cached,
                        fromCache: true,
                        receivedAt: Date.now(),
                        lastActivity: Date.now()
                    };
                    this._state.authenticated = !!cached.user && !!cached.token && 
                                                 cached.expiresAt > Date.now();
                    this._state.userId = cached.user?.id || cached.user?.userId;
                    
                    // Provide token to TokenAuthority
                    if (this._state.token) {
                        TokenAuthority.receiveToken(this._state.token, 'cache');
                    }
                    
                    // Provide session to SessionAuthority
                    if (this._state.authenticated) {
                        SessionAuthority.receiveSession(this._state);
                    }
                    
                    Logger.info('SessionMirror', 'Session restored from cache');
                }
                
                this._startExpiryCheck();
                resolve(this._state);
            });
            
            return this._initPromise;
        },

        _startExpiryCheck() {
            if (this._expiryCheckInterval) clearInterval(this._expiryCheckInterval);
            
            this._expiryCheckInterval = setInterval(() => {
                const now = Date.now();
                
                if (this._state.authenticated && this._state.expiresAt < now) {
                    Logger.warn('SessionMirror', 'Session expired');
                    this.clearSession();
                    return;
                }
                
                if (this._state.authenticated && 
                    this._state.expiresAt - now < this._tokenRefreshBuffer) {
                    Logger.debug('SessionMirror', 'Session expiring soon, requesting refresh');
                    this._requestRefresh();
                }
                
                this._state.lastActivity = now;
            }, 30000);
        },

        acceptSession(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') return false;

            const oldState = { ...this._state };
            
            this._state = {
                authenticated: !!(snapshot.user && snapshot.token),
                user: snapshot.user ? { ...snapshot.user } : null,
                token: snapshot.token || null,
                permissions: snapshot.permissions || [],
                capabilities: snapshot.capabilities || [],
                expiresAt: snapshot.expiresAt || (Date.now() + 3600000),
                receivedAt: Date.now(),
                fromCache: false,
                version: snapshot.version || VERSION,
                userId: snapshot.user?.id || snapshot.user?.userId || snapshot.userId,
                sessionId: snapshot.sessionId || this._generateSessionId(),
                lastActivity: Date.now()
            };

            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
                user: this._state.user,
                token: this._state.token,
                permissions: this._state.permissions,
                capabilities: this._state.capabilities,
                expiresAt: this._state.expiresAt,
                version: this._state.version,
                sessionId: this._state.sessionId
            });

            if (this._state.user) {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._state.user);
            }

            // Provide token to TokenAuthority
            if (this._state.token) {
                TokenAuthority.receiveToken(this._state.token, 'session');
            }
            
            // Provide session to SessionAuthority
            SessionAuthority.receiveSession(this._state);

            this._setupRefreshTimer();
            this._notifySubscribers('session-accepted', { old: oldState, new: this._state });
            
            Logger.success('SessionMirror', 'Session accepted');
            
            return true;
        },

        updateSession(update) {
            if (!update) return false;

            let changed = false;
            const oldState = { ...this._state };
            
            if (update.user) {
                this._state.user = { ...this._state.user, ...update.user };
                this._state.userId = this._state.user?.id || this._state.user?.userId;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._state.user);
                changed = true;
            }
            
            if (update.token) {
                this._state.token = update.token;
                TokenAuthority.receiveToken(update.token, 'update');
                changed = true;
            }
            
            if (update.permissions) {
                this._state.permissions = update.permissions;
                changed = true;
            }
            
            if (update.capabilities) {
                this._state.capabilities = update.capabilities;
                changed = true;
            }
            
            if (update.expiresAt) {
                this._state.expiresAt = update.expiresAt;
                changed = true;
            }
            
            if (update.sessionId) {
                this._state.sessionId = update.sessionId;
                changed = true;
            }

            if (changed) {
                this._state.authenticated = !!this._state.user && !!this._state.token;
                this._state.receivedAt = Date.now();
                this._state.lastActivity = Date.now();
                
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
                    user: this._state.user,
                    token: this._state.token,
                    permissions: this._state.permissions,
                    capabilities: this._state.capabilities,
                    expiresAt: this._state.expiresAt,
                    version: this._state.version,
                    sessionId: this._state.sessionId
                });
                
                this._setupRefreshTimer();
                this._notifySubscribers('session-updated', { old: oldState, new: this._state });
                
                Logger.info('SessionMirror', 'Session updated');
            }
            
            return changed;
        },

        clearSession() {
            const oldState = { ...this._state };
            
            this._state = {
                authenticated: false,
                user: null,
                token: null,
                permissions: [],
                capabilities: [],
                expiresAt: 0,
                receivedAt: 0,
                fromCache: false,
                version: null,
                userId: null,
                sessionId: null,
                lastActivity: Date.now()
            };
            
            SafeStorage.remove(LOCAL_STORAGE_KEYS.SESSION_CACHE);
            SafeStorage.remove(LOCAL_STORAGE_KEYS.USER_CACHE);
            TokenAuthority.clearToken();
            
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            
            this._notifySubscribers('session-cleared', { old: oldState });
            
            Logger.warn('SessionMirror', 'Session cleared');
        },

        _generateSessionId() {
            return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
        },

        _setupRefreshTimer() {
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            
            const timeUntilExpiry = this._state.expiresAt - Date.now();
            if (timeUntilExpiry > 0 && timeUntilExpiry < 300000) {
                this._refreshTimer = setTimeout(() => {
                    this._requestRefresh();
                }, Math.max(timeUntilExpiry - this._tokenRefreshBuffer, 1000));
            }
        },

        _requestRefresh() {
            if (this._refreshPromise) return this._refreshPromise;
            
            if (!window.parent || window.parent === window) return;
            
            DiagnosticsAgent.increment('sessionRefreshes');
            
            this._refreshPromise = new Promise((resolve) => {
                try {
                    const message = MessageFirewall.createOutbound(
                        MESSAGE_TYPES.SESSION_SYNC,
                        { 
                            timestamp: Date.now(),
                            frameId: FRAME_ID,
                            sessionId: this._state.sessionId
                        },
                        { requiresAck: true, timeout: 5000 }
                    );
                    
                    if (message) {
                        window.parent.postMessage(message, parentOrigin);
                        setTimeout(() => {
                            this._refreshPromise = null;
                            resolve(false);
                        }, 5000);
                    } else {
                        resolve(false);
                    }
                } catch (e) {
                    this._refreshPromise = null;
                    resolve(false);
                }
            });
            
            return this._refreshPromise;
        },

        subscribe(callback) {
            this._subscribers.add(callback);
            try {
                callback({
                    type: 'initial',
                    state: this.getState()
                });
            } catch (e) {}
            return () => this._subscribers.delete(callback);
        },

        _notifySubscribers(type, data = {}) {
            const state = this.getState();
            const event = { type, state, ...data };
            
            this._subscribers.forEach(cb => {
                try {
                    cb(event);
                } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('sessionUpdated', { 
                detail: { session: state, changeType: type, ...data }
            }));
        },

        getState() {
            return {
                authenticated: this._state.authenticated,
                user: this._state.user ? { ...this._state.user } : null,
                token: this._state.token,
                permissions: [...this._state.permissions],
                capabilities: [...this._state.capabilities],
                expiresAt: this._state.expiresAt,
                receivedAt: this._state.receivedAt,
                fromCache: this._state.fromCache,
                userId: this._state.userId,
                sessionId: this._state.sessionId,
                lastActivity: this._state.lastActivity
            };
        },

        getUser() {
            return this._state.user ? { ...this._state.user } : null;
        },

        getToken() {
            return this._state.token;
        },

        getSessionId() {
            return this._state.sessionId;
        },

        isAuthenticated() {
            return this._state.authenticated && this._state.expiresAt > Date.now();
        },

        getTimeUntilExpiry() {
            if (!this._state.authenticated) return 0;
            return Math.max(0, this._state.expiresAt - Date.now());
        },

        isExpiringSoon(threshold = 300000) {
            return this._state.authenticated && this.getTimeUntilExpiry() < threshold;
        }
    };
// Add this after SessionMirror is defined
if (StateMachine.onStateChange) {
    StateMachine.onStateChange((oldState, newState, reason) => {
        // When we reach WAITING_FOR_SESSION, check if we have pending session data
        if (newState === StateMachine.WAITING_FOR_SESSION && ParentDetector._pendingSession) {
            Logger.info('MessagingClient', 'Processing pending session data');
            const pendingSession = ParentDetector._pendingSession;
            ParentDetector._pendingSession = null;
            
            // Process the session
            SessionMirror.acceptSession(pendingSession);
            
            // Move to next state
            if (StateMachine.canTransitionTo(StateMachine.SESSION_ACTIVE)) {
                StateMachine.transition(StateMachine.SESSION_ACTIVE, 'pending-session');
            }
        }
        
        // When we reach SESSION_ACTIVE, check if we have pending token
        if (newState === StateMachine.SESSION_ACTIVE && !TokenAuthority.hasToken()) {
            // Request token
            MessageFirewall.send(MESSAGE_TYPES.REQUEST_TOKEN, {
                frameId: FRAME_ID,
                timestamp: Date.now()
            }, { requiresAck: false });
        }
    });
}

    // =============================================
    // SESSION CLIENT - PASSIVE
    // =============================================
    const SessionClient = {
        syncInProgress: false,
        lastSyncTime: 0,
        syncInterval: 120000,
        syncTimer: null,
        pendingSessionRequests: new Map(),
        expiryCheckTimer: null,
        refreshInProgress: false,

        init() {
            this._startSyncTimer();
            this._startExpiryCheck();
            return this;
        },

        _startSyncTimer() {
            if (this.syncTimer) clearInterval(this.syncTimer);
            this.syncTimer = setInterval(() => this.sync(), this.syncInterval);
            Logger.debug('SessionClient', 'Sync timer started');
        },

        _startExpiryCheck() {
            if (this.expiryCheckTimer) clearInterval(this.expiryCheckTimer);
            this.expiryCheckTimer = setInterval(() => {
                if (SessionMirror && SessionMirror.isAuthenticated()) {
                    const timeUntilExpiry = SessionMirror.getTimeUntilExpiry();
                    if (timeUntilExpiry < 60000) {
                        this._handleExpiringSoon();
                    }
                }
            }, 30000);
        },

        async sync(force = false) {
            if (this.syncInProgress) return false;
            
            const now = Date.now();
            if (!force && now - this.lastSyncTime < this.syncInterval) return false;
            if (!window.parent || window.parent === window) return false;

            this.syncInProgress = true;

            try {
                Logger.debug('SessionClient', 'Syncing session with parent');
                const result = await MessageFirewall.send(
                    MESSAGE_TYPES.SESSION_SYNC,
                    {
                        timestamp: now,
                        frameId: FRAME_ID,
                        sessionId: SessionMirror.getSessionId(),
                        lastActivity: SessionMirror.getState().lastActivity,
                        force
                    },
                    { requiresAck: true, timeout: 5000 }
                );

                if (result.success) {
                    this.lastSyncTime = now;
                    Logger.debug('SessionClient', 'Sync successful');
                }
                return result.success;
            } catch (error) {
                Logger.warn('SessionClient', 'Sync failed', error);
                return false;
            } finally {
                this.syncInProgress = false;
            }
        },

        handleSessionData(message) {
            const payload = message.payload;
            if (!payload) return false;

            const requestId = payload.requestId || message.requestId || message.messageId;
            if (requestId && this.pendingSessionRequests.has(requestId)) {
                const resolver = this.pendingSessionRequests.get(requestId);
                resolver(payload);
                this.pendingSessionRequests.delete(requestId);
            }

            SessionMirror.acceptSession(payload);

            MessageFirewall.send(
                MESSAGE_TYPES.SESSION_ACK,
                {
                    messageId: message.messageId,
                    requestId: message.requestId || message.messageId,
                    sessionId: SessionMirror.getSessionId(),
                    timestamp: Date.now()
                },
                { requiresAck: false }
            );

            return true;
        },

        async requestSession(force = false) {
            return new Promise((resolve) => {
                const requestId = SecurityUtils.generateRequestId();
                
                this.pendingSessionRequests.set(requestId, resolve);
                
                Logger.info('SessionClient', `Requesting session (${requestId})`);
                
                MessageFirewall.send(
                    MESSAGE_TYPES.REQUEST_SESSION,
                    {
                        timestamp: Date.now(),
                        frameId: FRAME_ID,
                        force,
                        requestId
                    },
                    { requiresAck: true, timeout: 8000, requestId }
                ).catch(() => {
                    this.pendingSessionRequests.delete(requestId);
                    resolve(null);
                });

                setTimeout(() => {
                    if (this.pendingSessionRequests.has(requestId)) {
                        Logger.warn('SessionClient', `Session request timeout (${requestId})`);
                        this.pendingSessionRequests.delete(requestId);
                        resolve(null);
                    }
                }, 10000);
            });
        },

        handleSessionExpired() {
            Logger.warn('SessionClient', 'Session expired');
            SessionMirror.clearSession();
            this.requestSession(true);
            window.dispatchEvent(new CustomEvent('sessionExpired'));
        },

        _handleExpiringSoon() {
            if (this.refreshInProgress) return;
            
            this.refreshInProgress = true;
            Logger.debug('SessionClient', 'Session expiring soon, refreshing');
            
            MessageFirewall.send(
                MESSAGE_TYPES.SESSION_SYNC,
                {
                    timestamp: Date.now(),
                    frameId: FRAME_ID,
                    sessionId: SessionMirror.getSessionId()
                },
                { requiresAck: true, timeout: 5000 }
            ).finally(() => {
                this.refreshInProgress = false;
            });
        },

        stop() {
            if (this.syncTimer) {
                clearInterval(this.syncTimer);
                this.syncTimer = null;
            }
            if (this.expiryCheckTimer) {
                clearInterval(this.expiryCheckTimer);
                this.expiryCheckTimer = null;
            }
        }
    }.init();

    // =============================================
    // MESSAGING CLIENT - MAIN ORCHESTRATOR
    // =============================================
    class MessagingClient {
        constructor() {
            this.listeners = new Map();
            this.parentDetector = ParentDetector;
            this.sessionMirror = SessionMirror;
            this.sessionClient = SessionClient;
            this.messageFirewall = MessageFirewall;
            this.transport = MessageTransport;
            this._pendingPromises = new Map();
            this._initPromise = null;
            this._initialized = false;
        }
        // Add this method to the MessagingClient class (around line 3200-3300)
getHealth() {
    return {
        parentReady: ParentDetector?.isReady || false,
        connectionQuality: this._getConnectionQuality(),
        handshake: {
            state: StateMachine.getState(),
            version: VERSION,
            duration: StateMachine.getTransitionHistory().length > 0 ? 
                Date.now() - (StateMachine.getTransitionHistory()[0]?.timestamp || Date.now()) : 0
        },
        sessionValid: SessionMirror?.isAuthenticated?.() || false,
        tokenValid: TokenAuthority?.hasToken?.() || false,
        wsState: WSController?.getState?.() || 'UNKNOWN',
        pendingMessages: MessageLifecycle?.getPendingCount?.() || 0,
        queuedMessages: MessageTransport?.messageQueue?.length || 0,
        uptime: DiagnosticsAgent?.getUptime?.() || 0,
        timestamp: Date.now()
    };
}

// Add this helper method to determine connection quality
_getConnectionQuality() {
    if (!ParentDetector?.isReady) return 'dead';
    
    const health = HEARTBEAT;
    const now = Date.now();
    
    if (health.failures >= health.maxFailures) return 'dead';
    if (health.failures > 0) return 'poor';
    if (now - health.lastHeartbeat > 20000) return 'poor';
    
    // Check WebSocket state
    const wsState = WSController?.getState?.();
    if (wsState === 'READY') return 'excellent';
    if (wsState === 'CONNECTED' || wsState === 'AUTHENTICATING') return 'good';
    if (wsState === 'CONNECTING' || wsState === 'RECONNECTING') return 'fair';
    
    return 'unknown';
}

        async initialize() {
            if (this._initialized) {
                Logger.debug('MessagingClient', 'Already initialized');
                return this._initPromise;
            }

            this._initPromise = this._doInitialize();
            return this._initPromise;
        }

        async _doInitialize() {
            Logger.info('MessagingClient', `🚀 INIT: Messages Core v${VERSION} (${ENV.isLocal ? 'LOCAL' : ENV.isRender ? 'RENDER' : 'PRODUCTION'})`);
            
            try {
                // State: UNINITIALIZED → REGISTERING
                await StateMachine.transition(StateMachine.REGISTERING, 'starting-init');
                
                // Wait for core to be ready
                await StateMachine.init();
                
                // Initialize session mirror
                await SessionMirror.init();
                
                // Register with parent
                this._initMessageListener();
                this._initVisibilityHandler();
                this._initNetworkHandler();
                this._initHeartbeatMonitor();
                
                // Send registration
                try {
                    await registerWithParent();
                    ParentDetector.handleRegistrationAck();
                } catch (e) {
                    Logger.warn('MessagingClient', 'Registration failed, continuing in degraded mode', e);
                    // Continue in degraded mode
                }
                
                // State: REGISTERED → WAITING_FOR_SESSION
                await StateMachine.transition(StateMachine.WAITING_FOR_SESSION, 'registered');
                
                // Verify session with parent
                try {
                    await SessionAuthority.verifyWithParent();
                } catch (e) {
                    Logger.warn('MessagingClient', 'Session verification failed, using cache', e);
                }
                
                // Wait for session
                const session = await SessionAuthority.waitForSession();
                
                if (!session || !session.authenticated) {
                    Logger.warn('MessagingClient', 'No valid session, proceeding with limited functionality');
                    await StateMachine.transition(StateMachine.SESSION_ACTIVE, 'limited-session');
                } else {
                    await StateMachine.transition(StateMachine.SESSION_ACTIVE, 'session-verified');
                }
                
                // State: SESSION_ACTIVE → WAITING_FOR_TOKEN
                await StateMachine.transition(StateMachine.WAITING_FOR_TOKEN, 'session-active');
                
                // Wait for token
                try {
                    const token = await TokenAuthority.waitForToken();
                    Logger.success('MessagingClient', 'Token ready');
                } catch (e) {
                    Logger.error('MessagingClient', 'Token timeout', e);
                    await StateMachine.transition(StateMachine.ERROR_RECOVERABLE, 'token-timeout');
                    return;
                }
                
                // State: TOKEN_READY → WS_INITIALIZING
                await StateMachine.transition(StateMachine.WS_INITIALIZING, 'token-ready');
                
                // Connect WebSocket
                const wsUrl = ENV.isLocal ? 'ws://localhost:4000/ws' : 'wss://' + window.location.hostname + '/ws';
                
                try {
                    await WSController.connect(wsUrl);
                } catch (e) {
                    Logger.error('MessagingClient', 'WebSocket connection failed', e);
                    await StateMachine.transition(StateMachine.ERROR_RECOVERABLE, 'websocket-failed');
                    return;
                }
                
                // State: WS_READY → SERVICES_INITIALIZING
                await StateMachine.transition(StateMachine.SERVICES_INITIALIZING, 'websocket-ready');
                
                // Load cached data
                loadCachedData();
                
                // Load core data if authenticated
                if (SessionMirror.isAuthenticated()) {
                    await loadCoreData();
                }
                
                // State: READY
                await StateMachine.transition(StateMachine.READY, 'initialization-complete');
                
                this._initialized = true;
                
                // Dispatch ready event
                window.dispatchEvent(new CustomEvent('coreReady', {
                    detail: {
                        authenticated: SessionMirror.isAuthenticated(),
                        user: SessionMirror.getUser(),
                        frameId: FRAME_ID,
                        registered: registrationSent,
                        state: StateMachine.getState()
                    }
                }));
                
                Logger.success('MessagingClient', `✅ READY: Messages core initialized successfully`);
                StatusIndicator.show('CONNECTED', 'Ready');
                
                // Process any queued messages
                this.processQueue();
                
            } catch (error) {
                Logger.error('MessagingClient', 'Initialization failed', error);
                StatusIndicator.show('FAILED', error.message);
                await StateMachine.transition(StateMachine.ERROR_FATAL, error.message);
                throw error;
            }
        }

        _initMessageListener() {
            window.addEventListener('message', this._receive.bind(this));
            Logger.debug('MessagingClient', 'Message listener initialized');
        }

        _initVisibilityHandler() {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this._onPageActivated();
                }
            });
        }

        _initNetworkHandler() {
            window.addEventListener('online', () => {
                this._onNetworkRestored();
            });

            window.addEventListener('offline', () => {
                window.dispatchEvent(new CustomEvent('networkOffline'));
                StatusIndicator.show('DISCONNECTED', 'Offline');
                Logger.warn('MessagingClient', 'Network offline');
            });
        }

        _initHeartbeatMonitor() {
            setInterval(() => {
                const now = Date.now();
                if (HEARTBEAT.lastHeartbeat > 0 && 
                    now - HEARTBEAT.lastHeartbeat > 20000 && 
                    HEARTBEAT.failures < HEARTBEAT.maxFailures) {
                    ParentDetector.handleHeartbeatMiss();
                }
            }, 10000);
        }

        _onPageActivated() {
            Logger.debug('MessagingClient', 'Page activated');
            this.send(MESSAGE_TYPES.PAGE_ACTIVATED, {
                timestamp: Date.now(),
                frameId: FRAME_ID
            }, { requiresAck: false });
            
            this.messageFirewall.processQueue();
            this.transport.processQueue();
            
            if (SessionMirror && SessionMirror.isAuthenticated()) {
                this.sessionClient.sync(true);
            }
        }

        _onNetworkRestored() {
            Logger.info('MessagingClient', 'Network restored');
            this.messageFirewall.processQueue();
            this.transport.processQueue();
            StatusIndicator.show('CONNECTED', 'Online');
            
            if (SessionMirror && SessionMirror.isAuthenticated() && SessionMirror.isExpiringSoon()) {
                this.sessionClient.sync(true);
            }
            
            window.dispatchEvent(new CustomEvent('networkRestored'));
        }

        // In the _receive method, around line 3130, add this case:

async _receive(event) {
    try {
        if (!SecurityUtils.validateOrigin(event.origin)) {
            Logger.debug('MessagingClient', `Invalid origin: ${event.origin}`);
            return;
        }
        
        const message = this.messageFirewall.parse(event);
        if (!message) return;

        DiagnosticsAgent.increment('messagesReceived');
        Logger.debug('MessagingClient', `Received: ${message.type} (${message.messageId})`);

        switch (message.type) {
            case MESSAGE_TYPES.ACK:
            case MESSAGE_TYPES.HEARTBEAT_ACK:
            case MESSAGE_TYPES.SESSION_ACK:
            case MESSAGE_TYPES.REGISTRATION_ACK:
                this.transport.handleAck(message);
                return;

            case MESSAGE_TYPES.PONG:
                ParentDetector.handleHeartbeatAck(message);
                return;

            case MESSAGE_TYPES.PARENT_READY:
                parentReady = true;
                ParentDetector.isReady = true;
                ParentDetector._notifyListeners();
                SecurityUtils.allowedOrigins.add(event.origin);
                Logger.info('MessagingClient', 'Parent ready');
                window.dispatchEvent(new CustomEvent('parentReady'));
                return;

            // FIX: Add handler for SESSION_VERIFIED
            case MESSAGE_TYPES.SESSION_VERIFIED:
                Logger.info('MessagingClient', 'SESSION_VERIFIED received', message.payload);
                
                // Check if verification was successful
                if (message.payload?.valid) {
                    // If we have session data, use it
                    if (message.payload.session) {
                        SessionMirror.acceptSession(message.payload.session);
                    } else {
                        // Request full session data
                        this.send(MESSAGE_TYPES.REQUEST_SESSION, {
                            timestamp: Date.now(),
                            frameId: FRAME_ID,
                            requestId: message.requestId
                        }, { requiresAck: true });
                    }
                }
                
                // Handle verification response
                SessionAuthority.handleVerificationResponse(message);
                return;

            case MESSAGE_TYPES.SESSION_DATA:
            case MESSAGE_TYPES.SESSION_INIT:
                // Store session data
                Logger.info('MessagingClient', 'Session data received', message.payload);
                if (!SessionMirror.isAuthenticated()) {
                    ParentDetector._pendingSession = message.payload;
                    Logger.info('MessagingClient', 'Session data received early, storing');
                }
                this.sessionClient.handleSessionData(message);
                return;

            // ... rest of the switch cases ...
        }
    } catch (e) {
        Logger.error('MessagingClient', 'Message handling error', e);
    }
}
// In SessionMirror.acceptSession method (around line 2620), make sure token is passed to TokenAuthority:

acceptSession(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;

    const oldState = { ...this._state };
    
    this._state = {
        authenticated: !!(snapshot.user && snapshot.token),
        user: snapshot.user ? { ...snapshot.user } : null,
        token: snapshot.token || null,
        permissions: snapshot.permissions || [],
        capabilities: snapshot.capabilities || [],
        expiresAt: snapshot.expiresAt || (Date.now() + 3600000),
        receivedAt: Date.now(),
        fromCache: false,
        version: snapshot.version || VERSION,
        userId: snapshot.user?.id || snapshot.user?.userId || snapshot.userId,
        sessionId: snapshot.sessionId || this._generateSessionId(),
        lastActivity: Date.now()
    };

    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
        user: this._state.user,
        token: this._state.token,
        permissions: this._state.permissions,
        capabilities: this._state.capabilities,
        expiresAt: this._state.expiresAt,
        version: this._state.version,
        sessionId: this._state.sessionId
    });

    if (this._state.user) {
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._state.user);
    }

    // FIX: Provide token to TokenAuthority
    if (this._state.token) {
        TokenAuthority.receiveToken(this._state.token, 'session');
    }
    
    // Provide session to SessionAuthority
    SessionAuthority.receiveSession(this._state);

    this._setupRefreshTimer();
    this._notifySubscribers('session-accepted', { old: oldState, new: this._state });
    
    Logger.success('SessionMirror', 'Session accepted');
    
    return true;
}
        
async send(type, payload = {}, options = {}) {
    // Don't wait for ready for critical messages
    const criticalTypes = [
        MESSAGE_TYPES.IFRAME_REGISTERED,
        MESSAGE_TYPES.VERIFY_SESSION,
        MESSAGE_TYPES.REQUEST_SESSION,
        MESSAGE_TYPES.HEARTBEAT,
        MESSAGE_TYPES.PAGE_ACTIVATED
    ];
    
    if (!criticalTypes.includes(type)) {
        // Wait for ready state
        if (!StateMachine.isAtLeast(StateMachine.READY)) {
            await StateMachine.init();
            
            // If still not ready after waiting, queue it
            if (!StateMachine.isAtLeast(StateMachine.READY)) {
                Logger.debug('MessagingClient', `Queueing ${type}: core not ready (${StateMachine.getState()})`);
                // Queue the message for later
                setTimeout(() => {
                    this.send(type, payload, options).catch(() => {});
                }, 1000);
                return { 
                    success: false, 
                    queued: true,
                    error: 'core-not-ready',
                    state: StateMachine.getState()
                };
            }
        }
    }

    try {
        Logger.debug('MessagingClient', `Sending: ${type}`);
        const result = await this.transport.send(type, payload, options);
        if (result.success) {
            DiagnosticsAgent.increment('messagesSent');
        }
        return result;
    } catch (error) {
        Logger.error('MessagingClient', `Send error for ${type}`, error);
        return { success: false, error: error.message };
    }
}
}
    // Create singleton instance
    const messagingClient = new MessagingClient();


    // =============================================
    // SAFE FETCH UTILITY
    // =============================================
    async function safeFetch(url, options = {}) {
        try {
            const response = await fetch(url, {
                credentials: "include",
                ...options
            });

            if (!response.ok) {
                throw new Error("HTTP error " + response.status);
            }

            return await response.json();
        } catch (error) {
            DiagnosticsAgent.recordError(error, 'safeFetch');
            return { success: false, message: "Network issue" };
        }
    }

    // =============================================
    // API CLIENT
    // =============================================
    let apiBaseUrl = ENV.getApiBaseUrl();

    const APIClient = {
        pendingRequests: new Map(),
        baseUrl: apiBaseUrl,
        defaultTimeout: 30000,

        setBaseUrl(url) {
            this.baseUrl = url;
            Logger.debug('APIClient', `Base URL set to: ${url}`);
        },

        async request(endpoint, options = {}) {
            try {
                if (!endpoint || typeof endpoint !== 'string') return null;

                // Normalize endpoint
                if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
                    Logger.warn('APIClient', `External URL blocked: ${endpoint}`);
                    return null;
                }

                if (!endpoint.startsWith('/api/')) {
                    endpoint = '/api/' + endpoint.replace(/^\/+/, '');
                }

                // Wait for token if needed
                let token = SessionMirror.getToken();
                if (!token) {
                    try {
                        token = await TokenAuthority.waitForToken();
                    } catch (e) {
                        token = null;
                    }
                }

                const requestId = options.requestId || SecurityUtils.generateRequestId();
                
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Client-Version': VERSION,
                    'X-Request-ID': requestId,
                    'X-Frame-ID': FRAME_ID
                };

                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                // Try parent first if available
                if (ParentDetector.isReady && options.useParent !== false) {
                    return this._requestViaParent(endpoint, options, requestId, headers);
                }

                // Fallback to direct API call
                return this._requestDirect(endpoint, options, headers, requestId);
            } catch (error) {
                Logger.error('APIClient', `Request failed: ${error.message}`);
                return null;
            }
        },

        async _requestViaParent(endpoint, options, requestId, headers) {
            return new Promise((resolve) => {
                const timeout = options.timeout || this.defaultTimeout;
                
                const timer = setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        Logger.debug('APIClient', `Parent request timeout, falling back to direct: ${endpoint}`);
                        this.pendingRequests.delete(requestId);
                        this._requestDirect(endpoint, options, headers, requestId).then(resolve);
                    }
                }, timeout);

                this.pendingRequests.set(requestId, { resolve, timer });

                messagingClient.send(
                    MESSAGE_TYPES.API_REQUEST,
                    {
                        endpoint,
                        method: options.method || 'GET',
                        headers: options.headers || {},
                        body: options.body,
                        requestId
                    },
                    { requiresAck: true, timeout, requestId }
                ).catch(() => {
                    clearTimeout(timer);
                    this.pendingRequests.delete(requestId);
                    this._requestDirect(endpoint, options, headers, requestId).then(resolve);
                });
            });
        },

        async _requestDirect(endpoint, options, headers, requestId) {
            try {
                // Build full URL
                let url = endpoint;
                if (this.baseUrl && !endpoint.startsWith('http')) {
                    url = this.baseUrl + endpoint;
                }

                // Don't try to call API if no baseUrl (standalone mode)
                if (!url.startsWith('http')) {
                    return { error: 'No API endpoint configured', offline: true };
                }

                const fetchOptions = {
                    method: options.method || 'GET',
                    headers: headers || {
                        'Content-Type': 'application/json',
                        'X-Client-Version': VERSION,
                        'X-Request-ID': requestId,
                        'X-Frame-ID': FRAME_ID
                    },
                    credentials: 'same-origin',
                    mode: 'cors',
                    cache: 'no-cache',
                    signal: options.signal
                };

                if (options.method && options.method !== 'GET' && options.body) {
                    fetchOptions.body = typeof options.body === 'string' 
                        ? options.body 
                        : JSON.stringify(SecurityUtils.sanitizePayload(options.body));
                }

                Logger.debug('APIClient', `Direct request: ${options.method || 'GET'} ${url}`);
                const response = await fetch(url, fetchOptions);
                
                if (!response.ok) {
                    Logger.warn('APIClient', `HTTP ${response.status}: ${endpoint}`);
                    return { 
                        error: `HTTP ${response.status}`, 
                        status: response.status,
                        offline: response.status === 404,
                        endpoint 
                    };
                }

                const data = await response.json();
                Logger.debug('APIClient', `Request successful: ${endpoint}`);
                return data;
            } catch (error) {
                Logger.warn('APIClient', `Network error: ${endpoint}`, error);
                return { error: 'Network error', offline: true, endpoint };
            }
        },

        async fetchWithFallback(endpoint, options = {}, fallback = null) {
            const result = await this.request(endpoint, options);
            
            // If we got a 404 or network error and have fallback data, use it
            if (result && (result.error || result.offline)) {
                // Try to get from cache
                const cacheKey = `api_cache_${endpoint.replace(/\//g, '_')}`;
                const cached = SafeStorage.getJSON(cacheKey);
                if (cached) {
                    DiagnosticsAgent.increment('cacheHits');
                    Logger.debug('APIClient', `Cache hit for ${endpoint}`);
                    return cached;
                }
                
                DiagnosticsAgent.increment('cacheMisses');
                Logger.debug('APIClient', `Cache miss for ${endpoint}`);
                
                // Use provided fallback
                if (fallback !== null) return fallback;
                
                // Return empty array/object based on endpoint
                if (endpoint.includes('/chats') || endpoint.includes('/contacts') || endpoint.includes('/messages')) {
                    return [];
                }
                return fallback;
            }
            
            // Cache successful responses
            if (result && !result.error) {
                const cacheKey = `api_cache_${endpoint.replace(/\//g, '_')}`;
                SafeStorage.setJSON(cacheKey, result);
            }
            
            return result;
        },

        handleParentResponse(payload) {
            const requestId = payload.requestId;
            if (requestId && this.pendingRequests.has(requestId)) {
                const { resolve, timer } = this.pendingRequests.get(requestId);
                clearTimeout(timer);
                resolve(payload.data || payload.result);
                this.pendingRequests.delete(requestId);
                Logger.debug('APIClient', `Parent response received for ${requestId}`);
            }
        }
    };

    // =============================================
    // CORE STATE
    // =============================================
    let currentUser = null;
    let currentChat = null;
    let currentFriend = null;
    let messages = [];
    let chats = [];
    let contacts = [];
    let isRecording = false;
    let mediaRecorder = null;
    let recordingTimer = null;
    let recordingStartTime = null;
    let typingTimeout = null;
    let isTyping = false;
    let selectedMessage = null;
    let currentThread = null;
    let chatThemes = {};
    let emojiPicker = null;
    let isSyncing = false;
    let audioPlayers = new Map();
    let editingMessageId = null;
    let replyToMessage = null;
    let currentCategory = 'all';
    let activeFormattingTags = [];
    let activeAudioElement = null;
    let scheduledMessages = [];
    let offlineQueue = [];
    let messageDrafts = {};
    let silentReactionsEnabled = true;
    let readOnlyMode = false;
    let currentAttachment = null;
    let searchResults = [];
    let currentSearchIndex = -1;
    let multiSendSelectedChats = new Set();
    let recordingCancelTimeout = null;
    let dragStartY = 0;
    let isDraggingToCancel = false;

    // Subscribe to session changes
    SessionMirror.subscribe((event) => {
        currentUser = event.state.user;
        window.dispatchEvent(new CustomEvent('sessionUpdated', { 
            detail: { session: event.state, changeType: event.type }
        }));
    });

    ParentDetector.subscribe((data) => {
        window.dispatchEvent(new CustomEvent('parentStatusChanged', { detail: data }));
    });

    // =============================================
    // INITIALIZATION
    // =============================================
    async function initialize() {
        try {
            DiagnosticsAgent.init(ENV.isLocal || window.__IFRAME_DEBUG__);
            
            // Initialize messaging client
            await messagingClient.initialize();

        } catch (error) {
            DiagnosticsAgent.recordError(error, 'Init.fatal');
            StatusIndicator.show('FAILED', error.message);
            Logger.error('Init', 'Fatal initialization error', error);

            window.dispatchEvent(new CustomEvent('coreReady', {
                detail: {
                    authenticated: false,
                    user: null,
                    fallback: true,
                    error: error.message,
                    state: StateMachine.getState()
                }
            }));
        }
    }

    // =============================================
    // DATA MANAGEMENT
    // =============================================
    function loadCachedData() {
        try {
            const cachedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cachedChats) {
                chats = cachedChats;
                Logger.debug('Data', `Loaded ${chats.length} chats from cache`);
            }

            const cachedContacts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE);
            if (cachedContacts) {
                contacts = cachedContacts;
                Logger.debug('Data', `Loaded ${contacts.length} contacts from cache`);
            }

            const cachedDrafts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
            if (cachedDrafts) {
                messageDrafts = cachedDrafts;
                Logger.debug('Data', `Loaded drafts from cache`);
            }

            const cachedOffline = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
            if (cachedOffline) {
                offlineQueue = cachedOffline;
                Logger.debug('Data', `Loaded ${offlineQueue.length} offline messages`);
            }
        } catch (error) {
            Logger.warn('Data', 'Error loading cached data', error);
        }
    }

    async function loadCoreData() {
        try {
            if (!SessionMirror.isAuthenticated()) return false;

            Logger.info('Data', 'Loading core data from API');

            // Use fetchWithFallback which handles 404s gracefully
            const chatsData = await APIClient.fetchWithFallback('/api/chats', {}, []);
            if (Array.isArray(chatsData)) {
                chats = chatsData;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
                Logger.info('Data', `Loaded ${chats.length} chats`);
            }

            const contactsData = await APIClient.fetchWithFallback('/api/contacts', {}, []);
            if (Array.isArray(contactsData)) {
                contacts = contactsData;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE, contacts);
                Logger.info('Data', `Loaded ${contacts.length} contacts`);
            }

            return true;
        } catch (error) {
            Logger.warn('Data', 'Error loading core data', error);
            return false;
        }
    }

    // =============================================
    // EXPORTED FUNCTIONS (All preserved)
    // =============================================
    function setCurrentUser(user) { currentUser = user; }
    function setCurrentChat(chat) { currentChat = chat; }
    function setCurrentFriend(friend) { currentFriend = friend; }
    function setMessages(newMessages) { messages = newMessages; }
    function setChats(newChats) { chats = newChats; }
    function setContacts(newContacts) { contacts = newContacts; }
    function setIsRecording(value) { isRecording = value; }
    function setMediaRecorder(recorder) { mediaRecorder = recorder; }
    function setRecordingTimer(timer) { recordingTimer = timer; }
    function setRecordingStartTime(time) { recordingStartTime = time; }
    function setTypingTimeout(timeout) { typingTimeout = timeout; }
    function setIsTyping(value) { isTyping = value; }
    function setSelectedMessage(message) { selectedMessage = message; }
    function setCurrentThread(threadId) { currentThread = threadId; }
    function setChatThemes(themes) { chatThemes = themes; }
    function setEmojiPicker(picker) { emojiPicker = picker; }
    function setIsSyncing(value) { isSyncing = value; }
    function setAudioPlayers(players) { audioPlayers = players; }
    function setEditingMessageId(id) { editingMessageId = id; }
    function setReplyToMessage(message) { replyToMessage = message; }
    function setCurrentCategory(category) { currentCategory = category; }
    function setActiveFormattingTags(tags) { activeFormattingTags = tags; }
    function setActiveAudioElement(element) { activeAudioElement = element; }
    function setScheduledMessages(messages) { scheduledMessages = messages; }
    function setOfflineQueue(queue) { offlineQueue = queue; }
    function setMessageDrafts(drafts) { messageDrafts = drafts; }
    function setSilentReactionsEnabled(value) { silentReactionsEnabled = value; }
    function setReadOnlyMode(value) { readOnlyMode = value; }
    function setCurrentAttachment(attachment) { currentAttachment = attachment; }
    function setSearchResults(results) { searchResults = results; }
    function setCurrentSearchIndex(index) { currentSearchIndex = index; }
    function setMultiSendSelectedChats(chats) { multiSendSelectedChats = chats; }
    function setRecordingCancelTimeout(timeout) { recordingCancelTimeout = timeout; }
    function setDragStartY(y) { dragStartY = y; }
    function setIsDraggingToCancel(value) { isDraggingToCancel = value; }

    function getCurrentSession() {
        const session = SessionMirror.getState();
        return {
            user: session.user,
            authenticated: session.authenticated,
            token: session.token,
            fromCache: session.fromCache,
            userId: session.userId
        };
    }

    function requestSessionUpdate() {
        return SessionClient.requestSession(true);
    }

    function initChildSession() {
        return new Promise((resolve) => {
            if (SessionMirror.isAuthenticated() && currentUser) {
                resolve({ user: currentUser, sessionData: SessionMirror.getState() });
            } else {
                const checkInterval = setInterval(() => {
                    if (SessionMirror.isAuthenticated() && currentUser) {
                        clearInterval(checkInterval);
                        resolve({ user: currentUser, sessionData: SessionMirror.getState() });
                    }
                }, 100);

                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve(null);
                }, 5000);
            }
        });
    }

    function sendToParent(type, data = null, options = {}) {
        return messagingClient.send(type, data, options);
    }

    async function apiRequest(endpoint, options = {}) {
        return APIClient.request(endpoint, options);
    }

    async function fetchData(type) {
        switch (type) {
            case 'friendsList': return APIClient.fetchWithFallback('/api/friends', {}, []);
            case 'groupsList': return APIClient.fetchWithFallback('/api/groups', {}, []);
            case 'chatHistory': 
                if (!currentChat) return [];
                return APIClient.fetchWithFallback(`/api/chat-history/${currentChat.id}`, {}, []);
            case 'notifications': return APIClient.fetchWithFallback('/api/notifications', {}, []);
            case 'settings': return APIClient.fetchWithFallback('/api/settings', {}, {});
            default: return null;
        }
    }

    async function loadContacts() {
        contacts = await APIClient.fetchWithFallback('/api/contacts', {}, []);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE, contacts);
        return contacts;
    }

    async function loadChats() {
        chats = await APIClient.fetchWithFallback('/api/chats', {}, []);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        return chats;
    }

    async function loadMessages(chatId = null) {
        const targetChat = chatId || currentChat?.id;
        if (!targetChat) return [];

        const data = await APIClient.fetchWithFallback(`/api/messages/${targetChat}`, {}, []);
        if (Array.isArray(data)) {
            messages = data;
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${targetChat}`, messages);
        }
        return messages;
    }

    async function openChat(chat) {
        if (!chat) return false;

        currentChat = chat;
        currentFriend = chat.friend ? { ...chat.friend } : null;

        await loadMessages(chat.id);

        window.dispatchEvent(new CustomEvent('chatOpened', { 
            detail: { chat } 
        }));

        return true;
    }

    async function loadChatByFriendId(friendId) {
        const chat = chats.find(c => c.friendId === friendId);
        if (chat) {
            await openChat(chat);
            return chat;
        }

        const newChat = await APIClient.request('/api/chats', {
            method: 'POST',
            body: JSON.stringify({ friendId })
        });

        if (newChat && !newChat.error) {
            chats.unshift(newChat);
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            await openChat(newChat);
            return newChat;
        }

        return null;
    }

    function createLocalChat(friendId, friendData) {
        const newChat = {
            id: 'local_' + Date.now(),
            friendId: friendId,
            friendName: friendData.displayName || 'User',
            friendUsername: '',
            friendAvatar: friendData.photoURL || '',
            lastMessage: '',
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            type: 'direct',
            archived: false,
            blocked: false,
            local: true
        };

        chats.unshift(newChat);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        openChat(newChat);
    }

    async function sendMessage(content, type = 'text', options = {}) {
        if (!currentChat) return false;

        const messageData = {
            id: SecurityUtils.generateMessageId(),
            requestId: SecurityUtils.generateRequestId(),
            chatId: currentChat.id,
            senderId: SessionMirror.getUser()?.id || 'local',
            content: SecurityUtils.escapeHtml(content || ''),
            type,
            timestamp: new Date().toISOString(),
            status: 'sending',
            reason: null,
            frameId: FRAME_ID,
            ...options
        };

        messages.push(messageData);
        Logger.debug('sendMessage', `Sending message ${messageData.id}`);

        // Listen for status changes
        const handleStatusChange = (event) => {
            const updatedMessage = event.detail.message;
            if (updatedMessage.id === messageData.id) {
                const idx = messages.findIndex(m => m.id === updatedMessage.id);
                if (idx !== -1) {
                    messages[idx] = updatedMessage;
                    
                    window.dispatchEvent(new CustomEvent('messagesUpdated', {
                        detail: { messages }
                    }));
                    
                    if (updatedMessage.status === 'failed' && updatedMessage.reason) {
                        showStatusMessage(`❌ Message failed: ${updatedMessage.reason}`);
                    } else if (updatedMessage.status === 'delivered') {
                        Logger.debug('sendMessage', `Message ${messageData.id} delivered`);
                    }
                }
            }
        };

        window.addEventListener('messageStatusChanged', handleStatusChange, { once: true });

        if (SessionMirror.isAuthenticated() && TokenAuthority.hasToken() && WSController.isReady()) {
            // Send via WebSocket for real-time
            const wsSent = WSController.send({
                type: 'send_message',
                message: messageData
            });
            
            if (wsSent) {
                const idx = messages.findIndex(m => m.id === messageData.id);
                if (idx !== -1) {
                    messages[idx].status = 'sent';
                    Logger.debug('sendMessage', `Message ${messageData.id} sent via WebSocket`);
                }
            }
            
            // Also send via parent as backup
            const result = await APIClient.request('/api/messages/send', {
                method: 'POST',
                body: JSON.stringify(messageData)
            });

            if (result && !result.error) {
                const idx = messages.findIndex(m => m.id === messageData.id);
                if (idx !== -1) {
                    messages[idx] = { ...result, status: 'sent' };
                    
                    const sendResult = await messagingClient.send(MESSAGE_TYPES.SEND_MESSAGE, messages[idx]);
                    
                    if (!sendResult.success) {
                        messages[idx].status = 'failed';
                        messages[idx].reason = sendResult.reason || 'Failed';
                        showStatusMessage(`❌ ${messages[idx].reason}`);
                        Logger.warn('sendMessage', `Message ${messageData.id} failed: ${messages[idx].reason}`);
                    } else {
                        Logger.debug('sendMessage', `Message ${messageData.id} confirmed by parent`);
                    }
                }

                const chatIdx = chats.findIndex(c => c.id === currentChat.id);
                if (chatIdx !== -1) {
                    chats[chatIdx].lastMessage = content;
                    chats[chatIdx].lastMessageAt = new Date().toISOString();
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
                }

                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);

                return true;
            }

            const idx = messages.findIndex(m => m.id === messageData.id);
            if (idx !== -1) {
                messages[idx].status = 'failed';
                messages[idx].reason = 'Server rejected';
                showStatusMessage(`❌ Server rejected`);
                Logger.warn('sendMessage', `Message ${messageData.id} rejected by server`);
            }

            return false;
        }

        // Offline mode - queue message
        offlineQueue.push(messageData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
        Logger.info('sendMessage', `Message ${messageData.id} queued for offline delivery`);
        return true;
    }

    async function sendMessageWithOptions(content, options = {}) {
        return sendMessage(content, options.type || 'text', options);
    }

    async function sendToMultipleChats(content, chatIds) {
        if ((!content && !currentAttachment) || !chatIds?.length) return 0;

        let successCount = 0;

        for (const chatId of chatIds) {
            const result = await APIClient.request('/api/messages/send', {
                method: 'POST',
                body: JSON.stringify({
                    chatId,
                    content: SecurityUtils.escapeHtml(content || ''),
                    type: currentAttachment?.type || 'text',
                    attachment: currentAttachment,
                    frameId: FRAME_ID
                })
            });

            if (result && !result.error) successCount++;
        }

        Logger.info('sendToMultipleChats', `Sent to ${successCount}/${chatIds.length} chats`);
        return successCount;
    }

    async function editMessage(messageId, newContent) {
        if (!SessionMirror.isAuthenticated()) return false;

        const result = await APIClient.request('/api/messages/edit', {
            method: 'POST',
            body: JSON.stringify({ messageId, content: newContent })
        });

        if (result && !result.error) {
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages[idx].content = SecurityUtils.escapeHtml(newContent);
                messages[idx].edited = true;
                messages[idx].editedAt = new Date().toISOString();
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
                Logger.debug('editMessage', `Message ${messageId} edited`);
            }
            return true;
        }
        return false;
    }

    function saveEditedMessage(messageId) {
        const input = document.getElementById(`editMessageInput_${messageId}`);
        if (input && input.value?.trim()) {
            return editMessage(messageId, input.value.trim());
        }
        return false;
    }

    function cancelEditMessage() {
        editingMessageId = null;
    }

    async function deleteMessage(messageId, forEveryone = false) {
        if (!SessionMirror.isAuthenticated()) return false;

        if (forEveryone) {
            const result = await APIClient.request('/api/messages/delete', {
                method: 'POST',
                body: JSON.stringify({ messageId })
            });

            if (result && !result.error) {
                const idx = messages.findIndex(m => m.id === messageId);
                if (idx !== -1) {
                    messages[idx].deleted = true;
                    messages[idx].deletedAt = new Date().toISOString();
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
                    Logger.info('deleteMessage', `Message ${messageId} deleted for everyone`);
                }
                return true;
            }
        } else {
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages.splice(idx, 1);
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
                Logger.debug('deleteMessage', `Message ${messageId} deleted locally`);
                return true;
            }
        }
        return false;
    }

    async function markChatAsRead(chatId) {
        if (!SessionMirror.isAuthenticated()) return false;

        const result = await APIClient.request('/api/chats/read', {
            method: 'POST',
            body: JSON.stringify({ chatId })
        });

        if (result && !result.error) {
            const idx = chats.findIndex(c => c.id === chatId);
            if (idx !== -1) {
                chats[idx].unreadCount = 0;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
                Logger.debug('markChatAsRead', `Chat ${chatId} marked as read`);
            }
            return true;
        }
        return false;
    }

    async function addReaction(messageId, emoji, silent = false) {
        if (!SessionMirror.isAuthenticated()) return false;

        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) return false;

        if (!messages[idx].reactions) messages[idx].reactions = {};

        const userId = SessionMirror.getUser()?.id;
        if (!userId) return false;

        if (!messages[idx].reactions[emoji]) {
            messages[idx].reactions[emoji] = [];
        }

        const userIndex = messages[idx].reactions[emoji].indexOf(userId);

        if (userIndex > -1) {
            messages[idx].reactions[emoji].splice(userIndex, 1);
        } else {
            messages[idx].reactions[emoji].push(userId);
        }

        if (messages[idx].reactions[emoji].length === 0) {
            delete messages[idx].reactions[emoji];
        }

        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
        return userIndex > -1 ? 'removed' : 'added';
    }

    async function toggleBlockUser(friendId, block) {
        if (!SessionMirror.isAuthenticated()) return false;

        const blockedUsers = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);

        if (block) {
            if (!blockedUsers.includes(friendId)) blockedUsers.push(friendId);
        } else {
            const index = blockedUsers.indexOf(friendId);
            if (index > -1) blockedUsers.splice(index, 1);
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, blockedUsers);

        chats.forEach(chat => {
            if (chat.friendId === friendId) chat.blocked = block;
        });

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        await loadChats();

        return true;
    }

    async function toggleArchiveChat(chatId, archive) {
        if (!SessionMirror.isAuthenticated()) return false;

        const archivedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);

        if (archive) {
            if (!archivedChats.includes(chatId)) archivedChats.push(chatId);
        } else {
            const index = archivedChats.indexOf(chatId);
            if (index > -1) archivedChats.splice(index, 1);
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, archivedChats);

        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].archived = archive;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            return true;
        }

        return false;
    }

    async function toggleReadOnly(chatId, readOnly) {
        if (!SessionMirror.isAuthenticated()) return false;

        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].readOnly = readOnly;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
            return true;
        }
        return false;
    }

    async function clearChatHistory(chatId) {
        if (!SessionMirror.isAuthenticated()) return false;

        SafeStorage.remove(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`);

        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].lastMessage = '';
            chats[idx].unreadCount = 0;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        }

        if (currentChat?.id === chatId) {
            messages = [];
        }

        return true;
    }

    async function voteInPoll(messageId, optionIndex) {
        if (!SessionMirror.isAuthenticated()) return false;

        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) return false;

        const poll = messages[idx];
        if (!poll.options || !Array.isArray(poll.options)) return false;

        const userId = SessionMirror.getUser()?.id;
        if (!userId) return false;

        if (poll.userVote !== undefined && poll.userVote !== null) {
            const prevOption = poll.options[poll.userVote];
            if (prevOption) {
                prevOption.votes = Math.max(0, (prevOption.votes || 0) - 1);
                const voterIndex = prevOption.voters?.indexOf(userId);
                if (voterIndex > -1) prevOption.voters.splice(voterIndex, 1);
            }
        }

        if (!poll.options[optionIndex]) return false;

        poll.options[optionIndex].votes = (poll.options[optionIndex].votes || 0) + 1;
        if (!poll.options[optionIndex].voters) poll.options[optionIndex].voters = [];
        poll.options[optionIndex].voters.push(userId);
        poll.userVote = optionIndex;

        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
        return true;
    }

    function formatMessageText(text) {
        if (!text) return '';

        let formatted = SecurityUtils.escapeHtml(text);
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        formatted = formatted.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }

    function formatTime(date) {
        if (!date) return '';

        const now = new Date();
        const messageDate = new Date(date);
        const diffMs = now - messageDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return messageDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatDate(date) {
        if (!date) return '';

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const messageDate = new Date(date);

        if (messageDate.toDateString() === today.toDateString()) return 'Today';
        if (messageDate.toDateString() === yesterday.toDateString()) return 'Yesterday';

        return messageDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }

    function formatDateTime(date) {
        if (!date) return '';
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(text) {
        return SecurityUtils.escapeHtml(text);
    }

    function escapeRegex(string) {
        return SecurityUtils.escapeRegex(string);
    }

    function sanitizePayload(payload) {
        return SecurityUtils.sanitizePayload(payload);
    }

    function preserveFormatting(text) {
        if (!text) return '';

        const markers = {
            '**bold**': '###BOLD###',
            '*italic*': '###ITALIC###',
            '`code`': '###CODE###',
            '```\ncode block\n```': '###CODE_BLOCK###'
        };

        let processed = text;
        Object.entries(markers).forEach(([marker, placeholder]) => {
            processed = processed.replace(new RegExp(marker.replace(/\*/g, '\\*').replace(/`/g, '\\`'), 'g'), placeholder);
        });

        processed = escapeHtml(processed);

        Object.entries(markers).forEach(([marker, placeholder]) => {
            processed = processed.replace(new RegExp(placeholder, 'g'), marker);
        });

        return processed;
    }

    function showStatusMessage(message) {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.style.display = 'block';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    function hideStatusMessage() {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
    }

    function validateMessageStructure(message) {
        return SecurityUtils.validateMessageStructure(message);
    }

    function validateMessagePayload(payload, messageType) {
        if (!payload || typeof payload !== 'object') return { valid: false, error: 'Invalid payload' };

        switch (messageType) {
            case 'text':
                if (typeof payload.content !== 'string' || !payload.content.trim()) {
                    return { valid: false, error: 'Text message must have content' };
                }
                break;
            case 'image':
            case 'video':
            case 'file':
                if (!payload.content) {
                    return { valid: false, error: 'Media message must have content' };
                }
                break;
            case 'audio':
                if (!payload.content || !payload.duration) {
                    return { valid: false, error: 'Audio message must have content and duration' };
                }
                break;
        }

        return { valid: true };
    }

    function validateMessageBeforeSend(message) {
        if (!message) return { valid: false, error: 'Invalid message' };

        if (!message.content && !currentAttachment) {
            return { valid: false, error: 'Message content is required' };
        }

        if (!currentChat) {
            return { valid: false, error: 'No active chat' };
        }

        if (readOnlyMode || currentChat?.readOnly) {
            return { valid: false, error: 'Chat is read-only' };
        }

        return { valid: true };
    }

    function validateData(data, type) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Data must be an object' };
        }

        switch (type) {
            case 'friendsList':
                if (!Array.isArray(data)) return { valid: false, error: 'friendsList must be an array' };
                for (const friend of data) {
                    if (!friend.id && !friend.uid) return { valid: false, error: 'Friend must have valid id' };
                }
                break;
            case 'chatHistory':
                if (!Array.isArray(data)) return { valid: false, error: 'chatHistory must be an array' };
                for (const message of data) {
                    if (!message.id) return { valid: false, error: 'Message must have valid id' };
                }
                break;
        }

        return { valid: true };
    }

    function validateSessionData(data) {
        return !!(data && typeof data === 'object' && (data.user || data.token || data.mode));
    }

    function getData(type) {
        switch (type) {
            case 'friendsList': return contacts;
            case 'groupsList': return [];
            case 'chatHistory': return messages;
            case 'notifications': return [];
            case 'settings': return SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
            default: return null;
        }
    }

    function updateData(type, payload) {
        switch (type) {
            case 'friendsList':
                contacts = payload;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CONTACTS_CACHE, contacts);
                break;
            case 'chatHistory':
                messages = payload;
                if (currentChat) {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
                }
                break;
            case 'settings':
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, payload);
                break;
            default: return false;
        }
        return true;
    }

    function isCoreReady() {
        return StateMachine.isInState(StateMachine.READY);
    }

    function getConnectionHealth() {
        return messagingClient.getHealth();
    }

    function showMessageActions(message, x, y) {
        selectedMessage = message;

        window.dispatchEvent(new CustomEvent('showMessageActions', {
            detail: { message, x, y }
        }));
    }

    function closeMessageActions() {
        selectedMessage = null;
        window.dispatchEvent(new CustomEvent('closeMessageActions'));
    }

    function handleMessageAction(action) {
        if (!selectedMessage) return false;

        window.dispatchEvent(new CustomEvent('handleMessageAction', {
            detail: { action, message: selectedMessage }
        }));

        return true;
    }

    function showForwardMessage(message) {
        if (!message) return;
        const forwardText = `[Forwarded] ${message.content || ''}`;
        navigator.clipboard.writeText(forwardText).catch(() => {});
    }

    function toggleStarMessage(messageId) {
        const starred = SafeStorage.getJSON('starred_messages', {});
        const isStarred = !!starred[messageId];

        if (isStarred) {
            delete starred[messageId];
        } else {
            starred[messageId] = true;
        }

        SafeStorage.setJSON('starred_messages', starred);
        return !isStarred;
    }

    function showMessageInfo(message) {
        if (!message) return '';

        return `Message Information:
Sent: ${formatDateTime(message.timestamp)}
${message.edited ? `Edited: ${formatDateTime(message.editedAt)}\n` : ''}
${message.deleted ? `Deleted: ${formatDateTime(message.deletedAt)}\n` : ''}
Status: ${message.status || 'unknown'}
Type: ${message.type || 'unknown'}
${message.fileName ? `File: ${message.fileName}\n` : ''}
${message.fileSize ? `Size: ${formatFileSize(message.fileSize)}\n` : ''}`;
    }

    function showReportModal(message) {
        if (!message) return;

        SafeStorage.setJSON('reported_message', {
            messageId: message.id,
            chatId: currentChat?.id || '',
            senderId: message.senderId,
            content: message.content,
            type: message.type,
            timestamp: new Date().toISOString()
        });
    }

    function submitReport() {
        const reportText = document.getElementById('reportText');
        if (!reportText || !reportText.value?.trim()) return false;

        const reportData = {
            message: SafeStorage.getJSON('reported_message', {}),
            reason: reportText.value.trim(),
            reporterId: SessionMirror.getUser()?.id || 'unknown',
            timestamp: new Date().toISOString()
        };

        const reports = SafeStorage.getJSON('reports', []);
        reports.push(reportData);
        SafeStorage.setJSON('reports', reports);

        if (SessionMirror.isAuthenticated()) {
            APIClient.request('/api/reports', {
                method: 'POST',
                body: JSON.stringify(reportData)
            }).catch(() => {});
        }

        return true;
    }

    function initEmojiPicker() {
        emojiPicker = document.querySelector('emoji-picker');
        if (emojiPicker) {
            emojiPicker.addEventListener('emoji-click', (event) => {
                const messageInput = document.getElementById('messageInput');
                if (messageInput) {
                    messageInput.value += event.detail.unicode || '';
                    messageInput.focus();
                }
            });
        }
    }

    function toggleEmojiPicker() {
        const container = document.getElementById('emojiPickerContainer');
        if (container) {
            container.classList.toggle('active');
        }
    }

    function closeEmojiPickerOnClickOutside(event) {
        const container = document.getElementById('emojiPickerContainer');
        const button = document.getElementById('emojiBtn');

        if (container?.classList.contains('active')) {
            if (!container.contains(event.target) && (!button || !button.contains(event.target))) {
                container.classList.remove('active');
            }
        }
    }

    function toggleFormattingToolbar() {
        const toolbar = document.getElementById('formattingToolbar');
        if (toolbar) {
            toolbar.classList.toggle('active');
        }
    }

    function closeFormattingToolbarOnClickOutside(event) {
        const toolbar = document.getElementById('formattingToolbar');
        const button = document.getElementById('formatBtn');

        if (toolbar?.classList.contains('active')) {
            if (!toolbar.contains(event.target) && (!button || !button.contains(event.target))) {
                toolbar.classList.remove('active');
            }
        }
    }

    function applyFormatting(tag) {
        const input = document.getElementById('messageInput');
        if (!input) return;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const selectedText = input.value.substring(start, end);

        let wrappedText = selectedText;
        switch (tag) {
            case 'b': wrappedText = `**${selectedText}**`; break;
            case 'i': wrappedText = `*${selectedText}*`; break;
            case 'code': wrappedText = `\`${selectedText}\``; break;
            case 'pre': wrappedText = `\`\`\`\n${selectedText}\n\`\`\``; break;
        }

        input.value = input.value.substring(0, start) + wrappedText + input.value.substring(end);
        input.focus();
        input.setSelectionRange(start + wrappedText.length, start + wrappedText.length);
    }

    function toggleAttachmentOptions() {
        const options = document.getElementById('attachmentOptions');
        if (options) {
            options.classList.toggle('active');
        }
    }

    function closeAttachmentOptionsOnClickOutside(event) {
        const options = document.getElementById('attachmentOptions');
        const button = document.getElementById('attachBtn');

        if (options?.classList.contains('active')) {
            if (!options.contains(event.target) && (!button || !button.contains(event.target))) {
                options.classList.remove('active');
            }
        }
    }

    function handleAttachment(type) {
        window.dispatchEvent(new CustomEvent('handleAttachment', {
            detail: { type }
        }));
    }

    async function createNote() {
        const input = document.getElementById('messageInput');
        const content = input?.value?.trim() || 'Note';
        return await sendMessageWithOptions(content, { isNote: true });
    }

    async function selectImage() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file || file.size > 10 * 1024 * 1024) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        type: 'image',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }

    async function selectVideo() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file || file.size > 50 * 1024 * 1024) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        type: 'video',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }

    async function selectFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file || file.size > 100 * 1024 * 1024) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        type: 'file',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }

    async function shareLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        type: 'location',
                        data: `https://maps.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}&z=15&output=embed`,
                        name: `Location (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)})`,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                () => resolve(null),
                { timeout: 10000 }
            );
        });
    }

    function createPoll() {
        const question = prompt('Enter poll question:');
        if (!question) return null;

        const options = [];
        for (let i = 1; i <= 4; i++) {
            const option = prompt(`Enter option ${i} (leave empty to finish):`);
            if (!option) break;
            options.push({
                text: option,
                votes: 0,
                voters: []
            });
        }

        if (options.length < 2) return null;

        return { question, options };
    }

    function showAttachmentPreview(attachment) {
        const preview = document.getElementById('attachmentPreview');
        if (!preview) return;

        preview.innerHTML = '';

        if (!attachment) {
            preview.style.display = 'none';
            return;
        }

        const item = document.createElement('div');
        item.className = 'attachment-preview-item';

        if (attachment.type === 'image') {
            const img = document.createElement('img');
            img.src = attachment.data;
            img.alt = attachment.name || 'Image';
            item.appendChild(img);
        } else if (attachment.type === 'audio') {
            item.innerHTML = `<i class="fas fa-microphone"></i> Audio (${Math.floor(attachment.duration || 0)}s)`;
        } else {
            item.innerHTML = `<i class="fas fa-file"></i> ${attachment.name || 'File'}`;
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-attachment';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = removeAttachment;
        item.appendChild(removeBtn);

        preview.appendChild(item);
        preview.style.display = 'block';
    }

    function removeAttachment() {
        currentAttachment = null;
        const preview = document.getElementById('attachmentPreview');
        if (preview) {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
    }

    function openThread(messageId) {
        currentThread = messageId;
        window.dispatchEvent(new CustomEvent('openThread', {
            detail: { messageId }
        }));
    }

    function showChatInfo(chat) {
        if (!chat) return { title: 'Chat Info', sections: [] };

        return {
            title: chat.type === 'note' ? 'Notes' : chat.friendName || 'Chat',
            sections: [
                {
                    title: 'Chat Information',
                    items: [
                        { label: 'Name', value: chat.type === 'note' ? 'Notes' : chat.friendName || 'Unknown' },
                        { label: 'Status', value: chat.blocked ? 'Blocked' : chat.archived ? 'Archived' : 'Active' },
                        { label: 'Last Message', value: formatTime(chat.lastMessageAt) },
                        { label: 'Unread', value: chat.unreadCount || 0 },
                        { label: 'Type', value: chat.type === 'group' ? 'Group' : chat.type === 'note' ? 'Notes' : 'Direct' }
                    ]
                }
            ]
        };
    }

    function loadChatThemes() {
        const themes = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHAT_THEMES);
        if (themes) {
            chatThemes = themes;
        }
    }

    function applyChatTheme(friendId) {
        const theme = chatThemes[friendId];
        if (theme) {
            document.documentElement.style.setProperty('--chat-bubble-sent', theme.sentColor || 'var(--primary-color)');
            document.documentElement.style.setProperty('--chat-bubble-received', theme.receivedColor || 'var(--secondary-color)');
            document.documentElement.style.setProperty('--chat-background', theme.background || '');
        } else {
            document.documentElement.style.setProperty('--chat-bubble-sent', 'var(--primary-color)');
            document.documentElement.style.setProperty('--chat-bubble-received', 'var(--secondary-color)');
            document.documentElement.style.setProperty('--chat-background', '');
        }
    }

    function loadUserSettings() {
        const settings = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS);
        if (!settings) {
            const defaultSettings = {
                autoDownload: false,
                notificationSound: true,
                messagePreview: true,
                onlineStatus: true,
                readReceipts: true,
                typingIndicators: true,
                theme: 'light',
                fontSize: 'medium',
                silentReactions: true,
                readOnlyMode: false,
                autoSaveDrafts: true,
                offlineMode: true,
                viewOnceEnabled: true
            };
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, defaultSettings);
        } else {
            silentReactionsEnabled = settings.silentReactions !== false;
            readOnlyMode = settings.readOnlyMode === true;
        }
    }

    function loadMessageDrafts() {
        const drafts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
        if (drafts) {
            messageDrafts = drafts;
        }
    }

    function saveMessageDraft() {
        if (!currentChat) return;

        const input = document.getElementById('messageInput');
        const draft = input?.value?.trim() || '';
        const attachment = currentAttachment ? {
            type: currentAttachment.type,
            data: currentAttachment.data,
            name: currentAttachment.name,
            size: currentAttachment.size,
            duration: currentAttachment.duration
        } : null;

        if (draft || attachment) {
            messageDrafts[currentChat.id] = {
                text: draft,
                attachment,
                timestamp: Date.now()
            };
        } else if (messageDrafts[currentChat.id]) {
            delete messageDrafts[currentChat.id];
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.DRAFTS, messageDrafts);
    }

    function loadMessageDraft() {
        if (!currentChat) return;

        const draft = messageDrafts[currentChat.id];
        if (draft) {
            const input = document.getElementById('messageInput');
            if (input && draft.text) {
                input.value = draft.text;
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
            }

            if (draft.attachment) {
                currentAttachment = draft.attachment;
                showAttachmentPreview(draft.attachment);
            }
        }
    }

    function updateDraftBadge(hasDraft) {
        const badge = document.getElementById('draftBadge');
        if (badge) {
            badge.style.display = hasDraft ? 'inline-block' : 'none';
        }
    }

    function loadScheduledMessages() {
        const scheduled = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES);
        if (scheduled) {
            scheduledMessages = scheduled;
        }
    }

    function loadOfflineQueue() {
        const queue = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
        if (queue) {
            offlineQueue = queue;
        }
    }

    function updateScheduleBadge() {
        const badge = document.getElementById('scheduleBadge');
        if (badge) {
            const hasScheduled = scheduledMessages.some(msg => msg.chatId === currentChat?.id);
            badge.style.display = hasScheduled ? 'flex' : 'none';
        }
    }

    function setupScrollDetection() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.addEventListener('scroll', updateJumpButtonVisibility);
        }
    }

    function updateJumpButtonVisibility() {
        const container = document.getElementById('messagesContainer');
        const button = document.getElementById('jumpToLatest');

        if (container && button) {
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            button.style.display = isNearBottom ? 'none' : 'block';
        }
    }

    function jumpToLatest() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function searchInChat(query) {
        if (!query?.trim()) {
            searchResults = [];
            currentSearchIndex = -1;
            return [];
        }

        searchResults = messages.filter(msg => 
            !msg.deleted && 
            msg.content && 
            msg.content.toLowerCase().includes(query.toLowerCase())
        );

        return searchResults;
    }

    function highlightText(text, query) {
        if (!text || !query) return escapeHtml(text || '');

        const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
        return escapeHtml(text).replace(regex, '<span class="search-highlight">$1</span>');
    }

    function highlightSearchResults(query) {
        if (!query) return;

        const elements = document.querySelectorAll('.message-content');
        elements.forEach(el => {
            const original = el.getAttribute('data-original') || el.textContent;
            el.setAttribute('data-original', original);
            el.innerHTML = highlightText(original, query);
        });
    }

    function removeSearchHighlights() {
        const elements = document.querySelectorAll('.message-content');
        elements.forEach(el => {
            const original = el.getAttribute('data-original');
            if (original) {
                el.innerHTML = escapeHtml(original);
                el.removeAttribute('data-original');
            }
        });
    }

    function navigateToSearchResult(index) {
        if (index >= 0 && index < searchResults.length) {
            scrollToMessage(searchResults[index].id);
        }
    }

    function scrollToMessage(messageId) {
        const element = document.querySelector(`[data-message-id="${messageId}"]`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            if (typeof MediaRecorder === 'undefined') {
                return false;
            }

            mediaRecorder = new MediaRecorder(stream);
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    currentAttachment = {
                        type: 'audio',
                        data: reader.result,
                        name: `recording_${Date.now()}.webm`,
                        size: blob.size,
                        duration: Math.floor((Date.now() - recordingStartTime) / 1000)
                    };
                    showAttachmentPreview(currentAttachment);
                };
                reader.readAsDataURL(blob);
            };

            mediaRecorder.start();
            isRecording = true;
            recordingStartTime = Date.now();

            recordingTimer = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                const timerEl = document.getElementById('recordingTimer');
                if (timerEl) {
                    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
            }, 1000);

            return true;
        } catch (error) {
            return false;
        }
    }

    async function stopRecording() {
        if (!mediaRecorder || !isRecording) return null;

        clearInterval(recordingTimer);

        return new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                isRecording = false;
                mediaRecorder = null;
                resolve(currentAttachment);
            };

            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        });
    }

    function cancelRecording() {
        if (!mediaRecorder || !isRecording) return false;

        clearInterval(recordingTimer);
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        isRecording = false;
        mediaRecorder = null;
        currentAttachment = null;

        return true;
    }

    function startBackgroundSync() {
        let syncInterval = setInterval(async () => {
            if (!SessionMirror.isAuthenticated() || isSyncing) return;

            isSyncing = true;
            try {
                await loadChats();
                await loadContacts();
                await messagingClient.processQueue();
            } catch (error) {
            } finally {
                isSyncing = false;
            }
        }, 30000);

        let saveInterval = setInterval(() => {
            if (currentChat) {
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
            }
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        }, 60000);

        return { syncInterval, saveInterval };
    }

    function playNotificationSound() {
        const settings = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
        if (settings.notificationSound !== false) {
            const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        }
    }

    function checkScheduledMessages() {
        const now = Date.now();
        const toSend = [];

        scheduledMessages = scheduledMessages.filter(msg => {
            if (msg && msg.scheduleTime <= now && msg.status === 'scheduled') {
                toSend.push(msg);
                return false;
            }
            return true;
        });

        toSend.forEach(async (msg) => {
            if (msg.chatId === currentChat?.id) {
                await sendMessageWithOptions(msg.content || '', msg.options || {});
            }
        });

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES, scheduledMessages);
        setTimeout(checkScheduledMessages, 60000);
    }

    async function checkOfflineQueue() {
        if (!navigator.onLine || offlineQueue.length === 0 || !SessionMirror.isAuthenticated()) return;

        const failedMessages = [];

        for (const message of offlineQueue) {
            const result = await APIClient.request('/api/messages/send', {
                method: 'POST',
                body: JSON.stringify(message)
            });

            if (!result || result.error) {
                failedMessages.push(message);
            }
        }

        offlineQueue = failedMessages;
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
    }

    function loadMultiSendChats() {
        return chats.filter(chat => 
            !chat.archived && 
            !chat.blocked && 
            chat.type !== 'note'
        );
    }

    function updateMultiSendSelection(chatId, selected) {
        if (selected) {
            multiSendSelectedChats.add(chatId);
        } else {
            multiSendSelectedChats.delete(chatId);
        }
    }

    function saveUIState() {
        const state = {
            lastChatId: currentChat?.id,
            lastCategory: currentCategory,
            timestamp: Date.now()
        };
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.UI_STATE, state);
    }

    function getUserFromURL() {
        try {
            const params = new URLSearchParams(window.location.search);
            const userId = params.get('userId') || params.get('friendId') || params.get('user');
            const username = params.get('username') || params.get('name') || 'User';
            const userAvatar = params.get('avatar') || params.get('photoURL') || '';

            return userId ? { userId, username: decodeURIComponent(username), userAvatar } : null;
        } catch (error) {
            return null;
        }
    }

    async function openChatPanel(userId, username, userAvatar = '') {
        currentFriend = { uid: userId, displayName: username, photoURL: userAvatar };
        return loadChatByFriendId(userId);
    }

    function showReconnectState(message) {
        const overlay = document.getElementById('reconnectOverlay');
        const messageEl = document.getElementById('reconnectMessage');

        if (overlay) overlay.style.display = 'flex';
        if (messageEl) messageEl.textContent = message || 'Connection lost';
    }

    function hideReconnectState() {
        const overlay = document.getElementById('reconnectOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function retryConnection() {
        // Trigger state machine recovery
        if (StateMachine.canTransitionTo(StateMachine.REGISTERING)) {
            StateMachine.transition(StateMachine.REGISTERING, 'manual-retry');
            initialize().catch(() => {});
        }
    }

    function renderMessages() {
        window.dispatchEvent(new CustomEvent('renderMessages', {
            detail: { messages, currentChat, currentUser }
        }));
    }

    function renderChatsList() {
        window.dispatchEvent(new CustomEvent('renderChatsList', {
            detail: { chats, currentChat, currentCategory, messageDrafts }
        }));
    }

    function renderContactsList() {
        window.dispatchEvent(new CustomEvent('renderContactsList', {
            detail: { contacts }
        }));
    }

    function markMessageAsViewed(messageId) {}

    function initializeAudioWaveforms() {}

    function viewMedia(url, fileName) {
        return { url, fileName };
    }

    function playVideo(url) {
        return url;
    }

    function playAudio(messageId, url, duration) {
        try {
            const audio = new Audio(url);
            audio.play();
            return 'playing';
        } catch (error) {
            return 'error';
        }
    }

    function downloadFile(url, fileName) {
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return true;
        } catch (error) {
            return false;
        }
    }

    function openLocation(latitude, longitude) {
        try {
            const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
            window.open(url, '_blank');
            return url;
        } catch (error) {
            return null;
        }
    }

    function cleanupAudioPlayers() {
        audioPlayers.clear();
    }

    function syncChatList() {
        return Promise.resolve([]);
    }

    function updateUnreadCounts() {
        return 0;
    }

    function updateTypingIndicator(isTyping) {
        return false;
    }

    // =============================================
    // START INITIALIZATION
    // =============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initialize, 100);
        });
    } else {
        setTimeout(initialize, 100);
    }

    window.addEventListener('beforeunload', () => {
        if (recordingTimer) clearInterval(recordingTimer);
        if (typingTimeout) clearTimeout(typingTimeout);
        cleanupAudioPlayers();
        saveMessageDraft();
        saveUIState();

        if (currentChat) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${currentChat.id}`, messages);
        }
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, chats);
        
        // Clean up WebSocket
        WSController.disconnect();
    });

    // =============================================
    // EXPORT
    // =============================================
    const messagesCore = {
        // Core exports
        VERSION,
        MESSAGE_TYPES,
        LOCAL_STORAGE_KEYS,
        SOURCE_IFRAME,
        FRAME_ID,
        
        // Status
        StatusIndicator,
        
        // State Machine
        StateMachine,
        
        // Lifecycle
        MessageLifecycle,
        
        getConnectionHealth: () => {
        return {
            parentReady: ParentDetector?.isReady || false,
            connectionQuality: 'unknown', // This will be replaced by the method above
            handshake: { state: StateMachine.getState() },
            sessionValid: SessionMirror?.isAuthenticated?.() || false,
            timestamp: Date.now()
        };
    },
        // State
        currentUser, currentChat, currentFriend, messages, chats, contacts,
        isRecording, mediaRecorder, recordingTimer, recordingStartTime,
        typingTimeout, isTyping, selectedMessage, currentThread, chatThemes,
        emojiPicker, isSyncing, audioPlayers, editingMessageId, replyToMessage,
        currentCategory, activeFormattingTags, activeAudioElement, scheduledMessages,
        offlineQueue, messageDrafts, silentReactionsEnabled, readOnlyMode,
        currentAttachment, searchResults, currentSearchIndex, multiSendSelectedChats,
        recordingCancelTimeout, dragStartY, isDraggingToCancel,

        // Setters
        setCurrentUser, setCurrentChat, setCurrentFriend, setMessages, setChats, setContacts,
        setIsRecording, setMediaRecorder, setRecordingTimer, setRecordingStartTime,
        setTypingTimeout, setIsTyping, setSelectedMessage, setCurrentThread,
        setChatThemes, setEmojiPicker, setIsSyncing, setAudioPlayers,
        setEditingMessageId, setReplyToMessage, setCurrentCategory,
        setActiveFormattingTags, setActiveAudioElement, setScheduledMessages,
        setOfflineQueue, setMessageDrafts, setSilentReactionsEnabled, setReadOnlyMode,
        setCurrentAttachment, setSearchResults, setCurrentSearchIndex,
        setMultiSendSelectedChats, setRecordingCancelTimeout, setDragStartY,
        setIsDraggingToCancel,

        // Session & Communication
        SessionMirror,
        ParentDetector,
        SessionClient,
        messagingClient,
        MessageTransport,
        TokenAuthority,
        WSController,
        
        getCurrentSession,
        requestSessionUpdate,
        initChildSession,
        isCoreReady,
        getConnectionHealth,
        sendToParent,
        
        // API
        apiRequest,
        fetchData,
        APIClient,
        
        // Data management
        getData,
        updateData,
        loadCoreData,
        loadContacts,
        loadChats,
        loadMessages,
        openChat,
        loadChatByFriendId,
        createLocalChat,
        sendMessage,
        sendMessageWithOptions,
        sendToMultipleChats,
        editMessage,
        saveEditedMessage,
        cancelEditMessage,
        deleteMessage,
        markChatAsRead,
        addReaction,
        toggleBlockUser,
        toggleArchiveChat,
        toggleReadOnly,
        clearChatHistory,
        voteInPoll,

        // Validation
        validateMessageStructure,
        validateMessagePayload,
        validateMessageBeforeSend,
        validateData,
        validateSessionData,

        // Utilities
        showStatusMessage,
        hideStatusMessage,
        formatMessageText,
        formatTime,
        formatDate,
        formatDateTime,
        formatFileSize,
        escapeHtml,
        escapeRegex,
        preserveFormatting,
        sanitizePayload,
        SecurityUtils,
        SafeStorage,

        // Message actions
        showMessageActions,
        closeMessageActions,
        handleMessageAction,
        showForwardMessage,
        toggleStarMessage,
        showMessageInfo,
        showReportModal,
        submitReport,

        // Emoji picker
        initEmojiPicker,
        toggleEmojiPicker,
        closeEmojiPickerOnClickOutside,

        // Formatting
        toggleFormattingToolbar,
        closeFormattingToolbarOnClickOutside,
        applyFormatting,

        // Attachments
        toggleAttachmentOptions,
        closeAttachmentOptionsOnClickOutside,
        handleAttachment,
        createNote,
        selectImage,
        selectVideo,
        selectFile,
        shareLocation,
        createPoll,
        showAttachmentPreview,
        removeAttachment,

        // Threads
        openThread,
        showChatInfo,

        // Themes & Settings
        loadChatThemes,
        applyChatTheme,
        loadUserSettings,
        loadMessageDrafts,
        saveMessageDraft,
        loadMessageDraft,
        updateDraftBadge,
        loadScheduledMessages,
        loadOfflineQueue,
        updateScheduleBadge,

        // Scrolling & Search
        setupScrollDetection,
        updateJumpButtonVisibility,
        jumpToLatest,
        searchInChat,
        highlightText,
        highlightSearchResults,
        removeSearchHighlights,
        navigateToSearchResult,
        scrollToMessage,

        // Recording
        startRecording,
        stopRecording,
        cancelRecording,

        // Background
        startBackgroundSync,
        playNotificationSound,
        checkScheduledMessages,
        checkOfflineQueue,
        loadMultiSendChats,
        updateMultiSendSelection,
        saveUIState,
        getUserFromURL,
        openChatPanel,

        // Recovery
        showReconnectState,
        hideReconnectState,
        retryConnection,

        // Rendering triggers
        renderMessages,
        renderChatsList,
        renderContactsList,
        markMessageAsViewed,

        // Media
        initializeAudioWaveforms,
        viewMedia,
        playVideo,
        playAudio,
        downloadFile,
        openLocation,
        cleanupAudioPlayers,

        // Sync
        syncChatList,
        updateUnreadCounts,
        updateTypingIndicator,

        // Diagnostics
        DiagnosticsAgent,
        getHealthStatus: getConnectionHealth,
        
        // Registration
        registerWithParent,
        registrationSent: () => registrationSent
    };

    window.messagesCore = messagesCore;

    if (window.location.hash === '#debug' || localStorage.getItem('kynecta_debug') === 'true') {
        window.__IFRAME_DEBUG__ = true;
        DiagnosticsAgent.enabled = true;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = messagesCore;
    }
})();