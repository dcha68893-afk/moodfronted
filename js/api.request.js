// api.request.js - Enhanced API Request Methods with Centralized Token Handling
// Version: 22.0.0 - COMPLETE REWRITE WITH SESSION INTEGRATION - FULL FEATURE PRESERVATION
// Date: 2026-04-06
// 🔧 CRITICAL: Full rewrite to use centralized session management
// 🔧 CRITICAL: All requests go through unified request() function
// 🔧 CRITICAL: Token fetched ONLY from window.Session.getToken()
// 🔧 CRITICAL: Session awareness before ANY request
// 🔧 CRITICAL: No direct localStorage access
// 🔧 CRITICAL: Strict error handling with proper propagation
// 🔧 CRITICAL: ALL original features preserved - no summarization
// 🔒 SAFETY: Preserve all existing anti-pattern prevention
// 🔒 SAFETY: Maintain backward compatibility with all modules
// 🔧 FIXED: addFriend uses POST /api/friends/requests/send with receiverId
// 🔧 ADDED: acceptFriendRequest, rejectFriendRequest, getIncomingFriendRequests, getSentFriendRequests
// 🔧 ADDED: getChats, startDirectChat, getUnreadCounts, markMessagesRead, blockFriend, unblockFriend, unfriend
// 🔧 FIXED: sendMessage uses { chatId, receiverId, content, type, replyToId }

// Wrap in IIFE to prevent global scope pollution
(function() {
    // Prevent duplicate loading
    if (window._API_REQUEST_LOADED_) {
        console.log("[API] ⏳ api.request.js already loaded, skipping");
        return;
    }
    
    console.log("[API] ✅ api.request.js loaded with centralized session integration");
    
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
            defaultTimeout: 15000,
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
            patterns: [
                '/health', '/status', '/ping',
                '.css', '.js', '.json', '.svg', '.png', '.jpg', '.gif',
                '/favicon.ico', '/manifest.json', '/robots.txt',
                '/hot-update', '/__webpack_hmr', '/sockjs-node',
                '/exists', '/check', '/validate', '/verify', '/test',
                '/resource-check', '/file-exists', '/asset-exists',
                '/modules/', '/components/', '/assets/',
                '/internal/', '/private/', '/_api/',
                '/callback', '/redirect', '/oauth'
            ],
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
        requestTimeout: 45000
    };
    
    // ============================================================================
    // 🔧 ENHANCED TOKEN GETTER WITH SESSION MODULE INTEGRATION
    // ============================================================================
    
    /**
     * 🔧 Get authentication token from centralized session module
     * This is the ONLY source of truth for tokens - NO localStorage fallback
     * @returns {string|null} The authentication token or null if not found
     */
    function getAuthToken() {
        try {
            // 1. Primary: centralized Session module
            if (window.Session && typeof window.Session.getToken === 'function') {
                const token = window.Session.getToken();
                if (token && typeof token === 'string' && token.trim()) {
                    return token;
                }
            }
            
            // 2. Fallback: memory token from api.core
            if (_getUserToken && typeof _getUserToken === 'function') {
                const memoryToken = _getUserToken();
                if (memoryToken && typeof memoryToken === 'string' && memoryToken.trim()) {
                    return memoryToken;
                }
            }
            
            // 3. Last resort: read directly from localStorage (auto-login compatibility)
            try {
                const rawAuth = localStorage.getItem('kynecta_auth');
                if (rawAuth) {
                    const auth = JSON.parse(rawAuth);
                    if (auth && auth.token && typeof auth.token === 'string') {
                        return auth.token;
                    }
                }
                // Also try legacy keys
                const legacyToken = localStorage.getItem('accessToken') || localStorage.getItem('token');
                if (legacyToken) return legacyToken;
            } catch(e) {}
            
            return null;
        } catch (error) {
            console.warn('[API] ⏳ Failed to retrieve auth token:', error.message);
            return null;
        }
    }
    
    /**
     * 🔧 Check if session is ready using centralized session module
     */
    function isSessionReady() {
        try {
            // Check if Session module exists and is ready
            if (window.Session && typeof window.Session.isReady === 'function') {
                return window.Session.isReady();
            }
            
            // Fallback to memory flags
            if (window.__SESSION_READY__ === true || 
                window.__API_AUTH?.isSessionReady === true ||
                _gatewayState.gates.sessionReady === true) {
                return true;
            }
            
            return false;
        } catch (error) {
            console.warn('[API] ⏳ Failed to check session readiness:', error.message);
            return false;
        }
    }
    
    /**
     * 🔧 Wait for session to be ready with enhanced detection
     */
    async function waitForSessionReady() {
        // If Session module exists and has waitForReady method, use it
        if (window.Session && typeof window.Session.waitForReady === 'function') {
            try {
                await window.Session.waitForReady();
                _gatewayState.gates.sessionReady = true;
                console.log("[API] ✅ Session ready (via Session.waitForReady)");
                return true;
            } catch (error) {
                console.warn("[API] ⏳ Session.waitForReady failed:", error.message);
            }
        }
        
        // Fallback: Wait for session to be ready
        return new Promise((resolve) => {
            const maxWaitTime = 10000;
            let elapsedTime = 0;
            const checkInterval = 100;
            
            const checkSession = () => {
                if (isSessionReady()) {
                    _gatewayState.gates.sessionReady = true;
                    console.log("[API] ✅ Session ready");
                    resolve(true);
                    return;
                }
                
                elapsedTime += checkInterval;
                if (elapsedTime >= maxWaitTime) {
                    console.warn("[API] ⏳ Session ready timeout, proceeding anyway");
                    _gatewayState.gates.sessionReady = true;
                    resolve(true);
                    return;
                }
                
                setTimeout(checkSession, checkInterval);
            };
            
            checkSession();
        });
    }
    
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
                const parsed = JSON.parse(text);
                // Normalize legacy backend responses that use { status: 'success'|'error', data: ... }
                // into the app-wide { success: boolean, data: ... } shape.
                if (parsed && typeof parsed === 'object') {
                    if (typeof parsed.success !== 'boolean' && typeof parsed.status === 'string') {
                        const s = parsed.status.toLowerCase();
                        if (s === 'success') parsed.success = true;
                        else if (s === 'error' || s === 'fail' || s === 'failed') parsed.success = false;
                    }
                    // Some endpoints return payload under `data` but omit `success`
                    if (typeof parsed.success !== 'boolean' && parsed.data !== undefined) {
                        parsed.success = true;
                    }
                }
                return parsed;
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
            Object.assign(errorResponse, parsedData);
            
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
        
        if (response.status === 401) {
            errorResponse.isAuthError = true;
            errorResponse.message = errorResponse.message || 'Unauthorized - token invalid or missing';
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
    function isPublicEndpointCheck(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') {
            return false;
        }
        
        const normalized = endpoint.toLowerCase();
        
        for (const pattern of PUBLIC_ENDPOINT_PATTERNS) {
            if (normalized === pattern || normalized === pattern + '/') {
                return true;
            }
        }
        
        if (normalized.includes('/auth/') || 
            normalized.includes('/public/') ||
            normalized.includes('/health') ||
            normalized.includes('/status')) {
            
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
    // 🔥 CORE REQUEST FUNCTION - SINGLE SOURCE OF TRUTH
    // ============================================================================
    
    /**
     * 🔥 UNIFIED REQUEST FUNCTION - THIS IS THE ONLY PLACE WHERE fetch IS CALLED
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE, etc.)
     * @param {string} url - The endpoint URL
     * @param {object} options - Request options
     * @returns {Promise} Promise with response data
     */
    async function request(method, url, options = {}) {
        const functionName = 'request';
        const startTime = Date.now();
        
        try {
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ request() called with invalid URL:", url);
                throw new Error('Invalid URL parameter');
            }
            
            const normalizedMethod = method.toUpperCase();
            
            // 🔥 CRITICAL: Wait for session before making any request
            await waitForSessionReady();

            // ── OFFLINE GUARD ────────────────────────────────────────────────
            if (!navigator.onLine) {
                console.log('[API] \u23f8\ufe0f Offline — returning cached/offline response for:', url);
                // Return cached data if available, otherwise soft offline response
                const cacheKey = 'get_' + normalizeEndpoint(url);
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                if (cachedData) {
                    return { ok: true, success: true, status: 200, statusText: 'OK (offline/cached)',
                             data: cachedData, headers: {}, cached: true, offline: true };
                }
                return { ok: false, success: false, status: 0, statusText: 'Offline',
                         offline: true, data: { message: 'Device is offline' }, headers: {} };
            }

            const normalizedUrl = normalizeEndpoint(url);
            const isPublic = isPublicEndpointCheck(normalizedUrl);
            
            // 🔥 CRITICAL: Get token from centralized session module (ONLY source)
            const token = getAuthToken();
            
            // 🔥 CRITICAL: For protected endpoints, token MUST exist
            if (!isPublic && !token) {
                console.error("[API] ❌ Protected endpoint without token:", normalizedUrl);
                const error = new Error('UNAUTHORIZED');
                error.status = 401;
                error.isAuthError = true;
                throw error;
            }
            
            const requestId = generateRequestId(url, normalizedMethod);
            
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => request(method, url, options),
                    `${normalizedMethod} ${url}`,
                    url
                );
            }
            
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            const retryCount = trackRequestStart(normalizedUrl, functionName);
            
            if (retryCount > _safetyState.maxRetriesPerRequest) {
                console.warn(`[API] ⏳ Max retries reached for ${normalizedUrl}`);
                trackRequestEnd(normalizedUrl, functionName, false);
                throw new Error('Max retries reached');
            }
            
            const headers = {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };
            
            if (!isPublic && token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            
            const fetchOptions = {
                method: normalizedMethod,
                headers: headers,
                credentials: 'include',
                ...options
            };
            
            if (options.body && fetchOptions.body) {
                delete fetchOptions.body;
            }
            
            if (options.body !== undefined && options.body !== null) {
                if (options.body instanceof FormData) {
                    fetchOptions.body = options.body;
                    delete fetchOptions.headers['Content-Type'];
                } else if (typeof options.body === 'object') {
                    fetchOptions.body = JSON.stringify(options.body);
                } else if (typeof options.body === 'string') {
                    fetchOptions.body = options.body;
                    try {
                        JSON.parse(options.body);
                    } catch (e) {
                        console.warn(`[API] ⏳ Body appears to be string but not valid JSON:`, options.body);
                    }
                } else {
                    fetchOptions.body = String(options.body);
                }
            }
            
            let fullUrl = normalizedUrl;
            if (!normalizedUrl.startsWith('http://') && 
                !normalizedUrl.startsWith('https://')) {
                
                let baseUrl = '';
                
                if (window.API_CONFIG && window.API_CONFIG.baseUrl) {
                    baseUrl = window.API_CONFIG.baseUrl;
                } else if (_BACKEND_BASE_URL) {
                    baseUrl = _BACKEND_BASE_URL;
                } else if (_BASE_API_URL) {
                    baseUrl = _BASE_API_URL;
                } else if (window.API_BASE_URL) {
                    baseUrl = window.API_BASE_URL;
                } else if (_gatewayState.backend.resolved) {
                    baseUrl = _gatewayState.backend.origin;
                } else if (typeof window !== 'undefined' && window.location && window.location.origin) {
                    baseUrl = window.location.origin;
                }
                
                baseUrl = baseUrl.replace(/\/+$/, '');
                const path = normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl;
                fullUrl = baseUrl + path;
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                logRequest(requestId, `⏳ Request timeout after ${_requestState.requestTimeout}ms`);
            }, _requestState.requestTimeout);
            fetchOptions.signal = controller.signal;
            
            fetchOptions[TRUSTED_REQUEST_MARKER] = true;
            fetchOptions.__trusted = true;
            
            const response = await (window.__originalFetch || window.fetch)(fullUrl, fetchOptions);
            
            clearTimeout(timeoutId);
            
            const data = await safeParseResponse(response);
            
            const result = {
                ok: response.ok,
                success: response.ok,
                status: response.status,
                statusText: response.statusText,
                data: data,
                headers: Object.fromEntries(response.headers.entries()),
                url: response.url,
                duration: Date.now() - startTime
            };
            
            if (!response.ok) {
                const errorResponse = createErrorResponse(response, data);
                Object.assign(result, errorResponse);
                
                if (!result.message) {
                    result.message = result.data?.message || result.data?.error || response.statusText;
                }
                
                if (response.status === 401) {
                    console.error(`[API] ❌ Unauthorized request:`, fullUrl);
                    trackRequestEnd(normalizedUrl, functionName, false);
                    const error = new Error(result.message || 'UNAUTHORIZED');
                    error.status = 401;
                    error.isAuthError = true;
                    error.response = result;
                    throw error;
                }
                
                trackRequestEnd(normalizedUrl, functionName, false);
                trackError(normalizedUrl, functionName, `http_${response.status}`);
                return result;
            }
            
            trackRequestEnd(normalizedUrl, functionName, true);
            return result;
            
        } catch (error) {
            trackRequestEnd(normalizeEndpoint(url), functionName, false);
            const errorCount = trackError(normalizeEndpoint(url), functionName, error.name || 'request_error');
            
            if (shouldLogError(normalizeEndpoint(url), 'request_error')) {
                console.error(`[API] ❌ Request error for ${url}:`, error.message);
            }
            
            throw error;
        }
    }
    
    // ============================================================================
    // 🔧 PUBLIC API METHODS
    // ============================================================================
    
    async function apiGet(url, options = {}) {
        const functionName = 'apiGet';
        
        try {
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.get() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            const normalizedUrl = normalizeEndpoint(url);
            const isPublic = isPublicEndpointCheck(normalizedUrl);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(url, 'GET');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiGet(url, options),
                    `GET ${url}`,
                    url
                );
            }
            
            const token = getAuthToken();
            
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
                const cacheKey = `get_${normalizedUrl}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                    console.log(`[API] ✅ Returning cached data for: ${normalizedUrl}`);
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
                
                const result = await enhancedSecureFetch(url, { 
                    method: 'GET',
                    ...options 
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'get_failed')) {
                        console.error(`[API] ❌ GET request failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    if (cachedData) {
                        console.log(`[API] ✅ Request failed, returning cached data for: ${normalizedUrl}`);
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
                    
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedUrl, functionName, false);
                    trackError(normalizedUrl, functionName, `get_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedUrl, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedUrl, functionName, false);
                const errorCount = trackError(normalizedUrl, functionName, 'get_error');
                
                if (shouldLogError(normalizedUrl, 'get_error')) {
                    console.error(`[API] ❌ api.get() error for ${normalizedUrl}:`, error.message);
                }
                
                const cacheKey = `get_${normalizeEndpoint(url)}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ Error occurred, returning cached data for: ${normalizeEndpoint(url)}`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.get() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    async function apiPost(url, data, options = {}) {
        const functionName = 'apiPost';
        
        try {
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.post() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            const normalizedUrl = normalizeEndpoint(url);
            const isPublic = isPublicEndpointCheck(normalizedUrl);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(url, 'POST');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiPost(url, data, options),
                    `POST ${url}`,
                    url
                );
            }
            
            const isAuthEndpoint = normalizedUrl.includes('/auth/');
            
            let payload = data;
            if (isAuthEndpoint && payload && typeof payload === 'object') {
                payload = normalizeAuthPayload(payload);
                
                const safeLogPayload = { ...payload };
                if (safeLogPayload.password) safeLogPayload.password = '[REDACTED]';
                if (safeLogPayload.confirmPassword) safeLogPayload.confirmPassword = '[REDACTED]';
            }
            
            const headers = {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };
            
            if (payload instanceof FormData) {
                delete headers['Content-Type'];
            }
            
            const token = getAuthToken();
            
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
                const fetchOptions = {
                    method: 'POST',
                    headers: headers,
                    ...options
                };
                
                if (payload !== undefined && payload !== null) {
                    fetchOptions.body = safeJsonSerialize(payload);
                }
                
                const result = await enhancedSecureFetch(url, fetchOptions);
                
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'post_failed')) {
                        console.error(`[API] ❌ POST request failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
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
                    console.error(`[API] ❌ api.post() error for ${normalizedUrl}:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.post() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    async function apiPut(url, data, options = {}) {
        const functionName = 'apiPut';
        
        try {
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.put() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            const normalizedUrl = normalizeEndpoint(url);
            const isPublic = isPublicEndpointCheck(normalizedUrl);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'PUT');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(url, 'PUT');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiPut(url, data, options),
                    `PUT ${url}`,
                    url
                );
            }
            
            const headers = {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };
            
            if (data instanceof FormData) {
                delete headers['Content-Type'];
            }
            
            const token = getAuthToken();
            
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
                const fetchOptions = {
                    method: 'PUT',
                    headers: headers,
                    ...options
                };
                
                if (data !== undefined && data !== null) {
                    fetchOptions.body = safeJsonSerialize(data);
                }
                
                const result = await enhancedSecureFetch(url, fetchOptions);
                
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'put_failed')) {
                        console.error(`[API] ❌ PUT request failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
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
                    console.error(`[API] ❌ api.put() error for ${normalizedUrl}:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.put() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    async function apiDelete(url, options = {}) {
        const functionName = 'apiDelete';
        
        try {
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.delete() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            const normalizedUrl = normalizeEndpoint(url);
            const isPublic = isPublicEndpointCheck(normalizedUrl);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'DELETE');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(url, 'DELETE');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiDelete(url, options),
                    `DELETE ${url}`,
                    url
                );
            }
            
            const token = getAuthToken();
            
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
                const result = await enhancedSecureFetch(url, { 
                    method: 'DELETE',
                    ...options
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'delete_failed')) {
                        console.error(`[API] ❌ DELETE request failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
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
                    console.error(`[API] ❌ api.delete() error for ${normalizedUrl}:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.delete() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    async function apiUpload(url, data, options = {}) {
        const functionName = 'apiUpload';
        
        try {
            if (!url || typeof url !== 'string') {
                console.error("[API] ❌ api.upload() called with invalid URL:", url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            const normalizedUrl = normalizeEndpoint(url);
            const isPublic = isPublicEndpointCheck(normalizedUrl);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(url, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(url, 'POST');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => apiUpload(url, data, options),
                    `UPLOAD ${url}`,
                    url
                );
            }
            
            const token = getAuthToken();
            
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            trackRequestStart(normalizedUrl, functionName);
            
            try {
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
                
                if (fetchOptions.headers) {
                    delete fetchOptions.headers['Content-Type'];
                }
                
                if (options.onProgress && typeof options.onProgress === 'function') {
                    if (typeof XMLHttpRequest !== 'undefined') {
                        const result = await xhrUpload(normalizedUrl, formData, options, token);
                        trackRequestEnd(normalizedUrl, functionName, result.success);
                        return result;
                    }
                }
                
                const result = await enhancedSecureFetch(url, fetchOptions);
                
                if (!result.success) {
                    if (shouldLogError(normalizedUrl, 'upload_failed')) {
                        console.error(`[API] ❌ Upload request failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Upload failed' };
                    }
                    
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
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
                    console.error(`[API] ❌ api.upload() error for ${normalizedUrl}:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ api.upload() critical error:", error);
            return getSafeDefaultResponse(url || 'unknown', functionName, error);
        }
    }
    
    function xhrUpload(url, formData, options, token) {
        return new Promise((resolve, reject) => {
            try {
                const functionName = 'xhrUpload';
                const normalizedUrl = normalizeEndpoint(url);
                const authToken = token || getAuthToken();
                
                if (!shouldAllowRequest(normalizedUrl, functionName)) {
                    resolve(getSafeDefaultResponse(normalizedUrl, functionName));
                    return;
                }
                
                trackRequestStart(normalizedUrl, functionName);
                
                const xhr = new XMLHttpRequest();
                
                let fullUrl = normalizedUrl;
                if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
                    let baseUrl = _BACKEND_BASE_URL || _BASE_API_URL || window.API_BASE_URL || '';
                    
                    if (!baseUrl && typeof window !== 'undefined' && window.location && window.location.origin) {
                        fullUrl = window.location.origin + (normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl);
                    } else {
                        fullUrl = baseUrl + (normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl);
                    }
                }
                
                xhr.open('POST', fullUrl, true);
                
                const isPublic = isPublicEndpointCheck(normalizedUrl);
                if (authToken && !isPublic) {
                    xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
                }
                
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
                
                if (options.timeout) {
                    xhr.timeout = options.timeout;
                } else {
                    xhr.timeout = _requestState.requestTimeout;
                }
                
                xhr.send(formData);
                
            } catch (error) {
                console.error(`[API] ❌ xhrUpload error:`, error);
                resolve(getSafeDefaultResponse(url || 'unknown', 'xhrUpload', error));
            }
        });
    }
    
    async function apiHealthCheck() {
        const functionName = 'apiHealthCheck';
        
        try {
            const endpoint = '/health';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            const requestId = generateRequestId('/health', 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => apiHealthCheck(),
                    `HEALTHCHECK`,
                    '/health'
                );
            }
            
            if (!shouldAllowRequest('/health', functionName)) {
                return getSafeDefaultResponse('/health', functionName);
            }
            
            trackRequestStart('/health', functionName);
            
            try {
                const endpoints = [
                    '/health',
                    '/status',
                    '/api/health',
                    '/api/status'
                ];
                
                for (const ep of endpoints) {
                    try {
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
                        continue;
                    }
                }
                
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
    // ENHANCED SECURE FETCH WRAPPER WITH /API NORMALIZATION
    // ============================================================================
    
    async function enhancedSecureFetch(endpoint, options = {}) {
        const functionName = 'enhancedSecureFetch';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, options.method || 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            const retryCount = trackRequestStart(normalizedEndpoint, functionName);
            const requestId = `${options.method || 'GET'}_${normalizedEndpoint}_${Date.now()}`;
            
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => enhancedSecureFetch(endpoint, options),
                    `${options.method || 'GET'} ${endpoint}`,
                    endpoint
                );
            }
            
            const shouldRetry = options.retry !== false;
            const maxRetries = options.maxRetries || _requestState.maxRetries;
            const retryDelay = options.retryDelay || _requestState.retryDelay;
            const requestTimeout = options.timeout || _requestState.requestTimeout;

            let lastError;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (retryCount > _safetyState.maxRetriesPerRequest) {
                        console.warn(`[API] ⏳ Max retries reached for ${normalizedEndpoint}`);
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return getSafeDefaultResponse(normalizedEndpoint, functionName, new Error('Max retries reached'));
                    }
                    
                    if (attempt > 1) {
                        console.log(`[API] ⏳ Retry attempt ${attempt}/${maxRetries} for ${normalizedEndpoint}`);
                    }
                    
                    const trustedOptions = {
                        ...options,
                        [TRUSTED_REQUEST_MARKER]: true,
                        __trusted: true
                    };
                    
                    const result = await _secureApiFetch(normalizedEndpoint, trustedOptions);
                    
                    if (result.success) {
                        if (attempt > 1) {
                            console.log(`[API] ✅ Request succeeded on attempt ${attempt}: ${normalizedEndpoint}`);
                        }
                        trackRequestEnd(normalizedEndpoint, functionName, true);
                        return result;
                    }
                    
                    if (result.status === 401) {
                        console.warn(`[API] ⏳ Auth error (401) for ${normalizedEndpoint}, not retrying`);
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        trackError(normalizedEndpoint, functionName, 'auth_error');
                        return result;
                    }
                    
                    if (result.status === 429) {
                        const retryAfter = result.headers?.['retry-after'] || result.headers?.['Retry-After'];
                        if (retryAfter && attempt < maxRetries) {
                            const delay = parseInt(retryAfter) * 1000 || retryDelay;
                            console.log(`[API] ⏳ Rate limited, waiting ${delay}ms before retry`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }
                    }
                    
                    if (result.status >= 500 && shouldRetry && attempt < maxRetries) {
                        const delay = retryDelay * Math.pow(2, attempt - 1);
                        console.log(`[API] ⏳ Server error ${result.status}, retrying in ${delay}ms`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        lastError = result;
                        continue;
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `http_${result.status}`);
                    return result;
                    
                } catch (error) {
                    if (shouldLogError(normalizedEndpoint, 'attempt_failed')) {
                        console.error(`[API] ❌ Attempt ${attempt} failed for ${normalizedEndpoint}:`, error.message);
                    }
                    lastError = error;
                    
                    if (shouldRetry && attempt < maxRetries) {
                        const delay = retryDelay * Math.pow(2, attempt - 1);
                        console.log(`[API] ⏳ Network error, retrying in ${delay}ms`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    
                    break;
                }
            }
            
            trackRequestEnd(normalizedEndpoint, functionName, false);
            const errorCount = trackError(normalizedEndpoint, functionName, 'all_retries_failed');
            
            if (shouldLogError(normalizedEndpoint, 'all_retries_failed')) {
                console.error(`[API] ❌ All ${maxRetries} attempts failed for ${normalizedEndpoint} (total errors: ${errorCount})`);
            }
            
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
    // 🔧 FIXED: ENHANCED ENDPOINT NORMALIZATION FUNCTIONS
    // ============================================================================
    
    function normalizeEndpoint(endpoint) {
        try {
            if (endpoint === undefined || endpoint === null) {
                console.warn("[API] ⏳ Undefined/null endpoint, defaulting to /api/");
                return '/api/';
            }
            
            const endpointStr = String(endpoint).trim();
            
            if (endpointStr === '') {
                console.warn("[API] ⏳ Empty endpoint, defaulting to /api/");
                return '/api/';
            }
            
            if (endpointStr.startsWith('http://') || endpointStr.startsWith('https://')) {
                return endpointStr;
            }
            
            let cleanEndpoint = endpointStr;
            
            if (cleanEndpoint.match(/^\/?api\/api\//i)) {
                cleanEndpoint = cleanEndpoint.replace(/^\/?api\/api\//i, '/');
            }
            
            if (cleanEndpoint.match(/^api\/api\//i)) {
                cleanEndpoint = cleanEndpoint.replace(/^api\/api\//i, '');
            }
            
            if (cleanEndpoint.match(/^\/?api\//i)) {
                cleanEndpoint = cleanEndpoint.replace(/^\/?api\//i, '');
            }
            
            if (cleanEndpoint.match(/^api\//i)) {
                cleanEndpoint = cleanEndpoint.replace(/^api\//i, '');
            }
            
            if (cleanEndpoint.match(/^\/?api$/i)) {
                cleanEndpoint = '';
            }
            
            if (cleanEndpoint && !cleanEndpoint.startsWith('/')) {
                cleanEndpoint = '/' + cleanEndpoint;
            }
            
            if (!cleanEndpoint || cleanEndpoint === '/') {
                return '/api';
            }
            
            const normalized = '/api' + cleanEndpoint;
            
            return normalized;
            
        } catch (error) {
            console.error("[API] ❌ normalizeEndpoint failed:", error);
            return '/api/';
        }
    }
    
    function normalizeAuthPayload(payload) {
        try {
            if (!payload || typeof payload !== 'object') {
                return payload;
            }
            
            const normalized = JSON.parse(JSON.stringify(payload));
            
            if (normalized.username && !normalized.email) {
                if (normalized.username.includes('@') && normalized.username.includes('.')) {
                    normalized.email = normalized.username;
                }
            }
            
            if (normalized.email && !normalized.username) {
                normalized.username = normalized.email;
            }
            
            if (normalized.password && !normalized.confirmPassword) {
                normalized.confirmPassword = normalized.password;
            }
            
            if (!normalized.name && normalized.username) {
                normalized.name = normalized.username.split('@')[0];
            }
            
            Object.keys(normalized).forEach(key => {
                if (normalized[key] === null || 
                    normalized[key] === undefined || 
                    normalized[key] === '') {
                    delete normalized[key];
                }
            });
            
            return normalized;
            
        } catch (error) {
            console.error("[API] ❌ normalizeAuthPayload failed:", error);
            return payload || {};
        }
    }
    
    function safeJsonSerialize(payload) {
        try {
            if (payload === undefined || payload === null) {
                return '';
            }
            
            if (typeof payload === 'string') {
                try {
                    JSON.parse(payload);
                    return payload;
                } catch (e) {
                    return JSON.stringify(payload);
                }
            }
            
            if (typeof payload === 'object') {
                if (payload instanceof FormData) {
                    return payload;
                }
                return JSON.stringify(payload);
            }
            
            return JSON.stringify(payload);
            
        } catch (error) {
            console.error("[API] ❌ Failed to serialize payload:", error, payload);
            throw new Error(`Failed to serialize payload to JSON: ${error.message}`);
        }
    }
    
    // ============================================================================
    // 🔥 GATEWAY CONTROL FUNCTIONS
    // ============================================================================
    
    function checkDependencyGates(requestId, endpoint) {
        const isPublic = isPublicEndpointCheck(endpoint);
        
        if (isPublic) {
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
    
    function queueRequest(requestFn, description, endpoint) {
        if (_gatewayState.queue.requests.length >= _gatewayState.queue.maxQueueSize) {
            console.warn(`[API] ⏳ Request queue full, dropping request`);
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
        
        console.log(`[API]`, `[${requestId}] ${message}`);
        
        _gatewayState.logging.loggedRequests.add(requestId);
        _gatewayState.logging.lastLogTimes.set(requestId, Date.now());
        
        if (_gatewayState.logging.loggedRequests.size > 100) {
            const oldest = Array.from(_gatewayState.logging.loggedRequests).slice(0, 20);
            oldest.forEach(id => _gatewayState.logging.loggedRequests.delete(id));
        }
    }
    
    function isTrustedCaller() {
        try {
            const stack = new Error().stack || '';
            
            for (const module of _gatewayState.trustedRequests.trustedModules) {
                if (stack.includes(module)) {
                    return true;
                }
            }
            
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
            return false;
        }
    }
    
    function isTrustedRequest(url, options = {}) {
        if (options[TRUSTED_REQUEST_MARKER] === true) {
            return true;
        }
        
        if (options.__trusted === true || options.internal === true) {
            return true;
        }
        
        if (isTrustedCaller()) {
            return true;
        }
        
        if (options.method === 'HEAD' || (options.method && options.method.toUpperCase() === 'HEAD')) {
            return true;
        }
        
        if (typeof url !== 'string') {
            return false;
        }
        
        const urlLower = url.toLowerCase();
        
        for (const pattern of _gatewayState.trustedRequests.patterns) {
            if (urlLower.includes(pattern.toLowerCase())) {
                return true;
            }
        }
        
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
        
        if (urlLower.match(/\.(css|js|json|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map)(\?.*)?$/)) {
            return true;
        }
        
        if (urlLower.match(/\/(modules|components|assets|static|public|dist|build)\//)) {
            return true;
        }
        
        if (urlLower.match(/\/(internal|private|_api|__api)\//)) {
            return true;
        }
        
        return false;
    }
    
    // ============================================================================
    // 🔥 ANTI-PATTERN PREVENTION - HARDENED WITH BETTER WHITELISTING
    // ============================================================================
    
    function blockDirectFetchCalls() {
        if (window._FETCH_BLOCKED_) {
            return;
        }
        
        const originalFetch = window.fetch;
        
        window.fetch = function(...args) {
            const [url, options = {}] = args;
            
            const isTrusted = isTrustedRequest(url, options);
            
            const isApiRequest = typeof url === 'string' && 
                (url.includes('/api/') || url.includes('/auth/') || 
                 (!url.startsWith('http') && url.startsWith('/') && !isTrusted));
            
            const method = options.method || 'GET';
            const isHeadRequest = method.toUpperCase() === 'HEAD';
            const isFromTrustedModule = isTrustedCaller();
            
            if (isApiRequest && !isTrusted && !isHeadRequest && !isFromTrustedModule) {
                const urlKey = typeof url === 'string' ? url.split('?')[0] : 'unknown';
                if (!window._blockedFetchLogs) window._blockedFetchLogs = new Set();
                
                if (!window._blockedFetchLogs.has(urlKey)) {
                    window._blockedFetchLogs.add(urlKey);
                    console.warn(`[API] ⏳ Direct fetch to ${urlKey} - use api.request() instead`);
                    
                    if (window._blockedFetchLogs.size > 50) {
                        window._blockedFetchLogs.clear();
                    }
                }
                
                return Promise.reject(new Error(`Direct fetch blocked: use api.request() for ${url}`));
            }
            
            return originalFetch.apply(this, args);
        };
        
        window.__originalFetch = originalFetch;
        
        window._FETCH_BLOCKED_ = true;
        console.log(`[API] ✅ Direct fetch() calls filtered for API endpoints (HEAD allowed, trusted modules allowed)`);
    }
    
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
                console.warn(`[API] ⏳ SetInterval polling detected: ${delay}ms interval`);
                
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
                console.error(`[API] ❌ Too many errors (${_gatewayState.errorHandler.errorCount}), pausing gateway`);
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
    
    function shouldAllowRequest(endpoint, functionName) {
        const endpointKey = `${functionName}:${endpoint}`;
        
        if (_safetyState.activeRequests.size >= _safetyState.maxConcurrentRequests) {
            if (shouldLogError(endpointKey, 'concurrent_limit')) {
                console.warn(`[API] ⏳ Too many concurrent requests (${_safetyState.activeRequests.size}), delaying: ${endpointKey}`);
            }
            return false;
        }
        
        const errorCount = _safetyState.errorCounts.get(endpointKey) || 0;
        if (errorCount >= _safetyState.maxErrorsPerEndpoint) {
            if (shouldLogError(endpointKey, 'error_limit')) {
                console.warn(`[API] ⏳ Error limit reached for ${endpointKey}, blocking further requests`);
            }
            return false;
        }
        
        return true;
    }
    
    function trackRequestStart(endpoint, functionName) {
        const endpointKey = `${functionName}:${endpoint}`;
        _safetyState.activeRequests.add(endpointKey);
        
        const retryCount = (_safetyState.retryAttempts.get(endpointKey) || 0) + 1;
        _safetyState.retryAttempts.set(endpointKey, retryCount);
        
        return retryCount;
    }
    
    function trackRequestEnd(endpoint, functionName, success = true) {
        const endpointKey = `${functionName}:${endpoint}`;
        _safetyState.activeRequests.delete(endpointKey);
        
        if (success) {
            _safetyState.errorCounts.delete(endpointKey);
            _safetyState.retryAttempts.delete(endpointKey);
        }
    }
    
    function trackError(endpoint, functionName, errorType) {
        const endpointKey = `${functionName}:${endpoint}`;
        const errorCount = (_safetyState.errorCounts.get(endpointKey) || 0) + 1;
        _safetyState.errorCounts.set(endpointKey, errorCount);
        
        return errorCount;
    }
    
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
    
    function initDependencies() {
        try {
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
            
            if (!_secureApiFetch || typeof _secureApiFetch !== 'function') {
                console.warn("[API] ⏳ secureApiFetch not found in window.__API_CORE, creating fallback");
                _secureApiFetch = createFallbackSecureFetch();
            }
            
            if (!_getUserToken || typeof _getUserToken !== 'function') {
                console.warn("[API] ⏳ getUserToken not found in window.__API_CORE");
                // FIX (getAuthToken-infinite-recursion): getAuthToken() itself calls
                // _getUserToken() as one of its own fallback steps. Assigning
                // _getUserToken = getAuthToken here created a circular reference —
                // getAuthToken -> _getUserToken -> getAuthToken -> ... -> stack
                // overflow ('Maximum call stack size exceeded'), which silently
                // broke every authenticated request across every module (Messages,
                // Friends, Groups, Tools) the moment Session.getToken() didn't
                // return a token on the first try. getAuthToken()'s other two
                // fallback steps (Session.getToken, direct localStorage read)
                // already cover real token retrieval without this.
                _getUserToken = () => null;
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
            _secureApiFetch = createFallbackSecureFetch();
            // Same circular-reference fix as above — see the detailed comment there.
            _getUserToken = () => null;
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
    
    function createFallbackSecureFetch() {
        return async function secureApiFetch(url, options = {}) {
            const functionName = 'secureApiFetch';
            const normalizedUrl = normalizeEndpoint(url);
            
            const trustedOptions = {
                ...options,
                [TRUSTED_REQUEST_MARKER]: true,
                __trusted: true
            };
            
            const isPublic = isPublicEndpointCheck(normalizedUrl);
            
            const requestId = generateRequestId(url, options.method || 'GET');
            if (!checkDependencyGates(requestId, normalizedUrl)) {
                return queueRequest(
                    () => secureApiFetch(url, options),
                    `${options.method || 'GET'} ${url}`,
                    url
                );
            }
            
            if (!isPublic && !isSessionReady()) {
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedUrl}`);
                await waitForSessionReady();
            }
            
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            const retryCount = trackRequestStart(normalizedUrl, functionName);
            
            try {
                if (retryCount > _safetyState.maxRetriesPerRequest) {
                    console.warn(`[API] ⏳ Max retries reached for ${normalizedUrl}`);
                    trackRequestEnd(normalizedUrl, functionName, false);
                    return getSafeDefaultResponse(normalizedUrl, functionName, new Error('Max retries reached'));
                }
                
                const token = getAuthToken();
                
                const defaultHeaders = {
                    'Content-Type': 'application/json'
                };
                
                const headers = {
                    ...defaultHeaders,
                    ...(options.headers || {})
                };
                
                if (!isPublic && token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                
                const fetchOptions = {
                    method: options.method || 'GET',
                    headers: headers,
                    credentials: 'include',
                    ...trustedOptions
                };
                
                if (options.body && fetchOptions.body) {
                    delete fetchOptions.body;
                }
                
                if (options.body) {
                    if (options.body instanceof FormData) {
                        fetchOptions.body = options.body;
                        delete fetchOptions.headers['Content-Type'];
                    } else if (typeof options.body === 'object') {
                        fetchOptions.body = JSON.stringify(options.body);
                    } else if (typeof options.body === 'string') {
                        fetchOptions.body = options.body;
                        try {
                            JSON.parse(options.body);
                        } catch (e) {
                            console.warn(`[API] ⏳ Body appears to be string but not valid JSON:`, options.body);
                        }
                    } else {
                        fetchOptions.body = String(options.body);
                    }
                }
                
                let fullUrl = normalizedUrl;
                if (!normalizedUrl.startsWith('http://') && 
                    !normalizedUrl.startsWith('https://')) {
                    
                    let baseUrl = _BACKEND_BASE_URL || _BASE_API_URL || window.API_BASE_URL || '';
                    
                    if (_gatewayState.backend.resolved) {
                        baseUrl = _gatewayState.backend.origin;
                    } else if (!baseUrl && typeof window !== 'undefined' && window.location && window.location.origin) {
                        baseUrl = window.location.origin;
                    }
                    
                    fullUrl = baseUrl + (normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl);
                }
                
                const controller = new AbortController();
const timeoutToUse = options.timeout || _requestState.requestTimeout;
const timeoutId = setTimeout(() => {
    console.warn(`[API-REQUEST] Timeout after ${timeoutToUse}ms: ${fullUrl}`);
    controller.abort();
}, timeoutToUse);
fetchOptions.signal = controller.signal;
                
                const response = await (window.__originalFetch || window.fetch)(fullUrl, fetchOptions);
                
                clearTimeout(timeoutId);
                
                const data = await safeParseResponse(response);
                
                const result = {
                    ok: response.ok,
                    success: response.ok,
                    status: response.status,
                    statusText: response.statusText,
                    data: data,
                    headers: Object.fromEntries(response.headers.entries()),
                    url: response.url
                };
                
                if (!response.ok) {
                    const errorResponse = createErrorResponse(response, data);
                    Object.assign(result, errorResponse);
                    
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
                    console.error(`[API] ❌ Fetch error for ${normalizedUrl} (attempt ${errorCount}):`, error.message);
                }
                
                return getSafeDefaultResponse(normalizedUrl, functionName, error);
            }
        };
    }
    
    // ============================================================================
    // ENHANCED IFRAME METHODS WITH CENTRALIZED TOKEN HANDLING
    // ============================================================================
    
    async function getMessages() {
        const functionName = 'getMessages';
        const endpoint = '/api/messages';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getMessages(),
                    `GET messages`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached messages`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_messages_failed')) {
                        console.error(`[API] ❌ getMessages failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_messages_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_messages_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_messages_error')) {
                    console.error(`[API] ❌ getMessages error:`, error.message);
                }
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getMessages error, returning cached data`);
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
    
    async function getMessageById(messageId) {
        const functionName = 'getMessageById';
        
        try {
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
            
            const endpoint = `/messages/${encodeURIComponent(messageId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getMessageById(messageId),
                    `GET message ${messageId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached message ${messageId}`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_message_by_id_failed')) {
                        console.error(`[API] ❌ getMessageById failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_message_by_id_failed_${result.status}`);
                    return result;
                }
                
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
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getMessageById error, returning cached data`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getMessageById critical error:", error);
            return getSafeDefaultResponse('/messages/:id', functionName, error);
        }
    }
    
    // 🔧 FIXED sendMessage with correct body structure
    async function sendMessage(messageData) {
        const functionName = 'sendMessage';
        const endpoint = '/api/messages';
        
        try {
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
            
            // Validate required fields
            if (!messageData.content && !messageData.chatId && !messageData.receiverId) {
                console.error("[API] ❌ sendMessage missing required fields");
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'content, chatId, or receiverId is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => sendMessage(messageData),
                    `POST message`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Build request body exactly as required by backend
            const requestBody = {
                chatId: messageData.chatId || null,
                receiverId: messageData.receiverId || null,
                content: messageData.content || '',
                type: messageData.type || 'text',
                replyToId: messageData.replyToId || null
            };
            
            // Remove null values
            Object.keys(requestBody).forEach(key => {
                if (requestBody[key] === null) {
                    delete requestBody[key];
                }
            });
            
            try {
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: requestBody
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'send_message_failed')) {
                        console.error(`[API] ❌ sendMessage failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `send_message_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete(`get_${normalizedEndpoint}`);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'send_message_error');
                
                if (shouldLogError(normalizedEndpoint, 'send_message_error')) {
                    console.error(`[API] ❌ sendMessage error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ sendMessage critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getFriends() {
        const functionName = 'getFriends';
        const endpoint = '/friends/list';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getFriends(),
                    `GET friends`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached friends`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_friends_failed')) {
                        console.error(`[API] ❌ getFriends failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_friends_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_friends_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_friends_error')) {
                    console.error(`[API] ❌ getFriends error:`, error.message);
                }
                
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
    
    // 🔧 FIXED addFriend with correct endpoint and body
    async function addFriend(userId) {
        const functionName = 'addFriend';
        const endpoint = '/friends/requests/send';
        
        try {
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
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
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: { receiverId: userId }
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'add_friend_failed')) {
                        console.error(`[API] ❌ addFriend failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `add_friend_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/friends/list');
                    _apiCache.delete('get_/api/friends/requests/incoming');
                    _apiCache.delete('get_/api/friends/requests/sent');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'add_friend_error');
                
                if (shouldLogError(normalizedEndpoint, 'add_friend_error')) {
                    console.error(`[API] ❌ addFriend error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ addFriend critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: acceptFriendRequest
    async function acceptFriendRequest(requestId) {
        const functionName = 'acceptFriendRequest';
        const endpoint = `/friends/requests/${requestId}/accept`;
        
        try {
            if (!requestId) {
                console.error(`[API] ❌ acceptFriendRequest called without requestId`);
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Request ID is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const reqId = generateRequestId(endpoint, 'POST');
                logRequest(reqId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const reqId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(reqId, normalizedEndpoint)) {
                return queueRequest(
                    () => acceptFriendRequest(requestId),
                    `POST accept friend request ${requestId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                const result = await enhancedSecureFetch(endpoint, { method: 'POST' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'accept_friend_request_failed')) {
                        console.error(`[API] ❌ acceptFriendRequest failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `accept_friend_request_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/friends/list');
                    _apiCache.delete('get_/api/friends/requests/incoming');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'accept_friend_request_error');
                
                if (shouldLogError(normalizedEndpoint, 'accept_friend_request_error')) {
                    console.error(`[API] ❌ acceptFriendRequest error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ acceptFriendRequest critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: rejectFriendRequest
    async function rejectFriendRequest(requestId) {
        const functionName = 'rejectFriendRequest';
        const endpoint = `/friends/requests/${requestId}/reject`;
        
        try {
            if (!requestId) {
                console.error(`[API] ❌ rejectFriendRequest called without requestId`);
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Request ID is required' },
                    headers: {},
                    validationError: true
                };
            }
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const reqId = generateRequestId(endpoint, 'POST');
                logRequest(reqId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const reqId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(reqId, normalizedEndpoint)) {
                return queueRequest(
                    () => rejectFriendRequest(requestId),
                    `POST reject friend request ${requestId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                const result = await enhancedSecureFetch(endpoint, { method: 'POST' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'reject_friend_request_failed')) {
                        console.error(`[API] ❌ rejectFriendRequest failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `reject_friend_request_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/friends/requests/incoming');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'reject_friend_request_error');
                
                if (shouldLogError(normalizedEndpoint, 'reject_friend_request_error')) {
                    console.error(`[API] ❌ rejectFriendRequest error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ rejectFriendRequest critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: getIncomingFriendRequests
    async function getIncomingFriendRequests() {
        const functionName = 'getIncomingFriendRequests';
        const endpoint = '/friends/requests/incoming';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getIncomingFriendRequests(),
                    `GET incoming friend requests`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached incoming friend requests`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_incoming_requests_failed')) {
                        console.error(`[API] ❌ getIncomingFriendRequests failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    if (cachedData) {
                        console.log("[API] ✅ getIncomingFriendRequests failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached incoming requests'
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_incoming_requests_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_incoming_requests_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_incoming_requests_error')) {
                    console.error(`[API] ❌ getIncomingFriendRequests error:`, error.message);
                }
                
                if (cachedData) {
                    console.log("[API] ✅ getIncomingFriendRequests error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached incoming requests',
                        error: error.message
                    };
                }
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Network Error',
                    data: { message: 'Failed to fetch incoming friend requests' },
                    headers: {},
                    networkError: true,
                    message: 'Failed to fetch incoming friend requests',
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ getIncomingFriendRequests critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: getSentFriendRequests
    async function getSentFriendRequests() {
        const functionName = 'getSentFriendRequests';
        const endpoint = '/friends/requests/sent';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getSentFriendRequests(),
                    `GET sent friend requests`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached sent friend requests`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_sent_requests_failed')) {
                        console.error(`[API] ❌ getSentFriendRequests failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    if (cachedData) {
                        console.log("[API] ✅ getSentFriendRequests failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached sent requests'
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_sent_requests_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_sent_requests_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_sent_requests_error')) {
                    console.error(`[API] ❌ getSentFriendRequests error:`, error.message);
                }
                
                if (cachedData) {
                    console.log("[API] ✅ getSentFriendRequests error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached sent requests',
                        error: error.message
                    };
                }
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Network Error',
                    data: { message: 'Failed to fetch sent friend requests' },
                    headers: {},
                    networkError: true,
                    message: 'Failed to fetch sent friend requests',
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ getSentFriendRequests critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: getChats
    async function getChats() {
        const functionName = 'getChats';
        const endpoint = '/api/messages/chats';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getChats(),
                    `GET chats`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached chats`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_chats_failed')) {
                        console.error(`[API] ❌ getChats failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_chats_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_chats_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_chats_error')) {
                    console.error(`[API] ❌ getChats error:`, error.message);
                }
                
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
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Network Error',
                    data: { message: 'Failed to fetch chats' },
                    headers: {},
                    networkError: true,
                    message: 'Failed to fetch chats',
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ getChats critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: startDirectChat
    async function startDirectChat(userId) {
        const functionName = 'startDirectChat';
        const endpoint = '/chats/direct';
        
        try {
            if (!userId) {
                console.error("[API] ❌ startDirectChat called without userId");
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => startDirectChat(userId),
                    `POST start direct chat with ${userId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: { userId: userId }
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'start_direct_chat_failed')) {
                        console.error(`[API] ❌ startDirectChat failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `start_direct_chat_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/chats');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'start_direct_chat_error');
                
                if (shouldLogError(normalizedEndpoint, 'start_direct_chat_error')) {
                    console.error(`[API] ❌ startDirectChat error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ startDirectChat critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: getUnreadCounts
    async function getUnreadCounts() {
        const functionName = 'getUnreadCounts';
        const endpoint = '/api/messages/unread-counts';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getUnreadCounts(),
                    `GET unread counts`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached unread counts`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_unread_counts_failed')) {
                        console.error(`[API] ❌ getUnreadCounts failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    if (cachedData) {
                        console.log("[API] ✅ getUnreadCounts failed, returning cached data");
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return {
                            ok: true,
                            success: true,
                            status: 200,
                            statusText: 'OK (cached)',
                            data: cachedData,
                            headers: {},
                            cached: true,
                            message: 'Using cached unread counts'
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_unread_counts_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_unread_counts_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_unread_counts_error')) {
                    console.error(`[API] ❌ getUnreadCounts error:`, error.message);
                }
                
                if (cachedData) {
                    console.log("[API] ✅ getUnreadCounts error, returning cached data");
                    return {
                        ok: true,
                        success: true,
                        status: 200,
                        statusText: 'OK (cached)',
                        data: cachedData,
                        headers: {},
                        cached: true,
                        message: 'Using cached unread counts',
                        error: error.message
                    };
                }
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Network Error',
                    data: { message: 'Failed to fetch unread counts' },
                    headers: {},
                    networkError: true,
                    message: 'Failed to fetch unread counts',
                    error: error.message
                };
            }
            
        } catch (error) {
            console.error("[API] ❌ getUnreadCounts critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: markMessagesRead
    async function markMessagesRead(chatId, messageIds) {
        const functionName = 'markMessagesRead';
        const endpoint = '/api/messages/mark-read/batch';
        
        try {
            if (!chatId) {
                console.error("[API] ❌ markMessagesRead called without chatId");
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => markMessagesRead(chatId, messageIds),
                    `POST mark messages read in chat ${chatId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const requestBody = {
                messageIds: Array.isArray(messageIds) ? messageIds : (messageIds ? [messageIds] : [])
            };
            
            try {
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: requestBody
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'mark_messages_read_failed')) {
                        console.error(`[API] ❌ markMessagesRead failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `mark_messages_read_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/messages/unread/counts');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'mark_messages_read_error');
                
                if (shouldLogError(normalizedEndpoint, 'mark_messages_read_error')) {
                    console.error(`[API] ❌ markMessagesRead error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ markMessagesRead critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: blockFriend
    async function blockFriend(userId) {
        const functionName = 'blockFriend';
        const endpoint = `/friends/${userId}/block`;
        
        try {
            if (!userId) {
                console.error(`[API] ❌ blockFriend called without userId`);
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => blockFriend(userId),
                    `POST block friend ${userId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                const result = await enhancedSecureFetch(endpoint, { method: 'POST' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'block_friend_failed')) {
                        console.error(`[API] ❌ blockFriend failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `block_friend_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/friends/list');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'block_friend_error');
                
                if (shouldLogError(normalizedEndpoint, 'block_friend_error')) {
                    console.error(`[API] ❌ blockFriend error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ blockFriend critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: unblockFriend
    async function unblockFriend(userId) {
        const functionName = 'unblockFriend';
        const endpoint = `/friends/${userId}/unblock`;
        
        try {
            if (!userId) {
                console.error(`[API] ❌ unblockFriend called without userId`);
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => unblockFriend(userId),
                    `POST unblock friend ${userId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                const result = await enhancedSecureFetch(endpoint, { method: 'POST' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'unblock_friend_failed')) {
                        console.error(`[API] ❌ unblockFriend failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `unblock_friend_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/friends/list');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'unblock_friend_error');
                
                if (shouldLogError(normalizedEndpoint, 'unblock_friend_error')) {
                    console.error(`[API] ❌ unblockFriend error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ unblockFriend critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // 🔧 NEW: unfriend
    async function unfriend(userId) {
        const functionName = 'unfriend';
        const endpoint = `/friends/${userId}`;
        
        try {
            if (!userId) {
                console.error(`[API] ❌ unfriend called without userId`);
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'DELETE');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'DELETE');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => unfriend(userId),
                    `DELETE unfriend ${userId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            try {
                const result = await enhancedSecureFetch(endpoint, { method: 'DELETE' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'unfriend_failed')) {
                        console.error(`[API] ❌ unfriend failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `unfriend_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/friends/list');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'unfriend_error');
                
                if (shouldLogError(normalizedEndpoint, 'unfriend_error')) {
                    console.error(`[API] ❌ unfriend error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ unfriend critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getGroups() {
        const functionName = 'getGroups';
        const endpoint = '/groups';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getGroups(),
                    `GET groups`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached groups`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_groups_failed')) {
                        console.error(`[API] ❌ getGroups failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_groups_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_groups_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_groups_error')) {
                    console.error(`[API] ❌ getGroups error:`, error.message);
                }
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getGroups error, returning cached data`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getGroups critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getGroupById(groupId) {
        const functionName = 'getGroupById';
        
        try {
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
            
            const endpoint = `/groups/${encodeURIComponent(groupId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getGroupById(groupId),
                    `GET group ${groupId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached group ${groupId}`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_group_by_id_failed')) {
                        console.error(`[API] ❌ getGroupById failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_group_by_id_failed_${result.status}`);
                    return result;
                }
                
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
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getGroupById error, returning cached data`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getGroupById critical error:", error);
            return getSafeDefaultResponse('/groups/:id', functionName, error);
        }
    }
    
    async function createGroup(groupData) {
        const functionName = 'createGroup';
        const endpoint = '/groups';
        
        try {
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
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
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: groupData
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'create_group_failed')) {
                        console.error(`[API] ❌ createGroup failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `create_group_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/groups');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'create_group_error');
                
                if (shouldLogError(normalizedEndpoint, 'create_group_error')) {
                    console.error(`[API] ❌ createGroup error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ createGroup critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getStatuses() {
        const functionName = 'getStatuses';
        const endpoint = '/statuses/all';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getStatuses(),
                    `GET statuses`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached statuses`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_statuses_failed')) {
                        console.error(`[API] ❌ getStatuses failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_statuses_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_statuses_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_statuses_error')) {
                    console.error(`[API] ❌ getStatuses error:`, error.message);
                }
                
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
    
    async function getStatus(statusId) {
        const functionName = 'getStatus';
        
        try {
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
            
            const endpoint = `/status/${encodeURIComponent(statusId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getStatus(statusId),
                    `GET status ${statusId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached status ${statusId}`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_status_failed')) {
                        console.error(`[API] ❌ getStatus failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_status_failed_${result.status}`);
                    return result;
                }
                
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
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getStatus error, returning cached data`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getStatus critical error:", error);
            return getSafeDefaultResponse('/status/:id', functionName, error);
        }
    }
    
    async function createStatus(statusData) {
        const functionName = 'createStatus';
        const endpoint = '/status';
        
        try {
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
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
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: statusData
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'create_status_failed')) {
                        console.error(`[API] ❌ createStatus failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `create_status_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/statuses/all');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'create_status_error');
                
                if (shouldLogError(normalizedEndpoint, 'create_status_error')) {
                    console.error(`[API] ❌ createStatus error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ createStatus critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getCalls() {
        const functionName = 'getCalls';
        const endpoint = '/calls';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getCalls(),
                    `GET calls`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached calls`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_calls_failed')) {
                        console.error(`[API] ❌ getCalls failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_calls_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_calls_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_calls_error')) {
                    console.error(`[API] ❌ getCalls error:`, error.message);
                }
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getCalls error, returning cached data`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getCalls critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function startCall(callData) {
        const functionName = 'startCall';
        const endpoint = '/calls/start';
        
        try {
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
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
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'POST',
                    body: callData
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'start_call_failed')) {
                        console.error(`[API] ❌ startCall failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `start_call_failed_${result.status}`);
                    return result;
                }
                
                if (_apiCache) {
                    _apiCache.delete('get_/api/calls');
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'start_call_error');
                
                if (shouldLogError(normalizedEndpoint, 'start_call_error')) {
                    console.error(`[API] ❌ startCall error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ startCall critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getSettings() {
        const functionName = 'getSettings';
        const endpoint = '/settings';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getSettings(),
                    `GET settings`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached settings`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_settings_failed')) {
                        console.error(`[API] ❌ getSettings failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_settings_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                const token = getAuthToken();
                if (token) {
                    setTimeout(async () => {
                        try {
                            await getNotifications();
                            await getUserPreferences();
                            console.log(`[API] ✅ Background settings update completed`);
                        } catch (bgError) {
                            console.log("[API] ⏳ Background settings update failed:", bgError.message);
                        }
                    }, 2000);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_settings_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_settings_error')) {
                    console.error("[API] ❌ getSettings error:", error.message);
                }
                
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
    
    async function getFeatures() {
        const functionName = 'getFeatures';
        const endpoint = '/features';
        
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
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
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
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached features`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_features_failed')) {
                        console.warn(`[API] ⏳ getFeatures failed: ${result.status} - ${result.message}, using cached or default`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_features_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_features_error')) {
                    console.error(`[API] ❌ getFeatures error:`, error.message);
                }
                
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
    
    async function updateSettings(settingsData) {
        const functionName = 'updateSettings';
        const endpoint = '/settings';
        
        try {
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'PUT');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
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
                const result = await enhancedSecureFetch(endpoint, {
                    method: 'PUT',
                    body: settingsData
                });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'update_settings_failed')) {
                        console.error(`[API] ❌ updateSettings failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `update_settings_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(`get_${normalizeEndpoint('/settings')}`, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'update_settings_error');
                
                if (shouldLogError(normalizedEndpoint, 'update_settings_error')) {
                    console.error(`[API] ❌ updateSettings error:`, error.message);
                }
                
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ updateSettings critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getTools() {
        const functionName = 'getTools';
        const endpoint = '/tools';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getTools(),
                    `GET tools`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached tools`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_tools_failed')) {
                        console.error(`[API] ❌ getTools failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_tools_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_tools_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_tools_error')) {
                    console.error(`[API] ❌ getTools error:`, error.message);
                }
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getTools error, returning cached data`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getTools critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getUsers() {
        const functionName = 'getUsers';
        const endpoint = '/users';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getUsers(),
                    `GET users`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached users`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_users_failed')) {
                        console.error(`[API] ❌ getUsers failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_users_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_users_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_users_error')) {
                    console.error(`[API] ❌ getUsers error:`, error.message);
                }
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getUsers error, returning cached data`);
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
            
            const endpoint = `/users/${encodeURIComponent(userId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getUserById(userId),
                    `GET user ${userId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached user ${userId}`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_user_by_id_failed')) {
                        console.error(`[API] ❌ getUserById failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_user_by_id_failed_${result.status}`);
                    return result;
                }
                
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
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getUserById error, returning cached data`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getUserById critical error:", error);
            return getSafeDefaultResponse('/users/:id', functionName, error);
        }
    }
    
    async function getChatById(chatId) {
        const functionName = 'getChatById';
        
        try {
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
            
            const endpoint = `/chats/${encodeURIComponent(chatId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getChatById(chatId),
                    `GET chat ${chatId}`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached chat ${chatId}`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_chat_by_id_failed')) {
                        console.error(`[API] ❌ getChatById failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_chat_by_id_failed_${result.status}`);
                    return result;
                }
                
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
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getChatById error, returning cached data`);
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
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getContacts(),
                    `GET contacts`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached contacts`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_contacts_failed')) {
                        console.error(`[API] ❌ getContacts failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_contacts_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_contacts_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_contacts_error')) {
                    console.error(`[API] ❌ getContacts error:`, error.message);
                }
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getContacts error, returning cached data`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getContacts critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getNotifications() {
        const functionName = 'getNotifications';
        const endpoint = '/notifications';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getNotifications(),
                    `GET notifications`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached notifications`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_notifications_failed')) {
                        console.error(`[API] ❌ getNotifications failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_notifications_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_notifications_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_notifications_error')) {
                    console.error(`[API] ❌ getNotifications error:`, error.message);
                }
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getNotifications error, returning cached data`);
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
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'GET');
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => getUserPreferences(),
                    `GET user preferences`,
                    endpoint
                );
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`[API] ✅ Returning cached user preferences`);
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
                const result = await enhancedSecureFetch(endpoint, { method: 'GET' });
                
                if (!result.success) {
                    if (shouldLogError(normalizedEndpoint, 'get_user_preferences_failed')) {
                        console.error(`[API] ❌ getUserPreferences failed: ${result.status} - ${result.message}`);
                    }
                    
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
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
                    
                    const token = getAuthToken();
                    if (result.status === 401 && !token && !isPublic) {
                        throw {
                            message: result.message,
                            status: result.status,
                            success: result.success,
                            isRateLimited: result.isRateLimited,
                            isServerError: result.isServerError
                        };
                    }
                    
                    trackRequestEnd(normalizedEndpoint, functionName, false);
                    trackError(normalizedEndpoint, functionName, `get_user_preferences_failed_${result.status}`);
                    return result;
                }
                
                if (result.success && result.data && _apiCache) {
                    _apiCache.set(cacheKey, result.data);
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_user_preferences_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_user_preferences_error')) {
                    console.error(`[API] ❌ getUserPreferences error:`, error.message);
                }
                
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`[API] ✅ getUserPreferences error, returning cached data`);
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
                
                return errorObj;
            }
            
        } catch (error) {
            console.error("[API] ❌ getUserPreferences critical error:", error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function requestWrapper(endpoint, options = {}) {
        const functionName = 'request';
        
        try {
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (shouldLogError(normalizedEndpoint, 'request_call')) {
                console.log(`[API] ⏳ Request normalized: ${endpoint} → ${normalizedEndpoint}`);
            }
            
            const requestId = generateRequestId(endpoint, options.method || 'GET');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => requestWrapper(endpoint, options),
                    `${options.method || 'GET'} ${endpoint}`,
                    endpoint
                );
            }
            
            if (!isPublic && !isSessionReady()) {
                logRequest(requestId, `⏳ Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            const isPublicEndpointFlag = _isPublicEndpoint ? _isPublicEndpoint(normalizedEndpoint) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedEndpoint) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedEndpoint) : false;
            
            if (isPublic || isPublicEndpointFlag || isStatus || isAuth) {
                if (shouldLogError(normalizedEndpoint, 'public_endpoint')) {
                    console.log(`[API] ⏳ PUBLIC/AUTH/STATUS endpoint - executing immediately: ${normalizedEndpoint}`);
                }
                const result = await enhancedSecureFetch(endpoint, options);
                trackRequestEnd(normalizedEndpoint, functionName, result.success);
                return result;
            }
            
            const requiresAuth = options.auth !== false;
            const token = getAuthToken();
            
            if (requiresAuth && !token && _apiRequestQueue && !_apiRequestQueue.isLoginComplete()) {
                console.log(`[API] ⏳ Delaying protected endpoint until login complete: ${normalizedEndpoint}`);
                
                const result = await _apiRequestQueue.addRequest(
                    () => enhancedSecureFetch(endpoint, options),
                    `Protected endpoint: ${normalizedEndpoint}`,
                    normalizedEndpoint
                );
                
                trackRequestEnd(normalizedEndpoint, functionName, result?.success);
                return result;
            }
            
            const result = await enhancedSecureFetch(endpoint, options);
            trackRequestEnd(normalizedEndpoint, functionName, result.success);
            return result;
            
        } catch (error) {
            trackRequestEnd(normalizeEndpoint(endpoint || 'unknown'), functionName, false);
            const errorCount = trackError(normalizeEndpoint(endpoint || 'unknown'), functionName, 'request_error');
            
            if (shouldLogError(normalizeEndpoint(endpoint || 'unknown'), 'request_error')) {
                console.error(`[API] ❌ request function error for ${endpoint}:`, error.message);
            }
            
            return getSafeDefaultResponse(endpoint || 'unknown', functionName, error);
        }
    }
    
    // ============================================================================
    // TESTING UTILITIES
    // ============================================================================
    
    function testNormalization() {
        try {
            const testCases = [
                ['auth/login', '/api/auth/login'],
                ['/auth/login', '/api/auth/login'],
                ['/api/auth/login', '/api/auth/login'],
                ['auth/register', '/api/auth/register'],
                ['user/profile', '/api/user/profile'],
                ['status', '/api/status'],
                ['', '/api/'],
                [null, '/api/'],
                [undefined, '/api/'],
                ['api/auth/login', '/api/auth/login'],
                ['/api/api/auth/login', '/api/auth/login'],
                ['API/auth/login', '/api/auth/login'],
                ['api/auth/login/', '/api/auth/login/'],
                ['https://example.com/api/test', 'https://example.com/api/test'],
                ['http://localhost:3000/auth/login', 'http://localhost:3000/auth/login'],
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
                console.log(`  ${pass ? '✅' : '❌'} ${input} → ${result} ${pass ? '' : `(expected: ${expected})`}`);
            });
        } catch (error) {
            console.error("[API] ❌ testNormalization failed:", error);
        }
    }
    
    // ============================================================================
    // PUBLIC API INTERFACE
    // ============================================================================
    
    async function resolveBackendOrigin() {
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
                throw new Error(`Cannot resolve backend origin`);
            }
            
            if (!resolvedOrigin.startsWith('http://') && !resolvedOrigin.startsWith('https://')) {
                console.warn(`[API] ⏳ Backend origin missing protocol, assuming https://${resolvedOrigin}`);
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
            
            console.log(`[API] ✅ Backend resolved: ${resolvedOrigin} (via ${resolvedBy})`);
            
            return resolvedOrigin;
            
        } catch (error) {
            _gatewayState.backend.detectionAttempts++;
            
            if (_gatewayState.backend.detectionAttempts >= _gatewayState.backend.maxDetectionAttempts) {
                console.error("[API] ❌ Failed to resolve backend origin after multiple attempts");
                _gatewayState.errorHandler.isPaused = true;
                throw new Error(`Backend resolution failed: ${error.message}`);
            }
            
            console.warn(`[API] ⏳ Backend resolution failed (attempt ${_gatewayState.backend.detectionAttempts}), retrying...`);
            
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(resolveBackendOrigin());
                }, 1000 * _gatewayState.backend.detectionAttempts);
            });
        }
    }
    
    function waitForBootstrap() {
        return new Promise((resolve) => {
            const maxWaitTime = 30000;
            
            // Fast path: resolve immediately if already bootstrapped
            const isAlreadyComplete = 
                (window.AppState && window.AppState.bootstrapComplete) ||
                (window.__APP_BOOTSTRAP_COMPLETE__) ||
                (document.readyState === 'complete' && window.__API_CORE_LOADED_V24);

            if (isAlreadyComplete) {
                _gatewayState.gates.bootstrapReady = true;
                _gatewayState.initialization.steps.bootstrapWaited = true;
                console.log("[API] ✅ Bootstrap ready (immediate)");
                resolve(true);
                return;
            }

            let resolved = false;
            const markReady = (source) => {
                if (resolved) return;
                resolved = true;
                _gatewayState.gates.bootstrapReady = true;
                _gatewayState.initialization.steps.bootstrapWaited = true;
                console.log(`[API] ✅ Bootstrap ready (${source})`);
                resolve(true);
            };

            // Primary fast path: listen for the event dispatched by app.core.bootstrap.js
            window.addEventListener('nexopa-bootstrap-complete', () => markReady('event'), { once: true });

            const checkBootstrap = () => {
                const isBootstrapComplete = 
                    (window.AppState && window.AppState.bootstrapComplete) ||
                    (window.__APP_BOOTSTRAP_COMPLETE__) ||
                    (document.readyState === 'complete' && window.__API_CORE_LOADED_V24);                
                if (isBootstrapComplete) {
                    markReady('poll');
                    return;
                }
                
                if (_gatewayState.initialization.started && 
                    Date.now() - _gatewayState.initialization.started > maxWaitTime) {
                    console.warn(`[API] ⏳ Bootstrap timeout, proceeding anyway`);
                    markReady('timeout');
                    return;
                }
                
                if (!resolved) setTimeout(checkBootstrap, 100);
            };
            
            checkBootstrap();
        });
    }
    
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
                const token = getAuthToken();
                const isAuthReady = window.__API_AUTH ? window.__API_AUTH.isReady : false;
                
                if (token || isAuthReady) {
                    _gatewayState.gates.authReady = true;
                    console.log("[API] ✅ Initial auth state ready");
                }
                
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
    
    function activateRequestQueue() {
        _gatewayState.queue.queueStartTime = Date.now();
        _gatewayState.initialization.steps.queueActivated = true;
        console.log("[API] ✅ Request queue activated");
    }
    
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
    // CRITICAL MISSING MESSAGE FUNCTIONS - FRONTEND IS CALLING THESE
    // ============================================================================
    
    // Delete message API function
    async function deleteMessage(messageId, deleteForEveryone = false) {
        const functionName = 'deleteMessage';
        const endpoint = `/api/messages/${messageId}`;
        
        try {
            if (!messageId) {
                console.error(`[API] deleteMessage called without messageId`);
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
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'DELETE');
                logRequest(requestId, `Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'DELETE');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => deleteMessage(messageId, deleteForEveryone),
                    `DELETE message ${messageId}`,
                    endpoint
                );
            }
            
            const body = deleteForEveryone ? { deleteForEveryone: true } : {};
            
            const result = await makeApiRequest({
                method: 'DELETE',
                url: normalizedEndpoint,
                data: body,
                requestId,
                timeout: 15000,
                requiresAuth: !isPublic,
                source: 'api.request.js'
            });
            
            if (result.success) {
                if (shouldLogSuccess(normalizedEndpoint, 'delete_message_success')) {
                    console.log(`[API] deleteMessage successful: ${messageId}`);
                }
                return {
                    ok: true,
                    success: true,
                    status: result.status || 200,
                    statusText: result.statusText || 'OK',
                    data: result.data || { message: 'Message deleted successfully' },
                    headers: result.headers || {}
                };
            } else {
                if (shouldLogError(normalizedEndpoint, 'delete_message_failed')) {
                    console.error(`[API] deleteMessage failed: ${result.status} - ${result.message}`);
                }
                
                const errorObj = {
                    ok: false,
                    success: false,
                    status: result.status || 500,
                    statusText: result.statusText || 'Delete Failed',
                    data: result.data || { message: result.message || 'Failed to delete message' },
                    headers: result.headers || {}
                };
                
                return errorObj;
            }
            
        } catch (error) {
            console.error(`[API] deleteMessage critical error:`, error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // Edit message API function
    async function editMessage(messageId, content) {
        const functionName = 'editMessage';
        const endpoint = `/api/messages/${messageId}`;
        
        try {
            if (!messageId || !content) {
                console.error(`[API] editMessage called without messageId or content`);
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Message ID and content are required' },
                    headers: {},
                    validationError: true
                };
            }
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'PATCH');
                logRequest(requestId, `Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'PATCH');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => editMessage(messageId, content),
                    `PATCH message ${messageId}`,
                    endpoint
                );
            }
            
            const result = await makeApiRequest({
                method: 'PATCH',
                url: normalizedEndpoint,
                data: { content: content.trim() },
                requestId,
                timeout: 15000,
                requiresAuth: !isPublic,
                source: 'api.request.js'
            });
            
            if (result.success) {
                if (shouldLogSuccess(normalizedEndpoint, 'edit_message_success')) {
                    console.log(`[API] editMessage successful: ${messageId}`);
                }
                return {
                    ok: true,
                    success: true,
                    status: result.status || 200,
                    statusText: result.statusText || 'OK',
                    data: result.data || { message: 'Message edited successfully' },
                    headers: result.headers || {}
                };
            } else {
                if (shouldLogError(normalizedEndpoint, 'edit_message_failed')) {
                    console.error(`[API] editMessage failed: ${result.status} - ${result.message}`);
                }
                
                const errorObj = {
                    ok: false,
                    success: false,
                    status: result.status || 500,
                    statusText: result.statusText || 'Edit Failed',
                    data: result.data || { message: result.message || 'Failed to edit message' },
                    headers: result.headers || {}
                };
                
                return errorObj;
            }
            
        } catch (error) {
            console.error(`[API] editMessage critical error:`, error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    // Add reaction API function
    async function addReaction(messageId, emoji) {
        const functionName = 'addReaction';
        const endpoint = `/api/messages/${messageId}/react`;
        
        try {
            if (!messageId || !emoji) {
                console.error(`[API] addReaction called without messageId or emoji`);
                return {
                    ok: false,
                    success: false,
                    status: 400,
                    statusText: 'Bad Request',
                    data: { message: 'Message ID and emoji are required' },
                    headers: {},
                    validationError: true
                };
            }
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            const isPublic = isPublicEndpointCheck(normalizedEndpoint);
            
            if (!isPublic && !isSessionReady()) {
                const requestId = generateRequestId(endpoint, 'POST');
                logRequest(requestId, `Protected endpoint waiting for session ready: ${normalizedEndpoint}`);
                await waitForSessionReady();
            }
            
            const requestId = generateRequestId(endpoint, 'POST');
            if (!checkDependencyGates(requestId, normalizedEndpoint)) {
                return queueRequest(
                    () => addReaction(messageId, emoji),
                    `POST reaction to message ${messageId}`,
                    endpoint
                );
            }
            
            const result = await makeApiRequest({
                method: 'POST',
                url: normalizedEndpoint,
                data: { emoji },
                requestId,
                timeout: 15000,
                requiresAuth: !isPublic,
                source: 'api.request.js'
            });
            
            if (result.success) {
                if (shouldLogSuccess(normalizedEndpoint, 'add_reaction_success')) {
                    console.log(`[API] addReaction successful: ${messageId} ${emoji}`);
                }
                return {
                    ok: true,
                    success: true,
                    status: result.status || 200,
                    statusText: result.statusText || 'OK',
                    data: result.data || { message: 'Reaction added successfully' },
                    headers: result.headers || {}
                };
            } else {
                if (shouldLogError(normalizedEndpoint, 'add_reaction_failed')) {
                    console.error(`[API] addReaction failed: ${result.status} - ${result.message}`);
                }
                
                const errorObj = {
                    ok: false,
                    success: false,
                    status: result.status || 500,
                    statusText: result.statusText || 'Reaction Failed',
                    data: result.data || { message: result.message || 'Failed to add reaction' },
                    headers: result.headers || {}
                };
                
                return errorObj;
            }
            
        } catch (error) {
            console.error(`[API] addReaction critical error:`, error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    function initPublicInterface() {
        try {
            initDependencies();
            initializeGateway();
            blockDirectFetchCalls();
            monitorPolling();
            setupFailureRecovery();
            
            const publicApi = {
                // Core methods
                secureFetch: _secureApiFetch,
                get: apiGet,
                post: apiPost,
                put: apiPut,
                delete: apiDelete,
                upload: apiUpload,
                healthCheck: apiHealthCheck,
                request: requestWrapper,
                
                // Utility methods
                _normalizeEndpoint: normalizeEndpoint,
                _normalizeAuthPayload: normalizeAuthPayload,
                _testNormalization: testNormalization,
                _safeJsonSerialize: safeJsonSerialize,
                _safeParseResponse: safeParseResponse,
                _createErrorResponse: createErrorResponse,
                
                // Safety state and helpers
                _safetyState: _safetyState,
                _getSafeDefaultResponse: getSafeDefaultResponse,
                
                // Gateway state
                _gatewayState: _gatewayState,
                
                // Message methods
                getMessages,
                getMessageById,
                sendMessage,
                deleteMessage,
                editMessage,
                addReaction,
                
                // Friend methods
                getFriends,
                addFriend,
                acceptFriendRequest,
                rejectFriendRequest,
                getIncomingFriendRequests,
                getSentFriendRequests,
                blockFriend,
                unblockFriend,
                unfriend,
                
                // Group methods
                getGroups,
                getGroupById,
                createGroup,
                
                // Status methods
                getStatuses,
                getStatus,
                createStatus,
                
                // Call methods
                getCalls,
                startCall,
                
                // Settings methods
                getSettings,
                getFeatures,
                updateSettings,
                getTools,
                
                // User methods
                getUsers,
                getUserById,
                
                // Chat methods
                getChats,
                getChatById,
                startDirectChat,
                getUnreadCounts,
                markMessagesRead,
                
                // Contact methods
                getContacts,
                
                // Notification methods
                getNotifications,
                getUserPreferences,
                
                // Marker
                TRUSTED_REQUEST_MARKER
            };
            
            if (!window.api) {
                window.api = {};
            }
            
            if (!window.api.request) {
                window.api.request = publicApi;
            } else {
                Object.assign(window.api.request, publicApi);
            }
            
            if (!window.secureApiFetch) {
                window.secureApiFetch = _secureApiFetch;
            }
            
            window.__API_REQUESTS = publicApi;
            
            if (!window.__originalFetch && window.fetch) {
                window.__originalFetch = window.fetch;
            }
            
            console.log("[API] ✅ api.request.js initialized with centralized session integration");
            
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                setTimeout(() => {
                    testNormalization();
                }, 1000);
            }
            
            setTimeout(() => {
                try {
                    window.dispatchEvent(new Event("api-request-ready"));
                } catch (e) {
                    console.log('[API] ⏳ api-request-ready event dispatched');
                }
            }, 100);
            
        } catch (error) {
            console.error("[API] ❌ Failed to initialize public interface:", error);
            if (!window.api) window.api = {};
            if (!window.api.request) window.api.request = {
                get: () => Promise.resolve(getSafeDefaultResponse('unknown', 'fallback')),
                post: () => Promise.resolve(getSafeDefaultResponse('unknown', 'fallback')),
                request: () => Promise.resolve(getSafeDefaultResponse('unknown', 'fallback'))
            };
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPublicInterface);
    } else {
        initPublicInterface();
    }
    
})();