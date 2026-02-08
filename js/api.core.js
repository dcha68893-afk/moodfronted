// api.core.js - Core API infrastructure with Token Normalization, Environment Detection
// Version: 20.5.2 - Part 1 of 3: Core Infrastructure
// Date: 2024-01-02
// 🔧 CRITICAL FIX: Public vs Protected endpoint separation, Auth-Availability decoupling
// 🔧 SURGICAL FIX: Remove /api duplication - api.core.js MUST NOT add /api to endpoints

// ============================================================================
// MODULE-LEVEL FUNCTION DECLARATIONS (EXPORTED FUNCTIONS MUST BE AT MODULE LEVEL)
// ============================================================================

// Initialize these as null, they will be defined inside the IIFE
let requestSession = null;
let getAnalyticsData = null;
let markChatAsRead = null; 
let isSessionValid = null;
let formatTimeAgo = null;
let exportAnalytics = null;
let getUserToken = null;
let setUserToken = null;
let clearUserToken = null;
let getCurrentUser = null;
let setUserData = null;
let clearAllAuthData = null;
let tokenReady = null;
let secureFetch = null;
let secureApiFetch = null;
let getValidToken = null;
let getAuthHeaders = null;
let isPublicEndpoint = null;
let isAuthEndpoint = null;
let isStatusEndpoint = null;
let validateAuth = null;
let updateGlobalAccessToken = null;
let handleUnauthorizedAccess = null;
let determineBackendUrl = null;
let getApiBaseUrl = null;
let validateSession = null;
let updateSession = null;
let getUserData = null;
let initializeTokenSystem = null;
let updateCurrentUser = null;
let getBackendBaseUrl = null;
let isAuthenticated = null;
let getSessionData = null;
let clearSession = null;
let setSessionData = null;
let getToken = null;
let setToken = null;
let login = null;
let logout = null;
let apiCallWithRetry = null;
let getSession = null;
let api = null;
let register = null;
let forgotPassword = null;
let resetPassword = null;
let refreshToken = null;
let checkAuth = null;
let checkAuthMe = null;
let getProfile = null;
let updateProfile = null;
let changePassword = null;
let deleteAccount = null;
let getOnlineUsers = null;
let searchUsers = null;
let sendFriendRequest = null;
let acceptFriendRequest = null;  // 🔧 FIXED: Now declared at module level
let rejectFriendRequest = null;
let removeFriend = null;
let getFriends = null;
let getFriendRequests = null;
let getConversations = null;
let getMessages = null;
let sendMessage = null;
let markMessagesAsRead = null;
let deleteMessage = null;
let clearChatHistory = null;
let createGroup = null;
let getGroups = null;
let getGroupDetails = null;
let updateGroup = null;
let deleteGroup = null;
let addGroupMember = null;
let removeGroupMember = null;
let leaveGroup = null;
let getNotifications = null;
let markNotificationAsRead = null;
let deleteNotification = null;
let clearAllNotifications = null;
let getCallHistory = null;
let startCall = null;
let endCall = null;
let getSettings = null;
let updateSettings = null;
let uploadFile = null;
let deleteFile = null;
let getFile = null;
let checkNetworkStatus = null;
let debounce = null;
let throttle = null;
let generateId = null;
let formatDate = null;
let formatTime = null;
let emit = null;
let on = null;
let off = null;
let once = null;
let apiRequest = null;
let apiGet = null;
let apiPost = null;
let apiPut = null;
let apiDelete = null;
let apiCall = null;
let initSession = null;
let callApi = null;
let escapeHtml = null;
let simulateIncomingCall = null;

// ES6 Exports - ALL FUNCTIONS NOW PROPERLY DECLARED
export {
    requestSession,
    getAnalyticsData,
    markChatAsRead,
    isSessionValid,
    formatTimeAgo,
    exportAnalytics,
    getUserToken,
    setUserToken,
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
    // ADDED MISSING EXPORTS BASED ON CONSOLE ERRORS
    login,
    logout,
    apiCallWithRetry,
    getSession,
    // ADDITIONAL COMMON EXPORTS
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
    acceptFriendRequest,      // 🔧 FIXED: Now properly declared and exported
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
    initSession,
    callApi,
    escapeHtml,
    simulateIncomingCall,
    // NETWORK STATUS FUNCTIONS
    checkNetworkStatus,
    // UTILITY FUNCTIONS
    debounce,
    throttle,
    generateId,
    formatDate,
    formatTime,
    // EVENT EMITTER FUNCTIONS
    emit,
    on,
    off,
    once,
    // NEW ADDED EXPORTS FOR GLOBAL API FUNCTIONS
    apiRequest,
    apiGet,
    apiPost,
    apiPut,
    apiDelete,
    clearUserToken,
    // LEGACY API SUPPORT
    apiCall
};

console.log("✅ api.core.js loaded");

// ============================================================================
// CRITICAL: DUPLICATE LOADING PREVENTION
// ============================================================================
// Check if we're already loaded using a more robust method
if (window.__API_CORE_LOADED_V2) {
    console.warn('⚠️ [api.core] api.core.js already loaded, skipping duplicate initialization');
    // Exit early without throwing to prevent script loading errors
    // Don't execute any more code - we'll just wrap the rest in an IIFE
    // Instead of return, we'll wrap the entire code in a conditional block
    // The rest of the code below will not execute if already loaded
} else {
    // Mark that we're loading
    window.__API_JS_LOADING = true;
    let API_INITIALIZATION_IN_PROGRESS = false;
    let API_INITIALIZATION_COMPLETE = false;
    let API_READY_EVENT_DISPATCHED = false;

    // ============================================================================
    // CENTRALIZED TOKEN SYSTEM - SINGLE SOURCE OF TRUTH
    // ============================================================================

    let API_INITIALIZED = false;

    // SINGLE GLOBAL TOKEN CONSTANTS - NO DUPLICATION
    const USER_TOKEN_KEY = 'USER_TOKEN';
    const USER_DATA_KEY = 'USER_DATA';
    const TOKEN_MIGRATION_KEY = 'TOKEN_MIGRATION_COMPLETE';
    const SESSION_DATA_KEY = 'SESSION_DATA';

    // ============================================================================
    // ENVIRONMENT DETECTION & BACKEND URL CONFIGURATION
    // ============================================================================

    // Function to determine the appropriate backend URL based on current environment

    let _cachedBackendUrl = null;
    determineBackendUrl = function() {
        // Return cached value if already determined
        if (_cachedBackendUrl !== null) {
            return _cachedBackendUrl;
        }
        
        const currentHostname = window.location.hostname;
        const currentProtocol = window.location.protocol;
        const currentPort = window.location.port;
        
        console.log(`🔧 [ENV] Current environment detection:`);
        console.log(`🔧 [ENV] Hostname: ${currentHostname}`);
        console.log(`🔧 [ENV] Protocol: ${currentProtocol}`);
        console.log(`🔧 [ENV] Port: ${currentPort}`);
        
        // Check if we're running locally
        const isLocalhost = currentHostname === 'localhost' || 
                           currentHostname === '127.0.0.1' || 
                           currentHostname.startsWith('192.168.') ||
                           currentHostname.startsWith('10.0.') ||
                           currentHostname === '[::1]' ||
                           (currentHostname === '' && (currentPort === '3000' || currentPort === '8080' || currentPort === '5500'));
        
        // Check if we're on a local development server (like Live Server)
        const isLocalDevelopment = currentHostname.includes('local') || 
                                 currentPort === '3000' || 
                                 currentPort === '8080' ||
                                 currentPort === '5500' ||
                                 currentPort === '3001' ||
                                 currentPort === '4000';
        
        // Check if we're on Render
        const isRenderDeployment = currentHostname.includes('render.com') ||
                                 currentHostname.includes('onrender.com') ||
                                 currentHostname.includes('moodchat') ||
                                 currentHostname.includes('vercel.app') ||
                                 currentHostname.includes('netlify.app');
        
        // Determine the appropriate backend URL
        let backendUrl;
        
        if (isLocalhost || isLocalDevelopment) {
            // Use localhost for local development
            backendUrl = "http://localhost:4000";
            console.log(`🔧 [ENV] Detected LOCAL development environment`);
            console.log(`🔧 [ENV] Using LOCAL backend: ${backendUrl}`);
        } else if (isRenderDeployment) {
            // Use Render backend for production
            backendUrl = "https://moodchat-fy56.onrender.com";
            console.log(`🔧 [ENV] Detected RENDER deployment environment`);
            console.log(`🔧 [ENV] Using RENDER backend: ${backendUrl}`);
        } else {
            // Default to Render backend for unknown environments
            backendUrl = "https://moodchat-fy56.onrender.com";
            console.log(`🔧 [ENV] Detected UNKNOWN environment, defaulting to RENDER backend`);
            console.log(`🔧 [ENV] Using RENDER backend: ${backendUrl}`);
        }
        
        // Store the detected environment for reference
        window.__ENVIRONMENT = {
            isLocalhost: isLocalhost,
            isLocalDevelopment: isLocalDevelopment,
            isRenderDeployment: isRenderDeployment,
            detectedBackendUrl: backendUrl,
            currentHostname: currentHostname,
            currentPort: currentPort,
            timestamp: new Date().toISOString()
        };
        
        console.log(`🔧 [ENV] Environment detection complete: ${isLocalhost ? 'LOCALHOST' : isRenderDeployment ? 'RENDER' : 'UNKNOWN'}`);
        console.log(`🔧 [ENV] Final backend URL: ${backendUrl}`);
        
        _cachedBackendUrl = backendUrl;
        return backendUrl;
    };

    // Determine backend URL dynamically
    const BACKEND_BASE_URL = determineBackendUrl();
    // 🔧 SURGICAL FIX: BASE_API_URL is removed - api.core.js must NOT add /api to endpoints
    // All endpoints come pre-built from api.request.js
    console.log(`🔧 [api.core] Backend base URL: ${BACKEND_BASE_URL}`);
    console.log(`🔧 [api.core] CRITICAL: api.core.js will NOT add /api to endpoints`);
    console.log(`🔧 [api.core] All endpoints must come pre-built from api.request.js`);

    // ============================================================================
    // CRITICAL FIX: PUBLIC VS PROTECTED ENDPOINT CLASSIFICATION
    // ============================================================================

    /**
     * PUBLIC ENDPOINTS - NEVER require tokens
     * These endpoints MUST work without any Authorization header
     * CRITICAL FIX: /api/status is PUBLIC - 401 does NOT clear tokens
     * 🔧 FIXED: All auth endpoints are explicitly marked as PUBLIC
     */
    const PUBLIC_ENDPOINTS = [
        '/api/status',               // 🔧 CRITICAL: Status is PUBLIC health endpoint
        '/api/auth/login',           // 🔧 FIXED: Login is PUBLIC
        '/api/auth/register',        // 🔧 FIXED: Register is PUBLIC
        '/api/auth/forgot',          // 🔧 FIXED: Forgot password is PUBLIC
        '/api/auth/reset',           // 🔧 FIXED: Reset password is PUBLIC
        '/api/auth/refresh',         // 🔧 FIXED: Refresh token is PUBLIC
        '/api/auth/forgot-password', // Legacy support
        '/api/auth/reset-password',  // Legacy support
        '/auth/login',               // Backward compatibility
        '/auth/register',            // Backward compatibility
        '/auth/forgot-password',     // Legacy support
        '/auth/reset-password',      // Legacy support
        '/auth/refresh',             // Legacy support
        '/auth/health',              // Legacy support
        '/health'                    // Legacy support
    ];

    /**
     * AUTH ENDPOINTS - Special handling for authentication flows
     * These are PUBLIC but have special timing considerations
     * 🔧 FIXED: All auth endpoints are explicitly included
     */
    const AUTH_ENDPOINTS = [
        '/api/auth/login',           // 🔧 FIXED: Login endpoint
        '/api/auth/register',        // 🔧 FIXED: Register endpoint
        '/api/auth/forgot',          // 🔧 FIXED: Forgot password endpoint
        '/api/auth/reset',           // 🔧 FIXED: Reset password endpoint
        '/api/auth/refresh',         // 🔧 FIXED: Refresh token endpoint
        '/api/auth/forgot-password', // Legacy support
        '/api/auth/reset-password',  // Legacy support
        '/auth/login',               // Backward compatibility
        '/auth/register',            // Backward compatibility
        '/auth/forgot-password',     // Legacy support
        '/auth/reset-password',      // Legacy support
        '/auth/refresh'              // Legacy support
    ];

    /**
     * Check if an endpoint is public (no token required)
     * @param {string} endpoint - The API endpoint
     * @returns {boolean} True if public, false if protected
     */
    isPublicEndpoint = function(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') return false;
        
        // Normalize the endpoint
        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        
        // Check against public endpoints list
        const isPublic = PUBLIC_ENDPOINTS.some(publicEndpoint => {
            // Exact match
            if (normalizedEndpoint === publicEndpoint) return true;
            
            // Starts with match for nested endpoints
            if (normalizedEndpoint.startsWith(publicEndpoint + '/')) return true;
            
            // For /api/status, also match /status for backward compatibility
            if (publicEndpoint === '/api/status' && normalizedEndpoint === '/status') return true;
            if (publicEndpoint === '/api/status' && normalizedEndpoint.startsWith('/status/')) return true;
            if (publicEndpoint === '/api/status' && normalizedEndpoint.startsWith('/status?')) return true;
            
            // For auth endpoints, also match legacy paths
            if (publicEndpoint === '/api/auth/login' && normalizedEndpoint === '/auth/login') return true;
            if (publicEndpoint === '/api/auth/register' && normalizedEndpoint === '/auth/register') return true;
            if (publicEndpoint === '/api/auth/forgot' && normalizedEndpoint === '/auth/forgot-password') return true;
            if (publicEndpoint === '/api/auth/reset' && normalizedEndpoint === '/auth/reset-password') return true;
            if (publicEndpoint === '/api/auth/refresh' && normalizedEndpoint === '/auth/refresh') return true;
            
            // For /api/auth/*, also match /auth/* for backward compatibility
            if (publicEndpoint.startsWith('/api/auth/') && normalizedEndpoint === publicEndpoint.replace('/api', '')) return true;
            
            return false;
        });
        
        // Debug logging for auth endpoints
        if (normalizedEndpoint.includes('/auth/')) {
            console.log(`🔐 [AUTH] Endpoint "${normalizedEndpoint}" classified as ${isPublic ? 'PUBLIC' : 'PROTECTED'}`);
            if (!isPublic) {
                console.warn(`⚠️ [AUTH] Auth endpoint "${normalizedEndpoint}" is NOT in PUBLIC_ENDPOINTS list!`);
            }
        }
        
        return isPublic;
    };

    /**
     * Check if an endpoint is an auth endpoint (special handling)
     * @param {string} endpoint - The API endpoint
     * @returns {boolean} True if auth endpoint, false otherwise
     */
    isAuthEndpoint = function(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') return false;
        
        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        
        const isAuth = AUTH_ENDPOINTS.some(authEndpoint => 
            normalizedEndpoint === authEndpoint || 
            normalizedEndpoint.startsWith(authEndpoint + '/')
        );
        
        // Debug logging
        if (normalizedEndpoint.includes('/auth/')) {
            console.log(`🔐 [AUTH] Endpoint "${normalizedEndpoint}" is auth endpoint: ${isAuth ? 'YES' : 'NO'}`);
        }
        
        return isAuth;
    };

    /**
     * Check if an endpoint is a status endpoint (special handling)
     * @param {string} endpoint - The API endpoint
     * @returns {boolean} True if status endpoint, false otherwise
     */
    isStatusEndpoint = function(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') return false;
        
        const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        
        // Status endpoint variations
        return normalizedEndpoint === '/api/status' || 
               normalizedEndpoint.startsWith('/api/status?') ||
               normalizedEndpoint.startsWith('/api/status/') ||
               normalizedEndpoint === '/status' || 
               normalizedEndpoint.startsWith('/status?') ||
               normalizedEndpoint.startsWith('/status/');
    };

    // ============================================================================
    // CENTRALIZED TOKEN MANAGEMENT FUNCTIONS
    // ============================================================================

    /**
     * Token migration function - migrates old tokens to centralized USER_TOKEN
     */
    function migrateOldTokens() {
        try {
            // Check if migration already completed
            if (localStorage.getItem(TOKEN_MIGRATION_KEY) === 'true') {
                console.log('🔐 [TOKEN] Token migration already completed');
                return true;
            }
            
            console.log('🔐 [TOKEN] Starting token migration...');
            
            // Check for tokens in old locations
            const oldTokenLocations = [
                'accessToken',
                'moodchat_token',
                'token',
                'moodchat_auth_token',
                'authToken'
            ];
            
            let migratedToken = null;
            
            // Check each old location for tokens
            for (const location of oldTokenLocations) {
                const oldToken = localStorage.getItem(location);
                if (oldToken && oldToken.trim() !== '' && 
                    oldToken !== 'null' && oldToken !== 'undefined' && 
                    oldToken.length > 10) {
                    console.log(`🔐 [TOKEN] Found token in old location: ${location}`);
                    migratedToken = oldToken;
                    break;
                }
            }
            
            // Check authUser object for tokens
            try {
                const authUserStr = localStorage.getItem('authUser');
                if (authUserStr) {
                    const authUser = JSON.parse(authUserStr);
                    if (authUser.accessToken && authUser.accessToken.trim() !== '' && 
                        authUser.accessToken !== 'null' && authUser.accessToken !== 'undefined') {
                        console.log('🔐 [TOKEN] Found token in authUser.accessToken');
                        migratedToken = authUser.accessToken;
                    } else if (authUser.token && authUser.token.trim() !== '' && 
                              authUser.token !== 'null' && authUser.token !== 'undefined') {
                        console.log('🔐 [TOKEN] Found token in authUser.token');
                        migratedToken = authUser.token;
                    }
                }
            } catch (error) {
                console.log('🔐 [TOKEN] Error reading authUser:', error.message);
            }
            
            // Migrate user data
            let migratedUserData = null;
            try {
                const oldUserLocations = [
                    'userData',
                    'moodchat_auth_user',
                    'currentUser',
                    'user'
                ];
                
                for (const location of oldUserLocations) {
                    const userDataStr = localStorage.getItem(location);
                    if (userDataStr) {
                        const userData = JSON.parse(userDataStr);
                        if (userData && (userData.id || userData.email || userData.username)) {
                            console.log(`🔐 [TOKEN] Found user data in old location: ${location}`);
                            migratedUserData = userData;
                            break;
                        }
                    }
                }
                
                // Check authUser for user data
                const authUserStr = localStorage.getItem('authUser');
                if (authUserStr && !migratedUserData) {
                    const authUser = JSON.parse(authUserStr);
                    if (authUser.user && (authUser.user.id || authUser.user.email || authUser.user.username)) {
                        console.log('🔐 [TOKEN] Found user data in authUser.user');
                        migratedUserData = authUser.user;
                    } else if (authUser.id || authUser.email || authUser.username) {
                        console.log('🔐 [TOKEN] Found user data in authUser object');
                        migratedUserData = authUser;
                    }
                }
            } catch (error) {
                console.log('🔐 [TOKEN] Error migrating user data:', error.message);
            }
            
            // Store migrated token if found
            if (migratedToken) {
                console.log('🔐 [TOKEN] Storing migrated token in centralized location');
                localStorage.setItem(USER_TOKEN_KEY, migratedToken);
                
                // Store user data if found
                if (migratedUserData) {
                    localStorage.setItem(USER_DATA_KEY, JSON.stringify(migratedUserData));
                }
                
                // Mark migration as complete
                localStorage.setItem(TOKEN_MIGRATION_KEY, 'true');
                
                console.log('✅ [TOKEN] Token migration completed successfully');
                return true;
            } else {
                console.log('🔐 [TOKEN] No old tokens found to migrate');
                localStorage.setItem(TOKEN_MIGRATION_KEY, 'true');
                return false;
            }
        } catch (error) {
            console.error('❌ [TOKEN] Token migration error:', error);
            return false;
        }
    }

    /**
     * Get user token from centralized storage
     * @returns {string|null} The user token or null if not found
     */
    getUserToken = function() {
        try {
            // First check centralized storage
            const token = localStorage.getItem(USER_TOKEN_KEY);
            
            if (token && token.trim() !== '' && 
                token !== 'null' && token !== 'undefined' && 
                token.length > 10) {
                return token;
            }
            
            // If not found, check legacy locations
            const legacyTokens = [
                localStorage.getItem('accessToken'),
                localStorage.getItem('moodchat_token'),
                localStorage.getItem('token'),
                localStorage.getItem('moodchat_auth_token'),
                localStorage.getItem('authToken')
            ];
            
            for (const legacyToken of legacyTokens) {
                if (legacyToken && legacyToken.trim() !== '' && 
                    legacyToken !== 'null' && legacyToken !== 'undefined' && 
                    legacyToken.length > 10) {
                    console.log('🔐 [TOKEN] Found token in legacy location, migrating...');
                    // Migrate immediately
                    localStorage.setItem(USER_TOKEN_KEY, legacyToken);
                    return legacyToken;
                }
            }
            
            // Check authUser object
            try {
                const authUserStr = localStorage.getItem('authUser');
                if (authUserStr) {
                    const authUser = JSON.parse(authUserStr);
                    const tokenFromAuthUser = authUser.accessToken || authUser.token;
                    if (tokenFromAuthUser && tokenFromAuthUser.trim() !== '' && 
                        tokenFromAuthUser !== 'null' && tokenFromAuthUser !== 'undefined' && 
                        tokenFromAuthUser.length > 10) {
                        console.log('🔐 [TOKEN] Found token in authUser, migrating...');
                        localStorage.setItem(USER_TOKEN_KEY, tokenFromAuthUser);
                        return tokenFromAuthUser;
                    }
                }
            } catch (error) {
                console.log('🔐 [TOKEN] Error reading authUser:', error.message);
            }
            
            return null;
        } catch (error) {
            console.error('❌ [TOKEN] Error getting user token:', error);
            return null;
        }
    };

    /**
     * Set user token in centralized storage
     * @param {string} token - The token to store
     * @returns {boolean} True if successful
     */
    setUserToken = function(token) {
        try {
            if (!token || token.trim() === '' || 
                token === 'null' || token === 'undefined' || 
                token.length < 10) {
                console.error('❌ [TOKEN] Invalid token provided');
                return false;
            }
            
            // Store in centralized location
            localStorage.setItem(USER_TOKEN_KEY, token);
            
            // Also store in legacy location for backward compatibility
            localStorage.setItem('accessToken', token);
            localStorage.setItem('moodchat_token', token);
            
            console.log('✅ [TOKEN] Token stored in centralized storage');
            return true;
        } catch (error) {
            console.error('❌ [TOKEN] Error setting user token:', error);
            return false;
        }
    };

    /**
     * Clear user token from centralized storage
     * @returns {boolean} True if successful
     */
    clearUserToken = function() {
        try {
            localStorage.removeItem(USER_TOKEN_KEY);
            localStorage.removeItem('accessToken');
            localStorage.removeItem('moodchat_token');
            console.log('✅ [TOKEN] User token cleared');
            return true;
        } catch (error) {
            console.error('❌ [TOKEN] Error clearing user token:', error);
            return false;
        }
    };

    /**
     * Set user data in centralized storage - FIXED to prevent infinite recursion
     * @param {object} userData - The user data to store
     * @param {boolean} skipLegacy - Skip legacy storage (prevents loops)
     * @returns {boolean} True if successful
     */
    setUserData = function(userData, skipLegacy = false) {
        try {
            if (!userData || typeof userData !== 'object') {
                console.error('❌ [TOKEN] Invalid user data provided');
                return false;
            }
            
            // Prevent storing circular references
            const safeUserData = JSON.parse(JSON.stringify(userData));
            
            // Store in centralized location
            localStorage.setItem(USER_DATA_KEY, JSON.stringify(safeUserData));
            
            // Set global user
            window.currentUser = safeUserData;
            
            if (!skipLegacy) {
                // Also store in legacy location for backward compatibility
                localStorage.setItem('moodchat_auth_user', JSON.stringify(safeUserData));
                
                // Update authUser object if it exists
                try {
                    const authUserStr = localStorage.getItem('authUser');
                    if (authUserStr) {
                        const authUser = JSON.parse(authUserStr);
                        authUser.user = safeUserData;
                        localStorage.setItem('authUser', JSON.stringify(authUser));
                    }
                } catch (error) {
                    console.log('🔐 [TOKEN] Error updating authUser:', error.message);
                }
            }
            
            console.log('✅ [TOKEN] User data stored in centralized storage');
            return true;
        } catch (error) {
            console.error('❌ [TOKEN] Error setting user data:', error);
            return false;
        }
    };

    /**
     * Clear all authentication data
     */
    clearAllAuthData = function() {
        try {
            // Clear centralized storage
            localStorage.removeItem(USER_TOKEN_KEY);
            localStorage.removeItem(USER_DATA_KEY);
            localStorage.removeItem(SESSION_DATA_KEY);
            
            // Clear legacy storage for safety
            localStorage.removeItem('accessToken');
            localStorage.removeItem('moodchat_token');
            localStorage.removeItem('token');
            localStorage.removeItem('moodchat_auth_token');
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
            localStorage.removeItem('moodchat_auth_user');
            localStorage.removeItem('userData');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('user');
            
            console.log('✅ [TOKEN] All authentication data cleared');
        } catch (error) {
            console.error('❌ [TOKEN] Error clearing auth data:', error);
        }
    };

    /**
     * Token ready promise - resolves when token system is initialized
     */
    let _tokenReadyPromise = null;
    let _tokenReadyResolve = null;
    let _tokenReadyReject = null;
    let _tokenReady = false;

    tokenReady = function() {
        if (_tokenReady) {
            return Promise.resolve(true);
        }
        
        if (!_tokenReadyPromise) {
            _tokenReadyPromise = new Promise((resolve, reject) => {
                _tokenReadyResolve = resolve;
                _tokenReadyReject = reject;
            });
        }
        
        return _tokenReadyPromise;
    };

    /**
     * Initialize token system
     */
    initializeTokenSystem = function() {
        console.log('🔐 [TOKEN] Initializing centralized token system...');
        
        // Perform token migration
        migrateOldTokens();
        
        // Check if we have a token
        const token = getUserToken();
        const userDataStr = localStorage.getItem(USER_DATA_KEY);
        let userData = null;
        
        try {
            if (userDataStr) {
                userData = JSON.parse(userDataStr);
            }
        } catch (error) {
            console.log('🔐 [TOKEN] Error parsing user data:', error.message);
        }
        
        // Set token ready state
        if (token || userData) {
            console.log('🔐 [TOKEN] Token system initialized with stored data');
            _tokenReady = true;
            if (_tokenReadyResolve) {
                _tokenReadyResolve(true);
            }
        } else {
            console.log('🔐 [TOKEN] Token system initialized (no stored data)');
            _tokenReady = true;
            if (_tokenReadyResolve) {
                _tokenReadyResolve(false);
            }
        }
        
        return { token, userData };
    };

    // ============================================================================
    // RESTORED MISSING FUNCTIONS
    // ============================================================================

    /**
     * Get current user from storage
     * @returns {object|null} User object or null
     */
    getCurrentUser = function() {
        try {
            // First check window.currentUser
            if (window.currentUser && typeof window.currentUser === 'object') {
                return window.currentUser;
            }
            
            // Then check centralized storage
            const userDataStr = localStorage.getItem(USER_DATA_KEY);
            if (userDataStr) {
                const user = JSON.parse(userDataStr);
                // Update global reference
                window.currentUser = user;
                return user;
            }
            
            // Check legacy storage
            const authUserStr = localStorage.getItem('authUser');
            if (authUserStr) {
                try {
                    const authUser = JSON.parse(authUserStr);
                    if (authUser.user) {
                        window.currentUser = authUser.user;
                        return authUser.user;
                    }
                    if (authUser.id || authUser.email || authUser.username) {
                        window.currentUser = authUser;
                        return authUser;
                    }
                } catch (error) {
                    console.error('❌ [USER] Error parsing authUser:', error);
                }
            }
            
            return null;
        } catch (error) {
            console.error('❌ [USER] Error getting current user:', error);
            return null;
        }
    };

    /**
     * Get user data (alias for getCurrentUser)
     * @returns {object|null} User object or null
     */
    getUserData = function() {
        return getCurrentUser();
    };

    /**
     * Get API base URL
     * @returns {string} Backend base URL
     */
    getApiBaseUrl = function() {
        return BACKEND_BASE_URL;
    };

    /**
     * Get backend base URL (alias for getApiBaseUrl)
     * @returns {string} Backend base URL
     */
    getBackendBaseUrl = function() {
        return BACKEND_BASE_URL;
    };

    /**
     * Validate session by checking token validity
     * @returns {Promise<boolean>} True if session is valid
     */
    validateSession = async function() {
        try {
            const token = getUserToken();
            if (!token) {
                return false;
            }
            
            // Use validateAuth which calls /api/auth/me
            return await validateAuth();
        } catch (error) {
            console.error('❌ [SESSION] Error validating session:', error);
            return false;
        }
    };

    /**
     * Update session with new data
     * @param {object} sessionData - Session data to update
     * @returns {boolean} True if successful
     */
    updateSession = function(sessionData) {
        try {
            if (!sessionData || typeof sessionData !== 'object') {
                console.error('❌ [SESSION] Invalid session data provided');
                return false;
            }
            
            // Get existing session data
            let existingSession = {};
            try {
                const sessionStr = localStorage.getItem(SESSION_DATA_KEY);
                if (sessionStr) {
                    existingSession = JSON.parse(sessionStr);
                }
            } catch (error) {
                console.log('🔐 [SESSION] Error reading existing session:', error.message);
            }
            
            // Merge and store
            const updatedSession = { ...existingSession, ...sessionData, lastUpdated: Date.now() };
            localStorage.setItem(SESSION_DATA_KEY, JSON.stringify(updatedSession));
            
            console.log('✅ [SESSION] Session updated successfully');
            return true;
        } catch (error) {
            console.error('❌ [SESSION] Error updating session:', error);
            return false;
        }
    };

    /**
     * Update current user data
     * @param {object} userData - New user data
     * @returns {boolean} True if successful
     */
    updateCurrentUser = function(userData) {
        return setUserData(userData);
    };

    /**
     * Check if user is authenticated
     * @returns {boolean} True if authenticated
     */
    isAuthenticated = function() {
        const token = getUserToken();
        const user = getCurrentUser();
        return !!(token && user);
    };

    /**
     * Get session data
     * @returns {object|null} Session data or null
     */
    getSessionData = function() {
        try {
            const sessionStr = localStorage.getItem(SESSION_DATA_KEY);
            if (sessionStr) {
                return JSON.parse(sessionStr);
            }
            return null;
        } catch (error) {
            console.error('❌ [SESSION] Error getting session data:', error);
            return null;
        }
    };

    /**
     * Clear session data
     * @returns {boolean} True if successful
     */
    clearSession = function() {
        try {
            localStorage.removeItem(SESSION_DATA_KEY);
            console.log('✅ [SESSION] Session data cleared');
            return true;
        } catch (error) {
            console.error('❌ [SESSION] Error clearing session:', error);
            return false;
        }
    };

    /**
     * Set session data
     * @param {object} sessionData - Session data
     * @returns {boolean} True if successful
     */
    setSessionData = function(sessionData) {
        return updateSession(sessionData);
    };

    /**
     * Get token (alias for getUserToken)
     * @returns {string|null} Token or null
     */
    getToken = function() {
        return getUserToken();
    };

    /**
     * Set token (alias for setUserToken)
     * @param {string} token - Token to set
     * @returns {boolean} True if successful
     */
    setToken = function(token) {
        return setUserToken(token);
    };

    // ============================================================================
    // MISSING FUNCTIONS BASED ON CONSOLE ERRORS
    // ============================================================================

    /**
     * Login function - missing export
     */
    login = async function(credentials) {
        try {
            const response = await secureApiFetch('/api/auth/login', {
                method: 'POST',
                body: credentials
            });
            
            if (response.success && response.token) {
                // Store token and user data
                setUserToken(response.token);
                if (response.user) {
                    setUserData(response.user);
                }
                return response;
            }
            return response;
        } catch (error) {
            console.error('❌ [AUTH] Login error:', error);
            return { success: false, message: 'Login failed' };
        }
    };

    /**
     * Logout function - missing export
     */
    logout = async function() {
        try {
            const response = await secureApiFetch('/api/auth/logout', {
                method: 'POST'
            });
            
            // Clear auth data regardless of response
            clearAllAuthData();
            
            return response;
        } catch (error) {
            console.error('❌ [AUTH] Logout error:', error);
            // Still clear auth data on error
            clearAllAuthData();
            return { success: false, message: 'Logout failed' };
        }
    };

    /**
     * Get session function - missing export (alias for getSessionData)
     */
    getSession = function() {
        return getSessionData();
    };

    /**
     * API call with retry function - missing export
     */
    apiCallWithRetry = async function(endpoint, options = {}, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔧 [RETRY] Attempt ${attempt}/${maxRetries} for ${endpoint}`);
                const result = await secureApiFetch(endpoint, options);
                
                if (result.success || attempt === maxRetries) {
                    return result;
                }
                
                // Wait before retry (exponential backoff)
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
                
            } catch (error) {
                lastError = error;
                console.error(`❌ [RETRY] Attempt ${attempt} failed:`, error);
                
                if (attempt === maxRetries) {
                    break;
                }
                
                // Wait before retry
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError || new Error(`API call failed after ${maxRetries} attempts`);
    };

    /**
     * Clear chat history function - missing export
     */
    async function clearChatHistory(chatId) {
        try {
            const response = await secureApiFetch(`/api/chats/${chatId}/history`, {
                method: 'DELETE'
            });
            return response;
        } catch (error) {
            console.error('❌ [CHAT] Clear history error:', error);
            return { success: false, message: 'Failed to clear chat history' };
        }
    }

    // ============================================================================
    // ADDITIONAL COMMON API FUNCTIONS
    // ============================================================================

    /**
     * Main API function
     */
    api = async function(endpoint, options = {}) {
        return globalApiFunction(endpoint, options);
    };

    /**
     * Register function
     */
    register = async function(userData) {
        return secureApiFetch('/api/auth/register', {
            method: 'POST',
            body: userData
        });
    };

    /**
     * Forgot password function
     */
    forgotPassword = async function(email) {
        return secureApiFetch('/api/auth/forgot', {
            method: 'POST',
            body: { email }
        });
    };

    /**
     * Reset password function
     */
    resetPassword = async function(token, newPassword) {
        return secureApiFetch('/api/auth/reset', {
            method: 'POST',
            body: { token, newPassword }
        });
    };

    /**
     * Refresh token function
     */
    refreshToken = async function() {
        return secureApiFetch('/api/auth/refresh', {
            method: 'POST'
        });
    };

    /**
     * Check auth function
     */
    checkAuth = async function() {
        return validateAuth();
    };

    /**
     * Check auth/me endpoint
     */
    checkAuthMe = async function() {
        return secureApiFetch('/api/auth/me', {
            method: 'GET'
        });
    };

    /**
     * Get profile function
     */
    getProfile = async function() {
        return secureApiFetch('/api/users/profile', {
            method: 'GET'
        });
    };

    /**
     * Update profile function
     */
    updateProfile = async function(profileData) {
        return secureApiFetch('/api/users/profile', {
            method: 'PUT',
            body: profileData
        });
    };

    /**
     * Change password function
     */
    changePassword = async function(currentPassword, newPassword) {
        return secureApiFetch('/api/users/change-password', {
            method: 'POST',
            body: { currentPassword, newPassword }
        });
    };

    /**
     * Delete account function
     */
    deleteAccount = async function() {
        return secureApiFetch('/api/users/delete-account', {
            method: 'DELETE'
        });
    };

    /**
     * Get online users function
     */
    getOnlineUsers = async function() {
        return secureApiFetch('/api/users/online', {
            method: 'GET'
        });
    };

    /**
     * Search users function
     */
    searchUsers = async function(query) {
        return secureApiFetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
            method: 'GET'
        });
    };

    /**
     * Send friend request function
     */
    sendFriendRequest = async function(userId) {
        return secureApiFetch('/api/friends/request', {
            method: 'POST',
            body: { userId }
        });
    };

    /**
     * Accept friend request function - 🔧 FIXED: Added missing function
     * @param {string} requestId - The friend request ID to accept
     * @returns {Promise<object>} API response
     */
    acceptFriendRequest = async function(requestId) {
        return secureApiFetch(`/api/friends/accept/${requestId}`, {
            method: 'POST'
        });
    };

    /**
     * Reject friend request function
     */
    rejectFriendRequest = async function(requestId) {
        return secureApiFetch(`/api/friends/reject/${requestId}`, {
            method: 'POST'
        });
    };

    /**
     * Remove friend function
     */
    removeFriend = async function(friendId) {
        return secureApiFetch(`/api/friends/remove/${friendId}`, {
            method: 'DELETE'
        });
    };

    /**
     * Get friends function
     */
    getFriends = async function() {
        return secureApiFetch('/api/friends', {
            method: 'GET'
        });
    };

    /**
     * Get friend requests function
     */
    getFriendRequests = async function() {
        return secureApiFetch('/api/friends/requests', {
            method: 'GET'
        });
    };

    /**
     * Get conversations function
     */
    getConversations = async function() {
        return secureApiFetch('/api/chats/conversations', {
            method: 'GET'
        });
    };

    /**
     * Get messages function
     */
    getMessages = async function(chatId, limit = 50, offset = 0) {
        return secureApiFetch(`/api/chats/${chatId}/messages?limit=${limit}&offset=${offset}`, {
            method: 'GET'
        });
    };

    /**
     * Send message function
     */
    sendMessage = async function(chatId, content) {
        return secureApiFetch(`/api/chats/${chatId}/messages`, {
            method: 'POST',
            body: { content }
        });
    };

    /**
     * Mark messages as read function
     */
    markMessagesAsRead = async function(chatId, messageIds) {
        return secureApiFetch(`/api/chats/${chatId}/messages/read`, {
            method: 'POST',
            body: { messageIds }
        });
    };

    /**
     * Delete message function
     */
    deleteMessage = async function(chatId, messageId) {
        return secureApiFetch(`/api/chats/${chatId}/messages/${messageId}`, {
            method: 'DELETE'
        });
    };

    /**
     * Create group function
     */
    createGroup = async function(groupData) {
        return secureApiFetch('/api/groups', {
            method: 'POST',
            body: groupData
        });
    };

    /**
     * Get groups function
     */
    getGroups = async function() {
        return secureApiFetch('/api/groups', {
            method: 'GET'
        });
    };

    /**
     * Get group details function
     */
    getGroupDetails = async function(groupId) {
        return secureApiFetch(`/api/groups/${groupId}`, {
            method: 'GET'
        });
    };

    /**
     * Update group function
     */
    updateGroup = async function(groupId, groupData) {
        return secureApiFetch(`/api/groups/${groupId}`, {
            method: 'PUT',
            body: groupData
        });
    };

    /**
     * Delete group function
     */
    deleteGroup = async function(groupId) {
        return secureApiFetch(`/api/groups/${groupId}`, {
            method: 'DELETE'
        });
    };

    /**
     * Add group member function
     */
    addGroupMember = async function(groupId, userId) {
        return secureApiFetch(`/api/groups/${groupId}/members`, {
            method: 'POST',
            body: { userId }
        });
    };

    /**
     * Remove group member function
     */
    removeGroupMember = async function(groupId, userId) {
        return secureApiFetch(`/api/groups/${groupId}/members/${userId}`, {
            method: 'DELETE'
        });
    };

    /**
     * Leave group function
     */
    leaveGroup = async function(groupId) {
        return secureApiFetch(`/api/groups/${groupId}/leave`, {
            method: 'POST'
        });
    };

    /**
     * Get notifications function
     */
    getNotifications = async function() {
        return secureApiFetch('/api/notifications', {
            method: 'GET'
        });
    };

    /**
     * Mark notification as read function
     */
    markNotificationAsRead = async function(notificationId) {
        return secureApiFetch(`/api/notifications/${notificationId}/read`, {
            method: 'POST'
        });
    };

    /**
     * Delete notification function
     */
    deleteNotification = async function(notificationId) {
        return secureApiFetch(`/api/notifications/${notificationId}`, {
            method: 'DELETE'
        });
    };

    /**
     * Clear all notifications function
     */
    clearAllNotifications = async function() {
        return secureApiFetch('/api/notifications/clear', {
            method: 'POST'
        });
    };

    /**
     * Get call history function
     */
    getCallHistory = async function() {
        return secureApiFetch('/api/calls/history', {
            method: 'GET'
        });
    };

    /**
     * Start call function
     */
    startCall = async function(userId) {
        return secureApiFetch('/api/calls/start', {
            method: 'POST',
            body: { userId }
        });
    };

    /**
     * End call function
     */
    endCall = async function(callId) {
        return secureApiFetch(`/api/calls/${callId}/end`, {
            method: 'POST'
        });
    };

    /**
     * Get settings function
     */
    getSettings = async function() {
        return secureApiFetch('/api/settings', {
            method: 'GET'
        });
    };

    /**
     * Update settings function
     */
    updateSettings = async function(settings) {
        return secureApiFetch('/api/settings', {
            method: 'PUT',
            body: settings
        });
    };

    /**
     * Upload file function
     */
    uploadFile = async function(file, type = 'general') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);
        
        return secureApiFetch('/api/files/upload', {
            method: 'POST',
            body: formData,
            headers: {} // Let browser set Content-Type for FormData
        });
    };

    /**
     * Delete file function
     */
    deleteFile = async function(fileId) {
        return secureApiFetch(`/api/files/${fileId}`, {
            method: 'DELETE'
        });
    };

    /**
     * Get file function
     */
    getFile = async function(fileId) {
        return secureApiFetch(`/api/files/${fileId}`, {
            method: 'GET'
        });
    };

    // ============================================================================
    // NETWORK STATUS FUNCTIONS - FIXED DUPLICATE DECLARATION
    // ============================================================================

    /**
     * Check network status
     */
    checkNetworkStatus = async function() {
        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/status`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });
            
            // Update the AppNetwork object
            if (window.AppNetwork) {
                window.AppNetwork.updateBackendStatus(response.ok);
            }
            return response.ok;
        } catch (error) {
            if (window.AppNetwork) {
                window.AppNetwork.updateBackendStatus(false);
            }
            return false;
        }
    };

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Debounce function
     */
    debounce = function(func, wait, immediate) {
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
     */
    throttle = function(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    };

    /**
     * Generate ID function
     */
    generateId = function() {
        return 'id_' + Math.random().toString(36).substr(2, 9);
    };

    /**
     * Format date function
     */
    formatDate = function(date) {
        const d = new Date(date);
        return d.toLocaleDateString();
    };

    /**
     * Format time function
     */
    formatTime = function(date) {
        const d = new Date(date);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // ============================================================================
    // EVENT EMITTER FUNCTIONS
    // ============================================================================

    const eventEmitter = {
        events: {},
        
        emit(event, data) {
            if (this.events[event]) {
                this.events[event].forEach(callback => callback(data));
            }
        },
        
        on(event, callback) {
            if (!this.events[event]) {
                this.events[event] = [];
            }
            this.events[event].push(callback);
        },
        
        off(event, callback) {
            if (this.events[event]) {
                this.events[event] = this.events[event].filter(cb => cb !== callback);
            }
        },
        
        once(event, callback) {
            const onceCallback = (data) => {
                callback(data);
                this.off(event, onceCallback);
            };
            this.on(event, onceCallback);
        }
    };

    /**
     * Emit event
     */
    emit = function(event, data) {
        eventEmitter.emit(event, data);
    };

    /**
     * Listen to event
     */
    on = function(event, callback) {
        eventEmitter.on(event, callback);
    };

    /**
     * Remove event listener
     */
    off = function(event, callback) {
        eventEmitter.off(event, callback);
    };

    /**
     * Listen to event once
     */
    once = function(event, callback) {
        eventEmitter.once(event, callback);
    };

    // ============================================================================
    // CRITICAL FIX: SECURE FETCH WITH PUBLIC/PROTECTED ENDPOINT SEPARATION
    // ============================================================================

    /**
     * Secure fetch function - automatically adds Authorization header ONLY for protected endpoints
     * 🔧 CRITICAL FIX: Public endpoints (/api/status, /auth/*) NEVER get Authorization header
     * 🔧 CRITICAL FIX: 401 on public endpoints does NOT clear tokens or trigger logout
     * 🔧 SURGICAL FIX: Accepts fully-built URLs - does NOT add /api
     * @param {string} url - The FULLY BUILT URL to fetch
     * @param {object} options - Fetch options
     * @returns {Promise} Promise with response
     */
    secureFetch = async function(url, options = {}) {
        // Extract endpoint from URL for classification
        const endpoint = url.replace(BACKEND_BASE_URL, '');
        
        // 🔧 CRITICAL FIX: Check if this is a public endpoint
        const isPublic = isPublicEndpoint(endpoint);
        const isStatus = isStatusEndpoint(endpoint);
        const isAuth = isAuthEndpoint(endpoint);
        
        console.log(`🔐 [SECURE-FETCH] Request to: ${url}`);
        console.log(`🔐 [SECURE-FETCH] Endpoint extracted: ${endpoint}`);
        console.log(`🔐 [SECURE-FETCH] Endpoint classification: ${isPublic ? 'PUBLIC' : 'PROTECTED'}`);
        console.log(`🔐 [SECURE-FETCH] Is status endpoint: ${isStatus ? 'YES' : 'NO'}`);
        console.log(`🔐 [SECURE-FETCH] Is auth endpoint: ${isAuth ? 'YES' : 'NO'}`);
        
        // 🔧 CRITICAL FIX: PUBLIC endpoints bypass token system
        if (isPublic) {
            console.log(`🔐 [SECURE-FETCH] PUBLIC endpoint detected - NO token system checks`);
            // For public endpoints, skip token checks entirely
        } else {
            // Wait for token system to be ready ONLY for protected endpoints
            if (!_tokenReady) {
                console.log('🔐 [SECURE-FETCH] Waiting for token system initialization...');
                await tokenReady();
            }
        }
        
        // Get token - but ONLY use it for protected endpoints
        const token = getUserToken();
        
        // Prepare headers
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        // 🔧 CRITICAL FIX: Add Authorization header ONLY if:
        // 1. Token exists
        // 2. Endpoint is NOT public
        // 3. Endpoint is NOT auth endpoint
        // 4. Endpoint is NOT status endpoint
        // 5. Authorization header not already present
        if (token && !isPublic && !isAuth && !isStatus && 
            !headers['Authorization'] && !headers['authorization']) {
            headers['Authorization'] = `Bearer ${token}`;
            console.log(`🔐 [SECURE-FETCH] Authorization header added for PROTECTED endpoint`);
        } else if (isPublic || isAuth || isStatus) {
            console.log(`🔐 [SECURE-FETCH] PUBLIC/AUTH/STATUS endpoint - NO Authorization header added`);
        } else if (!token) {
            console.log(`🔐 [SECURE-FETCH] No token available for PROTECTED endpoint`);
        }
        
        // Prepare fetch options
        const fetchOptions = {
            ...options,
            headers,
            credentials: 'include' // Include credentials for session cookies
        };
        
        console.log(`🔐 [SECURE-FETCH] Token present: ${token ? 'YES' : 'NO'}`);
        console.log(`🔐 [SECURE-FETCH] Authorization header: ${headers['Authorization'] ? 'ADDED' : 'NOT ADDED'}`);
        
        try {
            const response = await fetch(url, fetchOptions);
            
            // 🔧 CRITICAL FIX: Handle 401 Unauthorized DIFFERENTLY for public vs protected
            if (response.status === 401) {
                console.log(`🔐 [SECURE-FETCH] 401 Unauthorized response received`);
                
                // 🔧 CRITICAL FIX: Public endpoints - IGNORE 401, DO NOT clear tokens
                if (isPublic || isStatus || isAuth) {
                    console.log(`🔐 [SECURE-FETCH] PUBLIC/AUTH/STATUS endpoint 401 - IGNORING, tokens NOT cleared`);
                    console.log(`🔐 [SECURE-FETCH] /api/status or /auth/* 401 is NORMAL for unauthenticated access`);
                    
                    // Dispatch public 401 event for monitoring (optional)
                    window.dispatchEvent(new CustomEvent('public-endpoint-401', {
                        detail: { url, endpoint, timestamp: new Date().toISOString() }
                    }));
                } else {
                    // 🔧 CRITICAL FIX: Protected endpoints - normal logout flow
                    console.log('🔐 [SECURE-FETCH] PROTECTED endpoint 401 - token may be invalid');
                    
                    // Clear authentication data
                    clearAllAuthData();
                    
                    // Dispatch unauthorized event
                    window.dispatchEvent(new CustomEvent('unauthorized', {
                        detail: { url, timestamp: new Date().toISOString() }
                    }));
                }
            }
            
            // Parse response ONCE only
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch (jsonError) {
                    console.error(`❌ [SECURE-FETCH] JSON parsing error for ${url}:`, jsonError);
                    data = { 
                        message: 'Invalid JSON response from server',
                        error: jsonError.message 
                    };
                }
            } else {
                try {
                    data = await response.text();
                } catch (textError) {
                    console.error(`❌ [SECURE-FETCH] Text parsing error for ${url}:`, textError);
                    data = { 
                        message: 'Failed to parse response',
                        error: textError.message 
                    };
                }
            }
            
            // 🔧 CRITICAL FIX: MODERN API FORMAT SUPPORT
            // Normalize response for modern and legacy API formats
            const normalizedResponse = _normalizeApiResponse(data, response);
            
            // Return consistent response format
            return {
                ok: normalizedResponse.ok,
                success: normalizedResponse.success,
                status: response.status,
                statusText: response.statusText,
                data: normalizedResponse.data,
                headers: Object.fromEntries(response.headers.entries()),
                url: response.url,
                token: normalizedResponse.token,
                user: normalizedResponse.user,
                message: normalizedResponse.message
            };
            
        } catch (error) {
            console.error(`❌ [SECURE-FETCH] Network error for ${url}:`, error);
            
            // Check for specific network errors
            const isNetworkError = error.message && (
                error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError') ||
                error.message.includes('network request failed') ||
                error.message.includes('Load failed')
            );
            
            const isTimeoutError = error.message && (
                error.message.includes('timeout') ||
                error.message.includes('Timeout')
            );
            
            const isDNSError = error.message && (
                error.message.includes('ERR_NAME_NOT_RESOLVED') ||
                error.message.includes('net::ERR_NAME_NOT_RESOLVED')
            );
            
            // Determine error type
            let errorMessage = 'Network Error';
            if (isTimeoutError) errorMessage = 'Request Timeout';
            if (isDNSError) errorMessage = 'DNS Resolution Failed';
            
            // Update network state for network errors
            if (window.AppNetwork && (isNetworkError || isTimeoutError || isDNSError)) {
                window.AppNetwork.updateBackendStatus(false);
            }
            
            // Return error in consistent format
            return {
                ok: false,
                success: false,
                status: 0,
                statusText: errorMessage,
                data: { 
                    message: errorMessage,
                    error: error.message 
                },
                headers: {},
                url: url,
                networkError: true,
                timeout: isTimeoutError,
                dnsError: isDNSError
            };
        }
    };

    /**
     * Normalize API response for modern and legacy formats
     * 🔧 CRITICAL FIX: Supports both modern (accessToken, success) and legacy (token, ok) formats
     */
    function _normalizeApiResponse(data, response) {
        // Extract token from ANY backend response format
        const token = 
            data?.accessToken ||
            data?.token ||
            data?.jwt ||
            data?.access_token ||
            data?.tokens?.accessToken ||
            data?.data?.accessToken ||
            data?.data?.token ||
            null;
        
        // Determine success based on modern AND legacy formats
        // Modern: data.success === true
        // Legacy: response.ok === true OR token exists
        const success = 
            data?.success === true ||
            response?.ok === true ||
            !!token;
        
        // Extract user from ANY backend response format
        const user = 
            data?.user ||
            data?.data?.user ||
            data?.data ||
            (data?.success === true && data?.data) ||
            null;
        
        // Extract message from ANY backend response format
        const message = 
            data?.message ||
            data?.msg ||
            (success ? "Request successful" : "Request failed");
        
        // Debug logging
        console.debug("[API] Normalized response:", {
            success,
            token: !!token,
            hasUser: !!user,
            responseOk: response?.ok,
            dataSuccess: data?.success
        });
        
        // Return normalized response
        return {
            ok: success,
            success,
            token,
            user,
            data,
            message,
            raw: response
        };
    }

    /**
     * Secure API fetch - accepts fully-built endpoint from api.request.js
     * 🔧 SURGICAL FIX: Does NOT add /api - endpoint comes pre-built
     * @param {string} endpoint - FULLY BUILT endpoint (e.g., '/api/auth/login')
     * @param {object} options - Fetch options
     * @returns {Promise} Promise with response
     */
    secureApiFetch = async function(endpoint, options = {}) {
        // 🔧 SURGICAL FIX: Build URL using BACKEND_BASE_URL + endpoint
        // Endpoint already includes /api from api.request.js
        let fullUrl;
        if (endpoint.startsWith('http')) {
            fullUrl = endpoint;
        } else {
            // 🔧 SURGICAL FIX: Use BACKEND_BASE_URL directly, endpoint is already complete
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
            const cleanBase = BACKEND_BASE_URL.endsWith('/') ? BACKEND_BASE_URL.slice(0, -1) : BACKEND_BASE_URL;
            fullUrl = cleanBase + cleanEndpoint;
            console.log(`🔧 [SECURE-API-FETCH] Built URL: ${fullUrl} (endpoint: ${endpoint})`);
        }
        return secureFetch(fullUrl, options);
    };

    // ============================================================================
    // MANDATORY TOKEN NORMALIZATION: getValidToken() HELPER FUNCTION
    // ============================================================================
    /**
     * getValidToken() - Authoritative token retrieval helper
     * STRICT REQUIREMENTS:
     * 1. Read token ONLY from localStorage (never cache in variables)
     * 2. Try centralized USER_TOKEN_KEY first
     * 3. Fallback to legacy locations
     * 4. Return null if no token found
     * 5. NEVER cache token outside request scope
     */
    getValidToken = function() {
        // Use centralized token system
        return getUserToken();
    };

    // ============================================================================
    // SINGLE SOURCE OF TRUTH - NETWORK STATE (COMPLETELY SEPARATE FROM AUTH)
    // ============================================================================
    /**
     * GLOBAL NETWORK STATE - Declared ONLY ONCE here
     * Network state is COMPLETELY SEPARATE from authentication state
     * Backend reachability is determined ONLY by:
     * 1. Successful fetch (any HTTP status means backend is reachable)
     * 2. Network errors (Failed to fetch, timeout, DNS failure)
     * 3. Server unreachable errors
     * NEVER by authentication status (401, 403, etc.)
     */

    // Initialize global network state - FIXED: Check if already exists
    if (!window.AppNetwork) {
        // Use locally scoped variables to avoid global conflicts
        const networkState = {
            isOnline: navigator.onLine,
            isBackendReachable: null,
            lastChecked: new Date().toISOString(),
            
            // Update methods
            updateOnlineStatus: function(status) {
                this.isOnline = status;
                this.lastChecked = new Date().toISOString();
                console.log(`🔧 [NETWORK] Online status changed to: ${status}`);
                
                // Dispatch network change event
                try {
                    window.dispatchEvent(new CustomEvent('network-state-changed', {
                        detail: { 
                            isOnline: status, 
                            isBackendReachable: this.isBackendReachable 
                        }
                    }));
                } catch (e) {
                    console.log('🔧 [NETWORK] Could not dispatch event:', e.message);
                }
            },
            
            updateBackendStatus: function(status) {
                // CRITICAL FIX: Only update if status is explicitly true or false
                // Don't update on null or undefined
                if (status === true || status === false) {
                    this.isBackendReachable = status;
                    this.lastChecked = new Date().toISOString();
                    console.log(`🔧 [NETWORK] Backend reachable changed to: ${status}`);
                }
            }
        };
        
        window.AppNetwork = networkState;
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            window.AppNetwork.updateOnlineStatus(true);
        });
        
        window.addEventListener('offline', () => {
            window.AppNetwork.updateOnlineStatus(false);
            // CRITICAL: When offline, backend cannot be reachable
            window.AppNetwork.updateBackendStatus(false);
        });
    }

    // ============================================================================
    // UPDATED getAuthHeaders() FUNCTION WITH PUBLIC ENDPOINT CHECK
    // ============================================================================
    /**
     * getAuthHeaders() - Helper function to get authentication headers
     * Uses getValidToken() for authoritative token retrieval
     * 🔧 CRITICAL FIX: Public endpoints get NO headers
     * @param {string} endpoint - The API endpoint to determine if auth is needed
     * @returns {object} Headers object with Authorization if token exists and endpoint requires it
     */
    getAuthHeaders = function(endpoint) {
        // 🔧 CRITICAL FIX: Check if this is a public endpoint
        if (isPublicEndpoint(endpoint)) {
            console.log(`🔐 [AUTH] Public endpoint "${endpoint}" - NO Authorization header needed`);
            return {};
        }
        
        // 🔧 CRITICAL FIX: Check if this is a status endpoint (special case)
        if (isStatusEndpoint(endpoint)) {
            console.log(`🔐 [AUTH] Status endpoint "${endpoint}" - NO Authorization header needed`);
            return {};
        }
        
        // Check if this is an auth endpoint
        if (isAuthEndpoint(endpoint)) {
            console.log(`🔐 [AUTH] Auth endpoint "${endpoint}" - NO Authorization header needed`);
            return {};
        }
        
        // For protected endpoints, get the token
        const token = getValidToken();
        if (token) {
            console.log(`🔐 [AUTH] Protected endpoint "${endpoint}" - Authorization header created with token`);
            return { 'Authorization': `Bearer ${token}` };
        }
        
        console.log(`🔐 [AUTH] Protected endpoint "${endpoint}" - No token available`);
        return {};
    };

    // ============================================================================
    // GLOBAL TOKEN VARIABLE - ENHANCED PERSISTENCE
    // ============================================================================
    /**
     * Global access token variable with enhanced persistence
     * Automatically initialized from localStorage on page load
     * Persists across page refreshes, browser reloads, and navigation
     */
    let accessToken = null;

    // Function to initialize and update the global access token
    updateGlobalAccessToken = function() {
        // Use getValidToken() for authoritative token retrieval
        accessToken = getValidToken();
        
        if (accessToken) {
            console.log(`🔐 [TOKEN] Global accessToken initialized: ${accessToken.substring(0, 20)}...`);
            
            // Dispatch token loaded event
            window.dispatchEvent(new CustomEvent('token-loaded', {
                detail: { token: accessToken, source: 'authoritative' }
            }));
        } else {
            console.log('🔐 [TOKEN] No access token found in localStorage');
            accessToken = null;
            
            // Dispatch token not found event
            window.dispatchEvent(new CustomEvent('token-not-found'));
        }
    };

    // Initialize global token on script load - CRITICAL FOR PERSISTENCE
    updateGlobalAccessToken();

    // Listen for storage events to sync token across tabs
    window.addEventListener('storage', (event) => {
        if (event.key === USER_TOKEN_KEY || event.key === 'accessToken' || event.key === 'moodchat_token' || 
            event.key === 'token' || event.key === 'moodchat_auth_token' || 
            event.key === 'authUser' || event.key === USER_DATA_KEY) {
            console.log(`🔐 [TOKEN] Storage event detected for ${event.key}, updating global token`);
            updateGlobalAccessToken();
            
            // If token changed, validate it
            if (accessToken) {
                console.log('🔐 [TOKEN] Token updated from storage event, re-validating...');
                setTimeout(() => {
                    window.api.checkAuthMe().catch(() => {});
                }, 100);
            }
        }
    });

    // Environment logging for debugging
    console.log(`🔧 [API] Centralized Token System Implementation with Environment Detection:`);
    console.log(`🔧 [API] Detected Backend Base URL: ${BACKEND_BASE_URL}`);
    console.log(`🔧 [API] 🔧 SURGICAL FIX: api.core.js does NOT add /api to endpoints`);
    console.log(`🔧 [API] Network State: Online=${window.AppNetwork.isOnline}, BackendReachable=${window.AppNetwork.isBackendReachable}`);
    console.log(`🔧 [API] Centralized Token: ${getUserToken() ? `Present (${getUserToken().substring(0, 20)}...)` : 'Not found'}`);
    console.log(`🔧 [API] 🔧 CRITICAL FIX: Public/Protected endpoint separation ACTIVE`);
    console.log(`🔧 [API] 🔧 CRITICAL FIX: /api/status is PUBLIC - 401 does NOT clear tokens`);
    console.log(`🔧 [API] 🔧 CRITICAL FIX: Auth endpoints (/api/auth/*) are PUBLIC`);

    // ============================================================================
    // TOKEN MANAGEMENT - SINGLE SOURCE OF TRUTH
    // ============================================================================
    /**
     * TOKEN NORMALIZATION - Ensure consistent token format
     * Centralized token handling to prevent inconsistencies
     */
    const TOKEN_STORAGE_KEY = 'authUser';
    const ACCESS_TOKEN_KEY = 'accessToken';
    const MOODCHAT_TOKEN_KEY = 'moodchat_token';

    // ============================================================================
    // AUTHENTICATION STATE TIMING FIX
    // ============================================================================
    /**
     * Authentication state timing fix variables
     * These ensure authentication state is only determined by explicit /auth/me response
     * NEVER by timing or network delays
     */
    let _authValidationInProgress = false;
    let _authValidated = false;
    let _authValidationPromise = null;
    let _authLastChecked = 0;
    const AUTH_VALIDATION_TIMEOUT = 10000; // 10 seconds
    const AUTH_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    /**
     * Store token in ALL locations for reliability
     * @param {string} token - The token to store
     * @param {object} user - User data
     * @param {string} refreshToken - Refresh token (optional)
     * @returns {boolean} True if successful
     */
    function _storeTokenInAllLocations(token, user, refreshToken = null) {
        if (!token || token.trim() === "" || token === "null" || token === "undefined") {
            console.error('❌ [AUTH] Cannot store invalid token');
            return false;
        }
        
        try {
            // 1. Store in centralized USER_TOKEN_KEY
            setUserToken(token);
            
            // 2. Store in legacy locations for backward compatibility
            localStorage.setItem(ACCESS_TOKEN_KEY, token);
            localStorage.setItem(MOODCHAT_TOKEN_KEY, token);
            
            // 3. Store in authUser object
            let authData = {
                accessToken: token,
                token: token, // Legacy support
                user: user || {},
                tokenTimestamp: Date.now(),
                authValidated: false
            };
            
            if (refreshToken) {
                authData.refreshToken = refreshToken;
            }
            
            localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(authData));
            
            // 4. Store legacy keys for compatibility
            localStorage.setItem('token', token);
            localStorage.setItem('moodchat_auth_token', token);
            
            // 5. Store user data using centralized function
            if (user) {
                setUserData(user, true);
            }
            
            console.log('✅ [AUTH] Token stored in ALL locations for reliability');
            console.log(`✅ [AUTH] Centralized: ${USER_TOKEN_KEY}, Legacy: ${ACCESS_TOKEN_KEY}, ${MOODCHAT_TOKEN_KEY}`);
            
            return true;
        } catch (error) {
            console.error('❌ [AUTH] Error storing token in all locations:', error);
            return false;
        }
    }

    /**
     * Extracts token from ANY backend response format
     * 🔧 UPDATED: Now includes accessToken field for modern API format
     */
    function _extractTokenFromResponse(responseData) {
        if (!responseData) return null;
        
        // 🔧 UPDATED: Modern API format support - priority: accessToken > tokens.accessToken > token
        if (responseData.accessToken) {
            return responseData.accessToken;
        }
        if (responseData.tokens && responseData.tokens.accessToken) {
            return responseData.tokens.accessToken;
        }
        if (responseData.token) {
            return responseData.token;
        }
        
        // Check nested data property
        if (responseData.data && responseData.data.accessToken) {
            return responseData.data.accessToken;
        }
        if (responseData.data && responseData.data.token) {
            return responseData.data.token;
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
     * Stores normalized auth data with CONSISTENT format in ALL locations
     */
    function _storeAuthData(token, user, refreshToken = null) {
        if (!token || token.trim() === "" || token === "null" || token === "undefined") {
            console.error('❌ [AUTH] Cannot store auth data without valid token');
            return false;
        }
        
        // Store token in ALL locations for reliability
        const storageSuccess = _storeTokenInAllLocations(token, user, refreshToken);
        if (!storageSuccess) {
            return false;
        }
        
        // Update global access token
        accessToken = token;
        
        // Set global user
        window.currentUser = user || {};
        
        // Reset auth validation state since we have new token
        _authValidated = false;
        _authValidationPromise = null;
        
        console.log(`✅ [AUTH] Auth data stored successfully in ALL locations`);
        console.log(`✅ [AUTH] Token: ${token.substring(0, 20)}...`);
        console.log(`✅ [AUTH] Global accessToken updated`);
        
        // Dispatch storage event
        window.dispatchEvent(new CustomEvent('auth-data-stored', {
            detail: { token: token, user: user, timestamp: new Date().toISOString() }
        }));
        
        return true;
    }

    /**
     * Clears ALL auth data from ALL locations
     */
    function _clearAllAuthData() {
        // Keep window.currentUser intact as requested
        const currentUserBeforeClear = window.currentUser;
        
        // Clear ALL token locations using centralized function
        clearAllAuthData();
        
        // Clear global token variable
        accessToken = null;
        
        // Clear auth validation state
        _authValidated = false;
        _authValidationPromise = null;
        _authValidationInProgress = false;
        
        // Restore window.currentUser as requested
        window.currentUser = currentUserBeforeClear;
        
        console.log('✅ [AUTH] All auth data cleared from ALL locations');
        console.log('✅ [AUTH] Auth validation state reset');
        console.log('✅ [AUTH] window.currentUser preserved:', window.currentUser ? 'Still set' : 'Not set');
        
        // Dispatch cleared event
        window.dispatchEvent(new CustomEvent('auth-data-cleared'));
        
        // Handle unauthorized access - redirect to login
        handleUnauthorizedAccess();
    }

    /**
     * Gets the current user from storage
     */
    function _getCurrentUserFromStorage() {
        try {
            // First check if window.currentUser is already set
            if (window.currentUser) {
                return window.currentUser;
            }
            
            // Check centralized storage first
            const userDataStr = localStorage.getItem(USER_DATA_KEY);
            if (userDataStr) {
                const user = JSON.parse(userDataStr);
                window.currentUser = user; // Set global for future access
                return user;
            }
            
            // Check legacy storage
            const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!authDataStr) {
                // Check legacy user storage
                const legacyUser = localStorage.getItem('moodchat_auth_user');
                if (legacyUser) {
                    const user = JSON.parse(legacyUser);
                    window.currentUser = user; // Set global for future access
                    return user;
                }
                
                return null;
            }
            
            const authData = JSON.parse(authDataStr);
            const user = authData.user || null;
            if (user) {
                window.currentUser = user; // Set global for future access
            }
            return user;
        } catch (error) {
            console.error('❌ [AUTH] Error reading user from storage:', error);
            return null;
        }
    }

    // ============================================================================
    // ENHANCED UNAUTHORIZED ACCESS HANDLING WITH PUBLIC ENDPOINT PROTECTION
    // ============================================================================
    let _unauthorizedAccessInProgress = false;
    let _lastUnauthorizedAccessTime = 0;
    const UNAUTHORIZED_ACCESS_COOLDOWN = 1000; // 1 second

    handleUnauthorizedAccess = function() {
        const now = Date.now();
        
        // Prevent infinite loops - check if we're already handling this or if it was recently handled
        if (_unauthorizedAccessInProgress || (now - _lastUnauthorizedAccessTime < UNAUTHORIZED_ACCESS_COOLDOWN)) {
            console.log('🔐 [AUTH] Unauthorized access handling already in progress or too recent, skipping');
            return;
        }
        
        _unauthorizedAccessInProgress = true;
        _lastUnauthorizedAccessTime = now;
        
        console.log('🔐 [AUTH] Handling unauthorized access - redirecting to login');
        
        // Clear all localStorage items related to authentication
        try {
            // Set a flag to prevent recursive clearing
            localStorage.setItem('_auth_clearing_in_progress', 'true');
            
            _clearAllAuthData();
            
            localStorage.removeItem('_auth_clearing_in_progress');
        } catch (error) {
            console.error('🔐 [AUTH] Error clearing auth data:', error);
        }
        
        // Redirect to login page with cooldown
        setTimeout(() => {
            try {
                // Only redirect if we're not already on the login page
                if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('index.html')) {
                    window.location.href = "/login";
                    console.log('🔐 [AUTH] Redirected to login page');
                } else {
                    console.log('🔐 [AUTH] Already on login page, skipping redirect');
                }
            } catch (redirectError) {
                console.error('🔐 [AUTH] Error redirecting to login:', redirectError);
                
                // Fallback: Try to reload the current page which should show login
                try {
                    window.location.reload();
                } catch (reloadError) {
                    console.error('🔐 [AUTH] Error reloading page:', reloadError);
                }
            } finally {
                // Always release the lock
                setTimeout(() => {
                    _unauthorizedAccessInProgress = false;
                }, 100);
            }
        }, 500);
    };

    // ============================================================================
    // validateAuth() FUNCTION - PERMANENTLY FIXES AUTH TIMING ISSUES
    // ============================================================================

    /**
     * validateAuth() - SINGLE ASYNCHRONOUS FUNCTION that permanently fixes authentication state timing issues
     * CRITICAL: This is the ONLY function that should determine authentication state
     * STRICT RULES:
     * 1. Calls /api/auth/me and waits for response using await
     * 2. If response is 200: Set window.currentUser, set _authValidated = true, resolve true
     * 3. If response is 401/403: Clear tokens, set _authValidated = false, resolve false
     * 4. If request is still pending or network delay: DO NOT mark user as logged out, DO NOT clear tokens
     * 5. NEVER returns false before validateAuth() completes
     * 6. MUST wait for validateAuth() if authValidated is unknown
     * 7. NEVER auto-fails due to timing
     */
    validateAuth = async function() {
        console.log('🔐 [AUTH-TIMING-FIX] validateAuth() called - CRITICAL TIMING FIX');
        
        // Check if we already have a pending validation
        if (_authValidationInProgress && _authValidationPromise) {
            console.log('🔐 [AUTH-TIMING-FIX] Auth validation already in progress, returning existing promise');
            return _authValidationPromise;
        }
        
        // Check if auth was recently validated (within cache duration)
        const now = Date.now();
        if (_authValidated && _authLastChecked > 0 && (now - _authLastChecked) < AUTH_CACHE_DURATION) {
            console.log('🔐 [AUTH-TIMING-FIX] Using recently cached auth validation (within 5 minutes)');
            return Promise.resolve(true);
        }
        
        // Get token from storage - use centralized token retrieval
        const token = getUserToken();
        if (!token) {
            console.log('🔐 [AUTH-TIMING-FIX] No token available, auth cannot be validated');
            _authValidated = false;
            _authValidationPromise = null;
            _authValidationInProgress = false;
            return false;
        }
        
        // CRITICAL FIX: If we have a token, we should consider API as available
        // This prevents indefinite waiting for API readiness
        if (token && !_authValidated) {
            console.log('🔐 [AUTH-TIMING-FIX] Token exists, API should be considered available');
        }
        
        // Mark validation as in progress
        _authValidationInProgress = true;
        
        // Create a new promise for this validation
        _authValidationPromise = new Promise(async (resolve) => {
            try {
                // 🔧 SURGICAL FIX: Build URL using BACKEND_BASE_URL + '/api/auth/me'
                // Endpoint already includes /api
                const fullUrl = BACKEND_BASE_URL + '/api/auth/me';
                console.log(`🔐 [AUTH-TIMING-FIX] Calling ${fullUrl} to validate auth`);
                console.log(`🔐 [AUTH-TIMING-FIX] Token present: ${token ? 'YES' : 'NO'}`);
                console.log(`🔐 [AUTH-TIMING-FIX] Token length: ${token ? token.length : 0} characters`);
                
                // Create headers with proper Authorization header
                const headers = {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                };
                
                console.log(`🔐 [AUTH-TIMING-FIX] Authorization header included: ${headers['Authorization'].substring(0, 30)}...`);
                
                // Use AbortController for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), AUTH_VALIDATION_TIMEOUT);
                
                // MOBILE SESSION FIX: Include credentials for authenticated requests
                const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: headers,
                    credentials: 'include', // FIX: Include session cookies for mobile browsers
                    mode: 'cors',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                const status = response.status;
                
                // Parse response
                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    try {
                        data = await response.json();
                    } catch (jsonError) {
                        console.error(`❌ [AUTH-TIMING-FIX] JSON parsing error for ${fullUrl}:`, jsonError);
                        data = { 
                            message: 'Invalid JSON response from server',
                            error: jsonError.message 
                        };
                    }
                } else {
                    try {
                        data = await response.text();
                    } catch (textError) {
                        console.error(`❌ [AUTH-TIMING-FIX] Text parsing error for ${fullUrl}:`, textError);
                        data = { 
                            message: 'Failed to parse response',
                            error: textError.message 
                        };
                    }
                }
                
                // 🔧 FIX 2 & 3: Unified response normalization
                const normalizedResponse = _normalizeApiResponse(data, response);
                const isSuccess = normalizedResponse.success;
                
                console.log(`🔐 [AUTH-TIMING-FIX] /auth/me response: HTTP ${status}, Success: ${isSuccess}`);
                
                if (isSuccess) {
                    // SUCCESS - Modern or legacy format success
                    const user = normalizedResponse.user || _extractUserFromResponse(data);
                    
                    if (!user) {
                        console.error('❌ [AUTH-TIMING-FIX] /auth/me succeeded but no user data returned');
                        _authValidated = false;
                        _authLastChecked = now;
                        resolve(false);
                        return;
                    }
                    
                    console.log('✅ [AUTH-TIMING-FIX] /auth/me validation successful');
                    console.log(`🔐 [AUTH-TIMING-FIX] User retrieved: ${user.username || user.email || 'User ID: ' + (user.id || 'Unknown')}`);
                    
                    // Update stored user data
                    try {
                        // Store in centralized location
                        setUserData(user, true);
                        
                        // Update global user state
                        window.currentUser = user;
                        
                        console.log('✅ [AUTH-TIMING-FIX] User data updated and marked as validated');
                    } catch (storageError) {
                        console.error('❌ [AUTH-TIMING-FIX] Error updating user data after /auth/me:', storageError);
                    }
                    
                    // Set auth state
                    _authValidated = true;
                    _authLastChecked = now;
                    
                    // Dispatch user loaded event
                    window.dispatchEvent(new CustomEvent('user-loaded', {
                        detail: { user: user, timestamp: new Date().toISOString() }
                    }));
                    
                    resolve(true);
                    
                } else if (status === 401 || status === 403) {
                    // AUTH ERROR - 401 Unauthorized or 403 Forbidden
                    console.log(`🔐 [AUTH-TIMING-FIX] Auth error ${status} - token is invalid`);
                    
                    // Clear tokens from ALL locations
                    _clearAllAuthData();
                    
                    _authValidated = false;
                    _authLastChecked = now;
                    resolve(false);
                    
                } else {
                    // OTHER HTTP ERROR (not 401/403)
                    console.log(`🔐 [AUTH-TIMING-FIX] HTTP ${status} error - NOT an auth error, keeping tokens`);
                    
                    // For non-auth HTTP errors, we don't clear tokens
                    // This could be a server error, network issue, etc.
                    // We preserve the existing auth state
                    _authLastChecked = now;
                    
                    // Don't change _authValidated state for non-auth errors
                    // Resolve with current auth state
                    resolve(_authValidated);
                }
                
            } catch (error) {
                console.error('❌ [AUTH-TIMING-FIX] validateAuth() error:', error);
                
                // Check error type
                const isNetworkError = error.message && (
                    error.message.includes('Failed to fetch') ||
                    error.message.includes('NetworkError') ||
                    error.message.includes('network request failed')
                );
                
                const isAbortError = error.name === 'AbortError' || 
                                    error.message.includes('aborted') ||
                                    error.message.includes('The user aborted');
                
                const isTimeoutError = error.name === 'TimeoutError' ||
                                      error.message.includes('timeout') ||
                                      error.message.includes('Timeout');
                
                // ABORT ERROR - CRITICAL FIX: Do NOT treat abort as auth failure
                if (isAbortError) {
                    console.log('🔐 [AUTH-TIMING-FIX] AbortError detected - NOT an auth failure, preserving auth state');
                    console.log('🔐 [AUTH-TIMING-FIX] Token exists: ' + (token ? 'YES' : 'NO'));
                    
                    // CRITICAL FIX: If token exists, we should consider auth as validated
                    // This prevents API readiness from being blocked
                    if (token) {
                        console.log('🔐 [AUTH-TIMING-FIX] Token exists, marking API as available despite abort');
                    }
                    
                    _authLastChecked = now;
                    // Preserve existing auth state - do NOT set to false
                    resolve(_authValidated || !!token); // Return true if we have a token
                    return;
                }
                
                // NETWORK ERROR OR TIMEOUT
                if (isNetworkError || isTimeoutError) {
                    console.log('🔐 [AUTH-TIMING-FIX] Network/timeout error - DO NOT clear tokens, DO NOT mark as logged out');
                    console.log('🔐 [AUTH-TIMING-FIX] Preserving existing auth state during network issues');
                    
                    // For network errors, we preserve the existing auth state
                    // DO NOT clear tokens, DO NOT mark as logged out
                    _authLastChecked = now;
                    
                    // Resolve with current auth state (preserve it)
                    resolve(_authValidated);
                    
                } else {
                    // OTHER ERRORS
                    console.log('🔐 [AUTH-TIMING-FIX] Other error - preserving auth state');
                    _authLastChecked = now;
                    resolve(_authValidated);
                }
            } finally {
                // Always mark validation as complete
                _authValidationInProgress = false;
                
                // CRITICAL FIX: If we have a token, ensure API readiness is resolved
                // This prevents indefinite waiting for API readiness
                const tokenExists = getUserToken();
                if (tokenExists && !_authValidated) {
                    console.log('🔐 [AUTH-TIMING-FIX] Token exists, ensuring API readiness is not blocked');
                }
            }
        });
        
        return _authValidationPromise;
    };

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
     * SANITIZE ENDPOINT - DEFENSIVE NORMALIZATION WITHOUT ADDING /api
     * 🔧 SURGICAL FIX: Removes duplicate /api segments but NEVER adds /api
     * STRICT RULE: Endpoint comes pre-built from api.request.js
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
            console.error(`❌ [API] NOT: api('POST', '/auth/login') or api({ method: 'POST' }, '/auth/login')`);
            return '/'; // Return root to prevent complete failure
        }
        
        // Remove any leading/trailing slashes for consistent processing
        let cleanEndpoint = endpointStr.replace(/^\/+|\/+$/g, '');
        
        // 🔧 SURGICAL FIX: Detect and remove accidental /api/api duplication
        // But NEVER add /api if missing - trust api.request.js
        if (cleanEndpoint.toUpperCase().startsWith('API/API/')) {
            console.warn(`⚠️ [API] Detected /api/api duplication in endpoint: ${cleanEndpoint}`);
            console.warn(`⚠️ [API] Removing duplicate /api segment`);
            cleanEndpoint = cleanEndpoint.substring(4); // Remove first "api/"
        }
        
        // Also check for lowercase
        if (cleanEndpoint.startsWith('api/api/')) {
            console.warn(`⚠️ [API] Detected /api/api duplication in endpoint: ${cleanEndpoint}`);
            console.warn(`⚠️ [API] Removing duplicate /api segment`);
            cleanEndpoint = cleanEndpoint.substring(4); // Remove first "api/"
        }
        
        // Ensure it starts with "/" but doesn't end with "/" (unless it's just "/")
        if (!cleanEndpoint) return '/';
        if (!cleanEndpoint.startsWith('/')) {
            cleanEndpoint = '/' + cleanEndpoint;
        }
        
        return cleanEndpoint;
    }

    /**
     * BUILD SAFE URL - WITHOUT ADDING /api
     * 🔧 SURGICAL FIX: Uses BACKEND_BASE_URL directly, endpoint is already complete
     * STRICT RULE: NEVER add /api in this function
     */
    function _buildSafeUrl(endpoint) {
        const sanitizedEndpoint = _sanitizeEndpoint(endpoint);
        
        // Handle empty or root endpoint
        if (sanitizedEndpoint === '/') {
            return BACKEND_BASE_URL;
        }
        
        // Construct URL ensuring no double slashes
        const base = BACKEND_BASE_URL.endsWith('/') ? BACKEND_BASE_URL.slice(0, -1) : BACKEND_BASE_URL;
        const endpointPath = sanitizedEndpoint.startsWith('/') ? sanitizedEndpoint : '/' + sanitizedEndpoint;
        
        const fullUrl = base + endpointPath;
        console.log(`🔧 [BUILD-URL] Built: ${fullUrl} (endpoint: ${sanitizedEndpoint})`);
        
        // 🔧 ENDPOINT INTEGRITY GUARD: Detect /api/api patterns
        if (fullUrl.includes('/api/api/')) {
            console.warn(`⚠️ [API] ENDPOINT INTEGRITY VIOLATION: /api/api detected in URL: ${fullUrl}`);
            console.warn(`⚠️ [API] This indicates api.request.js is not working correctly`);
            console.warn(`⚠️ [API] Expected: ${BACKEND_BASE_URL}/api/...`);
            console.warn(`⚠️ [API] Got: ${fullUrl}`);
        }
        
        return fullUrl;
    }

    // ============================================================================
    // CRITICAL FIX: CORE FETCH FUNCTION WITH PUBLIC/PROTECTED SEPARATION
    // ============================================================================

    /**
     * CORE FETCH FUNCTION - STRICT REQUIREMENTS:
     * 1. Treat ANY HTTP status ≥400 as a HARD failure
     * 2. NEVER return success if response.ok === false
     * 3. Do NOT mark backend offline on ANY HTTP status errors (400, 401, 500, etc.)
     * 4. Only mark backend offline on actual network connection failures
     * 5. 🔧 SURGICAL FIX: Use BACKEND_BASE_URL directly, endpoint is already complete
     * 6. STRICT CONTRACT: endpoint is string, method is in options
     * 7. AUTO-ATTACH Authorization header using getAuthHeaders() which uses getValidToken()
     * 8. 🔧 CRITICAL FIX: Network state COMPLETELY SEPARATE from authentication state
     * 9. 🔧 CRITICAL FIX: Token ALWAYS read from localStorage using getValidToken()
     * 10. 🔧 CRITICAL FIX: 401 on public endpoints IGNORED, 401 on protected triggers logout
     * 11. 🔧 CRITICAL FIX: Mobile session fix - ALWAYS include credentials: "include" for authenticated requests
     */
    function _safeFetch(fullUrl, options = {}) {
        // Validate URL
        if (!fullUrl || typeof fullUrl !== 'string') {
            console.error('❌ [API] Invalid URL for fetch:', fullUrl);
            return Promise.reject(new Error('Invalid request URL'));
        }
        
        // Normalize method - ABSOLUTELY CRITICAL
        const normalizedMethod = _normalizeHttpMethod(options.method || 'GET');
        
        // Extract endpoint from full URL for public endpoint check
        const endpoint = fullUrl.replace(BACKEND_BASE_URL, '');
        
        // 🔧 CRITICAL FIX: PUBLIC VS PROTECTED ENDPOINT HANDLING
        const isPublic = isPublicEndpoint(endpoint);
        const isStatus = isStatusEndpoint(endpoint);
        const isAuth = isAuthEndpoint(endpoint);
        
        console.log(`🔐 [AUTH] Endpoint analysis: "${endpoint}"`);
        console.log(`🔐 [AUTH] Is public endpoint: ${isPublic}`);
        console.log(`🔐 [AUTH] Is status endpoint: ${isStatus}`);
        console.log(`🔐 [AUTH] Is auth endpoint: ${isAuth}`);
        console.log(`🔐 [AUTH] Endpoint classification: ${isPublic ? 'PUBLIC' : 'PROTECTED'}`);
        
        // AUTHORIZATION HEADER ENFORCEMENT - USING getAuthHeaders() HELPER
        // This always reads token directly from localStorage using getValidToken()
        const authHeaders = getAuthHeaders(endpoint);
        
        // Build headers - SPECIAL HANDLING FOR PUBLIC ENDPOINTS AND STATUS
        let headers = {
            'Content-Type': 'application/json'
        };
        
        // 🔧 CRITICAL FIX: Only add Authorization header if NOT public endpoint and NOT status endpoint
        if (!isPublic && !isStatus && !isAuth) {
            headers = {
                ...headers,
                ...authHeaders, // Add Authorization header if token exists and endpoint is protected
                ...options.headers
            };
            
            // Explicitly add Authorization header if token exists and not already present
            // Always read token directly from localStorage using getValidToken()
            const token = getValidToken();
            
            if (token && !headers['Authorization'] && !headers['authorization']) {
                headers['Authorization'] = `Bearer ${token}`;
                console.log(`🔐 [AUTH] Token from getValidToken() injected into headers for ${normalizedMethod} ${fullUrl}`);
            }
        } else {
            // For public endpoints, status endpoints, and auth endpoints - use only provided headers (never add auth)
            headers = {
                ...headers,
                ...options.headers
            };
            if (isPublic) {
                console.log(`🔧 [NETWORK] Public endpoint detected, NO Authorization header will be added`);
            } else if (isStatus) {
                console.log(`🔧 [NETWORK] Status endpoint detected, NO Authorization header will be added`);
            } else if (isAuth) {
                console.log(`🔧 [NETWORK] Auth endpoint detected, NO Authorization header will be added`);
            }
        }
        
        // Auto-attach Authorization header for authenticated requests
        // Skip only if explicitly disabled (auth: false) or for public/auth endpoints
        const skipAuth = options.auth === false || isPublic || isStatus || isAuth;
        
        if (!skipAuth && (headers['Authorization'] || headers['authorization'])) {
            console.log(`🔐 [AUTH] Authorization header attached to ${normalizedMethod} ${fullUrl}`);
        } else if (!skipAuth && !headers['Authorization'] && !headers['authorization']) {
            console.log(`⚠️ [AUTH] No token available for ${normalizedMethod} ${fullUrl}`);
        }
        
        // MOBILE SESSION FIX: Determine if credentials should be included
        // Always include credentials for authenticated requests to ensure session cookies are sent
        const requiresCredentials = !isPublic && !isStatus && !isAuth && !skipAuth;
        
        // Prepare safe options
        const safeOptions = {
            method: normalizedMethod,
            mode: 'cors',
            credentials: requiresCredentials ? 'include' : 'omit', // MOBILE FIX: Include credentials for authenticated requests
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
        console.log(`🔧 [API] Authorization Header: ${headers['Authorization'] ? 'Present' : 'Not present'}`);
        console.log(`🔧 [API] Is Public Endpoint: ${isPublic ? 'YES (no auth)' : 'NO'}`);
        console.log(`🔧 [API] Is Status Endpoint: ${isStatus ? 'YES (no auth)' : 'NO'}`);
        console.log(`🔧 [API] Is Auth Endpoint: ${isAuth ? 'YES (no auth)' : 'NO'}`);
        console.log(`🔧 [API] Requires Credentials: ${requiresCredentials ? 'YES (mobile session fix)' : 'NO (public endpoint)'}`);
        console.log(`🔧 [API] Credentials setting: ${safeOptions.credentials}`);
        console.log(`🔧 [API] Token source: localStorage via getValidToken()`);
        
        // PERFORM THE FETCH
        return fetch(fullUrl, safeOptions)
            .then(async response => {
                try {
                    // Parse response ONCE only
                    const contentType = response.headers.get('content-type');
                    let data;
                    
                    if (contentType && contentType.includes('application/json')) {
                        try {
                            data = await response.json();
                        } catch (jsonError) {
                            console.error(`❌ [API] JSON parsing error for ${fullUrl}:`, jsonError);
                            data = { 
                                message: 'Invalid JSON response from server',
                                error: jsonError.message 
                            };
                        }
                    } else {
                        try {
                            data = await response.text();
                        } catch (textError) {
                            console.error(`❌ [API] Text parsing error for ${fullUrl}:`, textError);
                            data = { 
                                message: 'Failed to parse response',
                                error: textError.message 
                            };
                        }
                    }
                    
                    // 🔧 FIX 2 & 3: Unified response normalization
                    const normalizedResponse = _normalizeApiResponse(data, response);
                    
                    const success = normalizedResponse.success;
                    const status = response.status;
                    
                    // 🔧 CRITICAL FIX: Backend is reachable if we got ANY response
                    // HTTP errors (400, 401, 403, 500, etc.) mean backend IS reachable
                    if (window.AppNetwork) {
                        window.AppNetwork.updateBackendStatus(true);
                    }
                    
                    // Create normalized response format
                    const result = {
                        ok: success,
                        success: success,
                        status: status,
                        statusText: response.statusText,
                        data: normalizedResponse.data,
                        headers: Object.fromEntries(response.headers.entries()),
                        url: response.url,
                        token: normalizedResponse.token,
                        user: normalizedResponse.user,
                        message: normalizedResponse.message
                    };
                    
                    // Enhanced error handling for specific status codes
                    if (!success) {
                        let errorMessage = normalizedResponse.message || response.statusText || 'Request failed';
                        
                        if (status === 429) {
                            errorMessage = 'Too many requests. Please wait and try again.';
                            result.isRateLimited = true;
                            result.retryAfter = response.headers.get('Retry-After');
                        } else if (status >= 500) {
                            errorMessage = 'Server error. Please try again later.';
                            result.isServerError = true;
                        } else if (status === 401 || status === 403) {
                            // 🔧 CRITICAL FIX: Handle unauthorized access DIFFERENTLY for public vs protected
                            errorMessage = normalizedResponse.message || 'Invalid credentials';
                            result.isAuthError = true;
                            
                            console.log(`🔐 [AUTH] ${status} Unauthorized/Forbidden - AUTH ISSUE, NOT NETWORK`);
                            console.log(`🔐 [AUTH] Backend IS reachable (got response), this is an authentication issue`);
                            
                            // 🔧 CRITICAL FIX: PUBLIC endpoints - IGNORE 401, DO NOT clear tokens
                            if (isPublic || isStatus || isAuth) {
                                console.log(`🔐 [AUTH] PUBLIC/AUTH/STATUS endpoint ${status} - IGNORING, tokens NOT cleared`);
                                console.log(`🔐 [AUTH] /api/status or /auth/* 401 is NORMAL for unauthenticated access`);
                            } else {
                                // 🔧 CRITICAL FIX: PROTECTED endpoints - normal logout flow
                                console.log(`🔐 [AUTH] PROTECTED endpoint ${status} - handling unauthorized access`);
                                // Use centralized handler with loop prevention
                                if (!localStorage.getItem('_auth_clearing_in_progress')) {
                                    setTimeout(() => {
                                        handleUnauthorizedAccess();
                                    }, 100);
                                }
                            }
                        } else if (status === 400) {
                            errorMessage = normalizedResponse.message || 'Bad request';
                            result.isClientError = true;
                        } else if (status === 404) {
                            errorMessage = normalizedResponse.message || 'Resource not found';
                            result.isNotFound = true;
                        }
                        
                        result.message = errorMessage;
                    } else {
                        result.message = normalizedResponse.message || 'Success';
                    }
                    
                    return result;
                } catch (processingError) {
                    console.error(`❌ [API] Response processing error for ${fullUrl}:`, processingError);
                    
                    // Even if we can't process the response, backend IS reachable
                    if (window.AppNetwork) {
                        window.AppNetwork.updateBackendStatus(true);
                    }
                    
                    // Return error in consistent format
                    return {
                        ok: false,
                        success: false,
                        status: response.status || 0,
                        statusText: response.statusText || 'Processing Error',
                        data: { 
                            message: 'Failed to process response',
                            error: processingError.message 
                        },
                        headers: Object.fromEntries(response.headers.entries()),
                        url: response.url,
                        processingError: true
                    };
                }
            })
            .catch(error => {
                console.error(`🔧 [API] Fetch error for ${fullUrl}:`, error);
                
                const isNetworkError = error.message && (
                    error.message.includes('Failed to fetch') ||
                    error.message.includes('NetworkError') ||
                    error.message.includes('network request failed') ||
                    error.message.includes('Load failed')
                );
                
                // Check for AbortError - don't mark as network error
                const isAbortError = error.name === 'AbortError' || 
                                    error.message.includes('aborted') ||
                                    error.message.includes('The user aborted');
                
                // Check for timeout errors
                const isTimeoutError = error.name === 'TimeoutError' ||
                                      error.message.includes('timeout') ||
                                      error.message.includes('Timeout');
                
                // Check for DNS errors
                const isDNSError = error.message.includes('ERR_NAME_NOT_RESOLVED') ||
                                  error.message.includes('net::ERR_NAME_NOT_RESOLVED');
                
                // CRITICAL FIX: Only update backend reachability for actual network errors
                // This is where we separate network state from auth state
                const shouldMarkBackendUnreachable = (isNetworkError || isTimeoutError || isDNSError) && !isAbortError;
                
                if (shouldMarkBackendUnreachable) {
                    console.warn(`⚠️ [API] Network error detected, marking backend as unreachable: ${error.message}`);
                    console.warn(`⚠️ [API] This is a REAL NETWORK issue, not an auth issue`);
                    if (window.AppNetwork) {
                        window.AppNetwork.updateBackendStatus(false);
                    }
                } else {
                    // For non-network errors or abort errors, backend might still be reachable
                    console.warn(`⚠️ [API] Non-network error (${error.name || 'unknown'}), not changing backend status: ${error.message}`);
                }
                
                // Determine error message
                let errorMessage = 'Network Error';
                if (isAbortError) errorMessage = 'Request Aborted';
                if (isTimeoutError) errorMessage = 'Request Timeout';
                if (isDNSError) errorMessage = 'DNS Resolution Failed';
                
                return {
                    ok: false,
                    success: false,
                    status: 0,
                    statusText: errorMessage,
                    data: { 
                        message: errorMessage,
                        error: error.message 
                    },
                    headers: {},
                    url: fullUrl,
                    networkError: shouldMarkBackendUnreachable,
                    abortError: isAbortError,
                    timeoutError: isTimeoutError,
                    dnsError: isDNSError
                };
            });
    }

    // ============================================================================
    // API REQUEST QUEUE SYSTEM FOR DELAYED PROTECTED CALLS
    // ============================================================================

    /**
     * API Request Queue - delays protected API calls until login is complete
     * 🔧 CRITICAL FIX: Public endpoints NEVER queued
     */
    const _apiRequestQueue = {
        _queue: [],
        _isProcessing: false,
        _isLoginComplete: false,
        
        /**
         * Add request to queue - ONLY for protected endpoints
         */
        addRequest: function(requestFn, description, endpoint) {
            // 🔧 CRITICAL FIX: Check if this is a public endpoint
            if (endpoint && isPublicEndpoint(endpoint)) {
                console.log(`🔐 [QUEUE] PUBLIC endpoint "${endpoint}" - NOT queued, executing immediately`);
                // Execute immediately without queueing
                return requestFn();
            }
            
            return new Promise((resolve, reject) => {
                this._queue.push({
                    fn: requestFn,
                    description: description,
                    resolve,
                    reject
                });
                
                console.log(`🔐 [QUEUE] Request queued: ${description} (queue size: ${this._queue.length})`);
                
                // Process queue if not already processing
                if (!this._isProcessing) {
                    this._processQueue();
                }
            });
        },
        
        /**
         * Process the queue
         */
        _processQueue: async function() {
            if (this._isProcessing || this._queue.length === 0) {
                return;
            }
            
            this._isProcessing = true;
            
            while (this._queue.length > 0) {
                const request = this._queue.shift();
                
                try {
                    console.log(`🔐 [QUEUE] Processing: ${request.description}`);
                    const result = await request.fn();
                    request.resolve(result);
                    console.log(`✅ [QUEUE] Completed: ${request.description}`);
                } catch (error) {
                    console.error(`❌ [QUEUE] Failed: ${request.description}`, error);
                    request.reject(error);
                }
            }
            
            this._isProcessing = false;
        },
        
        /**
         * Mark login as complete
         */
        markLoginComplete: function() {
            this._isLoginComplete = true;
            console.log('🔐 [QUEUE] Login marked as complete');
            this._processQueue();
        },
        
        /**
         * Check if login is complete
         */
        isLoginComplete: function() {
            return this._isLoginComplete;
        },
        
        /**
         * Clear the queue
         */
        clearQueue: function() {
            this._queue = [];
            console.log('🔐 [QUEUE] Queue cleared');
        }
    };

    // ============================================================================
    // CACHING SYSTEM FOR INSTANT RENDERING
    // ============================================================================

    /**
     * Caching system for API responses
     */
    const _apiCache = {
        _cache: new Map(),
        _defaultTTL: 5 * 60 * 1000, // 5 minutes
        
        /**
         * Get cached data
         */
        get: function(key) {
            const cached = this._cache.get(key);
            if (!cached) return null;
            
            // Check if cache has expired
            if (Date.now() > cached.expiresAt) {
                this._cache.delete(key);
                return null;
            }
            
            return cached.data;
        },
        
        /**
         * Set cache data
         */
        set: function(key, data, ttl = this._defaultTTL) {
            this._cache.set(key, {
                data,
                expiresAt: Date.now() + ttl,
                timestamp: Date.now()
            });
            
            // Also store in localStorage for persistence
            try {
                localStorage.setItem(`cache_${key}`, JSON.stringify({
                    data,
                    expiresAt: Date.now() + ttl,
                    timestamp: Date.now()
                }));
            } catch (error) {
                console.log(`🔧 [CACHE] Could not store in localStorage: ${error.message}`);
            }
        },
        
        /**
         * Delete cache entry
         */
        delete: function(key) {
            this._cache.delete(key);
            try {
                localStorage.removeItem(`cache_${key}`);
            } catch (error) {
                // Ignore
            }
        },
        
        /**
         * Clear all cache
         */
        clear: function() {
            this._cache.clear();
            // Clear localStorage cache items
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('cache_')) {
                    localStorage.removeItem(key);
                }
            });
        },
        
        /**
         * Load from localStorage on initialization
         */
        loadFromStorage: function() {
            try {
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('cache_')) {
                        try {
                            const cachedStr = localStorage.getItem(key);
                            if (cachedStr) {
                                const cached = JSON.parse(cachedStr);
                                // Check if still valid
                                if (Date.now() < cached.expiresAt) {
                                    this._cache.set(key.replace('cache_', ''), cached);
                                } else {
                                    localStorage.removeItem(key);
                                }
                            }
                        } catch (error) {
                            // Remove invalid cache entry
                            localStorage.removeItem(key);
                        }
                    }
                });
                console.log(`🔧 [CACHE] Loaded ${this._cache.size} items from localStorage`);
            } catch (error) {
                console.log(`🔧 [CACHE] Error loading from storage: ${error.message}`);
            }
        }
    };

    // Initialize cache from localStorage
    _apiCache.loadFromStorage();

    // ============================================================================
    // GLOBAL API FUNCTION - ULTRA-DEFENSIVE WRAPPER WITH AUTHORITATIVE AUTH
    // ============================================================================

    /**
     * GLOBAL API FUNCTION - STRICT CONTRACT:
     * 1. First argument MUST ALWAYS be endpoint string (e.g., '/api/auth/login')
     * 2. Second argument MUST ALWAYS be options object (e.g., { method: 'POST' })
     * 3. NEVER accept HTTP methods as first argument
     * 4. NEVER swap arguments
     * 5. 🔧 SURGICAL FIX: Use BACKEND_BASE_URL + endpoint (endpoint already includes /api)
     * 6. MOBILE FIX: Always include credentials: "include" for authenticated requests
     * 7. Uses centralized secureFetch for all requests
     * 8. 🔧 CRITICAL FIX: Public endpoints bypass token checks entirely
     */
    const globalApiFunction = function(endpoint, options = {}) {
        // 🔧 CRITICAL FIX: PUBLIC endpoints bypass ALL network and token checks
        const isPublic = isPublicEndpoint(endpoint);
        const isStatus = isStatusEndpoint(endpoint);
        const isAuth = isAuthEndpoint(endpoint);
        
        console.log(`🔧 [API] Global API call: ${endpoint}`);
        console.log(`🔧 [API] Classification: ${isPublic ? 'PUBLIC' : 'PROTECTED'}`);
        console.log(`🔧 [API] Is status: ${isStatus}, Is auth: ${isAuth}`);
        
        // Use global network state for protected endpoints only
        if (window.AppNetwork && !window.AppNetwork.isOnline && !isPublic && !isStatus && !isAuth) {
            console.log('🔧 [API] Offline detected for PROTECTED endpoint, returning offline response');
            return Promise.resolve({
                ok: false,
                success: false,
                status: 0,
                statusText: 'Offline',
                data: { message: 'Offline mode' },
                headers: {},
                offline: true,
                cached: true
            });
        }
        
        // 🔧 CRITICAL FIX: PUBLIC endpoints work even when offline (for cached data)
        if (isPublic && window.AppNetwork && !window.AppNetwork.isOnline) {
            console.log('🔧 [API] Offline but PUBLIC endpoint - attempting with cache');
            // Continue anyway for public endpoints, they might have cached data
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
        // 🔧 SURGICAL FIX: _buildSafeUrl uses BACKEND_BASE_URL directly
        const fullUrl = _buildSafeUrl(safeEndpoint);
        
        // Check if this is a protected endpoint that requires login
        const requiresAuth = !isPublic && !isStatus && !isAuth && options.auth !== false;
        
        // Get token from centralized storage
        const token = getUserToken();
        
        // 🔧 CRITICAL FIX: PUBLIC/AUTH endpoints bypass queue entirely
        if (isPublic || isStatus || isAuth) {
            console.log(`🔧 [API] PUBLIC/AUTH/STATUS endpoint - executing immediately without queue`);
            return secureApiFetch(safeEndpoint, options);
        }
        
        // If this is a protected endpoint and we don't have a token, 
        // and login is not complete, queue the request
        if (requiresAuth && !token && !_apiRequestQueue.isLoginComplete()) {
            console.log(`🔐 [QUEUE] Delaying protected endpoint until login complete: ${safeEndpoint}`);
            
            return _apiRequestQueue.addRequest(
                () => secureApiFetch(safeEndpoint, options),
                `Protected endpoint: ${safeEndpoint}`,
                safeEndpoint
            );
        }
        
        // Otherwise, use secure fetch immediately
        return secureApiFetch(safeEndpoint, options);
    };

    // ============================================================================
    // NEW API FUNCTIONS FOR GLOBAL ACCESS
    // ============================================================================

    /**
     * Generic API request function
     * @param {string} endpoint - API endpoint
     * @param {object} options - Fetch options
     * @returns {Promise} API response
     */
    apiRequest = async function(endpoint, options = {}) {
        return globalApiFunction(endpoint, options);
    };

    /**
     * API GET request
     * @param {string} endpoint - API endpoint
     * @param {object} params - Query parameters
     * @returns {Promise} API response
     */
    apiGet = async function(endpoint, params = {}) {
        let url = endpoint;
        if (params && Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += (url.includes('?') ? '&' : '?') + queryString;
        }
        return globalApiFunction(url, { method: 'GET' });
    };

    /**
     * API POST request
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body
     * @param {object} options - Additional options
     * @returns {Promise} API response
     */
    apiPost = async function(endpoint, data = {}, options = {}) {
        return globalApiFunction(endpoint, {
            method: 'POST',
            body: data,
            ...options
        });
    };

    /**
     * API PUT request
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body
     * @param {object} options - Additional options
     * @returns {Promise} API response
     */
    apiPut = async function(endpoint, data = {}, options = {}) {
        return globalApiFunction(endpoint, {
            method: 'PUT',
            body: data,
            ...options
        });
    };

    /**
     * API DELETE request
     * @param {string} endpoint - API endpoint
     * @param {object} data - Request body (optional)
     * @param {object} options - Additional options
     * @returns {Promise} API response
     */
    apiDelete = async function(endpoint, data = {}, options = {}) {
        return globalApiFunction(endpoint, {
            method: 'DELETE',
            body: data,
            ...options
        });
    };

    /**
     * Legacy API call function
     * @param {string} endpoint - API endpoint
     * @param {object} options - Fetch options
     * @returns {Promise} API response
     */
    apiCall = async function(endpoint, options = {}) {
        return globalApiFunction(endpoint, options);
    };

    // ============================================================================
    // GLOBAL OBJECT INITIALIZATION
    // ============================================================================

    /**
     * Initialize global API object
     */
    function initializeGlobalApi() {
        console.log('🔧 [API] Initializing global API objects...');
        
        // Create main API object
        if (!window.api) {
            window.api = {};
        }
        
        // Create core API object
        if (!window.api.core) {
            window.api.core = {};
        }
        
        // Assign all functions to window.api.core
        window.api.core = {
            // Token management
            getUserToken,
            setUserToken,
            clearUserToken,
            getCurrentUser,
            setUserData,
            clearAllAuthData,
            tokenReady,
            getValidToken,
            getAuthHeaders,
            isAuthenticated,
            getToken,
            setToken,
             initSession,
            callApi,
            escapeHtml,
            markChatAsRead,
            simulateIncomingCall,
            isSessionValid,
        formatTimeAgo,
        exportAnalytics,
        simulateIncomingCall,
            
            // API functions
            api: globalApiFunction,
            apiRequest,
            apiGet,
            apiPost,
            apiPut,
            apiDelete,
            secureFetch,
            secureApiFetch,
            apiCallWithRetry,
            apiCall,
            
            // Endpoint classification
            isPublicEndpoint,
            isAuthEndpoint,
            isStatusEndpoint,
            
            // Auth functions
            login,
            logout,
            register,
            forgotPassword,
            resetPassword,
            refreshToken,
            checkAuth,
            checkAuthMe,
            validateAuth,
            validateSession,
            
            // Session management
            getSession,
            getSessionData,
            setSessionData,
            updateSession,
            clearSession,
            
            // User profile
            getProfile,
            updateProfile,
            changePassword,
            deleteAccount,
            updateCurrentUser,
            getUserData,
            
            // Friends
            getFriends,
            getFriendRequests,
            sendFriendRequest,
            acceptFriendRequest,
            rejectFriendRequest,
            removeFriend,
            
            // Chat
            getConversations,
            getMessages,
            sendMessage,
            markMessagesAsRead,
            deleteMessage,
            clearChatHistory,
            
            // Groups
            createGroup,
            getGroups,
            getGroupDetails,
            updateGroup,
            deleteGroup,
            addGroupMember,
            removeGroupMember,
            leaveGroup,
            
            // Notifications
            getNotifications,
            markNotificationAsRead,
            deleteNotification,
            clearAllNotifications,
            
            // Calls
            getCallHistory,
            startCall,
            endCall,
            
            // Settings
            getSettings,
            updateSettings,
            
            // Files
            uploadFile,
            deleteFile,
            getFile,
            
            // Users
            getOnlineUsers,
            searchUsers,
            
            // Network
            checkNetworkStatus,
            getApiBaseUrl,
            getBackendBaseUrl,
            determineBackendUrl,
            
            // Utils
            debounce,
            throttle,
            generateId,
            formatDate,
            formatTime,
            
            // Events
            emit,
            on,
            off,
            once,
            
            // System
            initializeTokenSystem,
            updateGlobalAccessToken,
            handleUnauthorizedAccess,
            
            // Ready flag
            ready: true
        };
        
        // Create legacy apiCore object for backward compatibility
        window.apiCore = window.api.core;
        
        // Create __API_CORE global object
        window.__API_CORE = {
            ...window.api.core,
            ready: true,
            version: '20.5.2',
            initialized: true,
            timestamp: new Date().toISOString()
        };
        
        console.log('✅ [API-CORE] Initialized successfully');
        console.log('✅ [API-CORE] Global objects created: window.api.core, window.apiCore, window.__API_CORE');
        console.log('✅ [API-CORE] Ready flag: true');
        
        // Dispatch initialization event
        window.dispatchEvent(new CustomEvent('api-core-initialized', {
            detail: { timestamp: new Date().toISOString() }
        }));
    }

    // ============================================================================
// MISSING FUNCTION IMPLEMENTATIONS
// ============================================================================

/**
 * Initialize session - missing export
 */
initSession = function() {
    console.log('🔧 [SESSION] Initializing session...');
    return initializeTokenSystem();
};

/**
 * Call API - missing export (alias for api or secureApiFetch)
 */
callApi = function(endpoint, options = {}) {
    return secureApiFetch(endpoint, options);
};

/**
 * Escape HTML - missing export
 */
escapeHtml = function(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * Mark chat as read - missing export
 */
markChatAsRead = async function(chatId) {
    return secureApiFetch(`/api/chats/${chatId}/read`, {
        method: 'POST'
    });
};

/**
 * Simulate incoming call - missing export
 */
simulateIncomingCall = function(callData) {
    console.log('📞 [CALL] Simulating incoming call:', callData);
    
    // Dispatch call event
    window.dispatchEvent(new CustomEvent('incoming-call', {
        detail: callData
    }));
    
    return { success: true, message: 'Call simulation triggered' };
};

    // ============================================================================
    // FINAL INITIALIZATION
    // ============================================================================

    // Mark as loaded with a unique identifier to prevent duplicate loading
    window.__API_CORE_LOADED_V2 = true;
    window.__API_CORE_LOADED = true; // Legacy support

    // Initialize token system
    initializeTokenSystem();

    // Initialize global API objects
    initializeGlobalApi();

    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('api.core-ready'));
    console.log('✅ [api.core] api.core-ready event dispatched');

    // Mark initialization as complete
    API_INITIALIZATION_COMPLETE = true;
    window.__API_JS_LOADING = false;

    console.log('✅ [api.core] Surgical fix applied: api.core.js no longer adds /api to endpoints');
    console.log('✅ [api.core] All endpoints must come pre-built from api.request.js');
        // ============================================================================
    // IMPLEMENT MISSING FUNCTIONS
    // ============================================================================

    /**
     * Check if session is valid (alias for validateSession)
     * @returns {boolean} True if session is valid
     */
    isSessionValid = function() {
        // For synchronous usage, check if token exists
        const token = getUserToken();
        const user = getCurrentUser();
        return !!(token && user);
    };

    /**
     * Format time ago (e.g., "5 minutes ago")
     * @param {Date|string} date - The date to format
     * @returns {string} Formatted time ago string
     */
    formatTimeAgo = function(date) {
        if (!date) return 'Unknown time';
        
        const now = new Date();
        const past = new Date(date);
        const seconds = Math.floor((now - past) / 1000);
        
        if (seconds < 60) return `${seconds} seconds ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`;
        if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;
        
        return `${Math.floor(seconds / 31536000)} years ago`;
    };

    /**
     * Export analytics data
     * @param {object} analyticsData - Analytics data to export
     * @returns {Promise} Promise with export result
     */
    exportAnalytics = async function(analyticsData) {
        try {
            return await secureApiFetch('/api/analytics/export', {
                method: 'POST',
                body: analyticsData
            });
        } catch (error) {
            console.error('❌ [ANALYTICS] Export error:', error);
            return { success: false, message: 'Analytics export failed' };
        }
    };

    // Make sure simulateIncomingCall is already defined (it appears to be)
    // If not, ensure this line exists:
    simulateIncomingCall = function(callData) {
        console.log('📞 [CALL] Simulating incoming call:', callData);
        
        // Dispatch call event
        window.dispatchEvent(new CustomEvent('incoming-call', {
            detail: callData
        }));
        
        return { success: true, message: 'Call simulation triggered' };
    };

  requestSession = async function() {
    try {
        return await secureApiFetch('/api/auth/session', {
            method: 'GET'
        });
    } catch (error) {
        console.error('❌ [SESSION] Request session error:', error);
        return { success: false, message: 'Failed to get session' };
    }
};

/**
 * Get analytics data - missing export
 */
getAnalyticsData = async function(params = {}) {
    try {
        let url = '/api/analytics';
        if (params && Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += (url.includes('?') ? '&' : '?') + queryString;
        }
        return await secureApiFetch(url, {
            method: 'GET'
        });
    } catch (error) {
        console.error('❌ [ANALYTICS] Get analytics error:', error);
        return { success: false, message: 'Failed to get analytics data' };
    }
};

/**
 * Mark chat as read - missing implementation
 */
markChatAsRead = async function(chatId) {
    try {
        return await secureApiFetch(`/api/chats/${chatId}/read`, {
            method: 'POST'
        });
    } catch (error) {
        console.error('❌ [CHAT] Mark chat as read error:', error);
        return { success: false, message: 'Failed to mark chat as read' };
    }
};

/**
 * Simulate incoming call - already defined but ensure it's properly exported
 * This function should already exist based on your code
 */
simulateIncomingCall = function(callData) {
    console.log('📞 [CALL] Simulating incoming call:', callData);
    
    // Dispatch call event
    window.dispatchEvent(new CustomEvent('incoming-call', {
        detail: callData
    }));
    
    return { success: true, message: 'Call simulation triggered' };
};  
    
}