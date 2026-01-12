const BACKEND_URL = 'https://moodchat-backend-1.onrender.com/api';

// Reusable API request function
async function apiRequest(endpoint, options = {}) {
  // Get token from localStorage
  const token = typeof window !== 'undefined' && window.localStorage 
    ? localStorage.getItem('token') 
    : null;

  // Merge headers safely
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add Authorization header if token exists
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Prepare fetch options
  const fetchOptions = {
    ...options,
    headers,
    credentials: 'include', // Include cookies for cross-origin requests
  };

  // Construct the full URL
  const url = `${BACKEND_URL}${endpoint}`;

  try {
    const response = await fetch(url, fetchOptions);
    
    // Check if response is ok
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Parse JSON response
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// User Authentication Functions

/**
 * Register a new user with the backend
 * @param {Object} userData - User registration data (username, email, password, etc.)
 * @returns {Promise<Object>} - Response data with user info and token
 */
async function registerUser(userData) {
  try {
    const response = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    
    // Save JWT token to localStorage upon successful registration
    if (response.token) {
      localStorage.setItem('token', response.token);
    }
    
    return response;
  } catch (error) {
    console.error('Registration failed:', error);
    throw error;
  }
}

/**
 * Login an existing user
 * @param {Object} credentials - Login credentials (email/username and password)
 * @returns {Promise<Object>} - Response data with user info and token
 */
async function loginUser(credentials) {
  try {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    // Save JWT token to localStorage upon successful login
    if (response.token) {
      localStorage.setItem('token', response.token);
    }
    
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

/**
 * Get current authenticated user's information
 * @returns {Promise<Object>} - Current user data
 */
async function getCurrentUser() {
  try {
    const response = await apiRequest('/auth/me');
    return response;
  } catch (error) {
    console.error('Failed to fetch current user:', error);
    
    // Clear token if it's invalid/expired
    if (error.message.includes('401') || error.message.includes('403')) {
      localStorage.removeItem('token');
    }
    
    throw error;
  }
}

/**
 * Logout the current user
 * @returns {Promise<Object>} - Logout response
 */
async function logoutUser() {
  try {
    const response = await apiRequest('/auth/logout', {
      method: 'POST',
    });
    
    // Clear token from localStorage upon logout
    localStorage.removeItem('token');
    
    return response;
  } catch (error) {
    console.error('Logout failed:', error);
    
    // Still clear token even if request fails
    localStorage.removeItem('token');
    
    throw error;
  }
}

// Messaging Functions

/**
 * Send a message to a chat (individual or group)
 * @param {Object} messageData - Message content and metadata (receiverId, groupId, content, etc.)
 * @returns {Promise<Object>} - Sent message data
 */
async function sendMessage(messageData) {
  try {
    const response = await apiRequest('/messages/send', {
      method: 'POST',
      body: JSON.stringify(messageData),
    });
    
    return response;
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
}

/**
 * Get messages for a chat (individual or group)
 * @param {Object} params - Query parameters (chatId, groupId, limit, offset, etc.)
 * @returns {Promise<Array>} - Array of messages
 */
async function getMessages(params = {}) {
  try {
    // Convert params to query string
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `/messages?${queryString}` : '/messages';
    
    const response = await apiRequest(endpoint);
    return response;
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    throw error;
  }
}

// Friend Management Functions

/**
 * Get user's friend list
 * @returns {Promise<Array>} - Array of friends
 */
async function getFriends() {
  try {
    const response = await apiRequest('/friends');
    return response;
  } catch (error) {
    console.error('Failed to fetch friends:', error);
    throw error;
  }
}

/**
 * Send a friend request
 * @param {string} userId - ID of user to add as friend
 * @returns {Promise<Object>} - Friend request response
 */
async function sendFriendRequest(userId) {
  try {
    const response = await apiRequest('/friends/request', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    
    return response;
  } catch (error) {
    console.error('Failed to send friend request:', error);
    throw error;
  }
}

// Group Management Functions

/**
 * Get user's groups
 * @returns {Promise<Array>} - Array of groups
 */
async function getGroups() {
  try {
    const response = await apiRequest('/groups');
    return response;
  } catch (error) {
    console.error('Failed to fetch groups:', error);
    throw error;
  }
}

/**
 * Create a new group
 * @param {Object} groupData - Group creation data (name, members, etc.)
 * @returns {Promise<Object>} - Created group data
 */
async function createGroup(groupData) {
  try {
    const response = await apiRequest('/groups/create', {
      method: 'POST',
      body: JSON.stringify(groupData),
    });
    
    return response;
  } catch (error) {
    console.error('Failed to create group:', error);
    throw error;
  }
}

// Status Functions

/**
 * Update user status
 * @param {Object} statusData - Status information (online, busy, away, etc.)
 * @returns {Promise<Object>} - Updated status response
 */
async function updateStatus(statusData) {
  try {
    const response = await apiRequest('/status/update', {
      method: 'PUT',
      body: JSON.stringify(statusData),
    });
    
    return response;
  } catch (error) {
    console.error('Failed to update status:', error);
    throw error;
  }
}

/**
 * Get user's status
 * @param {string} userId - User ID to get status for (optional, defaults to current user)
 * @returns {Promise<Object>} - Status information
 */
async function getStatus(userId = null) {
  try {
    const endpoint = userId ? `/status/${userId}` : '/status';
    const response = await apiRequest(endpoint);
    return response;
  } catch (error) {
    console.error('Failed to fetch status:', error);
    throw error;
  }
}

// Call Functions

/**
 * Initiate a call
 * @param {Object} callData - Call information (recipientId, groupId, type: audio/video)
 * @returns {Promise<Object>} - Call initialization response
 */
async function initiateCall(callData) {
  try {
    const response = await apiRequest('/calls/initiate', {
      method: 'POST',
      body: JSON.stringify(callData),
    });
    
    return response;
  } catch (error) {
    console.error('Failed to initiate call:', error);
    throw error;
  }
}

/**
 * Get active calls
 * @returns {Promise<Array>} - Array of active calls
 */
async function getActiveCalls() {
  try {
    const response = await apiRequest('/calls/active');
    return response;
  } catch (error) {
    console.error('Failed to fetch active calls:', error);
    throw error;
  }
}

// Settings Functions

/**
 * Update user settings
 * @param {Object} settingsData - Settings to update
 * @returns {Promise<Object>} - Updated settings response
 */
async function updateSettings(settingsData) {
  try {
    const response = await apiRequest('/settings/update', {
      method: 'PUT',
      body: JSON.stringify(settingsData),
    });
    
    return response;
  } catch (error) {
    console.error('Failed to update settings:', error);
    throw error;
  }
}

/**
 * Get user settings
 * @returns {Promise<Object>} - User settings
 */
async function getSettings() {
  try {
    const response = await apiRequest('/settings');
    return response;
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    throw error;
  }
}

// Utility Functions

/**
 * Check if user is authenticated
 * @returns {boolean} - True if token exists and is valid
 */
function isAuthenticated() {
  const token = localStorage.getItem('token');
  return token !== null;
}

/**
 * Clear authentication data
 */
function clearAuth() {
  localStorage.removeItem('token');
}

// Export all functions for use in frontend pages
module.exports = {
  // Core authentication
  registerUser,
  loginUser,
  getCurrentUser,
  logoutUser,
  
  // Messaging
  sendMessage,
  getMessages,
  
  // Friend management
  getFriends,
  sendFriendRequest,
  
  // Group management
  getGroups,
  createGroup,
  
  // Status
  updateStatus,
  getStatus,
  
  // Calls
  initiateCall,
  getActiveCalls,
  
  // Settings
  updateSettings,
  getSettings,
  
  // Utilities
  isAuthenticated,
  clearAuth,
  
  // Base request function (if needed for custom requests)
  apiRequest,
  
  // Backend URL for WebSocket connections or other direct uses
  BACKEND_URL,
};