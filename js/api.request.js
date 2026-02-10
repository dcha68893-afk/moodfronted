// api.request.js - Enhanced API Request Methods with Centralized Token Handling
// Version: 20.5.4 - Part 3 of 3: Request Methods - FIXED NORMALIZATION & JSON ISSUES
// Date: 2024-01-02
// 🔧 CRITICAL FIX: Fixed double /api prefix issue
// 🔧 CRITICAL FIX: Proper JSON payload serialization for all methods
// 🔧 CRITICAL FIX: Full URL detection and pass-through
// 🔧 CRITICAL FIX: Auth payload normalization for login/register
// 🔧 NEW: Single source of /api prefix - normalized exactly once with edge case protection
// 🔒 SAFETY: Added comprehensive error handling and safety guards

// Wrap in IIFE to prevent global scope pollution
(function() {
    // Prevent duplicate loading
    if (window._API_REQUEST_LOADED_) {
        console.log("🔧 api.request.js already loaded, skipping");
        return;
    }
    
    console.log("✅ api.request.js loaded with normalization fixes and safety guards");
    
    // Mark as loaded
    window._API_REQUEST_LOADED_ = true;
    
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
        errorLogInterval: 5000 // 5 seconds between repeated error logs
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
    
    /**
     * Safety: Check if we should allow another request
     */
    function shouldAllowRequest(endpoint, functionName) {
        const endpointKey = `${functionName}:${endpoint}`;
        
        // Check concurrent request limit
        if (_safetyState.activeRequests.size >= _safetyState.maxConcurrentRequests) {
            if (shouldLogError(endpointKey, 'concurrent_limit')) {
                console.warn(`⚠️ [SAFETY] Too many concurrent requests (${_safetyState.activeRequests.size}), delaying: ${endpointKey}`);
            }
            return false;
        }
        
        // Check error limit
        const errorCount = _safetyState.errorCounts.get(endpointKey) || 0;
        if (errorCount >= _safetyState.maxErrorsPerEndpoint) {
            if (shouldLogError(endpointKey, 'error_limit')) {
                console.warn(`⚠️ [SAFETY] Error limit reached for ${endpointKey}, blocking further requests`);
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
                console.warn('⚠️ secureApiFetch not found in window.__API_CORE, creating fallback');
                _secureApiFetch = createFallbackSecureFetch();
            }
            
            if (!_getUserToken || typeof _getUserToken !== 'function') {
                console.warn('⚠️ getUserToken not found in window.__API_CORE');
                _getUserToken = function() { return null; };
            }
            
            if (!_apiCache) {
                console.warn('⚠️ _apiCache not found in window.__API_CORE');
                _apiCache = {
                    get: () => null,
                    set: () => {},
                    delete: () => {}
                };
            }
            
            if (!_apiRequestQueue) {
                console.warn('⚠️ _apiRequestQueue not found in window.__API_CORE');
                _apiRequestQueue = {
                    isLoginComplete: () => true,
                    addRequest: (fn, desc, endpoint) => fn()
                };
            }
            
            _requestState.initialized = true;
            
        } catch (error) {
            console.error('❌ [SAFETY] Failed to initialize dependencies:', error);
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
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedUrl, functionName)) {
                return getSafeDefaultResponse(normalizedUrl, functionName);
            }
            
            const retryCount = trackRequestStart(normalizedUrl, functionName);
            
            try {
                console.log(`🔧 [FALLBACK] secureApiFetch called: ${normalizedUrl}`);
                
                // Safety: Check retry limit
                if (retryCount > _safetyState.maxRetriesPerRequest) {
                    console.warn(`⚠️ [SAFETY] Max retries reached for ${normalizedUrl}`);
                    trackRequestEnd(normalizedUrl, functionName, false);
                    return getSafeDefaultResponse(normalizedUrl, functionName, new Error('Max retries reached'));
                }
                
                const token = _getUserToken ? _getUserToken() : null;
                const isPublic = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
                const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
                const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
                
                // 🔧 FIX: Always set Content-Type for JSON requests
                const defaultHeaders = {
                    'Content-Type': 'application/json'
                };
                
                // Merge headers, but don't override Content-Type if already set
                const headers = {
                    ...defaultHeaders,
                    ...(options.headers || {})
                };
                
                // Add Authorization header for non-public endpoints
                if (!isPublic && !isStatus && !isAuth && token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                
                // Prepare fetch options
                const fetchOptions = {
                    method: options.method || 'GET',
                    headers: headers,
                    credentials: 'include',
                    ...options
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
                        console.log(`🔧 [FALLBACK] JSON payload:`, options.body);
                    } else if (typeof options.body === 'string') {
                        // Already a string, assume it's JSON
                        fetchOptions.body = options.body;
                        try {
                            // Validate it's valid JSON
                            JSON.parse(options.body);
                        } catch (e) {
                            console.warn(`⚠️ [FALLBACK] Body appears to be string but not valid JSON:`, options.body);
                        }
                    } else {
                        // Other types (number, boolean, etc.)
                        fetchOptions.body = String(options.body);
                    }
                }
                
                // Safety: Dynamic backend origin
                let fullUrl = normalizedUrl;
                if (!normalizedUrl.startsWith('http://') && 
                    !normalizedUrl.startsWith('https://') && 
                    !normalizedUrl.startsWith('/')) {
                    
                    // Try multiple sources for base URL
                    let baseUrl = _BACKEND_BASE_URL || _BASE_API_URL || window.API_BASE_URL || '';
                    
                    // Fallback to current origin if no base URL configured
                    if (!baseUrl && typeof window !== 'undefined' && window.location && window.location.origin) {
                        baseUrl = window.location.origin;
                        console.log(`🔧 [SAFETY] Using dynamic origin: ${baseUrl}`);
                    }
                    
                    fullUrl = baseUrl + (normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl);
                }
                
                console.log(`🔧 [FALLBACK] Fetching: ${fullUrl}`);
                
                // Safety: Timeout handling
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), _requestState.requestTimeout);
                fetchOptions.signal = controller.signal;
                
                const response = await fetch(fullUrl, fetchOptions);
                clearTimeout(timeoutId);
                
                // Handle response
                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    try {
                        data = await response.json();
                    } catch (e) {
                        console.warn(`⚠️ [FALLBACK] Failed to parse JSON response from ${normalizedUrl}`);
                        data = await response.text();
                    }
                } else {
                    data = await response.text();
                }
                
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
                    result.message = data.message || data.error || response.statusText;
                    
                    // Add error classification
                    if (response.status === 401) {
                        result.isAuthError = true;
                    } else if (response.status === 403) {
                        result.isForbidden = true;
                    } else if (response.status === 429) {
                        result.isRateLimited = true;
                    } else if (response.status >= 500) {
                        result.isServerError = true;
                    }
                }
                
                trackRequestEnd(normalizedUrl, functionName, response.ok);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedUrl, functionName, false);
                const errorCount = trackError(normalizedUrl, functionName, error.name || 'fetch_error');
                
                if (shouldLogError(normalizedUrl, 'fetch_error')) {
                    console.error(`❌ [SAFETY] Fetch error for ${normalizedUrl} (attempt ${errorCount}):`, error.message);
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
                console.warn('⚠️ [NORMALIZE] Undefined/null endpoint, defaulting to /api/');
                return '/api/';
            }
            
            // Convert to string and trim
            const endpointStr = String(endpoint).trim();
            
            // 🔧 FIX: Handle empty string after trimming
            if (endpointStr === '') {
                console.warn('⚠️ [NORMALIZE] Empty endpoint, defaulting to /api/');
                return '/api/';
            }
            
            // 🔧 CRITICAL FIX: Detect and preserve full URLs (http://, https://)
            // Full URLs should NOT be modified
            if (endpointStr.startsWith('http://') || endpointStr.startsWith('https://')) {
                console.log(`🔧 [NORMALIZE] Full URL detected, skipping normalization: ${endpointStr}`);
                return endpointStr;
            }
            
            // Check if already has /api prefix (case insensitive)
            const lowerEndpoint = endpointStr.toLowerCase();
            
            // 🔧 FIX: Handle multiple /api prefixes (edge case protection)
            // Remove ALL /api prefixes first, then add exactly one
            let cleanEndpoint = endpointStr;
            
            // Remove any leading "api/" or "/api" prefixes (case insensitive)
            // This handles inputs like "api/auth/login", "/api/auth/login", "API/auth/login", etc.
            cleanEndpoint = cleanEndpoint.replace(/^\/?api\//i, '/');
            cleanEndpoint = cleanEndpoint.replace(/^\/?api$/i, '/');
            
            // Ensure the clean endpoint starts with a slash
            if (!cleanEndpoint.startsWith('/')) {
                cleanEndpoint = '/' + cleanEndpoint;
            }
            
            // Now add exactly one /api prefix
            const normalized = '/api' + cleanEndpoint;
            
            console.log(`🔧 [NORMALIZE] "${endpoint}" → "${normalized}"`);
            return normalized;
            
        } catch (error) {
            console.error('❌ [SAFETY] normalizeEndpoint failed:', error);
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
                    console.log('🔧 [AUTH] Copied username to email field (username appears to be email)');
                }
            }
            
            // Case 2: If email provided but no username, use email as username
            if (normalized.email && !normalized.username) {
                normalized.username = normalized.email;
                console.log('🔧 [AUTH] Using email as username');
            }
            
            // Case 3: For registration, ensure confirmPassword matches password
            if (normalized.password && !normalized.confirmPassword) {
                normalized.confirmPassword = normalized.password;
                console.log('🔧 [AUTH] Copied password to confirmPassword field');
            }
            
            // Case 4: Ensure name field is present for registration if not provided
            if (!normalized.name && normalized.username) {
                normalized.name = normalized.username.split('@')[0]; // Use part before @ for email
                console.log('🔧 [AUTH] Generated name from username');
            }
            
            // 🔧 FIX: Remove any null/undefined/empty string values
            // Some APIs reject empty strings in JSON
            Object.keys(normalized).forEach(key => {
                if (normalized[key] === null || 
                    normalized[key] === undefined || 
                    normalized[key] === '') {
                    delete normalized[key];
                    console.log(`🔧 [AUTH] Removed empty field: ${key}`);
                }
            });
            
            // 🔒 SECURITY: Never log passwords in console
            const safeLogPayload = { ...normalized };
            if (safeLogPayload.password) safeLogPayload.password = '[REDACTED]';
            if (safeLogPayload.confirmPassword) safeLogPayload.confirmPassword = '[REDACTED]';
            console.log('🔧 [AUTH] Normalized payload:', safeLogPayload);
            
            return normalized;
            
        } catch (error) {
            console.error('❌ [SAFETY] normalizeAuthPayload failed:', error);
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
            console.error('❌ [SAFETY] Failed to serialize payload:', error, payload);
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
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            const retryCount = trackRequestStart(normalizedEndpoint, functionName);
            
            // Generate request ID for tracking
            const requestId = `${options.method || 'GET'}_${normalizedEndpoint}_${Date.now()}`;
            
            console.log(`🔧 [ENHANCED] Request ${requestId}: ${endpoint} → ${normalizedEndpoint}`);
            
            // Check if we should retry on failure
            const shouldRetry = options.retry !== false;
            const maxRetries = options.maxRetries || _requestState.maxRetries;
            const retryDelay = options.retryDelay || _requestState.retryDelay;
            
            let lastError;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // Safety: Check retry limit
                    if (retryCount > _safetyState.maxRetriesPerRequest) {
                        console.warn(`⚠️ [SAFETY] Max retries reached for ${normalizedEndpoint}`);
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        return getSafeDefaultResponse(normalizedEndpoint, functionName, new Error('Max retries reached'));
                    }
                    
                    // Log attempt
                    if (attempt > 1) {
                        console.log(`🔧 [ENHANCED] Retry attempt ${attempt}/${maxRetries} for ${normalizedEndpoint}`);
                    }
                    
                    // Use the original secureApiFetch with normalized endpoint
                    const result = await _secureApiFetch(normalizedEndpoint, options);
                    
                    // If successful, return result
                    if (result.success) {
                        if (attempt > 1) {
                            console.log(`✅ [ENHANCED] Request succeeded on attempt ${attempt}: ${normalizedEndpoint}`);
                        }
                        trackRequestEnd(normalizedEndpoint, functionName, true);
                        return result;
                    }
                    
                    // Handle specific error cases
                    if (result.status === 401) {
                        // Auth error - don't retry
                        console.warn(`🔐 [ENHANCED] Auth error (401) for ${normalizedEndpoint}, not retrying`);
                        trackRequestEnd(normalizedEndpoint, functionName, false);
                        trackError(normalizedEndpoint, functionName, 'auth_error');
                        return result;
                    }
                    
                    if (result.status === 429) {
                        // Rate limited - respect Retry-After header if present
                        const retryAfter = result.headers?.['retry-after'] || result.headers?.['Retry-After'];
                        if (retryAfter && attempt < maxRetries) {
                            const delay = parseInt(retryAfter) * 1000 || retryDelay;
                            console.log(`⏳ [ENHANCED] Rate limited, waiting ${delay}ms before retry`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            continue;
                        }
                    }
                    
                    // For server errors, retry with exponential backoff
                    if (result.status >= 500 && shouldRetry && attempt < maxRetries) {
                        const delay = retryDelay * Math.pow(2, attempt - 1);
                        console.log(`⏳ [ENHANCED] Server error ${result.status}, retrying in ${delay}ms`);
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
                        console.error(`❌ [ENHANCED] Attempt ${attempt} failed for ${normalizedEndpoint}:`, error.message);
                    }
                    lastError = error;
                    
                    // Network errors - retry with exponential backoff
                    if (shouldRetry && attempt < maxRetries) {
                        const delay = retryDelay * Math.pow(2, attempt - 1);
                        console.log(`⏳ [ENHANCED] Network error, retrying in ${delay}ms`);
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
                console.error(`❌ [ENHANCED] All ${maxRetries} attempts failed for ${normalizedEndpoint} (total errors: ${errorCount})`);
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
            console.error('❌ [SAFETY] enhancedSecureFetch critical error:', error);
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
                console.error('❌ [SAFETY] api.get() called with invalid URL:', url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            console.log(`🔧 [API] api.get() called for: ${url}`);
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            console.log(`🔧 [API] Normalized to: ${normalizedUrl}`);
            
            // Check if this is a public endpoint (using normalized URL)
            const isPublic = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            console.log(`🔧 [API] Token from centralized system: ${token ? `Present (${token.substring(0, 20)}...)` : 'Not found'}`);
            console.log(`🔧 [API] Is public endpoint: ${isPublic}`);
            console.log(`🔧 [API] Is status endpoint: ${isStatus}`);
            console.log(`🔧 [API] Is auth endpoint: ${isAuth}`);
            
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
                    console.log(`🔧 [CACHE] Returning cached data for: ${normalizedUrl}`);
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
                        console.error(`❌ [API] GET request failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available and request failed
                    if (cachedData) {
                        console.log(`🔧 [CACHE] Request failed, returning cached data for: ${normalizedUrl}`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] api.get() error for ${normalizedUrl}:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizeEndpoint(url)}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] Error occurred, returning cached data for: ${normalizeEndpoint(url)}`);
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
            console.error('❌ [SAFETY] api.get() critical error:', error);
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
                console.error('❌ [SAFETY] api.post() called with invalid URL:', url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            console.log(`🔧 [API] api.post() called for: ${url}`);
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            console.log(`🔧 [API] Normalized to: ${normalizedUrl}`);
            
            // Check if this is an auth endpoint for special payload handling
            const isAuthEndpoint = normalizedUrl.includes('/auth/');
            
            // 🔧 FIX: Normalize auth payloads for backward compatibility
            let payload = data;
            if (isAuthEndpoint && payload && typeof payload === 'object') {
                console.log('🔧 [API] Normalizing auth payload for login/register');
                payload = normalizeAuthPayload(payload);
                
                // 🔒 SECURITY: Never log passwords
                const safeLogPayload = { ...payload };
                if (safeLogPayload.password) safeLogPayload.password = '[REDACTED]';
                if (safeLogPayload.confirmPassword) safeLogPayload.confirmPassword = '[REDACTED]';
                console.log('🔧 [API] Normalized payload:', safeLogPayload);
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
            const isPublic = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            console.log(`🔧 [API] Token from centralized system: ${token ? `Present (${token.substring(0, 20)}...)` : 'Not found'}`);
            console.log(`🔧 [API] Is public endpoint: ${isPublic}`);
            console.log(`🔧 [API] Is status endpoint: ${isStatus}`);
            console.log(`🔧 [API] Is auth endpoint: ${isAuth}`);
            
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
                        console.error(`❌ [API] POST request failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] api.post() error for ${normalizedUrl}:`, error.message);
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
            console.error('❌ [SAFETY] api.post() critical error:', error);
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
                console.error('❌ [SAFETY] api.put() called with invalid URL:', url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            console.log(`🔧 [API] api.put() called for: ${url}`);
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            console.log(`🔧 [API] Normalized to: ${normalizedUrl}`);
            
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
            const isPublic = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            console.log(`🔧 [API] Token from centralized system: ${token ? `Present (${token.substring(0, 20)}...)` : 'Not found'}`);
            console.log(`🔧 [API] Is public endpoint: ${isPublic}`);
            console.log(`🔧 [API] Is status endpoint: ${isStatus}`);
            console.log(`🔧 [API] Is auth endpoint: ${isAuth}`);
            
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
                        console.error(`❌ [API] PUT request failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] api.put() error for ${normalizedUrl}:`, error.message);
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
            console.error('❌ [SAFETY] api.put() critical error:', error);
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
                console.error('❌ [SAFETY] api.delete() called with invalid URL:', url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            console.log(`🔧 [API] api.delete() called for: ${url}`);
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            console.log(`🔧 [API] Normalized to: ${normalizedUrl}`);
            
            // Check if this is a public endpoint (using normalized URL)
            const isPublic = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            console.log(`🔧 [API] Token from centralized system: ${token ? `Present (${token.substring(0, 20)}...)` : 'Not found'}`);
            console.log(`🔧 [API] Is public endpoint: ${isPublic}`);
            console.log(`🔧 [API] Is status endpoint: ${isStatus}`);
            console.log(`🔧 [API] Is auth endpoint: ${isAuth}`);
            
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
                        console.error(`❌ [API] DELETE request failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] api.delete() error for ${normalizedUrl}:`, error.message);
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
            console.error('❌ [SAFETY] api.delete() critical error:', error);
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
                console.error('❌ [SAFETY] api.upload() called with invalid URL:', url);
                return getSafeDefaultResponse(url || 'unknown', functionName, new Error('Invalid URL'));
            }
            
            console.log(`🔧 [API] api.upload() called for: ${url}`);
            
            // 🔧 FIX: Normalize URL with /api prefix
            const normalizedUrl = normalizeEndpoint(url);
            console.log(`🔧 [API] Normalized to: ${normalizedUrl}`);
            
            // Check if this is a public endpoint (using normalized URL)
            const isPublic = _isPublicEndpoint ? _isPublicEndpoint(normalizedUrl) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedUrl) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedUrl) : false;
            
            // Use centralized token system
            const token = _getUserToken ? _getUserToken() : null;
            
            console.log(`🔧 [API] Token from centralized system: ${token ? `Present (${token.substring(0, 20)}...)` : 'Not found'}`);
            console.log(`🔧 [API] Is public endpoint: ${isPublic}`);
            console.log(`🔧 [API] Is status endpoint: ${isStatus}`);
            console.log(`🔧 [API] Is auth endpoint: ${isAuth}`);
            
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
                        console.error(`❌ [API] Upload request failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Upload failed' };
                    }
                    
                    // Only throw for auth errors without token
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] api.upload() error for ${normalizedUrl}:`, error.message);
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
            console.error('❌ [SAFETY] api.upload() critical error:', error);
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
                
                // Add authorization header if token exists
                if (token) {
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
                console.error('❌ [SAFETY] xhrUpload error:', error);
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
            console.log(`🔧 [API] api.healthCheck() called`);
            
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
                
                for (const endpoint of endpoints) {
                    try {
                        // 🔧 UPDATED: Use enhanced secure fetch
                        const result = await enhancedSecureFetch(endpoint, { 
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
                                endpoint: endpoint,
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
                    console.error(`❌ [SAFETY] api.healthCheck() error:`, error.message);
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
            console.error('❌ [SAFETY] api.healthCheck() critical error:', error);
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
                    console.log(`🔧 [CACHE] Returning cached messages`);
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
                        console.error(`❌ [API] getMessages failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getMessages failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getMessages error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getMessages error, returning cached data`);
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
            console.error('❌ [SAFETY] getMessages critical error:', error);
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
                console.error('❌ [SAFETY] getMessageById called without messageId');
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
                    console.log(`🔧 [CACHE] Returning cached message ${messageId}`);
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
                        console.error(`❌ [API] getMessageById failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getMessageById error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getMessageById error, returning cached data`);
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
            console.error('❌ [SAFETY] getMessageById critical error:', error);
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
                console.error('❌ [SAFETY] sendMessage called without messageData');
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
                        console.error(`❌ [API] sendMessage failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] sendMessage error:`, error.message);
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
            console.error('❌ [SAFETY] sendMessage critical error:', error);
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
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached friends`);
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
                        console.error(`❌ [API] getFriends failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getFriends failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getFriends error:`, error.message);
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getFriends error, returning cached data`);
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
            console.error('❌ [SAFETY] getFriends critical error:', error);
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
                console.error('❌ [SAFETY] addFriend called without userId');
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
                        console.error(`❌ [API] addFriend failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] addFriend error:`, error.message);
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
            console.error('❌ [SAFETY] addFriend critical error:', error);
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
                    console.log(`🔧 [CACHE] Returning cached groups`);
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
                        console.error(`❌ [API] getGroups failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getGroups failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getGroups error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getGroups error, returning cached data`);
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
            console.error('❌ [SAFETY] getGroups critical error:', error);
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
                console.error('❌ [SAFETY] getGroupById called without groupId');
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
                    console.log(`🔧 [CACHE] Returning cached group ${groupId}`);
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
                        console.error(`❌ [API] getGroupById failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getGroupById error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getGroupById error, returning cached data`);
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
            console.error('❌ [SAFETY] getGroupById critical error:', error);
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
                console.error('❌ [SAFETY] createGroup called without groupData');
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
                        console.error(`❌ [API] createGroup failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] createGroup error:`, error.message);
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
            console.error('❌ [SAFETY] createGroup critical error:', error);
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
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached statuses`);
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
                        console.error(`❌ [API] getStatuses failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getStatuses failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getStatuses error:`, error.message);
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getStatuses error, returning cached data`);
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
            console.error('❌ [SAFETY] getStatuses critical error:', error);
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
                console.error('❌ [SAFETY] getStatus called without statusId');
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
                    console.log(`🔧 [CACHE] Returning cached status ${statusId}`);
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
                        console.error(`❌ [API] getStatus failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getStatus error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getStatus error, returning cached data`);
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
            console.error('❌ [SAFETY] getStatus critical error:', error);
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
                console.error('❌ [SAFETY] createStatus called without statusData');
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
                        console.error(`❌ [API] createStatus failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] createStatus error:`, error.message);
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
            console.error('❌ [SAFETY] createStatus critical error:', error);
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
                    console.log(`🔧 [CACHE] Returning cached calls`);
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
                        console.error(`❌ [API] getCalls failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getCalls failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getCalls error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getCalls error, returning cached data`);
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
            console.error('❌ [SAFETY] getCalls critical error:', error);
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
                console.error('❌ [SAFETY] startCall called without callData');
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
                        console.error(`❌ [API] startCall failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] startCall error:`, error.message);
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
            console.error('❌ [SAFETY] startCall critical error:', error);
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
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached settings`);
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
                        console.error(`❌ [API] getSettings failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getSettings failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                            
                            console.log('🔧 [API] Background settings update completed');
                        } catch (bgError) {
                            console.log('🔧 [API] Background settings update failed:', bgError.message);
                        }
                    }, 2000); // Wait 2 seconds before background updates
                }
                
                trackRequestEnd(normalizedEndpoint, functionName, true);
                return result;
                
            } catch (error) {
                trackRequestEnd(normalizedEndpoint, functionName, false);
                const errorCount = trackError(normalizedEndpoint, functionName, 'get_settings_error');
                
                if (shouldLogError(normalizedEndpoint, 'get_settings_error')) {
                    console.error(`❌ [SAFETY] getSettings error:`, error.message);
                }
                
                // Return cached data as fallback
                if (cachedData) {
                    console.log(`🔧 [CACHE] getSettings error, returning cached data`);
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
            console.error('❌ [SAFETY] getSettings critical error:', error);
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
                console.log(`🔧 [CACHE] Returning cached features`);
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
                        console.warn(`⚠️ [API] getFeatures failed: ${result.status} - ${result.message}, using cached or default`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getFeatures failed, returning cached data`);
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
                    console.error(`❌ [SAFETY] getFeatures error:`, error.message);
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getFeatures error, returning cached data`);
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
            console.error('❌ [SAFETY] getFeatures critical error:', error);
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
                console.error('❌ [SAFETY] updateSettings called without settingsData');
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
                        console.error(`❌ [API] updateSettings failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] updateSettings error:`, error.message);
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
            console.error('❌ [SAFETY] updateSettings critical error:', error);
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
                    console.log(`🔧 [CACHE] Returning cached tools`);
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
                        console.error(`❌ [API] getTools failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getTools failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getTools error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getTools error, returning cached data`);
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
            console.error('❌ [SAFETY] getTools critical error:', error);
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
                    console.log(`🔧 [CACHE] Returning cached users`);
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
                        console.error(`❌ [API] getUsers failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getUsers failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getUsers error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getUsers error, returning cached data`);
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
            console.error('❌ [SAFETY] getUsers critical error:', error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getUserById(userId) {
        const functionName = 'getUserById';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!userId) {
                console.error('❌ [SAFETY] getUserById called without userId');
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
                    console.log(`🔧 [CACHE] Returning cached user ${userId}`);
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
                        console.error(`❌ [API] getUserById failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getUserById error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getUserById error, returning cached data`);
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
            console.error('❌ [SAFETY] getUserById critical error:', error);
            return getSafeDefaultResponse('/users/:id', functionName, error);
        }
    }
    
    async function getChats() {
        const functionName = 'getChats';
        const endpoint = '/chats';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
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
                    console.log(`🔧 [CACHE] Returning cached chats`);
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
                        console.error(`❌ [API] getChats failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getChats failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getChats error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getChats error, returning cached data`);
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
            console.error('❌ [SAFETY] getChats critical error:', error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getChatById(chatId) {
        const functionName = 'getChatById';
        
        try {
            // 🔧 FIX: Defensive null check
            if (!chatId) {
                console.error('❌ [SAFETY] getChatById called without chatId');
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
                    console.log(`🔧 [CACHE] Returning cached chat ${chatId}`);
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
                        console.error(`❌ [API] getChatById failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Only throw for auth errors without token
                    const token = _getUserToken ? _getUserToken() : null;
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getChatById error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getChatById error, returning cached data`);
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
            console.error('❌ [SAFETY] getChatById critical error:', error);
            return getSafeDefaultResponse('/chats/:id', functionName, error);
        }
    }
    
    async function getContacts() {
        const functionName = 'getContacts';
        const endpoint = '/contacts';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
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
                    console.log(`🔧 [CACHE] Returning cached contacts`);
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
                        console.error(`❌ [API] getContacts failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getContacts failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getContacts error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getContacts error, returning cached data`);
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
            console.error('❌ [SAFETY] getContacts critical error:', error);
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
                    console.log(`🔧 [CACHE] Returning cached notifications`);
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
                        console.error(`❌ [API] getNotifications failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getNotifications failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getNotifications error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getNotifications error, returning cached data`);
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
            console.error('❌ [SAFETY] getNotifications critical error:', error);
            return getSafeDefaultResponse(endpoint, functionName, error);
        }
    }
    
    async function getUserPreferences() {
        const functionName = 'getUserPreferences';
        const endpoint = '/user/preferences';
        
        try {
            // 🔧 FIX: Normalize endpoint
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
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
                    console.log(`🔧 [CACHE] Returning cached user preferences`);
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
                        console.error(`❌ [API] getUserPreferences failed: ${result.status} - ${result.message}`);
                    }
                    
                    // 🔧 FIX: Defensive null checks
                    if (!result.data) {
                        result.data = { message: result.message || 'Request failed' };
                    }
                    
                    // Return cached data if available
                    if (cachedData) {
                        console.log(`🔧 [CACHE] getUserPreferences failed, returning cached data`);
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
                    if (result.status === 401 && !token) {
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
                    console.error(`❌ [SAFETY] getUserPreferences error:`, error.message);
                }
                
                // Check cache as fallback
                const cacheKey = `get_${normalizedEndpoint}`;
                const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
                
                if (cachedData) {
                    console.log(`🔧 [CACHE] getUserPreferences error, returning cached data`);
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
            console.error('❌ [SAFETY] getUserPreferences critical error:', error);
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
            
            if (shouldLogError(normalizedEndpoint, 'request_call')) {
                console.log(`🔧 [REQUEST] Normalized: ${endpoint} → ${normalizedEndpoint}`);
            }
            
            // Safety: Check if request should proceed
            if (!shouldAllowRequest(normalizedEndpoint, functionName)) {
                return getSafeDefaultResponse(normalizedEndpoint, functionName);
            }
            
            trackRequestStart(normalizedEndpoint, functionName);
            
            // Use secureApiFetch with LOGIN/REGISTRATION FIXES
            // 🔧 CRITICAL: Public endpoints bypass all token checks
            
            // Check if this is a public endpoint (using normalized endpoint)
            const isPublic = _isPublicEndpoint ? _isPublicEndpoint(normalizedEndpoint) : false;
            const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedEndpoint) : false;
            const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedEndpoint) : false;
            
            // If this is a public endpoint, execute immediately without queue
            if (isPublic || isStatus || isAuth) {
                if (shouldLogError(normalizedEndpoint, 'public_endpoint')) {
                    console.log(`🔧 [REQUEST] PUBLIC/AUTH/STATUS endpoint - executing immediately: ${normalizedEndpoint}`);
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
                console.log(`🔐 [QUEUE] Delaying protected endpoint until login complete: ${normalizedEndpoint}`);
                
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
                console.error(`❌ [SAFETY] request function error for ${endpoint}:`, error.message);
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
            
            console.log('🧪 Testing endpoint normalization:');
            testCases.forEach(([input, expected]) => {
                const result = normalizeEndpoint(input);
                const pass = result === expected;
                console.log(`  ${pass ? '✅' : '❌'} "${input}" → "${result}" ${pass ? '' : `(expected: "${expected}")`}`);
            });
        } catch (error) {
            console.error('❌ [SAFETY] testNormalization failed:', error);
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
                
                // Safety methods (for debugging)
                _safetyState: _safetyState,
                _getSafeDefaultResponse: getSafeDefaultResponse,
                
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
                getUserPreferences
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
            
            console.log("✅ api.request.js initialized with fixed /api prefix normalization and safety guards");
            
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
                    console.log('🔧 [API] api-request-ready event dispatched');
                }
            }, 100);
            
        } catch (error) {
            console.error('❌ [SAFETY] Failed to initialize public interface:', error);
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
    initPublicInterface();
    
})();