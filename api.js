// api.js - Frontend API helper for MoodChat backend

const BASE_URL = 'https://moodchat-backend-1.onrender.com';

/**
 * Gets the JWT token from localStorage
 * @returns {string|null} JWT token or null if not found
 */
function getAuthToken() {
  return localStorage.getItem('token');
}

/**
 * Makes a request to the backend API with automatic JWT inclusion
 * @param {string} path - API endpoint path (e.g., '/api/users')
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If response is not OK
 */
export async function api(path, options = {}) {
  // Ensure path starts with a slash
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  
  // Get auth token if available
  const token = getAuthToken();
  
  // Default headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Add Authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Prepare request options
  const requestOptions = {
    ...options,
    headers,
    credentials: 'include', // Include cookies for authentication
  };
  
  // If body is provided and is an object, stringify it (for non-GET requests)
  if (requestOptions.body && typeof requestOptions.body === 'object') {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }
  
  try {
    const response = await fetch(url, requestOptions);
    
    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      
      // Try to get error details from response
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      
      throw new Error(errorMessage);
    }
    
    // Handle 204 No Content responses
    if (response.status === 204) {
      return null;
    }
    
    // Parse and return JSON response
    return await response.json();
  } catch (error) {
    // Re-throw fetch or JSON parsing errors
    console.error('API request failed:', error);
    throw error;
  }
}

// Convenience methods for common HTTP verbs
api.get = (path, options = {}) => api(path, { ...options, method: 'GET' });
api.post = (path, body, options = {}) => 
  api(path, { ...options, method: 'POST', body });
api.put = (path, body, options = {}) => 
  api(path, { ...options, method: 'PUT', body });
api.patch = (path, body, options = {}) => 
  api(path, { ...options, method: 'PATCH', body });
api.delete = (path, options = {}) => 
  api(path, { ...options, method: 'DELETE' });

// Authentication functions

/**
 * Register a new user
 * @param {object} userData - User registration data (username, email, password)
 * @returns {Promise<object>} User data and token
 */
export async function register(userData) {
  const response = await api.post('/api/users/register', userData);
  // Store the JWT token if received
  if (response.token) {
    localStorage.setItem('token', response.token);
  }
  return response;
}

/**
 * Login an existing user
 * @param {object} credentials - Login credentials (email/username and password)
 * @returns {Promise<object>} User data and token
 */
export async function login(credentials) {
  const response = await api.post('/api/users/login', credentials);
  // Store the JWT token if received
  if (response.token) {
    localStorage.setItem('token', response.token);
  }
  return response;
}

/**
 * Logout the current user
 */
export function logout() {
  localStorage.removeItem('token');
}

/**
 * Get the current authenticated user's data
 * @returns {Promise<object>} Current user data
 */
export async function getCurrentUser() {
  return await api.get('/api/users/me');
}

// Message functions

/**
 * Fetch messages for a chat
 * @param {string} chatId - The ID of the chat
 * @param {object} params - Optional query parameters (limit, before, after, etc.)
 * @returns {Promise<Array>} Array of messages
 */
export async function fetchMessages(chatId, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const path = `/api/chats/${chatId}/messages${queryString ? `?${queryString}` : ''}`;
  return await api.get(path);
}

/**
 * Send a new message to a chat
 * @param {string} chatId - The ID of the chat
 * @param {string} content - The message content
 * @param {object} options - Additional message options (type, attachments, etc.)
 * @returns {Promise<object>} The sent message data
 */
export async function sendMessage(chatId, content, options = {}) {
  const messageData = {
    content,
    ...options
  };
  return await api.post(`/api/chats/${chatId}/messages`, messageData);
}

export default api;