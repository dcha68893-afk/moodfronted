// api.request.js - Enhanced API Request Methods with Centralized Token Handling
// Version: 20.5.7 - Part 3 of 3: Request Methods - HARDENED ROUTING & FETCH WHITELISTING
// Date: 2024-01-15
// 🔧 CRITICAL FIX: Fixed duplicate /api prefix issue
// 🔧 CRITICAL FIX: Proper JSON payload serialization for all methods
// 🔧 CRITICAL FIX: Full URL detection and pass-through
// 🔧 CRITICAL FIX: Auth payload normalization for login/register
// 🔧 CRITICAL FIX: Enhanced endpoint normalization to prevent double /api/api
// 🔧 NEW: Allow HEAD requests from app.core.ui.js and bootstrap
// 🔧 NEW: Whitelist resource existence checks
// 🔒 SAFETY: Preserve blocking for unauthorized POST/PUT
// 🔒 SAFETY: Prevent recursion loops
// 🔥 HARDENED: Enhanced fetch whitelisting for internal modules
// 🔥 FIXED: Prevent false "DIRECT FETCH BLOCKED" errors for trusted modules
// 🔥 IMPROVED: Resource check detection with proper origin tracking
// 🔧 UPDATED: Fixed auth/session handling - wait for __SESSION_READY__ before protected calls

// 🔥 HARDENED UPDATE: Centralized HTTP Gateway for Multi-Iframe Web Application
// 🔥 CORE: Single request authority - ALL network calls MUST route here
// 🔥 FIXED: Eliminated hardcoded localhost origins
// 🔥 FIXED: Eliminated duplicate /api/api paths
// 🔥 FIXED: Eliminated infinite retry loops
// 🔥 FIXED: Eliminated uncontrolled polling
// 🔥 FIXED: Eliminated repeated 404 spam
// 🔥 FIXED: Eliminated race conditions with auth/session
// 🔥 FIXED: Eliminated premature fetch before bootstrap
// 🔒 SECURITY: Block direct fetch() calls elsewhere
// 🔧 FIXED: Added safe response parser to handle non-JSON responses

// Wrap in IIFE to prevent global scope pollution
(function() {
    // Prevent duplicate loading
    if (window._API_REQUEST_LOADED_) {
        console.log("[API] ⏳ api.request.js already loaded, skipping");
        return;
    }
    
    console.log("[API] ✅ api.request.js loaded with normalization fixes and safety guards");
    
    // Mark as loaded
    window._API_REQUEST_LOADED_ = true;
    
    // Trusted request marker to prevent fetch blocking loops
    const TRUSTED_REQUEST_MARKER = Symbol.for('api-trusted-request');
    
    // 🔥 GATEWAY STATE - HARDENED CENTRALIZED CONTROL
    const _gatewayState = {
        // 🔥 DEPENDENCY GATES
        gates: {
            authReady: false,
            sessionReady: false,
            bootstrapReady: false,
            backendResolved: false,
            apiReady: false
        },
        
        // 🔥 DYNAMIC BACKEND RESOLUTION - NO HARCODED ORIGINS
        backend: {
            origin: null,
            baseUrl: null,
            resolved: false,
            lastResolved: null,
            detectionAttempts: 0,
            maxDetectionAttempts: 3
        },
        
        // 🔥 REQUEST QUEUE
        queue: {
            requests: [],
            isFlushing: false,
            maxQueueSize: 50,
            queueStartTime: null
        },
        
        // 🔥 DEDUPLICATION LAYER
        deduplication: {
            activeRequests: new Map(),
            requestHistory: new Map(),
            maxHistorySize: 100,
            dedupeWindow: 1000
        },
        
        // 🔥 REQUEST CONTROLLER
        controller: {
            activeControllers: new Map(),
            requestTimeouts: new Map(),
            defaultTimeout: 15000, // 🔥 15s default timeout
            maxConcurrent: 10
        },
        
        // 🔥 RETRY CONTROLLER - MAX 1 RETRY FOR NETWORK ERROR, NO RETRY ON 4XX
        retry: {
            maxRetries: 1,
            retryDelay: 1000,
            noRetryStatusCodes: [400, 401, 403, 404, 422, 429],
            networkErrorRetryOnly: true
        },
        
        // 🔥 UNIFIED ERROR HANDLER
        errorHandler: {
            lastError: null,
            errorCount: 0,
            maxErrorsBeforePause: 10,
            errorWindowMs: 60000,
            isPaused: false
        },
        
        // 🔥 LOGGING CONTROL
        logging: {
            enabled: true,
            prefix: "[API]",
            loggedRequests: new Set(),
            duplicateLogThreshold: 5000,
            lastLogTimes: new Map()
        },
        
        // 🔥 INITIALIZATION FLOW STATE
        initialization: {
            started: false,
            completed: false,
            steps: {
                bootstrapWaited: false,
                backendResolved: false,
                authHooksRegistered: false,
                queueActivated: false,
                readyEmitted: false
            }
        },
        
        // 🔥 TRUSTED REQUEST TRACKING - HARDENED WHITELIST
        trustedRequests: {
            active: new WeakSet(),
            // Enhanced patterns for internal modules and resource checks
            patterns: [
                // Health check endpoints
                '/health', '/status', '/ping',
                // Resource loading
                '.css', '.js', '.json', '.svg', '.png', '.jpg', '.gif',
                // Common framework requests
                '/favicon.ico', '/manifest.json', '/robots.txt',
                // Development endpoints
                '/hot-update', '/__webpack_hmr', '/sockjs-node',
                // Resource existence checks - EXTENDED
                '/exists', '/check', '/validate', '/verify', '/test',
                '/resource-check', '/file-exists', '/asset-exists',
                // Module loading patterns
                '/modules/', '/components/', '/assets/',
                // Internal API patterns
                '/internal/', '/private/', '/_api/',
                // Auth callback patterns (OAuth, etc.)
                '/callback', '/redirect', '/oauth'
            ],
            // 🔥 NEW: Module whitelist - known internal modules that can use fetch
            trustedModules: [
                'app.core.ui.js',
                'app.bootstrap.js',
                'api.core.js',
                'api.auth.js',
                'router.js',
                'iframe.js',
                'message.js',
                'friend.js',
                'group.js',
                'status.js',
                'calls.js',
                'settings.js',
                'tools.js'
            ],
            // 🔥 NEW: Caller signature cache
            callerCache: new Map(),
            callerCacheMaxSize: 50
        }
    };
    
    // Private scope variables and functions
    let _secureApiFetch;
    let _getValidToken;
    let _isPublicEndpoint;
    let _isStatusEndpoint;
    let _isAuthEndpoint;
    let _getUserToken;
    let _apiCache;
    let _apiRequestQueue;
    let _BACKEND_BASE_URL;
    let _BASE_API_URL;
    
    // Auth functions
    let _validateAuth;
    
    // Safety tracking
    const _safetyState = {
        errorCounts: new Map(),
        maxErrorsPerEndpoint: 3,
        retryAttempts: new Map(),
        maxRetriesPerRequest: 3,
        activeRequests: new Set(),
        maxConcurrentRequests: 10,
        lastErrorLogs: new Map(),
        errorLogInterval: 5000
    };
    
    // Internal state
    const _requestState = {
        initialized: false,
        retryAttempts: {},
        maxRetries: 3,
        retryDelay: 1000,
        activeRequests: new Map(),
        requestTimeout: 30000
    };
    
    // ============================================================================
    // 🔧 SAFE RESPONSE PARSER - FIXED TO HANDLE NON-JSON RESPONSES
    // ============================================================================
    
    /**
     * 🔧 Safely parse response, handling empty responses and non-JSON content
     * @param {Response} response - Fetch Response object
     * @returns {Promise<Object>} Parsed data or fallback object
     */
    async function safeParseResponse(response) {
        try {
            const text = await response.text();
            
            // Handle empty response (204 No Content, etc.)
            if (!text || text.trim() === '') {
                return null;
            }
            
            // Try to parse as JSON
            try {
                return JSON.parse(text);
            } catch (jsonError) {
                // Not JSON - return raw text with parse error indicator
                return {
                    success: false,
                    raw: text,
                    parseError: true,
                    message: 'Response is not valid JSON'
                };
            }
        } catch (textError) {
            // Failed to get text - network error or response already consumed
            return {
                success: false,
                error: textError.message,
                parseError: true,
                message: 'Failed to read response'
            };
        }
    }
    
    /**
     * 🔧 Create a structured error response for non-OK responses
     * @param {Response} response - Fetch Response object
     * @param {Object} parsedData - Parsed data from safeParseResponse
     * @returns {Object} Structured error object
     */
    function createErrorResponse(response, parsedData) {
        const errorResponse = {
            ok: false,
            success: false,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            url: response.url
        };
        
        if (parsedData && typeof parsedData === 'object') {
            // If parsed data exists, merge it
            Object.assign(errorResponse, parsedData);
            
            // Extract message from common locations
            if (parsedData.message) {
                errorResponse.message = parsedData.message;
            } else if (parsedData.error) {
                errorResponse.message = parsedData.error;
            } else if (parsedData.raw) {
                errorResponse.message = parsedData.raw;
            }
        } else if (parsedData && typeof parsedData === 'string') {
            errorResponse.message = parsedData;
            errorResponse.raw = parsedData;
        } else {
            errorResponse.message = response.statusText || 'Request failed';
        }
        
        // Add error classification
        if (response.status === 401) {
            errorResponse.isAuthError = true;
        } else if (response.status === 403) {
            errorResponse.isForbidden = true;
        } else if (response.status === 429) {
            errorResponse.isRateLimited = true;
        } else if (response.status >= 500) {
            errorResponse.isServerError = true;
        }
        
        return errorResponse;
    }
    
    // ============================================================================
    // 🔧 PUBLIC ENDPOINT PATTERNS - MUST BYPASS AUTH
    // ============================================================================
    
    const PUBLIC_ENDPOINT_PATTERNS = [
        '/auth/login',
        '/auth/register',
        '/auth/forgot-password',
        '/auth/reset-password',
        '/auth/verify-email',
        '/auth/resend-verification',
        '/auth/refresh-token',
        '/auth/logout',
        '/health',
        '/status',
        '/ping'
    ];
    
    /**
     * 🔧 Check if endpoint is public (should bypass auth)
     */
    function isPublicEndpoint(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') {
            return false;
        }
        
        const normalized = endpoint.toLowerCase();
        
        // Check exact matches
        for (const pattern of PUBLIC_ENDPOINT_PATTERNS) {
            if (normalized === pattern || normalized === pattern + '/') {
                return true;
            }
        }
        
        // Check if endpoint contains auth patterns
        if (normalized.includes('/auth/') || 
            normalized.includes('/public/') ||
            normalized.includes('/health') ||
            normalized.includes('/status')) {
            
            // Ensure it's not a protected auth endpoint
            const protectedAuthPatterns = [
                '/auth/user',
                '/auth/profile',
                '/auth/change-password',
                '/auth/update'
            ];
            
            for (const pattern of protectedAuthPatterns) {
                if (normalized.includes(pattern)) {
                    return false;
                }
            }
            
            return true;
        }
        
        return false;
    }
    
    // ============================================================================
    // 🔧 SESSION READY CHECK
    // ============================================================================
    
    /**
     * 🔧 Check if session is ready for protected calls
     */
    function isSessionReady() {
        return window.__SESSION_READY__ === true || 
               window.__API_AUTH?.isSessionReady === true ||
               _gatewayState.gates.sessionReady === true;
    }
    
    /**
     * 🔧 Wait for session to be ready
     */
    function waitForSessionReady() {
        return new Promise((resolve) => {
            const maxWaitTime = 10000; // 10 seconds max wait
            
            const checkSession = () => {
                if (isSessionReady()) {
                    _gatewayState.gates.sessionReady = true;
                    console.log("[API] ✅ Session ready");
                    resolve(true);
                    return;
                }
                
                if (_gatewayState.initialization.started && 
                    Date.now() - _gatewayState.initialization.started > maxWaitTime) {
                    console.warn("[API] ⏳ Session ready timeout, proceeding anyway");
                    _gatewayState.gates.sessionReady = true;
                    resolve(true);
                    return;
                }
                
                setTimeout(checkSession, 100);
            };
            
            checkSession();
        });
    }
    
    // ============================================================================
    // 🔥 CORE INITIALIZATION - HARDENED GATEWAY
    // ============================================================================
    
    /**
     * 🔥 WAIT FOR BOOTSTRAP - DO NOT SEND REQUESTS UNTIL BOOTSTRAP COMPLETE
     */
    function waitForBootstrap() {
        return new Promise((resolve) => {
            const maxWaitTime = 30000;
            
            const checkBootstrap = () => {
                const isBootstrapComplete = 
                    (window.AppState && window.AppState.bootstrapComplete) ||
                    (window.__APP_BOOTSTRAP_COMPLETE__) ||
                    (document.readyState === 'complete' && window._API_CORE_LOADED_);
                
                if (isBootstrapComplete) {
                    _gatewayState.gates.bootstrapReady = true;
                    _gatewayState.initialization.steps.bootstrapWaited = true;
                    console.log("[API] ✅ Bootstrap ready");
                    resolve(true);
                    return;
                }
                
                if (_gatewayState.initialization.started && 
                    Date.now() - _gatewayState.initialization.started > maxWaitTime) {
                    console.warn("[API] ⏳ Bootstrap timeout, proceeding anyway");
                    _gatewayState.gates.bootstrapReady = true;
                    resolve(true);
                    return;
                }
                
                setTimeout(checkBootstrap, 100);
            };
            
            checkBootstrap();
        });
    }
    
    /**
     * 🔥 DYNAMIC BACKEND RESOLUTION - DETECT ORIGIN AT RUNTIME
     */
    function resolveBackendOrigin() {
        try {
            const detectionStrategies = [
                () => window.API_BASE_URL,
                () => _BACKEND_BASE_URL || _BASE_API_URL,
                () => {
                    const meta = document.querySelector('meta[name="api-base-url"]');
                    return meta ? meta.getAttribute('content') : null;
                },
                () => {
                    if (window.location && window.location.origin) {
                        return window.location.origin;
                    }
                    return null;
                },
                () => {
                    if (window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === '') {
                        console.warn("[API] ⏳ Development mode detected, using current origin");
                        return window.location.origin;
                    }
                    return null;
                }
            ];
            
            let resolvedOrigin = null;
            let resolvedBy = null;
            
            for (let i = 0; i < detectionStrategies.length; i++) {
                try {
                    const result = detectionStrategies[i]();
                    if (result && typeof result === 'string' && result.trim()) {
                        resolvedOrigin = result.trim();
                        resolvedBy = `strategy_${i + 1}`;
                        break;
                    }
                } catch (error) {}
            }
            
            if (!resolvedOrigin) {
                throw new Error("Cannot resolve backend origin");
            }
            
            if (!resolvedOrigin.startsWith('http://') && !resolvedOrigin.startsWith('https://')) {
                console.warn("[API] ⏳ Backend origin missing protocol, assuming https://${resolvedOrigin}");
                resolvedOrigin = `https://${resolvedOrigin}`;
            }
            
            resolvedOrigin = resolvedOrigin.replace(/\/+$/, '');
            
            _gatewayState.backend = {
                origin: resolvedOrigin,
                baseUrl: `${resolvedOrigin}/api`,
                resolved: true,
                lastResolved: Date.now(),
                detectionAttempts: 0,
                maxDetectionAttempts: 3,
                resolvedBy: resolvedBy
            };
            
            _gatewayState.gates.backendResolved = true;
            _gatewayState.initialization.steps.backendResolved = true;
            
            console.log("[API] ✅ Backend resolved: ${resolvedOrigin} (via ${resolvedBy})");
            
            return resolvedOrigin;
            
        } catch (error) {
            _gatewayState.backend.detectionAttempts++;
            
            if (_gatewayState.backend.detectionAttempts >= _gatewayState.backend.maxDetectionAttempts) {
                console.error("[API] ❌ Failed to resolve backend origin after multiple attempts");
                _gatewayState.errorHandler.isPaused = true;
                throw new Error(`Backend resolution failed: ${error.message}`);
            }
            
            console.warn("[API] ⏳ Backend resolution failed (attempt ${_gatewayState.backend.detectionAttempts}), retrying...");
            
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(resolveBackendOrigin());
                }, 1000 * _gatewayState.backend.detectionAttempts);
            });
        }
    }
    
    /**
     * 🔥 REGISTER AUTH HOOKS - SYNC WITH AUTH STATE
     */
    function registerAuthHooks() {
        try {
            const authStateEvents = [
                'auth-state-changed',
                'token-updated',
                'user-authenticated',
                'auth-ready'
            ];
            
            authStateEvents.forEach(eventName => {
                window.addEventListener(eventName, (event) => {
                    const isAuthenticated = event.detail?.authenticated || 
                                          event.detail?.hasToken ||
                                          (window.__API_AUTH && window.__API_AUTH.isAuthenticated);
                    
                    if (isAuthenticated) {
                        _gatewayState.gates.authReady = true;
                        console.log("[API] ✅ Auth ready");
                        
                        if (!_gatewayState.queue.isFlushing && _gatewayState.queue.requests.length > 0) {
                            flushRequestQueue();
                        }
                    }
                });
            });
            
            const checkInitialAuthState = () => {
                const hasToken = _getUserToken ? _getUserToken() : null;
                const isAuthReady = window.__API_AUTH ? window.__API_AUTH.isReady : false;
                
                if (hasToken || isAuthReady) {
                    _gatewayState.gates.authReady = true;
                    console.log("[API] ✅ Initial auth state ready");
                }
                
                // Check session ready state
                if (isSessionReady()) {
                    _gatewayState.gates.sessionReady = true;
                    console.log("[API] ✅ Initial session state ready");
                }
            };
            
            setTimeout(checkInitialAuthState, 100);
            
            _gatewayState.initialization.steps.authHooksRegistered = true;
            
        } catch (error) {
            console.error("[API] ❌ Failed to register auth hooks:", error);
            _gatewayState.gates.authReady = true;
            _gatewayState.gates.sessionReady = true;
        }
    }
    
    /**
     * 🔥 ACTIVATE REQUEST QUEUE
     */
    function activateRequestQueue() {
        _gatewayState.queue.queueStartTime = Date.now();
        _gatewayState.initialization.steps.queueActivated = true;
        console.log("[API] ✅ Request queue activated");
    }
    
    /**
     * 🔥 EMIT API_READY EVENT
     */
    function emitApiReady() {
        if (_gatewayState.initialization.steps.readyEmitted) {
            return;
        }
        
        _gatewayState.gates.apiReady = true;
        _gatewayState.initialization.completed = true;
        _gatewayState.initialization.steps.readyEmitted = true;
        
        try {
            window.dispatchEvent(new CustomEvent("API_READY", {
                detail: {
                    backend: _gatewayState.backend,
                    timestamp: Date.now()
                }
            }));
        } catch (error) {
            const event = document.createEvent('Event');
            event.initEvent('API_READY', true, true);
            window.dispatchEvent(event);
        }
        
        console.log("[API] ✅ API Gateway Ready");
    }
    
    /**
     * 🔥 INITIALIZE GATEWAY - COMPLETE INITIALIZATION FLOW
     */
    async function initializeGateway() {
        if (_gatewayState.initialization.started) {
            return;
        }
        
        _gatewayState.initialization.started = Date.now();
        console.log("[API] ⏳ Initializing centralized API gateway...");
        
        try {
            initDependencies();
            await waitForBootstrap();
            await resolveBackendOrigin();
            registerAuthHooks();
            activateRequestQueue();
            emitApiReady();
        } catch (error) {
            console.error("[API] ❌ Gateway initialization failed:", error);
            _gatewayState.gates.apiReady = true;
        }
    }
    
    // ============================================================================
    // 🔥 GATEWAY CONTROL FUNCTIONS
    // ============================================================================
    
    /**
     * 🔥 CHECK DEPENDENCY GATES - BLOCK REQUESTS UNTIL READY
     */
    function checkDependencyGates(requestId, endpoint) {
        // Check if this is a public endpoint - should bypass session gates
        const isPublic = isPublicEndpoint(endpoint);
        
        if (isPublic) {
            // Public endpoints only need bootstrap and backend
            if (!_gatewayState.gates.bootstrapReady) {
                logRequest(requestId, `⏳ Blocked: Waiting for bootstrap gate`);
                return false;
            }
            
            if (!_gatewayState.gates.backendResolved) {
                logRequest(requestId, `⏳ Blocked: Waiting for backend gate`);
                return false;
            }
            
            return true;
        }
        
        // Protected endpoints need all gates including session
        if (_gatewayState.gates.apiReady) {
            return true;
        }
        
        const missingGates = [];
        if (!_gatewayState.gates.bootstrapReady) missingGates.push('bootstrap');
        if (!_gatewayState.gates.backendResolved) missingGates.push('backend');
        if (!_gatewayState.gates.authReady) missingGates.push('auth');
        if (!_gatewayState.gates.sessionReady) missingGates.push('session');
        
        if (missingGates.length > 0) {
            logRequest(requestId, `⏳ Blocked: Waiting for gates: ${missingGates.join(', ')}`);
            
            if (_gatewayState.initialization.steps.queueActivated) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * 🔥 QUEUE REQUEST - STORE EARLY REQUESTS FOR LATER EXECUTION
     */
    function queueRequest(requestFn, description, endpoint) {
        if (_gatewayState.queue.requests.length >= _gatewayState.queue.maxQueueSize) {
            console.warn("[API] ⏳ Request queue full, dropping request");
            return Promise.reject(new Error("Request queue full"));
        }
        
        const queueItem = {
            id: generateRequestId(endpoint, 'QUEUED'),
            fn: requestFn,
            description,
            endpoint,
            timestamp: Date.now(),
            promise: null
        };
        
        const promise = new Promise((resolve, reject) => {
            queueItem.resolve = resolve;
            queueItem.reject = reject;
        });
        
        queueItem.promise = promise;
        _gatewayState.queue.requests.push(queueItem);
        
        logRequest(queueItem.id, `⏳ Queued: ${description} (${endpoint})`);
        
        return promise;
    }
    
    /**
     * 🔥 FLUSH REQUEST QUEUE - EXECUTE QUEUED REQUESTS WHEN READY
     */
    function flushRequestQueue() {
        if (_gatewayState.queue.isFlushing || _gatewayState.queue.requests.length === 0) {
            return;
        }
        
        _gatewayState.queue.isFlushing = true;
        logRequest('QUEUE_FLUSH', `⏳ Flushing ${_gatewayState.queue.requests.length} queued requests`);
        
        const promises = _gatewayState.queue.requests.map(async (item) => {
            try {
                const result = await item.fn();
                item.resolve(result);
                return { id: item.id, status: 'fulfilled' };
            } catch (error) {
                item.reject(error);
                return { id: item.id, status: 'rejected', error };
            }
        });
        
        Promise.allSettled(promises).then(() => {
            _gatewayState.queue.requests = [];
            _gatewayState.queue.isFlushing = false;
            logRequest('QUEUE_FLUSH', '✅ Queue flushed successfully');
        });
    }
    
    /**
     * 🔥 DEDUPLICATION - PREVENT CONCURRENT DUPLICATE REQUESTS
     */
    function createDedupeKey(endpoint, options) {
        const method = options.method || 'GET';
        const bodyHash = options.body ? 
            (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : 
            'no-body';
        
        return `${method}:${endpoint}:${bodyHash}`;
    }
    
    function shouldDeduplicateRequest(dedupeKey, requestId) {
        if (_gatewayState.deduplication.activeRequests.has(dedupeKey)) {
            return true;
        }
        
        const lastRequestTime = _gatewayState.deduplication.requestHistory.get(dedupeKey);
        if (lastRequestTime) {
            const timeSinceLast = Date.now() - lastRequestTime;
            if (timeSinceLast < _gatewayState.deduplication.dedupeWindow) {
                logRequest(requestId, `⏳ Deduplicated: Recent duplicate within ${timeSinceLast}ms`);
                return true;
            }
        }
        
        return false;
    }
    
    function cleanOldRequestHistory() {
        if (_gatewayState.deduplication.requestHistory.size <= _gatewayState.deduplication.maxHistorySize) {
            return;
        }
        
        const now = Date.now();
        const toDelete = [];
        
        for (const [key, timestamp] of _gatewayState.deduplication.requestHistory) {
            if (now - timestamp > _gatewayState.deduplication.dedupeWindow * 10) {
                toDelete.push(key);
            }
        }
        
        toDelete.forEach(key => {
            _gatewayState.deduplication.requestHistory.delete(key);
        });
    }
    
    /**
     * 🔥 RETRY CONTROLLER - MAX 1 RETRY FOR NETWORK ERROR, NO RETRY ON 4XX
     */
    function checkShouldRetry(error, retryCount) {
        if (retryCount >= _gatewayState.retry.maxRetries) {
            return false;
        }
        
        if (error.name === 'AbortError') {
            return false;
        }
        
        if (_gatewayState.retry.networkErrorRetryOnly) {
            const isNetworkError = 
                error.name === 'TypeError' ||
                error.name === 'NetworkError' ||
                !navigator.onLine;
            
            if (!isNetworkError) {
                return false;
            }
        }
        
        if (_gatewayState.errorHandler.isPaused) {
            return false;
        }
        
        return true;
    }
    
    // ============================================================================
    // 🔥 UTILITY FUNCTIONS
    // ============================================================================
    
    function generateRequestId(endpoint, method) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${method}_${timestamp}_${random}`;
    }
    
    function buildFullUrl(normalizedEndpoint) {
        if (normalizedEndpoint.startsWith('http://') || normalizedEndpoint.startsWith('https://')) {
            return normalizedEndpoint;
        }
        
        if (_gatewayState.backend.resolved) {
            if (normalizedEndpoint.startsWith('/api')) {
                return `${_gatewayState.backend.origin}${normalizedEndpoint}`;
            }
            return `${_gatewayState.backend.baseUrl}${normalizedEndpoint.startsWith('/') ? '' : '/'}${normalizedEndpoint}`;
        }
        
        const origin = window.location.origin;
        if (normalizedEndpoint.startsWith('/api')) {
            return `${origin}${normalizedEndpoint}`;
        }
        return `${origin}/api${normalizedEndpoint.startsWith('/') ? '' : '/'}${normalizedEndpoint}`;
    }
    
    function logRequest(requestId, message) {
        if (!_gatewayState.logging.enabled) {
            return;
        }
        
        if (_gatewayState.logging.loggedRequests.has(requestId)) {
            const lastLogTime = _gatewayState.logging.lastLogTimes.get(requestId) || 0;
            const timeSinceLastLog = Date.now() - lastLogTime;
            
            if (timeSinceLastLog < _gatewayState.logging.duplicateLogThreshold) {
                return;
            }
        }
        
        console.log("[API]", `[${requestId}] ${message}`);
        
        _gatewayState.logging.loggedRequests.add(requestId);
        _gatewayState.logging.lastLogTimes.set(requestId, Date.now());
        
        if (_gatewayState.logging.loggedRequests.size > 100) {
            const oldest = Array.from(_gatewayState.logging.loggedRequests).slice(0, 20);
            oldest.forEach(id => _gatewayState.logging.loggedRequests.delete(id));
        }
    }
    
    /**
     * 🔥 ENHANCED: Check if a request is from a trusted internal module
     */
    function isTrustedCaller() {
        try {
            // Check if we have a stack trace to analyze
            const stack = new Error().stack || '';
            
            // Check for known trusted modules in the call stack
            for (const module of _gatewayState.trustedRequests.trustedModules) {
                if (stack.includes(module)) {
                    return true;
                }
            }
            
            // Check for internal patterns in stack
            const trustedPatterns = [
                '/api.request.js',
                '/api.core.js',
                '/api.auth.js',
                'secureApiFetch',
                'enhancedSecureFetch',
                'queueRequest',
                'flushRequestQueue'
            ];
            
            for (const pattern of trustedPatterns) {
                if (stack.includes(pattern)) {
                    return true;
                }
            }
            
            return false;
        } catch (e) {
            // If stack analysis fails, assume not trusted
            return false;
        }
    }
    
    /**
     * 🔥 ENHANCED: Check if a request URL is trusted (should bypass fetch blocking)
     */
    function isTrustedRequest(url, options = {}) {
        // Check if marked as trusted
        if (options[TRUSTED_REQUEST_MARKER] === true) {
            return true;
        }
        
        // Check for framework-internal markers
        if (options.__trusted === true || options.internal === true) {
            return true;
        }
        
        // 🔥 NEW: Check if caller is from trusted module
        if (isTrustedCaller()) {
            return true;
        }
        
        // 🔥 NEW: Allow HEAD requests (resource existence checks)
        if (options.method === 'HEAD' || (options.method && options.method.toUpperCase() === 'HEAD')) {
            return true;
        }
        
        if (typeof url !== 'string') {
            return false;
        }
        
        const urlLower = url.toLowerCase();
        
        // Check whitelist patterns
        for (const pattern of _gatewayState.trustedRequests.patterns) {
            if (urlLower.includes(pattern.toLowerCase())) {
                return true;
            }
        }
        
        // 🔥 NEW: Enhanced resource existence pattern detection
        const resourcePatterns = [
            '/exists/', '/check/', '/validate/', '/verify/', '/test/',
            '/resource-check', '/file-exists', '/asset-exists',
            '/module-check', '/component-check',
            '?exists=', '?check=', '?validate=',
            '/.well-known/', '/.config/',
            'hot-update', '__webpack', 'sockjs', 'hmr'
        ];
        
        for (const pattern of resourcePatterns) {
            if (urlLower.includes(pattern.toLowerCase())) {
                return true;
            }
        }
        
        // Check for resource file extensions
        if (urlLower.match(/\.(css|js|json|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map)(\?.*)?$/)) {
            return true;
        }
        
        // 🔥 NEW: Check for common module loading patterns
        if (urlLower.match(/\/(modules|components|assets|static|public|dist|build)\//)) {
            return true;
        }
        
        // 🔥 NEW: Check for internal API patterns
        if (urlLower.match(/\/(internal|private|_api|__api)\//)) {
            return true;
        }
        
        return false;
    }
    
    // ============================================================================
    // 🔥 ANTI-PATTERN PREVENTION - HARDENED WITH BETTER WHITELISTING
    // ============================================================================
    
    /**
     * 🔥 ENHANCED: BLOCK DIRECT FETCH() CALLS ELSEWHERE - WITH TRUSTED REQUEST EXEMPTIONS
     */
    function blockDirectFetchCalls() {
        if (window._FETCH_BLOCKED_) {
            return;
        }
        
        const originalFetch = window.fetch;
        const self = this;
        
        window.fetch = function(...args) {
            const [url, options = {}] = args;
            
            // Check if this is a trusted/internal request
            const isTrusted = isTrustedRequest(url, options);
            
            // Check if this is an API request that should be blocked
            const isApiRequest = typeof url === 'string' && 
                (url.includes('/api/') || url.includes('/auth/') || 
                 (!url.startsWith('http') && url.startsWith('/') && !isTrusted));
            
            // 🔥 NEW: Always allow HEAD requests (resource existence checks)
            const method = options.method || 'GET';
            const isHeadRequest = method.toUpperCase() === 'HEAD';
            
            // 🔥 NEW: Always allow GET requests from trusted modules
            const isGetRequest = method.toUpperCase() === 'GET';
            const isFromTrustedModule = isTrustedCaller();
            
            // Only block non-trusted API requests that are not HEAD and not from trusted modules
            if (isApiRequest && !isTrusted && !isHeadRequest && !isFromTrustedModule) {
                // Log only once per URL type to reduce spam
                const urlKey = typeof url === 'string' ? url.split('?')[0] : 'unknown';
                if (!window._blockedFetchLogs) window._blockedFetchLogs = new Set();
                
                if (!window._blockedFetchLogs.has(urlKey)) {
                    window._blockedFetchLogs.add(urlKey);
                    console.warn("[API] ⏳ Direct fetch to ${urlKey} - use api.request() instead");
                    
                    // Limit log size
                    if (window._blockedFetchLogs.size > 50) {
                        window._blockedFetchLogs.clear();
                    }
                }
                
                // Return a rejected promise instead of proceeding
                return Promise.reject(new Error(`Direct fetch blocked: use api.request() for ${url}`));
            }
            
            // Pass through trusted or non-API requests, and all HEAD requests
            return originalFetch.apply(this, args);
        };
        
        // Preserve original fetch for internal use
        window.__originalFetch = originalFetch;
        
        window._FETCH_BLOCKED_ = true;
        console.log("[API] ✅ Direct fetch() calls filtered for API endpoints (HEAD allowed, trusted modules allowed)");
    }
    
    /**
     * 🔥 PREVENT SETINTERVAL POLLING
     */
    function monitorPolling() {
        const originalSetInterval = window.setInterval;
        const pollingIntervals = new Map();
        
        window.setInterval = function(callback, delay, ...args) {
            const intervalId = originalSetInterval(callback, delay, ...args);
            
            const callbackStr = callback.toString().toLowerCase();
            const hasApiCall = 
                callbackStr.includes('fetch') ||
                callbackStr.includes('/api/') ||
                callbackStr.includes('.get(') ||
                callbackStr.includes('.post(') ||
                callbackStr.includes('api.request');
            
            if (hasApiCall && delay < 30000) {
                console.warn("[API] ⏳ SetInterval polling detected: ${delay}ms interval");
                
                pollingIntervals.set(intervalId, {
                    callback: callbackStr.substring(0, 100),
                    delay,
                    started: Date.now()
                });
            }
            
            return intervalId;
        };
        
        const originalClearInterval = window.clearInterval;
        window.clearInterval = function(intervalId) {
            pollingIntervals.delete(intervalId);
            return originalClearInterval(intervalId);
        };
    }
    
    function setupFailureRecovery() {
        window.addEventListener('online', () => {
            if (_gatewayState.errorHandler.isPaused) {
                console.log("[API] ✅ Back online, resuming API gateway");
                _gatewayState.errorHandler.isPaused = false;
                _gatewayState.errorHandler.errorCount = 0;
                
                if (_gatewayState.queue.requests.length > 0) {
                    setTimeout(flushRequestQueue, 1000);
                }
            }
        });
        
        window.addEventListener('offline', () => {
            console.warn("[API] ⏳ Network offline, pausing API gateway");
            _gatewayState.errorHandler.isPaused = true;
        });
        
        setInterval(() => {
            if (_gatewayState.errorHandler.errorCount > _gatewayState.errorHandler.maxErrorsBeforePause) {
                console.error("[API] ❌ Too many errors (${_gatewayState.errorHandler.errorCount}), pausing gateway");
                _gatewayState.errorHandler.isPaused = true;
                
                try {
                    window.dispatchEvent(new CustomEvent('API_GATEWAY_PAUSED', {
                        detail: {
                            errorCount: _gatewayState.errorHandler.errorCount,
                            timestamp: Date.now()
                        }
                    }));
                } catch (error) {}
            }
            
            _gatewayState.errorHandler.errorCount = Math.max(0, 
                _gatewayState.errorHandler.errorCount - 5);
            
        }, _gatewayState.errorHandler.errorWindowMs);
    }
    
    /**
     * Safety: Check if we should allow another request
     */
    function shouldAllowRequest(endpoint, functionName) {
        const endpointKey = `${functionName}:${endpoint}`;
        
        // Check concurrent request limit
        if (_safetyState.activeRequests.size >= _safetyState.maxConcurrentRequests) {
            if (shouldLogError(endpointKey, 'concurrent_limit')) {
                console.warn("[API] ⏳ Too many concurrent requests (${_safetyState.activeRequests.size}), delaying: ${endpointKey}");
            }
            return false;
        }
        
        // Check error limit
        const errorCount = _safetyState.errorCounts.get(endpointKey) || 0;
        if (errorCount >= _safetyState.maxErrorsPerEndpoint) {
            if (shouldLogError(endpointKey, 'error_limit')) {
                console.warn("[API] ⏳ Error limit reached for ${endpointKey}, blocking further requests");
            }
            return false;
        }
        
        return true;
    }
    
    /**
     * Safety: Track request start
     */
    function trackRequestStart(endpoint, functionName) {
        const endpointKey = `${functionName}:${endpoint}`;
        _safetyState.activeRequests.add(endpointKey);
        
        // Increment retry attempt
        const retryCount = (_safetyState.retryAttempts.get(endpointKey) || 0) + 1;
        _safetyState.retryAttempts.set(endpointKey, retryCount);
        
        return retryCount;
    }
    
    /**
     * Safety: Track request end
     */
    function trackRequestEnd(endpoint, functionName, success = true) {
        const endpointKey = `${functionName}:${endpoint}`;
        _safetyState.activeRequests.delete(endpointKey);
        
        if (success) {
            // Reset error count on success
            _safetyState.errorCounts.delete(endpointKey);
            _safetyState.retryAttempts.delete(endpointKey);
        }
    }
    
    /**
     * Safety: Track error
     */
    function trackError(endpoint, functionName, errorType) {
        const endpointKey = `${functionName}:${endpoint}`;
        const errorCount = (_safetyState.errorCounts.get(endpointKey) || 0) + 1;
        _safetyState.errorCounts.set(endpointKey, errorCount);
        
        return errorCount;
    }
    
    /**
     * Safety: Check if we should log this error (prevent spam)
     */
    function shouldLogError(endpointKey, errorType) {
        const now = Date.now();
        const lastLogKey = `${endpointKey}:${errorType}`;
        const lastLogTime = _safetyState.lastErrorLogs.get(lastLogKey) || 0;
        
        if (now - lastLogTime > _safetyState.errorLogInterval) {
            _safetyState.lastErrorLogs.set(lastLogKey, now);
            return true;
        }
        
        return false;
    }
    
    /**
     * Safety: Get safe default response
     */
    function getSafeDefaultResponse(endpoint, functionName, error = null) {
        return {
            ok: false,
            success: false,
            status: 0,
            statusText: 'Safety Blocked',
            data: { 
                message: error ? error.message : 'Request blocked by safety guard',
                endpoint: endpoint,
                function: functionName,
                safeDefault: true
            },
            headers: {},
            safetyBlocked: true,
            networkError: true,
            message: 'Request blocked by safety guard'
        };
    }
    
    /**
     * Initialize dependencies from external modules
     */
    function initDependencies() {
        try {
            // Import core functions from api.core.js
            const apiCore = window.__API_CORE || {};
            const apiAuth = window.__API_AUTH || {};
            
            _secureApiFetch = apiCore.secureApiFetch;
            _getValidToken = apiCore.getValidToken;
            _isPublicEndpoint = apiCore.isPublicEndpoint;
            _isStatusEndpoint = apiCore.isStatusEndpoint;
            _isAuthEndpoint = apiCore.isAuthEndpoint;
            _getUserToken = apiCore.getUserToken;
            _apiCache = apiCore._apiCache;
            _apiRequestQueue = apiCore._apiRequestQueue;
            _BACKEND_BASE_URL = apiCore.BACKEND_BASE_URL;
            _BASE_API_URL = apiCore.BASE_API_URL;
            
            _validateAuth = apiAuth.validateAuth;
            
            // Validate critical dependencies
            if (!_secureApiFetch || typeof _secureApiFetch !== 'function') {
                console.warn("[API] ⏳ secureApiFetch not found in window.__API_CORE, creating fallback");
                _secureApiFetch = createFallbackSecureFetch();
            }
            
            if (!_getUserToken || typeof _getUserToken !== 'function') {
                console.warn("[API] ⏳ getUserToken not found in window.__API_CORE");
                _getUserToken = function() { return null; };
            }
            
            if (!_apiCache) {
                console.warn("[API] ⏳ _apiCache not found in window.__API_CORE");
                _apiCache = {
                    get: () => null,
                    set: () => {},
                    delete: () => {}
                };
            }
            
            if (!_apiRequestQueue) {
                console.warn("[API] ⏳ _apiRequestQueue not found in window.__API_CORE");
                _apiRequestQueue = {
                    isLoginComplete: () => true,
                    addRequest: (fn, desc, endpoint) => fn()
                };
            }
            
            _requestState.initialized = true;
            
        } catch (error) {
            console.error("[API] ❌ Failed to initialize dependencies:", error);
            // Set safe defaults
            _secureApiFetch = createFallbackSecureFetch();
            _getUserToken = function() { return null; };
            _apiCache = {
                get: () => null,
                set: () => {},
                delete: () => {}
            };
            _apiRequestQueue = {
                isLoginComplete: () => true,
                addRequest: (fn, desc, endpoint) => fn()
            };
            _requestState.initialized = true;
        }
    }
    
    /**
     * Create fallback secureFetch if core module not available
     * 🔧 UPDATED: Fixed Content-Type header and JSON serialization
     */
    function createFallbackSecureFetch() {
        return async function secureApiFetch(url, options = {}) {
            const functionName = 'secureApiFetch';
            const normalizedUrl = normalizeEndpoint(url);
            
            // Mark as trusted request to bypass fetch blocking
            const trustedOptions = {
                ...options,
                [TRUSTED_REQUEST_MARKER]: true,
                __trusted: true
            };
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedUrl);
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(url, options.method || 'GET');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => secureApiFetch(url, options),
                    `${options.method || 'GET'} ${url}`,
                    url
                );
            }
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            const retryCount = trackRequestStart(normalizedUrl, functionName);
            
            try {
                // Safety: Check retry limit
                if (retryCount > _safetyState.maxRetriesPerRequest) {
                    console.warn("[API] ⏳ Max retries reached for ${normalizedUrl}");
                    trackRequestEnd(normalizedUrl, functionName, false);
                    return getSafeDefaultResponse(normalizedUrl, functionName, new Error('Max retries reached'));
                }
                
                const token = _getUserToken ? _getUserToken() : null;
                
                // 🔧 FIX: Always set Content-Type for JSON requests
                const defaultHeaders = {
                    'Content-Type': 'application/json'
                };
                
                // Merge headers, but don't override Content-Type if already set
                const headers = {
                    ...defaultHeaders,
                    ...(options.headers || {})
                };
                
                // 🔧 Add Authorization header ONLY for non-public endpoints AND when token exists
                if (!isPublic && token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                
                // Prepare fetch options
                const fetchOptions = {
                    method: options.method || 'GET',
                    headers: headers,
                    credentials: 'include',
                    ...trustedOptions
                };
                
                // Remove body from options copy to avoid duplication
                if (options.body && fetchOptions.body) {
                    delete fetchOptions.body;
                }
                
                // 🔧 CRITICAL FIX: Proper JSON serialization for all object payloads
                // This fixes "[object Object] is not valid JSON" errors
                if (options.body) {
                    if (options.body instanceof FormData) {
                        fetchOptions.body = options.body;
                        // For FormData, browser sets appropriate Content-Type with boundary
                        delete fetchOptions.headers['Content-Type'];
                    } else if (typeof options.body === 'object') {
                        // 🔧 FIX: Always stringify object payloads
                        fetchOptions.body = JSON.stringify(options.body);
                    } else if (typeof options.body === 'string') {
                        // Already a string, assume it's JSON
                        fetchOptions.body = options.body;
                        try {
                            // Validate it's valid JSON
                            JSON.parse(options.body);
                        } catch (e) {
                            console.warn("[API] ⏳ Body appears to be string but not valid JSON:", options.body);
                        }
                    } else {
                        // Other types (number, boolean, etc.)
                        fetchOptions.body = String(options.body);
                    }
                }
                
                // 🔥 DYNAMIC BACKEND ORIGIN
                let fullUrl = normalizedUrl;
                if (!normalizedUrl.startsWith('http://') && 
                    !normalizedUrl.startsWith('https://') && 
                    !normalizedUrl.startsWith('/')) {
                    
                    // Try multiple sources for base URL
                    let baseUrl = _BACKEND_BASE_URL || _BASE_API_URL || window.API_BASE_URL || '';
                    
                    // 🔥 USE RESOLVED BACKEND ORIGIN
                    if (_gatewayState.backend.resolved) {
                        baseUrl = _gatewayState.backend.origin;
                    } else if (!baseUrl && typeof window !== 'undefined' && window.location && window.location.origin) {
                        baseUrl = window.location.origin;
                    }
                    
                    fullUrl = baseUrl + (normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl);
                }
                
                // Safety: Timeout handling
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), _requestState.requestTimeout);
                fetchOptions.signal = controller.signal;
                
                // Use original fetch to avoid interception loop
                const response = await window.__originalFetch ? 
                    window.__originalFetch(fullUrl, fetchOptions) : 
                    window.fetch(fullUrl, fetchOptions);
                    
                clearTimeout(timeoutId);
                
                // 🔧 FIXED: Use safe response parser instead of direct response.json()
                const data = await safeParseResponse(response);
                
                // Handle response
                const result = {
                    ok: response.ok,
                    success: response.ok,
                    status: response.status,
                    statusText: response.statusText,
                    data: data,
                    headers: Object.fromEntries(response.headers.entries()),
                    url: response.url
                };
                
                // Handle error status codes
                if (!response.ok) {
                    // Create structured error response
                    const errorResponse = createErrorResponse(response, data);
                    Object.assign(result, errorResponse);
                    
                    // Ensure message exists
                    if (!result.message) {
                        result.message = result.data?.message || result.data?.error || response.statusText;
                    }
                }
                
                trackRequestEnd(normalizedUrl, functionName, response.ok);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedUrl, functionName, false);
                const errorCount = trackError(normalizedUrl, functionName, error.name || 'fetch_error');
                
                if (shouldLogError(normalizedUrl, 'fetch_error')) {
                    console.error("[API] ❌ Fetch error for ${normalizedUrl} (attempt ${errorCount}):", error.message);
                }
                
                return getSafeDefaultResponse(normalizedUrl, functionName, error);
            }
        };
    }
    
    // ============================================================================
    // 🔧 FIXED: ENHANCED ENDPOINT NORMALIZATION FUNCTIONS
    // ============================================================================
    
    /**
     * Normalize endpoint URL to include /api prefix exactly once
     * SINGLE SOURCE OF /API PREFIX - ONLY IN THIS MODULE
     * 🔧 FIXED: Edge cases for double /api prefix, full URLs, and empty inputs
     * @param {string} endpoint - The endpoint to normalize
     * @returns {string} Normalized endpoint with /api prefix exactly once
     */
    function normalizeEndpoint(endpoint) {
        try {
            // 🔧 FIX: Handle undefined, null, and empty string
            if (endpoint === undefined || endpoint === null) {
                console.warn("[API] ⏳ Undefined/null endpoint, defaulting to /api/");
                return '/api/';
            }
            
            // Convert to string and trim
            const endpointStr = String(endpoint).trim();
            
            // 🔧 FIX: Handle empty string after trimming
            if (endpointStr === '') {
                console.warn("[API] ⏳ Empty endpoint, defaulting to /api/");
                return '/api/';
            }
            
            // 🔧 CRITICAL FIX: Detect and preserve full URLs (http://, https://)
            // Full URLs should NOT be modified
            if (endpointStr.startsWith('http://') || endpointStr.startsWith('https://')) {
                return endpointStr;
            }
            
            // 🔧 CRITICAL FIX: Handle double /api prefixes and clean them up
            // First, check if the endpoint already contains /api in various forms
            // Remove any leading "api/" or "/api" patterns (case insensitive) and then add exactly one
            
            // Strip any leading slashes for processing
            let cleanEndpoint = endpointStr;
            
            // Case 1: Handle patterns like "/api/api/something" -> remove duplicate
            if (cleanEndpoint.match(/^\/?api\/api\//i)) {
                cleanEndpoint = cleanEndpoint.replace(/^\/?api\/api\//i, '/');
            }
            
            // Case 2: Handle patterns like "api/api/something" -> remove duplicate
            if (cleanEndpoint.match(/^api\/api\//i)) {
                cleanEndpoint = cleanEndpoint.replace(/^api\/api\//i, '');
            }
            
            // Case 3: Handle patterns like "/api/something" -> remove leading /api for clean rebuild
            if (cleanEndpoint.match(/^\/?api\//i)) {
                cleanEndpoint = cleanEndpoint.replace(/^\/?api\//i, '');
            }
            
            // Case 4: Handle patterns like "api/something" -> remove leading api/
            if (cleanEndpoint.match(/^api\//i)) {
                cleanEndpoint = cleanEndpoint.replace(/^api\//i, '');
            }
            
            // Case 5: Handle patterns like "/api" (exact) -> remove
            if (cleanEndpoint.match(/^\/?api$/i)) {
                cleanEndpoint = '';
            }
            
            // Ensure the clean endpoint starts with a slash
            if (cleanEndpoint && !cleanEndpoint.startsWith('/')) {
                cleanEndpoint = '/' + cleanEndpoint;
            }
            
            // Now add exactly one /api prefix
            // Special case: if after cleaning we have empty string, just return '/api'
            if (!cleanEndpoint || cleanEndpoint === '/') {
                return '/api';
            }
            
            // Special case for auth endpoints that should remain as /api/auth/...
            const normalized = '/api' + cleanEndpoint;
            
            return normalized;
            
        } catch (error) {
            console.error("[API] ❌ normalizeEndpoint failed:", error);
            return '/api/';
        }
    }
    
    /**
     * Normalize login/register payload for backward compatibility
     * 🔧 ENHANCED: Better handling of email/username fields
     * @param {object} payload - The payload to normalize
     * @returns {object} Normalized payload with proper JSON structure
     */
    function normalizeAuthPayload(payload) {
        try {
            if (!payload || typeof payload !== 'object') {
                return payload;
            }
            
            // Create a deep copy to avoid modifying the original
            const normalized = JSON.parse(JSON.stringify(payload));
            
            // 🔧 FIX: Handle email/username field mapping
            // Some APIs expect "email", some expect "username", some accept both
            // Support all common authentication patterns
            
            // Case 1: If username looks like email, copy to email field
            if (normalized.username && !normalized.email) {
                if (normalized.username.includes('@') && normalized.username.includes('.')) {
                    normalized.email = normalized.username;
                }
            }
            
            // Case 2: If email provided but no username, use email as username
            if (normalized.email && !normalized.username) {
                normalized.username = normalized.email;
            }
            
            // Case 3: For registration, ensure confirmPassword matches password
            if (normalized.password && !normalized.confirmPassword) {
                normalized.confirmPassword = normalized.password;
            }
            
            // Case 4: Ensure name field is present for registration if not provided
            if (!normalized.name && normalized.username) {
                normalized.name = normalized.username.split('@')[0]; // Use part before @ for email
            }
            
            // 🔧 FIX: Remove any null/undefined/empty string values
            // Some APIs reject empty strings in JSON
            Object.keys(normalized).forEach(key => {
                if (normalized[key] === null || 
                    normalized[key] === undefined || 
                    normalized[key] === '') {
                    delete normalized[key];
                }
            });
            
            // 🔒 SECURITY: Never log passwords in console
            const safeLogPayload = { ...normalized };
            if (safeLogPayload.password) safeLogPayload.password = '[REDACTED]';
            if (safeLogPayload.confirmPassword) safeLogPayload.confirmPassword = '[REDACTED]';
            
            return normalized;
            
        } catch (error) {
            console.error("[API] ❌ normalizeAuthPayload failed:", error);
            return payload || {};
        }
    }
    
    /**
     * Safely serialize payload to JSON with error handling
     * 🔧 NEW: Prevents "[object Object] is not valid JSON" errors
     * @param {any} payload - The payload to serialize
     * @returns {string} Valid JSON string
     */
    function safeJsonSerialize(payload) {
        try {
            if (payload === undefined || payload === null) {
                return '';
            }
            
            if (typeof payload === 'string') {
                // Already a string, try to parse it to validate JSON
                try {
                    JSON.parse(payload);
                    return payload; // It's already valid JSON
                } catch (e) {
                    // Not valid JSON, stringify it
                    return JSON.stringify(payload);
                }
            }
            
            if (typeof payload === 'object') {
                // Handle special cases
                if (payload instanceof FormData) {
                    return payload; // Return FormData as-is
                }
                
                // Regular object, stringify it
                return JSON.stringify(payload);
            }
            
            // For other types (number, boolean), stringify them
            return JSON.stringify(payload);
            
        } catch (error) {
            console.error("[API] ❌ Failed to serialize payload:", error, payload);
            throw new Error(`Failed to serialize payload to JSON: ${error.message}`);
        }
    }
    
    // ============================================================================
    // ENHANCED SECURE FETCH WRAPPER WITH /API NORMALIZATION
    // ============================================================================
    
    /**
     * Enhanced secure fetch with retry logic and endpoint normalization
     * 🔧 UPDATED: Proper JSON handling and Content-Type headers
     * @param {string} endpoint - The endpoint to call
     * @param {object} options - Fetch options
     * @returns {Promise} Promise with response
     */
    async function enhancedSecureFetch(endpoint, options = {}) {
        const functionName = 'enhancedSecureFetch';
        
        try {
            // 🔧 FIX: Normalize endpoint with /api prefix
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, options.method || 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            const retryCount = trackRequestStart(normalizedEndpoint, functionName);
            
            // Generate request ID for tracking
            const requestId = `${options.method || 'GET'}_${normalizedEndpoint}_${Date.now()}`;
            
            // 🔥 CHECK GATEWAY GATES
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => enhancedSecureFetch(endpoint, options),
                    `${options.method || 'GET'} ${endpoint}`,
                    endpoint
                );
            }
            
            // Check if we should retry on failure
            const shouldRetry = options.retry !== false;
            const maxRetries = options.maxRetries || _requestState.maxRetries;
            const retryDelay = options.retryDelay || _requestState.retryDelay;
            
            let lastError;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // Safety: Check retry limit
                    if (retryCount > _safetyState.maxRetriesPerRequest) {
                        console.warn("[API] ⏳ Max retries reached for ${normalizedEndpoint}");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return getSafeDefaultResponse(normalizedEndpoint, functionName, new Error('Max retries reached'));
                    }
                    
                    // Log attempt
                    if (attempt > 1) {
                        console.log("[API] ⏳ Retry attempt ${attempt}/${maxRetries} for ${normalizedEndpoint}");
                    }
                    
                    // Use the original secureApiFetch with normalized endpoint and trusted marker
                    const trustedOptions = {
                        ...options,
                        [TRUSTED_REQUEST_MARKER]: true,
                        __trusted: true
                    };
                    
                    const result = await _secureApiFetch(normalizedEndpoint, trustedOptions);
                    
                    // If successful, return result
                    if (result.success) {
                        if (attempt > 1) {
                            console.log("[API] ✅ Request succeeded on attempt ${attempt}: ${normalizedEndpoint}");
                        }
                        trackRequestEnd(normalizedEndpoint, functionName, true);
                        return result;
                    }
                    
                    // Handle specific error cases
                    if (result.status === 401) {
                        // Auth error - don't retry
                        console.warn("[API] ⏳ Auth error (401) for ${normalizedEndpoint}, not retrying");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        trackError(normalizedEndpoint, functionName, 'auth_error');
                        return result;
                    }
                    
                    if (result.status === 429) {
                        // Rate limited - respect Retry-After header if present
                        const retryAfter = result.headers?.['retry-after'] || result.headers?.['Retry-After'];
                        if (retryAfter && attempt < maxRetries) {
                            const delay = parseInt(retryAfter) * 1000 || retryDelay;
                            console.log("[API] ⏳ Rate limited, waiting ${delay}ms before retry");
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }
                    }
                    
                    // For server errors, retry with exponential backoff
                    if (result.status >= 500 && shouldRetry && attempt < maxRetries) {
                        const delay = retryDelay * Math.pow(2, attempt - 1);
                        console.log("[API] ⏳ Server error ${result.status}, retrying in ${delay}ms");
                        await new Promise(resolve => setTimeout(resolve, delay));
                        lastError = result;
                        continue;
                    }
                    
                    // Non-retryable error or last attempt
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `http_${result.status}`);
                    return result;
                    
                } catch (error) {
                    if (shouldLogError(normalizedEndpoint, 'attempt_failed')) {
                        console.error("[API] ❌ Attempt ${attempt} failed for ${normalizedEndpoint}:", error.message);
                    }
                    lastError = error;
                    
                    // Network errors - retry with exponential backoff
                    if (shouldRetry && attempt < maxRetries) {
                        const delay = retryDelay * Math.pow(2, attempt - 1);
                        console.log("[API] ⏳ Network error, retrying in ${delay}ms");
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    
                    // Last attempt or shouldn't retry
                    break;
                }
            }
            
            // All retries failed
            trackRequestEnd(normalizedEndpoint, functionName, false);
            const errorCount = trackError(normalizedEndpoint, functionName, 'all_retries_failed');
            
            if (shouldLogError(normalizedEndpoint, 'all_retries_failed')) {
                console.error("[API] ❌ All ${maxRetries} attempts failed for ${normalizedEndpoint} (total errors: ${errorCount})");
            }
            
            // Return a consistent error object
            return {
                ok: false,
                success: false,
                status: lastError?.status || 0,
                statusText: lastError?.message || 'All retry attempts failed',
                data: { 
                    message: lastError?.message || 'Request failed after all retry attempts',
                    endpoint: normalizedEndpoint,
                    attempts: maxRetries,
                    safeDefault: true
                },
                headers: {},
                networkError: true,
                retryFailed: true
            };
            
        } catch (error) {
            console.error("[API] ❌ enhancedSecureFetch critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // ============================================================================
    // FIXED api.get(), api.post(), api.put(), api.delete() METHODS
    // ============================================================================
    
    /**
     * api.get() - Simple GET method with authoritative token attachment
     * Uses secureApiFetch for centralized token handling
     * 🔧 FIXED: Includes proper /api prefix normalization
     * @param {string} url - The endpoint URL
     * @param {object} options - Additional options
     * @returns {Promise} Promise with response data
     */
    async function apiGet(url, options = {}) {
        const functionName = 'apiGet';
        
        try {
            // Safety: Validate URL
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.get() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedUrl);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(url, 'GET');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiGet(url, options),
                    `GET ${url}`,
                    url
                );
            }
            
            // Check if this is a public endpoint (using normalized URL)
            const isPublicEndpointFlag = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
                // Check cache first for GET requests
                const cacheKey = `get_${normalizedUrl}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached data for: ${normalizedUrl}");
                    trackRequestEnd(normalizedUrl, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch with retry logic
                const result = await enhancedSecureFetch(url, { 
                    method: 'GET',
                    ...options 
                });
                
                // 🔧 FIX: Safe error handling - only throw when appropriate
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'get_failed')) {
                        console.error("[API] ❌ GET request failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available and request failed
                    if (cachedData) {
                        console.log("[API] ✅ Request failed, returning cached data for: ${normalizedUrl}");
                        trackRequestEnd(normalizedUrl, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached data (request failed)'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedUrl, functionName, false);
                    trackError(normalizedUrl, functionName, `get_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedUrl, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedUrl, functionName, false);
                const errorCount = trackError(normalizedUrl, functionName, 'get_error');
                
                if (shouldLogError(normalizedUrl, 'get_error')) {
                    console.error("[API] ❌ api.get() error for ${normalizedUrl}:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizeEndpoint(url)}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ Error occurred, returning cached data for: ${normalizeEndpoint(url)}");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached data (error occurred)',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.get() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    /**
     * api.post() - Simple POST method with authoritative token attachment
     * Uses secureApiFetch for centralized token handling
     * 🔧 FIXED: Includes proper /api prefix normalization and JSON payload handling
     * @param {string} url - The endpoint URL
     * @param {object} data - The data to send
     * @param {object} options - Additional options
     * @returns {Promise} Promise with response data
     */
    async function apiPost(url, data, options = {}) {
        const functionName = 'apiPost';
        
        try {
            // Safety: Validate URL
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.post() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedUrl);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(url, 'POST');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiPost(url, data, options),
                    `POST ${url}`,
                    url
                );
            }
            
            // Check if this is an auth endpoint for special payload handling
            const isAuthEndpoint = normalizedUrl.includes('/auth/');
            
            // 🔧 FIX: Normalize auth payloads for backward compatibility
            let payload = data;
            if (isAuthEndpoint && payload && typeof payload === 'object') {
                payload = normalizeAuthPayload(payload);
                
                // 🔒 SECURITY: Never log passwords
                const safeLogPayload = { ...payload };
                if (safeLogPayload.password) safeLogPayload.password = '[REDACTED]';
                if (safeLogPayload.confirmPassword) safeLogPayload.confirmPassword = '[REDACTED]';
            }
            
            // 🔧 CRITICAL FIX: Ensure Content-Type is set for JSON payloads
            // Merge headers, ensuring Content-Type is always application/json for non-FormData
            const headers = {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };
            
            // If payload is FormData, remove Content-Type (browser will set it with boundary)
            if (payload instanceof FormData) {
                delete headers['Content-Type'];
            }
            
            // Check if this is a public endpoint (using normalized URL)
            const isPublicEndpointFlag = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
                // 🔧 FIX: Use safe JSON serialization for payload
                const fetchOptions = {
                    method: 'POST',
                    headers: headers,
                    ...options
                };
                
                // Only add body if payload exists
                if (payload !== undefined && payload !== null) {
                    fetchOptions.body = safeJsonSerialize(payload);
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch with retry logic
                const result = await enhancedSecureFetch(url, fetchOptions);
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'post_failed')) {
                        console.error("[API] ❌ POST request failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedUrl, functionName, false);
                    trackError(normalizedUrl, functionName, `post_failed_${result.status}`);
                    return result;
                }
                
                trackRequestEnd(normalizedUrl, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedUrl, functionName, false);
                const errorCount = trackError(normalizedUrl, functionName, 'post_error');
                
                if (shouldLogError(normalizedUrl, 'post_error')) {
                    console.error("[API] ❌ api.post() error for ${normalizedUrl}:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.post() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    /**
     * api.put() - Simple PUT method with authoritative token attachment
     * Uses secureApiFetch for centralized token handling
     * 🔧 FIXED: Includes proper /api prefix normalization and JSON payload handling
     * @param {string} url - The endpoint URL
     * @param {object} data - The data to send
     * @param {object} options - Additional options
     * @returns {Promise} Promise with response data
     */
    async function apiPut(url, data, options = {}) {
        const functionName = 'apiPut';
        
        try {
            // Safety: Validate URL
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.put() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedUrl);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'PUT');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(url, 'PUT');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiPut(url, data, options),
                    `PUT ${url}`,
                    url
                );
            }
            
            // 🔧 CRITICAL FIX: Ensure Content-Type is set for JSON payloads
            // Merge headers, ensuring Content-Type is always application/json for non-FormData
            const headers = {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };
            
            // If data is FormData, remove Content-Type (browser will set it with boundary)
            if (data instanceof FormData) {
                delete headers['Content-Type'];
            }
            
            // Check if this is a public endpoint (using normalized URL)
            const isPublicEndpointFlag = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
                // 🔧 FIX: Use safe JSON serialization for payload
                const fetchOptions = {
                    method: 'PUT',
                    headers: headers,
                    ...options
                };
                
                // Only add body if data exists
                if (data !== undefined && data !== null) {
                    fetchOptions.body = safeJsonSerialize(data);
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch with retry logic
                const result = await enhancedSecureFetch(url, fetchOptions);
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'put_failed')) {
                        console.error("[API] ❌ PUT request failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedUrl, functionName, false);
                    trackError(normalizedUrl, functionName, `put_failed_${result.status}`);
                    return result;
                }
                
                trackRequestEnd(normalizedUrl, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedUrl, functionName, false);
                const errorCount = trackError(normalizedUrl, functionName, 'put_error');
                
                if (shouldLogError(normalizedUrl, 'put_error')) {
                    console.error("[API] ❌ api.put() error for ${normalizedUrl}:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.put() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    /**
     * api.delete() - Simple DELETE method with authoritative token attachment
     * Uses secureApiFetch for centralized token handling
     * 🔧 FIXED: Includes proper /api prefix normalization
     * @param {string} url - The endpoint URL
     * @param {object} options - Additional options
     * @returns {Promise} Promise with response data
     */
    async function apiDelete(url, options = {}) {
        const functionName = 'apiDelete';
        
        try {
            // Safety: Validate URL
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.delete() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedUrl);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'DELETE');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(url, 'DELETE');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiDelete(url, options),
                    `DELETE ${url}`,
                    url
                );
            }
            
            // Check if this is a public endpoint (using normalized URL)
            const isPublicEndpointFlag = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch with retry logic
                const result = await enhancedSecureFetch(url, { 
                    method: 'DELETE',
                    ...options
                });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'delete_failed')) {
                        console.error("[API] ❌ DELETE request failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedUrl, functionName, false);
                    trackError(normalizedUrl, functionName, `delete_failed_${result.status}`);
                    return result;
                }
                
                trackRequestEnd(normalizedUrl, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedUrl, functionName, false);
                const errorCount = trackError(normalizedUrl, functionName, 'delete_error');
                
                if (shouldLogError(normalizedUrl, 'delete_error')) {
                    console.error("[API] ❌ api.delete() error for ${normalizedUrl}:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.delete() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    /**
     * api.upload() - File upload method with progress support
     * Uses secureApiFetch for centralized token handling
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {string} url - The endpoint URL
     * @param {FormData|File} data - File data to upload
     * @param {object} options - Upload options including onProgress callback
     * @returns {Promise} Promise with response data
     */
    async function apiUpload(url, data, options = {}) {
        const functionName = 'apiUpload';
        
        try {
            // Safety: Validate URL
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.upload() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedUrl);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(url, 'POST');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiUpload(url, data, options),
                    `UPLOAD ${url}`,
                    url
                );
            }
            
            // Check if this is a public endpoint (using normalized URL)
            const isPublicEndpointFlag = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
                // Prepare FormData if needed
                let formData;
                if (data instanceof FormData) {
                    formData = data;
                } else if (data instanceof File || data instanceof Blob) {
                    formData = new FormData();
                    formData.append('file', data);
                    if (options.fileName) {
                        formData.append('fileName', options.fileName);
                    }
                } else if (typeof data === 'object') {
                    formData = new FormData();
                    Object.keys(data).forEach(key => {
                        if (data[key] instanceof File || data[key] instanceof Blob) {
                            formData.append(key, data[key]);
                        } else {
                            formData.append(key, String(data[key]));
                        }
                    });
                } else {
                    formData = new FormData();
                    formData.append('data', String(data));
                }
                
                const fetchOptions = {
                    method: 'POST',
                    body: formData,
                    ...options
                };
                
                // Remove Content-Type header for FormData (browser sets it with boundary)
                if (fetchOptions.headers) {
                    delete fetchOptions.headers['Content-Type'];
                }
                
                // Add onProgress handler if supported and requested
                if (options.onProgress && typeof options.onProgress === 'function') {
                    if (typeof XMLHttpRequest !== 'undefined') {
                        const result = await xhrUpload(normalizedUrl, formData, options, token);
                        trackRequestEnd(normalizedUrl, functionName, result.success);
                        return result;
                    }
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch with retry logic
                const result = await enhancedSecureFetch(url, fetchOptions);
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'upload_failed')) {
                        console.error("[API] ❌ Upload request failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Upload failed' };
                    }
                    
                    // Only throw for auth errors without token
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedUrl, functionName, false);
                    trackError(normalizedUrl, functionName, `upload_failed_${result.status}`);
                    return result;
                }
                
                trackRequestEnd(normalizedUrl, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedUrl, functionName, false);
                const errorCount = trackError(normalizedUrl, functionName, 'upload_error');
                
                if (shouldLogError(normalizedUrl, 'upload_error')) {
                    console.error("[API] ❌ api.upload() error for ${normalizedUrl}:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Upload failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Upload failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.upload() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    /**
     * XMLHttpRequest-based upload with progress support
     * 🔧 UPDATED: Uses normalized URL
     */
    function xhrUpload(url, formData, options, token) {
        return new Promise((resolve, reject) => {
            try {
                const functionName = 'xhrUpload';
                const normalizedUrl = normalizeEndpoint(url);
                
                // Safety: Check if request should proceed
                if (!shouldAllowRequest(normalizedUrl, functionName)) {
                    resolve(getSafeDefaultResponse(normalizedUrl, functionName));
                    return;
                }
                
                trackRequestStart(normalizedUrl, functionName);
                
                const xhr = new XMLHttpRequest();
                
                // Build full URL
                let fullUrl = normalizedUrl;
                if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://') && !normalizedUrl.startsWith('/')) {
                    const baseUrl = _BACKEND_BASE_URL || _BASE_API_URL || window.API_BASE_URL || '';
                    
                    // Safety: Dynamic backend origin
                    if (!baseUrl && typeof window !== 'undefined' && window.location && window.location.origin) {
                        fullUrl = window.location.origin + (normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl);
                    } else {
                        fullUrl = baseUrl + (normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl);
                    }
                }
                
                xhr.open('POST', fullUrl, true);
                
                // Add authorization header if token exists AND endpoint is not public
                const isPublic = isPublicEndpoint(normalizedUrl);
                if (token && !isPublic) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                }
                
                // Track upload progress
                if (options.onProgress) {
                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const percentComplete = Math.round((event.loaded / event.total) * 100);
                            options.onProgress(percentComplete, event.loaded, event.total);
                        }
                    };
                }
                
                xhr.onload = () => {
                    let data;
                    try {
                        data = JSON.parse(xhr.responseText);
                    } catch (e) {
                        data = xhr.responseText;
                    }
                    
                    const result = {
                        ok: xhr.status >= 200 && xhr.status < 300,
                        success: xhr.status >= 200 && xhr.status < 300,
                        status: xhr.status,
                        statusText: xhr.statusText,
                        data: data,
                        headers: {},
                        xhr: true
                    };
                    
                    if (!result.success) {
                        result.message = data.message || data.error || xhr.statusText;
                        trackError(normalizedUrl, functionName, `xhr_failed_${xhr.status}`);
                    }
                    
                    trackRequestEnd(normalizedUrl, functionName, result.success);
                    resolve(result);
                };
                
                xhr.onerror = () => {
                    trackRequestEnd(normalizedUrl, functionName, false);
                    trackError(normalizedUrl, functionName, 'xhr_error');
                    resolve(getSafeDefaultResponse(normalizedUrl, functionName, new Error('XHR network error')));
                };
                
                xhr.ontimeout = () => {
                    trackRequestEnd(normalizedUrl, functionName, false);
                    trackError(normalizedUrl, functionName, 'xhr_timeout');
                    resolve(getSafeDefaultResponse(normalizedUrl, functionName, new Error('XHR timeout')));
                };
                
                // Set timeout if specified
                if (options.timeout) {
                    xhr.timeout = options.timeout;
                } else {
                    xhr.timeout = _requestState.requestTimeout;
                }
                
                xhr.send(formData);
                
            } catch (error) {
                console.error("[API] ❌ xhrUpload error:", error);
                resolve(getSafeDefaultResponse(url || 'unknown', 'xhrUpload', error));
            }
        });
    }
    
    /**
     * api.healthCheck() - Check API health status
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with health status
     */
    async function apiHealthCheck() {
        const functionName = 'apiHealthCheck';
        
        try {
            // Health check is public - bypass session gates
            const endpoint = '/health';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId('/health', 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => apiHealthCheck(),
                    `HEALTHCHECK`,
                    '/health'
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest('/health', functionName)) {
                return getSafeDefaultResponse('/health', functionName);
            }
            
            trackRequestStart('/health', functionName);
            
            try {
                // Try multiple endpoints to determine health
                const endpoints = [
                    '/health',
                    '/status',
                    '/api/health',
                    '/api/status'
                ];
                
                for (const ep of endpoints) {
                    try {
                        // 🔧 UPDATED: Use enhanced secure fetch
                        const result = await enhancedSecureFetch(ep, { 
                            method: 'GET',
                            auth: false 
                        });
                        
                        if (result.success) {
                            trackRequestEnd('/health', functionName, true);
                            return {
                                ok: true,
                                success: true,
                                status: 200,
                                statusText: 'Healthy',
                                data: result.data,
                                endpoint: ep,
                                healthy: true,
                                timestamp: new Date().toISOString()
                            };
                        }
                    } catch (error) {
                        continue; // Try next endpoint
                    }
                }
                
                // All endpoints failed
                trackRequestEnd('/health', functionName, false);
                trackError('/health', functionName, 'health_check_failed');
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Unhealthy',
                    data: { message: 'All health check endpoints failed' },
                    healthy: false,
                    timestamp: new Date().toISOString()
                };
                
            } catch (error) {
                trackRequestEnd('/health', functionName, false);
                const errorCount = trackError('/health', functionName, 'health_check_error');
                
                if (shouldLogError('/health', 'health_check_error')) {
                    console.error("[API] ❌ api.healthCheck() error:", error.message);
                }
                
                return {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Health check failed',
                    data: { message: error.message || 'Health check failed' },
                    healthy: false,
                    timestamp: new Date().toISOString(),
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ api.healthCheck() critical error:", error);
            return getSafeDefaultResponse('/health', functionName, error);
        }
    }
    
    // ============================================================================
    // ENHANCED IFRAME METHODS WITH CENTRALIZED TOKEN HANDLING
    // ============================================================================
    
    /**
     * getMessages() - Get all messages (used by message.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with messages data
     */
    async function getMessages() {
        const functionName = 'getMessages';
        const endpoint = '/messages';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getMessages(),
                    `GET messages`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached messages");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_messages_failed')) {
                        console.error("[API] ❌ getMessages failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getMessages failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached messages'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_messages_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_messages_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_messages_error')) {
                    console.error("[API] ❌ getMessages error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getMessages error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached messages',
                        error: error.message
                    };
                }
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Network Error',
                    data: { message: 'Failed to fetch messages' },
                    headers: {},
                    networkError: true,
                    message: 'Failed to fetch messages',
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ getMessages critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * getMessageById() - Get message by ID (used by message.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {string} messageId - Message ID
     * @returns {Promise} Promise with message data
     */
    async function getMessageById(messageId) {
        const functionName = 'getMessageById';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!messageId) {
                console.error("[API] ❌ getMessageById called without messageId");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Message ID is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // 🔧 FIX: Normalize endpoint
            const endpoint = `/messages/${encodeURIComponent(messageId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getMessageById(messageId),
                    `GET message ${messageId}`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached message ${messageId}");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_message_by_id_failed')) {
                        console.error("[API] ❌ getMessageById failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_message_by_id_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_message_by_id_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_message_by_id_error')) {
                    console.error("[API] ❌ getMessageById error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getMessageById error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached message',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getMessageById critical error:", error);
            return getSafeDefaultResponse('/messages/:id', functionName, error);
        }
    }
    
    /**
     * sendMessage() - Send a new message (used by message.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} messageData - Message data
     * @returns {Promise} Promise with sent message data
     */
    async function sendMessage(messageData) {
        const functionName = 'sendMessage';
        const endpoint = '/messages';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!messageData) {
                console.error("[API] ❌ sendMessage called without messageData");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Message data is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => sendMessage(messageData),
                    `POST message`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: messageData
                });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'send_message_failed')) {
                        console.error("[API] ❌ sendMessage failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `send_message_failed_${result.status}`);
                    return result;
                }
                
                // Invalidate messages cache since we added a new message
                if (_apiCache) {
                    _apiCache.delete(`get_${normalizedEndpoint}`);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'send_message_error');
                
                if (shouldLogError(normalizedEndpoint, 'send_message_error')) {
                    console.error("[API] ❌ sendMessage error:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ sendMessage critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * getFriends() - Get all friends (used by friend.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with friends data
     */
    async function getFriends() {
        const functionName = 'getFriends';
        const endpoint = '/friends/list';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getFriends(),
                    `GET friends`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log("[API] ✅ Returning cached friends");
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return {
                    ok: true,
                    success: true,
                    status: 200,
                    statusText: 'OK (cached)',
                    data: cachedData,
                    headers: {},
                    cached: true,
                    offline: true
                };
            }
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_friends_failed')) {
                        console.error("[API] ❌ getFriends failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getFriends failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached friends'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_friends_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_friends_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_friends_error')) {
                    console.error("[API] ❌ getFriends error:", error.message);
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log("[API] ✅ getFriends error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached friends',
                        error: error.message
                    };
                }
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Network Error',
                    data: { message: 'Failed to fetch friends' },
                    headers: {},
                    networkError: true,
                    message: 'Failed to fetch friends',
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ getFriends critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * addFriend() - Add a friend (used by friend.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {string} userId - User ID to add as friend
     * @returns {Promise} Promise with friend request data
     */
    async function addFriend(userId) {
        const functionName = 'addFriend';
        const endpoint = '/friends/add';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!userId) {
                console.error("[API] ❌ addFriend called without userId");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'User ID is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // Safety: Check if request should proceed
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => addFriend(userId),
                    `POST add friend ${userId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: { userId: userId }
                });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'add_friend_failed')) {
                        console.error("[API] ❌ addFriend failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `add_friend_failed_${result.status}`);
                    return result;
                }
                
                // Invalidate friends cache since we added a new friend
                if (_apiCache) {
                    _apiCache.delete('get_/api/friends/list');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'add_friend_error');
                
                if (shouldLogError(normalizedEndpoint, 'add_friend_error')) {
                    console.error("[API] ❌ addFriend error:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ addFriend critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * getGroups() - Get all groups (used by group.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with groups data
     */
    async function getGroups() {
        const functionName = 'getGroups';
        const endpoint = '/groups';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getGroups(),
                    `GET groups`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached groups");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_groups_failed')) {
                        console.error("[API] ❌ getGroups failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getGroups failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached groups'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_groups_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_groups_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_groups_error')) {
                    console.error("[API] ❌ getGroups error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getGroups error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached groups',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getGroups critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * getGroupById() - Get group by ID (used by group.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {string} groupId - Group ID
     * @returns {Promise} Promise with group data
     */
    async function getGroupById(groupId) {
        const functionName = 'getGroupById';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!groupId) {
                console.error("[API] ❌ getGroupById called without groupId");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Group ID is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // 🔧 FIX: Normalize endpoint
            const endpoint = `/groups/${encodeURIComponent(groupId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getGroupById(groupId),
                    `GET group ${groupId}`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached group ${groupId}");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_group_by_id_failed')) {
                        console.error("[API] ❌ getGroupById failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_group_by_id_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_group_by_id_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_group_by_id_error')) {
                    console.error("[API] ❌ getGroupById error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getGroupById error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached group',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getGroupById critical error:", error);
            return getSafeDefaultResponse('/groups/:id', functionName, error);
        }
    }
    
    /**
     * createGroup() - Create a new group (used by group.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} groupData - Group data
     * @returns {Promise} Promise with created group data
     */
    async function createGroup(groupData) {
        const functionName = 'createGroup';
        const endpoint = '/groups';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!groupData) {
                console.error("[API] ❌ createGroup called without groupData");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Group data is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // Safety: Check if request should proceed
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => createGroup(groupData),
                    `POST create group`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: groupData
                });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'create_group_failed')) {
                        console.error("[API] ❌ createGroup failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `create_group_failed_${result.status}`);
                    return result;
                }
                
                // Invalidate groups cache since we added a new group
                if (_apiCache) {
                    _apiCache.delete('get_/api/group');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'create_group_error');
                
                if (shouldLogError(normalizedEndpoint, 'create_group_error')) {
                    console.error("[API] ❌ createGroup error:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ createGroup critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * getStatuses() - Get all statuses (used by status.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with statuses data
     */
    async function getStatuses() {
        const functionName = 'getStatuses';
        const endpoint = '/statuses/all';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getStatuses(),
                    `GET statuses`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log("[API] ✅ Returning cached statuses");
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return {
                    ok: true,
                    success: true,
                    status: 200,
                    statusText: 'OK (cached)',
                    data: cachedData,
                    headers: {},
                    cached: true,
                    offline: true,
                    message: 'Using cached data (offline)'
                };
            }
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_statuses_failed')) {
                        console.error("[API] ❌ getStatuses failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getStatuses failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached data'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_statuses_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_statuses_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_statuses_error')) {
                    console.error("[API] ❌ getStatuses error:", error.message);
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log("[API] ✅ getStatuses error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached data',
                        error: error.message
                    };
                }
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Network Error',
                    data: { message: 'Failed to fetch statuses' },
                    headers: {},
                    networkError: true,
                    message: 'Failed to fetch statuses',
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ getStatuses critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * getStatus() - Get status by ID (used by status.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {string} statusId - Status ID
     * @returns {Promise} Promise with status data
     */
    async function getStatus(statusId) {
        const functionName = 'getStatus';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!statusId) {
                console.error("[API] ❌ getStatus called without statusId");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Status ID is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // 🔧 FIX: Normalize endpoint
            const endpoint = `/status/${encodeURIComponent(statusId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getStatus(statusId),
                    `GET status ${statusId}`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached status ${statusId}");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_status_failed')) {
                        console.error("[API] ❌ getStatus failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_status_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_status_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_status_error')) {
                    console.error("[API] ❌ getStatus error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getStatus error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached status',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getStatus critical error:", error);
            return getSafeDefaultResponse('/status/:id', functionName, error);
        }
    }
    
    /**
     * createStatus() - Create a new status (used by status.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} statusData - Status data
     * @returns {Promise} Promise with created status data
     */
    async function createStatus(statusData) {
        const functionName = 'createStatus';
        const endpoint = '/status';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!statusData) {
                console.error("[API] ❌ createStatus called without statusData");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Status data is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // Safety: Check if request should proceed
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => createStatus(statusData),
                    `POST create status`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: statusData
                });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'create_status_failed')) {
                        console.error("[API] ❌ createStatus failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `create_status_failed_${result.status}`);
                    return result;
                }
                
                // Invalidate statuses cache since we added a new status
                if (_apiCache) {
                    _apiCache.delete('get_/api/statuses/all');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'create_status_error');
                
                if (shouldLogError(normalizedEndpoint, 'create_status_error')) {
                    console.error("[API] ❌ createStatus error:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ createStatus critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * getCalls() - Get all calls (used by calls.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with calls data
     */
    async function getCalls() {
        const functionName = 'getCalls';
        const endpoint = '/calls';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getCalls(),
                    `GET calls`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached calls");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_calls_failed')) {
                        console.error("[API] ❌ getCalls failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getCalls failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached calls'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_calls_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_calls_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_calls_error')) {
                    console.error("[API] ❌ getCalls error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getCalls error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached calls',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getCalls critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * startCall() - Start a new call (used by calls.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} callData - Call data
     * @returns {Promise} Promise with call data
     */
    async function startCall(callData) {
        const functionName = 'startCall';
        const endpoint = '/calls/start';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!callData) {
                console.error("[API] ❌ startCall called without callData");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Call data is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // Safety: Check if request should proceed
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => startCall(callData),
                    `POST start call`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: callData
                });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'start_call_failed')) {
                        console.error("[API] ❌ startCall failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `start_call_failed_${result.status}`);
                    return result;
                }
                
                // Invalidate calls cache since we started a new call
                if (_apiCache) {
                    _apiCache.delete('get_/api/calls');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'start_call_error');
                
                if (shouldLogError(normalizedEndpoint, 'start_call_error')) {
                    console.error("[API] ❌ startCall error:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ startCall critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // ============================================================================
    // ENHANCED SETTINGS & FEATURES HANDLING WITH BACKGROUND UPDATES
    // ============================================================================
    
    /**
     * getSettings() - Get user settings (used by settings.html)
     * Uses centralized token system and caching
     * Includes caching and background updates
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with settings data
     */
    async function getSettings() {
        const functionName = 'getSettings';
        const endpoint = '/settings';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getSettings(),
                    `GET settings`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log("[API] ✅ Returning cached settings");
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return {
                    ok: true,
                    success: true,
                    status: 200,
                    statusText: 'OK (cached)',
                    data: cachedData,
                    headers: {},
                    cached: true,
                    offline: true
                };
            }
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_settings_failed')) {
                        console.error("[API] ❌ getSettings failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getSettings failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached settings'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_settings_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                // Start background update for other settings if we have a token
                const token = _getUserToken ? _getUserToken() : null;
                if (token) {
                    setTimeout(async () => {
                        try {
                            // Background update for notifications
                            await getNotifications();
                            
                            // Background update for user preferences
                            await getUserPreferences();
                            
                            console.log("[API] ✅ Background settings update completed");
                        } catch (bgError) {
                            console.log("[API] ⏳ Background settings update failed:", bgError.message);
                        }
                    }, 2000); // Wait 2 seconds before background updates
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_settings_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_settings_error')) {
                    console.error("[API] ❌ getSettings error:", error.message);
                }
                
                // Return cached data as fallback
                if (cachedData) {
                    console.log("[API] ✅ getSettings error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached settings',
                        error: error.message
                    };
                }
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Network Error',
                    data: { message: 'Failed to fetch settings' },
                    headers: {},
                    networkError: true,
                    message: 'Failed to fetch settings',
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ getSettings critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * getFeatures() - Get available features from server
     * Uses centralized token system and caching
     * Includes caching and safe defaults
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with features data
     */
    async function getFeatures() {
        const functionName = 'getFeatures';
        const endpoint = '/features';
        
        try {
            // Default features if server is unreachable
            const defaultFeatures = {
                chat: true,
                calls: true,
                status: true,
                groups: true,
                friends: true,
                notifications: true,
                darkMode: false,
                offlineMode: true
            };
            
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getFeatures(),
                    `GET features`,
                    endpoint
                ).then(result => {
                    if (result && result.ok === false && result.safetyBlocked) {
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (safety blocked)',
                            data: defaultFeatures,
                            headers: {},
                            default: true,
                            message: 'Using default features (safety blocked)'
                        };
                    }
                    return result;
                }).catch(() => {
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (queue error)',
                        data: defaultFeatures,
                        headers: {},
                        default: true,
                        message: 'Using default features (queue error)'
                    };
                });
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return {
                    ok: true,
                    success: true,
                    status: 200,
                    statusText: 'OK (safety blocked)',
                    data: defaultFeatures,
                    headers: {},
                    default: true,
                    message: 'Using default features (safety blocked)'
                };
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log("[API] ✅ Returning cached features");
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return {
                    ok: true,
                    success: true,
                    status: 200,
                    statusText: 'OK (cached)',
                    data: cachedData,
                    headers: {},
                    cached: true,
                    offline: true
                };
            }
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_features_failed')) {
                        console.warn("[API] ⏳ getFeatures failed: ${result.status} - ${result.message}, using cached or default");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getFeatures failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached features'
                        };
                    }
                    
                    // Use defaults
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_features_failed_${result.status}`);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (default)',
                        data: defaultFeatures,
                        headers: {},
                        default: true,
                        message: 'Using default features'
                    };
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_features_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_features_error')) {
                    console.error("[API] ❌ getFeatures error:", error.message);
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log("[API] ✅ getFeatures error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached features',
                        error: error.message
                    };
                }
                
                // Use defaults
                return {
                    ok: true,
                    success: true,
                    status: 200,
                    statusText: 'OK (default)',
                    data: defaultFeatures,
                    headers: {},
                    default: true,
                    message: 'Using default features',
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ getFeatures critical error:", error);
            // Always return defaults for critical errors
            return {
                ok: true,
                success: true,
                status: 200,
                statusText: 'OK (default)',
                data: {
                    chat: true,
                    calls: true,
                    status: true,
                    groups: true,
                    friends: true,
                    notifications: true,
                    darkMode: false,
                    offlineMode: true
                },
                headers: {},
                default: true,
                message: 'Using default features (critical error)',
                error: error.message
            };
        }
    }
    
    /**
     * updateSettings() - Update user settings (used by settings.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} settingsData - Settings data
     * @returns {Promise} Promise with updated settings data
     */
    async function updateSettings(settingsData) {
        const functionName = 'updateSettings';
        const endpoint = '/settings';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!settingsData) {
                console.error("[API] ❌ updateSettings called without settingsData");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Settings data is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // Safety: Check if request should proceed
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'PUT');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'PUT');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => updateSettings(settingsData),
                    `PUT update settings`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'PUT',
                    body: settingsData
                });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'update_settings_failed')) {
                        console.error("[API] ❌ updateSettings failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `update_settings_failed_${result.status}`);
                    return result;
                }
                
                // Update cache with new settings
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(`get_${normalizeEndpoint('/settings')}`, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'update_settings_error');
                
                if (shouldLogError(normalizedEndpoint, 'update_settings_error')) {
                    console.error("[API] ❌ updateSettings error:", error.message);
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ updateSettings critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    /**
     * getTools() - Get tools data (used by Tools.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with tools data
     */
    async function getTools() {
        const functionName = 'getTools';
        const endpoint = '/tools';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getTools(),
                    `GET tools`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached tools");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_tools_failed')) {
                        console.error("[API] ❌ getTools failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getTools failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached tools'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_tools_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_tools_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_tools_error')) {
                    console.error("[API] ❌ getTools error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getTools error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached tools',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getTools critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // ============================================================================
    // ADDITIONAL DATA METHODS - ALL USE CENTRALIZED TOKEN HANDLING
    // ============================================================================
    
    async function getUsers() {
        const functionName = 'getUsers';
        const endpoint = '/users';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getUsers(),
                    `GET users`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached users");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_users_failed')) {
                        console.error("[API] ❌ getUsers failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getUsers failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached users'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_users_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_users_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_users_error')) {
                    console.error("[API] ❌ getUsers error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getUsers error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached users',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getUsers critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getUserById(userId) {
        const functionName = 'getUserById';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!userId) {
                console.error("[API] ❌ getUserById called without userId");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'User ID is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // 🔧 FIX: Normalize endpoint
            const endpoint = `/users/${encodeURIComponent(userId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getUserById(userId),
                    `GET user ${userId}`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached user ${userId}");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_user_by_id_failed')) {
                        console.error("[API] ❌ getUserById failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_user_by_id_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_user_by_id_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_user_by_id_error')) {
                    console.error("[API] ❌ getUserById error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getUserById error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached user',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getUserById critical error:", error);
            return getSafeDefaultResponse('/users/:id', functionName, error);
        }
    }
    
    async function getChats() {
        const functionName = 'getChats';
        const endpoint = '/chats';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getChats(),
                    `GET chats`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached chats");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_chats_failed')) {
                        console.error("[API] ❌ getChats failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getChats failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached chats'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_chats_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_chats_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_chats_error')) {
                    console.error("[API] ❌ getChats error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getChats error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached chats',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getChats critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getChatById(chatId) {
        const functionName = 'getChatById';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!chatId) {
                console.error("[API] ❌ getChatById called without chatId");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Chat ID is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            // 🔧 FIX: Normalize endpoint
            const endpoint = `/chats/${encodeURIComponent(chatId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getChatById(chatId),
                    `GET chat ${chatId}`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached chat ${chatId}");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_chat_by_id_failed')) {
                        console.error("[API] ❌ getChatById failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_chat_by_id_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_chat_by_id_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_chat_by_id_error')) {
                    console.error("[API] ❌ getChatById error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getChatById error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached chat',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getChatById critical error:", error);
            return getSafeDefaultResponse('/chats/:id', functionName, error);
        }
    }
    
    async function getContacts() {
        const functionName = 'getContacts';
        const endpoint = '/contacts';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getContacts(),
                    `GET contacts`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached contacts");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_contacts_failed')) {
                        console.error("[API] ❌ getContacts failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getContacts failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached contacts'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_contacts_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_contacts_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_contacts_error')) {
                    console.error("[API] ❌ getContacts error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getContacts error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached contacts',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getContacts critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // ============================================================================
    // ENHANCED NOTIFICATION METHODS
    // ============================================================================
    
    async function getNotifications() {
        const functionName = 'getNotifications';
        const endpoint = '/notifications';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getNotifications(),
                    `GET notifications`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached notifications");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_notifications_failed')) {
                        console.error("[API] ❌ getNotifications failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getNotifications failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached notifications'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_notifications_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_notifications_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_notifications_error')) {
                    console.error("[API] ❌ getNotifications error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getNotifications error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached notifications',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getNotifications critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getUserPreferences() {
        const functionName = 'getUserPreferences';
        const endpoint = '/user/preferences';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getUserPreferences(),
                    `GET user preferences`,
                    endpoint
                );
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                // Check cache first
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log("[API] ✅ Returning cached user preferences");
                    trackRequestEnd(normalizedEndpoint, functionName, true);
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        offline: true
                    };
                }
                
                // 🔧 UPDATED: Use enhanced secure fetch
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                // 🔧 FIX: Safe error handling
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_user_preferences_failed')) {
                        console.error("[API] ❌ getUserPreferences failed: ${result.status} - ${result.message}");
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log("[API] ✅ getUserPreferences failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached preferences'
                        };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    // For other errors, return the result without throwing
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_user_preferences_failed_${result.status}`);
                    return result;
                }
                
                // Cache successful response
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_user_preferences_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_user_preferences_error')) {
                    console.error("[API] ❌ getUserPreferences error:", error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log("[API] ✅ getUserPreferences error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached preferences',
                        error: error.message
                    };
                }
                
                // 🔧 FIX: Safe error handling with defensive checks
                const errorObj = {
                    ok: false,
                    success: false,
                    status: error.status || 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Request failed' },
                    headers: {},
                    error: true,
                    message: error.message || 'Request failed'
                };
                
                // Don't throw, return error object
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getUserPreferences critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // ============================================================================
    // REQUEST FUNCTION FOR COMPATIBILITY
    // ============================================================================
    
    async function request(endpoint, options = {}) {
        const functionName = 'request';
        
        try {
            // 🔧 FIX: Normalize endpoint with /api prefix
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check if this is a public endpoint
            const isPublic = isPublicEndpoint(normalizedEndpoint);
            
            if (shouldLogError(normalizedEndpoint, 'request_call')) {
                console.log("[API] ⏳ Request normalized: ${endpoint} → ${normalizedEndpoint}");
            }
            
            // 🔥 CHECK GATEWAY GATES
            const requestId = generateRequestId(endpoint, options.method || 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => request(endpoint, options),
                    `${options.method || 'GET'} ${endpoint}`,
                    endpoint
                );
            }
            
            // 🔧 Wait for session if this is a protected call
            if (!isPublic && !isSessionReady()) {
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Use secureApiFetch with LOGIN/REGISTRATION FIXES
            // 🔧 CRITICAL: Public endpoints bypass all token checks
            
            // Check if this is a public endpoint (using normalized endpoint)
            const isPublicEndpointFlag = _isPublicEndpoint ? _isPublicEndpoint(normalizedEndpoint) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedEndpoint) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedEndpoint) : false;
            
            // If this is a public endpoint, execute immediately without queue
            if (isPublic || isPublicEndpointFlag || isStatus || isAuth) {
                if (shouldLogError(normalizedEndpoint, 'public_endpoint')) {
                    console.log("[API] ⏳ PUBLIC/AUTH/STATUS endpoint - executing immediately: ${normalizedEndpoint}");
                }
                const result = await enhancedSecureFetch(endpoint, options);
                trackRequestEnd(normalizedEndpoint, functionName, result.success);
                return result;
            }
            
            // Protected endpoint - check token and queue if needed
            const requiresAuth = options.auth !== false;
            const token = _getUserToken ? _getUserToken() : null;
            
            // If this is a protected endpoint and we don't have a token, 
            // and login is not complete, queue the request
            if (requiresAuth && !token && _apiRequestQueue && !_apiRequestQueue.isLoginComplete()) {
                console.log("[API] ⏳ Delaying protected endpoint until login complete: ${normalizedEndpoint}");
                
                const result = await _apiRequestQueue.addRequest(
                    () => enhancedSecureFetch(endpoint, options),
                    `Protected endpoint: ${normalizedEndpoint}`,
                    normalizedEndpoint
                );
                
                trackRequestEnd(normalizedEndpoint, functionName, result?.success);
                return result;
            }
            
            // Otherwise, use enhanced secure fetch immediately
            const result = await enhancedSecureFetch(endpoint, options);
            trackRequestEnd(normalizedEndpoint, functionName, result.success);
            return result;
            
        } catch (error) {
            trackRequestEnd(normalizeEndpoint(endpoint || 'unknown'), functionName, false);
            const errorCount = trackError(normalizeEndpoint(endpoint || 'unknown'), functionName, 'request_error');
            
            if (shouldLogError(normalizeEndpoint(endpoint || 'unknown'), 'request_error')) {
                console.error("[API] ❌ request function error for ${endpoint}:", error.message);
            }
            
            return getSafeDefaultResponse(endpoint || 'unknown', functionName, error);
        }
    }
    
    // ============================================================================
    // TESTING UTILITIES
    // ============================================================================
    
    /**
     * Test endpoint normalization (for development only)
     */
    function testNormalization() {
        try {
            const testCases = [
                // Test cases from requirements
                ['auth/login', '/api/auth/login'],
                ['/auth/login', '/api/auth/login'],
                ['/api/auth/login', '/api/auth/login'],
                ['auth/register', '/api/auth/register'],
                ['user/profile', '/api/user/profile'],
                ['status', '/api/status'],
                ['', '/api/'],
                [null, '/api/'],
                [undefined, '/api/'],
                
                // Edge cases - 🔧 FIXED
                ['api/auth/login', '/api/auth/login'], // Input has "api/" prefix
                ['/api/api/auth/login', '/api/auth/login'], // Double prefix
                ['API/auth/login', '/api/auth/login'], // Case insensitive
                ['api/auth/login/', '/api/auth/login/'], // Trailing slash
                ['https://example.com/api/test', 'https://example.com/api/test'], // Full URL
                ['http://localhost:3000/auth/login', 'http://localhost:3000/auth/login'], // Full URL with port
                
                // Additional edge cases
                ['auth', '/api/auth'],
                ['/auth', '/api/auth'],
                ['auth/', '/api/auth/'],
                ['/api/auth', '/api/auth'],
                ['/api/auth/', '/api/auth/'],
            ];
            
            console.log('[API] 🧪 Testing endpoint normalization:');
            testCases.forEach(([input, expected]) => {
                const result = normalizeEndpoint(input);
                const pass = result === expected;
                console.log(`  ${pass ? '✅' : '❌'} "${input}" → "${result}" ${pass ? '' : `(expected: "${expected}")`}`);
            });
        } catch (error) {
            console.error("[API] ❌ testNormalization failed:", error);
        }
    }
    
    // ============================================================================
    // PUBLIC API INTERFACE
    // ============================================================================
    
    /**
     * Initialize the public API interface
     */
    function initPublicInterface() {
        try {
            // Initialize dependencies first
            initDependencies();
            
            // 🔥 INITIALIZE GATEWAY
            initializeGateway();
            
            // 🔥 SETUP ANTI-PATTERN PREVENTION
            blockDirectFetchCalls();
            monitorPolling();
            setupFailureRecovery();
            
            // Create the public API object
            const publicApi = {
                // Core methods
                secureFetch: _secureApiFetch,
                get: apiGet,
                post: apiPost,
                put: apiPut,
                delete: apiDelete,
                upload: apiUpload,
                healthCheck: apiHealthCheck,
                request: request,
                
                // Helper methods for testing
                _normalizeEndpoint: normalizeEndpoint,
                _normalizeAuthPayload: normalizeAuthPayload,
                _testNormalization: testNormalization,
                _safeJsonSerialize: safeJsonSerialize,
                _safeParseResponse: safeParseResponse,
                _createErrorResponse: createErrorResponse,
                
                // Safety methods (for debugging)
                _safetyState: _safetyState,
                _getSafeDefaultResponse: getSafeDefaultResponse,
                
                // Gateway state (for debugging)
                _gatewayState: _gatewayState,
                
                // Iframe methods
                getMessages,
                getMessageById,
                sendMessage,
                getFriends,
                addFriend,
                getGroups,
                getGroupById,
                createGroup,
                getStatuses,
                getStatus,
                createStatus,
                getCalls,
                startCall,
                
                // Settings & features
                getSettings,
                getFeatures,
                updateSettings,
                getTools,
                
                // Additional data methods
                getUsers,
                getUserById,
                getChats,
                getChatById,
                getContacts,
                getNotifications,
                getUserPreferences,
                
                // Constants
                TRUSTED_REQUEST_MARKER
            };
            
            // Expose to window.api.request without overriding existing window.api
            if (!window.api) {
                window.api = {};
            }
            
            // Only create request object if it doesn't exist
            if (!window.api.request) {
                window.api.request = publicApi;
            } else {
                // Merge with existing, preserving existing properties
                Object.assign(window.api.request, publicApi);
            }
            
            // Provide backward compatibility for legacy code
            if (!window.secureApiFetch) {
                window.secureApiFetch = _secureApiFetch;
            }
            
            // Also expose to __API_REQUESTS for compatibility
            window.__API_REQUESTS = publicApi;
            
            // Expose original fetch for internal use
            if (!window.__originalFetch && window.fetch) {
                window.__originalFetch = window.fetch;
            }
            
            console.log("[API] ✅ api.request.js initialized with hardened centralized gateway (HEAD allowed, trusted modules allowed)");
            
            // Test normalization in development
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                setTimeout(() => {
                    testNormalization();
                }, 1000);
            }
            
            // Dispatch ready event
            setTimeout(() => {
                try {
                    window.dispatchEvent(new Event("api-request-ready"));
                } catch (e) {
                    console.log('[API] ⏳ api-request-ready event dispatched');
                }
            }, 100);
            
        } catch (error) {
            console.error("[API] ❌ Failed to initialize public interface:", error);
            // Still try to expose minimal API
            if (!window.api) window.api = {};
            if (!window.api.request) window.api.request = {
                get: () => Promise.resolve(getSafeDefaultResponse('unknown', 'fallback')),
                post: () => Promise.resolve(getSafeDefaultResponse('unknown', 'fallback')),
                request: () => Promise.resolve(getSafeDefaultResponse('unknown', 'fallback'))
            };
        }
    }
    
    // Initialize the module
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPublicInterface);
    } else {
        initPublicInterface();
    }
    
})();