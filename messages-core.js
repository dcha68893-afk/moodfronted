// =============================================
// MESSAGES-CORE.js - DETERMINISTIC STATE MACHINE v5.0.0
// STABILIZED REAL-TIME MESSAGING ENGINE
// PRODUCTION-READY WITH SESSION GATES & ACK PROTOCOL
// =============================================

(function() {
    'use strict';

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
                return 'https://moodchat-fy56.onrender.com';
            }
            return '';
        }
    };

    // =============================================
    // CONSTANTS & CONFIGURATION
    // =============================================
    const VERSION = '5.0.0';
    const APP_NAME = 'kynecta-messages';
    const SOURCE_IFRAME = 'iframe';
    const FRAME_ID = 'messagesIframe';
    
    const PROTOCOL = {
        VERSION: 'KYN-3.0'
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
        REQUEST_TOKEN: 'REQUEST_TOKEN',
        
        // Friends
        GET_FRIEND_LIST: 'GET_FRIEND_LIST',
        FRIEND_LIST_RESPONSE: 'FRIEND_LIST_RESPONSE',
        FRIEND_UPDATED: 'FRIEND_UPDATED',
        FRIEND_ONLINE: 'FRIEND_ONLINE',
        FRIEND_OFFLINE: 'FRIEND_OFFLINE',
        
        // Chats
        CREATE_CHAT: 'CREATE_CHAT',
        CHAT_CREATED: 'CHAT_CREATED',
        GET_CHAT_HISTORY: 'GET_CHAT_HISTORY',
        CHAT_HISTORY_RESPONSE: 'CHAT_HISTORY_RESPONSE',
        
        // Messages
        SEND_MESSAGE: 'SEND_MESSAGE',
        MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
        MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
        MESSAGE_READ: 'MESSAGE_READ',
        TYPING_START: 'TYPING_START',
        TYPING_STOP: 'TYPING_STOP',
        
        // API
        API_REQUEST: 'API_REQUEST',
        API_RESPONSE: 'API_RESPONSE',
        
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
        LOGOUT: 'LOGOUT',
        NAVIGATE: 'NAVIGATE',
        PING: 'PING',
        PONG: 'PONG'
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

    // =============================================
    // LOG LEVELS - SHOW INITIALIZATION IN CONSOLE
    // =============================================
    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };
    
    const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

    // =============================================
    // SILENT LOGGER WITH STATE VISIBILITY
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
                console.log(`[${module}] ℹ️ ${message}`, data || '');
            }
        },
        
        success(module, message, data = null) {
            const key = `${module}:${message}`;
            if (!this._success.has(key)) {
                console.log(`[${module}] ✅ ${message}`, data || '');
                this._success.add(key);
                setTimeout(() => this._success.delete(key), 5000);
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
        
        state(module, oldState, newState, reason = '') {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
                const arrow = oldState === newState ? '=' : '→';
                console.log(`[${module}] 📊 ${oldState} ${arrow} ${newState}${reason ? ` (${reason})` : ''}`);
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
    // DETERMINISTIC SESSION MANAGER - PROMISE-BASED GATE
    // =============================================
    const SessionManager = {
        // States
        UNINITIALIZED: 'UNINITIALIZED',
        REGISTERING: 'REGISTERING',
        REGISTERED: 'REGISTERED',
        SESSION_PENDING: 'SESSION_PENDING',
        SESSION_ACTIVE: 'SESSION_ACTIVE',
        READY: 'READY',
        ERROR: 'ERROR',
        
        _state: 'UNINITIALIZED',
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
        
        _initPromise: null,
        _initResolve: null,
        
        init() {
            if (this._initPromise) return this._initPromise;
            
            this._initPromise = new Promise((resolve) => {
                this._initResolve = resolve;
                this._createReadyPromise();
                this._loadFromCache();
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
        
        _loadFromCache() {
            try {
                const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE);
                if (cached && cached.expiresAt > Date.now()) {
                    this._session = cached;
                    this._token = cached.token;
                    this._user = cached.user;
                    this._userId = cached.userId || cached.user?.id;
                    this._authenticated = true;
                    Logger.info('SessionManager', 'Session loaded from cache');
                }
            } catch (e) {}
        },
        
        async transition(newState, reason = '') {
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
                }
                
                if (newState === this.ERROR && !this._readyResolved) {
                    this._readyReject?.(new Error('Session error: ' + reason));
                    this._readyResolved = true;
                }
                
                return true;
            } finally {
                this._stateLock = false;
            }
        },
        
        _isValidTransition(from, to) {
            const validTransitions = {
                [this.UNINITIALIZED]: [this.REGISTERING, this.ERROR],
                [this.REGISTERING]: [this.REGISTERED, this.ERROR],
                [this.REGISTERED]: [this.SESSION_PENDING, this.ERROR],
                [this.SESSION_PENDING]: [this.SESSION_ACTIVE, this.ERROR],
                [this.SESSION_ACTIVE]: [this.READY, this.ERROR],
                [this.READY]: [this.ERROR, this.SESSION_PENDING],
                [this.ERROR]: [this.REGISTERING]
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
        
        setSession(session) {
            this._session = session;
            this._token = session?.token;
            this._user = session?.user;
            this._userId = session?.userId || session?.user?.id;
            this._authenticated = !!(session?.user && session?.token);
            
            if (this._authenticated) {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
                    ...session,
                    expiresAt: session.expiresAt || Date.now() + 3600000
                });
                
                if (this._state === this.SESSION_PENDING) {
                    this.transition(this.SESSION_ACTIVE, 'session-received');
                }
            }
            
            this._notifyListeners(this._state, this._state, 'session-updated');
        },
        
        getSession() {
            return this._session ? { ...this._session } : null;
        },
        
        getToken() {
            return this._token;
        },
        
        getUser() {
            return this._user ? { ...this._user } : null;
        },
        
        getUserId() {
            return this._userId;
        },
        
        isAuthenticated() {
            return this._authenticated;
        },
        
        getState() {
            return this._state;
        },
        
        isReady() {
            return this._state === this.READY;
        },
        
        isAtLeast(state) {
            const stateOrder = [
                this.UNINITIALIZED,
                this.REGISTERING,
                this.REGISTERED,
                this.SESSION_PENDING,
                this.SESSION_ACTIVE,
                this.READY
            ];
            
            const currentIndex = stateOrder.indexOf(this._state);
            const targetIndex = stateOrder.indexOf(state);
            
            return currentIndex >= targetIndex && this._state !== this.ERROR;
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
        
        clear() {
            this._session = null;
            this._token = null;
            this._user = null;
            this._userId = null;
            this._authenticated = false;
            this._readyResolved = false;
            this._createReadyPromise();
            
            SafeStorage.remove(LOCAL_STORAGE_KEYS.SESSION_CACHE);
            SafeStorage.remove(LOCAL_STORAGE_KEYS.USER_CACHE);
            
            Logger.info('SessionManager', 'Session cleared');
        },
        
        getTransitionHistory() {
            return [...this._transitionHistory];
        }
    };

    // =============================================
    // TOKEN AUTHORITY - PROMISE-BASED
    // =============================================
    const TokenAuthority = {
        _token: null,
        _tokenPromise: null,
        _tokenResolve: null,
        _tokenReject: null,
        _tokenReceived: false,
        _waitingForToken: false,
        _tokenTimeout: null,
        _maxWaitTime: 10000,
        
        init() {
            this._resetPromise();
            return this;
        },
        
        _resetPromise() {
            this._tokenPromise = new Promise((resolve, reject) => {
                this._tokenResolve = resolve;
                this._tokenReject = reject;
            });
            
            if (this._tokenTimeout) clearTimeout(this._tokenTimeout);
        },
        
        waitForToken(timeout = 10000) {
            if (this._tokenReceived) {
                return Promise.resolve(this._token);
            }
            
            Logger.info('TokenAuthority', 'Waiting for token');
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
            
            if (this._tokenTimeout) {
                clearTimeout(this._tokenTimeout);
                this._tokenTimeout = null;
            }
            
            if (this._tokenResolve) {
                this._tokenResolve(token);
                this._tokenResolve = null;
                this._tokenReject = null;
            }
            
            Logger.success('TokenAuthority', `Token received from ${source}`);
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
    // ACK CONTROLLER - PROPER REQUEST CORRELATION
    // =============================================
    const AckController = {
        _pendingAcks: new Map(),
        _processedIds: new Set(),
        _maxRetries: 3,
        _baseTimeout: 7000,
        _retryBackoff: 1.5,
        _maxPending: 1000,
        
        register(requestId, message, sendFn, options = {}) {
            if (this._processedIds.has(requestId)) {
                Logger.debug('AckController', `Duplicate request: ${requestId}`);
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
            
            Logger.debug('AckController', `Registered ${message.type} (${requestId})`);
            
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
            Logger.debug('AckController', `Retry ${record.attempts}/${record.maxRetries} for ${record.requestId} in ${delay}ms`);
            
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
            
            record.status = 'acknowledged';
            record.ackTime = Date.now();
            
            this._cleanupTimers(record);
            this._pendingAcks.delete(requestId);
            this._processedIds.add(requestId);
            
            Logger.debug('AckController', `ACK received for ${requestId} (${record.message.type})`);
            
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
    // MESSAGE TRANSPORT WITH PROPER ACK
    // =============================================
    const MessageTransport = {
        _sequence: 0,
        _outboundQueue: [],
        _parentOrigin: window.location.origin,
        _maxQueueSize: 100,
        _processingQueue: false,
        
        init() {
            setInterval(() => this._processQueue(), 5000);
            setInterval(() => AckController.cleanup(), 60000);
            return this;
        },
        
        send(type, payload = {}, options = {}) {
            return new Promise(async (resolve) => {
                if (!SessionManager.isReady() && !options.bypassReady) {
                    try {
                        await SessionManager.whenReady();
                    } catch (e) {
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
                        maxRetries: options.maxRetries,
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
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE, this._outboundQueue);
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
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE, this._outboundQueue);
            
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
    // SECURITY UTILITIES
    // =============================================
    const SecurityUtils = {
        allowedOrigins: new Set([
            window.location.origin,
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com'
        ]),

        messageIdCounter: 0,
        processedMessageIds: new Set(),
        replayWindow: 300000,

        initOriginTrust() {
            const hostname = window.location.hostname;
            this.allowedOrigins.add(`https://${hostname}`);
            this.allowedOrigins.add(`http://${hostname}`);
            this.allowedOrigins.add(window.location.origin);
            
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
    // MESSAGE FIREWALL
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
    // FRIEND MANAGER - CACHED FRIEND LIST
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
            if (cached && Array.isArray(cached.friends) && cached.timestamp > Date.now() - this._cacheTTL) {
                this._friends = cached.friends;
                this._rebuildMap();
                this._loaded = true;
                this._lastLoadTime = cached.timestamp;
                Logger.info('FriendManager', `Loaded ${this._friends.length} friends from cache`);
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
            Logger.info('FriendManager', 'Loading friends from parent');
            
            try {
                const result = await MessageTransport.send(MESSAGE_TYPES.GET_FRIEND_LIST, {
                    timestamp: Date.now(),
                    frameId: FRAME_ID
                }, { requiresAck: true, timeout: 5000 });
                
                if (result.success && result.ack?.friends) {
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
                
                if (this._friends.length > 0) {
                    Logger.warn('FriendManager', 'Using cached friends');
                    return this._friends;
                }
                
                return [];
            } catch (error) {
                Logger.error('FriendManager', 'Failed to load friends', error);
                
                if (this._friends.length > 0) {
                    return this._friends;
                }
                
                return [];
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
    // CHAT MANAGER - ACTIVE CHAT STATE
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
            if (!SessionManager.isReady()) {
                try {
                    await SessionManager.whenReady();
                } catch (e) {
                    return this._chats;
                }
            }
            
            try {
                const result = await MessageTransport.send(MESSAGE_TYPES.GET_CHAT_HISTORY, {
                    timestamp: Date.now(),
                    frameId: FRAME_ID,
                    all: true
                }, { requiresAck: true, timeout: 5000 });
                
                if (result.success && result.ack?.chats) {
                    this._chats = result.ack.chats;
                    this._rebuildMap();
                    
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, {
                        chats: this._chats,
                        timestamp: Date.now()
                    });
                    
                    this._notifySubscribers();
                }
            } catch (error) {
                Logger.warn('ChatManager', 'Failed to load chats', error);
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
                    }, { requiresAck: true, timeout: 5000 });
                    
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
            
            if (!SessionManager.isReady()) {
                return this._messages;
            }
            
            try {
                const result = await MessageTransport.send(MESSAGE_TYPES.GET_CHAT_HISTORY, {
                    chatId,
                    timestamp: Date.now()
                }, { requiresAck: true, timeout: 5000 });
                
                if (result.success && result.ack?.messages) {
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
    // WEBSOCKET CONTROLLER - SINGLE INSTANCE
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
        _maxReconnectAttempts: 5,
        _baseDelay: 1000,
        _maxDelay: 30000,
        _heartbeatInterval: null,
        _pendingMessages: [],
        _authenticated: false,
        _url: null,
        _messageHandlers: new Map(),
        _initialized: false,
        
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
            if (this._state === this.WS_READY) {
                return Promise.resolve(true);
            }
            
            if (this._state === this.WS_CONNECTING || this._state === this.WS_AUTHENTICATING) {
                if (this._connectPromise) return this._connectPromise;
            }
            
            this._url = url;
            this._state = this.WS_CONNECTING;
            
            this._connectPromise = new Promise((resolve, reject) => {
                this._connectResolve = resolve;
                this._connectReject = reject;
            });
            
            try {
                const token = await TokenAuthority.waitForToken();
                Logger.info('WSController', 'Token available, connecting');
                
                this._ws = new WebSocket(url);
                
                this._ws.onopen = () => {
                    Logger.success('WSController', 'WebSocket connected');
                    this._state = this.WS_CONNECTED;
                    this._authenticate(token);
                };
                
                this._ws.onmessage = (event) => {
                    this._handleMessage(event);
                };
                
                this._ws.onerror = (error) => {
                    Logger.error('WSController', 'WebSocket error', error);
                    this._state = this.WS_ERROR;
                    
                    if (this._connectReject) {
                        this._connectReject(error);
                        this._connectResolve = null;
                        this._connectReject = null;
                    }
                    
                    this._scheduleReconnect();
                };
                
                this._ws.onclose = () => {
                    Logger.warn('WSController', 'WebSocket closed');
                    
                    if (this._state === this.WS_READY || this._state === this.WS_CONNECTED || 
                        this._state === this.WS_AUTHENTICATING) {
                        this._state = this.WS_CLOSED;
                        this._scheduleReconnect();
                    }
                    
                    this._cleanup();
                };
                
            } catch (error) {
                Logger.error('WSController', 'Connection failed', error);
                this._connectReject?.(error);
                this._connectResolve = null;
                this._connectReject = null;
                this._scheduleReconnect();
            }
            
            return this._connectPromise;
        },
        
        _authenticate(token) {
            if (this._state !== this.WS_CONNECTED) return;
            
            this._state = this.WS_AUTHENTICATING;
            Logger.info('WSController', 'Authenticating');
            
            const authMessage = {
                type: 'auth',
                token: token,
                frameId: FRAME_ID,
                timestamp: Date.now()
            };
            
            try {
                this._ws.send(JSON.stringify(authMessage));
                
                this._authTimeout = setTimeout(() => {
                    if (this._state === this.WS_AUTHENTICATING) {
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
                
                if (data.type === 'auth_success' && this._state === this.WS_AUTHENTICATING) {
                    clearTimeout(this._authTimeout);
                    this._state = this.WS_READY;
                    this._authenticated = true;
                    
                    Logger.success('WSController', 'Authenticated');
                    
                    if (this._connectResolve) {
                        this._connectResolve(true);
                        this._connectResolve = null;
                        this._connectReject = null;
                    }
                    
                    this._startHeartbeat();
                    this._flushPendingMessages();
                    
                    SessionManager.transition(SessionManager.READY, 'websocket-ready');
                    
                    return;
                }
                
                if (data.type === 'pong') {
                    this._handleHeartbeatResponse();
                    return;
                }
                
                const handler = this._messageHandlers.get(data.type);
                if (handler) {
                    handler(data);
                }
                
            } catch (error) {
                Logger.error('WSController', 'Message parse error', error);
            }
        },
        
        send(data) {
            if (this._state === this.WS_READY && this._ws && this._ws.readyState === WebSocket.OPEN) {
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
            
            if (this._pendingMessages.length > 100) {
                this._pendingMessages.shift();
            }
        },
        
        _flushPendingMessages() {
            if (this._state !== this.WS_READY) return;
            
            const now = Date.now();
            const oneHour = 3600000;
            
            this._pendingMessages = this._pendingMessages.filter(msg => {
                if (now - msg.timestamp > oneHour) {
                    return false;
                }
                
                try {
                    this._ws.send(JSON.stringify(msg.data));
                    return false;
                } catch (error) {
                    msg.attempts++;
                    return msg.attempts < 3;
                }
            });
        },
        
        _startHeartbeat() {
            if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
            
            this._heartbeatInterval = setInterval(() => {
                if (this._state === this.WS_READY && this._ws && this._ws.readyState === WebSocket.OPEN) {
                    try {
                        this._ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                        
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
                return;
            }
            
            this._reconnectAttempts++;
            
            const delay = Math.min(
                this._baseDelay * Math.pow(1.5, this._reconnectAttempts - 1),
                this._maxDelay
            );
            
            Logger.warn('WSController', `Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);
            
            this._state = this.WS_RECONNECTING;
            
            setTimeout(() => {
                if (SessionManager.isReady()) {
                    Logger.info('WSController', 'Reconnecting...');
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
            Logger.info('WSController', 'Disconnected');
        },
        
        getState() {
            return this._state;
        },
        
        isReady() {
            return this._state === this.WS_READY;
        }
    }.init();

    // =============================================
    // MESSAGE LIFECYCLE MANAGER
    // =============================================
    const MessageLifecycle = {
        _pendingMessages: new Map(),
        _optimisticMessages: new Map(),
        
        async sendMessage(content, options = {}) {
            if (!SessionManager.isReady()) {
                try {
                    await SessionManager.whenReady();
                } catch (e) {
                    return { success: false, error: 'Session not ready' };
                }
            }
            
            const activeChat = ChatManager.getActiveChat();
            if (!activeChat) {
                return { success: false, error: 'No active chat' };
            }
            
            const messageId = options.id || SecurityUtils.generateMessageId();
            const requestId = SecurityUtils.generateRequestId();
            const timestamp = Date.now();
            
            const optimisticMessage = {
                id: messageId,
                requestId,
                chatId: activeChat.id,
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
                chatId: activeChat.id,
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
                maxRetries: 3,
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
                
                if (WSController.isReady()) {
                    WSController.send({
                        type: 'send_message',
                        messageId,
                        chatId: activeChat.id,
                        content,
                        timestamp
                    });
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
                id: messageId
            });
        },
        
        getPendingCount() {
            return this._optimisticMessages.size;
        }
    };

    // =============================================
    // API CLIENT
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
            
            if (SessionManager.isReady() && options.useParent !== false) {
                return this._requestViaParent(endpoint, options, requestId, headers);
            }
            
            return this._requestDirect(endpoint, options, headers, requestId);
        },
        
        async _requestViaParent(endpoint, options, requestId, headers) {
            return new Promise((resolve) => {
                const timeout = options.timeout || 30000;
                
                const timer = setTimeout(() => {
                    if (this._pendingRequests.has(requestId)) {
                        Logger.debug('APIClient', `Parent timeout, falling back to direct: ${endpoint}`);
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
    // PARENT MESSAGE HANDLER
    // =============================================
    const ParentMessageHandler = {
        init() {
            window.addEventListener('message', this._handleMessage.bind(this));
            return this;
        },
        
        _handleMessage(event) {
            if (!SecurityUtils.validateOrigin(event.origin)) return;
            
            const message = MessageFirewall.parse(event);
            if (!message) return;
            
            switch (message.type) {
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
                    
                case MESSAGE_TYPES.ACK:
                    // Already handled by MessageFirewall
                    break;
                    
                case MESSAGE_TYPES.ERROR:
                    Logger.error('Parent', 'Error from parent', message.payload);
                    break;
                    
                default:
                    Logger.debug('Parent', `Unhandled message: ${message.type}`);
            }
        },
        
        _handleSessionData(payload) {
            if (!payload) return;
            
            Logger.info('Parent', 'Session data received');
            
            const session = {
                user: payload.user,
                token: payload.token || payload.accessToken,
                userId: payload.userId || payload.user?.id,
                authenticated: !!(payload.user && (payload.token || payload.accessToken)),
                expiresAt: payload.expiresAt || Date.now() + 3600000
            };
            
            SessionManager.setSession(session);
            
            if (session.token) {
                TokenAuthority.receiveToken(session.token, 'parent');
            }
            
            if (session.authenticated && SessionManager.getState() === SessionManager.SESSION_PENDING) {
                SessionManager.transition(SessionManager.SESSION_ACTIVE, 'session-received');
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
    // REGISTRATION WITH PARENT
    // =============================================
    let registrationSent = false;
    let registrationPromise = null;

    async function registerWithParent() {
        if (registrationSent && registrationPromise) {
            return registrationPromise;
        }
        
        if (!window.parent || window.parent === window) {
            Logger.warn('Registration', 'No parent window');
            return { success: false, reason: 'no-parent' };
        }
        
        registrationSent = true;
        
        registrationPromise = new Promise((resolve) => {
            Logger.info('Registration', 'Registering with parent');
            
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
                    Logger.success('Registration', 'Registration successful');
                    SessionManager.transition(SessionManager.REGISTERED, 'registration-ack');
                } else {
                    Logger.warn('Registration', 'Registration timeout - continuing');
                    SessionManager.transition(SessionManager.REGISTERED, 'assumed');
                }
                resolve(result);
            }).catch(() => {
                Logger.warn('Registration', 'Registration failed - continuing');
                SessionManager.transition(SessionManager.REGISTERED, 'assumed');
                resolve({ success: true, assumed: true });
            });
        });
        
        return registrationPromise;
    }

    // =============================================
    // SESSION ACQUISITION
    // =============================================
    async function acquireSession() {
        Logger.info('Session', 'Acquiring session');
        
        SessionManager.transition(SessionManager.SESSION_PENDING, 'acquiring');
        
        try {
            const result = await MessageTransport.send(MESSAGE_TYPES.REQUEST_SESSION, {
                timestamp: Date.now(),
                frameId: FRAME_ID
            }, { requiresAck: true, timeout: 5000 });
            
            if (result.success && result.ack?.session) {
                SessionManager.setSession(result.ack.session);
                Logger.success('Session', 'Session acquired');
                return true;
            }
            
            if (SessionManager.isAuthenticated()) {
                Logger.info('Session', 'Using cached session');
                SessionManager.transition(SessionManager.SESSION_ACTIVE, 'cached');
                return true;
            }
            
            Logger.warn('Session', 'No session available');
            return false;
            
        } catch (error) {
            Logger.error('Session', 'Session acquisition failed', error);
            
            if (SessionManager.isAuthenticated()) {
                Logger.info('Session', 'Using cached session after error');
                SessionManager.transition(SessionManager.SESSION_ACTIVE, 'cached-fallback');
                return true;
            }
            
            return false;
        }
    }

    // =============================================
    // UI INITIALIZATION
    // =============================================
    async function initializeUI() {
        Logger.info('UI', 'Initializing UI');
        
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

    // Session state subscription
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
    });

    // =============================================
    // SETTERS (PRESERVED)
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

    // =============================================
    // EXPORTED FUNCTIONS (PRESERVED)
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
        return acquireSession();
    }

    function initChildSession() {
        return new Promise((resolve) => {
            if (SessionManager.isReady() && currentUser) {
                resolve({ user: currentUser, sessionData: SessionManager.getSession() });
            } else {
                const checkInterval = setInterval(() => {
                    if (SessionManager.isReady() && currentUser) {
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

        Logger.info('sendToMultipleChats', `Sent to ${successCount}/${chatIds.length} chats`);
        return successCount;
    }

    async function editMessage(messageId, newContent) {
        if (!SessionManager.isReady()) return false;

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
        if (!SessionManager.isReady()) return false;

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
        if (!SessionManager.isReady()) return false;

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
        if (!SessionManager.isReady()) return false;

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
        if (!SessionManager.isReady()) return false;

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
        if (!SessionManager.isReady()) return false;

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
        if (!SessionManager.isReady()) return false;

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
        if (!SessionManager.isReady()) return false;

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
        if (!SessionManager.isReady()) return false;

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
        return SessionManager.isReady();
    }

    function getConnectionHealth() {
        return {
            parentReady: true,
            connectionQuality: WSController.isReady() ? 'excellent' : 'unknown',
            handshake: { state: SessionManager.getState(), version: VERSION },
            sessionValid: SessionManager.isAuthenticated(),
            tokenValid: TokenAuthority.hasToken(),
            wsState: WSController.getState(),
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

        if (SessionManager.isReady()) {
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
            if (!SessionManager.isReady() || isSyncing) return;

            isSyncing = true;
            try {
                await FriendManager.loadFriends();
                await ChatManager.loadChats();
            } catch (error) {
            } finally {
                isSyncing = false;
            }
        }, 30000);

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
        if (!navigator.onLine || offlineQueue.length === 0 || !SessionManager.isReady()) return;

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
        if (SessionManager.getState() === SessionManager.ERROR) {
            SessionManager.transition(SessionManager.REGISTERING, 'manual-retry');
            initialize().catch(() => {});
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
    // MAIN INITIALIZATION
    // =============================================
    async function initialize() {
        Logger.info('Init', `🚀 Messages Core v${VERSION} (${ENV.isLocal ? 'LOCAL' : ENV.isRender ? 'RENDER' : 'PRODUCTION'})`);
        
        try {
            // UNINITIALIZED → REGISTERING
            await SessionManager.transition(SessionManager.REGISTERING, 'starting');
            
            // Initialize session manager
            await SessionManager.init();
            
            // Register with parent
            await registerWithParent();
            
            // REGISTERED → SESSION_PENDING
            await SessionManager.transition(SessionManager.SESSION_PENDING, 'registered');
            
            // Acquire session
            const sessionAcquired = await acquireSession();
            
            if (sessionAcquired) {
                // SESSION_PENDING → SESSION_ACTIVE
                await SessionManager.transition(SessionManager.SESSION_ACTIVE, 'session-acquired');
                
                // Wait for token if needed
                try {
                    const token = await TokenAuthority.waitForToken().catch(() => null);
                    if (token) {
                        Logger.success('Init', 'Token ready');
                    }
                } catch (e) {
                    Logger.warn('Init', 'Token not available, continuing');
                }
            }
            
            // Connect WebSocket
            if (TokenAuthority.hasToken()) {
                const wsUrl = ENV.isLocal ? 'ws://localhost:4000/ws' : 'wss://' + window.location.hostname + '/ws';
                WSController.connect(wsUrl).catch(() => {});
            }
            
            // SESSION_ACTIVE → READY
            await SessionManager.transition(SessionManager.READY, 'ready');
            
            // Load cached data
            loadCachedData();
            
            // Initialize UI
            await initializeUI();
            
            // Load friends (cached first)
            FriendManager.loadFriends().catch(() => {});
            ChatManager.loadChats().catch(() => {});
            
            Logger.success('Init', '✅ Messages Core ready');
            
            window.dispatchEvent(new CustomEvent('coreReady', {
                detail: {
                    authenticated: SessionManager.isAuthenticated(),
                    user: SessionManager.getUser(),
                    frameId: FRAME_ID,
                    state: SessionManager.getState(),
                    version: VERSION
                }
            }));
            
        } catch (error) {
            Logger.error('Init', 'Fatal initialization error', error);
            
            await SessionManager.transition(SessionManager.ERROR, error.message);
            
            window.dispatchEvent(new CustomEvent('coreReady', {
                detail: {
                    authenticated: false,
                    user: null,
                    error: error.message,
                    state: SessionManager.getState()
                }
            }));
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
    // START INITIALIZATION
    // =============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initialize, 50);
        });
    } else {
        setTimeout(initialize, 50);
    }

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
        
        // Session Manager
        SessionManager,
        
        // Token Authority
        TokenAuthority,
        
        // Friend Manager
        FriendManager,
        
        // Chat Manager
        ChatManager,
        
        // WS Controller
        WSController,
        
        // Message Lifecycle
        MessageLifecycle,
        MessageTransport,
        AckController,
        
        // Utilities
        SecurityUtils,
        SafeStorage,
        
        getConnectionHealth,
        
        // State (preserved)
        currentUser, currentChat, currentFriend, messages, chats, contacts,
        isRecording, mediaRecorder, recordingTimer, recordingStartTime,
        typingTimeout, isTyping, selectedMessage, currentThread, chatThemes,
        emojiPicker, isSyncing, audioPlayers, editingMessageId, replyToMessage,
        currentCategory, activeFormattingTags, activeAudioElement, scheduledMessages,
        offlineQueue, messageDrafts, silentReactionsEnabled, readOnlyMode,
        currentAttachment, searchResults, currentSearchIndex, multiSendSelectedChats,
        recordingCancelTimeout, dragStartY, isDraggingToCancel,

        // Setters (preserved)
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
        getCurrentSession,
        requestSessionUpdate,
        initChildSession,
        isCoreReady,
        sendToParent,
        
        // API
        apiRequest,
        fetchData,
        APIClient,
        
        // Data management
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
        
        // Registration
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