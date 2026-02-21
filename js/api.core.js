// api.core.js - ENHANCED API GATEWAY WITH SECURITY & CROSS-ENVIRONMENT SUPPORT
// Version: 23.0.0 - Production-ready with HTTPS enforcement, auto-detection, and fallback mechanisms
// Date: 2024-06-15

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

// Token security
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
// URL SECURITY VALIDATION - PREVENT UNSAFE ENDPOINT ACCESS
// ============================================================================
function isValidEndpoint(url, baseUrl) {
    try {
        // If it's a relative URL, it's safe
        if (url.startsWith('/')) {
            // Check for directory traversal attempts
            if (url.includes('..') || url.includes('./') || url.includes('.\\')) {
                console.warn('[API-SECURITY] Directory traversal attempt blocked:', url);
                return false;
            }
            return true;
        }
        
        // If it's an absolute URL, ensure it's within our base domain
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const urlObj = new URL(url);
            const baseObj = new URL(baseUrl);
            
            // Check if it's the same origin
            if (urlObj.origin === baseObj.origin) {
                return true;
            }
            
            // Check if it's a subdomain of our base domain
            if (urlObj.hostname.endsWith(baseObj.hostname) && baseObj.hostname !== urlObj.hostname) {
                return true;
            }
            
            // Check if it's localhost in development
            if (isDevelopment() && (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1')) {
                return true;
            }
            
            console.warn('[API-SECURITY] Cross-origin request blocked:', url);
            return false;
        }
        
        // Invalid URL format
        console.warn('[API-SECURITY] Invalid URL format blocked:', url);
        return false;
    } catch (error) {
        console.warn('[API-SECURITY] URL validation error:', error.message);
        return false;
    }
}

// ============================================================================
// ENVIRONMENT DETECTION - ENHANCED FOR MULTIPLE ENVIRONMENTS
// ============================================================================
(function(global) {
    "use strict";
    
    // In case of worker or non-browser environment
    if (typeof window === 'undefined' && typeof global === 'undefined') {
        return;
    }
    
    const root = global || window;
    
    // ============================================================================
    // CRITICAL: DUPLICATE LOADING PREVENTION - ENHANCED
    // ============================================================================
    if (root.__API_CORE_LOADED_V23) {
        console.log('[API-CORE] Already loaded v23, skipping initialization');
        
        // Ensure core object exists with all required properties
        if (!root.__API_CORE) {
            root.__API_CORE = {};
        }
        
        // Ensure all required properties exist
        const requiredProps = {
            version: '23.0.0',
            initialized: true,
            ready: Promise.resolve(true),
            secureApiFetch: root.__API_CORE.secureApiFetch || function() { return Promise.resolve({}); },
            getUserToken: root.__API_CORE.getUserToken || function() { return null; },
            setUserToken: root.__API_CORE.setUserToken || function() { return false; },
            clearUserToken: root.__API_CORE.clearUserToken || function() { return false; },
            _apiCache: root.__API_CORE._apiCache || new Map(),
            _apiRequestQueue: root.__API_CORE._apiRequestQueue || [],
            _events: root.__API_CORE._events || {},
            on: root.__API_CORE.on || function() {},
            emit: root.__API_CORE.emit || function() {},
            __bootstrapped: true
        };
        
        Object.assign(root.__API_CORE, requiredProps);
        
        // Ensure legacy bridges
        root.apiCore = root.apiCore || root.__API_CORE;
        root.api_core = root.api_core || root.__API_CORE;
        root.api = root.api || root.__API_CORE;
        
        // Ensure waitFor exists
        if (root.api && root.api.core && typeof root.api.core.waitFor !== 'function') {
            root.api.core.waitFor = function() { return root.__API_CORE.ready; };
        }
        
        return;
    }
    root.__API_CORE_LOADED_V23 = true;
    
    // ============================================================================
    // GLOBAL REGISTRATION - MUST EXIST IMMEDIATELY
    // ============================================================================
    if (!root.__API_CORE) {
        root.__API_CORE = {};
    }
    
    // Prevent multiple bootstrapping
    if (root.__API_CORE.__bootstrapped) {
        console.log('[API-CORE] Already bootstrapped, skipping');
        return;
    }
    root.__API_CORE.__bootstrapped = true;
    
    // ============================================================================
    // READY PROMISE SYSTEM - CREATE BEFORE ANYTHING ELSE
    // ============================================================================
    let _resolveReady = null;
    let _rejectReady = null;
    
    const _readyPromise = new Promise((resolve, reject) => {
        _resolveReady = resolve;
        _rejectReady = reject;
    });
    
    // Set up timeout protection - never hang forever
    const _readyTimeout = setTimeout(() => {
        if (!root.__API_CORE.initialized) {
            console.warn('[API-CORE] TIMEOUT Forcing ready state after 10s');
            if (_resolveReady) {
                root.__API_CORE.initialized = true;
                _resolveReady({ forced: true, reason: 'timeout' });
            }
        }
    }, 10000);
    
    // ============================================================================
    // REQUIRED EXPOSED PROPERTIES - MUST ALL EXIST
    // ============================================================================
    const requiredProperties = {
        version: '23.0.0',
        initialized: false,
        ready: _readyPromise,
        secureApiFetch: null,
        getUserToken: null,
        setUserToken: null,
        clearUserToken: null,
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
        __resolveReady: _resolveReady,
        __rejectReady: _rejectReady
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
            __version: '23.0.0'
        };
    }
    
    // Ensure window.api.core.waitFor exists IMMEDIATELY
    root.api.core.waitFor = function() {
        return root.__API_CORE.ready;
    };
    
    // Ensure window.api.core.ready exists IMMEDIATELY
    root.api.core.ready = root.__API_CORE.ready;
    
    // Ensure window.api.core.isReady exists
    root.api.core.isReady = function() {
        return root.__API_CORE.initialized === true;
    };
    
    // Ensure window.api.core.whenReady exists (legacy callback support)
    root.api.core.whenReady = function(callback) {
        if (typeof callback === 'function') {
            root.__API_CORE.ready.then(callback).catch(() => {});
        }
        return root.__API_CORE.ready;
    };
    
    // Ensure window.api.core.getStatus exists
    root.api.core.getStatus = function() {
        return {
            ready: root.__API_CORE.initialized === true,
            initializing: false,
            version: root.__API_CORE.version,
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
        return root.__API_CORE.ready;
    };
    
    // Ensure window.api.core.diagnostics exists
    root.api.core.diagnostics = {
        startupTime: Date.now(),
        checks: {},
        errors: []
    };
    
    // ============================================================================
    // SECTION 1: ENVIRONMENT CONFIGURATION - ENHANCED AUTO-DETECTION
    // ============================================================================
    
    // Assign values to module-level variables (not redeclare them)
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
            const hostname = root.location.hostname;
            const port = root.location.port;
            const href = root.location.href;
            const protocol = root.location.protocol;
            
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
                root.dispatchEvent(new CustomEvent('environment-changed', {
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
            root.dispatchEvent(new CustomEvent('environment-changed', {
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
            const hostname = root.location.hostname;
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
            const hostname = root.location.hostname;
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
                const hostname = root.location.hostname;
                const protocol = root.location.protocol;
                
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
            
            root.dispatchEvent(new CustomEvent('base-url-changed', {
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
                const hostname = root.location.hostname;
                const protocol = root.location.protocol;
                
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
     * Format error message for display
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
        
        return normalized.message || 'An unexpected error occurred.';
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
        _version: '23.0.0',
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
                
                // Dispatch storage event for cross-tab synchronization
                root.dispatchEvent(new StorageEvent('storage', {
                    key: storageKey,
                    newValue: storageValue,
                    oldValue: null,
                    storageArea: localStorage,
                    url: root.location.href
                }));
                
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
     * TokenManager - Complete centralized token management with enhanced security
     */
    TokenManager = {
        TOKEN_KEY: 'USER_TOKEN',
        REFRESH_TOKEN_KEY: 'REFRESH_TOKEN',
        TOKEN_EXPIRY_KEY: 'TOKEN_EXPIRY',
        TOKEN_CREATED_KEY: 'TOKEN_CREATED',
        TOKEN_TYPE_KEY: 'TOKEN_TYPE',
        DEFAULT_EXPIRY: 3600,
        REFRESH_THRESHOLD: 300,
        
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
                
                const sanitizedToken = this._sanitizeToken(token);
                
                // SECURITY: Validate token format
                if (!this._validateTokenFormat(sanitizedToken)) {
                    console.warn('[TOKEN-MANAGER] Token format validation warning - continuing anyway');
                }
                
                SecureStorage.setItem(this.TOKEN_KEY, sanitizedToken, true);
                
                if (refreshToken) {
                    const sanitizedRefreshToken = this._sanitizeToken(refreshToken);
                    SecureStorage.setItem(this.REFRESH_TOKEN_KEY, sanitizedRefreshToken, true);
                }
                
                const expiryTime = Date.now() + (expiresIn * 1000);
                localStorage.setItem(this.TOKEN_EXPIRY_KEY, expiryTime.toString());
                localStorage.setItem(this.TOKEN_CREATED_KEY, Date.now().toString());
                localStorage.setItem(this.TOKEN_TYPE_KEY, tokenType);
                
                if (typeof updateGlobalAccessToken === 'function') {
                    updateGlobalAccessToken();
                }
                
                // Dispatch token stored event
                root.dispatchEvent(new CustomEvent('token-stored', {
                    detail: {
                        timestamp: new Date().toISOString(),
                        expiry: expiryTime,
                        type: tokenType
                    }
                }));
                
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
            try {
                const token = SecureStorage.getItem(this.TOKEN_KEY, true, false);
                
                if (!token) return null;
                
                if (this.isTokenExpired()) {
                    console.warn('[TOKEN-MANAGER] Token is expired');
                    return null;
                }
                
                return token;
                
            } catch (error) {
                console.error('[TOKEN-MANAGER] Get token error:', error);
                return null;
            }
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
                SecureStorage.removeItem(this.TOKEN_KEY);
                SecureStorage.removeItem(this.REFRESH_TOKEN_KEY);
                localStorage.removeItem(this.TOKEN_EXPIRY_KEY);
                localStorage.removeItem(this.TOKEN_CREATED_KEY);
                localStorage.removeItem(this.TOKEN_TYPE_KEY);
                
                // Dispatch token cleared event
                root.dispatchEvent(new CustomEvent('token-cleared', {
                    detail: { timestamp: new Date().toISOString() }
                }));
                
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
         * Sanitize token by removing whitespace and control characters
         * @private
         * @param {string} token - Token to sanitize
         * @returns {string} Sanitized token
         */
        _sanitizeToken: function(token) {
            if (!token) return token;
            
            return token
                .toString()
                .trim()
                .replace(/[\n\r\t\0]/g, '')
                .replace(/\s+/g, '');
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
    
    secureGetToken = function() {
        return TokenManager.getToken();
    };
    
    secureSetToken = function(token, refreshToken = null) {
        return TokenManager.setToken(token, refreshToken);
    };
    
    secureClearToken = function() {
        return TokenManager.clearToken();
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
        return TokenManager._sanitizeToken(token);
    };
    
    /**
     * Refresh token if needed
     * @returns {Promise<Object>} Refresh result
     */
    refreshTokenIfNeeded = async function() {
        try {
            const currentToken = TokenManager.getToken();
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
            
            const response = await fetchWithRetry('/api/auth/refresh', {
                method: 'POST',
                body: { refreshToken },
                auth: false,
                retries: 2,
                timeout: 10000
            });
            
            if (response && response.success && response.data) {
                const newToken = response.data.token || response.data.accessToken;
                const newRefreshToken = response.data.refreshToken || refreshToken;
                const expiresIn = response.data.expiresIn || TokenManager.DEFAULT_EXPIRY;
                
                if (newToken) {
                    TokenManager.setToken(newToken, newRefreshToken, expiresIn);
                    
                    root.dispatchEvent(new CustomEvent('token-refreshed', {
                        detail: {
                            timestamp: new Date().toISOString(),
                            expiresIn: expiresIn
                        }
                    }));
                    
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
            
        } catch (error) {
            console.error('[TOKEN] Refresh token error:', error);
            return {
                success: false,
                error: error.message || 'Refresh failed',
                token: TokenManager.getToken()
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
                    version: '23.0.0'
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
         * Start prune interval
         * @private
         */
        _startPruneInterval: function() {
            setInterval(() => {
                this._pruneMemoryCache();
            }, 60000); // Prune every minute
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
            tokenReady: false
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
            // Check if dependencies are satisfied
            if (request.requiresAuth) {
                const token = TokenManager ? TokenManager.getToken() : null;
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
                
                root.dispatchEvent(new CustomEvent('request-completed', {
                    detail: {
                        requestId: request.id,
                        endpoint: request.endpoint,
                        success: true
                    }
                }));
                
            } catch (error) {
                // Silent retry for network errors (no console flood)
                if (isNetworkError(error) && request.options.retryCount < (request.options.maxRetries || 3)) {
                    const retryCount = (request.options.retryCount || 0) + 1;
                    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                    
                    setTimeout(() => {
                        this._queue.unshift({
                            ...request,
                            options: {
                                ...request.options,
                                retryCount
                            }
                        });
                        this._process();
                    }, delay);
                    
                    return;
                }
                
                request.reject(error);
                this._stats.failed++;
                this._stats.processed++;
                
                // Only dispatch error event for non-retry errors
                if (!isNetworkError(error)) {
                    root.dispatchEvent(new CustomEvent('request-failed', {
                        detail: {
                            requestId: request.id,
                            endpoint: request.endpoint,
                            error: normalizeError(error)
                        }
                    }));
                }
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
                this._dependencies[dependency] = status;
                this._process(); // Try to process queue after dependency update
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
    // SECTION 6: FETCH WRAPPER - ENHANCED WITH SECURITY AND FALLBACK
    // ============================================================================
    
    const DEFAULT_TIMEOUT = 30000; // 30 seconds
    const DEFAULT_RETRIES = 3;
    const DEFAULT_RETRY_DELAY = 1000;
    const DEFAULT_CACHE_TTL = 300000; // 5 minutes
    const MAX_RETRY_DELAY = 30000; // 30 seconds
    
    const abortControllers = new Map();
    
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
    
    /**
     * Request with abort capability
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<Response>} Fetch response
     */
    requestWithAbort = async function(url, options = {}, timeout = DEFAULT_TIMEOUT) {
        const requestId = options.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const controller = createAbortController(requestId);
        
        const timeoutId = setTimeout(() => {
            controller.abort();
            abortControllers.delete(requestId);
        }, timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            abortControllers.delete(requestId);
            
            return response;
            
        } catch (error) {
            clearTimeout(timeoutId);
            abortControllers.delete(requestId);
            
            if (error.name === 'AbortError') {
                throw new KnectaError(
                    `Request timeout after ${timeout}ms`,
                    408,
                    'TIMEOUT_ERROR',
                    { url, timeout, requestId }
                );
            }
            
            throw error;
        }
    };
    
    /**
     * Fetch with timeout
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @param {number} timeout - Timeout in ms
     * @returns {Promise<Response>} Fetch response
     */
    fetchWithTimeout = async function(url, options = {}, timeout = DEFAULT_TIMEOUT) {
        return requestWithAbort(url, options, timeout);
    };
    
    /**
     * Fetch with retry
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @param {number} retries - Number of retries
     * @param {boolean} backoff - Whether to use exponential backoff
     * @returns {Promise<Response>} Fetch response
     */
    fetchWithRetry = async function(url, options = {}, retries = DEFAULT_RETRIES, backoff = true) {
        let lastError;
        let attempt = 0;
        
        const endpoint = url.replace(/^https?:\/\/[^\/]+/, '');
        
        while (attempt < retries) {
            attempt++;
            
            try {
                const response = await fetchWithTimeout(url, options);
                
                // Don't retry client errors (4xx) except 429 (rate limit)
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    return response;
                }
                
                if (response.ok) {
                    return response;
                }
                
                // Rate limit handling with Retry-After header
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    let delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 
                                backoff ? Math.min(DEFAULT_RETRY_DELAY * Math.pow(2, attempt - 1), MAX_RETRY_DELAY) : 
                                DEFAULT_RETRY_DELAY;
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                if (attempt === retries) {
                    return response;
                }
                
                if (backoff) {
                    const delay = Math.min(DEFAULT_RETRY_DELAY * Math.pow(2, attempt - 1), MAX_RETRY_DELAY);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
            } catch (error) {
                lastError = error;
                
                if (error.name === 'AbortError' || (error.code === 'TIMEOUT_ERROR')) {
                    throw error;
                }
                
                if (attempt === retries) {
                    break;
                }
                
                if (backoff) {
                    const delay = Math.min(DEFAULT_RETRY_DELAY * Math.pow(2, attempt - 1), MAX_RETRY_DELAY);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError || new KnectaError(
            `Request failed after ${retries} attempts`,
            0,
            'RETRY_EXHAUSTED',
            { url, attempts: retries }
        );
    };
    
    /**
     * Fetch with cache
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @param {number} ttl - Cache TTL in ms
     * @param {boolean} forceRefresh - Force refresh cache
     * @returns {Promise<Object>} Response with cache info
     */
    fetchWithCache = async function(url, options = {}, ttl = DEFAULT_CACHE_TTL, forceRefresh = false) {
        const method = options.method || 'GET';
        
        if (method !== 'GET') {
            return fetchWithRetry(url, options);
        }
        
        const cacheKey = `${method}:${url}`;
        
        if (!forceRefresh) {
            const cached = CacheManager.get(cacheKey);
            if (cached) {
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK (Cached)',
                    headers: cached._headers || {},
                    url: url,
                    data: cached,
                    fromCache: true,
                    cacheTime: cached._cacheTime,
                    json: async () => cached,
                    text: async () => JSON.stringify(cached),
                    clone: function() { return this; }
                };
            }
        }
        
        try {
            const response = await fetchWithRetry(url, options);
            
            const clonedResponse = response.clone();
            
            try {
                const data = await clonedResponse.json();
                
                if (response.ok) {
                    const cacheData = {
                        ...data,
                        _headers: Object.fromEntries(response.headers.entries()),
                        _url: response.url,
                        _status: response.status
                    };
                    
                    CacheManager.set(cacheKey, cacheData, ttl);
                }
                
                return {
                    ...response,
                    data,
                    fromCache: false,
                    json: async () => data,
                    text: async () => JSON.stringify(data),
                    clone: function() { 
                        return { ...this, data: { ...data } };
                    }
                };
                
            } catch (e) {
                return response;
            }
            
        } catch (error) {
            // Return stale cache if available
            const cached = CacheManager.get(cacheKey);
            if (cached) {
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK (Stale Cache)',
                    headers: cached._headers || {},
                    url: url,
                    data: cached,
                    fromCache: true,
                    stale: true,
                    cacheTime: cached._cacheTime,
                    json: async () => cached,
                    text: async () => JSON.stringify(cached),
                    clone: function() { return this; }
                };
            }
            
            throw error;
        }
    };
    
    /**
     * Fetch with fallback URLs
     * @param {string} primaryUrl - Primary URL
     * @param {string[]} fallbackUrls - Fallback URLs
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response with fallback info
     */
    fetchWithFallback = async function(primaryUrl, fallbackUrls = [], options = {}) {
        const urls = [primaryUrl, ...fallbackUrls];
        const errors = [];
        
        for (let i = 0; i < urls.length; i++) {
            try {
                const timeout = options.fallbackTimeout || 5000;
                const response = await fetchWithTimeout(urls[i], options, timeout);
                
                if (response.ok) {
                    return {
                        ...response,
                        usedFallback: i > 0,
                        fallbackIndex: i,
                        primaryUrl: primaryUrl,
                        usedUrl: urls[i],
                        json: response.json.bind(response),
                        text: response.text.bind(response),
                        clone: response.clone.bind(response)
                    };
                }
                
                // Don't fallback for client errors (4xx) except 429
                if (i === 0 && response.status >= 400 && response.status < 500 && response.status !== 429) {
                    throw new KnectaError(
                        response.statusText || `HTTP ${response.status}`,
                        response.status,
                        `HTTP_${response.status}`,
                        { url: urls[i] }
                    );
                }
                
                errors.push({
                    url: urls[i],
                    status: response.status,
                    statusText: response.statusText
                });
                
            } catch (error) {
                errors.push({
                    url: urls[i],
                    error: normalizeError(error)
                });
                
                if (i === urls.length - 1) {
                    throw new KnectaError(
                        'All fallback URLs failed',
                        0,
                        'FALLBACK_EXHAUSTED',
                        { urls, errors }
                    );
                }
            }
        }
        
        throw new KnectaError(
            'No URLs provided for fallback',
            0,
            'NO_FALLBACK_URLS'
        );
    };
    
    // Public endpoints that don't require authentication
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
    
    // ============================================================================
    // CORE: secureApiFetch - ENHANCED WITH SECURITY, QUEUEING, AND FALLBACK
    // ============================================================================
    
    /**
     * Secure API fetch with comprehensive security and error handling
     * @param {string} url - Endpoint or full URL
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Normalized response
     */
    secureApiFetch = async function(url, options = {}) {
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
            if (!root.__API_CORE.initialized && !options.skipQueue) {
                return new Promise((resolve, reject) => {
                    RequestQueue.add(
                        () => secureApiFetch(url, { ...options, skipQueue: true }),
                        {
                            endpoint: url,
                            requiresAuth: options.auth !== false && !isPublicEndpoint(url),
                            priority: options.priority || 0,
                            dependencies: ['config', 'environment']
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
            
            // Prepare fetch options
            const fetchOptions = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                credentials: options.credentials || 'include',
                mode: options.mode || 'cors',
                cache: options.cache || 'default',
                redirect: options.redirect || 'follow',
                referrerPolicy: options.referrerPolicy || 'strict-origin-when-cross-origin'
            };
            
            const isPublic = isPublicEndpoint(endpointPath);
            const isAuth = isAuthEndpoint(endpointPath);
            const isStatus = isStatusEndpoint(endpointPath);
            
            const skipAuth = options.auth === false || isPublic || isAuth || isStatus;
            
            // Add authentication headers if needed
            if (!skipAuth) {
                if (TokenManager && TokenManager.shouldRefreshToken && TokenManager.shouldRefreshToken()) {
                    await refreshTokenIfNeeded();
                }
                
                if (TokenManager && TokenManager.getToken) {
                    const token = TokenManager.getToken();
                    if (token) {
                        const tokenType = (TokenManager.getTokenType && TokenManager.getTokenType()) || 'Bearer';
                        fetchOptions.headers['Authorization'] = `${tokenType} ${token}`;
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
            
            // Execute request with appropriate strategy
            let response;
            const requestStartTime = Date.now();
            
            try {
                if (options.useFallback && options.fallbackUrls) {
                    response = await fetchWithFallback(fullUrl, options.fallbackUrls, fetchOptions);
                } else if (options.cache !== false && method === 'GET' && !options.skipCache) {
                    response = await fetchWithCache(
                        fullUrl, 
                        fetchOptions, 
                        options.ttl || DEFAULT_CACHE_TTL, 
                        options.forceRefresh || false
                    );
                } else {
                    response = await fetchWithRetry(
                        fullUrl, 
                        fetchOptions, 
                        options.retries || DEFAULT_RETRIES, 
                        options.backoff !== false
                    );
                }
            } catch (fetchError) {
                // Handle fetch errors gracefully
                console.warn('[API] Fetch error:', fetchError.message);
                
                // Return fallback response
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: fetchError.message || 'Network error',
                    data: {
                        message: fetchError.message || 'Network error',
                        code: fetchError.code || 'NETWORK_ERROR',
                        error: normalizeError(fetchError).toJSON()
                    },
                    error: normalizeError(fetchError),
                    url: fullUrl,
                    method: method,
                    timestamp: Date.now(),
                    fromFallback: true
                };
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
                        
                        if (!response.ok) {
                            response = { ...response, ok: true, status: 200 };
                        }
                    } 
                    else if (trimmed.toLowerCase().includes('success') || 
                             trimmed.toLowerCase().includes('welcome') ||
                             trimmed.toLowerCase().includes('logged in')) {
                        parsed = {
                            success: true,
                            message: trimmed,
                            _fromPlainText: true
                        };
                        
                        if (!response.ok) {
                            response = { ...response, ok: true, status: 200 };
                        }
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
            
            // Handle token extraction for successful responses
            if (response.ok && data) {
                const token = data.token || 
                            data.accessToken || 
                            data.jwt || 
                            data.access_token ||
                            (data.tokens && data.tokens.accessToken) ||
                            (data.data && data.data.token) ||
                            (data.data && data.data.accessToken) ||
                            (typeof data === 'string' && data.length > 20 ? data : null);
                
                if (token && TokenManager && TokenManager.setToken) {
                    const refreshToken = data.refreshToken || 
                                       data.refresh_token || 
                                       (data.tokens && data.tokens.refreshToken);
                    
                    const expiresIn = data.expiresIn || 
                                    data.expires_in || 
                                    3600;
                    
                    TokenManager.setToken(token, refreshToken, expiresIn);
                    
                    RequestQueue.updateDependency('tokenReady', true);
                }
                
                const user = data.user || 
                           (data.data && data.data.user) || 
                           (data.data && !data.data.token ? data.data : null);
                
                if (user && setUserData) {
                    setUserData(user, true);
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
                fromCache: response.fromCache || false,
                stale: response.stale || false,
                cacheTime: response.cacheTime,
                usedFallback: response.usedFallback || false,
                fallbackIndex: response.fallbackIndex,
                usedUrl: response.usedUrl,
                json: async () => data,
                text: async () => typeof data === 'string' ? data : JSON.stringify(data),
                clone: function() { 
                    return { 
                        ...this, 
                        data: JSON.parse(JSON.stringify(data || {})) 
                    }; 
                }
            };
            
            // Handle error responses
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
                
                if ((response.status === 401 || response.status === 403) && !isPublic && !isAuth && !isStatus) {
                    if (handleUnauthorizedAccess) {
                        handleUnauthorizedAccess();
                    }
                }
                
                root.dispatchEvent(new CustomEvent('api-error', {
                    detail: {
                        endpoint: endpointPath,
                        status: response.status,
                        error: error.toJSON(),
                        timestamp: new Date().toISOString()
                    }
                }));
                
                normalizedResponse.error = error;
                return normalizedResponse;
            }
            
            // Dispatch success event
            root.dispatchEvent(new CustomEvent('api-success', {
                detail: {
                    endpoint: endpointPath,
                    status: response.status,
                    duration: requestDuration,
                    timestamp: new Date().toISOString()
                }
            }));
            
            return normalizedResponse;
            
        } catch (error) {
            const normalizedError = normalizeError(error, `Request failed: ${url}`);
            
            // Don't flood console with network errors
            if (!isNetworkError(normalizedError)) {
                root.dispatchEvent(new CustomEvent('api-error', {
                    detail: {
                        endpoint: url,
                        error: normalizedError.toJSON(),
                        timestamp: new Date().toISOString()
                    }
                }));
            }
            
            if (normalizedError.status === 0 || normalizedError.code === 'NETWORK_ERROR') {
                if (root.AppNetwork && root.AppNetwork.updateBackendStatus) {
                    root.AppNetwork.updateBackendStatus(false);
                }
            }
            
            // Always return a structured response, never throw
            return {
                ok: false,
                success: false,
                status: normalizedError.status || 0,
                statusText: normalizedError.message,
                data: {
                    message: normalizedError.message,
                    code: normalizedError.code,
                    error: normalizedError.toJSON()
                },
                error: normalizedError,
                url: url,
                method: options.method || 'GET',
                timestamp: Date.now()
            };
        }
    };
    
    secureRequest = secureApiFetch;
    
    // ============================================================================
    // SECTION 7: USER AND TOKEN FUNCTIONS
    // ============================================================================
    
    getUserToken = function() {
        return TokenManager ? TokenManager.getToken() : null;
    };
    
    setUserToken = function(token) {
        return TokenManager ? TokenManager.setToken(token) : false;
    };
    
    clearUserToken = function() {
        return TokenManager ? TokenManager.clearToken() : false;
    };
    
    secureGetToken = getUserToken;
    secureSetToken = setUserToken;
    secureClearToken = clearUserToken;
    getValidToken = getUserToken;
    getToken = getUserToken;
    setToken = setUserToken;
    
    /**
     * Get current user data
     * @returns {Object|null} User data or null
     */
    getCurrentUser = function() {
        try {
            if (root.currentUser) {
                return root.currentUser;
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
     * @returns {boolean} Success status
     */
    clearAllAuthData = function() {
        try {
            if (TokenManager) {
                TokenManager.clearToken();
            }
            if (SecureStorage) {
                SecureStorage.removeItem('USER_DATA');
                SecureStorage.removeItem('SESSION_DATA');
            }
            root.currentUser = null;
            
            const legacyKeys = [
                'accessToken', 'moodchat_token', 'token', 'moodchat_auth_token',
                'authToken', 'authUser', 'moodchat_auth_user', 'userData',
                'currentUser', 'user', 'jwt', 'access_token'
            ];
            
            legacyKeys.forEach(key => {
                try { localStorage.removeItem(key); } catch (e) {}
            });
            
            root.dispatchEvent(new CustomEvent('auth-data-cleared', {
                detail: { timestamp: new Date().toISOString() }
            }));
            
            root.__API_CORE.emit('auth-data-cleared', {});
            
            return true;
        } catch (error) {
            console.error('[AUTH] Clear all auth data error:', error);
            return false;
        }
    };
    
    tokenReady = function() {
        return Promise.resolve(true);
    };
    
    /**
     * Check if session is valid
     * @returns {boolean} True if valid
     */
    isSessionValid = function() {
        const token = TokenManager ? TokenManager.getToken() : null;
        const user = getCurrentUser();
        return !!(token && user) && (TokenManager ? !TokenManager.isTokenExpired() : false);
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
            token: TokenManager ? TokenManager.getToken() : null,
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
            if (data.token && TokenManager) {
                TokenManager.setToken(data.token, data.refreshToken, data.expiresIn);
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
            
            const token = TokenManager ? TokenManager.getToken() : null;
            if (token) {
                const tokenType = (TokenManager && TokenManager.getTokenType) ? TokenManager.getTokenType() : 'Bearer';
                return { 'Authorization': `${tokenType} ${token}` };
            }
            
            return {};
        } catch (error) {
            console.error('[AUTH] Get auth headers error:', error);
            return {};
        }
    };
    
    secureFetch = secureRequest;
    request = secureRequest;
    api = secureRequest;
    apiRequest = secureRequest;
    apiCall = secureRequest;
    callApi = secureRequest;
    
    /**
     * API GET request
     * @param {string} endpoint - API endpoint
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} Response
     */
    apiGet = async function(endpoint, params = {}) {
        let url = endpoint;
        if (params && Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += (url.includes('?') ? '&' : '?') + queryString;
        }
        return secureRequest(url, { method: 'GET' });
    };
    
    /**
     * API POST request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @returns {Promise<Object>} Response
     */
    apiPost = async function(endpoint, data = {}) {
        return secureRequest(endpoint, { method: 'POST', body: data });
    };
    
    /**
     * API PUT request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @returns {Promise<Object>} Response
     */
    apiPut = async function(endpoint, data = {}) {
        return secureRequest(endpoint, { method: 'PUT', body: data });
    };
    
    /**
     * API DELETE request
     * @param {string} endpoint - API endpoint
     * @returns {Promise<Object>} Response
     */
    apiDelete = async function(endpoint) {
        return secureRequest(endpoint, { method: 'DELETE' });
    };
    
    apiCallWithRetry = async function(endpoint, options = {}, maxRetries = 3) {
        return secureRequest(endpoint, { ...options, retries: maxRetries });
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
            const response = await secureRequest('/api/auth/login', {
                method: 'POST',
                body: credentials,
                auth: false,
                cache: false,
                _isLogin: true
            });
            
            console.log('[API-LOGIN] Raw response:', {
                status: response.status,
                ok: response.ok,
                data: response.data
            });
            
            if (response && response.data) {
                const token = response.data.token || 
                            response.data.accessToken || 
                            response.data.jwt ||
                            (typeof response.data === 'string' && response.data.length > 20 ? response.data : null);
                
                if (token) {
                    console.log('[API-LOGIN] Token extracted successfully');
                    
                    if (!response.ok) {
                        response.ok = true;
                        response.success = true;
                        response.status = 200;
                    }
                    
                    if (TokenManager) {
                        const refreshToken = response.data.refreshToken || null;
                        const expiresIn = response.data.expiresIn || 3600;
                        TokenManager.setToken(token, refreshToken, expiresIn);
                        
                        RequestQueue.updateDependency('tokenReady', true);
                    }
                    
                    const user = response.data.user || 
                               response.data.data || 
                               (response.data._fromPlainText ? { id: 'user', email: credentials.identifier || credentials.email } : null);
                    
                    if (user && setUserData) {
                        setUserData(user);
                    }
                    
                    root.dispatchEvent(new CustomEvent('user-logged-in', {
                        detail: {
                            user: user || { email: credentials.identifier || credentials.email },
                            timestamp: new Date().toISOString()
                        }
                    }));
                    
                    root.__API_CORE.emit('user-logged-in', { user: user || { email: credentials.identifier || credentials.email } });
                }
            }
            
            if (response && response.data && typeof response.data === 'string') {
                const trimmed = response.data.trim();
                if (trimmed.toLowerCase().includes('success') || 
                    trimmed.toLowerCase().includes('welcome') ||
                    trimmed.toLowerCase().includes('logged in')) {
                    
                    if (!response.ok) {
                        response.ok = true;
                        response.success = true;
                        response.status = 200;
                    }
                    
                    const possibleToken = trimmed.match(/[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/);
                    if (possibleToken && TokenManager) {
                        TokenManager.setToken(possibleToken[0], null, 3600);
                        RequestQueue.updateDependency('tokenReady', true);
                    }
                }
            }
            
            return response;
            
        } catch (error) {
            console.error('[API-LOGIN] Login error:', error);
            return normalizeError(error, 'Login failed');
        }
    };
    
    /**
     * Logout user
     * @returns {Promise<Object>} Logout response
     */
    logout = async function() {
        try {
            const token = TokenManager ? TokenManager.getToken() : null;
            
            if (token) {
                await secureRequest('/api/auth/logout', {
                    method: 'POST',
                    auth: true,
                    cache: false
                }).catch(() => {});
            }
        } catch (e) {}
        
        clearAllAuthData();
        
        RequestQueue.updateDependency('tokenReady', false);
        
        root.dispatchEvent(new CustomEvent('user-logged-out', {
            detail: { timestamp: new Date().toISOString() }
        }));
        
        root.__API_CORE.emit('user-logged-out', {});
        
        return { success: true, message: 'Logged out successfully' };
    };
    
    /**
     * Register new user
     * @param {Object} userData - Registration data
     * @returns {Promise<Object>} Registration response
     */
    register = async function(userData) {
        return secureRequest('/api/auth/register', {
            method: 'POST',
            body: userData,
            auth: false,
            cache: false
        });
    };
    
    /**
     * Forgot password
     * @param {string} email - User email
     * @returns {Promise<Object>} Response
     */
    forgotPassword = async function(email) {
        return secureRequest('/api/auth/forgot', {
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
        return secureRequest('/api/auth/reset', {
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
        
        const response = await secureRequest('/api/auth/refresh', {
            method: 'POST',
            body: { refreshToken: refreshTokenValue },
            auth: false,
            cache: false
        });
        
        if (response && response.success && response.data) {
            const newToken = response.data.token || response.data.accessToken;
            const newRefreshToken = response.data.refreshToken || refreshTokenValue;
            const expiresIn = response.data.expiresIn || 3600;
            
            if (newToken && TokenManager) {
                TokenManager.setToken(newToken, newRefreshToken, expiresIn);
            }
        }
        
        return response;
    };
    
    /**
     * Validate authentication
     * @returns {Promise<boolean>} True if valid
     */
    validateAuth = async function() {
        const token = TokenManager ? TokenManager.getToken() : null;
        
        if (!token) {
            return false;
        }
        
        if (TokenManager && TokenManager.isTokenExpired()) {
            const refreshResult = await refreshToken();
            if (!refreshResult.success) {
                return false;
            }
        }
        
        const response = await secureRequest('/api/auth/me', {
            method: 'GET',
            retries: 1,
            cache: false
        });
        
        if (response && response.success && response.data && response.data.user) {
            setUserData(response.data.user);
            return true;
        }
        
        return false;
    };
    
    checkAuth = validateAuth;
    
    checkAuthMe = async function() {
        return secureRequest('/api/auth/me', { 
            method: 'GET', 
            cache: false 
        });
    };
    
    /**
     * Update global access token reference
     * @returns {string|null} Updated token
     */
    updateGlobalAccessToken = function() {
        const token = TokenManager ? TokenManager.getToken() : null;
        root.__GLOBAL_TOKEN = token;
        return token;
    };
    
    /**
     * Handle unauthorized access
     */
    handleUnauthorizedAccess = function() {
        if (localStorage.getItem('_auth_clearing_in_progress')) {
            return;
        }
        
        localStorage.setItem('_auth_clearing_in_progress', 'true');
        
        clearAllAuthData();
        
        RequestQueue.updateDependency('tokenReady', false);
        
        localStorage.removeItem('_auth_clearing_in_progress');
        
        if (!root.location.pathname.includes('/login') && 
            !root.location.pathname.includes('index.html') &&
            !root.location.pathname.includes('/register') &&
            !root.location.pathname.includes('/forgot-password')) {
            
            setTimeout(() => {
                root.location.href = '/login';
            }, 100);
        }
    };
    
    getApiBaseUrl = getBaseUrl;
    getBackendBaseUrl = getBaseUrl;
    
    /**
     * Initialize token system
     * @returns {Object} Token and user info
     */
    initializeTokenSystem = function() {
        if (migrateLegacyTokens) {
            migrateLegacyTokens();
        }
        const token = TokenManager ? TokenManager.getToken() : null;
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
            
            const response = await secureRequest(`/api/chats/${chatId}/messages`, {
                method: 'POST',
                body: {
                    content: content,
                    type: options.type || 'text',
                    metadata: options.metadata || {}
                }
            });
            
            return response;
            
        } catch (error) {
            return normalizeError(error, 'Failed to send message');
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
            
            return await secureRequest(url, {
                method: 'GET',
                cache: true,
                ttl: 60000
            });
            
        } catch (error) {
            return normalizeError(error, 'Failed to get chat history');
        }
    };
    
    /**
     * Get unread message count
     * @returns {Promise<Object>} Response
     */
    getUnreadCount = async function() {
        try {
            const response = await secureRequest('/api/chats/unread', {
                method: 'GET',
                cache: true,
                ttl: 30000
            });
            
            return response;
            
        } catch (error) {
            return normalizeError(error, 'Failed to get unread count');
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
            
            const response = await secureRequest(`/api/chats/${chatId}/read`, {
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
            return normalizeError(error, 'Failed to mark chat as read');
        }
    };
    
    // ============================================================================
    // SECTION 10: API FUNCTIONS - ALL PRESERVED
    // ============================================================================
    
    getTeamMembers = async function(teamId) {
        const url = teamId ? `/api/teams/${teamId}/members` : '/api/teams/members';
        return secureRequest(url, { method: 'GET', cache: true, ttl: 60000 });
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
        return secureRequest('/api/friends', { 
            method: 'GET', 
            cache: true, 
            ttl: 30000 
        });
    };
    
    navigateToChat = function(chatId, userId = null) {
        return openChat(userId, chatId);
    };
    
    getUserGroups = async function() {
        return secureRequest('/api/group/user', { 
            method: 'GET', 
            cache: true, 
            ttl: 60000 
        });
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
        return secureRequest('/api/teams/invite', {
            method: 'POST',
            body: { email, role }
        });
    };
    
    acceptGroupInvite = async function(inviteId) {
        return secureRequest(`/api/group/invites/${inviteId}/accept`, {
            method: 'POST'
        });
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
        return secureRequest(`/api/teams/${teamId}/members/${memberId}/role`, {
            method: 'PUT',
            body: { role }
        });
    };
    
    // ============================================================================
    // SECTION 11: SOCIAL FUNCTIONS
    // ============================================================================
    
    getFriends = async function() {
        return secureRequest('/api/friends', { 
            method: 'GET',
            cache: true,
            ttl: 30000
        });
    };
    
    getFriendRequests = async function() {
        return secureRequest('/api/friends/requests', { 
            method: 'GET',
            cache: true,
            ttl: 15000
        });
    };
    
    sendFriendRequest = async function(userId) {
        return secureRequest('/api/friends/request', {
            method: 'POST',
            body: { userId }
        });
    };
    
    acceptFriendRequest = async function(requestId) {
        return secureRequest(`/api/friends/accept/${requestId}`, {
            method: 'POST'
        });
    };
    
    rejectFriendRequest = async function(requestId) {
        return secureRequest(`/api/friends/reject/${requestId}`, {
            method: 'POST'
        });
    };
    
    removeFriend = async function(friendId) {
        return secureRequest(`/api/friends/remove/${friendId}`, {
            method: 'DELETE'
        });
    };
    
    // ============================================================================
    // SECTION 12: MESSAGING FUNCTIONS
    // ============================================================================
    
    getConversations = async function() {
        return secureRequest('/api/chats/conversations', { 
            method: 'GET',
            cache: true,
            ttl: 15000
        });
    };
    
    getMessages = async function(chatId, limit = 50, offset = 0) {
        return secureRequest(`/api/chats/${chatId}/messages?limit=${limit}&offset=${offset}`, {
            method: 'GET',
            cache: true,
            ttl: 10000
        });
    };
    
    sendMessage = async function(chatId, content, type = 'text', metadata = {}) {
        return secureRequest(`/api/chats/${chatId}/messages`, {
            method: 'POST',
            body: { content, type, metadata }
        });
    };
    
    markMessagesAsRead = async function(chatId, messageIds) {
        return secureRequest(`/api/chats/${chatId}/messages/read`, {
            method: 'POST',
            body: { messageIds }
        });
    };
    
    deleteMessage = async function(chatId, messageId) {
        return secureRequest(`/api/chats/${chatId}/messages/${messageId}`, {
            method: 'DELETE'
        });
    };
    
    clearChatHistory = async function(chatId) {
        return secureRequest(`/api/chats/${chatId}/history`, {
            method: 'DELETE'
        });
    };
    
    // ============================================================================
    // SECTION 13: GROUP FUNCTIONS
    // ============================================================================
    
    createGroup = async function(groupData) {
        return secureRequest('/api/group', {
            method: 'POST',
            body: groupData
        });
    };
    
    getGroups = async function() {
        return secureRequest('/api/group', { 
            method: 'GET',
            cache: true,
            ttl: 60000
        });
    };
    
    getGroupDetails = async function(groupId) {
        return secureRequest(`/api/group/${groupId}`, { 
            method: 'GET',
            cache: true,
            ttl: 30000
        });
    };
    
    updateGroup = async function(groupId, groupData) {
        return secureRequest(`/api/group/${groupId}`, {
            method: 'PUT',
            body: groupData
        });
    };
    
    deleteGroup = async function(groupId) {
        return secureRequest(`/api/group/${groupId}`, {
            method: 'DELETE'
        });
    };
    
    addGroupMember = async function(groupId, userId) {
        return secureRequest(`/api/group/${groupId}/members`, {
            method: 'POST',
            body: { userId }
        });
    };
    
    removeGroupMember = async function(groupId, userId) {
        return secureRequest(`/api/group/${groupId}/members/${userId}`, {
            method: 'DELETE'
        });
    };
    
    leaveGroup = async function(groupId) {
        return secureRequest(`/api/group/${groupId}/leave`, {
            method: 'POST'
        });
    };
    
    // ============================================================================
    // SECTION 14: NOTIFICATION FUNCTIONS
    // ============================================================================
    
    getNotifications = async function() {
        return secureRequest('/api/notifications', { 
            method: 'GET',
            cache: true,
            ttl: 10000
        });
    };
    
    markNotificationAsRead = async function(notificationId) {
        return secureRequest(`/api/notifications/${notificationId}/read`, {
            method: 'POST'
        });
    };
    
    deleteNotification = async function(notificationId) {
        return secureRequest(`/api/notifications/${notificationId}`, {
            method: 'DELETE'
        });
    };
    
    clearAllNotifications = async function() {
        return secureRequest('/api/notifications/clear', {
            method: 'POST'
        });
    };
    
    // ============================================================================
    // SECTION 15: PROFILE FUNCTIONS
    // ============================================================================
    
    getProfile = async function() {
        return secureRequest('/api/users/profile', { 
            method: 'GET',
            cache: true,
            ttl: 30000
        });
    };
    
    updateProfile = async function(profileData) {
        return secureRequest('/api/users/profile', {
            method: 'PUT',
            body: profileData
        });
    };
    
    changePassword = async function(currentPassword, newPassword) {
        return secureRequest('/api/users/change-password', {
            method: 'POST',
            body: { currentPassword, newPassword }
        });
    };
    
    deleteAccount = async function() {
        return secureRequest('/api/users/delete-account', {
            method: 'DELETE'
        });
    };
    
    // ============================================================================
    // SECTION 16: USER FUNCTIONS
    // ============================================================================
    
    getOnlineUsers = async function() {
        return secureRequest('/api/users/online', { 
            method: 'GET',
            cache: true,
            ttl: 5000
        });
    };
    
    searchUsers = async function(query) {
        return secureRequest(`/api/users/search?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            cache: true,
            ttl: 30000
        });
    };
    
    // ============================================================================
    // SECTION 17: CALL FUNCTIONS
    // ============================================================================
    
    getCallHistory = async function() {
        return secureRequest('/api/calls/history', { 
            method: 'GET',
            cache: true,
            ttl: 60000
        });
    };
    
    startCall = async function(userId) {
        return secureRequest('/api/calls/start', {
            method: 'POST',
            body: { userId }
        });
    };
    
    endCall = async function(callId) {
        return secureRequest(`/api/calls/${callId}/end`, {
            method: 'POST'
        });
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
        return secureRequest('/api/settings', { 
            method: 'GET',
            cache: true,
            ttl: 60000
        });
    };
    
    updateSettings = async function(settings) {
        return secureRequest('/api/settings', {
            method: 'PUT',
            body: settings
        });
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
        
        return secureRequest('/api/files/upload', {
            method: 'POST',
            body: formData,
            headers: {},
            timeout: 60000
        });
    };
    
    deleteFile = async function(fileId) {
        return secureRequest(`/api/files/${fileId}`, {
            method: 'DELETE'
        });
    };
    
    getFile = async function(fileId) {
        return secureRequest(`/api/files/${fileId}`, { 
            method: 'GET',
            cache: true,
            ttl: 300000
        });
    };
    
    // ============================================================================
    // SECTION 20: ANALYTICS FUNCTIONS
    // ============================================================================
    
    requestSession = async function() {
        return secureRequest('/api/auth/session', { 
            method: 'GET',
            cache: false
        });
    };
    
    getAnalyticsData = async function(params = {}) {
        let url = '/api/analytics';
        if (params && Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += (url.includes('?') ? '&' : '?') + queryString;
        }
        return secureRequest(url, { 
            method: 'GET',
            cache: true,
            ttl: 300000
        });
    };
    
    exportAnalytics = async function(analyticsData) {
        return secureRequest('/api/analytics/export', {
            method: 'POST',
            body: analyticsData,
            timeout: 30000
        });
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
            const response = await fetchWithTimeout(`${baseUrl}/api/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }, 5000);
            
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
        _readyPromise: null,
        _readyResolve: null
    };
    
    ORCHESTRATION_STATE._readyPromise = new Promise((resolve) => {
        ORCHESTRATION_STATE._readyResolve = resolve;
    });
    
    /**
     * Wait for core to be ready
     * @returns {Promise} Ready promise
     */
    waitForReady = function() {
        return ORCHESTRATION_STATE._readyPromise;
    };
    
    /**
     * Check if core is ready
     * @returns {boolean} True if ready
     */
    isCoreReady = function() {
        return ORCHESTRATION_STATE.coreReady;
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
            coreReady: ORCHESTRATION_STATE.coreReady,
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
    
    // Mark core as ready after initialization
    setTimeout(() => {
        ORCHESTRATION_STATE.coreReady = true;
        if (ORCHESTRATION_STATE._readyResolve) {
            ORCHESTRATION_STATE._readyResolve(true);
        }
        root.dispatchEvent(new CustomEvent('api-core-ready', {
            detail: { timestamp: new Date().toISOString() }
        }));
    }, 100);
    
    // ============================================================================
    // SECTION 24: API GATEWAY - COMPLETE UNIFIED INTERFACE
    // ============================================================================
    
    ApiGateway = {
        version: '23.0.0',
        build: '2024-06-15',
        
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
            getToken: secureGetToken,
            setToken: secureSetToken,
            clearToken: secureClearToken,
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
        
        request: secureRequest,
        get: async function(endpoint, params = {}, options = {}) {
            let url = endpoint;
            if (params && Object.keys(params).length > 0) {
                const queryString = new URLSearchParams(params).toString();
                url += (url.includes('?') ? '&' : '?') + queryString;
            }
            return secureRequest(url, { ...options, method: 'GET' });
        },
        post: async function(endpoint, data = {}, options = {}) {
            return secureRequest(endpoint, { ...options, method: 'POST', body: data });
        },
        put: async function(endpoint, data = {}, options = {}) {
            return secureRequest(endpoint, { ...options, method: 'PUT', body: data });
        },
        patch: async function(endpoint, data = {}, options = {}) {
            return secureRequest(endpoint, { ...options, method: 'PATCH', body: data });
        },
        delete: async function(endpoint, options = {}) {
            return secureRequest(endpoint, { ...options, method: 'DELETE' });
        },
        head: async function(endpoint, options = {}) {
            return secureRequest(endpoint, { ...options, method: 'HEAD' });
        },
        options: async function(endpoint, options = {}) {
            return secureRequest(endpoint, { ...options, method: 'OPTIONS' });
        },
        
        withCache: async function(endpoint, options = {}) {
            return secureRequest(endpoint, { ...options, cache: true });
        },
        withRetry: async function(endpoint, options = {}, retries = 3) {
            return secureRequest(endpoint, { ...options, retries: retries });
        },
        withTimeout: async function(endpoint, timeout = 5000, options = {}) {
            return secureRequest(endpoint, { ...options, timeout: timeout });
        },
        withFallback: async function(endpoint, fallbackUrls, options = {}) {
            return secureRequest(endpoint, { ...options, useFallback: true, fallbackUrls: fallbackUrls });
        },
        
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
        
        apiRequest: secureRequest,
        apiGet: function(endpoint, params) { return this.get(endpoint, params); },
        apiPost: function(endpoint, data) { return this.post(endpoint, data); },
        apiPut: function(endpoint, data) { return this.put(endpoint, data); },
        apiDelete: function(endpoint) { return this.delete(endpoint); },
        apiCall: secureRequest,
        callApi: secureRequest,
        request: secureRequest,
        secureFetch: secureRequest,
        secureApiFetch: secureRequest,
        apiCallWithRetry: function(endpoint, options, retries) { 
            return this.withRetry(endpoint, options, retries); 
        },
        
        /**
         * Get gateway status
         * @returns {Object} Status object
         */
        getStatus: function() {
            return {
                version: this.version,
                build: this.build,
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
                    hasToken: !!(TokenManager && TokenManager.getToken()),
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
        ready: true
    };
    
    gateway = ApiGateway;
    
    // ============================================================================
    // SECTION 25: INITIALIZE GATEWAY - ENHANCED
    // ============================================================================
    
    initializeGateway = function(options = {}) {
        try {
            console.log('[API-CORE] Initializing API Gateway v23.0.0');
            
            if (options.environment) {
                setEnvironment(options.environment);
            } else {
                CURRENT_ENVIRONMENT = detectEnvironment();
            }
            
            RequestQueue.updateDependency('environment', true);
            
            if (options.baseUrl) {
                setBaseUrl(options.baseUrl);
            } else {
                ACTIVE_BASE_URL = getBaseUrl();
            }
            
            RequestQueue.updateDependency('config', true);
            
            if (TokenManager && TokenManager.migrateLegacyTokens) {
                TokenManager.migrateLegacyTokens();
            }
            
            if (initializeTokenSystem) {
                initializeTokenSystem();
            }
            
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
            
            if (CacheManager && CacheManager._pruneMemoryCache) {
                CacheManager._pruneMemoryCache();
            }
            
            if (updateGlobalAccessToken) {
                updateGlobalAccessToken();
            }
            
            RequestQueue.updateDependency('bootstrap', true);
            
            const readyEvent = new CustomEvent('api-gateway-ready', {
                detail: {
                    version: '23.0.0',
                    environment: CURRENT_ENVIRONMENT,
                    baseUrl: ACTIVE_BASE_URL,
                    timestamp: new Date().toISOString(),
                    features: [
                        'base-url-control',
                        'auto-environment-detection',
                        'https-enforcement',
                        'security-validation',
                        'fetch-wrapper',
                        'error-normalization',
                        'token-security',
                        'cache-management',
                        'request-queue',
                        'dependency-waiting',
                        'chat-functions',
                        'iframe-orchestration',
                        'safe-json-parser',
                        'enhanced-login-handling',
                        'fallback-mechanisms',
                        'cross-device-compatibility'
                    ]
                }
            });
            
            root.dispatchEvent(readyEvent);
            
            console.log('[API-CORE] Initialized successfully', {
                environment: CURRENT_ENVIRONMENT,
                baseUrl: ACTIVE_BASE_URL,
                version: '23.0.0'
            });
            
            return {
                success: true,
                environment: CURRENT_ENVIRONMENT,
                baseUrl: ACTIVE_BASE_URL,
                version: '23.0.0',
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('[API-CORE] Initialization error:', error);
            
            return {
                success: false,
                error: normalizeError(error).toJSON(),
                timestamp: new Date().toISOString()
            };
        }
    };
    
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
        
        get: ApiGateway.get,
        post: ApiGateway.post,
        put: ApiGateway.put,
        patch: ApiGateway.patch,
        delete: ApiGateway.delete,
        del: ApiGateway.delete
    };
    
    get = apiCore.get;
    post = apiCore.post;
    put = apiCore.put;
    del = apiCore.delete;
    
    // ============================================================================
    // SECTION 27: GLOBAL INITIALIZATION
    // ============================================================================
    
    initializeGateway();
    
    // Periodic token refresh
    setInterval(() => {
        if (TokenManager && TokenManager.shouldRefreshToken && TokenManager.shouldRefreshToken()) {
            refreshTokenIfNeeded().catch(() => {});
        }
    }, 60000);
    
    // Periodic cache pruning
    setInterval(() => {
        if (CacheManager && CacheManager._pruneMemoryCache) {
            CacheManager._pruneMemoryCache();
        }
    }, 300000);
    
    // Periodic network check
    setInterval(() => {
        if (navigator.onLine) {
            checkNetworkStatus().catch(() => {});
        }
    }, 30000);
    
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
        version: '23.0.0',
        initialized: true,
        ready: _readyPromise,
        secureApiFetch: secureApiFetch,
        getUserToken: getUserToken,
        setUserToken: setUserToken,
        clearUserToken: clearUserToken,
        _apiCache: CacheManager._memoryCache,
        _apiRequestQueue: RequestQueue._queue,
        _events: eventEmitter.events,
        on: eventEmitter.on.bind(eventEmitter),
        emit: eventEmitter.emit.bind(eventEmitter),
        __bootstrapped: true
    });
    
    // Ensure legacy bridges
    root.apiCore = root.apiCore || root.__API_CORE;
    root.api_core = root.api_core || root.__API_CORE;
    
    root.__API_GATEWAY = {
        version: '23.0.0',
        build: '2024-06-15',
        environment: CURRENT_ENVIRONMENT,
        baseUrl: ACTIVE_BASE_URL,
        initialized: true,
        timestamp: new Date().toISOString(),
        features: [
            'base-url-control',
            'auto-environment-detection',
            'https-enforcement',
            'security-validation',
            'fetch-wrapper',
            'error-normalization',
            'token-security',
            'cache-management',
            'request-queue',
            'dependency-waiting',
            'chat-functions',
            'iframe-orchestration',
            'safe-json-parser',
            'enhanced-login-handling',
            'fallback-mechanisms',
            'cross-device-compatibility'
        ]
    };
    
    // ============================================================================
    // FINAL READY RESOLUTION
    // ============================================================================
    
    // Ensure root.api.core exists BEFORE marking as initialized
    if (!root.api) root.api = {};
    
    // Get the ready promise from __API_CORE
    const coreReadyPromise = root.__API_CORE ? root.__API_CORE.ready : Promise.resolve(true);
    
    if (!root.api.core) {
        root.api.core = {
            __initializing: false,
            __version: '23.0.0',
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
                return root.__API_CORE ? root.__API_CORE.initialized === true : false;
            },
            getStatus: function() {
                return {
                    ready: root.__API_CORE ? root.__API_CORE.initialized === true : false,
                    initializing: false,
                    version: '23.0.0'
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
            return root.__API_CORE ? root.__API_CORE.initialized === true : false;
        };
        root.api.core.getStatus = root.api.core.getStatus || function() {
            return {
                ready: root.__API_CORE ? root.__API_CORE.initialized === true : false,
                initializing: false,
                version: '23.0.0'
            };
        };
        root.api.core.init = root.api.core.init || function() { return coreReadyPromise; };
    }
    
    // Mark as initialized
    root.api.core.__initialized = true;
    root.api.core.__initializing = false;
    root.api.core.__ready = true;
    
    // Resolve the ready promise
    if (_resolveReady) {
        clearTimeout(_readyTimeout);
        _resolveReady({
            success: true,
            timestamp: new Date().toISOString(),
            version: '23.0.0'
        });
    }
    
    // Dispatch events safely
    try {
        root.dispatchEvent(new CustomEvent('api-core-ready', {
            detail: {
                version: '23.0.0',
                environment: CURRENT_ENVIRONMENT,
                baseUrl: ACTIVE_BASE_URL,
                timestamp: new Date().toISOString(),
                features: root.__API_GATEWAY ? root.__API_GATEWAY.features : []
            }
        }));
    } catch (e) {
        console.warn('[API-CORE] Failed to dispatch api-core-ready event:', e);
    }
    
    if (root.__API_CORE && typeof root.__API_CORE.emit === 'function') {
        try {
            root.__API_CORE.emit('ready', {
                version: '23.0.0',
                environment: CURRENT_ENVIRONMENT,
                timestamp: new Date().toISOString()
            });
        } catch (e) {
            console.warn('[API-CORE] Failed to emit ready event:', e);
        }
    }
    
    console.log('[API-CORE] Fully loaded and ready', {
        environment: CURRENT_ENVIRONMENT,
        baseUrl: ACTIVE_BASE_URL,
        version: '23.0.0',
        features: root.__API_GATEWAY ? root.__API_GATEWAY.features.length : 0
    });
    
    // ============================================================================
    // INTEGRATION SELF-TESTS - PRESERVED AND ENHANCED
    // ============================================================================
    try {
        console.log('[API-CORE] Running self-tests...');
        
        // Verify root.api.core exists now
        if (!root.api || !root.api.core) {
            console.error('[API-CORE] TEST FAILED: root.api.core still missing after initialization');
        } else {
            console.log('[API-CORE] TEST PASSED: root.api.core exists');
            
            // Test 1: Verify waitFor exists
            if (typeof root.api.core.waitFor !== 'function') {
                console.error('[API-CORE] TEST FAILED: waitFor is not a function');
            } else {
                console.log('[API-CORE] TEST PASSED: waitFor exists');
            }
            
            // Test 2: Verify ready is a Promise
            const isPromise = root.api.core.ready instanceof Promise || 
                             (root.api.core.ready && typeof root.api.core.ready.then === 'function');
            
            if (!isPromise) {
                console.error('[API-CORE] TEST FAILED: ready is not a Promise', root.api.core.ready);
                // Force fix it
                root.api.core.ready = coreReadyPromise;
                console.log('[API-CORE] TEST: ready has been fixed to be a Promise');
            } else {
                console.log('[API-CORE] TEST PASSED: ready is a Promise');
            }
            
            // Test 3: Verify waitFor resolves
            if (typeof root.api.core.waitFor === 'function') {
                root.api.core.waitFor().then(() => {
                    console.log('[API-CORE] TEST PASSED: waitFor resolved');
                }).catch(() => {});
            }
            
            // Test 4: Verify whenReady exists
            if (typeof root.api.core.whenReady !== 'function') {
                console.error('[API-CORE] TEST FAILED: whenReady is not a function');
            } else {
                console.log('[API-CORE] TEST PASSED: whenReady exists');
            }
            
            // Test 5: Verify isReady exists
            if (typeof root.api.core.isReady !== 'function') {
                console.error('[API-CORE] TEST FAILED: isReady is not a function');
            } else {
                console.log('[API-CORE] TEST PASSED: isReady exists');
            }
        }
        
        // Test 6: Verify __API_CORE exists
        if (!root.__API_CORE) {
            console.error('[API-CORE] TEST FAILED: __API_CORE missing');
        } else {
            console.log('[API-CORE] TEST PASSED: __API_CORE exists');
        }
        
        // Test 7: Verify required properties
        if (root.__API_CORE) {
            const requiredProps = ['version', 'initialized', 'ready', 'secureApiFetch', 'getUserToken', 'setUserToken', 'clearUserToken', '_apiCache', '_apiRequestQueue', '_events', 'on', 'emit'];
            let allPropsExist = true;
            requiredProps.forEach(prop => {
                if (!root.__API_CORE[prop]) {
                    console.error(`[API-CORE] TEST FAILED: __API_CORE.${prop} missing`);
                    allPropsExist = false;
                }
            });
            if (allPropsExist) {
                console.log('[API-CORE] TEST PASSED: All required properties exist');
            }
        }
        
        // Test 8: Security validation
        const testUrls = [
            ['/api/users/me', true],
            ['/api/users/../config', false],
            ['https://evil.com/api/steal', false],
            ['https://moodchat-fy56.onrender.com/api/users', true],
            ['http://localhost:4000/api/users', true]
        ];
        
        let securityTestsPassed = 0;
        testUrls.forEach(([url, expected]) => {
            const result = isValidEndpoint(url, getBaseUrl());
            if (result === expected) {
                securityTestsPassed++;
            } else {
                console.warn(`[API-CORE] Security test failed for ${url}: expected ${expected}, got ${result}`);
            }
        });
        console.log(`[API-CORE] Security tests: ${securityTestsPassed}/${testUrls.length} passed`);
        
        console.log('[API-CORE] Self-tests completed');
    } catch (testError) {
        console.error('[API-CORE] Self-test error:', testError);
    }
    
    // Final verification that bootstrap can proceed
    if (root.dispatchEvent) {
        try {
            root.dispatchEvent(new CustomEvent('api-core-initialized', {
                detail: {
                    version: '23.0.0',
                    timestamp: new Date().toISOString()
                }
            }));
        } catch (e) {}
    }
    
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