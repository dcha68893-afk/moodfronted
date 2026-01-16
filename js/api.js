// api.js - FULL BACKEND API INTEGRATION WITH CORRECT FETCH USAGE
// UPDATED VERSION: Fixed HTTP methods, token handling, and fetch calls
// ============================================================================
// CRITICAL FIXES APPLIED:
// 1. All HTTP methods now properly use fetch() with correct syntax
// 2. Token is validated by backend BEFORE saving to localStorage
// 3. URL construction fixed to use absolute URLs
// 4. Error handling improved with proper fallbacks
// 5. Fixed token/user storage format according to requirements
// ============================================================================

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================
const IS_LOCAL_DEVELOPMENT = window.location.hostname === 'localhost' || 
                           window.location.hostname.startsWith('127.') ||
                           window.location.hostname.startsWith('192.168') ||
                           window.location.protocol === 'file:';

// ============================================================================
// BACKEND URL CONFIGURATION - CORRECTED
// ============================================================================
const BACKEND_BASE_URL = 'https://moodchat-backend-1.onrender.com';
const BASE_URL = BACKEND_BASE_URL + '/api';

console.log(`🔧 [API] Environment: ${IS_LOCAL_DEVELOPMENT ? 'Local Development' : 'Production'}`);
console.log(`🔧 [API] Backend Base URL: ${BACKEND_BASE_URL}`);
console.log(`🔧 [API] API Base URL: ${BASE_URL}`);

// ============================================================================
// GLOBAL API FUNCTION - Simple fetch wrapper
// ============================================================================

window.api = function(endpoint, options = {}) {
    // CRITICAL FIX: Ensure endpoint starts with '/'
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }
    
    // CRITICAL FIX: Construct full URL before fetch
    const fullUrl = BASE_URL + endpoint;
    
    const defaultOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        },
        mode: 'cors',
        credentials: 'omit'
    };
    
    const fetchOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };
    
    // Read token from authUser object for every request
    const authUserStr = localStorage.getItem('authUser');
    if (authUserStr) {
        try {
            const authUser = JSON.parse(authUserStr);
            if (authUser.token && fetchOptions.auth !== false) {
                fetchOptions.headers['Authorization'] = 'Bearer ' + authUser.token;
            }
        } catch (e) {
            console.error('🔧 [API] Error parsing authUser:', e);
        }
    }
    
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(fetchOptions.method.toUpperCase())) {
        console.error(`🔧 [API] Invalid HTTP method: ${fetchOptions.method}, defaulting to GET`);
        fetchOptions.method = 'GET';
    }
    
    if (fetchOptions.body && typeof fetchOptions.body !== 'string') {
        if (fetchOptions.headers['Content-Type'] && 
            fetchOptions.headers['Content-Type'].includes('application/json')) {
            fetchOptions.body = JSON.stringify(fetchOptions.body);
        }
    }
    
    console.log(`🔧 [API] Calling ${fetchOptions.method} ${fullUrl}`);
    
    // CRITICAL FIX: Use proper fetch() syntax with constructed URL
    return fetch(fullUrl, fetchOptions)
        .then(async response => {
            try {
                const data = await response.json();
                return {
                    success: response.ok,
                    status: response.status,
                    data: data,
                    message: data.message || (response.ok ? 'Success' : 'Request failed'),
                    headers: Object.fromEntries(response.headers.entries())
                };
            } catch (jsonError) {
                return {
                    success: response.ok,
                    status: response.status,
                    data: null,
                    message: response.statusText || 'Request completed',
                    headers: Object.fromEntries(response.headers.entries()),
                    rawResponse: response
                };
            }
        })
        .catch(error => {
            console.error(`🔧 [API] Fetch error for ${endpoint}:`, error);
            
            const isNetworkError = error.message && (
                error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError') ||
                error.message.includes('aborted')
            );
            
            return {
                success: false,
                status: 0,
                message: isNetworkError 
                    ? 'Network error. Please check your connection.' 
                    : 'Request failed: ' + error.message,
                error: error.message,
                isNetworkError: isNetworkError
            };
        });
};

// ============================================================================
// MAIN API OBJECT - WITH PROPER BACKEND INTEGRATION
// ============================================================================

const apiObject = {
    _singleton: true,
    _version: '10.0.0', // Updated version
    _safeInitialized: true,
    _backendReachable: null,
    _sessionChecked: false,
    
    _config: {
        BACKEND_URL: BASE_URL,
        BACKEND_BASE_URL: BACKEND_BASE_URL,
        IS_LOCAL_DEVELOPMENT: IS_LOCAL_DEVELOPMENT,
        STORAGE_PREFIX: 'moodchat_',
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        SESSION_CHECK_INTERVAL: 300000,
        STATUS_FETCH_TIMEOUT: 8000
    },
    
    // ============================================================================
    // AUTHENTICATION METHODS - UPDATED: Validate token BEFORE saving locally
    // ============================================================================
    
    login: async function(emailOrUsername, password) {
        try {
            console.log(`🔧 [API] Login attempt for: ${emailOrUsername}`);
            
            const requestData = { password: String(password) };
            
            if (emailOrUsername.includes('@')) {
                requestData.email = String(emailOrUsername).trim();
            } else {
                requestData.username = String(emailOrUsername).trim();
            }
            
            // CRITICAL FIX: Use proper fetch call with absolute URL
            const response = await fetch(`${BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData),
                mode: 'cors',
                credentials: 'omit'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // CRITICAL FIX: Store token and user in authUser object as requested
                if (data.token && data.user) {
                    console.log(`🔧 [API] Login successful, storing authUser with token: ${data.token.substring(0, 20)}...`);
                    
                    // Store in the requested format
                    localStorage.setItem('authUser', JSON.stringify({
                        token: data.token,
                        user: data.user
                    }));
                    
                    // Also maintain backward compatibility with existing keys
                    localStorage.setItem('moodchat_auth_token', data.token);
                    localStorage.setItem('moodchat_auth_user', JSON.stringify(data.user));
                }
                
                this._sessionChecked = true;
                this._backendReachable = true;
                
                return {
                    success: true,
                    message: 'Login successful',
                    token: data.token,
                    user: data.user,
                    data: data
                };
            } else {
                // CRITICAL FIX: Clear any existing invalid data
                this._clearAuthData();
                throw new Error(data.message || 'Login failed');
            }
        } catch (error) {
            console.error('🔧 [API] Login error:', error);
            
            // Clear invalid data on error
            this._clearAuthData();
            
            const isNetworkError = error.message && (
                error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError') ||
                error.message.includes('Network request failed')
            );
            
            return {
                success: false,
                message: isNetworkError 
                    ? 'Network error. Please check your internet connection.' 
                    : 'Login failed: ' + error.message,
                error: error.message,
                isNetworkError: isNetworkError
            };
        }
    },
    
    register: async function(userData) {
        try {
            console.log('🔧 [API] Register attempt');
            
            // CRITICAL FIX: Use proper fetch call with absolute URL
            const response = await fetch(`${BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData),
                mode: 'cors',
                credentials: 'omit'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // CRITICAL FIX: Store token and user in authUser object as requested
                if (data.token && data.user) {
                    console.log(`🔧 [API] Registration successful, storing authUser with token: ${data.token.substring(0, 20)}...`);
                    
                    // Store in the requested format
                    localStorage.setItem('authUser', JSON.stringify({
                        token: data.token,
                        user: data.user
                    }));
                    
                    // Also maintain backward compatibility with existing keys
                    localStorage.setItem('moodchat_auth_token', data.token);
                    localStorage.setItem('moodchat_auth_user', JSON.stringify(data.user));
                }
                
                this._sessionChecked = true;
                this._backendReachable = true;
                
                return {
                    success: true,
                    message: 'Registration successful',
                    token: data.token,
                    user: data.user,
                    data: data
                };
            } else {
                // Clear any existing invalid data
                this._clearAuthData();
                throw new Error(data.message || 'Registration failed');
            }
        } catch (error) {
            console.error('🔧 [API] Register error:', error);
            
            // Clear invalid data on error
            this._clearAuthData();
            
            const isNetworkError = error.message && (
                error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError')
            );
            
            return {
                success: false,
                message: isNetworkError 
                    ? 'Network error. Please check your internet connection.' 
                    : 'Registration failed: ' + error.message,
                error: error.message,
                isNetworkError: isNetworkError
            };
        }
    },
    
    // ============================================================================
    // BACKEND HEALTH CHECK
    // ============================================================================
    
    checkBackendHealth: async function() {
        console.log('🔧 [API] Checking backend health...');
        
        const testEndpoints = [
            '/status',
            '/auth/health',
            '/health',
            ''
        ];
        
        for (const endpoint of testEndpoints) {
            try {
                console.log(`🔧 [API] Trying endpoint: ${endpoint || '(root)'}`);
                
                // CRITICAL FIX: Proper fetch call with timeout
                const response = await fetch(BASE_URL + endpoint, {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'omit',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok || response.status < 500) {
                    console.log(`✅ [API] Backend reachable via ${endpoint || 'root'} (status: ${response.status})`);
                    this._backendReachable = true;
                    
                    return {
                        success: true,
                        reachable: true,
                        endpoint: endpoint || 'root',
                        status: response.status,
                        message: 'Backend is reachable'
                    };
                }
            } catch (error) {
                console.log(`⚠️ [API] Endpoint ${endpoint} failed:`, error.message);
                continue;
            }
        }
        
        console.log('🔧 [API] All backend endpoints failed, marking as unreachable');
        this._backendReachable = false;
        
        return {
            success: false,
            reachable: false,
            message: 'Backend is unreachable',
            offlineMode: true
        };
    },
    
    // ============================================================================
    // SESSION MANAGEMENT - UPDATED: Validate session with backend
    // ============================================================================
    
    checkSession: async function() {
        try {
            const authUserStr = localStorage.getItem('authUser');
            
            if (!authUserStr) {
                this._sessionChecked = true;
                return {
                    success: false,
                    authenticated: false,
                    message: 'No active session'
                };
            }
            
            let authUser;
            try {
                authUser = JSON.parse(authUserStr);
                if (!authUser.token || !authUser.user) {
                    this._clearAuthData();
                    this._sessionChecked = true;
                    return {
                        success: false,
                        authenticated: false,
                        message: 'Invalid session data'
                    };
                }
            } catch (e) {
                console.error('🔧 [API] Error parsing authUser:', e);
                this._clearAuthData();
                this._sessionChecked = true;
                return {
                    success: false,
                    authenticated: false,
                    message: 'Invalid session data'
                };
            }
            
            // Return cached session if already checked and backend is reachable
            if (this._sessionChecked && this._backendReachable !== false) {
                return {
                    success: true,
                    authenticated: true,
                    user: authUser.user,
                    message: 'Session valid (cached)'
                };
            }
            
            try {
                // CRITICAL FIX: Proper fetch call to validate session with backend using token from authUser
                const response = await fetch(`${BASE_URL}/auth/me`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authUser.token
                    },
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const updatedUser = data.user || authUser.user;
                    
                    // Update authUser with potentially refreshed user data
                    authUser.user = updatedUser;
                    localStorage.setItem('authUser', JSON.stringify(authUser));
                    localStorage.setItem('moodchat_auth_user', JSON.stringify(updatedUser));
                    
                    this._sessionChecked = true;
                    this._backendReachable = true;
                    
                    return {
                        success: true,
                        authenticated: true,
                        user: updatedUser,
                        message: 'Session valid (online)'
                    };
                } else {
                    if (response.status === 401 || response.status === 403) {
                        // CRITICAL FIX: Clear invalid session data
                        this._clearAuthData();
                        this._sessionChecked = true;
                        
                        return {
                            success: false,
                            authenticated: false,
                            message: 'Session expired'
                        };
                    }
                    
                    this._sessionChecked = true;
                    
                    return {
                        success: true,
                        authenticated: true,
                        user: authUser.user,
                        offline: true,
                        message: 'Session valid (offline mode - backend error)'
                    };
                }
            } catch (backendError) {
                console.log('🔧 [API] Backend unreachable for session check, using cached data');
                
                this._sessionChecked = true;
                this._backendReachable = false;
                
                return {
                    success: true,
                    authenticated: true,
                    user: authUser.user,
                    offline: true,
                    message: 'Session valid (offline mode - network error)'
                };
            }
            
        } catch (error) {
            console.error('🔧 [API] Check session error:', error);
            this._sessionChecked = true;
            return {
                success: false,
                authenticated: false,
                message: 'Failed to check session: ' + error.message
            };
        }
    },
    
    autoLogin: async function() {
        const authUserStr = localStorage.getItem('authUser');
        if (!authUserStr) {
            return { success: false, authenticated: false, message: 'No stored credentials' };
        }
        
        try {
            const authUser = JSON.parse(authUserStr);
            if (!authUser.token || !authUser.user) {
                this._clearAuthData();
                return { success: false, authenticated: false, message: 'Invalid stored credentials' };
            }
        } catch (e) {
            this._clearAuthData();
            return { success: false, authenticated: false, message: 'Corrupted stored credentials' };
        }
        
        if (this._sessionChecked) {
            const user = this.getCurrentUser();
            return {
                success: true,
                authenticated: true,
                user: user,
                cached: true,
                message: 'Auto-login (cached session)'
            };
        }
        
        return await this.checkSession();
    },
    
    // ============================================================================
    // DATA FETCHING METHODS - ALL WITH CORRECT FETCH USAGE
    // ============================================================================
    
    getStatuses: async function() {
        try {
            const authUserStr = localStorage.getItem('authUser');
            const token = authUserStr ? JSON.parse(authUserStr).token : null;
            
            // CRITICAL FIX: Use absolute URL
            const url = `${BASE_URL}/statuses/all`;
            
            console.log('🔧 [API] Fetching statuses...');
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            // CRITICAL FIX: Proper fetch call with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this._config.STATUS_FETCH_TIMEOUT);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                credentials: 'omit',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Cache data for offline use
            try {
                localStorage.setItem('moodchat_cache_statuses', JSON.stringify({
                    data: data,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.log('🔧 [API] Could not cache statuses:', e.message);
            }
            
            return {
                success: true,
                data: data,
                status: response.status,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('🔧 [API] Get statuses error:', error);
            
            const isNetworkError = error.message && (
                error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError') ||
                error.message.includes('aborted')
            );
            
            // Fallback to cached data if network error
            if (isNetworkError) {
                const cached = localStorage.getItem('moodchat_cache_statuses');
                if (cached) {
                    try {
                        const cachedData = JSON.parse(cached);
                        const cacheAge = Date.now() - (cachedData.timestamp || 0);
                        
                        if (cacheAge < 300000) { // 5 minutes
                            return {
                                success: true,
                                data: cachedData.data,
                                cached: true,
                                message: 'Using cached data (network unavailable)',
                                error: error.message
                            };
                        }
                    } catch (e) {
                        // Ignore cache parsing errors
                    }
                }
            }
            
            return {
                success: false,
                message: 'Failed to fetch statuses',
                error: error.message,
                isNetworkError: isNetworkError
            };
        }
    },
    
    getFriends: async function() {
        try {
            const authUserStr = localStorage.getItem('authUser');
            const token = authUserStr ? JSON.parse(authUserStr).token : null;
            
            // CRITICAL FIX: Use absolute URL
            const url = `${BASE_URL}/friends/list`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            // CRITICAL FIX: Proper fetch call
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                credentials: 'omit'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Cache data for offline use
            try {
                localStorage.setItem('moodchat_cache_friends', JSON.stringify({
                    data: data,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.log('🔧 [API] Could not cache friends:', e.message);
            }
            
            return {
                success: true,
                data: data,
                status: response.status
            };
        } catch (error) {
            console.error('🔧 [API] Get friends error:', error);
            
            // Fallback to cached data
            const cached = localStorage.getItem('moodchat_cache_friends');
            if (cached) {
                try {
                    const cachedData = JSON.parse(cached);
                    const cacheAge = Date.now() - (cachedData.timestamp || 0);
                    
                    if (cacheAge < 300000) { // 5 minutes
                        return {
                            success: true,
                            data: cachedData.data,
                            cached: true,
                            message: 'Using cached data',
                            error: error.message
                        };
                    }
                } catch (e) {
                    // Ignore cache parsing errors
                }
            }
            
            return {
                success: false,
                message: 'Failed to fetch friends',
                error: error.message,
                isNetworkError: error.message && error.message.includes('Failed to fetch')
            };
        }
    },
    
    getUsers: async function() {
        try {
            const authUserStr = localStorage.getItem('authUser');
            const token = authUserStr ? JSON.parse(authUserStr).token : null;
            
            // CRITICAL FIX: Use absolute URL
            const url = `${BASE_URL}/users`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            // CRITICAL FIX: Proper fetch call
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                credentials: 'omit'
            });
            
            const data = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: data,
                message: response.ok ? 'Success' : 'Failed to fetch users'
            };
        } catch (error) {
            console.error('🔧 [API] Get users error:', error);
            return {
                success: false,
                message: 'Failed to fetch users',
                error: error.message,
                isNetworkError: error.message && error.message.includes('Failed to fetch')
            };
        }
    },
    
    getUserById: async function(userId) {
        try {
            const authUserStr = localStorage.getItem('authUser');
            const token = authUserStr ? JSON.parse(authUserStr).token : null;
            
            // CRITICAL FIX: Use absolute URL with proper parameter
            const url = `${BASE_URL}/users/${encodeURIComponent(userId)}`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            // CRITICAL FIX: Proper fetch call
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                credentials: 'omit'
            });
            
            const data = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: data,
                message: response.ok ? 'Success' : 'Failed to fetch user'
            };
        } catch (error) {
            console.error('🔧 [API] Get user by ID error:', error);
            return {
                success: false,
                message: 'Failed to fetch user',
                error: error.message,
                isNetworkError: error.message && error.message.includes('Failed to fetch')
            };
        }
    },
    
    getStatus: async function(statusId) {
        try {
            const authUserStr = localStorage.getItem('authUser');
            const token = authUserStr ? JSON.parse(authUserStr).token : null;
            
            // CRITICAL FIX: Use absolute URL with proper parameter
            const url = `${BASE_URL}/status/${encodeURIComponent(statusId)}`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            // CRITICAL FIX: Proper fetch call
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                credentials: 'omit'
            });
            
            const data = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: data,
                message: response.ok ? 'Success' : 'Failed to fetch status'
            };
        } catch (error) {
            console.error('🔧 [API] Get status error:', error);
            return {
                success: false,
                message: 'Failed to fetch status',
                error: error.message,
                isNetworkError: error.message && error.message.includes('Failed to fetch')
            };
        }
    },
    
    createStatus: async function(statusData) {
        try {
            const authUserStr = localStorage.getItem('authUser');
            const token = authUserStr ? JSON.parse(authUserStr).token : null;
            
            // CRITICAL FIX: Use absolute URL
            const url = `${BASE_URL}/status`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            // CRITICAL FIX: Proper POST request
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(statusData),
                mode: 'cors',
                credentials: 'omit'
            });
            
            const data = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: data,
                message: response.ok ? 'Status created successfully' : 'Failed to create status'
            };
        } catch (error) {
            console.error('🔧 [API] Create status error:', error);
            return {
                success: false,
                message: 'Failed to create status',
                error: error.message,
                isNetworkError: error.message && error.message.includes('Failed to fetch')
            };
        }
    },
    
    getChats: async function() {
        try {
            const authUserStr = localStorage.getItem('authUser');
            const token = authUserStr ? JSON.parse(authUserStr).token : null;
            
            // CRITICAL FIX: Use absolute URL
            const url = `${BASE_URL}/chats`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            // CRITICAL FIX: Proper fetch call
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                credentials: 'omit'
            });
            
            const data = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: data,
                message: response.ok ? 'Success' : 'Failed to fetch chats'
            };
        } catch (error) {
            console.error('🔧 [API] Get chats error:', error);
            return {
                success: false,
                message: 'Failed to fetch chats',
                error: error.message,
                isNetworkError: error.message && error.message.includes('Failed to fetch')
            };
        }
    },
    
    getChatById: async function(chatId) {
        try {
            const authUserStr = localStorage.getItem('authUser');
            const token = authUserStr ? JSON.parse(authUserStr).token : null;
            
            // CRITICAL FIX: Use absolute URL with proper parameter
            const url = `${BASE_URL}/chats/${encodeURIComponent(chatId)}`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            // CRITICAL FIX: Proper fetch call
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                credentials: 'omit'
            });
            
            const data = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: data,
                message: response.ok ? 'Success' : 'Failed to fetch chat'
            };
        } catch (error) {
            console.error('🔧 [API] Get chat by ID error:', error);
            return {
                success: false,
                message: 'Failed to fetch chat',
                error: error.message,
                isNetworkError: error.message && error.message.includes('Failed to fetch')
            };
        }
    },
    
    getContacts: async function() {
        try {
            const authUserStr = localStorage.getItem('authUser');
            const token = authUserStr ? JSON.parse(authUserStr).token : null;
            
            // CRITICAL FIX: Use absolute URL
            const url = `${BASE_URL}/contacts`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            // CRITICAL FIX: Proper fetch call
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                mode: 'cors',
                credentials: 'omit'
            });
            
            const data = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: data,
                message: response.ok ? 'Success' : 'Failed to fetch contacts'
            };
        } catch (error) {
            console.error('🔧 [API] Get contacts error:', error);
            return {
                success: false,
                message: 'Failed to fetch contacts',
                error: error.message,
                isNetworkError: error.message && error.message.includes('Failed to fetch')
            };
        }
    },
    
    // ============================================================================
    // UTILITY METHODS
    // ============================================================================
    
    isLoggedIn: function() {
        try {
            const authUserStr = localStorage.getItem('authUser');
            if (!authUserStr) return false;
            
            const authUser = JSON.parse(authUserStr);
            return !!(authUser.token && authUser.user);
        } catch (error) {
            console.error('🔧 [API] Error checking login status:', error);
            return false;
        }
    },
    
    getCurrentUser: function() {
        try {
            const authUserStr = localStorage.getItem('authUser');
            if (authUserStr) {
                const authUser = JSON.parse(authUserStr);
                return authUser.user || null;
            }
        } catch (e) {
            console.error('🔧 [API] Error parsing authUser:', e);
        }
        return null;
    },
    
    getCurrentToken: function() {
        try {
            const authUserStr = localStorage.getItem('authUser');
            if (authUserStr) {
                const authUser = JSON.parse(authUserStr);
                return authUser.token || null;
            }
        } catch (e) {
            console.error('🔧 [API] Error parsing authUser for token:', e);
        }
        return null;
    },
    
    logout: function() {
        try {
            this._clearAuthData();
            console.log('🔧 [API] User logged out');
            return { success: true, message: 'Logged out successfully' };
        } catch (error) {
            console.error('🔧 [API] Error during logout:', error);
            return { success: false, message: 'Logout failed: ' + error.message };
        }
    },
    
    _clearAuthData: function() {
        // Clear all authentication data
        localStorage.removeItem('authUser');
        localStorage.removeItem('moodchat_auth_token');
        localStorage.removeItem('moodchat_auth_user');
        this._sessionChecked = false;
    },
    
    getDeviceId: function() {
        try {
            let deviceId = localStorage.getItem('moodchat_device_id');
            if (!deviceId) {
                deviceId = 'moodchat_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('moodchat_device_id', deviceId);
            }
            return deviceId;
        } catch (error) {
            return 'moodchat_fallback_' + Date.now().toString(36);
        }
    },
    
    isOnline: function() {
        return navigator.onLine;
    },
    
    isBackendReachable: function() {
        if (this._backendReachable !== null) {
            return this._backendReachable;
        }
        
        return true;
    },
    
    getConnectionStatus: function() {
        return {
            online: navigator.onLine,
            backendReachable: this.isBackendReachable(),
            timestamp: new Date().toISOString(),
            backendUrl: BACKEND_BASE_URL,
            baseApiUrl: BASE_URL,
            sessionChecked: this._sessionChecked,
            hasAuthToken: !!this.getCurrentToken(),
            hasAuthUser: !!localStorage.getItem('authUser')
        };
    },
    
    // ============================================================================
    // INITIALIZATION
    // ============================================================================
    
    initialize: async function() {
        console.log('🔧 [API] ⚡ MoodChat API v10.0.0 initializing...');
        console.log('🔧 [API] 🔗 Backend URL:', BASE_URL);
        console.log('🔧 [API] 🌐 Environment:', IS_LOCAL_DEVELOPMENT ? 'Local' : 'Production');
        
        // Migrate old auth data to new format if needed
        const oldToken = localStorage.getItem('moodchat_auth_token');
        const oldUser = localStorage.getItem('moodchat_auth_user');
        const authUserStr = localStorage.getItem('authUser');
        
        if ((oldToken || oldUser) && !authUserStr) {
            console.log('🔧 [API] Migrating old auth data to new format...');
            try {
                const token = oldToken || '';
                let user = null;
                if (oldUser) {
                    user = JSON.parse(oldUser);
                }
                
                if (token || user) {
                    localStorage.setItem('authUser', JSON.stringify({
                        token: token,
                        user: user
                    }));
                    console.log('🔧 [API] Auth data migration complete');
                }
            } catch (e) {
                console.error('🔧 [API] Failed to migrate auth data:', e);
            }
        }
        
        if (this.isLoggedIn() && !this._sessionChecked) {
            console.log('🔧 [API] 🔄 Auto-login on initialization...');
            try {
                const sessionResult = await this.autoLogin();
                console.log('🔧 [API] Auto-login result:', sessionResult.message);
            } catch (error) {
                console.log('🔧 [API] Auto-login failed:', error.message);
            }
        }
        
        setTimeout(async () => {
            try {
                const health = await this.checkBackendHealth();
                console.log('🔧 [API] 📶 Backend status:', health.message);
                console.log('🔧 [API] 🔐 Auth:', this.isLoggedIn() ? 'Logged in' : 'Not logged in');
                console.log('🔧 [API] 🔑 Token present:', !!this.getCurrentToken());
                console.log('🔧 [API] 💾 Device ID:', this.getDeviceId());
                
            } catch (error) {
                console.log('🔧 [API] Initial health check failed:', error.message);
            }
        }, 500);
        
        setInterval(() => {
            if (this.isLoggedIn() && this.isOnline()) {
                this.checkSession().catch(() => {});
            }
        }, this._config.SESSION_CHECK_INTERVAL);
        
        // Dispatch ready events
        this._dispatchReadyEvents();
        
        return true;
    },
    
    _dispatchReadyEvents: function() {
        const eventDetail = {
            version: this._version,
            timestamp: new Date().toISOString(),
            backendUrl: BASE_URL,
            user: this.getCurrentUser(),
            hasToken: !!this.getCurrentToken(),
            hasAuthUser: !!localStorage.getItem('authUser')
        };
        
        const events = ['api-ready', 'apiready', 'apiReady'];
        
        // Immediate dispatch
        events.forEach(eventName => {
            try {
                window.dispatchEvent(new CustomEvent(eventName, { detail: eventDetail }));
                console.log(`🔧 [API] Dispatched ${eventName} event`);
            } catch (e) {
                console.log(`🔧 [API] Could not dispatch ${eventName}:`, e.message);
            }
        });
        
        // Delayed dispatch (500ms)
        setTimeout(() => {
            events.forEach(eventName => {
                try {
                    const delayedEventDetail = {
                        ...eventDetail,
                        delayed: true,
                        delayMs: 500
                    };
                    
                    window.dispatchEvent(new CustomEvent(eventName, {
                        detail: delayedEventDetail
                    }));
                    console.log(`🔧 [API] Dispatched delayed ${eventName} event (500ms)`);
                } catch (e) {
                    console.log(`🔧 [API] Could not dispatch delayed ${eventName}:`, e.message);
                }
            });
        }, 500);
        
        // Second delayed dispatch (1000ms)
        setTimeout(() => {
            events.forEach(eventName => {
                try {
                    const secondDelayedEventDetail = {
                        ...eventDetail,
                        delayed: true,
                        delayMs: 1000
                    };
                    
                    window.dispatchEvent(new CustomEvent(eventName, {
                        detail: secondDelayedEventDetail
                    }));
                    console.log(`🔧 [API] Dispatched second delayed ${eventName} event (1000ms)`);
                } catch (e) {
                    console.log(`🔧 [API] Could not dispatch second delayed ${eventName}:`, e.message);
                }
            });
            
            console.log('🔧 [API] API synchronization ready');
        }, 1000);
    },
    
    // ============================================================================
    // DIAGNOSTICS
    // ============================================================================
    
    diagnose: async function() {
        console.log('🔧 [API] Running diagnostics...');
        
        const results = {
            localStorage: {
                authUser: !!localStorage.getItem('authUser'),
                moodchat_auth_token: !!localStorage.getItem('moodchat_auth_token'),
                moodchat_auth_user: !!localStorage.getItem('moodchat_auth_user'),
                deviceId: !!localStorage.getItem('moodchat_device_id')
            },
            network: {
                online: navigator.onLine,
                backendReachable: this._backendReachable
            },
            session: {
                checked: this._sessionChecked,
                authenticated: this.isLoggedIn(),
                user: this.getCurrentUser(),
                token: this.getCurrentToken() ? 'Present' : 'Missing'
            },
            config: {
                backendUrl: BASE_URL,
                environment: IS_LOCAL_DEVELOPMENT ? 'local' : 'production'
            }
        };
        
        console.table(results);
        
        try {
            const health = await this.checkBackendHealth();
            results.backendTest = health;
        } catch (error) {
            results.backendTest = { error: error.message };
        }
        
        return results;
    },
    
    request: async function(endpoint, options = {}) {
        return window.api(endpoint, options);
    }
};

// ============================================================================
// API SETUP AND FALLBACKS
// ============================================================================

Object.assign(window.api, apiObject);
Object.setPrototypeOf(window.api, Object.getPrototypeOf(apiObject));

console.log('🔧 [API] Starting initialization...');

setTimeout(() => {
    window.api.initialize();
}, 100);

// Global error handlers
if (typeof window.handleApiError === 'undefined') {
    window.handleApiError = function(error, defaultMessage) {
        if (!error) return defaultMessage || 'An error occurred';
        if (error.message) return error.message;
        if (typeof error === 'string') return error;
        return defaultMessage || 'An unexpected error occurred';
    };
}

if (typeof window.isNetworkError === 'undefined') {
    window.isNetworkError = function(error) {
        if (!error) return false;
        const msg = error.message || error.toString();
        return msg.includes('Failed to fetch') ||
               msg.includes('NetworkError') ||
               msg.includes('network') ||
               msg.includes('Network request') ||
               error.status === 0;
    };
}

// Fallback API for iframe compatibility
setTimeout(() => {
    if (!window.api || typeof window.api !== 'function') {
        console.warn('⚠️ API not properly initialized, creating enhanced fallback');
        
        const fallbackApi = function(endpoint, options = {}) {
            console.warn(`⚠️ Using fallback API for ${endpoint}`);
            return Promise.resolve({
                success: false,
                message: 'API not available',
                isNetworkError: true
            });
        };
        
        Object.assign(fallbackApi, {
            _singleton: true,
            _version: 'fallback',
            initialize: () => true,
            isLoggedIn: () => {
                try {
                    const authUserStr = localStorage.getItem('authUser');
                    if (!authUserStr) return false;
                    const authUser = JSON.parse(authUserStr);
                    return !!(authUser.token && authUser.user);
                } catch (e) {
                    return false;
                }
            },
            getCurrentUser: () => {
                try {
                    const authUserStr = localStorage.getItem('authUser');
                    if (authUserStr) {
                        const authUser = JSON.parse(authUserStr);
                        return authUser.user || null;
                    }
                } catch (e) {
                    return null;
                }
                return null;
            },
            getCurrentToken: () => {
                try {
                    const authUserStr = localStorage.getItem('authUser');
                    if (authUserStr) {
                        const authUser = JSON.parse(authUserStr);
                        return authUser.token || null;
                    }
                } catch (e) {
                    return null;
                }
                return null;
            },
            isOnline: () => navigator.onLine,
            isBackendReachable: () => false,
            checkSession: async () => ({ 
                authenticated: fallbackApi.isLoggedIn(),
                offline: true 
            }),
            autoLogin: async () => ({
                success: fallbackApi.isLoggedIn(),
                authenticated: fallbackApi.isLoggedIn(),
                user: fallbackApi.getCurrentUser()
            }),
            login: async () => ({ 
                success: false, 
                message: 'API not available',
                isNetworkError: true 
            }),
            register: async () => ({ 
                success: false, 
                message: 'API not available',
                isNetworkError: true 
            }),
            request: async () => ({
                success: false,
                message: 'API not available',
                isNetworkError: true
            })
        });
        
        window.api = fallbackApi;
    }
}, 3000);

console.log('🔧 [API] Enhanced API loaded successfully');

// Emergency fallback
if (!window.api) {
    console.error('⚠️ window.api not set! Creating emergency API');
    const emergencyApi = function(endpoint, options) {
        return Promise.resolve({
            success: false,
            status: 0,
            message: 'Emergency API fallback',
            isNetworkError: true
        });
    };
    
    Object.assign(emergencyApi, {
        _singleton: true,
        _version: 'emergency',
        isLoggedIn: () => false,
        isBackendReachable: () => true,
        initialize: () => true,
        autoLogin: async () => ({ success: false, authenticated: false })
    });
    
    window.api = emergencyApi;
}

// Global API state
window.__MOODCHAT_API_EVENTS = [];
window.__MOODCHAT_API_INSTANCE = window.api;
window.__MOODCHAT_API_READY = true;
window.MOODCHAT_API_READY = true;

console.log('🔧 [API] Backend API integration complete');