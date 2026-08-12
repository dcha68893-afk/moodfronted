// api.auth.js - Modular Authentication Service with IIFE Protection
// Version: 22.1.0 - CRITICAL FIX: Fixed getBaseUrl undefined error, centralized API integration
// Date: 2026-04-02
// 🔧 FIXED: getBaseUrl is not defined error
// 🔧 FIXED: Centralized API request integration
// 🔧 FIXED: Session persistence with kynecta_auth storage key
// 🔧 FIXED: Token restoration on reload
// 🔧 FIXED: Consistent session state management
// 🔧 CRITICAL FIX: AUTH_TOKEN variable scope issue resolved

(function() {
    // ============================================================================
    // CRITICAL FIX: Token storage variables - MUST BE IN SCOPE
    // ============================================================================
    let AUTH_TOKEN = null;
    let TOKEN_READY = false;
    
    // ============================================================================
    // SINGLETON GUARD - MUST BE FIRST EXECUTION
    // ============================================================================
    
    // CRITICAL: Ultimate singleton guard - prevents ANY possibility of multiple initialization
    const VERSION = '22.1.0';
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
    if (window._API_AUTH_V22_LOADED_ && window._API_AUTH_V22_LOADED_.initialized === true) {
        console.warn('⚠️ [API-AUTH] api.auth.js v22.0.1 already fully initialized, skipping');
        return;
    }
    
    // Mark as loading with version-specific flag
    window._API_AUTH_V22_LOADED_ = {
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
                instanceId: window._API_AUTH_V22_LOADED_.instanceId,
                stage: 'initializing',
                guardActive: true
            }
        }));
    } catch (e) {}
    

    // BUG FIX #10: _persistAuthLocally() removed — it stored expiresAt as an absolute timestamp
    // while _persistAuthData() stored expiresIn as a duration, creating an inconsistency where
    // AuthStorage.isTokenExpiringSoon() only worked for data written by _persistAuthLocally.
    // All callers should use _persistAuthData() exclusively (defined below near line 603).
    // _persistAuthData has also been updated to write expiresAt as an absolute timestamp
    // in addition to expiresIn, so AuthStorage.isTokenExpiringSoon() works for all sessions.

    // ── CLEAR PERSISTED AUTH (called on logout) ─────────────────────────────
    function _clearPersistedAuth() {
        try {
            if (window.AuthStorage && typeof window.AuthStorage.clearAuth === 'function') {
                window.AuthStorage.clearAuth();
            } else {
                localStorage.removeItem('kynecta_auth');
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
            }
            console.log('[API-AUTH] \u2705 Auth cleared from localStorage');
        } catch(e) {}
    }


        console.log(`🔐 [API-AUTH] Initializing modular authentication service v${VERSION} (CRITICAL SESSION PERSISTENCE FIX)`);
    
    // ============================================================================
    // IMMEDIATE PUBLIC API SHELL - WITH MINIMAL STUBS
    // ============================================================================
    
    // CRITICAL: Create minimal method stubs that won't interfere with real registration
    if (!window.api) window.api = {};
    if (!window.api.auth) window.api.auth = {};

    // PATCH: Inject synchronous getUser stub immediately so DEPENDENCY_QUEUE
    // check (requires getUser) passes even before full async init completes.
    if (!window.api.auth.getUser) {
        window.api.auth.getUser = function() {
            try {
                const raw = localStorage.getItem('kynecta_auth');
                if (raw) { const a = JSON.parse(raw); if (a && a.user) return a.user; }
                const legacyRaw = localStorage.getItem('currentUser') ||
                                  localStorage.getItem('auth_user') ||
                                  localStorage.getItem('user');
                return legacyRaw ? JSON.parse(legacyRaw) : null;
            } catch(e) { return null; }
        };
    }
    // PATCH: Set ready flags synchronously
    window.api.auth.ready = true;
    window.__API_AUTH_READY = true;
    
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
                    instanceId: window._API_AUTH_V22_LOADED_.instanceId,
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
        // CRITICAL: Single source of truth for auth storage
        AUTH_STORAGE_KEY: 'kynecta_auth',
        TOKEN_KEYS: ['USER_TOKEN', 'accessToken', 'nexopa_token', 'token'],
        USER_DATA_KEYS: ['USER_DATA', 'authUser', 'nexopa_auth_user', 'userData'],
        REFRESH_TOKEN_KEY: 'REFRESH_TOKEN',
        TOKEN_EXPIRY_KEY: 'TOKEN_EXPIRY',
        AUTH_STATE_KEY: 'AUTH_STATE',
        DEFAULT_TOKEN_EXPIRY: 30 * 24 * 60 * 60 * 1000, // PATCH v1.3: 30 days — matches authStorage. Was 1 hour → caused kynecta_auth to be wiped after 60 min → loop.
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
    
    // CANONICAL auth persistence function — use this exclusively (see Fix #10 note above).
    // Writes both expiresIn (duration) and expiresAt (absolute ms) so AuthStorage.isTokenExpiringSoon()
    // works regardless of which field is checked.
    function _persistAuthData(token, user, refreshToken = null, expiresIn = null) {
        try {
            if (!token) {
                console.warn('⚠️ [AUTH] Cannot persist auth data without token');
                return false;
            }
            
            const authData = {
                token: token,
                user: user || null,
                refreshToken: refreshToken,
                expiresIn: expiresIn,
                // FIX #10: also store absolute timestamp so AuthStorage.isTokenExpiringSoon() works
                expiresAt: expiresIn ? (Date.now() + expiresIn) : (Date.now() + 24 * 60 * 60 * 1000),
                timestamp: Date.now(),
                version: VERSION
            };
            
            const serialized = JSON.stringify(authData);
            const success = _safeStorageSet(CONFIG.AUTH_STORAGE_KEY, serialized);
            
            if (success) {
                console.log('✅ [AUTH] Auth data persisted to localStorage under key:', CONFIG.AUTH_STORAGE_KEY);
                
                // Also store in legacy locations for backward compatibility
                try {
                    for (const key of CONFIG.TOKEN_KEYS) {
                        _safeStorageSet(key, token);
                    }
                    if (user) {
                        _safeStorageSet('USER_DATA', JSON.stringify(user));
                    }
                    if (refreshToken) {
                        _safeStorageSet(CONFIG.REFRESH_TOKEN_KEY, refreshToken);
                    }
                    if (expiresIn) {
                        _safeStorageSet(CONFIG.TOKEN_EXPIRY_KEY, (Date.now() + expiresIn).toString());
                    }
                } catch (legacyError) {
                    console.warn('⚠️ [AUTH] Legacy storage failed:', legacyError);
                }
                
                // Dispatch storage event for cross-tab sync
                try {
                    window.dispatchEvent(new StorageEvent('storage', {
                        key: CONFIG.AUTH_STORAGE_KEY,
                        newValue: serialized,
                        oldValue: null,
                        storageArea: localStorage
                    }));
                } catch (e) {}
                
                return true;
            }
            
            console.error('❌ [AUTH] Failed to persist auth data');
            return false;
        } catch (error) {
            console.error('❌ [AUTH] Error persisting auth data:', error);
            return false;
        }
    }
    
    function _loadPersistedAuthData() {
        try {
            const stored = _safeStorageGet(CONFIG.AUTH_STORAGE_KEY);
            if (!stored) {
                console.log('🔍 [AUTH] No persisted auth data found');
                return null;
            }
            
            const authData = JSON.parse(stored);
            
            // Validate structure
            if (!authData.token || typeof authData.token !== 'string') {
                console.warn('⚠️ [AUTH] Invalid persisted auth data structure, clearing');
                _clearPersistedAuthData();
                return null;
            }
            
            // PATCH v1.3: Client-side expiry check REMOVED.
            // Previously: if (Date.now() > timestamp + expiresIn) → clear session.
            // This wiped kynecta_auth silently after 1 hour while other keys
            // (kynecta_session, nexopa_accessToken) survived, creating a corrupted
            // partial state that caused the reopen loop on every device.
            // Server enforces expiry via 401. Background validator handles that case.
            
            console.log('✅ [AUTH] Loaded persisted auth data');
            return authData;
        } catch (error) {
            console.warn('⚠️ [AUTH] Failed to parse persisted auth data:', error);
            _clearPersistedAuthData();
            return null;
        }
    }
    
    function _clearPersistedAuthData() {
        try {
            _safeStorageRemove(CONFIG.AUTH_STORAGE_KEY);
            
            // Clear legacy keys
            for (const key of CONFIG.TOKEN_KEYS) {
                _safeStorageRemove(key);
            }
            for (const key of CONFIG.USER_DATA_KEYS) {
                _safeStorageRemove(key);
            }
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            _safeStorageRemove(CONFIG.TOKEN_EXPIRY_KEY);
            
            console.log('✅ [AUTH] Cleared persisted auth data');
            return true;
        } catch (error) {
            console.error('❌ [AUTH] Error clearing persisted auth data:', error);
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
        if (window.NexopaRequest) {
            return window.NexopaRequest;
        }
        return null;
    }
    
    function _getBaseUrl() {
        // CRITICAL FIX: Centralized base URL detection
        try {
            // Priority 1: API core
            if (window.__API_CORE && window.__API_CORE.getBaseUrl) {
                let url = window.__API_CORE.getBaseUrl();
                if (url) {
                    // Remove trailing /api if present to avoid double /api
                    url = url.replace(/\/api$/, '');
                    console.log('[AUTH] Base URL from __API_CORE:', url);
                    return url;
                }
            }
            
            // Priority 2: API_CONFIG
            if (window.API_CONFIG && window.API_CONFIG.baseUrl) {
                let url = window.API_CONFIG.baseUrl;
                url = url.replace(/\/api$/, '');
                console.log('[AUTH] Base URL from API_CONFIG:', url);
                return url;
            }
            
            // Priority 3: API_BASE_URL
            if (window.API_BASE_URL) {
                let url = window.API_BASE_URL;
                url = url.replace(/\/api$/, '');
                console.log('[AUTH] Base URL from API_BASE_URL:', url);
                return url;
            }
            
            // Priority 4: Environment detection
            if (typeof window.__getApiOrigin === 'function') {
                const url = window.__getApiOrigin();
                console.log('[AUTH] Base URL from shared environment helper:', url);
                return url;
            }

            const hostname = String(window.location.hostname || '').toLowerCase();
            if (
                hostname === '' ||
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname === '0.0.0.0' ||
                hostname.endsWith('.local') ||
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
            ) {
                console.log('[AUTH] Base URL from localhost detection: http://localhost:4000');
                return 'http://localhost:4000';
            }
            
            // Priority 5: Production default
            console.log('[AUTH] Base URL from production default: https://noxopa.onrender.com');
            return 'https://noxopa.onrender.com';
        } catch (error) {
            console.error('[AUTH] Error getting base URL:', error);
            return typeof window.__getApiOrigin === 'function' ? window.__getApiOrigin() : 'http://localhost:4000';
        }
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
            instanceId: window._API_AUTH_V22_LOADED_.instanceId
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
                    value: window._API_AUTH_V22_LOADED_.instanceId,
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
            verifyMfaChallenge,
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
        
        if (!window.NexopaAuth) {
            window.NexopaAuth = {};
        }
        
        const requiredLegacyMethods = ['login', 'register', 'logout', 'getCurrentUser', 'getUser'];
        requiredLegacyMethods.forEach(methodName => {
            if (!window.NexopaAuth[methodName] && publicApi[methodName]) {
                window.NexopaAuth[methodName] = publicApi[methodName];
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
    // PRIVATE TOKEN REGISTRATION SYSTEM - ENHANCED FOR RELIABLE TOKEN PROPAGATION
    // ============================================================================
    
    function _registerTokenWithCoreSystem(token) {
        let registered = false;
        let methodUsed = '';
        
        try {
            if (!_isValid(token)) {
                console.warn('⚠️ [AUTH] Cannot register invalid token with core system');
                return false;
            }
            
            console.log('🔐 [AUTH] Registering token with core systems...');
            
            // Method 1: api.core.setAccessToken
            if (window.api && window.api.core && typeof window.api.core.setAccessToken === 'function') {
                try {
                    window.api.core.setAccessToken(token);
                    registered = true;
                    methodUsed = 'api.core.setAccessToken';
                    console.log('✅ [AUTH] Token registered via api.core.setAccessToken');
                } catch (error) {
                    console.warn('⚠️ [AUTH] Failed to register via api.core.setAccessToken:', error);
                }
            }
            
            // Method 2: api.core.setToken
            if (window.api && window.api.core && typeof window.api.core.setToken === 'function') {
                try {
                    window.api.core.setToken(token);
                    registered = true;
                    methodUsed = 'api.core.setToken';
                    console.log('✅ [AUTH] Token registered via api.core.setToken');
                } catch (error) {
                    console.warn('⚠️ [AUTH] Failed to register via api.core.setToken:', error);
                }
            }
            
            // Method 3: api.core.tokenManager.initialize
            if (window.api && window.api.core && window.api.core.tokenManager) {
                if (typeof window.api.core.tokenManager.initialize === 'function') {
                    try {
                        window.api.core.tokenManager.initialize(token);
                        registered = true;
                        methodUsed = 'api.core.tokenManager.initialize';
                        console.log('✅ [AUTH] Token registered via api.core.tokenManager.initialize');
                    } catch (error) {
                        console.warn('⚠️ [AUTH] Failed to register via api.core.tokenManager.initialize:', error);
                    }
                }
                
                // Method 4: api.core.tokenManager.setToken
                if (typeof window.api.core.tokenManager.setToken === 'function') {
                    try {
                        window.api.core.tokenManager.setToken(token);
                        registered = true;
                        methodUsed = 'api.core.tokenManager.setToken';
                        console.log('✅ [AUTH] Token registered via api.core.tokenManager.setToken');
                    } catch (error) {
                        console.warn('⚠️ [AUTH] Failed to register via api.core.tokenManager.setToken:', error);
                    }
                }
            }
            
            // Method 5: __API_CORE.setUserToken
            if (window.__API_CORE && typeof window.__API_CORE.setUserToken === 'function') {
                try {
                    window.__API_CORE.setUserToken(token);
                    registered = true;
                    methodUsed = '__API_CORE.setUserToken';
                    console.log('✅ [AUTH] Token registered via __API_CORE.setUserToken');
                } catch (error) {
                    console.warn('⚠️ [AUTH] Failed to register via __API_CORE.setUserToken:', error);
                }
            }
            
            // Method 6: AppCore.tokenManager.setToken
            if (window.AppCore && window.AppCore.tokenManager && typeof window.AppCore.tokenManager.setToken === 'function') {
                try {
                    window.AppCore.tokenManager.setToken(token);
                    registered = true;
                    methodUsed = 'AppCore.tokenManager.setToken';
                    console.log('✅ [AUTH] Token registered via AppCore.tokenManager.setToken');
                } catch (error) {
                    console.warn('⚠️ [AUTH] Failed to register via AppCore.tokenManager.setToken:', error);
                }
            }
            
            // Method 7: Direct window property for legacy systems
            try {
                window.__userToken = token;
                window.__accessToken = token;
                window.token = token;
                console.log('✅ [AUTH] Token set on window properties');
            } catch (error) {
                console.warn('⚠️ [AUTH] Failed to set token on window properties:', error);
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
                    console.log(`✅ [AUTH] Token registered successfully via ${methodUsed}`);
                } catch (error) {
                    console.warn('⚠️ [AUTH] Failed to dispatch token events:', error);
                }
            } else {
                console.warn('⚠️ [AUTH] Token could not be registered with any core system');
                
                // Even if no core system found, still dispatch events
                try {
                    window.dispatchEvent(new CustomEvent("api-auth-token-ready", {
                        detail: {
                            token: token,
                            registered: false,
                            warning: 'No core system found',
                            timestamp: Date.now(),
                            source: 'api.auth.js',
                            version: VERSION
                        }
                    }));
                } catch (error) {}
            }
        } catch (error) {
            console.error('❌ [AUTH] Error registering token with core system:', error);
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
            console.log('🔧 [AUTH] Normalized from two string arguments:', { identifier: normalized.identifier, password: '***' });
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
            // P3 FIX (Forensic Audit): "Privacy policy acceptance on registration"
            acceptPrivacyPolicy: false,
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
            
            // P3 FIX (Forensic Audit): pass through acceptPrivacyPolicy if provided
            if (input.acceptPrivacyPolicy === true || input.acceptPrivacyPolicy === 'true') {
                normalized.acceptPrivacyPolicy = true;
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
                ...(normalized.avatar && { avatar: normalized.avatar }),
                // P3 FIX (Forensic Audit): pass through privacy policy acceptance
                ...(normalized.acceptPrivacyPolicy && { acceptPrivacyPolicy: true })
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
    // PRIVATE TOKEN MANAGEMENT - ENHANCED TOKEN EXTRACTION
    // ============================================================================
    
    /**
     * Extract token from various response formats
     */
    function _extractTokenFromResponse(response) {
        console.log('🔍 [AUTH] Extracting token from response:', response);
        
        if (!response) {
            console.warn('⚠️ [AUTH] Cannot extract token from empty response');
            return null;
        }
        
        // Direct token field
        if (response.token && typeof response.token === 'string') {
            console.log('✅ [AUTH] Token found in response.token');
            return response.token;
        }
        
        // accessToken field
        if (response.accessToken && typeof response.accessToken === 'string') {
            console.log('✅ [AUTH] Token found in response.accessToken');
            return response.accessToken;
        }
        
        // jwt field
        if (response.jwt && typeof response.jwt === 'string') {
            console.log('✅ [AUTH] Token found in response.jwt');
            return response.jwt;
        }
        
        // data.token pattern
        if (response.data && response.data.token && typeof response.data.token === 'string') {
            console.log('✅ [AUTH] Token found in response.data.token');
            return response.data.token;
        }
        
        // data.accessToken pattern
        if (response.data && response.data.accessToken && typeof response.data.accessToken === 'string') {
            console.log('✅ [AUTH] Token found in response.data.accessToken');
            return response.data.accessToken;
        }
        
        // data.jwt pattern
        if (response.data && response.data.jwt && typeof response.data.jwt === 'string') {
            console.log('✅ [AUTH] Token found in response.data.jwt');
            return response.data.jwt;
        }
        
        // result.token pattern
        if (response.result && response.result.token && typeof response.result.token === 'string') {
            console.log('✅ [AUTH] Token found in response.result.token');
            return response.result.token;
        }
        
        // Any string field that looks like a token
        for (const key in response) {
            if (typeof response[key] === 'string' && 
                (response[key].length > 20 || response[key].includes('.')) &&
                (key.includes('token') || key.includes('jwt') || key.includes('access'))) {
                console.log(`✅ [AUTH] Token found in response.${key}`);
                return response[key];
            }
        }
        
        console.warn('⚠️ [AUTH] No token found in response');
        return null;
    }
    
    // CRITICAL FIX: FIXED getUserToken with proper AUTH_TOKEN access
    function getUserToken() {
        try {
            // Priority 1: Memory token (using the closure variable)
            if (AUTH_TOKEN && typeof AUTH_TOKEN === 'string' && AUTH_TOKEN.length > 20) {
                return AUTH_TOKEN;
            }
            
            // Priority 2: Unified auth storage
            const unifiedAuth = _loadPersistedAuthData();
            if (unifiedAuth && unifiedAuth.token && unifiedAuth.token.length > 20) {
                AUTH_TOKEN = unifiedAuth.token;
                TOKEN_READY = true;
                return AUTH_TOKEN;
            }
            
            // Priority 3: Direct localStorage keys (in order)
            const keys = ['token', 'accessToken', 'nexopa_token', 'USER_TOKEN', 'jwt'];
            for (const key of keys) {
                const token = localStorage.getItem(key);
                if (token && token.length > 20 && token !== 'undefined' && token !== 'null') {
                    AUTH_TOKEN = token;
                    TOKEN_READY = true;
                    return token;
                }
            }
            
            // Priority 4: Check window object
            if (window.token && window.token.length > 20) {
                AUTH_TOKEN = window.token;
                TOKEN_READY = true;
                return window.token;
            }
            
            return null;
        } catch (error) {
            console.error('❌ Error getting token:', error);
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
                console.warn(`⚠️ [AUTH] Token contains suspicious pattern: ${pattern}`);
                return false;
            }
        }
        
        return true;
    }
    
    function setUserToken(token, expiryMs = CONFIG.DEFAULT_TOKEN_EXPIRY) {
        try {
            if (!_validateTokenSafety(token)) {
                console.error('❌ [AUTH] Token failed safety validation');
                return false;
            }
            
            console.log('🔐 [AUTH] Setting user token...');
            
            // Update memory token (CRITICAL FIX)
            AUTH_TOKEN = token;
            TOKEN_READY = true;
            
            // Register with core systems FIRST
            _registerTokenWithCoreSystem(token);
            
            // Store in multiple locations for compatibility
            let storedSuccessfully = false;
            
            // Store in core system if available
            if (window.__API_CORE && typeof window.__API_CORE.setUserToken === 'function') {
                try {
                    window.__API_CORE.setUserToken(token);
                    console.log('✅ [AUTH] Token set in __API_CORE');
                } catch (error) {
                    console.warn('⚠️ [AUTH] Failed to set token in __API_CORE:', error);
                }
            }
            
            // Store in localStorage with all possible keys
            for (const key of CONFIG.TOKEN_KEYS) {
                if (_safeStorageSet(key, token)) {
                    storedSuccessfully = true;
                    console.log(`✅ [AUTH] Token stored in localStorage with key: ${key}`);
                }
            }
            
            if (!storedSuccessfully) {
                console.error('❌ [AUTH] Failed to store token in localStorage');
                return false;
            }
            
            // Set expiry
            if (expiryMs && !isNaN(expiryMs)) {
                const expiryTime = Date.now() + expiryMs;
                _safeStorageSet(CONFIG.TOKEN_EXPIRY_KEY, expiryTime.toString());
                console.log(`✅ [AUTH] Token expiry set to: ${new Date(expiryTime).toISOString()}`);
            }
            
            // Dispatch events to notify other modules
            try {
                window.dispatchEvent(new CustomEvent('token-stored', {
                    detail: {
                        timestamp: Date.now(),
                        source: 'api.auth.js',
                        tokenPresent: true
                    }
                }));
                
                window.dispatchEvent(new CustomEvent('auth:token:updated', {
                    detail: {
                        token: token,
                        timestamp: Date.now()
                    }
                }));
            } catch (error) {
                console.warn('⚠️ [AUTH] Failed to dispatch token events:', error);
            }
            
            console.log('✅ [AUTH] Token successfully stored and registered');
            return true;
        } catch (error) {
            console.error('❌ [AUTH] Error setting user token:', error);
            return false;
        }
    }
    
    function clearUserToken() {
        try {
            console.log('🔐 [AUTH] Clearing user token...');
            
            // Clear memory token (CRITICAL FIX)
            AUTH_TOKEN = null;
            TOKEN_READY = false;
            
            // Clear from core systems
            if (window.__API_CORE && typeof window.__API_CORE.clearAllAuthData === 'function') {
                try {
                    window.__API_CORE.clearAllAuthData();
                    console.log('✅ [AUTH] Cleared token from __API_CORE');
                } catch (error) {
                    console.warn('⚠️ [AUTH] Failed to clear token from __API_CORE:', error);
                }
            }
            
            // Clear unified storage
            _clearPersistedAuthData();
            
            // Clear from localStorage legacy keys
            for (const key of CONFIG.TOKEN_KEYS) {
                _safeStorageRemove(key);
            }
            
            _safeStorageRemove(CONFIG.TOKEN_EXPIRY_KEY);
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            
            // Clear window properties
            try {
                window.__userToken = null;
                window.__accessToken = null;
                window.token = null;
            } catch (error) {}
            
            console.log('✅ [AUTH] Token cleared successfully');
            return true;
        } catch (error) {
            console.error('❌ [AUTH] Error clearing user token:', error);
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

            // PATCH v1.5: Global 401 interceptor — REFRESH-FIRST strategy.
            // On 401 we FIRST attempt a silent background token refresh.
            // Only if the refresh itself fails (no refresh token, server rejected it, etc.)
            // do we clear the session and redirect to login.
            // This means token expiry is NEVER visible to the user as a redirect —
            // the app seamlessly continues after the silent refresh.
            // The login page is only shown for: (1) explicit logout, (2) refresh token
            // also expired/revoked (genuine end of session).
            if (result && result.status === 401 && !endpoint.includes('/login') && !endpoint.includes('/register') && !endpoint.includes('/refresh')) {
                console.warn('[API-AUTH] 401 received — attempting silent token refresh before any logout');

                // Avoid re-entrant refreshes from within a refresh call
                if (!_moduleState.tokenRefreshInProgress) {
                    try {
                        const refreshed = await refreshToken();
                        if (refreshed) {
                            // Refresh succeeded — the caller should retry their request.
                            // Return a special sentinel so callers know to retry.
                            console.log('[API-AUTH] ✅ Silent refresh succeeded after 401 — request can be retried');
                            return {
                                success: false,
                                status: 401,
                                code: 'TOKEN_REFRESHED_RETRY',
                                _tokenRefreshed: true,
                                message: 'Token was silently refreshed — please retry the request'
                            };
                        }
                    } catch (refreshErr) {
                        console.warn('[API-AUTH] Silent refresh attempt threw:', refreshErr.message);
                    }
                }

                // Refresh failed or was already in progress and didn't recover —
                // now it is safe to treat this as a genuine session end.
                console.warn('[API-AUTH] Refresh failed after 401 — clearing session. Login required only now.');
                try {
                    if (window.AuthStorage && typeof window.AuthStorage.clearAuth === 'function') {
                        window.AuthStorage.clearAuth();
                    } else {
                        localStorage.removeItem('kynecta_auth');
                    }
                    // Clear ALL parallel session keys so no stale state survives
                    ['kynecta_session','accessToken','nexopa_token','USER_TOKEN','token',
                     'nexopa_accessToken','nexopa_user','nexopa_tokenExpiry',
                     'auth_token','auth_user','currentUser','user','REFRESH_TOKEN','TOKEN_EXPIRY']
                        .forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });
                    window.__SESSION__ = null;
                    window.__IS_LOGGED_IN__ = false;
                    window.__SESSION_READY__ = false;
                    window.currentUser = null;
                } catch(e) {}

                // Dispatch a semantic event so UI layers can react gracefully
                try {
                    window.dispatchEvent(new CustomEvent('auth:session:ended', {
                        detail: { reason: 'refresh_failed', timestamp: Date.now() }
                    }));
                } catch(_) {}

                // Only redirect to login for an explicit session end, never for a
                // token expiry that could have been (but wasn't) refreshed.
                // The UI should listen to auth:session:ended and handle the transition.
                // We do NOT call window.location.href here — that is the UI layer's job.
            }

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
        // CRITICAL FIX: Check if offline first - don't attempt refresh when offline
        if (!_isOnline()) {
            console.log('[API-AUTH] 📴 Device offline - skipping token refresh');
            return { success: false, offline: true, message: 'Device offline' };
        }
        
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
            const unifiedAuth = _loadPersistedAuthData();
            const refreshToken = unifiedAuth?.refreshToken || _safeStorageGet(CONFIG.REFRESH_TOKEN_KEY);
            
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }
            
            const apiRequest = _getApiRequest();
            if (!apiRequest) {
                throw new Error('API request module not available');
            }
            
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.REFRESH_TOKEN);
            
            const response = await _safeApiCall(
                apiRequest.post.bind(apiRequest),
                endpoint,
                { refreshToken },
                { skipAuth: true }
            );
            
            if (response.success && response.data) {
                const newToken = response.data.accessToken || response.data.token;
                const expiresIn = response.data.expiresIn || CONFIG.DEFAULT_TOKEN_EXPIRY;
                const newRefreshToken = response.data.refreshToken || refreshToken;
                
                // PATCH v1.4: Atomically clear every old token location BEFORE writing
                // the new token so no stale copy can survive alongside the fresh one.
                // Previously the new token was simply written on top, leaving legacy keys
                // (authToken, nexopa_token, etc.) holding the expired value.
                // api_core.js and iframes reading those keys would then send the old,
                // rejected token and receive 401s even though the refresh succeeded.
                try {
                    if (window.AuthStorage && typeof window.AuthStorage.clearAuth === 'function') {
                        window.AuthStorage.clearAuth();
                    } else {
                        (CONFIG.TOKEN_KEYS || []).forEach(k => { try { localStorage.removeItem(k); } catch(_) {} });
                        try { localStorage.removeItem(CONFIG.REFRESH_TOKEN_KEY); } catch(_) {}
                        try { localStorage.removeItem(CONFIG.TOKEN_EXPIRY_KEY); } catch(_) {}
                        try { localStorage.removeItem(CONFIG.AUTH_STORAGE_KEY); } catch(_) {}
                    }
                    // Also clear window globals immediately
                    window.__userToken   = null;
                    window.__accessToken = null;
                    window.token         = null;
                } catch (_) {}

                // CRITICAL FIX: Update all storage locations consistently
                _persistAuthData(newToken, unifiedAuth?.user || null, newRefreshToken, expiresIn);
                
                // Update global token references
                AUTH_TOKEN = newToken;
                TOKEN_READY = true;

                // Propagate to all core systems so every subsequent request uses the
                // fresh token without waiting for the next getUserToken() call.
                _registerTokenWithCoreSystem(newToken);
                
                // Reset refresh state
                _moduleState.tokenRefreshInProgress = false;
                _moduleState.refreshAttempts = 0;
                _moduleState.lastTokenRefresh = Date.now();
                
                _emitEvent('session-refreshed', {
                    newToken: newToken,
                    expiresIn: expiresIn
                });

                // Notify all parts of the app about the new token
                try {
                    window.dispatchEvent(new CustomEvent('auth:token:refreshed', {
                        detail: { token: newToken, expiresIn, timestamp: Date.now() }
                    }));
                } catch (_) {}
                
                _moduleState.pendingAuthRequests.forEach(({ resolve }) => {
                    try { resolve(true); } catch (error) {}
                });
                _moduleState.pendingAuthRequests = [];
                
                return true;
            } else {
                throw new Error(response.data?.message || 'Token refresh failed');
            }
        } catch (error) {
            // PATCH v1.5: On refresh failure, clear tokens silently WITHOUT firing
            // the full logout event chain (which could trigger UI redirect to login).
            // The caller decides what to do — only an explicit user logout should
            // redirect to the login page.
            clearUserToken();
            _clearPersistedAuthData();
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            
            // Emit token-expired so the proactive scheduler knows, but NOT logout
            _emitEvent('token-expired', {
                reason: error.message,
                refreshAttempts: _moduleState.refreshAttempts
            });
            
            // Dispatch a semantic event so UI can gracefully show a re-auth prompt
            // without a hard redirect.
            try {
                window.dispatchEvent(new CustomEvent('auth:session:ended', {
                    detail: { reason: 'refresh_failed', error: error.message, timestamp: Date.now() }
                }));
            } catch(_) {}
            
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
                } else if (response.status === 401 || response.code === 'TOKEN_REFRESHED_RETRY') {
                    // PATCH v1.5: If _safeApiCall already refreshed (TOKEN_REFRESHED_RETRY),
                    // report valid so the caller doesn't try to refresh again.
                    if (response._tokenRefreshed) {
                        return true;
                    }
                    // Otherwise try an explicit refresh now.
                    const hasRefreshToken = !!_loadPersistedAuthData()?.refreshToken || !!_safeStorageGet(CONFIG.REFRESH_TOKEN_KEY);
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
        
        const isTokenChange = event.key === CONFIG.AUTH_STORAGE_KEY ||
                             CONFIG.TOKEN_KEYS.includes(event.key) ||
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
                
                // Handle unified auth storage changes
                if (event.key === CONFIG.AUTH_STORAGE_KEY) {
                    if (!event.newValue) {
                        _emitEvent('cross-tab-logout', {
                            source: 'storage-event',
                            key: event.key
                        });
                        _performLogout(false);
                    } else {
                        try {
                            const authData = JSON.parse(event.newValue);
                            if (authData.token) {
                                console.log('🔄 [AUTH] Cross-tab auth data detected');
                                setUserToken(authData.token);
                                if (authData.user) {
                                    window.currentUser = authData.user;
                                }
                                window.dispatchEvent(new CustomEvent('auth-tab-sync', {
                                    detail: {
                                        action: 'sync',
                                        timestamp: Date.now(),
                                        key: event.key
                                    }
                                }));
                            }
                        } catch (e) {}
                    }
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
                const unifiedAuth = _loadPersistedAuthData();
                const authState = {
                    hasToken: !!unifiedAuth?.token || !!getUserToken(),
                    timestamp: Date.now(),
                    tabId: window._API_AUTH_V22_LOADED_.instanceId
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
                const unifiedAuth = _loadPersistedAuthData();
                const token = unifiedAuth?.token || getUserToken();
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
            _clearPersistedAuthData();
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            
            CONFIG.USER_DATA_KEYS.forEach(key => {
                _safeStorageRemove(key);
            });
            
            window.currentUser = null;
            
            _safeStorageRemove('authUser');
            _safeStorageRemove('nexopa_auth_user');
            _safeStorageRemove('userData');
            // FIX-E2E-WIRING: clear the password handoff (see index.html login
            // success handler) on logout — it should never outlive the
            // session that needed it.
            try { sessionStorage.removeItem('kyn_e2e_pw_session'); } catch (_) {}
            try { window.KynectaE2E?.clearKeys?.(); } catch (_) {}
            
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
    // CRITICAL FIX: PUBLIC API FUNCTIONS - ENHANCED TOKEN EXTRACTION & BASE URL FIX
    // ============================================================================
    
    /**
     * PUBLIC: Login with credentials - ENHANCED TOKEN EXTRACTION & FIXED BASE URL
     */
    // FIX (2FA audit): shared by login() and verifyMfaChallenge() so both
    // paths persist the session (storage, events, legacy keys) identically.
    // Previously this logic lived only inside login(), which meant the 2FA
    // challenge path (added below) had nothing to reuse.
    function _completeSession(token, data, identifierUsed, payloadType) {
        const expiresIn = data.expiresIn || data.data?.expiresIn || CONFIG.DEFAULT_TOKEN_EXPIRY;

        let user = data.user || data.data?.user || data.data;
        if (!user) {
            console.warn('⚠️ [AUTH] No user object in response, deriving minimal user from identifier');
            user = {
                email: identifierUsed && identifierUsed.includes('@') ? identifierUsed : null,
                username: identifierUsed && identifierUsed.includes('@') ? identifierUsed.split('@')[0] : identifierUsed,
                id: 'user_' + Date.now()
            };
        }

        const refreshToken = data.refreshToken || data.data?.refreshToken || null;

        // ===== Persist session (unified storage helper) =====
        const persisted = _persistAuthData(token, user, refreshToken, expiresIn);
        if (!persisted) {
            console.error('❌ [AUTH] Failed to persist auth data');
            return {
                success: false,
                error: 'Failed to store authentication data',
                code: 'STORAGE_ERROR',
                status: 500,
                message: 'Authentication succeeded but data could not be stored'
            };
        }

        // Compatibility mirror into AuthStorage, if present
        if (window.AuthStorage && window.AuthStorage.saveSession) {
            try {
                window.AuthStorage.saveSession({
                    token,
                    refreshToken,
                    user,
                    expiresAt: Date.now() + (expiresIn || CONFIG.DEFAULT_TOKEN_EXPIRY)
                });
            } catch (storageError) {
                console.warn('⚠️ [AUTH] Failed to save to authStorage:', storageError.message);
            }
        }

        // Prevent background validation flicker right after login
        window.__LAST_LOGIN_TIME__ = Date.now();

        // Legacy/compat keys consumed by chat.html, sockets, sync manager, etc.
        localStorage.setItem('auth_token', token);
        localStorage.setItem('authToken', token);
        localStorage.setItem('accessToken', token);
        localStorage.setItem('nexopa_token', token);
        localStorage.setItem('auth_user', JSON.stringify(user));

        const tokenStored = setUserToken(token, expiresIn);
        if (!tokenStored) {
            console.error('❌ [AUTH] Failed to store token');
            return {
                success: false,
                error: 'Failed to store authentication token',
                code: 'TOKEN_STORAGE_ERROR',
                status: 500,
                message: 'Authentication succeeded but token could not be stored'
            };
        }

        if (refreshToken) {
            _safeStorageSet(CONFIG.REFRESH_TOKEN_KEY, refreshToken);
        }

        _safeStorageSet('USER_DATA', JSON.stringify(user));
        window.currentUser = user;

        _initCrossTabSync();
        _initIframeSync();

        _emitEvent('login', {
            user,
            token,
            timestamp: new Date().toISOString(),
            payloadType,
            backendPayload: { identifier: identifierUsed }
        });

        try {
            window.dispatchEvent(new CustomEvent('user-logged-in', {
                detail: {
                    user, token,
                    timestamp: new Date().toISOString(),
                    source: 'api.auth.js',
                    version: VERSION,
                    payloadType
                }
            }));
            window.dispatchEvent(new CustomEvent('auth:token:ready', { detail: { token, timestamp: Date.now() } }));
            window.dispatchEvent(new CustomEvent('session:ready', { detail: { token, user, timestamp: Date.now() } }));
        } catch (dispatchError) {
            console.warn('⚠️ [AUTH] Failed to dispatch login events:', dispatchError);
        }

        console.log('✅ [AUTH] Login successful with token storage');

        return {
            success: true,
            user,
            token,
            expiresIn,
            message: 'Login successful',
            payloadType,
            identifierUsed
        };
    }

    // FIX (2FA audit): exchanges a tempToken (returned by login() when the
    // account has 2FA enabled) plus a TOTP/backup code for real tokens, by
    // calling POST /api/auth/2fa/challenge. On success this persists the
    // session exactly like a normal login (via _completeSession) so every
    // downstream consumer (chat.html, sockets, E2E key derivation, etc.)
    // behaves identically whether or not 2FA was involved.
    async function verifyMfaChallenge(tempToken, code) {
        console.log('🔐 [AUTH] Verifying 2FA challenge');
        const baseUrl = _getBaseUrl();

        if (!tempToken || !code) {
            return {
                success: false,
                error: 'A verification code is required',
                code: 'MISSING_MFA_CODE',
                message: 'Please enter your 6-digit authenticator code or a backup code'
            };
        }

        try {
            const response = await fetch(`${baseUrl}/api/auth/2fa/challenge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempToken, token: String(code).trim() })
            });

            const rawText = await response.text();
            let data;
            try {
                data = rawText ? JSON.parse(rawText) : {};
            } catch (parseError) {
                data = { message: rawText || `HTTP ${response.status}` };
            }

            if (!response.ok) {
                let errCode = 'MFA_CHALLENGE_FAILED';
                if (response.status === 401) errCode = 'INVALID_MFA_CODE';
                else if (response.status >= 500) errCode = 'SERVER_ERROR';
                return {
                    success: false,
                    error: data.message || `Verification failed (HTTP ${response.status})`,
                    code: errCode,
                    status: response.status,
                    message: data.message || 'Invalid or expired code'
                };
            }

            const token = _extractTokenFromResponse(data);
            if (!token) {
                return {
                    success: false,
                    error: 'Verification succeeded but no token was provided',
                    code: 'NO_TOKEN',
                    status: response.status,
                    message: 'Verification succeeded but no token was provided',
                    data
                };
            }

            return _completeSession(token, data, data.user?.email || data.user?.username || null, 'mfa-challenge');
        } catch (error) {
            console.error('🔐 [AUTH] MFA challenge error:', error);
            if (error.message === 'Failed to fetch' || (error.message && error.message.includes('NetworkError'))) {
                return {
                    success: false,
                    error: 'Cannot connect to authentication server',
                    code: 'CORS_OR_NETWORK_ERROR',
                    message: 'Unable to reach the server. Please check your connection and try again.',
                    status: 0,
                    isCorsError: true
                };
            }
            return {
                success: false,
                error: error.message || 'Verification failed',
                code: 'MFA_CHALLENGE_ERROR',
                message: error.message || 'Verification failed'
            };
        }
    }

   async function login(...args) {
    console.log('🔐 [AUTH] Login attempt');

    const operation = 'login';
    const baseUrl = _getBaseUrl();
    console.log(`🔐 [AUTH] Using backend URL: ${baseUrl}`);

    try {
        // Normalize + validate payload (accepts (identifier, password), {identifier, password}, etc.)
        const normalized = _normalizeLoginPayload(args);
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
        console.log('🔧 [AUTH] Login identifier:', payload.identifier);

        const fullUrl = `${baseUrl}/api/auth/login`;
        console.log('🔐 [AUTH] POST', fullUrl);

        // Single fetch with timeout (Render free-tier cold starts can take 50-60s)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.warn('🔐 [AUTH] Login request timeout, aborting...');
            controller.abort();
        }, 90000);

        let response;
        let rawText;
        try {
            response = await fetch(fullUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            // CRITICAL: read the body ONCE as text, regardless of content-type.
            // Previously this called response.json() first and, on parse failure,
            // called response.text() on the SAME response — which throws
            // "Failed to execute 'text' on 'Response': body stream already read"
            // and masked the real error (e.g. a non-JSON 404 page).
            rawText = await response.text();
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                throw new Error('Login request timed out after 90 seconds');
            }
            throw fetchError;
        } finally {
            clearTimeout(timeoutId);
        }

        console.log('🔐 [AUTH] Response status:', response.status);

        // Parse as JSON if possible; otherwise keep the raw text for diagnostics
        let data;
        try {
            data = rawText ? JSON.parse(rawText) : {};
        } catch (parseError) {
            console.error('🔐 [AUTH] Non-JSON response body:', String(rawText).slice(0, 300));
            data = { message: rawText || `HTTP ${response.status}` };
        }

        if (!response.ok) {
            let code = 'LOGIN_FAILED';
            if (response.status === 401) code = 'INVALID_CREDENTIALS';
            else if (response.status === 404) code = 'ENDPOINT_NOT_FOUND';
            else if (response.status >= 500) code = 'SERVER_ERROR';

            return {
                success: false,
                error: data.message || `Login failed (HTTP ${response.status})`,
                code,
                status: response.status,
                message: data.message || 'Invalid email/username or password',
                payload: { identifier: payload.identifier }
            };
        }

        // ===== 2FA / MFA challenge =====
        // FIX (2FA audit): when the account has 2FA enabled, the backend does
        // NOT issue a real token — it returns { requiresMfa: true, tempToken }
        // and expects a follow-up call to verifyMfaChallenge() (which POSTs
        // to /api/auth/2fa/challenge) before real tokens are issued. Without
        // this check, that response fell through to the token-extraction
        // logic below, found no token, and returned a confusing "no token
        // received from server" error — making 2FA look completely broken.
        if (data.requiresMfa === true && data.tempToken) {
            console.log('🔐 [AUTH] 2FA challenge required');
            return {
                success: false,
                requiresMfa: true,
                tempToken: data.tempToken,
                message: 'Two-factor authentication code required',
                payload: { identifier: payload.identifier }
            };
        }

        // ===== Token extraction =====
        const token = _extractTokenFromResponse(data);
        if (!token) {
            console.error('❌ [AUTH] No token found in response:', data);
            return {
                success: false,
                error: 'Login failed - no token received from server',
                code: 'NO_TOKEN',
                status: response.status,
                message: 'Authentication succeeded but no token was provided',
                payload: { identifier: payload.identifier },
                data
            };
        }

        return _completeSession(token, data, normalized.identifier, args.length > 1 ? 'legacy-args' : 'object');

    } catch (error) {
        _safeLogError('LOGIN', 'Login error', {
            error: error.message || String(error),
            argsCount: args.length,
            baseUrl
        }, false, operation);

        if (error.message === 'Failed to fetch' || (error.message && error.message.includes('NetworkError'))) {
            return {
                success: false,
                error: 'Cannot connect to authentication server',
                code: 'CORS_OR_NETWORK_ERROR',
                message: 'Unable to reach the server. Please check your connection and try again.',
                status: 0,
                isCorsError: true
            };
        }

        return {
            success: false,
            error: error.error || error.message || 'Login failed',
            code: error.code || 'NETWORK_ERROR',
            message: error.message || error.error || 'Unable to connect to authentication service',
            status: error.status || 0,
            args
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
            
            // Get base URL
            const baseUrl = _getBaseUrl();
            const fullUrl = `${baseUrl}/api/auth/register`;
            
            console.log('🔐 [AUTH] Sending registration request to:', fullUrl);
            console.log('🔐 [AUTH] Registration payload:', { email: payload.email, username: payload.username });
            
            // Use centralized API if available, otherwise direct fetch
            let response;
            
            if (window.api && window.api.request && window.api.request.post) {
                try {
                    const apiResponse = await window.api.request.post('/auth/register', payload);
                    response = {
                        ok: apiResponse.success,
                        status: apiResponse.status || (apiResponse.success ? 200 : 400),
                        json: async () => apiResponse.data || {}
                    };
                } catch (error) {
                    console.error('❌ [AUTH] Centralized API error:', error);
                    // Fall through to direct fetch
                    response = null;
                }
            }
            
            if (!response) {
                const fetchResponse = await fetch(fullUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: payload.email,
                        username: payload.username,
                        password: payload.password
                    })
                });
                response = fetchResponse;
            }
            
            console.log('🔐 [AUTH] Registration response status:', response.status);
            
            let data;
            try {
                data = await response.json();
            } catch (e) {
                data = { message: await response.text() };
            }
            
            console.log('🔐 [AUTH] Registration response data:', data);
            
            if (!response.ok) {
                return {
                    success: false,
                    error: data.message || 'Registration failed',
                    code: data.code || 'REGISTRATION_FAILED',
                    status: response.status,
                    message: data.message || 'Registration failed'
                };
            }
            
            // Extract token correctly
            const token = data.token || data.accessToken || _extractTokenFromResponse(data);
            const user = data.user || data.data?.user || data.data;
            
            console.log('✅ [AUTH] Registration successful, token:', token ? 'present' : 'missing');
            console.log('✅ [AUTH] User data:', user);
            
            if (token) {
                // Store token in multiple locations
                try {
                    // FIX-DUPLICATE-TOKEN-STORAGE (consolidation): this used to write
                    // its own hand-rolled 'kynecta_auth' object here
                    // (`{ token, user, timestamp }`) directly via localStorage,
                    // completely bypassing js/authStorage.js's saveAuth() — the
                    // single module every other read path (AuthStorage.getAuth/
                    // getSession/getToken) treats as authoritative. Two concrete
                    // problems that caused: (1) the shape didn't match what
                    // AuthStorage writes (no refreshToken/expiresAt/issuedAt/
                    // _version), so any code relying on those fields after a
                    // registration-flow login silently got undefined; (2) the
                    // account-switch detection in saveAuth() — which wipes the
                    // previous account's local message history/IndexedDB data
                    // when a different user id logs in on the same device — never
                    // ran for this path, since it lives inside saveAuth() and this
                    // wrote straight to localStorage instead of calling it. Route
                    // through AuthStorage.saveAuth() (falling back to the old raw
                    // write only if that module hasn't loaded) so registration
                    // goes through the exact same single source of truth as every
                    // other login path.
                    if (window.AuthStorage && typeof window.AuthStorage.saveAuth === 'function') {
                        window.AuthStorage.saveAuth({ token, user, expiresAt: Date.now() + (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_TOKEN_EXPIRY ? CONFIG.DEFAULT_TOKEN_EXPIRY : 24 * 60 * 60 * 1000) });
                    } else {
                        localStorage.setItem('kynecta_auth', JSON.stringify({ token, user, timestamp: Date.now() }));
                    }
                    localStorage.setItem('token', token);
                    localStorage.setItem('accessToken', token);
                    localStorage.setItem('USER_TOKEN', token);
                    localStorage.setItem('nexopa_token', token);
                    window.token = token;
                    window.accessToken = token;
                    if (user) window.currentUser = user;
                    console.log('✅ [AUTH] Token stored in all locations');
                } catch (e) {
                    console.warn('⚠️ [AUTH] Failed to store token:', e);
                }
            }
            
            // Return in format that app.ui.auth.js expects
            return {
                success: true,
                token: token,
                user: user,
                message: data.message || 'Registration successful',
                data: data
            };
            
        } catch (error) {
            console.error('❌ [AUTH] Registration error:', error);
            return {
                success: false,
                error: error.message || 'Registration failed',
                code: 'REGISTRATION_ERROR',
                message: error.message || 'Registration failed'
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
        console.log('ð [AUTH] Auto-login attempt');
        
        const autoLoginTimeout = setTimeout(() => {
            console.warn('â [AUTH] Auto-login taking too long, continuing anyway');
        }, 15000); // 15 second warning
        
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
            
            const unifiedAuth = _loadPersistedAuthData();
            if (!unifiedAuth || !unifiedAuth.token) {
                console.log(' [AUTH] No stored auth data found for auto-login');
                return { success: false, error: 'No stored authentication data' };
            }
            
            // PATCH v1.5: If the token appears locally expired, attempt a SILENT
            // background refresh BEFORE giving up.  Only clear the session if the
            // refresh itself fails (no refresh token, server rejected it, etc.).
            // This means a user who closes and reopens the app after their JWT
            // expired will be seamlessly kept logged in via the refresh token —
            // they will NEVER be redirected to the login page due to expiry alone.
            // AUTH-X FIX: Prefer the absolute expiresAt timestamp written by _persistAuthData()
            // over the recomputed timestamp+expiresIn approach. The old code computed
            // (timestamp + expiresIn) which breaks when expiresIn is a duration in seconds
            // (e.g. 86400) vs milliseconds (86400000) — an easy mismatch. expiresAt is
            // always an absolute epoch-ms value so no arithmetic is needed.
            const expiryMs = unifiedAuth.expiresAt
                || (unifiedAuth.expiresIn && unifiedAuth.timestamp
                    ? unifiedAuth.timestamp + (unifiedAuth.expiresIn > 100000
                        ? unifiedAuth.expiresIn          // ms duration
                        : unifiedAuth.expiresIn * 1000)  // seconds duration
                    : null);

            if (expiryMs) {
                const isExpired = Date.now() > expiryMs;
                if (isExpired) {
                    console.log('[AUTH] Stored token expired locally — attempting silent background refresh');
                    try {
                        const refreshed = await refreshToken();
                        if (refreshed) {
                            console.log('[AUTH] ✅ Silent refresh succeeded during autoLogin — reloading auth data');
                            // Reload the fresh persisted data and continue
                            const freshAuth = _loadPersistedAuthData();
                            if (freshAuth && freshAuth.token) {
                                Object.assign(unifiedAuth, freshAuth);
                            }
                        } else {
                            console.log('[AUTH] Silent refresh failed — clearing session (genuine session end)');
                            _clearPersistedAuthData();
                            clearTimeout(autoLoginTimeout);
                            return { success: false, error: 'Session expired and refresh failed', code: 'REFRESH_FAILED' };
                        }
                    } catch (refreshErr) {
                        console.warn('[AUTH] Silent refresh threw during autoLogin:', refreshErr.message);
                        _clearPersistedAuthData();
                        clearTimeout(autoLoginTimeout);
                        return { success: false, error: 'Session refresh error', code: 'REFRESH_ERROR' };
                    }
                }
            }
            
            // Set token immediately for UI rendering
            setUserToken(unifiedAuth.token, unifiedAuth.expiresIn);
            
            // SECURITY FIX #3: _validateTokenWithServer was called but never defined anywhere,
            // causing a ReferenceError on every auto-login attempt. Replaced with the existing
            // validateSession() function which performs the same server-side token check.
            //
            // BUG FIX #7: The original code had early `return` statements that made the
            // user-assignment, cross-tab sync, and session:ready dispatch unreachable (dead code).
            // Restructured so those side effects always run on the success path before returning.
            const isValid = await validateSession();
            if (!isValid) {
                console.log(' [AUTH] Auto-login failed - invalid token');
                clearUserToken();
                clearTimeout(autoLoginTimeout);
                return { 
                    success: false, 
                    error: 'Invalid token',
                    code: 'SESSION_INVALID',
                    message: 'Your session is no longer valid'
                };
            }

            console.log(' [AUTH] Auto-login successful');

            // Restore user from unified storage or legacy storage (was unreachable before fix)
            let user = unifiedAuth?.user || null;
            if (!user) {
                for (const key of CONFIG.USER_DATA_KEYS) {
                    const userDataStr = _safeStorageGet(key);
                    if (userDataStr) {
                        try {
                            user = JSON.parse(userDataStr);
                            if (user) break;
                        } catch (e) {}
                    }
                }
            }
            
            if (user) {
                window.currentUser = user;
            }
            
            _initCrossTabSync();
            _initIframeSync();
            
            // Dispatch session ready event for sync manager (was unreachable before fix)
            try {
                window.dispatchEvent(new CustomEvent('session:ready', {
                    detail: {
                        token: unifiedAuth.token,
                        user: user,
                        timestamp: Date.now(),
                        source: 'autoLogin'
                    }
                }));
            } catch (error) {}
            
            clearTimeout(autoLoginTimeout);
            return {
                success: true,
                user: user,
                token: unifiedAuth.token,
                message: 'Auto-login successful'
            };
        } catch (error) {
            _safeLogError('AUTO-LOGIN', 'Auto-login error', { error: error.message }, false, operation);
            
            clearUserToken();
            _clearPersistedAuthData();
            
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
            
            // Try unified storage first
            const unifiedAuth = _loadPersistedAuthData();
            if (unifiedAuth?.user) {
                window.currentUser = unifiedAuth.user;
                return unifiedAuth.user;
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
                        // PHASE15 FIX: api.request.post() wraps raw JSON body in result.data.
                        // So if backend returns { success, user, data: userObj } then
                        // response.data = { success, user, data: userObj }.
                        // We need to extract the actual user object from one of:
                        //   response.data.user   — flat user (new /me format)
                        //   response.data.data.user — old nested { data: { user: {} } }
                        //   response.data.data   — if data IS the user object
                        //   response.data        — fallback if it already has .id
                        const rawData = response.data;
                        let userData =
                            (rawData.user && rawData.user.id)         ? rawData.user :         // { user: {id,...} }
                            (rawData.data && rawData.data.id)         ? rawData.data :         // { data: {id,...} }
                            (rawData.data && rawData.data.user && rawData.data.user.id) ? rawData.data.user : // { data: { user: {id,...} } }
                            (rawData.id)                              ? rawData :              // flat { id,... }
                            null;

                        if (!userData) {
                            console.warn('[AUTH] /me response shape unrecognised — raw:', JSON.stringify(rawData).substring(0, 200));
                            userData = rawData; // best-effort fallback
                        }

                        _safeStorageSet('USER_DATA', JSON.stringify(userData));
                        window.currentUser = userData;
                        
                        // Update unified storage
                        const unified = _loadPersistedAuthData();
                        if (unified) {
                            unified.user = userData;
                            _persistAuthData(unified.token, userData, unified.refreshToken, unified.expiresIn);
                        }
                        
                        return userData;
                    }
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * PUBLIC: Get user - reads from kynecta_auth (primary) with legacy fallback
     * PATCH: Fixed to use kynecta_auth instead of auth_user
     */
    function getUser() {
        try {
            // Primary: kynecta_auth (used by AuthStorage, authStorage.js, app_core_session.js)
            const raw = localStorage.getItem('kynecta_auth');
            if (raw) {
                const auth = JSON.parse(raw);
                if (auth && auth.user) return auth.user;
            }
            // Legacy fallbacks
            const legacyUser = localStorage.getItem('auth_user') ||
                               localStorage.getItem('currentUser') ||
                               localStorage.getItem('user') ||
                               localStorage.getItem('nexopa_user');
            return legacyUser ? JSON.parse(legacyUser) : null;
        } catch {
            return null;
        }
    }

    /**
     * PUBLIC: Validate token — always calls the server endpoint.
     * PATCH v1.6: Removed local-only validation. Previously this function read
     * kynecta_auth from localStorage and returned { valid: true } without ever
     * contacting the server. That meant an expired (but structurally valid) token
     * was treated as valid, so the 401 interceptor in _safeApiCall never got a
     * chance to attempt a silent refresh. Now we always POST to /api/auth/validate-token.
     * Offline fallback: if the device has no network we return the local token as
     * "valid" to avoid breaking offline UX — the server will enforce expiry on the
     * next real request.
     */
    async function validateToken() {
        try {
            // Retrieve local token first — if there is none there is nothing to validate.
            let localToken = null;
            try {
                const raw = localStorage.getItem('kynecta_auth');
                if (raw) {
                    const auth = JSON.parse(raw);
                    if (auth && auth.token) localToken = auth.token;
                }
            } catch (_) {}
            if (!localToken) {
                // Legacy fallback keys
                localToken = localStorage.getItem('auth_token') ||
                             localStorage.getItem('accessToken') ||
                             localStorage.getItem('USER_TOKEN') ||
                             localStorage.getItem('kynecta_token') || null;
            }

            if (!localToken) {
                return { valid: false, reason: 'no_token' };
            }

            // Offline: trust the local token and let the server reject it later.
            if (!_isOnline()) {
                return { valid: true, token: localToken, user: getUser(), offline: true };
            }

            // Online: ask the server — this is the only authoritative check.
            const baseUrl = _getBaseUrl();
            const response = await fetch(`${baseUrl}/api/auth/validate-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localToken}`
                },
                body: JSON.stringify({ token: localToken })
            });

            const data = await response.json().catch(() => ({}));

            if (response.ok && data.valid) {
                return { valid: true, token: localToken, user: data.user || getUser() };
            }

            // Token rejected by server — attempt a silent refresh before giving up.
            if (response.status === 401) {
                console.warn('[validateToken] Server rejected token (401) — attempting silent refresh');
                try {
                    const refreshed = await refreshToken();
                    if (refreshed) {
                        // Reload the fresh token and report valid.
                        const freshRaw = localStorage.getItem('kynecta_auth');
                        const freshToken = freshRaw ? JSON.parse(freshRaw).token : null;
                        return { valid: !!freshToken, token: freshToken, user: getUser(), refreshed: true };
                    }
                } catch (_) {}
                return { valid: false, reason: 'token_rejected_refresh_failed' };
            }

            return { valid: false, reason: 'server_rejected', status: response.status };
        } catch (error) {
            // Network error — fall back to local token so offline mode still works.
            console.warn('[validateToken] Network error, falling back to local token:', error.message);
            const localToken = getUserToken();
            return localToken
                ? { valid: true, token: localToken, user: getUser(), offline: true, error: error.message }
                : { valid: false, reason: 'validation_error', error: error.message };
        }
    }
    
    /**
     * PUBLIC: Refresh current session
     */
    async function refreshSession() {
        return refreshToken();
    }
    
    /**
     * PUBLIC: Check if user is authenticated
     * PATCH v1.2: Always returns a Promise — never undefined.catch crash.
     */
    async function isAuthenticated() {
        try {
            const token = getUserToken();
            if (!token) return false;
            if (!_isOnline()) return true; // offline → trust local session
            const result = validateSession();
            // validateSession may return bool or Promise — normalise both
            if (result && typeof result.then === 'function') {
                return result;
            }
            return Promise.resolve(!!result);
        } catch(e) {
            return Promise.resolve(false);
        }
    }
    
    /**
     * PUBLIC: Get authentication state with details
     */
    async function getAuthState() {
        const unifiedAuth = _loadPersistedAuthData();
        const token = unifiedAuth?.token || getUserToken();
        const user = await getCurrentUser();
        const isValid = token ? await isAuthenticated() : false;
        
        return {
            authenticated: isValid,
            hasToken: !!token,
            hasUserData: !!user,
            user: user,
            offline: !_isOnline(),
            tokenExpiry: unifiedAuth?.expiresIn ? (unifiedAuth.timestamp + unifiedAuth.expiresIn) : _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY),
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
    
    // ============================================================================
    // MODULE INITIALIZATION
    // ============================================================================
    
    function _handleSessionExpiration() {
        if (_moduleState.sessionExpirationHandled) {
            return;
        }
        
        _moduleState.sessionExpirationHandled = true;
        
        clearUserToken();
        _clearPersistedAuthData();
        
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
        window._API_AUTH_V22_LOADED_.initStarted = true;
        
        console.log(`🔐 [API-AUTH] Initializing authentication module v${VERSION}...`);
        
        try {
            _moduleState.lifecycleState = 'initializing';
            
            await _waitForDependencies();
            
            _initCrossTabSync();
            _initIframeSync();
            
            const expiryCheckInterval = _setSafeInterval(() => {
                try {
                    const unifiedAuth = _loadPersistedAuthData();
                    if (unifiedAuth?.expiresIn && unifiedAuth?.timestamp) {
                        const expiryTime = unifiedAuth.timestamp + unifiedAuth.expiresIn;
                        const timeUntilExpiry = expiryTime - Date.now();
                        
                        if (timeUntilExpiry < CONFIG.TOKEN_REFRESH_BUFFER && timeUntilExpiry > 0) {
                            refreshToken().catch(error => {});
                        } else if (timeUntilExpiry <= 0) {
                            _handleSessionExpiration();
                        }
                    } else {
                        const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
                        if (expiry) {
                            const timeUntilExpiry = parseInt(expiry, 10) - Date.now();
                            
                            if (timeUntilExpiry < CONFIG.TOKEN_REFRESH_BUFFER && timeUntilExpiry > 0) {
                                refreshToken().catch(error => {});
                            } else if (timeUntilExpiry <= 0) {
                                _handleSessionExpiration();
                            }
                        }
                    }
                } catch (error) {}
            }, 30000);
            
            window._API_AUTH_INTERVALS = window._API_AUTH_INTERVALS || [];
            window._API_AUTH_INTERVALS.push(expiryCheckInterval);
            
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && _isOnline()) {
                    const unifiedAuth = _loadPersistedAuthData();
                    if (unifiedAuth?.expiresIn && unifiedAuth?.timestamp) {
                        const expiryTime = unifiedAuth.timestamp + unifiedAuth.expiresIn;
                        if (Date.now() > expiryTime - 300000) {
                            refreshToken().catch(() => {});
                        }
                    } else {
                        const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
                        if (expiry && Date.now() > parseInt(expiry, 10) - 300000) {
                            refreshToken().catch(() => {});
                        }
                    }
                }
            });
            
            _moduleState.initialized = true;
            _readinessState.initCompleted = true;
            window._API_AUTH_V22_LOADED_.initialized = true;
            _moduleState.lifecycleState = 'initialized';
            _emitEvent('initialized', { timestamp: Date.now() });
            
            console.log('✅ [API-AUTH] Authentication module initialized');
            
            // Attempt auto-login if token exists
            const unifiedAuth = _loadPersistedAuthData();
            const token = unifiedAuth?.token || getUserToken();
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
            // CRITICAL FIX: Set ready flag immediately
            ready: true,
            
            // Core authentication functions
            login,
            verifyMfaChallenge,
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
            // PATCH v1.2: Explicit contract aliases — getSession and refreshToken must exist
            // on window.api.auth so any caller can depend on them without checking.
            getSession: function() {
                try {
                    if (window.Session && typeof window.Session.getSession === 'function') {
                        return window.Session.getSession();
                    }
                    const raw = localStorage.getItem('kynecta_auth');
                    if (raw) { const a = JSON.parse(raw); if (a && a.token) return a; }
                    return null;
                } catch(e) { return null; }
            },
            refreshToken: refreshSession,
            isAuthenticated,
            getAuthState,
            
            // Session utilities
            waitForReady,
            waitFor,
            
            // Token validation (non-blocking)
            validateToken,
            
            // Event system
            on: _addEventListener,
            
            // Utility
            getVersion: () => VERSION,
            
            // Storage utilities
            getPersistedAuth: _loadPersistedAuthData,
            clearPersistedAuth: _clearPersistedAuthData,
            
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

        // PATCH: Guarantee getUser exists synchronously using kynecta_auth
        // This prevents DEPENDENCY_QUEUE from marking api.auth as failed
        if (!window.api.auth.getUser) {
            window.api.auth.getUser = function() {
                try {
                    const raw = localStorage.getItem('kynecta_auth');
                    if (raw) { const a = JSON.parse(raw); if (a && a.user) return a.user; }
                    const legacyRaw = localStorage.getItem('currentUser') ||
                                      localStorage.getItem('auth_user') ||
                                      localStorage.getItem('user');
                    return legacyRaw ? JSON.parse(legacyRaw) : null;
                } catch(e) { return null; }
            };
        }

        // PATCH: Expose ready flags synchronously so bootstrap dependency checks pass
        window.api.auth.ready = true;
        window.__API_AUTH_READY = true;
        
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
            const unifiedAuth = _loadPersistedAuthData();
            const authState = {
                hasToken: !!unifiedAuth?.token || !!getUserToken(),
                version: VERSION,
                timestamp: Date.now(),
                instanceId: window._API_AUTH_V22_LOADED_.instanceId,
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
            
            console.log(`✅ api.auth.js v${VERSION} initialized with session persistence fix`, authState);
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
            window._API_AUTH_V22_LOADED_.loadingStage = 'bootstrap_started';
            
            _setupGlobalErrorHandler();
            
            _checkDependencies();
            
            await _initializeAuthModule();
            
            await _setupPublicAPI();
            
            const unifiedAuth = _loadPersistedAuthData();
            const token = unifiedAuth?.token || getUserToken();
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

            // ── PATCH v1.4: PROACTIVE BACKGROUND TOKEN REFRESH SCHEDULER ──────────
            // Checks every 60 s whether the stored token will expire within the next
            // 5 minutes.  If so, and the device is online, it silently refreshes in
            // the background — the user never sees a disruption.
            // If the device is offline we skip the attempt; the session remains
            // usable with the existing (expired) token until connectivity returns,
            // at which point the very next interval tick will trigger the refresh.
            (function _startProactiveRefreshScheduler() {
                const PROACTIVE_THRESHOLD_MS = 5 * 60 * 1000;  // refresh 5 min before expiry
                const SCHEDULER_INTERVAL_MS  = 60 * 1000;       // check every 60 s

                _setSafeInterval(async () => {
                    try {
                        // Skip if a refresh is already running
                        if (_moduleState.tokenRefreshInProgress) return;

                        // Skip entirely while offline — the old token keeps the session
                        // alive for offline use; we'll refresh as soon as we come back.
                        if (!_isOnline()) return;

                        // Check expiry via AuthStorage if available, else decode JWT directly
                        let expiringSoon = false;
                        if (window.AuthStorage && typeof window.AuthStorage.isTokenExpiringSoon === 'function') {
                            expiringSoon = window.AuthStorage.isTokenExpiringSoon(PROACTIVE_THRESHOLD_MS);
                        } else {
                            // Inline fallback: decode JWT exp claim
                            const token = getUserToken();
                            if (token) {
                                try {
                                    const parts = token.split('.');
                                    if (parts.length === 3) {
                                        const p = JSON.parse(atob(parts[1]));
                                        if (p.exp) {
                                            const msLeft = p.exp * 1000 - Date.now();
                                            expiringSoon = msLeft <= PROACTIVE_THRESHOLD_MS;
                                        }
                                    }
                                } catch (_) {}
                            }
                        }

                        if (!expiringSoon) return;

                        console.log('[API-AUTH] 🔄 Proactive token refresh triggered (expiry within 5 min)');
                        const result = await refreshToken();
                        if (result) {
                            console.log('[API-AUTH] ✅ Proactive token refresh succeeded');
                        } else {
                            console.warn('[API-AUTH] ⚠️ Proactive token refresh returned falsy — will retry next tick');
                        }
                    } catch (err) {
                        // Never crash the scheduler — just log and wait for next tick
                        console.warn('[API-AUTH] Proactive refresh scheduler error:', err.message);
                    }
                }, SCHEDULER_INTERVAL_MS);

                // Also listen for the online event so we attempt a refresh immediately
                // after coming back online instead of waiting up to 60 s.
                window.addEventListener('online', async () => {
                    try {
                        if (_moduleState.tokenRefreshInProgress) return;
                        const token = getUserToken();
                        if (!token) return;

                        let needsRefresh = false;
                        if (window.AuthStorage && typeof window.AuthStorage.isTokenExpiringSoon === 'function') {
                            needsRefresh = window.AuthStorage.isTokenExpiringSoon(PROACTIVE_THRESHOLD_MS);
                        } else {
                            try {
                                const parts = token.split('.');
                                if (parts.length === 3) {
                                    const p = JSON.parse(atob(parts[1]));
                                    if (p.exp) needsRefresh = p.exp * 1000 - Date.now() <= PROACTIVE_THRESHOLD_MS;
                                }
                            } catch (_) {}
                        }

                        if (needsRefresh) {
                            console.log('[API-AUTH] 🌐 Back online — triggering immediate background token refresh');
                            await refreshToken();
                        }
                    } catch (err) {
                        console.warn('[API-AUTH] Online-event refresh error:', err.message);
                    }
                });

                console.log('[API-AUTH] ✅ Proactive background refresh scheduler started');
            })();
            
            window._API_AUTH_V22_LOADED_.loadingStage = 'bootstrap_complete';
            console.log('🚀 [AUTH] Immediate bootstrap completed successfully');
            
        } catch (error) {
            _safeLogError('BOOTSTRAP', 'Immediate bootstrap failed', { error: error.message }, true);
            window._API_AUTH_V22_LOADED_.loadingStage = 'bootstrap_failed';
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

console.log('✅ [API-AUTH] Modular authentication service v22.0.1 loaded with session persistence fix (IIFE Protected)');