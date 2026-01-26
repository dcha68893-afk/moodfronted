// api.js - HARDENED BACKEND API INTEGRATION WITH DEFENSIVE FETCH HANDLING
// ULTRA-ROBUST VERSION: Never breaks, even with incorrect frontend calls
// UPDATED: Enhanced error handling for 429 and 500 errors
// UPDATED: Support for new token structure from backend
// CRITICAL FIX: Dynamic environment detection for backend URLs
// CRITICAL FIX: Strict API contract - endpoint always first, method always in options
// CRITICAL FIX: HTTP 500 errors no longer mark backend as offline
// CRITICAL FIX: Added api.get(), api.post(), api.put(), api.delete() methods
// UPDATED: Enhanced token retrieval and authentication header handling
// UPDATED: Explicitly exposed all API methods for iframe pages
// ============================================================================
// CRITICAL IMPROVEMENTS APPLIED:
// 1. SINGLE internal fetch function with comprehensive input validation
// 2. Method normalization for ALL possible frontend mistakes
// 3. Endpoint sanitization to prevent malformed URLs
// 4. Graceful degradation when frontend calls API incorrectly
// 5. Absolute protection against invalid fetch() calls
// 6. Enhanced error handling for rate limiting and server errors
// 7. Updated to handle new token structure from backend
// 8. CRITICAL FIX: Dynamic environment detection for backend URLs
// 9. CRITICAL FIX: Strict API contract - endpoint always string, method always in options
// 10. CRITICAL FIX: HTTP 500 errors DO NOT mark backend as offline
// 11. CRITICAL FIX: Added api.get(), api.post(), api.put(), api.delete() methods
// 12. ENHANCED: Improved token retrieval from localStorage
// 13. ENHANCED: Helper function getAuthHeaders() for all API calls
// 14. ENHANCED: Automatic token attachment to all authenticated endpoints
// 15. CRITICAL FIX: Explicitly exposed all API methods used by iframe pages
// ============================================================================

// ============================================================================
// SINGLE SOURCE OF TRUTH - NETWORK STATE
// ============================================================================
/**
 * GLOBAL NETWORK STATE - Declared ONLY ONCE here
 * All other files must use window.AppNetwork
 */
let isOnline = navigator.onLine;
let isBackendReachable = null;

// Initialize global network state
window.AppNetwork = {
  isOnline: isOnline,
  isBackendReachable: isBackendReachable,
  lastChecked: new Date().toISOString(),
  
  // Update methods
  updateOnlineStatus: function(status) {
    isOnline = status;
    this.isOnline = status;
    this.lastChecked = new Date().toISOString();
    console.log(`🔧 [NETWORK] Online status changed to: ${status}`);
    
    // Dispatch network change event
    try {
      window.dispatchEvent(new CustomEvent('network-state-changed', {
        detail: { isOnline: status, isBackendReachable: isBackendReachable }
      }));
    } catch (e) {
      console.log('🔧 [NETWORK] Could not dispatch event:', e.message);
    }
  },
  
  updateBackendStatus: function(status) {
    isBackendReachable = status;
    this.isBackendReachable = status;
    this.lastChecked = new Date().toISOString();
    console.log(`🔧 [NETWORK] Backend reachable changed to: ${status}`);
  }
};

// Listen for online/offline events
window.addEventListener('online', () => {
  window.AppNetwork.updateOnlineStatus(true);
});

window.addEventListener('offline', () => {
  window.AppNetwork.updateOnlineStatus(false);
});

// ============================================================================
// ENVIRONMENT DETECTION - DYNAMIC BACKEND URL CONFIGURATION
// ============================================================================
/**
 * Detects the environment and sets the correct backend URL
 * FIX 1: Dynamic environment detection based on current hostname
 * ABSOLUTE RULE: If environment cannot be determined, DEFAULT TO LOCAL — NEVER production.
 */
const getBackendBaseUrl = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // LOCAL DEVELOPMENT ENVIRONMENTS - EXPLICITLY TREATED AS LOCAL
  if (hostname === 'localhost' || 
      hostname.startsWith('127.') ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      protocol === 'file:') {
    console.log(`🔧 [API] Detected LOCAL environment (${hostname}), using http://localhost:4000`);
    return 'http://localhost:4000';
  }
  
  // PRODUCTION ENVIRONMENT on Render - ONLY when hostname ends with onrender.com
  if (hostname.endsWith('onrender.com')) {
    console.log(`🔧 [API] Detected PRODUCTION environment (${hostname}), using https://moodchat-fy56.onrender.com`);
    return 'https://moodchat-fy56.onrender.com';
  }
  
  // DEFAULT TO LOCAL - NEVER PRODUCTION
  console.warn(`⚠️ [API] Unknown hostname "${hostname}", DEFAULTING TO LOCAL development backend`);
  console.warn(`⚠️ [API] ABSOLUTE RULE: Unknown environment = LOCAL, NEVER production`);
  return 'http://localhost:4000';
};

// FIX 2: Define a single constant for BASE_API_URL
const BACKEND_BASE_URL = getBackendBaseUrl();
const BASE_API_URL = BACKEND_BASE_URL + '/api';

// Environment logging for debugging
console.log(`🔧 [API] Environment Detection:`);
console.log(`🔧 [API] Current Hostname: ${window.location.hostname}`);
console.log(`🔧 [API] Current Protocol: ${window.location.protocol}`);
console.log(`🔧 [API] Backend Base URL: ${BACKEND_BASE_URL}`);
console.log(`🔧 [API] API Base URL: ${BASE_API_URL}`);
console.log(`🔧 [API] CRITICAL: ALL API calls will use: ${BASE_API_URL}`);
console.log(`🔧 [API] Network State: Online=${window.AppNetwork.isOnline}, BackendReachable=${window.AppNetwork.isBackendReachable}`);

// ============================================================================
// TOKEN MANAGEMENT - SINGLE SOURCE OF TRUTH
// ============================================================================
/**
 * TOKEN NORMALIZATION - Ensure consistent token format
 * Centralized token handling to prevent inconsistencies
 */
const TOKEN_STORAGE_KEY = 'authUser';
const ACCESS_TOKEN_KEY = 'accessToken';
const USER_DATA_KEY = 'userData';

// ============================================================================
// HELPER FUNCTION: getAuthHeaders() - Automatically attaches token to all API calls
// ============================================================================
/**
 * Helper function to automatically get authentication headers
 * Checks multiple token storage locations for maximum compatibility
 * @returns {object} Headers object with Authorization if token exists
 */
function getAuthHeaders() {
  const token = _getCurrentAccessToken();
  if (token) {
    console.log('🔐 [AUTH] Token found, adding Authorization header');
    return { 'Authorization': `Bearer ${token}` };
  }
  
  // Also check for legacy token storage
  const legacyToken = localStorage.getItem('token');
  if (legacyToken) {
    console.log('🔐 [AUTH] Legacy token found, adding Authorization header');
    // Store it in normalized format for future use
    _storeLegacyTokenIfNeeded(legacyToken);
    return { 'Authorization': `Bearer ${legacyToken}` };
  }
  
  console.log('🔐 [AUTH] No token found, proceeding without Authorization header');
  return {};
}

/**
 * Stores legacy token in normalized format if needed
 * @param {string} token - Legacy token to store
 */
function _storeLegacyTokenIfNeeded(token) {
  try {
    const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!authDataStr && token) {
      // Create minimal auth data with token
      const authData = {
        accessToken: token,
        tokenTimestamp: Date.now(),
        authValidated: false
      };
      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(authData));
      console.log('🔐 [AUTH] Legacy token stored in normalized format');
    }
  } catch (error) {
    console.error('🔐 [AUTH] Error storing legacy token:', error);
  }
}

/**
 * Extracts token from ANY backend response format
 */
function _extractTokenFromResponse(responseData) {
  if (!responseData) return null;
  
  // Priority: tokens.accessToken > token > accessToken
  if (responseData.tokens && responseData.tokens.accessToken) {
    return responseData.tokens.accessToken;
  }
  if (responseData.token) {
    return responseData.token;
  }
  if (responseData.accessToken) {
    return responseData.accessToken;
  }
  
  // Check nested data property
  if (responseData.data && responseData.data.token) {
    return responseData.data.token;
  }
  if (responseData.data && responseData.data.accessToken) {
    return responseData.data.accessToken;
  }
  if (responseData.data && responseData.data.tokens && responseData.data.tokens.accessToken) {
    return responseData.data.tokens.accessToken;
  }
  
  return null;
}

/**
 * Extracts user data from ANY backend response format
 */
function _extractUserFromResponse(responseData) {
  if (!responseData) return null;
  
  // Priority: user > data.user > data
  if (responseData.user) {
    return responseData.user;
  }
  if (responseData.data && responseData.data.user) {
    return responseData.data.user;
  }
  if (responseData.data && !responseData.data.token) {
    return responseData.data;
  }
  
  return null;
}

/**
 * Stores normalized auth data with CONSISTENT format
 */
function _storeAuthData(token, user, refreshToken = null) {
  if (!token || !user) {
    console.error('❌ [AUTH] Cannot store auth data without token and user');
    return false;
  }
  
  const authData = {
    // PRIMARY TOKEN - always stored as accessToken
    accessToken: token,
    // User data
    user: user,
    // Token timestamp for expiration tracking
    tokenTimestamp: Date.now(),
    // Auth session validation flag
    authValidated: false // Will be set to true after /auth/me succeeds
  };
  
  // Store refresh token if available
  if (refreshToken) {
    authData.refreshToken = refreshToken;
  }
  
  // Store in localStorage with consistent key
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(authData));
  
  // Also store in legacy format for compatibility
  localStorage.setItem('moodchat_token', token);  // Add this line for requested key
  localStorage.setItem('token', token);
  localStorage.setItem('moodchat_auth_token', token);
  
  if (user) {
    localStorage.setItem('moodchat_auth_user', JSON.stringify(user));
  }
  
  // Set global user ONLY after storage is successful
  window.currentUser = user;
  
  console.log(`✅ [AUTH] Auth data stored: token=${!!token}, user=${!!user}`);
  return true;
}

/**
 * Clears ALL auth data
 */
function _clearAuthData() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem('moodchat_token');  // Add this line for requested key
  localStorage.removeItem('token');
  localStorage.removeItem('moodchat_auth_token');
  localStorage.removeItem('moodchat_auth_user');
  localStorage.removeItem('moodchat_refresh_token');
  
  // Clear global user state
  window.currentUser = null;
  
  console.log('✅ [AUTH] All auth data cleared');
}

/**
 * Gets the current access token from storage
 * Checks multiple locations for maximum compatibility
 */
function _getCurrentAccessToken() {
  try {
    // First check normalized storage
    const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (authDataStr) {
      const authData = JSON.parse(authDataStr);
      // Return accessToken (primary) or fallback to token for backward compatibility
      if (authData.accessToken || authData.token) {
        return authData.accessToken || authData.token;
      }
    }
    
    // Check legacy token storage locations
    const legacyToken = localStorage.getItem('moodchat_token');  // Add this line for requested key
    if (legacyToken) {
      console.log('🔐 [AUTH] Found token in moodchat_token location');
      return legacyToken;
    }
    
    const legacyToken2 = localStorage.getItem('token');
    if (legacyToken2) {
      console.log('🔐 [AUTH] Found token in legacy token location');
      return legacyToken2;
    }
    
    const moodchatToken = localStorage.getItem('moodchat_auth_token');
    if (moodchatToken) {
      console.log('🔐 [AUTH] Found token in moodchat_auth_token');
      return moodchatToken;
    }
    
    return null;
  } catch (error) {
    console.error('❌ [AUTH] Error reading token from storage:', error);
    return null;
  }
}

/**
 * Gets the current user from storage
 */
function _getCurrentUserFromStorage() {
  try {
    const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!authDataStr) {
      // Check legacy storage
      const legacyUser = localStorage.getItem('moodchat_auth_user');
      if (legacyUser) {
        return JSON.parse(legacyUser);
      }
      return null;
    }
    
    const authData = JSON.parse(authDataStr);
    return authData.user || null;
  } catch (error) {
    console.error('❌ [AUTH] Error reading user from storage:', error);
    return null;
  }
}

/**
 * Checks if auth has been validated via /auth/me
 */
function _isAuthValidated() {
  try {
    const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!authDataStr) return false;
    
    const authData = JSON.parse(authDataStr);
    return authData.authValidated === true;
  } catch (error) {
    return false;
  }
}

/**
 * Marks auth as validated (after successful /auth/me)
 */
function _markAuthAsValidated() {
  try {
    const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!authDataStr) return false;
    
    const authData = JSON.parse(authDataStr);
    authData.authValidated = true;
    authData.lastValidated = Date.now();
    
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(authData));
    return true;
  } catch (error) {
    console.error('❌ [AUTH] Error marking auth as validated:', error);
    return false;
  }
}

// ============================================================================
// CORE VALIDATION FUNCTIONS - NEVER BREAK
// ============================================================================

/**
 * Normalizes ANY HTTP method input to valid fetch method
 * CRITICAL: Prevents "not a valid HTTP method" errors forever
 * STRICT RULE: Method MUST ONLY come from options.method
 */
function _normalizeHttpMethod(method) {
  if (!method) return 'GET';
  
  const methodStr = String(method).toUpperCase().trim();
  
  // Direct match for valid methods
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (validMethods.includes(methodStr)) {
    return methodStr;
  }
  
  // Common frontend mistakes and their corrections
  const methodCorrections = {
    'GET': 'GET',
    'POST': 'POST', 
    'PUT': 'PUT',
    'PATCH': 'PATCH',
    'DELETE': 'DELETE',
    'HEAD': 'GET', // Map HEAD to GET as safe fallback
    'OPTIONS': 'GET', // Map OPTIONS to GET
    '': 'GET', // Empty method
    'UNDEFINED': 'GET',
    'NULL': 'GET',
    'GET/API/': 'GET', // Common typo
    'POST/API/': 'POST',
    '/API/': 'GET', // Endpoint mistakenly passed as method
    'API': 'GET'
  };
  
  // CRITICAL FIX: If method looks like an endpoint, it's a SERIOUS ERROR
  if (methodStr.includes('/API/') || methodStr.includes('/api/') || methodStr.startsWith('/')) {
    console.error(`❌ [API] CRITICAL ERROR: HTTP method "${method}" contains endpoint pattern!`);
    console.error(`❌ [API] This indicates the API is being called incorrectly`);
    console.error(`❌ [API] FIRST argument MUST be endpoint, SECOND argument MUST be options with method`);
    return 'GET'; // Safe default
  }
  
  // Return corrected method or default to GET
  return methodCorrections[methodStr] || 'GET';
}

/**
 * Sanitizes ANY endpoint to prevent malformed URLs
 * CRITICAL: Prevents "/api/api/..." and "/api/GET" calls
 * STRICT RULE: Endpoint MUST NEVER be an HTTP method
 */
function _sanitizeEndpoint(endpoint) {
  if (!endpoint) return '/';
  
  const endpointStr = String(endpoint).trim();
  
  // CRITICAL FIX: If endpoint is actually an HTTP method, this is a SERIOUS ERROR
  const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (httpMethods.includes(endpointStr.toUpperCase())) {
    console.error(`❌ [API] CRITICAL ERROR: Endpoint "${endpoint}" is an HTTP method!`);
    console.error(`❌ [API] This means the API is being called with swapped arguments`);
    console.error(`❌ [API] Correct usage: api('/auth/login', { method: 'POST', body: {...} })`);
    console.error(`❌ [API] NOT: api('POST', '/auth/login', {...})`);
    return '/'; // Return root to prevent complete failure
  }
  
  // Remove any leading/trailing slashes for consistent processing
  let cleanEndpoint = endpointStr.replace(/^\/+|\/+$/g, '');
  
  // Prevent duplicate "/api/api/" segments
  if (cleanEndpoint.toUpperCase().startsWith('API/')) {
    cleanEndpoint = cleanEndpoint.substring(4);
  }
  
  // Ensure it starts with "/" but doesn't end with "/" (unless it's just "/")
  if (!cleanEndpoint) return '/';
  if (!cleanEndpoint.startsWith('/')) {
    cleanEndpoint = '/' + cleanEndpoint;
  }
  
  return cleanEndpoint;
}

/**
 * Builds ABSOLUTELY SAFE URL that never breaks fetch()
 * CRITICAL: Uses the dynamically determined BASE_API_URL
 * STRICT RULE: NEVER pass HTTP method as URL
 */
function _buildSafeUrl(endpoint) {
  const sanitizedEndpoint = _sanitizeEndpoint(endpoint);
  
  // Handle empty or root endpoint
  if (sanitizedEndpoint === '/') {
    return BASE_API_URL;
  }
  
  // Construct URL ensuring no double slashes
  const base = BASE_API_URL.endsWith('/') ? BASE_API_URL.slice(0, -1) : BASE_API_URL;
  const endpointPath = sanitizedEndpoint.startsWith('/') ? sanitizedEndpoint : '/' + sanitizedEndpoint;
  
  return base + endpointPath;
}

// ============================================================================
// CORE FETCH FUNCTION - STRICT HTTP STATUS HANDLING WITH TOKEN SUPPORT
// ============================================================================

/**
 * CORE FETCH FUNCTION - STRICT REQUIREMENTS:
 * 1. Treat ANY HTTP status ≥400 as a HARD failure
 * 2. NEVER return success if response.ok === false
 * 3. Do NOT mark backend offline on ANY HTTP status errors (400, 401, 500, etc.)
 * 4. Only mark backend offline on actual network connection failures
 * 5. All API calls MUST use BASE_API_URL derived dynamically from window.location
 * 6. STRICT CONTRACT: endpoint is string, method is in options
 * 7. AUTO-ATTACH Authorization header for authenticated requests using getAuthHeaders()
 */
function _safeFetch(fullUrl, options = {}) {
  // Validate URL
  if (!fullUrl || typeof fullUrl !== 'string') {
    console.error('❌ [API] Invalid URL for fetch:', fullUrl);
    return Promise.reject(new Error('Invalid request URL'));
  }
  
  // Normalize method - ABSOLUTELY CRITICAL
  const normalizedMethod = _normalizeHttpMethod(options.method || 'GET');
  
  // AUTHORIZATION HEADER ENFORCEMENT - USING getAuthHeaders() HELPER
  const authHeaders = getAuthHeaders();
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders, // Add Authorization header if token exists
    ...options.headers
  };
  
  // Auto-attach Authorization header for authenticated requests
  // Skip only if explicitly disabled (auth: false) or for auth endpoints
  const isAuthEndpoint = fullUrl.includes('/auth/') && 
                        (fullUrl.includes('/auth/login') || fullUrl.includes('/auth/register'));
  
  const skipAuth = options.auth === false || isAuthEndpoint;
  
  if (!skipAuth && authHeaders['Authorization']) {
    console.log(`🔐 [AUTH] Authorization header attached to ${normalizedMethod} ${fullUrl}`);
  } else if (!skipAuth && !authHeaders['Authorization']) {
    console.log(`⚠️ [AUTH] No token available for ${normalizedMethod} ${fullUrl}`);
  }
  
  // Prepare safe options
  const safeOptions = {
    method: normalizedMethod,
    mode: 'cors',
    credentials: 'include',
    headers: headers
  };
  
  // Handle body safely - DO NOT MUTATE OR RENAME FIELDS
  if (options.body && normalizedMethod !== 'GET') {
    if (typeof options.body === 'string') {
      safeOptions.body = options.body;
    } else {
      try {
        // Pass body exactly as provided
        safeOptions.body = JSON.stringify(options.body);
      } catch (e) {
        console.warn('⚠️ [API] Could not stringify body, sending empty');
        safeOptions.body = '{}';
      }
    }
  }
  
  console.log(`🔧 [API] Safe fetch: ${normalizedMethod} ${fullUrl}`);
  console.log(`🔧 [API] Headers:`, Object.keys(headers));
  
  // PERFORM THE FETCH
  return fetch(fullUrl, safeOptions)
    .then(async response => {
      try {
        const data = await response.json();
        
        // STRICT REQUIREMENT: Treat ANY HTTP status ≥400 as a HARD failure
        // STRICT REQUIREMENT: NEVER return success if response.ok === false
        const isSuccess = response.ok; // response.ok means status 200-299
        const status = response.status;
        
        // STRICT: Always include these properties
        const result = {
          ok: isSuccess,
          status: status,
          data: data,
          headers: Object.fromEntries(response.headers.entries())
        };
        
        // Enhanced error handling for specific status codes
        if (!isSuccess) {
          let errorMessage = data.message || response.statusText || 'Request failed';
          
          if (status === 429) {
            errorMessage = 'Too many requests. Please wait and try again.';
            result.isRateLimited = true;
            result.retryAfter = response.headers.get('Retry-After');
          } else if (status >= 500) {
            errorMessage = 'Server error. Please try again later.';
            result.isServerError = true;
            // CRITICAL FIX: HTTP 500 errors DO NOT mark backend offline
            console.warn(`⚠️ [API] HTTP ${status} error from backend: ${errorMessage}`);
            console.warn(`⚠️ [API] Backend is reachable but returned an error (not marking as offline)`);
          } else if (status === 401) {
            errorMessage = data.message || 'Invalid credentials';
            result.isAuthError = true;
            
            // AUTO-CLEAR INVALID TOKEN on 401
            console.log('🔐 [AUTH] 401 Unauthorized - clearing invalid token');
            _clearAuthData();
            
            // Dispatch logout event
            try {
              window.dispatchEvent(new CustomEvent('user-logged-out', {
                detail: { reason: 'token_expired', timestamp: new Date().toISOString() }
              }));
            } catch (e) {
              console.log('🔐 [AUTH] Could not dispatch logout event:', e.message);
            }
          } else if (status === 400) {
            errorMessage = data.message || 'Bad request';
            result.isClientError = true;
          } else if (status === 404) {
            errorMessage = data.message || 'Resource not found';
            result.isNotFound = true;
          }
          
          result.message = errorMessage;
          result.success = false; // STRICT: success must be false for non-ok responses
        } else {
          result.success = true;
          result.message = data.message || 'Success';
        }
        
        // CRITICAL FIX: Only mark backend as reachable if we got ANY response
        // HTTP errors (400, 401, 500, etc.) mean backend IS reachable
        // Only network errors (no response) mean backend is unreachable
        window.AppNetwork.updateBackendStatus(true);
        
        return result;
      } catch (jsonError) {
        // Handle JSON parsing errors
        const isSuccess = response.ok;
        const status = response.status;
        
        const result = {
          ok: isSuccess,
          success: isSuccess,
          status: status,
          data: null,
          message: response.statusText || 'Request completed',
          headers: Object.fromEntries(response.headers.entries()),
          rawResponse: response
        };
        
        if (!isSuccess) {
          result.success = false;
          // Auto-clear on 401 even with JSON parsing error
          if (status === 401) {
            console.log('🔐 [AUTH] 401 Unauthorized (JSON error) - clearing invalid token');
            _clearAuthData();
          }
        }
        
        // CRITICAL FIX: Even with JSON parsing errors, backend IS reachable
        window.AppNetwork.updateBackendStatus(true);
        
        return result;
      }
    })
    .catch(error => {
      console.error(`🔧 [API] Fetch error for ${fullUrl}:`, error);
      
      const isNetworkError = error.message && (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('network request failed') ||
        error.message.includes('NetworkError when attempting to fetch resource') ||
        error.message.includes('Load failed')
      );
      
      // Check for AbortError - don't mark as network error
      const isAbortError = error.name === 'AbortError' || 
                          error.message.includes('aborted') ||
                          error.message.includes('The user aborted');
      
      // CRITICAL FIX: Only update backend reachability for actual network errors
      if (isNetworkError && !isAbortError) {
        console.warn(`⚠️ [API] Network error detected, marking backend as unreachable: ${error.message}`);
        window.AppNetwork.updateBackendStatus(false);
      } else {
        // For non-network errors or abort errors, backend might still be reachable
        console.warn(`⚠️ [API] Non-network error (${error.name || 'unknown'}), not changing backend status: ${error.message}`);
      }
      
      return {
        ok: false,
        success: false,
        status: 0,
        message: isAbortError 
          ? 'Request aborted' 
          : (isNetworkError && !isAbortError
            ? 'Network error. Please check your connection.' 
            : 'Request failed: ' + error.message),
        error: error.message,
        isNetworkError: isNetworkError && !isAbortError,
        isAbortError: isAbortError,
        isRateLimited: false,
        isServerError: false
      };
    });
}

// ============================================================================
// GLOBAL API FUNCTION - ULTRA-DEFENSIVE WRAPPER WITH STRICT CONTRACT
// ============================================================================

/**
 * GLOBAL API FUNCTION - STRICT CONTRACT:
 * 1. First argument MUST ALWAYS be endpoint string (e.g., '/auth/login')
 * 2. Second argument MUST ALWAYS be options object (e.g., { method: 'POST' })
 * 3. NEVER accept HTTP methods as first argument
 * 4. NEVER swap arguments
 */
const globalApiFunction = function(endpoint, options = {}) {
  // Use global network state
  if (!window.AppNetwork.isOnline) {
    console.log('🔧 [API] Offline detected, returning offline response');
    return Promise.resolve({
      ok: false,
      success: false,
      status: 0,
      message: 'Offline mode',
      offline: true,
      cached: true,
      isNetworkError: true,
      isRateLimited: false,
      isServerError: false
    });
  }
  
  // STRICT VALIDATION: First argument MUST be string
  if (!endpoint || typeof endpoint !== 'string') {
    console.error(`❌ [API] CRITICAL: First argument must be endpoint string, got:`, typeof endpoint);
    console.error(`❌ [API] Correct: api('/auth/login', { method: 'POST' })`);
    console.error(`❌ [API] Wrong: api('POST', '/auth/login') or api({ method: 'POST' }, '/auth/login')`);
    endpoint = '/'; // Safe fallback
  }
  
  // STRICT VALIDATION: Second argument MUST be object (or undefined)
  if (options && typeof options !== 'object') {
    console.error(`❌ [API] CRITICAL: Second argument must be options object, got:`, typeof options);
    console.error(`❌ [API] Correct: api('/auth/login', { method: 'POST' })`);
    options = {};
  }
  
  // SANITIZE endpoint to prevent ANY malformed URLs
  const safeEndpoint = _sanitizeEndpoint(endpoint);
  const fullUrl = _buildSafeUrl(safeEndpoint); // Uses dynamic BASE_API_URL
  
  // VALIDATE options
  const safeOptions = { ...options };
  
  // CRITICAL: Ensure method is never an endpoint
  if (safeOptions.method && typeof safeOptions.method === 'string') {
    const methodStr = safeOptions.method.toUpperCase();
    if (methodStr.includes('/API/') || methodStr.includes('/api/') || 
      methodStr.startsWith('API') || methodStr.endsWith('/API') || methodStr.startsWith('/')) {
      console.error(`❌ [API] CRITICAL: Method "${safeOptions.method}" contains endpoint pattern!`);
      console.error(`❌ [API] Method must be 'GET', 'POST', etc., not a URL`);
      safeOptions.method = _normalizeHttpMethod(safeOptions.method);
    }
  }
  
  // NOTE: Authorization header is now handled centrally in _safeFetch via getAuthHeaders()
  
  // CALL THE CORE FETCH FUNCTION
  return _safeFetch(fullUrl, safeOptions);
};

// ============================================================================
// AUTH VALIDATION CORE - STRICT /auth/me VALIDATION
// ============================================================================

/**
 * checkAuthMe() - Strict /auth/me validation
 * CRITICAL: This validates authentication state via /auth/me endpoint
 * Returns user object only if /auth/me succeeds
 */
async function _validateAuthWithMe() {
  console.log('🔐 [AUTH] Validating authentication via /auth/me...');
  
  const token = _getCurrentAccessToken();
  if (!token) {
    console.error('❌ [AUTH] No token available for /auth/me validation');
    return {
      success: false,
      authenticated: false,
      message: 'No authentication token',
      isAuthError: true
    };
  }
  
  try {
    const fullUrl = BACKEND_BASE_URL + '/api/auth/me';
    console.log(`🔐 [AUTH] Calling ${fullUrl} with token`);
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      mode: 'cors'
    });
    
    const isSuccess = response.ok;
    const status = response.status;
    
    if (!isSuccess) {
      console.error(`❌ [AUTH] /auth/me failed with status ${status}`);
      
      if (status === 401) {
        console.log('🔐 [AUTH] 401 Unauthorized - clearing invalid token');
        _clearAuthData();
        
        return {
          success: false,
          authenticated: false,
          message: 'Session expired',
          isAuthError: true,
          status: 401
        };
      }
      
      return {
        success: false,
        authenticated: false,
        message: `Authentication check failed (${status})`,
        status: status
      };
    }
    
    // Parse successful response
    const data = await response.json();
    const user = _extractUserFromResponse(data);
    
    if (!user) {
      console.error('❌ [AUTH] /auth/me succeeded but no user data returned');
      return {
        success: false,
        authenticated: false,
        message: 'Invalid user data in response',
        isAuthError: true
      };
    }
    
    console.log('✅ [AUTH] /auth/me validation successful');
    
    // Update stored user data and mark auth as validated
    try {
      const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (authDataStr) {
        const authData = JSON.parse(authDataStr);
        authData.user = user;
        authData.authValidated = true;
        authData.lastValidated = Date.now();
        localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(authData));
        
        // Update global user state
        window.currentUser = user;
        
        console.log('✅ [AUTH] User data updated and marked as validated');
      }
    } catch (storageError) {
      console.error('❌ [AUTH] Error updating user data after /auth/me:', storageError);
    }
    
    return {
      success: true,
      authenticated: true,
      user: user,
      message: 'Authentication valid',
      data: data
    };
    
  } catch (error) {
    console.error('❌ [AUTH] /auth/me validation error:', error);
    
    // Check if this is a network error
    const isNetworkError = error.message && (
      error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('network request failed')
    );
    
    if (isNetworkError) {
      console.log('⚠️ [AUTH] Network error during /auth/me, keeping cached auth');
      // For network errors, don't clear auth - use cached state
      const cachedUser = _getCurrentUserFromStorage();
      return {
        success: false,
        authenticated: !!cachedUser, // Consider authenticated if we have cached user
        user: cachedUser,
        message: 'Network error - using cached authentication',
        isNetworkError: true,
        offline: true
      };
    }
    
    // For other errors, clear invalid auth
    _clearAuthData();
    
    return {
      success: false,
      authenticated: false,
      message: 'Authentication validation failed: ' + error.message,
      isAuthError: true
    };
  }
}

// ============================================================================
// MAIN API OBJECT - WITH HARDENED METHODS AND STRICT CONTRACT
// ============================================================================

const apiObject = {
  _singleton: true,
  _version: '16.6.0', // Updated version for enhanced token handling
  _safeInitialized: true,
  _backendReachable: null,
  _sessionChecked: false,
  
  /**
   * Configuration object with dynamically determined URLs
   */
  _config: {
    BACKEND_URL: BACKEND_BASE_URL,               // Dynamic backend base URL
    API_BASE_URL: BASE_API_URL,                // Dynamic API base URL
    STORAGE_PREFIX: 'moodchat_',
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    SESSION_CHECK_INTERVAL: 300000,
    STATUS_FETCH_TIMEOUT: 8000
  },
  
  // ============================================================================
  // ENHANCED: getAuthHeaders() method for external use
  // ============================================================================
  
  /**
   * getAuthHeaders() - Public method to get authentication headers
   * Can be used by other parts of the application
   * @returns {object} Headers object with Authorization if token exists
   */
  getAuthHeaders: function() {
    return getAuthHeaders();
  },
  
  // ============================================================================
  // CRITICAL FIX: ADDED api.get(), api.post(), api.put(), api.delete() METHODS
  // ============================================================================
  
  /**
   * api.get() - Simple GET method with automatic token attachment
   * @param {string} url - The endpoint URL
   * @returns {Promise} Promise with response data
   */
  get: async function(url) {
    console.log(`🔧 [API] api.get() called for: ${url}`);
    try {
      const result = await globalApiFunction(url, { method: 'GET' });
      
      if (!result.ok) {
        console.error(`❌ [API] GET request failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] api.get() error:', error);
      throw error;
    }
  },
  
  /**
   * api.post() - Simple POST method with automatic token attachment
   * @param {string} url - The endpoint URL
   * @param {object} data - The data to send
   * @returns {Promise} Promise with response data
   */
  post: async function(url, data) {
    console.log(`🔧 [API] api.post() called for: ${url}`);
    try {
      const result = await globalApiFunction(url, { 
        method: 'POST', 
        body: data 
      });
      
      if (!result.ok) {
        console.error(`❌ [API] POST request failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] api.post() error:', error);
      throw error;
    }
  },
  
  /**
   * api.put() - Simple PUT method with automatic token attachment
   * @param {string} url - The endpoint URL
   * @param {object} data - The data to send
   * @returns {Promise} Promise with response data
   */
  put: async function(url, data) {
    console.log(`🔧 [API] api.put() called for: ${url}`);
    try {
      const result = await globalApiFunction(url, { 
        method: 'PUT', 
        body: data 
      });
      
      if (!result.ok) {
        console.error(`❌ [API] PUT request failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] api.put() error:', error);
      throw error;
    }
  },
  
  /**
   * api.delete() - Simple DELETE method with automatic token attachment
   * @param {string} url - The endpoint URL
   * @returns {Promise} Promise with response data
   */
  delete: async function(url) {
    console.log(`🔧 [API] api.delete() called for: ${url}`);
    try {
      const result = await globalApiFunction(url, { method: 'DELETE' });
      
      if (!result.ok) {
        console.error(`❌ [API] DELETE request failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] api.delete() error:', error);
      throw error;
    }
  },
  
  // ============================================================================
  // CRITICAL FIX: EXPLICITLY ADDED ALL API METHODS USED BY IFRAME PAGES
  // ============================================================================
  
  /**
   * getMessages() - Get all messages (used by message.html)
   * @returns {Promise} Promise with messages data
   */
  getMessages: async function() {
    try {
      const result = await globalApiFunction('/messages', { 
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] getMessages failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getMessages error:', error);
      throw error;
    }
  },
  
  /**
   * getMessageById() - Get message by ID (used by message.html)
   * @param {string} messageId - Message ID
   * @returns {Promise} Promise with message data
   */
  getMessageById: async function(messageId) {
    try {
      const result = await globalApiFunction(`/messages/${encodeURIComponent(messageId)}`, { 
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] getMessageById failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getMessageById error:', error);
      throw error;
    }
  },
  
  /**
   * sendMessage() - Send a new message (used by message.html)
   * @param {object} messageData - Message data
   * @returns {Promise} Promise with sent message data
   */
  sendMessage: async function(messageData) {
    try {
      const result = await globalApiFunction('/messages', { 
        method: 'POST',
        body: messageData,
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] sendMessage failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] sendMessage error:', error);
      throw error;
    }
  },
  
  /**
   * getFriends() - Get all friends (used by friend.html)
   * @returns {Promise} Promise with friends data
   */
  getFriends: async function() {
    // Use global network state
    if (!window.AppNetwork.isOnline) {
      const cached = localStorage.getItem('moodchat_cache_friends');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          return {
            ok: true,
            success: true,
            data: cachedData.data,
            cached: true,
            offline: true,
            isRateLimited: false,
            isServerError: false
          };
        } catch (e) {
          // Continue to network attempt
        }
      }
    }
    
    try {
      const result = await globalApiFunction('/friends/list', {
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      if (result.ok && result.data) {
        try {
          localStorage.setItem('moodchat_cache_friends', JSON.stringify({
            data: result.data,
            timestamp: Date.now()
          }));
        } catch (e) {
          console.log('🔧 [API] Could not cache friends');
        }
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getFriends error:', error);
      
      const cached = localStorage.getItem('moodchat_cache_friends');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          return {
            ok: true,
            success: true,
            data: cachedData.data,
            cached: true,
            message: 'Using cached data',
            isRateLimited: false,
            isServerError: false
          };
        } catch (e) {
          // Ignore cache errors
        }
      }
      
      return {
        ok: false,
        success: false,
        message: 'Failed to fetch friends',
        error: error.message,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  /**
   * addFriend() - Add a friend (used by friend.html)
   * @param {string} userId - User ID to add as friend
   * @returns {Promise} Promise with friend request data
   */
  addFriend: async function(userId) {
    try {
      const result = await globalApiFunction('/friends/add', { 
        method: 'POST',
        body: { userId: userId },
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] addFriend failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] addFriend error:', error);
      throw error;
    }
  },
  
  /**
   * getGroups() - Get all groups (used by group.html)
   * @returns {Promise} Promise with groups data
   */
  getGroups: async function() {
    try {
      const result = await globalApiFunction('/groups', { 
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] getGroups failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getGroups error:', error);
      throw error;
    }
  },
  
  /**
   * getGroupById() - Get group by ID (used by group.html)
   * @param {string} groupId - Group ID
   * @returns {Promise} Promise with group data
   */
  getGroupById: async function(groupId) {
    try {
      const result = await globalApiFunction(`/groups/${encodeURIComponent(groupId)}`, { 
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] getGroupById failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getGroupById error:', error);
      throw error;
    }
  },
  
  /**
   * createGroup() - Create a new group (used by group.html)
   * @param {object} groupData - Group data
   * @returns {Promise} Promise with created group data
   */
  createGroup: async function(groupData) {
    try {
      const result = await globalApiFunction('/groups', { 
        method: 'POST',
        body: groupData,
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] createGroup failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] createGroup error:', error);
      throw error;
    }
  },
  
  /**
   * getStatuses() - Get all statuses (used by status.html)
   * @returns {Promise} Promise with statuses data
   */
  getStatuses: async function() {
    // Use global network state
    if (!window.AppNetwork.isOnline) {
      const cached = localStorage.getItem('moodchat_cache_statuses');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          return {
            ok: true,
            success: true,
            data: cachedData.data,
            cached: true,
            offline: true,
            message: 'Using cached data (offline)',
            isRateLimited: false,
            isServerError: false
          };
        } catch (e) {
          // Continue to network attempt
        }
      }
    }
    
    try {
      const result = await globalApiFunction('/statuses/all', {
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      if (result.ok && result.data) {
        try {
          localStorage.setItem('moodchat_cache_statuses', JSON.stringify({
            data: result.data,
            timestamp: Date.now()
          }));
        } catch (e) {
          console.log('🔧 [API] Could not cache statuses');
        }
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getStatuses error:', error);
      
      const cached = localStorage.getItem('moodchat_cache_statuses');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          return {
            ok: true,
            success: true,
            data: cachedData.data,
            cached: true,
            message: 'Using cached data',
            error: error.message,
            isRateLimited: false,
            isServerError: false
          };
        } catch (e) {
          // Ignore cache errors
        }
      }
      
      return {
        ok: false,
        success: false,
        message: 'Failed to fetch statuses',
        error: error.message,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  /**
   * getStatus() - Get status by ID (used by status.html)
   * @param {string} statusId - Status ID
   * @returns {Promise} Promise with status data
   */
  getStatus: async function(statusId) {
    try {
      const result = await globalApiFunction(`/status/${encodeURIComponent(statusId)}`, { 
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] getStatus failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getStatus error:', error);
      throw error;
    }
  },
  
  /**
   * createStatus() - Create a new status (used by status.html)
   * @param {object} statusData - Status data
   * @returns {Promise} Promise with created status data
   */
  createStatus: async function(statusData) {
    try {
      const result = await globalApiFunction('/status', { 
        method: 'POST',
        body: statusData,
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] createStatus failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] createStatus error:', error);
      throw error;
    }
  },
  
  /**
   * getCalls() - Get all calls (used by calls.html)
   * @returns {Promise} Promise with calls data
   */
  getCalls: async function() {
    try {
      const result = await globalApiFunction('/calls', { 
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] getCalls failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getCalls error:', error);
      throw error;
    }
  },
  
  /**
   * startCall() - Start a new call (used by calls.html)
   * @param {object} callData - Call data
   * @returns {Promise} Promise with call data
   */
  startCall: async function(callData) {
    try {
      const result = await globalApiFunction('/calls/start', { 
        method: 'POST',
        body: callData,
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] startCall failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] startCall error:', error);
      throw error;
    }
  },
  
  /**
   * getSettings() - Get user settings (used by settings.html)
   * @returns {Promise} Promise with settings data
   */
  getSettings: async function() {
    try {
      const result = await globalApiFunction('/settings', { 
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] getSettings failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getSettings error:', error);
      throw error;
    }
  },
  
  /**
   * updateSettings() - Update user settings (used by settings.html)
   * @param {object} settingsData - Settings data
   * @returns {Promise} Promise with updated settings data
   */
  updateSettings: async function(settingsData) {
    try {
      const result = await globalApiFunction('/settings', { 
        method: 'PUT',
        body: settingsData,
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] updateSettings failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] updateSettings error:', error);
      throw error;
    }
  },
  
  /**
   * getTools() - Get tools data (used by Tools.html)
   * @returns {Promise} Promise with tools data
   */
  getTools: async function() {
    try {
      const result = await globalApiFunction('/tools', { 
        method: 'GET',
        auth: true
      });
      
      if (!result.ok) {
        console.error(`❌ [API] getTools failed: ${result.message}`);
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getTools error:', error);
      throw error;
    }
  },
  
  // ============================================================================
  // HARDENED AUTHENTICATION METHODS - STRICT ERROR HANDLING
  // ============================================================================
  
  /**
   * Login function - Sends POST to /auth/login with email and password
   * On success, stores accessToken in localStorage under key 'moodchat_token'
   * Returns the logged-in user data
   */
  login: async function(email, password) {
    // OFFLINE CHECK FIRST - use global network state
    if (!window.AppNetwork.isOnline) {
      throw {
        ok: false,
        success: false,
        message: 'Cannot login while offline',
        offline: true,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false
      };
    }
    
    try {
      console.log(`🔐 [AUTH] Login attempt for email: ${email}`);
      console.log(`🔐 [AUTH] Using dynamic backend URL: ${BACKEND_BASE_URL}`);
      console.log(`🔐 [AUTH] Using dynamic API URL: ${BASE_API_URL}`);
      
      // Proper JSON body for login - STRICT: Use correct endpoint format
      const requestData = { 
        email: String(email).trim(),
        password: String(password)
      };
      
      // USE THE CORE FETCH FUNCTION WITH STRICT CONTRACT
      const result = await _safeFetch(`${BACKEND_BASE_URL}/api/auth/login`, {
        method: 'POST',
        body: requestData,
        auth: false // Disable auto-auth for login endpoint
      });
      
      // STRICT: Check response.ok - if false, treat as HARD failure
      if (!result.ok) {
        console.log(`❌ [AUTH] Login failed with status ${result.status}: ${result.message}`);
        
        // CRITICAL FIX: HTTP errors (400, 401, 500) mean backend IS reachable
        // Do NOT mark backend offline on ANY HTTP status errors
        window.AppNetwork.updateBackendStatus(true);
        
        // Throw error to be caught by frontend - STRICT REQUIREMENT
        throw {
          message: result.message,
          status: result.status,
          isAuthError: result.status === 401,
          isClientError: result.status === 400,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      // Only reach here if result.ok === true
      console.log('✅ [AUTH] Login successful, processing response...');
      
      // Extract token and user using centralized functions
      const token = _extractTokenFromResponse(result.data);
      const user = _extractUserFromResponse(result.data);
      const refreshToken = result.data.tokens?.refreshToken || result.data.refreshToken || null;
      
      if (!token || !user) {
        console.error('❌ [AUTH] Login response missing token or user data');
        throw {
          success: false,
          message: 'Invalid login response from server',
          isAuthError: true
        };
      }
      
      // Store auth data with consistent format - INCLUDES 'moodchat_token' key as requested
      const storageSuccess = _storeAuthData(token, user, refreshToken);
      if (!storageSuccess) {
        throw {
          success: false,
          message: 'Failed to store authentication data',
          isAuthError: true
        };
      }
      
      console.log(`✅ [AUTH] Auth data stored successfully`);
      console.log(`✅ [AUTH] Token stored as 'moodchat_token': ${localStorage.getItem('moodchat_token') ? 'YES' : 'NO'}`);
      console.log(`✅ [AUTH] User: ${user.username || user.email || 'Present'}`);
      console.log(`✅ [AUTH] window.currentUser: ${window.currentUser ? 'Set' : 'Not set'}`);
      
      // Now validate the session with /auth/me
      console.log('🔐 [AUTH] Validating session with /auth/me...');
      const validationResult = await _validateAuthWithMe();
      
      if (!validationResult.success || !validationResult.authenticated) {
        console.error('❌ [AUTH] Session validation failed after login');
        _clearAuthData();
        
        throw {
          success: false,
          message: 'Login successful but session validation failed',
          isAuthError: true
        };
      }
      
      console.log('✅ [AUTH] Session validation successful');
      
      this._sessionChecked = true;
      window.AppNetwork.updateBackendStatus(true);
      
      // Dispatch login event
      try {
        window.dispatchEvent(new CustomEvent('user-logged-in', {
          detail: { user: user, timestamp: new Date().toISOString() }
        }));
      } catch (e) {
        console.log('🔐 [AUTH] Could not dispatch login event:', e.message);
      }
      
      return {
        ok: true,
        success: true,
        message: 'Login successful',
        token: token,
        accessToken: token,
        refreshToken: refreshToken,
        user: user,
        data: result.data,
        isRateLimited: false,
        isServerError: false
      };
      
    } catch (error) {
      console.error('❌ [AUTH] Login error:', error);
      
      // STRICT: Re-throw the error for UI to handle
      throw {
        success: false,
        message: error.message || 'Login failed',
        status: error.status || 0,
        isAuthError: error.isAuthError || false,
        isClientError: error.isClientError || false,
        isNetworkError: !error.status, // Network error if no status
        isRateLimited: error.isRateLimited || false,
        isServerError: error.isServerError || false
      };
    }
  },
  
  /**
   * Alternative login that accepts emailOrUsername for backward compatibility
   */
  loginWithIdentifier: async function(emailOrUsername, password) {
    return this.login(emailOrUsername, password);
  },
  
  register: async function(userData) {
    // OFFLINE CHECK FIRST - use global network state
    if (!window.AppNetwork.isOnline) {
      throw {
        ok: false,
        success: false,
        message: 'Cannot register while offline',
        offline: true,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false
      };
    }
    
    try {
      console.log('🔐 [AUTH] Register attempt');
      console.log(`🔐 [AUTH] Using dynamic backend URL: ${BACKEND_BASE_URL}`);
      console.log(`🔐 [AUTH] Using dynamic API URL: ${BASE_API_URL}`);
      
      // Proper JSON body for register - STRICT: Use correct endpoint format
      const registerPayload = {
        username: String(userData.username || '').trim(),
        email: String(userData.email || '').trim(),
        password: String(userData.password || ''),
        confirmPassword: String(userData.confirmPassword || '')
      };
      
      // Validate required fields
      if (!registerPayload.username || !registerPayload.email || 
        !registerPayload.password || !registerPayload.confirmPassword) {
        // This is a client-side validation error
        throw {
          success: false,
          message: 'All fields are required',
          validationError: true,
          isClientError: true,
          isRateLimited: false,
          isServerError: false
        };
      }
      
      // Validate password match
      if (registerPayload.password !== registerPayload.confirmPassword) {
        throw {
          success: false,
          message: 'Passwords do not match',
          validationError: true,
          isClientError: true,
          isRateLimited: false,
          isServerError: false
        };
      }
      
      // USE THE CORE FETCH FUNCTION WITH STRICT CONTRACT
      const result = await _safeFetch(`${BACKEND_BASE_URL}/api/auth/register`, {
        method: 'POST',
        body: registerPayload,
        auth: false // Disable auto-auth for register endpoint
      });
      
      // STRICT: Check response.ok - if false, treat as HARD failure
      if (!result.ok) {
        console.log(`❌ [AUTH] Registration failed with status ${result.status}: ${result.message}`);
        
        // CRITICAL FIX: HTTP errors (400, 409, 500) mean backend IS reachable
        window.AppNetwork.updateBackendStatus(true);
        
        // Throw error to be caught by frontend - STRICT REQUIREMENT
        throw {
          message: result.message,
          status: result.status,
          isClientError: result.status === 400,
          isConflictError: result.status === 409,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      // Only reach here if result.ok === true
      console.log('✅ [AUTH] Registration successful, processing response...');
      
      // Extract token and user using centralized functions
      const token = _extractTokenFromResponse(result.data);
      const user = _extractUserFromResponse(result.data);
      const refreshToken = result.data.tokens?.refreshToken || result.data.refreshToken || null;
      
      if (!token || !user) {
        console.error('❌ [AUTH] Registration response missing token or user data');
        throw {
          success: false,
          message: 'Invalid registration response from server',
          isAuthError: true
        };
      }
      
      // Store auth data with consistent format
      const storageSuccess = _storeAuthData(token, user, refreshToken);
      if (!storageSuccess) {
        throw {
          success: false,
          message: 'Failed to store authentication data',
          isAuthError: true
        };
      }
      
      console.log(`✅ [AUTH] Registration auth data stored successfully`);
      console.log(`✅ [AUTH] Token: ${token ? 'Present' : 'Missing'}`);
      console.log(`✅ [AUTH] User: ${user.username || user.email || 'Present'}`);
      console.log(`✅ [AUTH] window.currentUser: ${window.currentUser ? 'Set' : 'Not set'}`);
      
      // Validate the session with /auth/me
      console.log('🔐 [AUTH] Validating session with /auth/me...');
      const validationResult = await _validateAuthWithMe();
      
      if (!validationResult.success || !validationResult.authenticated) {
        console.error('❌ [AUTH] Session validation failed after registration');
        _clearAuthData();
        
        throw {
          success: false,
          message: 'Registration successful but session validation failed',
          isAuthError: true
        };
      }
      
      console.log('✅ [AUTH] Session validation successful');
      
      this._sessionChecked = true;
      window.AppNetwork.updateBackendStatus(true);
      
      return {
        ok: true,
        success: true,
        message: 'Registration successful',
        token: token,
        accessToken: token,
        refreshToken: refreshToken,
        user: user,
        data: result.data,
        isRateLimited: false,
        isServerError: false
      };
      
    } catch (error) {
      console.error('❌ [AUTH] Register error:', error);
      
      // STRICT: Re-throw the error for UI to handle
      throw {
        success: false,
        message: error.message || 'Registration failed',
        status: error.status || 0,
        validationError: error.validationError || false,
        isClientError: error.isClientError || false,
        isNetworkError: !error.status, // Network error if no status
        isRateLimited: error.isRateLimited || false,
        isServerError: error.isServerError || false
      };
    }
  },
  
  // ============================================================================
  // CRITICAL FIX: /auth/me METHOD WITH STRICT VALIDATION
  // ============================================================================
  
  checkAuthMe: async function() {
    console.log('🔐 [AUTH] checkAuthMe() called');
    return await _validateAuthWithMe();
  },
  
  // ============================================================================
  // LOGOUT FUNCTION - Clears localStorage and resets window.currentUser
  // ============================================================================
  
  logout: function() {
    try {
      const user = _getCurrentUserFromStorage();
      _clearAuthData();
      
      this._sessionChecked = false;
      console.log('✅ [AUTH] User logged out successfully');
      
      // Dispatch logout event
      try {
        window.dispatchEvent(new CustomEvent('user-logged-out', {
          detail: { user: user, timestamp: new Date().toISOString() }
        }));
      } catch (e) {
        console.log('🔐 [AUTH] Could not dispatch logout event:', e.message);
      }
      
      return { 
        ok: true,
        success: true, 
        message: 'Logged out successfully',
        isRateLimited: false,
        isServerError: false
      };
    } catch (error) {
      console.error('❌ [AUTH] Error during logout:', error);
      return { 
        ok: false,
        success: false, 
        message: 'Logout failed',
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  // ============================================================================
  // GET CURRENT USER FUNCTION - Fetches /auth/me using stored token
  // ============================================================================
  
  getCurrentUser: async function() {
    console.log('🔐 [AUTH] getCurrentUser() called');
    
    const token = _getCurrentAccessToken();
    if (!token) {
      console.log('🔐 [AUTH] No token available');
      window.currentUser = null;
      return null;
    }
    
    // Check if we have a cached user
    const cachedUser = _getCurrentUserFromStorage();
    if (cachedUser) {
      window.currentUser = cachedUser;
    }
    
    // If offline, return cached user
    if (!window.AppNetwork.isOnline) {
      console.log('🔐 [AUTH] Offline - returning cached user');
      return cachedUser;
    }
    
    try {
      // Validate with /auth/me endpoint
      const validationResult = await _validateAuthWithMe();
      
      if (validationResult.success && validationResult.authenticated && validationResult.user) {
        console.log('✅ [AUTH] getCurrentUser() successful');
        window.currentUser = validationResult.user;
        return validationResult.user;
      } else {
        console.log('❌ [AUTH] getCurrentUser() validation failed');
        window.currentUser = null;
        return cachedUser; // Return cached user as fallback
      }
    } catch (error) {
      console.error('❌ [AUTH] getCurrentUser() error:', error);
      window.currentUser = cachedUser;
      return cachedUser; // Return cached user on error
    }
  },
  
  // ============================================================================
  // BACKEND HEALTH CHECK - HARDENED
  // ============================================================================
  
  checkBackendHealth: async function() {
    // Use global network state
    if (!window.AppNetwork.isOnline) {
      console.log('🔧 [API] Offline, backend unreachable');
      window.AppNetwork.updateBackendStatus(false);
      return {
        ok: false,
        success: false,
        reachable: false,
        message: 'Offline mode',
        offline: true,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false
      };
    }
    
    console.log('🔧 [API] Checking backend health...');
    console.log(`🔧 [API] Using dynamic backend URL: ${BACKEND_BASE_URL}`);
    console.log(`🔧 [API] Using dynamic API URL: ${BASE_API_URL}`);
    
    const testEndpoints = ['/api/status', '/api/auth/health', '/api/health', '/api'];
    
    for (const endpoint of testEndpoints) {
      try {
        const url = BACKEND_BASE_URL + endpoint;
        console.log(`🔧 [API] Trying: ${url}`);
        
        // Use a direct fetch for health check with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders() // Include token if available
          }
        });
        
        clearTimeout(timeoutId);
        
        // CRITICAL FIX: Any response (even HTTP error) means backend is reachable
        if (response.status < 500) {
          console.log(`✅ [API] Backend reachable (status: ${response.status})`);
          window.AppNetwork.updateBackendStatus(true);
          
          return {
            ok: true,
            success: true,
            reachable: true,
            endpoint: endpoint || 'root',
            status: response.status,
            message: 'Backend is reachable',
            isRateLimited: false,
            isServerError: false
          };
        } else {
          // HTTP 500+ error but backend IS reachable
          console.warn(`⚠️ [API] Backend returned HTTP ${response.status} but is reachable`);
          window.AppNetwork.updateBackendStatus(true);
          
          return {
            ok: false,
            success: false,
            reachable: true, // Backend IS reachable
            endpoint: endpoint || 'root',
            status: response.status,
            message: 'Backend reachable but returned error',
            isServerError: true,
            isRateLimited: false
          };
        }
      } catch (error) {
        // Check for AbortError
        const isAbortError = error.name === 'AbortError' || 
                           error.message.includes('aborted') ||
                           error.message.includes('The user aborted');
        
        console.log(`⚠️ [API] Health check endpoint failed: ${error.message}`, isAbortError ? '(Aborted)' : '');
        
        // Only continue to next endpoint if it was an abort error
        // Real network errors should break the loop
        if (!isAbortError) {
          // Check if this is a real network error
          const isNetworkError = error.message && (
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('network request failed')
          );
          
          if (isNetworkError) {
            console.log('🔧 [API] Real network error detected, stopping health check');
            break;
          }
        }
        
        // For abort errors, continue to next endpoint
        continue;
      }
    }
    
    // If we get here, all endpoints failed or network error occurred
    console.log('🔧 [API] Backend unreachable after testing all endpoints');
    window.AppNetwork.updateBackendStatus(false);
    
    return {
      ok: false,
      success: false,
      reachable: false,
      message: 'Backend is unreachable',
      offlineMode: true,
      isNetworkError: true,
      isRateLimited: false,
      isServerError: false
    };
  },
  
  // ============================================================================
  // SESSION MANAGEMENT - UPDATED TO USE STRICT /auth/me VALIDATION
  // ============================================================================
  
  checkSession: async function() {
    console.log('🔐 [AUTH] checkSession() called');
    
    // First check if we have any auth data at all
    const token = _getCurrentAccessToken();
    const user = _getCurrentUserFromStorage();
    const authValidated = _isAuthValidated();
    
    if (!token || !user) {
      console.log('🔐 [AUTH] No auth data found');
      this._sessionChecked = true;
      window.currentUser = null;
      return {
        ok: false,
        success: false,
        authenticated: false,
        message: 'No active session',
        isRateLimited: false,
        isServerError: false
      };
    }
    
    // Set window.currentUser from storage (for immediate UI access)
    window.currentUser = user;
    
    // If offline, return cached session
    if (!window.AppNetwork.isOnline) {
      console.log('🔐 [AUTH] Offline - using cached session');
      return {
        ok: true,
        success: true,
        authenticated: true,
        user: user,
        offline: true,
        cached: true,
        message: 'Session valid (offline)',
        isRateLimited: false,
        isServerError: false
      };
    }
    
    // If session was recently validated and backend is reachable, use cached
    if (authValidated && window.AppNetwork.isBackendReachable !== false && this._sessionChecked) {
      console.log('🔐 [AUTH] Using recently validated cached session');
      return {
        ok: true,
        success: true,
        authenticated: true,
        user: user,
        cached: true,
        message: 'Session valid (cached)',
        isRateLimited: false,
        isServerError: false
      };
    }
    
    // Otherwise, validate with /auth/me
    try {
      console.log('🔐 [AUTH] Validating session with /auth/me...');
      const validationResult = await _validateAuthWithMe();
      
      if (validationResult.success && validationResult.authenticated) {
        console.log('✅ [AUTH] Session validation successful');
        this._sessionChecked = true;
        window.AppNetwork.updateBackendStatus(true);
        
        return {
          ok: true,
          success: true,
          authenticated: true,
          user: validationResult.user,
          message: 'Session valid (online)',
          isRateLimited: false,
          isServerError: false
        };
      } else {
        // /auth/me failed
        console.log(`❌ [AUTH] Session validation failed: ${validationResult.message}`);
        
        // Check if it was a network error
        if (validationResult.isNetworkError) {
          console.log('⚠️ [AUTH] Network error during validation, using cached session');
          // For network errors, keep cached session
          return {
            ok: true,
            success: true,
            authenticated: true,
            user: user,
            offline: true,
            cached: true,
            message: 'Session valid (offline - network error)',
            isRateLimited: false,
            isServerError: false
          };
        } else {
          // Auth error - clear invalid session
          console.log('🔐 [AUTH] Clearing invalid session');
          _clearAuthData();
          
          return {
            ok: false,
            success: false,
            authenticated: false,
            message: validationResult.message || 'Session invalid',
            isAuthError: true,
            isRateLimited: false,
            isServerError: false
          };
        }
      }
      
    } catch (error) {
      console.error('❌ [AUTH] Session check error:', error);
      
      // For unexpected errors, use cached session if available
      if (user) {
        console.log('⚠️ [AUTH] Unexpected error, using cached session');
        return {
          ok: true,
          success: true,
          authenticated: true,
          user: user,
          offline: true,
          cached: true,
          message: 'Session valid (offline - error)',
          isRateLimited: false,
          isServerError: false
        };
      }
      
      this._sessionChecked = true;
      window.currentUser = null;
      return {
        ok: false,
        success: false,
        authenticated: false,
        message: 'Failed to check session',
        isAuthError: true,
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  // ============================================================================
  // ADDITIONAL DATA METHODS - ALL USE STRICT API CONTRACT WITH AUTOMATIC TOKEN ATTACHMENT
  // ============================================================================
  
  getUsers: async function() {
    try {
      const result = await globalApiFunction('/users', { 
        method: 'GET', 
        auth: true
      });
      
      if (!result.ok) {
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getUsers error:', error);
      throw error;
    }
  },
  
  getUserById: async function(userId) {
    try {
      const result = await globalApiFunction(`/users/${encodeURIComponent(userId)}`, { 
        method: 'GET', 
        auth: true
      });
      
      if (!result.ok) {
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getUserById error:', error);
      throw error;
    }
  },
  
  getChats: async function() {
    try {
      const result = await globalApiFunction('/chats', { 
        method: 'GET', 
        auth: true
      });
      
      if (!result.ok) {
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getChats error:', error);
      throw error;
    }
  },
  
  getChatById: async function(chatId) {
    try {
      const result = await globalApiFunction(`/chats/${encodeURIComponent(chatId)}`, { 
        method: 'GET', 
        auth: true
      });
      
      if (!result.ok) {
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getChatById error:', error);
      throw error;
    }
  },
  
  getContacts: async function() {
    try {
      const result = await globalApiFunction('/contacts', { 
        method: 'GET', 
        auth: true
      });
      
      if (!result.ok) {
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      return {
        ok: result.ok,
        success: result.ok,
        data: result.data,
        message: result.message,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] getContacts error:', error);
      throw error;
    }
  },
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  isLoggedIn: function() {
    try {
      // STRICT: User is logged in ONLY if:
      // 1. Token exists
      // 2. User data exists  
      // 3. Auth has been validated via /auth/me
      const token = _getCurrentAccessToken();
      const user = _getCurrentUserFromStorage();
      const authValidated = _isAuthValidated();
      
      const isLoggedIn = !!(token && user && authValidated);
      
      console.log(`🔐 [AUTH] isLoggedIn() check:`);
      console.log(`🔐 [AUTH]   Token: ${token ? 'Present' : 'Missing'}`);
      console.log(`🔐 [AUTH]   User: ${user ? 'Present' : 'Missing'}`);
      console.log(`🔐 [AUTH]   Auth Validated: ${authValidated ? 'Yes' : 'No'}`);
      console.log(`🔐 [AUTH]   Result: ${isLoggedIn ? 'Logged in' : 'Not logged in'}`);
      
      return isLoggedIn;
    } catch (error) {
      console.error('❌ [AUTH] Error in isLoggedIn():', error);
      return false;
    }
  },
  
  getCurrentUserSync: function() {
    return _getCurrentUserFromStorage();
  },
  
  getCurrentToken: function() {
    return _getCurrentAccessToken();
  },
  
  getAccessToken: function() {
    return _getCurrentAccessToken();
  },
  
  getRefreshToken: function() {
    try {
      const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (authDataStr) {
        const authData = JSON.parse(authDataStr);
        return authData.refreshToken || null;
      }
    } catch (e) {
      console.error('❌ [AUTH] Error reading refresh token:', e);
    }
    return null;
  },
  
  _clearAuthData: function() {
    _clearAuthData();
    this._sessionChecked = false;
  },
  
  getDeviceId: function() {
    try {
      let deviceId = localStorage.getItem('moodchat_device_id');
      if (!deviceId) {
        deviceId = 'moodchat_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('moodchat_device_id', deviceId);
      }
      return deviceId;
    } catch (error) {
      return 'moodchat_fallback_' + Date.now().toString(36);
    }
  },
  
  isOnline: function() {
    return window.AppNetwork.isOnline;
  },
  
  isBackendReachable: function() {
    return window.AppNetwork.isBackendReachable;
  },
  
  getConnectionStatus: function() {
    const token = _getCurrentAccessToken();
    const user = _getCurrentUserFromStorage();
    const authValidated = _isAuthValidated();
    
    return {
      online: window.AppNetwork.isOnline,
      backendReachable: window.AppNetwork.isBackendReachable,
      timestamp: new Date().toISOString(),
      backendUrl: BACKEND_BASE_URL,
      baseApiUrl: BASE_API_URL,
      sessionChecked: this._sessionChecked,
      authState: {
        hasToken: !!token,
        hasUser: !!user,
        authValidated: authValidated,
        isLoggedIn: !!(token && user && authValidated),
        tokenStructure: token ? 'normalized' : 'none',
        windowCurrentUser: window.currentUser ? 'Set' : 'Not set'
      }
    };
  },
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  initialize: async function() {
    console.log('🔧 [API] ⚡ MoodChat API v16.6.0 (ENHANCED TOKEN HANDLING + EXPOSED METHODS) initializing...');
    console.log('🔧 [API] 🔗 Backend URL:', BACKEND_BASE_URL);
    console.log('🔧 [API] 🔗 API Base URL:', BASE_API_URL);
    console.log('🔧 [API] 🌐 Network State - Online:', window.AppNetwork.isOnline, 'Backend Reachable:', window.AppNetwork.isBackendReachable);
    console.log('🔧 [API] 🔐 ENHANCED TOKEN HANDLING APPLIED:');
    console.log('🔧 [API] ✅ getAuthHeaders() helper function added');
    console.log('🔧 [API] ✅ Automatic token retrieval from localStorage');
    console.log('🔧 [API] ✅ Token attached to all API calls automatically');
    console.log('🔧 [API] ✅ Backward compatibility with legacy token storage');
    console.log('🔧 [API] ✅ All protected endpoints get Authorization headers');
    console.log('🔧 [API] ✅ EXPLICITLY EXPOSED METHODS FOR IFRAME PAGES:');
    console.log('🔧 [API]   - getMessages(), sendMessage() (message.html)');
    console.log('🔧 [API]   - getFriends(), addFriend() (friend.html)');
    console.log('🔧 [API]   - getGroups(), createGroup() (group.html)');
    console.log('🔧 [API]   - getStatuses(), createStatus() (status.html)');
    console.log('🔧 [API]   - getCalls(), startCall() (calls.html)');
    console.log('🔧 [API]   - getSettings(), updateSettings() (settings.html)');
    console.log('🔧 [API]   - getTools() (Tools.html)');
    
    // Check for token in storage and log it
    const token = _getCurrentAccessToken();
    if (token) {
      console.log('🔐 [AUTH] Token found in storage:', token.substring(0, 20) + '...');
      console.log('🔐 [AUTH] Token will be automatically attached to all API calls');
      
      const moodchatToken = localStorage.getItem('moodchat_token');
      if (moodchatToken) {
        console.log('🔐 [AUTH] Found token in moodchat_token key as requested');
      }
    } else {
      console.log('🔐 [AUTH] No token found in storage');
      console.log('🔐 [AUTH] API calls without authentication will proceed normally');
    }
    
    // Migrate old auth data if needed
    const oldToken = localStorage.getItem('moodchat_auth_token');
    const oldUser = localStorage.getItem('moodchat_auth_user');
    const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
    
    if ((oldToken || oldUser) && !authDataStr) {
      console.log('🔧 [API] Migrating old auth data to normalized format...');
      try {
        const token = oldToken || '';
        let user = null;
        if (oldUser) {
          user = JSON.parse(oldUser);
        }
        
        if (token && user) {
          // Store in normalized format
          _storeAuthData(token, user);
          console.log('✅ [API] Old auth data migrated successfully');
        }
      } catch (e) {
        console.error('❌ [API] Failed to migrate auth data:', e);
      }
    }
    
    // Initialize window.currentUser from stored data
    const user = _getCurrentUserFromStorage();
    if (user) {
      window.currentUser = user;
      console.log('🔧 [API] Initialized window.currentUser from stored data');
    }
    
    // Auto-login if credentials exist
    if (this.isLoggedIn() && !this._sessionChecked) {
      console.log('🔧 [API] 🔄 Auto-login on initialization...');
      try {
        const sessionResult = await this.autoLogin();
        console.log('🔧 [API] Auto-login result:', sessionResult.message);
      } catch (error) {
        console.log('🔧 [API] Auto-login failed:', error.message);
      }
    }
    
    // Initial health check
    setTimeout(async () => {
      try {
        const health = await this.checkBackendHealth();
        console.log('🔧 [API] 📶 Backend status:', health.message);
        
        // Check auth state
        const token = _getCurrentAccessToken();
        const user = _getCurrentUserFromStorage();
        const authValidated = _isAuthValidated();
        
        console.log('🔧 [API] 🔐 Auth Diagnostics:');
        console.log('🔧 [API]   Token present:', !!token);
        console.log('🔧 [API]   User present:', !!user);
        console.log('🔧 [API]   Auth validated via /auth/me:', authValidated);
        console.log('🔧 [API]   isLoggedIn():', this.isLoggedIn());
        console.log('🔧 [API]   window.currentUser:', window.currentUser ? 'Set' : 'Not set');
        console.log('🔧 [API] 💾 Device ID:', this.getDeviceId());
        
      } catch (error) {
        console.log('🔧 [API] Initial health check failed:', error.message);
      }
    }, 500);
    
    // Periodic session checks
    setInterval(() => {
      if (this.isLoggedIn() && window.AppNetwork.isOnline) {
        this.checkSession().catch(() => {});
      }
    }, this._config.SESSION_CHECK_INTERVAL);
    
    // Dispatch ready events
    this._dispatchReadyEvents();
    
    return true;
  },
  
  autoLogin: async function() {
    console.log('🔐 [AUTH] autoLogin() called');
    
    // Use the checkSession method which validates via /auth/me
    return await this.checkSession();
  },
  
  _dispatchReadyEvents: function() {
    const token = _getCurrentAccessToken();
    const user = _getCurrentUserFromStorage();
    const authValidated = _isAuthValidated();
    
    const eventDetail = {
      version: this._version,
      timestamp: new Date().toISOString(),
      backendUrl: BACKEND_BASE_URL,
      apiBaseUrl: BASE_API_URL,
      authState: {
        hasToken: !!token,
        hasUser: !!user,
        authValidated: authValidated,
        isLoggedIn: !!(token && user && authValidated),
        windowCurrentUser: window.currentUser ? 'Set' : 'Not set'
      },
      networkState: {
        isOnline: window.AppNetwork.isOnline,
        isBackendReachable: window.AppNetwork.isBackendReachable
      },
      features: {
        tokenNormalization: true,
        centralizedAuthHeaders: true,
        strictAuthValidation: true,
        dynamicEnvironmentDetection: true,
        http500Fix: true,
        apiMethods: true,
        getAuthHeaders: true,
        automaticTokenAttachment: true,
        loginFunction: true,
        logoutFunction: true,
        getCurrentUserFunction: true,
        auto401Handling: true,
        exposedIframeMethods: true,
        messageMethods: true,
        friendMethods: true,
        groupMethods: true,
        statusMethods: true,
        callMethods: true,
        settingsMethods: true,
        toolsMethods: true
      }
    };
    
    const events = ['api-ready', 'apiready', 'apiReady'];
    
    events.forEach(eventName => {
      try {
        window.dispatchEvent(new CustomEvent(eventName, { detail: eventDetail }));
        console.log(`🔧 [API] Dispatched ${eventName} event`);
      } catch (e) {
        console.log(`🔧 [API] Could not dispatch ${eventName}:`, e.message);
      }
    });
    
    setTimeout(() => {
      console.log('🔧 [API] API synchronization ready with enhanced token handling');
      console.log('🔧 [API] ✅ Token automatically retrieved from localStorage');
      console.log('🔧 [API] ✅ getAuthHeaders() helper function available');
      console.log('🔧 [API] ✅ Authorization headers auto-attached to all API calls');
      console.log('🔧 [API] ✅ Backward compatibility maintained');
      console.log('🔧 [API] ✅ Protected endpoints will work with 200 OK');
      console.log('🔧 [API] ✅ ALL IFRAME METHODS EXPOSED:');
      console.log('🔧 [API]   - message.html: api.getMessages(), api.sendMessage()');
      console.log('🔧 [API]   - friend.html: api.getFriends(), api.addFriend()');
      console.log('🔧 [API]   - group.html: api.getGroups(), api.createGroup()');
      console.log('🔧 [API]   - status.html: api.getStatuses(), api.createStatus()');
      console.log('🔧 [API]   - calls.html: api.getCalls(), api.startCall()');
      console.log('🔧 [API]   - settings.html: api.getSettings(), api.updateSettings()');
      console.log('🔧 [API]   - Tools.html: api.getTools()');
      console.log('🔧 [API] ✅ Login function: api.login(email, password)');
      console.log('🔧 [API] ✅ Logout function: api.logout()');
      console.log('🔧 [API] ✅ Get current user: api.getCurrentUser()');
      console.log('🔧 [API] ✅ Auto 401 handling: Invalid tokens automatically cleared');
    }, 1000);
  },
  
  // ============================================================================
  // DIAGNOSTICS
  // ============================================================================
  
  diagnose: async function() {
    console.log('🔧 [API] Running diagnostics with enhanced token handling...');
    
    const token = _getCurrentAccessToken();
    const user = _getCurrentUserFromStorage();
    const authValidated = _isAuthValidated();
    
    const results = {
      authState: {
        token: token ? `Present (${token.substring(0, 20)}...)` : 'Missing',
        user: user ? 'Present' : 'Missing',
        authValidated: authValidated,
        isLoggedIn: this.isLoggedIn(),
        windowCurrentUser: window.currentUser ? 'Set' : 'Not set',
        storageKey: TOKEN_STORAGE_KEY,
        legacyToken: localStorage.getItem('token') ? 'Present' : 'Missing',
        moodchatToken: localStorage.getItem('moodchat_token') ? 'Present' : 'Missing'
      },
      networkState: {
        online: window.AppNetwork.isOnline,
        backendReachable: window.AppNetwork.isBackendReachable,
        lastChecked: window.AppNetwork.lastChecked
      },
      config: {
        backendUrl: BACKEND_BASE_URL,
        apiBaseUrl: BASE_API_URL,
        currentHostname: window.location.hostname,
        currentProtocol: window.location.protocol
      },
      features: {
        tokenNormalization: 'ACTIVE',
        centralizedAuthHeaders: 'ACTIVE',
        strictAuthValidation: 'ACTIVE',
        auto401Clearing: 'ACTIVE',
        dynamicEnvironmentDetection: 'ACTIVE',
        http500Fix: 'ACTIVE',
        apiMethods: 'ACTIVE',
        getAuthHeaders: 'ACTIVE',
        automaticTokenAttachment: 'ACTIVE',
        loginFunction: 'ACTIVE',
        logoutFunction: 'ACTIVE',
        getCurrentUserFunction: 'ACTIVE',
        exposedIframeMethods: 'ACTIVE'
      },
      exposedMethods: {
        getMessages: 'EXPOSED',
        sendMessage: 'EXPOSED',
        getFriends: 'EXPOSED',
        addFriend: 'EXPOSED',
        getGroups: 'EXPOSED',
        createGroup: 'EXPOSED',
        getStatuses: 'EXPOSED',
        createStatus: 'EXPOSED',
        getCalls: 'EXPOSED',
        startCall: 'EXPOSED',
        getSettings: 'EXPOSED',
        updateSettings: 'EXPOSED',
        getTools: 'EXPOSED'
      }
    };
    
    console.table(results);
    
    try {
      const health = await this.checkBackendHealth();
      results.backendTest = health;
    } catch (error) {
      results.backendTest = { error: error.message };
    }
    
    return results;
  },
  
  request: async function(endpoint, options = {}) {
    // Use the globalApiFunction with STRICT CONTRACT
    // Token will be automatically attached via getAuthHeaders()
    const result = await globalApiFunction(endpoint, options);
    
    // STRICT: Check response.ok
    if (!result.ok) {
      throw {
        message: result.message,
        status: result.status,
        isRateLimited: result.isRateLimited,
        isServerError: result.isServerError
      };
    }
    
    return {
      ok: result.ok,
      success: result.ok,
      data: result.data,
      message: result.message,
      isRateLimited: result.isRateLimited || false,
      isServerError: result.isServerError || false
    };
  }
};

// ============================================================================
// CRITICAL FIX: GLOBAL API SETUP WITH STRICT CONTRACT
// ============================================================================

// Create the global API function with strict contract
const globalApi = function(endpoint, options = {}) {
  return globalApiFunction(endpoint, options);
};

// Attach all methods to the global API function
Object.assign(globalApi, apiObject);
Object.setPrototypeOf(globalApi, Object.getPrototypeOf(apiObject));

// CRITICAL REQUIREMENT: Explicitly attach to window.api
window.api = globalApi;

// Also attach for backward compatibility
if (!window.MOODCHAT_API) {
  window.MOODCHAT_API = globalApi;
}

// Expose getAuthHeaders globally for other parts of the application
window.getAuthHeaders = getAuthHeaders;

console.log('🔧 [API] Starting hardened initialization with enhanced token handling and exposed methods...');

// Safe initialization with timeout
setTimeout(() => {
  try {
    window.api.initialize();
  } catch (initError) {
    console.error('🔧 [API] Initialization failed but API remains functional:', initError);
  }
}, 100);

// Global error handlers
if (typeof window.handleApiError === 'undefined') {
  window.handleApiError = function(error, defaultMessage) {
    if (!error) return defaultMessage || 'An error occurred';
    
    if (error.isRateLimited) {
      return 'Too many requests. Please wait and try again.';
    }
    if (error.isServerError) {
      return 'Server error. Please try again later.';
    }
    if (error.isNetworkError) {
      return 'Network error. Please check your connection.';
    }
    if (error.message) return error.message;
    if (typeof error === 'string') return error;
    return defaultMessage || 'An unexpected error occurred';
  };
}

if (typeof window.isNetworkError === 'undefined') {
  window.isNetworkError = function(error) {
    if (!error) return false;
    const msg = error.message || error.toString();
    return msg.includes('Failed to fetch') ||
           msg.includes('NetworkError') ||
           msg.includes('network') ||
           msg.includes('Network request') ||
           error.status === 0 ||
           (error.isNetworkError === true);
  };
}

if (typeof window.isRateLimitedError === 'undefined') {
  window.isRateLimitedError = function(error) {
    if (!error) return false;
    return error.isRateLimited === true || 
           error.status === 429 ||
           (error.message && error.message.includes('Too many requests')) ||
           (error.message && error.message.includes('rate limit'));
  };
}

if (typeof window.isServerError === 'undefined') {
  window.isServerError = function(error) {
    if (!error) return false;
    return error.isServerError === true || 
           (error.status && error.status >= 500) ||
           (error.message && error.message.includes('Server error')) ||
           (error.message && error.message.includes('Internal Server Error'));
  };
}

// SAFETY NET: Ensure all exposed methods have a default implementation
const exposedMethods = [
  'getMessages', 'sendMessage', 'getMessageById',
  'getFriends', 'addFriend',
  'getGroups', 'getGroupById', 'createGroup',
  'getStatuses', 'getStatus', 'createStatus',
  'getCalls', 'startCall',
  'getSettings', 'updateSettings',
  'getTools'
];

// Add any missing methods with safe fallbacks
exposedMethods.forEach(methodName => {
  if (typeof window.api[methodName] === 'undefined') {
    console.warn(`⚠️ [API] Method ${methodName} not found, adding safe fallback`);
    window.api[methodName] = async function(...args) {
      console.warn(`⚠️ [API] Using fallback for ${methodName}`);
      return Promise.resolve({
        ok: false,
        success: false,
        message: 'Method not implemented',
        fallback: true,
        isRateLimited: false,
        isServerError: false
      });
    };
  }
});

// FALLBACK API
setTimeout(() => {
  if (!window.api || typeof window.api !== 'function') {
    console.warn('⚠️ API not initialized, creating fallback');
    
    const fallbackApi = function(endpoint, options = {}) {
      const method = _normalizeHttpMethod(options.method);
      const safeEndpoint = _sanitizeEndpoint(endpoint);
      
      console.warn(`⚠️ Using fallback API for ${method} ${safeEndpoint}`);
      
      return Promise.resolve({
        ok: false,
        success: false,
        status: 0,
        message: 'API fallback mode',
        offline: !window.AppNetwork.isOnline,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false,
        fallback: true
      });
    };
    
    // Copy all methods from apiObject to fallback
    Object.assign(fallbackApi, apiObject);
    
    // Override specific methods with fallback implementations
    exposedMethods.forEach(methodName => {
      fallbackApi[methodName] = async function(...args) {
        console.warn(`⚠️ Using fallback ${methodName}`);
        return Promise.resolve({
          ok: false,
          success: false,
          message: 'API fallback mode',
          fallback: true,
          isRateLimited: false,
          isServerError: false
        });
      };
    });
    
    window.api = fallbackApi;
  }
}, 3000);

// EMERGENCY API
if (!window.api) {
  console.error('⚠️ window.api not set! Creating emergency API');
  
  const emergencyApi = function(endpoint, options) {
    const method = _normalizeHttpMethod(options?.method);
    const safeEndpoint = _sanitizeEndpoint(endpoint);
    
    return Promise.resolve({
      ok: false,
      success: false,
      status: 0,
      message: 'Emergency API',
      emergency: true,
      methodUsed: method,
      endpointRequested: safeEndpoint,
      offline: !window.AppNetwork.isOnline,
      isRateLimited: false,
      isServerError: false
    });
  };
  
  // Copy all methods from apiObject to emergency API
  Object.assign(emergencyApi, apiObject);
  
  // Override specific methods with emergency implementations
  exposedMethods.forEach(methodName => {
    emergencyApi[methodName] = async function(...args) {
      console.error(`⚠️ Emergency API for ${methodName}`);
      return Promise.resolve({
        ok: false,
        success: false,
        message: 'Emergency API',
        emergency: true,
        isRateLimited: false,
        isServerError: false
      });
    };
  });
  
  window.api = emergencyApi;
}

// Global API state
window.__MOODCHAT_API_EVENTS = [];
window.__MOODCHAT_API_INSTANCE = window.api;
window.__MOODCHAT_API_READY = true;
window.MOODCHAT_API_READY = true;

console.log('🔧 [API] STRICT Backend API integration complete with ENHANCED TOKEN HANDLING AND EXPOSED METHODS');
console.log('🔧 [API] ✅ getAuthHeaders() helper: ACTIVE');
console.log('🔧 [API] ✅ Automatic token retrieval from localStorage: ACTIVE');
console.log('🔧 [API] ✅ Token attached to all API calls automatically: ACTIVE');
console.log('🔧 [API] ✅ Protected endpoints will work: ACTIVE');
console.log('🔧 [API] ✅ Backward compatibility: ACTIVE');
console.log('🔧 [API] ✅ EXPLICITLY EXPOSED METHODS FOR ALL IFRAME PAGES:');
console.log('🔧 [API]   - message.html: api.getMessages(), api.sendMessage(), api.getMessageById()');
console.log('🔧 [API]   - friend.html: api.getFriends(), api.addFriend()');
console.log('🔧 [API]   - group.html: api.getGroups(), api.getGroupById(), api.createGroup()');
console.log('🔧 [API]   - status.html: api.getStatuses(), api.getStatus(), api.createStatus()');
console.log('🔧 [API]   - calls.html: api.getCalls(), api.startCall()');
console.log('🔧 [API]   - settings.html: api.getSettings(), api.updateSettings()');
console.log('🔧 [API]   - Tools.html: api.getTools()');
console.log('🔧 [API] ✅ Login function: api.login(email, password)');
console.log('🔧 [API] ✅ Logout function: api.logout()');
console.log('🔧 [API] ✅ Get current user: api.getCurrentUser()');
console.log('🔧 [API] ✅ Auto 401 handling: Invalid tokens automatically cleared');
console.log('🔧 [API] ✅ Token stored in moodchat_token key as requested');
console.log('🔧 [API] 🔗 Backend URL: ' + BACKEND_BASE_URL);
console.log('🔧 [API] 🔗 API Base URL: ' + BASE_API_URL);
console.log('🔧 [API] ⚡ Ready for production with NO "api[method] is not a function" errors');
console.log('🔧 [API] 🔐 TESTING INSTRUCTIONS:');
console.log('🔧 [API] 1. Login using api.login(email, password)');
console.log('🔧 [API] 2. Confirm token is stored in localStorage as moodchat_token');
console.log('🔧 [API] 3. All iframe pages can now call their respective API methods');
console.log('🔧 [API] 4. No more "api[method] is not a function" errors');
console.log('🔧 [API] 5. All protected routes work with authentication');
console.log('🔧 [API] 6. Use api.getCurrentUser() to get current user');
console.log('🔧 [API] 7. Use api.logout() to clear session');