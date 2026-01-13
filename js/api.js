// api.js - MoodChat Backend API Integration
// UPDATED: Fixed authentication and endpoint handling
// VERSION: 2.1 - Production Ready with Strict Compliance

// ============================================================================
// CONFIGURATION
// ============================================================================

// Prevent duplicate loading
if (typeof window.MOODCHAT_API !== 'undefined') {
    console.warn('⚠️ api.js already loaded. Skipping duplicate.');
} else {
    console.log('📡 Loading MoodChat API...');
}

// Backend configuration - STRICT: Fixed base URL
const BACKEND_URL = 'https://moodchat-backend-1.onrender.com/api';
const API_TIMEOUT = 10000; // 10 seconds

// Available API endpoints
const API_ENDPOINTS = {
    // Auth endpoints
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    VALIDATE_TOKEN: '/auth/validate',
    REFRESH_TOKEN: '/auth/refresh',
    ME: '/auth/me',
    
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

// Local storage keys - STRICT: Single token storage
const STORAGE_KEYS = {
    AUTH_TOKEN: 'moodchat_token', // STRICT: Only one token stored
    USER_DATA: 'moodchat_user_data',
    LAST_API_CHECK: 'moodchat_last_api_check'
};

// ============================================================================
// CORE API REQUEST FUNCTION - STRICT COMPLIANCE
// ============================================================================

/**
 * Make an API request with proper error handling and timeout
 * STRICT: Fixed signature: apiRequest(endpoint, method = "GET", data = null, auth = true)
 * @param {string} endpoint - API endpoint (without base URL)
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param {Object|null} data - Request data for POST/PUT/PATCH
 * @param {boolean} auth - Whether to include authorization header
 * @returns {Promise<Object>} API response
 */
async function apiRequest(endpoint, method = "GET", data = null, auth = true) {
    // STRICT: Validate endpoint format
    if (!endpoint || typeof endpoint !== 'string') {
        console.error('❌ Invalid endpoint:', endpoint);
        throw new Error('API endpoint must be a non-empty string');
    }
    
    // STRICT: Validate HTTP method
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const upperMethod = method.toUpperCase();
    if (!validMethods.includes(upperMethod)) {
        console.error('❌ Invalid HTTP method:', method);
        throw new Error(`HTTP method must be one of: ${validMethods.join(', ')}`);
    }
    
    // STRICT: Ensure endpoint starts with "/" and NEVER concatenates method
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // STRICT: Validate that endpoint doesn't contain malformed patterns
    if (cleanEndpoint.includes('POST') || cleanEndpoint.includes('GET') || 
        cleanEndpoint.includes('PUT') || cleanEndpoint.includes('DELETE') ||
        cleanEndpoint.includes('PATCH')) {
        console.error('❌ Malformed endpoint - contains HTTP method:', cleanEndpoint);
        throw new Error('API endpoint must not contain HTTP methods. Use the method parameter instead.');
    }
    
    const url = `${BACKEND_URL}${cleanEndpoint}`; // STRICT: Proper URL construction
    
    console.log(`🌐 API Request: ${upperMethod} ${url}`);
    
    // STRICT: Show warning for potential malformed URLs
    if (url.includes('/api/api') || url.includes('//api')) {
        console.warn('⚠️ Potential double /api in URL:', url);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    // Build headers - STRICT: Always include credentials
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    
    // Add authorization header if requested and token exists
    if (auth) {
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
            console.log('🔑 Attached auth token to request');
        } else {
            console.warn('⚠️ Auth requested but no token found in localStorage');
        }
    }
    
    // Build fetch options - STRICT: Proper fetch structure
    const fetchOptions = {
        method: upperMethod,
        headers: headers,
        credentials: "include", // STRICT: Always include credentials
        signal: controller.signal
    };
    
    // Add body for methods that support it
    if (data && ['POST', 'PUT', 'PATCH'].includes(upperMethod)) {
        fetchOptions.body = JSON.stringify(data);
        console.log('📦 Request body:', data);
    }
    
    try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        
        // Check for HTTP success (200-299)
        const isHttpSuccess = response.ok;
        
        // Try to parse response as JSON, but handle non-JSON responses
        let responseData = null;
        let responseText = '';
        
        try {
            // First, try to get the response as text
            responseText = await response.text();
            
            // Try to parse as JSON if text exists
            if (responseText && responseText.trim() !== '') {
                responseData = JSON.parse(responseText);
            }
        } catch (jsonError) {
            // Response is not JSON or empty - that's OK
            console.log(`📄 Response is not JSON or empty for ${url}`);
        }
        
        // Build base response structure
        const baseResponse = {
            success: isHttpSuccess,
            status: response.status,
            statusText: response.statusText,
            timestamp: new Date().toISOString()
        };
        
        // Handle successful responses (HTTP 200-299)
        if (isHttpSuccess) {
            // Check if responseData exists (parsed from JSON)
            if (responseData) {
                // Extract token and user from various possible response structures
                const token = responseData.token || responseData.access_token || responseData.accessToken;
                const user = responseData.user || responseData.data || responseData;
                const message = responseData.message || responseData.msg || 'Success';
                
                return {
                    ...baseResponse,
                    message: message,
                    token: token,
                    user: user,
                    data: responseData
                };
            } else {
                // Empty or non-JSON successful response
                return {
                    ...baseResponse,
                    message: response.status === 204 ? 'No Content' : 'Success',
                    token: null,
                    user: null,
                    data: null
                };
            }
        } else {
            // Handle error responses (HTTP 400+)
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            
            if (responseData) {
                // Use backend error message if available
                errorMessage = responseData.message || responseData.error || responseData.msg || errorMessage;
                
                return {
                    ...baseResponse,
                    message: errorMessage,
                    error: responseData,
                    data: responseData
                };
            } else if (responseText) {
                // Non-JSON error response
                return {
                    ...baseResponse,
                    message: errorMessage,
                    error: { raw: responseText },
                    data: { raw: responseText }
                };
            } else {
                // Empty error response
                return {
                    ...baseResponse,
                    message: errorMessage,
                    error: null,
                    data: null
                };
            }
        }
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        // STRICT: Handle all errors gracefully with specific messages
        let errorMessage = 'Network request failed';
        let errorType = 'NetworkError';
        
        if (error.name === 'AbortError') {
            errorMessage = `Request timeout after ${API_TIMEOUT}ms - server not responding`;
            errorType = 'TimeoutError';
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Network error - check your connection or CORS settings';
            errorType = 'ConnectionError';
        } else if (error.name === 'SyntaxError') {
            errorMessage = 'Invalid JSON response from server';
            errorType = 'ParseError';
        } else {
            errorMessage = error.message;
            errorType = error.name;
        }
        
        console.error(`❌ API request failed (${errorType}): ${errorMessage}`, {
            endpoint: cleanEndpoint,
            method: method,
            url: url,
            error: error
        });
        
        // STRICT: Always return structured error response
        return {
            success: false,
            error: errorMessage,
            errorType: errorType,
            offline: true,
            message: 'Unable to reach API service',
            timestamp: new Date().toISOString()
        };
    }
}

// ============================================================================
// AUTHENTICATION FUNCTIONS - STRICT COMPLIANCE
// ============================================================================

/**
 * Register a new user - STRICT: Normalized to POST /auth/register
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Registration result
 */
async function registerUser(userData) {
    console.log('👤 Registering new user:', userData.email);
    
    // STRICT: Use the correct endpoint
    const response = await apiRequest(API_ENDPOINTS.REGISTER, "POST", userData, false);
    
    // Save token if present in response
    if (response.success && response.token) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, response.token);
        
        if (response.user) {
            localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.user));
        }
        
        console.log('✅ User registered successfully');
        console.log('💾 Token saved to localStorage');
    }
    
    // Ensure consistent response format
    return {
        success: response.success,
        message: response.message || (response.success ? 'Registration successful' : 'Registration failed'),
        token: response.token || null,
        user: response.user || null,
        data: response.data || null,
        status: response.status
    };
}

/**
 * Login user - STRICT: Normalized to POST /auth/login
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} Login result
 */
async function loginUser(email, password) {
    console.log('🔐 Logging in user:', email);
    
    // STRICT: Use the correct endpoint with correct method
    const response = await apiRequest(API_ENDPOINTS.LOGIN, "POST", { email, password }, false);
    
    // Save token if present in response
    if (response.success && response.token) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, response.token);
        
        if (response.user) {
            localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.user));
        }
        
        console.log('✅ User logged in successfully');
        console.log('💾 Token saved to localStorage');
    }
    
    // Ensure consistent response format
    return {
        success: response.success,
        message: response.message || (response.success ? 'Login successful' : 'Authentication failed'),
        token: response.token || null,
        user: response.user || null,
        data: response.data || null,
        status: response.status
    };
}

/**
 * Validate authentication token - STRICT: Normalized to GET /auth/validate
 * @returns {Promise<Object>} Validation result
 */
async function validateToken() {
    console.log('🔑 Validating authentication token');
    
    const response = await apiRequest(API_ENDPOINTS.VALIDATE_TOKEN, "GET", null, true);
    
    // Ensure consistent response format
    return {
        success: response.success,
        message: response.message || (response.success ? 'Token valid' : 'Token validation failed'),
        data: response.data || null,
        status: response.status
    };
}

/**
 * Logout user - STRICT: Normalized to POST /auth/logout
 * @returns {Promise<Object>} Logout result
 */
async function logoutUser() {
    console.log('👋 Logging out user');
    
    const response = await apiRequest(API_ENDPOINTS.LOGOUT, "POST", null, true);
    
    // Clear local storage regardless of API response
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    console.log('🧹 Cleared localStorage tokens');
    
    return {
        success: response.success,
        message: response.message || (response.success ? 'Logged out successfully' : 'Logged out locally (API may have failed)'),
        data: response.data || null,
        status: response.status
    };
}

/**
 * Get current user profile
 * @returns {Promise<Object>} User profile
 */
async function getCurrentUser() {
    console.log('👤 Fetching current user profile');
    
    const response = await apiRequest(API_ENDPOINTS.ME, "GET", null, true);
    
    if (response.success && response.data) {
        // Update stored user data
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(response.data));
        console.log('💾 Updated user data in localStorage');
    }
    
    // Ensure consistent response format
    return {
        success: response.success,
        message: response.message || (response.success ? 'Profile fetched' : 'Failed to fetch profile'),
        user: response.user || response.data || null,
        data: response.data || null,
        status: response.status
    };
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
    
    const response = await apiRequest(API_ENDPOINTS.USER_UPDATE, "PUT", updates, true);
    
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
    
    const response = await apiRequest(API_ENDPOINTS.USER_STATUS, "POST", { status, emoji }, true);
    
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
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_LIST, "GET", null, true);
    
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
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_ADD, "POST", { userId, message }, true);
    
    return response;
}

/**
 * Get friend requests
 * @returns {Promise<Object>} Friend requests
 */
async function getFriendRequests() {
    console.log('📨 Fetching friend requests');
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_REQUESTS, "GET", null, true);
    
    return response;
}

/**
 * Accept friend request
 * @param {string} requestId - Request ID
 * @returns {Promise<Object>} Acceptance result
 */
async function acceptFriendRequest(requestId) {
    console.log('✅ Accepting friend request:', requestId);
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_ACCEPT, "POST", { requestId }, true);
    
    return response;
}

/**
 * Reject friend request
 * @param {string} requestId - Request ID
 * @returns {Promise<Object>} Rejection result
 */
async function rejectFriendRequest(requestId) {
    console.log('❌ Rejecting friend request:', requestId);
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_REJECT, "POST", { requestId }, true);
    
    return response;
}

/**
 * Remove friend
 * @param {string} friendId - Friend ID to remove
 * @returns {Promise<Object>} Removal result
 */
async function removeFriend(friendId) {
    console.log('➖ Removing friend:', friendId);
    
    const response = await apiRequest(API_ENDPOINTS.FRIENDS_REMOVE, "POST", { friendId }, true);
    
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
    
    const response = await apiRequest(API_ENDPOINTS.CHATS_LIST, "GET", null, true);
    
    return response;
}

/**
 * Create a new chat
 * @param {Object} chatData - Chat creation data
 * @returns {Promise<Object>} Creation result
 */
async function createChat(chatData) {
    console.log('💬 Creating new chat:', chatData.name);
    
    const response = await apiRequest(API_ENDPOINTS.CHAT_CREATE, "POST", chatData, true);
    
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
    
    // STRICT: Proper endpoint construction without method in URL
    const endpoint = API_ENDPOINTS.CHAT_MESSAGES.replace('{id}', chatId) + `?limit=${limit}`;
    const response = await apiRequest(endpoint, "GET", null, true);
    
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
    const response = await apiRequest(endpoint, "POST", { message, type }, true);
    
    return response;
}

/**
 * Join a chat room
 * @param {string} chatId - Chat ID
 * @returns {Promise<Object>} Join result
 */
async function joinChat(chatId) {
    console.log(`➕ Joining chat: ${chatId}`);
    
    const endpoint = API_ENDPOINTS.CHAT_JOIN.replace('{id}', chatId);
    const response = await apiRequest(endpoint, "POST", null, true);
    
    return response;
}

/**
 * Leave a chat room
 * @param {string} chatId - Chat ID
 * @returns {Promise<Object>} Leave result
 */
async function leaveChat(chatId) {
    console.log(`➖ Leaving chat: ${chatId}`);
    
    const endpoint = API_ENDPOINTS.CHAT_LEAVE.replace('{id}', chatId);
    const response = await apiRequest(endpoint, "POST", null, true);
    
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
    
    const response = await apiRequest(API_ENDPOINTS.GROUPS_LIST, "GET", null, true);
    
    return response;
}

/**
 * Create new group
 * @param {Object} groupData - Group data (name, description, etc.)
 * @returns {Promise<Object>} Creation result
 */
async function createGroup(groupData) {
    console.log('🏗️ Creating new group:', groupData.name);
    
    const response = await apiRequest(API_ENDPOINTS.GROUP_CREATE, "POST", groupData, true);
    
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
    const response = await apiRequest(endpoint, "GET", null, true);
    
    return response;
}

/**
 * Join a group
 * @param {string} groupId - Group ID
 * @returns {Promise<Object>} Join result
 */
async function joinGroup(groupId) {
    console.log(`➕ Joining group: ${groupId}`);
    
    const endpoint = API_ENDPOINTS.GROUP_JOIN.replace('{id}', groupId);
    const response = await apiRequest(endpoint, "POST", null, true);
    
    return response;
}

/**
 * Leave a group
 * @param {string} groupId - Group ID
 * @returns {Promise<Object>} Leave result
 */
async function leaveGroup(groupId) {
    console.log(`➖ Leaving group: ${groupId}`);
    
    const endpoint = API_ENDPOINTS.GROUP_LEAVE.replace('{id}', groupId);
    const response = await apiRequest(endpoint, "POST", null, true);
    
    return response;
}

/**
 * Get group members
 * @param {string} groupId - Group ID
 * @returns {Promise<Object>} Group members
 */
async function getGroupMembers(groupId) {
    console.log(`👥 Fetching group members: ${groupId}`);
    
    const endpoint = API_ENDPOINTS.GROUP_MEMBERS.replace('{id}', groupId);
    const response = await apiRequest(endpoint, "GET", null, true);
    
    return response;
}

/**
 * Get group messages
 * @param {string} groupId - Group ID
 * @param {number} limit - Number of messages to fetch
 * @returns {Promise<Object>} Group messages
 */
async function getGroupMessages(groupId, limit = 50) {
    console.log(`📨 Fetching messages for group ${groupId}`);
    
    const endpoint = API_ENDPOINTS.GROUP_MESSAGES.replace('{id}', groupId) + `?limit=${limit}`;
    const response = await apiRequest(endpoint, "GET", null, true);
    
    return response;
}

/**
 * Send message to group
 * @param {string} groupId - Group ID
 * @param {string} message - Message content
 * @param {string} type - Message type
 * @returns {Promise<Object>} Send result
 */
async function sendGroupMessage(groupId, message, type = 'text') {
    console.log(`📤 Sending message to group ${groupId}:`, message.substring(0, 50) + '...');
    
    const endpoint = API_ENDPOINTS.GROUP_SEND.replace('{id}', groupId);
    const response = await apiRequest(endpoint, "POST", { message, type }, true);
    
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
    
    const response = await apiRequest(API_ENDPOINTS.CALLS_HISTORY, "GET", null, true);
    
    return response;
}

/**
 * Start a call
 * @param {Object} callData - Call data (receiverId, type, etc.)
 * @returns {Promise<Object>} Call start result
 */
async function startCall(callData) {
    console.log('📞 Starting call:', callData);
    
    const response = await apiRequest(API_ENDPOINTS.CALL_START, "POST", callData, true);
    
    return response;
}

/**
 * End a call
 * @param {string} callId - Call ID
 * @returns {Promise<Object>} Call end result
 */
async function endCall(callId) {
    console.log('📞 Ending call:', callId);
    
    const response = await apiRequest(API_ENDPOINTS.CALL_END, "POST", { callId }, true);
    
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
    
    const response = await apiRequest(API_ENDPOINTS.STATUS, "GET", null, false);
    
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
        const response = await validateToken();
        
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
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
        console.log('🔍 Found stored token (length):', token.length);
    } else {
        console.log('🔍 No stored token found');
    }
    return token;
}

/**
 * Check if user is authenticated
 * @returns {boolean} Authentication status
 */
function isAuthenticated() {
    const token = getStoredToken();
    const user = getStoredUser();
    const authenticated = !!(token && user);
    console.log('🔐 Authentication check:', { hasToken: !!token, hasUser: !!user, authenticated });
    return authenticated;
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
    localStorage.removeItem(STORAGE_KEYS.USER_DATA);
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
        timestamp: new Date().toISOString()
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
// DEFENSIVE GUARDS
// ============================================================================

// Guard against common malformed endpoint patterns
function validateEndpointPattern(endpoint) {
    const malformedPatterns = [
        /\/api\/?[A-Z]+\//i, // Matches /apiPOST/ or /apiGET/
        /\/[A-Z]+\/api/i,   // Matches /POST/api or /GET/api
        /\/api\/api\//i,     // Matches double /api/api/
    ];
    
    for (const pattern of malformedPatterns) {
        if (pattern.test(endpoint)) {
            throw new Error(`Malformed endpoint detected: ${endpoint}. Endpoints should not contain HTTP methods.`);
        }
    }
    
    return true;
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
    validateToken,
    logoutUser,
    getCurrentUser,
    
    // User management
    updateUserProfile,
    updateUserStatus,
    
    // Friends
    getFriends,
    addFriend,
    getFriendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    
    // Chats
    getChatRooms,
    createChat,
    getRoomMessages,
    sendMessage,
    joinChat,
    leaveChat,
    
    // Groups
    getGroups,
    createGroup,
    getGroupDetails,
    joinGroup,
    leaveGroup,
    getGroupMembers,
    getGroupMessages,
    sendGroupMessage,
    
    // Calls
    getCallHistory,
    startCall,
    endCall,
    
    // Utilities
    checkHealth,
    testConnection,
    testAuth,
    getApiStatus,
    getStoredUser,
    getStoredToken,
    isAuthenticated,
    updateStoredUser,
    clearAuth,
    
    // Validation
    isValidEmail,
    validatePassword,
    
    // Data
    AVAILABLE_ROOMS,
    
    // Defensive guards
    validateEndpointPattern
};

// Export to window object
if (typeof window !== 'undefined') {
    window.MoodChatAPI = MoodChatAPI;
    window.apiRequest = apiRequest; // For backward compatibility
    
    // Alias for easier access
    window.MOODCHAT_API = MoodChatAPI;
    
    console.log('✅ MoodChat API loaded successfully');
    console.log('🌐 Backend URL:', BACKEND_URL);
    console.log('🔑 Token storage key:', STORAGE_KEYS.AUTH_TOKEN);
    console.log('📋 Available functions:', Object.keys(MoodChatAPI).filter(key => typeof MoodChatAPI[key] === 'function').length, 'functions');
    console.log('📊 API Status:', getApiStatus());
    
    // Auto-test connection on load (but don't block)
    setTimeout(async () => {
        try {
            const connectionTest = await testConnection();
            console.log('🔌 Auto-connection test:', connectionTest.success ? '✅ Connected' : '❌ Failed');
            
            if (isAuthenticated()) {
                const authTest = await testAuth();
                console.log('🔑 Auto-auth test:', authTest.authenticated ? '✅ Valid' : '❌ Invalid');
            }
        } catch (error) {
            console.log('⚠️ Auto-test skipped:', error.message);
        }
    }, 1000);
}

/**
 * Debug the exact API request being made
 */
async function debugApiRequest() {
    console.log('🔍 Debugging API request...');
    
    const testCases = [
        { 
            url: 'https://moodchat-backend-1.onrender.com/status',
            description: 'Direct to status (no /api)' 
        },
        { 
            url: 'https://moodchat-backend-1.onrender.com/api/status',
            description: 'With /api prefix' 
        },
        { 
            url: 'https://moodchat-backend-1.onrender.com/api/auth/register',
            description: 'Auth register endpoint',
            options: { method: 'OPTIONS' } // Preflight request
        }
    ];
    
    for (const test of testCases) {
        console.log(`\n🧪 Testing: ${test.description}`);
        console.log(`🔗 URL: ${test.url}`);
        
        try {
            const startTime = Date.now();
            const response = await fetch(test.url, {
                method: test.options?.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                mode: 'cors'
            });
            const responseTime = Date.now() - startTime;
            
            console.log(`✅ Response: ${response.status} ${response.statusText}`);
            console.log(`⏱️ Time: ${responseTime}ms`);
            
            // Try to get response text
            const text = await response.text();
            console.log(`📄 Response preview: ${text.substring(0, 100)}...`);
            
            // Check CORS headers
            console.log('🔒 CORS Headers:');
            console.log('  Access-Control-Allow-Origin:', response.headers.get('Access-Control-Allow-Origin'));
            console.log('  Access-Control-Allow-Methods:', response.headers.get('Access-Control-Allow-Methods'));
            console.log('  Access-Control-Allow-Headers:', response.headers.get('Access-Control-Allow-Headers'));
            
        } catch (error) {
            console.error(`❌ Error: ${error.name}: ${error.message}`);
            console.error('Full error:', error);
        }
    }
}

// Add to MoodChatAPI
MoodChatAPI.debugApiRequest = debugApiRequest;

// Browser-only, no Node.js exports