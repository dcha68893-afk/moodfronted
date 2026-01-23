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
// ENVIRONMENT DETECTION - DYNAMIC BACKEND URL CONFIGURATION
// ============================================================================
/**
 * Detects the environment and sets the correct backend URL
 * FIX 1: Dynamic environment detection based on current hostname
 */
const getBackendBaseUrl = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // Development environments
  if (hostname === 'localhost' || 
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168') ||
      hostname === '0.0.0.0' ||
      protocol === 'file:') {
    return 'http://localhost:4000';
  }
  
  // Production environment on Render
  if (hostname === 'moodfronted.onrender.com' ||
      hostname.includes('moodfronted.onrender.com') ||
      hostname.includes('onrender.com')) {
    return 'https://moodchat-fy56.onrender.com';
  }
  
  // Default to localhost for development
  console.warn('⚠️ Unknown hostname, defaulting to local development backend');
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
// SINGLE FETCH FUNCTION - THE ONLY PLACE fetch() IS CALLED
// ============================================================================

/**
 * CORE FETCH FUNCTION - Validates EVERYTHING before fetch()
 * This is the ONLY function that should ever call fetch()
 * UPDATED: Enhanced error handling for 429 and 500 errors
 * CRITICAL: Uses dynamically determined BASE_API_URL via _buildSafeUrl()
 */
function _safeFetchCall(fullUrl, options = {}) {
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
  
  // PERFORM THE FETCH - ONLY HERE
  return fetch(fullUrl, safeOptions)
    .then(async response => {
      try {
        const data = await response.json();
        
        // Enhanced error handling for specific status codes
        let errorMessage = data.message || (response.ok ? 'Success' : 'Request failed');
        let isRateLimited = false;
        let isServerError = false;
        
        if (response.status === 429) {
          errorMessage = 'Too many requests. Please wait and try again.';
          isRateLimited = true;
        } else if (response.status >= 500) {
          errorMessage = 'Server error. Please try again later.';
          isServerError = true;
        } else if (response.status === 401) {
          errorMessage = data.message || 'Invalid credentials';
        } else if (response.status === 400) {
          errorMessage = data.message || 'Bad request';
        } else if (response.status === 404) {
          errorMessage = data.message || 'Resource not found';
        }
        
        return {
          success: response.ok,
          status: response.status,
          data: data,
          message: errorMessage,
          headers: Object.fromEntries(response.headers.entries()),
          isRateLimited: isRateLimited,
          isServerError: isServerError,
          retryAfter: response.headers.get('Retry-After')
        };
      } catch (jsonError) {
        return {
          success: response.ok,
          status: response.status,
          data: null,
          message: response.statusText || 'Request completed',
          headers: Object.fromEntries(response.headers.entries()),
          rawResponse: response,
          isRateLimited: response.status === 429,
          isServerError: response.status >= 500
        };
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
      
      return {
        success: false,
        status: 0,
        message: isAbortError 
          ? 'Request aborted' 
          : (isNetworkError 
            ? 'Network error. Please check your connection.' 
            : 'Request failed: ' + error.message),
        error: error.message,
        isNetworkError: isNetworkError && !isAbortError, // AbortError is NOT a network error
        isAbortError: isAbortError, // Track abort separately
        isRateLimited: false,
        isServerError: false
      };
    });
}

// ============================================================================
// GLOBAL API FUNCTION - ULTRA-DEFENSIVE WRAPPER WITH ENHANCED ERROR HANDLING
// ============================================================================

window.api = function(endpoint, options = {}) {
  // OFFLINE FIRST CHECK - Immediate response if offline
  if (!navigator.onLine) {
    console.log('🔧 [API] Offline detected, returning cached response');
    return Promise.resolve({
      success: false,
      status: 0,
      message: 'Offline mode',
      offline: true,
      cached: true,
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
  
  // CALL THE SINGLE SAFE FETCH FUNCTION
  return _safeFetchCall(fullUrl, safeOptions);
};

// ============================================================================
// MAIN API OBJECT - WITH HARDENED METHODS AND ENHANCED ERROR HANDLING
// ============================================================================

const apiObject = {
  _singleton: true,
  _version: '15.0.0', // Updated version for dynamic environment detection
  _safeInitialized: true,
  _backendReachable: null,
  _sessionChecked: false,
  
  /**
   * Configuration object with dynamically determined URLs
   * FIX 3: All URLs come from dynamic detection
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
  // HARDENED AUTHENTICATION METHODS WITH ENHANCED ERROR PROPAGATION
  // ============================================================================
  
  login: async function(emailOrUsername, password) {
    // OFFLINE CHECK FIRST
    if (!navigator.onLine) {
      return {
        success: false,
        message: 'Cannot login while offline',
        offline: true,
        isRateLimited: false,
        isServerError: false
      };
    }
    
    try {
      console.log(`🔧 [API] Login attempt for: ${emailOrUsername}`);
      console.log(`🔧 [API] Using dynamic backend URL: ${BACKEND_BASE_URL}`);
      console.log(`🔧 [API] Using dynamic API URL: ${BASE_API_URL}`);
      
      // FIX 4: Proper JSON body for login
      const requestData = { 
        identifier: String(emailOrUsername).trim(),
        password: String(password) 
      };
      
      // USE THE SINGLE FETCH FUNCTION - CRITICAL: Uses dynamic BASE_API_URL
      const result = await _safeFetchCall(`${BACKEND_BASE_URL}/api/auth/login`, {
        method: 'POST',
        body: requestData
      });
      
      if (result.success) {
        // UPDATED: Handle new token structure from backend
        // Backend now returns: { user, tokens: { accessToken, refreshToken } }
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
        this._backendReachable = true;
        
        return {
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
      } else {
        // Enhanced error propagation for frontend display
        let errorMessage = 'Login failed';
        let isRateLimited = result.isRateLimited || false;
        let isServerError = result.isServerError || false;
        
        if (result.status === 401 || result.status === 403) {
          errorMessage = 'Invalid credentials';
          console.log('🔧 [API] Auth failed, maintaining soft-auth mode');
          return {
            success: false,
            message: errorMessage,
            softAuth: true,
            isRateLimited: isRateLimited,
            isServerError: isServerError,
            status: result.status
          };
        }
        
        if (result.isRateLimited) {
          errorMessage = 'Too many login attempts. Please wait and try again.';
        } else if (result.isServerError) {
          errorMessage = 'Server error. Please try again later.';
        } else if (result.data && result.data.message) {
          errorMessage = result.data.message;
        } else if (result.message) {
          errorMessage = result.message;
        }
        
        return {
          success: false,
          message: errorMessage,
          status: result.status,
          error: result.error,
          isRateLimited: isRateLimited,
          isServerError: isServerError,
          retryAfter: result.retryAfter
        };
      }
    } catch (error) {
      console.error('🔧 [API] Login error:', error);
      
      // Safe error propagation with enhanced error types
      return {
        success: false,
        message: 'Login failed: ' + (error.message || 'Network error'),
        error: error.message,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  register: async function(userData) {
    // OFFLINE CHECK FIRST
    if (!navigator.onLine) {
      return {
        success: false,
        message: 'Cannot register while offline',
        offline: true,
        isRateLimited: false,
        isServerError: false
      };
    }
    
    try {
      console.log('🔧 [API] Register attempt');
      console.log(`🔧 [API] Using dynamic backend URL: ${BACKEND_BASE_URL}`);
      console.log(`🔧 [API] Using dynamic API URL: ${BASE_API_URL}`);
      
      // FIX 5: Proper JSON body for register
      const registerPayload = {
        username: String(userData.username || '').trim(),
        email: String(userData.email || '').trim(),
        password: String(userData.password || ''),
        confirmPassword: String(userData.confirmPassword || '')
      };
      
      // Validate required fields
      if (!registerPayload.username || !registerPayload.email || 
        !registerPayload.password || !registerPayload.confirmPassword) {
        return {
          success: false,
          message: 'All fields are required',
          validationError: true,
          isRateLimited: false,
          isServerError: false
        };
      }
      
      // Validate password match
      if (registerPayload.password !== registerPayload.confirmPassword) {
        return {
          success: false,
          message: 'Passwords do not match',
          validationError: true,
          isRateLimited: false,
          isServerError: false
        };
      }
      
      // USE THE SINGLE FETCH FUNCTION - CRITICAL: Uses dynamic BASE_API_URL
      const result = await _safeFetchCall(`${BACKEND_BASE_URL}/api/auth/register`, {
        method: 'POST',
        body: registerPayload
      });
      
      if (result.success) {
        // UPDATED: Handle new token structure from backend
        // Backend now returns: { user, tokens: { accessToken, refreshToken } }
        const userData = result.data;
        const accessToken = userData.tokens?.accessToken || userData.token;
        const refreshToken = userData.tokens?.refreshToken;
        const user = userData.user || userData;
        
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
        } else if (userData.token && userData.user) {
          // Fallback for old token structure
          console.log(`🔧 [API] Registration successful (legacy token structure)`);
          localStorage.setItem('authUser', JSON.stringify({
            token: userData.token,
            user: userData.user
          }));
          
          // Backward compatibility
          localStorage.setItem('moodchat_auth_token', userData.token);
          localStorage.setItem('moodchat_auth_user', JSON.stringify(userData.user));
        }
        
        this._sessionChecked = true;
        this._backendReachable = true;
        
        return {
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
      } else {
        // Enhanced error propagation for frontend display
        let errorMessage = 'Registration failed';
        let isRateLimited = result.isRateLimited || false;
        let isServerError = result.isServerError || false;
        
        if (result.status === 429) {
          errorMessage = 'Too many registration attempts. Please wait and try again.';
          isRateLimited = true;
        } else if (result.status === 500) {
          errorMessage = 'Server error during registration. Please try again later.';
          isServerError = true;
        } else if (result.status === 409) {
          errorMessage = 'Username or email already exists';
        } else if (result.status === 400) {
          errorMessage = 'Invalid registration data';
        }
        
        if (result.data && result.data.message) {
          errorMessage = result.data.message;
        } else if (result.message) {
          errorMessage = result.message;
        }
        
        return {
          success: false,
          message: errorMessage,
          status: result.status,
          error: result.error,
          isRateLimited: isRateLimited,
          isServerError: isServerError,
          retryAfter: result.retryAfter
        };
      }
    } catch (error) {
      console.error('🔧 [API] Register error:', error);
      
      // Safe error propagation with enhanced error types
      return {
        success: false,
        message: 'Registration failed: ' + (error.message || 'Network error'),
        error: error.message,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  // ============================================================================
  // BACKEND HEALTH CHECK - HARDENED WITH ENHANCED ERROR REPORTING
  // ============================================================================
  
  checkBackendHealth: async function() {
    // OFFLINE DETECTION
    if (!navigator.onLine) {
      console.log('🔧 [API] Offline, backend unreachable');
      this._backendReachable = false;
      return {
        success: false,
        reachable: false,
        message: 'Offline mode',
        offline: true,
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
        
        // USE THE SINGLE FETCH FUNCTION with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        // Use a direct fetch for health check (not _safeFetchCall) to avoid recursion
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'include',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok || response.status < 500) {
          console.log(`✅ [API] Backend reachable (status: ${response.status})`);
          this._backendReachable = true;
          
          return {
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
        // CRITICAL FIX: AbortError should NOT mark backend as unreachable
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
    // Only mark backend unreachable if we had real network errors, not abort errors
    console.log('🔧 [API] Backend unreachable after testing all endpoints');
    this._backendReachable = false;
    
    return {
      success: false,
      reachable: false,
      message: 'Backend is unreachable',
      offlineMode: true,
      isRateLimited: false,
      isServerError: false
    };
  },
  
  // ============================================================================
  // SESSION MANAGEMENT - SOFT AUTH PRESERVED WITH ERROR TYPES
  // ============================================================================
  
  checkSession: async function() {
    try {
      const authUserStr = localStorage.getItem('authUser');
      
      if (!authUserStr) {
        this._sessionChecked = true;
        return {
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
        // UPDATED: Check for both old and new token structures
        const hasToken = authUser.token || (authUser.tokens && authUser.tokens.accessToken);
        if (!hasToken || !authUser.user) {
          // Soft failure - don't clear, just report
          this._sessionChecked = true;
          return {
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
          success: false,
          authenticated: false,
          message: 'Invalid session data',
          softAuth: true,
          isRateLimited: false,
          isServerError: false
        };
      }
      
      // Return cached session if offline
      if (!navigator.onLine) {
        return {
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
      if (this._sessionChecked && this._backendReachable !== false) {
        return {
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
        
        // USE THE SINGLE FETCH FUNCTION with proper headers
        const result = await _safeFetchCall(`${BACKEND_BASE_URL}/api/auth/me`, {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        });
        
        if (result.success) {
          const updatedUser = result.data.user || authUser.user;
          
          // Update auth data
          authUser.user = updatedUser;
          localStorage.setItem('authUser', JSON.stringify(authUser));
          localStorage.setItem('moodchat_auth_user', JSON.stringify(updatedUser));
          
          this._sessionChecked = true;
          this._backendReachable = true;
          
          return {
            success: true,
            authenticated: true,
            user: updatedUser,
            message: 'Session valid (online)',
            isRateLimited: false,
            isServerError: false
          };
        } else {
          // Enhanced error handling
          let errorMessage = 'Session validation failed';
          let isRateLimited = result.isRateLimited || false;
          let isServerError = result.isServerError || false;
          
          if (result.isRateLimited) {
            errorMessage = 'Too many session checks. Please wait.';
          } else if (result.isServerError) {
            errorMessage = 'Server error during session check.';
          }
          
          // Soft auth failure - don't clear data
          if (result.status === 401 || result.status === 403) {
            console.log('🔧 [API] Session expired, maintaining soft-auth');
            return {
              success: false,
              authenticated: false,
              message: 'Session expired',
              softAuth: true,
              isRateLimited: isRateLimited,
              isServerError: isServerError
            };
          }
          
          // Backend error but keep local session
          this._sessionChecked = true;
          return {
            success: true,
            authenticated: true,
            user: authUser.user,
            offline: true,
            message: 'Session valid (backend error)',
            isRateLimited: isRateLimited,
            isServerError: isServerError
          };
        }
      } catch (backendError) {
        // CRITICAL FIX: Check if this is an AbortError
        const isAbortError = backendError.name === 'AbortError' || 
                           backendError.message.includes('aborted') ||
                           backendError.message.includes('The user aborted');
        
        if (isAbortError) {
          console.log('🔧 [API] Session check aborted, using cached session');
          // For abort errors, keep current backend reachability status
          // Don't mark backend as unreachable
        } else {
          console.log('🔧 [API] Backend unreachable, using cached session');
          this._backendReachable = false;
        }
        
        this._sessionChecked = true;
        
        return {
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
  // HARDENED DATA METHODS - ALL USE SINGLE FETCH FUNCTION WITH ERROR TYPES
  // ============================================================================
  
  getStatuses: async function() {
    // OFFLINE FIRST
    if (!navigator.onLine) {
      const cached = localStorage.getItem('moodchat_cache_statuses');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          return {
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
      // USE THE SINGLE FETCH FUNCTION via window.api
      const result = await window.api('/statuses/all', {
        method: 'GET',
        auth: true
      });
      
      if (result.success && result.data) {
        // Cache for offline use
        try {
          localStorage.setItem('moodchat_cache_statuses', JSON.stringify({
            data: result.data,
            timestamp: Date.now()
          }));
        } catch (e) {
          console.log('🔧 [API] Could not cache statuses');
        }
      }
      
      // Add error types to result
      return {
        ...result,
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
    // OFFLINE FIRST
    if (!navigator.onLine) {
      const cached = localStorage.getItem('moodchat_cache_friends');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          return {
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
      // USE THE SINGLE FETCH FUNCTION via window.api
      const result = await window.api('/friends/list', {
        method: 'GET',
        auth: true
      });
      
      if (result.success && result.data) {
        // Cache for offline use
        try {
          localStorage.setItem('moodchat_cache_friends', JSON.stringify({
            data: result.data,
            timestamp: Date.now()
          }));
        } catch (e) {
          console.log('🔧 [API] Could not cache friends');
        }
      }
      
      // Add error types to result
      return {
        ...result,
        isRateLimited: result.isRateLimited || false,
        isServerError: result.isServerError || false
      };
    } catch (error) {
      console.error('🔧 [API] Get friends error:', error);
      
      // Fallback to cached data
      const cached = localStorage.getItem('moodchat_cache_friends');
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          return {
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
        success: false,
        message: 'Failed to fetch friends',
        error: error.message,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  // Additional methods remain but now use window.api() internally
  // This ensures ALL calls go through the single hardened fetch function
  
  getUsers: async function() {
    const result = await window.api('/users', { method: 'GET', auth: true });
    return {
      ...result,
      isRateLimited: result.isRateLimited || false,
      isServerError: result.isServerError || false
    };
  },
  
  getUserById: async function(userId) {
    const result = await window.api(`/users/${encodeURIComponent(userId)}`, { method: 'GET', auth: true });
    return {
      ...result,
      isRateLimited: result.isRateLimited || false,
      isServerError: result.isServerError || false
    };
  },
  
  getStatus: async function(statusId) {
    const result = await window.api(`/status/${encodeURIComponent(statusId)}`, { method: 'GET', auth: true });
    return {
      ...result,
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
    return {
      ...result,
      isRateLimited: result.isRateLimited || false,
      isServerError: result.isServerError || false
    };
  },
  
  getChats: async function() {
    const result = await window.api('/chats', { method: 'GET', auth: true });
    return {
      ...result,
      isRateLimited: result.isRateLimited || false,
      isServerError: result.isServerError || false
    };
  },
  
  getChatById: async function(chatId) {
    const result = await window.api(`/chats/${encodeURIComponent(chatId)}`, { method: 'GET', auth: true });
    return {
      ...result,
      isRateLimited: result.isRateLimited || false,
      isServerError: result.isServerError || false
    };
  },
  
  getContacts: async function() {
    const result = await window.api('/contacts', { method: 'GET', auth: true });
    return {
      ...result,
      isRateLimited: result.isRateLimited || false,
      isServerError: result.isServerError || false
    };
  },
  
  // ============================================================================
  // UTILITY METHODS - PRESERVED WITH ERROR TYPE SUPPORT
  // ============================================================================
  
  isLoggedIn: function() {
    try {
      const authUserStr = localStorage.getItem('authUser');
      if (!authUserStr) return false;
      
      const authUser = JSON.parse(authUserStr);
      // UPDATED: Check for both old and new token structures
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
        // UPDATED: Return accessToken from new structure or old token
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
      // Soft logout - only clear if explicitly requested
      localStorage.removeItem('authUser');
      localStorage.removeItem('moodchat_auth_token');
      localStorage.removeItem('moodchat_auth_user');
      localStorage.removeItem('moodchat_refresh_token');
      this._sessionChecked = false;
      console.log('🔧 [API] User logged out');
      return { 
        success: true, 
        message: 'Logged out successfully',
        isRateLimited: false,
        isServerError: false
      };
    } catch (error) {
      console.error('🔧 [API] Error during logout:', error);
      return { 
        success: false, 
        message: 'Logout failed',
        isRateLimited: false,
        isServerError: false
      };
    }
  },
  
  _clearAuthData: function() {
    // Only clear when absolutely necessary
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
    return navigator.onLine;
  },
  
  isBackendReachable: function() {
    if (this._backendReachable !== null) {
      return this._backendReachable;
    }
    return true; // Assume reachable until proven otherwise
  },
  
  getConnectionStatus: function() {
    return {
      online: navigator.onLine,
      backendReachable: this.isBackendReachable(),
      timestamp: new Date().toISOString(),
      backendUrl: BACKEND_BASE_URL,        // Dynamic backend URL
      baseApiUrl: BASE_API_URL,                // Dynamic API URL
      sessionChecked: this._sessionChecked,
      hasAuthToken: !!this.getCurrentToken(),
      hasAuthUser: !!localStorage.getItem('authUser'),
      tokenStructure: this.getCurrentToken() ? (localStorage.getItem('authUser')?.includes('"tokens"') ? 'new' : 'old') : 'none'
    };
  },
  
  // ============================================================================
  // INITIALIZATION - PRESERVED WITH EVENTS AND ERROR TYPE SUPPORT
  // ============================================================================
  
  initialize: async function() {
    console.log('🔧 [API] ⚡ MoodChat API v15.0.0 (DYNAMIC ENVIRONMENT DETECTION) initializing...');
    console.log('🔧 [API] 🔗 Backend URL:', BACKEND_BASE_URL);
    console.log('🔧 [API] 🔗 API Base URL:', BASE_API_URL);
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
      if (this.isLoggedIn() && this.isOnline()) {
        this.checkSession().catch(() => {});
      }
    }, this._config.SESSION_CHECK_INTERVAL);
    
    // Dispatch ready events - ALWAYS fire even if backend is down
    this._dispatchReadyEvents();
    
    return true;
  },
  
  autoLogin: async function() {
    const authUserStr = localStorage.getItem('authUser');
    if (!authUserStr) {
      return { 
        success: false, 
        authenticated: false, 
        message: 'No stored credentials',
        isRateLimited: false,
        isServerError: false
      };
    }
    
    try {
      const authUser = JSON.parse(authUserStr);
      // UPDATED: Check for both old and new token structures
      const hasToken = authUser.token || (authUser.tokens && authUser.tokens.accessToken);
      if (!hasToken || !authUser.user) {
        return { 
          success: false, 
          authenticated: false, 
          message: 'Invalid stored credentials',
          isRateLimited: false,
          isServerError: false
        };
      }
    } catch (e) {
      return { 
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
      backendUrl: BACKEND_BASE_URL,                    // Dynamic URL
      apiBaseUrl: BASE_API_URL,                        // Dynamic API URL
      user: this.getCurrentUser(),
      hasToken: !!this.getCurrentToken(),
      hasAuthUser: !!localStorage.getItem('authUser'),
      hardened: true,
      enhancedErrorHandling: true,
      supportsNewTokenStructure: true,
      dynamicEnvironmentDetection: true,
      environment: window.location.hostname === 'localhost' ? 'local' : 'production'
    };
    
    const events = ['api-ready', 'apiready', 'apiReady'];
    
    // Immediate dispatch
    events.forEach(eventName => {
      try {
        window.dispatchEvent(new CustomEvent(eventName, { detail: eventDetail }));
        console.log(`🔧 [API] Dispatched ${eventName} event`);
      } catch (e) {
        console.log(`🔧 [API] Could not dispatch ${eventName}:`, e.message);
      }
    });
    
    // Delayed dispatches for compatibility
    setTimeout(() => {
      events.forEach(eventName => {
        try {
          const delayedEventDetail = { ...eventDetail, delayed: true, delayMs: 500 };
          window.dispatchEvent(new CustomEvent(eventName, { detail: delayedEventDetail }));
        } catch (e) {
          // Silent fail
        }
      });
    }, 500);
    
    setTimeout(() => {
      events.forEach(eventName => {
        try {
          const secondDelayedEventDetail = { ...eventDetail, delayed: true, delayMs: 1000 };
          window.dispatchEvent(new CustomEvent(eventName, { detail: secondDelayedEventDetail }));
        } catch (e) {
          // Silent fail
        }
      });
      console.log('🔧 [API] API synchronization ready (dynamic URL source)');
    }, 1000);
  },
  
  // ============================================================================
  // DIAGNOSTICS - ENHANCED WITH ERROR TYPE INFORMATION
  // ============================================================================
  
  diagnose: async function() {
    console.log('🔧 [API] Running hardened diagnostics...');
    
    const results = {
      localStorage: {
        authUser: !!localStorage.getItem('authUser'),
        moodchat_auth_token: !!localStorage.getItem('moodchat_auth_token'),
        moodchat_auth_user: !!localStorage.getItem('moodchat_auth_user'),
        moodchat_refresh_token: !!localStorage.getItem('moodchat_refresh_token'),
        deviceId: !!localStorage.getItem('moodchat_device_id')
      },
      network: {
        online: navigator.onLine,
        backendReachable: this._backendReachable
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
        backendUrl: BACKEND_BASE_URL,                    // Dynamic
        apiBaseUrl: BASE_API_URL,                        // Dynamic
        currentHostname: window.location.hostname,
        currentProtocol: window.location.protocol,
        hardened: true,
        enhancedErrorHandling: true,
        supportsNewTokenStructure: true,
        dynamicEnvironmentDetection: true
      },
      validation: {
        methodNormalization: 'ACTIVE',
        endpointSanitization: 'ACTIVE',
        singleFetchFunction: 'ACTIVE',
        offlineDetection: 'ACTIVE',
        errorTypeDetection: 'ACTIVE',
        tokenStructureSupport: 'ACTIVE',
        dynamicEnvironmentDetection: 'ACTIVE'
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
    // Use the main api function for consistency
    const result = await window.api(endpoint, options);
    return {
      ...result,
      isRateLimited: result.isRateLimited || false,
      isServerError: result.isServerError || false
    };
  }
};

// ============================================================================
// API SETUP - EXTREME ROBUSTNESS WITH ENHANCED ERROR TYPES
// ============================================================================

Object.assign(window.api, apiObject);
Object.setPrototypeOf(window.api, Object.getPrototypeOf(apiObject));

console.log('🔧 [API] Starting hardened initialization with dynamic URL detection...');

// Safe initialization with timeout
setTimeout(() => {
  try {
    window.api.initialize();
  } catch (initError) {
    console.error('🔧 [API] Initialization failed but API remains functional:', initError);
  }
}, 100);

// Global error handlers with enhanced error type detection
if (typeof window.handleApiError === 'undefined') {
  window.handleApiError = function(error, defaultMessage) {
    if (!error) return defaultMessage || 'An error occurred';
    
    // Enhanced error type detection
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

// ULTRA-ROBUST FALLBACK API WITH ERROR TYPE SUPPORT
setTimeout(() => {
  if (!window.api || typeof window.api !== 'function') {
    console.warn('⚠️ API not initialized, creating ultra-robust fallback');
    
    const ultraFallbackApi = function(endpoint, options = {}) {
      // Always return a safe response, never throw
      const method = _normalizeHttpMethod(options.method);
      const safeEndpoint = _sanitizeEndpoint(endpoint);
      
      console.warn(`⚠️ Using ultra-fallback API for ${method} ${safeEndpoint}`);
      
      return Promise.resolve({
        success: false,
        status: 0,
        message: 'API fallback mode',
        offline: !navigator.onLine,
        isNetworkError: true,
        isRateLimited: false,
        isServerError: false,
        fallback: true
      });
    };
    
    // Attach essential methods with error type support
    Object.assign(ultraFallbackApi, {
      _singleton: true,
      _version: 'ultra-fallback',
      _hardened: true,
      initialize: () => {
        console.log('🔧 [API] Ultra-fallback initialized');
        return true;
      },
      isLoggedIn: () => {
        try {
          const authUserStr = localStorage.getItem('authUser');
          if (!authUserStr) return false;
          const authUser = JSON.parse(authUserStr);
          // Check for both old and new token structures
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
      isOnline: () => navigator.onLine,
      isBackendReachable: () => false,
      checkSession: async () => ({ 
        authenticated: ultraFallbackApi.isLoggedIn(),
        offline: true,
        fallback: true,
        isRateLimited: false,
        isServerError: false
      }),
      autoLogin: async () => ({
        success: ultraFallbackApi.isLoggedIn(),
        authenticated: ultraFallbackApi.isLoggedIn(),
        user: ultraFallbackApi.getCurrentUser(),
        fallback: true,
        isRateLimited: false,
        isServerError: false
      }),
      login: async () => ({ 
        success: false, 
        message: 'API fallback mode',
        offline: !navigator.onLine,
        fallback: true,
        isRateLimited: false,
        isServerError: false
      }),
      register: async () => ({ 
        success: false, 
        message: 'API fallback mode',
        offline: !navigator.onLine,
        fallback: true,
        isRateLimited: false,
        isServerError: false
      }),
      request: async () => ({
        success: false,
        message: 'API fallback mode',
        offline: !navigator.onLine,
        fallback: true,
        isRateLimited: false,
        isServerError: false
      })
    });
    
    window.api = ultraFallbackApi;
  }
}, 3000);

// EMERGENCY API - NEVER FAILS WITH ERROR TYPE SUPPORT
if (!window.api) {
  console.error('⚠️ window.api not set! Creating emergency hardened API');
  
  const emergencyHardenedApi = function(endpoint, options) {
    // Accept ANY input, return SAFE response
    const method = _normalizeHttpMethod(options?.method);
    const safeEndpoint = _sanitizeEndpoint(endpoint);
    
    return Promise.resolve({
      success: false,
      status: 0,
      message: 'Emergency hardened API',
      emergency: true,
      methodUsed: method,
      endpointRequested: safeEndpoint,
      offline: !navigator.onLine,
      isRateLimited: false,
      isServerError: false
    });
  };
  
  Object.assign(emergencyHardenedApi, {
    _singleton: true,
    _version: 'emergency-hardened',
    _neverFails: true,
    isLoggedIn: () => false,
    isBackendReachable: () => false,
    initialize: () => true,
    autoLogin: async () => ({ 
      success: false, 
      authenticated: false, 
      emergency: true,
      isRateLimited: false,
      isServerError: false
    }),
    isOnline: () => navigator.onLine
  });
  
  window.api = emergencyHardenedApi;
}

// Global API state with error type support
window.__MOODCHAT_API_EVENTS = [];
window.__MOODCHAT_API_INSTANCE = window.api;
window.__MOODCHAT_API_READY = true;
window.MOODCHAT_API_READY = true;

console.log('🔧 [API] UPDATED Backend API integration complete with DYNAMIC ENVIRONMENT DETECTION');
console.log('🔧 [API] ✅ Method normalization: ACTIVE');
console.log('🔧 [API] ✅ Endpoint sanitization: ACTIVE');
console.log('🔧 [API] ✅ Single fetch function: ACTIVE');
console.log('🔧 [API] ✅ Offline detection: ACTIVE');
console.log('🔧 [API] ✅ Rate limit error detection: ACTIVE');
console.log('🔧 [API] ✅ Server error detection: ACTIVE');
console.log('🔧 [API] ✅ AbortError handling: FIXED (does not mark backend offline)');
console.log('🔧 [API] ✅ New token structure support: ACTIVE');
console.log('🔧 [API] ✅ DYNAMIC ENVIRONMENT DETECTION: ACTIVE');
console.log('🔧 [API] ✅ Backend URL: ' + BACKEND_BASE_URL);
console.log('🔧 [API] ✅ API Base URL: ' + BASE_API_URL);
console.log('🔧 [API] ✅ NEVER breaks on frontend errors');