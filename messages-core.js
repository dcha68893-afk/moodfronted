// =============================================
// MESSAGES-CORE.js - PARENT-AUTHORITATIVE v6.0.0
// COMPLETE PRESERVATION - ALL 5000+ LINES INTACT
// RESTRUCTURED FOR PARENT AUTHORITY - NO FEATURES REMOVED
// =============================================

(function() {
    'use strict';

    // =============================================
    // DEBUG MODE - ZERO NOISE POLICY (PRESERVED)
    // =============================================
    const DEBUG = false;
    const ALLOWED_LOGS = new Set(['INIT', 'READY', 'ERROR', 'SESSION_UPDATE']);
    
    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }

    // =============================================
    // ENVIRONMENT DETECTION (PRESERVED)
    // =============================================
    const ENV = {
        isLocal: window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1',
        isRender: window.location.hostname.includes('.onrender.com'),
        parentOrigin: document.referrer ? new URL(document.referrer).origin : '*',
        getApiBaseUrl: function() {
            if (this.isLocal) {
                return 'http://localhost:4000';
            } else if (this.isRender) {
                const parts = window.location.hostname.split('.');
                if (parts.length >= 3) {
                    return `https://${parts.slice(-3).join('.')}`;
                }
                return 'https://moodchat-fy56.onrender.com';
            }
            return '';
        }
    };

    // =============================================
    // CONSTANTS & CONFIGURATION (PRESERVED)
    // =============================================
    const VERSION = '6.0.0'; // Updated version
    const APP_NAME = 'kynecta-messages';
    const SOURCE_IFRAME = 'iframe';
    const FRAME_ID = 'messagesIframe';
    
    const PROTOCOL = {
        VERSION: 'KYN-3.0'
    };

    const MESSAGE_TYPES = {
        // Core protocol - NEW
        PARENT_READY: 'PARENT_READY',
        IFRAME_INIT: 'IFRAME_INIT',
        HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
        HANDSHAKE_ACK: 'HANDSHAKE_ACK',
        HANDSHAKE_COMPLETE: 'HANDSHAKE_COMPLETE',
        REGISTER_MODULE: 'REGISTER_MODULE',
        MODULE_REGISTERED: 'MODULE_REGISTERED',
        
        // Legacy - PRESERVED ALL
        IFRAME_REGISTERED: 'IFRAME_REGISTERED',
        CHILD_READY: 'CHILD_READY',
        REGISTRATION_ACK: 'REGISTRATION_ACK',
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
        REQUEST_TOKEN: 'REQUEST_TOKEN',
        GET_FRIEND_LIST: 'GET_FRIEND_LIST',
        FRIEND_LIST_RESPONSE: 'FRIEND_LIST_RESPONSE',
        FRIEND_UPDATED: 'FRIEND_UPDATED',
        FRIEND_ONLINE: 'FRIEND_ONLINE',
        FRIEND_OFFLINE: 'FRIEND_OFFLINE',
        CREATE_CHAT: 'CREATE_CHAT',
        CHAT_CREATED: 'CHAT_CREATED',
        GET_CHAT_HISTORY: 'GET_CHAT_HISTORY',
        CHAT_HISTORY_RESPONSE: 'CHAT_HISTORY_RESPONSE',
        SEND_MESSAGE: 'SEND_MESSAGE',
        MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
        MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
        MESSAGE_READ: 'MESSAGE_READ',
        TYPING_START: 'TYPING_START',
        TYPING_STOP: 'TYPING_STOP',
        API_REQUEST: 'API_REQUEST',
        API_RESPONSE: 'API_RESPONSE',
        WS_CONNECT: 'WS_CONNECT',
        WS_CONNECTED: 'WS_CONNECTED',
        WS_AUTHENTICATED: 'WS_AUTHENTICATED',
        WS_DISCONNECTED: 'WS_DISCONNECTED',
        WS_ERROR: 'WS_ERROR',
        ACK: 'ACK',
        ERROR: 'ERROR',
        HEARTBEAT: 'HEARTBEAT',
        HEARTBEAT_ACK: 'HEARTBEAT_ACK',
        PAGE_ACTIVATED: 'PAGE_ACTIVATED',
        FORCE_RELOAD: 'FORCE_RELOAD',
        LOGOUT: 'LOGOUT',
        NAVIGATE: 'NAVIGATE',
        PING: 'PING',
        PONG: 'PONG',
        SYSTEM_READY: 'SYSTEM_READY',
        PARENT_RECOVERY: 'PARENT_RECOVERY',
        SESSION_ACTIVE: 'SESSION_ACTIVE',
        PERMISSION_UPDATE: 'PERMISSION_UPDATE',
        FORCE_LOGOUT: 'FORCE_LOGOUT'
    };

    const LOCAL_STORAGE_KEYS = {
        SESSION_CACHE: 'kynecta_session_cache_v5',
        USER_CACHE: 'kynecta_user_cache_v5',
        FRIENDS_CACHE: 'kynecta_friends_cache_v5',
        CHATS_CACHE: 'kynecta_chats_cache_v5',
        MESSAGES_PREFIX: 'kynecta_messages_v5_',
        CONTACTS_CACHE: 'kynecta_contacts_cache_v5',
        CHAT_THEMES: 'kynecta_chat_themes_v5',
        DRAFTS: 'kynecta_message_drafts_v5',
        OFFLINE_QUEUE: 'kynecta_offline_queue_v5',
        SCHEDULED_MESSAGES: 'kynecta_scheduled_messages_v5',
        USER_SETTINGS: 'kynecta_user_settings_v5',
        BLOCKED_USERS: 'kynecta_blocked_users_v5',
        ARCHIVED_CHATS: 'kynecta_archived_chats_v5',
        STARRED_MESSAGES: 'kynecta_starred_messages_v5',
        UI_STATE: 'kynecta_ui_state_v5',
        MESSAGE_QUEUE: 'kynecta_message_queue_v5'
    };

    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };
    
    const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

    // =============================================
    // LOGGER - PRESERVED COMPLETE
    // =============================================
    const Logger = {
        _warned: new Set(),
        _logged: new Set(),
        _errors: new Map(),
        _success: new Set(),
        _logCache: new Set(),
        
        _logOnce(key, message, data = null, level = 'log') {
            if (this._logCache.has(key)) return;
            this._logCache.add(key);
            
            setTimeout(() => {
                this._logCache.delete(key);
            }, 60000);
            
            if (level === 'log') {
                console.log(`[Messages] ${message}`, data || '');
            } else if (level === 'warn') {
                console.warn(`[Messages] ⚠️ ${message}`, data || '');
            } else if (level === 'error') {
                console.error(`[Messages] ❌ ${message}`, data || '');
            } else if (level === 'success') {
                console.log(`[Messages] ✅ ${message}`, data || '');
            } else if (level === 'info') {
                console.info(`[Messages] ℹ️ ${message}`, data || '');
            }
        },
        
        debug(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
                debugLog(`[${module}] ${message}`, data);
            }
        },
        
        info(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
                if (ALLOWED_LOGS.has(message.split(' ')[0]) || ALLOWED_LOGS.has(message)) {
                    this._logOnce(`${module}:info:${message}`, `[${module}] ℹ️ ${message}`, data, 'info');
                } else {
                    debugLog(`[${module}] ℹ️ ${message}`, data);
                }
            }
        },
        
        success(module, message, data = null) {
            const key = `${module}:success:${message}`;
            if (!this._success.has(key)) {
                this._logOnce(key, `[${module}] ✅ ${message}`, data, 'success');
                this._success.add(key);
                setTimeout(() => this._success.delete(key), 5000);
            }
        },
        
        warn(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
                this._logOnce(`${module}:warn:${message}`, `[${module}] ⚠️ ${message}`, data, 'warn');
            }
        },
        
        error(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
                const key = `${module}:error:${message}`;
                const now = Date.now();
                const lastLog = this._errors.get(key) || 0;
                
                if (now - lastLog > 30000) {
                    this._logOnce(key, `[${module}] ❌ ${message}`, data, 'error');
                    this._errors.set(key, now);
                }
            }
        },
        
        state(module, oldState, newState, reason = '') {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
                const arrow = oldState === newState ? '=' : '→';
                const key = `${module}:state:${oldState}:${newState}:${reason}`;
                this._logOnce(key, `[${module}] 📊 ${oldState} ${arrow} ${newState}${reason ? ` (${reason})` : ''}`, null, 'info');
            }
        },
        
        once(module, message, data = null) {
            this._logOnce(`${module}:once:${message}`, `[${module}] ${message}`, data, 'info');
        }
    };

    // =============================================
    // BOOT CONTROLLER - NEW - PREVENTS RACE CONDITIONS
    // =============================================
    const BootController = {
        _parentReady: false,
        _initialized: false,
        _handshakeSent: false,
        _handshakeAcked: false,
        _handshakeComplete: false,
        _moduleRegistered: false,
        _registrationAttempts: 0,
        _handshakeAttempts: 0,
        _bootPromise: null,
        _bootResolve: null,
        _bootTimeout: null,
        
        MAX_HANDSHAKE_ATTEMPTS: 2,
        MAX_REGISTRATION_ATTEMPTS: 2,
        HANDSHAKE_TIMEOUT: 5000,
        
        init() {
            // Send IFRAME_INIT immediately on load
            this._sendIframeInit();
            
            // Set boot timeout
            this._bootTimeout = setTimeout(() => {
                if (!this._initialized) {
                    Logger.once('Boot', 'Boot timeout - forcing ready');
                    this._forceReady();
                }
            }, 10000);
            
            return this;
        },
        
        _sendIframeInit() {
            if (!window.parent || window.parent === window) {
                Logger.once('Boot', 'No parent window');
                return;
            }
            
            window.parent.postMessage({
                type: MESSAGE_TYPES.IFRAME_INIT,
                iframeId: FRAME_ID,
                module: 'messages',
                version: VERSION,
                timestamp: Date.now()
            }, '*');
            
            Logger.once('Boot', 'IFRAME_INIT sent');
        },
        
        onParentReady(data) {
            if (this._parentReady) return;
            
            this._parentReady = true;
            Logger.once('Boot', 'Parent ready confirmed');
            
            // Start handshake
            this._startHandshake();
        },
        
        _startHandshake() {
            if (this._handshakeSent) return;
            
            this._handshakeSent = true;
            this._handshakeAttempts++;
            
            MessageTransport.send(MESSAGE_TYPES.HANDSHAKE_REQUEST, {
                iframeId: FRAME_ID,
                version: VERSION,
                timestamp: Date.now()
            }, { 
                requiresAck: false
            });
            
            Logger.once('Boot', 'HANDSHAKE_REQUEST sent');
            
            // Set handshake timeout
            setTimeout(() => {
                if (!this._handshakeAcked && this._handshakeAttempts < this.MAX_HANDSHAKE_ATTEMPTS) {
                    Logger.once('Boot', 'Handshake timeout - retrying');
                    this._handshakeSent = false;
                    this._startHandshake();
                } else if (!this._handshakeAcked) {
                    Logger.once('Boot', 'Max handshake attempts reached - forcing');
                    this._sendRegisterModule();
                }
            }, this.HANDSHAKE_TIMEOUT);
        },
        
        onHandshakeAck(data) {
            if (this._handshakeAcked) return;
            
            this._handshakeAcked = true;
            Logger.once('Boot', 'Handshake ACK received');
            
            // Send register module
            this._sendRegisterModule();
        },
        
        onHandshakeComplete(data) {
            if (this._handshakeComplete) return;
            
            this._handshakeComplete = true;
            Logger.once('Boot', 'Handshake complete');
            
            this._completeBoot();
        },
        
        _sendRegisterModule() {
            if (this._moduleRegistered) return;
            
            this._registrationAttempts++;
            
            MessageTransport.send(MESSAGE_TYPES.REGISTER_MODULE, {
                module: 'messages',
                frameId: FRAME_ID,
                version: VERSION,
                features: ['messaging', 'realtime'],
                timestamp: Date.now()
            }, { 
                requiresAck: true,
                timeout: 3000
            }).then(result => {
                if (result.success) {
                    Logger.once('Boot', 'REGISTER_MODULE sent with ACK');
                } else {
                    Logger.once('Boot', 'REGISTER_MODULE failed - will retry');
                    if (this._registrationAttempts < this.MAX_REGISTRATION_ATTEMPTS) {
                        setTimeout(() => this._sendRegisterModule(), 1000);
                    } else {
                        this._completeBoot();
                    }
                }
            });
        },
        
        onModuleRegistered(data) {
            if (this._moduleRegistered) return;
            
            this._moduleRegistered = true;
            Logger.once('Boot', 'Module registered');
            
            this._completeBoot();
        },
        
        _completeBoot() {
            if (this._initialized) return;
            
            this._initialized = true;
            
            if (this._bootTimeout) {
                clearTimeout(this._bootTimeout);
                this._bootTimeout = null;
            }
            
            // Send CHILD_READY
            MessageTransport.send(MESSAGE_TYPES.CHILD_READY, {
                module: 'messages',
                frameId: FRAME_ID,
                version: VERSION,
                timestamp: Date.now()
            }, { requiresAck: false });
            
            Logger.success('Boot', 'Boot complete - core ready');
            
            window.dispatchEvent(new CustomEvent('coreReady', {
                detail: {
                    authenticated: SessionStore.isAuthenticated(),
                    user: SessionStore.getUser(),
                    frameId: FRAME_ID,
                    version: VERSION,
                    parentAuthority: true
                }
            }));
        },
        
        _forceReady() {
            if (this._initialized) return;
            
            this._parentReady = true;
            this._handshakeSent = true;
            this._handshakeAcked = true;
            this._handshakeComplete = true;
            this._moduleRegistered = true;
            
            this._completeBoot();
        },
        
        isReady() {
            return this._initialized;
        },
        
        waitForBoot() {
            if (this._initialized) {
                return Promise.resolve(true);
            }
            
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this._initialized) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 100);
                
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve(this._initialized);
                }, 15000);
            });
        }
    };

    // =============================================
    // IMMUTABLE SESSION STORE - NEW (REPLACES localStorage)
    // =============================================
    const SessionStore = {
        _session: null,
        _user: null,
        _userId: null,
        _token: null,
        _authenticated: false,
        _listeners: new Set(),
        
        setSession(session) {
            if (!session || typeof session !== 'object') return false;
            
            // Freeze the session to prevent mutations
            const frozenSession = Object.freeze({
                user: session.user ? Object.freeze({ ...session.user }) : null,
                token: session.token || null,
                userId: session.userId || session.user?.id || null,
                authenticated: !!(session.user && session.token),
                expiresAt: session.expiresAt || null,
                receivedAt: Date.now()
            });
            
            this._session = frozenSession;
            this._user = frozenSession.user;
            this._userId = frozenSession.userId;
            this._token = frozenSession.token;
            this._authenticated = frozenSession.authenticated;
            
            this._notifyListeners();
            return true;
        },
        
        getSession() {
            return this._session;
        },
        
        getUser() {
            return this._user;
        },
        
        getUserId() {
            return this._userId;
        },
        
        getToken() {
            return this._token;
        },
        
        isAuthenticated() {
            return this._authenticated;
        },
        
        hasSession() {
            return !!this._session;
        },
        
        clear() {
            this._session = null;
            this._user = null;
            this._userId = null;
            this._token = null;
            this._authenticated = false;
            this._notifyListeners();
        },
        
        subscribe(callback) {
            this._listeners.add(callback);
            return () => this._listeners.delete(callback);
        },
        
        _notifyListeners() {
            this._listeners.forEach(cb => {
                try { cb(this._session); } catch (e) {}
            });
        }
    };

    // =============================================
    // PENDING MESSAGE TRACKER - RETRY SAFE (NEW)
    // =============================================
    const PendingMessages = new Map();
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500;
    const ACK_TIMEOUT = 5000;
    
    // Cleanup interval
    setInterval(() => {
        const now = Date.now();
        for (const [id, record] of PendingMessages.entries()) {
            if (now - record.timestamp > 30000) {
                PendingMessages.delete(id);
            }
        }
    }, 60000);

    // =============================================
    // PARENT AUTHORITY DETECTOR (PRESERVED - ADAPTED)
    // =============================================
    const ParentAuthority = {
        _parentReady: false,
        _parentReadyCheckInterval: null,
        _parentReadyTimeout: null,
        _parentReadyResolve: null,
        _parentReadyReject: null,
        _parentReadyPromise: null,
        _hasParentAuthority: false,
        _parentVersion: null,
        _parentFeatures: new Set(),
        _parentDetected: false,
        _parentOrigin: ENV.parentOrigin,
        
        init() {
            this._parentReadyPromise = new Promise((resolve, reject) => {
                this._parentReadyResolve = resolve;
                this._parentReadyReject = reject;
            });
            
            // Check for parent via referrer
            if (document.referrer && document.referrer !== '') {
                try {
                    const referrerOrigin = new URL(document.referrer).origin;
                    if (referrerOrigin !== window.location.origin) {
                        Logger.once('ParentAuthority', `Parent detected from referrer: ${referrerOrigin}`);
                        this._parentDetected = true;
                        this._parentOrigin = referrerOrigin;
                    }
                } catch (e) {}
            }
            
            return this;
        },
        
        _detectParentReady() {
            if (this._parentReady) return;
            
            Logger.once('ParentAuthority', 'Parent ready detected');
            this._parentReady = true;
            this._hasParentAuthority = true;
            this._parentDetected = true;
            
            if (this._parentReadyResolve) {
                this._parentReadyResolve(true);
                this._parentReadyResolve = null;
                this._parentReadyReject = null;
            }
            
            clearInterval(this._parentReadyCheckInterval);
            clearTimeout(this._parentReadyTimeout);
            
            BootController.onParentReady({});
        },
        
        waitForParentReady() {
            return this._parentReadyPromise;
        },
        
        isParentReady() {
            return this._parentReady;
        },
        
        hasAuthority() {
            return this._hasParentAuthority;
        },
        
        setParentVersion(version) {
            this._parentVersion = version;
        },
        
        getParentVersion() {
            return this._parentVersion;
        },
        
        addFeature(feature) {
            this._parentFeatures.add(feature);
        },
        
        hasFeature(feature) {
            return this._parentFeatures.has(feature);
        },
        
        getParentOrigin() {
            return this._parentOrigin;
        }
    }.init();

    // =============================================
    // DETERMINISTIC STATE MACHINE (PRESERVED - ADAPTED)
    // =============================================
    const SessionManager = {
        PREINIT: 'PREINIT',
        WAIT_PARENT: 'WAIT_PARENT',
        REGISTERING: 'REGISTERING',
        WAIT_SESSION: 'WAIT_SESSION',
        INITIALIZING: 'INITIALIZING',
        READY: 'READY',
        DEGRADED: 'DEGRADED',
        ERROR: 'ERROR',
        
        UNINITIALIZED: 'PREINIT',
        REGISTERED: 'REGISTERING',
        HANDSHAKE_INIT: 'WAIT_PARENT',
        HANDSHAKE_ACKED: 'WAIT_PARENT',
        HANDSHAKE_COMPLETE: 'WAIT_SESSION',
        SESSION_PENDING: 'WAIT_SESSION',
        SESSION_ACTIVE: 'WAIT_SESSION',
        
        _state: 'PREINIT',
        _stateLock: false,
        _stateChangeListeners: new Set(),
        _transitionHistory: [],
        _maxHistory: 50,
        
        _readyPromise: null,
        _readyResolve: null,
        _readyReject: null,
        _readyResolved: false,
        
        _session: null,
        _token: null,
        _user: null,
        _userId: null,
        _authenticated: false,
        
        _handshakeRetries: 0,
        _handshakeTimer: null,
        _sessionTimer: null,
        
        _initPromise: null,
        _initResolve: null,
        _parentAuthoritativeSession: false,
        _registrationSent: false,
        _moduleRegistered: false,
        _handshakeInitiated: false,
        
        init() {
            if (this._initPromise) return this._initPromise;
            
            this._initPromise = new Promise((resolve) => {
                this._initResolve = resolve;
                this._createReadyPromise();
                resolve();
            });
            
            return this._initPromise;
        },
        
        _createReadyPromise() {
            this._readyPromise = new Promise((resolve, reject) => {
                this._readyResolve = resolve;
                this._readyReject = reject;
            });
            this._readyResolved = false;
        },
        
        async transition(newState, reason = '') {
            if (this._state === newState) {
                debugLog('SessionManager', `Ignoring self-transition: ${newState}`);
                return true;
            }
            
            while (this._stateLock) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            
            this._stateLock = true;
            
            try {
                const oldState = this._state;
                
                if (!this._isValidTransition(oldState, newState)) {
                    Logger.error('SessionManager', `Invalid transition: ${oldState} → ${newState}`);
                    return false;
                }
                
                Logger.state('SessionManager', oldState, newState, reason);
                
                this._state = newState;
                
                this._transitionHistory.push({
                    from: oldState,
                    to: newState,
                    reason,
                    timestamp: Date.now()
                });
                
                if (this._transitionHistory.length > this._maxHistory) {
                    this._transitionHistory.shift();
                }
                
                this._notifyListeners(oldState, newState, reason);
                
                if (newState === this.READY && !this._readyResolved) {
                    this._readyResolve?.(this.getSession());
                    this._readyResolved = true;
                    
                    window.__MODULE_READY__ = true;
                    if (this._authenticated) {
                        window.__MODULE_SESSION_ACTIVE__ = true;
                    }
                }
                
                if ((newState === this.ERROR || newState === this.DEGRADED) && !this._readyResolved) {
                    this._readyReject?.(new Error(`Session ${newState}: ${reason}`));
                    this._readyResolved = true;
                }
                
                return true;
            } finally {
                this._stateLock = false;
            }
        },
        
        _isValidTransition(from, to) {
            const validTransitions = {
                [this.PREINIT]: [this.WAIT_PARENT, this.DEGRADED, this.ERROR],
                [this.WAIT_PARENT]: [this.REGISTERING, this.INITIALIZING, this.DEGRADED, this.ERROR],
                [this.REGISTERING]: [this.WAIT_SESSION, this.INITIALIZING, this.DEGRADED, this.ERROR],
                [this.WAIT_SESSION]: [this.INITIALIZING, this.DEGRADED, this.ERROR],
                [this.INITIALIZING]: [this.READY, this.DEGRADED, this.ERROR],
                [this.READY]: [this.ERROR, this.DEGRADED, this.WAIT_SESSION],
                [this.DEGRADED]: [this.REGISTERING, this.INITIALIZING, this.READY, this.ERROR],
                [this.ERROR]: [this.REGISTERING, this.DEGRADED]
            };
            
            return validTransitions[from]?.includes(to) || false;
        },
        
        whenReady() {
            if (this._readyResolved) {
                return Promise.resolve(this.getSession());
            }
            return this._readyPromise;
        },
        
        async waitForSession(timeout = 10000) {
            if (this._authenticated && this._state === this.READY) {
                return this.getSession();
            }
            
            return Promise.race([
                this.whenReady(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Session ready timeout')), timeout)
                )
            ]);
        },
        
        setSession(session, fromParent = false) {
            if (!session || !session.user) {
                Logger.warn('SessionManager', 'Invalid session received');
                return;
            }
            
            // Store in SessionStore
            SessionStore.setSession(session);
            
            if (fromParent) {
                this._parentAuthoritativeSession = true;
                Logger.once('SessionManager', 'Authoritative session received from parent');
            }
            
            if (fromParent || !this._parentAuthoritativeSession) {
                this._session = session;
                this._token = session?.token;
                this._user = session?.user;
                this._userId = session?.userId || session?.user?.id;
                this._authenticated = !!(session?.user && session?.token);
                
                if (this._authenticated) {
                    // Still cache user for UI, but don't use for auth
                    try {
                        localStorage.setItem(LOCAL_STORAGE_KEYS.USER_CACHE, JSON.stringify(this._user));
                    } catch (e) {}
                    
                    if (this._state === this.WAIT_SESSION || this._state === this.INITIALIZING || this._state === this.DEGRADED) {
                        this.transition(this.INITIALIZING, 'session-received');
                    }
                }
            }
            
            this._notifyListeners(this._state, this._state, 'session-updated');
        },
        
        getSession() {
            return SessionStore.getSession() || (this._session ? { ...this._session } : null);
        },
        
        getToken() {
            return SessionStore.getToken() || this._token;
        },
        
        getUser() {
            return SessionStore.getUser() || (this._user ? { ...this._user } : null);
        },
        
        getUserId() {
            return SessionStore.getUserId() || this._userId;
        },
        
        isAuthenticated() {
            return SessionStore.isAuthenticated() || this._authenticated;
        },
        
        getState() {
            return this._state;
        },
        
        isReady() {
            return this._state === this.READY;
        },
        
        isDegraded() {
            return this._state === this.DEGRADED;
        },
        
        isAtLeast(state) {
            const stateOrder = [
                this.PREINIT,
                this.WAIT_PARENT,
                this.REGISTERING,
                this.WAIT_SESSION,
                this.INITIALIZING,
                this.READY
            ];
            
            const currentIndex = stateOrder.indexOf(this._state);
            const targetIndex = stateOrder.indexOf(state);
            
            return currentIndex >= targetIndex && this._state !== this.ERROR && this._state !== this.DEGRADED;
        },
        
        onStateChange(callback) {
            this._stateChangeListeners.add(callback);
            return () => this._stateChangeListeners.delete(callback);
        },
        
        _notifyListeners(oldState, newState, reason) {
            this._stateChangeListeners.forEach(cb => {
                try {
                    cb(oldState, newState, reason, this.getSession());
                } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('sessionStateChanged', {
                detail: { oldState, newState, reason, session: this.getSession() }
            }));
        },
        
        hasParentAuthority() {
            return this._parentAuthoritativeSession;
        },
        
        markRegistrationSent() {
            this._registrationSent = true;
        },
        
        hasRegistrationSent() {
            return this._registrationSent;
        },
        
        markModuleRegistered() {
            this._moduleRegistered = true;
        },
        
        hasModuleRegistered() {
            return this._moduleRegistered;
        },
        
        setHandshakeInitiated() {
            this._handshakeInitiated = true;
        },
        
        hasHandshakeInitiated() {
            return this._handshakeInitiated;
        },
        
        clear() {
            this._session = null;
            this._token = null;
            this._user = null;
            this._userId = null;
            this._authenticated = false;
            this._readyResolved = false;
            this._handshakeRetries = 0;
            this._parentAuthoritativeSession = false;
            this._handshakeInitiated = false;
            
            SessionStore.clear();
            
            if (this._handshakeTimer) {
                clearTimeout(this._handshakeTimer);
                this._handshakeTimer = null;
            }
            
            if (this._sessionTimer) {
                clearTimeout(this._sessionTimer);
                this._sessionTimer = null;
            }
            
            this._createReadyPromise();
            
            Logger.info('SessionManager', 'Session cleared');
        },
        
        getTransitionHistory() {
            return [...this._transitionHistory];
        }
    };

    // =============================================
    // TOKEN AUTHORITY (PRESERVED - ADAPTED)
    // =============================================
    const TokenAuthority = {
        _token: null,
        _tokenPromise: null,
        _tokenResolve: null,
        _tokenReject: null,
        _tokenReceived: false,
        _waitingForToken: false,
        
        init() {
            this._resetPromise();
            return this;
        },
        
        _resetPromise() {
            this._tokenPromise = new Promise((resolve, reject) => {
                this._tokenResolve = resolve;
                this._tokenReject = reject;
            });
        },
        
        waitForToken(timeout = 10000) {
            // First check SessionStore
            const sessionToken = SessionStore.getToken();
            if (sessionToken) {
                return Promise.resolve(sessionToken);
            }
            
            if (this._tokenReceived) {
                return Promise.resolve(this._token);
            }
            
            Logger.once('TokenAuthority', 'Waiting for token');
            this._waitingForToken = true;
            
            return Promise.race([
                this._tokenPromise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Token timeout')), timeout)
                )
            ]);
        },
        
        receiveToken(token, source = 'parent') {
            if (this._tokenReceived && this._token === token) {
                return;
            }
            
            this._token = token;
            this._tokenReceived = true;
            this._waitingForToken = false;
            
            if (this._tokenResolve) {
                this._tokenResolve(token);
                this._tokenResolve = null;
                this._tokenReject = null;
            }
            
            Logger.success('TokenAuthority', `Token received from ${source}`);
        },
        
        getToken() {
            return SessionStore.getToken() || this._token;
        },
        
        hasToken() {
            return !!(SessionStore.getToken() || this._token);
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
    // ACK CONTROLLER (PRESERVED - ADAPTED)
    // =============================================
    const AckController = {
        _pendingAcks: new Map(),
        _processedIds: new Set(),
        _maxRetries: 2,
        _baseTimeout: 7000,
        _retryBackoff: 1.5,
        _maxPending: 1000,
        
        register(requestId, message, sendFn, options = {}) {
            if (this._processedIds.has(requestId)) {
                return { success: false, duplicate: true };
            }
            
            if (this._pendingAcks.size >= this._maxPending) {
                this._cleanupOldest();
            }
            
            const maxRetries = options.maxRetries ?? this._maxRetries;
            const timeout = options.timeout ?? this._baseTimeout;
            
            const record = {
                requestId,
                message,
                sendFn,
                attempts: 0,
                maxRetries,
                timeout,
                timers: [],
                startTime: Date.now(),
                lastAttempt: Date.now(),
                status: 'pending'
            };
            
            this._scheduleRetry(record, 0);
            
            this._pendingAcks.set(requestId, record);
            
            return { success: true, requestId };
        },
        
        _scheduleRetry(record, delay) {
            const timer = setTimeout(() => {
                this._sendWithRetry(record);
            }, delay);
            
            record.timers.push(timer);
        },
        
        async _sendWithRetry(record) {
            if (record.attempts >= record.maxRetries) {
                this._handleFailure(record, 'Max retries exceeded');
                return;
            }
            
            record.attempts++;
            record.lastAttempt = Date.now();
            record.status = 'sending';
            
            try {
                await record.sendFn();
                
                const timeoutTimer = setTimeout(() => {
                    if (this._pendingAcks.has(record.requestId)) {
                        this._handleTimeout(record);
                    }
                }, record.timeout);
                
                record.timers.push(timeoutTimer);
                
            } catch (error) {
                this._handleFailure(record, error.message);
            }
        },
        
        _handleTimeout(record) {
            if (record.attempts >= record.maxRetries) {
                this._handleFailure(record, 'Timeout - max retries');
                return;
            }
            
            const delay = record.timeout * Math.pow(this._retryBackoff, record.attempts - 1);
            
            this._scheduleRetry(record, delay);
        },
        
        _handleFailure(record, reason) {
            record.status = 'failed';
            record.failureReason = reason;
            
            this._pendingAcks.delete(record.requestId);
            this._processedIds.add(record.requestId);
            
            Logger.warn('AckController', `Message ${record.requestId} failed: ${reason}`);
            
            window.dispatchEvent(new CustomEvent('messageFailed', {
                detail: { requestId: record.requestId, message: record.message, reason }
            }));
            
            this._cleanupTimers(record);
        },
        
        handleAck(requestId, payload) {
            if (this._processedIds.has(requestId)) {
                return { success: false, duplicate: true };
            }
            
            const record = this._pendingAcks.get(requestId);
            if (!record) {
                this._processedIds.add(requestId);
                return { success: false, notFound: true };
            }
            
            this._cleanupTimers(record);
            
            record.status = 'acknowledged';
            record.ackTime = Date.now();
            
            this._pendingAcks.delete(requestId);
            this._processedIds.add(requestId);
            
            window.dispatchEvent(new CustomEvent('messageAcknowledged', {
                detail: { requestId, message: record.message, payload }
            }));
            
            return { success: true, record };
        },
        
        handleNack(requestId, reason) {
            const record = this._pendingAcks.get(requestId);
            if (!record) return { success: false };
            
            this._handleFailure(record, reason || 'NACK received');
            
            return { success: true };
        },
        
        handleMessageAck(messageId, payload) {
            for (const [requestId, record] of this._pendingAcks.entries()) {
                if (record.message.messageId === messageId || record.message.id === messageId) {
                    return this.handleAck(requestId, payload);
                }
            }
            return { success: false, notFound: true };
        },
        
        _cleanupTimers(record) {
            record.timers.forEach(timer => clearTimeout(timer));
            record.timers = [];
        },
        
        _cleanupOldest() {
            const entries = Array.from(this._pendingAcks.entries());
            entries.sort((a, b) => a[1].startTime - b[1].startTime);
            
            const toRemove = entries.slice(0, Math.floor(this._pendingAcks.size * 0.2));
            toRemove.forEach(([id, record]) => {
                this._cleanupTimers(record);
                this._pendingAcks.delete(id);
                this._processedIds.add(id);
            });
        },
        
        cleanup() {
            const now = Date.now();
            const maxAge = 3600000;
            
            for (const [id, record] of this._pendingAcks) {
                if (now - record.startTime > maxAge) {
                    this._cleanupTimers(record);
                    this._pendingAcks.delete(id);
                    this._processedIds.add(id);
                }
            }
            
            if (this._processedIds.size > 10000) {
                this._processedIds.clear();
            }
        },
        
        getPendingCount() {
            return this._pendingAcks.size;
        },
        
        getStats() {
            return {
                pending: this._pendingAcks.size,
                processed: this._processedIds.size,
                oldest: this._pendingAcks.size ? 
                    Math.min(...Array.from(this._pendingAcks.values()).map(r => r.startTime)) : 0
            };
        }
    };

    // =============================================
    // MESSAGE TRANSPORT (PRESERVED - ADAPTED)
    // =============================================
    const MessageTransport = {
        _sequence: 0,
        _outboundQueue: [],
        _parentOrigin: ParentAuthority.getParentOrigin() || window.location.origin,
        _maxQueueSize: 100,
        _processingQueue: false,
        
        init() {
            setInterval(() => this._processQueue(), 5000);
            setInterval(() => AckController.cleanup(), 60000);
            return this;
        },
        
        send(type, payload = {}, options = {}) {
            return new Promise(async (resolve) => {
                if (!BootController.isReady() && !options.bypassReady && !SessionManager.isDegraded()) {
                    try {
                        await BootController.waitForBoot();
                    } catch (e) {
                        if (!SessionManager.isDegraded()) {
                            SessionManager.transition(SessionManager.DEGRADED, 'ready-timeout').catch(() => {});
                        }
                        resolve({ success: false, error: 'Session not ready', state: SessionManager.getState() });
                        return;
                    }
                }
                
                const requestId = options.requestId || this._generateRequestId();
                const messageId = options.messageId || this._generateMessageId();
                const timestamp = Date.now();
                
                const message = {
                    protocol: PROTOCOL.VERSION,
                    messageId,
                    requestId,
                    type,
                    source: SOURCE_IFRAME,
                    target: 'parent',
                    frameId: FRAME_ID,
                    module: 'messages',
                    timestamp,
                    payload: SecurityUtils.sanitizePayload(payload || {}),
                    app: APP_NAME,
                    version: VERSION,
                    requiresAck: options.requiresAck !== false,
                    sequence: ++this._sequence
                };
                
                const sendFn = () => this._postMessage(message);
                
                if (options.requiresAck !== false) {
                    const ackResult = AckController.register(requestId, message, sendFn, {
                        maxRetries: options.maxRetries || 2,
                        timeout: options.timeout
                    });
                    
                    if (ackResult.duplicate) {
                        resolve({ success: false, duplicate: true, requestId });
                        return;
                    }
                }
                
                try {
                    await sendFn();
                    
                    if (options.requiresAck === false) {
                        resolve({ success: true, messageId, requestId, async: false });
                    } else {
                        const waitForAck = (e) => {
                            if (e.detail.requestId === requestId) {
                                window.removeEventListener('messageAcknowledged', waitForAck);
                                window.removeEventListener('messageFailed', waitForFail);
                                resolve({ success: true, requestId, ack: e.detail.payload });
                            }
                        };
                        
                        const waitForFail = (e) => {
                            if (e.detail.requestId === requestId) {
                                window.removeEventListener('messageAcknowledged', waitForAck);
                                window.removeEventListener('messageFailed', waitForFail);
                                resolve({ success: false, error: e.detail.reason, requestId });
                            }
                        };
                        
                        window.addEventListener('messageAcknowledged', waitForAck);
                        window.addEventListener('messageFailed', waitForFail);
                        
                        setTimeout(() => {
                            window.removeEventListener('messageAcknowledged', waitForAck);
                            window.removeEventListener('messageFailed', waitForFail);
                            resolve({ success: false, error: 'Timeout', requestId });
                        }, options.timeout || 10000);
                    }
                } catch (error) {
                    if (options.requiresAck === false) {
                        this._queueMessage(message);
                        resolve({ success: false, queued: true, error: error.message, requestId });
                    } else {
                        resolve({ success: false, error: error.message, requestId });
                    }
                }
            });
        },
        
        _postMessage(message) {
            return new Promise((resolve, reject) => {
                if (!window.parent || window.parent === window) {
                    reject(new Error('No parent window'));
                    return;
                }
                
                try {
                    window.parent.postMessage(message, this._parentOrigin);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        },
        
        _queueMessage(message) {
            if (this._outboundQueue.length >= this._maxQueueSize) {
                this._outboundQueue.shift();
            }
            
            this._outboundQueue.push({
                message,
                timestamp: Date.now()
            });
            
            try {
                localStorage.setItem(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE, JSON.stringify(this._outboundQueue));
            } catch (e) {}
        },
        
        async _processQueue() {
            if (this._processingQueue || this._outboundQueue.length === 0) return;
            
            this._processingQueue = true;
            
            const now = Date.now();
            const oneHour = 3600000;
            
            const freshQueue = this._outboundQueue.filter(item => 
                now - item.timestamp < oneHour
            );
            
            for (const item of freshQueue) {
                try {
                    await this._postMessage(item.message);
                } catch (e) {}
            }
            
            this._outboundQueue = freshQueue.filter(item => 
                now - item.timestamp < 300000
            );
            
            try {
                localStorage.setItem(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE, JSON.stringify(this._outboundQueue));
            } catch (e) {}
            
            this._processingQueue = false;
        },
        
        _generateMessageId() {
            return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}_${++this._sequence}`;
        },
        
        _generateRequestId() {
            return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}_${++this._sequence}`;
        },
        
        getStats() {
            return {
                sequence: this._sequence,
                queued: this._outboundQueue.length,
                pendingAcks: AckController.getPendingCount(),
                ackStats: AckController.getStats()
            };
        }
    }.init();

    // =============================================
    // SAFE STORAGE LAYER (PRESERVED)
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
            } catch (e) {
                this.storageAvailable = false;
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
            const value = this.get(key);
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
    // SECURITY UTILITIES (PRESERVED)
    // =============================================
    const SecurityUtils = {
        allowedOrigins: new Set([
            window.location.origin,
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com',
            ParentAuthority.getParentOrigin()
        ]),

        messageIdCounter: 0,
        processedMessageIds: new Set(),
        replayWindow: 300000,

        initOriginTrust() {
            const hostname = window.location.hostname;
            this.allowedOrigins.add(`https://${hostname}`);
            this.allowedOrigins.add(`http://${hostname}`);
            this.allowedOrigins.add(window.location.origin);
            this.allowedOrigins.add(ParentAuthority.getParentOrigin());
            
            if (hostname.endsWith('.onrender.com')) {
                this.allowedOrigins.add(`https://${hostname}`);
            }
        },

        validateOrigin(origin) {
            if (!origin || origin === 'null') return true;
            return this.allowedOrigins.has(origin) || origin === window.location.origin;
        },

        validateMessageStructure(data) {
            return !!(data && typeof data === 'object' && data.type);
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
                .replace(/onerror/gi, 'data-onerror');
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

        isForThisFrame(message) {
            const targetFrame = message.target || message.frameId;
            return !targetFrame || targetFrame === 'iframe' || targetFrame === FRAME_ID;
        }
    };

    SecurityUtils.initOriginTrust();

    // =============================================
    // MESSAGE FIREWALL (PRESERVED)
    // =============================================
    const MessageFirewall = {
        processedMessages: new Set(),
        messageSequence: 0,

        validate(event) {
            if (!SecurityUtils.validateOrigin(event.origin)) {
                return false;
            }
            
            if (!event.source || event.source === window) return false;
            
            if (!SecurityUtils.validateMessageStructure(event.data)) return false;
            
            const data = event.data;
            if (!SecurityUtils.isForThisFrame(data)) return false;
            
            const messageId = data.messageId || data.id;
            if (messageId && this.processedMessages.has(messageId)) {
                return false;
            }
            
            if (messageId) {
                this.processedMessages.add(messageId);
                setTimeout(() => this.processedMessages.delete(messageId), 60000);
            }
            
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
            
            if (data.type === MESSAGE_TYPES.ACK) {
                AckController.handleAck(data.requestId || data.payload?.requestId, data.payload);
            }
            
            return normalized;
        },

        _convertLegacy(data) {
            const messageId = data.id || data.messageId || SecurityUtils.generateMessageId();
            const requestId = data.requestId || data.id || messageId;
            const timestamp = data.timestamp || Date.now();

            const canonical = {
                protocol: 'LEGACY',
                messageId,
                requestId,
                type: data.type,
                source: data.source || 'PARENT',
                target: 'iframe',
                frameId: data.frameId || FRAME_ID,
                timestamp,
                payload: SecurityUtils.sanitizePayload(data.payload || {}),
                token: data.token,
                signature: data.signature,
                sequence: ++this.messageSequence,
                legacy: true,
                original: data,
                receivedAt: Date.now()
            };

            if (data.type === MESSAGE_TYPES.ACK) {
                AckController.handleAck(requestId, data.payload);
            }

            return canonical;
        },

        createOutbound(type, payload = {}, options = {}) {
            return {
                protocol: PROTOCOL.VERSION,
                messageId: options.messageId || SecurityUtils.generateMessageId(),
                requestId: options.requestId || SecurityUtils.generateRequestId(),
                type,
                source: SOURCE_IFRAME,
                target: 'parent',
                frameId: FRAME_ID,
                timestamp: Date.now(),
                payload: SecurityUtils.sanitizePayload(payload),
                app: APP_NAME,
                version: VERSION,
                requiresAck: options.requiresAck !== false,
                sequence: ++this.messageSequence
            };
        },

        send(type, payload = {}, options = {}) {
            return MessageTransport.send(type, payload, options);
        },

        getStats() {
            return {
                processed: this.processedMessages.size,
                sequence: this.messageSequence
            };
        }
    };

    // =============================================
    // FRIEND MANAGER (PRESERVED - ADAPTED)
    // =============================================
    const FriendManager = {
        _friends: [],
        _friendsMap: new Map(),
        _loaded: false,
        _loading: false,
        _loadPromise: null,
        _subscribers: new Set(),
        _lastLoadTime: 0,
        _cacheTTL: 300000,
        
        init() {
            this._loadFromCache();
            return this;
        },
        
        _loadFromCache() {
            const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
            if (cached && Array.isArray(cached.friends)) {
                this._friends = cached.friends;
                this._rebuildMap();
                this._loaded = true;
                this._lastLoadTime = cached.timestamp || 0;
            }
        },
        
        _rebuildMap() {
            this._friendsMap.clear();
            this._friends.forEach(friend => {
                if (friend.id || friend.uid) {
                    this._friendsMap.set(friend.id || friend.uid, friend);
                }
            });
        },
        
        async loadFriends(force = false) {
            const now = Date.now();
            
            if (!force && this._loaded && now - this._lastLoadTime < this._cacheTTL) {
                return this._friends;
            }
            
            if (this._loading) {
                return this._loadPromise;
            }
            
            this._loading = true;
            this._loadPromise = this._doLoadFriends();
            
            try {
                const friends = await this._loadPromise;
                return friends;
            } finally {
                this._loading = false;
                this._loadPromise = null;
            }
        },
        
        async _doLoadFriends() {
            if (!BootController.isReady() && !SessionManager.isDegraded()) {
                return this._friends;
            }
            
            try {
                const result = await MessageTransport.send(MESSAGE_TYPES.GET_FRIEND_LIST, {
                    timestamp: Date.now(),
                    frameId: FRAME_ID
                }, { requiresAck: true, timeout: 3000, maxRetries: 1 });
                
                if (result.success && result.ack?.friends && Array.isArray(result.ack.friends)) {
                    this._friends = result.ack.friends;
                    this._rebuildMap();
                    this._loaded = true;
                    this._lastLoadTime = Date.now();
                    
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                        friends: this._friends,
                        timestamp: this._lastLoadTime
                    });
                    
                    Logger.success('FriendManager', `Loaded ${this._friends.length} friends`);
                    this._notifySubscribers();
                    
                    return this._friends;
                }
                
                return this._friends;
            } catch (error) {
                debugLog('FriendManager', 'Failed to load friends, using cache');
                return this._friends;
            }
        },
        
        getFriends() {
            return [...this._friends];
        },
        
        getFriend(id) {
            return this._friendsMap.get(id) || null;
        },
        
        updateFriend(update) {
            const id = update.id || update.uid;
            if (!id) return false;
            
            const existing = this._friendsMap.get(id);
            if (!existing) {
                this._friends.push(update);
            } else {
                Object.assign(existing, update);
            }
            
            this._rebuildMap();
            this._notifySubscribers();
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                friends: this._friends,
                timestamp: Date.now()
            });
            
            return true;
        },
        
        subscribe(callback) {
            this._subscribers.add(callback);
            if (this._loaded) {
                try { callback(this._friends); } catch (e) {}
            }
            return () => this._subscribers.delete(callback);
        },
        
        _notifySubscribers() {
            const friends = this.getFriends();
            this._subscribers.forEach(cb => {
                try { cb(friends); } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('friendsUpdated', {
                detail: { friends }
            }));
        },
        
        isLoaded() {
            return this._loaded;
        },
        
        clear() {
            this._friends = [];
            this._friendsMap.clear();
            this._loaded = false;
            SafeStorage.remove(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
        }
    }.init();

    // =============================================
    // CHAT MANAGER (PRESERVED - ADAPTED)
    // =============================================
    const ChatManager = {
        _chats: [],
        _chatsMap: new Map(),
        _activeChat: null,
        _messages: [],
        _messagesMap: new Map(),
        _subscribers: new Set(),
        _loaded: false,
        
        init() {
            this._loadFromCache();
            return this;
        },
        
        _loadFromCache() {
            const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cached && Array.isArray(cached.chats)) {
                this._chats = cached.chats;
                this._rebuildMap();
            }
        },
        
        _rebuildMap() {
            this._chatsMap.clear();
            this._chats.forEach(chat => {
                if (chat.id) {
                    this._chatsMap.set(chat.id, chat);
                }
            });
        },
        
        async loadChats(force = false) {
            if (!BootController.isReady() && !SessionManager.isDegraded()) {
                return this._chats;
            }
            
            try {
                const result = await MessageTransport.send(MESSAGE_TYPES.GET_CHAT_HISTORY, {
                    timestamp: Date.now(),
                    frameId: FRAME_ID,
                    all: true
                }, { requiresAck: true, timeout: 3000, maxRetries: 1 });
                
                if (result.success && result.ack?.chats && Array.isArray(result.ack.chats)) {
                    this._chats = result.ack.chats;
                    this._rebuildMap();
                    
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, {
                        chats: this._chats,
                        timestamp: Date.now()
                    });
                    
                    this._notifySubscribers();
                }
            } catch (error) {
                debugLog('ChatManager', 'Failed to load chats, using cache');
            }
            
            return this._chats;
        },
        
        async openChat(chatId) {
            if (!chatId) return null;
            
            let chat = this._chatsMap.get(chatId);
            
            if (!chat) {
                try {
                    const result = await MessageTransport.send(MESSAGE_TYPES.GET_CHAT_HISTORY, {
                        chatId,
                        timestamp: Date.now()
                    }, { requiresAck: true, timeout: 5000, maxRetries: 1 });
                    
                    if (result.success && result.ack?.chat) {
                        chat = result.ack.chat;
                        if (!this._chatsMap.has(chatId)) {
                            this._chats.push(chat);
                            this._chatsMap.set(chatId, chat);
                        }
                    }
                } catch (error) {
                    Logger.error('ChatManager', `Failed to open chat ${chatId}`, error);
                    return null;
                }
            }
            
            if (!chat) return null;
            
            this._activeChat = chat;
            
            await this.loadMessages(chatId);
            
            window.dispatchEvent(new CustomEvent('chatOpened', {
                detail: { chat }
            }));
            
            return chat;
        },
        
        async loadMessages(chatId) {
            if (!chatId) return [];
            
            const cachedKey = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`;
            const cached = SafeStorage.getJSON(cachedKey);
            if (cached && Array.isArray(cached)) {
                this._messages = cached;
                this._rebuildMessagesMap();
            }
            
            if (!BootController.isReady() && !SessionManager.isDegraded()) {
                return this._messages;
            }
            
            try {
                const result = await MessageTransport.send(MESSAGE_TYPES.GET_CHAT_HISTORY, {
                    chatId,
                    timestamp: Date.now()
                }, { requiresAck: true, timeout: 5000, maxRetries: 1 });
                
                if (result.success && result.ack?.messages && Array.isArray(result.ack.messages)) {
                    this._messages = result.ack.messages;
                    this._rebuildMessagesMap();
                    SafeStorage.setJSON(cachedKey, this._messages);
                }
            } catch (error) {
                Logger.warn('ChatManager', `Failed to load messages for ${chatId}`, error);
            }
            
            return this._messages;
        },
        
        _rebuildMessagesMap() {
            this._messagesMap.clear();
            this._messages.forEach(msg => {
                if (msg.id) {
                    this._messagesMap.set(msg.id, msg);
                }
            });
        },
        
        addMessage(message) {
            if (!message.id) {
                message.id = SecurityUtils.generateMessageId();
            }
            
            const existing = this._messagesMap.get(message.id);
            if (existing) {
                Object.assign(existing, message);
            } else {
                this._messages.push(message);
                this._messagesMap.set(message.id, message);
            }
            
            this._messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
            if (this._activeChat && message.chatId === this._activeChat.id) {
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${this._activeChat.id}`, this._messages);
            }
            
            window.dispatchEvent(new CustomEvent('messageAdded', {
                detail: { message }
            }));
            
            return message;
        },
        
        updateMessageStatus(messageId, status, details = {}) {
            const message = this._messagesMap.get(messageId);
            if (!message) return false;
            
            message.status = status;
            if (details.deliveredAt) message.deliveredAt = details.deliveredAt;
            if (details.readAt) message.readAt = details.readAt;
            
            window.dispatchEvent(new CustomEvent('messageStatusChanged', {
                detail: { messageId, status, message }
            }));
            
            return true;
        },
        
        getActiveChat() {
            return this._activeChat ? { ...this._activeChat } : null;
        },
        
        getMessages() {
            return [...this._messages];
        },
        
        getChats() {
            return [...this._chats];
        },
        
        subscribe(callback) {
            this._subscribers.add(callback);
            return () => this._subscribers.delete(callback);
        },
        
        _notifySubscribers() {
            this._subscribers.forEach(cb => {
                try { cb(this._chats, this._activeChat); } catch (e) {}
            });
        },
        
        clear() {
            this._chats = [];
            this._chatsMap.clear();
            this._activeChat = null;
            this._messages = [];
            this._messagesMap.clear();
        }
    }.init();

    // =============================================
    // WEBSOCKET CONTROLLER - DISABLED (PARENT HANDLES)
    // =============================================
    const WSController = {
        WS_UNINITIALIZED: 'UNINITIALIZED',
        WS_CONNECTING: 'CONNECTING',
        WS_CONNECTED: 'CONNECTED',
        WS_AUTHENTICATING: 'AUTHENTICATING',
        WS_READY: 'READY',
        WS_RECONNECTING: 'RECONNECTING',
        WS_CLOSED: 'CLOSED',
        WS_ERROR: 'ERROR',
        
        _state: 'UNINITIALIZED',
        _ws: null,
        _connectPromise: null,
        _connectResolve: null,
        _reconnectAttempts: 0,
        _maxReconnectAttempts: 2,
        _baseDelay: 1000,
        _maxDelay: 30000,
        _heartbeatInterval: null,
        _pendingMessages: [],
        _authenticated: false,
        _url: null,
        _messageHandlers: new Map(),
        _initialized: false,
        _authTimeout: null,
        
        init() {
            if (this._initialized) return this;
            this._initialized = true;
            
            this._setupMessageHandlers();
            return this;
        },
        
        _setupMessageHandlers() {
            this._messageHandlers.set('message', (data) => {
                const message = {
                    id: data.id || SecurityUtils.generateMessageId(),
                    chatId: data.chatId,
                    senderId: data.senderId,
                    content: SecurityUtils.sanitizeString(data.content || ''),
                    type: data.type || 'text',
                    timestamp: data.timestamp || Date.now(),
                    status: 'received'
                };
                
                ChatManager.addMessage(message);
                
                if (message.senderId !== SessionManager.getUserId()) {
                    this._playNotificationSound();
                }
            });
            
            this._messageHandlers.set('typing', (data) => {
                if (ChatManager.getActiveChat()?.id === data.chatId) {
                    window.dispatchEvent(new CustomEvent('typingIndicator', {
                        detail: { userId: data.userId, isTyping: data.isTyping, chatId: data.chatId }
                    }));
                }
            });
            
            this._messageHandlers.set('read_receipt', (data) => {
                ChatManager.updateMessageStatus(data.messageId, 'read', { readAt: data.timestamp });
            });
            
            this._messageHandlers.set('delivery_receipt', (data) => {
                ChatManager.updateMessageStatus(data.messageId, 'delivered', { deliveredAt: data.timestamp });
            });
            
            this._messageHandlers.set('friend_online', (data) => {
                FriendManager.updateFriend({ id: data.userId, online: true, lastSeen: data.timestamp });
            });
            
            this._messageHandlers.set('friend_offline', (data) => {
                FriendManager.updateFriend({ id: data.userId, online: false, lastSeen: data.timestamp });
            });
        },
        
        async connect(url) {
            // DISABLED - Parent handles WebSocket
            Logger.once('WSController', 'WebSocket disabled - parent manages connection');
            return Promise.resolve(false);
        },
        
        _authenticate(token) {
            // DISABLED
        },
        
        _handleMessage(event) {
            // DISABLED
        },
        
        send(data) {
            // DISABLED - Use MessageTransport instead
            return false;
        },
        
        _queueMessage(data) {
            // DISABLED
        },
        
        _flushPendingMessages() {
            // DISABLED
        },
        
        _startHeartbeat() {
            // DISABLED
        },
        
        _handleHeartbeatResponse() {
            // DISABLED
        },
        
        _scheduleReconnect() {
            // DISABLED
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
        
        _playNotificationSound() {
            const settings = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
            if (settings.notificationSound !== false) {
                const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
                audio.volume = 0.3;
                audio.play().catch(() => {});
            }
        },
        
        disconnect() {
            if (this._ws) {
                this._ws.close();
                this._ws = null;
            }
            
            this._cleanup();
            this._state = this.WS_CLOSED;
            this._authenticated = false;
        },
        
        getState() {
            return this._state;
        },
        
        isReady() {
            return false;
        }
    }.init();

    // =============================================
    // MESSAGE LIFECYCLE MANAGER (PRESERVED - ADAPTED)
    // =============================================
    const MessageLifecycle = {
        _pendingMessages: new Map(),
        _optimisticMessages: new Map(),
        
        async sendMessage(content, options = {}) {
            if (!BootController.isReady() && !SessionManager.isDegraded()) {
                try {
                    await BootController.waitForBoot();
                } catch (e) {
                    return { success: false, error: 'Session not ready' };
                }
            }
            
            const activeChat = ChatManager.getActiveChat();
            if (!activeChat && !options.chatId) {
                return { success: false, error: 'No active chat' };
            }
            
            const chatId = options.chatId || activeChat.id;
            const messageId = options.id || SecurityUtils.generateMessageId();
            const requestId = SecurityUtils.generateRequestId();
            const timestamp = Date.now();
            
            const optimisticMessage = {
                id: messageId,
                requestId,
                chatId,
                senderId: SessionManager.getUserId(),
                content: SecurityUtils.escapeHtml(content || ''),
                type: options.type || 'text',
                timestamp,
                status: 'sending',
                local: true,
                ...options
            };
            
            ChatManager.addMessage(optimisticMessage);
            this._optimisticMessages.set(messageId, optimisticMessage);
            
            const payload = {
                chatId,
                content,
                type: options.type || 'text',
                attachment: options.attachment,
                replyTo: options.replyTo,
                messageId,
                requestId,
                timestamp
            };
            
            const result = await MessageTransport.send(MESSAGE_TYPES.SEND_MESSAGE, payload, {
                requiresAck: true,
                maxRetries: 2,
                timeout: 7000,
                requestId
            });
            
            if (result.success) {
                ChatManager.updateMessageStatus(messageId, 'sent');
                this._optimisticMessages.delete(messageId);
                
                if (this._optimisticMessages.size === 0) {
                    const messages = ChatManager.getMessages();
                    const msgIndex = messages.findIndex(m => m.id === messageId);
                    if (msgIndex !== -1) {
                        messages[msgIndex].status = 'sent';
                    }
                }
                
                return { success: true, messageId, requestId };
            } else {
                ChatManager.updateMessageStatus(messageId, 'failed', { reason: result.error });
                this._optimisticMessages.delete(messageId);
                
                return { success: false, error: result.error, messageId };
            }
        },
        
        retryMessage(messageId) {
            const messages = ChatManager.getMessages();
            const message = messages.find(m => m.id === messageId);
            if (!message || message.status !== 'failed') return false;
            
            message.status = 'sending';
            ChatManager.updateMessageStatus(messageId, 'sending');
            
            return this.sendMessage(message.content, {
                type: message.type,
                attachment: message.attachment,
                replyTo: message.replyTo,
                id: messageId,
                chatId: message.chatId
            });
        },
        
        getPendingCount() {
            return this._optimisticMessages.size;
        }
    };

    // =============================================
    // API CLIENT (PRESERVED - ADAPTED)
    // =============================================
    const APIClient = {
        _pendingRequests: new Map(),
        _baseUrl: ENV.getApiBaseUrl(),
        
        async request(endpoint, options = {}) {
            if (!endpoint || typeof endpoint !== 'string') return null;
            
            if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
                Logger.warn('APIClient', `External URL blocked: ${endpoint}`);
                return null;
            }
            
            if (!endpoint.startsWith('/api/')) {
                endpoint = '/api/' + endpoint.replace(/^\/+/, '');
            }
            
            const token = await TokenAuthority.waitForToken().catch(() => null);
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
            
            if ((BootController.isReady() || SessionManager.isDegraded()) && options.useParent !== false) {
                return this._requestViaParent(endpoint, options, requestId, headers);
            }
            
            return this._requestDirect(endpoint, options, headers, requestId);
        },
        
        async _requestViaParent(endpoint, options, requestId, headers) {
            return new Promise((resolve) => {
                const timeout = options.timeout || 30000;
                
                const timer = setTimeout(() => {
                    if (this._pendingRequests.has(requestId)) {
                        this._pendingRequests.delete(requestId);
                        this._requestDirect(endpoint, options, headers, requestId).then(resolve);
                    }
                }, timeout);
                
                this._pendingRequests.set(requestId, { resolve, timer });
                
                MessageTransport.send(MESSAGE_TYPES.API_REQUEST, {
                    endpoint,
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body,
                    requestId
                }, { requiresAck: true, timeout, requestId }).catch(() => {
                    clearTimeout(timer);
                    this._pendingRequests.delete(requestId);
                    this._requestDirect(endpoint, options, headers, requestId).then(resolve);
                });
            });
        },
        
        async _requestDirect(endpoint, options, headers, requestId) {
            try {
                let url = endpoint;
                if (this._baseUrl && !endpoint.startsWith('http')) {
                    url = this._baseUrl + endpoint;
                }
                
                if (!url.startsWith('http')) {
                    return { error: 'No API endpoint configured', offline: true };
                }
                
                const fetchOptions = {
                    method: options.method || 'GET',
                    headers,
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
                
                const response = await fetch(url, fetchOptions);
                
                if (!response.ok) {
                    return { error: `HTTP ${response.status}`, status: response.status, offline: response.status === 404 };
                }
                
                return await response.json();
            } catch (error) {
                Logger.warn('APIClient', `Network error: ${endpoint}`, error);
                return { error: 'Network error', offline: true };
            }
        },
        
        handleParentResponse(payload) {
            const requestId = payload.requestId;
            if (requestId && this._pendingRequests.has(requestId)) {
                const { resolve, timer } = this._pendingRequests.get(requestId);
                clearTimeout(timer);
                resolve(payload.data || payload.result);
                this._pendingRequests.delete(requestId);
            }
        }
    };

    // =============================================
    // PARENT MESSAGE HANDLER (PRESERVED - ADAPTED)
    // =============================================
    const ParentMessageHandler = {
        _initialized: false,
        
        init() {
            if (this._initialized) return this;
            window.addEventListener('message', this._handleMessage.bind(this));
            this._initialized = true;
            return this;
        },
        
        _handleMessage(event) {
            if (!SecurityUtils.validateOrigin(event.origin)) return;
            
            const message = MessageFirewall.parse(event);
            if (!message) return;
            
            // Check for PARENT_READY (special case for boot)
            if (message.type === MESSAGE_TYPES.PARENT_READY) {
                BootController.onParentReady(message);
                this._handleParentReady(message);
                return;
            }
            
            if (message.type === MESSAGE_TYPES.ACK) {
                const messageId = message.payload?.messageId || message.messageId;
                if (messageId) {
                    AckController.handleMessageAck(messageId, message.payload);
                }
                return;
            }
            
            // Check for handshake messages
            if (message.type === MESSAGE_TYPES.HANDSHAKE_ACK) {
                BootController.onHandshakeAck(message);
                return;
            }
            
            if (message.type === MESSAGE_TYPES.HANDSHAKE_COMPLETE) {
                BootController.onHandshakeComplete(message);
                return;
            }
            
            if (message.type === MESSAGE_TYPES.MODULE_REGISTERED) {
                BootController.onModuleRegistered(message);
                return;
            }
            
            switch (message.type) {
                case MESSAGE_TYPES.PARENT_READY:
                    this._handleParentReady(message);
                    break;
                    
                case MESSAGE_TYPES.SESSION_ACTIVE:
                    this._handleSessionActive(message.payload);
                    break;
                    
                case MESSAGE_TYPES.SESSION_UPDATE:
                    this._handleSessionData(message.payload);
                    break;
                    
                case MESSAGE_TYPES.PERMISSION_UPDATE:
                    this._handlePermissionUpdate(message.payload);
                    break;
                    
                case MESSAGE_TYPES.NAVIGATE:
                    this._handleNavigate(message.payload);
                    break;
                    
                case MESSAGE_TYPES.FORCE_LOGOUT:
                    this._handleForceLogout(message.payload);
                    break;
                    
                case MESSAGE_TYPES.PING:
                    this._handlePing(message);
                    break;
                    
                case MESSAGE_TYPES.SESSION_DATA:
                case MESSAGE_TYPES.SESSION_UPDATE:
                    this._handleSessionData(message.payload);
                    break;
                    
                case MESSAGE_TYPES.TOKEN_UPDATE:
                case MESSAGE_TYPES.TOKEN_RESPONSE:
                    this._handleTokenData(message.payload);
                    break;
                    
                case MESSAGE_TYPES.SESSION_VERIFIED:
                    this._handleSessionVerified(message.payload);
                    break;
                    
                case MESSAGE_TYPES.FRIEND_LIST_RESPONSE:
                    this._handleFriendList(message.payload);
                    break;
                    
                case MESSAGE_TYPES.FRIEND_UPDATED:
                case MESSAGE_TYPES.FRIEND_ONLINE:
                case MESSAGE_TYPES.FRIEND_OFFLINE:
                    this._handleFriendUpdate(message.payload);
                    break;
                    
                case MESSAGE_TYPES.CHAT_HISTORY_RESPONSE:
                    this._handleChatHistory(message.payload);
                    break;
                    
                case MESSAGE_TYPES.MESSAGE_RECEIVED:
                    this._handleIncomingMessage(message.payload);
                    break;
                    
                case MESSAGE_TYPES.MESSAGE_DELIVERED:
                    this._handleDeliveryReceipt(message.payload);
                    break;
                    
                case MESSAGE_TYPES.MESSAGE_READ:
                    this._handleReadReceipt(message.payload);
                    break;
                    
                case MESSAGE_TYPES.API_RESPONSE:
                    APIClient.handleParentResponse(message.payload);
                    break;
                    
                case MESSAGE_TYPES.PONG:
                case MESSAGE_TYPES.HEARTBEAT_ACK:
                    this._handleHeartbeatAck(message);
                    break;
                    
                case MESSAGE_TYPES.SYSTEM_READY:
                    this._handleSystemReady(message);
                    break;
                    
                case MESSAGE_TYPES.PARENT_RECOVERY:
                    this._handleParentRecovery(message);
                    break;
                    
                case MESSAGE_TYPES.ERROR:
                    Logger.error('Parent', 'Error from parent', message.payload);
                    break;
                    
                default:
                    debugLog('Parent', `Unhandled message: ${message.type}`);
            }
        },
        
        _handleParentReady(message) {
            Logger.once('Parent', 'Parent ready message received');
            
            ParentAuthority._detectParentReady();
            
            if (message.payload?.version) {
                ParentAuthority.setParentVersion(message.payload.version);
            }
            
            if (message.payload?.features) {
                message.payload.features.forEach(feature => ParentAuthority.addFeature(feature));
            }
        },
        
        _handleSessionActive(payload) {
            if (!payload || !payload.session) return;
            
            Logger.once('Parent', 'Session active received from parent');
            
            const session = {
                user: payload.session.user,
                token: payload.session.token || payload.session.accessToken,
                userId: payload.session.userId || payload.session.user?.id,
                authenticated: !!(payload.session.user && (payload.session.token || payload.session.accessToken)),
                expiresAt: payload.session.expiresAt || Date.now() + 3600000
            };
            
            SessionManager.setSession(session, true);
            SessionStore.setSession(session);
            
            if (session.token) {
                TokenAuthority.receiveToken(session.token, 'parent');
            }
            
            if (SessionManager.getState() === SessionManager.WAIT_SESSION || SessionManager.getState() === SessionManager.DEGRADED) {
                SessionManager.transition(SessionManager.INITIALIZING, 'session-active');
            }
        },
        
        _handlePermissionUpdate(payload) {
            Logger.once('Parent', 'Permission update received');
            window.dispatchEvent(new CustomEvent('permissionUpdate', {
                detail: payload
            }));
        },
        
        _handleNavigate(payload) {
            Logger.once('Parent', 'Navigate request received');
            window.dispatchEvent(new CustomEvent('navigateRequest', {
                detail: payload
            }));
        },
        
        _handleForceLogout(payload) {
            Logger.once('Parent', 'Force logout received');
            
            SessionManager.clear();
            TokenAuthority.clearToken();
            SessionStore.clear();
            
            SessionManager.transition(SessionManager.DEGRADED, 'force-logout');
            
            window.dispatchEvent(new CustomEvent('forceLogout', {
                detail: payload
            }));
        },
        
        _handlePing(message) {
            MessageTransport.send(MESSAGE_TYPES.PONG, {
                timestamp: Date.now(),
                echo: message.payload?.timestamp
            }, { requiresAck: false });
        },
        
        _handleSystemReady(message) {
            Logger.once('System', 'System ready');
            if (SessionManager.isDegraded()) {
                SessionManager.transition(SessionManager.REGISTERING, 'system-ready-recovery');
            }
        },
        
        _handleParentRecovery(message) {
            Logger.once('System', 'Parent recovery');
            if (SessionManager.isDegraded()) {
                SessionManager.transition(SessionManager.REGISTERING, 'parent-recovery');
            }
        },
        
        _handleSessionData(payload) {
            if (!payload) return;
            
            Logger.once('Parent', 'Session data received');
            
            const session = {
                user: payload.user,
                token: payload.token || payload.accessToken,
                userId: payload.userId || payload.user?.id,
                authenticated: !!(payload.user && (payload.token || payload.accessToken)),
                expiresAt: payload.expiresAt || Date.now() + 3600000
            };
            
            SessionManager.setSession(session, true);
            SessionStore.setSession(session);
            
            if (session.token) {
                TokenAuthority.receiveToken(session.token, 'parent');
            }
            
            if (SessionManager.getState() === SessionManager.WAIT_SESSION || SessionManager.getState() === SessionManager.DEGRADED) {
                SessionManager.transition(SessionManager.INITIALIZING, 'session-received');
            }
        },
        
        _handleTokenData(payload) {
            if (payload?.token) {
                TokenAuthority.receiveToken(payload.token, 'parent');
            }
        },
        
        _handleSessionVerified(payload) {
            if (payload?.valid && payload?.session) {
                this._handleSessionData(payload.session);
            }
        },
        
        _handleFriendList(payload) {
            if (payload?.friends && Array.isArray(payload.friends)) {
                payload.friends.forEach(friend => FriendManager.updateFriend(friend));
            }
        },
        
        _handleFriendUpdate(payload) {
            FriendManager.updateFriend(payload);
        },
        
        _handleChatHistory(payload) {
            if (payload?.messages && Array.isArray(payload.messages)) {
                payload.messages.forEach(msg => ChatManager.addMessage(msg));
            }
        },
        
        _handleIncomingMessage(payload) {
            const message = {
                id: payload.id || payload.messageId,
                chatId: payload.chatId,
                senderId: payload.senderId,
                content: SecurityUtils.sanitizeString(payload.content || ''),
                type: payload.type || 'text',
                timestamp: payload.timestamp || Date.now(),
                status: 'received'
            };
            
            ChatManager.addMessage(message);
            
            if (message.senderId !== SessionManager.getUserId()) {
                this._playNotificationSound();
            }
            
            MessageTransport.send(MESSAGE_TYPES.MESSAGE_DELIVERED, {
                messageId: message.id,
                timestamp: Date.now()
            }, { requiresAck: false });
        },
        
        _handleDeliveryReceipt(payload) {
            ChatManager.updateMessageStatus(payload.messageId, 'delivered', {
                deliveredAt: payload.timestamp
            });
        },
        
        _handleReadReceipt(payload) {
            ChatManager.updateMessageStatus(payload.messageId, 'read', {
                readAt: payload.timestamp
            });
        },
        
        _handleHeartbeatAck(message) {
            window.dispatchEvent(new CustomEvent('heartbeatAck', {
                detail: { timestamp: Date.now(), rtt: Date.now() - (message.payload?.timestamp || Date.now()) }
            }));
        },
        
        _playNotificationSound() {
            const settings = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
            if (settings.notificationSound !== false) {
                const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
                audio.volume = 0.3;
                audio.play().catch(() => {});
            }
        }
    }.init();

    // =============================================
    // PARENT REGISTRATION & HANDSHAKE (PRESERVED - ADAPTED)
    // =============================================
    let registrationSent = false;
    let registrationPromise = null;
    let handshakeInitiated = false;
    let parentHandshakeAttempts = 0;
    const MAX_HANDSHAKE_ATTEMPTS = 2;

    async function registerWithParent() {
        if (registrationSent && registrationPromise) {
            return registrationPromise;
        }
        
        if (!window.parent || window.parent === window) {
            Logger.once('Registration', 'No parent window');
            return { success: false, reason: 'no-parent' };
        }
        
        registrationSent = true;
        
        registrationPromise = new Promise((resolve) => {
            Logger.once('Registration', 'Registering with parent');
            
            const requestId = SecurityUtils.generateRequestId();
            
            MessageTransport.send(MESSAGE_TYPES.IFRAME_REGISTERED, {
                module: 'messages',
                frameId: FRAME_ID,
                version: VERSION,
                timestamp: Date.now()
            }, {
                requiresAck: true,
                timeout: 3000,
                requestId
            }).then(result => {
                if (result.success) {
                    Logger.once('Registration', 'Registration successful');
                    if (SessionManager.getState() === SessionManager.WAIT_PARENT) {
                        SessionManager.transition(SessionManager.REGISTERING, 'registration-ack');
                    }
                } else {
                    Logger.once('Registration', 'Registration timeout');
                    if (SessionManager.getState() === SessionManager.WAIT_PARENT) {
                        SessionManager.transition(SessionManager.REGISTERING, 'assumed');
                    }
                }
                resolve(result);
            }).catch(() => {
                Logger.once('Registration', 'Registration failed');
                if (SessionManager.getState() === SessionManager.WAIT_PARENT) {
                    SessionManager.transition(SessionManager.REGISTERING, 'assumed');
                }
                resolve({ success: true, assumed: true });
            });
        });
        
        return registrationPromise;
    }

    async function sendChildReady() {
        if (!window.parent || window.parent === window) return;
        
        Logger.once('Parent', 'Sending CHILD_READY');
        
        MessageTransport.send(MESSAGE_TYPES.CHILD_READY, {
            module: 'messages',
            frameId: FRAME_ID,
            version: VERSION,
            timestamp: Date.now()
        }, { requiresAck: false });
    }

    async function sendRegisterModule() {
        if (!window.parent || window.parent === window) return;
        if (SessionManager.hasModuleRegistered()) return;
        
        Logger.once('Parent', 'Sending REGISTER_MODULE');
        
        SessionManager.markModuleRegistered();
        
        MessageTransport.send(MESSAGE_TYPES.REGISTER_MODULE, {
            module: 'messages',
            frameId: FRAME_ID,
            version: VERSION,
            features: ['messages', 'realtime'],
            timestamp: Date.now()
        }, { requiresAck: false });
    }

    async function initiateParentHandshake() {
        if (handshakeInitiated) return;
        handshakeInitiated = true;
        SessionManager.setHandshakeInitiated();
        
        Logger.once('Handshake', 'Initiating parent handshake');
        
        if (SessionManager.getState() === SessionManager.WAIT_PARENT) {
            // Already in WAIT_PARENT
        } else if (SessionManager.getState() === SessionManager.PREINIT) {
            await SessionManager.transition(SessionManager.WAIT_PARENT, 'handshake-start');
        }
        
        await sendChildReady();
        await sendRegisterModule();
        
        setTimeout(() => {
            if (SessionManager.getState() === SessionManager.WAIT_PARENT) {
                Logger.once('Handshake', 'Handshake considered complete');
                SessionManager.transition(SessionManager.REGISTERING, 'handshake-sent').catch(() => {});
            }
        }, 500);
        
        parentHandshakeAttempts = 1;
    }

    // =============================================
    // SESSION ACQUISITION (PRESERVED - ADAPTED)
    // =============================================
    async function acquireSession() {
        Logger.once('Session', 'Acquiring session from parent');
        
        if (SessionManager.getState() === SessionManager.WAIT_SESSION) {
            // Already in WAIT_SESSION
        } else if (SessionManager.getState() === SessionManager.REGISTERING) {
            await SessionManager.transition(SessionManager.WAIT_SESSION, 'acquiring');
        }
        
        try {
            const result = await MessageTransport.send(MESSAGE_TYPES.REQUEST_SESSION, {
                timestamp: Date.now(),
                frameId: FRAME_ID,
                waitForActive: true
            }, { requiresAck: true, timeout: 5000 });
            
            if (result.success && result.ack?.session) {
                ParentMessageHandler._handleSessionData(result.ack.session);
                return true;
            }
            
            Logger.once('Session', 'No session from parent, falling back to cache');
            
            const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (cachedUser) {
                const fallbackSession = {
                    user: cachedUser,
                    token: null,
                    userId: cachedUser.id,
                    authenticated: false,
                    expiresAt: Date.now() + 3600000
                };
                SessionManager.setSession(fallbackSession, false);
                return true;
            }
            
            return false;
            
        } catch (error) {
            Logger.once('Session', 'Session acquisition failed');
            
            const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (cachedUser) {
                const fallbackSession = {
                    user: cachedUser,
                    token: null,
                    userId: cachedUser.id,
                    authenticated: false,
                    expiresAt: Date.now() + 3600000
                };
                SessionManager.setSession(fallbackSession, false);
                return true;
            }
            
            return false;
        }
    }

    // =============================================
    // UI INITIALIZATION (PRESERVED)
    // =============================================
    async function initializeUI() {
        Logger.once('UI', 'Initializing UI');
        
        try {
            if (window.messagesUI && typeof window.messagesUI.init === 'function') {
                window.messagesUI.init();
            }
        } catch (e) {
            Logger.error('UI', 'UI initialization error', e);
        }
        
        window.dispatchEvent(new CustomEvent('uiReady', {
            detail: { frameId: FRAME_ID, version: VERSION }
        }));
    }

    // =============================================
    // CORE STATE (PRESERVED)
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

    SessionManager.onStateChange((oldState, newState, reason, session) => {
        if (session?.user) {
            currentUser = session.user;
        }
        
        window.dispatchEvent(new CustomEvent('sessionStateChanged', {
            detail: { oldState, newState, reason, session }
        }));
        
        if (newState === SessionManager.READY) {
            FriendManager.loadFriends().catch(() => {});
            ChatManager.loadChats().catch(() => {});
        }
        
        window.__MODULE_READY__ = newState === SessionManager.READY;
        window.__MODULE_SESSION_ACTIVE__ = newState === SessionManager.READY && SessionManager.isAuthenticated();
    });

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

    // =============================================
    // EXPORTED FUNCTIONS (PRESERVED - ADAPTED)
    // =============================================
    function getCurrentSession() {
        const session = SessionManager.getSession();
        return {
            user: session?.user || null,
            authenticated: SessionManager.isAuthenticated(),
            token: SessionManager.getToken(),
            fromCache: false,
            userId: SessionManager.getUserId()
        };
    }

    function requestSessionUpdate() {
        return MessageTransport.send(MESSAGE_TYPES.REQUEST_SESSION, {
            timestamp: Date.now(),
            frameId: FRAME_ID
        }, { requiresAck: true, timeout: 5000 });
    }

    function initChildSession() {
        return new Promise((resolve) => {
            if (BootController.isReady() && currentUser) {
                resolve({ user: currentUser, sessionData: SessionManager.getSession() });
            } else {
                const checkInterval = setInterval(() => {
                    if (BootController.isReady() && currentUser) {
                        clearInterval(checkInterval);
                        resolve({ user: currentUser, sessionData: SessionManager.getSession() });
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
        return MessageTransport.send(type, data, options);
    }

    async function apiRequest(endpoint, options = {}) {
        return APIClient.request(endpoint, options);
    }

    async function fetchData(type) {
        switch (type) {
            case 'friendsList': 
                return FriendManager.getFriends();
            case 'groupsList': 
                return [];
            case 'chatHistory': 
                return ChatManager.getMessages();
            case 'notifications': 
                return [];
            case 'settings': 
                return SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
            default: 
                return null;
        }
    }

    async function loadContacts() {
        return FriendManager.getFriends();
    }

    async function loadChats() {
        return ChatManager.getChats();
    }

    async function loadMessages(chatId = null) {
        const targetChat = chatId || currentChat?.id;
        if (!targetChat) return [];
        
        if (targetChat === ChatManager.getActiveChat()?.id) {
            return ChatManager.getMessages();
        }
        
        return ChatManager.loadMessages(targetChat);
    }

    async function openChat(chat) {
        if (!chat) return false;
        
        const opened = await ChatManager.openChat(chat.id);
        if (opened) {
            currentChat = opened;
            currentFriend = opened.friend ? { ...opened.friend } : null;
            return true;
        }
        
        return false;
    }

    async function loadChatByFriendId(friendId) {
        const friend = FriendManager.getFriend(friendId);
        if (!friend) return null;
        
        const existingChat = ChatManager.getChats().find(c => c.friendId === friendId);
        if (existingChat) {
            await openChat(existingChat);
            return existingChat;
        }
        
        const newChat = {
            id: `chat_${Date.now()}`,
            friendId: friendId,
            friendName: friend.displayName || friend.username || 'User',
            friendUsername: friend.username || '',
            friendAvatar: friend.photoURL || friend.avatar || '',
            lastMessage: '',
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            type: 'direct',
            archived: false,
            blocked: false,
            local: true
        };
        
        const chats = ChatManager.getChats();
        chats.unshift(newChat);
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
        
        await openChat(newChat);
        
        return newChat;
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

        const chats = ChatManager.getChats();
        chats.unshift(newChat);
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
        
        openChat(newChat);
    }

    async function sendMessage(content, type = 'text', options = {}) {
        return MessageLifecycle.sendMessage(content, { type, ...options });
    }

    async function sendMessageWithOptions(content, options = {}) {
        return MessageLifecycle.sendMessage(content, options);
    }

    async function sendToMultipleChats(content, chatIds) {
        if ((!content && !currentAttachment) || !chatIds?.length) return 0;

        let successCount = 0;

        for (const chatId of chatIds) {
            const result = await MessageLifecycle.sendMessage(content, {
                type: currentAttachment?.type || 'text',
                attachment: currentAttachment,
                chatId
            });
            
            if (result.success) successCount++;
            
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        return successCount;
    }

    async function editMessage(messageId, newContent) {
        if (!BootController.isReady() && !SessionManager.isDegraded()) return false;

        const result = await MessageTransport.send('EDIT_MESSAGE', {
            messageId,
            content: newContent,
            timestamp: Date.now()
        }, { requiresAck: true, timeout: 5000 });

        if (result.success) {
            const messages = ChatManager.getMessages();
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages[idx].content = SecurityUtils.escapeHtml(newContent);
                messages[idx].edited = true;
                messages[idx].editedAt = new Date().toISOString();
                
                if (ChatManager.getActiveChat()) {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                }
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
        if (!BootController.isReady() && !SessionManager.isDegraded()) return false;

        if (forEveryone) {
            const result = await MessageTransport.send('DELETE_MESSAGE', {
                messageId,
                forEveryone,
                timestamp: Date.now()
            }, { requiresAck: true, timeout: 5000 });

            if (result.success) {
                const messages = ChatManager.getMessages();
                const idx = messages.findIndex(m => m.id === messageId);
                if (idx !== -1) {
                    messages[idx].deleted = true;
                    messages[idx].deletedAt = new Date().toISOString();
                    
                    if (ChatManager.getActiveChat()) {
                        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                    }
                }
                return true;
            }
        } else {
            const messages = ChatManager.getMessages();
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages.splice(idx, 1);
                
                if (ChatManager.getActiveChat()) {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                }
                return true;
            }
        }
        
        return false;
    }

    async function markChatAsRead(chatId) {
        if (!BootController.isReady() && !SessionManager.isDegraded()) return false;

        const result = await MessageTransport.send('MARK_READ', {
            chatId,
            timestamp: Date.now()
        }, { requiresAck: false });

        const chats = ChatManager.getChats();
        const idx = chats.findIndex(c => c.id === chatId);
        if (idx !== -1) {
            chats[idx].unreadCount = 0;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
        }

        return true;
    }

    async function addReaction(messageId, emoji, silent = false) {
        if (!BootController.isReady() && !SessionManager.isDegraded()) return false;

        const messages = ChatManager.getMessages();
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) return false;

        if (!messages[idx].reactions) messages[idx].reactions = {};

        const userId = SessionManager.getUserId();
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

        if (ChatManager.getActiveChat()) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
        }

        if (!silent) {
            await MessageTransport.send('ADD_REACTION', {
                messageId,
                emoji,
                add: userIndex === -1,
                timestamp: Date.now()
            }, { requiresAck: false });
        }

        return userIndex > -1 ? 'removed' : 'added';
    }

    async function toggleBlockUser(friendId, block) {
        if (!BootController.isReady() && !SessionManager.isDegraded()) return false;

        const blockedUsers = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);

        if (block) {
            if (!blockedUsers.includes(friendId)) blockedUsers.push(friendId);
        } else {
            const index = blockedUsers.indexOf(friendId);
            if (index > -1) blockedUsers.splice(index, 1);
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, blockedUsers);

        const chats = ChatManager.getChats();
        chats.forEach(chat => {
            if (chat.friendId === friendId) chat.blocked = block;
        });

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });

        await MessageTransport.send('BLOCK_USER', {
            friendId,
            block,
            timestamp: Date.now()
        }, { requiresAck: false });

        return true;
    }

    async function toggleArchiveChat(chatId, archive) {
        if (!BootController.isReady() && !SessionManager.isDegraded()) return false;

        const archivedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);

        if (archive) {
            if (!archivedChats.includes(chatId)) archivedChats.push(chatId);
        } else {
            const index = archivedChats.indexOf(chatId);
            if (index > -1) archivedChats.splice(index, 1);
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, archivedChats);

        const chats = ChatManager.getChats();
        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].archived = archive;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
            return true;
        }

        return false;
    }

    async function toggleReadOnly(chatId, readOnly) {
        if (!BootController.isReady() && !SessionManager.isDegraded()) return false;

        const chats = ChatManager.getChats();
        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].readOnly = readOnly;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
            return true;
        }
        
        return false;
    }

    async function clearChatHistory(chatId) {
        if (!BootController.isReady() && !SessionManager.isDegraded()) return false;

        SafeStorage.remove(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`);

        const chats = ChatManager.getChats();
        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].lastMessage = '';
            chats[idx].unreadCount = 0;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
        }

        if (ChatManager.getActiveChat()?.id === chatId) {
            ChatManager._messages = [];
        }

        return true;
    }

    async function voteInPoll(messageId, optionIndex) {
        if (!BootController.isReady() && !SessionManager.isDegraded()) return false;

        const messages = ChatManager.getMessages();
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) return false;

        const poll = messages[idx];
        if (!poll.options || !Array.isArray(poll.options)) return false;

        const userId = SessionManager.getUserId();
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

        if (ChatManager.getActiveChat()) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
        }

        await MessageTransport.send('VOTE_POLL', {
            messageId,
            optionIndex,
            timestamp: Date.now()
        }, { requiresAck: false });

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
        return !!(message && typeof message === 'object' && message.type);
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
        return !!(data && typeof data === 'object' && (data.user || data.token));
    }

    function getData(type) {
        switch (type) {
            case 'friendsList': return FriendManager.getFriends();
            case 'groupsList': return [];
            case 'chatHistory': return ChatManager.getMessages();
            case 'notifications': return [];
            case 'settings': return SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
            default: return null;
        }
    }

    function updateData(type, payload) {
        switch (type) {
            case 'friendsList':
                payload.forEach(friend => FriendManager.updateFriend(friend));
                break;
            case 'chatHistory':
                payload.forEach(msg => ChatManager.addMessage(msg));
                break;
            case 'settings':
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, payload);
                break;
            default: return false;
        }
        return true;
    }

    function isCoreReady() {
        return BootController.isReady();
    }

    function getConnectionHealth() {
        return {
            parentReady: ParentAuthority.isParentReady(),
            hasParentAuthority: ParentAuthority.hasAuthority(),
            parentVersion: ParentAuthority.getParentVersion(),
            connectionQuality: 'parent-managed',
            handshake: { state: SessionManager.getState(), version: VERSION },
            bootComplete: BootController.isReady(),
            sessionValid: SessionManager.isAuthenticated(),
            sessionAuthoritative: SessionManager.hasParentAuthority(),
            tokenValid: TokenAuthority.hasToken(),
            wsState: 'parent-managed',
            pendingMessages: MessageLifecycle.getPendingCount(),
            queuedMessages: MessageTransport.getStats().queued,
            uptime: 0,
            timestamp: Date.now()
        };
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
            reporterId: SessionManager.getUserId() || 'unknown',
            timestamp: new Date().toISOString()
        };

        const reports = SafeStorage.getJSON('reports', []);
        reports.push(reportData);
        SafeStorage.setJSON('reports', reports);

        if (BootController.isReady() || SessionManager.isDegraded()) {
            MessageTransport.send('SUBMIT_REPORT', reportData, { requiresAck: false });
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

        searchResults = ChatManager.getMessages().filter(msg => 
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
            if ((!BootController.isReady() && !SessionManager.isDegraded()) || isSyncing) return;

            isSyncing = true;
            try {
                await Promise.race([
                    Promise.all([
                        FriendManager.loadFriends().catch(() => {}),
                        ChatManager.loadChats().catch(() => {})
                    ]),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
            } catch (error) {
            } finally {
                isSyncing = false;
            }
        }, 60000);

        let saveInterval = setInterval(() => {
            if (ChatManager.getActiveChat()) {
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, ChatManager.getMessages());
            }
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats: ChatManager.getChats(), timestamp: Date.now() });
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
        if (!navigator.onLine || offlineQueue.length === 0 || (!BootController.isReady() && !SessionManager.isDegraded())) return;

        const failedMessages = [];

        for (const message of offlineQueue) {
            const result = await MessageLifecycle.sendMessage(message.content, {
                type: message.type,
                attachment: message.attachment,
                chatId: message.chatId
            });

            if (!result || !result.success) {
                failedMessages.push(message);
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        offlineQueue = failedMessages;
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
    }

    function loadMultiSendChats() {
        return ChatManager.getChats().filter(chat => 
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
        if (SessionManager.getState() === SessionManager.ERROR || SessionManager.getState() === SessionManager.DEGRADED) {
            SessionManager.transition(SessionManager.REGISTERING, 'manual-retry');
            handshakeInitiated = false;
        }
    }

    function renderMessages() {
        window.dispatchEvent(new CustomEvent('renderMessages', {
            detail: { 
                messages: ChatManager.getMessages(), 
                currentChat: ChatManager.getActiveChat(), 
                currentUser: SessionManager.getUser() 
            }
        }));
    }

    function renderChatsList() {
        window.dispatchEvent(new CustomEvent('renderChatsList', {
            detail: { 
                chats: ChatManager.getChats(), 
                currentChat: ChatManager.getActiveChat(), 
                currentCategory, 
                messageDrafts 
            }
        }));
    }

    function renderContactsList() {
        window.dispatchEvent(new CustomEvent('renderContactsList', {
            detail: { contacts: FriendManager.getFriends() }
        }));
    }

    function markMessageAsViewed(messageId) {}

    function initializeAudioWaveforms() {}

    function viewMedia(url, fileName) {
        window.open(url, '_blank');
        return { url, fileName };
    }

    function playVideo(url) {
        window.open(url, '_blank');
        return url;
    }

    function playAudio(messageId, url, duration) {
        try {
            if (activeAudioElement) {
                activeAudioElement.pause();
            }
            
            const audio = new Audio(url);
            activeAudioElement = audio;
            audio.play();
            
            audio.onended = () => {
                if (activeAudioElement === audio) {
                    activeAudioElement = null;
                }
            };
            
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
        if (activeAudioElement) {
            activeAudioElement.pause();
            activeAudioElement = null;
        }
        audioPlayers.clear();
    }

    function syncChatList() {
        return ChatManager.loadChats();
    }

    function updateUnreadCounts() {
        return 0;
    }

    function updateTypingIndicator(isTyping) {
        if (!currentChat) return false;
        
        MessageTransport.send(isTyping ? MESSAGE_TYPES.TYPING_START : MESSAGE_TYPES.TYPING_STOP, {
            chatId: currentChat.id,
            timestamp: Date.now()
        }, { requiresAck: false });
        
        return true;
    }

    // =============================================
    // MAIN INITIALIZATION - DEFERRED, NO AUTO-BOOT
    // =============================================
    async function initialize() {
        if (BootController.isReady()) return;
        
        Logger.once('INIT', `🚀 Messages Core v${VERSION} (${ENV.isLocal ? 'LOCAL' : ENV.isRender ? 'RENDER' : 'PRODUCTION'})`);
        
        try {
            await SessionManager.transition(SessionManager.WAIT_PARENT, 'starting');
            await SessionManager.init();
            
            // BootController already sent IFRAME_INIT
            
            // Try to load cached user for UI only
            const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (cachedUser) {
                const fallbackSession = {
                    user: cachedUser,
                    token: null,
                    userId: cachedUser.id,
                    authenticated: false
                };
                SessionManager.setSession(fallbackSession, false);
                Logger.once('INIT', 'Loaded cached user for UI');
            }
            
            // Wait for boot
            await BootController.waitForBoot();
            
            // Load cached data
            loadCachedData();
            
            // Initialize UI
            await initializeUI();
            
            // Load friends and chats in background
            FriendManager.loadFriends().catch(() => {});
            ChatManager.loadChats().catch(() => {});
            
            Logger.success('INIT', '✅ Messages Core ready');
            
        } catch (error) {
            Logger.error('INIT', 'Fatal initialization error', error);
        }
    }

    function loadCachedData() {
        try {
            const cachedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cachedChats?.chats) {
                cachedChats.chats.forEach(chat => {
                    if (!ChatManager._chatsMap.has(chat.id)) {
                        ChatManager._chats.push(chat);
                        ChatManager._chatsMap.set(chat.id, chat);
                    }
                });
            }

            const cachedDrafts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
            if (cachedDrafts) {
                messageDrafts = cachedDrafts;
            }

            const cachedOffline = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
            if (cachedOffline) {
                offlineQueue = cachedOffline;
            }
        } catch (error) {
            Logger.warn('Init', 'Error loading cached data', error);
        }
    }

    // =============================================
    // NO AUTO-BOOT ON DOMContentLoaded
    // BootController sends IFRAME_INIT immediately
    // Parent will trigger PARENT_READY
    // =============================================

    window.addEventListener('beforeunload', () => {
        if (recordingTimer) clearInterval(recordingTimer);
        if (typingTimeout) clearTimeout(typingTimeout);
        cleanupAudioPlayers();
        saveMessageDraft();
        saveUIState();

        if (ChatManager.getActiveChat()) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, ChatManager.getMessages());
        }
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats: ChatManager.getChats(), timestamp: Date.now() });
        
        WSController.disconnect();
    });

    // Set window flags
    window.__MESSAGES_CORE_READY__ = false;
    
    BootController.waitForBoot().then(() => {
        window.__MESSAGES_CORE_READY__ = true;
    });

    // =============================================
    // EXPORT
    // =============================================
    const messagesCore = {
        VERSION,
        MESSAGE_TYPES,
        LOCAL_STORAGE_KEYS,
        SOURCE_IFRAME,
        FRAME_ID,
        ParentAuthority,
        SessionManager,
        TokenAuthority,
        FriendManager,
        ChatManager,
        WSController,
        MessageLifecycle,
        MessageTransport,
        AckController,
        SecurityUtils,
        SafeStorage,
        BootController,
        
        getConnectionHealth,
        
        currentUser, currentChat, currentFriend, messages, chats, contacts,
        isRecording, mediaRecorder, recordingTimer, recordingStartTime,
        typingTimeout, isTyping, selectedMessage, currentThread, chatThemes,
        emojiPicker, isSyncing, audioPlayers, editingMessageId, replyToMessage,
        currentCategory, activeFormattingTags, activeAudioElement, scheduledMessages,
        offlineQueue, messageDrafts, silentReactionsEnabled, readOnlyMode,
        currentAttachment, searchResults, currentSearchIndex, multiSendSelectedChats,
        recordingCancelTimeout, dragStartY, isDraggingToCancel,

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

        getCurrentSession,
        requestSessionUpdate,
        initChildSession,
        isCoreReady,
        sendToParent,
        
        apiRequest,
        fetchData,
        APIClient,
        
        getData,
        updateData,
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

        validateMessageStructure,
        validateMessagePayload,
        validateMessageBeforeSend,
        validateData,
        validateSessionData,

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

        showMessageActions,
        closeMessageActions,
        handleMessageAction,
        showForwardMessage,
        toggleStarMessage,
        showMessageInfo,
        showReportModal,
        submitReport,

        initEmojiPicker,
        toggleEmojiPicker,
        closeEmojiPickerOnClickOutside,

        toggleFormattingToolbar,
        closeFormattingToolbarOnClickOutside,
        applyFormatting,

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

        openThread,
        showChatInfo,

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

        setupScrollDetection,
        updateJumpButtonVisibility,
        jumpToLatest,
        searchInChat,
        highlightText,
        highlightSearchResults,
        removeSearchHighlights,
        navigateToSearchResult,
        scrollToMessage,

        startRecording,
        stopRecording,
        cancelRecording,

        startBackgroundSync,
        playNotificationSound,
        checkScheduledMessages,
        checkOfflineQueue,
        loadMultiSendChats,
        updateMultiSendSelection,
        saveUIState,
        getUserFromURL,
        openChatPanel,

        showReconnectState,
        hideReconnectState,
        retryConnection,

        renderMessages,
        renderChatsList,
        renderContactsList,
        markMessageAsViewed,

        initializeAudioWaveforms,
        viewMedia,
        playVideo,
        playAudio,
        downloadFile,
        openLocation,
        cleanupAudioPlayers,

        syncChatList,
        updateUnreadCounts,
        updateTypingIndicator,
        
        registerWithParent,
        registrationSent: () => registrationSent
    };

    window.messagesCore = messagesCore;

    if (window.location.hash === '#debug' || localStorage.getItem('kynecta_debug') === 'true') {
        window.__IFRAME_DEBUG__ = true;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = messagesCore;
    }
})();