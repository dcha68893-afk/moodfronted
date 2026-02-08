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
    }
    
    async initialize() {
        console.log('[Calls iframe] Initializing parent coordination...');
        
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
        
        await this.initiateHandshake();
        
        this.startHeartbeat();
        
        this.setupResynchronization();
    }
    
    detectParent() {
        try {
            this.parentDetected = !!(window.parent && window.parent !== window);
            
            if (this.parentDetected) {
                try {
                    this.sameOrigin = window.location.origin === window.parent.location.origin;
                    console.log(`[Calls iframe] Parent detected, same-origin: ${this.sameOrigin}`);
                } catch (error) {
                    console.log('[Calls iframe] Cross-origin parent detected');
                    this.sameOrigin = false;
                }
            }
        } catch (error) {
            console.error('[Calls iframe] Error detecting parent:', error);
            this.parentDetected = false;
            this.sameOrigin = false;
        }
    }
    
    establishMessagingChannel() {
        window.addEventListener('message', this.handleParentMessage.bind(this));
        console.log('[Calls iframe] Secure messaging channel established');
        this.secureChannelEstablished = true;
    }
    
    handleParentMessage(event) {
        if (!this.isValidOrigin(event.origin)) {
            console.warn('[Calls iframe] Message from unauthorized origin:', event.origin);
            return;
        }
        
        const data = event.data;
        
        if (data.type && !data.type.includes('HEARTBEAT')) {
            console.log('[Calls iframe] Received message from parent:', data.type, data);
        }
        
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
    }
    
    isValidOrigin(origin) {
        if (origin === window.location.origin) return true;
        
        if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) return true;
        
        try {
            const parentHost = window.location.hostname;
            const originHost = new URL(origin).hostname;
            
            return originHost === parentHost || 
                   originHost.endsWith('.' + parentHost) ||
                   parentHost.endsWith('.' + originHost);
        } catch (error) {
            return false;
        }
    }
    
    async initiateHandshake() {
        if (this.handshakeInProgress || this.handshakeComplete) {
            console.log('[Calls iframe] Handshake already in progress or complete');
            return;
        }
        
        this.handshakeInProgress = true;
        this.setFallbackState('waiting');
        
        console.log('[Calls iframe] Starting handshake protocol...');
        
        this.sendToParent({
            type: 'CHILD_READY',
            source: 'calls-iframe',
            timestamp: Date.now(),
            version: '1.0',
            capabilities: ['session_management', 'ui_coordination', 'api_routing']
        });
        
        await this.requestSessionWithBackoff();
    }
    
    async requestSessionWithBackoff() {
        let attempt = 0;
        const maxAttempts = 5;
        const baseDelay = 1000;
        
        while (attempt < maxAttempts && !this.handshakeComplete) {
            attempt++;
            const delay = baseDelay * Math.pow(2, attempt - 1);
            
            console.log(`[Calls iframe] Requesting session (attempt ${attempt}/${maxAttempts})...`);
            
            this.sendToParent({
                type: 'REQUEST_SESSION',
                source: 'calls-iframe',
                timestamp: Date.now(),
                attempt: attempt,
                requestId: 'session_req_' + Date.now()
            });
            
            await new Promise(resolve => {
                const timeoutId = setTimeout(() => {
                    console.log(`[Calls iframe] Session request timeout (attempt ${attempt})`);
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
        
        try {
            message.source = message.source || 'calls-iframe';
            message.timestamp = message.timestamp || Date.now();
            
            window.parent.postMessage(message, targetOrigin);
            return true;
        } catch (error) {
            console.error('[Calls iframe] Error sending message to parent:', error);
            return false;
        }
    }
    
    sendWithResponse(message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (!this.parentDetected) {
                reject(new Error('No parent detected'));
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
        console.log('[Calls iframe] Received SESSION_DATA:', sessionData);
        
        if (!this.validateSessionSchema(sessionData)) {
            console.error('[Calls iframe] Invalid session schema');
            this.sendToParent({
                type: 'SESSION_ERROR',
                source: 'calls-iframe',
                error: 'Invalid session schema',
                timestamp: Date.now()
            });
            return;
        }
        
        this.sessionData = sessionData;
        this.sessionValidated = true;
        
        this.handshakeComplete = true;
        this.handshakeInProgress = false;
        this.setFallbackState('connected');
        
        this.updateGlobalStateFromSession();
        
        this.bindUIAfterSessionConfirmation();
        
        this.sendToParent({
            type: 'SESSION_CONSUMED',
            source: 'calls-iframe',
            timestamp: Date.now(),
            sessionId: sessionData.sessionId,
            userId: sessionData.user?.id
        });
        
        console.log('[Calls iframe] Session data consumed successfully');
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
        if (!this.sessionData) return;
        
        if (this.sessionData.user) {
            currentUser = this.sessionData.user;
            userDataLoaded = true;
            
            if (window.AppState) {
                window.AppState.user = this.sessionData.user;
                window.AppState.currentUser = this.sessionData.user;
                window.AppState.isAuthenticated = this.sessionData.authenticated || false;
            }
        }
        
        if (this.sessionData.authenticated !== undefined) {
            sessionAuthorityReady = this.sessionData.authenticated;
            
            if (!this.sessionData.authenticated) {
                this.handleLogout();
            }
        }
        
        if (this.sessionData.token) {
            this.handleTokenUpdate(this.sessionData.token);
        }
        
        if (this.sessionData.apiConfig) {
            this.handleApiConfigUpdate(this.sessionData.apiConfig);
        }
    }
    
    bindUIAfterSessionConfirmation() {
        if (!this.sessionValidated || !currentUser) {
            console.warn('[Calls iframe] Cannot bind UI - session not validated or no user data');
            return;
        }
        
        console.log('[Calls iframe] Binding UI with session data...');
        
        this.uiBindings.forEach(binding => {
            try {
                binding();
            } catch (error) {
                console.error('[Calls iframe] Error in UI binding:', error);
            }
        });
        
        this.updateUIWithSessionData();
        
        this.enableProtectedUI();
        
        console.log('[Calls iframe] UI binding complete');
    }
    
    updateUIWithSessionData() {
        if (!currentUser) return;
        
        console.log('[Calls iframe] Updating UI with session data:', currentUser.username || currentUser.name);
        
        const userElements = {
            'userAvatar': currentUser.avatar,
            'userName': currentUser.name || currentUser.username,
            'userStatus': currentUser.status || 'Online'
        };
        
        this.updateUserSpecificUI(userElements);
        
        this.updateApiStatusIndicator();
        
        this.updateSyncIndicator();
    }
    
    updateUserSpecificUI(userElements) {
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
    }
    
    updateApiStatusIndicator() {
        const apiStatusIndicator = document.getElementById('apiStatusIndicator');
        const apiStatusText = document.getElementById('apiStatusText');
        
        if (apiStatusIndicator && apiStatusText) {
            apiStatusIndicator.className = 'api-status-indicator connected';
            apiStatusText.textContent = `Authenticated as ${currentUser?.name || currentUser?.username || 'User'}`;
            
            setTimeout(() => {
                apiStatusIndicator.style.display = 'none';
            }, 2000);
        }
    }
    
    updateSyncIndicator() {
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
            syncIndicator.classList.remove('syncing');
        }
    }
    
    enableProtectedUI() {
        if (!this.sessionValidated || !currentUser) {
            console.warn('[Calls iframe] Cannot enable protected UI - session not validated');
            return;
        }
        
        console.log('[Calls iframe] Enabling protected UI features...');
        
        const newCallBtn = document.getElementById('newCallBtn');
        if (newCallBtn) newCallBtn.disabled = false;
        
        const quickVoiceBtn = document.getElementById('quickVoiceBtn');
        const quickVideoBtn = document.getElementById('quickVideoBtn');
        if (quickVoiceBtn) quickVoiceBtn.disabled = false;
        if (quickVideoBtn) quickVideoBtn.disabled = false;
        
        this.loadUserSpecificData();
    }
    
    async loadUserSpecificData() {
        if (!currentUser || !userDataLoaded) return;
        
        console.log('[Calls iframe] Loading user-specific data through parent coordination...');
        
        try {
            await this.routeApiCall('/api/contacts', 'GET');
            await this.routeApiCall('/api/calls/history', 'GET');
            
            if (window.callAPI) {
                await window.callAPI.performInitialDataLoad();
            }
        } catch (error) {
            console.error('[Calls iframe] Error loading user-specific data:', error);
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
            console.error('[Calls iframe] API routing failed:', error);
            throw error;
        }
    }
    
    handleSessionUpdate(updateData) {
        console.log('[Calls iframe] Received SESSION_UPDATE:', updateData);
        
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
                console.error('[Calls iframe] Error in session update callback:', error);
            }
        });
        
        console.log('[Calls iframe] Session updated successfully');
    }
    
    handleLogout() {
        console.log('[Calls iframe] Logout received from parent coordination');
        
        currentUser = null;
        userDataLoaded = false;
        sessionAuthorityReady = false;
        this.sessionValidated = false;
        this.sessionData = null;
        
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
        
        console.log('[Calls iframe] Logout handled successfully');
    }
    
    disableProtectedUI() {
        console.log('[Calls iframe] Disabling protected UI...');
        
        const newCallBtn = document.getElementById('newCallBtn');
        if (newCallBtn) newCallBtn.disabled = true;
        
        const quickVoiceBtn = document.getElementById('quickVoiceBtn');
        const quickVideoBtn = document.getElementById('quickVideoBtn');
        if (quickVoiceBtn) quickVoiceBtn.disabled = true;
        if (quickVideoBtn) quickVideoBtn.disabled = true;
        
        this.showReconnectState();
    }
    
    showReconnectState() {
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
        
        document.getElementById('retryReconnectBtn')?.addEventListener('click', () => {
            this.initiateHandshake();
        });
    }
    
    handleTokenUpdate(tokenData) {
        console.log('[Calls iframe] Received token update from parent coordination');
        
        if (window.callAPI && window.callAPI.tokenManager) {
            if (tokenData.token) {
                window.callAPI.tokenManager.setToken(tokenData.token);
            }
        }
        
        if (this.sessionData) {
            this.sessionData.token = tokenData.token;
        }
    }
    
    handleApiConfigUpdate(apiConfig) {
        console.log('[Calls iframe] Received API config update');
        
        if (window.callAPI) {
            window.callAPI.apiConfig = { ...window.callAPI.apiConfig, ...apiConfig };
        }
    }
    
    handleDefaultMessage(data) {
        switch (data.type) {
            case 'SESSION_DATA':
                this.handleSessionData(data.payload || data);
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
            default:
                console.log('[Calls iframe] Unhandled message type:', data.type);
        }
    }
    
    registerMessageHandler(type, handler) {
        this.messageHandlers.set(type, handler);
    }
    
    registerUIBinding(binding) {
        this.uiBindings.push(binding);
    }
    
    registerSessionUpdateCallback(callback) {
        this.sessionUpdateCallbacks.push(callback);
    }
    
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000);
        
        setTimeout(() => this.sendHeartbeat(), 5000);
    }
    
    sendHeartbeat() {
        if (!this.parentDetected || !this.secureChannelEstablished) {
            return;
        }
        
        this.sendToParent({
            type: 'HEARTBEAT',
            source: 'calls-iframe',
            timestamp: Date.now(),
            sessionId: this.sessionData?.sessionId
        });
        
        this.lastHeartbeat = Date.now();
    }
    
    handleHeartbeatResponse() {
        this.lastHeartbeat = Date.now();
    }
    
    handleChildReadyAck() {
        console.log('[Calls iframe] CHILD_READY acknowledged by parent');
    }
    
    handleSessionRequestAck() {
        console.log('[Calls iframe] SESSION_REQUEST acknowledged by parent');
    }
    
    handleApiReady() {
        console.log('[Calls iframe] Parent API ready signal received');
        
        if (window.AppState) {
            window.AppState.apiReady = true;
        }
        
        setTimeout(() => {
            if (window.callAPI && window.callAPI.tokenManager) {
                window.callAPI.tokenManager.tryGetTokenFromAPI();
            }
        }, 100);
    }
    
    setFallbackState(state) {
        this.fallbackState = state;
        
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
    }
    
    showWaitingState() {
        console.log('[Calls iframe] Showing waiting state for parent coordination');
    }
    
    showReconnectingState() {
        console.log('[Calls iframe] Showing reconnecting state');
        this.showReconnectState();
    }
    
    showUnavailableState() {
        console.log('[Calls iframe] Parent coordination unavailable');
        
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
        
        document.getElementById('refreshPageBtn')?.addEventListener('click', () => {
            location.reload();
        });
    }
    
    hideFallbackState() {
        document.querySelectorAll('.reconnect-overlay, .unavailable-overlay').forEach(el => el.remove());
    }
    
    setupResynchronization() {
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
    }
    
    checkParentConnection() {
        if (!this.handshakeComplete && this.parentDetected) {
            console.log('[Calls iframe] Checking parent connection...');
            this.initiateHandshake();
        }
    }
    
    cleanup() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.reconnectionTimer) {
            clearTimeout(this.reconnectionTimer);
            this.reconnectionTimer = null;
        }
        
        this.messageHandlers.clear();
        this.pendingRequests.clear();
        this.uiBindings = [];
        this.sessionUpdateCallbacks = [];
    }
    
    getStatus() {
        return {
            parentDetected: this.parentDetected,
            sameOrigin: this.sameOrigin,
            secureChannelEstablished: this.secureChannelEstablished,
            handshakeComplete: this.handshakeComplete,
            sessionValidated: this.sessionValidated,
            fallbackState: this.fallbackState,
            sessionData: this.sessionData ? { ...this.sessionData, token: '***' } : null
        };
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
        this.parentCoordinator = parentCoordinator;
    }
    
    async initialize() {
        console.log('[Calls iframe] Initializing parent-child communication with coordination...');
        
        if (!parentCoordinator) {
            parentCoordinator = new ParentCoordinator();
            this.parentCoordinator = parentCoordinator;
            await this.parentCoordinator.initialize();
        }
        
        this.setupLegacyMessageListener();
        
        if (!this.parentCoordinator.handshakeComplete) {
            this.requestDataFromParent();
        }
        
        this.startParentResponseTimeout();
        
        this.loadCachedUserData();
        
        this.registerWithCoordinator();
    }
    
    registerWithCoordinator() {
        if (!this.parentCoordinator) return;
        
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
    }
    
    setupLegacyMessageListener() {
        window.addEventListener('message', (event) => {
            if (this.parentCoordinator && this.parentCoordinator.secureChannelEstablished) {
                return;
            }
            
            this.handleLegacyMessage(event);
        });
    }
    
    handleLegacyMessage(event) {
        if (!this.isValidOrigin(event.origin)) {
            console.warn('[Calls iframe] Message from unauthorized origin:', event.origin);
            return;
        }
        
        this.parentOrigin = event.origin;
        const data = event.data;
        
        console.log('[Calls iframe] Received legacy message from parent:', data.type);
        
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
    }
    
    isValidOrigin(origin) {
        if (origin === window.location.origin) return true;
        
        if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) return true;
        
        const parentHost = window.location.hostname;
        const originHost = new URL(origin).hostname;
        
        return originHost === parentHost || 
               originHost.endsWith('.' + parentHost) ||
               parentHost.endsWith('.' + originHost);
    }
    
    requestDataFromParent() {
        if (window.parent && window.parent !== window && !this.parentCoordinator.handshakeComplete) {
            console.log('[Calls iframe] Requesting user data from parent (legacy fallback)...');
            
            const requestId = 'req_' + Date.now();
            
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
        } else {
            console.log('[Calls iframe] No parent window detected, will use coordination system');
            this.parentDataReceived = false;
            
            if (!this.parentCoordinator || !this.parentCoordinator.handshakeComplete) {
                this.startCoordinatedFetch();
            }
        }
    }
    
    async startCoordinatedFetch() {
        if (this.dataFetchLock || userDataLoaded) {
            console.log('[Calls iframe] Data fetch already in progress or completed, skipping...');
            return;
        }
        
        this.dataFetchLock = true;
        
        console.log('[Calls iframe] Starting coordinated data fetch...');
        
        try {
            if (this.parentCoordinator) {
                await this.waitForSessionData();
            } else {
                throw new Error('Parent coordinator not available');
            }
        } catch (error) {
            console.error('[Calls iframe] Coordinated fetch failed:', error);
            this.handleDataFetchFailure(error);
        } finally {
            this.dataFetchLock = false;
        }
    }
    
    async waitForSessionData() {
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
            console.log('[Calls iframe] Using parent coordinator, skipping legacy timeout');
            return;
        }
        
        this.parentResponseTimeout = setTimeout(() => {
            if (!this.parentDataReceived && !this.directFetchInProgress) {
                console.log('[Calls iframe] Parent response timeout, starting coordinated fetch...');
                this.startCoordinatedFetch();
            }
        }, parentDataTimeout);
    }
    
    handleParentUserData(userData) {
        if (this.dataFetchLock || userDataLoaded) {
            console.log('[Calls iframe] Data already loaded or fetch in progress, ignoring parent data');
            return;
        }
        
        console.log('[Calls iframe] Received user data from parent (legacy):', userData);
        
        if (this.parentResponseTimeout) {
            clearTimeout(this.parentResponseTimeout);
            this.parentResponseTimeout = null;
        }
        
        this.parentDataReceived = true;
        this.dataFetchLock = true;
        
        this.processUserData(userData, 'parent-legacy');
        
        this.notifyDataLoaded('parent-legacy');
    }
    
    handleAuthUpdate(authData) {
        console.log('[Calls iframe] Received auth update from parent:', authData);
        
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
    }
    
    handleProfileUpdate(profileData) {
        console.log('[Calls iframe] Received profile update from parent:', profileData);
        
        if (currentUser) {
            currentUser = {
                ...currentUser,
                ...profileData
            };
            
            this.updateUIWithUserData();
            
            this.cacheUserData();
            
            this.showNotification('Profile updated', 'success');
        }
    }
    
    handleLogout() {
        console.log('[Calls iframe] Logout requested by parent');
        
        if (this.parentCoordinator) {
            this.parentCoordinator.handleLogout();
        } else {
            this.performLegacyLogout();
        }
    }
    
    performLegacyLogout() {
        currentUser = null;
        userDataLoaded = false;
        this.authVerified = false;
        
        this.clearCachedData();
        
        this.showLoginScreen();
        
        if (window.CallApp) {
            window.CallApp.notifyParent('USER_LOGGED_OUT', {});
        }
    }
    
    handleParentPong() {
        console.log('[Calls iframe] Parent is responsive (legacy)');
    }
    
    handleTokenUpdate(tokenData) {
        console.log('[Calls iframe] Received token update from parent');
        if (this.parentCoordinator) {
            this.parentCoordinator.handleTokenUpdate(tokenData);
        }
    }
    
    handleApiReady() {
        console.log('[Calls iframe] Parent API ready signal received');
        if (this.parentCoordinator) {
            this.parentCoordinator.handleApiReady();
        }
    }
    
    processUserData(userData, source) {
        console.log(`[Calls iframe] Processing user data from ${source}:`, userData);
        
        if (!userData || !userData.id) {
            throw new Error('Invalid user data received');
        }
        
        currentUser = userData;
        userDataLoaded = true;
        this.authVerified = true;
        
        this.cacheUserData();
        
        this.updateUIWithUserData();
        
        this.initializeAppWithUserData();
        
        this.showNotification(`User data loaded from ${source}`, 'success');
        
        console.log(`[Calls iframe] User data successfully loaded from ${source}`);
    }
    
    handleDataFetchFailure(error) {
        console.error('[Calls iframe] All data fetch attempts failed:', error);
        
        const cachedUser = this.getCachedUserData();
        if (cachedUser) {
            console.log('[Calls iframe] Using cached user data');
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
    }
    
    updateUIWithUserData() {
        if (!currentUser) return;
        
        console.log('[Calls iframe] Updating UI with user data:', currentUser.username || currentUser.name);
        
        const userElements = {
            'userAvatar': currentUser.avatar,
            'userName': currentUser.name || currentUser.username,
            'userStatus': currentUser.status || 'Online'
        };
        
        this.updateUserSpecificUI(userElements);
        
        this.updateApiStatusIndicator();
        
        this.updateSyncIndicator();
    }
    
    updateUserSpecificUI(userElements) {
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
    }
    
    updateApiStatusIndicator() {
        const apiStatusIndicator = document.getElementById('apiStatusIndicator');
        const apiStatusText = document.getElementById('apiStatusText');
        
        if (apiStatusIndicator && apiStatusText) {
            apiStatusIndicator.className = 'api-status-indicator connected';
            apiStatusText.textContent = `Authenticated as ${currentUser?.name || currentUser?.username || 'User'}`;
            
            setTimeout(() => {
                apiStatusIndicator.style.display = 'none';
            }, 2000);
        }
    }
    
    updateSyncIndicator() {
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
            syncIndicator.classList.remove('syncing');
        }
    }
    
    initializeAppWithUserData() {
        if (window.callAPI) {
            window.callAPI.onAuthenticationSuccess();
        }
        
        if (window.AppState) {
            window.AppState.user = currentUser;
            window.AppState.currentUser = currentUser;
            window.AppState.isAuthenticated = true;
        }
        
        this.enableUIFeatures();
    }
    
    enableUIFeatures() {
        const newCallBtn = document.getElementById('newCallBtn');
        if (newCallBtn) newCallBtn.disabled = false;
        
        const quickVoiceBtn = document.getElementById('quickVoiceBtn');
        const quickVideoBtn = document.getElementById('quickVideoBtn');
        if (quickVoiceBtn) quickVoiceBtn.disabled = false;
        if (quickVideoBtn) quickVideoBtn.disabled = false;
        
        this.loadUserSpecificData();
    }
    
    async loadUserSpecificData() {
        if (!currentUser || !userDataLoaded) return;
        
        console.log('[Calls iframe] Loading user-specific data...');
        
        try {
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
                await this.parentCoordinator.loadUserSpecificData();
            } else if (window.callAPI) {
                await window.callAPI.performInitialDataLoad();
            }
        } catch (error) {
            console.error('[Calls iframe] Error loading user-specific data:', error);
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
            
            console.log('[Calls iframe] User data cached successfully');
        } catch (error) {
            console.error('[Calls iframe] Error caching user data:', error);
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
                            console.log(`[Calls iframe] Loaded cached user data from ${key}`);
                            currentUser = userData;
                            userDataLoaded = true;
                            
                            this.updateUIWithUserData();
                            return true;
                        }
                    } catch (e) {
                        console.log(`[Calls iframe] Failed to parse cached data from ${key}:`, e);
                    }
                }
            }
        } catch (error) {
            console.error('[Calls iframe] Error loading cached user data:', error);
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
            console.error('[Calls iframe] Error getting cached user data:', error);
        }
        return null;
    }
    
    clearCachedData() {
        try {
            localStorage.removeItem('cachedUserData');
            localStorage.removeItem('authUser');
            localStorage.removeItem('currentUser');
            console.log('[Calls iframe] Cached user data cleared');
        } catch (error) {
            console.error('[Calls iframe] Error clearing cached data:', error);
        }
    }
    
    showLoginScreen() {
        if (this.parentCoordinator && this.parentCoordinator.parentDetected) {
            return;
        }
        
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
            
            document.getElementById('retryLoginBtn')?.addEventListener('click', () => {
                location.reload();
            });
        }
    }
    
    getAuthToken() {
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.token) {
            return this.parentCoordinator.sessionData.token;
        }
        
        try {
            const token = getUserToken();
            if (token && typeof token === 'string' && token.length > 10) {
                return token;
            }
        } catch (error) {
            console.log('[Calls iframe] Error getting token from api.core.js:', error);
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
            }
        }
        
        return null;
    }
    
    showNotification(message, type = 'info') {
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
            
            notification.querySelector('.call-notification-close').addEventListener('click', () => {
                notification.remove();
            });
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 3000);
        }
    }
    
    notifyDataLoaded(source) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'USER_DATA_RECEIVED',
                source: 'calls-iframe',
                timestamp: Date.now(),
                dataSource: source
            }, '*');
        }
        
        this.broadcastToOtherIframes({
            type: 'USER_DATA_LOADED',
            source: 'calls-iframe',
            userData: currentUser
        });
    }
    
    broadcastToOtherIframes(message) {
        console.log('[Calls iframe] Broadcast message:', message);
    }
    
    cleanup() {
        if (this.parentResponseTimeout) {
            clearTimeout(this.parentResponseTimeout);
            this.parentResponseTimeout = null;
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
        this.parentCoordinator = parentCoordinator;
        this.coordinatedToken = false;
    }
    
    async initialize() {
        console.log('[Calls iframe] Initializing token manager with parent coordination...');
        
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.token) {
            console.log('[Calls iframe] Got token from parent coordinator');
            this.setToken(this.parentCoordinator.sessionData.token);
            this.coordinatedToken = true;
            return;
        }
        
        this.tryGetTokenFromAPI();
        
        this.loadCachedData();
        
        this.startTokenPolling();
        
        this.setupCoordinatedListener();
        
        this.migrateOldTokens();
    }
    
    setupCoordinatedListener() {
        if (!this.parentCoordinator) return;
        
        this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
            if (updateData.token) {
                console.log('[Calls iframe] Received token update from coordinator');
                this.setToken(updateData.token);
                this.coordinatedToken = true;
            }
        });
    }
    
    tryGetTokenFromAPI() {
        try {
            if (this.coordinatedToken) {
                return false;
            }
            
            const token = getUserToken();
            if (token && this.validateToken(token)) {
                console.log('[Calls iframe] Got token from api.core.js');
                this.setToken(token);
                return true;
            }
        } catch (error) {
            console.log('[Calls iframe] Error getting token from api.core.js:', error.message);
        }
        return false;
    }
    
    startTokenPolling() {
        if (this.tokenCheckInterval) {
            clearInterval(this.tokenCheckInterval);
        }
        
        if (this.coordinatedToken) {
            console.log('[Calls iframe] Using coordinated token, skipping API polling');
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 20;
        
        this.tokenCheckInterval = setInterval(() => {
            attempts++;
            
            const gotToken = this.tryGetTokenFromAPI();
            
            if (gotToken) {
                clearInterval(this.tokenCheckInterval);
                this.apiInitialized = true;
                console.log('[Calls iframe] API initialized successfully');
                this.executeWaitingCallbacks();
            } else if (attempts >= maxAttempts) {
                clearInterval(this.tokenCheckInterval);
                console.log('[Calls iframe] API initialization timeout, using coordinated token only');
                this.executeWaitingCallbacks();
            }
            
            const storedToken = localStorage.getItem('USER_TOKEN');
            if (storedToken && this.validateToken(storedToken) && !this.token) {
                console.log('[Calls iframe] Using stored USER_TOKEN');
                this.setToken(storedToken);
            }
        }, 500);
    }
    
    setToken(token) {
        this.token = token;
        this.tokenReady = true;
        
        try {
            localStorage.setItem('USER_TOKEN', token);
        } catch (error) {
            console.log('[Calls iframe] Error storing token:', error);
        }
        
        if (window.AppState) {
            window.AppState.isAuthenticated = true;
        }
        
        console.log('[Calls iframe] Token set successfully');
        
        this.executeWaitingCallbacks();
    }
    
    waitForToken() {
        return new Promise((resolve) => {
            if (this.tokenReady && this.token) {
                resolve(this.token);
            } else {
                this.waitingCallbacks.push(resolve);
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
                    console.error('[Calls iframe] Error in token callback:', error);
                }
            }
        }
    }
    
    validateToken(token) {
        if (!token || typeof token !== 'string') return false;
        if (token.length < 10) return false;
        if (token.trim() !== token) return false;
        return true;
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
            
            let migrated = false;
            
            for (const key of oldTokenKeys) {
                const oldToken = localStorage.getItem(key);
                if (oldToken && this.validateToken(oldToken)) {
                    localStorage.setItem('USER_TOKEN', oldToken);
                    console.log(`[Calls iframe] Migrated token from ${key} to USER_TOKEN`);
                    migrated = true;
                }
            }
            
            for (const key of oldTokenKeys) {
                const oldToken = sessionStorage.getItem(key);
                if (oldToken && this.validateToken(oldToken)) {
                    localStorage.setItem('USER_TOKEN', oldToken);
                    console.log(`[Calls iframe] Migrated token from sessionStorage.${key} to USER_TOKEN`);
                    migrated = true;
                }
            }
            
            this.migrationDone = true;
            
            if (migrated) {
                console.log('[Calls iframe] Token migration completed');
            }
        } catch (error) {
            console.error('[Calls iframe] Error during token migration:', error);
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
                        console.log('[Calls iframe] Loaded user data from cache');
                    }
                } catch (e) {
                    console.log('[Calls iframe] Failed to parse cached user data');
                }
            }
            
            const cachedContacts = localStorage.getItem('cachedContacts');
            if (cachedContacts && window.AppState) {
                try {
                    window.AppState.contacts = JSON.parse(cachedContacts);
                    console.log('[Calls iframe] Loaded contacts from cache');
                } catch (e) {
                    console.log('[Calls iframe] Failed to parse cached contacts');
                }
            }
            
            const cachedCalls = localStorage.getItem('cachedCallHistory');
            if (cachedCalls && window.AppState) {
                try {
                    window.AppState.callHistory = JSON.parse(cachedCalls);
                    console.log('[Calls iframe] Loaded call history from cache');
                } catch (e) {
                    console.log('[Calls iframe] Failed to parse cached call history');
                }
            }
        } catch (error) {
            console.error('[Calls iframe] Error loading cached data:', error);
        }
    }
    
    setupMessageListener() {
        window.addEventListener('message', (event) => {
            const allowedOrigins = [window.location.origin, 'http://localhost:*', 'https://yourdomain.com'];
            if (!allowedOrigins.some(origin => event.origin.match(new RegExp(origin.replace('*', '.*'))))) {
                return;
            }
            
            const data = event.data;
            
            if (data.type === 'TOKEN_UPDATE') {
                console.log('[Calls iframe] Received token update from parent');
                if (data.token && this.validateToken(data.token)) {
                    this.setToken(data.token);
                }
            }
            
            if (data.type === 'API_READY') {
                console.log('[Calls iframe] Received API_READY from parent');
                setTimeout(() => this.tryGetTokenFromAPI(), 100);
            }
        });
    }
    
    getToken() {
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.token) {
            return this.parentCoordinator.sessionData.token;
        }
        
        try {
            const token = getUserToken();
            if (token && this.validateToken(token)) {
                return token;
            }
        } catch (error) {
            console.log('[Calls iframe] Error getting token from api.core.js:', error);
        }
        
        return this.token;
    }
    
    isTokenReady() {
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.token) {
            return true;
        }
        
        try {
            const token = getUserToken();
            if (token && this.validateToken(token)) {
                return true;
            }
        } catch (error) {
            console.log('[Calls iframe] Error checking token from api.core.js:', error);
        }
        
        return this.tokenReady;
    }
    
    clearToken() {
        this.token = null;
        this.tokenReady = false;
        this.apiInitialized = false;
        this.coordinatedToken = false;
        
        try {
            localStorage.removeItem('USER_TOKEN');
        } catch (error) {
            console.error('[Calls iframe] Error clearing token:', error);
        }
        
        if (window.AppState) {
            window.AppState.isAuthenticated = false;
            window.AppState.user = null;
            window.AppState.currentUser = null;
        }
    }
    
    cleanup() {
        if (this.tokenCheckInterval) {
            clearInterval(this.tokenCheckInterval);
            this.tokenCheckInterval = null;
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
        this.parentCoordinator = parentCoordinator;
        this.useCoordinatedRouting = false;
    }
    
    async fetch(url, options = {}) {
        if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
            try {
                console.log('[Calls iframe] Routing API request through parent coordination:', url);
                return await this.fetchThroughCoordinator(url, options);
            } catch (error) {
                console.log('[Calls iframe] Coordinated routing failed, falling back:', error.message);
                this.useCoordinatedRouting = false;
            }
        }
        
        try {
            return await secureFetch(url, options);
        } catch (error) {
            console.log('[Calls iframe] api.core.js secureFetch failed, falling back:', error.message);
        }
        
        return this.secureFetchFallback(url, options);
    }
    
    async fetchThroughCoordinator(url, options = {}) {
        if (!this.parentCoordinator || !this.parentCoordinator.sessionValidated) {
            throw new Error('Parent coordinator not available');
        }
        
        let endpoint = url;
        if (url.startsWith('http')) {
            try {
                const urlObj = new URL(url);
                endpoint = urlObj.pathname + urlObj.search;
            } catch (error) {
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
    }
    
    async secureFetchFallback(url, options = {}, retryCount = 0) {
        try {
            if (!this.tokenManager.isTokenReady()) {
                return this.queueRequest(url, options);
            }
            
            const token = this.tokenManager.getToken();
            if (!token) {
                throw new Error('No authentication token available');
            }
            
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...options.headers
            };
            
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            if (response.status === 401) {
                console.log('[Calls iframe] Authentication failed (401)');
                
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
            if (retryCount < this.maxRetries && 
                (error.message.includes('Network') || error.message.includes('Failed to fetch'))) {
                const delay = this.retryDelay * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.secureFetchFallback(url, options, retryCount + 1);
            }
            
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
        const response = await this.fetch(url, options);
        return response.json();
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
            
            notification.querySelector('.call-notification-close').addEventListener('click', () => {
                notification.remove();
            });
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 3000);
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
        this.parentCoordinator = parentCoordinator;
        this.sessionInitialized = false;
        this.apiConfig = {};
    }
    
    async initialize() {
        console.log('[Calls iframe] Initializing API integration with parent coordination...');
        
        if (sessionInitializationLock) {
            console.log('[Calls iframe] Initialization already in progress, skipping...');
            return this;
        }
        
        sessionInitializationLock = true;
        
        try {
            if (!parentCoordinator) {
                parentCoordinator = new ParentCoordinator();
                this.parentCoordinator = parentCoordinator;
            }
            
            await this.parentCommunication.initialize();
            
            this.tokenManager.initialize();
            
            this.setupInitialUI();
            
            this.startBackgroundAuthCheck();
            
            window.addEventListener('beforeunload', () => this.cleanup());
            
            this.registerWithCoordinator();
            
            sessionInitialized = true;
            console.log('[Calls iframe] API integration with parent coordination initialized');
            
            return this;
        } catch (error) {
            console.error('[Calls iframe] API integration initialization failed:', error);
            sessionInitializationLock = false;
            throw error;
        } finally {
            sessionInitializationLock = false;
        }
    }
    
    registerWithCoordinator() {
        if (!this.parentCoordinator) return;
        
        this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
            this.handleCoordinatedSessionUpdate(updateData);
        });
        
        this.parentCoordinator.registerUIBinding(() => {
            if (currentUser && !this.authCheckDone) {
                this.onAuthenticationSuccess();
            }
        });
    }
    
    handleCoordinatedSessionUpdate(updateData) {
        console.log('[Calls iframe] Handling coordinated session update:', updateData);
        
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
    }
    
    setupInitialUI() {
        const apiStatusIndicator = document.getElementById('apiStatusIndicator');
        const apiStatusText = document.getElementById('apiStatusText');
        
        if (apiStatusIndicator && apiStatusText) {
            apiStatusIndicator.className = 'api-status-indicator connecting';
            apiStatusText.textContent = 'Initializing with parent...';
            apiStatusIndicator.style.display = 'block';
        }
        
        this.loadCachedDataToUI();
        
        this.showUI();
    }
    
    showUI() {
        const appContainer = document.getElementById('appContainer');
        if (appContainer) {
            appContainer.style.display = 'block';
            appContainer.style.opacity = '1';
        }
        
        this.enableBasicUI();
    }
    
    enableBasicUI() {
        const settingsToggle = document.getElementById('settingsToggle');
        if (settingsToggle) {
            settingsToggle.disabled = false;
        }
        
        this.renderCachedCallHistory();
        
        console.log('[Calls iframe] Basic UI enabled immediately');
    }
    
    async startBackgroundAuthCheck() {
        try {
            if (this.parentCoordinator) {
                await this.waitForCoordinatorSession();
            } else {
                await this.waitForTokenAuth();
            }
        } catch (error) {
            console.log('[Calls iframe] Background auth check failed:', error.message);
        }
    }
    
    async waitForCoordinatorSession() {
        return new Promise((resolve, reject) => {
            if (this.parentCoordinator.sessionValidated && currentUser) {
                this.onAuthenticationSuccess();
                resolve();
                return;
            }
            
            const timeout = setTimeout(() => {
                console.log('[Calls iframe] Coordinator session timeout, using cached data');
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
                    console.log('[Calls iframe] Coordinator unavailable, using cached data');
                    resolve();
                }
            }, 100);
        });
    }
    
    async waitForTokenAuth() {
        const tokenPromise = this.tokenManager.waitForToken();
        const timeoutPromise = new Promise(resolve => 
            setTimeout(() => resolve(null), 5000));
        
        const token = await Promise.race([tokenPromise, timeoutPromise]);
        
        if (token) {
            console.log('[Calls iframe] Authentication confirmed via token');
            this.onAuthenticationSuccess(token);
        } else {
            console.log('[Calls iframe] Token not ready yet, continuing with cached data');
        }
    }
    
    onAuthenticationSuccess(token) {
        if (this.authCheckDone) {
            console.log('[Calls iframe] Authentication already confirmed, skipping...');
            return;
        }
        
        if (window.AppState) {
            window.AppState.isAuthenticated = true;
        }
        this.authCheckDone = true;
        
        const apiStatusIndicator = document.getElementById('apiStatusIndicator');
        const apiStatusText = document.getElementById('apiStatusText');
        
        if (apiStatusIndicator && apiStatusText) {
            apiStatusIndicator.className = 'api-status-indicator connected';
            
            if (currentUser && currentUser.name) {
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
    }
    
    startBackgroundJobs() {
        if (window.AppState && !window.AppState.isOnline) return;
        
        console.log('[Calls iframe] Starting background jobs...');
        
        this.initializeBackgroundSync();
        
        setTimeout(() => {
            this.performInitialDataLoad();
        }, 1000);
    }
    
    async performInitialDataLoad() {
        if ((window.AppState && !window.AppState.isAuthenticated) || (window.AppState && !window.AppState.isOnline)) return;
        
        try {
            console.log('[Calls iframe] Starting background data load...');
            
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
            
            console.log('[Calls iframe] Background data loading complete');
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
            console.log('[Calls iframe] Background data loading failed:', error.message);
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
        if (this.backgroundSyncInterval) {
            clearInterval(this.backgroundSyncInterval);
        }
        
        if (window.AppState && window.AppState.isAuthenticated && window.AppState.isOnline) {
            console.log('[Calls iframe] Starting background sync');
            
            this.backgroundSyncInterval = setInterval(() => {
                this.performBackgroundSync();
            }, 30000);
            
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && window.AppState && window.AppState.isOnline && window.AppState.isAuthenticated) {
                    this.performBackgroundSync();
                }
            });
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
            console.log('[Calls iframe] Background sync failed:', error.message);
            if (window.AppState) {
                window.AppState.syncPending = true;
            }
        }
    }
    
    async fetchUserData() {
        try {
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
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
            console.log('[Calls iframe] Failed to fetch user data:', error.message);
            
            const cachedUser = localStorage.getItem('authUser') || 
                              localStorage.getItem('currentUser');
            
            if (cachedUser) {
                try {
                    const userData = JSON.parse(cachedUser);
                    this.updateUserState(userData);
                    return userData;
                } catch (e) {
                    console.log('[Calls iframe] Failed to parse cached user data');
                }
            }
        }
        
        return null;
    }
    
    getApiBaseUrl() {
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.apiConfig?.baseUrl) {
            return this.parentCoordinator.sessionData.apiConfig.baseUrl;
        }
        
        try {
            const baseUrl = getApiBaseUrl();
            if (baseUrl) {
                return baseUrl;
            }
        } catch (error) {
            console.log('[Calls iframe] Error getting API base URL from api.core.js:', error);
        }
        
        return '/api';
    }
    
    updateUserState(userData) {
        if (!userData) return;
        
        if (window.AppState) {
            window.AppState.user = userData;
            window.AppState.currentUser = userData;
        }
        
        try {
            localStorage.setItem('authUser', JSON.stringify(userData));
            localStorage.setItem('currentUser', JSON.stringify(userData));
        } catch (error) {
            console.log('[Calls iframe] Error caching user data:', error);
        }
    }
    
    async fetchContacts(forceRefresh = false) {
        try {
            if (!forceRefresh && window.AppState && window.AppState.contacts.length > 0) {
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
                    console.log('[Calls iframe] Failed to parse cached contacts');
                }
            }
            
            if (!window.AppState || !window.AppState.isAuthenticated) {
                console.log('[Calls iframe] Not authenticated, skipping contacts fetch');
                return window.AppState ? window.AppState.contacts : [];
            }
            
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
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
            console.log('[Calls iframe] Failed to fetch contacts:', error.message);
            
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
                    console.log('[Calls iframe] Failed to parse cached contacts on error');
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
            console.log('[Calls iframe] Failed to cache contacts:', error);
        }
    }
    
    async fetchCallHistory(forceRefresh = false) {
        try {
            if (!forceRefresh && window.AppState && window.AppState.callHistory.length > 0) {
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
                    console.log('[Calls iframe] Failed to parse cached call history');
                }
            }
            
            if (!window.AppState || !window.AppState.isAuthenticated) {
                console.log('[Calls iframe] Not authenticated, skipping call history fetch');
                return window.AppState ? window.AppState.callHistory : [];
            }
            
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
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
            console.log('[Calls iframe] Failed to fetch call history:', error.message);
            
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
                    console.log('[Calls iframe] Failed to parse cached call history on error');
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
            console.log('[Calls iframe] Failed to cache call history:', error);
        }
    }
    
    renderCachedCallHistory() {
        const cachedHistory = localStorage.getItem('cachedCallHistory');
        if (cachedHistory) {
            try {
                const history = JSON.parse(cachedHistory);
                if (window.AppState) {
                    window.AppState.callHistory = history;
                }
                renderCallHistory();
            } catch (e) {
                console.log('[Calls iframe] Failed to parse cached call history for UI');
            }
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
                console.log('[Calls iframe] Not authenticated, using cached settings');
                return window.AppState ? window.AppState.settings : {};
            }
            
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
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
            console.log('[Calls iframe] Failed to fetch settings:', error.message);
            
            const cachedSettings = localStorage.getItem('callSettings');
            if (cachedSettings && window.AppState) {
                try {
                    const settings = JSON.parse(cachedSettings);
                    window.AppState.settings = { ...window.AppState.settings, ...settings };
                    applySettingsToUI();
                } catch (e) {
                    console.log('[Calls iframe] Failed to parse cached settings');
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
                console.log('[Calls iframe] Not authenticated, using cached premium status');
                updatePremiumUI();
                return window.AppState ? window.AppState.isPremium : false;
            }
            
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
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
            console.log('[Calls iframe] Failed to check premium status:', error.message);
            
            const cachedPremium = localStorage.getItem('premiumStatus');
            if (cachedPremium && window.AppState) {
                try {
                    const premiumData = JSON.parse(cachedPremium);
                    window.AppState.isPremium = premiumData.isPremium || false;
                    window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 30;
                    window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                } catch (e) {
                    console.log('[Calls iframe] Failed to parse cached premium status');
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
            console.log('[Calls iframe] Error caching premium status:', error);
        }
    }
    
    loadCachedDataToUI() {
        console.log('[Calls iframe] Loading cached data to UI...');
        
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
                console.log('[Calls iframe] Failed to parse cached contacts');
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
                console.log('[Calls iframe] Failed to parse cached call history');
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
                console.log('[Calls iframe] Failed to parse cached premium status');
            }
        }
        
        console.log('[Calls iframe] Cached data loaded to UI');
    }
    
    handleLogout() {
        console.log('[Calls iframe] Logout handled by API integration');
        
        this.authCheckDone = false;
        this.backgroundJobsStarted = false;
        this.initialDataLoaded = false;
        
        if (this.backgroundSyncInterval) {
            clearInterval(this.backgroundSyncInterval);
            this.backgroundSyncInterval = null;
        }
        
        this.tokenManager.clearToken();
    }
    
    renderContacts(contacts) {
        if (!contacts || contacts.length === 0) {
            const contactsList = document.getElementById('contactsList');
            if (contactsList) {
                contactsList.innerHTML = '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No contacts available</p></div>';
            }
            return;
        }
        
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
    }
    
    renderGroupContacts(contacts) {
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
    }
    
    cleanup() {
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
    console.log('[Calls iframe] Simulating incoming call for:', callerId, metadata);
    
    // Don't simulate if already in a call
    if (AppState.isInCall) {
        console.log('[Calls iframe] Already in a call, ignoring simulation');
        showNotification('Already in a call', 'warning');
        return false;
    }
    
    // Find contact by ID or create a mock contact
    let callerContact = null;
    
    if (AppState.contacts && AppState.contacts.length > 0) {
        callerContact = AppState.contacts.find(c => c.id === callerId);
    }
    
    if (!callerContact) {
        // Create mock contact for simulation
        callerContact = {
            id: callerId,
            name: metadata.name || 'Test Caller',
            avatar: metadata.avatar || null,
            isPremium: metadata.isPremium || false
        };
    }
    
    // Prepare call metadata
    const callMetadata = {
        callType: metadata.callType || 'voice',
        mood: metadata.mood || 'neutral',
        intention: metadata.intention || 'quick',
        isGroup: metadata.isGroup || false,
        callId: metadata.callId || 'simulated-call-' + Date.now(),
        timestamp: Date.now(),
        ...metadata
    };
    
    // Update UI elements for incoming call
    if (elements.incomingCallModal && elements.incomingCallAvatar && elements.incomingCallName) {
        // Set caller info
        elements.incomingCallName.textContent = callerContact.name;
        
        // Set avatar
        if (callerContact.avatar) {
            elements.incomingCallAvatar.src = callerContact.avatar;
            elements.incomingCallAvatar.alt = callerContact.name;
        } else {
            // Generate avatar color and initials
            const initials = callerContact.name.split(' ').map(n => n[0]).join('').toUpperCase();
            const bgColor = stringToColor(callerContact.name);
            elements.incomingCallAvatar.style.backgroundColor = bgColor;
            elements.incomingCallAvatar.textContent = initials;
            elements.incomingCallAvatar.src = '';
        }
        
        // Set call type
        if (elements.incomingCallType) {
            elements.incomingCallType.textContent = callMetadata.callType === 'video' ? 'Video Call' : 'Voice Call';
            elements.incomingCallType.className = `call-type-badge ${callMetadata.callType}`;
        }
        
        // Set mood if available
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
        
        // Set intention if available
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
        
        // Show the incoming call modal
        elements.incomingCallModal.classList.add('active');
        
        // Set up auto-decline timer (30 seconds)
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
        
        // Store timer reference
        window._simulatedCallTimer = declineTimer;
        window._simulatedCallMetadata = callMetadata;
        window._simulatedCallerContact = callerContact;
        
        // Play incoming call sound (if available)
        playIncomingCallSound();
        
        // Emit call event
        emitCallEvent('incoming_call_simulated', {
            callerId: callerId,
            callerContact: callerContact,
            metadata: callMetadata,
            timestamp: Date.now()
        });
        
        // Notify parent window if in iframe
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'INCOMING_CALL_SIMULATED',
                source: 'calls-iframe',
                callerId: callerId,
                metadata: callMetadata,
                timestamp: Date.now()
            }, '*');
        }
        
        console.log('[Calls iframe] Incoming call simulation started');
        return true;
    } else {
        console.error('[Calls iframe] Could not find required UI elements for incoming call simulation');
        return false;
    }
}

function handleDeclineSimulatedCall(callId) {
    console.log('[Calls iframe] Simulated call auto-declined:', callId);
    
    if (elements.incomingCallModal) {
        elements.incomingCallModal.classList.remove('active');
    }
    
    if (window._simulatedCallTimer) {
        clearInterval(window._simulatedCallTimer);
        window._simulatedCallTimer = null;
    }
    
    // Emit call declined event
    emitCallEvent('call_declined', {
        callId: callId,
        reason: 'auto_decline',
        timestamp: Date.now()
    });
    
    // Show notification
    showNotification('Simulated call declined (auto)', 'info');
    
    // Clean up
    window._simulatedCallMetadata = null;
    window._simulatedCallerContact = null;
    
    // Stop incoming call sound
    stopIncomingCallSound();
}

function handleAcceptSimulatedCall(callMetadata, callerContact, isVideo = false) {
    console.log('[Calls iframe] Accepting simulated call:', callMetadata.callId);
    
    // Stop timer
    if (window._simulatedCallTimer) {
        clearInterval(window._simulatedCallTimer);
        window._simulatedCallTimer = null;
    }
    
    // Hide incoming call modal
    if (elements.incomingCallModal) {
        elements.incomingCallModal.classList.remove('active');
    }
    
    // Set up call state
    AppState.isInCall = true;
    AppState.callType = isVideo ? 'video' : callMetadata.callType;
    AppState.activeCallId = callMetadata.callId;
    AppState.callParticipants = [callerContact];
    AppState.callStartTime = Date.now();
    AppState.currentMood = callMetadata.mood || 'neutral';
    AppState.currentIntention = callMetadata.intention || 'quick';
    
    // Update UI for active call
    if (elements.callContainer) {
        elements.callContainer.classList.add('active');
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
    
    // Update mood and intention indicators
    updateMoodIndicator(AppState.currentMood);
    updateIntentionIndicator(AppState.currentIntention);
    
    // Start call timer
    startCallTimer();
    
    // Initialize call features
    initializeCallFeatures();
    
    // Show video if this is a video call
    if (isVideo || callMetadata.callType === 'video') {
        showSimulatedVideo(callerContact);
    }
    
    // Emit call accepted event
    emitCallEvent('call_accepted', {
        callId: callMetadata.callId,
        callType: AppState.callType,
        callerContact: callerContact,
        metadata: callMetadata,
        timestamp: Date.now()
    });
    
    // Notify parent window
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'CALL_ACCEPTED_SIMULATED',
            source: 'calls-iframe',
            callId: callMetadata.callId,
            callType: AppState.callType,
            callerContact: callerContact,
            timestamp: Date.now()
        }, '*');
    }
    
    // Show notification
    showNotification(`Simulated ${AppState.callType} call started`, 'success');
    
    // Clean up
    window._simulatedCallMetadata = null;
    window._simulatedCallerContact = null;
    
    // Stop incoming call sound
    stopIncomingCallSound();
}

function showSimulatedVideo(callerContact) {
    if (elements.videoGrid) {
        // Clear existing video containers
        elements.videoGrid.innerHTML = '';
        
        // Create local video container (simulated)
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
        
        // Create remote video container (simulated)
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
        
        // Update video layout
        updateVideoLayout();
        
        // For testing, we could simulate video stream with a test pattern
        simulateTestVideoPattern();
    }
}

function simulateTestVideoPattern() {
    // This is a placeholder for actual video simulation
    // In a real implementation, you might use a test pattern or mock stream
    console.log('[Calls iframe] Video simulation placeholder - would initialize WebRTC in real implementation');
}

function playIncomingCallSound() {
    // Create and play a simple incoming call sound
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        
        // Pulse pattern
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
        console.log('[Calls iframe] Could not play audio:', error);
    }
}

function stopIncomingCallSound() {
    if (window._soundInterval) {
        clearInterval(window._soundInterval);
        window._soundInterval = null;
    }
    
    if (window._oscillator) {
        try {
            window._oscillator.stop();
            window._oscillator = null;
        } catch (error) {
            console.log('[Calls iframe] Error stopping oscillator:', error);
        }
    }
    
    if (window._audioContext) {
        try {
            window._audioContext.close();
            window._audioContext = null;
        } catch (error) {
            console.log('[Calls iframe] Error closing audio context:', error);
        }
    }
}

function emitCallEvent(eventType, data) {
    // Emit event for internal listeners
    const event = new CustomEvent(`call:${eventType}`, { detail: data });
    window.dispatchEvent(event);
    
    // Also emit to global event bus if available
    if (window.EventBus) {
        window.EventBus.emit(`call.${eventType}`, data);
    }
    
    console.log(`[Calls iframe] Call event emitted: ${eventType}`, data);
}

// ==================== EXPORTED FUNCTIONS ====================
export function cacheElements() {
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
}

export function initializeOfflineDetection() {
    AppState.isOnline = navigator.onLine;
    
    if (!AppState.isOnline) {
        handleOffline();
    }
}

export function handleOnline() {
    console.log('[Calls iframe] App is online');
    AppState.isOnline = true;
    
    elements.offlineBanner.classList.remove('active');
    
    elements.appContainer.classList.remove('offline-ui');
    
    elements.syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Syncing...</span>';
    elements.syncIndicator.classList.add('syncing');
    
    if (window.callAPI && AppState.isAuthenticated) {
        window.callAPI.initializeBackgroundSync();
    }
    
    enableUI();
}

export function handleOffline() {
    console.log('[Calls iframe] App is offline');
    AppState.isOnline = false;
    
    elements.offlineBanner.classList.add('active');
    
    elements.appContainer.classList.add('offline-ui');
    
    elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
    elements.syncIndicator.classList.remove('syncing');
    
    showOfflineUI();
}

export function showOfflineUI() {
    if (elements.callContainer && elements.callContainer.classList.contains('active')) {
        elements.offlineCallPlaceholder.style.display = 'flex';
        elements.videoGrid.style.display = 'none';
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
}

export function enableUI() {
    console.log('[Calls iframe] Enabling UI elements...');
    
    const isAuthenticated = parentCoordinator ? 
        parentCoordinator.sessionValidated : 
        AppState.isAuthenticated;
    
    elements.newCallBtn.disabled = !isAuthenticated;
    
    elements.quickVoiceBtn.disabled = !isAuthenticated;
    elements.quickVideoBtn.disabled = !isAuthenticated;
    
    if (isAuthenticated && AppState.premiumFeatures.groupCalls) {
        elements.quickGroupBtn.disabled = false;
    } else {
        elements.quickGroupBtn.disabled = true;
    }
    
    if (AppState.isOnline) {
        elements.syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
        
        elements.offlineCallsState.style.display = 'none';
        elements.offlineContactsMessage.style.display = 'none';
        
        if (AppState.syncPending && window.callAPI) {
            window.callAPI.performBackgroundSync();
        }
    } else {
        elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
        showOfflineUI();
    }
    
    applySettingsToUI();
}

export function initializeUI() {
    if (elements.callsLoading) elements.callsLoading.style.display = 'none';
    if (elements.contactsLoading) elements.contactsLoading.style.display = 'none';
    
    updateMoodIndicator('neutral');
    updateIntentionIndicator('quick');
    
    initializeNotifications();
}

export function initializeNotifications() {
    elements.notificationToast.style.display = 'none';
}

export function showNotification(message, type = 'success') {
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
    
    elements.notificationArea.appendChild(notification);
    
    notification.querySelector('.call-notification-close').addEventListener('click', () => {
        notification.remove();
    });
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

export function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    if (element.querySelector('.pip-controls')) {
        element.querySelector('.pip-controls').onmousedown = dragMouseDown;
    } else {
        element.onmousedown = dragMouseDown;
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
}

export function closePip() {
    elements.pipContainer.style.display = 'none';
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
    
    elements.premiumLimitText.textContent = message;
    elements.premiumLimitOverlay.classList.add('active');
    
    return false;
}

export function updatePremiumUI() {
    if (!elements.quickGroupBtn || !elements.screenShareBtn) return;
    
    if (AppState.isPremium) {
        document.querySelectorAll('.premium-badge-small').forEach(badge => {
            badge.style.display = 'none';
        });
        
        elements.quickGroupBtn.disabled = false;
        elements.screenShareBtn.disabled = false;
    } else {
        document.querySelectorAll('.premium-badge-small').forEach(badge => {
            badge.style.display = 'block';
        });
        
        elements.quickGroupBtn.disabled = true;
        elements.screenShareBtn.disabled = true;
    }
}

export function loadSettings() {
    return new Promise((resolve) => {
        const savedSettings = localStorage.getItem('callSettings');
        if (savedSettings) {
            try {
                AppState.settings = { ...AppState.settings, ...JSON.parse(savedSettings) };
                applySettingsToUI();
            } catch (error) {
                console.log('[Calls iframe] Error loading settings:', error);
            }
        }
        resolve();
    });
}

export function saveSettings() {
    try {
        localStorage.setItem('callSettings', JSON.stringify(AppState.settings));
    } catch (error) {
        console.log('[Calls iframe] Error saving settings:', error);
    }
}

export function applySettingsToUI() {
    if (elements.emotionalContextToggle) elements.emotionalContextToggle.checked = AppState.settings.emotionalContext;
    if (elements.callIntentionToggle) elements.callIntentionToggle.checked = AppState.settings.callIntention;
    if (elements.inCallChatToggle) elements.inCallChatToggle.checked = AppState.settings.inCallChat;
    if (elements.whiteboardToggle) elements.whiteboardToggle.checked = AppState.settings.whiteboard;
    if (elements.pollsToggle) elements.pollsToggle.checked = AppState.settings.polls;
    if (elements.notesToggle) elements.notesToggle.checked = AppState.settings.notes;
    if (elements.focusModeToggle) elements.focusModeToggle.checked = AppState.settings.focusMode;
    if (elements.liveReactionsToggle) elements.liveReactionsToggle.checked = AppState.settings.liveReactions;
}

export function updateSetting(event) {
    const setting = event.target.id.replace('Toggle', '');
    AppState.settings[setting] = event.target.checked;
    saveSettings();
    
    applySettingChange(setting, event.target.checked);
}

export function applySettingChange(setting, value) {
    switch (setting) {
        case 'emotionalContext':
            if (!value) {
                elements.callMoodIndicator.style.display = 'none';
                elements.callIntentionIndicator.style.display = 'none';
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
            if (value) {
                elements.reactionsContainer.style.display = 'flex';
            } else {
                elements.reactionsContainer.style.display = 'none';
            }
            break;
        case 'inCallChat':
            if (!value && AppState.isInCall) {
                showNotification('Chat disabled', 'info');
            }
            break;
    }
}

export function resetSettings() {
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
}

export function handleParentMessage(event) {
    if (parentCoordinator && parentCoordinator.secureChannelEstablished) {
        return;
    }
    
    const allowedOrigins = [window.location.origin, 'http://localhost:*', 'https://yourdomain.com'];
    if (!allowedOrigins.some(origin => event.origin.match(new RegExp(origin.replace('*', '.*'))))) {
        console.log('[Calls iframe] Message from unauthorized origin:', event.origin);
        return;
    }
    
    const data = event.data;
    
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
        case 'TOKEN_UPDATE':
            break;
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
    console.log('[Calls iframe] Parent API ready signal received');
    AppState.apiReady = true;
    
    if (window.callAPI && window.callAPI.tokenManager) {
        setTimeout(() => window.callAPI.tokenManager.tryGetTokenFromAPI(), 100);
    }
}

export function handleDataRefresh(payload) {
    if (window.callAPI && AppState.isAuthenticated) {
        window.callAPI.performBackgroundSync();
        showNotification('Refreshing data...', 'info');
    }
}

export function handleStartCallRequest(payload) {
    if (payload.contactId && AppState.contacts.length > 0) {
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
    if (event.key === 'callSettings') {
        try {
            const newSettings = JSON.parse(event.newValue);
            AppState.settings = { ...AppState.settings, ...newSettings };
            applySettingsToUI();
        } catch (error) {
            console.error('[Calls iframe] Error parsing updated settings:', error);
        }
    }
    
    if (event.key === 'authUser' || event.key === 'currentUser') {
        try {
            const userData = JSON.parse(event.newValue);
            if (userData) {
                if (!AppState.isAuthenticated) {
                    AppState.user = userData;
                    AppState.currentUser = userData;
                    
                    elements.apiStatusIndicator.className = 'api-status-indicator connected';
                    elements.apiStatusText.textContent = `Authenticated as ${userData.name || userData.username || 'User'}`;
                    
                    setTimeout(() => {
                        elements.apiStatusIndicator.style.display = 'none';
                    }, 2000);
                }
            }
        } catch (error) {
            console.log('[Calls iframe] Error parsing user data update:', error);
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
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const color = Math.floor(Math.abs((Math.sin(hash) * 16777215) % 16777215)).toString(16);
    return '#' + '0'.repeat(6 - color.length) + color;
}

export function formatTimeAgo(timestamp) {
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
}

export function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const callId = urlParams.get('call');
    const callType = urlParams.get('type');
    
    if (callId) {
        elements.urlParamText.textContent = `You've been invited to join a ${callType || 'voice'} call. Would you like to join now?`;
        elements.urlParamOverlay.classList.add('active');
    }
}

export function closeUrlParamOverlay() {
    elements.urlParamOverlay.classList.remove('active');
    
    const url = new URL(window.location);
    url.searchParams.delete('call');
    url.searchParams.delete('type');
    window.history.replaceState({}, '', url);
}

export function joinUrlParamCall() {
    const urlParams = new URLSearchParams(window.location.search);
    const callId = urlParams.get('call');
    const callType = urlParams.get('type') || 'voice';
    
    showNotification(`Joining ${callType} call...`, 'info');
    
    closeUrlParamOverlay();
    
    setTimeout(() => {
        const randomContact = AppState.contacts.length > 0 ? 
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
}

export function updateMoodIndicator(mood) {
    if (!AppState.settings.emotionalContext) return;
    
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
}

export function updateIntentionIndicator(intention) {
    if (!AppState.settings.callIntention) return;
    
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
}

export function updateParticipantBadge() {
    const count = AppState.callParticipants.length + 1;
    elements.participantBadge.textContent = count;
}

export function updateChatBadge() {
    elements.chatBadge.textContent = AppState.unreadChatCount;
    if (AppState.unreadChatCount > 0) {
        elements.chatBadge.style.display = 'block';
    } else {
        elements.chatBadge.style.display = 'none';
    }
}

export function updateGroupCallButton() {
    const selectedContacts = document.querySelectorAll('.group-contact:checked').length;
    const hasGroupOption = document.querySelector('.option-item.selected') !== null;
    
    elements.startGroupCallBtn.disabled = !(selectedContacts >= 1 && hasGroupOption);
}

export function updateVideoLayout() {
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
}

export function initializeWhiteboard(canvas) {
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
}

export function sendChatMessage(message) {
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
        if (AppState.callParticipants.length > 0) {
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
}

export function saveSharedNotes(notes) {
    try {
        const callNotes = JSON.parse(localStorage.getItem('sharedCallNotes') || '[]');
        callNotes.push({
            notes: notes,
            timestamp: new Date().toISOString(),
            callId: AppState.activeCallId || 'general'
        });
        localStorage.setItem('sharedCallNotes', JSON.stringify(callNotes));
    } catch (error) {
        console.error('[Calls iframe] Error saving shared notes:', error);
    }
}

export function renderCallHistory() {
    elements.callsLoading.style.display = 'none';
    
    if (AppState.callHistory.length === 0) {
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
}

export function createCallHistoryItem(call) {
    const contact = AppState.contacts.find(c => c.id === call.contactId) || { name: call.contactName || 'Unknown' };
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
}

export function showUI() {
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.style.visibility = 'visible';
        appContainer.style.opacity = '1';
    }
    
    const loadingIndicators = document.querySelectorAll('.loading-indicator, .initializing-overlay');
    loadingIndicators.forEach(indicator => {
        indicator.style.display = 'none';
    });
    
    console.log('[Calls iframe] UI displayed immediately');
}

export function bootstrapIframe() {
    console.log('[Calls iframe] Bootstrapping with enhanced parent coordination...');
    
    if (sessionInitialized) {
        console.log('[Calls iframe] Already initialized, skipping bootstrap');
        return;
    }
    
    cacheElements();
    
    setupEventListeners();
    
    initializeOfflineDetection();
    
    initializeUI();
    
    showUI();
    
    window.callAPI = new CallAPIIntegration();
    
    setTimeout(() => {
        window.callAPI.initialize().then(() => {
            console.log('[Calls iframe] API integration with parent coordination initialized in background');
        }).catch(error => {
            console.error('[Calls iframe] API integration failed:', error);
        });
    }, 100);
    
    enableUI();
    
    checkUrlParameters();
    
    window.addEventListener('beforeunload', () => {
        if (window.callAPI) {
            window.callAPI.cleanup();
        }
    });
    
    console.log('[Calls iframe] Bootstrap complete - UI ready with enhanced parent coordination');
}

// ==================== SETUP EVENT LISTENERS FOR SIMULATED CALLS ====================
function setupEventListeners() {
    // Set up incoming call button handlers
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
}

// ==================== CALL MANAGEMENT FUNCTIONS ====================
function startCallTimer() {
    if (AppState.callDurationInterval) {
        clearInterval(AppState.callDurationInterval);
    }
    
    AppState.callDurationInterval = setInterval(() => {
        if (AppState.callStartTime && elements.callDuration) {
            const elapsedSeconds = Math.floor((Date.now() - AppState.callStartTime) / 1000);
            elements.callDuration.textContent = formatDuration(elapsedSeconds);
        }
    }, 1000);
}

function initializeCallFeatures() {
    // Initialize call controls and features
    console.log('[Calls iframe] Initializing call features for simulated call');
}

function showCallUI() {
    if (elements.callContainer) {
        elements.callContainer.classList.add('active');
    }
    
    if (elements.appContainer) {
        elements.appContainer.classList.add('in-call');
    }
}

function enableFocusMode() {
    console.log('[Calls iframe] Focus mode enabled for simulated call');
}

function disableFocusMode() {
    console.log('[Calls iframe] Focus mode disabled for simulated call');
}

// ==================== GLOBAL EXPORTS ====================
window.CallApp = {
    simulateIncomingCall,
    startTestCall: () => {
        if (AppState.contacts.length > 0) {
            startCall('video', [AppState.contacts[0]]);
        } else {
            console.log('[Calls iframe] Cannot start test call - no contacts available');
        }
    },
    getState: () => AppState,
    checkApiStatus: () => {
        return {
            isAuthenticated: AppState.isAuthenticated,
            apiReady: AppState.apiReady,
            user: AppState.user,
            tokenReady: window.callAPI ? window.callAPI.tokenManager.isTokenReady() : false,
            parentCoordinator: parentCoordinator ? parentCoordinator.getStatus() : null
        };
    },
    notifyParent: (type, data) => {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: type,
                source: 'calls-iframe',
                ...data,
                timestamp: Date.now()
            }, '*');
        }
    }
};

// Initialize the application
window.addEventListener('DOMContentLoaded', bootstrapIframe);