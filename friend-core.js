// =============================================
// FRIEND PAGE - CORE IMPLEMENTATION
// Centralized Session Authority Integration
// =============================================

import { 
    login, 
    register, 
    secureFetch, 
    getCurrentUser as getCurrentUserFromAPI, 
    logout,
    getValidToken,
    apiCallWithRetry,
    escapeHtml,
    formatTimeAgo,
    formatDate,
    getTrustScoreClass,
    showNotification,
    navigateToChat,
    navigateToCall,
    simulateContactSync
} from './js/api.core.js';

import { getMessages } from './js/api.messages.js';

// =============================================
// PARENT COORDINATION SYSTEM
// =============================================

export const ParentCoordinator = {
    // Configuration
    config: {
        parentOrigin: window.location.origin,
        handshakeTimeout: 10000,
        maxRetries: 10,
        retryBaseDelay: 100,
        sessionExpiry: 30 * 60 * 1000,
        debug: true
    },
    
    // State
    state: {
        parentDetected: false,
        handshakeComplete: false,
        sessionReceived: false,
        sessionData: null,
        lastSync: null,
        initializationLock: false,
        retryCount: 0,
        messageHandlersBound: false,
        parentReachable: false,
        authReady: false
    },
    
    // UI State
    ui: {
        protectedUIBlocked: true,
        authErrorDisplayed: false,
        reconnectionDisplayed: false
    },
    
    // Initialize parent coordination system
    init: async function() {
        if (this.state.initializationLock) {
            this.log('Initialization already in progress');
            return;
        }
        
        this.state.initializationLock = true;
        this.log('Starting parent coordination system');
        
        try {
            await this.detectParent();
            this.bindMessageHandlers();
            this.initiateHandshake();
            this.setupReconnectionMonitor();
            
            this.log('Parent coordination system initialized');
            
        } catch (error) {
            this.logError('Parent coordination initialization failed:', error);
            this.handleParentUnavailable();
        }
    },
    
    // Detect parent window
    detectParent: function() {
        return new Promise((resolve, reject) => {
            this.log('Detecting parent window...');
            
            if (window.parent === window || !window.parent) {
                this.log('No parent window detected');
                this.state.parentDetected = false;
                reject(new Error('Parent window not available'));
                return;
            }
            
            try {
                const parentOrigin = window.parent.location.origin;
                const currentOrigin = window.location.origin;
                
                if (parentOrigin !== currentOrigin) {
                    this.log(`Cross-origin parent detected: ${parentOrigin}`);
                }
                
                this.state.parentDetected = true;
                this.state.parentOrigin = parentOrigin;
                this.log(`Parent detected at origin: ${parentOrigin}`);
                resolve();
                
            } catch (error) {
                this.log('Cross-origin parent detected (restricted access)');
                this.state.parentDetected = true;
                this.state.parentOrigin = '*';
                resolve();
            }
        });
    },
    
    // Bind message handlers for secure communication
    bindMessageHandlers: function() {
        if (this.state.messageHandlersBound) {
            this.log('Message handlers already bound');
            return;
        }
        
        this.log('Binding message handlers');
        
        window.addEventListener('message', this.handleParentMessage.bind(this), false);
        
        window.addEventListener('knectaAuthReady', this.handleAuthReady.bind(this));
        window.addEventListener('knectaTokenExpired', this.handleTokenExpired.bind(this));
        window.addEventListener('knectaAuthError', this.handleAuthError.bind(this));
        
        this.state.messageHandlersBound = true;
        this.log('Message handlers bound successfully');
    },
    
    // Handle messages from parent window
    handleParentMessage: function(event) {
        if (this.config.parentOrigin !== '*' && event.origin !== this.config.parentOrigin) {
            this.log(`Ignoring message from unauthorized origin: ${event.origin}`);
            return;
        }
        
        const data = event.data;
        if (!data || !data.type) {
            return;
        }
        
        this.log(`Received message from parent: ${data.type}`, data);
        
        switch (data.type) {
            case 'SESSION_DATA':
                this.handleSessionData(data);
                break;
                
            case 'SESSION_UPDATE':
                this.handleSessionUpdate(data);
                break;
                
            case 'LOGOUT':
                this.handleLogout(data);
                break;
                
            case 'HANDSHAKE_ACK':
                this.handleHandshakeAck(data);
                break;
                
            case 'PARENT_READY':
                this.handleParentReady(data);
                break;
                
            case 'AUTH_STATE_CHANGED':
                this.handleAuthStateChanged(data);
                break;
                
            case 'USER_PROFILE_UPDATED':
                this.handleProfileUpdated(data);
                break;
                
            case 'userDataResponse':
                this.handleLegacyUserData(data);
                break;
                
            case 'authStateChanged':
                this.handleLegacyAuthState(data);
                break;
                
            default:
                this.log(`Unknown message type: ${data.type}`);
        }
    },
    
    // Handshake Protocol
    initiateHandshake: function() {
        if (!this.state.parentDetected) {
            this.log('Cannot initiate handshake: parent not detected');
            return;
        }
        
        this.log('Initiating handshake with parent');
        
        this.sendToParent({
            type: 'CHILD_READY',
            source: 'friend.html',
            timestamp: Date.now(),
            version: '1.0'
        });
        
        this.requestSessionWithRetry();
    },
    
    // Request session with exponential backoff
    requestSessionWithRetry: function() {
        if (this.state.sessionReceived || this.state.retryCount >= this.config.maxRetries) {
            if (this.state.retryCount >= this.config.maxRetries) {
                this.log('Max retries reached for session request');
                this.handleParentUnavailable();
            }
            return;
        }
        
        const delay = this.config.retryBaseDelay * Math.pow(2, this.state.retryCount);
        
        setTimeout(() => {
            if (!this.state.sessionReceived) {
                this.state.retryCount++;
                this.log(`Requesting session (attempt ${this.state.retryCount})`);
                
                this.sendToParent({
                    type: 'REQUEST_SESSION',
                    source: 'friend.html',
                    timestamp: Date.now(),
                    retryCount: this.state.retryCount
                });
                
                this.requestSessionWithRetry();
            }
        }, delay);
    },
    
    // Handle handshake acknowledgement
    handleHandshakeAck: function(data) {
        this.log('Handshake acknowledged by parent');
        this.state.handshakeComplete = true;
        this.state.retryCount = 0;
        
        setTimeout(() => {
            this.sendToParent({
                type: 'REQUEST_SESSION',
                source: 'friend.html',
                timestamp: Date.now()
            });
        }, 500);
    },
    
    // Handle parent ready signal
    handleParentReady: function(data) {
        this.log('Parent reported ready state');
        this.state.parentReachable = true;
        
        if (!this.state.sessionReceived) {
            this.sendToParent({
                type: 'REQUEST_SESSION',
                source: 'friend.html',
                timestamp: Date.now()
            });
        }
    },
    
    // Handle session data from parent
    handleSessionData: function(data) {
        this.log('Received session data from parent');
        
        if (!this.validateSessionData(data)) {
            this.logError('Invalid session data schema:', data);
            this.sendToParent({
                type: 'SESSION_ERROR',
                source: 'friend.html',
                error: 'Invalid session data schema'
            });
            return;
        }
        
        this.state.sessionData = data.session;
        this.state.sessionReceived = true;
        this.state.lastSync = Date.now();
        this.state.authReady = true;
        this.state.retryCount = 0;
        
        this.ui.protectedUIBlocked = false;
        
        this.updateAuthSystem(data.session);
        
        this.sendToParent({
            type: 'SESSION_RECEIVED',
            source: 'friend.html',
            timestamp: Date.now()
        });
        
        this.dispatchSessionReady(data.session);
        
        this.log('Session data processed successfully');
    },
    
    // Validate session data schema
    validateSessionData: function(data) {
        if (!data || !data.session) {
            return false;
        }
        
        const session = data.session;
        
        if (!session.token || typeof session.token !== 'string') {
            return false;
        }
        
        if (!session.user || typeof session.user !== 'object') {
            return false;
        }
        
        if (!session.user.id || typeof session.user.id !== 'string') {
            return false;
        }
        
        if (session.expiresAt && typeof session.expiresAt !== 'number') {
            return false;
        }
        
        if (session.issuedAt && typeof session.issuedAt !== 'number') {
            return false;
        }
        
        return true;
    },
    
    // Handle session update
    handleSessionUpdate: function(data) {
        this.log('Received session update from parent');
        
        if (!this.validateSessionData(data)) {
            this.logError('Invalid session update:', data);
            return;
        }
        
        this.state.sessionData = data.session;
        this.state.lastSync = Date.now();
        
        this.updateAuthSystem(data.session);
        
        this.dispatchSessionUpdate(data.session);
        
        this.log('Session updated successfully');
    },
    
    // Handle logout signal
    handleLogout: function(data) {
        this.log('Received logout signal from parent');
        
        this.state.sessionData = null;
        this.state.sessionReceived = false;
        this.state.authReady = false;
        
        this.ui.protectedUIBlocked = true;
        
        this.clearAuthSystem();
        
        this.dispatchLogout();
        
        this.showAuthError('You have been logged out');
        
        this.log('Logout processed successfully');
    },
    
    // Handle auth state changed
    handleAuthStateChanged: function(data) {
        this.log('Received auth state change from parent');
        
        if (data.authenticated && data.session) {
            this.handleSessionData({ session: data.session });
        } else {
            this.handleLogout(data);
        }
    },
    
    // Handle profile updated
    handleProfileUpdated: function(data) {
        this.log('Received profile update from parent');
        
        if (this.state.sessionData && this.state.sessionData.user) {
            this.state.sessionData.user = {
                ...this.state.sessionData.user,
                ...data.userData
            };
            
            if (window.KnectaAuth) {
                window.KnectaAuth.currentUser = this.state.sessionData.user;
            }
            
            this.dispatchProfileUpdate(this.state.sessionData.user);
        }
    },
    
    // Legacy message handlers
    handleLegacyUserData: function(data) {
        this.log('Received legacy user data format');
        
        const session = {
            token: data.token || window.knectaToken || localStorage.getItem('USER_TOKEN'),
            user: data.userData,
            issuedAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        };
        
        this.handleSessionData({ session });
    },
    
    handleLegacyAuthState: function(data) {
        this.log('Received legacy auth state format');
        
        if (data.authenticated && data.userData) {
            const session = {
                token: data.token || window.knectaToken || localStorage.getItem('USER_TOKEN'),
                user: data.userData,
                issuedAt: Date.now(),
                expiresAt: Date.now() + (24 * 60 * 60 * 1000)
            };
            
            this.handleSessionData({ session });
        } else {
            this.handleLogout(data);
        }
    },
    
    // Handle auth ready from unified system
    handleAuthReady: function(event) {
        this.log('Auth ready from unified system');
        
        if (this.state.sessionReceived && this.state.sessionData) {
            this.log('Using parent session over unified auth');
            return;
        }
        
        if (event.detail && event.detail.token && event.detail.user) {
            this.state.authReady = true;
            this.state.sessionData = {
                token: event.detail.token,
                user: event.detail.user,
                source: 'unified_auth'
            };
            
            this.ui.protectedUIBlocked = true;
            
            this.log('Using unified auth system (parent session not available)');
        }
    },
    
    // Handle token expired
    handleTokenExpired: function() {
        this.log('Token expired in unified system');
        
        this.sendToParent({
            type: 'TOKEN_EXPIRED',
            source: 'friend.html',
            timestamp: Date.now()
        });
        
        this.ui.protectedUIBlocked = true;
        this.showAuthError('Session expired');
    },
    
    // Handle auth error
    handleAuthError: function() {
        this.log('Auth error in unified system');
        
        this.sendToParent({
            type: 'AUTH_ERROR',
            source: 'friend.html',
            timestamp: Date.now()
        });
        
        this.ui.protectedUIBlocked = true;
        this.showAuthError('Authentication error');
    },
    
    // Update unified auth system with parent session
    updateAuthSystem: function(session) {
        if (!window.KnectaAuth) {
            this.log('Unified auth system not available');
            return;
        }
        
        this.log('Updating unified auth system with parent session');
        
        window.KnectaAuth.token = session.token;
        window.KnectaAuth.tokenReady = true;
        
        window.KnectaAuth.currentUser = session.user;
        window.KnectaAuth.userReady = true;
        
        window.KnectaAuth.cacheReady = true;
        
        window.knectaToken = session.token;
        window.knectaUser = session.user;
        window.authReady = true;
        
        window.KnectaAuth.dispatchReadyEvent();
    },
    
    // Clear unified auth system
    clearAuthSystem: function() {
        if (!window.KnectaAuth) {
            return;
        }
        
        this.log('Clearing unified auth system');
        
        window.KnectaAuth.token = null;
        window.KnectaAuth.tokenReady = false;
        
        window.KnectaAuth.currentUser = null;
        window.KnectaAuth.userReady = false;
        
        window.knectaToken = null;
        window.knectaUser = null;
        window.authReady = false;
        
        const event = new CustomEvent('knectaTokenExpired');
        window.dispatchEvent(event);
    },
    
    // Handle parent unavailable
    handleParentUnavailable: function() {
        this.log('Parent window is unavailable');
        
        this.state.parentReachable = false;
        this.ui.protectedUIBlocked = true;
        this.ui.reconnectionDisplayed = true;
        
        this.showReconnectionState();
        
        this.attemptCachedSessionFallback();
    },
    
    // Attempt cached session fallback
    attemptCachedSessionFallback: function() {
        this.log('Attempting cached session fallback');
        
        if (window.KnectaAuth && window.KnectaAuth.token && window.KnectaAuth.currentUser) {
            this.log('Using cached session from unified auth');
            
            this.state.sessionData = {
                token: window.KnectaAuth.token,
                user: window.KnectaAuth.currentUser,
                source: 'cached_unified_auth'
            };
            
            this.state.authReady = true;
            this.ui.protectedUIBlocked = false;
            
            showNotification('Using cached session data. Some features may be limited.', 'warning');
            
            this.dispatchSessionReady(this.state.sessionData);
            
            return true;
        }
        
        const token = localStorage.getItem('USER_TOKEN');
        const userData = localStorage.getItem('USER_DATA');
        
        if (token && userData) {
            try {
                const user = JSON.parse(userData);
                
                this.log('Using cached session from localStorage');
                
                this.state.sessionData = {
                    token: token,
                    user: user,
                    source: 'cached_localstorage'
                };
                
                this.state.authReady = true;
                this.ui.protectedUIBlocked = false;
                
                showNotification('Using cached data. Reconnect for full features.', 'warning');
                
                this.dispatchSessionReady(this.state.sessionData);
                
                return true;
                
            } catch (error) {
                this.logError('Error parsing cached user data:', error);
            }
        }
        
        this.log('No cached session available');
        return false;
    },
    
    // Setup reconnection monitor
    setupReconnectionMonitor: function() {
        setInterval(() => {
            if (!this.state.parentReachable && this.state.parentDetected) {
                this.attemptParentReconnection();
            }
        }, 5000);
    },
    
    // Attempt parent reconnection
    attemptParentReconnection: function() {
        this.log('Attempting parent reconnection');
        
        this.sendToParent({
            type: 'RECONNECT_ATTEMPT',
            source: 'friend.html',
            timestamp: Date.now()
        });
        
        if (this.state.sessionData) {
            setTimeout(() => {
                this.sendToParent({
                    type: 'REQUEST_SESSION',
                    source: 'friend.html',
                    timestamp: Date.now(),
                    hasCachedSession: true
                });
            }, 1000);
        }
    },
    
    // Send message to parent
    sendToParent: function(message) {
        if (!this.state.parentDetected) {
            this.log('Cannot send to parent: parent not detected');
            return false;
        }
        
        try {
            window.parent.postMessage(message, this.state.parentOrigin || '*');
            this.log(`Sent to parent: ${message.type}`);
            return true;
        } catch (error) {
            this.logError('Error sending message to parent:', error);
            return false;
        }
    },
    
    // Dispatch session ready event
    dispatchSessionReady: function(session) {
        const event = new CustomEvent('parentSessionReady', {
            detail: {
                session: session,
                source: 'parent_coordinator',
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    },
    
    // Dispatch session update event
    dispatchSessionUpdate: function(session) {
        const event = new CustomEvent('parentSessionUpdated', {
            detail: {
                session: session,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    },
    
    // Dispatch logout event
    dispatchLogout: function() {
        const event = new CustomEvent('parentSessionLogout', {
            detail: {
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    },
    
    // Dispatch profile update event
    dispatchProfileUpdate: function(user) {
        const event = new CustomEvent('parentProfileUpdated', {
            detail: {
                user: user,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    },
    
    // Show authentication error
    showAuthError: function(message) {
        this.ui.authErrorDisplayed = true;
        
        const overlay = document.getElementById('authErrorOverlay');
        const messageElement = document.getElementById('authErrorMessage');
        
        if (overlay && messageElement) {
            messageElement.textContent = message || 'Authentication required';
            overlay.classList.add('active');
        } else {
            showNotification(message || 'Authentication error', 'error');
        }
    },
    
    // Hide authentication error
    hideAuthError: function() {
        this.ui.authErrorDisplayed = false;
        
        const overlay = document.getElementById('authErrorOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    },
    
    // Show reconnection state
    showReconnectionState: function() {
        const existingIndicator = document.getElementById('reconnectionIndicator');
        
        if (!existingIndicator) {
            const indicator = document.createElement('div');
            indicator.id = 'reconnectionIndicator';
            indicator.className = 'reconnection-indicator';
            indicator.innerHTML = `
                <div class="reconnection-content">
                    <i class="fas fa-sync-alt fa-spin"></i>
                    <span>Reconnecting to parent window...</span>
                    <button id="retryReconnectionBtn" class="reconnection-btn">
                        <i class="fas fa-redo"></i> Retry Now
                    </button>
                </div>
            `;
            
            document.body.appendChild(indicator);
            
            document.getElementById('retryReconnectionBtn').addEventListener('click', () => {
                this.attemptParentReconnection();
            });
        } else {
            existingIndicator.classList.add('active');
        }
    },
    
    // Hide reconnection state
    hideReconnectionState: function() {
        this.ui.reconnectionDisplayed = false;
        
        const indicator = document.getElementById('reconnectionIndicator');
        if (indicator) {
            indicator.classList.remove('active');
        }
    },
    
    // Show notification
    showNotification: function(message, type = 'info') {
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            this.log(`[${type.toUpperCase()}] ${message}`);
        }
    },
    
    // Check if protected UI should be blocked
    shouldBlockProtectedUI: function() {
        return this.ui.protectedUIBlocked;
    },
    
    // Get current session
    getSession: function() {
        return this.state.sessionData;
    },
    
    // Get authentication status
    isAuthenticated: function() {
        return !!(this.state.sessionReceived && this.state.sessionData && this.state.sessionData.token);
    },
    
    // Get user data
    getUser: function() {
        return this.state.sessionData ? this.state.sessionData.user : null;
    },
    
    // Get token
    getToken: function() {
        return this.state.sessionData ? this.state.sessionData.token : null;
    },
    
    // API Integration
    apiRequest: async function(endpoint, options = {}) {
        if (this.state.parentReachable && this.state.sessionReceived) {
            return this.apiRequestViaParent(endpoint, options);
        }
        
        if (window.KnectaAuth && window.KnectaAuth.secureApiCall) {
            return window.KnectaAuth.secureApiCall(endpoint, options, true);
        }
        
        return this.apiRequestDirect(endpoint, options);
    },
    
    // API request via parent
    apiRequestViaParent: function(endpoint, options) {
        return new Promise((resolve, reject) => {
            const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            const responseHandler = (event) => {
                if (event.data && event.data.type === 'API_RESPONSE' && event.data.requestId === requestId) {
                    window.removeEventListener('message', responseHandler);
                    
                    if (event.data.success) {
                        resolve(event.data.data);
                    } else {
                        reject(new Error(event.data.error || 'API request failed'));
                    }
                }
            };
            
            window.addEventListener('message', responseHandler);
            
            this.sendToParent({
                type: 'API_REQUEST',
                requestId: requestId,
                endpoint: endpoint,
                options: options,
                timestamp: Date.now(),
                source: 'friend.html'
            });
            
            setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('API request timeout'));
            }, 30000);
        });
    },
    
    // Direct API request (fallback only)
    apiRequestDirect: async function(endpoint, options = {}) {
        if (this.ui.protectedUIBlocked && endpoint.includes('/api/')) {
            throw new Error('Authentication required. Parent session not available.');
        }
        
        let token = this.getToken();
        if (!token && window.KnectaAuth) {
            token = window.KnectaAuth.getToken();
        }
        if (!token) {
            token = localStorage.getItem('USER_TOKEN');
        }
        
        if (!token && options.requireAuth !== false) {
            throw new Error('Authentication token not available');
        }
        
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        };
        
        if (token && options.requireAuth !== false) {
            defaultOptions.headers.Authorization = `Bearer ${token}`;
        }
        
        const finalOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await secureFetch(endpoint, finalOptions);
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleTokenExpired();
                    throw new Error('Session expired');
                }
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            this.logError('API request failed:', error);
            throw error;
        }
    },
    
    // Logging utility
    log: function(message, data) {
        if (this.config.debug) {
            console.log(`[ParentCoordinator] ${message}`, data || '');
        }
    },
    
    // Error logging utility
    logError: function(message, error) {
        console.error(`[ParentCoordinator] ${message}`, error || '');
    }
};

// Initialize parent coordination when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Friend Page] Initializing parent coordination');
    ParentCoordinator.init().catch(error => {
        console.error('[Friend Page] Parent coordination failed:', error);
    });
});

// =============================================
// UNIFIED TOKEN SYSTEM - UPDATED FOR PARENT COORDINATION
// =============================================

export const KnectaAuth = {
    token: null,
    tokenReady: false,
    tokenPromise: null,
    currentUser: null,
    userReady: false,
    cacheReady: false,
    migrationPerformed: false,
    parentControlled: false,
    
    init: async function() {
        console.log('[Friend Page] Initializing unified auth system with parent coordination');
        
        try {
            this.checkTokenMigration();
            await this.waitForParentCoordinator();
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
            
            console.log('[Friend Page] Unified auth system initialized (awaiting parent session)');
            
        } catch (error) {
            console.error('[Friend Page] Auth initialization error:', error);
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
        }
    },
    
    checkTokenMigration: function() {
        const OLD_TOKEN_KEYS = [
            'moodchat_token',
            'accessToken',
            'knecta_token',
            'token',
            'authToken',
            'sessionToken'
        ];
        
        const UNIFIED_TOKEN_KEY = 'USER_TOKEN';
        
        const unifiedToken = localStorage.getItem(UNIFIED_TOKEN_KEY);
        if (unifiedToken && unifiedToken !== 'null' && unifiedToken !== 'undefined') {
            console.log('[Friend Page] Unified token found');
            return;
        }
        
        for (const oldKey of OLD_TOKEN_KEYS) {
            const oldToken = localStorage.getItem(oldKey);
            if (oldToken && oldToken !== 'null' && oldToken !== 'undefined') {
                console.log(`[Friend Page] Migrating token from ${oldKey} to ${UNIFIED_TOKEN_KEY}`);
                
                localStorage.setItem(UNIFIED_TOKEN_KEY, oldToken);
                this.migrationPerformed = true;
                
                const notice = document.getElementById('tokenMigrationNotice');
                if (notice) {
                    notice.classList.add('active');
                    setTimeout(() => {
                        notice.classList.remove('active');
                    }, 3000);
                }
                
                break;
            }
        }
    },
    
    waitForParentCoordinator: function() {
        return new Promise((resolve) => {
            let checks = 0;
            const maxChecks = 50;
            
            const checkCoordinator = () => {
                checks++;
                
                if (window.parentCoordinator) {
                    console.log('[Friend Page] Parent coordinator ready');
                    resolve();
                    return;
                }
                
                if (checks >= maxChecks) {
                    console.log('[Friend Page] Parent coordinator timeout, proceeding');
                    resolve();
                    return;
                }
                
                setTimeout(checkCoordinator, 100);
            };
            
            checkCoordinator();
        });
    },
    
    loadCachedData: function() {
        console.log('[Friend Page] Loading cached data for instant UI');
        
        const token = localStorage.getItem('USER_TOKEN');
        if (token && token !== 'null' && token !== 'undefined') {
            this.token = token;
        }
        
        const userKeys = ['knecta_current_user', 'USER_DATA'];
        for (const key of userKeys) {
            const userData = localStorage.getItem(key);
            if (userData) {
                try {
                    this.currentUser = JSON.parse(userData);
                    console.log(`[Friend Page] Loaded cached user from ${key}`);
                    break;
                } catch (e) {
                    console.log(`[Friend Page] Error parsing user data from ${key}:`, e);
                }
            }
        }
        
        const event = new CustomEvent('knectaCacheReady', {
            detail: { 
                token: this.token,
                user: this.currentUser,
                cacheOnly: true
            }
        });
        window.dispatchEvent(event);
    },
    
    dispatchReadyEvent: function() {
        const event = new CustomEvent('knectaAuthReady', {
            detail: { 
                token: this.token,
                user: this.currentUser,
                migrationPerformed: this.migrationPerformed,
                parentControlled: this.parentControlled
            }
        });
        window.dispatchEvent(event);
        
        window.knectaToken = this.token;
        window.knectaUser = this.currentUser;
        window.authReady = true;
    },
    
    dispatchCacheReadyEvent: function() {
        const event = new CustomEvent('knectaCacheReady', {
            detail: { 
                token: this.token,
                user: this.currentUser,
                cacheOnly: true
            }
        });
        window.dispatchEvent(event);
    },
    
    getTokenAsync: function() {
        if (window.parentCoordinator && window.parentCoordinator.getToken()) {
            return Promise.resolve(window.parentCoordinator.getToken());
        }
        
        if (this.tokenReady && this.token) {
            return Promise.resolve(this.token);
        }
        
        if (!this.tokenPromise) {
            this.tokenPromise = new Promise((resolve, reject) => {
                let checks = 0;
                const maxChecks = 100;
                
                const checkToken = () => {
                    checks++;
                    
                    if (window.parentCoordinator && window.parentCoordinator.getToken()) {
                        resolve(window.parentCoordinator.getToken());
                        return;
                    }
                    
                    if (this.tokenReady && this.token) {
                        resolve(this.token);
                        return;
                    }
                    
                    if (checks >= maxChecks) {
                        reject(new Error('Token not available'));
                        return;
                    }
                    
                    setTimeout(checkToken, 100);
                };
                
                checkToken();
            });
        }
        
        return this.tokenPromise;
    },
    
    secureApiCall: async function(apiPath, options = {}, requireAuth = true) {
        if (window.parentCoordinator && window.parentCoordinator.isAuthenticated()) {
            return window.parentCoordinator.apiRequest(apiPath, options);
        }
        
        return this.secureApiCallFallback(apiPath, options, requireAuth);
    },
    
    secureApiCallFallback: async function(apiPath, options = {}, requireAuth = true) {
        try {
            if (requireAuth) {
                this.showLoading(true);
            }
            
            let token = null;
            if (requireAuth) {
                token = await this.getTokenAsync();
                if (!token) {
                    throw new Error('Authentication required');
                }
            }
            
            const finalOptions = {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                }
            };
            
            if (token && requireAuth) {
                finalOptions.headers.Authorization = `Bearer ${token}`;
            }
            
            const response = await secureFetch(apiPath, finalOptions);
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleTokenExpired();
                    throw new Error('Session expired. Please log in again.');
                }
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('[Friend Page] API call error:', error);
            
            if (error.message.includes('Session expired') || error.message.includes('Authentication required')) {
                this.handleAuthError();
            }
            
            throw error;
            
        } finally {
            this.showLoading(false);
        }
    },
    
    showLoading: function(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            if (show) {
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
            }
        }
    },
    
    handleTokenExpired: function() {
        console.log('[Friend Page] Token expired');
        
        this.token = null;
        this.tokenReady = false;
        localStorage.removeItem('USER_TOKEN');
        
        if (window.parentCoordinator) {
            window.parentCoordinator.handleTokenExpired();
        } else {
            showNotification('Session expired. Please log in again.', 'error');
            
            const event = new CustomEvent('knectaTokenExpired');
            window.dispatchEvent(event);
            
            setTimeout(() => {
                if (window.parent && window.parent.location) {
                    window.parent.location.href = '/login.html';
                } else {
                    window.location.href = '/login.html';
                }
            }, 2000);
        }
    },
    
    handleAuthError: function() {
        console.log('[Friend Page] Authentication error');
        
        showNotification('Please log in to continue', 'warning');
        
        const event = new CustomEvent('knectaAuthError');
        window.dispatchEvent(event);
    },
    
    showNotification: function(message, type = 'success') {
        if (window.parentCoordinator) {
            window.parentCoordinator.showNotification(message, type);
        } else {
            if (typeof showNotification === 'function') {
                showNotification(message, type);
            } else {
                console.log(`[${type.toUpperCase()}] ${message}`);
            }
        }
    },
    
    isAuthenticated: function() {
        if (window.parentCoordinator) {
            return window.parentCoordinator.isAuthenticated();
        }
        
        return !!(this.token && this.tokenReady);
    },
    
    getUser: function() {
        if (window.parentCoordinator) {
            return window.parentCoordinator.getUser();
        }
        
        return this.currentUser;
    },
    
    getToken: function() {
        if (window.parentCoordinator) {
            return window.parentCoordinator.getToken();
        }
        
        return this.token;
    }
};

// Initialize auth system
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Friend Page] Starting auth system initialization');
    KnectaAuth.init().catch(error => {
        console.error('[Friend Page] Auth system initialization failed:', error);
    });
});

// =============================================
// GLOBAL VARIABLES AND CONSTANTS
// =============================================

export let currentUser = null;
export let userData = null;
export let friends = [];
export let contacts = [];
export let friendRequests = [];
export let sentRequests = [];
export let temporaryFriends = [];
export let pinnedFriends = [];
export let mutedFriends = [];
export let selectedFriend = null;
export let currentCategoryFilter = 'all';
export let currentSearchTerm = '';
export let isMobile = window.innerWidth <= 768;
export let mutualFriendsCache = {};
export let groups = [];
export let allUsers = [];
export let cameraStream = null;
export let currentCamera = 'environment';
export let flashOn = false;
export let apiReady = false;
export let scanningActive = false;
export let isInitialized = false;
export let initializationStarted = false;
export let backgroundSyncInterval = null;
export let isAuthReady = false;
export let backgroundTasksStarted = false;
export let cacheLoaded = false;

export const friendCategories = {
    'acquaintance': { name: 'Acquaintance', color: 'var(--category-acquaintance)', icon: 'fas fa-handshake', description: 'Someone you know casually' },
    'friend': { name: 'Friend', color: 'var(--category-friend)', icon: 'fas fa-user-friends', description: 'A regular friend' },
    'close-friend': { name: 'Close Friend', color: 'var(--category-close-friend)', icon: 'fas fa-heart', description: 'A close personal friend' },
    'family': { name: 'Family', color: 'var(--category-family)', icon: 'fas fa-users', description: 'Family member' },
    'business': { name: 'Business', color: 'var(--category-business)', icon: 'fas fa-briefcase', description: 'Business contact' },
    'pinned': { name: 'Pinned', color: 'var(--warning-color)', icon: 'fas fa-thumbtack', description: 'Pinned friend' },
    'muted': { name: 'Muted', color: 'var(--text-secondary)', icon: 'fas fa-volume-mute', description: 'Muted friend' }
};

export const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_TOKEN: 'USER_TOKEN',
    USER_DATA: 'USER_DATA',
    FRIENDS: 'knecta_friends_cache',
    CONTACTS: 'knecta_contacts_cache',
    REQUESTS: 'knecta_friend_requests_cache',
    SENT_REQUESTS: 'knecta_sent_requests_cache',
    TEMPORARY_FRIENDS: 'knecta_temporary_friends_cache',
    PINNED_FRIENDS: 'knecta_pinned_friends_cache',
    MUTED_FRIENDS: 'knecta_muted_friends_cache',
    LAST_SYNC: 'knecta_friends_last_sync',
    USER_PROFILE: 'knecta_user_profile_cache',
    UNIQUE_QR_CODE: 'knecta_unique_qr_code',
    MUTUAL_FRIENDS_CACHE: 'knecta_mutual_friends_cache',
    USER_GROUPS: 'knecta_user_groups_cache',
    LAST_INTERACTIONS: 'knecta_last_interactions',
    PRIVATE_NOTES: 'knecta_private_notes',
    ALL_USERS_CACHE: 'knecta_all_users_cache'
};

export const dataSource = {
    source: 'parent',
    userData: null,
    token: null,
    fetching: false,
    fetched: false,
    parentSessionReceived: false,
    parentControlled: true
};

// =============================================
// PARENT COORDINATION INTEGRATION FUNCTIONS
// =============================================

export function initializeParentChildCommunication() {
    console.log('[Friend Page] Initializing parent-child communication via coordinator');
    
    setupSessionEventListeners();
    loadCachedDataInstantly();
    waitForParentSession();
}

function setupSessionEventListeners() {
    window.addEventListener('parentSessionReady', handleParentSessionReady);
    window.addEventListener('parentSessionUpdated', handleParentSessionUpdate);
    window.addEventListener('parentSessionLogout', handleParentLogout);
    window.addEventListener('parentProfileUpdated', handleParentProfileUpdate);
    window.addEventListener('knectaAuthReady', handleUnifiedAuthReady);
    window.addEventListener('knectaCacheReady', handleUnifiedCacheReady);
}

function handleParentSessionReady(event) {
    console.log('[Friend Page] Parent session ready:', event.detail);
    
    dataSource.parentSessionReceived = true;
    dataSource.fetched = true;
    
    const session = event.detail.session;
    
    dataSource.source = 'parent';
    dataSource.userData = session.user;
    dataSource.token = session.token;
    
    currentUser = session.user;
    userData = currentUser;
    
    updateUIWithUserData(session.user);
    updateDataSourceIndicator('parent');
    
    initializeMainFunctionality();
    
    console.log('[Friend Page] Successfully initialized with parent session');
}

function handleParentSessionUpdate(event) {
    console.log('[Friend Page] Parent session updated');
    
    const session = event.detail.session;
    
    dataSource.userData = session.user;
    dataSource.token = session.token;
    
    currentUser = session.user;
    userData = currentUser;
    
    updateUIWithUserData(session.user);
    
    console.log('[Friend Page] Session updated successfully');
}

function handleParentLogout(event) {
    console.log('[Friend Page] Parent logout received');
    
    dataSource.userData = null;
    dataSource.token = null;
    dataSource.fetched = false;
    dataSource.parentSessionReceived = false;
    
    currentUser = null;
    userData = null;
    friends = [];
    contacts = [];
    friendRequests = [];
    sentRequests = [];
    
    updateCurrentSection();
    
    showAuthError('You have been logged out. Please log in again.');
}

function handleParentProfileUpdate(event) {
    console.log('[Friend Page] Parent profile updated');
    
    const user = event.detail.user;
    
    dataSource.userData = user;
    currentUser = user;
    userData = currentUser;
    
    updateUIWithUserData(user);
    
    showNotification('Profile updated', 'success');
}

function handleUnifiedAuthReady(event) {
    console.log('[Friend Page] Unified auth ready (parent session not available)');
    
    if (!dataSource.parentSessionReceived) {
        const detail = event.detail;
        
        dataSource.source = 'unified_auth';
        dataSource.userData = detail.user;
        dataSource.token = detail.token;
        dataSource.fetched = true;
        
        currentUser = detail.user;
        userData = currentUser;
        
        updateUIWithUserData(detail.user);
        updateDataSourceIndicator('unified_auth');
        
        initializeMainFunctionality();
        
        showNotification('Using authentication system. Parent coordination not available.', 'warning');
    }
}

function handleUnifiedCacheReady(event) {
    console.log('[Friend Page] Unified cache ready');
    
    if (!dataSource.fetched) {
        const detail = event.detail;
        
        if (detail.user) {
            dataSource.source = 'cache';
            dataSource.userData = detail.user;
            dataSource.token = detail.token;
            dataSource.fetched = true;
            
            currentUser = detail.user;
            userData = currentUser;
            
            updateUIWithUserData(detail.user);
            updateDataSourceIndicator('cache');
            
            initializeMainFunctionality();
            
            showNotification('Using cached data. Sign in for live updates.', 'warning');
        }
    }
}

function waitForParentSession() {
    let timeoutCount = 0;
    const maxTimeout = 10;
    
    const checkSession = () => {
        timeoutCount++;
        
        if (dataSource.parentSessionReceived || dataSource.fetched) {
            console.log('[Friend Page] Session available, proceeding');
            return;
        }
        
        if (timeoutCount >= maxTimeout) {
            console.log('[Friend Page] Parent session timeout');
            
            if (!dataSource.fetched) {
                attemptCachedDataFallback();
            }
            return;
        }
        
        setTimeout(checkSession, 1000);
    };
    
    checkSession();
}

// =============================================
// API INTEGRATION FUNCTIONS
// =============================================

export function getCurrentUser() {
    if (window.parentCoordinator && window.parentCoordinator.getUser()) {
        return window.parentCoordinator.getUser();
    }
    
    if (dataSource.userData) {
        return dataSource.userData;
    }
    
    if (window.KnectaAuth && window.KnectaAuth.getUser()) {
        return window.KnectaAuth.getUser();
    }
    
    const userKeys = ['knecta_current_user', 'USER_DATA'];
    for (const key of userKeys) {
        const userData = localStorage.getItem(key);
        if (userData) {
            try {
                return JSON.parse(userData);
            } catch (e) {
                console.log('[Friend Page] Error parsing user data:', e);
            }
        }
    }
    
    return null;
}

// =============================================
// FRIEND REQUEST MANAGEMENT
// =============================================

export async function sendFriendRequest(friendId, category = 'friend', note = '', isTemporary = false, duration = null, isBusiness = false) {
    try {
        const requestData = {
            receiverId: friendId,
            category: category,
            note: note,
            isTemporary: isTemporary,
            duration: duration,
            isBusiness: isBusiness
        };
        
        console.log('[Friend Page] Sending friend request to:', friendId);
        const response = await apiCallWithRetry('/api/friend-requests/send', {
            method: 'POST',
            body: JSON.stringify(requestData)
        }, 1);
        
        if (response && response.success) {
            try {
                const sentResponse = await apiCallWithRetry('/api/friend-requests/sent', null, 1);
                
                if (sentResponse && sentResponse.requests) {
                    sentRequests = sentResponse.requests;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
                }
            } catch (error) {
                console.log('[Friend Page] Failed to refresh sent requests:', error.message);
            }
            
            fetchAllUsersFromBackend();
            updateCurrentSection();
            
            showNotification('Friend request sent successfully', 'success');
        } else {
            showNotification('Failed to send friend request', 'error');
        }
        
    } catch (error) {
        console.log('[Friend Page] Failed to send friend request:', error.message);
        showNotification('Failed to send friend request', 'error');
    }
}

export async function acceptFriendRequestOnline(requestId, friendId) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friend-requests/${requestId}/accept`, {
            method: 'POST'
        }, 1);
        
        if (response && response.success) {
            startParallelDataLoading();
            showNotification('Friend request accepted', 'success');
        } else {
            showNotification('Failed to accept friend request', 'error');
        }
        
    } catch (error) {
        console.log('[Friend Page] Failed to accept friend request:', error.message);
        showNotification('Failed to accept friend request', 'error');
    }
}

export async function declineFriendRequest(requestData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friend-requests/${requestData.id}/decline`, {
            method: 'POST'
        }, 1);
        
        if (response && response.success) {
            try {
                const requestsResponse = await apiCallWithRetry('/api/friend-requests/incoming', null, 1);
                
                if (requestsResponse && requestsResponse.requests) {
                    friendRequests = requestsResponse.requests;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.REQUESTS, JSON.stringify(friendRequests));
                }
            } catch (error) {
                console.log('[Friend Page] Failed to refresh requests:', error.message);
            }
            
            fetchAllUsersFromBackend();
            updateCurrentSection();
            
            showNotification('Friend request declined', 'success');
        } else {
            showNotification('Failed to decline friend request', 'error');
        }
        
    } catch (error) {
        console.log('[Friend Page] Failed to decline friend request:', error.message);
        showNotification('Failed to decline friend request', 'error');
    }
}

export async function cancelFriendRequest(requestData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friend-requests/${requestData.id}`, {
            method: 'DELETE'
        }, 1);
        
        if (response && response.success) {
            try {
                const sentResponse = await apiCallWithRetry('/api/friend-requests/sent', null, 1);
                
                if (sentResponse && sentResponse.requests) {
                    sentRequests = sentResponse.requests;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
                }
            } catch (error) {
                console.log('[Friend Page] Failed to refresh sent requests:', error.message);
            }
            
            fetchAllUsersFromBackend();
            updateCurrentSection();
            
            showNotification('Friend request cancelled', 'success');
        } else {
            showNotification('Failed to cancel friend request', 'error');
        }
        
    } catch (error) {
        console.log('[Friend Page] Failed to cancel friend request:', error.message);
        showNotification('Failed to cancel friend request', 'error');
    }
}

// =============================================
// DATA LOADING FUNCTIONS
// =============================================

export async function loadFriendsFromBackend() {
    try {
        if (window.parentCoordinator && window.parentCoordinator.shouldBlockProtectedUI()) {
            console.log('[Friend Page] Protected UI blocked, skipping friends load');
            throw new Error('Authentication required');
        }
        
        console.log('[Friend Page] Loading friends from backend');
        const response = await apiCallWithRetry('/api/friends', null, 1);
        
        if (response && response.friends) {
            friends = response.friends;
            friends.sort((a, b) => {
                if (a.online !== b.online) return b.online ? 1 : -1;
                return (a.displayName || '').localeCompare(b.displayName || '');
            });
            
            updateFriendCounts();
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
            
            console.log('[Friend Page] Loaded', friends.length, 'friends');
        }
    } catch (error) {
        console.log('[Friend Page] Failed to load friends:', error.message);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (cached) {
            friends = JSON.parse(cached);
            updateFriendCounts();
        }
    }
}

export async function loadFriendRequestsFromBackend() {
    try {
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/friend-requests/incoming', null, 1);
        
        if (response && response.requests) {
            friendRequests = response.requests;
            localStorage.setItem(LOCAL_STORAGE_KEYS.REQUESTS, JSON.stringify(friendRequests));
        }
    } catch (error) {
        console.log('[Friend Page] Failed to load friend requests:', error.message);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.REQUESTS);
        if (cached) {
            friendRequests = JSON.parse(cached);
        }
    }
}

export async function loadSentRequestsFromBackend() {
    try {
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/friend-requests/sent', null, 1);
        
        if (response && response.requests) {
            sentRequests = response.requests;
            localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
        }
    } catch (error) {
        console.log('[Friend Page] Failed to load sent requests:', error.message);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS);
        if (cached) {
            sentRequests = JSON.parse(cached);
        }
    }
}

export async function loadPinnedFriendsFromBackend() {
    try {
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/friends/pinned', null, 1);
        
        if (response && response.friends) {
            pinnedFriends = response.friends;
            localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
        }
    } catch (error) {
        console.log('[Friend Page] Failed to load pinned friends:', error.message);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS);
        if (cached) {
            pinnedFriends = JSON.parse(cached);
        }
    }
}

export async function loadMutedFriendsFromBackend() {
    try {
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/friends/muted', null, 1);
        
        if (response && response.friends) {
            mutedFriends = response.friends;
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
        }
    } catch (error) {
        console.log('[Friend Page] Failed to load muted friends:', error.message);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
        if (cached) {
            mutedFriends = JSON.parse(cached);
        }
    }
}

export async function loadContactsFromBackend() {
    try {
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/contacts/synced', null, 1);
        
        if (response && response.contacts) {
            contacts = response.contacts;
            localStorage.setItem(LOCAL_STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
        }
    } catch (error) {
        console.log('[Friend Page] Failed to load contacts:', error.message);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
        if (cached) {
            contacts = JSON.parse(cached);
        }
    }
}

export async function loadGroupsFromBackend() {
    try {
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/groups/user', null, 1);
        
        if (response && response.groups) {
            groups = response.groups;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_GROUPS, JSON.stringify(groups));
        }
    } catch (error) {
        console.log('[Friend Page] Failed to load groups:', error.message);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (cached) groups = JSON.parse(cached);
    }
}

export async function fetchAllUsersFromBackend() {
    try {
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const cachedAllUsers = localStorage.getItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
        const lastSync = localStorage.getItem('all_users_last_sync');
        const now = Date.now();
        
        if (cachedAllUsers && lastSync && (now - parseInt(lastSync)) < 10 * 60 * 1000) {
            allUsers = JSON.parse(cachedAllUsers);
            return;
        }
        
        const response = await apiCallWithRetry('/api/users/all?limit=50', null, 1);
        
        if (response && response.users) {
            const currentUserId = currentUser?.id;
            allUsers = response.users.filter(user => user.id !== currentUserId);
            
            allUsers.sort((a, b) => {
                if (a.online !== b.online) return b.online ? 1 : -1;
                return (a.displayName || '').localeCompare(b.displayName || '');
            });
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE, JSON.stringify(allUsers));
            localStorage.setItem('all_users_last_sync', Date.now().toString());
        }
        
    } catch (error) {
        console.log('[Friend Page] Failed to load all users:', error.message);
        const cachedAllUsers = localStorage.getItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
        if (cachedAllUsers) {
            allUsers = JSON.parse(cachedAllUsers);
        }
    }
}

// =============================================
// INITIALIZATION FUNCTIONS
// =============================================

export async function enhancedInitialize() {
    if (initializationStarted) return;
    initializationStarted = true;
    
    console.log('[Friend Page] STARTING ENHANCED INITIALIZATION WITH PARENT COORDINATION');
    
    try {
        loadCachedDataInstantly();
        cacheLoaded = true;
        setTimeout(generateUniqueQRCode, 100);
        initializeParentChildCommunication();
        
        apiReady = true;
        isInitialized = true;
        
        console.log('[Friend Page] ENHANCED INITIALIZATION COMPLETE (UI ready, parent coordination active)');
        return true;
        
    } catch (error) {
        console.error('[Friend Page] Enhanced initialization error:', error.message);
        loadCachedDataInstantly();
        apiReady = false;
        isInitialized = true;
        cacheLoaded = true;
        return false;
    }
}

export function loadCachedDataInstantly() {
    try {
        console.log('[Friend Page] Loading cached data for instant UI');
        
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA) || localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            currentUser = JSON.parse(cachedUser);
            userData = currentUser;
        }
        
        const friendsData = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (friendsData) {
            friends = JSON.parse(friendsData);
            updateFriendCounts();
        }
        
        const contactsData = localStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
        if (contactsData) {
            contacts = JSON.parse(contactsData);
        }
        
        const requestsData = localStorage.getItem(LOCAL_STORAGE_KEYS.REQUESTS);
        if (requestsData) {
            friendRequests = JSON.parse(requestsData);
        }
        
        const sentRequestsData = localStorage.getItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS);
        if (sentRequestsData) {
            sentRequests = JSON.parse(sentRequestsData);
        }
        
        const pinnedData = localStorage.getItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS);
        if (pinnedData) {
            pinnedFriends = JSON.parse(pinnedData);
        }
        
        const mutedData = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
        if (mutedData) {
            mutedFriends = JSON.parse(mutedData);
        }
        
        const allUsersData = localStorage.getItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
        if (allUsersData) allUsers = JSON.parse(allUsersData);
        
        const mutualCache = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTUAL_FRIENDS_CACHE);
        if (mutualCache) mutualFriendsCache = JSON.parse(mutualCache);
        
        const groupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (groupsData) groups = JSON.parse(groupsData);
        
        const interactionsData = localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_INTERACTIONS);
        if (interactionsData) window.lastInteractions = JSON.parse(interactionsData);
        
        const notesData = localStorage.getItem(LOCAL_STORAGE_KEYS.PRIVATE_NOTES);
        if (notesData) window.privateNotes = JSON.parse(notesData);
        
        console.log('[Friend Page] Cached data loaded successfully');
        
    } catch (error) {
        console.log('[Friend Page] Error loading cached data:', error.message);
    }
}

export function startParallelDataLoading() {
    if (backgroundTasksStarted) {
        console.log('[Friend Page] Background tasks already started');
        return;
    }
    
    if (!getValidToken()) {
        console.log('[Friend Page] No token, skipping background data loading');
        return;
    }
    
    console.log('[Friend Page] Starting parallel data loading');
    backgroundTasksStarted = true;
    
    if (window.KnectaAuth) {
        window.KnectaAuth.showLoading(true);
    }
    
    const loadPromises = [];
    
    loadPromises.push(loadFriendsFromBackend().catch(e => console.log('[Friend Page] Friends load error:', e.message)));
    loadPromises.push(loadFriendRequestsFromBackend().catch(e => console.log('[Friend Page] Requests load error:', e.message)));
    loadPromises.push(loadSentRequestsFromBackend().catch(e => console.log('[Friend Page] Sent requests load error:', e.message)));
    loadPromises.push(loadPinnedFriendsFromBackend().catch(e => console.log('[Friend Page] Pinned friends load error:', e.message)));
    loadPromises.push(loadMutedFriendsFromBackend().catch(e => console.log('[Friend Page] Muted friends load error:', e.message)));
    loadPromises.push(loadContactsFromBackend().catch(e => console.log('[Friend Page] Contacts load error:', e.message)));
    loadPromises.push(loadGroupsFromBackend().catch(e => console.log('[Friend Page] Groups load error:', e.message)));
    loadPromises.push(fetchAllUsersFromBackend().catch(e => console.log('[Friend Page] All users load error:', e.message)));
    
    Promise.allSettled(loadPromises).then(() => {
        updateCurrentSection();
        showNotification('Friends data loaded', 'success');
        
        if (window.KnectaAuth) {
            setTimeout(() => window.KnectaAuth.showLoading(false), 500);
        }
    });
}

// =============================================
// UTILITY FUNCTIONS
// =============================================

export function checkMobile() {
    isMobile = window.innerWidth <= 768;
}

// =============================================
// CAMERA AND QR CODE FUNCTIONS
// =============================================

export async function startCameraScanner() {
    try {
        const videoElement = document.getElementById('cameraVideo');
        const canvasElement = document.getElementById('scannerCanvas');
        if (!videoElement || !canvasElement) {
            showNotification('Camera elements not found', 'error');
            return;
        }
        
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
        }
        
        const constraints = {
            video: {
                facingMode: currentCamera,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };
        
        cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = cameraStream;
        
        startRealQRCodeScanning(videoElement, canvasElement);
        showNotification('Camera started successfully', 'success');
        
    } catch (error) {
        console.log('[Friend Page] Camera access error:', error.message);
        const cameraContainer = document.querySelector('.camera-container');
        if (cameraContainer) {
            cameraContainer.innerHTML = `
                <div class="no-camera-message">
                    <i class="fas fa-video-slash"></i>
                    <h3>Camera Access Required</h3>
                    <p>Please allow camera access to scan QR codes.</p>
                </div>
            `;
        }
        showNotification('Could not access camera', 'error');
    }
}

function startRealQRCodeScanning(videoElement, canvasElement) {
    const canvas = canvasElement;
    const context = canvas.getContext('2d');
    scanningActive = true;
    
    function scanFrame() {
        if (!scanningActive || !document.getElementById('cameraScannerModal').classList.contains('active')) {
            return;
        }
        
        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            
            context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            
            try {
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });
                
                if (code) {
                    drawQRCodeRect(code.location, context);
                    processScannedQRCodeReal(code.data);
                    return;
                }
            } catch (error) {
                // Silently fail
            }
        }
        
        requestAnimationFrame(scanFrame);
    }
    
    function drawQRCodeRect(location, ctx) {
        ctx.beginPath();
        ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
        ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
        ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
        ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
        ctx.lineTo(location.topLeftCorner.x, location.topLeftCorner.y);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#00FF00";
        ctx.stroke();
    }
    
    scanFrame();
}

function processScannedQRCodeReal(qrData) {
    try {
        let parsedData;
        try {
            parsedData = JSON.parse(qrData);
        } catch (e) {
            parsedData = { data: qrData };
        }
        
        if (!parsedData.type || parsedData.type !== 'knecta_friend_request') {
            showNotification('Invalid QR code format', 'error');
            return;
        }
        
        if (!parsedData.userId) {
            showNotification('QR code missing user ID', 'error');
            return;
        }
        
        showFriendRequestFromQRReal(parsedData);
        
        stopCameraScanner();
        document.getElementById('cameraScannerModal').classList.remove('active');
        
        showNotification('QR code scanned successfully!', 'success');
        
    } catch (error) {
        console.log('[Friend Page] Error processing QR code:', error.message);
        showNotification('Error processing QR code', 'error');
    }
}

function showFriendRequestFromQRReal(qrData) {
    fetchUserInfoFromQR(qrData.userId).then(userInfo => {
        document.getElementById('requestAvatar').innerHTML = `
            <div style="width: 100%; height: 100%; border-radius: 50%; background-color: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                ${userInfo.displayName ? userInfo.displayName.charAt(0).toUpperCase() : 'U'}
            </div>
        `;
        
        document.getElementById('requestName').textContent = userInfo.displayName || qrData.displayName || 'QR Code User';
        document.getElementById('requestUsername').textContent = userInfo.username || qrData.username || '@unknown';
        document.getElementById('mutualCount').textContent = '0';
        
        const acceptBtn = document.getElementById('acceptRequestBtn');
        acceptBtn.dataset.userId = qrData.userId;
        acceptBtn.dataset.userName = userInfo.displayName || qrData.displayName || 'User';
        acceptBtn.dataset.qrData = JSON.stringify(qrData);
        
        document.getElementById('friendRequestModal').classList.add('active');
    }).catch(error => {
        document.getElementById('requestAvatar').innerHTML = `
            <div style="width: 100%; height: 100%; border-radius: 50%; background-color: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                ${qrData.displayName ? qrData.displayName.charAt(0).toUpperCase() : 'U'}
            </div>
        `;
        
        document.getElementById('requestName').textContent = qrData.displayName || 'QR Code User';
        document.getElementById('requestUsername').textContent = qrData.username || '@unknown';
        document.getElementById('mutualCount').textContent = '0';
        
        const acceptBtn = document.getElementById('acceptRequestBtn');
        acceptBtn.dataset.userId = qrData.userId;
        acceptBtn.dataset.userName = qrData.displayName || 'User';
        acceptBtn.dataset.qrData = JSON.stringify(qrData);
        
        document.getElementById('friendRequestModal').classList.add('active');
    });
}

async function fetchUserInfoFromQR(userId) {
    try {
        const token = getValidToken();
        if (!token) {
            throw new Error('No valid token');
        }
        
        const response = await apiCallWithRetry(`/api/users/${userId}`, null, 1);
        
        if (response && response.user) {
            return response.user;
        }
        throw new Error('User not found');
    } catch (error) {
        throw error;
    }
}

export function stopCameraScanner() {
    scanningActive = false;
    
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    const videoElement = document.getElementById('cameraVideo');
    if (videoElement) {
        videoElement.srcObject = null;
    }
}

export async function toggleCamera() {
    currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
    await startCameraScanner();
}

export function toggleFlash() {
    if (!cameraStream) return;
    
    const track = cameraStream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) {
        showNotification('Flash not supported on this device', 'warning');
        return;
    }
    
    const capabilities = track.getCapabilities();
    if (!capabilities.torch) {
        showNotification('Flash not supported on this camera', 'warning');
        return;
    }
    
    flashOn = !flashOn;
    track.applyConstraints({
        advanced: [{ torch: flashOn }]
    });
    
    const flashBtn = document.getElementById('toggleFlashBtn');
    if (flashBtn) {
        flashBtn.innerHTML = flashOn ? 
            '<i class="fas fa-lightbulb"></i> Flash On' : 
            '<i class="far fa-lightbulb"></i> Flash Off';
        flashBtn.style.backgroundColor = flashOn ? 'var(--warning-color)' : 'var(--primary-color)';
    }
    
    showNotification(flashOn ? 'Flash turned on' : 'Flash turned off', 'info');
}

// =============================================
// QR CODE GENERATION FUNCTIONS
// =============================================

export function generateUniqueQRCode() {
    try {
        const qrContainer = document.getElementById('qrCodeContainer');
        if (!qrContainer) return;
        
        qrContainer.innerHTML = '';
        
        if (typeof QRCode === 'undefined') {
            qrContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px; color: var(--primary-color);"></i>
                    <p>Your unique QR code</p>
                    <p style="font-size: 12px; margin-top: 10px;">Scan to add as friend</p>
                </div>
            `;
            return;
        }
        
        const user = currentUser || userData;
        if (!user) {
            qrContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Sign in to generate QR code</p>
                </div>
            `;
            return;
        }
        
        const qrData = JSON.stringify({
            type: 'knecta_friend_request',
            userId: user.id,
            username: user.username || ('user_' + Math.random().toString(36).substr(2, 9)),
            displayName: user.displayName || 'Knecta User',
            timestamp: Date.now(),
            app: 'Knecta Chat',
            version: '1.0',
            hash: generateVerificationHash(user.id, user.username || '')
        });
        
        try {
            new QRCode(qrContainer, {
                text: qrData,
                width: 200,
                height: 200,
                colorDark: '#0084ff',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.UNIQUE_QR_CODE, qrData);
            
        } catch (qrError) {
            qrContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px; color: var(--primary-color);"></i>
                    <p>Your unique QR code</p>
                    <p style="font-size: 12px; margin-top: 10px;">Scan to add as friend</p>
                    <p style="font-size: 10px; margin-top: 5px;">User: ${user.username || user.id}</p>
                </div>
            `;
        }
        
    } catch (error) {
        const qrContainer = document.getElementById('qrCodeContainer');
        if (qrContainer) {
            qrContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Your QR Code</p>
                </div>
            `;
        }
    }
}

function generateVerificationHash(userId, username) {
    const secret = 'knecta_secret_2024';
    const data = userId + username + Date.now();
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

// =============================================
// MUTUAL FRIENDS FUNCTIONS
// =============================================

export async function showMutualFriends(userId, userName) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friends/mutual/${userId}`, null, 1);
        
        if (response && response.mutualFriends) {
            const mutualFriends = response.mutualFriends;
            
            if (mutualFriends.length === 0) {
                showNotification(`No mutual friends with ${userName}`, 'info');
                return;
            }
            
            displayMutualFriendsModal(mutualFriends, userName);
        } else {
            showNotification('No mutual friends found', 'info');
        }
        
    } catch (error) {
        console.log('[Friend Page] Error loading mutual friends:', error.message);
        showNotification('Error loading mutual friends', 'error');
    }
}

function displayMutualFriendsModal(mutualFriends, userName) {
    const mutualCountText = document.getElementById('mutualCountText');
    const mutualFriendsList = document.getElementById('mutualFriendsList');
    
    mutualCountText.textContent = `${mutualFriends.length} mutual friends with ${userName}`;
    mutualFriendsList.innerHTML = '';
    
    if (mutualFriends.length === 0) {
        mutualFriendsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                <p>No mutual friends found</p>
            </div>
        `;
    } else {
        mutualFriends.forEach(friend => {
            const friendId = friend.id;
            const initials = friend.displayName ? 
                friend.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2) : 
                'U';
            
            const friendItem = document.createElement('div');
            friendItem.className = 'mutual-friend-item';
            friendItem.innerHTML = `
                <div class="mutual-friend-avatar" ${friend.photoURL ? `style="background-image: url('${escapeHtml(friend.photoURL)}')"` : ''}>
                    ${friend.photoURL ? '' : `<span>${initials}</span>`}
                </div>
                <div class="mutual-friend-info">
                    <div class="mutual-friend-name">${escapeHtml(friend.displayName || 'Unknown User')}</div>
                    ${friend.username ? `<div class="mutual-friend-username">${escapeHtml(friend.username)}</div>` : ''}
                </div>
            `;
            
            friendItem.addEventListener('click', () => {
                showFriendDetails(friend, 'friend');
                document.getElementById('mutualFriendsModal').classList.remove('active');
            });
            
            mutualFriendsList.appendChild(friendItem);
        });
    }
    
    document.getElementById('mutualFriendsModal').classList.add('active');
}

// =============================================
// FRIEND OPTIONS AND MANAGEMENT FUNCTIONS
// =============================================

export async function togglePinFriend(friendData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        const friendId = friendData.id;
        const isPinned = pinnedFriends.some(f => f.id === friendId);
        
        if (isPinned) {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/pin`, {
                method: 'DELETE'
            }, 1);
            if (response && response.success) {
                pinnedFriends = pinnedFriends.filter(f => f.id !== friendId);
                showNotification('Friend unpinned', 'success');
            }
        } else {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/pin`, {
                method: 'POST'
            }, 1);
            if (response && response.success) {
                pinnedFriends.push(friendData);
                showNotification('Friend pinned', 'success');
            }
        }
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
        updateCurrentSection();
        updateFriendCounts();
        
    } catch (error) {
        console.log('[Friend Page] Failed to update pin status:', error.message);
        showNotification('Failed to update pin status', 'error');
    }
}

export async function toggleMuteFriend(friendData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        const friendId = friendData.id;
        const isMuted = mutedFriends.some(f => f.id === friendId);
        
        if (isMuted) {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/mute`, {
                method: 'DELETE'
            }, 1);
            if (response && response.success) {
                mutedFriends = mutedFriends.filter(f => f.id !== friendId);
                showNotification('Friend unmuted', 'success');
            }
        } else {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/mute`, {
                method: 'POST'
            }, 1);
            if (response && response.success) {
                mutedFriends.push(friendData);
                showNotification('Friend muted', 'success');
            }
        }
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
        updateCurrentSection();
        updateFriendCounts();
        
    } catch (error) {
        console.log('[Friend Page] Failed to update mute status:', error.message);
        showNotification('Failed to update mute status', 'error');
    }
}

export function savePrivateNote(friendId, note) {
    try {
        if (!window.privateNotes) {
            window.privateNotes = {};
        }
        
        window.privateNotes[friendId] = note;
        localStorage.setItem(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, JSON.stringify(window.privateNotes));
        showNotification('Note saved', 'success');
        
    } catch (error) {
        console.log('[Friend Page] Failed to save note:', error.message);
        showNotification('Failed to save note', 'error');
    }
}

export function getLastInteraction(friendId) {
    if (!window.lastInteractions) {
        window.lastInteractions = {};
    }
    
    const interaction = window.lastInteractions[friendId];
    if (!interaction) return null;
    
    const now = new Date();
    const interactionTime = new Date(interaction.timestamp);
    const minutesAgo = Math.floor((now - interactionTime) / 60000);
    
    if (minutesAgo < 1) return 'Just now';
    if (minutesAgo < 60) return `${minutesAgo}m ago`;
    
    const hoursAgo = Math.floor(minutesAgo / 60);
    if (hoursAgo < 24) return `${hoursAgo}h ago`;
    
    const daysAgo = Math.floor(hoursAgo / 24);
    if (daysAgo < 7) return `${daysAgo}d ago`;
    
    return `${Math.floor(daysAgo / 7)}w ago`;
}

export async function removeFriend(friendData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friends/${friendData.id}`, {
            method: 'DELETE'
        }, 1);
        
        if (response && response.success) {
            friends = friends.filter(f => f.id !== friendData.id);
            pinnedFriends = pinnedFriends.filter(f => f.id !== friendData.id);
            mutedFriends = mutedFriends.filter(f => f.id !== friendData.id);
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
            
            updateCurrentSection();
            updateFriendCounts();
            
            showNotification('Friend removed successfully', 'success');
        } else {
            showNotification('Failed to remove friend', 'error');
        }
        
    } catch (error) {
        console.log('[Friend Page] Failed to remove friend:', error.message);
        showNotification('Failed to remove friend', 'error');
    }
}

export async function blockUser(friendData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/users/${friendData.id}/block`, {
            method: 'POST'
        }, 1);
        
        if (response && response.success) {
            friends = friends.filter(f => f.id !== friendData.id);
            pinnedFriends = pinnedFriends.filter(f => f.id !== friendData.id);
            mutedFriends = mutedFriends.filter(f => f.id !== friendData.id);
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
            
            updateCurrentSection();
            updateFriendCounts();
            
            showNotification('User blocked successfully', 'success');
        } else {
            showNotification('Failed to block user', 'error');
        }
        
    } catch (error) {
        console.log('[Friend Page] Failed to block user:', error.message);
        showNotification('Failed to block user', 'error');
    }
}

// =============================================
// DATA PERSISTENCE FUNCTIONS
// =============================================

export function saveFriendsToLocalStorage() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
        localStorage.setItem(LOCAL_STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
        localStorage.setItem(LOCAL_STORAGE_KEYS.REQUESTS, JSON.stringify(friendRequests));
        localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
        localStorage.setItem(LOCAL_STORAGE_KEYS.TEMPORARY_FRIENDS, JSON.stringify(temporaryFriends));
        localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
        localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
        localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
    } catch (error) {
        // Silently fail
    }
}

// =============================================
// UI UPDATE FUNCTIONS
// =============================================

export function updateUIWithUserData(userData) {
    console.log('[Friend Page] Updating UI with user data:', userData);
    
    currentUser = userData;
    userData = userData;
    
    updateUserDisplayElements(userData);
    
    if (userData.id) {
        setTimeout(() => generateUniqueQRCode(), 100);
    }
    
    const event = new CustomEvent('userDataLoaded', {
        detail: { userData: userData, source: dataSource.source }
    });
    window.dispatchEvent(event);
}

function updateUserDisplayElements(userData) {
    console.log('[Friend Page] User display elements updated for:', userData.displayName || userData.username);
}

export function updateDataSourceIndicator(source) {
    const indicator = document.getElementById('dataSourceIndicator');
    if (!indicator) return;
    
    indicator.className = 'data-source-indicator active';
    indicator.classList.add(source);
    
    const textElement = document.getElementById('dataSourceText');
    if (textElement) {
        const sourceText = {
            'parent': 'Data from Parent',
            'unified_auth': 'Data from Auth System',
            'cache': 'Cached Data',
            'direct': 'Data from API'
        };
        textElement.textContent = sourceText[source] || 'Unknown Source';
    }
    
    setTimeout(() => {
        indicator.classList.remove('active');
    }, 5000);
}

export function attemptCachedDataFallback() {
    console.log('[Friend Page] Attempting cached data fallback');
    
    try {
        const cachedUser = localStorage.getItem('knecta_current_user') || localStorage.getItem('USER_DATA');
        
        if (cachedUser) {
            const userData = JSON.parse(cachedUser);
            
            dataSource.source = 'cache';
            dataSource.userData = userData;
            dataSource.fetched = true;
            
            updateUIWithUserData(userData);
            
            updateDataSourceIndicator('cache');
            
            initializeMainFunctionality();
            
            currentUser = userData;
            
            console.log('[Friend Page] Successfully initialized with cached data');
            
            showNotification('Using cached data. Some features may be limited.', 'warning');
            
            return true;
        }
        
        console.log('[Friend Page] No cached data available');
        return false;
        
    } catch (error) {
        console.log('[Friend Page] Error using cached data:', error.message);
        return false;
    }
}

export function initializeMainFunctionality() {
    console.log('[Friend Page] Initializing main functionality');
    
    hideAuthError();
    
    if (typeof enhancedInitialize === 'function') {
        enhancedInitialize();
    } else {
        initializeOriginalFunctionality();
    }
}

function initializeOriginalFunctionality() {
    console.log('[Friend Page] Using original initialization');
    
    if (typeof loadCachedDataInstantly === 'function') {
        loadCachedDataInstantly();
        cacheLoaded = true;
    }
    
    if (typeof startParallelDataLoading === 'function') {
        setTimeout(startParallelDataLoading, 1000);
    }
    
    if (typeof updateCurrentSection === 'function') {
        setTimeout(updateCurrentSection, 500);
    }
}

export function showAuthError(message) {
    if (window.parentCoordinator) {
        window.parentCoordinator.showAuthError(message);
        return;
    }
    
    const overlay = document.getElementById('authErrorOverlay');
    const messageElement = document.getElementById('authErrorMessage');
    
    if (overlay && messageElement) {
        messageElement.textContent = message || 'Authentication required';
        overlay.classList.add('active');
    }
}

export function hideAuthError() {
    if (window.parentCoordinator) {
        window.parentCoordinator.hideAuthError();
        return;
    }
    
    const overlay = document.getElementById('authErrorOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

export function showReconnectionState() {
    if (window.parentCoordinator) {
        window.parentCoordinator.showReconnectionState();
        return;
    }
    
    const existingIndicator = document.getElementById('reconnectionIndicator');
    if (!existingIndicator) {
        const indicator = document.createElement('div');
        indicator.id = 'reconnectionIndicator';
        indicator.className = 'reconnection-indicator';
        indicator.innerHTML = `
            <div class="reconnection-content">
                <i class="fas fa-sync-alt fa-spin"></i>
                <span>Reconnecting...</span>
            </div>
        `;
        document.body.appendChild(indicator);
    }
}

export function hideReconnectionState() {
    if (window.parentCoordinator) {
        window.parentCoordinator.hideReconnectionState();
        return;
    }
    
    const indicator = document.getElementById('reconnectionIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// =============================================
// EXPORT FOR MODULE USE
// =============================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ParentCoordinator,
        KnectaAuth,
        apiCallWithRetry,
        getValidToken,
        getCurrentUser,
        enhancedInitialize
    };
}