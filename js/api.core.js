// api.core.js - Core API infrastructure with Token Normalization, Environment Detection
// Version: 20.5.6 - Part 1 of 3: Core Infrastructure
// Date: 2024-01-02
// UPDATED: Added ALL missing exports based on console errors
// PATCHED: All API calls now use dynamically determined backend origin
// SAFETY: Added comprehensive error isolation to prevent crashes

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
let getTrustScoreDescription = null;
let navigateToCall = null;
let getUserFriends = null;
let navigateToChat = null;
let getUserGroups = null;
let showNotification = null;
let inviteTeamMember = null;
let acceptGroupInvite = null;
let getMessageTypes = null;

// NEW EXPORTS TO FIX MISSING ERRORS
let simulateContactSync = null;
let trackEvent = null;
let generateSampleMoodData = null;
let request = null; // ADDED for group-core.js error
let apiCallWithRetry = null; // ADDED for friend-ui.js error
let updateTeamMemberRole = null; // ADDED for Tool-core.js error

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
let getTeamMembers = null;
let getTrustScoreClass = null;
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
let acceptFriendRequest = null;
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
    getTeamMembers,
    getTrustScoreClass,
    getTrustScoreDescription,
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
    navigateToCall,
    getUserFriends,
    navigateToChat,
    getUserGroups,
    showNotification,
    inviteTeamMember,
    acceptGroupInvite,
    getMessageTypes,
    // NEW EXPORTS TO FIX ERRORS
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
     
    // ADDED MISSING EXPORTS BASED ON CONSOLE ERRORS
    login,
    logout,
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

// ============================================================================
// CRITICAL: DUPLICATE LOADING PREVENTION
// ============================================================================
if (window.__API_CORE_LOADED_V2) {
    // Exit early without throwing to prevent script loading errors
} else {
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

    let _cachedBackendUrl = null;
    determineBackendUrl = function() {
        if (_cachedBackendUrl !== null) {
            return _cachedBackendUrl;
        }
        
        try {
            // First, check if window.BACKEND_ORIGIN is set (manual override)
            if (window.BACKEND_ORIGIN) {
                _cachedBackendUrl = window.BACKEND_ORIGIN;
                console.log('[ENV] Using manually configured BACKEND_ORIGIN:', _cachedBackendUrl);
                return _cachedBackendUrl;
            }
            
            // Use window.location.origin for dynamic origin detection
            const currentOrigin = window.location.origin;
            const currentHostname = window.location.hostname;
            const currentProtocol = window.location.protocol;
            const currentPort = window.location.port;
            
            // Check if we're running locally
            const isLocalhost = currentHostname === 'localhost' || 
                               currentHostname === '127.0.0.1' || 
                               currentHostname.startsWith('192.168.') ||
                               currentHostname.startsWith('10.0.') ||
                               currentHostname === '[::1]' ||
                               (currentHostname === '' && (currentPort === '4000' || currentPort === '8080' || currentPort === '5500'));
            
            // Check if we're on a local development server (like Live Server)
            const isLocalDevelopment = currentHostname.includes('local') || 
                                     currentPort === '4000' || 
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
                // Use current origin but replace port with 4000 for backend
                backendUrl = currentOrigin.replace(/:\d+$/, ':4000');
                // Ensure we use the correct protocol and port
                if (backendUrl.includes('5500')) {
                    backendUrl = backendUrl.replace(':5500', ':4000');
                }
                if (!backendUrl.includes(':4000') && !backendUrl.includes('://localhost:') && !backendUrl.includes('://127.0.0.1:')) {
                    backendUrl = backendUrl.replace(/(:\d+)?$/, ':4000');
                }
            } else if (isRenderDeployment) {
                backendUrl = "https://moodchat-fy56.onrender.com";
            } else {
                // For VPS deployment, use same origin with port 4000
                backendUrl = currentOrigin.replace(/:\d+$/, ':4000');
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
            
            _cachedBackendUrl = backendUrl;
            return backendUrl;
        } catch (error) {
            console.error('[ENV] Error determining backend URL:', error);
            // Fallback to current origin with port 4000
            _cachedBackendUrl = window.location.origin.replace(/:\d+$/, ':4000');
            return _cachedBackendUrl;
        }
    };

    // Determine backend URL dynamically
    const BACKEND_BASE_URL = determineBackendUrl();

    // ============================================================================
    // CRITICAL FIX: PUBLIC VS PROTECTED ENDPOINT CLASSIFICATION
    // ============================================================================

    /**
     * PUBLIC ENDPOINTS - NEVER require tokens
     * These endpoints MUST work without any Authorization header
     */
    const PUBLIC_ENDPOINTS = [
        '/api/status',
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/forgot',
        '/api/auth/reset',
        '/api/auth/refresh',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/auth/login',
        '/auth/register',
        '/auth/forgot-password',
        '/auth/reset-password',
        '/auth/refresh',
        '/auth/health',
        '/health'
    ];

    /**
     * AUTH ENDPOINTS - Special handling for authentication flows
     * These are PUBLIC but have special timing considerations
     */
    const AUTH_ENDPOINTS = [
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/forgot',
        '/api/auth/reset',
        '/api/auth/refresh',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/auth/login',
        '/auth/register',
        '/auth/forgot-password',
        '/auth/reset-password',
        '/auth/refresh'
    ];

    /**
     * Check if an endpoint is public (no token required)
     * @param {string} endpoint - The API endpoint
     * @returns {boolean} True if public, false if protected
     */
    isPublicEndpoint = function(endpoint) {
        try {
            if (!endpoint || typeof endpoint !== 'string') return false;
            
            const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
            
            const isPublic = PUBLIC_ENDPOINTS.some(publicEndpoint => {
                if (normalizedEndpoint === publicEndpoint) return true;
                
                if (normalizedEndpoint.startsWith(publicEndpoint + '/')) return true;
                
                if (publicEndpoint === '/api/status' && normalizedEndpoint === '/status') return true;
                if (publicEndpoint === '/api/status' && normalizedEndpoint.startsWith('/status/')) return true;
                if (publicEndpoint === '/api/status' && normalizedEndpoint.startsWith('/status?')) return true;
                
                if (publicEndpoint === '/api/auth/login' && normalizedEndpoint === '/auth/login') return true;
                if (publicEndpoint === '/api/auth/register' && normalizedEndpoint === '/auth/register') return true;
                if (publicEndpoint === '/api/auth/forgot' && normalizedEndpoint === '/auth/forgot-password') return true;
                if (publicEndpoint === '/api/auth/reset' && normalizedEndpoint === '/auth/reset-password') return true;
                if (publicEndpoint === '/api/auth/refresh' && normalizedEndpoint === '/auth/refresh') return true;
                
                if (publicEndpoint.startsWith('/api/auth/') && normalizedEndpoint === publicEndpoint.replace('/api', '')) return true;
                
                return false;
            });
            
            return isPublic;
        } catch (error) {
            console.error('[ENDPOINT] Error checking public endpoint:', error);
            return false;
        }
    };

    /**
     * Check if an endpoint is an auth endpoint (special handling)
     * @param {string} endpoint - The API endpoint
     * @returns {boolean} True if auth endpoint, false otherwise
     */
    isAuthEndpoint = function(endpoint) {
        try {
            if (!endpoint || typeof endpoint !== 'string') return false;
            
            const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
            
            const isAuth = AUTH_ENDPOINTS.some(authEndpoint => 
                normalizedEndpoint === authEndpoint || 
                normalizedEndpoint.startsWith(authEndpoint + '/')
            );
            
            return isAuth;
        } catch (error) {
            console.error('[ENDPOINT] Error checking auth endpoint:', error);
            return false;
        }
    };

    /**
     * Check if an endpoint is a status endpoint (special handling)
     * @param {string} endpoint - The API endpoint
     * @returns {boolean} True if status endpoint, false otherwise
     */
    isStatusEndpoint = function(endpoint) {
        try {
            if (!endpoint || typeof endpoint !== 'string') return false;
            
            const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
            
            return normalizedEndpoint === '/api/status' || 
                   normalizedEndpoint.startsWith('/api/status?') ||
                   normalizedEndpoint.startsWith('/api/status/') ||
                   normalizedEndpoint === '/status' || 
                   normalizedEndpoint.startsWith('/status?') ||
                   normalizedEndpoint.startsWith('/status/');
        } catch (error) {
            console.error('[ENDPOINT] Error checking status endpoint:', error);
            return false;
        }
    };

    // ============================================================================
    // NEW FUNCTIONS TO FIX CONSOLE ERRORS
    // ============================================================================

    /**
     * Request function - missing export for group-core.js
     * @param {string} endpoint - The API endpoint
     * @param {object} options - Request options
     * @returns {Promise} Promise with response
     */
    request = async function(endpoint, options = {}) {
        try {
            return await globalApiFunction(endpoint, options);
        } catch (error) {
            console.error('[REQUEST] Error in request function:', error);
            return {
                success: false,
                message: 'Request failed',
                error: error.message
            };
        }
    };

    /**
     * API call with retry function - missing export for friend-ui.js
     * @param {string} endpoint - The API endpoint
     * @param {object} options - Request options
     * @param {number} maxRetries - Maximum number of retries
     * @returns {Promise} Promise with response
     */
    apiCallWithRetry = async function(endpoint, options = {}, maxRetries = 3) {
        try {
            let lastError;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const result = await secureApiFetch(endpoint, options);
                    
                    if (result.success || attempt === maxRetries) {
                        return result;
                    }
                    
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                } catch (error) {
                    lastError = error;
                    console.error(`[RETRY] Attempt ${attempt} failed:`, error);
                    
                    if (attempt === maxRetries) {
                        break;
                    }
                    
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            
            throw lastError || new Error(`API call failed after ${maxRetries} attempts`);
        } catch (error) {
            console.error('[API-RETRY] Error in apiCallWithRetry:', error);
            return {
                success: false,
                message: 'API call with retry failed',
                error: error.message
            };
        }
    };

    /**
     * Update team member role function - missing export for Tool-core.js
     * @param {string} teamId - Team ID
     * @param {string} memberId - Member ID
     * @param {string} role - New role
     * @returns {Promise} Promise with response
     */
    updateTeamMemberRole = async function(teamId, memberId, role) {
        try {
            return await secureApiFetch(`/api/teams/${teamId}/members/${memberId}/role`, {
                method: 'PUT',
                body: { role }
            });
        } catch (error) {
            console.error('[TEAM] Error updating team member role:', error);
            return { 
                success: false, 
                message: 'Failed to update team member role',
                error: error.message 
            };
        }
    };

    /**
     * Simulate contact sync - missing export for friend-core.js
     * @returns {object} Simulated contact sync result
     */
    simulateContactSync = function() {
        try {
            console.log('[FRIENDS] Simulating contact sync');
            return {
                success: true,
                message: 'Contact sync simulated',
                syncedContacts: 0,
                newContacts: 0
            };
        } catch (error) {
            console.error('[CONTACT] Error simulating contact sync:', error);
            return {
                success: false,
                message: 'Failed to simulate contact sync',
                error: error.message
            };
        }
    };

    /**
     * Track event - missing export for Tool-core.js
     * @param {string} eventName - Event name
     * @param {object} eventData - Event data
     * @returns {object} Tracking result
     */
    trackEvent = function(eventName, eventData = {}) {
        try {
            console.log(`[ANALYTICS] Tracking event: ${eventName}`, eventData);
            return {
                success: true,
                eventName,
                timestamp: new Date().toISOString(),
                data: eventData
            };
        } catch (error) {
            console.error('[TRACK] Error tracking event:', error);
            return {
                success: false,
                eventName,
                message: 'Failed to track event',
                error: error.message
            };
        }
    };

    /**
     * Generate sample mood data - missing export for status-ui.js
     * @returns {Array} Sample mood data
     */
    generateSampleMoodData = function() {
        try {
            const moods = ['happy', 'sad', 'excited', 'calm', 'anxious', 'tired'];
            const data = [];
            const now = new Date();
            
            for (let i = 0; i < 7; i++) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                
                data.push({
                    date: date.toISOString().split('T')[0],
                    mood: moods[Math.floor(Math.random() * moods.length)],
                    intensity: Math.floor(Math.random() * 100),
                    activities: ['work', 'social', 'exercise'].slice(0, Math.floor(Math.random() * 3) + 1)
                });
            }
            
            return data;
        } catch (error) {
            console.error('[MOOD] Error generating sample mood data:', error);
            return [];
        }
    };

    // ============================================================================
    // MISSING FUNCTIONS - ADDED FOR ERRORS
    // ============================================================================

    /**
     * Navigate to call function - missing export
     */
    navigateToCall = function(callId) {
        try {
            if (window.location.pathname.includes('chat.html')) {
                // If in chat page, navigate to call
                window.location.href = `/call.html?callId=${callId}`;
            } else {
                // Open in new tab
                window.open(`/call.html?callId=${callId}`, '_blank');
            }
            return { success: true, callId: callId };
        } catch (error) {
            console.error('[CALL] Error navigating to call:', error);
            return { success: false, message: 'Failed to navigate to call' };
        }
    };

    /**
     * Get user friends - missing export
     */
    getUserFriends = async function() {
        try {
            return await secureApiFetch('/api/friends', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[FRIENDS] Error getting user friends:', error);
            return { 
                success: false, 
                message: 'Failed to get friends',
                data: [] 
            };
        }
    };

    // ============================================================================
    // ADDED ALL MISSING FUNCTIONS BASED ON CONSOLE ERRORS
    // ============================================================================

    /**
     * Navigate to chat function - missing export for friend-core.js
     * @param {string} chatId - The chat ID to navigate to
     * @param {string} userId - The user ID for the chat
     * @returns {object} Navigation result
     */
    navigateToChat = function(chatId, userId = null) {
        try {
            let url = `/message.html`;
            if (chatId) {
                url += `?chatId=${chatId}`;
            } else if (userId) {
                url += `?userId=${userId}`;
            }
            
            if (window.location.pathname.includes('message.html')) {
                // If already in message page, update URL without reload
                window.history.pushState({}, '', url);
                window.dispatchEvent(new CustomEvent('chat-navigation', {
                    detail: { chatId, userId }
                }));
            } else {
                // Navigate to message page
                window.location.href = url;
            }
            
            return { success: true, chatId, userId };
        } catch (error) {
            console.error('[CHAT] Error navigating to chat:', error);
            return { success: false, message: 'Failed to navigate to chat' };
        }
    };

    /**
     * Get user groups function - missing export for Tool-core.js
     * @returns {Promise} Promise with user groups
     */
    getUserGroups = async function() {
        try {
            return await secureApiFetch('/api/group/user', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[GROUPS] Error getting user group:', error);
            return { 
                success: false, 
                message: 'Failed to get user group',
                data: [] 
            };
        }
    };

    /**
     * Show notification function - missing export for friend-core.js
     * @param {string} message - Notification message
     * @param {string} type - Notification type (info, success, warning, error)
     * @param {number} duration - Duration in milliseconds
     * @returns {object} Notification result
     */
    showNotification = function(message, type = 'info', duration = 3000) {
        try {
            // Create notification element
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.innerHTML = `
                <div class="notification-content">
                    <span class="notification-message">${escapeHtml(message)}</span>
                </div>
            `;
            
            // Style the notification
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 16px;
                background: ${type === 'success' ? '#4CAF50' : 
                           type === 'warning' ? '#FF9800' : 
                           type === 'error' ? '#F44336' : '#2196F3'};
                color: white;
                border-radius: 4px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 9999;
                max-width: 300px;
                animation: slideIn 0.3s ease;
            `;
            
            // Add to body
            document.body.appendChild(notification);
            
            // Remove after duration
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, duration);
            
            return { success: true, message: 'Notification shown' };
        } catch (error) {
            console.error('[NOTIFICATION] Error showing notification:', error);
            return { success: false, message: 'Failed to show notification' };
        }
    };

    /**
     * Invite team member function - missing export for Tool-core.js
     * @param {string} email - Email to invite
     * @param {string} role - Team role
     * @returns {Promise} Promise with invitation result
     */
    inviteTeamMember = async function(email, role = 'member') {
        try {
            return await secureApiFetch('/api/teams/invite', {
                method: 'POST',
                body: { email, role }
            });
        } catch (error) {
            console.error('[TEAM] Error inviting team member:', error);
            return { 
                success: false, 
                message: 'Failed to invite team member',
                error: error.message 
            };
        }
    };

    /**
     * Accept group invite function - missing export for group-core.js
     * @param {string} inviteId - Invitation ID
     * @returns {Promise} Promise with acceptance result
     */
    acceptGroupInvite = async function(inviteId) {
        try {
            return await secureApiFetch(`/api/group/invites/${inviteId}/accept`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('[GROUP] Error accepting group invite:', error);
            return { 
                success: false, 
                message: 'Failed to accept group invitation',
                error: error.message 
            };
        }
    };

    /**
     * Get message types constant - missing export for status-core.js
     * @returns {object} Message types object
     */
    getMessageTypes = function() {
        try {
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
                FRIEND_REJECT: 'friend_reject'
            };
        } catch (error) {
            console.error('[MESSAGES] Error getting message types:', error);
            return {
                TEXT: 'text',
                SYSTEM: 'system'
            };
        }
    };

    // ============================================================================
    // CENTRALIZED TOKEN MANAGEMENT FUNCTIONS
    // ============================================================================

    /**
     * Token migration function - migrates old tokens to centralized USER_TOKEN
     */
    function migrateOldTokens() {
        try {
            if (localStorage.getItem(TOKEN_MIGRATION_KEY) === 'true') {
                return true;
            }
            
            let migratedToken = null;
            
            const oldTokenLocations = [
                'accessToken',
                'moodchat_token',
                'token',
                'moodchat_auth_token',
                'authToken'
            ];
            
            for (const location of oldTokenLocations) {
                const oldToken = localStorage.getItem(location);
                if (oldToken && oldToken.trim() !== '' && 
                    oldToken !== 'null' && oldToken !== 'undefined' && 
                    oldToken.length > 10) {
                    migratedToken = oldToken;
                    break;
                }
            }
            
            try {
                const authUserStr = localStorage.getItem('authUser');
                if (authUserStr) {
                    const authUser = JSON.parse(authUserStr);
                    if (authUser.accessToken && authUser.accessToken.trim() !== '' && 
                        authUser.accessToken !== 'null' && authUser.accessToken !== 'undefined') {
                        migratedToken = authUser.accessToken;
                    } else if (authUser.token && authUser.token.trim() !== '' && 
                              authUser.token !== 'null' && authUser.token !== 'undefined') {
                        migratedToken = authUser.token;
                    }
                }
            } catch (error) {
                console.error('[TOKEN] Error reading authUser:', error);
            }
            
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
                            migratedUserData = userData;
                            break;
                        }
                    }
                }
                
                const authUserStr = localStorage.getItem('authUser');
                if (authUserStr && !migratedUserData) {
                    const authUser = JSON.parse(authUserStr);
                    if (authUser.user && (authUser.user.id || authUser.user.email || authUser.user.username)) {
                        migratedUserData = authUser.user;
                    } else if (authUser.id || authUser.email || authUser.username) {
                        migratedUserData = authUser;
                    }
                }
            } catch (error) {
                console.error('[TOKEN] Error migrating user data:', error);
            }
            
            if (migratedToken) {
                localStorage.setItem(USER_TOKEN_KEY, migratedToken);
                
                if (migratedUserData) {
                    localStorage.setItem(USER_DATA_KEY, JSON.stringify(migratedUserData));
                }
                
                localStorage.setItem(TOKEN_MIGRATION_KEY, 'true');
                return true;
            } else {
                localStorage.setItem(TOKEN_MIGRATION_KEY, 'true');
                return false;
            }
        } catch (error) {
            console.error('[TOKEN] Token migration error:', error);
            return false;
        }
    }

    /**
     * Get user token from centralized storage
     * @returns {string|null} The user token or null if not found
     */
    getUserToken = function() {
        try {
            const token = localStorage.getItem(USER_TOKEN_KEY);
            
            if (token && token.trim() !== '' && 
                token !== 'null' && token !== 'undefined' && 
                token.length > 10) {
                return token;
            }
            
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
                    localStorage.setItem(USER_TOKEN_KEY, legacyToken);
                    return legacyToken;
                }
            }
            
            try {
                const authUserStr = localStorage.getItem('authUser');
                if (authUserStr) {
                    const authUser = JSON.parse(authUserStr);
                    const tokenFromAuthUser = authUser.accessToken || authUser.token;
                    if (tokenFromAuthUser && tokenFromAuthUser.trim() !== '' && 
                        tokenFromAuthUser !== 'null' && tokenFromAuthUser !== 'undefined' && 
                        tokenFromAuthUser.length > 10) {
                        localStorage.setItem(USER_TOKEN_KEY, tokenFromAuthUser);
                        return tokenFromAuthUser;
                    }
                }
            } catch (error) {
                console.error('[TOKEN] Error reading authUser:', error);
            }
            
            return null;
        } catch (error) {
            console.error('[TOKEN] Error getting user token:', error);
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
                console.error('[TOKEN] Invalid token provided');
                return false;
            }
            
            localStorage.setItem(USER_TOKEN_KEY, token);
            localStorage.setItem('accessToken', token);
            localStorage.setItem('moodchat_token', token);
            return true;
        } catch (error) {
            console.error('[TOKEN] Error setting user token:', error);
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
            return true;
        } catch (error) {
            console.error('[TOKEN] Error clearing user token:', error);
            return false;
        }
    };

    /**
     * Set user data in centralized storage
     * @param {object} userData - The user data to store
     * @param {boolean} skipLegacy - Skip legacy storage (prevents loops)
     * @returns {boolean} True if successful
     */
    setUserData = function(userData, skipLegacy = false) {
        try {
            if (!userData || typeof userData !== 'object') {
                console.error('[TOKEN] Invalid user data provided');
                return false;
            }
            
            const safeUserData = JSON.parse(JSON.stringify(userData));
            
            localStorage.setItem(USER_DATA_KEY, JSON.stringify(safeUserData));
            
            window.currentUser = safeUserData;
            
            if (!skipLegacy) {
                localStorage.setItem('moodchat_auth_user', JSON.stringify(safeUserData));
                
                try {
                    const authUserStr = localStorage.getItem('authUser');
                    if (authUserStr) {
                        const authUser = JSON.parse(authUserStr);
                        authUser.user = safeUserData;
                        localStorage.setItem('authUser', JSON.stringify(authUser));
                    }
                } catch (error) {
                    console.error('[TOKEN] Error updating authUser:', error);
                }
            }
            
            return true;
        } catch (error) {
            console.error('[TOKEN] Error setting user data:', error);
            return false;
        }
    };

    /**
     * Clear all authentication data
     */
    clearAllAuthData = function() {
        try {
            localStorage.removeItem(USER_TOKEN_KEY);
            localStorage.removeItem(USER_DATA_KEY);
            localStorage.removeItem(SESSION_DATA_KEY);
            
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
        } catch (error) {
            console.error('[TOKEN] Error clearing auth data:', error);
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
        try {
            migrateOldTokens();
            
            const token = getUserToken();
            const userDataStr = localStorage.getItem(USER_DATA_KEY);
            let userData = null;
            
            try {
                if (userDataStr) {
                    userData = JSON.parse(userDataStr);
                }
            } catch (error) {
                console.error('[TOKEN] Error parsing user data:', error);
            }
            
            if (token || userData) {
                _tokenReady = true;
                if (_tokenReadyResolve) {
                    _tokenReadyResolve(true);
                }
            } else {
                _tokenReady = true;
                if (_tokenReadyResolve) {
                    _tokenReadyResolve(false);
                }
            }
            
            return { token, userData };
        } catch (error) {
            console.error('[TOKEN] Error initializing token system:', error);
            _tokenReady = true;
            if (_tokenReadyResolve) {
                _tokenReadyResolve(false);
            }
            return { token: null, userData: null };
        }
    };

    // ============================================================================
    // CENTRAL SESSION STORE
    // ============================================================================

    const _SESSION_ = {
        token: null,
        user: null,
        expires: null,
        validated: false,
        lastUpdated: null
    };

    function _initSessionFromStorage() {
        try {
            _SESSION_.token = getUserToken();
            
            const userDataStr = localStorage.getItem(USER_DATA_KEY);
            if (userDataStr) {
                _SESSION_.user = JSON.parse(userDataStr);
            }
            
            const sessionStr = localStorage.getItem(SESSION_DATA_KEY);
            if (sessionStr) {
                const sessionData = JSON.parse(sessionStr);
                _SESSION_.expires = sessionData.expires;
                _SESSION_.validated = sessionData.validated || false;
                _SESSION_.lastUpdated = sessionData.lastUpdated;
            }
        } catch (error) {
            console.error('[SESSION] Error initializing session from storage:', error);
        }
    }

    _initSessionFromStorage();

    // ============================================================================
    // RESTORED MISSING FUNCTIONS
    // ============================================================================

    /**
     * Get current user from storage
     * @returns {object|null} User object or null
     */
    getCurrentUser = function() {
        try {
            if (window.currentUser && typeof window.currentUser === 'object') {
                return window.currentUser;
            }
            
            const userDataStr = localStorage.getItem(USER_DATA_KEY);
            if (userDataStr) {
                const user = JSON.parse(userDataStr);
                window.currentUser = user;
                return user;
            }
            
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
                    console.error('[USER] Error parsing authUser:', error);
                }
            }
            
            return null;
        } catch (error) {
            console.error('[USER] Error getting current user:', error);
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
            
            return await validateAuth();
        } catch (error) {
            console.error('[SESSION] Error validating session:', error);
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
                console.error('[SESSION] Invalid session data provided');
                return false;
            }
            
            let existingSession = {};
            try {
                const sessionStr = localStorage.getItem(SESSION_DATA_KEY);
                if (sessionStr) {
                    existingSession = JSON.parse(sessionStr);
                }
            } catch (error) {
                console.error('[SESSION] Error reading existing session:', error);
            }
            
            const updatedSession = { ...existingSession, ...sessionData, lastUpdated: Date.now() };
            localStorage.setItem(SESSION_DATA_KEY, JSON.stringify(updatedSession));
            
            if (sessionData.expires) _SESSION_.expires = sessionData.expires;
            if (sessionData.validated !== undefined) _SESSION_.validated = sessionData.validated;
            _SESSION_.lastUpdated = Date.now();
            
            return true;
        } catch (error) {
            console.error('[SESSION] Error updating session:', error);
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
            console.error('[SESSION] Error getting session data:', error);
            return null;
        }
    };

    /**
     * Get session (alias for getSessionData)
     * @returns {object|null} Session data or null
     */
    getSession = function() {
        return getSessionData();
    };

    /**
     * Clear session data
     * @returns {boolean} True if successful
     */
    clearSession = function() {
        try {
            localStorage.removeItem(SESSION_DATA_KEY);
            
            _SESSION_.expires = null;
            _SESSION_.validated = false;
            _SESSION_.lastUpdated = null;
            
            return true;
        } catch (error) {
            console.error('[SESSION] Error clearing session:', error);
            return false;
        }
    };

    /**
     * Set session data (alias for updateSession)
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
     * Login function
     */
    login = async function(credentials) {
        try {
            const response = await secureApiFetch('/api/auth/login', {
                method: 'POST',
                body: credentials
            });
            
            if (response.success && response.token) {
                setUserToken(response.token);
                if (response.user) {
                    setUserData(response.user);
                }
                return response;
            }
            return response;
        } catch (error) {
            console.error('[AUTH] Login error:', error);
            return { success: false, message: 'Login failed' };
        }
    };

    /**
     * Logout function
     */
    logout = async function() {
        try {
            const response = await secureApiFetch('/api/auth/logout', {
                method: 'POST'
            });
            
            clearAllAuthData();
            
            return response;
        } catch (error) {
            console.error('[AUTH] Logout error:', error);
            clearAllAuthData();
            return { success: false, message: 'Logout failed' };
        }
    };

    /**
     * Clear chat history function
     */
    clearChatHistory = async function(chatId) {
        try {
            const response = await secureApiFetch(`/api/chats/${chatId}/history`, {
                method: 'DELETE'
            });
            return response;
        } catch (error) {
            console.error('[CHAT] Clear history error:', error);
            return { success: false, message: 'Failed to clear chat history' };
        }
    };

    // ============================================================================
    // NEW FUNCTIONS TO FIX MISSING EXPORTS
    // ============================================================================

    /**
     * Get team members function
     * @returns {Promise} Promise with team members
     */
    getTeamMembers = async function(teamId) {
        try {
            let url = '/api/teams/members';
            if (teamId) {
                url = `/api/teams/${teamId}/members`;
            }
            return await secureApiFetch(url, {
                method: 'GET'
            });
        } catch (error) {
            console.error('[TEAM] Get team members error:', error);
            return { 
                success: false, 
                message: 'Failed to get team members',
                data: [] 
            };
        }
    };

    /**
     * Get trust score class function
     * @param {number} score - Trust score (0-100)
     * @returns {string} CSS class for trust score
     */
    getTrustScoreClass = function(score) {
        if (!score && score !== 0) return 'trust-unknown';
        
        if (score >= 90) return 'trust-excellent';
        if (score >= 75) return 'trust-very-high';
        if (score >= 60) return 'trust-high';
        if (score >= 40) return 'trust-medium';
        if (score >= 25) return 'trust-low';
        return 'trust-very-low';
    };

    /**
     * Trust score description function
     * @param {number} score - Trust score (0-100)
     * @returns {string} Human-readable description
     */
    getTrustScoreDescription = function(score) {
        if (!score && score !== 0) return 'Unknown';
        
        if (score >= 90) return 'Excellent';
        if (score >= 75) return 'Very High';
        if (score >= 60) return 'High';
        if (score >= 40) return 'Medium';
        if (score >= 25) return 'Low';
        return 'Very Low';
    };

    // ============================================================================
    // ADDITIONAL COMMON API FUNCTIONS
    // ============================================================================

    /**
     * Main API function
     */
    api = async function(endpoint, options = {}) {
        try {
            return await globalApiFunction(endpoint, options);
        } catch (error) {
            console.error('[API] Error in api function:', error);
            return {
                success: false,
                message: 'API call failed',
                error: error.message
            };
        }
    };

    /**
     * Register function
     */
    register = async function(userData) {
        try {
            return await secureApiFetch('/api/auth/register', {
                method: 'POST',
                body: userData
            });
        } catch (error) {
            console.error('[AUTH] Register error:', error);
            return { success: false, message: 'Registration failed' };
        }
    };

    /**
     * Forgot password function
     */
    forgotPassword = async function(email) {
        try {
            return await secureApiFetch('/api/auth/forgot', {
                method: 'POST',
                body: { email }
            });
        } catch (error) {
            console.error('[AUTH] Forgot password error:', error);
            return { success: false, message: 'Failed to send reset email' };
        }
    };

    /**
     * Reset password function
     */
    resetPassword = async function(token, newPassword) {
        try {
            return await secureApiFetch('/api/auth/reset', {
                method: 'POST',
                body: { token, newPassword }
            });
        } catch (error) {
            console.error('[AUTH] Reset password error:', error);
            return { success: false, message: 'Failed to reset password' };
        }
    };

    /**
     * Refresh token function
     */
    refreshToken = async function() {
        try {
            return await secureApiFetch('/api/auth/refresh', {
                method: 'POST'
            });
        } catch (error) {
            console.error('[AUTH] Refresh token error:', error);
            return { success: false, message: 'Failed to refresh token' };
        }
    };

    /**
     * Check auth function
     */
    checkAuth = async function() {
        try {
            return await validateAuth();
        } catch (error) {
            console.error('[AUTH] Check auth error:', error);
            return false;
        }
    };

    /**
     * Check auth/me endpoint
     */
    checkAuthMe = async function() {
        try {
            return await secureApiFetch('/api/auth/me', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[AUTH] Check auth/me error:', error);
            return { success: false, message: 'Failed to check auth' };
        }
    };

    /**
     * Get profile function
     */
    getProfile = async function() {
        try {
            return await secureApiFetch('/api/users/profile', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[PROFILE] Get profile error:', error);
            return { success: false, message: 'Failed to get profile' };
        }
    };

    /**
     * Update profile function
     */
    updateProfile = async function(profileData) {
        try {
            return await secureApiFetch('/api/users/profile', {
                method: 'PUT',
                body: profileData
            });
        } catch (error) {
            console.error('[PROFILE] Update profile error:', error);
            return { success: false, message: 'Failed to update profile' };
        }
    };

    /**
     * Change password function
     */
    changePassword = async function(currentPassword, newPassword) {
        try {
            return await secureApiFetch('/api/users/change-password', {
                method: 'POST',
                body: { currentPassword, newPassword }
            });
        } catch (error) {
            console.error('[PROFILE] Change password error:', error);
            return { success: false, message: 'Failed to change password' };
        }
    };

    /**
     * Delete account function
     */
    deleteAccount = async function() {
        try {
            return await secureApiFetch('/api/users/delete-account', {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('[PROFILE] Delete account error:', error);
            return { success: false, message: 'Failed to delete account' };
        }
    };

    /**
     * Get online users function
     */
    getOnlineUsers = async function() {
        try {
            return await secureApiFetch('/api/users/online', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[USERS] Get online users error:', error);
            return { success: false, message: 'Failed to get online users' };
        }
    };

    /**
     * Search users function
     */
    searchUsers = async function(query) {
        try {
            return await secureApiFetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
                method: 'GET'
            });
        } catch (error) {
            console.error('[USERS] Search users error:', error);
            return { success: false, message: 'Failed to search users' };
        }
    };

    /**
     * Send friend request function
     */
    sendFriendRequest = async function(userId) {
        try {
            return await secureApiFetch('/api/friends/request', {
                method: 'POST',
                body: { userId }
            });
        } catch (error) {
            console.error('[FRIENDS] Send friend request error:', error);
            return { success: false, message: 'Failed to send friend request' };
        }
    };

    /**
     * Accept friend request function
     * @param {string} requestId - The friend request ID to accept
     * @returns {Promise<object>} API response
     */
    acceptFriendRequest = async function(requestId) {
        try {
            return await secureApiFetch(`/api/friends/accept/${requestId}`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('[FRIENDS] Accept friend request error:', error);
            return { success: false, message: 'Failed to accept friend request' };
        }
    };

    /**
     * Reject friend request function
     */
    rejectFriendRequest = async function(requestId) {
        try {
            return await secureApiFetch(`/api/friends/reject/${requestId}`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('[FRIENDS] Reject friend request error:', error);
            return { success: false, message: 'Failed to reject friend request' };
        }
    };

    /**
     * Remove friend function
     */
    removeFriend = async function(friendId) {
        try {
            return await secureApiFetch(`/api/friends/remove/${friendId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('[FRIENDS] Remove friend error:', error);
            return { success: false, message: 'Failed to remove friend' };
        }
    };

    /**
     * Get friends function
     */
    getFriends = async function() {
        try {
            return await secureApiFetch('/api/friends', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[FRIENDS] Get friends error:', error);
            return { success: false, message: 'Failed to get friends' };
        }
    };

    /**
     * Get friend requests function
     */
    getFriendRequests = async function() {
        try {
            return await secureApiFetch('/api/friends/requests', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[FRIENDS] Get friend requests error:', error);
            return { success: false, message: 'Failed to get friend requests' };
        }
    };

    /**
     * Get conversations function
     */
    getConversations = async function() {
        try {
            return await secureApiFetch('/api/chats/conversations', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[CHAT] Get conversations error:', error);
            return { success: false, message: 'Failed to get conversations' };
        }
    };

    /**
     * Get messages function
     */
    getMessages = async function(chatId, limit = 50, offset = 0) {
        try {
            return await secureApiFetch(`/api/chats/${chatId}/messages?limit=${limit}&offset=${offset}`, {
                method: 'GET'
            });
        } catch (error) {
            console.error('[CHAT] Get messages error:', error);
            return { success: false, message: 'Failed to get messages' };
        }
    };

    /**
     * Send message function
     */
    sendMessage = async function(chatId, content) {
        try {
            return await secureApiFetch(`/api/chats/${chatId}/messages`, {
                method: 'POST',
                body: { content }
            });
        } catch (error) {
            console.error('[CHAT] Send message error:', error);
            return { success: false, message: 'Failed to send message' };
        }
    };

    /**
     * Mark messages as read function
     */
    markMessagesAsRead = async function(chatId, messageIds) {
        try {
            return await secureApiFetch(`/api/chats/${chatId}/messages/read`, {
                method: 'POST',
                body: { messageIds }
            });
        } catch (error) {
            console.error('[CHAT] Mark messages as read error:', error);
            return { success: false, message: 'Failed to mark messages as read' };
        }
    };

    /**
     * Delete message function
     */
    deleteMessage = async function(chatId, messageId) {
        try {
            return await secureApiFetch(`/api/chats/${chatId}/messages/${messageId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('[CHAT] Delete message error:', error);
            return { success: false, message: 'Failed to delete message' };
        }
    };

    /**
     * Create group function
     */
    createGroup = async function(groupData) {
        try {
            return await secureApiFetch('/api/group', {
                method: 'POST',
                body: groupData
            });
        } catch (error) {
            console.error('[GROUP] Create group error:', error);
            return { success: false, message: 'Failed to create group' };
        }
    };

    /**
     * Get groups function
     */
    getGroups = async function() {
        try {
            return await secureApiFetch('/api/group', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[GROUP] Get groups error:', error);
            return { success: false, message: 'Failed to get groups' };
        }
    };

    /**
     * Get group details function
     */
    getGroupDetails = async function(groupId) {
        try {
            return await secureApiFetch(`/api/group/${groupId}`, {
                method: 'GET'
            });
        } catch (error) {
            console.error('[GROUP] Get group details error:', error);
            return { success: false, message: 'Failed to get group details' };
        }
    };

    /**
     * Update group function
     */
    updateGroup = async function(groupId, groupData) {
        try {
            return await secureApiFetch(`/api/group/${groupId}`, {
                method: 'PUT',
                body: groupData
            });
        } catch (error) {
            console.error('[GROUP] Update group error:', error);
            return { success: false, message: 'Failed to update group' };
        }
    };

    /**
     * Delete group function
     */
    deleteGroup = async function(groupId) {
        try {
            return await secureApiFetch(`/api/group/${groupId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('[GROUP] Delete group error:', error);
            return { success: false, message: 'Failed to delete group' };
        }
    };

    /**
     * Add group member function
     */
    addGroupMember = async function(groupId, userId) {
        try {
            return await secureApiFetch(`/api/group/${groupId}/members`, {
                method: 'POST',
                body: { userId }
            });
        } catch (error) {
            console.error('[GROUP] Add group member error:', error);
            return { success: false, message: 'Failed to add group member' };
        }
    };

    /**
     * Remove group member function
     */
    removeGroupMember = async function(groupId, userId) {
        try {
            return await secureApiFetch(`/api/group/${groupId}/members/${userId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('[GROUP] Remove group member error:', error);
            return { success: false, message: 'Failed to remove group member' };
        }
    };

    /**
     * Leave group function
     */
    leaveGroup = async function(groupId) {
        try {
            return await secureApiFetch(`/api/group/${groupId}/leave`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('[GROUP] Leave group error:', error);
            return { success: false, message: 'Failed to leave group' };
        }
    };

    /**
     * Get notifications function
     */
    getNotifications = async function() {
        try {
            return await secureApiFetch('/api/notifications', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[NOTIFICATIONS] Get notifications error:', error);
            return { success: false, message: 'Failed to get notifications' };
        }
    };

    /**
     * Mark notification as read function
     */
    markNotificationAsRead = async function(notificationId) {
        try {
            return await secureApiFetch(`/api/notifications/${notificationId}/read`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('[NOTIFICATIONS] Mark notification as read error:', error);
            return { success: false, message: 'Failed to mark notification as read' };
        }
    };

    /**
     * Delete notification function
     */
    deleteNotification = async function(notificationId) {
        try {
            return await secureApiFetch(`/api/notifications/${notificationId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('[NOTIFICATIONS] Delete notification error:', error);
            return { success: false, message: 'Failed to delete notification' };
        }
    };

    /**
     * Clear all notifications function
     */
    clearAllNotifications = async function() {
        try {
            return await secureApiFetch('/api/notifications/clear', {
                method: 'POST'
            });
        } catch (error) {
            console.error('[NOTIFICATIONS] Clear all notifications error:', error);
            return { success: false, message: 'Failed to clear all notifications' };
        }
    };

    /**
     * Get call history function
     */
    getCallHistory = async function() {
        try {
            return await secureApiFetch('/api/calls/history', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[CALLS] Get call history error:', error);
            return { success: false, message: 'Failed to get call history' };
        }
    };

    /**
     * Start call function
     */
    startCall = async function(userId) {
        try {
            return await secureApiFetch('/api/calls/start', {
                method: 'POST',
                body: { userId }
            });
        } catch (error) {
            console.error('[CALLS] Start call error:', error);
            return { success: false, message: 'Failed to start call' };
        }
    };

    /**
     * End call function
     */
    endCall = async function(callId) {
        try {
            return await secureApiFetch(`/api/calls/${callId}/end`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('[CALLS] End call error:', error);
            return { success: false, message: 'Failed to end call' };
        }
    };

    /**
     * Get settings function
     */
    getSettings = async function() {
        try {
            return await secureApiFetch('/api/settings', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[SETTINGS] Get settings error:', error);
            return { success: false, message: 'Failed to get settings' };
        }
    };

    /**
     * Update settings function
     */
    updateSettings = async function(settings) {
        try {
            return await secureApiFetch('/api/settings', {
                method: 'PUT',
                body: settings
            });
        } catch (error) {
            console.error('[SETTINGS] Update settings error:', error);
            return { success: false, message: 'Failed to update settings' };
        }
    };

    /**
     * Upload file function
     */
    uploadFile = async function(file, type = 'general') {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', type);
            
            return await secureApiFetch('/api/files/upload', {
                method: 'POST',
                body: formData,
                headers: {}
            });
        } catch (error) {
            console.error('[FILES] Upload file error:', error);
            return { success: false, message: 'Failed to upload file' };
        }
    };

    /**
     * Delete file function
     */
    deleteFile = async function(fileId) {
        try {
            return await secureApiFetch(`/api/files/${fileId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            console.error('[FILES] Delete file error:', error);
            return { success: false, message: 'Failed to delete file' };
        }
    };

    /**
     * Get file function
     */
    getFile = async function(fileId) {
        try {
            return await secureApiFetch(`/api/files/${fileId}`, {
                method: 'GET'
            });
        } catch (error) {
            console.error('[FILES] Get file error:', error);
            return { success: false, message: 'Failed to get file' };
        }
    };

    // ============================================================================
    // NETWORK STATUS FUNCTIONS
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
            
            if (window.AppNetwork) {
                window.AppNetwork.updateBackendStatus(response.ok);
            }
            
            if (!response.ok) {
                console.error(`❌ Backend check failed: ${response.status} ${response.statusText}`);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error(`❌ Network status check failed: ${error.message}`);
            
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
        try {
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
        } catch (error) {
            console.error('[UTILS] Debounce error:', error);
            return func;
        }
    };

    /**
     * Throttle function
     */
    throttle = function(func, limit) {
        try {
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
        } catch (error) {
            console.error('[UTILS] Throttle error:', error);
            return func;
        }
    };

    /**
     * Generate ID function
     */
    generateId = function() {
        try {
            return 'id_' + Math.random().toString(36).substr(2, 9);
        } catch (error) {
            console.error('[UTILS] Generate ID error:', error);
            return 'id_' + Date.now();
        }
    };

    /**
     * Format date function
     */
    formatDate = function(date) {
        try {
            const d = new Date(date);
            return d.toLocaleDateString();
        } catch (error) {
            console.error('[UTILS] Format date error:', error);
            return 'Invalid Date';
        }
    };

    /**
     * Format time function
     */
    formatTime = function(date) {
        try {
            const d = new Date(date);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (error) {
            console.error('[UTILS] Format time error:', error);
            return 'Invalid Time';
        }
    };

    // ============================================================================
    // EVENT EMITTER FUNCTIONS
    // ============================================================================

    const eventEmitter = {
        events: {},
        
        emit(event, data) {
            try {
                if (this.events[event]) {
                    this.events[event].forEach(callback => callback(data));
                }
            } catch (error) {
                console.error('[EMITTER] Error emitting event:', error);
            }
        },
        
        on(event, callback) {
            try {
                if (!this.events[event]) {
                    this.events[event] = [];
                }
                this.events[event].push(callback);
            } catch (error) {
                console.error('[EMITTER] Error adding event listener:', error);
            }
        },
        
        off(event, callback) {
            try {
                if (this.events[event]) {
                    this.events[event] = this.events[event].filter(cb => cb !== callback);
                }
            } catch (error) {
                console.error('[EMITTER] Error removing event listener:', error);
            }
        },
        
        once(event, callback) {
            try {
                const onceCallback = (data) => {
                    callback(data);
                    this.off(event, onceCallback);
                };
                this.on(event, onceCallback);
            } catch (error) {
                console.error('[EMITTER] Error adding once event listener:', error);
            }
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
     * Secure fetch function
     * @param {string} url - The FULLY BUILT URL to fetch
     * @param {object} options - Fetch options
     * @returns {Promise} Promise with response
     */
    secureFetch = async function(url, options = {}) {
        // FIX: Handle HTTP method passed as URL (error in settings-core.js)
        if (url === 'GET' || url === 'POST' || url === 'PUT' || 
            url === 'DELETE' || url === 'PATCH') {
            console.error('[SECURE-FETCH] ERROR: HTTP method passed as URL:', url);
            console.error('[SECURE-FETCH] This indicates a bug in the calling code');
            
            // Return a proper error response instead of making a failed request
            return {
                ok: false,
                success: false,
                status: 0,
                statusText: 'Invalid Request',
                data: { 
                    message: 'HTTP method cannot be used as URL',
                    error: 'URL cannot be HTTP method',
                    details: `Called with: "${url}"`
                },
                headers: {},
                url: '',
                invalidRequest: true,
                methodPassedAsUrl: true
            };
        }
        
        // Also check if url contains just a method (like "GET/api/settings")
        if (url.includes('/GET') || url.includes('/POST') || url.includes('/PUT') || 
            url.includes('/DELETE') || url.includes('/PATCH')) {
            console.error('[SECURE-FETCH] WARNING: URL contains HTTP method:', url);
        }
        
        const endpoint = url.replace(BACKEND_BASE_URL, '');
        
        const isPublic = isPublicEndpoint(endpoint);
        const isStatus = isStatusEndpoint(endpoint);
        const isAuth = isAuthEndpoint(endpoint);
        
        if (!isPublic) {
            if (!_tokenReady) {
                await tokenReady();
            }
        }
        
        const token = getUserToken();
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (token && !isPublic && !isAuth && !isStatus && 
            !headers['Authorization'] && !headers['authorization']) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const fetchOptions = {
            ...options,
            headers,
            credentials: 'include'
        };
        
        try {
            const response = await fetch(url, fetchOptions);
            
            if (response.status === 401) {
                if (isPublic || isStatus || isAuth) {
                    window.dispatchEvent(new CustomEvent('public-endpoint-401', {
                        detail: { url, endpoint, timestamp: new Date().toISOString() }
                    }));
                } else {
                    clearAllAuthData();
                    
                    window.dispatchEvent(new CustomEvent('unauthorized', {
                        detail: { url, timestamp: new Date().toISOString() }
                    }));
                }
            }
            
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch (jsonError) {
                    console.error(`[SECURE-FETCH] JSON parsing error for ${url}:`, jsonError);
                    data = { 
                        message: 'Invalid JSON response from server',
                        error: jsonError.message 
                    };
                }
            } else {
                try {
                    data = await response.text();
                } catch (textError) {
                    console.error(`[SECURE-FETCH] Text parsing error for ${url}:`, textError);
                    data = { 
                        message: 'Failed to parse response',
                        error: textError.message 
                    };
                }
            }
            
            const normalizedResponse = _normalizeApiResponse(data, response);
            
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
            console.error(`❌ Network error for ${url}: ${error.message}`);
            
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
            
            let errorMessage = 'Network Error';
            if (isTimeoutError) errorMessage = 'Request Timeout';
            if (isDNSError) errorMessage = 'DNS Resolution Failed';
            
            if (window.AppNetwork && (isNetworkError || isTimeoutError || isDNSError)) {
                window.AppNetwork.updateBackendStatus(false);
            }
            
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
     */
    function _normalizeApiResponse(data, response) {
        try {
            const token = 
                data?.accessToken ||
                data?.token ||
                data?.jwt ||
                data?.access_token ||
                data?.tokens?.accessToken ||
                data?.data?.accessToken ||
                data?.data?.token ||
                null;
            
            const success = 
                data?.success === true ||
                response?.ok === true ||
                !!token;
            
            const user = 
                data?.user ||
                data?.data?.user ||
                data?.data ||
                (data?.success === true && data?.data) ||
                null;
            
            const message = 
                data?.message ||
                data?.msg ||
                (success ? "Request successful" : "Request failed");
            
            return {
                ok: success,
                success,
                token,
                user,
                data,
                message,
                raw: response
            };
        } catch (error) {
            console.error('[API] Error normalizing API response:', error);
            return {
                ok: false,
                success: false,
                token: null,
                user: null,
                data: { message: 'Failed to normalize response' },
                message: 'Response normalization error'
            };
        }
    }

    /**
     * Secure API fetch - accepts fully-built endpoint from api.request.js
     * @param {string} endpoint - FULLY BUILT endpoint (e.g., '/api/auth/login')
     * @param {object} options - Fetch options
     * @returns {Promise} Promise with response
     */
    secureApiFetch = async function(endpoint, options = {}) {
        // FIX: Handle HTTP method passed as endpoint (error in settings-core.js)
        if (endpoint === 'GET' || endpoint === 'POST' || endpoint === 'PUT' || 
            endpoint === 'DELETE' || endpoint === 'PATCH') {
            console.error('[SECURE-API-FETCH] ERROR: HTTP method passed as endpoint:', endpoint);
            console.error('[SECURE-API-FETCH] This indicates a bug in the calling code');
            
            // Return error without making request
            return {
                ok: false,
                success: false,
                status: 0,
                statusText: 'Invalid Request',
                data: { 
                    message: 'HTTP method cannot be used as endpoint',
                    error: 'Endpoint cannot be HTTP method',
                    details: `Called with: "${endpoint}"`
                },
                headers: {},
                url: '',
                invalidRequest: true,
                methodPassedAsEndpoint: true
            };
        }
        
        try {
            let fullUrl;
            if (endpoint.startsWith('http')) {
                fullUrl = endpoint;
            } else {
                const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
                const cleanBase = BACKEND_BASE_URL.endsWith('/') ? BACKEND_BASE_URL.slice(0, -1) : BACKEND_BASE_URL;
                fullUrl = cleanBase + cleanEndpoint;
            }
            return await secureFetch(fullUrl, options);
        } catch (error) {
            console.error('[SECURE-API-FETCH] Error in secureApiFetch:', error);
            return {
                ok: false,
                success: false,
                status: 0,
                statusText: 'Secure API fetch failed',
                data: { 
                    message: 'Secure API fetch error',
                    error: error.message 
                },
                headers: {},
                url: endpoint,
                fetchError: true
            };
        }
    };

    // ============================================================================
    // MANDATORY TOKEN NORMALIZATION: getValidToken() HELPER FUNCTION
    // ============================================================================
    /**
     * getValidToken() - Authoritative token retrieval helper
     */
    getValidToken = function() {
        return getUserToken();
    };

    // ============================================================================
    // SINGLE SOURCE OF TRUTH - NETWORK STATE (COMPLETELY SEPARATE FROM AUTH)
    // ============================================================================

    if (!window.AppNetwork) {
        const networkState = {
            isOnline: navigator.onLine,
            isBackendReachable: null,
            lastChecked: new Date().toISOString(),
            
            updateOnlineStatus: function(status) {
                try {
                    this.isOnline = status;
                    this.lastChecked = new Date().toISOString();
                    
                    try {
                        window.dispatchEvent(new CustomEvent('network-state-changed', {
                            detail: { 
                                isOnline: status, 
                                isBackendReachable: this.isBackendReachable 
                            }
                        }));
                    } catch (e) {
                        console.error('[NETWORK] Could not dispatch event:', e);
                    }
                } catch (error) {
                    console.error('[NETWORK] Error updating online status:', error);
                }
            },
            
            updateBackendStatus: function(status) {
                try {
                    if (status === true || status === false) {
                        this.isBackendReachable = status;
                        this.lastChecked = new Date().toISOString();
                    }
                } catch (error) {
                    console.error('[NETWORK] Error updating backend status:', error);
                }
            }
        };
        
        window.AppNetwork = networkState;
        
        window.addEventListener('online', () => {
            window.AppNetwork.updateOnlineStatus(true);
        });
        
        window.addEventListener('offline', () => {
            window.AppNetwork.updateOnlineStatus(false);
            window.AppNetwork.updateBackendStatus(false);
        });
    }

    // ============================================================================
    // UPDATED getAuthHeaders() FUNCTION WITH PUBLIC ENDPOINT CHECK
    // ============================================================================
    /**
     * getAuthHeaders() - Helper function to get authentication headers
     * @param {string} endpoint - The API endpoint to determine if auth is needed
     * @returns {object} Headers object with Authorization if token exists and endpoint requires it
     */
    getAuthHeaders = function(endpoint) {
        try {
            if (isPublicEndpoint(endpoint)) {
                return {};
            }
            
            if (isStatusEndpoint(endpoint)) {
                return {};
            }
            
            if (isAuthEndpoint(endpoint)) {
                return {};
            }
            
            const token = getValidToken();
            if (token) {
                return { 'Authorization': `Bearer ${token}` };
            }
            
            return {};
        } catch (error) {
            console.error('[AUTH] Error getting auth headers:', error);
            return {};
        }
    };

    // ============================================================================
    // GLOBAL TOKEN VARIABLE - ENHANCED PERSISTENCE
    // ============================================================================
    /**
     * Global access token variable with enhanced persistence
     */
    let accessToken = null;

    // Function to initialize and update the global access token
    updateGlobalAccessToken = function() {
        try {
            accessToken = getValidToken();
            
            if (accessToken) {
                window.dispatchEvent(new CustomEvent('token-loaded', {
                    detail: { token: accessToken, source: 'authoritative' }
                }));
            } else {
                accessToken = null;
                
                window.dispatchEvent(new CustomEvent('token-not-found'));
            }
        } catch (error) {
            console.error('[TOKEN] Error updating global access token:', error);
            accessToken = null;
        }
    };

    // Initialize global token on script load
    updateGlobalAccessToken();

    // Listen for storage events to sync token across tabs
    window.addEventListener('storage', (event) => {
        try {
            if (event.key === USER_TOKEN_KEY || event.key === 'accessToken' || event.key === 'moodchat_token' || 
                event.key === 'token' || event.key === 'moodchat_auth_token' || 
                event.key === 'authUser' || event.key === USER_DATA_KEY) {
                updateGlobalAccessToken();
                
                if (accessToken) {
                    setTimeout(() => {
                        window.api.checkAuthMe().catch(() => {});
                    }, 100);
                }
            }
        } catch (error) {
            console.error('[STORAGE] Error handling storage event:', error);
        }
    });

    // ============================================================================
    // TOKEN MANAGEMENT - SINGLE SOURCE OF TRUTH
    // ============================================================================
    const TOKEN_STORAGE_KEY = 'authUser';
    const ACCESS_TOKEN_KEY = 'accessToken';
    const MOODCHAT_TOKEN_KEY = 'moodchat_token';

    // ============================================================================
    // AUTHENTICATION STATE TIMING FIX
    // ============================================================================
    let _authValidationInProgress = false;
    let _authValidated = false;
    let _authValidationPromise = null;
    let _authLastChecked = 0;
    const AUTH_VALIDATION_TIMEOUT = 10000;
    const AUTH_CACHE_DURATION = 5 * 60 * 1000;

    /**
     * Store token in ALL locations for reliability
     */
    function _storeTokenInAllLocations(token, user, refreshToken = null) {
        try {
            if (!token || token.trim() === "" || token === "null" || token === "undefined") {
                console.error('[AUTH] Cannot store invalid token');
                return false;
            }
            
            setUserToken(token);
            
            localStorage.setItem(ACCESS_TOKEN_KEY, token);
            localStorage.setItem(MOODCHAT_TOKEN_KEY, token);
            
            let authData = {
                accessToken: token,
                token: token,
                user: user || {},
                tokenTimestamp: Date.now(),
                authValidated: false
            };
            
            if (refreshToken) {
                authData.refreshToken = refreshToken;
            }
            
            localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(authData));
            
            localStorage.setItem('token', token);
            localStorage.setItem('moodchat_auth_token', token);
            
            if (user) {
                setUserData(user, true);
            }
            
            return true;
        } catch (error) {
            console.error('[AUTH] Error storing token in all locations:', error);
            return false;
        }
    }

    /**
     * Extracts token from ANY backend response format
     */
    function _extractTokenFromResponse(responseData) {
        try {
            if (!responseData) return null;
            
            if (responseData.accessToken) {
                return responseData.accessToken;
            }
            if (responseData.tokens && responseData.tokens.accessToken) {
                return responseData.tokens.accessToken;
            }
            if (responseData.token) {
                return responseData.token;
            }
            
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
        } catch (error) {
            console.error('[TOKEN] Error extracting token from response:', error);
            return null;
        }
    }

    /**
     * Extracts user data from ANY backend response format
     */
    function _extractUserFromResponse(responseData) {
        try {
            if (!responseData) return null;
            
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
        } catch (error) {
            console.error('[USER] Error extracting user from response:', error);
            return null;
        }
    }

    /**
     * Stores normalized auth data with CONSISTENT format in ALL locations
     */
    function _storeAuthData(token, user, refreshToken = null) {
        try {
            if (!token || token.trim() === "" || token === "null" || token === "undefined") {
                console.error('[AUTH] Cannot store auth data without valid token');
                return false;
            }
            
            const storageSuccess = _storeTokenInAllLocations(token, user, refreshToken);
            if (!storageSuccess) {
                return false;
            }
            
            accessToken = token;
            
            window.currentUser = user || {};
            
            _authValidated = false;
            _authValidationPromise = null;
            
            window.dispatchEvent(new CustomEvent('auth-data-stored', {
                detail: { token: token, user: user, timestamp: new Date().toISOString() }
            }));
            
            return true;
        } catch (error) {
            console.error('[AUTH] Error storing auth data:', error);
            return false;
        }
    }

    /**
     * Clears ALL auth data from ALL locations
     */
    function _clearAllAuthData() {
        try {
            const currentUserBeforeClear = window.currentUser;
            
            clearAllAuthData();
            
            accessToken = null;
            
            _authValidated = false;
            _authValidationPromise = null;
            _authValidationInProgress = false;
            
            window.currentUser = currentUserBeforeClear;
            
            window.dispatchEvent(new CustomEvent('auth-data-cleared'));
            
            handleUnauthorizedAccess();
        } catch (error) {
            console.error('[AUTH] Error clearing all auth data:', error);
        }
    }

    /**
     * Gets the current user from storage
     */
    function _getCurrentUserFromStorage() {
        try {
            if (window.currentUser) {
                return window.currentUser;
            }
            
            const userDataStr = localStorage.getItem(USER_DATA_KEY);
            if (userDataStr) {
                const user = JSON.parse(userDataStr);
                window.currentUser = user;
                return user;
            }
            
            const authDataStr = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!authDataStr) {
                const legacyUser = localStorage.getItem('moodchat_auth_user');
                if (legacyUser) {
                    const user = JSON.parse(legacyUser);
                    window.currentUser = user;
                    return user;
                }
                
                return null;
            }
            
            const authData = JSON.parse(authDataStr);
            const user = authData.user || null;
            if (user) {
                window.currentUser = user;
            }
            return user;
        } catch (error) {
            console.error('[AUTH] Error reading user from storage:', error);
            return null;
        }
    }

    // ============================================================================
    // ENHANCED UNAUTHORIZED ACCESS HANDLING WITH PUBLIC ENDPOINT PROTECTION
    // ============================================================================
    let _unauthorizedAccessInProgress = false;
    let _lastUnauthorizedAccessTime = 0;
    const UNAUTHORIZED_ACCESS_COOLDOWN = 1000;

    handleUnauthorizedAccess = function() {
        const now = Date.now();
        
        if (_unauthorizedAccessInProgress || (now - _lastUnauthorizedAccessTime < UNAUTHORIZED_ACCESS_COOLDOWN)) {
            return;
        }
        
        _unauthorizedAccessInProgress = true;
        _lastUnauthorizedAccessTime = now;
        
        try {
            localStorage.setItem('_auth_clearing_in_progress', 'true');
            
            _clearAllAuthData();
            
            localStorage.removeItem('_auth_clearing_in_progress');
        } catch (error) {
            console.error('[AUTH] Error clearing auth data:', error);
        }
        
        setTimeout(() => {
            try {
                if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('index.html')) {
                    window.location.href = "/login";
                }
            } catch (redirectError) {
                console.error('[AUTH] Error redirecting to login:', redirectError);
                
                try {
                    window.location.reload();
                } catch (reloadError) {
                    console.error('[AUTH] Error reloading page:', reloadError);
                }
            } finally {
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
     */
    validateAuth = async function() {
        if (_authValidationInProgress && _authValidationPromise) {
            return _authValidationPromise;
        }
        
        const now = Date.now();
        if (_authValidated && _authLastChecked > 0 && (now - _authLastChecked) < AUTH_CACHE_DURATION) {
            return Promise.resolve(true);
        }
        
        const token = getUserToken();
        if (!token) {
            _authValidated = false;
            _authValidationPromise = null;
            _authValidationInProgress = false;
            return false;
        }
        
        _authValidationInProgress = true;
        
        _authValidationPromise = new Promise(async (resolve) => {
            try {
                const fullUrl = BACKEND_BASE_URL + '/api/auth/me';
                
                const headers = {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                };
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), AUTH_VALIDATION_TIMEOUT);
                
                const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: headers,
                    credentials: 'include',
                    mode: 'cors',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                const status = response.status;
                
                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    try {
                        data = await response.json();
                    } catch (jsonError) {
                        console.error(`[AUTH] JSON parsing error for ${fullUrl}:`, jsonError);
                        data = { 
                            message: 'Invalid JSON response from server',
                            error: jsonError.message 
                        };
                    }
                } else {
                    try {
                        data = await response.text();
                    } catch (textError) {
                        console.error(`[AUTH] Text parsing error for ${fullUrl}:`, textError);
                        data = { 
                            message: 'Failed to parse response',
                            error: textError.message 
                        };
                    }
                }
                
                const normalizedResponse = _normalizeApiResponse(data, response);
                const isSuccess = normalizedResponse.success;
                
                if (isSuccess) {
                    const user = normalizedResponse.user || _extractUserFromResponse(data);
                    
                    if (!user) {
                        console.error('[AUTH] /auth/me succeeded but no user data returned');
                        _authValidated = false;
                        _authLastChecked = now;
                        resolve(false);
                        return;
                    }
                    
                    try {
                        setUserData(user, true);
                        
                        window.currentUser = user;
                    } catch (storageError) {
                        console.error('[AUTH] Error updating user data after /auth/me:', storageError);
                    }
                    
                    _authValidated = true;
                    _authLastChecked = now;
                    
                    window.dispatchEvent(new CustomEvent('user-loaded', {
                        detail: { user: user, timestamp: new Date().toISOString() }
                    }));
                    
                    resolve(true);
                    
                } else if (status === 401 || status === 403) {
                    _clearAllAuthData();
                    
                    _authValidated = false;
                    _authLastChecked = now;
                    resolve(false);
                    
                } else {
                    _authLastChecked = now;
                    
                    resolve(_authValidated);
                }
                
            } catch (error) {
                console.error('[AUTH] validateAuth() error:', error);
                
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
                
                if (isAbortError) {
                    const tokenExists = getUserToken();
                    
                    _authLastChecked = now;
                    resolve(_authValidated || !!tokenExists);
                    return;
                }
                
                if (isNetworkError || isTimeoutError) {
                    _authLastChecked = now;
                    
                    resolve(_authValidated);
                    
                } else {
                    _authLastChecked = now;
                    resolve(_authValidated);
                }
            } finally {
                _authValidationInProgress = false;
                
                const tokenExists = getUserToken();
                if (tokenExists && !_authValidated) {
                    // Token exists but not validated - this is normal for initial load
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
     */
    function _normalizeHttpMethod(method) {
        try {
            if (!method) return 'GET';
            
            const methodStr = String(method).toUpperCase().trim();
            
            const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
            if (validMethods.includes(methodStr)) {
                return methodStr;
            }
            
            const methodCorrections = {
                'GET': 'GET',
                'POST': 'POST', 
                'PUT': 'PUT',
                'PATCH': 'PATCH',
                'DELETE': 'DELETE',
                'HEAD': 'GET',
                'OPTIONS': 'GET',
                '': 'GET',
                'UNDEFINED': 'GET',
                'NULL': 'GET',
                'GET/API/': 'GET',
                'POST/API/': 'POST',
                '/API/': 'GET',
                'API': 'GET'
            };
            
            if (methodStr.includes('/API/') || methodStr.includes('/api/') || methodStr.startsWith('/')) {
                console.error(`[API] CRITICAL ERROR: HTTP method "${method}" contains endpoint pattern!`);
                return 'GET';
            }
            
            return methodCorrections[methodStr] || 'GET';
        } catch (error) {
            console.error('[API] Error normalizing HTTP method:', error);
            return 'GET';
        }
    }

    /**
     * SANITIZE ENDPOINT - DEFENSIVE NORMALIZATION WITHOUT ADDING /api
     */
    function _sanitizeEndpoint(endpoint) {
        try {
            if (!endpoint) return '/';
            
            const endpointStr = String(endpoint).trim();
            
            const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
            if (httpMethods.includes(endpointStr.toUpperCase())) {
                console.error(`[API] CRITICAL ERROR: Endpoint "${endpoint}" is an HTTP method!`);
                return '/';
            }
            
            let cleanEndpoint = endpointStr.replace(/^\/+|\/+$/g, '');
            
            if (cleanEndpoint.toUpperCase().startsWith('API/API/')) {
                console.warn(`[API] Detected /api/api duplication in endpoint: ${cleanEndpoint}`);
                cleanEndpoint = cleanEndpoint.substring(4);
            }
            
            if (cleanEndpoint.startsWith('api/api/')) {
                console.warn(`[API] Detected /api/api duplication in endpoint: ${cleanEndpoint}`);
                cleanEndpoint = cleanEndpoint.substring(4);
            }
            
            if (!cleanEndpoint) return '/';
            if (!cleanEndpoint.startsWith('/')) {
                cleanEndpoint = '/' + cleanEndpoint;
            }
            
            return cleanEndpoint;
        } catch (error) {
            console.error('[API] Error sanitizing endpoint:', error);
            return '/';
        }
    }

    /**
     * BUILD SAFE URL - WITHOUT ADDING /api
     */
    function _buildSafeUrl(endpoint) {
        try {
            const sanitizedEndpoint = _sanitizeEndpoint(endpoint);
            
            if (sanitizedEndpoint === '/') {
                return BACKEND_BASE_URL;
            }
            
            const base = BACKEND_BASE_URL.endsWith('/') ? BACKEND_BASE_URL.slice(0, -1) : BACKEND_BASE_URL;
            const endpointPath = sanitizedEndpoint.startsWith('/') ? sanitizedEndpoint : '/' + sanitizedEndpoint;
            
            const fullUrl = base + endpointPath;
            
            if (fullUrl.includes('/api/api/')) {
                console.warn(`[API] ENDPOINT INTEGRITY VIOLATION: /api/api detected in URL: ${fullUrl}`);
            }
            
            return fullUrl;
        } catch (error) {
            console.error('[API] Error building safe URL:', error);
            return BACKEND_BASE_URL;
        }
    }

    // ============================================================================
    // CRITICAL FIX: CORE FETCH FUNCTION WITH PUBLIC/PROTECTED SEPARATION
    // ============================================================================

    /**
     * CORE FETCH FUNCTION
     */
    function _safeFetch(fullUrl, options = {}) {
        if (!fullUrl || typeof fullUrl !== 'string') {
            console.error('[API] Invalid URL for fetch:', fullUrl);
            return Promise.resolve({
                ok: false,
                success: false,
                status: 0,
                statusText: 'Invalid URL',
                data: { message: 'Invalid request URL' },
                headers: {},
                url: fullUrl,
                invalidRequest: true
            });
        }
        
        const normalizedMethod = _normalizeHttpMethod(options.method || 'GET');
        
        const endpoint = fullUrl.replace(BACKEND_BASE_URL, '');
        
        const isPublic = isPublicEndpoint(endpoint);
        const isStatus = isStatusEndpoint(endpoint);
        const isAuth = isAuthEndpoint(endpoint);
        
        const authHeaders = getAuthHeaders(endpoint);
        
        let headers = {
            'Content-Type': 'application/json'
        };
        
        if (!isPublic && !isStatus && !isAuth) {
            headers = {
                ...headers,
                ...authHeaders,
                ...options.headers
            };
            
            const token = getValidToken();
            
            if (token && !headers['Authorization'] && !headers['authorization']) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        } else {
            headers = {
                ...headers,
                ...options.headers
            };
        }
        
        const skipAuth = options.auth === false || isPublic || isStatus || isAuth;
        
        const requiresCredentials = !isPublic && !isStatus && !isAuth && !skipAuth;
        
        const safeOptions = {
            method: normalizedMethod,
            mode: 'cors',
            credentials: requiresCredentials ? 'include' : 'omit',
            headers: headers
        };
        
        if (options.body && normalizedMethod !== 'GET') {
            if (typeof options.body === 'string') {
                safeOptions.body = options.body;
            } else {
                try {
                    safeOptions.body = JSON.stringify(options.body);
                } catch (e) {
                    console.warn('[API] Could not stringify body, sending empty');
                    safeOptions.body = '{}';
                }
            }
        }
        
        return fetch(fullUrl, safeOptions)
            .then(async response => {
                try {
                    const contentType = response.headers.get('content-type');
                    let data;
                    
                    if (contentType && contentType.includes('application/json')) {
                        try {
                            data = await response.json();
                        } catch (jsonError) {
                            console.error(`[API] JSON parsing error for ${fullUrl}:`, jsonError);
                            data = { 
                                message: 'Invalid JSON response from server',
                                error: jsonError.message 
                            };
                        }
                    } else {
                        try {
                            data = await response.text();
                        } catch (textError) {
                            console.error(`[API] Text parsing error for ${fullUrl}:`, textError);
                            data = { 
                                message: 'Failed to parse response',
                                error: textError.message 
                            };
                        }
                    }
                    
                    const normalizedResponse = _normalizeApiResponse(data, response);
                    
                    const success = normalizedResponse.success;
                    const status = response.status;
                    
                    if (window.AppNetwork) {
                        window.AppNetwork.updateBackendStatus(true);
                    }
                    
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
                            errorMessage = normalizedResponse.message || 'Invalid credentials';
                            result.isAuthError = true;
                            
                            if (isPublic || isStatus || isAuth) {
                                // Public endpoint 401 is expected for invalid credentials
                            } else {
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
                    console.error(`[API] Response processing error for ${fullUrl}:`, processingError);
                    
                    if (window.AppNetwork) {
                        window.AppNetwork.updateBackendStatus(true);
                    }
                    
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
                console.error(`❌ Fetch error for ${fullUrl}: ${error.message}`);
                
                const isNetworkError = error.message && (
                    error.message.includes('Failed to fetch') ||
                    error.message.includes('NetworkError') ||
                    error.message.includes('network request failed') ||
                    error.message.includes('Load failed')
                );
                
                const isAbortError = error.name === 'AbortError' || 
                                    error.message.includes('aborted') ||
                                    error.message.includes('The user aborted');
                
                const isTimeoutError = error.name === 'TimeoutError' ||
                                      error.message.includes('timeout') ||
                                      error.message.includes('Timeout');
                
                const isDNSError = error.message.includes('ERR_NAME_NOT_RESOLVED') ||
                                  error.message.includes('net::ERR_NAME_NOT_RESOLVED');
                
                const shouldMarkBackendUnreachable = (isNetworkError || isTimeoutError || isDNSError) && !isAbortError;
                
                if (shouldMarkBackendUnreachable) {
                    console.warn(`[API] Network error detected, marking backend as unreachable: ${error.message}`);
                    if (window.AppNetwork) {
                        window.AppNetwork.updateBackendStatus(false);
                    }
                }
                
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

    const _apiRequestQueue = {
        _queue: [],
        _isProcessing: false,
        _isLoginComplete: false,
        
        addRequest: function(requestFn, description, endpoint) {
            try {
                if (endpoint && isPublicEndpoint(endpoint)) {
                    return requestFn();
                }
                
                return new Promise((resolve, reject) => {
                    this._queue.push({
                        fn: requestFn,
                        description: description,
                        resolve,
                        reject
                    });
                    
                    if (!this._isProcessing) {
                        this._processQueue();
                    }
                });
            } catch (error) {
                console.error('[QUEUE] Error adding request to queue:', error);
                return Promise.resolve({
                    success: false,
                    message: 'Failed to queue request',
                    error: error.message
                });
            }
        },
        
        _processQueue: async function() {
            if (this._isProcessing || this._queue.length === 0) {
                return;
            }
            
            this._isProcessing = true;
            
            while (this._queue.length > 0) {
                const request = this._queue.shift();
                
                try {
                    const result = await request.fn();
                    request.resolve(result);
                } catch (error) {
                    console.error(`[QUEUE] Failed: ${request.description}`, error);
                    request.reject(error);
                }
            }
            
            this._isProcessing = false;
        },
        
        markLoginComplete: function() {
            this._isLoginComplete = true;
            this._processQueue();
        },
        
        isLoginComplete: function() {
            return this._isLoginComplete;
        },
        
        clearQueue: function() {
            this._queue = [];
        }
    };

    // ============================================================================
    // CACHING SYSTEM FOR INSTANT RENDERING
    // ============================================================================

    const _apiCache = {
        _cache: new Map(),
        _defaultTTL: 5 * 60 * 1000,
        
        get: function(key) {
            try {
                const cached = this._cache.get(key);
                if (!cached) return null;
                
                if (Date.now() > cached.expiresAt) {
                    this._cache.delete(key);
                    return null;
                }
                
                return cached.data;
            } catch (error) {
                console.error(`[CACHE] Error getting cache for key ${key}:`, error);
                return null;
            }
        },
        
        set: function(key, data, ttl = this._defaultTTL) {
            try {
                this._cache.set(key, {
                    data,
                    expiresAt: Date.now() + ttl,
                    timestamp: Date.now()
                });
                
                try {
                    localStorage.setItem(`cache_${key}`, JSON.stringify({
                        data,
                        expiresAt: Date.now() + ttl,
                        timestamp: Date.now()
                    }));
                } catch (error) {
                    console.error(`[CACHE] Could not store in localStorage: ${error.message}`);
                }
            } catch (error) {
                console.error(`[CACHE] Error setting cache for key ${key}:`, error);
            }
        },
        
        delete: function(key) {
            try {
                this._cache.delete(key);
                try {
                    localStorage.removeItem(`cache_${key}`);
                } catch (error) {
                    // Ignore localStorage errors
                }
            } catch (error) {
                console.error(`[CACHE] Error deleting cache for key ${key}:`, error);
            }
        },
        
        clear: function() {
            try {
                this._cache.clear();
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('cache_')) {
                        localStorage.removeItem(key);
                    }
                });
            } catch (error) {
                console.error(`[CACHE] Error clearing cache: ${error.message}`);
            }
        },
        
        loadFromStorage: function() {
            try {
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('cache_')) {
                        try {
                            const cachedStr = localStorage.getItem(key);
                            if (cachedStr) {
                                const cached = JSON.parse(cachedStr);
                                if (Date.now() < cached.expiresAt) {
                                    this._cache.set(key.replace('cache_', ''), cached);
                                } else {
                                    localStorage.removeItem(key);
                                }
                            }
                        } catch (error) {
                            localStorage.removeItem(key);
                        }
                    }
                });
            } catch (error) {
                console.error(`[CACHE] Error loading from storage: ${error.message}`);
            }
        }
    };

    _apiCache.loadFromStorage();

    // ============================================================================
    // GLOBAL API FUNCTION - ULTRA-DEFENSIVE WRAPPER WITH AUTHORITATIVE AUTH
    // ============================================================================

    const globalApiFunction = function(endpoint, options = {}) {
        // FIX: Handle HTTP method passed as endpoint (error in settings-core.js)
        if (endpoint === 'GET' || endpoint === 'POST' || endpoint === 'PUT' || 
            endpoint === 'DELETE' || endpoint === 'PATCH') {
            console.error('[GLOBAL-API] ERROR: HTTP method passed as endpoint:', endpoint);
            console.error('[GLOBAL-API] This indicates a bug in the calling code');
            
            return Promise.resolve({
                ok: false,
                success: false,
                status: 0,
                statusText: 'Invalid Request',
                data: { 
                    message: 'HTTP method cannot be used as endpoint',
                    error: 'Endpoint cannot be HTTP method',
                    details: `Called with: "${endpoint}"`
                },
                headers: {},
                invalidRequest: true,
                methodPassedAsEndpoint: true
            });
        }
        
        try {
            const isPublic = isPublicEndpoint(endpoint);
            const isStatus = isStatusEndpoint(endpoint);
            const isAuth = isAuthEndpoint(endpoint);
            
            if (window.AppNetwork && !window.AppNetwork.isOnline && !isPublic && !isStatus && !isAuth) {
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
            
            if (!endpoint || typeof endpoint !== 'string') {
                console.error(`[GLOBAL-API] CRITICAL: First argument must be endpoint string, got:`, typeof endpoint);
                endpoint = '/';
            }
            
            if (options && typeof options !== 'object') {
                console.error(`[GLOBAL-API] CRITICAL: Second argument must be options object, got:`, typeof options);
                options = {};
            }
            
            const safeEndpoint = _sanitizeEndpoint(endpoint);
            const fullUrl = _buildSafeUrl(safeEndpoint);
            
            const requiresAuth = !isPublic && !isStatus && !isAuth && options.auth !== false;
            
            const token = getUserToken();
            
            if (isPublic || isStatus || isAuth) {
                return secureApiFetch(safeEndpoint, options);
            }
            
            if (requiresAuth && !token && !_apiRequestQueue.isLoginComplete()) {
                return _apiRequestQueue.addRequest(
                    () => secureApiFetch(safeEndpoint, options),
                    `Protected endpoint: ${safeEndpoint}`,
                    safeEndpoint
                );
            }
            
            return secureApiFetch(safeEndpoint, options);
        } catch (error) {
            console.error('[GLOBAL-API] Error in global API function:', error);
            return Promise.resolve({
                ok: false,
                success: false,
                status: 0,
                statusText: 'API Error',
                data: { 
                    message: 'API function error',
                    error: error.message 
                },
                headers: {},
                functionError: true
            });
        }
    };

    // ============================================================================
    // NEW API FUNCTIONS FOR GLOBAL ACCESS
    // ============================================================================

    /**
     * Generic API request function
     */
    apiRequest = async function(endpoint, options = {}) {
        try {
            return await globalApiFunction(endpoint, options);
        } catch (error) {
            console.error('[API-REQUEST] Error in apiRequest:', error);
            return {
                success: false,
                message: 'API request failed',
                error: error.message
            };
        }
    };

    /**
     * API GET request
     */
    apiGet = async function(endpoint, params = {}) {
        try {
            let url = endpoint;
            if (params && Object.keys(params).length > 0) {
                const queryString = new URLSearchParams(params).toString();
                url += (url.includes('?') ? '&' : '?') + queryString;
            }
            return await globalApiFunction(url, { method: 'GET' });
        } catch (error) {
            console.error('[API-GET] Error in apiGet:', error);
            return {
                success: false,
                message: 'API GET request failed',
                error: error.message
            };
        }
    };

    /**
     * API POST request
     */
    apiPost = async function(endpoint, data = {}, options = {}) {
        try {
            return await globalApiFunction(endpoint, {
                method: 'POST',
                body: data,
                ...options
            });
        } catch (error) {
            console.error('[API-POST] Error in apiPost:', error);
            return {
                success: false,
                message: 'API POST request failed',
                error: error.message
            };
        }
    };

    /**
     * API PUT request
     */
    apiPut = async function(endpoint, data = {}, options = {}) {
        try {
            return await globalApiFunction(endpoint, {
                method: 'PUT',
                body: data,
                ...options
            });
        } catch (error) {
            console.error('[API-PUT] Error in apiPut:', error);
            return {
                success: false,
                message: 'API PUT request failed',
                error: error.message
            };
        }
    };

    /**
     * API DELETE request
     */
    apiDelete = async function(endpoint, data = {}, options = {}) {
        try {
            return await globalApiFunction(endpoint, {
                method: 'DELETE',
                body: data,
                ...options
            });
        } catch (error) {
            console.error('[API-DELETE] Error in apiDelete:', error);
            return {
                success: false,
                message: 'API DELETE request failed',
                error: error.message
            };
        }
    };

    /**
     * Legacy API call function
     */
    apiCall = async function(endpoint, options = {}) {
        try {
            return await globalApiFunction(endpoint, options);
        } catch (error) {
            console.error('[API-CALL] Error in apiCall:', error);
            return {
                success: false,
                message: 'API call failed',
                error: error.message
            };
        }
    };

    // ============================================================================
    // GLOBAL OBJECT INITIALIZATION
    // ============================================================================

    function initializeGlobalApi() {
        try {
            if (!window.api) {
                window.api = {};
            }
            
            if (!window.api.core) {
                window.api.core = {};
            }
            
            window.api.core = {
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
                getTrustScoreClass,
                getTrustScoreDescription,
                getTeamMembers,
                navigateToCall,
                getUserFriends,
                navigateToChat,
                getUserGroups,
                showNotification,
                inviteTeamMember,
                acceptGroupInvite,
                getMessageTypes,
                callApi,
                escapeHtml,
                markChatAsRead,
                simulateIncomingCall,
                isSessionValid,
                formatTimeAgo,
                exportAnalytics,
                
                // NEW FUNCTIONS
                request,
                apiCallWithRetry,
                updateTeamMemberRole,
                simulateContactSync,
                trackEvent,
                generateSampleMoodData,
                
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
                
                isPublicEndpoint,
                isAuthEndpoint,
                isStatusEndpoint,
                
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
                
                getSession,
                getSessionData,
                setSessionData,
                updateSession,
                clearSession,
                
                getProfile,
                updateProfile,
                changePassword,
                deleteAccount,
                updateCurrentUser,
                getUserData,
                
                getFriends,
                getFriendRequests,
                sendFriendRequest,
                acceptFriendRequest,
                rejectFriendRequest,
                removeFriend,
                
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
                
                getOnlineUsers,
                searchUsers,
                
                checkNetworkStatus,
                getApiBaseUrl,
                getBackendBaseUrl,
                determineBackendUrl,
                
                debounce,
                throttle,
                generateId,
                formatDate,
                formatTime,
                
                emit,
                on,
                off,
                once,
                
                initializeTokenSystem,
                updateGlobalAccessToken,
                handleUnauthorizedAccess,
                
                ready: true
            };
            
            window.apiCore = window.api.core;
            
            window.__API_CORE = {
                ...window.api.core,
                getTeamMembers,
                getTrustScoreClass,
                getTrustScoreDescription,
                navigateToCall,
                getUserFriends,
                navigateToChat,
                getUserGroups,
                showNotification,
                inviteTeamMember,
                acceptGroupInvite,
                getMessageTypes,
                // NEW FUNCTIONS
                request,
                apiCallWithRetry,
                updateTeamMemberRole,
                simulateContactSync,
                trackEvent,
                generateSampleMoodData,
                ready: true,
                version: '20.5.6',
                initialized: true,
                timestamp: new Date().toISOString()
            };
            
            window.dispatchEvent(new CustomEvent('api-core-initialized', {
                detail: { timestamp: new Date().toISOString() }
            }));
        } catch (error) {
            console.error('[API] Error initializing global API:', error);
        }
    }

    // ============================================================================
    // MISSING FUNCTION IMPLEMENTATIONS
    // ============================================================================

    /**
     * Initialize session
     */
    initSession = function() {
        return initializeTokenSystem();
    };

    /**
     * Call API (alias for api or secureApiFetch)
     */
    callApi = function(endpoint, options = {}) {
        return secureApiFetch(endpoint, options);
    };

    /**
     * Escape HTML
     */
    escapeHtml = function(text) {
        try {
            if (!text) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        } catch (error) {
            console.error('[HTML] Error escaping HTML:', error);
            return String(text || '');
        }
    };

    /**
     * Mark chat as read
     */
    markChatAsRead = async function(chatId) {
        try {
            return await secureApiFetch(`/api/chats/${chatId}/read`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('[CHAT] Mark chat as read error:', error);
            return { success: false, message: 'Failed to mark chat as read' };
        }
    };

    /**
     * Simulate incoming call
     */
    simulateIncomingCall = function(callData) {
        try {
            window.dispatchEvent(new CustomEvent('incoming-call', {
                detail: callData
            }));
            
            return { success: true, message: 'Call simulation triggered' };
        } catch (error) {
            console.error('[CALL] Error simulating incoming call:', error);
            return { success: false, message: 'Failed to simulate call' };
        }
    };

    // ============================================================================
    // FINAL INITIALIZATION
    // ============================================================================

    window.__API_CORE_LOADED_V2 = true;
    window.__API_CORE_LOADED = true;

    initializeTokenSystem();

    initializeGlobalApi();

    window.dispatchEvent(new CustomEvent('api.core-ready'));
    API_INITIALIZATION_COMPLETE = true;
    window.__API_JS_LOADING = false;

    /**
     * Check if session is valid
     * @returns {boolean} True if session is valid
     */
    isSessionValid = function() {
        try {
            const token = getUserToken();
            const user = getCurrentUser();
            return !!(token && user);
        } catch (error) {
            console.error('[SESSION] Error checking session validity:', error);
            return false;
        }
    };

    /**
     * Format time ago
     * @param {Date|string} date - The date to format
     * @returns {string} Formatted time ago string
     */
    formatTimeAgo = function(date) {
        try {
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
        } catch (error) {
            console.error('[TIME] Error formatting time ago:', error);
            return 'Unknown time';
        }
    };

    /**
     * Export analytics data
     */
    exportAnalytics = async function(analyticsData) {
        try {
            return await secureApiFetch('/api/analytics/export', {
                method: 'POST',
                body: analyticsData
            });
        } catch (error) {
            console.error('[ANALYTICS] Export error:', error);
            return { success: false, message: 'Analytics export failed' };
        }
    };

    simulateIncomingCall = function(callData) {
        try {
            window.dispatchEvent(new CustomEvent('incoming-call', {
                detail: callData
            }));
            
            return { success: true, message: 'Call simulation triggered' };
        } catch (error) {
            console.error('[CALL] Error simulating incoming call:', error);
            return { success: false, message: 'Failed to simulate call' };
        }
    };

    requestSession = async function() {
        try {
            return await secureApiFetch('/api/auth/session', {
                method: 'GET'
            });
        } catch (error) {
            console.error('[SESSION] Request session error:', error);
            return { success: false, message: 'Failed to get session' };
        }
    };

    /**
     * Get analytics data
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
            console.error('[ANALYTICS] Get analytics error:', error);
            return { success: false, message: 'Failed to get analytics data' };
        }
    };

    /**
     * Mark chat as read
     */
    markChatAsRead = async function(chatId) {
        try {
            return await secureApiFetch(`/api/chats/${chatId}/read`, {
                method: 'POST'
            });
        } catch (error) {
            console.error('[CHAT] Mark chat as read error:', error);
            return { success: false, message: 'Failed to mark chat as read' };
        }
    };

    /**
     * Simulate incoming call
     */
    simulateIncomingCall = function(callData) {
        try {
            window.dispatchEvent(new CustomEvent('incoming-call', {
                detail: callData
            }));
            
            return { success: true, message: 'Call simulation triggered' };
        } catch (error) {
            console.error('[CALL] Error simulating incoming call:', error);
            return { success: false, message: 'Failed to simulate call' };
        }
    };
}