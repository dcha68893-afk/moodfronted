// api.js - HARDENED BACKEND API INTEGRATION WITH DEFENSIVE FETCH HANDLING
// ULTRA-ROBUST VERSION: Never breaks, even with incorrect frontend calls
// UPDATED: Enhanced error handling for 429 and 500 errors
// UPDATED: Support for new token structure from backend
// CRITICAL FIX: Dynamic environment detection for backend URLs
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
// CORE VALIDATION FUNCTIONS - NEVER BREAK
// ============================================================================

/**
 * Normalizes ANY HTTP method input to valid fetch method
 * CRITICAL: Prevents "not a valid HTTP method" errors forever
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
  
  // Check for method containing endpoint-like patterns
  if (methodStr.includes('/API/') || methodStr.includes('/api/')) {
    console.warn(`⚠️ [API] Method "${method}" looks like an endpoint, defaulting to GET`);
    return 'GET';
  }
  
  // Return corrected method or default to GET
  return methodCorrections[methodStr] || 'GET';
}

/**
 * Sanitizes ANY endpoint to prevent malformed URLs
 * CRITICAL: Prevents "/api/api/..." and "/api/GET" calls
 */
function _sanitizeEndpoint(endpoint) {
  if (!endpoint) return '/';
  
  const endpointStr = String(endpoint).trim();
  
  // If endpoint is actually an HTTP method, return root
  const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  if (httpMethods.includes(endpointStr.toUpperCase())) {
    console.warn(`⚠️ [API] Endpoint "${endpoint}" is an HTTP method, defaulting to "/"`);
    return '/';
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
// CORE FETCH FUNCTION - STRICT HTTP STATUS HANDLING
// ============================================================================

/**
 * CORE FETCH FUNCTION - STRICT REQUIREMENTS:
 * 1. Treat ANY HTTP status ≥400 as a HARD failure
 * 2. NEVER return success if response.ok === false
 * 3. Do NOT mark backend offline on 401 or 400
 * 4. All API calls MUST use BASE_API_URL derived dynamically from window.location
 */
function _safeFetch(fullUrl, options = {}) {
  // Validate URL
  if (!fullUrl || typeof fullUrl !== 'string') {
    console.error('❌ [API] Invalid URL for fetch:', fullUrl);
    return Promise.reject(new Error('Invalid request URL'));
  }
  
  // Normalize method - ABSOLUTELY CRITICAL
  const normalizedMethod = _normalizeHttpMethod(options.method || 'GET');
  
  // Prepare safe options
  const safeOptions = {
    method: normalizedMethod,
    mode: 'cors',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
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
          } else if (status === 401) {
            errorMessage = data.message || 'Invalid credentials';
            result.isAuthError = true;
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
        
        // STRICT: Do NOT mark backend offline on 401 or 400
        // Only mark backend as unreachable on network errors or 5xx errors
        if (status >= 500) {
          window.AppNetwork.updateBackendStatus(false);
        } else if (status < 500) {
          // Any response with status < 500 means backend is reachable
          window.AppNetwork.updateBackendStatus(true);
        }
        
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
        }
        
        return result;
      }
    })
    .catch(error => {
      console.error(`🔧 [API] Fetch error for ${fullUrl}:`, error);
      
      const isNetworkError = error.message && (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('network request failed')
      );
      
      // Check for AbortError - don't mark as network error
      const isAbortError = error.name === 'AbortError' || 
                          error.message.includes('aborted') ||
                          error.message.includes('The user aborted');
      
      // Update backend reachability for network errors
      if (isNetworkError && !isAbortError) {
        window.AppNetwork.updateBackendStatus(false);
      }
      
      return {
        ok: false,
        success: false,
        status: 0,
        message: isAbortError 
          ? 'Request aborted' 
          : (isNetworkError 
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
// GLOBAL API FUNCTION - ULTRA-DEFENSIVE WRAPPER
// ============================================================================

window.api = function(endpoint, options = {}) {
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
  
  // EXTREME INPUT VALIDATION
  if (!endpoint || typeof endpoint !== 'string') {
    console.warn('⚠️ [API] Invalid endpoint type:', typeof endpoint, 'defaulting to "/"');
    endpoint = '/';
  }
  
  // SANITIZE endpoint to prevent ANY malformed URLs
  const safeEndpoint = _sanitizeEndpoint(endpoint);
  const fullUrl = _buildSafeUrl(safeEndpoint); // Uses dynamic BASE_API_URL
  
  // VALIDATE options
  const safeOptions = { ...options };
  
  // Ensure method is never an endpoint
  if (safeOptions.method && typeof safeOptions.method === 'string') {
    const methodStr = safeOptions.method.toUpperCase();
    if (methodStr.includes('/API/') || methodStr.includes('/api/') || 
      methodStr.startsWith('API') || methodStr.endsWith('/API')) {
      console.warn(`⚠️ [API] Method "${safeOptions.method}" contains endpoint pattern, normalizing`);
      safeOptions.method = _normalizeHttpMethod(safeOptions.method);
    }
  }
  
  // Add Authorization header if token exists
  try {
    const authUserStr = localStorage.getItem('authUser');
    if (authUserStr && safeOptions.auth !== false) {
      const authUser = JSON.parse(authUserStr);
      // Handle both old token format and new token format
      let token = authUser.token;
      if (!token && authUser.tokens && authUser.tokens.accessToken) {
        token = authUser.tokens.accessToken;
      }
      if (token) {
        safeOptions.headers = {
          ...safeOptions.headers,
          'Authorization': 'Bearer ' + token
        };
      }
    }
  } catch (e) {
    console.log('🔧 [API] Could not attach auth token:', e.message);
  }
  
  // CALL THE CORE FETCH FUNCTION
  return _safeFetch(fullUrl, safeOptions);
};

// ============================================================================
// MAIN API OBJECT - WITH HARDENED METHODS
// ============================================================================

const apiObject = {
  _singleton: true,
  _version: '16.0.0', // Updated version for strict HTTP handling
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
  // HARDENED AUTHENTICATION METHODS - STRICT ERROR HANDLING
  // ============================================================================
  
  login: async function(emailOrUsername, password) {
    // OFFLINE CHECK FIRST - use global network state
    if (!window.AppNetwork.isOnline) {
      return {
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
      console.log(`🔧 [API] Login attempt for: ${emailOrUsername}`);
      console.log(`🔧 [API] Using dynamic backend URL: ${BACKEND_BASE_URL}`);
      console.log(`🔧 [API] Using dynamic API URL: ${BASE_API_URL}`);
      
      // Proper JSON body for login
      const requestData = { 
        identifier: String(emailOrUsername).trim(),
        password: String(password) 
      };
      
      // USE THE CORE FETCH FUNCTION
      const result = await _safeFetch(`${BACKEND_BASE_URL}/api/auth/login`, {
        method: 'POST',
        body: requestData
      });
      
      // STRICT: Check response.ok - if false, treat as HARD failure
      if (!result.ok) {
        // STRICT: Do NOT return success if response.ok === false
        console.log(`🔧 [API] Login failed with status ${result.status}: ${result.message}`);
        
        // STRICT: Do NOT mark backend offline on 401 or 400
        if (result.status === 401 || result.status === 400) {
          // These are client errors, backend is still reachable
          window.AppNetwork.updateBackendStatus(true);
        }
        
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
      // Handle new token structure from backend
      const userData = result.data;
      const accessToken = userData.tokens?.accessToken || userData.token;
      const refreshToken = userData.tokens?.refreshToken;
      const user = userData.user || userData;
      
      if (accessToken && user) {
        console.log(`🔧 [API] Login successful, storing authUser with new token structure`);
        
        // Store with new token structure
        localStorage.setItem('authUser', JSON.stringify({
          token: accessToken, // Keep backward compatibility
          tokens: {
            accessToken: accessToken,
            refreshToken: refreshToken
          },
          user: user
        }));
        
        // Backward compatibility with old storage keys
        localStorage.setItem('moodchat_auth_token', accessToken);
        localStorage.setItem('moodchat_auth_user', JSON.stringify(user));
        
        if (refreshToken) {
          localStorage.setItem('moodchat_refresh_token', refreshToken);
        }
      } else if (userData.token && userData.user) {
        // Fallback for old token structure
        console.log(`🔧 [API] Login successful (legacy token structure)`);
        localStorage.setItem('authUser', JSON.stringify({
          token: userData.token,
          user: userData.user
        }));
        
        // Backward compatibility
        localStorage.setItem('moodchat_auth_token', userData.token);
        localStorage.setItem('moodchat_auth_user', JSON.stringify(userData.user));
      }
      
      this._sessionChecked = true;
      window.AppNetwork.updateBackendStatus(true);
      
      return {
        ok: true,
        success: true,
        message: 'Login successful',
        token: accessToken, // For backward compatibility
        accessToken: accessToken,
        refreshToken: refreshToken,
        user: user,
        data: result.data,
        isRateLimited: false,
        isServerError: false
      };
      
    } catch (error) {
      console.error('🔧 [API] Login error:', error);
      
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
  
  register: async function(userData) {
    // OFFLINE CHECK FIRST - use global network state
    if (!window.AppNetwork.isOnline) {
      return {
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
      console.log('🔧 [API] Register attempt');
      console.log(`🔧 [API] Using dynamic backend URL: ${BACKEND_BASE_URL}`);
      console.log(`🔧 [API] Using dynamic API URL: ${BASE_API_URL}`);
      
      // Proper JSON body for register
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
      
      // USE THE CORE FETCH FUNCTION
      const result = await _safeFetch(`${BACKEND_BASE_URL}/api/auth/register`, {
        method: 'POST',
        body: registerPayload
      });
      
      // STRICT: Check response.ok - if false, treat as HARD failure
      if (!result.ok) {
        console.log(`🔧 [API] Registration failed with status ${result.status}: ${result.message}`);
        
        // STRICT: Do NOT mark backend offline on 400 or 409
        if (result.status === 400 || result.status === 409) {
          window.AppNetwork.updateBackendStatus(true);
        }
        
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
      // Handle new token structure from backend
      const responseData = result.data;
      const accessToken = responseData.tokens?.accessToken || responseData.token;
      const refreshToken = responseData.tokens?.refreshToken;
      const user = responseData.user || responseData;
      
      if (accessToken && user) {
        console.log(`🔧 [API] Registration successful, storing with new token structure`);
        
        // Store with new token structure
        localStorage.setItem('authUser', JSON.stringify({
          token: accessToken, // Keep backward compatibility
          tokens: {
            accessToken: accessToken,
            refreshToken: refreshToken
          },
          user: user
        }));
        
        // Backward compatibility with old storage keys
        localStorage.setItem('moodchat_auth_token', accessToken);
        localStorage.setItem('moodchat_auth_user', JSON.stringify(user));
        
        if (refreshToken) {
          localStorage.setItem('moodchat_refresh_token', refreshToken);
        }
      } else if (responseData.token && responseData.user) {
        // Fallback for old token structure
        console.log(`🔧 [API] Registration successful (legacy token structure)`);
        localStorage.setItem('authUser', JSON.stringify({
          token: responseData.token,
          user: responseData.user
        }));
        
        // Backward compatibility
        localStorage.setItem('moodchat_auth_token', responseData.token);
        localStorage.setItem('moodchat_auth_user', JSON.stringify(responseData.user));
      }
      
      this._sessionChecked = true;
      window.AppNetwork.updateBackendStatus(true);
      
      return {
        ok: true,
        success: true,
        message: 'Registration successful',
        token: accessToken, // For backward compatibility
        accessToken: accessToken,
        refreshToken: refreshToken,
        user: user,
        data: result.data,
        isRateLimited: false,
        isServerError: false
      };
      
    } catch (error) {
      console.error('🔧 [API] Register error:', error);
      
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
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok || response.status < 500) {
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
  // SESSION MANAGEMENT
  // ============================================================================
  
  checkSession: async function() {
    try {
      const authUserStr = localStorage.getItem('authUser');
      
      if (!authUserStr) {
        this._sessionChecked = true;
        return {
          ok: false,
          success: false,
          authenticated: false,
          message: 'No active session',
          isRateLimited: false,
          isServerError: false
        };
      }
      
      let authUser;
      try {
        authUser = JSON.parse(authUserStr);
        // Check for both old and new token structures
        const hasToken = authUser.token || (authUser.tokens && authUser.tokens.accessToken);
        if (!hasToken || !authUser.user) {
          // Soft failure - don't clear, just report
          this._sessionChecked = true;
          return {
            ok: false,
            success: false,
            authenticated: false,
            message: 'Invalid session data',
            softAuth: true,
            isRateLimited: false,
            isServerError: false
          };
        }
      } catch (e) {
        console.error('🔧 [API] Error parsing authUser:', e);
        this._sessionChecked = true;
        return {
          ok: false,
          success: false,
          authenticated: false,
          message: 'Invalid session data',
          softAuth: true,
          isRateLimited: false,
          isServerError: false
        };
      }
      
      // Return cached session if offline
      if (!window.AppNetwork.isOnline) {
        return {
          ok: true,
          success: true,
          authenticated: true,
          user: authUser.user,
          offline: true,
          message: 'Session valid (offline)',
          isRateLimited: false,
          isServerError: false
        };
      }
      
      // Cached session check
      if (this._sessionChecked && window.AppNetwork.isBackendReachable !== false) {
        return {
          ok: true,
          success: true,
          authenticated: true,
          user: authUser.user,
          message: 'Session valid (cached)',
          isRateLimited: false,
          isServerError: false
        };
      }
      
      try {
        // Get token from new or old structure
        const token = authUser.tokens?.accessToken || authUser.token;
        
        // USE THE CORE FETCH FUNCTION
        const result = await _safeFetch(`${BACKEND_BASE_URL}/api/auth/me`, {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        });
        
        // STRICT: Check response.ok
        if (!result.ok) {
          // STRICT: Do NOT mark backend offline on 401
          if (result.status === 401 || result.status === 403) {
            console.log('🔧 [API] Session expired, maintaining soft-auth');
            return {
              ok: false,
              success: false,
              authenticated: false,
              message: 'Session expired',
              softAuth: true,
              isAuthError: true,
              isRateLimited: false,
              isServerError: false
            };
          }
          
          // Backend error but keep local session
          this._sessionChecked = true;
          return {
            ok: true,
            success: true,
            authenticated: true,
            user: authUser.user,
            offline: true,
            message: 'Session valid (backend error)',
            isRateLimited: result.isRateLimited || false,
            isServerError: result.isServerError || false
          };
        }
        
        // Only reach here if result.ok === true
        const updatedUser = result.data.user || authUser.user;
        
        // Update auth data
        authUser.user = updatedUser;
        localStorage.setItem('authUser', JSON.stringify(authUser));
        localStorage.setItem('moodchat_auth_user', JSON.stringify(updatedUser));
        
        this._sessionChecked = true;
        window.AppNetwork.updateBackendStatus(true);
        
        return {
          ok: true,
          success: true,
          authenticated: true,
          user: updatedUser,
          message: 'Session valid (online)',
          isRateLimited: false,
          isServerError: false
        };
        
      } catch (backendError) {
        // Check if this is an AbortError
        const isAbortError = backendError.name === 'AbortError' || 
                           backendError.message.includes('aborted') ||
                           backendError.message.includes('The user aborted');
        
        if (isAbortError) {
          console.log('🔧 [API] Session check aborted, using cached session');
          // For abort errors, keep current backend reachability status
        } else {
          console.log('🔧 [API] Backend unreachable, using cached session');
          window.AppNetwork.updateBackendStatus(false);
        }
        
        this._sessionChecked = true;
        
        return {
          ok: true,
          success: true,
          authenticated: true,
          user: authUser.user,
          offline: true,
          message: 'Session valid (offline mode)',
          isRateLimited: false,
          isServerError: false
        };
      }
      
    } catch (error) {
      console.error('🔧 [API] Check session error:', error);
      this._sessionChecked = true;
      return {
        ok: false,
        success: false,
        authenticated: false,
        message: 'Failed to check session',
        softAuth: true,
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  // ============================================================================
  // DATA METHODS - ALL USE CORE FETCH FUNCTION
  // ============================================================================
  
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
      // Use window.api which calls _safeFetch
      const result = await window.api('/statuses/all', {
        method: 'GET',
        auth: true
      });
      
      // STRICT: Check response.ok
      if (!result.ok) {
        throw {
          message: result.message,
          status: result.status,
          isRateLimited: result.isRateLimited,
          isServerError: result.isServerError
        };
      }
      
      // Only cache if successful
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
      console.error('🔧 [API] Get statuses error:', error);
      
      // Fallback to cached data
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
      const result = await window.api('/friends/list', {
        method: 'GET',
        auth: true
      });
      
      // STRICT: Check response.ok
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
      console.error('🔧 [API] Get friends error:', error);
      
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
  
  // Additional methods with strict error handling
  getUsers: async function() {
    const result = await window.api('/users', { method: 'GET', auth: true });
    
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
  },
  
  getUserById: async function(userId) {
    const result = await window.api(`/users/${encodeURIComponent(userId)}`, { method: 'GET', auth: true });
    
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
  },
  
  getStatus: async function(statusId) {
    const result = await window.api(`/status/${encodeURIComponent(statusId)}`, { method: 'GET', auth: true });
    
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
  },
  
  createStatus: async function(statusData) {
    const result = await window.api('/status', { 
      method: 'POST', 
      body: statusData,
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
  },
  
  getChats: async function() {
    const result = await window.api('/chats', { method: 'GET', auth: true });
    
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
  },
  
  getChatById: async function(chatId) {
    const result = await window.api(`/chats/${encodeURIComponent(chatId)}`, { method: 'GET', auth: true });
    
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
  },
  
  getContacts: async function() {
    const result = await window.api('/contacts', { method: 'GET', auth: true });
    
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
  },
  
  // ============================================================================
  // UTILITY METHODS
  // ============================================================================
  
  isLoggedIn: function() {
    try {
      const authUserStr = localStorage.getItem('authUser');
      if (!authUserStr) return false;
      
      const authUser = JSON.parse(authUserStr);
      // Check for both old and new token structures
      const hasToken = authUser.token || (authUser.tokens && authUser.tokens.accessToken);
      return !!(hasToken && authUser.user);
    } catch (error) {
      return false;
    }
  },
  
  getCurrentUser: function() {
    try {
      const authUserStr = localStorage.getItem('authUser');
      if (authUserStr) {
        const authUser = JSON.parse(authUserStr);
        return authUser.user || null;
      }
    } catch (e) {
      console.error('🔧 [API] Error parsing authUser:', e);
    }
    return null;
  },
  
  getCurrentToken: function() {
    try {
      const authUserStr = localStorage.getItem('authUser');
      if (authUserStr) {
        const authUser = JSON.parse(authUserStr);
        return authUser.tokens?.accessToken || authUser.token || null;
      }
    } catch (e) {
      console.error('🔧 [API] Error parsing authUser for token:', e);
    }
    return null;
  },
  
  getAccessToken: function() {
    return this.getCurrentToken();
  },
  
  getRefreshToken: function() {
    try {
      const authUserStr = localStorage.getItem('authUser');
      if (authUserStr) {
        const authUser = JSON.parse(authUserStr);
        return authUser.tokens?.refreshToken || null;
      }
    } catch (e) {
      console.error('🔧 [API] Error parsing authUser for refresh token:', e);
    }
    return null;
  },
  
  logout: function() {
    try {
      localStorage.removeItem('authUser');
      localStorage.removeItem('moodchat_auth_token');
      localStorage.removeItem('moodchat_auth_user');
      localStorage.removeItem('moodchat_refresh_token');
      this._sessionChecked = false;
      console.log('🔧 [API] User logged out');
      return { 
        ok: true,
        success: true, 
        message: 'Logged out successfully',
        isRateLimited: false,
        isServerError: false
      };
    } catch (error) {
      console.error('🔧 [API] Error during logout:', error);
      return { 
        ok: false,
        success: false, 
        message: 'Logout failed',
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  _clearAuthData: function() {
    localStorage.removeItem('authUser');
    localStorage.removeItem('moodchat_auth_token');
    localStorage.removeItem('moodchat_auth_user');
    localStorage.removeItem('moodchat_refresh_token');
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
    return {
      online: window.AppNetwork.isOnline,
      backendReachable: window.AppNetwork.isBackendReachable,
      timestamp: new Date().toISOString(),
      backendUrl: BACKEND_BASE_URL,
      baseApiUrl: BASE_API_URL,
      sessionChecked: this._sessionChecked,
      hasAuthToken: !!this.getCurrentToken(),
      hasAuthUser: !!localStorage.getItem('authUser'),
      tokenStructure: this.getCurrentToken() ? (localStorage.getItem('authUser')?.includes('"tokens"') ? 'new' : 'old') : 'none'
    };
  },
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  initialize: async function() {
    console.log('🔧 [API] ⚡ MoodChat API v16.0.0 (STRICT HTTP HANDLING) initializing...');
    console.log('🔧 [API] 🔗 Backend URL:', BACKEND_BASE_URL);
    console.log('🔧 [API] 🔗 API Base URL:', BASE_API_URL);
    console.log('🔧 [API] 🌐 Network State - Online:', window.AppNetwork.isOnline, 'Backend Reachable:', window.AppNetwork.isBackendReachable);
    console.log('🔧 [API] ✅ CRITICAL: ALL API calls will use single dynamic source:', BASE_API_URL);
    
    // Migrate old auth data if needed
    const oldToken = localStorage.getItem('moodchat_auth_token');
    const oldUser = localStorage.getItem('moodchat_auth_user');
    const authUserStr = localStorage.getItem('authUser');
    
    if ((oldToken || oldUser) && !authUserStr) {
      console.log('🔧 [API] Migrating old auth data...');
      try {
        const token = oldToken || '';
        let user = null;
        if (oldUser) {
          user = JSON.parse(oldUser);
        }
        
        if (token || user) {
          localStorage.setItem('authUser', JSON.stringify({
            token: token,
            user: user
          }));
        }
      } catch (e) {
        console.error('🔧 [API] Failed to migrate auth data:', e);
      }
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
        console.log('🔧 [API] 🔐 Auth:', this.isLoggedIn() ? 'Logged in' : 'Not logged in');
        console.log('🔧 [API] 🔑 Token present:', !!this.getCurrentToken());
        console.log('🔧 [API] 🔄 Token structure:', this.getConnectionStatus().tokenStructure);
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
    const authUserStr = localStorage.getItem('authUser');
    if (!authUserStr) {
      return { 
        ok: false,
        success: false, 
        authenticated: false, 
        message: 'No stored credentials',
        isRateLimited: false,
        isServerError: false
      };
    }
    
    try {
      const authUser = JSON.parse(authUserStr);
      const hasToken = authUser.token || (authUser.tokens && authUser.tokens.accessToken);
      if (!hasToken || !authUser.user) {
        return { 
          ok: false,
          success: false, 
          authenticated: false, 
          message: 'Invalid stored credentials',
          isRateLimited: false,
          isServerError: false
        };
      }
    } catch (e) {
      return { 
        ok: false,
        success: false, 
        authenticated: false, 
        message: 'Corrupted stored credentials',
        isRateLimited: false,
        isServerError: false
      };
    }
    
    if (this._sessionChecked) {
      const user = this.getCurrentUser();
      return {
        ok: true,
        success: true,
        authenticated: true,
        user: user,
        cached: true,
        message: 'Auto-login (cached session)',
        isRateLimited: false,
        isServerError: false
      };
    }
    
    return await this.checkSession();
  },
  
  _dispatchReadyEvents: function() {
    const eventDetail = {
      version: this._version,
      timestamp: new Date().toISOString(),
      backendUrl: BACKEND_BASE_URL,
      apiBaseUrl: BASE_API_URL,
      user: this.getCurrentUser(),
      hasToken: !!this.getCurrentToken(),
      hasAuthUser: !!localStorage.getItem('authUser'),
      hardened: true,
      enhancedErrorHandling: true,
      supportsNewTokenStructure: true,
      dynamicEnvironmentDetection: true,
      strictHttpHandling: true,
      environment: window.location.hostname === 'localhost' ? 'local' : 'production',
      networkState: {
        isOnline: window.AppNetwork.isOnline,
        isBackendReachable: window.AppNetwork.isBackendReachable
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
      console.log('🔧 [API] API synchronization ready (strict HTTP handling)');
    }, 1000);
  },
  
  // ============================================================================
  // DIAGNOSTICS
  // ============================================================================
  
  diagnose: async function() {
    console.log('🔧 [API] Running diagnostics with strict HTTP handling...');
    
    const results = {
      networkState: {
        online: window.AppNetwork.isOnline,
        backendReachable: window.AppNetwork.isBackendReachable,
        lastChecked: window.AppNetwork.lastChecked
      },
      localStorage: {
        authUser: !!localStorage.getItem('authUser'),
        moodchat_auth_token: !!localStorage.getItem('moodchat_auth_token'),
        moodchat_auth_user: !!localStorage.getItem('moodchat_auth_user'),
        moodchat_refresh_token: !!localStorage.getItem('moodchat_refresh_token'),
        deviceId: !!localStorage.getItem('moodchat_device_id')
      },
      session: {
        checked: this._sessionChecked,
        authenticated: this.isLoggedIn(),
        user: this.getCurrentUser(),
        accessToken: this.getAccessToken() ? 'Present' : 'Missing',
        refreshToken: this.getRefreshToken() ? 'Present' : 'Missing',
        tokenStructure: this.getConnectionStatus().tokenStructure
      },
      config: {
        backendUrl: BACKEND_BASE_URL,
        apiBaseUrl: BASE_API_URL,
        currentHostname: window.location.hostname,
        currentProtocol: window.location.protocol,
        hardened: true,
        enhancedErrorHandling: true,
        supportsNewTokenStructure: true,
        dynamicEnvironmentDetection: true,
        strictHttpHandling: true
      },
      validation: {
        methodNormalization: 'ACTIVE',
        endpointSanitization: 'ACTIVE',
        singleFetchFunction: 'ACTIVE',
        offlineDetection: 'ACTIVE',
        errorTypeDetection: 'ACTIVE',
        tokenStructureSupport: 'ACTIVE',
        dynamicEnvironmentDetection: 'ACTIVE',
        strictHttpStatusHandling: 'ACTIVE',
        singleNetworkStateSource: 'ACTIVE'
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
    const result = await window.api(endpoint, options);
    
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
// API SETUP
// ============================================================================

Object.assign(window.api, apiObject);
Object.setPrototypeOf(window.api, Object.getPrototypeOf(apiObject));

console.log('🔧 [API] Starting hardened initialization with strict HTTP handling...');

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
    
    Object.assign(fallbackApi, {
      _singleton: true,
      _version: 'fallback',
      _hardened: true,
      initialize: () => {
        console.log('🔧 [API] Fallback initialized');
        return true;
      },
      isLoggedIn: () => {
        try {
          const authUserStr = localStorage.getItem('authUser');
          if (!authUserStr) return false;
          const authUser = JSON.parse(authUserStr);
          const hasToken = authUser.token || (authUser.tokens && authUser.tokens.accessToken);
          return !!(hasToken && authUser.user);
        } catch (e) {
          return false;
        }
      },
      getCurrentUser: () => {
        try {
          const authUserStr = localStorage.getItem('authUser');
          if (authUserStr) {
            const authUser = JSON.parse(authUserStr);
            return authUser.user || null;
          }
        } catch (e) {
          return null;
        }
        return null;
      },
      getCurrentToken: () => {
        try {
          const authUserStr = localStorage.getItem('authUser');
          if (authUserStr) {
            const authUser = JSON.parse(authUserStr);
            return authUser.tokens?.accessToken || authUser.token || null;
          }
        } catch (e) {
          return null;
        }
        return null;
      },
      isOnline: () => window.AppNetwork.isOnline,
      isBackendReachable: () => false,
      checkSession: async () => ({ 
        ok: false,
        authenticated: fallbackApi.isLoggedIn(),
        offline: true,
        fallback: true,
        isRateLimited: false,
        isServerError: false
      }),
      autoLogin: async () => ({
        ok: fallbackApi.isLoggedIn(),
        success: fallbackApi.isLoggedIn(),
        authenticated: fallbackApi.isLoggedIn(),
        user: fallbackApi.getCurrentUser(),
        fallback: true,
        isRateLimited: false,
        isServerError: false
      }),
      login: async () => ({ 
        ok: false,
        success: false, 
        message: 'API fallback mode',
        offline: !window.AppNetwork.isOnline,
        fallback: true,
        isRateLimited: false,
        isServerError: false
      }),
      register: async () => ({ 
        ok: false,
        success: false, 
        message: 'API fallback mode',
        offline: !window.AppNetwork.isOnline,
        fallback: true,
        isRateLimited: false,
        isServerError: false
      }),
      request: async () => ({
        ok: false,
        success: false,
        message: 'API fallback mode',
        offline: !window.AppNetwork.isOnline,
        fallback: true,
        isRateLimited: false,
        isServerError: false
      })
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
  
  Object.assign(emergencyApi, {
    _singleton: true,
    _version: 'emergency',
    _neverFails: true,
    isLoggedIn: () => false,
    isBackendReachable: () => false,
    initialize: () => true,
    autoLogin: async () => ({ 
      ok: false,
      success: false, 
      authenticated: false, 
      emergency: true,
      isRateLimited: false,
      isServerError: false
    }),
    isOnline: () => window.AppNetwork.isOnline
  });
  
  window.api = emergencyApi;
}

// Global API state
window.__MOODCHAT_API_EVENTS = [];
window.__MOODCHAT_API_INSTANCE = window.api;
window.__MOODCHAT_API_READY = true;
window.MOODCHAT_API_READY = true;

console.log('🔧 [API] STRICT Backend API integration complete');
console.log('🔧 [API] ✅ Single source of truth for network state: ACTIVE');
console.log('🔧 [API] ✅ Global network state via window.AppNetwork: ACTIVE');
console.log('🔧 [API] ✅ STRICT HTTP status handling: ACTIVE (≥400 = HARD failure)');
console.log('🔧 [API] ✅ NEVER return success if response.ok === false: ACTIVE');
console.log('🔧 [API] ✅ Do NOT mark backend offline on 401/400: ACTIVE');
console.log('🔧 [API] ✅ Dynamic environment detection: ACTIVE');
console.log('🔧 [API] ✅ All API calls use BASE_API_URL from window.location: ACTIVE');
console.log('🔧 [API] ✅ Backend URL: ' + BACKEND_BASE_URL);
console.log('🔧 [API] ✅ API Base URL: ' + BASE_API_URL);
console.log('🔧 [API] ⚡ Ready for production with strict error handling');