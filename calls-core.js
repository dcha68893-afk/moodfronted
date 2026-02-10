// ==================== GLOBAL USER DATA MANAGEMENT ====================
import { 
    secureFetch, 
    getUserToken, 
    getCurrentUser, 
    getApiBaseUrl,
    isAuthenticated,
    logout
} from './js/api.core.js';

export let currentUser = null;
export let userDataLoaded = false;
export let userDataFetchInProgress = false;
export const parentDataTimeout = 3000;
export let parentCommunicationAttempted = false;
export let sessionAuthorityReady = false;
export let parentCoordinator = null;
export let sessionInitialized = false;
export let sessionInitializationLock = false;
export let handshakeComplete = false;
export let reconnectionAttempts = 0;
export const maxReconnectionAttempts = 5;
export const reconnectionDelay = 1000;

// ==================== SECURE HANDSHAKE VARIABLES ====================
export let secureHandshakeInProgress = false;
export let secureSessionValid = false;
export let secureHandshakeTimeout = null;
export let secureHandshakeAttempts = 0;
export const maxHandshakeAttempts = 2;
export const handshakeTimeout = 5000;
export const sessionRetryDelay = 3000;

// ==================== SAFETY GUARDS & LOGGING ====================
const loggedErrors = new Set();
const retryCounters = new Map();
const trustedOrigins = new Set();
const messageDuplicates = new Set();

function logErrorOnce(module, error, context = '') {
    const errorKey = `${module}:${error.message}:${context}`;
    if (!loggedErrors.has(errorKey)) {
        console.warn(`[Calls iframe] ${module} error (logged once):`, error.message, context);
        loggedErrors.add(errorKey);
    }
}

function getRetryCount(key) {
    return retryCounters.get(key) || 0;
}

function incrementRetryCount(key) {
    const count = getRetryCount(key) + 1;
    retryCounters.set(key, count);
    return count;
}

function resetRetryCount(key) {
    retryCounters.delete(key);
}

function canRetry(key, maxRetries = 3) {
    return getRetryCount(key) < maxRetries;
}

function isMessageDuplicate(message) {
    const messageKey = JSON.stringify(message);
    if (messageDuplicates.has(messageKey)) {
        return true;
    }
    messageDuplicates.add(messageKey);
    setTimeout(() => messageDuplicates.delete(messageKey), 1000);
    return false;
}

// ==================== PARENT COORDINATION CONTROLLER ====================
export class ParentCoordinator {
    constructor() {
        this.parentDetected = false;
        this.sameOrigin = false;
        this.secureChannelEstablished = false;
        this.sessionData = null;
        this.sessionValidated = false;
        this.handshakeInProgress = false;
        this.handshakeComplete = false;
        this.reconnectionTimer = null;
        this.messageHandlers = new Map();
        this.pendingRequests = new Map();
        this.lastHeartbeat = 0;
        this.heartbeatInterval = null;
        this.initializationLock = false;
        this.fallbackState = 'waiting';
        this.sessionUpdateCallbacks = [];
        this.uiBindings = [];
        this.sessionWaitingLogged = false;
        this.secureSessionValid = false;
        this.secureHandshakeRequested = false;
        this.messageRetryCounts = new Map();
        this.maxMessageRetries = 3;
    }
    
    async initialize() {
        try {
            console.info('[Calls iframe] Initializing parent coordination...');
            
            this.detectParent();
            
            if (!this.parentDetected) {
                console.warn('[Calls iframe] No parent window detected');
                this.setFallbackState('unavailable');
                return;
            }
            
            if (!this.sameOrigin) {
                console.warn('[Calls iframe] Cross-origin parent detected, limited functionality');
                this.setFallbackState('reconnecting');
            }
            
            this.establishMessagingChannel();
            
            // Start secure handshake protocol
            this.startSecureHandshake();
            
            this.startHeartbeat();
            
            this.setupResynchronization();
        } catch (error) {
            logErrorOnce('ParentCoordinator.initialize', error);
            this.setFallbackState('unavailable');
        }
    }
    
    detectParent() {
        try {
            this.parentDetected = !!(window.parent && window.parent !== window);
            
            if (this.parentDetected) {
                try {
                    this.sameOrigin = window.location.origin === window.parent.location.origin;
                    console.info(`[Calls iframe] Parent detected, same-origin: ${this.sameOrigin}`);
                    
                    if (this.sameOrigin) {
                        trustedOrigins.add(window.location.origin);
                    }
                } catch (error) {
                    console.info('[Calls iframe] Cross-origin parent detected');
                    this.sameOrigin = false;
                }
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.detectParent', error);
            this.parentDetected = false;
            this.sameOrigin = false;
        }
    }
    
    establishMessagingChannel() {
        try {
            window.addEventListener('message', this.handleParentMessage.bind(this));
            console.info('[Calls iframe] Secure messaging channel established');
            this.secureChannelEstablished = true;
        } catch (error) {
            logErrorOnce('ParentCoordinator.establishMessagingChannel', error);
            this.secureChannelEstablished = false;
        }
    }
    
    handleParentMessage(event) {
        if (!this.isValidOrigin(event.origin)) {
            console.warn('[Calls iframe] Message from unauthorized origin:', event.origin);
            return;
        }
        
        const data = event.data;
        
        if (!data || typeof data !== 'object') {
            console.warn('[Calls iframe] Invalid message data');
            return;
        }
        
        try {
            if (this.messageHandlers.has(data.type)) {
                this.messageHandlers.get(data.type)(data);
            } else {
                this.handleDefaultMessage(data);
            }
            
            if (data.requestId && this.pendingRequests.has(data.requestId)) {
                const { resolve, reject } = this.pendingRequests.get(data.requestId);
                if (data.success !== false) {
                    resolve(data);
                } else {
                    reject(new Error(data.error || 'Request failed'));
                }
                this.pendingRequests.delete(data.requestId);
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.handleParentMessage', error, `type: ${data?.type}`);
        }
    }
    
    isValidOrigin(origin) {
        if (trustedOrigins.has(origin)) return true;
        if (origin === window.location.origin) return true;
        
        // Allow localhost for development
        if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
            trustedOrigins.add(origin);
            return true;
        }
        
        try {
            const parentHost = window.location.hostname;
            const originHost = new URL(origin).hostname;
            
            const isValid = originHost === parentHost || 
                           originHost.endsWith('.' + parentHost) ||
                           parentHost.endsWith('.' + originHost);
            
            if (isValid) {
                trustedOrigins.add(origin);
            }
            
            return isValid;
        } catch (error) {
            return false;
        }
    }
    
    // ==================== SECURE HANDSHAKE PROTOCOL ====================
    startSecureHandshake() {
        if (secureHandshakeInProgress || this.secureSessionValid) {
            console.info('[Calls iframe] Secure handshake already in progress or complete');
            return;
        }
        
        const retryKey = 'secureHandshake';
        if (!canRetry(retryKey, maxHandshakeAttempts)) {
            console.warn('[Calls iframe] Max secure handshake retries reached');
            return;
        }
        
        secureHandshakeInProgress = true;
        this.secureHandshakeRequested = true;
        secureHandshakeAttempts = incrementRetryCount(retryKey);
        
        console.info(`[Calls iframe] Starting secure handshake protocol (attempt ${secureHandshakeAttempts}/${maxHandshakeAttempts})...`);
        this.requestSecureSession();
    }
    
    requestSecureSession() {
        if (!this.parentDetected || !window.parent) {
            console.warn('[Calls iframe] Cannot request secure session - no parent detected');
            this.handleSecureHandshakeFailure('No parent window');
            return;
        }
        
        if (secureHandshakeAttempts >= maxHandshakeAttempts) {
            console.warn('[Calls iframe] Max secure handshake attempts reached');
            this.handleSecureHandshakeFailure('Max attempts reached');
            return;
        }
        
        if (secureHandshakeAttempts === 1) {
            console.info('[Calls iframe] ⏳ Waiting for secure session from parent...');
        } else {
            console.info(`[Calls iframe] ⏳ Retrying secure session request (attempt ${secureHandshakeAttempts}/${maxHandshakeAttempts})...`);
        }
        
        // Clear any existing timeout
        if (secureHandshakeTimeout) {
            clearTimeout(secureHandshakeTimeout);
            secureHandshakeTimeout = null;
        }
        
        const requestId = 'secure_session_req_' + Date.now();
        
        const message = {
            type: 'REQUEST_SESSION',
            source: 'calls-iframe',
            requestId: requestId,
            timestamp: Date.now(),
            version: '1.0',
            secure: true,
            iframeId: this.getIframeId()
        };
        
        if (!this.sendToParent(message)) {
            this.handleSecureHandshakeFailure('Failed to send request');
            return;
        }
        
        // Set timeout for handshake response
        secureHandshakeTimeout = setTimeout(() => {
            if (!this.secureSessionValid) {
                console.warn(`[Calls iframe] ⚠️ Secure session request timeout (attempt ${secureHandshakeAttempts})`);
                if (secureHandshakeAttempts < maxHandshakeAttempts) {
                    console.info('[Calls iframe] Will retry secure handshake...');
                    setTimeout(() => this.requestSecureSession(), sessionRetryDelay);
                } else {
                    this.handleSecureHandshakeFailure('Handshake timeout');
                }
            }
        }, handshakeTimeout);
    }
    
    handleSecureHandshakeFailure(reason) {
        console.warn(`[Calls iframe] ❌ Secure handshake failed: ${reason}`);
        secureHandshakeInProgress = false;
        this.secureHandshakeRequested = false;
        
        // Fall back to legacy handshake if secure handshake fails
        if (!this.handshakeComplete) {
            console.info('[Calls iframe] Falling back to legacy handshake protocol...');
            this.initiateHandshake();
        }
    }
    
    handleSecureSessionData(sessionData) {
        if (!sessionData || typeof sessionData !== 'object') {
            console.warn('[Calls iframe] Invalid session data received');
            return;
        }
        
        // Validate session data structure
        if (!this.validateSecureSessionSchema(sessionData)) {
            console.warn('[Calls iframe] ❌ Received invalid secure session from parent');
            this.handleSecureHandshakeFailure('Invalid session schema');
            return;
        }
        
        // Verify source
        if (!this.verifySessionSource(sessionData)) {
            console.warn('[Calls iframe] ❌ Session source verification failed');
            this.handleSecureHandshakeFailure('Source verification failed');
            return;
        }
        
        // Clear timeout
        if (secureHandshakeTimeout) {
            clearTimeout(secureHandshakeTimeout);
            secureHandshakeTimeout = null;
        }
        
        this.sessionData = sessionData;
        this.sessionValidated = true;
        this.secureSessionValid = true;
        secureHandshakeInProgress = false;
        this.handshakeComplete = true;
        this.handshakeInProgress = false;
        
        resetRetryCount('secureHandshake');
        
        console.info('[Calls iframe] ✅ Secure session received and validated successfully');
        
        this.setFallbackState('connected');
        
        this.updateGlobalStateFromSession();
        
        this.bindUIAfterSessionConfirmation();
        
        const confirmMessage = {
            type: 'SESSION_CONSUMED',
            source: 'calls-iframe',
            timestamp: Date.now(),
            sessionId: sessionData.sessionId,
            userId: sessionData.user?.id,
            secure: true
        };
        
        if (!this.sendToParent(confirmMessage)) {
            console.warn('[Calls iframe] Failed to send session confirmation');
        }
        
        console.info('[Calls iframe] Secure session data consumed successfully');
    }
    
    validateSecureSessionSchema(sessionData) {
        if (!sessionData || typeof sessionData !== 'object') {
            console.warn('[Calls iframe] Session data is not an object');
            return false;
        }
        
        // Required fields for secure session
        const requiredFields = ['sessionId', 'timestamp', 'token', 'user'];
        for (const field of requiredFields) {
            if (!sessionData.hasOwnProperty(field)) {
                console.warn(`[Calls iframe] Missing required field: ${field}`);
                return false;
            }
        }
        
        // Validate user object
        if (!sessionData.user || !sessionData.user.id || !sessionData.user.username) {
            console.warn('[Calls iframe] Invalid user data in secure session');
            return false;
        }
        
        // Validate token
        if (typeof sessionData.token !== 'string' || sessionData.token.length < 10) {
            console.warn('[Calls iframe] Invalid token in secure session');
            return false;
        }
        
        // Validate authenticated flag
        if (sessionData.authenticated !== undefined && typeof sessionData.authenticated !== 'boolean') {
            console.warn('[Calls iframe] Invalid authenticated field');
            return false;
        }
        
        return true;
    }
    
    verifySessionSource(sessionData) {
        // Check for source verification token or signature
        if (sessionData.sourceVerification) {
            // Implement source verification logic here
            // This could be a signature, token, or other verification method
            console.info('[Calls iframe] Source verification present, would validate here');
        }
        
        // For now, accept sessions from validated origins only
        return true;
    }
    
    getIframeId() {
        // Generate or retrieve iframe identifier
        try {
            const iframeId = localStorage.getItem('calls_iframe_id');
            if (!iframeId) {
                const newId = 'iframe_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('calls_iframe_id', newId);
                return newId;
            }
            return iframeId;
        } catch (error) {
            return 'iframe_' + Date.now();
        }
    }
    
    async initiateHandshake() {
        if (this.handshakeInProgress || this.handshakeComplete) {
            console.info('[Calls iframe] Handshake already in progress or complete');
            return;
        }
        
        this.handshakeInProgress = true;
        this.setFallbackState('waiting');
        
        console.info('[Calls iframe] Starting handshake protocol...');
        
        const message = {
            type: 'CHILD_READY',
            source: 'calls-iframe',
            timestamp: Date.now(),
            version: '1.0',
            capabilities: ['session_management', 'ui_coordination', 'api_routing']
        };
        
        if (!this.sendToParent(message)) {
            console.warn('[Calls iframe] Failed to send CHILD_READY');
            this.handshakeInProgress = false;
            return;
        }
        
        await this.requestSessionWithBackoff();
    }
    
    async requestSessionWithBackoff() {
        const retryKey = 'sessionRequest';
        if (!canRetry(retryKey, 5)) {
            console.warn('[Calls iframe] Max session request attempts reached');
            this.setFallbackState('unavailable');
            this.handshakeInProgress = false;
            return;
        }
        
        let attempt = getRetryCount(retryKey);
        const maxAttempts = 5;
        const baseDelay = 1000;
        
        while (attempt < maxAttempts && !this.handshakeComplete) {
            attempt = incrementRetryCount(retryKey);
            const delay = baseDelay * Math.pow(2, attempt - 1);
            
            console.info(`[Calls iframe] Requesting session (attempt ${attempt}/${maxAttempts})...`);
            
            const message = {
                type: 'REQUEST_SESSION',
                source: 'calls-iframe',
                timestamp: Date.now(),
                attempt: attempt,
                requestId: 'session_req_' + Date.now()
            };
            
            if (!this.sendToParent(message)) {
                console.warn(`[Calls iframe] Failed to send session request (attempt ${attempt})`);
            }
            
            await new Promise(resolve => {
                const timeoutId = setTimeout(() => {
                    console.info(`[Calls iframe] Session request timeout (attempt ${attempt})`);
                    resolve();
                }, delay);
                
                const checkInterval = setInterval(() => {
                    if (this.handshakeComplete) {
                        clearTimeout(timeoutId);
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
        }
        
        if (!this.handshakeComplete) {
            console.error('[Calls iframe] Handshake failed after maximum attempts');
            this.setFallbackState('unavailable');
            this.handshakeInProgress = false;
        }
    }
    
    sendToParent(message, targetOrigin = '*') {
        if (!this.parentDetected || !window.parent) {
            console.warn('[Calls iframe] Cannot send message - no parent detected');
            return false;
        }
        
        if (!message || typeof message !== 'object') {
            console.warn('[Calls iframe] Invalid message object');
            return false;
        }
        
        if (isMessageDuplicate(message)) {
            console.warn('[Calls iframe] Duplicate message detected, skipping');
            return false;
        }
        
        const retryKey = `sendMessage:${message.type}`;
        const retryCount = getRetryCount(retryKey);
        
        if (retryCount >= this.maxMessageRetries) {
            console.warn(`[Calls iframe] Max retries reached for message type: ${message.type}`);
            return false;
        }
        
        try {
            message.source = message.source || 'calls-iframe';
            message.timestamp = message.timestamp || Date.now();
            
            window.parent.postMessage(message, targetOrigin);
            
            if (retryCount > 0) {
                resetRetryCount(retryKey);
            }
            
            return true;
        } catch (error) {
            incrementRetryCount(retryKey);
            logErrorOnce('ParentCoordinator.sendToParent', error, `type: ${message.type}, retry: ${retryCount + 1}`);
            
            if (retryCount < this.maxMessageRetries - 1) {
                setTimeout(() => this.sendToParent(message, targetOrigin), 1000 * (retryCount + 1));
            }
            
            return false;
        }
    }
    
    sendWithResponse(message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (!this.parentDetected) {
                reject(new Error('No parent detected'));
                return;
            }
            
            if (!message || typeof message !== 'object') {
                reject(new Error('Invalid message'));
                return;
            }
            
            const requestId = 'req_' + Date.now();
            message.requestId = requestId;
            
            this.pendingRequests.set(requestId, { resolve, reject });
            
            if (!this.sendToParent(message)) {
                this.pendingRequests.delete(requestId);
                reject(new Error('Failed to send message'));
                return;
            }
            
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Request timeout'));
                }
            }, timeout);
        });
    }
    
    handleSessionData(sessionData) {
        if (!sessionData || typeof sessionData !== 'object') {
            console.warn('[Calls iframe] Invalid session data received');
            return;
        }
        
        console.info('[Calls iframe] Received SESSION_DATA');
        
        if (!this.validateSessionSchema(sessionData)) {
            console.error('[Calls iframe] Invalid session schema');
            const errorMessage = {
                type: 'SESSION_ERROR',
                source: 'calls-iframe',
                error: 'Invalid session schema',
                timestamp: Date.now()
            };
            this.sendToParent(errorMessage);
            return;
        }
        
        this.sessionData = sessionData;
        this.sessionValidated = true;
        
        this.handshakeComplete = true;
        this.handshakeInProgress = false;
        this.setFallbackState('connected');
        
        this.updateGlobalStateFromSession();
        
        this.bindUIAfterSessionConfirmation();
        
        const confirmMessage = {
            type: 'SESSION_CONSUMED',
            source: 'calls-iframe',
            timestamp: Date.now(),
            sessionId: sessionData.sessionId,
            userId: sessionData.user?.id
        };
        
        if (!this.sendToParent(confirmMessage)) {
            console.warn('[Calls iframe] Failed to send session confirmation');
        }
        
        console.info('[Calls iframe] Session data consumed successfully');
    }
    
    validateSessionSchema(sessionData) {
        if (!sessionData || typeof sessionData !== 'object') {
            return false;
        }
        
        const requiredFields = ['sessionId', 'timestamp'];
        for (const field of requiredFields) {
            if (!sessionData.hasOwnProperty(field)) {
                console.warn(`[Calls iframe] Missing required field: ${field}`);
                return false;
            }
        }
        
        if (sessionData.user) {
            if (!sessionData.user.id || !sessionData.user.username) {
                console.warn('[Calls iframe] Invalid user data in session');
                return false;
            }
        }
        
        if (sessionData.authenticated !== undefined && typeof sessionData.authenticated !== 'boolean') {
            console.warn('[Calls iframe] Invalid authenticated field');
            return false;
        }
        
        return true;
    }
    
    updateGlobalStateFromSession() {
        if (!this.sessionData) {
            console.warn('[Calls iframe] No session data available');
            return;
        }
        
        // Add defensive guard for session data
        if (!this.sessionData.token) {
            // Log only once per session initialization to prevent spam
            if (!this.sessionWaitingLogged) {
                console.info('[Calls iframe] Session token not ready, waiting...');
                this.sessionWaitingLogged = true;
            }
            return; // Skip processing until session is ready
        }
        
        // Reset the waiting flag since we have a valid session
        this.sessionWaitingLogged = false;
        
        if (this.sessionData.user) {
            try {
                currentUser = this.sessionData.user;
                userDataLoaded = true;
                
                if (window.AppState) {
                    window.AppState.user = this.sessionData.user;
                    window.AppState.currentUser = this.sessionData.user;
                    window.AppState.isAuthenticated = this.sessionData.authenticated || false;
                }
            } catch (error) {
                logErrorOnce('ParentCoordinator.updateGlobalStateFromSession.user', error);
            }
        }
        
        if (this.sessionData.authenticated !== undefined) {
            try {
                sessionAuthorityReady = this.sessionData.authenticated;
                
                if (!this.sessionData.authenticated) {
                    this.handleLogout();
                }
            } catch (error) {
                logErrorOnce('ParentCoordinator.updateGlobalStateFromSession.auth', error);
            }
        }
        
        if (this.sessionData.token) {
            try {
                this.handleTokenUpdate(this.sessionData.token);
            } catch (error) {
                logErrorOnce('ParentCoordinator.updateGlobalStateFromSession.token', error);
            }
        }
        
        if (this.sessionData.apiConfig) {
            try {
                this.handleApiConfigUpdate(this.sessionData.apiConfig);
            } catch (error) {
                logErrorOnce('ParentCoordinator.updateGlobalStateFromSession.apiConfig', error);
            }
        }
    }
    
    bindUIAfterSessionConfirmation() {
        if (!this.sessionValidated) {
            console.warn('[Calls iframe] Cannot bind UI - session not validated');
            return;
        }
        
        if (!currentUser) {
            console.warn('[Calls iframe] Cannot bind UI - no user data');
            return;
        }
        
        console.info('[Calls iframe] Binding UI with session data...');
        
        this.uiBindings.forEach(binding => {
            try {
                binding();
            } catch (error) {
                logErrorOnce('ParentCoordinator.bindUIAfterSessionConfirmation.binding', error);
            }
        });
        
        try {
            this.updateUIWithSessionData();
            this.enableProtectedUI();
            console.info('[Calls iframe] UI binding complete');
        } catch (error) {
            logErrorOnce('ParentCoordinator.bindUIAfterSessionConfirmation.ui', error);
        }
    }
    
    updateUIWithSessionData() {
        if (!currentUser) return;
        
        try {
            const userElements = {
                'userAvatar': currentUser.avatar,
                'userName': currentUser.name || currentUser.username,
                'userStatus': currentUser.status || 'Online'
            };
            
            this.updateUserSpecificUI(userElements);
            this.updateApiStatusIndicator();
            this.updateSyncIndicator();
        } catch (error) {
            logErrorOnce('ParentCoordinator.updateUIWithSessionData', error);
        }
    }
    
    updateUserSpecificUI(userElements) {
        if (!userElements) return;
        
        try {
            document.querySelectorAll('.user-avatar, .avatar-img').forEach(el => {
                if (userElements.userAvatar) {
                    if (el.tagName === 'IMG') {
                        el.src = userElements.userAvatar;
                        el.alt = userElements.userName;
                    } else {
                        el.style.backgroundImage = `url(${userElements.userAvatar})`;
                    }
                }
            });
            
            document.querySelectorAll('.user-name, .username').forEach(el => {
                if (el.textContent.includes('User') || el.textContent.includes('Loading')) {
                    el.textContent = userElements.userName;
                }
            });
            
            const callStatusText = document.getElementById('callStatusText');
            if (callStatusText && callStatusText.textContent.includes('Waiting for API')) {
                callStatusText.textContent = `Ready (${userElements.userName})`;
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.updateUserSpecificUI', error);
        }
    }
    
    updateApiStatusIndicator() {
        try {
            const apiStatusIndicator = document.getElementById('apiStatusIndicator');
            const apiStatusText = document.getElementById('apiStatusText');
            
            if (apiStatusIndicator && apiStatusText) {
                apiStatusIndicator.className = 'api-status-indicator connected';
                apiStatusText.textContent = `Authenticated as ${currentUser?.name || currentUser?.username || 'User'}`;
                
                setTimeout(() => {
                    apiStatusIndicator.style.display = 'none';
                }, 2000);
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.updateApiStatusIndicator', error);
        }
    }
    
    updateSyncIndicator() {
        try {
            const syncIndicator = document.getElementById('syncIndicator');
            if (syncIndicator) {
                syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                syncIndicator.classList.remove('syncing');
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.updateSyncIndicator', error);
        }
    }
    
    enableProtectedUI() {
        if (!this.sessionValidated || !currentUser) {
            console.warn('[Calls iframe] Cannot enable protected UI - session not validated');
            return;
        }
        
        console.info('[Calls iframe] Enabling protected UI features...');
        
        try {
            const newCallBtn = document.getElementById('newCallBtn');
            if (newCallBtn) newCallBtn.disabled = false;
            
            const quickVoiceBtn = document.getElementById('quickVoiceBtn');
            const quickVideoBtn = document.getElementById('quickVideoBtn');
            if (quickVoiceBtn) quickVoiceBtn.disabled = false;
            if (quickVideoBtn) quickVideoBtn.disabled = false;
            
            this.loadUserSpecificData();
        } catch (error) {
            logErrorOnce('ParentCoordinator.enableProtectedUI', error);
        }
    }
    
    async loadUserSpecificData() {
        if (!currentUser || !userDataLoaded) return;
        
        console.info('[Calls iframe] Loading user-specific data through parent coordination...');
        
        try {
            await this.routeApiCall('/api/contacts', 'GET');
            await this.routeApiCall('/api/calls/history', 'GET');
            
            if (window.callAPI) {
                await window.callAPI.performInitialDataLoad();
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.loadUserSpecificData', error);
        }
    }
    
    async routeApiCall(endpoint, method = 'GET', data = null) {
        if (!this.sessionValidated) {
            throw new Error('Cannot route API call - session not validated');
        }
        
        try {
            if (window.parent && window.parent.api && window.parent.api.request) {
                return await window.parent.api.request(endpoint, method, data);
            }
            
            if (window.parent && window.parent.app && window.parent.app.core) {
                return await window.parent.app.core.request(endpoint, method, data);
            }
            
            const response = await this.sendWithResponse({
                type: 'API_REQUEST',
                source: 'calls-iframe',
                endpoint: endpoint,
                method: method,
                data: data,
                timestamp: Date.now()
            });
            
            return response.data;
        } catch (error) {
            logErrorOnce('ParentCoordinator.routeApiCall', error);
            throw error;
        }
    }
    
    handleSessionUpdate(updateData) {
        if (!updateData || typeof updateData !== 'object') {
            console.warn('[Calls iframe] Invalid session update data');
            return;
        }
        
        console.info('[Calls iframe] Received SESSION_UPDATE');
        
        try {
            if (updateData.sessionData) {
                this.sessionData = { ...this.sessionData, ...updateData.sessionData };
            }
            
            if (updateData.user) {
                currentUser = { ...currentUser, ...updateData.user };
                
                if (window.AppState) {
                    window.AppState.user = currentUser;
                    window.AppState.currentUser = currentUser;
                }
                
                this.updateUIWithSessionData();
            }
            
            this.sessionUpdateCallbacks.forEach(callback => {
                try {
                    callback(updateData);
                } catch (error) {
                    logErrorOnce('ParentCoordinator.handleSessionUpdate.callback', error);
                }
            });
            
            console.info('[Calls iframe] Session updated successfully');
        } catch (error) {
            logErrorOnce('ParentCoordinator.handleSessionUpdate', error);
        }
    }
    
    handleLogout() {
        console.info('[Calls iframe] Logout received from parent coordination');
        
        try {
            currentUser = null;
            userDataLoaded = false;
            sessionAuthorityReady = false;
            this.sessionValidated = false;
            this.sessionData = null;
            this.sessionWaitingLogged = false;
            this.secureSessionValid = false;
            secureHandshakeInProgress = false;
            this.secureHandshakeRequested = false;
            
            if (window.AppState) {
                window.AppState.user = null;
                window.AppState.currentUser = null;
                window.AppState.isAuthenticated = false;
            }
            
            this.disableProtectedUI();
            this.showReconnectState();
            
            if (window.CallApp) {
                window.CallApp.notifyParent('USER_LOGGED_OUT', {});
            }
            
            console.info('[Calls iframe] Logout handled successfully');
        } catch (error) {
            logErrorOnce('ParentCoordinator.handleLogout', error);
        }
    }
    
    disableProtectedUI() {
        console.info('[Calls iframe] Disabling protected UI...');
        
        try {
            const newCallBtn = document.getElementById('newCallBtn');
            if (newCallBtn) newCallBtn.disabled = true;
            
            const quickVoiceBtn = document.getElementById('quickVoiceBtn');
            const quickVideoBtn = document.getElementById('quickVideoBtn');
            if (quickVoiceBtn) quickVoiceBtn.disabled = true;
            if (quickVideoBtn) quickVideoBtn.disabled = true;
            
            this.showReconnectState();
        } catch (error) {
            logErrorOnce('ParentCoordinator.disableProtectedUI', error);
        }
    }
    
    showReconnectState() {
        try {
            const appContainer = document.getElementById('appContainer');
            if (!appContainer) return;
            
            const existingOverlay = document.querySelector('.reconnect-overlay');
            if (existingOverlay) existingOverlay.remove();
            
            const reconnectOverlay = document.createElement('div');
            reconnectOverlay.className = 'reconnect-overlay';
            reconnectOverlay.innerHTML = `
                <div class="reconnect-message">
                    <i class="fas fa-sync-alt"></i>
                    <h3>Session Update Required</h3>
                    <p>Your session has been updated. Please wait for reconnection...</p>
                    <div class="reconnect-progress">
                        <div class="reconnect-progress-bar"></div>
                    </div>
                    <button id="retryReconnectBtn" class="quick-action-btn">
                        <i class="fas fa-redo"></i> Retry Connection
                    </button>
                </div>
            `;
            
            appContainer.appendChild(reconnectOverlay);
            
            const retryBtn = document.getElementById('retryReconnectBtn');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                    this.startSecureHandshake();
                });
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.showReconnectState', error);
        }
    }
    
    handleTokenUpdate(tokenData) {
        if (!tokenData || typeof tokenData !== 'object') {
            console.warn('[Calls iframe] Invalid token data received');
            return;
        }
        
        console.info('[Calls iframe] Received token update from parent coordination');
        
        if (!tokenData.token) {
            console.warn('[Calls iframe] No token in token data');
            return;
        }
        
        try {
            if (window.callAPI && window.callAPI.tokenManager) {
                window.callAPI.tokenManager.setToken(tokenData.token);
            }
            
            if (this.sessionData) {
                this.sessionData.token = tokenData.token;
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.handleTokenUpdate', error);
        }
    }
    
    handleApiConfigUpdate(apiConfig) {
        if (!apiConfig || typeof apiConfig !== 'object') {
            console.warn('[Calls iframe] Invalid API config received');
            return;
        }
        
        console.info('[Calls iframe] Received API config update');
        
        try {
            if (window.callAPI) {
                window.callAPI.apiConfig = { ...window.callAPI.apiConfig, ...apiConfig };
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.handleApiConfigUpdate', error);
        }
    }
    
    handleDefaultMessage(data) {
        if (!data || typeof data !== 'object') {
            console.warn('[Calls iframe] Invalid message data');
            return;
        }
        
        try {
            switch (data.type) {
                case 'SESSION_DATA':
                    // Check if this is a secure session response
                    if (this.secureHandshakeRequested && data.token && data.user) {
                        this.handleSecureSessionData(data.payload || data);
                    } else {
                        this.handleSessionData(data.payload || data);
                    }
                    break;
                case 'SESSION_UPDATE':
                    this.handleSessionUpdate(data.payload || data);
                    break;
                case 'LOGOUT':
                    this.handleLogout();
                    break;
                case 'TOKEN_UPDATE':
                    this.handleTokenUpdate(data.payload || data);
                    break;
                case 'API_READY':
                    this.handleApiReady();
                    break;
                case 'HEARTBEAT_RESPONSE':
                    this.handleHeartbeatResponse();
                    break;
                case 'CHILD_READY_ACK':
                    this.handleChildReadyAck();
                    break;
                case 'SESSION_REQUEST_ACK':
                    this.handleSessionRequestAck();
                    break;
                case 'SECURE_SESSION':
                    // Handle explicitly secure session
                    this.handleSecureSessionData(data.payload || data);
                    break;
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.handleDefaultMessage', error, `type: ${data.type}`);
        }
    }
    
    registerMessageHandler(type, handler) {
        try {
            this.messageHandlers.set(type, handler);
        } catch (error) {
            logErrorOnce('ParentCoordinator.registerMessageHandler', error);
        }
    }
    
    registerUIBinding(binding) {
        try {
            this.uiBindings.push(binding);
        } catch (error) {
            logErrorOnce('ParentCoordinator.registerUIBinding', error);
        }
    }
    
    registerSessionUpdateCallback(callback) {
        try {
            this.sessionUpdateCallbacks.push(callback);
        } catch (error) {
            logErrorOnce('ParentCoordinator.registerSessionUpdateCallback', error);
        }
    }
    
    startHeartbeat() {
        try {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            
            this.heartbeatInterval = setInterval(() => {
                this.sendHeartbeat();
            }, 30000);
            
            setTimeout(() => this.sendHeartbeat(), 5000);
        } catch (error) {
            logErrorOnce('ParentCoordinator.startHeartbeat', error);
        }
    }
    
    sendHeartbeat() {
        if (!this.parentDetected || !this.secureChannelEstablished) {
            return;
        }
        
        const heartbeatMessage = {
            type: 'HEARTBEAT',
            source: 'calls-iframe',
            timestamp: Date.now(),
            sessionId: this.sessionData?.sessionId
        };
        
        if (!this.sendToParent(heartbeatMessage)) {
            console.warn('[Calls iframe] Failed to send heartbeat');
        }
        
        this.lastHeartbeat = Date.now();
    }
    
    handleHeartbeatResponse() {
        this.lastHeartbeat = Date.now();
    }
    
    handleChildReadyAck() {
        console.info('[Calls iframe] CHILD_READY acknowledged by parent');
    }
    
    handleSessionRequestAck() {
        console.info('[Calls iframe] SESSION_REQUEST acknowledged by parent');
    }
    
    handleApiReady() {
        console.info('[Calls iframe] Parent API ready signal received');
        
        try {
            if (window.AppState) {
                window.AppState.apiReady = true;
            }
            
            setTimeout(() => {
                if (window.callAPI && window.callAPI.tokenManager) {
                    window.callAPI.tokenManager.tryGetTokenFromAPI();
                }
            }, 100);
        } catch (error) {
            logErrorOnce('ParentCoordinator.handleApiReady', error);
        }
    }
    
    setFallbackState(state) {
        this.fallbackState = state;
        
        try {
            switch (state) {
                case 'waiting':
                    this.showWaitingState();
                    break;
                case 'reconnecting':
                    this.showReconnectingState();
                    break;
                case 'unavailable':
                    this.showUnavailableState();
                    break;
                case 'connected':
                    this.hideFallbackState();
                    break;
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.setFallbackState', error);
        }
    }
    
    showWaitingState() {
        console.info('[Calls iframe] Showing waiting state for parent coordination');
    }
    
    showReconnectingState() {
        console.info('[Calls iframe] Showing reconnecting state');
        this.showReconnectState();
    }
    
    showUnavailableState() {
        console.info('[Calls iframe] Parent coordination unavailable');
        
        try {
            const appContainer = document.getElementById('appContainer');
            if (!appContainer) return;
            
            document.querySelectorAll('.reconnect-overlay, .unavailable-overlay').forEach(el => el.remove());
            
            const unavailableOverlay = document.createElement('div');
            unavailableOverlay.className = 'unavailable-overlay';
            unavailableOverlay.innerHTML = `
                <div class="unavailable-message">
                    <i class="fas fa-unlink"></i>
                    <h3>Connection Required</h3>
                    <p>This feature requires connection to the main application.</p>
                    <p>Please return to the main app and try again.</p>
                    <button id="refreshPageBtn" class="quick-action-btn">
                        <i class="fas fa-redo"></i> Refresh Page
                    </button>
                </div>
            `;
            
            appContainer.appendChild(unavailableOverlay);
            
            const refreshBtn = document.getElementById('refreshPageBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    location.reload();
                });
            }
        } catch (error) {
            logErrorOnce('ParentCoordinator.showUnavailableState', error);
        }
    }
    
    hideFallbackState() {
        try {
            document.querySelectorAll('.reconnect-overlay, .unavailable-overlay').forEach(el => el.remove());
        } catch (error) {
            logErrorOnce('ParentCoordinator.hideFallbackState', error);
        }
    }
    
    setupResynchronization() {
        try {
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this.parentDetected) {
                    this.checkParentConnection();
                }
            });
            
            window.addEventListener('online', () => {
                if (this.parentDetected) {
                    this.checkParentConnection();
                }
            });
        } catch (error) {
            logErrorOnce('ParentCoordinator.setupResynchronization', error);
        }
    }
    
    checkParentConnection() {
        if (!this.handshakeComplete && this.parentDetected) {
            console.info('[Calls iframe] Checking parent connection...');
            this.startSecureHandshake();
        }
    }
    
    cleanup() {
        try {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            
            if (this.reconnectionTimer) {
                clearTimeout(this.reconnectionTimer);
                this.reconnectionTimer = null;
            }
            
            if (secureHandshakeTimeout) {
                clearTimeout(secureHandshakeTimeout);
                secureHandshakeTimeout = null;
            }
            
            this.messageHandlers.clear();
            this.pendingRequests.clear();
            this.uiBindings = [];
            this.sessionUpdateCallbacks = [];
            this.sessionWaitingLogged = false;
        } catch (error) {
            logErrorOnce('ParentCoordinator.cleanup', error);
        }
    }
    
    getStatus() {
        try {
            return {
                parentDetected: this.parentDetected,
                sameOrigin: this.sameOrigin,
                secureChannelEstablished: this.secureChannelEstablished,
                handshakeComplete: this.handshakeComplete,
                sessionValidated: this.sessionValidated,
                fallbackState: this.fallbackState,
                secureSessionValid: this.secureSessionValid,
                secureHandshakeInProgress: secureHandshakeInProgress,
                sessionData: this.sessionData ? { ...this.sessionData, token: '***' } : null
            };
        } catch (error) {
            logErrorOnce('ParentCoordinator.getStatus', error);
            return {
                parentDetected: false,
                sameOrigin: false,
                secureChannelEstablished: false,
                handshakeComplete: false,
                sessionValidated: false,
                fallbackState: 'error',
                secureSessionValid: false,
                secureHandshakeInProgress: false,
                sessionData: null
            };
        }
    }
}

// ==================== UPDATED PARENT-CHILD COMMUNICATION SYSTEM ====================
export class ParentChildCommunication {
    constructor() {
        this.parentDataReceived = false;
        this.directFetchInProgress = false;
        this.parentResponseTimeout = null;
        this.dataFetchLock = false;
        this.authVerified = false;
        this.parentOrigin = window.location.origin;
        this.parentCoordinator = null;
    }
    
    async initialize() {
        try {
            console.info('[Calls iframe] Initializing parent-child communication with coordination...');
            
            if (!parentCoordinator) {
                console.info('[Calls iframe] Parent coordinator not yet available, waiting...');
                await this.waitForParentCoordinator();
            }
            
            this.parentCoordinator = parentCoordinator;
            
            this.setupLegacyMessageListener();
            
            if (this.parentCoordinator && this.parentCoordinator.handshakeComplete) {
                console.info('[Calls iframe] Parent coordinator handshake already complete');
            } else {
                this.requestDataFromParent();
            }
            
            this.startParentResponseTimeout();
            
            this.loadCachedUserData();
            
            this.registerWithCoordinator();
            
            console.info('[Calls iframe] Parent-child communication initialized');
        } catch (error) {
            logErrorOnce('ParentChildCommunication.initialize', error);
        }
    }
    
    async waitForParentCoordinator() {
        const maxWaitTime = 5000;
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (parentCoordinator || Date.now() - startTime > maxWaitTime) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }
    
    registerWithCoordinator() {
        if (!this.parentCoordinator) {
            console.warn('[Calls iframe] Cannot register with coordinator - not available');
            return;
        }
        
        try {
            this.parentCoordinator.registerMessageHandler('USER_DATA', (data) => {
                this.handleParentUserData(data.payload || data);
            });
            
            this.parentCoordinator.registerMessageHandler('AUTH_UPDATE', (data) => {
                this.handleAuthUpdate(data.payload || data);
            });
            
            this.parentCoordinator.registerMessageHandler('PROFILE_UPDATE', (data) => {
                this.handleProfileUpdate(data.payload || data);
            });
            
            this.parentCoordinator.registerUIBinding(() => {
                if (currentUser) {
                    this.updateUIWithUserData();
                    this.initializeAppWithUserData();
                }
            });
            
            this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                if (updateData.user) {
                    this.handleProfileUpdate(updateData.user);
                }
            });
        } catch (error) {
            logErrorOnce('ParentChildCommunication.registerWithCoordinator', error);
        }
    }
    
    setupLegacyMessageListener() {
        try {
            window.addEventListener('message', (event) => {
                if (this.parentCoordinator && this.parentCoordinator.secureChannelEstablished) {
                    return;
                }
                
                this.handleLegacyMessage(event);
            });
        } catch (error) {
            logErrorOnce('ParentChildCommunication.setupLegacyMessageListener', error);
        }
    }
    
    handleLegacyMessage(event) {
        if (!this.isValidOrigin(event.origin)) {
            console.warn('[Calls iframe] Message from unauthorized origin:', event.origin);
            return;
        }
        
        const data = event.data;
        if (!data || typeof data !== 'object') {
            console.warn('[Calls iframe] Invalid legacy message data');
            return;
        }
        
        try {
            this.parentOrigin = event.origin;
            
            switch (data.type) {
                case 'USER_DATA':
                    this.handleParentUserData(data.payload);
                    break;
                case 'AUTH_UPDATE':
                    this.handleAuthUpdate(data.payload);
                    break;
                case 'PROFILE_UPDATE':
                    this.handleProfileUpdate(data.payload);
                    break;
                case 'LOGOUT':
                    this.handleLogout();
                    break;
                case 'PONG':
                    this.handleParentPong();
                    break;
                case 'TOKEN_UPDATE':
                    this.handleTokenUpdate(data.payload);
                    break;
                case 'API_READY':
                    this.handleApiReady();
                    break;
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.handleLegacyMessage', error, `type: ${data?.type}`);
        }
    }
    
    isValidOrigin(origin) {
        if (trustedOrigins.has(origin)) return true;
        if (origin === window.location.origin) return true;
        
        if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
            trustedOrigins.add(origin);
            return true;
        }
        
        try {
            const parentHost = window.location.hostname;
            const originHost = new URL(origin).hostname;
            
            const isValid = originHost === parentHost || 
                           originHost.endsWith('.' + parentHost) ||
                           parentHost.endsWith('.' + originHost);
            
            if (isValid) {
                trustedOrigins.add(origin);
            }
            
            return isValid;
        } catch (error) {
            return false;
        }
    }
    
    requestDataFromParent() {
        if (window.parent && window.parent !== window) {
            console.info('[Calls iframe] Requesting user data from parent (legacy fallback)...');
            
            const requestId = 'req_' + Date.now();
            
            try {
                window.parent.postMessage({
                    type: 'PING',
                    source: 'calls-iframe',
                    requestId: requestId,
                    timestamp: Date.now()
                }, '*');
                
                setTimeout(() => {
                    window.parent.postMessage({
                        type: 'GET_USER_DATA',
                        source: 'calls-iframe',
                        requestId: requestId,
                        timestamp: Date.now()
                    }, '*');
                }, 100);
                
                parentCommunicationAttempted = true;
            } catch (error) {
                logErrorOnce('ParentChildCommunication.requestDataFromParent', error);
            }
        } else {
            console.info('[Calls iframe] No parent window detected, will use coordination system');
            this.parentDataReceived = false;
            
            if (this.parentCoordinator && !this.parentCoordinator.handshakeComplete) {
                this.startCoordinatedFetch();
            }
        }
    }
    
    async startCoordinatedFetch() {
        const retryKey = 'coordinatedFetch';
        if (!canRetry(retryKey, 3)) {
            console.warn('[Calls iframe] Max coordinated fetch attempts reached');
            return;
        }
        
        if (this.dataFetchLock || userDataLoaded) {
            console.info('[Calls iframe] Data fetch already in progress or completed, skipping...');
            return;
        }
        
        this.dataFetchLock = true;
        
        console.info('[Calls iframe] Starting coordinated data fetch...');
        
        try {
            if (this.parentCoordinator) {
                await this.waitForSessionData();
            } else {
                throw new Error('Parent coordinator not available');
            }
        } catch (error) {
            incrementRetryCount(retryKey);
            logErrorOnce('ParentChildCommunication.startCoordinatedFetch', error, `attempt: ${getRetryCount(retryKey)}`);
            this.handleDataFetchFailure(error);
        } finally {
            this.dataFetchLock = false;
        }
    }
    
    async waitForSessionData() {
        if (!this.parentCoordinator) {
            throw new Error('Parent coordinator not available');
        }
        
        return new Promise((resolve, reject) => {
            if (this.parentCoordinator.sessionValidated && currentUser) {
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                reject(new Error('Session data timeout'));
            }, 10000);
            
            const checkInterval = setInterval(() => {
                if (this.parentCoordinator.sessionValidated && currentUser) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    resolve();
                }
                
                if (this.parentCoordinator.fallbackState === 'unavailable') {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    reject(new Error('Parent coordination unavailable'));
                }
            }, 100);
        });
    }
    
    startParentResponseTimeout() {
        if (this.parentCoordinator && this.parentCoordinator.parentDetected) {
            console.info('[Calls iframe] Using parent coordinator, skipping legacy timeout');
            return;
        }
        
        this.parentResponseTimeout = setTimeout(() => {
            if (!this.parentDataReceived && !this.directFetchInProgress) {
                console.info('[Calls iframe] Parent response timeout, starting coordinated fetch...');
                this.startCoordinatedFetch();
            }
        }, parentDataTimeout);
    }
    
    handleParentUserData(userData) {
        if (this.dataFetchLock || userDataLoaded) {
            console.info('[Calls iframe] Data already loaded or fetch in progress, ignoring parent data');
            return;
        }
        
        if (!userData || typeof userData !== 'object') {
            console.warn('[Calls iframe] Invalid user data received from parent');
            return;
        }
        
        if (this.parentResponseTimeout) {
            clearTimeout(this.parentResponseTimeout);
            this.parentResponseTimeout = null;
        }
        
        this.parentDataReceived = true;
        this.dataFetchLock = true;
        
        try {
            this.processUserData(userData, 'parent-legacy');
            this.notifyDataLoaded('parent-legacy');
        } catch (error) {
            logErrorOnce('ParentChildCommunication.handleParentUserData', error);
        } finally {
            this.dataFetchLock = false;
        }
    }
    
    handleAuthUpdate(authData) {
        if (!authData || typeof authData !== 'object') {
            console.warn('[Calls iframe] Invalid auth data received');
            return;
        }
        
        try {
            if (this.parentCoordinator && authData.authenticated !== undefined) {
                if (authData.authenticated && authData.user) {
                    this.parentCoordinator.handleSessionData({
                        sessionId: 'legacy-auth-' + Date.now(),
                        authenticated: true,
                        user: authData.user,
                        timestamp: Date.now()
                    });
                } else if (authData.authenticated === false) {
                    this.parentCoordinator.handleLogout();
                }
            } else {
                if (authData.authenticated && authData.user) {
                    currentUser = authData.user;
                    userDataLoaded = true;
                    this.updateUIWithUserData();
                } else if (authData.authenticated === false) {
                    this.handleLogout();
                }
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.handleAuthUpdate', error);
        }
    }
    
    handleProfileUpdate(profileData) {
        if (!profileData || typeof profileData !== 'object') {
            console.warn('[Calls iframe] Invalid profile data received');
            return;
        }
        
        if (currentUser) {
            try {
                currentUser = {
                    ...currentUser,
                    ...profileData
                };
                
                this.updateUIWithUserData();
                this.cacheUserData();
                this.showNotification('Profile updated', 'success');
            } catch (error) {
                logErrorOnce('ParentChildCommunication.handleProfileUpdate', error);
            }
        }
    }
    
    handleLogout() {
        console.info('[Calls iframe] Logout requested by parent');
        
        try {
            if (this.parentCoordinator) {
                this.parentCoordinator.handleLogout();
            } else {
                this.performLegacyLogout();
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.handleLogout', error);
        }
    }
    
    performLegacyLogout() {
        try {
            currentUser = null;
            userDataLoaded = false;
            this.authVerified = false;
            
            this.clearCachedData();
            this.showLoginScreen();
            
            if (window.CallApp) {
                window.CallApp.notifyParent('USER_LOGGED_OUT', {});
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.performLegacyLogout', error);
        }
    }
    
    handleParentPong() {
        console.info('[Calls iframe] Parent is responsive (legacy)');
    }
    
    handleTokenUpdate(tokenData) {
        if (!tokenData || typeof tokenData !== 'object') {
            console.warn('[Calls iframe] Invalid token data received');
            return;
        }
        
        try {
            if (this.parentCoordinator) {
                this.parentCoordinator.handleTokenUpdate(tokenData);
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.handleTokenUpdate', error);
        }
    }
    
    handleApiReady() {
        try {
            if (this.parentCoordinator) {
                this.parentCoordinator.handleApiReady();
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.handleApiReady', error);
        }
    }
    
    processUserData(userData, source) {
        if (!userData || typeof userData !== 'object') {
            throw new Error('Invalid user data received');
        }
        
        if (!userData.id) {
            throw new Error('User data missing id field');
        }
        
        try {
            currentUser = userData;
            userDataLoaded = true;
            this.authVerified = true;
            
            this.cacheUserData();
            this.updateUIWithUserData();
            this.initializeAppWithUserData();
            this.showNotification(`User data loaded from ${source}`, 'success');
            
            console.info(`[Calls iframe] User data successfully loaded from ${source}`);
        } catch (error) {
            logErrorOnce('ParentChildCommunication.processUserData', error);
            throw error;
        }
    }
    
    handleDataFetchFailure(error) {
        console.error('[Calls iframe] All data fetch attempts failed:', error);
        
        try {
            const cachedUser = this.getCachedUserData();
            if (cachedUser) {
                console.info('[Calls iframe] Using cached user data');
                currentUser = cachedUser;
                userDataLoaded = true;
                this.updateUIWithUserData();
                this.showNotification('Using cached data (offline mode)', 'warning');
            } else {
                if (this.parentCoordinator) {
                    this.parentCoordinator.showReconnectState();
                } else {
                    this.showLoginScreen();
                }
                this.showNotification('Please wait for session reconnection', 'error');
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.handleDataFetchFailure', error);
        }
    }
    
    updateUIWithUserData() {
        if (!currentUser) return;
        
        try {
            const userElements = {
                'userAvatar': currentUser.avatar,
                'userName': currentUser.name || currentUser.username,
                'userStatus': currentUser.status || 'Online'
            };
            
            this.updateUserSpecificUI(userElements);
            this.updateApiStatusIndicator();
            this.updateSyncIndicator();
        } catch (error) {
            logErrorOnce('ParentChildCommunication.updateUIWithUserData', error);
        }
    }
    
    updateUserSpecificUI(userElements) {
        if (!userElements) return;
        
        try {
            document.querySelectorAll('.user-avatar, .avatar-img').forEach(el => {
                if (userElements.userAvatar) {
                    if (el.tagName === 'IMG') {
                        el.src = userElements.userAvatar;
                        el.alt = userElements.userName;
                    } else {
                        el.style.backgroundImage = `url(${userElements.userAvatar})`;
                    }
                }
            });
            
            document.querySelectorAll('.user-name, .username').forEach(el => {
                if (el.textContent.includes('User') || el.textContent.includes('Loading')) {
                    el.textContent = userElements.userName;
                }
            });
            
            const callStatusText = document.getElementById('callStatusText');
            if (callStatusText && callStatusText.textContent.includes('Waiting for API')) {
                callStatusText.textContent = `Ready (${userElements.userName})`;
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.updateUserSpecificUI', error);
        }
    }
    
    updateApiStatusIndicator() {
        try {
            const apiStatusIndicator = document.getElementById('apiStatusIndicator');
            const apiStatusText = document.getElementById('apiStatusText');
            
            if (apiStatusIndicator && apiStatusText) {
                apiStatusIndicator.className = 'api-status-indicator connected';
                apiStatusText.textContent = `Authenticated as ${currentUser?.name || currentUser?.username || 'User'}`;
                
                setTimeout(() => {
                    apiStatusIndicator.style.display = 'none';
                }, 2000);
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.updateApiStatusIndicator', error);
        }
    }
    
    updateSyncIndicator() {
        try {
            const syncIndicator = document.getElementById('syncIndicator');
            if (syncIndicator) {
                syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                syncIndicator.classList.remove('syncing');
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.updateSyncIndicator', error);
        }
    }
    
    initializeAppWithUserData() {
        if (!currentUser) return;
        
        try {
            if (window.callAPI) {
                window.callAPI.onAuthenticationSuccess();
            }
            
            if (window.AppState) {
                window.AppState.user = currentUser;
                window.AppState.currentUser = currentUser;
                window.AppState.isAuthenticated = true;
            }
            
            this.enableUIFeatures();
        } catch (error) {
            logErrorOnce('ParentChildCommunication.initializeAppWithUserData', error);
        }
    }
    
    enableUIFeatures() {
        try {
            const newCallBtn = document.getElementById('newCallBtn');
            if (newCallBtn) newCallBtn.disabled = false;
            
            const quickVoiceBtn = document.getElementById('quickVoiceBtn');
            const quickVideoBtn = document.getElementById('quickVideoBtn');
            if (quickVoiceBtn) quickVoiceBtn.disabled = false;
            if (quickVideoBtn) quickVideoBtn.disabled = false;
            
            this.loadUserSpecificData();
        } catch (error) {
            logErrorOnce('ParentChildCommunication.enableUIFeatures', error);
        }
    }
    
    async loadUserSpecificData() {
        if (!currentUser || !userDataLoaded) return;
        
        console.info('[Calls iframe] Loading user-specific data...');
        
        try {
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
                await this.parentCoordinator.loadUserSpecificData();
            } else if (window.callAPI) {
                await window.callAPI.performInitialDataLoad();
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.loadUserSpecificData', error);
        }
    }
    
    cacheUserData() {
        if (!currentUser) return;
        
        try {
            localStorage.setItem('cachedUserData', JSON.stringify({
                user: currentUser,
                timestamp: Date.now(),
                source: 'calls-iframe'
            }));
            
            localStorage.setItem('authUser', JSON.stringify(currentUser));
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        } catch (error) {
            logErrorOnce('ParentChildCommunication.cacheUserData', error);
        }
    }
    
    loadCachedUserData() {
        try {
            const cacheKeys = ['cachedUserData', 'authUser', 'currentUser', 'userData'];
            
            for (const key of cacheKeys) {
                const cached = localStorage.getItem(key);
                if (cached) {
                    try {
                        const data = JSON.parse(cached);
                        const userData = data.user || data;
                        
                        if (userData && userData.id) {
                            currentUser = userData;
                            userDataLoaded = true;
                            
                            this.updateUIWithUserData();
                            return true;
                        }
                    } catch (e) {
                        console.error(`[Calls iframe] Failed to parse cached data from ${key}:`, e);
                    }
                }
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.loadCachedUserData', error);
        }
        
        return false;
    }
    
    getCachedUserData() {
        try {
            const cached = localStorage.getItem('cachedUserData');
            if (cached) {
                const data = JSON.parse(cached);
                return data.user;
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.getCachedUserData', error);
        }
        return null;
    }
    
    clearCachedData() {
        try {
            localStorage.removeItem('cachedUserData');
            localStorage.removeItem('authUser');
            localStorage.removeItem('currentUser');
        } catch (error) {
            logErrorOnce('ParentChildCommunication.clearCachedData', error);
        }
    }
    
    showLoginScreen() {
        if (this.parentCoordinator && this.parentCoordinator.parentDetected) {
            return;
        }
        
        try {
            const appContainer = document.getElementById('appContainer');
            if (appContainer) {
                const loginOverlay = document.createElement('div');
                loginOverlay.className = 'login-overlay';
                loginOverlay.innerHTML = `
                    <div class="login-message">
                        <i class="fas fa-sign-in-alt"></i>
                        <h3>Authentication Required</h3>
                        <p>Please log in to use the Calls feature</p>
                        <button id="retryLoginBtn" class="quick-action-btn">Retry Login</button>
                    </div>
                `;
                
                appContainer.appendChild(loginOverlay);
                
                const retryBtn = document.getElementById('retryLoginBtn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        location.reload();
                    });
                }
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.showLoginScreen', error);
        }
    }
    
    getAuthToken() {
        try {
            if (this.parentCoordinator && this.parentCoordinator.sessionData?.token) {
                return this.parentCoordinator.sessionData.token;
            }
            
            try {
                const token = getUserToken();
                if (token && typeof token === 'string' && token.length > 10) {
                    return token;
                }
            } catch (error) {
                console.error('[Calls iframe] Error getting token from api.core.js:', error);
            }
            
            const tokenSources = [
                () => localStorage.getItem('USER_TOKEN'),
                () => localStorage.getItem('accessToken'),
                () => localStorage.getItem('authToken'),
                () => sessionStorage.getItem('accessToken')
            ];
            
            for (const source of tokenSources) {
                try {
                    const token = source();
                    if (token && typeof token === 'string' && token.length > 10) {
                        return token;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            return null;
        } catch (error) {
            logErrorOnce('ParentChildCommunication.getAuthToken', error);
            return null;
        }
    }
    
    showNotification(message, type = 'info') {
        try {
            if (window.showNotification) {
                window.showNotification(message, type);
                return;
            }
            
            const notificationArea = document.getElementById('notificationArea');
            if (notificationArea) {
                const notification = document.createElement('div');
                notification.className = `call-notification ${type}`;
                notification.innerHTML = `
                    <div class="call-notification-content">
                        <div class="call-notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                        <div class="call-notification-message">${message}</div>
                    </div>
                    <button class="call-notification-close">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                
                notificationArea.appendChild(notification);
                
                const closeBtn = notification.querySelector('.call-notification-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        notification.remove();
                    });
                }
                
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 3000);
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.showNotification', error);
        }
    }
    
    notifyDataLoaded(source) {
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({
                    type: 'USER_DATA_RECEIVED',
                    source: 'calls-iframe',
                    timestamp: Date.now(),
                    dataSource: source
                }, '*');
            } catch (error) {
                logErrorOnce('ParentChildCommunication.notifyDataLoaded', error);
            }
        }
    }
    
    cleanup() {
        try {
            if (this.parentResponseTimeout) {
                clearTimeout(this.parentResponseTimeout);
                this.parentResponseTimeout = null;
            }
        } catch (error) {
            logErrorOnce('ParentChildCommunication.cleanup', error);
        }
    }
}

// ==================== UPDATED TOKEN MANAGEMENT SYSTEM ====================
export class TokenManager {
    constructor() {
        this.tokenReady = false;
        this.token = null;
        this.waitingCallbacks = [];
        this.apiInitialized = false;
        this.tokenCheckInterval = null;
        this.migrationDone = false;
        this.parentCoordinator = null;
        this.coordinatedToken = false;
        this.tokenRetryCount = 0;
        this.maxTokenRetries = 3;
    }
    
    async initialize() {
        try {
            console.info('[Calls iframe] Initializing token manager with parent coordination...');
            
            if (!parentCoordinator) {
                console.info('[Calls iframe] Parent coordinator not yet available');
            } else {
                this.parentCoordinator = parentCoordinator;
                if (this.parentCoordinator?.sessionData?.token) {
                    this.setToken(this.parentCoordinator.sessionData.token);
                    this.coordinatedToken = true;
                }
            }
            
            await this.tryGetTokenFromAPI();
            this.loadCachedData();
            this.startTokenPolling();
            this.setupCoordinatedListener();
            this.migrateOldTokens();
        } catch (error) {
            logErrorOnce('TokenManager.initialize', error);
        }
    }
    
    setupCoordinatedListener() {
        try {
            if (!this.parentCoordinator) {
                const checkInterval = setInterval(() => {
                    if (parentCoordinator) {
                        this.parentCoordinator = parentCoordinator;
                        clearInterval(checkInterval);
                        
                        this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                            if (updateData.token) {
                                this.setToken(updateData.token);
                                this.coordinatedToken = true;
                            }
                        });
                    }
                }, 100);
                return;
            }
            
            this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                if (updateData.token) {
                    this.setToken(updateData.token);
                    this.coordinatedToken = true;
                }
            });
        } catch (error) {
            logErrorOnce('TokenManager.setupCoordinatedListener', error);
        }
    }
    
    async tryGetTokenFromAPI() {
        if (this.coordinatedToken) {
            return false;
        }
        
        try {
            if (this.tokenRetryCount >= this.maxTokenRetries) {
                console.warn('[Calls iframe] Maximum token retry attempts reached');
                return false;
            }
            
            this.tokenRetryCount++;
            const token = getUserToken();
            
            if (token && this.validateToken(token)) {
                this.setToken(token);
                this.tokenRetryCount = 0;
                return true;
            }
            
            return false;
        } catch (error) {
            logErrorOnce('TokenManager.tryGetTokenFromAPI', error, `attempt: ${this.tokenRetryCount}`);
            return false;
        }
    }
    
    startTokenPolling() {
        try {
            if (this.tokenCheckInterval) {
                clearInterval(this.tokenCheckInterval);
                this.tokenCheckInterval = null;
            }
            
            if (this.coordinatedToken) {
                console.info('[Calls iframe] Using coordinated token, skipping API polling');
                return;
            }
            
            let attempts = 0;
            const maxAttempts = 20;
            
            this.tokenCheckInterval = setInterval(() => {
                attempts++;
                
                const gotToken = this.tryGetTokenFromAPI();
                
                if (gotToken) {
                    clearInterval(this.tokenCheckInterval);
                    this.tokenCheckInterval = null;
                    this.apiInitialized = true;
                    this.executeWaitingCallbacks();
                } else if (attempts >= maxAttempts) {
                    clearInterval(this.tokenCheckInterval);
                    this.tokenCheckInterval = null;
                    console.info('[Calls iframe] API initialization timeout, using coordinated token only');
                    this.executeWaitingCallbacks();
                }
                
                const storedToken = localStorage.getItem('USER_TOKEN');
                if (storedToken && this.validateToken(storedToken) && !this.token) {
                    this.setToken(storedToken);
                }
            }, 500);
        } catch (error) {
            logErrorOnce('TokenManager.startTokenPolling', error);
        }
    }
    
    setToken(token) {
        if (!this.validateToken(token)) {
            console.warn('[Calls iframe] Attempted to set invalid token');
            return;
        }
        
        try {
            this.token = token;
            this.tokenReady = true;
            this.tokenRetryCount = 0;
            
            localStorage.setItem('USER_TOKEN', token);
            
            if (window.AppState) {
                window.AppState.isAuthenticated = true;
            }
            
            this.executeWaitingCallbacks();
        } catch (error) {
            logErrorOnce('TokenManager.setToken', error);
        }
    }
    
    waitForToken() {
        return new Promise((resolve) => {
            try {
                if (this.tokenReady && this.token) {
                    resolve(this.token);
                } else {
                    this.waitingCallbacks.push(resolve);
                }
            } catch (error) {
                logErrorOnce('TokenManager.waitForToken', error);
                resolve(null);
            }
        });
    }
    
    executeWaitingCallbacks() {
        if (this.tokenReady && this.token) {
            while (this.waitingCallbacks.length > 0) {
                const callback = this.waitingCallbacks.shift();
                try {
                    callback(this.token);
                } catch (error) {
                    logErrorOnce('TokenManager.executeWaitingCallbacks', error);
                }
            }
        }
    }
    
    validateToken(token) {
        if (!token || typeof token !== 'string') return false;
        if (token.length < 10) return false;
        if (token.trim() !== token) return false;
        
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            
            const payload = JSON.parse(atob(parts[1]));
            if (!payload.exp) return true;
            
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp < now) {
                console.warn('[Calls iframe] Token expired');
                return false;
            }
            
            return true;
        } catch (e) {
            return true;
        }
    }
    
    migrateOldTokens() {
        if (this.migrationDone) return;
        
        try {
            const oldTokenKeys = [
                'accessToken',
                'moodchat_token',
                'authToken',
                'token',
                'auth_token'
            ];
            
            for (const key of oldTokenKeys) {
                const oldToken = localStorage.getItem(key);
                if (oldToken && this.validateToken(oldToken)) {
                    localStorage.setItem('USER_TOKEN', oldToken);
                }
            }
            
            for (const key of oldTokenKeys) {
                const oldToken = sessionStorage.getItem(key);
                if (oldToken && this.validateToken(oldToken)) {
                    localStorage.setItem('USER_TOKEN', oldToken);
                }
            }
            
            this.migrationDone = true;
        } catch (error) {
            logErrorOnce('TokenManager.migrateOldTokens', error);
        }
    }
    
    loadCachedData() {
        try {
            const cachedUser = localStorage.getItem('authUser') || 
                              localStorage.getItem('currentUser') ||
                              localStorage.getItem('userData');
            
            if (cachedUser) {
                try {
                    const userData = JSON.parse(cachedUser);
                    if (window.AppState) {
                        window.AppState.user = userData;
                        window.AppState.currentUser = userData;
                    }
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached user data');
                }
            }
            
            const cachedContacts = localStorage.getItem('cachedContacts');
            if (cachedContacts && window.AppState) {
                try {
                    window.AppState.contacts = JSON.parse(cachedContacts);
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached contacts');
                }
            }
            
            const cachedCalls = localStorage.getItem('cachedCallHistory');
            if (cachedCalls && window.AppState) {
                try {
                    window.AppState.callHistory = JSON.parse(cachedCalls);
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached call history');
                }
            }
        } catch (error) {
            logErrorOnce('TokenManager.loadCachedData', error);
        }
    }
    
    setupMessageListener() {
        try {
            window.addEventListener('message', (event) => {
                const allowedOrigins = [window.location.origin, 'http://localhost:*', 'https://yourdomain.com'];
                if (!allowedOrigins.some(origin => event.origin.match(new RegExp(origin.replace('*', '.*'))))) {
                    return;
                }
                
                const data = event.data;
                
                if (data.type === 'TOKEN_UPDATE') {
                    if (data.token && this.validateToken(data.token)) {
                        this.setToken(data.token);
                    }
                }
                
                if (data.type === 'API_READY') {
                    setTimeout(() => this.tryGetTokenFromAPI(), 100);
                }
            });
        } catch (error) {
            logErrorOnce('TokenManager.setupMessageListener', error);
        }
    }
    
    getToken() {
        try {
            if (this.parentCoordinator?.sessionData?.token) {
                return this.parentCoordinator.sessionData.token;
            }
            
            try {
                const token = getUserToken();
                if (token && this.validateToken(token)) {
                    return token;
                }
            } catch (error) {
                console.error('[Calls iframe] Error getting token from api.core.js:', error);
            }
            
            return this.token;
        } catch (error) {
            logErrorOnce('TokenManager.getToken', error);
            return null;
        }
    }
    
    isTokenReady() {
        try {
            if (this.parentCoordinator?.sessionData?.token) {
                return true;
            }
            
            try {
                const token = getUserToken();
                if (token && this.validateToken(token)) {
                    return true;
                }
            } catch (error) {
                console.error('[Calls iframe] Error checking token from api.core.js:', error);
            }
            
            return this.tokenReady && this.validateToken(this.token);
        } catch (error) {
            logErrorOnce('TokenManager.isTokenReady', error);
            return false;
        }
    }
    
    clearToken() {
        try {
            this.token = null;
            this.tokenReady = false;
            this.apiInitialized = false;
            this.coordinatedToken = false;
            this.tokenRetryCount = 0;
            
            localStorage.removeItem('USER_TOKEN');
            
            if (window.AppState) {
                window.AppState.isAuthenticated = false;
                window.AppState.user = null;
                window.AppState.currentUser = null;
            }
        } catch (error) {
            logErrorOnce('TokenManager.clearToken', error);
        }
    }
    
    cleanup() {
        try {
            if (this.tokenCheckInterval) {
                clearInterval(this.tokenCheckInterval);
                this.tokenCheckInterval = null;
            }
        } catch (error) {
            logErrorOnce('TokenManager.cleanup', error);
        }
    }
}

// ==================== UPDATED SECURE API CLIENT ====================
export class SecureAPIClient {
    constructor(tokenManager) {
        this.tokenManager = tokenManager;
        this.requestQueue = [];
        this.processingQueue = false;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.parentCoordinator = null;
        this.useCoordinatedRouting = false;
        this.requestTimeout = 10000;
    }
    
    async fetch(url, options = {}) {
        if (!url) {
            throw new Error('URL is required');
        }
        
        try {
            if (!this.parentCoordinator && parentCoordinator) {
                this.parentCoordinator = parentCoordinator;
            }
            
            if (this.parentCoordinator?.sessionValidated) {
                try {
                    return await this.fetchThroughCoordinator(url, options);
                } catch (error) {
                    console.warn('[Calls iframe] Coordinator fetch failed, falling back:', error.message);
                    this.useCoordinatedRouting = false;
                }
            }
            
            try {
                return await secureFetch(url, options);
            } catch (error) {
                console.error('[Calls iframe] api.core.js secureFetch failed:', error.message);
            }
            
            return this.secureFetchFallback(url, options);
        } catch (error) {
            logErrorOnce('SecureAPIClient.fetch', error, `url: ${url}`);
            throw error;
        }
    }
    
    async fetchThroughCoordinator(url, options = {}) {
        if (!this.parentCoordinator?.sessionValidated) {
            throw new Error('Parent coordinator not available');
        }
        
        try {
            let endpoint = url;
            if (url.startsWith('http')) {
                try {
                    const urlObj = new URL(url);
                    endpoint = urlObj.pathname + urlObj.search;
                } catch (error) {
                    console.error('[Calls iframe] Error parsing URL:', error);
                }
            }
            
            const result = await this.parentCoordinator.routeApiCall(
                endpoint,
                options.method || 'GET',
                options.body ? JSON.parse(options.body) : null
            );
            
            return {
                ok: true,
                status: 200,
                json: async () => result,
                text: async () => JSON.stringify(result),
                headers: new Headers({
                    'Content-Type': 'application/json'
                })
            };
        } catch (error) {
            logErrorOnce('SecureAPIClient.fetchThroughCoordinator', error);
            throw error;
        }
    }
    
    async secureFetchFallback(url, options = {}, retryCount = 0) {
        try {
            if (!this.tokenManager.isTokenReady()) {
                return this.queueRequest(url, options);
            }
            
            const token = this.tokenManager.getToken();
            if (!token || !this.tokenManager.validateToken(token)) {
                console.warn('[Calls iframe] No valid authentication token available');
                return this.queueRequest(url, options);
            }
            
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...options.headers
            };
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
            
            const response = await fetch(url, {
                ...options,
                headers,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.status === 401) {
                this.tokenManager.clearToken();
                
                if (this.parentCoordinator) {
                    this.parentCoordinator.sendToParent({
                        type: 'AUTH_ERROR',
                        source: 'calls-iframe',
                        timestamp: Date.now()
                    });
                }
                
                this.showNotification('Session expired. Please wait for reconnection.', 'error');
                
                throw new Error('Authentication failed');
            }
            
            if (!response.ok) {
                if (response.status >= 500 && retryCount < this.maxRetries) {
                    const delay = this.retryDelay * Math.pow(2, retryCount);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.secureFetchFallback(url, options, retryCount + 1);
                }
                
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            
            if (retryCount < this.maxRetries && 
                (error.message.includes('Network') || error.message.includes('Failed to fetch'))) {
                const delay = this.retryDelay * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.secureFetchFallback(url, options, retryCount + 1);
            }
            
            logErrorOnce('SecureAPIClient.secureFetchFallback', error, `url: ${url}, retry: ${retryCount}`);
            throw error;
        }
    }
    
    async queueRequest(url, options) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                url,
                options,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            if (!this.processingQueue) {
                this.processQueue();
            }
            
            setTimeout(() => {
                const index = this.requestQueue.findIndex(req => req.url === url);
                if (index !== -1) {
                    this.requestQueue.splice(index, 1);
                    reject(new Error('Request timeout: Token not available'));
                }
            }, 30000);
        });
    }
    
    async processQueue() {
        if (this.processingQueue || this.requestQueue.length === 0) return;
        
        this.processingQueue = true;
        
        while (this.requestQueue.length > 0) {
            const request = this.requestQueue[0];
            
            try {
                if (this.tokenManager.isTokenReady()) {
                    const response = await this.secureFetchFallback(request.url, request.options);
                    request.resolve(response);
                    this.requestQueue.shift();
                } else {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                request.reject(error);
                this.requestQueue.shift();
            }
        }
        
        this.processingQueue = false;
    }
    
    async fetchJSON(url, options = {}) {
        try {
            const response = await this.fetch(url, options);
            return response.json();
        } catch (error) {
            logErrorOnce('SecureAPIClient.fetchJSON', error);
            throw error;
        }
    }
    
    async get(url, options = {}) {
        return this.fetch(url, { ...options, method: 'GET' });
    }
    
    async post(url, data, options = {}) {
        return this.fetch(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    async put(url, data, options = {}) {
        return this.fetch(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    async delete(url, options = {}) {
        return this.fetch(url, { ...options, method: 'DELETE' });
    }
    
    showNotification(message, type = 'info') {
        try {
            if (window.showNotification) {
                window.showNotification(message, type);
                return;
            }
            
            const notificationArea = document.getElementById('notificationArea');
            if (notificationArea) {
                const notification = document.createElement('div');
                notification.className = `call-notification ${type}`;
                notification.innerHTML = `
                    <div class="call-notification-content">
                        <div class="call-notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                        <div class="call-notification-message">${message}</div>
                    </div>
                    <button class="call-notification-close">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                
                notificationArea.appendChild(notification);
                
                const closeBtn = notification.querySelector('.call-notification-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        notification.remove();
                    });
                }
                
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 3000);
            }
        } catch (error) {
            logErrorOnce('SecureAPIClient.showNotification', error);
        }
    }
}

// ==================== UPDATED API INTEGRATION ====================
export class CallAPIIntegration {
    constructor() {
        this.tokenManager = new TokenManager();
        this.apiClient = new SecureAPIClient(this.tokenManager);
        this.backgroundSyncInterval = null;
        this.authCheckDone = false;
        this.backgroundJobsStarted = false;
        this.initialDataLoaded = false;
        this.parentCommunication = new ParentChildCommunication();
        this.parentCoordinator = null;
        this.sessionInitialized = false;
        this.apiConfig = {};
        this.initAttempts = 0;
        this.maxInitAttempts = 3;
        this.isInitializing = false;
    }
    
    async initialize() {
        if (this.isInitializing) {
            console.info('[Calls iframe] Initialization already in progress');
            return this;
        }
        
        if (sessionInitializationLock) {
            console.info('[Calls iframe] Initialization already in progress, skipping...');
            return this;
        }
        
        sessionInitializationLock = true;
        this.isInitializing = true;
        this.initAttempts++;
        
        try {
            console.info('[Calls iframe] Initializing API integration with parent coordination...');
            
            if (!parentCoordinator) {
                console.info('[Calls iframe] Creating new parent coordinator...');
                parentCoordinator = new ParentCoordinator();
                await parentCoordinator.initialize();
            }
            
            this.parentCoordinator = parentCoordinator;
            
            this.parentCommunication.parentCoordinator = this.parentCoordinator;
            this.tokenManager.parentCoordinator = this.parentCoordinator;
            this.apiClient.parentCoordinator = this.parentCoordinator;
            
            await this.parentCommunication.initialize();
            await this.tokenManager.initialize();
            this.setupInitialUI();
            await this.startBackgroundAuthCheck();
            
            window.addEventListener('beforeunload', () => this.cleanup());
            this.registerWithCoordinator();
            
            sessionInitialized = true;
            this.isInitializing = false;
            this.initAttempts = 0;
            
            console.info('[Calls iframe] API integration with parent coordination initialized');
            return this;
        } catch (error) {
            logErrorOnce('CallAPIIntegration.initialize', error, `attempt: ${this.initAttempts}`);
            
            if (this.initAttempts < this.maxInitAttempts) {
                console.info(`[Calls iframe] Retrying initialization (${this.initAttempts}/${this.maxInitAttempts})...`);
                setTimeout(() => this.initialize(), 1000 * this.initAttempts);
            } else {
                console.error('[Calls iframe] Max initialization attempts reached');
                this.isInitializing = false;
                sessionInitializationLock = false;
                throw error;
            }
        } finally {
            if (!this.isInitializing) {
                sessionInitializationLock = false;
            }
        }
    }
    
    registerWithCoordinator() {
        if (!this.parentCoordinator) {
            console.warn('[Calls iframe] Cannot register with coordinator - not available');
            return;
        }
        
        try {
            this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
                this.handleCoordinatedSessionUpdate(updateData);
            });
            
            this.parentCoordinator.registerUIBinding(() => {
                if (currentUser && !this.authCheckDone) {
                    this.onAuthenticationSuccess();
                }
            });
        } catch (error) {
            logErrorOnce('CallAPIIntegration.registerWithCoordinator', error);
        }
    }
    
    handleCoordinatedSessionUpdate(updateData) {
        if (!updateData) return;
        
        try {
            if (updateData.apiConfig) {
                this.apiConfig = { ...this.apiConfig, ...updateData.apiConfig };
            }
            
            if (updateData.authenticated !== undefined) {
                if (updateData.authenticated && updateData.user) {
                    this.onAuthenticationSuccess();
                } else if (updateData.authenticated === false) {
                    this.handleLogout();
                }
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.handleCoordinatedSessionUpdate', error);
        }
    }
    
    setupInitialUI() {
        try {
            const apiStatusIndicator = document.getElementById('apiStatusIndicator');
            const apiStatusText = document.getElementById('apiStatusText');
            
            if (apiStatusIndicator && apiStatusText) {
                apiStatusIndicator.className = 'api-status-indicator connecting';
                apiStatusText.textContent = 'Initializing with parent...';
                apiStatusIndicator.style.display = 'block';
            }
            
            this.loadCachedDataToUI();
            this.showUI();
        } catch (error) {
            logErrorOnce('CallAPIIntegration.setupInitialUI', error);
        }
    }
    
    showUI() {
        try {
            const appContainer = document.getElementById('appContainer');
            if (appContainer) {
                appContainer.style.display = 'block';
                appContainer.style.opacity = '1';
            }
            
            this.enableBasicUI();
        } catch (error) {
            logErrorOnce('CallAPIIntegration.showUI', error);
        }
    }
    
    enableBasicUI() {
        try {
            const settingsToggle = document.getElementById('settingsToggle');
            if (settingsToggle) {
                settingsToggle.disabled = false;
            }
            
            this.renderCachedCallHistory();
        } catch (error) {
            logErrorOnce('CallAPIIntegration.enableBasicUI', error);
        }
    }
    
    async startBackgroundAuthCheck() {
        try {
            if (this.parentCoordinator) {
                await this.waitForCoordinatorSession();
            } else {
                await this.waitForTokenAuth();
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.startBackgroundAuthCheck', error);
        }
    }
    
    async waitForCoordinatorSession() {
        if (!this.parentCoordinator) {
            console.warn('[Calls iframe] No parent coordinator available');
            return;
        }
        
        return new Promise((resolve) => {
            if (this.parentCoordinator.sessionValidated && currentUser) {
                this.onAuthenticationSuccess();
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                console.info('[Calls iframe] Coordinator session timeout, using cached data');
                resolve();
            }, 5000);
            
            const checkInterval = setInterval(() => {
                if (this.parentCoordinator.sessionValidated && currentUser) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    this.onAuthenticationSuccess();
                    resolve();
                }
                
                if (this.parentCoordinator.fallbackState === 'unavailable') {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    console.info('[Calls iframe] Coordinator unavailable, using cached data');
                    resolve();
                }
            }, 100);
        });
    }
    
    async waitForTokenAuth() {
        try {
            const tokenPromise = this.tokenManager.waitForToken();
            const timeoutPromise = new Promise(resolve => 
                setTimeout(() => resolve(null), 5000));
            
            const token = await Promise.race([tokenPromise, timeoutPromise]);
            
            if (token) {
                this.onAuthenticationSuccess(token);
            } else {
                console.info('[Calls iframe] Token not ready yet, continuing with cached data');
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.waitForTokenAuth', error);
        }
    }
    
    onAuthenticationSuccess(token) {
        if (this.authCheckDone) {
            return;
        }
        
        try {
            if (window.AppState) {
                window.AppState.isAuthenticated = true;
            }
            this.authCheckDone = true;
            
            const apiStatusIndicator = document.getElementById('apiStatusIndicator');
            const apiStatusText = document.getElementById('apiStatusText');
            
            if (apiStatusIndicator && apiStatusText) {
                apiStatusIndicator.className = 'api-status-indicator connected';
                
                if (currentUser?.name) {
                    apiStatusText.textContent = `Authenticated as ${currentUser.name}`;
                } else {
                    apiStatusText.textContent = 'Authenticated';
                }
                
                setTimeout(() => {
                    if (apiStatusIndicator) {
                        apiStatusIndicator.style.display = 'none';
                    }
                }, 2000);
            }
            
            if (!this.backgroundJobsStarted) {
                this.backgroundJobsStarted = true;
                this.startBackgroundJobs();
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.onAuthenticationSuccess', error);
        }
    }
    
    startBackgroundJobs() {
        if (window.AppState && !window.AppState.isOnline) return;
        
        console.info('[Calls iframe] Starting background jobs...');
        
        try {
            this.initializeBackgroundSync();
            
            setTimeout(() => {
                this.performInitialDataLoad();
            }, 1000);
        } catch (error) {
            logErrorOnce('CallAPIIntegration.startBackgroundJobs', error);
        }
    }
    
    async performInitialDataLoad() {
        if ((window.AppState && !window.AppState.isAuthenticated) || (window.AppState && !window.AppState.isOnline)) return;
        
        try {
            const syncIndicator = document.getElementById('syncIndicator');
            if (syncIndicator) {
                syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Syncing...</span>';
                syncIndicator.classList.add('syncing');
            }
            
            await Promise.allSettled([
                this.fetchContacts(true),
                this.fetchCallHistory(true),
                this.fetchUserData(),
                this.fetchSettings(),
                this.checkPremiumStatus()
            ]);
            
            this.initialDataLoaded = true;
            
            if (syncIndicator) {
                syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                syncIndicator.classList.remove('syncing');
            }
            
            if (this.parentCoordinator) {
                this.parentCoordinator.sendToParent({
                    type: 'DATA_SYNC_COMPLETE',
                    source: 'calls-iframe',
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.performInitialDataLoad', error);
            
            if (window.AppState) {
                window.AppState.syncPending = true;
            }
            
            const syncIndicator = document.getElementById('syncIndicator');
            if (syncIndicator) {
                syncIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Sync failed</span>';
                syncIndicator.classList.remove('syncing');
            }
        }
    }
    
    initializeBackgroundSync() {
        try {
            if (this.backgroundSyncInterval) {
                clearInterval(this.backgroundSyncInterval);
                this.backgroundSyncInterval = null;
            }
            
            if (window.AppState && window.AppState.isAuthenticated && window.AppState.isOnline) {
                this.backgroundSyncInterval = setInterval(() => {
                    this.performBackgroundSync();
                }, 30000);
                
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden && window.AppState && window.AppState.isOnline && window.AppState.isAuthenticated) {
                        this.performBackgroundSync();
                    }
                });
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.initializeBackgroundSync', error);
        }
    }
    
    async performBackgroundSync() {
        if (!window.AppState || !window.AppState.isOnline || !window.AppState.isAuthenticated || window.AppState.isInCall) return;
        
        try {
            await Promise.allSettled([
                this.fetchContacts(true),
                this.fetchCallHistory(true),
                this.checkPremiumStatus()
            ]);
            
            const syncIndicator = document.getElementById('syncIndicator');
            if (syncIndicator) {
                syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                syncIndicator.classList.remove('syncing');
            }
            
            if (window.AppState) {
                window.AppState.syncPending = false;
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.performBackgroundSync', error);
            if (window.AppState) {
                window.AppState.syncPending = true;
            }
        }
    }
    
    async fetchUserData() {
        try {
            if (this.parentCoordinator?.sessionValidated) {
                const userData = await this.parentCoordinator.routeApiCall('/api/user/me', 'GET');
                if (userData) {
                    this.updateUserState(userData);
                    return userData;
                }
            }
            
            const userData = await getCurrentUser();
            
            if (userData) {
                this.updateUserState(userData);
                return userData;
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.fetchUserData', error);
            
            const cachedUser = localStorage.getItem('authUser') || 
                              localStorage.getItem('currentUser');
            
            if (cachedUser) {
                try {
                    const userData = JSON.parse(cachedUser);
                    this.updateUserState(userData);
                    return userData;
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached user data');
                }
            }
        }
        
        return null;
    }
    
    getApiBaseUrl() {
        try {
            if (this.parentCoordinator?.sessionData?.apiConfig?.baseUrl) {
                return this.parentCoordinator.sessionData.apiConfig.baseUrl;
            }
            
            try {
                const baseUrl = getApiBaseUrl();
                if (baseUrl) {
                    return baseUrl;
                }
            } catch (error) {
                console.error('[Calls iframe] Error getting API base URL from api.core.js:', error);
            }
            
            return '/api';
        } catch (error) {
            logErrorOnce('CallAPIIntegration.getApiBaseUrl', error);
            return '/api';
        }
    }
    
    updateUserState(userData) {
        if (!userData) return;
        
        try {
            if (window.AppState) {
                window.AppState.user = userData;
                window.AppState.currentUser = userData;
            }
            
            localStorage.setItem('authUser', JSON.stringify(userData));
            localStorage.setItem('currentUser', JSON.stringify(userData));
        } catch (error) {
            logErrorOnce('CallAPIIntegration.updateUserState', error);
        }
    }
    
    async fetchContacts(forceRefresh = false) {
        try {
            if (!forceRefresh && window.AppState && window.AppState.contacts?.length > 0) {
                return window.AppState.contacts;
            }
            
            const cachedContacts = localStorage.getItem('cachedContacts');
            if (!forceRefresh && cachedContacts) {
                try {
                    const contacts = JSON.parse(cachedContacts);
                    if (window.AppState) {
                        window.AppState.contacts = contacts;
                    }
                    this.renderContacts(contacts);
                    return contacts;
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached contacts');
                }
            }
            
            if (!window.AppState || !window.AppState.isAuthenticated) {
                return window.AppState ? window.AppState.contacts : [];
            }
            
            if (this.parentCoordinator?.sessionValidated) {
                const contacts = await this.parentCoordinator.routeApiCall('/api/contacts', 'GET');
                if (contacts) {
                    if (window.AppState) {
                        window.AppState.contacts = contacts;
                    }
                    this.cacheContacts(contacts);
                    this.renderContacts(contacts);
                    return contacts;
                }
            }
            
            const apiBase = this.getApiBaseUrl();
            const contacts = await this.apiClient.fetchJSON(`${apiBase}/contacts`);
            
            if (window.AppState) {
                window.AppState.contacts = contacts;
            }
            
            this.cacheContacts(contacts);
            
            const newCallModal = document.getElementById('newCallModal');
            if (newCallModal && newCallModal.classList.contains('active')) {
                this.renderContacts(contacts);
            }
            
            return contacts;
        } catch (error) {
            logErrorOnce('CallAPIIntegration.fetchContacts', error);
            
            const cachedContacts = localStorage.getItem('cachedContacts');
            if (cachedContacts) {
                try {
                    const contacts = JSON.parse(cachedContacts);
                    if (window.AppState) {
                        window.AppState.contacts = contacts;
                    }
                    this.renderContacts(contacts);
                    return contacts;
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached contacts on error');
                }
            }
            
            return [];
        }
    }
    
    cacheContacts(contacts) {
        try {
            localStorage.setItem('cachedContacts', JSON.stringify(contacts));
            localStorage.setItem('cachedContactsTimestamp', Date.now().toString());
        } catch (error) {
            logErrorOnce('CallAPIIntegration.cacheContacts', error);
        }
    }
    
    async fetchCallHistory(forceRefresh = false) {
        try {
            if (!forceRefresh && window.AppState && window.AppState.callHistory?.length > 0) {
                return window.AppState.callHistory;
            }
            
            const cachedHistory = localStorage.getItem('cachedCallHistory');
            if (!forceRefresh && cachedHistory) {
                try {
                    const history = JSON.parse(cachedHistory);
                    if (window.AppState) {
                        window.AppState.callHistory = history;
                    }
                    renderCallHistory();
                    return history;
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached call history');
                }
            }
            
            if (!window.AppState || !window.AppState.isAuthenticated) {
                return window.AppState ? window.AppState.callHistory : [];
            }
            
            if (this.parentCoordinator?.sessionValidated) {
                const history = await this.parentCoordinator.routeApiCall('/api/calls/history', 'GET');
                if (history) {
                    if (window.AppState) {
                        window.AppState.callHistory = history;
                    }
                    this.cacheCallHistory(history);
                    renderCallHistory();
                    return history;
                }
            }
            
            const apiBase = this.getApiBaseUrl();
            const history = await this.apiClient.fetchJSON(`${apiBase}/calls/history`);
            
            if (window.AppState) {
                window.AppState.callHistory = history;
            }
            
            this.cacheCallHistory(history);
            renderCallHistory();
            
            return history;
        } catch (error) {
            logErrorOnce('CallAPIIntegration.fetchCallHistory', error);
            
            const cachedHistory = localStorage.getItem('cachedCallHistory');
            if (cachedHistory) {
                try {
                    const history = JSON.parse(cachedHistory);
                    if (window.AppState) {
                        window.AppState.callHistory = history;
                    }
                    renderCallHistory();
                    return history;
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached call history on error');
                }
            }
            
            return [];
        }
    }
    
    cacheCallHistory(history) {
        try {
            localStorage.setItem('cachedCallHistory', JSON.stringify(history));
            localStorage.setItem('cachedCallHistoryTimestamp', Date.now().toString());
        } catch (error) {
            logErrorOnce('CallAPIIntegration.cacheCallHistory', error);
        }
    }
    
    renderCachedCallHistory() {
        try {
            const cachedHistory = localStorage.getItem('cachedCallHistory');
            if (cachedHistory) {
                try {
                    const history = JSON.parse(cachedHistory);
                    if (window.AppState) {
                        window.AppState.callHistory = history;
                    }
                    renderCallHistory();
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached call history for UI');
                }
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.renderCachedCallHistory', error);
        }
    }
    
    async fetchSettings() {
        try {
            if (window.parent && window.parent.AppState && window.parent.AppState.settings) {
                if (window.AppState) {
                    window.AppState.settings = { ...window.AppState.settings, ...window.parent.AppState.settings };
                }
                applySettingsToUI();
                return window.AppState ? window.AppState.settings : {};
            }
            
            if (!window.AppState || !window.AppState.isAuthenticated) {
                return window.AppState ? window.AppState.settings : {};
            }
            
            if (this.parentCoordinator?.sessionValidated) {
                const settings = await this.parentCoordinator.routeApiCall('/api/user/settings', 'GET');
                if (settings && window.AppState) {
                    window.AppState.settings = { ...window.AppState.settings, ...settings };
                    applySettingsToUI();
                    saveSettings();
                }
                return window.AppState ? window.AppState.settings : {};
            }
            
            const apiBase = this.getApiBaseUrl();
            const settings = await this.apiClient.fetchJSON(`${apiBase}/user/settings`);
            
            if (settings && window.AppState) {
                window.AppState.settings = { ...window.AppState.settings, ...settings };
                applySettingsToUI();
                saveSettings();
            }
            
            return window.AppState ? window.AppState.settings : {};
        } catch (error) {
            logErrorOnce('CallAPIIntegration.fetchSettings', error);
            
            const cachedSettings = localStorage.getItem('callSettings');
            if (cachedSettings && window.AppState) {
                try {
                    const settings = JSON.parse(cachedSettings);
                    window.AppState.settings = { ...window.AppState.settings, ...settings };
                    applySettingsToUI();
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached settings');
                }
            }
            
            return window.AppState ? window.AppState.settings : {};
        }
    }
    
    async checkPremiumStatus() {
        try {
            if (window.parent && window.parent.AppState) {
                if (window.AppState) {
                    window.AppState.isPremium = window.parent.AppState.isPremium || false;
                    window.AppState.trialDaysLeft = window.parent.AppState.trialDaysLeft || 30;
                }
                updatePremiumUI();
                return window.AppState ? window.AppState.isPremium : false;
            }
            
            if (!window.AppState || !window.AppState.isAuthenticated) {
                updatePremiumUI();
                return window.AppState ? window.AppState.isPremium : false;
            }
            
            if (this.parentCoordinator?.sessionValidated) {
                const premiumData = await this.parentCoordinator.routeApiCall('/api/user/premium', 'GET');
                if (premiumData && window.AppState) {
                    window.AppState.isPremium = premiumData.isPremium || false;
                    window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 30;
                    window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                    this.cachePremiumStatus(premiumData);
                    updatePremiumUI();
                }
                return window.AppState ? window.AppState.isPremium : false;
            }
            
            const apiBase = this.getApiBaseUrl();
            const premiumData = await this.apiClient.fetchJSON(`${apiBase}/user/premium`);
            
            if (window.AppState) {
                window.AppState.isPremium = premiumData.isPremium || false;
                window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 30;
                window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                
                this.cachePremiumStatus(premiumData);
                updatePremiumUI();
            }
            return window.AppState ? window.AppState.isPremium : false;
        } catch (error) {
            logErrorOnce('CallAPIIntegration.checkPremiumStatus', error);
            
            const cachedPremium = localStorage.getItem('premiumStatus');
            if (cachedPremium && window.AppState) {
                try {
                    const premiumData = JSON.parse(cachedPremium);
                    window.AppState.isPremium = premiumData.isPremium || false;
                    window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 30;
                    window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached premium status');
                }
            }
            
            updatePremiumUI();
            return window.AppState ? window.AppState.isPremium : false;
        }
    }
    
    cachePremiumStatus(premiumData) {
        try {
            localStorage.setItem('premiumStatus', JSON.stringify({
                isPremium: window.AppState ? window.AppState.isPremium : false,
                trialDaysLeft: window.AppState ? window.AppState.trialDaysLeft : 30,
                features: window.AppState ? window.AppState.premiumFeatures : {}
            }));
        } catch (error) {
            logErrorOnce('CallAPIIntegration.cachePremiumStatus', error);
        }
    }
    
    loadCachedDataToUI() {
        try {
            loadSettings();
            
            const cachedContacts = localStorage.getItem('cachedContacts');
            if (cachedContacts) {
                try {
                    const contacts = JSON.parse(cachedContacts);
                    if (window.AppState) {
                        window.AppState.contacts = contacts;
                    }
                    this.renderContacts(contacts);
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached contacts');
                }
            }
            
            const cachedCalls = localStorage.getItem('cachedCallHistory');
            if (cachedCalls) {
                try {
                    const calls = JSON.parse(cachedCalls);
                    if (window.AppState) {
                        window.AppState.callHistory = calls;
                    }
                    renderCallHistory();
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached call history');
                }
            }
            
            const cachedPremium = localStorage.getItem('premiumStatus');
            if (cachedPremium) {
                try {
                    const premiumData = JSON.parse(cachedPremium);
                    if (window.AppState) {
                        window.AppState.isPremium = premiumData.isPremium || false;
                        window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 30;
                        window.AppState.premiumFeatures = premiumData.features || (window.AppState ? window.AppState.premiumFeatures : {});
                    }
                    updatePremiumUI();
                } catch (e) {
                    console.error('[Calls iframe] Failed to parse cached premium status');
                }
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.loadCachedDataToUI', error);
        }
    }
    
    handleLogout() {
        try {
            this.authCheckDone = false;
            this.backgroundJobsStarted = false;
            this.initialDataLoaded = false;
            
            if (this.backgroundSyncInterval) {
                clearInterval(this.backgroundSyncInterval);
                this.backgroundSyncInterval = null;
            }
            
            this.tokenManager.clearToken();
        } catch (error) {
            logErrorOnce('CallAPIIntegration.handleLogout', error);
        }
    }
    
    renderContacts(contacts) {
        if (!contacts || contacts.length === 0) {
            const contactsList = document.getElementById('contactsList');
            if (contactsList) {
                contactsList.innerHTML = '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No contacts available</p></div>';
            }
            return;
        }
        
        try {
            const contactsList = document.getElementById('contactsList');
            if (!contactsList) return;
            
            let html = '';
            
            contacts.forEach(contact => {
                const isOnline = Math.random() > 0.3;
                const initials = contact.name.split(' ').map(n => n[0]).join('').toUpperCase();
                
                html += `
                    <div class="contact-item" data-id="${contact.id}">
                        <input type="checkbox" class="contact-checkbox" id="contact-${contact.id}">
                        <div class="call-avatar" style="background-color: ${stringToColor(contact.name)}">
                            ${contact.avatar ? `<img src="${contact.avatar}" alt="${contact.name}">` : initials}
                            <div class="call-status-icon ${isOnline ? 'incoming' : 'offline'}">
                                <i class="fas fa-circle"></i>
                            </div>
                        </div>
                        <div class="call-info">
                            <div class="call-name">
                                ${contact.name}
                                ${contact.isPremium ? '<span class="premium-badge">PRO</span>' : ''}
                            </div>
                            <div class="call-details">
                                <span>${isOnline ? 'Online' : 'Offline'}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            contactsList.innerHTML = html;
            const contactsLoading = document.getElementById('contactsLoading');
            if (contactsLoading) {
                contactsLoading.style.display = 'none';
            }
            
            document.querySelectorAll('.contact-item').forEach(item => {
                item.addEventListener('click', function(e) {
                    if (e.target.type === 'checkbox') return;
                    
                    const checkbox = this.querySelector('.contact-checkbox');
                    checkbox.checked = !checkbox.checked;
                    this.classList.toggle('selected', checkbox.checked);
                    
                    updateGroupCallButton();
                });
            });
            
            this.renderGroupContacts(contacts);
        } catch (error) {
            logErrorOnce('CallAPIIntegration.renderContacts', error);
        }
    }
    
    renderGroupContacts(contacts) {
        try {
            const groupContactsList = document.getElementById('groupContactsList');
            if (!groupContactsList) return;
            
            let html = '';
            
            contacts.forEach(contact => {
                const initials = contact.name.split(' ').map(n => n[0]).join('').toUpperCase();
                
                html += `
                    <div class="contact-item" data-id="${contact.id}">
                        <input type="checkbox" class="contact-checkbox group-contact" id="group-contact-${contact.id}">
                        <div class="call-avatar" style="background-color: ${stringToColor(contact.name)}">
                            ${contact.avatar ? `<img src="${contact.avatar}" alt="${contact.name}">` : initials}
                        </div>
                        <div class="call-info">
                            <div class="call-name">
                                ${contact.name}
                            </div>
                        </div>
                    </div>
                `;
            });
            
            groupContactsList.innerHTML = html;
            
            document.querySelectorAll('.group-contact').forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    const item = this.closest('.contact-item');
                    item.classList.toggle('selected', this.checked);
                    
                    updateGroupCallButton();
                });
            });
        } catch (error) {
            logErrorOnce('CallAPIIntegration.renderGroupContacts', error);
        }
    }
    
    cleanup() {
        try {
            if (this.backgroundSyncInterval) {
                clearInterval(this.backgroundSyncInterval);
                this.backgroundSyncInterval = null;
            }
            
            if (this.tokenManager) {
                this.tokenManager.cleanup();
            }
            
            if (this.parentCommunication) {
                this.parentCommunication.cleanup();
            }
            
            if (this.parentCoordinator) {
                this.parentCoordinator.cleanup();
            }
        } catch (error) {
            logErrorOnce('CallAPIIntegration.cleanup', error);
        }
    }
}

// ==================== GLOBAL STATE ====================
export const AppState = {
    isAuthenticated: false,
    authChecked: false,
    user: null,
    
    apiReady: false,
    apiCheckInterval: null,
    
    currentUser: null,
    userPermissions: {},
    callPermissions: {},
    
    isInCall: false,
    currentCall: null,
    activeCallId: null,
    callType: null,
    callParticipants: [],
    callStartTime: null,
    callDurationInterval: null,
    
    localStream: null,
    remoteStreams: new Map(),
    screenStream: null,
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    isSpeakerOn: true,
    
    peer: null,
    connections: new Map(),
    
    currentMood: 'neutral',
    currentIntention: 'quick',
    currentFocusMode: false,
    currentPanel: 'participants',
    currentCategory: 'all',
    
    contacts: [],
    callHistory: [],
    cachedData: {
        contacts: [],
        calls: [],
        notes: {},
        relationshipData: {}
    },
    
    settings: {
        emotionalContext: true,
        callIntention: true,
        inCallChat: true,
        whiteboard: true,
        polls: true,
        notes: true,
        focusMode: false,
        liveReactions: true,
        theme: 'light'
    },
    
    isOnline: navigator.onLine,
    syncPending: false,
    
    isPremium: false,
    trialDaysLeft: 30,
    premiumFeatures: {
        groupCalls: false,
        screenSharing: false,
        whiteboard: false,
        polls: false,
        relationshipInsights: false,
        callLinks: false
    },
    
    chatMessages: [],
    unreadChatCount: 0,
    
    activePoll: null,
    userVotes: {},
    
    relationshipInsights: {}
};

// DOM Elements
export const elements = {};

// ==================== INCOMING CALL SIMULATION FUNCTION ====================
export function simulateIncomingCall(callerId, metadata = {}) {
    if (AppState.isInCall) {
        showNotification('Already in a call', 'warning');
        return false;
    }
    
    try {
        let callerContact = null;
        
        if (AppState.contacts && AppState.contacts.length > 0) {
            callerContact = AppState.contacts.find(c => c.id === callerId);
        }
        
        if (!callerContact) {
            callerContact = {
                id: callerId,
                name: metadata.name || 'Test Caller',
                avatar: metadata.avatar || null,
                isPremium: metadata.isPremium || false
            };
        }
        
        const callMetadata = {
            callType: metadata.callType || 'voice',
            mood: metadata.mood || 'neutral',
            intention: metadata.intention || 'quick',
            isGroup: metadata.isGroup || false,
            callId: metadata.callId || 'simulated-call-' + Date.now(),
            timestamp: Date.now(),
            ...metadata
        };
        
        if (elements.incomingCallModal && elements.incomingCallAvatar && elements.incomingCallName) {
            elements.incomingCallName.textContent = callerContact.name;
            
            if (callerContact.avatar) {
                elements.incomingCallAvatar.src = callerContact.avatar;
                elements.incomingCallAvatar.alt = callerContact.name;
            } else {
                const initials = callerContact.name.split(' ').map(n => n[0]).join('').toUpperCase();
                const bgColor = stringToColor(callerContact.name);
                elements.incomingCallAvatar.style.backgroundColor = bgColor;
                elements.incomingCallAvatar.textContent = initials;
                elements.incomingCallAvatar.src = '';
            }
            
            if (elements.incomingCallType) {
                elements.incomingCallType.textContent = callMetadata.callType === 'video' ? 'Video Call' : 'Voice Call';
                elements.incomingCallType.className = `call-type-badge ${callMetadata.callType}`;
            }
            
            if (elements.incomingCallMood && callMetadata.mood) {
                elements.incomingCallMood.innerHTML = `
                    <div class="mood-indicator mood-${callMetadata.mood}">
                        <i class="fas fa-smile"></i>
                        <span>${callMetadata.mood}</span>
                    </div>
                `;
                elements.incomingCallMood.style.display = 'block';
            } else if (elements.incomingCallMood) {
                elements.incomingCallMood.style.display = 'none';
            }
            
            if (elements.incomingCallIntention && callMetadata.intention) {
                elements.incomingCallIntention.innerHTML = `
                    <div class="intention-indicator intention-${callMetadata.intention}">
                        <i class="fas fa-bullseye"></i>
                        <span>${callMetadata.intention}</span>
                    </div>
                `;
                elements.incomingCallIntention.style.display = 'block';
            } else if (elements.incomingCallIntention) {
                elements.incomingCallIntention.style.display = 'none';
            }
            
            elements.incomingCallModal.classList.add('active');
            
            let timeLeft = 30;
            if (elements.autoDeclineTimer) {
                elements.autoDeclineTimer.textContent = timeLeft;
            }
            
            const declineTimer = setInterval(() => {
                timeLeft--;
                if (elements.autoDeclineTimer) {
                    elements.autoDeclineTimer.textContent = timeLeft;
                }
                
                if (timeLeft <= 0) {
                    clearInterval(declineTimer);
                    handleDeclineSimulatedCall(callMetadata.callId);
                }
            }, 1000);
            
            window._simulatedCallTimer = declineTimer;
            window._simulatedCallMetadata = callMetadata;
            window._simulatedCallerContact = callerContact;
            
            playIncomingCallSound();
            
            emitCallEvent('incoming_call_simulated', {
                callerId: callerId,
                callerContact: callerContact,
                metadata: callMetadata,
                timestamp: Date.now()
            });
            
            if (window.parent && window.parent !== window) {
                try {
                    window.parent.postMessage({
                        type: 'INCOMING_CALL_SIMULATED',
                        source: 'calls-iframe',
                        callerId: callerId,
                        metadata: callMetadata,
                        timestamp: Date.now()
                    }, '*');
                } catch (error) {
                    logErrorOnce('simulateIncomingCall.postMessage', error);
                }
            }
            
            return true;
        } else {
            console.error('[Calls iframe] Could not find required UI elements for incoming call simulation');
            return false;
        }
    } catch (error) {
        logErrorOnce('simulateIncomingCall', error);
        return false;
    }
}

function handleDeclineSimulatedCall(callId) {
    try {
        if (elements.incomingCallModal) {
            elements.incomingCallModal.classList.remove('active');
        }
        
        if (window._simulatedCallTimer) {
            clearInterval(window._simulatedCallTimer);
            window._simulatedCallTimer = null;
        }
        
        emitCallEvent('call_declined', {
            callId: callId,
            reason: 'auto_decline',
            timestamp: Date.now()
        });
        
        showNotification('Simulated call declined (auto)', 'info');
        
        window._simulatedCallMetadata = null;
        window._simulatedCallerContact = null;
        
        stopIncomingCallSound();
    } catch (error) {
        logErrorOnce('handleDeclineSimulatedCall', error);
    }
}

function handleAcceptSimulatedCall(callMetadata, callerContact, isVideo = false) {
    try {
        if (window._simulatedCallTimer) {
            clearInterval(window._simulatedCallTimer);
            window._simulatedCallTimer = null;
        }
        
        if (elements.incomingCallModal) {
            elements.incomingCallModal.classList.remove('active');
        }
        
        AppState.isInCall = true;
        AppState.callType = isVideo ? 'video' : callMetadata.callType;
        AppState.activeCallId = callMetadata.callId;
        AppState.callParticipants = [callerContact];
        AppState.callStartTime = Date.now();
        AppState.currentMood = callMetadata.mood || 'neutral';
        AppState.currentIntention = callMetadata.intention || 'quick';
        
        if (elements.callContainer) {
            elements.callContainer.classList.add('active');
        }
        
        if (elements.appContainer) {
            elements.appContainer.classList.add('in-call');
        }
        
        if (elements.callWithName) {
            elements.callWithName.textContent = callerContact.name;
        }
        
        if (elements.callTypeIcon) {
            elements.callTypeIcon.className = `call-type-icon ${AppState.callType}`;
            elements.callTypeIcon.innerHTML = `<i class="fas fa-${AppState.callType === 'video' ? 'video' : 'phone'}"></i>`;
        }
        
        if (elements.callStatusText) {
            elements.callStatusText.textContent = 'Connected (Simulated)';
        }
        
        updateMoodIndicator(AppState.currentMood);
        updateIntentionIndicator(AppState.currentIntention);
        
        startCallTimer();
        initializeCallFeatures();
        
        if (isVideo || callMetadata.callType === 'video') {
            showSimulatedVideo(callerContact);
        }
        
        emitCallEvent('call_accepted', {
            callId: callMetadata.callId,
            callType: AppState.callType,
            callerContact: callerContact,
            metadata: callMetadata,
            timestamp: Date.now()
        });
        
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({
                    type: 'CALL_ACCEPTED_SIMULATED',
                    source: 'calls-iframe',
                    callId: callMetadata.callId,
                    callType: AppState.callType,
                    callerContact: callerContact,
                    timestamp: Date.now()
                }, '*');
            } catch (error) {
                logErrorOnce('handleAcceptSimulatedCall.postMessage', error);
            }
        }
        
        showNotification(`Simulated ${AppState.callType} call started`, 'success');
        
        window._simulatedCallMetadata = null;
        window._simulatedCallerContact = null;
        stopIncomingCallSound();
    } catch (error) {
        logErrorOnce('handleAcceptSimulatedCall', error);
    }
}

function showSimulatedVideo(callerContact) {
    try {
        if (elements.videoGrid) {
            elements.videoGrid.innerHTML = '';
            
            const localVideoContainer = document.createElement('div');
            localVideoContainer.className = 'video-container local';
            localVideoContainer.innerHTML = `
                <video class="local-video" autoplay muted playsinline></video>
                <div class="video-overlay">
                    <div class="video-name">You (Simulated)</div>
                    <div class="video-status">Simulated Video</div>
                </div>
            `;
            elements.videoGrid.appendChild(localVideoContainer);
            
            const remoteVideoContainer = document.createElement('div');
            remoteVideoContainer.className = 'video-container remote';
            remoteVideoContainer.innerHTML = `
                <div class="video-placeholder" style="background-color: ${stringToColor(callerContact.name)}">
                    <div class="placeholder-initials">${callerContact.name.split(' ').map(n => n[0]).join('').toUpperCase()}</div>
                </div>
                <div class="video-overlay">
                    <div class="video-name">${callerContact.name}</div>
                    <div class="video-status">Simulated Participant</div>
                </div>
            `;
            elements.videoGrid.appendChild(remoteVideoContainer);
            
            updateVideoLayout();
        }
    } catch (error) {
        logErrorOnce('showSimulatedVideo', error);
    }
}

function playIncomingCallSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        
        const pulseTime = 0.5;
        const silenceTime = 1.5;
        
        function playPulse() {
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + pulseTime);
        }
        
        oscillator.start();
        
        playPulse();
        window._soundInterval = setInterval(playPulse, (pulseTime + silenceTime) * 1000);
        window._audioContext = audioContext;
        window._oscillator = oscillator;
        
    } catch (error) {
        logErrorOnce('playIncomingCallSound', error);
    }
}

function stopIncomingCallSound() {
    try {
        if (window._soundInterval) {
            clearInterval(window._soundInterval);
            window._soundInterval = null;
        }
        
        if (window._oscillator) {
            window._oscillator.stop();
            window._oscillator = null;
        }
        
        if (window._audioContext) {
            window._audioContext.close();
            window._audioContext = null;
        }
    } catch (error) {
        logErrorOnce('stopIncomingCallSound', error);
    }
}

function emitCallEvent(eventType, data) {
    try {
        const event = new CustomEvent(`call:${eventType}`, { detail: data });
        window.dispatchEvent(event);
        
        if (window.EventBus) {
            window.EventBus.emit(`call.${eventType}`, data);
        }
    } catch (error) {
        logErrorOnce('emitCallEvent', error);
    }
}

// ==================== EXPORTED FUNCTIONS ====================
export function cacheElements() {
    try {
        elements.menuDotsBtn = document.getElementById('menuDotsBtn');
        elements.menuDotsDropdown = document.getElementById('menuDotsDropdown');
        elements.menuParticipants = document.getElementById('menuParticipants');
        elements.menuChat = document.getElementById('menuChat');
        elements.menuWhiteboard = document.getElementById('menuWhiteboard');
        elements.menuNotes = document.getElementById('menuNotes');
        elements.menuPolls = document.getElementById('menuPolls');
        elements.menuRelationship = document.getElementById('menuRelationship');
        elements.participantBadge = document.getElementById('participantBadge');
        elements.chatBadge = document.getElementById('chatBadge');
        
        elements.offlineBanner = document.getElementById('offlineBanner');
        elements.apiStatusIndicator = document.getElementById('apiStatusIndicator');
        elements.apiStatusText = document.getElementById('apiStatusText');
        
        elements.urlParamOverlay = document.getElementById('urlParamOverlay');
        elements.urlParamText = document.getElementById('urlParamText');
        elements.urlParamCancelBtn = document.getElementById('urlParamCancelBtn');
        elements.urlParamJoinBtn = document.getElementById('urlParamJoinBtn');
        
        elements.incomingCallModal = document.getElementById('incomingCallModal');
        elements.incomingCallAvatar = document.getElementById('incomingCallAvatar');
        elements.incomingCallName = document.getElementById('incomingCallName');
        elements.incomingCallType = document.getElementById('incomingCallType');
        elements.incomingCallMood = document.getElementById('incomingCallMood');
        elements.incomingCallIntention = document.getElementById('incomingCallIntention');
        elements.declineCallBtn = document.getElementById('declineCallBtn');
        elements.acceptCallBtn = document.getElementById('acceptCallBtn');
        elements.acceptVideoCallBtn = document.getElementById('acceptVideoCallBtn');
        elements.autoDeclineTimer = document.getElementById('autoDeclineTimer');
        elements.declineTimer = document.getElementById('declineTimer');
        
        elements.newCallModal = document.getElementById('newCallModal');
        elements.newCallBtn = document.getElementById('newCallBtn');
        elements.closeNewCallModal = document.getElementById('closeNewCallModal');
        
        elements.contactSearch = document.getElementById('contactSearch');
        elements.contactsList = document.getElementById('contactsList');
        elements.offlineContactsMessage = document.getElementById('offlineContactsMessage');
        elements.contactsLoading = document.getElementById('contactsLoading');
        elements.startVoiceCallBtn = document.getElementById('startVoiceCallBtn');
        elements.startVideoCallBtn = document.getElementById('startVideoCallBtn');
        
        elements.groupContactSearch = document.getElementById('groupContactSearch');
        elements.groupContactsList = document.getElementById('groupContactsList');
        elements.instantGroupOption = document.getElementById('instantGroupOption');
        elements.scheduledGroupOption = document.getElementById('scheduledGroupOption');
        elements.startGroupCallBtn = document.getElementById('startGroupCallBtn');
        
        elements.callLinkInput = document.getElementById('callLinkInput');
        elements.copyLinkBtn = document.getElementById('copyLinkBtn');
        elements.shareLinkBtn = document.getElementById('shareLinkBtn');
        elements.generateVoiceLinkBtn = document.getElementById('generateVoiceLinkBtn');
        elements.generateVideoLinkBtn = document.getElementById('generateVideoLinkBtn');
        
        elements.paymentModal = document.getElementById('paymentModal');
        elements.mpesaOption = document.getElementById('mpesaOption');
        elements.mpesaForm = document.getElementById('mpesaForm');
        elements.phoneNumber = document.getElementById('phoneNumber');
        elements.paymentAmount = document.getElementById('paymentAmount');
        elements.cancelPaymentBtn = document.getElementById('cancelPaymentBtn');
        elements.processPaymentBtn = document.getElementById('processPaymentBtn');
        
        elements.premiumLimitOverlay = document.getElementById('premiumLimitOverlay');
        elements.premiumLimitText = document.getElementById('premiumLimitText');
        elements.cancelUpgradeBtn = document.getElementById('cancelUpgradeBtn');
        elements.upgradeNowBtn = document.getElementById('upgradeNowBtn');
        
        elements.moodSelectionModal = document.getElementById('moodSelectionModal');
        elements.cancelMoodBtn = document.getElementById('cancelMoodBtn');
        elements.setMoodBtn = document.getElementById('setMoodBtn');
        
        elements.intentionSelectionModal = document.getElementById('intentionSelectionModal');
        elements.cancelIntentionBtn = document.getElementById('cancelIntentionBtn');
        elements.setIntentionBtn = document.getElementById('setIntentionBtn');
        
        elements.privateNotesModal = document.getElementById('privateNotesModal');
        elements.privateNotesTitle = document.getElementById('privateNotesTitle');
        elements.privateNotesSubtitle = document.getElementById('privateNotesSubtitle');
        elements.privateNotesTextarea = document.getElementById('privateNotesTextarea');
        elements.skipNotesBtn = document.getElementById('skipNotesBtn');
        elements.saveNotesBtn = document.getElementById('saveNotesBtn');
        
        elements.callSummaryModal = document.getElementById('callSummaryModal');
        elements.summaryDuration = document.getElementById('summaryDuration');
        elements.summaryTime = document.getElementById('summaryTime');
        elements.summaryType = document.getElementById('summaryType');
        elements.summaryMood = document.getElementById('summaryMood');
        elements.summaryIntention = document.getElementById('summaryIntention');
        elements.summaryParticipants = document.getElementById('summaryParticipants');
        elements.summaryDoneBtn = document.getElementById('summaryDoneBtn');
        
        elements.appContainer = document.getElementById('appContainer');
        elements.sidebar = document.getElementById('sidebar');
        elements.quickVoiceBtn = document.getElementById('quickVoiceBtn');
        elements.quickVideoBtn = document.getElementById('quickVideoBtn');
        elements.quickGroupBtn = document.getElementById('quickGroupBtn');
        
        elements.settingsToggle = document.getElementById('settingsToggle');
        elements.settingsToggleIcon = document.getElementById('settingsToggleIcon');
        elements.settingsPanel = document.getElementById('settingsPanel');
        elements.emotionalContextToggle = document.getElementById('emotionalContextToggle');
        elements.callIntentionToggle = document.getElementById('callIntentionToggle');
        elements.inCallChatToggle = document.getElementById('inCallChatToggle');
        elements.whiteboardToggle = document.getElementById('whiteboardToggle');
        elements.pollsToggle = document.getElementById('pollsToggle');
        elements.notesToggle = document.getElementById('notesToggle');
        elements.focusModeToggle = document.getElementById('focusModeToggle');
        elements.liveReactionsToggle = document.getElementById('liveReactionsToggle');
        elements.resetSettingsBtn = document.getElementById('resetSettingsBtn');
        
        elements.syncIndicator = document.getElementById('syncIndicator');
        elements.allCallsSection = document.getElementById('allCallsSection');
        elements.missedCallsSection = document.getElementById('missedCallsSection');
        elements.groupCallsSection = document.getElementById('groupCallsSection');
        elements.allCallsList = document.getElementById('allCallsList');
        elements.missedCallsList = document.getElementById('missedCallsList');
        elements.groupCallsList = document.getElementById('groupCallsList');
        elements.offlineCallsState = document.getElementById('offlineCallsState');
        elements.callsLoading = document.getElementById('callsLoading');
        
        elements.callContainer = document.getElementById('callContainer');
        elements.focusModeBtn = document.getElementById('focusModeBtn');
        elements.callHeader = document.getElementById('callHeader');
        elements.callTypeIcon = document.getElementById('callTypeIcon');
        elements.callWithName = document.getElementById('callWithName');
        elements.callStatusText = document.getElementById('callStatusText');
        elements.callMoodIndicator = document.getElementById('callMoodIndicator');
        elements.callIntentionIndicator = document.getElementById('callIntentionIndicator');
        elements.callDuration = document.getElementById('callDuration');
        
        elements.videoGrid = document.getElementById('videoGrid');
        elements.offlineCallPlaceholder = document.getElementById('offlineCallPlaceholder');
        
        elements.reactionsContainer = document.getElementById('reactionsContainer');
        
        elements.callControls = document.getElementById('callControls');
        elements.muteBtn = document.getElementById('muteBtn');
        elements.videoBtn = document.getElementById('videoBtn');
        elements.screenShareBtn = document.getElementById('screenShareBtn');
        elements.speakerBtn = document.getElementById('speakerBtn');
        elements.moodBtn = document.getElementById('moodBtn');
        elements.intentionBtn = document.getElementById('intentionBtn');
        elements.endCallBtn = document.getElementById('endCallBtn');
        
        elements.pipContainer = document.getElementById('pipContainer');
        elements.pipVideo = document.getElementById('pipVideo');
        elements.pipCloseBtn = document.getElementById('pipCloseBtn');
        
        elements.notificationArea = document.getElementById('notificationArea');
        elements.notificationToast = document.getElementById('notificationToast');
        elements.notificationMessage = document.getElementById('notificationMessage');
    } catch (error) {
        logErrorOnce('cacheElements', error);
    }
}

export function initializeOfflineDetection() {
    try {
        AppState.isOnline = navigator.onLine;
        
        if (!AppState.isOnline) {
            handleOffline();
        }
    } catch (error) {
        logErrorOnce('initializeOfflineDetection', error);
    }
}

export function handleOnline() {
    try {
        AppState.isOnline = true;
        
        if (elements.offlineBanner) {
            elements.offlineBanner.classList.remove('active');
        }
        
        if (elements.appContainer) {
            elements.appContainer.classList.remove('offline-ui');
        }
        
        if (elements.syncIndicator) {
            elements.syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Syncing...</span>';
            elements.syncIndicator.classList.add('syncing');
        }
        
        if (window.callAPI && AppState.isAuthenticated) {
            window.callAPI.initializeBackgroundSync();
        }
        
        enableUI();
    } catch (error) {
        logErrorOnce('handleOnline', error);
    }
}

export function handleOffline() {
    try {
        AppState.isOnline = false;
        
        if (elements.offlineBanner) {
            elements.offlineBanner.classList.add('active');
        }
        
        if (elements.appContainer) {
            elements.appContainer.classList.add('offline-ui');
        }
        
        if (elements.syncIndicator) {
            elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
            elements.syncIndicator.classList.remove('syncing');
        }
        
        showOfflineUI();
    } catch (error) {
        logErrorOnce('handleOffline', error);
    }
}

export function showOfflineUI() {
    try {
        if (elements.callContainer && elements.callContainer.classList.contains('active')) {
            if (elements.offlineCallPlaceholder) {
                elements.offlineCallPlaceholder.style.display = 'flex';
            }
            if (elements.videoGrid) {
                elements.videoGrid.style.display = 'none';
            }
        }
        
        if (elements.offlineContactsMessage) {
            elements.offlineContactsMessage.style.display = 'block';
        }
        
        if (elements.offlineCallsState) {
            elements.offlineCallsState.style.display = 'flex';
        }
        
        if (elements.callsLoading) {
            elements.callsLoading.style.display = 'none';
        }
        
        if (window.callAPI) {
            window.callAPI.loadCachedDataToUI();
        }
    } catch (error) {
        logErrorOnce('showOfflineUI', error);
    }
}

export function enableUI() {
    const isAuthenticated = parentCoordinator ? 
        parentCoordinator.sessionValidated : 
        AppState.isAuthenticated;
    
    try {
        if (elements.newCallBtn) {
            elements.newCallBtn.disabled = !isAuthenticated;
        }
        
        if (elements.quickVoiceBtn) {
            elements.quickVoiceBtn.disabled = !isAuthenticated;
        }
        if (elements.quickVideoBtn) {
            elements.quickVideoBtn.disabled = !isAuthenticated;
        }
        
        if (elements.quickGroupBtn) {
            if (isAuthenticated && AppState.premiumFeatures.groupCalls) {
                elements.quickGroupBtn.disabled = false;
            } else {
                elements.quickGroupBtn.disabled = true;
            }
        }
        
        if (AppState.isOnline) {
            if (elements.syncIndicator) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
            }
            
            if (elements.offlineCallsState) {
                elements.offlineCallsState.style.display = 'none';
            }
            if (elements.offlineContactsMessage) {
                elements.offlineContactsMessage.style.display = 'none';
            }
            
            if (AppState.syncPending && window.callAPI) {
                window.callAPI.performBackgroundSync();
            }
        } else {
            if (elements.syncIndicator) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
            }
            showOfflineUI();
        }
        
        applySettingsToUI();
    } catch (error) {
        logErrorOnce('enableUI', error);
    }
}

export function initializeUI() {
    try {
        if (elements.callsLoading) elements.callsLoading.style.display = 'none';
        if (elements.contactsLoading) elements.contactsLoading.style.display = 'none';
        
        updateMoodIndicator('neutral');
        updateIntentionIndicator('quick');
        
        initializeNotifications();
    } catch (error) {
        logErrorOnce('initializeUI', error);
    }
}

export function initializeNotifications() {
    try {
        if (elements.notificationToast) {
            elements.notificationToast.style.display = 'none';
        }
    } catch (error) {
        logErrorOnce('initializeNotifications', error);
    }
}

export function showNotification(message, type = 'success') {
    try {
        const notification = document.createElement('div');
        notification.className = `call-notification ${type}`;
        
        notification.innerHTML = `
            <div class="call-notification-content">
                <div class="call-notification-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                <div class="call-notification-message">${message}</div>
            </div>
            <button class="call-notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        if (elements.notificationArea) {
            elements.notificationArea.appendChild(notification);
        } else {
            const notificationArea = document.createElement('div');
            notificationArea.id = 'notificationArea';
            notificationArea.className = 'notification-area';
            document.body.appendChild(notificationArea);
            notificationArea.appendChild(notification);
        }
        
        const closeBtn = notification.querySelector('.call-notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.remove();
            });
        }
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    } catch (error) {
        logErrorOnce('showNotification', error);
    }
}

export function makeDraggable(element) {
    if (!element) return;
    
    try {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        const dragElement = element.querySelector('.pip-controls') || element;
        
        if (dragElement) {
            dragElement.onmousedown = dragMouseDown;
        }
        
        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        
        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    } catch (error) {
        logErrorOnce('makeDraggable', error);
    }
}

export function closePip() {
    try {
        if (elements.pipContainer) {
            elements.pipContainer.style.display = 'none';
        }
    } catch (error) {
        logErrorOnce('closePip', error);
    }
}

export function checkPremiumFeature(feature) {
    if (AppState.isPremium || AppState.premiumFeatures[feature]) {
        return true;
    }
    
    let message = '';
    switch (feature) {
        case 'groupCalls':
            message = 'Group calls are a premium feature. Upgrade to connect with multiple people at once.';
            break;
        case 'screenSharing':
            message = 'Screen sharing is a premium feature. Upgrade to share your screen during calls.';
            break;
        case 'whiteboard':
            message = 'Collaborative whiteboard is a premium feature. Upgrade to draw and brainstorm together.';
            break;
        case 'polls':
            message = 'In-call polls are a premium feature. Upgrade to create and vote on polls during calls.';
            break;
        case 'relationshipInsights':
            message = 'Relationship insights are a premium feature. Upgrade to see call patterns and history.';
            break;
        default:
            message = 'This is a premium feature. Upgrade to access all advanced features.';
    }
    
    try {
        if (elements.premiumLimitText) {
            elements.premiumLimitText.textContent = message;
        }
        if (elements.premiumLimitOverlay) {
            elements.premiumLimitOverlay.classList.add('active');
        }
    } catch (error) {
        logErrorOnce('checkPremiumFeature', error);
    }
    
    return false;
}

export function updatePremiumUI() {
    if (!elements.quickGroupBtn || !elements.screenShareBtn) return;
    
    try {
        if (AppState.isPremium) {
            document.querySelectorAll('.premium-badge-small').forEach(badge => {
                if (badge) {
                    badge.style.display = 'none';
                }
            });
            
            elements.quickGroupBtn.disabled = false;
            elements.screenShareBtn.disabled = false;
        } else {
            document.querySelectorAll('.premium-badge-small').forEach(badge => {
                if (badge) {
                    badge.style.display = 'block';
                }
            });
            
            elements.quickGroupBtn.disabled = true;
            elements.screenShareBtn.disabled = true;
        }
    } catch (error) {
        logErrorOnce('updatePremiumUI', error);
    }
}

export function loadSettings() {
    return new Promise((resolve) => {
        try {
            const savedSettings = localStorage.getItem('callSettings');
            if (savedSettings) {
                AppState.settings = { ...AppState.settings, ...JSON.parse(savedSettings) };
                applySettingsToUI();
            }
            resolve();
        } catch (error) {
            logErrorOnce('loadSettings', error);
            resolve();
        }
    });
}

export function saveSettings() {
    try {
        localStorage.setItem('callSettings', JSON.stringify(AppState.settings));
    } catch (error) {
        logErrorOnce('saveSettings', error);
    }
}

export function applySettingsToUI() {
    try {
        if (elements.emotionalContextToggle) elements.emotionalContextToggle.checked = AppState.settings.emotionalContext;
        if (elements.callIntentionToggle) elements.callIntentionToggle.checked = AppState.settings.callIntention;
        if (elements.inCallChatToggle) elements.inCallChatToggle.checked = AppState.settings.inCallChat;
        if (elements.whiteboardToggle) elements.whiteboardToggle.checked = AppState.settings.whiteboard;
        if (elements.pollsToggle) elements.pollsToggle.checked = AppState.settings.polls;
        if (elements.notesToggle) elements.notesToggle.checked = AppState.settings.notes;
        if (elements.focusModeToggle) elements.focusModeToggle.checked = AppState.settings.focusMode;
        if (elements.liveReactionsToggle) elements.liveReactionsToggle.checked = AppState.settings.liveReactions;
    } catch (error) {
        logErrorOnce('applySettingsToUI', error);
    }
}

export function updateSetting(event) {
    try {
        const setting = event.target.id.replace('Toggle', '');
        AppState.settings[setting] = event.target.checked;
        saveSettings();
        applySettingChange(setting, event.target.checked);
    } catch (error) {
        logErrorOnce('updateSetting', error);
    }
}

export function applySettingChange(setting, value) {
    try {
        switch (setting) {
            case 'emotionalContext':
                if (!value) {
                    if (elements.callMoodIndicator) {
                        elements.callMoodIndicator.style.display = 'none';
                    }
                    if (elements.callIntentionIndicator) {
                        elements.callIntentionIndicator.style.display = 'none';
                    }
                }
                break;
            case 'focusMode':
                if (AppState.isInCall) {
                    if (value) {
                        enableFocusMode();
                    } else {
                        disableFocusMode();
                    }
                }
                break;
            case 'liveReactions':
                if (elements.reactionsContainer) {
                    elements.reactionsContainer.style.display = value ? 'flex' : 'none';
                }
                break;
            case 'inCallChat':
                if (!value && AppState.isInCall) {
                    showNotification('Chat disabled', 'info');
                }
                break;
        }
    } catch (error) {
        logErrorOnce('applySettingChange', error);
    }
}

export function resetSettings() {
    try {
        if (confirm('Reset all settings to defaults?')) {
            AppState.settings = {
                emotionalContext: true,
                callIntention: true,
                inCallChat: true,
                whiteboard: true,
                polls: true,
                notes: true,
                focusMode: false,
                liveReactions: true,
                theme: 'light'
            };
            
            saveSettings();
            applySettingsToUI();
            showNotification('Settings reset to defaults', 'success');
        }
    } catch (error) {
        logErrorOnce('resetSettings', error);
    }
}

export function handleParentMessage(event) {
    if (parentCoordinator && parentCoordinator.secureChannelEstablished) {
        return;
    }
    
    const allowedOrigins = [window.location.origin, 'http://localhost:*', 'https://yourdomain.com'];
    if (!allowedOrigins.some(origin => event.origin.match(new RegExp(origin.replace('*', '.*'))))) {
        return;
    }
    
    const data = event.data;
    if (!data || typeof data !== 'object') {
        return;
    }
    
    try {
        switch (data.type) {
            case 'USER_DATA':
                handleParentUserData(data.payload);
                break;
            case 'AUTH_UPDATE':
                handleAuthUpdate(data.payload);
                break;
            case 'DATA_REFRESH':
                handleDataRefresh(data.payload);
                break;
            case 'START_CALL':
                handleStartCallRequest(data.payload);
                break;
            case 'SYNC_REQUEST':
                handleSyncRequest();
                break;
            case 'API_READY':
                handleApiReady();
                break;
        }
    } catch (error) {
        logErrorOnce('handleParentMessage', error, `type: ${data?.type}`);
    }
}

export function handleParentUserData(payload) {
    if (window.callAPI && window.callAPI.parentCommunication) {
        window.callAPI.parentCommunication.handleParentUserData(payload);
    }
}

export function handleAuthUpdate(payload) {
    if (window.callAPI && window.callAPI.parentCommunication) {
        window.callAPI.parentCommunication.handleAuthUpdate(payload);
    }
}

export function handleApiReady() {
    try {
        AppState.apiReady = true;
        
        if (window.callAPI && window.callAPI.tokenManager) {
            setTimeout(() => window.callAPI.tokenManager.tryGetTokenFromAPI(), 100);
        }
    } catch (error) {
        logErrorOnce('handleApiReady', error);
    }
}

export function handleDataRefresh(payload) {
    if (window.callAPI && AppState.isAuthenticated) {
        window.callAPI.performBackgroundSync();
        showNotification('Refreshing data...', 'info');
    }
}

export function handleStartCallRequest(payload) {
    if (payload && payload.contactId && AppState.contacts && AppState.contacts.length > 0) {
        const contact = AppState.contacts.find(c => c.id === payload.contactId);
        if (contact) {
            const callType = payload.callType || 'voice';
            startCall(callType, [contact]);
        }
    }
}

export function handleSyncRequest() {
    if (window.callAPI && AppState.isAuthenticated) {
        window.callAPI.performBackgroundSync();
    }
}

export function handleStorageEvent(event) {
    try {
        if (event.key === 'callSettings') {
            const newSettings = JSON.parse(event.newValue);
            AppState.settings = { ...AppState.settings, ...newSettings };
            applySettingsToUI();
        }
        
        if (event.key === 'authUser' || event.key === 'currentUser') {
            const userData = JSON.parse(event.newValue);
            if (userData) {
                if (!AppState.isAuthenticated) {
                    AppState.user = userData;
                    AppState.currentUser = userData;
                    
                    if (elements.apiStatusIndicator && elements.apiStatusText) {
                        elements.apiStatusIndicator.className = 'api-status-indicator connected';
                        elements.apiStatusText.textContent = `Authenticated as ${userData.name || userData.username || 'User'}`;
                        
                        setTimeout(() => {
                            if (elements.apiStatusIndicator) {
                                elements.apiStatusIndicator.style.display = 'none';
                            }
                        }, 2000);
                    }
                }
            }
        }
        
        if (event.key === 'USER_TOKEN') {
            if (window.callAPI && window.callAPI.tokenManager) {
                const newToken = event.newValue;
                if (newToken && window.callAPI.tokenManager.validateToken(newToken)) {
                    window.callAPI.tokenManager.setToken(newToken);
                }
            }
        }
    } catch (error) {
        logErrorOnce('handleStorageEvent', error);
    }
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function stringToColor(str) {
    if (!str) return '#000000';
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const color = Math.floor(Math.abs((Math.sin(hash) * 16777215) % 16777215)).toString(16);
    return '#' + '0'.repeat(6 - color.length) + color;
}

export function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Unknown';
    
    try {
        const now = new Date();
        const date = new Date(timestamp);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else {
            return date.toLocaleDateString();
        }
    } catch (error) {
        return 'Unknown';
    }
}

export function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function checkUrlParameters() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const callId = urlParams.get('call');
        const callType = urlParams.get('type');
        
        if (callId && elements.urlParamText && elements.urlParamOverlay) {
            elements.urlParamText.textContent = `You've been invited to join a ${callType || 'voice'} call. Would you like to join now?`;
            elements.urlParamOverlay.classList.add('active');
        }
    } catch (error) {
        logErrorOnce('checkUrlParameters', error);
    }
}

export function closeUrlParamOverlay() {
    try {
        if (elements.urlParamOverlay) {
            elements.urlParamOverlay.classList.remove('active');
        }
        
        const url = new URL(window.location);
        url.searchParams.delete('call');
        url.searchParams.delete('type');
        window.history.replaceState({}, '', url);
    } catch (error) {
        logErrorOnce('closeUrlParamOverlay', error);
    }
}

export function joinUrlParamCall() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const callId = urlParams.get('call');
        const callType = urlParams.get('type') || 'voice';
        
        showNotification(`Joining ${callType} call...`, 'info');
        closeUrlParamOverlay();
        
        setTimeout(() => {
            const randomContact = AppState.contacts && AppState.contacts.length > 0 ? 
                AppState.contacts[0] : 
                { id: 'remote', name: 'Remote Participant' };
            
            AppState.isInCall = true;
            AppState.callType = callType;
            AppState.callParticipants = [randomContact];
            AppState.callStartTime = Date.now();
            
            showCallUI();
            startCallTimer();
            initializeCallFeatures();
            
            showNotification(`Joined ${callType} call`, 'success');
        }, 1000);
    } catch (error) {
        logErrorOnce('joinUrlParamCall', error);
    }
}

export function updateMoodIndicator(mood) {
    if (!AppState.settings.emotionalContext || !elements.callMoodIndicator) return;
    
    try {
        const moodNames = {
            happy: 'Happy',
            neutral: 'Neutral',
            sad: 'Sad',
            angry: 'Angry',
            tired: 'Tired',
            excited: 'Excited'
        };
        
        elements.callMoodIndicator.innerHTML = `
            <div class="mood-indicator mood-${mood}" style="display: inline-flex; margin-top: 5px;">
                <i class="fas fa-smile"></i>
                <span>${moodNames[mood] || mood}</span>
            </div>
        `;
        elements.callMoodIndicator.style.display = 'block';
    } catch (error) {
        logErrorOnce('updateMoodIndicator', error);
    }
}

export function updateIntentionIndicator(intention) {
    if (!AppState.settings.callIntention || !elements.callIntentionIndicator) return;
    
    try {
        const intentionNames = {
            quick: 'Quick Chat',
            important: 'Important Discussion',
            emergency: 'Emergency',
            checkin: 'Check-in',
            work: 'Work/Business'
        };
        
        elements.callIntentionIndicator.innerHTML = `
            <div class="intention-indicator intention-${intention}" style="display: inline-flex; margin-top: 5px;">
                <i class="fas fa-bullseye"></i>
                <span>${intentionNames[intention] || intention}</span>
            </div>
        `;
        elements.callIntentionIndicator.style.display = 'block';
    } catch (error) {
        logErrorOnce('updateIntentionIndicator', error);
    }
}

export function updateParticipantBadge() {
    if (!elements.participantBadge) return;
    
    try {
        const count = AppState.callParticipants.length + 1;
        elements.participantBadge.textContent = count;
    } catch (error) {
        logErrorOnce('updateParticipantBadge', error);
    }
}

export function updateChatBadge() {
    if (!elements.chatBadge) return;
    
    try {
        elements.chatBadge.textContent = AppState.unreadChatCount;
        if (AppState.unreadChatCount > 0) {
            elements.chatBadge.style.display = 'block';
        } else {
            elements.chatBadge.style.display = 'none';
        }
    } catch (error) {
        logErrorOnce('updateChatBadge', error);
    }
}

export function updateGroupCallButton() {
    if (!elements.startGroupCallBtn) return;
    
    try {
        const selectedContacts = document.querySelectorAll('.group-contact:checked').length;
        const hasGroupOption = document.querySelector('.option-item.selected') !== null;
        
        elements.startGroupCallBtn.disabled = !(selectedContacts >= 1 && hasGroupOption);
    } catch (error) {
        logErrorOnce('updateGroupCallButton', error);
    }
}

export function updateVideoLayout() {
    if (!elements.videoGrid) return;
    
    try {
        const videoContainers = elements.videoGrid.querySelectorAll('.video-container');
        const count = videoContainers.length;
        
        videoContainers.forEach(container => {
            container.classList.remove('large');
        });
        
        if (count === 1) {
            videoContainers[0].classList.add('large');
        } else if (count === 3) {
            const pinned = elements.videoGrid.querySelector('.video-container.pinned');
            if (pinned) {
                pinned.classList.add('large');
            } else {
                videoContainers[0].classList.add('large');
            }
        }
    } catch (error) {
        logErrorOnce('updateVideoLayout', error);
    }
}

export function initializeWhiteboard(canvas) {
    if (!canvas) return;
    
    try {
        const ctx = canvas.getContext('2d');
        let drawing = false;
        let currentTool = 'pen';
        let currentColor = '#ff3b30';
        let currentSize = 3;
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        function startDrawing(e) {
            drawing = true;
            draw(e);
        }
        
        function stopDrawing() {
            drawing = false;
            ctx.beginPath();
        }
        
        function draw(e) {
            if (!drawing) return;
            
            ctx.lineWidth = currentSize;
            ctx.strokeStyle = currentColor;
            
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
        }
        
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);
        
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            startDrawing(touch);
        });
        
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            draw(touch);
        });
        
        canvas.addEventListener('touchend', stopDrawing);
        
        const panel = canvas.closest('.whiteboard-panel');
        if (panel) {
            panel.querySelectorAll('.tool-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    panel.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentTool = this.dataset.tool;
                });
            });
            
            panel.querySelectorAll('.tool-color').forEach(colorBtn => {
                colorBtn.addEventListener('click', function() {
                    panel.querySelectorAll('.tool-color').forEach(c => c.classList.remove('selected'));
                    this.classList.add('selected');
                    currentColor = this.dataset.color;
                });
            });
            
            const sizeSlider = panel.querySelector('.tool-size-slider');
            if (sizeSlider) {
                sizeSlider.addEventListener('input', function() {
                    currentSize = parseInt(this.value);
                });
            }
        }
    } catch (error) {
        logErrorOnce('initializeWhiteboard', error);
    }
}

export function sendChatMessage(message) {
    if (!message) return;
    
    try {
        const chatMessages = document.querySelector('#chatMessagesPanel');
        if (chatMessages) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message user';
            messageDiv.innerHTML = `
                <div class="message-sender">You</div>
                <div class="message-content">${message}</div>
                <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            `;
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        setTimeout(() => {
            if (AppState.callParticipants && AppState.callParticipants.length > 0) {
                const participant = AppState.callParticipants[0];
                const responses = [
                    "Thanks for sharing!",
                    "I agree with that.",
                    "Let's discuss this further.",
                    "Interesting point.",
                    "Can you elaborate on that?"
                ];
                const response = responses[Math.floor(Math.random() * responses.length)];
                
                if (chatMessages) {
                    const responseDiv = document.createElement('div');
                    responseDiv.className = 'chat-message other';
                    responseDiv.innerHTML = `
                        <div class="message-sender">${participant.name}</div>
                        <div class="message-content">${response}</div>
                        <div class="message-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    `;
                    chatMessages.appendChild(responseDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
        }, 1000 + Math.random() * 2000);
        
        AppState.unreadChatCount++;
        updateChatBadge();
        showNotification('Message sent', 'success');
    } catch (error) {
        logErrorOnce('sendChatMessage', error);
    }
}

export function saveSharedNotes(notes) {
    if (!notes) return;
    
    try {
        const callNotes = JSON.parse(localStorage.getItem('sharedCallNotes') || '[]');
        callNotes.push({
            notes: notes,
            timestamp: new Date().toISOString(),
            callId: AppState.activeCallId || 'general'
        });
        localStorage.setItem('sharedCallNotes', JSON.stringify(callNotes));
    } catch (error) {
        logErrorOnce('saveSharedNotes', error);
    }
}

export function renderCallHistory() {
    if (!elements.callsLoading || !elements.allCallsList || !elements.missedCallsList || !elements.groupCallsList) return;
    
    try {
        elements.callsLoading.style.display = 'none';
        
        if (!AppState.callHistory || AppState.callHistory.length === 0) {
            elements.allCallsList.innerHTML = '<div class="offline-state"><i class="fas fa-phone-slash"></i><p>No call history</p><p class="subtext">Make your first call to see it here</p></div>';
            return;
        }
        
        let allCallsHtml = '';
        let missedCallsHtml = '';
        let groupCallsHtml = '';
        
        AppState.callHistory.forEach(call => {
            const callItem = createCallHistoryItem(call);
            
            allCallsHtml += callItem;
            
            if (call.status === 'missed') {
                missedCallsHtml += callItem;
            }
            
            if (call.isGroup) {
                groupCallsHtml += callItem;
            }
        });
        
        elements.allCallsList.innerHTML = allCallsHtml || '<div class="offline-state"><i class="fas fa-phone-slash"></i><p>No calls</p></div>';
        elements.missedCallsList.innerHTML = missedCallsHtml || '<div class="offline-state"><i class="fas fa-phone-slash"></i><p>No missed calls</p><p class="subtext">All calls have been answered</p></div>';
        elements.groupCallsList.innerHTML = groupCallsHtml || '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No group calls yet</p><p class="subtext">Start your first group call to see it here</p></div>';
        
        document.querySelectorAll('.call-action-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const callItem = this.closest('.call-item');
                const contactId = callItem.dataset.contactId;
                const contact = AppState.contacts.find(c => c.id === contactId);
                
                if (contact) {
                    startCall('voice', [contact]);
                }
            });
        });
    } catch (error) {
        logErrorOnce('renderCallHistory', error);
    }
}

export function createCallHistoryItem(call) {
    if (!call) return '';
    
    try {
        const contact = AppState.contacts?.find(c => c.id === call.contactId) || { name: call.contactName || 'Unknown' };
        const initials = contact.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const timeAgo = formatTimeAgo(call.timestamp);
        
        let statusIcon = '';
        let statusClass = '';
        
        if (call.status === 'incoming') {
            statusIcon = '<i class="fas fa-phone-alt"></i>';
            statusClass = 'incoming';
        } else if (call.status === 'outgoing') {
            statusIcon = '<i class="fas fa-phone-alt"></i>';
            statusClass = 'outgoing';
        } else if (call.status === 'missed') {
            statusIcon = '<i class="fas fa-phone-slash"></i>';
            statusClass = 'missed';
        }
        
        return `
            <div class="call-item" data-contact-id="${call.contactId}">
                <div class="call-avatar" style="background-color: ${stringToColor(contact.name)}">
                    ${contact.avatar ? `<img src="${contact.avatar}" alt="${contact.name}">` : initials}
                    <div class="call-status-icon ${statusClass}">
                        ${statusIcon}
                    </div>
                </div>
                <div class="call-info">
                    <div class="call-name">
                        <span>${contact.name}</span>
                        <span class="call-time">${timeAgo}</span>
                    </div>
                    <div class="call-details">
                        <span>${call.type === 'video' ? 'Video Call' : 'Voice Call'}</span>
                        ${call.duration ? `<span>• ${formatDuration(call.duration)}</span>` : ''}
                        ${call.isGroup ? '<span class="premium-badge">Group</span>' : ''}
                    </div>
                    ${call.mood ? `<div class="mood-indicator mood-${call.mood}"><i class="fas fa-smile"></i><span>${call.mood}</span></div>` : ''}
                    ${call.intention ? `<div class="intention-indicator intention-${call.intention}"><i class="fas fa-bullseye"></i><span>${call.intention}</span></div>` : ''}
                </div>
                <button class="call-action-btn" title="Call back">
                    <i class="fas fa-phone"></i>
                </button>
            </div>
        `;
    } catch (error) {
        logErrorOnce('createCallHistoryItem', error);
        return '';
    }
}

export function showUI() {
    try {
        const appContainer = document.getElementById('appContainer');
        if (appContainer) {
            appContainer.style.visibility = 'visible';
            appContainer.style.opacity = '1';
        }
        
        const loadingIndicators = document.querySelectorAll('.loading-indicator, .initializing-overlay');
        loadingIndicators.forEach(indicator => {
            if (indicator) {
                indicator.style.display = 'none';
            }
        });
    } catch (error) {
        logErrorOnce('showUI', error);
    }
}

export function bootstrapIframe() {
    if (sessionInitialized) {
        console.info('[Calls iframe] Session already initialized, skipping bootstrap');
        return;
    }
    
    console.info('[Calls iframe] Bootstrapping iframe...');
    
    try {
        cacheElements();
        setupEventListeners();
        initializeOfflineDetection();
        initializeUI();
        showUI();
        
        window.callAPI = new CallAPIIntegration();
        
        setTimeout(() => {
            window.callAPI.initialize().then(() => {
                console.info('[Calls iframe] API integration initialized successfully');
            }).catch(error => {
                logErrorOnce('bootstrapIframe.callAPI', error);
                enableUI();
            });
        }, 100);
        
        checkUrlParameters();
        
        window.addEventListener('beforeunload', () => {
            if (window.callAPI) {
                window.callAPI.cleanup();
            }
        });
        
        console.info('[Calls iframe] Bootstrap completed');
    } catch (error) {
        logErrorOnce('bootstrapIframe', error);
        try {
            showUI();
            enableUI();
        } catch (e) {
            logErrorOnce('bootstrapIframe.fallback', e);
        }
    }
}

// ==================== SETUP EVENT LISTENERS FOR SIMULATED CALLS ====================
function setupEventListeners() {
    try {
        if (elements.declineCallBtn) {
            elements.declineCallBtn.addEventListener('click', () => {
                if (window._simulatedCallMetadata) {
                    handleDeclineSimulatedCall(window._simulatedCallMetadata.callId);
                }
            });
        }
        
        if (elements.acceptCallBtn) {
            elements.acceptCallBtn.addEventListener('click', () => {
                if (window._simulatedCallMetadata && window._simulatedCallerContact) {
                    handleAcceptSimulatedCall(window._simulatedCallMetadata, window._simulatedCallerContact, false);
                }
            });
        }
        
        if (elements.acceptVideoCallBtn) {
            elements.acceptVideoCallBtn.addEventListener('click', () => {
                if (window._simulatedCallMetadata && window._simulatedCallerContact) {
                    handleAcceptSimulatedCall(window._simulatedCallMetadata, window._simulatedCallerContact, true);
                }
            });
        }
    } catch (error) {
        logErrorOnce('setupEventListeners', error);
    }
}

// ==================== CALL MANAGEMENT FUNCTIONS ====================
function startCallTimer() {
    try {
        if (AppState.callDurationInterval) {
            clearInterval(AppState.callDurationInterval);
            AppState.callDurationInterval = null;
        }
        
        AppState.callDurationInterval = setInterval(() => {
            if (AppState.callStartTime && elements.callDuration) {
                const elapsedSeconds = Math.floor((Date.now() - AppState.callStartTime) / 1000);
                elements.callDuration.textContent = formatDuration(elapsedSeconds);
            }
        }, 1000);
    } catch (error) {
        logErrorOnce('startCallTimer', error);
    }
}

function initializeCallFeatures() {
    console.info('[Calls iframe] Initializing call features...');
}

function showCallUI() {
    try {
        if (elements.callContainer) {
            elements.callContainer.classList.add('active');
        }
        
        if (elements.appContainer) {
            elements.appContainer.classList.add('in-call');
        }
    } catch (error) {
        logErrorOnce('showCallUI', error);
    }
}

function enableFocusMode() {
    console.info('[Calls iframe] Enabling focus mode...');
}

function disableFocusMode() {
    console.info('[Calls iframe] Disabling focus mode...');
}

// ==================== GLOBAL EXPORTS ====================
window.CallApp = {
    simulateIncomingCall,
    startTestCall: () => {
        if (AppState.contacts && AppState.contacts.length > 0) {
            startCall('video', [AppState.contacts[0]]);
        } else {
            console.error('[Calls iframe] Cannot start test call - no contacts available');
        }
    },
    getState: () => AppState,
    checkApiStatus: () => {
        try {
            return {
                isAuthenticated: AppState.isAuthenticated,
                apiReady: AppState.apiReady,
                user: AppState.user,
                tokenReady: window.callAPI ? window.callAPI.tokenManager.isTokenReady() : false,
                parentCoordinator: parentCoordinator ? parentCoordinator.getStatus() : null,
                secureHandshakeInProgress: secureHandshakeInProgress,
                secureSessionValid: parentCoordinator ? parentCoordinator.secureSessionValid : false
            };
        } catch (error) {
            logErrorOnce('CallApp.checkApiStatus', error);
            return {
                isAuthenticated: false,
                apiReady: false,
                user: null,
                tokenReady: false,
                parentCoordinator: null,
                secureHandshakeInProgress: false,
                secureSessionValid: false
            };
        }
    },
    notifyParent: (type, data) => {
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({
                    type: type,
                    source: 'calls-iframe',
                    ...data,
                    timestamp: Date.now()
                }, '*');
            } catch (error) {
                logErrorOnce('CallApp.notifyParent', error);
            }
        }
    },
    // New secure handshake functions
    requestSecureSession: () => {
        if (parentCoordinator) {
            parentCoordinator.startSecureHandshake();
        } else {
            console.warn('[Calls iframe] Parent coordinator not available for secure handshake');
        }
    },
    getHandshakeStatus: () => {
        try {
            return {
                secureHandshakeInProgress: secureHandshakeInProgress,
                secureSessionValid: parentCoordinator ? parentCoordinator.secureSessionValid : false,
                secureHandshakeAttempts: secureHandshakeAttempts,
                maxHandshakeAttempts: maxHandshakeAttempts
            };
        } catch (error) {
            logErrorOnce('CallApp.getHandshakeStatus', error);
            return {
                secureHandshakeInProgress: false,
                secureSessionValid: false,
                secureHandshakeAttempts: 0,
                maxHandshakeAttempts: maxHandshakeAttempts
            };
        }
    }
};

// Initialize the application
window.addEventListener('DOMContentLoaded', bootstrapIframe);