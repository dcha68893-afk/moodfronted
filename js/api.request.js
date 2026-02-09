
// api.request.js - Enhanced API Request Methods with Centralized Token Handling
// Version: 20.5.3 - Part 3 of 3: Request Methods - FIXED NORMALIZATION & JSON ISSUES
// Date: 2024-01-02
// 🔧 CRITICAL FIX: Fixed double /api prefix issue
// 🔧 CRITICAL FIX: Proper JSON payload serialization for all methods
// 🔧 CRITICAL FIX: Full URL detection and pass-through
// 🔧 CRITICAL FIX: Auth payload normalization for login/register
// 🔧 NEW: Single source of /api prefix - normalized exactly once with edge case protection

// Wrap in IIFE to prevent global scope pollution
(function() {
    // Prevent duplicate loading
    if (window._API_REQUEST_LOADED_) {
        console.log("🔧 api.request.js already loaded, skipping");
        return;
    }
    
    console.log("✅ api.request.js loaded with normalization fixes");
    
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
     * Initialize dependencies from external modules
     */
    function initDependencies() {
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
    }
    
    /**
     * Create fallback secureFetch if core module not available
     * 🔧 UPDATED: Fixed Content-Type header and JSON serialization
     */
    function createFallbackSecureFetch() {
        return async function secureApiFetch(url, options = {}) {
            console.log(`🔧 [FALLBACK] secureApiFetch called: ${url}`);
            
            // 🔧 FIX: Normalize URL with /api prefix exactly once
            const normalizedUrl = normalizeEndpoint(url);
            console.log(`🔧 [FALLBACK] Normalized URL: ${normalizedUrl}`);
            
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
            
            try {
                // Use appropriate base URL
                let fullUrl = normalizedUrl;
                if (!normalizedUrl.startsWith('http://') && 
                    !normalizedUrl.startsWith('https://') && 
                    !normalizedUrl.startsWith('/')) {
                    const baseUrl = _BACKEND_BASE_URL || _BASE_API_URL || window.API_BASE_URL || '';
                    fullUrl = baseUrl + (normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl);
                }
                
                console.log(`🔧 [FALLBACK] Fetching: ${fullUrl}`);
                
                const response = await fetch(fullUrl, fetchOptions);
                
                // Handle response
                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
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
                
                return result;
                
            } catch (error) {
                console.error('🔧 [FALLBACK] Fetch error:', error);
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: error.message || 'Network Error',
                    data: { message: error.message || 'Network request failed' },
                    headers: {},
                    networkError: true,
                    message: error.message || 'Network request failed'
                };
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
    }
    
    /**
     * Normalize login/register payload for backward compatibility
     * 🔧 ENHANCED: Better handling of email/username fields
     * @param {object} payload - The payload to normalize
     * @returns {object} Normalized payload with proper JSON structure
     */
    function normalizeAuthPayload(payload) {
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
        
        // 🔧 SECURITY: Never log passwords in console
        const safeLogPayload = { ...normalized };
        if (safeLogPayload.password) safeLogPayload.password = '[REDACTED]';
        if (safeLogPayload.confirmPassword) safeLogPayload.confirmPassword = '[REDACTED]';
        console.log('🔧 [AUTH] Normalized payload:', safeLogPayload);
        
        return normalized;
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
            console.error('🔧 [JSON] Failed to serialize payload:', error, payload);
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
        // 🔧 FIX: Normalize endpoint with /api prefix
        const normalizedEndpoint = normalizeEndpoint(endpoint);
        
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
                    return result;
                }
                
                // Handle specific error cases
                if (result.status === 401) {
                    // Auth error - don't retry
                    console.warn(`🔐 [ENHANCED] Auth error (401) for ${normalizedEndpoint}, not retrying`);
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
                return result;
                
            } catch (error) {
                console.error(`❌ [ENHANCED] Attempt ${attempt} failed for ${normalizedEndpoint}:`, error.message);
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
        console.error(`❌ [ENHANCED] All ${maxRetries} attempts failed for ${normalizedEndpoint}`);
        
        // Return a consistent error object
        return {
            ok: false,
            success: false,
            status: lastError?.status || 0,
            statusText: lastError?.message || 'All retry attempts failed',
            data: { 
                message: lastError?.message || 'Request failed after all retry attempts',
                endpoint: normalizedEndpoint,
                attempts: maxRetries
            },
            headers: {},
            networkError: true,
            retryFailed: true
        };
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
        
        try {
            // Check cache first for GET requests
            const cacheKey = `get_${normalizedUrl}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached data for: ${normalizedUrl}`);
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
                console.error(`❌ [API] GET request failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available and request failed
                if (cachedData) {
                    console.log(`🔧 [CACHE] Request failed, returning cached data for: ${normalizedUrl}`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] api.get() error:', error);
            
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
                console.error(`❌ [API] POST request failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] api.post() error:', error);
            
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
                console.error(`❌ [API] PUT request failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] api.put() error:', error);
            
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
        
        try {
            // 🔧 UPDATED: Use enhanced secure fetch with retry logic
            const result = await enhancedSecureFetch(url, { 
                method: 'DELETE',
                ...options
            });
            
            // 🔧 FIX: Safe error handling
            if (!result.success) {
                console.error(`❌ [API] DELETE request failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] api.delete() error:', error);
            
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
        
        try {
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
                    return xhrUpload(normalizedUrl, formData, options, token);
                }
            }
            
            // 🔧 UPDATED: Use enhanced secure fetch with retry logic
            const result = await enhancedSecureFetch(url, fetchOptions);
            
            // 🔧 FIX: Safe error handling
            if (!result.success) {
                console.error(`❌ [API] Upload request failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] api.upload() error:', error);
            
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
    }
    
    /**
     * XMLHttpRequest-based upload with progress support
     * 🔧 UPDATED: Uses normalized URL
     */
    function xhrUpload(url, formData, options, token) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // 🔧 FIX: Use normalized URL
            const normalizedUrl = normalizeEndpoint(url);
            
            // Build full URL
            let fullUrl = normalizedUrl;
            if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://') && !normalizedUrl.startsWith('/')) {
                const baseUrl = _BACKEND_BASE_URL || _BASE_API_URL || window.API_BASE_URL || '';
                fullUrl = baseUrl + (normalizedUrl.startsWith('/') ? normalizedUrl : '/' + normalizedUrl);
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
                }
                
                resolve(result);
            };
            
            xhr.onerror = () => {
                reject({
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Network Error',
                    data: { message: 'Network error during upload' },
                    headers: {},
                    networkError: true,
                    message: 'Network error during upload'
                });
            };
            
            xhr.ontimeout = () => {
                reject({
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: 'Timeout',
                    data: { message: 'Upload timeout' },
                    headers: {},
                    timeout: true,
                    message: 'Upload timeout'
                });
            };
            
            // Set timeout if specified
            if (options.timeout) {
                xhr.timeout = options.timeout;
            }
            
            xhr.send(formData);
        });
    }
    
    /**
     * api.healthCheck() - Check API health status
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with health status
     */
    async function apiHealthCheck() {
        console.log(`🔧 [API] api.healthCheck() called`);
        
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
            console.error('🔧 [API] api.healthCheck() error:', error);
            
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
        try {
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/messages';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached messages`);
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
                console.error(`❌ [API] getMessages failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getMessages failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getMessages error:', error);
            
            // Check cache as fallback
            const endpoint = '/messages';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    /**
     * getMessageById() - Get message by ID (used by message.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {string} messageId - Message ID
     * @returns {Promise} Promise with message data
     */
    async function getMessageById(messageId) {
        try {
            // 🔧 FIX: Defensive null check
            if (!messageId) {
                console.error('❌ [API] getMessageById called without messageId');
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
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached message ${messageId}`);
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
                console.error(`❌ [API] getMessageById failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getMessageById error:', error);
            
            // Check cache as fallback
            const endpoint = `/messages/${encodeURIComponent(messageId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    /**
     * sendMessage() - Send a new message (used by message.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} messageData - Message data
     * @returns {Promise} Promise with sent message data
     */
    async function sendMessage(messageData) {
        try {
            // 🔧 FIX: Defensive null check
            if (!messageData) {
                console.error('❌ [API] sendMessage called without messageData');
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
            const endpoint = '/messages';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // 🔧 UPDATED: Use enhanced secure fetch
            const result = await enhancedSecureFetch(endpoint, {
                method: 'POST',
                body: messageData
            });
            
            // 🔧 FIX: Safe error handling
            if (!result.success) {
                console.error(`❌ [API] sendMessage failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Invalidate messages cache since we added a new message
            if (_apiCache) {
                _apiCache.delete(`get_${normalizedEndpoint}`);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] sendMessage error:', error);
            
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
    }
    
    /**
     * getFriends() - Get all friends (used by friend.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with friends data
     */
    async function getFriends() {
        // 🔧 FIX: Normalize endpoint
        const endpoint = '/friends/list';
        const normalizedEndpoint = normalizeEndpoint(endpoint);
        
        // Check cache first
        const cacheKey = `get_${normalizedEndpoint}`;
        const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
        
        if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
            console.log(`🔧 [CACHE] Returning cached friends`);
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
                console.error(`❌ [API] getFriends failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getFriends failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getFriends error:', error);
            
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
    }
    
    /**
     * addFriend() - Add a friend (used by friend.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {string} userId - User ID to add as friend
     * @returns {Promise} Promise with friend request data
     */
    async function addFriend(userId) {
        try {
            // 🔧 FIX: Defensive null check
            if (!userId) {
                console.error('❌ [API] addFriend called without userId');
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
            const endpoint = '/friends/add';
            
            // 🔧 UPDATED: Use enhanced secure fetch
            const result = await enhancedSecureFetch(endpoint, {
                method: 'POST',
                body: { userId: userId }
            });
            
            // 🔧 FIX: Safe error handling
            if (!result.success) {
                console.error(`❌ [API] addFriend failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Invalidate friends cache since we added a new friend
            if (_apiCache) {
                _apiCache.delete('get_/api/friends/list');
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] addFriend error:', error);
            
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
    }
    
    /**
     * getGroups() - Get all groups (used by group.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with groups data
     */
    async function getGroups() {
        try {
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/groups';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached groups`);
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
                console.error(`❌ [API] getGroups failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getGroups failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getGroups error:', error);
            
            // Check cache as fallback
            const endpoint = '/groups';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    /**
     * getGroupById() - Get group by ID (used by group.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {string} groupId - Group ID
     * @returns {Promise} Promise with group data
     */
    async function getGroupById(groupId) {
        try {
            // 🔧 FIX: Defensive null check
            if (!groupId) {
                console.error('❌ [API] getGroupById called without groupId');
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
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached group ${groupId}`);
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
                console.error(`❌ [API] getGroupById failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getGroupById error:', error);
            
            // Check cache as fallback
            const endpoint = `/groups/${encodeURIComponent(groupId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    /**
     * createGroup() - Create a new group (used by group.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} groupData - Group data
     * @returns {Promise} Promise with created group data
     */
    async function createGroup(groupData) {
        try {
            // 🔧 FIX: Defensive null check
            if (!groupData) {
                console.error('❌ [API] createGroup called without groupData');
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
            
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/groups';
            
            // 🔧 UPDATED: Use enhanced secure fetch
            const result = await enhancedSecureFetch(endpoint, {
                method: 'POST',
                body: groupData
            });
            
            // 🔧 FIX: Safe error handling
            if (!result.success) {
                console.error(`❌ [API] createGroup failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Invalidate groups cache since we added a new group
            if (_apiCache) {
                _apiCache.delete('get_/api/group');
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] createGroup error:', error);
            
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
    }
    
    /**
     * getStatuses() - Get all statuses (used by status.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with statuses data
     */
    async function getStatuses() {
        // 🔧 FIX: Normalize endpoint
        const endpoint = '/statuses/all';
        const normalizedEndpoint = normalizeEndpoint(endpoint);
        
        // Check cache first
        const cacheKey = `get_${normalizedEndpoint}`;
        const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
        
        if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
            console.log(`🔧 [CACHE] Returning cached statuses`);
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
                console.error(`❌ [API] getStatuses failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getStatuses failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getStatuses error:', error);
            
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
    }
    
    /**
     * getStatus() - Get status by ID (used by status.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {string} statusId - Status ID
     * @returns {Promise} Promise with status data
     */
    async function getStatus(statusId) {
        try {
            // 🔧 FIX: Defensive null check
            if (!statusId) {
                console.error('❌ [API] getStatus called without statusId');
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
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached status ${statusId}`);
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
                console.error(`❌ [API] getStatus failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getStatus error:', error);
            
            // Check cache as fallback
            const endpoint = `/status/${encodeURIComponent(statusId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    /**
     * createStatus() - Create a new status (used by status.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} statusData - Status data
     * @returns {Promise} Promise with created status data
     */
    async function createStatus(statusData) {
        try {
            // 🔧 FIX: Defensive null check
            if (!statusData) {
                console.error('❌ [API] createStatus called without statusData');
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
            
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/status';
            
            // 🔧 UPDATED: Use enhanced secure fetch
            const result = await enhancedSecureFetch(endpoint, {
                method: 'POST',
                body: statusData
            });
            
            // 🔧 FIX: Safe error handling
            if (!result.success) {
                console.error(`❌ [API] createStatus failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Invalidate statuses cache since we added a new status
            if (_apiCache) {
                _apiCache.delete('get_/api/statuses/all');
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] createStatus error:', error);
            
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
    }
    
    /**
     * getCalls() - Get all calls (used by calls.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with calls data
     */
    async function getCalls() {
        try {
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/calls';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached calls`);
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
                console.error(`❌ [API] getCalls failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getCalls failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getCalls error:', error);
            
            // Check cache as fallback
            const endpoint = '/calls';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    /**
     * startCall() - Start a new call (used by calls.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} callData - Call data
     * @returns {Promise} Promise with call data
     */
    async function startCall(callData) {
        try {
            // 🔧 FIX: Defensive null check
            if (!callData) {
                console.error('❌ [API] startCall called without callData');
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
            
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/calls/start';
            
            // 🔧 UPDATED: Use enhanced secure fetch
            const result = await enhancedSecureFetch(endpoint, {
                method: 'POST',
                body: callData
            });
            
            // 🔧 FIX: Safe error handling
            if (!result.success) {
                console.error(`❌ [API] startCall failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Invalidate calls cache since we started a new call
            if (_apiCache) {
                _apiCache.delete('get_/api/calls');
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] startCall error:', error);
            
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
        // 🔧 FIX: Normalize endpoint
        const endpoint = '/settings';
        const normalizedEndpoint = normalizeEndpoint(endpoint);
        
        // Check cache first
        const cacheKey = `get_${normalizedEndpoint}`;
        const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
        
        if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
            console.log(`🔧 [CACHE] Returning cached settings`);
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
                console.error(`❌ [API] getSettings failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getSettings failed, returning cached data`);
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
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getSettings error:', error);
            
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
    }
    
    /**
     * getFeatures() - Get available features from server
     * Uses centralized token system and caching
     * Includes caching and safe defaults
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with features data
     */
    async function getFeatures() {
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
        const endpoint = '/features';
        const normalizedEndpoint = normalizeEndpoint(endpoint);
        
        // Check cache first
        const cacheKey = `get_${normalizedEndpoint}`;
        const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
        
        if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
            console.log(`🔧 [CACHE] Returning cached features`);
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
                console.warn(`⚠️ [API] getFeatures failed: ${result.status} - ${result.message}, using cached or default`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getFeatures failed, returning cached data`);
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
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getFeatures error:', error);
            
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
    }
    
    /**
     * updateSettings() - Update user settings (used by settings.html)
     * Uses centralized token system
     * 🔧 UPDATED: Includes /api prefix normalization
     * @param {object} settingsData - Settings data
     * @returns {Promise} Promise with updated settings data
     */
    async function updateSettings(settingsData) {
        try {
            // 🔧 FIX: Defensive null check
            if (!settingsData) {
                console.error('❌ [API] updateSettings called without settingsData');
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
            
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/settings';
            
            // 🔧 UPDATED: Use enhanced secure fetch
            const result = await enhancedSecureFetch(endpoint, {
                method: 'PUT',
                body: settingsData
            });
            
            // 🔧 FIX: Safe error handling
            if (!result.success) {
                console.error(`❌ [API] updateSettings failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Update cache with new settings
            if (result.success && result.data && _apiCache) {
                _apiCache.set(`get_${normalizeEndpoint('/settings')}`, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] updateSettings error:', error);
            
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
    }
    
    /**
     * getTools() - Get tools data (used by Tools.html)
     * Uses centralized token system and caching
     * 🔧 UPDATED: Includes /api prefix normalization
     * @returns {Promise} Promise with tools data
     */
    async function getTools() {
        try {
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/tools';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached tools`);
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
                console.error(`❌ [API] getTools failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getTools failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getTools error:', error);
            
            // Check cache as fallback
            const endpoint = '/tools';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    // ============================================================================
    // ADDITIONAL DATA METHODS - ALL USE CENTRALIZED TOKEN HANDLING
    // ============================================================================
    
    async function getUsers() {
        try {
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/users';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached users`);
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
                console.error(`❌ [API] getUsers failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getUsers failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getUsers error:', error);
            
            // Check cache as fallback
            const endpoint = '/users';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    async function getUserById(userId) {
        try {
            // 🔧 FIX: Defensive null check
            if (!userId) {
                console.error('❌ [API] getUserById called without userId');
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
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached user ${userId}`);
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
                console.error(`❌ [API] getUserById failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getUserById error:', error);
            
            // Check cache as fallback
            const endpoint = `/users/${encodeURIComponent(userId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    async function getChats() {
        try {
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/chats';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached chats`);
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
                console.error(`❌ [API] getChats failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getChats failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getChats error:', error);
            
            // Check cache as fallback
            const endpoint = '/chats';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    async function getChatById(chatId) {
        try {
            // 🔧 FIX: Defensive null check
            if (!chatId) {
                console.error('❌ [API] getChatById called without chatId');
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
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached chat ${chatId}`);
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
                console.error(`❌ [API] getChatById failed: ${result.status} - ${result.message}`);
                
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getChatById error:', error);
            
            // Check cache as fallback
            const endpoint = `/chats/${encodeURIComponent(chatId)}`;
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    async function getContacts() {
        try {
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/contacts';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached contacts`);
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
                console.error(`❌ [API] getContacts failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getContacts failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getContacts error:', error);
            
            // Check cache as fallback
            const endpoint = '/contacts';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    // ============================================================================
    // ENHANCED NOTIFICATION METHODS
    // ============================================================================
    
    async function getNotifications() {
        try {
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/notifications';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached notifications`);
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
                console.error(`❌ [API] getNotifications failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getNotifications failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getNotifications error:', error);
            
            // Check cache as fallback
            const endpoint = '/notifications';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    async function getUserPreferences() {
        try {
            // 🔧 FIX: Normalize endpoint
            const endpoint = '/user/preferences';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            
            // Check cache first
            const cacheKey = `get_${normalizedEndpoint}`;
            const cachedData = _apiCache ? _apiCache.get(cacheKey) : null;
            
            if (cachedData && window.AppNetwork && !window.AppNetwork.isOnline) {
                console.log(`🔧 [CACHE] Returning cached user preferences`);
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
                console.error(`❌ [API] getUserPreferences failed: ${result.status} - ${result.message}`);
                
                // 🔧 FIX: Defensive null checks
                if (!result.data) {
                    result.data = { message: result.message || 'Request failed' };
                }
                
                // Return cached data if available
                if (cachedData) {
                    console.log(`🔧 [CACHE] getUserPreferences failed, returning cached data`);
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
                return result;
            }
            
            // Cache successful response
            if (result.success && result.data && _apiCache) {
                _apiCache.set(cacheKey, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('🔧 [API] getUserPreferences error:', error);
            
            // Check cache as fallback
            const endpoint = '/user/preferences';
            const normalizedEndpoint = normalizeEndpoint(endpoint);
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
    }
    
    // ============================================================================
    // REQUEST FUNCTION FOR COMPATIBILITY
    // ============================================================================
    
    async function request(endpoint, options = {}) {
        // 🔧 FIX: Normalize endpoint with /api prefix
        const normalizedEndpoint = normalizeEndpoint(endpoint);
        console.log(`🔧 [REQUEST] Normalized: ${endpoint} → ${normalizedEndpoint}`);
        
        // Use secureApiFetch with LOGIN/REGISTRATION FIXES
        // 🔧 CRITICAL: Public endpoints bypass all token checks
        
        // Check if this is a public endpoint (using normalized endpoint)
        const isPublic = _isPublicEndpoint ? _isPublicEndpoint(normalizedEndpoint) : false;
        const isStatus = _isStatusEndpoint ? _isStatusEndpoint(normalizedEndpoint) : false;
        const isAuth = _isAuthEndpoint ? _isAuthEndpoint(normalizedEndpoint) : false;
        
        // If this is a public endpoint, execute immediately without queue
        if (isPublic || isStatus || isAuth) {
            console.log(`🔧 [REQUEST] PUBLIC/AUTH/STATUS endpoint - executing immediately: ${normalizedEndpoint}`);
            return enhancedSecureFetch(endpoint, options);
        }
        
        // Protected endpoint - check token and queue if needed
        const requiresAuth = options.auth !== false;
        const token = _getUserToken ? _getUserToken() : null;
        
        // If this is a protected endpoint and we don't have a token, 
        // and login is not complete, queue the request
        if (requiresAuth && !token && _apiRequestQueue && !_apiRequestQueue.isLoginComplete()) {
            console.log(`🔐 [QUEUE] Delaying protected endpoint until login complete: ${normalizedEndpoint}`);
            
            return _apiRequestQueue.addRequest(
                () => enhancedSecureFetch(endpoint, options),
                `Protected endpoint: ${normalizedEndpoint}`,
                normalizedEndpoint
            );
        }
        
        // Otherwise, use enhanced secure fetch immediately
        return enhancedSecureFetch(endpoint, options);
    }
    
    // ============================================================================
    // TESTING UTILITIES
    // ============================================================================
    
    /**
     * Test endpoint normalization (for development only)
     */
    function testNormalization() {
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
    }
    
    // ============================================================================
    // PUBLIC API INTERFACE
    // ============================================================================
    
    /**
     * Initialize the public API interface
     */
    function initPublicInterface() {
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
        
        console.log("✅ api.request.js initialized with fixed /api prefix normalization");
        
        // Test normalization in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            setTimeout(() => {
                testNormalization();
            }, 1000);
        }
        
        // Dispatch ready event
        setTimeout(() => {
            window.dispatchEvent(new Event("api-request-ready"));
        }, 100);
    }
    
    // Initialize the module
    initPublicInterface();
    
})();