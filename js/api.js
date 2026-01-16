// api.js - FULL BACKEND API INTEGRATION WITH CORRECT FETCH USAGE
// This version fixes all fetch method calls and ensures proper backend integration

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
    if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
    }
    
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
    
    // Read token from localStorage for every request
    const token = localStorage.getItem('moodchat_auth_token');
    if (token && fetchOptions.auth !== false) {
        fetchOptions.headers['Authorization'] = 'Bearer ' + token;
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
    
    console.log(`🔧 [API] Calling ${fetchOptions.method} ${BASE_URL}${endpoint}`);
    
    return fetch(BASE_URL + endpoint, fetchOptions)
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
    _version: '9.0.0',
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
    // AUTHENTICATION METHODS
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
                if (data.token) {
                    console.log(`🔧 [API] Login successful, storing token: ${data.token.substring(0, 20)}...`);
                    localStorage.setItem('moodchat_auth_token', data.token);
                    localStorage.setItem('authToken', data.token);
                }
                if (data.user) {
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
                throw new Error(data.message || 'Login failed');
            }
        } catch (error) {
            console.error('🔧 [API] Login error:', error);
            
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
                if (data.token) {
                    console.log(`🔧 [API] Registration successful, storing token: ${data.token.substring(0, 20)}...`);
                    localStorage.setItem('moodchat_auth_token', data.token);
                    localStorage.setItem('authToken', data.token);
                }
                if (data.user) {
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
                throw new Error(data.message || 'Registration failed');
            }
        } catch (error) {
            console.error('🔧 [API] Register error:', error);
            
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
                
                const response = await fetch(BASE_URL + endpoint, {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'omit',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    signal: AbortSignal.timeout(5000)
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
    // SESSION MANAGEMENT
    // ============================================================================
    
    checkSession: async function() {
        try {
            const token = localStorage.getItem('moodchat_auth_token');
            const userStr = localStorage.getItem('moodchat_auth_user');
            
            if (!token || !userStr) {
                this._sessionChecked = true;
                return {
                    success: false,
                    authenticated: false,
                    message: 'No active session'
                };
            }
            
            let userData;
            try {
                userData = JSON.parse(userStr);
            } catch (e) {
                console.error('🔧 [API] Error parsing stored user data:', e);
                this._clearAuthData();
                this._sessionChecked = true;
                return {
                    success: false,
                    authenticated: false,
                    message: 'Invalid session data'
                };
            }
            
            if (this._sessionChecked && this._backendReachable !== false) {
                return {
                    success: true,
                    authenticated: true,
                    user: userData,
                    message: 'Session valid (cached)'
                };
            }
            
            try {
                const response = await fetch(`${BASE_URL}/auth/me`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const updatedUser = data.user || userData;
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
                        user: userData,
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
                    user: userData,
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
        if (!this.isLoggedIn()) {
            return { success: false, authenticated: false, message: 'No stored credentials' };
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
            const token = localStorage.getItem('moodchat_auth_token');
            const url = `${BASE_URL}/statuses/all`;
            
            console.log('🔧 [API] Fetching statuses...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this._config.STATUS_FETCH_TIMEOUT);
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
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
            
            if (isNetworkError) {
                const cached = localStorage.getItem('moodchat_cache_statuses');
                if (cached) {
                    try {
                        const cachedData = JSON.parse(cached);
                        const cacheAge = Date.now() - (cachedData.timestamp || 0);
                        
                        if (cacheAge < 300000) {
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
            const token = localStorage.getItem('moodchat_auth_token');
            const url = `${BASE_URL}/friends/list`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
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
            
            const cached = localStorage.getItem('moodchat_cache_friends');
            if (cached) {
                try {
                    const cachedData = JSON.parse(cached);
                    const cacheAge = Date.now() - (cachedData.timestamp || 0);
                    
                    if (cacheAge < 300000) {
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
            const token = localStorage.getItem('moodchat_auth_token');
            const url = `${BASE_URL}/users`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
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
            const token = localStorage.getItem('moodchat_auth_token');
            const url = `${BASE_URL}/users/${userId}`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
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
            const token = localStorage.getItem('moodchat_auth_token');
            const url = `${BASE_URL}/status/${statusId}`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
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
            const token = localStorage.getItem('moodchat_auth_token');
            const url = `${BASE_URL}/status`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
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
            const token = localStorage.getItem('moodchat_auth_token');
            const url = `${BASE_URL}/chats`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
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
            const token = localStorage.getItem('moodchat_auth_token');
            const url = `${BASE_URL}/chats/${chatId}`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
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
            const token = localStorage.getItem('moodchat_auth_token');
            const url = `${BASE_URL}/contacts`;
            
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
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
            const token = localStorage.getItem('moodchat_auth_token');
            const user = localStorage.getItem('moodchat_auth_user');
            return !!(token && user);
        } catch (error) {
            console.error('🔧 [API] Error checking login status:', error);
            return false;
        }
    },
    
    getCurrentUser: function() {
        try {
            const userStr = localStorage.getItem('moodchat_auth_user');
            if (userStr) {
                return JSON.parse(userStr);
            }
        } catch (e) {
            console.error('🔧 [API] Error parsing user data:', e);
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
        localStorage.removeItem('moodchat_auth_token');
        localStorage.removeItem('moodchat_auth_user');
        localStorage.removeItem('authToken');
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
            hasAuthToken: !!localStorage.getItem('moodchat_auth_token')
        };
    },
    
    // ============================================================================
    // INITIALIZATION
    // ============================================================================
    
    initialize: async function() {
        console.log('🔧 [API] ⚡ MoodChat API v9.0.0 initializing...');
        console.log('🔧 [API] 🔗 Backend URL:', BASE_URL);
        console.log('🔧 [API] 🌐 Environment:', IS_LOCAL_DEVELOPMENT ? 'Local' : 'Production');
        
        // Restore token from localStorage if present
        const storedToken = localStorage.getItem('moodchat_auth_token');
        if (storedToken) {
            console.log(`🔧 [API] Restoring token from localStorage: ${storedToken.substring(0, 20)}...`);
            if (!localStorage.getItem('authToken')) {
                localStorage.setItem('authToken', storedToken);
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
                console.log('🔧 [API] 🔑 Token present:', !!localStorage.getItem('moodchat_auth_token'));
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
            hasToken: !!localStorage.getItem('moodchat_auth_token')
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
                token: !!localStorage.getItem('moodchat_auth_token'),
                authToken: !!localStorage.getItem('authToken'),
                user: !!localStorage.getItem('moodchat_auth_user'),
                deviceId: !!localStorage.getItem('moodchat_device_id')
            },
            network: {
                online: navigator.onLine,
                backendReachable: this._backendReachable
            },
            session: {
                checked: this._sessionChecked,
                authenticated: this.isLoggedIn()
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
                    return !!(localStorage.getItem('moodchat_auth_token') && 
                            localStorage.getItem('moodchat_auth_user'));
                } catch (e) {
                    return false;
                }
            },
            getCurrentUser: () => {
                try {
                    const user = localStorage.getItem('moodchat_auth_user');
                    return user ? JSON.parse(user) : null;
                } catch (e) {
                    return null;
                }
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