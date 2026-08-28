// api.core.js - ENHANCED API GATEWAY WITH SECURITY & CROSS-ENVIRONMENT SUPPORT
// Version: 24.0.4 - FIXED: Race condition between module initialization and API gateway
// Date: 2026-03-26
// CRITICAL: Ensure API gateway is fully initialized before any requests are processed

// ============================================================================
// MODULE-LEVEL DECLARATIONS
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

// Fetch wrapper with guaranteed resolution
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

// ============================================================================
// PARENT ORCHESTRATION STATE
// ============================================================================

let PARENT_SESSION = null;
let PARENT_READY = false;
let SESSION_READY = false;
let PENDING_REQUESTS = [];
let IS_PROCESSING_PENDING = false;
let SESSION_NORMALIZATION_ACTIVE = false;

// Session normalization cache
let NORMALIZED_USER_ID = null;
let LAST_SESSION_UPDATE = null;
let SESSION_UPDATE_COUNT = 0;

// Parent message handlers registry
let PARENT_MESSAGE_HANDLERS = new Map();

// Request gate state
let REQUEST_GATE_ACTIVE = false;
let GATED_REQUESTS_QUEUE = [];

// Active requests tracking for deduplication
const activeRequests = new Map();
const requestTimeouts = new Map();
const abortControllers = new Map();

// ============================================================================
// TIMEOUT CONSTANTS - FIX: DEFAULT_TIMEOUT was referenced but never defined
// ============================================================================
const DEFAULT_TIMEOUT = 60000;  // 60 seconds — long enough for Render cold starts
const MAX_RETRIES = 2;

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
let validateToken;
let validateTokenFormat;
let sanitizeToken;

// NEW TOKEN FUNCTIONS
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

// Request queue with guaranteed processing
let RequestQueue;
let queueRequest;
let processQueue;
let getQueueStatus;
let clearQueue;
let pauseQueue;
let resumeQueue;

// Core ready state for queue processing
let isCoreReady = false;
let initializationPromise = null;
let initializationResolve = null;

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
let isCoreReadyFn;
let getRequestQueueStatus;
let registerIframe;
let unregisterIframe;
let getIframeStatus;
let broadcastToAllIframes;

// CHAT FUNCTIONS
let openChat;
let closeChat;
let minimizeChat;
let maximizeChat;
let sendChatMessage;
let getChatHistory;
let getUnreadCount;

// ============================================================================
// ENHANCED ENVIRONMENT DETECTION - FIXED
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

function resolveBaseURL() {
    try {
        const env = CURRENT_ENVIRONMENT === ENVIRONMENTS.AUTO ? detectEnvironment() : CURRENT_ENVIRONMENT;
        
        if (env === ENVIRONMENTS.LOCAL || env === ENVIRONMENTS.DEVELOPMENT) {
            return 'http://localhost:4000/api';  
        } else {
            return 'https://noxopa.onrender.com/api';  
        }
    } catch (error) {
        console.error('[ENV] Base URL resolution error:', error);
        return 'https://noxopa.onrender.com/api';
    }
}

BASE_URLS = {
    [ENVIRONMENTS.PRODUCTION]: 'https://noxopa.onrender.com/api',
    [ENVIRONMENTS.DEVELOPMENT]: 'http://localhost:4000/api',
    [ENVIRONMENTS.DEMO]: 'https://demo.nexipa.onrender.com/api',
    [ENVIRONMENTS.STAGING]: 'https://staging.nexipa.onrender.com/api',
    [ENVIRONMENTS.TEST]: 'https://test.nexipa.onrender.com/api',
    [ENVIRONMENTS.LOCAL]: 'http://localhost:4000/api',  // ADD /api HERE
    [ENVIRONMENTS.AUTO]: null
};

ENVIRONMENT_DETECTION_RULES = [
    { pattern: /localhost|127\.0\.0\.1|::1|0\.0\.0\.0/i, env: ENVIRONMENTS.LOCAL },
    { pattern: /render\.com|onrender\.com|noxopa/i, env: ENVIRONMENTS.PRODUCTION },
    { pattern: /staging|stage/i, env: ENVIRONMENTS.STAGING },
    { pattern: /demo|testdrive/i, env: ENVIRONMENTS.DEMO },
    { pattern: /test|testing/i, env: ENVIRONMENTS.TEST },
    { pattern: /192\.168\.|10\.0\.|172\.(1[6-9]|2[0-9]|3[0-1])\./i, env: ENVIRONMENTS.DEVELOPMENT },
    { pattern: /dev\.|development\./i, env: ENVIRONMENTS.DEVELOPMENT }
];

CURRENT_ENVIRONMENT = ENVIRONMENTS.AUTO;
ACTIVE_BASE_URL = null;

detectEnvironment = function() {
    try {
        const hostname = window.location.hostname;
        const port = window.location.port;
        const href = window.location.href;
        const protocol = window.location.protocol;
        
        // LOCAL DETECTION - Highest priority
        if (hostname === 'localhost' || 
            hostname === '127.0.0.1' || 
            hostname === '::1' ||
            hostname === '0.0.0.0' ||
            port === '5500' || 
            port === '3000' || 
            port === '3001' || 
            port === '5173' || 
            port === '5174' || 
            port === '5175' || 
            port === '4200' || 
            port === '8080') {
            console.log(`[ENV] ✅ Detected LOCAL environment from: ${hostname}:${port}`);
            // FORCE LOCAL environment
            CURRENT_ENVIRONMENT = ENVIRONMENTS.LOCAL;
            return ENVIRONMENTS.LOCAL;
        }
        
        // PRODUCTION DETECTION
        if (hostname.includes('render.com') || 
            hostname.includes('onrender.com') ||
            href.includes('render.com') || 
            href.includes('onrender.com')) {
            console.log(`[ENV] ✅ Detected PRODUCTION environment from: ${hostname}`);
            return ENVIRONMENTS.PRODUCTION;
        }
        
        // Check rules for other environments
        for (const rule of ENVIRONMENT_DETECTION_RULES) {
            if (rule.pattern.test(hostname) || rule.pattern.test(href)) {
                console.log(`[ENV] ✅ Detected environment: ${rule.env} from: ${hostname}`);
                return rule.env;
            }
        }
        
        // Default to PRODUCTION for any other domain
        console.log(`[ENV] ⚠️ Defaulting to PRODUCTION for: ${hostname}`);
        return ENVIRONMENTS.PRODUCTION;
        
    } catch (error) {
        console.error('[ENV] Detection error:', error);
        return ENVIRONMENTS.PRODUCTION;
    }
};

setEnvironment = function(env) {
    try {
        if (!env) return false;
        
        const envString = env.toString().toLowerCase();
        
        if (Object.values(ENVIRONMENTS).includes(envString)) {
            CURRENT_ENVIRONMENT = envString;
            ACTIVE_BASE_URL = resolveBaseURL();
            
            console.log(`[ENV] Environment set to: ${CURRENT_ENVIRONMENT}, backend URL: ${ACTIVE_BASE_URL}`);
            
            if (CURRENT_ENVIRONMENT === ENVIRONMENTS.PRODUCTION && 
                ACTIVE_BASE_URL && 
                !ACTIVE_BASE_URL.startsWith('https://')) {
                console.warn('[ENV] Production environment requires HTTPS - upgrading URL');
                ACTIVE_BASE_URL = ACTIVE_BASE_URL.replace('http://', 'https://');
            }
            
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('environment-changed', {
                    detail: {
                        environment: CURRENT_ENVIRONMENT,
                        baseUrl: ACTIVE_BASE_URL,
                        timestamp: new Date().toISOString()
                    }
                }));
            }
            
            return true;
        }
        
        // Legacy mapping
        if (envString.includes('prod') || envString.includes('render')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.PRODUCTION;
        } else if (envString.includes('dev') || envString.includes('local')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.LOCAL;
        } else if (envString.includes('demo')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.DEMO;
        } else if (envString.includes('stage')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.STAGING;
        } else if (envString.includes('test')) {
            CURRENT_ENVIRONMENT = ENVIRONMENTS.TEST;
        } else {
            return false;
        }
        
        ACTIVE_BASE_URL = resolveBaseURL();
        
        console.log(`[ENV] Environment set to: ${CURRENT_ENVIRONMENT}, backend URL: ${ACTIVE_BASE_URL}`);
        
        if (CURRENT_ENVIRONMENT === ENVIRONMENTS.PRODUCTION && 
            ACTIVE_BASE_URL && 
            !ACTIVE_BASE_URL.startsWith('https://')) {
            ACTIVE_BASE_URL = ACTIVE_BASE_URL.replace('http://', 'https://');
        }
        
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('environment-changed', {
                detail: {
                    environment: CURRENT_ENVIRONMENT,
                    baseUrl: ACTIVE_BASE_URL,
                    timestamp: new Date().toISOString()
                }
            }));
        }
        
        return true;
        
    } catch (error) {
        console.error('[ENV] Set environment error:', error);
        return false;
    }
};

getEnvironment = function() {
    return CURRENT_ENVIRONMENT;
};

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

isProduction = function() {
    return CURRENT_ENVIRONMENT === ENVIRONMENTS.PRODUCTION;
};

isDevelopment = function() {
    return CURRENT_ENVIRONMENT === ENVIRONMENTS.DEVELOPMENT || 
           CURRENT_ENVIRONMENT === ENVIRONMENTS.LOCAL;
};

isDemo = function() {
    return CURRENT_ENVIRONMENT === ENVIRONMENTS.DEMO;
};

isLocalhost = function() {
    try {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || 
               hostname === '127.0.0.1' || 
               hostname === '::1' ||
               hostname === '0.0.0.0' ||
               CURRENT_ENVIRONMENT === ENVIRONMENTS.LOCAL;
    } catch (error) {
        return false;
    }
};

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

getBaseUrl = function() {
    try {
        if (ACTIVE_BASE_URL) {
            return ACTIVE_BASE_URL;
        }
        
        if (CURRENT_ENVIRONMENT === ENVIRONMENTS.AUTO) {
            CURRENT_ENVIRONMENT = detectEnvironment();
            console.log(`[ENV] Auto-detected environment: ${CURRENT_ENVIRONMENT}`);
        }
        
        ACTIVE_BASE_URL = resolveBaseURL();
        
        if (CURRENT_ENVIRONMENT === ENVIRONMENTS.PRODUCTION && 
            ACTIVE_BASE_URL && 
            !ACTIVE_BASE_URL.startsWith('https://')) {
            console.warn('[ENV] Production environment requires HTTPS - upgrading URL');
            ACTIVE_BASE_URL = ACTIVE_BASE_URL.replace('http://', 'https://');
        }
        
        console.log(`[ENV] 📍 Using backend URL: ${ACTIVE_BASE_URL} (env: ${CURRENT_ENVIRONMENT})`);
        return ACTIVE_BASE_URL;
        
    } catch (error) {
        console.error('[ENV] Get base URL error:', error);
        return 'http://localhost:4000/api';  // CHANGE THIS - add /api
    }
};

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
        
        // Ensure URL ends with /api for consistency, but don't force it
        if (isProduction() && !url.startsWith('https://')) {
            console.warn('[ENV] Production environment requires HTTPS - upgrading URL');
            url = url.replace('http://', 'https://');
        }
        
        ACTIVE_BASE_URL = url;
        CURRENT_ENVIRONMENT = ENVIRONMENTS.AUTO;
        
        console.log(`[ENV] Base URL manually set to: ${ACTIVE_BASE_URL}`);
        
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('base-url-changed', {
                detail: {
                    baseUrl: ACTIVE_BASE_URL,
                    timestamp: new Date().toISOString()
                }
            }));
        }
        
        return true;
        
    } catch (error) {
        console.error('[ENV] Set base URL error:', error);
        return false;
    }
};


determineBackendUrl = function() {
    return getBaseUrl();
};

getApiBaseUrl = getBaseUrl;
getBackendBaseUrl = getBaseUrl;

// ============================================================================
// ENHANCED TOKEN MANAGEMENT - UNIFIED SOURCE
// ============================================================================

const AUTH_STORAGE_KEY = 'kynecta_auth';
const TOKEN_PRIORITY_KEYS = [
    'token',
    'nexopa_token',
    'accessToken',
    'jwt',
    'authToken',
    'userToken',
    'nexopa_auth_token'
];

function getStorageBridge() {
    if (typeof window !== 'undefined' && window.AppStorage && typeof window.AppStorage.get === 'function') {
        return window.AppStorage;
    }

    return {
        get(key, fallback = null) {
            try {
                const raw = localStorage.getItem(key);
                if (raw === null || raw === undefined) return fallback;
                try {
                    return JSON.parse(raw);
                } catch (_error) {
                    return raw;
                }
            } catch (_error) {
                return fallback;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                console.log('[LOCAL SAVE]', key, value);
                return true;
            } catch (_error) {
                return false;
            }
        },
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (_error) {
                return false;
            }
        }
    };
}

function getAuthToken() {
    // Priority 1: Memory token
    if (AUTH_TOKEN && typeof AUTH_TOKEN === 'string' && AUTH_TOKEN.length > 20) {
        return AUTH_TOKEN;
    }
    
    // Priority 2: Parent session token
    if (PARENT_SESSION && PARENT_SESSION.token && typeof PARENT_SESSION.token === 'string') {
        AUTH_TOKEN = PARENT_SESSION.token;
        TOKEN_READY = true;
        return AUTH_TOKEN;
    }
    
    // Priority 3: Secure storage
    try {
        const stored = getStorageBridge().get(AUTH_STORAGE_KEY, null);
        if (stored && stored.token && typeof stored.token === 'string' && stored.token.length > 20) {
            AUTH_TOKEN = stored.token;
            TOKEN_READY = true;
            return AUTH_TOKEN;
        }
    } catch (error) {
        console.warn('[TOKEN] Failed to parse stored auth:', error.message);
    }
    
    // Priority 4: Legacy keys
    for (const key of TOKEN_PRIORITY_KEYS) {
        try {
            const legacyToken = getStorageBridge().get(key, null);
            if (legacyToken && legacyToken.length > 20 && legacyToken !== 'null' && legacyToken !== 'undefined') {
                AUTH_TOKEN = legacyToken;
                TOKEN_READY = true;
                _saveAuthToStorage(legacyToken);
                console.log(`[TOKEN] Migrated token from legacy key: ${key}`);
                return AUTH_TOKEN;
            }
        } catch (error) {
            // Continue to next key
        }
    }
    
    return null;
}

function _saveAuthToStorage(token, user = null) {
    try {
        if (!token || typeof token !== 'string') return false;
        
        const authData = {
            token: token,
            user: user || getCurrentUser() || null,
            timestamp: Date.now(),
            version: '24.0.4'
        };
        
        getStorageBridge().set(AUTH_STORAGE_KEY, authData);
        
        // Also store in legacy location for compatibility
        getStorageBridge().set('nexopa_token', token);
        
        return true;
    } catch (error) {
        console.error('[TOKEN] Failed to save auth data:', error.message);
        return false;
    }
}

function _clearAuthFromStorage() {
    // Skip clearing during self-tests
    if (window._selfTestMode) {
        console.log('[TOKEN] Skipping storage clear - self-test mode active');
        return true;
    }
    
    try {
        getStorageBridge().remove(AUTH_STORAGE_KEY);
        getStorageBridge().remove('nexopa_token');
        
        // Clear legacy keys
        for (const key of TOKEN_PRIORITY_KEYS) {
            try {
                getStorageBridge().remove(key);
            } catch (e) {}
        }
        
        return true;
    } catch (error) {
        console.error('[TOKEN] Failed to clear auth data:', error.message);
        return false;
    }
}

function _getTokenFromStorage() {
    return getAuthToken();
}

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
        console.warn('[TOKEN] Failed to parse stored user data:', error.message);
        return null;
    }
}

let _isSettingToken = false;
let _lastTokenSource = null;
let _tokenSetCount = 0;
let _tokenFromApiLogged = false;
let _authHeaderLogged = false;
let _401logged = false;
let _loginSuccessLogged = false;

setUserToken = function(token, skipManager = false, source = 'unknown') {
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
        
        const sanitizedToken = token
            .toString()
            .trim()
            .replace(/[\n\r\t\0\x00-\x1F]/g, '')
            .replace(/\s+/g, '')
            .replace(/[^\w\-\.]/g, '');
        
        const tokenChanged = AUTH_TOKEN !== sanitizedToken;
        
        if (!tokenChanged) {
            _isSettingToken = false;
            return true;
        }
        
        AUTH_TOKEN = sanitizedToken;
        TOKEN_READY = true;
        _tokenSetCount++;
        
        _saveAuthToStorage(sanitizedToken);
        
        if (!skipManager && TokenManager && typeof TokenManager._setTokenInternal === 'function') {
            TokenManager._setTokenInternal(sanitizedToken);
        }
        
        if (typeof window !== 'undefined') {
            window.__GLOBAL_TOKEN = sanitizedToken;
        }
        
        if (RequestQueue && typeof RequestQueue.updateDependency === 'function') {
            RequestQueue.updateDependency('tokenReady', true);
        }
        
        if (PARENT_SESSION && source !== 'parent.session') {
            if (window !== window.parent && window.parent && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage({
                    type: 'TOKEN_UPDATE',
                    data: {
                        token: sanitizedToken,
                        source: source,
                        timestamp: new Date().toISOString()
                    }
                }, '*');
            }
        }
        
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
        
        console.log(`[API] ðŸ” Token #${_tokenSetCount} set by: ${source}`);
        
        if (_lastTokenSource !== source) {
            console.log(`[API] Token source changed: ${_lastTokenSource || 'initial'} â†’ ${source}`);
            _lastTokenSource = source;
        }
        
        if (SESSION_READY && GATED_REQUESTS_QUEUE.length > 0) {
            _processGatedRequests();
        }
        
        _isSettingToken = false;
        return true;
        
    } catch (error) {
        _isSettingToken = false;
        console.error(`[API] âœ— Set token error from ${source}:`, error.message);
        return false;
    }
};

getUserToken = function(caller = 'unknown') {
    return getAuthToken();
};

clearUserToken = function(source = 'unknown') {
    try {
        if (AUTH_TOKEN === null && TOKEN_READY === false) {
            return true;
        }
        
        const hadToken = !!AUTH_TOKEN;
        const lastToken = AUTH_TOKEN ? AUTH_TOKEN.substring(0, 10) + '...' : 'none';
        
        AUTH_TOKEN = null;
        TOKEN_READY = false;
        
        _clearAuthFromStorage();
        
        if (TokenManager && typeof TokenManager._clearTokenInternal === 'function') {
            TokenManager._clearTokenInternal();
        }
        
        if (typeof window !== 'undefined') {
            window.__GLOBAL_TOKEN = null;
        }
        
        if (RequestQueue && typeof RequestQueue.updateDependency === 'function') {
            RequestQueue.updateDependency('tokenReady', false);
        }
        
        if (window !== window.parent && window.parent && typeof window.parent.postMessage === 'function') {
            window.parent.postMessage({
                type: 'TOKEN_CLEARED',
                data: {
                    source: source,
                    timestamp: new Date().toISOString()
                }
            }, '*');
        }
        
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('token-cleared', {
                detail: {
                    timestamp: new Date().toISOString(),
                    source: source,
                    hadToken: hadToken
                }
            }));
        }
        
        if (hadToken) {
            console.log(`[API] ðŸ”“ Token cleared by: ${source} (was: ${lastToken})`);
        }
        
        return true;
        
    } catch (error) {
        console.error(`[API] âœ— Clear token error from ${source}:`, error.message);
        return false;
    }
};

function _restoreTokenFromStorage() {
    const token = getAuthToken();
    if (token) {
        AUTH_TOKEN = token;
        TOKEN_READY = true;
        
        const user = _getUserFromStorage();
        if (user && !getCurrentUser()) {
            if (typeof setUserData === 'function') {
                setUserData(user, true);
            }
        }
        
        return true;
    }
    return false;
}

getToken = function(caller) { return getUserToken(caller || 'legacy'); };
setToken = function(token, source) { return setUserToken(token, false, source || 'legacy'); };
secureGetToken = getUserToken;
secureSetToken = setUserToken;
secureClearToken = clearUserToken;
getValidToken = getUserToken;

ensureToken = function() {
    const token = getUserToken('ensureToken');
    if (!token) {
        throw new KnectaError(
            '[API] No auth token â€” request blocked',
            401,
            'NO_TOKEN',
            { timestamp: new Date().toISOString() }
        );
    }
};

waitForToken = async function() {
    if (TOKEN_READY && AUTH_TOKEN) return;
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            clearInterval(interval);
            reject(new KnectaError(
                'Token ready timeout',
                408,
                'TOKEN_TIMEOUT'
            ));
        }, 10000);
        
        const interval = setInterval(() => {
            if (TOKEN_READY && AUTH_TOKEN) {
                clearInterval(interval);
                clearTimeout(timeout);
                resolve();
            }
        }, 50);
    });
};

// ============================================================================
// UTILITY FUNCTIONS - STANDARD RESPONSE FORMAT
// ============================================================================

function normalizeResponse(result, isError = false) {
    if (isError || (result && result.__error === true)) {
        return {
            success: false,
            error: result?.message || result?.error || 'An unknown error occurred',
            timestamp: new Date().toISOString()
        };
    }
    
    if (result && typeof result === 'object' && 'success' in result) {
        return result;
    }
    
    return {
        success: true,
        data: result,
        timestamp: new Date().toISOString()
    };
}

function withTimeout(promise, timeoutMs = 30000, errorMessage = 'Request timeout') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new KnectaError(errorMessage, 408, 'TIMEOUT_ERROR'));
            }, timeoutMs);
            promise.finally(() => clearTimeout(timeoutId));
        })
    ]);
}

function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 4)}`;
}
async function coreFetch(url, options = {}) {
    const requestStartTime = Date.now();
    const requestId = options.requestId || generateRequestId();
    let retryCount = 0;
    
    async function executeRequest() {
        try {
            if (url === 'GET' || url === 'POST' || url === 'PUT' || 
                url === 'PATCH' || url === 'DELETE' || url === 'HEAD' ||
                url === 'OPTIONS') {
                return normalizeResponse({
                    __error: true,
                    message: 'HTTP method cannot be used as endpoint',
                    method: url
                }, true);
            }
            
            if (!url || typeof url !== 'string') {
                return normalizeResponse({
                    __error: true,
                    message: 'Endpoint must be a string',
                    received: typeof url
                }, true);
            }
            
            const requestKey = `${options.method || 'GET'}:${url}`;
            if (activeRequests.has(requestKey) && options.dedupe !== false) {
                console.debug('[API] Deduplicating request:', requestKey);
                return activeRequests.get(requestKey);
            }
        
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
    let cleanEndpoint = url.startsWith('/') ? url : '/' + url;
    
    // CRITICAL FIX: Remove duplicate /api prefix
    if (cleanBase.endsWith('/api') && cleanEndpoint.startsWith('/api')) {
        cleanEndpoint = cleanEndpoint.substring(4); // Remove '/api' prefix
        if (!cleanEndpoint.startsWith('/')) {
            cleanEndpoint = '/' + cleanEndpoint;
        }
        console.log(`[API] 🔧 Fixed duplicate /api: ${cleanBase} + ${cleanEndpoint}`);
    }
    
    fullUrl = cleanBase + cleanEndpoint;
    endpointPath = cleanEndpoint;
    
    console.log(`[API] 🚀 Building request URL: ${fullUrl} (base: ${baseUrl}, endpoint: ${url})`);
    console.log(`[API CORE] ENV: ${CURRENT_ENVIRONMENT} | BASE_URL: ${baseUrl} | ENDPOINT: ${endpointPath}`);
}
            
            const baseUrl = getBaseUrl();
            if (!isValidEndpoint(fullUrl, baseUrl)) {
                return normalizeResponse({
                    __error: true,
                    message: 'Invalid or unsafe endpoint',
                    url: fullUrl,
                    baseUrl
                }, true);
            }
            
            if (isProduction() && fullUrl.startsWith('http://')) {
                console.warn('[API-SECURITY] Upgrading HTTP to HTTPS in production');
                fullUrl = fullUrl.replace('http://', 'https://');
            }
            
            const method = (options.method || 'GET').toUpperCase();
            
            const isPublic = isPublicEndpoint(endpointPath);
            const isAuth = isAuthEndpoint(endpointPath);
            const isStatus = isStatusEndpoint(endpointPath);
            const requiresAuth = !(options.auth === false || isPublic || isAuth || isStatus);
            
            if (requiresAuth) {
                if (!SESSION_READY && !options._gated) {
                    return _gateRequest(() => coreFetch(url, { ...options, _gated: true, retryCount }), {
                        endpoint: endpointPath,
                        requiresAuth,
                        gateTimeout: options.timeout || DEFAULT_TIMEOUT
                    });
                }
                
                await waitForToken();
                ensureToken();
            }
            
            const fetchOptions = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...options.headers
                },
                credentials: isProduction() ? 'include' : (options.credentials || 'same-origin'),
                mode: options.mode || 'cors',
                cache: options.cache || 'default',
                redirect: options.redirect || 'follow',
                referrerPolicy: options.referrerPolicy || 'strict-origin-when-cross-origin'
            };
            
            // In coreFetch function, when building headers
if (requiresAuth) {
    // CRITICAL: Try multiple sources for token
    let token = getUserToken('coreFetch');
    
    if (!token) {
        try {
            const stored = localStorage.getItem('kynecta_auth');
            if (stored) {
                const parsed = JSON.parse(stored);
                token = parsed.token;
            }
        } catch(e) {}
    }
    
    if (!token) {
        token = localStorage.getItem('token') || 
                localStorage.getItem('nexopa_token') || 
                localStorage.getItem('accessToken');
    }
    
    // Enhanced token validation before using
    if (token && typeof token === 'string' && token.length > 20) {
        const tokenValidation = validateToken(token);
        if (tokenValidation.valid) {
            fetchOptions.headers['Authorization'] = `Bearer ${token}`;
            console.log(`[API] 🔐 Auth header attached for: ${endpointPath} (token length: ${token.length}, type: ${tokenValidation.type})`);
            
            // Check if token needs refresh (only for JWT tokens)
            if (tokenValidation.type === 'JWT' && TokenManager && TokenManager.shouldRefreshToken()) {
                console.log('[API] 🔄 Token needs refresh, attempting background refresh');
                // Attempt background refresh without blocking the request
                refreshTokenIfNeeded().catch(err => {
                    console.warn('[API] Background token refresh failed:', err.message);
                });
            }
        } else {
            console.warn(`[API] ⚠️ Invalid token for protected endpoint: ${endpointPath} - ${tokenValidation.error}`);
            
            // Try to refresh the token if we have a refresh token
            if (TokenManager && TokenManager.getRefreshToken()) {
                console.log('[API] 🔄 Attempting token refresh due to validation failure');
                try {
                    const refreshResult = await refreshTokenIfNeeded();
                    if (refreshResult && refreshResult.success) {
                        token = refreshResult.token;
                        fetchOptions.headers['Authorization'] = `Bearer ${token}`;
                        console.log(`[API] ✅ Refreshed token attached for: ${endpointPath}`);
                    } else {
                        console.error('[API] ❌ Token refresh failed, request may fail');
                        // Don't set the header, let the request fail with 401
                    }
                } catch (refreshError) {
                    console.error('[API] ❌ Token refresh error:', refreshError.message);
                    // Don't set the header, let the request fail with 401
                }
            } else {
                console.error('[API] ❌ No refresh token available, request may fail');
                // Don't set the header, let the request fail with 401
            }
        }
    } else {
        console.warn(`[API] ⚠️ No valid token for protected endpoint: ${endpointPath}`);
    }
}
            
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
                        return normalizeResponse({
                            __error: true,
                            message: 'Failed to stringify request body',
                            originalError: e.message
                        }, true);
                    }
                }
            }
            
            const requestPromise = (async () => {
                const controller = createAbortController(requestId);
                // Use request-specific timeout or default
                const requestTimeout = options.timeout || DEFAULT_TIMEOUT;
                const timeoutId = setTimeout(() => {
                    console.warn(`[API] ⏰ Request timeout after ${requestTimeout}ms: ${fullUrl}`);
                    controller.abort();
                    abortControllers.delete(requestId);
                }, requestTimeout);
                
                try {
                    const response = await fetch(fullUrl, {
                        ...fetchOptions,
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    abortControllers.delete(requestId);
                    
                    return response;
                } catch (fetchError) {
                    clearTimeout(timeoutId);
                    abortControllers.delete(requestId);
                    throw fetchError;
                }
            })();
            
            let response;
            try {
                response = await withTimeout(
                    requestPromise,
                    options.timeout || DEFAULT_TIMEOUT,
                    `Request timeout after ${options.timeout || DEFAULT_TIMEOUT}ms - backend unreachable`
                );
            } catch (timeoutError) {
                activeRequests.delete(requestKey);
                console.error('[API] âŒ Request timeout:', fullUrl);
                return normalizeResponse({
                    __error: true,
                    message: timeoutError.message || 'Request timeout - backend unreachable',
                    url: fullUrl,
                    requestId,
                    timeout: true
                }, true);
            }
            
            const requestDuration = Date.now() - requestStartTime;
            
            let data = null;
            let responseText = null;
            
            try {
                responseText = await response.text();
            } catch (textError) {
                console.warn('[API] Failed to read response text', textError);
                responseText = '';
            }
            
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
                
                data = parsed || {};
            } else {
                const contentType = response.headers.get('content-type');
                
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
            
            if (data === null || data === undefined) {
                data = {};
            }
            if (typeof data !== 'object') {
                data = { value: data };
            }
            
            if (response.ok && data) {
                const token = data.token || 
                            data.accessToken || 
                            data.jwt || 
                            data.access_token ||
                            (data.tokens && data.tokens.accessToken) ||
                            (data.data && data.data.token) ||
                            (data.data && data.data.accessToken);
                
                if (token && typeof token === 'string') {
                    setUserToken(token, true, 'api.response');
                    RequestQueue.updateDependency('tokenReady', true);
                    
                    if (!_tokenFromApiLogged) {
                        console.log(`[API] âœ… Token received from ${endpointPath}`);
                        _tokenFromApiLogged = true;
                    }
                }
                
                const user = data.user || 
                           (data.data && data.data.user) || 
                           (data.data && !data.data.token ? data.data : null);
                
                if (user && setUserData) {
                    setUserData(user, true);
                    const currentToken = getUserToken();
                    if (currentToken) {
                        _saveAuthToStorage(currentToken, user);
                    }
                }
            }
            
            if (!response.ok) {
                if (response.status === 401) {
                    if (!_401logged) {
                        console.warn('[API] ⚠️ 401 Unauthorized - attempting token refresh');
                        _401logged = true;
                    }
                    
                    // Enhanced 401 handling with token validation
                    if (retryCount < MAX_RETRIES) {
                        // First, validate current token to see if it's the issue
                        const currentToken = getUserToken('401.handler');
                        const tokenValidation = validateToken(currentToken);
                        
                        if (!tokenValidation.valid) {
                            console.warn('[AUTH] Current token is invalid, attempting refresh');
                        }
                        
                        // Attempt refresh if we have a refresh token
                        if (TokenManager && TokenManager.getRefreshToken()) {
                            console.log(`[API] 🔄 Attempting token refresh (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                            const refreshResult = await refreshTokenIfNeeded();
                            
                            if (refreshResult && refreshResult.success) {
                                console.log('[API] ✅ Token refresh successful, retrying request');
                                retryCount++;
                                return executeRequest();
                            } else if (refreshResult && refreshResult.requiresReauth) {
                                console.error('[AUTH] Token refresh failed - requires reauthentication');
                                clearUserToken('401.refresh_failed');
                                
                                // Dispatch auth expired event
                                if (typeof window !== 'undefined') {
                                    window.dispatchEvent(new CustomEvent('auth:expired', {
                                        detail: {
                                            endpoint: endpointPath,
                                            requestId,
                                            reason: 'refresh_failed',
                                            timestamp: new Date().toISOString()
                                        }
                                    }));
                                    // FIX (auth-cascade): 'auth:expired' has no listeners anywhere
                                    // in the frontend — app.realtime.socket.js only listens for
                                    // 'user-logged-out' / 'auth:session:ended' to stop its reconnect
                                    // loop. Without this, the socket kept reconnecting (and
                                    // GroupOrchestrator/PollingManager kept re-polling) forever
                                    // against a session that had already died here. Dispatch the
                                    // event the socket manager actually listens for too.
                                    window.dispatchEvent(new CustomEvent('auth:session:ended', {
                                        detail: {
                                            endpoint: endpointPath,
                                            requestId,
                                            reason: 'refresh_failed',
                                            timestamp: new Date().toISOString()
                                        }
                                    }));
                                }
                                
                                if (handleUnauthorizedAccess && !options._suppressAuthRedirect) {
                                    handleUnauthorizedAccess();
                                }
                            } else {
                                console.warn('[AUTH] Refresh failed - checking stored token');
                                // Only clear if storage also has no token
                                const storedToken = _getTokenFromStorage();
                                if (!storedToken) {
                                    clearUserToken('401.no_storage_token');
                                } else {
                                    // Validate stored token before restoring
                                    const storedValidation = validateToken(storedToken);
                                    if (storedValidation.valid) {
                                        // Restore from storage without clearing
                                        AUTH_TOKEN = storedToken;
                                        TOKEN_READY = true;
                                        console.log('[API] Restored valid token from storage after 401');
                                        retryCount++;
                                        return executeRequest();
                                    } else {
                                        console.warn('[API] Stored token is also invalid, clearing');
                                        clearUserToken('401.invalid_storage_token');
                                    }
                                }
                            }
                        } else {
                            console.warn('[AUTH] No refresh token available — checking stored token');
                            // Only clear if storage also has no token
                            const storedToken = _getTokenFromStorage();
                            if (!storedToken) {
                                clearUserToken('401.no_refresh_or_storage');
                            } else {
                                // Validate stored token before restoring
                                const storedValidation = validateToken(storedToken);
                                if (storedValidation.valid) {
                                    // Restore from storage without clearing
                                    AUTH_TOKEN = storedToken;
                                    TOKEN_READY = true;
                                    console.log('[API] Restored valid token from storage after 401');
                                    retryCount++;
                                    return executeRequest();
                                } else {
                                    console.warn('[API] Stored token is invalid, clearing');
                                    clearUserToken('401.invalid_storage_token');
                                }
                            }
                        }
                    } else {
                        console.error('[AUTH] Max retries exceeded for 401, clearing session');
                        clearUserToken('401.max_retries');
                        
                        // Dispatch auth expired event
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('auth:expired', {
                                detail: {
                                    endpoint: endpointPath,
                                    requestId,
                                    reason: 'max_retries',
                                    timestamp: new Date().toISOString()
                                }
                            }));
                        }
                    }
                    
                    // Dispatch unauthorized event for general handling
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('auth:unauthorized', {
                            detail: {
                                endpoint: endpointPath,
                                requestId,
                                timestamp: new Date().toISOString()
                            }
                        }));
                    }
                    
                    if (handleUnauthorizedAccess && !options._suppressAuthRedirect) {
                        handleUnauthorizedAccess();
                    }
                }
                
                const errorMessage = (data && (data.message || data.error)) || response.statusText || 'Request failed';
                
                return normalizeResponse({
                    __error: true,
                    message: errorMessage,
                    status: response.status,
                    statusText: response.statusText,
                    data: data,
                    url: response.url || fullUrl,
                    requestId
                }, true);
            }
            
            const result = {
                success: true,
                status: response.status,
                statusText: response.statusText,
                data: data,
                headers: Object.fromEntries(response.headers.entries()),
                url: response.url || fullUrl,
                method: method,
                requestDuration: requestDuration,
                timestamp: Date.now(),
                requestId: requestId
            };
            
            console.log(`[API] âœ… Request completed: ${method} ${endpointPath} (${requestDuration}ms)`);
            return normalizeResponse(result);
          
            } catch (error) {
    console.error('[API] ❌ Core fetch error:', error);
    
    // Check if we should retry (for network errors AND timeouts)
    const isTimeoutError = error.name === 'AbortError' || 
                           error.message?.toLowerCase().includes('timeout') ||
                           error.message?.toLowerCase().includes('aborted');
    const isNetworkError = error.message?.toLowerCase().includes('network') || 
                           error.message?.toLowerCase().includes('failed to fetch');
    
    if (retryCount < MAX_RETRIES && (isNetworkError || isTimeoutError)) {
        const retryDelay = isTimeoutError ? 2000 : 1000; // Longer delay for timeout retry
        console.log(`[API] 🔄 ${isTimeoutError ? 'Timeout' : 'Network'} error, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return executeRequest();
    }
            
            return normalizeResponse({
                __error: true,
                message: error.message || 'Request failed',
                status: error.status || 500,
                code: error.code || 'UNKNOWN_ERROR',
                url: url,
                requestId: requestId,
                stack: error.stack
            }, true);
        } finally {
            const requestKey = `${options.method || 'GET'}:${url}`;
            activeRequests.delete(requestKey);
            
            if (requestTimeouts.has(requestId)) {
                clearTimeout(requestTimeouts.get(requestId));
                requestTimeouts.delete(requestId);
            }
        }
    }
    
    return executeRequest();
}

secureApiFetch = async function(url, options = {}) {
    // Ensure API core is ready before making requests
    if (SAIC.currentState !== SAIC.STATES.READY) {
        console.log(`[API] â³ Waiting for API core to be ready (state: ${SAIC.currentState})`);
        await SAIC.readyPromise;
    }
    return coreFetch(url, options);
};

secureRequest = secureApiFetch;

// ============================================================================
// GUARDED REQUEST
// ============================================================================

guardedRequest = async function(url, options = {}) {
    // Ensure API core is ready before processing requests
    if (SAIC.currentState !== SAIC.STATES.READY) {
        console.log(`[API] â³ Guarded request waiting for API core ready (state: ${SAIC.currentState})`);
        await SAIC.readyPromise;
    }
    
    const endpointPath = url.startsWith('http') ? new URL(url).pathname : url;
    const isPublic = isPublicEndpoint(endpointPath);
    const isAuth = isAuthEndpoint(endpointPath);
    const isStatus = isStatusEndpoint(endpointPath);
    
    const requiresAuth = !(options.auth === false || isPublic || isAuth || isStatus);
    
    if (requiresAuth && !SESSION_READY) {
        return _gateRequest(() => guardedRequest(url, { ...options, _gated: true }), {
            endpoint: endpointPath,
            requiresAuth,
            gateTimeout: options.timeout || 30000
        });
    }
    
    if (requiresAuth) {
        await waitForToken();
        ensureToken();
    }
    
    return secureApiFetch(url, options);
};

// ============================================================================
// PUBLIC API METHODS
// ============================================================================

get = async function(endpoint, params = {}) {
    try {
        let url = endpoint;
        if (params && Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += (url.includes('?') ? '&' : '?') + queryString;
        }
        return await guardedRequest(url, { method: 'GET' });
    } catch (error) {
        return normalizeResponse(error, true);
    }
};

post = async function(endpoint, data = {}) {
    try {
        return await guardedRequest(endpoint, { method: 'POST', body: data });
    } catch (error) {
        return normalizeResponse(error, true);
    }
};

put = async function(endpoint, data = {}) {
    try {
        return await guardedRequest(endpoint, { method: 'PUT', body: data });
    } catch (error) {
        return normalizeResponse(error, true);
    }
};

patch = async function(endpoint, data = {}) {
    try {
        return await guardedRequest(endpoint, { method: 'PATCH', body: data });
    } catch (error) {
        return normalizeResponse(error, true);
    }
};

del = async function(endpoint, body) {
    try {
        const opts = { method: 'DELETE' };
        if (body) {
            opts.body    = JSON.stringify(body);
            opts.headers = { 'Content-Type': 'application/json' };
        }
        return await guardedRequest(endpoint, opts);
    } catch (error) {
        return normalizeResponse(error, true);
    }
};

head = async function(endpoint) {
    try {
        return await guardedRequest(endpoint, { method: 'HEAD' });
    } catch (error) {
        return normalizeResponse(error, true);
    }
};

options = async function(endpoint) {
    try {
        return await guardedRequest(endpoint, { method: 'OPTIONS' });
    } catch (error) {
        return normalizeResponse(error, true);
    }
};

fetchWithTimeout = async function(url, options = {}) {
    return secureApiFetch(url, options);
};

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

requestWithAbort = async function(url, options = {}) {
    return secureApiFetch(url, options);
};

// ============================================================================
// ERROR NORMALIZATION - COMPLETE IMPLEMENTATION
// ============================================================================

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

NetworkError = class NetworkError extends KnectaError {
    constructor(message = 'Network connection failed', data = null) {
        super(message, 0, 'NETWORK_ERROR', data);
        this.name = 'NetworkError';
    }
};

SessionError = class SessionError extends KnectaError {
    constructor(message = 'Session invalid or expired', data = null) {
        super(message, 401, 'SESSION_ERROR', data);
        this.name = 'SessionError';
    }
};

AuthError = class AuthError extends KnectaError {
    constructor(message = 'Authentication failed', status = 401, code = 'AUTH_ERROR', data = null) {
        super(message, status, code, data);
        this.name = 'AuthError';
    }
};

ValidationError = class ValidationError extends KnectaError {
    constructor(message = 'Validation failed', status = 400, code = 'VALIDATION_ERROR', data = null) {
        super(message, status, code, data);
        this.name = 'ValidationError';
    }
};

ApiError = KnectaError;
ApiGatewayError = KnectaError;

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

isApiError = function(value) {
    return value instanceof KnectaError || 
           (value && value.isKnectaError === true) ||
           (value && value.isApiError === true);
};

createError = function(message, status = 500, code = 'CUSTOM_ERROR', data = null) {
    return new KnectaError(message, status, code, data);
};

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
    
    const message = normalized.message || 'An unexpected error occurred.';
    return escapeHtml ? escapeHtml(message) : message;
};

getErrorStatusCode = function(error) {
    const normalized = normalizeError(error, '', 500);
    return normalized.status;
};

getErrorCode = function(error) {
    const normalized = normalizeError(error);
    return normalized.code;
};

isNetworkError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status === 0 || 
           normalized.code === 'NETWORK_ERROR' ||
           normalized.category === 'network' ||
           error instanceof NetworkError;
};

isTimeoutError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status === 408 || 
           normalized.code === 'TIMEOUT_ERROR' ||
           normalized.category === 'timeout';
};

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

isServerError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status >= 500 && normalized.status < 600;
};

isClientError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status >= 400 && normalized.status < 500 && normalized.status !== 401 && normalized.status !== 403;
};

isRateLimitError = function(error) {
    const normalized = normalizeError(error);
    return normalized.status === 429 || 
           normalized.code === 'RATE_LIMITED' ||
           normalized.category === 'rate_limit';
};

// ============================================================================
// PARENT SESSION NORMALIZATION
// ============================================================================

function _normalizeParentSession(sessionData) {
    if (!sessionData || typeof sessionData !== 'object') {
        return null;
    }
    
    const normalized = { ...sessionData };
    
    if (normalized.userId !== undefined && normalized.userId !== null) {
        const originalUserId = normalized.userId;
        
        if (typeof originalUserId === 'number') {
            normalized.userIdNumber = originalUserId;
            normalized.userIdString = String(originalUserId);
        } else if (typeof originalUserId === 'string') {
            normalized.userIdString = originalUserId;
            const parsed = parseInt(originalUserId, 10);
            if (!isNaN(parsed)) {
                normalized.userIdNumber = parsed;
            }
        }
        
        normalized._originalUserId = originalUserId;
    }
    
    if (normalized.token && typeof normalized.token === 'string') {
        normalized.token = normalized.token.trim();
    }
    
    if (normalized.authenticated === undefined && normalized.token) {
        normalized.authenticated = true;
    }
    
    normalized._normalized = true;
    normalized._normalizedAt = Date.now();
    normalized._normalizationVersion = '24.0.4';
    
    return normalized;
}

function _updateSessionFromParent(sessionData) {
    try {
        if (!sessionData || typeof sessionData !== 'object') {
            console.warn('[PARENT-SYNC] Invalid session data received');
            return false;
        }
        
        const normalized = _normalizeParentSession(sessionData);
        if (!normalized) {
            console.warn('[PARENT-SYNC] Failed to normalize session data');
            return false;
        }
        
        const sessionChanged = JSON.stringify(PARENT_SESSION) !== JSON.stringify(normalized);
        
        if (!sessionChanged && SESSION_READY) {
            if (!SESSION_READY) {
                SESSION_READY = true;
                _processGatedRequests();
            }
            return true;
        }
        
        const previousSession = PARENT_SESSION;
        
        PARENT_SESSION = normalized;
        LAST_SESSION_UPDATE = Date.now();
        SESSION_UPDATE_COUNT++;
        
        if (normalized.token && typeof normalized.token === 'string') {
            const tokenUpdated = setUserToken(normalized.token, true, 'parent.session');
            
            if (tokenUpdated) {
                console.log('[PARENT-SYNC] âœ… Token updated from parent session');
                
                if (TokenManager && typeof TokenManager._setTokenInternal === 'function') {
                    TokenManager._setTokenInternal(normalized.token);
                }
            }
        }
        
        if (normalized.user && typeof normalized.user === 'object') {
            const userUpdated = setUserData(normalized.user, true);
            if (userUpdated) {
                console.log('[PARENT-SYNC] âœ… User data updated from parent session');
            }
        } else if (normalized.userId) {
            const minimalUser = {
                id: normalized.userIdNumber || normalized.userIdString || normalized.userId,
                _fromParent: true,
                _sessionUpdate: SESSION_UPDATE_COUNT
            };
            setUserData(minimalUser, true);
        }
        
        NORMALIZED_USER_ID = normalized.userIdNumber || normalized.userIdString || normalized.userId;
        
        const wasReady = SESSION_READY;
        SESSION_READY = true;
        
        if (RequestQueue && typeof RequestQueue.updateDependency === 'function') {
            RequestQueue.updateDependency('parentReady', PARENT_READY);
            RequestQueue.updateDependency('sessionReady', SESSION_READY);
        }
        
        TOKEN_READY = !!normalized.token;
        
        console.log(`[PARENT-SYNC] ðŸ“¡ Session updated (v${SESSION_UPDATE_COUNT})`, {
            hasToken: !!normalized.token,
            hasUser: !!normalized.user,
            userId: NORMALIZED_USER_ID,
            wasReady,
            isReady: SESSION_READY,
            timestamp: new Date().toISOString()
        });
        
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('parent-session-updated', {
                detail: {
                    session: normalized,
                    updateCount: SESSION_UPDATE_COUNT,
                    previous: previousSession ? {
                        hasToken: !!previousSession.token,
                        hasUser: !!previousSession.user
                    } : null,
                    timestamp: new Date().toISOString()
                }
            }));
        }
        
        if (!wasReady && SESSION_READY) {
            _processGatedRequests();
        }
        
        return true;
        
    } catch (error) {
        console.error('[PARENT-SYNC] Failed to update session:', error);
        return false;
    }
}

function _gateRequest(requestFn, options = {}) {
    return new Promise((resolve, reject) => {
        const requiresAuth = options.auth !== false && !isPublicEndpoint(options.endpoint || '');
        
        if (SESSION_READY && (!requiresAuth || (AUTH_TOKEN && TOKEN_READY))) {
            requestFn().then(resolve).catch(reject);
            return;
        }
        
        const requestId = `gated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        GATED_REQUESTS_QUEUE.push({
            id: requestId,
            fn: requestFn,
            resolve,
            reject,
            options,
            requiresAuth,
            createdAt: Date.now(),
            endpoint: options.endpoint || 'unknown'
        });
        
        console.debug(`[REQUEST-GATE] Request gated (${requestId})`, {
            endpoint: options.endpoint,
            requiresAuth,
            sessionReady: SESSION_READY,
            hasToken: !!AUTH_TOKEN,
            queueSize: GATED_REQUESTS_QUEUE.length
        });
        
        const timeout = setTimeout(() => {
            const index = GATED_REQUESTS_QUEUE.findIndex(r => r.id === requestId);
            if (index !== -1) {
                GATED_REQUESTS_QUEUE.splice(index, 1);
                reject(new KnectaError(
                    `Request gated timeout after ${options.gateTimeout || 30000}ms`,
                    408,
                    'GATE_TIMEOUT',
                    { endpoint: options.endpoint, requestId }
                ));
            }
        }, options.gateTimeout || 30000);
        
        GATED_REQUESTS_QUEUE[GATED_REQUESTS_QUEUE.length - 1].timeout = timeout;
    });
}

function _processGatedRequests() {
    if (IS_PROCESSING_PENDING || GATED_REQUESTS_QUEUE.length === 0) {
        return;
    }
    
    IS_PROCESSING_PENDING = true;
    
    console.log(`[REQUEST-GATE] Processing ${GATED_REQUESTS_QUEUE.length} gated requests`);
    
    const requestsToProcess = [...GATED_REQUESTS_QUEUE];
    GATED_REQUESTS_QUEUE = [];
    
    requestsToProcess.forEach(request => {
        if (request.timeout) {
            clearTimeout(request.timeout);
        }
        
        const requiresAuth = request.requiresAuth;
        
        if (!requiresAuth || (AUTH_TOKEN && TOKEN_READY)) {
            request.fn()
                .then(request.resolve)
                .catch(request.reject);
        } else {
            setTimeout(() => {
                GATED_REQUESTS_QUEUE.push(request);
                _processGatedRequests();
            }, 100);
        }
    });
    
    IS_PROCESSING_PENDING = false;
    
    if (GATED_REQUESTS_QUEUE.length > 0) {
        console.log(`[REQUEST-GATE] ${GATED_REQUESTS_QUEUE.length} requests still waiting`);
    }
}

function _initParentMessageListeners() {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('message', (event) => {
        try {
            const { type, data, source } = event.data || {};
            
            const isTrusted = source === 'parent' || 
                             (event.source === window.parent && window.parent !== window) ||
                             (event.origin === window.location.origin);
            
            if (!isTrusted && type !== 'PARENT_READY' && type !== 'SESSION_DATA') {
                return;
            }
            
            if (type === 'PARENT_READY') {
                PARENT_READY = true;
                
                console.log('[PARENT-SYNC] Parent ready signal received');
                
                if (RequestQueue && typeof RequestQueue.updateDependency === 'function') {
                    RequestQueue.updateDependency('parentReady', true);
                }
                
                window.dispatchEvent(new CustomEvent('parent-ready', {
                    detail: {
                        timestamp: new Date().toISOString(),
                        data: data
                    }
                }));
                
                return;
            }
            
            if (type === 'SESSION_DATA' || type === 'SESSION_UPDATE') {
                const sessionData = data || event.data.session;
                
                if (sessionData) {
                    console.log('[PARENT-SYNC] Session data received from parent');
                    _updateSessionFromParent(sessionData);
                }
                
                return;
            }
            
            if (PARENT_MESSAGE_HANDLERS.has(type)) {
                const handler = PARENT_MESSAGE_HANDLERS.get(type);
                handler(event.data);
            }
            
        } catch (error) {
            console.error('[PARENT-SYNC] Message handler error:', error);
        }
    });
    
    if (window !== window.parent) {
        window.parent.postMessage({
            type: 'CHILD_READY',
            data: {
                version: '24.0.4',
                timestamp: new Date().toISOString(),
                requiresSession: true
            }
        }, '*');
        
        setTimeout(() => {
            if (!SESSION_READY && !PARENT_SESSION) {
                window.parent.postMessage({
                    type: 'REQUEST_SESSION',
                    data: {
                        version: '24.0.4',
                        timestamp: new Date().toISOString()
                    }
                }, '*');
            }
        }, 100);
    } else {
        PARENT_READY = true;
        SESSION_READY = true;
        
        const storedToken = _getTokenFromStorage();
        if (storedToken) {
            PARENT_SESSION = {
                token: storedToken,
                authenticated: true,
                userId: _getUserFromStorage()?.id || null,
                user: _getUserFromStorage(),
                _source: 'storage',
                _normalized: true
            };
            SESSION_READY = true;
            TOKEN_READY = true;
        }
    }
}

function _registerParentMessageHandler(type, handler) {
    PARENT_MESSAGE_HANDLERS.set(type, handler);
    return () => PARENT_MESSAGE_HANDLERS.delete(type);
}

// ============================================================================
// IFRAME API RELAY
// Fallback relay for API_REQUEST messages from child iframes.
// NOTE: When loaded inside chat.html (which has its own complete API handler),
// this relay is intentionally disabled via window.__parentHandlesApiRequests.
// This prevents double-responses where both chat.html's handler AND this relay
// respond to the same requestId, causing "No pending request" warnings.
// ============================================================================
window.addEventListener('message', async (event) => {
    // Skip if the parent page (chat.html) already has a dedicated handler
    if (window.__parentHandlesApiRequests) return;

    try {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type !== 'API_REQUEST') return;

        // Allow relay for all child iframes, not just 'messages'
        const allowedSources = ['messages', 'friends', 'groups', 'calls', 'status', 'settings', 'tools'];
        if (msg.source && !allowedSources.includes(msg.source)) return;

        const { requestId, payload } = msg;
        if (!requestId || !payload) return;

        const { endpoint, method = 'GET', body, params } = payload;
        if (!endpoint) return;

        // Build full URL using the backend base URL, NOT the live-server origin.
        // window.location.origin points to the dev server (e.g. 127.0.0.1:5500)
        // which does not host the API — the API is always at localhost:4000.
        const getBackendBase = () => {
            if (typeof window.__getApiBase === 'function') {
                return window.__getApiBase().replace(/\/api\/?$/, '');
            }
            // Fallback: detect by hostname
            const h = window.location.hostname;
            if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:4000';
            return window.location.origin; // production: same origin
        };

        const normalizedEndpoint = endpoint.startsWith('/api/')
            ? endpoint
            : '/api' + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);

        let url = getBackendBase() + normalizedEndpoint;
        if (params && typeof params === 'object') {
            const filtered = Object.fromEntries(
                Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
            );
            const qs = new URLSearchParams(filtered).toString();
            if (qs) url += '?' + qs;
        }

        const token = getAuthToken();
        const fetchOptions = {
            method: method.toUpperCase(),
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': 'Bearer ' + token } : {})
            }
        };
        if (body && method.toUpperCase() !== 'GET') {
            fetchOptions.body = JSON.stringify(body);
        }

        let responseData;
        let statusCode;
        try {
            const res = await fetch(url, fetchOptions);
            statusCode = res.status;
            responseData = await res.json().catch(() => ({ success: false, message: 'Non-JSON response' }));
        } catch (fetchErr) {
            // Network failure — send error back to child
            // FIXED: wrap in payload so messages-core.js handleApiResponse can read it correctly
            event.source && event.source.postMessage({
                type: 'API_RESPONSE',
                source: 'parent',
                requestId,
                payload: {
                    success: false,
                    error: fetchErr.message || 'Network error',
                    statusCode: 0,
                    data: null
                },
                // Also set top-level for backwards compat with other consumers
                success: false,
                error: fetchErr.message || 'Network error',
                status: 0
            }, event.origin || '*');
            return;
        }

        const success = statusCode >= 200 && statusCode < 300;
        // FIXED: include both a top-level payload wrapper (for messages-core / friend-core which
        // read data.payload) AND top-level fields (for any legacy consumers).
        event.source && event.source.postMessage({
            type: 'API_RESPONSE',
            source: 'parent',
            requestId,
            payload: {
                success,
                data: responseData,
                statusCode
            },
            // Legacy top-level fields kept for backward compat
            success,
            data: responseData,
            status: statusCode
        }, event.origin || '*');

    } catch (err) {
        console.error('[API-RELAY] Unexpected error handling API_REQUEST:', err);
    }
});

// ============================================================================
// SECURE STORAGE
// ============================================================================

SecureStorage = {
    _encryptionKey: 'nexopa_secure_v24_2026',
    _prefix: 'sc_v24_',
    _version: '24.0.4',
    _salt: Math.random().toString(36).substring(2, 15),
    
   // Replace the _xorEncrypt function with this Unicode-safe version
_xorEncrypt: function(text, key) {
    try {
        if (!text) return text;
        
        const textStr = typeof text === 'string' ? text : JSON.stringify(text);
        const saltedKey = key + this._salt;
        
        // Convert string to UTF-8 bytes for proper Unicode handling
        const utf8Bytes = new TextEncoder().encode(textStr);
        const resultBytes = new Uint8Array(utf8Bytes.length);
        
        for (let i = 0; i < utf8Bytes.length; i++) {
            const keyChar = saltedKey.charCodeAt(i % saltedKey.length);
            resultBytes[i] = utf8Bytes[i] ^ keyChar;
        }
        
        // Convert to base64 safely
        const result = Array.from(resultBytes).map(b => String.fromCharCode(b)).join('');
        const encrypted = btoa(result);
        return `v24:${this._salt.substring(0, 8)}:${encrypted}`;
        
    } catch (e) {
        console.error('[SECURE-STORAGE] Encryption error:', e);
        // Fallback: store without encryption for text with Unicode
        return text;
    }
},

_xorDecrypt: function(encrypted, key) {
    try {
        if (!encrypted || typeof encrypted !== 'string') return encrypted;
        
        if (encrypted.startsWith('v24:')) {
            const parts = encrypted.split(':');
            if (parts.length >= 3) {
                const salt = parts[1];
                const encryptedData = parts.slice(2).join(':');
                const decoded = atob(encryptedData);
                
                // Convert back from UTF-8
                const decodedBytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) {
                    decodedBytes[i] = decoded.charCodeAt(i);
                }
                
                const saltedKey = key + salt;
                const resultBytes = new Uint8Array(decodedBytes.length);
                
                for (let i = 0; i < decodedBytes.length; i++) {
                    const keyChar = saltedKey.charCodeAt(i % saltedKey.length);
                    resultBytes[i] = decodedBytes[i] ^ keyChar;
                }
                
                // Decode UTF-8 bytes back to string
                const result = new TextDecoder().decode(resultBytes);
                return result;
            }
        }
        
        // Legacy decryption attempt
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

    _xorDecrypt: function(encrypted, key) {
        try {
            if (!encrypted || typeof encrypted !== 'string') return encrypted;
            
            if (encrypted.startsWith('v24:')) {
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
    
    removeItem: function(key) {
        try {
            localStorage.removeItem(this._prefix + key);
            return true;
        } catch (error) {
            console.error('[SECURE-STORAGE] Remove item error:', error);
            return false;
        }
    },
    
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
    
    hasItem: function(key) {
        return localStorage.getItem(this._prefix + key) !== null;
    },
    
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

// ============================================================================
// TOKEN MANAGER
// ============================================================================

TokenManager = {
    TOKEN_KEY: 'USER_TOKEN',
    REFRESH_TOKEN_KEY: 'REFRESH_TOKEN',
    TOKEN_EXPIRY_KEY: 'TOKEN_EXPIRY',
    TOKEN_CREATED_KEY: 'TOKEN_CREATED',
    TOKEN_TYPE_KEY: 'TOKEN_TYPE',
    DEFAULT_EXPIRY: 3600,
    REFRESH_THRESHOLD: 300,
    
    _refreshLock: false,
    _refreshPromise: null,
    
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
    
    setToken: function(token, refreshToken = null, expiresIn = this.DEFAULT_EXPIRY, tokenType = 'Bearer') {
        try {
            if (!token || typeof token !== 'string') {
                console.error('[TOKEN-MANAGER] Invalid token provided');
                return false;
            }
            
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
    
    getToken: function() {
        return getUserToken('TokenManager');
    },
    
    getRefreshToken: function() {
        try {
            return SecureStorage.getItem(this.REFRESH_TOKEN_KEY, true, false);
        } catch (error) {
            console.error('[TOKEN-MANAGER] Get refresh token error:', error);
            return null;
        }
    },
    
    clearToken: function() {
        try {
            clearUserToken('TokenManager');
            this._clearTokenInternal();
            this._refreshLock = false;
            this._refreshPromise = null;
            return true;
        } catch (error) {
            console.error('[TOKEN-MANAGER] Clear token error:', error);
            return false;
        }
    },
    
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
    
    getTokenExpiry: function() {
        try {
            const expiryStr = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
            return expiryStr ? parseInt(expiryStr, 10) : null;
        } catch (error) {
            console.error('[TOKEN-MANAGER] Get token expiry error:', error);
            return null;
        }
    },
    
    getTokenCreated: function() {
        try {
            const createdStr = localStorage.getItem(this.TOKEN_CREATED_KEY);
            return createdStr ? parseInt(createdStr, 10) : null;
        } catch (error) {
            return null;
        }
    },
    
    getTokenType: function() {
        try {
            return localStorage.getItem(this.TOKEN_TYPE_KEY) || 'Bearer';
        } catch (error) {
            return 'Bearer';
        }
    },
    
    setTokenWithExpiry: function(token, expiryTimestamp, refreshToken = null) {
        try {
            const expiresIn = Math.max(1, Math.floor((expiryTimestamp - Date.now()) / 1000));
            return this.setToken(token, refreshToken, expiresIn);
        } catch (error) {
            console.error('[TOKEN-MANAGER] Set token with expiry error:', error);
            return false;
        }
    },
    
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
    
    _validateTokenFormat: function(token) {
        if (!token || typeof token !== 'string') return false;
        
        const parts = token.split('.');
        if (parts.length === 3) {
            try {
                const header = JSON.parse(atob(parts[0]));
                const payload = JSON.parse(atob(parts[1]));
                return !!(header && payload);
            } catch (e) {
                return token.length > 20;
            }
        }
        
        return token.length > 20;
    },
    
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
    
    migrateLegacyTokens: function() {
        try {
            const legacyKeys = [
                'accessToken', 'nexopa_token', 'token', 'nexopa_auth_token',
                'authToken', 'userToken', 'jwt', 'access_token'
            ];
            
            for (const key of legacyKeys) {
                const token = localStorage.getItem(key);
                if (token && token.length > 20 && token !== 'null' && token !== 'undefined') {
                    this.setToken(token, null, this.DEFAULT_EXPIRY);
                    return true;
                }
            }
            
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

encryptToken = function(token) {
    SecureStorage.setItem('temp_token', token, true);
    return true;
};

decryptToken = function(encryptedToken) {
    return SecureStorage.getItem('temp_token', true, false);
};

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

refreshTokenIfNeeded = async function() {
    if (TokenManager._refreshLock && TokenManager._refreshPromise) {
        return TokenManager._refreshPromise;
    }
    
    try {
        const currentToken = getUserToken('refreshTokenIfNeeded');
        if (!currentToken) {
            return { success: false, error: 'No token to refresh' };
        }
        
        // Enhanced token validation
        //
        // FIX-ROOT-CAUSE-TOKEN-REFRESH-NEVER-HAPPENS: an *expired* access
        // token is exactly the normal case this function exists to handle —
        // the refresh token below is what's supposed to exchange it for a
        // new one. The old code treated "Token expired (JWT exp claim)" as
        // a hard validation failure and returned immediately with
        // requiresReauth:true, so the refresh endpoint further down was
        // NEVER actually called once the access token passed its exp claim.
        // Every caller (message send, conversation fetch, friend sync, key
        // fetch for E2E) kept re-discovering the same expired token forever
        // — this is the "[TOKEN] Token validation failed: Token expired"
        // loop repeating every few seconds in the logs — until a full
        // manual re-login. It also explains encrypted messages failing:
        // GET /api/encryption/keys/:userId needs a valid access token, and
        // with refresh permanently short-circuited that call 401s forever,
        // so the identity key never arrives and decryptFromChat gives up
        // with "[Decryption failed — identity key unavailable]".
        // Only a token that's missing or structurally malformed (not just
        // expired) should skip straight to reauth; an expired-but-well-
        // formed token should fall through to the refresh-token exchange
        // below like any other case that needs a refresh.
        const validationResult = validateToken(currentToken);
        const isExpiredOnly = !validationResult.valid &&
            validationResult.error === 'Token expired (JWT exp claim)';
        if (!validationResult.valid && !isExpiredOnly) {
            console.warn('[TOKEN] Token validation failed:', validationResult.error);
            return { 
                success: false, 
                error: validationResult.error,
                token: currentToken,
                requiresReauth: true
            };
        }
        
        if (validationResult.valid && !TokenManager.shouldRefreshToken()) {
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
                token: currentToken,
                requiresReauth: true
            };
        }
        
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
                    credentials: 'include',
                    signal: AbortSignal.timeout(45000) // FIX: was 10000 — too short for 1KB/s links or Render cold start
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
                        // Validate new token before accepting
                        const newValidation = validateToken(newToken);
                        if (!newValidation.valid) {
                            console.error('[TOKEN] Received invalid token from refresh endpoint');
                            return {
                                success: false,
                                error: 'Invalid token received from refresh',
                                token: currentToken,
                                requiresReauth: true
                            };
                        }
                        
                        setUserToken(newToken, true, 'token.refresh');
                        TokenManager.setToken(newToken, newRefreshToken, expiresIn);
                        
                        console.log('[TOKEN] ✅ Token refreshed successfully');
                        return {
                            success: true,
                            token: newToken,
                            refreshed: true,
                            expiresIn: expiresIn
                        };
                    }
                } else {
                    // Handle specific error cases
                    if (response.status === 401 || response.status === 403) {
                        console.warn('[TOKEN] Refresh token rejected - may be expired');
                        return {
                            success: false,
                            error: 'Refresh token expired or invalid',
                            token: currentToken,
                            requiresReauth: true
                        };
                    }
                }
                
                return {
                    success: false,
                    error: data?.message || 'Refresh failed',
                    token: currentToken,
                    requiresReauth: response.status === 401 || response.status === 403
                };
            } catch (error) {
                if (error.name === 'AbortError') {
                    return {
                        success: false,
                        error: 'Refresh request timeout',
                        token: currentToken
                    };
                }
                throw error;
            } finally {
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
// TOKEN VALIDATION
// ============================================================================

validateToken = function(token) {
    try {
        if (!token || typeof token !== 'string') {
            return { valid: false, error: 'Token is missing or not a string' };
        }
        
        // Check basic token format (JWT or opaque token)
        if (token.length < 10) {
            return { valid: false, error: 'Token too short' };
        }
        
        // If it's a JWT, validate structure
        const parts = token.split('.');
        if (parts.length === 3) {
            try {
                const header = JSON.parse(atob(parts[0]));
                const payload = JSON.parse(atob(parts[1]));
                
                // Check for required JWT fields
                if (!header || !payload) {
                    return { valid: false, error: 'Invalid JWT structure' };
                }
                
                // Check expiration if present
                if (payload.exp && typeof payload.exp === 'number') {
                    const now = Math.floor(Date.now() / 1000);
                    if (payload.exp < now) {
                        return { valid: false, error: 'Token expired (JWT exp claim)' };
                    }
                }
                
                // Check not before if present
                if (payload.nbf && typeof payload.nbf === 'number') {
                    const now = Math.floor(Date.now() / 1000);
                    if (payload.nbf > now) {
                        return { valid: false, error: 'Token not yet valid (JWT nbf claim)' };
                    }
                }
                
                return { valid: true, type: 'JWT', payload };
            } catch (e) {
                return { valid: false, error: 'Failed to parse JWT payload' };
            }
        }
        
        // For opaque tokens, just check basic format
        if (/^[A-Za-z0-9\-_]+$/.test(token)) {
            return { valid: true, type: 'opaque' };
        }
        
        return { valid: false, error: 'Invalid token format' };
    } catch (error) {
        return { valid: false, error: 'Token validation error: ' + error.message };
    }
};

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

CacheManager = {
    _memoryCache: new Map(),
    _persistentCache: null,
    _defaultTTL: 300000,
    _maxItems: 200,
    _pruneInterval: null,
    _stats: {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        prunes: 0
    },
    
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
    
    get: function(key, options = {}) {
        try {
            const cacheKey = this._getCacheKey(key);
            
            if (this._memoryCache.has(cacheKey)) {
                const item = this._memoryCache.get(cacheKey);
                
                if (Date.now() < item.expiresAt) {
                    this._stats.hits++;
                    return { ...item.data, _fromCache: true, _cacheTime: item.timestamp };
                } else {
                    this._memoryCache.delete(cacheKey);
                }
            }
            
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
    
    set: function(key, data, ttl = this._defaultTTL, options = {}) {
        try {
            const cacheKey = this._getCacheKey(key);
            const expiresAt = Date.now() + ttl;
            
            const cacheItem = {
                data,
                expiresAt,
                timestamp: Date.now(),
                version: '24.0.4'
            };
            
            this._memoryCache.set(cacheKey, cacheItem);
            
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
    
    _getCacheKey: function(key) {
        return String(key)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    },
    
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
    
    _startPruneInterval: function() {
        if (this._pruneInterval) {
            clearInterval(this._pruneInterval);
        }
        
        this._pruneInterval = setInterval(() => {
            this._pruneMemoryCache();
        }, 120000);
    },
    
    stop: function() {
        if (this._pruneInterval) {
            clearInterval(this._pruneInterval);
            this._pruneInterval = null;
        }
    },
    
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
// REQUEST QUEUE
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
        apiCoreReady: false,
        parentReady: false,
        sessionReady: false
    },
    
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
                
                const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    
    _canProcessRequest: function(request) {
        if (!this._dependencies.apiCoreReady) {
            return false;
        }
        
        if (request.requiresAuth) {
            if (!this._dependencies.sessionReady && !SESSION_READY) {
                return false;
            }
            
            const token = getUserToken('RequestQueue');
            if (!token) return false;
        }
        
        if (request.dependencies && request.dependencies.length > 0) {
            for (const dep of request.dependencies) {
                if (!this._dependencies[dep]) return false;
            }
        }
        
        return true;
    },
    
    _process: async function() {
        if (this._isProcessing || this._isPaused || this._queue.length === 0) {
            return;
        }
        
        this._isProcessing = true;
        
        while (this._queue.length > 0 && this._currentConcurrent < this._maxConcurrent && !this._isPaused) {
            const requestIndex = this._queue.findIndex(req => this._canProcessRequest(req));
            
            if (requestIndex === -1) {
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
    
    async _executeRequest(request) {
        try {
            const result = await request.fn();
            request.resolve(result);
            this._stats.succeeded++;
            this._stats.processed++;
            
        } catch (error) {
            request.reject(error);
            this._stats.failed++;
            this._stats.processed++;
        }
    },
    
    _generateRequestId: function() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    pause: function() {
        this._isPaused = true;
        return true;
    },
    
    resume: function() {
        this._isPaused = false;
        this._process();
        return true;
    },
    
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
    
    setMaxConcurrent: function(max) {
        if (max > 0 && max <= 10) {
            this._maxConcurrent = max;
            return true;
        }
        return false;
    },
    
    setMaxQueueSize: function(max) {
        if (max > 0) {
            this._maxQueueSize = max;
            return true;
        }
        return false;
    },
    
    updateDependency: function(dependency, status) {
        if (this._dependencies.hasOwnProperty(dependency)) {
            const oldStatus = this._dependencies[dependency];
            this._dependencies[dependency] = status;
            
            if (oldStatus !== status && status === true) {
                this._process();
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

createAbortController = function(requestId) {
    const controller = new AbortController();
    if (requestId) {
        abortControllers.set(requestId, controller);
    }
    return controller;
};

abortRequest = function(requestId) {
    const controller = abortControllers.get(requestId);
    if (controller) {
        controller.abort();
        abortControllers.delete(requestId);
        return true;
    }
    return false;
};

abortAllRequests = function() {
    abortControllers.forEach((controller, requestId) => {
        controller.abort();
        abortControllers.delete(requestId);
    });
    return true;
};

// ============================================================================
// PUBLIC ENDPOINTS
// ============================================================================
const PUBLIC_ENDPOINTS = [
    '/api/status', '/status', '/health', '/api/health',
    '/api/auth/login', '/auth/login',
    '/api/auth/register', '/auth/register',
    '/api/auth/forgot-password', '/auth/forgot-password',
    '/api/auth/reset-password', '/auth/reset-password',
    '/api/auth/forgot', '/auth/forgot-password',
    '/api/auth/reset', '/auth/reset-password',
    '/api/auth/refresh', '/auth/refresh',
    '/api/auth/logout', '/auth/logout',
    '/api/auth/verify', '/auth/verify'
];

const AUTH_ENDPOINTS = [
    '/api/auth/login', '/auth/login',
    '/api/auth/register', '/auth/register',
    '/api/auth/forgot-password', '/auth/forgot-password',
    '/api/auth/reset-password', '/auth/reset-password',
    '/api/auth/forgot', '/auth/forgot-password',
    '/api/auth/reset', '/auth/reset-password',
    '/api/auth/refresh', '/auth/refresh',
    '/api/auth/verify', '/auth/verify'
];

// IMPORTANT: These are NOT public - they require authentication
const PROTECTED_STATUS_PATHS = [
    '/api/status/my', '/status/my',
    '/api/status/friends', '/status/friends',
    '/api/status/stats', '/status/stats',
    '/api/status/user', '/status/user'
];

isPublicEndpoint = function(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return false;
    
    const normalized = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    
    // First, check if this is a protected sub-path
    for (const protectedPath of PROTECTED_STATUS_PATHS) {
        if (normalized === protectedPath || normalized.startsWith(protectedPath + '/')) {
            console.log(`[API] 🔒 Protected endpoint (requires auth): ${normalized}`);
            return false;
        }
    }
    
    // Check public endpoints
    const isPublic = PUBLIC_ENDPOINTS.some(publicEndpoint => 
        normalized === publicEndpoint ||
        normalized.startsWith(publicEndpoint + '/') ||
        normalized.startsWith(publicEndpoint + '?')
    );
    
    if (isPublic) {
        console.log(`[API] 🌐 Public endpoint: ${normalized}`);
    }
    
    return isPublic;
};

isAuthEndpoint = function(endpoint) {
    if (!endpoint || typeof endpoint !== 'string') return false;
    
    const normalized = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    
    return AUTH_ENDPOINTS.some(authEndpoint => 
        normalized === authEndpoint ||
        normalized.startsWith(authEndpoint + '/') ||
        normalized.startsWith(authEndpoint + '?')
    );
};

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
        
        // CRITICAL FIX: Always check localStorage directly
        let token = getUserToken('getAuthHeaders');
        
        // If no token in memory, try localStorage directly
        if (!token) {
            try {
                const stored = localStorage.getItem('kynecta_auth');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    token = parsed.token;
                }
            } catch(e) {}
        }
        
        // Also try other keys
        if (!token) {
            token = localStorage.getItem('token') || 
                    localStorage.getItem('nexopa_token') || 
                    localStorage.getItem('accessToken');
        }
        
        if (token) {
            console.log(`[AUTH] ✅ Attaching token for ${endpoint} (length: ${token.length})`);
            return { 'Authorization': `Bearer ${token}` };
        }
        
        console.warn(`[AUTH] ⚠️ No token available for ${endpoint}`);
        return {};
    } catch (error) {
        console.error('[AUTH] Get auth headers error:', error);
        return {};
    }
};

// ============================================================================
// URL SECURITY VALIDATION
// ============================================================================

function isValidEndpoint(url, baseUrl) {
    try {
        if (url.startsWith('/')) {
            if (url.includes('..') || url.includes('./') || url.includes('.\\') || 
                url.includes('%2e%2e') || url.includes('%2E%2E') ||
                url.includes('..%5c') || url.includes('..%2f')) {
                console.warn('[API-SECURITY] Directory traversal attempt blocked:', url);
                return false;
            }
            return true;
        }
        
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const urlObj = new URL(url);
            
            const allowedDomains = [
                'noxopa.onrender.com',
                'nexipa.onrender.com',
                'localhost',
                '127.0.0.1'
            ];
            
            if (allowedDomains.some(domain => urlObj.hostname === domain || 
                                               urlObj.hostname.endsWith('.' + domain))) {
                return true;
            }
            
            if (urlObj.hostname.endsWith('.onrender.com')) {
                return true;
            }
            
            const baseObj = new URL(baseUrl);
            if (urlObj.origin === baseObj.origin) {
                return true;
            }
            
            const isDev = getEnvironment && (getEnvironment() === 'development' || getEnvironment() === 'local');
            
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
// SAFE JSON PARSER
// ============================================================================

function safeJsonParse(value, fallback = null) {
    if (value !== null && typeof value === 'object') {
        return value;
    }
    
    if (typeof value !== 'string') {
        return fallback;
    }
    
    const trimmed = value.trim();
    
    if (trimmed === '') {
        return fallback;
    }
    
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        if (trimmed.length > 20 && (trimmed.includes('.') || /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(trimmed))) {
            return {
                success: true,
                token: trimmed,
                message: "Login successful",
                _fromPlainText: true
            };
        }
        
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
    
    try {
        return JSON.parse(trimmed);
    } catch (e) {
        return fallback;
    }
}

// ============================================================================
// SINGLE AUTHORITATIVE INITIALIZATION CONTROLLER (SAIC)
// ============================================================================

const SAIC = {
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
    
    initialize() {
        if (this.readyPromise) return;
        
        this.readyPromise = new Promise((resolve, reject) => {
            this.readyResolve = resolve;
            this.readyReject = reject;
        });
    },
    
    transitionTo(newState, error = null) {
        const validTransitions = {
            [this.STATES.UNINITIALIZED]: [this.STATES.INITIALIZING, this.STATES.FAILED],
            [this.STATES.INITIALIZING]: [this.STATES.READY, this.STATES.FAILED],
            [this.STATES.READY]: [],
            [this.STATES.FAILED]: []
        };
        
        if (!validTransitions[this.currentState].includes(newState)) {
            console.error(`[SAIC] Invalid state transition: ${this.currentState} -> ${newState}`);
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
    
    recordStage(stage, success, result = null) {
        this.stageResults[stage] = {
            success,
            result,
            timestamp: new Date().toISOString(),
            duration: Date.now() - this.initializationStartTime
        };
        
        console.log(`[SAIC] Stage ${stage}: ${success ? 'âœ“' : 'âœ—'}`);
    },
    
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
    
    canInitialize() {
        return this.currentState === this.STATES.UNINITIALIZED && !this.initLock;
    },
    
    acquireLock() {
        if (this.initLock) return false;
        this.initLock = true;
        this.initializationStartTime = Date.now();
        return true;
    },
    
    releaseLock() {
        this.initLock = false;
    }
};

SAIC.initialize();

// ============================================================================
// GLOBAL INITIALIZATION AND USER FUNCTIONS
// ============================================================================

(function(global) {
    "use strict";
    
    if (typeof window === 'undefined' && typeof global === 'undefined') {
        return;
    }
    
    const root = global || window;
    
    if (root.__API_CORE_LOADED_V24) {
        const existing = root.__API_CORE;
        
        if (existing && existing.version && existing.version >= '24.0.4') {
            console.log('[API-CORE] Already loaded v' + existing.version + ', skipping initialization');
            
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
        
        console.log('[API-CORE] Upgrading from v' + (existing ? existing.version : 'unknown') + ' to v24.0.4');
    }
    
    root.__API_CORE_LOADED_V24 = '24.0.4';
    
    
    if (!root.__API_CORE) {
        root.__API_CORE = {};
    }
    
    if (root.__API_CORE.__bootstrapped && SAIC.currentState !== SAIC.STATES.UNINITIALIZED) {
        console.log('[API-CORE] Already bootstrapped, skipping');
        return;
    }
    
    root.__API_CORE.__bootstrapped = true;
    
    const requiredProperties = {
        version: '24.0.4',
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
        __resolveReady: function(value) { },
        __rejectReady: function(error) { }
    };
    
    Object.assign(root.__API_CORE, requiredProperties);
    
    if (!root.api) root.api = {};
    if (!root.api.core) {
        root.api.core = {
            __initializing: true,
            __version: '24.0.4'
        };
    }
    
    root.api.core.waitFor = function() {
        return SAIC.readyPromise;
    };
    
    root.api.core.ready = SAIC.readyPromise;
    
    root.api.core.isReady = function() {
        return SAIC.currentState === SAIC.STATES.READY;
    };
    
    root.api.core.whenReady = function(callback) {
        if (typeof callback === 'function') {
            SAIC.readyPromise.then(callback).catch(() => {});
        }
        return SAIC.readyPromise;
    };
    
    root.api.core.getStatus = function() {
        return {
            ready: SAIC.currentState === SAIC.STATES.READY,
            initializing: SAIC.currentState === SAIC.STATES.INITIALIZING,
            failed: SAIC.currentState === SAIC.STATES.FAILED,
            version: root.__API_CORE.version,
            state: SAIC.currentState,
            stages: SAIC.stageResults,
            parentSync: {
                parentReady: PARENT_READY,
                sessionReady: SESSION_READY,
                hasSession: !!PARENT_SESSION,
                sessionUpdateCount: SESSION_UPDATE_COUNT
            },
            dependencies: {
                request: typeof root.api.request !== 'undefined',
                auth: typeof root.api.auth !== 'undefined',
                bootstrap: typeof root.app?.core?.bootstrap !== 'undefined',
                session: typeof root.app?.core?.session !== 'undefined'
            },
            timestamp: new Date().toISOString()
        };
    };
    
    root.api.core.init = function() {
        return SAIC.readyPromise;
    };
    
    root.api.core.diagnostics = {
        startupTime: Date.now(),
        checks: {},
        errors: []
    };
    
    // ============================================================================
    // USER FUNCTIONS
    // ============================================================================

    getCurrentUser = function() {
        try {
            if (root.currentUser) {
                return root.currentUser;
            }
            
            if (PARENT_SESSION && PARENT_SESSION.user) {
                root.currentUser = PARENT_SESSION.user;
                return PARENT_SESSION.user;
            }
            
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
            
            const currentToken = getUserToken();
            if (currentToken) {
                _saveAuthToStorage(currentToken, safeData);
            }
            
            if (window !== window.parent && window.parent && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage({
                    type: 'USER_UPDATE',
                    data: {
                        user: safeData,
                        timestamp: new Date().toISOString()
                    }
                }, '*');
            }
            
            if (!skipLegacy) {
                try {
                    localStorage.setItem('nexopa_auth_user', JSON.stringify(safeData));
                    
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
    
    clearAllAuthData = function(source = 'unknown') {
        try {
            clearUserToken(source);
            
            if (SecureStorage) {
                SecureStorage.removeItem('USER_DATA');
                SecureStorage.removeItem('SESSION_DATA');
            }
            root.currentUser = null;
            
            _clearAuthFromStorage();
            
            if (source !== 'parent.clear') {
                PARENT_SESSION = null;
                SESSION_READY = false;
                NORMALIZED_USER_ID = null;
            }
            
            const legacyKeys = [
                'accessToken', 'nexopa_token', 'token', 'nexopa_auth_token',
                'authToken', 'authUser', 'nexopa_auth_user', 'userData',
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
    
    isSessionValid = function() {
        if (PARENT_SESSION && PARENT_SESSION.token && PARENT_SESSION.authenticated !== false) {
            return true;
        }
        
        const token = getUserToken('isSessionValid');
        const user = getCurrentUser();
        
        if (!token && !_getTokenFromStorage()) {
            return false;
        }
        
        return !!(token && user) && (TokenManager ? !TokenManager.isTokenExpired() : true);
    };
    
    validateSession = async function() {
        return isSessionValid();
    };
    
    getSession = function() {
        if (PARENT_SESSION) {
            return {
                ...PARENT_SESSION,
                token: getUserToken('getSession'),
                user: getCurrentUser(),
                expires: TokenManager ? TokenManager.getTokenExpiry() : null,
                created: TokenManager ? TokenManager.getTokenCreated() : null,
                valid: isSessionValid(),
                _fromParent: true,
                timestamp: new Date().toISOString()
            };
        }
        
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
    
    setSessionData = function(data) {
        try {
            if (data.token) {
                setUserToken(data.token, true, 'setSessionData');
            }
            if (data.user) {
                setUserData(data.user);
            }
            
            if (data._fromParent) {
                _updateSessionFromParent(data);
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
    
    apiGet = async function(endpoint, params = {}) {
        return get(endpoint, params);
    };
    
    apiPost = async function(endpoint, data = {}) {
        return post(endpoint, data);
    };
    
    apiPut = async function(endpoint, data = {}) {
        return put(endpoint, data);
    };
    
    apiDelete = async function(endpoint) {
        return del(endpoint);
    };
    
    apiCallWithRetry = async function(endpoint, options = {}, maxRetries = 3) {
        console.warn('[API] apiCallWithRetry is deprecated - using apiCall instead');
        return secureApiFetch(endpoint, options);
    };
    
    // ============================================================================
    // AUTHENTICATION FUNCTIONS
    // ============================================================================
    
    login = async function(credentials) {
        try {
            const response = await secureApiFetch('/api/auth/login', {
                method: 'POST',
                body: credentials,
                auth: false,
                _isLogin: true
            });
            
            if (response && response.success && response.data) {
                const token = response.data.token || 
                            response.data.accessToken || 
                            response.data.jwt ||
                            (typeof response.data === 'string' && response.data.length > 20 ? response.data : null);
                
                if (token) {
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
                        _saveAuthToStorage(token, user);
                    } else {
                        _saveAuthToStorage(token);
                    }
                    
                    if (window !== window.parent && window.parent && typeof window.parent.postMessage === 'function') {
                        window.parent.postMessage({
                            type: 'SESSION_UPDATE',
                            data: {
                                token: token,
                                user: user,
                                authenticated: true,
                                timestamp: new Date().toISOString()
                            }
                        }, '*');
                    }
                    
                    SESSION_READY = true;
                    RequestQueue.updateDependency('sessionReady', true);
                    
                    root.dispatchEvent(new CustomEvent('user-logged-in', {
                        detail: {
                            user: user || { email: credentials.identifier || credentials.email },
                            timestamp: new Date().toISOString()
                        }
                    }));
                    
                    root.__API_CORE.emit('user-logged-in', { user: user || { email: credentials.identifier || credentials.email } });
                    
                    if (!_loginSuccessLogged) {
                        console.log('[API] âœ… Login successful - token stored from login()');
                        _loginSuccessLogged = true;
                    }
                }
            }
            
            return response;
            
        } catch (error) {
            console.error('[API-LOGIN] Login error:', error);
            return normalizeResponse(error, true);
        }
    };
    
    logout = async function() {
        try {
            const token = getUserToken('logout');
            
            if (token) {
                try {
                    // FIX (logout on one device silently logs out every other
                    // device too): this call never sent refreshToken, so the
                    // backend's `if (refreshToken) { invalidate just this one
                    // }` branch never ran — the ONLY thing that ever actually
                    // revoked anything was its fallback "revoke every refresh
                    // token this user has, on every device" block. That means
                    // every ordinary logout — on any device — force-logged-out
                    // every other device too, even though this backend
                    // otherwise fully supports independent multi-device
                    // sessions (see GET /auth/sessions). Sending the current
                    // device's own refresh token lets the backend revoke only
                    // this session, as intended.
                    let _refreshToken = null;
                    try { _refreshToken = TokenManager.getRefreshToken(); } catch (_) {}
                    await secureApiFetch('/api/auth/logout', {
                        method: 'POST',
                        auth: true,
                        body: _refreshToken ? JSON.stringify({ refreshToken: _refreshToken }) : undefined
                    });
                } catch (e) {
                    // Ignore logout errors
                }
            }
        } catch (e) {}
        
        clearAllAuthData('logout');
        
        RequestQueue.updateDependency('tokenReady', false);
        RequestQueue.updateDependency('sessionReady', false);
        
        PARENT_SESSION = null;
        SESSION_READY = false;
        NORMALIZED_USER_ID = null;
        
        root.dispatchEvent(new CustomEvent('user-logged-out', {
            detail: { timestamp: new Date().toISOString() }
        }));
        
        root.__API_CORE.emit('user-logged-out', {});
        
        console.log('[API] ðŸ‘‹ User logged out');
        
        return { success: true, message: 'Logged out successfully' };
    };
    
    register = async function(userData) {
        return secureApiFetch('/api/auth/register', {
            method: 'POST',
            body: userData,
            auth: false
        });
    };
    
    forgotPassword = async function(email) {
        // FIX: path unified to /auth/forgot-password to match backend router
        return secureApiFetch('/auth/forgot-password', {
            method: 'POST',
            body: { email },
            auth: false
        });
    };

    resetPassword = async function(token, newPassword) {
        // FIX: path unified to /auth/reset-password to match backend router
        return secureApiFetch('/auth/reset-password', {
            method: 'POST',
            body: { token, newPassword },
            auth: false
        });
    };
    
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
    
    updateGlobalAccessToken = function() {
        const token = getUserToken('updateGlobalAccessToken');
        root.__GLOBAL_TOKEN = token;
        return token;
    };
    
    handleUnauthorizedAccess = (function() {
        let timeoutId = null;
        let lastTriggerTime = 0;
        const THROTTLE_MS = 2000;
        
        return function(options = {}) {
            const now = Date.now();
            
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
            
            const storedToken = _getTokenFromStorage();
            
            if (!storedToken) {
                clearUserToken('handleUnauthorizedAccess');
                
                PARENT_SESSION = null;
                SESSION_READY = false;
                
                root.dispatchEvent(new CustomEvent('auth:unauthorized-handled', {
                    detail: {
                        timestamp: new Date().toISOString(),
                        source: options.source || 'api',
                        hadStoredToken: !!storedToken
                    }
                }));
                
                localStorage.setItem('_auth_clearing_in_progress', 'true');
                
                RequestQueue.updateDependency('tokenReady', false);
                RequestQueue.updateDependency('sessionReady', false);
                
                if (!root.location.pathname.includes('/login') && 
                    !root.location.pathname.includes('index.html') &&
                    !root.location.pathname.includes('/register') &&
                    !root.location.pathname.includes('/forgot-password')) {
                    
                    timeoutId = setTimeout(() => {
                        const stillHasToken = getUserToken('redirect.check');
                        if (!stillHasToken && !_getTokenFromStorage()) {
                            root.location.href = '/login?reason=session_expired';
                        }
                        localStorage.removeItem('_auth_clearing_in_progress');
                        timeoutId = null;
                    }, 500);
                } else {
                    setTimeout(() => {
                        localStorage.removeItem('_auth_clearing_in_progress');
                    }, 1000);
                }
            } else {
                console.log('[API] Attempting to restore token from storage after 401');
                setUserToken(storedToken, false, '401.restore');
                SESSION_READY = true;
            }
        };
    })();
    
    initializeTokenSystem = function() {
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
        
        if (token && !PARENT_SESSION) {
            SESSION_READY = true;
            RequestQueue.updateDependency('sessionReady', true);
        }
        
        return { token, user };
    };
    
    // ============================================================================
    // OPEN CHAT FUNCTIONS
    // ============================================================================
    
    openChat = function(userId, chatId = null, options = {}) {
        try {
            if (!userId && !chatId && !(options && options.groupId)) {
                throw new KnectaError(
                    'Either userId, chatId, or groupId must be provided',
                    400,
                    'INVALID_CHAT_PARAMETERS'
                );
            }
            
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
    // API FUNCTIONS - ALL PRESERVED
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
        return get('/api/groups/user');
    };
    
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
                success: 'âœ“',
                warning: 'âš ',
                error: 'âœ•',
                info: 'â„¹'
            };
            
            notification.innerHTML = `
                <span style="font-size: 16px; font-weight: bold;">${iconMap[type] || 'â€¢'}</span>
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
                " onclick="this.parentElement.remove()">Ã—</button>
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
        return post(`/api/groups/invites/${inviteId}/accept`, {});
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
    // SOCIAL FUNCTIONS
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
    // MESSAGING FUNCTIONS
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
    // GROUP FUNCTIONS
    // ============================================================================
    
    createGroup = async function(groupData) {
        return post('/api/groups', groupData);
    };
    
    getGroups = async function() {
        return get('/api/groups');
    };
    
    getGroupDetails = async function(groupId) {
        return get(`/api/groups/${groupId}`);
    };
    
    updateGroup = async function(groupId, groupData) {
        return put(`/api/groups/${groupId}`, groupData);
    };
    
    deleteGroup = async function(groupId) {
        return del(`/api/groups/${groupId}`);
    };
    
    addGroupMember = async function(groupId, userId) {
        return post(`/api/groups/${groupId}/members`, { userId });
    };
    
    removeGroupMember = async function(groupId, userId) {
        return del(`/api/groups/${groupId}/members/${userId}`);
    };
    
    leaveGroup = async function(groupId) {
        return post(`/api/groups/${groupId}/leave`, {});
    };
    
    // ============================================================================
    // NOTIFICATION FUNCTIONS
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
    // PROFILE FUNCTIONS
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
    
    deleteAccount = async function(confirmation, password) {
        // P1 AUDIT FIX: password mandatory, correct endpoint
        return del('/api/settings/account', { confirmation, password });
    };
    
    // ============================================================================
    // USER FUNCTIONS
    // ============================================================================
    
    getOnlineUsers = async function() {
        return get('/api/users/online');
    };
    
    searchUsers = async function(query) {
        return get(`/api/users/search?q=${encodeURIComponent(query)}`);
    };
    
    // ============================================================================
    // CALL FUNCTIONS
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
    // SETTINGS FUNCTIONS
    // ============================================================================
    
    getSettings = async function() {
        return get('/api/settings');
    };
    
    updateSettings = async function(settings) {
        return put('/api/settings', settings);
    };
    
    // ============================================================================
    // FILE FUNCTIONS
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
    // ANALYTICS FUNCTIONS
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
    // UTILITY FUNCTIONS
    // ============================================================================
  
    // In api.core.js, find checkNetworkStatus function and fix the URL
checkNetworkStatus = async function() {
    try {
        const baseUrl = getBaseUrl();
        // Remove any trailing /api if it exists to avoid double /api
        const cleanBaseUrl = baseUrl.replace(/\/api$/, '');
        const response = await fetch(`${cleanBaseUrl}/api/status`, {
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
    
    generateId = function() {
        return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 4)}`;
    };
    
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
    // EVENT EMITTER
    // ============================================================================
    
    const eventEmitter = {
        events: {},
        
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
        
        listeners(event) {
            return this.events[event]?.length || 0;
        }
    };
    
    emit = eventEmitter.emit.bind(eventEmitter);
    on = eventEmitter.on.bind(eventEmitter);
    off = eventEmitter.off.bind(eventEmitter);
    once = eventEmitter.once.bind(eventEmitter);
    
    // ============================================================================
    // MULTI-IFRAME ORCHESTRATION
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
    
    waitForReady = function() {
        return SAIC.readyPromise;
    };
    
    isCoreReadyFn = function() {
        return SAIC.currentState === SAIC.STATES.READY;
    };
    
    getRequestQueueStatus = function() {
        return {
            queueLength: ORCHESTRATION_STATE.requestQueue.length,
            isProcessing: ORCHESTRATION_STATE.isQueueProcessing,
            activeRequests: ORCHESTRATION_STATE.activeRequests.size,
            coreReady: SAIC.currentState === SAIC.STATES.READY,
            iframesConnected: ORCHESTRATION_STATE.iframes.size,
            gatedRequests: GATED_REQUESTS_QUEUE.length,
            parentReady: PARENT_READY,
            sessionReady: SESSION_READY
        };
    };
    
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
    
    unregisterIframe = function(iframeId) {
        return ORCHESTRATION_STATE.iframes.delete(iframeId);
    };
    
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
    // API GATEWAY
    // ============================================================================
    
    ApiGateway = {
        version: '24.0.4',
        build: '2026-03-26',
        
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
            isReady: isCoreReadyFn,
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
        
        setUserToken: setUserToken,
        getUserToken: getUserToken,
        clearToken: clearUserToken,
        
        setToken: setUserToken,
        getToken: getUserToken,
        
        parentSync: {
            getSession: () => PARENT_SESSION,
            isReady: () => SESSION_READY,
            isParentReady: () => PARENT_READY,
            getUpdateCount: () => SESSION_UPDATE_COUNT,
            getNormalizedUserId: () => NORMALIZED_USER_ID,
            registerHandler: _registerParentMessageHandler
        },
        
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
                parentSync: {
                    parentReady: PARENT_READY,
                    sessionReady: SESSION_READY,
                    hasSession: !!PARENT_SESSION,
                    sessionUpdateCount: SESSION_UPDATE_COUNT,
                    normalizedUserId: NORMALIZED_USER_ID
                },
                cache: {
                    size: CacheManager ? CacheManager._memoryCache.size : 0,
                    stats: CacheManager ? CacheManager.getStats() : {}
                },
                queue: RequestQueue ? RequestQueue.getStatus() : {},
                gatedRequests: GATED_REQUESTS_QUEUE.length,
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
    // INITIALIZE GATEWAY
    // ============================================================================
    
    initializeGateway = async function(options = {}) {
        if (!SAIC.canInitialize()) {
            console.log('[API-CORE] Initialization already in progress or completed, returning existing promise');
            return SAIC.readyPromise;
        }
        
        SAIC.acquireLock();
        SAIC.transitionTo(SAIC.STATES.INITIALIZING);
        
        console.log('[API-CORE] Initializing API Gateway v24.0.4');
        
        try {
            SAIC.recordStage('environment', true);
            
            if (options.environment) {
                setEnvironment(options.environment);
            } else {
                CURRENT_ENVIRONMENT = detectEnvironment();
            }
            
            RequestQueue.updateDependency('environment', true);
            SAIC.recordStage('environment', true, { environment: CURRENT_ENVIRONMENT });
            
            SAIC.recordStage('baseUrl', true);
            
            if (options.baseUrl) {
                setBaseUrl(options.baseUrl);
            } else {
                ACTIVE_BASE_URL = getBaseUrl();
            }
            
            RequestQueue.updateDependency('config', true);
            SAIC.recordStage('baseUrl', true, { baseUrl: ACTIVE_BASE_URL });
            
            SAIC.recordStage('storage', true);
            SAIC.recordStage('storage', true);
            
            SAIC.recordStage('origin', true);
            
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
            
            SAIC.recordStage('token', true);
            
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
            
            SAIC.recordStage('parentSync', true);
            
            _initParentMessageListeners();
            
            RequestQueue.updateDependency('parentReady', PARENT_READY);
            RequestQueue.updateDependency('sessionReady', SESSION_READY);
            
            SAIC.recordStage('parentSync', true, {
                parentReady: PARENT_READY,
                isIframe: window !== window.parent,
                hasParent: !!(window.parent && window.parent !== window)
            });
            
            SAIC.recordStage('dependencies', true);
            
            RequestQueue.updateDependency('bootstrap', true);
            
            SAIC.recordStage('dependencies', true, {
                environment: true,
                config: true,
                tokenReady: !!getUserToken('init.stage7'),
                parentReady: PARENT_READY
            });
            
            SAIC.recordStage('security', true);
            SAIC.recordStage('security', true, { 
                endpointValidation: typeof isValidEndpoint === 'function',
                publicEndpoints: PUBLIC_ENDPOINTS.length
            });
            
            SAIC.recordStage('endpoint', true);
            SAIC.recordStage('endpoint', true, {
                publicEndpoints: PUBLIC_ENDPOINTS.length,
                authEndpoints: AUTH_ENDPOINTS.length
            });
            
            SAIC.recordStage('selftest', true);
            
            try {
                const testResults = await runSelfTests();
                SAIC.recordStage('selftest', true, testResults);
            } catch (testError) {
                SAIC.recordStage('selftest', false, { error: testError.message });
            }
            
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
            
            if (CacheManager && CacheManager._pruneMemoryCache) {
                CacheManager._pruneMemoryCache();
            }
            
            if (updateGlobalAccessToken) {
                updateGlobalAccessToken();
            }
            
            RequestQueue.updateDependency('apiCoreReady', true);
            
            const configReady = !!ACTIVE_BASE_URL;
            const apiConfigValid = true;
            const isInIframe = window !== window.parent;
            const parentDepsMet = !isInIframe || PARENT_READY || SESSION_READY;
            
            if (configReady && apiConfigValid && parentDepsMet) {
                SAIC.transitionTo(SAIC.STATES.READY);
                isCoreReady = true;
                
                const readyEvent = new CustomEvent('api-gateway-ready', {
                    detail: {
                        version: '24.0.4',
                        environment: CURRENT_ENVIRONMENT,
                        baseUrl: ACTIVE_BASE_URL,
                        timestamp: new Date().toISOString(),
                        stages: SAIC.stageResults,
                        parentSync: {
                            parentReady: PARENT_READY,
                            sessionReady: SESSION_READY,
                            hasSession: !!PARENT_SESSION
                        },
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
                            'selective-session-clear',
                            'parent-session-sync',
                            'request-gating',
                            'session-normalization',
                            'guaranteed-request-resolution',
                            'timeout-protection',
                            'response-normalization',
                            'proper-base-url-detection',
                            'enhanced-environment-detection',
                            'token-priority-system',
                            'max-retry-limit-1',
                            'cookie-auth-production',
                            'token-refresh-on-401',
                            'race-condition-fixed',
                            'api-ready-waiting'
                        ]
                    }
                });
                
                root.dispatchEvent(readyEvent);
                
                console.log('[API-CORE] âœ… Initialized successfully', {
                    environment: CURRENT_ENVIRONMENT,
                    baseUrl: ACTIVE_BASE_URL,
                    version: '24.0.4',
                    state: SAIC.currentState,
                    duration: Date.now() - SAIC.initializationStartTime,
                    hasToken: !!getUserToken('init.success'),
                    parentReady: PARENT_READY,
                    sessionReady: SESSION_READY,
                    isIframe: window !== window.parent
                });
            } else {
                console.warn('[API-CORE] âš ï¸ Initialization incomplete - waiting for dependencies', {
                    configReady,
                    parentDepsMet,
                    isIframe: window !== window.parent,
                    parentReady: PARENT_READY,
                    sessionReady: SESSION_READY
                });
            }
            
            return {
                success: SAIC.currentState === SAIC.STATES.READY,
                environment: CURRENT_ENVIRONMENT,
                baseUrl: ACTIVE_BASE_URL,
                version: '24.0.4',
                state: SAIC.currentState,
                stages: SAIC.stageResults,
                parentSync: {
                    parentReady: PARENT_READY,
                    sessionReady: SESSION_READY,
                    hasSession: !!PARENT_SESSION
                },
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('[API-CORE] âŒ Initialization error:', error);
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
    
    async function runSelfTests() {
        const results = {
            passed: 0,
            failed: 0,
            tests: []
        };
        
        if (!root.api || !root.api.core) {
            results.tests.push({ name: 'api.core exists', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'api.core exists', passed: true });
            results.passed++;
        }
        
        if (typeof root.api.core.waitFor !== 'function') {
            results.tests.push({ name: 'waitFor function', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'waitFor function', passed: true });
            results.passed++;
        }
        
        const isPromise = root.api.core.ready instanceof Promise || 
                         (root.api.core.ready && typeof root.api.core.ready.then === 'function');
        
        if (!isPromise) {
            results.tests.push({ name: 'ready is Promise', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'ready is Promise', passed: true });
            results.passed++;
        }
        
        if (typeof root.api.core.whenReady !== 'function') {
            results.tests.push({ name: 'whenReady function', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'whenReady function', passed: true });
            results.passed++;
        }
        
        if (typeof root.api.core.isReady !== 'function') {
            results.tests.push({ name: 'isReady function', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: 'isReady function', passed: true });
            results.passed++;
        }
        
        if (!root.__API_CORE) {
            results.tests.push({ name: '__API_CORE exists', passed: false });
            results.failed++;
        } else {
            results.tests.push({ name: '__API_CORE exists', passed: true });
            results.passed++;
        }
        
        const testUrls = [
            ['/api/users/me', true],
            ['/api/users/../config', false],
            ['/api/users/%2e%2e/config', false],
            ['https://evil.com/api/steal', false],
            ['https://noxopa.onrender.com/api/users', true],
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
        const testToken = '';
const testUser = { id: 'test', name: 'Test User' };

// Enable self-test mode to prevent actual storage clearing
window._selfTestMode = true;

try {
    _saveAuthToStorage(testToken, testUser);
    
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
    
    _clearAuthFromStorage();
} catch (e) {
    results.tests.push({ name: 'token persistence', passed: false, details: e.message });
    results.failed++;
} finally {
    // Always disable self-test mode
    window._selfTestMode = false;
}
        results.tests.push({ 
            name: 'parent sync initialization', 
            passed: typeof _initParentMessageListeners === 'function',
            details: 'Parent message handlers initialized'
        });
        results.passed++;
        
        // Test environment detection
        const detectedEnv = detectEnvironment();
        results.tests.push({
            name: 'environment detection',
            passed: detectedEnv === ENVIRONMENTS.LOCAL || detectedEnv === ENVIRONMENTS.PRODUCTION,
            details: `Detected: ${detectedEnv}`
        });
        results.passed++;
        
        return results;
    }
    
    // ============================================================================
    // API CORE INTERFACE
    // ============================================================================
    
    apiCore = {
        ...ApiGateway,
        
        // Bug 4 fix: expose BACKEND_BASE_URL so api.request.js can read it
        // (api.request.js line 2288: _BACKEND_BASE_URL = apiCore.BACKEND_BASE_URL)
        get BACKEND_BASE_URL() {
            return getBaseUrl ? getBaseUrl() : ACTIVE_BASE_URL;
        },
        get BASE_API_URL() {
            return getBaseUrl ? getBaseUrl() : ACTIVE_BASE_URL;
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
            }
        },
        
        getQueueStatus: getRequestQueueStatus,
        waitForReady: waitForReady,
        isReady: isCoreReadyFn,
        
        get: get,
        post: post,
        put: put,
        patch: patch,
        delete: del,
        del: del
    };
    
    root.API = {
        get: get,
        post: post,
        put: put,
        delete: del,
        setUserToken: setUserToken,
        getUserToken: getUserToken,
        clearToken: clearUserToken,
        version: '24.0.4'
    };
    
    root.API_READY = SAIC.currentState === SAIC.STATES.READY;
    
    // Ensure gateway is ready before any requests are processed
    initializeGateway().then(() => {
    }, 60000);
    
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
    
    Object.assign(root.__API_CORE, {
        version: '24.0.4',
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
        getState: SAIC.getState,
        parentSync: {
            parentReady: PARENT_READY,
            sessionReady: SESSION_READY,
            hasSession: !!PARENT_SESSION,
            updateCount: SESSION_UPDATE_COUNT
        }
    });
    
    root.apiCore = root.apiCore || root.__API_CORE;
    root.api_core = root.api_core || root.__API_CORE;
    
    root.__API_GATEWAY = {
        version: '24.0.4',
        build: '2026-03-26',
        environment: CURRENT_ENVIRONMENT,
        baseUrl: ACTIVE_BASE_URL,
        initialized: SAIC.currentState === SAIC.STATES.READY,
        state: SAIC.currentState,
        stages: SAIC.stageResults,
        parentSync: {
            parentReady: PARENT_READY,
            sessionReady: SESSION_READY,
            hasSession: !!PARENT_SESSION,
            updateCount: SESSION_UPDATE_COUNT
        },
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
            'selective-session-clear',
            'parent-session-sync',
            'request-gating',
            'session-normalization',
            'guaranteed-request-resolution',
            'timeout-protection',
            'response-normalization',
            'proper-base-url-detection',
            'enhanced-environment-detection',
            'token-priority-system',
            'max-retry-limit-1',
            'cookie-auth-production',
            'token-refresh-on-401',
            'race-condition-fixed',
            'api-ready-waiting'
        ]
    };
    
    if (!root.api) root.api = {};
    
    const coreReadyPromise = SAIC.readyPromise;
    
    if (!root.api.core) {
        root.api.core = {
            __initializing: SAIC.currentState === SAIC.STATES.INITIALIZING,
            __version: '24.0.4',
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
                    version: '24.0.4',
                    parentSync: {
                        parentReady: PARENT_READY,
                        sessionReady: SESSION_READY
                    }
                };
            },
            init: function() {
                return coreReadyPromise;
            }
        };
    } else {
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
                version: '24.0.4',
                parentSync: {
                    parentReady: PARENT_READY,
                    sessionReady: SESSION_READY
                }
            };
        };
        root.api.core.init = root.api.core.init || function() { return coreReadyPromise; };
    }
    
    root.api.core.__initialized = SAIC.currentState === SAIC.STATES.READY;
    root.api.core.__initializing = SAIC.currentState === SAIC.STATES.INITIALIZING;
    root.api.core.__ready = SAIC.currentState === SAIC.STATES.READY;
    
    if (SAIC.currentState === SAIC.STATES.READY) {
        try {
            root.dispatchEvent(new CustomEvent('api-core-ready', {
                detail: {
                    version: '24.0.4',
                    environment: CURRENT_ENVIRONMENT,
                    baseUrl: ACTIVE_BASE_URL,
                    timestamp: new Date().toISOString(),
                    parentSync: {
                        parentReady: PARENT_READY,
                        sessionReady: SESSION_READY
                    },
                    features: root.__API_GATEWAY.features
                }
            }));
        } catch (e) {
            console.warn('[API-CORE] Failed to dispatch api-core-ready event:', e);
        }
        
        if (root.__API_CORE && typeof root.__API_CORE.emit === 'function') {
            try {
                root.__API_CORE.emit('ready', {
                    version: '24.0.4',
                    environment: CURRENT_ENVIRONMENT,
                    timestamp: new Date().toISOString(),
                    parentSync: {
                        parentReady: PARENT_READY,
                        sessionReady: SESSION_READY
                    }
                });
            } catch (e) {
                console.warn('[API-CORE] Failed to emit ready event:', e);
            }
        }
    }
    
    console.log('[API-CORE] âœ… Fully loaded', {
        environment: CURRENT_ENVIRONMENT,
        baseUrl: ACTIVE_BASE_URL,
        version: '24.0.4',
        state: SAIC.currentState,
        stages: Object.keys(SAIC.stageResults).length,
        parentSync: {
            parentReady: PARENT_READY,
            sessionReady: SESSION_READY,
            isIframe: window !== window.parent
        },
        features: root.__API_GATEWAY.features.length,
        hasToken: !!getUserToken('final')
    });
    // Expose API globally for debugging and modules
window.__API_CORE = root.__API_CORE;
window.__API_GATEWAY = root.__API_GATEWAY;
window.api = ApiGateway;
window.apiCore = apiCore;
window.gateway = ApiGateway;

// Also expose to window for console access
if (typeof window !== 'undefined') {
    window.__API = {
        get: get,
        post: post,
        put: put,
        delete: del,
        getUserToken: getUserToken,
        setUserToken: setUserToken,
        clearToken: clearUserToken,
        getBaseUrl: getBaseUrl,
        setBaseUrl: setBaseUrl,
        getEnvironment: getEnvironment,
        isAuthenticated: isAuthenticated,
        getSession: getSession,
        refreshToken: refreshTokenIfNeeded
    };
}
    
})(typeof window !== 'undefined' ? window : global);

// ============================================================================
// ES6 EXPORTS
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
    isCoreReadyFn as isCoreReady,
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

// ============================================================================
// GLOBAL TOKEN MANAGEMENT FUNCTIONS
// ============================================================================

// Make token management functions globally available for cross-module access
if (typeof window !== 'undefined') {
    window.refreshTokenIfNeeded = refreshTokenIfNeeded;
    window.validateToken = validateToken;
    window.clearUserToken = clearUserToken;
    window.TokenManager = TokenManager;
}

// ============================================================================
// AUTH EVENT HANDLERS
// ============================================================================

// Token expiry check interval
setInterval(() => {
    if (TokenManager && TokenManager.shouldRefreshToken && TokenManager.shouldRefreshToken()) {
        refreshTokenIfNeeded().catch(() => {});
    }
}, 120000);

// Global auth event handlers for token expiration and reauthentication
if (typeof window !== 'undefined') {
    // Handle auth:expired events
    window.addEventListener('auth:expired', async (event) => {
        const { reason, endpoint, requestId } = event.detail;
        console.error(`[AUTH] Session expired: ${reason} for endpoint: ${endpoint}`);
        
        // Clear all auth data
        clearUserToken('auth.expired');
        
        // Clear service worker cache to prevent serving stale token responses
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            try {
                navigator.serviceWorker.controller.postMessage({
                    type: 'CLEAR_TOKEN_CACHE',
                    timestamp: Date.now()
                });
                console.log('[AUTH] Sent token cache clear request to service worker');
            } catch (err) {
                console.warn('[AUTH] Failed to clear service worker token cache:', err);
            }
        }
        
        // Force refresh critical auth files
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            try {
                navigator.serviceWorker.controller.postMessage({
                    type: 'FORCE_REFRESH',
                    timestamp: Date.now()
                });
                console.log('[AUTH] Sent force refresh request to service worker');
            } catch (err) {
                console.warn('[AUTH] Failed to force refresh service worker cache:', err);
            }
        }
        
        // Dispatch auth state change
        window.dispatchEvent(new CustomEvent('auth:stateChanged', {
            detail: {
                authenticated: false,
                reason: 'expired',
                timestamp: Date.now()
            }
        }));
        
        // Redirect to login if not suppressed
        if (handleUnauthorizedAccess) {
            handleUnauthorizedAccess();
        }
    });
    
    // Handle auth:unauthorized events
    window.addEventListener('auth:unauthorized', (event) => {
        const { endpoint, requestId } = event.detail;
        console.warn(`[AUTH] Unauthorized access to: ${endpoint}`);
        
        // Update auth state
        window.dispatchEvent(new CustomEvent('auth:stateChanged', {
            detail: {
                authenticated: false,
                reason: 'unauthorized',
                timestamp: Date.now()
            }
        }));
    });
    
    // Handle successful token refresh
    window.addEventListener('token:refreshed', (event) => {
        const { token, expiresIn } = event.detail;
        console.log('[AUTH] Token refreshed successfully');
        
        // Update auth state
        window.dispatchEvent(new CustomEvent('auth:stateChanged', {
            detail: {
                authenticated: true,
                reason: 'refreshed',
                timestamp: Date.now(),
                expiresIn
            }
        }));
    });
    
    // Handle service worker token cache cleared confirmation
    window.addEventListener('TOKEN_CACHE_CLEARED', (event) => {
        console.log('[AUTH] Service worker token cache cleared');
    });
    
    // Handle service worker force refresh completion
    window.addEventListener('FORCE_REFRESH_COMPLETE', (event) => {
        console.log('[AUTH] Service worker force refresh completed');
    });
}
