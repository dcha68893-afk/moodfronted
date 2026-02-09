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
    apiCallWithRetry as originalApiCallWithRetry,
    escapeHtml,
    formatTimeAgo,
    getTrustScoreClass,
    showNotification,
    navigateToChat,
    navigateToCall,
    simulateContactSync
} from './js/api.core.js';

import { getMessages } from './js/api.messages.js';

// =============================================
// ENHANCED HANDSHAKE PROTOCOL VARIABLES
// =============================================

let handshakeInProgress = false;
let sessionValid = false;
let handshakeTimeout = null;
let pendingSessionRequest = false;

// =============================================
// API CALL WITH RETRY IMPLEMENTATION
// =============================================

export const apiCallWithRetry = async (url, options = {}, maxRetries = 3) => {
    const baseDelay = 1000; // 1 second base delay
    let lastError;
    
    // Validate maxRetries to prevent infinite loops
    if (maxRetries < 0) maxRetries = 0;
    if (maxRetries > 10) maxRetries = 10; // Safety cap
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const fetchOptions = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            };
            
            // Add authorization if token exists
            const token = getValidToken();
            if (token && !fetchOptions.headers.Authorization) {
                fetchOptions.headers.Authorization = `Bearer ${token}`;
            }
            
            const response = await secureFetch(url, fetchOptions);
            
            if (!response.ok) {
                if (response.status === 401) {
                    const event = new CustomEvent('knectaTokenExpired');
                    window.dispatchEvent(event);
                    throw new Error('Session expired');
                }
                
                // Normalize API failures
                const errorMessage = await getErrorMessageFromResponse(response);
                throw new Error(`API error: ${response.status} - ${errorMessage}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            lastError = error;
            
            // Don't retry on session expiration or client errors (4xx except 429)
            if (error.message === 'Session expired' || 
                (error.message.includes('API error: 4') && !error.message.includes('API error: 429'))) {
                throw error;
            }
            
            if (attempt === maxRetries) {
                break;
            }
            
            // Exponential backoff with jitter
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
            
            // Only show notification on first failure
            if (attempt === 0) {
                showNotification('Connection issue, retrying...', 'warning');
            }
            
            // Non-blocking delay
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // Throw normalized error
    const normalizedError = new Error(
        lastError ? `API request failed after ${maxRetries} retries: ${lastError.message}` : 
                    'API request failed after retries'
    );
    normalizedError.originalError = lastError;
    normalizedError.retries = maxRetries;
    throw normalizedError;
};

// Helper function to extract error message from response
async function getErrorMessageFromResponse(response) {
    try {
        const errorText = await response.text();
        if (errorText) {
            try {
                const errorJson = JSON.parse(errorText);
                return errorJson.message || errorJson.error || errorText.substring(0, 100);
            } catch {
                return errorText.substring(0, 100);
            }
        }
    } catch {
        // Fallback to status text
    }
    return response.statusText || 'Unknown error';
}

// =============================================
// ENHANCED SECURE HANDSHAKE PROTOCOL
// =============================================

export function requestSessionFromParent() {
    if (handshakeInProgress || pendingSessionRequest) {
        return;
    }
    
    handshakeInProgress = true;
    pendingSessionRequest = true;
    sessionValid = false;
    
    // Only log once
    console.log('⏳ [Friend Page] Waiting for session from parent...');
    
    // Clear any existing timeout
    if (handshakeTimeout) {
        clearTimeout(handshakeTimeout);
    }
    
    // Send secure request to parent
    try {
        const message = {
            type: 'REQUEST_SESSION',
            source: 'friend.html',
            timestamp: Date.now(),
            version: '2.0',
            requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            handshake: true
        };
        
        // Send to parent with dynamic origin handling
        const parentOrigin = window.parent === window ? '*' : 
                           (window.parent.location && window.parent.location.origin) || '*';
        
        window.parent.postMessage(message, parentOrigin);
        
        // Set timeout for handshake response
        handshakeTimeout = setTimeout(() => {
            if (!sessionValid) {
                handshakeInProgress = false;
                pendingSessionRequest = false;
                console.log('❌ [Friend Page] Session request timeout. Will retry once.');
                
                // Single retry as requested
                setTimeout(() => {
                    if (!sessionValid) {
                        requestSessionFromParent();
                    }
                }, 2000);
            }
        }, 5000);
        
    } catch (error) {
        console.error('[Friend Page] Error sending session request:', error);
        handshakeInProgress = false;
        pendingSessionRequest = false;
    }
}

// Enhanced message handler for secure handshake
function handleEnhancedParentMessage(event) {
    // Security: Accept messages from:
    // 1. Current origin
    // 2. Parent origin (if available)
    // 3. Local development origins
    const acceptableOrigins = [
        window.location.origin,
        'http://127.0.0.1:5500',
        'http://localhost:5500',
        'http://localhost',
        'http://127.0.0.1'
    ];
    
    // Add parent origin if available and different
    if (window.parent !== window && window.parent.location) {
        const parentOrigin = window.parent.location.origin;
        if (parentOrigin && !acceptableOrigins.includes(parentOrigin)) {
            acceptableOrigins.push(parentOrigin);
        }
    }
    
    // Check if origin is acceptable
    if (!acceptableOrigins.includes(event.origin)) {
        console.warn('[Friend Page] Message from unknown origin rejected:', event.origin);
        return;
    }
    
    const data = event.data;
    if (!data || !data.type || data.source !== 'parent') {
        return;
    }
    
    // Only log once per message type
    if (data.type === 'SESSION_DATA' && !sessionValid) {
        console.log('✅ [Friend Page] Received SESSION_DATA from parent');
    }
    
    switch (data.type) {
        case 'SESSION_DATA':
            handleEnhancedSessionData(data);
            break;
            
        case 'HANDSHAKE_ACK':
            console.log('✅ [Friend Page] Handshake acknowledged by parent');
            break;
            
        case 'PARENT_READY':
            console.log('✅ [Friend Page] Parent is ready');
            if (!sessionValid && !handshakeInProgress) {
                requestSessionFromParent();
            }
            break;
    }
}

function handleEnhancedSessionData(data) {
    // Validate session data structure
    if (!data.token || !data.user) {
        console.log('❌ [Friend Page] Received invalid session from parent');
        handshakeInProgress = false;
        pendingSessionRequest = false;
        return;
    }
    
    // Validate token format
    if (typeof data.token !== 'string' || data.token.trim().length === 0) {
        console.log('❌ [Friend Page] Invalid token format');
        handshakeInProgress = false;
        pendingSessionRequest = false;
        return;
    }
    
    // Validate user object
    if (!data.user || typeof data.user !== 'object' || !data.user.id) {
        console.log('❌ [Friend Page] Invalid user data');
        handshakeInProgress = false;
        pendingSessionRequest = false;
        return;
    }
    
    // Source verification
    if (data.verification && data.verification !== 'knecta_secure_2024') {
        console.warn('[Friend Page] Session source verification mismatch');
        // Continue anyway for backward compatibility
    }
    
    // Mark as valid
    sessionValid = true;
    handshakeInProgress = false;
    pendingSessionRequest = false;
    
    // Clear timeout
    if (handshakeTimeout) {
        clearTimeout(handshakeTimeout);
        handshakeTimeout = null;
    }
    
    console.log('✅ [Friend Page] Session received successfully');
    
    // Update global state
    updateGlobalStateFromSession(data);
    
    // Bind UI only after session is validated
    bindUIAfterSession();
}

function updateGlobalStateFromSession(sessionData) {
    // Update dataSource
    dataSource.source = 'parent';
    dataSource.userData = sessionData.user;
    dataSource.token = sessionData.token;
    dataSource.fetched = true;
    dataSource.parentSessionReceived = true;
    
    // Update current user
    currentUser = sessionData.user;
    userData = currentUser;
    
    // Update UI
    updateUIWithUserData(sessionData.user);
    updateDataSourceIndicator('parent');
    
    // Initialize main functionality
    initializeMainFunctionality();
    
    // Dispatch event for other components
    const event = new CustomEvent('parentSessionReady', {
        detail: {
            session: {
                token: sessionData.token,
                user: sessionData.user,
                expiresAt: sessionData.expiresAt,
                issuedAt: sessionData.issuedAt
            },
            source: 'enhanced_handshake',
            timestamp: Date.now()
        }
    });
    window.dispatchEvent(event);
}

function bindUIAfterSession() {
    // Only bind UI after session is validated
    if (!sessionValid) {
        console.log('⚠️ [Friend Page] Cannot bind UI - session not validated');
        return;
    }
    
    console.log('✅ [Friend Page] Binding UI after session validation');
    
    // Call existing UI binding functions
    if (typeof initializeMainFunctionality === 'function') {
        initializeMainFunctionality();
    }
    
    // Start data loading
    if (typeof startParallelDataLoading === 'function') {
        setTimeout(startParallelDataLoading, 100);
    }
    
    // Update UI sections
    if (typeof updateCurrentSection === 'function') {
        setTimeout(updateCurrentSection, 200);
    }
}

// =============================================
// PARENT COORDINATION SYSTEM (UPDATED)
// =============================================

export const ParentCoordinator = {
    // Configuration
    config: {
        parentOrigin: window.location.origin,
        handshakeTimeout: 10000,
        maxRetries: 10,
        retryBaseDelay: 100,
        sessionExpiry: 30 * 60 * 1000,
        debug: false
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
        
        try {
            await this.detectParent();
            this.bindEnhancedMessageHandlers();
            this.setupReconnectionMonitor();
            
            // Start enhanced handshake protocol
            setTimeout(() => {
                requestSessionFromParent();
            }, 100);
            
        } catch (error) {
            this.handleParentUnavailable();
        }
    },
    
    // Detect parent window
    detectParent: function() {
        return new Promise((resolve, reject) => {
            if (window.parent === window || !window.parent) {
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
                resolve();
                
            } catch (error) {
                this.state.parentDetected = true;
                this.state.parentOrigin = '*';
                resolve();
            }
        });
    },
    
    // Bind enhanced message handlers
    bindEnhancedMessageHandlers: function() {
        if (this.state.messageHandlersBound) {
            return;
        }
        
        // Add enhanced message handler
        window.addEventListener('message', handleEnhancedParentMessage, false);
        
        // Keep existing handlers for compatibility
        window.addEventListener('message', this.handleParentMessage.bind(this), false);
        
        window.addEventListener('knectaAuthReady', this.handleAuthReady.bind(this));
        window.addEventListener('knectaTokenExpired', this.handleTokenExpired.bind(this));
        window.addEventListener('knectaAuthError', this.handleAuthError.bind(this));
        
        this.state.messageHandlersBound = true;
    },
    
    // Handle messages from parent window (compatibility layer)
    handleParentMessage: function(event) {
        if (this.config.parentOrigin !== '*' && event.origin !== this.config.parentOrigin) {
            return;
        }
        
        const data = event.data;
        if (!data || !data.type) {
            return;
        }
        
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
            return;
        }
        
        this.sendToParent({
            type: 'CHILD_READY',
            source: 'friend.html',
            timestamp: Date.now(),
            version: '1.0',
            sequenceId: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
        
        this.requestSessionWithRetry();
    },
    
    // Request session with exponential backoff
    requestSessionWithRetry: function() {
        if (this.state.sessionReceived || this.state.retryCount >= this.config.maxRetries) {
            if (this.state.retryCount >= this.config.maxRetries) {
                this.handleParentUnavailable();
            }
            return;
        }
        
        const delay = this.config.retryBaseDelay * Math.pow(2, this.state.retryCount);
        
        setTimeout(() => {
            if (!this.state.sessionReceived) {
                this.state.retryCount++;
                
                this.sendToParent({
                    type: 'REQUEST_SESSION',
                    source: 'friend.html',
                    timestamp: Date.now(),
                    retryCount: this.state.retryCount,
                    sequenceId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                });
                
                this.requestSessionWithRetry();
            }
        }, delay);
    },
    
    // Handle handshake acknowledgement
    handleHandshakeAck: function(data) {
        this.state.handshakeComplete = true;
        this.state.retryCount = 0;
        
        setTimeout(() => {
            this.sendToParent({
                type: 'REQUEST_SESSION',
                source: 'friend.html',
                timestamp: Date.now(),
                sequenceId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });
        }, 500);
    },
    
    // Handle parent ready signal
    handleParentReady: function(data) {
        this.state.parentReachable = true;
        
        if (!this.state.sessionReceived) {
            this.sendToParent({
                type: 'REQUEST_SESSION',
                source: 'friend.html',
                timestamp: Date.now(),
                sequenceId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });
        }
    },
    
    // Handle session data from parent
    handleSessionData: function(data) {
        if (!this.validateSessionData(data)) {
            this.sendToParent({
                type: 'SESSION_ERROR',
                source: 'friend.html',
                error: 'Invalid session data schema',
                sequenceId: data.sequenceId || `seq_${Date.now()}`
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
            timestamp: Date.now(),
            sequenceId: data.sequenceId || `seq_${Date.now()}`
        });
        
        this.dispatchSessionReady(data.session);
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
        if (!this.validateSessionData(data)) {
            return;
        }
        
        this.state.sessionData = data.session;
        this.state.lastSync = Date.now();
        
        this.updateAuthSystem(data.session);
        
        this.dispatchSessionUpdate(data.session);
    },
    
    // Handle logout signal
    handleLogout: function(data) {
        this.state.sessionData = null;
        this.state.sessionReceived = false;
        this.state.authReady = false;
        
        this.ui.protectedUIBlocked = true;
        
        this.clearAuthSystem();
        
        this.dispatchLogout();
        
        this.showAuthError('You have been logged out');
    },
    
    // Handle auth state changed
    handleAuthStateChanged: function(data) {
        if (data.authenticated && data.session) {
            this.handleSessionData({ session: data.session });
        } else {
            this.handleLogout(data);
        }
    },
    
    // Handle profile updated
    handleProfileUpdated: function(data) {
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
        const session = {
            token: data.token || window.knectaToken || localStorage.getItem('USER_TOKEN'),
            user: data.userData,
            issuedAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        };
        
        this.handleSessionData({ session });
    },
    
    handleLegacyAuthState: function(data) {
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
        if (this.state.sessionReceived && this.state.sessionData) {
            return;
        }
        
        if (event.detail && event.detail.token && event.detail.user) {
            this.state.authReady = true;
            this.state.sessionData = {
                token: event.detail.token,
                user: event.detail.user,
                source: 'unified_auth'
            };
            
            this.ui.protectedUIBlocked = false;
        }
    },
    
    // Handle token expired
    handleTokenExpired: function() {
        this.sendToParent({
            type: 'TOKEN_EXPIRED',
            source: 'friend.html',
            timestamp: Date.now(),
            sequenceId: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
        
        this.ui.protectedUIBlocked = true;
        this.showAuthError('Session expired');
    },
    
    // Handle auth error
    handleAuthError: function() {
        this.sendToParent({
            type: 'AUTH_ERROR',
            source: 'friend.html',
            timestamp: Date.now(),
            sequenceId: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
        
        this.ui.protectedUIBlocked = true;
        this.showAuthError('Authentication error');
    },
    
    // Update unified auth system with parent session
    updateAuthSystem: function(session) {
        if (!window.KnectaAuth) {
            return;
        }
        
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
        this.state.parentReachable = false;
        this.ui.protectedUIBlocked = true;
        this.ui.reconnectionDisplayed = true;
        
        this.showReconnectionState();
        
        this.attemptCachedSessionFallback();
    },
    
    // Attempt cached session fallback
    attemptCachedSessionFallback: function() {
        if (window.KnectaAuth && window.KnectaAuth.token && window.KnectaAuth.currentUser) {
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
        
        return false;
    },
    
    // Setup reconnection monitor
    setupReconnectionMonitor: function() {
        if (this.reconnectionInterval) {
            clearInterval(this.reconnectionInterval);
        }
        
        this.reconnectionInterval = setInterval(() => {
            if (!this.state.parentReachable && this.state.parentDetected) {
                this.attemptParentReconnection();
            }
        }, 5000);
    },
    
    // Attempt parent reconnection
    attemptParentReconnection: function() {
        this.sendToParent({
            type: 'RECONNECT_ATTEMPT',
            source: 'friend.html',
            timestamp: Date.now(),
            sequenceId: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });
        
        if (this.state.sessionData) {
            setTimeout(() => {
                this.sendToParent({
                    type: 'REQUEST_SESSION',
                    source: 'friend.html',
                    timestamp: Date.now(),
                    hasCachedSession: true,
                    sequenceId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                });
            }, 1000);
        }
    },
    
    // Send message to parent
    sendToParent: function(message) {
        if (!this.state.parentDetected) {
            return false;
        }
        
        try {
            window.parent.postMessage(message, this.state.parentOrigin || '*');
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
        
        try {
            const overlay = document.getElementById('authErrorOverlay');
            const messageElement = document.getElementById('authErrorMessage');
            
            if (overlay && messageElement) {
                messageElement.textContent = message || 'Authentication required';
                overlay.classList.add('active');
            } else {
                showNotification(message || 'Authentication error', 'error');
            }
        } catch (error) {
            this.logError('Error showing auth error:', error);
        }
    },
    
    // Hide authentication error
    hideAuthError: function() {
        this.ui.authErrorDisplayed = false;
        
        try {
            const overlay = document.getElementById('authErrorOverlay');
            if (overlay) {
                overlay.classList.remove('active');
            }
        } catch (error) {
            this.logError('Error hiding auth error:', error);
        }
    },
    
    // Show reconnection state
    showReconnectionState: function() {
        try {
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
                
                const retryBtn = document.getElementById('retryReconnectionBtn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        this.attemptParentReconnection();
                    });
                }
            } else {
                existingIndicator.classList.add('active');
            }
        } catch (error) {
            this.logError('Error showing reconnection state:', error);
        }
    },
    
    // Hide reconnection state
    hideReconnectionState: function() {
        this.ui.reconnectionDisplayed = false;
        
        try {
            const indicator = document.getElementById('reconnectionIndicator');
            if (indicator) {
                indicator.classList.remove('active');
            }
        } catch (error) {
            this.logError('Error hiding reconnection state:', error);
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
                source: 'friend.html',
                sequenceId: `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
    // Initialize enhanced handshake protocol
    setTimeout(() => {
        requestSessionFromParent();
    }, 100);
    
    // Also initialize parent coordinator for compatibility
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
        try {
            this.checkTokenMigration();
            await this.waitForParentCoordinator();
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
            
        } catch (error) {
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
            return;
        }
        
        for (const oldKey of OLD_TOKEN_KEYS) {
            const oldToken = localStorage.getItem(oldKey);
            if (oldToken && oldToken !== 'null' && oldToken !== 'undefined') {
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
                    resolve();
                    return;
                }
                
                if (checks >= maxChecks) {
                    resolve();
                    return;
                }
                
                setTimeout(checkCoordinator, 100);
            };
            
            checkCoordinator();
        });
    },
    
    loadCachedData: function() {
        try {
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
                        break;
                    } catch (e) {
                        console.error(`Error parsing user data from ${key}:`, e);
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
        } catch (error) {
            console.error('Error loading cached data:', error);
        }
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
            if (error.message.includes('Session expired') || error.message.includes('Authentication required')) {
                this.handleAuthError();
            }
            
            throw error;
            
        } finally {
            this.showLoading(false);
        }
    },
    
    showLoading: function(show) {
        try {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                if (show) {
                    overlay.classList.add('active');
                } else {
                    overlay.classList.remove('active');
                }
            }
        } catch (error) {
            // Silent fail
        }
    },
    
    handleTokenExpired: function() {
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
}

function handleParentSessionUpdate(event) {
    const session = event.detail.session;
    
    dataSource.userData = session.user;
    dataSource.token = session.token;
    
    currentUser = session.user;
    userData = currentUser;
    
    updateUIWithUserData(session.user);
}

function handleParentLogout(event) {
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
    
    try {
        updateCurrentSection();
    } catch (error) {
        console.error('Error updating section after logout:', error);
    }
    
    showAuthError('You have been logged out. Please log in again.');
}

function handleParentProfileUpdate(event) {
    const user = event.detail.user;
    
    dataSource.userData = user;
    currentUser = user;
    userData = currentUser;
    
    updateUIWithUserData(user);
    
    showNotification('Profile updated', 'success');
}

function handleUnifiedAuthReady(event) {
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
            return;
        }
        
        if (timeoutCount >= maxTimeout) {
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
                console.error('[Friend Page] Error parsing user data:', e);
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
        // Validate friendId
        if (!friendId || typeof friendId !== 'string') {
            showNotification('Invalid friend ID', 'error');
            return;
        }
        
        // Validate friend data
        if (!validateFriendId(friendId)) {
            showNotification('Invalid friend ID format', 'error');
            return;
        }
        
        const requestData = {
            receiverId: friendId,
            category: category,
            note: note,
            isTemporary: isTemporary,
            duration: duration,
            isBusiness: isBusiness
        };
        
        // Validate request data
        if (isTemporary && (!duration || duration < 1)) {
            showNotification('Please specify a valid duration for temporary friend', 'error');
            return;
        }
        
        const response = await apiCallWithRetry('/api/friend-requests/send', {
            method: 'POST',
            body: JSON.stringify(requestData)
        }, 2);
        
        if (response && response.success) {
            try {
                const sentResponse = await apiCallWithRetry('/api/friend-requests/sent', null, 1);
                
                if (sentResponse && sentResponse.requests) {
                    sentRequests = sentResponse.requests;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
                }
            } catch (error) {
                // Silent fail for cache refresh
            }
            
            fetchAllUsersFromBackend();
            
            try {
                updateCurrentSection();
            } catch (error) {
                console.error('Error updating section after sending friend request:', error);
            }
            
            showNotification('Friend request sent successfully', 'success');
        } else {
            showNotification('Failed to send friend request', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            showNotification('Failed to send friend request', 'error');
        }
    }
}

// Helper function to validate friend ID
function validateFriendId(friendId) {
    if (typeof friendId !== 'string') return false;
    if (friendId.trim().length === 0) return false;
    if (friendId.length > 100) return false;
    
    // Basic validation for common ID formats
    const validPattern = /^[a-zA-Z0-9_\-:.@]+$/;
    return validPattern.test(friendId);
}

// Helper function to validate friend data
function validateFriendData(friendData) {
    if (!friendData || typeof friendData !== 'object') return false;
    if (!friendData.id || typeof friendData.id !== 'string') return false;
    
    // Validate required fields
    if (!validateFriendId(friendData.id)) return false;
    
    // Validate optional fields if present
    if (friendData.displayName && typeof friendData.displayName !== 'string') return false;
    if (friendData.username && typeof friendData.username !== 'string') return false;
    if (friendData.email && typeof friendData.email !== 'string') return false;
    
    return true;
}

export async function acceptFriendRequestOnline(requestId, friendId) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        // Validate requestId and friendId
        if (!requestId || !friendId) {
            showNotification('Invalid request data', 'error');
            return;
        }
        
        if (!validateFriendId(friendId)) {
            showNotification('Invalid friend ID format', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friend-requests/${requestId}/accept`, {
            method: 'POST'
        }, 2);
        
        if (response && response.success) {
            startParallelDataLoading();
            showNotification('Friend request accepted', 'success');
        } else {
            showNotification('Failed to accept friend request', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            showNotification('Failed to accept friend request', 'error');
        }
    }
}

export async function declineFriendRequest(requestData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        // Validate requestData
        if (!requestData || !requestData.id) {
            showNotification('Invalid request data', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friend-requests/${requestData.id}/decline`, {
            method: 'POST'
        }, 2);
        
        if (response && response.success) {
            try {
                const requestsResponse = await apiCallWithRetry('/api/friend-requests/incoming', null, 1);
                
                if (requestsResponse && requestsResponse.requests) {
                    friendRequests = requestsResponse.requests;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.REQUESTS, JSON.stringify(friendRequests));
                }
            } catch (error) {
                // Silent fail for cache refresh
            }
            
            fetchAllUsersFromBackend();
            
            try {
                updateCurrentSection();
            } catch (error) {
                console.error('Error updating section after declining friend request:', error);
            }
            
            showNotification('Friend request declined', 'success');
        } else {
            showNotification('Failed to decline friend request', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            showNotification('Failed to decline friend request', 'error');
        }
    }
}

export async function cancelFriendRequest(requestData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        // Validate requestData
        if (!requestData || !requestData.id) {
            showNotification('Invalid request data', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friend-requests/${requestData.id}`, {
            method: 'DELETE'
        }, 2);
        
        if (response && response.success) {
            try {
                const sentResponse = await apiCallWithRetry('/api/friend-requests/sent', null, 1);
                
                if (sentResponse && sentResponse.requests) {
                    sentRequests = sentResponse.requests;
                    localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
                }
            } catch (error) {
                // Silent fail for cache refresh
            }
            
            fetchAllUsersFromBackend();
            
            try {
                updateCurrentSection();
            } catch (error) {
                console.error('Error updating section after canceling friend request:', error);
            }
            
            showNotification('Friend request cancelled', 'success');
        } else {
            showNotification('Failed to cancel friend request', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            showNotification('Failed to cancel friend request', 'error');
        }
    }
}

// =============================================
// DATA LOADING FUNCTIONS
// =============================================

export async function loadFriendsFromBackend() {
    try {
        if (window.parentCoordinator && window.parentCoordinator.shouldBlockProtectedUI()) {
            throw new Error('Authentication required');
        }
        
        const response = await apiCallWithRetry('/api/friends', null, 2);
        
        if (response && response.friends) {
            // Validate friend data before assignment
            friends = response.friends.filter(friend => validateFriendData(friend));
            friends.sort((a, b) => {
                if (a.online !== b.online) return b.online ? 1 : -1;
                return (a.displayName || '').localeCompare(b.displayName || '');
            });
            
            try {
                updateFriendCounts();
            } catch (error) {
                console.error('Error updating friend counts:', error);
            }
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
        }
    } catch (error) {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                // Validate cached friend data
                friends = Array.isArray(parsed) ? parsed.filter(friend => validateFriendData(friend)) : [];
                try {
                    updateFriendCounts();
                } catch (error) {
                    console.error('Error updating friend counts from cache:', error);
                }
            } catch (parseError) {
                friends = [];
            }
        }
    }
}

export async function loadFriendRequestsFromBackend() {
    try {
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/friend-requests/incoming', null, 2);
        
        if (response && response.requests) {
            friendRequests = response.requests;
            localStorage.setItem(LOCAL_STORAGE_KEYS.REQUESTS, JSON.stringify(friendRequests));
        }
    } catch (error) {
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
        
        const response = await apiCallWithRetry('/api/friend-requests/sent', null, 2);
        
        if (response && response.requests) {
            sentRequests = response.requests;
            localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
        }
    } catch (error) {
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
        
        const response = await apiCallWithRetry('/api/friends/pinned', null, 2);
        
        if (response && response.friends) {
            pinnedFriends = response.friends.filter(friend => validateFriendData(friend));
            localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
        }
    } catch (error) {
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
        
        const response = await apiCallWithRetry('/api/friends/muted', null, 2);
        
        if (response && response.friends) {
            mutedFriends = response.friends.filter(friend => validateFriendData(friend));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
        }
    } catch (error) {
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
        
        const response = await apiCallWithRetry('/api/contacts/synced', null, 2);
        
        if (response && response.contacts) {
            contacts = response.contacts;
            localStorage.setItem(LOCAL_STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
        }
    } catch (error) {
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
        
        const response = await apiCallWithRetry('/api/group/user', null, 2);
        
        if (response && response.groups) {
            groups = response.groups;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_GROUPS, JSON.stringify(groups));
        }
    } catch (error) {
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
        
        const response = await apiCallWithRetry('/api/users/all?limit=50', null, 2);
        
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
    
    try {
        loadCachedDataInstantly();
        cacheLoaded = true;
        setTimeout(generateUniqueQRCode, 100);
        initializeParentChildCommunication();
        
        apiReady = true;
        isInitialized = true;
        
        return true;
        
    } catch (error) {
        loadCachedDataInstantly();
        apiReady = false;
        isInitialized = true;
        cacheLoaded = true;
        return false;
    }
}

export function loadCachedDataInstantly() {
    try {
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA) || localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            currentUser = JSON.parse(cachedUser);
            userData = currentUser;
        }
        
        const friendsData = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (friendsData) {
            const parsed = JSON.parse(friendsData);
            friends = Array.isArray(parsed) ? parsed.filter(friend => validateFriendData(friend)) : [];
            try {
                updateFriendCounts();
            } catch (error) {
                console.error('Error updating friend counts from cache:', error);
            }
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
            const parsed = JSON.parse(pinnedData);
            pinnedFriends = Array.isArray(parsed) ? parsed.filter(friend => validateFriendData(friend)) : [];
        }
        
        const mutedData = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
        if (mutedData) {
            const parsed = JSON.parse(mutedData);
            mutedFriends = Array.isArray(parsed) ? parsed.filter(friend => validateFriendData(friend)) : [];
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
        
    } catch (error) {
        console.error('[Friend Page] Error loading cached data:', error.message);
    }
}

export function startParallelDataLoading() {
    if (backgroundTasksStarted) {
        return;
    }
    
    if (!getValidToken()) {
        return;
    }
    
    backgroundTasksStarted = true;
    
    if (window.KnectaAuth) {
        window.KnectaAuth.showLoading(true);
    }
    
    // Use non-blocking parallel loading
    const loadPromises = [];
    
    loadPromises.push(loadFriendsFromBackend().catch(() => {}));
    loadPromises.push(loadFriendRequestsFromBackend().catch(() => {}));
    loadPromises.push(loadSentRequestsFromBackend().catch(() => {}));
    loadPromises.push(loadPinnedFriendsFromBackend().catch(() => {}));
    loadPromises.push(loadMutedFriendsFromBackend().catch(() => {}));
    loadPromises.push(loadContactsFromBackend().catch(() => {}));
    loadPromises.push(loadGroupsFromBackend().catch(() => {}));
    loadPromises.push(fetchAllUsersFromBackend().catch(() => {}));
    
    // Don't block UI - use Promise.allSettled for non-blocking completion
    Promise.allSettled(loadPromises).then(() => {
        try {
            updateCurrentSection();
        } catch (error) {
            console.error('Error updating section after data loading:', error);
        }
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
        
        // Validate user ID from QR code
        if (!validateFriendId(parsedData.userId)) {
            showNotification('Invalid user ID in QR code', 'error');
            return;
        }
        
        showFriendRequestFromQRReal(parsedData);
        
        stopCameraScanner();
        document.getElementById('cameraScannerModal').classList.remove('active');
        
        showNotification('QR code scanned successfully!', 'success');
        
    } catch (error) {
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
        
        const response = await apiCallWithRetry(`/api/users/${userId}`, null, 2);
        
        if (response && response.user) {
            // Validate user data from API
            if (!validateFriendData(response.user)) {
                throw new Error('Invalid user data received');
            }
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
        
        // Validate user data before generating QR code
        if (!validateFriendData(user)) {
            qrContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Invalid user data</p>
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
        
        // Validate userId
        if (!validateFriendId(userId)) {
            showNotification('Invalid user ID', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friends/mutual/${userId}`, null, 2);
        
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
        showNotification('Error loading mutual friends', 'error');
    }
}

function displayMutualFriendsModal(mutualFriends, userName) {
    try {
        const mutualCountText = document.getElementById('mutualCountText');
        const mutualFriendsList = document.getElementById('mutualFriendsList');
        
        if (!mutualCountText || !mutualFriendsList) {
            return;
        }
        
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
                    try {
                        showFriendDetails(friend, 'friend');
                    } catch (error) {
                        console.error('Error showing friend details:', error);
                    }
                    document.getElementById('mutualFriendsModal').classList.remove('active');
                });
                
                mutualFriendsList.appendChild(friendItem);
            });
        }
        
        document.getElementById('mutualFriendsModal').classList.add('active');
    } catch (error) {
        console.error('Error displaying mutual friends modal:', error);
    }
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
        
        // Validate friend data
        if (!validateFriendData(friendData)) {
            showNotification('Invalid friend data', 'error');
            return;
        }
        
        const friendId = friendData.id;
        const isPinned = pinnedFriends.some(f => f.id === friendId);
        
        if (isPinned) {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/pin`, {
                method: 'DELETE'
            }, 2);
            if (response && response.success) {
                pinnedFriends = pinnedFriends.filter(f => f.id !== friendId);
                showNotification('Friend unpinned', 'success');
            }
        } else {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/pin`, {
                method: 'POST'
            }, 2);
            if (response && response.success) {
                pinnedFriends.push(friendData);
                showNotification('Friend pinned', 'success');
            }
        }
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
        
        try {
            updateCurrentSection();
            updateFriendCounts();
        } catch (error) {
            console.error('Error updating UI after pinning friend:', error);
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            showNotification('Failed to update pin status', 'error');
        }
    }
}

export async function toggleMuteFriend(friendData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        // Validate friend data
        if (!validateFriendData(friendData)) {
            showNotification('Invalid friend data', 'error');
            return;
        }
        
        const friendId = friendData.id;
        const isMuted = mutedFriends.some(f => f.id === friendId);
        
        if (isMuted) {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/mute`, {
                method: 'DELETE'
            }, 2);
            if (response && response.success) {
                mutedFriends = mutedFriends.filter(f => f.id !== friendId);
                showNotification('Friend unmuted', 'success');
            }
        } else {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/mute`, {
                method: 'POST'
            }, 2);
            if (response && response.success) {
                mutedFriends.push(friendData);
                showNotification('Friend muted', 'success');
            }
        }
        
        localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
        
        try {
            updateCurrentSection();
            updateFriendCounts();
        } catch (error) {
            console.error('Error updating UI after muting friend:', error);
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            showNotification('Failed to update mute status', 'error');
        }
    }
}

export function savePrivateNote(friendId, note) {
    try {
        if (!window.privateNotes) {
            window.privateNotes = {};
        }
        
        // Validate friendId
        if (!validateFriendId(friendId)) {
            showNotification('Invalid friend ID', 'error');
            return;
        }
        
        // Validate note length
        if (note && note.length > 1000) {
            showNotification('Note is too long (max 1000 characters)', 'error');
            return;
        }
        
        window.privateNotes[friendId] = note;
        localStorage.setItem(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, JSON.stringify(window.privateNotes));
        showNotification('Note saved', 'success');
        
    } catch (error) {
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
        
        // Validate friend data
        if (!validateFriendData(friendData)) {
            showNotification('Invalid friend data', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/friends/${friendData.id}`, {
            method: 'DELETE'
        }, 2);
        
        if (response && response.success) {
            friends = friends.filter(f => f.id !== friendData.id);
            pinnedFriends = pinnedFriends.filter(f => f.id !== friendData.id);
            mutedFriends = mutedFriends.filter(f => f.id !== friendData.id);
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
            
            try {
                updateCurrentSection();
                updateFriendCounts();
            } catch (error) {
                console.error('Error updating UI after removing friend:', error);
            }
            
            showNotification('Friend removed successfully', 'success');
        } else {
            showNotification('Failed to remove friend', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            showNotification('Failed to remove friend', 'error');
        }
    }
}

export async function blockUser(friendData) {
    try {
        const token = getValidToken();
        if (!token) {
            showNotification('Authentication required', 'error');
            return;
        }
        
        // Validate friend data
        if (!validateFriendData(friendData)) {
            showNotification('Invalid user data', 'error');
            return;
        }
        
        const response = await apiCallWithRetry(`/api/users/${friendData.id}/block`, {
            method: 'POST'
        }, 2);
        
        if (response && response.success) {
            friends = friends.filter(f => f.id !== friendData.id);
            pinnedFriends = pinnedFriends.filter(f => f.id !== friendData.id);
            mutedFriends = mutedFriends.filter(f => f.id !== friendData.id);
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
            
            try {
                updateCurrentSection();
                updateFriendCounts();
            } catch (error) {
                console.error('Error updating UI after blocking user:', error);
            }
            
            showNotification('User blocked successfully', 'success');
        } else {
            showNotification('Failed to block user', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            showNotification('Failed to block user', 'error');
        }
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
        console.error('Error saving friends to localStorage:', error);
    }
}

// =============================================
// UI UPDATE FUNCTIONS
// =============================================

export function updateUIWithUserData(userData) {
    currentUser = userData;
    userData = userData;
    
    try {
        updateUserDisplayElements(userData);
    } catch (error) {
        console.error('Error updating user display elements:', error);
    }
    
    if (userData.id) {
        setTimeout(() => generateUniqueQRCode(), 100);
    }
    
    const event = new CustomEvent('userDataLoaded', {
        detail: { userData: userData, source: dataSource.source }
    });
    window.dispatchEvent(event);
}

function updateUserDisplayElements(userData) {
    // Implementation depends on external UI functions
}

export function updateDataSourceIndicator(source) {
    try {
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
    } catch (error) {
        console.error('Error updating data source indicator:', error);
    }
}

export function attemptCachedDataFallback() {
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
            
            showNotification('Using cached data. Some features may be limited.', 'warning');
            
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('[Friend Page] Error using cached data:', error.message);
        return false;
    }
}

export function initializeMainFunctionality() {
    hideAuthError();
    
    if (typeof enhancedInitialize === 'function') {
        enhancedInitialize();
    } else {
        initializeOriginalFunctionality();
    }
}

function initializeOriginalFunctionality() {
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
    
    try {
        const overlay = document.getElementById('authErrorOverlay');
        const messageElement = document.getElementById('authErrorMessage');
        
        if (overlay && messageElement) {
            messageElement.textContent = message || 'Authentication required';
            overlay.classList.add('active');
        }
    } catch (error) {
        console.error('Error showing auth error:', error);
    }
}

export function hideAuthError() {
    if (window.parentCoordinator) {
        window.parentCoordinator.hideAuthError();
        return;
    }
    
    try {
        const overlay = document.getElementById('authErrorOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    } catch (error) {
        console.error('Error hiding auth error:', error);
    }
}

export function showReconnectionState() {
    if (window.parentCoordinator) {
        window.parentCoordinator.showReconnectionState();
        return;
    }
    
    try {
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
    } catch (error) {
        console.error('Error showing reconnection state:', error);
    }
}

export function hideReconnectionState() {
    if (window.parentCoordinator) {
        window.parentCoordinator.hideReconnectionState();
        return;
    }
    
    try {
        const indicator = document.getElementById('reconnectionIndicator');
        if (indicator) {
            indicator.remove();
        }
    } catch (error) {
        console.error('Error hiding reconnection state:', error);
    }
}

// =============================================
// MINIMAL COMPATIBILITY PATCH - escapeHtml
// =============================================

// Ensure escapeHtml is defined and exported
let escapeHtmlImplementation;
if (typeof escapeHtml === 'undefined') {
    escapeHtmlImplementation = function(text) {
        if (typeof text !== 'string') {
            return text;
        }
        
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
} else {
    escapeHtmlImplementation = escapeHtml;
}

// Export it
export { escapeHtmlImplementation as escapeHtml };

// =============================================
// EXPORT FOR MODULE USE (UPDATED)
// =============================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ParentCoordinator,
        KnectaAuth,
        apiCallWithRetry,
        getValidToken,
        getCurrentUser,
        enhancedInitialize,
        escapeHtml,
        requestSessionFromParent, // Added new function
        handleEnhancedParentMessage, // Added new function
        updateGlobalStateFromSession, // Added new function
        bindUIAfterSession // Added new function
    };
}