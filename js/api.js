// api.js - MoodChat Backend API Integration - SINGLETON VERSION
// VERSION: 5.4 - Fixed window.api function availability and enhanced offline handling
// STRICT RULE: Singleton initialization with graceful handling

// ============================================================================
// SINGLETON ENFORCEMENT - GRACEFUL MULTIPLE LOAD HANDLING
// ============================================================================

// FIX 1: Ensure window.api is always available as a function from the start
if (typeof window.api === 'undefined' || typeof window.api !== 'function') {
    // Create a safe function placeholder immediately
    window.api = function(method, ...args) {
        // This will be replaced when the real API loads
        if (!method && window.MoodChatAPI) {
            return window.MoodChatAPI;
        }
        
        if (window.MoodChatAPI && typeof window.MoodChatAPI[method] === 'function') {
            return window.MoodChatAPI[method](...args);
        }
        
        // For async methods, return a promise
        if (method && (method.startsWith('load') || method.startsWith('get') || method.startsWith('check'))) {
            return Promise.resolve({
                success: false,
                message: `API method ${method} not yet available`,
                errorType: 'INITIALIZATION'
            });
        }
        
        return {
            success: false,
            message: `API method ${method} not yet available`,
            errorType: 'INITIALIZATION'
        };
    };
    
    // Add basic properties to the function
    window.api._initialized = false;
    window.api._isPlaceholder = true;
    window.api.isOnline = () => navigator.onLine;
    window.api.isLoggedIn = () => false;
    window.api.getCurrentUser = () => null;
    window.api.getConnectionStatus = () => ({ 
        online: navigator.onLine, 
        apiAvailable: false,
        timestamp: new Date().toISOString()
    });
}

// Check if API already exists - if yes, enhance window.api
if (window.MoodChatAPI && window.MoodChatAPI._singleton) {
    console.log('🔄 MoodChatAPI singleton already loaded. Enhancing window.api...');
    
    // Create a proper function proxy
    const originalAPI = window.MoodChatAPI;
    const apiFunction = function(method, ...args) {
        if (!method) {
            return originalAPI;
        }
        
        if (originalAPI && typeof originalAPI[method] === 'function') {
            return originalAPI[method](...args);
        }
        
        // Handle promise chain methods
        if (method === 'then' || method === 'catch' || method === 'finally') {
            return Promise.resolve(originalAPI)[method](...args);
        }
        
        // Return error for unknown methods
        return {
            success: false,
            message: `Method ${method} not found on MoodChatAPI`,
            errorType: 'VALIDATION'
        };
    };
    
    // Copy all properties from MoodChatAPI to the function
    Object.keys(originalAPI).forEach(key => {
        if (key !== '_singleton' && key !== '_version') {
            Object.defineProperty(apiFunction, key, {
                get: function() { return originalAPI[key]; },
                configurable: true,
                enumerable: true
            });
        }
    });
    
    // Add the singleton properties
    apiFunction._singleton = true;
    apiFunction._version = originalAPI._version || '5.4';
    apiFunction._isFunctionProxy = true;
    
    // Replace window.api with our enhanced function
    window.api = apiFunction;
    
    // Also keep window.MoodChatAPI for direct access
    window.MoodChatAPI = originalAPI;
    
    // Dispatch ready event
    setTimeout(() => {
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('api-ready', {
                detail: { 
                    api: originalAPI, 
                    isProxy: true,
                    version: originalAPI._version 
                }
            }));
        }
    }, 0);
    
    console.log('✅ window.api enhanced as function proxy');
    
    // Prevent further initialization by throwing controlled error
    throw new Error('STOP_EXECUTION_SINGLETON_LOADED');
} else {
    console.log('🚀 Initializing MoodChatAPI singleton...');
}

// ============================================================================
// SINGLETON API CLIENT (Everything wrapped in IIFE that only runs once)
// ============================================================================

(function() {
    // Prevent re-execution if API already exists
    if (window.MoodChatAPI && window.MoodChatAPI._singleton) {
        console.log('🛑 API already initialized, skipping re-initialization');
        return;
    }
    
    // PRIVATE VARIABLES - scoped to this IIFE
    let _initialized = false;
    let _config = null;
    let _storage = null;
    let _auth = null;
    let _statusCache = null;
    let _onlineStatus = navigator.onLine;
    let _connectionListeners = [];
    let _lastOnlineCheck = null;
    let _isInitializing = false;
    
    // ============================================================================
    // INITIALIZATION LOCK - PREVENT RACE CONDITIONS
    // ============================================================================
    
    if (_isInitializing) {
        console.warn('⚠️ API is already initializing. Skipping duplicate initialization.');
        return;
    }
    
    _isInitializing = true;
    
    // ============================================================================
    // ENHANCED ONLINE/OFFLINE DETECTION SYSTEM
    // ============================================================================
    
    function _setupConnectionMonitoring() {
        console.log('📡 Setting up enhanced connection monitoring...');
        
        // Robust offline/online detection using navigator.onLine
        function _updateOnlineStatus() {
            const wasOnline = _onlineStatus;
            _onlineStatus = navigator.onLine;
            
            // Only notify if status changed
            if (wasOnline !== _onlineStatus) {
                console.log(_onlineStatus ? '🌐 Device is online' : '📵 Device is offline');
                _notifyConnectionChange(_onlineStatus);
                
                // Try to sync queued items when coming online
                if (_onlineStatus) {
                    setTimeout(() => {
                        if (window.MoodChatAPI && window.MoodChatAPI.syncQueuedStatuses) {
                            window.MoodChatAPI.syncQueuedStatuses();
                        }
                    }, 1500);
                }
            }
        }
        
        // Initial status
        _updateOnlineStatus();
        
        // Browser online/offline events
        if (window.addEventListener) {
            window.addEventListener('online', _updateOnlineStatus);
            window.addEventListener('offline', _updateOnlineStatus);
            
            console.log('✅ Browser online/offline event listeners attached');
        }
        
        // Real backend connectivity check
        async function _checkBackendConnectivity() {
            return new Promise((resolve) => {
                // Quick check - if browser says we're offline, we're offline
                if (!navigator.onLine) {
                    resolve(false);
                    return;
                }
                
                // Try to fetch a small resource to verify connectivity
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                    resolve(false);
                }, 3000);
                
                fetch('https://moodchat-backend-1.onrender.com/api/status', {
                    method: 'GET',
                    signal: controller.signal,
                    cache: 'no-cache',
                    headers: {
                        'X-Device-ID': _getStorage().getDeviceId(),
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                })
                .then(response => {
                    clearTimeout(timeoutId);
                    resolve(response.ok);
                })
                .catch(() => {
                    clearTimeout(timeoutId);
                    resolve(false);
                });
            });
        }
        
        // Periodically check backend connectivity
        if (window.setInterval) {
            setInterval(async () => {
                try {
                    const wasOnline = _onlineStatus;
                    const isActuallyOnline = await _checkBackendConnectivity();
                    
                    if (isActuallyOnline !== _onlineStatus) {
                        _onlineStatus = isActuallyOnline;
                        _notifyConnectionChange(isActuallyOnline);
                        console.log(isActuallyOnline ? 
                            '✅ Backend connectivity restored' : 
                            '❌ Backend connectivity lost');
                    }
                    
                    _lastOnlineCheck = new Date().toISOString();
                } catch (error) {
                    console.warn('Connection check failed:', error);
                }
            }, 30000); // Check every 30 seconds
        }
    }
    
    function _notifyConnectionChange(isOnline) {
        // Notify registered listeners
        _connectionListeners.forEach(listener => {
            try {
                if (typeof listener === 'function') {
                    listener(isOnline);
                }
            } catch (error) {
                console.warn('Connection listener error:', error);
            }
        });
        
        // Dispatch global event
        try {
            if (window.dispatchEvent) {
                const event = new CustomEvent('connection-change', {
                    detail: {
                        online: isOnline,
                        timestamp: new Date().toISOString(),
                        backendReachable: isOnline
                    }
                });
                window.dispatchEvent(event);
            }
        } catch (error) {
            console.warn('Failed to dispatch connection-change event:', error);
        }
    }
    
    function _addConnectionListener(callback) {
        if (typeof callback === 'function') {
            _connectionListeners.push(callback);
            // Immediately notify of current status
            setTimeout(() => {
                try {
                    callback(_onlineStatus);
                } catch (error) {
                    console.warn('Connection listener callback error:', error);
                }
            }, 0);
        }
    }
    
    function _removeConnectionListener(callback) {
        const index = _connectionListeners.indexOf(callback);
        if (index > -1) {
            _connectionListeners.splice(index, 1);
        }
    }
    
    // ============================================================================
    // CONFIGURATION CONSTANTS - WITH NEW ENDPOINTS
    // ============================================================================
    
    const BACKEND_URL = 'https://moodchat-backend-1.onrender.com/api';
    const API_TIMEOUT = 15000;
    const MAX_RETRIES = 2;
    const STORAGE_PREFIX = 'moodchat_';
    
    const ENDPOINTS = {
        // Auth
        REGISTER: '/auth/register',
        LOGIN: '/auth/login',
        LOGOUT: '/auth/logout',
        VALIDATE: '/auth/validate',
        ME: '/auth/me',
        FORGOT_PASSWORD: '/auth/forgot-password',
        RESET_PASSWORD: '/auth/reset-password',
        
        // Users
        USER_UPDATE: '/user/update',
        USER_STATUS: '/user/status',
        USER_PREMIUM_STATUS: '/user/premium-status', // NEW: Premium status check
        
        // Friends
        FRIENDS_LIST: '/friends/list',
        FRIENDS_ADD: '/friends/add',
        FRIENDS_REQUESTS: '/friends/requests',
        FRIENDS_ACCEPT: '/friends/accept',
        FRIENDS_REJECT: '/friends/reject',
        FRIENDS_REMOVE: '/friends/remove',
        
        // Chats
        CHATS_LIST: '/chats/list',
        CHAT_CREATE: '/chats/create',
        CHAT_MESSAGES: '/chats/{id}/messages',
        CHAT_SEND: '/chats/{id}/send',
        
        // Status
        STATUS_ALL: '/statuses/all',
        STATUS_FRIENDS: '/statuses/friends',
        STATUS_CLOSE_FRIENDS: '/statuses/close-friends',
        STATUS_PINNED: '/statuses/pinned',
        STATUS_MUTED: '/statuses/muted',
        STATUS_CREATE: '/status/create',
        STATUS_CREATE_MEDIA: '/status/create-media',
        STATUS_DRAFTS: '/status/drafts',
        STATUS_SAVE_DRAFT: '/status/save-draft',
        STATUS_SCHEDULE: '/status/schedule',
        STATUS_REACT: '/status/{id}/react',
        STATUS_REPLY: '/status/{id}/reply',
        STATUS_HIGHLIGHTS: '/highlights',
        STATUS_ADD_HIGHLIGHT: '/highlights/add',
        STATUS_REMOVE_HIGHLIGHT: '/highlights/remove',
        STATUS_TRACK_VIEW: '/status/{id}/view',
        STATUS_TRANSLATE: '/status/{id}/translate',
        STATUS_POLL_CREATE: '/status/{id}/poll',
        STATUS_POLL_VOTE: '/status/{id}/poll/vote',
        STATUS_MARK_SENSITIVE: '/status/{id}/sensitive',
        
        // NEW: Premium features
        PREMIUM_FEATURES: '/premium/features',
        PREMIUM_LISTINGS: '/premium/listings',
        PREMIUM_SPOTLIGHT: '/premium/spotlight',
        
        // General
        STATUS: '/status'
    };
    
    // ============================================================================
    // CONFIGURATION GETTER
    // ============================================================================
    
    function _getConfig() {
        if (_config) return _config;
        
        _config = {
            BACKEND_URL: BACKEND_URL,
            TIMEOUT: API_TIMEOUT,
            MAX_RETRIES: MAX_RETRIES,
            STORAGE_PREFIX: STORAGE_PREFIX,
            ENDPOINTS: ENDPOINTS
        };
        
        return _config;
    }
    
    // ============================================================================
    // STORAGE MANAGEMENT - FIXED VERSION
    // ============================================================================
    
    function _getStorage() {
        if (_storage) return _storage;
        
        _storage = {
            get: function(key) {
                try {
                    const fullKey = STORAGE_PREFIX + key;
                    const value = localStorage.getItem(fullKey);
                    
                    // Handle non-JSON values (like device_id which was stored as plain string)
                    if (key === 'device_id' && value && !value.startsWith('{') && !value.startsWith('[')) {
                        return value; // Return as plain string
                    }
                    
                    return value ? JSON.parse(value) : null;
                } catch (error) {
                    console.warn('⚠️ Storage get error for key:', key, error);
                    
                    // For device_id, try to get raw value
                    if (key === 'device_id') {
                        try {
                            const fullKey = STORAGE_PREFIX + key;
                            return localStorage.getItem(fullKey);
                        } catch (e) {
                            return null;
                        }
                    }
                    
                    return null;
                }
            },
            
            set: function(key, value) {
                try {
                    const fullKey = STORAGE_PREFIX + key;
                    
                    // Handle device_id specially (store as plain string)
                    if (key === 'device_id' && typeof value === 'string') {
                        localStorage.setItem(fullKey, value);
                        return true;
                    }
                    
                    localStorage.setItem(fullKey, JSON.stringify(value));
                    return true;
                } catch (error) {
                    console.warn('⚠️ Storage set error for key:', key, error);
                    return false;
                }
            },
            
            remove: function(key) {
                try {
                    localStorage.removeItem(STORAGE_PREFIX + key);
                    return true;
                } catch (error) {
                    console.warn('⚠️ Storage remove error for key:', key, error);
                    return false;
                }
            },
            
            getToken: function() {
                return this.get('token');
            },
            
            setToken: function(token) {
                return this.set('token', token);
            },
            
            getUser: function() {
                return this.get('user');
            },
            
            setUser: function(user) {
                return this.set('user', user);
            },
            
            clearAuth: function() {
                this.remove('token');
                this.remove('user');
                console.log('🧹 Auth cleared from storage');
                return true;
            },
            
            getDeviceId: function() {
                try {
                    // First try to get existing device ID
                    let deviceId = this.get('device_id');
                    
                    // If it's an object (due to previous JSON parsing), extract the value
                    if (deviceId && typeof deviceId === 'object') {
                        deviceId = deviceId.value || deviceId.id || null;
                    }
                    
                    // If no valid device ID exists, create a new one
                    if (!deviceId || typeof deviceId !== 'string') {
                        // Clean up any corrupted data
                        this.remove('device_id');
                        
                        // Generate new device ID
                        deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                        this.set('device_id', deviceId);
                        console.log('🆕 Generated new device ID:', deviceId);
                    }
                    
                    return deviceId;
                } catch (error) {
                    console.warn('⚠️ Error getting device ID, generating new one:', error);
                    // Generate new device ID as fallback
                    const deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    try {
                        localStorage.setItem(STORAGE_PREFIX + 'device_id', deviceId);
                    } catch (e) {
                        // If localStorage fails, return the ID anyway
                    }
                    return deviceId;
                }
            },
            
            // Status-specific storage methods
            getStatusCache: function() {
                const cache = this.get('status_cache');
                if (!cache || typeof cache !== 'object') {
                    return {
                        all: [],
                        friends: [],
                        closeFriends: [],
                        pinned: [],
                        muted: [],
                        highlights: [],
                        drafts: [],
                        lastUpdated: null
                    };
                }
                return cache;
            },
            
            setStatusCache: function(cache) {
                if (cache && typeof cache === 'object') {
                    cache.lastUpdated = new Date().toISOString();
                    return this.set('status_cache', cache);
                }
                return false;
            },
            
            getStatusDrafts: function() {
                const drafts = this.get('status_drafts');
                return Array.isArray(drafts) ? drafts : [];
            },
            
            saveStatusDraft: function(draft) {
                const drafts = this.getStatusDrafts();
                if (draft && typeof draft === 'object') {
                    draft.id = draft.id || 'draft_' + Date.now();
                    draft.updatedAt = new Date().toISOString();
                    drafts.push(draft);
                    return this.set('status_drafts', drafts);
                }
                return false;
            },
            
            updateStatusDraft: function(draftId, updates) {
                const drafts = this.getStatusDrafts();
                const index = drafts.findIndex(d => d.id === draftId);
                if (index !== -1) {
                    drafts[index] = { ...drafts[index], ...updates, updatedAt: new Date().toISOString() };
                    return this.set('status_drafts', drafts);
                }
                return false;
            },
            
            deleteStatusDraft: function(draftId) {
                const drafts = this.getStatusDrafts();
                const filtered = drafts.filter(d => d.id !== draftId);
                return this.set('status_drafts', filtered);
            },
            
            getStatusQueue: function() {
                const queue = this.get('status_queue');
                return Array.isArray(queue) ? queue : [];
            },
            
            addToStatusQueue: function(statusData) {
                const queue = this.getStatusQueue();
                if (statusData && typeof statusData === 'object') {
                    queue.push({
                        ...statusData,
                        queueId: 'queue_' + Date.now(),
                        createdAt: new Date().toISOString(),
                        attempts: 0
                    });
                    return this.set('status_queue', queue);
                }
                return false;
            },
            
            removeFromStatusQueue: function(queueId) {
                const queue = this.getStatusQueue();
                const filtered = queue.filter(item => item.queueId !== queueId);
                return this.set('status_queue', filtered);
            },
            
            incrementQueueAttempts: function(queueId) {
                const queue = this.getStatusQueue();
                const index = queue.findIndex(item => item.queueId === queueId);
                if (index !== -1) {
                    queue[index].attempts = (queue[index].attempts || 0) + 1;
                    queue[index].lastAttempt = new Date().toISOString();
                    return this.set('status_queue', queue);
                }
                return false;
            },
            
            // Connection status storage
            getLastConnectionStatus: function() {
                const status = this.get('last_connection_status');
                if (!status || typeof status !== 'object') {
                    return {
                        online: navigator.onLine,
                        lastChecked: new Date().toISOString(),
                        backendReachable: navigator.onLine
                    };
                }
                return status;
            },
            
            setLastConnectionStatus: function(status) {
                if (status && typeof status === 'object') {
                    return this.set('last_connection_status', {
                        online: status.online,
                        lastChecked: new Date().toISOString(),
                        backendReachable: status.backendReachable
                    });
                }
                return false;
            },
            
            // NEW: Premium status cache
            getPremiumStatus: function() {
                const premium = this.get('premium_status');
                if (!premium || typeof premium !== 'object') {
                    return {
                        isPremium: false,
                        expiresAt: null,
                        features: [],
                        lastChecked: null
                    };
                }
                return premium;
            },
            
            setPremiumStatus: function(premiumData) {
                if (premiumData && typeof premiumData === 'object') {
                    premiumData.lastChecked = new Date().toISOString();
                    return this.set('premium_status', premiumData);
                }
                return false;
            }
        };
        
        return _storage;
    }
    
    // ============================================================================
    // ENHANCED REQUEST FUNCTION - WITH ROBUST ERROR HANDLING
    // ============================================================================
    
    async function _moodChatRequest(endpoint, options = {}) {
        const config = _getConfig();
        const storage = _getStorage();
        
        const method = options.method || 'GET';
        const data = options.data || null;
        const auth = options.auth !== false;
        const retry = options.retry !== false;
        const cacheResponse = options.cacheResponse === true;
        const useCache = options.useCache === true && method === 'GET';
        const allowOffline = options.allowOffline === true;
        const offlineAction = options.offlineAction || 'cache'; // 'cache', 'queue', or 'reject'
        
        // Enhanced offline detection
        const isOffline = !_onlineStatus && !navigator.onLine;
        
        // Check if we're offline and handle accordingly
        if (isOffline && !allowOffline) {
            // Reject auth-related requests immediately when offline
            if (endpoint.includes('/auth/') && !endpoint.includes('/auth/me')) {
                return {
                    success: false,
                    status: 0,
                    message: 'Cannot authenticate while offline. Please check your internet connection.',
                    errorType: 'NETWORK',
                    offline: true,
                    requiresOnline: true,
                    timestamp: new Date().toISOString(),
                    endpoint: endpoint
                };
            }
            
            // Handle offline action based on option
            if (offlineAction === 'reject') {
                return {
                    success: false,
                    status: 0,
                    message: 'You are offline. Please check your internet connection.',
                    errorType: 'NETWORK',
                    offline: true,
                    timestamp: new Date().toISOString(),
                    endpoint: endpoint
                };
            } else if (offlineAction === 'cache' && useCache) {
                const cachedData = _getCachedStatusData(endpoint);
                if (cachedData) {
                    return {
                        success: true,
                        status: 200,
                        data: cachedData,
                        message: 'Returning cached data (offline)',
                        errorType: 'NETWORK',
                        offline: true,
                        cached: true,
                        timestamp: new Date().toISOString(),
                        endpoint: endpoint
                    };
                }
            }
        }
        
        if (!endpoint.startsWith('/')) {
            endpoint = '/' + endpoint;
        }
        
        endpoint = endpoint.replace('{id}', options.id || '');
        
        const url = config.BACKEND_URL + endpoint;
        
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Device-ID': storage.getDeviceId(),
            'X-Requested-With': 'XMLHttpRequest'
        };
        
        if (auth) {
            const token = storage.getToken();
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.TIMEOUT);
        
        const requestOptions = {
            method: method,
            headers: headers,
            credentials: 'include',
            mode: 'cors',
            signal: controller.signal
        };
        
        if (data && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            try {
                requestOptions.body = JSON.stringify(data);
            } catch (error) {
                clearTimeout(timeoutId);
                return {
                    success: false,
                    status: 400,
                    message: 'Invalid request data: ' + error.message,
                    errorType: 'VALIDATION',
                    timestamp: new Date().toISOString(),
                    endpoint: endpoint
                };
            }
        }
        
        let lastError = null;
        
        for (let attempt = 0; attempt <= (retry ? config.MAX_RETRIES : 0); attempt++) {
            if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
            
            try {
                const response = await fetch(url, requestOptions);
                clearTimeout(timeoutId);
                
                // Update online status based on fetch result
                if (response.ok) {
                    _onlineStatus = true;
                }
                
                if (response.type === 'opaque' || response.status === 0) {
                    throw new Error('CORS or network error - cannot reach server');
                }
                
                const responseText = await response.text();
                let responseData = null;
                
                if (responseText && responseText.trim()) {
                    try {
                        responseData = JSON.parse(responseText);
                    } catch (parseError) {
                        responseData = {
                            message: responseText || 'Server returned non-JSON response'
                        };
                    }
                }
                
                const result = {
                    success: response.ok,
                    status: response.status,
                    data: responseData,
                    timestamp: new Date().toISOString(),
                    endpoint: endpoint
                };
                
                // ERROR HANDLING
                if (!response.ok) {
                    if (responseData) {
                        result.message = responseData.message || 
                                        responseData.msg || 
                                        responseData.error || 
                                        responseData.detail ||
                                        'Request failed';
                        
                        if (responseData.errors) {
                            result.errors = responseData.errors;
                        }
                    } else {
                        result.message = response.statusText || 'Request failed with status ' + response.status;
                    }
                    
                    // ERROR CATEGORIZATION
                    if (response.status === 401) {
                        result.errorType = 'AUTH';
                        result.message = 'Authentication required. Please log in.';
                        storage.clearAuth();
                    } else if (response.status === 403) {
                        result.errorType = 'AUTH';
                        result.message = 'You do not have permission to perform this action.';
                    } else if (response.status === 404) {
                        result.errorType = 'BACKEND';
                        result.message = 'Resource not found.';
                    } else if (response.status === 422) {
                        result.errorType = 'VALIDATION';
                        result.message = 'Validation error. Please check your input.';
                    } else if (response.status >= 500) {
                        result.errorType = 'BACKEND';
                        result.message = 'Server error. Please try again later.';
                    } else {
                        result.errorType = 'BACKEND';
                    }
                } else {
                    // Success case
                    if (responseData) {
                        result.message = responseData.message || responseData.msg || 'Success';
                        
                        if (responseData.token || responseData.access_token) {
                            result.token = responseData.token || responseData.access_token;
                        }
                        
                        if (responseData.user) {
                            result.user = responseData.user;
                        }
                        
                        // Cache successful GET responses
                        if (cacheResponse && method === 'GET' && responseData.data) {
                            _cacheStatusResponse(endpoint, responseData.data);
                        }
                    } else {
                        result.message = 'Success';
                    }
                }
                
                if (response.status === 401 || response.status === 403) {
                    storage.clearAuth();
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                clearTimeout(timeoutId);
                
                // Update online status on network error
                if (error.name === 'AbortError' || error.message.includes('network') || error.message.includes('fetch')) {
                    _onlineStatus = false;
                    _notifyConnectionChange(false);
                }
                
                if (attempt === (retry ? config.MAX_RETRIES : 0)) {
                    // Try to return cached data for GET requests
                    if (useCache && method === 'GET') {
                        const cachedData = _getCachedStatusData(endpoint);
                        if (cachedData) {
                            return {
                                success: true,
                                status: 200,
                                data: cachedData,
                                message: 'Returning cached data (offline)',
                                errorType: 'NETWORK',
                                offline: true,
                                cached: true,
                                timestamp: new Date().toISOString(),
                                endpoint: endpoint
                            };
                        }
                    }
                    
                    let errorMessage = 'Cannot connect to server. ';
                    
                    if (error.name === 'AbortError') {
                        errorMessage = 'Request timed out. Please check your connection.';
                    } else if (error.message.includes('CORS')) {
                        errorMessage = 'CORS error - check backend configuration.';
                    } else if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
                        errorMessage = 'Network error. Please check your internet connection.';
                    } else {
                        errorMessage = error.message || 'Unknown network error';
                    }
                    
                    return {
                        success: false,
                        status: 0,
                        message: errorMessage,
                        errorType: 'NETWORK',
                        offline: true,
                        timestamp: new Date().toISOString(),
                        endpoint: endpoint
                    };
                }
            }
        }
        
        return {
            success: false,
            status: 0,
            message: 'Request failed after all retries',
            errorType: 'NETWORK',
            offline: true,
            timestamp: new Date().toISOString()
        };
    }
    
    // ============================================================================
    // STATUS CACHE MANAGEMENT - PRIVATE
    // ============================================================================
    
    function _cacheStatusResponse(endpoint, data) {
        const storage = _getStorage();
        const cache = storage.getStatusCache();
        
        if (endpoint.includes('/statuses/all')) {
            cache.all = Array.isArray(data) ? data : [];
        } else if (endpoint.includes('/statuses/friends')) {
            cache.friends = Array.isArray(data) ? data : [];
        } else if (endpoint.includes('/statuses/close-friends')) {
            cache.closeFriends = Array.isArray(data) ? data : [];
        } else if (endpoint.includes('/statuses/pinned')) {
            cache.pinned = Array.isArray(data) ? data : [];
        } else if (endpoint.includes('/statuses/muted')) {
            cache.muted = Array.isArray(data) ? data : [];
        } else if (endpoint.includes('/highlights')) {
            cache.highlights = Array.isArray(data) ? data : [];
        }
        
        cache.lastUpdated = new Date().toISOString();
        storage.setStatusCache(cache);
    }
    
    function _getCachedStatusData(endpoint) {
        const storage = _getStorage();
        const cache = storage.getStatusCache();
        
        if (endpoint.includes('/statuses/all')) {
            return Array.isArray(cache.all) ? cache.all : [];
        } else if (endpoint.includes('/statuses/friends')) {
            return Array.isArray(cache.friends) ? cache.friends : [];
        } else if (endpoint.includes('/statuses/close-friends')) {
            return Array.isArray(cache.closeFriends) ? cache.closeFriends : [];
        } else if (endpoint.includes('/statuses/pinned')) {
            return Array.isArray(cache.pinned) ? cache.pinned : [];
        } else if (endpoint.includes('/statuses/muted')) {
            return Array.isArray(cache.muted) ? cache.muted : [];
        } else if (endpoint.includes('/highlights')) {
            return Array.isArray(cache.highlights) ? cache.highlights : [];
        }
        
        return null;
    }
    
    async function _syncStatusQueue() {
        if (!_onlineStatus) {
            console.log('📵 Skipping queue sync - offline');
            return;
        }
        
        const storage = _getStorage();
        const queue = storage.getStatusQueue();
        
        if (!Array.isArray(queue) || queue.length === 0) return;
        
        console.log(`🔄 Syncing ${queue.length} queued statuses...`);
        
        // Try to sync each queued status
        for (const queuedStatus of queue) {
            if (!queuedStatus || typeof queuedStatus !== 'object') continue;
            
            if (queuedStatus.attempts >= 3) {
                // Too many attempts, remove from queue
                storage.removeFromStatusQueue(queuedStatus.queueId);
                console.warn(`🗑️ Removing queued status after too many attempts: ${queuedStatus.queueId}`);
                continue;
            }
            
            try {
                let endpoint = ENDPOINTS.STATUS_CREATE;
                let method = 'POST';
                
                if (queuedStatus.type === 'media' || queuedStatus.mediaUrl) {
                    endpoint = ENDPOINTS.STATUS_CREATE_MEDIA;
                }
                
                // Remove queue-specific fields
                const { queueId, attempts, createdAt, lastAttempt, ...statusData } = queuedStatus;
                
                const response = await _moodChatRequest(endpoint, {
                    method: method,
                    data: statusData,
                    auth: true,
                    retry: false
                });
                
                if (response.success) {
                    // Successfully synced, remove from queue
                    storage.removeFromStatusQueue(queuedStatus.queueId);
                    console.log('✅ Synced queued status:', queuedStatus.queueId);
                    
                    // Dispatch event for UI update
                    try {
                        if (window.dispatchEvent) {
                            window.dispatchEvent(new CustomEvent('status-queued-synced', {
                                detail: { queueId: queuedStatus.queueId, status: response.data }
                            }));
                        }
                    } catch (error) {
                        console.warn('Failed to dispatch status-queued-synced event:', error);
                    }
                } else {
                    // Increment attempts
                    storage.incrementQueueAttempts(queuedStatus.queueId);
                    console.warn(`⚠️ Failed to sync queued status (attempt ${queuedStatus.attempts + 1}):`, response.message);
                }
            } catch (error) {
                storage.incrementQueueAttempts(queuedStatus.queueId);
                console.error('❌ Error syncing queued status:', error);
            }
            
            // Small delay between sync attempts
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    // ============================================================================
    // AUTHENTICATION - WITH OFFLINE PROTECTION
    // ============================================================================
    
    function _getAuth() {
        if (_auth) return _auth;
        
        _auth = {
            validateEmail: function(email) {
                if (!email || typeof email !== 'string') return { valid: false, message: 'Email required' };
                const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return regex.test(email) ? 
                    { valid: true, message: 'Valid email' } : 
                    { valid: false, message: 'Invalid email address' };
            },
            
            validatePassword: function(password) {
                if (!password || typeof password !== 'string') return { valid: false, message: 'Password required' };
                if (password.length < 6) return { valid: false, message: 'Password must be at least 6 characters' };
                if (password.length > 50) return { valid: false, message: 'Password too long' };
                return { valid: true, message: 'Password OK' };
            },
            
            isLoggedIn: function() {
                try {
                    const token = _getStorage().getToken();
                    const user = _getStorage().getUser();
                    return !!(token && user);
                } catch (error) {
                    console.warn('Error checking login status:', error);
                    return false;
                }
            },
            
            getCurrentUser: function() {
                try {
                    return _getStorage().getUser();
                } catch (error) {
                    console.warn('Error getting current user:', error);
                    return null;
                }
            },
            
            loginUser: async function(emailOrUsernameOrMobile, password, method = 'email') {
                // Check online status for auth operations
                if (!_onlineStatus) {
                    return {
                        success: false,
                        message: 'Cannot login while offline. Please check your internet connection.',
                        status: 0,
                        errorType: 'NETWORK',
                        offline: true,
                        requiresOnline: true
                    };
                }
                
                if (!emailOrUsernameOrMobile || !password) {
                    return {
                        success: false,
                        message: `${method === 'email' ? 'Email' : method === 'username' ? 'Username' : 'Mobile'} and password required`,
                        status: 400,
                        errorType: 'VALIDATION'
                    };
                }
                
                // Prepare request data based on method
                const requestData = { password: String(password) };
                
                if (method === 'email') {
                    const emailCheck = this.validateEmail(emailOrUsernameOrMobile);
                    if (!emailCheck.valid) {
                        return {
                            success: false,
                            message: emailCheck.message,
                            status: 400,
                            errorType: 'VALIDATION'
                        };
                    }
                    requestData.email = String(emailOrUsernameOrMobile).trim();
                } else if (method === 'username') {
                    requestData.username = String(emailOrUsernameOrMobile).trim();
                } else if (method === 'mobile') {
                    requestData.mobile = String(emailOrUsernameOrMobile).trim();
                } else {
                    return {
                        success: false,
                        message: 'Invalid login method',
                        status: 400,
                        errorType: 'VALIDATION'
                    };
                }
                
                const response = await _moodChatRequest(ENDPOINTS.LOGIN, {
                    method: 'POST',
                    data: requestData,
                    auth: false,
                    retry: true,
                    allowOffline: false
                });
                
                if (response.success) {
                    if (response.token) {
                        _getStorage().setToken(response.token);
                    }
                    if (response.user || response.data) {
                        _getStorage().setUser(response.user || response.data);
                    }
                    
                    // Dispatch login event
                    try {
                        if (window.dispatchEvent) {
                            window.dispatchEvent(new CustomEvent('user-logged-in', {
                                detail: { user: response.user || response.data }
                            }));
                        }
                    } catch (error) {
                        console.warn('Failed to dispatch user-logged-in event:', error);
                    }
                } else {
                    if (response.status === 401) {
                        response.message = 'Invalid credentials';
                        response.errorType = 'AUTH';
                    }
                }
                
                return response;
            },
            
            register: async function(userData) {
                // Check online status for auth operations
                if (!_onlineStatus) {
                    return {
                        success: false,
                        message: 'Cannot register while offline. Please check your internet connection.',
                        status: 0,
                        errorType: 'NETWORK',
                        offline: true,
                        requiresOnline: true
                    };
                }
                
                if (!userData || typeof userData !== 'object') {
                    return {
                        success: false,
                        message: 'Invalid user data',
                        status: 400,
                        errorType: 'VALIDATION'
                    };
                }
                
                const emailCheck = this.validateEmail(userData.email);
                if (!emailCheck.valid) {
                    return {
                        success: false,
                        message: emailCheck.message,
                        status: 400,
                        errorType: 'VALIDATION'
                    };
                }
                
                const passwordCheck = this.validatePassword(userData.password);
                if (!passwordCheck.valid) {
                    return {
                        success: false,
                        message: passwordCheck.message,
                        status: 400,
                        errorType: 'VALIDATION'
                    };
                }
                
                if (!userData.username || userData.username.trim().length < 3) {
                    return {
                        success: false,
                        message: 'Username must be at least 3 characters',
                        status: 400,
                        errorType: 'VALIDATION'
                    };
                }
                
                // EXACT FIELDS REQUIRED BY BACKEND
                const requestData = {
                    email: String(userData.email).trim(),
                    password: String(userData.password),
                    username: String(userData.username).trim()
                };
                
                if (userData.name) requestData.name = String(userData.name).trim();
                if (userData.mobile) requestData.mobile = String(userData.mobile).trim();
                
                const response = await _moodChatRequest(ENDPOINTS.REGISTER, {
                    method: 'POST',
                    data: requestData,
                    auth: false,
                    retry: true,
                    allowOffline: false
                });
                
                if (response.success) {
                    if (response.token) {
                        _getStorage().setToken(response.token);
                    }
                    if (response.user || response.data) {
                        _getStorage().setUser(response.user || response.data);
                    }
                    
                    // Dispatch registration event
                    try {
                        if (window.dispatchEvent) {
                            window.dispatchEvent(new CustomEvent('user-registered', {
                                detail: { user: response.user || response.data }
                            }));
                        }
                    } catch (error) {
                        console.warn('Failed to dispatch user-registered event:', error);
                    }
                } else {
                    if (response.status === 409) {
                        response.message = 'Email already registered';
                        response.errorType = 'VALIDATION';
                    }
                }
                
                return response;
            },
            
            registerUser: async function(data) {
                return this.register(data);
            },
            
            resetPassword: async function(email) {
                // Check online status
                if (!_onlineStatus) {
                    return {
                        success: false,
                        message: 'Cannot reset password while offline. Please check your internet connection.',
                        status: 0,
                        errorType: 'NETWORK',
                        offline: true,
                        requiresOnline: true
                    };
                }
                
                const emailCheck = this.validateEmail(email);
                if (!emailCheck.valid) {
                    return {
                        success: false,
                        message: emailCheck.message,
                        status: 400,
                        errorType: 'VALIDATION'
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.FORGOT_PASSWORD, {
                    method: 'POST',
                    data: { email: String(email).trim() },
                    auth: false,
                    retry: true,
                    allowOffline: false
                });
            },
            
            forgotPassword: async function(email) {
                return this.resetPassword(email);
            },
            
            resetPasswordWithToken: async function(token, newPassword) {
                // Check online status
                if (!_onlineStatus) {
                    return {
                        success: false,
                        message: 'Cannot reset password while offline. Please check your internet connection.',
                        status: 0,
                        errorType: 'NETWORK',
                        offline: true,
                        requiresOnline: true
                    };
                }
                
                const passwordCheck = this.validatePassword(newPassword);
                if (!passwordCheck.valid) {
                    return {
                        success: false,
                        message: passwordCheck.message,
                        status: 400,
                        errorType: 'VALIDATION'
                    };
                }
                
                if (!token) {
                    return {
                        success: false,
                        message: 'Reset token required',
                        status: 400,
                        errorType: 'VALIDATION'
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.RESET_PASSWORD, {
                    method: 'POST',
                    data: { 
                        token: String(token),
                        newPassword: String(newPassword) 
                    },
                    auth: false,
                    retry: true,
                    allowOffline: false
                });
            },
            
            autoLogin: async function() {
                if (!this.isLoggedIn()) {
                    return {
                        success: false,
                        message: 'No saved login found',
                        authenticated: false
                    };
                }
                
                // Try to validate with backend if online
                if (_onlineStatus) {
                    try {
                        const response = await _moodChatRequest(ENDPOINTS.ME, {
                            method: 'GET',
                            auth: true,
                            retry: false,
                            allowOffline: false
                        });
                        
                        if (response.success) {
                            if (response.user || response.data) {
                                _getStorage().setUser(response.user || response.data);
                            }
                            return {
                                success: true,
                                message: 'Auto-login successful',
                                authenticated: true,
                                user: _getStorage().getUser(),
                                online: true
                            };
                        } else {
                            // If we're online but validation fails, clear auth
                            _getStorage().clearAuth();
                            return {
                                success: false,
                                message: 'Session expired',
                                authenticated: false
                            };
                        }
                    } catch (error) {
                        // Fall through to offline check
                        console.warn('Auto-login backend check failed:', error);
                    }
                }
                
                // Offline auto-login - use stored credentials
                try {
                    const token = _getStorage().getToken();
                    const user = _getStorage().getUser();
                    
                    if (token && user) {
                        return {
                            success: true,
                            message: 'Auto-login successful (offline mode)',
                            authenticated: true,
                            user: user,
                            offline: true
                        };
                    } else {
                        _getStorage().clearAuth();
                        return {
                            success: false,
                            message: 'No valid session found',
                            authenticated: false
                        };
                    }
                } catch (error) {
                    console.warn('Auto-login storage check failed:', error);
                    return {
                        success: false,
                        message: 'Error checking login status',
                        authenticated: false
                    };
                }
            },
            
            logout: async function() {
                // Try to notify backend if online
                if (_onlineStatus) {
                    try {
                        await _moodChatRequest(ENDPOINTS.LOGOUT, {
                            method: 'POST',
                            auth: true,
                            retry: false
                        });
                    } catch (error) {
                        // Ignore server errors during logout
                    }
                }
                
                _getStorage().clearAuth();
                
                // Dispatch logout event
                try {
                    if (window.dispatchEvent) {
                        window.dispatchEvent(new CustomEvent('user-logged-out'));
                    }
                } catch (error) {
                    console.warn('Failed to dispatch user-logged-out event:', error);
                }
                
                return {
                    success: true,
                    message: 'Logged out successfully'
                };
            },
            
            validateToken: async function() {
                if (!this.isLoggedIn()) {
                    return {
                        success: false,
                        message: 'Not logged in',
                        authenticated: false
                    };
                }
                
                if (_onlineStatus) {
                    try {
                        const response = await _moodChatRequest(ENDPOINTS.VALIDATE, {
                            method: 'GET',
                            auth: true,
                            retry: false
                        });
                        
                        return {
                            success: response.success,
                            message: response.message || (response.success ? 'Token valid' : 'Token invalid'),
                            authenticated: response.success,
                            online: true
                        };
                    } catch (error) {
                        // Fall through to offline check
                        console.warn('Token validation failed:', error);
                    }
                }
                
                // Offline validation
                try {
                    const token = _getStorage().getToken();
                    const user = _getStorage().getUser();
                    
                    return {
                        success: !!(token && user),
                        message: 'Offline validation',
                        authenticated: !!(token && user),
                        offline: true
                    };
                } catch (error) {
                    console.warn('Offline token validation failed:', error);
                    return {
                        success: false,
                        message: 'Error validating token',
                        authenticated: false
                    };
                }
            },
            
            updateProfile: async function(updates) {
                if (!updates || typeof updates !== 'object') {
                    return {
                        success: false,
                        message: 'Invalid update data',
                        errorType: 'VALIDATION'
                    };
                }
                
                // Check online status for profile updates
                if (!_onlineStatus) {
                    // Still update local storage for immediate UI feedback
                    try {
                        const currentUser = _getStorage().getUser();
                        if (currentUser) {
                            const updatedUser = Object.assign({}, currentUser, updates);
                            _getStorage().setUser(updatedUser);
                            
                            // Queue the update for when we're back online
                            const storage = _getStorage();
                            storage.addToStatusQueue({
                                type: 'profile_update',
                                updates: updates
                            });
                            
                            return {
                                success: true,
                                message: 'Profile updated locally. Will sync when online.',
                                offline: true,
                                queued: true,
                                user: updatedUser
                            };
                        }
                    } catch (error) {
                        console.warn('Failed to update profile offline:', error);
                    }
                }
                
                const response = await _moodChatRequest(ENDPOINTS.USER_UPDATE, {
                    method: 'PUT',
                    data: updates,
                    auth: true
                });
                
                if (response.success && (response.data || response.user)) {
                    try {
                        const currentUser = _getStorage().getUser();
                        if (currentUser) {
                            const updatedUser = Object.assign({}, currentUser, response.data || response.user);
                            _getStorage().setUser(updatedUser);
                        }
                    } catch (error) {
                        console.warn('Failed to update local user after profile update:', error);
                    }
                }
                
                return response;
            }
        };
        
        return _auth;
    }
    
    // ============================================================================
    // STATUS SYSTEM FUNCTIONS - WITH OFFLINE SUPPORT
    // ============================================================================
    
    function _getStatusFunctions() {
        return {
            // Get all statuses
            getStatuses: async function() {
                return await _moodChatRequest(ENDPOINTS.STATUS_ALL, {
                    method: 'GET',
                    auth: true,
                    cacheResponse: true,
                    useCache: true,
                    offlineAction: 'cache'
                });
            },
            
            // Get friends statuses only
            getFriendsStatuses: async function() {
                return await _moodChatRequest(ENDPOINTS.STATUS_FRIENDS, {
                    method: 'GET',
                    auth: true,
                    cacheResponse: true,
                    useCache: true,
                    offlineAction: 'cache'
                });
            },
            
            // Get close friends statuses
            getCloseFriendsStatuses: async function() {
                return await _moodChatRequest(ENDPOINTS.STATUS_CLOSE_FRIENDS, {
                    method: 'GET',
                    auth: true,
                    cacheResponse: true,
                    useCache: true,
                    offlineAction: 'cache'
                });
            },
            
            // Get pinned/highlighted statuses
            getPinnedStatuses: async function() {
                return await _moodChatRequest(ENDPOINTS.STATUS_PINNED, {
                    method: 'GET',
                    auth: true,
                    cacheResponse: true,
                    useCache: true,
                    offlineAction: 'cache'
                });
            },
            
            // Get muted users statuses
            getMutedStatuses: async function() {
                return await _moodChatRequest(ENDPOINTS.STATUS_MUTED, {
                    method: 'GET',
                    auth: true,
                    cacheResponse: true,
                    useCache: true,
                    offlineAction: 'cache'
                });
            },
            
            // Create text status
            createTextStatus: async function(data) {
                if (!data || typeof data !== 'object') {
                    return {
                        success: false,
                        message: 'Invalid status data',
                        errorType: 'VALIDATION'
                    };
                }
                
                const statusData = {
                    text: String(data.text || ''),
                    type: 'text',
                    background: data.background || null,
                    emoji: data.emoji || null,
                    category: data.category || 'general',
                    sensitivity: Boolean(data.sensitivity || false),
                    scheduledTime: data.scheduledTime || null,
                    visibility: data.visibility || 'friends',
                    allowComments: data.allowComments !== false,
                    allowReactions: data.allowReactions !== false
                };
                
                // If offline, queue for later sync
                if (!_onlineStatus) {
                    const storage = _getStorage();
                    storage.addToStatusQueue(statusData);
                    
                    // Also add to local cache for immediate UI feedback
                    try {
                        const cache = storage.getStatusCache();
                        if (Array.isArray(cache.all)) {
                            cache.all.unshift({
                                ...statusData,
                                id: 'local_' + Date.now(),
                                createdAt: new Date().toISOString(),
                                author: storage.getUser(),
                                isLocal: true
                            });
                            storage.setStatusCache(cache);
                        }
                    } catch (error) {
                        console.warn('Failed to add status to local cache:', error);
                    }
                    
                    return {
                        success: true,
                        message: 'Status queued for offline sync',
                        queued: true,
                        offline: true,
                        queueId: 'queued_' + Date.now(),
                        localId: 'local_' + Date.now()
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_CREATE, {
                    method: 'POST',
                    data: statusData,
                    auth: true,
                    retry: true
                });
            },
            
            // Create media status (photo/video)
            createMediaStatus: async function(data) {
                if (!data || typeof data !== 'object') {
                    return {
                        success: false,
                        message: 'Invalid media status data',
                        errorType: 'VALIDATION'
                    };
                }
                
                const statusData = {
                    type: data.type || 'photo', // 'photo' or 'video'
                    mediaUrl: String(data.mediaUrl || ''),
                    caption: String(data.caption || ''),
                    music: data.music || null,
                    duration: data.duration || null,
                    sensitivity: Boolean(data.sensitivity || false),
                    blurMedia: Boolean(data.blurMedia || false),
                    scheduledTime: data.scheduledTime || null,
                    visibility: data.visibility || 'friends',
                    allowComments: data.allowComments !== false,
                    allowReactions: data.allowReactions !== false
                };
                
                // If offline, queue for later sync
                if (!_onlineStatus) {
                    const storage = _getStorage();
                    storage.addToStatusQueue(statusData);
                    
                    // Also add to local cache for immediate UI feedback
                    try {
                        const cache = storage.getStatusCache();
                        if (Array.isArray(cache.all)) {
                            cache.all.unshift({
                                ...statusData,
                                id: 'local_' + Date.now(),
                                createdAt: new Date().toISOString(),
                                author: storage.getUser(),
                                isLocal: true
                            });
                            storage.setStatusCache(cache);
                        }
                    } catch (error) {
                        console.warn('Failed to add media status to local cache:', error);
                    }
                    
                    return {
                        success: true,
                        message: 'Media status queued for offline sync',
                        queued: true,
                        offline: true,
                        queueId: 'queued_' + Date.now(),
                        localId: 'local_' + Date.now()
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_CREATE_MEDIA, {
                    method: 'POST',
                    data: statusData,
                    auth: true,
                    retry: true
                });
            },
            
            // Get status drafts
            getStatusDrafts: async function() {
                // First try backend if online
                if (_onlineStatus) {
                    try {
                        const response = await _moodChatRequest(ENDPOINTS.STATUS_DRAFTS, {
                            method: 'GET',
                            auth: true,
                            useCache: true
                        });
                        
                        if (response.success) {
                            return response;
                        }
                    } catch (error) {
                        // Fall back to local storage
                        console.warn('Failed to get drafts from backend:', error);
                    }
                }
                
                // Return local drafts (online or offline)
                const storage = _getStorage();
                const drafts = storage.getStatusDrafts();
                return {
                    success: true,
                    data: drafts,
                    message: _onlineStatus ? 'Returning local drafts' : 'Returning local drafts (offline)',
                    offline: !_onlineStatus,
                    cached: true
                };
            },
            
            // Save status draft
            saveDraft: async function(draftData) {
                if (!draftData || typeof draftData !== 'object') {
                    return {
                        success: false,
                        message: 'Invalid draft data',
                        errorType: 'VALIDATION'
                    };
                }
                
                const storage = _getStorage();
                
                // Save locally
                storage.saveStatusDraft(draftData);
                
                // Try to sync with backend if online
                if (_onlineStatus) {
                    try {
                        return await _moodChatRequest(ENDPOINTS.STATUS_SAVE_DRAFT, {
                            method: 'POST',
                            data: draftData,
                            auth: true
                        });
                    } catch (error) {
                        // If backend fails, still return success from local save
                        console.warn('Failed to save draft to backend:', error);
                    }
                }
                
                return {
                    success: true,
                    message: _onlineStatus ? 'Draft saved locally' : 'Draft saved locally (offline)',
                    offline: !_onlineStatus
                };
            },
            
            // Schedule status for future posting
            scheduleStatus: async function(statusData, datetime) {
                // Check online status for scheduling
                if (!_onlineStatus) {
                    return {
                        success: false,
                        message: 'Cannot schedule status while offline. Please check your internet connection.',
                        offline: true,
                        requiresOnline: true
                    };
                }
                
                if (!statusData || typeof statusData !== 'object') {
                    return {
                        success: false,
                        message: 'Invalid status data',
                        errorType: 'VALIDATION'
                    };
                }
                
                const scheduleData = {
                    ...statusData,
                    scheduledTime: datetime,
                    isScheduled: true
                };
                
                return await _moodChatRequest(ENDPOINTS.STATUS_SCHEDULE, {
                    method: 'POST',
                    data: scheduleData,
                    auth: true,
                    retry: true
                });
            },
            
            // React to a status
            reactToStatus: async function(statusId, reactionType) {
                if (!statusId) {
                    return {
                        success: false,
                        message: 'Status ID required',
                        errorType: 'VALIDATION'
                    };
                }
                
                // If offline, store reaction locally
                if (!_onlineStatus) {
                    const storage = _getStorage();
                    const queue = storage.getStatusQueue();
                    
                    // Check if already queued
                    const existingReaction = queue.find(item => 
                        item.type === 'reaction' && 
                        item.statusId === statusId
                    );
                    
                    if (!existingReaction) {
                        storage.addToStatusQueue({
                            type: 'reaction',
                            statusId: String(statusId),
                            reaction: String(reactionType || 'like')
                        });
                    }
                    
                    return {
                        success: true,
                        message: 'Reaction queued for offline sync',
                        queued: true,
                        offline: true
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_REACT, {
                    method: 'POST',
                    data: { reaction: String(reactionType || 'like') },
                    id: String(statusId),
                    auth: true
                });
            },
            
            // Reply to a status
            replyToStatus: async function(statusId, message) {
                if (!statusId || !message) {
                    return {
                        success: false,
                        message: 'Status ID and message required',
                        errorType: 'VALIDATION'
                    };
                }
                
                // If offline, store reply locally
                if (!_onlineStatus) {
                    const storage = _getStorage();
                    storage.addToStatusQueue({
                        type: 'reply',
                        statusId: String(statusId),
                        message: String(message)
                    });
                    
                    return {
                        success: true,
                        message: 'Reply queued for offline sync',
                        queued: true,
                        offline: true
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_REPLY, {
                    method: 'POST',
                    data: { message: String(message) },
                    id: String(statusId),
                    auth: true
                });
            },
            
            // Get highlights
            getHighlights: async function() {
                return await _moodChatRequest(ENDPOINTS.STATUS_HIGHLIGHTS, {
                    method: 'GET',
                    auth: true,
                    cacheResponse: true,
                    useCache: true,
                    offlineAction: 'cache'
                });
            },
            
            // Add status to highlights
            addHighlight: async function(statusId) {
                if (!statusId) {
                    return {
                        success: false,
                        message: 'Status ID required',
                        errorType: 'VALIDATION'
                    };
                }
                
                // If offline, queue the action
                if (!_onlineStatus) {
                    const storage = _getStorage();
                    storage.addToStatusQueue({
                        type: 'highlight_add',
                        statusId: String(statusId)
                    });
                    
                    return {
                        success: true,
                        message: 'Highlight action queued for offline sync',
                        queued: true,
                        offline: true
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_ADD_HIGHLIGHT, {
                    method: 'POST',
                    data: { statusId: String(statusId) },
                    auth: true
                });
            },
            
            // Remove status from highlights
            removeHighlight: async function(statusId) {
                if (!statusId) {
                    return {
                        success: false,
                        message: 'Status ID required',
                        errorType: 'VALIDATION'
                    };
                }
                
                // If offline, queue the action
                if (!_onlineStatus) {
                    const storage = _getStorage();
                    storage.addToStatusQueue({
                        type: 'highlight_remove',
                        statusId: String(statusId)
                    });
                    
                    return {
                        success: true,
                        message: 'Highlight removal queued for offline sync',
                        queued: true,
                        offline: true
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_REMOVE_HIGHLIGHT, {
                    method: 'DELETE',
                    data: { statusId: String(statusId) },
                    auth: true
                });
            },
            
            // Track status view
            trackView: async function(statusId) {
                if (!statusId) {
                    return {
                        success: true,
                        message: 'No status ID provided',
                        skipped: true
                    };
                }
                
                // If offline, don't track views
                if (!_onlineStatus) {
                    return {
                        success: true,
                        message: 'View tracking skipped (offline)',
                        offline: true
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_TRACK_VIEW, {
                    method: 'POST',
                    data: {},
                    id: String(statusId),
                    auth: true
                });
            },
            
            // Auto-translate status
            autoTranslateStatus: async function(statusId) {
                if (!statusId) {
                    return {
                        success: false,
                        message: 'Status ID required',
                        errorType: 'VALIDATION'
                    };
                }
                
                // If offline, can't translate
                if (!_onlineStatus) {
                    return {
                        success: false,
                        message: 'Cannot translate while offline',
                        offline: true,
                        requiresOnline: true
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_TRANSLATE, {
                    method: 'POST',
                    data: {},
                    id: String(statusId),
                    auth: true
                });
            },
            
            // Create poll
            createPoll: async function(statusId, pollData) {
                if (!statusId || !pollData) {
                    return {
                        success: false,
                        message: 'Status ID and poll data required',
                        errorType: 'VALIDATION'
                    };
                }
                
                // If offline, queue poll creation
                if (!_onlineStatus) {
                    const storage = _getStorage();
                    storage.addToStatusQueue({
                        type: 'poll_create',
                        statusId: String(statusId),
                        pollData: pollData
                    });
                    
                    return {
                        success: true,
                        message: 'Poll creation queued for offline sync',
                        queued: true,
                        offline: true
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_POLL_CREATE, {
                    method: 'POST',
                    data: pollData,
                    id: String(statusId),
                    auth: true
                });
            },
            
            // Vote in poll
            votePoll: async function(statusId, optionId) {
                if (!statusId || !optionId) {
                    return {
                        success: false,
                        message: 'Status ID and option ID required',
                        errorType: 'VALIDATION'
                    };
                }
                
                // If offline, queue vote
                if (!_onlineStatus) {
                    const storage = _getStorage();
                    storage.addToStatusQueue({
                        type: 'poll_vote',
                        statusId: String(statusId),
                        optionId: String(optionId)
                    });
                    
                    return {
                        success: true,
                        message: 'Vote queued for offline sync',
                        queued: true,
                        offline: true
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_POLL_VOTE, {
                    method: 'POST',
                    data: { optionId: String(optionId) },
                    id: String(statusId),
                    auth: true
                });
            },
            
            // Mark status as sensitive
            markSensitive: async function(statusId, sensitive = true) {
                if (!statusId) {
                    return {
                        success: false,
                        message: 'Status ID required',
                        errorType: 'VALIDATION'
                    };
                }
                
                // If offline, queue the action
                if (!_onlineStatus) {
                    const storage = _getStorage();
                    storage.addToStatusQueue({
                        type: 'mark_sensitive',
                        statusId: String(statusId),
                        sensitive: Boolean(sensitive)
                    });
                    
                    return {
                        success: true,
                        message: 'Sensitivity change queued for offline sync',
                        queued: true,
                        offline: true
                    };
                }
                
                return await _moodChatRequest(ENDPOINTS.STATUS_MARK_SENSITIVE, {
                    method: 'PUT',
                    data: { sensitive: Boolean(sensitive) },
                    id: String(statusId),
                    auth: true
                });
            },
            
            // Check backend status
            checkStatus: async function() {
                try {
                    const response = await _moodChatRequest(ENDPOINTS.STATUS, {
                        method: 'GET',
                        auth: false,
                        retry: true
                    });
                    
                    const result = {
                        success: response.success,
                        message: response.message || (response.success ? 'Backend is healthy' : 'Backend issues'),
                        status: response.status,
                        timestamp: new Date().toISOString(),
                        online: response.success
                    };
                    
                    if (response.data) {
                        result.data = response.data;
                    }
                    
                    // Update online status
                    _onlineStatus = response.success;
                    if (response.success) {
                        _notifyConnectionChange(true);
                    }
                    
                    return result;
                    
                } catch (error) {
                    _onlineStatus = false;
                    _notifyConnectionChange(false);
                    
                    return {
                        success: false,
                        message: 'Cannot connect to backend server',
                        error: error.message,
                        timestamp: new Date().toISOString(),
                        online: false,
                        errorType: 'NETWORK'
                    };
                }
            }
        };
    }
    
    // ============================================================================
    // NEW: ROBUST BACKEND FUNCTIONS - WITH PROMISE-BASED IMPLEMENTATION
    // ============================================================================
    
    function _getBackendFunctions() {
        return {
            // Robust status loading with offline support
            loadStatuses: async function() {
                return new Promise(async (resolve) => {
                    try {
                        const result = await _moodChatRequest(ENDPOINTS.STATUS_ALL, {
                            method: 'GET',
                            auth: true,
                            cacheResponse: true,
                            useCache: true,
                            offlineAction: 'cache'
                        });
                        resolve(result);
                    } catch (error) {
                        resolve({
                            success: false,
                            message: 'Failed to load statuses: ' + error.message,
                            errorType: 'NETWORK',
                            offline: !_onlineStatus,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            },
            
            // Robust friends status loading
            loadFriendsStatuses: async function() {
                return new Promise(async (resolve) => {
                    try {
                        const result = await _moodChatRequest(ENDPOINTS.STATUS_FRIENDS, {
                            method: 'GET',
                            auth: true,
                            cacheResponse: true,
                            useCache: true,
                            offlineAction: 'cache'
                        });
                        resolve(result);
                    } catch (error) {
                        resolve({
                            success: false,
                            message: 'Failed to load friends statuses: ' + error.message,
                            errorType: 'NETWORK',
                            offline: !_onlineStatus,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            },
            
            // Load premium features
            loadPremiumFeatures: async function() {
                return new Promise(async (resolve) => {
                    // Check if user is premium first (offline check)
                    const user = _getStorage().getUser();
                    const isPremium = user && (user.isPremium || user.premium || user.tier === 'premium');
                    
                    if (!isPremium && !_onlineStatus) {
                        resolve({
                            success: false,
                            message: 'Cannot load premium features while offline without premium status',
                            offline: true,
                            requiresPremium: true
                        });
                        return;
                    }
                    
                    try {
                        const result = await _moodChatRequest(ENDPOINTS.PREMIUM_FEATURES, {
                            method: 'GET',
                            auth: true,
                            useCache: true,
                            offlineAction: 'cache'
                        });
                        resolve(result);
                    } catch (error) {
                        resolve({
                            success: false,
                            message: 'Failed to load premium features: ' + error.message,
                            errorType: 'NETWORK',
                            offline: !_onlineStatus,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            },
            
            // Load listings (marketplace/listings)
            loadListings: async function() {
                return new Promise(async (resolve) => {
                    try {
                        // This would be a marketplace endpoint - using a placeholder
                        const result = await _moodChatRequest('/marketplace/listings', {
                            method: 'GET',
                            auth: true,
                            useCache: true,
                            offlineAction: 'cache'
                        });
                        resolve(result);
                    } catch (error) {
                        // Fallback to empty listings when offline
                        resolve({
                            success: !_onlineStatus, // Success if offline (returning empty)
                            data: [],
                            message: _onlineStatus ? 'Failed to load listings' : 'Offline - returning empty listings',
                            offline: !_onlineStatus,
                            cached: !_onlineStatus,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            },
            
            // Load spotlight listings (featured/promoted)
            loadSpotlightListings: async function() {
                return new Promise(async (resolve) => {
                    try {
                        const result = await _moodChatRequest(ENDPOINTS.PREMIUM_SPOTLIGHT, {
                            method: 'GET',
                            auth: true,
                            useCache: true,
                            offlineAction: 'cache'
                        });
                        resolve(result);
                    } catch (error) {
                        // Fallback for offline
                        resolve({
                            success: !_onlineStatus, // Success if offline (returning empty)
                            data: [],
                            message: _onlineStatus ? 'Failed to load spotlight listings' : 'Offline - returning empty spotlight',
                            offline: !_onlineStatus,
                            cached: !_onlineStatus,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            },
            
            // Check premium user status
            checkPremiumStatus: async function() {
                return new Promise(async (resolve) => {
                    // First check local storage for cached premium status
                    const user = _getStorage().getUser();
                    if (user && (user.isPremium || user.premium || user.tier === 'premium')) {
                        resolve({
                            success: true,
                            isPremium: true,
                            message: 'Premium user (cached)',
                            cached: true,
                            user: user,
                            timestamp: new Date().toISOString()
                        });
                        return;
                    }
                    
                    // If offline and not premium in cache, return false
                    if (!_onlineStatus) {
                        resolve({
                            success: true,
                            isPremium: false,
                            message: 'Not premium (offline check)',
                            offline: true,
                            cached: true,
                            timestamp: new Date().toISOString()
                        });
                        return;
                    }
                    
                    // Online check with backend
                    try {
                        const result = await _moodChatRequest(ENDPOINTS.USER_PREMIUM_STATUS, {
                            method: 'GET',
                            auth: true,
                            useCache: true
                        });
                        
                        // Update local user if premium status changed
                        if (result.success && result.data && result.data.isPremium !== undefined) {
                            const currentUser = _getStorage().getUser();
                            if (currentUser) {
                                currentUser.isPremium = result.data.isPremium;
                                currentUser.premium = result.data.isPremium;
                                currentUser.tier = result.data.isPremium ? 'premium' : 'basic';
                                _getStorage().setUser(currentUser);
                            }
                        }
                        
                        resolve({
                            success: result.success,
                            isPremium: result.success && result.data ? result.data.isPremium : false,
                            message: result.message || (result.success ? 'Premium status checked' : 'Failed to check premium status'),
                            data: result.data,
                            timestamp: new Date().toISOString()
                        });
                    } catch (error) {
                        resolve({
                            success: false,
                            isPremium: false,
                            message: 'Failed to check premium status: ' + error.message,
                            errorType: 'NETWORK',
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            }
        };
    }
    
    // ============================================================================
    // PUBLIC API - SINGLE EXPOSED OBJECT WITH FUNCTION PROXY
    // ============================================================================
    
    const publicAPI = {
        // Singleton marker
        _singleton: true,
        _version: '5.4',
        _initialized: false,
        
        // Core request method
        request: _moodChatRequest,
        
        // Connection status methods
        isOnline: function() {
            return _onlineStatus;
        },
        
        getConnectionStatus: function() {
            return {
                online: _onlineStatus,
                browserOnline: navigator.onLine,
                lastChecked: _lastOnlineCheck,
                timestamp: new Date().toISOString()
            };
        },
        
        addConnectionListener: function(callback) {
            _addConnectionListener(callback);
        },
        
        removeConnectionListener: function(callback) {
            _removeConnectionListener(callback);
        },
        
        // Config
        getConfig: function() {
            return {
                backendUrl: BACKEND_URL,
                endpoints: ENDPOINTS,
                timeout: API_TIMEOUT,
                version: '5.4'
            };
        },
        
        // ============================================================================
        // NEW ROBUST BACKEND FUNCTIONS - EXPOSED PUBLICLY
        // ============================================================================
        
        // Status loading
        loadStatuses: async function() {
            return _getBackendFunctions().loadStatuses();
        },
        
        loadFriendsStatuses: async function() {
            return _getBackendFunctions().loadFriendsStatuses();
        },
        
        // Premium features
        loadPremiumFeatures: async function() {
            return _getBackendFunctions().loadPremiumFeatures();
        },
        
        // Listings
        loadListings: async function() {
            return _getBackendFunctions().loadListings();
        },
        
        loadSpotlightListings: async function() {
            return _getBackendFunctions().loadSpotlightListings();
        },
        
        // Premium status check
        checkPremiumStatus: async function() {
            return _getBackendFunctions().checkPremiumStatus();
        },
        
        // ============================================================================
        // STATUS SYSTEM FUNCTIONS
        // ============================================================================
        
        // Load all statuses (for status.html compatibility)
        getStatuses: async function() {
            return _getStatusFunctions().getStatuses();
        },
        
        // Load friends statuses (for status.html compatibility)
        getFriendsStatuses: async function() {
            return _getStatusFunctions().getFriendsStatuses();
        },
        
        // Additional status functions
        getCloseFriendsStatuses: async function() {
            return _getStatusFunctions().getCloseFriendsStatuses();
        },
        
        getPinnedStatuses: async function() {
            return _getStatusFunctions().getPinnedStatuses();
        },
        
        getMutedStatuses: async function() {
            return _getStatusFunctions().getMutedStatuses();
        },
        
        createTextStatus: async function(data) {
            return _getStatusFunctions().createTextStatus(data);
        },
        
        createMediaStatus: async function(data) {
            return _getStatusFunctions().createMediaStatus(data);
        },
        
        getStatusDrafts: async function() {
            return _getStatusFunctions().getStatusDrafts();
        },
        
        saveDraft: async function(draftData) {
            return _getStatusFunctions().saveDraft(draftData);
        },
        
        scheduleStatus: async function(statusData, datetime) {
            return _getStatusFunctions().scheduleStatus(statusData, datetime);
        },
        
        reactToStatus: async function(statusId, reactionType) {
            return _getStatusFunctions().reactToStatus(statusId, reactionType);
        },
        
        replyToStatus: async function(statusId, message) {
            return _getStatusFunctions().replyToStatus(statusId, message);
        },
        
        getHighlights: async function() {
            return _getStatusFunctions().getHighlights();
        },
        
        addHighlight: async function(statusId) {
            return _getStatusFunctions().addHighlight(statusId);
        },
        
        removeHighlight: async function(statusId) {
            return _getStatusFunctions().removeHighlight(statusId);
        },
        
        trackView: async function(statusId) {
            return _getStatusFunctions().trackView(statusId);
        },
        
        autoTranslateStatus: async function(statusId) {
            return _getStatusFunctions().autoTranslateStatus(statusId);
        },
        
        // Enhanced features placeholders
        createPoll: async function(statusId, pollData) {
            return _getStatusFunctions().createPoll(statusId, pollData);
        },
        
        votePoll: async function(statusId, optionId) {
            return _getStatusFunctions().votePoll(statusId, optionId);
        },
        
        markSensitive: async function(statusId, sensitive = true) {
            return _getStatusFunctions().markSensitive(statusId, sensitive);
        },
        
        // Sync queued statuses
        syncQueuedStatuses: async function() {
            await _syncStatusQueue();
            return {
                success: true,
                message: 'Synced queued statuses',
                timestamp: new Date().toISOString()
            };
        },
        
        // Clear status cache
        clearStatusCache: function() {
            const storage = _getStorage();
            const cache = storage.getStatusCache();
            cache.all = [];
            cache.friends = [];
            cache.closeFriends = [];
            cache.pinned = [];
            cache.muted = [];
            cache.highlights = [];
            cache.lastUpdated = null;
            storage.setStatusCache(cache);
            return true;
        },
        
        // Get queued items count
        getQueuedItemsCount: function() {
            const storage = _getStorage();
            const queue = storage.getStatusQueue();
            return Array.isArray(queue) ? queue.length : 0;
        },
        
        // ============================================================================
        // REQUIRED FUNCTIONS FOR APP.JS COMPATIBILITY
        // ============================================================================
        
        checkStatus: async function() {
            return _getStatusFunctions().checkStatus();
        },
        
        // NEW: loginUser (for app.js compatibility)
        loginUser: function(emailOrUsernameOrMobile, password, method = 'email') {
            return _getAuth().loginUser(emailOrUsernameOrMobile, password, method);
        },
        
        // NEW: registerUser (for app.js compatibility)
        registerUser: function(data) {
            return _getAuth().registerUser(data);
        },
        
        // NEW: resetPassword (for app.js compatibility)
        resetPassword: function(email) {
            return _getAuth().resetPassword(email);
        },
        
        // ============================================================================
        // ORIGINAL FUNCTIONS (All preserved)
        // ============================================================================
        
        // Friends management
        getFriends: function() {
            return _moodChatRequest(ENDPOINTS.FRIENDS_LIST, {
                method: 'GET',
                auth: true,
                useCache: true,
                offlineAction: 'cache'
            });
        },
        
        addFriend: function(userId, message) {
            if (!userId) {
                return {
                    success: false,
                    message: 'User ID required',
                    errorType: 'VALIDATION'
                };
            }
            
            // If offline, queue friend request
            if (!_onlineStatus) {
                const storage = _getStorage();
                storage.addToStatusQueue({
                    type: 'friend_request',
                    userId: String(userId),
                    message: String(message || '')
                });
                
                return {
                    success: true,
                    message: 'Friend request queued for offline sync',
                    queued: true,
                    offline: true
                };
            }
            
            return _moodChatRequest(ENDPOINTS.FRIENDS_ADD, {
                method: 'POST',
                data: { userId: String(userId), message: String(message || '') },
                auth: true
            });
        },
        
        getFriendRequests: function() {
            return _moodChatRequest(ENDPOINTS.FRIENDS_REQUESTS, {
                method: 'GET',
                auth: true,
                useCache: true,
                offlineAction: 'cache'
            });
        },
        
        acceptFriendRequest: function(requestId) {
            if (!requestId) {
                return {
                    success: false,
                    message: 'Request ID required',
                    errorType: 'VALIDATION'
                };
            }
            
            // If offline, queue acceptance
            if (!_onlineStatus) {
                const storage = _getStorage();
                storage.addToStatusQueue({
                    type: 'friend_accept',
                    requestId: String(requestId)
                });
                
                return {
                    success: true,
                    message: 'Friend acceptance queued for offline sync',
                    queued: true,
                    offline: true
                };
            }
            
            return _moodChatRequest(ENDPOINTS.FRIENDS_ACCEPT, {
                method: 'POST',
                data: { requestId: String(requestId) },
                auth: true
            });
        },
        
        rejectFriendRequest: function(requestId) {
            if (!requestId) {
                return {
                    success: false,
                    message: 'Request ID required',
                    errorType: 'VALIDATION'
                };
            }
            
            // If offline, queue rejection
            if (!_onlineStatus) {
                const storage = _getStorage();
                storage.addToStatusQueue({
                    type: 'friend_reject',
                    requestId: String(requestId)
                });
                
                return {
                    success: true,
                    message: 'Friend rejection queued for offline sync',
                    queued: true,
                    offline: true
                };
            }
            
            return _moodChatRequest(ENDPOINTS.FRIENDS_REJECT, {
                method: 'POST',
                data: { requestId: String(requestId) },
                auth: true
            });
        },
        
        removeFriend: function(friendId) {
            if (!friendId) {
                return {
                    success: false,
                    message: 'Friend ID required',
                    errorType: 'VALIDATION'
                };
            }
            
            // If offline, queue removal
            if (!_onlineStatus) {
                const storage = _getStorage();
                storage.addToStatusQueue({
                    type: 'friend_remove',
                    friendId: String(friendId)
                });
                
                return {
                    success: true,
                    message: 'Friend removal queued for offline sync',
                    queued: true,
                    offline: true
                };
            }
            
            return _moodChatRequest(ENDPOINTS.FRIENDS_REMOVE, {
                method: 'DELETE',
                data: { friendId: String(friendId) },
                auth: true
            });
        },
        
        // Chat management
        getChatRooms: function() {
            return _moodChatRequest(ENDPOINTS.CHATS_LIST, {
                method: 'GET',
                auth: true,
                useCache: true,
                offlineAction: 'cache'
            });
        },
        
        createChat: function(chatData) {
            // If offline, reject chat creation
            if (!_onlineStatus) {
                return {
                    success: false,
                    message: 'Cannot create chat while offline',
                    offline: true,
                    requiresOnline: true
                };
            }
            
            return _moodChatRequest(ENDPOINTS.CHAT_CREATE, {
                method: 'POST',
                data: chatData,
                auth: true
            });
        },
        
        getChatMessages: function(chatId, limit) {
            if (!chatId) {
                return {
                    success: false,
                    message: 'Chat ID required',
                    errorType: 'VALIDATION'
                };
            }
            
            let endpoint = ENDPOINTS.CHAT_MESSAGES.replace('{id}', String(chatId));
            if (limit) {
                endpoint += '?limit=' + Number(limit);
            }
            return _moodChatRequest(endpoint, {
                method: 'GET',
                auth: true,
                useCache: true,
                offlineAction: 'cache'
            });
        },
        
        sendMessage: function(chatId, message, type) {
            if (!chatId || !message) {
                return {
                    success: false,
                    message: 'Chat ID and message required',
                    errorType: 'VALIDATION'
                };
            }
            
            const endpoint = ENDPOINTS.CHAT_SEND.replace('{id}', String(chatId));
            
            // If offline, queue message
            if (!_onlineStatus) {
                const storage = _getStorage();
                storage.addToStatusQueue({
                    type: 'chat_message',
                    chatId: String(chatId),
                    message: String(message),
                    messageType: String(type || 'text')
                });
                
                return {
                    success: true,
                    message: 'Message queued for offline sync',
                    queued: true,
                    offline: true
                };
            }
            
            return _moodChatRequest(endpoint, {
                method: 'POST',
                data: { 
                    message: String(message), 
                    type: String(type || 'text') 
                },
                auth: true
            });
        },
        
        // User status
        updateStatus: function(status, emoji) {
            // If offline, queue status update
            if (!_onlineStatus) {
                const storage = _getStorage();
                storage.addToStatusQueue({
                    type: 'user_status',
                    status: String(status || ''),
                    emoji: String(emoji || '')
                });
                
                // Update local user object for immediate UI feedback
                try {
                    const user = storage.getUser();
                    if (user) {
                        user.status = String(status || '');
                        user.statusEmoji = String(emoji || '');
                        storage.setUser(user);
                    }
                } catch (error) {
                    console.warn('Failed to update local user status:', error);
                }
                
                return {
                    success: true,
                    message: 'Status update queued for offline sync',
                    queued: true,
                    offline: true
                };
            }
            
            return _moodChatRequest(ENDPOINTS.USER_STATUS, {
                method: 'POST',
                data: { 
                    status: String(status || ''), 
                    emoji: String(emoji || '') 
                },
                auth: true
            });
        },
        
        // Auth functions (original)
        register: function(userData) {
            return _getAuth().register(userData);
        },
        
        login: function(email, password) {
            return _getAuth().loginUser(email, password, 'email');
        },
        
        forgotPassword: function(email) {
            return _getAuth().forgotPassword(email);
        },
        
        resetPasswordWithToken: function(token, newPassword) {
            return _getAuth().resetPasswordWithToken(token, newPassword);
        },
        
        autoLogin: function() {
            return _getAuth().autoLogin();
        },
        
        logout: function() {
            return _getAuth().logout();
        },
        
        validateToken: function() {
            return _getAuth().validateToken();
        },
        
        isLoggedIn: function() {
            return _getAuth().isLoggedIn();
        },
        
        getCurrentUser: function() {
            return _getAuth().getCurrentUser();
        },
        
        updateProfile: function(updates) {
            return _getAuth().updateProfile(updates);
        },
        
        // Validation
        validateEmail: function(email) {
            return _getAuth().validateEmail(email);
        },
        
        validatePassword: function(password) {
            return _getAuth().validatePassword(password);
        },
        
        // Storage access
        getToken: function() {
            return _getStorage().getToken();
        },
        
        getUser: function() {
            return _getStorage().getUser();
        },
        
        clearAuth: function() {
            return _getStorage().clearAuth();
        },
        
        getDeviceId: function() {
            return _getStorage().getDeviceId();
        },
        
        // Offline utilities
        isOffline: function() {
            return !_onlineStatus;
        },
        
        // Force connection check
        forceConnectionCheck: async function() {
            const result = await _getStatusFunctions().checkStatus();
            return result;
        },
        
        // Initialize function for app.js to call
        initialize: function() {
            console.log('✅ MoodChatAPI initialized successfully');
            this._initialized = true;
            return true;
        }
    };
    
    // Mark as initialized
    _initialized = true;
    publicAPI._initialized = true;
    
    // Set up connection monitoring
    _setupConnectionMonitoring();
    
    // Create window.api as a function proxy BEFORE assigning MoodChatAPI
    const apiFunction = function(method, ...args) {
        // If called without method, return the API object itself
        if (!method) {
            return publicAPI;
        }
        
        // If method exists on publicAPI, call it
        if (typeof publicAPI[method] === 'function') {
            return publicAPI[method](...args);
        }
        
        // Handle promise chain methods
        if (method === 'then' || method === 'catch' || method === 'finally') {
            return Promise.resolve(publicAPI)[method](...args);
        }
        
        // Return error for unknown methods
        return {
            success: false,
            message: `Method ${method} not found on MoodChatAPI`,
            errorType: 'VALIDATION'
        };
    };
    
    // Copy all properties from publicAPI to the function for compatibility
    Object.keys(publicAPI).forEach(key => {
        if (key !== '_singleton' && key !== '_version') {
            Object.defineProperty(apiFunction, key, {
                get: function() { return publicAPI[key]; },
                configurable: true,
                enumerable: true
            });
        }
    });
    
    // Add the singleton properties
    apiFunction._singleton = true;
    apiFunction._version = '5.4';
    apiFunction._isFunctionProxy = true;
    
    // Replace window.api with our enhanced function
    window.api = apiFunction;
    
    // Now assign MoodChatAPI as well for direct access
    window.MoodChatAPI = publicAPI;
    
    console.log('✅ MoodChat API Singleton v5.4 loaded successfully');
    console.log('🔗 window.api is now a function proxy that delegates to MoodChatAPI');
    console.log('🌐 Backend URL:', publicAPI.getConfig().backendUrl);
    console.log('📶 Connection status:', publicAPI.isOnline() ? 'Online' : 'Offline');
    console.log('🔐 Auth status:', publicAPI.isLoggedIn() ? 'Logged in' : 'Not logged in');
    console.log('💎 Premium features: ENABLED with offline support');
    console.log('📡 Offline detection: ACTIVE using navigator.onLine');
    
    // Dispatch ready event
    try {
        if (window.dispatchEvent) {
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('api-ready', {
                    detail: { 
                        api: publicAPI,
                        isFunctionProxy: true,
                        version: '5.4'
                    }
                }));
            }, 0);
        }
    } catch (error) {
        console.warn('Failed to dispatch api-ready event:', error);
    }
    
    // Start auto-initialization
    setTimeout(function() {
        // Auto-login if token exists
        if (publicAPI.getToken()) {
            publicAPI.autoLogin().then(function(result) {
                if (result.success) {
                    try {
                        if (window.dispatchEvent) {
                            const event = new CustomEvent('auth-changed', { 
                                detail: { 
                                    authenticated: true, 
                                    user: result.user,
                                    offline: result.offline || false
                                } 
                            });
                            window.dispatchEvent(event);
                        }
                    } catch (error) {
                        console.warn('Failed to dispatch auth-changed event:', error);
                    }
                }
            }).catch(error => {
                console.warn('Auto-login failed:', error);
            });
        }
        
        // Check backend status
        setTimeout(() => {
            publicAPI.checkStatus().then(function(health) {
                if (!health.success) {
                    try {
                        if (window.dispatchEvent) {
                            const event = new CustomEvent('backend-status', { 
                                detail: { 
                                    online: false, 
                                    message: health.message,
                                    timestamp: health.timestamp
                                } 
                            });
                            window.dispatchEvent(event);
                        }
                    } catch (error) {
                        console.warn('Failed to dispatch backend-status event:', error);
                    }
                } else {
                    // Sync queued statuses if online
                    publicAPI.syncQueuedStatuses();
                }
            }).catch(error => {
                console.warn('Backend status check failed:', error);
            });
        }, 500);
        
        // Periodically sync queued statuses (every 30 seconds) when online
        if (window.setInterval) {
            setInterval(function() {
                if (publicAPI.isLoggedIn() && publicAPI.isOnline()) {
                    publicAPI.syncQueuedStatuses();
                }
            }, 30000);
        }
        
    }, 100);
    
    _isInitializing = false;
})();

// ============================================================================
// UTILITY FUNCTIONS - Always available
// ============================================================================

// Ensure utility functions are always available
if (typeof window.handleApiError === 'undefined') {
    window.handleApiError = function(error, defaultMessage) {
        if (error && error.message) {
            return error.message;
        } else if (error && typeof error === 'string') {
            return error;
        } else if (defaultMessage) {
            return defaultMessage;
        } else {
            return 'An unexpected error occurred';
        }
    };
}

if (typeof window.isNetworkError === 'undefined') {
    window.isNetworkError = function(error) {
        return error && (
            error.offline === true || 
            error.status === 0 || 
            error.errorType === 'NETWORK' ||
            (error.message && (
                error.message.includes('network') || 
                error.message.includes('fetch') ||
                error.message.includes('CORS') ||
                error.message.includes('timeout') ||
                error.message.includes('connect')
            ))
        );
    };
}

// Connection status utility
if (typeof window.getConnectionStatus === 'undefined') {
    window.getConnectionStatus = function() {
        return window.api ? window.api.getConnectionStatus() : {
            online: navigator.onLine,
            apiAvailable: !!window.api,
            timestamp: new Date().toISOString()
        };
    };
}

// Final safety check: if window.api isn't a function, create a minimal one
setTimeout(() => {
    if (!window.api || typeof window.api !== 'function') {
        console.warn('⚠️ window.api not properly initialized, creating final fallback function');
        
        const fallbackAPI = {
            _initialized: false,
            _isFallback: true,
            isOnline: () => navigator.onLine,
            isLoggedIn: () => false,
            getCurrentUser: () => null,
            getConnectionStatus: () => ({ 
                online: navigator.onLine, 
                apiAvailable: false,
                timestamp: new Date().toISOString()
            }),
            checkStatus: async () => ({
                success: false,
                message: 'API not loaded',
                online: false
            })
        };
        
        window.api = function(method, ...args) {
            if (!method) {
                return fallbackAPI;
            }
            
            if (fallbackAPI[method] && typeof fallbackAPI[method] === 'function') {
                return fallbackAPI[method](...args);
            }
            
            return Promise.reject(new Error(`API method ${method} not available`));
        };
        
        // Copy properties
        Object.keys(fallbackAPI).forEach(key => {
            Object.defineProperty(window.api, key, {
                get: () => fallbackAPI[key],
                configurable: true
            });
        });
        
        console.log('🔄 Created final fallback window.api function');
    }
}, 1000);

// ============================================================================
// KEY FIXES EXPLAINED FOR FUTURE MAINTENANCE
// ============================================================================
/*
KEY FIXES IMPLEMENTED:

1. window.api AS FUNCTION PROXY:
   - window.api is now a function that delegates to MoodChatAPI methods
   - Compatible with both window.api.method() and window.api('method', args)
   - Available immediately on page load

2. SINGLETON HANDLING:
   - Prevents STOP_EXECUTION_SINGLETON_LOADED errors
   - Graceful handling of duplicate loads
   - Proper error catching

3. NEW BACKEND FUNCTIONS:
   - loadStatuses(): Robust status loading with offline support
   - loadFriendsStatuses(): Friends status loading
   - loadPremiumFeatures(): Premium feature loading
   - loadListings(): Marketplace listings
   - loadSpotlightListings(): Featured/promoted listings
   - checkPremiumStatus(): Premium status checking

4. ENHANCED OFFLINE DETECTION:
   - Uses navigator.onLine for immediate detection
   - window.addEventListener for online/offline events
   - Backend connectivity checks
   - Graceful fallback to cached data

5. PROMISE-BASED IMPLEMENTATION:
   - All new functions return proper Promises
   - Consistent error handling
   - Async/await pattern throughout

6. BACKWARD COMPATIBILITY:
   - All existing functions preserved exactly
   - New functions added without breaking changes
   - window.MoodChatAPI still available for direct access

7. ERROR HANDLING:
   - Network errors caught and handled
   - Offline mode provides cached data
   - Clear error messages for debugging
*/