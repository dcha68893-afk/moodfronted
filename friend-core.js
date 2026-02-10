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
// SAFETY GUARDS & ERROR LOGGING
// =============================================

const SafetyGuards = {
    loggedErrors: new Set(),
    retryCounters: new Map(),
    messageCache: new Set(),
    
    // Safe error logging - log each unique error only once
    safeLogError: function(module, functionName, error, data = null) {
        const errorKey = `${module}:${functionName}:${error.message || error}`;
        
        if (!this.loggedErrors.has(errorKey)) {
            this.loggedErrors.add(errorKey);
            console.warn(`[${module}] ${functionName}: ${error.message || error}`, 
                       data ? data : '', 
                       new Date().toISOString());
        }
    },
    
    // Safe DOM access
    safeGetElement: function(id) {
        try {
            const element = document.getElementById(id);
            if (!element) {
                this.safeLogError('SafetyGuard', 'safeGetElement', 
                                 new Error(`Element not found: ${id}`));
            }
            return element;
        } catch (error) {
            this.safeLogError('SafetyGuard', 'safeGetElement', error);
            return null;
        }
    },
    
    // Check if session is valid
    isSessionValid: function() {
        try {
            if (window.parentCoordinator && window.parentCoordinator.isAuthenticated) {
                return window.parentCoordinator.isAuthenticated();
            }
            if (window.KnectaAuth && window.KnectaAuth.isAuthenticated) {
                return window.KnectaAuth.isAuthenticated();
            }
            const token = getValidToken();
            return !!token;
        } catch (error) {
            return false;
        }
    },
    
    // Check if user data exists
    isUserDataValid: function() {
        try {
            if (currentUser && currentUser.id) return true;
            if (userData && userData.id) return true;
            if (dataSource.userData && dataSource.userData.id) return true;
            return false;
        } catch (error) {
            return false;
        }
    },
    
    // Safe function execution with fallback
    safeExecute: function(funcName, func, fallbackValue = null, context = null) {
        try {
            return func.call(context || this);
        } catch (error) {
            this.safeLogError('SafetyGuard', 'safeExecute', 
                            new Error(`${funcName} failed: ${error.message}`));
            return fallbackValue;
        }
    }
};

// =============================================
// API CALL WITH RETRY IMPLEMENTATION
// =============================================

export const apiCallWithRetry = async (url, options = {}, maxRetries = 3) => {
    // Safety: Check if session is valid before making API calls
    if (!SafetyGuards.isSessionValid() && !url.includes('/public/')) {
        SafetyGuards.safeLogError('apiCallWithRetry', 'session_check', 
                                 new Error('Invalid session, skipping API call'));
        return { success: false, error: 'Session invalid' };
    }
    
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
    // Safety: Check if already in progress or cached
    const requestKey = `session_request_${Date.now()}`;
    if (handshakeInProgress || pendingSessionRequest || SafetyGuards.messageCache.has(requestKey)) {
        return;
    }
    
    SafetyGuards.messageCache.add(requestKey);
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
        SafetyGuards.safeLogError('requestSessionFromParent', 'postMessage', error);
        handshakeInProgress = false;
        pendingSessionRequest = false;
    }
}

// Enhanced message handler for secure handshake
function handleEnhancedParentMessage(event) {
    // Safety: Cache message to prevent duplicate processing
    const messageKey = `enhanced_${event.data.type}_${event.data.requestId || event.data.timestamp}`;
    if (SafetyGuards.messageCache.has(messageKey)) {
        return;
    }
    SafetyGuards.messageCache.add(messageKey);
    
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
        SafetyGuards.safeLogError('handleEnhancedParentMessage', 'origin_check', 
                                 new Error(`Message from unknown origin rejected: ${event.origin}`));
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
        SafetyGuards.safeLogError('handleEnhancedSessionData', 'validation', 
                                 new Error('Received invalid session from parent'));
        handshakeInProgress = false;
        pendingSessionRequest = false;
        return;
    }
    
    // Validate token format
    if (typeof data.token !== 'string' || data.token.trim().length === 0) {
        SafetyGuards.safeLogError('handleEnhancedSessionData', 'validation', 
                                 new Error('Invalid token format'));
        handshakeInProgress = false;
        pendingSessionRequest = false;
        return;
    }
    
    // Validate user object
    if (!data.user || typeof data.user !== 'object' || !data.user.id) {
        SafetyGuards.safeLogError('handleEnhancedSessionData', 'validation', 
                                 new Error('Invalid user data'));
        handshakeInProgress = false;
        pendingSessionRequest = false;
        return;
    }
    
    // Source verification
    if (data.verification && data.verification !== 'knecta_secure_2024') {
        SafetyGuards.safeLogError('handleEnhancedSessionData', 'verification', 
                                 new Error('Session source verification mismatch'));
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
    try {
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
    } catch (error) {
        SafetyGuards.safeLogError('updateGlobalStateFromSession', 'update', error, sessionData);
    }
}

function bindUIAfterSession() {
    // Only bind UI after session is validated
    if (!sessionValid) {
        SafetyGuards.safeLogError('bindUIAfterSession', 'validation', 
                                 new Error('Cannot bind UI - session not validated'));
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
        } finally {
            this.state.initializationLock = false;
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
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.handleParentMessage', 'message_handling', error);
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
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.validateSessionData', 'validation', error);
            return false;
        }
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
            try {
                this.state.sessionData.user = {
                    ...this.state.sessionData.user,
                    ...data.userData
                };
                
                if (window.KnectaAuth) {
                    window.KnectaAuth.currentUser = this.state.sessionData.user;
                }
                
                this.dispatchProfileUpdate(this.state.sessionData.user);
            } catch (error) {
                SafetyGuards.safeLogError('ParentCoordinator.handleProfileUpdated', 'update', error);
            }
        }
    },
    
    // Legacy message handlers
    handleLegacyUserData: function(data) {
        try {
            const session = {
                token: data.token || window.knectaToken || localStorage.getItem('USER_TOKEN'),
                user: data.userData,
                issuedAt: Date.now(),
                expiresAt: Date.now() + (24 * 60 * 60 * 1000)
            };
            
            this.handleSessionData({ session });
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.handleLegacyUserData', 'processing', error);
        }
    },
    
    handleLegacyAuthState: function(data) {
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.handleLegacyAuthState', 'processing', error);
        }
    },
    
    // Handle auth ready from unified system
    handleAuthReady: function(event) {
        if (this.state.sessionReceived && this.state.sessionData) {
            return;
        }
        
        try {
            if (event.detail && event.detail.token && event.detail.user) {
                this.state.authReady = true;
                this.state.sessionData = {
                    token: event.detail.token,
                    user: event.detail.user,
                    source: 'unified_auth'
                };
                
                this.ui.protectedUIBlocked = false;
            }
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.handleAuthReady', 'processing', error);
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
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.updateAuthSystem', 'update', error);
        }
    },
    
    // Clear unified auth system
    clearAuthSystem: function() {
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.clearAuthSystem', 'clear', error);
        }
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
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.attemptCachedSessionFallback', 'fallback', error);
        }
        
        return false;
    },
    
    // Setup reconnection monitor
    setupReconnectionMonitor: function() {
        if (this.reconnectionInterval) {
            clearInterval(this.reconnectionInterval);
        }
        
        let retryCount = 0;
        const maxRetries = 5;
        
        this.reconnectionInterval = setInterval(() => {
            if (!this.state.parentReachable && this.state.parentDetected) {
                if (retryCount >= maxRetries) {
                    clearInterval(this.reconnectionInterval);
                    this.log('Max reconnection retries reached');
                    return;
                }
                retryCount++;
                this.attemptParentReconnection();
            }
        }, 5000);
    },
    
    // Attempt parent reconnection
    attemptParentReconnection: function() {
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.attemptParentReconnection', 'reconnect', error);
        }
    },
    
    // Send message to parent
    sendToParent: function(message) {
        if (!this.state.parentDetected) {
            return false;
        }
        
        // Cache message to prevent duplicates
        const messageKey = `send_${message.type}_${message.sequenceId || message.timestamp}`;
        if (SafetyGuards.messageCache.has(messageKey)) {
            return false;
        }
        SafetyGuards.messageCache.add(messageKey);
        
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
        try {
            const event = new CustomEvent('parentSessionReady', {
                detail: {
                    session: session,
                    source: 'parent_coordinator',
                    timestamp: Date.now()
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.dispatchSessionReady', 'dispatch', error);
        }
    },
    
    // Dispatch session update event
    dispatchSessionUpdate: function(session) {
        try {
            const event = new CustomEvent('parentSessionUpdated', {
                detail: {
                    session: session,
                    timestamp: Date.now()
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.dispatchSessionUpdate', 'dispatch', error);
        }
    },
    
    // Dispatch logout event
    dispatchLogout: function() {
        try {
            const event = new CustomEvent('parentSessionLogout', {
                detail: {
                    timestamp: Date.now()
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.dispatchLogout', 'dispatch', error);
        }
    },
    
    // Dispatch profile update event
    dispatchProfileUpdate: function(user) {
        try {
            const event = new CustomEvent('parentProfileUpdated', {
                detail: {
                    user: user,
                    timestamp: Date.now()
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.dispatchProfileUpdate', 'dispatch', error);
        }
    },
    
    // Show authentication error
    showAuthError: function(message) {
        this.ui.authErrorDisplayed = true;
        
        try {
            const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
            const messageElement = SafetyGuards.safeGetElement('authErrorMessage');
            
            if (overlay && messageElement) {
                messageElement.textContent = message || 'Authentication required';
                overlay.classList.add('active');
            } else {
                showNotification(message || 'Authentication error', 'error');
            }
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.showAuthError', 'ui_update', error);
        }
    },
    
    // Hide authentication error
    hideAuthError: function() {
        this.ui.authErrorDisplayed = false;
        
        try {
            const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
            if (overlay) {
                overlay.classList.remove('active');
            }
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.hideAuthError', 'ui_update', error);
        }
    },
    
    // Show reconnection state
    showReconnectionState: function() {
        try {
            const existingIndicator = SafetyGuards.safeGetElement('reconnectionIndicator');
            
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
                
                const retryBtn = SafetyGuards.safeGetElement('retryReconnectionBtn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        this.attemptParentReconnection();
                    });
                }
            } else {
                existingIndicator.classList.add('active');
            }
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.showReconnectionState', 'ui_update', error);
        }
    },
    
    // Hide reconnection state
    hideReconnectionState: function() {
        this.ui.reconnectionDisplayed = false;
        
        try {
            const indicator = SafetyGuards.safeGetElement('reconnectionIndicator');
            if (indicator) {
                indicator.classList.remove('active');
            }
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.hideReconnectionState', 'ui_update', error);
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
        try {
            if (this.state.parentReachable && this.state.sessionReceived) {
                return await this.apiRequestViaParent(endpoint, options);
            }
            
            if (window.KnectaAuth && window.KnectaAuth.secureApiCall) {
                return await window.KnectaAuth.secureApiCall(endpoint, options, true);
            }
            
            return await this.apiRequestDirect(endpoint, options);
        } catch (error) {
            SafetyGuards.safeLogError('ParentCoordinator.apiRequest', 'api_call', error, { endpoint });
            throw error;
        }
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
        try {
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
    try {
        // Initialize enhanced handshake protocol
        setTimeout(() => {
            requestSessionFromParent();
        }, 100);
        
        // Also initialize parent coordinator for compatibility
        ParentCoordinator.init().catch(error => {
            SafetyGuards.safeLogError('DOMContentLoaded', 'ParentCoordinator.init', error);
        });
    } catch (error) {
        SafetyGuards.safeLogError('DOMContentLoaded', 'initialization', error);
    }
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
            SafetyGuards.safeLogError('KnectaAuth.init', 'initialization', error);
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
        }
    },
    
    checkTokenMigration: function() {
        try {
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
                    
                    const notice = SafetyGuards.safeGetElement('tokenMigrationNotice');
                    if (notice) {
                        notice.classList.add('active');
                        setTimeout(() => {
                            notice.classList.remove('active');
                        }, 3000);
                    }
                    
                    break;
                }
            }
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.checkTokenMigration', 'migration', error);
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
                        SafetyGuards.safeLogError('KnectaAuth.loadCachedData', 'parse', e, { key });
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
            SafetyGuards.safeLogError('KnectaAuth.loadCachedData', 'loading', error);
        }
    },
    
    dispatchReadyEvent: function() {
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.dispatchReadyEvent', 'dispatch', error);
        }
    },
    
    dispatchCacheReadyEvent: function() {
        try {
            const event = new CustomEvent('knectaCacheReady', {
                detail: { 
                    token: this.token,
                    user: this.currentUser,
                    cacheOnly: true
                }
            });
            window.dispatchEvent(event);
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.dispatchCacheReadyEvent', 'dispatch', error);
        }
    },
    
    getTokenAsync: function() {
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.getTokenAsync', 'get_token', error);
            return Promise.reject(error);
        }
    },
    
    secureApiCall: async function(apiPath, options = {}, requireAuth = true) {
        try {
            if (window.parentCoordinator && window.parentCoordinator.isAuthenticated()) {
                return window.parentCoordinator.apiRequest(apiPath, options);
            }
            
            return await this.secureApiCallFallback(apiPath, options, requireAuth);
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.secureApiCall', 'api_call', error, { apiPath });
            throw error;
        }
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
            const overlay = SafetyGuards.safeGetElement('loadingOverlay');
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
        try {
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
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.handleTokenExpired', 'token_expired', error);
        }
    },
    
    handleAuthError: function() {
        try {
            showNotification('Please log in to continue', 'warning');
            
            const event = new CustomEvent('knectaAuthError');
            window.dispatchEvent(event);
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.handleAuthError', 'auth_error', error);
        }
    },
    
    showNotification: function(message, type = 'success') {
        try {
            if (window.parentCoordinator) {
                window.parentCoordinator.showNotification(message, type);
            } else {
                if (typeof showNotification === 'function') {
                    showNotification(message, type);
                }
            }
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.showNotification', 'notification', error);
        }
    },
    
    isAuthenticated: function() {
        try {
            if (window.parentCoordinator) {
                return window.parentCoordinator.isAuthenticated();
            }
            
            return !!(this.token && this.tokenReady);
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.isAuthenticated', 'check', error);
            return false;
        }
    },
    
    getUser: function() {
        try {
            if (window.parentCoordinator) {
                return window.parentCoordinator.getUser();
            }
            
            return this.currentUser;
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.getUser', 'get_user', error);
            return null;
        }
    },
    
    getToken: function() {
        try {
            if (window.parentCoordinator) {
                return window.parentCoordinator.getToken();
            }
            
            return this.token;
        } catch (error) {
            SafetyGuards.safeLogError('KnectaAuth.getToken', 'get_token', error);
            return null;
        }
    }
};

// Initialize auth system
window.addEventListener('DOMContentLoaded', () => {
    try {
        KnectaAuth.init().catch(error => {
            SafetyGuards.safeLogError('KnectaAuth.init', 'initialization', error);
        });
    } catch (error) {
        SafetyGuards.safeLogError('DOMContentLoaded', 'KnectaAuth.init', error);
    }
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
    try {
        setupSessionEventListeners();
        loadCachedDataInstantly();
        waitForParentSession();
    } catch (error) {
        SafetyGuards.safeLogError('initializeParentChildCommunication', 'initialization', error);
    }
}

function setupSessionEventListeners() {
    try {
        window.addEventListener('parentSessionReady', handleParentSessionReady);
        window.addEventListener('parentSessionUpdated', handleParentSessionUpdate);
        window.addEventListener('parentSessionLogout', handleParentLogout);
        window.addEventListener('parentProfileUpdated', handleParentProfileUpdate);
        window.addEventListener('knectaAuthReady', handleUnifiedAuthReady);
        window.addEventListener('knectaCacheReady', handleUnifiedCacheReady);
    } catch (error) {
        SafetyGuards.safeLogError('setupSessionEventListeners', 'setup', error);
    }
}

function handleParentSessionReady(event) {
    try {
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
    } catch (error) {
        SafetyGuards.safeLogError('handleParentSessionReady', 'processing', error, event);
    }
}

function handleParentSessionUpdate(event) {
    try {
        const session = event.detail.session;
        
        dataSource.userData = session.user;
        dataSource.token = session.token;
        
        currentUser = session.user;
        userData = currentUser;
        
        updateUIWithUserData(session.user);
    } catch (error) {
        SafetyGuards.safeLogError('handleParentSessionUpdate', 'processing', error, event);
    }
}

function handleParentLogout(event) {
    try {
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
            SafetyGuards.safeLogError('handleParentLogout', 'ui_update', error);
        }
        
        showAuthError('You have been logged out. Please log in again.');
    } catch (error) {
        SafetyGuards.safeLogError('handleParentLogout', 'processing', error, event);
    }
}

function handleParentProfileUpdate(event) {
    try {
        const user = event.detail.user;
        
        dataSource.userData = user;
        currentUser = user;
        userData = currentUser;
        
        updateUIWithUserData(user);
        
        showNotification('Profile updated', 'success');
    } catch (error) {
        SafetyGuards.safeLogError('handleParentProfileUpdate', 'processing', error, event);
    }
}

function handleUnifiedAuthReady(event) {
    try {
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
    } catch (error) {
        SafetyGuards.safeLogError('handleUnifiedAuthReady', 'processing', error, event);
    }
}

function handleUnifiedCacheReady(event) {
    try {
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
    } catch (error) {
        SafetyGuards.safeLogError('handleUnifiedCacheReady', 'processing', error, event);
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
    try {
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
                    SafetyGuards.safeLogError('getCurrentUser', 'parse', e, { key });
                }
            }
        }
    } catch (error) {
        SafetyGuards.safeLogError('getCurrentUser', 'get_user', error);
    }
    
    return null;
}

// =============================================
// FRIEND REQUEST MANAGEMENT
// =============================================

export async function sendFriendRequest(friendId, category = 'friend', note = '', isTemporary = false, duration = null, isBusiness = false) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('sendFriendRequest', 'session_check', 
                                     new Error('Invalid session, skipping friend request'));
            showNotification('Authentication required', 'error');
            return;
        }
        
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
                SafetyGuards.safeLogError('sendFriendRequest', 'ui_update', error);
            }
            
            showNotification('Friend request sent successfully', 'success');
        } else {
            showNotification('Failed to send friend request', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            SafetyGuards.safeLogError('sendFriendRequest', 'api_call', error, { friendId });
            showNotification('Failed to send friend request', 'error');
        }
    }
}

// Helper function to validate friend ID
function validateFriendId(friendId) {
    try {
        if (typeof friendId !== 'string') return false;
        if (friendId.trim().length === 0) return false;
        if (friendId.length > 100) return false;
        
        // Basic validation for common ID formats
        const validPattern = /^[a-zA-Z0-9_\-:.@]+$/;
        return validPattern.test(friendId);
    } catch (error) {
        SafetyGuards.safeLogError('validateFriendId', 'validation', error);
        return false;
    }
}

// Helper function to validate friend data
function validateFriendData(friendData) {
    try {
        if (!friendData || typeof friendData !== 'object') return false;
        if (!friendData.id || typeof friendData.id !== 'string') return false;
        
        // Validate required fields
        if (!validateFriendId(friendData.id)) return false;
        
        // Validate optional fields if present
        if (friendData.displayName && typeof friendData.displayName !== 'string') return false;
        if (friendData.username && typeof friendData.username !== 'string') return false;
        if (friendData.email && typeof friendData.email !== 'string') return false;
        
        return true;
    } catch (error) {
        SafetyGuards.safeLogError('validateFriendData', 'validation', error);
        return false;
    }
}

export async function acceptFriendRequestOnline(requestId, friendId) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('acceptFriendRequestOnline', 'session_check', 
                                     new Error('Invalid session, skipping friend request acceptance'));
            showNotification('Authentication required', 'error');
            return;
        }
        
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
            SafetyGuards.safeLogError('acceptFriendRequestOnline', 'api_call', error, { requestId, friendId });
            showNotification('Failed to accept friend request', 'error');
        }
    }
}

export async function declineFriendRequest(requestData) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('declineFriendRequest', 'session_check', 
                                     new Error('Invalid session, skipping friend request decline'));
            showNotification('Authentication required', 'error');
            return;
        }
        
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
                SafetyGuards.safeLogError('declineFriendRequest', 'ui_update', error);
            }
            
            showNotification('Friend request declined', 'success');
        } else {
            showNotification('Failed to decline friend request', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            SafetyGuards.safeLogError('declineFriendRequest', 'api_call', error, requestData);
            showNotification('Failed to decline friend request', 'error');
        }
    }
}

export async function cancelFriendRequest(requestData) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('cancelFriendRequest', 'session_check', 
                                     new Error('Invalid session, skipping friend request cancellation'));
            showNotification('Authentication required', 'error');
            return;
        }
        
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
                SafetyGuards.safeLogError('cancelFriendRequest', 'ui_update', error);
            }
            
            showNotification('Friend request cancelled', 'success');
        } else {
            showNotification('Failed to cancel friend request', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            SafetyGuards.safeLogError('cancelFriendRequest', 'api_call', error, requestData);
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
        
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('loadFriendsFromBackend', 'session_check', 
                                     new Error('Invalid session, loading from cache'));
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
                SafetyGuards.safeLogError('loadFriendsFromBackend', 'ui_update', error);
            }
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
            localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
        }
    } catch (error) {
        SafetyGuards.safeLogError('loadFriendsFromBackend', 'api_call', error);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                // Validate cached friend data
                friends = Array.isArray(parsed) ? parsed.filter(friend => validateFriendData(friend)) : [];
                try {
                    updateFriendCounts();
                } catch (uiError) {
                    SafetyGuards.safeLogError('loadFriendsFromBackend', 'cache_ui_update', uiError);
                }
            } catch (parseError) {
                SafetyGuards.safeLogError('loadFriendsFromBackend', 'cache_parse', parseError);
                friends = [];
            }
        }
    }
}

export async function loadFriendRequestsFromBackend() {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('loadFriendRequestsFromBackend', 'session_check', 
                                     new Error('Invalid session, loading from cache'));
            throw new Error('No valid token');
        }
        
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/friend-requests/incoming', null, 2);
        
        if (response && response.requests) {
            friendRequests = response.requests;
            localStorage.setItem(LOCAL_STORAGE_KEYS.REQUESTS, JSON.stringify(friendRequests));
        }
    } catch (error) {
        SafetyGuards.safeLogError('loadFriendRequestsFromBackend', 'api_call', error);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.REQUESTS);
        if (cached) {
            try {
                friendRequests = JSON.parse(cached);
            } catch (parseError) {
                SafetyGuards.safeLogError('loadFriendRequestsFromBackend', 'cache_parse', parseError);
                friendRequests = [];
            }
        }
    }
}

export async function loadSentRequestsFromBackend() {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('loadSentRequestsFromBackend', 'session_check', 
                                     new Error('Invalid session, loading from cache'));
            throw new Error('No valid token');
        }
        
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/friend-requests/sent', null, 2);
        
        if (response && response.requests) {
            sentRequests = response.requests;
            localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
        }
    } catch (error) {
        SafetyGuards.safeLogError('loadSentRequestsFromBackend', 'api_call', error);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS);
        if (cached) {
            try {
                sentRequests = JSON.parse(cached);
            } catch (parseError) {
                SafetyGuards.safeLogError('loadSentRequestsFromBackend', 'cache_parse', parseError);
                sentRequests = [];
            }
        }
    }
}

export async function loadPinnedFriendsFromBackend() {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('loadPinnedFriendsFromBackend', 'session_check', 
                                     new Error('Invalid session, loading from cache'));
            throw new Error('No valid token');
        }
        
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/friends/pinned', null, 2);
        
        if (response && response.friends) {
            pinnedFriends = response.friends.filter(friend => validateFriendData(friend));
            localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
        }
    } catch (error) {
        SafetyGuards.safeLogError('loadPinnedFriendsFromBackend', 'api_call', error);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS);
        if (cached) {
            try {
                pinnedFriends = JSON.parse(cached);
            } catch (parseError) {
                SafetyGuards.safeLogError('loadPinnedFriendsFromBackend', 'cache_parse', parseError);
                pinnedFriends = [];
            }
        }
    }
}

export async function loadMutedFriendsFromBackend() {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('loadMutedFriendsFromBackend', 'session_check', 
                                     new Error('Invalid session, loading from cache'));
            throw new Error('No valid token');
        }
        
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/friends/muted', null, 2);
        
        if (response && response.friends) {
            mutedFriends = response.friends.filter(friend => validateFriendData(friend));
            localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
        }
    } catch (error) {
        SafetyGuards.safeLogError('loadMutedFriendsFromBackend', 'api_call', error);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
        if (cached) {
            try {
                mutedFriends = JSON.parse(cached);
            } catch (parseError) {
                SafetyGuards.safeLogError('loadMutedFriendsFromBackend', 'cache_parse', parseError);
                mutedFriends = [];
            }
        }
    }
}

export async function loadContactsFromBackend() {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('loadContactsFromBackend', 'session_check', 
                                     new Error('Invalid session, loading from cache'));
            throw new Error('No valid token');
        }
        
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/contacts/synced', null, 2);
        
        if (response && response.contacts) {
            contacts = response.contacts;
            localStorage.setItem(LOCAL_STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
        }
    } catch (error) {
        SafetyGuards.safeLogError('loadContactsFromBackend', 'api_call', error);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
        if (cached) {
            try {
                contacts = JSON.parse(cached);
            } catch (parseError) {
                SafetyGuards.safeLogError('loadContactsFromBackend', 'cache_parse', parseError);
                contacts = [];
            }
        }
    }
}

export async function loadGroupsFromBackend() {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('loadGroupsFromBackend', 'session_check', 
                                     new Error('Invalid session, loading from cache'));
            throw new Error('No valid token');
        }
        
        const token = getValidToken();
        if (!token) throw new Error('No valid token');
        
        const response = await apiCallWithRetry('/api/group/user', null, 2);
        
        if (response && response.groups) {
            groups = response.groups;
            localStorage.setItem(LOCAL_STORAGE_KEYS.USER_GROUPS, JSON.stringify(groups));
        }
    } catch (error) {
        SafetyGuards.safeLogError('loadGroupsFromBackend', 'api_call', error);
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (cached) {
            try {
                groups = JSON.parse(cached);
            } catch (parseError) {
                SafetyGuards.safeLogError('loadGroupsFromBackend', 'cache_parse', parseError);
                groups = [];
            }
        }
    }
}

export async function fetchAllUsersFromBackend() {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('fetchAllUsersFromBackend', 'session_check', 
                                     new Error('Invalid session, loading from cache'));
            throw new Error('No valid token');
        }
        
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
        SafetyGuards.safeLogError('fetchAllUsersFromBackend', 'api_call', error);
        const cachedAllUsers = localStorage.getItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
        if (cachedAllUsers) {
            try {
                allUsers = JSON.parse(cachedAllUsers);
            } catch (parseError) {
                SafetyGuards.safeLogError('fetchAllUsersFromBackend', 'cache_parse', parseError);
                allUsers = [];
            }
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
        SafetyGuards.safeLogError('enhancedInitialize', 'initialization', error);
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
                SafetyGuards.safeLogError('loadCachedDataInstantly', 'ui_update', error);
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
        SafetyGuards.safeLogError('loadCachedDataInstantly', 'loading', error);
    }
}

export function startParallelDataLoading() {
    if (backgroundTasksStarted) {
        return;
    }
    
    // Safety: Check session
    if (!SafetyGuards.isSessionValid()) {
        SafetyGuards.safeLogError('startParallelDataLoading', 'session_check', 
                                 new Error('Invalid session, skipping background tasks'));
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
            SafetyGuards.safeLogError('startParallelDataLoading', 'ui_update', error);
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
    try {
        isMobile = window.innerWidth <= 768;
    } catch (error) {
        SafetyGuards.safeLogError('checkMobile', 'check', error);
    }
}

// =============================================
// CAMERA AND QR CODE FUNCTIONS
// =============================================

export async function startCameraScanner() {
    try {
        const videoElement = SafetyGuards.safeGetElement('cameraVideo');
        const canvasElement = SafetyGuards.safeGetElement('scannerCanvas');
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
        SafetyGuards.safeLogError('startCameraScanner', 'camera', error);
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
        try {
            ctx.beginPath();
            ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
            ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
            ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
            ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
            ctx.lineTo(location.topLeftCorner.x, location.topLeftCorner.y);
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#00FF00";
            ctx.stroke();
        } catch (error) {
            // Silently fail
        }
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
        const modal = SafetyGuards.safeGetElement('cameraScannerModal');
        if (modal) modal.classList.remove('active');
        
        showNotification('QR code scanned successfully!', 'success');
        
    } catch (error) {
        SafetyGuards.safeLogError('processScannedQRCodeReal', 'processing', error);
        showNotification('Error processing QR code', 'error');
    }
}

function showFriendRequestFromQRReal(qrData) {
    fetchUserInfoFromQR(qrData.userId).then(userInfo => {
        const requestAvatar = SafetyGuards.safeGetElement('requestAvatar');
        const requestName = SafetyGuards.safeGetElement('requestName');
        const requestUsername = SafetyGuards.safeGetElement('requestUsername');
        const mutualCount = SafetyGuards.safeGetElement('mutualCount');
        const acceptBtn = SafetyGuards.safeGetElement('acceptRequestBtn');
        const friendRequestModal = SafetyGuards.safeGetElement('friendRequestModal');
        
        if (requestAvatar) {
            requestAvatar.innerHTML = `
                <div style="width: 100%; height: 100%; border-radius: 50%; background-color: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                    ${userInfo.displayName ? userInfo.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
            `;
        }
        
        if (requestName) {
            requestName.textContent = userInfo.displayName || qrData.displayName || 'QR Code User';
        }
        
        if (requestUsername) {
            requestUsername.textContent = userInfo.username || qrData.username || '@unknown';
        }
        
        if (mutualCount) {
            mutualCount.textContent = '0';
        }
        
        if (acceptBtn) {
            acceptBtn.dataset.userId = qrData.userId;
            acceptBtn.dataset.userName = userInfo.displayName || qrData.displayName || 'User';
            acceptBtn.dataset.qrData = JSON.stringify(qrData);
        }
        
        if (friendRequestModal) {
            friendRequestModal.classList.add('active');
        }
    }).catch(error => {
        SafetyGuards.safeLogError('showFriendRequestFromQRReal', 'user_fetch', error);
        
        const requestAvatar = SafetyGuards.safeGetElement('requestAvatar');
        const requestName = SafetyGuards.safeGetElement('requestName');
        const requestUsername = SafetyGuards.safeGetElement('requestUsername');
        const mutualCount = SafetyGuards.safeGetElement('mutualCount');
        const acceptBtn = SafetyGuards.safeGetElement('acceptRequestBtn');
        const friendRequestModal = SafetyGuards.safeGetElement('friendRequestModal');
        
        if (requestAvatar) {
            requestAvatar.innerHTML = `
                <div style="width: 100%; height: 100%; border-radius: 50%; background-color: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                    ${qrData.displayName ? qrData.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
            `;
        }
        
        if (requestName) {
            requestName.textContent = qrData.displayName || 'QR Code User';
        }
        
        if (requestUsername) {
            requestUsername.textContent = qrData.username || '@unknown';
        }
        
        if (mutualCount) {
            mutualCount.textContent = '0';
        }
        
        if (acceptBtn) {
            acceptBtn.dataset.userId = qrData.userId;
            acceptBtn.dataset.userName = qrData.displayName || 'User';
            acceptBtn.dataset.qrData = JSON.stringify(qrData);
        }
        
        if (friendRequestModal) {
            friendRequestModal.classList.add('active');
        }
    });
}

async function fetchUserInfoFromQR(userId) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('fetchUserInfoFromQR', 'session_check', 
                                     new Error('Invalid session, cannot fetch user info'));
            throw new Error('No valid token');
        }
        
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
        SafetyGuards.safeLogError('fetchUserInfoFromQR', 'api_call', error, { userId });
        throw error;
    }
}

export function stopCameraScanner() {
    scanningActive = false;
    
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    const videoElement = SafetyGuards.safeGetElement('cameraVideo');
    if (videoElement) {
        videoElement.srcObject = null;
    }
}

export async function toggleCamera() {
    try {
        currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
        await startCameraScanner();
    } catch (error) {
        SafetyGuards.safeLogError('toggleCamera', 'toggle', error);
    }
}

export function toggleFlash() {
    if (!cameraStream) return;
    
    try {
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
        
        const flashBtn = SafetyGuards.safeGetElement('toggleFlashBtn');
        if (flashBtn) {
            flashBtn.innerHTML = flashOn ? 
                '<i class="fas fa-lightbulb"></i> Flash On' : 
                '<i class="far fa-lightbulb"></i> Flash Off';
            flashBtn.style.backgroundColor = flashOn ? 'var(--warning-color)' : 'var(--primary-color)';
        }
        
        showNotification(flashOn ? 'Flash turned on' : 'Flash turned off', 'info');
    } catch (error) {
        SafetyGuards.safeLogError('toggleFlash', 'toggle', error);
    }
}

// =============================================
// QR CODE GENERATION FUNCTIONS
// =============================================

export function generateUniqueQRCode() {
    try {
        const qrContainer = SafetyGuards.safeGetElement('qrCodeContainer');
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
            SafetyGuards.safeLogError('generateUniqueQRCode', 'qr_generation', qrError);
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
        SafetyGuards.safeLogError('generateUniqueQRCode', 'generation', error);
        const qrContainer = SafetyGuards.safeGetElement('qrCodeContainer');
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
    try {
        const secret = 'knecta_secret_2024';
        const data = userId + username + Date.now();
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    } catch (error) {
        SafetyGuards.safeLogError('generateVerificationHash', 'generation', error);
        return 'error';
    }
}

// =============================================
// MUTUAL FRIENDS FUNCTIONS
// =============================================

export async function showMutualFriends(userId, userName) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('showMutualFriends', 'session_check', 
                                     new Error('Invalid session, cannot show mutual friends'));
            showNotification('Authentication required', 'error');
            return;
        }
        
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
        SafetyGuards.safeLogError('showMutualFriends', 'api_call', error, { userId });
        showNotification('Error loading mutual friends', 'error');
    }
}

function displayMutualFriendsModal(mutualFriends, userName) {
    try {
        const mutualCountText = SafetyGuards.safeGetElement('mutualCountText');
        const mutualFriendsList = SafetyGuards.safeGetElement('mutualFriendsList');
        const mutualFriendsModal = SafetyGuards.safeGetElement('mutualFriendsModal');
        
        if (!mutualCountText || !mutualFriendsList || !mutualFriendsModal) {
            SafetyGuards.safeLogError('displayMutualFriendsModal', 'elements_not_found', 
                                     new Error('Required modal elements not found'));
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
                        if (typeof showFriendDetails === 'function') {
                            showFriendDetails(friend, 'friend');
                        }
                    } catch (error) {
                        SafetyGuards.safeLogError('displayMutualFriendsModal', 'click_handler', error);
                    }
                    mutualFriendsModal.classList.remove('active');
                });
                
                mutualFriendsList.appendChild(friendItem);
            });
        }
        
        mutualFriendsModal.classList.add('active');
    } catch (error) {
        SafetyGuards.safeLogError('displayMutualFriendsModal', 'display', error);
    }
}

// =============================================
// FRIEND OPTIONS AND MANAGEMENT FUNCTIONS
// =============================================

export async function togglePinFriend(friendData) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('togglePinFriend', 'session_check', 
                                     new Error('Invalid session, cannot toggle pin'));
            showNotification('Authentication required', 'error');
            return;
        }
        
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
            if (typeof updateCurrentSection === 'function') {
                updateCurrentSection();
            }
            if (typeof updateFriendCounts === 'function') {
                updateFriendCounts();
            }
        } catch (error) {
            SafetyGuards.safeLogError('togglePinFriend', 'ui_update', error);
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            SafetyGuards.safeLogError('togglePinFriend', 'api_call', error, friendData);
            showNotification('Failed to update pin status', 'error');
        }
    }
}

export async function toggleMuteFriend(friendData) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('toggleMuteFriend', 'session_check', 
                                     new Error('Invalid session, cannot toggle mute'));
            showNotification('Authentication required', 'error');
            return;
        }
        
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
            if (typeof updateCurrentSection === 'function') {
                updateCurrentSection();
            }
            if (typeof updateFriendCounts === 'function') {
                updateFriendCounts();
            }
        } catch (error) {
            SafetyGuards.safeLogError('toggleMuteFriend', 'ui_update', error);
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            SafetyGuards.safeLogError('toggleMuteFriend', 'api_call', error, friendData);
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
        SafetyGuards.safeLogError('savePrivateNote', 'save', error, { friendId });
        showNotification('Failed to save note', 'error');
    }
}

export function getLastInteraction(friendId) {
    try {
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
    } catch (error) {
        SafetyGuards.safeLogError('getLastInteraction', 'calculation', error);
        return null;
    }
}

export async function removeFriend(friendData) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('removeFriend', 'session_check', 
                                     new Error('Invalid session, cannot remove friend'));
            showNotification('Authentication required', 'error');
            return;
        }
        
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
                if (typeof updateCurrentSection === 'function') {
                    updateCurrentSection();
                }
                if (typeof updateFriendCounts === 'function') {
                    updateFriendCounts();
                }
            } catch (error) {
                SafetyGuards.safeLogError('removeFriend', 'ui_update', error);
            }
            
            showNotification('Friend removed successfully', 'success');
        } else {
            showNotification('Failed to remove friend', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            SafetyGuards.safeLogError('removeFriend', 'api_call', error, friendData);
            showNotification('Failed to remove friend', 'error');
        }
    }
}

export async function blockUser(friendData) {
    try {
        // Safety: Check session
        if (!SafetyGuards.isSessionValid()) {
            SafetyGuards.safeLogError('blockUser', 'session_check', 
                                     new Error('Invalid session, cannot block user'));
            showNotification('Authentication required', 'error');
            return;
        }
        
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
                if (typeof updateCurrentSection === 'function') {
                    updateCurrentSection();
                }
                if (typeof updateFriendCounts === 'function') {
                    updateFriendCounts();
                }
            } catch (error) {
                SafetyGuards.safeLogError('blockUser', 'ui_update', error);
            }
            
            showNotification('User blocked successfully', 'success');
        } else {
            showNotification('Failed to block user', 'error');
        }
        
    } catch (error) {
        if (error.message !== 'Session expired') {
            SafetyGuards.safeLogError('blockUser', 'api_call', error, friendData);
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
        SafetyGuards.safeLogError('saveFriendsToLocalStorage', 'save', error);
    }
}

// =============================================
// UI UPDATE FUNCTIONS
// =============================================

export function updateUIWithUserData(userData) {
    try {
        currentUser = userData;
        userData = userData;
        
        try {
            if (typeof updateUserDisplayElements === 'function') {
                updateUserDisplayElements(userData);
            }
        } catch (error) {
            SafetyGuards.safeLogError('updateUIWithUserData', 'ui_update', error);
        }
        
        if (userData.id) {
            setTimeout(() => generateUniqueQRCode(), 100);
        }
        
        const event = new CustomEvent('userDataLoaded', {
            detail: { userData: userData, source: dataSource.source }
        });
        window.dispatchEvent(event);
    } catch (error) {
        SafetyGuards.safeLogError('updateUIWithUserData', 'processing', error);
    }
}

function updateUserDisplayElements(userData) {
    // Implementation depends on external UI functions
    // Safety wrapper already applied in updateUIWithUserData
}

export function updateDataSourceIndicator(source) {
    try {
        const indicator = SafetyGuards.safeGetElement('dataSourceIndicator');
        if (!indicator) return;
        
        indicator.className = 'data-source-indicator active';
        indicator.classList.add(source);
        
        const textElement = SafetyGuards.safeGetElement('dataSourceText');
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
        SafetyGuards.safeLogError('updateDataSourceIndicator', 'ui_update', error);
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
        SafetyGuards.safeLogError('attemptCachedDataFallback', 'fallback', error);
        return false;
    }
}

export function initializeMainFunctionality() {
    try {
        hideAuthError();
        
        if (typeof enhancedInitialize === 'function') {
            enhancedInitialize();
        } else {
            initializeOriginalFunctionality();
        }
    } catch (error) {
        SafetyGuards.safeLogError('initializeMainFunctionality', 'initialization', error);
    }
}

function initializeOriginalFunctionality() {
    try {
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
    } catch (error) {
        SafetyGuards.safeLogError('initializeOriginalFunctionality', 'initialization', error);
    }
}

export function showAuthError(message) {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.showAuthError(message);
            return;
        }
        
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        const messageElement = SafetyGuards.safeGetElement('authErrorMessage');
        
        if (overlay && messageElement) {
            messageElement.textContent = message || 'Authentication required';
            overlay.classList.add('active');
        }
    } catch (error) {
        SafetyGuards.safeLogError('showAuthError', 'ui_update', error);
    }
}

export function hideAuthError() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.hideAuthError();
            return;
        }
        
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    } catch (error) {
        SafetyGuards.safeLogError('hideAuthError', 'ui_update', error);
    }
}

export function showReconnectionState() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.showReconnectionState();
            return;
        }
        
        const existingIndicator = SafetyGuards.safeGetElement('reconnectionIndicator');
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
        SafetyGuards.safeLogError('showReconnectionState', 'ui_update', error);
    }
}

export function hideReconnectionState() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.hideReconnectionState();
            return;
        }
        
        const indicator = SafetyGuards.safeGetElement('reconnectionIndicator');
        if (indicator) {
            indicator.remove();
        }
    } catch (error) {
        SafetyGuards.safeLogError('hideReconnectionState', 'ui_update', error);
    }
}

// =============================================
// MISSING FUNCTION WRAPPERS (For functions used elsewhere but not defined here)
// =============================================

// These functions are called in the code but might be defined elsewhere
// Adding thin wrappers to prevent crashes

export function updateCurrentSection() {
    // This function is referenced but might be defined in UI modules
    // Return safely to prevent crashes
    SafetyGuards.safeLogError('updateCurrentSection', 'missing', 
                             new Error('Function not implemented in friend-core.js'));
}

export function updateFriendCounts() {
    // This function is referenced but might be defined in UI modules
    // Return safely to prevent crashes
    SafetyGuards.safeLogError('updateFriendCounts', 'missing', 
                             new Error('Function not implemented in friend-core.js'));
}

export function showFriendDetails(friend, type) {
    // This function is referenced but might be defined in UI modules
    // Return safely to prevent crashes
    SafetyGuards.safeLogError('showFriendDetails', 'missing', 
                             new Error('Function not implemented in friend-core.js'), { friend, type });
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
        requestSessionFromParent,
        handleEnhancedParentMessage,
        updateGlobalStateFromSession,
        bindUIAfterSession,
        // Missing function wrappers
        updateCurrentSection,
        updateFriendCounts,
        showFriendDetails
    };
}

// Initialize SafetyGuards for the module
window.SafetyGuards = SafetyGuards;