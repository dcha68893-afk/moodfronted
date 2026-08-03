/**
 * PART 2/3 — API & OPERATIONS
 * API gateway, data loading, core operations
 */
|| [];
            handlers.forEach(handler => {
                try {
                    handler(message);
                } catch (error) {
                    errorLog(`Error in handler for ${message.type}:`, error);
                }
            });
            
        } catch (error) {}
    },
    
    send(type, payload = {}) {
        try {
            if (!this._enabled) {
                return false;
            }
            
            const message = createCanonicalMessage(type, payload, 'parent');
            
            sendLog(`${type} - MessageId: ${message.messageId}`);
            
            if (!this._parentWindow || this._parentWindow === window) {
                this._detectParent();
                if (!this._parentWindow || this._parentWindow === window) {
                    return false;
                }
            }
            
            safeSend(message);
            
            return true;
            
        } catch (error) {
            return false;
        }
    },
    
    on(type, handler) {
        if (!this._messageHandlers.has(type)) {
            this._messageHandlers.set(type, []);
        }
        this._messageHandlers.get(type).push(handler);
        return () => this.off(type, handler);
    },
    
    off(type, handler) {
        const handlers = this._messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
    },
    
    disable() {
        this._enabled = false;
    },
    
    enable() {
        this._enabled = true;
    },
    
    getDiagnostics() {
        return {
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

MessageTransport.init();

// =============================================
// LIFECYCLE CONTROLLER - STRICT STATE MACHINE
// =============================================
const LifecycleController = {
    _sessionRequestRetries: 0,
    _maxSessionRetries: 3,
    
    init() {
        initLog('LifecycleController initializing');
        this._setupMessageHandlers();
        
        setState(LifecycleState.BOOT, 'starting');
        this._initializeComponents();
        
        successLog('LifecycleController initialized');
    },
    
    _initializeComponents() {
        loadFromLocalStorage();
        
        if (currentState === LifecycleState.BOOT) {
            setState(LifecycleState.INITIALIZING, 'component_init');
            setState(LifecycleState.WAITING_AUTH, 'auth_bypass');
            setState(LifecycleState.READY, 'auth_bypass');
            setState(LifecycleState.WAIT_PARENT, 'auth_bypass');
            setState(LifecycleState.ACTIVE, 'standalone_mode');
            console.log(`[${MODULE_NAME}] ✅ Standalone mode - state forced to ACTIVE`);
        }
    },
    
    _sendChildReady() {
        if (childReadySent) return;
        if (currentState !== LifecycleState.READY) return;
        
        sendChildReady();
        initLog('CHILD_READY sent, waiting for PARENT_READY');
    },
    
    _setupMessageHandlers() {
        MessageTransport.on('PARENT_READY', (message) => {});
        MessageTransport.on('MODULE_REGISTERED', (message) => {});
        MessageTransport.on('SESSION_SYNC', (message) => {});
        MessageTransport.on('SESSION_UPDATE', (message) => {});
        MessageTransport.on('SESSION_INVALIDATED', (message) => {});
        MessageTransport.on('SETTINGS_LOAD_RESPONSE', (message) => {});
        MessageTransport.on('SETTINGS_UPDATED', (message) => {});
        MessageTransport.on('PROFILE_UPDATED', (message) => {});
        MessageTransport.on('PRIVACY_UPDATED', (message) => {});
        MessageTransport.on('NOTIFICATIONS_UPDATED', (message) => {});
        MessageTransport.on('LANGUAGE_CHANGED', (message) => {});
        MessageTransport.on('THEME_CHANGED', (message) => {});
        MessageTransport.on('ACCOUNT_LOGGED_OUT', (message) => {});
        MessageTransport.on('BLOCKED_USERS_UPDATED', (message) => {});
        MessageTransport.on('ACTIVE_SESSIONS_UPDATED', (message) => {});
        MessageTransport.on('USER_CONTACTS_UPDATED', (message) => {});
        MessageTransport.on('USER_GROUPS_UPDATED', (message) => {});
        MessageTransport.on('STORAGE_USAGE_UPDATED', (message) => {});
        MessageTransport.on('ERROR', (message) => {});
        MessageTransport.on('SETTINGS_DATA', (message) => {});
        MessageTransport.on('SETTINGS_UPDATE_CONFIRMED', (message) => {});
        MessageTransport.on('SETTINGS_GLOBAL_UPDATE', (message) => {});
        MessageTransport.on('AUTH_READY', (message) => {});
        MessageTransport.on('AUTH_ERROR', (message) => {});
    }
};

// =============================================
// API CORE GATEWAY - USES authorizedRequest
// =============================================
const ApiCore = {
    _ready: false,
    _readyPromise: null,
    _readyResolvers: [],
    
    init() {
        initLog('API Gateway initializing');
        this._readyPromise = new Promise((resolve) => {
            this._readyResolvers.push(resolve);
        });
        return this;
    },
    
    isReady() {
        return this._ready && currentState === LifecycleState.ACTIVE && isAuthenticated;
    },
    
    whenReady() {
        return this._readyPromise || Promise.resolve();
    },
    
    async request(endpoint, options = {}) {
        if (currentState !== LifecycleState.ACTIVE) {
            return {
                success: false,
                status: 'error',
                message: 'Cannot perform action: not ACTIVE state',
                data: null
            };
        }
        
        if (!isAuthenticated) {
            return {
                success: false,
                status: 'error',
                message: 'Authentication not ready',
                data: null
            };
        }
        
        try {
            const response = await authorizedRequest(endpoint, options);
            return response;
        } catch (error) {
            return {
                success: false,
                status: 'error',
                message: error.message || 'Request failed',
                data: null
            };
        }
    },
    
    getDiagnostics() {
        return {
            ready: this._ready,
            authenticated: isAuthenticated
        };
    }
}.init();

// =============================================
// SECURE API WRAPPER - USES authorizedRequest
// =============================================
async function secureApiCall(endpoint, options = {}) {
    if (currentState !== LifecycleState.ACTIVE) {
        return {
            success: false,
            status: 'error',
            message: 'Cannot perform action: not ACTIVE state',
            data: null
        };
    }
    
    if (!isAuthenticated) {
        return {
            success: false,
            status: 'error',
            message: 'Authentication not ready',
            data: null
        };
    }
    
    try {
        const response = await authorizedRequest(endpoint, options);
        return { success: true, data: response };
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
// AUTHORIZED FETCH - NO LONGER USED DIRECTLY
// =============================================
function authorizedFetch(url, options = {}) {
    if (!isAuthenticated) {
        throw new Error("Authentication not ready");
    }
    
    // This should not be called directly - use authorizedRequest instead
    if (DEBUG) console.warn(`[${MODULE_NAME}] ⚠️ authorizedFetch called - this should be replaced with authorizedRequest`);
    return authorizedRequest(url, options);
}

// =============================================
// SAFE DATA ACCESS UTILITIES
// =============================================
function safeGet(data, path, defaultValue = null) {
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

function safeArray(array, defaultValue = []) {
    return Array.isArray(array) ? array : defaultValue;
}

function safeObject(obj, defaultValue = {}) {
    return obj && typeof obj === 'object' ? obj : defaultValue;
}

// =============================================
// IFRAME ENVIRONMENT DETECTOR
// =============================================
const ENV_TYPES = {
    LOCAL_DEV: 'local_dev',
    RENDER_HOSTED: 'render_hosted',
    VPN_NETWORK: 'vpn_network',
    PRODUCTION: 'production',
    UNKNOWN: 'unknown'
};

const IframeEnvironment = {
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
    _backendUrl: 'https://noxopa.onrender.com',
    _frontendUrl: 'https://nexipa.onrender.com',
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
            }
            
            if (hostname === 'localhost' || hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') || protocol === 'file:') {
                this._environment = ENV_TYPES.LOCAL_DEV;
            } else if (hostname.includes('onrender.com')) {
                this._environment = ENV_TYPES.RENDER_HOSTED;
            } else if (this._features.rtt > 300 || 
                      (this._features.connectionType === '4g' && this._features.rtt > 200) ||
                      navigator.connection?.saveData) {
                this._environment = ENV_TYPES.VPN_NETWORK;
            } else if (isSecure && hostname.includes('.')) {
                this._environment = ENV_TYPES.PRODUCTION;
            } else {
                this._environment = ENV_TYPES.UNKNOWN;
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
window.__iframeEnvironment = IframeEnvironment.getEnvironment();

// =============================================
// SAFE STORAGE LAYER
// =============================================
const SafeStorage = {
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
const CompatibilityBridge = {
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
const OriginAdapter = {
    _trustedOrigins: new Set(),
    _originPatterns: [],
    _dynamicTrust: new Map(),
    _lastValidation: 0,
    _validationCache: new Map(),
    _parentOrigin: null,
    _parentVerified: false,
    _backendOrigin: 'https://noxopa.onrender.com',
    _frontendOrigin: 'https://nexipa.onrender.com',
    
    init() {
        initLog('OriginAdapter initializing');
        
        TrustedOrigins._trusted.forEach(origin => {
            this._trustedOrigins.add(origin);
        });
        
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
        if (currentState === LifecycleState.WAIT_PARENT) {
            return true;
        }
        return TrustedOrigins.isValid(origin);
    },
    
    setParentOrigin(origin) {
        this._parentOrigin = origin;
        this._parentVerified = true;
        this.addTrustedOrigin(origin);
        TrustedOrigins.setParentOrigin(origin);
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
// STARTUP GOVERNOR
// =============================================
const StartupGovernor = {
    _state: 'INIT',
    _lock: false,
    _attempts: 0,
    _maxAttempts: 1,
    _backoffMs: 1000,
    _initialized: false,
    _startTime: Date.now(),
    _stateHistory: [],
    _transitionListeners: new Set(),
    _silent: true,
    
    states: {
        INIT: 'INIT',
        WAIT_PARENT: 'WAIT_PARENT',
        ACTIVE: 'ACTIVE',
        READY: 'READY'
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
    
    canProceed() {
        return this._state !== 'FAILED';
    },
    
    isStable() {
        return this._state === 'ACTIVE' || this._state === 'READY';
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
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// IFRAME TRANSPORT
// =============================================
const IframeTransport = {
    _messageHandlers: new Map(),
    _frameId: FRAME_ID,
    _enabled: true,
    _parentWindow: null,
    _parentOrigin: '*',
    
    init() {
        initLog('IframeTransport initializing');
        this._detectParent();
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
    
    send(type, payload = {}) {
        return MessageTransport.send(type, payload);
    },
    
    on(type, handler) {
        return MessageTransport.on(type, handler);
    },
    
    off(type, handler) {
        MessageTransport.off(type, handler);
    },
    
    enable() {
        MessageTransport.enable();
        this._enabled = true;
    },
    
    disable() {
        MessageTransport.disable();
        this._enabled = false;
    },
    
    getDiagnostics() {
        return {
            ...MessageTransport.getDiagnostics()
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
        MessageTransport.setSilent(silent);
    }
};

IframeTransport.init();

// =============================================
// SESSION STORAGE - MEMORY ONLY WITH VALIDATION
// =============================================
function updateSession(user, token, expiry, version) {
    // Validate incoming session data
    const sessionData = {
        userId: user?.id || user?.userId,
        token: token,
        user: user
    };
    
    if (!__isValidSession(sessionData)) {
        console.warn(`[${MODULE_NAME}] ⚠️ updateSession called with invalid data - rejected`);
        return false;
    }
    
    // Prevent session downgrade
    if (window.session.user && __isValidSession({ userId: window.session.user.id, token: window.session.token })) {
        const newUserId = user?.id || user?.userId;
        if (newUserId === 'user' || newUserId === 'default') {
            console.warn(`[${MODULE_NAME}] ⚠️ Prevented session downgrade in updateSession`);
            return false;
        }
    }
    
    if (token) {
        window.session.token = token;
    }
    
    if (user) {
        window.session.user = typeof user === 'object' ? { ...user } : user;
        currentUser = window.session.user;
        coreData.user = window.session.user;
    }
    
    if (expiry) {
        window.session.expiresAt = expiry;
    }
    
    if (version !== undefined) {
        window.session.version = version;
    }
    
    window.__SETTINGS_SESSION_ACTIVE__ = !!window.session.user && isAuthenticated;
    return true;
}

function clearSession() {
    window.session = {
        token: null,
        user: null,
        expiresAt: 0,
        version: 0
    };
    currentUser = null;
    coreData.user = null;
    window.__SETTINGS_SESSION_ACTIVE__ = false;
}

function isSessionValid() {
    const sessionData = {
        userId: window.session.user?.id || window.session.user?.userId,
        token: window.session.token
    };
    return isAuthenticated && __isValidSession(sessionData) && window.session.expiresAt > Date.now();
}

// =============================================
// SETTINGS STORE
// =============================================
const SettingsStore = {
    account: {},
    privacy: {},
    notifications: {},
    appearance: {},
    _listeners: new Set(),
    
    load(settingsData) {
        if (settingsData.account) this.account = { ...settingsData.account };
        if (settingsData.privacy) this.privacy = { ...settingsData.privacy };
        if (settingsData.notifications) this.notifications = { ...settingsData.notifications };
        if (settingsData.appearance) this.appearance = { ...settingsData.appearance };
        
        this._notify('loaded', this.getAll());
        return true;
    },
    
    update(section, key, value) {
        if (!this[section]) return false;
        
        const oldValue = this[section][key];
        this[section][key] = value;
        
        this._notify('updated', {
            section,
            key,
            value,
            oldValue,
            all: this.getAll()
        });
        
        return true;
    },
    
    getAll() {
        return {
            account: { ...this.account },
            privacy: { ...this.privacy },
            notifications: { ...this.notifications },
            appearance: { ...this.appearance }
        };
    },
    
    getSection(section) {
        return this[section] ? { ...this[section] } : null;
    },
    
    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    },
    
    _notify(event, data) {
        this._listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (e) {}
        });
    }
};

// =============================================
// HEARTBEAT CLIENT
// =============================================
const HeartbeatClient = {
    _interval: null,
    _missedCount: 0,
    _maxMissed: 3,
    _running: false,
    _lastAck: 0,
    _listeners: new Set(),
    
    start() {
        this._running = true;
    },
    
    stop() {
        this._running = false;
        this._missedCount = 0;
        this.emit('stopped', {});
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
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
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
    }
};

const HeartbeatManager = HeartbeatClient;

// =============================================
// SESSION CLIENT WITH VALIDATION
// =============================================
const SessionClient = {
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
        return this;
    },
    
    async sync() {
        if (currentState !== LifecycleState.ACTIVE) {
            return false;
        }
        
        if (!isAuthenticated) {
            return false;
        }
        
        if (this._syncInProgress) return false;
        
        this._syncInProgress = true;
        
        try {
            const response = await MessageTransport.send('SESSION_SYNC', {});
            
            if (response && response.payload && response.payload.session) {
                const sessionData = response.payload.session;
                if (!__isValidSession(sessionData)) {
                    console.warn(`[${MODULE_NAME}] ⚠️ SessionClient.sync received invalid session`);
                    this._syncInProgress = false;
                    return false;
                }
                this.updateSession(
                    sessionData.user,
                    sessionData.token,
                    sessionData.expiry
                );
                this._syncInProgress = false;
                return true;
            }
            
            this._syncInProgress = false;
            return false;
        } catch (error) {
            this._syncInProgress = false;
            return false;
        }
    },
    
    updateSession(user, token, expiry) {
        const sessionData = {
            userId: user?.id || user?.userId,
            token: token,
            user: user
        };
        
        if (!__isValidSession(sessionData)) {
            console.warn(`[${MODULE_NAME}] ⚠️ SessionClient.updateSession received invalid session`);
            return false;
        }
        
        // Prevent session downgrade
        if (this._session && __isValidSession({ userId: this._session?.id, token: this._sessionToken })) {
            const newUserId = user?.id || user?.userId;
            if (newUserId === 'user' || newUserId === 'default') {
                console.warn(`[${MODULE_NAME}] ⚠️ SessionClient prevented session downgrade`);
                return false;
            }
        }
        
        if (user) {
            window.session.user = typeof user === 'object' ? { ...user } : user;
            currentUser = window.session.user;
            coreData.user = window.session.user;
            this._session = window.session.user;
        }
        
        if (token) {
            window.session.token = token;
            this._sessionToken = token;
        }
        
        if (expiry) {
            window.session.expiresAt = expiry;
            this._sessionExpiry = expiry;
        }
        
        window.session.version++;
        this._sessionVersion = window.session.version;
        this._lastSync = Date.now();
        
        this.emit('updated', {
            user: window.session.user,
            token: !!window.session.token,
            expiry: window.session.expiresAt,
            version: window.session.version
        });
        
        return true;
    },
    
    async refresh() {
        if (!this.isValid()) return false;
        
        try {
            const response = await MessageTransport.send('SESSION_REFRESH', {});
            
            if (response && response.payload && response.payload.session) {
                const sessionData = response.payload.session;
                if (!__isValidSession(sessionData)) {
                    console.warn(`[${MODULE_NAME}] ⚠️ SessionClient.refresh received invalid session`);
                    return false;
                }
                this.updateSession(
                    sessionData.user,
                    sessionData.token,
                    sessionData.expiry
                );
                return true;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
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
        return window.session.user ? { ...window.session.user } : null;
    },
    
    getToken() {
        return window.session.token;
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
    
    clear() {
        window.session = {
            token: null,
            user: null,
            expiresAt: 0,
            version: 0
        };
        currentUser = null;
        coreData.user = null;
        this._session = null;
        this._sessionToken = null;
        this._sessionExpiry = null;
        this._sessionVersion = 0;
        this.emit('cleared', {});
    },
    
    getDiagnostics() {
        return {
            hasSession: !!window.session.user,
            hasToken: !!window.session.token,
            expiry: window.session.expiresAt,
            version: window.session.version,
            lastSync: this._lastSync,
            refreshAttempts: this._refreshAttempts,
            isValid: isSessionValid(),
            isExpired: !isSessionValid(),
            offlineMode: false
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
const ReliabilityEngine = {
    _quality: 'unknown',
    _enabled: true,
    _silent: true,
    _listeners: new Set(),
    
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
            quality: this._quality,
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ReliabilityEngine.init();

// =============================================
// RELIABILITY LAYER
// =============================================
const ReliabilityLayer = {
    _pendingMessages: new Map(),
    _maxRetries: 3,
    _baseTimeout: 5000,
    _backoffFactor: 1.5,
    _enabled: true,
    _silent: true,
    _listeners: new Set(),
    _messageCounter: 0,
    
    init() {
        initLog('ReliabilityLayer initializing');
        successLog('ReliabilityLayer initialized');
        return this;
    },
    
    send(message, options = {}) {
        return MessageTransport.send(
            message.action || message.type,
            message.data || message.payload || {},
            options
        );
    },
    
    acknowledge(id) {
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
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
    
    getPendingCount() {
        return this._pendingMessages.size;
    },
    
    clearPending() {
        this._pendingMessages.forEach(entry => {
            clearTimeout(entry.timer);
            activeTimers.delete(entry.timer);
        });
        this._pendingMessages.clear();
    },
    
    getDiagnostics() {
        return {
            pendingCount: this._pendingMessages.size,
            maxRetries: this._maxRetries,
            baseTimeout: this._baseTimeout,
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ReliabilityLayer.init();

// =============================================
// MESSAGE DISPATCHER
// =============================================
const MessageDispatcher = {
    _handlers: new Map(),
    _systemActions: new Set([
        'PARENT_READY',
        'SESSION_DATA',
        'MODULE_REGISTERED',
        'ACK',
        'HEARTBEAT_ACK',
        'SETTINGS_DATA',
        'SETTINGS_UPDATE_CONFIRMED',
        'SETTINGS_GLOBAL_UPDATE',
        'AUTH_READY',
        'AUTH_ERROR'
    ]),
    _silent: true,
    
    init() {
        initLog('MessageDispatcher initializing');
        this._setupSystemHandlers();
        successLog('MessageDispatcher initialized');
        return this;
    },
    
    _setupSystemHandlers() {
        this.register('PARENT_READY', (message) => {
            window.parentReady = true;
            parentReadyReceived = true;
            parentCommunicationReady = true;
            console.log('[settings-core] 📥 PARENT_READY received');
        });
        
        this.register('SESSION_DATA', (message) => {
            const sessionData = message.session || message.payload?.session || message;
            if (!__isValidSession(sessionData)) {
                console.warn(`[${MODULE_NAME}] ⚠️ MessageDispatcher ignored invalid SESSION_DATA`);
                return;
            }
            handleSessionData(message);
        });
        
        this.register('MODULE_REGISTERED', (message) => {
            moduleRegistered = true;
        });
        
        this.register('ACK', (message) => {
            if (message.payload && message.payload.inResponseTo) {
                ReliabilityLayer.acknowledge(message.payload.inResponseTo);
            }
        });
        
        this.register('HEARTBEAT_ACK', (message) => {
            HeartbeatClient.handleAck();
        });
        
        this.register('SETTINGS_DATA', (message) => {
            handleSettingsDataResponse(message);
        });
        
        this.register('SETTINGS_UPDATE_CONFIRMED', (message) => {
            handleSettingsUpdateConfirmedMessage(message);
        });
        
        this.register('SETTINGS_GLOBAL_UPDATE', (message) => {
            handleSettingsGlobalUpdateMessage(message);
        });
        
        this.register('AUTH_READY', (message) => {
            isAuthenticated = true;
            authCheckComplete = true;
            processRequestQueue();
            console.log('[settings-core] ✅ AUTH_READY received');
        });
        
        this.register('AUTH_ERROR', (message) => {
            isAuthenticated = false;
            console.error('[settings-core] ❌ AUTH_ERROR received');
        });
    },
    
    register(action, handler) {
        if (!this._handlers.has(action)) {
            this._handlers.set(action, []);
        }
        this._handlers.get(action).push(handler);
        return this;
    },
    
    unregister(action, handler) {
        const handlers = this._handlers.get(action);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
        return this;
    },
    
    dispatch(message) {
        if (!message || !message.action) return false;
        
        const handlers = this._handlers.get(message.action) || [];
        handlers.forEach(handler => {
            try {
                handler(message);
            } catch (e) {
                errorLog(`Error in handler for ${message.action}:`, e);
            }
        });
        
        return handlers.length > 0;
    },
    
    getDiagnostics() {
        return {
            systemActions: Array.from(this._systemActions),
            registeredActions: Array.from(this._handlers.keys())
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

MessageDispatcher.init();

// =============================================
// SECURITY VALIDATOR
// =============================================
const SecurityValidator = {
    _trustedOrigins: new Set(),
    _strictMode: true,
    _validationRules: new Map(),
    _silent: true,
    
    init() {
        initLog('SecurityValidator initializing');
        this._setupDefaultRules();
        successLog('SecurityValidator initialized');
        return this;
    },
    
    _setupDefaultRules() {
        this.addTrustedOrigin(window.location.origin);
        
        this.addRule('message_structure', (message) => {
            if (!message || typeof message !== 'object') return false;
            if (!message.id && !message.action && !message.type) return false;
            if (!message.source) return false;
            if (!message.timestamp) return false;
            return true;
        });
        
        this.addRule('action_valid', (message) => {
            if (!message.type && !message.action) return false;
            const action = message.type || message.action;
            if (typeof action !== 'string') return false;
            if (action.length > 50) return false;
            return true;
        });
        
        this.addRule('source_valid', (message) => {
            if (!message.source) return false;
            if (message.source !== 'parent' && message.source !== MODULE_NAME) return false;
            return true;
        });
        
        this.addRule('target_valid', (message) => {
            if (message.target && message.target !== FRAME_ID && message.target !== 'all' && message.target !== 'parent') return false;
            return true;
        });
    },
    
    addTrustedOrigin(origin) {
        if (origin) {
            this._trustedOrigins.add(origin);
        }
        return this;
    },
    
    addRule(name, validator) {
        this._validationRules.set(name, validator);
        return this;
    },
    
    removeRule(name) {
        this._validationRules.delete(name);
        return this;
    },
    
    validateMessage(message, origin) {
        if (!OriginAdapter.isTrusted(origin)) {
            if (!this._silent) debugLog(`Message rejected: untrusted origin ${origin}`);
            return false;
        }
        
        for (const [name, validator] of this._validationRules) {
            try {
                if (!validator(message)) {
                    if (!this._silent) debugLog(`Message rejected: rule ${name} failed`);
                    return false;
                }
            } catch (e) {
                if (!this._silent) debugLog(`Message validation error in rule ${name}:`, e);
                return false;
            }
        }
        
        return true;
    },
    
    validateAction(action) {
        if (!action || typeof action !== 'string') return false;
        if (action.length > 100) return false;
        
        const dangerousPatterns = ['<', '>', 'script', 'javascript:', 'data:'];
        for (const pattern of dangerousPatterns) {
            if (action.toLowerCase().includes(pattern)) return false;
        }
        
        return true;
    },
    
    sanitizeData(data) {
        if (!data) return data;
        
        if (typeof data === 'string') {
            return data
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        
        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeData(item));
        }
        
        if (typeof data === 'object' && data !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                sanitized[key] = this.sanitizeData(value);
            }
            return sanitized;
        }
        
        return data;
    },
    
    getDiagnostics() {
        return {
            trustedOriginsCount: this._trustedOrigins.size,
            strictMode: this._strictMode,
            rulesCount: this._validationRules.size
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

SecurityValidator.init();

// =============================================
// PARENT CONNECTION MANAGER
// =============================================
const ParentConnectionManager = {
    _connectionState: 'disconnected',
    _parentWindow: null,
    _parentOrigin: null,
    _reconnectAttempts: 0,
    _maxReconnectAttempts: 3,
    _reconnectDelay: 1000,
    _connectionCheckInterval: null,
    _listeners: new Set(),
    _silent: true,
    
    init() {
        initLog('ParentConnectionManager initializing');
        this._detectParent();
        successLog('ParentConnectionManager initialized');
        return this;
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
                this._connectionState = 'connected';
                this.emit('connected', { origin: this._parentOrigin });
            } else {
                this._connectionState = 'no_parent';
                this.emit('no_parent', {});
            }
        } catch (error) {
            this._connectionState = 'error';
            this.emit('error', { error });
        }
    },
    
    isConnected() {
        return this._connectionState === 'connected' && 
               this._parentWindow && 
               this._parentWindow !== window;
    },
    
    getConnectionState() {
        return this._connectionState;
    },
    
    getParentOrigin() {
        return this._parentOrigin;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
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
            connectionState: this._connectionState,
            parentOrigin: this._parentOrigin,
            reconnectAttempts: this._reconnectAttempts,
            maxReconnectAttempts: this._maxReconnectAttempts
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ParentConnectionManager.init();

// =============================================
// HANDSHAKE MANAGER - NO RETRY LOOPS
// =============================================
const HandshakeManager = {
    _handshakeState: 'INITIAL',
    _handshakeId: null,
    _handshakeAttempts: 0,
    _maxAttempts: 1,
    _backoffMs: 1000,
    _parentReady: false,
    _handshakeComplete: false,
    _listeners: new Set(),
    _inProgress: false,
    _silent: true,
    
    states: {
        INITIAL: 'INITIAL',
        WAITING_FOR_PARENT: 'WAITING_FOR_PARENT',
        REGISTERING: 'REGISTERING',
        REGISTERED: 'REGISTERED',
        ACTIVE: 'ACTIVE'
    },
    
    init() {
        initLog('HandshakeManager initializing');
        successLog('HandshakeManager initialized');
        return this;
    },
    
    getState() {
        return this._handshakeState;
    },
    
    transition(newState, reason = '') {
        const oldState = this._handshakeState;
        this._handshakeState = newState;
        
        if (!this._silent) {
            debugLog(`Handshake: ${oldState} → ${newState} (${reason})`);
        }
        
        this.emit('transition', { from: oldState, to: newState, reason });
        
        return true;
    },
    
    async startHandshake(options = {}) {
        if (this._handshakeComplete) {
            return { success: true, cached: true };
        }
        
        if (this._inProgress) {
            return { success: false, inProgress: true };
        }
        
        this._inProgress = true;
        
        try {
            this.transition('WAITING_FOR_PARENT', 'handshake_started');
            
            await this._registerModule();
            
            this._handshakeComplete = true;
            this.transition('ACTIVE', 'handshake_complete');
            this._inProgress = false;
            return { success: true };
        } catch (error) {
            this._inProgress = false;
            return { success: false, error: error.message };
        }
    },
    
    async _registerModule() {
        return { success: true };
    },
    
    reset() {
        this._handshakeState = 'INITIAL';
        this._handshakeComplete = false;
        this._handshakeAttempts = 0;
        this._inProgress = false;
    },
    
    isComplete() {
        return this._handshakeComplete || registrationCompleted;
    },
    
    isInProgress() {
        return this._inProgress;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
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
            state: this._handshakeState,
            attempts: this._handshakeAttempts,
            maxAttempts: this._maxAttempts,
            complete: this.isComplete(),
            inProgress: this._inProgress
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

HandshakeManager.init();

const IframeHandshakeAuthority = HandshakeManager;

// =============================================
// MODULE LIFECYCLE CONTROLLER
// =============================================
const ModuleLifecycleController = {
    _lifecycleState: 'stopped',
    _startTime: null,
    _listeners: new Set(),
    _silent: true,
    
    states: {
        STOPPED: 'stopped',
        STARTING: 'starting',
        RUNNING: 'running',
        STOPPING: 'stopping',
        ERROR: 'error'
    },
    
    init() {
        initLog('ModuleLifecycleController initializing');
        successLog('ModuleLifecycleController initialized');
        return this;
    },
    
    start() {
        if (this._lifecycleState === 'running') return this;
        
        this._lifecycleState = 'starting';
        this._startTime = Date.now();
        this.emit('starting', { timestamp: this._startTime });
        
        this._lifecycleState = 'running';
        this.emit('started', { timestamp: Date.now() });
        
        return this;
    },
    
    stop() {
        if (this._lifecycleState === 'stopped') return this;
        
        this._lifecycleState = 'stopping';
        this.emit('stopping', { timestamp: Date.now() });
        
        HeartbeatClient.stop();
        clearAllTimers();
        
        this._lifecycleState = 'stopped';
        this.emit('stopped', { timestamp: Date.now() });
        
        return this;
    },
    
    error(error) {
        this._lifecycleState = 'error';
        this.emit('error', { error, timestamp: Date.now() });
        return this;
    },
    
    getState() {
        return this._lifecycleState;
    },
    
    getUptime() {
        if (!this._startTime || this._lifecycleState !== 'running') return 0;
        return Date.now() - this._startTime;
    },
    
    isRunning() {
        return this._lifecycleState === 'running';
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
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
            state: this._lifecycleState,
            uptime: this.getUptime(),
            startTime: this._startTime
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ModuleLifecycleController.init();

// =============================================
// RECOVERY MANAGER
// =============================================
const RecoveryManager = {
    _attempts: 0,
    _maxAttempts: 3,
    _backoffMs: 1000,
    _recoveryInProgress: false,
    _recoveryTimer: null,
    _listeners: new Set(),
    _recoveryStrategies: new Map(),
    _silent: true,
    
    init() {
        initLog('RecoveryManager initializing');
        this._registerDefaultStrategies();
        successLog('RecoveryManager initialized');
        return this;
    },
    
    _registerDefaultStrategies() {
        this.registerStrategy('connection_lost', async () => {
            ParentConnectionManager._detectParent();
            if (ParentConnectionManager.isConnected()) {
                return true;
            }
            return false;
        });
        
        this.registerStrategy('heartbeat_failure', async () => {
            HeartbeatClient.stop();
            if (currentState === LifecycleState.ACTIVE) {
                HeartbeatClient.start();
                return HeartbeatClient.isHealthy();
            }
            return false;
        });
        
        this.registerStrategy('registration_failed', async () => {
            moduleRegistered = false;
            return moduleRegistered;
        });
        
        this.registerStrategy('session_expired', async () => {
            if (!isAuthenticated) return false;
            if (!window.session.token) return false;
            const response = await MessageTransport.send('SESSION_REFRESH', {});
            if (response && response.payload && response.payload.session) {
                const sessionData = response.payload.session;
                if (!__isValidSession(sessionData)) {
                    console.warn(`[${MODULE_NAME}] ⚠️ RecoveryManager received invalid session`);
                    return false;
                }
                updateSession(
                    sessionData.user,
                    sessionData.token,
                    sessionData.expiry
                );
                return isSessionValid();
            }
            return false;
        });
        
        this.registerStrategy('handshake_timeout', async () => {
            if (parentReadyReceived) return true;
            sendChildReady();
            await new Promise(resolve => setTimeout(resolve, 1000));
            return parentReadyReceived;
        });
        
        this.registerStrategy('settings_load_failed', async () => {
            if (!isAuthenticated) return false;
            try {
                await SettingsState.load();
                return SettingsState.loaded;
            } catch (error) {
                return false;
            }
        });
    },
    
    registerStrategy(name, strategy) {
        this._recoveryStrategies.set(name, strategy);
        return this;
    },
    
    async attemptRecovery(options = {}) {
        const { reason = 'unknown', force = false } = options;
        
        if (this._recoveryInProgress && !force) {
            return { success: false, error: 'recovery_in_progress' };
        }
        
        if (this._attempts >= this._maxAttempts && !force) {
            this.emit('max_attempts_reached', { reason, attempts: this._attempts });
            return { success: false, error: 'max_attempts_reached' };
        }
        
        this._recoveryInProgress = true;
        this._attempts++;
        this.emit('recovery_started', { reason, attempt: this._attempts });
        
        try {
            const strategy = this._recoveryStrategies.get(reason);
            
            if (strategy) {
                const result = await strategy();
                if (result) {
                    this._recoveryInProgress = false;
                    this._attempts = 0;
                    this.emit('recovery_succeeded', { reason });
                    return { success: true };
                }
            } else {
                const results = [];
                for (const [name, strat] of this._recoveryStrategies) {
                    try {
                        const result = await strat();
                        results.push({ strategy: name, success: result });
                        if (result) break;
                    } catch (e) {}
                }
                if (results.some(r => r.success)) {
                    this._recoveryInProgress = false;
                    this._attempts = 0;
                    this.emit('recovery_succeeded', { reason, strategies: results });
                    return { success: true, strategies: results };
                }
            }
            
            if (this._attempts < this._maxAttempts) {
                const backoffDelay = this._backoffMs * Math.pow(1.5, this._attempts - 1);
                this._recoveryTimer = safeSetTimeout(() => {
                    this.attemptRecovery({ reason, force });
                }, backoffDelay);
                activeTimers.add(this._recoveryTimer);
                this.emit('recovery_retry', { reason, attempt: this._attempts, delay: backoffDelay });
                return { success: false, retrying: true, attempt: this._attempts };
            } else {
                this._recoveryInProgress = false;
                this.emit('recovery_failed', { reason, attempts: this._attempts });
                return { success: false, error: 'recovery_failed' };
            }
        } catch (error) {
            this._recoveryInProgress = false;
            this.emit('recovery_error', { reason, error: error.message });
            return { success: false, error: error.message };
        }
    },
    
    reset() {
        this._attempts = 0;
        this._recoveryInProgress = false;
        if (this._recoveryTimer) {
            clearTimeout(this._recoveryTimer);
            activeTimers.delete(this._recoveryTimer);
            this._recoveryTimer = null;
        }
        this.emit('reset', {});
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
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
// NAVIGATION GUARD
// =============================================
const NavigationGuard = {
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
        if (currentState !== LifecycleState.ACTIVE) return true;
        
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
const UIFailsafe = {
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
            if (currentState !== LifecycleState.ACTIVE) return;
            if (event.target && (event.target.tagName === 'BUTTON' || 
                                 event.target.tagName === 'INPUT' ||
                                 event.target.tagName === 'SELECT')) {
                this._handleUIError(event.target, event.error);
            }
        }, true);
        
        window.addEventListener('unhandledrejection', (event) => {
            if (currentState !== LifecycleState.ACTIVE) return;
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
                    if (currentState !== LifecycleState.ACTIVE) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
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
        if (currentState !== LifecycleState.ACTIVE) return;
        
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

UIFailsafe.init();

// =============================================
// MULTI-MODULE COORDINATOR
// =============================================
const MODULE_DISCOVERY = 'MODULE_DISCOVERY';
const MODULE_PRESENCE = 'MODULE_PRESENCE';
const ORIGIN_BIND = 'ORIGIN_BIND';

const MultiModuleCoordinator = {
    _modules: new Map(),
    _moduleId: `settings_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    _moduleType: MODULE_NAME,
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
        } catch (e) {}
        
        successLog('MultiModuleCoordinator initialized');
    },
    
    _handleBroadcastMessage(data) {
        if (data.type === 'SETTINGS_UPDATED' && data.source !== this._moduleId) {
            if (currentState === LifecycleState.ACTIVE && isAuthenticated) {
                MessageTransport.send('SETTINGS_LOAD_REQUEST', {});
            }
        }
        
        if (data.type === 'LANGUAGE_CHANGED' && data.source !== this._moduleId) {
            const event = new CustomEvent('languageChanged', {
                detail: { language: data.language, source: 'broadcast' }
            });
            window.dispatchEvent(event);
        }
        
        if (data.type === 'THEME_CHANGED' && data.source !== this._moduleId) {
            if (data.theme) {
                applyTheme(data.theme);
            }
        }
        
        if (data.type === 'PRIVACY_UPDATED' && data.source !== this._moduleId) {
            const event = new CustomEvent('privacyUpdated', {
                detail: { privacy: data.privacy, source: 'broadcast' }
            });
            window.dispatchEvent(event);
        }
    },
    
    registerModule(type, id) {
        this._modules.set(id, {
            type,
            id,
            lastSeen: Date.now(),
            ready: currentState === LifecycleState.ACTIVE,
            handshakeComplete: registrationCompleted,
            sessionValid: isSessionValid(),
            authenticated: isAuthenticated
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
                    sessionValid: data.sessionValid || false,
                    authenticated: data.authenticated || false
                });
                break;
                
            case MODULE_DISCOVERY:
                this._broadcast({
                    _moduleBus: true,
                    type: MODULE_PRESENCE,
                    moduleType: this._moduleType,
                    moduleId: this._moduleId,
                    ready: currentState === LifecycleState.ACTIVE,
                    handshakeComplete: registrationCompleted,
                    sessionValid: isSessionValid(),
                    authenticated: isAuthenticated,
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
        
        MessageTransport.send('MODULE_BROADCAST', {
            payload: message
        });
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
        return window.session.user ? { user: window.session.user } : null;
    },
    
    setSharedSession(sessionData) {
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
// UI BRIDGE
// =============================================
const UIBridge = {
    _listeners: new Map(),
    _domEvents: new Map(),
    _initialized: false,
    _silent: true,
    
    init() {
        if (this._initialized) return this;
        initLog('UIBridge initializing');
        this._setupDefaultListeners();
        this._initialized = true;
        successLog('UIBridge initialized');
        return this;
    },
    
    _setupDefaultListeners() {
        this.register('updateSetting', async (data) => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
                errorLog('Cannot update setting: auth not ready');
                return { success: false, error: 'Auth not ready' };
            }
            
            try {
                const result = await SettingsState.update(data.section, data.key, data.value);
                return result;
            } catch (error) {
                errorLog('Error updating setting:', error);
                return { success: false, error: error.message };
            }
        });
        
        this.register('saveSettings', async () => {
            if (currentState !== LifecycleState.ACTIVE || !isAuthenticated) {
                return { success: false, error: 'Auth not ready' };
            }
            
     
