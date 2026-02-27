// =============================================
// SETTINGS CORE - PARENT AUTHORITY v7.0.0
// DETERMINISTIC STATE MACHINE UNDER PARENT CONTROL
// NO DEMO_MODE | NO INDEPENDENT SESSION | NO RECOVERY LOOPS
// COMPLETE INTEGRATION WITH PARENT ORCHESTRATION
// =============================================

// =============================================
// MODULE IDENTITY & VERSION
// =============================================
const MODULE_NAME = 'settings-core';
const MODULE_VERSION = '7.0.0-parent-authority';
const PROTOCOL_VERSION = '3.0';
const PROTOCOL_CANONICAL = 'KYN-3.0';
const FRAME_ID = 'settings';
let moduleId = `settings-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// =============================================
// GLOBAL DEBUG FLAG - MINIMAL NOISE
// =============================================
const DEBUG = false;
window.__SETTINGS_DEBUG__ = DEBUG;
let DEBUG_ENABLED = DEBUG;
let CONSOLE_NOISE_SUPPRESSED = true;

// =============================================
// SETTINGS STATE MACHINE - STRICT PARENT AUTHORITY
// =============================================
const SETTINGS_STATES = {
    INIT: 'INIT',
    REGISTERING: 'REGISTERING',
    REGISTERED: 'REGISTERED',
    SESSION_RECEIVED: 'SESSION_RECEIVED',
    ACTIVE: 'ACTIVE',
    READY: 'READY',
    DEGRADED: 'DEGRADED'
};

let currentState = SETTINGS_STATES.INIT;
let stateHistory = [];
let stateTransitionLock = false;
let initializationPromise = null;
let initializationLock = false;
let readyEmitted = false;

// Exposed flags for parent inspection
window.__SETTINGS_STATE__ = currentState;
window.__SETTINGS_SESSION_ACTIVE__ = false;
window.__SETTINGS_READY__ = false;

// Log throttling to prevent spam
const logThrottle = new Map();
const THROTTLE_TIMES = {
    'REGISTRATION': 30000,
    'HEARTBEAT': 10000,
    'default': 5000
};

const PROCESSED_MESSAGE_TTL = 5000;
const processedMessages = new Map();
let lastPingTime = 0;
const PING_RATE_LIMIT = 5000;
let sessionRequestTimeout = null;

// Deterministic Parent Authority State Machine
const PARENT_AUTHORITY_STATES = {
    PREINIT: 'PREINIT',
    WAIT_PARENT: 'WAIT_PARENT',
    REGISTERING: 'REGISTERING',
    WAIT_SESSION: 'WAIT_SESSION',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY'
};

let parentAuthorityState = PARENT_AUTHORITY_STATES.PREINIT;
let parentReadyDetected = false;
let parentRegistrationSent = false;
let parentAuthorityTimeout = null;
let parentAuthorityRetryCount = 0;
const MAX_PARENT_AUTHORITY_RETRIES = 2;
const PARENT_AUTHORITY_TIMEOUT = 5000;
let parentAuthoritativeSession = null;

let parentContractEnforced = false;
let moduleRegistered = false;

// Required Parent Contract Message Types
const REQUIRED_PARENT_MESSAGES = {
    SESSION_ACTIVE: 'SESSION_ACTIVE',
    SESSION_UPDATE: 'SESSION_UPDATE',
    ACK: 'ACK',
    PING: 'PING',
    NAVIGATE: 'NAVIGATE',
    PERMISSION_UPDATE: 'PERMISSION_UPDATE',
    FORCE_LOGOUT: 'FORCE_LOGOUT'
};

// Emitted States (Parent Contract)
const EMITTED_STATES = {
    REGISTERING: 'REGISTERING',
    REGISTERED: 'REGISTERED',
    SESSION_PENDING: 'SESSION_PENDING',
    SESSION_ACTIVE: 'SESSION_ACTIVE',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY'
};

// Timer tracking for cleanup
const activeTimers = new Set();
const activeIntervals = new Set();

function safeSetTimeout(fn, delay) {
    const timer = setTimeout(() => {
        activeTimers.delete(timer);
        fn();
    }, delay);
    activeTimers.add(timer);
    return timer;
}

function safeSetInterval(fn, interval) {
    const timer = setInterval(fn, interval);
    activeIntervals.add(timer);
    return timer;
}

function clearAllTimers() {
    activeTimers.forEach(timer => clearTimeout(timer));
    activeTimers.clear();
    activeIntervals.forEach(interval => clearInterval(interval));
    activeIntervals.clear();
}

// =============================================
// STATE TRANSITION - STRICT FSM
// =============================================
function transitionTo(newState, reason = '') {
    if (stateTransitionLock && newState !== SETTINGS_STATES.DEGRADED) {
        return false;
    }

    const oldState = currentState;
    
    // Define valid transitions - strict ordering
    const validTransitions = {
        [SETTINGS_STATES.INIT]: [SETTINGS_STATES.REGISTERING, SETTINGS_STATES.DEGRADED],
        [SETTINGS_STATES.REGISTERING]: [SETTINGS_STATES.REGISTERED, SETTINGS_STATES.DEGRADED],
        [SETTINGS_STATES.REGISTERED]: [SETTINGS_STATES.SESSION_RECEIVED, SETTINGS_STATES.DEGRADED],
        [SETTINGS_STATES.SESSION_RECEIVED]: [SETTINGS_STATES.ACTIVE, SETTINGS_STATES.DEGRADED],
        [SETTINGS_STATES.ACTIVE]: [SETTINGS_STATES.READY, SETTINGS_STATES.DEGRADED],
        [SETTINGS_STATES.READY]: [SETTINGS_STATES.DEGRADED],
        [SETTINGS_STATES.DEGRADED]: [SETTINGS_STATES.SESSION_RECEIVED]
    };

    if (!validTransitions[oldState] || !validTransitions[oldState].includes(newState)) {
        return false;
    }

    if (oldState === newState) {
        return false;
    }

    stateTransitionLock = true;
    currentState = newState;
    
    if (newState === SETTINGS_STATES.READY) {
        console.log(`[${MODULE_NAME}] ✅ State: ${oldState} → ${newState}`);
    } else if (newState === SETTINGS_STATES.DEGRADED) {
        console.warn(`[${MODULE_NAME}] ⚠️ State: ${oldState} → ${newState}`);
    } else if (DEBUG) {
        console.debug(`[${MODULE_NAME}] 🔄 State: ${oldState} → ${newState}`);
    }

    stateHistory.push({
        from: oldState,
        to: newState,
        reason,
        timestamp: Date.now()
    });

    if (stateHistory.length > 20) {
        stateHistory.shift();
    }

    window.__SETTINGS_STATE__ = currentState;
    window.__SETTINGS_SESSION_ACTIVE__ = (newState === SETTINGS_STATES.ACTIVE || newState === SETTINGS_STATES.READY);
    window.__SETTINGS_READY__ = (newState === SETTINGS_STATES.READY);

    stateTransitionLock = false;
    return true;
}

function stopAllRetryLoops() {
    clearAllTimers();
    
    if (sessionRequestTimeout) {
        clearTimeout(sessionRequestTimeout);
        sessionRequestTimeout = null;
    }
    if (parentAuthorityTimeout) {
        clearTimeout(parentAuthorityTimeout);
        parentAuthorityTimeout = null;
    }
}

function throttledLog(level, message, data = null) {
    if (!DEBUG && level !== 'error' && level !== 'success' && level !== 'init' && level !== 'receive') {
        return;
    }
    
    let throttleMs = THROTTLE_TIMES.default;
    for (const [key, time] of Object.entries(THROTTLE_TIMES)) {
        if (message.includes(key)) {
            throttleMs = time;
            break;
        }
    }
    
    const logKey = `${level}:${message}`;
    const lastLog = logThrottle.get(logKey);
    const now = Date.now();
    
    if (lastLog && now - lastLog < throttleMs) {
        return;
    }
    
    logThrottle.set(logKey, now);
    
    if (logThrottle.size > 50) {
        const oldest = Date.now() - 60000;
        for (const [k, ts] of logThrottle.entries()) {
            if (ts < oldest) {
                logThrottle.delete(k);
            }
        }
    }
    
    switch(level) {
        case 'error': 
            console.error(`[${MODULE_NAME}] ❌ ${message}`, data || '');
            break;
        case 'warn': 
            console.warn(`[${MODULE_NAME}] ⚠️ ${message}`, data || '');
            break;
        case 'success': 
            console.log(`[${MODULE_NAME}] ✅ ${message}`, data || '');
            break;
        case 'init': 
            console.log(`[${MODULE_NAME}] 🚀 ${message}`, data || '');
            break;
        case 'receive':
            console.log(`[${MODULE_NAME}] 📥 ${message}`, data || '');
            break;
        case 'send':
            if (DEBUG) console.log(`[${MODULE_NAME}] 📤 ${message}`, data || '');
            break;
        default:
            if (DEBUG) console.debug(`[${MODULE_NAME}] 🔍 ${message}`, data || '');
    }
}

function debugLog(...args) { throttledLog('debug', args[0], args.slice(1)); }
function errorLog(...args) { throttledLog('error', args[0], args.slice(1)); }
function successLog(...args) { throttledLog('success', args[0], args.slice(1)); }
function sendLog(...args) { throttledLog('send', args[0], args.slice(1)); }
function receiveLog(...args) { throttledLog('receive', args[0], args.slice(1)); }
function initLog(...args) { throttledLog('init', args[0], args.slice(1)); }

// =============================================
// MESSAGE DEDUPLICATION & VALIDATION
// =============================================
function isMessageDuplicate(messageId, type) {
    if (!messageId) return false;
    
    const key = `${type}:${messageId}`;
    if (processedMessages.has(key)) {
        const timestamp = processedMessages.get(key);
        if (Date.now() - timestamp < PROCESSED_MESSAGE_TTL) {
            return true;
        }
    }
    
    processedMessages.set(key, Date.now());
    
    if (processedMessages.size > 100) {
        const now = Date.now();
        for (const [k, ts] of processedMessages.entries()) {
            if (now - ts > PROCESSED_MESSAGE_TTL) {
                processedMessages.delete(k);
            }
        }
    }
    
    return false;
}

function validateMessage(message) {
    if (!message || typeof message !== 'object') return false;
    if (message.target && message.target !== FRAME_ID && message.target !== 'all') return false;
    if (message.module && message.module !== MODULE_NAME) return false;
    if (message.frameId && message.frameId !== FRAME_ID) return false;
    if (message.requestId && isMessageDuplicate(message.requestId, message.type)) return false;
    return true;
}

function canSendPing() {
    const now = Date.now();
    if (now - lastPingTime < PING_RATE_LIMIT) {
        return false;
    }
    lastPingTime = now;
    return true;
}

function clearSessionTimeouts() {
    if (sessionRequestTimeout) {
        clearTimeout(sessionRequestTimeout);
        sessionRequestTimeout = null;
    }
}

// =============================================
// UNIQUE ID GENERATOR
// =============================================
function generateUniqueId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}_${Math.random().toString(36).substring(2, 5)}`;
}

function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// =============================================
// API CORE GATEWAY - ROUTES THROUGH PARENT
// =============================================
export const ApiCore = {
    _ready: false,
    _readyPromise: null,
    _readyResolvers: [],
    _baseUrl: null,
    _timeout: 15000,
    _retryCount: 0,
    _retryDelay: 1000,
    _circuitBreaker: {
        failures: 0,
        lastFailure: 0,
        threshold: 5,
        timeout: 30000,
        isOpen: false
    },
    _pendingRequests: new Map(),
    _cache: new Map(),
    _cacheTimeout: 60000,
    
    init() {
        initLog('API Gateway initializing');
        this._readyPromise = new Promise((resolve) => {
            this._readyResolvers.push(resolve);
        });
        
        safeSetTimeout(() => {
            if (!this._ready) {
                this._ready = true;
                this._readyResolvers.forEach(r => r());
                this._readyResolvers = [];
                successLog('API Gateway ready (fallback)');
            }
        }, 2000);
        
        window.addEventListener('online', () => {
            this._circuitBreaker.isOpen = false;
            this._circuitBreaker.failures = 0;
            if (DEBUG) debugLog('API Gateway back online');
        });
        
        return this;
    },
    
    isReady() {
        return this._ready && (currentState === SETTINGS_STATES.READY || currentState === SETTINGS_STATES.ACTIVE);
    },
    
    whenReady() {
        return this._readyPromise || Promise.resolve();
    },
    
    setBaseUrl(url) {
        this._baseUrl = url;
    },
    
    _shouldAllowRequest() {
        if (currentState !== SETTINGS_STATES.READY && currentState !== SETTINGS_STATES.ACTIVE) {
            return false;
        }
        
        if (!this._circuitBreaker.isOpen) return true;
        
        if (Date.now() - this._circuitBreaker.lastFailure > this._circuitBreaker.timeout) {
            this._circuitBreaker.isOpen = false;
            this._circuitBreaker.failures = 0;
            return true;
        }
        return false;
    },
    
    _recordFailure() {
        this._circuitBreaker.failures++;
        this._circuitBreaker.lastFailure = Date.now();
        
        if (this._circuitBreaker.failures >= this._circuitBreaker.threshold) {
            this._circuitBreaker.isOpen = true;
            if (DEBUG) debugLog('Circuit breaker opened');
        }
    },
    
    _recordSuccess() {
        this._circuitBreaker.failures = Math.max(0, this._circuitBreaker.failures - 1);
    },
    
    _getCacheKey(endpoint, options) {
        const method = options.method || 'GET';
        const body = options.body ? JSON.stringify(options.body) : '';
        return `${method}:${endpoint}:${body}`;
    },
    
    _getFromCache(key) {
        const cached = this._cache.get(key);
        if (cached && Date.now() - cached.timestamp < this._cacheTimeout) {
            return cached.data;
        }
        this._cache.delete(key);
        return null;
    },
    
    _setCache(key, data) {
        this._cache.set(key, {
            data,
            timestamp: Date.now()
        });
        
        if (this._cache.size > 100) {
            const oldest = Array.from(this._cache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            this._cache.delete(oldest[0]);
        }
    },
    
    async request(endpoint, options = {}) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        if (!this._shouldAllowRequest()) {
            return {
                success: false,
                status: 'circuit_open',
                message: 'Service temporarily unavailable',
                data: null
            };
        }
        
        const method = options.method || 'GET';
        const useCache = options.cache !== false && method === 'GET';
        const cacheKey = useCache ? this._getCacheKey(endpoint, options) : null;
        
        if (useCache) {
            const cached = this._getFromCache(cacheKey);
            if (cached) {
                return {
                    success: true,
                    status: 'cached',
                    data: cached,
                    cached: true
                };
            }
        }
        
        const controller = new AbortController();
        const timeoutId = safeSetTimeout(() => controller.abort(), options.timeout || this._timeout);
        
        this._pendingRequests.set(requestId, { controller, endpoint });
        
        try {
            // Route through parent
            const response = await sendToParent({
                type: 'API_REQUEST',
                endpoint: endpoint,
                method: method,
                data: options.body,
                headers: options.headers,
                requestId: requestId,
                timestamp: Date.now()
            }, 0, true);
            
            clearTimeout(timeoutId);
            activeTimers.delete(timeoutId);
            this._pendingRequests.delete(requestId);
            
            if (response && response.payload) {
                const result = {
                    success: true,
                    status: response.status || 200,
                    data: response.payload,
                    headers: response.headers
                };
                
                if (useCache && method === 'GET') {
                    this._setCache(cacheKey, response.payload);
                }
                
                this._recordSuccess();
                return result;
            }
            
            this._recordFailure();
            
            return {
                success: false,
                status: response?.status || 'error',
                message: response?.message || 'Request failed',
                data: null
            };
            
        } catch (error) {
            clearTimeout(timeoutId);
            activeTimers.delete(timeoutId);
            this._pendingRequests.delete(requestId);
            
            this._recordFailure();
            
            if (error.name === 'AbortError') {
                return {
                    success: false,
                    status: 'timeout',
                    message: 'Request timeout',
                    data: null
                };
            }
            
            return {
                success: false,
                status: 'error',
                message: 'Network or server error',
                data: null
            };
        }
    },
    
    abortAll() {
        this._pendingRequests.forEach(({ controller }) => {
            try {
                controller.abort();
            } catch (e) {}
        });
        this._pendingRequests.clear();
    },
    
    clearCache() {
        this._cache.clear();
    },
    
    getDiagnostics() {
        return {
            ready: this._ready,
            circuitBreaker: { ...this._circuitBreaker },
            pendingRequests: this._pendingRequests.size,
            cacheSize: this._cache.size
        };
    }
}.init();

// =============================================
// SECURE API WRAPPER - ROUTES THROUGH PARENT
// =============================================
export async function secureApiCall(endpoint, options = {}) {
    try {
        const response = await sendToParent({
            type: 'API_REQUEST',
            endpoint: endpoint,
            method: options.method || 'GET',
            data: options.body,
            options: options,
            timestamp: Date.now()
        }, 0, true);
        
        if (response && response.payload) {
            return response.payload;
        }
        
        return { success: false, data: null };
        
    } catch (error) {
        return {
            success: false,
            status: 'error',
            message: 'Request failed',
            data: null
        };
    }
}

// =============================================
// SAFE DATA ACCESS UTILITIES
// =============================================
export function safeGet(data, path, defaultValue = null) {
    if (!data || typeof data !== 'object') return defaultValue;
    
    const parts = path.split('.');
    let current = data;
    
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return defaultValue;
        }
        current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
}

export function safeArray(array, defaultValue = []) {
    return Array.isArray(array) ? array : defaultValue;
}

export function safeObject(obj, defaultValue = {}) {
    return obj && typeof obj === 'object' ? obj : defaultValue;
}

// =============================================
// IFRAME ENVIRONMENT DETECTOR
// =============================================
export const ENV_TYPES = {
    LOCAL_DEV: 'local_dev',
    RENDER_HOSTED: 'render_hosted',
    VPN_NETWORK: 'vpn_network',
    PRODUCTION: 'production',
    UNKNOWN: 'unknown'
};

export const IframeEnvironment = {
    _environment: ENV_TYPES.UNKNOWN,
    _features: {
        hasSecureContext: false,
        hasCrypto: false,
        hasLocalStorage: false,
        hasServiceWorker: false,
        connectionType: 'unknown',
        effectiveBandwidth: 0,
        rtt: 0,
        isSandboxed: false,
        isIframe: false,
        parentOrigin: null,
        backendReachable: true
    },
    _detected: false,
    _backendUrl: 'https://moodchat-fy56.onrender.com',
    _frontendUrl: 'https://moodfronted.onrender.com',
    _detectionComplete: false,
    
    detect() {
        if (this._detected) return this.getInfo();
        
        try {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            const isSecure = protocol === 'https:';
            
            this._features.isIframe = window.self !== window.top;
            
            try {
                localStorage.setItem('_test', 'test');
                localStorage.removeItem('_test');
                this._features.hasLocalStorage = true;
            } catch (e) {
                this._features.hasLocalStorage = false;
                this._features.isSandboxed = true;
            }
            
            this._features.hasCrypto = !!(window.crypto && window.crypto.subtle);
            this._features.hasSecureContext = window.isSecureContext || false;
            
            if (navigator.connection) {
                this._features.connectionType = navigator.connection.effectiveType || 'unknown';
                this._features.effectiveBandwidth = navigator.connection.downlink || 0;
                this._features.rtt = navigator.connection.rtt || 0;
            } else {
                const connection = navigator.connection || 
                                  navigator.mozConnection || 
                                  navigator.webkitConnection;
                if (connection) {
                    this._features.connectionType = connection.effectiveType || 'unknown';
                    this._features.effectiveBandwidth = connection.downlink || 0;
                    this._features.rtt = connection.rtt || 0;
                }
            }
            
            if (hostname === 'localhost' || hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') || protocol === 'file:') {
                this._environment = ENV_TYPES.LOCAL_DEV;
                if (DEBUG) debugLog('Environment detected: LOCAL_DEV');
            } else if (hostname.includes('onrender.com')) {
                this._environment = ENV_TYPES.RENDER_HOSTED;
                if (DEBUG) debugLog('Environment detected: RENDER_HOSTED');
            } else if (this._features.rtt > 300 || 
                      (this._features.connectionType === '4g' && this._features.rtt > 200) ||
                      navigator.connection?.saveData) {
                this._environment = ENV_TYPES.VPN_NETWORK;
                if (DEBUG) debugLog('Environment detected: VPN_NETWORK');
            } else if (isSecure && hostname.includes('.')) {
                this._environment = ENV_TYPES.PRODUCTION;
                if (DEBUG) debugLog('Environment detected: PRODUCTION');
            } else {
                this._environment = ENV_TYPES.UNKNOWN;
                if (DEBUG) debugLog('Environment detected: UNKNOWN');
            }
            
            this._features.backendReachable = true;
            this._detected = true;
            this._detectionComplete = true;
            
        } catch (error) {
            this._environment = ENV_TYPES.UNKNOWN;
            this._detectionComplete = true;
            errorLog('Environment detection failed:', error);
        }
        
        return this.getInfo();
    },
    
    getInfo() {
        return {
            environment: this._environment,
            features: { ...this._features }
        };
    },
    
    getEnvironment() {
        return this._environment;
    },
    
    getBackendUrl() {
        return this._backendUrl;
    },
    
    getFrontendUrl() {
        return this._frontendUrl;
    },
    
    isVPN() {
        return this._environment === ENV_TYPES.VPN_NETWORK;
    },
    
    isLocal() {
        return this._environment === ENV_TYPES.LOCAL_DEV;
    },
    
    isProduction() {
        return this._environment === ENV_TYPES.PRODUCTION;
    },
    
    isRender() {
        return this._environment === ENV_TYPES.RENDER_HOSTED;
    },
    
    getAdjustedTimeout(baseTimeout) {
        if (this.isVPN()) return baseTimeout * 2;
        if (this.isLocal()) return baseTimeout * 1.5;
        return baseTimeout;
    },
    
    getAdjustedRetries(baseRetries) {
        return baseRetries;
    },
    
    isDetectionComplete() {
        return this._detectionComplete;
    }
};

IframeEnvironment.detect();

// =============================================
// SAFE STORAGE LAYER
// =============================================
export const SafeStorage = {
    _memoryCache: new Map(),
    _storageAvailable: null,
    _encryptionKey: null,
    _prefix: 'knecta_',
    _quotaExceeded: false,
    _quotaWarningIssued: false,
    _fallbackMode: false,
    _initialized: false,
    _initPromise: null,
    
    init() {
        if (this._initialized) return this;
        if (this._initPromise) return this._initPromise;
        
        this._initPromise = new Promise((resolve) => {
            initLog('SafeStorage initializing');
            this._checkAvailability();
            this._generateKey();
            
            try {
                const cached = sessionStorage.getItem(`${this._prefix}memory_fallback`);
                if (cached) {
                    const data = JSON.parse(cached);
                    Object.entries(data).forEach(([key, value]) => {
                        this._memoryCache.set(key, value);
                    });
                    if (DEBUG) debugLog('Loaded memory fallback cache');
                }
            } catch (e) {}
            
            this._initialized = true;
            successLog('SafeStorage initialized - Type:', this.getStorageType());
            resolve(this);
        });
        
        return this._initPromise;
    },
    
    _checkAvailability() {
        if (this._storageAvailable !== null) return this._storageAvailable;
        
        try {
            const testKey = `${this._prefix}_test`;
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this._storageAvailable = true;
            this._fallbackMode = false;
        } catch (e) {
            this._storageAvailable = false;
            this._fallbackMode = true;
            
            try {
                const testKey = `${this._prefix}_test`;
                sessionStorage.setItem(testKey, 'test');
                sessionStorage.removeItem(testKey);
                this._storageAvailable = 'session';
            } catch (e2) {
                this._storageAvailable = false;
            }
            
            if (!this._quotaWarningIssued) {
                this._quotaWarningIssued = true;
                if (DEBUG) debugLog('Storage unavailable, using memory fallback');
            }
        }
        
        return this._storageAvailable;
    },
    
    _generateKey() {
        this._encryptionKey = `key_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    },
    
    get(key, fallback = null, useEncryption = false) {
        const prefixedKey = `${this._prefix}${key}`;
        
        if (this._memoryCache.has(prefixedKey)) {
            return this._memoryCache.get(prefixedKey);
        }
        
        if (this._storageAvailable) {
            try {
                let value = null;
                
                if (this._storageAvailable === true) {
                    value = localStorage.getItem(prefixedKey);
                } else if (this._storageAvailable === 'session') {
                    value = sessionStorage.getItem(prefixedKey);
                }
                
                if (value) {
                    if (useEncryption) {
                        try {
                            value = this._decrypt(value);
                        } catch (e) {}
                    }
                    
                    this._memoryCache.set(prefixedKey, value);
                    return value;
                }
            } catch (e) {}
        }
        
        return fallback;
    },
    
    _decrypt(value) {
        return value;
    },
    
    set(key, value, useEncryption = false) {
        const prefixedKey = `${this._prefix}${key}`;
        
        this._memoryCache.set(prefixedKey, value);
        
        if (this._storageAvailable) {
            try {
                let storageValue = value;
                if (useEncryption) {
                    storageValue = this._encrypt(String(value));
                }
                
                if (this._storageAvailable === true) {
                    localStorage.setItem(prefixedKey, String(storageValue));
                } else if (this._storageAvailable === 'session') {
                    sessionStorage.setItem(prefixedKey, String(storageValue));
                }
                
                this._quotaExceeded = false;
                return true;
                
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    this._quotaExceeded = true;
                    if (!this._quotaWarningIssued) {
                        this._quotaWarningIssued = true;
                        if (DEBUG) debugLog('Storage quota exceeded');
                    }
                }
                return false;
            }
        }
        
        try {
            const cacheObj = {};
            this._memoryCache.forEach((val, k) => {
                cacheObj[k] = val;
            });
            sessionStorage.setItem(`${this._prefix}memory_fallback`, JSON.stringify(cacheObj));
        } catch (e) {}
        
        return true;
    },
    
    _encrypt(value) {
        return value;
    },
    
    remove(key) {
        const prefixedKey = `${this._prefix}${key}`;
        this._memoryCache.delete(prefixedKey);
        
        if (this._storageAvailable) {
            try {
                if (this._storageAvailable === true) {
                    localStorage.removeItem(prefixedKey);
                } else if (this._storageAvailable === 'session') {
                    sessionStorage.removeItem(prefixedKey);
                }
            } catch (e) {}
        }
    },
    
    getJSON(key, fallback = null, useEncryption = false) {
        const value = this.get(key, null, useEncryption);
        if (!value) return fallback;
        
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    },
    
    setJSON(key, value, useEncryption = false) {
        try {
            return this.set(key, JSON.stringify(value), useEncryption);
        } catch (e) {
            return false;
        }
    },
    
    clear(prefix = null) {
        const actualPrefix = prefix ? `${this._prefix}${prefix}` : this._prefix;
        
        if (prefix) {
            for (const key of this._memoryCache.keys()) {
                if (key.startsWith(actualPrefix)) {
                    this._memoryCache.delete(key);
                }
            }
        } else {
            this._memoryCache.clear();
        }
        
        if (this._storageAvailable) {
            try {
                const storage = this._storageAvailable === true ? localStorage : sessionStorage;
                for (let i = storage.length - 1; i >= 0; i--) {
                    const key = storage.key(i);
                    if (key && key.startsWith(actualPrefix)) {
                        storage.removeItem(key);
                    }
                }
            } catch (e) {}
        }
    },
    
    getAllKeys() {
        const keys = new Set();
        
        for (const key of this._memoryCache.keys()) {
            keys.add(key.substring(this._prefix.length));
        }
        
        if (this._storageAvailable) {
            try {
                const storage = this._storageAvailable === true ? localStorage : sessionStorage;
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (key && key.startsWith(this._prefix)) {
                        keys.add(key.substring(this._prefix.length));
                    }
                }
            } catch (e) {}
        }
        
        return Array.from(keys);
    },
    
    isQuotaExceeded() {
        return this._quotaExceeded;
    },
    
    isFallbackMode() {
        return this._fallbackMode;
    },
    
    getStorageType() {
        if (this._storageAvailable === true) return 'localStorage';
        if (this._storageAvailable === 'session') return 'sessionStorage';
        return 'memory';
    }
};

SafeStorage.init();

// =============================================
// COMPATIBILITY BRIDGE
// =============================================
export const CompatibilityBridge = {
    _enabled: false,
    _reason: null,
    _legacyAPIs: new Map(),
    _messageTranslator: null,
    _parentProtocolVersion: null,
    _detected: false,
    
    detect() {
        if (this._detected) return this._enabled;
        
        if (IframeEnvironment._features.isSandboxed) {
            this.enable('sandboxed');
            return true;
        }
        
        if (!SafeStorage.getStorageType().includes('local')) {
            this.enable('storage_restricted');
            return true;
        }
        
        if (!window.crypto || !window.crypto.subtle) {
            this.enable('crypto_restricted');
            return true;
        }
        
        const isOldBrowser = !window.Promise || !window.fetch || !window.postMessage;
        if (isOldBrowser) {
            this.enable('old_browser');
            return true;
        }
        
        this._detected = true;
        return this._enabled;
    },
    
    enable(reason) {
        if (this._enabled) return;
        
        this._enabled = true;
        this._reason = reason;
        if (DEBUG) debugLog('Compatibility mode enabled:', reason);
        
        this._setupLegacyAPIs();
        this._setupMessageTranslation();
        this._applyCompatibility();
    },
    
    _setupLegacyAPIs() {
        this._legacyAPIs.set('sendToParentLegacy', (type, payload) => {
            const legacyMsg = {
                type,
                ...payload,
                _legacy: true,
                timestamp: Date.now()
            };
            
            try {
                if (state.parentWindow) {
                    state.parentWindow.postMessage(legacyMsg, state.parentOrigin || '*');
                }
            } catch (e) {}
        });
        
        this._legacyAPIs.set('receiveFromParentLegacy', (handler) => {
            const wrapper = (event) => {
                if (event.data && event.data._legacy) {
                    handler(event);
                }
            };
            window.addEventListener('message', wrapper);
            return () => window.removeEventListener('message', wrapper);
        });
    },
    
    _setupMessageTranslation() {
        this._messageTranslator = {
            toLegacy(canonical) {
                return {
                    type: canonical.type || canonical.payload?.type,
                    ...canonical.payload,
                    _legacy: true,
                    _originalId: canonical.messageId
                };
            },
            
            toCanonical(legacy) {
                return {
                    protocol: PROTOCOL_CANONICAL,
                    type: legacy.type,
                    payload: { ...legacy },
                    messageId: `legacy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    timestamp: legacy.timestamp || Date.now(),
                    legacy: true
                };
            }
        };
    },
    
    _applyCompatibility() {
        OriginAdapter.addOriginPattern(/.*/);
    },
    
    isEnabled() {
        return this._enabled;
    },
    
    getReason() {
        return this._reason;
    },
    
    translateOutgoing(message) {
        if (!this._enabled) return message;
        return this._messageTranslator?.toLegacy(message) || message;
    },
    
    translateIncoming(message) {
        if (!this._enabled) return message;
        if (message && message._legacy) {
            return this._messageTranslator?.toCanonical(message) || message;
        }
        return message;
    },
    
    getLegacyAPI(name) {
        return this._legacyAPIs.get(name);
    }
};

// =============================================
// ORIGIN ADAPTER
// =============================================
export const OriginAdapter = {
    _trustedOrigins: new Set(),
    _originPatterns: [],
    _dynamicTrust: new Map(),
    _lastValidation: 0,
    _validationCache: new Map(),
    _parentOrigin: null,
    _parentVerified: false,
    _backendOrigin: 'https://moodchat-fy56.onrender.com',
    _frontendOrigin: 'https://moodfronted.onrender.com',
    
    init() {
        initLog('OriginAdapter initializing');
        this.addTrustedOrigin(window.location.origin);
        this.addTrustedOrigin(this._backendOrigin);
        this.addTrustedOrigin(this._frontendOrigin);
        
        ['localhost', '127.0.0.1', '::1'].forEach(host => {
            [5500, 3000, 8080, 5000, 5173].forEach(port => {
                this.addTrustedOrigin(`http://${host}:${port}`);
                this.addTrustedOrigin(`https://${host}:${port}`);
            });
            this.addTrustedOrigin(`http://${host}`);
            this.addTrustedOrigin(`https://${host}`);
        });
        
        this.addOriginPattern(/^https?:\/\/.*\.onrender\.com$/);
        this.addOriginPattern(/^https?:\/\/.*\.render\.com$/);
        this.addOriginPattern(/^https?:\/\/(192\.168\..*|10\..*|172\.(1[6-9]|2[0-9]|3[0-1])\..*)$/);
        this.addOriginPattern(/^https?:\/\/.*\.knecta\.(app|chat)$/);
        this.addOriginPattern(/^https?:\/\/knecta\..*$/);
        
        successLog('OriginAdapter initialized');
    },
    
    addTrustedOrigin(origin) {
        if (origin && !this._trustedOrigins.has(origin)) {
            this._trustedOrigins.add(origin);
        }
    },
    
    addOriginPattern(pattern) {
        if (pattern && !this._originPatterns.includes(pattern)) {
            this._originPatterns.push(pattern);
        }
    },
    
    isTrusted(origin, options = {}) {
        if (!origin) return false;
        
        const {
            bypassCache = false,
            allowNull = true,
            allowWildcard = true
        } = options;
        
        if (origin === 'null') return allowNull;
        if (origin === '*' && allowWildcard) return true;
        
        if (!bypassCache && this._validationCache.has(origin)) {
            const cached = this._validationCache.get(origin);
            if (Date.now() - cached.timestamp < 60000) {
                return cached.trusted;
            }
        }
        
        if (this._trustedOrigins.has(origin)) {
            this._cacheValidation(origin, true);
            return true;
        }
        
        for (const pattern of this._originPatterns) {
            if (pattern.test(origin)) {
                this._trustedOrigins.add(origin);
                this._cacheValidation(origin, true);
                return true;
            }
        }
        
        if (this._parentVerified && this._parentOrigin === origin) {
            this._cacheValidation(origin, true);
            return true;
        }
        
        if (IframeEnvironment.isLocal() && 
            (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            this._trustedOrigins.add(origin);
            this._cacheValidation(origin, true);
            return true;
        }
        
        if (IframeEnvironment._features.isSandboxed) {
            this._cacheValidation(origin, true);
            return true;
        }
        
        this._cacheValidation(origin, false);
        return false;
    },
    
    _cacheValidation(origin, trusted) {
        this._validationCache.set(origin, {
            trusted,
            timestamp: Date.now()
        });
        
        if (this._validationCache.size > 100) {
            const oldest = Array.from(this._validationCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            this._validationCache.delete(oldest[0]);
        }
    },
    
    setParentOrigin(origin) {
        this._parentOrigin = origin;
        this._parentVerified = true;
        this.addTrustedOrigin(origin);
        if (DEBUG) debugLog('Parent origin set:', origin);
    },
    
    getParentOrigin() {
        return this._parentOrigin;
    },
    
    isParentVerified() {
        return this._parentVerified;
    },
    
    reset() {
        this._parentOrigin = null;
        this._parentVerified = false;
        this._validationCache.clear();
    },
    
    getBackendOrigin() {
        return this._backendOrigin;
    },
    
    getFrontendOrigin() {
        return this._frontendOrigin;
    },
    
    getDiagnostics() {
        return {
            trustedOriginsCount: this._trustedOrigins.size,
            patternsCount: this._originPatterns.length,
            parentVerified: this._parentVerified,
            parentOrigin: this._parentOrigin,
            cacheSize: this._validationCache.size
        };
    }
};

OriginAdapter.init();

// =============================================
// STARTUP GOVERNOR - ENHANCED WITH LIFECYCLE AWARENESS
// =============================================
export const StartupGovernor = {
    _state: 'INIT',
    _lock: false,
    _attempts: 0,
    _maxAttempts: 1,
    _backoffMs: 1000,
    _initialized: false,
    _startTime: Date.now(),
    _stateHistory: [],
    _transitionListeners: new Set(),
    _recoveryTimer: null,
    _degradedTimer: null,
    _silent: true,
    _lifecycleAware: true,
    
    states: {
        INIT: 'INIT',
        WAIT_PARENT: 'WAIT_PARENT',
        HANDSHAKING: 'HANDSHAKING',
        SYNCING: 'SYNCING',
        ACTIVE: 'ACTIVE',
        DEGRADED: 'DEGRADED',
        RECOVERING: 'RECOVERING',
        FAILED: 'FAILED'
    },
    
    getState() { 
        return this._state; 
    },
    
    transition(newState, reason = '') {
        if (currentState === SETTINGS_STATES.READY || currentState === SETTINGS_STATES.DEGRADED) {
            return false;
        }
        
        if (this._lock && newState !== this._state && newState !== 'FAILED') {
            return false;
        }
        
        const oldState = this._state;
        this._state = newState;
        
        if (!this._silent) {
            debugLog(`Governor: ${oldState} → ${newState} (${reason})`);
        }
        
        this._stateHistory.push({
            from: oldState,
            to: newState,
            reason,
            timestamp: Date.now()
        });
        
        if (this._stateHistory.length > 20) {
            this._stateHistory.shift();
        }
        
        this._transitionListeners.forEach(listener => {
            try {
                listener(oldState, newState, reason);
            } catch (e) {}
        });
        
        return true;
    },
    
    onTransition(listener) {
        this._transitionListeners.add(listener);
        return () => this._transitionListeners.delete(listener);
    },
    
    async execute(operation, options = {}) {
        const {
            timeout = 10000,
            retryCount = 0,
            backoff = false,
            name = 'operation'
        } = options;
        
        if (this._lock && this._state !== this.states.FAILED) {
            return { success: false, error: 'locked' };
        }
        
        this._lock = true;
        this._attempts++;
        
        try {
            for (let attempt = 1; attempt <= retryCount; attempt++) {
                try {
                    const result = await Promise.race([
                        operation(),
                        new Promise((_, reject) => 
                            safeSetTimeout(() => reject(new Error(`${name} timeout`)), timeout)
                        )
                    ]);
                    
                    this._lock = false;
                    return { success: true, result };
                    
                } catch (error) {
                    if (attempt === retryCount) {
                        this._lock = false;
                        return { success: false, error: error.message };
                    }
                    
                    if (backoff) {
                        const delay = this._backoffMs * Math.pow(1.5, attempt - 1);
                        await new Promise(resolve => safeSetTimeout(resolve, delay));
                    }
                }
            }
        } finally {
            this._lock = false;
        }
    },
    
    canProceed() {
        return this._state !== this.states.FAILED && 
               this._state !== this.states.RECOVERING;
    },
    
    isStable() {
        return this._state === this.states.ACTIVE;
    },
    
    isDegraded() {
        return this._state === this.states.DEGRADED;
    },
    
    getDiagnostics() {
        return {
            state: this._state,
            attempts: this._attempts,
            uptime: Date.now() - this._startTime,
            history: this._stateHistory.slice(-5),
            locked: this._lock
        };
    },
    
    reset() {
        this._state = 'INIT';
        this._lock = false;
        this._attempts = 0;
        this._stateHistory = [];
        if (this._recoveryTimer) {
            clearTimeout(this._recoveryTimer);
            activeTimers.delete(this._recoveryTimer);
        }
        if (this._degradedTimer) {
            clearTimeout(this._degradedTimer);
            activeTimers.delete(this._degradedTimer);
        }
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// RETRY DEBOUNCER - DISABLED UNDER PARENT AUTHORITY
// =============================================
const retryDebouncers = new Map();

function debounceRetry(type, callback, delay = 1000) {
    // DISABLED - parent handles retries
    return;
}

// =============================================
// IFRAME TRANSPORT - STRICT PARENT COMMUNICATION
// =============================================
export const IframeTransport = {
    _messageId: 0,
    _pendingAcks: new Map(),
    _messageHandlers: new Map(),
    _retryQueue: new Map(),
    _offlineBuffer: [],
    _sequence: 0,
    _frameId: FRAME_ID,
    _protocolVersion: PROTOCOL_VERSION,
    _maxRetries: 0,
    _baseTimeout: 5000,
    _circuitBreakers: new Map(),
    _enabled: true,
    _silent: true,
    _parentWindow: null,
    _parentOrigin: '*',
    _handshakeTimer: null,
    _handshakeComplete: false,
    
    init() {
        initLog('IframeTransport initializing');
        this._detectParent();
        this._setupMessageListener();
        successLog('IframeTransport initialized');
    },
    
    _detectParent() {
        try {
            if (window.parent && window.parent !== window) {
                this._parentWindow = window.parent;
                
                try {
                    if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
                        this._parentOrigin = window.location.ancestorOrigins[0];
                    } else {
                        this._parentOrigin = document.referrer ? new URL(document.referrer).origin : '*';
                    }
                } catch (e) {
                    this._parentOrigin = '*';
                }
                
                OriginAdapter.setParentOrigin(this._parentOrigin);
                parentOrigin = this._parentOrigin;
            }
        } catch (error) {}
    },
    
    _setupMessageListener() {
        window.addEventListener('message', (event) => {
            this._handleIncoming(event);
        });
    },
    
    _handleIncoming(event) {
        try {
            if (!OriginAdapter.isTrusted(event.origin)) return;
            
            let message = event.data;
            
            if (CompatibilityBridge.isEnabled()) {
                message = CompatibilityBridge.translateIncoming(message);
            }
            
            if (!message || typeof message !== 'object') return;
            
            if (!validateMessage(message)) return;
            
            if (isMessageDuplicate(message.requestId || message.messageId, message.type)) {
                return;
            }
            
            if (message.type === REQUIRED_PARENT_MESSAGES.SESSION_ACTIVE) {
                handleAuthoritativeSession(message);
            } else if (message.type === REQUIRED_PARENT_MESSAGES.SESSION_UPDATE) {
                handleAuthoritativeSessionUpdate(message);
            } else if (message.type === REQUIRED_PARENT_MESSAGES.ACK) {
                this.handleAck(message);
            } else if (message.type === REQUIRED_PARENT_MESSAGES.PING) {
                this.send('PONG', { inResponseTo: message.messageId }, { expectAck: false }).catch(() => {});
            } else if (message.type === REQUIRED_PARENT_MESSAGES.NAVIGATE) {
                handleParentNavigation(message);
            } else if (message.type === REQUIRED_PARENT_MESSAGES.PERMISSION_UPDATE) {
                handlePermissionUpdate(message);
            } else if (message.type === REQUIRED_PARENT_MESSAGES.FORCE_LOGOUT) {
                handleParentForceLogout();
            }
            
            if (message.type === 'ACK' && message.inResponseTo) {
                const pending = this._pendingAcks.get(message.inResponseTo);
                if (pending) {
                    clearTimeout(pending.timer);
                    activeTimers.delete(pending.timer);
                    pending.resolve(message);
                    this._pendingAcks.delete(message.inResponseTo);
                    
                    const breaker = this._getCircuitBreaker(pending.type);
                    if (breaker) breaker.recordSuccess();
                }
                return;
            }
            
            if (message.type === 'PONG') {
                receiveLog('PONG received');
                const pending = this._pendingAcks.get(message.pingId);
                if (pending) {
                    clearTimeout(pending.timer);
                    activeTimers.delete(pending.timer);
                    pending.resolve(message);
                    this._pendingAcks.delete(message.pingId);
                }
                return;
            }
            
            if (message.type === 'MODULE_REGISTERED') {
                handleModuleRegistered(message);
                return;
            }
            
            if (message.type === 'SESSION_ACTIVE') {
                handleSessionActive(message);
                return;
            }
            
            if (message.type === 'SESSION_NULL') {
                handleSessionNull();
                return;
            }
            
            if (message.type === 'SESSION_REFRESHED') {
                handleSessionRefreshed(message);
                return;
            }
            
            if (message.type === 'SESSION_INVALIDATED') {
                handleSessionInvalidated();
                return;
            }
            
            if (message.type === 'PARENT_READY') {
                handleParentReady(message);
                return;
            }
            
            if (message.type === 'SETTINGS_UPDATED') {
                handleSettingsUpdatedBroadcast(message);
                return;
            }
            
            if (message.type === 'SESSION_VERIFIED') {
                if (DEBUG) debugLog('Session verified by parent');
                return;
            }
            
            const handlers = this._messageHandlers.get(message.type) || [];
            handlers.forEach(handler => {
                try {
                    handler(message, event);
                } catch (e) {}
            });
            
        } catch (error) {}
    },
    
    handleAck(message) {
        const pending = this._pendingAcks.get(message.inResponseTo || message.messageId);
        if (pending) {
            clearTimeout(pending.timer);
            activeTimers.delete(pending.timer);
            pending.resolve(message);
            this._pendingAcks.delete(message.inResponseTo || message.messageId);
            
            const breaker = this._getCircuitBreaker(pending.type);
            if (breaker) breaker.recordSuccess();
        }
    },
    
    _getCircuitBreaker(type) {
        if (!this._circuitBreakers.has(type)) {
            this._circuitBreakers.set(type, {
                failures: 0,
                lastFailure: null,
                isOpen: false,
                openTime: null,
                threshold: 5,
                timeout: 30000,
                
                recordFailure() {
                    this.failures++;
                    this.lastFailure = Date.now();
                    
                    if (this.failures >= this.threshold && !this.isOpen) {
                        this.isOpen = true;
                        this.openTime = Date.now();
                    }
                },
                
                recordSuccess() {
                    if (this.isOpen) {
                        this.isOpen = false;
                        this.failures = 0;
                        this.openTime = null;
                    } else {
                        this.failures = Math.max(0, this.failures - 1);
                    }
                },
                
                allow() {
                    if (this.isOpen && this.openTime) {
                        if (Date.now() - this.openTime > this.timeout) {
                            this.isOpen = false;
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
            });
        }
        
        return this._circuitBreakers.get(type);
    },
    
    send(type, payload = {}, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                if (currentState === SETTINGS_STATES.DEGRADED && type !== 'HEARTBEAT' && type !== 'PING') {
                    resolve({ success: false, reason: 'degraded_state' });
                    return;
                }
                
                if (type === 'PING' && !canSendPing()) {
                    resolve({ success: false, reason: 'rate_limited' });
                    return;
                }
                
                const {
                    timeout = this._baseTimeout,
                    retryCount = 0,
                    maxRetries = this._maxRetries,
                    expectAck = true,
                    targetOrigin = '*',
                    requestId = generateRequestId()
                } = options;
                
                const breaker = this._getCircuitBreaker(type);
                if (breaker && !breaker.allow()) {
                    reject(new Error(`Circuit breaker open for ${type}`));
                    return;
                }
                
                const timestamp = Date.now();
                
                const message = {
                    protocol: PROTOCOL_CANONICAL,
                    type: type,
                    module: MODULE_NAME,
                    frameId: this._frameId,
                    requestId: requestId,
                    timestamp: timestamp,
                    payload: payload || {},
                    sequence: this._sequence++,
                    version: MODULE_VERSION,
                    expectAck: expectAck,
                    retryCount: retryCount,
                    environment: IframeEnvironment.getEnvironment()
                };
                
                const finalMessage = CompatibilityBridge.isEnabled() ? 
                    CompatibilityBridge.translateOutgoing(message) : message;
                
                if (!this._parentWindow || this._parentWindow === window) {
                    this._detectParent();
                }
                
                const parentWin = this._parentWindow || window.parent;
                const origin = this._parentOrigin || targetOrigin;
                
                if (!parentWin || parentWin === window) {
                    if (retryCount < maxRetries) {
                        this._offlineBuffer.push({
                            type,
                            payload,
                            options,
                            timestamp: Date.now()
                        });
                        
                        safeSetTimeout(() => {
                            this.send(type, payload, options).then(resolve).catch(reject);
                        }, 1000 * (retryCount + 1));
                        return;
                    } else {
                        reject(new Error('Parent window not available'));
                        return;
                    }
                }
                
                if (!this._silent) sendLog(`${type} - RequestId: ${requestId}`);
                try {
                    parentWin.postMessage(finalMessage, origin);
                } catch (e) {
                    parentWin.postMessage(finalMessage, '*');
                }
                
                if (expectAck) {
                    const timer = safeSetTimeout(() => {
                        if (this._pendingAcks.has(requestId)) {
                            this._pendingAcks.delete(requestId);
                            
                            if (breaker) breaker.recordFailure();
                            
                            reject(new Error(`ACK timeout for ${requestId}`));
                        }
                    }, timeout);
                    
                    this._pendingAcks.set(requestId, {
                        requestId,
                        timer,
                        resolve,
                        reject,
                        type,
                        timestamp
                    });
                } else {
                    resolve({ requestId, acknowledged: false });
                }
                
            } catch (error) {
                reject(error);
            }
        });
    },
    
    on(type, handler) {
        if (!this._messageHandlers.has(type)) {
            this._messageHandlers.set(type, []);
        }
        this._messageHandlers.get(type).push(handler);
        
        return () => {
            const handlers = this._messageHandlers.get(type);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index !== -1) handlers.splice(index, 1);
            }
        };
    },
    
    off(type, handler) {
        const handlers = this._messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
    },
    
    ack(messageId, response = {}) {
        const parentWin = state.parentWindow || window.parent;
        const origin = state.parentOrigin || '*';
        
        if (parentWin && parentWin !== window) {
            parentWin.postMessage({
                type: 'ACK',
                inResponseTo: messageId,
                ...response,
                timestamp: Date.now()
            }, origin);
        }
    },
    
    flushOffline() {
        if (this._offlineBuffer.length === 0) return;
        
        const buffer = [...this._offlineBuffer];
        this._offlineBuffer = [];
        
        buffer.forEach(item => {
            this.send(item.type, item.payload, item.options).catch(() => {
                this._offlineBuffer.push(item);
            });
        });
    },
    
    ping() {
        return this.send('PING', {}, { expectAck: true, timeout: 3000 }).catch(() => {
            return { success: false, error: 'ping_failed' };
        });
    },
    
    enable() {
        this._enabled = true;
        this.flushOffline();
    },
    
    disable() {
        this._enabled = false;
    },
    
    startHandshakeTimer(timeout = 150) {
        if (this._handshakeTimer) {
            clearTimeout(this._handshakeTimer);
            activeTimers.delete(this._handshakeTimer);
        }
        
        this._handshakeTimer = safeSetTimeout(() => {
            if (!this._handshakeComplete) {
                transitionTo(SETTINGS_STATES.DEGRADED, 'handshake_timeout');
            }
        }, timeout);
        activeTimers.add(this._handshakeTimer);
    },
    
    completeHandshake() {
        this._handshakeComplete = true;
        if (this._handshakeTimer) {
            clearTimeout(this._handshakeTimer);
            activeTimers.delete(this._handshakeTimer);
        }
    },
    
    getDiagnostics() {
        return {
            pendingAcks: this._pendingAcks.size,
            retryQueue: this._retryQueue.size,
            offlineBuffer: this._offlineBuffer.length,
            sequence: this._sequence,
            enabled: this._enabled,
            circuitBreakers: Array.from(this._circuitBreakers.entries()).map(([type, cb]) => ({
                type,
                isOpen: cb.isOpen,
                failures: cb.failures
            }))
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

IframeTransport.init();

// =============================================
// HANDSHAKE AUTHORITY - SINGLE ATTEMPT ONLY
// =============================================
export const IframeHandshakeAuthority = {
    _handshakeId: null,
    _handshakeComplete: false,
    _handshakeAttempts: 0,
    _maxAttempts: 1,
    _backoffMs: 500,
    _parentReady: false,
    _handshakeAcked: false,
    _listeners: new Set(),
    _timeoutId: null,
    _retryTimer: null,
    _inProgress: false,
    _completedState: null,
    _silent: true,
    
    async startHandshake(options = {}) {
        const {
            timeout = 5000,
            force = false
        } = options;
        
        if (currentState === SETTINGS_STATES.READY || currentState === SETTINGS_STATES.DEGRADED) {
            return { success: false, error: 'lifecycle_terminal' };
        }
        
        if (this._handshakeComplete && !force) {
            return { success: true, cached: true };
        }
        
        if (this._inProgress && !force) {
            return { success: false, error: 'in_progress' };
        }
        
        this._inProgress = true;
        this._handshakeId = `hs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this._handshakeAttempts = 0;
        
        return new Promise((resolve) => {
            const performHandshake = async () => {
                if (currentState === SETTINGS_STATES.READY || currentState === SETTINGS_STATES.DEGRADED) {
                    this._inProgress = false;
                    resolve({ success: false, error: 'lifecycle_terminal' });
                    return;
                }
                
                this._handshakeAttempts++;
                
                try {
                    const handshakePayload = {
                        type: 'HANDSHAKE',
                        childId: FRAME_ID,
                        handshakeId: this._handshakeId,
                        timestamp: Date.now(),
                        protocolVersion: PROTOCOL_VERSION,
                        canonical: true,
                        environment: IframeEnvironment.getEnvironment(),
                        capabilities: {
                            sessionMirror: true,
                            heartbeat: true,
                            ping: true,
                            sessionAck: true,
                            originBind: true
                        }
                    };
                    
                    sendLog('HANDSHAKE request');
                    const response = await IframeTransport.send(
                        'HANDSHAKE', 
                        handshakePayload, 
                        { expectAck: true, timeout: timeout }
                    );
                    
                    if (response && response.acknowledged) {
                        this._handshakeAcked = true;
                        this._handshakeComplete = true;
                        this._completedState = response;
                        this._inProgress = false;
                        
                        transitionTo(SETTINGS_STATES.SESSION_RECEIVED, 'handshake_complete');
                        successLog('Handshake complete');
                        
                        this.emit('handshake_success', response);
                        resolve({ success: true, response });
                    } else {
                        throw new Error('No acknowledgment');
                    }
                    
                } catch (error) {
                    this._inProgress = false;
                    transitionTo(SETTINGS_STATES.DEGRADED, 'handshake_failed');
                    if (!this._silent) errorLog('Handshake failed:', error);
                    resolve({ success: false, error: error.message });
                }
            };
            
            safeSetTimeout(performHandshake, 100);
        });
    },
    
    onParentReady() {
        this._parentReady = true;
        this.emit('parent_ready');
        if (!this._silent) debugLog('Parent ready received');
    },
    
    once(event, listener) {
        const wrapper = (data) => {
            listener(data);
            this._listeners.delete(wrapper);
        };
        this._listeners.add(wrapper);
    },
    
    on(event, listener) {
        this._listeners.add(listener);
    },
    
    emit(event, data) {
        this._listeners.forEach(listener => {
            try {
                listener(data);
            } catch (e) {}
        });
    },
    
    reset() {
        this._handshakeComplete = false;
        this._handshakeAttempts = 0;
        this._parentReady = false;
        this._handshakeAcked = false;
        this._inProgress = false;
        this._completedState = null;
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            activeTimers.delete(this._timeoutId);
        }
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            activeTimers.delete(this._retryTimer);
        }
    },
    
    isComplete() {
        return this._handshakeComplete;
    },
    
    isInProgress() {
        return this._inProgress;
    },
    
    getStatus() {
        return {
            complete: this._handshakeComplete,
            attempts: this._handshakeAttempts,
            parentReady: this._parentReady,
            acked: this._handshakeAcked,
            handshakeId: this._handshakeId,
            inProgress: this._inProgress
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// PARENT AUTHORITY FUNCTIONS
// =============================================

function waitForParentAuthority(timeout = PARENT_AUTHORITY_TIMEOUT) {
    return new Promise((resolve) => {
        if (parentReadyDetected || window.__PARENT_READY__ === true) {
            parentReadyDetected = true;
            resolve(true);
            return;
        }
        
        const checkParentReady = () => {
            if (window.__PARENT_READY__ === true) {
                parentReadyDetected = true;
                clearTimeout(parentAuthorityTimeout);
                activeTimers.delete(parentAuthorityTimeout);
                window.removeEventListener('message', parentMessageHandler);
                resolve(true);
            }
        };
        
        const parentMessageHandler = (event) => {
            if (event.data && event.data.type === 'PARENT_READY') {
                parentReadyDetected = true;
                clearTimeout(parentAuthorityTimeout);
                activeTimers.delete(parentAuthorityTimeout);
                window.removeEventListener('message', parentMessageHandler);
                resolve(true);
            }
        };
        
        window.addEventListener('message', parentMessageHandler);
        
        parentAuthorityTimeout = safeSetTimeout(() => {
            window.removeEventListener('message', parentMessageHandler);
            resolve(false);
        }, timeout);
        activeTimers.add(parentAuthorityTimeout);
    });
}

function sendModuleRegistration() {
    if (moduleRegistered) return;
    
    parentAuthorityState = EMITTED_STATES.REGISTERING;
    window.__MODULE_STATE__ = parentAuthorityState;
    
    IframeTransport.send('REGISTER_MODULE', {
        module: MODULE_NAME,
        frameId: FRAME_ID,
        version: MODULE_VERSION,
        capabilities: ['settings', 'storage'],
        timestamp: Date.now()
    }, { expectAck: true, maxRetries: 0 }).then(() => {
        moduleRegistered = true;
        parentAuthorityState = EMITTED_STATES.REGISTERED;
        window.__MODULE_STATE__ = parentAuthorityState;
        if (DEBUG) successLog('Module registered with parent');
    }).catch(() => {});
}

function handleAuthoritativeSession(message) {
    if (!message.session) return;
    
    parentAuthoritativeSession = message.session;
    parentSessionReceived = true;
    parentContractEnforced = true;
    
    parentAuthorityState = EMITTED_STATES.SESSION_ACTIVE;
    window.__MODULE_STATE__ = parentAuthorityState;
    window.__SETTINGS_SESSION_ACTIVE__ = true;
    
    updateSession(
        message.session.user,
        message.session.expiry || message.session.expiresAt,
        message.session.version || 1
    );
    
    successLog('Authoritative session received from parent');
}

function handleAuthoritativeSessionUpdate(message) {
    if (!message.session) return;
    
    parentAuthoritativeSession = message.session;
    
    updateSession(
        message.session.user,
        message.session.expiry || message.session.expiresAt,
        message.session.version || (session.version + 1)
    );
    
    if (DEBUG) debugLog('Session updated from parent');
}

function handleParentNavigation(message) {
    const event = new CustomEvent('parentNavigation', {
        detail: {
            path: message.path,
            params: message.params
        }
    });
    window.dispatchEvent(event);
}

function handlePermissionUpdate(message) {
    const event = new CustomEvent('permissionUpdate', {
        detail: {
            permissions: message.permissions
        }
    });
    window.dispatchEvent(event);
}

function handleParentForceLogout() {
    resetUIForLogout();
    const event = new CustomEvent('parentForceLogout');
    window.dispatchEvent(event);
}

function proceedToInitialization() {
    if (parentAuthorityState === EMITTED_STATES.INITIALIZING) return;
    
    parentAuthorityState = EMITTED_STATES.INITIALIZING;
    window.__MODULE_STATE__ = parentAuthorityState;
    
    completeInitialization();
}

function completeInitialization() {
    if (readyEmitted) return;
    
    parentAuthorityState = EMITTED_STATES.READY;
    window.__MODULE_STATE__ = parentAuthorityState;
    window.__SETTINGS_READY__ = true;
    readyEmitted = true;
    
    transitionTo(SETTINGS_STATES.READY, 'parent_authority_ready');
    successLog('Module READY - Parent authority established');
}

async function executeParentAuthorityBoot() {
    if (initializationLock) return false;
    initializationLock = true;
    
    try {
        parentAuthorityState = PARENT_AUTHORITY_STATES.PREINIT;
        window.__MODULE_STATE__ = parentAuthorityState;
        
        parentAuthorityState = PARENT_AUTHORITY_STATES.WAIT_PARENT;
        window.__MODULE_STATE__ = parentAuthorityState;
        
        const parentAvailable = await waitForParentAuthority();
        
        if (!parentAvailable) {
            initializationLock = false;
            return false;
        }
        
        parentAuthorityState = PARENT_AUTHORITY_STATES.REGISTERING;
        window.__MODULE_STATE__ = parentAuthorityState;
        sendModuleRegistration();
        
        parentAuthorityState = PARENT_AUTHORITY_STATES.WAIT_SESSION;
        window.__MODULE_STATE__ = parentAuthorityState;
        
        const sessionReceived = await new Promise((resolve) => {
            const sessionTimeout = safeSetTimeout(() => {
                resolve(false);
            }, PARENT_AUTHORITY_TIMEOUT);
            activeTimers.add(sessionTimeout);
            
            const checkSession = () => {
                if (parentAuthoritativeSession || parentSessionReceived) {
                    clearTimeout(sessionTimeout);
                    activeTimers.delete(sessionTimeout);
                    resolve(true);
                }
            };
            
            const interval = safeSetInterval(checkSession, 100);
            activeIntervals.add(interval);
            
            const sessionHandler = (message) => {
                if (message.type === 'SESSION_ACTIVE' && message.session) {
                    clearTimeout(sessionTimeout);
                    activeTimers.delete(sessionTimeout);
                    clearInterval(interval);
                    activeIntervals.delete(interval);
                    resolve(true);
                }
            };
            
            window.addEventListener('message', sessionHandler);
            
            safeSetTimeout(() => {
                clearInterval(interval);
                activeIntervals.delete(interval);
                window.removeEventListener('message', sessionHandler);
            }, PARENT_AUTHORITY_TIMEOUT + 100);
        });
        
        if (sessionReceived) {
            parentAuthorityState = EMITTED_STATES.SESSION_ACTIVE;
            window.__MODULE_STATE__ = parentAuthorityState;
            window.__SETTINGS_SESSION_ACTIVE__ = true;
            transitionTo(SETTINGS_STATES.SESSION_RECEIVED, 'parent_session');
        }
        
        parentAuthorityState = EMITTED_STATES.INITIALIZING;
        window.__MODULE_STATE__ = parentAuthorityState;
        
        parentAuthorityState = EMITTED_STATES.READY;
        window.__MODULE_STATE__ = parentAuthorityState;
        window.__SETTINGS_READY__ = true;
        readyEmitted = true;
        
        transitionTo(SETTINGS_STATES.READY, 'parent_authority_boot');
        successLog('Parent authority boot sequence complete');
        return true;
        
    } catch (error) {
        errorLog('Parent authority boot error:', error);
        initializationLock = false;
        return false;
    }
}

// =============================================
// SESSION STORAGE - MEMORY ONLY, NO TOKEN MANAGEMENT
// =============================================
let session = {
    user: null,
    expiresAt: 0,
    version: 0
};

function updateSession(user, expiry, version) {
    if (user) {
        session.user = typeof user === 'object' ? { ...user } : user;
        currentUser = session.user;
        coreData.user = session.user;
    }
    
    if (expiry) {
        session.expiresAt = expiry;
    }
    
    if (version !== undefined) {
        session.version = version;
    }
    
    window.__SETTINGS_SESSION_ACTIVE__ = !!session.user;
}

function clearSession() {
    session = {
        user: null,
        expiresAt: 0,
        version: 0
    };
    currentUser = null;
    coreData.user = null;
    window.__SETTINGS_SESSION_ACTIVE__ = false;
}

function isSessionValid() {
    return !!session.user && session.expiresAt > Date.now();
}

// =============================================
// HEARTBEAT MANAGER - PARENT CONTROLLED
// =============================================
export const HeartbeatManager = {
    _interval: null,
    _missedCount: 0,
    _maxMissed: 3,
    _running: false,
    _lastAck: 0,
    _listeners: new Set(),
    
    start() {
        if (this._running) return;
        if (currentState !== SETTINGS_STATES.ACTIVE && currentState !== SETTINGS_STATES.READY) return;
        
        this._running = true;
        this._missedCount = 0;
        this._lastAck = Date.now();
        
        this._interval = safeSetInterval(() => {
            this._sendHeartbeat();
        }, 30000);
        
        activeIntervals.add(this._interval);
        if (DEBUG) debugLog('Heartbeat started');
    },
    
    stop() {
        if (this._interval) {
            clearInterval(this._interval);
            activeIntervals.delete(this._interval);
            this._interval = null;
        }
        this._running = false;
        this._missedCount = 0;
        if (DEBUG) debugLog('Heartbeat stopped');
    },
    
    _sendHeartbeat() {
        if (currentState === SETTINGS_STATES.DEGRADED) {
            this.stop();
            return;
        }
        
        IframeTransport.send('HEARTBEAT', {
            state: currentState,
            timestamp: Date.now()
        }, { expectAck: true, timeout: 5000 }).then(() => {
            this._missedCount = 0;
            this._lastAck = Date.now();
            this.emit('heartbeat', { success: true });
        }).catch(() => {
            this._missedCount++;
            this.emit('heartbeat', { success: false, missed: this._missedCount });
            
            if (this._missedCount >= this._maxMissed) {
                if (DEBUG) console.warn(`[${MODULE_NAME}] Missed ${this._missedCount} heartbeats`);
            }
        });
    },
    
    handleAck() {
        this._missedCount = 0;
        this._lastAck = Date.now();
    },
    
    isHealthy() {
        return this._missedCount < this._maxMissed;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        return {
            running: this._running,
            missedCount: this._missedCount,
            maxMissed: this._maxMissed,
            lastAck: this._lastAck,
            healthy: this.isHealthy()
        };
    },
    
    setSilent(silent) {
        // No-op for compatibility
    }
};

// =============================================
// NAVIGATION GUARD
// =============================================
export const NavigationGuard = {
    _enabled: true,
    _pendingNavigation: null,
    _listeners: new Set(),
    _guardedPaths: ['/settings', '/profile', '/account'],
    _silent: true,
    
    init() {
        initLog('NavigationGuard initializing');
        this._setupBeforeUnload();
        this._setupHistoryAPI();
        successLog('NavigationGuard initialized');
    },
    
    _setupBeforeUnload() {
        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges && this._enabled) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    },
    
    _setupHistoryAPI() {
        const originalPushState = history.pushState;
        history.pushState = (...args) => {
            if (this._shouldAllowNavigation(args[2])) {
                originalPushState.apply(history, args);
            }
        };
        
        const originalReplaceState = history.replaceState;
        history.replaceState = (...args) => {
            if (this._shouldAllowNavigation(args[2])) {
                originalReplaceState.apply(history, args);
            }
        };
        
        window.addEventListener('popstate', (e) => {
            if (!this._shouldAllowNavigation(document.location.pathname)) {
                history.pushState(null, '', this._pendingNavigation || document.location.pathname);
                e.preventDefault();
            }
        });
    },
    
    _shouldAllowNavigation(path) {
        if (!this._enabled) return true;
        
        const isGuarded = this._guardedPaths.some(p => path?.includes(p));
        
        if (isGuarded && unsavedChanges) {
            this._promptUser(path);
            return false;
        }
        
        return true;
    },
    
    _promptUser(targetPath) {
        const confirmed = confirm('You have unsaved changes. Are you sure you want to leave?');
        if (confirmed) {
            unsavedChanges = false;
            this._pendingNavigation = targetPath;
            window.location.href = targetPath;
        }
    },
    
    guardPath(path) {
        if (!this._guardedPaths.includes(path)) {
            this._guardedPaths.push(path);
        }
    },
    
    unguardPath(path) {
        const index = this._guardedPaths.indexOf(path);
        if (index !== -1) {
            this._guardedPaths.splice(index, 1);
        }
    },
    
    enable() {
        this._enabled = true;
    },
    
    disable() {
        this._enabled = false;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        return {
            enabled: this._enabled,
            guardedPaths: [...this._guardedPaths],
            pendingNavigation: this._pendingNavigation
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// UI FAILSAFE
// =============================================
export const UIFailsafe = {
    _enabled: true,
    _errorCount: 0,
    _maxErrors: 5,
    _recoveryTimer: null,
    _listeners: new Set(),
    _fallbackMode: false,
    _disabledElements: new Set(),
    _silent: true,
    
    init() {
        initLog('UIFailsafe initializing');
        this._setupErrorHandling();
        this._setupElementProtection();
        successLog('UIFailsafe initialized');
    },
    
    _setupErrorHandling() {
        window.addEventListener('error', (event) => {
            if (event.target && (event.target.tagName === 'BUTTON' || 
                                 event.target.tagName === 'INPUT' ||
                                 event.target.tagName === 'SELECT')) {
                this._handleUIError(event.target, event.error);
            }
        }, true);
        
        window.addEventListener('unhandledrejection', (event) => {
            this._handleUIError(null, event.reason);
        });
    },
    
    _setupElementProtection() {
        const criticalButtons = [
            'backToAppBtn',
            'saveSectionBtn',
            'resetSectionBtn',
            'settingsSearch'
        ];
        
        criticalButtons.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const originalClick = el.onclick;
                el.onclick = (e) => {
                    if (this._fallbackMode && id !== 'backToAppBtn') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    if (originalClick) {
                        return originalClick.call(el, e);
                    }
                };
            }
        });
    },
    
    _handleUIError(element, error) {
        this._errorCount++;
        
        if (this._errorCount >= this._maxErrors && !this._fallbackMode) {
            this.enterFallbackMode();
        }
        
        if (element && element.id) {
            this._disabledElements.add(element.id);
            element.disabled = true;
            element.classList.add('failsafe-disabled');
        }
        
        this.emit('error', { element, error, count: this._errorCount });
    },
    
    enterFallbackMode() {
        if (this._fallbackMode) return;
        
        this._fallbackMode = true;
        
        document.querySelectorAll('button, input, select, textarea').forEach(el => {
            if (el.id !== 'backToAppBtn' && !el.classList.contains('failsafe-protected')) {
                this._disabledElements.add(el.id || el.className);
                el.disabled = true;
                el.classList.add('failsafe-disabled');
            }
        });
        
        const container = document.getElementById('settingsContent');
        if (container) {
            const fallbackMsg = document.createElement('div');
            fallbackMsg.className = 'failsafe-message';
            fallbackMsg.style.cssText = `
                background: var(--warning-color);
                color: white;
                padding: 12px 20px;
                margin-bottom: 20px;
                border-radius: 8px;
                text-align: center;
                font-size: 14px;
            `;
            fallbackMsg.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i> Limited mode
                <button onclick="UIFailsafe.exitFallbackMode()" style="margin-left: 10px; padding: 4px 12px; background: white; color: var(--warning-color); border: none; border-radius: 4px; cursor: pointer;">
                    Retry
                </button>
            `;
            container.prepend(fallbackMsg);
        }
        
        this.emit('fallback', true);
        
        this._recoveryTimer = safeSetTimeout(() => {
            this.exitFallbackMode();
        }, 30000);
        activeTimers.add(this._recoveryTimer);
    },
    
    exitFallbackMode() {
        if (!this._fallbackMode) return;
        
        this._fallbackMode = false;
        this._errorCount = 0;
        
        this._disabledElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = false;
                el.classList.remove('failsafe-disabled');
            }
        });
        this._disabledElements.clear();
        
        const msg = document.querySelector('.failsafe-message');
        if (msg) msg.remove();
        
        if (this._recoveryTimer) {
            clearTimeout(this._recoveryTimer);
            activeTimers.delete(this._recoveryTimer);
        }
        
        this.emit('fallback', false);
    },
    
    protectElement(id) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('failsafe-protected');
        }
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    isInFallback() {
        return this._fallbackMode;
    },
    
    getDiagnostics() {
        return {
            enabled: this._enabled,
            fallbackMode: this._fallbackMode,
            errorCount: this._errorCount,
            maxErrors: this._maxErrors,
            disabledElements: Array.from(this._disabledElements)
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// MULTI-MODULE COORDINATOR - SIMPLIFIED
// =============================================
export const MODULE_DISCOVERY = 'MODULE_DISCOVERY';
export const MODULE_PRESENCE = 'MODULE_PRESENCE';
export const ORIGIN_BIND = 'ORIGIN_BIND';

export const MultiModuleCoordinator = {
    _modules: new Map(),
    _moduleId: `settings_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    _moduleType: 'settings',
    _busListeners: new Map(),
    _sharedSession: null,
    _masterModule: false,
    _handshakeCoordinator: null,
    _silent: true,
    _broadcastChannel: null,
    
    init() {
        initLog('MultiModuleCoordinator initializing');
        if (!window.__MODULE_COORDINATOR__) {
            window.__MODULE_COORDINATOR__ = this;
            this._masterModule = true;
        }
        
        this.registerModule(this._moduleType, this._moduleId);
        
        window.addEventListener('message', (event) => {
            if (event.data && event.data._moduleBus) {
                this._handleModuleMessage(event.data);
            }
        });
        
        try {
            this._broadcastChannel = new BroadcastChannel('knecta_settings');
            this._broadcastChannel.onmessage = (event) => {
                if (event.data && event.data.type) {
                    this._handleBroadcastMessage(event.data);
                }
            };
        } catch (e) {
            if (DEBUG) debugLog('BroadcastChannel not supported');
        }
        
        successLog('MultiModuleCoordinator initialized');
    },
    
    _handleBroadcastMessage(data) {
        if (data.type === 'SETTINGS_UPDATED' && data.source !== this._moduleId) {
            if (currentState === SETTINGS_STATES.READY) {
                loadFromLocalStorage().then(() => {
                    const event = new CustomEvent('settingsUpdated', {
                        detail: { source: 'broadcast', timestamp: Date.now() }
                    });
                    window.dispatchEvent(event);
                });
            }
        }
        
        if (data.type === 'LANGUAGE_CHANGED' && data.source !== this._moduleId) {
            const event = new CustomEvent('languageChanged', {
                detail: { language: data.language, source: 'broadcast' }
            });
            window.dispatchEvent(event);
        }
    },
    
    registerModule(type, id) {
        this._modules.set(id, {
            type,
            id,
            lastSeen: Date.now(),
            ready: currentState === SETTINGS_STATES.READY,
            handshakeComplete: IframeHandshakeAuthority.isComplete(),
            sessionValid: isSessionValid()
        });
        
        this._broadcast({
            _moduleBus: true,
            type: MODULE_PRESENCE,
            moduleType: type,
            moduleId: id,
            timestamp: Date.now()
        });
    },
    
    _handleModuleMessage(data) {
        const { type, sourceId, moduleType, target } = data;
        
        if (target && target !== this._moduleId && target !== 'all') return;
        
        switch (type) {
            case MODULE_PRESENCE:
                this._modules.set(sourceId, {
                    type: moduleType,
                    id: sourceId,
                    lastSeen: Date.now(),
                    ready: data.ready || false,
                    handshakeComplete: data.handshakeComplete || false,
                    sessionValid: data.sessionValid || false
                });
                break;
                
            case MODULE_DISCOVERY:
                this._broadcast({
                    _moduleBus: true,
                    type: MODULE_PRESENCE,
                    moduleType: this._moduleType,
                    moduleId: this._moduleId,
                    ready: currentState === SETTINGS_STATES.READY,
                    handshakeComplete: IframeHandshakeAuthority.isComplete(),
                    sessionValid: isSessionValid(),
                    timestamp: Date.now(),
                    target: sourceId
                });
                break;
                
            default:
                const listeners = this._busListeners.get(type) || [];
                listeners.forEach(listener => {
                    try {
                        listener(data);
                    } catch (e) {}
                });
        }
    },
    
    _broadcast(message) {
        message.sourceId = this._moduleId;
        message.timestamp = Date.now();
        
        IframeTransport.send('MODULE_BROADCAST', {
            payload: message,
            timestamp: Date.now()
        }, { expectAck: false, maxRetries: 0 }).catch(() => {});
        
        if (this._broadcastChannel) {
            try {
                this._broadcastChannel.postMessage({
                    type: message.type,
                    source: this._moduleId,
                    ...message
                });
            } catch (e) {}
        }
    },
    
    on(event, listener) {
        if (!this._busListeners.has(event)) {
            this._busListeners.set(event, []);
        }
        this._busListeners.get(event).push(listener);
    },
    
    emit(event, data) {
        this._broadcast({
            _moduleBus: true,
            type: event,
            ...data
        });
    },
    
    getModules() {
        const now = Date.now();
        this._modules.forEach((module, id) => {
            if (now - module.lastSeen > 60000) {
                this._modules.delete(id);
            }
        });
        
        return Array.from(this._modules.values());
    },
    
    hasModule(type) {
        return Array.from(this._modules.values()).some(m => m.type === type);
    },
    
    getSharedSession() {
        return session.user ? { user: session.user } : null;
    },
    
    setSharedSession(sessionData) {
        // Do nothing - parent is authoritative
    },
    
    getDiagnostics() {
        return {
            moduleId: this._moduleId,
            moduleType: this._moduleType,
            masterModule: this._masterModule,
            modulesCount: this._modules.size,
            modules: Array.from(this._modules.values())
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// RECOVERY MANAGER - DISABLED
// =============================================
export const RecoveryManager = {
    _attempts: 0,
    _maxAttempts: 0,
    _backoffMs: 1000,
    _recoveryInProgress: false,
    _recoveryTimer: null,
    _listeners: new Set(),
    _recoveryStrategies: new Map(),
    _silent: true,
    
    init() {
        initLog('RecoveryManager initializing (disabled)');
        successLog('RecoveryManager initialized (disabled)');
    },
    
    _registerDefaultStrategies() {},
    
    registerStrategy(name, strategy) {},
    
    async attemptRecovery(options = {}) {
        return false;
    },
    
    reset() {},
    
    on(event, listener) {},
    
    emit(event, data) {},
    
    getDiagnostics() {
        return {
            attempts: 0,
            maxAttempts: 0,
            recoveryInProgress: false,
            strategies: []
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// RELIABILITY ENGINE - SIMPLIFIED
// =============================================
export const ReliabilityEngine = {
    _quality: 'unknown',
    _enabled: true,
    _silent: true,
    
    init() {
        initLog('ReliabilityEngine initializing');
        successLog('ReliabilityEngine initialized');
    },
    
    getQuality() {
        return this._quality;
    },
    
    enable() {
        this._enabled = true;
    },
    
    disable() {
        this._enabled = false;
    },
    
    getDiagnostics() {
        return {
            quality: this._quality,
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// SESSION CLIENT - SIMPLIFIED
// =============================================
export const SessionClient = {
    _session: null,
    _sessionToken: null,
    _sessionExpiry: null,
    _sessionVersion: 0,
    _lastSync: 0,
    _syncInterval: null,
    _refreshTimer: null,
    _listeners: new Set(),
    _pendingAck: false,
    _sessionLock: false,
    _refreshAttempts: 0,
    _maxRefreshAttempts: 0,
    _offlineMode: false,
    _syncInProgress: false,
    _silent: true,
    
    init() {
        initLog('SessionClient initializing');
        successLog('SessionClient initialized');
    },
    
    _startSync() {},
    
    async sync() {
        return false;
    },
    
    updateSession(session, token, expiry) {
        return false;
    },
    
    _scheduleRefresh() {},
    
    async refresh() {
        return false;
    },
    
    on(event, listener) {},
    
    emit(event, data) {},
    
    getSession() {
        return session.user ? { ...session.user } : null;
    },
    
    getToken() {
        return null;
    },
    
    isValid() {
        return isSessionValid();
    },
    
    isExpired() {
        return !isSessionValid();
    },
    
    isOffline() {
        return false;
    },
    
    clear() {},
    
    getDiagnostics() {
        return {
            hasSession: !!session.user,
            hasToken: false,
            expiry: session.expiresAt,
            version: session.version,
            lastSync: 0,
            refreshAttempts: 0,
            isValid: isSessionValid(),
            isExpired: !isSessionValid(),
            offlineMode: false,
            parentAuthoritative: !!parentAuthoritativeSession
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// DIAGNOSTICS AGENT
// =============================================
export const DiagnosticsAgent = {
    _enabled: true,
    _logBuffer: [],
    _maxBuffer: 500,
    _startTime: Date.now(),
    _metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        handshakes: 0,
        handshakeFailures: 0,
        sessionUpdates: 0,
        sessionFailures: 0,
        pings: 0,
        pongs: 0,
        acks: 0,
        errors: 0,
        recoveries: 0
    },
    _stateSnapshots: [],
    _logToConsole: DEBUG,
    
    enable(debug = false) {
        this._enabled = true;
        
        if (debug) {
            this._logToConsole = true;
            this._maxBuffer = 500;
            window.__IFRAME_DEBUG__ = true;
            DEBUG_ENABLED = true;
        }
        
        window.__getDiagnostics = () => this.getFullReport();
        window.__resetDiagnostics = () => this.reset();
    },
    
    disable() {
        this._enabled = false;
        this._logToConsole = false;
    },
    
    log(level, message, data = null) {
        if (!this._enabled) return;
        if (!DEBUG && level !== 'error' && level !== 'init' && level !== 'success') return;
        
        const entry = {
            level,
            message,
            data: data ? (typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data)) : null,
            timestamp: Date.now(),
            timeStr: new Date().toISOString().slice(11, 23),
            state: currentState,
            environment: IframeEnvironment.getEnvironment()
        };
        
        this._logBuffer.push(entry);
        
        if (this._logBuffer.length > this._maxBuffer) {
            this._logBuffer.shift();
        }
    },
    
    track(event, details = {}) {
        if (!this._enabled) return;
        
        if (this._metrics.hasOwnProperty(event)) {
            this._metrics[event]++;
        }
        
        this._stateSnapshots.push({
            event,
            details,
            timestamp: Date.now(),
            state: currentState,
            handshakeStatus: IframeHandshakeAuthority.getStatus(),
            sessionValid: isSessionValid(),
            environment: IframeEnvironment.getEnvironment()
        });
        
        if (this._stateSnapshots.length > 50) {
            this._stateSnapshots.shift();
        }
    },
    
    error(error, context = '') {
        this._metrics.errors++;
        errorLog(context, error);
    },
    
    getMetrics() {
        return {
            ...this._metrics,
            uptime: Date.now() - this._startTime,
            environment: IframeEnvironment.getEnvironment(),
            sandboxed: IframeEnvironment._features.isSandboxed,
            compatibility: CompatibilityBridge.isEnabled()
        };
    },
    
    getFullReport() {
        return {
            timestamp: Date.now(),
            state: {
                current: currentState,
                history: stateHistory.slice(-5)
            },
            environment: {
                type: IframeEnvironment.getEnvironment(),
                features: { ...IframeEnvironment._features },
                sandboxed: IframeEnvironment._features.isSandboxed,
                compatibility: CompatibilityBridge.isEnabled(),
                compatibilityReason: CompatibilityBridge.getReason()
            },
            startup: StartupGovernor.getDiagnostics(),
            handshake: IframeHandshakeAuthority.getStatus(),
            session: {
                valid: isSessionValid(),
                user: session.user ? { id: session.user.id, name: session.user.name } : null,
                expiresAt: session.expiresAt,
                version: session.version
            },
            heartbeat: HeartbeatManager.getDiagnostics(),
            origin: OriginAdapter.getDiagnostics(),
            transport: IframeTransport.getDiagnostics(),
            metrics: this.getMetrics(),
            logs: this._logBuffer.slice(-20),
            stateSnapshots: this._stateSnapshots.slice(-10),
            parentAuthority: {
                state: parentAuthorityState,
                parentReadyDetected,
                moduleRegistered,
                parentAuthoritative: !!parentAuthoritativeSession,
                parentContractEnforced
            }
        };
    },
    
    reset() {
        this._logBuffer = [];
        this._metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            handshakes: 0,
            handshakeFailures: 0,
            sessionUpdates: 0,
            sessionFailures: 0,
            pings: 0,
            pongs: 0,
            acks: 0,
            errors: 0,
            recoveries: 0
        };
        this._stateSnapshots = [];
        this._startTime = Date.now();
        this.log('INFO', 'Diagnostics reset');
    }
};

// =============================================
// EXPORTED STATE VARIABLES
// =============================================
export let isReady = false;
export let coreError = null;
export let initializationInProgress = false;

export let currentUser = null;
export let userSettings = null;
export let currentSection = 'profile';
export let unsavedChanges = false;
export let blockedUsers = [];
export let activeSessions = [];
export let userContacts = [];
export let userGroups = [];

export let authReady = false;
export let apiInitialized = false;
export let backgroundTasksStarted = false;
export let tokenReady = false;
export let tokenAvailable = false;
export let tokenInitialized = false;
export let parentCommunicationReady = false;
export let parentSessionReceived = false;
export let parentOrigin = null;
export let parentSessionData = null;
export let sessionValidated = false;

export let handshakeState = 'pending';
export let parentReadyReceived = false;
export let childReadySent = false;
export let handshakeAcked = false;
export let sessionAcked = false;
export let pageVisibility = document.visibilityState;
export let connectionQuality = 'unknown';
export let lastPongTime = 0;
export let pingInterval = null;
export let recoveryAgentActive = false;
export let recoveryAttempts = 0;
export let maxRecoveryAttempts = 0;
export let originBoundToken = null;
export let tokenBindingNonce = null;

export let MAX_API_RETRIES = 0;
export let AUTH_CHECK_INTERVAL = 30000;
export let TOKEN_CHECK_INTERVAL = 1000;
export let MAX_HANDSHAKE_ATTEMPTS = 1;
export let HANDSHAKE_RETRY_INTERVAL = 1000;
export let SESSION_SYNC_TIMEOUT = 5000;
export let HEARTBEAT_INTERVAL = 30000;

export let PING_INTERVAL = 15000;
export let PING_TIMEOUT = 5000;
export let MAX_PING_FAILURES = 3;
export let RECOVERY_BACKOFF_BASE = 1000;
export let RECOVERY_MAX_BACKOFF = 30000;
export let VISIBILITY_THROTTLE_DELAY = 5000;
export let TOKEN_BINDING_NONCE_LENGTH = 16;

// =============================================
// PARENT MESSAGE TYPES
// =============================================
export const PARENT_MESSAGE_TYPES = {
    READY: 'READY',
    ACK: 'ACK',
    SESSION: 'SESSION',
    DATA: 'DATA',
    ERROR: 'ERROR',
    HEARTBEAT: 'HEARTBEAT',
    STATUS: 'STATUS',
    HANDSHAKE: 'HANDSHAKE',
    HANDSHAKE_ACK: 'HANDSHAKE_ACK',
    SESSION_REQUEST: 'SESSION_REQUEST',
    SESSION_RESPONSE: 'SESSION_RESPONSE',
    SESSION_UPDATE: 'SESSION_UPDATE',
    TOKEN_REQUEST: 'TOKEN_REQUEST',
    TOKEN_RESPONSE: 'TOKEN_RESPONSE',
    CHILD_READY: 'CHILD_READY',
    PARENT_READY: 'PARENT_READY',
    AUTH_READY: 'AUTH_READY',
    AUTH_LOST: 'AUTH_LOST',
    LOGOUT: 'LOGOUT',
    REFRESH_DATA: 'REFRESH_DATA',
    UPDATE_DATA: 'UPDATE_DATA',
    CORE_READY: 'CORE_READY',
    IFRAME_AUTH_STATE: 'IFRAME_AUTH_STATE',
    IFRAME_AUTH_ERROR: 'IFRAME_AUTH_ERROR',
    CHILD_CLOSING: 'CHILD_CLOSING',
    
    PING: 'PING',
    PONG: 'PONG',
    SESSION_ACK: 'SESSION_ACK',
    RECOVERY_REQUEST: 'RECOVERY_REQUEST',
    RECOVERY_RESPONSE: 'RECOVERY_RESPONSE',
    RECOVERY_COMPLETE: 'RECOVERY_COMPLETE',
    ORIGIN_BIND: 'ORIGIN_BIND',
    ORIGIN_BIND_ACK: 'ORIGIN_BIND_ACK',
    CAPABILITY_REQUEST: 'CAPABILITY_REQUEST',
    CAPABILITY_RESPONSE: 'CAPABILITY_RESPONSE',
    SESSION_SYNC: 'SESSION_SYNC',
    MODULE_BROADCAST: 'MODULE_BROADCAST',
    VISIBILITY_RESUME: 'VISIBILITY_RESUME',
    THEME_CHANGED: 'THEME_CHANGED',
    
    SETTINGS_UPDATED: 'SETTINGS_UPDATED',
    SETTINGS_PROFILE_UPDATED: 'SETTINGS_PROFILE_UPDATED',
    SETTINGS_PRIVACY_UPDATED: 'SETTINGS_PRIVACY_UPDATED',
    SETTINGS_NOTIFICATIONS_UPDATED: 'SETTINGS_NOTIFICATIONS_UPDATED',
    SETTINGS_APPEARANCE_UPDATED: 'SETTINGS_APPEARANCE_UPDATED',
    SETTINGS_SECURITY_UPDATED: 'SETTINGS_SECURITY_UPDATED',
    SETTINGS_STORAGE_UPDATED: 'SETTINGS_STORAGE_UPDATED',
    SETTINGS_MOOD_UPDATED: 'SETTINGS_MOOD_UPDATED',
    USER_BLOCKED: 'USER_BLOCKED',
    USER_UNBLOCKED: 'USER_UNBLOCKED',
    SESSION_TERMINATED: 'SESSION_TERMINATED',
    ALL_SESSIONS_TERMINATED: 'ALL_SESSIONS_TERMINATED',
    PROFILE_PHOTO_UPDATED: 'PROFILE_PHOTO_UPDATED',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED',
    DATA_EXPORT_REQUESTED: 'DATA_EXPORT_REQUESTED',
    ACCOUNT_DELETION_REQUESTED: 'ACCOUNT_DELETION_REQUESTED',
    CACHE_CLEARED: 'CACHE_CLEARED'
};

// =============================================
// CORE DATA STORAGE
// =============================================
export const coreData = {
    friendsList: [],
    groupsList: [],
    chatHistory: [],
    notifications: [],
    settings: null,
    user: null
};

// =============================================
// MESSAGE QUEUE
// =============================================
export const messageQueue = [];
export let parentReady = false;

export const prioritizedMessageQueue = {
    high: [],
    normal: [],
    low: []
};

// =============================================
// DEFAULT SETTINGS - COMPLETE (ALL SECTIONS)
// =============================================
export const DEFAULT_SETTINGS = {
    profile: {
        photoUrl: '',
        displayName: '',
        username: '',
        bio: '',
        phoneNumber: '',
        email: '',
        currentMood: 'neutral',
        currentMoodText: '',
        profileVisibility: 'everyone',
        lastSeen: true,
        onlineStatus: true,
        profilePhotoVisibility: 'everyone'
    },
    security: {
        twoFactorAuth: false,
        loginNotifications: true,
        sessionTimeout: '30min',
        appLock: false,
        screenCaptureProtection: true,
        encryption: true,
        biometricBypass: true,
        timeoutWarnings: true,
        enhancedTimeout: false,
        lockScreenAfter: '5min',
        logoutAfter: '8hr'
    },
    privacy: {
        whoCanAddMe: 'everyone',
        readReceipts: true,
        typingIndicators: true,
        messageForwarding: true,
        contactDiscovery: true,
        canMessageMe: 'everyone',
        canCallMe: 'everyone',
        canSeeMyStatus: 'friendsOnly',
        canSeeProfilePhoto: 'everyone',
        canSeeLastSeen: 'friendsOnly',
        canForwardMessages: 'friendsOnly',
        canTakeScreenshots: false,
        blockedUsers: []
    },
    chat: {
        chatWallpaper: 'default',
        enterKeySends: true,
        mediaAutoDownload: 'wifiOnly',
        saveToCameraRoll: true,
        messageHistory: 'forever',
        disappearingMessages: 'off',
        smartReplies: true,
        messageTranslation: false,
        chatSummarization: false,
        spamDetection: true,
        messageApprovalMode: false,
        keywordFiltering: false
    },
    friends: {
        discoverByPhone: true,
        discoverByEmail: true,
        nearbyDiscovery: false,
        qrCodeScanner: true,
        friendSuggestions: true,
        temporaryFriends: false,
        friendshipNotes: true,
        friendCategories: true,
        trustScore: false,
        friendAnalytics: false
    },
    groups: {
        autoJoinGroups: false,
        groupInvitations: 'everyone',
        groupPrivacy: 'everyone',
        groupAnnouncements: true,
        autoDownloadGroupMedia: 'wifiOnly',
        messageApprovalModeGroup: false,
        keywordFilteringGroup: false,
        groupSpamDetection: true,
        memberWarnings: true,
        activityTracking: false,
        topContributors: false,
        messageVolumeAnalytics: false,
        groupDataCache: 'activeGroupsOnly'
    },
    calls: {
        whoCanCallMe: 'everyone',
        callVerification: true,
        ringtone: 'default',
        callVibration: true,
        autoAnswer: false,
        videoQuality: 'auto',
        cameraDefault: 'front',
        noiseCancellation: true,
        echoCancellation: true,
        liveReactions: true,
        inCallChat: true,
        sharedWhiteboard: false,
        sharedNotes: false,
        polls: false,
        callHistoryCache: '90days'
    },
    status: {
        whoCanViewMyStatus: 'friendsOnly',
        autoExpireStatus: '24h',
        replyPermissions: 'friendsOnly',
        downloadPermissions: false,
        hideFromSpecificUsers: [],
        viewCount: true,
        viewerList: true,
        engagementReactions: true,
        autoCaptions: false,
        aiEnhancement: false,
        statusScheduling: false,
        statusCache: '7days'
    },
    notifications: {
        messageNotifications: true,
        groupNotifications: true,
        friendRequestNotifications: true,
        callNotifications: true,
        statusNotifications: true,
        notificationSound: true,
        vibration: true,
        popupNotifications: true,
        notificationLight: true,
        doNotDisturb: false,
        schedule: 'custom',
        allowCalls: true
    },
    appearance: {
        theme: 'auto',
        accentColor: '#0084ff',
        fontSize: 16,
        reduceMotion: false,
        language: 'en',
        timeFormat: '12-hour',
        dateFormat: 'MM/DD/YYYY',
        moodBasedLayouts: false,
        layoutMode: 'compact',
        customIcons: false,
        buttonStyles: 'rounded'
    },
    mood: {
        moodLinkedTheme: true,
        moodColors: {
            happy: '#FFD700',
            calm: '#4A90E2',
            energetic: '#FF6B6B',
            focused: '#7B68EE',
            relaxed: '#4ECDC4',
            stressed: '#FF8C00',
            tired: '#A9A9A9',
            excited: '#FF1493'
        },
        currentMood: 'neutral',
        manualMoodOverride: 'autoDetect',
        smartNotifications: true,
        autoMoodDetection: true,
        moodAutoReplies: false,
        stressedModeRules: false,
        focusedModeRules: false,
        happyModeRules: false,
        updateAfterCalls: false,
        updateAfterStatusPosts: false,
        updateAfterActivity: false
    },
    storage: {
        autoClearCache: 'never',
        chatCacheSize: 0,
        mediaCacheSize: 0,
        otherCacheSize: 0,
        totalStorageUsed: 0,
        storageTotal: 1024 * 1024 * 1024,
        storageBreakdown: {
            chats: 0,
            media: 0,
            other: 0
        }
    },
    advanced: {
        offlineMode: false,
        intranetSupport: false,
        lowBandwidthMode: false,
        debugMode: false,
        proxySettings: {},
        dataSaver: false
    },
    backup: {
        autoBackup: true,
        backupFrequency: 'weekly',
        backupLocation: 'cloud',
        lastBackup: null,
        backupSize: 0
    },
    danger: {
        accountDeletionRequested: false,
        deletionScheduled: null,
        dataExportRequested: false,
        lastExport: null,
        exportFormat: 'json'
    }
};

// =============================================
// SETTINGS MENU - COMPLETE
// =============================================
export const SETTINGS_MENU = [
    { id: 'profile', title: 'Profile', icon: 'fas fa-user', badge: null, danger: false, requiresAuth: false },
    { id: 'security', title: 'Security', icon: 'fas fa-shield-alt', badge: null, danger: false, requiresAuth: true },
    { id: 'privacy', title: 'Privacy', icon: 'fas fa-lock', badge: null, danger: false, requiresAuth: true },
    { id: 'chat', title: 'Chat', icon: 'fas fa-comments', badge: null, danger: false, requiresAuth: true },
    { id: 'friends', title: 'Friends', icon: 'fas fa-user-friends', badge: null, danger: false, requiresAuth: true },
    { id: 'groups', title: 'Groups', icon: 'fas fa-users', badge: null, danger: false, requiresAuth: true },
    { id: 'calls', title: 'Calls', icon: 'fas fa-phone', badge: null, danger: false, requiresAuth: true },
    { id: 'status', title: 'Status', icon: 'fas fa-circle', badge: null, danger: false, requiresAuth: true },
    { id: 'notifications', title: 'Notifications', icon: 'fas fa-bell', badge: null, danger: false, requiresAuth: true },
    { id: 'appearance', title: 'Appearance', icon: 'fas fa-palette', badge: null, danger: false, requiresAuth: true },
    { id: 'storage', title: 'Storage', icon: 'fas fa-database', badge: null, danger: false, requiresAuth: true },
    { id: 'mood', title: 'Mood Settings', icon: 'fas fa-smile', badge: 'NEW', danger: false, requiresAuth: true },
    { id: 'advanced', title: 'Advanced', icon: 'fas fa-cogs', badge: null, danger: false, requiresAuth: true },
    { id: 'backup', title: 'Backup & Restore', icon: 'fas fa-cloud-upload-alt', badge: null, danger: false, requiresAuth: true },
    { id: 'danger', title: 'Danger Zone', icon: 'fas fa-exclamation-triangle', badge: '!', danger: true, requiresAuth: true }
];

// =============================================
// PRIVATE STATE MANAGEMENT
// =============================================
const state = {
    initialized: false,
    handshakeCompleted: false,
    sessionSynced: false,
    permissionsGranted: false,
    dependenciesLoaded: false,
    parentOrigin: null,
    parentVerified: false,
    parentWindow: null,
    parentReady: false,
    parentProtocolVersion: null,
    messageSequence: 0,
    pendingMessages: new Map(),
    pendingAcks: new Map(),
    messageHandlers: new Map(),
    session: null,
    sessionMirror: {
        user: null,
        token: null,
        permissions: null,
        expiresAt: 0,
        lastSync: 0
    },
    sessionExpiry: null,
    authMode: 'pending',
    features: new Map(),
    listeners: new Set(),
    intervals: new Set(),
    timeouts: new Set(),
    circuitBreakers: new Map(),
    health: {
        status: 'initializing',
        lastHeartbeat: Date.now(),
        failures: 0,
        recoveryAttempts: 0,
        lastError: null,
        lastErrorTime: 0,
        pingFailures: 0,
        lastPing: 0,
        lastPong: 0,
        messagesSent: 0,
        messagesReceived: 0,
        acksReceived: 0,
        acksSent: 0,
        recoveryCount: 0,
        visibilityChanges: 0
    },
    tokenCheckInterval: null,
    authCheckInterval: null,
    handshakeInterval: null,
    heartbeatInterval: null,
    processedMessageIds: new Set(),
    messageIdCleanupTimer: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 0,
    reconnectDelay: 1000,
    sessionWatchdog: null,
    readyCallbacks: [],
    errorBoundary: null,
    
    handshakeState: 'pending',
    parentReadyReceived: false,
    childReadySent: false,
    handshakeAcked: false,
    sessionAcked: false,
    pageVisible: true,
    connectionQuality: 'unknown',
    pingFailures: 0,
    recoveryAgent: null,
    originBinding: {
        bound: false,
        nonce: null,
        timestamp: 0
    },
    capabilityMap: new Map(),
    visibilityHandler: null,
    backoffTimer: null,
    pingInterval: null,
    pongTimeout: null,
    lastCanonicalMessageId: null,
    protocolVersion: PROTOCOL_CANONICAL
};

// =============================================
// TRUSTED ORIGINS
// =============================================
const TRUSTED_ORIGINS = new Set([
    window.location.origin,
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'null',
    'https://*.onrender.com',
    'http://*.onrender.com',
    'https://moodchat-fy56.onrender.com',
    'https://moodfronted.onrender.com',
    'https://knecta.chat',
    'https://app.knecta.chat',
    'https://chat.knecta.app'
]);

let trustedOrigins = new Set(TRUSTED_ORIGINS);
let untrustedOriginLogged = false;
let processedMessageIds = new Set();
let authErrorNotified = false;
let handshakeFailureLogged = false;
let sessionRequestLogged = false;

const originPatterns = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /^https?:\/\/.*\.onrender\.com$/,
    /^https?:\/\/.*\.knecta\.(app|chat)$/,
    /^https?:\/\/(192\.168\..*|10\..*|172\.(1[6-9]|2[0-9]|3[0-1])\..*)$/
];

// =============================================
// LOGGING SYSTEM
// =============================================
const Log = {
    _warnings: new Set(),
    _debug: DEBUG,
    _logBuffer: [],
    _maxBufferSize: 500,
    _logLevel: DEBUG ? 'debug' : 'error',
    _silent: !DEBUG,
    
    _metrics: {
        startTime: Date.now(),
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0,
        warnings: 0,
        handshakeAttempts: 0,
        recoveryAttempts: 0,
        pingSuccesses: 0,
        pingFailures: 0
    },
    
    enableDebug() { 
        this._debug = true; 
        this._logLevel = 'debug';
        DiagnosticsAgent.enable(true);
        this._silent = false;
    },
    
    setLogLevel(level) { this._logLevel = level; },
    setSilent(silent) { this._silent = silent; },
    
    getDiagnostics() {
        return {
            uptime: Date.now() - this._metrics.startTime,
            messagesSent: this._metrics.messagesSent,
            messagesReceived: this._metrics.messagesReceived,
            errors: this._metrics.errors,
            warnings: this._metrics.warnings,
            handshakeAttempts: this._metrics.handshakeAttempts,
            recoveryAttempts: this._metrics.recoveryAttempts,
            pingSuccesses: this._metrics.pingSuccesses,
            pingFailures: this._metrics.pingFailures,
            buffer: this._logBuffer.slice(-10),
            health: state.health,
            handshakeState: state.handshakeState,
            parentReady: parentReady,
            authMode: state.authMode,
            pageVisible: state.pageVisible,
            connectionQuality: state.connectionQuality
        };
    },
    
    _addToBuffer(level, message, data) {
        if (!DEBUG && level !== 'error' && level !== 'init' && level !== 'success') return;
        
        const entry = {
            level,
            message,
            data: data ? (typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data)) : null,
            timestamp: Date.now(),
            timeStr: new Date().toISOString().slice(11, 23)
        };
        this._logBuffer.push(entry);
        if (this._logBuffer.length > this._maxBufferSize) {
            this._logBuffer.shift();
        }
        
        DiagnosticsAgent.log(level, message, data);
    },
    
    getBuffer() { return [...this._logBuffer]; },
    
    info(message, data = null) {
        if (this._silent || !DEBUG) return;
        infoLog(message, data);
        this._addToBuffer('info', message, data);
    },
    
    warn(message, once = true) {
        if (this._silent || !DEBUG) return;
        if (once && this._warnings.has(message)) return;
        this._warnings.add(message);
        this._metrics.warnings++;
        console.warn(`[${MODULE_NAME}] ⚠️ ${message}`);
        this._addToBuffer('warn', message, null);
    },
    
    error(message, error = null, once = true) {
        if (this._silent) return;
        if (once && this._warnings.has(`error:${message}`)) return;
        this._warnings.add(`error:${message}`);
        this._metrics.errors++;
        errorLog(message, error);
        this._addToBuffer('error', message, error);
        state.health.lastError = message;
        state.health.lastErrorTime = Date.now();
        state.health.failures++;
        
        DiagnosticsAgent.error(error || message, message);
    },
    
    debug(message, data = null) {
        if (this._silent || !DEBUG) return;
        debugLog(message, data);
        this._addToBuffer('debug', message, data);
    },
    
    metric(name, value) {
        if (this._silent || !DEBUG) return;
        console.debug(`[${MODULE_NAME}] 📊 ${name}:`, value);
    },
    
    trackSend() {
        this._metrics.messagesSent++;
        state.health.messagesSent++;
        DiagnosticsAgent.track('message_sent');
    },
    
    trackReceive() {
        this._metrics.messagesReceived++;
        state.health.messagesReceived++;
        DiagnosticsAgent.track('message_received');
    },
    
    flush() {
        this._logBuffer = [];
    }
};

// =============================================
// SECURE STORAGE ABSTRACTION LAYER
// =============================================
const SecureStorage = SafeStorage;

// =============================================
// SESSION MIRROR LAYER - DISABLED UNDER PARENT AUTHORITY
// =============================================
const SessionMirror = {
    _mirror: {
        user: null,
        token: null,
        permissions: null,
        expiresAt: 0,
        lastSync: 0,
        version: 0,
        source: null,
        boundOrigin: null,
        bindingNonce: null,
        capabilities: [],
        lastValidated: 0
    },
    _subscribers: new Set(),
    _syncInProgress: false,
    _lastSyncAttempt: 0,
    _syncInterval: null,
    
    init() {
        return this;
    },
    
    update(sessionData) {
        return false;
    },
    
    sync() {
        return false;
    },
    
    subscribe(callback) {
        return () => {};
    },
    
    _notifySubscribers() {},
    
    getMirror() {
        return {
            user: session.user ? { ...session.user } : null,
            token: null,
            permissions: null,
            expiresAt: session.expiresAt,
            lastSync: 0,
            version: session.version,
            isValid: isSessionValid(),
            isExpired: !isSessionValid(),
            boundOrigin: null,
            bindingNonce: null,
            capabilities: [],
            lastValidated: 0
        };
    },
    
    getUser() {
        return session.user ? { ...session.user } : null;
    },
    
    getToken() {
        return null;
    },
    
    validateToken() {
        return false;
    },
    
    isValid() {
        return isSessionValid();
    },
    
    isExpired() {
        return !isSessionValid();
    },
    
    clear() {
        // Do nothing
    },
    
    shutdown() {
        // Do nothing
    }
};

// =============================================
// CANONICAL MESSAGE FORMATTER
// =============================================
function formatCanonicalMessage(type, payload = {}, options = {}) {
    const messageId = options.messageId || generateMessageId();
    const timestamp = options.timestamp || Date.now();
    const expectAck = options.expectAck || false;
    const priority = options.priority || 'normal';
    const retryCount = options.retryCount || 0;
    
    const canonicalMessage = {
        protocol: PROTOCOL_CANONICAL,
        messageId,
        type,
        source: 'iframe',
        target: 'parent',
        frameId: FRAME_ID,
        timestamp,
        payload: payload || {},
        expectAck,
        priority,
        retryCount,
        module: MODULE_NAME,
        version: MODULE_VERSION,
        environment: IframeEnvironment.getEnvironment(),
        state: currentState
    };
    
    if (options.legacy) {
        canonicalMessage.legacy = true;
    }
    
    if (CompatibilityBridge.isEnabled()) {
        canonicalMessage.compatibility = true;
    }
    
    Log.trackSend();
    return canonicalMessage;
}

// =============================================
// MESSAGE ID GENERATOR
// =============================================
function generateMessageId() {
    return generateUniqueId();
}

// =============================================
// SECURITY FUNCTIONS
// =============================================
function isValidOrigin(origin) {
    return OriginAdapter.isTrusted(origin);
}

function signMessage(payload) {
    const timestamp = Date.now();
    const messageId = generateMessageId();
    const sequence = state.messageSequence;
    const signature = btoa(JSON.stringify({
        module: MODULE_NAME,
        sequence,
        timestamp,
        type: payload.type || 'unknown',
        nonce: Math.random().toString(36).substring(2, 10)
    }));
    return {
        ...payload,
        messageId,
        sequence,
        timestamp,
        module: MODULE_NAME,
        version: MODULE_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        signature
    };
}

function verifyMessage(message) {
    if (!message || typeof message !== 'object') return false;
    
    if (message.protocol === PROTOCOL_CANONICAL) {
        if (!message.messageId || !message.timestamp) return false;
        return true;
    }
    
    if (!message.messageId || !message.timestamp) return false;
    
    if (state.processedMessageIds.has(message.messageId)) {
        return false;
    }
    
    return true;
}

function isFromParent(event) {
    return event.source === state.parentWindow || event.source === window.parent;
}

// =============================================
// PARENT DETECTION
// =============================================
function detectParent() {
    try {
        if (window.parent && window.parent !== window) {
            state.parentWindow = window.parent;
            try {
                if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
                    state.parentOrigin = window.location.ancestorOrigins[0];
                } else {
                    state.parentOrigin = document.referrer ? new URL(document.referrer).origin : window.location.origin;
                }
            } catch (e) {
                state.parentOrigin = '*';
            }
            parentOrigin = state.parentOrigin;
            OriginAdapter.setParentOrigin(state.parentOrigin);
            if (DEBUG) debugLog('Parent detected:', state.parentOrigin);
            return true;
        }
    } catch (error) {}
    return false;
}

function waitForParent(timeout = 5000) {
    return new Promise((resolve) => {
        if (detectParent()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = safeSetInterval(() => {
            if (detectParent()) {
                clearInterval(checkInterval);
                activeIntervals.delete(checkInterval);
                clearTimeout(timeoutId);
                activeTimers.delete(timeoutId);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                activeIntervals.delete(checkInterval);
                resolve(false);
            }
        }, 100);
        activeIntervals.add(checkInterval);
        const timeoutId = safeSetTimeout(() => {
            clearInterval(checkInterval);
            activeIntervals.delete(checkInterval);
            resolve(false);
        }, timeout);
        activeTimers.add(timeoutId);
        state.timeouts.add(checkInterval);
        state.timeouts.add(timeoutId);
    });
}

// =============================================
// SEND TO PARENT - WRAPPER
// =============================================
export function sendToParent(payload, retryCount = 0, expectAck = false) {
    const messageId = generateUniqueId();
    return IframeTransport.send(
        payload.type || 'UNKNOWN',
        payload.payload || payload,
        { 
            expectAck, 
            retryCount,
            timeout: payload.timeout || 5000,
            maxRetries: 0,
            messageId
        }
    );
}

// =============================================
// RECEIVE FROM PARENT
// =============================================
export function receiveFromParent(messageType, handler) {
    return IframeTransport.on(messageType, handler);
}

// =============================================
// REGISTER WITH PARENT - STEP 1
// =============================================
function registerWithParent() {
    transitionTo(SETTINGS_STATES.REGISTERING, 'starting_registration');
    
    IframeTransport.startHandshakeTimer(150);
    
    const requestId = generateRequestId();
    
    sendToParent({
        type: 'REGISTER_MODULE',
        module: MODULE_NAME,
        frameId: FRAME_ID,
        requestId: requestId,
        timestamp: Date.now()
    }, 0, true).then(() => {
        if (DEBUG) debugLog('Registration sent');
    }).catch(() => {
        transitionTo(SETTINGS_STATES.DEGRADED, 'registration_failed');
    });
}

// =============================================
// HANDLE MODULE REGISTERED - STEP 2
// =============================================
function handleModuleRegistered(message) {
    if (currentState !== SETTINGS_STATES.REGISTERING) return;
    
    transitionTo(SETTINGS_STATES.REGISTERED, 'module_registered');
}

// =============================================
// HANDLE SESSION ACTIVE - STEP 3A
// =============================================
function handleSessionActive(message) {
    if (!message.session) return;
    
    updateSession(
        message.session.user,
        message.session.expiry || message.session.expiresAt,
        message.session.version || 1
    );
    
    parentSessionData = { user: message.session.user, token: null, expiry: message.session.expiry };
    parentSessionReceived = true;
    sessionValidated = true;
    
    transitionTo(SETTINGS_STATES.SESSION_RECEIVED, 'session_active');
    
    IframeTransport.completeHandshake();
}

// =============================================
// HANDLE SESSION NULL - STEP 3B
// =============================================
function handleSessionNull() {
    clearSession();
    parentSessionReceived = false;
    sessionValidated = false;
    
    transitionTo(SETTINGS_STATES.SESSION_RECEIVED, 'session_null');
    
    IframeTransport.completeHandshake();
    
    disableSettingsControls();
}

// =============================================
// HANDLE PARENT READY - STEP 4
// =============================================
function handleParentReady(message) {
    parentReady = true;
    parentReadyReceived = true;
    parentCommunicationReady = true;
    
    if (currentState !== SETTINGS_STATES.SESSION_RECEIVED) return;
    
    if (isSessionValid()) {
        transitionTo(SETTINGS_STATES.ACTIVE, 'parent_ready_with_session');
        
        HeartbeatManager.start();
        
        loadSettingsFromAPI();
    } else {
        disableSettingsControls();
    }
}

// =============================================
// HANDLE SESSION REFRESHED
// =============================================
function handleSessionRefreshed(message) {
    if (!message.session) return;
    
    updateSession(
        message.session.user,
        message.session.expiry || message.session.expiresAt,
        message.session.version || (session.version + 1)
    );
    
    parentSessionData = { user: message.session.user, token: null, expiry: message.session.expiry };
    parentSessionReceived = true;
    sessionValidated = true;
    
    if (currentState === SETTINGS_STATES.DEGRADED) {
        transitionTo(SETTINGS_STATES.SESSION_RECEIVED, 'session_refreshed');
        
        if (parentReady) {
            transitionTo(SETTINGS_STATES.ACTIVE, 'session_refreshed_with_parent_ready');
            HeartbeatManager.start();
            loadSettingsFromAPI();
        }
    }
}

// =============================================
// HANDLE SESSION INVALIDATED
// =============================================
function handleSessionInvalidated() {
    clearSession();
    parentSessionReceived = false;
    sessionValidated = false;
    
    disableSettingsControls();
    HeartbeatManager.stop();
    
    if (currentState === SETTINGS_STATES.READY || currentState === SETTINGS_STATES.ACTIVE) {
        transitionTo(SETTINGS_STATES.DEGRADED, 'session_invalidated');
    }
}

// =============================================
// LOAD SETTINGS FROM API
// =============================================
async function loadSettingsFromAPI() {
    if (currentState !== SETTINGS_STATES.ACTIVE) return;
    
    try {
        const verified = await verifySessionWithParent();
        if (!verified) {
            transitionTo(SETTINGS_STATES.DEGRADED, 'session_verification_failed');
            return;
        }
        
        const response = await ApiCore.request('/api/settings', { method: 'GET' });
        
        if (response.success && response.data) {
            const settingsData = response.data.settings || response.data;
            
            if (settingsData) {
                userSettings = settingsData;
                coreData.settings = settingsData;
                
                Object.keys(DEFAULT_SETTINGS).forEach(section => {
                    if (!userSettings[section]) {
                        userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
                    }
                });
                
                SafeStorage.setJSON('user_settings', userSettings);
                
                if (userSettings.appearance) {
                    applyTheme(userSettings.appearance.theme || 'auto');
                }
                
                if (userSettings.notifications) {
                    applyNotificationPreferences(userSettings.notifications);
                }
                
                if (userSettings.privacy) {
                    applyPrivacySettings(userSettings.privacy);
                }
                
                transitionTo(SETTINGS_STATES.READY, 'settings_loaded');
                isReady = true;
                
                sendToParent({
                    type: 'SETTINGS_READY',
                    timestamp: Date.now()
                }, 0, false);
                
                dispatchSettingsLoadedEvent();
            }
        } else {
            const cached = SafeStorage.getJSON('user_settings', null);
            if (cached) {
                userSettings = cached;
                coreData.settings = cached;
                
                if (userSettings.appearance) {
                    applyTheme(userSettings.appearance.theme || 'auto');
                }
                
                transitionTo(SETTINGS_STATES.READY, 'cached_settings_loaded');
                isReady = true;
            } else {
                userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                
                if (userSettings.appearance) {
                    applyTheme(userSettings.appearance.theme || 'auto');
                }
                
                transitionTo(SETTINGS_STATES.READY, 'default_settings_loaded');
                isReady = true;
            }
        }
    } catch (error) {
        transitionTo(SETTINGS_STATES.DEGRADED, 'settings_load_failed');
    }
}

// =============================================
// VERIFY SESSION WITH PARENT
// =============================================
async function verifySessionWithParent() {
    if (!isSessionValid()) return false;
    
    const requestId = generateRequestId();
    
    try {
        const response = await sendToParent({
            type: 'VERIFY_SESSION',
            sessionVersion: session.version,
            requestId: requestId,
            timestamp: Date.now()
        }, 0, true);
        
        if (response && response.payload && response.payload.verified) {
            return true;
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

// =============================================
// DISABLE SETTINGS CONTROLS
// =============================================
function disableSettingsControls() {
    const event = new CustomEvent('settingsControlsDisabled', {
        detail: {
            timestamp: Date.now(),
            reason: 'no_session'
        }
    });
    window.dispatchEvent(event);
}

// =============================================
// APPLY THEME
// =============================================
function applyTheme(theme) {
    if (!theme) return;
    
    try {
        const root = document.documentElement;
        
        if (theme === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } else {
            root.setAttribute('data-theme', theme);
        }
        
        const event = new CustomEvent('themeApplied', {
            detail: { theme, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

// =============================================
// APPLY NOTIFICATION PREFERENCES
// =============================================
function applyNotificationPreferences(notifications) {
    if (!notifications) return;
    
    try {
        const event = new CustomEvent('notificationPreferencesApplied', {
            detail: { preferences: notifications, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

// =============================================
// APPLY PRIVACY SETTINGS
// =============================================
function applyPrivacySettings(privacy) {
    if (!privacy) return;
    
    try {
        const event = new CustomEvent('privacySettingsApplied', {
            detail: { settings: privacy, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

// =============================================
// DISPATCH SETTINGS LOADED EVENT
// =============================================
function dispatchSettingsLoadedEvent() {
    try {
        const event = new CustomEvent('settingsLoaded', {
            detail: {
                settings: userSettings,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

// =============================================
// HANDLE SETTINGS UPDATED BROADCAST
// =============================================
function handleSettingsUpdatedBroadcast(message) {
    if (!validateMessage(message)) return;
    
    if (message.source === FRAME_ID) return;
    
    if (message.payload && message.payload.settings) {
        userSettings = message.payload.settings;
        coreData.settings = message.payload.settings;
        
        if (message.payload.settings.appearance) {
            applyTheme(message.payload.settings.appearance.theme || 'auto');
        }
        
        SafeStorage.setJSON('user_settings', userSettings);
        
        const event = new CustomEvent('settingsUpdated', {
            detail: {
                source: 'broadcast',
                settings: message.payload.settings,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    }
}

// =============================================
// UPDATE SETTING - WITH VERIFICATION
// =============================================
export async function updateSetting(section, key, value) {
    if (currentState !== SETTINGS_STATES.READY) {
        throw new Error('Settings not ready');
    }
    
    if (!isSessionValid()) {
        throw new Error('No valid session');
    }
    
    const verified = await verifySessionWithParent();
    if (!verified) {
        transitionTo(SETTINGS_STATES.DEGRADED, 'session_verification_failed');
        throw new Error('Session verification failed');
    }
    
    const oldValue = userSettings[section]?.[key];
    if (!userSettings[section]) {
        userSettings[section] = {};
    }
    userSettings[section][key] = value;
    unsavedChanges = true;
    
    const optimisticEvent = new CustomEvent('settingUpdatedOptimistic', {
        detail: { section, key, value, timestamp: Date.now() }
    });
    window.dispatchEvent(optimisticEvent);
    
    try {
        const response = await ApiCore.request('/api/settings', {
            method: 'POST',
            body: { settings: userSettings }
        });
        
        if (response.success) {
            unsavedChanges = false;
            
            SafeStorage.setJSON('user_settings', userSettings);
            coreData.settings = userSettings;
            
            if (section === 'appearance' && key === 'theme') {
                applyTheme(value);
            }
            
            await sendToParent({
                type: PARENT_MESSAGE_TYPES.SETTINGS_UPDATED,
                section: section,
                key: key,
                value: value,
                settings: userSettings,
                timestamp: Date.now()
            }, 0, true);
            
            const successEvent = new CustomEvent('settingUpdated', {
                detail: { section, key, value, timestamp: Date.now() }
            });
            window.dispatchEvent(successEvent);
            
            return true;
        } else {
            if (userSettings[section]) {
                userSettings[section][key] = oldValue;
            }
            unsavedChanges = false;
            
            const rollbackEvent = new CustomEvent('settingUpdateFailed', {
                detail: { section, key, timestamp: Date.now() }
            });
            window.dispatchEvent(rollbackEvent);
            
            throw new Error('API update failed');
        }
    } catch (error) {
        if (userSettings[section]) {
            userSettings[section][key] = oldValue;
        }
        unsavedChanges = false;
        throw error;
    }
}

// =============================================
// SAVE ALL SETTINGS
// =============================================
export async function saveSettings() {
    if (currentState !== SETTINGS_STATES.READY) {
        throw new Error('Settings not ready');
    }
    
    if (!isSessionValid()) {
        throw new Error('No valid session');
    }
    
    const verified = await verifySessionWithParent();
    if (!verified) {
        transitionTo(SETTINGS_STATES.DEGRADED, 'session_verification_failed');
        throw new Error('Session verification failed');
    }
    
    try {
        SafeStorage.setJSON('user_settings', userSettings);
        coreData.settings = userSettings;
        
        const response = await ApiCore.request('/api/settings', {
            method: 'POST',
            body: { settings: userSettings }
        });
        
        if (response.success) {
            unsavedChanges = false;
            
            if (userSettings.appearance) {
                applyTheme(userSettings.appearance.theme || 'auto');
            }
            
            await sendToParent({
                type: PARENT_MESSAGE_TYPES.SETTINGS_UPDATED,
                settings: userSettings,
                timestamp: Date.now()
            }, 0, true);
            
            const event = new CustomEvent('settingsSaved', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        throw new Error('API update failed');
    } catch (error) {
        throw error;
    }
}

// =============================================
// HANDLE LOGOUT
// =============================================
export async function handleLogout() {
    if (currentState !== SETTINGS_STATES.READY) {
        return false;
    }
    
    if (!isSessionValid()) {
        return false;
    }
    
    try {
        await verifySessionWithParent();
        
        const response = await ApiCore.request('/api/auth/logout', {
            method: 'POST'
        });
        
        if (response.success) {
            await sendToParent({
                type: PARENT_MESSAGE_TYPES.SESSION_INVALIDATED,
                timestamp: Date.now()
            }, 0, true);
            
            clearSession();
            parentSessionReceived = false;
            sessionValidated = false;
            
            HeartbeatManager.stop();
            disableSettingsControls();
            
            transitionTo(SETTINGS_STATES.DEGRADED, 'user_logout');
            
            const event = new CustomEvent('userLoggedOut', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

// =============================================
// LOAD FROM LOCAL STORAGE (CACHE ONLY)
// =============================================
export async function loadFromLocalStorage() {
    try {
        const cachedUser = SafeStorage.getJSON('current_user', null);
        if (cachedUser) {
            currentUser = cachedUser;
            coreData.user = cachedUser;
        }
        
        const savedSettings = SafeStorage.getJSON('user_settings', null);
        if (savedSettings) {
            userSettings = savedSettings;
            coreData.settings = savedSettings;
        } else {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
        
        Object.keys(DEFAULT_SETTINGS).forEach(section => {
            if (!userSettings[section]) {
                userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
            }
        });
        
        calculateStorageUsage();
        return true;
    } catch (error) {
        userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        currentUser = { displayName: 'User', id: 'local-user' };
        coreData.user = { displayName: 'User', id: 'local-user' };
        return false;
    }
}

// =============================================
// UPDATE USER UI
// =============================================
export function updateUserUI() {
    try {
        const event = new CustomEvent('userUIUpdate', {
            detail: {
                user: currentUser,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// INITIALIZE UI
// =============================================
export function initializeUI() {
    try {
        const event = new CustomEvent('coreUIInitialized', {
            detail: {
                timestamp: Date.now(),
                mode: isSessionValid() ? 'authenticated' : 'no_session',
                user: currentUser,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// CALCULATE STORAGE USAGE
// =============================================
export function calculateStorageUsage() {
    try {
        if (!userSettings || !userSettings.storage) return 0;
        const chatSize = userSettings.storage.storageBreakdown?.chats || 0;
        const mediaSize = userSettings.storage.storageBreakdown?.media || 0;
        const otherSize = userSettings.storage.storageBreakdown?.other || 0;
        userSettings.storage.totalStorageUsed = chatSize + mediaSize + otherSize;
        userSettings.storage.chatCacheSize = chatSize;
        userSettings.storage.mediaCacheSize = mediaSize;
        userSettings.storage.otherCacheSize = otherSize;
        return userSettings.storage.totalStorageUsed;
    } catch (error) {
        return 0;
    }
}

// =============================================
// FORMAT STORAGE SIZE
// =============================================
export function formatStorageSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// =============================================
// GET MOOD TEXT
// =============================================
export function getMoodText(mood) {
    const moodTexts = {
        neutral: 'Neutral',
        happy: 'Happy',
        calm: 'Calm',
        energetic: 'Energetic',
        focused: 'Focused',
        relaxed: 'Relaxed',
        stressed: 'Stressed',
        tired: 'Tired',
        excited: 'Excited'
    };
    return moodTexts[mood] || 'Neutral';
}

// =============================================
// GET MOOD COLOR
// =============================================
export function getMoodColor(mood) {
    const colors = {
        neutral: '#A9A9A9',
        happy: '#FFD700',
        calm: '#4A90E2',
        energetic: '#FF6B6B',
        focused: '#7B68EE',
        relaxed: '#4ECDC4',
        stressed: '#FF8C00',
        tired: '#808080',
        excited: '#FF1493'
    };
    return colors[mood] || '#A9A9A9';
}

// =============================================
// LOAD SECTION
// =============================================
export async function loadSection(sectionId) {
    currentSection = sectionId;
    
    const event = new CustomEvent('settingsSectionChanged', {
        detail: {
            section: sectionId,
            timestamp: Date.now(),
            authenticated: isSessionValid()
        }
    });
    window.dispatchEvent(event);
    
    if (currentState === SETTINGS_STATES.READY && isSessionValid()) {
        try {
            switch(sectionId) {
                case 'profile':
                    await loadUserData();
                    break;
                case 'security':
                    await loadActiveSessions();
                    break;
                case 'privacy':
                    await loadBlockedUsers();
                    break;
                case 'friends':
                    await loadUserContacts();
                    break;
                case 'groups':
                    await loadUserGroups();
                    break;
                default:
                    break;
            }
        } catch (error) {
            if (DEBUG) debugLog(`Error loading section ${sectionId}:`, error);
        }
    }
    
    return true;
}

// =============================================
// LOAD USER DATA
// =============================================
async function loadUserData() {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/user/profile', { method: 'GET' });
        if (response.success && response.data) {
            const user = response.data.user || response.data;
            if (user) {
                currentUser = user;
                coreData.user = user;
                SafeStorage.setJSON('current_user', currentUser);
                updateUserUI();
            }
        }
    } catch (error) {}
}

// =============================================
// LOAD ACTIVE SESSIONS
// =============================================
async function loadActiveSessions() {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/auth/sessions', { method: 'GET' });
        if (response.success && response.data) {
            activeSessions = response.data.sessions || response.data || [];
            
            const event = new CustomEvent('activeSessionsLoaded', {
                detail: { sessions: activeSessions, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {}
}

// =============================================
// LOAD BLOCKED USERS
// =============================================
async function loadBlockedUsers() {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/users/blocked', { method: 'GET' });
        if (response.success && response.data) {
            blockedUsers = response.data.blockedUsers || response.data || [];
            
            const event = new CustomEvent('blockedUsersLoaded', {
                detail: { users: blockedUsers, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {}
}

// =============================================
// LOAD USER CONTACTS
// =============================================
async function loadUserContacts() {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/contacts', { method: 'GET' });
        if (response.success && response.data) {
            userContacts = response.data.contacts || response.data || [];
            
            const event = new CustomEvent('userContactsLoaded', {
                detail: { contacts: userContacts, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {}
}

// =============================================
// LOAD USER GROUPS
// =============================================
async function loadUserGroups() {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/group', { method: 'GET' });
        if (response.success && response.data) {
            userGroups = response.data.groups || response.data || [];
            coreData.groupsList = userGroups;
            
            const event = new CustomEvent('userGroupsLoaded', {
                detail: { groups: userGroups, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {}
}

// =============================================
// TERMINATE SESSION
// =============================================
export async function terminateSession(sessionId) {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/auth/terminate-session', {
            method: 'POST',
            body: { sessionId }
        });
        
        if (response.success) {
            await loadActiveSessions();
            
            await sendToParent({
                type: PARENT_MESSAGE_TYPES.SESSION_TERMINATED,
                sessionId,
                timestamp: Date.now()
            }, 0, false);
            
            const event = new CustomEvent('sessionTerminated', {
                detail: { sessionId, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// TERMINATE ALL SESSIONS
// =============================================
export async function terminateAllSessions() {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/auth/terminate-all-sessions', {
            method: 'POST'
        });
        
        if (response.success) {
            await loadActiveSessions();
            
            await sendToParent({
                type: PARENT_MESSAGE_TYPES.ALL_SESSIONS_TERMINATED,
                timestamp: Date.now()
            }, 0, false);
            
            const event = new CustomEvent('allSessionsTerminated', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// UNBLOCK USER
// =============================================
export async function unblockUser(userId) {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/users/unblock', {
            method: 'POST',
            body: { userId }
        });
        
        if (response.success) {
            await loadBlockedUsers();
            
            await sendToParent({
                type: PARENT_MESSAGE_TYPES.USER_UNBLOCKED,
                userId,
                timestamp: Date.now()
            }, 0, false);
            
            const event = new CustomEvent('userUnblocked', {
                detail: { userId, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// CLEAR CHAT CACHE
// =============================================
export async function clearChatCache() {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/storage/clear-chat-cache', {
            method: 'POST'
        });
        
        if (response.success && userSettings.storage) {
            userSettings.storage.storageBreakdown.chats = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.media || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
            calculateStorageUsage();
            unsavedChanges = true;
            
            await sendToParent({
                type: PARENT_MESSAGE_TYPES.CACHE_CLEARED,
                cacheType: 'chat',
                timestamp: Date.now()
            }, 0, false);
            
            const event = new CustomEvent('chatCacheCleared', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// CLEAR MEDIA CACHE
// =============================================
export async function clearMediaCache() {
    if (currentState !== SETTINGS_STATES.READY || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/storage/clear-media-cache', {
            method: 'POST'
        });
        
        if (response.success && userSettings.storage) {
            userSettings.storage.storageBreakdown.media = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.chats || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
            calculateStorageUsage();
            unsavedChanges = true;
            
            await sendToParent({
                type: PARENT_MESSAGE_TYPES.CACHE_CLEARED,
                cacheType: 'media',
                timestamp: Date.now()
            }, 0, false);
            
            const event = new CustomEvent('mediaCacheCleared', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// SHOW ACTIVE SESSIONS
// =============================================
export function showActiveSessions() {
    try {
        const event = new CustomEvent('showSessions', {
            detail: {
                sessions: activeSessions,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SHOW BLOCKED USERS
// =============================================
export function showBlockedUsers() {
    try {
        const event = new CustomEvent('showBlockedUsers', {
            detail: {
                users: blockedUsers,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// NOTIFY PARENT AUTH STATE
// =============================================
export function notifyParentAuthState(hasAuth) {
    try {
        sendToParent({
            type: 'IFRAME_AUTH_STATE',
            hasAuth: hasAuth,
            iframeId: FRAME_ID,
            timestamp: Date.now()
        }, 0, false);
    } catch (error) {}
}

// =============================================
// NOTIFY PARENT AUTH ERROR
// =============================================
export function notifyParentAuthError() {
    if (authErrorNotified) return;
    try {
        sendToParent({
            type: 'IFRAME_AUTH_ERROR',
            iframeId: FRAME_ID,
            message: 'Authentication required',
            tokenExpired: true,
            timestamp: Date.now()
        }, 0, false);
        authErrorNotified = true;
    } catch (error) {}
}

// =============================================
// GET SECURE TOKEN - ALWAYS FROM PARENT
// =============================================
export function getSecureToken() {
    return null;
}

// =============================================
// SECURE FETCH WRAPPER - ROUTES THROUGH PARENT
// =============================================
export async function secureFetchWrapper(endpoint, method = 'GET', data = null, options = {}) {
    try {
        const response = await sendToParent({
            type: 'API_REQUEST',
            endpoint: endpoint,
            method: method,
            data: data,
            options: options,
            timestamp: Date.now()
        }, 0, true);
        
        if (response && response.payload) {
            return response.payload;
        }
        
        return { success: false, data: null };
        
    } catch (error) {
        return {
            success: false,
            status: 'error',
            message: 'Request failed',
            data: null
        };
    }
}

// =============================================
// WAIT FOR TOKEN - ALWAYS FALSE
// =============================================
export async function waitForToken(timeout = 10000) {
    return false;
}

// =============================================
// START PASSIVE AUTH MONITORING - DISABLED
// =============================================
export function startPassiveAuthMonitoring() {}

// =============================================
// START BACKGROUND TASKS
// =============================================
export function startBackgroundTasks() {
    try {
        if (backgroundTasksStarted) return;
        if (!isSessionValid() && currentState !== SETTINGS_STATES.READY) return;
        
        backgroundTasksStarted = true;
        
        Promise.allSettled([
            loadUserData(),
            loadActiveSessions(),
            loadBlockedUsers(),
            loadUserContacts(),
            loadUserGroups()
        ]).then(() => {}).catch(() => {});
    } catch (error) {
        backgroundTasksStarted = false;
    }
}

// =============================================
// SAFE LOAD USER DATA
// =============================================
export async function safeLoadUserData() {
    if (!isSessionValid() && currentState !== SETTINGS_STATES.READY) {
        return null;
    }
    
    try {
        if (session.user) {
            currentUser = session.user;
            coreData.user = session.user;
            SafeStorage.setJSON('current_user', currentUser);
            return currentUser;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD SETTINGS
// =============================================
export async function safeLoadSettings() {
    if (!isSessionValid() && currentState !== SETTINGS_STATES.READY) {
        return null;
    }
    
    try {
        const response = await secureFetchWrapper('/api/settings', 'GET');
        const settingsData = response?.data || response?.settings || null;
        
        if (settingsData) {
            userSettings = settingsData;
            coreData.settings = settingsData;
            
            Object.keys(DEFAULT_SETTINGS).forEach(section => {
                if (!userSettings[section]) {
                    userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
                }
            });
            
            SafeStorage.setJSON('user_settings', userSettings);
            calculateStorageUsage();
            return userSettings;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD BLOCKED USERS
// =============================================
export async function safeLoadBlockedUsers() {
    if (!isSessionValid() && currentState !== SETTINGS_STATES.READY) return null;
    
    try {
        const response = await secureFetchWrapper('/api/users/blocked', 'GET');
        const blockedData = response?.data?.blockedUsers || response?.blockedUsers || [];
        if (blockedData) {
            blockedUsers = blockedData;
            return blockedUsers;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD ACTIVE SESSIONS
// =============================================
export async function safeLoadActiveSessions() {
    if (!isSessionValid() && currentState !== SETTINGS_STATES.READY) return null;
    
    try {
        const response = await secureFetchWrapper('/api/auth/sessions', 'GET');
        const sessionsData = response?.data?.sessions || response?.sessions || [];
        if (sessionsData) {
            activeSessions = sessionsData;
            return activeSessions;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD USER CONTACTS
// =============================================
export async function safeLoadUserContacts() {
    if (!isSessionValid() && currentState !== SETTINGS_STATES.READY) return null;
    
    try {
        const response = await secureFetchWrapper('/api/contacts', 'GET');
        const contactsData = response?.data?.contacts || response?.contacts || [];
        if (contactsData) {
            userContacts = contactsData;
            return userContacts;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD USER GROUPS
// =============================================
export async function safeLoadUserGroups() {
    if (!isSessionValid() && currentState !== SETTINGS_STATES.READY) return null;
    
    try {
        const response = await secureFetchWrapper('/api/group', 'GET');
        const groupsData = response?.data?.groups || response?.groups || [];
        if (groupsData) {
            userGroups = groupsData;
            coreData.groupsList = groupsData;
            return userGroups;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// MAKE SAFE REQUEST
// =============================================
export async function makeSafeRequest(endpoint, method = 'GET', data = null, options = {}) {
    if (!isSessionValid() && currentState !== SETTINGS_STATES.READY) {
        throw new Error('Authentication not available');
    }
    return await secureFetchWrapper(endpoint, method, data, options);
}

// =============================================
// INITIALIZE CORE - MAIN ENTRY POINT
// =============================================
export async function initializeCore(options = {}) {
    if (initializationPromise) {
        return initializationPromise;
    }
    
    if (currentState !== SETTINGS_STATES.INIT) {
        return { success: true, state: currentState };
    }
    
    initializationPromise = (async () => {
        initializationInProgress = true;
        coreError = null;
        
        const {
            debug = DEBUG
        } = options;
        
        if (debug) {
            Log.enableDebug();
        }
        
        try {
            await loadFromLocalStorage();
            
            setupMessageHandlers();
            
            registerWithParent();
            
            return new Promise((resolve) => {
                const checkInterval = safeSetInterval(() => {
                    if (currentState === SETTINGS_STATES.READY) {
                        clearInterval(checkInterval);
                        activeIntervals.delete(checkInterval);
                        initializationInProgress = false;
                        initializationPromise = null;
                        resolve({ 
                            success: true, 
                            state: currentState, 
                            authenticated: isSessionValid() 
                        });
                    } else if (currentState === SETTINGS_STATES.DEGRADED) {
                        clearInterval(checkInterval);
                        activeIntervals.delete(checkInterval);
                        initializationInProgress = false;
                        initializationPromise = null;
                        resolve({ 
                            success: true, 
                            state: currentState, 
                            authenticated: false 
                        });
                    }
                }, 50);
                activeIntervals.add(checkInterval);
                
                safeSetTimeout(() => {
                    clearInterval(checkInterval);
                    activeIntervals.delete(checkInterval);
                    initializationInProgress = false;
                    initializationPromise = null;
                    if (currentState === SETTINGS_STATES.INIT || currentState === SETTINGS_STATES.REGISTERING) {
                        transitionTo(SETTINGS_STATES.DEGRADED, 'initialization_timeout');
                    }
                    resolve({ success: true, state: currentState, authenticated: false });
                }, 5000);
            });
            
        } catch (error) {
            coreError = error;
            initializationInProgress = false;
            initializationPromise = null;
            transitionTo(SETTINGS_STATES.DEGRADED, error.message);
            
            return {
                success: false,
                state: currentState,
                error: error.message
            };
        }
    })();
    
    return initializationPromise;
}

// =============================================
// SETUP MESSAGE HANDLERS
// =============================================
function setupMessageHandlers() {
    IframeTransport.on('MODULE_REGISTERED', (message) => {
        handleModuleRegistered(message);
    });
    
    IframeTransport.on('SESSION_ACTIVE', (message) => {
        handleSessionActive(message);
    });
    
    IframeTransport.on('SESSION_NULL', () => {
        handleSessionNull();
    });
    
    IframeTransport.on('SESSION_REFRESHED', (message) => {
        handleSessionRefreshed(message);
    });
    
    IframeTransport.on('SESSION_INVALIDATED', () => {
        handleSessionInvalidated();
    });
    
    IframeTransport.on('PARENT_READY', (message) => {
        handleParentReady(message);
    });
    
    IframeTransport.on('SETTINGS_UPDATED', (message) => {
        handleSettingsUpdatedBroadcast(message);
    });
    
    IframeTransport.on('SESSION_VERIFIED', (message) => {
        if (DEBUG) debugLog('Session verified by parent');
    });
    
    IframeTransport.on('ACK', (message) => {
        if (message.inResponseTo && message.inResponseTo.includes('HEARTBEAT')) {
            HeartbeatManager.handleAck();
        }
    });
}

// =============================================
// SHUTDOWN CORE
// =============================================
export function shutdownCore() {
    try {
        HeartbeatManager.stop();
        clearAllTimers();
        
        sendToParent({
            type: 'SHUTDOWN',
            reason: 'normal_shutdown',
            timestamp: Date.now()
        }, 0, false).catch(() => {});
        
        currentState = SETTINGS_STATES.INIT;
        isReady = false;
        initializationInProgress = false;
        parentReady = false;
        parentReadyReceived = false;
        parentCommunicationReady = false;
        parentSessionReceived = false;
        sessionValidated = false;
        authReady = false;
        tokenReady = false;
        tokenAvailable = false;
        backgroundTasksStarted = false;
        clearSession();
        
        window.__SETTINGS_STATE__ = currentState;
        window.__SETTINGS_SESSION_ACTIVE__ = false;
        window.__SETTINGS_READY__ = false;
        
        stateHistory = [];
        
        if (DEBUG) debugLog('Core shutdown complete');
        return true;
        
    } catch (error) {
        return false;
    }
}

// =============================================
// VERIFY PARENT PRESENCE
// =============================================
export function verifyParentPresence() {
    return OriginAdapter.isParentVerified();
}

// =============================================
// SETUP SECURE MESSAGING CHANNEL
// =============================================
export function setupSecureMessagingChannel() {
    return true;
}

// =============================================
// RESET UI FOR LOGOUT
// =============================================
export function resetUIForLogout() {
    try {
        clearSession();
        parentSessionReceived = false;
        sessionValidated = false;
        parentReady = false;
        parentReadyReceived = false;
        parentCommunicationReady = false;
        
        if (currentState === SETTINGS_STATES.READY || currentState === SETTINGS_STATES.ACTIVE) {
            transitionTo(SETTINGS_STATES.DEGRADED, 'ui_logout');
        }
        
        HeartbeatManager.stop();
        
        const event = new CustomEvent('uiResetForLogout', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
        
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SHOW RECONNECTION STATE
// =============================================
export function showReconnectionState() {
    try {
        const event = new CustomEvent('coreReconnecting', {
            detail: {
                timestamp: Date.now(),
                state: currentState,
                connectionQuality: state.connectionQuality,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// GET CORE DIAGNOSTICS
// =============================================
export function getCoreDiagnostics() {
    return DiagnosticsAgent.getFullReport();
}

// =============================================
// CHECK AUTHENTICATION STATE
// =============================================
export function checkAuthenticationState() {
    return isSessionValid();
}

// =============================================
// BOOTSTRAP IFRAME
// =============================================
export async function bootstrapIframe() {
    try {
        IframeEnvironment.detect();
        CompatibilityBridge.detect();
        OriginAdapter.init();
        await loadFromLocalStorage();
        
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// WAIT FOR SESSION
// =============================================
export async function waitForSession(timeout = 10000) {
    return new Promise((resolve) => {
        if (isSessionValid()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = safeSetInterval(() => {
            try {
                if (isSessionValid()) {
                    clearInterval(checkInterval);
                    activeIntervals.delete(checkInterval);
                    clearTimeout(timeoutId);
                    activeTimers.delete(timeoutId);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    activeIntervals.delete(checkInterval);
                    resolve(false);
                }
            } catch (error) {
                clearInterval(checkInterval);
                activeIntervals.delete(checkInterval);
                resolve(false);
            }
        }, 100);
        activeIntervals.add(checkInterval);
        const timeoutId = safeSetTimeout(() => {
            clearInterval(checkInterval);
            activeIntervals.delete(checkInterval);
            resolve(false);
        }, timeout);
        activeTimers.add(timeoutId);
    });
}

// =============================================
// INITIALIZE BASIC UI
// =============================================
export function initializeBasicUI() {
    try {
        if (!userSettings) {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = userSettings;
        }
        const event = new CustomEvent('basicUIReady', {
            detail: {
                timestamp: Date.now(),
                state: currentState,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SETUP BASIC EVENT LISTENERS
// =============================================
export function setupBasicEventListeners() {
    try {
        const backToAppBtn = document.getElementById('backToAppBtn');
        if (backToAppBtn) {
            const handler = () => {
                if (unsavedChanges) {
                    const event = new CustomEvent('confirmNavigation', {
                        detail: {
                            message: 'You have unsaved changes. Are you sure you want to leave?',
                            callback: () => {
                                sendToParent({
                                    type: 'CHILD_CLOSING',
                                    childId: FRAME_ID,
                                    timestamp: Date.now(),
                                    unsavedChanges: true
                                }, 0, false).catch(() => {});
                            }
                        }
                    });
                    window.dispatchEvent(event);
                } else {
                    sendToParent({
                        type: 'CHILD_CLOSING',
                        childId: FRAME_ID,
                        timestamp: Date.now()
                    }, 0, false).catch(() => {});
                }
            };
            backToAppBtn.addEventListener('click', handler);
        }
        
        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// START TOKEN MONITORING - DISABLED
// =============================================
export function startTokenMonitoring() {}

// =============================================
// CHECK TOKEN AVAILABILITY - DISABLED
// =============================================
export function checkTokenAvailability() {}

// =============================================
// NOTIFY TOKEN READY - DISABLED
// =============================================
export function notifyTokenReady() {}

// =============================================
// NOTIFY TOKEN LOST - DISABLED
// =============================================
export function notifyTokenLost() {}

// =============================================
// INTERNAL FUNCTIONS
// =============================================
function initTrustedOrigins() {
    try {
        trustedOrigins.add(window.location.origin);
        TRUSTED_ORIGINS.add(window.location.origin);
        ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000', 'http://127.0.0.1:3000'].forEach(origin => {
            trustedOrigins.add(origin);
            TRUSTED_ORIGINS.add(origin);
        });
        
        const hostname = window.location.hostname;
        if (hostname.includes('onrender.com')) {
            trustedOrigins.add(`https://${hostname}`);
            trustedOrigins.add(`http://${hostname}`);
            TRUSTED_ORIGINS.add(`https://${hostname}`);
            TRUSTED_ORIGINS.add(`http://${hostname}`);
        }
        
        if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.includes('onrender.com')) {
            trustedOrigins.add(`https://${hostname}`);
            trustedOrigins.add(`http://${hostname}`);
            TRUSTED_ORIGINS.add(`https://${hostname}`);
            TRUSTED_ORIGINS.add(`http://${hostname}`);
        }
    } catch (error) {}
}

function setupMessaging() {
    window.removeEventListener('message', handleIncomingMessage);
    window.addEventListener('message', handleIncomingMessage, false);
}

async function checkPermissions() {
    return isSessionValid();
}

async function loadDependencies() {
    return true;
}

async function loadAllData() {
    try {
        await loadData('settings', '/api/settings');
        await loadData('friendsList', '/api/friends');
        await loadData('groupsList', '/api/groups');
        await loadData('notifications', '/api/notifications');
        await loadData('chatHistory', '/api/chats/history');
    } catch (error) {}
}

async function loadData(dataType, endpoint) {
    try {
        if (!isSessionValid() && endpoint !== '/api/settings') {
            return;
        }
        const response = await secureFetchWrapper(endpoint, 'GET');
        if (response && response[dataType]) {
            coreData[dataType] = response[dataType];
            if (dataType === 'settings') {
                userSettings = response[dataType];
            }
        }
    } catch (error) {
        if (Array.isArray(coreData[dataType])) {
            coreData[dataType] = [];
        }
    }
}

function getEndpointForDataType(dataType) {
    const endpoints = {
        friendsList: '/api/friends',
        groupsList: '/api/groups',
        chatHistory: '/api/chats/history',
        notifications: '/api/notifications',
        settings: '/api/settings'
    };
    return endpoints[dataType] || '/api/data/' + dataType;
}

function validateAllData() {
    try {
        let valid = true;
        Object.keys(coreData).forEach(key => {
            if (coreData[key] === undefined) {
                if (Array.isArray(coreData[key])) coreData[key] = [];
                if (typeof coreData[key] === 'object' && coreData[key] !== null) coreData[key] = {};
                valid = false;
            }
        });
        return valid;
    } catch (error) {
        return false;
    }
}

function syncWithGlobalState() {
    try {
        if (coreData.user) currentUser = coreData.user;
        if (coreData.settings) userSettings = coreData.settings;
        if (coreData.groupsList) userGroups = coreData.groupsList;
        try {
            if (currentUser) SafeStorage.setJSON('current_user', currentUser);
            if (userSettings) SafeStorage.setJSON('user_settings', userSettings);
        } catch (e) {}
    } catch (error) {}
}

function processMessageQueue() {
    try {
        while (messageQueue.length > 0 && isReady) {
            const { message, event } = messageQueue.shift();
            handleIncomingMessage(event);
        }
    } catch (error) {}
}

function dispatchDataReadyEvent() {
    try {
        const event = new CustomEvent('coreDataReady', {
            detail: {
                data: coreData,
                timestamp: Date.now(),
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

function dispatchDataUpdatedEvent(dataType) {
    try {
        const event = new CustomEvent('coreDataUpdated', {
            detail: {
                dataType: dataType,
                data: coreData[dataType],
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

function notifyParentReady() {
    try {
        if (window.parent !== window) {
            sendToParent({
                type: 'CORE_READY',
                payload: {
                    iframeId: FRAME_ID,
                    status: 'success',
                    dataTypes: Object.keys(coreData).filter(key => coreData[key] !== null),
                    timestamp: Date.now(),
                    state: currentState
                }
            }, 0, false).catch(() => {});
        }
    } catch (error) {}
}

function notifyParentError(error) {
    try {
        if (window.parent !== window) {
            sendToParent({
                type: 'ERROR',
                payload: {
                    iframeId: FRAME_ID,
                    message: error.message,
                    timestamp: Date.now()
                }
            }, 0, false).catch(() => {});
        }
    } catch (error) {}
}

export function getData(dataType) {
    try {
        if (!isReady) {
            throw new Error('Core not ready');
        }
        if (!coreData.hasOwnProperty(dataType)) {
            throw new Error(`Unknown data type: ${dataType}`);
        }
        return JSON.parse(JSON.stringify(coreData[dataType]));
    } catch (error) {
        return null;
    }
}

export function updateData(dataType, payload) {
    try {
        if (!isReady) {
            throw new Error('Core not ready');
        }
        if (!coreData.hasOwnProperty(dataType)) {
            throw new Error(`Unknown data type: ${dataType}`);
        }
        if (Array.isArray(coreData[dataType])) {
            if (Array.isArray(payload)) {
                coreData[dataType] = payload;
            } else {
                const index = coreData[dataType].findIndex(item => item.id === payload.id);
                if (index !== -1) {
                    coreData[dataType][index] = { ...coreData[dataType][index], ...payload };
                } else {
                    coreData[dataType].push(payload);
                }
            }
        } else if (typeof coreData[dataType] === 'object' && coreData[dataType] !== null) {
            coreData[dataType] = { ...coreData[dataType], ...payload };
        } else {
            coreData[dataType] = payload;
        }
        syncWithGlobalState();
        dispatchDataUpdatedEvent(dataType);
        return true;
    } catch (error) {
        return false;
    }
}

function getDefaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function executeReadyCallbacks() {
    state.readyCallbacks.forEach(cb => {
        try {
            cb(state);
        } catch (e) {}
    });
    state.readyCallbacks = [];
}

export function onReady(callback) {
    if (isReady) {
        callback(state);
    } else {
        state.readyCallbacks.push(callback);
    }
}

// =============================================
// MESSAGE HANDLER - LEGACY SUPPORT
// =============================================
function handleIncomingMessage(event) {
    try {
        if (!OriginAdapter.isTrusted(event.origin)) {
            if (!untrustedOriginLogged) {
                untrustedOriginLogged = true;
                if (DEBUG) debugLog('Untrusted origin:', event.origin);
            }
            return;
        }
        
        if (event.source !== IframeTransport._parentWindow && event.source !== window.parent) {
            return;
        }
        
        let message = event.data;
        if (!message || typeof message !== 'object' || !message.type) {
            return;
        }
        
        if (isMessageDuplicate(message.requestId || message.messageId, message.type)) {
            return;
        }
        
        if (CompatibilityBridge.isEnabled()) {
            message = CompatibilityBridge.translateIncoming(message);
        }
        
        receiveLog(message.type);
        Log.trackReceive();
        
        if (message.type === 'ACK' && message.inResponseTo) {
            const pending = state.pendingAcks.get(message.inResponseTo);
            if (pending) {
                clearTimeout(pending.timeout);
                activeTimers.delete(pending.timeout);
                state.health.acksReceived++;
                pending.resolve({ acknowledged: true, ...message });
                state.pendingAcks.delete(message.inResponseTo);
            }
            return;
        }
        
        if (message.type === 'PONG') {
            state.health.lastPong = Date.now();
            state.health.pingFailures = 0;
            state.connectionQuality = 'good';
            if (state.pongTimeout) {
                clearTimeout(state.pongTimeout);
                activeTimers.delete(state.pongTimeout);
                state.pongTimeout = null;
            }
            return;
        }
        
        if (message.requestId && state.processedMessageIds.has(message.requestId)) {
            return;
        }
        
        if (message.requestId) {
            state.processedMessageIds.add(message.requestId);
            if (state.processedMessageIds.size > 100) {
                const ids = Array.from(state.processedMessageIds);
                state.processedMessageIds = new Set(ids.slice(-50));
            }
        }
        
        if (!isReady && message.type !== 'INIT' && message.type !== 'SESSION_RESPONSE') {
            messageQueue.push({ message, event });
            return;
        }
        
        const handlers = state.messageHandlers.get(message.type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message, event);
                } catch (error) {}
            });
        }
        
        switch (message.type) {
            case 'INIT':
                handleInitMessage(message);
                break;
            case 'SESSION_RESPONSE':
                handleSessionResponse(message);
                break;
            case 'SESSION_UPDATE':
                handleSessionUpdate(message);
                break;
            case 'LOGOUT':
                handleLogoutMessage();
                break;
            case 'PARENT_READY_ACK':
                parentReady = true;
                parentCommunicationReady = true;
                break;
            case 'AUTH_READY':
                authReady = true;
                break;
            case 'AUTH_LOST':
                authReady = false;
                tokenReady = false;
                tokenAvailable = false;
                backgroundTasksStarted = false;
                break;
            case 'USER_UPDATED':
                handleUserUpdated(message);
                break;
            case 'REFRESH_DATA':
                handleRefreshData(message);
                break;
            case 'UPDATE_DATA':
                handleUpdateData(message);
                break;
            case 'HEARTBEAT':
                sendToParent({
                    type: 'HEARTBEAT',
                    status: state.health.status,
                    timestamp: Date.now()
                }, 0, false).catch(() => {});
                break;
            case 'SHUTDOWN':
                shutdownCore();
                break;
            default:
                break;
        }
    } catch (error) {}
}

function handleInitMessage(message) {
    try {
        if (message.payload) {
            if (message.payload.session) {
                updateSession(
                    message.payload.session.user,
                    message.payload.session.expiry
                );
            }
            if (message.payload.settings) {
                coreData.settings = message.payload.settings;
                userSettings = message.payload.settings;
            }
        }
        sendToParent({
            type: 'INIT_ACK',
            timestamp: Date.now()
        }, 0, false).catch(() => {});
    } catch (error) {}
}

function handleSessionResponse(message) {
    try {
        if (!message.user && !message.session) {
            return;
        }
        const sessionData = {
            user: message.user || message.session?.user,
            expiry: message.expiry || message.session?.expiry
        };
        updateSession(
            sessionData.user,
            sessionData.expiry
        );
    } catch (error) {}
}

function handleSessionUpdate(message) {
    try {
        if (message.session) {
            updateSession(
                message.session.user,
                message.session.expiry
            );
        }
    } catch (error) {}
}

function handleLogoutMessage() {
    try {
        parentSessionData = null;
        parentSessionReceived = false;
        sessionValidated = false;
        clearSession();
        currentUser = null;
        coreData.user = null;
        tokenReady = false;
        tokenAvailable = false;
        authReady = false;
        backgroundTasksStarted = false;
        isReady = false;
        
        state.handshakeState = 'pending';
        parentReadyReceived = false;
        
        HeartbeatManager.stop();
        
        sendToParent({
            type: 'LOGOUT_CONFIRMED',
            timestamp: Date.now()
        }, 0, false).catch(() => {});
    } catch (error) {}
}

function handleUserUpdated(data) {
    try {
        if (data.user) {
            updateSession(data.user, null);
        }
    } catch (error) {}
}

async function handleRefreshData(message) {
    try {
        const dataType = message.payload?.dataType;
        if (dataType && coreData.hasOwnProperty(dataType)) {
            await loadData(dataType, getEndpointForDataType(dataType));
            syncWithGlobalState();
            sendToParent({
                type: 'DATA_REFRESHED',
                dataType: dataType,
                timestamp: Date.now()
            }, 0, false).catch(() => {});
            dispatchDataUpdatedEvent(dataType);
        } else {
            await loadAllData();
            syncWithGlobalState();
            sendToParent({
                type: 'ALL_DATA_REFRESHED',
                timestamp: Date.now()
            }, 0, false).catch(() => {});
            dispatchDataUpdatedEvent('all');
        }
    } catch (error) {
        sendToParent({
            type: 'REFRESH_ERROR',
            error: error.message,
            timestamp: Date.now()
        }, 0, false).catch(() => {});
    }
}

function handleUpdateData(message) {
    try {
        const { dataType, payload } = message;
        if (dataType && coreData.hasOwnProperty(dataType)) {
            updateData(dataType, payload);
            sendToParent({
                type: 'DATA_UPDATED',
                dataType: dataType,
                timestamp: Date.now()
            }, 0, false).catch(() => {});
        }
    } catch (error) {}
}

// =============================================
// FEATURE REGISTRATION
// =============================================
export function registerFeature(name, implementation) {
    try {
        if (state.features.has(name)) {
            return false;
        }
        const wrappedImplementation = {};
        Object.keys(implementation).forEach(key => {
            if (typeof implementation[key] === 'function') {
                wrappedImplementation[key] = function(...args) {
                    try {
                        return implementation[key].apply(this, args);
                    } catch (error) {
                        return null;
                    }
                };
            } else {
                wrappedImplementation[key] = implementation[key];
            }
        });
        state.features.set(name, wrappedImplementation);
        return true;
    } catch (error) {
        return false;
    }
}

export function getFeature(name) {
    return state.features.get(name) || null;
}

// =============================================
// DATA VALIDATION SCHEMAS
// =============================================
const validationSchemas = {
    friendsList: { requiredFields: ['id', 'name'], optionalFields: ['avatar', 'lastSeen', 'status'] },
    groupsList: { requiredFields: ['id', 'name'], optionalFields: ['avatar', 'members', 'lastActivity'] },
    chatHistory: { requiredFields: ['id', 'timestamp', 'type'], optionalFields: ['message', 'senderId', 'readStatus'] },
    notifications: { requiredFields: ['id', 'type', 'timestamp'], optionalFields: ['title', 'message', 'read'] },
    settings: { requiredFields: [], optionalFields: [] },
    user: { requiredFields: ['id'], optionalFields: ['name', 'email', 'avatar', 'status'] }
};

function validateDataStructure(data, dataType) {
    try {
        const schema = validationSchemas[dataType];
        if (!schema) return true;
        if (Array.isArray(data)) {
            if (data.length === 0) return true;
            const sampleSize = Math.min(data.length, 5);
            for (let i = 0; i < sampleSize; i++) {
                for (const field of schema.requiredFields) {
                    if (data[i][field] === undefined || data[i][field] === null) {
                        return false;
                    }
                }
            }
            return true;
        }
        if (typeof data === 'object' && data !== null) {
            for (const field of schema.requiredFields) {
                if (data[field] === undefined || data[field] === null) {
                    return false;
                }
            }
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

// =============================================
// BUILD SETTINGS MENU
// =============================================
export function buildSettingsMenu(container = null, config = {}) {
    try {
        const event = new CustomEvent('buildSettingsMenu', {
            detail: {
                container,
                config,
                menu: SETTINGS_MENU,
                timestamp: Date.now(),
                authenticated: isSessionValid()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SET VISIBILITY TRACKING
// =============================================
function setupVisibilityTracking() {
    document.addEventListener('visibilitychange', () => {
        const wasVisible = state.pageVisible;
        state.pageVisible = !document.hidden;
        pageVisibility = document.visibilityState;
        
        if (wasVisible === false && state.pageVisible === true) {
            if (isReady && isSessionValid()) {
                if (currentSection) {
                    loadSection(currentSection).catch(() => {});
                }
            }
            
            sendToParent({
                type: 'VISIBILITY_RESUME',
                timestamp: Date.now()
            }, 0, false).catch(() => {});
        }
    });
}

// =============================================
// GET HEALTH METRICS
// =============================================
export function getHealthMetrics() {
    return {
        uptime: Date.now() - (stateHistory[0]?.timestamp || Date.now()),
        state: currentState,
        sessionValid: isSessionValid(),
        heartbeatHealthy: HeartbeatManager.isHealthy(),
        parentVerified: OriginAdapter.isParentVerified(),
        ready: isReady,
        environment: IframeEnvironment.getEnvironment()
    };
}

// =============================================
// GET PARENT ORIGIN
// =============================================
export function getParentOrigin() {
    return OriginAdapter.getParentOrigin() || '*';
}

// =============================================
// IS PARENT AVAILABLE
// =============================================
export function isParentAvailable() {
    return OriginAdapter.isParentVerified() && !!IframeTransport._parentWindow;
}

// =============================================
// EXPORT ALIASES
// =============================================
export {
    sendToParent as sendMessageToParent,
    receiveFromParent as onParentMessage
};

export const startParentHandshake = (options) => IframeHandshakeAuthority.startHandshake(options);
export const startHandshakeProtocol = (options) => IframeHandshakeAuthority.startHandshake(options);

export const attemptCachedDataFallback = () => {
    return loadFromLocalStorage();
};

export const safeApiCall = async (endpoint, options = {}) => {
    try {
        return await secureFetchWrapper(endpoint, options.method || 'GET', options.data, options);
    } catch (error) {
        return null;
    }
};

export const sendMessageWithAck = async (type, payload, timeout = 5000) => {
    return IframeTransport.send(type, payload, { expectAck: true, timeout, maxRetries: 0 });
};

export const broadcastToAllIframes = (type, payload) => {
    return Promise.resolve({ success: false });
};

// =============================================
// ERROR BOUNDARY
// =============================================
window.addEventListener('error', (event) => {
    state.health.failures++;
    
    if (event.target && event.target.tagName === 'SCRIPT') {
        event.preventDefault();
        return false;
    }
    
    return true;
});

window.addEventListener('unhandledrejection', (event) => {
    state.health.failures++;
    errorLog('Unhandled rejection:', event.reason);
});

// =============================================
// RECOVERY MECHANISM - DISABLED
// =============================================
function attemptRecovery() {}

export function triggerRecovery() {}

export const forceRecovery = () => {};

// =============================================
// SET ALL COMPONENTS TO SILENT MODE
// =============================================
export function setSilentMode(silent = !DEBUG) {
    CONSOLE_NOISE_SUPPRESSED = silent;
    Log.setSilent(silent);
    StartupGovernor.setSilent(silent);
    IframeTransport.setSilent(silent);
    IframeHandshakeAuthority.setSilent(silent);
    HeartbeatManager.setSilent?.(silent);
    NavigationGuard.setSilent(silent);
    UIFailsafe.setSilent(silent);
    MultiModuleCoordinator.setSilent(silent);
    RecoveryManager.setSilent(silent);
    ReliabilityEngine.setSilent(silent);
    SessionClient.setSilent(silent);
}

// =============================================
// ENABLE DEBUG IF URL PARAM
// =============================================
if (window.location.search.includes('debug=true')) {
    window.__IFRAME_DEBUG__ = true;
    DEBUG_ENABLED = true;
    CONSOLE_NOISE_SUPPRESSED = false;
    Log.enableDebug();
    DiagnosticsAgent.enable(true);
    setSilentMode(false);
}

// =============================================
// EXPOSE DEBUG INTERFACE
// =============================================
window.__IFRAME_DEBUG__ = DEBUG;
window.__getDiagnostics = () => DiagnosticsAgent.getFullReport();
window.__forceRecovery = forceRecovery;
window.__resetCore = () => {
    shutdownCore();
    safeSetTimeout(() => initializeCore(), 1000);
};
window.__getEnvironment = () => IframeEnvironment.getInfo();
window.__getTransportStatus = () => IframeTransport.getDiagnostics();
window.__getSessionStatus = () => ({
    valid: isSessionValid(),
    user: session.user,
    expiresAt: session.expiresAt,
    version: session.version
});
window.__getReliabilityStatus = () => HeartbeatManager.getDiagnostics();
window.__getUIFailsafe = () => UIFailsafe.getDiagnostics();
window.__getApiCore = () => ApiCore.getDiagnostics();
window.__getParentAuthority = () => ({
    state: parentAuthorityState,
    parentReadyDetected,
    moduleRegistered,
    parentAuthoritative: !!parentAuthoritativeSession,
    parentContractEnforced
});
window.__getLifecycleState = () => currentState;
window.__getLifecycleHistory = () => stateHistory;

// =============================================
// AUTO-START
// =============================================
let domContentLoadedFired = false;

document.addEventListener('DOMContentLoaded', function() {
    if (domContentLoadedFired) return;
    domContentLoadedFired = true;
    
    try {
        initLog('DOMContentLoaded - starting core initialization');
        safeSetTimeout(() => {
            initializeCore({ 
                debug: DEBUG
            }).then(result => {
                if (result.success) {
                    if (result.state === SETTINGS_STATES.READY) {
                        successLog('Core initialized');
                    } else if (result.state === SETTINGS_STATES.DEGRADED) {
                        if (DEBUG) debugLog('Core initialized in degraded mode');
                    }
                } else {
                    errorLog('Core initialization failed:', result);
                }
            }).catch(error => {
                errorLog('Core initialization error:', error);
            });
        }, 100);
    } catch (error) {}
});

// =============================================
// CALL SETSILENTMODE AFTER ALL COMPONENTS ARE INITIALIZED
// =============================================
setSilentMode(!DEBUG);

// =============================================
// END OF FILE - PARENT AUTHORITY IMPLEMENTATION
// =============================================