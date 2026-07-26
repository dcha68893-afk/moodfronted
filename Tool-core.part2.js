/**
 * PART 2/3 — API & OPERATIONS
 * API gateway, data loading, marketplace core operations,
 * listing management, ecommerce integration
 */
import {
    ENVIRONMENT_TYPES, LIFECYCLE_STATE, MODULE_CAPABILITIES, MODULE_NAME, MODULE_VERSION,
    SessionClient, __isValidSession, _harvestToken, assertActive, currentState, debugLog,
    environmentDetector, flushMessageQueue, isActive, logError, logOnce, moduleState,
    parentComm, safeSend, safeStorage, transitionTo,
    activationComplete, handshakeComplete, isReady, parentReadyReceived,
    __set_activationComplete, __set_handshakeComplete, __set_isReady, __set_parentReadyReceived
} from './Tool-core.part1.js';
// marketplace / onModuleActive live in part3; part3 in turn imports the API helpers
// below from this file. This circular import is safe because both sides only use
// each other's bindings from inside functions that run after the whole module
// graph has finished loading (never during top-level module evaluation).
import { marketplace, onModuleActive } from './Tool-core.part3.js';

class SessionClientWrapper {
    constructor() {
        this.currentSession = null;
        this.listeners = new Set();
        this.sessionState = {
            requested: false,
            received: false,
            expiresAt: null,
            lastSync: 0
        };
        this._lastSessionId = null;
    }
    
    _generateSessionId(session) {
        const token = session.userToken || session.token;
        const userId = session.userId || session.user_id || session.userid || session.id;
        return `${userId}_${token ? token.substring(0, 16) : 'no_token'}`;
    }
acceptParentSession(sessionData) {
    try {
        if (!sessionData || typeof sessionData !== 'object') return false;
        
        if (window.__TOOLS_DEBUG__) console.log('[Tools][SessionWrapper] Processing session:', {
            userId: sessionData.userId || sessionData.id,
            hasToken: !!(sessionData.userToken || sessionData.token)
        });
        
        // Extract userId from various possible locations
        let userId = sessionData.userId || sessionData.user_id || sessionData.userid || sessionData.id;
        
        // Also check nested user object (parent sends session.user)
        if (!userId && sessionData.user) {
            userId = sessionData.user.id || sessionData.user.userId;
        }
        
        if (!userId) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools][SessionWrapper] No userId found');
            return false;
        }
        
        // Reject fake IDs
        const fakeIds = ['user', 'default', 'null', 'undefined', ''];
        if (typeof userId === 'string' && fakeIds.includes(userId.toLowerCase())) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools][SessionWrapper] Rejected fake userId:', userId);
            return false;
        }
        
        // Extract token from various possible locations
        let token = sessionData.userToken || sessionData.token || sessionData.accessToken;
        if (!token && sessionData.user) {
            token = sessionData.user.token;
        }
        
        // Create normalized session object
        const normalizedSession = {
            userId: userId,
            userToken: token,
            token: token,
            id: userId,
            displayName: sessionData.displayName || sessionData.user?.displayName || sessionData.user?.username || 'User',
            email: sessionData.email || sessionData.user?.email || '',
            photoURL: sessionData.photoURL || sessionData.user?.photoURL || '',
            isPremium: sessionData.isPremium || sessionData.user?.isPremium || false,
            trustLevel: sessionData.trustLevel || sessionData.user?.trustLevel || 'new'
        };
        
        // Merge with existing session if any
        if (this.currentSession) {
            this.currentSession = { ...this.currentSession, ...normalizedSession };
        } else {
            this.currentSession = normalizedSession;
        }
        
        moduleState.sessionActive = true;
        moduleState.sessionAuthority = 'parent';
        
        this.notifyListeners('session:updated', this.currentSession);
        this.sessionState.received = true;
        
        if (window.__TOOLS_DEBUG__) console.log('[Tools][SessionWrapper] Session accepted, userId:', userId);
        return true;
        
    } catch (error) {
        if (window.__TOOLS_DEBUG__) console.error('[Tools][SessionWrapper] Error:', error);
        return false;
    }
}

    validateSessionSchema(session) {
    try {
        if (!session || typeof session !== 'object') return null;

        // Accept both 'userId' and 'id' from parent
        const userId = session.userId || session.user_id || session.userid || session.id;
        // Accept both 'userToken' and 'token' from parent
        const userToken = session.userToken || session.token || session.user_token;
        
        // Reject fake userId values
        if (!userId) return null;
        const userIdStr = String(userId);
        const invalidValues = ['user', 'default', 'null', 'undefined', ''];
        if (invalidValues.includes(userIdStr.toLowerCase())) return null;
        
        if (!userToken) return null;

        return {
            userId: userId,
            userToken: userToken,
            expiresAt: session.expiresAt || session.expires_at || session.expiry,
            displayName: session.displayName || session.name || session.display_name,
            email: session.email,
            photoURL: session.photoURL || session.avatar || session.photo_url,
            isPremium: !!session.isPremium || !!session.premium,
            trustLevel: session.trustLevel || session.trust_level || 'new',
            groups: session.groups || [],
            friends: session.friends || []
        };
    } catch {
        return null;
    }
}

    getSession() {
        return this.currentSession;
    }

    getToken() {
        return this.currentSession?.userToken || this.currentSession?.token || null;
    }

    getUser() {
        if (!this.currentSession) return null;
        return {
            id: this.currentSession.userId || this.currentSession.id,
            displayName: this.currentSession.displayName || 'User',
            email: this.currentSession.email || '',
            photoURL: this.currentSession.photoURL || '',
            isPremium: !!this.currentSession.isPremium,
            trustLevel: this.currentSession.trustLevel || 'new'
        };
    }

    isValid() {
        const session = this.currentSession;
        if (!session) return false;
        if (!__isValidSession(session)) return false;
        if (session.expiresAt) {
            try {
                return new Date(session.expiresAt) > new Date();
            } catch {
                return true;
            }
        }
        return !!session.userToken;
    }

    clear() {
        this.currentSession = null;
        this.sessionState = { requested: false, received: false, expiresAt: null, lastSync: 0 };
        this._lastSessionId = null;
        moduleState.sessionActive = false;
        moduleState.sessionAuthority = 'unknown';
        this.notifyListeners('session:cleared', null);
    }

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(cb => { try { cb(event, data); } catch {} });
    }

    getState() {
        return {
            ...this.sessionState,
            isValid: this.isValid(),
            hasSession: !!this.currentSession,
            authority: moduleState.sessionAuthority
        };
    }
}

export const sessionClient = new SessionClientWrapper();

// Start background token harvester NOW that sessionClient exists
_harvestToken();

// =============================================
// MODULE 4 - HEARTBEAT RESPONDER (PASSIVE)
// =============================================

class HeartbeatResponder {
    constructor() {
        this.lastHeartbeat = 0;
        this.responderActive = false;
    }

    start() {
        if (this.responderActive) return;
        this.responderActive = true;
        logOnce('ready', 'Heartbeat responder ready');
    }

    stop() {
        this.responderActive = false;
    }

    handleHeartbeat(heartbeatMessage) {
        if (!this.responderActive || !isActive()) return;
        
        this.lastHeartbeat = Date.now();
        moduleState.health.lastHeartbeat = this.lastHeartbeat;
        
        safeSend('HEARTBEAT_ACK', {
            timestamp: this.lastHeartbeat,
            module: MODULE_NAME,
            frameId: parentComm.frameId,
            state: currentState
        });
        
        logOnce('receive', 'Heartbeat acknowledged');
    }

    getStatus() {
        return {
            lastHeartbeat: this.lastHeartbeat,
            responderActive: this.responderActive
        };
    }
}

export const heartbeatResponder = new HeartbeatResponder();

// =============================================
// MODULE 5 - DIAGNOSTICS AGENT (PRESERVED)
// =============================================

class DiagnosticsAgent {
    constructor() {
        this.diagnostics = {
            startTime: Date.now(),
            checks: [],
            errors: [],
            warnings: [],
            events: []
        };
        this.running = false;
        this.eventListeners = new Map();
        this.maxHistory = 1000;
        this.debugMode = false;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.addEventListener(window, 'error', (e) => this.logError(e.error || e.message, { type: 'uncaught' }));
        this.addEventListener(window, 'unhandledrejection', (e) => this.logError(e.reason, { type: 'unhandled_rejection' }));
    }

    addEventListener(target, type, handler) {
        const wrappedHandler = (e) => { try { handler(e); } catch {} };
        target.addEventListener(type, wrappedHandler);
        if (!this.eventListeners.has(type)) this.eventListeners.set(type, new Set());
        this.eventListeners.get(type).add({ target, handler: wrappedHandler });
    }

    logError(error, context = {}) {
        const entry = { timestamp: Date.now(), message: error?.message || String(error), stack: error?.stack, context };
        this.diagnostics.errors.push(entry);
        if (this.diagnostics.errors.length > this.maxHistory) this.diagnostics.errors.shift();
        if (this.debugMode) console.error('[Diagnostics]', entry);
    }

    logWarning(warning, context = {}) {
        const entry = { timestamp: Date.now(), message: warning, context };
        this.diagnostics.warnings.push(entry);
        if (this.diagnostics.warnings.length > this.maxHistory) this.diagnostics.warnings.shift();
        if (this.debugMode) console.warn('[Diagnostics]', entry);
    }

    logEvent(event, data = {}) {
        const entry = { timestamp: Date.now(), event, data };
        this.diagnostics.events.push(entry);
        if (this.diagnostics.events.length > this.maxHistory) this.diagnostics.events.shift();
    }

    getReport() {
        return {
            timestamp: Date.now(),
            uptime: Date.now() - this.diagnostics.startTime,
            errors: this.diagnostics.errors.slice(-10),
            warnings: this.diagnostics.warnings.slice(-10),
            events: this.diagnostics.events.slice(-20),
            state: {
                initialized: moduleState.initialized,
                ready: moduleState.ready,
                handshakeComplete: handshakeComplete,
                sessionActive: moduleState.sessionActive,
                bootState: currentState,
                authority: moduleState.sessionAuthority,
                parentReady: parentReadyReceived,
                sessionReady: SessionClient.isReady ? SessionClient.isReady() : false
            },
            environment: environmentDetector.getEnvironmentReport()
        };
    }

    enableDebug() {
        this.debugMode = true;
        window.__IFRAME_DEBUG__ = true;
        window.__diagnostics = this;
    }

    disableDebug() {
        this.debugMode = false;
        window.__IFRAME_DEBUG__ = false;
    }

    stop() {
        this.running = false;
        this.eventListeners.forEach((listeners, type) => {
            listeners.forEach(({ target, handler }) => target.removeEventListener(type, handler));
        });
        this.eventListeners.clear();
    }
}

export const diagnostics = new DiagnosticsAgent();

// =============================================
// MODULE 6 - MESSAGE HANDLER (REFACTORED FOR DETERMINISTIC HANDSHAKE - STRICT)
// =============================================

class MessageHandler {
    constructor() {
        this.handlers = new Map();
        this.sessionRequestRetryCount = 0;
        this.maxSessionRetries = 3;
        this.parentReadyTimeout = null;
        this.registerCoreHandlers();
    }

    registerCoreHandlers() {

        this.registerHandler('AUTH_READY', (message) => {
    // Ignore if already active
    if (currentState === LIFECYCLE_STATE.ACTIVE) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] AUTH_READY received - already ACTIVE');
        return;
    }
    
    if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] AUTH_READY received, currentState:', currentState);
    if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] AUTH_READY payload:', message.payload);
    
    // Extract session from AUTH_READY payload - handle multiple formats
    let sessionData = null;
    if (message.payload) {
        // Format 1: { payload: { session: {...} } }
        if (message.payload.session) {
            sessionData = message.payload.session;
        }
        // Format 2: { payload: { user: {...}, token: ... } }
        else if (message.payload.user && message.payload.token) {
            sessionData = {
                userId: message.payload.user.id || message.payload.user.userId,
                userToken: message.payload.token,
                displayName: message.payload.user.displayName,
                email: message.payload.user.email,
                photoURL: message.payload.user.photoURL,
                isPremium: message.payload.user.isPremium,
                trustLevel: message.payload.user.trustLevel
            };
        }
        // Format 3: { payload: { authenticated: true, session: {...} } }
        else if (message.payload.session) {
            sessionData = message.payload.session;
        }
        // Format 4: Direct session data in payload
        else if (message.payload.userId || message.payload.userToken || message.payload.token) {
            sessionData = {
                userId: message.payload.userId || message.payload.id,
                userToken: message.payload.userToken || message.payload.token,
                displayName: message.payload.displayName || message.payload.name,
                email: message.payload.email,
                photoURL: message.payload.photoURL,
                isPremium: message.payload.isPremium || false,
                trustLevel: message.payload.trustLevel || 'new'
            };
        }
        // Format 5: The parent might send just userId and token at top level
        else if (message.userId || message.token) {
            sessionData = message;
        }
    }
    // Also check if message itself has session data (not nested in payload)
    else if (message.userId || message.token) {
        sessionData = message;
    }
    
    if (sessionData) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Extracted session from AUTH_READY:', {
            userId: sessionData.userId,
            hasToken: !!sessionData.userToken
        });
        const sessionValid = this.handleSessionData(sessionData);
        if (!sessionValid) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools][Lifecycle] AUTH_READY contained invalid session');
        }
    } else {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] AUTH_READY - no session data found in payload');
    }
    
    // Force transition to ACTIVE if we have a valid session
    const session = sessionClient.getSession();
    if (session && __isValidSession(session)) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] AUTH_READY: valid session present, activating');
        transitionTo(LIFECYCLE_STATE.ACTIVE, 'auth_ready_valid_session');
        flushMessageQueue();
        if (!activationComplete) {
            onModuleActive();
            __set_activationComplete(true);
        }
    } else {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] AUTH_READY: no valid session yet, waiting');
        transitionTo(LIFECYCLE_STATE.WAITING_AUTH, 'auth_ready_waiting');
        if (!moduleState.sessionState.requested) {
            moduleState.sessionState.requested = true;
            SessionClient.requestSession().catch(() => {});
        }
    }
});

// DETERMINISTIC HANDSHAKE: PARENT_READY handler - STRICT (MODIFIED)
this.registerHandler('PARENT_READY', (message) => {
    // Ignore if already active
    if (currentState === LIFECYCLE_STATE.ACTIVE) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] PARENT_READY received - already ACTIVE');
        return;
    }
    
    if (window.__TOOLS_DEBUG__) console.log(`[Tools][Lifecycle] PARENT_READY received in state: ${currentState}`);
    this.handleParentReady(message);
});
        this.registerHandler('REGISTERED', (message) => {
            if (!this.isValidStateForMessage('REGISTERED', [LIFECYCLE_STATE.WAIT_PARENT, LIFECYCLE_STATE.WAITING_AUTH, LIFECYCLE_STATE.ACTIVE])) return;
            
            logOnce('receive', 'REGISTERED received');
            moduleState.handshakeState.registered = true;
            moduleState.handshakeState.registeredAck = true;
        });

        this.registerHandler('SESSION_DATA', (message) => {
    if (!isActive() && currentState !== LIFECYCLE_STATE.ACTIVE && currentState !== LIFECYCLE_STATE.WAITING_AUTH) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] SESSION_DATA received before active - still processing');
    }
    
    if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] SESSION_DATA received, payload:', message.payload);
    
    // Extract session from SESSION_DATA payload - handle multiple formats
    let sessionData = null;
    if (message.payload) {
        // Format 1: { payload: { token: ..., user: ... } }
        if (message.payload.user && message.payload.token) {
            sessionData = {
                userId: message.payload.user.id || message.payload.user.userId,
                userToken: message.payload.token,
                displayName: message.payload.user.displayName,
                email: message.payload.user.email,
                photoURL: message.payload.user.photoURL,
                isPremium: message.payload.user.isPremium,
                trustLevel: message.payload.user.trustLevel
            };
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Extracted session from user+token');
        }
        // Format 2: { payload: { session: {...} } }
        else if (message.payload.session) {
            sessionData = message.payload.session;
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Extracted session from payload.session');
        }
        // Format 3: Direct data in payload
        else if (message.payload.userId || message.payload.userToken || message.payload.token) {
            sessionData = {
                userId: message.payload.userId || message.payload.id,
                userToken: message.payload.userToken || message.payload.token,
                displayName: message.payload.displayName || message.payload.name,
                email: message.payload.email,
                photoURL: message.payload.photoURL,
                isPremium: message.payload.isPremium || false,
                trustLevel: message.payload.trustLevel || 'new'
            };
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Extracted session from direct payload');
        }
        else {
            sessionData = message.payload;
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Using payload as session directly');
        }
    }
    // Check if message itself has session data
    else if (message.userId || message.token) {
        sessionData = message;
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Using message as session directly');
    }
    
    if (sessionData) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Processing SESSION_DATA, userId:', sessionData.userId);
        this.handleSessionData(sessionData);
    } else {
        if (window.__TOOLS_DEBUG__) console.warn('[Tools][Lifecycle] SESSION_DATA had no extractable session data');
    }
});

        this.registerHandler('SESSION_ACTIVE', (message) => {
            logOnce('receive', 'SESSION_ACTIVE received');
            
            if (message.payload && message.payload.session) {
                this.handleSessionData(message.payload.session);
            }
            
            moduleState.handshakeState.sessionActive = true;
            
            safeSend('SESSION_ACK', {
                module: MODULE_NAME,
                frameId: parentComm.frameId,
                timestamp: Date.now()
            });
        });

        this.registerHandler('SESSION_UPDATE', (message) => {
            if (!message.payload) return;
            
            // Validate session update before applying
            if (!__isValidSession(message.payload)) {
                if (window.__TOOLS_DEBUG__) console.warn('[Tools][MessageHandler] Ignored invalid session update');
                return;
            }
            
            const currentSession = sessionClient.getSession();
            if (currentSession && __isValidSession(currentSession)) {
                // Merge only valid data
                const mergedSession = { ...currentSession, ...message.payload };
                if (__isValidSession(mergedSession)) {
                    sessionClient.acceptParentSession(mergedSession);
                } else {
                    if (window.__TOOLS_DEBUG__) console.warn('[Tools][MessageHandler] Session update would create invalid session - rejected');
                }
            } else {
                sessionClient.acceptParentSession(message.payload);
            }
            
            if (message.payload.userId || message.payload.displayName) {
                window.currentUser = { ...window.currentUser, ...message.payload };
                window.userData = window.currentUser;
            }
        });

        this.registerHandler('HEARTBEAT', (message) => {
            heartbeatResponder.handleHeartbeat(message);
        });

        this.registerHandler('LOGOUT', () => {
            sessionClient.clear();
            window.currentUser = null;
            window.userData = null;
            window.dispatchEvent(new CustomEvent('marketplace:logout', { detail: { timestamp: Date.now() } }));
        });

        this.registerHandler('ACK', (message) => {
            moduleState.connectionMetrics.acksReceived++;
            debugLog('ACK received', message.id);
        });

        this.registerHandler('CAPABILITIES', (message) => {
            this.sendCapabilitiesResponse(message);
        });

        this.registerHandler('UI_ACTION', (message) => {
            if (!assertActive('UI_ACTION')) return;
            if (marketplace && message.payload && isActive()) {
                marketplace.handleUIAction(message.payload);
            }
        });

        this.registerHandler('LISTING_CREATED', (message) => {
            if (!assertActive('LISTING_CREATED')) return;
            if (marketplace && message.payload && isActive()) {
                marketplace.handleListingCreated(message.payload);
            }
        });

        this.registerHandler('LISTING_UPDATED', (message) => {
            if (!assertActive('LISTING_UPDATED')) return;
            if (marketplace && message.payload && isActive()) {
                marketplace.handleListingUpdated(message.payload);
            }
        });

        this.registerHandler('LISTING_DELETED', (message) => {
            if (!assertActive('LISTING_DELETED')) return;
            if (marketplace && message.payload && isActive()) {
                marketplace.handleListingDeleted(message.payload);
            }
        });

        this.registerHandler('PAGE_ACTIVATED', (message) => {
            if (!assertActive('PAGE_ACTIVATED')) return;
            logOnce('receive', 'PAGE_ACTIVATED');
            window.dispatchEvent(new CustomEvent('tools:page-activated'));
        });

        this.registerHandler('PING', (message) => {
            if (!assertActive('PING')) return;
            safeSend('PONG', { echo: message.payload });
        });

        // Storage response handlers
        this.registerHandler('STORAGE_RESULT', (message) => {
            debugLog('STORAGE_RESULT received', message.payload);
        });
        // Add this inside registerCoreHandlers() method, around line 1190-1200

// ── SETTINGS HANDLERS ──
this.registerHandler('SETTING_CHANGED', (message) => {
    if (!assertActive('SETTING_CHANGED')) return;
    
    const { section, key, value } = message.payload || {};
    
    // Apply relevant settings immediately
    if (section === 'appearance' && key === 'theme') {
        const theme = (value === 'dark' ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        
        // Also save to storage
        safeStorage.set('user_theme_preference', theme);
    }
    
    if (section === 'appearance' && key === 'fontSize') {
        const fontSize = parseInt(value) || 16;
        document.documentElement.style.fontSize = fontSize + 'px';
        safeStorage.set('user_font_size', fontSize);
    }
    
    if (section === 'notifications' && key === 'soundEnabled') {
        // Store notification preference
        safeStorage.set('notification_sound_enabled', value);
        window.dispatchEvent(new CustomEvent('notificationPreferenceChanged', {
            detail: { soundEnabled: value }
        }));
    }
    
    if (section === 'notifications' && key === 'desktopEnabled') {
        safeStorage.set('desktop_notifications_enabled', value);
    }
    
    // Emit for any UI components listening
    window.dispatchEvent(new CustomEvent('settingChanged', {
        detail: { section, key, value, timestamp: Date.now() }
    }));
    
    // Acknowledge receipt
    safeSend('SETTING_APPLIED', {
        section, key, value,
        module: MODULE_NAME,
        timestamp: Date.now()
    });
});

this.registerHandler('SETTINGS_UPDATED', (message) => {
    if (!assertActive('SETTINGS_UPDATED')) return;
    
    const { settings } = message.payload || {};
    if (!settings) return;
    
    // Apply appearance settings
    if (settings.appearance) {
        const s = settings.appearance;
        
        if (s.theme) {
            if (window.ThemeManager) {
                window.ThemeManager.setTheme(s.theme);
            } else {
                const theme = s.theme === 'dark' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
                document.documentElement.classList.toggle('theme-dark', theme === 'dark');
                document.documentElement.classList.toggle('dark-theme', theme === 'dark');
                try { localStorage.setItem('app_theme', theme); } catch (_) {}
            }
            safeStorage.set('user_theme_preference', window.ThemeManager ? window.ThemeManager.getTheme() : (s.theme === 'dark' ? 'dark' : 'light'));
        }
        
        if (s.fontSize) {
            if (window.ThemeManager) window.ThemeManager.setFontSize(s.fontSize);
            else document.documentElement.style.fontSize = parseInt(s.fontSize) + 'px';
            safeStorage.set('user_font_size', parseInt(s.fontSize));
        }
    }
    
    // Apply notification settings
    if (settings.notifications) {
        if (settings.notifications.soundEnabled !== undefined) {
            safeStorage.set('notification_sound_enabled', settings.notifications.soundEnabled);
        }
        if (settings.notifications.desktopEnabled !== undefined) {
            safeStorage.set('desktop_notifications_enabled', settings.notifications.desktopEnabled);
        }
    }
    
    window.dispatchEvent(new CustomEvent('settingsUpdated', {
        detail: { settings, timestamp: Date.now() }
    }));
    
    safeSend('SETTINGS_APPLIED', {
        module: MODULE_NAME,
        timestamp: Date.now()
    });
});

        this.registerHandler('SESSION_STORAGE_RESULT', (message) => {
            debugLog('SESSION_STORAGE_RESULT received', message.payload);
        });
        
        // API_REQUEST handler with endpoint normalization
        this.registerHandler('API_REQUEST', (message) => {
            if (!assertActive('API_REQUEST')) return;
            if (!message.payload) return;
            
            const { requestId, endpoint, method, data } = message.payload;
            if (!requestId || !endpoint || !method) {
                if (window.__TOOLS_DEBUG__) console.warn('[Tools] Invalid API_REQUEST - missing required fields');
                return;
            }
            
            // Normalize endpoint
            let normalizedEndpoint = endpoint;
            if (!normalizedEndpoint.startsWith('/')) {
                normalizedEndpoint = '/' + normalizedEndpoint;
            }
            if (normalizedEndpoint.startsWith('/api/')) {
                normalizedEndpoint = normalizedEndpoint.substring(4);
            }
            if (normalizedEndpoint.includes('//')) {
                normalizedEndpoint = normalizedEndpoint.replace(/\/+/g, '/');
            }
            
            // Forward to marketplace API handler
            if (marketplace && typeof marketplace.handleApiRequest === 'function') {
                marketplace.handleApiRequest(requestId, normalizedEndpoint, method, data);
            }
        });
    }

handleParentReady(message) {
    __set_parentReadyReceived(true);
    moduleState.parentDetected = true;
    moduleState.handshakeState.parentReadyReceived = true;

    // Clear any pending timeout
    if (this.parentReadyTimeout) {
        clearTimeout(this.parentReadyTimeout);
        this.parentReadyTimeout = null;
    }

    if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] PARENT_READY received with payload:', message.payload);

    // Extract session from PARENT_READY payload - handle multiple formats
    let sessionData = null;
    if (message.payload) {
        // Format 1: { payload: { session: {...} } }
        if (message.payload.session) {
            sessionData = message.payload.session;
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Extracted session from payload.session');
        }
        // Format 2: { payload: { user: {...}, token: ... } }
        else if (message.payload.user && message.payload.token) {
            sessionData = {
                userId: message.payload.user.id || message.payload.user.userId,
                userToken: message.payload.token,
                displayName: message.payload.user.displayName,
                email: message.payload.user.email,
                photoURL: message.payload.user.photoURL,
                isPremium: message.payload.user.isPremium,
                trustLevel: message.payload.user.trustLevel
            };
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Extracted session from user+token');
        }
        // Format 3: { payload: { userId, userToken, ... } }
        else if (message.payload.userId || message.payload.userToken || message.payload.token) {
            sessionData = {
                userId: message.payload.userId || message.payload.id,
                userToken: message.payload.userToken || message.payload.token,
                displayName: message.payload.displayName || message.payload.name,
                email: message.payload.email,
                photoURL: message.payload.photoURL,
                isPremium: message.payload.isPremium || false,
                trustLevel: message.payload.trustLevel || 'new'
            };
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Extracted session from direct payload');
        }
        // Format 4: Just raw session data
        else if (message.payload.id || message.payload.userId) {
            sessionData = message.payload;
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Using payload as session directly');
        }
    }

    let sessionValid = false;
    if (sessionData) {
        sessionValid = this.handleSessionData(sessionData);
        if (sessionValid) {
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] PARENT_READY: session applied successfully');
        } else {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools][Lifecycle] PARENT_READY: session was invalid');
        }
    }

    // Check if we have a valid session from any source
    const existingSession = sessionClient.getSession();
    const hasValidSession = existingSession && __isValidSession(existingSession);
    
    if (hasValidSession || sessionValid) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] PARENT_READY: has valid session, activating');
        transitionTo(LIFECYCLE_STATE.ACTIVE, 'parent_ready_valid_session');
        flushMessageQueue();
        if (!activationComplete) {
            onModuleActive();
            __set_activationComplete(true);
        }
    } else {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] PARENT_READY: no valid session yet, waiting for AUTH_READY or SESSION_DATA');
        transitionTo(LIFECYCLE_STATE.WAITING_AUTH, 'parent_ready_waiting_session');
        
        // Request session if not already requested
        if (!moduleState.sessionState.requested) {
            moduleState.sessionState.requested = true;
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Requesting session from parent');
            SessionClient.requestSession().catch(err => {
                if (window.__TOOLS_DEBUG__) console.warn('[Tools][Lifecycle] Session request failed:', err);
            });
        }
        
        // Set timeout for fallback - but increase to 8 seconds
        this.parentReadyTimeout = setTimeout(() => {
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] PARENT_READY timeout: forcing activation');
            if (currentState !== LIFECYCLE_STATE.ACTIVE) {
                transitionTo(LIFECYCLE_STATE.ACTIVE, 'parent_ready_timeout');
                flushMessageQueue();
                if (!activationComplete) {
                    onModuleActive();
                    __set_activationComplete(true);
                }
            }
            this.parentReadyTimeout = null;
        }, 8000);
    }
}

    isValidStateForMessage(messageType, allowedStates) {
        if (allowedStates.includes(currentState)) return true;
        debugLog(`[MessageHandler] ${messageType} received in wrong state: ${currentState}`);
        return false;
    }

    sendRegistration() {
        logOnce('send', 'REGISTER_MODULE');
        
        safeSend('REGISTER_MODULE', {
            module: MODULE_NAME,
            version: MODULE_VERSION,
            frameId: parentComm.frameId,
            capabilities: MODULE_CAPABILITIES,
            environment: environmentDetector.environment
        });
    }

    sendCapabilitiesResponse(message) {
        safeSend('CAPABILITIES_ACK', {
            module: MODULE_NAME,
            capabilities: MODULE_CAPABILITIES,
            version: MODULE_VERSION,
            features: Array.from(moduleState.features.keys()),
            frameId: parentComm.frameId
        });
    }

    handleSessionData(sessionData) {
    if (!sessionData) return false;
    
    if (window.__TOOLS_DEBUG__) console.log('[Tools][MessageHandler] handleSessionData received:', {
        hasUserId: !!(sessionData.userId || sessionData.id),
        hasToken: !!(sessionData.userToken || sessionData.token),
        hasNestedUser: !!sessionData.user
    });
    
    // Extract session from nested structure if needed
    let actualSession = sessionData;
    
    // Format: { user: {...}, token: ... }
    if (sessionData.user && !sessionData.userId) {
        actualSession = {
            userId: sessionData.user.id || sessionData.user.userId,
            userToken: sessionData.token || sessionData.userToken,
            displayName: sessionData.user.displayName || sessionData.user.username,
            email: sessionData.user.email,
            photoURL: sessionData.user.photoURL,
            isPremium: sessionData.user.isPremium,
            trustLevel: sessionData.user.trustLevel,
            ...sessionData
        };
    }
    
    // Format: { session: {...} }
    if (sessionData.session && !actualSession.userId) {
        actualSession = {
            userId: sessionData.session.userId || sessionData.session.id,
            userToken: sessionData.session.token || sessionData.session.userToken,
            displayName: sessionData.session.displayName,
            email: sessionData.session.email,
            photoURL: sessionData.session.photoURL,
            isPremium: sessionData.session.isPremium,
            trustLevel: sessionData.session.trustLevel
        };
    }
    
    const accepted = sessionClient.acceptParentSession(actualSession);
    if (accepted) {
        moduleState.sessionActive = true;
        
        const session = sessionClient.getSession();
        if (session) {
            window.currentUser = {
                id: session.userId,
                displayName: session.displayName,
                email: session.email,
                photoURL: session.photoURL,
                isPremium: session.isPremium,
                trustLevel: session.trustLevel
            };
            window.userData = window.currentUser;
        }
        
        // If waiting for auth, activate now
        if (currentState === LIFECYCLE_STATE.WAITING_AUTH || currentState === LIFECYCLE_STATE.WAIT_PARENT) {
            if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Valid session received, activating');
            transitionTo(LIFECYCLE_STATE.ACTIVE, 'valid_session_received');
            flushMessageQueue();
            if (!activationComplete) {
                onModuleActive();
                __set_activationComplete(true);
            }
        }
        
        logOnce('receive', 'Session data processed');
        return true;
    }
    
    return false;
}

    completeActivation() {
        moduleState.ready = true;
        moduleState.initialized = true;
        __set_isReady(true);
        __set_handshakeComplete(true);
        
        window.__MODULE_READY__ = true;
        if (moduleState.sessionActive) {
            window.__MODULE_SESSION_ACTIVE__ = true;
        }
        
        heartbeatResponder.start();
        
        logOnce('success', 'Tools module active');
        
        window.dispatchEvent(new CustomEvent('marketplaceCoreReady', {
            detail: {
                timestamp: Date.now(),
                sessionActive: moduleState.sessionActive,
                environment: environmentDetector.environment,
                bootState: currentState,
                parentReady: parentReadyReceived
            }
        }));
        
        safeSend('UI_READY', {
            module: MODULE_NAME,
            frameId: parentComm.frameId,
            timestamp: Date.now(),
            sessionActive: moduleState.sessionActive
        });
    }

    registerHandler(type, handler, options = {}) {
        if (!this.handlers.has(type)) this.handlers.set(type, []);
        this.handlers.get(type).push({ fn: handler, priority: options.priority || 0 });
        return () => this.unregisterHandler(type, handler);
    }

    unregisterHandler(type, handler) {
        const handlers = this.handlers.get(type);
        if (handlers) {
            const index = handlers.findIndex(h => h.fn === handler);
            if (index !== -1) handlers.splice(index, 1);
        }
    }

    handleMessage(message) {
        const handlers = this.handlers.get(message.type) || [];
        const sortedHandlers = [...handlers].sort((a, b) => b.priority - a.priority);
        
        for (const handler of sortedHandlers) {
            try {
                handler.fn(message);
            } catch (error) {
                logError('MessageHandler', error, { type: message.type });
            }
        }
    }

    cleanup() {
        this.handlers.clear();
        if (this.parentReadyTimeout) {
            clearTimeout(this.parentReadyTimeout);
            this.parentReadyTimeout = null;
        }
    }
}

export const messageHandler = new MessageHandler();

// =============================================
// MODULE 7 - SECURITY VALIDATOR (PRESERVED)
// =============================================

class SecurityValidator {
    constructor() {
        this.trustedOrigins = new Set();
        this.dynamicOrigins = new Set();
        this.trustMode = 'permissive';
        this.initializeTrustedOrigins();
        logOnce('ready', 'SecurityValidator initialized');
    }

    initializeTrustedOrigins() {
        // Use whitelist from CONFIG
        const originWhitelist = [
            window.location.origin,
            'http://localhost:4000',
            'http://localhost:5500',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://*.onrender.com',
            'http://*.onrender.com',
            'https://nexora-3bla.onrender.com',
            'https://nexopa.onrender.com',
            'null'
        ];
        
        originWhitelist.forEach(origin => {
            if (origin !== '*') this.trustedOrigins.add(origin);
        });
        
        try {
            this.trustedOrigins.add(window.location.origin);
            if (window.parent && window.parent !== window) {
                try {
                    this.trustedOrigins.add(window.parent.location.origin);
                } catch {}
            }
        } catch {}
        
        this.updateTrustMode();
    }

    updateTrustMode() {
        const env = environmentDetector.environment;
        if (env.type === ENVIRONMENT_TYPES.PRODUCTION) {
            this.trustMode = 'strict';
        } else if (env.type === ENVIRONMENT_TYPES.VPN_NETWORK || env.type === ENVIRONMENT_TYPES.UNKNOWN) {
            this.trustMode = 'compatibility';
        } else {
            this.trustMode = 'permissive';
        }
        moduleState.originCheckMode = this.trustMode;
    }

    isOriginTrusted(origin) {
        // Relax during handshake
        if (currentState !== LIFECYCLE_STATE.ACTIVE) {
            return true;
        }
        
        if (!origin) return false;
        if (origin === 'null') return true;
        if (this.trustedOrigins.has(origin)) return true;
        if (this.dynamicOrigins.has(origin)) return true;

        for (const trusted of this.trustedOrigins) {
            if (trusted.includes('*')) {
                const pattern = trusted.replace(/\*/g, '.*');
                if (new RegExp(`^${pattern}$`).test(origin)) {
                    this.dynamicOrigins.add(origin);
                    return true;
                }
            }
        }

        if (this.trustMode === 'compatibility') {
            if (origin.startsWith('http://') || origin.startsWith('https://')) {
                this.dynamicOrigins.add(origin);
                return true;
            }
        }

        if (this.trustMode === 'permissive') {
            try {
                new URL(origin);
                this.dynamicOrigins.add(origin);
                return true;
            } catch {}
        }

        return false;
    }

    addTrustedOrigin(origin) {
        if (origin && !this.trustedOrigins.has(origin)) {
            this.trustedOrigins.add(origin);
            return true;
        }
        return false;
    }

    validateMessage(event) {
        try {
            return event.source === window.parent && this.isOriginTrusted(event.origin);
        } catch {
            return false;
        }
    }

    validateMessageStructure(message) {
        if (!message || typeof message !== 'object') return false;
        return !!(message.id && message.type && message.source && message.timestamp && message.payload !== undefined);
    }

    getOriginReport() {
        return {
            mode: this.trustMode,
            trusted: Array.from(this.trustedOrigins),
            dynamic: Array.from(this.dynamicOrigins),
            environment: environmentDetector.environment.type
        };
    }
}

const securityValidator = new SecurityValidator();

// =============================================
// MODULE 8 - GLOBAL ERROR HANDLER (PRESERVED)
// =============================================

class GlobalErrorHandler {
    constructor() {
        this.crashes = 0;
        this.fatalErrors = new Set();
        this.initialized = false;
        this.recoveryCallbacks = new Set();
    }

    initialize() {
        if (this.initialized) return;
        this.initialized = true;

        window.addEventListener('error', (event) => {
            this.handleUncaughtError(event.error || event.message);
            event.preventDefault?.();
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.handleUnhandledRejection(event.reason);
            event.preventDefault?.();
        });
    }

    handleUncaughtError(error) {
        const errorKey = error?.message || 'unknown_error';
        if (!this.fatalErrors.has(errorKey)) {
            this.fatalErrors.add(errorKey);
            this.crashes++;
            diagnostics?.logError(error, { type: 'uncaught' });
            this.attemptRecovery(error);
        }
    }

    handleUnhandledRejection(reason) {
        const reasonKey = reason?.message || 'unhandled_rejection';
        if (!this.fatalErrors.has(reasonKey)) {
            this.fatalErrors.add(reasonKey);
            diagnostics?.logError(reason, { type: 'unhandled_rejection' });
            this.attemptRecovery(reason);
        }
    }

    attemptRecovery(error) {
        this.recoveryCallbacks.forEach(cb => { try { cb(error); } catch {} });
        
        if (window.parent && window.parent !== window) {
            try {
                safeSend('ERROR', {
                    error: error?.message || 'Unknown error',
                    stack: error?.stack,
                    module: MODULE_NAME,
                    frameId: parentComm.frameId
                });
            } catch {}
        }
    }

    onRecovery(callback) {
        this.recoveryCallbacks.add(callback);
        return () => this.recoveryCallbacks.delete(callback);
    }

    wrap(fn) {
        return (...args) => {
            try {
                return fn(...args);
            } catch (error) {
                this.handleUncaughtError(error);
                return null;
            }
        };
    }

    wrapAsync(fn) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.handleUncaughtError(error);
                return null;
            }
        };
    }
}

const errorHandler = new GlobalErrorHandler();
errorHandler.initialize();

// =============================================
// MODULE 9 - RESOURCE MANAGER (PRESERVED)
// =============================================

class ResourceManager {
    constructor() {
        this.timers = new Set();
        this.intervals = new Set();
        this.listeners = new Set();
    }

    setTimeout(fn, delay) {
        const id = setTimeout(() => { this.timers.delete(id); fn(); }, delay);
        this.timers.add(id);
        return id;
    }

    setInterval(fn, interval) {
        const id = setInterval(fn, interval);
        this.intervals.add(id);
        return id;
    }

    clearInterval(id) {
        clearInterval(id);
        this.intervals.delete(id);
    }

    clearTimeout(id) {
        clearTimeout(id);
        this.timers.delete(id);
    }

    addEventListener(target, type, handler, options = {}) {
        target.addEventListener(type, handler, options);
        this.listeners.add({ target, type, handler, options });
        return () => this.removeEventListener(target, type, handler);
    }

    removeEventListener(target, type, handler) {
        target.removeEventListener(type, handler);
        this.listeners.forEach(listener => {
            if (listener.target === target && listener.type === type && listener.handler === handler) {
                this.listeners.delete(listener);
            }
        });
    }

    release() {
        this.timers.forEach(id => clearTimeout(id));
        this.timers.clear();
        this.intervals.forEach(id => clearInterval(id));
        this.intervals.clear();
        
        this.listeners.forEach(({ target, type, handler, options }) => {
            try {
                target.removeEventListener(type, handler, options);
            } catch {}
        });
        this.listeners.clear();
    }
}

export const resourceManager = new ResourceManager();

// =============================================
// MODULE 10 - UI BRIDGE (PRESERVED)
// =============================================

class UIBridge {
    constructor() {
        this.eventHandlers = new Map();
        this.bound = false;
    }

    initialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindUIEvents());
        } else {
            this.bindUIEvents();
        }
        
        logOnce('ready', 'UIBridge initialized');
    }

    bindUIEvents() {
        if (this.bound) return;
        
        this.bindMarketplaceEvents();
        this.bindUserActionEvents();
        this.bindFilterEvents();
        this.bindListingEvents();
        
        this.bound = true;
        logOnce('ready', 'UI events bound');
    }

    bindMarketplaceEvents() {
        this.registerEvent('createListingBtn', 'click', () => {
            if (!assertActive('createListingBtn click')) return;
            this.dispatchUIAction('show_create_listing_modal');
        });
        
        this.registerEvent('refreshListingsBtn', 'click', () => {
            if (!assertActive('refreshListingsBtn click')) return;
            this.dispatchUIAction('refresh_listings');
        });
        
        this.registerEvent('savedItemsBtn', 'click', () => {
            if (!assertActive('savedItemsBtn click')) return;
            this.dispatchUIAction('show_saved_items');
        });
        
        this.registerEvent('myListingsBtn', 'click', () => {
            if (!assertActive('myListingsBtn click')) return;
            this.dispatchUIAction('show_my_listings');
        });
    }

    bindUserActionEvents() {
        this.registerEvent('contactSellerBtn', 'click', (e) => {
            if (!assertActive('contactSellerBtn click')) return;
            const listingId = e.target.dataset.listingId;
            if (listingId) {
                this.dispatchUIAction('contact_seller', { listingId });
            }
        });
        
        this.registerEvent('saveListingBtn', 'click', (e) => {
            if (!assertActive('saveListingBtn click')) return;
            const listingId = e.target.dataset.listingId;
            if (listingId) {
                this.dispatchUIAction('toggle_save', { listingId });
            }
        });
        
        this.registerEvent('shareListingBtn', 'click', (e) => {
            if (!assertActive('shareListingBtn click')) return;
            const listingId = e.target.dataset.listingId;
            if (listingId) {
                this.dispatchUIAction('share_listing', { listingId });
            }
        });
    }

    bindFilterEvents() {
        this.registerEvent('searchInput', 'input', (e) => {
            if (!assertActive('searchInput input')) return;
            this.dispatchUIAction('filter_search', { value: e.target.value });
        });
        
        this.registerEvent('categoryFilter', 'change', (e) => {
            if (!assertActive('categoryFilter change')) return;
            this.dispatchUIAction('filter_category', { value: e.target.value });
        });
        
        this.registerEvent('priceRange', 'change', (e) => {
            if (!assertActive('priceRange change')) return;
            this.dispatchUIAction('filter_price', { 
                min: document.getElementById('minPrice')?.value,
                max: document.getElementById('maxPrice')?.value
            });
        });
        
        this.registerEvent('sortSelect', 'change', (e) => {
            if (!assertActive('sortSelect change')) return;
            this.dispatchUIAction('filter_sort', { value: e.target.value });
        });
        
        this.registerEvent('resetFiltersBtn', 'click', () => {
            if (!assertActive('resetFiltersBtn click')) return;
            this.dispatchUIAction('reset_filters');
        });
    }

    bindListingEvents() {
        this.registerEvent('listingForm', 'submit', (e) => {
            if (!assertActive('listingForm submit')) return;
            e.preventDefault();
            this.dispatchUIAction('submit_listing_form', this.getFormData('listingForm'));
        });
        
        this.registerEvent('deleteListingBtn', 'click', (e) => {
            if (!assertActive('deleteListingBtn click')) return;
            const listingId = e.target.dataset.listingId;
            if (listingId && confirm('Are you sure you want to delete this listing?')) {
                this.dispatchUIAction('delete_listing', { listingId });
            }
        });
        
        this.registerEvent('editListingBtn', 'click', (e) => {
            if (!assertActive('editListingBtn click')) return;
            const listingId = e.target.dataset.listingId;
            if (listingId) {
                this.dispatchUIAction('edit_listing', { listingId });
            }
        });
        
        this.registerEvent('loadMoreBtn', 'click', () => {
            if (!assertActive('loadMoreBtn click')) return;
            this.dispatchUIAction('load_more_listings');
        });
    }

    registerEvent(elementId, eventType, handler) {
        if (!elementId || !eventType || typeof handler !== 'function') return;
        
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const wrappedHandler = errorHandler.wrap(handler);
        element.addEventListener(eventType, wrappedHandler);
        
        if (!this.eventHandlers.has(elementId)) {
            this.eventHandlers.set(elementId, []);
        }
        this.eventHandlers.get(elementId).push({ eventType, handler: wrappedHandler });
    }

    dispatchUIAction(action, data = {}) {
        if (!assertActive(`UI action ${action}`)) return;
        
        safeSend('UI_ACTION', {
            action,
            data,
            module: MODULE_NAME,
            timestamp: Date.now()
        });
    }

    getFormData(formId) {
        const form = document.getElementById(formId);
        if (!form) return {};
        
        const formData = new FormData(form);
        const data = {};
        
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        return data;
    }

    cleanup() {
        this.eventHandlers.forEach((handlers, elementId) => {
            const element = document.getElementById(elementId);
            if (element) {
                handlers.forEach(({ eventType, handler }) => {
                    element.removeEventListener(eventType, handler);
                });
            }
        });
        this.eventHandlers.clear();
        this.bound = false;
    }
}

export const uiBridge = new UIBridge();

// =============================================
// MARKETPLACE CORE IMPLEMENTATION (PRESERVED - UPDATED STORAGE)
// =============================================


