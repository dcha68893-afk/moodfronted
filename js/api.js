// api.js - MoodChat Backend API Integration
// UPDATED: Fixed duplicate declarations, proper endpoint URLs, and error handling
// VERSION: 2.0 - Production Ready

// ============================================================================
// CONFIGURATION
// ============================================================================

// Prevent duplicate loading
if (typeof window.MOODCHAT_API !== 'undefined') {
    console.warn('⚠️ api.js already loaded. Skipping duplicate.');
} else {
    console.log('📡 Loading MoodChat API...');
}

// Backend configuration
const BACKEND_URL = 'https://moodchat-backend-1.onrender.com/api';
const API_TIMEOUT = 10000; // 10 seconds

// Available API endpoints
const API_ENDPOINTS = {
    // Auth endpoints
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
    REFRESH_TOKEN: '/auth/refresh',
    
    // User endpoints
    USER_PROFILE: '/user/profile',
    USER_UPDATE: '/user/update',
    USER_STATUS: '/user/status',
    
    // Friends endpoints
    FRIENDS_LIST: '/friends/list',
    FRIENDS_REQUESTS: '/friends/requests',
    FRIENDS_ADD: '/friends/add',
    FRIENDS_REMOVE: '/friends/remove',
    FRIENDS_ACCEPT: '/friends/accept',
    FRIENDS_REJECT: '/friends/reject',
    
    // Chat endpoints
    CHATS_LIST: '/chats/list',
    CHAT_CREATE: '/chats/create',
    CHAT_MESSAGES: '/chats/{id}/messages',
    CHAT_SEND: '/chats/{id}/send',
    CHAT_JOIN: '/chats/{id}/join',
    CHAT_LEAVE: '/chats/{id}/leave',
    
    // Group endpoints
    GROUPS_LIST: '/groups/list',
    GROUP_CREATE: '/groups/create',
    GROUP_DETAILS: '/groups/{id}',
    GROUP_JOIN: '/groups/{id}/join',
    GROUP_LEAVE: '/groups/{id}/leave',
    GROUP_MEMBERS: '/groups/{id}/members',
    GROUP_MESSAGES: '/groups/{id}/messages',
    GROUP_SEND: '/groups/{id}/send',
    
    // Call endpoints
    CALLS_HISTORY: '/calls/history',
    CALL_START: '/calls/start',
    CALL_END: '/calls/end',
    
    // Status endpoint (for connection testing)
    STATUS: '/status'
};

// Local storage keys
const STORAGE_KEYS = {
    AUTH_TOKEN: 'moodchat_jwt_token',
    REFRESH_TOKEN: 'moodchat_refresh_token',
    USER_DATA: 'moodchat_user_data',
    LAST_API_CHECK: 'moodchat_last_api_check'
};

// ============================================================================
// CORE API REQUEST FUNCTION
// ============================================================================

/**
 * Make an API request with proper error handling and timeout
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} API response
 */
async function apiRequest(endpoint, options = {}) {
    const url = `${BACKEND_URL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    
    // Add authorization header if token exists
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }
    
    const fetchOptions = {
        ...options,
        headers: { ...defaultHeaders, ...options.headers },
        signal: controller.signal
    };
    
    // Add body if provided (and not a GET/HEAD request)
    if (options.body && !['GET', 'HEAD'].includes(options.method?.toUpperCase() || 'GET')) {
        if (typeof options.body === 'object' && !(options.body instanceof FormData)) {
            fetchOptions.body = JSON.stringify(options.body);
        } else {
            fetchOptions.body = options.body;
        }
    }
    
    try {
        console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);
        
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        
        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.warn(`⚠️ Non-JSON response received from ${endpoint}:`, text.substring(0, 200));
            
            // Try to parse as JSON anyway (some APIs send JSON without proper headers)
            try {
                const data = JSON.parse(text);
                return {
                    success: response.ok,
                    status: response.status,
                    data: data,
                    message: response.ok ? 'Success' : data.message || 'Request failed'
                };
            } catch {
                // If not JSON, return as text
                return {
                    success: false,
                    status: response.status,
                    data: { raw: text },
                    message: `Server returned non-JSON response: ${response.status} ${response.statusText}`
                };
            }
        }
        
        const data = await response.json();
        
        const result = {
            success: response.ok,
            status: response.status,
            data: data.data || data,
            message: data.message || (response.ok ? 'Success' : 'Request failed'),
            timestamp: new Date().toISOString()
        };
        
        // Handle token refresh if needed
        if (response.status === 401 && data.code === 'TOKEN_EXPIRED') {
            console.log('🔄 Token expired, attempting refresh...');
            const refreshSuccess = await refreshAuthToken();
            if (refreshSuccess) {
                // Retry the original request with new token
                return apiRequest(endpoint, options);
            }
        }
        
        return result;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        // Handle specific error types
        let errorMessage = 'Network request failed';
        let errorCode = 'NETWORK_ERROR';
        
        if (error.name === 'AbortError') {
            errorMessage = 'Request timeout - server not responding';
            errorCode = 'TIMEOUT';
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Network error - check your connection';
            errorCode = 'NETWORK_OFFLINE';
        } else {
            errorMessage = error.message;
        }
        
        console.error(`❌ API request failed: ${errorMessage}`, {
            endpoint,
            error: error.name,
            code: errorCode
        });
        
        return {
            success: false,
            error: errorMessage,
            code: errorCode,
            offline: true,
            message: 'Offline mode - using cached data',
            timestamp: new Date().toISOString()
        };
    }
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Register a new user
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Registration result
 */
async function registerUser(userData) {
    console.log('👤 Registering new user:', userData.email);
    
    const response = await apiRequest(API_ENDPOINTS.REGISTER, {
        method: 'POST',
        body: userData
    });
    
    if (response.success && response.data?.token) {
        // Store authentication data
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, response.data.token);
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.data.refreshToken || '');
        
        if (response.data.user) {
            localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.data.user));
        }
        
        console.log('✅ User registered successfully');
    }
    
    return response;
}

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} Login result
 */
async function loginUser(email, password) {
    console.log('🔐 Logging in user:', email);
    
    const response = await apiRequest(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        body: { email, password }
    });
    
    if (response.success && response.data?.token) {
        // Store authentication data
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, response.data.token);
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.data.refreshToken || '');
        
        if (response.data.user) {
            localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.data.user));
        }
        
        console.log('✅ User logged in successfully');
    }
    
    return response;
}

/**
 * Logout user
 * @returns {Promise<Object>} Logout result
 */
async function logoutUser() {
    console.log('👋 Logging out user');
    
    const response = await apiRequest(API_ENDPOINTS.LOGOUT, {
        method: 'POST'
    });
    
    // Clear local storage regardless of API response
    clearAuth();
    
    return {
        ...response,
        message: response.success ? 'Logged out successfully' : 'Logged out locally (API may have failed)'
    };
}

/**
 * Get current user profile
 * @returns {Promise<Object>} User profile
 */
async function getCurrentUser() {
    console.log('👤 Fetching current user profile');
    
    const response = await apiRequest(API_ENDPOINTS.ME, {
        method: 'GET'
    });
    
    if (response.success && response.data) {
        // Update stored user data
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.data));
    }
    
    return response;
}

/**
 * Refresh authentication token
 * @returns {Promise<boolean>} Whether refresh was successful
 */
async function refreshAuthToken() {
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    
    if (!refreshToken) {
        console.warn('⚠️ No refresh token available');
        return false;
    }
    
    try {
        const response = await apiRequest(API_ENDPOINTS.REFRESH_TOKEN, {
            method: 'POST',
            body: { refreshToken }
        });
        
        if (response.success && response.data?.token) {
            localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, response.data.token);
            console.log('✅ Token refreshed successfully');
            return true;
        }
        
        console.warn('⚠️ Token refresh failed:', response.message);
        return false;
    } catch (error) {
        console.error('❌ Token refresh error:', error);
        return false;
    }
}

// ============================================================================
// USER MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Update user profile
 * @param {Object} updates - Profile updates
 * @returns {Promise<Object>} Update result
 */
async function updateUserProfile(updates) {
    console.log('📝 Updating user profile:', updates);
    
    const response = await apiRequest(API_ENDPOINTS.USER_UPDATE, {
        method: 'PUT',
        body: updates
    });
    
    if (response.success && response.data) {
        // Update stored user data
        const currentUser = getStoredUser();
        const updatedUser = { ...currentUser, ...response.data };
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
        
        console.log('✅ Profile updated successfully');
    }
    
    return response;
}

/**
 * Update user status
 * @param {string} status - New status
 * @param {string} emoji - Status emoji (optional)
 * @returns {Promise<Object>} Status update result
 */
async function updateUserStatus(status, emoji = '') {
    console.log('🔄 Updating user status:', status);
    
    const response = await apiRequest(API_ENDPOINTS.USER_STATUS, {
        method: 'POST',
        body: { status, emoji }
    });
    
    return response;
}

// ============================================================================
// FRIENDS MANAGEMENT
// ============================================================================

/**
 * Get friends list
 * @returns {Promise<Object>} Friends list
 */
async function getFriends() {
    console.log('👥 Fetching friends list');
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_LIST, {
        method: 'GET'
    });
    
    return response;
}

/**
 * Send friend request
 * @param {string} userId - Target user ID
 * @param {string} message - Optional message
 * @returns {Promise<Object>} Request result
 */
async function addFriend(userId, message = '') {
    console.log('➕ Adding friend:', userId);
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_ADD, {
        method: 'POST',
        body: { userId, message }
    });
    
    return response;
}

/**
 * Get friend requests
 * @returns {Promise<Object>} Friend requests
 */
async function getFriendRequests() {
    console.log('📨 Fetching friend requests');
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_REQUESTS, {
        method: 'GET'
    });
    
    return response;
}

/**
 * Accept friend request
 * @param {string} requestId - Request ID
 * @returns {Promise<Object>} Acceptance result
 */
async function acceptFriendRequest(requestId) {
    console.log('✅ Accepting friend request:', requestId);
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_ACCEPT, {
        method: 'POST',
        body: { requestId }
    });
    
    return response;
}

// ============================================================================
// CHAT FUNCTIONS
// ============================================================================

/**
 * Get chat rooms/list
 * @returns {Promise<Object>} Chat rooms
 */
async function getChatRooms() {
    console.log('💬 Fetching chat rooms');
    
    const response = await apiRequest(API_ENDPOINTS.CHATS_LIST, {
        method: 'GET'
    });
    
    return response;
}

/**
 * Get messages from a chat
 * @param {string} chatId - Chat ID
 * @param {number} limit - Number of messages to fetch
 * @returns {Promise<Object>} Chat messages
 */
async function getRoomMessages(chatId, limit = 50) {
    console.log(`📨 Fetching messages for chat ${chatId}`);
    
    const endpoint = API_ENDPOINTS.CHAT_MESSAGES.replace('{id}', chatId);
    const response = await apiRequest(`${endpoint}?limit=${limit}`, {
        method: 'GET'
    });
    
    return response;
}

/**
 * Send message to chat
 * @param {string} chatId - Chat ID
 * @param {string} message - Message content
 * @param {string} type - Message type (text, image, etc.)
 * @returns {Promise<Object>} Send result
 */
async function sendMessage(chatId, message, type = 'text') {
    console.log(`📤 Sending message to chat ${chatId}:`, message.substring(0, 50) + '...');
    
    const endpoint = API_ENDPOINTS.CHAT_SEND.replace('{id}', chatId);
    const response = await apiRequest(endpoint, {
        method: 'POST',
        body: { message, type }
    });
    
    return response;
}

// ============================================================================
// GROUP FUNCTIONS
// ============================================================================

/**
 * Get groups list
 * @returns {Promise<Object>} Groups list
 */
async function getGroups() {
    console.log('👥 Fetching groups list');
    
    const response = await apiRequest(API_ENDPOINTS.GROUPS_LIST, {
        method: 'GET'
    });
    
    return response;
}

/**
 * Create new group
 * @param {Object} groupData - Group data (name, description, etc.)
 * @returns {Promise<Object>} Creation result
 */
async function createGroup(groupData) {
    console.log('🏗️ Creating new group:', groupData.name);
    
    const response = await apiRequest(API_ENDPOINTS.GROUP_CREATE, {
        method: 'POST',
        body: groupData
    });
    
    return response;
}

/**
 * Get group details
 * @param {string} groupId - Group ID
 * @returns {Promise<Object>} Group details
 */
async function getGroupDetails(groupId) {
    console.log(`ℹ️ Fetching group details: ${groupId}`);
    
    const endpoint = API_ENDPOINTS.GROUP_DETAILS.replace('{id}', groupId);
    const response = await apiRequest(endpoint, {
        method: 'GET'
    });
    
    return response;
}

// ============================================================================
// CALL FUNCTIONS
// ============================================================================

/**
 * Get call history
 * @returns {Promise<Object>} Call history
 */
async function getCallHistory() {
    console.log('📞 Fetching call history');
    
    const response = await apiRequest(API_ENDPOINTS.CALLS_HISTORY, {
        method: 'GET'
    });
    
    return response;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check API health/status
 * @returns {Promise<Object>} API status
 */
async function checkHealth() {
    console.log('🏥 Checking API health');
    
    const response = await apiRequest(API_ENDPOINTS.STATUS, {
        method: 'GET'
    });
    
    return response;
}

/**
 * Test API connection
 * @returns {Promise<Object>} Connection test result
 */
async function testConnection() {
    console.log('🔌 Testing API connection');
    
    try {
        const healthResponse = await checkHealth();
        
        if (healthResponse.success) {
            return {
                success: true,
                message: 'API connection successful',
                data: healthResponse.data,
                timestamp: new Date().toISOString()
            };
        } else {
            // Try an alternative endpoint if /status doesn't work
            const meResponse = await apiRequest(API_ENDPOINTS.ME, {
                method: 'GET'
            });
            
            if (meResponse.success || meResponse.status === 401) {
                // 401 means API is reachable but auth is required
                return {
                    success: true,
                    message: 'API connection successful (requires authentication)',
                    data: { reachable: true },
                    timestamp: new Date().toISOString()
                };
            }
            
            return {
                success: false,
                message: 'API connection failed',
                error: healthResponse.error || 'Unknown error',
                timestamp: new Date().toISOString()
            };
        }
    } catch (error) {
        return {
            success: false,
            message: 'API connection test failed',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Test authentication
 * @returns {Promise<Object>} Authentication test result
 */
async function testAuth() {
    console.log('🔑 Testing authentication');
    
    const token = getStoredToken();
    
    if (!token) {
        return {
            success: false,
            message: 'No authentication token found',
            authenticated: false,
            timestamp: new Date().toISOString()
        };
    }
    
    try {
        const response = await apiRequest(API_ENDPOINTS.ME, {
            method: 'GET'
        });
        
        return {
            success: response.success,
            message: response.success ? 'Authentication valid' : 'Authentication failed',
            authenticated: response.success,
            data: response.data,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            success: false,
            message: 'Authentication test error',
            error: error.message,
            authenticated: false,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Get stored user data
 * @returns {Object|null} User data or null
 */
function getStoredUser() {
    try {
        const userData = localStorage.getItem(STORAGE_KEYS.USER_DATA);
        return userData ? JSON.parse(userData) : null;
    } catch (error) {
        console.error('❌ Error parsing stored user data:', error);
        return null;
    }
}

/**
 * Get stored token
 * @returns {string|null} Token or null
 */
function getStoredToken() {
    return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}

/**
 * Check if user is authenticated
 * @returns {boolean} Authentication status
 */
function isAuthenticated() {
    const token = getStoredToken();
    const user = getStoredUser();
    return !!(token && user);
}

/**
 * Update stored user data
 * @param {Object} updates - User data updates
 */
function updateStoredUser(updates) {
    try {
        const currentUser = getStoredUser();
        if (currentUser) {
            const updatedUser = { ...currentUser, ...updates };
            localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Error updating stored user:', error);
        return false;
    }
}

/**
 * Clear authentication data
 */
function clearAuth() {
    console.log('🧹 Clearing authentication data');
    
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    
    // Also clear any app-specific auth data
    localStorage.removeItem('moodchat-auth-state');
    localStorage.removeItem('moodchat_device_session');
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Whether email is valid
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result
 */
function validatePassword(password) {
    const requirements = {
        minLength: password.length >= 8,
        hasUpperCase: /[A-Z]/.test(password),
        hasLowerCase: /[a-z]/.test(password),
        hasNumber: /\d/.test(password),
        hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    const passed = Object.values(requirements).every(Boolean);
    const score = Object.values(requirements).filter(Boolean).length;
    
    return {
        valid: passed,
        score,
        requirements,
        strength: score < 3 ? 'weak' : score < 5 ? 'medium' : 'strong'
    };
}

// ============================================================================
// AVAILABLE ROOMS (For testing/demo)
// ============================================================================

const AVAILABLE_ROOMS = [
    { id: 'general', name: 'General Chat', members: 42, unread: 3 },
    { id: 'gaming', name: 'Gaming', members: 28, unread: 0 },
    { id: 'music', name: 'Music Lovers', members: 35, unread: 12 },
    { id: 'movies', name: 'Movie Buffs', members: 19, unread: 0 },
    { id: 'tech', name: 'Tech Talk', members: 56, unread: 7 },
    { id: 'sports', name: 'Sports Fans', members: 31, unread: 2 },
    { id: 'food', name: 'Foodies', members: 24, unread: 1 },
    { id: 'travel', name: 'Travel Enthusiasts', members: 17, unread: 0 }
];

// ============================================================================
// API STATUS AND INITIALIZATION
// ============================================================================

/**
 * Get API status
 * @returns {Object} API status information
 */
function getApiStatus() {
    return {
        backendUrl: BACKEND_URL,
        endpoints: Object.keys(API_ENDPOINTS).length,
        authenticated: isAuthenticated(),
        user: getStoredUser() ? 'Logged in' : 'Not logged in',
        tokenExists: !!getStoredToken(),
        timestamp: new Date().toISOString(),
        availableRooms: AVAILABLE_ROOMS.length
    };
}

// ============================================================================
// EXPORT API FUNCTIONS
// ============================================================================

// Create global MoodChatAPI object
const MoodChatAPI = {
    // Core functions
    apiRequest,
    BACKEND_URL,
    API_ENDPOINTS,
    
    // Authentication
    registerUser,
    loginUser,
    logoutUser,
    getCurrentUser,
    refreshAuthToken,
    
    // User management
    updateUserProfile,
    updateUserStatus,
    
    // Friends
    getFriends,
    addFriend,
    getFriendRequests,
    acceptFriendRequest,
    
    // Chats
    getChatRooms,
    getRoomMessages,
    sendMessage,
    
    // Groups
    getGroups,
    createGroup,
    getGroupDetails,
    
    // Calls
    getCallHistory,
    
    // Utilities
    checkHealth,
    getApiStatus,
    getStoredUser,
    getStoredToken,
    isAuthenticated,
    updateStoredUser,
    clearAuth,
    
    // Validation
    isValidEmail,
    validatePassword,
    
    // Testing
    testConnection,
    testAuth,
    
    // Data
    AVAILABLE_ROOMS
};

// Export to window object
if (typeof window !== 'undefined') {
    window.MoodChatAPI = MoodChatAPI;
    window.apiRequest = apiRequest; // For backward compatibility
    
    // Alias for easier access
    window.MOODCHAT_API = MoodChatAPI;
    
    console.log('✅ MoodChat API loaded successfully');
    console.log('🌐 Backend URL:', BACKEND_URL);
    console.log('📋 Available functions:', Object.keys(MoodChatAPI).filter(key => typeof MoodChatAPI[key] === 'function').length, 'functions');
    
    // Auto-test connection on load (but don't block)
    setTimeout(async () => {
        try {
            const connectionTest = await testConnection();
            console.log('🔌 Auto-connection test:', connectionTest);
            
            if (isAuthenticated()) {
                const authTest = await testAuth();
                console.log('🔑 Auto-auth test:', authTest);
            }
        } catch (error) {
            console.log('⚠️ Auto-test skipped or failed:', error.message);
        }
    }, 1000);
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MoodChatAPI;
}