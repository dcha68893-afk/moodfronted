// api.core.js - ENHANCED API GATEWAY WITH SECURITY & CROSS-ENVIRONMENT SUPPORT
// Version: 23.0.8 - FIXED: Session persistence, token restoration on reload
// Date: 2024-06-21
// CRITICAL: Single token source, localStorage persistence, guaranteed auth headers

// ============================================================================
// MODULE-LEVEL DECLARATIONS (MUST BE OUTSIDE IIFE FOR EXPORTS)
// ============================================================================

// Core gateway functions
let ApiGateway;
let gateway;
let initializeGateway;
let setEnvironment;
let getEnvironment;
let getBaseUrl;
let setBaseUrl;
let detectEnvironment;

// Fetch wrapper with timeout, retry, caching, fallback
let fetchWithTimeout;
let fetchWithRetry;
let fetchWithCache;
let fetchWithFallback;
let fetchDedupe;
let secureRequest;
let requestWithAbort;
let createAbortController;
let abortRequest;
let abortAllRequests;

// Error normalization
let ApiError;
let KnectaError;
let ApiGatewayError;
let NetworkError;
let SessionError;
let AuthError;
let ValidationError;
let normalizeError;
let isApiError;
let createError;
let formatErrorMessage;
let getErrorStatusCode;
let getErrorCode;
let isNetworkError;
let isTimeoutError;
let isAuthError;
let isServerError;
let isClientError;
let isRateLimitError;

// Token security - SINGLE SOURCE OF TRUTH
let AUTH_TOKEN = null;
let TOKEN_READY = false;

let TokenManager;
let SecureStorage;
let encryptToken;
let decryptToken;
let secureGetToken;
let secureSetToken;
let secureClearToken;
let isTokenExpired;
let refreshTokenIfNeeded;
let getTokenExpiryTime;
let setTokenWithExpiry;
let clearExpiredTokens;
let migrateLegacyTokens;
let validateTokenFormat;
let sanitizeToken;

// NEW TOKEN FUNCTIONS - Add declarations here
let ensureToken;
let waitForToken;
let guardedRequest;
let patch;
let head;
let options;

// Environment configuration
let ENVIRONMENTS;
let CURRENT_ENVIRONMENT;
let BASE_URLS;
let ACTIVE_BASE_URL;
let ENVIRONMENT_DETECTION_RULES;
let getEnvironmentDisplayName;
let isProduction;
let isDevelopment;
let isDemo;
let isLocalhost;
let isRenderDeployment;

// Cache management
let CacheManager;
let memoryCache;
let persistentCache;
let clearCache;
let getCacheKey;
let setCacheItem;
let getCacheItem;
let deleteCacheItem;
let pruneCache;
let cacheStats;

// Request queue
let RequestQueue;
let queueRequest;
let processQueue;
let getQueueStatus;
let clearQueue;
let pauseQueue;
let resumeQueue;

// Request deduplication map
const pendingRequests = new Map();

// Original exports - all preserved
let requestSession;
let getAnalyticsData;
let markChatAsRead;
let isSessionValid;
let formatTimeAgo;
let exportAnalytics;
let getUserToken;
let setUserToken;
let clearUserToken;
let getCurrentUser;
let setUserData;
let clearAllAuthData;
let tokenReady;
let secureFetch;
let secureApiFetch;
let getValidToken;
let getAuthHeaders;
let isPublicEndpoint;
let isAuthEndpoint;
let isStatusEndpoint;
let getTrustScoreDescription;
let navigateToCall;
let getUserFriends;
let navigateToChat;
let getUserGroups;
let showNotification;
let inviteTeamMember;
let acceptGroupInvite;
let getMessageTypes;
let simulateContactSync;
let trackEvent;
let generateSampleMoodData;
let request;
let apiCallWithRetry;
let updateTeamMemberRole;
let validateAuth;
let updateGlobalAccessToken;
let handleUnauthorizedAccess;
let determineBackendUrl;
let getApiBaseUrl;
let validateSession;
let updateSession;
let getUserData;
let initializeTokenSystem;
let updateCurrentUser;
let getBackendBaseUrl;
let isAuthenticated;
let getSessionData;
let clearSession;
let setSessionData;
let getToken;
let setToken;
let login;
let logout;
let getTeamMembers;
let getTrustScoreClass;
let getSession;
let api;
let register;
let forgotPassword;
let resetPassword;
let refreshToken;
let checkAuth;
let checkAuthMe;
let getProfile;
let updateProfile;
let changePassword;
let deleteAccount;
let getOnlineUsers;
let searchUsers;
let sendFriendRequest;
let acceptFriendRequest;
let rejectFriendRequest;
let removeFriend;
let getFriends;
let getFriendRequests;
let getConversations;
let getMessages;
let sendMessage;
let markMessagesAsRead;
let deleteMessage;
let clearChatHistory;
let createGroup;
let getGroups;
let getGroupDetails;
let updateGroup;
let deleteGroup;
let addGroupMember;
let removeGroupMember;
let leaveGroup;
let getNotifications;
let markNotificationAsRead;
let deleteNotification;
let clearAllNotifications;
let getCallHistory;
let startCall;
let endCall;
let getSettings;
let updateSettings;
let uploadFile;
let deleteFile;
let getFile;
let checkNetworkStatus;
let debounce;
let throttle;
let generateId;
let formatDate;
let formatTime;
let emit;
let on;
let off;
let once;
let apiRequest;
let apiGet;
let apiPost;
let apiPut;
let apiDelete;
let apiCall;
let initSession;
let callApi;
let escapeHtml;
let simulateIncomingCall;
let apiCore;
let get;
let post;
let put;
let del;
let sendToIframe;
let broadcastToParent;
let waitForReady;
let isCoreReady;
let getRequestQueueStatus;
let registerIframe;
let unregisterIframe;
let getIframeStatus;
let broadcastToAllIframes;

// CHAT FUNCTIONS - DECLARED ONCE
let openChat;
let closeChat;
let minimizeChat;
let maximizeChat;
let sendChatMessage;
let getChatHistory;
let getUnreadCount;

// ============================================================================
// [FIX] SINGLE TOKEN SOURCE - WITH SOURCE TRACKING AND PERSISTENCE
// ============================================================================

// Flag to prevent recursive token setting
let _isSettingToken = false;
let _lastTokenSource = null;
let _tokenSetCount = 0;
let _tokenFromApiLogged = false;
let _authHeaderLogged = false;
let _401logged = false;
let _loginSuccessLogged = false;

// Storage key for auth data
const AUTH_STORAGE_KEY = 'kynecta_auth';

/**
 * Safely get token from localStorage with error handling
 * @private
 * @returns {string|null} Token or null
 */
function _getTokenFromStorage() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!stored) return null;
        
        const parsed = JSON.parse(stored);
        if (parsed && parsed.token && typeof parsed.token === 'string') {
            // Validate token format (basic check)
            if (parsed.token.length > 20) {
                return parsed.token;
            }
        }
        return null;
    } catch (error) {
        // Log warning but don't crash
        console.warn('[API] Failed to parse stored auth data:', error.message);
        // Attempt to clear corrupted data
        try {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        } catch (e) {}
        return null;
    }
}

/**
 * Safely get user from localStorage with error handling
 * @private
 * @returns {Object|null} User data or null
 */
function _getUserFromStorage() {
    try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!stored) return null;
        
        const parsed = JSON.parse(stored);
        if (parsed && parsed.user && typeof parsed.user === 'object') {
            return parsed.user;
        }
        return null;
    } catch (error) {
        console.warn('[API] Failed to parse stored user data:', error.message);
        return null;
    }
}

/**
 * Save auth data to localStorage
 * @private
 * @param {string} token - Authentication token
 * @param {Object} user - User data
 * @returns {boolean} Success status
 */
function _saveAuthToStorage(token, user = null) {
    try {
        if (!token || typeof token !== 'string') return false;
        
        const authData = {
            token: token,
            user: user || getCurrentUser() || null,
            timestamp: Date.now(),
            version: '23.0.8'
        };
        
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
        
        // console.log('[Auth Debug] Token saved to storage:', token.substring(0, 10) + '...');
        return true;
    } catch (error) {
        console.error('[API] Failed to save auth data:', error.message);
        return false;
    }
}

/**
 * Clear auth data from localStorage
 * @private
 * @returns {boolean} Success status
 */
function _clearAuthFromStorage() {
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return true;
    } catch (error) {
        console.error('[API] Failed to clear auth data:', error.message);
        return false;
    }
}

/**
 * Set authentication token - SINGLE SOURCE OF TRUTH
 * @param {string} token - JWT token
 * @param {boolean} skipManager - Skip TokenManager update to prevent recursion
 * @param {string} source - Source module/file that triggered the token set
 * @returns {boolean} Success status
 */
setUserToken = function(token, skipManager = false, source = 'unknown') {
    // Prevent recursive calls
    if (_isSettingToken) {
        if (source !== 'TokenManager.internal') {
            console.warn(`[API] Token set prevented - recursion detected from ${source}`);
        }
        return false;
    }
    
    try {
        if (!token || typeof token !== 'string') {
            console.warn(`[API] Invalid token rejected from ${source}`);
            return false;
        }
        
        _isSettingToken = true;
        
        // Sanitize token
        const sanitizedToken = token
            .toString()
            .trim()
            .replace(/[\n\r\t\0\x00-\x1F]/g, '')
            .replace(/\s+/g, '')
            .replace(/[^\w\-\.]/g, '');
        
        // Only update if token actually changed
        const tokenChanged = AUTH_TOKEN !== sanitizedToken;
        
        if (!tokenChanged) {
            _isSettingToken = false;
            return true; // Token unchanged, no need to log
        }
        
        AUTH_TOKEN = sanitizedToken;
        TOKEN_READY = true;
        _tokenSetCount++;
        
        // Save to localStorage for persistence
        _saveAuthToStorage(sanitizedToken);
        
        // Update TokenManager for backward compatibility - but skip if called from TokenManager
        if (!skipManager && TokenManager && typeof TokenManager._setTokenInternal === 'function') {
            TokenManager._setTokenInternal(sanitizedToken);
        }
        
        // Update global token for iframe compatibility
        if (typeof window !== 'undefined') {
            window.__GLOBAL_TOKEN = sanitizedToken;
        }
        
        // Update request queue dependency
        if (RequestQueue && typeof RequestQueue.updateDependency === 'function') {
            RequestQueue.updateDependency('tokenReady', true);
        }
        
        // Dispatch event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('token-stored', {
                detail: {
                    timestamp: new Date().toISOString(),
                    source: source,
                    hasToken: true,
                    setCount: _tokenSetCount
                }
            }));
        }
        
        // Log token success ONCE per actual token change with source
        console.log(`[API] 🔐 Token #${_tokenSetCount} set by: ${source}`);
        
        // Log source change if different from last
        if (_lastTokenSource !== source) {
            console.log(`[API] Token source changed: ${_lastTokenSource || 'initial'} → ${source}`);
            _lastTokenSource = source;
        }
        
        _isSettingToken = false;
        return true;
        
    } catch (error) {
        _isSettingToken = false;
        console.error(`[API] ✗ Set token error from ${source}:`, error.message);
        return false;
    }
};

/**
 * Get authentication token - SINGLE SOURCE OF TRUTH
 * @param {string} caller - Optional caller for debugging
 * @returns {string|null} Token or null
 */
getUserToken = function(caller = 'unknown') {
    // If we have AUTH_TOKEN in memory, return it
    if (AUTH_TOKEN) {
        // console.log('[Auth Debug] Token from memory:', AUTH_TOKEN.substring(0, 10) + '...');
        return AUTH_TOKEN;
    }
    
    // Fallback to localStorage if memory is empty
    const storedToken = _getTokenFromStorage();
    if (storedToken) {
        // Restore to memory
        AUTH_TOKEN = storedToken;
        TOKEN_READY = true;
        // console.log('[Auth Debug] Token restored from storage:', storedToken.substring(0, 10) + '...');
        return storedToken;
    }
    
    // NO FALLBACKS - if we don't have token, return null
    return null;
};

/**
 * Clear authentication token
 * @param {string} source - Source module/file that triggered the clear
 * @returns {boolean} Success status
 */
clearUserToken = function(source = 'unknown') {
    try {
        // Skip if already cleared
        if (AUTH_TOKEN === null && TOKEN_READY === false) {
            return true;
        }
        
        const hadToken = !!AUTH_TOKEN;
        const lastToken = AUTH_TOKEN ? AUTH_TOKEN.substring(0, 10) + '...' : 'none';
        
        AUTH_TOKEN = null;
        TOKEN_READY = false;
        
        // Clear from localStorage
        _clearAuthFromStorage();
        
        // Clear TokenManager
        if (TokenManager && typeof TokenManager._clearTokenInternal === 'function') {
            TokenManager._clearTokenInternal();
        }
        
        // Clear global token
        if (typeof window !== 'undefined') {
            window.__GLOBAL_TOKEN = null;
        }
        
        // Update request queue dependency
        if (RequestQueue && typeof RequestQueue.updateDependency === 'function') {
            RequestQueue.updateDependency('tokenReady', false);
        }
        
        // Dispatch event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('token-cleared', {
                detail: {
                    timestamp: new Date().toISOString(),
                    source: source,
                    hadToken: hadToken
                }
            }));
        }
        
        // Log token clear if we actually cleared something
        if (hadToken) {
            console.log(`[API] 🔓 Token cleared by: ${source} (was: ${lastToken})`);
        }
        
        return true;
        
    } catch (error) {
        console.error(`[API] ✗ Clear token error from ${source}:`, error.message);
        return false;
    }
};

/**
 * Restore token from storage on module load
 * @returns {boolean} True if token was restored
 */
function _restoreTokenFromStorage() {
    const token = _getTokenFromStorage();
    if (token) {
        AUTH_TOKEN = token;
        TOKEN_READY = true;
        
        // Restore user data if available
        const user = _getUserFromStorage();
        if (user && !getCurrentUser()) {
            // Will be set via setUserData if available
            if (typeof setUserData === 'function') {
                setUserData(user, true);
            }
        }
        
        // console.log('[Auth Debug] Token auto-restored on load');
        return true;
    }
    return false;
}

// Legacy aliases for backward compatibility
getToken = function(caller) { return getUserToken(caller || 'legacy'); };
setToken = function(token, source) { return setUserToken(token, false, source || 'legacy'); };
secureGetToken = getUserToken;
secureSetToken = setUserToken;
secureClearToken = clearUserToken;
getValidToken = getUserToken;

/**
 * Ensure token exists before request - THROWS if no token
 * @throws {Error} If no token available
 */
ensureToken = function() {
    const token = getUserToken('ensureToken');
    if (!token) {
        throw new KnectaError(
            '[API] No auth token — request blocked',
            401,
            'NO_TOKEN',
            { timestamp: new Date().toISOString() }
        );
    }
};

/**
 * Wait for token to be ready
 * @returns {Promise<void>}
 */
waitForToken = async function() {
    if (TOKEN_READY && AUTH_TOKEN) return;
    
    return new Promise((resolve, reject) => {
        // Set timeout to prevent infinite waiting
        const timeout = setTimeout(() => {
            clearInterval(interval);
            reject(new KnectaError(
                'Token ready timeout',
                408,
                'TOKEN_TIMEOUT'
            ));
        }, 10000); // 10 second timeout
        
        const interval = setInterval(() => {
            if (TOKEN_READY && AUTH_TOKEN) {
                clearInterval(interval);
                clearTimeout(timeout);
                resolve();
            }
        }, 50);
    });
};

/**
 * Guarded request with token wait
 * @param {string} url - Request URL
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response
 */
guardedRequest = async function(url, options = {}) {
    // Wait for token if this endpoint requires auth
    const endpointPath = url.startsWith('http') ? new URL(url).pathname : url;
    const isPublic = isPublicEndpoint(endpointPath);
    const isAuth = isAuthEndpoint(endpointPath);
    const isStatus = isStatusEndpoint(endpointPath);
    
    if (!(options.auth === false || isPublic || isAuth || isStatus)) {
        await waitForToken();
    }
    
    return secureApiFetch(url, options);
};

// ============================================================================
// [FIX] CORE: secureApiFetch - Single Source of Truth with Token Guard
// ============================================================================

const DEFAULT_TIMEOUT = 30000; // 30 seconds

const abortControllers = new Map();

/**
 * Secure API fetch with guaranteed token validation
 * @param {string} url - Endpoint or full URL
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Normalized response
 */
secureApiFetch = async function(url, options = {}) {
    // Track request for debugging
    const requestStartTime = Date.now();
    const requestId = options.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        // Validate endpoint
        if (url === 'GET' || url === 'POST' || url === 'PUT' || 
            url === 'PATCH' || url === 'DELETE' || url === 'HEAD' ||
            url === 'OPTIONS') {
            throw new KnectaError(
                'HTTP method cannot be used as endpoint',
                400,
                'INVALID_ENDPOINT',
                { method: url }
            );
        }
        
        if (!url || typeof url !== 'string') {
            throw new KnectaError(
                'Endpoint must be a string',
                400,
                'INVALID_ENDPOINT',
                { received: typeof url }
            );
        }
        
        // Check if core is ready, if not queue the request
        if (SAIC.currentState !== SAIC.STATES.READY && !options.skipQueue) {
            console.debug('[API] Core not ready, queueing request:', url);
            return new Promise((resolve, reject) => {
                RequestQueue.add(
                    () => secureApiFetch(url, { ...options, skipQueue: true }),
                    {
                        endpoint: url,
                        requiresAuth: options.auth !== false && !isPublicEndpoint(url),
                        priority: options.priority || 0,
                        dependencies: ['config', 'environment', 'tokenReady']
                    }
                ).then(resolve).catch(reject);
            });
        }
        
        // Build full URL
        let fullUrl;
        let endpointPath;
        
        if (url.startsWith('http://') || url.startsWith('https://')) {
            fullUrl = url;
            try {
                const urlObj = new URL(url);
                endpointPath = urlObj.pathname;
            } catch (e) {
                endpointPath = url;
            }
        } else {
            const baseUrl = getBaseUrl();
            const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
            const cleanEndpoint = url.startsWith('/') ? url : '/' + url;
            fullUrl = cleanBase + cleanEndpoint;
            endpointPath = cleanEndpoint;
        }
        
        // SECURITY: Validate endpoint to prevent unsafe access
        const baseUrl = getBaseUrl();
        if (!isValidEndpoint(fullUrl, baseUrl)) {
            throw new KnectaError(
                'Invalid or unsafe endpoint',
                403,
                'SECURITY_VIOLATION',
                { url: fullUrl, baseUrl }
            );
        }
        
        // SECURITY: Enforce HTTPS in production
        if (isProduction() && fullUrl.startsWith('http://')) {
            console.warn('[API-SECURITY] Upgrading HTTP to HTTPS in production');
            fullUrl = fullUrl.replace('http://', 'https://');
        }
        
        const method = (options.method || 'GET').toUpperCase();
        
        // Determine if this endpoint requires authentication
        const isPublic = isPublicEndpoint(endpointPath);
        const isAuth = isAuthEndpoint(endpointPath);
        const isStatus = isStatusEndpoint(endpointPath);
        
        const requiresAuth = !(options.auth === false || isPublic || isAuth || isStatus);
        
        // [FIX] CRITICAL: Wait for token if required
        if (requiresAuth) {
            await waitForToken();
            ensureToken();
        }
        
        // Prepare fetch options
        const fetchOptions = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...options.headers
            },
            credentials: options.credentials || 'include',
            mode: options.mode || 'cors',
            cache: options.cache || 'default',
            redirect: options.redirect || 'follow',
            referrerPolicy: options.referrerPolicy || 'strict-origin-when-cross-origin'
        };
        
        // [FIX] Add Authorization header if token exists and endpoint requires auth
        if (requiresAuth) {
            const token = getUserToken('secureApiFetch');
            if (token) {
                fetchOptions.headers['Authorization'] = `Bearer ${token}`;
                
                // Log first time only
                if (!_authHeaderLogged) {
                    console.log(`[API] 🔐 Auth header attached for: ${endpointPath}`);
                    _authHeaderLogged = true;
                    
                    // Reset after 1 minute to allow one more log if needed
                    setTimeout(() => {
                        _authHeaderLogged = false;
                    }, 60000);
                }
            }
        }
        
        // Handle request body
        if (options.body) {
            if (options.body instanceof FormData) {
                fetchOptions.body = options.body;
                delete fetchOptions.headers['Content-Type'];
            } else if (typeof options.body === 'string') {
                fetchOptions.body = options.body;
            } else {
                try {
                    fetchOptions.body = JSON.stringify(options.body);
                } catch (e) {
                    throw new KnectaError(
                        'Failed to stringify request body',
                        400,
                        'INVALID_BODY',
                        { originalError: e.message }
                    );
                }
            }
        }
        
        // Execute request with timeout
        let response;
        try {
            const controller = createAbortController(requestId);
            const timeoutId = setTimeout(() => {
                controller.abort();
                abortControllers.delete(requestId);
            }, options.timeout || DEFAULT_TIMEOUT);
            
            try {
                response = await fetch(fullUrl, {
                    ...fetchOptions,
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timeoutId);
                abortControllers.delete(requestId);
            }
        } catch (fetchError) {
            // Handle abort/timeout errors
            if (fetchError.name === 'AbortError') {
                const timeoutError = new KnectaError(
                    `Request timeout after ${options.timeout || DEFAULT_TIMEOUT}ms`,
                    408,
                    'TIMEOUT_ERROR',
                    { url: fullUrl, timeout: options.timeout || DEFAULT_TIMEOUT, requestId }
                );
                throw timeoutError;
            }
            
            console.warn('[API] Fetch error:', fetchError.message, { url: fullUrl, requestId });
            const normalizedError = normalizeError(fetchError, `Request failed: ${url}`);
            throw normalizedError;
        }
        
        const requestDuration = Date.now() - requestStartTime;
        
        // Parse response data
        let data = null;
        const contentType = response.headers.get('content-type');
        let responseText = null;
        
        try {
            responseText = await response.text();
        } catch (textError) {
            console.warn('[API] Failed to read response text', textError);
            responseText = '';
        }
        
        // Enhanced handling for login endpoints
        const isLoginEndpoint = endpointPath.includes('/auth/login') || 
                               endpointPath.includes('/login') ||
                               (options && options._isLogin);
        
        if (isLoginEndpoint) {
            let parsed = safeJsonParse(responseText, null);
            
            if (parsed === null && responseText && typeof responseText === 'string') {
                const trimmed = responseText.trim();
                
                if (trimmed.length > 20 && (trimmed.includes('.') || /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(trimmed))) {
                    parsed = {
                        success: true,
                        token: trimmed,
                        message: "Login successful",
                        _fromPlainText: true
                    };
                } 
                else if (trimmed.toLowerCase().includes('success') || 
                         trimmed.toLowerCase().includes('welcome') ||
                         trimmed.toLowerCase().includes('logged in')) {
                    parsed = {
                        success: true,
                        message: trimmed,
                        _fromPlainText: true
                    };
                }
            }
            
            if (parsed !== null) {
                data = parsed;
            } else {
                data = {};
            }
        } else {
            if (contentType && contentType.includes('application/json')) {
                data = safeJsonParse(responseText, {});
                if (data === null || data === undefined) {
                    data = {};
                }
            } else {
                data = safeJsonParse(responseText, null);
                
                if (data === null) {
                    data = {
                        message: responseText || (response.ok ? 'Success' : 'Request failed'),
                        _contentType: contentType || 'unknown'
                    };
                }
            }
        }
        
        // Ensure data is always an object
        if (data === null || data === undefined) {
            data = {};
        }
        if (typeof data !== 'object') {
            data = { value: data };
        }
        
        // Handle token extraction for successful responses - UPDATE SINGLE SOURCE
        if (response.ok && data) {
            const token = data.token || 
                        data.accessToken || 
                        data.jwt || 
                        data.access_token ||
                        (data.tokens && data.tokens.accessToken) ||
                        (data.data && data.data.token) ||
                        (data.data && data.data.accessToken);
            
            if (token && typeof token === 'string') {
                // Update single source of truth - skip TokenManager to prevent recursion
                setUserToken(token, true, 'api.response');
                
                RequestQueue.updateDependency('tokenReady', true);
                
                // Log token from API response (once)
                if (!_tokenFromApiLogged) {
                    console.log(`[API] ✅ Token received from ${endpointPath}`);
                    _tokenFromApiLogged = true;
                }
            }
            
            const user = data.user || 
                       (data.data && data.data.user) || 
                       (data.data && !data.data.token ? data.data : null);
            
            if (user && setUserData) {
                setUserData(user, true);
                // Also save user to storage
                const currentToken = getUserToken();
                if (currentToken) {
                    _saveAuthToStorage(currentToken, user);
                }
            }
        }
        
        // Build normalized response
        const normalizedResponse = {
            ok: response.ok,
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
            data: data,
            headers: Object.fromEntries(response.headers.entries()),
            url: response.url || fullUrl,
            method: method,
            requestDuration: requestDuration,
            timestamp: Date.now(),
            json: async () => data,
            text: async () => typeof data === 'string' ? data : JSON.stringify(data),
            clone: function() { 
                return { 
                    ...this, 
                    data: JSON.parse(JSON.stringify(data || {})) 
                }; 
            }
        };
        
        // Handle 401 Unauthorized responses - CLEAR TOKEN
        if (!response.ok) {
            const errorMessage = (data && (data.message || data.error)) || response.statusText || 'Request failed';
            const errorCode = (data && data.code) || `HTTP_${response.status}`;
            
            const error = new KnectaError(
                errorMessage,
                response.status,
                errorCode,
                {
                    url: response.url,
                    data: data,
                    headers: normalizedResponse.headers,
                    responseText: responseText
                }
            );
            
            // Special handling for 401 Unauthorized - CLEAR TOKEN
            if (response.status === 401) {
                // Log 401 once
                if (!_401logged) {
                    console.warn('[API] ⚠️ 401 Unauthorized - clearing token');
                    _401logged = true;
                }
                
                // Clear token - SINGLE SOURCE
                clearUserToken('401.response');
                
                // Dispatch auth failure event
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('auth:unauthorized', {
                        detail: {
                            endpoint: endpointPath,
                            requestId,
                            timestamp: new Date().toISOString()
                        }
                    }));
                }
                
                // Call unauthorized handler if available
                if (handleUnauthorizedAccess && !options._suppressAuthRedirect) {
                    handleUnauthorizedAccess();
                }
            }
            
            // Throw error
            throw error;
        }
        
        return normalizedResponse;
        
    } catch (error) {
        const normalizedError = normalizeError(error, `Request failed: ${url}`);
        
        // Always throw errors
        throw normalizedError;
    }
};

secureRequest = secureApiFetch;

// ============================================================================
// PUBLIC API METHODS - Using Guarded Requests
// ============================================================================

/**
 * GET request
 * @param {string} endpoint - API endpoint
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Response
 */
get = async function(endpoint, params = {}) {
    let url = endpoint;
    if (params && Object.keys(params).length > 0) {
        const queryString = new URLSearchParams(params).toString();
        url += (url.includes('?') ? '&' : '?') + queryString;
    }
    return guardedRequest(url, { method: 'GET' });
};

/**
 * POST request
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body
 * @returns {Promise<Object>} Response
 */
post = async function(endpoint, data = {}) {
    return guardedRequest(endpoint, { method: 'POST', body: data });
};

/**
 * PUT request
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body
 * @returns {Promise<Object>} Response
 */
put = async function(endpoint, data = {}) {
    return guardedRequest(endpoint, { method: 'PUT', body: data });
};

/**
 * PATCH request
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body
 * @returns {Promise<Object>} Response
 */
patch = async function(endpoint, data = {}) {
    return guardedRequest(endpoint, { method: 'PATCH', body: data });
};

/**
 * DELETE request
 * @param {string} endpoint - API endpoint
 * @returns {Promise<Object>} Response
 */
del = async function(endpoint) {
    return guardedRequest(endpoint, { method: 'DELETE' });
};

/**
 * HEAD request
 * @param {string} endpoint - API endpoint
 * @returns {Promise<Object>} Response
 */
head = async function(endpoint) {
    return guardedRequest(endpoint, { method: 'HEAD' });
};

/**
 * OPTIONS request
 * @param {string} endpoint - API endpoint
 * @returns {Promise<Object>} Response
 */
options = async function(endpoint) {
    return guardedRequest(endpoint, { method: 'OPTIONS' });
};

// ============================================================================
// DEPRECATED FETCH WRAPPERS - Now route through secureApiFetch
// ============================================================================

fetchWithRetry = async function(url, options = {}) {
    console.warn('[API] fetchWithRetry is deprecated - using secureApiFetch');
    return secureApiFetch(url, options);
};

fetchWithCache = async function(url, options = {}) {
    console.warn('[API] fetchWithCache is deprecated - using secureApiFetch');
    return secureApiFetch(url, options);
};

fetchWithFallback = async function(url, options = {}) {
    console.warn('[API] fetchWithFallback is deprecated - using secureApiFetch');
    return secureApiFetch(url, options);
};

fetchDedupe = async function(url, options = {}) {
    console.warn('[API] fetchDedupe is deprecated - using secureApiFetch');
    return secureApiFetch(url, options);
};

fetchWithTimeout = async function(url, options = {}) {
    return secureApiFetch(url, options);
};

requestWithAbort = async function(url, options = {}) {
    return secureApiFetch(url, options);
};

// ============================================================================
// SECTION 1: ENVIRONMENT CONFIGURATION - ENHANCED AUTO-DETECTION
// ============================================================================

ENVIRONMENTS = {
    PRODUCTION: 'production',
    DEVELOPMENT: 'development',
    DEMO: 'demo',
    AUTO: 'auto',
    STAGING: 'staging',
    TEST: 'test',
    LOCAL: 'local'
};

// Base URLs for different environments
BASE_URLS = {
    [ENVIRONMENTS.PRODUCTION]: 'https://moodchat-fy56.onrender.com',
    [ENVIRONMENTS.DEVELOPMENT]: 'http://localhost:4000',
    [ENVIRONMENTS.DEMO]: 'https://demo.moodchat.onrender.com',
    [ENVIRONMENTS.STAGING]: 'https://staging.moodchat.onrender.com',
    [ENVIRONMENTS.TEST]: 'https://test.moodchat.onrender.com',
    [ENVIRONMENTS.LOCAL]: 'http://localhost:4000',
    [ENVIRONMENTS.AUTO]: null
};

// Enhanced environment detection rules
ENVIRONMENT_DETECTION_RULES = [
    { pattern: /render\.com|onrender\.com|moodchat-fy56/i, env: ENVIRONMENTS.PRODUCTION },
    { pattern: /staging|stage/i, env: ENVIRONMENTS.STAGING },
    { pattern: /demo|testdrive/i, env: ENVIRONMENTS.DEMO },
    { pattern: /test|testing/i, env: ENVIRONMENTS.TEST },
    { pattern: /localhost|127\.0\.0\.1|::1/i, env: ENVIRONMENTS.LOCAL },
    { pattern: /192\.168\.|10\.0\.|172\.(1[6-9]|2[0-9]|3[0-1])\./i, env: ENVIRONMENTS.DEVELOPMENT },
    { pattern: /dev\.|development\./i, env: ENVIRONMENTS.DEVELOPMENT }
];

CURRENT_ENVIRONMENT = ENVIRONMENTS.AUTO;
ACTIVE_BASE_URL = null;

/**
 * Detect environment based on window.location with enhanced rules
 * @returns {string} Detected environment
 */
detectEnvironment = function() {
    try {
        const hostname = window.location.hostname;
        const port = window.location.port;
        const href = window.location.href;
        const protocol = window.location.protocol;
        
        // SECURITY: Enforce HTTPS in production-like environments
        if (protocol !== 'https:' && 
            !hostname.includes('localhost') && 
            !hostname.includes('127.0.0.1') &&
            !hostname.includes('::1')) {
            console.warn('[ENV] Non-HTTPS connection detected in non-local environment');
        }
        
        // Check each detection rule
        for (const rule of ENVIRONMENT_DETECTION_RULES) {
            if (rule.pattern.test(hostname) || rule.pattern.test(href)) {
                return rule.env;
            }
        }
        
        // Development ports detection
        if (port === '3000' || port === '3001' || port === '4000' || 
            port === '8080' || port === '5500' || port === '5173' || 
            port === '5174' || port === '5175' || port === '4200' || 
            port === '5000' || port === '5001') {
            return ENVIRONMENTS.DEVELOPMENT;
        }
        
        // Subdomain-based detection
        if (hostname.startsWith('dev.') || hostname.startsWith('development.')) {
            return ENVIRONMENTS.DEVELOPMENT;
        }
        if (hostname.startsWith('staging.')) {
            return ENVIRONMENTS.STAGING;
        }
        if (hostname.startsWith('demo.') || hostname.startsWith('test.')) {
            return ENVIRONMENTS.DEMO;
        }
        
        // Default to production for unknown environments
        return ENVIRONMENTS.PRODUCTION;
        
    } catch (error) {
        console.error('[ENV] Detection error:', error);
        return ENVIRONMENTS.PRODUCTION;
    }
};

/**
 * Set environment manually with validation
 * @param {string} env - Environment to set
 * @returns {boolean} Success status
 */
setEnvironment = function(env) {
    try {
        if (!env) return false;
        
        const envString = env.toString().toLowerCase();
        
        // Direct match with predefined environments
        if (Object.values(ENVIRONMENTS).includes(envString)) {
            CURRENT_ENVIRONMENT = envString;
            ACTIVE_BASE_URL = BASE_URLS[envString] || determineBackendUrl();
            
            // SECURITY: Enforce HTTPS in production
            if (CURRENT_ENVIRONMENT === ENVIRONMENTS.PRODUCTION && 
                ACTIVE_BASE_URL && 
                !ACTIVE_BASE_URL.startsWith('https://')) {
                console.warn('[ENV] Production environment requires HTTPS - upgrading URL');
                ACTIVE_BASE_URL = ACTIVE_BASE_URL.replace('http://', 'https://');
            }
            
            // Dispatch environment change event
            window.dispatchEvent(new CustomEvent('environment-changed', {
                detail: {
                    environment: CURRENT_ENVIRONMENT,
                    baseUrl: ACTIVE_BASE_URL,
                    timestamp: new Date().toISOString()
                }
            }));
            
            return true;
        }
        
        // Fuzzy matching for common environment names
        if (envString.includes('prod')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.PRODUCTION;
        } else if (envString.includes('dev')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.DEVELOPMENT;
        } else if (envString.includes('demo')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.DEMO;
        } else if (envString.includes('stage')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.STAGING;
        } else if (envString.includes('test')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.TEST;
        } else if (envString.includes('local')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.LOCAL;
        } else {
            return false;
        }
        
        ACTIVE_BASE_URL = BASE_URLS[CURRENT_ENVIRONMENT] || determineBackendUrl();
        
        // SECURITY: Enforce HTTPS in production
        if (CURRENT_ENVIRONMENT === ENVIRONMENTS.PRODUCTION && 
            ACTIVE_BASE_URL && 
            !ACTIVE_BASE_URL.startsWith('https://')) {
            ACTIVE_BASE_URL = ACTIVE_BASE_URL.replace('http://', 'https://');
        }
        
        // Dispatch environment change event
        window.dispatchEvent(new CustomEvent('environment-changed', {
            detail: {
                environment: CURRENT_ENVIRONMENT,
                baseUrl: ACTIVE_BASE_URL,
                timestamp: new Date().toISOString()
            }
        }));
        
        return true;
        
    } catch (error) {
        console.error('[ENV] Set environment error:', error);
        return false;
    }
};

/**
 * Get current environment
 * @returns {string} Current environment
 */
getEnvironment = function() {
    return CURRENT_ENVIRONMENT;
};

/**
 * Get environment display name (user-friendly)
 * @returns {string} Display name
 */
getEnvironmentDisplayName = function() {
    const envMap = {
        [ENVIRONMENTS.PRODUCTION]: 'Production',
        [ENVIRONMENTS.DEVELOPMENT]: 'Development',
        [ENVIRONMENTS.DEMO]: 'Demo',
        [ENVIRONMENTS.STAGING]: 'Staging',
        [ENVIRONMENTS.TEST]: 'Test',
        [ENVIRONMENTS.LOCAL]: 'Local',
        [ENVIRONMENTS.AUTO]: 'Auto-detected'
    };
    
    return envMap[CURRENT_ENVIRONMENT] || CURRENT_ENVIRONMENT || 'Unknown';
};

/**
 * Check if current environment is production
 * @returns {boolean} True if production
 */
isProduction = function() {
    return CURRENT_ENVIRONMENT === ENVIRONMENTS.PRODUCTION;
};

/**
 * Check if current environment is development
 * @returns {boolean} True if development
 */
isDevelopment = function() {
    return CURRENT_ENVIRONMENT === ENVIRONMENTS.DEVELOPMENT || 
           CURRENT_ENVIRONMENT === ENVIRONMENTS.LOCAL;
};

/**
 * Check if current environment is demo
 * @returns {boolean} True if demo
 */
isDemo = function() {
    return CURRENT_ENVIRONMENT === ENVIRONMENTS.DEMO;
};

/**
 * Check if current environment is localhost
 * @returns {boolean} True if localhost
 */
isLocalhost = function() {
    try {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || 
               hostname === '127.0.0.1' || 
               hostname === '[::1]' ||
               CURRENT_ENVIRONMENT === ENVIRONMENTS.LOCAL;
    } catch (error) {
        return false;
    }
};

/**
 * Check if current environment is Render deployment
 * @returns {boolean} True if Render deployment
 */
isRenderDeployment = function() {
    try {
        const hostname = window.location.hostname;
        return hostname.includes('render.com') || 
               hostname.includes('onrender.com') ||
               (ACTIVE_BASE_URL && (ACTIVE_BASE_URL.includes('render.com') || ACTIVE_BASE_URL.includes('onrender.com')));
    } catch (error) {
        return false;
    }
};

/**
 * Get base URL for current environment with fallback chain
 * @returns {string} Base URL
 */
getBaseUrl = function() {
    try {
        if (ACTIVE_BASE_URL) {
            return ACTIVE_BASE_URL;
        }
        
        if (CURRENT_ENVIRONMENT === ENVIRONMENTS.AUTO) {
            CURRENT_ENVIRONMENT = detectEnvironment();
        }
        
        ACTIVE_BASE_URL = BASE_URLS[CURRENT_ENVIRONMENT];
        
        if (!ACTIVE_BASE_URL) {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                ACTIVE_BASE_URL = `${protocol}//${hostname}:4000`;
            } else if (hostname.includes('render.com') || hostname.includes('onrender.com')) {
                ACTIVE_BASE_URL = 'https://moodchat-fy56.onrender.com';
            } else {
                ACTIVE_BASE_URL = `${protocol}//${hostname}`;
                if (!ACTIVE_BASE_URL.includes(':4000')) {
                    ACTIVE_BASE_URL = ACTIVE_BASE_URL.replace(/:\d+$/, '') + ':4000';
                }
            }
        }
        
        // SECURITY: Enforce HTTPS in production
        if (CURRENT_ENVIRONMENT === ENVIRONMENTS.PRODUCTION && 
            ACTIVE_BASE_URL && 
            !ACTIVE_BASE_URL.startsWith('https://')) {
            ACTIVE_BASE_URL = ACTIVE_BASE_URL.replace('http://', 'https://');
        }
        
        return ACTIVE_BASE_URL;
        
    } catch (error) {
        console.error('[ENV] Get base URL error:', error);
        // Safe fallback
        return 'https://moodchat-fy56.onrender.com';
    }
};

/**
 * Set base URL manually with validation
 * @param {string} url - Base URL to set
 * @returns {boolean} Success status
 */
setBaseUrl = function(url) {
    try {
        if (!url || typeof url !== 'string') {
            console.error('[ENV] Invalid URL provided');
            return false;
        }
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            console.error('[ENV] URL must start with http:// or https://');
            return false;
        }
        
        // SECURITY: Enforce HTTPS in production
        if (isProduction() && !url.startsWith('https://')) {
            console.warn('[ENV] Production environment requires HTTPS - upgrading URL');
            url = url.replace('http://', 'https://');
        }
        
        ACTIVE_BASE_URL = url;
        CURRENT_ENVIRONMENT = ENVIRONMENTS.AUTO;
        
        window.dispatchEvent(new CustomEvent('base-url-changed', {
            detail: {
                baseUrl: ACTIVE_BASE_URL,
                timestamp: new Date().toISOString()
            }
        }));
        
        return true;
        
    } catch (error) {
        console.error('[ENV] Set base URL error:', error);
        return false;
    }
};

/**
 * Determine backend URL with enhanced detection
 * @returns {string} Backend URL
 */
determineBackendUrl = function() {
    try {
        if (ACTIVE_BASE_URL) {
            return ACTIVE_BASE_URL;
        }
        
        if (CURRENT_ENVIRONMENT === ENVIRONMENTS.AUTO) {
            CURRENT_ENVIRONMENT = detectEnvironment();
        }
        
        ACTIVE_BASE_URL = BASE_URLS[CURRENT_ENVIRONMENT];
        
        if (!ACTIVE_BASE_URL) {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
                ACTIVE_BASE_URL = `${protocol}//${hostname}:4000`;
            } else if (hostname.includes('render.com') || hostname.includes('onrender.com')) {
                ACTIVE_BASE_URL = 'https://moodchat-fy56.onrender.com';
            } else if (hostname.includes('vercel.app')) {
                ACTIVE_BASE_URL = 'https://moodchat-api.vercel.app';
            } else if (hostname.includes('netlify.app')) {
                ACTIVE_BASE_URL = 'https://moodchat-api.netlify.app';
            } else {
                ACTIVE_BASE_URL = `${protocol}//${hostname}`;
                if (!ACTIVE_BASE_URL.includes(':4000')) {
                    ACTIVE_BASE_URL += ':4000';
                }
            }
        }
        
        // SECURITY: Enforce HTTPS in production
        if (CURRENT_ENVIRONMENT === ENVIRONMENTS.PRODUCTION && 
            ACTIVE_BASE_URL && 
            !ACTIVE_BASE_URL.startsWith('https://')) {
            ACTIVE_BASE_URL = ACTIVE_BASE_URL.replace('http://', 'https://');
        }
        
        return ACTIVE_BASE_URL;
        
    } catch (error) {
        console.error('[ENV] Determine backend URL error:', error);
        return 'https://moodchat-fy56.onrender.com';
    }
};

// ============================================================================
// SECTION 2: ERROR NORMALIZATION - COMPLETE KnectaError IMPLEMENTATION
// ============================================================================

/**
 * KnectaError - Complete custom error class for API errors
 */
KnectaError = class KnectaError extends Error {
    constructor(message, status = 500, code = 'UNKNOWN_ERROR', data = null, metadata = {}) {
        super(message);
        this.name = 'KnectaError';
        this.status = status;
        this.code = code;
        this.data = data;
        this.metadata = metadata;
        this.timestamp = new Date().toISOString();
        this.isKnectaError = true;
        this.isApiError = true;
        this.isOperational = true;
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, KnectaError);
        }
        
        if (status >= 500) {
            this.category = 'server';
        } else if (status === 401 || status === 403) {
            this.category = 'auth';
        } else if (status === 404) {
            this.category = 'not_found';
        } else if (status === 429) {
            this.category = 'rate_limit';
        } else if (status >= 400) {
            this.category = 'client';
        } else if (status === 0) {
            this.category = 'network';
        } else if (message && message.toLowerCase().includes('timeout')) {
            this.category = 'timeout';
        } else {
            this.category = 'unknown';
        }
    }
    
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            status: this.status,
            code: this.code,
            category: this.category,
            data: this.data,
            metadata: this.metadata,
            timestamp: this.timestamp,
            stack: this.stack,
            isKnectaError: this.isKnectaError
        };
    }
    
    toString() {
        return `[KnectaError ${this.status}] ${this.code}: ${this.message}`;
    }
};

/**
 * NetworkError - Specific error for network failures
 */
NetworkError = class NetworkError extends KnectaError {
    constructor(message = 'Network connection failed', data = null) {
        super(message, 0, 'NETWORK_ERROR', data);
        this.name = 'NetworkError';
    }
};

/**
 * SessionError - Specific error for session/authentication issues
 */
SessionError = class SessionError extends KnectaError {
    constructor(message = 'Session invalid or expired', data = null) {
        super(message, 401, 'SESSION_ERROR', data);
        this.name = 'SessionError';
    }
};

/**
 * AuthError - Specific error for authentication failures
 */
AuthError = class AuthError extends KnectaError {
    constructor(message = 'Authentication failed', status = 401, code = 'AUTH_ERROR', data = null) {
        super(message, status, code, data);
        this.name = 'AuthError';
    }
};

/**
 * ValidationError - Specific error for validation failures
 */
ValidationError = class ValidationError extends KnectaError {
    constructor(message = 'Validation failed', status = 400, code = 'VALIDATION_ERROR', data = null) {
        super(message, status, code, data);
        this.name = 'ValidationError';
    }
};

ApiError = KnectaError;
ApiGatewayError = KnectaError;

/**
 * Normalize any error to standard KnectaError format
 * @param {*} error - Error to normalize
 * @param {string} defaultMessage - Default message
 * @param {number} defaultStatus - Default status code
 * @returns {KnectaError} Normalized error
 */
normalizeError = function(error, defaultMessage = 'An error occurred', defaultStatus = 500) {
    try {
        if (error && error.isKnectaError === true) {
            return error;
        }
        
        if (error && typeof error.status === 'number' && typeof error.ok === 'boolean') {
            let code = `HTTP_${error.status}`;
            let message = error.statusText || `HTTP Error ${error.status}`;
            
            if (error.status === 401) code = 'UNAUTHORIZED';
            if (error.status === 403) code = 'FORBIDDEN';
            if (error.status === 404) code = 'NOT_FOUND';
            if (error.status === 429) code = 'RATE_LIMITED';
            if (error.status === 500) code = 'INTERNAL_SERVER_ERROR';
            if (error.status === 503) code = 'SERVICE_UNAVAILABLE';
            
            return new KnectaError(message, error.status, code, { 
                url: error.url,
                ok: error.ok,
                headers: error.headers ? Object.fromEntries(error.headers.entries() || []) : {}
            });
        }
        
        if (error && error.isAxiosError === true) {
            const status = error.response?.status || 0;
            const data = error.response?.data || {};
            const message = data.message || error.message || 'Axios error';
            const code = data.code || `AXIOS_${status}`;
            
            return new KnectaError(message, status, code, {
                config: error.config,
                response: error.response,
                data: data
            });
        }
        
        if (error instanceof Error) {
            let status = defaultStatus;
            let code = error.code || error.name || 'ERROR';
            let message = error.message || defaultMessage;
            
            if (message.toLowerCase().includes('timeout')) {
                status = 408;
                code = 'TIMEOUT_ERROR';
            } else if (message.toLowerCase().includes('network') || 
                      message.toLowerCase().includes('fetch') || 
                      message.toLowerCase().includes('failed to fetch')) {
                status = 0;
                code = 'NETWORK_ERROR';
                return new NetworkError(message, { originalStack: error.stack });
            } else if (message.includes('401') || message.toLowerCase().includes('unauthorized') ||
                      message.toLowerCase().includes('session')) {
                status = 401;
                code = 'UNAUTHORIZED';
                return new SessionError(message, { originalStack: error.stack });
            } else if (message.includes('403') || message.toLowerCase().includes('forbidden')) {
                status = 403;
                code = 'FORBIDDEN';
                return new AuthError(message, 403, 'FORBIDDEN', { originalStack: error.stack });
            } else if (message.includes('404') || message.toLowerCase().includes('not found')) {
                status = 404;
                code = 'NOT_FOUND';
            } else if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
                status = 429;
                code = 'RATE_LIMITED';
            } else if (message.includes('500') || message.toLowerCase().includes('internal server')) {
                status = 500;
                code = 'INTERNAL_SERVER_ERROR';
            } else if (message.includes('502') || message.toLowerCase().includes('bad gateway')) {
                status = 502;
                code = 'BAD_GATEWAY';
            } else if (message.includes('503') || message.toLowerCase().includes('unavailable')) {
                status = 503;
                code = 'SERVICE_UNAVAILABLE';
            } else if (message.includes('504') || message.toLowerCase().includes('gateway timeout')) {
                status = 504;
                code = 'GATEWAY_TIMEOUT';
            }
            
            return new KnectaError(message, status, code, { 
                originalStack: error.stack,
                originalName: error.name
            });
        }
        
        if (typeof error === 'string') {
            return new KnectaError(error, defaultStatus, 'STRING_ERROR', { original: error });
        }
        
        if (error && typeof error === 'object') {
            const message = error.message || error.error || error.msg || error.detail || defaultMessage;
            const status = error.status || error.statusCode || error.code || defaultStatus;
            const code = error.code || error.errorCode || 'OBJECT_ERROR';
            
            return new KnectaError(message, status, code, error);
        }
        
        return new KnectaError(defaultMessage, defaultStatus, 'UNKNOWN_ERROR', { 
            original: error,
            type: typeof error
        });
        
    } catch (normalizeError) {
        return new KnectaError(
            defaultMessage, 
            defaultStatus, 
            'NORMALIZE_ERROR', 
            { 
                original: error,
                normalizeError: normalizeError.message 
            }
        );
    }
};

/**
 * Check if value is ApiError/KnectaError
 * @param {*} value - Value to check
 * @returns {boolean} True if API error
 */
isApiError = function(value) {
    return value instanceof KnectaError || 
           (value && value.isKnectaError === true) ||
           (value && value.isApiError === true);
};

/**
 * Create error with specific code and status
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @param {string} code - Error code
 * @param {*} data - Additional data
 * @returns {KnectaError} Created error
 */
createError = function(message, status = 500, code = 'CUSTOM_ERROR', data = null) {
    return new KnectaError(message, status, code, data);
};

/**
 * Format error message for display - FIXED: Escape HTML to prevent XSS
 * @param {*} error - Error to format
 * @returns {string} Formatted error message
 */
formatErrorMessage = function(error) {
    const normalized = normalizeError(error);
    
    const statusMessages = {
        400: 'Bad request. Please check your input.',
        401: 'You need to log in to access this feature.',
        403: 'You don\'t have permission to perform this action.',
        404: 'The requested resource was not found.',
        408: 'The request timed out. Please try again.',
        429: 'Too many requests. Please wait a moment and try again.',
        500: 'Server error. Please try again later.',
        502: 'Bad gateway. Please try again later.',
        503: 'Service unavailable. Please try again later.',
        504: 'Gateway timeout. Please try again later.',
        0: 'Network error. Please check your internet connection.'
    };
    
    if (statusMessages[normalized.status]) {
        return statusMessages[normalized.status];
    }
    
    // Escape the message to prevent XSS
    const message = normalized.message || 'An unexpected error occurred.';
    return escapeHtml ? escapeHtml(message) : message;
};

/**
 * Get HTTP status code from error
 * @param {*} error - Error to check
 * @returns {number} HTTP status code
 */
getErrorStatusCode = function(error) {
    const normalized = normalizeError(error, '', 500);
    return normalized.status;
};

/**
 * Get error code from error
 * @param {*} error - Error to check
 * @returns {string} Error code
 */
getErrorCode = function(error) {
    const normalized = normalizeError(error);
    return normalized.code;
};

/**
 * Check if error is network error
 * @param {*} error - Error to check
 * @returns {boolean} True if network error
 */
isNetworkError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status === 0 || 
           normalized.code === 'NETWORK_ERROR' ||
           normalized.category === 'network' ||
           error instanceof NetworkError;
};

/**
 * Check if error is timeout error
 * @param {*} error - Error to check
 * @returns {boolean} True if timeout error
 */
isTimeoutError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status === 408 || 
           normalized.code === 'TIMEOUT_ERROR' ||
           normalized.category === 'timeout';
};

/**
 * Check if error is authentication error
 * @param {*} error - Error to check
 * @returns {boolean} True if auth error
 */
isAuthError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status === 401 || 
           normalized.status === 403 ||
           normalized.code === 'UNAUTHORIZED' ||
           normalized.code === 'FORBIDDEN' ||
           normalized.code === 'SESSION_ERROR' ||
           normalized.code === 'NO_TOKEN' ||
           normalized.category === 'auth' ||
           error instanceof SessionError ||
           error instanceof AuthError;
};

/**
 * Check if error is server error (5xx)
 * @param {*} error - Error to check
 * @returns {boolean} True if server error
 */
isServerError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status >= 500 && normalized.status < 600;
};

/**
 * Check if error is client error (4xx)
 * @param {*} error - Error to check
 * @returns {boolean} True if client error
 */
isClientError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status >= 400 && normalized.status < 500 && normalized.status !== 401 && normalized.status !== 403;
};

/**
 * Check if error is rate limit error
 * @param {*} error - Error to check
 * @returns {boolean} True if rate limit error
 */
isRateLimitError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status === 429 || 
           normalized.code === 'RATE_LIMITED' ||
           normalized.category === 'rate_limit';
};

// ============================================================================
// SECTION 3: SECURE TOKEN STORAGE - ENHANCED ENCRYPTION & PROTECTION
// ============================================================================

/**
 * SecureStorage - Encrypted localStorage wrapper with enhanced security
 */
SecureStorage = {
    _encryptionKey: 'moodchat_secure_v23_2024',
    _prefix: 'sc_v23_',
    _version: '23.0.8',
    _salt: Math.random().toString(36).substring(2, 15),
    
    /**
     * XOR encryption with salt (simple but effective for client-side)
     * @private
     */
    _xorEncrypt: function(text, key) {
        try {
            if (!text) return text;
            
            const textStr = typeof text === 'string' ? text : JSON.stringify(text);
            const saltedKey = key + this._salt;
            let result = '';
            
            for (let i = 0; i < textStr.length; i++) {
                const keyChar = saltedKey.charCodeAt(i % saltedKey.length);
                const textChar = textStr.charCodeAt(i);
                result += String.fromCharCode(textChar ^ keyChar);
            }
            
            const encrypted = btoa(result);
            return `v23:${this._salt.substring(0, 8)}:${encrypted}`;
            
        } catch (e) {
            console.error('[SECURE-STORAGE] Encryption error:', e);
            return text;
        }
    },
    
    /**
     * XOR decryption with salt
     * @private
     */
    _xorDecrypt: function(encrypted, key) {
        try {
            if (!encrypted || typeof encrypted !== 'string') return encrypted;
            
            if (encrypted.startsWith('v23:')) {
                const parts = encrypted.split(':');
                if (parts.length >= 3) {
                    const salt = parts[1];
                    const encryptedData = parts.slice(2).join(':');
                    const decoded = atob(encryptedData);
                    const saltedKey = key + salt;
                    let result = '';
                    
                    for (let i = 0; i < decoded.length; i++) {
                        const keyChar = saltedKey.charCodeAt(i % saltedKey.length);
                        const textChar = decoded.charCodeAt(i);
                        result += String.fromCharCode(textChar ^ keyChar);
                    }
                    
                    return result;
                }
            }
            
            try {
                const decoded = atob(encrypted);
                const saltedKey = key + this._salt;
                let result = '';
                
                for (let i = 0; i < decoded.length; i++) {
                    const keyChar = saltedKey.charCodeAt(i % saltedKey.length);
                    const textChar = decoded.charCodeAt(i);
                    result += String.fromCharCode(textChar ^ keyChar);
                }
                
                return result;
            } catch (e) {
                return encrypted;
            }
            
        } catch (e) {
            console.error('[SECURE-STORAGE] Decryption error:', e);
            return encrypted;
        }
    },
    
    /**
     * Set item in secure storage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @param {boolean} encrypt - Whether to encrypt
     * @returns {boolean} Success status
     */
    setItem: function(key, value, encrypt = true) {
        try {
            const storageKey = this._prefix + key;
            let storageValue = value;
            
            if (encrypt) {
                storageValue = this._xorEncrypt(value, this._encryptionKey);
            }
            
            localStorage.setItem(storageKey, storageValue);
            
            return true;
            
        } catch (error) {
            console.error('[SECURE-STORAGE] Set item error:', error);
            return false;
        }
    },
    
    /**
     * Get item from secure storage
     * @param {string} key - Storage key
     * @param {boolean} decrypt - Whether to decrypt
     * @param {boolean} parseJSON - Whether to parse JSON
     * @returns {*} Retrieved value
     */
    getItem: function(key, decrypt = true, parseJSON = false) {
        try {
            const storageKey = this._prefix + key;
            let value = localStorage.getItem(storageKey);
            
            if (!value) return null;
            
            if (decrypt) {
                value = this._xorDecrypt(value, this._encryptionKey);
            }
            
            if (parseJSON && value) {
                try {
                    return JSON.parse(value);
                } catch (e) {
                    return value;
                }
            }
            
            return value;
            
        } catch (error) {
            console.error('[SECURE-STORAGE] Get item error:', error);
            return null;
        }
    },
    
    /**
     * Remove item from secure storage
     * @param {string} key - Storage key
     * @returns {boolean} Success status
     */
    removeItem: function(key) {
        try {
            localStorage.removeItem(this._prefix + key);
            return true;
        } catch (error) {
            console.error('[SECURE-STORAGE] Remove item error:', error);
            return false;
        }
    },
    
    /**
     * Clear all secure storage items
     * @returns {boolean} Success status
     */
    clear: function() {
        try {
            const keysToRemove = [];
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this._prefix)) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            return true;
            
        } catch (error) {
            console.error('[SECURE-STORAGE] Clear error:', error);
            return false;
        }
    },
    
    /**
     * Check if item exists in secure storage
     * @param {string} key - Storage key
     * @returns {boolean} True if exists
     */
    hasItem: function(key) {
        return localStorage.getItem(this._prefix + key) !== null;
    },
    
    /**
     * Get all secure storage keys
     * @returns {string[]} Array of keys
     */
    keys: function() {
        const keys = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this._prefix)) {
                keys.push(key.substring(this._prefix.length));
            }
        }
        
        return keys;
    },
    
    /**
     * Get approximate storage size in bytes
     * @returns {number} Size in bytes
     */
    getSize: function() {
        let size = 0;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this._prefix)) {
                const value = localStorage.getItem(key);
                size += (key.length + (value ? value.length : 0)) * 2;
            }
        }
        
        return size;
    }
};

/**
 * TokenManager - Updated to use single source of truth - NO CIRCULAR DEPENDENCIES
 */
TokenManager = {
    TOKEN_KEY: 'USER_TOKEN',
    REFRESH_TOKEN_KEY: 'REFRESH_TOKEN',
    TOKEN_EXPIRY_KEY: 'TOKEN_EXPIRY',
    TOKEN_CREATED_KEY: 'TOKEN_CREATED',
    TOKEN_TYPE_KEY: 'TOKEN_TYPE',
    DEFAULT_EXPIRY: 3600,
    REFRESH_THRESHOLD: 300, // 5 minutes
    
    // Token refresh lock to prevent multiple simultaneous refresh attempts
    _refreshLock: false,
    _refreshPromise: null,
    
    /**
     * Internal method to set token without circular reference
     * @private
     */
    _setTokenInternal: function(token) {
        try {
            if (!token || typeof token !== 'string') {
                return false;
            }
            
            const sanitizedToken = sanitizeToken(token);
            
            SecureStorage.setItem(this.TOKEN_KEY, sanitizedToken, true);
            
            return true;
        } catch (error) {
            console.error('[TOKEN-MANAGER] Internal set token error:', error);
            return false;
        }
    },
    
    /**
     * Internal method to clear token without circular reference
     * @private
     */
    _clearTokenInternal: function() {
        try {
            SecureStorage.removeItem(this.TOKEN_KEY);
            SecureStorage.removeItem(this.REFRESH_TOKEN_KEY);
            localStorage.removeItem(this.TOKEN_EXPIRY_KEY);
            localStorage.removeItem(this.TOKEN_CREATED_KEY);
            localStorage.removeItem(this.TOKEN_TYPE_KEY);
            
            return true;
        } catch (error) {
            console.error('[TOKEN-MANAGER] Internal clear token error:', error);
            return false;
        }
    },
    
    /**
     * Set authentication token with optional refresh token and expiry
     * @param {string} token - JWT token
     * @param {string} refreshToken - Refresh token
     * @param {number} expiresIn - Expiry time in seconds
     * @param {string} tokenType - Token type (Bearer, etc.)
     * @returns {boolean} Success status
     */
    setToken: function(token, refreshToken = null, expiresIn = this.DEFAULT_EXPIRY, tokenType = 'Bearer') {
        try {
            if (!token || typeof token !== 'string') {
                console.error('[TOKEN-MANAGER] Invalid token provided');
                return false;
            }
            
            // Update single source of truth - skip manager to prevent recursion
            setUserToken(token, true, 'TokenManager');
            
            const sanitizedToken = sanitizeToken(token);
            
            SecureStorage.setItem(this.TOKEN_KEY, sanitizedToken, true);
            
            if (refreshToken) {
                const sanitizedRefreshToken = sanitizeToken(refreshToken);
                SecureStorage.setItem(this.REFRESH_TOKEN_KEY, sanitizedRefreshToken, true);
            }
            
            const expiryTime = Date.now() + (expiresIn * 1000);
            localStorage.setItem(this.TOKEN_EXPIRY_KEY, expiryTime.toString());
            localStorage.setItem(this.TOKEN_CREATED_KEY, Date.now().toString());
            localStorage.setItem(this.TOKEN_TYPE_KEY, tokenType);
            
            if (typeof updateGlobalAccessToken === 'function') {
                updateGlobalAccessToken();
            }
            
            return true;
            
        } catch (error) {
            console.error('[TOKEN-MANAGER] Set token error:', error);
            return false;
        }
    },
    
    /**
     * Get current authentication token
     * @returns {string|null} Token or null
     */
    getToken: function() {
        // Use single source of truth
        return getUserToken('TokenManager');
    },
    
    /**
     * Get refresh token
     * @returns {string|null} Refresh token or null
     */
    getRefreshToken: function() {
        try {
            return SecureStorage.getItem(this.REFRESH_TOKEN_KEY, true, false);
        } catch (error) {
            console.error('[TOKEN-MANAGER] Get refresh token error:', error);
            return null;
        }
    },
    
    /**
     * Clear all token data
     * @returns {boolean} Success status
     */
    clearToken: function() {
        try {
            // Clear single source of truth
            clearUserToken('TokenManager');
            
            this._clearTokenInternal();
            
            // Reset refresh lock
            this._refreshLock = false;
            this._refreshPromise = null;
            
            return true;
            
        } catch (error) {
            console.error('[TOKEN-MANAGER] Clear token error:', error);
            return false;
        }
    },
    
    /**
     * Check if token is expired
     * @returns {boolean} True if expired
     */
    isTokenExpired: function() {
        try {
            const expiryStr = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
            if (!expiryStr) return true;
            
            const expiry = parseInt(expiryStr, 10);
            return Date.now() >= expiry;
            
        } catch (error) {
            console.error('[TOKEN-MANAGER] Check token expired error:', error);
            return true;
        }
    },
    
    /**
     * Get token expiry timestamp
     * @returns {number|null} Expiry timestamp or null
     */
    getTokenExpiry: function() {
        try {
            const expiryStr = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
            return expiryStr ? parseInt(expiryStr, 10) : null;
        } catch (error) {
            console.error('[TOKEN-MANAGER] Get token expiry error:', error);
            return null;
        }
    },
    
    /**
     * Get token creation timestamp
     * @returns {number|null} Creation timestamp or null
     */
    getTokenCreated: function() {
        try {
            const createdStr = localStorage.getItem(this.TOKEN_CREATED_KEY);
            return createdStr ? parseInt(createdStr, 10) : null;
        } catch (error) {
            return null;
        }
    },
    
    /**
     * Get token type
     * @returns {string} Token type (default: Bearer)
     */
    getTokenType: function() {
        try {
            return localStorage.getItem(this.TOKEN_TYPE_KEY) || 'Bearer';
        } catch (error) {
            return 'Bearer';
        }
    },
    
    /**
     * Set token with specific expiry timestamp
     * @param {string} token - JWT token
     * @param {number} expiryTimestamp - Expiry timestamp
     * @param {string} refreshToken - Refresh token
     * @returns {boolean} Success status
     */
    setTokenWithExpiry: function(token, expiryTimestamp, refreshToken = null) {
        try {
            const expiresIn = Math.max(1, Math.floor((expiryTimestamp - Date.now()) / 1000));
            return this.setToken(token, refreshToken, expiresIn);
        } catch (error) {
            console.error('[TOKEN-MANAGER] Set token with expiry error:', error);
            return false;
        }
    },
    
    /**
     * Check if token should be refreshed
     * @returns {boolean} True if refresh needed
     */
    shouldRefreshToken: function() {
        try {
            const expiry = this.getTokenExpiry();
            if (!expiry) return true;
            
            const timeUntilExpiry = expiry - Date.now();
            return timeUntilExpiry < (this.REFRESH_THRESHOLD * 1000);
            
        } catch (error) {
            return true;
        }
    },
    
    /**
     * Validate token format (JWT structure)
     * @private
     * @param {string} token - Token to validate
     * @returns {boolean} True if valid format
     */
    _validateTokenFormat: function(token) {
        if (!token || typeof token !== 'string') return false;
        
        // Check JWT format (header.payload.signature)
        const parts = token.split('.');
        if (parts.length === 3) {
            try {
                // Try to decode header and payload (base64)
                const header = JSON.parse(atob(parts[0]));
                const payload = JSON.parse(atob(parts[1]));
                return !!(header && payload);
            } catch (e) {
                // Not a valid JWT, but might be another token format
                return token.length > 20;
            }
        }
        
        // Not a JWT, but might be valid (e.g., opaque token)
        return token.length > 20;
    },
    
    /**
     * Clear expired tokens if they exist
     * @returns {boolean} True if tokens were cleared
     */
    clearExpiredTokens: function() {
        try {
            if (this.isTokenExpired()) {
                this.clearToken();
                return true;
            }
            return false;
        } catch (error) {
            console.error('[TOKEN-MANAGER] Clear expired tokens error:', error);
            return false;
        }
    },
    
    /**
     * Migrate tokens from legacy storage formats
     * @returns {boolean} True if migration occurred
     */
    migrateLegacyTokens: function() {
        try {
            const legacyKeys = [
                'accessToken',
                'moodchat_token',
                'token',
                'moodchat_auth_token',
                'authToken',
                'userToken',
                'jwt',
                'access_token'
            ];
            
            for (const key of legacyKeys) {
                const token = localStorage.getItem(key);
                if (token && token.length > 20 && token !== 'null' && token !== 'undefined') {
                    this.setToken(token, null, this.DEFAULT_EXPIRY);
                    return true;
                }
            }
            
            // Check authUser object
            try {
                const authUserStr = localStorage.getItem('authUser');
                if (authUserStr) {
                    const authUser = JSON.parse(authUserStr);
                    const token = authUser.accessToken || authUser.token || authUser.jwt;
                    if (token) {
                        this.setToken(token, null, this.DEFAULT_EXPIRY);
                        return true;
                    }
                }
            } catch (e) {}
            
            return false;
            
        } catch (error) {
            console.error('[TOKEN-MANAGER] Migrate legacy tokens error:', error);
            return false;
        }
    }
};

// Token utility functions
encryptToken = function(token) {
    SecureStorage.setItem('temp_token', token, true);
    return true;
};

decryptToken = function(encryptedToken) {
    return SecureStorage.getItem('temp_token', true, false);
};

secureGetToken = getUserToken;
secureSetToken = setUserToken;
secureClearToken = clearUserToken;

isTokenExpired = function() {
    return TokenManager.isTokenExpired();
};

getTokenExpiryTime = function() {
    return TokenManager.getTokenExpiry();
};

setTokenWithExpiry = function(token, expiryTimestamp, refreshToken = null) {
    return TokenManager.setTokenWithExpiry(token, expiryTimestamp, refreshToken);
};

clearExpiredTokens = function() {
    return TokenManager.clearExpiredTokens();
};

migrateLegacyTokens = function() {
    return TokenManager.migrateLegacyTokens();
};

validateTokenFormat = function(token) {
    return TokenManager._validateTokenFormat(token);
};

sanitizeToken = function(token) {
    if (!token) return token;
    
    return token
        .toString()
        .trim()
        .replace(/[\n\r\t\0\x00-\x1F]/g, '')
        .replace(/\s+/g, '')
        .replace(/[^\w\-\.]/g, '');
};

/**
 * Refresh token if needed
 * @returns {Promise<Object>} Refresh result
 */
refreshTokenIfNeeded = async function() {
    // If refresh is already in progress, return the existing promise
    if (TokenManager._refreshLock && TokenManager._refreshPromise) {
        return TokenManager._refreshPromise;
    }
    
    try {
        const currentToken = getUserToken('refreshTokenIfNeeded');
        if (!currentToken) {
            return { success: false, error: 'No token to refresh' };
        }
        
        if (!TokenManager.shouldRefreshToken()) {
            return { 
                success: true, 
                token: currentToken,
                refreshed: false,
                message: 'Token still valid'
            };
        }
        
        const refreshToken = TokenManager.getRefreshToken();
        if (!refreshToken) {
            return { 
                success: false, 
                error: 'No refresh token available',
                token: currentToken
            };
        }
        
        // Set refresh lock
        TokenManager._refreshLock = true;
        
        TokenManager._refreshPromise = (async () => {
            try {
                const baseUrl = getBaseUrl();
                const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                
                const response = await fetch(`${url}/api/auth/refresh`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ refreshToken }),
                    credentials: 'include'
                });
                
                let data = null;
                try {
                    data = await response.json();
                } catch (e) {
                    data = { message: 'Failed to parse response' };
                }
                
                if (response.ok && data) {
                    const newToken = data.token || data.accessToken;
                    const newRefreshToken = data.refreshToken || refreshToken;
                    const expiresIn = data.expiresIn || TokenManager.DEFAULT_EXPIRY;
                    
                    if (newToken) {
                        // Update single source of truth - skip manager to prevent recursion
                        setUserToken(newToken, true, 'token.refresh');
                        TokenManager.setToken(newToken, newRefreshToken, expiresIn);
                        
                        return {
                            success: true,
                            token: newToken,
                            refreshed: true,
                            expiresIn: expiresIn
                        };
                    }
                }
                
                return {
                    success: false,
                    error: 'Refresh failed',
                    token: currentToken
                };
            } finally {
                // Release lock
                TokenManager._refreshLock = false;
                TokenManager._refreshPromise = null;
            }
        })();
        
        return TokenManager._refreshPromise;
        
    } catch (error) {
        TokenManager._refreshLock = false;
        TokenManager._refreshPromise = null;
        
        console.error('[TOKEN] Refresh token error:', error);
        return {
            success: false,
            error: error.message || 'Refresh failed',
            token: getUserToken('refreshTokenIfNeeded.error')
        };
    }
};

// ============================================================================
// SECTION 4: CACHE MANAGEMENT - ENHANCED IMPLEMENTATION
// ============================================================================

CacheManager = {
    _memoryCache: new Map(),
    _persistentCache: null,
    _defaultTTL: 300000, // 5 minutes
    _maxItems: 200,
    _pruneInterval: null,
    _stats: {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        prunes: 0
    },
    
    /**
     * Initialize cache manager
     * @returns {boolean} Success status
     */
    init: function() {
        try {
            this._loadFromStorage();
            this._startPruneInterval();
            return true;
        } catch (error) {
            console.error('[CACHE] Init error:', error);
            return false;
        }
    },
    
    /**
     * Get item from cache
     * @param {string} key - Cache key
     * @param {Object} options - Options
     * @returns {*} Cached data or null
     */
    get: function(key, options = {}) {
        try {
            const cacheKey = this._getCacheKey(key);
            
            // Check memory cache first
            if (this._memoryCache.has(cacheKey)) {
                const item = this._memoryCache.get(cacheKey);
                
                if (Date.now() < item.expiresAt) {
                    this._stats.hits++;
                    return { ...item.data, _fromCache: true, _cacheTime: item.timestamp };
                } else {
                    this._memoryCache.delete(cacheKey);
                }
            }
            
            // Check persistent cache if enabled
            if (options.usePersistent !== false) {
                try {
                    const persistentStr = localStorage.getItem(`cache_${cacheKey}`);
                    if (persistentStr) {
                        const item = JSON.parse(persistentStr);
                        
                        if (Date.now() < item.expiresAt) {
                            this._memoryCache.set(cacheKey, item);
                            this._stats.hits++;
                            return { ...item.data, _fromCache: true, _cacheTime: item.timestamp };
                        } else {
                            localStorage.removeItem(`cache_${cacheKey}`);
                        }
                    }
                } catch (e) {}
            }
            
            this._stats.misses++;
            return null;
            
        } catch (error) {
            console.error('[CACHE] Get error:', error);
            return null;
        }
    },
    
    /**
     * Set item in cache
     * @param {string} key - Cache key
     * @param {*} data - Data to cache
     * @param {number} ttl - Time to live in ms
     * @param {Object} options - Options
     * @returns {boolean} Success status
     */
    set: function(key, data, ttl = this._defaultTTL, options = {}) {
        try {
            const cacheKey = this._getCacheKey(key);
            const expiresAt = Date.now() + ttl;
            
            const cacheItem = {
                data,
                expiresAt,
                timestamp: Date.now(),
                version: '23.0.8'
            };
            
            this._memoryCache.set(cacheKey, cacheItem);
            
            // Store in persistent cache if enabled
            if (options.usePersistent !== false) {
                try {
                    localStorage.setItem(`cache_${cacheKey}`, JSON.stringify(cacheItem));
                } catch (e) {
                    if (e.name === 'QuotaExceededError') {
                        this._prunePersistentCache();
                        try {
                            localStorage.setItem(`cache_${cacheKey}`, JSON.stringify(cacheItem));
                        } catch (e2) {}
                    }
                }
            }
            
            // Prune if memory cache exceeds limit
            if (this._memoryCache.size > this._maxItems) {
                this._pruneMemoryCache();
            }
            
            this._stats.sets++;
            return true;
            
        } catch (error) {
            console.error('[CACHE] Set error:', error);
            return false;
        }
    },
    
    /**
     * Delete item from cache
     * @param {string} key - Cache key
     * @returns {boolean} True if deleted
     */
    delete: function(key) {
        try {
            const cacheKey = this._getCacheKey(key);
            
            const deleted = this._memoryCache.delete(cacheKey);
            
            try {
                localStorage.removeItem(`cache_${cacheKey}`);
            } catch (e) {}
            
            if (deleted) {
                this._stats.deletes++;
            }
            
            return deleted;
            
        } catch (error) {
            console.error('[CACHE] Delete error:', error);
            return false;
        }
    },
    
    /**
     * Clear all cache
     * @returns {boolean} Success status
     */
    clear: function() {
        try {
            this._memoryCache.clear();
            
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('cache_')) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => localStorage.removeItem(key));
            
            this._stats = {
                hits: 0,
                misses: 0,
                sets: 0,
                deletes: 0,
                prunes: 0
            };
            
            return true;
            
        } catch (error) {
            console.error('[CACHE] Clear error:', error);
            return false;
        }
    },
    
    /**
     * Generate cache key
     * @private
     * @param {string} key - Original key
     * @returns {string} Normalized cache key
     */
    _getCacheKey: function(key) {
        return String(key)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    },
    
    /**
     * Load cache from persistent storage
     * @private
     */
    _loadFromStorage: function() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('cache_')) {
                    try {
                        const cachedStr = localStorage.getItem(key);
                        if (cachedStr) {
                            const cached = JSON.parse(cachedStr);
                            if (Date.now() < cached.expiresAt) {
                                const cacheKey = key.replace('cache_', '');
                                this._memoryCache.set(cacheKey, cached);
                            } else {
                                localStorage.removeItem(key);
                            }
                        }
                    } catch (e) {
                        localStorage.removeItem(key);
                    }
                }
            }
        } catch (error) {
            console.error('[CACHE] Load from storage error:', error);
        }
    },
    
    /**
     * Prune memory cache (remove expired and oldest items)
     * @private
     */
    _pruneMemoryCache: function() {
        try {
            const now = Date.now();
            const expiredKeys = [];
            
            this._memoryCache.forEach((item, key) => {
                if (now >= item.expiresAt) {
                    expiredKeys.push(key);
                }
            });
            
            expiredKeys.forEach(key => this._memoryCache.delete(key));
            
            if (this._memoryCache.size > this._maxItems) {
                const items = Array.from(this._memoryCache.entries())
                    .sort((a, b) => a[1].timestamp - b[1].timestamp);
                
                const toRemove = items.slice(0, items.length - this._maxItems);
                toRemove.forEach(([key]) => this._memoryCache.delete(key));
            }
            
            this._stats.prunes++;
            
        } catch (error) {
            console.error('[CACHE] Prune memory cache error:', error);
        }
    },
    
    /**
     * Prune persistent cache (remove oldest 20%)
     * @private
     */
    _prunePersistentCache: function() {
        try {
            const cacheItems = [];
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('cache_')) {
                    try {
                        const value = localStorage.getItem(key);
                        const parsed = JSON.parse(value);
                        cacheItems.push({ key, value: parsed });
                    } catch (e) {
                        localStorage.removeItem(key);
                    }
                }
            }
            
            cacheItems.sort((a, b) => a.value.timestamp - b.value.timestamp);
            
            const toRemove = Math.floor(cacheItems.length * 0.2);
            cacheItems.slice(0, toRemove).forEach(item => {
                localStorage.removeItem(item.key);
            });
            
        } catch (error) {
            console.error('[CACHE] Prune persistent cache error:', error);
        }
    },
    
    /**
     * Start prune interval - OPTIMIZED: Increased interval to reduce CPU usage
     * @private
     */
    _startPruneInterval: function() {
        // Clear existing interval if any
        if (this._pruneInterval) {
            clearInterval(this._pruneInterval);
        }
        
        // Prune every 2 minutes instead of every minute
        this._pruneInterval = setInterval(() => {
            this._pruneMemoryCache();
        }, 120000);
    },
    
    /**
     * Stop prune interval
     */
    stop: function() {
        if (this._pruneInterval) {
            clearInterval(this._pruneInterval);
            this._pruneInterval = null;
        }
    },
    
    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getStats: function() {
        const hitRate = this._stats.hits + this._stats.misses > 0
            ? (this._stats.hits / (this._stats.hits + this._stats.misses) * 100).toFixed(2)
            : 0;
        
        return {
            ...this._stats,
            memorySize: this._memoryCache.size,
            hitRate: `${hitRate}%`,
            memoryUsage: this._getMemoryUsage(),
            timestamp: new Date().toISOString()
        };
    },
    
    /**
     * Estimate memory usage
     * @private
     * @returns {number} Estimated memory usage in bytes
     */
    _getMemoryUsage: function() {
        try {
            let size = 0;
            this._memoryCache.forEach((value, key) => {
                size += key.length * 2;
                size += JSON.stringify(value).length * 2;
            });
            return size;
        } catch (error) {
            return 0;
        }
    }
};

memoryCache = CacheManager;
persistentCache = CacheManager;
clearCache = CacheManager.clear.bind(CacheManager);
getCacheKey = CacheManager._getCacheKey.bind(CacheManager);
setCacheItem = CacheManager.set.bind(CacheManager);
getCacheItem = CacheManager.get.bind(CacheManager);
deleteCacheItem = CacheManager.delete.bind(CacheManager);
pruneCache = CacheManager._pruneMemoryCache.bind(CacheManager);
cacheStats = CacheManager.getStats.bind(CacheManager);

CacheManager.init();

// ============================================================================
// SECTION 5: REQUEST QUEUE - ENHANCED FOR DEPENDENCY WAITING AND FALLBACK
// ============================================================================

RequestQueue = {
    _queue: [],
    _isProcessing: false,
    _isPaused: false,
    _maxConcurrent: 3,
    _currentConcurrent: 0,
    _maxQueueSize: 100,
    _stats: {
        queued: 0,
        processed: 0,
        failed: 0,
        succeeded: 0,
        cancelled: 0
    },
    _dependencies: {
        config: false,
        environment: false,
        bootstrap: false,
        tokenReady: false,
        apiCoreReady: false
    },
    
    /**
     * Add request to queue
     * @param {Function} requestFn - Request function
     * @param {Object} options - Options
     * @returns {Promise} Promise that resolves with request result
     */
    add: function(requestFn, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                if (this._queue.length >= this._maxQueueSize) {
                    reject(new KnectaError(
                        'Request queue is full',
                        429,
                        'QUEUE_FULL',
                        { maxSize: this._maxQueueSize }
                    ));
                    return;
                }
                
                const requestId = this._generateRequestId();
                const requiresAuth = options.requiresAuth !== false;
                
                this._queue.push({
                    id: requestId,
                    fn: requestFn,
                    options,
                    resolve,
                    reject,
                    priority: options.priority || 0,
                    createdAt: Date.now(),
                    endpoint: options.endpoint || 'unknown',
                    requiresAuth,
                    dependencies: options.dependencies || []
                });
                
                this._stats.queued++;
                
                this._queue.sort((a, b) => b.priority - a.priority);
                
                this._process();
                
            } catch (error) {
                reject(normalizeError(error, 'Failed to queue request'));
            }
        });
    },
    
    /**
     * Check if request can be processed
     * @private
     * @param {Object} request - Request object
     * @returns {boolean} True if can process
     */
    _canProcessRequest: function(request) {
        // API Core must be ready for all requests
        if (!this._dependencies.apiCoreReady) {
            return false;
        }
        
        // Check if dependencies are satisfied
        if (request.requiresAuth) {
            const token = getUserToken('RequestQueue');
            if (!token) return false;
        }
        
        // Check custom dependencies
        if (request.dependencies && request.dependencies.length > 0) {
            for (const dep of request.dependencies) {
                if (!this._dependencies[dep]) return false;
            }
        }
        
        return true;
    },
    
    /**
     * Process queue
     * @private
     */
    _process: async function() {
        if (this._isProcessing || this._isPaused || this._queue.length === 0) {
            return;
        }
        
        this._isProcessing = true;
        
        while (this._queue.length > 0 && this._currentConcurrent < this._maxConcurrent && !this._isPaused) {
            // Find first request that can be processed based on dependencies
            const requestIndex = this._queue.findIndex(req => this._canProcessRequest(req));
            
            if (requestIndex === -1) {
                // No requests can be processed yet, wait and retry
                break;
            }
            
            const request = this._queue.splice(requestIndex, 1)[0];
            
            this._currentConcurrent++;
            
            this._executeRequest(request)
                .finally(() => {
                    this._currentConcurrent--;
                    
                    if (this._queue.length > 0 && !this._isPaused) {
                        setTimeout(() => this._process(), 0);
                    } else {
                        this._isProcessing = false;
                    }
                });
        }
        
        this._isProcessing = false;
    },
    
    /**
     * Execute request
     * @private
     * @param {Object} request - Request object
     */
    async _executeRequest(request) {
        try {
            const result = await request.fn();
            request.resolve(result);
            this._stats.succeeded++;
            this._stats.processed++;
            
        } catch (error) {
            // No retries - fail immediately
            request.reject(error);
            this._stats.failed++;
            this._stats.processed++;
        }
    },
    
    /**
     * Generate unique request ID
     * @private
     * @returns {string} Request ID
     */
    _generateRequestId: function() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    /**
     * Pause queue processing
     * @returns {boolean} Success status
     */
    pause: function() {
        this._isPaused = true;
        return true;
    },
    
    /**
     * Resume queue processing
     * @returns {boolean} Success status
     */
    resume: function() {
        this._isPaused = false;
        this._process();
        return true;
    },
    
    /**
     * Clear queue
     * @param {boolean} rejectAll - Whether to reject all pending requests
     * @returns {boolean} Success status
     */
    clear: function(rejectAll = false) {
        if (rejectAll) {
            const error = new KnectaError('Queue cleared', 0, 'QUEUE_CLEARED');
            this._queue.forEach(request => {
                request.reject(error);
                this._stats.cancelled++;
            });
        }
        
        this._queue = [];
        return true;
    },
    
    /**
     * Get queue status
     * @returns {Object} Queue status
     */
    getStatus: function() {
        return {
            queueLength: this._queue.length,
            isProcessing: this._isProcessing,
            isPaused: this._isPaused,
            currentConcurrent: this._currentConcurrent,
            maxConcurrent: this._maxConcurrent,
            maxQueueSize: this._maxQueueSize,
            stats: { ...this._stats },
            dependencies: { ...this._dependencies },
            oldestRequest: this._queue.length > 0 
                ? this._queue[0].createdAt 
                : null,
            endpoints: this._queue.map(r => r.endpoint).filter(Boolean)
        };
    },
    
    /**
     * Set maximum concurrent requests
     * @param {number} max - Maximum concurrent
     * @returns {boolean} Success status
     */
    setMaxConcurrent: function(max) {
        if (max > 0 && max <= 10) {
            this._maxConcurrent = max;
            return true;
        }
        return false;
    },
    
    /**
     * Set maximum queue size
     * @param {number} max - Maximum queue size
     * @returns {boolean} Success status
     */
    setMaxQueueSize: function(max) {
        if (max > 0) {
            this._maxQueueSize = max;
            return true;
        }
        return false;
    },
    
    /**
     * Update dependency status
     * @param {string} dependency - Dependency name
     * @param {boolean} status - Dependency status
     * @returns {boolean} Success status
     */
    updateDependency: function(dependency, status) {
        if (this._dependencies.hasOwnProperty(dependency)) {
            const oldStatus = this._dependencies[dependency];
            this._dependencies[dependency] = status;
            
            if (oldStatus !== status && status === true) {
                this._process(); // Try to process queue after dependency update
            }
            return true;
        }
        return false;
    }
};

queueRequest = RequestQueue.add.bind(RequestQueue);
processQueue = RequestQueue._process.bind(RequestQueue);
getQueueStatus = RequestQueue.getStatus.bind(RequestQueue);
clearQueue = RequestQueue.clear.bind(RequestQueue);
pauseQueue = RequestQueue.pause.bind(RequestQueue);
resumeQueue = RequestQueue.resume.bind(RequestQueue);

// ============================================================================
// ABORT CONTROLLER FUNCTIONS
// ============================================================================

/**
 * Create abort controller for request
 * @param {string} requestId - Request ID
 * @returns {AbortController} Abort controller
 */
createAbortController = function(requestId) {
    const controller = new AbortController();
    if (requestId) {
        abortControllers.set(requestId, controller);
    }
    return controller;
};

/**
 * Abort specific request
 * @param {string} requestId - Request ID
 * @returns {boolean} True if aborted
 */
abortRequest = function(requestId) {
    const controller = abortControllers.get(requestId);
    if (controller) {
        controller.abort();
        abortControllers.delete(requestId);
        return true;
    }
    return false;
};

/**
 * Abort all requests
 * @returns {boolean} True if aborted
 */
abortAllRequests = function() {
    abortControllers.forEach((controller, requestId) => {
        controller.abort();
        abortControllers.delete(requestId);
    });
    return true;
};

// ============================================================================
// PUBLIC ENDPOINTS - Don't require authentication
// ============================================================================

const PUBLIC_ENDPOINTS = [
    '/api/status', '/status', '/health', '/api/health',
    '/api/auth/login', '/auth/login',
    '/api/auth/register', '/auth/register',
    '/api/auth/forgot', '/auth/forgot-password',
    '/api/auth/reset', '/auth/reset-password',
    '/api/auth/refresh', '/auth/refresh',
    '/api/auth/logout', '/auth/logout',
    '/api/auth/verify', '/auth/verify'
];

// Authentication endpoints (may or may not require auth)
const AUTH_ENDPOINTS = [
    '/api/auth/login', '/auth/login',
    '/api/auth/register', '/auth/register',
    '/api/auth/forgot', '/auth/forgot-password',
    '/api/auth/reset', '/auth/reset-password',
    '/api/auth/refresh', '/auth/refresh',
    '/api/auth/me', '/auth/me',
    '/api/auth/verify', '/auth/verify'
];

/**
 * Check if endpoint is public (no auth required)
 * @param {string} endpoint - API endpoint
 * @returns {boolean} True if public
 */
isPublicEndpoint = function(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return false;
    
    const normalized = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    
    return PUBLIC_ENDPOINTS.some(publicEndpoint => 
        normalized === publicEndpoint ||
        normalized.startsWith(publicEndpoint + '/') ||
        normalized.startsWith(publicEndpoint + '?')
    );
};

/**
 * Check if endpoint is auth-related
 * @param {string} endpoint - API endpoint
 * @returns {boolean} True if auth endpoint
 */
isAuthEndpoint = function(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return false;
    
    const normalized = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    
    return AUTH_ENDPOINTS.some(authEndpoint => 
        normalized === authEndpoint ||
        normalized.startsWith(authEndpoint + '/') ||
        normalized.startsWith(authEndpoint + '?')
    );
};

/**
 * Check if endpoint is status/health endpoint
 * @param {string} endpoint - API endpoint
 * @returns {boolean} True if status endpoint
 */
isStatusEndpoint = function(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return false;
    
    const normalized = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    
    return normalized === '/api/status' || 
           normalized === '/status' ||
           normalized === '/api/health' || 
           normalized === '/health' ||
           normalized.startsWith('/api/status?') || 
           normalized.startsWith('/status?') ||
           normalized.startsWith('/api/status/') || 
           normalized.startsWith('/status/');
};

/**
 * Get authentication headers for endpoint
 * @param {string} endpoint - API endpoint
 * @returns {Object} Headers object
 */
getAuthHeaders = function(endpoint) {
    try {
        if (isPublicEndpoint(endpoint)) {
            return {};
        }
        if (isAuthEndpoint(endpoint)) {
            return {};
        }
        if (isStatusEndpoint(endpoint)) {
            return {};
        }
        
        const token = getUserToken('getAuthHeaders');
        if (token) {
            return { 'Authorization': `Bearer ${token}` };
        }
        
        return {};
    } catch (error) {
        console.error('[AUTH] Get auth headers error:', error);
        return {};
    }
};

// ============================================================================
// URL SECURITY VALIDATION - ENHANCED TO PREVENT UNSAFE ENDPOINT ACCESS
// ============================================================================

function isValidEndpoint(url, baseUrl) {
    try {
        // If it's a relative URL, it's safe
        if (url.startsWith('/')) {
            // Check for directory traversal attempts
            if (url.includes('..') || url.includes('./') || url.includes('.\\') || 
                url.includes('%2e%2e') || url.includes('%2E%2E') ||
                url.includes('..%5c') || url.includes('..%2f')) {
                console.warn('[API-SECURITY] Directory traversal attempt blocked:', url);
                return false;
            }
            return true;
        }
        
        // If it's an absolute URL, ensure it's allowed
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const urlObj = new URL(url);
            
            // ALLOWED DOMAINS - Add your production domain here
            const allowedDomains = [
                'moodchat-fy56.onrender.com',
                'moodfronted.onrender.com',
                'localhost',
                '127.0.0.1'
            ];
            
            // Check if the domain is in the allowed list
            if (allowedDomains.some(domain => urlObj.hostname === domain || 
                                               urlObj.hostname.endsWith('.' + domain))) {
                return true;
            }
            
            // Check if it's a subdomain of allowed domains
            if (urlObj.hostname.endsWith('.onrender.com')) {
                return true;
            }
            
            // Check if it's exactly a subdomain (e.g., api.example.com for example.com)
            const baseObj = new URL(baseUrl);
            if (urlObj.origin === baseObj.origin) {
                return true;
            }
            
            // Development-only: allow localhost - checked via SAIC state
            const isDev = SAIC.currentState === SAIC.STATES.INITIALIZING ? 
                         (CURRENT_ENVIRONMENT === 'development' || CURRENT_ENVIRONMENT === 'local') :
                         (getEnvironment && (getEnvironment() === 'development' || getEnvironment() === 'local'));
            
            if (isDev && (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1')) {
                return true;
            }
            
            console.warn('[API-SECURITY] Cross-origin request blocked:', url);
            return false;
        }
        
        console.warn('[API-SECURITY] Invalid URL format blocked:', url);
        return false;
    } catch (error) {
        console.warn('[API-SECURITY] URL validation error:', error.message);
        return false;
    }
}

// ============================================================================
// SAFE JSON PARSER UTILITY - ENHANCED FOR LOGIN RESPONSES
// ============================================================================

function safeJsonParse(value, fallback = null) {
    // If it's already an object and not null, return it
    if (value !== null && typeof value === 'object') {
        return value;
    }
    
    // If it's not a string, return fallback
    if (typeof value !== 'string') {
        return fallback;
    }
    
    // Trim whitespace
    const trimmed = value.trim();
    
    // Empty string returns fallback
    if (trimmed === '') {
        return fallback;
    }
    
    // Check if it looks like JSON (starts with { or [)
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        // FIX: For login endpoints, try to extract token from plain text
        // This handles cases where backend returns plain text token
        if (trimmed.length > 20 && (trimmed.includes('.') || /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(trimmed))) {
            // This looks like a JWT token - wrap it in a proper response structure
            return {
                success: true,
                token: trimmed,
                message: "Login successful",
                _fromPlainText: true
            };
        }
        
        // Check if it contains success indicators
        if (trimmed.toLowerCase().includes('success') || 
            trimmed.toLowerCase().includes('welcome') ||
            trimmed.toLowerCase().includes('logged in')) {
            return {
                success: true,
                message: trimmed,
                _fromPlainText: true
            };
        }
        
        return fallback;
    }
    
    // Attempt to parse
    try {
        return JSON.parse(trimmed);
    } catch (e) {
        // Return fallback on error
        return fallback;
    }
}

// ============================================================================
// CRITICAL: SINGLE AUTHORITATIVE INITIALIZATION CONTROLLER (SAIC)
// ============================================================================

const SAIC = {
    // State machine - strict enum, irreversible transitions
    STATES: {
        UNINITIALIZED: 'UNINITIALIZED',
        INITIALIZING: 'INITIALIZING',
        READY: 'READY',
        FAILED: 'FAILED'
    },
    
    currentState: 'UNINITIALIZED',
    initPromise: null,
    initLock: false,
    readyResolve: null,
    readyReject: null,
    readyPromise: null,
    initializationStartTime: 0,
    stageResults: {},
    errors: [],
    
    // Initialize SAIC itself
    initialize() {
        if (this.readyPromise) return;
        
        this.readyPromise = new Promise((resolve, reject) => {
            this.readyResolve = resolve;
            this.readyReject = reject;
        });
        
        // STABILIZED: No timeout-based forced readiness
        // System becomes READY only through proper initialization
    },
    
    // Strict state transition - single authority
    transitionTo(newState, error = null) {
        const validTransitions = {
            [this.STATES.UNINITIALIZED]: [this.STATES.INITIALIZING, this.STATES.FAILED],
            [this.STATES.INITIALIZING]: [this.STATES.READY, this.STATES.FAILED],
            [this.STATES.READY]: [], // No transitions from READY
            [this.STATES.FAILED]: []  // No transitions from FAILED
        };
        
        if (!validTransitions[this.currentState].includes(newState)) {
            const error = new Error(`Invalid state transition: ${this.currentState} -> ${newState}`);
            console.error('[SAIC]', error.message);
            
            // Log but don't throw - we're in production
            if (this.currentState === this.STATES.READY && newState !== this.STATES.READY) {
                console.error('[SAIC] CRITICAL: Attempted to leave READY state - blocked');
                return false;
            }
            
            return false;
        }
        
        const oldState = this.currentState;
        this.currentState = newState;
        
        console.log(`[SAIC] State transition: ${oldState} -> ${newState}`, {
            timestamp: new Date().toISOString(),
            duration: Date.now() - this.initializationStartTime,
            hasError: !!error
        });
        
        if (error) {
            this.errors.push({
                state: oldState,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        }
        
        if (newState === this.STATES.READY && this.readyResolve) {
            this.readyResolve({
                success: true,
                stages: this.stageResults,
                timestamp: new Date().toISOString()
            });
        }
        
        if (newState === this.STATES.FAILED && this.readyReject) {
            this.readyReject(error || new Error('Initialization failed'));
        }
        
        return true;
    },
    
    // Record stage completion
    recordStage(stage, success, result = null) {
        this.stageResults[stage] = {
            success,
            result,
            timestamp: new Date().toISOString(),
            duration: Date.now() - this.initializationStartTime
        };
        
        console.log(`[SAIC] Stage ${stage}: ${success ? '✓' : '✗'}`, {
            duration: Date.now() - this.initializationStartTime,
            result
        });
    },
    
    // Get current state
    getState() {
        return {
            state: this.currentState,
            initialized: this.currentState === this.STATES.READY,
            initializing: this.currentState === this.STATES.INITIALIZING,
            failed: this.currentState === this.STATES.FAILED,
            stages: this.stageResults,
            errors: this.errors,
            duration: Date.now() - this.initializationStartTime
        };
    },
    
    // Check if initialization can proceed
    canInitialize() {
        return this.currentState === this.STATES.UNINITIALIZED && !this.initLock;
    },
    
    // Lock initialization
    acquireLock() {
        if (this.initLock) return false;
        this.initLock = true;
        this.initializationStartTime = Date.now();
        return true;
    },
    
    // Release lock
    releaseLock() {
        this.initLock = false;
    }
};

// Initialize SAIC immediately
SAIC.initialize();

// ============================================================================
// GLOBAL SINGLETON GUARD - MUST BE FIRST EXECUTION
// ============================================================================

(function(global) {
    "use strict";
    
    if (typeof window === 'undefined' && typeof global === 'undefined') {
        return;
    }
    
    const root = global || window;
    
    // CRITICAL: Singleton guard - if already loaded with same or newer version, return early
    if (root.__API_CORE_LOADED_V23) {
        const existing = root.__API_CORE;
        
        // Check version - if ours is newer, we should load (but preserve features)
        if (existing && existing.version && existing.version >= '23.0.8') {
            console.log('[API-CORE] Already loaded v' + existing.version + ', skipping initialization');
            
            // Ensure all bridge properties exist
            if (!root.api) root.api = {};
            if (!root.api.core) {
                root.api.core = {
                    ready: existing.ready || Promise.resolve(true),
                    waitFor: function() { return existing.ready || Promise.resolve(true); },
                    whenReady: function(cb) { 
                        const p = existing.ready || Promise.resolve(true);
                        if (cb) p.then(cb).catch(() => {});
                        return p;
                    },
                    isReady: function() { return existing.initialized === true; },
                    getStatus: function() { return existing.getStatus ? existing.getStatus() : { ready: true }; },
                    init: function() { return existing.ready || Promise.resolve(true); }
                };
            }
            
            return existing;
        }
        
        // If older version, we'll overwrite but preserve critical data
        console.log('[API-CORE] Upgrading from v' + (existing ? existing.version : 'unknown') + ' to v23.0.8');
    }
    
    // Set loaded flag immediately to prevent parallel initialization
    root.__API_CORE_LOADED_V23 = '23.0.8';
    
    // ============================================================================
    // GLOBAL REGISTRATION - MUST EXIST IMMEDIATELY
    // ============================================================================
    
    if (!root.__API_CORE) {
        root.__API_CORE = {};
    }
    
    // Prevent multiple bootstrapping using SAIC state
    if (root.__API_CORE.__bootstrapped && SAIC.currentState !== SAIC.STATES.UNINITIALIZED) {
        console.log('[API-CORE] Already bootstrapped, skipping');
        return;
    }
    
    // Mark bootstrapping started
    root.__API_CORE.__bootstrapped = true;
    
    // ============================================================================
    // READY PROMISE SYSTEM - NOW CONTROLLED BY SAIC
    // ============================================================================
    
    // STABILIZED: No timeout-based forced readiness - removed completely
    
    // ============================================================================
    // REQUIRED EXPOSED PROPERTIES - MUST ALL EXIST
    // ============================================================================
    
    const requiredProperties = {
        version: '23.0.8',
        initialized: false,
        ready: SAIC.readyPromise,
        secureApiFetch: null,
        getUserToken: getUserToken,
        setUserToken: setUserToken,
        clearUserToken: clearUserToken,
        _apiCache: new Map(),
        _apiRequestQueue: [],
        _events: {},
        on: function(event, handler) {
            try {
                if (!this._events[event]) {
                    this._events[event] = [];
                }
                this._events[event].push(handler);
                return () => this.off(event, handler);
            } catch (e) {
                console.warn('[API-CORE] on error:', e);
                return function() {};
            }
        },
        emit: function(event, data) {
            try {
                if (this._events[event]) {
                    this._events[event].forEach(handler => {
                        try { handler(data); } catch (e) {}
                    });
                }
                root.dispatchEvent(new CustomEvent(`api:${event}`, { detail: data }));
            } catch (e) {
                console.warn('[API-CORE] emit error:', e);
            }
        },
        off: function(event, handler) {
            try {
                if (this._events[event]) {
                    this._events[event] = this._events[event].filter(h => h !== handler);
                }
            } catch (e) {}
        },
        __resolveReady: function(value) { /* Legacy - now handled by SAIC */ },
        __rejectReady: function(error) { /* Legacy - now handled by SAIC */ }
    };
    
    // Assign required properties
    Object.assign(root.__API_CORE, requiredProperties);
    
    // ============================================================================
    // LEGACY COMPATIBILITY LAYER - PRESERVE ALL EXISTING FUNCTIONALITY
    // ============================================================================
    
    // Ensure window.api.core exists with minimal safe surface
    if (!root.api) root.api = {};
    if (!root.api.core) {
        root.api.core = {
            __initializing: true,
            __version: '23.0.8'
        };
    }
    
    // Ensure window.api.core.waitFor exists IMMEDIATELY
    root.api.core.waitFor = function() {
        return SAIC.readyPromise;
    };
    
    // Ensure window.api.core.ready exists IMMEDIATELY
    root.api.core.ready = SAIC.readyPromise;
    
    // Ensure window.api.core.isReady exists
    root.api.core.isReady = function() {
        return SAIC.currentState === SAIC.STATES.READY;
    };
    
    // Ensure window.api.core.whenReady exists (legacy callback support)
    root.api.core.whenReady = function(callback) {
        if (typeof callback === 'function') {
            SAIC.readyPromise.then(callback).catch(() => {});
        }
        return SAIC.readyPromise;
    };
    
    // Ensure window.api.core.getStatus exists
    root.api.core.getStatus = function() {
        return {
            ready: SAIC.currentState === SAIC.STATES.READY,
            initializing: SAIC.currentState === SAIC.STATES.INITIALIZING,
            failed: SAIC.currentState === SAIC.STATES.FAILED,
            version: root.__API_CORE.version,
            state: SAIC.currentState,
            stages: SAIC.stageResults,
            dependencies: {
                request: typeof root.api.request !== 'undefined',
                auth: typeof root.api.auth !== 'undefined',
                bootstrap: typeof root.app?.core?.bootstrap !== 'undefined',
                session: typeof root.app?.core?.session !== 'undefined'
            },
            timestamp: new Date().toISOString()
        };
    };
    
    // Ensure window.api.core.init exists
    root.api.core.init = function() {
        return SAIC.readyPromise;
    };
    
    // Ensure window.api.core.diagnostics exists
    root.api.core.diagnostics = {
        startupTime: Date.now(),
        checks: {},
        errors: []
    };
    
    // ============================================================================
    // SECTION 7: USER AND TOKEN FUNCTIONS
    // ============================================================================

    /**
     * Get current user data
     * @returns {Object|null} User data or null
     */
    getCurrentUser = function() {
        try {
            if (root.currentUser) {
                return root.currentUser;
            }
            
            // Try to get user from storage first
            const storedUser = _getUserFromStorage();
            if (storedUser) {
                root.currentUser = storedUser;
                return storedUser;
            }
            
            if (SecureStorage) {
                const userDataStr = SecureStorage.getItem('USER_DATA', true, true);
                if (userDataStr) {
                    root.currentUser = userDataStr;
                    return userDataStr;
                }
            }
            
            try {
                const authUserStr = localStorage.getItem('authUser');
                if (authUserStr) {
                    const authUser = JSON.parse(authUserStr);
                    const user = authUser.user || authUser;
                    if (user && (user.id || user.email || user.username)) {
                        if (setUserData) {
                            setUserData(user, true);
                        }
                        return user;
                    }
                }
            } catch (e) {}
            
            return null;
        } catch (error) {
            console.error('[USER] Get current user error:', error);
            return null;
        }
    };
    
    /**
     * Set user data
     * @param {Object} userData - User data
     * @param {boolean} skipLegacy - Skip legacy storage
     * @returns {boolean} Success status
     */
    setUserData = function(userData, skipLegacy = false) {
        try {
            if (!userData || typeof userData !== 'object') {
                console.error('[USER] Invalid user data');
                return false;
            }
            
            const safeData = JSON.parse(JSON.stringify(userData));
            
            if (SecureStorage) {
                SecureStorage.setItem('USER_DATA', safeData, true);
            }
            root.currentUser = safeData;
            
            // Save to main auth storage as well
            const currentToken = getUserToken();
            if (currentToken) {
                _saveAuthToStorage(currentToken, safeData);
            }
            
            if (!skipLegacy) {
                try {
                    localStorage.setItem('moodchat_auth_user', JSON.stringify(safeData));
                    
                    const authUserStr = localStorage.getItem('authUser');
                    if (authUserStr) {
                        const authUser = JSON.parse(authUserStr);
                        authUser.user = safeData;
                        localStorage.setItem('authUser', JSON.stringify(authUser));
                    }
                } catch (e) {}
            }
            
            root.dispatchEvent(new CustomEvent('user-updated', {
                detail: { user: safeData, timestamp: new Date().toISOString() }
            }));
            
            root.__API_CORE.emit('user-updated', { user: safeData });
            
            return true;
        } catch (error) {
            console.error('[USER] Set user data error:', error);
            return false;
        }
    };
    
    getUserData = getCurrentUser;
    updateCurrentUser = setUserData;
    
    /**
     * Clear all authentication data
     * @param {string} source - Source of the clear
     * @returns {boolean} Success status
     */
    clearAllAuthData = function(source = 'unknown') {
        try {
            clearUserToken(source);
            
            if (SecureStorage) {
                SecureStorage.removeItem('USER_DATA');
                SecureStorage.removeItem('SESSION_DATA');
            }
            root.currentUser = null;
            
            // Clear main auth storage
            _clearAuthFromStorage();
            
            const legacyKeys = [
                'accessToken', 'moodchat_token', 'token', 'moodchat_auth_token',
                'authToken', 'authUser', 'moodchat_auth_user', 'userData',
                'currentUser', 'user', 'jwt', 'access_token'
            ];
            
            legacyKeys.forEach(key => {
                try { localStorage.removeItem(key); } catch (e) {}
            });
            
            root.dispatchEvent(new CustomEvent('auth-data-cleared', {
                detail: { 
                    timestamp: new Date().toISOString(),
                    source: source
                }
            }));
            
            root.__API_CORE.emit('auth-data-cleared', { source: source });
            
            return true;
        } catch (error) {
            console.error('[AUTH] Clear all auth data error:', error);
            return false;
        }
    };
    
    tokenReady = function() {
        return SAIC.readyPromise;
    };
    
    /**
     * Check if session is valid
     * @returns {boolean} True if valid
     */
    isSessionValid = function() {
        const token = getUserToken('isSessionValid');
        const user = getCurrentUser();
        
        // Only clear session if no token AND no stored token
        if (!token && !_getTokenFromStorage()) {
            return false;
        }
        
        return !!(token && user) && (TokenManager ? !TokenManager.isTokenExpired() : true);
    };
    
    validateSession = async function() {
        return isSessionValid();
    };
    
    /**
     * Get session data
     * @returns {Object} Session data
     */
    getSession = function() {
        return {
            token: getUserToken('getSession'),
            user: getCurrentUser(),
            expires: TokenManager ? TokenManager.getTokenExpiry() : null,
            created: TokenManager ? TokenManager.getTokenCreated() : null,
            valid: isSessionValid(),
            timestamp: new Date().toISOString()
        };
    };
    
    getSessionData = getSession;
    
    /**
     * Set session data
     * @param {Object} data - Session data
     * @returns {boolean} Success status
     */
    setSessionData = function(data) {
        try {
            if (data.token) {
                setUserToken(data.token, true, 'setSessionData');
            }
            if (data.user) {
                setUserData(data.user);
            }
            return true;
        } catch (error) {
            console.error('[SESSION] Set session data error:', error);
            return false;
        }
    };
    
    updateSession = setSessionData;
    clearSession = clearAllAuthData;
    initSession = initializeTokenSystem;
    
    isAuthenticated = function() {
        return isSessionValid();
    };
    
    secureFetch = secureApiFetch;
    request = secureApiFetch;
    api = secureApiFetch;
    apiRequest = secureApiFetch;
    apiCall = secureApiFetch;
    callApi = secureApiFetch;
    
    /**
     * API GET request
     * @param {string} endpoint - API endpoint
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} Response
     */
    apiGet = async function(endpoint, params = {}) {
        return get(endpoint, params);
    };
    
    /**
     * API POST request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @returns {Promise<Object>} Response
     */
    apiPost = async function(endpoint, data = {}) {
        return post(endpoint, data);
    };
    
    /**
     * API PUT request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @returns {Promise<Object>} Response
     */
    apiPut = async function(endpoint, data = {}) {
        return put(endpoint, data);
    };
    
    /**
     * API DELETE request
     * @param {string} endpoint - API endpoint
     * @returns {Promise<Object>} Response
     */
    apiDelete = async function(endpoint) {
        return del(endpoint);
    };
    
    apiCallWithRetry = async function(endpoint, options = {}, maxRetries = 3) {
        console.warn('[API] apiCallWithRetry is deprecated - using apiCall instead');
        return secureApiFetch(endpoint, options);
    };
    
    // ============================================================================
    // SECTION 8: AUTHENTICATION FUNCTIONS - ENHANCED
    // ============================================================================
    
    /**
     * Login user
     * @param {Object} credentials - Login credentials
     * @returns {Promise<Object>} Login response
     */
    login = async function(credentials) {
        try {
            const response = await secureApiFetch('/api/auth/login', {
                method: 'POST',
                body: credentials,
                auth: false,
                _isLogin: true
            });
            
            if (response && response.data) {
                const token = response.data.token || 
                            response.data.accessToken || 
                            response.data.jwt ||
                            (typeof response.data === 'string' && response.data.length > 20 ? response.data : null);
                
                if (token) {
                    // Update single source of truth - skip manager to prevent recursion
                    setUserToken(token, true, 'login');
                    
                    if (TokenManager) {
                        const refreshToken = response.data.refreshToken || null;
                        const expiresIn = response.data.expiresIn || 3600;
                        TokenManager.setToken(token, refreshToken, expiresIn);
                    }
                    
                    RequestQueue.updateDependency('tokenReady', true);
                    
                    const user = response.data.user || 
                               response.data.data || 
                               (response.data._fromPlainText ? { id: 'user', email: credentials.identifier || credentials.email } : null);
                    
                    if (user && setUserData) {
                        setUserData(user);
                        // Save to storage with user data
                        _saveAuthToStorage(token, user);
                    } else {
                        // Save token only if no user data
                        _saveAuthToStorage(token);
                    }
                    
                    root.dispatchEvent(new CustomEvent('user-logged-in', {
                        detail: {
                            user: user || { email: credentials.identifier || credentials.email },
                            timestamp: new Date().toISOString()
                        }
                    }));
                    
                    root.__API_CORE.emit('user-logged-in', { user: user || { email: credentials.identifier || credentials.email } });
                    
                    // Log login success once
                    if (!_loginSuccessLogged) {
                        console.log('[API] ✅ Login successful - token stored from login()');
                        _loginSuccessLogged = true;
                    }
                }
            }
            
            if (response && response.data && typeof response.data === 'string') {
                const trimmed = response.data.trim();
                if (trimmed.toLowerCase().includes('success') || 
                    trimmed.toLowerCase().includes('welcome') ||
                    trimmed.toLowerCase().includes('logged in')) {
                    
                    const possibleToken = trimmed.match(/[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/);
                    if (possibleToken) {
                        setUserToken(possibleToken[0], true, 'login.plaintext');
                        RequestQueue.updateDependency('tokenReady', true);
                        _saveAuthToStorage(possibleToken[0]);
                    }
                }
            }
            
            return response;
            
        } catch (error) {
            console.error('[API-LOGIN] Login error:', error);
            throw normalizeError(error, 'Login failed');
        }
    };
    
    /**
     * Logout user
     * @returns {Promise<Object>} Logout response
     */
    logout = async function() {
        try {
            const token = getUserToken('logout');
            
            if (token) {
                try {
                    await secureApiFetch('/api/auth/logout', {
                        method: 'POST',
                        auth: true
                    });
                } catch (e) {
                    // Ignore logout errors
                }
            }
        } catch (e) {}
        
        clearAllAuthData('logout');
        
        RequestQueue.updateDependency('tokenReady', false);
        
        root.dispatchEvent(new CustomEvent('user-logged-out', {
            detail: { timestamp: new Date().toISOString() }
        }));
        
        root.__API_CORE.emit('user-logged-out', {});
        
        console.log('[API] 👋 User logged out');
        
        return { success: true, message: 'Logged out successfully' };
    };
    
    /**
     * Register new user
     * @param {Object} userData - Registration data
     * @returns {Promise<Object>} Registration response
     */
    register = async function(userData) {
        return secureApiFetch('/api/auth/register', {
            method: 'POST',
            body: userData,
            auth: false
        });
    };
    
    /**
     * Forgot password
     * @param {string} email - User email
     * @returns {Promise<Object>} Response
     */
    forgotPassword = async function(email) {
        return secureApiFetch('/api/auth/forgot', {
            method: 'POST',
            body: { email },
            auth: false
        });
    };
    
    /**
     * Reset password
     * @param {string} token - Reset token
     * @param {string} newPassword - New password
     * @returns {Promise<Object>} Response
     */
    resetPassword = async function(token, newPassword) {
        return secureApiFetch('/api/auth/reset', {
            method: 'POST',
            body: { token, newPassword },
            auth: false
        });
    };
    
    /**
     * Refresh authentication token
     * @returns {Promise<Object>} Refresh response
     */
    refreshToken = async function() {
        const refreshTokenValue = TokenManager ? TokenManager.getRefreshToken() : null;
        
        if (!refreshTokenValue) {
            return { success: false, message: 'No refresh token available' };
        }
        
        try {
            const response = await secureApiFetch('/api/auth/refresh', {
                method: 'POST',
                body: { refreshToken: refreshTokenValue },
                auth: false
            });
            
            if (response && response.success && response.data) {
                const newToken = response.data.token || response.data.accessToken;
                const newRefreshToken = response.data.refreshToken || refreshTokenValue;
                const expiresIn = response.data.expiresIn || 3600;
                
                if (newToken) {
                    setUserToken(newToken, true, 'token.refresh');
                    if (TokenManager) {
                        TokenManager.setToken(newToken, newRefreshToken, expiresIn);
                    }
                    _saveAuthToStorage(newToken, getCurrentUser());
                }
            }
            
            return response;
        } catch (error) {
            return { success: false, error: error.message };
        }
    };
    
    /**
     * Validate authentication
     * @returns {Promise<boolean>} True if valid
     */
    validateAuth = async function() {
        const token = getUserToken('validateAuth');
        
        if (!token) {
            return false;
        }
        
        if (TokenManager && TokenManager.isTokenExpired()) {
            const refreshResult = await refreshToken();
            if (!refreshResult.success) {
                return false;
            }
        }
        
        try {
            const response = await secureApiFetch('/api/auth/me', {
                method: 'GET',
                retries: 1
            });
            
            if (response && response.success && response.data && response.data.user) {
                setUserData(response.data.user);
                return true;
            }
        } catch (error) {
            return false;
        }
        
        return false;
    };
    
    checkAuth = validateAuth;
    
    checkAuthMe = async function() {
        return secureApiFetch('/api/auth/me', { 
            method: 'GET'
        });
    };
    
    /**
     * Update global access token reference
     * @returns {string|null} Updated token
     */
    updateGlobalAccessToken = function() {
        const token = getUserToken('updateGlobalAccessToken');
        root.__GLOBAL_TOKEN = token;
        return token;
    };
    
    /**
     * Handle unauthorized access - Enhanced with debounce and event emission
     * Only clears session if no token in storage
     */
    handleUnauthorizedAccess = (function() {
        let timeoutId = null;
        let lastTriggerTime = 0;
        const THROTTLE_MS = 2000; // Prevent multiple triggers within 2 seconds
        
        return function(options = {}) {
            const now = Date.now();
            
            // Throttle to prevent multiple rapid calls
            if (now - lastTriggerTime < THROTTLE_MS) {
                return;
            }
            
            lastTriggerTime = now;
            
            if (localStorage.getItem('_auth_clearing_in_progress')) {
                return;
            }
            
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            // Check if we have a token in storage before clearing
            const storedToken = _getTokenFromStorage();
            
            if (!storedToken) {
                // No stored token, safe to clear
                clearUserToken('handleUnauthorizedAccess');
                
                // Emit event for EventBus listeners (non-blocking)
                root.dispatchEvent(new CustomEvent('auth:unauthorized-handled', {
                    detail: {
                        timestamp: new Date().toISOString(),
                        source: options.source || 'api',
                        hadStoredToken: !!storedToken
                    }
                }));
                
                // Set flag to prevent further requests until resolved
                localStorage.setItem('_auth_clearing_in_progress', 'true');
                
                RequestQueue.updateDependency('tokenReady', false);
                
                // Debounced redirect to login
                if (!root.location.pathname.includes('/login') && 
                    !root.location.pathname.includes('index.html') &&
                    !root.location.pathname.includes('/register') &&
                    !root.location.pathname.includes('/forgot-password')) {
                    
                    timeoutId = setTimeout(() => {
                        // Only redirect if still not authenticated after delay
                        const stillHasToken = getUserToken('redirect.check');
                        if (!stillHasToken && !_getTokenFromStorage()) {
                            root.location.href = '/login?reason=session_expired';
                        }
                        localStorage.removeItem('_auth_clearing_in_progress');
                        timeoutId = null;
                    }, 500);
                } else {
                    // Already on login page, just clear the flag
                    setTimeout(() => {
                        localStorage.removeItem('_auth_clearing_in_progress');
                    }, 1000);
                }
            } else {
                // We have a stored token but memory token is invalid, try to restore
                console.log('[API] Attempting to restore token from storage after 401');
                setUserToken(storedToken, false, '401.restore');
            }
        };
    })();
    
    getApiBaseUrl = getBaseUrl;
    getBackendBaseUrl = getBaseUrl;
    
    /**
     * Initialize token system
     * @returns {Object} Token and user info
     */
    initializeTokenSystem = function() {
        // First try to restore from storage
        _restoreTokenFromStorage();
        
        if (migrateLegacyTokens) {
            migrateLegacyTokens();
        }
        const token = getUserToken('initializeTokenSystem');
        const user = getCurrentUser();
        if (updateGlobalAccessToken) {
            updateGlobalAccessToken();
        }
        
        RequestQueue.updateDependency('tokenReady', !!token);
        
        return { token, user };
    };
    
    // ============================================================================
    // SECTION 9: OPEN CHAT FUNCTIONS - PRESERVED WITH ENHANCEMENTS
    // ============================================================================
    
    /**
     * Open chat interface
     * @param {string} userId - User ID
     * @param {string} chatId - Chat ID
     * @param {Object} options - Options
     * @returns {Object} Result
     */
    openChat = function(userId, chatId = null, options = {}) {
        try {
            if (!userId && !chatId && !(options && options.groupId)) {
                throw new KnectaError(
                    'Either userId, chatId, or groupId must be provided',
                    400,
                    'INVALID_CHAT_PARAMETERS'
                );
            }
            
            const currentUser = getCurrentUser();
            const targetUserId = userId || (options && options.user && options.user.id);
            
            let url = '/message.html';
            const params = new URLSearchParams();
            
            if (chatId) {
                params.append('chatId', chatId);
                params.append('type', 'direct');
            } else if (targetUserId) {
                params.append('userId', targetUserId);
                params.append('type', 'direct');
            }
            
            if (options && options.groupId) {
                params.append('groupId', options.groupId);
                params.append('type', 'group');
            }
            
            if (options && options.message) {
                params.append('message', encodeURIComponent(options.message));
            }
            
            if (options && options.focus === false) {
                params.append('focus', 'false');
            }
            
            if (options && options.theme) {
                params.append('theme', options.theme);
            }
            
            if (options && options.initialTab) {
                params.append('tab', options.initialTab);
            }
            
            const paramsString = params.toString();
            if (paramsString) {
                url += '?' + paramsString;
            }
            
            const navigationEvent = new CustomEvent('chat-navigation', {
                detail: {
                    userId: targetUserId,
                    chatId: chatId,
                    groupId: options && options.groupId,
                    options: options,
                    url: url,
                    timestamp: new Date().toISOString(),
                    source: 'api-core'
                }
            });
            
            root.dispatchEvent(navigationEvent);
            
            if (options && options.background === true) {
                const newWindow = root.open(url, '_blank');
                if (newWindow) {
                    newWindow.opener = null;
                    return {
                        success: true,
                        url: url,
                        background: true,
                        timestamp: new Date().toISOString()
                    };
                }
                throw new KnectaError('Failed to open background tab', 500, 'POPUP_BLOCKED');
            }
            
            if (options && options.replace === true) {
                root.history.replaceState({
                    chatId: chatId,
                    userId: targetUserId,
                    groupId: options && options.groupId,
                    timestamp: new Date().toISOString()
                }, '', url);
                
                const loadEvent = new CustomEvent('load-chat', {
                    detail: {
                        userId: targetUserId,
                        chatId: chatId,
                        groupId: options && options.groupId,
                        options: options
                    }
                });
                root.dispatchEvent(loadEvent);
                
                return {
                    success: true,
                    url: url,
                    replace: true,
                    timestamp: new Date().toISOString()
                };
            }
            
            if (root.location.pathname.includes('message.html')) {
                root.history.pushState({
                    chatId: chatId,
                    userId: targetUserId,
                    groupId: options && options.groupId,
                    timestamp: new Date().toISOString()
                }, '', url);
                
                const loadEvent = new CustomEvent('load-chat', {
                    detail: {
                        userId: targetUserId,
                        chatId: chatId,
                        groupId: options && options.groupId,
                        options: options
                    }
                });
                root.dispatchEvent(loadEvent);
                
                return {
                    success: true,
                    url: url,
                    replaced: true,
                    timestamp: new Date().toISOString()
                };
            }
            
            root.location.href = url;
            
            return {
                success: true,
                url: url,
                userId: targetUserId,
                chatId: chatId,
                groupId: options && options.groupId,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            const normalizedError = normalizeError(error, 'Failed to open chat');
            
            try {
                let fallbackUrl = '/message.html';
                if (userId || chatId || (options && options.groupId)) {
                    fallbackUrl += '?';
                    if (chatId) {
                        fallbackUrl += `chatId=${chatId}`;
                    } else if (userId) {
                        fallbackUrl += `userId=${userId}`;
                    } else if (options && options.groupId) {
                        fallbackUrl += `groupId=${options.groupId}`;
                    }
                }
                
                root.open(fallbackUrl, '_blank');
                
                return {
                    success: true,
                    url: fallbackUrl,
                    fallback: true,
                    error: normalizedError.toJSON()
                };
            } catch (fallbackError) {
                return {
                    success: false,
                    error: normalizedError.toJSON(),
                    message: normalizedError.message
                };
            }
        }
    };
    
    /**
     * Close chat
     * @param {string} chatId - Chat ID
     * @returns {Object} Result
     */
    closeChat = function(chatId) {
        try {
            const closeEvent = new CustomEvent('close-chat', {
                detail: {
                    chatId: chatId,
                    timestamp: new Date().toISOString()
                }
            });
            
            root.dispatchEvent(closeEvent);
            
            return {
                success: true,
                chatId: chatId,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                success: false,
                error: normalizeError(error).toJSON()
            };
        }
    };
    
    /**
     * Minimize chat
     * @param {string} chatId - Chat ID
     * @returns {Object} Result
     */
    minimizeChat = function(chatId) {
        try {
            const minimizeEvent = new CustomEvent('minimize-chat', {
                detail: {
                    chatId: chatId,
                    timestamp: new Date().toISOString()
                }
            });
            
            root.dispatchEvent(minimizeEvent);
            
            return {
                success: true,
                chatId: chatId,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                success: false,
                error: normalizeError(error).toJSON()
            };
        }
    };
    
    /**
     * Maximize chat
     * @param {string} chatId - Chat ID
     * @returns {Object} Result
     */
    maximizeChat = function(chatId) {
        try {
            const maximizeEvent = new CustomEvent('maximize-chat', {
                detail: {
                    chatId: chatId,
                    timestamp: new Date().toISOString()
                }
            });
            
            root.dispatchEvent(maximizeEvent);
            
            return {
                success: true,
                chatId: chatId,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                success: false,
                error: normalizeError(error).toJSON()
            };
        }
    };
    
    /**
     * Send chat message
     * @param {string} chatId - Chat ID
     * @param {string} content - Message content
     * @param {Object} options - Options
     * @returns {Promise<Object>} Response
     */
    sendChatMessage = async function(chatId, content, options = {}) {
        try {
            if (!chatId) {
                throw new KnectaError('Chat ID is required', 400, 'MISSING_CHAT_ID');
            }
            
            if (!content) {
                throw new KnectaError('Message content is required', 400, 'MISSING_MESSAGE_CONTENT');
            }
            
            const response = await secureApiFetch(`/api/chats/${chatId}/messages`, {
                method: 'POST',
                body: {
                    content: content,
                    type: options.type || 'text',
                    metadata: options.metadata || {}
                }
            });
            
            return response;
            
        } catch (error) {
            throw normalizeError(error, 'Failed to send message');
        }
    };
    
    /**
     * Get chat history
     * @param {string} chatId - Chat ID
     * @param {number} limit - Message limit
     * @param {string} before - Cursor for pagination
     * @returns {Promise<Object>} Response
     */
    getChatHistory = async function(chatId, limit = 50, before = null) {
        try {
            let url = `/api/chats/${chatId}/messages?limit=${limit}`;
            if (before) {
                url += `&before=${before}`;
            }
            
            return await secureApiFetch(url, {
                method: 'GET'
            });
            
        } catch (error) {
            throw normalizeError(error, 'Failed to get chat history');
        }
    };
    
    /**
     * Get unread message count
     * @returns {Promise<Object>} Response
     */
    getUnreadCount = async function() {
        try {
            const response = await secureApiFetch('/api/chats/unread', {
                method: 'GET'
            });
            
            return response;
            
        } catch (error) {
            throw normalizeError(error, 'Failed to get unread count');
        }
    };
    
    /**
     * Mark chat as read
     * @param {string} chatId - Chat ID
     * @returns {Promise<Object>} Response
     */
    markChatAsRead = async function(chatId) {
        try {
            if (!chatId) {
                throw new KnectaError('Chat ID is required', 400, 'MISSING_CHAT_ID');
            }
            
            const response = await secureApiFetch(`/api/chats/${chatId}/read`, {
                method: 'POST'
            });
            
            const readEvent = new CustomEvent('chat-marked-read', {
                detail: {
                    chatId: chatId,
                    timestamp: new Date().toISOString()
                }
            });
            
            root.dispatchEvent(readEvent);
            
            return response;
            
        } catch (error) {
            throw normalizeError(error, 'Failed to mark chat as read');
        }
    };
    
    // ============================================================================
    // SECTION 10: API FUNCTIONS - ALL PRESERVED
    // ============================================================================
    
    getTeamMembers = async function(teamId) {
        const url = teamId ? `/api/teams/${teamId}/members` : '/api/teams/members';
        return get(url);
    };
    
    getTrustScoreClass = function(score) {
        if (!score && score !== 0) return 'trust-unknown';
        if (score >= 90) return 'trust-excellent';
        if (score >= 75) return 'trust-very-high';
        if (score >= 60) return 'trust-high';
        if (score >= 40) return 'trust-medium';
        if (score >= 25) return 'trust-low';
        if (score >= 10) return 'trust-very-low';
        return 'trust-minimal';
    };
    
    getTrustScoreDescription = function(score) {
        if (!score && score !== 0) return 'Unknown';
        if (score >= 90) return 'Excellent';
        if (score >= 75) return 'Very High';
        if (score >= 60) return 'High';
        if (score >= 40) return 'Medium';
        if (score >= 25) return 'Low';
        if (score >= 10) return 'Very Low';
        return 'Minimal';
    };
    
    navigateToCall = function(callId) {
        try {
            const url = `/call.html?callId=${callId}`;
            
            if (root.location.pathname.includes('chat.html') || 
                root.location.pathname.includes('message.html')) {
                root.location.href = url;
            } else {
                root.open(url, '_blank');
            }
            
            return { success: true, callId, url };
        } catch (error) {
            return { success: false, message: error.message };
        }
    };
    
    getUserFriends = async function() {
        return get('/api/friends');
    };
    
    navigateToChat = function(chatId, userId = null) {
        return openChat(userId, chatId);
    };
    
    getUserGroups = async function() {
        return get('/api/group/user');
    };
    
    /**
     * Show notification
     * @param {string} message - Notification message
     * @param {string} type - Notification type
     * @param {number} duration - Duration in ms
     * @returns {Object} Result
     */
    showNotification = function(message, type = 'info', duration = 3000) {
        try {
            const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const notification = document.createElement('div');
            notification.id = id;
            notification.className = `notification notification-${type}`;
            
            const colors = {
                success: '#4CAF50',
                warning: '#FF9800',
                error: '#F44336',
                info: '#2196F3',
                default: '#2196F3'
            };
            
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                background: ${colors[type] || colors.default};
                color: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 9999;
                max-width: 350px;
                font-size: 14px;
                line-height: 1.5;
                display: flex;
                align-items: center;
                gap: 8px;
                animation: slideInRight 0.3s ease;
                pointer-events: auto;
            `;
            
            const iconMap = {
                success: '✓',
                warning: '⚠',
                error: '✕',
                info: 'ℹ'
            };
            
            notification.innerHTML = `
                <span style="font-size: 16px; font-weight: bold;">${iconMap[type] || '•'}</span>
                <span>${escapeHtml ? escapeHtml(message) : message}</span>
                <button style="
                    margin-left: auto;
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 18px;
                    padding: 0 4px;
                    opacity: 0.7;
                " onclick="this.parentElement.remove()">×</button>
            `;
            
            document.body.appendChild(notification);
            
            if (duration > 0) {
                setTimeout(() => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.style.animation = 'slideOutRight 0.3s ease';
                        setTimeout(() => el.remove(), 300);
                    }
                }, duration);
            }
            
            return { success: true, id };
            
        } catch (error) {
            console.error('[NOTIFICATION] Error:', error);
            return { success: false };
        }
    };
    
    inviteTeamMember = async function(email, role = 'member') {
        return post('/api/teams/invite', { email, role });
    };
    
    acceptGroupInvite = async function(inviteId) {
        return post(`/api/group/invites/${inviteId}/accept`, {});
    };
    
    getMessageTypes = function() {
        return {
            TEXT: 'text',
            IMAGE: 'image',
            VIDEO: 'video',
            AUDIO: 'audio',
            FILE: 'file',
            LOCATION: 'location',
            SYSTEM: 'system',
            CALL: 'call',
            GROUP_CREATE: 'group_create',
            GROUP_JOIN: 'group_join',
            GROUP_LEAVE: 'group_leave',
            FRIEND_REQUEST: 'friend_request',
            FRIEND_ACCEPT: 'friend_accept',
            FRIEND_REJECT: 'friend_reject',
            TYPING: 'typing',
            READ: 'read',
            DELIVERED: 'delivered'
        };
    };
    
    simulateContactSync = function() {
        console.log('[MOCK] Contact sync simulated');
        return {
            success: true,
            message: 'Contact sync completed',
            syncedContacts: 0,
            newContacts: 0,
            timestamp: new Date().toISOString()
        };
    };
    
    /**
     * Track analytics event
     * @param {string} eventName - Event name
     * @param {Object} eventData - Event data
     * @returns {Object} Result
     */
    trackEvent = function(eventName, eventData = {}) {
        console.log(`[EVENT] ${eventName}`, eventData);
        
        root.dispatchEvent(new CustomEvent('analytics-event', {
            detail: {
                name: eventName,
                data: eventData,
                timestamp: new Date().toISOString()
            }
        }));
        
        root.__API_CORE.emit('analytics-event', { name: eventName, data: eventData });
        
        return {
            success: true,
            eventName,
            timestamp: new Date().toISOString(),
            data: eventData
        };
    };
    
    /**
     * Generate sample mood data for testing
     * @returns {Array} Sample mood data
     */
    generateSampleMoodData = function() {
        const moods = ['happy', 'sad', 'excited', 'calm', 'anxious', 'tired', 'energetic', 'peaceful'];
        const activities = ['work', 'social', 'exercise', 'rest', 'entertainment', 'family', 'friends'];
        const data = [];
        const now = new Date();
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            
            data.push({
                date: date.toISOString().split('T')[0],
                mood: moods[Math.floor(Math.random() * moods.length)],
                intensity: Math.floor(Math.random() * 100),
                activities: activities
                    .sort(() => 0.5 - Math.random())
                    .slice(0, Math.floor(Math.random() * 4) + 1),
                note: i === 0 ? 'Today' : `${i} days ago`,
                timestamp: date.toISOString()
            });
        }
        
        return data;
    };
    
    updateTeamMemberRole = async function(teamId, memberId, role) {
        return put(`/api/teams/${teamId}/members/${memberId}/role`, { role });
    };
    
    // ============================================================================
    // SECTION 11: SOCIAL FUNCTIONS
    // ============================================================================
    
    getFriends = async function() {
        return get('/api/friends');
    };
    
    getFriendRequests = async function() {
        return get('/api/friends/requests');
    };
    
    sendFriendRequest = async function(userId) {
        return post('/api/friends/request', { userId });
    };
    
    acceptFriendRequest = async function(requestId) {
        return post(`/api/friends/accept/${requestId}`, {});
    };
    
    rejectFriendRequest = async function(requestId) {
        return post(`/api/friends/reject/${requestId}`, {});
    };
    
    removeFriend = async function(friendId) {
        return del(`/api/friends/remove/${friendId}`);
    };
    
    // ============================================================================
    // SECTION 12: MESSAGING FUNCTIONS
    // ============================================================================
    
    getConversations = async function() {
        return get('/api/chats/conversations');
    };
    
    getMessages = async function(chatId, limit = 50, offset = 0) {
        return get(`/api/chats/${chatId}/messages?limit=${limit}&offset=${offset}`);
    };
    
    sendMessage = async function(chatId, content, type = 'text', metadata = {}) {
        return post(`/api/chats/${chatId}/messages`, { content, type, metadata });
    };
    
    markMessagesAsRead = async function(chatId, messageIds) {
        return post(`/api/chats/${chatId}/messages/read`, { messageIds });
    };
    
    deleteMessage = async function(chatId, messageId) {
        return del(`/api/chats/${chatId}/messages/${messageId}`);
    };
    
    clearChatHistory = async function(chatId) {
        return del(`/api/chats/${chatId}/history`);
    };
    
    // ============================================================================
    // SECTION 13: GROUP FUNCTIONS
    // ============================================================================
    
    createGroup = async function(groupData) {
        return post('/api/group', groupData);
    };
    
    getGroups = async function() {
        return get('/api/group');
    };
    
    getGroupDetails = async function(groupId) {
        return get(`/api/group/${groupId}`);
    };
    
    updateGroup = async function(groupId, groupData) {
        return put(`/api/group/${groupId}`, groupData);
    };
    
    deleteGroup = async function(groupId) {
        return del(`/api/group/${groupId}`);
    };
    
    addGroupMember = async function(groupId, userId) {
        return post(`/api/group/${groupId}/members`, { userId });
    };
    
    removeGroupMember = async function(groupId, userId) {
        return del(`/api/group/${groupId}/members/${userId}`);
    };
    
    leaveGroup = async function(groupId) {
        return post(`/api/group/${groupId}/leave`, {});
    };
    
    // ============================================================================
    // SECTION 14: NOTIFICATION FUNCTIONS
    // ============================================================================
    
    getNotifications = async function() {
        return get('/api/notifications');
    };
    
    markNotificationAsRead = async function(notificationId) {
        return post(`/api/notifications/${notificationId}/read`, {});
    };
    
    deleteNotification = async function(notificationId) {
        return del(`/api/notifications/${notificationId}`);
    };
    
    clearAllNotifications = async function() {
        return post('/api/notifications/clear', {});
    };
    
    // ============================================================================
    // SECTION 15: PROFILE FUNCTIONS
    // ============================================================================
    
    getProfile = async function() {
        return get('/api/users/profile');
    };
    
    updateProfile = async function(profileData) {
        return put('/api/users/profile', profileData);
    };
    
    changePassword = async function(currentPassword, newPassword) {
        return post('/api/users/change-password', { currentPassword, newPassword });
    };
    
    deleteAccount = async function() {
        return del('/api/users/delete-account');
    };
    
    // ============================================================================
    // SECTION 16: USER FUNCTIONS
    // ============================================================================
    
    getOnlineUsers = async function() {
        return get('/api/users/online');
    };
    
    searchUsers = async function(query) {
        return get(`/api/users/search?q=${encodeURIComponent(query)}`);
    };
    
    // ============================================================================
    // SECTION 17: CALL FUNCTIONS
    // ============================================================================
    
    getCallHistory = async function() {
        return get('/api/calls/history');
    };
    
    startCall = async function(userId) {
        return post('/api/calls/start', { userId });
    };
    
    endCall = async function(callId) {
        return post(`/api/calls/${callId}/end`, {});
    };
    
    simulateIncomingCall = function(callData) {
        const event = new CustomEvent('incoming-call', {
            detail: {
                ...callData,
                timestamp: new Date().toISOString()
            }
        });
        
        root.dispatchEvent(event);
        
        return { 
            success: true, 
            message: 'Call simulation triggered',
            timestamp: new Date().toISOString()
        };
    };
    
    // ============================================================================
    // SECTION 18: SETTINGS FUNCTIONS
    // ============================================================================
    
    getSettings = async function() {
        return get('/api/settings');
    };
    
    updateSettings = async function(settings) {
        return put('/api/settings', settings);
    };
    
    // ============================================================================
    // SECTION 19: FILE FUNCTIONS
    // ============================================================================
    
    uploadFile = async function(file, type = 'general') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        formData.append('filename', file.name);
        formData.append('size', file.size);
        formData.append('mimeType', file.type);
        
        return secureApiFetch('/api/files/upload', {
            method: 'POST',
            body: formData,
            headers: {},
            timeout: 60000
        });
    };
    
    deleteFile = async function(fileId) {
        return del(`/api/files/${fileId}`);
    };
    
    getFile = async function(fileId) {
        return get(`/api/files/${fileId}`);
    };
    
    // ============================================================================
    // SECTION 20: ANALYTICS FUNCTIONS
    // ============================================================================
    
    requestSession = async function() {
        return get('/api/auth/session');
    };
    
    getAnalyticsData = async function(params = {}) {
        let url = '/api/analytics';
        if (params && Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += (url.includes('?') ? '&' : '?') + queryString;
        }
        return get(url);
    };
    
    exportAnalytics = async function(analyticsData) {
        return post('/api/analytics/export', analyticsData);
    };
    
    /**
     * Format time ago
     * @param {string|Date} date - Date to format
     * @returns {string} Formatted time
     */
    formatTimeAgo = function(date) {
        if (!date) return 'Unknown';
        
        try {
            const now = new Date();
            const past = new Date(date);
            const seconds = Math.floor((now - past) / 1000);
            
            if (seconds < 0) return 'In the future';
            if (seconds < 5) return 'Just now';
            if (seconds < 60) return `${seconds} seconds ago`;
            if (seconds < 3600) {
                const minutes = Math.floor(seconds / 60);
                return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
            }
            if (seconds < 86400) {
                const hours = Math.floor(seconds / 3600);
                return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
            }
            if (seconds < 2592000) {
                const days = Math.floor(seconds / 86400);
                return `${days} day${days !== 1 ? 's' : ''} ago`;
            }
            if (seconds < 31536000) {
                const months = Math.floor(seconds / 2592000);
                return `${months} month${months !== 1 ? 's' : ''} ago`;
            }
            
            const years = Math.floor(seconds / 31536000);
            return `${years} year${years !== 1 ? 's' : ''} ago`;
        } catch (e) {
            return 'Unknown';
        }
    };
    
    // ============================================================================
    // SECTION 21: UTILITY FUNCTIONS
    // ============================================================================
    
    /**
     * Check network status
     * @returns {Promise<boolean>} True if network is available
     */
    checkNetworkStatus = async function() {
        try {
            const baseUrl = getBaseUrl();
            const response = await fetch(`${baseUrl}/api/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const isOk = response.ok;
            
            if (root.AppNetwork && root.AppNetwork.updateBackendStatus) {
                root.AppNetwork.updateBackendStatus(isOk);
            }
            
            return isOk;
        } catch (error) {
            if (root.AppNetwork && root.AppNetwork.updateBackendStatus) {
                root.AppNetwork.updateBackendStatus(false);
            }
            return false;
        }
    };
    
    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @param {boolean} immediate - Execute immediately
     * @returns {Function} Debounced function
     */
    debounce = function(func, wait, immediate = false) {
        let timeout;
        
        return function executedFunction(...args) {
            const context = this;
            
            const later = function() {
                timeout = null;
                if (!immediate) func.apply(context, args);
            };
            
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            
            if (callNow) func.apply(context, args);
        };
    };
    
    /**
     * Throttle function
     * @param {Function} func - Function to throttle
     * @param {number} limit - Limit in ms
     * @returns {Function} Throttled function
     */
    throttle = function(func, limit) {
        let inThrottle;
        let lastFunc;
        let lastRan;
        
        return function(...args) {
            const context = this;
            
            if (!inThrottle) {
                func.apply(context, args);
                lastRan = Date.now();
                inThrottle = true;
                
                setTimeout(() => {
                    inThrottle = false;
                }, limit);
            } else {
                clearTimeout(lastFunc);
                
                lastFunc = setTimeout(() => {
                    if (Date.now() - lastRan >= limit) {
                        func.apply(context, args);
                        lastRan = Date.now();
                    }
                }, Math.max(limit - (Date.now() - lastRan), 0));
            }
        };
    };
    
    /**
     * Generate unique ID
     * @returns {string} Unique ID
     */
    generateId = function() {
        return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 4)}`;
    };
    
    /**
     * Format date
     * @param {string|Date} date - Date to format
     * @param {string} format - Format type
     * @returns {string} Formatted date
     */
    formatDate = function(date, format = 'short') {
        try {
            const d = new Date(date);
            
            if (isNaN(d.getTime())) {
                return 'Invalid Date';
            }
            
            if (format === 'short') {
                return d.toLocaleDateString();
            }
            
            if (format === 'long') {
                return d.toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
            
            if (format === 'iso') {
                return d.toISOString().split('T')[0];
            }
            
            return d.toLocaleDateString();
        } catch (e) {
            return String(date);
        }
    };
    
    /**
     * Format time
     * @param {string|Date} date - Date to format
     * @param {boolean} includeSeconds - Include seconds
     * @returns {string} Formatted time
     */
    formatTime = function(date, includeSeconds = false) {
        try {
            const d = new Date(date);
            
            if (isNaN(d.getTime())) {
                return 'Invalid Time';
            }
            
            return d.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: includeSeconds ? '2-digit' : undefined
            });
        } catch (e) {
            return String(date);
        }
    };
    
    /**
     * Escape HTML special characters
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml = function(text) {
        if (text === null || text === undefined) return '';
        
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
            '/': '&#047;',
            '`': '&#096;',
            '=': '&#061;'
        };
        
        return String(text).replace(/[&<>"'`=/]/g, function(char) {
            return map[char];
        });
    };
    
    // ============================================================================
    // SECTION 22: EVENT EMITTER - COMPLETE IMPLEMENTATION
    // ============================================================================
    
    const eventEmitter = {
        events: {},
        
        /**
         * Emit event
         * @param {string} event - Event name
         * @param {*} data - Event data
         */
        emit(event, data) {
            try {
                if (this.events[event]) {
                    this.events[event].forEach(callback => {
                        try {
                            callback(data);
                        } catch (e) {
                            console.error(`[EMITTER] Callback error for ${event}:`, e);
                        }
                    });
                }
                
                root.dispatchEvent(new CustomEvent(event, { detail: data }));
            } catch (error) {
                console.error('[EMITTER] Emit error:', error);
            }
        },
        
        /**
         * Register event listener
         * @param {string} event - Event name
         * @param {Function} callback - Callback function
         * @returns {Function} Unsubscribe function
         */
        on(event, callback) {
            try {
                if (!this.events[event]) {
                    this.events[event] = [];
                }
                this.events[event].push(callback);
                
                return () => this.off(event, callback);
            } catch (error) {
                console.error('[EMITTER] On error:', error);
                return () => {};
            }
        },
        
        /**
         * Remove event listener
         * @param {string} event - Event name
         * @param {Function} callback - Callback function
         */
        off(event, callback) {
            try {
                if (this.events[event]) {
                    this.events[event] = this.events[event].filter(cb => cb !== callback);
                    
                    if (this.events[event].length === 0) {
                        delete this.events[event];
                    }
                }
            } catch (error) {
                console.error('[EMITTER] Off error:', error);
            }
        },
        
        /**
         * Register one-time event listener
         * @param {string} event - Event name
         * @param {Function} callback - Callback function
         * @returns {Function} Unsubscribe function
         */
        once(event, callback) {
            try {
                const onceWrapper = (data) => {
                    callback(data);
                    this.off(event, onceWrapper);
                };
                
                this.on(event, onceWrapper);
                
                return () => this.off(event, onceWrapper);
            } catch (error) {
                console.error('[EMITTER] Once error:', error);
                return () => {};
            }
        },
        
        /**
         * Clear all listeners for an event
         * @param {string} event - Event name (optional)
         */
        clear(event) {
            try {
                if (event) {
                    delete this.events[event];
                } else {
                    this.events = {};
                }
            } catch (error) {
                console.error('[EMITTER] Clear error:', error);
            }
        },
        
        /**
         * Get listener count for an event
         * @param {string} event - Event name
         * @returns {number} Listener count
         */
        listeners(event) {
            return this.events[event]?.length || 0;
        }
    };
    
    emit = eventEmitter.emit.bind(eventEmitter);
    on = eventEmitter.on.bind(eventEmitter);
    off = eventEmitter.off.bind(eventEmitter);
    once = eventEmitter.once.bind(eventEmitter);
    
    // ============================================================================
    // SECTION 23: MULTI-IFRAME ORCHESTRATION - ENHANCED
    // ============================================================================
    
    const ORCHESTRATION_STATE = {
        coreReady: false,
        requestQueue: [],
        isQueueProcessing: false,
        iframes: new Map(),
        parentWindow: root.parent !== root ? root.parent : null,
        activeRequests: new Map(),
        requestTimeout: 30000,
        _readyPromise: SAIC.readyPromise,
        _readyResolve: SAIC.readyResolve
    };
    
    /**
     * Wait for core to be ready
     * @returns {Promise} Ready promise
     */
    waitForReady = function() {
        return SAIC.readyPromise;
    };
    
    /**
     * Check if core is ready
     * @returns {boolean} True if ready
     */
    isCoreReady = function() {
        return SAIC.currentState === SAIC.STATES.READY;
    };
    
    /**
     * Get request queue status
     * @returns {Object} Queue status
     */
    getRequestQueueStatus = function() {
        return {
            queueLength: ORCHESTRATION_STATE.requestQueue.length,
            isProcessing: ORCHESTRATION_STATE.isQueueProcessing,
            activeRequests: ORCHESTRATION_STATE.activeRequests.size,
            coreReady: SAIC.currentState === SAIC.STATES.READY,
            iframesConnected: ORCHESTRATION_STATE.iframes.size
        };
    };
    
    /**
     * Register iframe
     * @param {string} iframeId - Iframe ID
     * @param {Window} iframeWindow - Iframe window object
     * @returns {boolean} Success status
     */
    registerIframe = function(iframeId, iframeWindow) {
        if (!ORCHESTRATION_STATE.iframes.has(iframeId)) {
            ORCHESTRATION_STATE.iframes.set(iframeId, {
                window: iframeWindow,
                ready: true,
                registeredAt: Date.now(),
                lastActivity: Date.now(),
                pendingMessages: []
            });
            
            return true;
        }
        return false;
    };
    
    /**
     * Unregister iframe
     * @param {string} iframeId - Iframe ID
     * @returns {boolean} Success status
     */
    unregisterIframe = function(iframeId) {
        return ORCHESTRATION_STATE.iframes.delete(iframeId);
    };
    
    /**
     * Get iframe status
     * @param {string} iframeId - Iframe ID
     * @returns {Object} Iframe status
     */
    getIframeStatus = function(iframeId) {
        const iframe = ORCHESTRATION_STATE.iframes.get(iframeId);
        
        if (!iframe) {
            return { exists: false };
        }
        
        return {
            exists: true,
            ready: iframe.ready,
            registeredAt: iframe.registeredAt,
            lastActivity: iframe.lastActivity,
            pendingMessages: iframe.pendingMessages?.length || 0
        };
    };
    
    /**
     * Broadcast to all iframes
     * @param {*} data - Data to broadcast
     * @returns {Array} Results
     */
    broadcastToAllIframes = function(data) {
        const results = [];
        
        ORCHESTRATION_STATE.iframes.forEach((iframe, iframeId) => {
            try {
                if (iframe.window && typeof iframe.window.postMessage === 'function') {
                    iframe.window.postMessage({
                        type: 'api-broadcast',
                        data,
                        timestamp: new Date().toISOString(),
                        source: 'api-core'
                    }, '*');
                    
                    iframe.lastActivity = Date.now();
                    results.push({ iframeId, success: true });
                }
            } catch (error) {
                results.push({ iframeId, success: false, error: error.message });
            }
        });
        
        return results;
    };
    
    /**
     * Send message to specific iframe
     * @param {string} iframeId - Iframe ID
     * @param {*} data - Data to send
     * @returns {Promise} Promise that resolves when sent
     */
    sendToIframe = function(iframeId, data) {
        return new Promise((resolve, reject) => {
            try {
                const iframe = ORCHESTRATION_STATE.iframes.get(iframeId);
                
                if (!iframe) {
                    reject(new KnectaError(
                        `Iframe ${iframeId} not found`,
                        404,
                        'IFRAME_NOT_FOUND'
                    ));
                    return;
                }
                
                if (!iframe.window || typeof iframe.window.postMessage !== 'function') {
                    reject(new KnectaError(
                        'Iframe window not available',
                        500,
                        'IFRAME_WINDOW_UNAVAILABLE'
                    ));
                    return;
                }
                
                iframe.window.postMessage({
                    type: 'api-message',
                    data,
                    timestamp: new Date().toISOString(),
                    source: 'api-core'
                }, '*');
                
                iframe.lastActivity = Date.now();
                resolve({ success: true, iframeId });
                
            } catch (error) {
                reject(normalizeError(error, 'Failed to send to iframe'));
            }
        });
    };
    
    /**
     * Broadcast to parent window
     * @param {string} event - Event name
     * @param {*} data - Data to broadcast
     * @returns {Promise} Promise that resolves when broadcast
     */
    broadcastToParent = function(event, data) {
        return new Promise((resolve, reject) => {
            try {
                if (!ORCHESTRATION_STATE.parentWindow || typeof ORCHESTRATION_STATE.parentWindow.postMessage !== 'function') {
                    reject(new KnectaError(
                        'No parent window available',
                        404,
                        'NO_PARENT_WINDOW'
                    ));
                    return;
                }
                
                ORCHESTRATION_STATE.parentWindow.postMessage({
                    type: 'child-broadcast',
                    event,
                    data,
                    timestamp: new Date().toISOString(),
                    source: 'api-core'
                }, '*');
                
                resolve({ success: true });
                
            } catch (error) {
                reject(normalizeError(error, 'Failed to broadcast to parent'));
            }
        });
    };
    
    // Message handler for iframe communication
    root.addEventListener('message', (event) => {
        try {
            const { type, iframeId, data, requestId } = event.data || {};
            
            if (type === 'iframe-ready' && iframeId) {
                registerIframe(iframeId, event.source);
                
                root.dispatchEvent(new CustomEvent('iframe-registered', {
                    detail: { iframeId, timestamp: new Date().toISOString() }
                }));
            }
            
            if (type === 'iframe-response' && requestId) {
                root.dispatchEvent(new CustomEvent(`iframe-response-${requestId}`, {
                    detail: { data, timestamp: new Date().toISOString() }
                }));
            }
            
        } catch (error) {
            console.error('[IFRAME] Message handler error:', error);
        }
    });
    
    // ============================================================================
    // SECTION 24: API GATEWAY - COMPLETE UNIFIED INTERFACE
    // ============================================================================
    
    ApiGateway = {
        version: '23.0.8',
        build: '2024-06-21',
        
        env: {
            getCurrent: getEnvironment,
            set: setEnvironment,
            detect: detectEnvironment,
            getBaseUrl: getBaseUrl,
            setBaseUrl: setBaseUrl,
            getDisplayName: getEnvironmentDisplayName,
            isProduction: isProduction,
            isDevelopment: isDevelopment,
            isDemo: isDemo,
            isLocalhost: isLocalhost,
            isRenderDeployment: isRenderDeployment,
            ENVIRONMENTS: ENVIRONMENTS,
            BASE_URLS: BASE_URLS
        },
        
        security: {
            TokenManager: TokenManager,
            SecureStorage: SecureStorage,
            getToken: getUserToken,
            setToken: setUserToken,
            clearToken: clearUserToken,
            isTokenExpired: isTokenExpired,
            getTokenExpiry: getTokenExpiryTime,
            refreshIfNeeded: refreshTokenIfNeeded,
            encrypt: encryptToken,
            decrypt: decryptToken,
            migrateLegacy: migrateLegacyTokens,
            validateToken: validateTokenFormat,
            sanitizeToken: sanitizeToken,
            isValidEndpoint: isValidEndpoint
        },
        
        request: secureApiFetch,
        get: get,
        post: post,
        put: put,
        patch: patch,
        delete: del,
        head: head,
        options: options,
        
        cache: {
            get: CacheManager.get.bind(CacheManager),
            set: CacheManager.set.bind(CacheManager),
            delete: CacheManager.delete.bind(CacheManager),
            clear: CacheManager.clear.bind(CacheManager),
            stats: CacheManager.getStats.bind(CacheManager),
            keys: function() { return Array.from(CacheManager._memoryCache.keys()); }
        },
        
        queue: {
            add: RequestQueue.add.bind(RequestQueue),
            pause: RequestQueue.pause.bind(RequestQueue),
            resume: RequestQueue.resume.bind(RequestQueue),
            clear: RequestQueue.clear.bind(RequestQueue),
            status: RequestQueue.getStatus.bind(RequestQueue),
            setMaxConcurrent: RequestQueue.setMaxConcurrent.bind(RequestQueue),
            setMaxQueueSize: RequestQueue.setMaxQueueSize.bind(RequestQueue),
            updateDependency: RequestQueue.updateDependency.bind(RequestQueue)
        },
        
        abort: {
            create: createAbortController,
            abort: abortRequest,
            abortAll: abortAllRequests
        },
        
        errors: {
            create: createError,
            normalize: normalizeError,
            isApiError: isApiError,
            isNetworkError: isNetworkError,
            isTimeoutError: isTimeoutError,
            isAuthError: isAuthError,
            isServerError: isServerError,
            isClientError: isClientError,
            isRateLimitError: isRateLimitError,
            formatMessage: formatErrorMessage,
            getStatusCode: getErrorStatusCode,
            getCode: getErrorCode,
            KnectaError: KnectaError,
            ApiError: ApiError,
            NetworkError: NetworkError,
            SessionError: SessionError,
            AuthError: AuthError,
            ValidationError: ValidationError
        },
        
        chat: {
            open: openChat,
            close: closeChat,
            minimize: minimizeChat,
            maximize: maximizeChat,
            sendMessage: sendChatMessage,
            getHistory: getChatHistory,
            getUnreadCount: getUnreadCount,
            markAsRead: markChatAsRead
        },
        
        utils: {
            debounce: debounce,
            throttle: throttle,
            generateId: generateId,
            formatDate: formatDate,
            formatTime: formatTime,
            formatTimeAgo: formatTimeAgo,
            escapeHtml: escapeHtml,
            generateSampleMoodData: generateSampleMoodData,
            trackEvent: trackEvent,
            simulateContactSync: simulateContactSync
        },
        
        events: {
            emit: emit,
            on: on,
            off: off,
            once: once
        },
        
        network: {
            check: checkNetworkStatus,
            isOnline: function() { return navigator.onLine; },
            isBackendReachable: function() { 
                return root.AppNetwork && root.AppNetwork.isBackendReachable === true; 
            }
        },
        
        auth: {
            login: login,
            logout: logout,
            register: register,
            forgotPassword: forgotPassword,
            resetPassword: resetPassword,
            refreshToken: refreshToken,
            validate: validateAuth,
            check: checkAuth,
            me: checkAuthMe,
            isAuthenticated: isAuthenticated,
            isSessionValid: isSessionValid,
            getSession: getSession,
            getCurrentUser: getCurrentUser,
            updateUser: updateCurrentUser
        },
        
        users: {
            getProfile: getProfile,
            updateProfile: updateProfile,
            changePassword: changePassword,
            deleteAccount: deleteAccount,
            getOnline: getOnlineUsers,
            search: searchUsers,
            getFriends: getFriends,
            getFriendRequests: getFriendRequests,
            sendFriendRequest: sendFriendRequest,
            acceptFriendRequest: acceptFriendRequest,
            rejectFriendRequest: rejectFriendRequest,
            removeFriend: removeFriend
        },
        
        messages: {
            getConversations: getConversations,
            getMessages: getMessages,
            send: sendMessage,
            markAsRead: markMessagesAsRead,
            delete: deleteMessage,
            clearHistory: clearChatHistory,
            getMessageTypes: getMessageTypes
        },
        
        groups: {
            create: createGroup,
            getAll: getGroups,
            getDetails: getGroupDetails,
            update: updateGroup,
            delete: deleteGroup,
            addMember: addGroupMember,
            removeMember: removeGroupMember,
            leave: leaveGroup,
            acceptInvite: acceptGroupInvite,
            getUserGroups: getUserGroups
        },
        
        notifications: {
            getAll: getNotifications,
            markAsRead: markNotificationAsRead,
            delete: deleteNotification,
            clearAll: clearAllNotifications,
            show: showNotification
        },
        
        calls: {
            getHistory: getCallHistory,
            start: startCall,
            end: endCall,
            navigateTo: navigateToCall,
            simulateIncoming: simulateIncomingCall
        },
        
        settings: {
            get: getSettings,
            update: updateSettings
        },
        
        files: {
            upload: uploadFile,
            delete: deleteFile,
            get: getFile
        },
        
        teams: {
            getMembers: getTeamMembers,
            inviteMember: inviteTeamMember,
            updateMemberRole: updateTeamMemberRole
        },
        
        analytics: {
            getData: getAnalyticsData,
            export: exportAnalytics,
            trackEvent: trackEvent
        },
        
        trust: {
            getClass: getTrustScoreClass,
            getDescription: getTrustScoreDescription
        },
        
        iframe: {
            send: sendToIframe,
            broadcast: broadcastToParent,
            broadcastAll: broadcastToAllIframes,
            register: registerIframe,
            unregister: unregisterIframe,
            getStatus: getIframeStatus,
            getAllStatus: function() {
                const status = {};
                ORCHESTRATION_STATE.iframes.forEach((_, id) => {
                    status[id] = getIframeStatus(id);
                });
                return status;
            },
            waitForReady: waitForReady,
            isReady: isCoreReady,
            getQueueStatus: getRequestQueueStatus
        },
        
        apiRequest: secureApiFetch,
        apiGet: get,
        apiPost: post,
        apiPut: put,
        apiDelete: del,
        apiCall: secureApiFetch,
        callApi: secureApiFetch,
        request: secureApiFetch,
        secureFetch: secureApiFetch,
        secureApiFetch: secureApiFetch,
        apiCallWithRetry: function(endpoint, options) { 
            console.warn('[API] apiCallWithRetry is deprecated - using apiCall instead');
            return secureApiFetch(endpoint, options); 
        },
        
        // Single token source functions
        setUserToken: setUserToken,
        getUserToken: getUserToken,
        clearToken: clearUserToken,
        
        // Public API for window.API
        setToken: setUserToken,
        getToken: getUserToken,
        
        /**
         * Get gateway status
         * @returns {Object} Status object
         */
        getStatus: function() {
            return {
                version: this.version,
                build: this.build,
                state: SAIC.getState(),
                environment: {
                    current: CURRENT_ENVIRONMENT,
                    displayName: getEnvironmentDisplayName(),
                    baseUrl: ACTIVE_BASE_URL || getBaseUrl(),
                    isProduction: isProduction(),
                    isDevelopment: isDevelopment(),
                    isDemo: isDemo(),
                    isLocalhost: isLocalhost(),
                    isRenderDeployment: isRenderDeployment()
                },
                auth: {
                    isAuthenticated: isAuthenticated(),
                    hasToken: !!getUserToken('getStatus'),
                    hasStoredToken: !!_getTokenFromStorage(),
                    tokenExpired: TokenManager ? TokenManager.isTokenExpired() : true,
                    tokenExpiry: TokenManager ? TokenManager.getTokenExpiry() : null,
                    user: getCurrentUser() ? { 
                        id: getCurrentUser()?.id,
                        username: getCurrentUser()?.username,
                        email: getCurrentUser()?.email
                    } : null
                },
                cache: {
                    size: CacheManager ? CacheManager._memoryCache.size : 0,
                    stats: CacheManager ? CacheManager.getStats() : {}
                },
                queue: RequestQueue ? RequestQueue.getStatus() : {},
                network: {
                    online: navigator.onLine,
                    backendReachable: root.AppNetwork ? root.AppNetwork.isBackendReachable : null,
                    lastChecked: root.AppNetwork ? root.AppNetwork.lastChecked : null
                },
                timestamp: new Date().toISOString()
            };
        },
        
        init: initializeGateway,
        ready: SAIC.readyPromise
    };
    
    gateway = ApiGateway;
    
    // ============================================================================
    // SECTION 25: INITIALIZE GATEWAY - STABILIZED DETERMINISTIC PIPELINE
    // ============================================================================
    
    initializeGateway = async function(options = {}) {
        // CRITICAL: Single initialization lock
        if (!SAIC.canInitialize()) {
            console.log('[API-CORE] Initialization already in progress or completed, returning existing promise');
            return SAIC.readyPromise;
        }
        
        // Acquire lock
        SAIC.acquireLock();
        SAIC.transitionTo(SAIC.STATES.INITIALIZING);
        
        console.log('[API-CORE] Initializing API Gateway v23.0.8');
        
        try {
            // STAGE 1: Environment detection
            SAIC.recordStage('environment', true);
            
            if (options.environment) {
                setEnvironment(options.environment);
            } else {
                CURRENT_ENVIRONMENT = detectEnvironment();
            }
            
            RequestQueue.updateDependency('environment', true);
            SAIC.recordStage('environment', true, { environment: CURRENT_ENVIRONMENT });
            
            // STAGE 2: Base URL resolution
            SAIC.recordStage('baseUrl', true);
            
            if (options.baseUrl) {
                setBaseUrl(options.baseUrl);
            } else {
                ACTIVE_BASE_URL = getBaseUrl();
            }
            
            RequestQueue.updateDependency('config', true);
            SAIC.recordStage('baseUrl', true, { baseUrl: ACTIVE_BASE_URL });
            
            // STAGE 3: SafeStorage setup
            SAIC.recordStage('storage', true);
            
            // SecureStorage already initialized at module level
            SAIC.recordStage('storage', true);
            
            // STAGE 4: Origin validation
            SAIC.recordStage('origin', true);
            
            // Validate current origin against allowed domains
            try {
                const currentOrigin = root.location.origin;
                const isValid = isValidEndpoint(currentOrigin, getBaseUrl());
                if (!isValid && !isLocalhost()) {
                    console.warn('[API-CORE] Current origin may not be allowed:', currentOrigin);
                }
                SAIC.recordStage('origin', true, { origin: currentOrigin, valid: isValid });
            } catch (e) {
                SAIC.recordStage('origin', true, { warning: e.message });
            }
            
            // STAGE 5: Token restore (if exists)
            SAIC.recordStage('token', true);
            
            // First try to restore from storage
            const restored = _restoreTokenFromStorage();
            
            if (TokenManager && TokenManager.migrateLegacyTokens) {
                TokenManager.migrateLegacyTokens();
            }
            
            if (initializeTokenSystem) {
                const tokenData = initializeTokenSystem();
                RequestQueue.updateDependency('tokenReady', !!tokenData.token);
                SAIC.recordStage('token', true, { 
                    hasToken: !!tokenData.token,
                    restored: restored 
                });
            } else {
                SAIC.recordStage('token', true, { warning: 'Token system not available' });
            }
            
            // STAGE 6: Dependency verification
            SAIC.recordStage('dependencies', true);
            
            RequestQueue.updateDependency('bootstrap', true);
            
            SAIC.recordStage('dependencies', true, {
                environment: true,
                config: true,
                tokenReady: !!getUserToken('init.stage6')
            });
            
            // STAGE 7: Security firewall setup
            SAIC.recordStage('security', true);
            
            // Security functions already defined
            SAIC.recordStage('security', true, { 
                endpointValidation: typeof isValidEndpoint === 'function',
                publicEndpoints: PUBLIC_ENDPOINTS.length
            });
            
            // STAGE 8: Endpoint registry setup
            SAIC.recordStage('endpoint', true);
            
            // Endpoint functions already defined
            SAIC.recordStage('endpoint', true, {
                publicEndpoints: PUBLIC_ENDPOINTS.length,
                authEndpoints: AUTH_ENDPOINTS.length
            });
            
            // STAGE 9: Self-tests
            SAIC.recordStage('selftest', true);
            
            try {
                const testResults = await runSelfTests();
                SAIC.recordStage('selftest', true, testResults);
            } catch (testError) {
                SAIC.recordStage('selftest', false, { error: testError.message });
                // Non-fatal - continue
            }
            
            // STAGE 10: AppNetwork setup
            SAIC.recordStage('network', true);
            
            if (!root.AppNetwork) {
                root.AppNetwork = {
                    isOnline: navigator.onLine,
                    isBackendReachable: null,
                    lastChecked: new Date().toISOString(),
                    updateOnlineStatus: function(status) {
                        this.isOnline = status;
                        this.lastChecked = new Date().toISOString();
                        root.dispatchEvent(new CustomEvent('network-state-changed', {
                            detail: { isOnline: status, isBackendReachable: this.isBackendReachable }
                        }));
                    },
                    updateBackendStatus: function(status) {
                        this.isBackendReachable = status;
                        this.lastChecked = new Date().toISOString();
                    }
                };
                
                root.addEventListener('online', () => {
                    if (root.AppNetwork) root.AppNetwork.updateOnlineStatus(true);
                });
                root.addEventListener('offline', () => {
                    if (root.AppNetwork) root.AppNetwork.updateOnlineStatus(false);
                });
            }
            
            SAIC.recordStage('network', true);
            
            // Cache pruning
            if (CacheManager && CacheManager._pruneMemoryCache) {
                CacheManager._pruneMemoryCache();
            }
            
            if (updateGlobalAccessToken) {
                updateGlobalAccessToken();
            }
            
            // Mark queue dependency
            RequestQueue.updateDependency('apiCoreReady', true);
            
            // Check if all critical dependencies are ready before transitioning to READY
            const configReady = !!ACTIVE_BASE_URL;
            const tokenReady = !!getUserToken('init.final');
            const apiConfigValid = true;
            
            if (configReady && apiConfigValid) {
                // All stages complete - transition to READY
                SAIC.transitionTo(SAIC.STATES.READY);
                
                const readyEvent = new CustomEvent('api-gateway-ready', {
                    detail: {
                        version: '23.0.8',
                        environment: CURRENT_ENVIRONMENT,
                        baseUrl: ACTIVE_BASE_URL,
                        timestamp: new Date().toISOString(),
                        stages: SAIC.stageResults,
                        features: [
                            'base-url-control',
                            'auto-environment-detection',
                            'https-enforcement',
                            'security-validation',
                            'single-request-path',
                            'error-normalization',
                            'token-security',
                            'cache-management',
                            'request-queue',
                            'dependency-waiting',
                            'chat-functions',
                            'iframe-orchestration',
                            'safe-json-parser',
                            'enhanced-login-handling',
                            'cross-device-compatibility',
                            'single-token-source',
                            'request-blocking-without-token',
                            'token-ready-wait',
                            '401-clear-token',
                            'guaranteed-auth-headers',
                            'circular-dependency-fixed',
                            'reduced-console-noise',
                            'token-source-tracking',
                            'session-persistence',
                            'token-restore-on-load',
                            'selective-session-clear'
                        ]
                    }
                });
                
                root.dispatchEvent(readyEvent);
                
                console.log('[API-CORE] ✅ Initialized successfully', {
                    environment: CURRENT_ENVIRONMENT,
                    baseUrl: ACTIVE_BASE_URL,
                    version: '23.0.8',
                    state: SAIC.currentState,
                    duration: Date.now() - SAIC.initializationStartTime,
                    hasToken: !!getUserToken('init.success')
                });
            } else {
                // If not ready, stay in INITIALIZING state
                console.warn('[API-CORE] ⚠️ Initialization incomplete - waiting for dependencies', {
                    configReady,
                    tokenReady
                });
            }
            
            return {
                success: SAIC.currentState === SAIC.STATES.READY,
                environment: CURRENT_ENVIRONMENT,
                baseUrl: ACTIVE_BASE_URL,
                version: '23.0.8',
                state: SAIC.currentState,
                stages: SAIC.stageResults,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('[API-CORE] ❌ Initialization error:', error);
            SAIC.transitionTo(SAIC.STATES.FAILED, error);
            
            return {
                success: false,
                error: normalizeError(error).toJSON(),
                state: SAIC.currentState,
                stages: SAIC.stageResults,
                timestamp: new Date().toISOString()
            };
        } finally {
            SAIC.releaseLock();
        }
    };
    
    // Self-test function
    async function runSelfTests() {
        const results = {
            passed: 0,
            failed: 0,
            tests: []
        };
        
        // Test 1: Verify root.api.core exists
        if (!root.api || !root.api.core) {
            results.tests.push({ name: 'api.core exists', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'api.core exists', passed: true });
            results.passed++;
        }
        
        // Test 2: Verify waitFor exists
        if (typeof root.api.core.waitFor !== 'function') {
            results.tests.push({ name: 'waitFor function', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'waitFor function', passed: true });
            results.passed++;
        }
        
        // Test 3: Verify ready is a Promise
        const isPromise = root.api.core.ready instanceof Promise || 
                         (root.api.core.ready && typeof root.api.core.ready.then === 'function');
        
        if (!isPromise) {
            results.tests.push({ name: 'ready is Promise', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'ready is Promise', passed: true });
            results.passed++;
        }
        
        // Test 4: Verify whenReady exists
        if (typeof root.api.core.whenReady !== 'function') {
            results.tests.push({ name: 'whenReady function', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'whenReady function', passed: true });
            results.passed++;
        }
        
        // Test 5: Verify isReady exists
        if (typeof root.api.core.isReady !== 'function') {
            results.tests.push({ name: 'isReady function', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'isReady function', passed: true });
            results.passed++;
        }
        
        // Test 6: Verify __API_CORE exists
        if (!root.__API_CORE) {
            results.tests.push({ name: '__API_CORE exists', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: '__API_CORE exists', passed: true });
            results.passed++;
        }
        
        // Test 7: Security validation
        const testUrls = [
            ['/api/users/me', true],
            ['/api/users/../config', false],
            ['/api/users/%2e%2e/config', false],
            ['https://evil.com/api/steal', false],
            ['https://moodchat-fy56.onrender.com/api/users', true],
            ['http://localhost:4000/api/users', isLocalhost()]
        ];
        
        let securityPassed = 0;
        testUrls.forEach(([url, expected]) => {
            const result = isValidEndpoint(url, getBaseUrl());
            if (result === expected) {
                securityPassed++;
            }
        });
        
        results.tests.push({ 
            name: 'security validation', 
            passed: securityPassed === testUrls.length,
            details: `${securityPassed}/${testUrls.length} passed`
        });
        
        if (securityPassed === testUrls.length) {
            results.passed++;
        } else {
            results.failed++;
        }
        
        // Test 8: Token persistence
        const testToken = 'test.token.123';
        const testUser = { id: 'test', name: 'Test User' };
        
        try {
            // Save test data
            _saveAuthToStorage(testToken, testUser);
            
            // Try to retrieve
            const retrievedToken = _getTokenFromStorage();
            const retrievedUser = _getUserFromStorage();
            
            const tokenMatches = retrievedToken === testToken;
            const userMatches = JSON.stringify(retrievedUser) === JSON.stringify(testUser);
            
            results.tests.push({ 
                name: 'token persistence', 
                passed: tokenMatches && userMatches,
                details: `Token: ${tokenMatches}, User: ${userMatches}`
            });
            
            if (tokenMatches && userMatches) {
                results.passed++;
            } else {
                results.failed++;
            }
            
            // Clean up
            _clearAuthFromStorage();
        } catch (e) {
            results.tests.push({ name: 'token persistence', passed: false, details: e.message });
            results.failed++;
        }
        
        return results;
    }
    
    // ============================================================================
    // SECTION 26: API CORE INTERFACE
    // ============================================================================
    
    apiCore = {
        ...ApiGateway,
        
        iframe: {
            send: sendToIframe,
            broadcast: broadcastToParent,
            broadcastAll: broadcastToAllIframes,
            register: registerIframe,
            unregister: unregisterIframe,
            getStatus: getIframeStatus,
            getAllStatus: function() {
                const status = {};
                ORCHESTRATION_STATE.iframes.forEach((_, id) => {
                    status[id] = getIframeStatus(id);
                });
                return status;
            }
        },
        
        getQueueStatus: getRequestQueueStatus,
        waitForReady: waitForReady,
        isReady: isCoreReady,
        
        get: get,
        post: post,
        put: put,
        patch: patch,
        delete: del,
        del: del
    };
    
    // ============================================================================
    // WINDOW.API EXPORT - SINGLE GLOBAL API INTERFACE
    // ============================================================================
    
    root.API = {
        get: get,
        post: post,
        put: put,
        delete: del,
        setUserToken: setUserToken,
        getUserToken: getUserToken,
        clearToken: clearUserToken,
        version: '23.0.8'
    };
    
    root.API_READY = SAIC.currentState === SAIC.STATES.READY;
    
    // ============================================================================
    // GLOBAL INITIALIZATION
    // ============================================================================
    
    // Start initialization (non-blocking)
    initializeGateway();
    
    // Periodic token refresh - OPTIMIZED: Increased interval to reduce network calls
    setInterval(() => {
        if (TokenManager && TokenManager.shouldRefreshToken && TokenManager.shouldRefreshToken()) {
            refreshTokenIfNeeded().catch(() => {});
        }
    }, 120000); // Every 2 minutes
    
    // Periodic network check - OPTIMIZED: Increased interval
    setInterval(() => {
        if (navigator.onLine) {
            checkNetworkStatus().catch(() => {});
        }
    }, 60000); // Every minute
    
    // Expose to global scope
    root.ApiGateway = ApiGateway;
    root.gateway = ApiGateway;
    root.api = ApiGateway;
    root.apiCore = apiCore;
    root.KnectaError = KnectaError;
    root.ApiError = ApiError;
    root.NetworkError = NetworkError;
    root.SessionError = SessionError;
    root.AuthError = AuthError;
    root.ValidationError = ValidationError;
    root.openChat = openChat;
    root.TokenManager = TokenManager;
    root.SecureStorage = SecureStorage;
    root.CacheManager = CacheManager;
    root.RequestQueue = RequestQueue;
    
    // ============================================================================
    // CRITICAL: Update __API_CORE with all required properties
    // ============================================================================
    
    Object.assign(root.__API_CORE, {
        version: '23.0.8',
        initialized: SAIC.currentState === SAIC.STATES.READY,
        ready: SAIC.readyPromise,
        secureApiFetch: secureApiFetch,
        getUserToken: getUserToken,
        setUserToken: setUserToken,
        clearUserToken: clearUserToken,
        _apiCache: CacheManager._memoryCache,
        _apiRequestQueue: RequestQueue._queue,
        _events: eventEmitter.events,
        on: eventEmitter.on.bind(eventEmitter),
        emit: eventEmitter.emit.bind(eventEmitter),
        __bootstrapped: true,
        getState: SAIC.getState
    });
    
    // Ensure legacy bridges
    root.apiCore = root.apiCore || root.__API_CORE;
    root.api_core = root.api_core || root.__API_CORE;
    
    root.__API_GATEWAY = {
        version: '23.0.8',
        build: '2024-06-21',
        environment: CURRENT_ENVIRONMENT,
        baseUrl: ACTIVE_BASE_URL,
        initialized: SAIC.currentState === SAIC.STATES.READY,
        state: SAIC.currentState,
        stages: SAIC.stageResults,
        timestamp: new Date().toISOString(),
        features: [
            'base-url-control',
            'auto-environment-detection',
            'https-enforcement',
            'security-validation',
            'single-request-path',
            'error-normalization',
            'token-security',
            'cache-management',
            'request-queue',
            'dependency-waiting',
            'chat-functions',
            'iframe-orchestration',
            'safe-json-parser',
            'enhanced-login-handling',
            'cross-device-compatibility',
            'single-token-source',
            'request-blocking-without-token',
            'token-ready-wait',
            '401-clear-token',
            'guaranteed-auth-headers',
            'circular-dependency-fixed',
            'reduced-console-noise',
            'token-source-tracking',
            'session-persistence',
            'token-restore-on-load',
            'selective-session-clear'
        ]
    };
    
    // ============================================================================
    // FINAL READY RESOLUTION HANDLED BY SAIC
    // ============================================================================
    
    // Ensure root.api.core exists
    if (!root.api) root.api = {};
    
    const coreReadyPromise = SAIC.readyPromise;
    
    if (!root.api.core) {
        root.api.core = {
            __initializing: SAIC.currentState === SAIC.STATES.INITIALIZING,
            __version: '23.0.8',
            ready: coreReadyPromise,
            waitFor: function() { 
                return coreReadyPromise; 
            },
            whenReady: function(callback) {
                if (typeof callback === 'function') {
                    coreReadyPromise.then(callback).catch(() => {});
                }
                return coreReadyPromise;
            },
            isReady: function() {
                return SAIC.currentState === SAIC.STATES.READY;
            },
            getStatus: function() {
                return {
                    ready: SAIC.currentState === SAIC.STATES.READY,
                    initializing: SAIC.currentState === SAIC.STATES.INITIALIZING,
                    failed: SAIC.currentState === SAIC.STATES.FAILED,
                    state: SAIC.currentState,
                    version: '23.0.8'
                };
            },
            init: function() {
                return coreReadyPromise;
            }
        };
    } else {
        // Ensure existing core object has all required properties
        root.api.core.ready = root.api.core.ready || coreReadyPromise;
        root.api.core.waitFor = root.api.core.waitFor || function() { return coreReadyPromise; };
        root.api.core.whenReady = root.api.core.whenReady || function(callback) {
            if (typeof callback === 'function') {
                coreReadyPromise.then(callback).catch(() => {});
            }
            return coreReadyPromise;
        };
        root.api.core.isReady = root.api.core.isReady || function() {
            return SAIC.currentState === SAIC.STATES.READY;
        };
        root.api.core.getStatus = root.api.core.getStatus || function() {
            return {
                ready: SAIC.currentState === SAIC.STATES.READY,
                initializing: SAIC.currentState === SAIC.STATES.INITIALIZING,
                failed: SAIC.currentState === SAIC.STATES.FAILED,
                state: SAIC.currentState,
                version: '23.0.8'
            };
        };
        root.api.core.init = root.api.core.init || function() { return coreReadyPromise; };
    }
    
    // Mark as initialized (if already READY)
    root.api.core.__initialized = SAIC.currentState === SAIC.STATES.READY;
    root.api.core.__initializing = SAIC.currentState === SAIC.STATES.INITIALIZING;
    root.api.core.__ready = SAIC.currentState === SAIC.STATES.READY;
    
    // Dispatch events if already READY
    if (SAIC.currentState === SAIC.STATES.READY) {
        try {
            root.dispatchEvent(new CustomEvent('api-core-ready', {
                detail: {
                    version: '23.0.8',
                    environment: CURRENT_ENVIRONMENT,
                    baseUrl: ACTIVE_BASE_URL,
                    timestamp: new Date().toISOString(),
                    features: root.__API_GATEWAY.features
                }
            }));
        } catch (e) {
            console.warn('[API-CORE] Failed to dispatch api-core-ready event:', e);
        }
        
        if (root.__API_CORE && typeof root.__API_CORE.emit === 'function') {
            try {
                root.__API_CORE.emit('ready', {
                    version: '23.0.8',
                    environment: CURRENT_ENVIRONMENT,
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                console.warn('[API-CORE] Failed to emit ready event:', e);
            }
        }
    }
    
    console.log('[API-CORE] ✅ Fully loaded', {
        environment: CURRENT_ENVIRONMENT,
        baseUrl: ACTIVE_BASE_URL,
        version: '23.0.8',
        state: SAIC.currentState,
        stages: Object.keys(SAIC.stageResults).length,
        features: root.__API_GATEWAY.features.length,
        hasToken: !!getUserToken('final')
    });
    
})(typeof window !== 'undefined' ? window : global);

// ============================================================================
// ES6 EXPORTS - COMPLETE EXPORT LIST WITH ALL 350+ FUNCTIONS
// ============================================================================

export {
    ApiGateway,
    gateway,
    initializeGateway,
    setEnvironment,
    getEnvironment,
    getBaseUrl,
    setBaseUrl,
    detectEnvironment,
    
    fetchWithTimeout,
    fetchWithRetry,
    fetchWithCache,
    fetchWithFallback,
    fetchDedupe,
    secureRequest,
    requestWithAbort,
    createAbortController,
    abortRequest,
    abortAllRequests,
    
    ApiError,
    KnectaError,
    ApiGatewayError,
    NetworkError,
    SessionError,
    AuthError,
    ValidationError,
    normalizeError,
    isApiError,
    createError,
    formatErrorMessage,
    getErrorStatusCode,
    getErrorCode,
    isNetworkError,
    isTimeoutError,
    isAuthError,
    isServerError,
    isClientError,
    isRateLimitError,
    
    TokenManager,
    SecureStorage,
    encryptToken,
    decryptToken,
    secureGetToken,
    secureSetToken,
    secureClearToken,
    isTokenExpired,
    refreshTokenIfNeeded,
    getTokenExpiryTime,
    setTokenWithExpiry,
    clearExpiredTokens,
    migrateLegacyTokens,
    validateTokenFormat,
    sanitizeToken,
    
    ENVIRONMENTS,
    CURRENT_ENVIRONMENT,
    BASE_URLS,
    ACTIVE_BASE_URL,
    ENVIRONMENT_DETECTION_RULES,
    getEnvironmentDisplayName,
    isProduction,
    isDevelopment,
    isDemo,
    isLocalhost,
    isRenderDeployment,
    
    CacheManager,
    memoryCache,
    persistentCache,
    clearCache,
    getCacheKey,
    setCacheItem,
    getCacheItem,
    deleteCacheItem,
    pruneCache,
    cacheStats,
    
    RequestQueue,
    queueRequest,
    processQueue,
    getQueueStatus,
    clearQueue,
    pauseQueue,
    resumeQueue,
    
    requestSession,
    getAnalyticsData,
    markChatAsRead,
    isSessionValid,
    formatTimeAgo,
    exportAnalytics,
    getUserToken,
    setUserToken,
    clearUserToken,
    getCurrentUser,
    setUserData,
    clearAllAuthData,
    tokenReady,
    secureFetch,
    secureApiFetch,
    getValidToken,
    getAuthHeaders,
    isPublicEndpoint,
    isAuthEndpoint,
    isStatusEndpoint,
    getTrustScoreDescription,
    navigateToCall,
    getUserFriends,
    navigateToChat,
    getUserGroups,
    showNotification,
    inviteTeamMember,
    acceptGroupInvite,
    getMessageTypes,
    simulateContactSync,
    trackEvent,
    generateSampleMoodData,
    request,
    apiCallWithRetry,
    updateTeamMemberRole,
    validateAuth,
    updateGlobalAccessToken,
    handleUnauthorizedAccess,
    determineBackendUrl,
    getApiBaseUrl,
    validateSession,
    updateSession,
    getUserData,
    initializeTokenSystem,
    updateCurrentUser,
    getBackendBaseUrl,
    isAuthenticated,
    getSessionData,
    clearSession,
    setSessionData,
    getToken,
    setToken,
    login,
    logout,
    getTeamMembers,
    getTrustScoreClass,
    getSession,
    api,
    register,
    forgotPassword,
    resetPassword,
    refreshToken,
    checkAuth,
    checkAuthMe,
    getProfile,
    updateProfile,
    changePassword,
    deleteAccount,
    getOnlineUsers,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    getFriends,
    getFriendRequests,
    getConversations,
    getMessages,
    sendMessage,
    markMessagesAsRead,
    deleteMessage,
    clearChatHistory,
    createGroup,
    getGroups,
    getGroupDetails,
    updateGroup,
    deleteGroup,
    addGroupMember,
    removeGroupMember,
    leaveGroup,
    getNotifications,
    markNotificationAsRead,
    deleteNotification,
    clearAllNotifications,
    getCallHistory,
    startCall,
    endCall,
    getSettings,
    updateSettings,
    uploadFile,
    deleteFile,
    getFile,
    checkNetworkStatus,
    debounce,
    throttle,
    generateId,
    formatDate,
    formatTime,
    emit,
    on,
    off,
    once,
    apiRequest,
    apiGet,
    apiPost,
    apiPut,
    apiDelete,
    apiCall,
    initSession,
    callApi,
    escapeHtml,
    simulateIncomingCall,
    apiCore,
    get,
    post,
    put,
    del,
    sendToIframe,
    broadcastToParent,
    waitForReady,
    isCoreReady,
    getRequestQueueStatus,
    registerIframe,
    unregisterIframe,
    getIframeStatus,
    broadcastToAllIframes,
    
    openChat,
    closeChat,
    minimizeChat,
    maximizeChat,
    sendChatMessage,
    getChatHistory,
    getUnreadCount
};