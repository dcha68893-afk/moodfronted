// ==================== GLOBAL USER DATA MANAGEMENT ====================
import { 
    secureFetch, 
    getUserToken, 
    getCurrentUser, 
    getApiBaseUrl,
    isAuthenticated,
    logout
} from './api.core.js';

window.currentUser = null;
window.userDataLoaded = false;
window.userDataFetchInProgress = false;
window.parentDataTimeout = 3000; // 3 seconds timeout for parent response
window.parentCommunicationAttempted = false;
window.sessionAuthorityReady = false;
window.parentCoordinator = null;
window.sessionInitialized = false;
window.sessionInitializationLock = false;
window.handshakeComplete = false;
window.reconnectionAttempts = 0;
window.maxReconnectionAttempts = 5;
window.reconnectionDelay = 1000;

// ==================== PARENT COORDINATION CONTROLLER ====================
class ParentCoordinator {
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
        this.fallbackState = 'waiting'; // waiting, reconnecting, unavailable
        this.sessionUpdateCallbacks = [];
        this.uiBindings = [];
    }
    
    // Initialize parent coordination
    async initialize() {
        console.log('[Calls iframe] Initializing parent coordination...');
        
        // 1. Parent detection and validation
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
        
        // 2. Establish secure messaging channel
        this.establishMessagingChannel();
        
        // 3. Start handshake protocol
        await this.initiateHandshake();
        
        // 4. Start heartbeat monitoring
        this.startHeartbeat();
        
        // 5. Set up re-synchronization listeners
        this.setupResynchronization();
    }
    
    // Detect parent window and validate origin
    detectParent() {
        try {
            this.parentDetected = !!(window.parent && window.parent !== window);
            
            if (this.parentDetected) {
                try {
                    this.sameOrigin = window.location.origin === window.parent.location.origin;
                    console.log(`[Calls iframe] Parent detected, same-origin: ${this.sameOrigin}`);
                } catch (error) {
                    // Cross-origin access error
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
    
    // Establish secure messaging channel
    establishMessagingChannel() {
        window.addEventListener('message', this.handleParentMessage.bind(this));
        console.log('[Calls iframe] Secure messaging channel established');
        this.secureChannelEstablished = true;
    }
    
    // Handle parent messages
    handleParentMessage(event) {
        // Security: Validate origin
        if (!this.isValidOrigin(event.origin)) {
            console.warn('[Calls iframe] Message from unauthorized origin:', event.origin);
            return;
        }
        
        const data = event.data;
        
        // Debug logging
        if (data.type && !data.type.includes('HEARTBEAT')) {
            console.log('[Calls iframe] Received message from parent:', data.type, data);
        }
        
        // Route to appropriate handler
        if (this.messageHandlers.has(data.type)) {
            this.messageHandlers.get(data.type)(data);
        } else {
            // Fallback to default handler
            this.handleDefaultMessage(data);
        }
        
        // Process pending requests
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
    
    // Validate message origin
    isValidOrigin(origin) {
        // Allow same origin
        if (origin === window.location.origin) return true;
        
        // Allow local development
        if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) return true;
        
        // Allow parent domain (strip port if present)
        try {
            const parentHost = window.location.hostname;
            const originHost = new URL(origin).hostname;
            
            // Check if origins match or are subdomains
            return originHost === parentHost || 
                   originHost.endsWith('.' + parentHost) ||
                   parentHost.endsWith('.' + originHost);
        } catch (error) {
            return false;
        }
    }
    
    // Initiate handshake protocol
    async initiateHandshake() {
        if (this.handshakeInProgress || this.handshakeComplete) {
            console.log('[Calls iframe] Handshake already in progress or complete');
            return;
        }
        
        this.handshakeInProgress = true;
        this.setFallbackState('waiting');
        
        console.log('[Calls iframe] Starting handshake protocol...');
        
        // Send CHILD_READY signal
        this.sendToParent({
            type: 'CHILD_READY',
            source: 'calls-iframe',
            timestamp: Date.now(),
            version: '1.0',
            capabilities: ['session_management', 'ui_coordination', 'api_routing']
        });
        
        // Send REQUEST_SESSION with exponential backoff
        await this.requestSessionWithBackoff();
    }
    
    // Request session with exponential backoff
    async requestSessionWithBackoff() {
        let attempt = 0;
        const maxAttempts = 5;
        const baseDelay = 1000;
        
        while (attempt < maxAttempts && !this.handshakeComplete) {
            attempt++;
            const delay = baseDelay * Math.pow(2, attempt - 1);
            
            console.log(`[Calls iframe] Requesting session (attempt ${attempt}/${maxAttempts})...`);
            
            // Send session request
            this.sendToParent({
                type: 'REQUEST_SESSION',
                source: 'calls-iframe',
                timestamp: Date.now(),
                attempt: attempt,
                requestId: 'session_req_' + Date.now()
            });
            
            // Wait for response or timeout
            await new Promise(resolve => {
                const timeoutId = setTimeout(() => {
                    console.log(`[Calls iframe] Session request timeout (attempt ${attempt})`);
                    resolve();
                }, delay);
                
                // Check if handshake completed during wait
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
    
    // Send message to parent
    sendToParent(message, targetOrigin = '*') {
        if (!this.parentDetected || !window.parent) {
            console.warn('[Calls iframe] Cannot send message - no parent detected');
            return false;
        }
        
        try {
            // Add source identifier
            message.source = message.source || 'calls-iframe';
            message.timestamp = message.timestamp || Date.now();
            
            window.parent.postMessage(message, targetOrigin);
            return true;
        } catch (error) {
            console.error('[Calls iframe] Error sending message to parent:', error);
            return false;
        }
    }
    
    // Send message and wait for response
    sendWithResponse(message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (!this.parentDetected) {
                reject(new Error('No parent detected'));
                return;
            }
            
            const requestId = 'req_' + Date.now();
            message.requestId = requestId;
            
            // Store pending request
            this.pendingRequests.set(requestId, { resolve, reject });
            
            // Send message
            if (!this.sendToParent(message)) {
                this.pendingRequests.delete(requestId);
                reject(new Error('Failed to send message'));
                return;
            }
            
            // Set timeout
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Request timeout'));
                }
            }, timeout);
        });
    }
    
    // Handle session data
    handleSessionData(sessionData) {
        console.log('[Calls iframe] Received SESSION_DATA:', sessionData);
        
        // Validate session schema
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
        
        // Store session data
        this.sessionData = sessionData;
        this.sessionValidated = true;
        
        // Complete handshake
        this.handshakeComplete = true;
        this.handshakeInProgress = false;
        this.setFallbackState('connected');
        
        // Update global state
        this.updateGlobalStateFromSession();
        
        // Bind UI after confirmation
        this.bindUIAfterSessionConfirmation();
        
        // Notify parent of successful session consumption
        this.sendToParent({
            type: 'SESSION_CONSUMED',
            source: 'calls-iframe',
            timestamp: Date.now(),
            sessionId: sessionData.sessionId,
            userId: sessionData.user?.id
        });
        
        console.log('[Calls iframe] Session data consumed successfully');
    }
    
    // Validate session schema
    validateSessionSchema(sessionData) {
        if (!sessionData || typeof sessionData !== 'object') {
            return false;
        }
        
        // Required fields
        const requiredFields = ['sessionId', 'timestamp'];
        for (const field of requiredFields) {
            if (!sessionData.hasOwnProperty(field)) {
                console.warn(`[Calls iframe] Missing required field: ${field}`);
                return false;
            }
        }
        
        // User data validation (if present)
        if (sessionData.user) {
            if (!sessionData.user.id || !sessionData.user.username) {
                console.warn('[Calls iframe] Invalid user data in session');
                return false;
            }
        }
        
        // Authentication state validation
        if (sessionData.authenticated !== undefined && typeof sessionData.authenticated !== 'boolean') {
            console.warn('[Calls iframe] Invalid authenticated field');
            return false;
        }
        
        return true;
    }
    
    // Update global state from session
    updateGlobalStateFromSession() {
        if (!this.sessionData) return;
        
        // Update current user
        if (this.sessionData.user) {
            window.currentUser = this.sessionData.user;
            window.userDataLoaded = true;
            
            // Update AppState
            if (window.AppState) {
                window.AppState.user = this.sessionData.user;
                window.AppState.currentUser = this.sessionData.user;
                window.AppState.isAuthenticated = this.sessionData.authenticated || false;
            }
        }
        
        // Update authentication state
        if (this.sessionData.authenticated !== undefined) {
            window.sessionAuthorityReady = this.sessionData.authenticated;
            
            if (!this.sessionData.authenticated) {
                // Handle logout state
                this.handleLogout();
            }
        }
        
        // Update token if present
        if (this.sessionData.token) {
            this.handleTokenUpdate(this.sessionData.token);
        }
        
        // Update API configuration if present
        if (this.sessionData.apiConfig) {
            this.handleApiConfigUpdate(this.sessionData.apiConfig);
        }
    }
    
    // Bind UI after session confirmation
    bindUIAfterSessionConfirmation() {
        if (!this.sessionValidated || !window.currentUser) {
            console.warn('[Calls iframe] Cannot bind UI - session not validated or no user data');
            return;
        }
        
        console.log('[Calls iframe] Binding UI with session data...');
        
        // Execute UI bindings
        this.uiBindings.forEach(binding => {
            try {
                binding();
            } catch (error) {
                console.error('[Calls iframe] Error in UI binding:', error);
            }
        });
        
        // Update UI with user data
        this.updateUIWithSessionData();
        
        // Enable protected UI
        this.enableProtectedUI();
        
        console.log('[Calls iframe] UI binding complete');
    }
    
    // Update UI with session data
    updateUIWithSessionData() {
        if (!window.currentUser) return;
        
        console.log('[Calls iframe] Updating UI with session data:', window.currentUser.username || window.currentUser.name);
        
        // Update user info in sidebar if elements exist
        const userElements = {
            'userAvatar': window.currentUser.avatar,
            'userName': window.currentUser.name || window.currentUser.username,
            'userStatus': window.currentUser.status || 'Online'
        };
        
        // Update any user-specific UI elements
        this.updateUserSpecificUI(userElements);
        
        // Update API status indicator
        this.updateApiStatusIndicator();
        
        // Update sync indicator
        this.updateSyncIndicator();
    }
    
    // Update user-specific UI elements
    updateUserSpecificUI(userElements) {
        // Find and update user avatar elements
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
        
        // Find and update user name elements
        document.querySelectorAll('.user-name, .username').forEach(el => {
            if (el.textContent.includes('User') || el.textContent.includes('Loading')) {
                el.textContent = userElements.userName;
            }
        });
        
        // Update call status text if available
        const callStatusText = document.getElementById('callStatusText');
        if (callStatusText && callStatusText.textContent.includes('Waiting for API')) {
            callStatusText.textContent = `Ready (${userElements.userName})`;
        }
    }
    
    // Update API status indicator
    updateApiStatusIndicator() {
        const apiStatusIndicator = document.getElementById('apiStatusIndicator');
        const apiStatusText = document.getElementById('apiStatusText');
        
        if (apiStatusIndicator && apiStatusText) {
            apiStatusIndicator.className = 'api-status-indicator connected';
            apiStatusText.textContent = `Authenticated as ${window.currentUser?.name || window.currentUser?.username || 'User'}`;
            
            setTimeout(() => {
                apiStatusIndicator.style.display = 'none';
            }, 2000);
        }
    }
    
    // Update sync indicator
    updateSyncIndicator() {
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
            syncIndicator.classList.remove('syncing');
        }
    }
    
    // Enable protected UI
    enableProtectedUI() {
        if (!this.sessionValidated || !window.currentUser) {
            console.warn('[Calls iframe] Cannot enable protected UI - session not validated');
            return;
        }
        
        console.log('[Calls iframe] Enabling protected UI features...');
        
        // Enable new call button
        const newCallBtn = document.getElementById('newCallBtn');
        if (newCallBtn) newCallBtn.disabled = false;
        
        // Enable quick action buttons
        const quickVoiceBtn = document.getElementById('quickVoiceBtn');
        const quickVideoBtn = document.getElementById('quickVideoBtn');
        if (quickVoiceBtn) quickVoiceBtn.disabled = false;
        if (quickVideoBtn) quickVideoBtn.disabled = false;
        
        // Load user-specific data
        this.loadUserSpecificData();
    }
    
    // Load user-specific data (contacts, call history, etc.)
    async loadUserSpecificData() {
        if (!window.currentUser || !window.userDataLoaded) return;
        
        console.log('[Calls iframe] Loading user-specific data through parent coordination...');
        
        try {
            // Route through parent API coordination
            await this.routeApiCall('/api/contacts', 'GET');
            await this.routeApiCall('/api/calls/history', 'GET');
            
            // Use existing API integration if available
            if (window.callAPI) {
                await window.callAPI.performInitialDataLoad();
            }
        } catch (error) {
            console.error('[Calls iframe] Error loading user-specific data:', error);
        }
    }
    
    // Route API call through parent coordination
    async routeApiCall(endpoint, method = 'GET', data = null) {
        if (!this.sessionValidated) {
            throw new Error('Cannot route API call - session not validated');
        }
        
        try {
            // Use parent's API routing if available
            if (window.parent && window.parent.api && window.parent.api.request) {
                return await window.parent.api.request(endpoint, method, data);
            }
            
            // Use app.core if available
            if (window.parent && window.parent.app && window.parent.app.core) {
                return await window.parent.app.core.request(endpoint, method, data);
            }
            
            // Fallback to secure messaging
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
    
    // Handle session update
    handleSessionUpdate(updateData) {
        console.log('[Calls iframe] Received SESSION_UPDATE:', updateData);
        
        // Update session data
        if (updateData.sessionData) {
            this.sessionData = { ...this.sessionData, ...updateData.sessionData };
        }
        
        // Update user data if present
        if (updateData.user) {
            window.currentUser = { ...window.currentUser, ...updateData.user };
            
            // Update AppState
            if (window.AppState) {
                window.AppState.user = window.currentUser;
                window.AppState.currentUser = window.currentUser;
            }
            
            // Update UI
            this.updateUIWithSessionData();
        }
        
        // Notify update callbacks
        this.sessionUpdateCallbacks.forEach(callback => {
            try {
                callback(updateData);
            } catch (error) {
                console.error('[Calls iframe] Error in session update callback:', error);
            }
        });
        
        console.log('[Calls iframe] Session updated successfully');
    }
    
    // Handle logout
    handleLogout() {
        console.log('[Calls iframe] Logout received from parent coordination');
        
        // Clear user data
        window.currentUser = null;
        window.userDataLoaded = false;
        window.sessionAuthorityReady = false;
        this.sessionValidated = false;
        this.sessionData = null;
        
        // Clear AppState
        if (window.AppState) {
            window.AppState.user = null;
            window.AppState.currentUser = null;
            window.AppState.isAuthenticated = false;
        }
        
        // Disable protected UI
        this.disableProtectedUI();
        
        // Show login/redirect state
        this.showReconnectState();
        
        // Notify other parts of the app
        if (window.CallApp) {
            window.CallApp.notifyParent('USER_LOGGED_OUT', {});
        }
        
        console.log('[Calls iframe] Logout handled successfully');
    }
    
    // Disable protected UI
    disableProtectedUI() {
        console.log('[Calls iframe] Disabling protected UI...');
        
        // Disable new call button
        const newCallBtn = document.getElementById('newCallBtn');
        if (newCallBtn) newCallBtn.disabled = true;
        
        // Disable quick action buttons
        const quickVoiceBtn = document.getElementById('quickVoiceBtn');
        const quickVideoBtn = document.getElementById('quickVideoBtn');
        if (quickVoiceBtn) quickVoiceBtn.disabled = true;
        if (quickVideoBtn) quickVideoBtn.disabled = true;
        
        // Show login/redirect message
        this.showReconnectState();
    }
    
    // Show reconnect state
    showReconnectState() {
        const appContainer = document.getElementById('appContainer');
        if (!appContainer) return;
        
        // Remove existing reconnect overlay
        const existingOverlay = document.querySelector('.reconnect-overlay');
        if (existingOverlay) existingOverlay.remove();
        
        // Create reconnect overlay
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
        
        // Add retry button handler
        document.getElementById('retryReconnectBtn')?.addEventListener('click', () => {
            this.initiateHandshake();
        });
    }
    
    // Handle token update
    handleTokenUpdate(tokenData) {
        console.log('[Calls iframe] Received token update from parent coordination');
        
        // Update token in TokenManager if available
        if (window.callAPI && window.callAPI.tokenManager) {
            if (tokenData.token) {
                window.callAPI.tokenManager.setToken(tokenData.token);
            }
        }
        
        // Store in session data
        if (this.sessionData) {
            this.sessionData.token = tokenData.token;
        }
    }
    
    // Handle API config update
    handleApiConfigUpdate(apiConfig) {
        console.log('[Calls iframe] Received API config update');
        
        // Update API configuration
        if (window.callAPI) {
            window.callAPI.apiConfig = { ...window.callAPI.apiConfig, ...apiConfig };
        }
    }
    
    // Handle default message
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
    
    // Register message handler
    registerMessageHandler(type, handler) {
        this.messageHandlers.set(type, handler);
    }
    
    // Register UI binding
    registerUIBinding(binding) {
        this.uiBindings.push(binding);
    }
    
    // Register session update callback
    registerSessionUpdateCallback(callback) {
        this.sessionUpdateCallbacks.push(callback);
    }
    
    // Start heartbeat monitoring
    startHeartbeat() {
        // Clear existing interval
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        // Send heartbeat every 30 seconds
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000);
        
        // Initial heartbeat
        setTimeout(() => this.sendHeartbeat(), 5000);
    }
    
    // Send heartbeat
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
    
    // Handle heartbeat response
    handleHeartbeatResponse() {
        // Update last heartbeat time
        this.lastHeartbeat = Date.now();
    }
    
    // Handle child ready acknowledgement
    handleChildReadyAck() {
        console.log('[Calls iframe] CHILD_READY acknowledged by parent');
    }
    
    // Handle session request acknowledgement
    handleSessionRequestAck() {
        console.log('[Calls iframe] SESSION_REQUEST acknowledged by parent');
    }
    
    // Handle API ready
    handleApiReady() {
        console.log('[Calls iframe] Parent API ready signal received');
        
        // Update AppState
        if (window.AppState) {
            window.AppState.apiReady = true;
        }
        
        // Try to get token from parent API
        setTimeout(() => {
            if (window.callAPI && window.callAPI.tokenManager) {
                window.callAPI.tokenManager.tryGetTokenFromAPI();
            }
        }, 100);
    }
    
    // Set fallback state
    setFallbackState(state) {
        this.fallbackState = state;
        
        // Update UI based on state
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
    
    // Show waiting state
    showWaitingState() {
        console.log('[Calls iframe] Showing waiting state for parent coordination');
        // UI updates are handled by the main UI system
    }
    
    // Show reconnecting state
    showReconnectingState() {
        console.log('[Calls iframe] Showing reconnecting state');
        this.showReconnectState();
    }
    
    // Show unavailable state
    showUnavailableState() {
        console.log('[Calls iframe] Parent coordination unavailable');
        
        const appContainer = document.getElementById('appContainer');
        if (!appContainer) return;
        
        // Remove existing overlays
        document.querySelectorAll('.reconnect-overlay, .unavailable-overlay').forEach(el => el.remove());
        
        // Create unavailable overlay
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
        
        // Add refresh button handler
        document.getElementById('refreshPageBtn')?.addEventListener('click', () => {
            location.reload();
        });
    }
    
    // Hide fallback state
    hideFallbackState() {
        // Remove any fallback overlays
        document.querySelectorAll('.reconnect-overlay, .unavailable-overlay').forEach(el => el.remove());
    }
    
    // Setup re-synchronization
    setupResynchronization() {
        // Listen for visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.parentDetected) {
                this.checkParentConnection();
            }
        });
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            if (this.parentDetected) {
                this.checkParentConnection();
            }
        });
    }
    
    // Check parent connection
    checkParentConnection() {
        if (!this.handshakeComplete && this.parentDetected) {
            console.log('[Calls iframe] Checking parent connection...');
            this.initiateHandshake();
        }
    }
    
    // Cleanup
    cleanup() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        if (this.reconnectionTimer) {
            clearTimeout(this.reconnectionTimer);
            this.reconnectionTimer = null;
        }
        
        // Clear message handlers
        this.messageHandlers.clear();
        this.pendingRequests.clear();
        this.uiBindings = [];
        this.sessionUpdateCallbacks = [];
    }
    
    // Get coordination status
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
class ParentChildCommunication {
    constructor() {
        this.parentDataReceived = false;
        this.directFetchInProgress = false;
        this.parentResponseTimeout = null;
        this.dataFetchLock = false;
        this.authVerified = false;
        this.parentOrigin = window.location.origin; // Default to same origin
        this.parentCoordinator = window.parentCoordinator;
    }
    
    // Initialize communication with parent
    async initialize() {
        console.log('[Calls iframe] Initializing parent-child communication with coordination...');
        
        // 1. Initialize parent coordinator first
        if (!window.parentCoordinator) {
            window.parentCoordinator = new ParentCoordinator();
            this.parentCoordinator = window.parentCoordinator;
            await this.parentCoordinator.initialize();
        }
        
        // 2. Setup message listener for parent (backward compatibility)
        this.setupLegacyMessageListener();
        
        // 3. Request data from parent (legacy fallback)
        if (!this.parentCoordinator.handshakeComplete) {
            this.requestDataFromParent();
        }
        
        // 4. Start timeout for parent response (legacy fallback)
        this.startParentResponseTimeout();
        
        // 5. Load any cached data immediately
        this.loadCachedUserData();
        
        // 6. Register UI bindings with coordinator
        this.registerWithCoordinator();
    }
    
    // Register with parent coordinator
    registerWithCoordinator() {
        if (!this.parentCoordinator) return;
        
        // Register message handlers for legacy formats
        this.parentCoordinator.registerMessageHandler('USER_DATA', (data) => {
            this.handleParentUserData(data.payload || data);
        });
        
        this.parentCoordinator.registerMessageHandler('AUTH_UPDATE', (data) => {
            this.handleAuthUpdate(data.payload || data);
        });
        
        this.parentCoordinator.registerMessageHandler('PROFILE_UPDATE', (data) => {
            this.handleProfileUpdate(data.payload || data);
        });
        
        // Register UI binding
        this.parentCoordinator.registerUIBinding(() => {
            if (window.currentUser) {
                this.updateUIWithUserData();
                this.initializeAppWithUserData();
            }
        });
        
        // Register session update callback
        this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
            if (updateData.user) {
                this.handleProfileUpdate(updateData.user);
            }
        });
    }
    
    // Setup legacy message listener for backward compatibility
    setupLegacyMessageListener() {
        window.addEventListener('message', (event) => {
            // Skip if handled by coordinator
            if (this.parentCoordinator && this.parentCoordinator.secureChannelEstablished) {
                return;
            }
            
            // Legacy message handling
            this.handleLegacyMessage(event);
        });
    }
    
    // Handle legacy messages
    handleLegacyMessage(event) {
        // Security: Validate origin
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
    
    // Validate message origin
    isValidOrigin(origin) {
        // Allow same origin
        if (origin === window.location.origin) return true;
        
        // Allow local development
        if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) return true;
        
        // Allow parent domain (strip port if present)
        const parentHost = window.location.hostname;
        const originHost = new URL(origin).hostname;
        
        // Check if origins match or are subdomains
        return originHost === parentHost || 
               originHost.endsWith('.' + parentHost) ||
               parentHost.endsWith('.' + originHost);
    }
    
    // Request data from parent (legacy fallback)
    requestDataFromParent() {
        if (window.parent && window.parent !== window && !this.parentCoordinator.handshakeComplete) {
            console.log('[Calls iframe] Requesting user data from parent (legacy fallback)...');
            
            const requestId = 'req_' + Date.now();
            
            // Send ping first to check if parent is responsive
            window.parent.postMessage({
                type: 'PING',
                source: 'calls-iframe',
                requestId: requestId,
                timestamp: Date.now()
            }, '*');
            
            // Then request user data
            setTimeout(() => {
                window.parent.postMessage({
                    type: 'GET_USER_DATA',
                    source: 'calls-iframe',
                    requestId: requestId,
                    timestamp: Date.now()
                }, '*');
            }, 100);
            
            window.parentCommunicationAttempted = true;
        } else {
            console.log('[Calls iframe] No parent window detected, will use coordination system');
            this.parentDataReceived = false;
            
            // Don't start direct fetch - wait for coordination
            if (!this.parentCoordinator || !this.parentCoordinator.handshakeComplete) {
                this.startCoordinatedFetch();
            }
        }
    }
    
    // Start coordinated fetch through parent coordinator
    async startCoordinatedFetch() {
        if (this.dataFetchLock || window.userDataLoaded) {
            console.log('[Calls iframe] Data fetch already in progress or completed, skipping...');
            return;
        }
        
        this.dataFetchLock = true;
        
        console.log('[Calls iframe] Starting coordinated data fetch...');
        
        try {
            // Wait for parent coordinator to establish session
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
    
    // Wait for session data from coordinator
    async waitForSessionData() {
        return new Promise((resolve, reject) => {
            if (this.parentCoordinator.sessionValidated && window.currentUser) {
                resolve();
                return;
            }
            
            // Wait for up to 10 seconds
            const timeout = setTimeout(() => {
                reject(new Error('Session data timeout'));
            }, 10000);
            
            // Check periodically
            const checkInterval = setInterval(() => {
                if (this.parentCoordinator.sessionValidated && window.currentUser) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    resolve();
                }
                
                // Check if coordinator failed
                if (this.parentCoordinator.fallbackState === 'unavailable') {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    reject(new Error('Parent coordination unavailable'));
                }
            }, 100);
        });
    }
    
    // Start timeout for parent response (legacy fallback)
    startParentResponseTimeout() {
        // Only use legacy timeout if coordinator is not available
        if (this.parentCoordinator && this.parentCoordinator.parentDetected) {
            console.log('[Calls iframe] Using parent coordinator, skipping legacy timeout');
            return;
        }
        
        this.parentResponseTimeout = setTimeout(() => {
            if (!this.parentDataReceived && !this.directFetchInProgress) {
                console.log('[Calls iframe] Parent response timeout, starting coordinated fetch...');
                this.startCoordinatedFetch();
            }
        }, window.parentDataTimeout);
    }
    
    // Handle user data from parent (legacy)
    handleParentUserData(userData) {
        if (this.dataFetchLock || window.userDataLoaded) {
            console.log('[Calls iframe] Data already loaded or fetch in progress, ignoring parent data');
            return;
        }
        
        console.log('[Calls iframe] Received user data from parent (legacy):', userData);
        
        // Clear parent timeout
        if (this.parentResponseTimeout) {
            clearTimeout(this.parentResponseTimeout);
            this.parentResponseTimeout = null;
        }
        
        // Set flag to prevent direct fetch
        this.parentDataReceived = true;
        this.dataFetchLock = true;
        
        // Process parent data
        this.processUserData(userData, 'parent-legacy');
        
        // Notify that parent data was received
        this.notifyDataLoaded('parent-legacy');
    }
    
    // Handle auth update from parent
    handleAuthUpdate(authData) {
        console.log('[Calls iframe] Received auth update from parent:', authData);
        
        // Update coordinator session if available
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
            // Legacy handling
            if (authData.authenticated && authData.user) {
                window.currentUser = authData.user;
                window.userDataLoaded = true;
                this.updateUIWithUserData();
            } else if (authData.authenticated === false) {
                this.handleLogout();
            }
        }
    }
    
    // Handle profile update from parent
    handleProfileUpdate(profileData) {
        console.log('[Calls iframe] Received profile update from parent:', profileData);
        
        if (window.currentUser) {
            // Merge profile updates
            window.currentUser = {
                ...window.currentUser,
                ...profileData
            };
            
            // Update UI
            this.updateUIWithUserData();
            
            // Cache updated data
            this.cacheUserData();
            
            // Show notification
            this.showNotification('Profile updated', 'success');
        }
    }
    
    // Handle logout
    handleLogout() {
        console.log('[Calls iframe] Logout requested by parent');
        
        // Use coordinator if available
        if (this.parentCoordinator) {
            this.parentCoordinator.handleLogout();
        } else {
            // Legacy logout handling
            this.performLegacyLogout();
        }
    }
    
    // Perform legacy logout
    performLegacyLogout() {
        // Clear user data
        window.currentUser = null;
        window.userDataLoaded = false;
        this.authVerified = false;
        
        // Clear cached data
        this.clearCachedData();
        
        // Redirect to login or show login screen
        this.showLoginScreen();
        
        // Notify other parts of the app
        if (window.CallApp) {
            window.CallApp.notifyParent('USER_LOGGED_OUT', {});
        }
    }
    
    // Handle parent pong response
    handleParentPong() {
        console.log('[Calls iframe] Parent is responsive (legacy)');
        // Parent is alive, waiting for user data...
    }
    
    // Handle token update
    handleTokenUpdate(tokenData) {
        console.log('[Calls iframe] Received token update from parent');
        // Token updates are handled by the TokenManager or coordinator
        if (this.parentCoordinator) {
            this.parentCoordinator.handleTokenUpdate(tokenData);
        }
    }
    
    // Handle API ready signal
    handleApiReady() {
        console.log('[Calls iframe] Parent API ready signal received');
        // API ready updates are handled by existing system
        if (this.parentCoordinator) {
            this.parentCoordinator.handleApiReady();
        }
    }
    
    // Process user data from any source
    processUserData(userData, source) {
        console.log(`[Calls iframe] Processing user data from ${source}:`, userData);
        
        if (!userData || !userData.id) {
            throw new Error('Invalid user data received');
        }
        
        // Store user data globally
        window.currentUser = userData;
        window.userDataLoaded = true;
        this.authVerified = true;
        
        // Cache the data
        this.cacheUserData();
        
        // Update UI
        this.updateUIWithUserData();
        
        // Initialize app with user data
        this.initializeAppWithUserData();
        
        // Show success notification
        this.showNotification(`User data loaded from ${source}`, 'success');
        
        // Log success
        console.log(`[Calls iframe] User data successfully loaded from ${source}`);
    }
    
    // Handle data fetch failure
    handleDataFetchFailure(error) {
        console.error('[Calls iframe] All data fetch attempts failed:', error);
        
        // Check for cached data
        const cachedUser = this.getCachedUserData();
        if (cachedUser) {
            console.log('[Calls iframe] Using cached user data');
            window.currentUser = cachedUser;
            window.userDataLoaded = true;
            this.updateUIWithUserData();
            this.showNotification('Using cached data (offline mode)', 'warning');
        } else {
            // No data available, show reconnect state
            if (this.parentCoordinator) {
                this.parentCoordinator.showReconnectState();
            } else {
                this.showLoginScreen();
            }
            this.showNotification('Please wait for session reconnection', 'error');
        }
    }
    
    // Update UI with user data
    updateUIWithUserData() {
        if (!window.currentUser) return;
        
        console.log('[Calls iframe] Updating UI with user data:', window.currentUser.username || window.currentUser.name);
        
        // Update user info in sidebar if elements exist
        const userElements = {
            'userAvatar': window.currentUser.avatar,
            'userName': window.currentUser.name || window.currentUser.username,
            'userStatus': window.currentUser.status || 'Online'
        };
        
        // Update any user-specific UI elements
        this.updateUserSpecificUI(userElements);
        
        // Update API status indicator
        this.updateApiStatusIndicator();
        
        // Update sync indicator
        this.updateSyncIndicator();
    }
    
    // Update user-specific UI elements
    updateUserSpecificUI(userElements) {
        // Find and update user avatar elements
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
        
        // Find and update user name elements
        document.querySelectorAll('.user-name, .username').forEach(el => {
            if (el.textContent.includes('User') || el.textContent.includes('Loading')) {
                el.textContent = userElements.userName;
            }
        });
        
        // Update call status text if available
        const callStatusText = document.getElementById('callStatusText');
        if (callStatusText && callStatusText.textContent.includes('Waiting for API')) {
            callStatusText.textContent = `Ready (${userElements.userName})`;
        }
    }
    
    // Update API status indicator
    updateApiStatusIndicator() {
        const apiStatusIndicator = document.getElementById('apiStatusIndicator');
        const apiStatusText = document.getElementById('apiStatusText');
        
        if (apiStatusIndicator && apiStatusText) {
            apiStatusIndicator.className = 'api-status-indicator connected';
            apiStatusText.textContent = `Authenticated as ${window.currentUser?.name || window.currentUser?.username || 'User'}`;
            
            setTimeout(() => {
                apiStatusIndicator.style.display = 'none';
            }, 2000);
        }
    }
    
    // Update sync indicator
    updateSyncIndicator() {
        const syncIndicator = document.getElementById('syncIndicator');
        if (syncIndicator) {
            syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
            syncIndicator.classList.remove('syncing');
        }
    }
    
    // Initialize app with user data
    initializeAppWithUserData() {
        // Initialize existing app systems with user data
        if (window.callAPI) {
            window.callAPI.onAuthenticationSuccess();
        }
        
        // Update AppState
        if (window.AppState) {
            window.AppState.user = window.currentUser;
            window.AppState.currentUser = window.currentUser;
            window.AppState.isAuthenticated = true;
        }
        
        // Enable UI features
        this.enableUIFeatures();
    }
    
    // Enable UI features after authentication
    enableUIFeatures() {
        // Enable new call button
        const newCallBtn = document.getElementById('newCallBtn');
        if (newCallBtn) newCallBtn.disabled = false;
        
        // Enable quick action buttons
        const quickVoiceBtn = document.getElementById('quickVoiceBtn');
        const quickVideoBtn = document.getElementById('quickVideoBtn');
        if (quickVoiceBtn) quickVoiceBtn.disabled = false;
        if (quickVideoBtn) quickVideoBtn.disabled = false;
        
        // Load user-specific data
        this.loadUserSpecificData();
    }
    
    // Load user-specific data (contacts, call history, etc.)
    async loadUserSpecificData() {
        if (!window.currentUser || !window.userDataLoaded) return;
        
        console.log('[Calls iframe] Loading user-specific data...');
        
        try {
            // Use coordinated API if available
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
                await this.parentCoordinator.loadUserSpecificData();
            } else if (window.callAPI) {
                // Fallback to existing API
                await window.callAPI.performInitialDataLoad();
            }
        } catch (error) {
            console.error('[Calls iframe] Error loading user-specific data:', error);
        }
    }
    
    // Cache user data
    cacheUserData() {
        if (!window.currentUser) return;
        
        try {
            localStorage.setItem('cachedUserData', JSON.stringify({
                user: window.currentUser,
                timestamp: Date.now(),
                source: 'calls-iframe'
            }));
            
            // Also store in global cache for consistency
            localStorage.setItem('authUser', JSON.stringify(window.currentUser));
            localStorage.setItem('currentUser', JSON.stringify(window.currentUser));
            
            console.log('[Calls iframe] User data cached successfully');
        } catch (error) {
            console.error('[Calls iframe] Error caching user data:', error);
        }
    }
    
    // Load cached user data
    loadCachedUserData() {
        try {
            // Try multiple cache locations
            const cacheKeys = ['cachedUserData', 'authUser', 'currentUser', 'userData'];
            
            for (const key of cacheKeys) {
                const cached = localStorage.getItem(key);
                if (cached) {
                    try {
                        const data = JSON.parse(cached);
                        const userData = data.user || data;
                        
                        if (userData && userData.id) {
                            console.log(`[Calls iframe] Loaded cached user data from ${key}`);
                            window.currentUser = userData;
                            window.userDataLoaded = true;
                            
                            // Update UI immediately
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
    
    // Get cached user data
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
    
    // Clear cached data
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
    
    // Show login screen
    showLoginScreen() {
        // Only show if coordinator is not handling it
        if (this.parentCoordinator && this.parentCoordinator.parentDetected) {
            return;
        }
        
        // Implement login screen or redirect
        const appContainer = document.getElementById('appContainer');
        if (appContainer) {
            // Show login overlay or message
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
            
            // Add retry button handler
            document.getElementById('retryLoginBtn')?.addEventListener('click', () => {
                location.reload();
            });
        }
    }
    
    // Get authentication token
    getAuthToken() {
        // Try coordinator first
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.token) {
            return this.parentCoordinator.sessionData.token;
        }
        
        // Try api.core.js token system
        try {
            const token = getUserToken();
            if (token && typeof token === 'string' && token.length > 10) {
                return token;
            }
        } catch (error) {
            console.log('[Calls iframe] Error getting token from api.core.js:', error);
        }
        
        // Try multiple token sources
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
                // Continue to next source
            }
        }
        
        return null;
    }
    
    // Show notification
    showNotification(message, type = 'info') {
        // Use existing notification system if available
        if (window.showNotification) {
            window.showNotification(message, type);
            return;
        }
        
        // Fallback notification
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
    
    // Notify that data was loaded
    notifyDataLoaded(source) {
        // Notify parent that we received data
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'USER_DATA_RECEIVED',
                source: 'calls-iframe',
                timestamp: Date.now(),
                dataSource: source
            }, '*');
        }
        
        // Notify other iframes
        this.broadcastToOtherIframes({
            type: 'USER_DATA_LOADED',
            source: 'calls-iframe',
            userData: window.currentUser
        });
    }
    
    // Broadcast to other iframes
    broadcastToOtherIframes(message) {
        // This would be used if there are other iframes on the page
        // For now, just log it
        console.log('[Calls iframe] Broadcast message:', message);
    }
    
    // Cleanup
    cleanup() {
        if (this.parentResponseTimeout) {
            clearTimeout(this.parentResponseTimeout);
            this.parentResponseTimeout = null;
        }
    }
}

// ==================== UPDATED TOKEN MANAGEMENT SYSTEM ====================
class TokenManager {
    constructor() {
        this.tokenReady = false;
        this.token = null;
        this.waitingCallbacks = [];
        this.apiInitialized = false;
        this.tokenCheckInterval = null;
        this.migrationDone = false;
        this.parentCoordinator = window.parentCoordinator;
        this.coordinatedToken = false;
    }
    
    // Initialize token system - non-blocking
    async initialize() {
        console.log('[Calls iframe] Initializing token manager with parent coordination...');
        
        // 1. Try to get token from parent coordinator first
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.token) {
            console.log('[Calls iframe] Got token from parent coordinator');
            this.setToken(this.parentCoordinator.sessionData.token);
            this.coordinatedToken = true;
            return;
        }
        
        // 2. Try to get token from api.core.js immediately
        this.tryGetTokenFromAPI();
        
        // 3. Load cached data immediately for instant rendering
        this.loadCachedData();
        
        // 4. Set up polling for api.core.js initialization
        this.startTokenPolling();
        
        // 5. Listen for parent messages through coordinator
        this.setupCoordinatedListener();
        
        // 6. Migrate old tokens if present
        this.migrateOldTokens();
    }
    
    // Setup coordinated listener
    setupCoordinatedListener() {
        if (!this.parentCoordinator) return;
        
        // Register for token updates from coordinator
        this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
            if (updateData.token) {
                console.log('[Calls iframe] Received token update from coordinator');
                this.setToken(updateData.token);
                this.coordinatedToken = true;
            }
        });
    }
    
    // Try to get token from api.core.js
    tryGetTokenFromAPI() {
        try {
            // Only try direct API if coordinator doesn't have token
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
    
    // Start polling for api.core.js initialization
    startTokenPolling() {
        // Clear any existing interval
        if (this.tokenCheckInterval) {
            clearInterval(this.tokenCheckInterval);
        }
        
        // Don't poll if we have coordinated token
        if (this.coordinatedToken) {
            console.log('[Calls iframe] Using coordinated token, skipping API polling');
            return;
        }
        
        // Poll for api.core.js every 500ms for 10 seconds
        let attempts = 0;
        const maxAttempts = 20; // 10 seconds at 500ms intervals
        
        this.tokenCheckInterval = setInterval(() => {
            attempts++;
            
            // Try to get token from api.core.js
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
            
            // Also check localStorage for migrated token
            const storedToken = localStorage.getItem('USER_TOKEN');
            if (storedToken && this.validateToken(storedToken) && !this.token) {
                console.log('[Calls iframe] Using stored USER_TOKEN');
                this.setToken(storedToken);
            }
        }, 500);
    }
    
    // Set token and notify waiting callbacks
    setToken(token) {
        this.token = token;
        this.tokenReady = true;
        
        // Store in localStorage for other iframes (temporary, for backward compatibility)
        try {
            localStorage.setItem('USER_TOKEN', token);
        } catch (error) {
            console.log('[Calls iframe] Error storing token:', error);
        }
        
        // Update AppState
        if (window.AppState) {
            window.AppState.isAuthenticated = true;
        }
        
        console.log('[Calls iframe] Token set successfully');
        
        // Execute any waiting callbacks
        this.executeWaitingCallbacks();
    }
    
    // Wait for token to be ready
    waitForToken() {
        return new Promise((resolve) => {
            if (this.tokenReady && this.token) {
                resolve(this.token);
            } else {
                this.waitingCallbacks.push(resolve);
            }
        });
    }
    
    // Execute all waiting callbacks
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
    
    // Validate token format
    validateToken(token) {
        if (!token || typeof token !== 'string') return false;
        if (token.length < 10) return false; // Basic validation
        if (token.trim() !== token) return false; // No whitespace
        return true;
    }
    
    // Migrate old tokens to unified USER_TOKEN
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
                    // Migrate to unified USER_TOKEN
                    localStorage.setItem('USER_TOKEN', oldToken);
                    console.log(`[Calls iframe] Migrated token from ${key} to USER_TOKEN`);
                    migrated = true;
                    
                    // Keep the old token for backward compatibility during transition
                    // It will be removed after all iframes are updated
                }
            }
            
            // Also check sessionStorage
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
    
    // Load cached data for instant rendering
    loadCachedData() {
        try {
            // Load user data from cache
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
            
            // Load other cached data
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
    
    // Setup message listener for parent communication
    setupMessageListener() {
        window.addEventListener('message', (event) => {
            // Validate origin for security
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
                // Try to get token immediately when API is ready
                setTimeout(() => this.tryGetTokenFromAPI(), 100);
            }
        });
    }
    
    // Get current token (synchronous)
    getToken() {
        // Prefer coordinated token
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.token) {
            return this.parentCoordinator.sessionData.token;
        }
        
        // Try api.core.js
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
    
    // Check if token is ready
    isTokenReady() {
        // Check coordinated token first
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.token) {
            return true;
        }
        
        // Check api.core.js
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
    
    // Clear token (logout)
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
    
    // Cleanup
    cleanup() {
        if (this.tokenCheckInterval) {
            clearInterval(this.tokenCheckInterval);
            this.tokenCheckInterval = null;
        }
    }
}

// ==================== UPDATED SECURE API CLIENT ====================
class SecureAPIClient {
    constructor(tokenManager) {
        this.tokenManager = tokenManager;
        this.requestQueue = [];
        this.processingQueue = false;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.parentCoordinator = window.parentCoordinator;
        this.useCoordinatedRouting = false;
    }
    
    // Make secure API request
    async fetch(url, options = {}) {
        // 1. Try coordinated routing through parent
        if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
            try {
                console.log('[Calls iframe] Routing API request through parent coordination:', url);
                return await this.fetchThroughCoordinator(url, options);
            } catch (error) {
                console.log('[Calls iframe] Coordinated routing failed, falling back:', error.message);
                this.useCoordinatedRouting = false;
            }
        }
        
        // 2. Use api.core.js secureFetch if available
        try {
            return await secureFetch(url, options);
        } catch (error) {
            console.log('[Calls iframe] api.core.js secureFetch failed, falling back:', error.message);
        }
        
        // 3. Fallback implementation
        return this.secureFetchFallback(url, options);
    }
    
    // Fetch through parent coordinator
    async fetchThroughCoordinator(url, options = {}) {
        if (!this.parentCoordinator || !this.parentCoordinator.sessionValidated) {
            throw new Error('Parent coordinator not available');
        }
        
        // Extract endpoint from URL
        let endpoint = url;
        if (url.startsWith('http')) {
            try {
                const urlObj = new URL(url);
                endpoint = urlObj.pathname + urlObj.search;
            } catch (error) {
                // Keep original URL
            }
        }
        
        // Route through parent coordinator
        const result = await this.parentCoordinator.routeApiCall(
            endpoint,
            options.method || 'GET',
            options.body ? JSON.parse(options.body) : null
        );
        
        // Convert to Response-like object
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
    
    // Fallback secure fetch implementation
    async secureFetchFallback(url, options = {}, retryCount = 0) {
        try {
            // Wait for token if not ready
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
            
            // Handle authentication errors
            if (response.status === 401) {
                console.log('[Calls iframe] Authentication failed (401)');
                
                // Clear token and show error
                this.tokenManager.clearToken();
                
                // Notify parent coordinator
                if (this.parentCoordinator) {
                    this.parentCoordinator.sendToParent({
                        type: 'AUTH_ERROR',
                        source: 'calls-iframe',
                        timestamp: Date.now()
                    });
                }
                
                // Show user-friendly message
                this.showNotification('Session expired. Please wait for reconnection.', 'error');
                
                throw new Error('Authentication failed');
            }
            
            if (!response.ok) {
                // Retry on server errors
                if (response.status >= 500 && retryCount < this.maxRetries) {
                    const delay = this.retryDelay * Math.pow(2, retryCount);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.secureFetchFallback(url, options, retryCount + 1);
                }
                
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            // Retry on network errors
            if (retryCount < this.maxRetries && 
                (error.message.includes('Network') || error.message.includes('Failed to fetch'))) {
                const delay = this.retryDelay * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.secureFetchFallback(url, options, retryCount + 1);
            }
            
            throw error;
        }
    }
    
    // Queue request if token is not ready
    async queueRequest(url, options) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                url,
                options,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            // Start processing queue if not already
            if (!this.processingQueue) {
                this.processQueue();
            }
            
            // Timeout after 30 seconds
            setTimeout(() => {
                const index = this.requestQueue.findIndex(req => req.url === url);
                if (index !== -1) {
                    this.requestQueue.splice(index, 1);
                    reject(new Error('Request timeout: Token not available'));
                }
            }, 30000);
        });
    }
    
    // Process queued requests
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
                    // Wait a bit and try again
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                request.reject(error);
                this.requestQueue.shift();
            }
        }
        
        this.processingQueue = false;
    }
    
    // JSON helper method
    async fetchJSON(url, options = {}) {
        const response = await this.fetch(url, options);
        return response.json();
    }
    
    // GET helper
    async get(url, options = {}) {
        return this.fetch(url, { ...options, method: 'GET' });
    }
    
    // POST helper
    async post(url, data, options = {}) {
        return this.fetch(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    // PUT helper
    async put(url, data, options = {}) {
        return this.fetch(url, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    // DELETE helper
    async delete(url, options = {}) {
        return this.fetch(url, { ...options, method: 'DELETE' });
    }
    
    // Show notification
    showNotification(message, type = 'info') {
        // Use existing notification system if available
        if (window.showNotification) {
            window.showNotification(message, type);
            return;
        }
        
        // Fallback notification
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
class CallAPIIntegration {
    constructor() {
        this.tokenManager = new TokenManager();
        this.apiClient = new SecureAPIClient(this.tokenManager);
        this.backgroundSyncInterval = null;
        this.authCheckDone = false;
        this.backgroundJobsStarted = false;
        this.initialDataLoaded = false;
        this.parentCommunication = new ParentChildCommunication();
        this.parentCoordinator = window.parentCoordinator;
        this.sessionInitialized = false;
        this.apiConfig = {};
    }
    
    // Initialize - non-blocking with parent coordination
    async initialize() {
        console.log('[Calls iframe] Initializing API integration with parent coordination...');
        
        // Prevent double initialization
        if (window.sessionInitializationLock) {
            console.log('[Calls iframe] Initialization already in progress, skipping...');
            return this;
        }
        
        window.sessionInitializationLock = true;
        
        try {
            // 1. Initialize parent coordination first
            if (!window.parentCoordinator) {
                window.parentCoordinator = new ParentCoordinator();
                this.parentCoordinator = window.parentCoordinator;
            }
            
            // 2. Initialize parent communication
            await this.parentCommunication.initialize();
            
            // 3. Initialize token manager (non-blocking)
            this.tokenManager.initialize();
            
            // 4. Set up UI immediately with cached data
            this.setupInitialUI();
            
            // 5. Start background authentication check
            this.startBackgroundAuthCheck();
            
            // 6. Set up cleanup
            window.addEventListener('beforeunload', () => this.cleanup());
            
            // 7. Register with parent coordinator
            this.registerWithCoordinator();
            
            window.sessionInitialized = true;
            console.log('[Calls iframe] API integration with parent coordination initialized');
            
            return this;
        } catch (error) {
            console.error('[Calls iframe] API integration initialization failed:', error);
            window.sessionInitializationLock = false;
            throw error;
        } finally {
            window.sessionInitializationLock = false;
        }
    }
    
    // Register with parent coordinator
    registerWithCoordinator() {
        if (!this.parentCoordinator) return;
        
        // Register session update callback
        this.parentCoordinator.registerSessionUpdateCallback((updateData) => {
            this.handleCoordinatedSessionUpdate(updateData);
        });
        
        // Register UI binding for when session is ready
        this.parentCoordinator.registerUIBinding(() => {
            if (window.currentUser && !this.authCheckDone) {
                this.onAuthenticationSuccess();
            }
        });
    }
    
    // Handle coordinated session update
    handleCoordinatedSessionUpdate(updateData) {
        console.log('[Calls iframe] Handling coordinated session update:', updateData);
        
        // Update API config if present
        if (updateData.apiConfig) {
            this.apiConfig = { ...this.apiConfig, ...updateData.apiConfig };
        }
        
        // Update authentication state
        if (updateData.authenticated !== undefined) {
            if (updateData.authenticated && updateData.user) {
                this.onAuthenticationSuccess();
            } else if (updateData.authenticated === false) {
                this.handleLogout();
            }
        }
    }
    
    // Setup initial UI with cached data
    setupInitialUI() {
        // Update status indicator
        if (elements.apiStatusIndicator) {
            elements.apiStatusIndicator.className = 'api-status-indicator connecting';
            elements.apiStatusText.textContent = 'Initializing with parent...';
            elements.apiStatusIndicator.style.display = 'block';
        }
        
        // Load cached data to UI
        this.loadCachedDataToUI();
        
        // Show UI immediately (no loading screen)
        this.showUI();
    }
    
    // Show UI immediately
    showUI() {
        // Ensure main UI is visible
        const appContainer = document.getElementById('appContainer');
        if (appContainer) {
            appContainer.style.display = 'block';
            appContainer.style.opacity = '1';
        }
        
        // Enable basic UI features that don't require authentication
        this.enableBasicUI();
    }
    
    // Enable basic UI features
    enableBasicUI() {
        // Enable settings panel
        if (elements.settingsToggle) {
            elements.settingsToggle.disabled = false;
        }
        
        // Enable call history view (cached)
        this.renderCachedCallHistory();
        
        // Show UI immediately without waiting for auth
        console.log('[Calls iframe] Basic UI enabled immediately');
    }
    
    // Start background authentication check
    async startBackgroundAuthCheck() {
        try {
            // Wait for parent coordinator session
            if (this.parentCoordinator) {
                await this.waitForCoordinatorSession();
            } else {
                // Fallback to token-based auth
                await this.waitForTokenAuth();
            }
        } catch (error) {
            console.log('[Calls iframe] Background auth check failed:', error.message);
            // Silent fail - UI already functional with cached data
        }
    }
    
    // Wait for coordinator session
    async waitForCoordinatorSession() {
        return new Promise((resolve, reject) => {
            if (this.parentCoordinator.sessionValidated && window.currentUser) {
                this.onAuthenticationSuccess();
                resolve();
                return;
            }
            
            // Wait for up to 5 seconds
            const timeout = setTimeout(() => {
                console.log('[Calls iframe] Coordinator session timeout, using cached data');
                resolve();
            }, 5000);
            
            // Check periodically
            const checkInterval = setInterval(() => {
                if (this.parentCoordinator.sessionValidated && window.currentUser) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    this.onAuthenticationSuccess();
                    resolve();
                }
                
                // Check if coordinator failed
                if (this.parentCoordinator.fallbackState === 'unavailable') {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    console.log('[Calls iframe] Coordinator unavailable, using cached data');
                    resolve();
                }
            }, 100);
        });
    }
    
    // Wait for token auth
    async waitForTokenAuth() {
        // Wait for token (non-blocking with timeout)
        const tokenPromise = this.tokenManager.waitForToken();
        const timeoutPromise = new Promise(resolve => 
            setTimeout(() => resolve(null), 5000));
        
        const token = await Promise.race([tokenPromise, timeoutPromise]);
        
        if (token) {
            console.log('[Calls iframe] Authentication confirmed via token');
            this.onAuthenticationSuccess(token);
        } else {
            console.log('[Calls iframe] Token not ready yet, continuing with cached data');
            // UI is already functional with cached data
        }
    }
    
    // Handle successful authentication
    onAuthenticationSuccess(token) {
        if (this.authCheckDone) {
            console.log('[Calls iframe] Authentication already confirmed, skipping...');
            return;
        }
        
        if (window.AppState) {
            window.AppState.isAuthenticated = true;
        }
        this.authCheckDone = true;
        
        // Update UI
        if (elements.apiStatusIndicator) {
            elements.apiStatusIndicator.className = 'api-status-indicator connected';
            
            if (window.currentUser && window.currentUser.name) {
                elements.apiStatusText.textContent = `Authenticated as ${window.currentUser.name}`;
            } else {
                elements.apiStatusText.textContent = 'Authenticated';
            }
            
            setTimeout(() => {
                if (elements.apiStatusIndicator) {
                    elements.apiStatusIndicator.style.display = 'none';
                }
            }, 2000);
        }
        
        // Start background jobs only once
        if (!this.backgroundJobsStarted) {
            this.backgroundJobsStarted = true;
            this.startBackgroundJobs();
        }
    }
    
    // Start background jobs
    startBackgroundJobs() {
        if (window.AppState && !window.AppState.isOnline) return;
        
        console.log('[Calls iframe] Starting background jobs...');
        
        // Initialize background sync
        this.initializeBackgroundSync();
        
        // Load fresh data in background
        setTimeout(() => {
            this.performInitialDataLoad();
        }, 1000);
    }
    
    // Perform initial data load (background)
    async performInitialDataLoad() {
        if ((window.AppState && !window.AppState.isAuthenticated) || (window.AppState && !window.AppState.isOnline)) return;
        
        try {
            console.log('[Calls iframe] Starting background data load...');
            
            // Update sync indicator
            if (elements.syncIndicator) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Syncing...</span>';
                elements.syncIndicator.classList.add('syncing');
            }
            
            // Load data in parallel
            await Promise.allSettled([
                this.fetchContacts(true),
                this.fetchCallHistory(true),
                this.fetchUserData(),
                this.fetchSettings(),
                this.checkPremiumStatus()
            ]);
            
            console.log('[Calls iframe] Background data loading complete');
            this.initialDataLoaded = true;
            
            // Update sync indicator
            if (elements.syncIndicator) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                elements.syncIndicator.classList.remove('syncing');
            }
            
            // Notify parent of successful sync
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
            
            // Update sync indicator
            if (elements.syncIndicator) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Sync failed</span>';
                elements.syncIndicator.classList.remove('syncing');
            }
        }
    }
    
    // Initialize background sync
    initializeBackgroundSync() {
        // Clear any existing interval
        if (this.backgroundSyncInterval) {
            clearInterval(this.backgroundSyncInterval);
        }
        
        // Only start if authenticated and online
        if (window.AppState && window.AppState.isAuthenticated && window.AppState.isOnline) {
            console.log('[Calls iframe] Starting background sync');
            
            this.backgroundSyncInterval = setInterval(() => {
                this.performBackgroundSync();
            }, 30000); // Sync every 30 seconds
            
            // Listen for visibility changes
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && window.AppState && window.AppState.isOnline && window.AppState.isAuthenticated) {
                    this.performBackgroundSync();
                }
            });
        }
    }
    
    // Perform background sync
    async performBackgroundSync() {
        if (!window.AppState || !window.AppState.isOnline || !window.AppState.isAuthenticated || window.AppState.isInCall) return;
        
        try {
            await Promise.allSettled([
                this.fetchContacts(true),
                this.fetchCallHistory(true),
                this.checkPremiumStatus()
            ]);
            
            if (elements.syncIndicator) {
                elements.syncIndicator.innerHTML = '<i class="fas fa-sync"></i><span>Synced</span>';
                elements.syncIndicator.classList.remove('syncing');
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
    
    // Fetch user data using secure API client
    async fetchUserData() {
        try {
            // Use coordinated routing if available
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
                const userData = await this.parentCoordinator.routeApiCall('/api/user/me', 'GET');
                if (userData) {
                    this.updateUserState(userData);
                    return userData;
                }
            }
            
            // Fallback to direct API using api.core.js
            const userData = await getCurrentUser();
            
            if (userData) {
                this.updateUserState(userData);
                return userData;
            }
        } catch (error) {
            console.log('[Calls iframe] Failed to fetch user data:', error.message);
            
            // Use cached data if available
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
    
    // Get API base URL
    getApiBaseUrl() {
        // Try coordinator first
        if (this.parentCoordinator && this.parentCoordinator.sessionData?.apiConfig?.baseUrl) {
            return this.parentCoordinator.sessionData.apiConfig.baseUrl;
        }
        
        // Try api.core.js
        try {
            const baseUrl = getApiBaseUrl();
            if (baseUrl) {
                return baseUrl;
            }
        } catch (error) {
            console.log('[Calls iframe] Error getting API base URL from api.core.js:', error);
        }
        
        // Default
        return '/api';
    }
    
    // Update user state
    updateUserState(userData) {
        if (!userData) return;
        
        if (window.AppState) {
            window.AppState.user = userData;
            window.AppState.currentUser = userData;
        }
        
        // Cache user data
        try {
            localStorage.setItem('authUser', JSON.stringify(userData));
            localStorage.setItem('currentUser', JSON.stringify(userData));
        } catch (error) {
            console.log('[Calls iframe] Error caching user data:', error);
        }
    }
    
    // Fetch contacts using secure API client
    async fetchContacts(forceRefresh = false) {
        try {
            // Check cache first
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
            
            // Only fetch if authenticated
            if (!window.AppState || !window.AppState.isAuthenticated) {
                console.log('[Calls iframe] Not authenticated, skipping contacts fetch');
                return window.AppState ? window.AppState.contacts : [];
            }
            
            // Use coordinated routing if available
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
            
            // Fallback to direct API
            const apiBase = this.getApiBaseUrl();
            const contacts = await this.apiClient.fetchJSON(`${apiBase}/contacts`);
            
            // Update state
            if (window.AppState) {
                window.AppState.contacts = contacts;
            }
            
            // Cache results
            this.cacheContacts(contacts);
            
            // Render if needed
            if (elements.newCallModal && elements.newCallModal.classList.contains('active')) {
                this.renderContacts(contacts);
            }
            
            return contacts;
        } catch (error) {
            console.log('[Calls iframe] Failed to fetch contacts:', error.message);
            
            // Use cached data if available
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
    
    // Cache contacts
    cacheContacts(contacts) {
        try {
            localStorage.setItem('cachedContacts', JSON.stringify(contacts));
            localStorage.setItem('cachedContactsTimestamp', Date.now().toString());
        } catch (error) {
            console.log('[Calls iframe] Failed to cache contacts:', error);
        }
    }
    
    // Fetch call history using secure API client
    async fetchCallHistory(forceRefresh = false) {
        try {
            // Check cache first
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
            
            // Only fetch if authenticated
            if (!window.AppState || !window.AppState.isAuthenticated) {
                console.log('[Calls iframe] Not authenticated, skipping call history fetch');
                return window.AppState ? window.AppState.callHistory : [];
            }
            
            // Use coordinated routing if available
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
            
            // Fallback to direct API
            const apiBase = this.getApiBaseUrl();
            const history = await this.apiClient.fetchJSON(`${apiBase}/calls/history`);
            
            // Update state
            if (window.AppState) {
                window.AppState.callHistory = history;
            }
            
            // Cache results
            this.cacheCallHistory(history);
            
            // Render
            renderCallHistory();
            
            return history;
        } catch (error) {
            console.log('[Calls iframe] Failed to fetch call history:', error.message);
            
            // Use cached data if available
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
    
    // Cache call history
    cacheCallHistory(history) {
        try {
            localStorage.setItem('cachedCallHistory', JSON.stringify(history));
            localStorage.setItem('cachedCallHistoryTimestamp', Date.now().toString());
        } catch (error) {
            console.log('[Calls iframe] Failed to cache call history:', error);
        }
    }
    
    // Render cached call history
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
    
    // Fetch settings using secure API client
    async fetchSettings() {
        try {
            // Try to get from parent first
            if (window.parent && window.parent.AppState && window.parent.AppState.settings) {
                if (window.AppState) {
                    window.AppState.settings = { ...window.AppState.settings, ...window.parent.AppState.settings };
                }
                applySettingsToUI();
                return window.AppState ? window.AppState.settings : {};
            }
            
            // Only fetch if authenticated
            if (!window.AppState || !window.AppState.isAuthenticated) {
                console.log('[Calls iframe] Not authenticated, using cached settings');
                return window.AppState ? window.AppState.settings : {};
            }
            
            // Use coordinated routing if available
            if (this.parentCoordinator && this.parentCoordinator.sessionValidated) {
                const settings = await this.parentCoordinator.routeApiCall('/api/user/settings', 'GET');
                if (settings && window.AppState) {
                    window.AppState.settings = { ...window.AppState.settings, ...settings };
                    applySettingsToUI();
                    saveSettings();
                }
                return window.AppState ? window.AppState.settings : {};
            }
            
            // Fallback to direct API
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
            
            // Use cached settings
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
    
    // Check premium status using secure API client
    async checkPremiumStatus() {
        try {
            // Try to get from parent first
            if (window.parent && window.parent.AppState) {
                if (window.AppState) {
                    window.AppState.isPremium = window.parent.AppState.isPremium || false;
                    window.AppState.trialDaysLeft = window.parent.AppState.trialDaysLeft || 30;
                }
                updatePremiumUI();
                return window.AppState ? window.AppState.isPremium : false;
            }
            
            // Only fetch if authenticated
            if (!window.AppState || !window.AppState.isAuthenticated) {
                console.log('[Calls iframe] Not authenticated, using cached premium status');
                updatePremiumUI();
                return window.AppState ? window.AppState.isPremium : false;
            }
            
            // Use coordinated routing if available
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
            
            // Fallback to direct API
            const apiBase = this.getApiBaseUrl();
            const premiumData = await this.apiClient.fetchJSON(`${apiBase}/user/premium`);
            
            if (window.AppState) {
                window.AppState.isPremium = premiumData.isPremium || false;
                window.AppState.trialDaysLeft = premiumData.trialDaysLeft || 30;
                window.AppState.premiumFeatures = premiumData.features || window.AppState.premiumFeatures;
                
                // Cache premium status
                this.cachePremiumStatus(premiumData);
                
                updatePremiumUI();
            }
            return window.AppState ? window.AppState.isPremium : false;
        } catch (error) {
            console.log('[Calls iframe] Failed to check premium status:', error.message);
            
            // Use cached premium status
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
    
    // Cache premium status
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
    
    // Load cached data to UI
    loadCachedDataToUI() {
        console.log('[Calls iframe] Loading cached data to UI...');
        
        // Load settings
        loadSettings();
        
        // Load contacts
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
        
        // Load call history
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
        
        // Load premium status
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
    
    // Handle logout
    handleLogout() {
        console.log('[Calls iframe] Logout handled by API integration');
        
        // Clear authentication state
        this.authCheckDone = false;
        this.backgroundJobsStarted = false;
        this.initialDataLoaded = false;
        
        // Stop background sync
        if (this.backgroundSyncInterval) {
            clearInterval(this.backgroundSyncInterval);
            this.backgroundSyncInterval = null;
        }
        
        // Clear token
        this.tokenManager.clearToken();
    }
    
    // Render contacts
    renderContacts(contacts) {
        if (!contacts || contacts.length === 0) {
            if (elements.contactsList) {
                elements.contactsList.innerHTML = '<div class="offline-state"><i class="fas fa-users-slash"></i><p>No contacts available</p></div>';
            }
            return;
        }
        
        if (!elements.contactsList) return;
        
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
        
        elements.contactsList.innerHTML = html;
        if (elements.contactsLoading) {
            elements.contactsLoading.style.display = 'none';
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
    
    // Render group contacts
    renderGroupContacts(contacts) {
        if (!elements.groupContactsList) return;
        
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
        
        elements.groupContactsList.innerHTML = html;
        
        document.querySelectorAll('.group-contact').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const item = this.closest('.contact-item');
                item.classList.toggle('selected', this.checked);
                
                updateGroupCallButton();
            });
        });
    }
    
    // Clean up resources
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
const AppState = {
    // Authentication state
    isAuthenticated: false,
    authChecked: false,
    user: null,
    
    // API state
    apiReady: false,
    apiCheckInterval: null,
    
    // User state
    currentUser: null,
    userPermissions: {},
    callPermissions: {},
    
    // Call state
    isInCall: false,
    currentCall: null,
    activeCallId: null,
    callType: null,
    callParticipants: [],
    callStartTime: null,
    callDurationInterval: null,
    
    // Media state
    localStream: null,
    remoteStreams: new Map(),
    screenStream: null,
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    isSpeakerOn: true,
    
    // PeerJS state
    peer: null,
    connections: new Map(),
    
    // UI state
    currentMood: 'neutral',
    currentIntention: 'quick',
    currentFocusMode: false,
    currentPanel: 'participants',
    currentCategory: 'all',
    
    // Data state
    contacts: [],
    callHistory: [],
    cachedData: {
        contacts: [],
        calls: [],
        notes: {},
        relationshipData: {}
    },
    
    // Settings state
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
    
    // Offline state
    isOnline: navigator.onLine,
    syncPending: false,
    
    // Premium state
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
    
    // Chat state
    chatMessages: [],
    unreadChatCount: 0,
    
    // Poll state
    activePoll: null,
    userVotes: {},
    
    // Relationship data
    relationshipInsights: {}
};

// DOM Elements
const elements = {};

// ==================== UPDATED BOOTSTRAP & INITIALIZATION ====================
async function bootstrapIframe() {
    console.log('[Calls iframe] Bootstrapping with enhanced parent coordination...');
    
    // Ensure singleton initialization
    if (window.sessionInitialized) {
        console.log('[Calls iframe] Already initialized, skipping bootstrap');
        return;
    }
    
    // Cache DOM elements first
    cacheElements();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize offline detection
    initializeOfflineDetection();
    
    // Initialize UI state immediately
    initializeUI();
    
    // Show UI immediately without waiting for auth
    showUI();
    
    // Initialize API integration with parent coordination (non-blocking background)
    window.callAPI = new CallAPIIntegration();
    
    // Start initialization in background
    setTimeout(() => {
        window.callAPI.initialize().then(() => {
            console.log('[Calls iframe] API integration with parent coordination initialized in background');
        }).catch(error => {
            console.error('[Calls iframe] API integration failed:', error);
            // UI is already functional with cached data
        });
    }, 100);
    
    // Enable UI immediately with cached data
    enableUI();
    
    // Check URL parameters for call links
    checkUrlParameters();
    
    // Set up cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.callAPI) {
            window.callAPI.cleanup();
        }
    });
    
    console.log('[Calls iframe] Bootstrap complete - UI ready with enhanced parent coordination');
}

// Show UI immediately
function showUI() {
    // Ensure main container is visible
    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
        appContainer.style.visibility = 'visible';
        appContainer.style.opacity = '1';
    }
    
    // Hide any loading indicators
    const loadingIndicators = document.querySelectorAll('.loading-indicator, .initializing-overlay');
    loadingIndicators.forEach(indicator => {
        indicator.style.display = 'none';
    });
    
    console.log('[Calls iframe] UI displayed immediately');
}

function cacheElements() {
    // Three dots menu elements
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
    
    // Offline elements
    elements.offlineBanner = document.getElementById('offlineBanner');
    elements.apiStatusIndicator = document.getElementById('apiStatusIndicator');
    elements.apiStatusText = document.getElementById('apiStatusText');
    
    // Modal elements
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
    
    // New call modal tabs
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
    
    // Payment elements
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
    
    // Mood and intention elements
    elements.moodSelectionModal = document.getElementById('moodSelectionModal');
    elements.cancelMoodBtn = document.getElementById('cancelMoodBtn');
    elements.setMoodBtn = document.getElementById('setMoodBtn');
    
    elements.intentionSelectionModal = document.getElementById('intentionSelectionModal');
    elements.cancelIntentionBtn = document.getElementById('cancelIntentionBtn');
    elements.setIntentionBtn = document.getElementById('setIntentionBtn');
    
    // Notes and summary elements
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
    
    // Sidebar elements
    elements.appContainer = document.getElementById('appContainer');
    elements.sidebar = document.getElementById('sidebar');
    elements.quickVoiceBtn = document.getElementById('quickVoiceBtn');
    elements.quickVideoBtn = document.getElementById('quickVideoBtn');
    elements.quickGroupBtn = document.getElementById('quickGroupBtn');
    
    // Settings elements
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
    
    // Call history elements
    elements.syncIndicator = document.getElementById('syncIndicator');
    elements.allCallsSection = document.getElementById('allCallsSection');
    elements.missedCallsSection = document.getElementById('missedCallsSection');
    elements.groupCallsSection = document.getElementById('groupCallsSection');
    elements.allCallsList = document.getElementById('allCallsList');
    elements.missedCallsList = document.getElementById('missedCallsList');
    elements.groupCallsList = document.getElementById('groupCallsList');
    elements.offlineCallsState = document.getElementById('offlineCallsState');
    elements.callsLoading = document.getElementById('callsLoading');
    
    // Call container elements
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
    
    // Notification elements
    elements.notificationArea = document.getElementById('notificationArea');
    elements.notificationToast = document.getElementById('notificationToast');
    elements.notificationMessage = document.getElementById('notificationMessage');
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Three dots menu events
    if (elements.menuDotsBtn) {
        elements.menuDotsBtn.addEventListener('click', toggleMenuDots);
    }
    
    // Menu item events
    if (elements.menuParticipants) {
        elements.menuParticipants.addEventListener('click', () => {
            closeMenuDots();
            openParticipantsPanel();
        });
    }
    
    if (elements.menuChat) {
        elements.menuChat.addEventListener('click', () => {
            closeMenuDots();
            openChatPanel();
        });
    }
    
    if (elements.menuWhiteboard) {
        elements.menuWhiteboard.addEventListener('click', () => {
            closeMenuDots();
            openWhiteboardPanel();
        });
    }
    
    if (elements.menuNotes) {
        elements.menuNotes.addEventListener('click', () => {
            closeMenuDots();
            openNotesPanel();
        });
    }
    
    if (elements.menuPolls) {
        elements.menuPolls.addEventListener('click', () => {
            closeMenuDots();
            openPollsPanel();
        });
    }
    
    if (elements.menuRelationship) {
        elements.menuRelationship.addEventListener('click', () => {
            closeMenuDots();
            openRelationshipPanel();
        });
    }
    
    // Close menu when clicking outside
    if (elements.menuDotsBtn && elements.menuDotsDropdown) {
        document.addEventListener('click', (e) => {
            if (!elements.menuDotsBtn.contains(e.target) && !elements.menuDotsDropdown.contains(e.target)) {
                closeMenuDots();
            }
        });
    }
    
    // Window events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorageEvent);
    
    // Message event for parent communication
    window.addEventListener('message', handleParentMessage);
    
    // Incoming call events
    if (elements.declineCallBtn) {
        elements.declineCallBtn.addEventListener('click', declineIncomingCall);
    }
    if (elements.acceptCallBtn) {
        elements.acceptCallBtn.addEventListener('click', acceptIncomingCall);
    }
    if (elements.acceptVideoCallBtn) {
        elements.acceptVideoCallBtn.addEventListener('click', acceptIncomingCallAsVideo);
    }
    
    // New call modal events
    if (elements.newCallBtn) {
        elements.newCallBtn.addEventListener('click', openNewCallModal);
    }
    if (elements.closeNewCallModal) {
        elements.closeNewCallModal.addEventListener('click', closeNewCallModal);
    }
    
    // Contact search events
    if (elements.contactSearch) {
        elements.contactSearch.addEventListener('input', debounce(searchContacts, 300));
    }
    if (elements.groupContactSearch) {
        elements.groupContactSearch.addEventListener('input', debounce(searchGroupContacts, 300));
    }
    
    // Call type buttons
    if (elements.startVoiceCallBtn) {
        elements.startVoiceCallBtn.addEventListener('click', startVoiceCall);
    }
    if (elements.startVideoCallBtn) {
        elements.startVideoCallBtn.addEventListener('click', startVideoCall);
    }
    if (elements.startGroupCallBtn) {
        elements.startGroupCallBtn.addEventListener('click', startGroupCall);
    }
    
    // Group call options
    if (elements.instantGroupOption) {
        elements.instantGroupOption.addEventListener('click', selectGroupOption);
    }
    if (elements.scheduledGroupOption) {
        elements.scheduledGroupOption.addEventListener('click', selectGroupOption);
    }
    
    // Call link events
    if (elements.copyLinkBtn) {
        elements.copyLinkBtn.addEventListener('click', copyCallLink);
    }
    if (elements.shareLinkBtn) {
        elements.shareLinkBtn.addEventListener('click', shareCallLink);
    }
    if (elements.generateVoiceLinkBtn) {
        elements.generateVoiceLinkBtn.addEventListener('click', generateVoiceCallLink);
    }
    if (elements.generateVideoLinkBtn) {
        elements.generateVideoLinkBtn.addEventListener('click', generateVideoCallLink);
    }
    
    // Payment events
    if (elements.mpesaOption) {
        elements.mpesaOption.addEventListener('click', selectPaymentOption);
    }
    if (elements.cancelPaymentBtn) {
        elements.cancelPaymentBtn.addEventListener('click', closePaymentModal);
    }
    if (elements.processPaymentBtn) {
        elements.processPaymentBtn.addEventListener('click', processPayment);
    }
    if (elements.cancelUpgradeBtn) {
        elements.cancelUpgradeBtn.addEventListener('click', closePremiumLimitModal);
    }
    if (elements.upgradeNowBtn) {
        elements.upgradeNowBtn.addEventListener('click', openPaymentModal);
    }
    
    // Mood and intention events
    if (elements.cancelMoodBtn) {
        elements.cancelMoodBtn.addEventListener('click', closeMoodSelectionModal);
    }
    if (elements.setMoodBtn) {
        elements.setMoodBtn.addEventListener('click', setMood);
    }
    if (elements.cancelIntentionBtn) {
        elements.cancelIntentionBtn.addEventListener('click', closeIntentionSelectionModal);
    }
    if (elements.setIntentionBtn) {
        elements.setIntentionBtn.addEventListener('click', setIntention);
    }
    
    // Mood option click events
    document.querySelectorAll('.mood-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.mood-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
    
    // Intention option click events
    document.querySelectorAll('.intention-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.intention-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
        });
    });
    
    // Notes and summary events
    if (elements.skipNotesBtn) {
        elements.skipNotesBtn.addEventListener('click', skipPrivateNotes);
    }
    if (elements.saveNotesBtn) {
        elements.saveNotesBtn.addEventListener('click', savePrivateNotes);
    }
    if (elements.summaryDoneBtn) {
        elements.summaryDoneBtn.addEventListener('click', closeCallSummary);
    }
    
    // URL parameter events
    if (elements.urlParamCancelBtn) {
        elements.urlParamCancelBtn.addEventListener('click', closeUrlParamOverlay);
    }
    if (elements.urlParamJoinBtn) {
        elements.urlParamJoinBtn.addEventListener('click', joinUrlParamCall);
    }
    
    // Quick action buttons
    if (elements.quickVoiceBtn) {
        elements.quickVoiceBtn.addEventListener('click', openNewCallModal);
    }
    if (elements.quickVideoBtn) {
        elements.quickVideoBtn.addEventListener('click', openNewCallModal);
    }
    if (elements.quickGroupBtn) {
        elements.quickGroupBtn.addEventListener('click', openNewCallModal);
    }
    
    // Settings events
    if (elements.settingsToggle) {
        elements.settingsToggle.addEventListener('click', toggleSettingsPanel);
    }
    if (elements.resetSettingsBtn) {
        elements.resetSettingsBtn.addEventListener('click', resetSettings);
    }
    
    // Settings toggles
    if (elements.emotionalContextToggle) {
        elements.emotionalContextToggle.addEventListener('change', updateSetting);
    }
    if (elements.callIntentionToggle) {
        elements.callIntentionToggle.addEventListener('change', updateSetting);
    }
    if (elements.inCallChatToggle) {
        elements.inCallChatToggle.addEventListener('change', updateSetting);
    }
    if (elements.whiteboardToggle) {
        elements.whiteboardToggle.addEventListener('change', updateSetting);
    }
    if (elements.pollsToggle) {
        elements.pollsToggle.addEventListener('change', updateSetting);
    }
    if (elements.notesToggle) {
        elements.notesToggle.addEventListener('change', updateSetting);
    }
    if (elements.focusModeToggle) {
        elements.focusModeToggle.addEventListener('change', updateSetting);
    }
    if (elements.liveReactionsToggle) {
        elements.liveReactionsToggle.addEventListener('change', updateSetting);
    }
    
    // Call category tabs
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const category = this.dataset.category;
            switchCallCategory(category);
        });
    });
    
    // New call modal tabs
    document.querySelectorAll('.new-call-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            switchNewCallTab(tabId);
        });
    });
    
    // Call control events
    if (elements.muteBtn) {
        elements.muteBtn.addEventListener('click', toggleMute);
    }
    if (elements.videoBtn) {
        elements.videoBtn.addEventListener('click', toggleVideo);
    }
    if (elements.screenShareBtn) {
        elements.screenShareBtn.addEventListener('click', toggleScreenShare);
    }
    if (elements.speakerBtn) {
        elements.speakerBtn.addEventListener('click', toggleSpeaker);
    }
    if (elements.moodBtn) {
        elements.moodBtn.addEventListener('click', openMoodSelectionModal);
    }
    if (elements.intentionBtn) {
        elements.intentionBtn.addEventListener('click', openIntentionSelectionModal);
    }
    if (elements.endCallBtn) {
        elements.endCallBtn.addEventListener('click', endCall);
    }
    
    // Focus mode
    if (elements.focusModeBtn) {
        elements.focusModeBtn.addEventListener('click', toggleFocusMode);
    }
    
    // Reactions
    document.querySelectorAll('.reaction-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const reaction = this.dataset.reaction;
            sendReaction(reaction);
        });
    });
    
    // PIP events
    if (elements.pipCloseBtn) {
        elements.pipCloseBtn.addEventListener('click', closePip);
    }
    
    // Make PIP draggable
    if (elements.pipContainer) {
        makeDraggable(elements.pipContainer);
    }
}

// ==================== PANEL FUNCTIONS ====================
function openParticipantsPanel() {
    if (AppState.isInCall) {
        createParticipantsPanel();
        showNotification('Participants panel opened', 'info');
    } else {
        showNotification('Join a call to see participants', 'info');
    }
}

function openChatPanel() {
    if (AppState.isInCall && AppState.settings.inCallChat) {
        createChatPanel();
        showNotification('Chat panel opened', 'info');
    } else if (!AppState.isInCall) {
        showNotification('Join a call to use chat', 'info');
    } else {
        showNotification('Enable in-call chat in settings', 'info');
    }
}

function openWhiteboardPanel() {
    if (checkPremiumFeature('whiteboard')) {
        if (AppState.isInCall) {
            createWhiteboardPanel();
            showNotification('Whiteboard opened', 'info');
        } else {
            showNotification('Join a call to use whiteboard', 'info');
        }
    }
}

function openNotesPanel() {
    if (AppState.isInCall && AppState.settings.notes) {
        createNotesPanel();
        showNotification('Notes panel opened', 'info');
    } else if (!AppState.isInCall) {
        showNotification('Join a call to use notes', 'info');
    } else {
        showNotification('Enable notes in settings', 'info');
    }
}

function openPollsPanel() {
    if (checkPremiumFeature('polls')) {
        if (AppState.isInCall && AppState.settings.polls) {
            createPollsPanel();
            showNotification('Polls panel opened', 'info');
        } else if (!AppState.isInCall) {
            showNotification('Join a call to create polls', 'info');
        } else {
            showNotification('Enable polls in settings', 'info');
        }
    }
}

function openRelationshipPanel() {
    if (checkPremiumFeature('relationshipInsights')) {
        createRelationshipPanel();
        showNotification('Relationship insights opened', 'info');
    }
}

function createParticipantsPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel participants-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Participants (${AppState.callParticipants.length + 1})</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="participant-item">
                <div class="participant-avatar" style="background-color: ${stringToColor('You')}">Y</div>
                <div class="participant-info">
                    <div class="participant-name">You (Host)</div>
                    <div class="participant-status online">Online</div>
                </div>
            </div>
            ${AppState.callParticipants.map(participant => `
                <div class="participant-item">
                    <div class="participant-avatar" style="background-color: ${stringToColor(participant.name)}">
                        ${participant.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div class="participant-info">
                        <div class="participant-name">${participant.name}</div>
                        <div class="participant-status online">Online</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
}

function createChatPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel chat-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>In-Call Chat</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="chat-messages" id="chatMessagesPanel">
                <div class="chat-message system">
                    <div class="message-content">Chat started. Messages are end-to-end encrypted.</div>
                </div>
            </div>
            <div class="chat-input-container">
                <input type="text" class="chat-input" id="chatInputPanel" placeholder="Type a message...">
                <button class="chat-send-btn" id="chatSendPanel">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
    
    const chatInput = panel.querySelector('#chatInputPanel');
    const chatSend = panel.querySelector('#chatSendPanel');
    
    chatSend.addEventListener('click', () => {
        const message = chatInput.value.trim();
        if (message) {
            sendChatMessage(message);
            chatInput.value = '';
        }
    });
    
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const message = chatInput.value.trim();
            if (message) {
                sendChatMessage(message);
                chatInput.value = '';
            }
        }
    });
}

function createWhiteboardPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel whiteboard-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Shared Whiteboard</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="whiteboard-toolbar">
                <div class="tool-btn active" data-tool="pen">
                    <i class="fas fa-pen"></i>
                </div>
                <div class="tool-btn" data-tool="eraser">
                    <i class="fas fa-eraser"></i>
                </div>
                <div class="tool-btn" data-tool="text">
                    <i class="fas fa-font"></i>
                </div>
                <div class="tool-btn" data-tool="line">
                    <i class="fas fa-slash"></i>
                </div>
                <div class="tool-btn" data-tool="rectangle">
                    <i class="fas fa-square"></i>
                </div>
                <div class="tool-btn" data-tool="circle">
                    <i class="fas fa-circle"></i>
                </div>
                <div class="tool-color" style="background-color: #000000;" data-color="#000000"></div>
                <div class="tool-color selected" style="background-color: #ff3b30;" data-color="#ff3b30"></div>
                <div class="tool-color" style="background-color: #007aff;" data-color="#007aff"></div>
                <div class="tool-color" style="background-color: #34c759;" data-color="#34c759"></div>
                <div class="tool-color" style="background-color: #ff9500;" data-color="#ff9500"></div>
                <input type="range" class="tool-size-slider" min="1" max="20" value="3">
                <button class="tool-btn" id="clearWhiteboard">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <canvas class="whiteboard-canvas" width="800" height="500"></canvas>
            <div class="whiteboard-status">
                <span>Whiteboard ready. Draw something!</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    initializeWhiteboard(panel.querySelector('.whiteboard-canvas'));
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
    
    panel.querySelector('#clearWhiteboard').addEventListener('click', () => {
        if (confirm('Clear the entire whiteboard?')) {
            const canvas = panel.querySelector('.whiteboard-canvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });
}

function createNotesPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel notes-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Shared Notes</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="notes-editor-container">
                <textarea class="notes-editor" id="sharedNotesEditor" placeholder="Start taking notes...">Meeting Notes:
- 
- 
-</textarea>
                <div class="notes-toolbar">
                    <button class="notes-btn" data-action="bold">
                        <i class="fas fa-bold"></i>
                    </button>
                    <button class="notes-btn" data-action="italic">
                        <i class="fas fa-italic"></i>
                    </button>
                    <button class="notes-btn" data-action="list">
                        <i class="fas fa-list-ul"></i>
                    </button>
                    <button class="notes-btn" data-action="save">
                        <i class="fas fa-save"></i> Save
                    </button>
                </div>
            </div>
            <div class="notes-history">
                <h5>Previous Notes</h5>
                <div class="notes-history-list">
                    <div class="notes-history-item">
                        <div class="notes-history-date">Today, 10:30 AM</div>
                        <div class="notes-history-preview">Project discussion notes...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
    
    panel.querySelector('[data-action="save"]').addEventListener('click', () => {
        const notes = panel.querySelector('#sharedNotesEditor').value;
        if (notes.trim()) {
            saveSharedNotes(notes);
            showNotification('Notes saved', 'success');
        }
    });
}

function createPollsPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel polls-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Polls</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="polls-tabs">
                <button class="polls-tab active" data-tab="create">Create Poll</button>
                <button class="polls-tab" data-tab="active">Active Polls</button>
                <button class="polls-tab" data-tab="results">Results</button>
            </div>
            
            <div class="polls-tab-content active" data-tab="create">
                <div class="poll-form">
                    <input type="text" class="poll-question-input" placeholder="Enter your poll question...">
                    <div class="poll-options">
                        <input type="text" class="poll-option-input" placeholder="Option 1">
                        <input type="text" class="poll-option-input" placeholder="Option 2">
                        <button class="add-option-btn">Add Option</button>
                    </div>
                    <div class="poll-settings">
                        <label>
                            <input type="checkbox" checked> Multiple choices allowed
                        </label>
                        <label>
                            <input type="checkbox"> Anonymous voting
                        </label>
                    </div>
                    <button class="create-poll-btn">Create Poll</button>
                </div>
            </div>
            
            <div class="polls-tab-content" data-tab="active">
                <div class="active-polls-list">
                    <div class="poll-item">
                        <div class="poll-question">What time works best for our next meeting?</div>
                        <div class="poll-options">
                            <div class="poll-option">
                                <input type="radio" name="poll1" id="poll1-1">
                                <label for="poll1-1">Monday 10 AM</label>
                            </div>
                            <div class="poll-option">
                                <input type="radio" name="poll1" id="poll1-2">
                                <label for="poll1-2">Tuesday 2 PM</label>
                            </div>
                            <div class="poll-option">
                                <input type="radio" name="poll1" id="poll1-3">
                                <label for="poll1-3">Wednesday 11 AM</label>
                            </div>
                        </div>
                        <button class="vote-btn">Vote</button>
                    </div>
                </div>
            </div>
            
            <div class="polls-tab-content" data-tab="results">
                <div class="poll-results">
                    <div class="poll-result-item">
                        <div class="poll-question">Favorite meeting platform?</div>
                        <div class="result-bar">
                            <div class="result-fill" style="width: 60%">Zoom (60%)</div>
                        </div>
                        <div class="result-bar">
                            <div class="result-fill" style="width: 30%">Google Meet (30%)</div>
                        </div>
                        <div class="result-bar">
                            <div class="result-fill" style="width: 10%">Teams (10%)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
    
    panel.querySelectorAll('.polls-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            panel.querySelectorAll('.polls-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            panel.querySelectorAll('.polls-tab-content').forEach(content => {
                content.classList.remove('active');
                if (content.dataset.tab === tabName) {
                    content.classList.add('active');
                }
            });
        });
    });
    
    panel.querySelector('.create-poll-btn').addEventListener('click', () => {
        const question = panel.querySelector('.poll-question-input').value;
        if (question.trim()) {
            showNotification('Poll created successfully!', 'success');
        }
    });
}

function createRelationshipPanel() {
    const existingPanel = document.querySelector('.feature-panel');
    if (existingPanel) {
        existingPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'feature-panel relationship-panel';
    panel.innerHTML = `
        <div class="panel-header">
            <h4>Relationship Insights</h4>
            <button class="panel-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="panel-content">
            <div class="insight-cards">
                <div class="insight-card">
                    <div class="insight-title">Total Calls</div>
                    <div class="insight-value">47</div>
                    <div class="insight-description">With all contacts</div>
                    <span class="insight-trend trend-up">+12%</span>
                </div>
                <div class="insight-card">
                    <div class="insight-title">Average Duration</div>
                    <div class="insight-value">24m</div>
                    <div class="insight-description">Per call</div>
                    <span class="insight-trend trend-neutral">0%</span>
                </div>
                <div class="insight-card">
                    <div class="insight-title">Busiest Day</div>
                    <div class="insight-value">Wednesday</div>
                    <div class="insight-description">Most calls scheduled</div>
                </div>
                <div class="insight-card">
                    <div class="insight-title">Favorite Contact</div>
                    <div class="insight-value">Sarah</div>
                    <div class="insight-description">15 calls this month</div>
                    <span class="insight-trend trend-up">+3</span>
                </div>
            </div>
            <div class="relationship-chart">
                <h5>Call Frequency (Last 30 days)</h5>
                <div class="chart-container">
                    <div class="chart-bar" style="height: 80%">Mon</div>
                    <div class="chart-bar" style="height: 60%">Tue</div>
                    <div class="chart-bar" style="height: 90%">Wed</div>
                    <div class="chart-bar" style="height: 70%">Thu</div>
                    <div class="chart-bar" style="height: 50%">Fri</div>
                    <div class="chart-bar" style="height: 40%">Sat</div>
                    <div class="chart-bar" style="height: 30%">Sun</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    panel.querySelector('.panel-close-btn').addEventListener('click', () => {
        panel.remove();
    });
}

function initializeWhiteboard(canvas) {
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

function sendChatMessage(message) {
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

function saveSharedNotes(notes) {
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

// ==================== PARENT MESSAGE HANDLING ====================
function handleParentMessage(event) {
    // First let parent coordinator handle it
    if (window.parentCoordinator && window.parentCoordinator.secureChannelEstablished) {
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
            // Handled by TokenManager
            break;
    }
}

function handleParentUserData(payload) {
    if (window.callAPI && window.callAPI.parentCommunication) {
        window.callAPI.parentCommunication.handleParentUserData(payload);
    }
}

function handleAuthUpdate(payload) {
    if (window.callAPI && window.callAPI.parentCommunication) {
        window.callAPI.parentCommunication.handleAuthUpdate(payload);
    }
}

function handleApiReady() {
    console.log('[Calls iframe] Parent API ready signal received');
    AppState.apiReady = true;
    
    if (window.callAPI && window.callAPI.tokenManager) {
        setTimeout(() => window.callAPI.tokenManager.tryGetTokenFromAPI(), 100);
    }
}

function handleDataRefresh(payload) {
    if (window.callAPI && AppState.isAuthenticated) {
        window.callAPI.performBackgroundSync();
        showNotification('Refreshing data...', 'info');
    }
}

function handleStartCallRequest(payload) {
    if (payload.contactId && AppState.contacts.length > 0) {
        const contact = AppState.contacts.find(c => c.id === payload.contactId);
        if (contact) {
            const callType = payload.callType || 'voice';
            startCall(callType, [contact]);
        }
    }
}

function handleSyncRequest() {
    if (window.callAPI && AppState.isAuthenticated) {
        window.callAPI.performBackgroundSync();
    }
}

// ==================== SETTINGS MANAGEMENT ====================
function loadSettings() {
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

function saveSettings() {
    try {
        localStorage.setItem('callSettings', JSON.stringify(AppState.settings));
    } catch (error) {
        console.log('[Calls iframe] Error saving settings:', error);
    }
}

function applySettingsToUI() {
    if (elements.emotionalContextToggle) elements.emotionalContextToggle.checked = AppState.settings.emotionalContext;
    if (elements.callIntentionToggle) elements.callIntentionToggle.checked = AppState.settings.callIntention;
    if (elements.inCallChatToggle) elements.inCallChatToggle.checked = AppState.settings.inCallChat;
    if (elements.whiteboardToggle) elements.whiteboardToggle.checked = AppState.settings.whiteboard;
    if (elements.pollsToggle) elements.pollsToggle.checked = AppState.settings.polls;
    if (elements.notesToggle) elements.notesToggle.checked = AppState.settings.notes;
    if (elements.focusModeToggle) elements.focusModeToggle.checked = AppState.settings.focusMode;
    if (elements.liveReactionsToggle) elements.liveReactionsToggle.checked = AppState.settings.liveReactions;
}

function updateSetting(event) {
    const setting = event.target.id.replace('Toggle', '');
    AppState.settings[setting] = event.target.checked;
    saveSettings();
    
    applySettingChange(setting, event.target.checked);
}

function applySettingChange(setting, value) {
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

function resetSettings() {
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

// ==================== PREMIUM FEATURES ====================
function checkPremiumFeature(feature) {
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

function updatePremiumUI() {
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

// ==================== CALL MANAGEMENT ====================
function openNewCallModal() {
    // Check if authenticated via parent coordinator
    if (window.parentCoordinator && !window.parentCoordinator.sessionValidated) {
        showNotification('Please wait for authentication', 'warning');
        window.parentCoordinator.showReconnectState();
        return;
    }
    
    if (!AppState.isOnline) {
        showNotification('Cannot load contacts while offline', 'warning');
        return;
    }
    
    elements.newCallModal.classList.add('active');
    
    if (AppState.contacts.length === 0 && window.callAPI) {
        window.callAPI.fetchContacts();
    } else if (window.callAPI) {
        window.callAPI.renderContacts(AppState.contacts);
    }
    
    switchNewCallTab('contacts');
}

function closeNewCallModal() {
    elements.newCallModal.classList.remove('active');
    
    document.querySelectorAll('.contact-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    elements.contactSearch.value = '';
    elements.groupContactSearch.value = '';
    
    elements.instantGroupOption.classList.remove('selected');
    elements.scheduledGroupOption.classList.remove('selected');
    elements.startGroupCallBtn.disabled = true;
}

function searchContacts() {
    const query = elements.contactSearch.value.toLowerCase();
    
    document.querySelectorAll('.contact-item').forEach(item => {
        const name = item.querySelector('.call-name').textContent.toLowerCase();
        if (name.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function searchGroupContacts() {
    const query = elements.groupContactSearch.value.toLowerCase();
    
    document.querySelectorAll('.contact-item[data-id]').forEach(item => {
        const name = item.querySelector('.call-name').textContent.toLowerCase();
        if (name.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function selectGroupOption(event) {
    const option = event.currentTarget;
    
    if (option.id === 'instantGroupOption') {
        elements.scheduledGroupOption.classList.remove('selected');
    } else {
        elements.instantGroupOption.classList.remove('selected');
    }
    
    option.classList.add('selected');
}

function updateGroupCallButton() {
    const selectedContacts = document.querySelectorAll('.group-contact:checked').length;
    const hasGroupOption = document.querySelector('.option-item.selected') !== null;
    
    elements.startGroupCallBtn.disabled = !(selectedContacts >= 1 && hasGroupOption);
}

function startVoiceCall() {
    // Check authentication via parent coordinator
    if (window.parentCoordinator && !window.parentCoordinator.sessionValidated) {
        showNotification('Please wait for authentication', 'warning');
        window.parentCoordinator.showReconnectState();
        return;
    }
    
    const selectedContacts = getSelectedContacts();
    
    if (selectedContacts.length === 0) {
        showNotification('Please select at least one contact', 'warning');
        return;
    }
    
    if (selectedContacts.length > 1 && !checkPremiumFeature('groupCalls')) {
        return;
    }
    
    startCall('voice', selectedContacts);
    closeNewCallModal();
}

function startVideoCall() {
    // Check authentication via parent coordinator
    if (window.parentCoordinator && !window.parentCoordinator.sessionValidated) {
        showNotification('Please wait for authentication', 'warning');
        window.parentCoordinator.showReconnectState();
        return;
    }
    
    const selectedContacts = getSelectedContacts();
    
    if (selectedContacts.length === 0) {
        showNotification('Please select at least one contact', 'warning');
        return;
    }
    
    if (selectedContacts.length > 1 && !checkPremiumFeature('groupCalls')) {
        return;
    }
    
    startCall('video', selectedContacts);
    closeNewCallModal();
}

function startGroupCall() {
    // Check authentication via parent coordinator
    if (window.parentCoordinator && !window.parentCoordinator.sessionValidated) {
        showNotification('Please wait for authentication', 'warning');
        window.parentCoordinator.showReconnectState();
        return;
    }
    
    const selectedContacts = getSelectedGroupContacts();
    const groupOption = document.querySelector('.option-item.selected');
    
    if (selectedContacts.length < 2) {
        showNotification('Please select at least 2 contacts for group call', 'warning');
        return;
    }
    
    if (!groupOption) {
        showNotification('Please select a group call option', 'warning');
        return;
    }
    
    if (!checkPremiumFeature('groupCalls')) {
        return;
    }
    
    const isInstant = groupOption.id === 'instantGroupOption';
    
    if (isInstant) {
        startCall('video', selectedContacts);
        closeNewCallModal();
    } else {
        scheduleGroupCall(selectedContacts);
    }
}

function getSelectedContacts() {
    const selected = [];
    document.querySelectorAll('.contact-checkbox:checked').forEach(checkbox => {
        const contactId = checkbox.id.replace('contact-', '');
        const contact = AppState.contacts.find(c => c.id === contactId);
        if (contact) {
            selected.push(contact);
        }
    });
    return selected;
}

function getSelectedGroupContacts() {
    const selected = [];
    document.querySelectorAll('.group-contact:checked').forEach(checkbox => {
        const contactId = checkbox.id.replace('group-contact-', '');
        const contact = AppState.contacts.find(c => c.id === contactId);
        if (contact) {
            selected.push(contact);
        }
    });
    return selected;
}

function startCall(type, participants) {
    if (AppState.isInCall) {
        showNotification('You are already in a call', 'warning');
        return;
    }
    
    console.log(`[Calls iframe] Starting ${type} call with ${participants.length} participants`);
    
    requestMediaPermissions(type)
        .then(stream => {
            AppState.localStream = stream;
            AppState.callType = type;
            AppState.callParticipants = participants;
            
            AppState.activeCallId = 'call-' + Date.now();
            AppState.currentCall = {
                id: AppState.activeCallId,
                type: type,
                participants: participants.map(p => p.id)
            };
            
            initializePeer();
            
            showCallUI();
            
            startCallTimer();
            
            initializeCallFeatures();
            
            showNotification(`Starting ${type} call with ${participants.length} participant(s)`, 'success');
        })
        .catch(error => {
            console.error('[Calls iframe] Error starting call:', error);
            
            if (AppState.localStream) {
                AppState.localStream.getTracks().forEach(track => track.stop());
                AppState.localStream = null;
            }
            
            showNotification(`Failed to start call: ${error.message}`, 'error');
        });
}

function requestMediaPermissions(type) {
    const constraints = {
        audio: true,
        video: type === 'video'
    };
    
    return navigator.mediaDevices.getUserMedia(constraints)
        .catch(error => {
            console.error('[Calls iframe] Error getting media permissions:', error);
            
            let errorMessage = 'Could not access ';
            if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                errorMessage += 'camera/microphone. Please check your devices.';
            } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorMessage += 'camera/microphone. Please allow permissions.';
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                errorMessage += 'camera/microphone. Device may be in use by another application.';
            } else {
                errorMessage += 'camera/microphone. Unknown error.';
            }
            
            throw new Error(errorMessage);
        });
}

function initializePeer() {
    const peerId = 'user-' + Math.random().toString(36).substr(2, 9);
    
    AppState.peer = new Peer(peerId, {
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    });
    
    AppState.peer.on('open', (id) => {
        console.log('[Calls iframe] Peer connected with ID:', id);
    });
    
    AppState.peer.on('call', (call) => {
        call.answer(AppState.localStream);
        
        call.on('stream', (remoteStream) => {
            addRemoteStream(call.peer, remoteStream);
        });
        
        call.on('close', () => {
            removeRemoteStream(call.peer);
        });
        
        AppState.connections.set(call.peer, call);
    });
    
    AppState.peer.on('error', (error) => {
        console.error('[Calls iframe] PeerJS error:', error);
        showNotification('Connection error: ' + error.type, 'error');
    });
    
    setTimeout(() => {
        if (AppState.callParticipants && AppState.callParticipants.length > 0) {
            AppState.callParticipants.forEach((participant, index) => {
                setTimeout(() => {
                    simulateRemoteConnection(participant.id);
                }, index * 1000);
            });
        }
    }, 1000);
}

function simulateRemoteConnection(participantId) {
    const fakePeerId = 'remote-' + participantId;
    
    const participant = AppState.callParticipants.find(p => p.id === participantId);
    if (participant) {
        addRemoteStream(fakePeerId, null);
    }
}

function addRemoteStream(peerId, stream) {
    AppState.remoteStreams.set(peerId, stream);
    
    updateVideoGrid();
}

function removeRemoteStream(peerId) {
    AppState.remoteStreams.delete(peerId);
    
    updateVideoGrid();
}

function showCallUI() {
    elements.sidebar.style.display = 'none';
    
    elements.callContainer.classList.add('active');
    
    const participantNames = AppState.callParticipants.map(p => p.name).join(', ');
    elements.callWithName.textContent = participantNames;
    elements.callStatusText.textContent = 'In call';
    
    const icon = AppState.callType === 'video' ? 'fa-video' : 'fa-phone';
    elements.callTypeIcon.innerHTML = `<i class="fas ${icon}"></i>`;
    
    if (AppState.settings.emotionalContext) {
        updateMoodIndicator(AppState.currentMood);
        updateIntentionIndicator(AppState.currentIntention);
    }
    
    elements.focusModeBtn.style.display = 'block';
    
    updateParticipantBadge();
    
    AppState.isInCall = true;
}

function startCallTimer() {
    AppState.callStartTime = Date.now();
    
    clearInterval(AppState.callDurationInterval);
    
    AppState.callDurationInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - AppState.callStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        elements.callDuration.textContent = `${minutes}:${seconds}`;
    }, 1000);
}

function initializeCallFeatures() {
    if (AppState.localStream && AppState.callType === 'video') {
        createVideoElement('local', 'You', AppState.localStream, true);
    }
    
    if (AppState.settings.liveReactions) {
        elements.reactionsContainer.style.display = 'flex';
    }
    
    if (AppState.settings.focusMode) {
        enableFocusMode();
    }
}

function updateVideoGrid() {
    const videoContainers = elements.videoGrid.querySelectorAll('.video-container:not([data-id="local"])');
    videoContainers.forEach(container => container.remove());
    
    elements.offlineCallPlaceholder.style.display = 'none';
    elements.videoGrid.style.display = 'grid';
    
    AppState.remoteStreams.forEach((stream, peerId) => {
        let participantName = 'Participant';
        let participant = null;
        
        for (const p of AppState.callParticipants) {
            if ('remote-' + p.id === peerId) {
                participant = p;
                participantName = p.name;
                break;
            }
        }
        
        createVideoElement(peerId, participantName, stream, false, participant);
    });
    
    updateVideoLayout();
}

function createVideoElement(id, name, stream, isLocal = false, participant = null) {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.dataset.id = id;
    
    if (isLocal) {
        videoContainer.classList.add('pinned');
    }
    
    const video = document.createElement('video');
    video.className = 'video-element';
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal;
    
    if (stream) {
        video.srcObject = stream;
    } else {
        video.style.backgroundColor = '#333';
        video.style.display = 'flex';
        video.style.alignItems = 'center';
        video.style.justifyContent = 'center';
        video.innerHTML = `<div style="color: white; font-size: 24px;">${name.charAt(0)}</div>`;
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'video-name';
    
    const statusSpan = document.createElement('span');
    statusSpan.className = 'video-status';
    statusSpan.textContent = isLocal ? 'You' : (participant ? 'Connected' : 'Remote');
    
    nameDiv.innerHTML = `<span>${name}</span>`;
    nameDiv.appendChild(statusSpan);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'video-actions';
    
    const pinBtn = document.createElement('button');
    pinBtn.className = 'video-action-btn' + (isLocal ? ' active' : '');
    pinBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
    pinBtn.title = isLocal ? 'Pinned (You)' : 'Pin video';
    pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePinVideo(id);
    });
    
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'video-action-btn';
    fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenBtn.title = 'Fullscreen';
    fullscreenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreen(video);
    });
    
    actionsDiv.appendChild(pinBtn);
    actionsDiv.appendChild(fullscreenBtn);
    
    overlay.appendChild(nameDiv);
    overlay.appendChild(actionsDiv);
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(overlay);
    
    videoContainer.addEventListener('click', () => {
        spotlightVideo(id);
    });
    
    elements.videoGrid.appendChild(videoContainer);
    
    if (stream) {
        video.play().catch(e => console.error('[Calls iframe] Error playing video:', e));
    }
}

function updateVideoLayout() {
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

function togglePinVideo(videoId) {
    const videoContainer = elements.videoGrid.querySelector(`.video-container[data-id="${videoId}"]`);
    
    if (!videoContainer) return;
    
    elements.videoGrid.querySelectorAll('.video-container.pinned').forEach(container => {
        if (container.dataset.id !== videoId) {
            container.classList.remove('pinned');
            const pinBtn = container.querySelector('.video-action-btn');
            if (pinBtn) {
                pinBtn.classList.remove('active');
                pinBtn.title = 'Pin video';
            }
        }
    });
    
    const isPinned = videoContainer.classList.contains('pinned');
    
    if (isPinned) {
        videoContainer.classList.remove('pinned');
    } else {
        videoContainer.classList.add('pinned');
    }
    
    const pinBtn = videoContainer.querySelector('.video-action-btn');
    if (pinBtn) {
        pinBtn.classList.toggle('active', !isPinned);
        pinBtn.title = !isPinned ? 'Pinned' : 'Pin video';
    }
    
    updateVideoLayout();
}

function spotlightVideo(videoId) {
    const videoContainer = elements.videoGrid.querySelector(`.video-container[data-id="${videoId}"]`);
    
    if (!videoContainer) return;
    
    const isSpotlight = videoContainer.style.gridColumn === '1 / -1';
    
    if (isSpotlight) {
        videoContainer.style.gridColumn = '';
        videoContainer.style.gridRow = '';
    } else {
        videoContainer.style.gridColumn = '1 / -1';
        videoContainer.style.gridRow = '1 / -1';
        videoContainer.style.zIndex = '10';
        
        let exitBtn = videoContainer.querySelector('.spotlight-exit');
        if (!exitBtn) {
            exitBtn = document.createElement('button');
            exitBtn.className = 'video-action-btn danger';
            exitBtn.innerHTML = '<i class="fas fa-times"></i>';
            exitBtn.title = 'Exit spotlight';
            exitBtn.style.position = 'absolute';
            exitBtn.style.top = '10px';
            exitBtn.style.right = '10px';
            exitBtn.classList.add('spotlight-exit');
            
            exitBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                spotlightVideo(videoId);
            });
            
            videoContainer.querySelector('.video-overlay').appendChild(exitBtn);
        }
    }
    
    updateVideoLayout();
}

function toggleFullscreen(videoElement) {
    if (!document.fullscreenElement) {
        videoElement.requestFullscreen().catch(err => {
            console.error('[Calls iframe] Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function updateParticipantBadge() {
    const count = AppState.callParticipants.length + 1;
    elements.participantBadge.textContent = count;
}

function updateChatBadge() {
    elements.chatBadge.textContent = AppState.unreadChatCount;
    if (AppState.unreadChatCount > 0) {
        elements.chatBadge.style.display = 'block';
    } else {
        elements.chatBadge.style.display = 'none';
    }
}

function toggleMute() {
    if (!AppState.localStream) return;
    
    const audioTracks = AppState.localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        AppState.isMuted = !AppState.isMuted;
        audioTracks.forEach(track => {
            track.enabled = !AppState.isMuted;
        });
        
        const icon = elements.muteBtn.querySelector('i');
        if (AppState.isMuted) {
            icon.className = 'fas fa-microphone-slash';
            elements.muteBtn.title = 'Unmute';
        } else {
            icon.className = 'fas fa-microphone';
            elements.muteBtn.title = 'Mute';
        }
        
        showNotification(AppState.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
    }
}

function toggleVideo() {
    if (!AppState.localStream) return;
    
    const videoTracks = AppState.localStream.getVideoTracks();
    if (videoTracks.length > 0) {
        AppState.isVideoOff = !AppState.isVideoOff;
        videoTracks.forEach(track => {
            track.enabled = !AppState.isVideoOff;
        });
        
        const icon = elements.videoBtn.querySelector('i');
        if (AppState.isVideoOff) {
            icon.className = 'fas fa-video-slash';
            elements.videoBtn.title = 'Turn Video On';
            
            const localVideo = elements.videoGrid.querySelector('.video-container[data-id="local"]');
            if (localVideo) {
                localVideo.style.display = 'none';
            }
        } else {
            icon.className = 'fas fa-video';
            elements.videoBtn.title = 'Turn Video Off';
            
            const localVideo = elements.videoGrid.querySelector('.video-container[data-id="local"]');
            if (localVideo) {
                localVideo.style.display = 'block';
            }
        }
        
        showNotification(AppState.isVideoOff ? 'Camera turned off' : 'Camera turned on', 'info');
    }
}

function toggleScreenShare() {
    if (!checkPremiumFeature('screenSharing')) {
        return;
    }
    
    if (AppState.isScreenSharing) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
}

function startScreenShare() {
    if (!navigator.mediaDevices.getDisplayMedia) {
        showNotification('Screen sharing is not supported in your browser', 'error');
        return;
    }
    
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        .then(stream => {
            AppState.screenStream = stream;
            AppState.isScreenSharing = true;
            
            const videoTrack = stream.getVideoTracks()[0];
            
            elements.screenShareBtn.classList.add('active');
            elements.screenShareBtn.title = 'Stop Sharing';
            
            const localVideo = elements.videoGrid.querySelector('.video-container[data-id="local"] video');
            if (localVideo) {
                const newStream = new MediaStream();
                newStream.addTrack(videoTrack);
                newStream.addTrack(AppState.localStream.getAudioTracks()[0]);
                
                localVideo.srcObject = newStream;
            }
            
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                stopScreenShare();
            });
            
            showNotification('Screen sharing started', 'success');
        })
        .catch(error => {
            console.error('[Calls iframe] Error starting screen share:', error);
            
            if (error.name === 'NotAllowedError') {
                showNotification('Screen sharing permission denied', 'error');
            } else {
                showNotification('Failed to start screen sharing', 'error');
            }
        });
}

function stopScreenShare() {
    if (!AppState.screenStream) return;
    
    AppState.screenStream.getTracks().forEach(track => track.stop());
    AppState.screenStream = null;
    AppState.isScreenSharing = false;
    
    if (AppState.localStream) {
        const localVideo = elements.videoGrid.querySelector('.video-container[data-id="local"] video');
        if (localVideo) {
            localVideo.srcObject = AppState.localStream;
        }
    }
    
    elements.screenShareBtn.classList.remove('active');
    elements.screenShareBtn.title = 'Share Screen';
    
    showNotification('Screen sharing stopped', 'info');
}

function toggleSpeaker() {
    AppState.isSpeakerOn = !AppState.isSpeakerOn;
    
    const icon = elements.speakerBtn.querySelector('i');
    if (AppState.isSpeakerOn) {
        icon.className = 'fas fa-volume-up';
        elements.speakerBtn.title = 'Switch to Headphones';
    } else {
        icon.className = 'fas fa-headphones';
        elements.speakerBtn.title = 'Switch to Speaker';
    }
    
    showNotification(`Switched to ${AppState.isSpeakerOn ? 'speaker' : 'headphones'}`, 'info');
}

function endCall() {
    if (!AppState.isInCall) return;
    
    if (confirm('End the call?')) {
        if (AppState.localStream) {
            AppState.localStream.getTracks().forEach(track => track.stop());
            AppState.localStream = null;
        }
        
        if (AppState.screenStream) {
            AppState.screenStream.getTracks().forEach(track => track.stop());
            AppState.screenStream = null;
        }
        
        AppState.remoteStreams.forEach(stream => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        });
        AppState.remoteStreams.clear();
        
        if (AppState.peer) {
            AppState.peer.destroy();
            AppState.peer = null;
        }
        
        AppState.connections.clear();
        
        clearInterval(AppState.callDurationInterval);
        
        const callDuration = AppState.callStartTime ? 
            Math.floor((Date.now() - AppState.callStartTime) / 1000) : 0;
        
        AppState.isInCall = false;
        AppState.activeCallId = null;
        AppState.currentCall = null;
        AppState.callType = null;
        AppState.callParticipants = [];
        AppState.callStartTime = null;
        
        elements.callContainer.classList.remove('active');
        elements.sidebar.style.display = 'flex';
        
        elements.focusModeBtn.style.display = 'none';
        
        if (AppState.currentFocusMode) {
            disableFocusMode();
        }
        
        setTimeout(() => {
            showPrivateNotesModal();
        }, 500);
        
        showNotification('Call ended', 'info');
    }
}

function showPrivateNotesModal() {
    const lastContact = AppState.callParticipants[0];
    
    if (lastContact) {
        elements.privateNotesTitle.textContent = `Notes about call with ${lastContact.name}`;
        elements.privateNotesSubtitle.textContent = 'Add private notes about this call (only visible to you)';
        
        const previousNotes = getPrivateNotes(lastContact.id);
        if (previousNotes) {
            elements.privateNotesTextarea.value = previousNotes;
        } else {
            elements.privateNotesTextarea.value = '';
        }
        
        elements.privateNotesModal.classList.add('active');
    } else {
        showCallSummary();
    }
}

function skipPrivateNotes() {
    elements.privateNotesModal.classList.remove('active');
    showCallSummary();
}

function savePrivateNotes() {
    const notes = elements.privateNotesTextarea.value.trim();
    const lastContact = AppState.callParticipants[0];
    
    if (lastContact && notes) {
        savePrivateNotesToStorage(lastContact.id, notes);
        showNotification('Notes saved', 'success');
    }
    
    elements.privateNotesModal.classList.remove('active');
    showCallSummary();
}

function savePrivateNotesToStorage(contactId, notes) {
    try {
        const allNotes = JSON.parse(localStorage.getItem('privateCallNotes') || '{}');
        allNotes[contactId] = {
            notes: notes,
            timestamp: new Date().toISOString(),
            callId: AppState.activeCallId
        };
        localStorage.setItem('privateCallNotes', JSON.stringify(allNotes));
    } catch (error) {
        console.error('[Calls iframe] Error saving private notes:', error);
    }
}

function getPrivateNotes(contactId) {
    try {
        const allNotes = JSON.parse(localStorage.getItem('privateCallNotes') || '{}');
        return allNotes[contactId] ? allNotes[contactId].notes : null;
    } catch (error) {
        console.error('[Calls iframe] Error loading private notes:', error);
        return null;
    }
}

function showCallSummary() {
    const callDuration = AppState.callStartTime ? 
        Math.floor((Date.now() - AppState.callStartTime) / 1000) : 0;
    
    const minutes = Math.floor(callDuration / 60);
    const seconds = callDuration % 60;
    
    elements.summaryDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    elements.summaryTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    elements.summaryType.textContent = AppState.callType === 'video' ? 'Video Call' : 'Voice Call';
    elements.summaryMood.textContent = AppState.currentMood.charAt(0).toUpperCase() + AppState.currentMood.slice(1);
    elements.summaryIntention.textContent = AppState.currentIntention === 'quick' ? 'Quick Chat' : 
                                          AppState.currentIntention === 'important' ? 'Important Discussion' :
                                          AppState.currentIntention === 'emergency' ? 'Emergency' :
                                          AppState.currentIntention === 'checkin' ? 'Check-in' : 'Work/Business';
    elements.summaryParticipants.textContent = AppState.callParticipants.length + 1;
    
    elements.callSummaryModal.classList.add('active');
}

function closeCallSummary() {
    elements.callSummaryModal.classList.remove('active');
}

function openMoodSelectionModal() {
    elements.moodSelectionModal.classList.add('active');
    
    document.querySelectorAll('.mood-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.mood === AppState.currentMood) {
            option.classList.add('selected');
        }
    });
}

function closeMoodSelectionModal() {
    elements.moodSelectionModal.classList.remove('active');
}

function setMood() {
    const selectedOption = document.querySelector('.mood-option.selected');
    if (selectedOption) {
        const newMood = selectedOption.dataset.mood;
        AppState.currentMood = newMood;
        
        localStorage.setItem('currentMood', newMood);
        
        updateMoodIndicator(newMood);
        
        if (AppState.isInCall) {
            broadcastData({ type: 'mood', mood: newMood });
        }
        
        closeMoodSelectionModal();
        showNotification(`Mood set to ${newMood}`, 'success');
    }
}

function updateMoodIndicator(mood) {
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

function openIntentionSelectionModal() {
    elements.intentionSelectionModal.classList.add('active');
    
    document.querySelectorAll('.intention-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.intention === AppState.currentIntention) {
            option.classList.add('selected');
        }
    });
}

function closeIntentionSelectionModal() {
    elements.intentionSelectionModal.classList.remove('active');
}

function setIntention() {
    const selectedOption = document.querySelector('.intention-option.selected');
    if (selectedOption) {
        const newIntention = selectedOption.dataset.intention;
        AppState.currentIntention = newIntention;
        
        localStorage.setItem('currentIntention', newIntention);
        
        updateIntentionIndicator(newIntention);
        
        if (AppState.isInCall) {
            broadcastData({ type: 'intention', intention: newIntention });
        }
        
        closeIntentionSelectionModal();
        showNotification(`Intention set to ${newIntention}`, 'success');
    }
}

function updateIntentionIndicator(intention) {
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

function toggleFocusMode() {
    if (AppState.currentFocusMode) {
        disableFocusMode();
    } else {
        enableFocusMode();
    }
}

function enableFocusMode() {
    AppState.currentFocusMode = true;
    elements.appContainer.classList.add('focus-mode');
    elements.focusModeBtn.classList.add('active');
    elements.focusModeBtn.title = 'Exit Focus Mode';
    
    showNotification('Focus mode enabled', 'info');
}

function disableFocusMode() {
    AppState.currentFocusMode = false;
    elements.appContainer.classList.remove('focus-mode');
    elements.focusModeBtn.classList.remove('active');
    elements.focusModeBtn.title = 'Focus Mode';
}

function sendReaction(reaction) {
    if (!AppState.isInCall) return;
    
    createFloatingReaction(reaction);
    
    broadcastData({ type: 'reaction', reaction: reaction });
    
    showNotification(`Sent ${reaction} reaction`, 'info');
}

function createFloatingReaction(reaction) {
    const reactionEl = document.createElement('div');
    reactionEl.className = 'floating-reaction';
    reactionEl.textContent = reaction;
    reactionEl.style.left = Math.random() * 80 + 10 + '%';
    reactionEl.style.top = Math.random() * 80 + 10 + '%';
    
    elements.callContainer.appendChild(reactionEl);
    
    setTimeout(() => {
        reactionEl.remove();
    }, 3000);
}

function broadcastData(data) {
    console.log('[Calls iframe] Broadcasting data:', data);
    
    if (data.type === 'reaction' && Math.random() > 0.5) {
        setTimeout(() => {
            createFloatingReaction(data.reaction);
        }, Math.random() * 1000 + 500);
    }
}

function scheduleGroupCall(participants) {
    showNotification('Group call scheduled successfully', 'success');
    closeNewCallModal();
}

function generateVoiceCallLink() {
    generateCallLink('voice');
}

function generateVideoCallLink() {
    generateCallLink('video');
}

function generateCallLink(type) {
    const callId = 'call-' + Math.random().toString(36).substr(2, 9);
    const baseUrl = window.location.origin + window.location.pathname;
    const callUrl = `${baseUrl}?call=${callId}&type=${type}`;
    
    elements.callLinkInput.value = callUrl;
    
    showNotification(`${type === 'voice' ? 'Voice' : 'Video'} call link generated`, 'success');
}

function copyCallLink() {
    const link = elements.callLinkInput.value;
    
    if (!link) {
        showNotification('Generate a call link first', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(link)
        .then(() => {
            showNotification('Call link copied to clipboard', 'success');
        })
        .catch(err => {
            console.error('[Calls iframe] Failed to copy: ', err);
            showNotification('Failed to copy link', 'error');
        });
}

function shareCallLink() {
    const link = elements.callLinkInput.value;
    
    if (!link) {
        showNotification('Generate a call link first', 'warning');
        return;
    }
    
    if (navigator.share) {
        navigator.share({
            title: 'Join my call',
            text: 'Join my call using this link',
            url: link,
        })
        .then(() => {
            showNotification('Call link shared', 'success');
        })
        .catch(err => {
            console.error('[Calls iframe] Error sharing:', err);
            showNotification('Failed to share link', 'error');
        });
    } else {
        copyCallLink();
    }
}

function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const callId = urlParams.get('call');
    const callType = urlParams.get('type');
    
    if (callId) {
        elements.urlParamText.textContent = `You've been invited to join a ${callType || 'voice'} call. Would you like to join now?`;
        elements.urlParamOverlay.classList.add('active');
    }
}

function closeUrlParamOverlay() {
    elements.urlParamOverlay.classList.remove('active');
    
    const url = new URL(window.location);
    url.searchParams.delete('call');
    url.searchParams.delete('type');
    window.history.replaceState({}, '', url);
}

function joinUrlParamCall() {
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
        
        showCallUI();
        startCallTimer();
        initializeCallFeatures();
        
        showNotification(`Joined ${callType} call`, 'success');
    }, 1000);
}

// ==================== CALL HISTORY ====================
function renderCallHistory() {
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

function createCallHistoryItem(call) {
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

function switchCallCategory(category) {
    AppState.currentCategory = category;
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        }
    });
    
    elements.allCallsSection.classList.remove('active');
    elements.missedCallsSection.classList.remove('active');
    elements.groupCallsSection.classList.remove('active');
    
    if (category === 'all') {
        elements.allCallsSection.classList.add('active');
    } else if (category === 'missed') {
        elements.missedCallsSection.classList.add('active');
    } else if (category === 'group') {
        elements.groupCallsSection.classList.add('active');
    }
}

function switchNewCallTab(tabId) {
    document.querySelectorAll('.new-call-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabId) {
            tab.classList.add('active');
        }
    });
    
    document.querySelectorAll('.new-call-tab-content').forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId + 'Tab') {
            content.classList.add('active');
        }
    });
}

function toggleMenuDots() {
    elements.menuDotsDropdown.classList.toggle('active');
}

function closeMenuDots() {
    elements.menuDotsDropdown.classList.remove('active');
}

// ==================== PAYMENT & UPGRADE ====================
function openPaymentModal() {
    elements.paymentModal.classList.add('active');
    elements.premiumLimitOverlay.classList.remove('active');
}

function closePaymentModal() {
    elements.paymentModal.classList.remove('active');
}

function selectPaymentOption(event) {
    document.querySelectorAll('.payment-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    event.currentTarget.classList.add('selected');
}

function processPayment() {
    const phoneNumber = elements.phoneNumber.value.trim();
    const amount = elements.paymentAmount.value;
    
    if (!phoneNumber || !/^07\d{8}$/.test(phoneNumber)) {
        showNotification('Please enter a valid Kenyan phone number (07XXXXXXXX)', 'error');
        return;
    }
    
    if (!amount || amount < 100) {
        showNotification('Please enter a valid amount (minimum 100 KES)', 'error');
        return;
    }
    
    showNotification('Processing payment...', 'info');
    
    setTimeout(() => {
        closePaymentModal();
        AppState.isPremium = true;
        updatePremiumUI();
        showNotification('Payment successful! Premium features unlocked.', 'success');
    }, 2000);
}

function closePremiumLimitModal() {
    elements.premiumLimitOverlay.classList.remove('active');
}

// ==================== UI MANAGEMENT ====================
function initializeNotifications() {
    elements.notificationToast.style.display = 'none';
}

function showNotification(message, type = 'success') {
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

function makeDraggable(element) {
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

function closePip() {
    elements.pipContainer.style.display = 'none';
}

function initializeOfflineDetection() {
    AppState.isOnline = navigator.onLine;
    
    if (!AppState.isOnline) {
        handleOffline();
    }
}

function handleOnline() {
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

function handleOffline() {
    console.log('[Calls iframe] App is offline');
    AppState.isOnline = false;
    
    elements.offlineBanner.classList.add('active');
    
    elements.appContainer.classList.add('offline-ui');
    
    elements.syncIndicator.innerHTML = '<i class="fas fa-cloud-slash"></i><span>Offline</span>';
    elements.syncIndicator.classList.remove('syncing');
    
    showOfflineUI();
}

function showOfflineUI() {
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

function enableUI() {
    console.log('[Calls iframe] Enabling UI elements...');
    
    // Enable UI based on authentication state
    const isAuthenticated = window.parentCoordinator ? 
        window.parentCoordinator.sessionValidated : 
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

function initializeUI() {
    if (elements.callsLoading) elements.callsLoading.style.display = 'none';
    if (elements.contactsLoading) elements.contactsLoading.style.display = 'none';
    
    updateMoodIndicator('neutral');
    updateIntentionIndicator('quick');
    
    initializeNotifications();
}

// ==================== INCOMING CALL SIMULATION ====================
function simulateIncomingCall() {
    if (AppState.isInCall || elements.incomingCallModal.classList.contains('active')) {
        return;
    }
    
    if (AppState.contacts.length === 0) return;
    
    const randomContact = AppState.contacts[Math.floor(Math.random() * AppState.contacts.length)];
    const isVideoCall = Math.random() > 0.5;
    
    elements.incomingCallName.textContent = randomContact.name;
    elements.incomingCallType.textContent = isVideoCall ? 'Video Call' : 'Voice Call';
    
    const initials = randomContact.name.split(' ').map(n => n[0]).join('').toUpperCase();
    elements.incomingCallAvatar.innerHTML = initials;
    elements.incomingCallAvatar.style.backgroundColor = stringToColor(randomContact.name);
    
    if (Math.random() > 0.5) {
        const moods = ['happy', 'neutral', 'sad', 'angry', 'tired'];
        const randomMood = moods[Math.floor(Math.random() * moods.length)];
        elements.incomingCallMood.innerHTML = `<i class="fas fa-smile"></i><span>${randomMood}</span>`;
        elements.incomingCallMood.className = `mood-indicator mood-${randomMood}`;
        elements.incomingCallMood.style.display = 'inline-flex';
    } else {
        elements.incomingCallMood.style.display = 'none';
    }
    
    if (Math.random() > 0.5) {
        const intentions = ['quick', 'important', 'emergency', 'checkin', 'work'];
        const randomIntention = intentions[Math.floor(Math.random() * intentions.length)];
        elements.incomingCallIntention.innerHTML = `<i class="fas fa-bullseye"></i><span>${randomIntention}</span>`;
        elements.incomingCallIntention.className = `intention-indicator intention-${randomIntention}`;
        elements.incomingCallIntention.style.display = 'inline-flex';
    } else {
        elements.incomingCallIntention.style.display = 'none';
    }
    
    let timeLeft = 45;
    elements.declineTimer.textContent = timeLeft;
    
    const countdown = setInterval(() => {
        timeLeft--;
        elements.declineTimer.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(countdown);
            declineIncomingCall();
        }
    }, 1000);
    
    elements.incomingCallModal.dataset.timer = countdown;
    
    elements.incomingCallModal.classList.add('active');
    
    showNotification(`Incoming ${isVideoCall ? 'video' : 'voice'} call from ${randomContact.name}`, 'info');
}

function declineIncomingCall() {
    if (elements.incomingCallModal.dataset.timer) {
        clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
    }
    
    elements.incomingCallModal.classList.remove('active');
    
    showNotification('Call declined', 'info');
}

function acceptIncomingCall() {
    acceptIncomingCallGeneric(false);
}

function acceptIncomingCallAsVideo() {
    acceptIncomingCallGeneric(true);
}

function acceptIncomingCallGeneric(asVideo) {
    if (elements.incomingCallModal.dataset.timer) {
        clearInterval(parseInt(elements.incomingCallModal.dataset.timer));
    }
    
    const callerName = elements.incomingCallName.textContent;
    const isVideoCall = elements.incomingCallType.textContent.includes('Video');
    const callType = asVideo ? 'video' : (isVideoCall ? 'video' : 'voice');
    
    elements.incomingCallModal.classList.remove('active');
    
    showNotification(`Accepting ${callType} call from ${callerName}...`, 'info');
    
    const simulatedParticipant = {
        id: 'incoming-caller',
        name: callerName
    };
    
    requestMediaPermissions(callType)
        .then(stream => {
            AppState.localStream = stream;
            AppState.callType = callType;
            AppState.callParticipants = [simulatedParticipant];
            
            showCallUI();
            startCallTimer();
            initializeCallFeatures();
            
            showNotification(`${callType} call started`, 'success');
        })
        .catch(error => {
            showNotification(`Failed to start call: ${error.message}`, 'error');
        });
}

function handleStorageEvent(event) {
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

// ==================== UTILITY FUNCTIONS ====================
function debounce(func, wait) {
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

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const color = Math.floor(Math.abs((Math.sin(hash) * 16777215) % 16777215)).toString(16);
    return '#' + '0'.repeat(6 - color.length) + color;
}

function formatTimeAgo(timestamp) {
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

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
            parentCoordinator: window.parentCoordinator ? window.parentCoordinator.getStatus() : null
        };
    }
};

// Initialize the application
window.addEventListener('DOMContentLoaded', bootstrapIframe);