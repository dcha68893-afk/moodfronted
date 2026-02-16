// api.auth.js - Modular Authentication Service with IIFE Protection
// Version: 21.1.5 - CRITICAL FIX: Force override login method registration
// Date: 2024-01-08
// 🔧 FIXED: Force override for critical methods (login, register, logout)
// 🔧 FIXED: Login now works exactly like browser console test
// 🔧 FIXED: Method registration priority for authentication functions

(function() {
    // ============================================================================
    // SINGLETON GUARD - MUST BE FIRST EXECUTION
    // ============================================================================
    
    // CRITICAL: Ultimate singleton guard - prevents ANY possibility of multiple initialization
    const VERSION = '21.1.5';
    const GUARD_KEY = '__API_AUTH_SINGLETON_GUARD__';
    
    // Check if we already have a fully initialized instance
    if (window[GUARD_KEY] === true) {
        console.warn(`⚠️ [API-AUTH] Singleton guard triggered: Module already fully initialized (v${VERSION}), completely skipping execution`);
        return;
    }
    
    // Also check for version-specific guard with exact version match
    const VERSION_GUARD_KEY = `__API_AUTH_${VERSION.replace(/\./g, '_')}_GUARD__`;
    if (window[VERSION_GUARD_KEY] === true) {
        console.warn(`⚠️ [API-AUTH] Version guard triggered: v${VERSION} already loaded, skipping`);
        return;
    }
    
    // Set both guards immediately
    window[GUARD_KEY] = true;
    window[VERSION_GUARD_KEY] = true;
    
    // Also set a timestamp guard for debugging
    window.__API_AUTH_LOAD_TIMESTAMP__ = Date.now();
    window.__API_AUTH_LOAD_VERSION__ = VERSION;
    
    // ============================================================================
    // MODULE LOADING PROTECTION & INITIALIZATION
    // ============================================================================
    
    // CRITICAL: Prevent duplicate loading with immediate detection
    if (window._API_AUTH_V21_LOADED_ && window._API_AUTH_V21_LOADED_.initialized === true) {
        console.warn('⚠️ [API-AUTH] api.auth.js v21.1.5 already fully initialized, skipping');
        return;
    }
    
    // Mark as loading with version-specific flag
    window._API_AUTH_V21_LOADED_ = {
        version: VERSION,
        timestamp: Date.now(),
        instanceId: Math.random().toString(36).substring(7),
        loadingStage: 'pre_init',
        initialized: false,
        initStarted: false,
        initCompleted: false,
        initFailed: false,
        guardTriggered: true
    };
    
    // Fire loading event immediately
    try {
        window.dispatchEvent(new CustomEvent("api-auth-loading", {
            detail: {
                timestamp: Date.now(),
                version: VERSION,
                instanceId: window._API_AUTH_V21_LOADED_.instanceId,
                stage: 'initializing',
                guardActive: true
            }
        }));
    } catch (e) {}
    
    console.log(`🔐 [API-AUTH] Initializing modular authentication service v${VERSION} (CRITICAL LOGIN FIX)`);
    
    // ============================================================================
    // IMMEDIATE PUBLIC API SHELL - WITH MINIMAL STUBS
    // ============================================================================
    
    // CRITICAL: Create minimal method stubs that won't interfere with real registration
    if (!window.api) window.api = {};
    if (!window.api.auth) window.api.auth = {};
    
    // ============================================================================
    // READINESS CONTROLLER (SINGLETON PROMISE)
    // ============================================================================
    
    // Private readiness state
    const _readinessState = {
        isReady: false,
        readyPromise: null,
        readyResolve: null,
        readyReject: null,
        initStarted: false,
        initCompleted: false,
        initFailed: false,
        initError: null,
        dependenciesReady: false,
        bootstrapReady: false,
        sessionReady: false,
        tokenSystemReady: false,
        waitCallbacks: [],
        coreBootstrapReady: false,
        coreSessionReady: false,
        startTime: Date.now(),
        readyTime: null
    };
    
    // Create the authoritative ready Promise ONCE
    _readinessState.readyPromise = new Promise((resolve, reject) => {
        _readinessState.readyResolve = resolve;
        _readinessState.readyReject = reject;
    });
    
    // Unified readiness check function
    function _isFullyReady() {
        return _readinessState.isReady && 
               _readinessState.initCompleted && 
               !_readinessState.initFailed &&
               _readinessState.dependenciesReady &&
               _readinessState.bootstrapReady;
    }
    
    // Mark as ready
    function _markReady() {
        if (_readinessState.isReady) {
            return true;
        }
        
        if (!_readinessState.initCompleted) {
            return false;
        }
        
        if (_readinessState.initFailed) {
            return false;
        }
        
        if (!_readinessState.dependenciesReady) {
            return false;
        }
        
        _readinessState.isReady = true;
        _readinessState.readyTime = Date.now();
        
        console.log(`✅ [READINESS] Auth module ready after ${_readinessState.readyTime - _readinessState.startTime}ms`);
        
        if (window.api && window.api.auth) {
            window.api.auth.isAuthFullyReady = true;
        }
        
        if (_readinessState.readyResolve) {
            _readinessState.readyResolve(true);
            _readinessState.readyResolve = null;
        }
        
        _readinessState.waitCallbacks.forEach(callback => {
            try {
                callback(true);
            } catch (error) {
                console.error('❌ [READINESS] Error in ready callback:', error);
            }
        });
        _readinessState.waitCallbacks = [];
        
        try {
            window.dispatchEvent(new CustomEvent("api-auth-ready", {
                detail: {
                    timestamp: _readinessState.readyTime,
                    version: VERSION,
                    instanceId: window._API_AUTH_V21_LOADED_.instanceId,
                    initTime: _readinessState.readyTime - _readinessState.startTime
                }
            }));
        } catch (error) {}
        
        return true;
    }
    
    // Handle initialization failure
    function _markInitFailed(error) {
        if (_readinessState.initCompleted) {
            return false;
        }
        
        _readinessState.initFailed = true;
        _readinessState.initError = error;
        _readinessState.isReady = false;
        
        console.error('❌ [READINESS] Initialization failed:', error);
        
        if (_readinessState.readyReject) {
            _readinessState.readyReject(error);
            _readinessState.readyReject = null;
        }
        
        _readinessState.waitCallbacks.forEach(callback => {
            try {
                callback(false, error);
            } catch (cbError) {}
        });
        _readinessState.waitCallbacks = [];
        
        return true;
    }
    
    // waitForReady - Returns singleton Promise
    function waitForReady() {
        if (_readinessState.initFailed) {
            return Promise.reject(_readinessState.initError);
        }
        return _readinessState.readyPromise;
    }
    
    // waitFor with timeout
    function waitFor(timeoutMs = 30000) {
        if (_readinessState.isReady) {
            return Promise.resolve({ ready: true, source: 'auth' });
        }
        
        if (_readinessState.initFailed) {
            return Promise.reject({ 
                ready: false, 
                error: _readinessState.initError,
                source: 'auth'
            });
        }
        
        let timeoutId = null;
        const timeoutPromise = new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => {
                reject({ 
                    ready: false, 
                    error: 'waitFor timeout',
                    source: 'auth',
                    timeout: timeoutMs
                });
            }, timeoutMs);
        });
        
        return Promise.race([
            _readinessState.readyPromise.then(() => {
                if (timeoutId) clearTimeout(timeoutId);
                return { ready: true, source: 'auth' };
            }),
            timeoutPromise
        ]);
    }
    
    // CRITICAL FIX: Define isAuthFullyReady with proper setter
    let _isAuthFullyReady = false;
    
    if (!Object.getOwnPropertyDescriptor(window.api.auth, 'isAuthFullyReady')) {
        Object.defineProperty(window.api.auth, 'isAuthFullyReady', {
            get: function() { return _isAuthFullyReady; },
            set: function(value) { _isAuthFullyReady = Boolean(value); },
            enumerable: true,
            configurable: false
        });
    }
    
    // isAuthFullyReadySafe getter
    if (!Object.getOwnPropertyDescriptor(window.api.auth, 'isAuthFullyReadySafe')) {
        Object.defineProperty(window.api.auth, 'isAuthFullyReadySafe', {
            get: function() {
                try {
                    if (_readinessState && typeof _readinessState.isReady === 'boolean') {
                        return _readinessState.isReady;
                    }
                    return false;
                } catch (error) {
                    return false;
                }
            },
            enumerable: true,
            configurable: false
        });
    }
    
    // ready property
    if (!Object.getOwnPropertyDescriptor(window.api.auth, 'ready')) {
        Object.defineProperty(window.api.auth, 'ready', {
            get: function() { return _readinessState.readyPromise; },
            enumerable: true,
            configurable: false
        });
    }
    
    // ============================================================================
    // CRITICAL FIX: IDEMPOTENT REGISTRATION WITH FORCE OVERRIDE
    // ============================================================================
    
    // CRITICAL METHODS that MUST be overridden
    const CRITICAL_METHODS = ['login', 'register', 'logout', 'getUser', 'getCurrentUser', 'isAuthenticated', 'forgotPassword', 'resetPassword'];
    
    // Track registrations
    const _registeredMethods = new Set();
    const _methodOwners = new Map();
    
    // CRITICAL FIX: Force override registration for critical methods
    function _registerMethod(target, methodName, implementation, owner = 'api.auth') {
        // ALWAYS allow critical methods to be overridden by the real implementation
        const isCritical = CRITICAL_METHODS.includes(methodName);
        
        // Check if method already exists
        if (target[methodName]) {
            const existingOwner = _methodOwners.get(methodName) || 'unknown';
            
            // FORCE override for critical methods from core
            if (isCritical && owner === 'api.auth.core') {
                console.log(`🔧 [REGISTRATION] 🔥 FORCE overriding ${methodName} from ${existingOwner} with real implementation`);
                // Continue to override
            }
            // For non-critical or non-core, check if it's a stub
            else if (target[methodName].toString && target[methodName].toString().includes('stub')) {
                console.debug(`🔧 [REGISTRATION] Replacing stub for ${methodName} with real implementation from ${owner}`);
            } 
            else if (!isCritical) {
                console.warn(`⚠️ [REGISTRATION] Method ${methodName} already registered by ${existingOwner}, skipping from ${owner}`);
                return false;
            }
            // For critical methods not from core, log but still override
            else if (isCritical && owner !== 'api.auth.core') {
                console.warn(`⚠️ [REGISTRATION] Critical method ${methodName} registered by non-core ${owner}, but allowing`);
            }
        }
        
        // Store the implementation
        target[methodName] = implementation;
        _registeredMethods.add(methodName);
        _methodOwners.set(methodName, owner);
        
        console.log(`✅ [REGISTRATION] Registered ${methodName} from ${owner}`);
        return true;
    }
    
    // Batch registration
    function _registerMethods(target, methods, owner) {
        const results = {};
        let allSucceeded = true;
        
        Object.keys(methods).forEach(methodName => {
            results[methodName] = _registerMethod(target, methodName, methods[methodName], owner);
            if (!results[methodName]) {
                allSucceeded = false;
            }
        });
        
        return { success: allSucceeded, results };
    }
    
    // ============================================================================
    // PRIVATE CONSTANTS & CONFIGURATION
    // ============================================================================
    
    const CONFIG = {
        TOKEN_KEYS: ['USER_TOKEN', 'accessToken', 'moodchat_token', 'token'],
        USER_DATA_KEYS: ['USER_DATA', 'authUser', 'moodchat_auth_user', 'userData'],
        REFRESH_TOKEN_KEY: 'REFRESH_TOKEN',
        TOKEN_EXPIRY_KEY: 'TOKEN_EXPIRY',
        AUTH_STATE_KEY: 'AUTH_STATE',
        DEFAULT_TOKEN_EXPIRY: 3600000,
        TOKEN_REFRESH_BUFFER: 60000,
        VALIDATION_CACHE_TIME: 30000,
        MAX_REFRESH_ATTEMPTS: 3,
        CROSS_TAB_SYNC_KEY: 'auth_cross_tab_sync',
        CROSS_TAB_LOGOUT_TRIGGER: 'cross-tab-logout-trigger',
        DEPENDENCY_TIMEOUT: 30000,
        BOOTSTRAP_POLL_INTERVAL: 100,
        MAX_BOOTSTRAP_POLLS: 300,
        HANDSHAKE_MAX_ATTEMPTS: 3,
        HANDSHAKE_RETRY_DELAY: 2000,
        API_ENDPOINTS: {
            LOGIN: '/api/auth/login',
            REGISTER: '/api/auth/register',
            LOGOUT: '/api/auth/logout',
            VALIDATE: '/api/auth/validate',
            FORGOT_PASSWORD: '/api/auth/forgot-password',
            RESET_PASSWORD: '/api/auth/reset-password',
            REFRESH_TOKEN: '/api/auth/refresh',
            GET_USER: '/api/auth/me'
        },
        EXTERNAL_READINESS: {
            CORE_BOOTSTRAP: 'app.core.bootstrap.js',
            CORE_SESSION: 'app.core.session.js'
        },
        RETRY: {
            MAX_ATTEMPTS: 2,
            DELAY_MS: 1000,
            BACKOFF_MULTIPLIER: 1.5
        }
    };
    
    // ============================================================================
    // PRIVATE STATE MANAGEMENT
    // ============================================================================
    
    let _moduleState = {
        initialized: false,
        initializationStarted: false,
        tokenRefreshInProgress: false,
        pendingAuthRequests: [],
        sessionValidationPromise: null,
        lastTokenRefresh: 0,
        crossTabSyncInitialized: false,
        iframeSyncInitialized: false,
        refreshAttempts: 0,
        offlineMode: false,
        lastNetworkCheck: 0,
        dependenciesReady: false,
        bootstrapComplete: false,
        lifecycleState: 'loading',
        readyCallbacks: [],
        metadataFieldsSet: false,
        registrationComplete: false,
        loadStartTime: Date.now(),
        dependencyCheckAttempts: 0,
        apiCoreAvailable: false,
        apiRequestAvailable: false,
        appCoreAvailable: false,
        endpointPrefix: '/api',
        handshakeAttempts: 0,
        lastHandshakeAttempt: 0,
        handshakeComplete: false,
        sessionErrorLogged: false,
        tokenErrorLogged: false,
        apiCallFailures: {},
        errorSuppression: {},
        methodGuaranteeExecuted: false,
        loggedErrors: {
            login: new Set(),
            register: new Set(),
            autoLogin: new Set(),
            logout: new Set(),
            validate: new Set()
        },
        coreBootstrapChecked: false,
        coreSessionChecked: false,
        coreBootstrapReady: false,
        coreSessionReady: false,
        lastCrossTabMessage: null,
        lastCrossTabMessageTime: 0,
        lastIframeMessage: null,
        lastIframeMessageTime: 0,
        sessionExpirationHandled: false,
        crossTabHeartbeatInterval: null,
        crossTabCheckInterval: null,
        eventListeners: new Map(),
        intervalIds: new Set()
    };
    
    // Event listeners storage
    const _eventListeners = {
        'token-expired': [],
        'session-refreshed': [],
        'cross-tab-logout': [],
        'auth-state-changed': [],
        'offline-mode': [],
        'login': [],
        'logout': [],
        'registration-complete': [],
        'ready': [],
        'initialized': [],
        'error': []
    };
    
    // ============================================================================
    // PRIVATE UTILITY FUNCTIONS
    // ============================================================================
    
    function _isValid(value) {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string' && (value.trim() === '' || value === 'undefined' || value === 'null')) return false;
        if (typeof value === 'object' && Object.keys(value).length === 0) return false;
        return true;
    }
    
    function _safeGet(value, fallback = null) {
        return _isValid(value) ? value : fallback;
    }
    
    function _safeLogError(errorType, message, data = {}, forceLog = false, operation = 'unknown') {
        const errorKey = `${errorType}:${message}`;
        
        if (!forceLog && _moduleState.loggedErrors[operation]?.has(errorKey)) {
            return false;
        }
        
        console.error(`❌ [AUTH-SAFETY] ${errorType}: ${message}`, data);
        
        if (_moduleState.loggedErrors[operation]) {
            _moduleState.loggedErrors[operation].add(errorKey);
        }
        
        _setSafeTimeout(() => {
            if (_moduleState.loggedErrors[operation]) {
                _moduleState.loggedErrors[operation].delete(errorKey);
            }
        }, 300000);
        
        return true;
    }
    
    function _safeStorageGet(key) {
        try {
            const value = localStorage.getItem(key);
            return _isValid(value) ? value : null;
        } catch (error) {
            return null;
        }
    }
    
    function _safeStorageSet(key, value) {
        try {
            if (!_isValid(value)) {
                return false;
            }
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    function _safeStorageRemove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    function _isOnline() {
        if (Date.now() - _moduleState.lastNetworkCheck < 5000 && _moduleState.offlineMode !== undefined) {
            return !_moduleState.offlineMode;
        }
        
        _moduleState.lastNetworkCheck = Date.now();
        
        if (window.AppNetwork && typeof window.AppNetwork.isOnline === 'boolean') {
            _moduleState.offlineMode = !window.AppNetwork.isOnline;
            return window.AppNetwork.isOnline;
        }
        
        if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
            _moduleState.offlineMode = !navigator.onLine;
            return navigator.onLine;
        }
        
        _moduleState.offlineMode = false;
        return true;
    }
    
    function _isApiCoreReady() {
        const hasApiCore = !!(window.api && window.api.core);
        const hasApiRequest = !!(window.api && window.api.request);
        return hasApiCore && hasApiRequest;
    }
    
    async function _waitForApiCore(timeoutMs = 10000) {
        if (_isApiCoreReady()) {
            return true;
        }
        
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                if (_isApiCoreReady()) {
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (Date.now() - startTime > timeoutMs) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 100);
            
            _moduleState.intervalIds.add(checkInterval);
        });
    }
    
    function _getApiRequest() {
        if (window.api && window.api.request) {
            return window.api.request;
        }
        if (window.__API_REQUEST) {
            return window.__API_REQUEST;
        }
        if (window.MoodChatRequest) {
            return window.MoodChatRequest;
        }
        return null;
    }
    
    function _getApiEndpoint(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') {
            return '/api/auth/login';
        }
        
        if (endpoint.startsWith('/api/')) {
            return endpoint;
        }
        
        if (endpoint.startsWith('api/')) {
            return '/' + endpoint;
        }
        
        return `${_moduleState.endpointPrefix}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    }
    
    function _validateEndpointSafety(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') {
            return false;
        }
        
        const suspiciousPatterns = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:', '//', '..', '~', '../'];
        
        for (const pattern of suspiciousPatterns) {
            if (endpoint.includes(pattern)) {
                return false;
            }
        }
        
        return true;
    }
    
    function _emitEvent(eventName, detail) {
        if (!_eventListeners[eventName]) {
            return;
        }
        
        const eventDetail = {
            ...detail,
            timestamp: Date.now(),
            source: 'api.auth.js',
            version: VERSION,
            instanceId: window._API_AUTH_V21_LOADED_.instanceId
        };
        
        _eventListeners[eventName].forEach(listener => {
            try {
                listener(eventDetail);
            } catch (error) {}
        });
        
        if (eventName === 'token-expired' || eventName === 'session-refreshed' || 
            eventName === 'login' || eventName === 'logout' || eventName === 'ready') {
            try {
                window.dispatchEvent(new CustomEvent(`auth-${eventName}`, {
                    detail: eventDetail
                }));
            } catch (error) {}
        }
    }
    
    function _addEventListener(eventName, callback) {
        if (!_eventListeners[eventName]) {
            _eventListeners[eventName] = [];
        }
        
        const exists = _eventListeners[eventName].some(
            existing => existing === callback || existing.toString() === callback.toString()
        );
        
        if (!exists) {
            _eventListeners[eventName].push(callback);
        }
        
        return () => {
            const index = _eventListeners[eventName].indexOf(callback);
            if (index !== -1) {
                _eventListeners[eventName].splice(index, 1);
            }
        };
    }
    
    function _setSafeInterval(fn, delay) {
        const id = setInterval(fn, delay);
        _moduleState.intervalIds.add(id);
        return id;
    }
    
    function _setSafeTimeout(fn, delay) {
        const id = setTimeout(() => {
            _moduleState.intervalIds.delete(id);
            fn();
        }, delay);
        return id;
    }
    
    function _clearAllIntervals() {
        _moduleState.intervalIds.forEach(id => {
            try { clearInterval(id); } catch (e) {}
        });
        _moduleState.intervalIds.clear();
    }
    
    async function _withRetry(fn, operation, maxAttempts = CONFIG.RETRY.MAX_ATTEMPTS) {
        let lastError;
        let attempt = 0;
        
        while (attempt < maxAttempts) {
            attempt++;
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                const isRetryable = error.code === 'NETWORK_ERROR' || 
                                   (error.status >= 500 && error.status < 600) ||
                                   error.message?.includes('network') ||
                                   error.message?.includes('timeout');
                
                if (!isRetryable || attempt >= maxAttempts) {
                    break;
                }
                
                const delay = CONFIG.RETRY.DELAY_MS * Math.pow(CONFIG.RETRY.BACKOFF_MULTIPLIER, attempt - 1);
                await new Promise(resolve => _setSafeTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }
    
    function _checkDependencies() {
        _moduleState.dependencyCheckAttempts++;
        
        const hasApiCore = !!(window.api && window.api.core);
        const hasApiRequest = !!(window.api && window.api.request);
        const hasAppCore = !!(window.AppCore);
        
        _moduleState.apiCoreAvailable = hasApiCore;
        _moduleState.apiRequestAvailable = hasApiRequest;
        _moduleState.appCoreAvailable = hasAppCore;
        
        _checkExternalReadiness();
        
        const depsReady = hasApiCore && hasApiRequest;
        if (depsReady !== _moduleState.dependenciesReady) {
            _moduleState.dependenciesReady = depsReady;
            if (depsReady) {
                console.log('✅ [AUTH] Dependencies ready');
                _readinessState.dependenciesReady = true;
                
                if (_readinessState.initCompleted && !_readinessState.isReady) {
                    _markReady();
                }
            }
        }
        
        return _moduleState.dependenciesReady;
    }
    
    function _checkExternalReadiness() {
        if (!_moduleState.coreBootstrapChecked) {
            const bootstrapReady = 
                (window.app && window.app.core && window.app.core.bootstrap && window.app.core.bootstrap.ready) ||
                (window.__APP_BOOTSTRAP_COMPLETE__) ||
                (window._BOOTSTRAP_READY_);
            
            if (bootstrapReady) {
                _moduleState.coreBootstrapReady = true;
                _moduleState.coreBootstrapChecked = true;
                _readinessState.coreBootstrapReady = true;
            }
        }
        
        if (!_moduleState.coreSessionChecked) {
            const sessionReady = 
                (window.app && window.app.core && window.app.core.session && window.app.core.session.ready) ||
                (window.__SESSION_READY__) ||
                (window._SESSION_INITIALIZED_);
            
            if (sessionReady) {
                _moduleState.coreSessionReady = true;
                _moduleState.coreSessionChecked = true;
                _readinessState.coreSessionReady = true;
            }
        }
    }
    
    function _waitForDependencies() {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const maxWaitTime = CONFIG.DEPENDENCY_TIMEOUT;
            
            const checkInterval = _setSafeInterval(() => {
                if (_checkDependencies()) {
                    clearInterval(checkInterval);
                    _moduleState.intervalIds.delete(checkInterval);
                    resolve(true);
                } else if (Date.now() - startTime > maxWaitTime) {
                    clearInterval(checkInterval);
                    _moduleState.intervalIds.delete(checkInterval);
                    _moduleState.lifecycleState = 'dependencies_timeout';
                    _readinessState.dependenciesReady = false;
                    resolve(false);
                }
            }, 100);
            
            _moduleState.intervalIds.add(checkInterval);
        });
    }
    
    function _setMetadataFields(authObject) {
        if (!authObject || _moduleState.metadataFieldsSet) {
            return;
        }
        
        try {
            if (!Object.getOwnPropertyDescriptor(authObject, 'version')) {
                Object.defineProperty(authObject, 'version', {
                    value: VERSION,
                    writable: false,
                    configurable: false,
                    enumerable: true
                });
            }
            
            if (!Object.getOwnPropertyDescriptor(authObject, 'lifecycleState')) {
                Object.defineProperty(authObject, 'lifecycleState', {
                    get: () => _moduleState.lifecycleState,
                    set: (value) => { _moduleState.lifecycleState = value; },
                    enumerable: true,
                    configurable: false
                });
            }
            
            if (!Object.getOwnPropertyDescriptor(authObject, 'registrationComplete')) {
                Object.defineProperty(authObject, 'registrationComplete', {
                    get: () => _moduleState.registrationComplete,
                    set: (value) => { _moduleState.registrationComplete = Boolean(value); },
                    enumerable: true,
                    configurable: false
                });
            }
            
            if (!Object.getOwnPropertyDescriptor(authObject, '_initialized')) {
                Object.defineProperty(authObject, '_initialized', {
                    get: () => _moduleState.initialized,
                    set: (value) => { _moduleState.initialized = Boolean(value); },
                    enumerable: true,
                    configurable: false
                });
            }
            
            if (!Object.getOwnPropertyDescriptor(authObject, 'instanceId')) {
                Object.defineProperty(authObject, 'instanceId', {
                    value: window._API_AUTH_V21_LOADED_.instanceId,
                    writable: false,
                    configurable: false,
                    enumerable: true
                });
            }
            
            if (!Object.getOwnPropertyDescriptor(authObject, 'loadedAt')) {
                Object.defineProperty(authObject, 'loadedAt', {
                    value: _moduleState.loadStartTime,
                    writable: false,
                    configurable: false,
                    enumerable: true
                });
            }
            
            if (!Object.getOwnPropertyDescriptor(authObject, 'bootstrapComplete')) {
                Object.defineProperty(authObject, 'bootstrapComplete', {
                    get: () => _moduleState.bootstrapComplete,
                    set: (value) => {
                        _moduleState.bootstrapComplete = Boolean(value);
                        if (value) {
                            _readinessState.bootstrapReady = true;
                        }
                    },
                    enumerable: true,
                    configurable: false
                });
            }
            
            if (!Object.getOwnPropertyDescriptor(authObject, 'endpointPrefix')) {
                Object.defineProperty(authObject, 'endpointPrefix', {
                    get: () => _moduleState.endpointPrefix,
                    set: (value) => {
                        if (value && typeof value === 'string') {
                            _moduleState.endpointPrefix = value;
                        }
                    },
                    enumerable: true,
                    configurable: false
                });
            }
            
            if (!Object.getOwnPropertyDescriptor(authObject, 'safetyStatus')) {
                Object.defineProperty(authObject, 'safetyStatus', {
                    get: () => ({
                        handshakeAttempts: _moduleState.handshakeAttempts,
                        handshakeComplete: _moduleState.handshakeComplete,
                        sessionErrorLogged: _moduleState.sessionErrorLogged,
                        tokenErrorLogged: _moduleState.tokenErrorLogged,
                        apiCallFailures: Object.keys(_moduleState.apiCallFailures).length
                    }),
                    enumerable: true,
                    configurable: false
                });
            }
            
            if (!Object.getOwnPropertyDescriptor(authObject, 'readiness')) {
                Object.defineProperty(authObject, 'readiness', {
                    get: () => ({
                        isReady: _readinessState.isReady,
                        initCompleted: _readinessState.initCompleted,
                        initFailed: _readinessState.initFailed,
                        dependenciesReady: _readinessState.dependenciesReady,
                        bootstrapReady: _readinessState.bootstrapReady,
                        coreBootstrapReady: _readinessState.coreBootstrapReady,
                        coreSessionReady: _readinessState.coreSessionReady,
                        readyTime: _readinessState.readyTime,
                        initTime: _readinessState.readyTime ? _readinessState.readyTime - _readinessState.startTime : null
                    }),
                    enumerable: true,
                    configurable: false
                });
            }
            
            _moduleState.metadataFieldsSet = true;
            console.log('✅ [AUTH] Metadata fields set');
        } catch (error) {}
    }
    
    function _guaranteeMethods() {
        if (_moduleState.methodGuaranteeExecuted) return;
        
        console.log('🔐 [AUTH] Executing method guarantee');
        
        if (!window.api) window.api = {};
        if (!window.api.auth) window.api.auth = {};
        
        const methods = {
            getCurrentUser,
            getUser: getUser || getCurrentUser,
            login,
            logout,
            isAuthenticated,
            waitForReady,
            waitFor
        };
        
        _registerMethods(window.api.auth, methods, 'api.auth.guarantee');
        
        if (!window.api.auth.getUser && window.api.auth.getCurrentUser) {
            _registerMethod(window.api.auth, 'getUser', window.api.auth.getCurrentUser, 'api.auth.alias');
        }
        
        _moduleState.methodGuaranteeExecuted = true;
        console.log('✅ [AUTH] Method guarantee completed');
    }
    
    function _markBootstrapComplete() {
        if (_moduleState.bootstrapComplete) {
            return;
        }
        
        _moduleState.bootstrapComplete = true;
        _moduleState.registrationComplete = true;
        _moduleState.lifecycleState = 'ready';
        _readinessState.bootstrapReady = true;
        
        _guaranteeMethods();
        
        console.log('✅ [AUTH] Bootstrap complete');
        
        _moduleState.readyCallbacks.forEach(callback => {
            try { callback(); } catch (error) {}
        });
        _moduleState.readyCallbacks = [];
        
        if (_readinessState.dependenciesReady) {
            _markReady();
        }
        
        _emitEvent('ready', {
            initialized: _moduleState.initialized,
            dependenciesReady: _moduleState.dependenciesReady,
            timestamp: Date.now()
        });
    }
    
    function _registerLegacyAPIs(publicApi) {
        console.log('🔧 [AUTH] Registering legacy compatibility APIs');
        
        const safeMerge = (target, source, sourceName) => {
            Object.keys(source).forEach(key => {
                if (!target[key]) {
                    target[key] = source[key];
                }
            });
        };
        
        if (!window.MoodChatAuth) {
            window.MoodChatAuth = {};
        }
        
        const requiredLegacyMethods = ['login', 'register', 'logout', 'getCurrentUser', 'getUser'];
        requiredLegacyMethods.forEach(methodName => {
            if (!window.MoodChatAuth[methodName] && publicApi[methodName]) {
                window.MoodChatAuth[methodName] = publicApi[methodName];
            }
        });
        
        if (!window.auth) {
            window.auth = {};
        }
        
        requiredLegacyMethods.forEach(methodName => {
            if (!window.auth[methodName] && publicApi[methodName]) {
                window.auth[methodName] = publicApi[methodName];
            }
        });
        
        console.log('✅ [AUTH] Legacy APIs registered');
    }
    
    // ============================================================================
    // PRIVATE TOKEN REGISTRATION SYSTEM
    // ============================================================================
    
    function _registerTokenWithCoreSystem(token) {
        let registered = false;
        let methodUsed = '';
        
        try {
            if (!_isValid(token)) {
                return false;
            }
            
            if (window.api && window.api.core && typeof window.api.core.setAccessToken === 'function') {
                window.api.core.setAccessToken(token);
                registered = true;
                methodUsed = 'api.core.setAccessToken';
            }
            else if (window.api && window.api.core && typeof window.api.core.setToken === 'function') {
                window.api.core.setToken(token);
                registered = true;
                methodUsed = 'api.core.setToken';
            }
            else if (window.api && window.api.core && window.api.core.tokenManager && 
                     typeof window.api.core.tokenManager.initialize === 'function') {
                window.api.core.tokenManager.initialize(token);
                registered = true;
                methodUsed = 'api.core.tokenManager.initialize';
            }
            else if (window.api && window.api.core && window.api.core.tokenManager && 
                     typeof window.api.core.tokenManager.setToken === 'function') {
                window.api.core.tokenManager.setToken(token);
                registered = true;
                methodUsed = 'api.core.tokenManager.setToken';
            }
            else if (window.__API_CORE && typeof window.__API_CORE.setUserToken === 'function') {
                window.__API_CORE.setUserToken(token);
                registered = true;
                methodUsed = '__API_CORE.setUserToken';
            }
            else if (window.AppCore && window.AppCore.tokenManager && 
                     typeof window.AppCore.tokenManager.setToken === 'function') {
                window.AppCore.tokenManager.setToken(token);
                registered = true;
                methodUsed = 'AppCore.tokenManager.setToken';
            }
            
            if (registered) {
                try {
                    window.dispatchEvent(new CustomEvent("api-auth-token-ready", {
                        detail: {
                            token: token,
                            registered: true,
                            method: methodUsed,
                            timestamp: Date.now(),
                            source: 'api.auth.js',
                            version: VERSION
                        }
                    }));
                    
                    window.dispatchEvent(new CustomEvent("token-system-ready", {
                        detail: { token: token, timestamp: Date.now() }
                    }));
                    
                    _readinessState.tokenSystemReady = true;
                } catch (error) {}
            }
        } catch (error) {
            try {
                window.dispatchEvent(new CustomEvent("api-auth-token-ready", {
                    detail: {
                        token: token,
                        registered: false,
                        error: error.message,
                        timestamp: Date.now(),
                        source: 'api.auth.js',
                        version: VERSION
                    }
                }));
            } catch (e) {}
        }
        
        return registered;
    }
    
    // ============================================================================
    // PRIVATE PAYLOAD NORMALIZATION
    // ============================================================================
    
    function _getFormDataValue(formData, fieldName) {
        try { return formData.get(fieldName); } catch (error) { return null; }
    }
    
    // CRITICAL FIX: Login payload normalization to match backend exactly
    function _normalizeLoginPayload(args) {
        console.log('🔧 [AUTH] Normalizing login payload - RAW ARGS:', args);
        
        let normalized = {
            identifier: null,
            password: null,
            _source: 'unknown',
            _debug: {
                argsCount: args.length,
                argTypes: args.map(arg => typeof arg),
                hasFormData: args[0] instanceof FormData,
                firstArgIsObject: typeof args[0] === 'object' && args[0] !== null
            }
        };
        
        // CASE 1: Two string arguments (login(email, password))
        if (args.length >= 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
            const [first, second] = args;
            normalized.identifier = first.trim();
            normalized.password = second;
            normalized._source = 'two_string_args';
            console.log('🔧 [AUTH] Normalized from two string arguments:', normalized);
            return normalized;
        }
        
        // CASE 2: FormData argument
        if (args.length === 1 && args[0] instanceof FormData) {
            const formData = args[0];
            normalized._source = 'formdata';
            
            try {
                const formFields = {};
                for (let [key, value] of formData.entries()) {
                    if (value && typeof value === 'string') {
                        formFields[key.toLowerCase()] = value;
                    }
                }
                
                if (formFields.identifier && !normalized.identifier) {
                    normalized.identifier = formFields.identifier.trim();
                } 
                else {
                    const emailFields = ['email', 'mail', 'useremail', 'e-mail'];
                    for (const field of emailFields) {
                        if (formFields[field] && !normalized.identifier) {
                            normalized.identifier = formFields[field].trim();
                            break;
                        }
                    }
                }
                
                if (!normalized.identifier) {
                    const usernameFields = ['username', 'user', 'usr', 'login'];
                    for (const field of usernameFields) {
                        if (formFields[field] && !normalized.identifier) {
                            normalized.identifier = formFields[field].trim();
                            break;
                        }
                    }
                }
                
                const passwordFields = ['password', 'pass', 'secret', 'pwd', 'passcode'];
                for (const field of passwordFields) {
                    if (formFields[field] && !normalized.password) {
                        normalized.password = formFields[field];
                        break;
                    }
                }
                
                return normalized;
            } catch (error) {
                return normalized;
            }
        }
        
        // CASE 3: Single object argument
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            const input = args[0];
            normalized._source = 'object';
            
            const fieldMappings = [
                { source: 'identifier', target: 'identifier' },
                { source: 'email', target: 'identifier' },
                { source: 'mail', target: 'identifier' },
                { source: 'useremail', target: 'identifier' },
                { source: 'username', target: 'identifier' },
                { source: 'user', target: 'identifier' },
                { source: 'usr', target: 'identifier' },
                { source: 'login', target: 'identifier' },
                { source: 'password', target: 'password' },
                { source: 'pass', target: 'password' },
                { source: 'secret', target: 'password' },
                { source: 'pwd', target: 'password' }
            ];
            
            for (const mapping of fieldMappings) {
                const value = input[mapping.source];
                if (value && !normalized[mapping.target]) {
                    if (mapping.target === 'identifier') {
                        normalized.identifier = String(value).trim();
                    } else if (mapping.target === 'password') {
                        normalized.password = String(value);
                    }
                }
            }
            
            if (input.login && !normalized.identifier && !normalized.password) {
                normalized.identifier = String(input.login).trim();
            }
            
            return normalized;
        }
        
        return normalized;
    }
    
    function _validateLoginPayload(normalized) {
        if (!normalized.password) {
            return {
                valid: false,
                error: 'Password is required',
                code: 'VALIDATION_ERROR'
            };
        }
        
        if (!normalized.identifier) {
            return {
                valid: false,
                error: 'Email or username is required',
                code: 'VALIDATION_ERROR'
            };
        }
        
        return {
            valid: true,
            payload: {
                identifier: normalized.identifier,
                password: normalized.password
            }
        };
    }
    
    function _normalizeRegisterPayload(args) {
        console.log('🔧 [AUTH] Normalizing register payload');
        
        let normalized = {
            email: null,
            username: null,
            password: null,
            confirmPassword: null,
            name: null,
            avatar: null,
            _source: 'unknown',
            _debug: {
                argsCount: args.length,
                argTypes: args.map(arg => typeof arg),
                hasFormData: args[0] instanceof FormData
            }
        };
        
        if (args.length >= 4 && 
            typeof args[0] === 'string' && 
            typeof args[1] === 'string' && 
            typeof args[2] === 'string' && 
            typeof args[3] === 'string') {
            
            normalized.email = args[0].trim();
            normalized.username = args[1].trim();
            normalized.password = args[2];
            normalized.confirmPassword = args[3];
            normalized._source = 'four_string_args';
            
            if (args.length >= 5 && typeof args[4] === 'string') {
                normalized.name = args[4].trim();
            }
            
            return normalized;
        }
        
        if (args.length === 1 && args[0] instanceof FormData) {
            const formData = args[0];
            normalized._source = 'formdata';
            
            try {
                const formFields = {};
                for (let [key, value] of formData.entries()) {
                    if (value && typeof value === 'string') {
                        formFields[key.toLowerCase()] = value;
                    }
                }
                
                const mappings = [
                    { fields: ['email', 'mail', 'useremail'], target: 'email' },
                    { fields: ['username', 'user', 'usr', 'login'], target: 'username' },
                    { fields: ['password', 'pass', 'secret', 'pwd'], target: 'password' },
                    { fields: ['confirmpassword', 'confirmpass', 'pass2', 'confirm', 'passwordconfirm', 'confirm_password'], target: 'confirmPassword' },
                    { fields: ['name', 'fullname', 'displayname', 'full_name', 'display_name'], target: 'name' },
                    { fields: ['avatar', 'picture', 'photo', 'image', 'profilepic'], target: 'avatar' }
                ];
                
                for (const mapping of mappings) {
                    for (const field of mapping.fields) {
                        if (formFields[field] && !normalized[mapping.target]) {
                            if (mapping.target === 'email' || mapping.target === 'username' || mapping.target === 'name' || mapping.target === 'avatar') {
                                normalized[mapping.target] = formFields[field].trim();
                            } else {
                                normalized[mapping.target] = formFields[field];
                            }
                            break;
                        }
                    }
                }
                
                if (formFields.user && !normalized.email && !normalized.username) {
                    const userValue = formFields.user.trim();
                    if (userValue.includes('@')) {
                        normalized.email = userValue;
                    } else {
                        normalized.username = userValue;
                    }
                }
                
                return normalized;
            } catch (error) {
                return normalized;
            }
        }
        
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            const input = args[0];
            normalized._source = 'object';
            
            const mappings = [
                { fields: ['email', 'mail', 'useremail'], target: 'email' },
                { fields: ['username', 'user', 'usr', 'login'], target: 'username' },
                { fields: ['password', 'pass', 'secret', 'pwd'], target: 'password' },
                { fields: ['confirmPassword', 'confirmpassword', 'confirm', 'pass2', 'passwordConfirm', 'confirm_password'], target: 'confirmPassword' },
                { fields: ['name', 'fullname', 'displayName', 'full_name', 'display_name'], target: 'name' },
                { fields: ['avatar', 'picture', 'photo', 'image', 'profilePic'], target: 'avatar' }
            ];
            
            for (const mapping of mappings) {
                for (const field of mapping.fields) {
                    const value = input[field];
                    if (value !== undefined && value !== null && !normalized[mapping.target]) {
                        if (mapping.target === 'email' || mapping.target === 'username' || mapping.target === 'name' || mapping.target === 'avatar') {
                            normalized[mapping.target] = String(value).trim();
                        } else {
                            normalized[mapping.target] = String(value);
                        }
                        break;
                    }
                }
            }
            
            if (input.user !== undefined && input.user !== null && !normalized.email && !normalized.username) {
                const userValue = String(input.user).trim();
                if (userValue.includes('@')) {
                    normalized.email = userValue;
                } else {
                    normalized.username = userValue;
                }
            }
            
            if (!normalized.confirmPassword) {
                const confirmFields = ['confirm', 'confirm_password', 'passwordConfirm', 'password_confirmation', 'pass2', 'repeatPassword', 'repeat_password', 'repassword'];
                for (const field of confirmFields) {
                    const value = input[field];
                    if (value !== undefined && value !== null && typeof value === 'string' && value.trim() !== '') {
                        normalized.confirmPassword = String(value);
                        break;
                    }
                }
                
                if (!normalized.confirmPassword && normalized.password) {
                    normalized.confirmPassword = normalized.password;
                }
            }
            
            return normalized;
        }
        
        return normalized;
    }
    
    function _validateRegisterPayload(normalized) {
        const errors = [];
        
        if (!normalized.email) {
            errors.push('Email is required');
        } else if (!normalized.email.includes('@')) {
            errors.push('Valid email is required');
        }
        
        if (!normalized.username) {
            errors.push('Username is required');
        } else if (normalized.username.length < 3) {
            errors.push('Username must be at least 3 characters');
        }
        
        if (!normalized.password) {
            errors.push('Password is required');
        } else if (normalized.password.length < 8) {
            errors.push('Password must be at least 8 characters');
        }
        
        if (!normalized.confirmPassword) {
            errors.push('Password confirmation is required');
        } else if (normalized.password !== normalized.confirmPassword) {
            errors.push('Passwords do not match');
        }
        
        if (errors.length > 0) {
            return {
                valid: false,
                error: errors.join('. '),
                code: 'VALIDATION_ERROR'
            };
        }
        
        return {
            valid: true,
            payload: {
                email: normalized.email,
                username: normalized.username,
                password: normalized.password,
                ...(normalized.name && { name: normalized.name }),
                ...(normalized.avatar && { avatar: normalized.avatar })
            }
        };
    }
    
    function _normalizeForgotPasswordPayload(args) {
        if (args.length === 1 && typeof args[0] === 'string') {
            return args[0].trim();
        }
        
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            const obj = args[0];
            const possibleFields = ['email', 'mail', 'user', 'username', 'identifier'];
            for (const field of possibleFields) {
                if (obj[field] && typeof obj[field] === 'string') {
                    return String(obj[field]).trim();
                }
            }
            
            const keys = Object.keys(obj);
            if (keys.length === 1 && typeof obj[keys[0]] === 'string') {
                return String(obj[keys[0]]).trim();
            }
        }
        
        if (args.length === 1) {
            return String(args[0]).trim();
        }
        
        throw new Error('Invalid arguments for forgotPassword');
    }
    
    function _normalizeResetPasswordPayload(args) {
        if (args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
            return {
                token: args[0].trim(),
                newPassword: args[1]
            };
        }
        
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            const obj = args[0];
            const result = { token: null, newPassword: null };
            
            const tokenFields = ['token', 'resetToken', 'code', 'verificationCode'];
            const passwordFields = ['newPassword', 'password', 'pass', 'secret'];
            
            for (const field of tokenFields) {
                if (obj[field] && typeof obj[field] === 'string') {
                    result.token = String(obj[field]).trim();
                    break;
                }
            }
            
            for (const field of passwordFields) {
                if (obj[field] && typeof obj[field] === 'string') {
                    result.newPassword = String(obj[field]);
                    break;
                }
            }
            
            return result;
        }
        
        throw new Error('Invalid arguments for resetPassword');
    }
    
    // ============================================================================
    // PRIVATE TOKEN MANAGEMENT
    // ============================================================================
    
    function getUserToken() {
        try {
            if (window.__API_CORE && typeof window.__API_CORE.getUserToken === 'function') {
                const coreToken = window.__API_CORE.getUserToken();
                if (_isValid(coreToken)) {
                    return coreToken;
                }
            }
            
            for (const key of CONFIG.TOKEN_KEYS) {
                const token = _safeStorageGet(key);
                if (_isValid(token)) {
                    if (token.trim() === '' || token === 'undefined' || token === 'null') {
                        _safeStorageRemove(key);
                        continue;
                    }
                    
                    const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
                    if (expiry && Date.now() > parseInt(expiry, 10)) {
                        clearUserToken();
                        return null;
                    }
                    
                    return token;
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
    
    function _validateTokenSafety(token) {
        if (!token || typeof token !== 'string') {
            return false;
        }
        
        const suspiciousPatterns = ['script:', 'eval', 'function', 'constructor', 'proto', '__proto__', 'alert', 'document.cookie'];
        
        for (const pattern of suspiciousPatterns) {
            if (token.toLowerCase().includes(pattern)) {
                return false;
            }
        }
        
        return true;
    }
    
    function setUserToken(token, expiryMs = CONFIG.DEFAULT_TOKEN_EXPIRY) {
        try {
            if (!_validateTokenSafety(token)) {
                return false;
            }
            
            _registerTokenWithCoreSystem(token);
            
            if (window.__API_CORE && typeof window.__API_CORE.setUserToken === 'function') {
                try {
                    window.__API_CORE.setUserToken(token);
                } catch (error) {}
            }
            
            let storedSuccessfully = false;
            for (const key of CONFIG.TOKEN_KEYS) {
                if (_safeStorageSet(key, token)) {
                    storedSuccessfully = true;
                }
            }
            
            if (!storedSuccessfully) {
                throw new Error('Failed to store token');
            }
            
            if (expiryMs && !isNaN(expiryMs)) {
                const expiryTime = Date.now() + expiryMs;
                _safeStorageSet(CONFIG.TOKEN_EXPIRY_KEY, expiryTime.toString());
            }
            
            return true;
        } catch (error) {
            return false;
        }
    }
    
    function clearUserToken() {
        try {
            if (window.__API_CORE && typeof window.__API_CORE.clearAllAuthData === 'function') {
                try {
                    window.__API_CORE.clearAllAuthData();
                } catch (error) {}
            }
            
            for (const key of CONFIG.TOKEN_KEYS) {
                _safeStorageRemove(key);
            }
            
            _safeStorageRemove(CONFIG.TOKEN_EXPIRY_KEY);
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            
            return true;
        } catch (error) {
            return false;
        }
    }
    
    function _trackApiCallFailure(endpoint, error) {
        const key = `${endpoint}:${error}`;
        _moduleState.apiCallFailures[key] = (_moduleState.apiCallFailures[key] || 0) + 1;
        
        const now = Date.now();
        for (const failureKey in _moduleState.apiCallFailures) {
            if (now - (_moduleState.apiCallFailures[failureKey + '_time'] || 0) > 300000) {
                delete _moduleState.apiCallFailures[failureKey];
                delete _moduleState.apiCallFailures[failureKey + '_time'];
            }
        }
        
        _moduleState.apiCallFailures[key + '_time'] = now;
        
        if (_moduleState.apiCallFailures[key] > 3) {
            return false;
        }
        
        return true;
    }
    
    async function _safeApiCall(apiRequestFunc, endpoint, payload, options = {}) {
        if (!_validateEndpointSafety(endpoint)) {
            return {
                success: false,
                error: 'Invalid endpoint',
                code: 'ENDPOINT_INVALID',
                status: 400
            };
        }
        
        const failureKey = `${endpoint}:suppressed`;
        if (_moduleState.apiCallFailures[failureKey] > 5) {
            return {
                success: false,
                error: 'Endpoint temporarily unavailable',
                code: 'ENDPOINT_SUPPRESSED',
                status: 503
            };
        }
        
        try {
            const result = await apiRequestFunc(endpoint, payload, options);
            delete _moduleState.apiCallFailures[`${endpoint}:suppressed`];
            return result;
        } catch (error) {
            const shouldContinue = _trackApiCallFailure(endpoint, error.message);
            
            if (!shouldContinue) {
                _moduleState.apiCallFailures[failureKey] = (_moduleState.apiCallFailures[failureKey] || 0) + 1;
            }
            
            return {
                success: false,
                error: error.message || 'API call failed',
                code: 'NETWORK_ERROR',
                status: 0
            };
        }
    }
    
    async function refreshToken() {
        if (_moduleState.tokenRefreshInProgress) {
            return new Promise((resolve, reject) => {
                _moduleState.pendingAuthRequests.push({ resolve, reject });
            });
        }
        
        if (_moduleState.refreshAttempts >= CONFIG.MAX_REFRESH_ATTEMPTS) {
            _emitEvent('token-expired', { reason: 'Max refresh attempts reached' });
            _performLogout(false);
            return false;
        }
        
        _moduleState.tokenRefreshInProgress = true;
        _moduleState.refreshAttempts++;
        
        try {
            const refreshTokenValue = _safeStorageGet(CONFIG.REFRESH_TOKEN_KEY);
            if (!refreshTokenValue) {
                throw new Error('No refresh token available');
            }
            
            const apiRequest = _getApiRequest();
            if (!apiRequest || !apiRequest.post) {
                throw new Error('API request module not available');
            }
            
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.REFRESH_TOKEN);
            
            const response = await _safeApiCall(
                apiRequest.post.bind(apiRequest),
                endpoint,
                { refreshToken: refreshTokenValue },
                { skipAuth: true, retryCount: 0 }
            );
            
            if (response.success && response.data?.accessToken) {
                const expiresIn = response.data.expiresIn || CONFIG.DEFAULT_TOKEN_EXPIRY;
                setUserToken(response.data.accessToken, expiresIn);
                
                if (response.data.refreshToken) {
                    _safeStorageSet(CONFIG.REFRESH_TOKEN_KEY, response.data.refreshToken);
                }
                
                _moduleState.lastTokenRefresh = Date.now();
                _moduleState.refreshAttempts = 0;
                
                _emitEvent('session-refreshed', {
                    newToken: response.data.accessToken,
                    expiresIn: expiresIn
                });
                
                _moduleState.pendingAuthRequests.forEach(({ resolve }) => {
                    try { resolve(true); } catch (error) {}
                });
                _moduleState.pendingAuthRequests = [];
                
                return true;
            } else {
                throw new Error(response.data?.message || 'Token refresh failed');
            }
        } catch (error) {
            clearUserToken();
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            
            _emitEvent('token-expired', {
                reason: error.message,
                refreshAttempts: _moduleState.refreshAttempts
            });
            
            _moduleState.pendingAuthRequests.forEach(({ reject }) => {
                try { reject(false); } catch (error) {}
            });
            _moduleState.pendingAuthRequests = [];
            
            return false;
        } finally {
            _moduleState.tokenRefreshInProgress = false;
        }
    }
    
    // ============================================================================
    // PRIVATE SESSION VALIDATION
    // ============================================================================
    
    async function validateSession() {
        if (_moduleState.sessionValidationPromise) {
            return _moduleState.sessionValidationPromise;
        }
        
        _moduleState.sessionValidationPromise = (async () => {
            try {
                const token = getUserToken();
                if (!token) {
                    return false;
                }
                
                if (!_isOnline()) {
                    _emitEvent('offline-mode', { action: 'session-validation' });
                    return true;
                }
                
                const apiRequest = _getApiRequest();
                if (!apiRequest || !apiRequest.get) {
                    return !!token;
                }
                
                const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.VALIDATE);
                
                const response = await _safeApiCall(
                    apiRequest.get.bind(apiRequest),
                    endpoint,
                    null,
                    { timeout: 10000, retryCount: 1 }
                );
                
                if (response.success) {
                    return true;
                } else if (response.status === 401) {
                    const hasRefreshToken = !!_safeStorageGet(CONFIG.REFRESH_TOKEN_KEY);
                    if (hasRefreshToken) {
                        const refreshed = await refreshToken();
                        return refreshed;
                    }
                    return false;
                } else {
                    if (!_moduleState.sessionErrorLogged) {
                        _moduleState.sessionErrorLogged = true;
                    }
                    return true;
                }
            } catch (error) {
                const token = getUserToken();
                if (token && (error.message.includes('network') || error.message.includes('offline'))) {
                    return true;
                }
                return false;
            }
        })();
        
        _moduleState.sessionValidationPromise.finally(() => {
            _setSafeTimeout(() => {
                _moduleState.sessionValidationPromise = null;
            }, CONFIG.VALIDATION_CACHE_TIME);
        });
        
        return _moduleState.sessionValidationPromise;
    }
    
    // ============================================================================
    // PRIVATE CROSS-TAB SYNCHRONIZATION
    // ============================================================================
    
    function _validateCrossTabMessage(event) {
        if (!event || !event.key) {
            return false;
        }
        
        const isTokenChange = CONFIG.TOKEN_KEYS.includes(event.key) ||
                             event.key === CONFIG.TOKEN_EXPIRY_KEY ||
                             event.key === CONFIG.REFRESH_TOKEN_KEY;
        
        if (!isTokenChange) {
            return false;
        }
        
        const messageId = `${event.key}:${event.newValue || 'null'}`;
        const now = Date.now();
        
        if (_moduleState.lastCrossTabMessage === messageId && 
            now - _moduleState.lastCrossTabMessageTime < 1000) {
            return false;
        }
        
        _moduleState.lastCrossTabMessage = messageId;
        _moduleState.lastCrossTabMessageTime = now;
        
        return true;
    }
    
    function _initCrossTabSync() {
        if (_moduleState.crossTabSyncInitialized) {
            return;
        }
        
        try {
            window.addEventListener('storage', (event) => {
                if (!_validateCrossTabMessage(event)) {
                    return;
                }
                
                if (!event.newValue && event.oldValue && CONFIG.TOKEN_KEYS.includes(event.key)) {
                    _emitEvent('cross-tab-logout', {
                        source: 'storage-event',
                        key: event.key
                    });
                    _performLogout(false);
                }
                
                if (event.newValue && !event.oldValue && CONFIG.TOKEN_KEYS.includes(event.key)) {
                    try {
                        window.dispatchEvent(new CustomEvent('auth-tab-sync', {
                            detail: {
                                action: 'login',
                                timestamp: Date.now(),
                                key: event.key
                            }
                        }));
                    } catch (error) {}
                }
                
                _emitEvent('auth-state-changed', {
                    key: event.key,
                    oldValue: event.oldValue,
                    newValue: event.newValue
                });
            });
            
            window.addEventListener('cross-tab-logout', (event) => {
                _performLogout(false);
            });
            
            _setupCrossTabHeartbeat();
            
            _moduleState.crossTabSyncInitialized = true;
            console.log('✅ [AUTH] Cross-tab synchronization initialized');
        } catch (error) {}
    }
    
    function _setupCrossTabHeartbeat() {
        if (_moduleState.crossTabHeartbeatInterval) {
            clearInterval(_moduleState.crossTabHeartbeatInterval);
            _moduleState.intervalIds.delete(_moduleState.crossTabHeartbeatInterval);
        }
        
        _moduleState.crossTabHeartbeatInterval = _setSafeInterval(() => {
            try {
                const authState = {
                    hasToken: !!getUserToken(),
                    timestamp: Date.now(),
                    tabId: window._API_AUTH_V21_LOADED_.instanceId
                };
                
                _safeStorageSet(CONFIG.CROSS_TAB_SYNC_KEY, JSON.stringify(authState));
            } catch (error) {}
        }, 30000);
        
        _moduleState.crossTabCheckInterval = _setSafeInterval(() => {
            try {
                const syncData = _safeStorageGet(CONFIG.CROSS_TAB_SYNC_KEY);
                if (syncData) {
                    try {
                        const otherTabState = JSON.parse(syncData);
                        const timeDiff = Date.now() - otherTabState.timestamp;
                        
                        if (timeDiff > 120000 && otherTabState.hasToken) {
                            // Other tab may have crashed
                        }
                    } catch (e) {}
                }
            } catch (error) {}
        }, 60000);
    }
    
    // ============================================================================
    // PRIVATE IFRAME SYNCHRONIZATION
    // ============================================================================
    
    function _validateIframeMessage(event, expectedOrigin = null) {
        if (!event || !event.data || typeof event.data !== 'object') {
            return false;
        }
        
        if (expectedOrigin && event.origin !== expectedOrigin) {
            return false;
        }
        
        if (!event.data.type || typeof event.data.type !== 'string') {
            return false;
        }
        
        const messageId = `${event.data.type}:${JSON.stringify(event.data.payload || {})}`;
        const now = Date.now();
        
        if (_moduleState.lastIframeMessage === messageId && 
            now - _moduleState.lastIframeMessageTime < 1000) {
            return false;
        }
        
        _moduleState.lastIframeMessage = messageId;
        _moduleState.lastIframeMessageTime = now;
        
        return true;
    }
    
    function _safePostMessage(target, message, targetOrigin = '*') {
        try {
            if (!target || !message) {
                return false;
            }
            
            target.postMessage(message, targetOrigin);
            return true;
        } catch (error) {
            return false;
        }
    }
    
    function _performHandshake() {
        if (_moduleState.handshakeComplete) {
            return true;
        }
        
        if (_moduleState.handshakeAttempts >= CONFIG.HANDSHAKE_MAX_ATTEMPTS) {
            return false;
        }
        
        const now = Date.now();
        if (now - _moduleState.lastHandshakeAttempt < CONFIG.HANDSHAKE_RETRY_DELAY) {
            return false;
        }
        
        _moduleState.handshakeAttempts++;
        _moduleState.lastHandshakeAttempt = now;
        
        try {
            const token = getUserToken();
            const authState = {
                type: 'AUTH_HANDSHAKE',
                payload: {
                    authenticated: !!token,
                    timestamp: Date.now(),
                    source: 'iframe-auth-handshake',
                    version: VERSION,
                    iframeUrl: window.location.href,
                    handshakeId: Math.random().toString(36).substring(7),
                    attempt: _moduleState.handshakeAttempts
                }
            };
            
            if (token) {
                authState.payload.hasToken = true;
            }
            
            const success = _safePostMessage(window.parent, authState, '*');
            
            if (success) {
                _setSafeTimeout(() => {
                    if (!_moduleState.handshakeComplete) {
                        if (_moduleState.handshakeAttempts < CONFIG.HANDSHAKE_MAX_ATTEMPTS) {
                            _setSafeTimeout(() => _performHandshake(), CONFIG.HANDSHAKE_RETRY_DELAY);
                        }
                    }
                }, 5000);
            }
            
            return success;
        } catch (error) {
            return false;
        }
    }
    
    function _initIframeSync() {
        if (_moduleState.iframeSyncInitialized || window.self === window.top) {
            return;
        }
        
        try {
            console.log('🔐 [AUTH] Initializing iframe synchronization');
            
            const sendAuthState = () => {
                const token = getUserToken();
                const authState = {
                    type: 'AUTH_SYNC',
                    payload: {
                        authenticated: !!token,
                        timestamp: Date.now(),
                        source: 'iframe-auth-sync',
                        version: VERSION,
                        iframeUrl: window.location.href
                    }
                };
                
                _safePostMessage(window.parent, authState, '*');
            };
            
            sendAuthState();
            _performHandshake();
            
            window.addEventListener('message', (event) => {
                if (!_validateIframeMessage(event)) {
                    return;
                }
                
                if (event.source !== window.parent) {
                    return;
                }
                
                const data = event.data;
                
                switch (data.type) {
                    case 'AUTH_HANDSHAKE_RESPONSE':
                        _moduleState.handshakeComplete = true;
                        _moduleState.handshakeAttempts = 0;
                        
                        if (data.payload && data.payload.action) {
                            _handleParentAction(data.payload.action, data.payload.data);
                        }
                        break;
                        
                    case 'AUTH_UPDATE':
                        if (!data.payload.authenticated) {
                            _performLogout(false);
                        } else if (data.payload.token && _validateTokenSafety(data.payload.token)) {
                            setUserToken(data.payload.token, data.payload.expiresIn);
                        }
                        break;
                        
                    case 'AUTH_REQUEST':
                        sendAuthState();
                        break;
                        
                    case 'AUTH_LOGOUT':
                        _performLogout(false);
                        break;
                        
                    case 'AUTH_ACTION':
                        _handleParentAction(data.payload.action, data.payload.data);
                        break;
                }
            });
            
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    _setSafeTimeout(sendAuthState, 100);
                }
            });
            
            _moduleState.iframeSyncInitialized = true;
            console.log('✅ [AUTH] Iframe synchronization initialized');
        } catch (error) {}
    }
    
    function _handleParentAction(action, data) {
        try {
            switch (action) {
                case 'VALIDATE_SESSION':
                    validateSession().then(isValid => {
                        _safePostMessage(window.parent, {
                            type: 'AUTH_ACTION_RESPONSE',
                            payload: {
                                action: 'VALIDATE_SESSION',
                                success: isValid,
                                timestamp: Date.now()
                            }
                        }, '*');
                    });
                    break;
                    
                case 'GET_AUTH_STATE':
                    getAuthState().then(state => {
                        _safePostMessage(window.parent, {
                            type: 'AUTH_ACTION_RESPONSE',
                            payload: {
                                action: 'GET_AUTH_STATE',
                                state: state,
                                timestamp: Date.now()
                            }
                        }, '*');
                    });
                    break;
                    
                case 'REFRESH_TOKEN':
                    refreshToken().then(success => {
                        _safePostMessage(window.parent, {
                            type: 'AUTH_ACTION_RESPONSE',
                            payload: {
                                action: 'REFRESH_TOKEN',
                                success: success,
                                timestamp: Date.now()
                            }
                        }, '*');
                    });
                    break;
            }
        } catch (error) {}
    }
    
    // ============================================================================
    // PRIVATE LOGOUT HANDLER
    // ============================================================================
    
    function _performLogout(notifyUI = true) {
        try {
            clearUserToken();
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            
            CONFIG.USER_DATA_KEYS.forEach(key => {
                _safeStorageRemove(key);
            });
            
            window.currentUser = null;
            
            _safeStorageRemove('authUser');
            _safeStorageRemove('moodchat_auth_user');
            _safeStorageRemove('userData');
            
            _moduleState.refreshAttempts = 0;
            _moduleState.sessionValidationPromise = null;
            _moduleState.pendingAuthRequests = [];
            _moduleState.handshakeComplete = false;
            _moduleState.handshakeAttempts = 0;
            
            if (notifyUI) {
                try {
                    _safeStorageSet(CONFIG.CROSS_TAB_LOGOUT_TRIGGER, Date.now().toString());
                    _setSafeTimeout(() => {
                        _safeStorageRemove(CONFIG.CROSS_TAB_LOGOUT_TRIGGER);
                    }, 100);
                    
                    window.dispatchEvent(new CustomEvent('user-logged-out', {
                        detail: {
                            timestamp: new Date().toISOString(),
                            source: 'api.auth.js',
                            version: VERSION,
                            manualLogout: notifyUI
                        }
                    }));
                } catch (e) {}
            }
            
            _emitEvent('logout', { notifyUI });
            _emitEvent('auth-state-changed', { action: 'logout', notifyUI });
            
            return true;
        } catch (error) {
            return false;
        }
    }
    
    // ============================================================================
    // CRITICAL FIX: PUBLIC API FUNCTIONS - LOGIN WORKS EXACTLY LIKE BROWSER TEST
    // ============================================================================
    
    /**
     * PUBLIC: Login with credentials - CRITICAL FIX - Works exactly like browser console test
     */
    async function login(...args) {
        console.log('🔐 [AUTH] Login attempt - USING DIRECT FETCH LIKE BROWSER TEST');
        
        const operation = 'login';
        
        try {
            // Wait for api.core to be ready
            const coreReady = await _waitForApiCore();
            if (!coreReady) {
                console.warn('⚠️ [AUTH] api.core not ready, but continuing with direct fetch');
            }
            
            // Normalize payload from various formats
            const normalized = _normalizeLoginPayload(args);
            console.log('🔧 [AUTH] Normalized login data:', normalized);
            
            // Validate normalized payload
            const validation = _validateLoginPayload(normalized);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    code: validation.code,
                    message: validation.error
                };
            }
            
            const payload = validation.payload;
            console.log('🔧 [AUTH] Final login payload:', payload);
            
            // CRITICAL FIX: Use DIRECT FETCH like the browser console test
            // This ensures 100% compatibility with the backend
            try {
                console.log('🔐 [AUTH] Making direct fetch to:', 'http://localhost:4000/api/auth/login');
                
                const response = await fetch('http://localhost:4000/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                
                console.log('🔐 [AUTH] Response status:', response.status);
                
                // Check if response is OK
                if (!response.ok) {
                    const text = await response.text();
                    console.error('🔐 [AUTH] Error response text:', text);
                    
                    // Try to parse as JSON if possible
                    try {
                        const errorJson = JSON.parse(text);
                        return {
                            success: false,
                            error: errorJson.message || 'Login failed',
                            code: response.status === 401 ? 'INVALID_CREDENTIALS' : 'LOGIN_FAILED',
                            status: response.status,
                            message: errorJson.message || 'Invalid email/username or password',
                            payload: payload
                        };
                    } catch (e) {
                        // Not JSON, return text
                        return {
                            success: false,
                            error: text || 'Login failed',
                            code: 'LOGIN_FAILED',
                            status: response.status,
                            message: text || 'Login failed',
                            payload: payload
                        };
                    }
                }
                
                // Parse successful response
                const data = await response.json();
                console.log('🔐 [AUTH] Login successful response:', data);
                
                if (data.accessToken || data.token) {
                    const token = data.accessToken || data.token;
                    const expiresIn = data.expiresIn || CONFIG.DEFAULT_TOKEN_EXPIRY;
                    
                    // Store tokens
                    setUserToken(token, expiresIn);
                    
                    if (data.refreshToken) {
                        _safeStorageSet(CONFIG.REFRESH_TOKEN_KEY, data.refreshToken);
                    }
                    
                    // Store user data
                    if (data.user) {
                        const userData = JSON.stringify(data.user);
                        _safeStorageSet('USER_DATA', userData);
                        window.currentUser = data.user;
                    } else if (data.data && data.data.user) {
                        const userData = JSON.stringify(data.data.user);
                        _safeStorageSet('USER_DATA', userData);
                        window.currentUser = data.data.user;
                    }
                    
                    // Initialize synchronization
                    _initCrossTabSync();
                    _initIframeSync();
                    
                    // Dispatch login event
                    _emitEvent('login', {
                        user: data.user || (data.data && data.data.user),
                        timestamp: new Date().toISOString(),
                        payloadType: args.length > 1 ? 'legacy-args' : 'object',
                        backendPayload: payload
                    });
                    
                    try {
                        window.dispatchEvent(new CustomEvent('user-logged-in', {
                            detail: {
                                user: data.user || (data.data && data.data.user),
                                timestamp: new Date().toISOString(),
                                source: 'api.auth.js',
                                version: VERSION,
                                payloadType: args.length > 1 ? 'legacy-args' : 'object'
                            }
                        }));
                    } catch (error) {}
                    
                    console.log('✅ [AUTH] Login successful with direct fetch');
                    
                    return {
                        success: true,
                        user: data.user || (data.data && data.data.user),
                        token: token,
                        expiresIn: expiresIn,
                        message: 'Login successful',
                        payloadType: args.length > 1 ? 'legacy-args' : 'object',
                        identifierUsed: normalized.identifier
                    };
                } else {
                    return {
                        success: false,
                        error: data.message || 'Login failed - no token received',
                        code: 'LOGIN_FAILED',
                        status: response.status,
                        message: data.message || 'Login failed',
                        payload: payload,
                        data: data
                    };
                }
            } catch (fetchError) {
                console.error('🔐 [AUTH] Fetch error:', fetchError);
                
                return {
                    success: false,
                    error: fetchError.message || 'Network error',
                    code: 'NETWORK_ERROR',
                    message: 'Unable to connect to authentication service',
                    status: 0,
                    args: args
                };
            }
        } catch (error) {
            _safeLogError('LOGIN', 'Login error', {
                error: error.message || error.error,
                argsCount: args.length
            }, false, operation);
            
            return {
                success: false,
                error: error.error || error.message || 'Login failed',
                code: error.code || 'NETWORK_ERROR',
                message: error.message || error.error || 'Unable to connect to authentication service',
                status: error.status || 0,
                args: args
            };
        }
    }
    
    /**
     * PUBLIC: Register new user
     */
    async function register(...args) {
        console.log('🔐 [AUTH] Registration attempt');
        
        const operation = 'register';
        
        try {
            const coreReady = await _waitForApiCore();
            if (!coreReady) {
                console.warn('⚠️ [AUTH] api.core not ready, registration may fail');
            }
            
            const normalized = _normalizeRegisterPayload(args);
            
            const validation = _validateRegisterPayload(normalized);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    code: validation.code,
                    message: validation.error
                };
            }
            
            const payload = validation.payload;
            
            const apiRequest = _getApiRequest();
            if (!apiRequest || !apiRequest.post) {
                return {
                    success: false,
                    error: 'API request module not available',
                    code: 'MODULE_ERROR',
                    message: 'Registration service temporarily unavailable'
                };
            }
            
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.REGISTER);
            
            const response = await _withRetry(async () => {
                const result = await _safeApiCall(
                    apiRequest.post.bind(apiRequest),
                    endpoint,
                    payload,
                    { skipAuth: true }
                );
                
                if (!result.success) {
                    throw result;
                }
                
                return result;
            }, operation, CONFIG.RETRY.MAX_ATTEMPTS);
            
            if (response.success && response.data?.accessToken) {
                const expiresIn = response.data.expiresIn || CONFIG.DEFAULT_TOKEN_EXPIRY;
                setUserToken(response.data.accessToken, expiresIn);
                
                if (response.data.refreshToken) {
                    _safeStorageSet(CONFIG.REFRESH_TOKEN_KEY, response.data.refreshToken);
                }
                
                if (response.data.user) {
                    const userData = JSON.stringify(response.data.user);
                    _safeStorageSet('USER_DATA', userData);
                    window.currentUser = response.data.user;
                }
                
                _initCrossTabSync();
                _initIframeSync();
                
                _emitEvent('registration-complete', {
                    user: response.data.user,
                    timestamp: new Date().toISOString(),
                    payloadType: args.length > 1 ? 'legacy-args' : 'object'
                });
                
                try {
                    window.dispatchEvent(new CustomEvent('user-registered', {
                        detail: {
                            user: response.data.user,
                            timestamp: new Date().toISOString(),
                            source: 'api.auth.js',
                            version: VERSION,
                            payloadType: args.length > 1 ? 'legacy-args' : 'object'
                        }
                    }));
                } catch (error) {}
                
                return {
                    success: true,
                    user: response.data.user,
                    token: response.data.accessToken,
                    expiresIn: expiresIn,
                    message: 'Registration successful',
                    payloadType: args.length > 1 ? 'legacy-args' : 'object'
                };
            } else {
                return {
                    success: false,
                    error: response.data?.message || 'Registration failed',
                    code: response.status === 409 ? 'USER_EXISTS' : 'REGISTRATION_FAILED',
                    status: response.status,
                    message: response.data?.message || 'Unable to complete registration',
                    payload: payload
                };
            }
        } catch (error) {
            _safeLogError('REGISTER', 'Registration error', {
                error: error.message || error.error,
                argsCount: args.length
            }, false, operation);
            
            return {
                success: false,
                error: error.error || error.message || 'Registration failed',
                code: error.code || 'NETWORK_ERROR',
                message: error.message || error.error || 'Unable to connect to registration service',
                status: error.status || 0,
                args: args
            };
        }
    }
    
    /**
     * PUBLIC: Logout current user
     */
    async function logout() {
        console.log('🔐 [AUTH] Logout requested');
        
        const operation = 'logout';
        
        try {
            if (_isOnline()) {
                const apiRequest = _getApiRequest();
                if (apiRequest && apiRequest.post) {
                    const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.LOGOUT);
                    
                    _safeApiCall(
                        apiRequest.post.bind(apiRequest),
                        endpoint,
                        {},
                        { timeout: 5000 }
                    ).catch(error => {});
                }
            }
            
            _performLogout(true);
            
            try {
                window.dispatchEvent(new CustomEvent('logout-complete', {
                    detail: {
                        timestamp: Date.now(),
                        source: 'api.auth.js'
                    }
                }));
            } catch (e) {}
            
            return {
                success: true,
                message: 'Logged out successfully'
            };
        } catch (error) {
            _performLogout(true);
            
            _safeLogError('LOGOUT-PUBLIC', 'Logout error', { error: error.message }, false, operation);
            
            return {
                success: true,
                message: 'Logged out successfully'
            };
        }
    }
    
    /**
     * PUBLIC: Request password reset email
     */
    async function forgotPassword(...args) {
        console.log('🔐 [AUTH] Forgot password request');
        
        const operation = 'forgotPassword';
        
        try {
            const coreReady = await _waitForApiCore();
            if (!coreReady) {
                console.warn('⚠️ [AUTH] api.core not ready, password reset may fail');
            }
            
            const email = _normalizeForgotPasswordPayload(args);
            
            if (!email || typeof email !== 'string' || !email.includes('@')) {
                return {
                    success: false,
                    error: 'Valid email is required',
                    code: 'VALIDATION_ERROR',
                    message: 'Please enter a valid email address'
                };
            }
            
            const apiRequest = _getApiRequest();
            if (!apiRequest || !apiRequest.post) {
                return {
                    success: false,
                    error: 'API request module not available',
                    code: 'MODULE_ERROR',
                    message: 'Password reset service temporarily unavailable'
                };
            }
            
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.FORGOT_PASSWORD);
            
            const response = await _withRetry(async () => {
                const result = await _safeApiCall(
                    apiRequest.post.bind(apiRequest),
                    endpoint,
                    { email: email.trim() },
                    { skipAuth: true }
                );
                
                if (!result.success) {
                    throw result;
                }
                
                return result;
            }, operation, CONFIG.RETRY.MAX_ATTEMPTS);
            
            return {
                success: true,
                message: 'If an account exists with this email, a reset link has been sent',
                status: response.status,
                email: email
            };
        } catch (error) {
            _safeLogError('FORGOT-PASSWORD', 'Forgot password error', {
                error: error.message || error.error,
                argsCount: args.length
            }, false, operation);
            
            return {
                success: true,
                message: 'If an account exists with this email, a reset link has been sent',
                status: 200,
                email: args[0] || 'provided'
            };
        }
    }
    
    /**
     * PUBLIC: Reset password with token
     */
    async function resetPassword(...args) {
        console.log('🔐 [AUTH] Reset password request');
        
        const operation = 'resetPassword';
        
        try {
            const coreReady = await _waitForApiCore();
            if (!coreReady) {
                console.warn('⚠️ [AUTH] api.core not ready, password reset may fail');
            }
            
            const normalized = _normalizeResetPasswordPayload(args);
            
            const { token, newPassword } = normalized;
            
            if (!token || !newPassword) {
                return {
                    success: false,
                    error: 'Token and new password are required',
                    code: 'VALIDATION_ERROR',
                    message: 'Missing required information'
                };
            }
            
            if (newPassword.length < 8) {
                return {
                    success: false,
                    error: 'Password must be at least 8 characters',
                    code: 'PASSWORD_TOO_SHORT',
                    message: 'Password must be at least 8 characters'
                };
            }
            
            const apiRequest = _getApiRequest();
            if (!apiRequest || !apiRequest.post) {
                return {
                    success: false,
                    error: 'API request module not available',
                    code: 'MODULE_ERROR',
                    message: 'Password reset service temporarily unavailable'
                };
            }
            
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.RESET_PASSWORD);
            
            const response = await _withRetry(async () => {
                const result = await _safeApiCall(
                    apiRequest.post.bind(apiRequest),
                    endpoint,
                    { token, newPassword },
                    { skipAuth: true }
                );
                
                if (!result.success) {
                    throw result;
                }
                
                return result;
            }, operation, CONFIG.RETRY.MAX_ATTEMPTS);
            
            return {
                success: response.success,
                message: response.data?.message || (response.success ? 'Password reset successful' : 'Password reset failed'),
                status: response.status,
                tokenPresent: !!token,
                passwordLength: newPassword.length
            };
        } catch (error) {
            _safeLogError('RESET-PASSWORD', 'Reset password error', {
                error: error.message || error.error,
                argsCount: args.length
            }, false, operation);
            
            return {
                success: false,
                error: error.error || 'Password reset failed',
                code: error.code || 'NETWORK_ERROR',
                message: error.message || 'Unable to reset password',
                status: error.status || 0
            };
        }
    }
    
    /**
     * PUBLIC: Attempt auto-login with stored tokens
     */
    async function autoLogin() {
        console.log('🔐 [AUTH] Auto-login attempt');
        
        const operation = 'autoLogin';
        
        try {
            const coreReady = await _waitForApiCore();
            if (!coreReady) {
                return {
                    success: false,
                    error: 'Authentication system not ready',
                    code: 'SYSTEM_NOT_READY',
                    message: 'Please try again in a moment'
                };
            }
            
            const token = getUserToken();
            if (!token) {
                return {
                    success: false,
                    error: 'No stored token found',
                    code: 'NO_TOKEN',
                    message: 'No saved session found'
                };
            }
            
            const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
            if (expiry && Date.now() > parseInt(expiry, 10)) {
                clearUserToken();
                return {
                    success: false,
                    error: 'Token expired',
                    code: 'TOKEN_EXPIRED',
                    message: 'Your session has expired'
                };
            }
            
            const isValid = await validateSession();
            if (!isValid) {
                clearUserToken();
                return {
                    success: false,
                    error: 'Session validation failed',
                    code: 'SESSION_INVALID',
                    message: 'Your session is no longer valid'
                };
            }
            
            const userData = await getCurrentUser();
            if (!userData) {
                return {
                    success: true,
                    user: null,
                    token: getUserToken(),
                    message: 'Auto-login successful (no user data)'
                };
            }
            
            _initCrossTabSync();
            _initIframeSync();
            
            return {
                success: true,
                user: userData,
                token: getUserToken(),
                message: 'Auto-login successful'
            };
        } catch (error) {
            _safeLogError('AUTO-LOGIN', 'Auto-login error', { error: error.message }, false, operation);
            
            clearUserToken();
            
            return {
                success: false,
                error: error.message || 'Auto-login failed',
                code: 'AUTO_LOGIN_FAILED',
                message: 'Unable to restore previous session'
            };
        }
    }
    
    /**
     * PUBLIC: Get current authenticated user
     */
    async function getCurrentUser() {
        try {
            if (window.currentUser && typeof window.currentUser === 'object') {
                return window.currentUser;
            }
            
            for (const key of CONFIG.USER_DATA_KEYS) {
                const userDataStr = _safeStorageGet(key);
                if (userDataStr) {
                    try {
                        const userData = JSON.parse(userDataStr);
                        if (userData && typeof userData === 'object') {
                            window.currentUser = userData;
                            return userData;
                        }
                    } catch (e) {
                        _safeStorageRemove(key);
                    }
                }
            }
            
            const token = getUserToken();
            if (token && _isOnline()) {
                const apiRequest = _getApiRequest();
                if (apiRequest && apiRequest.get) {
                    const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.GET_USER);
                    
                    const response = await _safeApiCall(
                        apiRequest.get.bind(apiRequest),
                        endpoint,
                        null,
                        {}
                    );
                    
                    if (response.success && response.data) {
                        const userData = JSON.stringify(response.data);
                        _safeStorageSet('USER_DATA', userData);
                        window.currentUser = response.data;
                        return response.data;
                    }
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * PUBLIC: Get user - alias for getCurrentUser
     */
    async function getUser() {
        return getCurrentUser();
    }
    
    /**
     * PUBLIC: Refresh current session
     */
    async function refreshSession() {
        return refreshToken();
    }
    
    /**
     * PUBLIC: Check if user is authenticated
     */
    async function isAuthenticated() {
        const token = getUserToken();
        if (!token) return false;
        
        if (!_isOnline()) {
            return true;
        }
        
        return validateSession();
    }
    
    /**
     * PUBLIC: Get authentication state with details
     */
    async function getAuthState() {
        const token = getUserToken();
        const user = await getCurrentUser();
        const isValid = token ? await isAuthenticated() : false;
        
        return {
            authenticated: isValid,
            hasToken: !!token,
            hasUserData: !!user,
            user: user,
            offline: !_isOnline(),
            tokenExpiry: _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY),
            lifecycleState: _moduleState.lifecycleState,
            initialized: _moduleState.initialized,
            bootstrapComplete: _moduleState.bootstrapComplete,
            dependenciesReady: _moduleState.dependenciesReady,
            ready: _readinessState.isReady,
            isAuthFullyReady: _readinessState.isReady,
            isAuthFullyReadySafe: window.api.auth?.isAuthFullyReadySafe || false,
            readiness: {
                isReady: _readinessState.isReady,
                initCompleted: _readinessState.initCompleted,
                dependenciesReady: _readinessState.dependenciesReady,
                bootstrapReady: _readinessState.bootstrapReady,
                coreBootstrapReady: _readinessState.coreBootstrapReady,
                coreSessionReady: _readinessState.coreSessionReady
            },
            safetyStatus: {
                handshakeAttempts: _moduleState.handshakeAttempts,
                handshakeComplete: _moduleState.handshakeComplete,
                sessionErrorLogged: _moduleState.sessionErrorLogged,
                tokenErrorLogged: _moduleState.tokenErrorLogged,
                apiCallFailures: Object.keys(_moduleState.apiCallFailures).length
            },
            payloadNormalization: {
                login: 'identifier_field',
                register: 'enhanced',
                forgotPassword: 'enhanced',
                resetPassword: 'enhanced'
            },
            version: VERSION,
            endpointPrefix: _moduleState.endpointPrefix
        };
    }
    
    /**
     * PUBLIC: Wait for auth module to be ready
     */
    async function waitForReady() {
        return _readinessState.readyPromise;
    }
    
    /**
     * PUBLIC: Wait with timeout
     */
    async function waitFor(timeoutMs = 30000) {
        return waitFor(timeoutMs);
    }
    
    // ============================================================================
    // MODULE INITIALIZATION
    // ============================================================================
    
    function _handleSessionExpiration() {
        if (_moduleState.sessionExpirationHandled) {
            return;
        }
        
        _moduleState.sessionExpirationHandled = true;
        
        clearUserToken();
        
        if (window.self !== window.top) {
            try {
                _safePostMessage(window.parent, {
                    type: 'AUTH_SESSION_EXPIRED',
                    payload: {
                        timestamp: Date.now(),
                        source: 'api.auth.js'
                    }
                }, '*');
            } catch (error) {}
        }
        
        _emitEvent('token-expired', {
            reason: 'session_expired',
            source: 'safety_handler'
        });
        
        _moduleState.sessionValidationPromise = null;
        _moduleState.pendingAuthRequests = [];
        _moduleState.tokenRefreshInProgress = false;
    }
    
    async function _initializeAuthModule() {
        if (_readinessState.initStarted) {
            return _readinessState.readyPromise;
        }
        
        if (_readinessState.initCompleted) {
            return _readinessState.readyPromise;
        }
        
        _readinessState.initStarted = true;
        _moduleState.initializationStarted = true;
        window._API_AUTH_V21_LOADED_.initStarted = true;
        
        console.log(`🔐 [API-AUTH] Initializing authentication module v${VERSION}...`);
        
        try {
            _moduleState.lifecycleState = 'initializing';
            
            await _waitForDependencies();
            
            _initCrossTabSync();
            _initIframeSync();
            
            const expiryCheckInterval = _setSafeInterval(() => {
                try {
                    const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
                    if (expiry) {
                        const timeUntilExpiry = parseInt(expiry, 10) - Date.now();
                        
                        if (timeUntilExpiry < CONFIG.TOKEN_REFRESH_BUFFER && timeUntilExpiry > 0) {
                            refreshToken().catch(error => {});
                        } else if (timeUntilExpiry <= 0) {
                            _handleSessionExpiration();
                        }
                    }
                } catch (error) {}
            }, 30000);
            
            window._API_AUTH_INTERVALS = window._API_AUTH_INTERVALS || [];
            window._API_AUTH_INTERVALS.push(expiryCheckInterval);
            
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && _isOnline()) {
                    const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
                    if (expiry && Date.now() > parseInt(expiry, 10) - 300000) {
                        refreshToken().catch(() => {});
                    }
                }
            });
            
            _moduleState.initialized = true;
            _readinessState.initCompleted = true;
            window._API_AUTH_V21_LOADED_.initialized = true;
            _moduleState.lifecycleState = 'initialized';
            _emitEvent('initialized', { timestamp: Date.now() });
            
            console.log('✅ [API-AUTH] Authentication module initialized');
            
            const token = getUserToken();
            if (token) {
                _setSafeTimeout(async () => {
                    try {
                        await autoLogin();
                    } catch (error) {}
                }, 1000);
            }
            
            return true;
        } catch (error) {
            _safeLogError('MODULE-INIT', 'Failed to initialize auth module', { error: error.message });
            _moduleState.lifecycleState = 'error';
            _readinessState.initFailed = true;
            _readinessState.initError = error;
            _emitEvent('error', { error: error.message, stage: 'initialization' });
            
            _markInitFailed(error);
            
            return false;
        }
    }
    
    // ============================================================================
    // PUBLIC API EXPOSURE
    // ============================================================================
    
    async function _setupPublicAPI() {
        if (window.__API_AUTH_REGISTERED__) {
            console.log('🔧 [AUTH] Public API already registered globally, skipping');
            return window.api.auth;
        }
        
        console.log('🔧 [AUTH] Setting up public API...');
        
        const publicApi = {
            // Core authentication functions
            login,
            register,
            logout,
            autoLogin,
            
            // Password management
            forgotPassword,
            resetPassword,
            
            // User management
            getCurrentUser,
            getUser,
            refreshSession,
            isAuthenticated,
            getAuthState,
            
            // Session utilities
            waitForReady,
            waitFor,
            
            // Event system
            on: _addEventListener,
            
            // Utility
            getVersion: () => VERSION,
            
            // Configuration
            setEndpointPrefix: (prefix) => {
                if (prefix && typeof prefix === 'string') {
                    _moduleState.endpointPrefix = prefix;
                    return true;
                }
                return false;
            },
            
            // Safety utilities
            getSafetyStatus: () => _moduleState.safetyStatus,
            resetSafetyCounters: () => {
                _moduleState.handshakeAttempts = 0;
                _moduleState.apiCallFailures = {};
                _moduleState.errorSuppression = {};
                console.log('✅ [AUTH-SAFETY] Safety counters reset');
            },
            
            // Readiness inspection
            getReadiness: () => ({
                isReady: _readinessState.isReady,
                initCompleted: _readinessState.initCompleted,
                initFailed: _readinessState.initFailed,
                dependenciesReady: _readinessState.dependenciesReady,
                bootstrapReady: _readinessState.bootstrapReady,
                readyTime: _readinessState.readyTime,
                initTime: _readinessState.readyTime ? _readinessState.readyTime - _readinessState.startTime : null
            })
        };
        
        if (!window.api) {
            window.api = {};
        }
        
        if (!window.api.auth) {
            window.api.auth = {};
            console.log('✅ [AUTH] Created new window.api.auth');
        }
        
        // CRITICAL FIX: Register all public methods with force override enabled
        const registrationResult = _registerMethods(window.api.auth, publicApi, 'api.auth.core');
        
        if (!registrationResult.success) {
            console.warn('⚠️ [AUTH] Some methods could not be registered due to conflicts');
        }
        
        // CRITICAL: Ensure getUser alias exists
        if (window.api.auth.getCurrentUser && !window.api.auth.getUser) {
            _registerMethod(window.api.auth, 'getUser', window.api.auth.getCurrentUser, 'api.auth.alias');
        }
        
        // CRITICAL: Ensure readiness methods are properly exposed
        _registerMethod(window.api.auth, 'waitForReady', waitForReady, 'api.auth.readiness');
        _registerMethod(window.api.auth, 'waitFor', waitFor, 'api.auth.readiness');
        
        // Set metadata fields on the auth object
        _setMetadataFields(window.api.auth);
        
        // Register legacy APIs
        _registerLegacyAPIs(publicApi);
        
        // Mark bootstrap as complete
        _markBootstrapComplete();
        
        // Set global registration lock
        window.__API_AUTH_REGISTERED__ = true;
        
        // Fire ready event with enhanced details
        _setSafeTimeout(() => {
            const authState = {
                hasToken: !!getUserToken(),
                version: VERSION,
                timestamp: Date.now(),
                instanceId: window._API_AUTH_V21_LOADED_.instanceId,
                crossTabSync: _moduleState.crossTabSyncInitialized,
                iframeSync: _moduleState.iframeSyncInitialized,
                initialized: _moduleState.initialized,
                bootstrapComplete: _moduleState.bootstrapComplete,
                dependenciesReady: _moduleState.dependenciesReady,
                apiCoreAvailable: _moduleState.apiCoreAvailable,
                apiRequestAvailable: _moduleState.apiRequestAvailable,
                appCoreAvailable: _moduleState.appCoreAvailable,
                payloadNormalization: 'identifier_field',
                loginBackendFormat: 'identifier: <email_or_username>, password: <password>',
                registerBackendFormat: 'email, username, password, confirmPassword, name, avatar',
                safetyEnabled: true,
                handshakeAttempts: _moduleState.handshakeAttempts,
                handshakeComplete: _moduleState.handshakeComplete,
                isAuthFullyReady: _readinessState.isReady,
                isAuthFullyReadySafe: _readinessState.isReady,
                readiness: {
                    isReady: _readinessState.isReady,
                    initCompleted: _readinessState.initCompleted,
                    dependenciesReady: _readinessState.dependenciesReady,
                    bootstrapReady: _readinessState.bootstrapReady
                }
            };
            
            try {
                window.dispatchEvent(new CustomEvent("api-auth-ready", {
                    detail: authState
                }));
            } catch (error) {}
            
            console.log(`✅ api.auth.js v${VERSION} initialized with login fix and force override`, authState);
        }, 100);
        
        return window.api.auth;
    }
    
    // ============================================================================
    // BOOTSTRAP & MAIN ENTRY POINT
    // ============================================================================
    
    function _cleanup() {
        console.log('🧹 [AUTH-SAFETY] Performing cleanup');
        
        if (window._API_AUTH_INTERVALS) {
            window._API_AUTH_INTERVALS.forEach(intervalId => {
                try { clearInterval(intervalId); } catch (error) {}
            });
            window._API_AUTH_INTERVALS = [];
        }
        
        _clearAllIntervals();
        
        if (_moduleState.crossTabHeartbeatInterval) {
            clearInterval(_moduleState.crossTabHeartbeatInterval);
            _moduleState.crossTabHeartbeatInterval = null;
        }
        
        if (_moduleState.crossTabCheckInterval) {
            clearInterval(_moduleState.crossTabCheckInterval);
            _moduleState.crossTabCheckInterval = null;
        }
        
        _moduleState.pendingAuthRequests = [];
        _moduleState.sessionValidationPromise = null;
        _moduleState.tokenRefreshInProgress = false;
        
        _eventListeners['token-expired'] = [];
        _eventListeners['session-refreshed'] = [];
        _eventListeners['cross-tab-logout'] = [];
        _eventListeners['auth-state-changed'] = [];
        _eventListeners['offline-mode'] = [];
        _eventListeners['login'] = [];
        _eventListeners['logout'] = [];
        _eventListeners['registration-complete'] = [];
        _eventListeners['ready'] = [];
        _eventListeners['initialized'] = [];
        _eventListeners['error'] = [];
        
        console.log('✅ [AUTH-SAFETY] Cleanup complete');
    }
    
    function _setupGlobalErrorHandler() {
        const originalErrorHandler = window.onerror;
        
        window.onerror = function(message, source, lineno, colno, error) {
            const isAuthError = (message && message.includes('auth')) || 
                               (source && source.includes('auth')) ||
                               (error && error.message && error.message.includes('auth'));
            
            if (isAuthError) {
                _safeLogError('GLOBAL', 'Global error in auth module', {
                    message,
                    source,
                    lineno,
                    colno,
                    error: error ? error.message : 'none'
                });
                
                if (originalErrorHandler) {
                    return originalErrorHandler(message, source, lineno, colno, error);
                }
            }
            
            return false;
        };
        
        window.addEventListener('unhandledrejection', (event) => {
            const error = event.reason;
            const errorString = error ? error.toString() : 'Unknown error';
            
            if (errorString.includes('auth') || errorString.includes('token') || errorString.includes('session')) {
                _safeLogError('UNHANDLED-REJECTION', 'Unhandled promise rejection in auth module', {
                    error: errorString
                });
                event.preventDefault();
            }
        });
    }
    
    (async function _immediateBootstrap() {
        try {
            console.log('🚀 [AUTH] Immediate bootstrap started');
            window._API_AUTH_V21_LOADED_.loadingStage = 'bootstrap_started';
            
            _setupGlobalErrorHandler();
            
            _checkDependencies();
            
            await _initializeAuthModule();
            
            await _setupPublicAPI();
            
            const token = getUserToken();
            if (token && !window.currentUser) {
                _setSafeTimeout(async () => {
                    try {
                        const result = await autoLogin();
                        if (result.success) {
                            console.log('✅ [AUTH] Auto-login on load successful');
                        }
                    } catch (error) {}
                }, 100);
            }
            
            window.addEventListener('beforeunload', () => {
                _cleanup();
            });
            
            _setSafeInterval(() => {
                const now = Date.now();
                for (const key in _moduleState.errorSuppression) {
                    if (now - _moduleState.errorSuppression[key] > 300000) {
                        delete _moduleState.errorSuppression[key];
                    }
                }
                
                for (const key in _moduleState.apiCallFailures) {
                    if (now - (_moduleState.apiCallFailures[key + '_time'] || 0) > 600000) {
                        delete _moduleState.apiCallFailures[key];
                        delete _moduleState.apiCallFailures[key + '_time'];
                    }
                }
            }, 60000);
            
            window._API_AUTH_V21_LOADED_.loadingStage = 'bootstrap_complete';
            console.log('🚀 [AUTH] Immediate bootstrap completed successfully');
            
        } catch (error) {
            _safeLogError('BOOTSTRAP', 'Immediate bootstrap failed', { error: error.message }, true);
            window._API_AUTH_V21_LOADED_.loadingStage = 'bootstrap_failed';
            _moduleState.lifecycleState = 'error';
            _readinessState.initFailed = true;
            _readinessState.initError = error;
            
            _markInitFailed(error);
            
            try {
                if (!window.api) window.api = {};
                if (!window.api.auth) window.api.auth = {};
                _setMetadataFields(window.api.auth);
                
                window.api.auth.getSafeAuthState = () => ({
                    initialized: false,
                    error: error.message,
                    bootstrapFailed: true,
                    safetyMode: true
                });
                
                window.api.auth.isSafeMode = () => true;
                
            } catch (e) {}
            
            throw error;
        }
    })();
    
})(); // End of IIFE

console.log('✅ [API-AUTH] Modular authentication service v21.1.5 loaded with login fix and force override (IIFE Protected)');