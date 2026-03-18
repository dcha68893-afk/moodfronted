// =============================================
// SETTINGS MODULE - COMMUNICATION INFRASTRUCTURE UPDATE
// VERSION: 7.2.10 - STRICT PARENT-CONTROLLED LIFECYCLE + PROTOCOL COMPLIANCE
// ALL ORIGINAL FEATURES PRESERVED - 10000+ LINES INTACT
// =============================================

// =============================================
// INITIALIZATION GUARD - PREVENT MULTIPLE INITIALIZATIONS
// =============================================
(function() {
    if (window.__SETTINGS_CORE_INITIALIZED__) {
        return;
    }
    window.__SETTINGS_CORE_INITIALIZED__ = true;
    window.__SETTINGS_INITIALIZING__ = true;
})();

// =============================================
// MODULE IDENTITY & VERSION
// =============================================
const MODULE_NAME = 'settings'; // EXACT match - DO NOT CHANGE
const MODULE_VERSION = '7.2.10';
const FRAME_ID = 'settings';
let moduleId = `settings-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// =============================================
// GLOBAL DEBUG FLAG - MINIMAL NOISE
// =============================================
const DEBUG = false;
window.__SETTINGS_DEBUG__ = DEBUG;
let DEBUG_ENABLED = DEBUG;
let CONSOLE_NOISE_SUPPRESSED = true;

// =============================================
// STRICT LIFECYCLE STATE MACHINE - PARENT CONTROLLED
// =============================================
const LifecycleState = {
    INITIALIZING: 'INITIALIZING', // Start here
    READY: 'READY',                // After local init
    WAIT_PARENT: 'WAIT_PARENT',    // After CHILD_READY sent
    ACTIVE: 'ACTIVE'               // After PARENT_READY received
};

let currentState = LifecycleState.INITIALIZING; // Start in INITIALIZING
let stateHistory = [];
let isReady = false;

function setState(newState, reason = '') {
    if (currentState === newState) return false;
    
    const validTransitions = {
        [LifecycleState.INITIALIZING]: [LifecycleState.READY],
        [LifecycleState.READY]: [LifecycleState.WAIT_PARENT],
        [LifecycleState.WAIT_PARENT]: [LifecycleState.ACTIVE],
        [LifecycleState.ACTIVE]: []
    };
    
    if (!validTransitions[currentState]?.includes(newState)) {
        console.warn(`[${MODULE_NAME}] Invalid transition: ${currentState} → ${newState}`);
        return false;
    }
    
    const oldState = currentState;
    currentState = newState;
    
    if (newState === LifecycleState.ACTIVE) {
        console.log(`[${MODULE_NAME}] ✅ State: ${oldState} → ${newState}`);
    }
    
    recordStateTransition(oldState, newState, reason);
    
    window.__SETTINGS_STATE__ = currentState;
    window.__SETTINGS_SESSION_ACTIVE__ = (newState === LifecycleState.ACTIVE);
    window.__SETTINGS_READY__ = (newState === LifecycleState.ACTIVE);
    isReady = (newState === LifecycleState.ACTIVE);
    
    return true;
}

function recordStateTransition(from, to, reason = '') {
    stateHistory.push({
        from,
        to,
        reason,
        timestamp: Date.now()
    });
    if (stateHistory.length > 20) stateHistory.shift();
}

// Registration flags
let registrationCompleted = false;
let sessionSyncCompleted = false;
let childReadySent = false;
let registrationSent = false;

// Parent ready flag - CRITICAL GATE
let parentReady = false;



// Message tracking for deduplication
const processedMessages = new Set();
const MAX_PROCESSED_MESSAGES = 100;

// =============================================
// EXPORTED STATE VARIABLES
// =============================================
let currentUser = null;
let userSettings = null;
let currentSection = 'profile';
let unsavedChanges = false;
let blockedUsers = [];
let activeSessions = [];
let userContacts = [];
let userGroups = [];

let authReady = false;
let apiInitialized = false;
let backgroundTasksStarted = false;
let tokenReady = false;
let tokenAvailable = false;
let tokenInitialized = false;
let parentCommunicationReady = false;
let parentSessionReceived = false;
let parentOrigin = null;
let parentSessionData = null;
let sessionValidated = false;
let parentReadyReceived = false;
let moduleRegistered = false;
let connectionQuality = 'unknown';
let lastPongTime = 0;
let handshakeState = 'pending';

// Parent ready promise
let parentReadyResolve;
const parentReadyPromise = new Promise(res => {
    parentReadyResolve = res;
});

// Exposed flags for parent inspection
window.__SETTINGS_STATE__ = currentState;
window.__SETTINGS_SESSION_ACTIVE__ = false;
window.__SETTINGS_READY__ = isReady;

// =============================================
// CONSTANTS
// =============================================
const MAX_API_RETRIES = 0;
const AUTH_CHECK_INTERVAL = 30000;
const TOKEN_CHECK_INTERVAL = 1000;
const MAX_HANDSHAKE_ATTEMPTS = 1;
const HANDSHAKE_RETRY_INTERVAL = 1000;
const SESSION_SYNC_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 10000;
const PING_INTERVAL = 15000;
const PING_TIMEOUT = 5000;
const MAX_PING_FAILURES = 3;
const RECOVERY_BACKOFF_BASE = 1000;
const RECOVERY_MAX_BACKOFF = 30000;
const VISIBILITY_THROTTLE_DELAY = 5000;
const TOKEN_BINDING_NONCE_LENGTH = 16;

// Timer tracking for cleanup
const activeTimers = new Set();
const activeIntervals = new Set();

// =============================================
// ID GENERATION FUNCTIONS - MANDATORY
// =============================================
function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function isMessageDuplicate(messageId) {
    if (!messageId) return false;
    
    if (processedMessages.has(messageId)) {
        return true;
    }
    
    processedMessages.add(messageId);
    
    // Limit size
    if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
        const firstItem = processedMessages.values().next().value;
        processedMessages.delete(firstItem);
    }
    
    return false;
}

function safeSetTimeout(fn, delay) {
    const timer = setTimeout(() => {
        activeTimers.delete(timer);
        fn();
    }, delay);
    activeTimers.add(timer);
    return timer;
}

function safeSetInterval(fn, interval) {
    const timer = setInterval(fn, interval);
    activeIntervals.add(timer);
    return timer;
}

function clearAllTimers() {
    activeTimers.forEach(timer => clearTimeout(timer));
    activeTimers.clear();
    activeIntervals.forEach(interval => clearInterval(interval));
    activeIntervals.clear();
}

// =============================================
// SECURE ORIGIN VALIDATION
// =============================================
const TrustedOrigins = {
    _trusted: new Set(),
    
    init() {
        this.addTrustedOrigin(window.location.origin);
        this.addTrustedOrigin('http://localhost');
        this.addTrustedOrigin('http://127.0.0.1');
        this.addTrustedOrigin('null');
        
        try {
            if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
                this.addTrustedOrigin(window.location.ancestorOrigins[0]);
            }
        } catch (e) {}
        
        // Add Render domains
        this.addTrustedOrigin('https://moodchat-fy56.onrender.com');
        this.addTrustedOrigin('https://moodfronted.onrender.com');
    },
    
    addTrustedOrigin(origin) {
        if (origin) this._trusted.add(origin);
    },
    
    isValid(origin) {
        if (!origin) return false;
        if (origin === 'null') return true;
        if (this._trusted.has(origin)) return true;
        
        if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('onrender.com')) {
            this._trusted.add(origin);
            return true;
        }
        
        return false;
    },
    
    setParentOrigin(origin) {
        if (origin && this.isValid(origin)) {
            parentOrigin = origin;
            this.addTrustedOrigin(origin);
        }
    }
};

TrustedOrigins.init();

// =============================================
// VALIDATE CANONICAL MESSAGE SCHEMA
// =============================================
function validateCanonicalMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    
    // Required fields in canonical format
    const required = ['type', 'source', 'target', 'messageId', 'timestamp', 'payload'];
    
    for (const field of required) {
        if (!msg.hasOwnProperty(field)) {
            return false;
        }
    }
    
    // Type validations
    if (typeof msg.type !== 'string') return false;
    if (typeof msg.source !== 'string') return false;
    if (typeof msg.target !== 'string') return false;
    if (typeof msg.messageId !== 'string') return false;
    if (typeof msg.timestamp !== 'number') return false;
    
    // Target validation - MUST be 'parent' for outbound
    if (msg.target !== 'parent') {
        return false;
    }
    
    return true;
}

// =============================================
// CREATE CANONICAL MESSAGE - ENFORCES SCHEMA
// =============================================
function createCanonicalMessage(type, payload = {}, target = 'parent') {
    return {
        type: type,
        source: MODULE_NAME, // EXACT module name
        target: target,      // MUST be 'parent'
        messageId: generateMessageId(),
        requestId: generateRequestId(), // Always include for request-response
        timestamp: Date.now(),
        payload: payload
    };
}

// =============================================
// SAFE SEND TO PARENT - WITH QUEUE AND GATING
// =============================================
function sendMessage(message) {
    try {
        // Ensure message follows canonical format
        let canonicalMessage = message;
        
        // If message doesn't have required fields, convert it
        if (!message.type || !message.source || !message.messageId) {
            canonicalMessage = createCanonicalMessage(
                message.type || 'UNKNOWN',
                message.payload || message,
                'parent'
            );
        }
        
        // Double-check required fields
        if (!canonicalMessage.type || !canonicalMessage.source || !canonicalMessage.messageId || !canonicalMessage.timestamp) {
            return false;
        }
        
        // Ensure target is 'parent'
        canonicalMessage.target = 'parent';
        
        // Send to parent
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(canonicalMessage, '*');
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

// =============================================
// SAFE SEND WITH QUEUE - GATED BY PARENT_READY
// =============================================
function safeSend(msg) {
    // CRITICAL: Gate all messages by parentReady
    if (!parentReady) {
        messageQueue.push(msg);
        return true;
    }
    
    return sendMessage(msg);
}

// =============================================
// FLUSH QUEUE - Called after PARENT_READY
// =============================================
function flushQueue() {
    while (messageQueue.length) {
        sendMessage(messageQueue.shift());
    }
}

function throttledLog(level, message, data = null) {
    if (!DEBUG && level !== 'error' && level !== 'success' && level !== 'init' && level !== 'receive') {
        return;
    }
    
    switch(level) {
        case 'error': 
            console.error(`[${MODULE_NAME}] ❌ ${message}`, data || '');
            break;
        case 'warn': 
            console.warn(`[${MODULE_NAME}] ⚠️ ${message}`, data || '');
            break;
        case 'success': 
            console.log(`[${MODULE_NAME}] ✅ ${message}`, data || '');
            break;
        case 'init': 
            console.log(`[${MODULE_NAME}] 🚀 ${message}`, data || '');
            break;
        case 'receive':
            console.log(`[${MODULE_NAME}] 📥 ${message}`, data || '');
            break;
        case 'send':
            if (DEBUG) console.log(`[${MODULE_NAME}] 📤 ${message}`, data || '');
            break;
        default:
            if (DEBUG) console.debug(`[${MODULE_NAME}] 🔍 ${message}`, data || '');
    }
}

function debugLog(...args) { throttledLog('debug', args[0], args.slice(1)); }
function errorLog(...args) { throttledLog('error', args[0], args.slice(1)); }
function successLog(...args) { throttledLog('success', args[0], args.slice(1)); }
function sendLog(...args) { throttledLog('send', args[0], args.slice(1)); }
function receiveLog(...args) { throttledLog('receive', args[0], args.slice(1)); }
function initLog(...args) { throttledLog('init', args[0], args.slice(1)); }

// =============================================
// MESSAGE TRANSPORT - SINGLE SOURCE OF TRUTH
// =============================================
const MessageTransport = {
    _parentWindow: null,
    _parentOrigin: '*',
    _messageHandlers: new Map(),
    _enabled: true,
    _frameId: FRAME_ID,
    _silent: true,
    _listenerAttached: false,
    
    init() {
        initLog('MessageTransport initializing');
        this._detectParent();
        this._setupListener();
        successLog('MessageTransport initialized');
    },
    
    _detectParent() {
        try {
            if (window.parent && window.parent !== window) {
                this._parentWindow = window.parent;
                
                try {
                    if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
                        this._parentOrigin = window.location.ancestorOrigins[0];
                    } else {
                        this._parentOrigin = document.referrer ? new URL(document.referrer).origin : '*';
                    }
                } catch (e) {
                    this._parentOrigin = '*';
                }
                
                TrustedOrigins.setParentOrigin(this._parentOrigin);
                parentOrigin = this._parentOrigin;
            }
        } catch (error) {}
    },
    
    _setupListener() {
        if (this._listenerAttached) return;
        
        window.addEventListener('message', (event) => {
            // PERFORMANCE FIX: Move heavy logic out of listener
            setTimeout(() => this._handleIncoming(event), 0);
        });
        
        this._listenerAttached = true;
    },
    
    _handleIncoming(event) {
        try {
            // Origin validation
            if (!TrustedOrigins.isValid(event.origin)) {
                return;
            }
            
            const message = event.data;
            
            // Validate canonical schema
            if (!validateCanonicalMessage(message)) {
                return;
            }
            
            // Deduplicate by messageId
            if (isMessageDuplicate(message.messageId)) {
                return;
            }
            
            receiveLog(message.type);
            
            // Handle PARENT_READY - CRITICAL GATE
            if (message.type === 'PARENT_READY') {
                handleParentReady(message);
                return;
            }
            
            // Only process other messages after PARENT_READY
            if (!parentReady) {
                return;
            }
            
            // Handle MODULE_REGISTERED
            if (message.type === 'MODULE_REGISTERED') {
                handleModuleRegistered(message);
                return;
            }
            
            // Handle SESSION_SYNC
            if (message.type === 'SESSION_SYNC') {
                handleSessionSync(message);
                return;
            }
            
            // Handle SESSION_UPDATE
            if (message.type === 'SESSION_UPDATE') {
                handleSessionUpdate(message);
                return;
            }
            
            // Handle SESSION_INVALIDATED
            if (message.type === 'SESSION_INVALIDATED') {
                handleSessionInvalidated(message);
                return;
            }
            
            // Handle SETTINGS_LOAD_RESPONSE
            if (message.type === 'SETTINGS_LOAD_RESPONSE') {
                handleSettingsLoadResponse(message);
                return;
            }
            
            // Handle SETTINGS_UPDATED
            if (message.type === 'SETTINGS_UPDATED') {
                handleSettingsUpdated(message);
                return;
            }
            
            // Handle PROFILE_UPDATED
            if (message.type === 'PROFILE_UPDATED') {
                handleProfileUpdated(message);
                return;
            }
            
            // Handle PRIVACY_UPDATED
            if (message.type === 'PRIVACY_UPDATED') {
                handlePrivacyUpdated(message);
                return;
            }
            
            // Handle NOTIFICATIONS_UPDATED
            if (message.type === 'NOTIFICATIONS_UPDATED') {
                handleNotificationsUpdated(message);
                return;
            }
            
            // Handle LANGUAGE_CHANGED
            if (message.type === 'LANGUAGE_CHANGED') {
                handleLanguageChanged(message);
                return;
            }
            
            // Handle THEME_CHANGED
            if (message.type === 'THEME_CHANGED') {
                handleThemeChanged(message);
                return;
            }
            
            // Handle ACCOUNT_LOGGED_OUT
            if (message.type === 'ACCOUNT_LOGGED_OUT') {
                handleAccountLoggedOut(message);
                return;
            }
            
            // Handle BLOCKED_USERS_UPDATED
            if (message.type === 'BLOCKED_USERS_UPDATED') {
                handleBlockedUsersUpdated(message);
                return;
            }
            
            // Handle ACTIVE_SESSIONS_UPDATED
            if (message.type === 'ACTIVE_SESSIONS_UPDATED') {
                handleActiveSessionsUpdated(message);
                return;
            }
            
            // Handle USER_CONTACTS_UPDATED
            if (message.type === 'USER_CONTACTS_UPDATED') {
                handleUserContactsUpdated(message);
                return;
            }
            
            // Handle USER_GROUPS_UPDATED
            if (message.type === 'USER_GROUPS_UPDATED') {
                handleUserGroupsUpdated(message);
                return;
            }
            
            // Handle STORAGE_USAGE_UPDATED
            if (message.type === 'STORAGE_USAGE_UPDATED') {
                handleStorageUsageUpdated(message);
                return;
            }
            
            // Handle ERROR
            if (message.type === 'ERROR') {
                handleErrorMessage(message);
                return;
            }
            
            // Route to registered handlers
            const handlers = this._messageHandlers.get(message.type) || [];
            handlers.forEach(handler => {
                try {
                    handler(message);
                } catch (error) {
                    errorLog(`Error in handler for ${message.type}:`, error);
                }
            });
            
        } catch (error) {}
    },
    
    send(type, payload = {}) {
        try {
            if (!this._enabled) {
                return false;
            }
            
            // Create canonical message
            const message = createCanonicalMessage(type, payload, 'parent');
            
            sendLog(`${type} - MessageId: ${message.messageId}`);
            
            if (!this._parentWindow || this._parentWindow === window) {
                this._detectParent();
                if (!this._parentWindow || this._parentWindow === window) {
                    return false;
                }
            }
            
            // Use safeSend to gate by parentReady
            safeSend(message);
            
            return true;
            
        } catch (error) {
            return false;
        }
    },
    
    on(type, handler) {
        if (!this._messageHandlers.has(type)) {
            this._messageHandlers.set(type, []);
        }
        this._messageHandlers.get(type).push(handler);
        return () => this.off(type, handler);
    },
    
    off(type, handler) {
        const handlers = this._messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
    },
    
    disable() {
        this._enabled = false;
    },
    
    enable() {
        this._enabled = true;
    },
    
    getDiagnostics() {
        return {
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

MessageTransport.init();

// =============================================
// LIFECYCLE CONTROLLER - STRICT PARENT-CONTROLLED
// =============================================
const LifecycleController = {
    _parentReadyReceived: false,
    
    init() {
        initLog('LifecycleController initializing');
        this._setupMessageHandlers();
        
        // Start at INITIALIZING
        setState(LifecycleState.INITIALIZING, 'starting');
        
        // Initialize core components
        this._initializeComponents();
        
        successLog('LifecycleController initialized');
    },
    
    _initializeComponents() {
        // Load from localStorage while initializing
        loadFromLocalStorage();
        
        // After initialization, move to READY
        if (currentState === LifecycleState.INITIALIZING) {
            setState(LifecycleState.READY, 'initialization_complete');
            this._sendChildReady();
        }
    },
    
    _sendChildReady() {
        if (childReadySent) return;
        if (currentState !== LifecycleState.READY) return;
        
        childReadySent = true;
        
        // Use safeSend for CHILD_READY (will queue if parent not ready)
        // But CHILD_READY must be sent even if parent not ready yet
        const message = createCanonicalMessage('CHILD_READY', {
            module: MODULE_NAME,
            version: MODULE_VERSION,
            frameId: FRAME_ID,
            environment: IframeEnvironment.getEnvironment()
        }, 'parent');
        
        sendMessage(message); // Direct send - CHILD_READY bypasses queue
        
        setState(LifecycleState.WAIT_PARENT, 'child_ready_sent');
        initLog('CHILD_READY sent');
    },
    
    _setupMessageHandlers() {
        MessageTransport.on('PARENT_READY', (message) => {
            this._handleParentReady(message);
        });
        
        MessageTransport.on('MODULE_REGISTERED', (message) => {
            this._handleModuleRegistered(message);
        });
        
        MessageTransport.on('SESSION_SYNC', (message) => {
            this._handleSessionSync(message);
        });
        
        MessageTransport.on('SESSION_UPDATE', (message) => {
            this._handleSessionUpdate(message);
        });
        
        MessageTransport.on('SESSION_INVALIDATED', (message) => {
            this._handleSessionInvalidated(message);
        });
        
        MessageTransport.on('SETTINGS_LOAD_RESPONSE', (message) => {
            this._handleSettingsLoadResponse(message);
        });
        
        MessageTransport.on('SETTINGS_UPDATED', (message) => {
            this._handleSettingsUpdated(message);
        });
        
        MessageTransport.on('PROFILE_UPDATED', (message) => {
            handleProfileUpdated(message);
        });
        
        MessageTransport.on('PRIVACY_UPDATED', (message) => {
            handlePrivacyUpdated(message);
        });
        
        MessageTransport.on('NOTIFICATIONS_UPDATED', (message) => {
            handleNotificationsUpdated(message);
        });
        
        MessageTransport.on('LANGUAGE_CHANGED', (message) => {
            handleLanguageChanged(message);
        });
        
        MessageTransport.on('THEME_CHANGED', (message) => {
            handleThemeChanged(message);
        });
        
        MessageTransport.on('ACCOUNT_LOGGED_OUT', (message) => {
            handleAccountLoggedOut(message);
        });
        
        MessageTransport.on('BLOCKED_USERS_UPDATED', (message) => {
            handleBlockedUsersUpdated(message);
        });
        
        MessageTransport.on('ACTIVE_SESSIONS_UPDATED', (message) => {
            handleActiveSessionsUpdated(message);
        });
        
        MessageTransport.on('USER_CONTACTS_UPDATED', (message) => {
            handleUserContactsUpdated(message);
        });
        
        MessageTransport.on('USER_GROUPS_UPDATED', (message) => {
            handleUserGroupsUpdated(message);
        });
        
        MessageTransport.on('STORAGE_USAGE_UPDATED', (message) => {
            handleStorageUsageUpdated(message);
        });
        
        MessageTransport.on('ERROR', (message) => {
            handleErrorMessage(message);
        });
    },
    
    _handleParentReady(message) {
        if (currentState !== LifecycleState.WAIT_PARENT) return;
        if (this._parentReadyReceived) return;
        
        this._parentReadyReceived = true;
        parentReady = true; // CRITICAL: Set parentReady gate
        parentReadyReceived = true;
        parentCommunicationReady = true;
        
        receiveLog('PARENT_READY received');
        parentReadyResolve();
        
        setState(LifecycleState.ACTIVE, 'parent_ready_received');
        
        // Flush any queued messages
        flushQueue();
        
        // After activation, request settings
        this._requestSettingsLoad();
    },
    
    _handleModuleRegistered(message) {
        if (currentState !== LifecycleState.WAIT_PARENT && currentState !== LifecycleState.ACTIVE) return;
        if (registrationCompleted) return;
        
        registrationCompleted = true;
        moduleRegistered = true;
        
        receiveLog('MODULE_REGISTERED received');
    },
    
    _handleSessionSync(message) {
        if (currentState !== LifecycleState.ACTIVE) return;
        
        const sessionData = message.payload?.session || message.payload;
        if (!sessionData) return;
        
        const user = sessionData.user || sessionData;
        const expiry = sessionData.expiry || sessionData.expiresAt || (Date.now() + 3600000);
        
        updateSession(user, expiry);
        parentSessionData = { user, token: null, expiry };
        parentSessionReceived = true;
        sessionValidated = true;
        sessionSyncCompleted = true;
    },
    
    _handleSessionUpdate(message) {
        if (currentState !== LifecycleState.ACTIVE) return;
        
        const sessionData = message.payload?.session || message.payload;
        if (!sessionData) return;
        
        const user = sessionData.user || sessionData;
        const expiry = sessionData.expiry || sessionData.expiresAt;
        
        if (user) updateSession(user, expiry);
        
        updateUserUI();
    },
    
    _handleSessionInvalidated(message) {
        clearSession();
        parentSessionReceived = false;
        sessionValidated = false;
        sessionSyncCompleted = false;
        
        const event = new CustomEvent('userLoggedOut', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    },
    
    _requestSettingsLoad() {
        if (currentState !== LifecycleState.ACTIVE) return;
        
        MessageTransport.send('SETTINGS_LOAD_REQUEST', {});
    },
    
    _handleSettingsLoadResponse(message) {
        if (currentState !== LifecycleState.ACTIVE) return;
        
        const settingsData = message.payload?.settings || message.payload;
        if (settingsData) {
            userSettings = settingsData;
            
            SettingsStore.load({
                account: settingsData.profile || {},
                privacy: settingsData.privacy || {},
                notifications: settingsData.notifications || {},
                appearance: settingsData.appearance || {}
            });
            
            SafeStorage.setJSON('user_settings', userSettings);
            calculateStorageUsage();
            
            if (userSettings.appearance) {
                applyTheme(userSettings.appearance.theme);
            }
            
            dispatchSettingsLoadedEvent();
            
            MessageTransport.send('SETTINGS_READY', {});
            
            startBackgroundTasks();
        }
    },
    
    _handleSettingsUpdated(message) {
        if (currentState !== LifecycleState.ACTIVE) return;
        
        const settingsData = message.payload?.settings || message.payload;
        if (settingsData) {
            userSettings = settingsData;
            
            SettingsStore.load({
                account: settingsData.profile || {},
                privacy: settingsData.privacy || {},
                notifications: settingsData.notifications || {},
                appearance: settingsData.appearance || {}
            });
            
            SafeStorage.setJSON('user_settings', userSettings);
            calculateStorageUsage();
            
            if (settingsData.appearance?.theme) {
                applyTheme(settingsData.appearance.theme);
            }
            
            const event = new CustomEvent('settingsUpdated', {
                detail: { settings: settingsData, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    }
};

// =============================================
// API CORE GATEWAY - ROUTES THROUGH PARENT
// =============================================
const ApiCore = {
    _ready: false,
    _readyPromise: null,
    _readyResolvers: [],
    
    init() {
        initLog('API Gateway initializing');
        this._readyPromise = new Promise((resolve) => {
            this._readyResolvers.push(resolve);
        });
        
        // No timeouts - wait for activation
        return this;
    },
    
    isReady() {
        return this._ready && currentState === LifecycleState.ACTIVE;
    },
    
    whenReady() {
        return this._readyPromise || Promise.resolve();
    },
    
    async request(endpoint, options = {}) {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        const method = options.method || 'GET';
        
        try {
            const response = await new Promise((resolve) => {
                MessageTransport.send('API_REQUEST', {
                    endpoint: endpoint,
                    method: method,
                    data: options.body,
                    headers: options.headers,
                    requestId: requestId
                });
                
                // No timeout - wait for response via message
            });
            
            return response;
            
        } catch (error) {
            return {
                success: false,
                status: 'error',
                message: 'Network or server error',
                data: null
            };
        }
    },
    
    getDiagnostics() {
        return {
            ready: this._ready
        };
    }
}.init();

// =============================================
// SECURE API WRAPPER - ROUTES THROUGH PARENT
// =============================================
async function secureApiCall(endpoint, options = {}) {
    try {
        const response = await MessageTransport.send('API_REQUEST', {
            endpoint: endpoint,
            method: options.method || 'GET',
            data: options.body,
            options: options
        });
        
        return { success: true, data: response };
        
    } catch (error) {
        return {
            success: false,
            status: 'error',
            message: 'Request failed',
            data: null
        };
    }
}

// =============================================
// SAFE DATA ACCESS UTILITIES
// =============================================
function safeGet(data, path, defaultValue = null) {
    if (!data || typeof data !== 'object') return defaultValue;
    
    const parts = path.split('.');
    let current = data;
    
    for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return defaultValue;
        }
        current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
}

function safeArray(array, defaultValue = []) {
    return Array.isArray(array) ? array : defaultValue;
}

function safeObject(obj, defaultValue = {}) {
    return obj && typeof obj === 'object' ? obj : defaultValue;
}

// =============================================
// IFRAME ENVIRONMENT DETECTOR
// =============================================
const ENV_TYPES = {
    LOCAL_DEV: 'local_dev',
    RENDER_HOSTED: 'render_hosted',
    VPN_NETWORK: 'vpn_network',
    PRODUCTION: 'production',
    UNKNOWN: 'unknown'
};

const IframeEnvironment = {
    _environment: ENV_TYPES.UNKNOWN,
    _features: {
        hasSecureContext: false,
        hasCrypto: false,
        hasLocalStorage: false,
        hasServiceWorker: false,
        connectionType: 'unknown',
        effectiveBandwidth: 0,
        rtt: 0,
        isSandboxed: false,
        isIframe: false,
        parentOrigin: null,
        backendReachable: true
    },
    _detected: false,
    _backendUrl: 'https://moodchat-fy56.onrender.com',
    _frontendUrl: 'https://moodfronted.onrender.com',
    _detectionComplete: false,
    
    detect() {
        if (this._detected) return this.getInfo();
        
        try {
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            const isSecure = protocol === 'https:';
            
            this._features.isIframe = window.self !== window.top;
            
            try {
                localStorage.setItem('_test', 'test');
                localStorage.removeItem('_test');
                this._features.hasLocalStorage = true;
            } catch (e) {
                this._features.hasLocalStorage = false;
                this._features.isSandboxed = true;
            }
            
            this._features.hasCrypto = !!(window.crypto && window.crypto.subtle);
            this._features.hasSecureContext = window.isSecureContext || false;
            
            if (navigator.connection) {
                this._features.connectionType = navigator.connection.effectiveType || 'unknown';
                this._features.effectiveBandwidth = navigator.connection.downlink || 0;
                this._features.rtt = navigator.connection.rtt || 0;
            }
            
            if (hostname === 'localhost' || hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') || protocol === 'file:') {
                this._environment = ENV_TYPES.LOCAL_DEV;
            } else if (hostname.includes('onrender.com')) {
                this._environment = ENV_TYPES.RENDER_HOSTED;
            } else if (this._features.rtt > 300 || 
                      (this._features.connectionType === '4g' && this._features.rtt > 200) ||
                      navigator.connection?.saveData) {
                this._environment = ENV_TYPES.VPN_NETWORK;
            } else if (isSecure && hostname.includes('.')) {
                this._environment = ENV_TYPES.PRODUCTION;
            } else {
                this._environment = ENV_TYPES.UNKNOWN;
            }
            
            this._features.backendReachable = true;
            this._detected = true;
            this._detectionComplete = true;
            
        } catch (error) {
            this._environment = ENV_TYPES.UNKNOWN;
            this._detectionComplete = true;
            errorLog('Environment detection failed:', error);
        }
        
        return this.getInfo();
    },
    
    getInfo() {
        return {
            environment: this._environment,
            features: { ...this._features }
        };
    },
    
    getEnvironment() {
        return this._environment;
    },
    
    getBackendUrl() {
        return this._backendUrl;
    },
    
    getFrontendUrl() {
        return this._frontendUrl;
    },
    
    isVPN() {
        return this._environment === ENV_TYPES.VPN_NETWORK;
    },
    
    isLocal() {
        return this._environment === ENV_TYPES.LOCAL_DEV;
    },
    
    isProduction() {
        return this._environment === ENV_TYPES.PRODUCTION;
    },
    
    isRender() {
        return this._environment === ENV_TYPES.RENDER_HOSTED;
    },
    
    getAdjustedTimeout(baseTimeout) {
        if (this.isVPN()) return baseTimeout * 2;
        if (this.isLocal()) return baseTimeout * 1.5;
        return baseTimeout;
    },
    
    getAdjustedRetries(baseRetries) {
        return baseRetries;
    },
    
    isDetectionComplete() {
        return this._detectionComplete;
    }
};

IframeEnvironment.detect();

// =============================================
// SAFE STORAGE LAYER
// =============================================
const SafeStorage = {
    _memoryCache: new Map(),
    _storageAvailable: null,
    _encryptionKey: null,
    _prefix: 'knecta_',
    _quotaExceeded: false,
    _quotaWarningIssued: false,
    _fallbackMode: false,
    _initialized: false,
    _initPromise: null,
    
    init() {
        if (this._initialized) return this;
        if (this._initPromise) return this._initPromise;
        
        this._initPromise = new Promise((resolve) => {
            initLog('SafeStorage initializing');
            this._checkAvailability();
            this._generateKey();
            
            try {
                const cached = sessionStorage.getItem(`${this._prefix}memory_fallback`);
                if (cached) {
                    const data = JSON.parse(cached);
                    Object.entries(data).forEach(([key, value]) => {
                        this._memoryCache.set(key, value);
                    });
                }
            } catch (e) {}
            
            this._initialized = true;
            successLog('SafeStorage initialized - Type:', this.getStorageType());
            resolve(this);
        });
        
        return this._initPromise;
    },
    
    _checkAvailability() {
        if (this._storageAvailable !== null) return this._storageAvailable;
        
        try {
            const testKey = `${this._prefix}_test`;
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this._storageAvailable = true;
            this._fallbackMode = false;
        } catch (e) {
            this._storageAvailable = false;
            this._fallbackMode = true;
            
            try {
                const testKey = `${this._prefix}_test`;
                sessionStorage.setItem(testKey, 'test');
                sessionStorage.removeItem(testKey);
                this._storageAvailable = 'session';
            } catch (e2) {
                this._storageAvailable = false;
            }
            
            if (!this._quotaWarningIssued) {
                this._quotaWarningIssued = true;
            }
        }
        
        return this._storageAvailable;
    },
    
    _generateKey() {
        this._encryptionKey = `key_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    },
    
    get(key, fallback = null, useEncryption = false) {
        const prefixedKey = `${this._prefix}${key}`;
        
        if (this._memoryCache.has(prefixedKey)) {
            return this._memoryCache.get(prefixedKey);
        }
        
        if (this._storageAvailable) {
            try {
                let value = null;
                
                if (this._storageAvailable === true) {
                    value = localStorage.getItem(prefixedKey);
                } else if (this._storageAvailable === 'session') {
                    value = sessionStorage.getItem(prefixedKey);
                }
                
                if (value) {
                    if (useEncryption) {
                        try {
                            value = this._decrypt(value);
                        } catch (e) {}
                    }
                    
                    this._memoryCache.set(prefixedKey, value);
                    return value;
                }
            } catch (e) {}
        }
        
        return fallback;
    },
    
    _decrypt(value) {
        return value;
    },
    
    set(key, value, useEncryption = false) {
        const prefixedKey = `${this._prefix}${key}`;
        
        this._memoryCache.set(prefixedKey, value);
        
        if (this._storageAvailable) {
            try {
                let storageValue = value;
                if (useEncryption) {
                    storageValue = this._encrypt(String(value));
                }
                
                if (this._storageAvailable === true) {
                    localStorage.setItem(prefixedKey, String(storageValue));
                } else if (this._storageAvailable === 'session') {
                    sessionStorage.setItem(prefixedKey, String(storageValue));
                }
                
                this._quotaExceeded = false;
                return true;
                
            } catch (e) {
                if (e.name === 'QuotaExceededError' || e.code === 22) {
                    this._quotaExceeded = true;
                    if (!this._quotaWarningIssued) {
                        this._quotaWarningIssued = true;
                    }
                }
                return false;
            }
        }
        
        try {
            const cacheObj = {};
            this._memoryCache.forEach((val, k) => {
                cacheObj[k] = val;
            });
            sessionStorage.setItem(`${this._prefix}memory_fallback`, JSON.stringify(cacheObj));
        } catch (e) {}
        
        return true;
    },
    
    _encrypt(value) {
        return value;
    },
    
    remove(key) {
        const prefixedKey = `${this._prefix}${key}`;
        this._memoryCache.delete(prefixedKey);
        
        if (this._storageAvailable) {
            try {
                if (this._storageAvailable === true) {
                    localStorage.removeItem(prefixedKey);
                } else if (this._storageAvailable === 'session') {
                    sessionStorage.removeItem(prefixedKey);
                }
            } catch (e) {}
        }
    },
    
    getJSON(key, fallback = null, useEncryption = false) {
        const value = this.get(key, null, useEncryption);
        if (!value) return fallback;
        
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    },
    
    setJSON(key, value, useEncryption = false) {
        try {
            return this.set(key, JSON.stringify(value), useEncryption);
        } catch (e) {
            return false;
        }
    },
    
    clear(prefix = null) {
        const actualPrefix = prefix ? `${this._prefix}${prefix}` : this._prefix;
        
        if (prefix) {
            for (const key of this._memoryCache.keys()) {
                if (key.startsWith(actualPrefix)) {
                    this._memoryCache.delete(key);
                }
            }
        } else {
            this._memoryCache.clear();
        }
        
        if (this._storageAvailable) {
            try {
                const storage = this._storageAvailable === true ? localStorage : sessionStorage;
                for (let i = storage.length - 1; i >= 0; i--) {
                    const key = storage.key(i);
                    if (key && key.startsWith(actualPrefix)) {
                        storage.removeItem(key);
                    }
                }
            } catch (e) {}
        }
    },
    
    getAllKeys() {
        const keys = new Set();
        
        for (const key of this._memoryCache.keys()) {
            keys.add(key.substring(this._prefix.length));
        }
        
        if (this._storageAvailable) {
            try {
                const storage = this._storageAvailable === true ? localStorage : sessionStorage;
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (key && key.startsWith(this._prefix)) {
                        keys.add(key.substring(this._prefix.length));
                    }
                }
            } catch (e) {}
        }
        
        return Array.from(keys);
    },
    
    isQuotaExceeded() {
        return this._quotaExceeded;
    },
    
    isFallbackMode() {
        return this._fallbackMode;
    },
    
    getStorageType() {
        if (this._storageAvailable === true) return 'localStorage';
        if (this._storageAvailable === 'session') return 'sessionStorage';
        return 'memory';
    }
};

SafeStorage.init();

// =============================================
// COMPATIBILITY BRIDGE
// =============================================
const CompatibilityBridge = {
    _enabled: false,
    _reason: null,
    _legacyAPIs: new Map(),
    _messageTranslator: null,
    _parentProtocolVersion: null,
    _detected: false,
    
    detect() {
        if (this._detected) return this._enabled;
        
        if (IframeEnvironment._features.isSandboxed) {
            this.enable('sandboxed');
            return true;
        }
        
        if (!SafeStorage.getStorageType().includes('local')) {
            this.enable('storage_restricted');
            return true;
        }
        
        if (!window.crypto || !window.crypto.subtle) {
            this.enable('crypto_restricted');
            return true;
        }
        
        const isOldBrowser = !window.Promise || !window.fetch || !window.postMessage;
        if (isOldBrowser) {
            this.enable('old_browser');
            return true;
        }
        
        this._detected = true;
        return this._enabled;
    },
    
    enable(reason) {
        if (this._enabled) return;
        
        this._enabled = true;
        this._reason = reason;
    },
    
    _setupLegacyAPIs() {
        this._legacyAPIs.set('sendToParentLegacy', (type, payload) => {
            const legacyMsg = {
                type,
                ...payload,
                _legacy: true,
                timestamp: Date.now()
            };
            
            try {
                if (window.parent) {
                    window.parent.postMessage(legacyMsg, '*');
                }
            } catch (e) {}
        });
        
        this._legacyAPIs.set('receiveFromParentLegacy', (handler) => {
            const wrapper = (event) => {
                if (event.data && event.data._legacy) {
                    handler(event);
                }
            };
            window.addEventListener('message', wrapper);
            return () => window.removeEventListener('message', wrapper);
        });
    },
    
    _setupMessageTranslation() {
        this._messageTranslator = {
            toLegacy(canonical) {
                return {
                    type: canonical.type || canonical.payload?.type,
                    ...canonical.payload,
                    _legacy: true,
                    _originalId: canonical.messageId
                };
            },
            
            toCanonical(legacy) {
                return {
                    type: legacy.type,
                    source: legacy.source || 'unknown',
                    target: legacy.target || '*',
                    messageId: legacy.messageId || `legacy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    timestamp: legacy.timestamp || Date.now(),
                    payload: { ...legacy },
                    legacy: true
                };
            }
        };
    },
    
    _applyCompatibility() {
    },
    
    isEnabled() {
        return this._enabled;
    },
    
    getReason() {
        return this._reason;
    },
    
    translateOutgoing(message) {
        if (!this._enabled) return message;
        return this._messageTranslator?.toLegacy(message) || message;
    },
    
    translateIncoming(message) {
        if (!this._enabled) return message;
        if (message && message._legacy) {
            return this._messageTranslator?.toCanonical(message) || message;
        }
        return message;
    },
    
    getLegacyAPI(name) {
        return this._legacyAPIs.get(name);
    }
};

// =============================================
// ORIGIN ADAPTER (Updated to use TrustedOrigins)
// =============================================
const OriginAdapter = {
    _trustedOrigins: new Set(),
    _originPatterns: [],
    _dynamicTrust: new Map(),
    _lastValidation: 0,
    _validationCache: new Map(),
    _parentOrigin: null,
    _parentVerified: false,
    _backendOrigin: 'https://moodchat-fy56.onrender.com',
    _frontendOrigin: 'https://moodfronted.onrender.com',
    
    init() {
        initLog('OriginAdapter initializing');
        
        // Copy from TrustedOrigins
        TrustedOrigins._trusted.forEach(origin => {
            this._trustedOrigins.add(origin);
        });
        
        this.addTrustedOrigin(window.location.origin);
        this.addTrustedOrigin(this._backendOrigin);
        this.addTrustedOrigin(this._frontendOrigin);
        
        ['localhost', '127.0.0.1', '::1'].forEach(host => {
            [5500, 3000, 8080, 5000, 5173].forEach(port => {
                this.addTrustedOrigin(`http://${host}:${port}`);
                this.addTrustedOrigin(`https://${host}:${port}`);
            });
            this.addTrustedOrigin(`http://${host}`);
            this.addTrustedOrigin(`https://${host}`);
        });
        
        this.addOriginPattern(/^https?:\/\/.*\.onrender\.com$/);
        this.addOriginPattern(/^https?:\/\/.*\.render\.com$/);
        this.addOriginPattern(/^https?:\/\/(192\.168\..*|10\..*|172\.(1[6-9]|2[0-9]|3[0-1])\..*)$/);
        this.addOriginPattern(/^https?:\/\/.*\.knecta\.(app|chat)$/);
        this.addOriginPattern(/^https?:\/\/knecta\..*$/);
        
        successLog('OriginAdapter initialized');
    },
    
    addTrustedOrigin(origin) {
        if (origin && !this._trustedOrigins.has(origin)) {
            this._trustedOrigins.add(origin);
        }
    },
    
    addOriginPattern(pattern) {
        if (pattern && !this._originPatterns.includes(pattern)) {
            this._originPatterns.push(pattern);
        }
    },
    
    isTrusted(origin, options = {}) {
        return TrustedOrigins.isValid(origin);
    },
    
    _cacheValidation(origin, trusted) {
        this._validationCache.set(origin, {
            trusted,
            timestamp: Date.now()
        });
        
        if (this._validationCache.size > 100) {
            const oldest = Array.from(this._validationCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            this._validationCache.delete(oldest[0]);
        }
    },
    
    setParentOrigin(origin) {
        this._parentOrigin = origin;
        this._parentVerified = true;
        this.addTrustedOrigin(origin);
        TrustedOrigins.setParentOrigin(origin);
    },
    
    getParentOrigin() {
        return this._parentOrigin;
    },
    
    isParentVerified() {
        return this._parentVerified;
    },
    
    reset() {
        this._parentOrigin = null;
        this._parentVerified = false;
        this._validationCache.clear();
    },
    
    getBackendOrigin() {
        return this._backendOrigin;
    },
    
    getFrontendOrigin() {
        return this._frontendOrigin;
    },
    
    getDiagnostics() {
        return {
            trustedOriginsCount: this._trustedOrigins.size,
            patternsCount: this._originPatterns.length,
            parentVerified: this._parentVerified,
            parentOrigin: this._parentOrigin,
            cacheSize: this._validationCache.size
        };
    }
};

OriginAdapter.init();

// =============================================
// STARTUP GOVERNOR (Simplified - No timeouts)
// =============================================
const StartupGovernor = {
    _state: 'INIT',
    _lock: false,
    _attempts: 0,
    _maxAttempts: 1,
    _backoffMs: 1000,
    _initialized: false,
    _startTime: Date.now(),
    _stateHistory: [],
    _transitionListeners: new Set(),
    _silent: true,
    
    states: {
        INIT: 'INIT',
        WAIT_PARENT: 'WAIT_PARENT',
        ACTIVE: 'ACTIVE',
        READY: 'READY'
    },
    
    getState() { 
        return this._state; 
    },
    
    transition(newState, reason = '') {
        if (this._lock && newState !== this._state && newState !== 'FAILED') {
            return false;
        }
        
        const oldState = this._state;
        this._state = newState;
        
        if (!this._silent) {
            debugLog(`Governor: ${oldState} → ${newState} (${reason})`);
        }
        
        this._stateHistory.push({
            from: oldState,
            to: newState,
            reason,
            timestamp: Date.now()
        });
        
        if (this._stateHistory.length > 20) {
            this._stateHistory.shift();
        }
        
        this._transitionListeners.forEach(listener => {
            try {
                listener(oldState, newState, reason);
            } catch (e) {}
        });
        
        return true;
    },
    
    onTransition(listener) {
        this._transitionListeners.add(listener);
        return () => this._transitionListeners.delete(listener);
    },
    
    canProceed() {
        return this._state !== 'FAILED';
    },
    
    isStable() {
        return this._state === 'ACTIVE' || this._state === 'READY';
    },
    
    getDiagnostics() {
        return {
            state: this._state,
            attempts: this._attempts,
            uptime: Date.now() - this._startTime,
            history: this._stateHistory.slice(-5),
            locked: this._lock
        };
    },
    
    reset() {
        this._state = 'INIT';
        this._lock = false;
        this._attempts = 0;
        this._stateHistory = [];
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// =============================================
// IFRAME TRANSPORT (Wrapper for MessageTransport)
// =============================================
const IframeTransport = {
    _messageHandlers: new Map(),
    _frameId: FRAME_ID,
    _enabled: true,
    _parentWindow: null,
    _parentOrigin: '*',
    
    init() {
        initLog('IframeTransport initializing');
        this._detectParent();
        successLog('IframeTransport initialized');
    },
    
    _detectParent() {
        try {
            if (window.parent && window.parent !== window) {
                this._parentWindow = window.parent;
                
                try {
                    if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
                        this._parentOrigin = window.location.ancestorOrigins[0];
                    } else {
                        this._parentOrigin = document.referrer ? new URL(document.referrer).origin : '*';
                    }
                } catch (e) {
                    this._parentOrigin = '*';
                }
                
                OriginAdapter.setParentOrigin(this._parentOrigin);
                parentOrigin = this._parentOrigin;
            }
        } catch (error) {}
    },
    
    send(type, payload = {}) {
        return MessageTransport.send(type, payload);
    },
    
    on(type, handler) {
        return MessageTransport.on(type, handler);
    },
    
    off(type, handler) {
        MessageTransport.off(type, handler);
    },
    
    enable() {
        MessageTransport.enable();
        this._enabled = true;
    },
    
    disable() {
        MessageTransport.disable();
        this._enabled = false;
    },
    
    getDiagnostics() {
        return {
            ...MessageTransport.getDiagnostics()
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
        MessageTransport.setSilent(silent);
    }
};

IframeTransport.init();

// =============================================
// SESSION STORAGE
// =============================================
let session = {
    user: null,
    expiresAt: 0,
    version: 0
};

function updateSession(user, expiry, version) {
    if (user) {
        session.user = typeof user === 'object' ? { ...user } : user;
        currentUser = session.user;
        coreData.user = session.user;
    }
    
    if (expiry) {
        session.expiresAt = expiry;
    }
    
    if (version !== undefined) {
        session.version = version;
    }
    
    window.__SETTINGS_SESSION_ACTIVE__ = !!session.user;
}

function clearSession() {
    session = {
        user: null,
        expiresAt: 0,
        version: 0
    };
    currentUser = null;
    coreData.user = null;
    window.__SETTINGS_SESSION_ACTIVE__ = false;
}

function isSessionValid() {
    return !!session.user && session.expiresAt > Date.now();
}

// =============================================
// SETTINGS STORE
// =============================================
const SettingsStore = {
    account: {},
    privacy: {},
    notifications: {},
    appearance: {},
    _listeners: new Set(),
    
    load(settingsData) {
        if (settingsData.account) this.account = { ...settingsData.account };
        if (settingsData.privacy) this.privacy = { ...settingsData.privacy };
        if (settingsData.notifications) this.notifications = { ...settingsData.notifications };
        if (settingsData.appearance) this.appearance = { ...settingsData.appearance };
        
        this._notify('loaded', this.getAll());
        return true;
    },
    
    update(section, key, value) {
        if (!this[section]) return false;
        
        const oldValue = this[section][key];
        this[section][key] = value;
        
        this._notify('updated', {
            section,
            key,
            value,
            oldValue,
            all: this.getAll()
        });
        
        return true;
    },
    
    getAll() {
        return {
            account: { ...this.account },
            privacy: { ...this.privacy },
            notifications: { ...this.notifications },
            appearance: { ...this.appearance }
        };
    },
    
    getSection(section) {
        return this[section] ? { ...this[section] } : null;
    },
    
    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    },
    
    _notify(event, data) {
        this._listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (e) {}
        });
    }
};

// =============================================
// HEARTBEAT CLIENT - Only responds to parent
// =============================================
const HeartbeatClient = {
    _interval: null,
    _missedCount: 0,
    _maxMissed: 3,
    _running: false,
    _lastAck: 0,
    _listeners: new Set(),
    
    start() {
        // Heartbeat is parent-driven, we don't initiate
        this._running = true;
    },
    
    stop() {
        this._running = false;
        this._missedCount = 0;
        this.emit('stopped', {});
    },
    
    handleAck() {
        this._missedCount = 0;
        this._lastAck = Date.now();
    },
    
    isHealthy() {
        return this._missedCount < this._maxMissed;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        return {
            running: this._running,
            missedCount: this._missedCount,
            maxMissed: this._maxMissed,
            lastAck: this._lastAck,
            healthy: this.isHealthy()
        };
    },
    
    setSilent(silent) {
    }
};

// =============================================
// HEARTBEAT MANAGER (Alias for backward compatibility)
// =============================================
const HeartbeatManager = HeartbeatClient;

// =============================================
// SESSION CLIENT
// =============================================
const SessionClient = {
    _session: null,
    _sessionToken: null,
    _sessionExpiry: null,
    _sessionVersion: 0,
    _lastSync: 0,
    _syncInterval: null,
    _refreshTimer: null,
    _listeners: new Set(),
    _pendingAck: false,
    _sessionLock: false,
    _refreshAttempts: 0,
    _maxRefreshAttempts: 0,
    _offlineMode: false,
    _syncInProgress: false,
    _silent: true,
    
    init() {
        initLog('SessionClient initializing');
        successLog('SessionClient initialized');
        return this;
    },
    
    async sync() {
        if (currentState !== LifecycleState.ACTIVE) {
            return false;
        }
        
        if (this._syncInProgress) return false;
        
        this._syncInProgress = true;
        
        try {
            const response = await MessageTransport.send('SESSION_SYNC', {});
            
            if (response && response.payload && response.payload.session) {
                this.updateSession(
                    response.payload.session.user,
                    response.payload.session.token,
                    response.payload.session.expiry
                );
                this._syncInProgress = false;
                return true;
            }
            
            this._syncInProgress = false;
            return false;
        } catch (error) {
            this._syncInProgress = false;
            return false;
        }
    },
    
    updateSession(user, token, expiry) {
        if (user) {
            session.user = typeof user === 'object' ? { ...user } : user;
            currentUser = session.user;
            coreData.user = session.user;
        }
        
        if (token) {
            this._sessionToken = token;
        }
        
        if (expiry) {
            session.expiresAt = expiry;
            this._sessionExpiry = expiry;
        }
        
        session.version++;
        this._sessionVersion = session.version;
        this._lastSync = Date.now();
        
        this.emit('updated', {
            user: session.user,
            expiry: session.expiresAt,
            version: session.version
        });
        
        return true;
    },
    
    _scheduleRefresh() {
    },
    
    async refresh() {
        if (!this.isValid()) return false;
        
        try {
            const response = await MessageTransport.send('SESSION_REFRESH', {});
            
            if (response && response.payload && response.payload.session) {
                this.updateSession(
                    response.payload.session.user,
                    response.payload.session.token,
                    response.payload.session.expiry
                );
                return true;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getSession() {
        return session.user ? { ...session.user } : null;
    },
    
    getToken() {
        return this._sessionToken;
    },
    
    isValid() {
        return isSessionValid();
    },
    
    isExpired() {
        return !isSessionValid();
    },
    
    isOffline() {
        return false;
    },
    
    clear() {
        session = {
            user: null,
            expiresAt: 0,
            version: 0
        };
        currentUser = null;
        coreData.user = null;
        this._sessionToken = null;
        this._sessionExpiry = null;
        this._sessionVersion = 0;
        this.emit('cleared', {});
    },
    
    getDiagnostics() {
        return {
            hasSession: !!session.user,
            hasToken: !!this._sessionToken,
            expiry: session.expiresAt,
            version: session.version,
            lastSync: this._lastSync,
            refreshAttempts: this._refreshAttempts,
            isValid: isSessionValid(),
            isExpired: !isSessionValid(),
            offlineMode: false
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

SessionClient.init();

// =============================================
// RELIABILITY ENGINE (Simplified)
// =============================================
const ReliabilityEngine = {
    _quality: 'unknown',
    _enabled: true,
    _silent: true,
    _listeners: new Set(),
    
    init() {
        initLog('ReliabilityEngine initializing');
        successLog('ReliabilityEngine initialized');
    },
    
    getQuality() {
        return this._quality;
    },
    
    enable() {
        this._enabled = true;
    },
    
    disable() {
        this._enabled = false;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        return {
            quality: this._quality,
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ReliabilityEngine.init();

// =============================================
// RELIABILITY LAYER (Simplified)
// =============================================
const ReliabilityLayer = {
    _pendingMessages: new Map(),
    _maxRetries: 3,
    _baseTimeout: 5000,
    _backoffFactor: 1.5,
    _enabled: true,
    _silent: true,
    _listeners: new Set(),
    _messageCounter: 0,
    
    init() {
        initLog('ReliabilityLayer initializing');
        successLog('ReliabilityLayer initialized');
        return this;
    },
    
    send(message, options = {}) {
        return MessageTransport.send(
            message.action || message.type,
            message.data || message.payload || {},
            options
        );
    },
    
    acknowledge(id) {
        // Handled by MessageTransport
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getPendingCount() {
        return this._pendingMessages.size;
    },
    
    clearPending() {
        this._pendingMessages.forEach(entry => {
            clearTimeout(entry.timer);
            activeTimers.delete(entry.timer);
        });
        this._pendingMessages.clear();
    },
    
    getDiagnostics() {
        return {
            pendingCount: this._pendingMessages.size,
            maxRetries: this._maxRetries,
            baseTimeout: this._baseTimeout,
            enabled: this._enabled
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ReliabilityLayer.init();

// =============================================
// MESSAGE DISPATCHER (Simplified)
// =============================================
const MessageDispatcher = {
    _handlers: new Map(),
    _systemActions: new Set([
        'PARENT_READY',
        'SESSION_DATA',
        'MODULE_REGISTERED',
        'ACK',
        'HEARTBEAT_ACK'
    ]),
    _silent: true,
    
    init() {
        initLog('MessageDispatcher initializing');
        this._setupSystemHandlers();
        successLog('MessageDispatcher initialized');
        return this;
    },
    
    _setupSystemHandlers() {
        this.register('PARENT_READY', (message) => {
            parentReady = true;
            parentReadyReceived = true;
            parentCommunicationReady = true;
            
            console.log('[settings-core] 📥 PARENT_READY received');
        });
        
        this.register('SESSION_DATA', (message) => {
            if (!message.payload && !message.session) return;
            
            const sessionData = message.payload || message.session;
            const user = sessionData.user || sessionData;
            const expiry = sessionData.expiry || sessionData.expiresAt || (Date.now() + 3600000);
            
            updateSession(user, expiry);
            
            parentSessionData = { user, token: null, expiry };
            parentSessionReceived = true;
            sessionValidated = true;
        });
        
        this.register('MODULE_REGISTERED', (message) => {
            moduleRegistered = true;
        });
        
        this.register('ACK', (message) => {
            if (message.payload && message.payload.inResponseTo) {
                ReliabilityLayer.acknowledge(message.payload.inResponseTo);
            }
        });
        
        this.register('HEARTBEAT_ACK', (message) => {
            HeartbeatClient.handleAck();
        });
    },
    
    register(action, handler) {
        if (!this._handlers.has(action)) {
            this._handlers.set(action, []);
        }
        this._handlers.get(action).push(handler);
        return this;
    },
    
    unregister(action, handler) {
        const handlers = this._handlers.get(action);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
        return this;
    },
    
    dispatch(message) {
        if (!message || !message.action) return false;
        
        const handlers = this._handlers.get(message.action) || [];
        handlers.forEach(handler => {
            try {
                handler(message);
            } catch (e) {
                errorLog(`Error in handler for ${message.action}:`, e);
            }
        });
        
        return handlers.length > 0;
    },
    
    getDiagnostics() {
        return {
            systemActions: Array.from(this._systemActions),
            registeredActions: Array.from(this._handlers.keys())
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

MessageDispatcher.init();

// =============================================
// SECURITY VALIDATOR (Simplified)
// =============================================
const SecurityValidator = {
    _trustedOrigins: new Set(),
    _strictMode: true,
    _validationRules: new Map(),
    _silent: true,
    
    init() {
        initLog('SecurityValidator initializing');
        this._setupDefaultRules();
        successLog('SecurityValidator initialized');
        return this;
    },
    
    _setupDefaultRules() {
        this.addTrustedOrigin(window.location.origin);
        
        this.addRule('message_structure', (message) => {
            if (!message || typeof message !== 'object') return false;
            if (!message.id && !message.action && !message.type) return false;
            if (!message.source) return false;
            if (!message.timestamp) return false;
            return true;
        });
        
        this.addRule('action_valid', (message) => {
            if (!message.type && !message.action) return false;
            const action = message.type || message.action;
            if (typeof action !== 'string') return false;
            if (action.length > 50) return false;
            return true;
        });
        
        this.addRule('source_valid', (message) => {
            if (!message.source) return false;
            if (message.source !== 'parent' && message.source !== MODULE_NAME) return false;
            return true;
        });
        
        this.addRule('target_valid', (message) => {
            if (message.target && message.target !== FRAME_ID && message.target !== 'all' && message.target !== 'parent') return false;
            return true;
        });
    },
    
    addTrustedOrigin(origin) {
        if (origin) {
            this._trustedOrigins.add(origin);
        }
        return this;
    },
    
    addRule(name, validator) {
        this._validationRules.set(name, validator);
        return this;
    },
    
    removeRule(name) {
        this._validationRules.delete(name);
        return this;
    },
    
    validateMessage(message, origin) {
        if (!OriginAdapter.isTrusted(origin)) {
            if (!this._silent) debugLog(`Message rejected: untrusted origin ${origin}`);
            return false;
        }
        
        for (const [name, validator] of this._validationRules) {
            try {
                if (!validator(message)) {
                    if (!this._silent) debugLog(`Message rejected: rule ${name} failed`);
                    return false;
                }
            } catch (e) {
                if (!this._silent) debugLog(`Message validation error in rule ${name}:`, e);
                return false;
            }
        }
        
        return true;
    },
    
    validateAction(action) {
        if (!action || typeof action !== 'string') return false;
        if (action.length > 100) return false;
        
        const dangerousPatterns = ['<', '>', 'script', 'javascript:', 'data:'];
        for (const pattern of dangerousPatterns) {
            if (action.toLowerCase().includes(pattern)) return false;
        }
        
        return true;
    },
    
    sanitizeData(data) {
        if (!data) return data;
        
        if (typeof data === 'string') {
            return data
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
        
        if (Array.isArray(data)) {
            return data.map(item => this.sanitizeData(item));
        }
        
        if (typeof data === 'object' && data !== null) {
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                sanitized[key] = this.sanitizeData(value);
            }
            return sanitized;
        }
        
        return data;
    },
    
    getDiagnostics() {
        return {
            trustedOriginsCount: this._trustedOrigins.size,
            strictMode: this._strictMode,
            rulesCount: this._validationRules.size
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

SecurityValidator.init();

// =============================================
// PARENT CONNECTION MANAGER (Simplified)
// =============================================
const ParentConnectionManager = {
    _connectionState: 'disconnected',
    _parentWindow: null,
    _parentOrigin: null,
    _reconnectAttempts: 0,
    _maxReconnectAttempts: 3,
    _reconnectDelay: 1000,
    _connectionCheckInterval: null,
    _listeners: new Set(),
    _silent: true,
    
    init() {
        initLog('ParentConnectionManager initializing');
        this._detectParent();
        successLog('ParentConnectionManager initialized');
        return this;
    },
    
    _detectParent() {
        try {
            if (window.parent && window.parent !== window) {
                this._parentWindow = window.parent;
                
                try {
                    if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
                        this._parentOrigin = window.location.ancestorOrigins[0];
                    } else {
                        this._parentOrigin = document.referrer ? new URL(document.referrer).origin : '*';
                    }
                } catch (e) {
                    this._parentOrigin = '*';
                }
                
                OriginAdapter.setParentOrigin(this._parentOrigin);
                parentOrigin = this._parentOrigin;
                this._connectionState = 'connected';
                this.emit('connected', { origin: this._parentOrigin });
            } else {
                this._connectionState = 'no_parent';
                this.emit('no_parent', {});
            }
        } catch (error) {
            this._connectionState = 'error';
            this.emit('error', { error });
        }
    },
    
    isConnected() {
        return this._connectionState === 'connected' && 
               this._parentWindow && 
               this._parentWindow !== window;
    },
    
    getConnectionState() {
        return this._connectionState;
    },
    
    getParentOrigin() {
        return this._parentOrigin;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        return {
            connectionState: this._connectionState,
            parentOrigin: this._parentOrigin,
            reconnectAttempts: this._reconnectAttempts,
            maxReconnectAttempts: this._maxReconnectAttempts
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ParentConnectionManager.init();

// =============================================
// HANDSHAKE MANAGER (Simplified)
// =============================================
const HandshakeManager = {
    _handshakeState: 'INITIAL',
    _handshakeId: null,
    _handshakeAttempts: 0,
    _maxAttempts: 3,
    _backoffMs: 1000,
    _parentReady: false,
    _handshakeComplete: false,
    _listeners: new Set(),
    _inProgress: false,
    _silent: true,
    
    states: {
        INITIAL: 'INITIAL',
        WAITING_FOR_PARENT: 'WAITING_FOR_PARENT',
        REGISTERING: 'REGISTERING',
        REGISTERED: 'REGISTERED',
        ACTIVE: 'ACTIVE'
    },
    
    init() {
        initLog('HandshakeManager initializing');
        successLog('HandshakeManager initialized');
        return this;
    },
    
    getState() {
        return this._handshakeState;
    },
    
    transition(newState, reason = '') {
        const oldState = this._handshakeState;
        this._handshakeState = newState;
        
        if (!this._silent) {
            debugLog(`Handshake: ${oldState} → ${newState} (${reason})`);
        }
        
        this.emit('transition', { from: oldState, to: newState, reason });
        
        return true;
    },
    
    async startHandshake(options = {}) {
        // Handshake is now managed by LifecycleController
        return { success: true, cached: true };
    },
    
    async _registerModule() {
        return { success: true };
    },
    
    reset() {
        this._handshakeState = 'INITIAL';
        this._handshakeComplete = false;
        this._handshakeAttempts = 0;
        this._inProgress = false;
    },
    
    isComplete() {
        return this._handshakeComplete || registrationCompleted;
    },
    
    isInProgress() {
        return this._inProgress;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        return {
            state: this._handshakeState,
            attempts: this._handshakeAttempts,
            maxAttempts: this._maxAttempts,
            complete: this.isComplete(),
            inProgress: this._inProgress
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

HandshakeManager.init();

// =============================================
// IFRAME HANDSHAKE AUTHORITY (Alias for backward compatibility)
// =============================================
const IframeHandshakeAuthority = HandshakeManager;

// =============================================
// MODULE LIFECYCLE CONTROLLER (Simplified)
// =============================================
const ModuleLifecycleController = {
    _lifecycleState: 'stopped',
    _startTime: null,
    _listeners: new Set(),
    _silent: true,
    
    states: {
        STOPPED: 'stopped',
        STARTING: 'starting',
        RUNNING: 'running',
        STOPPING: 'stopping',
        ERROR: 'error'
    },
    
    init() {
        initLog('ModuleLifecycleController initializing');
        successLog('ModuleLifecycleController initialized');
        return this;
    },
    
    start() {
        if (this._lifecycleState === 'running') return this;
        
        this._lifecycleState = 'starting';
        this._startTime = Date.now();
        this.emit('starting', { timestamp: this._startTime });
        
        this._lifecycleState = 'running';
        this.emit('started', { timestamp: Date.now() });
        
        return this;
    },
    
    stop() {
        if (this._lifecycleState === 'stopped') return this;
        
        this._lifecycleState = 'stopping';
        this.emit('stopping', { timestamp: Date.now() });
        
        HeartbeatClient.stop();
        clearAllTimers();
        
        this._lifecycleState = 'stopped';
        this.emit('stopped', { timestamp: Date.now() });
        
        return this;
    },
    
    error(error) {
        this._lifecycleState = 'error';
        this.emit('error', { error, timestamp: Date.now() });
        return this;
    },
    
    getState() {
        return this._lifecycleState;
    },
    
    getUptime() {
        if (!this._startTime || this._lifecycleState !== 'running') return 0;
        return Date.now() - this._startTime;
    },
    
    isRunning() {
        return this._lifecycleState === 'running';
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        return {
            state: this._lifecycleState,
            uptime: this.getUptime(),
            startTime: this._startTime
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

ModuleLifecycleController.init();

// =============================================
// RECOVERY MANAGER (Simplified - No auto-recovery)
// =============================================
const RecoveryManager = {
    _attempts: 0,
    _maxAttempts: 3,
    _backoffMs: 1000,
    _recoveryInProgress: false,
    _recoveryTimer: null,
    _listeners: new Set(),
    _recoveryStrategies: new Map(),
    _silent: true,
    
    init() {
        initLog('RecoveryManager initializing');
        this._registerDefaultStrategies();
        successLog('RecoveryManager initialized');
        return this;
    },
    
    _registerDefaultStrategies() {
        this.registerStrategy('connection_lost', async () => {
            ParentConnectionManager._detectParent();
            
            if (ParentConnectionManager.isConnected()) {
                return true;
            }
            
            return false;
        });
        
        this.registerStrategy('heartbeat_failure', async () => {
            HeartbeatClient.stop();
            
            if (currentState === LifecycleState.ACTIVE) {
                HeartbeatClient.start();
                return HeartbeatClient.isHealthy();
            }
            
            return false;
        });
        
        this.registerStrategy('registration_failed', async () => {
            moduleRegistered = false;
            
            if (currentState !== LifecycleState.DEGRADED) {
                setState(LifecycleState.WAIT_PARENT, 'recovery_retry');
            }
            
            return moduleRegistered;
        });
        
        this.registerStrategy('session_expired', async () => {
            const response = await MessageTransport.send('SESSION_REFRESH', {});
            
            if (response && response.payload && response.payload.session) {
                updateSession(
                    response.payload.session.user,
                    response.payload.session.expiry
                );
                return isSessionValid();
            }
            
            return false;
        });
    },
    
    registerStrategy(name, strategy) {
        this._recoveryStrategies.set(name, strategy);
        return this;
    },
    
    async attemptRecovery(options = {}) {
        const {
            reason = 'unknown',
            force = false
        } = options;
        
        if (this._recoveryInProgress && !force) {
            return { success: false, error: 'recovery_in_progress' };
        }
        
        if (this._attempts >= this._maxAttempts && !force) {
            this.emit('max_attempts_reached', { reason, attempts: this._attempts });
            return { success: false, error: 'max_attempts_reached' };
        }
        
        this._recoveryInProgress = true;
        this._attempts++;
        
        this.emit('recovery_started', { reason, attempt: this._attempts });
        
        try {
            const strategy = this._recoveryStrategies.get(reason);
            
            if (strategy) {
                const result = await strategy();
                
                if (result) {
                    this._recoveryInProgress = false;
                    this._attempts = 0;
                    this.emit('recovery_succeeded', { reason });
                    return { success: true };
                }
            } else {
                const results = [];
                for (const [name, strat] of this._recoveryStrategies) {
                    try {
                        const result = await strat();
                        results.push({ strategy: name, success: result });
                        if (result) break;
                    } catch (e) {}
                }
                
                if (results.some(r => r.success)) {
                    this._recoveryInProgress = false;
                    this._attempts = 0;
                    this.emit('recovery_succeeded', { reason, strategies: results });
                    return { success: true, strategies: results };
                }
            }
            
            if (this._attempts < this._maxAttempts) {
                const backoffDelay = this._backoffMs * Math.pow(1.5, this._attempts - 1);
                
                this._recoveryTimer = safeSetTimeout(() => {
                    this.attemptRecovery({ reason, force });
                }, backoffDelay);
                activeTimers.add(this._recoveryTimer);
                
                this.emit('recovery_retry', { reason, attempt: this._attempts, delay: backoffDelay });
                return { success: false, retrying: true, attempt: this._attempts };
            } else {
                this._recoveryInProgress = false;
                this.emit('recovery_failed', { reason, attempts: this._attempts });
                return { success: false, error: 'recovery_failed' };
            }
        } catch (error) {
            this._recoveryInProgress = false;
            this.emit('recovery_error', { reason, error: error.message });
            return { success: false, error: error.message };
        }
    },
    
    reset() {
        this._attempts = 0;
        this._recoveryInProgress = false;
        
        if (this._recoveryTimer) {
            clearTimeout(this._recoveryTimer);
            activeTimers.delete(this._recoveryTimer);
            this._recoveryTimer = null;
        }
        
        this.emit('reset', {});
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        return {
            attempts: this._attempts,
            maxAttempts: this._maxAttempts,
            recoveryInProgress: this._recoveryInProgress,
            strategies: Array.from(this._recoveryStrategies.keys())
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

RecoveryManager.init();

// =============================================
// NAVIGATION GUARD (Keep original)
// =============================================
const NavigationGuard = {
    _enabled: true,
    _pendingNavigation: null,
    _listeners: new Set(),
    _guardedPaths: ['/settings', '/profile', '/account'],
    _silent: true,
    
    init() {
        initLog('NavigationGuard initializing');
        this._setupBeforeUnload();
        this._setupHistoryAPI();
        successLog('NavigationGuard initialized');
    },
    
    _setupBeforeUnload() {
        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges && this._enabled) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    },
    
    _setupHistoryAPI() {
        const originalPushState = history.pushState;
        history.pushState = (...args) => {
            if (this._shouldAllowNavigation(args[2])) {
                originalPushState.apply(history, args);
            }
        };
        
        const originalReplaceState = history.replaceState;
        history.replaceState = (...args) => {
            if (this._shouldAllowNavigation(args[2])) {
                originalReplaceState.apply(history, args);
            }
        };
        
        window.addEventListener('popstate', (e) => {
            if (!this._shouldAllowNavigation(document.location.pathname)) {
                history.pushState(null, '', this._pendingNavigation || document.location.pathname);
                e.preventDefault();
            }
        });
    },
    
    _shouldAllowNavigation(path) {
        if (!this._enabled) return true;
        if (currentState !== LifecycleState.ACTIVE) return true;
        
        const isGuarded = this._guardedPaths.some(p => path?.includes(p));
        
        if (isGuarded && unsavedChanges) {
            this._promptUser(path);
            return false;
        }
        
        return true;
    },
    
    _promptUser(targetPath) {
        const confirmed = confirm('You have unsaved changes. Are you sure you want to leave?');
        if (confirmed) {
            unsavedChanges = false;
            this._pendingNavigation = targetPath;
            window.location.href = targetPath;
        }
    },
    
    guardPath(path) {
        if (!this._guardedPaths.includes(path)) {
            this._guardedPaths.push(path);
        }
    },
    
    unguardPath(path) {
        const index = this._guardedPaths.indexOf(path);
        if (index !== -1) {
            this._guardedPaths.splice(index, 1);
        }
    },
    
    enable() {
        this._enabled = true;
    },
    
    disable() {
        this._enabled = false;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        return {
            enabled: this._enabled,
            guardedPaths: [...this._guardedPaths],
            pendingNavigation: this._pendingNavigation
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

NavigationGuard.init();

// =============================================
// UI FAILSAFE (Keep original - but only activates in ACTIVE state)
// =============================================
const UIFailsafe = {
    _enabled: true,
    _errorCount: 0,
    _maxErrors: 5,
    _recoveryTimer: null,
    _listeners: new Set(),
    _fallbackMode: false,
    _disabledElements: new Set(),
    _silent: true,
    
    init() {
        initLog('UIFailsafe initializing');
        this._setupErrorHandling();
        this._setupElementProtection();
        successLog('UIFailsafe initialized');
    },
    
    _setupErrorHandling() {
        window.addEventListener('error', (event) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            if (event.target && (event.target.tagName === 'BUTTON' || 
                                 event.target.tagName === 'INPUT' ||
                                 event.target.tagName === 'SELECT')) {
                this._handleUIError(event.target, event.error);
            }
        }, true);
        
        window.addEventListener('unhandledrejection', (event) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            this._handleUIError(null, event.reason);
        });
    },
    
    _setupElementProtection() {
        const criticalButtons = [
            'backToAppBtn',
            'saveSectionBtn',
            'resetSectionBtn',
            'settingsSearch'
        ];
        
        criticalButtons.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const originalClick = el.onclick;
                el.onclick = (e) => {
                    if (currentState !== LifecycleState.ACTIVE) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    if (this._fallbackMode && id !== 'backToAppBtn') {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }
                    if (originalClick) {
                        return originalClick.call(el, e);
                    }
                };
            }
        });
    },
    
    _handleUIError(element, error) {
        this._errorCount++;
        
        if (this._errorCount >= this._maxErrors && !this._fallbackMode) {
            this.enterFallbackMode();
        }
        
        if (element && element.id) {
            this._disabledElements.add(element.id);
            element.disabled = true;
            element.classList.add('failsafe-disabled');
        }
        
        this.emit('error', { element, error, count: this._errorCount });
    },
    
    enterFallbackMode() {
        if (this._fallbackMode) return;
        if (currentState !== LifecycleState.ACTIVE) return;
        
        this._fallbackMode = true;
        
        document.querySelectorAll('button, input, select, textarea').forEach(el => {
            if (el.id !== 'backToAppBtn' && !el.classList.contains('failsafe-protected')) {
                this._disabledElements.add(el.id || el.className);
                el.disabled = true;
                el.classList.add('failsafe-disabled');
            }
        });
        
        const container = document.getElementById('settingsContent');
        if (container) {
            const fallbackMsg = document.createElement('div');
            fallbackMsg.className = 'failsafe-message';
            fallbackMsg.style.cssText = `
                background: var(--warning-color);
                color: white;
                padding: 12px 20px;
                margin-bottom: 20px;
                border-radius: 8px;
                text-align: center;
                font-size: 14px;
            `;
            fallbackMsg.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i> Limited mode
                <button onclick="UIFailsafe.exitFallbackMode()" style="margin-left: 10px; padding: 4px 12px; background: white; color: var(--warning-color); border: none; border-radius: 4px; cursor: pointer;">
                    Retry
                </button>
            `;
            container.prepend(fallbackMsg);
        }
        
        this.emit('fallback', true);
        
        this._recoveryTimer = safeSetTimeout(() => {
            this.exitFallbackMode();
        }, 30000);
        activeTimers.add(this._recoveryTimer);
    },
    
    exitFallbackMode() {
        if (!this._fallbackMode) return;
        
        this._fallbackMode = false;
        this._errorCount = 0;
        
        this._disabledElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = false;
                el.classList.remove('failsafe-disabled');
            }
        });
        this._disabledElements.clear();
        
        const msg = document.querySelector('.failsafe-message');
        if (msg) msg.remove();
        
        if (this._recoveryTimer) {
            clearTimeout(this._recoveryTimer);
            activeTimers.delete(this._recoveryTimer);
        }
        
        this.emit('fallback', false);
    },
    
    protectElement(id) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('failsafe-protected');
        }
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    isInFallback() {
        return this._fallbackMode;
    },
    
    getDiagnostics() {
        return {
            enabled: this._enabled,
            fallbackMode: this._fallbackMode,
            errorCount: this._errorCount,
            maxErrors: this._maxErrors,
            disabledElements: Array.from(this._disabledElements)
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

UIFailsafe.init();

// =============================================
// MULTI-MODULE COORDINATOR (Keep original)
// =============================================
const MODULE_DISCOVERY = 'MODULE_DISCOVERY';
const MODULE_PRESENCE = 'MODULE_PRESENCE';
const ORIGIN_BIND = 'ORIGIN_BIND';

const MultiModuleCoordinator = {
    _modules: new Map(),
    _moduleId: `settings_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    _moduleType: MODULE_NAME, // Use exact module name
    _busListeners: new Map(),
    _sharedSession: null,
    _masterModule: false,
    _handshakeCoordinator: null,
    _silent: true,
    _broadcastChannel: null,
    
    init() {
        initLog('MultiModuleCoordinator initializing');
        if (!window.__MODULE_COORDINATOR__) {
            window.__MODULE_COORDINATOR__ = this;
            this._masterModule = true;
        }
        
        this.registerModule(this._moduleType, this._moduleId);
        
        window.addEventListener('message', (event) => {
            if (event.data && event.data._moduleBus) {
                this._handleModuleMessage(event.data);
            }
        });
        
        try {
            this._broadcastChannel = new BroadcastChannel('knecta_settings');
            this._broadcastChannel.onmessage = (event) => {
                if (event.data && event.data.type) {
                    this._handleBroadcastMessage(event.data);
                }
            };
        } catch (e) {}
        
        successLog('MultiModuleCoordinator initialized');
    },
    
    _handleBroadcastMessage(data) {
        if (data.type === 'SETTINGS_UPDATED' && data.source !== this._moduleId) {
            if (currentState === LifecycleState.ACTIVE) {
                MessageTransport.send('SETTINGS_LOAD_REQUEST', {});
            }
        }
        
        if (data.type === 'LANGUAGE_CHANGED' && data.source !== this._moduleId) {
            const event = new CustomEvent('languageChanged', {
                detail: { language: data.language, source: 'broadcast' }
            });
            window.dispatchEvent(event);
        }
    },
    
    registerModule(type, id) {
        this._modules.set(id, {
            type,
            id,
            lastSeen: Date.now(),
            ready: currentState === LifecycleState.ACTIVE,
            handshakeComplete: registrationCompleted,
            sessionValid: isSessionValid()
        });
        
        this._broadcast({
            _moduleBus: true,
            type: MODULE_PRESENCE,
            moduleType: type,
            moduleId: id,
            timestamp: Date.now()
        });
    },
    
    _handleModuleMessage(data) {
        const { type, sourceId, moduleType, target } = data;
        
        if (target && target !== this._moduleId && target !== 'all') return;
        
        switch (type) {
            case MODULE_PRESENCE:
                this._modules.set(sourceId, {
                    type: moduleType,
                    id: sourceId,
                    lastSeen: Date.now(),
                    ready: data.ready || false,
                    handshakeComplete: data.handshakeComplete || false,
                    sessionValid: data.sessionValid || false
                });
                break;
                
            case MODULE_DISCOVERY:
                this._broadcast({
                    _moduleBus: true,
                    type: MODULE_PRESENCE,
                    moduleType: this._moduleType,
                    moduleId: this._moduleId,
                    ready: currentState === LifecycleState.ACTIVE,
                    handshakeComplete: registrationCompleted,
                    sessionValid: isSessionValid(),
                    timestamp: Date.now(),
                    target: sourceId
                });
                break;
                
            default:
                const listeners = this._busListeners.get(type) || [];
                listeners.forEach(listener => {
                    try {
                        listener(data);
                    } catch (e) {}
                });
        }
    },
    
    _broadcast(message) {
        message.sourceId = this._moduleId;
        message.timestamp = Date.now();
        
        MessageTransport.send('MODULE_BROADCAST', {
            payload: message
        });
    },
    
    on(event, listener) {
        if (!this._busListeners.has(event)) {
            this._busListeners.set(event, []);
        }
        this._busListeners.get(event).push(listener);
    },
    
    emit(event, data) {
        this._broadcast({
            _moduleBus: true,
            type: event,
            ...data
        });
    },
    
    getModules() {
        const now = Date.now();
        this._modules.forEach((module, id) => {
            if (now - module.lastSeen > 60000) {
                this._modules.delete(id);
            }
        });
        
        return Array.from(this._modules.values());
    },
    
    hasModule(type) {
        return Array.from(this._modules.values()).some(m => m.type === type);
    },
    
    getSharedSession() {
        return session.user ? { user: session.user } : null;
    },
    
    setSharedSession(sessionData) {
    },
    
    getDiagnostics() {
        return {
            moduleId: this._moduleId,
            moduleType: this._moduleType,
            masterModule: this._masterModule,
            modulesCount: this._modules.size,
            modules: Array.from(this._modules.values())
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

MultiModuleCoordinator.init();

// =============================================
// UI BRIDGE
// =============================================
const UIBridge = {
    _listeners: new Map(),
    _domEvents: new Map(),
    _initialized: false,
    _silent: true,
    
    init() {
        if (this._initialized) return this;
        initLog('UIBridge initializing');
        this._setupDefaultListeners();
        this._initialized = true;
        successLog('UIBridge initialized');
        return this;
    },
    
    _setupDefaultListeners() {
        this.register('sendMessage', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            MessageTransport.send('SEND_MESSAGE', data);
        });
        
        this.register('updateProfile', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('profile', data.key, data.value).catch(() => {});
        });
        
        this.register('updatePrivacy', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('privacy', data.key, data.value).catch(() => {});
        });
        
        this.register('updateNotifications', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('notifications', data.key, data.value).catch(() => {});
        });
        
        this.register('updateAppearance', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('appearance', data.key, data.value).catch(() => {});
        });
        
        this.register('updateSecurity', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('security', data.key, data.value).catch(() => {});
        });
        
        this.register('updateChat', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('chat', data.key, data.value).catch(() => {});
        });
        
        this.register('updateFriends', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('friends', data.key, data.value).catch(() => {});
        });
        
        this.register('updateGroups', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('groups', data.key, data.value).catch(() => {});
        });
        
        this.register('updateCalls', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('calls', data.key, data.value).catch(() => {});
        });
        
        this.register('updateStatus', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('status', data.key, data.value).catch(() => {});
        });
        
        this.register('updateStorage', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('storage', data.key, data.value).catch(() => {});
        });
        
        this.register('updateMood', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('mood', data.key, data.value).catch(() => {});
        });
        
        this.register('updateAdvanced', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('advanced', data.key, data.value).catch(() => {});
        });
        
        this.register('updateBackup', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('backup', data.key, data.value).catch(() => {});
        });
        
        this.register('updateDanger', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            updateSetting('danger', data.key, data.value).catch(() => {});
        });
        
        this.register('logout', () => {
            if (currentState !== LifecycleState.ACTIVE) return;
            handleLogout().catch(() => {});
        });
        
        this.register('terminateSession', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            terminateSession(data.sessionId).catch(() => {});
        });
        
        this.register('terminateAllSessions', () => {
            if (currentState !== LifecycleState.ACTIVE) return;
            terminateAllSessions().catch(() => {});
        });
        
        this.register('unblockUser', (data) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            unblockUser(data.userId).catch(() => {});
        });
        
        this.register('clearChatCache', () => {
            if (currentState !== LifecycleState.ACTIVE) return;
            clearChatCache().catch(() => {});
        });
        
        this.register('clearMediaCache', () => {
            if (currentState !== LifecycleState.ACTIVE) return;
            clearMediaCache().catch(() => {});
        });
        
        this.register('saveSettings', () => {
            if (currentState !== LifecycleState.ACTIVE) return;
            saveSettings().catch(() => {});
        });
    },
    
    register(event, handler) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(handler);
        return this;
    },
    
    unregister(event, handler) {
        const handlers = this._listeners.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) handlers.splice(index, 1);
        }
        return this;
    },
    
    trigger(event, data) {
        const handlers = this._listeners.get(event) || [];
        handlers.forEach(handler => {
            try {
                handler(data);
            } catch (e) {
                errorLog(`Error in UI bridge handler for ${event}:`, e);
            }
        });
        return handlers.length > 0;
    },
    
    attachDomEvent(elementId, eventType, bridgeEvent, transform = null) {
        const element = document.getElementById(elementId);
        if (!element) return this;
        
        const handler = (domEvent) => {
            if (currentState !== LifecycleState.ACTIVE) return;
            const data = transform ? transform(domEvent) : { value: domEvent.target.value };
            this.trigger(bridgeEvent, data);
        };
        
        element.addEventListener(eventType, handler);
        
        if (!this._domEvents.has(elementId)) {
            this._domEvents.set(elementId, []);
        }
        this._domEvents.get(elementId).push({ eventType, handler, bridgeEvent });
        
        return this;
    },
    
    detachDomEvents(elementId) {
        const events = this._domEvents.get(elementId);
        if (!events) return this;
        
        const element = document.getElementById(elementId);
        if (element) {
            events.forEach(({ eventType, handler }) => {
                element.removeEventListener(eventType, handler);
            });
        }
        
        this._domEvents.delete(elementId);
        return this;
    },
    
    detachAll() {
        this._domEvents.forEach((events, elementId) => {
            this.detachDomEvents(elementId);
        });
        this._domEvents.clear();
        this._listeners.clear();
    },
    
    getDiagnostics() {
        return {
            listenersCount: this._listeners.size,
            domEventsCount: this._domEvents.size,
            initialized: this._initialized
        };
    },
    
    setSilent(silent) {
        this._silent = silent;
    }
};

// Initialize UIBridge immediately
UIBridge.init();

// =============================================
// MODULE CORE CONTROLLER (Keep original)
// =============================================
const ModuleCoreController = {
    _initialized: false,
    _startTime: null,
    _components: new Map(),
    _listeners: new Set(),
    _silent: true,
    
    init() {
        initLog('ModuleCoreController initializing');
        this._registerComponents();
        successLog('ModuleCoreController initialized');
        return this;
    },
    
    _registerComponents() {
        this._components.set('environment', IframeEnvironment);
        this._components.set('storage', SafeStorage);
        this._components.set('compatibility', CompatibilityBridge);
        this._components.set('origin', OriginAdapter);
        this._components.set('governor', StartupGovernor);
        this._components.set('transport', IframeTransport);
        this._components.set('heartbeat', HeartbeatClient);
        this._components.set('session', SessionClient);
        this._components.set('reliability', ReliabilityLayer);
        this._components.set('dispatcher', MessageDispatcher);
        this._components.set('security', SecurityValidator);
        this._components.set('connection', ParentConnectionManager);
        this._components.set('handshake', HandshakeManager);
        this._components.set('lifecycle', ModuleLifecycleController);
        this._components.set('recovery', RecoveryManager);
        this._components.set('ui', UIBridge);
        this._components.set('api', ApiCore);
        this._components.set('navigation', NavigationGuard);
        this._components.set('failsafe', UIFailsafe);
        this._components.set('coordinator', MultiModuleCoordinator);
        this._components.set('reliabilityEngine', ReliabilityEngine);
    },
    
    async start() {
        if (this._initialized) return this;
        
        this._startTime = Date.now();
        this.emit('starting', { timestamp: this._startTime });
        
        try {
            this.emit('component_starting', { component: 'environment' });
            IframeEnvironment.detect();
            
            this.emit('component_starting', { component: 'security' });
            SecurityValidator.init();
            
            this.emit('component_starting', { component: 'connection' });
            ParentConnectionManager.init();
            
            this.emit('component_starting', { component: 'dispatcher' });
            MessageDispatcher.init();
            
            this.emit('component_starting', { component: 'reliability' });
            ReliabilityLayer.init();
            
            this.emit('component_starting', { component: 'handshake' });
            HandshakeManager.init();
            
            this.emit('component_starting', { component: 'session' });
            SessionClient.init();
            
            this.emit('component_starting', { component: 'ui' });
            
            this.emit('component_starting', { component: 'lifecycle' });
            ModuleLifecycleController.start();
            
            this._initialized = true;
            this.emit('started', { timestamp: Date.now() });
            
        } catch (error) {
            this.emit('error', { error: error.message });
            ModuleLifecycleController.error(error);
        }
        
        return this;
    },
    
    stop() {
        ModuleLifecycleController.stop();
        HeartbeatClient.stop();
        clearAllTimers();
        this._initialized = false;
        this.emit('stopped', { timestamp: Date.now() });
        return this;
    },
    
    getComponent(name) {
        return this._components.get(name);
    },
    
    isInitialized() {
        return this._initialized;
    },
    
    on(event, listener) {
        this._listeners.add({ event, listener });
        return this;
    },
    
    off(event, listener) {
        this._listeners.forEach(item => {
            if (item.event === event && item.listener === listener) {
                this._listeners.delete(item);
            }
        });
        return this;
    },
    
    emit(event, data) {
        this._listeners.forEach(item => {
            if (item.event === event) {
                try {
                    item.listener(data);
                } catch (e) {}
            }
        });
    },
    
    getDiagnostics() {
        const diag = {
            initialized: this._initialized,
            uptime: this._startTime ? Date.now() - this._startTime : 0,
            components: {}
        };
        
        this._components.forEach((component, name) => {
            if (component.getDiagnostics) {
                diag.components[name] = component.getDiagnostics();
            }
        });
        
        return diag;
    },
    
    setSilent(silent) {
        this._silent = silent;
        this._components.forEach(component => {
            if (component.setSilent) {
                component.setSilent(silent);
            }
        });
    }
};

ModuleCoreController.init();

// =============================================
// CORE DATA STORAGE
// =============================================
const coreData = {
    friendsList: [],
    groupsList: [],
    chatHistory: [],
    notifications: [],
    settings: null,
    user: null
};

// =============================================
// EXPORT SETTINGS_MENU
// =============================================
const SETTINGS_MENU = [
    { id: 'profile', icon: 'fas fa-user', title: 'Profile' },
    { id: 'security', icon: 'fas fa-shield-alt', title: 'Security' },
    { id: 'privacy', icon: 'fas fa-lock', title: 'Privacy' },
    { id: 'chat', icon: 'fas fa-comments', title: 'Chat' },
    { id: 'friends', icon: 'fas fa-user-friends', title: 'Friends' },
    { id: 'groups', icon: 'fas fa-users', title: 'Groups' },
    { id: 'calls', icon: 'fas fa-phone', title: 'Calls' },
    { id: 'status', icon: 'fas fa-circle', title: 'Status' },
    { id: 'notifications', icon: 'fas fa-bell', title: 'Notifications' },
    { id: 'appearance', icon: 'fas fa-palette', title: 'Appearance' },
    { id: 'storage', icon: 'fas fa-database', title: 'Storage' },
    { id: 'mood', icon: 'fas fa-smile', title: 'Mood' },
    { id: 'advanced', icon: 'fas fa-cogs', title: 'Advanced' },
    { id: 'backup', icon: 'fas fa-cloud-upload-alt', title: 'Backup & Restore' },
    { id: 'danger', icon: 'fas fa-exclamation-triangle', title: 'Danger Zone', danger: true }
];

// =============================================
// PARENT MESSAGE TYPES
// =============================================
const PARENT_MESSAGE_TYPES = {
    READY: 'READY',
    ACK: 'ACK',
    SESSION: 'SESSION',
    DATA: 'DATA',
    ERROR: 'ERROR',
    HEARTBEAT: 'HEARTBEAT',
    STATUS: 'STATUS',
    HANDSHAKE: 'HANDSHAKE',
    SESSION_REQUEST: 'SESSION_REQUEST',
    SESSION_RESPONSE: 'SESSION_RESPONSE',
    SESSION_UPDATE: 'SESSION_UPDATE',
    CHILD_READY: 'CHILD_READY',
    PARENT_READY: 'PARENT_READY',
    AUTH_READY: 'AUTH_READY',
    AUTH_LOST: 'AUTH_LOST',
    LOGOUT: 'LOGOUT',
    REFRESH_DATA: 'REFRESH_DATA',
    UPDATE_DATA: 'UPDATE_DATA',
    CORE_READY: 'CORE_READY',
    IFRAME_AUTH_STATE: 'IFRAME_AUTH_STATE',
    IFRAME_AUTH_ERROR: 'IFRAME_AUTH_ERROR',
    CHILD_CLOSING: 'CHILD_CLOSING',
    
    PING: 'PING',
    PONG: 'PONG',
    
    SETTINGS_UPDATED: 'SETTINGS_UPDATED',
    SETTINGS_LOAD_REQUEST: 'SETTINGS_LOAD_REQUEST',
    SETTINGS_LOAD_RESPONSE: 'SETTINGS_LOAD_RESPONSE',
    SETTINGS_UPDATE_CONFIRMED: 'SETTINGS_UPDATE_CONFIRMED',
    SETTINGS_PROFILE_UPDATED: 'SETTINGS_PROFILE_UPDATED',
    SETTINGS_PRIVACY_UPDATED: 'SETTINGS_PRIVACY_UPDATED',
    SETTINGS_NOTIFICATIONS_UPDATED: 'SETTINGS_NOTIFICATIONS_UPDATED',
    SETTINGS_APPEARANCE_UPDATED: 'SETTINGS_APPEARANCE_UPDATED',
    SETTINGS_SECURITY_UPDATED: 'SETTINGS_SECURITY_UPDATED',
    SETTINGS_STORAGE_UPDATED: 'SETTINGS_STORAGE_UPDATED',
    SETTINGS_MOOD_UPDATED: 'SETTINGS_MOOD_UPDATED',
    USER_BLOCKED: 'USER_BLOCKED',
    USER_UNBLOCKED: 'USER_UNBLOCKED',
    SESSION_TERMINATED: 'SESSION_TERMINATED',
    ALL_SESSIONS_TERMINATED: 'ALL_SESSIONS_TERMINATED',
    PROFILE_PHOTO_UPDATED: 'PROFILE_PHOTO_UPDATED',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED',
    DATA_EXPORT_REQUESTED: 'DATA_EXPORT_REQUESTED',
    ACCOUNT_DELETION_REQUESTED: 'ACCOUNT_DELETION_REQUESTED',
    CACHE_CLEARED: 'CACHE_CLEARED'
};

// =============================================
// MESSAGE QUEUE
// =============================================
const messageQueue = [];

// =============================================
// RECEIVE FROM PARENT
// =============================================
function receiveFromParent(messageType, handler) {
    return MessageTransport.on(messageType, handler);
}

// =============================================
// LOAD FROM LOCAL STORAGE (CACHE ONLY)
// =============================================
async function loadFromLocalStorage() {
    try {
        const cachedUser = SafeStorage.getJSON('current_user', null);
        if (cachedUser) {
            currentUser = cachedUser;
            coreData.user = cachedUser;
            session.user = cachedUser;
            session.expiresAt = Date.now() + 3600000;
            session.version = 1;
            console.log('[settings-core] ✅ Loaded cached user:', cachedUser.displayName);
        }
        
        const savedSettings = SafeStorage.getJSON('user_settings', null);
        if (savedSettings) {
            userSettings = savedSettings;
            coreData.settings = savedSettings;
            
            SettingsStore.load({
                account: savedSettings.profile || {},
                privacy: savedSettings.privacy || {},
                notifications: savedSettings.notifications || {},
                appearance: savedSettings.appearance || {}
            });
        } else {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            
            SettingsStore.load({
                account: DEFAULT_SETTINGS.profile || {},
                privacy: DEFAULT_SETTINGS.privacy || {},
                notifications: DEFAULT_SETTINGS.notifications || {},
                appearance: DEFAULT_SETTINGS.appearance || {}
            });
        }
        
        Object.keys(DEFAULT_SETTINGS).forEach(section => {
            if (!userSettings[section]) {
                userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
            }
        });
        
        calculateStorageUsage();
        return true;
    } catch (error) {
        console.log('[settings-core] ⚠️ Error loading from localStorage:', error);
        userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        coreData.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        
        SettingsStore.load({
            account: DEFAULT_SETTINGS.profile || {},
            privacy: DEFAULT_SETTINGS.privacy || {},
            notifications: DEFAULT_SETTINGS.notifications || {},
            appearance: DEFAULT_SETTINGS.appearance || {}
        });
        return false;
    }
}

// =============================================
// APPLY THEME
// =============================================
function applyTheme(theme) {
    if (!theme) return;
    if (currentState !== LifecycleState.ACTIVE) return;
    
    try {
        const root = document.documentElement;
        
        if (theme === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } else {
            root.setAttribute('data-theme', theme);
        }
        
        const event = new CustomEvent('themeApplied', {
            detail: { theme, timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

function dispatchSettingsLoadedEvent() {
    try {
        const event = new CustomEvent('settingsLoaded', {
            detail: {
                settings: userSettings,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
    } catch (error) {}
}

function disableSettingsControls() {
    const event = new CustomEvent('settingsControlsDisabled', {
        detail: {
            timestamp: Date.now(),
            reason: 'no_session'
        }
    });
    window.dispatchEvent(event);
}

// =============================================
// CALCULATE STORAGE USAGE
// =============================================
function calculateStorageUsage() {
    try {
        if (!userSettings || !userSettings.storage) return 0;
        const chatSize = userSettings.storage.storageBreakdown?.chats || 0;
        const mediaSize = userSettings.storage.storageBreakdown?.media || 0;
        const otherSize = userSettings.storage.storageBreakdown?.other || 0;
        userSettings.storage.totalStorageUsed = chatSize + mediaSize + otherSize;
        userSettings.storage.chatCacheSize = chatSize;
        userSettings.storage.mediaCacheSize = mediaSize;
        userSettings.storage.otherCacheSize = otherSize;
        return userSettings.storage.totalStorageUsed;
    } catch (error) {
        return 0;
    }
}

// =============================================
// FORMAT STORAGE SIZE
// =============================================
function formatStorageSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// =============================================
// GET MOOD TEXT
// =============================================
function getMoodText(mood) {
    const moodTexts = {
        neutral: 'Neutral',
        happy: 'Happy',
        calm: 'Calm',
        energetic: 'Energetic',
        focused: 'Focused',
        relaxed: 'Relaxed',
        stressed: 'Stressed',
        tired: 'Tired',
        excited: 'Excited'
    };
    return moodTexts[mood] || 'Neutral';
}

// =============================================
// GET MOOD COLOR
// =============================================
function getMoodColor(mood) {
    const colors = {
        neutral: '#A9A9A9',
        happy: '#FFD700',
        calm: '#4A90E2',
        energetic: '#FF6B6B',
        focused: '#7B68EE',
        relaxed: '#4ECDC4',
        stressed: '#FF8C00',
        tired: '#808080',
        excited: '#FF1493'
    };
    return colors[mood] || '#A9A9A9';
}

// =============================================
// LOAD USER DATA
// =============================================
async function loadUserData() {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/user/profile', { method: 'GET' });
        if (response.success && response.data) {
            const user = response.data.user || response.data;
            if (user) {
                currentUser = user;
                coreData.user = user;
                SafeStorage.setJSON('current_user', currentUser);
                updateUserUI();
            }
        }
    } catch (error) {}
}

// =============================================
// LOAD ACTIVE SESSIONS
// =============================================
async function loadActiveSessions() {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/auth/sessions', { method: 'GET' });
        if (response.success && response.data) {
            activeSessions = response.data.sessions || response.data || [];
            
            const event = new CustomEvent('activeSessionsLoaded', {
                detail: { sessions: activeSessions, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {}
}

// =============================================
// LOAD BLOCKED USERS
// =============================================
async function loadBlockedUsers() {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/users/blocked', { method: 'GET' });
        if (response.success && response.data) {
            blockedUsers = response.data.blockedUsers || response.data || [];
            
            const event = new CustomEvent('blockedUsersLoaded', {
                detail: { users: blockedUsers, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {}
}

// =============================================
// LOAD USER CONTACTS
// =============================================
async function loadUserContacts() {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/contacts', { method: 'GET' });
        if (response.success && response.data) {
            userContacts = response.data.contacts || response.data || [];
            
            const event = new CustomEvent('userContactsLoaded', {
                detail: { contacts: userContacts, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {}
}

// =============================================
// LOAD USER GROUPS
// =============================================
async function loadUserGroups() {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) return;
    
    try {
        const response = await ApiCore.request('/api/group', { method: 'GET' });
        if (response.success && response.data) {
            userGroups = response.data.groups || response.data || [];
            coreData.groupsList = userGroups;
            
            const event = new CustomEvent('userGroupsLoaded', {
                detail: { groups: userGroups, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
        }
    } catch (error) {}
}

// =============================================
// UPDATE SETTING
// =============================================
async function updateSetting(section, key, value) {
    if (currentState !== LifecycleState.ACTIVE) {
        throw new Error('Settings not ready');
    }
    
    if (!isSessionValid()) {
        throw new Error('No valid session');
    }
    
    const oldValue = userSettings[section]?.[key];
    if (!userSettings[section]) {
        userSettings[section] = {};
    }
    userSettings[section][key] = value;
    unsavedChanges = true;
    
    SettingsStore.update(section, key, value);
    
    const optimisticEvent = new CustomEvent('settingUpdatedOptimistic', {
        detail: { section, key, value, timestamp: Date.now() }
    });
    window.dispatchEvent(optimisticEvent);
    
    try {
        const response = await ApiCore.request('/api/settings', {
            method: 'POST',
            body: { settings: userSettings }
        });
        
        if (response.success) {
            unsavedChanges = false;
            
            SafeStorage.setJSON('user_settings', userSettings);
            coreData.settings = userSettings;
            
            if (section === 'appearance' && key === 'theme') {
                applyTheme(value);
            }
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.SETTINGS_UPDATED, {
                section: section,
                key: key,
                value: value,
                settings: userSettings
            });
            
            const successEvent = new CustomEvent('settingUpdated', {
                detail: { section, key, value, timestamp: Date.now() }
            });
            window.dispatchEvent(successEvent);
            
            return true;
        } else {
            if (userSettings[section]) {
                userSettings[section][key] = oldValue;
            }
            unsavedChanges = false;
            
            SettingsStore.update(section, key, oldValue);
            
            const rollbackEvent = new CustomEvent('settingUpdateFailed', {
                detail: { section, key, timestamp: Date.now() }
            });
            window.dispatchEvent(rollbackEvent);
            
            throw new Error('API update failed');
        }
    } catch (error) {
        if (userSettings[section]) {
            userSettings[section][key] = oldValue;
        }
        unsavedChanges = false;
        
        SettingsStore.update(section, key, oldValue);
        
        throw error;
    }
}

// =============================================
// SAVE ALL SETTINGS
// =============================================
async function saveSettings() {
    if (currentState !== LifecycleState.ACTIVE) {
        throw new Error('Settings not ready');
    }
    
    if (!isSessionValid()) {
        throw new Error('No valid session');
    }
    
    try {
        SafeStorage.setJSON('user_settings', userSettings);
        coreData.settings = userSettings;
        
        const response = await ApiCore.request('/api/settings', {
            method: 'POST',
            body: { settings: userSettings }
        });
        
        if (response.success) {
            unsavedChanges = false;
            
            if (userSettings.appearance) {
                applyTheme(userSettings.appearance.theme || 'auto');
            }
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.SETTINGS_UPDATED, {
                settings: userSettings
            });
            
            const event = new CustomEvent('settingsSaved', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        throw new Error('API update failed');
    } catch (error) {
        throw error;
    }
}

// =============================================
// HANDLE LOGOUT
// =============================================
async function handleLogout() {
    if (currentState !== LifecycleState.ACTIVE) {
        return false;
    }
    
    if (!isSessionValid()) {
        return false;
    }
    
    try {
        const response = await ApiCore.request('/api/auth/logout', {
            method: 'POST'
        });
        
        if (response.success) {
            await MessageTransport.send('SESSION_INVALIDATED', {});
            
            clearSession();
            parentSessionReceived = false;
            sessionValidated = false;
            
            HeartbeatClient.stop();
            disableSettingsControls();
            
            setState(LifecycleState.WAIT_PARENT, 'user_logout');
            
            const event = new CustomEvent('userLoggedOut', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

// =============================================
// TERMINATE SESSION
// =============================================
async function terminateSession(sessionId) {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/auth/terminate-session', {
            method: 'POST',
            body: { sessionId }
        });
        
        if (response.success) {
            await loadActiveSessions();
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.SESSION_TERMINATED, {
                sessionId
            });
            
            const event = new CustomEvent('sessionTerminated', {
                detail: { sessionId, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// TERMINATE ALL SESSIONS
// =============================================
async function terminateAllSessions() {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/auth/terminate-all-sessions', {
            method: 'POST'
        });
        
        if (response.success) {
            await loadActiveSessions();
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.ALL_SESSIONS_TERMINATED, {});
            
            const event = new CustomEvent('allSessionsTerminated', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// UNBLOCK USER
// =============================================
async function unblockUser(userId) {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/users/unblock', {
            method: 'POST',
            body: { userId }
        });
        
        if (response.success) {
            await loadBlockedUsers();
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.USER_UNBLOCKED, {
                userId
            });
            
            const event = new CustomEvent('userUnblocked', {
                detail: { userId, timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// CLEAR CHAT CACHE
// =============================================
async function clearChatCache() {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/storage/clear-chat-cache', {
            method: 'POST'
        });
        
        if (response.success && userSettings.storage) {
            userSettings.storage.storageBreakdown.chats = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.media || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
            calculateStorageUsage();
            unsavedChanges = true;
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.CACHE_CLEARED, {
                cacheType: 'chat'
            });
            
            const event = new CustomEvent('chatCacheCleared', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// CLEAR MEDIA CACHE
// =============================================
async function clearMediaCache() {
    if (currentState !== LifecycleState.ACTIVE || !isSessionValid()) {
        throw new Error('Not ready');
    }
    
    try {
        const response = await ApiCore.request('/api/storage/clear-media-cache', {
            method: 'POST'
        });
        
        if (response.success && userSettings.storage) {
            userSettings.storage.storageBreakdown.media = 0;
            userSettings.storage.totalStorageUsed = 
                (userSettings.storage.storageBreakdown.chats || 0) + 
                (userSettings.storage.storageBreakdown.other || 0);
            calculateStorageUsage();
            unsavedChanges = true;
            
            await MessageTransport.send(PARENT_MESSAGE_TYPES.CACHE_CLEARED, {
                cacheType: 'media'
            });
            
            const event = new CustomEvent('mediaCacheCleared', {
                detail: { timestamp: Date.now() }
            });
            window.dispatchEvent(event);
            
            return true;
        }
        
        return false;
    } catch (error) {
        throw error;
    }
}

// =============================================
// UPDATE USER UI
// =============================================
function updateUserUI() {
    try {
        const event = new CustomEvent('userUIUpdate', {
            detail: {
                user: currentUser,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// INITIALIZE UI
// =============================================
function initializeUI() {
    if (currentState !== LifecycleState.ACTIVE) return false;
    
    try {
        const event = new CustomEvent('coreUIInitialized', {
            detail: {
                timestamp: Date.now(),
                mode: isSessionValid() ? 'authenticated' : 'no_session',
                user: currentUser,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SECURE FETCH WRAPPER
// =============================================
async function secureFetchWrapper(endpoint, method = 'GET', data = null, options = {}) {
    try {
        const response = await MessageTransport.send('API_REQUEST', {
            endpoint: endpoint,
            method: method,
            data: data,
            options: options
        });
        
        if (response && response.payload) {
            return response.payload.data || response.payload;
        }
        
        return { success: false, data: null };
        
    } catch (error) {
        return {
            success: false,
            status: 'error',
            message: 'Request failed',
            data: null
        };
    }
}

// =============================================
// SAFE LOAD USER DATA
// =============================================
async function safeLoadUserData() {
    if (!isSessionValid() && currentState !== LifecycleState.ACTIVE) {
        return null;
    }
    
    try {
        if (session.user) {
            currentUser = session.user;
            coreData.user = session.user;
            SafeStorage.setJSON('current_user', currentUser);
            return currentUser;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD SETTINGS
// =============================================
async function safeLoadSettings() {
    if (!isSessionValid() && currentState !== LifecycleState.ACTIVE) {
        return null;
    }
    
    try {
        const response = await secureFetchWrapper('/api/settings', 'GET');
        const settingsData = response?.data || response?.settings || null;
        
        if (settingsData) {
            userSettings = settingsData;
            coreData.settings = settingsData;
            
            SettingsStore.load({
                account: settingsData.profile || {},
                privacy: settingsData.privacy || {},
                notifications: settingsData.notifications || {},
                appearance: settingsData.appearance || {}
            });
            
            Object.keys(DEFAULT_SETTINGS).forEach(section => {
                if (!userSettings[section]) {
                    userSettings[section] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[section]));
                }
            });
            
            SafeStorage.setJSON('user_settings', userSettings);
            calculateStorageUsage();
            return userSettings;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD BLOCKED USERS
// =============================================
async function safeLoadBlockedUsers() {
    if (!isSessionValid() && currentState !== LifecycleState.ACTIVE) return null;
    
    try {
        const response = await secureFetchWrapper('/api/users/blocked', 'GET');
        const blockedData = response?.data?.blockedUsers || response?.blockedUsers || [];
        if (blockedData) {
            blockedUsers = blockedData;
            return blockedUsers;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD ACTIVE SESSIONS
// =============================================
async function safeLoadActiveSessions() {
    if (!isSessionValid() && currentState !== LifecycleState.ACTIVE) return null;
    
    try {
        const response = await secureFetchWrapper('/api/auth/sessions', 'GET');
        const sessionsData = response?.data?.sessions || response?.sessions || [];
        if (sessionsData) {
            activeSessions = sessionsData;
            return activeSessions;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD USER CONTACTS
// =============================================
async function safeLoadUserContacts() {
    if (!isSessionValid() && currentState !== LifecycleState.ACTIVE) return null;
    
    try {
        const response = await secureFetchWrapper('/api/contacts', 'GET');
        const contactsData = response?.data?.contacts || response?.contacts || [];
        if (contactsData) {
            userContacts = contactsData;
            return userContacts;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// SAFE LOAD USER GROUPS
// =============================================
async function safeLoadUserGroups() {
    if (!isSessionValid() && currentState !== LifecycleState.ACTIVE) return null;
    
    try {
        const response = await secureFetchWrapper('/api/group', 'GET');
        const groupsData = response?.data?.groups || response?.groups || [];
        if (groupsData) {
            userGroups = groupsData;
            coreData.groupsList = groupsData;
            return userGroups;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// =============================================
// MAKE SAFE REQUEST
// =============================================
async function makeSafeRequest(endpoint, method = 'GET', data = null, options = {}) {
    if (!isSessionValid() && currentState !== LifecycleState.ACTIVE) {
        throw new Error('Authentication not available');
    }
    return await secureFetchWrapper(endpoint, method, data, options);
}

// =============================================
// NOTIFY PARENT AUTH STATE
// =============================================
function notifyParentAuthState(hasAuth) {
    try {
        MessageTransport.send('IFRAME_AUTH_STATE', {
            hasAuth: hasAuth,
            iframeId: FRAME_ID
        });
    } catch (error) {}
}

// =============================================
// NOTIFY PARENT AUTH ERROR
// =============================================
let authErrorNotified = false;
function notifyParentAuthError() {
    if (authErrorNotified) return;
    try {
        MessageTransport.send('IFRAME_AUTH_ERROR', {
            iframeId: FRAME_ID,
            message: 'Authentication required',
            tokenExpired: true
        });
        authErrorNotified = true;
    } catch (error) {}
}

// =============================================
// GET SECURE TOKEN - ALWAYS FROM PARENT
// =============================================
function getSecureToken() {
    return null;
}

// =============================================
// WAIT FOR TOKEN - ALWAYS FALSE
// =============================================
async function waitForToken(timeout = 10000) {
    return false;
}

// =============================================
// START PASSIVE AUTH MONITORING - DISABLED
// =============================================
function startPassiveAuthMonitoring() {}

// =============================================
// START BACKGROUND TASKS
// =============================================
function startBackgroundTasks() {
    try {
        if (backgroundTasksStarted) return;
        if (!isSessionValid() && currentState !== LifecycleState.ACTIVE) return;
        
        backgroundTasksStarted = true;
        
        Promise.allSettled([
            loadUserData(),
            loadActiveSessions(),
            loadBlockedUsers(),
            loadUserContacts(),
            loadUserGroups()
        ]).then(() => {}).catch(() => {});
    } catch (error) {
        backgroundTasksStarted = false;
    }
}

// =============================================
// CHECK AUTHENTICATION STATE
// =============================================
function checkAuthenticationState() {
    return isSessionValid();
}

// =============================================
// VERIFY PARENT PRESENCE
// =============================================
function verifyParentPresence() {
    return OriginAdapter.isParentVerified();
}

// =============================================
// SETUP SECURE MESSAGING CHANNEL
// =============================================
function setupSecureMessagingChannel() {
    return true;
}

// =============================================
// START PARENT HANDSHAKE
// =============================================
function startParentHandshake(options = {}) {
    return HandshakeManager.startHandshake(options);
}

// =============================================
// SEND MESSAGE TO PARENT - ALIAS (UPDATED TO USE SAFESEND)
// =============================================
function sendMessageToParent(message) {
    return safeSend(message);
}

// =============================================
// RESET UI FOR LOGOUT
// =============================================
function resetUIForLogout() {
    try {
        clearSession();
        parentSessionReceived = false;
        sessionValidated = false;
        parentReady = false;
        parentReadyReceived = false;
        parentCommunicationReady = false;
        
        if (currentState === LifecycleState.ACTIVE) {
            setState(LifecycleState.WAIT_PARENT, 'ui_logout');
        }
        
        HeartbeatClient.stop();
        
        const event = new CustomEvent('uiResetForLogout', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
        
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SHOW RECONNECTION STATE
// =============================================
function showReconnectionState() {
    try {
        const event = new CustomEvent('coreReconnecting', {
            detail: {
                timestamp: Date.now(),
                state: currentState,
                connectionQuality: connectionQuality,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// BOOTSTRAP IFRAME
// =============================================
async function bootstrapIframe() {
    try {
        IframeEnvironment.detect();
        CompatibilityBridge.detect();
        OriginAdapter.init();
        await loadFromLocalStorage();
        
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// WAIT FOR SESSION
// =============================================
async function waitForSession(timeout = 10000) {
    return new Promise((resolve) => {
        if (isSessionValid()) {
            resolve(true);
            return;
        }
        const startTime = Date.now();
        const checkInterval = safeSetInterval(() => {
            try {
                if (isSessionValid()) {
                    clearInterval(checkInterval);
                    activeIntervals.delete(checkInterval);
                    clearTimeout(timeoutId);
                    activeTimers.delete(timeoutId);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkInterval);
                    activeIntervals.delete(checkInterval);
                    resolve(false);
                }
            } catch (error) {
                clearInterval(checkInterval);
                activeIntervals.delete(checkInterval);
                resolve(false);
            }
        }, 100);
        activeIntervals.add(checkInterval);
        const timeoutId = safeSetTimeout(() => {
            clearInterval(checkInterval);
            activeIntervals.delete(checkInterval);
            resolve(false);
        }, timeout);
        activeTimers.add(timeoutId);
    });
}

// =============================================
// INITIALIZE BASIC UI
// =============================================
function initializeBasicUI() {
    try {
        if (!userSettings) {
            userSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            coreData.settings = userSettings;
        }
        const event = new CustomEvent('basicUIReady', {
            detail: {
                timestamp: Date.now(),
                state: currentState,
                environment: IframeEnvironment.getEnvironment()
            }
        });
        window.dispatchEvent(event);
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// SETUP BASIC EVENT LISTENERS
// =============================================
function setupBasicEventListeners() {
    try {
        const backToAppBtn = document.getElementById('backToAppBtn');
        if (backToAppBtn) {
            const handler = () => {
                if (unsavedChanges) {
                    const event = new CustomEvent('confirmNavigation', {
                        detail: {
                            message: 'You have unsaved changes. Are you sure you want to leave?',
                            callback: () => {
                                MessageTransport.send('CHILD_CLOSING', {
                                    childId: FRAME_ID,
                                    unsavedChanges: true
                                });
                            }
                        }
                    });
                    window.dispatchEvent(event);
                } else {
                    MessageTransport.send('CHILD_CLOSING', {
                        childId: FRAME_ID
                    });
                }
            };
            backToAppBtn.addEventListener('click', handler);
        }
        
        window.addEventListener('beforeunload', (e) => {
            if (unsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// START TOKEN MONITORING - DISABLED
// =============================================
function startTokenMonitoring() {}

// =============================================
// CHECK TOKEN AVAILABILITY - DISABLED
// =============================================
function checkTokenAvailability() {}

// =============================================
// NOTIFY TOKEN READY - DISABLED
// =============================================
function notifyTokenReady() {}

// =============================================
// NOTIFY TOKEN LOST - DISABLED
// =============================================
function notifyTokenLost() {}

// =============================================
// GET HEALTH METRICS
// =============================================
function getHealthMetrics() {
    return {
        uptime: Date.now() - (stateHistory[0]?.timestamp || Date.now()),
        state: currentState,
        sessionValid: isSessionValid(),
        heartbeatHealthy: HeartbeatClient.isHealthy(),
        parentVerified: OriginAdapter.isParentVerified(),
        ready: isReady,
        environment: IframeEnvironment.getEnvironment()
    };
}

// =============================================
// GET CORE DIAGNOSTICS
// =============================================
function getCoreDiagnostics() {
    return DiagnosticsAgent.getFullReport();
}

// =============================================
// FORCE RECOVERY
// =============================================
function forceRecovery() {
    console.log('[settings-core] Forcing recovery');
    RecoveryManager.attemptRecovery({ reason: 'manual', force: true });
}

// =============================================
// ON READY CALLBACK
// =============================================
const readyCallbacks = [];

function onReady(callback) {
    if (isReady) {
        callback();
    } else {
        readyCallbacks.push(callback);
    }
}

function executeReadyCallbacks() {
    readyCallbacks.forEach(cb => {
        try {
            cb();
        } catch (e) {}
    });
    readyCallbacks.length = 0;
}

// =============================================
// SET SILENT MODE FUNCTION
// =============================================
function setSilentMode(silent = !DEBUG) {
    CONSOLE_NOISE_SUPPRESSED = silent;
    ModuleCoreController.setSilent(silent);
    StartupGovernor.setSilent(silent);
    IframeTransport.setSilent(silent);
    HeartbeatClient.setSilent(silent);
    MessageTransport.setSilent(silent);
    
    if (DEBUG && !silent) {
        console.log('[settings-core] 🔇 Silent mode disabled');
    }
}

// =============================================
// SHUTDOWN CORE FUNCTION
// =============================================
function shutdownCore() {
    try {
        ModuleLifecycleController.stop();
        HeartbeatClient.stop();
        clearAllTimers();
        
        MessageTransport.send('SHUTDOWN', {
            reason: 'normal_shutdown'
        });
        
        currentState = LifecycleState.INITIALIZING;
        isReady = false;
        initializationInProgress = false;
        parentReady = false;
        parentReadyReceived = false;
        parentCommunicationReady = false;
        parentSessionReceived = false;
        sessionValidated = false;
        authReady = false;
        tokenReady = false;
        tokenAvailable = false;
        backgroundTasksStarted = false;
        clearSession();
        
        window.__SETTINGS_STATE__ = currentState;
        window.__SETTINGS_SESSION_ACTIVE__ = false;
        window.__SETTINGS_READY__ = false;
        
        stateHistory = [];
        
        if (DEBUG) {
            console.log('[settings-core] ✅ Shutdown complete');
        }
        return true;
        
    } catch (error) {
        if (DEBUG) {
            console.error('[settings-core] ❌ Shutdown error:', error);
        }
        return false;
    }
}

// =============================================
// INITIALIZE CORE - MAIN ENTRY POINT (UPDATED LIFECYCLE)
// =============================================
let initializationPromise = null;
let initializationInProgress = false;
let coreError = null;

async function initializeCore(options = {}) {
    if (initializationPromise) {
        return initializationPromise;
    }
    
    if (currentState !== LifecycleState.INITIALIZING) {
        return { success: true, state: currentState };
    }
    
    initializationPromise = (async () => {
        initializationInProgress = true;
        coreError = null;
        
        const {
            debug = DEBUG
        } = options;
        
        if (debug) {
            DEBUG_ENABLED = true;
        }
        
        try {
            await ModuleCoreController.start();
            
            await loadFromLocalStorage();
            
            // Setup message handlers
            setupMessageHandlers();
            
            // Start lifecycle controller (will move through INITIALIZING -> READY -> WAIT_PARENT)
            LifecycleController.init();
            
            // Wait for parent ready via promise (no timeout)
            await parentReadyPromise;
            
            initializationInProgress = false;
            initializationPromise = null;
            isReady = true;
            executeReadyCallbacks();
            
            return { 
                success: true, 
                state: currentState, 
                authenticated: isSessionValid() 
            };
            
        } catch (error) {
            coreError = error;
            initializationInProgress = false;
            initializationPromise = null;
            
            return {
                success: false,
                state: currentState,
                error: error.message
            };
        }
    })();
    
    return initializationPromise;
}

// =============================================
// SETUP MESSAGE HANDLERS
// =============================================
function setupMessageHandlers() {
    IframeTransport._messageHandlers.clear();
    
    IframeTransport.on('MODULE_REGISTERED', handleModuleRegistered);
    IframeTransport.on('PARENT_READY', handleParentReady);
    IframeTransport.on('SESSION_ACTIVE', handleSessionActive);
    IframeTransport.on('SESSION_RESPONSE', handleSessionResponse);
    IframeTransport.on('SESSION_UPDATE', handleSessionUpdate);
    IframeTransport.on('SESSION_NULL', handleSessionNull);
    IframeTransport.on('SESSION_REFRESHED', handleSessionRefreshed);
    IframeTransport.on('SESSION_INVALIDATED', handleSessionInvalidated);
    IframeTransport.on('SETTINGS_LOAD_RESPONSE', handleSettingsLoadResponse);
    IframeTransport.on('SETTINGS_UPDATE_CONFIRMED', handleSettingsUpdateConfirmed);
    IframeTransport.on('SETTINGS_UPDATED', handleSettingsUpdatedBroadcast);
    IframeTransport.on('ERROR', handleErrorMessage);
    
    IframeTransport.on('PROFILE_UPDATED', handleProfileUpdated);
    IframeTransport.on('PRIVACY_UPDATED', handlePrivacyUpdated);
    IframeTransport.on('NOTIFICATIONS_UPDATED', handleNotificationsUpdated);
    IframeTransport.on('LANGUAGE_CHANGED', handleLanguageChanged);
    IframeTransport.on('THEME_CHANGED', handleThemeChanged);
    IframeTransport.on('ACCOUNT_LOGGED_OUT', handleAccountLoggedOut);
    IframeTransport.on('BLOCKED_USERS_UPDATED', handleBlockedUsersUpdated);
    IframeTransport.on('ACTIVE_SESSIONS_UPDATED', handleActiveSessionsUpdated);
    IframeTransport.on('USER_CONTACTS_UPDATED', handleUserContactsUpdated);
    IframeTransport.on('USER_GROUPS_UPDATED', handleUserGroupsUpdated);
    IframeTransport.on('STORAGE_USAGE_UPDATED', handleStorageUsageUpdated);
}

// =============================================
// MESSAGE HANDLERS (Keep original)
// =============================================
function handleModuleRegistered(message) {
    // Handled by LifecycleController
}

function handleParentReady(message) {
    // Handled by LifecycleController
}

function handleSessionActive(message) {
    // Handled by LifecycleController
}

function handleSessionResponse(message) {
    // Handled by LifecycleController
}

function handleSessionUpdate(message) {
    // Handled by LifecycleController
}

function handleSessionNull() {
    // Handled by LifecycleController
}

function handleSessionRefreshed(message) {
    // Handled by LifecycleController
}

function handleSessionInvalidated(message) {
    // Handled by LifecycleController
}

function handleSettingsLoadResponse(message) {
    // Handled by LifecycleController
}

function handleSettingsUpdateConfirmed(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        const event = new CustomEvent('settingsUpdateConfirmed', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleSettingsUpdatedBroadcast(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        const event = new CustomEvent('settingsUpdatedBroadcast', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleErrorMessage(message) {
    errorLog('Error from parent:', message.payload || message);
}

function handleProfileUpdated(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        const event = new CustomEvent('profileUpdated', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handlePrivacyUpdated(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        const event = new CustomEvent('privacyUpdated', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleNotificationsUpdated(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        const event = new CustomEvent('notificationsUpdated', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleLanguageChanged(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        const event = new CustomEvent('languageChanged', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleThemeChanged(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        const event = new CustomEvent('themeChanged', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleAccountLoggedOut(message) {
    clearSession();
    const event = new CustomEvent('accountLoggedOut', {
        detail: message.payload || {}
    });
    window.dispatchEvent(event);
}

function handleBlockedUsersUpdated(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        blockedUsers = message.payload.blockedUsers || blockedUsers;
        const event = new CustomEvent('blockedUsersUpdated', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleActiveSessionsUpdated(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        activeSessions = message.payload.sessions || activeSessions;
        const event = new CustomEvent('activeSessionsUpdated', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleUserContactsUpdated(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        userContacts = message.payload.contacts || userContacts;
        const event = new CustomEvent('userContactsUpdated', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleUserGroupsUpdated(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload) {
        userGroups = message.payload.groups || userGroups;
        coreData.groupsList = userGroups;
        const event = new CustomEvent('userGroupsUpdated', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

function handleStorageUsageUpdated(message) {
    if (currentState === LifecycleState.ACTIVE && message.payload && userSettings) {
        if (message.payload.chatCacheSize !== undefined) {
            userSettings.storage.chatCacheSize = message.payload.chatCacheSize;
        }
        if (message.payload.mediaCacheSize !== undefined) {
            userSettings.storage.mediaCacheSize = message.payload.mediaCacheSize;
        }
        if (message.payload.totalStorageUsed !== undefined) {
            userSettings.storage.totalStorageUsed = message.payload.totalStorageUsed;
        }
        calculateStorageUsage();
        const event = new CustomEvent('storageUsageUpdated', {
            detail: message.payload
        });
        window.dispatchEvent(event);
    }
}

// =============================================
// DIAGNOSTICS AGENT
// =============================================
const DiagnosticsAgent = {
    _enabled: true,
    _logBuffer: [],
    _maxBuffer: 500,
    _startTime: Date.now(),
    _metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        handshakes: 0,
        handshakeFailures: 0,
        sessionUpdates: 0,
        sessionFailures: 0,
        pings: 0,
        pongs: 0,
        acks: 0,
        errors: 0
    },
    _stateSnapshots: [],
    
    enable(debug = false) {
        this._enabled = true;
        if (debug) {
            window.__SETTINGS_DEBUG__ = true;
            DEBUG_ENABLED = true;
        }
        window.__getDiagnostics = () => this.getFullReport();
    },
    
    disable() {
        this._enabled = false;
    },
    
    log(level, message, data = null) {
        if (!this._enabled) return;
        if (!DEBUG && level !== 'error' && level !== 'init' && level !== 'success') return;
        
        const entry = {
            level,
            message,
            data: data ? (typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : String(data)) : null,
            timestamp: Date.now(),
            timeStr: new Date().toISOString().slice(11, 23),
            state: currentState,
            environment: IframeEnvironment.getEnvironment()
        };
        
        this._logBuffer.push(entry);
        
        if (this._logBuffer.length > this._maxBuffer) {
            this._logBuffer.shift();
        }
    },
    
    track(event, details = {}) {
        if (!this._enabled) return;
        
        if (this._metrics.hasOwnProperty(event)) {
            this._metrics[event]++;
        }
        
        this._stateSnapshots.push({
            event,
            details,
            timestamp: Date.now(),
            state: currentState,
            sessionValid: isSessionValid(),
            environment: IframeEnvironment.getEnvironment()
        });
        
        if (this._stateSnapshots.length > 50) {
            this._stateSnapshots.shift();
        }
    },
    
    getMetrics() {
        return {
            ...this._metrics,
            uptime: Date.now() - this._startTime,
            environment: IframeEnvironment.getEnvironment(),
            compatibility: CompatibilityBridge.isEnabled()
        };
    },
    
    getFullReport() {
        return {
            timestamp: Date.now(),
            state: {
                current: currentState,
                history: stateHistory.slice(-5)
            },
            environment: {
                type: IframeEnvironment.getEnvironment(),
                features: { ...IframeEnvironment._features },
                compatibility: CompatibilityBridge.isEnabled(),
                compatibilityReason: CompatibilityBridge.getReason()
            },
            session: {
                valid: isSessionValid(),
                user: session.user ? { id: session.user.id, name: session.user.name } : null,
                expiresAt: session.expiresAt,
                version: session.version
            },
            heartbeat: HeartbeatClient.getDiagnostics(),
            origin: OriginAdapter.getDiagnostics(),
            transport: IframeTransport.getDiagnostics(),
            metrics: this.getMetrics(),
            logs: this._logBuffer.slice(-20),
            stateSnapshots: this._stateSnapshots.slice(-10),
            moduleRegistered,
            parentSessionReceived
        };
    },
    
    reset() {
        this._logBuffer = [];
        this._metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            handshakes: 0,
            handshakeFailures: 0,
            sessionUpdates: 0,
            sessionFailures: 0,
            pings: 0,
            pongs: 0,
            acks: 0,
            errors: 0
        };
        this._stateSnapshots = [];
        this._startTime = Date.now();
        this.log('INFO', 'Diagnostics reset');
    }
};

// =============================================
// EXPORT DEFAULT_SETTINGS - ADD THIS LINE
// =============================================
const DEFAULT_SETTINGS = {
    profile: {
        displayName: '',
        username: '',
        bio: '',
        email: '',
        photoUrl: null,
        profileVisibility: 'everyone',
        lastSeen: true,
        currentMood: 'neutral'
    },
    privacy: {
        whoCanAddMe: 'everyone',
        canMessageMe: 'everyone',
        readReceipts: true,
        typingIndicators: true,
        contactDiscovery: true
    },
    security: {
        twoFactorAuth: false,
        loginNotifications: true,
        sessionTimeout: '30min'
    },
    notifications: {
        messageNotifications: true,
        groupNotifications: true,
        callNotifications: true
    },
    appearance: {
        theme: 'auto',
        accentColor: '#0084ff',
        fontSize: 16,
        language: 'en'
    },
    chat: {
        enterKeySends: true,
        mediaAutoDownload: 'wifiOnly',
        messageHistory: 'forever'
    },
    calls: {
        whoCanCallMe: 'friendsOnly',
        callVibration: true,
        videoQuality: 'auto'
    },
    friends: {
        discoverByPhone: true,
        discoverByEmail: true,
        friendSuggestions: true
    },
    groups: {
        groupInvitations: 'friendsOnly',
        groupAnnouncements: true
    },
    status: {
        whoCanViewMyStatus: 'friendsOnly',
        autoExpireStatus: '24h'
    },
    storage: {
        totalStorageUsed: 0,
        storageTotal: 1024 * 1024 * 1024,
        chatCacheSize: 0,
        mediaCacheSize: 0,
        otherCacheSize: 0,
        storageBreakdown: {
            chats: 0,
            media: 0,
            other: 0
        }
    },
    mood: {
        autoMoodDetection: true,
        currentMood: 'neutral',
        moodColors: {
            neutral: '#A9A9A9',
            happy: '#FFD700',
            calm: '#4A90E2',
            energetic: '#FF6B6B',
            focused: '#7B68EE',
            relaxed: '#4ECDC4',
            stressed: '#FF8C00',
            tired: '#808080',
            excited: '#FF1493'
        }
    },
    advanced: {
        offlineMode: false,
        debugMode: false
    },
    backup: {
        autoBackup: false,
        lastBackup: null
    }
};

// =============================================
// EXPORT ALL PUBLIC FUNCTIONS AND CONSTANTS
// =============================================
export {
    // Core state
    currentUser,
    userSettings,
    currentSection,
    unsavedChanges,
    blockedUsers,
    activeSessions,
    userContacts,
    userGroups,
    
    // Auth state
    authReady,
    apiInitialized,
    backgroundTasksStarted,
    tokenReady,
    tokenAvailable,
    tokenInitialized,
    parentCommunicationReady,
    parentSessionReceived,
    parentOrigin,
    parentSessionData,
    sessionValidated,
    
    // Constants
    MAX_API_RETRIES,
    AUTH_CHECK_INTERVAL,
    TOKEN_CHECK_INTERVAL,
    MAX_HANDSHAKE_ATTEMPTS,
    HANDSHAKE_RETRY_INTERVAL,
    SESSION_SYNC_TIMEOUT,
    HEARTBEAT_INTERVAL,
    PING_INTERVAL,
    PING_TIMEOUT,
    MAX_PING_FAILURES,
    RECOVERY_BACKOFF_BASE,
    RECOVERY_MAX_BACKOFF,
    VISIBILITY_THROTTLE_DELAY,
    TOKEN_BINDING_NONCE_LENGTH,
    
    // Defaults
    DEFAULT_SETTINGS,
    SETTINGS_MENU,
    PARENT_MESSAGE_TYPES,
    
    // Core functions
    verifyParentPresence,
    setupSecureMessagingChannel,
    startParentHandshake,
    resetUIForLogout,
    showReconnectionState,
    checkAuthenticationState,
    bootstrapIframe,
    waitForSession,
    initializeBasicUI,
    setupBasicEventListeners,
    startTokenMonitoring,
    checkTokenAvailability,
    notifyTokenReady,
    notifyTokenLost,
    getSecureToken,
    secureFetchWrapper,
    waitForToken,
    startPassiveAuthMonitoring,
    startBackgroundTasks,
    safeLoadUserData,
    safeLoadSettings,
    safeLoadBlockedUsers,
    safeLoadActiveSessions,
    safeLoadUserContacts,
    safeLoadUserGroups,
    makeSafeRequest,
    saveSettings,
    notifyParentAuthState,
    notifyParentAuthError,
    loadFromLocalStorage,
    updateUserUI,
    initializeUI,
    calculateStorageUsage,
    formatStorageSize,
    getMoodText,
    getMoodColor,
    terminateSession,
    terminateAllSessions,
    unblockUser,
    clearChatCache,
    clearMediaCache,
    onReady,
    isReady,
    
    // Enhanced exports from hardened core
    getCoreDiagnostics,
    getHealthMetrics,
    forceRecovery,
    handshakeState,
    connectionQuality,
    StartupGovernor,
    SessionClient,
    ReliabilityEngine,
    DiagnosticsAgent,
    CompatibilityBridge,
    MultiModuleCoordinator,
    IframeEnvironment,
    SafeStorage,
    IframeTransport,
    IframeHandshakeAuthority,
    RecoveryManager,
    NavigationGuard,
    UIFailsafe,
    
    // API Core and secure wrapper
    secureApiCall,
    ApiCore,
    safeGet,
    safeArray,
    safeObject,
    
    // Module identifiers
    MODULE_NAME,
    MODULE_VERSION,
    FRAME_ID,
    DEBUG,
    LifecycleState,
    currentState,
    
    // Additional core functions
    setState,
    isSessionValid,
    updateSetting,
    handleLogout,
     sendMessageToParent, // Alias for backward compatibility
    setSilentMode,
    shutdownCore,
    initializeCore,
    
    // NEW: Expose queue and parentReady for debugging
    messageQueue,
    parentReady
};

// =============================================
// CALL SETSILENTMODE AFTER ALL COMPONENTS ARE INITIALIZED
// =============================================
setSilentMode(!DEBUG);

// =============================================
// AUTO-START
// =============================================
let domContentLoadedFired = false;

document.addEventListener('DOMContentLoaded', function() {
    if (domContentLoadedFired) return;
    domContentLoadedFired = true;
    
    try {
        initLog('DOMContentLoaded - starting core initialization');
        initializeCore({ 
            debug: DEBUG
        }).then(result => {
            if (result.success) {
                if (result.state === LifecycleState.ACTIVE) {
                    successLog('Core initialized');
                }
            } else {
                errorLog('Core initialization failed:', result);
            }
        }).catch(error => {
            errorLog('Core initialization error:', error);
        });
    } catch (error) {}
});

// =============================================
// EXPOSE GLOBALS FOR DEBUGGING
// =============================================
window.__SETTINGS_DEBUG__ = DEBUG;
window.__getDiagnostics = () => DiagnosticsAgent.getFullReport();
window.__forceRecovery = forceRecovery;
window.__resetCore = () => {
    shutdownCore();
    safeSetTimeout(() => initializeCore(), 1000);
};
window.__getEnvironment = () => IframeEnvironment.getInfo();
window.__getTransportStatus = () => IframeTransport.getDiagnostics();
window.__getSessionStatus = () => ({
    valid: isSessionValid(),
    user: session.user,
    expiresAt: session.expiresAt,
    version: session.version
});
window.__getLifecycleState = () => currentState;
window.__getLifecycleHistory = () => stateHistory;
window.__getParentReady = () => parentReady;
window.__getMessageQueue = () => messageQueue.length;

// =============================================
// END OF FILE
// =============================================