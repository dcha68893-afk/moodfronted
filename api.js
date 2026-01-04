// api.js - Frontend API helper for MoodChat backend

const BASE_URL = 'https://moodchat-backend-1.onrender.com/api';

// Debug logging
const DEBUG = true;
function debugLog(...args) {
  if (DEBUG) {
    console.log('[API Debug]', ...args);
  }
}

/**
 * Gets the JWT token from localStorage
 * @returns {string|null} JWT token or null if not found
 */
function getAuthToken() {
  const token = localStorage.getItem('token');
  debugLog('Token from localStorage:', token ? `Found (${token.substring(0, 20)}...)` : 'Not found');
  return token;
}

/**
 * Check if token is valid (not expired, has proper format)
 * @param {string} token - JWT token
 * @returns {boolean} True if token appears valid
 */
function isValidToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Basic JWT format check: three parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  
  try {
    // Try to decode the payload to check expiration
    const payload = JSON.parse(atob(parts[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Check if token is expired (if exp field exists)
    if (payload.exp && payload.exp < currentTime) {
      debugLog('Token expired at:', new Date(payload.exp * 1000));
      return false;
    }
    
    return true;
  } catch (error) {
    debugLog('Error decoding token:', error);
    return false;
  }
}

// Create a global api object
const api = {};

/**
 * Makes a request to the backend API with automatic JWT inclusion
 * @param {string} path - API endpoint path (e.g., '/users')
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If response is not OK
 */
api.call = async function(path, options = {}) {
  // Ensure path starts with a slash
  let normalizedPath = path;
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
  }
  
  // Remove leading /api if it's already in the path
  if (normalizedPath.startsWith('/api/')) {
    normalizedPath = normalizedPath.substring(4);
  }
  
  const url = `${BASE_URL}${normalizedPath}`;
  
  // Get auth token if available
  const token = getAuthToken();
  
  // Default headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Add Authorization header if token exists and appears valid
  if (token && isValidToken(token)) {
    headers['Authorization'] = `Bearer ${token}`;
    debugLog('Adding Authorization header with token');
  } else if (token) {
    debugLog('Token found but invalid, not adding to headers');
    // Token exists but invalid - clear it
    localStorage.removeItem('token');
  }
  
  // Prepare request options
  const requestOptions = {
    ...options,
    headers,
    credentials: 'include', // Important for cookies
  };
  
  // If body is provided and is an object, stringify it
  if (requestOptions.body && typeof requestOptions.body === 'object' && !(requestOptions.body instanceof FormData)) {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }
  
  debugLog('Making request:', {
    method: requestOptions.method || 'GET',
    url,
    hasBody: !!requestOptions.body,
    hasAuthHeader: !!headers['Authorization'],
    hasCredentials: requestOptions.credentials === 'include'
  });
  
  try {
    const response = await fetch(url, requestOptions);
    debugLog('Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      let errorData = null;
      
      // Try to get error details from response
      try {
        errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
        debugLog('Error response data:', errorData);
      } catch (e) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      
      // Handle specific error cases
      if (response.status === 401) {
        debugLog('Unauthorized - clearing token');
        localStorage.removeItem('token');
      }
      
      throw new Error(errorMessage);
    }
    
    // Handle 204 No Content responses
    if (response.status === 204) {
      debugLog('204 No Content response');
      return null;
    }
    
    // Parse and return JSON response
    const data = await response.json();
    debugLog('Response data received');
    return data;
  } catch (error) {
    // Re-throw fetch or JSON parsing errors
    debugLog('API request failed:', error);
    throw error;
  }
};

// Convenience methods for common HTTP verbs
api.get = (path, options = {}) => api.call(path, { ...options, method: 'GET' });
api.post = (path, body, options = {}) => 
  api.call(path, { ...options, method: 'POST', body });
api.put = (path, body, options = {}) => 
  api.call(path, { ...options, method: 'PUT', body });
api.patch = (path, body, options = {}) => 
  api.call(path, { ...options, method: 'PATCH', body });
api.delete = (path, options = {}) => 
  api.call(path, { ...options, method: 'DELETE' });

// Authentication functions

/**
 * Register a new user
 * @param {object} userData - User registration data (username, email, password)
 * @returns {Promise<object>} User data and token
 */
api.register = async function(userData) {
  debugLog('Registering user:', userData.email || userData.username);
  try {
    const response = await api.post('/users/register', userData);
    // Store the JWT token if received
    if (response.token) {
      localStorage.setItem('token', response.token);
      debugLog('Token stored after registration');
    } else {
      debugLog('No token received in registration response');
    }
    return response;
  } catch (error) {
    debugLog('Registration failed:', error);
    throw error;
  }
};

/**
 * Login an existing user
 * @param {object} credentials - Login credentials (email/username and password)
 * @returns {Promise<object>} User data and token
 */
api.login = async function(credentials) {
  debugLog('Logging in user:', credentials.email || credentials.username);
  try {
    const response = await api.post('/users/login', credentials);
    // Store the JWT token if received
    if (response.token) {
      localStorage.setItem('token', response.token);
      debugLog('Token stored after login');
    } else {
      debugLog('No token received in login response');
    }
    return response;
  } catch (error) {
    debugLog('Login failed:', error);
    throw error;
  }
};

/**
 * Logout the current user
 */
api.logout = function() {
  debugLog('Logging out user');
  localStorage.removeItem('token');
};

/**
 * Get the current authenticated user's data
 * @returns {Promise<object>} Current user data
 */
api.getCurrentUser = async function() {
  debugLog('Fetching current user data');
  try {
    const userData = await api.get('/users/me');
    debugLog('Current user data received:', userData);
    return userData;
  } catch (error) {
    debugLog('Failed to get current user:', error);
    
    // If it's a 401 error, the token is invalid/expired
    if (error.message.includes('401')) {
      localStorage.removeItem('token');
    }
    
    throw error;
  }
};

/**
 * Check if user is authenticated (has valid token)
 * @returns {boolean} True if user appears to be authenticated
 */
api.isAuthenticated = function() {
  const token = getAuthToken();
  const isValid = token && isValidToken(token);
  debugLog('Authentication check:', isValid ? 'Authenticated' : 'Not authenticated');
  return isValid;
};

/**
 * Validate the current token with backend
 * @returns {Promise<boolean>} True if token is valid
 */
api.validateToken = async function() {
  try {
    await api.getCurrentUser();
    return true;
  } catch (error) {
    return false;
  }
};

// Message functions

/**
 * Fetch messages for a chat
 * @param {string} chatId - The ID of the chat
 * @param {object} params - Optional query parameters (limit, before, after, etc.)
 * @returns {Promise<Array>} Array of messages
 */
api.fetchMessages = async function(chatId, params = {}) {
  debugLog('Fetching messages for chat:', chatId, params);
  const queryString = new URLSearchParams(params).toString();
  const path = `/chats/${chatId}/messages${queryString ? `?${queryString}` : ''}`;
  return await api.get(path);
};

/**
 * Send a new message to a chat
 * @param {string} chatId - The ID of the chat
 * @param {string} content - The message content
 * @param {object} options - Additional message options (type, attachments, etc.)
 * @returns {Promise<object>} The sent message data
 */
api.sendMessage = async function(chatId, content, options = {}) {
  debugLog('Sending message to chat:', chatId, content.substring(0, 50));
  const messageData = {
    content,
    ...options
  };
  return await api.post(`/chats/${chatId}/messages`, messageData);
};

// Make api globally available for inline scripts
window.api = api;

// For HTML pages that use this as a module, export the functions
// Remove the "export" keywords to avoid ES6 module errors
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}