// =============================================
// SETTINGS CORE - ULTRA-HARDENED v6.2.1 (FIXED)
// COMPLETE INTEGRATION WITH PARENT ORCHESTRATION SYSTEM
// ENVIRONMENT-AWARE | STARTUP GOVERNOR | HANDSHAKE CLIENT
// SESSION BRIDGE | ORIGIN ADAPTER | RELIABILITY ENGINE
// SECURITY HARDENING | MULTI-MODULE COORDINATION
// API GATEWAY INTEGRATION | SILENT BACKGROUND OPERATIONS
// =============================================

// =============================================
// MODULE IDENTITY & VERSION
// =============================================
const MODULE_NAME = 'settings-core';
const MODULE_VERSION = '6.2.1-production-ultimate';
const PROTOCOL_VERSION = '2.1';
const PROTOCOL_CANONICAL = 'KYN-2.0';
let moduleId = `settings-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// =============================================
// GLOBAL DEBUG FLAG - ENABLED FOR CONSOLE LOGS
// =============================================
window.__IFRAME_DEBUG__ = true;
let DEBUG_ENABLED = true;
let CONSOLE_NOISE_SUPPRESSED = false;

// Log throttling to prevent spam
const logThrottle = new Map();
const PROCESSED_MESSAGE_TTL = 5000;
const processedMessages = new Map();
let lastPingTime = 0;
const PING_RATE_LIMIT = 5000;
let sessionRequestTimeout = null;

function throttledLog(level, message, data = null, throttleMs = 5000) {
    const key = `${level}:${message}`;
    const lastLog = logThrottle.get(key);
    const now = Date.now();
    
    if (lastLog && now - lastLog < throttleMs) {
        return;
    }
    
    logThrottle.set(key, now);
    
    if (logThrottle.size > 50) {
        const oldest = Date.now() - 60000;
        for (const [k, ts] of logThrottle.entries()) {
            if (ts < oldest) {
                logThrottle.delete(k);
            }
        }
    }
    
    const timeStr = new Date().toISOString().slice(11, 19);
    
    switch(level) {
        case 'error': 
            console.error(`[${MODULE_NAME}] ❌ ${message}`, data || '');
            break;
        case 'warn': 
            console.warn(`[${MODULE_NAME}] ⚠️ ${message}`, data || '');
            break;
        case 'info': 
            console.info(`[${MODULE_NAME}] ℹ️ ${message}`, data || '');
            break;
        case 'debug': 
            if (DEBUG_ENABLED) console.debug(`[${MODULE_NAME}] 🔍 ${message}`, data || '');
            break;
        case 'send': 
            console.log(`[${MODULE_NAME}] 📤 ${message}`, data || '');
            break;
        case 'receive': 
            console.log(`[${MODULE_NAME}] 📥 ${message}`, data || '');
            break;
        case 'success': 
            console.log(`[${MODULE_NAME}] ✅ ${message}`, data || '');
            break;
        case 'init': 
            console.log(`[${MODULE_NAME}] 🚀 ${message}`, data || '');
            break;
        default:
            console.log(`[${MODULE_NAME}] 🔵 ${message}`, data || '');
    }
}

function debugLog(...args) { throttledLog('debug', args[0], args.slice(1)); }
function errorLog(...args) { throttledLog('error', args[0], args.slice(1)); }
function successLog(...args) { throttledLog('success', args[0], args.slice(1)); }
function sendLog(...args) { throttledLog('send', args[0], args.slice(1)); }
function receiveLog(...args) { throttledLog('receive', args[0], args.slice(1)); }
function initLog(...args) { throttledLog('init', args[0], args.slice(1)); }
function infoLog(...args) { throttledLog('info', args[0], args.slice(1)); }

// =============================================
// MESSAGE DEDUPLICATION
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
// API CORE GATEWAY - SECURE CENTRALIZED API ACCESS
// =============================================
export const ApiCore = {
    _ready: false,
    _readyPromise: null,
    _readyResolvers: [],
    _baseUrl: null,
    _timeout: 15000,
    _retryCount: 2,
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
        
        setTimeout(() => {
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
            debugLog('API Gateway back online');
        });
        
        return this;
    },
    
    isReady() {
        return this._ready;
    },
    
    whenReady() {
        return this._readyPromise || Promise.resolve();
    },
    
    setBaseUrl(url) {
        this._baseUrl = url;
    },
    
    _shouldAllowRequest() {
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
            debugLog('Circuit breaker opened');
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
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || this._timeout);
        
        this._pendingRequests.set(requestId, { controller, endpoint });
        
        try {
            const headers = {
                'Content-Type': 'application/json',
                'X-Request-ID': requestId,
                ...options.headers
            };
            
            const token = getSecureToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            let url = endpoint;
            if (!url.startsWith('http')) {
                url = this._baseUrl ? `${this._baseUrl}${url}` : url;
            }
            
            const response = await fetch(url, {
                method,
                headers,
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
                credentials: 'include',
                mode: 'cors'
            });
            
            clearTimeout(timeoutId);
            this._pendingRequests.delete(requestId);
            
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }
            
            if (!response.ok) {
                this._recordFailure();
                
                const errorMessage = data?.message || data?.error || `HTTP ${response.status}`;
                
                return {
                    success: false,
                    status: response.status,
                    message: errorMessage,
                    data: data || null
                };
            }
            
            this._recordSuccess();
            
            const result = {
                success: true,
                status: response.status,
                data: data,
                headers: Object.fromEntries(response.headers)
            };
            
            if (useCache && method === 'GET') {
                this._setCache(cacheKey, data);
            }
            
            return result;
            
        } catch (error) {
            clearTimeout(timeoutId);
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
        // Route through parent
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
        backendReachable: true // Assume reachable via parent
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
                debugLog('Environment detected: LOCAL_DEV');
            } else if (hostname.includes('onrender.com')) {
                this._environment = ENV_TYPES.RENDER_HOSTED;
                debugLog('Environment detected: RENDER_HOSTED');
            } else if (this._features.rtt > 300 || 
                      (this._features.connectionType === '4g' && this._features.rtt > 200) ||
                      navigator.connection?.saveData) {
                this._environment = ENV_TYPES.VPN_NETWORK;
                debugLog('Environment detected: VPN_NETWORK');
            } else if (isSecure && hostname.includes('.')) {
                this._environment = ENV_TYPES.PRODUCTION;
                debugLog('Environment detected: PRODUCTION');
            } else {
                this._environment = ENV_TYPES.UNKNOWN;
                debugLog('Environment detected: UNKNOWN');
            }
            
            // Don't check backend directly - assume reachable via parent
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
        if (this.isVPN()) return baseRetries + 2;
        if (this.isLocal()) return baseRetries + 1;
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
    
    init() {
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
                debugLog('Loaded memory fallback cache');
            }
        } catch (e) {}
        
        successLog('SafeStorage initialized - Type:', this.getStorageType());
        return this;
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
                debugLog('Storage unavailable, using memory fallback');
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
                        debugLog('Storage quota exceeded');
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
}.init();

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
        debugLog('Compatibility mode enabled:', reason);
        
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
// STARTUP GOVERNOR 
// =============================================
export const StartupGovernor = {
    _state: 'INIT',
    _lock: false,
    _attempts: 0,
    _maxAttempts: 5,
    _backoffMs: 1000,
    _initialized: false,
    _startTime: Date.now(),
    _stateHistory: [],
    _transitionListeners: new Set(),
    _recoveryTimer: null,
    _degradedTimer: null,
    _silent: false,
    
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
        if (this._lock && newState !== this._state && newState !== 'FAILED') {
            return false;
        }
        
        const oldState = this._state;
        this._state = newState;
        
        debugLog(`State: ${oldState} → ${newState} (${reason})`);
        
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
        
        if (newState === this.states.DEGRADED) {
            this._scheduleRecovery();
        }
        
        return true;
    },
    
    onTransition(listener) {
        this._transitionListeners.add(listener);
        return () => this._transitionListeners.delete(listener);
    },
    
    async execute(operation, options = {}) {
        const {
            timeout = 10000,
            retryCount = 3,
            backoff = true,
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
                            setTimeout(() => reject(new Error(`${name} timeout`)), timeout)
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
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }
        } finally {
            this._lock = false;
        }
    },
    
    _scheduleRecovery() {
        if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
        
        this._recoveryTimer = setTimeout(() => {
            if (this._state === this.states.DEGRADED) {
                this.transition(this.states.RECOVERING, 'auto_recovery');
                
                setTimeout(() => {
                    if (this._state === this.states.RECOVERING) {
                        this.transition(this.states.ACTIVE, 'recovery_success');
                        successLog('Recovery successful');
                    }
                }, 5000);
            }
        }, 10000);
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
        if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
        if (this._degradedTimer) clearTimeout(this._degradedTimer);
    },
    
    setSilent(silent) {
        this._silent = silent;
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
        debugLog('Parent origin set:', origin);
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
// RETRY DEBOUNCER
// =============================================
const retryDebouncers = new Map();

function debounceRetry(type, callback, delay = 1000) {
    if (retryDebouncers.has(type)) {
        clearTimeout(retryDebouncers.get(type));
    }
    
    const timerId = setTimeout(() => {
        retryDebouncers.delete(type);
        callback();
    }, delay);
    
    retryDebouncers.set(type, timerId);
}

// =============================================
// IFRAME TRANSPORT 
// =============================================
export const IframeTransport = {
    _messageId: 0,
    _pendingAcks: new Map(),
    _messageHandlers: new Map(),
    _retryQueue: new Map(),
    _offlineBuffer: [],
    _sequence: 0,
    _frameId: 'settings',
    _protocolVersion: PROTOCOL_VERSION,
    _maxRetries: 3,
    _baseTimeout: 5000,
    _circuitBreakers: new Map(),
    _enabled: true,
    _silent: false,
    
    init() {
        initLog('IframeTransport initializing');
        this._setupMessageListener();
        this._startRetryProcessor();
        successLog('IframeTransport initialized');
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
            
            // DEDUPLICATION
            if (isMessageDuplicate(message.messageId || message.requestId, message.type)) {
                return;
            }
            
            if (message.type === 'ACK' && message.inResponseTo) {
                const pending = this._pendingAcks.get(message.inResponseTo);
                if (pending) {
                    clearTimeout(pending.timer);
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
                    pending.resolve(message);
                    this._pendingAcks.delete(message.pingId);
                }
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
    
    _startRetryProcessor() {
        setInterval(() => {
            if (!this._enabled) return;
            
            const now = Date.now();
            this._retryQueue.forEach((item, id) => {
                if (item.nextRetry <= now) {
                    this._retryQueue.delete(id);
                    this.send(item.type, item.payload, {
                        ...item.options,
                        retryCount: item.retryCount + 1
                    }).catch(() => {});
                }
            });
        }, 1000);
    },
    
    send(type, payload = {}, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                if (type === 'PING' && !canSendPing()) {
                    resolve({ success: false, reason: 'rate_limited' });
                    return;
                }
                
                const {
                    timeout = this._baseTimeout,
                    retryCount = 0,
                    maxRetries = this._maxRetries,
                    expectAck = true,
                    priority = 'normal',
                    targetOrigin = '*'
                } = options;
                
                const breaker = this._getCircuitBreaker(type);
                if (breaker && !breaker.allow()) {
                    if (retryCount < maxRetries) {
                        const backoff = Math.min(1000 * Math.pow(2, retryCount), 30000);
                        this._retryQueue.set(`${type}_${Date.now()}_${Math.random()}`, {
                            type,
                            payload,
                            options: { ...options, retryCount: retryCount + 1 },
                            nextRetry: Date.now() + backoff,
                            retryCount
                        });
                        return;
                    } else {
                        reject(new Error(`Circuit breaker open for ${type}`));
                        return;
                    }
                }
                
                const messageId = `msg_${Date.now()}_${this._messageId++}_${Math.random().toString(36).substring(2, 7)}`;
                const timestamp = Date.now();
                
                const message = {
                    protocol: PROTOCOL_CANONICAL,
                    messageId,
                    type,
                    source: this._frameId,
                    target: 'parent',
                    timestamp,
                    payload: payload || {},
                    sequence: this._sequence++,
                    version: MODULE_VERSION,
                    expectAck,
                    retryCount,
                    environment: IframeEnvironment.getEnvironment()
                };
                
                const token = SessionClient?.getToken() || getSecureToken();
                if (token) {
                    message.token = token;
                }
                
                const finalMessage = CompatibilityBridge.isEnabled() ? 
                    CompatibilityBridge.translateOutgoing(message) : message;
                
                const parentWin = state.parentWindow || window.parent;
                const origin = state.parentOrigin || targetOrigin;
                
                if (!parentWin || parentWin === window) {
                    if (retryCount < maxRetries) {
                        this._offlineBuffer.push({
                            type,
                            payload,
                            options,
                            timestamp: Date.now()
                        });
                        
                        setTimeout(() => {
                            this.send(type, payload, options).then(resolve).catch(reject);
                        }, 1000 * (retryCount + 1));
                        return;
                    } else {
                        reject(new Error('Parent window not available'));
                        return;
                    }
                }
                
                sendLog(`${type} - MessageId: ${messageId}`);
                try {
                    parentWin.postMessage(finalMessage, origin);
                } catch (e) {
                    parentWin.postMessage(finalMessage, '*');
                }
                
                if (expectAck) {
                    const timer = setTimeout(() => {
                        if (this._pendingAcks.has(messageId)) {
                            this._pendingAcks.delete(messageId);
                            
                            if (breaker) breaker.recordFailure();
                            
                            if (retryCount < maxRetries) {
                                const backoff = Math.min(1000 * Math.pow(2, retryCount), 30000);
                                setTimeout(() => {
                                    this.send(type, payload, { 
                                        ...options, 
                                        retryCount: retryCount + 1 
                                    }).then(resolve).catch(reject);
                                }, backoff);
                            } else {
                                reject(new Error(`ACK timeout for ${messageId}`));
                            }
                        }
                    }, timeout);
                    
                    this._pendingAcks.set(messageId, {
                        messageId,
                        timer,
                        resolve,
                        reject,
                        type,
                        timestamp
                    });
                } else {
                    resolve({ messageId, acknowledged: false });
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
        return this.send('PING', {}, { expectAck: true, timeout: 3000 });
    },
    
    enable() {
        this._enabled = true;
        this.flushOffline();
    },
    
    disable() {
        this._enabled = false;
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
// HANDSHAKE AUTHORITY 
// =============================================
export const IframeHandshakeAuthority = {
    _handshakeId: null,
    _handshakeComplete: false,
    _handshakeAttempts: 0,
    _maxAttempts: 10,
    _backoffMs: 500,
    _parentReady: false,
    _handshakeAcked: false,
    _listeners: new Set(),
    _timeoutId: null,
    _retryTimer: null,
    _inProgress: false,
    _completedState: null,
    _silent: false,
    
    async startHandshake(options = {}) {
        const {
            timeout = 10000,
            retryCount = 10,
            backoffMs = 500,
            force = false
        } = options;
        
        const adjustedRetries = IframeEnvironment.getAdjustedRetries(retryCount);
        const adjustedTimeout = IframeEnvironment.getAdjustedTimeout(timeout);
        
        if (this._handshakeComplete && !force) {
            return { success: true, cached: true };
        }
        
        if (this._inProgress && !force) {
            return { success: false, error: 'in_progress' };
        }
        
        this._inProgress = true;
        this._handshakeId = `hs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this._handshakeAttempts = 0;
        
        debugLog(`Starting handshake (attempt 1/${adjustedRetries})`);
        
        return new Promise((resolve) => {
            const attemptHandshake = async () => {
                this._handshakeAttempts++;
                
                try {
                    if (!this._parentReady && !force) {
                        const parentTimeout = setTimeout(() => {
                            this._inProgress = false;
                            resolve({ success: false, error: 'parent_timeout' });
                        }, 5000);
                        
                        const waitForParent = () => {
                            clearTimeout(parentTimeout);
                            performHandshake();
                        };
                        
                        this.once('parent_ready', waitForParent);
                        return;
                    }
                    
                    performHandshake();
                    
                } catch (error) {
                    if (this._handshakeAttempts < adjustedRetries) {
                        const baseDelay = backoffMs * Math.pow(1.5, this._handshakeAttempts - 1);
                        const jitter = Math.random() * 200;
                        const delay = Math.min(baseDelay + jitter, 10000);
                        
                        debounceRetry('handshake', () => {
                            this._retryTimer = setTimeout(attemptHandshake, delay);
                        }, delay);
                    } else {
                        this._inProgress = false;
                        resolve({ success: false, error: error.message });
                    }
                }
            };
            
            const performHandshake = async () => {
                try {
                    const handshakePayload = {
                        type: 'HANDSHAKE',
                        childId: 'settings',
                        handshakeId: this._handshakeId,
                        timestamp: Date.now(),
                        protocolVersion: PROTOCOL_VERSION,
                        canonical: true,
                        environment: IframeEnvironment.getEnvironment(),
                        capabilities: {
                            sessionMirror: true,
                            tokenManagement: true,
                            heartbeat: true,
                            ping: true,
                            sessionAck: true,
                            originBind: true,
                            recovery: true,
                            governor: true,
                            handshakeAuthority: true,
                            transport: true,
                            sessionClient: true
                        }
                    };
                    
                    sendLog('HANDSHAKE request');
                    const response = await IframeTransport.send(
                        'HANDSHAKE', 
                        handshakePayload, 
                        { expectAck: true, timeout: adjustedTimeout }
                    );
                    
                    if (response && response.acknowledged) {
                        this._handshakeAcked = true;
                        this._handshakeComplete = true;
                        this._completedState = response;
                        this._inProgress = false;
                        
                        StartupGovernor.transition(StartupGovernor.states.SYNCING, 'handshake_complete');
                        successLog('Handshake complete');
                        
                        this.emit('handshake_success', response);
                        resolve({ success: true, response });
                    } else {
                        throw new Error('No acknowledgment');
                    }
                    
                } catch (error) {
                    if (this._handshakeAttempts < adjustedRetries) {
                        const baseDelay = backoffMs * Math.pow(2, this._handshakeAttempts - 1);
                        const jitter = Math.random() * 200;
                        const delay = Math.min(baseDelay + jitter, 10000);
                        
                        debounceRetry('handshake', () => {
                            this._retryTimer = setTimeout(attemptHandshake, delay);
                        }, delay);
                    } else {
                        this._inProgress = false;
                        StartupGovernor.transition(StartupGovernor.states.DEGRADED, 'handshake_failed');
                        errorLog('Handshake failed:', error);
                        resolve({ success: false, error: error.message });
                    }
                }
            };
            
            setTimeout(attemptHandshake, 100);
        });
    },
    
    onParentReady() {
        this._parentReady = true;
        this.emit('parent_ready');
        debugLog('Parent ready received');
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
        if (this._timeoutId) clearTimeout(this._timeoutId);
        if (this._retryTimer) clearTimeout(this._retryTimer);
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
// SESSION CLIENT 
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
    _maxRefreshAttempts: 5,
    _offlineMode: false,
    _syncInProgress: false,
    _silent: false,
    
    init() {
        initLog('SessionClient initializing');
        try {
            const cached = SafeStorage.getJSON('session_client', null, true);
            if (cached && cached.session && cached.expiry > Date.now()) {
                this._session = cached.session;
                this._sessionToken = cached.token;
                this._sessionExpiry = cached.expiry;
                this._sessionVersion = cached.version || 0;
                debugLog('Loaded cached session');
            }
        } catch (e) {}
        
        this._startSync();
        this._scheduleRefresh();
        successLog('SessionClient initialized');
    },
    
    _startSync() {
        if (this._syncInterval) clearInterval(this._syncInterval);
        
        const interval = IframeEnvironment.isVPN() ? 60000 : 30000;
        
        this._syncInterval = setInterval(() => {
            if (StartupGovernor.isStable() || StartupGovernor.isDegraded()) {
                this.sync();
            }
        }, interval);
    },
    
    async sync() {
        if (this._sessionLock || this._syncInProgress) return false;
        
        this._syncInProgress = true;
        this._sessionLock = true;
        
        try {
            sendLog('SESSION_SYNC request');
            const response = await IframeTransport.send('SESSION_SYNC', {
                childId: 'settings',
                version: this._sessionVersion,
                timestamp: Date.now()
            }, { expectAck: true, timeout: 5000 });
            
            if (response && response.payload?.session) {
                this.updateSession(
                    response.payload.session.user,
                    response.payload.session.token,
                    response.payload.session.expiry
                );
                this._lastSync = Date.now();
                
                await IframeTransport.send('SESSION_ACK', {
                    childId: 'settings',
                    version: this._sessionVersion,
                    timestamp: Date.now()
                }, { expectAck: false });
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            this._offlineMode = true;
            return false;
        } finally {
            this._sessionLock = false;
            this._syncInProgress = false;
        }
    },
    
    updateSession(session, token, expiry) {
        if (this._sessionLock) return false;
        
        this._sessionLock = true;
        
        try {
            const previousVersion = this._sessionVersion;
            
            if (session) {
                this._session = typeof session === 'object' ? { ...session } : session;
                currentUser = this._session;
                coreData.user = this._session;
                state.session = this._session;
                parentSessionData = { user: this._session, token, expiry };
                parentSessionReceived = true;
                sessionValidated = true;
                debugLog('Session updated:', this._session?.name);
            }
            
            if (token) {
                this._sessionToken = token;
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                originBoundToken = token;
            }
            
            if (expiry) {
                this._sessionExpiry = expiry;
            }
            
            this._sessionVersion++;
            this._lastSync = Date.now();
            this._offlineMode = false;
            
            SafeStorage.setJSON('session_client', {
                session: this._session ? { id: this._session.id, name: this._session.name } : null,
                token: this._sessionToken,
                expiry: this._sessionExpiry,
                version: this._sessionVersion,
                lastSync: this._lastSync
            }, true);
            
            this.emit('session_updated', {
                session: this._session,
                token: this._sessionToken,
                expiry: this._sessionExpiry,
                version: this._sessionVersion,
                previousVersion
            });
            
            this._scheduleRefresh();
            
            return true;
            
        } finally {
            this._sessionLock = false;
        }
    },
    
    _scheduleRefresh() {
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
        
        if (!this._sessionExpiry) return;
        
        const timeToExpiry = this._sessionExpiry - Date.now();
        const refreshTime = Math.max(0, timeToExpiry - 300000);
        
        if (refreshTime <= 0) {
            this.refresh();
        } else {
            this._refreshTimer = setTimeout(() => this.refresh(), refreshTime);
        }
    },
    
    async refresh() {
        if (this._refreshAttempts >= this._maxRefreshAttempts) {
            return false;
        }
        
        this._refreshAttempts++;
        
        try {
            sendLog('SESSION_REQUEST refresh');
            const response = await IframeTransport.send('SESSION_REQUEST', {
                childId: 'settings',
                refresh: true,
                timestamp: Date.now()
            }, { expectAck: true, timeout: 8000 });
            
            if (response && response.payload?.session) {
                this.updateSession(
                    response.payload.session.user,
                    response.payload.session.token,
                    response.payload.session.expiry
                );
                this._refreshAttempts = 0;
                return true;
            }
            
            return false;
            
        } catch (error) {
            const backoff = Math.min(60000 * Math.pow(2, this._refreshAttempts), 300000);
            setTimeout(() => this.refresh(), backoff);
            return false;
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
    
    getSession() {
        return this._session ? { ...this._session } : null;
    },
    
    getToken() {
        return this._sessionToken;
    },
    
    isValid() {
        return !!this._session && 
               !!this._sessionToken && 
               (!this._sessionExpiry || this._sessionExpiry > Date.now());
    },
    
    isExpired() {
        return !!this._sessionExpiry && this._sessionExpiry <= Date.now();
    },
    
    isOffline() {
        return this._offlineMode;
    },
    
    clear() {
        this._session = null;
        this._sessionToken = null;
        this._sessionExpiry = null;
        this._sessionVersion = 0;
        this._lastSync = 0;
        this._offlineMode = false;
        
        SafeStorage.remove('session_client');
        
        this.emit('session_cleared');
        debugLog('Session cleared');
    },
    
    getDiagnostics() {
        return {
            hasSession: !!this._session,
            hasToken: !!this._sessionToken,
            expiry: this._sessionExpiry,
            version: this._sessionVersion,
            lastSync: this._lastSync,
            refreshAttempts: this._refreshAttempts,
            isValid: this.isValid(),
            isExpired: this.isExpired(),
            offlineMode: this._offlineMode
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

SessionClient.init();

// =============================================
// RELIABILITY ENGINE 
// =============================================
export const ReliabilityEngine = {
    _ackQueue: new Map(),
    _retryQueue: new Map(),
    _pingInterval: null,
    _pingFailures: 0,
    _maxPingFailures: 3,
    _pingTimeout: 5000,
    _lastPing: 0,
    _lastPong: 0,
    _offlineBuffer: [],
    _visibilityThrottle: false,
    _latencyHistory: [],
    _backoffState: new Map(),
    _circuitBreakers: new Map(),
    _heartbeatTimer: null,
    _recoveryTimer: null,
    _listeners: new Set(),
    _enabled: true,
    _quality: 'unknown',
    _silent: false,
    
    init() {
        initLog('ReliabilityEngine initializing');
        this._startPing();
        this._setupVisibility();
        this._setupHeartbeat();
        
        if (navigator.connection) {
            navigator.connection.addEventListener('change', () => {
                this._onNetworkChange();
            });
        }
        
        window.addEventListener('online', () => {
            this._onOnline();
        });
        
        window.addEventListener('offline', () => {
            this._onOffline();
        });
        
        successLog('ReliabilityEngine initialized');
    },
    
    _startPing() {
        if (this._pingInterval) clearInterval(this._pingInterval);
        
        const interval = IframeEnvironment.isVPN() ? 30000 : 15000;
        
        this._pingInterval = setInterval(() => {
            if (this._enabled && (!document.hidden || !this._visibilityThrottle)) {
                this._sendPing();
            }
        }, interval);
    },
    
    async _sendPing() {
        const pingId = `ping_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        this._lastPing = Date.now();
        
        try {
            const pong = await IframeTransport.send('PING', { pingId }, { 
                expectAck: true, 
                timeout: this._pingTimeout,
                retryCount: 0
            });
            
            if (pong) {
                this._lastPong = Date.now();
                this._pingFailures = 0;
                
                const latency = this._lastPong - this._lastPing;
                this._latencyHistory.push(latency);
                if (this._latencyHistory.length > 10) this._latencyHistory.shift();
                
                this._updateConnectionQuality(latency);
            }
            
        } catch (error) {
            this._pingFailures++;
            
            if (this._pingFailures >= this._maxPingFailures) {
                this._enterDegradedMode('ping_failure');
            }
        }
    },
    
    _updateConnectionQuality(latency) {
        if (latency < 100) {
            this._quality = 'good';
        } else if (latency < 300) {
            this._quality = 'fair';
        } else if (latency < 1000) {
            this._quality = 'poor';
        } else {
            this._quality = 'degraded';
        }
        
        state.connectionQuality = this._quality;
        
        if (this._quality === 'degraded') {
            this._enterDegradedMode('high_latency');
        }
    },
    
    _enterDegradedMode(reason) {
        if (StartupGovernor.isStable()) {
            StartupGovernor.transition(StartupGovernor.states.DEGRADED, reason);
            
            clearInterval(this._pingInterval);
            this._pingInterval = setInterval(() => this._sendPing(), 30000);
            this._pingTimeout = 10000;
            
            this.emit('degraded', { reason });
        }
    },
    
    _setupVisibility() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._visibilityThrottle = true;
                this._flushUrgentQueue();
            } else {
                this._visibilityThrottle = false;
                SessionClient.sync();
                this.flushOffline();
            }
        });
    },
    
    _setupHeartbeat() {
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        
        const interval = IframeEnvironment.isVPN() ? 60000 : 30000;
        
        this._heartbeatTimer = setInterval(() => {
            if (this._enabled && StartupGovernor.isStable()) {
                IframeTransport.send('HEARTBEAT', {
                    childId: 'settings',
                    state: StartupGovernor.getState(),
                    sessionValid: SessionClient.isValid(),
                    quality: this._quality,
                    timestamp: Date.now()
                }, { expectAck: false }).catch(() => {});
            }
        }, interval);
    },
    
    _onNetworkChange() {
        if (navigator.connection) {
            const rtt = navigator.connection.rtt || 0;
            
            if (rtt > 500) {
                this._enterDegradedMode('slow_network');
            } else if (this._quality === 'degraded' && rtt < 200) {
                this._attemptRecovery();
            }
        }
    },
    
    _onOnline() {
        this._pingFailures = 0;
        this.flushOffline();
        SessionClient.sync();
        this.emit('online');
    },
    
    _onOffline() {
        this.emit('offline');
    },
    
    _flushUrgentQueue() {
        // No operation needed
    },
    
    async _attemptRecovery() {
        if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
        
        this._recoveryTimer = setTimeout(async () => {
            StartupGovernor.transition(StartupGovernor.states.RECOVERING, 'network_recovery');
            
            try {
                await IframeHandshakeAuthority.startHandshake({ force: true });
                await SessionClient.sync();
                StartupGovernor.transition(StartupGovernor.states.ACTIVE, 'recovery_success');
                this.emit('recovered');
            } catch (error) {
                StartupGovernor.transition(StartupGovernor.states.DEGRADED, 'recovery_failed');
                this._recoveryTimer = setTimeout(() => this._attemptRecovery(), 60000);
            }
        }, 5000);
    },
    
    bufferOffline(message) {
        if (!message) return;
        
        this._offlineBuffer.push({
            message,
            timestamp: Date.now()
        });
        
        if (this._offlineBuffer.length > 50) {
            this._offlineBuffer.shift();
        }
    },
    
    flushOffline() {
        if (this._offlineBuffer.length === 0) return;
        
        const buffer = [...this._offlineBuffer];
        this._offlineBuffer = [];
        
        buffer.forEach(item => {
            IframeTransport.send(item.message.type, item.message.payload, { expectAck: false })
                .catch(() => {
                    this.bufferOffline(item.message);
                });
        });
    },
    
    getCircuitBreaker(name, options = {}) {
        if (!this._circuitBreakers.has(name)) {
            this._circuitBreakers.set(name, {
                name,
                failures: 0,
                lastFailure: null,
                isOpen: false,
                openTime: null,
                threshold: options.threshold || 5,
                timeout: options.timeout || 30000,
                halfOpenSuccesses: 0,
                halfOpenThreshold: options.halfOpenThreshold || 2,
                
                recordFailure() {
                    this.failures++;
                    this.lastFailure = Date.now();
                    
                    if (this.failures >= this.threshold && !this.isOpen) {
                        this.isOpen = true;
                        this.openTime = Date.now();
                        this.halfOpenSuccesses = 0;
                    }
                },
                
                recordSuccess() {
                    if (this.isOpen) {
                        this.halfOpenSuccesses++;
                        if (this.halfOpenSuccesses >= this.halfOpenThreshold) {
                            this.isOpen = false;
                            this.failures = 0;
                            this.openTime = null;
                            this.halfOpenSuccesses = 0;
                        }
                    } else {
                        this.failures = Math.max(0, this.failures - 1);
                    }
                },
                
                allow() {
                    if (this.isOpen && this.openTime) {
                        if (Date.now() - this.openTime > this.timeout) {
                            this.isOpen = false;
                            this.halfOpenSuccesses = 0;
                            return true;
                        }
                        return false;
                    }
                    return true;
                }
            });
        }
        
        return this._circuitBreakers.get(name);
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
    
    enable() {
        this._enabled = true;
    },
    
    disable() {
        this._enabled = false;
    },
    
    getQuality() {
        return this._quality;
    },
    
    getDiagnostics() {
        const avgLatency = this._latencyHistory.length > 0 ?
            this._latencyHistory.reduce((a, b) => a + b, 0) / this._latencyHistory.length : 0;
        
        return {
            pingFailures: this._pingFailures,
            lastPing: this._lastPing,
            lastPong: this._lastPong,
            avgLatency,
            ackQueueSize: this._ackQueue.size,
            retryQueueSize: this._retryQueue.size,
            offlineBufferSize: this._offlineBuffer.length,
            connectionQuality: this._quality,
            visibilityThrottle: this._visibilityThrottle,
            enabled: this._enabled,
            circuitBreakers: Array.from(this._circuitBreakers.keys()).map(name => {
                const cb = this._circuitBreakers.get(name);
                return {
                    name,
                    isOpen: cb.isOpen,
                    failures: cb.failures
                };
            })
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ReliabilityEngine.init();

// =============================================
// RECOVERY MANAGER 
// =============================================
export const RecoveryManager = {
    _attempts: 0,
    _maxAttempts: 5,
    _backoffMs: 1000,
    _recoveryInProgress: false,
    _recoveryTimer: null,
    _listeners: new Set(),
    _recoveryStrategies: new Map(),
    _silent: false,
    
    init() {
        initLog('RecoveryManager initializing');
        this._registerDefaultStrategies();
        successLog('RecoveryManager initialized');
    },
    
    _registerDefaultStrategies() {
        this.registerStrategy('handshake', async () => {
            const result = await IframeHandshakeAuthority.startHandshake({ force: true });
            return result.success;
        });
        
        this.registerStrategy('session', async () => {
            const result = await SessionClient.sync();
            return result;
        });
        
        this.registerStrategy('ping', async () => {
            try {
                await IframeTransport.ping();
                return true;
            } catch (e) {
                return false;
            }
        });
        
        this.registerStrategy('reload', async () => {
            window.location.reload();
            return true;
        });
    },
    
    registerStrategy(name, strategy) {
        this._recoveryStrategies.set(name, strategy);
    },
    
    async attemptRecovery(options = {}) {
        const {
            strategies = ['handshake', 'session', 'ping'],
            maxAttempts = this._maxAttempts,
            reason = 'unknown'
        } = options;
        
        if (this._recoveryInProgress) return false;
        if (this._attempts >= maxAttempts) {
            this.emit('failed', { reason, attempts: this._attempts });
            return false;
        }
        
        this._recoveryInProgress = true;
        this._attempts++;
        
        debugLog(`Recovery attempt ${this._attempts}/${maxAttempts} - Reason: ${reason}`);
        this.emit('attempt', { attempt: this._attempts, reason });
        
        try {
            for (const strategy of strategies) {
                if (!this._recoveryStrategies.has(strategy)) continue;
                
                const strategyFn = this._recoveryStrategies.get(strategy);
                const success = await strategyFn();
                
                if (success) {
                    this._recoveryInProgress = false;
                    this._attempts = 0;
                    this.emit('success', { strategy, attempts: this._attempts });
                    ReliabilityEngine.flushOffline();
                    successLog('Recovery successful via', strategy);
                    return true;
                }
                
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            this._recoveryInProgress = false;
            this.emit('failed', { reason, attempts: this._attempts });
            
            const backoff = Math.min(this._backoffMs * Math.pow(2, this._attempts), 30000);
            this._recoveryTimer = setTimeout(() => {
                this.attemptRecovery(options);
            }, backoff);
            
            return false;
            
        } catch (error) {
            this._recoveryInProgress = false;
            return false;
        }
    },
    
    reset() {
        this._attempts = 0;
        this._recoveryInProgress = false;
        if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
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
            attempts: this._attempts,
            maxAttempts: this._maxAttempts,
            recoveryInProgress: this._recoveryInProgress,
            strategies: Array.from(this._recoveryStrategies.keys())
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

RecoveryManager.init();

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
    _logToConsole: true,
    
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
        
        const entry = {
            level,
            message,
            data: data ? (typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data)) : null,
            timestamp: Date.now(),
            timeStr: new Date().toISOString().slice(11, 23),
            state: StartupGovernor.getState(),
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
            state: StartupGovernor.getState(),
            handshakeStatus: IframeHandshakeAuthority.getStatus(),
            sessionValid: SessionClient.isValid(),
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
            environment: {
                type: IframeEnvironment.getEnvironment(),
                features: { ...IframeEnvironment._features },
                sandboxed: IframeEnvironment._features.isSandboxed,
                compatibility: CompatibilityBridge.isEnabled(),
                compatibilityReason: CompatibilityBridge.getReason()
            },
            startup: StartupGovernor.getDiagnostics(),
            handshake: IframeHandshakeAuthority.getStatus(),
            session: SessionClient.getDiagnostics(),
            reliability: ReliabilityEngine.getDiagnostics(),
            origin: OriginAdapter.getDiagnostics(),
            transport: IframeTransport.getDiagnostics(),
            recovery: RecoveryManager.getDiagnostics(),
            metrics: this.getMetrics(),
            logs: this._logBuffer.slice(-20),
            stateSnapshots: this._stateSnapshots.slice(-10)
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
// MULTI-MODULE COORDINATOR - FIXED
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
    _silent: false,
    
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
        
        setTimeout(() => this._discoverModules(), 1000);
        successLog('MultiModuleCoordinator initialized');
    },
    
    registerModule(type, id) {
        this._modules.set(id, {
            type,
            id,
            lastSeen: Date.now(),
            ready: false,
            handshakeComplete: false,
            sessionValid: false
        });
        
        this._broadcast({
            _moduleBus: true,
            type: MODULE_PRESENCE,
            moduleType: type,
            moduleId: id,
            timestamp: Date.now()
        });
    },
    
    _discoverModules() {
        this._broadcast({
            _moduleBus: true,
            type: MODULE_DISCOVERY,
            sourceId: this._moduleId,
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
                    ready: true,
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
                    handshakeComplete: IframeHandshakeAuthority.isComplete(),
                    sessionValid: SessionClient.isValid(),
                    timestamp: Date.now(),
                    target: sourceId
                });
                break;
                
            case 'SESSION_UPDATE':
                if (data.session && !this._sharedSession) {
                    this._sharedSession = data.session;
                    SessionClient.updateSession(
                        data.session.user,
                        data.session.token,
                        data.session.expiry
                    );
                }
                break;
                
            case 'HANDSHAKE_COMPLETE':
                if (!IframeHandshakeAuthority.isComplete()) {
                    IframeHandshakeAuthority._handshakeComplete = true;
                }
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
        }, { expectAck: false }).catch(() => {});
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
        return this._sharedSession;
    },
    
    setSharedSession(session) {
        this._sharedSession = session;
        this.emit('SESSION_UPDATE', { session });
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

MultiModuleCoordinator.init();

// =============================================
// NAVIGATION GUARD 
// =============================================
export const NavigationGuard = {
    _enabled: true,
    _pendingNavigation: null,
    _listeners: new Set(),
    _guardedPaths: ['/settings', '/profile', '/account'],
    _silent: false,
    
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

NavigationGuard.init();

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
    _silent: false,
    
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
        
        this._recoveryTimer = setTimeout(() => {
            this.exitFallbackMode();
        }, 30000);
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
        
        if (this._recoveryTimer) clearTimeout(this._recoveryTimer);
        
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

UIFailsafe.init();

// =============================================
// EXPORTED STATE VARIABLES - COMPLETE 
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
export let maxRecoveryAttempts = 5;
export let originBoundToken = null;
export let tokenBindingNonce = null;

export let MAX_API_RETRIES = 5;
export let AUTH_CHECK_INTERVAL = 30000;
export let TOKEN_CHECK_INTERVAL = 1000;
export let MAX_HANDSHAKE_ATTEMPTS = 10;
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
// PARENT MESSAGE TYPES - COMPLETE 
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
    
    // Settings-specific message types
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
    maxReconnectAttempts: 5,
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
// LOGGING SYSTEM - ENHANCED
// =============================================
const Log = {
    _warnings: new Set(),
    _debug: true,
    _logBuffer: [],
    _maxBufferSize: 500,
    _logLevel: 'debug',
    _silent: false,
    
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
        if (this._silent) return;
        infoLog(message, data);
        this._addToBuffer('info', message, data);
    },
    
    warn(message, once = true) {
        if (this._silent) return;
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
        if (this._silent) return;
        debugLog(message, data);
        this._addToBuffer('debug', message, data);
    },
    
    metric(name, value) {
        if (this._silent) return;
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
// SESSION MIRROR LAYER 
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
        const cached = SafeStorage.getJSON('session_mirror', null, true);
        if (cached) {
            this._mirror = { ...this._mirror, ...cached };
            if (this._mirror.boundOrigin && this._mirror.boundOrigin !== window.location.origin) {
                this.clear();
            }
        }
        this._startAutoSync();
        return this;
    },
    
    _startAutoSync() {
        if (this._syncInterval) clearInterval(this._syncInterval);
        this._syncInterval = setInterval(() => this.sync(), 30000);
        state.intervals.add(this._syncInterval);
    },
    
    update(sessionData) {
        if (!sessionData) return false;
        const previousVersion = this._mirror.version;
        
        if (sessionData.user) this._mirror.user = { ...sessionData.user };
        if (sessionData.token) this._mirror.token = sessionData.token;
        if (sessionData.permissions) this._mirror.permissions = { ...sessionData.permissions };
        if (sessionData.expiresAt) this._mirror.expiresAt = sessionData.expiresAt;
        if (sessionData.capabilities) this._mirror.capabilities = [...sessionData.capabilities];
        if (sessionData.boundOrigin) this._mirror.boundOrigin = sessionData.boundOrigin;
        if (sessionData.bindingNonce) this._mirror.bindingNonce = sessionData.bindingNonce;
        
        this._mirror.lastSync = Date.now();
        this._mirror.lastValidated = Date.now();
        this._mirror.version = (this._mirror.version || 0) + 1;
        this._mirror.source = 'parent';
        
        if (this._mirror.user) {
            currentUser = this._mirror.user;
            coreData.user = this._mirror.user;
            state.session = this._mirror.user;
            state.sessionMirror = { ...this._mirror };
            parentSessionData = this._mirror;
            parentSessionReceived = true;
            sessionValidated = true;
            
            if (this._mirror.token) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                
                if (!this._mirror.boundOrigin) {
                    this._bindToOrigin();
                }
            }
        }
        
        SafeStorage.setJSON('session_mirror', {
            user: this._mirror.user ? { id: this._mirror.user.id, name: this._mirror.user.name } : null,
            version: this._mirror.version,
            expiresAt: this._mirror.expiresAt,
            boundOrigin: this._mirror.boundOrigin,
            capabilities: this._mirror.capabilities
        }, true);
        
        this._notifySubscribers();
        DiagnosticsAgent.track('session_update', { version: this._mirror.version });
        return true;
    },
    
    _bindToOrigin() {
        if (!this._mirror.token) return false;
        
        tokenBindingNonce = this._generateNonce(TOKEN_BINDING_NONCE_LENGTH);
        this._mirror.bindingNonce = tokenBindingNonce;
        this._mirror.boundOrigin = window.location.origin;
        
        IframeTransport.send(ORIGIN_BIND, {
            nonce: tokenBindingNonce,
            origin: window.location.origin,
            timestamp: Date.now()
        }).catch(() => {});
        
        return true;
    },
    
    _generateNonce(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },
    
    sync() {
        if (this._syncInProgress) return false;
        this._lastSyncAttempt = Date.now();
        this._syncInProgress = true;
        IframeTransport.send('MIRROR_SYNC', {
            childId: 'settings',
            version: this._mirror.version,
            timestamp: Date.now(),
            source: MODULE_NAME
        }, { expectAck: true, timeout: 3000 }).then(response => {
            if (response?.payload?.session) {
                this.update(response.payload.session);
            }
        }).catch(() => {}).finally(() => {
            this._syncInProgress = false;
        });
        return true;
    },
    
    subscribe(callback) {
        this._subscribers.add(callback);
        callback(this.getMirror());
        return () => this._subscribers.delete(callback);
    },
    
    _notifySubscribers() {
        const mirror = this.getMirror();
        this._subscribers.forEach(cb => {
            try { cb(mirror); } catch (e) {}
        });
    },
    
    getMirror() {
        return {
            user: this._mirror.user ? { ...this._mirror.user } : null,
            token: this._mirror.token,
            permissions: this._mirror.permissions ? { ...this._mirror.permissions } : null,
            expiresAt: this._mirror.expiresAt,
            lastSync: this._mirror.lastSync,
            version: this._mirror.version,
            isValid: this.isValid(),
            isExpired: this.isExpired(),
            boundOrigin: this._mirror.boundOrigin,
            bindingNonce: this._mirror.bindingNonce,
            capabilities: [...(this._mirror.capabilities || [])],
            lastValidated: this._mirror.lastValidated
        };
    },
    
    getUser() {
        return this._mirror.user ? { ...this._mirror.user } : null;
    },
    
    getToken() {
        return this._mirror.token;
    },
    
    validateToken() {
        if (!this._mirror.token) return false;
        if (this._mirror.boundOrigin && this._mirror.boundOrigin !== window.location.origin) {
            return false;
        }
        return !this.isExpired();
    },
    
    isValid() {
        return !!this._mirror.user && !!this._mirror.token && !this.isExpired() && this.validateToken();
    },
    
    isExpired() {
        if (!this._mirror.expiresAt) return false;
        return Date.now() >= this._mirror.expiresAt;
    },
    
    clear() {
        this._mirror = {
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
        };
        SafeStorage.remove('session_mirror');
        originBoundToken = null;
        tokenBindingNonce = null;
        this._notifySubscribers();
    },
    
    shutdown() {
        if (this._syncInterval) {
            clearInterval(this._syncInterval);
            this._syncInterval = null;
        }
        this._subscribers.clear();
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
        frameId: 'settings',
        timestamp,
        payload: payload || {},
        expectAck,
        priority,
        retryCount,
        module: MODULE_NAME,
        version: MODULE_VERSION,
        environment: IframeEnvironment.getEnvironment(),
        handshakeState: StartupGovernor.getState()
    };
    
    if (tokenAvailable && getSecureToken()) {
        canonicalMessage.token = getSecureToken();
        
        try {
            const hmacPayload = `${messageId}:${type}:${timestamp}:${canonicalMessage.token}`;
            canonicalMessage.signature = btoa(hmacPayload);
        } catch (e) {}
    }
    
    if (options.legacy) {
        canonicalMessage.legacy = true;
    }
    
    if (originBoundToken && tokenBindingNonce) {
        canonicalMessage.bindingNonce = tokenBindingNonce;
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
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}_${state.messageSequence++}`;
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
            debugLog('Parent detected:', state.parentOrigin);
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
        const checkInterval = setInterval(() => {
            if (detectParent()) {
                clearInterval(checkInterval);
                clearTimeout(timeoutId);
                resolve(true);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
        const timeoutId = setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
        }, timeout);
        state.timeouts.add(checkInterval);
        state.timeouts.add(timeoutId);
    });
}

// =============================================
// ENHANCED SEND TO PARENT 
// =============================================
export function sendToParent(payload, retryCount = 0, expectAck = false) {
    return IframeTransport.send(
        payload.type || 'UNKNOWN',
        payload.payload || payload,
        { 
            expectAck, 
            retryCount,
            timeout: payload.timeout || 5000
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
// ENHANCED STARTUP SEQUENCE 
// =============================================
export async function executeStartupSequence() {
    StartupGovernor.transition(StartupGovernor.states.WAIT_PARENT, 'starting');
    
    state.handshakeState = 'child_ready';
    state.childReadySent = true;
    
    sendLog('CHILD_READY');
    await IframeTransport.send('CHILD_READY', {
        childId: 'settings',
        frameId: 'settings',
        timestamp: Date.now(),
        protocol: PROTOCOL_CANONICAL,
        environment: IframeEnvironment.getEnvironment(),
        capabilities: {
            supportsCanonical: true,
            supportsPing: true,
            supportsSessionAck: true,
            supportsOriginBind: true,
            supportsGovernor: true,
            supportsSessionClient: true
        }
    }, { expectAck: true, timeout: 5000 }).catch(() => {});
    
    state.handshakeState = 'waiting_parent_ready';
    
    const parentReadyTimeout = setTimeout(() => {
        if (!state.parentReadyReceived) {
            state.handshakeState = 'handshake_sent';
            IframeHandshakeAuthority.startHandshake();
        }
    }, 3000);
    
    state.timeouts.add(parentReadyTimeout);
}

// =============================================
// REQUEST SESSION - FIXED WITH TIMEOUT HANDLING
// =============================================
export function requestSession(timeout = 5000) {
    clearSessionTimeouts();
    
    return new Promise((resolve) => {
        try {
            if (SessionClient.isValid()) {
                const session = SessionClient.getSession();
                const token = SessionClient.getToken();
                
                state.sessionSynced = true;
                state.authMode = 'authenticated';
                parentSessionReceived = true;
                sessionValidated = true;
                
                sendSessionAck({ user: session, token });
                successLog('Session already valid');
                
                resolve({
                    session,
                    token,
                    mode: 'authenticated',
                    fromClient: true
                });
                return;
            }
            
            const breaker = ReliabilityEngine.getCircuitBreaker('session-request');
            if (breaker && breaker.isOpen && !breaker.allow()) {
                enableGuestMode();
                resolve({ session: null, mode: 'guest', expiry: null });
                return;
            }
            
            const messageId = `session_req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            
            const handler = (message) => {
                if (message.inResponseTo === messageId || 
                    (message.type === 'SESSION_RESPONSE' && message.messageId === messageId)) {
                    cleanup();
                    
                    const payload = message.payload || message;
                    
                    if (payload.session || payload.user) {
                        const sessionData = {
                            user: payload.user || payload.session?.user,
                            token: payload.token || payload.session?.token,
                            expiresAt: payload.expiry || payload.session?.expiry,
                            permissions: payload.permissions
                        };
                        
                        SessionClient.updateSession(
                            sessionData.user,
                            sessionData.token,
                            sessionData.expiresAt
                        );
                        
                        sendSessionAck(sessionData);
                        
                        successLog('Session received');
                        resolve({
                            session: sessionData.user,
                            token: sessionData.token,
                            mode: 'authenticated',
                            expiry: sessionData.expiresAt
                        });
                        
                        if (breaker) breaker.recordSuccess();
                    } else {
                        enableGuestMode();
                        resolve({ session: null, mode: 'guest', expiry: null });
                    }
                }
            };
            
            sessionRequestTimeout = setTimeout(() => {
                cleanup();
                if (breaker) breaker.recordFailure();
                if (state.parentVerified) {
                    enableGuestMode();
                    resolve({ session: null, mode: 'guest', expiry: null });
                } else {
                    enableDemoMode();
                    resolve({ session: null, mode: 'demo', expiry: null });
                }
            }, timeout);
            
            const cleanup = () => {
                clearTimeout(sessionRequestTimeout);
                IframeTransport.off('SESSION_RESPONSE', handler);
            };
            
            IframeTransport.on('SESSION_RESPONSE', handler);
            
            sendLog('SESSION_REQUEST');
            IframeTransport.send('SESSION_REQUEST', {
                childId: 'settings',
                mirrorVersion: SessionMirror.getMirror().version,
                timestamp: Date.now()
            }, { 
                expectAck: true, 
                timeout: timeout - 500,
                messageId
            }).catch(() => {
                cleanup();
                enableDemoMode();
                resolve({ session: null, mode: 'demo', expiry: null });
            });
            
        } catch (error) {
            enableDemoMode();
            resolve({ session: null, mode: 'demo', expiry: null });
        }
    });
}

// =============================================
// ENABLE DEMO MODE 
// =============================================
function enableDemoMode() {
    if (state.authMode === 'demo') return;
    state.authMode = 'demo';
    state.parentVerified = false;
    const demoUser = {
        id: 'demo-user',
        name: 'Demo User',
        displayName: 'Demo User',
        username: 'demo_user',
        email: 'demo@example.com',
        demo: true
    };
    state.session = demoUser;
    currentUser = demoUser;
    coreData.user = demoUser;
    parentSessionReceived = false;
    sessionValidated = false;
    authReady = false;
    tokenReady = false;
    tokenAvailable = false;
    
    SessionClient.updateSession(demoUser, 'demo-token', Date.now() + 86400000);
    debugLog('Demo mode enabled');
    
    if (!userSettings) {
        userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        coreData.settings = userSettings;
    }
}

// =============================================
// ENABLE GUEST MODE 
// =============================================
function enableGuestMode() {
    if (state.authMode === 'guest') return;
    state.authMode = 'guest';
    state.session = null;
    state.sessionExpiry = null;
    state.sessionSynced = false;
    authReady = false;
    tokenReady = false;
    tokenAvailable = false;
    SessionClient.clear();
    notifyParentAuthState(false);
    debugLog('Guest mode enabled');
}

// =============================================
// INITIALIZE CORE 
// =============================================
export async function initializeCore(options = {}) {
    if (state.initialized) {
        return { success: true, mode: state.authMode, alreadyInitialized: true };
    }
    
    if (initializationInProgress) {
        return { success: false, message: 'Initialization already in progress' };
    }
    
    initializationInProgress = true;
    coreError = null;
    
    initLog('Core initialization started');
    
    const {
        handshakeTimeout = 5000,
        sessionTimeout = 5000,
        autoStart = true,
        demoMode = true,
        debug = true,
        forceParentCheck = true
    } = options;
    
    if (debug) {
        Log.enableDebug();
        DiagnosticsAgent.enable(true);
        CONSOLE_NOISE_SUPPRESSED = false;
    }
    
    try {
        StartupGovernor.transition(StartupGovernor.states.INIT, 'core_start');
        
        IframeEnvironment.detect();
        CompatibilityBridge.detect();
        
        if (!userSettings) {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = userSettings;
        }
        
        await executeStage('preflight', async () => {
            initTrustedOrigins();
            SessionMirror.init();
            setupMessageCleanup();
            setupVisibilityTracking();
            return true;
        }, { timeout: 1000, fallback: true });
        
        const dependencyResult = await executeStage('dependencyCheck', async () => {
            apiInitialized = true;
            return apiInitialized;
        }, { timeout: 1000, fallback: true });
        
        const parentResult = await executeStage('parentDetect', async () => {
            if (forceParentCheck) {
                return await waitForParent(2000);
            }
            return detectParent();
        }, { timeout: 2000, fallback: false });
        
        await executeStage('setupMessaging', async () => {
            setupMessaging();
            return true;
        }, { timeout: 1000, fallback: true });
        
        const handshake = await executeStage('handshake', async () => {
            if (parentResult) {
                return await IframeHandshakeAuthority.startHandshake({
                    timeout: handshakeTimeout,
                    retryCount: 3
                });
            }
            return { success: false, mode: 'demo' };
        }, { timeout: handshakeTimeout + 1000, fallback: { success: false, mode: 'demo' } });
        
        const session = await executeStage('sessionSync', async () => {
            if (handshake.success) {
                return await requestSession(sessionTimeout);
            }
            return { session: null, mode: 'demo', expiry: null };
        }, { timeout: sessionTimeout + 1000, fallback: { session: null, mode: 'demo', expiry: null } });
        
        if (session.session) {
            state.session = session.session;
            currentUser = session.session;
            coreData.user = session.session;
            state.authMode = session.mode;
            state.sessionSynced = true;
            
            if (!state.sessionAcked) {
                sendSessionAck(session);
            }
            
            StartupGovernor.transition(StartupGovernor.states.ACTIVE, 'session_received');
        } else {
            state.authMode = session.mode;
            StartupGovernor.transition(StartupGovernor.states.DEGRADED, 'no_session');
        }
        
        await executeStage('permissions', async () => {
            state.permissionsGranted = await checkPermissions();
            return state.permissionsGranted;
        }, { timeout: 2000, fallback: false });
        
        await executeStage('dependenciesLoad', async () => {
            state.dependenciesLoaded = await loadDependencies();
            return state.dependenciesLoaded;
        }, { timeout: 2000, fallback: true });
        
        await executeStage('loadData', async () => {
            await loadFromLocalStorage();
            await loadAllData();
            return true;
        }, { timeout: 5000, fallback: true });
        
        await executeStage('validateData', async () => {
            validateAllData();
            return true;
        }, { timeout: 1000, fallback: true });
        
        await executeStage('syncState', async () => {
            syncWithGlobalState();
            return true;
        }, { timeout: 1000, fallback: true });
        
        state.initialized = true;
        isReady = true;
        initializationInProgress = false;
        state.health.status = 'ready';
        
        startPassiveAuthMonitoring();
        startSessionWatchdog();
        
        sendLog('CORE_READY');
        IframeTransport.send('READY', {
            mode: state.authMode,
            version: MODULE_VERSION,
            protocolVersion: PROTOCOL_VERSION,
            canonical: true,
            timestamp: Date.now(),
            childId: 'settings',
            source: MODULE_NAME,
            environment: IframeEnvironment.getEnvironment()
        }, { expectAck: false }).catch(() => {});
        
        notifyParentReady();
        processMessageQueue();
        dispatchDataReadyEvent();
        executeReadyCallbacks();
        
        DiagnosticsAgent.track('core_initialized', { mode: state.authMode });
        successLog('Core initialization complete');
        
        return {
            success: true,
            mode: state.authMode,
            handshake: handshake.success,
            session: !!state.session,
            permissions: state.permissionsGranted,
            parentDetected: parentResult,
            environment: IframeEnvironment.getEnvironment()
        };
        
    } catch (error) {
        coreError = error;
        initializationInProgress = false;
        state.health.status = 'error';
        StartupGovernor.transition(StartupGovernor.states.FAILED, error.message);
        errorLog('Core initialization failed:', error);
        
        if (demoMode) {
            enableDemoMode();
            state.initialized = true;
            isReady = true;
            state.health.status = 'demo';
            syncWithGlobalState();
            executeReadyCallbacks();
            return {
                success: true,
                mode: 'demo',
                fallback: true,
                error: error.message
            };
        }
        
        return {
            success: false,
            mode: 'none',
            error: error.message
        };
    }
}

// =============================================
// EXECUTE STAGE 
// =============================================
async function executeStage(stageName, fn, options = {}) {
    const { timeout = 5000, fallback = null } = options;
    try {
        const timeoutPromise = new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error(`${stageName} timeout after ${timeout}ms`)), timeout);
            state.timeouts.add(timer);
        });
        const result = await Promise.race([fn(), timeoutPromise]);
        debugLog(`Stage ${stageName} completed`);
        return result;
    } catch (error) {
        debugLog(`Stage ${stageName} failed:`, error);
        if (fallback !== null) {
            return typeof fallback === 'function' ? fallback() : fallback;
        }
        throw error;
    }
}

// =============================================
// SHUTDOWN CORE 
// =============================================
export function shutdownCore() {
    try {
        if (state.pingInterval) {
            clearInterval(state.pingInterval);
            state.pingInterval = null;
        }
        if (state.pongTimeout) {
            clearTimeout(state.pongTimeout);
            state.pongTimeout = null;
        }
        
        if (state.visibilityHandler) {
            document.removeEventListener('visibilitychange', state.visibilityHandler);
        }
        
        IframeTransport.send('SHUTDOWN', {
            reason: 'normal_shutdown',
            timestamp: Date.now(),
            childId: 'settings',
            source: MODULE_NAME
        }, { expectAck: false }).catch(() => {});
        
        state.intervals.forEach(interval => clearInterval(interval));
        state.intervals.clear();
        state.timeouts.forEach(timeout => clearTimeout(timeout));
        state.timeouts.clear();
        
        if (state.tokenCheckInterval) {
            clearInterval(state.tokenCheckInterval);
            state.tokenCheckInterval = null;
        }
        if (state.authCheckInterval) {
            clearInterval(state.authCheckInterval);
            state.authCheckInterval = null;
        }
        if (state.handshakeInterval) {
            clearInterval(state.handshakeInterval);
            state.handshakeInterval = null;
        }
        if (state.heartbeatInterval) {
            clearInterval(state.heartbeatInterval);
            state.heartbeatInterval = null;
        }
        if (state.sessionWatchdog) {
            clearInterval(state.sessionWatchdog);
            state.sessionWatchdog = null;
        }
        if (state.messageIdCleanupTimer) {
            clearInterval(state.messageIdCleanupTimer);
            state.messageIdCleanupTimer = null;
        }
        
        state.listeners.forEach(listener => {
            if (listener.element) {
                listener.element.removeEventListener(listener.type, listener.handler, listener.options);
            } else {
                window.removeEventListener(listener.type, listener.handler, listener.options);
            }
        });
        state.listeners.clear();
        
        state.messageHandlers.clear();
        state.pendingMessages.forEach((pending, id) => {
            if (pending.timeout) clearTimeout(pending.timeout);
            if (pending.reject) pending.reject(new Error('Core shutting down'));
        });
        state.pendingMessages.clear();
        state.pendingAcks.forEach((ack, id) => {
            if (ack.timeout) clearTimeout(ack.timeout);
            if (ack.reject) ack.reject(new Error('Core shutting down'));
        });
        state.pendingAcks.clear();
        state.processedMessageIds.clear();
        
        SessionMirror.shutdown();
        SessionClient.clear();
        
        state.initialized = false;
        state.parentVerified = false;
        state.handshakeCompleted = false;
        state.sessionSynced = false;
        state.health.status = 'shutdown';
        
        isReady = false;
        initializationInProgress = false;
        parentReady = false;
        parentCommunicationReady = false;
        parentSessionReceived = false;
        sessionValidated = false;
        authReady = false;
        tokenReady = false;
        tokenAvailable = false;
        backgroundTasksStarted = false;
        
        debugLog('Core shutdown complete');
        return true;
        
    } catch (error) {
        return false;
    }
}

// =============================================
// BACKGROUND SERVICES 
// =============================================
function startSessionWatchdog() {
    if (state.sessionWatchdog) clearInterval(state.sessionWatchdog);
    state.sessionWatchdog = setInterval(() => {
        if (state.authMode === 'authenticated' && SessionClient.isExpired()) {
            requestSession(5000).catch(() => {});
        }
    }, 60000);
    state.intervals.add(state.sessionWatchdog);
}

function setupMessageCleanup() {
    if (state.messageIdCleanupTimer) clearInterval(state.messageIdCleanupTimer);
    state.messageIdCleanupTimer = setInterval(() => {
        if (state.processedMessageIds.size > 100) {
            const ids = Array.from(state.processedMessageIds);
            state.processedMessageIds = new Set(ids.slice(-50));
        }
    }, 60000);
    state.timeouts.add(state.messageIdCleanupTimer);
}

// =============================================
// UI EXPORTS 
// =============================================
export function verifyParentPresence() {
    return detectParent();
}

export function setupSecureMessagingChannel() {
    setupMessaging();
    return true;
}

export function resetUIForLogout() {
    try {
        currentUser = null;
        coreData.user = null;
        state.session = null;
        state.sessionSynced = false;
        parentSessionData = null;
        parentSessionReceived = false;
        sessionValidated = false;
        tokenReady = false;
        tokenAvailable = false;
        authReady = false;
        backgroundTasksStarted = false;
        unsavedChanges = false;
        SessionMirror.clear();
        SessionClient.clear();
        
        state.handshakeState = 'pending';
        state.parentReadyReceived = false;
        state.childReadySent = false;
        state.handshakeAcked = false;
        state.sessionAcked = false;
        originBoundToken = null;
        tokenBindingNonce = null;
        
        StartupGovernor.reset();
        IframeHandshakeAuthority.reset();
        OriginAdapter.reset();
        
        debugLog('UI reset for logout');
        return true;
    } catch (error) {
        return false;
    }
}

export function showReconnectionState() {
    try {
        const event = new CustomEvent('coreReconnecting', {
            detail: {
                timestamp: Date.now(),
                attempts: state.health.recoveryAttempts,
                mode: state.authMode,
                handshakeState: state.handshakeState,
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

export function getCoreDiagnostics() {
    return DiagnosticsAgent.getFullReport();
}

export function checkAuthenticationState() {
    try {
        if (SessionClient.isValid()) return true;
        if (parentSessionReceived || state.authMode === 'authenticated' || tokenReady) return true;
        if (state.authMode === 'demo') return true;
        return false;
    } catch (error) {
        return false;
    }
}

export async function bootstrapIframe() {
    try {
        IframeEnvironment.detect();
        CompatibilityBridge.detect();
        OriginAdapter.init();
        detectParent();
        setupMessaging();
        await loadFromLocalStorage();
        SessionMirror.init();
        SessionClient.init();
        ReliabilityEngine.init();
        MultiModuleCoordinator.init();
        NavigationGuard.init();
        UIFailsafe.init();
        RecoveryManager.init();
        
        executeStartupSequence();
        
        return true;
    } catch (error) {
        return false;
    }
}

export async function waitForSession(timeout = 10000) {
    return new Promise((resolve) => {
        if (SessionClient.isValid()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            try {
                if (SessionClient.isValid() || (parentSessionReceived && sessionValidated)) {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            } catch (error) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
        const timeoutId = setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
        }, timeout);
        state.timeouts.add(checkInterval);
        state.timeouts.add(timeoutId);
    });
}

export function initializeBasicUI() {
    try {
        if (!userSettings) {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = userSettings;
        }
        const event = new CustomEvent('basicUIReady', {
            detail: {
                timestamp: Date.now(),
                mode: state.authMode,
                handshakeState: state.handshakeState,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

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
                                IframeTransport.send('CHILD_CLOSING', {
                                    childId: 'settings',
                                    timestamp: Date.now(),
                                    source: MODULE_NAME,
                                    unsavedChanges: true
                                }, { expectAck: false }).catch(() => {});
                            }
                        }
                    });
                    window.dispatchEvent(event);
                } else {
                    IframeTransport.send('CHILD_CLOSING', {
                        childId: 'settings',
                        timestamp: Date.now(),
                        source: MODULE_NAME
                    }, { expectAck: false }).catch(() => {});
                }
            };
            backToAppBtn.addEventListener('click', handler);
            state.listeners.add({ type: 'click', handler, options: false, element: backToAppBtn });
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

export function startTokenMonitoring() {
    try {
        if (state.tokenCheckInterval) {
            clearInterval(state.tokenCheckInterval);
            state.tokenCheckInterval = null;
        }
        state.tokenCheckInterval = setInterval(() => {
            try {
                checkTokenAvailability();
            } catch (error) {}
        }, TOKEN_CHECK_INTERVAL);
        state.intervals.add(state.tokenCheckInterval);
        setTimeout(() => checkTokenAvailability(), 500);
    } catch (error) {}
}

export function checkTokenAvailability() {
    try {
        if (SessionClient.isValid()) {
            if (!tokenAvailable) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                notifyTokenReady();
            }
            return;
        }
        if (parentSessionData && parentSessionData.token) {
            if (!tokenAvailable) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                notifyTokenReady();
            }
            return;
        }
        const token = getSecureToken();
        if (token && token !== '' && token !== 'null' && token !== 'undefined') {
            if (!tokenAvailable) {
                tokenAvailable = true;
                tokenReady = true;
                authReady = true;
                if (!backgroundTasksStarted) {
                    startBackgroundTasks();
                }
                notifyTokenReady();
            }
        } else {
            if (tokenAvailable) {
                tokenAvailable = false;
                tokenReady = false;
                authReady = false;
                notifyTokenLost();
            }
        }
    } catch (error) {}
}

export function notifyTokenReady() {
    try {
        authReady = true;
        if (!backgroundTasksStarted) {
            startBackgroundTasks();
        }
        notifyParentAuthState(true);
        const event = new CustomEvent('tokenReady', {
            detail: {
                timestamp: Date.now(),
                mode: state.authMode
            }
        });
        window.dispatchEvent(event);
        debugLog('Token ready');
    } catch (error) {}
}

export function notifyTokenLost() {
    try {
        authReady = false;
        backgroundTasksStarted = false;
        notifyParentAuthState(false);
        const event = new CustomEvent('tokenLost', {
            detail: {
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        debugLog('Token lost');
    } catch (error) {}
}

export function getSecureToken() {
    try {
        if (originBoundToken && originBoundToken !== '' && originBoundToken !== 'null' && originBoundToken !== 'undefined') {
            return originBoundToken;
        }
        
        const clientToken = SessionClient.getToken();
        if (clientToken && clientToken !== '' && clientToken !== 'null' && clientToken !== 'undefined') {
            originBoundToken = clientToken;
            return clientToken;
        }
        
        const mirrorToken = SessionMirror.getToken();
        if (mirrorToken && mirrorToken !== '' && mirrorToken !== 'null' && mirrorToken !== 'undefined') {
            originBoundToken = mirrorToken;
            return mirrorToken;
        }
        if (parentSessionData && parentSessionData.token) {
            originBoundToken = parentSessionData.token;
            return parentSessionData.token;
        }
        const legacyTokens = [
            SafeStorage.get('token', null),
            SafeStorage.get('USER_TOKEN', null),
            SafeStorage.get('accessToken', null)
        ];
        for (const legacyToken of legacyTokens) {
            if (legacyToken && legacyToken !== 'null' && legacyToken !== 'undefined') {
                originBoundToken = legacyToken;
                return legacyToken;
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SECURE FETCH WRAPPER - ROUTES THROUGH PARENT
// =============================================
export async function secureFetchWrapper(endpoint, method = 'GET', data = null, options = {}) {
    try {
        if (state.authMode === 'demo') {
            return simulateResponse(endpoint, method);
        }
        
        // Route through parent instead of direct API call
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
        if (state.authMode === 'demo') {
            return simulateResponse(endpoint, method, true);
        }
        
        return {
            success: false,
            status: 'error',
            message: 'Request failed',
            data: null
        };
    }
}

function simulateResponse(endpoint, method, useFallback = false) {
    const normalized = endpoint.toLowerCase();
    
    if (normalized.includes('/settings') || normalized.includes('/api/settings')) {
        return { 
            success: true, 
            data: { settings: userSettings || DEFAULT_SETTINGS },
            settings: userSettings || DEFAULT_SETTINGS
        };
    }
    if (normalized.includes('/friends') || normalized.includes('/api/friends')) {
        return { 
            success: true, 
            data: { friendsList: coreData.friendsList || [] },
            friendsList: coreData.friendsList || [] 
        };
    }
    if (normalized.includes('/groups') || normalized.includes('/api/groups')) {
        return { 
            success: true, 
            data: { groupsList: coreData.groupsList || [] },
            groupsList: coreData.groupsList || [] 
        };
    }
    if (normalized.includes('/notifications') || normalized.includes('/api/notifications')) {
        return { 
            success: true, 
            data: { notifications: coreData.notifications || [] },
            notifications: coreData.notifications || [] 
        };
    }
    if (normalized.includes('/chats/history') || normalized.includes('/api/chats/history')) {
        return { 
            success: true, 
            data: { chatHistory: coreData.chatHistory || [] },
            chatHistory: coreData.chatHistory || [] 
        };
    }
    if (normalized.includes('/users/blocked') || normalized.includes('/api/users/blocked')) {
        return { 
            success: true, 
            data: { blockedUsers: blockedUsers || [] },
            blockedUsers: blockedUsers || [] 
        };
    }
    if (normalized.includes('/auth/sessions') || normalized.includes('/api/auth/sessions')) {
        return { 
            success: true, 
            data: { sessions: activeSessions || [] },
            sessions: activeSessions || [] 
        };
    }
    if (normalized.includes('/contacts') || normalized.includes('/api/contacts')) {
        return { 
            success: true, 
            data: { contacts: userContacts || [] },
            contacts: userContacts || [] 
        };
    }
    if (normalized.includes('/group') || normalized.includes('/api/group')) {
        return { 
            success: true, 
            data: { groups: userGroups || [] },
            groups: userGroups || [] 
        };
    }
    
    return { 
        success: true, 
        data: null,
        message: 'Mock response' 
    };
}

export async function waitForToken(timeout = 10000) {
    return new Promise((resolve) => {
        if (tokenReady || SessionClient.isValid()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            try {
                if (tokenReady || SessionClient.isValid()) {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            } catch (error) {
                clearInterval(checkInterval);
                resolve(false);
            }
        }, 100);
        const timeoutId = setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
        }, timeout);
        state.timeouts.add(checkInterval);
        state.timeouts.add(timeoutId);
    });
}

export function startPassiveAuthMonitoring() {
    try {
        if (state.authCheckInterval) {
            clearInterval(state.authCheckInterval);
            state.authCheckInterval = null;
        }
        state.authCheckInterval = setInterval(() => {
            try {
                checkTokenAvailability();
            } catch (error) {}
        }, AUTH_CHECK_INTERVAL);
        state.intervals.add(state.authCheckInterval);
        setTimeout(() => checkTokenAvailability(), 1000);
    } catch (error) {}
}

export function startBackgroundTasks() {
    try {
        if (backgroundTasksStarted) return;
        if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') return;
        
        backgroundTasksStarted = true;
        
        Promise.allSettled([
            safeLoadUserData(),
            safeLoadSettings(),
            safeLoadBlockedUsers(),
            safeLoadActiveSessions(),
            safeLoadUserContacts(),
            safeLoadUserGroups()
        ]).then((results) => {}).catch(() => {});
    } catch (error) {
        backgroundTasksStarted = false;
    }
}

export async function safeLoadUserData() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') {
        return null;
    }
    try {
        const clientUser = SessionClient.getSession();
        if (clientUser) {
            currentUser = clientUser;
            coreData.user = clientUser;
            state.session = clientUser;
            SafeStorage.setJSON('current_user', currentUser);
            return currentUser;
        }
        const mirrorUser = SessionMirror.getUser();
        if (mirrorUser) {
            currentUser = mirrorUser;
            coreData.user = mirrorUser;
            state.session = mirrorUser;
            SafeStorage.setJSON('current_user', currentUser);
            return currentUser;
        }
        if (parentSessionData && parentSessionData.user) {
            currentUser = parentSessionData.user;
            coreData.user = parentSessionData.user;
            state.session = parentSessionData.user;
            SessionClient.updateSession(parentSessionData.user);
            SafeStorage.setJSON('current_user', currentUser);
            return currentUser;
        }
        return null;
    } catch (error) {
        return null;
    }
}

export async function safeLoadSettings() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') {
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

export async function safeLoadBlockedUsers() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') return null;
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

export async function safeLoadActiveSessions() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') return null;
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

export async function safeLoadUserContacts() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') return null;
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

export async function safeLoadUserGroups() {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') return null;
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

export async function makeSafeRequest(endpoint, method = 'GET', data = null, options = {}) {
    if (!tokenReady && !parentSessionReceived && state.authMode === 'guest') {
        throw new Error('Authentication not available');
    }
    return await secureFetchWrapper(endpoint, method, data, options);
}

export async function saveSettings() {
    try {
        SafeStorage.setJSON('user_settings', userSettings);
        coreData.settings = userSettings;
        
        if (tokenReady || parentSessionReceived || state.authMode === 'authenticated') {
            await secureFetchWrapper('/api/settings', 'POST', { settings: userSettings });
            
            // Notify parent about settings update
            await sendToParent({
                type: PARENT_MESSAGE_TYPES.SETTINGS_UPDATED,
                section: currentSection,
                settings: userSettings,
                timestamp: Date.now()
            }, 0, false);
        }
        
        unsavedChanges = false;
        const event = new CustomEvent('settingsSaved', {
            detail: {
                timestamp: Date.now(),
                settings: userSettings,
                section: currentSection
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        SafeStorage.setJSON('user_settings', userSettings);
        coreData.settings = userSettings;
        throw error;
    }
}

export function notifyParentAuthState(hasAuth) {
    try {
        IframeTransport.send('IFRAME_AUTH_STATE', {
            hasAuth: hasAuth,
            iframeId: 'settings',
            tokenReady: tokenReady,
            timestamp: Date.now(),
            source: MODULE_NAME,
            mirrorVersion: SessionMirror.getMirror().version,
            handshakeState: state.handshakeState,
            environment: IframeEnvironment.getEnvironment()
        }, { expectAck: false }).catch(() => {});
    } catch (error) {}
}

export function notifyParentAuthError() {
    if (authErrorNotified) return;
    try {
        IframeTransport.send('IFRAME_AUTH_ERROR', {
            iframeId: 'settings',
            message: 'Authentication required',
            tokenExpired: true,
            timestamp: Date.now(),
            source: MODULE_NAME
        }, { expectAck: false }).catch(() => {});
        authErrorNotified = true;
    } catch (error) {}
}

export async function loadFromLocalStorage() {
    try {
        const cachedUser = SafeStorage.getJSON('current_user', null);
        if (cachedUser) {
            currentUser = cachedUser;
            coreData.user = cachedUser;
            state.session = cachedUser;
        } else {
            currentUser = { displayName: 'User', id: 'local-user' };
            coreData.user = { displayName: 'User', id: 'local-user' };
            state.session = { displayName: 'User', id: 'local-user' };
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
        state.session = { displayName: 'User', id: 'local-user' };
        return false;
    }
}

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

export function initializeUI() {
    try {
        const event = new CustomEvent('coreUIInitialized', {
            detail: {
                timestamp: Date.now(),
                mode: state.authMode,
                user: currentUser,
                handshakeState: state.handshakeState,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

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

export function formatStorageSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

export async function terminateSession(sessionId) {
    try {
        await makeSafeRequest('/api/auth/terminate-session', 'POST', { sessionId });
        await safeLoadActiveSessions();
        
        await sendToParent({
            type: PARENT_MESSAGE_TYPES.SESSION_TERMINATED,
            sessionId,
            timestamp: Date.now()
        }, 0, false);
        
        return true;
    } catch (error) {
        throw error;
    }
}

export async function terminateAllSessions() {
    try {
        await makeSafeRequest('/api/auth/terminate-all-sessions', 'POST');
        await safeLoadActiveSessions();
        
        await sendToParent({
            type: PARENT_MESSAGE_TYPES.ALL_SESSIONS_TERMINATED,
            timestamp: Date.now()
        }, 0, false);
        
        return true;
    } catch (error) {
        throw error;
    }
}

export async function unblockUser(userId) {
    try {
        await makeSafeRequest('/api/users/unblock', 'POST', { userId });
        await safeLoadBlockedUsers();
        
        await sendToParent({
            type: PARENT_MESSAGE_TYPES.USER_UNBLOCKED,
            userId,
            timestamp: Date.now()
        }, 0, false);
        
        return true;
    } catch (error) {
        throw error;
    }
}

export async function clearChatCache() {
    try {
        await makeSafeRequest('/api/storage/clear-chat-cache', 'POST');
        if (userSettings.storage) {
            userSettings.storage.storageBreakdown.chats = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.media || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
        }
        unsavedChanges = true;
        calculateStorageUsage();
        
        await sendToParent({
            type: PARENT_MESSAGE_TYPES.CACHE_CLEARED,
            cacheType: 'chat',
            timestamp: Date.now()
        }, 0, false);
        
        return true;
    } catch (error) {
        throw error;
    }
}

export async function clearMediaCache() {
    try {
        await makeSafeRequest('/api/storage/clear-media-cache', 'POST');
        if (userSettings.storage) {
            userSettings.storage.storageBreakdown.media = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.chats || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
        }
        unsavedChanges = true;
        calculateStorageUsage();
        
        await sendToParent({
            type: PARENT_MESSAGE_TYPES.CACHE_CLEARED,
            cacheType: 'media',
            timestamp: Date.now()
        }, 0, false);
        
        return true;
    } catch (error) {
        throw error;
    }
}

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
    state.listeners.add({
        type: 'message',
        handler: handleIncomingMessage,
        options: false
    });
}

async function checkPermissions() {
    return state.authMode === 'authenticated' && !!state.session;
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
        const token = getSecureToken();
        if (!token && endpoint !== '/api/settings' && state.authMode !== 'demo') {
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
                handshakeState: state.handshakeState,
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
            IframeTransport.send('CORE_READY', {
                payload: {
                    iframeId: 'settings',
                    status: 'success',
                    dataTypes: Object.keys(coreData).filter(key => coreData[key] !== null),
                    timestamp: Date.now(),
                    mode: state.authMode,
                    mirrorVersion: SessionMirror.getMirror().version,
                    handshakeState: state.handshakeState,
                    protocol: PROTOCOL_CANONICAL,
                    environment: IframeEnvironment.getEnvironment()
                },
                source: MODULE_NAME
            }, { expectAck: false }).catch(() => {});
        }
    } catch (error) {}
}

function notifyParentError(error) {
    try {
        if (window.parent !== window) {
            IframeTransport.send('ERROR', {
                payload: {
                    iframeId: 'settings',
                    message: error.message,
                    timestamp: Date.now()
                },
                source: MODULE_NAME
            }, { expectAck: false }).catch(() => {});
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
// MESSAGE HANDLER - WITH DEDUPLICATION
// =============================================
function handleIncomingMessage(event) {
    try {
        if (!OriginAdapter.isTrusted(event.origin)) {
            if (!untrustedOriginLogged) {
                untrustedOriginLogged = true;
                debugLog('Untrusted origin:', event.origin);
            }
            return;
        }
        
        if (!isFromParent(event)) {
            if (event.source === window) return;
            return;
        }
        
        let message = event.data;
        if (!message || typeof message !== 'object' || !message.type) {
            return;
        }
        
        // DEDUPLICATION
        if (isMessageDuplicate(message.messageId || message.requestId, message.type)) {
            return;
        }
        
        if (CompatibilityBridge.isEnabled()) {
            message = CompatibilityBridge.translateIncoming(message);
        }
        
        receiveLog(message.type);
        Log.trackReceive();
        DiagnosticsAgent.track('message_received', { type: message.type });
        
        if (message.source === MODULE_NAME) {
            return;
        }
        
        if (message.type === 'ACK' && message.inResponseTo) {
            const pending = state.pendingAcks.get(message.inResponseTo);
            if (pending) {
                clearTimeout(pending.timeout);
                state.health.acksReceived++;
                pending.resolve({ acknowledged: true, ...message });
                state.pendingAcks.delete(message.inResponseTo);
                
                const breaker = ReliabilityEngine.getCircuitBreaker('sendToParent');
                if (breaker) breaker.recordSuccess();
            }
            return;
        }
        
        if (message.type === 'PONG') {
            state.health.lastPong = Date.now();
            state.health.pingFailures = 0;
            state.connectionQuality = 'good';
            if (state.pongTimeout) {
                clearTimeout(state.pongTimeout);
                state.pongTimeout = null;
            }
            return;
        }
        
        if (message.type === 'PING') {
            IframeTransport.send('PONG', {
                inResponseTo: message.messageId,
                timestamp: Date.now()
            }, { expectAck: false }).catch(() => {});
            return;
        }
        
        if (message.type === 'MIRROR_UPDATE' && message.session) {
            SessionMirror.update(message.session);
            return;
        }
        
        if (message.type === 'PARENT_READY') {
            state.parentReadyReceived = true;
            parentReady = true;
            IframeHandshakeAuthority.onParentReady();
            
            if (state.handshakeState === 'waiting_parent_ready') {
                state.handshakeState = 'handshake_sent';
                IframeHandshakeAuthority.startHandshake();
            }
            return;
        }
        
        if (message.messageId && state.processedMessageIds.has(message.messageId)) {
            return;
        }
        
        if (message.messageId) {
            state.processedMessageIds.add(message.messageId);
            if (state.processedMessageIds.size > 100) {
                const ids = Array.from(state.processedMessageIds);
                state.processedMessageIds = new Set(ids.slice(-50));
            }
        }
        
        if (!isReady && message.type !== 'INIT' && 
            message.type !== 'SESSION_RESPONSE') {
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
                handleLogout();
                break;
            case 'PARENT_READY_ACK':
                parentReady = true;
                parentCommunicationReady = true;
                break;
            case 'AUTH_READY':
                authReady = true;
                checkTokenAvailability();
                break;
            case 'AUTH_LOST':
                authReady = false;
                tokenReady = false;
                tokenAvailable = false;
                backgroundTasksStarted = false;
                break;
            case 'TOKEN_READY':
                handleTokenReady();
                break;
            case 'TOKEN_RESPONSE':
                if (message.token) {
                    SessionClient.updateSession(null, message.token);
                }
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
                IframeTransport.send('HEARTBEAT', {
                    status: state.health.status,
                    timestamp: Date.now(),
                    childId: 'settings',
                    source: MODULE_NAME
                }, { expectAck: false }).catch(() => {});
                break;
            case 'SHUTDOWN':
                shutdownCore();
                break;
            case 'SESSION_INIT':
                if (message.session) {
                    SessionClient.updateSession(
                        message.session.user,
                        message.session.token,
                        message.session.expiry
                    );
                }
                IframeTransport.send('SESSION_CONFIRMED', {
                    childId: 'settings',
                    timestamp: Date.now(),
                    source: MODULE_NAME
                }, { expectAck: false }).catch(() => {});
                break;
            case 'HANDSHAKE_RESPONSE':
                if (message.session) {
                    SessionClient.updateSession(
                        message.session.user,
                        message.session.token,
                        message.session.expiry
                    );
                }
                break;
            case 'RECOVERY_RESPONSE':
                state.health.recoveryAttempts++;
                if (message.session) {
                    SessionClient.updateSession(
                        message.session.user,
                        message.session.token,
                        message.session.expiry
                    );
                }
                break;
            case 'RECOVERY_REQUEST':
                handleRecoveryRequest(message);
                break;
            case 'ORIGIN_BIND_ACK':
                if (message.success) {}
                break;
            case 'SESSION_SYNC':
                if (message.version && message.version !== SessionClient._sessionVersion) {
                    SessionClient.sync();
                }
                break;
            default:
                break;
        }
    } catch (error) {}
}

function handleRecoveryRequest(message) {
    state.handshakeCompleted = false;
    state.sessionSynced = false;
    state.parentVerified = false;
    
    setTimeout(() => {
        IframeHandshakeAuthority.startHandshake({ force: true }).catch(() => {});
    }, 100);
    
    IframeTransport.send('RECOVERY_RESPONSE', {
        childId: 'settings',
        accepted: true,
        timestamp: Date.now()
    }, { expectAck: false }).catch(() => {});
}

function handleInitMessage(message) {
    try {
        if (message.payload) {
            if (message.payload.session) {
                SessionClient.updateSession(
                    message.payload.session.user,
                    message.payload.session.token,
                    message.payload.session.expiry
                );
            }
            if (message.payload.settings) {
                coreData.settings = message.payload.settings;
                userSettings = message.payload.settings;
            }
        }
        IframeTransport.send('INIT_ACK', {
            childId: 'settings',
            timestamp: Date.now(),
            source: MODULE_NAME,
            mirrorVersion: SessionMirror.getMirror().version
        }, { expectAck: false }).catch(() => {});
    } catch (error) {}
}

function handleSessionResponse(message) {
    try {
        if (!message.token && !message.user && !message.session) {
            return;
        }
        const sessionData = {
            user: message.user || message.session?.user,
            token: message.token || message.session?.token,
            expiresAt: message.expiry || message.session?.expiry
        };
        SessionClient.updateSession(
            sessionData.user,
            sessionData.token,
            sessionData.expiresAt
        );
        
        sendSessionAck(sessionData);
        
        IframeTransport.send('SESSION_CONFIRMED', {
            childId: 'settings',
            timestamp: Date.now(),
            received: true,
            validated: true,
            source: MODULE_NAME,
            mirrorVersion: SessionMirror.getMirror().version
        }, { expectAck: false }).catch(() => {});
    } catch (error) {}
}

function handleSessionUpdate(message) {
    try {
        if (message.session) {
            SessionClient.updateSession(
                message.session.user,
                message.session.token,
                message.session.expiry
            );
            
            IframeTransport.send('SESSION_UPDATE_ACK', {
                childId: 'settings',
                timestamp: Date.now()
            }, { expectAck: false }).catch(() => {});
        }
    } catch (error) {}
}

function handleLogout() {
    try {
        parentSessionData = null;
        parentSessionReceived = false;
        sessionValidated = false;
        SessionMirror.clear();
        SessionClient.clear();
        currentUser = null;
        coreData.user = null;
        state.session = null;
        state.sessionSynced = false;
        tokenReady = false;
        tokenAvailable = false;
        authReady = false;
        backgroundTasksStarted = false;
        isReady = false;
        
        state.handshakeState = 'pending';
        state.parentReadyReceived = false;
        state.childReadySent = false;
        state.handshakeAcked = false;
        state.sessionAcked = false;
        
        StartupGovernor.reset();
        IframeHandshakeAuthority.reset();
        
        IframeTransport.send('LOGOUT_CONFIRMED', {
            childId: 'settings',
            timestamp: Date.now(),
            source: MODULE_NAME
        }, { expectAck: false }).catch(() => {});
    } catch (error) {}
}

function handleTokenReady() {
    checkTokenAvailability();
}

function handleUserUpdated(data) {
    try {
        if (data.user) {
            SessionClient.updateSession(data.user, null, null);
        }
    } catch (error) {}
}

async function handleRefreshData(message) {
    try {
        const dataType = message.payload?.dataType;
        if (dataType && coreData.hasOwnProperty(dataType)) {
            await loadData(dataType, getEndpointForDataType(dataType));
            syncWithGlobalState();
            IframeTransport.send('DATA_REFRESHED', {
                childId: 'settings',
                dataType: dataType,
                timestamp: Date.now(),
                source: MODULE_NAME
            }, { expectAck: false }).catch(() => {});
            dispatchDataUpdatedEvent(dataType);
        } else {
            await loadAllData();
            syncWithGlobalState();
            IframeTransport.send('ALL_DATA_REFRESHED', {
                childId: 'settings',
                timestamp: Date.now(),
                source: MODULE_NAME
            }, { expectAck: false }).catch(() => {});
            dispatchDataUpdatedEvent('all');
        }
    } catch (error) {
        IframeTransport.send('REFRESH_ERROR', {
            childId: 'settings',
            error: error.message,
            timestamp: Date.now(),
            source: MODULE_NAME
        }, { expectAck: false }).catch(() => {});
    }
}

function handleUpdateData(message) {
    try {
        const { dataType, payload } = message;
        if (dataType && coreData.hasOwnProperty(dataType)) {
            updateData(dataType, payload);
            IframeTransport.send('DATA_UPDATED', {
                childId: 'settings',
                dataType: dataType,
                timestamp: Date.now(),
                source: MODULE_NAME
            }, { expectAck: false }).catch(() => {});
        }
    } catch (error) {}
}

function sendSessionAck(sessionData) {
    state.sessionAcked = true;
    
    IframeTransport.send('SESSION_ACK', {
        childId: 'settings',
        sessionVersion: sessionData?.version || 0,
        timestamp: Date.now()
    }, { expectAck: false }).catch(() => {});
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
// BUILD SETTINGS MENU - COMPATIBILITY STUB 
// =============================================
export function buildSettingsMenu(container = null, config = {}) {
    try {
        const event = new CustomEvent('buildSettingsMenu', {
            detail: {
                container,
                config,
                menu: SETTINGS_MENU,
                timestamp: Date.now(),
                mode: state.authMode,
                authenticated: SessionClient.isValid()
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
            if (isReady) {
                SessionClient.sync().catch(() => {});
                if (currentSection) {
                    loadSection(currentSection).catch(() => {});
                }
            }
            
            IframeTransport.send('VISIBILITY_RESUME', {
                childId: 'settings',
                timestamp: Date.now()
            }, { expectAck: false }).catch(() => {});
        }
    });
}

// =============================================
// LOAD SECTION FUNCTION - ADDED FOR UI INTEGRATION
// =============================================
export async function loadSection(sectionId) {
    if (!isReady) {
        await new Promise(resolve => {
            const checkReady = setInterval(() => {
                if (isReady) {
                    clearInterval(checkReady);
                    resolve();
                }
            }, 100);
        });
    }
    
    currentSection = sectionId;
    
    const event = new CustomEvent('settingsSectionChanged', {
        detail: {
            section: sectionId,
            timestamp: Date.now(),
            authenticated: checkAuthenticationState()
        }
    });
    window.dispatchEvent(event);
    
    return true;
}

// =============================================
// AUTO-START WITH RETRY 
// =============================================
document.addEventListener('DOMContentLoaded', function() {
    try {
        initLog('DOMContentLoaded - starting core initialization');
        setTimeout(() => {
            initializeCore({ 
                demoMode: true,
                forceParentCheck: true,
                handshakeTimeout: 3000,
                debug: true
            }).then(result => {
                if (result.success) {
                    successLog('Core initialized in mode:', result.mode);
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
// EXPORT ALIASES FOR BACKWARD COMPATIBILITY 
// =============================================
export {
    requestSession as requestSessionFromParent,
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
    return IframeTransport.send(type, payload, { expectAck: true, timeout });
};

export const broadcastToAllIframes = (type, payload) => {
    const iframes = ['messagesIframe', 'statusIframe', 'groupIframe', 'friendsIframe', 'callsIframe', 'settingsIframe', 'toolsIframe'];
    iframes.forEach(frameId => {
        IframeTransport.send(type, {
            target: frameId,
            ...payload
        }, { expectAck: false }).catch(() => {});
    });
};

export const getParentOrigin = () => state.parentOrigin || '*';

export const isParentAvailable = () => state.parentVerified && !!state.parentWindow;

export const getHealthMetrics = () => ({
    uptime: Date.now() - Log._metrics.startTime,
    messagesSent: Log._metrics.messagesSent,
    messagesReceived: Log._metrics.messagesReceived,
    errors: Log._metrics.errors,
    warnings: Log._metrics.warnings,
    handshakeAttempts: Log._metrics.handshakeAttempts,
    recoveryAttempts: Log._metrics.recoveryAttempts,
    handshakeState: state.handshakeState,
    connectionQuality: state.connectionQuality,
    pageVisible: state.pageVisible,
    parentVerified: state.parentVerified,
    authMode: state.authMode,
    sessionValid: SessionClient.isValid(),
    environment: IframeEnvironment.getEnvironment(),
    governorState: StartupGovernor.getState()
});

// =============================================
// ERROR BOUNDARY 
// =============================================
window.addEventListener('error', (event) => {
    state.health.failures++;
    DiagnosticsAgent.error(event.error, 'global_error');
    errorLog('Global error:', event.error);
    
    if (event.target && event.target.tagName === 'SCRIPT') {
        event.preventDefault();
        return false;
    }
    
    if (state.health.failures > 10 && isReady) {
        state.health.recoveryAttempts++;
        RecoveryManager.attemptRecovery({ reason: 'global_error' });
    }
    return true;
});

window.addEventListener('unhandledrejection', (event) => {
    state.health.failures++;
    DiagnosticsAgent.error(event.reason, 'unhandled_rejection');
    errorLog('Unhandled rejection:', event.reason);
    
    if (state.health.failures > 5 && isReady) {
        state.health.recoveryAttempts++;
        setTimeout(() => {
            RecoveryManager.attemptRecovery({ reason: 'unhandled_rejection' });
        }, 1000);
    }
});

// =============================================
// RECOVERY MECHANISM 
// =============================================
function attemptRecovery() {
    RecoveryManager.attemptRecovery({ reason: state.health.lastError });
}

export function triggerRecovery() {
    RecoveryManager.attemptRecovery({ reason: 'manual_trigger' });
}

export const forceRecovery = () => {
    RecoveryManager.reset();
    RecoveryManager.attemptRecovery({ reason: 'manual_force' });
};

// =============================================
// SET ALL COMPONENTS TO SILENT MODE - DISABLED FOR DEBUG
// =============================================
export function setSilentMode(silent = false) {
    CONSOLE_NOISE_SUPPRESSED = silent;
    Log.setSilent(silent);
    StartupGovernor.setSilent(silent);
    IframeTransport.setSilent(silent);
    IframeHandshakeAuthority.setSilent(silent);
    SessionClient.setSilent(silent);
    ReliabilityEngine.setSilent(silent);
    RecoveryManager.setSilent(silent);
    NavigationGuard.setSilent(silent);
    UIFailsafe.setSilent(silent);
    MultiModuleCoordinator.setSilent(silent);
}

setSilentMode(false);

// =============================================
// EXPOSE DEBUG INTERFACE 
// =============================================
window.__IFRAME_DEBUG__ = true;
window.__getDiagnostics = () => DiagnosticsAgent.getFullReport();
window.__forceRecovery = forceRecovery;
window.__resetCore = () => {
    shutdownCore();
    setTimeout(() => initializeCore(), 1000);
};
window.__getEnvironment = () => IframeEnvironment.getInfo();
window.__getTransportStatus = () => IframeTransport.getDiagnostics();
window.__getSessionStatus = () => SessionClient.getDiagnostics();
window.__getReliabilityStatus = () => ReliabilityEngine.getDiagnostics();
window.__getUIFailsafe = () => UIFailsafe.getDiagnostics();
window.__getApiCore = () => ApiCore.getDiagnostics();

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
// END OF FILE - COMPLETE ENHANCED IMPLEMENTATION 
// =============================================