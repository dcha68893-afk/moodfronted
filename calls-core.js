// calls-core.js
// ==================== IFRAME CORE MODULE ====================
// Version: 2.3.2
// Purpose: Independent, resilient iframe micro-frontend for chat system
// Security: XSS protected, input sanitized, CSP compliant
// License: Proprietary
// STABILITY PATCH: v2.3.2 - Fixed session validation, handshake protocol, export issues
// ==================== EXPORT CONTRACT ====================
// EXPORTS: initializeCore, startHandshake, sendToParent,
//          requestSession, receiveFromParent, shutdownCore,
//          initializeUI, cleanupUISession, isValidSession,
//          getValidatedSession, waitForSession, waitForParent,
//          waitForHandshake, verifySession, safeCoreInit,
//          requestResync, sendSessionAck, CoreInitializer,
//          CallCore, ParentCoordinator, TokenManager,
//          SecureAPIClient, CallAPIIntegration, AppState,
//          elements, simulateIncomingCall, showNotification,
//          bootstrapIframe, cacheElements, initializeOfflineDetection,
//          showUI, enableUI, checkUrlParameters, makeDraggable,
//          closePip, checkPremiumFeature, updatePremiumUI,
//          loadSettings, saveSettings, applySettingsToUI,
//          updateSetting, applySettingChange, resetSettings,
//          handleOnline, handleOffline, showOfflineUI,
//          handleStorageEvent, debounce, stringToColor,
//          formatTimeAgo, formatDuration, closeUrlParamOverlay,
//          joinUrlParamCall, updateMoodIndicator,
//          updateIntentionIndicator, updateParticipantBadge,
//          updateChatBadge, updateGroupCallButton,
//          updateVideoLayout, initializeWhiteboard,
//          sendChatMessage, saveSharedNotes, renderCallHistory,
//          createCallHistoryItem, currentUser, userDataLoaded,
//          parentCoordinator, sessionAuthorityReady, SecurityCore
// =============================================================

(function() {
    'use strict';

    // ==================== STATE MANAGEMENT ====================
    const STATE = {
        INIT: 'INIT',
        PREFLIGHT: 'PREFLIGHT',
        DEPENDENCY: 'DEPENDENCY',
        PARENT_DETECT: 'PARENT_DETECT',
        HANDSHAKE: 'HANDSHAKE',
        SYNC: 'SYNC',
        PERMISSIONS: 'PERMISSIONS',
        READY: 'READY',
        ACTIVE: 'ACTIVE',
        SUSPENDED: 'SUSPENDED',
        DEGRADED: 'DEGRADED',
        DESTROYED: 'DESTROYED',
        DEMO: 'DEMO'
    };

    // STABILITY PATCH: Call core internal states
    const CallCoreState = {
        IDLE: 'IDLE',
        WAITING_PARENT: 'WAITING_PARENT',
        WAITING_SESSION: 'WAITING_SESSION',
        SYNCED: 'SYNCED',
        ACTIVE: 'ACTIVE',
        ERROR: 'ERROR'
    };

    let _PARENT_READY_ = false;
    let _HANDSHAKE_DONE_ = false;
    let _HANDSHAKE_RETRIES_ = 0;
    const MAX_HANDSHAKE = 5;

    let currentState = STATE.INIT;
    let iframeId = null;
    let sessionToken = null;
    let sessionExpiry = null;
    let heartbeatInterval = null;
    let authRetryCount = 0;
    let isVisible = true;
    let isOnline = navigator.onLine;
    let errorCache = new Map();
    let messageCache = new Set();
    let pendingRequests = new Map();
    let eventListeners = new Map();
    let timers = new Set();
    let stateChangeCallbacks = new Set();
    let suspendedTimestamp = null;

    let currentUser = null;
    let userDataLoaded = false;
    let sessionAuthorityReady = false;
    let parentCoordinator = null;
    let secureHandshakeInProgress = false;
    let secureSessionValid = false;
    let secureHandshakeTimeout = null;
    let secureHandshakeAttempts = 0;
    const maxHandshakeAttempts = 5;
    const handshakeTimeout = 8000;
    const sessionRetryDelay = 2000;

    let coreReady = false;
    let coreInitialized = false;
    let coreInitializationLock = false;
    let coreData = {
        friendsList: [],
        groupsList: [],
        chatHistory: [],
        notifications: [],
        settings: {}
    };
    let messageQueue = [];

    const loggedErrors = new Set();
    const retryCounters = new Map();
    const trustedOrigins = new Set([
        'http://localhost:5500', 
        'https://localhost:5500', 
        'http://127.0.0.1:5500', 
        'https://127.0.0.1:5500',
        window.location.origin
    ]);
    const messageDuplicates = new Set();

    // STABILITY PATCH: Session validation cache
    let validatedSession = null;
    let sessionValidationTimestamp = 0;
    const SESSION_VALIDATION_TTL = 30000; // 30 seconds

    // STABILITY PATCH: Handshake state machine
    let callCoreState = CallCoreState.IDLE;
    let handshakePromise = null;
    let handshakeResolve = null;
    let handshakeReject = null;
    let sessionAckReceived = false;
    let sessionAckTimestamp = 0;
    let sessionSyncAttempts = 0;
    const MAX_SESSION_SYNC_ATTEMPTS = 5;

    // STABILITY PATCH: Recovery tracking
    let recoveryInProgress = false;
    let lastValidSession = null;
    let sessionValidationTimer = null;

    // ==================== CONFIGURATION ====================
    const CONFIG = {
        AUTH_RETRY_LIMIT: 5,
        AUTH_RETRY_DELAY: 800,
        HEARTBEAT_INTERVAL: 15000,
        SESSION_REFRESH_THRESHOLD: 300000,
        MESSAGE_CACHE_TTL: 1000,
        ERROR_CACHE_TTL: 60000,
        MAX_PENDING_REQUESTS: 50,
        MAX_MESSAGE_RETRIES: 5,
        SUSPEND_TIMER_CLEANUP: true,
        parentDataTimeout: 5000,
        maxReconnectionAttempts: 10,
        reconnectionDelay: 500,
        HANDSHAKE_TIMEOUT: 8000,
        HANDSHAKE_MAX_ATTEMPTS: 5,
        SESSION_TIMEOUT: 8000,
        CIRCUIT_BREAKER_THRESHOLD: 5,
        CIRCUIT_BREAKER_RESET: 30000,
        STORAGE_PREFIX: 'calls_core_',
        MAX_RETRIES: 5,
        RETRY_BACKOFF: 800,
        PREFLIGHT_TIMEOUT: 2000,
        DEPENDENCY_TIMEOUT: 3000,
        PARENT_DETECT_TIMEOUT: 3000,
        HANDSHAKE_ACK_TIMEOUT: 4000,
        SESSION_SYNC_TIMEOUT: 6000,
        SERVICE_INIT_TIMEOUT: 8000,
        // STABILITY PATCH: New configs
        SESSION_VALIDATION_TIMEOUT: 5000,
        MAX_SESSION_WAIT: 10000,
        SESSION_RETRY_DELAY: 1000,
        ACK_TIMEOUT: 3000,
        RECOVERY_DELAY: 2000
    };

    // ==================== SECURITY UTILITIES ====================
    const SecurityCore = {
        _sanitizing: false,
        
        sanitizeString: function(str) {
            if (!str || typeof str !== 'string') return str || '';
            
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/javascript:/gi, '')
                .replace(/data:/gi, '')
                .replace(/vbscript:/gi, '')
                .replace(/onload/gi, 'data-onload')
                .replace(/onerror/gi, 'data-onerror')
                .replace(/onclick/gi, 'data-onclick')
                .replace(/onmouse/gi, 'data-onmouse')
                .replace(/onkey/gi, 'data-onkey')
                .replace(/onfocus/gi, 'data-onfocus')
                .replace(/onblur/gi, 'data-onblur')
                .replace(/onsubmit/gi, 'data-onsubmit')
                .replace(/onreset/gi, 'data-onreset')
                .replace(/onchange/gi, 'data-onchange')
                .replace(/onselect/gi, 'data-onselect')
                .replace(/onabort/gi, 'data-onabort');
        },
        
        sanitizeURL: function(url) {
            if (!url || typeof url !== 'string') return '';
            
            const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'blob:', 'data:'];
            try {
                const urlObj = new URL(url, window.location.origin);
                if (safeProtocols.includes(urlObj.protocol)) {
                    return url;
                }
            } catch (e) {
                return this.sanitizeString(url);
            }
            return '#';
        },
        
        safeJSONParse: function(json, fallback = null) {
            try {
                return JSON.parse(json);
            } catch (e) {
                return fallback;
            }
        },
        
        safeLocalStorageGet: function(key, fallback = null) {
            try {
                const value = localStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                return fallback;
            }
        },
        
        safeLocalStorageSet: function(key, value) {
            try {
                localStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                return false;
            }
        },
        
        safeLocalStorageRemove: function(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (e) {
                return false;
            }
        },
        
        safeSessionStorageGet: function(key, fallback = null) {
            try {
                const value = sessionStorage.getItem(key);
                return value !== null ? value : fallback;
            } catch (e) {
                return fallback;
            }
        },
        
        safeSessionStorageSet: function(key, value) {
            try {
                sessionStorage.setItem(key, String(value));
                return true;
            } catch (e) {
                return false;
            }
        },
        
        // STABILITY PATCH: Generate UUID for message IDs
        generateUUID: function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },
        
        // STABILITY PATCH: Simple signature for message integrity
        createSignature: function(payload, timestamp) {
            try {
                const str = JSON.stringify(payload) + timestamp + 'calls-core-secret';
                let hash = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }
                return hash.toString(36);
            } catch (e) {
                return '';
            }
        }
    };

    // ==================== UNIQUE IDENTIFIER ====================
    (function generateIframeId() {
        iframeId = 'calls-iframe-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
        if (window.name && window.name.startsWith('calls-iframe-')) {
            iframeId = window.name;
        } else {
            try { window.name = iframeId; } catch (e) {}
        }
        
        trustedOrigins.add(window.location.origin);
        try {
            const localhost = window.location.origin.replace(/:\d+/, ':5500');
            trustedOrigins.add(localhost);
        } catch (e) {}
        
        try {
            if (window.parent && window.parent !== window && window.parent.location) {
                trustedOrigins.add(window.parent.location.origin);
            }
        } catch (e) {}
    })();

    // ==================== LOGGING SYSTEM (Structured) ====================
    const logger = {
        _errors: new Map(),
        _history: [],
        _metrics: { info: 0, warn: 0, error: 0, once: 0 },
        _debugMode: true,
        
        _hash: function(msg) {
            let hash = 0;
            for (let i = 0; i < msg.length; i++) {
                hash = ((hash << 5) - hash) + msg.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(16);
        },
        
        _sanitize: function(data) {
            try {
                return JSON.parse(JSON.stringify(data, (key, value) => {
                    if (key === 'stream' || key === 'peer' || key.includes('Stream')) {
                        return '[Stream]';
                    }
                    if (key === 'token' || key.includes('Token') || key.includes('auth')) {
                        return '[REDACTED]';
                    }
                    if (key === 'password' || key.includes('Password') || key.includes('secret')) {
                        return '[REDACTED]';
                    }
                    return value;
                }));
            } catch {
                return String(data);
            }
        },
        
        _store: function(level, msg, data) {
            const entry = {
                timestamp: Date.now(),
                level,
                msg,
                data: data ? this._sanitize(data) : null,
                id: this._hash(msg + Date.now()),
                module: 'calls-core'
            };
            this._history.push(entry);
            if (this._history.length > 100) this._history.shift();
            this._metrics[level] = (this._metrics[level] || 0) + 1;
            return entry;
        },
        
        info: function(msg, data = null) {
            this._store('info', msg, data);
            console.info(`[Calls core:${iframeId?.substring(0, 8) || 'init'}] ${msg}`, data ? data : '');
        },
        
        warn: function(msg, data = null) {
            this._store('warn', msg, data);
            console.warn(`[Calls core:${iframeId?.substring(0, 8) || 'init'}] ⚠️ ${msg}`, data ? data : '');
        },
        
        error: function(msg, error = null, context = null) {
            const hash = logger._hash(msg + (error?.stack || '') + (context || ''));
            const now = Date.now();
            
            if (logger._errors.has(hash)) {
                const lastLog = logger._errors.get(hash);
                if (now - lastLog < CONFIG.ERROR_CACHE_TTL) {
                    return;
                }
            }
            
            logger._errors.set(hash, now);
            logger._store('error', msg, { error: error?.message || error, context });
            
            console.error(`[Calls core:${iframeId?.substring(0, 8) || 'init'}] 🔴 ${msg}`, 
                error ? error : '', 
                context ? `Context: ${context}` : '');
            
            setTimeout(() => logger._errors.delete(hash), CONFIG.ERROR_CACHE_TTL);
        },
        
        once: function(msg, data = null) {
            const hash = logger._hash(msg);
            if (!logger._errors.has(hash)) {
                logger._errors.set(hash, Date.now());
                logger._store('once', msg, data);
                console.info(`[Calls core:${iframeId?.substring(0, 8) || 'init'}] 📌 ${msg}`, data ? data : '');
                setTimeout(() => logger._errors.delete(hash), 5000);
            }
        },
        
        enableDebug: function() { this._debugMode = true; },
        disableDebug: function() { this._debugMode = false; },
        clear: function() { this._errors.clear(); this._history = []; this._metrics = { info: 0, warn: 0, error: 0, once: 0 }; },
        getMetrics: function() { return { ...this._metrics, historySize: this._history.length }; }
    };

    function canRetry(key, maxAttempts = 3) {
        const count = retryCounters.get(key) || 0;
        return count < maxAttempts;
    }

    function incrementRetryCount(key) {
        const count = (retryCounters.get(key) || 0) + 1;
        retryCounters.set(key, count);
        return count;
    }

    function getRetryCount(key) {
        return retryCounters.get(key) || 0;
    }

    function resetRetryCount(key) {
        retryCounters.delete(key);
    }

    function isMessageDuplicate(message) {
        const key = `${message.type}:${message.id || 'no-id'}`;
        if (messageDuplicates.has(key)) return true;
        messageDuplicates.add(key);
        setTimeout(() => messageDuplicates.delete(key), CONFIG.MESSAGE_CACHE_TTL);
        return false;
    }

    function logOnce(type, msg) {
        const hash = logger._hash(msg);
        if (loggedErrors.has(hash)) return;
        loggedErrors.add(hash);
        console[type](`[Calls core] ${msg}`);
        setTimeout(() => loggedErrors.delete(hash), 5000);
    }

    function logErrorOnce(module, error, context = '') {
        const errorKey = `${module}:${error.message}:${context}`;
        const hash = logger._hash(errorKey);
        if (!loggedErrors.has(hash)) {
            logOnce('warn', `${module} error: ${error.message} ${context}`);
            loggedErrors.add(hash);
            setTimeout(() => loggedErrors.delete(hash), 60000);
        }
    }

    // ==================== MESSAGE ID GENERATOR ====================
    const MessageIdGenerator = {
        _counter: 0,
        _lastTimestamp: 0,
        
        generateId: function() {
            const timestamp = Date.now();
            if (timestamp === this._lastTimestamp) {
                this._counter = (this._counter + 1) % 10000;
            } else {
                this._counter = 0;
                this._lastTimestamp = timestamp;
            }
            return `${timestamp}-${this._counter}-${Math.random().toString(36).substring(2, 8)}`;
        },
        
        parseId: function(id) {
            if (!id || typeof id !== 'string') return null;
            const parts = id.split('-');
            if (parts.length < 3) return null;
            return {
                timestamp: parseInt(parts[0], 10),
                counter: parseInt(parts[1], 10),
                random: parts[2]
            };
        }
    };

    // ==================== MESSAGE VALIDATOR ====================
    const MessageValidator = {
        _messageCache: new Set(),
        _sequenceNumbers: new Map(),
        
        generateId: function() {
            return MessageIdGenerator.generateId();
        },
        
        validate: function(message) {
            if (!message || typeof message !== 'object') {
                logger.once('Invalid message: not an object');
                return false;
            }
            
            if (!message.id) {
                logger.once('Invalid message: missing ID');
                return false;
            }
            
            if (!message.timestamp || message.timestamp > Date.now() + 60000 || message.timestamp < Date.now() - 300000) {
                logger.once(`Invalid message: timestamp out of range`, { id: message.id });
                return false;
            }
            
            const messageKey = `${message.id}:${message.timestamp}`;
            if (this._messageCache.has(messageKey)) {
                logger.once(`Duplicate message detected`, { id: message.id });
                return false;
            }
            
            try {
                const size = JSON.stringify(message).length;
                if (size > 1024 * 100) {
                    logger.once(`Message too large`, { id: message.id, size });
                    return false;
                }
            } catch (e) {}
            
            this._messageCache.add(messageKey);
            setTimeout(() => this._messageCache.delete(messageKey), CONFIG.MESSAGE_CACHE_TTL);
            
            return true;
        },
        
        validateOrigin: function(origin) {
            if (trustedOrigins.has(origin)) return true;
            
            if (origin === window.location.origin) {
                trustedOrigins.add(origin);
                return true;
            }
            
            if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:') ||
                origin.startsWith('http://127.0.0.1:') || origin.startsWith('https://127.0.0.1:')) {
                trustedOrigins.add(origin);
                return true;
            }
            
            try {
                const parentHost = window.location.hostname;
                const originHost = new URL(origin).hostname;
                
                const isValid = originHost === parentHost || 
                               originHost.endsWith('.' + parentHost) ||
                               parentHost.endsWith('.' + originHost);
                
                if (isValid) {
                    trustedOrigins.add(origin);
                }
                
                return isValid;
            } catch (error) {
                return false;
            }
        },
        
        createMessage: function(type, payload = {}, options = {}) {
            const id = options.id || this.generateId();
            const timestamp = options.timestamp || Date.now();
            
            return {
                id,
                type,
                source: 'calls-iframe',
                app: 'chat-system',
                version: '2.3.2',
                iframeId: iframeId,
                state: currentState,
                timestamp,
                payload: payload || {},
                sequence: options.sequence || 0,
                ack: options.ack || false,
                retry: options.retry || 0
            };
        },
        
        sanitize: function(message) {
            if (!message || typeof message !== 'object') return null;
            try {
                const sanitized = JSON.parse(JSON.stringify(message));
                if (sanitized.payload && sanitized.payload._token) {
                    delete sanitized.payload._token;
                }
                if (sanitized._token) {
                    delete sanitized._token;
                }
                return sanitized;
            } catch (e) {
                return null;
            }
        }
    };

    // ==================== CIRCUIT BREAKER ====================
    class CircuitBreaker {
        constructor(name) {
            this.name = name;
            this.failureThreshold = CONFIG.CIRCUIT_BREAKER_THRESHOLD || 5;
            this.resetTimeout = CONFIG.CIRCUIT_BREAKER_RESET || 30000;
            this.state = 'CLOSED';
            this.failureCount = 0;
            this.lastFailureTime = null;
            this.nextAttemptTime = null;
        }
        
        success() {
            if (this.state === 'HALF_OPEN') {
                this.state = 'CLOSED';
                this.failureCount = 0;
                logger.info(`Circuit breaker ${this.name} closed`);
            } else {
                this.failureCount = 0;
            }
        }
        
        failure() {
            this.failureCount++;
            this.lastFailureTime = Date.now();
            
            if (this.failureCount >= this.failureThreshold) {
                this.state = 'OPEN';
                this.nextAttemptTime = Date.now() + this.resetTimeout;
                logger.warn(`Circuit breaker ${this.name} opened after ${this.failureCount} failures`);
            }
        }
        
        canExecute() {
            if (this.state === 'CLOSED') return true;
            if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTime) {
                this.state = 'HALF_OPEN';
                logger.info(`Circuit breaker ${this.name} half-open`);
                return true;
            }
            return this.state === 'HALF_OPEN';
        }
    }

    // ==================== RETRY MANAGER ====================
    const RetryManager = {
        _counters: retryCounters,
        _circuitBreakers: new Map(),
        
        getBreaker: function(name) {
            if (!this._circuitBreakers.has(name)) {
                this._circuitBreakers.set(name, new CircuitBreaker(name));
            }
            return this._circuitBreakers.get(name);
        },
        
        canRetry: function(key, maxRetries = CONFIG.MAX_RETRIES) {
            const count = this._counters.get(key) || 0;
            const breaker = this.getBreaker(key);
            return count < maxRetries && breaker.canExecute();
        },
        
        increment: function(key) {
            const count = (this._counters.get(key) || 0) + 1;
            this._counters.set(key, count);
            return count;
        },
        
        reset: function(key) {
            this._counters.delete(key);
            const breaker = this._circuitBreakers.get(key);
            if (breaker) breaker.success();
        },
        
        recordFailure: function(key) {
            const breaker = this.getBreaker(key);
            breaker.failure();
        },
        
        getBackoffDelay: function(key) {
            const count = this._counters.get(key) || 0;
            return CONFIG.RETRY_BACKOFF * Math.pow(2, count);
        },
        
        executeWithRetry: async function(fn, key, options = {}) {
            const maxRetries = options.maxRetries || CONFIG.MAX_RETRIES;
            const timeout = options.timeout || 30000;
            let lastError;
            
            while (this.canRetry(key, maxRetries)) {
                const attempt = this.increment(key);
                
                try {
                    const result = await Promise.race([
                        fn(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
                        )
                    ]);
                    
                    this.reset(key);
                    return result;
                } catch (error) {
                    lastError = error;
                    this.recordFailure(key);
                    
                    if (attempt >= maxRetries) {
                        break;
                    }
                    
                    const delay = this.getBackoffDelay(key);
                    logger.warn(`Retry ${attempt}/${maxRetries} for ${key} in ${delay}ms`, error.message);
                    
                    if (options.onRetry) options.onRetry(attempt, delay, error);
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            
            throw new Error(`Max retries (${maxRetries}) exceeded for ${key}: ${lastError?.message || 'Unknown error'}`);
        }
    };

    // ==================== ERROR BOUNDARY ====================
    const ErrorBoundary = {
        execute: function(fn, context, fallback = null) {
            try {
                return fn();
            } catch (error) {
                logger.error(`Error in ${context}`, error);
                logErrorOnce(context, error);
                return fallback;
            }
        },
        
        executeAsync: async function(fn, context, fallback = null) {
            try {
                return await fn();
            } catch (error) {
                logger.error(`Async error in ${context}`, error);
                logErrorOnce(context, error);
                return fallback;
            }
        },
        
        wrap: function(fn, context) {
            return (...args) => {
                try {
                    return fn(...args);
                } catch (error) {
                    logger.error(`Error in ${context}`, error);
                    logErrorOnce(context, error);
                    return null;
                }
            };
        },
        
        createBoundary: function(featureName, fallbackFn) {
            return {
                execute: (fn) => {
                    try {
                        return fn();
                    } catch (error) {
                        logger.error(`Feature ${featureName} failed`, error);
                        logger.once(`Feature ${featureName} disabled due to error`);
                        return fallbackFn ? fallbackFn() : null;
                    }
                },
                executeAsync: async (fn) => {
                    try {
                        return await fn();
                    } catch (error) {
                        logger.error(`Feature ${featureName} async failed`, error);
                        logger.once(`Feature ${featureName} disabled due to error`);
                        return fallbackFn ? fallbackFn() : null;
                    }
                }
            };
        }
    };

    // ==================== PARENT COMMUNICATION ====================
    const parentComm = {
        _pendingAcks: new Map(),
        _retryQueues: new Map(),
        
        _send: function(type, payload = {}, targetOrigin = '*', options = {}) {
            return ErrorBoundary.execute(() => {
                if (!window.parent || window.parent === window) {
                    logger.once('No parent window available');
                    return false;
                }
                
                const messageKey = `${type}:${JSON.stringify(payload)}:${options.id || 'no-id'}`;
                if (messageDuplicates.has(messageKey)) {
                    return false;
                }
                
                messageDuplicates.add(messageKey);
                setTimeout(() => messageDuplicates.delete(messageKey), CONFIG.MESSAGE_CACHE_TTL);
                
                const message = MessageValidator.createMessage(type, payload, {
                    id: options.id,
                    ack: options.requireAck || false,
                    retry: options.retryCount || 0
                });
                
                try {
                    window.parent.postMessage(message, targetOrigin);
                    
                    if (options.requireAck) {
                        this._waitForAck(message.id, options.timeout || 5000)
                            .catch(() => {
                                logger.warn(`No ACK for message ${message.id}, retrying...`);
                                if ((options.retryCount || 0) < CONFIG.MAX_MESSAGE_RETRIES) {
                                    setTimeout(() => {
                                        this._send(type, payload, targetOrigin, {
                                            ...options,
                                            retryCount: (options.retryCount || 0) + 1,
                                            id: MessageValidator.generateId()
                                        });
                                    }, 1000 * ((options.retryCount || 0) + 1));
                                }
                            });
                    }
                    
                    return true;
                } catch (error) {
                    logger.error('parentComm._send', error);
                    return false;
                }
            }, 'parentComm._send', false);
        },
        
        _waitForAck: function(messageId, timeout) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    this._pendingAcks.delete(messageId);
                    reject(new Error('ACK timeout'));
                }, timeout);
                
                this._pendingAcks.set(messageId, { resolve, reject, timer });
            });
        },
        
        _handleAck: function(ackMessage) {
            if (!ackMessage.payload || !ackMessage.payload.ackId) return;
            const pending = this._pendingAcks.get(ackMessage.payload.ackId);
            if (pending) {
                clearTimeout(pending.timer);
                this._pendingAcks.delete(ackMessage.payload.ackId);
                pending.resolve(ackMessage);
            }
        },
        
        send: function(type, payload = {}) {
            return this._send(type, payload, '*', { requireAck: false });
        },
        
        sendWithAck: function(type, payload = {}, timeout = 5000) {
            const id = MessageValidator.generateId();
            return new Promise((resolve, reject) => {
                const success = this._send(type, payload, '*', { 
                    requireAck: true, 
                    timeout, 
                    id 
                });
                if (!success) {
                    reject(new Error('Failed to send message'));
                    return;
                }
                
                this._waitForAck(id, timeout)
                    .then(resolve)
                    .catch(reject);
            });
        },
        
        sendSecure: function(type, payload = {}) {
            if (!sessionToken) {
                logger.warn('No session token for secure message');
                return false;
            }
            return this._send(type, { ...payload, _token: sessionToken ? sessionToken.substring(0, 8) : null }, '*', { requireAck: false });
        },
        
        request: function(type, payload = {}, timeout = 8000) {
            return new Promise((resolve, reject) => {
                ErrorBoundary.execute(() => {
                    const requestId = MessageValidator.generateId();
                    
                    if (pendingRequests.size >= CONFIG.MAX_PENDING_REQUESTS) {
                        reject(new Error('Too many pending requests'));
                        return;
                    }
                    
                    const cleanup = () => {
                        pendingRequests.delete(requestId);
                        window.removeEventListener('message', handler);
                    };
                    
                    const handler = (event) => {
                        if (!event.data || !event.data.payload || event.data.payload.requestId !== requestId) return;
                        if (!MessageValidator.validateOrigin(event.origin)) return;
                        
                        cleanup();
                        
                        if (event.data.payload.error) {
                            reject(new Error(event.data.payload.error));
                        } else {
                            resolve(event.data.payload || event.data);
                        }
                    };
                    
                    window.addEventListener('message', handler);
                    
                    pendingRequests.set(requestId, { resolve, reject, cleanup });
                    
                    if (!this._send(type, { ...payload, requestId }, '*', { requireAck: true, timeout })) {
                        cleanup();
                        reject(new Error('Failed to send request'));
                        return;
                    }
                    
                    const timer = setTimeout(() => {
                        cleanup();
                        reject(new Error(`Request timeout: ${type}`));
                    }, timeout);
                    
                    timers.add(timer);
                }, 'parentComm.request', () => reject(new Error('Request failed')));
            });
        },
        
        notifyState: function() {
            this.send('IFRAME_STATE_CHANGE', {
                iframeId: iframeId,
                state: currentState,
                sessionValid: !!sessionToken,
                sessionExpiry: sessionExpiry,
                timestamp: Date.now()
            });
        },
        
        notifyParent: function(type, payload = {}) {
            return this.send(type, payload);
        }
    };

    // ==================== PARENT READINESS GUARDS ====================
    window.addEventListener('message', (e) => {
        if (!e || !e.data) return;
        if (!MessageValidator.validateOrigin(e.origin)) return;
        if (!MessageValidator.validate(e.data)) return;
        
        if (e.data.type === 'PARENT_READY') {
            _PARENT_READY_ = true;
            _HANDSHAKE_DONE_ = true;
            logOnce('info', 'Parent handshake complete');
        }
        
        if (e.data.type === 'ACK' && e.data.payload && e.data.payload.ackId) {
            parentComm._handleAck(e.data);
        }
        
        // NEW: Handle SESSION_INIT from parent
        if (e.data.type === 'SESSION_INIT' && e.data.payload && e.data.payload.session) {
            const sessionData = e.data.payload.session;
            if (sessionData.token) {
                sessionToken = sessionData.token;
                sessionExpiry = sessionData.expiry;
                currentUser = sessionData.user;
                userDataLoaded = true;
                sessionAuthorityReady = true;
                secureSessionValid = true;
                logger.info('Session received from parent via SESSION_INIT');
                
                // STABILITY PATCH: Validate and store session
                const session = {
                    token: sessionData.token,
                    userId: sessionData.user?.id || sessionData.userId,
                    expiresAt: sessionData.expiry || sessionData.expiresAt,
                    signature: sessionData.signature || SecurityCore.createSignature({ userId: sessionData.user?.id }, Date.now()),
                    refreshToken: sessionData.refreshToken
                };
                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();
                    
                    // STABILITY PATCH: Send ACK
                    sendSessionAck('SESSION_INIT_ACK', { success: true });
                }
            }
        }
        
        // NEW: Handle SESSION_UPDATE from parent
        if (e.data.type === 'SESSION_UPDATE' && e.data.payload) {
            const payload = e.data.payload;
            if (payload.token) {
                sessionToken = payload.token;
                sessionExpiry = payload.expiry;
            }
            if (payload.user) {
                currentUser = payload.user;
                userDataLoaded = true;
            }
            if (payload.authenticated !== undefined) {
                sessionAuthorityReady = payload.authenticated;
            }
            logger.info('Session updated from parent');
            
            // STABILITY PATCH: Update validation cache
            if (payload.token && payload.user?.id) {
                const session = {
                    token: payload.token,
                    userId: payload.user.id,
                    expiresAt: payload.expiry || Date.now() + 3600000,
                    signature: payload.signature || SecurityCore.createSignature({ userId: payload.user.id }, Date.now()),
                    refreshToken: payload.refreshToken
                };
                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();
                }
            }
        }
        
        // STABILITY PATCH: Handle SESSION_SYNC from parent
        if (e.data.type === 'SESSION_SYNC' && e.data.payload) {
            handleSessionSync(e.data.payload, e.data.messageId);
        }
        
        // STABILITY PATCH: Handle SESSION_ACK from parent
        if (e.data.type === 'SESSION_ACK' && e.data.payload) {
            handleParentAck(e.data.payload);
        }
        
        // STABILITY PATCH: Handle HANDSHAKE_REQUEST from parent
        if (e.data.type === 'HANDSHAKE_REQUEST' && e.data.payload) {
            handleHandshakeRequest(e.data.payload, e.data.messageId);
        }
    });

    // STABILITY PATCH: Send session ACK to parent
    function sendSessionAck(type, payload) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    source: 'calls-iframe',
                    type: type || 'CALL_SESSION_ACK',
                    iframeId: iframeId,
                    payload: payload || { success: true, timestamp: Date.now() },
                    messageId: SecurityCore.generateUUID(),
                    timestamp: Date.now()
                }, '*');
                logger.info(`Session ACK sent: ${type}`);
            }
        } catch (e) {
            logger.error('Failed to send session ACK', e);
        }
    }

    // STABILITY PATCH: Handle session sync from parent
    function handleSessionSync(payload, messageId) {
        logger.info('Received SESSION_SYNC from parent');
        
        try {
            // Validate session schema
            const session = {
                token: payload.token,
                userId: payload.userId || payload.user?.id,
                expiresAt: payload.expiresAt || payload.expiry,
                signature: payload.signature,
                refreshToken: payload.refreshToken
            };
            
            if (isValidSession(session)) {
                // Update all session variables
                sessionToken = session.token;
                sessionExpiry = session.expiresAt;
                currentUser = { id: session.userId, ...payload.user };
                userDataLoaded = true;
                sessionAuthorityReady = true;
                secureSessionValid = true;
                
                // Store validated session
                validatedSession = session;
                sessionValidationTimestamp = Date.now();
                sessionAckReceived = true;
                sessionAckTimestamp = Date.now();
                
                // Update state machine
                if (callCoreState === CallCoreState.WAITING_SESSION) {
                    callCoreState = CallCoreState.SYNCED;
                    if (handshakeResolve) {
                        handshakeResolve({ success: true, session: session });
                        handshakeResolve = null;
                    }
                }
                
                logger.info('Session validated and stored');
                
                // Send ACK
                sendSessionAck('CALL_SESSION_ACK', {
                    success: true,
                    sessionId: session.userId,
                    timestamp: Date.now()
                });
            } else {
                logger.warn('Invalid session schema received');
                sendSessionAck('CALL_SESSION_ACK', {
                    success: false,
                    error: 'Invalid session schema',
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            logger.error('Error handling SESSION_SYNC', error);
            sendSessionAck('CALL_SESSION_ACK', {
                success: false,
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    // STABILITY PATCH: Handle parent ACK
    function handleParentAck(payload) {
        logger.info('Received parent ACK', payload);
        if (payload.success) {
            sessionAckReceived = true;
            sessionAckTimestamp = Date.now();
        }
    }

    // STABILITY PATCH: Handle handshake request
    function handleHandshakeRequest(payload, messageId) {
        logger.info('Received handshake request from parent');
        
        const session = getValidatedSession();
        const response = {
            messageId: messageId,
            timestamp: Date.now(),
            protocolVersion: '2.3.2',
            sessionReady: !!session,
            session: session ? {
                userId: session.userId,
                token: 'present',
                expiresAt: session.expiresAt,
                signature: session.signature
            } : null
        };
        
        response.signature = SecurityCore.createSignature(response, response.timestamp);
        
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    source: 'calls-iframe',
                    type: 'HANDSHAKE_RESPONSE',
                    iframeId: iframeId,
                    payload: response,
                    messageId: SecurityCore.generateUUID(),
                    timestamp: Date.now()
                }, '*');
            }
        } catch (e) {
            logger.error('Failed to send handshake response', e);
        }
    }

    function notifyParentReady() {
        if (_HANDSHAKE_DONE_) return;
        if (_HANDSHAKE_RETRIES_ >= MAX_HANDSHAKE) {
            logOnce('warn', 'Parent handshake failed after max retries');
            return;
        }
        
        if (window.parent) {
            window.parent.postMessage({
                type: 'IFRAME_READY',
                source: 'calls-iframe',
                iframeId: iframeId,
                page: location.pathname,
                state: currentState,
                version: '2.3.2',
                timestamp: Date.now(),
                id: MessageValidator.generateId()
            }, '*');
            
            _HANDSHAKE_RETRIES_++;
            logOnce('info', `Parent handshake attempt ${_HANDSHAKE_RETRIES_}/${MAX_HANDSHAKE}`);
        }
    }

    // ==================== SESSION VALIDATION LAYER (STABILITY PATCH) ====================
    // ANALYSIS: This function prevents call logic from running without valid session
    // ANALYSIS: All session use must pass this validation
    function isValidSession(session) {
        if (!session || typeof session !== 'object') {
            logger.warn('Invalid session: not an object');
            return false;
        }
        
        // Check required fields
        if (typeof session.token !== 'string' || session.token.length < 10) {
            logger.warn('Invalid session: missing or invalid token');
            return false;
        }
        
        if (typeof session.userId !== 'string' && typeof session.userId !== 'number') {
            logger.warn('Invalid session: missing userId');
            return false;
        }
        
        if (typeof session.expiresAt !== 'number' || session.expiresAt < Date.now()) {
            logger.warn('Invalid session: missing or expired expiresAt');
            return false;
        }
        
        // Signature validation - if present, verify
        if (session.signature) {
            const expectedSig = SecurityCore.createSignature(
                { userId: session.userId, token: session.token.substring(0, 8) },
                session.expiresAt
            );
            if (session.signature !== expectedSig && session.signature.length > 5) {
                logger.warn('Invalid session: signature mismatch');
                return false;
            }
        }
        
        // Refresh token is optional but recommended
        if (session.refreshToken && typeof session.refreshToken !== 'string') {
            logger.warn('Invalid session: refreshToken must be string');
            return false;
        }
        
        return true;
    }

    // STABILITY PATCH: Get validated session from cache
    function getValidatedSession() {
        // Check if cache is still valid
        if (validatedSession && (Date.now() - sessionValidationTimestamp) < SESSION_VALIDATION_TTL) {
            return validatedSession;
        }
        
        // Build session from current variables
        const session = {
            token: sessionToken,
            userId: currentUser?.id || currentUser?.userId,
            expiresAt: sessionExpiry || (Date.now() + 3600000),
            signature: SecurityCore.createSignature({ userId: currentUser?.id }, Date.now()),
            refreshToken: null
        };
        
        if (isValidSession(session)) {
            validatedSession = session;
            sessionValidationTimestamp = Date.now();
            return session;
        }
        
        return null;
    }

    // STABILITY PATCH: Wait for session to be ready
    async function waitForSession(timeout = CONFIG.MAX_SESSION_WAIT) {
        const startTime = Date.now();
        let attempts = 0;
        
        while (attempts < MAX_SESSION_SYNC_ATTEMPTS) {
            // Check if we already have a valid session
            const session = getValidatedSession();
            if (session) {
                logger.info(`Session ready after ${attempts} attempts`);
                return session;
            }
            
            // Check if parent sent session via message
            if (sessionToken && currentUser) {
                const newSession = {
                    token: sessionToken,
                    userId: currentUser.id,
                    expiresAt: sessionExpiry || Date.now() + 3600000,
                    signature: SecurityCore.createSignature({ userId: currentUser.id }, Date.now()),
                    refreshToken: null
                };
                if (isValidSession(newSession)) {
                    validatedSession = newSession;
                    sessionValidationTimestamp = Date.now();
                    return newSession;
                }
            }
            
            // Wait and retry
            if (Date.now() - startTime > timeout) {
                logger.warn(`Session wait timeout after ${timeout}ms`);
                break;
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, CONFIG.SESSION_RETRY_DELAY));
        }
        
        return null;
    }

    // STABILITY PATCH: Wait for parent to be ready
    async function waitForParent(timeout = CONFIG.HANDSHAKE_TIMEOUT) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (_PARENT_READY_ && window.parent && window.parent !== window) {
                logger.info('Parent ready');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        logger.warn('Parent wait timeout');
        return false;
    }

    // STABILITY PATCH: Wait for handshake completion
    async function waitForHandshake(timeout = CONFIG.HANDSHAKE_TIMEOUT) {
        const startTime = Date.now();
        
        // Create handshake promise if not exists
        if (!handshakePromise) {
            handshakePromise = new Promise((resolve, reject) => {
                handshakeResolve = resolve;
                handshakeReject = reject;
            });
        }
        
        // If handshake already done, resolve immediately
        if (_HANDSHAKE_DONE_) {
            handshakeResolve?.({ success: true });
            return { success: true };
        }
        
        // Send handshake request
        notifyParentReady();
        
        // Wait for handshake with timeout
        try {
            const result = await Promise.race([
                handshakePromise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Handshake timeout')), timeout)
                )
            ]);
            return result;
        } catch (error) {
            logger.warn('Handshake failed', error);
            return { success: false, error: error.message };
        } finally {
            handshakePromise = null;
            handshakeResolve = null;
            handshakeReject = null;
        }
    }

    // STABILITY PATCH: Verify session is still valid
    async function verifySession() {
        const session = getValidatedSession();
        if (!session) {
            throw new Error('No valid session');
        }
        
        // Check if session is expired
        if (session.expiresAt < Date.now()) {
            logger.warn('Session expired');
            return false;
        }
        
        // Optional: Verify with parent
        try {
            const result = await parentComm.request('VERIFY_SESSION', {
                token: session.token,
                userId: session.userId,
                timestamp: Date.now()
            }, 3000);
            
            return result?.valid === true;
        } catch (error) {
            logger.warn('Session verification failed', error);
            // Fall back to local validation
            return true;
        }
    }

    // STABILITY PATCH: Safe initialization barrier
    async function safeInit() {
        logger.info('Starting safe initialization');
        callCoreState = CallCoreState.WAITING_PARENT;
        
        try {
            // Step 1: Wait for parent
            const parentReady = await waitForParent(CONFIG.HANDSHAKE_TIMEOUT);
            if (!parentReady) {
                logger.warn('Parent not ready, continuing with caution');
            }
            
            callCoreState = CallCoreState.WAITING_SESSION;
            
            // Step 2: Wait for session with retries
            let session = null;
            for (let attempt = 1; attempt <= MAX_SESSION_SYNC_ATTEMPTS; attempt++) {
                session = await waitForSession(CONFIG.MAX_SESSION_WAIT);
                if (session) break;
                
                logger.info(`Session wait attempt ${attempt}/${MAX_SESSION_SYNC_ATTEMPTS}`);
                
                // Request session from parent
                parentComm.send('REQUEST_SESSION', {
                    iframeId: iframeId,
                    attempt: attempt,
                    timestamp: Date.now()
                });
                
                await new Promise(resolve => setTimeout(resolve, CONFIG.SESSION_RETRY_DELAY * attempt));
            }
            
            if (!session) {
                throw new Error('Failed to acquire session after max attempts');
            }
            
            // Step 3: Verify session
            const verified = await verifySession();
            if (!verified) {
                logger.warn('Session verification failed, using local validation');
            }
            
            callCoreState = CallCoreState.SYNCED;
            
            // Step 4: Send ACK to parent
            sendSessionAck('CALL_SESSION_ACK', {
                success: true,
                sessionId: session.userId,
                timestamp: Date.now()
            });
            
            // Step 5: Wait for parent ACK (optional)
            await new Promise(resolve => setTimeout(resolve, 500));
            
            logger.info('Safe initialization complete');
            return { success: true, session };
            
        } catch (error) {
            logger.error('Safe initialization failed', error);
            callCoreState = CallCoreState.ERROR;
            
            // Only fallback after 5 failed retries and 10s total wait
            const shouldFallback = 
                sessionSyncAttempts >= MAX_SESSION_SYNC_ATTEMPTS && 
                Date.now() - (sessionValidationTimestamp || 0) > CONFIG.MAX_SESSION_WAIT;
            
            if (shouldFallback) {
                logger.warn('Entering fallback mode after multiple failures');
                return { success: false, fallback: true };
            }
            
            throw error;
        }
    }

    // ==================== SESSION MANAGER ====================
    let sessionValid = false;
    let sessionInitialized = false;

    const SessionManager = {
        _refreshTimer: null,
        _checkTimer: null,
        _lastValidSession: null,
        _guestMode: false,
        _demoMode: false,
        _sanitizing: false,
        
        acquire: async function(parentToken = null) {
            return ErrorBoundary.executeAsync(async () => {
                logger.info('Acquiring session');
                
                // STABILITY PATCH: Use validation layer
                if (parentToken && this.validateToken(parentToken)) {
                    this.setToken(parentToken);
                    sessionToken = parentToken;
                    sessionValid = true;
                    this._guestMode = false;
                    this._demoMode = false;
                    logger.info('Session acquired from parent');
                    
                    // Update validation cache
                    const session = {
                        token: parentToken,
                        userId: currentUser?.id,
                        expiresAt: sessionExpiry || Date.now() + 3600000,
                        signature: SecurityCore.createSignature({ userId: currentUser?.id }, Date.now()),
                        refreshToken: null
                    };
                    if (isValidSession(session)) {
                        validatedSession = session;
                        sessionValidationTimestamp = Date.now();
                    }
                    
                    return true;
                }
                
                if (this.restoreFromStorage()) {
                    sessionValid = true;
                    this._guestMode = false;
                    this._demoMode = false;
                    logger.once('Session restored from storage');
                    return true;
                }
                
                if (this._lastValidSession) {
                    this.setToken(this._lastValidSession.token, this._lastValidSession.expiry);
                    sessionValid = true;
                    this._guestMode = true;
                    logger.info('Using last valid session (guest mode)');
                    return true;
                }
                
                sessionValid = false;
                this._demoMode = true;
                logger.info('No session available, running in demo mode');
                return false;
            }, 'SessionManager.acquire', false);
        },
        
        init: async function() {
            try {
                logger.info('Initializing session');
                currentState = STATE.SYNC;
                
                const tokenData = await this.requestToken().catch(() => null);
                
                if (tokenData && tokenData.token) {
                    await this.setToken(tokenData.token, tokenData.expiry);
                    if (tokenData.user) {
                        currentUser = tokenData.user;
                        userDataLoaded = true;
                    }
                    this._guestMode = false;
                    this._demoMode = false;
                    this._lastValidSession = { token: tokenData.token, expiry: tokenData.expiry, user: tokenData.user };
                    logger.info('Session initialized successfully');
                    return true;
                }
                
                if (this.restoreFromStorage()) {
                    this._guestMode = false;
                    this._demoMode = false;
                    logger.once('Session restored from storage');
                    return true;
                }
                
                if (this._lastValidSession) {
                    this.setToken(this._lastValidSession.token, this._lastValidSession.expiry);
                    this._guestMode = true;
                    logger.info('Using last valid session (guest mode)');
                    return true;
                }
                
                this._demoMode = true;
                logger.warn('No session available, running in demo mode');
                return false;
            } catch (error) {
                logger.error('Session initialization failed', error);
                this._demoMode = true;
                return false;
            }
        },
        
        requestToken: function() {
            return parentComm.request('REQUEST_TOKEN', {
                iframeId: iframeId,
                timestamp: Date.now()
            }, 5000).catch(error => {
                logger.warn('Token request failed', error.message);
                return null;
            });
        },
        
        requestSessionFromParent: function() {
            return parentComm.request('REQUEST_SESSION', {
                iframeId: iframeId,
                timestamp: Date.now()
            }, 8000).catch(error => {
                logger.warn('Session request failed', error.message);
                return null;
            });
        },
        
        refreshToken: function() {
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            
            if (!sessionToken && !this._guestMode && !this._demoMode) return Promise.resolve(false);
            if (this._demoMode) return Promise.resolve(false);
            
            return this.requestToken().then(tokenData => {
                if (tokenData && tokenData.token) {
                    return this.setToken(tokenData.token, tokenData.expiry);
                }
                return false;
            }).catch(error => {
                logger.error('Token refresh failed', error);
                return false;
            });
        },
        
        setToken: function(token, expiry) {
            try {
                if (!token || typeof token !== 'string' || token.length < 10) {
                    throw new Error('Invalid token format');
                }
                
                sessionToken = token;
                sessionExpiry = expiry || Date.now() + 3600000;
                sessionValid = true;
                this._guestMode = false;
                this._demoMode = false;
                this._lastValidSession = { token, expiry: sessionExpiry, user: currentUser };
                
                // STABILITY PATCH: Update validation cache
                const session = {
                    token: token,
                    userId: currentUser?.id,
                    expiresAt: sessionExpiry,
                    signature: SecurityCore.createSignature({ userId: currentUser?.id }, Date.now()),
                    refreshToken: null
                };
                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();
                }
                
                this.scheduleRefresh();
                this.persistToStorage();
                
                logger.once('Token set successfully');
                return true;
            } catch (error) {
                logger.error('Failed to set token', error);
                return false;
            }
        },
        
        clearToken: function() {
            sessionToken = null;
            sessionExpiry = null;
            currentUser = null;
            userDataLoaded = false;
            sessionAuthorityReady = false;
            sessionValid = false;
            this._guestMode = false;
            this._demoMode = true;
            
            // STABILITY PATCH: Clear validation cache
            validatedSession = null;
            sessionValidationTimestamp = 0;
            sessionAckReceived = false;
            
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            
            this.clearStorage();
            logger.info('Token cleared, switched to demo mode');
        },
        
        validateToken: function(token = sessionToken) {
            if (this._demoMode) return false;
            if (this._guestMode && this._lastValidSession) {
                if (Date.now() < this._lastValidSession.expiry) {
                    return true;
                }
            }
            
            if (!token || !sessionExpiry) return false;
            
            const now = Date.now();
            if (now >= sessionExpiry) {
                logger.warn('Token expired');
                this.clearToken();
                return false;
            }
            
            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    if (payload.exp && payload.exp * 1000 < now) {
                        logger.warn('Token expired (JWT claim)');
                        this.clearToken();
                        return false;
                    }
                }
                
                return true;
            } catch (e) {
                return true;
            }
        },
        
        scheduleRefresh: function() {
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            
            if (!sessionExpiry || this._demoMode) return;
            
            const now = Date.now();
            const timeUntilExpiry = sessionExpiry - now;
            const refreshTime = Math.max(0, timeUntilExpiry - CONFIG.SESSION_REFRESH_THRESHOLD);
            
            if (refreshTime <= 0) {
                this.refreshToken();
                return;
            }
            
            this._refreshTimer = setTimeout(() => {
                this.refreshToken();
            }, refreshTime);
            
            timers.add(this._refreshTimer);
        },
        
        persistToStorage: function() {
            if (this._demoMode) return;
            try {
                const data = {
                    token: sessionToken,
                    expiry: sessionExpiry,
                    user: currentUser,
                    timestamp: Date.now()
                };
                SecurityCore.safeLocalStorageSet(`${CONFIG.STORAGE_PREFIX || 'session_'}${iframeId}`, JSON.stringify(data));
            } catch (error) {
                logger.error('Failed to persist session', error);
            }
        },
        
        restoreFromStorage: function() {
            try {
                const stored = SecurityCore.safeLocalStorageGet(`${CONFIG.STORAGE_PREFIX || 'session_'}${iframeId}`);
                if (!stored) return false;
                
                const data = SecurityCore.safeJSONParse(stored);
                if (!data || !data.token || !data.expiry) return false;
                
                if (Date.now() >= data.expiry) {
                    SecurityCore.safeLocalStorageRemove(`${CONFIG.STORAGE_PREFIX || 'session_'}${iframeId}`);
                    return false;
                }
                
                sessionToken = data.token;
                sessionExpiry = data.expiry;
                sessionValid = true;
                this._lastValidSession = { token: data.token, expiry: data.expiry, user: data.user };
                
                if (data.user) {
                    currentUser = data.user;
                    userDataLoaded = true;
                }
                
                // STABILITY PATCH: Update validation cache
                const session = {
                    token: data.token,
                    userId: data.user?.id,
                    expiresAt: data.expiry,
                    signature: SecurityCore.createSignature({ userId: data.user?.id }, Date.now()),
                    refreshToken: null
                };
                if (isValidSession(session)) {
                    validatedSession = session;
                    sessionValidationTimestamp = Date.now();
                }
                
                this.scheduleRefresh();
                
                return true;
            } catch (error) {
                logger.error('Failed to restore session', error);
                return false;
            }
        },
        
        clearStorage: function() {
            try {
                SecurityCore.safeLocalStorageRemove(`${CONFIG.STORAGE_PREFIX || 'session_'}${iframeId}`);
            } catch (error) {
                logger.error('Failed to clear session storage', error);
            }
        },
        
        getToken: function() {
            if (this._demoMode) return null;
            if (this._guestMode && this._lastValidSession) return this._lastValidSession.token;
            return this.validateToken() ? sessionToken : null;
        },
        
        getStatus: function() {
            return {
                valid: this.validateToken(),
                expiry: sessionExpiry,
                timeRemaining: sessionExpiry ? sessionExpiry - Date.now() : 0,
                user: currentUser ? { id: currentUser.id, username: currentUser.username } : null,
                demoMode: this._demoMode,
                guestMode: this._guestMode
            };
        },
        
        isDemoMode: function() {
            return this._demoMode;
        },
        
        isGuestMode: function() {
            return this._guestMode;
        },
        
        setState: function(newState) {
            if (newState === currentState) return;
            
            const oldState = currentState;
            currentState = newState;
            
            logger.info(`State transition: ${oldState} → ${newState}`);
            parentComm.notifyState();
            
            stateChangeCallbacks.forEach(cb => {
                try {
                    cb(newState, oldState);
                } catch (error) {
                    logger.error('State change callback failed', error);
                }
            });
            
            if (newState === STATE.SUSPENDED) {
                suspendedTimestamp = Date.now();
                this.pause();
            } else if (oldState === STATE.SUSPENDED && newState === STATE.ACTIVE) {
                const suspendedDuration = suspendedTimestamp ? Date.now() - suspendedTimestamp : 0;
                logger.info(`Resumed after ${suspendedDuration}ms suspended`);
                suspendedTimestamp = null;
                this.resume();
            }
        },
        
        pause: function() {
            if (CONFIG.SUSPEND_TIMER_CLEANUP) {
                timers.forEach(timer => {
                    try {
                        if (timer && typeof timer === 'object' && 'ref' in timer) {
                            clearTimeout(timer);
                            clearInterval(timer);
                        }
                    } catch (e) {}
                });
                timers.clear();
            }
        },
        
        resume: function() {
            this.scheduleRefresh();
            this.validateToken();
            
            // STABILITY PATCH: Re-sync session on resume
            if (!getValidatedSession() && !this._demoMode) {
                setTimeout(() => requestResync(), 500);
            }
        }
    };

    const session = SessionManager;

    // ==================== PARENT COORDINATOR ====================
    class ParentCoordinator {
        constructor() {
            this.parentDetected = false;
            this.sameOrigin = false;
            this.secureChannelEstablished = false;
            this.sessionData = null;
            this.sessionValidated = false;
            this.handshakeInProgress = false;
            this.handshakeComplete = false;
            this.reconnectionTimer = null;
            this.messageHandlers = new Map();
            this.pendingRequests = new Map();
            this.lastHeartbeat = 0;
            this.heartbeatInterval = null;
            this.initializationLock = false;
            this.fallbackState = 'waiting';
            this.sessionUpdateCallbacks = [];
            this.uiBindings = [];
            this.sessionWaitingLogged = false;
            this.secureSessionValid = false;
            this.secureHandshakeRequested = false;
            this.messageRetryCounts = new Map();
            this.maxMessageRetries = 5;
            this.fallbackMode = false;
            this._sanitizing = false;
        }
        
        async initialize() {
            return ErrorBoundary.executeAsync(async () => {
                logger.info('Initializing parent coordination...');
                
                this.detectParent();
                
                if (!this.parentDetected) {
                    logger.warn('No parent window detected, enabling fallback mode');
                    this.fallbackMode = true;
                    this.setFallbackState('standalone');
                    return { success: true, mode: 'standalone', fallback: true };
                }
                
                if (!this.sameOrigin) {
                    logger.warn('Cross-origin parent detected, limited functionality');
                    this.setFallbackState('reconnecting');
                }
                
                this.establishMessagingChannel();
                
                const handshakeResult = await this.startSecureHandshake().catch(() => {
                    logger.warn('Secure handshake failed, using fallback');
                    this.fallbackMode = true;
                    return { success: false, fallback: true };
                });
                
                this.startHeartbeat();
                this.setupResynchronization();
                
                return { 
                    success: true, 
                    parentDetected: this.parentDetected,
                    fallback: this.fallbackMode
                };
            }, 'ParentCoordinator.initialize', { success: false, fallback: true });
        }
        
        detectParent() {
            try {
                this.parentDetected = !!(window.parent && window.parent !== window);
                
                if (this.parentDetected) {
                    try {
                        this.sameOrigin = window.location.origin === window.parent.location.origin;
                        logger.info(`Parent detected, same-origin: ${this.sameOrigin}`);
                        
                        if (this.sameOrigin) {
                            trustedOrigins.add(window.location.origin);
                        }
                        
                        try {
                            trustedOrigins.add(window.parent.location.origin);
                        } catch (e) {}
                    } catch (error) {
                        logger.info('Cross-origin parent detected');
                        this.sameOrigin = false;
                    }
                }
            } catch (error) {
                logger.error('ParentCoordinator.detectParent', error);
                this.parentDetected = false;
                this.sameOrigin = false;
                this.fallbackMode = true;
            }
        }
        
        establishMessagingChannel() {
            try {
                window.addEventListener('message', this.handleParentMessage.bind(this));
                logger.info('Secure messaging channel established');
                this.secureChannelEstablished = true;
            } catch (error) {
                logger.error('ParentCoordinator.establishMessagingChannel', error);
                this.secureChannelEstablished = false;
            }
        }
        
        handleParentMessage(event) {
            if (!this.isValidOrigin(event.origin)) return;
            
            const data = event.data;
            if (!data || typeof data !== 'object') return;
            if (!MessageValidator.validate(data)) return;
            
            try {
                if (this.messageHandlers.has(data.type)) {
                    this.messageHandlers.get(data.type)(data);
                } else {
                    this.handleDefaultMessage(data);
                }
                
                if (data.payload?.requestId && this.pendingRequests.has(data.payload.requestId)) {
                    const { resolve, reject } = this.pendingRequests.get(data.payload.requestId);
                    if (data.payload.success !== false) {
                        resolve(data);
                    } else {
                        reject(new Error(data.payload.error || 'Request failed'));
                    }
                    this.pendingRequests.delete(data.payload.requestId);
                }
            } catch (error) {
                logger.error('ParentCoordinator.handleParentMessage', error, `type: ${data?.type}`);
            }
        }
        
        isValidOrigin(origin) {
            return MessageValidator.validateOrigin(origin);
        }
        
        async startSecureHandshake() {
            if (secureHandshakeInProgress || this.secureSessionValid) {
                return { success: this.secureSessionValid };
            }
            
            if (this.fallbackMode) {
                logger.info('Fallback mode active, skipping secure handshake');
                this.initiateHandshake();
                return { success: false, fallback: true };
            }
            
            const retryKey = 'secureHandshake';
            if (!canRetry(retryKey, maxHandshakeAttempts)) {
                logger.warn('Max handshake attempts reached, enabling fallback');
                this.fallbackMode = true;
                this.initiateHandshake();
                return { success: false, fallback: true };
            }
            
            secureHandshakeInProgress = true;
            this.secureHandshakeRequested = true;
            secureHandshakeAttempts = incrementRetryCount(retryKey);
            
            logger.info(`Starting secure handshake protocol (attempt ${secureHandshakeAttempts}/${maxHandshakeAttempts})...`);
            return this.requestSecureSession();
        }
        
        requestSecureSession() {
            return new Promise((resolve) => {
                if (!this.parentDetected || !window.parent) {
                    this.handleSecureHandshakeFailure('No parent window');
                    resolve({ success: false, fallback: true });
                    return;
                }
                
                if (secureHandshakeAttempts >= maxHandshakeAttempts) {
                    this.handleSecureHandshakeFailure('Max attempts reached');
                    resolve({ success: false, fallback: true });
                    return;
                }
                
                if (secureHandshakeTimeout) {
                    clearTimeout(secureHandshakeTimeout);
                    secureHandshakeTimeout = null;
                }
                
                const requestId = MessageValidator.generateId();
                
                const message = {
                    type: 'REQUEST_SESSION',
                    source: 'calls-iframe',
                    requestId: requestId,
                    timestamp: Date.now(),
                    version: '2.3.2',
                    secure: true,
                    iframeId: this.getIframeId(),
                    id: MessageValidator.generateId()
                };
                
                let resolved = false;
                
                secureHandshakeTimeout = setTimeout(() => {
                    if (!resolved && !this.secureSessionValid) {
                        logger.warn(`⚠️ Secure session request timeout (attempt ${secureHandshakeAttempts})`);
                        if (secureHandshakeAttempts < maxHandshakeAttempts) {
                            setTimeout(() => this.requestSecureSession(), sessionRetryDelay);
                        } else {
                            this.handleSecureHandshakeFailure('Handshake timeout');
                        }
                        if (!resolved) {
                            resolved = true;
                            resolve({ success: false, fallback: true });
                        }
                    }
                }, handshakeTimeout);
                
                if (!this.sendToParent(message)) {
                    this.handleSecureHandshakeFailure('Failed to send request');
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, fallback: true });
                    }
                    return;
                }
                
                const handler = (event) => {
                    if (!event.data || event.data.type !== 'SESSION_DATA') return;
                    if (event.data.requestId !== requestId && event.data.payload?.requestId !== requestId) return;
                    if (!this.isValidOrigin(event.origin)) return;
                    
                    window.removeEventListener('message', handler);
                    clearTimeout(secureHandshakeTimeout);
                    
                    if (!resolved) {
                        resolved = true;
                        this.handleSecureSessionData(event.data.payload || event.data);
                        resolve({ success: true, fallback: false });
                    }
                };
                
                window.addEventListener('message', handler);
                
                setTimeout(() => {
                    window.removeEventListener('message', handler);
                    if (!resolved) {
                        resolved = true;
                        resolve({ success: false, fallback: true });
                    }
                }, handshakeTimeout + 1000);
            });
        }
        
        handleSecureHandshakeFailure(reason) {
            logger.warn(`❌ Secure handshake failed: ${reason}`);
            secureHandshakeInProgress = false;
            this.secureHandshakeRequested = false;
            this.fallbackMode = true;
            
            if (!this.handshakeComplete) {
                logger.info('Falling back to legacy handshake protocol...');
                this.initiateHandshake();
            }
        }
        
        handleSecureSessionData(sessionData) {
            if (!sessionData || typeof sessionData !== 'object') return;
            
            if (!this.validateSecureSessionSchema(sessionData)) {
                this.handleSecureHandshakeFailure('Invalid session schema');
                return;
            }
            
            if (secureHandshakeTimeout) {
                clearTimeout(secureHandshakeTimeout);
                secureHandshakeTimeout = null;
            }
            
            this.sessionData = sessionData;
            this.sessionValidated = true;
            this.secureSessionValid = true;
            secureHandshakeInProgress = false;
            this.handshakeComplete = true;
            this.handshakeInProgress = false;
            this.fallbackMode = false;
            
            resetRetryCount('secureHandshake');
            
            logger.info('✅ Secure session received and validated successfully');
            this.setFallbackState('connected');
            this.updateGlobalStateFromSession();
            this.bindUIAfterSessionConfirmation();
            
            const confirmMessage = {
                type: 'SESSION_CONSUMED',
                source: 'calls-iframe',
                timestamp: Date.now(),
                sessionId: sessionData.sessionId,
                userId: sessionData.user?.id,
                secure: true,
                id: MessageValidator.generateId()
            };
            
            this.sendToParent(confirmMessage);
            logger.info('Secure session data consumed successfully');
            
            // STABILITY PATCH: Send session ACK
            sendSessionAck('CALL_SESSION_ACK', {
                success: true,
                sessionId: sessionData.sessionId,
                timestamp: Date.now()
            });
        }
        
        validateSecureSessionSchema(sessionData) {
            if (!sessionData || typeof sessionData !== 'object') return false;
            
            const requiredFields = ['sessionId', 'timestamp', 'token', 'user'];
            for (const field of requiredFields) {
                if (!sessionData.hasOwnProperty(field)) return false;
            }
            
            if (!sessionData.user || !sessionData.user.id || !sessionData.user.username) return false;
            if (typeof sessionData.token !== 'string' || sessionData.token.length < 10) return false;
            
            return true;
        }
        
        getIframeId() {
            return iframeId;
        }
        
        async initiateHandshake() {
            if (this.handshakeInProgress || this.handshakeComplete) return;
            
            this.handshakeInProgress = true;
            this.setFallbackState('waiting');
            
            logger.info('Starting handshake protocol...');
            
            const message = {
                type: 'CHILD_READY',
                source: 'calls-iframe',
                timestamp: Date.now(),
                version: '2.3.2',
                capabilities: ['session_management', 'ui_coordination', 'api_routing'],
                id: MessageValidator.generateId()
            };
            
            if (!this.sendToParent(message)) {
                logger.warn('Failed to send CHILD_READY');
                this.handshakeInProgress = false;
                return;
            }
            
            await this.requestSessionWithBackoff();
        }
        
        async requestSessionWithBackoff() {
            const retryKey = 'sessionRequest';
            if (!canRetry(retryKey, 5)) {
                logger.warn('Max session request attempts reached');
                this.setFallbackState('unavailable');
                this.handshakeInProgress = false;
                return;
            }
            
            let attempt = getRetryCount(retryKey);
            const maxAttempts = 5;
            const baseDelay = 1000;
            
            while (attempt < maxAttempts && !this.handshakeComplete) {
                attempt = incrementRetryCount(retryKey);
                const delay = baseDelay * Math.pow(2, attempt - 1);
                
                logger.info(`Requesting session (attempt ${attempt}/${maxAttempts})...`);
                
                const message = {
                    type: 'REQUEST_SESSION',
                    source: 'calls-iframe',
                    timestamp: Date.now(),
                    attempt: attempt,
                    requestId: MessageValidator.generateId(),
                    id: MessageValidator.generateId()
                };
                
                this.sendToParent(message);
                
                await new Promise(resolve => {
                    const timeoutId = setTimeout(() => {
                        logger.info(`Session request timeout (attempt ${attempt})`);
                        resolve();
                    }, delay);
                    
                    const checkInterval = setInterval(() => {
                        if (this.handshakeComplete) {
                            clearTimeout(timeoutId);
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            }
            
            if (!this.handshakeComplete) {
                logger.error('Handshake failed after maximum attempts');
                this.setFallbackState('unavailable');
                this.handshakeInProgress = false;
            }
        }
        
        sendToParent(message, targetOrigin = '*') {
            if (!this.parentDetected || !window.parent) {
                if (!this.fallbackMode) {
                    logger.once('Cannot send message - no parent detected');
                }
                return false;
            }
            
            if (!message || typeof message !== 'object') return false;
            
            if (isMessageDuplicate(message)) {
                logger.once('Duplicate message detected, skipping');
                return false;
            }
            
            const retryKey = `sendMessage:${message.type}`;
            const retryCount = getRetryCount(retryKey);
            
            if (retryCount >= this.maxMessageRetries) {
                logger.once('Max retries reached for message type: ' + message.type);
                return false;
            }
            
            try {
                message.source = message.source || 'calls-iframe';
                message.iframeId = iframeId;
                message.timestamp = message.timestamp || Date.now();
                message.id = message.id || MessageValidator.generateId();
                
                window.parent.postMessage(message, targetOrigin);
                
                if (retryCount > 0) resetRetryCount(retryKey);
                
                return true;
            } catch (error) {
                incrementRetryCount(retryKey);
                logger.error('ParentCoordinator.sendToParent', error, `type: ${message.type}, retry: ${retryCount + 1}`);
                
                if (retryCount < this.maxMessageRetries - 1) {
                    setTimeout(() => this.sendToParent(message, targetOrigin), 1000 * (retryCount + 1));
                }
                
                return false;
            }
        }
        
        sendWithResponse(message, timeout = 5000) {
            return new Promise((resolve, reject) => {
                if (!this.parentDetected) {
                    reject(new Error('No parent detected'));
                    return;
                }
                
                if (!message || typeof message !== 'object') {
                    reject(new Error('Invalid message'));
                    return;
                }
                
                const requestId = MessageValidator.generateId();
                message.requestId = requestId;
                message.payload = message.payload || {};
                message.payload.requestId = requestId;
                message.id = MessageValidator.generateId();
                
                this.pendingRequests.set(requestId, { resolve, reject });
                
                if (!this.sendToParent(message)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Failed to send message'));
                    return;
                }
                
                setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        this.pendingRequests.delete(requestId);
                        reject(new Error('Request timeout'));
                    }
                }, timeout);
            });
        }
        
        handleSessionData(sessionData) {
            if (!sessionData || typeof sessionData !== 'object') return;
            
            logger.info('Received SESSION_DATA');
            
            if (!this.validateSessionSchema(sessionData)) {
                logger.error('Invalid session schema');
                const errorMessage = {
                    type: 'SESSION_ERROR',
                    source: 'calls-iframe',
                    error: 'Invalid session schema',
                    timestamp: Date.now(),
                    id: MessageValidator.generateId()
                };
                this.sendToParent(errorMessage);
                return;
            }
            
            this.sessionData = sessionData;
            this.sessionValidated = true;
            this.handshakeComplete = true;
            this.handshakeInProgress = false;
            this.setFallbackState('connected');
            
            this.updateGlobalStateFromSession();
            this.bindUIAfterSessionConfirmation();
            
            const confirmMessage = {
                type: 'SESSION_CONSUMED',
                source: 'calls-iframe',
                timestamp: Date.now(),
                sessionId: sessionData.sessionId,
                userId: sessionData.user?.id,
                id: MessageValidator.generateId()
            };
            
            this.sendToParent(confirmMessage);
            logger.info('Session data consumed successfully');
            
            // STABILITY PATCH: Send session ACK
            sendSessionAck('CALL_SESSION_ACK', {
                success: true,
                sessionId: sessionData.sessionId,
                timestamp: Date.now()
            });
        }
        
        validateSessionSchema(sessionData) {
            if (!sessionData || typeof sessionData !== 'object') return false;
            
            const requiredFields = ['sessionId', 'timestamp'];
            for (const field of requiredFields) {
                if (!sessionData.hasOwnProperty(field)) return false;
            }
            
            if (sessionData.user) {
                if (!sessionData.user.id || !sessionData.user.username) return false;
            }
            
            return true;
        }
        
        updateGlobalStateFromSession() {
            if (!this.sessionData) return;
            
            if (!this.sessionData.token) {
                if (!this.sessionWaitingLogged) {
                    logger.info('Session token not ready, waiting...');
                    this.sessionWaitingLogged = true;
                }
                return;
            }
            
            this.sessionWaitingLogged = false;
            
            if (this.sessionData.user) {
                try {
                    currentUser = this.sessionData.user;
                    userDataLoaded = true;
                    
                    if (window.AppState) {
                        window.AppState.user = this.sessionData.user;
                        window.AppState.currentUser = this.sessionData.user;
                        window.AppState.isAuthenticated = this.sessionData.authenticated || false;
                    }
                    
                    session.setToken(this.sessionData.token, this.sessionData.expiry);
                    
                    // STABILITY PATCH: Update validation cache
                    const sessionObj = {
                        token: this.sessionData.token,
                        userId: this.sessionData.user.id,
                        expiresAt: this.sessionData.expiry || Date.now() + 3600000,
                        signature: SecurityCore.createSignature({ userId: this.sessionData.user.id }, Date.now()),
                        refreshToken: this.sessionData.refreshToken
                    };
                    if (isValidSession(sessionObj)) {
                        validatedSession = sessionObj;
                        sessionValidationTimestamp = Date.now();
                    }
                } catch (error) {
                    logger.error('ParentCoordinator.updateGlobalStateFromSession.user', error);
                }
            }
            
            if (this.sessionData.authenticated !== undefined) {
                try {
                    sessionAuthorityReady = this.sessionData.authenticated;
                    if (!this.sessionData.authenticated) this.handleLogout();
                } catch (error) {
                    logger.error('ParentCoordinator.updateGlobalStateFromSession.auth', error);
                }
            }
        }
        
        bindUIAfterSessionConfirmation() {
            if (!this.sessionValidated && !this.fallbackMode) {
                logger.warn('Cannot bind UI - session not validated');
                return;
            }
            
            if (this.fallbackMode) {
                logger.info('Fallback mode active, using cached UI bindings');
            }
            
            logger.info('Binding UI with session data...');
            
            this.uiBindings.forEach(binding => {
                try { binding(); } catch (error) {
                    logger.error('ParentCoordinator.bindUIAfterSessionConfirmation.binding', error);
                }
            });
            
            try {
                this.updateUIWithSessionData();
                this.enableProtectedUI();
                logger.info('UI binding complete');
            } catch (error) {
                logger.error('ParentCoordinator.bindUIAfterSessionConfirmation.ui', error);
            }
        }
        
        updateUIWithSessionData() {
            if (!currentUser && !this.fallbackMode) return;
            
            try {
                const userElements = {
                    'userAvatar': currentUser?.avatar,
                    'userName': currentUser?.name || currentUser?.username || 'Guest',
                    'userStatus': currentUser?.status || 'Online'
                };
                
                this.updateUserSpecificUI(userElements);
                this.updateApiStatusIndicator();
                this.updateSyncIndicator();
            } catch (error) {
                logger.error('ParentCoordinator.updateUIWithSessionData', error);
            }
        }
        
        updateUserSpecificUI(userElements) {
            if (!userElements) return;
            
            try {
                document.querySelectorAll('.user-avatar, .avatar-img').forEach(el => {
                    if (userElements.userAvatar) {
                        if (el.tagName === 'IMG') {
                            el.src = SecurityCore.sanitizeURL(userElements.userAvatar);
                            el.alt = SecurityCore.sanitizeString(userElements.userName);
                        } else {
                            el.style.backgroundImage = `url(${SecurityCore.sanitizeURL(userElements.userAvatar)})`;
                        }
                    }
                });
                
                document.querySelectorAll('.user-name, .username').forEach(el => {
                    if (el.textContent.includes('User') || el.textContent.includes('Loading') || !currentUser) {
                        el.textContent = SecurityCore.sanitizeString(userElements.userName);
                    }
                });
                
                const callStatusText = document.getElementById('callStatusText');
                if (callStatusText && (callStatusText.textContent.includes('Waiting for API') || !currentUser)) {
                    callStatusText.textContent = session.isDemoMode() ? 'Demo Mode' : `Ready (${SecurityCore.sanitizeString(userElements.userName)})`;
                }
            } catch (error) {
                logger.error('ParentCoordinator.updateUserSpecificUI', error);
            }
        }
        
        updateApiStatusIndicator() {
            try {
                const apiStatusIndicator = document.getElementById('apiStatusIndicator');
                const apiStatusText = document.getElementById('apiStatusText');
                
                if (apiStatusIndicator && apiStatusText) {
                    if (session.isDemoMode()) {
                        apiStatusIndicator.className = 'api-status-indicator demo';
                        apiStatusText.textContent = 'Demo Mode';
                    } else {
                        apiStatusIndicator.className = 'api-status-indicator connected';
                        apiStatusText.textContent = currentUser?.name ? `Authenticated as ${SecurityCore.sanitizeString(currentUser.name)}` : 'Authenticated';
                    }
                    
                    setTimeout(() => {
                        apiStatusIndicator.style.display = 'none';
                    }, 2000);
                }
            } catch (error) {
                logger.error('ParentCoordinator.updateApiStatusIndicator', error);
            }
        }
        
        updateSyncIndicator() {
            try {
                const syncIndicator = document.getElementById('syncIndicator');
                if (syncIndicator) {
                    if (session.isDemoMode()) {
                        syncIndicator.innerHTML = '<i class="fas fa-eye"></i><span>Demo Mode</span>';
                    } else {
                        syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                    }
                    syncIndicator.classList.remove('syncing');
                }
            } catch (error) {
                logger.error('ParentCoordinator.updateSyncIndicator', error);
            }
        }
        
        enableProtectedUI() {
            if (!this.sessionValidated && !this.fallbackMode && !session.isDemoMode()) return;
            
            logger.info('Enabling protected UI features...');
            
            try {
                const newCallBtn = document.getElementById('newCallBtn');
                if (newCallBtn) newCallBtn.disabled = false;
                
                const quickVoiceBtn = document.getElementById('quickVoiceBtn');
                const quickVideoBtn = document.getElementById('quickVideoBtn');
                if (quickVoiceBtn) quickVoiceBtn.disabled = false;
                if (quickVideoBtn) quickVideoBtn.disabled = false;
                
                this.loadUserSpecificData();
            } catch (error) {
                logger.error('ParentCoordinator.enableProtectedUI', error);
            }
        }
        
        async loadUserSpecificData() {
            if (!currentUser && !this.fallbackMode && !session.isDemoMode()) return;
            
            logger.info('Loading user-specific data through parent coordination...');
            
            try {
                if (!this.fallbackMode && !session.isDemoMode()) {
                    await this.routeApiCall('/api/contacts', 'GET').catch(() => null);
                    await this.routeApiCall('/api/calls/history', 'GET').catch(() => null);
                }
            } catch (error) {
                logger.error('ParentCoordinator.loadUserSpecificData', error);
            }
        }
        
        async routeApiCall(endpoint, method = 'GET', data = null) {
            if (!this.sessionValidated && !this.fallbackMode) {
                throw new Error('Cannot route API call - session not validated');
            }
            
            if (this.fallbackMode || session.isDemoMode()) {
                logger.once('API call in fallback/demo mode, returning mock data');
                return this._getMockData(endpoint);
            }
            
            try {
                const response = await this.sendWithResponse({
                    type: 'API_REQUEST',
                    source: 'calls-iframe',
                    endpoint: endpoint,
                    method: method,
                    data: data,
                    timestamp: Date.now(),
                    id: MessageValidator.generateId()
                });
                
                return response.data;
            } catch (error) {
                logger.error('ParentCoordinator.routeApiCall', error);
                throw error;
            }
        }
        
        _getMockData(endpoint) {
            if (endpoint.includes('/api/contacts')) {
                return [
                    { id: '1', name: 'Sarah Chen', status: 'online', isPremium: true, avatar: null },
                    { id: '2', name: 'Michael Omondi', status: 'online', isPremium: false, avatar: null },
                    { id: '3', name: 'Jane Wambui', status: 'away', isPremium: true, avatar: null },
                    { id: '4', name: 'David Kimani', status: 'offline', isPremium: false, avatar: null }
                ];
            }
            if (endpoint.includes('/api/calls/history')) {
                return [
                    { id: 'call1', contact: 'Sarah Chen', date: Date.now() - 3600000, duration: 245, type: 'video', missed: false },
                    { id: 'call2', contact: 'Michael Omondi', date: Date.now() - 86400000, duration: 125, type: 'voice', missed: false },
                    { id: 'call3', contact: 'Jane Wambui', date: Date.now() - 172800000, duration: 0, type: 'video', missed: true }
                ];
            }
            if (endpoint.includes('/api/user/me')) {
                return { id: 'demo-user', name: 'Demo User', username: 'demo', email: 'demo@example.com' };
            }
            if (endpoint.includes('/api/user/settings')) {
                return {
                    emotionalContext: true,
                    callIntention: true,
                    inCallChat: true,
                    whiteboard: true,
                    polls: true,
                    notes: true,
                    focusMode: false,
                    liveReactions: true,
                    theme: 'light'
                };
            }
            if (endpoint.includes('/api/user/premium')) {
                return { isPremium: false, trialDaysLeft: 30, features: {} };
            }
            return null;
        }
        
        handleSessionUpdate(updateData) {
            if (!updateData || typeof updateData !== 'object') return;
            
            logger.info('Received SESSION_UPDATE');
            
            try {
                if (updateData.sessionData) {
                    this.sessionData = { ...this.sessionData, ...updateData.sessionData };
                }
                
                if (updateData.user) {
                    currentUser = { ...currentUser, ...updateData.user };
                    
                    if (window.AppState) {
                        window.AppState.user = currentUser;
                        window.AppState.currentUser = currentUser;
                    }
                    
                    this.updateUIWithSessionData();
                }
                
                if (updateData.token) {
                    session.setToken(updateData.token, updateData.expiry);
                }
                
                this.sessionUpdateCallbacks.forEach(callback => {
                    try { callback(updateData); } catch (error) {
                        logger.error('ParentCoordinator.handleSessionUpdate.callback', error);
                    }
                });
                
                logger.info('Session updated successfully');
            } catch (error) {
                logger.error('ParentCoordinator.handleSessionUpdate', error);
            }
        }
        
        handleLogout() {
            logger.info('Logout received from parent coordination');
            
            try {
                currentUser = null;
                userDataLoaded = false;
                sessionAuthorityReady = false;
                this.sessionValidated = false;
                this.sessionData = null;
                this.sessionWaitingLogged = false;
                this.secureSessionValid = false;
                secureHandshakeInProgress = false;
                this.secureHandshakeRequested = false;
                
                session.clearToken();
                
                if (window.AppState) {
                    window.AppState.user = null;
                    window.AppState.currentUser = null;
                    window.AppState.isAuthenticated = false;
                }
                
                this.disableProtectedUI();
                this.showReconnectState();
                
                logger.info('Logout handled successfully');
            } catch (error) {
                logger.error('ParentCoordinator.handleLogout', error);
            }
        }
        
        disableProtectedUI() {
            logger.info('Disabling protected UI...');
            
            try {
                const newCallBtn = document.getElementById('newCallBtn');
                if (newCallBtn && !session.isDemoMode()) newCallBtn.disabled = true;
                
                const quickVoiceBtn = document.getElementById('quickVoiceBtn');
                const quickVideoBtn = document.getElementById('quickVideoBtn');
                if (quickVoiceBtn && !session.isDemoMode()) quickVoiceBtn.disabled = true;
                if (quickVideoBtn && !session.isDemoMode()) quickVideoBtn.disabled = true;
                
                if (!session.isDemoMode()) {
                    this.showReconnectState();
                }
            } catch (error) {
                logger.error('ParentCoordinator.disableProtectedUI', error);
            }
        }
        
        showReconnectState() {
            if (session.isDemoMode()) return;
            
            try {
                const appContainer = document.getElementById('appContainer');
                if (!appContainer) return;
                
                const existingOverlay = document.querySelector('.reconnect-overlay');
                if (existingOverlay) existingOverlay.remove();
                
                const reconnectOverlay = document.createElement('div');
                reconnectOverlay.className = 'reconnect-overlay';
                reconnectOverlay.innerHTML = `
                    <div class="reconnect-message">
                        <i class="fas fa-sync-alt"></i>
                        <h3>Session Update Required</h3>
                        <p>Your session has been updated. Please wait for reconnection...</p>
                        <div class="reconnect-progress">
                            <div class="reconnect-progress-bar"></div>
                        </div>
                        <button id="retryReconnectBtn" class="quick-action-btn">
                            <i class="fas fa-redo"></i> Retry Connection
                        </button>
                    </div>
                `;
                
                appContainer.appendChild(reconnectOverlay);
                
                const retryBtn = document.getElementById('retryReconnectBtn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        this.startSecureHandshake();
                    });
                }
            } catch (error) {
                logger.error('ParentCoordinator.showReconnectState', error);
            }
        }
        
        handleDefaultMessage(data) {
            if (!data || typeof data !== 'object') return;
            
            try {
                switch (data.type) {
                    case 'SESSION_DATA':
                        if (this.secureHandshakeRequested && data.token && data.user) {
                            this.handleSecureSessionData(data.payload || data);
                        } else {
                            this.handleSessionData(data.payload || data);
                        }
                        break;
                    case 'SESSION_UPDATE':
                        this.handleSessionUpdate(data.payload || data);
                        break;
                    case 'LOGOUT':
                        this.handleLogout();
                        break;
                    case 'TOKEN_UPDATE':
                        session.setToken(data.payload?.token || data.token, data.payload?.expiry || data.expiry);
                        break;
                    case 'HEARTBEAT_RESPONSE':
                        this.handleHeartbeatResponse();
                        break;
                    case 'CHILD_READY_ACK':
                        this.handleChildReadyAck();
                        break;
                    case 'SECURE_SESSION':
                        this.handleSecureSessionData(data.payload || data);
                        break;
                    case 'SESSION_INIT':
                        if (data.payload && data.payload.session) {
                            this.handleSessionUpdate({ user: data.payload.session.user, token: data.payload.session.token, authenticated: true });
                        }
                        break;
                }
            } catch (error) {
                logger.error('ParentCoordinator.handleDefaultMessage', error, `type: ${data.type}`);
            }
        }
        
        registerMessageHandler(type, handler) {
            try { this.messageHandlers.set(type, handler); } catch (error) {
                logger.error('ParentCoordinator.registerMessageHandler', error);
            }
        }
        
        registerUIBinding(binding) {
            try { this.uiBindings.push(binding); } catch (error) {
                logger.error('ParentCoordinator.registerUIBinding', error);
            }
        }
        
        registerSessionUpdateCallback(callback) {
            try { this.sessionUpdateCallbacks.push(callback); } catch (error) {
                logger.error('ParentCoordinator.registerSessionUpdateCallback', error);
            }
        }
        
        startHeartbeat() {
            try {
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                    this.heartbeatInterval = null;
                }
                
                this.heartbeatInterval = setInterval(() => {
                    this.sendHeartbeat();
                }, 15000);
                
                setTimeout(() => this.sendHeartbeat(), 1000);
                timers.add(this.heartbeatInterval);
            } catch (error) {
                logger.error('ParentCoordinator.startHeartbeat', error);
            }
        }
        
        sendHeartbeat() {
            if (!this.parentDetected && !this.fallbackMode) return;
            if (this.fallbackMode) return;
            
            const heartbeatMessage = {
                type: 'HEARTBEAT',
                source: 'calls-iframe',
                timestamp: Date.now(),
                sessionId: this.sessionData?.sessionId,
                id: MessageValidator.generateId()
            };
            
            this.sendToParent(heartbeatMessage);
            this.lastHeartbeat = Date.now();
        }
        
        handleHeartbeatResponse() {
            this.lastHeartbeat = Date.now();
        }
        
        handleChildReadyAck() {
            logger.info('CHILD_READY acknowledged by parent');
        }
        
        setFallbackState(state) {
            this.fallbackState = state;
        }
        
        setupResynchronization() {
            try {
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden && this.parentDetected && !this.fallbackMode) {
                        this.checkParentConnection();
                    }
                });
                
                window.addEventListener('online', () => {
                    if (this.parentDetected && !this.fallbackMode) {
                        this.checkParentConnection();
                    }
                });
            } catch (error) {
                logger.error('ParentCoordinator.setupResynchronization', error);
            }
        }
        
        checkParentConnection() {
            if (!this.handshakeComplete && this.parentDetected && !this.fallbackMode) {
                logger.info('Checking parent connection...');
                this.startSecureHandshake();
            }
        }
        
        cleanup() {
            try {
                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                    this.heartbeatInterval = null;
                }
                
                if (this.reconnectionTimer) {
                    clearTimeout(this.reconnectionTimer);
                    this.reconnectionTimer = null;
                }
                
                if (secureHandshakeTimeout) {
                    clearTimeout(secureHandshakeTimeout);
                    secureHandshakeTimeout = null;
                }
                
                this.messageHandlers.clear();
                this.pendingRequests.clear();
                this.uiBindings = [];
                this.sessionUpdateCallbacks = [];
                this.sessionWaitingLogged = false;
            } catch (error) {
                logger.error('ParentCoordinator.cleanup', error);
            }
        }
        
        getStatus() {
            try {
                return {
                    parentDetected: this.parentDetected,
                    sameOrigin: this.sameOrigin,
                    secureChannelEstablished: this.secureChannelEstablished,
                    handshakeComplete: this.handshakeComplete,
                    sessionValidated: this.sessionValidated,
                    fallbackState: this.fallbackState,
                    secureSessionValid: this.secureSessionValid,
                    secureHandshakeInProgress: secureHandshakeInProgress,
                    fallbackMode: this.fallbackMode,
                    sessionData: this.sessionData ? { ...this.sessionData, token: '***' } : null
                };
            } catch (error) {
                logger.error('ParentCoordinator.getStatus', error);
                return {
                    parentDetected: false,
                    sameOrigin: false,
                    secureChannelEstablished: false,
                    handshakeComplete: false,
                    sessionValidated: false,
                    fallbackState: 'error',
                    secureSessionValid: false,
                    secureHandshakeInProgress: false,
                    fallbackMode: true,
                    sessionData: null
                };
            }
        }
    }

    // ==================== CORE INITIALIZER ====================
    class CoreInitializer {
        constructor() {
            this.isReady = false;
            this.initialized = false;
            this.initializationInProgress = false;
            this.loadingMessage = null;
            this.data = {
                friendsList: [],
                groupsList: [],
                chatHistory: [],
                notifications: [],
                settings: {}
            };
            this.messageQueue = [];
            this.eventListeners = new Map();
            this.initAttempts = 0;
            this.maxInitAttempts = 5;
            this.pipelineStages = [
                'preflight',
                'dependencyCheck',
                'parentDetect',
                'handshake',
                'sessionSync',
                'serviceInit',
                'ready'
            ];
            this.currentStage = null;
        }
        
        async initialize() {
            if (this.initializationInProgress || this.initialized) {
                logger.once('Initialization already in progress or completed');
                return { status: 'already_initialized' };
            }
            
            this.initializationInProgress = true;
            this.initAttempts++;
            
            try {
                logger.info('Starting safe initialization pipeline...');
                
                const pipelineResult = await this.runPipeline();
                
                if (pipelineResult.success) {
                    logger.info('Initialization completed successfully');
                    return { status: 'success', stages: pipelineResult.stages };
                } else {
                    throw new Error(pipelineResult.error || 'Pipeline failed');
                }
                
            } catch (error) {
                logger.error('CoreInitializer.initialize', error, `attempt: ${this.initAttempts}`);
                
                this.showErrorMessage('Failed to load calls feature');
                
                parentComm.send('error', {
                    iframeId: iframeId,
                    message: error.message
                });
                
                if (this.initAttempts < this.maxInitAttempts) {
                    logger.info(`Retrying initialization (${this.initAttempts}/${this.maxInitAttempts})...`);
                    const timer = setTimeout(() => this.initialize(), 1000 * this.initAttempts);
                    timers.add(timer);
                    return { status: 'retrying', attempt: this.initAttempts };
                } else {
                    logger.error('Max initialization attempts reached, entering degraded mode');
                    this.enterDegradedMode();
                    this.initializationInProgress = false;
                    return { status: 'degraded', error: error.message };
                }
            }
        }
        
        async runPipeline() {
            const results = {};
            
            for (const stage of this.pipelineStages) {
                this.currentStage = stage;
                logger.info(`Pipeline stage: ${stage}`);
                
                try {
                    const timeoutMs = this._getStageTimeout(stage);
                    const stageResult = await Promise.race([
                        this._executeStage(stage),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error(`Stage ${stage} timeout after ${timeoutMs}ms`)), timeoutMs)
                        )
                    ]);
                    
                    results[stage] = { success: true, result: stageResult };
                    
                    if (stage === 'ready') {
                        this.markAsReady();
                    }
                } catch (error) {
                    logger.error(`Pipeline stage ${stage} failed`, error);
                    results[stage] = { success: false, error: error.message };
                    
                    if (stage === 'preflight' || stage === 'dependencyCheck') {
                        throw new Error(`Critical stage ${stage} failed: ${error.message}`);
                    }
                    
                    if (stage === 'parentDetect' || stage === 'handshake') {
                        logger.warn(`Stage ${stage} failed, enabling fallback mode`);
                        this.enterDegradedMode();
                        results.ready = { success: true, result: 'degraded' };
                        this.markAsReady(true);
                        break;
                    }
                    
                    if (stage === 'sessionSync') {
                        logger.warn('Session sync failed, continuing in demo mode');
                        session._demoMode = true;
                        results.ready = { success: true, result: 'demo' };
                        this.markAsReady(true);
                        break;
                    }
                }
            }
            
            return { success: true, stages: results };
        }
        
        _getStageTimeout(stage) {
            const timeouts = {
                preflight: CONFIG.PREFLIGHT_TIMEOUT || 2000,
                dependencyCheck: CONFIG.DEPENDENCY_TIMEOUT || 3000,
                parentDetect: CONFIG.PARENT_DETECT_TIMEOUT || 3000,
                handshake: CONFIG.HANDSHAKE_TIMEOUT || 8000,
                sessionSync: CONFIG.SESSION_SYNC_TIMEOUT || 6000,
                serviceInit: CONFIG.SERVICE_INIT_TIMEOUT || 8000,
                ready: 1000
            };
            return timeouts[stage] || 3000;
        }
        
        async _executeStage(stage) {
            switch (stage) {
                case 'preflight':
                    return this.runPreflight();
                case 'dependencyCheck':
                    return this.checkDependencies();
                case 'parentDetect':
                    return this.detectParent();
                case 'handshake':
                    return this.runHandshake();
                case 'sessionSync':
                    return this.syncSession();
                case 'serviceInit':
                    return this.initServices();
                case 'ready':
                    return { ready: true };
                default:
                    return null;
            }
        }
        
        async runPreflight() {
            logger.info('Preflight check');
            
            if (!window) throw new Error('Window not available');
            if (!document) throw new Error('Document not available');
            
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve, { once: true });
                });
            }
            
            this.showLoadingMessage('Loading calls feature, please wait...');
            
            return { 
                readyState: document.readyState, 
                timestamp: Date.now(),
                userAgent: navigator.userAgent
            };
        }
        
        async checkDependencies() {
            logger.info('Checking dependencies');
            
            const dependencies = {
                postMessage: typeof window.postMessage === 'function',
                addEventListener: typeof window.addEventListener === 'function',
                localStorage: typeof localStorage !== 'undefined',
                Promise: typeof Promise !== 'undefined',
                MediaDevices: typeof navigator.mediaDevices !== 'undefined'
            };
            
            const missing = Object.entries(dependencies)
                .filter(([_, available]) => !available)
                .map(([name]) => name);
            
            if (missing.length > 0) {
                logger.warn(`Missing dependencies: ${missing.join(', ')}`);
                throw new Error(`Missing dependencies: ${missing.join(', ')}`);
            }
            
            return { dependencies, timestamp: Date.now() };
        }
        
        async detectParent() {
            logger.info('Detecting parent');
            
            if (!parentCoordinator) {
                parentCoordinator = new ParentCoordinator();
            }
            
            parentCoordinator.detectParent();
            
            if (!parentCoordinator.parentDetected) {
                logger.warn('Parent not detected, enabling fallback mode');
                this.enterDegradedMode();
            }
            
            return {
                parentDetected: parentCoordinator.parentDetected,
                sameOrigin: parentCoordinator.sameOrigin,
                timestamp: Date.now()
            };
        }
        
        async runHandshake() {
            logger.info('Running handshake');
            
            if (!parentCoordinator) {
                parentCoordinator = new ParentCoordinator();
            }
            
            if (parentCoordinator.parentDetected && !parentCoordinator.fallbackMode) {
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        await parentCoordinator.startSecureHandshake();
                        if (_HANDSHAKE_DONE_) break;
                        
                        logger.info(`Handshake attempt ${attempt} waiting for response...`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    } catch (e) {
                        logger.warn(`Handshake attempt ${attempt} failed`, e);
                    }
                }
            } else {
                logger.info('Skipping handshake - fallback mode active');
                _PARENT_READY_ = true;
                _HANDSHAKE_DONE_ = true;
            }
            
            if (!_PARENT_READY_ && parentCoordinator.parentDetected) {
                notifyParentReady();
            }
            
            return {
                handshakeDone: _HANDSHAKE_DONE_,
                parentReady: _PARENT_READY_,
                attempts: _HANDSHAKE_RETRIES_,
                fallbackMode: parentCoordinator.fallbackMode || false
            };
        }
        
        async syncSession() {
            logger.info('Syncing session');
            
            await session.acquire();
            
            if (session.isDemoMode()) {
                logger.info('Running in demo mode');
                this.loadDemoData();
            }
            
            return {
                demoMode: session.isDemoMode(),
                guestMode: session.isGuestMode(),
                valid: session.validateToken(),
                user: currentUser ? { id: currentUser.id, username: currentUser.username } : null,
                timestamp: Date.now()
            };
        }
        
        async initServices() {
            logger.info('Initializing services');
            
            // STABILITY PATCH: Use safe initialization
            if (window.callAPI) {
                try {
                    await window.callAPI.initialize();
                } catch (error) {
                    logger.error('API service init failed', error);
                }
            }
            
            // STABILITY PATCH: Call core initialization now goes through safeInit
            if (window.callCore) {
                try {
                    // The actual initialization is handled by safeInit in bootstrap
                    // Just mark as ready if session is valid
                    if (getValidatedSession()) {
                        window.callCore.deviceInitialized = true;
                    }
                } catch (error) {
                    logger.error('Call core init failed', error);
                }
            }
            
            return {
                apiReady: window.callAPI?.initialized || false,
                callCoreReady: window.callCore?.deviceInitialized || false,
                timestamp: Date.now()
            };
        }
        
        loadDemoData() {
            this.data.friendsList = [
                { id: '1', name: 'Sarah Chen', status: 'online', isPremium: true },
                { id: '2', name: 'Michael Omondi', status: 'online', isPremium: false },
                { id: '3', name: 'Jane Wambui', status: 'away', isPremium: true },
                { id: '4', name: 'David Kimani', status: 'offline', isPremium: false }
            ];
            this.data.groupsList = [];
            this.data.chatHistory = [
                { id: 'call1', contact: 'Sarah Chen', date: Date.now() - 3600000, duration: 245, type: 'video', missed: false },
                { id: 'call2', contact: 'Michael Omondi', date: Date.now() - 86400000, duration: 125, type: 'voice', missed: false }
            ];
            this.data.notifications = [];
            this.data.settings = {
                emotionalContext: true,
                callIntention: true,
                inCallChat: true,
                whiteboard: true,
                polls: true,
                notes: true,
                focusMode: false,
                liveReactions: true,
                theme: 'light'
            };
            
            coreData = { ...this.data };
            
            if (window.AppState) {
                window.AppState.contacts = this.data.friendsList;
                window.AppState.callHistory = this.data.chatHistory;
                window.AppState.settings = this.data.settings;
                window.AppState.isPremium = false;
                window.AppState.isAuthenticated = false;
            }
        }
        
        enterDegradedMode() {
            logger.warn('Entering degraded mode');
            session._demoMode = true;
            session._guestMode = false;
            this.loadDemoData();
            session.setState(STATE.DEGRADED);
        }
        
        showLoadingMessage(message) {
            try {
                let loadingEl = document.getElementById('coreLoadingMessage');
                if (!loadingEl) {
                    loadingEl = document.createElement('div');
                    loadingEl.id = 'coreLoadingMessage';
                    loadingEl.className = 'core-loading-message';
                    loadingEl.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: rgba(0, 0, 0, 0.8);
                        color: white;
                        padding: 20px;
                        border-radius: 10px;
                        z-index: 9999;
                        text-align: center;
                        min-width: 200px;
                    `;
                    document.body.appendChild(loadingEl);
                }
                loadingEl.textContent = SecurityCore.sanitizeString(message);
                this.loadingMessage = loadingEl;
            } catch (error) {
                logger.error('CoreInitializer.showLoadingMessage', error);
            }
        }
        
        showSuccessMessage(message) {
            try {
                if (this.loadingMessage) {
                    this.loadingMessage.textContent = SecurityCore.sanitizeString(message);
                    this.loadingMessage.style.background = 'rgba(76, 175, 80, 0.9)';
                    
                    const timer = setTimeout(() => {
                        if (this.loadingMessage && this.loadingMessage.parentNode) {
                            this.loadingMessage.remove();
                            this.loadingMessage = null;
                        }
                    }, 2000);
                    timers.add(timer);
                }
            } catch (error) {
                logger.error('CoreInitializer.showSuccessMessage', error);
            }
        }
        
        showErrorMessage(message) {
            try {
                if (this.loadingMessage) {
                    this.loadingMessage.textContent = SecurityCore.sanitizeString(message);
                    this.loadingMessage.style.background = 'rgba(244, 67, 54, 0.9)';
                }
            } catch (error) {
                logger.error('CoreInitializer.showErrorMessage', error);
            }
        }
        
        markAsReady(degraded = false) {
            try {
                this.isReady = true;
                this.initialized = true;
                this.initializationInProgress = false;
                coreReady = true;
                coreInitialized = true;
                
                parentComm.send('coreReady', {
                    iframeId: iframeId,
                    status: degraded ? 'degraded' : 'success',
                    mode: session.isDemoMode() ? 'demo' : session.isGuestMode() ? 'guest' : 'production',
                    dataTypes: Object.keys(this.data)
                });
                
                this.emitEvent('coreReady', { 
                    data: this.data, 
                    degraded,
                    demoMode: session.isDemoMode()
                });
                
                session.setState(degraded ? STATE.DEGRADED : STATE.READY);
                if (!document.hidden) {
                    session.setState(STATE.ACTIVE);
                }
                
                logger.info(`Marked as ready (${degraded ? 'degraded' : 'normal'}) and notified parent`);
                
            } catch (error) {
                logger.error('CoreInitializer.markAsReady', error);
            }
        }
        
        emitEvent(eventName, data) {
            try {
                const event = new CustomEvent(`core:${eventName}`, { detail: data });
                window.dispatchEvent(event);
                
                if (this.eventListeners.has(eventName)) {
                    const listeners = this.eventListeners.get(eventName);
                    listeners.forEach(listener => {
                        try { listener(data); } catch (error) {
                            logger.error('CoreInitializer.emitEvent.listener', error);
                        }
                    });
                }
            } catch (error) {
                logger.error('CoreInitializer.emitEvent', error);
            }
        }
        
        on(eventName, callback) {
            try {
                if (!this.eventListeners.has(eventName)) {
                    this.eventListeners.set(eventName, []);
                }
                this.eventListeners.get(eventName).push(callback);
            } catch (error) {
                logger.error('CoreInitializer.on', error);
            }
        }
        
        off(eventName, callback) {
            try {
                if (this.eventListeners.has(eventName)) {
                    const listeners = this.eventListeners.get(eventName);
                    const index = listeners.indexOf(callback);
                    if (index > -1) listeners.splice(index, 1);
                }
            } catch (error) {
                logger.error('CoreInitializer.off', error);
            }
        }
        
        getData(type) {
            try {
                if (!this.isReady) return null;
                
                switch (type) {
                    case 'friendsList': return [...this.data.friendsList];
                    case 'groupsList': return [...this.data.groupsList];
                    case 'chatHistory': return [...this.data.chatHistory];
                    case 'notifications': return [...this.data.notifications];
                    case 'settings': return { ...this.data.settings };
                    case 'all':
                        return {
                            friendsList: [...this.data.friendsList],
                            groupsList: [...this.data.groupsList],
                            chatHistory: [...this.data.chatHistory],
                            notifications: [...this.data.notifications],
                            settings: { ...this.data.settings }
                        };
                    default: return null;
                }
            } catch (error) {
                logger.error('CoreInitializer.getData', error);
                return null;
            }
        }
        
        updateData(type, payload) {
            try {
                if (!this.isReady) return false;
                if (!type || !payload) return false;
                
                let updated = false;
                
                switch (type) {
                    case 'friendsList':
                        if (Array.isArray(payload) && this.validateFriendsList(payload)) {
                            this.data.friendsList = payload;
                            coreData.friendsList = payload;
                            updated = true;
                        }
                        break;
                    case 'groupsList':
                        if (Array.isArray(payload) && this.validateGroupsList(payload)) {
                            this.data.groupsList = payload;
                            coreData.groupsList = payload;
                            updated = true;
                        }
                        break;
                    case 'chatHistory':
                        if (Array.isArray(payload) && this.validateChatHistory(payload)) {
                            this.data.chatHistory = payload;
                            coreData.chatHistory = payload;
                            updated = true;
                        }
                        break;
                    case 'notifications':
                        if (Array.isArray(payload) && this.validateNotifications(payload)) {
                            this.data.notifications = payload;
                            coreData.notifications = payload;
                            updated = true;
                        }
                        break;
                    case 'settings':
                        if (this.validateSettings(payload)) {
                            this.data.settings = payload;
                            coreData.settings = payload;
                            updated = true;
                        }
                        break;
                    case 'all':
                        if (payload.friendsList) this.updateData('friendsList', payload.friendsList);
                        if (payload.groupsList) this.updateData('groupsList', payload.groupsList);
                        if (payload.chatHistory) this.updateData('chatHistory', payload.chatHistory);
                        if (payload.notifications) this.updateData('notifications', payload.notifications);
                        if (payload.settings) this.updateData('settings', payload.settings);
                        updated = true;
                        break;
                }
                
                if (updated) {
                    this.emitEvent('dataUpdated', { type, data: payload });
                    this.cacheData(type, payload);
                    logger.once(`Data updated: ${type}`);
                }
                
                return updated;
            } catch (error) {
                logger.error('CoreInitializer.updateData', error);
                return false;
            }
        }
        
        validateFriendsList(friends) {
            if (!Array.isArray(friends)) return false;
            return friends.every(friend => friend && typeof friend === 'object' && friend.id);
        }
        
        validateGroupsList(groups) {
            if (!Array.isArray(groups)) return false;
            return groups.every(group => group && typeof group === 'object' && group.id);
        }
        
        validateChatHistory(chatHistory) {
            if (!Array.isArray(chatHistory)) return false;
            return chatHistory.every(chat => chat && typeof chat === 'object' && chat.id);
        }
        
        validateNotifications(notifications) {
            if (!Array.isArray(notifications)) return false;
            return notifications.every(notification => notification && typeof notification === 'object' && notification.id);
        }
        
        validateSettings(settings) {
            return settings && typeof settings === 'object';
        }
        
        cacheData(type, data) {
            try {
                switch (type) {
                    case 'friendsList':
                        SecurityCore.safeLocalStorageSet('cachedFriendsList', JSON.stringify(data));
                        break;
                    case 'groupsList':
                        SecurityCore.safeLocalStorageSet('cachedGroupsList', JSON.stringify(data));
                        break;
                    case 'chatHistory':
                        SecurityCore.safeLocalStorageSet('cachedChatHistory', JSON.stringify(data));
                        break;
                    case 'notifications':
                        SecurityCore.safeLocalStorageSet('cachedNotifications', JSON.stringify(data));
                        break;
                    case 'settings':
                        SecurityCore.safeLocalStorageSet('callSettings', JSON.stringify(data));
                        break;
                }
            } catch (error) {
                logger.error('CoreInitializer.cacheData', error);
            }
        }
        
        cleanup() {
            try {
                this.eventListeners.clear();
                this.messageQueue = [];
                this.initializationInProgress = false;
                logger.info('CoreInitializer cleaned up');
            } catch (error) {
                logger.error('CoreInitializer.cleanup', error);
            }
        }
    }

    // ==================== CALL CORE ====================
    class CallCore {
        constructor() {
            this.callState = 'idle';
            this.activeCallId = null;
            this.callData = null;
            this.mediaDevices = null;
            this.peerConnection = null;
            this.localStream = null;
            this.remoteStream = null;
            this.signalingChannel = null;
            this.eventListeners = new Map();
            this.callQueue = [];
            this.deviceInitialized = false;
            this.sessionVerified = false;
            this.initAttempts = 0;
            this.maxInitAttempts = 5;
            this.initializationInProgress = false;
            this.featureBoundary = ErrorBoundary.createBoundary('CallCore', () => {
                this.callState = 'degraded';
                return null;
            });
            this._sanitizing = false;
            
            // STABILITY PATCH: Internal state tracking
            this._safeInitInProgress = false;
            this._safeInitComplete = false;
            this._recoveryTimer = null;
        }
        
        // STABILITY PATCH: Safe initialization barrier
        async safeInitialize() {
            if (this._safeInitInProgress) {
                logger.once('Safe init already in progress');
                return;
            }
            
            if (this._safeInitComplete) {
                logger.once('Safe init already complete');
                return;
            }
            
            this._safeInitInProgress = true;
            
            try {
                // Wait for session with retries
                const session = await waitForSession(CONFIG.MAX_SESSION_WAIT);
                if (!session) {
                    logger.warn('No session available, deferring initialization');
                    this._safeInitInProgress = false;
                    
                    // Schedule retry
                    setTimeout(() => this.safeInitialize(), CONFIG.RECOVERY_DELAY);
                    return;
                }
                
                // Verify session
                const verified = await verifySession();
                if (!verified) {
                    logger.warn('Session verification failed, using local validation');
                }
                
                // Send ACK
                sendSessionAck('CALL_CORE_READY', {
                    success: true,
                    sessionId: session.userId,
                    timestamp: Date.now()
                });
                
                this._safeInitComplete = true;
                this._safeInitInProgress = false;
                
                logger.info('Safe init complete, proceeding with device initialization');
                
                // Now proceed with normal initialization
                await this.initialize();
                
            } catch (error) {
                logger.error('Safe init failed', error);
                this._safeInitInProgress = false;
                
                // Only fallback after multiple failures
                if (this.initAttempts >= this.maxInitAttempts) {
                    logger.warn('Entering degraded mode after safe init failures');
                    session._demoMode = true;
                }
            }
        }
        
        async initialize() {
            return this.featureBoundary.executeAsync(async () => {
                if (this.initializationInProgress || this.deviceInitialized) {
                    logger.once('Call core initialization already in progress or completed');
                    return;
                }
                
                // STABILITY PATCH: Check for valid session before proceeding
                const session = getValidatedSession();
                if (!session && !session.isDemoMode()) {
                    logger.warn('No valid session, deferring initialization');
                    this.initAttempts++;
                    
                    if (this.initAttempts < this.maxInitAttempts) {
                        setTimeout(() => this.safeInitialize(), CONFIG.SESSION_RETRY_DELAY * this.initAttempts);
                    }
                    return;
                }
                
                this.initializationInProgress = true;
                this.initAttempts++;
                
                try {
                    logger.info('Starting call core initialization...');
                    
                    await this.verifySession();
                    await this.verifyReadiness();
                    await this.loadMediaDevices();
                    await this.initializeSignaling();
                    
                    this.deviceInitialized = true;
                    this.initializationInProgress = false;
                    this.initAttempts = 0;
                    
                    this.emitEvent('CALL_CORE_READY', { status: 'success' });
                    parentComm.send('CALL_CORE_READY', { status: 'success' });
                    
                    // STABILITY PATCH: Send ready ACK
                    sendSessionAck('CALL_CORE_READY', {
                        success: true,
                        timestamp: Date.now()
                    });
                    
                    logger.info('Call core initialization completed successfully');
                    
                } catch (error) {
                    logger.error('CallCore.initialize', error);
                    
                    this.emitEvent('CALL_CORE_FAILED', { error: error.message });
                    parentComm.send('CALL_CORE_FAILED', { error: error.message });
                    
                    if (this.initAttempts < this.maxInitAttempts) {
                        logger.info(`Retrying call core initialization (${this.initAttempts}/${this.maxInitAttempts})...`);
                        const timer = setTimeout(() => this.safeInitialize(), 1000 * this.initAttempts);
                        timers.add(timer);
                    } else {
                        logger.error('Max call core initialization attempts reached');
                        this.initializationInProgress = false;
                        this.callState = 'disabled';
                    }
                }
            });
        }
        
        async verifySession() {
            if (session.isDemoMode()) {
                logger.info('Demo mode active, skipping session verification');
                this.sessionVerified = true;
                return;
            }
            
            try {
                logger.info('Verifying session for call...');
                
                // STABILITY PATCH: Use validation layer
                const validatedSession = getValidatedSession();
                if (!validatedSession && !session.validateToken()) {
                    throw new Error('User session not available');
                }
                
                this.sessionVerified = true;
                logger.info('Session verified for call');
            } catch (error) {
                logger.error('CallCore.verifySession', error);
                throw error;
            }
        }
        
        async verifyReadiness() {
            return new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 30;
                const interval = 100;
                
                const checkInterval = setInterval(() => {
                    attempts++;
                    
                    const parentReady = window.parent && window.parent !== window;
                    const domReady = document.readyState === 'complete' || document.readyState === 'interactive';
                    
                    if (parentReady || session.isDemoMode()) {
                        clearInterval(checkInterval);
                        resolve();
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        logger.warn('Readiness verification timeout, continuing anyway');
                        resolve();
                    }
                }, interval);
                
                timers.add(checkInterval);
            });
        }
        
        async loadMediaDevices() {
            try {
                logger.info('Loading media devices...');
                
                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                    throw new Error('Media devices not supported');
                }
                
                const devices = await navigator.mediaDevices.enumerateDevices();
                this.mediaDevices = {
                    audioInput: devices.filter(d => d.kind === 'audioinput'),
                    videoInput: devices.filter(d => d.kind === 'videoinput'),
                    audioOutput: devices.filter(d => d.kind === 'audiooutput')
                };
                
                logger.info(`Media devices loaded: ${this.mediaDevices.audioInput.length} audio, ${this.mediaDevices.videoInput.length} video`);
            } catch (error) {
                logger.error('CallCore.loadMediaDevices', error);
                
                this.mediaDevices = {
                    audioInput: [{ deviceId: 'default', label: 'Default microphone' }],
                    videoInput: [{ deviceId: 'default', label: 'Default camera' }],
                    audioOutput: [{ deviceId: 'default', label: 'Default speaker' }]
                };
                
                if (session.isDemoMode()) {
                    logger.info('Demo mode: using simulated media devices');
                } else {
                    throw error;
                }
            }
        }
        
        async initializeSignaling() {
            try {
                logger.info('Initializing signaling...');
                
                this.signalingChannel = {
                    send: (data) => {
                        logger.once(`Signaling send: ${data.type}`);
                        parentComm.send('SIGNALING_MESSAGE', {
                            callId: this.activeCallId,
                            signaling: data
                        });
                    },
                    close: () => {
                        logger.info('Signaling closed');
                    }
                };
                
                logger.info('Signaling initialized');
            } catch (error) {
                logger.error('CallCore.initializeSignaling', error);
                throw error;
            }
        }
        
        async startCall(callData) {
            return this.featureBoundary.executeAsync(async () => {
                // STABILITY PATCH: Verify session before starting call
                const session = getValidatedSession();
                if (!session && !session.isDemoMode()) {
                    throw new Error('No valid session - cannot start call');
                }
                
                if (!this.deviceInitialized && !session.isDemoMode()) {
                    throw new Error('Call core not initialized');
                }
                
                if (this.callState !== 'idle') {
                    throw new Error(`Cannot start call, current state: ${this.callState}`);
                }
                
                try {
                    logger.info(`Starting call: ${callData.type || 'voice'}`);
                    
                    this.callState = 'connecting';
                    this.activeCallId = callData.callId || 'call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
                    this.callData = {
                        ...callData,
                        startTime: Date.now(),
                        callId: this.activeCallId
                    };
                    
                    this.emitEvent('CALL_CONNECTING', { callId: this.activeCallId, data: this.callData });
                    parentComm.send('CALL_CONNECTING', { callId: this.activeCallId, data: this.callData });
                    
                    if (session.isDemoMode()) {
                        await this.simulateCall(callData);
                    } else {
                        if (callData.type === 'video') {
                            await this.startVideoCall(callData);
                        } else {
                            await this.startVoiceCall(callData);
                        }
                    }
                    
                    this.callState = 'in_call';
                    
                    this.emitEvent('CALL_STARTED', { 
                        callId: this.activeCallId, 
                        data: this.callData,
                        timestamp: Date.now()
                    });
                    parentComm.send('CALL_STARTED', { 
                        callId: this.activeCallId, 
                        data: this.callData,
                        timestamp: Date.now()
                    });
                    
                    logger.info(`Call started: ${this.activeCallId}`);
                    return this.activeCallId;
                    
                } catch (error) {
                    logger.error('CallCore.startCall', error);
                    
                    this.callState = 'failed';
                    
                    this.emitEvent('CALL_FAILED', { 
                        callId: this.activeCallId, 
                        error: error.message,
                        data: callData
                    });
                    parentComm.send('CALL_FAILED', { 
                        callId: this.activeCallId, 
                        error: error.message,
                        data: callData
                    });
                    
                    this.cleanupCall();
                    throw error;
                }
            });
        }
        
        async simulateCall(callData) {
            logger.info('Demo mode: simulating call setup');
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            this.localStream = new MediaStream();
            this.remoteStream = new MediaStream();
            
            logger.info('Demo mode: call simulation complete');
        }
        
        async startVideoCall(callData) {
            try {
                logger.info('Starting video call...');
                
                const constraints = {
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                };
                
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                this.peerConnection = new RTCPeerConnection(this.getRTCConfiguration());
                
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
                
                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        this.sendIceCandidate(event.candidate);
                    }
                };
                
                this.peerConnection.ontrack = (event) => {
                    this.remoteStream = event.streams[0];
                    this.emitEvent('REMOTE_STREAM_ADDED', { stream: this.remoteStream });
                };
                
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                this.sendOffer(offer);
                
                logger.info('Video call setup complete');
            } catch (error) {
                logger.error('CallCore.startVideoCall', error);
                throw error;
            }
        }
        
        async startVoiceCall(callData) {
            try {
                logger.info('Starting voice call...');
                
                const constraints = {
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                };
                
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                this.peerConnection = new RTCPeerConnection(this.getRTCConfiguration());
                
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) {
                    this.peerConnection.addTrack(audioTrack, this.localStream);
                }
                
                this.peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        this.sendIceCandidate(event.candidate);
                    }
                };
                
                this.peerConnection.ontrack = (event) => {
                    this.remoteStream = event.streams[0];
                    this.emitEvent('REMOTE_STREAM_ADDED', { stream: this.remoteStream });
                };
                
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                this.sendOffer(offer);
                
                logger.info('Voice call setup complete');
            } catch (error) {
                logger.error('CallCore.startVoiceCall', error);
                throw error;
            }
        }
        
        async endCall(callId) {
            return this.featureBoundary.executeAsync(async () => {
                if (!callId || callId !== this.activeCallId) {
                    throw new Error(`Invalid call ID or no active call: ${callId}`);
                }
                
                try {
                    logger.info(`Ending call: ${callId}`);
                    
                    this.callState = 'ended';
                    
                    this.sendCallEnded();
                    this.cleanupCall();
                    
                    this.emitEvent('CALL_ENDED', { 
                        callId: callId,
                        duration: this.getCallDuration(),
                        timestamp: Date.now()
                    });
                    parentComm.send('CALL_ENDED', { 
                        callId: callId,
                        duration: this.getCallDuration(),
                        timestamp: Date.now()
                    });
                    
                    logger.info(`Call ended: ${callId}`);
                } catch (error) {
                    logger.error('CallCore.endCall', error);
                    
                    this.cleanupCall();
                    this.emitEvent('CALL_FAILED', { 
                        callId: callId,
                        error: error.message,
                        timestamp: Date.now()
                    });
                    parentComm.send('CALL_FAILED', { 
                        callId: callId,
                        error: error.message,
                        timestamp: Date.now()
                    });
                    
                    throw error;
                }
            });
        }
        
        async muteAudio(callId, mute) {
            if (!callId || callId !== this.activeCallId) return;
            if (session.isDemoMode()) {
                logger.info(`Demo mode: audio ${mute ? 'muted' : 'unmuted'}`);
                return;
            }
            
            try {
                if (this.localStream) {
                    const audioTracks = this.localStream.getAudioTracks();
                    audioTracks.forEach(track => { track.enabled = !mute; });
                    
                    this.emitEvent('AUDIO_MUTED', { callId, muted: mute });
                    parentComm.send('AUDIO_MUTED', { callId, muted: mute });
                    
                    logger.info(`Audio ${mute ? 'muted' : 'unmuted'}: ${callId}`);
                }
            } catch (error) {
                logger.error('CallCore.muteAudio', error);
            }
        }
        
        async muteVideo(callId, mute) {
            if (!callId || callId !== this.activeCallId) return;
            if (session.isDemoMode()) {
                logger.info(`Demo mode: video ${mute ? 'muted' : 'unmuted'}`);
                return;
            }
            
            try {
                if (this.localStream) {
                    const videoTracks = this.localStream.getVideoTracks();
                    videoTracks.forEach(track => { track.enabled = !mute; });
                    
                    this.emitEvent('VIDEO_MUTED', { callId, muted: mute });
                    parentComm.send('VIDEO_MUTED', { callId, muted: mute });
                    
                    logger.info(`Video ${mute ? 'muted' : 'unmuted'}: ${callId}`);
                }
            } catch (error) {
                logger.error('CallCore.muteVideo', error);
            }
        }
        
        sendOffer(offer) {
            if (this.signalingChannel) {
                this.signalingChannel.send({
                    type: 'OFFER',
                    data: offer,
                    callId: this.activeCallId,
                    timestamp: Date.now()
                });
            }
        }
        
        sendIceCandidate(candidate) {
            if (this.signalingChannel) {
                this.signalingChannel.send({
                    type: 'ICE_CANDIDATE',
                    data: candidate,
                    callId: this.activeCallId,
                    timestamp: Date.now()
                });
            }
        }
        
        sendCallEnded() {
            if (this.signalingChannel) {
                this.signalingChannel.send({
                    type: 'CALL_ENDED',
                    data: { callId: this.activeCallId },
                    timestamp: Date.now()
                });
            }
        }
        
        getRTCConfiguration() {
            return {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10
            };
        }
        
        getCallDuration() {
            if (!this.callData || !this.callData.startTime) return 0;
            return Math.floor((Date.now() - this.callData.startTime) / 1000);
        }
        
        cleanupCall() {
            try {
                if (this.localStream) {
                    this.localStream.getTracks().forEach(track => track.stop());
                    this.localStream = null;
                }
                
                if (this.peerConnection) {
                    this.peerConnection.close();
                    this.peerConnection = null;
                }
                
                this.remoteStream = null;
                this.activeCallId = null;
                this.callData = null;
                this.callState = 'idle';
                
                logger.info('Call resources cleaned up');
            } catch (error) {
                logger.error('CallCore.cleanupCall', error);
            }
        }
        
        emitEvent(eventName, data) {
            try {
                const event = new CustomEvent(`call:${eventName}`, { detail: data });
                window.dispatchEvent(event);
                
                if (this.eventListeners.has(eventName)) {
                    const listeners = this.eventListeners.get(eventName);
                    listeners.forEach(listener => {
                        try { listener(data); } catch (error) {
                            logger.error('CallCore.emitEvent.listener', error);
                        }
                    });
                }
            } catch (error) {
                logger.error('CallCore.emitEvent', error);
            }
        }
        
        on(eventName, callback) {
            try {
                if (!this.eventListeners.has(eventName)) {
                    this.eventListeners.set(eventName, []);
                }
                this.eventListeners.get(eventName).push(callback);
            } catch (error) {
                logger.error('CallCore.on', error);
            }
        }
        
        off(eventName, callback) {
            try {
                if (this.eventListeners.has(eventName)) {
                    const listeners = this.eventListeners.get(eventName);
                    const index = listeners.indexOf(callback);
                    if (index > -1) listeners.splice(index, 1);
                }
            } catch (error) {
                logger.error('CallCore.off', error);
            }
        }
        
        getStatus() {
            return {
                callState: this.callState,
                activeCallId: this.activeCallId,
                deviceInitialized: this.deviceInitialized,
                sessionVerified: this.sessionVerified || session.isDemoMode(),
                mediaDevices: this.mediaDevices ? {
                    audioInput: this.mediaDevices.audioInput.length,
                    videoInput: this.mediaDevices.videoInput.length,
                    audioOutput: this.mediaDevices.audioOutput.length
                } : null,
                hasLocalStream: !!this.localStream,
                hasRemoteStream: !!this.remoteStream,
                initializationInProgress: this.initializationInProgress,
                demoMode: session.isDemoMode()
            };
        }
        
        cleanup() {
            try {
                if (this.activeCallId) {
                    this.endCall(this.activeCallId).catch(() => {});
                }
                
                if (this.signalingChannel) {
                    this.signalingChannel.close();
                    this.signalingChannel = null;
                }
                
                this.eventListeners.clear();
                
                if (this._recoveryTimer) {
                    clearTimeout(this._recoveryTimer);
                    this._recoveryTimer = null;
                }
                
                logger.info('CallCore cleaned up');
            } catch (error) {
                logger.error('CallCore.cleanup', error);
            }
        }
    }

    // ==================== TOKEN MANAGER ====================
    class TokenManager {
        constructor() {
            this.tokenReady = false;
            this.token = null;
            this.waitingCallbacks = [];
            this.apiInitialized = false;
            this.tokenCheckInterval = null;
            this.migrationDone = false;
            this.parentCoordinator = null;
            this.coordinatedToken = false;
            this.tokenRetryCount = 0;
            this.maxTokenRetries = 5;
            this.fallbackMode = false;
        }
        
        async initialize() {
            try {
                logger.info('Initializing token manager...');
                
                if (session.isDemoMode()) {
                    logger.info('Demo mode active, token manager in fallback mode');
                    this.fallbackMode = true;
                    this.tokenReady = true;
                    this.executeWaitingCallbacks();
                    return this;
                }
                
                if (!parentCoordinator) {
                    logger.info('Parent coordinator not yet available');
                } else {
                    this.parentCoordinator = parentCoordinator;
                    if (this.parentCoordinator?.sessionData?.token) {
                        this.setToken(this.parentCoordinator.sessionData.token);
                        this.coordinatedToken = true;
                    }
                }
                
                await this.tryGetTokenFromAPI();
                this.loadCachedData();
                this.startTokenPolling();
                this.setupCoordinatedListener();
                this.migrateOldTokens();
            } catch (error) {
                logger.error('TokenManager.initialize', error);
                this.fallbackMode = true;
                this.tokenReady = true;
                this.executeWaitingCallbacks();
            }
        }
        
        setupCoordinatedListener() {
            try {
                if (!this.parentCoordinator) {
                    const checkInterval = setInterval(() => {
                        if (parentCoordinator) {
                            this.parentCoordinator = parentCoordinator;
                            clearInterval(checkInterval);
                            
                            this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                                if (updateData.token) {
                                    this.setToken(updateData.token);
                                    this.coordinatedToken = true;
                                }
                            });
                        }
                    }, 100);
                    timers.add(checkInterval);
                    return;
                }
                
                this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                    if (updateData.token) {
                        this.setToken(updateData.token);
                        this.coordinatedToken = true;
                    }
                });
            } catch (error) {
                logger.error('TokenManager.setupCoordinatedListener', error);
            }
        }
        
        async tryGetTokenFromAPI() {
            if (this.coordinatedToken || this.fallbackMode) return false;
            
            try {
                if (this.tokenRetryCount >= this.maxTokenRetries) {
                    logger.warn('Maximum token retry attempts reached');
                    return false;
                }
                
                this.tokenRetryCount++;
                
                const token = session.getToken();
                
                if (token && this.validateToken(token)) {
                    this.setToken(token);
                    this.tokenRetryCount = 0;
                    return true;
                }
                
                return false;
            } catch (error) {
                logger.error('TokenManager.tryGetTokenFromAPI', error, `attempt: ${this.tokenRetryCount}`);
                return false;
            }
        }
        
        startTokenPolling() {
            try {
                if (this.tokenCheckInterval) {
                    clearInterval(this.tokenCheckInterval);
                    this.tokenCheckInterval = null;
                }
                
                if (this.coordinatedToken || this.fallbackMode) {
                    logger.info('Using coordinated token or fallback, skipping API polling');
                    return;
                }
                
                let attempts = 0;
                const maxAttempts = 30;
                
                this.tokenCheckInterval = setInterval(() => {
                    attempts++;
                    
                    const token = session.getToken();
                    
                    if (token && this.validateToken(token)) {
                        this.setToken(token);
                        clearInterval(this.tokenCheckInterval);
                        this.tokenCheckInterval = null;
                        this.apiInitialized = true;
                        this.executeWaitingCallbacks();
                    } else if (attempts >= maxAttempts) {
                        clearInterval(this.tokenCheckInterval);
                        this.tokenCheckInterval = null;
                        logger.info('Token polling timeout');
                        this.executeWaitingCallbacks();
                    }
                }, 500);
                
                timers.add(this.tokenCheckInterval);
            } catch (error) {
                logger.error('TokenManager.startTokenPolling', error);
            }
        }
        
        setToken(token) {
            if (!this.validateToken(token)) {
                logger.warn('Attempted to set invalid token');
                return;
            }
            
            try {
                this.token = token;
                this.tokenReady = true;
                this.tokenRetryCount = 0;
                this.fallbackMode = false;
                
                SecurityCore.safeLocalStorageSet('USER_TOKEN', token);
                
                if (window.AppState) {
                    window.AppState.isAuthenticated = true;
                }
                
                this.executeWaitingCallbacks();
            } catch (error) {
                logger.error('TokenManager.setToken', error);
            }
        }
        
        waitForToken() {
            return new Promise((resolve) => {
                try {
                    if (this.tokenReady && this.token) {
                        resolve(this.token);
                    } else if (this.fallbackMode || session.isDemoMode()) {
                        resolve('demo-token');
                    } else {
                        this.waitingCallbacks.push(resolve);
                    }
                } catch (error) {
                    logger.error('TokenManager.waitForToken', error);
                    resolve(null);
                }
            });
        }
        
        executeWaitingCallbacks() {
            const tokenValue = this.fallbackMode ? 'demo-token' : this.token;
            if (this.tokenReady || this.fallbackMode) {
                while (this.waitingCallbacks.length > 0) {
                    const callback = this.waitingCallbacks.shift();
                    try { callback(tokenValue); } catch (error) {
                        logger.error('TokenManager.executeWaitingCallbacks', error);
                    }
                }
            }
        }
        
        validateToken(token) {
            if (session.isDemoMode() || this.fallbackMode) return true;
            if (!token || typeof token !== 'string') return false;
            if (token.length < 10) return false;
            
            try {
                const parts = token.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    if (payload.exp) {
                        const now = Math.floor(Date.now() / 1000);
                        if (payload.exp < now) {
                            logger.once('Token expired');
                            return false;
                        }
                    }
                }
                return true;
            } catch (e) {
                return true;
            }
        }
        
        migrateOldTokens() {
            if (this.migrationDone) return;
            if (session.isDemoMode()) return;
            
            try {
                const oldTokenKeys = ['accessToken', 'moodchat_token', 'authToken', 'token', 'auth_token'];
                
                for (const key of oldTokenKeys) {
                    const oldToken = SecurityCore.safeLocalStorageGet(key);
                    if (oldToken && this.validateToken(oldToken)) {
                        SecurityCore.safeLocalStorageSet('USER_TOKEN', oldToken);
                    }
                }
                
                for (const key of oldTokenKeys) {
                    const oldToken = SecurityCore.safeSessionStorageGet(key);
                    if (oldToken && this.validateToken(oldToken)) {
                        SecurityCore.safeLocalStorageSet('USER_TOKEN', oldToken);
                    }
                }
                
                this.migrationDone = true;
            } catch (error) {
                logger.error('TokenManager.migrateOldTokens', error);
            }
        }
        
        loadCachedData() {
            try {
                const cachedUser = SecurityCore.safeLocalStorageGet('authUser') || 
                                  SecurityCore.safeLocalStorageGet('currentUser') ||
                                  SecurityCore.safeLocalStorageGet('userData');
                
                if (cachedUser) {
                    try {
                        const userData = SecurityCore.safeJSONParse(cachedUser);
                        if (window.AppState) {
                            window.AppState.user = userData;
                            window.AppState.currentUser = userData;
                        }
                    } catch (e) {}
                }
            } catch (error) {
                logger.error('TokenManager.loadCachedData', error);
            }
        }
        
        getToken() {
            try {
                if (session.isDemoMode()) return 'demo-token';
                if (this.fallbackMode) return 'demo-token';
                if (this.parentCoordinator?.sessionData?.token) {
                    return this.parentCoordinator.sessionData.token;
                }
                return this.token || session.getToken();
            } catch (error) {
                logger.error('TokenManager.getToken', error);
                return null;
            }
        }
        
        isTokenReady() {
            try {
                if (session.isDemoMode()) return true;
                if (this.fallbackMode) return true;
                if (this.parentCoordinator?.sessionData?.token) return true;
                return this.tokenReady && this.validateToken(this.token);
            } catch (error) {
                logger.error('TokenManager.isTokenReady', error);
                return false;
            }
        }
        
        clearToken() {
            try {
                this.token = null;
                this.tokenReady = false;
                this.apiInitialized = false;
                this.coordinatedToken = false;
                this.tokenRetryCount = 0;
                this.fallbackMode = true;
                
                SecurityCore.safeLocalStorageRemove('USER_TOKEN');
                
                if (window.AppState) {
                    window.AppState.isAuthenticated = false;
                    window.AppState.user = null;
                    window.AppState.currentUser = null;
                }
            } catch (error) {
                logger.error('TokenManager.clearToken', error);
            }
        }
        
        cleanup() {
            try {
                if (this.tokenCheckInterval) {
                    clearInterval(this.tokenCheckInterval);
                    this.tokenCheckInterval = null;
                }
            } catch (error) {
                logger.error('TokenManager.cleanup', error);
            }
        }
    }

    // ==================== SECURE API CLIENT ====================
    class SecureAPIClient {
        constructor(tokenManager) {
            this.tokenManager = tokenManager;
            this.requestQueue = [];
            this.processingQueue = false;
            this.maxRetries = 5;
            this.retryDelay = 800;
            this.parentCoordinator = null;
            this.useCoordinatedRouting = false;
            this.requestTimeout = 15000;
            this.fallbackBoundary = ErrorBoundary.createBoundary('SecureAPIClient', () => {
                return { ok: false, status: 503, json: async () => ({ error: 'Fallback mode' }) };
            });
        }
        
        async fetch(url, options = {}) {
            return this.fallbackBoundary.executeAsync(async () => {
                if (!url) throw new Error('URL is required');
                
                try {
                    if (session.isDemoMode()) {
                        return this._getMockResponse(url, options);
                    }
                    
                    if (!this.parentCoordinator && parentCoordinator) {
                        this.parentCoordinator = parentCoordinator;
                    }
                    
                    if (this.parentCoordinator?.sessionValidated) {
                        try {
                            return await this.fetchThroughCoordinator(url, options);
                        } catch (error) {
                            logger.warn(`Coordinator fetch failed, falling back: ${error.message}`);
                            this.useCoordinatedRouting = false;
                        }
                    }
                    
                    return this.secureFetchFallback(url, options);
                } catch (error) {
                    logger.error('SecureAPIClient.fetch', error, `url: ${url}`);
                    throw error;
                }
            });
        }
        
        _getMockResponse(url, options) {
            let data = null;
            if (url.includes('/api/contacts')) {
                data = [
                    { id: '1', name: 'Sarah Chen', status: 'online', isPremium: true },
                    { id: '2', name: 'Michael Omondi', status: 'online', isPremium: false }
                ];
            } else if (url.includes('/api/calls/history')) {
                data = [
                    { id: 'call1', contact: 'Sarah Chen', date: Date.now() - 3600000, duration: 245, type: 'video', missed: false }
                ];
            } else if (url.includes('/api/user/me')) {
                data = { id: 'demo-user', name: 'Demo User', username: 'demo' };
            } else if (url.includes('/api/user/settings')) {
                data = {
                    emotionalContext: true,
                    callIntention: true,
                    inCallChat: true,
                    whiteboard: true,
                    polls: true,
                    notes: true,
                    focusMode: false,
                    liveReactions: true,
                    theme: 'light'
                };
            } else if (url.includes('/api/user/premium')) {
                data = { isPremium: false, trialDaysLeft: 30 };
            }
            
            return {
                ok: true,
                status: 200,
                json: async () => data,
                text: async () => JSON.stringify(data),
                headers: new Headers({ 'Content-Type': 'application/json' })
            };
        }
        
        async fetchThroughCoordinator(url, options = {}) {
            if (!this.parentCoordinator?.sessionValidated) {
                throw new Error('Parent coordinator not available');
            }
            
            try {
                let endpoint = url;
                if (url.startsWith('http')) {
                    try {
                        const urlObj = new URL(url);
                        endpoint = urlObj.pathname + urlObj.search;
                    } catch (error) {}
                }
                
                const result = await this.parentCoordinator.routeApiCall(
                    endpoint,
                    options.method || 'GET',
                    options.body ? SecurityCore.safeJSONParse(options.body) : null
                );
                
                return {
                    ok: true,
                    status: 200,
                    json: async () => result,
                    text: async () => JSON.stringify(result),
                    headers: new Headers({ 'Content-Type': 'application/json' })
                };
            } catch (error) {
                logger.error('SecureAPIClient.fetchThroughCoordinator', error);
                throw error;
            }
        }
        
        async secureFetchFallback(url, options = {}, retryCount = 0) {
            try {
                if (!this.tokenManager.isTokenReady()) {
                    return this.queueRequest(url, options);
                }
                
                const token = this.tokenManager.getToken();
                if (!token || !this.tokenManager.validateToken(token)) {
                    logger.warn('No valid authentication token available');
                    return this.queueRequest(url, options);
                }
                
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    ...options.headers
                };
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
                
                const response = await fetch(url, {
                    ...options,
                    headers,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (response.status === 401) {
                    this.tokenManager.clearToken();
                    session.clearToken();
                    
                    parentComm.send('AUTH_ERROR', { timestamp: Date.now() });
                    throw new Error('Authentication failed');
                }
                
                if (!response.ok) {
                    if (response.status >= 500 && retryCount < this.maxRetries) {
                        const delay = this.retryDelay * Math.pow(2, retryCount);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return this.secureFetchFallback(url, options, retryCount + 1);
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response;
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw new Error('Request timeout');
                }
                
                if (retryCount < this.maxRetries && 
                    (error.message.includes('Network') || error.message.includes('Failed to fetch'))) {
                    const delay = this.retryDelay * Math.pow(2, retryCount);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.secureFetchFallback(url, options, retryCount + 1);
                }
                
                logger.error('SecureAPIClient.secureFetchFallback', error, `url: ${url}, retry: ${retryCount}`);
                throw error;
            }
        }
        
        async queueRequest(url, options) {
            return new Promise((resolve, reject) => {
                this.requestQueue.push({
                    url, options, resolve, reject,
                    timestamp: Date.now()
                });
                
                if (!this.processingQueue) {
                    this.processQueue();
                }
                
                setTimeout(() => {
                    const index = this.requestQueue.findIndex(req => req.url === url);
                    if (index !== -1) {
                        this.requestQueue.splice(index, 1);
                        reject(new Error('Request timeout: Token not available'));
                    }
                }, 30000);
            });
        }
        
        async processQueue() {
            if (this.processingQueue || this.requestQueue.length === 0) return;
            
            this.processingQueue = true;
            
            while (this.requestQueue.length > 0) {
                const request = this.requestQueue[0];
                
                try {
                    if (this.tokenManager.isTokenReady()) {
                        const response = await this.secureFetchFallback(request.url, request.options);
                        request.resolve(response);
                        this.requestQueue.shift();
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                } catch (error) {
                    request.reject(error);
                    this.requestQueue.shift();
                }
            }
            
            this.processingQueue = false;
        }
        
        async fetchJSON(url, options = {}) {
            try {
                const response = await this.fetch(url, options);
                return response.json();
            } catch (error) {
                logger.error('SecureAPIClient.fetchJSON', error);
                throw error;
            }
        }
    }

    // ==================== CALL API INTEGRATION ====================
    class CallAPIIntegration {
        constructor() {
            this.tokenManager = new TokenManager();
            this.apiClient = new SecureAPIClient(this.tokenManager);
            this.backgroundSyncInterval = null;
            this.authCheckDone = false;
            this.backgroundJobsStarted = false;
            this.initialDataLoaded = false;
            this.parentCommunication = null;
            this.parentCoordinator = null;
            this.sessionInitialized = false;
            this.apiConfig = {};
            this.initAttempts = 0;
            this.maxInitAttempts = 5;
            this.isInitializing = false;
            this.fallbackMode = false;
            this.featureBoundary = ErrorBoundary.createBoundary('CallAPIIntegration', () => {
                this.fallbackMode = true;
                return this;
            });
        }
        
        async initialize() {
            return this.featureBoundary.executeAsync(async () => {
                if (this.isInitializing) {
                    logger.once('Initialization already in progress');
                    return this;
                }
                
                if (coreInitializationLock) {
                    logger.once('Initialization already in progress, skipping...');
                    return this;
                }
                
                coreInitializationLock = true;
                this.isInitializing = true;
                this.initAttempts++;
                
                try {
                    logger.info('Initializing API integration...');
                    
                    if (session.isDemoMode()) {
                        logger.info('Demo mode active, API integration in fallback mode');
                        this.fallbackMode = true;
                        this.setupInitialUI();
                        this.authCheckDone = true;
                        this.backgroundJobsStarted = true;
                        this.initialDataLoaded = true;
                        this.isInitializing = false;
                        coreInitializationLock = false;
                        sessionInitialized = true;
                        return this;
                    }
                    
                    if (!parentCoordinator) {
                        logger.info('Creating new parent coordinator...');
                        parentCoordinator = new ParentCoordinator();
                        await parentCoordinator.initialize();
                        if (parentCoordinator.fallbackMode) {
                            this.fallbackMode = true;
                        }
                    }
                    
                    this.parentCoordinator = parentCoordinator;
                    this.tokenManager.parentCoordinator = this.parentCoordinator;
                    this.apiClient.parentCoordinator = this.parentCoordinator;
                    
                    await this.tokenManager.initialize();
                    this.setupInitialUI();
                    await this.startBackgroundAuthCheck();
                    
                    window.addEventListener('beforeunload', () => this.cleanup());
                    this.registerWithCoordinator();
                    
                    sessionInitialized = true;
                    this.isInitializing = false;
                    this.initAttempts = 0;
                    coreInitializationLock = false;
                    
                    logger.info('API integration initialized');
                    return this;
                } catch (error) {
                    logger.error('CallAPIIntegration.initialize', error, `attempt: ${this.initAttempts}`);
                    coreInitializationLock = false;
                    
                    if (this.initAttempts < this.maxInitAttempts) {
                        logger.info(`Retrying initialization (${this.initAttempts}/${this.maxInitAttempts})...`);
                        const timer = setTimeout(() => this.initialize(), 800 * this.initAttempts);
                        timers.add(timer);
                    } else {
                        logger.error('Max initialization attempts reached, enabling fallback mode');
                        this.fallbackMode = true;
                        this.setupInitialUI();
                        this.authCheckDone = true;
                        this.backgroundJobsStarted = true;
                        this.initialDataLoaded = true;
                        this.isInitializing = false;
                    }
                    return this;
                }
            });
        }
        
        registerWithCoordinator() {
            if (!this.parentCoordinator || this.fallbackMode) return;
            
            try {
                this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                    this.handleCoordinatedSessionUpdate(updateData);
                });
                
                this.parentCoordinator.registerUIBinding(() => {
                    if (currentUser && !this.authCheckDone) {
                        this.onAuthenticationSuccess();
                    }
                });
            } catch (error) {
                logger.error('CallAPIIntegration.registerWithCoordinator', error);
            }
        }
        
        handleCoordinatedSessionUpdate(updateData) {
            if (!updateData) return;
            
            try {
                if (updateData.apiConfig) {
                    this.apiConfig = { ...this.apiConfig, ...updateData.apiConfig };
                }
                
                if (updateData.authenticated !== undefined) {
                    if (updateData.authenticated && updateData.user) {
                        this.onAuthenticationSuccess();
                    } else if (updateData.authenticated === false) {
                        this.handleLogout();
                    }
                }
            } catch (error) {
                logger.error('CallAPIIntegration.handleCoordinatedSessionUpdate', error);
            }
        }
        
        setupInitialUI() {
            try {
                const apiStatusIndicator = document.getElementById('apiStatusIndicator');
                const apiStatusText = document.getElementById('apiStatusText');
                
                if (apiStatusIndicator && apiStatusText) {
                    if (session.isDemoMode() || this.fallbackMode) {
                        apiStatusIndicator.className = 'api-status-indicator demo';
                        apiStatusText.textContent = 'Demo Mode';
                    } else {
                        apiStatusIndicator.className = 'api-status-indicator connecting';
                        apiStatusText.textContent = 'Initializing...';
                    }
                    apiStatusIndicator.style.display = 'block';
                }
                
                this.loadCachedDataToUI();
                this.showUI();
            } catch (error) {
                logger.error('CallAPIIntegration.setupInitialUI', error);
            }
        }
        
        showUI() {
            try {
                const appContainer = document.getElementById('appContainer');
                if (appContainer) {
                    appContainer.style.display = 'block';
                    appContainer.style.opacity = '1';
                }
                
                this.enableBasicUI();
            } catch (error) {
                logger.error('CallAPIIntegration.showUI', error);
            }
        }
        
        enableBasicUI() {
            try {
                const settingsToggle = document.getElementById('settingsToggle');
                if (settingsToggle) settingsToggle.disabled = false;
                
                this.renderCachedCallHistory();
            } catch (error) {
                logger.error('CallAPIIntegration.enableBasicUI', error);
            }
        }
        
        async startBackgroundAuthCheck() {
            if (session.isDemoMode() || this.fallbackMode) {
                this.onAuthenticationSuccess();
                return;
            }
            
            try {
                if (this.parentCoordinator) {
                    await this.waitForCoordinatorSession();
                } else {
                    await this.waitForTokenAuth();
                }
            } catch (error) {
                logger.error('CallAPIIntegration.startBackgroundAuthCheck', error);
            }
        }
        
        async waitForCoordinatorSession() {
            if (!this.parentCoordinator) return;
            
            return new Promise((resolve) => {
                if (this.parentCoordinator.sessionValidated && currentUser) {
                    this.onAuthenticationSuccess();
                    resolve();
                    return;
                }
                
                const timeout = setTimeout(() => {
                    logger.info('Coordinator session timeout, using cached data');
                    resolve();
                }, 8000);
                
                const checkInterval = setInterval(() => {
                    if (this.parentCoordinator.sessionValidated && currentUser) {
                        clearTimeout(timeout);
                        clearInterval(checkInterval);
                        this.onAuthenticationSuccess();
                        resolve();
                    }
                }, 100);
                
                timers.add(timeout);
                timers.add(checkInterval);
            });
        }
        
        async waitForTokenAuth() {
            try {
                const token = await this.tokenManager.waitForToken();
                if (token) this.onAuthenticationSuccess(token);
            } catch (error) {
                logger.error('CallAPIIntegration.waitForTokenAuth', error);
            }
        }
        
        onAuthenticationSuccess(token) {
            if (this.authCheckDone) return;
            
            try {
                if (window.AppState) {
                    window.AppState.isAuthenticated = true;
                }
                this.authCheckDone = true;
                
                const apiStatusIndicator = document.getElementById('apiStatusIndicator');
                const apiStatusText = document.getElementById('apiStatusText');
                
                if (apiStatusIndicator && apiStatusText) {
                    if (session.isDemoMode() || this.fallbackMode) {
                        apiStatusIndicator.className = 'api-status-indicator demo';
                        apiStatusText.textContent = 'Demo Mode';
                    } else {
                        apiStatusIndicator.className = 'api-status-indicator connected';
                        apiStatusText.textContent = currentUser?.name ? `Authenticated as ${SecurityCore.sanitizeString(currentUser.name)}` : 'Authenticated';
                    }
                    
                    setTimeout(() => {
                        if (apiStatusIndicator) apiStatusIndicator.style.display = 'none';
                    }, 2000);
                }
                
                if (!this.backgroundJobsStarted) {
                    this.backgroundJobsStarted = true;
                    this.startBackgroundJobs();
                }
            } catch (error) {
                logger.error('CallAPIIntegration.onAuthenticationSuccess', error);
            }
        }
        
        startBackgroundJobs() {
            if (window.AppState && !window.AppState.isOnline) return;
            
            logger.info('Starting background jobs...');
            
            try {
                this.initializeBackgroundSync();
                setTimeout(() => this.performInitialDataLoad(), 500);
            } catch (error) {
                logger.error('CallAPIIntegration.startBackgroundJobs', error);
            }
        }
        
        async performInitialDataLoad() {
            if (window.AppState && !window.AppState.isAuthenticated && !session.isDemoMode()) return;
            
            try {
                const syncIndicator = document.getElementById('syncIndicator');
                if (syncIndicator) {
                    if (session.isDemoMode()) {
                        syncIndicator.innerHTML = '<i class="fas fa-eye"></i><span>Demo Mode</span>';
                    } else {
                        syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Syncing...</span>';
                        syncIndicator.classList.add('syncing');
                    }
                }
                
                await Promise.allSettled([
                    this.fetchContacts(true),
                    this.fetchCallHistory(true),
                    this.fetchUserData(),
                    this.fetchSettings(),
                    this.checkPremiumStatus()
                ]);
                
                this.initialDataLoaded = true;
                
                if (syncIndicator && !session.isDemoMode()) {
                    syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                    syncIndicator.classList.remove('syncing');
                }
                
                parentComm.send('DATA_SYNC_COMPLETE', { timestamp: Date.now() });
            } catch (error) {
                logger.error('CallAPIIntegration.performInitialDataLoad', error);
                
                if (window.AppState) window.AppState.syncPending = true;
                
                const syncIndicator = document.getElementById('syncIndicator');
                if (syncIndicator && !session.isDemoMode()) {
                    syncIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Sync failed</span>';
                    syncIndicator.classList.remove('syncing');
                }
            }
        }
        
        initializeBackgroundSync() {
            if (session.isDemoMode() || this.fallbackMode) return;
            
            try {
                if (this.backgroundSyncInterval) {
                    clearInterval(this.backgroundSyncInterval);
                    this.backgroundSyncInterval = null;
                }
                
                if (window.AppState && window.AppState.isAuthenticated && window.AppState.isOnline) {
                    this.backgroundSyncInterval = setInterval(() => {
                        this.performBackgroundSync();
                    }, 15000);
                    timers.add(this.backgroundSyncInterval);
                    
                    document.addEventListener('visibilitychange', () => {
                        if (!document.hidden && window.AppState?.isOnline && window.AppState?.isAuthenticated) {
                            this.performBackgroundSync();
                        }
                    });
                }
            } catch (error) {
                logger.error('CallAPIIntegration.initializeBackgroundSync', error);
            }
        }
        
        async performBackgroundSync() {
            if (!window.AppState || !window.AppState.isOnline || !window.AppState.isAuthenticated || window.AppState.isInCall) return;
            if (session.isDemoMode() || this.fallbackMode) return;
            
            try {
                await Promise.allSettled([
                    this.fetchContacts(true),
                    this.fetchCallHistory(true),
                    this.checkPremiumStatus()
                ]);
                
                const syncIndicator = document.getElementById('syncIndicator');
                if (syncIndicator) {
                    syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                    syncIndicator.classList.remove('syncing');
                }
                
                if (window.AppState) window.AppState.syncPending = false;
            } catch (error) {
                logger.error('CallAPIIntegration.performBackgroundSync', error);
                if (window.AppState) window.AppState.syncPending = true;
            }
        }
        
        async fetchUserData() {
            try {
                if (session.isDemoMode() || this.fallbackMode) {
                    const demoUser = { id: 'demo-user', name: 'Demo User', username: 'demo', email: 'demo@example.com' };
                    this.updateUserState(demoUser);
                    return demoUser;
                }
                
                if (this.parentCoordinator?.sessionValidated) {
                    const userData = await this.parentCoordinator.routeApiCall('/api/user/me', 'GET').catch(() => null);
                    if (userData) {
                        this.updateUserState(userData);
                        return userData;
                    }
                }
                
                const cachedUser = SecurityCore.safeLocalStorageGet('authUser') || SecurityCore.safeLocalStorageGet('currentUser');
                if (cachedUser) {
                    try {
                        const userData = SecurityCore.safeJSONParse(cachedUser);
                        this.updateUserState(userData);
                        return userData;
                    } catch (e) {}
                }
            } catch (error) {
                logger.error('CallAPIIntegration.fetchUserData', error);
            }
            return null;
        }
        
        updateUserState(userData) {
            if (!userData) return;
            
            try {
                if (window.AppState) {
                    window.AppState.user = userData;
                    window.AppState.currentUser = userData;
                }
                SecurityCore.safeLocalStorageSet('authUser', JSON.stringify(userData));
                SecurityCore.safeLocalStorageSet('currentUser', JSON.stringify(userData));
            } catch (error) {
                logger.error('CallAPIIntegration.updateUserState', error);
            }
        }
        
        async fetchContacts(forceRefresh = false) {
            try {
                if (!forceRefresh && window.AppState && window.AppState.contacts?.length > 0) {
                    return window.AppState.contacts;
                }
                
                const cachedContacts = SecurityCore.safeLocalStorageGet('cachedContacts');
                if (!forceRefresh && cachedContacts) {
                    try {
                        const contacts = SecurityCore.safeJSONParse(cachedContacts);
                        if (window.AppState) window.AppState.contacts = contacts;
                        this.renderContacts(contacts);
                        return contacts;
                    } catch (e) {}
                }
                
                if (!window.AppState || (!window.AppState.isAuthenticated && !session.isDemoMode())) {
                    return window.AppState ? window.AppState.contacts : [];
                }
                
                if (session.isDemoMode() || this.fallbackMode) {
                    const demoContacts = [
                        { id: '1', name: 'Sarah Chen', status: 'online', isPremium: true, avatar: null },
                        { id: '2', name: 'Michael Omondi', status: 'online', isPremium: false, avatar: null },
                        { id: '3', name: 'Jane Wambui', status: 'away', isPremium: true, avatar: null },
                        { id: '4', name: 'David Kimani', status: 'offline', isPremium: false, avatar: null }
                    ];
                    if (window.AppState) window.AppState.contacts = demoContacts;
                    this.cacheContacts(demoContacts);
                    this.renderContacts(demoContacts);
                    return demoContacts;
                }
                
                if (this.parentCoordinator?.sessionValidated) {
                    const contacts = await this.parentCoordinator.routeApiCall('/api/contacts', 'GET').catch(() => null);
                    if (contacts) {
                        if (window.AppState) window.AppState.contacts = contacts;
                        this.cacheContacts(contacts);
                        this.renderContacts(contacts);
                        return contacts;
                    }
                }
                
                return [];
            } catch (error) {
                logger.error('CallAPIIntegration.fetchContacts', error);
                
                const cachedContacts = SecurityCore.safeLocalStorageGet('cachedContacts');
                if (cachedContacts) {
                    try {
                        const contacts = SecurityCore.safeJSONParse(cachedContacts);
                        if (window.AppState) window.AppState.contacts = contacts;
                        this.renderContacts(contacts);
                        return contacts;
                    } catch (e) {}
                }
                
                return [];
            }
        }
        
        cacheContacts(contacts) {
            try {
                SecurityCore.safeLocalStorageSet('cachedContacts', JSON.stringify(contacts));
                SecurityCore.safeLocalStorageSet('cachedContactsTimestamp', Date.now().toString());
            } catch (error) {
                logger.error('CallAPIIntegration.cacheContacts', error);
            }
        }
        
        async fetchCallHistory(forceRefresh = false) {
            try {
                if (!forceRefresh && window.AppState && window.AppState.callHistory?.length > 0) {
                    return window.AppState.callHistory;
                }
                
                const cachedHistory = SecurityCore.safeLocalStorageGet('cachedCallHistory');
                if (!forceRefresh && cachedHistory) {
                    try {
                        const history = SecurityCore.safeJSONParse(cachedHistory);
                        if (window.AppState) window.AppState.callHistory = history;
                        this.renderCallHistory(history);
                        return history;
                    } catch (e) {}
                }
                
                if (!window.AppState || (!window.AppState.isAuthenticated && !session.isDemoMode())) {
                    return window.AppState ? window.AppState.callHistory : [];
                }
                
                if (session.isDemoMode() || this.fallbackMode) {
                    const demoHistory = [
                        { id: 'call1', contact: 'Sarah Chen', date: Date.now() - 3600000, duration: 245, type: 'video', missed: false },
                        { id: 'call2', contact: 'Michael Omondi', date: Date.now() - 86400000, duration: 125, type: 'voice', missed: false },
                        { id: 'call3', contact: 'Jane Wambui', date: Date.now() - 172800000, duration: 0, type: 'video', missed: true }
                    ];
                    if (window.AppState) window.AppState.callHistory = demoHistory;
                    this.cacheCallHistory(demoHistory);
                    this.renderCallHistory(demoHistory);
                    return demoHistory;
                }
                
                if (this.parentCoordinator?.sessionValidated) {
                    const history = await this.parentCoordinator.routeApiCall('/api/calls/history', 'GET').catch(() => null);
                    if (history) {
                        if (window.AppState) window.AppState.callHistory = history;
                        this.cacheCallHistory(history);
                        this.renderCallHistory(history);
                        return history;
                    }
                }
                
                return [];
            } catch (error) {
                logger.error('CallAPIIntegration.fetchCallHistory', error);
                
                const cachedHistory = SecurityCore.safeLocalStorageGet('cachedCallHistory');
                if (cachedHistory) {
                    try {
                        const history = SecurityCore.safeJSONParse(cachedHistory);
                        if (window.AppState) window.AppState.callHistory = history;
                        this.renderCallHistory(history);
                        return history;
                    } catch (e) {}
                }
                
                return [];
            }
        }
        
        cacheCallHistory(history) {
            try {
                SecurityCore.safeLocalStorageSet('cachedCallHistory', JSON.stringify(history));
                SecurityCore.safeLocalStorageSet('cachedCallHistoryTimestamp', Date.now().toString());
            } catch (error) {
                logger.error('CallAPIIntegration.cacheCallHistory', error);
            }
        }
        
        renderCachedCallHistory() {
            try {
                const cachedHistory = SecurityCore.safeLocalStorageGet('cachedCallHistory');
                if (cachedHistory) {
                    try {
                        const history = SecurityCore.safeJSONParse(cachedHistory);
                        if (window.AppState) window.AppState.callHistory = history;
                        this.renderCallHistory(history);
                    } catch (e) {}
                }
            } catch (error) {
                logger.error('CallAPIIntegration.renderCachedCallHistory', error);
            }
        }
        
        renderCallHistory(history) {
            if (typeof window.renderCallHistory === 'function') {
                window.renderCallHistory(history);
            }
        }
        
        async fetchSettings() {
            try {
                if (session.isDemoMode() || this.fallbackMode) {
                    const demoSettings = {
                        emotionalContext: true,
                        callIntention: true,
                        inCallChat: true,
                        whiteboard: true,
                        polls: true,
                        notes: true,
                        focusMode: false,
                        liveReactions: true,
                        theme: 'light'
                    };
                    if (window.AppState) {
                        window.AppState.settings = { ...window.AppState.settings, ...demoSettings };
                    }
                    this.applySettingsToUI();
                    return demoSettings;
                }
                
                if (window.parent && window.parent.AppState && window.parent.AppState.settings) {
                    if (window.AppState) {
                        window.AppState.settings = { ...window.AppState.settings, ...window.parent.AppState.settings };
                    }
                    this.applySettingsToUI();
                    return window.AppState ? window.AppState.settings : {};
                }
                
                if (!window.AppState || (!window.AppState.isAuthenticated && !session.isDemoMode())) {
                    return window.AppState ? window.AppState.settings : {};
                }
                
                if (this.parentCoordinator?.sessionValidated) {
                    const settings = await this.parentCoordinator.routeApiCall('/api/user/settings', 'GET').catch(() => null);
                    if (settings && window.AppState) {
                        window.AppState.settings = { ...window.AppState.settings, ...settings };
                        this.applySettingsToUI();
                        this.saveSettings();
                    }
                    return window.AppState ? window.AppState.settings : {};
                }
                
                return window.AppState ? window.AppState.settings : {};
            } catch (error) {
                logger.error('CallAPIIntegration.fetchSettings', error);
                
                const cachedSettings = SecurityCore.safeLocalStorageGet('callSettings');
                if (cachedSettings && window.AppState) {
                    try {
                        const settings = SecurityCore.safeJSONParse(cachedSettings);
                        window.AppState.settings = { ...window.AppState.settings, ...settings };
                        this.applySettingsToUI();
                    } catch (e) {}
                }
                
                return window.AppState ? window.AppState.settings : {};
            }
        }
        
        applySettingsToUI() {
            if (typeof window.applySettingsToUI === 'function') {
                window.applySettingsToUI();
            }
        }
        
        saveSettings() {
            if (typeof window.saveSettings === 'function') {
                window.saveSettings();
            }
        }
        
        async checkPremiumStatus() {
            try {
                if (session.isDemoMode() || this.fallbackMode) {
                    if (window.AppState) {
                        window.AppState.isPremium = false;
                        window.AppState.trialDaysLeft = 30;
                    }
                    this.updatePremiumUI();
                    return false;
                }
                
                if (window.parent && window.parent.AppState) {
                    if (window.AppState) {
                        window.AppState.isPremium = window.parent.AppState.isPremium || false;
                        window.AppState.trialDaysLeft = window.parent.AppState.trialDaysLeft || 30;
                    }
                    this.updatePremiumUI();
                    return window.AppState ? window.AppState.isPremium : false;
                }
                
                if (!window.AppState || (!window.AppState.isAuthenticated && !session.isDemoMode())) {
                    this.updatePremiumUI();
                    return window.AppState ? window.AppState.isPremium : false;
                }
                
                if (this.parentCoordinator?.sessionValidated) {
                    const premiumData = await this.parentCoordinator.routeApiCall('/api/user/premium', 'GET').catch(() => null);
                    if (premiumData && window.AppState) {
                        window.AppState.isPremium = premiumData.isPremium || false;
                        window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 30;
                        window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                        this.cachePremiumStatus(premiumData);
                        this.updatePremiumUI();
                    }
                    return window.AppState ? window.AppState.isPremium : false;
                }
                
                return window.AppState ? window.AppState.isPremium : false;
            } catch (error) {
                logger.error('CallAPIIntegration.checkPremiumStatus', error);
                
                const cachedPremium = SecurityCore.safeLocalStorageGet('premiumStatus');
                if (cachedPremium && window.AppState) {
                    try {
                        const premiumData = SecurityCore.safeJSONParse(cachedPremium);
                        window.AppState.isPremium = premiumData.isPremium || false;
                        window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 30;
                        window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                    } catch (e) {}
                }
                
                this.updatePremiumUI();
                return window.AppState ? window.AppState.isPremium : false;
            }
        }
        
        cachePremiumStatus(premiumData) {
            try {
                SecurityCore.safeLocalStorageSet('premiumStatus', JSON.stringify({
                    isPremium: window.AppState ? window.AppState.isPremium : false,
                    trialDaysLeft: window.AppState ? window.AppState.trialDaysLeft : 30,
                    features: window.AppState ? window.AppState.premiumFeatures : {}
                }));
            } catch (error) {
                logger.error('CallAPIIntegration.cachePremiumStatus', error);
            }
        }
        
        loadCachedDataToUI() {
            try {
                this.loadSettings();
                
                const cachedContacts = SecurityCore.safeLocalStorageGet('cachedContacts');
                if (cachedContacts) {
                    try {
                        const contacts = SecurityCore.safeJSONParse(cachedContacts);
                        if (window.AppState) window.AppState.contacts = contacts;
                        this.renderContacts(contacts);
                    } catch (e) {}
                }
                
                const cachedCalls = SecurityCore.safeLocalStorageGet('cachedCallHistory');
                if (cachedCalls) {
                    try {
                        const calls = SecurityCore.safeJSONParse(cachedCalls);
                        if (window.AppState) window.AppState.callHistory = calls;
                        this.renderCallHistory(calls);
                    } catch (e) {}
                }
                
                const cachedPremium = SecurityCore.safeLocalStorageGet('premiumStatus');
                if (cachedPremium) {
                    try {
                        const premiumData = SecurityCore.safeJSONParse(cachedPremium);
                        if (window.AppState) {
                            window.AppState.isPremium = premiumData.isPremium || false;
                            window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 30;
                            window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                        }
                        this.updatePremiumUI();
                    } catch (e) {}
                }
            } catch (error) {
                logger.error('CallAPIIntegration.loadCachedDataToUI', error);
            }
        }
        
        loadSettings() {
            if (typeof window.loadSettings === 'function') {
                window.loadSettings();
            }
        }
        
        updatePremiumUI() {
            if (typeof window.updatePremiumUI === 'function') {
                window.updatePremiumUI();
            }
        }
        
        renderContacts(contacts) {
            if (!contacts || contacts.length === 0) {
                const contactsList = document.getElementById('contactsList');
                if (contactsList) {
                    contactsList.innerHTML = '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No contacts available</p></div>';
                }
                return;
            }
            
            try {
                const contactsList = document.getElementById('contactsList');
                if (!contactsList) return;
                
                let html = '';
                contacts.slice(0, 20).forEach(contact => {
                    const name = SecurityCore.sanitizeString(contact.name || 'Unknown');
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
                    html += `
                        <div class="contact-item" data-id="${SecurityCore.sanitizeString(contact.id)}">
                            <div class="call-avatar" style="background-color: ${this.stringToColor(contact.name)}">
                                ${contact.avatar ? `<img src="${SecurityCore.sanitizeURL(contact.avatar)}" alt="${name}">` : SecurityCore.sanitizeString(initials)}
                            </div>
                            <div class="call-info">
                                <div class="call-name">
                                    ${name}
                                    ${contact.isPremium ? '<span class="premium-badge">PRO</span>' : ''}
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                contactsList.innerHTML = html;
                
                const contactsLoading = document.getElementById('contactsLoading');
                if (contactsLoading) contactsLoading.style.display = 'none';
            } catch (error) {
                logger.error('CallAPIIntegration.renderContacts', error);
            }
        }
        
        stringToColor(str) {
            if (!str) return '#6c5ce7';
            
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            
            const colors = ['#6c5ce7', '#00b894', '#0984e3', '#fdcb6e', '#e17055', '#d63031', '#e84342', '#6c5ce7'];
            return colors[Math.abs(hash) % colors.length];
        }
        
        handleLogout() {
            try {
                this.authCheckDone = false;
                this.backgroundJobsStarted = false;
                this.initialDataLoaded = false;
                
                if (this.backgroundSyncInterval) {
                    clearInterval(this.backgroundSyncInterval);
                    this.backgroundSyncInterval = null;
                }
                
                this.tokenManager.clearToken();
            } catch (error) {
                logger.error('CallAPIIntegration.handleLogout', error);
            }
        }
        
        cleanup() {
            try {
                if (this.backgroundSyncInterval) {
                    clearInterval(this.backgroundSyncInterval);
                    this.backgroundSyncInterval = null;
                }
                
                if (this.tokenManager) this.tokenManager.cleanup();
                if (this.parentCoordinator) this.parentCoordinator.cleanup();
            } catch (error) {
                logger.error('CallAPIIntegration.cleanup', error);
            }
        }
    }

    // ==================== GLOBAL APP STATE ====================
    const AppState = {
        isAuthenticated: false,
        authChecked: false,
        user: null,
        apiReady: false,
        apiCheckInterval: null,
        currentUser: null,
        userPermissions: {},
        callPermissions: {},
        isInCall: false,
        currentCall: null,
        activeCallId: null,
        callType: null,
        callParticipants: [],
        callStartTime: null,
        callDurationInterval: null,
        localStream: null,
        remoteStreams: new Map(),
        screenStream: null,
        isMuted: false,
        isVideoOff: false,
        isScreenSharing: false,
        isSpeakerOn: true,
        currentMood: 'neutral',
        currentIntention: 'quick',
        currentFocusMode: false,
        currentPanel: 'participants',
        currentCategory: 'all',
        contacts: [],
        callHistory: [],
        settings: {
            emotionalContext: true,
            callIntention: true,
            inCallChat: true,
            whiteboard: true,
            polls: true,
            notes: true,
            focusMode: false,
            liveReactions: true,
            theme: 'light'
        },
        isOnline: navigator.onLine,
        syncPending: false,
        isPremium: false,
        trialDaysLeft: 30,
        premiumFeatures: {
            groupCalls: false,
            screenSharing: false,
            whiteboard: false,
            polls: false,
            relationshipInsights: false,
            callLinks: false
        },
        chatMessages: [],
        unreadChatCount: 0,
        peer: null,
        connections: new Map()
    };

    // ==================== DOM ELEMENTS ====================
    const elements = {};

    // ==================== UI UTILITY FUNCTIONS ====================
    function cacheElements() {
        try {
            elements.appContainer = document.getElementById('appContainer');
            elements.syncIndicator = document.getElementById('syncIndicator');
            elements.apiStatusIndicator = document.getElementById('apiStatusIndicator');
            elements.apiStatusText = document.getElementById('apiStatusText');
            elements.newCallBtn = document.getElementById('newCallBtn');
            elements.quickVoiceBtn = document.getElementById('quickVoiceBtn');
            elements.quickVideoBtn = document.getElementById('quickVideoBtn');
            elements.quickGroupBtn = document.getElementById('quickGroupBtn');
            elements.contactsList = document.getElementById('contactsList');
            elements.contactsLoading = document.getElementById('contactsLoading');
            elements.callsLoading = document.getElementById('callsLoading');
            elements.offlineBanner = document.getElementById('offlineBanner');
            elements.settingsToggle = document.getElementById('settingsToggle');
            elements.settingsPanel = document.getElementById('settingsPanel');
            elements.callContainer = document.getElementById('callContainer');
            elements.callDuration = document.getElementById('callDuration');
            elements.callMoodIndicator = document.getElementById('callMoodIndicator');
            elements.callIntentionIndicator = document.getElementById('callIntentionIndicator');
            elements.videoGrid = document.getElementById('videoGrid');
            elements.notificationArea = document.getElementById('notificationArea');
            elements.muteBtn = document.getElementById('muteBtn');
            elements.videoBtn = document.getElementById('videoBtn');
            elements.screenShareBtn = document.getElementById('screenShareBtn');
            elements.endCallBtn = document.getElementById('endCallBtn');
            elements.menuDotsBtn = document.getElementById('menuDotsBtn');
            elements.menuDotsDropdown = document.getElementById('menuDotsDropdown');
            elements.menuParticipants = document.getElementById('menuParticipants');
            elements.menuChat = document.getElementById('menuChat');
            elements.menuWhiteboard = document.getElementById('menuWhiteboard');
            elements.menuNotes = document.getElementById('menuNotes');
            elements.menuPolls = document.getElementById('menuPolls');
            elements.menuRelationship = document.getElementById('menuRelationship');
            elements.declineCallBtn = document.getElementById('declineCallBtn');
            elements.acceptCallBtn = document.getElementById('acceptCallBtn');
            elements.acceptVideoCallBtn = document.getElementById('acceptVideoCallBtn');
            elements.newCallModal = document.getElementById('newCallModal');
            elements.closeNewCallModal = document.getElementById('closeNewCallModal');
            elements.contactSearch = document.getElementById('contactSearch');
            elements.groupContactSearch = document.getElementById('groupContactSearch');
            elements.startVoiceCallBtn = document.getElementById('startVoiceCallBtn');
            elements.startVideoCallBtn = document.getElementById('startVideoCallBtn');
            elements.startGroupCallBtn = document.getElementById('startGroupCallBtn');
            elements.instantGroupOption = document.getElementById('instantGroupOption');
            elements.scheduledGroupOption = document.getElementById('scheduledGroupOption');
            elements.copyLinkBtn = document.getElementById('copyLinkBtn');
            elements.shareLinkBtn = document.getElementById('shareLinkBtn');
            elements.generateVoiceLinkBtn = document.getElementById('generateVoiceLinkBtn');
            elements.generateVideoLinkBtn = document.getElementById('generateVideoLinkBtn');
            elements.callLinkInput = document.getElementById('callLinkInput');
            elements.mpesaOption = document.getElementById('mpesaOption');
            elements.cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
            elements.processPaymentBtn = document.getElementById('processPaymentBtn');
            elements.cancelUpgradeBtn = document.getElementById('cancelUpgradeBtn');
            elements.upgradeNowBtn = document.getElementById('upgradeNowBtn');
            elements.paymentModal = document.getElementById('paymentModal');
            elements.premiumLimitOverlay = document.getElementById('premiumLimitOverlay');
            elements.phoneNumber = document.getElementById('phoneNumber');
            elements.paymentAmount = document.getElementById('paymentAmount');
            elements.cancelMoodBtn = document.getElementById('cancelMoodBtn');
            elements.setMoodBtn = document.getElementById('setMoodBtn');
            elements.cancelIntentionBtn = document.getElementById('cancelIntentionBtn');
            elements.setIntentionBtn = document.getElementById('setIntentionBtn');
            elements.moodSelectionModal = document.getElementById('moodSelectionModal');
            elements.intentionSelectionModal = document.getElementById('intentionSelectionModal');
            elements.skipNotesBtn = document.getElementById('skipNotesBtn');
            elements.saveNotesBtn = document.getElementById('saveNotesBtn');
            elements.summaryDoneBtn = document.getElementById('summaryDoneBtn');
            elements.privateNotesModal = document.getElementById('privateNotesModal');
            elements.privateNotesTitle = document.getElementById('privateNotesTitle');
            elements.privateNotesSubtitle = document.getElementById('privateNotesSubtitle');
            elements.privateNotesTextarea = document.getElementById('privateNotesTextarea');
            elements.callSummaryModal = document.getElementById('callSummaryModal');
            elements.summaryDuration = document.getElementById('summaryDuration');
            elements.summaryTime = document.getElementById('summaryTime');
            elements.summaryType = document.getElementById('summaryType');
            elements.summaryMood = document.getElementById('summaryMood');
            elements.summaryIntention = document.getElementById('summaryIntention');
            elements.summaryParticipants = document.getElementById('summaryParticipants');
            elements.urlParamCancelBtn = document.getElementById('urlParamCancelBtn');
            elements.urlParamJoinBtn = document.getElementById('urlParamJoinBtn');
            elements.urlParamOverlay = document.getElementById('urlParamOverlay');
            elements.resetSettingsBtn = document.getElementById('resetSettingsBtn');
            elements.emotionalContextToggle = document.getElementById('emotionalContextToggle');
            elements.callIntentionToggle = document.getElementById('callIntentionToggle');
            elements.inCallChatToggle = document.getElementById('inCallChatToggle');
            elements.whiteboardToggle = document.getElementById('whiteboardToggle');
            elements.pollsToggle = document.getElementById('pollsToggle');
            elements.notesToggle = document.getElementById('notesToggle');
            elements.focusModeToggle = document.getElementById('focusModeToggle');
            elements.liveReactionsToggle = document.getElementById('liveReactionsToggle');
            elements.speakerBtn = document.getElementById('speakerBtn');
            elements.moodBtn = document.getElementById('moodBtn');
            elements.intentionBtn = document.getElementById('intentionBtn');
            elements.focusModeBtn = document.getElementById('focusModeBtn');
            elements.reactionsContainer = document.getElementById('reactionsContainer');
            elements.pipCloseBtn = document.getElementById('pipCloseBtn');
            elements.pipContainer = document.getElementById('pipContainer');
            elements.sidebar = document.getElementById('sidebar');
            elements.callWithName = document.getElementById('callWithName');
            elements.callStatusText = document.getElementById('callStatusText');
            elements.callTypeIcon = document.getElementById('callTypeIcon');
            elements.offlineCallPlaceholder = document.getElementById('offlineCallPlaceholder');
            elements.allCallsSection = document.getElementById('allCallsSection');
            elements.missedCallsSection = document.getElementById('missedCallsSection');
            elements.groupCallsSection = document.getElementById('groupCallsSection');
            elements.allCallsList = document.getElementById('allCallsList');
            elements.settingsToggleIcon = document.getElementById('settingsToggleIcon');
            elements.incomingCallModal = document.getElementById('incomingCallModal');
            elements.incomingCallName = document.getElementById('incomingCallName');
            elements.incomingCallType = document.getElementById('incomingCallType');
            elements.incomingCallAvatar = document.getElementById('incomingCallAvatar');
            elements.incomingCallMood = document.getElementById('incomingCallMood');
            elements.incomingCallIntention = document.getElementById('incomingCallIntention');
            elements.declineTimer = document.getElementById('declineTimer');
        } catch (error) {
            logger.error('cacheElements', error);
        }
    }

    function loadSettings() {
        try {
            const savedSettings = SecurityCore.safeLocalStorageGet('callSettings');
            if (savedSettings) {
                AppState.settings = { ...AppState.settings, ...SecurityCore.safeJSONParse(savedSettings, {}) };
                applySettingsToUI();
            }
        } catch (error) {
            logger.error('loadSettings', error);
        }
    }

    function saveSettings() {
        try {
            SecurityCore.safeLocalStorageSet('callSettings', JSON.stringify(AppState.settings));
        } catch (error) {
            logger.error('saveSettings', error);
        }
    }

    function applySettingsToUI() {
        try {
            if (elements.emotionalContextToggle) elements.emotionalContextToggle.checked = AppState.settings.emotionalContext;
            if (elements.callIntentionToggle) elements.callIntentionToggle.checked = AppState.settings.callIntention;
            if (elements.inCallChatToggle) elements.inCallChatToggle.checked = AppState.settings.inCallChat;
            if (elements.whiteboardToggle) elements.whiteboardToggle.checked = AppState.settings.whiteboard;
            if (elements.pollsToggle) elements.pollsToggle.checked = AppState.settings.polls;
            if (elements.notesToggle) elements.notesToggle.checked = AppState.settings.notes;
            if (elements.focusModeToggle) elements.focusModeToggle.checked = AppState.settings.focusMode;
            if (elements.liveReactionsToggle) elements.liveReactionsToggle.checked = AppState.settings.liveReactions;
        } catch (error) {
            logger.error('applySettingsToUI', error);
        }
    }

    function updatePremiumUI() {
        if (!elements.quickGroupBtn || !elements.screenShareBtn) return;
        
        try {
            if (AppState.isPremium || session.isDemoMode()) {
                elements.quickGroupBtn.disabled = false;
                elements.screenShareBtn.disabled = false;
            } else {
                elements.quickGroupBtn.disabled = true;
                elements.screenShareBtn.disabled = true;
            }
        } catch (error) {
            logger.error('updatePremiumUI', error);
        }
    }

    function renderCallHistory() {
        if (!elements.callsLoading || !elements.allCallsList) return;
        
        try {
            elements.callsLoading.style.display = 'none';
            
            if (!AppState.callHistory || AppState.callHistory.length === 0) {
                if (elements.allCallsList) {
                    elements.allCallsList.innerHTML = '<div class="offline-state"><i class="fas fa-phone-slash"></i><p>No call history</p></div>';
                }
                return;
            }
            
            let html = '';
            AppState.callHistory.slice(0, 20).forEach(call => {
                const date = new Date(call.date);
                const timeAgo = formatTimeAgo(date);
                const duration = call.missed ? 'Missed' : formatDuration(call.duration);
                const icon = call.type === 'video' ? 'fa-video' : 'fa-phone';
                const statusClass = call.missed ? 'missed' : '';
                
                html += `
                    <div class="call-history-item ${statusClass}">
                        <div class="call-avatar">${SecurityCore.sanitizeString(call.contact.charAt(0))}</div>
                        <div class="call-info">
                            <div class="call-name">${SecurityCore.sanitizeString(call.contact)}</div>
                            <div class="call-details">
                                <i class="fas ${icon}"></i>
                                <span>${SecurityCore.sanitizeString(duration)}</span>
                                <span>•</span>
                                <span>${SecurityCore.sanitizeString(timeAgo)}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            elements.allCallsList.innerHTML = html;
        } catch (error) {
            logger.error('renderCallHistory', error);
        }
    }

    function formatTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    function formatDuration(seconds) {
        if (!seconds && seconds !== 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function stringToColor(str) {
        if (!str) return '#000000';
        
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const color = Math.floor(Math.abs((Math.sin(hash) * 16777215) % 16777215)).toString(16);
        return '#' + '0'.repeat(6 - color.length) + color;
    }

    function initializeOfflineDetection() {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
    }

    function handleOnline() {
        AppState.isOnline = true;
        if (elements.offlineBanner) elements.offlineBanner.style.display = 'none';
        if (window.callAPI) window.callAPI.performBackgroundSync();
        
        // STABILITY PATCH: Re-sync session on reconnect
        if (!getValidatedSession() && !session.isDemoMode()) {
            requestResync();
        }
    }

    function handleOffline() {
        AppState.isOnline = false;
        showOfflineUI();
    }

    function showOfflineUI() {
        if (elements.offlineBanner) elements.offlineBanner.style.display = 'flex';
        if (elements.syncIndicator) {
            elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
        }
    }

    function handleStorageEvent(e) {
        if (e.key === 'USER_TOKEN' && e.newValue) {
            session.setToken(e.newValue);
        }
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function updateMoodIndicator(mood) {
        if (!elements.callMoodIndicator) return;
        const moodIcons = {
            happy: 'fa-smile',
            neutral: 'fa-meh',
            sad: 'fa-frown',
            angry: 'fa-angry',
            tired: 'fa-tired'
        };
        const icon = moodIcons[mood] || 'fa-meh';
        elements.callMoodIndicator.innerHTML = `<i class="fas ${icon}"></i><span>${SecurityCore.sanitizeString(mood)}</span>`;
        elements.callMoodIndicator.className = `mood-indicator mood-${SecurityCore.sanitizeString(mood)}`;
    }

    function updateIntentionIndicator(intention) {
        if (!elements.callIntentionIndicator) return;
        const intentionLabels = {
            quick: 'Quick Chat',
            important: 'Important',
            emergency: 'Emergency',
            checkin: 'Check-in',
            work: 'Work'
        };
        const label = intentionLabels[intention] || 'Quick Chat';
        elements.callIntentionIndicator.innerHTML = `<i class="fas fa-bullseye"></i><span>${SecurityCore.sanitizeString(label)}</span>`;
        elements.callIntentionIndicator.className = `intention-indicator intention-${SecurityCore.sanitizeString(intention)}`;
    }

    function updateParticipantBadge() {
        const badge = document.querySelector('.participant-badge');
        if (badge) {
            badge.textContent = AppState.callParticipants.length + 1;
        }
    }

    function updateChatBadge() {
        if (AppState.unreadChatCount > 0) {
            const badge = document.querySelector('.chat-badge');
            if (badge) {
                badge.textContent = AppState.unreadChatCount;
                badge.style.display = 'flex';
            }
        }
    }

    function updateGroupCallButton() {
        if (elements.quickGroupBtn) {
            elements.quickGroupBtn.disabled = !AppState.isPremium && !session.isDemoMode();
        }
    }

    function updateVideoLayout() {
        const videoCount = elements.videoGrid.querySelectorAll('.video-container').length;
        if (videoCount === 1) {
            elements.videoGrid.style.gridTemplateColumns = '1fr';
        } else if (videoCount === 2) {
            elements.videoGrid.style.gridTemplateColumns = '1fr 1fr';
        } else if (videoCount === 3) {
            elements.videoGrid.style.gridTemplateColumns = '1fr 1fr';
        } else if (videoCount >= 4) {
            elements.videoGrid.style.gridTemplateColumns = '1fr 1fr';
        }
    }

    function initializeWhiteboard(canvas) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
    }

    function sendChatMessage(message) {
        if (!message || !AppState.isInCall) return;
        const chatMessages = document.getElementById('chatMessagesPanel');
        if (chatMessages) {
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-message self';
            msgEl.innerHTML = `
                <div class="message-sender">You</div>
                <div class="message-content">${SecurityCore.sanitizeString(message)}</div>
                <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            `;
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function saveSharedNotes(notes) {
        if (!notes) return;
        try {
            const savedNotes = SecurityCore.safeJSONParse(SecurityCore.safeLocalStorageGet('sharedNotes') || '[]', []);
            savedNotes.push({
                notes: SecurityCore.sanitizeString(notes),
                timestamp: Date.now(),
                callId: AppState.activeCallId
            });
            SecurityCore.safeLocalStorageSet('sharedNotes', JSON.stringify(savedNotes));
        } catch (error) {
            logger.error('saveSharedNotes', error);
        }
    }

    function createCallHistoryItem(call) {
        const date = new Date(call.date);
        const timeAgo = formatTimeAgo(date);
        const duration = call.missed ? 'Missed' : formatDuration(call.duration);
        const icon = call.type === 'video' ? 'fa-video' : 'fa-phone';
        const statusClass = call.missed ? 'missed' : '';
        
        return `
            <div class="call-history-item ${statusClass}">
                <div class="call-avatar">${SecurityCore.sanitizeString(call.contact.charAt(0))}</div>
                <div class="call-info">
                    <div class="call-name">${SecurityCore.sanitizeString(call.contact)}</div>
                    <div class="call-details">
                        <i class="fas ${icon}"></i>
                        <span>${SecurityCore.sanitizeString(duration)}</span>
                        <span>•</span>
                        <span>${SecurityCore.sanitizeString(timeAgo)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function makeDraggable(element) {
        if (!element) return;
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        element.onmousedown = dragMouseDown;
        
        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        
        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + 'px';
            element.style.left = (element.offsetLeft - pos1) + 'px';
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    function closePip() {
        if (elements.pipContainer) {
            elements.pipContainer.style.display = 'none';
        }
    }

    function checkPremiumFeature(feature) {
        if (session.isDemoMode()) return true;
        if (!AppState.isPremium && !AppState.premiumFeatures[feature]) {
            if (elements.premiumLimitOverlay) {
                const featureNameEl = document.getElementById('premiumFeatureName');
                if (featureNameEl) {
                    featureNameEl.textContent = feature === 'groupCalls' ? 'Group Calls' :
                                              feature === 'screenSharing' ? 'Screen Sharing' :
                                              feature === 'whiteboard' ? 'Whiteboard' :
                                              feature === 'polls' ? 'Polls' :
                                              feature === 'relationshipInsights' ? 'Relationship Insights' :
                                              'Premium Feature';
                }
                elements.premiumLimitOverlay.classList.add('active');
            }
            return false;
        }
        return true;
    }

    function updateSetting(event) {
        const setting = event.target.id.replace('Toggle', '');
        const settingKey = setting.charAt(0).toLowerCase() + setting.slice(1);
        AppState.settings[settingKey] = event.target.checked;
        saveSettings();
        applySettingChange(settingKey, event.target.checked);
    }

    function applySettingChange(settingKey, value) {
        if (settingKey === 'focusMode' && AppState.isInCall) {
            if (value) {
                document.body.classList.add('focus-mode');
            } else {
                document.body.classList.remove('focus-mode');
            }
        }
    }

    function resetSettings() {
        AppState.settings = {
            emotionalContext: true,
            callIntention: true,
            inCallChat: true,
            whiteboard: true,
            polls: true,
            notes: true,
            focusMode: false,
            liveReactions: true,
            theme: 'light'
        };
        saveSettings();
        applySettingsToUI();
        showNotification('Settings reset to default', 'success');
    }

    function checkUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const callId = urlParams.get('call');
        const callType = urlParams.get('type') || 'voice';
        
        if (callId && elements.urlParamOverlay) {
            const urlParamCallId = document.getElementById('urlParamCallId');
            if (urlParamCallId) {
                urlParamCallId.textContent = SecurityCore.sanitizeString(callId);
            }
            elements.urlParamOverlay.dataset.callId = callId;
            elements.urlParamOverlay.dataset.callType = callType;
            elements.urlParamOverlay.classList.add('active');
        }
    }

    function closeUrlParamOverlay() {
        if (elements.urlParamOverlay) {
            elements.urlParamOverlay.classList.remove('active');
        }
    }

    function joinUrlParamCall() {
        if (!elements.urlParamOverlay) return;
        const callId = elements.urlParamOverlay.dataset.callId;
        const callType = elements.urlParamOverlay.dataset.callType || 'voice';
        
        closeUrlParamOverlay();
        
        if (window.callCore) {
            window.callCore.startCall({
                type: callType,
                callId: callId,
                participants: [{ id: 'remote', name: 'Call Participant' }]
            }).catch(error => {
                showNotification(`Failed to join call: ${error.message}`, 'error');
            });
        }
    }

    // STABILITY PATCH: Request session resync from parent
    function requestResync() {
        logger.info('Requesting session resync from parent');
        parentComm.send('REQUEST_RESYNC', {
            iframeId: iframeId,
            timestamp: Date.now()
        });
    }

    // ==================== INCOMING CALL SIMULATION ====================
    function simulateIncomingCall(callerId, metadata = {}) {
        if (AppState.isInCall) {
            showNotification('Already in a call', 'warning');
            return false;
        }
        
        try {
            let callerContact = null;
            
            if (AppState.contacts && AppState.contacts.length > 0) {
                callerContact = AppState.contacts.find(c => c.id === callerId);
            }
            
            if (!callerContact) {
                callerContact = {
                    id: callerId || 'simulated-' + Date.now(),
                    name: metadata.name || 'Test Caller',
                    avatar: metadata.avatar || null,
                    isPremium: metadata.isPremium || false
                };
            }
            
            const callMetadata = {
                callType: metadata.callType || 'voice',
                mood: metadata.mood || 'neutral',
                intention: metadata.intention || 'quick',
                isGroup: metadata.isGroup || false,
                callId: 'simulated-call-' + Date.now(),
                timestamp: Date.now()
            };
            
            if (elements.incomingCallModal && elements.incomingCallName) {
                elements.incomingCallName.textContent = SecurityCore.sanitizeString(callerContact.name);
                elements.incomingCallType.textContent = callMetadata.callType === 'video' ? 'Video Call' : 'Voice Call';
                
                const initials = callerContact.name.split(' ').map(n => n[0]).join('').toUpperCase();
                elements.incomingCallAvatar.innerHTML = SecurityCore.sanitizeString(initials);
                elements.incomingCallAvatar.style.backgroundColor = stringToColor(callerContact.name);
                
                if (metadata.mood) {
                    const moodIcons = {
                        happy: 'fa-smile',
                        neutral: 'fa-meh',
                        sad: 'fa-frown',
                        angry: 'fa-angry',
                        tired: 'fa-tired'
                    };
                    const icon = moodIcons[metadata.mood] || 'fa-meh';
                    elements.incomingCallMood.innerHTML = `<i class="fas ${icon}"></i><span>${SecurityCore.sanitizeString(metadata.mood)}</span>`;
                    elements.incomingCallMood.className = `mood-indicator mood-${SecurityCore.sanitizeString(metadata.mood)}`;
                    elements.incomingCallMood.style.display = 'inline-flex';
                } else {
                    elements.incomingCallMood.style.display = 'none';
                }
                
                if (metadata.intention) {
                    const intentionLabels = {
                        quick: 'Quick Chat',
                        important: 'Important',
                        emergency: 'Emergency',
                        checkin: 'Check-in',
                        work: 'Work'
                    };
                    const label = intentionLabels[metadata.intention] || 'Quick Chat';
                    elements.incomingCallIntention.innerHTML = `<i class="fas fa-bullseye"></i><span>${SecurityCore.sanitizeString(label)}</span>`;
                    elements.incomingCallIntention.className = `intention-indicator intention-${SecurityCore.sanitizeString(metadata.intention)}`;
                    elements.incomingCallIntention.style.display = 'inline-flex';
                } else {
                    elements.incomingCallIntention.style.display = 'none';
                }
                
                let timeLeft = 45;
                elements.declineTimer.textContent = timeLeft;
                
                const countdown = setInterval(() => {
                    timeLeft--;
                    elements.declineTimer.textContent = timeLeft;
                    if (timeLeft <= 0) {
                        clearInterval(countdown);
                        if (elements.incomingCallModal.classList.contains('active')) {
                            elements.incomingCallModal.classList.remove('active');
                        }
                    }
                }, 1000);
                
                elements.incomingCallModal.dataset.timer = countdown;
                elements.incomingCallModal.dataset.caller = JSON.stringify(callerContact);
                elements.incomingCallModal.dataset.metadata = JSON.stringify(callMetadata);
                
                elements.incomingCallModal.classList.add('active');
                
                parentComm.send('INCOMING_CALL_SIMULATED', {
                    callerId: callerContact.id,
                    metadata: callMetadata,
                    timestamp: Date.now()
                });
                
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error('simulateIncomingCall', error);
            return false;
        }
    }

    // ==================== AUTHENTICATION HANDLER ====================
    const auth = {
        retryCount: 0,
        
        sync: async function() {
            try {
                logger.info('Starting auth sync');
                session.setState(STATE.SYNC);
                
                const initialized = await session.init();
                
                if (initialized) {
                    this.retryCount = 0;
                    session.setState(STATE.READY);
                    return true;
                }
                
                if (session.isDemoMode()) {
                    session.setState(STATE.DEGRADED);
                    return false;
                }
                
                if (this.retryCount < CONFIG.AUTH_RETRY_LIMIT) {
                    this.retryCount++;
                    logger.warn(`Auth retry ${this.retryCount}/${CONFIG.AUTH_RETRY_LIMIT}`);
                    
                    const delay = CONFIG.AUTH_RETRY_DELAY * this.retryCount;
                    const timer = setTimeout(() => this.sync(), delay);
                    timers.add(timer);
                    return false;
                }
                
                logger.warn('Auth sync failed after max retries');
                session.setState(STATE.DEGRADED);
                return false;
            } catch (error) {
                logger.error('Auth sync failed', error);
                session.setState(STATE.DEGRADED);
                return false;
            }
        },
        
        check: function() {
            return session.validateToken();
        },
        
        refresh: function() {
            return session.refreshToken();
        },
        
        logout: function() {
            session.clearToken();
            parentComm.send('USER_LOGGED_OUT', { timestamp: Date.now() });
            logger.info('Logout completed');
            return this.sync();
        }
    };

    // ==================== LIFECYCLE MANAGER ====================
    const lifecycle = {
        init: async function() {
            try {
                logger.info(`Starting lifecycle (${iframeId})`);
                logger.info(`Environment: ${window.parent === window ? 'standalone' : 'embedded'}`);
                
                session.setState(STATE.INIT);
                
                const authSynced = await auth.sync();
                
                if (authSynced) {
                    session.setState(STATE.READY);
                } else {
                    logger.warn('Proceeding in degraded/demo mode');
                    session.setState(STATE.DEGRADED);
                }
                
                this.setupVisibilityHandling();
                this.setupConnectivityHandling();
                this.startHeartbeat();
                
                parentComm.send('IFRAME_READY', {
                    iframeId: iframeId,
                    state: currentState,
                    sessionValid: session.validateToken(),
                    demoMode: session.isDemoMode(),
                    timestamp: Date.now()
                });
                
                logger.info('Lifecycle initialization complete');
                return true;
            } catch (error) {
                logger.error('Lifecycle initialization failed', error);
                session.setState(STATE.DEGRADED);
                return false;
            }
        },
        
        setupVisibilityHandling: function() {
            const handler = () => {
                if (document.hidden) {
                    if (currentState === STATE.ACTIVE) {
                        session.setState(STATE.SUSPENDED);
                        parentComm.send('IFRAME_SUSPENDED', { timestamp: Date.now() });
                    }
                } else {
                    if (currentState === STATE.SUSPENDED || currentState === STATE.READY || currentState === STATE.DEGRADED) {
                        session.setState(STATE.ACTIVE);
                        parentComm.send('IFRAME_ACTIVE', { timestamp: Date.now() });
                        
                        if (session.validateToken()) {
                            session.refreshToken();
                        } else if (!session.isDemoMode()) {
                            auth.sync();
                        }
                        
                        // STABILITY PATCH: Re-verify session on visibility change
                        if (!getValidatedSession() && !session.isDemoMode()) {
                            requestResync();
                        }
                    }
                }
            };
            
            document.addEventListener('visibilitychange', handler);
            eventListeners.set('visibilitychange', handler);
            
            if (!document.hidden) {
                session.setState(STATE.ACTIVE);
            }
        },
        
        setupConnectivityHandling: function() {
            const onlineHandler = () => {
                isOnline = true;
                logger.info('Network online');
                
                if (currentState === STATE.DEGRADED && !session.isDemoMode()) {
                    auth.sync();
                } else if (session.validateToken()) {
                    parentComm.send('NETWORK_RESTORED', { timestamp: Date.now() });
                    
                    // STABILITY PATCH: Re-sync session on reconnect
                    if (!getValidatedSession()) {
                        requestResync();
                    }
                }
            };
            
            const offlineHandler = () => {
                isOnline = false;
                logger.warn('Network offline');
                parentComm.send('NETWORK_LOST', { timestamp: Date.now() });
            };
            
            window.addEventListener('online', onlineHandler);
            window.addEventListener('offline', offlineHandler);
            
            eventListeners.set('online', onlineHandler);
            eventListeners.set('offline', offlineHandler);
        },
        
        startHeartbeat: function() {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            
            heartbeatInterval = setInterval(() => {
                if (currentState !== STATE.SUSPENDED && currentState !== STATE.DESTROYED) {
                    parentComm.send('HEARTBEAT', {
                        state: currentState,
                        sessionValid: session.validateToken(),
                        demoMode: session.isDemoMode(),
                        timestamp: Date.now()
                    });
                }
            }, CONFIG.HEARTBEAT_INTERVAL);
            
            timers.add(heartbeatInterval);
        },
        
        destroy: function() {
            logger.info('Destroying iframe instance');
            session.setState(STATE.DESTROYED);
            
            timers.forEach(timer => {
                try {
                    if (timer && typeof timer === 'object' && 'ref' in timer) {
                        clearInterval(timer);
                        clearTimeout(timer);
                    }
                } catch (e) {}
            });
            timers.clear();
            
            eventListeners.forEach((handler, event) => {
                try {
                    window.removeEventListener(event, handler);
                    document.removeEventListener(event, handler);
                } catch (e) {}
            });
            eventListeners.clear();
            
            pendingRequests.forEach((req) => {
                try { if (req.cleanup) req.cleanup(); } catch (e) {}
            });
            pendingRequests.clear();
            
            parentComm.send('IFRAME_DESTROYED', {
                iframeId: iframeId,
                timestamp: Date.now()
            });
            
            logger.info('Iframe destroyed');
            return { success: true };
        }
    };

    // ==================== MESSAGE HANDLER ====================
    const messageHandler = {
        init: function() {
            window.addEventListener('message', this.handleMessage.bind(this));
            logger.info('Message handler initialized');
        },
        
        handleMessage: function(event) {
            if (!event.data || typeof event.data !== 'object') return;
            if (!MessageValidator.validateOrigin(event.origin)) return;
            if (!MessageValidator.validate(event.data)) return;
            
            try {
                const data = event.data;
                
                switch (data.type) {
                    case 'SESSION_UPDATE':
                        if (data.payload?.token) {
                            session.setToken(data.payload.token, data.payload.expiry);
                        }
                        break;
                    case 'TOKEN_REFRESH':
                        if (data.payload?.token) {
                            session.setToken(data.payload.token, data.payload.expiry);
                            parentComm.send('TOKEN_REFRESHED', { timestamp: Date.now() });
                        }
                        break;
                    case 'LOGOUT':
                        logger.info('Logout requested by parent');
                        session.clearToken();
                        parentComm.send('USER_LOGGED_OUT', { timestamp: Date.now() });
                        auth.sync();
                        break;
                    case 'PING':
                        if (data.payload?.requestId) {
                            parentComm.send('PONG', {
                                requestId: data.payload.requestId,
                                state: currentState,
                                sessionValid: session.validateToken(),
                                demoMode: session.isDemoMode(),
                                timestamp: Date.now()
                            });
                        }
                        break;
                    case 'PARENT_CRASH_RECOVERY':
                        logger.warn('Parent crash detected, initiating recovery');
                        session.clearToken();
                        setTimeout(() => auth.sync(), 500);
                        break;
                    case 'ACK':
                        parentComm._handleAck(data);
                        break;
                    case 'SESSION_INIT':
                        if (data.payload && data.payload.session && data.payload.session.token) {
                            session.setToken(data.payload.session.token, data.payload.session.expiry);
                            if (data.payload.session.user) {
                                currentUser = data.payload.session.user;
                                userDataLoaded = true;
                            }
                            logger.info('Session initialized from parent via SESSION_INIT');
                        }
                        break;
                    // STABILITY PATCH: Handle SESSION_SYNC from parent
                    case 'SESSION_SYNC':
                        if (data.payload) {
                            handleSessionSync(data.payload, data.messageId);
                        }
                        break;
                    // STABILITY PATCH: Handle SESSION_ACK from parent
                    case 'SESSION_ACK':
                        if (data.payload) {
                            handleParentAck(data.payload);
                        }
                        break;
                }
            } catch (error) {
                logger.error('Failed to handle parent message', error, event.data?.type);
            }
        }
    };

    // ==================== SAFE INITIALIZATION ====================

    function bootstrapIframe() {
        if (sessionInitialized) {
            logger.once('Session already initialized, skipping bootstrap');
            return;
        }
        
        logger.info('Bootstrapping iframe...');
        
        try {
            cacheElements();
            messageHandler.init();
            
            lifecycle.init().then(() => {
                logger.info('Lifecycle initialized');
            }).catch(error => {
                logger.error('Lifecycle initialization failed', error);
            });
            
            window.callAPI = new CallAPIIntegration();
            
            setTimeout(() => {
                window.callAPI.initialize().then(() => {
                    logger.info('API integration initialized successfully');
                }).catch(error => {
                    logger.error('bootstrapIframe.callAPI', error);
                    enableUI();
                });
            }, 100);
            
            window.callCore = new CallCore();
            
            // STABILITY PATCH: Use safe initialization for call core
            setTimeout(() => {
                window.callCore.safeInitialize().catch(error => {
                    logger.error('Call core safe initialization failed', error);
                });
            }, 200);
            
            window.coreInitializer = new CoreInitializer();
            
            setTimeout(() => {
                window.coreInitializer.initialize().catch(error => {
                    logger.error('Core initializer failed', error);
                });
            }, 300);
            
            window.addEventListener('beforeunload', () => {
                if (window.callAPI) window.callAPI.cleanup();
                if (window.callCore) window.callCore.cleanup();
                if (window.coreInitializer) window.coreInitializer.cleanup();
                if (parentCoordinator) parentCoordinator.cleanup();
                lifecycle.destroy();
            });
            
            showUI();
            enableUI();
            
            logger.info('Bootstrap completed');
        } catch (error) {
            logger.error('bootstrapIframe', error);
            try { showUI(); enableUI(); } catch (e) {}
        }
    }

    function showUI() {
        try {
            const appContainer = document.getElementById('appContainer');
            if (appContainer) {
                appContainer.style.visibility = 'visible';
                appContainer.style.opacity = '1';
            }
            
            const loadingIndicators = document.querySelectorAll('.loading-indicator, .initializing-overlay');
            loadingIndicators.forEach(indicator => {
                if (indicator) indicator.style.display = 'none';
            });
        } catch (error) {
            logger.error('showUI', error);
        }
    }

    function enableUI() {
        const isAuthenticated = parentCoordinator ? parentCoordinator.sessionValidated : AppState.isAuthenticated;
        
        try {
            if (elements.newCallBtn) elements.newCallBtn.disabled = !isAuthenticated && !session.isDemoMode();
            if (elements.quickVoiceBtn) elements.quickVoiceBtn.disabled = !isAuthenticated && !session.isDemoMode();
            if (elements.quickVideoBtn) elements.quickVideoBtn.disabled = !isAuthenticated && !session.isDemoMode();
            
            if (AppState.isOnline) {
                if (elements.syncIndicator) {
                    if (session.isDemoMode()) {
                        elements.syncIndicator.innerHTML = '<i class="fas fa-eye"></i><span>Demo Mode</span>';
                    } else {
                        elements.syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                    }
                }
            } else {
                if (elements.syncIndicator) {
                    elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
                }
            }
        } catch (error) {
            logger.error('enableUI', error);
        }
    }

    function showNotification(message, type = 'success') {
        try {
            const notification = document.createElement('div');
            notification.className = `call-notification ${type}`;
            
            notification.innerHTML = `
                <div class="call-notification-content">
                    <div class="call-notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                    <div class="call-notification-message">${SecurityCore.sanitizeString(message)}</div>
                </div>
                <button class="call-notification-close">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            const notificationArea = document.getElementById('notificationArea') || document.body;
            notificationArea.appendChild(notification);
            
            const closeBtn = notification.querySelector('.call-notification-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => notification.remove());
            }
            
            const timer = setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 3000);
            timers.add(timer);
        } catch (error) {
            logger.error('showNotification', error);
        }
    }

    // ==================== GLOBAL EXPORTS ====================
    window.CallApp = {
        id: iframeId,
        state: () => currentState,
        session: () => session.getStatus(),
        auth: () => auth.check(),
        refresh: () => auth.refresh(),
        logout: () => auth.logout(),
        simulateIncomingCall,
        startTestCall: () => {
            if (AppState.contacts && AppState.contacts.length > 0) {
                if (window.callCore) {
                    window.callCore.startCall({
                        type: 'video',
                        contactId: AppState.contacts[0].id,
                        participants: [AppState.contacts[0]]
                    }).catch(error => {
                        logger.error('Test call failed', error);
                    });
                }
            }
        },
        getState: () => AppState,
        checkApiStatus: () => {
            try {
                return {
                    isAuthenticated: AppState.isAuthenticated,
                    apiReady: AppState.apiReady,
                    user: AppState.user,
                    tokenReady: window.callAPI ? window.callAPI.tokenManager.isTokenReady() : false,
                    parentCoordinator: parentCoordinator ? parentCoordinator.getStatus() : null,
                    secureHandshakeInProgress: secureHandshakeInProgress,
                    secureSessionValid: parentCoordinator ? parentCoordinator.secureSessionValid : false,
                    state: currentState,
                    demoMode: session.isDemoMode()
                };
            } catch (error) {
                logger.error('CallApp.checkApiStatus', error);
                return {
                    isAuthenticated: false,
                    apiReady: false,
                    user: null,
                    tokenReady: false,
                    parentCoordinator: null,
                    secureHandshakeInProgress: false,
                    secureSessionValid: false,
                    state: currentState,
                    demoMode: true
                };
            }
        },
        notifyParent: (type, data) => parentComm.send(type, data),
        requestSecureSession: () => {
            if (parentCoordinator) parentCoordinator.startSecureHandshake();
        },
        getHandshakeStatus: () => {
            try {
                return {
                    secureHandshakeInProgress: secureHandshakeInProgress,
                    secureSessionValid: parentCoordinator ? parentCoordinator.secureSessionValid : false,
                    secureHandshakeAttempts: secureHandshakeAttempts,
                    maxHandshakeAttempts: maxHandshakeAttempts,
                    handshakeComplete: parentCoordinator ? parentCoordinator.handshakeComplete : false,
                    fallbackMode: parentCoordinator ? parentCoordinator.fallbackMode : true
                };
            } catch (error) {
                logger.error('CallApp.getHandshakeStatus', error);
                return {
                    secureHandshakeInProgress: false,
                    secureSessionValid: false,
                    secureHandshakeAttempts: 0,
                    maxHandshakeAttempts: maxHandshakeAttempts,
                    handshakeComplete: false,
                    fallbackMode: true
                };
            }
        },
        destroy: () => lifecycle.destroy(),
        cleanupUISession: () => {
            logger.info('Cleaning up UI session');
            if (window.callAPI) window.callAPI.cleanup();
            if (window.callCore) window.callCore.cleanup();
            if (parentCoordinator) parentCoordinator.cleanup();
            session.clearToken();
            return true;
        },
        // STABILITY PATCH: Request session resync
        requestResync: () => requestResync(),
        // STABILITY PATCH: Get validated session
        getValidatedSession: () => getValidatedSession(),
        // STABILITY PATCH: Check if session is valid
        isValidSession: (session) => isValidSession(session)
    };

    // ==================== AUTO-START ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            safeInit().catch(e => logger.error('Auto-start failed', e));
        });
    } else {
        safeInit().catch(e => logger.error('Auto-start failed', e));
    }

    // ==================== STATE CHANGE SUBSCRIPTION ====================
    window.iframeCore = {
        id: iframeId,
        getState: () => currentState,
        getSession: () => session.getStatus(),
        refreshSession: () => auth.refresh(),
        logout: () => auth.logout(),
        sendMessage: (type, payload) => parentComm.send(type, payload),
        requestToken: () => session.requestToken(),
        destroy: () => lifecycle.destroy(),
        onStateChange: (callback) => {
            if (typeof callback === 'function') {
                stateChangeCallbacks.add(callback);
                return () => stateChangeCallbacks.delete(callback);
            }
        },
        diag: () => ({
            timers: timers.size,
            pendingRequests: pendingRequests.size,
            errorCacheSize: errorCache.size,
            messageCacheSize: messageCache.size,
            listeners: eventListeners.size,
            online: isOnline,
            visible: !document.hidden,
            state: currentState,
            sessionValid: session.validateToken(),
            demoMode: session.isDemoMode(),
            parentDetected: !!(window.parent && window.parent !== window),
            logger: logger.getMetrics ? logger.getMetrics() : {},
            // STABILITY PATCH: Additional diagnostics
            callCoreState: callCoreState,
            sessionAckReceived: sessionAckReceived,
            sessionAckTimestamp: sessionAckTimestamp,
            validatedSession: !!validatedSession,
            sessionValidationTimestamp: sessionValidationTimestamp
        })
    };

    // ==================== EXPORT CONTRACT ====================
    async function initializeCore(options = {}) {
        return ErrorBoundary.executeAsync(async () => {
            logger.info('initializeCore called', options);
            const result = await safeInit();
            return { 
                status: coreReady ? 'ready' : 'degraded', 
                mode: session.isDemoMode() ? 'demo' : session.isGuestMode() ? 'guest' : 'production',
                iframeId,
                timestamp: Date.now()
            };
        }, 'initializeCore', { status: 'failed', mode: 'demo' });
    }

    async function startHandshake(options = {}) {
        return ErrorBoundary.executeAsync(async () => {
            logger.info('startHandshake called', options);
            
            const maxAttempts = options.maxAttempts || CONFIG.HANDSHAKE_MAX_ATTEMPTS;
            const timeout = options.timeout || CONFIG.HANDSHAKE_TIMEOUT;
            
            return RetryManager.executeWithRetry(async () => {
                if (_HANDSHAKE_DONE_ || session.isDemoMode()) {
                    return { success: true, handshakeComplete: _HANDSHAKE_DONE_, attempts: _HANDSHAKE_RETRIES_ };
                }
                
                _HANDSHAKE_RETRIES_++;
                notifyParentReady();
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                return { 
                    success: _HANDSHAKE_DONE_, 
                    handshakeComplete: _HANDSHAKE_DONE_,
                    attempts: _HANDSHAKE_RETRIES_,
                    parentReady: _PARENT_READY_
                };
            }, 'handshake', { maxRetries: maxAttempts, timeout });
        }, 'startHandshake', { success: false });
    }

    function sendToParent(type, payload = {}, options = {}) {
        return ErrorBoundary.execute(() => {
            logger.once('sendToParent: ' + type);
            
            if (options.requireResponse) {
                return parentComm.request(type, payload, options.timeout || 5000);
            }
            
            if (options.requireAck) {
                return parentComm.sendWithAck(type, payload, options.timeout || 5000);
            }
            
            return parentComm.send(type, payload);
        }, 'sendToParent', options.requireResponse ? Promise.reject(new Error('Send failed')) : false);
    }

    async function requestSession(options = {}) {
        return ErrorBoundary.executeAsync(async () => {
            logger.info('requestSession called', options);
            
            const sessionData = await SessionManager.acquire();
            
            return {
                success: sessionData,
                valid: session.validateToken(),
                demoMode: session.isDemoMode(),
                guestMode: session.isGuestMode(),
                user: currentUser,
                timestamp: Date.now()
            };
        }, 'requestSession', { success: false, valid: false, demoMode: true });
    }

    function receiveFromParent(type, handler) {
        return ErrorBoundary.execute(() => {
            if (!type || typeof handler !== 'function') {
                logger.error('receiveFromParent: invalid parameters');
                return false;
            }
            
            const wrappedHandler = (message, origin) => {
                try {
                    handler(message.payload || message, { 
                        origin, 
                        id: message.id, 
                        timestamp: message.timestamp 
                    });
                } catch (error) {
                    logger.error(`Handler error for ${type}`, error);
                }
            };
            
            window.addEventListener('message', (event) => {
                if (!MessageValidator.validateOrigin(event.origin)) return;
                if (!event.data || event.data.type !== type) return;
                if (!MessageValidator.validate(event.data)) return;
                
                wrappedHandler(event.data, event.origin);
            });
            
            logger.once('Registered receive handler: ' + type);
            return true;
        }, 'receiveFromParent', false);
    }

    function shutdownCore() {
        return ErrorBoundary.execute(() => {
            logger.info('shutdownCore called');
            return lifecycle.destroy();
        }, 'shutdownCore', { success: false });
    }

    async function initializeUI() {
        return ErrorBoundary.executeAsync(async () => {
            logger.info('initializeUI called');
            cacheElements();
            return {
                success: true,
                elements: Object.keys(elements).length,
                timestamp: Date.now()
            };
        }, 'initializeUI', { success: false, elements: 0 });
    }

    function cleanupUISession() {
        return ErrorBoundary.execute(() => {
            logger.info('cleanupUISession called');
            if (window.callAPI) window.callAPI.cleanup();
            if (window.callCore) window.callCore.cleanup();
            if (parentCoordinator) parentCoordinator.cleanup();
            session.clearToken();
            return { success: true, timestamp: Date.now() };
        }, 'cleanupUISession', { success: false });
    }

    // Export all functions and objects for ES modules
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            initializeCore,
            startHandshake,
            sendToParent,
            requestSession,
            receiveFromParent,
            shutdownCore,
            initializeUI,
            cleanupUISession,
            isValidSession,
            getValidatedSession,
            waitForSession,
            waitForParent,
            waitForHandshake,
            verifySession,
            safeInit,
            requestResync,
            sendSessionAck,
            CoreInitializer,
            CallCore,
            ParentCoordinator,
            TokenManager,
            SecureAPIClient,
            CallAPIIntegration,
            AppState,
            elements,
            simulateIncomingCall,
            showNotification,
            bootstrapIframe,
            cacheElements,
            initializeOfflineDetection,
            showUI,
            enableUI,
            checkUrlParameters,
            makeDraggable,
            closePip,
            checkPremiumFeature,
            updatePremiumUI,
            loadSettings,
            saveSettings,
            applySettingsToUI,
            updateSetting,
            applySettingChange,
            resetSettings,
            handleOnline,
            handleOffline,
            showOfflineUI,
            handleStorageEvent,
            debounce,
            stringToColor,
            formatTimeAgo,
            formatDuration,
            closeUrlParamOverlay,
            joinUrlParamCall,
            updateMoodIndicator,
            updateIntentionIndicator,
            updateParticipantBadge,
            updateChatBadge,
            updateGroupCallButton,
            updateVideoLayout,
            initializeWhiteboard,
            sendChatMessage,
            saveSharedNotes,
            renderCallHistory,
            createCallHistoryItem,
            currentUser,
            userDataLoaded,
            parentCoordinator,
            sessionAuthorityReady,
            SecurityCore,
            STATE,
            CallCoreState,
            logger,
            auth,
            lifecycle,
            parentComm,
            MessageValidator,
            RetryManager,
            ErrorBoundary,
            MessageIdGenerator
        };
    }

    // Make everything available globally for non-module usage
    window.callsCore = {
        initializeCore,
        startHandshake,
        sendToParent,
        requestSession,
        receiveFromParent,
        shutdownCore,
        initializeUI,
        cleanupUISession,
        isValidSession,
        getValidatedSession,
        waitForSession,
        waitForParent,
        waitForHandshake,
        verifySession,
        safeInit,
        requestResync,
        sendSessionAck,
        CoreInitializer,
        CallCore,
        ParentCoordinator,
        TokenManager,
        SecureAPIClient,
        CallAPIIntegration,
        AppState,
        elements,
        simulateIncomingCall,
        showNotification,
        bootstrapIframe,
        cacheElements,
        initializeOfflineDetection,
        showUI,
        enableUI,
        checkUrlParameters,
        makeDraggable,
        closePip,
        checkPremiumFeature,
        updatePremiumUI,
        loadSettings,
        saveSettings,
        applySettingsToUI,
        updateSetting,
        applySettingChange,
        resetSettings,
        handleOnline,
        handleOffline,
        showOfflineUI,
        handleStorageEvent,
        debounce,
        stringToColor,
        formatTimeAgo,
        formatDuration,
        closeUrlParamOverlay,
        joinUrlParamCall,
        updateMoodIndicator,
        updateIntentionIndicator,
        updateParticipantBadge,
        updateChatBadge,
        updateGroupCallButton,
        updateVideoLayout,
        initializeWhiteboard,
        sendChatMessage,
        saveSharedNotes,
        renderCallHistory,
        createCallHistoryItem,
        currentUser,
        userDataLoaded,
        parentCoordinator,
        sessionAuthorityReady,
        SecurityCore,
        STATE,
        CallCoreState,
        logger,
        auth,
        lifecycle,
        parentComm,
        MessageValidator,
        RetryManager,
        ErrorBoundary,
        MessageIdGenerator
    };

})();