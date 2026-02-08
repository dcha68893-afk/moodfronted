// api.auth.js - Modular Authentication Service with IIFE Protection
// Version: 21.0.2 - Enhanced Compatibility & Legacy Support with Identifier Fix
// Date: 2024-01-02
// 🔧 ENHANCED: Complete rewrite with improved error handling, better cross-tab sync, and enhanced security
// 🔧 COMPATIBILITY: Added legacy API support, metadata fields, ready signaling, and integration fixes
// 🔧 PATCHED: Added payload normalization layer for login/register with full legacy support
// 🔧 FIXED: Login payload now uses 'identifier' field for backend compatibility

(function() {
    // ============================================================================
    // MODULE LOADING PROTECTION & INITIALIZATION
    // ============================================================================
    
    // Prevent duplicate loading with improved detection
    if (window._API_AUTH_V21_LOADED_) {
        console.warn('⚠️ [API-AUTH] api.auth.js v21.0.2 already loaded, skipping duplicate initialization');
        return;
    }
    
    // Mark as loaded with version-specific flag
    window._API_AUTH_V21_LOADED_ = {
        version: '21.0.2',
        timestamp: Date.now(),
        instanceId: Math.random().toString(36).substring(7),
        loadingStage: 'pre_init'
    };
    
    // Fire loading event with enhanced details
    window.dispatchEvent(new CustomEvent("api-auth-loading", {
        detail: {
            timestamp: Date.now(),
            version: "21.0.2",
            instanceId: window._API_AUTH_V21_LOADED_.instanceId,
            stage: 'initializing'
        }
    }));
    
    console.log("🔐 [API-AUTH] Initializing modular authentication service v21.0.2 (IIFE Protected)");
    
    // ============================================================================
    // PRIVATE CONSTANTS & CONFIGURATION
    // ============================================================================
    
    const CONFIG = {
        // Token storage keys (priority order)
        TOKEN_KEYS: ['USER_TOKEN', 'accessToken', 'moodchat_token', 'token'],
        
        // User data storage keys
        USER_DATA_KEYS: ['USER_DATA', 'authUser', 'moodchat_auth_user', 'userData'],
        
        // Refresh token key
        REFRESH_TOKEN_KEY: 'REFRESH_TOKEN',
        
        // Token expiry key
        TOKEN_EXPIRY_KEY: 'TOKEN_EXPIRY',
        
        // Auth state key
        AUTH_STATE_KEY: 'AUTH_STATE',
        
        // Default token expiry (1 hour in milliseconds)
        DEFAULT_TOKEN_EXPIRY: 3600000,
        
        // Token refresh buffer (1 minute before expiry)
        TOKEN_REFRESH_BUFFER: 60000,
        
        // Session validation cache time (30 seconds)
        VALIDATION_CACHE_TIME: 30000,
        
        // Max concurrent refresh attempts
        MAX_REFRESH_ATTEMPTS: 3,
        
        // Cross-tab sync keys
        CROSS_TAB_SYNC_KEY: 'auth_cross_tab_sync',
        CROSS_TAB_LOGOUT_TRIGGER: 'cross-tab-logout-trigger',
        
        // Dependency wait timeout (30 seconds)
        DEPENDENCY_TIMEOUT: 30000,
        
        // Bootstrap polling interval
        BOOTSTRAP_POLL_INTERVAL: 100,
        
        // Max bootstrap poll attempts
        MAX_BOOTSTRAP_POLLS: 300, // 30 seconds total
        
        // API endpoint configuration
        API_ENDPOINTS: {
            LOGIN: '/api/auth/login',
            REGISTER: '/api/auth/register',
            LOGOUT: '/api/auth/logout',
            VALIDATE: '/api/auth/validate',
            FORGOT_PASSWORD: '/api/auth/forgot-password',
            RESET_PASSWORD: '/api/auth/reset-password',
            REFRESH_TOKEN: '/api/auth/refresh',
            GET_USER: '/api/auth/me'
        }
    };
    
    // ============================================================================
    // PRIVATE STATE MANAGEMENT
    // ============================================================================
    
    let _moduleState = {
        initialized: false,
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
        endpointPrefix: '/api' // Default API prefix
    };
    
    // Private event listeners storage with namespace
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
    
    /**
     * PRIVATE: Safe localStorage access with error handling
     */
    function _safeStorageGet(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.warn(`⚠️ [AUTH] localStorage access failed for key "${key}":`, error.message);
            return null;
        }
    }
    
    /**
     * PRIVATE: Safe localStorage set with error handling
     */
    function _safeStorageSet(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.warn(`⚠️ [AUTH] localStorage set failed for key "${key}":`, error.message);
            return false;
        }
    }
    
    /**
     * PRIVATE: Safe localStorage remove with error handling
     */
    function _safeStorageRemove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.warn(`⚠️ [AUTH] localStorage remove failed for key "${key}":`, error.message);
            return false;
        }
    }
    
    /**
     * PRIVATE: Check if we're online with caching
     */
    function _isOnline() {
        // Use cached result if recent (within 5 seconds)
        if (Date.now() - _moduleState.lastNetworkCheck < 5000 && _moduleState.offlineMode !== undefined) {
            return !_moduleState.offlineMode;
        }
        
        _moduleState.lastNetworkCheck = Date.now();
        
        // Priority 1: Check AppNetwork if available
        if (window.AppNetwork && typeof window.AppNetwork.isOnline === 'boolean') {
            _moduleState.offlineMode = !window.AppNetwork.isOnline;
            return window.AppNetwork.isOnline;
        }
        
        // Priority 2: Check navigator.onLine
        if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
            _moduleState.offlineMode = !navigator.onLine;
            return navigator.onLine;
        }
        
        // Default to online
        _moduleState.offlineMode = false;
        return true;
    }
    
    /**
     * PRIVATE: Get API request module with fallbacks
     */
    function _getApiRequest() {
        // Priority 1: window.api.request (modular)
        if (window.api && window.api.request) {
            return window.api.request;
        }
        
        // Priority 2: __API_REQUEST (global)
        if (window.__API_REQUEST) {
            return window.__API_REQUEST;
        }
        
        // Priority 3: Check for request module in various locations
        if (window.MoodChatRequest) {
            return window.MoodChatRequest;
        }
        
        console.warn('⚠️ [AUTH] No API request module found');
        return null;
    }
    
    /**
     * PRIVATE: Get full API endpoint URL with prefix correction
     * FIX: Prevents double /api/api prefix issues
     */
    function _getApiEndpoint(endpoint) {
        // Check if endpoint already has correct prefix
        if (endpoint.startsWith('/api/')) {
            return endpoint;
        }
        
        // Check if endpoint starts with api/ (without leading slash)
        if (endpoint.startsWith('api/')) {
            return '/' + endpoint;
        }
        
        // Otherwise, prepend the API prefix
        return `${_moduleState.endpointPrefix}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    }
    
    /**
     * PRIVATE: Emit internal events with error protection
     */
    function _emitEvent(eventName, detail) {
        if (!_eventListeners[eventName]) {
            console.warn(`⚠️ [AUTH] Unknown event: ${eventName}`);
            return;
        }
        
        const eventDetail = {
            ...detail,
            timestamp: Date.now(),
            source: 'api.auth.js',
            version: '21.0.2',
            instanceId: window._API_AUTH_V21_LOADED_.instanceId
        };
        
        // Dispatch to internal listeners
        _eventListeners[eventName].forEach(listener => {
            try {
                listener(eventDetail);
            } catch (error) {
                console.error(`❌ [AUTH] Error in event listener for ${eventName}:`, error);
            }
        });
        
        // Also dispatch as custom event on window for external listeners
        if (eventName === 'token-expired' || eventName === 'session-refreshed' || 
            eventName === 'login' || eventName === 'logout' || eventName === 'ready') {
            window.dispatchEvent(new CustomEvent(`auth-${eventName}`, {
                detail: eventDetail
            }));
        }
    }
    
    /**
     * PRIVATE: Add internal event listener
     */
    function _addEventListener(eventName, callback) {
        if (!_eventListeners[eventName]) {
            _eventListeners[eventName] = [];
        }
        _eventListeners[eventName].push(callback);
    }
    
    /**
     * PRIVATE: Check for required dependencies
     */
    function _checkDependencies() {
        _moduleState.dependencyCheckAttempts++;
        
        // Check api.core
        const hasApiCore = !!(window.api && window.api.core);
        const hasApiRequest = !!(window.api && window.api.request);
        const hasAppCore = !!(window.AppCore);
        
        _moduleState.apiCoreAvailable = hasApiCore;
        _moduleState.apiRequestAvailable = hasApiRequest;
        _moduleState.appCoreAvailable = hasAppCore;
        
        // Log dependency status
        if (_moduleState.dependencyCheckAttempts <= 1 || _moduleState.dependencyCheckAttempts % 10 === 0) {
            console.log(`🔍 [AUTH] Dependency check #${_moduleState.dependencyCheckAttempts}:`, {
                apiCore: hasApiCore ? '✓' : '✗',
                apiRequest: hasApiRequest ? '✓' : '✗',
                appCore: hasAppCore ? '✓' : '✗'
            });
        }
        
        // Update lifecycle state based on dependencies
        if (hasApiCore && hasApiRequest) {
            _moduleState.dependenciesReady = true;
            _moduleState.lifecycleState = 'dependencies_ready';
            return true;
        }
        
        return false;
    }
    
    /**
     * PRIVATE: Wait for dependencies with timeout
     */
    function _waitForDependencies() {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const maxWaitTime = CONFIG.DEPENDENCY_TIMEOUT;
            
            const checkInterval = setInterval(() => {
                if (_checkDependencies()) {
                    clearInterval(checkInterval);
                    console.log(`✅ [AUTH] Dependencies ready after ${Date.now() - startTime}ms`);
                    resolve(true);
                } else if (Date.now() - startTime > maxWaitTime) {
                    clearInterval(checkInterval);
                    console.warn(`⚠️ [AUTH] Dependency wait timeout after ${maxWaitTime}ms`);
                    
                    // Continue even without all dependencies (fallback mode)
                    _moduleState.lifecycleState = 'dependencies_timeout';
                    resolve(false);
                }
            }, 100);
        });
    }
    
    /**
     * PRIVATE: Set module metadata fields
     */
    function _setMetadataFields(authObject) {
        if (!authObject || _moduleState.metadataFieldsSet) {
            return;
        }
        
        try {
            // Set version
            Object.defineProperty(authObject, 'version', {
                value: '21.0.2',
                writable: false,
                configurable: false,
                enumerable: true
            });
            
            // Set lifecycle state with getter/setter
            Object.defineProperty(authObject, 'lifecycleState', {
                get: () => _moduleState.lifecycleState,
                set: (value) => {
                    _moduleState.lifecycleState = value;
                    console.log(`🔐 [AUTH] Lifecycle state changed to: ${value}`);
                },
                enumerable: true,
                configurable: false
            });
            
            // Set registrationComplete
            Object.defineProperty(authObject, 'registrationComplete', {
                get: () => _moduleState.registrationComplete,
                set: (value) => {
                    _moduleState.registrationComplete = Boolean(value);
                },
                enumerable: true,
                configurable: false
            });
            
            // Set _initialized (internal)
            Object.defineProperty(authObject, '_initialized', {
                get: () => _moduleState.initialized,
                set: (value) => {
                    _moduleState.initialized = Boolean(value);
                },
                enumerable: true,
                configurable: false
            });
            
            // Set ready flag with getter/setter
            Object.defineProperty(authObject, 'ready', {
                get: () => _moduleState.initialized && _moduleState.bootstrapComplete,
                set: (value) => {
                    if (value === true && !_moduleState.bootstrapComplete) {
                        _markBootstrapComplete();
                    }
                },
                enumerable: true,
                configurable: false
            });
            
            // Set instanceId
            Object.defineProperty(authObject, 'instanceId', {
                value: window._API_AUTH_V21_LOADED_.instanceId,
                writable: false,
                configurable: false,
                enumerable: true
            });
            
            // Set loadedAt timestamp
            Object.defineProperty(authObject, 'loadedAt', {
                value: _moduleState.loadStartTime,
                writable: false,
                configurable: false,
                enumerable: true
            });
            
            // Set bootstrapComplete
            Object.defineProperty(authObject, 'bootstrapComplete', {
                get: () => _moduleState.bootstrapComplete,
                set: (value) => {
                    _moduleState.bootstrapComplete = Boolean(value);
                },
                enumerable: true,
                configurable: false
            });
            
            // Set API endpoint prefix
            Object.defineProperty(authObject, 'endpointPrefix', {
                get: () => _moduleState.endpointPrefix,
                set: (value) => {
                    if (value && typeof value === 'string') {
                        _moduleState.endpointPrefix = value;
                        console.log(`🔐 [AUTH] API endpoint prefix set to: ${value}`);
                    }
                },
                enumerable: true,
                configurable: false
            });
            
            _moduleState.metadataFieldsSet = true;
            console.log('✅ [AUTH] Metadata fields set');
        } catch (error) {
            console.error('❌ [AUTH] Failed to set metadata fields:', error);
        }
    }
    
    /**
     * PRIVATE: Mark bootstrap as complete
     */
    function _markBootstrapComplete() {
        if (_moduleState.bootstrapComplete) {
            return;
        }
        
        _moduleState.bootstrapComplete = true;
        _moduleState.registrationComplete = true;
        _moduleState.lifecycleState = 'ready';
        
        console.log('✅ [AUTH] Bootstrap complete');
        
        // Execute all ready callbacks
        _moduleState.readyCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('❌ [AUTH] Error in ready callback:', error);
            }
        });
        _moduleState.readyCallbacks = [];
        
        // Emit ready event
        _emitEvent('ready', {
            initialized: _moduleState.initialized,
            dependenciesReady: _moduleState.dependenciesReady,
            timestamp: Date.now()
        });
    }
    
    /**
     * PRIVATE: Register legacy compatibility APIs
     */
    function _registerLegacyAPIs(publicApi) {
        console.log('🔧 [AUTH] Registering legacy compatibility APIs');
        
        // Helper to merge without overwriting
        const safeMerge = (target, source, sourceName) => {
            Object.keys(source).forEach(key => {
                if (!target[key]) {
                    target[key] = source[key];
                } else {
                    console.warn(`⚠️ [AUTH] Skipping ${key} - already exists in ${sourceName}`);
                }
            });
        };
        
        // Ensure window.MoodChatAuth exists with required methods
        if (!window.MoodChatAuth) {
            window.MoodChatAuth = {};
        }
        
        // Add missing methods to MoodChatAuth
        const requiredLegacyMethods = ['login', 'register', 'logout', 'getCurrentUser', 'getUser'];
        requiredLegacyMethods.forEach(methodName => {
            if (!window.MoodChatAuth[methodName] && publicApi[methodName]) {
                window.MoodChatAuth[methodName] = publicApi[methodName];
                console.log(`🔧 [AUTH] Added ${methodName} to MoodChatAuth`);
            }
        });
        
        // Ensure window.auth exists with required methods
        if (!window.auth) {
            window.auth = {};
        }
        
        // Add missing methods to window.auth
        requiredLegacyMethods.forEach(methodName => {
            if (!window.auth[methodName] && publicApi[methodName]) {
                window.auth[methodName] = publicApi[methodName];
                console.log(`🔧 [AUTH] Added ${methodName} to window.auth`);
            }
        });
        
        // Add deprecated warning wrappers for legacy methods
        if (window.auth && !window.auth.getUser) {
            window.auth.getUser = function() {
                console.warn('⚠️ [API-AUTH] Using deprecated window.auth.getUser(), use window.api.auth.getUser() instead');
                return publicApi.getUser();
            };
        }
        
        if (window.MoodChatAuth && !window.MoodChatAuth.getUser) {
            window.MoodChatAuth.getUser = function() {
                console.warn('⚠️ [API-AUTH] Using deprecated MoodChatAuth.getUser(), use window.api.auth.getUser() instead');
                return publicApi.getUser();
            };
        }
        
        console.log('✅ [AUTH] Legacy APIs registered');
    }
    
    // ============================================================================
    // PRIVATE TOKEN REGISTRATION SYSTEM (CRITICAL PATCH)
    // ============================================================================
    
    /**
     * PRIVATE: Register token with api.core system
     * CRITICAL FIX: This resolves "Waiting for token system initialization"
     */
    function _registerTokenWithCoreSystem(token) {
        console.log('🔐 [AUTH] Registering token with api.core system...');
        
        let registered = false;
        let methodUsed = '';
        
        try {
            // Priority 1: api.core.setAccessToken
            if (window.api && window.api.core && typeof window.api.core.setAccessToken === 'function') {
                window.api.core.setAccessToken(token);
                registered = true;
                methodUsed = 'api.core.setAccessToken';
                console.log('✅ [AUTH] Token registered via api.core.setAccessToken()');
            }
            // Priority 2: api.core.setToken
            else if (window.api && window.api.core && typeof window.api.core.setToken === 'function') {
                window.api.core.setToken(token);
                registered = true;
                methodUsed = 'api.core.setToken';
                console.log('✅ [AUTH] Token registered via api.core.setToken()');
            }
            // Priority 3: api.core.tokenManager.initialize
            else if (window.api && window.api.core && window.api.core.tokenManager && 
                     typeof window.api.core.tokenManager.initialize === 'function') {
                window.api.core.tokenManager.initialize(token);
                registered = true;
                methodUsed = 'api.core.tokenManager.initialize';
                console.log('✅ [AUTH] Token registered via api.core.tokenManager.initialize()');
            }
            // Priority 4: api.core.tokenManager.setToken
            else if (window.api && window.api.core && window.api.core.tokenManager && 
                     typeof window.api.core.tokenManager.setToken === 'function') {
                window.api.core.tokenManager.setToken(token);
                registered = true;
                methodUsed = 'api.core.tokenManager.setToken';
                console.log('✅ [AUTH] Token registered via api.core.tokenManager.setToken()');
            }
            // Priority 5: api.core._tokenSystem.init
            else if (window.api && window.api.core && window.api.core._tokenSystem && 
                     typeof window.api.core._tokenSystem.init === 'function') {
                window.api.core._tokenSystem.init(token);
                registered = true;
                methodUsed = 'api.core._tokenSystem.init';
                console.log('✅ [AUTH] Token registered via api.core._tokenSystem.init()');
            }
            // Priority 6: __API_CORE.setUserToken (legacy)
            else if (window.__API_CORE && typeof window.__API_CORE.setUserToken === 'function') {
                window.__API_CORE.setUserToken(token);
                registered = true;
                methodUsed = '__API_CORE.setUserToken';
                console.log('✅ [AUTH] Token registered via __API_CORE.setUserToken()');
            }
            // Priority 7: window.AppCore.tokenManager (if available)
            else if (window.AppCore && window.AppCore.tokenManager && 
                     typeof window.AppCore.tokenManager.setToken === 'function') {
                window.AppCore.tokenManager.setToken(token);
                registered = true;
                methodUsed = 'AppCore.tokenManager.setToken';
                console.log('✅ [AUTH] Token registered via AppCore.tokenManager.setToken()');
            }
            else {
                console.warn('⚠️ [AUTH] No compatible token registration method found in api.core');
            }
            
            // CRITICAL: Dispatch token-ready event to unblock UI
            if (registered) {
                console.log('🔐 [AUTH] Dispatching api-auth-token-ready event');
                window.dispatchEvent(new CustomEvent("api-auth-token-ready", {
                    detail: {
                        token: token,
                        registered: true,
                        method: methodUsed,
                        timestamp: Date.now(),
                        source: 'api.auth.js',
                        version: '21.0.2'
                    }
                }));
                
                // Also dispatch legacy event for backward compatibility
                window.dispatchEvent(new CustomEvent("token-system-ready", {
                    detail: {
                        token: token,
                        timestamp: Date.now()
                    }
                }));
            }
            
        } catch (error) {
            console.error('❌ [AUTH] Error registering token with core system:', error);
            
            // Still dispatch event with error flag to unblock UI
            window.dispatchEvent(new CustomEvent("api-auth-token-ready", {
                detail: {
                    token: token,
                    registered: false,
                    error: error.message,
                    timestamp: Date.now(),
                    source: 'api.auth.js',
                    version: '21.0.2'
                }
            }));
        }
        
        return registered;
    }
    
    // ============================================================================
    // PRIVATE PAYLOAD NORMALIZATION LAYER (UPDATED WITH IDENTIFIER FIELD FIX)
    // ============================================================================
    
    /**
     * PRIVATE: Extract value from FormData by field name
     */
    function _getFormDataValue(formData, fieldName) {
        try {
            return formData.get(fieldName);
        } catch (error) {
            return null;
        }
    }
    
    /**
     * PRIVATE: Normalize login payload from multiple legacy formats
     * FIXED: Now uses 'identifier' field for backend compatibility
     * STRICT PRIORITY ORDER:
     * 1. login(email, password) - two string arguments
     * 2. login(FormData)
     * 3. login(object)
     */
    function _normalizeLoginPayload(args) {
        console.log('🔧 [AUTH] Normalizing login payload - RAW ARGS:', args);
        
        // Initialize with null values
        let normalized = {
            identifier: null, // CHANGED: Single field for email/username
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
            console.log('🔧 [AUTH] Case 1: Two string arguments detected');
            const [first, second] = args;
            
            // Set identifier (can be email or username) - BACKEND EXPECTS 'identifier'
            normalized.identifier = first.trim();
            normalized.password = second;
            normalized._source = 'two_string_args';
            
            console.log('🔧 [AUTH] Normalized from two string arguments:', normalized);
            return normalized;
        }
        
        // CASE 2: FormData argument
        if (args.length === 1 && args[0] instanceof FormData) {
            console.log('🔧 [AUTH] Case 2: FormData detected');
            const formData = args[0];
            normalized._source = 'formdata';
            
            try {
                // Extract from FormData with priority
                const formFields = {};
                
                // Get all form values first
                try {
                    for (let [key, value] of formData.entries()) {
                        if (value && typeof value === 'string') {
                            formFields[key.toLowerCase()] = value;
                        }
                    }
                    
                    console.log('🔧 [AUTH] FormData fields extracted:', Object.keys(formFields));
                    
                    // Map identifier with priority (email, username, or identifier field)
                    // CHANGED: Looking for identifier field first
                    if (formFields.identifier && !normalized.identifier) {
                        normalized.identifier = formFields.identifier.trim();
                        console.log('🔧 [AUTH] Identifier from "identifier" field');
                    } 
                    // Fallback: Check email fields
                    else {
                        const emailFields = ['email', 'mail', 'useremail', 'e-mail'];
                        for (const field of emailFields) {
                            if (formFields[field] && !normalized.identifier) {
                                normalized.identifier = formFields[field].trim();
                                console.log(`🔧 [AUTH] Identifier from email field "${field}"`);
                                break;
                            }
                        }
                    }
                    
                    // Fallback: Check username fields
                    if (!normalized.identifier) {
                        const usernameFields = ['username', 'user', 'usr', 'login'];
                        for (const field of usernameFields) {
                            if (formFields[field] && !normalized.identifier) {
                                normalized.identifier = formFields[field].trim();
                                console.log(`🔧 [AUTH] Identifier from username field "${field}"`);
                                break;
                            }
                        }
                    }
                    
                    // Map password with priority
                    const passwordFields = ['password', 'pass', 'secret', 'pwd', 'passcode'];
                    for (const field of passwordFields) {
                        if (formFields[field] && !normalized.password) {
                            normalized.password = formFields[field];
                            console.log(`🔧 [AUTH] Password from field "${field}"`);
                            break;
                        }
                    }
                    
                    console.log('🔧 [AUTH] Normalized from FormData:', normalized);
                    return normalized;
                } catch (error) {
                    console.error('❌ [AUTH] Error processing FormData:', error);
                    return normalized;
                }
            } catch (error) {
                console.error('❌ [AUTH] Error processing FormData:', error);
                return normalized;
            }
        }
        
        // CASE 3: Single object argument
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            console.log('🔧 [AUTH] Case 3: Object argument detected');
            const input = args[0];
            normalized._source = 'object';
            
            // Field mapping with priority order
            // CHANGED: Identifier field takes priority
            const fieldMappings = [
                // Identifier field (highest priority)
                { source: 'identifier', target: 'identifier' },
                // Email fields
                { source: 'email', target: 'identifier' },
                { source: 'mail', target: 'identifier' },
                { source: 'useremail', target: 'identifier' },
                // Username fields
                { source: 'username', target: 'identifier' },
                { source: 'user', target: 'identifier' },
                { source: 'usr', target: 'identifier' },
                { source: 'login', target: 'identifier' },
                // Password fields
                { source: 'password', target: 'password' },
                { source: 'pass', target: 'password' },
                { source: 'secret', target: 'password' },
                { source: 'pwd', target: 'password' }
            ];
            
            // Apply mappings with priority
            for (const mapping of fieldMappings) {
                const value = input[mapping.source];
                if (value && !normalized[mapping.target]) {
                    if (mapping.target === 'identifier') {
                        normalized.identifier = String(value).trim();
                        console.log(`🔧 [AUTH] Identifier from field "${mapping.source}"`);
                    } else if (mapping.target === 'password') {
                        normalized.password = String(value);
                        console.log(`🔧 [AUTH] ${mapping.target} from field "${mapping.source}"`);
                    }
                }
            }
            
            // Handle login field specially
            if (input.login && !normalized.identifier && !normalized.password) {
                const loginValue = String(input.login).trim();
                normalized.identifier = loginValue;
                console.log('🔧 [AUTH] Identifier from login field');
            }
            
            console.log('🔧 [AUTH] Normalized from object:', normalized);
            return normalized;
        }
        
        // CASE 4: Legacy object with extra arguments (fallback)
        if (args.length > 1 && typeof args[0] === 'object' && args[0] !== null) {
            console.log('🔧 [AUTH] Case 4: Object with extra arguments (legacy)');
            normalized._source = 'object_with_extras';
            
            // Try to normalize as object first
            const objectNormalized = _normalizeLoginPayload([args[0]]);
            
            // Preserve any values already found
            if (objectNormalized.identifier) normalized.identifier = objectNormalized.identifier;
            if (objectNormalized.password) normalized.password = objectNormalized.password;
        }
        
        console.log('🔧 [AUTH] Final normalized login data:', normalized);
        return normalized;
    }
    
    /**
     * PRIVATE: Validate normalized login payload
     * FIXED: Now validates 'identifier' field instead of email/username separately
     */
    function _validateLoginPayload(normalized) {
        console.log('🔧 [AUTH] Validating login payload:', normalized);
        
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
                identifier: normalized.identifier, // CHANGED: Single identifier field
                password: normalized.password
            }
        };
    }
    
    /**
     * PRIVATE: Normalize register payload from multiple legacy formats
     * IMPORTANT: Registration uses different fields and remains unchanged
     * STRICT PRIORITY ORDER:
     * 1. register(email, username, password, confirm)
     * 2. register(FormData)
     * 3. register(object)
     */
    function _normalizeRegisterPayload(args) {
        console.log('🔧 [AUTH] Normalizing register payload - RAW ARGS:', args);
        
        // Initialize with null values
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
        
        // CASE 1: Four string arguments (register(email, username, password, confirm))
        if (args.length >= 4 && 
            typeof args[0] === 'string' && 
            typeof args[1] === 'string' && 
            typeof args[2] === 'string' && 
            typeof args[3] === 'string') {
            
            console.log('🔧 [AUTH] Case 1: Four string arguments detected');
            normalized.email = args[0].trim();
            normalized.username = args[1].trim();
            normalized.password = args[2];
            normalized.confirmPassword = args[3];
            normalized._source = 'four_string_args';
            
            // Optional 5th argument for name
            if (args.length >= 5 && typeof args[4] === 'string') {
                normalized.name = args[4].trim();
            }
            
            console.log('🔧 [AUTH] Normalized from four string arguments:', normalized);
            return normalized;
        }
        
        // CASE 2: FormData argument
        if (args.length === 1 && args[0] instanceof FormData) {
            console.log('🔧 [AUTH] Case 2: FormData detected');
            const formData = args[0];
            normalized._source = 'formdata';
            
            try {
                // Extract all form values
                const formFields = {};
                for (let [key, value] of formData.entries()) {
                    if (value && typeof value === 'string') {
                        formFields[key.toLowerCase()] = value;
                    }
                }
                
                console.log('🔧 [AUTH] FormData fields extracted:', Object.keys(formFields));
                
                // Field mapping with priority
                const mappings = [
                    // Email
                    { fields: ['email', 'mail', 'useremail'], target: 'email' },
                    // Username
                    { fields: ['username', 'user', 'usr', 'login'], target: 'username' },
                    // Password
                    { fields: ['password', 'pass', 'secret', 'pwd'], target: 'password' },
                    // Confirm Password - CRITICAL PATCH: Extended field mappings
                    { fields: ['confirmpassword', 'confirmpass', 'pass2', 'confirm', 'passwordconfirm', 'confirm_password', 
                              'confirm', 'passwordconfirm', 'password_confirmation', 'pass2', 'repeatpassword', 
                              'repeat_password', 'repassword'], target: 'confirmPassword' },
                    // Name
                    { fields: ['name', 'fullname', 'displayname', 'full_name', 'display_name'], target: 'name' },
                    // Avatar
                    { fields: ['avatar', 'picture', 'photo', 'image', 'profilepic'], target: 'avatar' }
                ];
                
                // Apply mappings
                for (const mapping of mappings) {
                    for (const field of mapping.fields) {
                        if (formFields[field] && !normalized[mapping.target]) {
                            if (mapping.target === 'email' || mapping.target === 'username' || mapping.target === 'name' || mapping.target === 'avatar') {
                                normalized[mapping.target] = formFields[field].trim();
                            } else {
                                normalized[mapping.target] = formFields[field];
                            }
                            console.log(`🔧 [AUTH] ${mapping.target} from field "${field}"`);
                            break;
                        }
                    }
                }
                
                // Special handling for user field that might be email
                if (formFields.user && !normalized.email && !normalized.username) {
                    const userValue = formFields.user.trim();
                    if (userValue.includes('@')) {
                        normalized.email = userValue;
                        console.log('🔧 [AUTH] Email from user field (contains @)');
                    } else {
                        normalized.username = userValue;
                        console.log('🔧 [AUTH] Username from user field');
                    }
                }
                
                console.log('🔧 [AUTH] Normalized from FormData:', normalized);
                return normalized;
            } catch (error) {
                console.error('❌ [AUTH] Error processing FormData:', error);
                return normalized;
            }
        }
        
        // CASE 3: Single object argument
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            console.log('🔧 [AUTH] Case 3: Object argument detected');
            const input = args[0];
            normalized._source = 'object';
            
            // Field mapping with priority
            const mappings = [
                // Email (highest priority)
                { fields: ['email', 'mail', 'useremail'], target: 'email' },
                // Username
                { fields: ['username', 'user', 'usr', 'login'], target: 'username' },
                // Password
                { fields: ['password', 'pass', 'secret', 'pwd'], target: 'password' },
                // Confirm Password - CRITICAL PATCH: Extended field mappings
                { fields: ['confirmPassword', 'confirmpassword', 'confirm', 'pass2', 'passwordConfirm', 'confirm_password',
                          'confirm', 'passwordconfirm', 'password_confirmation', 'pass2', 'repeatPassword',
                          'repeat_password', 'repassword'], target: 'confirmPassword' },
                // Name
                { fields: ['name', 'fullname', 'displayName', 'full_name', 'display_name'], target: 'name' },
                // Avatar
                { fields: ['avatar', 'picture', 'photo', 'image', 'profilePic'], target: 'avatar' }
            ];
            
            // Apply mappings
            for (const mapping of mappings) {
                for (const field of mapping.fields) {
                    const value = input[field];
                    if (value !== undefined && value !== null && !normalized[mapping.target]) {
                        if (mapping.target === 'email' || mapping.target === 'username' || mapping.target === 'name' || mapping.target === 'avatar') {
                            normalized[mapping.target] = String(value).trim();
                        } else {
                            normalized[mapping.target] = String(value);
                        }
                        console.log(`🔧 [AUTH] ${mapping.target} from field "${field}"`);
                        break;
                    }
                }
            }
            
            // Special handling for user field that might be email
            if (input.user !== undefined && input.user !== null && !normalized.email && !normalized.username) {
                const userValue = String(input.user).trim();
                if (userValue.includes('@')) {
                    normalized.email = userValue;
                    console.log('🔧 [AUTH] Email from user field (contains @)');
                } else {
                    normalized.username = userValue;
                    console.log('🔧 [AUTH] Username from user field');
                }
            }
            
            // CRITICAL PATCH: Additional confirm password field search
            if (!normalized.confirmPassword) {
                console.log('🔧 [AUTH] confirmPassword not found, searching alternative fields...');
                
                // Priority order for confirm password fields
                const confirmFields = [
                    'confirm',
                    'confirm_password', 
                    'passwordConfirm',
                    'password_confirmation',
                    'pass2',
                    'repeatPassword',
                    'repeat_password',
                    'repassword',
                    'password2',
                    'password_confirm'
                ];
                
                for (const field of confirmFields) {
                    const value = input[field];
                    if (value !== undefined && value !== null && typeof value === 'string' && value.trim() !== '') {
                        normalized.confirmPassword = String(value);
                        console.log(`🔧 [AUTH] confirmPassword found in alternative field "${field}"`);
                        break;
                    }
                }
                
                // Last resort: If still missing and we have password, use it (backward compatibility)
                if (!normalized.confirmPassword && normalized.password) {
                    console.log('⚠️ [AUTH] confirmPassword not found, using password as fallback (backward compatibility)');
                    normalized.confirmPassword = normalized.password;
                }
            }
            
            // Legacy special handling for confirm field variants
            if (!normalized.confirmPassword) {
                if (input.confirm && typeof input.confirm === 'string') {
                    normalized.confirmPassword = input.confirm;
                    console.log('🔧 [AUTH] confirmPassword from confirm field');
                } else if (input.passwordConfirm && typeof input.passwordConfirm === 'string') {
                    normalized.confirmPassword = input.passwordConfirm;
                    console.log('🔧 [AUTH] confirmPassword from passwordConfirm field');
                }
            }
            
            console.log('🔧 [AUTH] Normalized from object:', normalized);
            return normalized;
        }
        
        console.log('🔧 [AUTH] Final normalized register data:', normalized);
        return normalized;
    }
    
    /**
     * PRIVATE: Validate normalized register payload
     */
    function _validateRegisterPayload(normalized) {
        console.log('🔧 [AUTH] Validating register payload:', normalized);
        
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
        
        // CRITICAL PATCH: Handle missing confirmPassword with better error message
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
    
    /**
     * PRIVATE: Normalize forgot password payload
     */
    function _normalizeForgotPasswordPayload(args) {
        console.log('🔧 [AUTH] Normalizing forgot password payload:', args);
        
        // Case 1: forgotPassword(email) - single string
        if (args.length === 1 && typeof args[0] === 'string') {
            return args[0].trim();
        }
        
        // Case 2: forgotPassword({ email })
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            const obj = args[0];
            
            // Try various field names
            const possibleFields = ['email', 'mail', 'user', 'username', 'identifier'];
            for (const field of possibleFields) {
                if (obj[field] && typeof obj[field] === 'string') {
                    return String(obj[field]).trim();
                }
            }
            
            // If object has a single property, use its value
            const keys = Object.keys(obj);
            if (keys.length === 1 && typeof obj[keys[0]] === 'string') {
                return String(obj[keys[0]]).trim();
            }
        }
        
        // Return as-is for backward compatibility
        if (args.length === 1) {
            return String(args[0]).trim();
        }
        
        throw new Error('Invalid arguments for forgotPassword');
    }
    
    /**
     * PRIVATE: Normalize reset password payload
     */
    function _normalizeResetPasswordPayload(args) {
        console.log('🔧 [AUTH] Normalizing reset password payload:', args);
        
        // Case 1: resetPassword(token, newPassword) - two strings
        if (args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
            return {
                token: args[0].trim(),
                newPassword: args[1]
            };
        }
        
        // Case 2: resetPassword({ token, newPassword })
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            const obj = args[0];
            const result = {
                token: null,
                newPassword: null
            };
            
            // Map field names
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
    
    /**
     * PRIVATE: Get user token from all possible storage locations
     */
    function getUserToken() {
        try {
            // Priority 1: Use core token system if available (api.core.js integration)
            if (window.__API_CORE && typeof window.__API_CORE.getUserToken === 'function') {
                const coreToken = window.__API_CORE.getUserToken();
                if (coreToken) {
                    console.debug('🔐 [AUTH] Token retrieved from __API_CORE');
                    return coreToken;
                }
            }
            
            // Priority 2: Check all possible token storage locations
            for (const key of CONFIG.TOKEN_KEYS) {
                const token = _safeStorageGet(key);
                if (token) {
                    console.debug(`🔐 [AUTH] Token retrieved from ${key}`);
                    
                    // Verify token is not empty or undefined
                    if (token.trim() === '' || token === 'undefined' || token === 'null') {
                        console.warn(`⚠️ [AUTH] Invalid token found in ${key}, clearing`);
                        _safeStorageRemove(key);
                        continue;
                    }
                    
                    // Check token expiry if available
                    const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
                    if (expiry && Date.now() > parseInt(expiry, 10)) {
                        console.warn('⚠️ [AUTH] Token expired, clearing');
                        clearUserToken();
                        return null;
                    }
                    
                    return token;
                }
            }
            
            return null;
        } catch (error) {
            console.error('❌ [AUTH] Critical error getting token:', error);
            return null;
        }
    }
    
    /**
     * PRIVATE: Set user token in all storage locations
     */
    function setUserToken(token, expiryMs = CONFIG.DEFAULT_TOKEN_EXPIRY) {
        try {
            if (!token || typeof token !== 'string') {
                console.error('❌ [AUTH] Invalid token provided');
                return false;
            }
            
            // Validate token format (basic JWT check)
            if (token.split('.').length !== 3) {
                console.warn('⚠️ [AUTH] Token does not appear to be a valid JWT format');
            }
            
            // CRITICAL PATCH: Register token with core system first
            console.log('🔐 [AUTH] Setting user token, registering with core system...');
            _registerTokenWithCoreSystem(token);
            
            // Set in core system if available (legacy)
            if (window.__API_CORE && typeof window.__API_CORE.setUserToken === 'function') {
                window.__API_CORE.setUserToken(token);
            }
            
            // Store in all token locations for backward compatibility
            let storedSuccessfully = false;
            for (const key of CONFIG.TOKEN_KEYS) {
                if (_safeStorageSet(key, token)) {
                    storedSuccessfully = true;
                }
            }
            
            if (!storedSuccessfully) {
                throw new Error('Failed to store token in any location');
            }
            
            // Store expiry if provided
            if (expiryMs && !isNaN(expiryMs)) {
                const expiryTime = Date.now() + expiryMs;
                _safeStorageSet(CONFIG.TOKEN_EXPIRY_KEY, expiryTime.toString());
                console.debug(`🔐 [AUTH] Token expiry set to ${new Date(expiryTime).toISOString()}`);
            }
            
            console.log('✅ [AUTH] Token set successfully across all storage locations');
            return true;
        } catch (error) {
            console.error('❌ [AUTH] Error setting token:', error);
            return false;
        }
    }
    
    /**
     * PRIVATE: Clear user token from all storage locations
     */
    function clearUserToken() {
        try {
            // Clear from core system if available
            if (window.__API_CORE && typeof window.__API_CORE.clearAllAuthData === 'function') {
                window.__API_CORE.clearAllAuthData();
            }
            
            // Clear all token storage locations
            let clearedCount = 0;
            for (const key of CONFIG.TOKEN_KEYS) {
                if (_safeStorageRemove(key)) {
                    clearedCount++;
                }
            }
            
            // Clear related auth data
            _safeStorageRemove(CONFIG.TOKEN_EXPIRY_KEY);
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            
            console.log(`✅ [AUTH] Cleared tokens from ${clearedCount} locations`);
            return true;
        } catch (error) {
            console.error('❌ [AUTH] Error clearing token:', error);
            return false;
        }
    }
    
    /**
     * PRIVATE: Refresh token using refresh token with queue management
     */
    async function refreshToken() {
        // If refresh already in progress, queue this request
        if (_moduleState.tokenRefreshInProgress) {
            console.log('🔐 [AUTH] Token refresh already in progress, adding to queue');
            return new Promise((resolve, reject) => {
                _moduleState.pendingAuthRequests.push({ resolve, reject });
            });
        }
        
        // Check max attempts
        if (_moduleState.refreshAttempts >= CONFIG.MAX_REFRESH_ATTEMPTS) {
            console.error('❌ [AUTH] Max refresh attempts reached, logging out');
            _emitEvent('token-expired', { reason: 'Max refresh attempts reached' });
            _performLogout(false);
            return false;
        }
        
        _moduleState.tokenRefreshInProgress = true;
        _moduleState.refreshAttempts++;
        console.log(`🔐 [AUTH] Starting token refresh (attempt ${_moduleState.refreshAttempts})`);
        
        try {
            const refreshTokenValue = _safeStorageGet(CONFIG.REFRESH_TOKEN_KEY);
            if (!refreshTokenValue) {
                throw new Error('No refresh token available');
            }
            
            const apiRequest = _getApiRequest();
            if (!apiRequest) {
                throw new Error('API request module not available');
            }
            
            // Use corrected endpoint path
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.REFRESH_TOKEN);
            
            const response = await apiRequest.post(endpoint, {
                refreshToken: refreshTokenValue
            }, {
                skipAuth: true, // Don't use current token for refresh request
                retryCount: 0   // Don't retry refresh requests to avoid loops
            });
            
            if (response.success && response.data?.accessToken) {
                // Store new tokens
                const expiresIn = response.data.expiresIn || CONFIG.DEFAULT_TOKEN_EXPIRY;
                setUserToken(response.data.accessToken, expiresIn);
                
                if (response.data.refreshToken) {
                    _safeStorageSet(CONFIG.REFRESH_TOKEN_KEY, response.data.refreshToken);
                }
                
                _moduleState.lastTokenRefresh = Date.now();
                _moduleState.refreshAttempts = 0; // Reset attempt counter on success
                
                // Notify listeners
                _emitEvent('session-refreshed', {
                    newToken: response.data.accessToken,
                    expiresIn: expiresIn
                });
                
                console.log('✅ [AUTH] Token refreshed successfully');
                
                // Resolve all pending requests
                _moduleState.pendingAuthRequests.forEach(({ resolve }) => resolve(true));
                _moduleState.pendingAuthRequests = [];
                
                return true;
            } else {
                throw new Error(response.data?.message || 'Token refresh failed');
            }
        } catch (error) {
            console.error('❌ [AUTH] Token refresh failed:', error);
            
            // Clear tokens on failure
            clearUserToken();
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            
            // Notify token expired
            _emitEvent('token-expired', {
                reason: error.message,
                refreshAttempts: _moduleState.refreshAttempts
            });
            
            // Reject all pending requests
            _moduleState.pendingAuthRequests.forEach(({ reject }) => reject(false));
            _moduleState.pendingAuthRequests = [];
            
            return false;
        } finally {
            _moduleState.tokenRefreshInProgress = false;
        }
    }
    
    // ============================================================================
    // PRIVATE SESSION VALIDATION
    // ============================================================================
    
    /**
     * PRIVATE: Validate current session with caching
     */
    async function validateSession() {
        // Return cached validation if recent
        if (_moduleState.sessionValidationPromise) {
            console.debug('🔐 [AUTH] Using cached session validation');
            return _moduleState.sessionValidationPromise;
        }
        
        _moduleState.sessionValidationPromise = (async () => {
            try {
                const token = getUserToken();
                if (!token) {
                    console.debug('🔐 [AUTH] No token found for validation');
                    return false;
                }
                
                // If offline, trust the token exists
                if (!_isOnline()) {
                    console.log('🔐 [AUTH] Offline mode, using cached session');
                    _emitEvent('offline-mode', { action: 'session-validation' });
                    return true;
                }
                
                const apiRequest = _getApiRequest();
                if (!apiRequest) {
                    console.warn('⚠️ [AUTH] No API request module, falling back to token existence check');
                    return !!token;
                }
                
                // Use corrected endpoint path
                const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.VALIDATE);
                
                // Perform validation request
                const response = await apiRequest.get(endpoint, null, {
                    timeout: 10000, // 10 second timeout for validation
                    retryCount: 1   // One retry for validation
                });
                
                if (response.success) {
                    console.debug('✅ [AUTH] Session validation successful');
                    return true;
                } else if (response.status === 401) {
                    console.warn('⚠️ [AUTH] Session validation failed (401 Unauthorized)');
                    
                    // Check if we have a refresh token
                    const hasRefreshToken = !!_safeStorageGet(CONFIG.REFRESH_TOKEN_KEY);
                    if (hasRefreshToken) {
                        console.log('🔐 [AUTH] Attempting token refresh after validation failure');
                        const refreshed = await refreshToken();
                        return refreshed;
                    }
                    
                    return false;
                } else {
                    // For non-401 errors, preserve session (could be server issue)
                    console.warn(`⚠️ [AUTH] Session validation returned ${response.status}, preserving session`);
                    return true;
                }
            } catch (error) {
                console.error('❌ [AUTH] Session validation error:', error);
                
                // On network errors, preserve existing session if we have a token
                const token = getUserToken();
                if (token && (error.message.includes('network') || error.message.includes('offline'))) {
                    console.log('🔐 [AUTH] Network error during validation, preserving cached session');
                    return true;
                }
                
                return false;
            }
        })();
        
        // Clear promise after cache time
        _moduleState.sessionValidationPromise.finally(() => {
            setTimeout(() => {
                _moduleState.sessionValidationPromise = null;
            }, CONFIG.VALIDATION_CACHE_TIME);
        });
        
        return _moduleState.sessionValidationPromise;
    }
    
    // ============================================================================
    // PRIVATE CROSS-TAB SYNCHRONIZATION
    // ============================================================================
    
    /**
     * PRIVATE: Initialize cross-tab synchronization
     */
    function _initCrossTabSync() {
        if (_moduleState.crossTabSyncInitialized) {
            return;
        }
        
        try {
            // Listen for storage events from other tabs
            window.addEventListener('storage', (event) => {
                // Check if this is a token-related change
                const isTokenChange = CONFIG.TOKEN_KEYS.includes(event.key) ||
                                     event.key === CONFIG.TOKEN_EXPIRY_KEY ||
                                     event.key === CONFIG.REFRESH_TOKEN_KEY;
                
                if (!isTokenChange) {
                    return;
                }
                
                console.log(`🔐 [AUTH] Storage change detected: ${event.key}`, {
                    oldValue: event.oldValue ? 'present' : 'absent',
                    newValue: event.newValue ? 'present' : 'absent',
                    url: event.url
                });
                
                // Token was cleared in another tab
                if (!event.newValue && event.oldValue && CONFIG.TOKEN_KEYS.includes(event.key)) {
                    console.log('🔐 [AUTH] Token cleared in another tab, logging out locally');
                    _emitEvent('cross-tab-logout', {
                        source: 'storage-event',
                        key: event.key
                    });
                    _performLogout(false);
                }
                
                // Token was set in another tab (login happened elsewhere)
                if (event.newValue && !event.oldValue && CONFIG.TOKEN_KEYS.includes(event.key)) {
                    console.log('🔐 [AUTH] Token set in another tab, syncing auth state');
                    window.dispatchEvent(new CustomEvent('auth-tab-sync', {
                        detail: {
                            action: 'login',
                            timestamp: Date.now(),
                            key: event.key
                        }
                    }));
                }
                
                // Auth state changed
                _emitEvent('auth-state-changed', {
                    key: event.key,
                    oldValue: event.oldValue,
                    newValue: event.newValue
                });
            });
            
            // Listen for custom cross-tab logout events
            window.addEventListener('cross-tab-logout', (event) => {
                console.log('🔐 [AUTH] Received cross-tab logout event');
                _performLogout(false);
            });
            
            // Setup periodic cross-tab sync
            _setupCrossTabHeartbeat();
            
            _moduleState.crossTabSyncInitialized = true;
            console.log('✅ [AUTH] Cross-tab synchronization initialized');
        } catch (error) {
            console.error('❌ [AUTH] Failed to initialize cross-tab sync:', error);
        }
    }
    
    /**
     * PRIVATE: Setup cross-tab heartbeat for state synchronization
     */
    function _setupCrossTabHeartbeat() {
        // Update sync timestamp every 30 seconds
        setInterval(() => {
            const authState = {
                hasToken: !!getUserToken(),
                timestamp: Date.now(),
                tabId: window._API_AUTH_V21_LOADED_.instanceId
            };
            
            _safeStorageSet(CONFIG.CROSS_TAB_SYNC_KEY, JSON.stringify(authState));
        }, 30000);
        
        // Check for other tab states every minute
        setInterval(() => {
            const syncData = _safeStorageGet(CONFIG.CROSS_TAB_SYNC_KEY);
            if (syncData) {
                try {
                    const otherTabState = JSON.parse(syncData);
                    const timeDiff = Date.now() - otherTabState.timestamp;
                    
                    // If other tab hasn't updated in 2 minutes, it might have crashed
                    if (timeDiff > 120000 && otherTabState.hasToken) {
                        console.log('🔐 [AUTH] Other tab may have crashed with active session');
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }, 60000);
    }
    
    // ============================================================================
    // PRIVATE IFRAME SYNCHRONIZATION
    // ============================================================================
    
    /**
     * PRIVATE: Initialize iframe synchronization
     */
    function _initIframeSync() {
        if (_moduleState.iframeSyncInitialized || window.self === window.top) {
            return;
        }
        
        try {
            console.log('🔐 [AUTH] Initializing iframe synchronization');
            
            // Send initial auth state to parent
            const sendAuthState = () => {
                const token = getUserToken();
                const authState = {
                    type: 'AUTH_SYNC',
                    payload: {
                        authenticated: !!token,
                        timestamp: Date.now(),
                        source: 'iframe-auth-sync',
                        version: '21.0.2',
                        iframeUrl: window.location.href
                    }
                };
                
                window.parent.postMessage(authState, '*');
                console.debug('🔐 [AUTH] Sent auth state to parent window');
            };
            
            // Send initial state
            sendAuthState();
            
            // Listen for messages from parent
            window.addEventListener('message', (event) => {
                // Basic origin validation (in production, use specific origin)
                if (event.source !== window.parent) {
                    return;
                }
                
                const data = event.data;
                if (!data || typeof data !== 'object') {
                    return;
                }
                
                switch (data.type) {
                    case 'AUTH_UPDATE':
                        console.log('🔐 [AUTH] Received auth update from parent window');
                        if (!data.payload.authenticated) {
                            _performLogout(false);
                        } else if (data.payload.token) {
                            // Parent sent a token (e.g., after login in parent)
                            setUserToken(data.payload.token, data.payload.expiresIn);
                        }
                        break;
                        
                    case 'AUTH_REQUEST':
                        // Parent is requesting current auth state
                        sendAuthState();
                        break;
                        
                    case 'AUTH_LOGOUT':
                        console.log('🔐 [AUTH] Received logout command from parent');
                        _performLogout(false);
                        break;
                }
            });
            
            // Also send auth state on visibility change
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    setTimeout(sendAuthState, 100);
                }
            });
            
            _moduleState.iframeSyncInitialized = true;
            console.log('✅ [AUTH] Iframe synchronization initialized');
        } catch (error) {
            console.error('❌ [AUTH] Failed to initialize iframe sync:', error);
        }
    }
    
    // ============================================================================
    // PRIVATE LOGOUT HANDLER
    // ============================================================================
    
    /**
     * PRIVATE: Perform logout with cleanup
     */
    function _performLogout(notifyUI = true) {
        console.log('🔐 [AUTH] Performing logout', { notifyUI });
        
        try {
            // Clear tokens first
            clearUserToken();
            _safeStorageRemove(CONFIG.REFRESH_TOKEN_KEY);
            
            // Clear all user data storage locations
            CONFIG.USER_DATA_KEYS.forEach(key => {
                _safeStorageRemove(key);
            });
            
            // Clear global user reference
            window.currentUser = null;
            
            // Clear legacy storage
            _safeStorageRemove('authUser');
            _safeStorageRemove('moodchat_auth_user');
            _safeStorageRemove('userData');
            
            // Reset module state
            _moduleState.refreshAttempts = 0;
            _moduleState.sessionValidationPromise = null;
            _moduleState.pendingAuthRequests = [];
            
            // Notify other tabs if requested
            if (notifyUI) {
                try {
                    // Use a short-lived storage item to trigger cross-tab logout
                    _safeStorageSet(CONFIG.CROSS_TAB_LOGOUT_TRIGGER, Date.now().toString());
                    setTimeout(() => {
                        _safeStorageRemove(CONFIG.CROSS_TAB_LOGOUT_TRIGGER);
                    }, 100);
                    
                    // Dispatch global logout event
                    window.dispatchEvent(new CustomEvent('user-logged-out', {
                        detail: {
                            timestamp: new Date().toISOString(),
                            source: 'api.auth.js',
                            version: '21.0.2',
                            manualLogout: notifyUI
                        }
                    }));
                    
                    console.log('🔐 [AUTH] Dispatched user-logged-out event');
                } catch (e) {
                    console.log('🔐 [AUTH] Could not set cross-tab trigger:', e.message);
                }
            }
            
            // Emit internal logout event
            _emitEvent('logout', { notifyUI });
            _emitEvent('auth-state-changed', { action: 'logout', notifyUI });
            
            console.log('✅ [AUTH] Logout completed successfully');
            return true;
        } catch (error) {
            console.error('❌ [AUTH] Error during logout:', error);
            return false;
        }
    }
    
    // ============================================================================
    // PUBLIC API FUNCTIONS (ENHANCED WITH IDENTIFIER FIELD FIX)
    // ============================================================================
    
    /**
     * PUBLIC: Login with credentials (FIXED: Now uses identifier field)
     */
    async function login(...args) {
        console.log('🔐 [AUTH] Login attempt with identifier field normalization');
        
        try {
            // Normalize payload from various formats
            const normalized = _normalizeLoginPayload(args);
            console.log('🔧 [AUTH] Normalized login data:', normalized);
            
            // Validate normalized payload
            const validation = _validateLoginPayload(normalized);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    code: validation.code
                };
            }
            
            const payload = validation.payload;
            console.log('🔧 [AUTH] Final login payload (with identifier field):', payload);
            
            const apiRequest = _getApiRequest();
            if (!apiRequest) {
                return {
                    success: false,
                    error: 'API request module not available',
                    code: 'MODULE_ERROR'
                };
            }
            
            // Use corrected endpoint path
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.LOGIN);
            
            // Make login request with identifier field
            const response = await apiRequest.post(endpoint, payload, {
                skipAuth: true // Don't use existing token for login
            });
            
            if (response.success && response.data?.accessToken) {
                // Store tokens
                const expiresIn = response.data.expiresIn || CONFIG.DEFAULT_TOKEN_EXPIRY;
                setUserToken(response.data.accessToken, expiresIn);
                
                if (response.data.refreshToken) {
                    _safeStorageSet(CONFIG.REFRESH_TOKEN_KEY, response.data.refreshToken);
                }
                
                // Store user data
                if (response.data.user) {
                    const userData = JSON.stringify(response.data.user);
                    _safeStorageSet('USER_DATA', userData);
                    window.currentUser = response.data.user;
                }
                
                // Initialize synchronization
                _initCrossTabSync();
                _initIframeSync();
                
                // Dispatch login event
                _emitEvent('login', {
                    user: response.data.user,
                    timestamp: new Date().toISOString(),
                    payloadType: args.length > 1 ? 'legacy-args' : 'object',
                    backendPayload: payload // Log what was sent to backend
                });
                
                window.dispatchEvent(new CustomEvent('user-logged-in', {
                    detail: {
                        user: response.data.user,
                        timestamp: new Date().toISOString(),
                        source: 'api.auth.js',
                        version: '21.0.2',
                        payloadType: args.length > 1 ? 'legacy-args' : 'object'
                    }
                }));
                
                console.log('✅ [AUTH] Login successful with identifier field');
                
                return {
                    success: true,
                    user: response.data.user,
                    token: response.data.accessToken,
                    expiresIn: expiresIn,
                    payloadType: args.length > 1 ? 'legacy-args' : 'object',
                    identifierUsed: normalized.identifier // Debug info
                };
            } else {
                return {
                    success: false,
                    error: response.data?.message || 'Login failed',
                    code: response.status === 401 ? 'INVALID_CREDENTIALS' : 'LOGIN_FAILED',
                    status: response.status,
                    payload: payload,
                    backendExpects: 'identifier field',
                    whatWasSent: payload
                };
            }
        } catch (error) {
            console.error('❌ [AUTH] Login error:', error);
            return {
                success: false,
                error: error.message || 'Login failed',
                code: 'NETWORK_ERROR',
                args: args
            };
        }
    }
    
    /**
     * PUBLIC: Register new user (UNCHANGED - works with current backend)
     */
    async function register(...args) {
        console.log('🔐 [AUTH] Registration attempt with normalization');
        
        try {
            // Normalize payload from various formats
            const normalized = _normalizeRegisterPayload(args);
            console.log('🔧 [AUTH] Normalized registration data:', normalized);
            
            // Validate normalized payload
            const validation = _validateRegisterPayload(normalized);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    code: validation.code
                };
            }
            
            const payload = validation.payload;
            console.log('🔧 [AUTH] Final registration payload:', payload);
            
            const apiRequest = _getApiRequest();
            if (!apiRequest) {
                return {
                    success: false,
                    error: 'API request module not available',
                    code: 'MODULE_ERROR'
                };
            }
            
            // Use corrected endpoint path
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.REGISTER);
            
            // Make registration request
            const response = await apiRequest.post(endpoint, payload, {
                skipAuth: true
            });
            
            if (response.success && response.data?.accessToken) {
                // Store tokens
                const expiresIn = response.data.expiresIn || CONFIG.DEFAULT_TOKEN_EXPIRY;
                setUserToken(response.data.accessToken, expiresIn);
                
                if (response.data.refreshToken) {
                    _safeStorageSet(CONFIG.REFRESH_TOKEN_KEY, response.data.refreshToken);
                }
                
                // Store user data
                if (response.data.user) {
                    const userData = JSON.stringify(response.data.user);
                    _safeStorageSet('USER_DATA', userData);
                    window.currentUser = response.data.user;
                }
                
                // Initialize synchronization
                _initCrossTabSync();
                _initIframeSync();
                
                // Dispatch registration event
                _emitEvent('registration-complete', {
                    user: response.data.user,
                    timestamp: new Date().toISOString(),
                    payloadType: args.length > 1 ? 'legacy-args' : 'object'
                });
                
                window.dispatchEvent(new CustomEvent('user-registered', {
                    detail: {
                        user: response.data.user,
                        timestamp: new Date().toISOString(),
                        source: 'api.auth.js',
                        version: '21.0.2',
                        payloadType: args.length > 1 ? 'legacy-args' : 'object'
                    }
                }));
                
                console.log('✅ [AUTH] Registration successful with normalized payload');
                
                return {
                    success: true,
                    user: response.data.user,
                    token: response.data.accessToken,
                    expiresIn: expiresIn,
                    payloadType: args.length > 1 ? 'legacy-args' : 'object'
                };
            } else {
                return {
                    success: false,
                    error: response.data?.message || 'Registration failed',
                    code: response.status === 409 ? 'USER_EXISTS' : 'REGISTRATION_FAILED',
                    status: response.status,
                    payload: payload
                };
            }
        } catch (error) {
            console.error('❌ [AUTH] Registration error:', error);
            return {
                success: false,
                error: error.message || 'Registration failed',
                code: 'NETWORK_ERROR',
                args: args
            };
        }
    }
    
    /**
     * PUBLIC: Logout current user
     */
    async function logout() {
        console.log('🔐 [AUTH] Logout requested');
        
        try {
            // Call logout endpoint if online
            if (_isOnline()) {
                const apiRequest = _getApiRequest();
                if (apiRequest) {
                    // Use corrected endpoint path
                    const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.LOGOUT);
                    
                    await apiRequest.post(endpoint, {}, {
                        timeout: 5000 // Short timeout for logout
                    }).catch(error => {
                        // Log but don't fail on logout API errors
                        console.warn('⚠️ [AUTH] Logout API call failed, continuing with local logout:', error.message);
                    });
                }
            }
            
            // Perform local logout
            _performLogout(true);
            
            return {
                success: true,
                message: 'Logged out successfully'
            };
        } catch (error) {
            console.error('❌ [AUTH] Logout error:', error);
            // Still perform local logout even if API call fails
            _performLogout(true);
            return {
                success: true,
                message: 'Logged out locally (API call failed)'
            };
        }
    }
    
    /**
     * PUBLIC: Request password reset email (ENHANCED with payload normalization)
     */
    async function forgotPassword(...args) {
        console.log('🔐 [AUTH] Forgot password request with normalization');
        
        try {
            // Normalize payload
            const email = _normalizeForgotPasswordPayload(args);
            console.log('🔧 [AUTH] Normalized email:', email);
            
            if (!email || typeof email !== 'string' || !email.includes('@')) {
                return {
                    success: false,
                    error: 'Valid email is required',
                    code: 'VALIDATION_ERROR'
                };
            }
            
            const apiRequest = _getApiRequest();
            if (!apiRequest) {
                return {
                    success: false,
                    error: 'API request module not available',
                    code: 'MODULE_ERROR'
                };
            }
            
            // Use corrected endpoint path
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.FORGOT_PASSWORD);
            
            const response = await apiRequest.post(endpoint, {
                email: email.trim()
            }, {
                skipAuth: true
            });
            
            // Always return success for security (don't reveal if email exists)
            return {
                success: response.success,
                message: 'If an account exists with this email, a reset link has been sent',
                status: response.status,
                email: email
            };
        } catch (error) {
            console.error('❌ [AUTH] Forgot password error:', error);
            return {
                success: false,
                error: 'Failed to process reset request',
                code: 'NETWORK_ERROR',
                args: args
            };
        }
    }
    
    /**
     * PUBLIC: Reset password with token (ENHANCED with payload normalization)
     */
    async function resetPassword(...args) {
        console.log('🔐 [AUTH] Reset password request with normalization');
        
        try {
            // Normalize payload
            const normalized = _normalizeResetPasswordPayload(args);
            console.log('🔧 [AUTH] Normalized reset data:', normalized);
            
            const { token, newPassword } = normalized;
            
            if (!token || !newPassword) {
                return {
                    success: false,
                    error: 'Token and new password are required',
                    code: 'VALIDATION_ERROR'
                };
            }
            
            if (newPassword.length < 8) {
                return {
                    success: false,
                    error: 'Password must be at least 8 characters',
                    code: 'PASSWORD_TOO_SHORT'
                };
            }
            
            const apiRequest = _getApiRequest();
            if (!apiRequest) {
                return {
                    success: false,
                    error: 'API request module not available',
                    code: 'MODULE_ERROR'
                };
            }
            
            // Use corrected endpoint path
            const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.RESET_PASSWORD);
            
            const response = await apiRequest.post(endpoint, {
                token,
                newPassword
            }, {
                skipAuth: true
            });
            
            return {
                success: response.success,
                message: response.data?.message || (response.success ? 'Password reset successful' : 'Password reset failed'),
                status: response.status,
                tokenPresent: !!token,
                passwordLength: newPassword.length
            };
        } catch (error) {
            console.error('❌ [AUTH] Reset password error:', error);
            return {
                success: false,
                error: 'Password reset failed',
                code: 'NETWORK_ERROR',
                args: args
            };
        }
    }
    
    /**
     * PUBLIC: Attempt auto-login with stored tokens
     */
    async function autoLogin() {
        console.log('🔐 [AUTH] Auto-login attempt');
        
        try {
            const token = getUserToken();
            if (!token) {
                return {
                    success: false,
                    error: 'No stored token found',
                    code: 'NO_TOKEN'
                };
            }
            
            // Check token expiry
            const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
            if (expiry && Date.now() > parseInt(expiry, 10)) {
                console.log('🔐 [AUTH] Token expired, attempting refresh');
                const refreshed = await refreshToken();
                if (!refreshed) {
                    return {
                        success: false,
                        error: 'Token expired and refresh failed',
                        code: 'TOKEN_EXPIRED'
                    };
                }
            }
            
            // Validate session (with offline support)
            const isValid = await validateSession();
            if (!isValid) {
                return {
                    success: false,
                    error: 'Session validation failed',
                    code: 'SESSION_INVALID'
                };
            }
            
            // Load user data
            const userData = await getCurrentUser();
            if (!userData) {
                console.warn('⚠️ [AUTH] Could not load user data, but token is valid');
                // Still return success if token is valid
                return {
                    success: true,
                    user: null,
                    token: getUserToken(),
                    message: 'Auto-login successful (no user data)'
                };
            }
            
            // Initialize cross-tab sync
            _initCrossTabSync();
            _initIframeSync();
            
            console.log('✅ [AUTH] Auto-login successful');
            
            return {
                success: true,
                user: userData,
                token: getUserToken()
            };
        } catch (error) {
            console.error('❌ [AUTH] Auto-login error:', error);
            return {
                success: false,
                error: error.message || 'Auto-login failed',
                code: 'AUTO_LOGIN_FAILED'
            };
        }
    }
    
    /**
     * PUBLIC: Get current authenticated user
     */
    async function getCurrentUser() {
        try {
            // Check if we have cached user
            if (window.currentUser && typeof window.currentUser === 'object') {
                return window.currentUser;
            }
            
            // Try to load from storage
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
                        console.warn(`⚠️ [AUTH] Error parsing user data from ${key}:`, e);
                        _safeStorageRemove(key);
                    }
                }
            }
            
            // If we have a token but no user data, fetch from server (online only)
            const token = getUserToken();
            if (token && _isOnline()) {
                const apiRequest = _getApiRequest();
                if (apiRequest) {
                    // Use corrected endpoint path
                    const endpoint = _getApiEndpoint(CONFIG.API_ENDPOINTS.GET_USER);
                    
                    const response = await apiRequest.get(endpoint);
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
            console.error('❌ [AUTH] Error getting current user:', error);
            return null;
        }
    }
    
    /**
     * PUBLIC: Get user - alias for getCurrentUser (MANDATORY FOR COMPATIBILITY)
     */
    async function getUser() {
        console.log('🔐 [AUTH] getUser() called (alias for getCurrentUser)');
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
        
        // If offline, trust the token exists
        if (!_isOnline()) {
            console.debug('🔐 [AUTH] Offline mode, using cached authentication');
            return true;
        }
        
        // Otherwise validate the session
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
            ready: _moduleState.initialized && _moduleState.bootstrapComplete,
            payloadNormalization: {
                login: 'identifier_field',
                register: 'enhanced',
                forgotPassword: 'enhanced',
                resetPassword: 'enhanced'
            },
            version: '21.0.2',
            endpointPrefix: _moduleState.endpointPrefix
        };
    }
    
    /**
     * PUBLIC: Wait for auth module to be ready
     */
    async function waitForReady() {
        if (_moduleState.initialized && _moduleState.bootstrapComplete) {
            return Promise.resolve(true);
        }
        
        return new Promise((resolve) => {
            _moduleState.readyCallbacks.push(() => {
                resolve(true);
            });
        });
    }
    
    // ============================================================================
    // MODULE INITIALIZATION
    // ============================================================================
    
    /**
     * Initialize the authentication module
     */
    async function _initializeAuthModule() {
        if (_moduleState.initialized) {
            console.warn('⚠️ [API-AUTH] Module already initialized');
            return;
        }
        
        console.log('🔐 [API-AUTH] Initializing authentication module v21.0.2...');
        
        try {
            // Update lifecycle state
            _moduleState.lifecycleState = 'initializing';
            
            // Wait for dependencies
            await _waitForDependencies();
            
            // Initialize cross-tab sync
            _initCrossTabSync();
            
            // Initialize iframe sync (if in iframe)
            _initIframeSync();
            
            // Set up token expiry monitoring
            const expiryCheckInterval = setInterval(() => {
                const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
                if (expiry) {
                    const timeUntilExpiry = parseInt(expiry, 10) - Date.now();
                    
                    if (timeUntilExpiry < CONFIG.TOKEN_REFRESH_BUFFER && timeUntilExpiry > 0) {
                        console.log(`🔐 [AUTH] Token expiring in ${Math.round(timeUntilExpiry/1000)}s, refreshing...`);
                        refreshToken().catch(error => {
                            console.warn('⚠️ [AUTH] Background token refresh failed:', error.message);
                        });
                    } else if (timeUntilExpiry <= 0) {
                        console.warn('⚠️ [AUTH] Token expired, clearing');
                        clearUserToken();
                    }
                }
            }, 30000); // Check every 30 seconds
            
            // Store interval ID for cleanup
            window._API_AUTH_INTERVALS = window._API_AUTH_INTERVALS || [];
            window._API_AUTH_INTERVALS.push(expiryCheckInterval);
            
            // Setup visibility change handler for token refresh
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && _isOnline()) {
                    // Check token when tab becomes visible
                    const expiry = _safeStorageGet(CONFIG.TOKEN_EXPIRY_KEY);
                    if (expiry && Date.now() > parseInt(expiry, 10) - 300000) { // 5 minutes before expiry
                        console.log('🔐 [AUTH] Tab visible, checking token...');
                        refreshToken().catch(() => {
                            // Silent fail
                        });
                    }
                }
            });
            
            // Mark as initialized
            _moduleState.initialized = true;
            _moduleState.lifecycleState = 'initialized';
            _emitEvent('initialized', { timestamp: Date.now() });
            
            console.log('✅ [API-AUTH] Authentication module initialized');
            
            // Attempt auto-login if token exists
            const token = getUserToken();
            if (token) {
                console.log('🔐 [API-AUTH] Token found, attempting auto-login');
                setTimeout(async () => {
                    try {
                        const result = await autoLogin();
                        if (result.success) {
                            console.log('✅ [API-AUTH] Auto-login successful');
                        } else {
                            console.warn('⚠️ [API-AUTH] Auto-login failed:', result.error);
                        }
                    } catch (error) {
                        console.warn('⚠️ [API-AUTH] Auto-login failed with error:', error);
                    }
                }, 1000);
            }
            
            return true;
        } catch (error) {
            console.error('❌ [API-AUTH] Failed to initialize auth module:', error);
            _moduleState.lifecycleState = 'error';
            _emitEvent('error', { error: error.message, stage: 'initialization' });
            return false;
        }
    }
    
    // ============================================================================
    // PUBLIC API EXPOSURE & BACKWARD COMPATIBILITY
    // ============================================================================
    
    /**
     * Setup and expose the public API
     */
    async function _setupPublicAPI() {
        console.log('🔧 [AUTH] Setting up public API...');
        
        // Create public API object with ALL required methods
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
            getUser,           // CRITICAL: Alias for compatibility
            refreshSession,
            isAuthenticated,
            getAuthState,
            
            // Session utilities
            waitForReady,
            
            // Event system
            on: _addEventListener,
            
            // Utility
            getVersion: () => '21.0.2',
            
            // Configuration
            setEndpointPrefix: (prefix) => {
                if (prefix && typeof prefix === 'string') {
                    _moduleState.endpointPrefix = prefix;
                    console.log(`🔐 [AUTH] API endpoint prefix updated to: ${prefix}`);
                    return true;
                }
                return false;
            }
        };
        
        // Initialize window.api.auth with merge strategy
        if (!window.api) {
            window.api = {};
        }
        
        if (!window.api.auth) {
            window.api.auth = publicApi;
            console.log('✅ [AUTH] Created new window.api.auth');
        } else {
            console.warn('⚠️ [API-AUTH] window.api.auth already exists, merging new functions');
            
            // Merge without overriding existing methods
            Object.keys(publicApi).forEach(key => {
                if (!window.api.auth[key]) {
                    window.api.auth[key] = publicApi[key];
                    console.log(`🔧 [AUTH] Added ${key} to window.api.auth`);
                } else {
                    console.warn(`⚠️ [API-AUTH] Skipping ${key} - already exists in window.api.auth`);
                }
            });
        }
        
        // Set metadata fields on the auth object
        _setMetadataFields(window.api.auth);
        
        // Register legacy APIs
        _registerLegacyAPIs(publicApi);
        
        // Mark bootstrap as complete
        _markBootstrapComplete();
        
        // Fire ready event with enhanced details
        setTimeout(() => {
            const authState = {
                hasToken: !!getUserToken(),
                version: "21.0.2",
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
                registerBackendFormat: 'email, username, password, confirmPassword, name, avatar'
            };
            
            window.dispatchEvent(new CustomEvent("api-auth-ready", {
                detail: authState
            }));
            
            console.log("✅ api.auth.js v21.0.2 initialized with identifier field fix", authState);
        }, 100);
        
        return window.api.auth;
    }
    
    // ============================================================================
    // BOOTSTRAP & MAIN ENTRY POINT
    // ============================================================================
    
    /**
     * Main bootstrap function
     */
    async function _bootstrap() {
        try {
            console.log('🚀 [AUTH] Bootstrap started with identifier field fix');
            window._API_AUTH_V21_LOADED_.loadingStage = 'bootstrap_started';
            
            // Initial dependency check
            _checkDependencies();
            
            // Initialize the module
            await _initializeAuthModule();
            
            // Setup public API
            const authApi = await _setupPublicAPI();
            
            // Auto-login on load if token exists
            window.addEventListener('load', () => {
                setTimeout(async () => {
                    const token = getUserToken();
                    if (token && !window.currentUser) {
                        console.log('🔐 [AUTH] Attempting auto-login on page load');
                        try {
                            const result = await autoLogin();
                            if (result.success) {
                                console.log('✅ [AUTH] Auto-login on load successful');
                            } else {
                                console.warn('⚠️ [AUTH] Auto-login on load failed:', result.error);
                            }
                        } catch (error) {
                            console.warn('⚠️ [AUTH] Auto-login on load failed with error:', error);
                        }
                    }
                }, 1500); // Delay to allow other modules to load
            });
            
            // Handle module cleanup on page unload
            window.addEventListener('beforeunload', () => {
                // Cleanup intervals
                if (window._API_AUTH_INTERVALS) {
                    window._API_AUTH_INTERVALS.forEach(intervalId => {
                        clearInterval(intervalId);
                    });
                    window._API_AUTH_INTERVALS = [];
                }
            });
            
            // Global error handler for auth module
            window.addEventListener('error', (event) => {
                if ((event.message && event.message.includes('auth')) || 
                    (event.filename && event.filename.includes('auth'))) {
                    console.error('❌ [API-AUTH] Global error in auth module:', event);
                    _emitEvent('error', { 
                        error: event.message,
                        filename: event.filename,
                        lineno: event.lineno,
                        colno: event.colno 
                    });
                }
            });
            
            window._API_AUTH_V21_LOADED_.loadingStage = 'bootstrap_complete';
            console.log('🚀 [AUTH] Bootstrap completed successfully with identifier field fix');
            
            return authApi;
        } catch (error) {
            console.error('❌ [AUTH] Bootstrap failed:', error);
            window._API_AUTH_V21_LOADED_.loadingStage = 'bootstrap_failed';
            _moduleState.lifecycleState = 'error';
            
            // Still try to expose basic API for error recovery
            try {
                if (!window.api) window.api = {};
                if (!window.api.auth) window.api.auth = {};
                _setMetadataFields(window.api.auth);
            } catch (e) {
                console.error('❌ [AUTH] Failed to setup error recovery API:', e);
            }
            
            throw error;
        }
    }
    
    // Start the bootstrap process
    // Use setTimeout to allow other scripts to load
    setTimeout(() => {
        _bootstrap().catch(error => {
            console.error('❌ [AUTH] Critical bootstrap error:', error);
        });
    }, 0);
    
})(); // End of IIFE

console.log('✅ [API-AUTH] Modular authentication service v21.0.2 loaded with identifier field fix (IIFE Protected)');