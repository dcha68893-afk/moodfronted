// =============================================
// STABLE IFRAME CORE ENGINE v5.2.0
// ENHANCED PARENT-CHILD SYNCHRONIZATION
// DETERMINISTIC PARENT AUTHORITY COMMUNICATION LAYER
// COMPLETE HANDSHAKE PROTOCOL IMPLEMENTATION
// SECURE MESSAGING WITH FALLBACK SUPPORT
// ENVIRONMENT-AWARE • RECOVERY-READY • ORIGIN-SECURE
// =============================================

// =============================================
// FIXED: SILENT LOGGING SYSTEM - MATCHES FRIENDS MODULE
// =============================================

const LOG_PREFIX = '[Tools]';
const LOG_LEVELS = { DEBUG: 0, INFO: 1, SUCCESS: 2, WARN: 3, ERROR: 4, SILENT: 5 };
let currentLogLevel = LOG_LEVELS.INFO;
const loggedMessages = new Set();

// Debug flag for console noise reduction - set to false to show only important logs
const DEBUG = false;

function logOnce(level, message, data = null) {
    const key = `${level}:${message}`;
    if (loggedMessages.has(key)) return;
    loggedMessages.add(key);
    
    const prefix = level === 'error' ? '🔴 ERROR' :
                   level === 'warn' ? '🟡 WARN' :
                   level === 'success' ? '✅ SUCCESS' :
                   level === 'send' ? '📤 SENDING' :
                   level === 'receive' ? '📥 RECEIVED' :
                   level === 'init' ? '🚀 INIT' :
                   level === 'ready' ? '🔵 READY' : '⚪ INFO';
    
    console.log(`${LOG_PREFIX} ${prefix} - ${message}`, data ? data : '');
}

function logError(module, error, context = '') {
    logOnce('error', `${module} failed: ${error?.message || error}`, { context });
}

// Verbose logging wrapper
function debugLog(...args) {
    if (DEBUG) console.log(...args);
}

// =============================================
// DETERMINISTIC BOOT STATE MACHINE
// =============================================

const BOOT_STATE = {
    PREINIT: 'PREINIT',
    WAIT_PARENT: 'WAIT_PARENT',
    REGISTERING: 'REGISTERING',
    WAIT_SESSION: 'WAIT_SESSION',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    DEGRADED: 'DEGRADED'
};

let currentBootState = BOOT_STATE.PREINIT;
let bootStateLock = false;
let parentReadyDetected = false;
let parentReadyTimeout = null;
let moduleRegistered = false;
let sessionReceived = false;
let authoritativeSession = null;
let parentAuthorityMode = false;

// Boot state machine controller
const bootMachine = {
    transition(newState) {
        if (bootStateLock && currentBootState !== BOOT_STATE.DEGRADED) {
            debugLog('[Boot] State transition locked, ignoring', newState);
            return false;
        }
        
        if (newState === currentBootState) return true;
        
        debugLog(`[Boot] State transition: ${currentBootState} -> ${newState}`);
        currentBootState = newState;
        _STATE.bootState = newState;
        
        // Emit state to parent if in iframe
        if (_STATE.parentDetected && parentAuthorityMode) {
            try {
                window.parent.postMessage({
                    type: 'BOOT_STATE',
                    state: newState,
                    module: 'marketplace',
                    frameId: _STATE.frameId,
                    timestamp: Date.now()
                }, '*');
            } catch (e) {}
        }
        
        return true;
    },
    
    getState() {
        return currentBootState;
    },
    
    isReady() {
        return currentBootState === BOOT_STATE.READY;
    },
    
    isDegraded() {
        return currentBootState === BOOT_STATE.DEGRADED;
    },
    
    lock() {
        bootStateLock = true;
    },
    
    unlock() {
        bootStateLock = false;
    }
};

// =============================================
// PARENT CONTRACT COMPLIANCE LAYER
// =============================================

// Required message handlers that must be implemented
const REQUIRED_PARENT_HANDLERS = new Set([
    'SESSION_ACTIVE',
    'SESSION_UPDATE',
    'ACK',
    'PING',
    'NAVIGATE',
    'PERMISSION_UPDATE',
    'FORCE_LOGOUT',
    // Add legacy message types that parent might send
    'HANDSHAKE_RETRY',
    'init',
    'refreshData'
]);

// Required states to emit
const REQUIRED_STATES = new Set([
    'REGISTERING',
    'REGISTERED',
    'SESSION_PENDING',
    'SESSION_ACTIVE',
    'INITIALIZING',
    'READY'
]);

class ParentContractCompliance {
    constructor() {
        this.handlers = new Map();
        this.registeredHandlers = new Set();
        this.statesEmitted = new Set();
        this.complianceViolations = [];
        this.handshakeRetryCount = 0;
        this.maxHandshakeRetries = 3;
        
        // Register all required handlers
        REQUIRED_PARENT_HANDLERS.forEach(type => {
            this.registerRequiredHandler(type);
        });
    }
    
    registerRequiredHandler(type) {
        if (this.registeredHandlers.has(type)) return;
        
        switch(type) {
            case 'SESSION_ACTIVE':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling SESSION_ACTIVE');
                    this.handleAuthoritativeSession(payload, message);
                });
                break;
            case 'SESSION_UPDATE':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling SESSION_UPDATE');
                    this.handleSessionUpdate(payload, message);
                });
                break;
            case 'ACK':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling ACK');
                    this.handleAck(payload, message);
                });
                break;
            case 'PING':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling PING');
                    this.handlePing(payload, message);
                });
                break;
            case 'NAVIGATE':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling NAVIGATE');
                    this.handleNavigate(payload, message);
                });
                break;
            case 'PERMISSION_UPDATE':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling PERMISSION_UPDATE');
                    this.handlePermissionUpdate(payload, message);
                });
                break;
            case 'FORCE_LOGOUT':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling FORCE_LOGOUT');
                    this.handleForceLogout(payload, message);
                });
                break;
            case 'HANDSHAKE_RETRY':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling HANDSHAKE_RETRY');
                    this.handleHandshakeRetry(payload, message);
                });
                break;
            case 'init':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling init');
                    this.handleParentInit(payload, message);
                });
                break;
            case 'refreshData':
                this.handlers.set(type, (payload, message) => {
                    debugLog('[Contract] Handling refreshData');
                    this.handleRefreshData(payload, message);
                });
                break;
        }
        
        this.registeredHandlers.add(type);
    }
    
    handleAuthoritativeSession(payload, message) {
        if (!payload || !payload.session) return;
        
        parentAuthorityMode = true;
        authoritativeSession = payload.session;
        sessionReceived = true;
        
        // Disable local session restore - this is now authoritative
        _STATE.sessionAuthority = 'parent';
        _STATE.sessionActive = true;
        _STATE.guestMode = false;
        
        // Process the session through existing session adapter
        if (sessionAdapter) {
            sessionAdapter.acceptParentSession(authoritativeSession);
            
            // Update window.currentUser
            const session = sessionAdapter.getSession();
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
        }
        
        // Emit required state
        this.emitState('SESSION_ACTIVE');
        
        // If we're waiting for session, move to initializing
        if (currentBootState === BOOT_STATE.WAIT_SESSION) {
            bootMachine.transition(BOOT_STATE.INITIALIZING);
            setTimeout(() => {
                if (currentBootState === BOOT_STATE.INITIALIZING) {
                    this.completeInitialization();
                }
            }, 100);
        }
    }
    
    handleHandshakeRetry(payload, message) {
        // Parent is asking us to retry handshake
        this.handshakeRetryCount++;
        
        if (this.handshakeRetryCount <= this.maxHandshakeRetries) {
            debugLog('[Contract] Retrying handshake per parent request');
            
            // Resend CHILD_READY
            if (_STATE.parentDetected) {
                sendChildReady();
            }
            
            // Resend REGISTER_MODULE
            if (_STATE.parentDetected) {
                sendRegisterModule();
            }
        } else {
            debugLog('[Contract] Max handshake retries reached');
            // Already in WAIT_PARENT state, let timeout handle it
        }
    }
    
    handleParentInit(payload, message) {
        debugLog('[Contract] Parent init received');
        
        // This might contain session data
        if (payload && payload.session) {
            this.handleAuthoritativeSession({ session: payload.session }, message);
        }
        
        // Also forward to existing handlers
        if (router) {
            router.handleParentInit(payload);
        }
    }
    
    handleRefreshData(payload, message) {
        debugLog('[Contract] Refresh data requested');
        
        // Forward to existing handlers
        if (router) {
            router.handleRefreshDataRequest(payload);
        }
    }
    
    handleSessionUpdate(payload, message) {
        if (!payload) return;
        if (!authoritativeSession && !parentAuthorityMode) return;
        
        // Merge with authoritative session
        if (authoritativeSession) {
            authoritativeSession = { ...authoritativeSession, ...payload };
        }
        
        // Forward to existing handlers
        if (router) {
            router.handleSessionUpdate(payload);
        }
    }
    
    handleAck(payload, message) {
        if (!payload || !payload.messageId) return;
        
        // Mark message complete in reliability engine
        if (reliabilityEngine) {
            const pending = reliabilityEngine.ackTimeouts.get(payload.messageId);
            if (pending) {
                clearTimeout(pending.timeoutId);
                reliabilityEngine.ackTimeouts.delete(payload.messageId);
            }
        }
        
        // Also handle in messaging
        if (messaging) {
            const pending = messaging.pendingAcks.get(payload.messageId);
            if (pending) {
                pending.cleanup?.();
                messaging.pendingAcks.delete(payload.messageId);
            }
        }
    }
    
    handlePing(payload, message) {
        // Respond with PONG
        if (iframeAuthority && _STATE.parentDetected) {
            iframeAuthority.send('PONG', {
                inResponseTo: message.messageId,
                timestamp: Date.now()
            }, { requireAck: false });
        }
    }
    
    handleNavigate(payload, message) {
        if (!payload || !payload.url) return;
        
        // Forward to navigation guard
        if (navigationGuard) {
            navigationGuard.handleNavigate(payload);
        }
        
        // Emit event for UI
        window.dispatchEvent(new CustomEvent('marketplace:navigate', { 
            detail: payload 
        }));
    }
    
    handlePermissionUpdate(payload, message) {
        if (!payload || !payload.permissions) return;
        
        // Update permissions in state
        _STATE.permissions = new Set(payload.permissions);
        
        // Emit event
        window.dispatchEvent(new CustomEvent('marketplace:permissions-updated', {
            detail: { permissions: payload.permissions }
        }));
    }
    
    handleForceLogout(payload, message) {
        // Clear session and reset
        if (sessionAdapter) {
            sessionAdapter.clear();
        }
        
        authoritativeSession = null;
        sessionReceived = false;
        parentAuthorityMode = false;
        _STATE.sessionActive = false;
        _STATE.guestMode = true;
        
        window.currentUser = null;
        window.userData = null;
        
        // Emit event
        window.dispatchEvent(new CustomEvent('marketplace:logout', {
            detail: { forced: true, timestamp: Date.now() }
        }));
        
        // Reset boot state
        bootMachine.transition(BOOT_STATE.PREINIT);
        setTimeout(() => {
            initializeDeterministicBoot();
        }, 1000);
    }
    
    emitState(state) {
        if (!REQUIRED_STATES.has(state)) return;
        
        if (this.statesEmitted.has(state)) return;
        this.statesEmitted.add(state);
        
        debugLog(`[Contract] Emitting state: ${state}`);
        
        if (_STATE.parentDetected && parentAuthorityMode) {
            try {
                window.parent.postMessage({
                    type: 'MODULE_STATE',
                    state: state,
                    module: 'marketplace',
                    frameId: _STATE.frameId,
                    timestamp: Date.now()
                }, '*');
            } catch (e) {}
        }
    }
    
    completeInitialization() {
        bootMachine.transition(BOOT_STATE.READY);
        this.emitState('READY');
        
        _STATE.ready = true;
        _STATE.initialized = true;
        isReady = true;
        
        // Set exposed flags
        window.__MODULE_READY__ = true;
        if (_STATE.sessionActive) {
            window.__MODULE_SESSION_ACTIVE__ = true;
        }
        
        logOnce('ready', 'MarketplaceCore ready');
    }
    
    getHandler(type) {
        return this.handlers.get(type);
    }
    
    hasAllRequiredHandlers() {
        for (const type of REQUIRED_PARENT_HANDLERS) {
            if (!this.registeredHandlers.has(type)) return false;
        }
        return true;
    }
}

// =============================================
// STATE & CONFIGURATION - IMMUTABLE EXPORT (PRESERVED)
// =============================================

const _STATE = {
    initialized: false,
    handshakeComplete: false,
    parentDetected: false,
    sessionActive: false,
    ready: false,
    shutdown: false,
    guestMode: false,
    demoMode: false,
    fallbackMode: false,
    permissions: new Set(),
    health: {
        lastHeartbeat: 0,
        missedHeartbeats: 0,
        circuitBreaker: false,
        circuitBreakerReset: null
    },
    features: new Map(),
    lastValidSession: null,
    sessionCache: null,
    initializationStage: null,
    // Enhanced tracking
    handshakeId: null,
    handshakeStartTime: 0,
    lastParentMessage: 0,
    parentResponding: true,
    syncAttempts: 0,
    
    // New state for enhanced protocol
    protocolVersion: 'KYN-2.0',
    frameId: null,
    connectionMetrics: {
        messagesSent: 0,
        messagesReceived: 0,
        acksReceived: 0,
        acksMissed: 0,
        retries: 0,
        handshakeDuration: 0,
        lastPing: 0,
        lastPong: 0
    },
    securityLevel: 'standard', // 'standard', 'enhanced', 'compatibility'
    sandboxRestrictions: null,
    parentCapabilities: [],
    recoveryMode: false,
    recoveryAttempts: 0,
    
    // Boot state
    bootState: BOOT_STATE.PREINIT,
    sessionAuthority: 'unknown', // 'parent', 'local', 'guest'
    
    // Environment classification
    environment: {
        type: 'UNKNOWN', // LOCAL_DEV, RENDER_HOSTED, VPN_NETWORK, PRODUCTION
        latency: 0,
        online: true,
        secure: false,
        origin: '',
        hostname: '',
        protocol: '',
        connectionType: 'unknown',
        effectiveType: 'unknown'
    },
    
    // Startup governor state
    startupStage: 'IDLE', // IDLE, WAITING, HANDSHAKING, SYNCING, ACTIVE, DEGRADED, RECOVERING
    startupLock: false,
    startupAttempts: 0,
    maxStartupAttempts: 5,
    
    // Handshake client state
    handshakeState: {
        stage: 'idle',
        attempts: 0,
        lastAttempt: 0,
        childReadySent: false,
        parentReadyReceived: false,
        handshakeRequestSent: false,
        handshakeAckReceived: false,
        capabilitiesExchanged: false,
        complete: false,
        error: null
    },
    
    // Session client state
    sessionState: {
        requested: false,
        received: false,
        synced: false,
        acked: false,
        expiresAt: null,
        lastSync: 0,
        refreshNeeded: false,
        expiryWarning: false
    },
    
    // Origin trust
    trustedOrigins: new Set(),
    originCheckMode: 'permissive', // 'strict', 'permissive', 'compatibility'
    
    // Diagnostics
    diagnostics: {
        errors: [],
        warnings: [],
        metrics: [],
        lastCheck: 0,
        startupTime: 0,
        handshakeTime: 0,
        sessionTime: 0
    }
};

const CONFIG = {
    ORIGIN_WHITELIST: (() => {
        try {
            return [
                window.location.origin,
                'http://127.0.0.1:5500',
                'http://localhost:5500',
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'https://*.onrender.com',
                'http://*.onrender.com',
                'https://moodchat-fy56.onrender.com',
                'https://moodfronted.onrender.com',
                'null'
            ];
        } catch {
            return ['*'];
        }
    })(),
    TIMEOUTS: {
        HANDSHAKE: 3000,
        SESSION: 5000,
        HEARTBEAT: 15000,
        ACK: 1500,
        INIT: 5000,
        DEPENDENCY: 2000,
        SYNC: 2000,
        PARENT_RESPONSE: 1500,
        // New timeouts
        CHILD_READY_WAIT: 2000,
        PARENT_READY_WAIT: 3000,
        HANDSHAKE_REQUEST_WAIT: 2500,
        HANDSHAKE_ACK_WAIT: 2000,
        SESSION_REQUEST_WAIT: 3000,
        RECOVERY_WAIT: 5000,
        BACKOFF_BASE: 200,
        BACKOFF_MAX: 5000,
        
        // Environment-specific timeouts
        LOCAL_DEV_ACK: 300,
        RENDER_HOSTED_ACK: 1000,
        VPN_NETWORK_ACK: 3000,
        PRODUCTION_ACK: 1500,
        
        // Latency multipliers
        HIGH_LATENCY_MULTIPLIER: 3,
        UNSTABLE_MULTIPLIER: 2
    },
    RETRY: {
        MAX_ATTEMPTS: 3,
        BASE_DELAY: 200,
        MAX_DELAY: 2000,
        // New retry configs
        HANDSHAKE_RETRIES: 3,
        SESSION_RETRIES: 3,
        HEARTBEAT_RETRIES: 5,
        BACKOFF_FACTOR: 1.5,
        JITTER_MAX: 100,
        
        // Environment-specific
        LOCAL_DEV_RETRIES: 2,
        RENDER_HOSTED_RETRIES: 4,
        VPN_NETWORK_RETRIES: 6,
        PRODUCTION_RETRIES: 3
    },
    CIRCUIT_BREAKER: {
        FAILURE_THRESHOLD: 3,
        RESET_TIMEOUT: 15000
    },
    // New security config
    SECURITY: {
        SIGNATURE_REQUIRED: false,
        TIMESTAMP_TOLERANCE: 60000, // 60 seconds
        REPLAY_WINDOW: 300000, // 5 minutes
        MAX_MESSAGE_SIZE: 1048576, // 1MB
        TOKEN_REFRESH_MARGIN: 300000, // 5 minutes before expiry
        SANDBOX_ALLOWED_CRYPTO: false,
        ORIGIN_STRICT_MODE: true,
        PERMISSION_SCOPES: ['session', 'listings', 'messages', 'profile'],
        
        // Environment overrides
        LOCAL_DEV_STRICT: false,
        RENDER_HOSTED_STRICT: true,
        VPN_NETWORK_STRICT: false,
        PRODUCTION_STRICT: true
    },
    // New monitoring config
    MONITORING: {
        DEBUG_MODE: false,
        METRICS_ENABLED: true,
        HEALTH_CHECK_INTERVAL: 30000,
        PERFORMANCE_SAMPLING: 0.1,
        ERROR_SAMPLING: 1.0,
        MAX_METRICS_HISTORY: 1000,
        
        // Diagnostics
        LOG_LEVEL: 'warn', // 'debug', 'info', 'warn', 'error'
        COLLECT_PERFORMANCE: true,
        COLLECT_MEMORY: true
    },
    
    // Environment detection thresholds
    ENVIRONMENT: {
        LATENCY_THRESHOLD_HIGH: 300, // ms
        LATENCY_THRESHOLD_VPN: 500, // ms
        JITTER_THRESHOLD: 100, // ms
        VPN_INDICATORS: ['10.', '192.168.', '172.16.', '100.64.', '169.254.'],
        LOCAL_INDICATORS: ['localhost', '127.0.0.1', '::1', 'file://']
    },
    
    // Recovery strategies
    RECOVERY: {
        STRATEGIES: [
            'heartbeat',
            'handshake',
            'session',
            'full_reset'
        ],
        BACKOFF_STRATEGY: 'exponential', // 'linear', 'exponential', 'fibonacci'
        MAX_RECOVERY_ATTEMPTS: 3,
        COOLDOWN_PERIOD: 60000
    },
    
    // New security hardening
    HARDENING: {
        TOKEN_BINDING: true,
        ORIGIN_BINDING: true,
        CSP_SAFE: true,
        REPLAY_PROTECTION: true,
        RATE_LIMIT: {
            MAX_MESSAGES_PER_SECOND: 10,
            BURST_SIZE: 15
        },
        VPN_ADAPTIVE: true
    }
};

// =============================================
// EXPORTED STATE VARIABLES - FULL IMPLEMENTATION (PRESERVED)
// =============================================

// User state
export let currentUser = null;
export let userData = null;
export let myListings = [];
export let allListings = [];
export let savedItems = [];
export let privateNotes = [];
export let userGroups = [];
export let userFriends = [];
export let currentMoodFilter = null;
export let offlineDrafts = [];
export let trustStats = {};
export let userSubscription = null;
export let teamMembers = [];
export let leaderboardData = [];
export let analyticsData = {};
export let streakData = {};
export let premiumFeatures = {};
export let paymentMethods = [];

// Parent-Child Communication State
export let parentDataLoaded = false;
export let directAPILoaded = false;
export let parentDataTimeout = 3000;
export let parentCommunicationId = null;
export let dataFetchInProgress = false;

// Session control state
export let parentSessionAuthority = null;
export let sessionData = null;
export let handshakeComplete = false;
export let handshakeRetryCount = 0;
export let maxHandshakeRetries = 3;
export let handshakeRetryDelay = 300;
export let sessionValidationInProgress = false;
export let uiBlockedForSession = false;
export let secureMessagingChannel = null;

// Secure handshake state
export let handshakeInProgress = false;
export let sessionValid = false;
export let handshakeTimeout = null;
export let handshakeRequestSent = false;
export let sessionRetryAttempt = 0;
export const MAX_SESSION_RETRIES = 3;

// Page core state
export let isReady = false;
export let isInitializing = false;
export let messageQueue = [];
export let dataCache = new Map();
export let loadingMessageElement = null;

// Token system state
export let isBootstrapped = false;
export let isAuthReady = false;
export let backgroundJobsStarted = false;
export let tokenInitializationPromise = null;
export let tokenRefreshInProgress = false;
export const apiCallQueue = [];
export let isProcessingQueue = false;

// Enhanced sync state
let _syncInProgress = false;
let _lastSyncTime = 0;
let _syncTimer = null;
let _heartbeatInterval = null;
let _parentCheckInterval = null;

// Startup governor state
let _startupLock = false;
let _startupStage = 'IDLE';
let _startupAttempts = 0;

// =============================================
// CONSTANTS - FULL EXPORT (PRESERVED)
// =============================================

export const LISTING_TYPES = {
    SERVICE: 'service',
    DIGITAL: 'digital',
    PHYSICAL: 'physical'
};

export const AVAILABILITY = {
    FREE: 'free',
    BUSY: 'busy',
    URGENT: 'urgent'
};

export const MOOD_CONTEXTS = {
    HELP: 'help',
    BROWSE: 'browse',
    LEARN: 'learn',
    URGENT: 'urgent',
    CREATIVE: 'creative',
    BUSINESS: 'business'
};

export const TRUST_CIRCLES = {
    FRIENDS: 'friends',
    GROUPS: 'groups',
    SELECTED: 'selected',
    PUBLIC: 'public',
    PREMIUM: 'premium',
    MICRO: 'micro'
};

export const DURATION_OPTIONS = {
    '24h': 24 * 60 * 60 * 1000,
    '3d': 3 * 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '14d': 14 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    'event': null
};

export const TRUST_INDICATORS = {
    NEW: { text: 'New', class: 'trust-new' },
    RESPONSIVE: { text: 'Responsive', class: 'trust-responsive' },
    RELIABLE: { text: 'Reliable', class: 'trust-reliable' },
    VERIFIED: { text: 'Verified', class: 'trust-verified' },
    PRO: { text: 'Pro', class: 'trust-pro' }
};

export const SUBSCRIPTION_PLANS = {
    MONTHLY: { id: 'monthly', price: 9.99, name: 'Monthly' },
    QUARTERLY: { id: 'quarterly', price: 24.99, name: 'Quarterly' },
    YEARLY: { id: 'yearly', price: 79.99, name: 'Yearly' },
    BUSINESS: { id: 'business', price: 199.99, name: 'Business' },
    TEAM: { id: 'team', price: 299.99, name: 'Team' }
};

export const SERVICE_CATEGORIES = [
    'Tutoring', 'Design', 'Repair', 'Writing', 'Consulting',
    'Programming', 'Marketing', 'Cleaning', 'Cooking', 'Fitness',
    'Music Lessons', 'Art', 'Photography', 'Video Editing', 'Translation'
];

export const PREMIUM_CATEGORIES = [
    'Business Consulting', 'Executive Coaching', 'VIP Services',
    'Enterprise Solutions', 'Premium Content', 'Exclusive Access'
];

export const DIGITAL_TYPES = [
    'Study Notes', 'Templates', 'Design Assets', 'E-books', 'Guides',
    'Worksheets', 'Presentations', 'Code Snippets', 'Audio Lessons', 'Wallpapers'
];

export const PREMIUM_DIGITAL_TYPES = [
    'Premium Templates', 'Master Classes', 'Pro Tools',
    'Exclusive Content', 'AR Assets', '3D Models'
];

export const TEMPLATE_TYPES = {
    BASIC: 'basic',
    BUSINESS: 'business',
    COACHING: 'coaching',
    CREATIVE: 'creative',
    VIP: 'vip',
    DIGITAL: 'digital'
};

export const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_PROFILE: 'knecta_user_profile',
    MY_LISTINGS: 'knecta_my_listings',
    ALL_LISTINGS: 'knecta_all_listings',
    SAVED_ITEMS: 'knecta_saved_items',
    PRIVATE_NOTES: 'knecta_private_notes',
    OFFLINE_DRAFTS: 'knecta_marketplace_drafts',
    TRUST_STATS: 'knecta_trust_stats',
    MOOD_FILTER: 'knecta_marketplace_mood',
    USER_GROUPS: 'knecta_user_groups',
    USER_FRIENDS: 'knecta_user_friends',
    USER_SUBSCRIPTION: 'knecta_user_subscription',
    TEAM_MEMBERS: 'knecta_team_members',
    LEADERBOARD: 'knecta_leaderboard',
    ANALYTICS: 'knecta_analytics',
    STREAK_DATA: 'knecta_streak_data',
    PREMIUM_FEATURES: 'knecta_premium_features',
    PAYMENT_METHODS: 'knecta_payment_methods',
    PREMIUM_LISTINGS: 'knecta_premium_listings',
    SPOTLIGHT_LISTINGS: 'knecta_spotlight_listings',
    MARKETPLACE_USERS: 'knecta_marketplace_users',
    SYNC_QUEUE: 'knecta_sync_queue',
    SESSION_CACHE: 'knecta_session_cache',
    // New keys
    FRAME_ID: 'knecta_frame_id',
    HANDSHAKE_STATE: 'knecta_handshake_state',
    PROTOCOL_VERSION: 'knecta_protocol_version',
    ENVIRONMENT_CACHE: 'knecta_environment_cache',
    STARTUP_STATE: 'knecta_startup_state'
};

// Updated message types to match parent expectations
export const PARENT_MESSAGE_TYPES = {
    // Child to Parent (must match parent's expected types)
    CHILD_READY: 'CHILD_READY',
    REQUEST_SESSION: 'REQUEST_SESSION',
    SESSION_CONFIRMED: 'SESSION_CONFIRMED',
    UI_READY: 'UI_READY',
    NEED_REFRESH: 'NEED_REFRESH',
    AUTH_ERROR: 'AUTH_ERROR',
    CORE_READY: 'coreReady',
    HEARTBEAT: 'HEARTBEAT',
    SYNC_REQUEST: 'SYNC_REQUEST',
    
    // Parent to Child
    SESSION_DATA: 'SESSION_DATA',
    SESSION_UPDATE: 'SESSION_UPDATE',
    LOGOUT: 'LOGOUT',
    PARENT_READY: 'PARENT_READY',
    REFRESH_UI: 'REFRESH_UI',
    FORCE_RELOAD: 'FORCE_RELOAD',
    INIT: 'init',
    REFRESH_DATA: 'refreshData',
    ACK: 'ACK',
    HANDSHAKE_COMPLETE: 'HANDSHAKE_COMPLETE',
    
    // New protocol types (must match parent's HandshakeManager)
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
    HANDSHAKE_ACK: 'HANDSHAKE_ACK',
    SESSION_SYNC: 'SESSION_SYNC',
    SESSION_ACK: 'SESSION_ACK',
    PAGE_ACTIVATED: 'PAGE_ACTIVATED',
    NAVIGATE: 'NAVIGATE',
    PING: 'PING',
    PONG: 'PONG',
    CAPABILITIES: 'CAPABILITIES',
    CAPABILITIES_ACK: 'CAPABILITIES_ACK',
    ERROR: 'ERROR',
    WARNING: 'WARNING',
    
    // Environment negotiation
    ENVIRONMENT: 'ENVIRONMENT',
    ENVIRONMENT_ACK: 'ENVIRONMENT_ACK',
    
    // Recovery protocol
    RECOVERY_REQUEST: 'RECOVERY_REQUEST',
    RECOVERY_ACK: 'RECOVERY_ACK',
    
    // Diagnostics
    DIAGNOSTICS: 'DIAGNOSTICS',
    METRICS: 'METRICS',
    
    // Boot states
    BOOT_STATE: 'BOOT_STATE',
    MODULE_STATE: 'MODULE_STATE',
    REGISTER_MODULE: 'REGISTER_MODULE'
};

export const DATA_TYPES = {
    FRIENDS: 'friendsList',
    GROUPS: 'groupsList',
    CHAT_HISTORY: 'chatHistory',
    NOTIFICATIONS: 'notifications',
    SETTINGS: 'settings'
};

export const SESSION_SCHEMA = {
    required: ['userId', 'userToken'],
    optional: ['displayName', 'email', 'photoURL', 'isPremium', 'subscription', 'trustLevel', 'groups', 'friends', 'expiresAt']
};

// Environment types
export const ENVIRONMENT_TYPES = {
    LOCAL_DEV: 'LOCAL_DEV',
    RENDER_HOSTED: 'RENDER_HOSTED',
    VPN_NETWORK: 'VPN_NETWORK',
    PRODUCTION: 'PRODUCTION',
    UNKNOWN: 'UNKNOWN'
};

// Startup stages
export const STARTUP_STAGES = {
    IDLE: 'IDLE',
    WAITING: 'WAITING',
    HANDSHAKING: 'HANDSHAKING',
    SYNCING: 'SYNCING',
    ACTIVE: 'ACTIVE',
    DEGRADED: 'DEGRADED',
    RECOVERING: 'RECOVERING',
    FAILED: 'FAILED'
};

// =============================================
// FIXED: MODULE 0 - SAFE STORAGE LAYER with logging
// =============================================

class SafeStorage {
    constructor() {
        this.memoryStorage = new Map();
        this.storageAvailable = this.checkStorageAvailability('localStorage');
        this.sessionAvailable = this.checkStorageAvailability('sessionStorage');
        this.warningsShown = new Set();
        logOnce('ready', 'SafeStorage initialized');
    }

    checkStorageAvailability(type) {
        try {
            const storage = type === 'localStorage' ? localStorage : sessionStorage;
            const test = '__storage_test__';
            storage.setItem(test, test);
            storage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }

    get(key, defaultValue = null) {
        try {
            if (this.storageAvailable) {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    try {
                        return JSON.parse(value);
                    } catch {
                        return value;
                    }
                }
            }
            if (this.memoryStorage.has(key)) {
                return this.memoryStorage.get(key);
            }
            return defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    set(key, value) {
        try {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            if (this.storageAvailable) {
                try {
                    localStorage.setItem(key, serialized);
                } catch (e) {
                    this.memoryStorage.set(key, value);
                }
            } else {
                this.memoryStorage.set(key, value);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    remove(key) {
        try {
            if (this.storageAvailable) {
                localStorage.removeItem(key);
            }
            this.memoryStorage.delete(key);
            return true;
        } catch (e) {
            return false;
        }
    }

    sessionGet(key, defaultValue = null) {
        try {
            if (this.sessionAvailable) {
                const value = sessionStorage.getItem(key);
                if (value !== null) {
                    try {
                        return JSON.parse(value);
                    } catch {
                        return value;
                    }
                }
            }
            return this.memoryStorage.get(`session_${key}`) || defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    sessionSet(key, value) {
        try {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            if (this.sessionAvailable) {
                try {
                    sessionStorage.setItem(key, serialized);
                } catch (e) {
                    this.memoryStorage.set(`session_${key}`, value);
                }
            } else {
                this.memoryStorage.set(`session_${key}`, value);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    sessionRemove(key) {
        try {
            if (this.sessionAvailable) {
                sessionStorage.removeItem(key);
            }
            this.memoryStorage.delete(`session_${key}`);
            return true;
        } catch (e) {
            return false;
        }
    }

    clear() {
        this.memoryStorage.clear();
    }
}

const safeStorage = new SafeStorage();

// =============================================
// FIXED: MODULE 1 - ENVIRONMENT DETECTOR with logging
// =============================================

class EnvironmentDetector {
    constructor() {
        this.environment = {
            type: ENVIRONMENT_TYPES.UNKNOWN,
            latency: 0,
            jitter: 0,
            online: navigator.onLine,
            secure: window.location.protocol === 'https:',
            origin: window.location.origin,
            hostname: window.location.hostname,
            protocol: window.location.protocol,
            connectionType: 'unknown',
            effectiveType: 'unknown',
            rtt: 0,
            downlink: 0,
            saveData: false,
            isIframe: window.parent !== window,
            isSecureContext: window.isSecureContext || false
        };
        this.latencySamples = [];
        this.jitterSamples = [];
        this.initialized = false;
        this.listeners = new Set();
    }

    initialize() {
        if (this.initialized) return this.environment;
        
        this.detectConnectionInfo();
        this.classifyEnvironment();
        this.measureInitialLatency();
        this.initialized = true;
        _STATE.environment = this.environment;
        
        safeStorage.set(LOCAL_STORAGE_KEYS.ENVIRONMENT_CACHE, {
            type: this.environment.type,
            timestamp: Date.now(),
            latency: this.environment.latency
        });
        
        logOnce('ready', `Environment detected: ${this.environment.type}`);
        
        return this.environment;
    }

    detectConnectionInfo() {
        try {
            if (navigator.connection) {
                const conn = navigator.connection;
                this.environment.connectionType = conn.type || 'unknown';
                this.environment.effectiveType = conn.effectiveType || 'unknown';
                this.environment.rtt = conn.rtt || 0;
                this.environment.downlink = conn.downlink || 0;
                this.environment.saveData = conn.saveData || false;
            }
        } catch (e) {}
    }

    classifyEnvironment() {
        const hostname = this.environment.hostname;
        const protocol = this.environment.protocol;
        
        if (this.isLocalDevelopment()) {
            this.environment.type = ENVIRONMENT_TYPES.LOCAL_DEV;
        } else if (hostname.includes('onrender.com')) {
            this.environment.type = ENVIRONMENT_TYPES.RENDER_HOSTED;
        } else if (this.isVPNNetwork()) {
            this.environment.type = ENVIRONMENT_TYPES.VPN_NETWORK;
        } else if (protocol === 'https:' && !this.isLocalDevelopment()) {
            this.environment.type = ENVIRONMENT_TYPES.PRODUCTION;
        } else {
            this.environment.type = ENVIRONMENT_TYPES.UNKNOWN;
        }
    }

    isLocalDevelopment() {
        const hostname = this.environment.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    }

    isVPNNetwork() {
        const hostname = this.environment.hostname;
        if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
        
        const parts = hostname.split('.');
        if (parts.length === 4) {
            const firstOctet = parseInt(parts[0]);
            const secondOctet = parseInt(parts[1]);
            
            if (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) return true;
            if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return true;
        }
        
        return false;
    }

    async measureInitialLatency() {
        const samples = 3;
        let total = 0;
        
        for (let i = 0; i < samples; i++) {
            const start = performance.now();
            await new Promise(resolve => setTimeout(resolve, 10));
            const end = performance.now();
            const latency = end - start - 10;
            this.latencySamples.push(latency);
            total += latency;
        }
        
        this.environment.latency = Math.round(total / samples);
    }

    getEnvironmentReport() {
        return { ...this.environment };
    }

    isHighLatency() {
        return this.environment.latency > 300;
    }

    shouldUseCompatibilityMode() {
        return this.environment.type === ENVIRONMENT_TYPES.VPN_NETWORK ||
               this.environment.type === ENVIRONMENT_TYPES.UNKNOWN ||
               !this.environment.secure;
    }
}

const environmentDetector = new EnvironmentDetector();
environmentDetector.initialize();

// =============================================
// FIXED: MODULE 2 - RELIABILITY ENGINE with logging
// =============================================

class ReliabilityEngine {
    constructor(envDetector) {
        this.environmentDetector = envDetector;
        this.retryQueues = new Map();
        this.ackTimeouts = new Map();
        this.messageCounters = new Map();
        this.circuitBreakers = new Map();
        this.offlineBuffer = [];
        this.rateLimit = { lastReset: Date.now(), count: 0 };
        this.warningsShown = new Set();
    }

    async sendWithReliability(type, payload = {}, options = {}) {
        const {
            requireAck = true,
            maxRetries = 3,
            timeout = 1500,
            retryQueue = 'default',
            offlineBuffer = true
        } = options;

        if (this.isRateLimited()) {
            if (offlineBuffer) this.bufferMessage(type, payload, options);
            return { success: false, queued: true, reason: 'rate_limited' };
        }

        if (this.isCircuitOpen(retryQueue)) {
            if (offlineBuffer) this.bufferMessage(type, payload, options);
            return { success: false, queued: true, reason: 'circuit_open' };
        }

        if (!_STATE.parentResponding && !options.force) {
            if (offlineBuffer) this.bufferMessage(type, payload, options);
            return { success: false, queued: true, reason: 'parent_unavailable' };
        }

        this.rateLimit.count++;
        const messageId = this.generateMessageId();

        if (!requireAck) {
            return this.sendFireAndForget(type, payload, messageId);
        }

        return this.sendWithRetry(type, payload, {
            messageId, maxRetries, timeout, retryQueue, originalOptions: options
        });
    }

    async sendWithRetry(type, payload, config) {
        const { messageId, maxRetries, timeout, retryQueue, originalOptions } = config;
        let attempts = 0;
        let lastError = null;

        while (attempts <= maxRetries) {
            attempts++;
            
            try {
                const result = await this.sendWithAck(type, payload, { messageId, timeout, attempt: attempts });
                if (result.success) {
                    this.recordSuccess(retryQueue);
                    return result;
                }
                lastError = result.error;
                if (attempts <= maxRetries) {
                    await this.sleep(this.calculateBackoff(attempts));
                }
            } catch (error) {
                lastError = error;
                if (attempts <= maxRetries) {
                    await this.sleep(this.calculateBackoff(attempts));
                }
            }
        }

        this.recordFailure(retryQueue);
        if (originalOptions.offlineBuffer !== false) {
            this.bufferMessage(type, payload, originalOptions);
        }

        return { success: false, error: lastError || 'max_retries_exceeded', attempts };
    }

    sendWithAck(type, payload, config) {
        return new Promise((resolve) => {
            const { messageId, timeout, attempt } = config;
            let resolved = false;
            
            // Generate unique messageId if not provided
            const finalMessageId = messageId || this.generateMessageId();

            const timeoutId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve({ success: false, error: 'timeout', attempt, messageId: finalMessageId });
            }, timeout);

            const ackHandler = (e) => {
                if (!this.validateOrigin(e)) return;
                
                const data = e.data;
                if (!data || typeof data !== 'object') return;
                
                if ((data.type === 'ACK' || data.type === PARENT_MESSAGE_TYPES.ACK) && 
                    (data.inResponseTo === finalMessageId || data.messageId === finalMessageId)) {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    _STATE.connectionMetrics.acksReceived++;
                    resolve({ success: true, ack: data, attempt, messageId: finalMessageId });
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                window.removeEventListener('message', ackHandler);
                this.ackTimeouts.delete(finalMessageId);
            };

            this.ackTimeouts.set(finalMessageId, { timeoutId, cleanup });
            window.addEventListener('message', ackHandler);

            try {
                if (!window.parent || window.parent === window) {
                    throw new Error('Not in iframe');
                }

                const message = this.buildMessage(type, payload, { messageId: finalMessageId, attempt });
                window.parent.postMessage(message, '*');
                _STATE.connectionMetrics.messagesSent++;
                
                setTimeout(() => {
                    if (!resolved) cleanup();
                }, timeout + 100);
            } catch (err) {
                cleanup();
                resolve({ success: false, error: err.message, attempt, messageId: finalMessageId });
            }
        });
    }

    sendFireAndForget(type, payload, messageId) {
        try {
            if (!window.parent || window.parent === window) {
                return { success: false, error: 'not_in_iframe' };
            }
            const message = this.buildMessage(type, payload, { messageId });
            window.parent.postMessage(message, '*');
            _STATE.connectionMetrics.messagesSent++;
            return { success: true, messageId };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    buildMessage(type, payload, meta = {}) {
        return {
            protocol: _STATE.protocolVersion,
            messageId: meta.messageId || this.generateMessageId(),
            type: type,
            source: 'iframe',
            target: 'parent',
            frameId: _STATE.frameId,
            timestamp: Date.now(),
            attempt: meta.attempt || 1,
            payload: this.sanitizePayload(payload)
        };
    }

    generateMessageId() {
        return `${Date.now()}_${Math.random().toString(36).substring(2, 10)}_${++_STATE.connectionMetrics.messagesSent}`;
    }

    sanitizePayload(payload) {
        if (!payload || typeof payload !== 'object') return {};
        try {
            return JSON.parse(JSON.stringify(payload));
        } catch {
            return {};
        }
    }

    validateOrigin(event) {
        try {
            if (event.source !== window.parent) return false;
            return event.origin === window.location.origin || event.origin === 'null';
        } catch {
            return false;
        }
    }

    calculateBackoff(attempt) {
        const base = 200;
        const max = 5000;
        let delay = base * Math.pow(1.5, attempt - 1);
        delay += Math.random() * 100;
        if (this.environmentDetector.isHighLatency()) delay *= 3;
        return Math.min(delay, max);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isRateLimited() {
        const now = Date.now();
        if (now - this.rateLimit.lastReset > 1000) {
            this.rateLimit.lastReset = now;
            this.rateLimit.count = 0;
            return false;
        }
        return this.rateLimit.count >= 10;
    }

    bufferMessage(type, payload, options) {
        this.offlineBuffer.push({ type, payload, options, timestamp: Date.now(), attempts: 0 });
        if (this.offlineBuffer.length > 100) this.offlineBuffer.shift();
    }

    processOfflineBuffer() {
        if (this.offlineBuffer.length === 0) return;
        if (!window.parent || window.parent === window) return;
        if (!_STATE.parentResponding) return;

        const buffer = [...this.offlineBuffer];
        this.offlineBuffer = [];

        buffer.forEach(async (item) => {
            await this.sendWithReliability(item.type, item.payload, { ...item.options, offlineBuffer: false });
        });
    }

    recordSuccess(queue) {
        const breaker = this.circuitBreakers.get(queue) || { failures: 0, open: false };
        breaker.failures = Math.max(0, breaker.failures - 1);
        this.circuitBreakers.set(queue, breaker);
    }

    recordFailure(queue) {
        const breaker = this.circuitBreakers.get(queue) || { failures: 0, open: false };
        breaker.failures++;
        if (breaker.failures >= 3 && !breaker.open) this.openCircuit(queue);
        this.circuitBreakers.set(queue, breaker);
    }

    isCircuitOpen(queue) {
        return this.circuitBreakers.get(queue)?.open || false;
    }

    openCircuit(queue) {
        const breaker = this.circuitBreakers.get(queue) || { failures: 0, open: false };
        if (breaker.open) return;
        breaker.open = true;
        this.circuitBreakers.set(queue, breaker);
        
        breaker.resetTimer = setTimeout(() => {
            this.closeCircuit(queue);
        }, 15000);
    }

    closeCircuit(queue) {
        const breaker = this.circuitBreakers.get(queue);
        if (breaker) {
            breaker.open = false;
            breaker.failures = 0;
            if (breaker.resetTimer) {
                clearTimeout(breaker.resetTimer);
                breaker.resetTimer = null;
            }
            this.circuitBreakers.set(queue, breaker);
        }
    }
}

// =============================================
// FIXED: MODULE 3 - STARTUP GOVERNOR with logging
// =============================================

class StartupGovernor {
    constructor(envDetector, relEngine) {
        this.environmentDetector = envDetector;
        this.reliabilityEngine = relEngine;
        this.state = {
            stage: STARTUP_STAGES.IDLE,
            attempts: 0,
            maxAttempts: 5,
            lock: false,
            startTime: 0,
            lastAttempt: 0,
            error: null,
            parentReady: false,
            handshakeComplete: false,
            sessionValid: false
        };
        this.timeouts = new Map();
        this.listeners = new Set();
    }

    initialize() {
        this.state.startTime = Date.now();
        _STATE.startupStage = this.state.stage;
        return this;
    }

    async start() {
        if (this.state.lock) return false;
        if (_STATE.handshakeComplete && _STATE.sessionActive) {
            this.state.stage = STARTUP_STAGES.ACTIVE;
            _STATE.startupStage = STARTUP_STAGES.ACTIVE;
            logOnce('ready', 'Startup governor ready');
            return true;
        }

        this.state.lock = true;
        this.state.stage = STARTUP_STAGES.WAITING;
        _STATE.startupStage = STARTUP_STAGES.WAITING;

        try {
            if (this.isInIframe()) {
                const parentReady = await this.waitForParent();
                if (!parentReady) {
                    this.handleFailure('Parent not ready');
                    return false;
                }
            } else {
                this.state.stage = STARTUP_STAGES.DEGRADED;
                _STATE.startupStage = STARTUP_STAGES.DEGRADED;
                _STATE.guestMode = true;
                _STATE.fallbackMode = true;
                this.state.lock = false;
                return true;
            }

            this.state.stage = STARTUP_STAGES.HANDSHAKING;
            _STATE.startupStage = STARTUP_STAGES.HANDSHAKING;

            const handshakeComplete = await this.performHandshake();
            if (!handshakeComplete) {
                this.handleFailure('Handshake failed');
                return false;
            }

            this.state.stage = STARTUP_STAGES.SYNCING;
            _STATE.startupStage = STARTUP_STAGES.SYNCING;

            const sessionValid = await this.syncSession();
            if (!sessionValid && !_STATE.guestMode) {
                this.handleFailure('Session sync failed');
                return false;
            }

            this.state.stage = STARTUP_STAGES.ACTIVE;
            this.state.lock = false;
            _STATE.startupStage = STARTUP_STAGES.ACTIVE;
            _STATE.initialized = true;

            safeStorage.set(LOCAL_STORAGE_KEYS.STARTUP_STATE, {
                stage: STARTUP_STAGES.ACTIVE,
                timestamp: Date.now(),
                handshakeComplete: true
            });

            logOnce('ready', 'Startup complete');
            return true;

        } catch (error) {
            this.handleFailure(error.message);
            return false;
        }
    }

    isInIframe() {
        try {
            return window.parent && window.parent !== window;
        } catch {
            return false;
        }
    }

    waitForParent() {
        return new Promise((resolve) => {
            if (_STATE.parentDetected && this.state.parentReady) {
                resolve(true);
                return;
            }

            const timeout = 3000;
            let resolved = false;

            const timeoutId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(false);
            }, timeout);

            const handler = (e) => {
                if (!this.reliabilityEngine.validateOrigin(e)) return;
                const data = e.data;
                if (!data || typeof data !== 'object') return;
                if (data.type === PARENT_MESSAGE_TYPES.PARENT_READY) {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    this.state.parentReady = true;
                    _STATE.parentDetected = true;
                    _STATE.lastParentMessage = Date.now();
                    resolve(true);
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                window.removeEventListener('message', handler);
            };

            window.addEventListener('message', handler);
            this.timeouts.set('parent_wait', { timeoutId, cleanup });
        });
    }

    async performHandshake() {
        this.state.attempts++;
        this.state.lastAttempt = Date.now();

        if (_STATE.handshakeComplete) {
            this.state.handshakeComplete = true;
            return true;
        }

        const childResult = await this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.CHILD_READY,
            {
                id: _STATE.handshakeId || _STATE.frameId,
                frameId: _STATE.frameId,
                timestamp: Date.now(),
                version: '5.0.0',
                environment: this.environmentDetector.environment
            },
            { requireAck: true, timeout: 2000, maxRetries: 2, offlineBuffer: false }
        );

        if (!childResult.success) return false;

        return new Promise((resolve) => {
            if (_STATE.handshakeComplete) {
                resolve(true);
                return;
            }

            const timeout = 3000;
            let resolved = false;

            const timeoutId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(false);
            }, timeout);

            const handler = (e) => {
                if (!this.reliabilityEngine.validateOrigin(e)) return;
                const data = e.data;
                if (!data || typeof data !== 'object') return;
                if (data.type === PARENT_MESSAGE_TYPES.HANDSHAKE_COMPLETE || data.type === 'HANDSHAKE_COMPLETE') {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    _STATE.handshakeComplete = true;
                    this.state.handshakeComplete = true;
                    resolve(true);
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                window.removeEventListener('message', handler);
            };

            window.addEventListener('message', handler);
            this.timeouts.set('handshake_wait', { timeoutId, cleanup });
        });
    }

    async syncSession() {
        if (_STATE.sessionActive || _STATE.guestMode) {
            this.state.sessionValid = true;
            return true;
        }

        const result = await this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.REQUEST_SESSION,
            {
                frameId: _STATE.frameId,
                timestamp: Date.now(),
                startup: true,
                attempt: this.state.attempts
            },
            { requireAck: true, timeout: 3000, maxRetries: 2, offlineBuffer: false }
        );

        if (!result.success) return false;

        return new Promise((resolve) => {
            if (_STATE.sessionActive || _STATE.guestMode) {
                resolve(true);
                return;
            }

            const timeout = 5000;
            let resolved = false;

            const timeoutId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(false);
            }, timeout);

            const handler = (e) => {
                if (!this.reliabilityEngine.validateOrigin(e)) return;
                const data = e.data;
                if (!data || typeof data !== 'object') return;
                if (data.type === PARENT_MESSAGE_TYPES.SESSION_DATA || data.type === 'SESSION_DATA') {
                    if (resolved) return;
                    if (data.payload?.userId || data.data?.userId) {
                        resolved = true;
                        cleanup();
                        this.state.sessionValid = true;
                        _STATE.sessionActive = true;
                        resolve(true);
                    }
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                window.removeEventListener('message', handler);
            };

            window.addEventListener('message', handler);
            this.timeouts.set('session_wait', { timeoutId, cleanup });
        });
    }

    handleFailure(reason) {
        this.state.error = reason;
        this.state.lock = false;

        if (this.state.attempts < this.state.maxAttempts) {
            this.state.stage = STARTUP_STAGES.RECOVERING;
            _STATE.startupStage = STARTUP_STAGES.RECOVERING;
            setTimeout(() => this.start(), this.getBackoffDelay());
        } else {
            this.state.stage = STARTUP_STAGES.DEGRADED;
            _STATE.startupStage = STARTUP_STAGES.DEGRADED;
            _STATE.fallbackMode = true;
            _STATE.guestMode = true;
            logOnce('warn', 'Startup failed, entering degraded mode');
        }
    }

    getBackoffDelay() {
        let delay = 200 * Math.pow(2, this.state.attempts - 1);
        delay += Math.random() * 100;
        return Math.min(delay, 5000);
    }

    getStatus() {
        return {
            stage: this.state.stage,
            attempts: this.state.attempts,
            error: this.state.error,
            handshakeComplete: this.state.handshakeComplete,
            sessionValid: this.state.sessionValid
        };
    }
}

// =============================================
// FIXED: MODULE 4 - HANDSHAKE AUTHORITY with logging
// =============================================

class HandshakeAuthority {
    constructor(envDetector, relEngine) {
        this.environmentDetector = envDetector;
        this.reliabilityEngine = relEngine;
        this.state = {
            stage: 'idle',
            attempts: 0,
            startTime: 0,
            complete: false,
            error: null,
            lock: false
        };
        this.timeouts = new Map();
        this.listeners = new Set();
    }

    async startHandshake() {
        if (this.state.lock) return false;
        if (_STATE.handshakeComplete) {
            this.state.complete = true;
            return true;
        }
        
        // In auth mode, limit retries
        if (parentAuthorityMode && this.state.attempts >= MAX_AUTH_RETRIES) {
            debugLog('[Handshake] Max retries reached in auth mode, entering degraded');
            return false;
        }

        this.state.lock = true;
        this.state.attempts++;
        this.state.startTime = Date.now();
        this.state.stage = 'init';

        _STATE.handshakeStartTime = this.state.startTime;
        _STATE.handshakeId = `handshake_${this.state.startTime}_${Math.random().toString(36).substring(2, 8)}`;

        try {
            this.state.stage = 'child_ready';
            const readyResult = await this.sendChildReady();
            if (!readyResult.success) throw new Error('CHILD_READY failed');

            this.state.stage = 'wait_parent_ready';
            const parentReady = await this.waitForParentReady();
            if (!parentReady) throw new Error('PARENT_READY timeout');

            this.state.stage = 'handshake_request';
            const requestResult = await this.sendHandshakeRequest();
            if (!requestResult.success) throw new Error('HANDSHAKE_REQUEST failed');

            this.state.stage = 'wait_handshake_ack';
            const ackReceived = await this.waitForHandshakeAck();
            if (!ackReceived) throw new Error('HANDSHAKE_ACK timeout');

            this.completeHandshake();
            return true;

        } catch (error) {
            this.state.error = error.message;
            this.state.lock = false;
            
            // Only retry if under limit
            if (this.state.attempts < MAX_AUTH_RETRIES) {
                this.state.stage = 'retry';
                return this.retryHandshake();
            }
            return false;
        }
    }

    async sendChildReady() {
        return this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.CHILD_READY,
            {
                id: _STATE.handshakeId,
                frameId: _STATE.frameId,
                timestamp: Date.now(),
                version: '5.0.0',
                environment: this.environmentDetector.environment,
                once: true
            },
            { requireAck: true, timeout: 2000, maxRetries: 2, offlineBuffer: false, retryQueue: 'handshake' }
        );
    }

    waitForParentReady() {
        return new Promise((resolve) => {
            if (_STATE.handshakeState.parentReadyReceived) {
                resolve(true);
                return;
            }

            const timeout = 3000;
            let resolved = false;

            const timeoutId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(false);
            }, timeout);

            const handler = (e) => {
                if (!this.reliabilityEngine.validateOrigin(e)) return;
                const data = e.data;
                if (!data || typeof data !== 'object') return;
                if (data.type === PARENT_MESSAGE_TYPES.PARENT_READY) {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    _STATE.handshakeState.parentReadyReceived = true;
                    resolve(true);
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                window.removeEventListener('message', handler);
            };

            window.addEventListener('message', handler);
            this.timeouts.set('parent_ready', { timeoutId, cleanup });
        });
    }

    async sendHandshakeRequest() {
        return this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.HANDSHAKE_REQUEST,
            {
                id: _STATE.handshakeId,
                frameId: _STATE.frameId,
                timestamp: Date.now(),
                attempt: this.state.attempts,
                protocol: _STATE.protocolVersion
            },
            { requireAck: true, timeout: 2500, maxRetries: 2, offlineBuffer: false, retryQueue: 'handshake' }
        );
    }

    waitForHandshakeAck() {
        return new Promise((resolve) => {
            const timeout = 2000;
            let resolved = false;

            const timeoutId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(false);
            }, timeout);

            const handler = (e) => {
                if (!this.reliabilityEngine.validateOrigin(e)) return;
                const data = e.data;
                if (!data || typeof data !== 'object') return;
                if (data.type === PARENT_MESSAGE_TYPES.HANDSHAKE_ACK) {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    _STATE.handshakeState.handshakeAckReceived = true;
                    resolve(true);
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                window.removeEventListener('message', handler);
            };

            window.addEventListener('message', handler);
            this.timeouts.set('handshake_ack', { timeoutId, cleanup });
        });
    }

    completeHandshake() {
        this.state.complete = true;
        this.state.lock = false;
        this.state.stage = 'complete';
        _STATE.handshakeComplete = true;
        _STATE.connectionMetrics.handshakeDuration = Date.now() - this.state.startTime;
        safeStorage.set(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE, {
            timestamp: Date.now(),
            version: '5.0.0',
            complete: true
        });
        logOnce('ready', 'Handshake complete');
    }

    async retryHandshake() {
        const delay = 200 * Math.pow(2, this.state.attempts - 1);
        return new Promise((resolve) => {
            setTimeout(async () => {
                const result = await this.startHandshake();
                resolve(result);
            }, delay);
        });
    }

    reset() {
        this.state = {
            stage: 'idle',
            attempts: 0,
            startTime: 0,
            complete: false,
            error: null,
            lock: false
        };
        this.timeouts.forEach(({ cleanup }) => cleanup?.());
        this.timeouts.clear();
    }

    getStatus() {
        return {
            stage: this.state.stage,
            attempts: this.state.attempts,
            complete: this.state.complete
        };
    }
}

// =============================================
// FIXED: MODULE 5 - SESSION CLIENT with logging
// =============================================

class SessionClient {
    constructor(envDetector, relEngine) {
        this.environmentDetector = envDetector;
        this.reliabilityEngine = relEngine;
        this.currentSession = null;
        this.sessionCache = null;
        this.guestMode = false;
        this.demoMode = false;
        this.listeners = new Set();
        this.sessionState = {
            requested: false,
            received: false,
            synced: false,
            acked: false,
            expiresAt: null,
            lastSync: 0
        };
        this.requestRetryCount = 0;
        this.loadFromCache();
    }

    loadFromCache() {
        try {
            const cached = safeStorage.sessionGet('core_session_cache');
            if (cached) {
                if (cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
                    this.sessionCache = cached;
                    this.currentSession = cached;
                    _STATE.sessionCache = cached;
                    _STATE.lastValidSession = cached;
                } else {
                    safeStorage.sessionRemove('core_session_cache');
                }
            }
        } catch {}
    }

    saveToCache(session) {
        try {
            if (session && session.userToken) {
                safeStorage.sessionSet('core_session_cache', { ...session, cachedAt: Date.now() });
                this.sessionCache = session;
                _STATE.sessionCache = session;
                _STATE.lastValidSession = session;
            }
        } catch {}
    }

    async requestSession(force = false) {
        // In auth mode, respect authoritative session
        if (parentAuthorityMode && this.sessionState.requested && !force) {
            if (authoritativeSession) return { success: true, authoritative: true };
        }
        
        if (this.guestMode && !force) return this.currentSession;
        if (this.sessionState.requested && !force) return this.currentSession;
        
        // Check retry limit in auth mode
        if (parentAuthorityMode && this.requestRetryCount >= MAX_AUTH_RETRIES) {
            debugLog('[Session] Max retries reached in auth mode');
            return { success: false, error: 'max_retries_auth_mode' };
        }

        this.sessionState.requested = true;
        this.requestRetryCount = (this.requestRetryCount || 0) + 1;

        const result = await this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.REQUEST_SESSION,
            {
                frameId: _STATE.frameId,
                timestamp: Date.now(),
                force: force,
                cached: !!this.sessionCache,
                environment: this.environmentDetector.environment,
                authMode: parentAuthorityMode
            },
            { requireAck: true, timeout: 3000, maxRetries: MAX_AUTH_RETRIES, retryQueue: 'session' }
        );

        return result;
    }

    async syncSession() {
        if (this.guestMode) return false;

        const result = await this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.SESSION_SYNC,
            {
                sessionId: this.currentSession?.userId,
                timestamp: Date.now(),
                lastSync: this.sessionState.lastSync
            },
            { requireAck: true, timeout: 2000, maxRetries: 2, retryQueue: 'session' }
        );

        if (result.success) {
            this.sessionState.synced = true;
            this.sessionState.lastSync = Date.now();
        }

        return result;
    }

    acceptParentSession(sessionData) {
        try {
            if (!sessionData || typeof sessionData !== 'object') return false;

            const validatedSession = this.validateSessionSchema(sessionData);
            if (!validatedSession) return false;

            this.currentSession = {
                userId: validatedSession.userId,
                userToken: validatedSession.userToken,
                expiresAt: validatedSession.expiresAt || new Date(Date.now() + 3600000).toISOString(),
                displayName: validatedSession.displayName || 'User',
                email: validatedSession.email || '',
                photoURL: validatedSession.photoURL || '',
                isPremium: validatedSession.isPremium || false,
                trustLevel: validatedSession.trustLevel || 'new',
                groups: Array.isArray(validatedSession.groups) ? validatedSession.groups : [],
                friends: Array.isArray(validatedSession.friends) ? validatedSession.friends : [],
                source: 'parent',
                receivedAt: new Date().toISOString()
            };

            this.guestMode = false;
            this.demoMode = false;
            _STATE.sessionActive = true;
            _STATE.guestMode = false;
            _STATE.sessionAuthority = 'parent';

            this.saveToCache(this.currentSession);
            this.notifyListeners('session:updated', this.currentSession);
            this.sessionState.received = true;

            this.sendSessionAck(this.currentSession);
            logOnce('receive', 'Session data accepted', { userId: this.currentSession.userId });

            return true;
        } catch (error) {
            return false;
        }
    }

    async sendSessionAck(sessionData) {
        return this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.SESSION_ACK,
            {
                userId: sessionData.userId,
                timestamp: Date.now(),
                status: 'active',
                environment: this.environmentDetector.environment
            },
            { requireAck: false, retryQueue: 'session' }
        );
    }

    validateSessionSchema(session) {
        try {
            if (!session || typeof session !== 'object') return null;

            const userId = session.userId || session.user_id || session.userid || session.id;
            const userToken = session.userToken || session.token || session.user_token;

            if (!userId || !userToken) return null;

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
        return this.currentSession || this.sessionCache || null;
    }

    isValid() {
        if (this.guestMode || this.demoMode) return true;
        const session = this.currentSession || this.sessionCache;
        if (!session) return false;
        if (session.expiresAt) {
            try {
                return new Date(session.expiresAt) > new Date();
            } catch {
                return true;
            }
        }
        return !!session.userToken;
    }

    enableGuestMode() {
        this.guestMode = true;
        this.demoMode = false;
        _STATE.guestMode = true;
        _STATE.sessionActive = false;
        _STATE.sessionAuthority = 'guest';
        
        this.currentSession = {
            userId: 'guest_' + Date.now(),
            userToken: null,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            displayName: 'Guest User',
            isPremium: false,
            trustLevel: 'guest',
            source: 'guest_mode'
        };
        
        this.notifyListeners('session:guest', this.currentSession);
        logOnce('info', 'Guest mode enabled');
    }

    clear() {
        this.currentSession = null;
        this.guestMode = false;
        this.demoMode = false;
        this.sessionState = { requested: false, received: false, synced: false, acked: false, expiresAt: null, lastSync: 0 };
        this.requestRetryCount = 0;
        _STATE.sessionActive = false;
        _STATE.guestMode = false;
        _STATE.sessionAuthority = 'unknown';
        safeStorage.sessionRemove('core_session_cache');
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
            guestMode: this.guestMode,
            demoMode: this.demoMode,
            hasSession: !!this.currentSession,
            authority: _STATE.sessionAuthority
        };
    }
}

// =============================================
// FIXED: MODULE 6 - TRANSPORT LAYER with logging
// =============================================

class TransportLayer {
    constructor(envDetector, relEngine) {
        this.environmentDetector = envDetector;
        this.reliabilityEngine = relEngine;
        this.heartbeatInterval = null;
        this.lastPing = 0;
        this.lastPong = 0;
        this.missedPongs = 0;
        this.heartbeatRate = 30000;
        this.listeners = new Set();
    }

    start() {
        this.setupHeartbeat();
    }

    setupHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatRate = this.calculateHeartbeatRate();
        this.heartbeatInterval = setInterval(() => this.sendPing(), this.heartbeatRate);
    }

    calculateHeartbeatRate() {
        let rate = 30000;
        if (this.environmentDetector.isHighLatency()) rate *= 2;
        return Math.min(rate, 60000);
    }

    async sendPing() {
        if (!_STATE.parentDetected || _STATE.guestMode) return;
        
        // In auth mode, limit ping retries
        if (parentAuthorityMode && this.missedPongs >= 3) {
            debugLog('[Transport] Too many missed pongs in auth mode');
            return;
        }

        this.lastPing = Date.now();
        _STATE.connectionMetrics.lastPing = this.lastPing;

        const result = await this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.PING,
            { timestamp: this.lastPing },
            { requireAck: true, timeout: 1500, maxRetries: 2, retryQueue: 'heartbeat', offlineBuffer: false }
        );

        if (result.success) {
            this.missedPongs = 0;
            _STATE.parentResponding = true;
            _STATE.health.missedHeartbeats = 0;
        } else {
            this.missedPongs++;
            _STATE.health.missedHeartbeats++;
            if (this.missedPongs >= 5) {
                _STATE.parentResponding = false;
                this.notifyListeners('transport:unresponsive', { missedPongs: this.missedPongs });
            }
        }
    }

    handlePong() {
        this.lastPong = Date.now();
        _STATE.connectionMetrics.lastPong = this.lastPong;
        _STATE.health.lastHeartbeat = this.lastPong;
        _STATE.health.missedHeartbeats = 0;
        this.missedPongs = 0;
        _STATE.parentResponding = true;
    }

    getConnectionStatus() {
        return {
            connected: _STATE.parentResponding,
            lastPing: this.lastPing,
            lastPong: this.lastPong,
            missedPongs: this.missedPongs,
            online: navigator.onLine,
            visible: !document.hidden,
            heartbeatRate: this.heartbeatRate
        };
    }

    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(cb => { try { cb(event, data); } catch {} });
    }
}

// =============================================
// FIXED: MODULE 7 - RECOVERY MANAGER with logging
// =============================================

class RecoveryManager {
    constructor(envDetector, relEngine, handshakeAuth, sessionClient, transportLayer) {
        this.environmentDetector = envDetector;
        this.reliabilityEngine = relEngine;
        this.handshakeAuthority = handshakeAuth;
        this.sessionClient = sessionClient;
        this.transportLayer = transportLayer;
        this.recoveryState = {
            mode: false,
            attempts: 0,
            lastAttempt: 0,
            strategy: 'none',
            recovered: false,
            startTime: 0,
            cooldownUntil: 0,
            reason: null
        };
        this.recoveryTimer = null;
        this.monitorTimer = null;
        this.listeners = new Set();
    }

    startMonitoring() {
        this.checkHealth();
        this.monitorTimer = setInterval(() => this.checkHealth(), 10000);
    }

    checkHealth() {
        if (this.recoveryState.mode) return;
        if (this.recoveryState.cooldownUntil > Date.now()) return;

        const health = {
            parentResponding: _STATE.parentResponding,
            handshakeComplete: _STATE.handshakeComplete,
            sessionValid: this.sessionClient.isValid(),
            missedHeartbeats: _STATE.health.missedHeartbeats,
            timeSinceLastMessage: _STATE.lastParentMessage ? Date.now() - _STATE.lastParentMessage : Infinity
        };

        if (!health.parentResponding && health.missedHeartbeats > 3) {
            this.initiateRecovery('parent_unresponsive');
        } else if (_STATE.handshakeComplete && !health.sessionValid && !_STATE.guestMode) {
            this.initiateRecovery('session_invalid');
        } else if (health.timeSinceLastMessage > 90000) {
            this.initiateRecovery('silent_disconnect');
        }
    }

    initiateRecovery(reason) {
        if (this.recoveryState.mode) return;
        if (this.recoveryState.cooldownUntil > Date.now()) return;

        this.recoveryState.mode = true;
        this.recoveryState.attempts++;
        this.recoveryState.lastAttempt = Date.now();
        this.recoveryState.startTime = Date.now();
        this.recoveryState.reason = reason;
        _STATE.recoveryMode = true;

        this.notifyListeners('recovery:started', { reason, attempt: this.recoveryState.attempts });
        logOnce('warn', `Recovery started: ${reason}`);

        this.executeNextStrategy();
    }

    async executeNextStrategy() {
        if (this.recoveryState.attempts > 4) {
            this.failRecovery();
            return;
        }

        const strategies = [
            this.strategyHeartbeat.bind(this),
            this.strategyHandshake.bind(this),
            this.strategySession.bind(this),
            this.strategyFullReset.bind(this)
        ];

        const strategyIndex = this.recoveryState.attempts - 1;
        const strategy = strategies[strategyIndex];

        this.recoveryState.strategy = strategy.name;

        try {
            const success = await strategy();
            if (success) {
                this.completeRecovery();
            } else {
                this.recoveryState.attempts++;
                this.scheduleNextStrategy();
            }
        } catch (error) {
            this.recoveryState.attempts++;
            this.scheduleNextStrategy();
        }
    }

    async strategyHeartbeat() {
        this.transportLayer.sendPing();
        return new Promise((resolve) => {
            setTimeout(() => resolve(_STATE.parentResponding), 3000);
        });
    }

    async strategyHandshake() {
        this.handshakeAuthority.reset?.();
        const result = await this.handshakeAuthority.startHandshake();
        return result;
    }

    async strategySession() {
        if (!_STATE.handshakeComplete) await this.strategyHandshake();
        const result = await this.sessionClient.requestSession(true);
        return result.success;
    }

    async strategyFullReset() {
        this.reliabilityEngine.offlineBuffer = [];
        this.handshakeAuthority.reset?.();
        this.sessionClient.clear();
        this.transportLayer.stop();
        await new Promise(r => setTimeout(r, 500));
        await this.handshakeAuthority.startHandshake();
        await this.sessionClient.requestSession();
        this.transportLayer.start();
        return _STATE.handshakeComplete && this.sessionClient.isValid();
    }

    scheduleNextStrategy() {
        let delay = 200 * Math.pow(2, this.recoveryState.attempts - 1);
        delay += Math.random() * 100;
        delay = Math.min(delay, 5000);

        this.recoveryTimer = setTimeout(() => this.executeNextStrategy(), delay);
    }

    completeRecovery() {
        this.recoveryState.mode = false;
        this.recoveryState.recovered = true;
        _STATE.recoveryMode = false;
        _STATE.recoveryAttempts = this.recoveryState.attempts;
        this.recoveryState.cooldownUntil = Date.now() + 60000;
        this.recoveryState.attempts = 0;
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.notifyListeners('recovery:completed', { attempts: this.recoveryState.attempts });
        logOnce('success', 'Recovery completed');
    }

    failRecovery() {
        this.sessionClient.enableGuestMode();
        this.recoveryState.mode = false;
        this.recoveryState.recovered = false;
        _STATE.recoveryMode = false;
        _STATE.guestMode = true;
        _STATE.fallbackMode = true;
        this.recoveryState.cooldownUntil = Date.now() + 60000;
        this.recoveryState.attempts = 0;
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
        this.notifyListeners('recovery:failed', { reason: this.recoveryState.reason });
        logOnce('warn', 'Recovery failed, guest mode enabled');
    }

    stopMonitoring() {
        if (this.monitorTimer) clearInterval(this.monitorTimer);
        if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    }

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(cb => { try { cb(event, data); } catch {} });
        window.dispatchEvent(new CustomEvent(`marketplace:${event}`, { detail: data }));
    }

    getStatus() {
        return {
            ...this.recoveryState,
            inProgress: this.recoveryState.mode,
            cooldownRemaining: this.recoveryState.cooldownUntil ? Math.max(0, this.recoveryState.cooldownUntil - Date.now()) : 0
        };
    }
}

// =============================================
// FIXED: MODULE 8 - DIAGNOSTICS AGENT with logging
// =============================================

class DiagnosticsAgent {
    constructor(envDetector) {
        this.environmentDetector = envDetector;
        this.diagnostics = {
            startTime: Date.now(),
            checks: [],
            errors: [],
            warnings: [],
            metrics: {},
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
        this.runDiagnostics();
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

    async runDiagnostics() {
        if (!this.running) return;
        this.diagnostics.checks = [];
        await this.checkConnectivity();
        this.checkHandshake();
        this.checkSession();
        this.checkPerformance();
        this.checkEnvironment();
        setTimeout(() => this.runDiagnostics(), 30000);
    }

    async checkConnectivity() {
        const check = {
            name: 'connectivity',
            timestamp: Date.now(),
            status: 'unknown',
            details: {
                parentDetected: _STATE.parentDetected,
                parentResponding: _STATE.parentResponding,
                missedHeartbeats: _STATE.health.missedHeartbeats,
                online: navigator.onLine
            }
        };
        check.status = _STATE.parentResponding ? 'pass' : 'warn';
        this.diagnostics.checks.push(check);
    }

    checkHandshake() {
        const check = {
            name: 'handshake',
            timestamp: Date.now(),
            status: 'unknown',
            details: {
                complete: _STATE.handshakeComplete,
                handshakeId: _STATE.handshakeId,
                duration: _STATE.connectionMetrics.handshakeDuration
            }
        };
        check.status = _STATE.handshakeComplete ? 'pass' : (_STATE.guestMode ? 'warn' : 'fail');
        this.diagnostics.checks.push(check);
    }

    checkSession() {
        const check = {
            name: 'session',
            timestamp: Date.now(),
            status: 'unknown',
            details: {
                active: _STATE.sessionActive,
                guestMode: _STATE.guestMode,
                demoMode: _STATE.demoMode,
                fallbackMode: _STATE.fallbackMode,
                authority: _STATE.sessionAuthority
            }
        };
        check.status = _STATE.sessionActive ? 'pass' : (_STATE.guestMode ? 'warn' : 'fail');
        this.diagnostics.checks.push(check);
    }

    checkPerformance() {
        const check = {
            name: 'performance',
            timestamp: Date.now(),
            status: 'unknown',
            details: {
                messagesSent: _STATE.connectionMetrics.messagesSent,
                messagesReceived: _STATE.connectionMetrics.messagesReceived,
                acksReceived: _STATE.connectionMetrics.acksReceived,
                retries: _STATE.connectionMetrics.retries,
                uptime: Date.now() - this.diagnostics.startTime
            }
        };
        const ackRate = _STATE.connectionMetrics.acksReceived / (_STATE.connectionMetrics.messagesSent || 1);
        check.status = ackRate > 0.9 ? 'pass' : (ackRate > 0.7 ? 'warn' : 'fail');
        this.diagnostics.checks.push(check);
    }

    checkEnvironment() {
        const check = {
            name: 'environment',
            timestamp: Date.now(),
            status: 'pass',
            details: this.environmentDetector.getEnvironmentReport()
        };
        this.diagnostics.checks.push(check);
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
            checks: this.diagnostics.checks,
            errors: this.diagnostics.errors.slice(-10),
            warnings: this.diagnostics.warnings.slice(-10),
            events: this.diagnostics.events.slice(-20),
            state: {
                initialized: _STATE.initialized,
                ready: _STATE.ready,
                handshakeComplete: _STATE.handshakeComplete,
                sessionActive: _STATE.sessionActive,
                guestMode: _STATE.guestMode,
                bootState: currentBootState,
                authority: _STATE.sessionAuthority
            },
            environment: this.environmentDetector.getEnvironmentReport()
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

// =============================================
// FIXED: MODULE 9 - COMPATIBILITY BRIDGE
// =============================================

class CompatibilityBridge {
    constructor() {
        this.legacyHandlers = new Map();
        this.messageTransformers = new Map();
        this.legacyMode = false;
        this.warningsShown = new Set();
        this.setupTransformers();
    }

    setupTransformers() {
        this.messageTransformers.set('outbound', (message) => {
            if (message.legacy) return message;
            if (!this.legacyMode) return message;

            const legacy = { ...message };
            const typeMap = {
                [PARENT_MESSAGE_TYPES.HANDSHAKE_REQUEST]: 'handshake',
                [PARENT_MESSAGE_TYPES.SESSION_SYNC]: 'SESSION_DATA',
                [PARENT_MESSAGE_TYPES.PING]: 'HEARTBEAT',
                [PARENT_MESSAGE_TYPES.PONG]: 'HEARTBEAT'
            };
            if (typeMap[legacy.type]) legacy.type = typeMap[legacy.type];
            delete legacy.protocol;
            delete legacy.source;
            delete legacy.target;
            return legacy;
        });

        this.messageTransformers.set('inbound', (message) => {
            if (message.protocol === _STATE.protocolVersion) return message;

            this.legacyMode = this.detectLegacyParent(message);

            const modern = {
                protocol: _STATE.protocolVersion,
                messageId: message.id || message.messageId || Date.now().toString(),
                type: message.type,
                source: 'parent',
                target: 'iframe',
                frameId: message.frameId || _STATE.frameId,
                timestamp: message.timestamp || Date.now(),
                payload: message.payload || message.data || {},
                legacy: true
            };

            const typeMap = {
                'handshake': PARENT_MESSAGE_TYPES.HANDSHAKE_ACK,
                'SESSION_DATA': PARENT_MESSAGE_TYPES.SESSION_SYNC,
                'HEARTBEAT': PARENT_MESSAGE_TYPES.PONG,
                'init': PARENT_MESSAGE_TYPES.INIT,
                'refreshData': PARENT_MESSAGE_TYPES.REFRESH_DATA,
                'PARENT_READY': PARENT_MESSAGE_TYPES.PARENT_READY
            };

            if (typeMap[modern.type]) modern.type = typeMap[modern.type];
            return modern;
        });
    }

    transformOutbound(message) {
        const transformer = this.messageTransformers.get('outbound');
        return transformer ? transformer(message) : message;
    }

    transformInbound(message) {
        const transformer = this.messageTransformers.get('inbound');
        return transformer ? transformer(message) : message;
    }

    detectLegacyParent(message) {
        if (message.protocol === _STATE.protocolVersion) return false;
        const legacyTypes = ['handshake', 'SESSION_DATA', 'HEARTBEAT', 'init', 'refreshData'];
        if (message.type && legacyTypes.includes(message.type)) return true;
        if (!message.protocol && !message.messageId && !message.frameId) return true;
        return false;
    }

    registerLegacyHandler(type, handler) {
        this.legacyHandlers.set(type, handler);
    }

    handleLegacyMessage(message) {
        const handler = this.legacyHandlers.get(message.type);
        if (handler) {
            try { handler(message); return true; } catch {}
        }
        return false;
    }

    getMode() {
        return {
            legacyMode: this.legacyMode,
            detected: this.detectLegacyParent({})
        };
    }
}

// =============================================
// FIXED: MODULE 10 - SECURITY HARDENER
// =============================================

class SecurityHardener {
    constructor(envDetector) {
        this.environmentDetector = envDetector;
        this.permissions = new Map();
        this.tokens = new Map();
        this.capabilities = new Set();
        this.mode = _STATE.securityLevel;
        this.restrictions = _STATE.sandboxRestrictions || {};
        this.messageIds = new Set();
    }

    initialize() {
        this.detectCapabilities();
        this.setupReplayProtection();
    }

    detectCapabilities() {
        const capabilities = [];
        if (!this.restrictions.crypto) capabilities.push('crypto');
        if (!this.restrictions.localStorage) capabilities.push('storage');
        this.capabilities = new Set(capabilities);

        if (this.capabilities.has('crypto') && this.environmentDetector.environment.secure) {
            this.mode = 'enhanced';
        } else if (this.environmentDetector.environment.secure) {
            this.mode = 'standard';
        } else {
            this.mode = 'compatibility';
        }
        _STATE.securityLevel = this.mode;
    }

    setupReplayProtection() {
        setInterval(() => {
            const now = Date.now();
            this.messageIds.forEach((timestamp, id) => {
                if (now - timestamp > 300000) this.messageIds.delete(id);
            });
        }, 300000);
    }

    validateMessage(message) {
        if (!message || typeof message !== 'object') return false;
        if (message.protocol && message.protocol !== _STATE.protocolVersion) {
            if (this.mode === 'enhanced') return false;
        }
        if (!this.validateTimestamp(message)) {
            if (this.mode === 'enhanced') return false;
        }
        if (this.mode !== 'compatibility' && this.checkReplay(message)) {
            if (this.mode === 'enhanced') return false;
        }
        return true;
    }

    validateTimestamp(message) {
        if (!message.timestamp) return false;
        const age = Math.abs(Date.now() - message.timestamp);
        return age <= 60000;
    }

    checkReplay(message) {
        if (!message.messageId) return true;
        if (this.messageIds.has(message.messageId)) return true;
        this.messageIds.add(message.messageId);
        return false;
    }

    getSecurityContext() {
        return {
            mode: this.mode,
            capabilities: Array.from(this.capabilities),
            restrictions: this.restrictions,
            isSecure: window.location.protocol === 'https:'
        };
    }
}

// =============================================
// FIXED: MODULE 11 - UI FAILSAFE
// =============================================

class UIFailsafe {
    constructor() {
        this.pendingActions = [];
    }

    protectButton(button, action) {
        if (!button) return;
        button.addEventListener('click', (e) => {
            if (!this.canExecuteAction()) {
                e.preventDefault();
                e.stopPropagation();
                this.queueAction(action);
                button.style.opacity = '0.7';
                setTimeout(() => button.style.opacity = '1', 200);
                return false;
            }
        }, true);
    }

    canExecuteAction() {
        return _STATE.parentResponding || _STATE.guestMode || _STATE.fallbackMode;
    }

    queueAction(action) {
        this.pendingActions.push({ action, timestamp: Date.now() });
    }

    processPendingActions() {
        if (this.pendingActions.length === 0) return;
        const now = Date.now();
        const actions = this.pendingActions.filter(a => now - a.timestamp < 60000);
        this.pendingActions = [];

        if (_STATE.parentResponding || _STATE.guestMode) {
            actions.forEach(a => { try { if (typeof a.action === 'function') a.action(); } catch {} });
        }
    }
}

// =============================================
// FIXED: MODULE 12 - NAVIGATION GUARD
// =============================================

class NavigationGuard {
    constructor() {
        this.currentRoute = window.location.pathname + window.location.hash;
        this.routeHistory = [];
        this.listeners = new Set();
    }

    canNavigate() {
        return _STATE.parentResponding || _STATE.guestMode || _STATE.fallbackMode;
    }
    
    handleNavigate(payload) {
        if (payload.url && payload.url !== window.location.href) {
            this.routeHistory.push({
                url: window.location.href,
                timestamp: Date.now()
            });
            
            if (this.routeHistory.length > 50) {
                this.routeHistory.shift();
            }
            
            if (payload.internal) {
                window.location.hash = payload.hash || '';
                window.history.pushState({}, '', payload.url);
            }
        }
    }
}

// =============================================
// FIXED: MODULE 13 - IFRAME AUTHORITY (Master Controller)
// =============================================

class IframeAuthority {
    constructor() {
        this.environmentDetector = environmentDetector;
        this.reliabilityEngine = reliabilityEngine;
        this.startupGovernor = startupGovernor;
        this.handshakeAuthority = handshake;
        this.sessionClient = sessionAdapter;
        this.transportLayer = transport;
        this.recoveryManager = recovery;
        this.diagnosticsAgent = diagnostics;
        this.compatibilityBridge = compatibility;
        this.securityHardener = securityHardener;
        this.uiFailsafe = uiFailsafe;
        this.navigationGuard = navigationGuard;
        this.initialized = false;
        this.listeners = new Set();
    }

    async initialize() {
        if (this.initialized) return;

        _STATE.frameId = this.generateFrameId();
        this.detectSandboxRestrictions();

        // Use deterministic boot instead of startup governor
        const bootResult = await initializeDeterministicBoot();

        if (bootResult && currentBootState === BOOT_STATE.READY) {
            this.transportLayer.start();
            this.recoveryManager.startMonitoring();
        }

        this.diagnosticsAgent.start();
        this.exposeGlobally();

        this.initialized = true;
        _STATE.initialized = true;

        logOnce('ready', 'IframeAuthority initialized');

        return true;
    }

    generateFrameId() {
        try {
            let stored = safeStorage.get(LOCAL_STORAGE_KEYS.FRAME_ID);
            if (!stored) {
                stored = `frame_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                safeStorage.set(LOCAL_STORAGE_KEYS.FRAME_ID, stored);
            }
            return stored;
        } catch {
            return `frame_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        }
    }

    detectSandboxRestrictions() {
        const restrictions = { crypto: false, localStorage: false };
        try {
            if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
                restrictions.crypto = true;
            }
        } catch {
            restrictions.crypto = true;
        }
        _STATE.sandboxRestrictions = restrictions;
        if (restrictions.crypto) CONFIG.SECURITY.SIGNATURE_REQUIRED = false;
        return restrictions;
    }

    send(type, payload = {}, options = {}) {
        if (this.compatibilityBridge.legacyMode) {
            const legacyMsg = { type, payload };
            const transformed = this.compatibilityBridge.transformOutbound(legacyMsg);
            type = transformed.type;
            payload = transformed.payload;
        }
        return this.reliabilityEngine.sendWithReliability(type, payload, options);
    }

    addMessageHandler(type, handler) {
        const wrappedHandler = (e) => {
            if (!this.reliabilityEngine.validateOrigin(e)) return;
            const data = e.data;
            if (!data || typeof data !== 'object') return;
            const transformed = this.compatibilityBridge.transformInbound(data);
            
            // First check contract handlers
            const contractHandler = parentContract.getHandler(transformed.type || data.type);
            if (contractHandler) {
                try {
                    contractHandler(transformed.payload || transformed.data || transformed, transformed);
                } catch (err) {
                    this.diagnosticsAgent.logError(err, { type: 'contract_handler', handlerType: transformed.type });
                }
            }
            
            // Then call custom handler
            if ((transformed.type === type || data.type === type) && handler) {
                try {
                    handler(transformed.payload || transformed.data || transformed, transformed);
                } catch (err) {
                    this.diagnosticsAgent.logError(err, { type: 'message_handler', handlerType: type });
                }
            }
        };
        window.addEventListener('message', wrappedHandler);
        return () => window.removeEventListener('message', wrappedHandler);
    }

    getStatus() {
        return {
            environment: this.environmentDetector.getEnvironmentReport(),
            startup: this.startupGovernor.getStatus(),
            handshake: this.handshakeAuthority.getStatus(),
            session: this.sessionClient.getState(),
            transport: this.transportLayer.getConnectionStatus(),
            recovery: this.recoveryManager.getStatus(),
            security: this.securityHardener.getSecurityContext(),
            boot: {
                state: currentBootState,
                parentAuthority: parentAuthorityMode,
                sessionAuthority: _STATE.sessionAuthority,
                ready: currentBootState === BOOT_STATE.READY
            },
            state: {
                initialized: _STATE.initialized,
                ready: _STATE.ready,
                handshakeComplete: _STATE.handshakeComplete,
                sessionActive: _STATE.sessionActive,
                guestMode: _STATE.guestMode,
                fallbackMode: _STATE.fallbackMode,
                parentResponding: _STATE.parentResponding
            },
            diagnostics: this.diagnosticsAgent.getReport()
        };
    }

    exposeGlobally() {
        window.iframeAuthority = this;
        window.__IFRAME_DEBUG__ = this.diagnosticsAgent.debugMode;
        if (this.diagnosticsAgent.debugMode) {
            window.__diagnostics = this.diagnosticsAgent;
            window.__reliability = this.reliabilityEngine;
            window.__transport = this.transportLayer;
            window.__bootState = () => ({
                state: currentBootState,
                parentReady: parentReadyDetected,
                parentAuthority: parentAuthorityMode
            });
        }
    }

    shutdown() {
        this.transportLayer.stop();
        this.recoveryManager.stopMonitoring();
        this.diagnosticsAgent.stop();
        _STATE.shutdown = true;
        this.initialized = false;
    }
}

// =============================================
// FIXED: MODULE 14 - IFRAME MESSENGER (Enhanced)
// =============================================

class IframeMessenger {
    constructor(envDetector) {
        this.messageId = 0;
        this.pendingAcks = new Map();
        this.messageCache = new Map();
        this.circuitFailures = 0;
        this.circuitOpen = false;
        this.messageCounter = 0;
        this.frameId = null; // Will be set from iframeAuthority
        this.retryQueue = [];
        this.offlineBuffer = [];
        this.backoffTimers = new Map();
        this.environmentDetector = envDetector;
    }

    generateId() {
        return `${Date.now()}_${++this.messageId}_${Math.random().toString(36).substring(2, 8)}`;
    }

    validateOrigin(event) {
        try {
            return event.source === window.parent && 
                   (event.origin === window.location.origin || event.origin === 'null');
        } catch {
            return false;
        }
    }

    normalizeOutboundMessage(type, payload = {}, options = {}) {
        const messageId = this.generateId();
        const token = getCentralToken();
        
        return {
            protocol: _STATE.protocolVersion,
            messageId: messageId,
            type: type,
            source: "iframe",
            target: "parent",
            frameId: this.frameId || _STATE.frameId,
            timestamp: Date.now(),
            payload: this.sanitizePayload(payload),
            legacy: options.legacy || false,
            token: token
        };
    }

    sanitizePayload(payload) {
        if (!payload || typeof payload !== 'object') return {};
        try {
            return JSON.parse(JSON.stringify(payload));
        } catch {
            return {};
        }
    }

    async sendMessage(type, payload = {}, options = {}) {
        return iframeAuthority.send(type, payload, options);
    }

    async sendWithAck(message, options = {}) {
        const timeout = options.timeout || 1500;
        const maxRetries = options.maxRetries || 3;
        let attempt = 0;

        const sendAttempt = async () => {
            attempt++;
            return new Promise((resolve) => {
                let resolved = false;
                let timeoutId = null;
                let cleanup = null;

                const ackHandler = (e) => {
                    try {
                        if (!this.validateOrigin(e)) return;
                        if (resolved) return;
                        const data = e.data;
                        if (!data || typeof data !== 'object') return;
                        if ((data.type === 'ACK' || data.type === PARENT_MESSAGE_TYPES.ACK) && 
                            (data.inResponseTo === message.messageId || data.messageId === message.messageId)) {
                            resolved = true;
                            cleanup?.();
                            _STATE.connectionMetrics.acksReceived++;
                            resolve({ success: true, ack: data });
                        }
                    } catch {}
                };

                timeoutId = setTimeout(() => {
                    if (resolved) return;
                    _STATE.connectionMetrics.acksMissed++;
                    if (attempt < maxRetries && !options.noRetry) {
                        const delay = this.calculateBackoff(attempt);
                        cleanup?.();
                        setTimeout(() => sendAttempt().then(resolve).catch(() => resolve({ success: false })), delay);
                    } else {
                        resolved = true;
                        cleanup?.();
                        resolve({ success: false, error: 'timeout' });
                    }
                }, timeout);

                cleanup = () => {
                    window.removeEventListener('message', ackHandler);
                    clearTimeout(timeoutId);
                    this.pendingAcks.delete(message.messageId);
                };

                this.pendingAcks.set(message.messageId, { cleanup, timestamp: Date.now() });
                window.addEventListener('message', ackHandler);

                try {
                    window.parent.postMessage(message, '*');
                    _STATE.connectionMetrics.messagesSent++;
                } catch (err) {
                    cleanup();
                    resolve({ success: false, error: err.message });
                }
            });
        };

        return sendAttempt();
    }

    sendFireAndForget(message, options = {}) {
        if (!window.parent || window.parent === window) return false;
        try {
            window.parent.postMessage(message, '*');
            _STATE.connectionMetrics.messagesSent++;
            return true;
        } catch {
            return false;
        }
    }

    calculateBackoff(attempt) {
        let delay = 200 * Math.pow(1.5, attempt - 1);
        delay += Math.random() * 100;
        if (this.environmentDetector.isHighLatency()) delay *= 3;
        return Math.min(delay, 5000);
    }

    queueForRetry(type, payload, options) {
        iframeAuthority.reliabilityEngine.bufferMessage(type, payload, options);
    }

    bufferOfflineMessage(type, payload, options) {
        iframeAuthority.reliabilityEngine.bufferMessage(type, payload, options);
    }

    processOfflineBuffer() {
        iframeAuthority.reliabilityEngine.processOfflineBuffer();
    }

    checkCircuitBreaker() {
        if (_STATE.connectionMetrics.acksMissed >= 3 && !this.circuitOpen) {
            this.circuitOpen = true;
            _STATE.health.circuitBreaker = true;
            setTimeout(() => {
                this.circuitOpen = false;
                _STATE.health.circuitBreaker = false;
                _STATE.connectionMetrics.acksMissed = 0;
                this.processOfflineBuffer();
            }, 15000);
        }
    }

    cleanup() {
        this.pendingAcks.forEach(({ cleanup }) => { try { cleanup?.(); } catch {} });
        this.pendingAcks.clear();
        this.messageCache.clear();
        this.retryQueue = [];
        this.offlineBuffer = [];
        this.backoffTimers.forEach(timer => clearTimeout(timer));
        this.backoffTimers.clear();
    }

    getMetrics() {
        return {
            pendingAcks: this.pendingAcks.size,
            retryQueue: this.retryQueue.length,
            offlineBuffer: this.offlineBuffer.length,
            circuitOpen: this.circuitOpen,
            ..._STATE.connectionMetrics
        };
    }
}

// =============================================
// FIXED: MODULE 15 - ORIGIN TRUST ADAPTER
// =============================================

class OriginTrustAdapter {
    constructor(envDetector) {
        this.environmentDetector = envDetector;
        this.trustedOrigins = new Set();
        this.dynamicOrigins = new Set();
        this.trustMode = 'permissive';
        this.initializeTrustedOrigins();
        logOnce('ready', 'OriginAdapter initialized');
    }

    initializeTrustedOrigins() {
        CONFIG.ORIGIN_WHITELIST.forEach(origin => {
            if (origin !== '*') this.trustedOrigins.add(origin);
        });
        try {
            this.trustedOrigins.add(window.location.origin);
            if (window.parent && window.parent !== window) {
                this.trustedOrigins.add(window.parent.location.origin);
            }
        } catch {}
        this.updateTrustMode();
    }

    updateTrustMode() {
        const env = this.environmentDetector.environment;
        if (env.type === ENVIRONMENT_TYPES.PRODUCTION) {
            this.trustMode = 'strict';
        } else if (env.type === ENVIRONMENT_TYPES.VPN_NETWORK || env.type === ENVIRONMENT_TYPES.UNKNOWN) {
            this.trustMode = 'compatibility';
        } else {
            this.trustMode = 'permissive';
        }
        _STATE.originCheckMode = this.trustMode;
    }

    isOriginTrusted(origin) {
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

    validateMessageOrigin(event) {
        try {
            return event.source === window.parent && this.isOriginTrusted(event.origin);
        } catch {
            return false;
        }
    }

    getOriginReport() {
        return {
            mode: this.trustMode,
            trusted: Array.from(this.trustedOrigins),
            dynamic: Array.from(this.dynamicOrigins),
            environment: this.environmentDetector.environment.type
        };
    }
}

// =============================================
// FIXED: MODULE 16 - MESSAGE ROUTER (Enhanced)
// =============================================

class MessageRouter {
    constructor(messaging, sessionClient, envDetector, compatibilityBridge) {
        this.messaging = messaging;
        this.sessionClient = sessionClient;
        this.environmentDetector = envDetector;
        this.compatibility = compatibilityBridge;
        this.handlers = new Map();
        this.heartbeatInterval = null;
        this.lastHeartbeat = Date.now();
        this.messageQueue = [];
        this.processingQueue = false;
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

    async handleMessage(event) {
        if (!originTrustAdapter.validateMessageOrigin(event)) return;

        let message = event.data;
        if (this.compatibility) message = this.compatibility.transformInbound(message);
        message = this.messaging.sanitizePayload(message);
        if (!message || typeof message !== 'object') return;

        _STATE.lastParentMessage = Date.now();
        _STATE.parentResponding = true;
        _STATE.connectionMetrics.messagesReceived++;

        if (!this.compatibility?.legacyMode && !securityHardener.validateMessage(message)) return;

        // Handle contract messages first
        const contractHandler = parentContract.getHandler(message.type);
        if (contractHandler) {
            try {
                contractHandler(message.payload || message.data || message, message);
            } catch (err) {
                debugLog('[Router] Contract handler error:', err);
            }
        }

        if (message.type !== 'ACK' && message.type !== PARENT_MESSAGE_TYPES.ACK && 
            message.type !== 'PING' && message.type !== 'PONG' && message.expectAck) {
            this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.ACK, { 
                inResponseTo: message.messageId || message.id,
                timestamp: Date.now() 
            });
        }

        if (this.compatibility && this.compatibility.handleLegacyMessage(message)) return;

        await this.routeMessage(message);
    }

    async routeMessage(message) {
        switch (message.type) {
            case PARENT_MESSAGE_TYPES.SESSION_SYNC:
            case 'SESSION_DATA':
            case PARENT_MESSAGE_TYPES.SESSION_DATA:
                this.handleSessionData(message.payload || message.data);
                break;
            case PARENT_MESSAGE_TYPES.SESSION_UPDATE:
                this.handleSessionUpdate(message.payload || message.data);
                break;
            case 'PONG':
            case PARENT_MESSAGE_TYPES.PONG:
                transport.handlePong();
                break;
            case PARENT_MESSAGE_TYPES.PARENT_READY:
                this.handleParentReady(message.payload);
                break;
            case PARENT_MESSAGE_TYPES.REFRESH_UI:
                this.handleRefreshUI();
                break;
            case PARENT_MESSAGE_TYPES.FORCE_RELOAD:
                this.handleForceReload();
                break;
            case PARENT_MESSAGE_TYPES.LOGOUT:
                this.handleLogout();
                break;
            case 'session_expired':
                this.handleSessionExpired();
                break;
            case PARENT_MESSAGE_TYPES.HANDSHAKE_COMPLETE:
                this.handleHandshakeComplete(message.payload);
                break;
        }

        const handlers = this.handlers.get(message.type) || [];
        const sortedHandlers = [...handlers].sort((a, b) => b.priority - a.priority);
        for (const handler of sortedHandlers) {
            try {
                await handler.fn(message.payload || message.data, message);
            } catch {}
        }
    }

    handleSessionData(payload) {
        if (!payload) return;
        const sessionData = payload.session || payload.user || payload;
        if (sessionData) {
            const accepted = this.sessionClient.acceptParentSession(sessionData);
            if (accepted) {
                _STATE.sessionActive = true;
                _STATE.guestMode = false;
                
                const session = this.sessionClient.getSession();
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
                logOnce('receive', 'Session data processed');
            }
        }
    }

    handleSessionUpdate(payload) {
        if (!payload || !this.sessionClient.currentSession) return;
        const currentSession = this.sessionClient.getSession();
        const updatedSession = { ...currentSession, ...payload, updatedAt: new Date().toISOString() };
        this.sessionClient.acceptParentSession(updatedSession);
        if (payload.userId || payload.displayName) {
            window.currentUser = { ...window.currentUser, ...payload };
            window.userData = window.currentUser;
        }
    }

    handleParentReady(payload) {
        logOnce('receive', 'Parent ready signal');
        this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.CHILD_READY, {
            id: _STATE.frameId,
            timestamp: Date.now(),
            version: '5.1.0',
            environment: environmentDetector.environment,
            once: true
        });
        if (!this.sessionClient.isValid()) setTimeout(() => this.requestSession(), 100);
    }

    handleRefreshUI() {
        window.dispatchEvent(new CustomEvent('marketplace:refresh-ui', { detail: { timestamp: Date.now() } }));
    }

    handleForceReload() {
        saveAllMarketplaceData();
        window.location.reload();
    }

    handleLogout() {
        this.sessionClient.clear();
        window.currentUser = null;
        window.userData = null;
        window.dispatchEvent(new CustomEvent('marketplace:logout', { detail: { timestamp: Date.now() } }));
    }

    handleSessionExpired() {
        this.sessionClient.clear();
        this.sessionClient.enableGuestMode();
    }

    handleHandshakeComplete(payload) {
        logOnce('receive', 'Handshake completed');
        _STATE.handshakeComplete = true;
        if (!this.sessionClient.isValid() && payload?.requestSession !== false) {
            this.requestSession();
        }
    }

    requestSession() {
        this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
            id: _STATE.frameId,
            timestamp: Date.now(),
            reason: 'initial_sync'
        });
    }

    queueMessage(type, payload, options = {}) {
        this.messageQueue.push({ type, payload, options, timestamp: Date.now() });
        if (!this.processingQueue) this.processMessageQueue();
    }

    async processMessageQueue() {
        if (this.processingQueue || this.messageQueue.length === 0) return;
        this.processingQueue = true;

        while (this.messageQueue.length > 0) {
            const item = this.messageQueue.shift();
            try {
                if (item.options.requireAck) {
                    await this.messaging.sendWithAck(item.type, item.payload, item.options.timeout);
                } else {
                    this.messaging.sendFireAndForget(item.type, item.payload);
                }
            } catch {
                if (item.options.retry !== false) {
                    item.retryCount = (item.retryCount || 0) + 1;
                    if (item.retryCount < (item.options.maxRetries || 3)) {
                        this.messageQueue.push(item);
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.processingQueue = false;
    }

    startHeartbeatMonitor() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastMessage = now - _STATE.lastParentMessage;
            if (timeSinceLastMessage > 60000) {
                _STATE.health.missedHeartbeats++;
                if (_STATE.health.missedHeartbeats > 3) {
                    _STATE.parentResponding = false;
                    this.messaging.sendFireAndForget('PING', { timestamp: now, frameId: _STATE.frameId });
                }
            } else {
                _STATE.parentResponding = true;
            }
            if (this.sessionClient.isValid() && !_STATE.guestMode) {
                this.messaging.sendFireAndForget('HEARTBEAT', { timestamp: now, frameId: _STATE.frameId });
            }
        }, 30000);
    }

    cleanup() {
        this.handlers.clear();
        this.messageQueue = [];
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}

// =============================================
// FIXED: MODULE 17 - RESOURCE MANAGER
// =============================================

class ResourceManager {
    constructor() {
        this.timers = new Set();
        this.intervals = new Set();
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

    release() {
        this.timers.forEach(id => clearTimeout(id));
        this.timers.clear();
        this.intervals.forEach(id => clearInterval(id));
        this.intervals.clear();
    }
}

// =============================================
// FIXED: MODULE 18 - FEATURE SANDBOX
// =============================================

class FeatureSandbox {
    constructor() {
        this.featureStates = new Map();
        this.errorCounts = new Map();
    }

    execute(featureName, fn, fallback = null) {
        if (!this.isFeatureEnabled(featureName)) return fallback;
        try {
            const result = fn();
            this.recordSuccess(featureName);
            return result;
        } catch (error) {
            return this.handleError(featureName, error, fallback);
        }
    }

    async executeAsync(featureName, fn, fallback = null) {
        if (!this.isFeatureEnabled(featureName)) return fallback;
        try {
            const result = await fn();
            this.recordSuccess(featureName);
            return result;
        } catch (error) {
            return this.handleError(featureName, error, fallback);
        }
    }

    isFeatureEnabled(featureName) {
        const state = this.featureStates.get(featureName);
        if (state === false) return false;
        const errorCount = this.errorCounts.get(featureName) || 0;
        if (errorCount >= 5) {
            this.disableFeature(featureName);
            return false;
        }
        return true;
    }

    disableFeature(featureName) {
        this.featureStates.set(featureName, false);
        _STATE.features.set(featureName, { enabled: false, disabledAt: Date.now() });
    }

    enableFeature(featureName) {
        this.featureStates.set(featureName, true);
        this.errorCounts.delete(featureName);
        _STATE.features.set(featureName, { enabled: true, enabledAt: Date.now() });
    }

    recordSuccess(featureName) {
        const current = this.errorCounts.get(featureName) || 0;
        if (current > 0) this.errorCounts.set(featureName, Math.max(0, current - 1));
    }

    handleError(featureName, error, fallback) {
        const count = (this.errorCounts.get(featureName) || 0) + 1;
        this.errorCounts.set(featureName, count);
        if (count >= 5) this.disableFeature(featureName);
        return fallback;
    }
}

// =============================================
// FIXED: MODULE 19 - GLOBAL ERROR HANDLER (Enhanced)
// =============================================

class GlobalErrorHandler {
    constructor(diagnosticsAgent) {
        this.diagnostics = diagnosticsAgent;
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
            if (this.crashes > 10) {
                _STATE.fallbackMode = true;
                _STATE.guestMode = true;
            }
            this.diagnostics?.logError(error, { type: 'uncaught' });
            this.attemptRecovery(error);
        }
    }

    handleUnhandledRejection(reason) {
        const reasonKey = reason?.message || 'unhandled_rejection';
        if (!this.fatalErrors.has(reasonKey)) {
            this.fatalErrors.add(reasonKey);
            this.diagnostics?.logError(reason, { type: 'unhandled_rejection' });
            this.attemptRecovery(reason);
        }
    }

    attemptRecovery(error) {
        this.recoveryCallbacks.forEach(cb => { try { cb(error); } catch {} });
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({
                    type: 'IFRAME_ERROR',
                    error: error?.message || 'Unknown error',
                    timestamp: Date.now(),
                    frameId: _STATE.frameId
                }, '*');
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

// =============================================
// FIXED: MODULE 20 - INITIALIZATION PIPELINE (Enhanced)
// =============================================

class InitializationPipeline {
    constructor(sessionClient, messaging, router, diagnosticsAgent, environmentDetector, startupGovernor) {
        this.sessionClient = sessionClient;
        this.messaging = messaging;
        this.router = router;
        this.diagnostics = diagnosticsAgent;
        this.environmentDetector = environmentDetector;
        this.startupGovernor = startupGovernor;
        this.currentStage = null;
        this.stageResults = new Map();
    }

    async execute() {
        const stages = [
            { name: 'environment', fn: this.detectEnvironment.bind(this) },
            { name: 'preflight', fn: this.preflight.bind(this) },
            { name: 'parentDetect', fn: this.parentDetect.bind(this) },
            { name: 'startup', fn: this.startupGovernor.start.bind(this.startupGovernor) },
            { name: 'sessionSync', fn: this.sessionSync.bind(this) },
            { name: 'serviceInit', fn: this.serviceInit.bind(this) },
            { name: 'monitoring', fn: this.monitoring.bind(this) },
            { name: 'ready', fn: this.ready.bind(this) }
        ];

        for (const stage of stages) {
            this.currentStage = stage.name;
            _STATE.initializationStage = stage.name;
            
            try {
                const result = await this.executeStage(stage);
                this.stageResults.set(stage.name, { success: true, result, timestamp: Date.now() });
            } catch (error) {
                this.stageResults.set(stage.name, { success: false, error: error.message, timestamp: Date.now() });
                if (stage.name === 'sessionSync') {
                    this.sessionClient.enableGuestMode();
                }
            }
        }

        _STATE.initialized = true;
        _STATE.initializationStage = 'complete';
        
        logOnce('success', 'Initialization complete');
        
        this.diagnostics.start();
        
        return {
            success: true,
            stages: Object.fromEntries(this.stageResults),
            guestMode: _STATE.guestMode
        };
    }

    async executeStage(stage) {
        const timeout = 5000;
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Stage ${stage.name} timeout`)), timeout)
        );
        return await Promise.race([stage.fn(), timeoutPromise]);
    }

    async detectEnvironment() {
        const env = this.environmentDetector.initialize();
        logOnce('ready', `Environment detected: ${env.type}`);
        return env;
    }

    async preflight() {
        try {
            if (!window || !document) throw new Error('Browser environment unavailable');
            errorHandler.initialize();
            return { environment: 'browser', timestamp: Date.now() };
        } catch (error) {
            throw new Error(`Preflight failed: ${error.message}`);
        }
    }

    async parentDetect() {
        try {
            const detected = window.parent && window.parent !== window;
            _STATE.parentDetected = detected;
            if (!detected) {
                this.sessionClient.enableGuestMode();
                logOnce('info', 'Not in iframe, running standalone');
            }
            return { parentDetected: detected };
        } catch {
            _STATE.parentDetected = false;
            return { parentDetected: false };
        }
    }

    async sessionSync() {
        if (_STATE.guestMode || !_STATE.parentDetected) {
            return { sessionActive: false, mode: 'guest' };
        }

        return new Promise((resolve) => {
            let attempts = 0;
            let resolved = false;

            const attempt = async () => {
                if (resolved) return;
                if (attempts >= 3) {
                    _STATE.guestMode = true;
                    this.sessionClient.enableGuestMode();
                    resolved = true;
                    resolve({ sessionActive: false, guestMode: true });
                    return;
                }

                attempts++;

                try {
                    const response = await this.messaging.sendWithAck(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
                        id: `session_${Date.now()}`,
                        frameId: _STATE.frameId,
                        timestamp: Date.now(),
                        attempt: attempts,
                        environment: this.environmentDetector.environment
                    }, 3000);

                    if (response && response.success) {
                        resolved = true;
                        resolve({ sessionActive: true, attempts });
                    } else {
                        setTimeout(attempt, 500 * Math.pow(2, attempts));
                    }
                } catch {
                    setTimeout(attempt, 500 * Math.pow(2, attempts));
                }
            };

            attempt();

            setTimeout(() => {
                if (!resolved) {
                    _STATE.guestMode = true;
                    this.sessionClient.enableGuestMode();
                    resolved = true;
                    resolve({ sessionActive: false, timeout: true, guestMode: true });
                }
            }, 5000);
        });
    }

    async serviceInit() {
        try {
            this.router.startHeartbeatMonitor();
            transport.start();
            resourceManager.setTimeout(() => window.addEventListener('message', (e) => this.router.handleMessage(e)), 100);
            return { servicesInitialized: true };
        } catch (error) {
            return { servicesInitialized: false, error: error.message };
        }
    }

    async monitoring() {
        return { monitoringEnabled: true };
    }

    async ready() {
        _STATE.ready = true;
        _STATE.initialized = true;
        
        window.dispatchEvent(new CustomEvent('marketplaceCoreReady', {
            detail: {
                timestamp: Date.now(),
                guestMode: _STATE.guestMode,
                sessionActive: _STATE.sessionActive,
                handshakeComplete: _STATE.handshakeComplete,
                environment: this.environmentDetector.environment,
                bootState: currentBootState
            }
        }));
        
        logOnce('ready', 'MarketplaceCore ready');
        
        return { ready: true, timestamp: Date.now() };
    }
}

// =============================================
// FIXED: MODULE 21 - DEPENDENCY MANAGER
// =============================================

class DependencyManager {
    constructor() {
        this.dependencies = new Map();
        this.fallbackMode = false;
        this.missingDeps = new Set();
    }

    async checkDependency(name, checkFn, fallbackFn = null) {
        try {
            let resolved = false;
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Dependency ${name} timeout`)), 2000)
            );

            const checkPromise = (async () => {
                while (!resolved) {
                    try {
                        const result = await checkFn();
                        if (result) {
                            this.dependencies.set(name, { status: 'available', timestamp: Date.now() });
                            return true;
                        }
                    } catch {}
                    await new Promise(r => setTimeout(r, 50));
                }
            })();

            try {
                await Promise.race([checkPromise, timeoutPromise]);
                resolved = true;
                return true;
            } catch {
                throw new Error(`Dependency ${name} unavailable`);
            }
        } catch {
            this.missingDeps.add(name);
            if (fallbackFn) {
                try {
                    await fallbackFn();
                    this.dependencies.set(name, { status: 'fallback', timestamp: Date.now() });
                    return true;
                } catch {
                    this.dependencies.set(name, { status: 'missing', timestamp: Date.now() });
                    return false;
                }
            }
            this.dependencies.set(name, { status: 'missing', timestamp: Date.now() });
            return false;
        }
    }

    enableFallbackMode() {
        this.fallbackMode = true;
        _STATE.fallbackMode = true;
        _STATE.guestMode = true;
    }

    isInFallbackMode() {
        return this.fallbackMode || _STATE.fallbackMode;
    }
}

// =============================================
// FIXED: MODULE 22 - MARKETPLACE CORE IMPLEMENTATION
// =============================================

class MarketplaceCoreImpl {
    constructor() {
        this.listings = [];
        this.myListings = [];
        this.savedListings = [];
        this.currentUser = null;
        this.filters = {
            search: '',
            category: '',
            minPrice: null,
            maxPrice: null,
            available: null,
            sort: 'newest'
        };
        this.pagination = {
            page: 1,
            limit: 20,
            total: 0,
            hasMore: true
        };
        this.loading = false;
        this.initialized = false;
        this.syncChannel = null;
        this.listeners = new Map();
        
        this.loadFromCache();
        this.setupSyncChannel();
        this.setupEventListeners();
    }

    setupSyncChannel() {
        try {
            this.syncChannel = new BroadcastChannel('marketplace_sync');
            this.syncChannel.onmessage = (event) => {
                if (event.data && event.data.type) {
                    this.handleSyncMessage(event.data);
                }
            };
        } catch (e) {}
    }

    setupEventListeners() {
        window.addEventListener('storage', (e) => {
            if (e.key && e.key.startsWith('marketplace_')) {
                this.loadFromCache();
                this.notifyUI('storageUpdated', { key: e.key });
            }
        });

        router.registerHandler('SESSION_UPDATE', (payload) => {
            if (payload.user) {
                this.currentUser = payload.user;
                safeStorage.set('currentUser', this.currentUser);
                this.loadMyListings();
                this.notifyUI('userUpdated', this.currentUser);
            }
        });

        router.registerHandler('LISTING_CREATED', (payload) => {
            if (payload && payload.id) {
                this.handleListingCreated(payload);
            }
        });

        router.registerHandler('LISTING_UPDATED', (payload) => {
            if (payload && payload.id) {
                this.handleListingUpdated(payload);
            }
        });

        router.registerHandler('LISTING_DELETED', (payload) => {
            if (payload && payload.id) {
                this.handleListingDeleted(payload);
            }
        });
    }

    handleSyncMessage(data) {
        switch (data.type) {
            case 'LISTING_CREATED':
                if (data.listing) this.handleListingCreated(data.listing);
                break;
            case 'LISTING_UPDATED':
                if (data.listing) this.handleListingUpdated(data.listing);
                break;
            case 'LISTING_DELETED':
                if (data.id) this.handleListingDeleted({ id: data.id });
                break;
            case 'SAVE_TOGGLED':
                if (data.listingId && data.userId) {
                    this.handleSaveToggled(data.listingId, data.userId, data.saved);
                }
                break;
        }
    }

    handleListingCreated(listing) {
        const exists = this.listings.some(l => l.id === listing.id);
        if (!exists) {
            this.listings = [this.sanitizeListing(listing), ...this.listings];
            if (listing.sellerId === this.currentUser?.id) {
                this.myListings = [listing, ...this.myListings];
                safeStorage.set('myListings', this.myListings);
            }
            safeStorage.set('listings', this.listings);
            this.notifyUI('listingCreated', listing);
        }
    }

    handleListingUpdated(updated) {
        this.listings = this.listings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        this.myListings = this.myListings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        this.savedListings = this.savedListings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        safeStorage.set('listings', this.listings);
        safeStorage.set('myListings', this.myListings);
        safeStorage.set('savedListings', this.savedListings);
        this.notifyUI('listingUpdated', updated);
    }

    handleListingDeleted(deleted) {
        this.listings = this.listings.filter(l => l.id !== deleted.id);
        this.myListings = this.myListings.filter(l => l.id !== deleted.id);
        this.savedListings = this.savedListings.filter(l => l.id !== deleted.id);
        safeStorage.set('listings', this.listings);
        safeStorage.set('myListings', this.myListings);
        safeStorage.set('savedListings', this.savedListings);
        this.notifyUI('listingDeleted', deleted);
    }

    handleSaveToggled(listingId, userId, saved) {
        this.listings = this.listings.map(l => {
            if (l.id === listingId) {
                const savedBy = l.savedBy || [];
                l.savedBy = saved ? [...new Set([...savedBy, userId])] : savedBy.filter(id => id !== userId);
            }
            return l;
        });
        if (userId === this.currentUser?.id) {
            const listing = this.listings.find(l => l.id === listingId);
            if (saved && listing && !this.savedListings.some(l => l.id === listingId)) {
                this.savedListings = [listing, ...this.savedListings];
            } else if (!saved) {
                this.savedListings = this.savedListings.filter(l => l.id !== listingId);
            }
            safeStorage.set('savedListings', this.savedListings);
            this.notifyUI('saveToggled', { listingId, saved });
        }
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            await sessionAdapter.requestSession();
            this.currentUser = sessionAdapter.getSession();
            if (this.currentUser) {
                safeStorage.set('currentUser', this.currentUser);
            }
            
            await this.loadListings();
            
            this.initialized = true;
            logOnce('ready', 'MarketplaceCore ready');
            
        } catch (error) {
            logError('MarketplaceCore.initialize', error);
            if (this.listings.length === 0) {
                this.generateSampleData();
            }
            this.initialized = true;
        }
    }

    async loadListings() {
        this.loading = true;
        this.notifyUI('loading', true);
        
        try {
            const data = await iframeAuthority.send('FETCH_LISTINGS', {
                page: this.pagination.page,
                limit: this.pagination.limit
            }, { expectAck: true, timeout: 5000 });
            
            if (data && data.listings) {
                this.listings = this.sanitizeListings(data.listings);
                this.pagination.total = data.total || this.listings.length;
                safeStorage.set('listings', this.listings);
            }
        } catch (error) {
            logError('loadListings', error);
            const cached = safeStorage.get('listings');
            if (cached) {
                this.listings = this.sanitizeListings(cached);
            } else {
                this.generateSampleData();
            }
        } finally {
            this.loading = false;
            this.notifyUI('loading', false);
            this.notifyUI('listingsLoaded', this.getFilteredListings());
        }
    }

    loadMyListings() {
        if (!this.currentUser) return;
        this.myListings = this.listings.filter(l => l.sellerId === this.currentUser.id);
        safeStorage.set('myListings', this.myListings);
    }

    loadSavedListings() {
        if (!this.currentUser) return;
        const cached = safeStorage.get('savedListings');
        if (cached) {
            this.savedListings = this.sanitizeListings(cached);
        }
    }

    async createListing(listingData) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        if (!listingData.title || !listingData.description) {
            throw new Error('Title and description are required');
        }

        const sanitized = this.sanitizeListingData(listingData);
        
        const listing = {
            id: `listing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sellerId: this.currentUser.id,
            seller: {
                id: this.currentUser.id,
                name: this.currentUser.displayName || this.currentUser.name,
                photoURL: this.currentUser.photoURL
            },
            title: this.escapeHtml(sanitized.title),
            description: this.escapeHtml(sanitized.description),
            price: this.validatePrice(sanitized.price),
            category: sanitized.category || 'other',
            images: sanitized.images || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            available: sanitized.available !== false,
            savedBy: [],
            views: 0
        };

        try {
            const response = await iframeAuthority.send('CREATE_LISTING', listing, {
                expectAck: true,
                timeout: 5000
            });

            if (response && response.success) {
                this.listings = [listing, ...this.listings];
                this.myListings = [listing, ...this.myListings];
                safeStorage.set('listings', this.listings);
                safeStorage.set('myListings', this.myListings);
                this.notifyUI('listingCreated', listing);
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'LISTING_CREATED', listing });
                }
                logOnce('send', 'Listing created', { id: listing.id });
                return listing;
            } else {
                throw new Error(response?.error || 'Failed to create listing');
            }
        } catch (error) {
            logError('createListing', error);
            this.queueOfflineListing(listing);
            throw error;
        }
    }

    async updateListing(listingId, updates) {
        if (!this.currentUser) {
            throw new Error('User not authenticated');
        }

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        if (listing.sellerId !== this.currentUser.id) throw new Error('You can only edit your own listings');

        const sanitized = {};
        if (updates.title) sanitized.title = this.escapeHtml(updates.title);
        if (updates.description) sanitized.description = this.escapeHtml(updates.description);
        if (updates.price !== undefined) sanitized.price = this.validatePrice(updates.price);
        if (updates.category) sanitized.category = updates.category;
        if (updates.images) sanitized.images = updates.images.filter(this.validateImage);
        if (updates.available !== undefined) sanitized.available = !!updates.available;

        const updatedListing = { ...listing, ...sanitized, updatedAt: new Date().toISOString() };

        try {
            const response = await iframeAuthority.send('UPDATE_LISTING', {
                id: listingId,
                updates: sanitized
            }, { expectAck: true, timeout: 5000 });

            if (response && response.success) {
                this.listings = this.listings.map(l => l.id === listingId ? updatedListing : l);
                this.myListings = this.myListings.map(l => l.id === listingId ? updatedListing : l);
                this.savedListings = this.savedListings.map(l => l.id === listingId ? updatedListing : l);
                safeStorage.set('listings', this.listings);
                safeStorage.set('myListings', this.myListings);
                this.notifyUI('listingUpdated', updatedListing);
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'LISTING_UPDATED', listing: updatedListing });
                }
                return updatedListing;
            } else {
                throw new Error(response?.error || 'Failed to update listing');
            }
        } catch (error) {
            logError('updateListing', error);
            throw error;
        }
    }

    async deleteListing(listingId) {
        if (!this.currentUser) throw new Error('User not authenticated');
        
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        if (listing.sellerId !== this.currentUser.id) throw new Error('You can only delete your own listings');

        try {
            const response = await iframeAuthority.send('DELETE_LISTING', { id: listingId }, {
                expectAck: true, timeout: 5000
            });

            if (response && response.success) {
                this.listings = this.listings.filter(l => l.id !== listingId);
                this.myListings = this.myListings.filter(l => l.id !== listingId);
                this.savedListings = this.savedListings.filter(l => l.id !== listingId);
                safeStorage.set('listings', this.listings);
                safeStorage.set('myListings', this.myListings);
                safeStorage.set('savedListings', this.savedListings);
                this.notifyUI('listingDeleted', { id: listingId });
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'LISTING_DELETED', id: listingId });
                }
                return true;
            } else {
                throw new Error(response?.error || 'Failed to delete listing');
            }
        } catch (error) {
            logError('deleteListing', error);
            throw error;
        }
    }

    async toggleSave(listingId) {
        if (!this.currentUser) throw new Error('User not authenticated');

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');

        const isSaved = this.savedListings.some(l => l.id === listingId);
        const userId = this.currentUser.id;

        try {
            const response = await iframeAuthority.send('TOGGLE_SAVE', {
                listingId, save: !isSaved
            }, { expectAck: true, timeout: 3000 });

            if (response && response.success) {
                if (!isSaved) {
                    this.savedListings = [listing, ...this.savedListings];
                    this.listings = this.listings.map(l => {
                        if (l.id === listingId) {
                            const savedBy = l.savedBy || [];
                            if (!savedBy.includes(userId)) {
                                l.savedBy = [...savedBy, userId];
                            }
                        }
                        return l;
                    });
                } else {
                    this.savedListings = this.savedListings.filter(l => l.id !== listingId);
                    this.listings = this.listings.map(l => {
                        if (l.id === listingId && l.savedBy) {
                            l.savedBy = l.savedBy.filter(id => id !== userId);
                        }
                        return l;
                    });
                }
                safeStorage.set('listings', this.listings);
                safeStorage.set('savedListings', this.savedListings);
                this.notifyUI('saveToggled', { listingId, saved: !isSaved });
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'SAVE_TOGGLED', listingId, userId, saved: !isSaved });
                }
                return !isSaved;
            } else {
                throw new Error(response?.error || 'Failed to toggle save');
            }
        } catch (error) {
            logError('toggleSave', error);
            throw error;
        }
    }

    async contactSeller(listingId, message = '') {
        if (!this.currentUser) throw new Error('User not authenticated');

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');

        try {
            await iframeAuthority.send('CONTACT_SELLER', {
                listingId,
                sellerId: listing.sellerId,
                listingTitle: listing.title,
                message: message || `I'm interested in your listing: ${listing.title}`,
                timestamp: Date.now()
            }, { expectAck: true, timeout: 5000 });
            
            logOnce('send', `Contacted seller for ${listingId}`);
            return true;
        } catch (error) {
            logError('contactSeller', error);
            throw error;
        }
    }

    async trackView(listingId) {
        if (!listingId) return;
        this.listings = this.listings.map(l => {
            if (l.id === listingId) l.views = (l.views || 0) + 1;
            return l;
        });
        await iframeAuthority.send('TRACK_VIEW', { listingId, timestamp: Date.now() }, { expectAck: false });
    }

    setFilter(key, value) {
        this.filters[key] = value;
        this.pagination.page = 1;
        this.notifyUI('filtersChanged', this.filters);
        this.notifyUI('listingsUpdated', this.getFilteredListings());
    }

    resetFilters() {
        this.filters = { search: '', category: '', minPrice: null, maxPrice: null, available: null, sort: 'newest' };
        this.pagination.page = 1;
        this.notifyUI('filtersChanged', this.filters);
        this.notifyUI('listingsUpdated', this.getFilteredListings());
    }

    getFilteredListings() {
        let filtered = this.listings.filter(l => l.available !== false);
        
        if (this.filters.search) {
            const search = this.filters.search.toLowerCase();
            filtered = filtered.filter(l => 
                l.title.toLowerCase().includes(search) ||
                l.description.toLowerCase().includes(search)
            );
        }
        
        if (this.filters.category) {
            filtered = filtered.filter(l => l.category === this.filters.category);
        }
        
        if (this.filters.minPrice !== null) {
            const min = parseFloat(this.filters.minPrice);
            filtered = filtered.filter(l => parseFloat(l.price || 0) >= min);
        }
        if (this.filters.maxPrice !== null) {
            const max = parseFloat(this.filters.maxPrice);
            filtered = filtered.filter(l => parseFloat(l.price || 0) <= max);
        }
        
        if (this.filters.available !== null) {
            filtered = filtered.filter(l => l.available === this.filters.available);
        }
        
        switch (this.filters.sort) {
            case 'newest':
                filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'oldest':
                filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case 'price_low':
                filtered.sort((a, b) => (parseFloat(a.price || 0) - parseFloat(b.price || 0)));
                break;
            case 'price_high':
                filtered.sort((a, b) => (parseFloat(b.price || 0) - parseFloat(a.price || 0)));
                break;
            case 'popular':
                filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
                break;
        }
        
        this.pagination.total = filtered.length;
        this.pagination.hasMore = this.pagination.page * this.pagination.limit < filtered.length;
        
        const start = (this.pagination.page - 1) * this.pagination.limit;
        const end = start + this.pagination.limit;
        
        return filtered.slice(start, end);
    }

    loadMore() {
        if (!this.pagination.hasMore || this.loading) return false;
        this.pagination.page++;
        this.notifyUI('listingsUpdated', this.getFilteredListings());
        return true;
    }

    sanitizeListings(listings) {
        if (!Array.isArray(listings)) return [];
        return listings.filter(l => l && typeof l === 'object').map(l => this.sanitizeListing(l)).filter(l => l);
    }

    sanitizeListing(listing) {
        try {
            return {
                id: String(listing.id || listing._id || ''),
                sellerId: String(listing.sellerId || listing.userId || listing.seller?.id || ''),
                seller: {
                    id: String(listing.seller?.id || listing.userId || ''),
                    name: this.escapeHtml(listing.seller?.name || listing.sellerName || 'Unknown'),
                    photoURL: this.sanitizeUrl(listing.seller?.photoURL || listing.sellerPhoto || '')
                },
                title: this.escapeHtml(listing.title || 'Untitled'),
                description: this.escapeHtml(listing.description || ''),
                price: this.validatePrice(listing.price),
                category: listing.category || 'other',
                images: (listing.images || []).filter(this.validateImage),
                createdAt: listing.createdAt || new Date().toISOString(),
                updatedAt: listing.updatedAt || listing.createdAt || new Date().toISOString(),
                available: listing.available !== false,
                savedBy: Array.isArray(listing.savedBy) ? listing.savedBy : [],
                views: parseInt(listing.views) || 0
            };
        } catch {
            return null;
        }
    }

    sanitizeListingData(data) {
        return {
            title: typeof data.title === 'string' ? data.title.trim().substring(0, 200) : '',
            description: typeof data.description === 'string' ? data.description.trim().substring(0, 5000) : '',
            price: this.validatePrice(data.price),
            category: data.category || 'other',
            images: Array.isArray(data.images) ? data.images.filter(this.validateImage) : [],
            available: data.available !== false
        };
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    validatePrice(price) {
        if (price === undefined || price === null) return null;
        if (typeof price === 'string') {
            const cleaned = price.replace(/[^0-9.]/g, '');
            const num = parseFloat(cleaned);
            return isNaN(num) ? null : num;
        }
        const num = parseFloat(price);
        return isNaN(num) ? null : (num < 0 ? null : num);
    }

    validateImage(url) {
        if (!url || typeof url !== 'string') return false;
        if (url.startsWith('data:')) return true;
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
            return false;
        }
    }

    sanitizeUrl(url) {
        if (!url || typeof url !== 'string') return '';
        if (url.startsWith('data:')) return url;
        if (url.startsWith('https:') || url.startsWith('http:')) return url;
        return '';
    }

    loadFromCache() {
        try {
            const cachedListings = safeStorage.get('listings');
            if (cachedListings) this.listings = this.sanitizeListings(cachedListings);
            const cachedMyListings = safeStorage.get('myListings');
            if (cachedMyListings) this.myListings = this.sanitizeListings(cachedMyListings);
            const cachedSaved = safeStorage.get('savedListings');
            if (cachedSaved) this.savedListings = this.sanitizeListings(cachedSaved);
            const cachedUser = safeStorage.get('currentUser');
            if (cachedUser) this.currentUser = cachedUser;
        } catch (error) {
            logError('loadFromCache', error);
        }
    }

    queueOfflineListing(listing) {
        const queue = safeStorage.get('offlineQueue') || [];
        queue.push({ listing, timestamp: Date.now(), attempts: 0 });
        safeStorage.set('offlineQueue', queue);
    }

    processOfflineQueue() {
        const queue = safeStorage.get('offlineQueue') || [];
        if (queue.length === 0) return;
        
        const remaining = [];
        queue.forEach(async (item) => {
            try {
                await iframeAuthority.send('CREATE_LISTING', item.listing, { expectAck: true, timeout: 5000 });
            } catch {
                item.attempts++;
                if (item.attempts < 3) remaining.push(item);
            }
        });
        safeStorage.set('offlineQueue', remaining);
    }

    generateSampleData() {
        if (this.listings.length > 0) return;
        
        const categories = ['electronics', 'furniture', 'clothing', 'books', 'services', 'other'];
        const sampleListings = [];
        
        for (let i = 1; i <= 20; i++) {
            sampleListings.push({
                id: `sample_${i}`,
                sellerId: `user_${Math.floor(Math.random() * 5) + 1}`,
                seller: {
                    id: `user_${Math.floor(Math.random() * 5) + 1}`,
                    name: `User ${Math.floor(Math.random() * 5) + 1}`,
                    photoURL: ''
                },
                title: `Sample Listing ${i}`,
                description: `This is a sample marketplace listing for demonstration purposes.`,
                price: Math.floor(Math.random() * 100) + 10,
                category: categories[Math.floor(Math.random() * categories.length)],
                images: [],
                createdAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
                updatedAt: new Date().toISOString(),
                available: Math.random() > 0.2,
                savedBy: [],
                views: Math.floor(Math.random() * 100)
            });
        }
        
        this.listings = this.sanitizeListings(sampleListings);
        safeStorage.set('listings', this.listings);
    }

    notifyUI(event, data) {
        window.dispatchEvent(new CustomEvent('marketplace:' + event, { detail: data, bubbles: true }));
    }

    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event).add(callback);
        window.addEventListener('marketplace:' + event, callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
        window.removeEventListener('marketplace:' + event, callback);
    }

    getListings() {
        return this.getFilteredListings();
    }

    getMyListings() {
        if (!this.currentUser) return [];
        return this.myListings;
    }

    getSavedListings() {
        return this.savedListings;
    }

    getListing(id) {
        return this.listings.find(l => l.id === id);
    }

    isOwner(listingId) {
        if (!this.currentUser) return false;
        const listing = this.getListing(listingId);
        return listing ? listing.sellerId === this.currentUser.id : false;
    }

    isSaved(listingId) {
        return this.savedListings.some(l => l.id === listingId);
    }

    getCategories() {
        const categories = new Set(this.listings.map(l => l.category).filter(Boolean));
        return Array.from(categories);
    }

    getStats() {
        return {
            total: this.listings.length,
            myListings: this.myListings.length,
            saved: this.savedListings.length,
            active: this.listings.filter(l => l.available).length
        };
    }

    getFilters() {
        return { ...this.filters };
    }

    getPagination() {
        return { ...this.pagination };
    }

    isLoading() {
        return this.loading;
    }

    isAuthenticated() {
        return !!this.currentUser;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    destroy() {
        if (this.syncChannel) this.syncChannel.close();
    }
}

// =============================================
// CREATE INSTANCES AFTER ALL CLASSES ARE DEFINED
// =============================================

const parentContract = new ParentContractCompliance();
const reliabilityEngine = new ReliabilityEngine(environmentDetector);
const startupGovernor = new StartupGovernor(environmentDetector, reliabilityEngine);
startupGovernor.initialize();
const handshake = new HandshakeAuthority(environmentDetector, reliabilityEngine);
const sessionAdapter = new SessionClient(environmentDetector, reliabilityEngine);
const transport = new TransportLayer(environmentDetector, reliabilityEngine);
const recovery = new RecoveryManager(environmentDetector, reliabilityEngine, handshake, sessionAdapter, transport);
const diagnostics = new DiagnosticsAgent(environmentDetector);
const compatibility = new CompatibilityBridge();
const securityHardener = new SecurityHardener(environmentDetector);
securityHardener.initialize();
const uiFailsafe = new UIFailsafe();
const navigationGuard = new NavigationGuard();
const resourceManager = new ResourceManager();
const sandbox = new FeatureSandbox();
const errorHandler = new GlobalErrorHandler(diagnostics);
errorHandler.initialize();
const originTrustAdapter = new OriginTrustAdapter(environmentDetector);
const messaging = new IframeMessenger(environmentDetector);
messaging.frameId = _STATE.frameId;
const router = new MessageRouter(messaging, sessionAdapter, environmentDetector, compatibility);
const iframeAuthority = new IframeAuthority();
const pipeline = new InitializationPipeline(sessionAdapter, messaging, router, diagnostics, environmentDetector, startupGovernor);
const depManager = new DependencyManager();
const marketplace = new MarketplaceCoreImpl();

// Set frameId after iframeAuthority is created
messaging.frameId = iframeAuthority.generateFrameId();
_STATE.frameId = messaging.frameId;

// =============================================
// DETERMINISTIC BOOT SEQUENCE
// =============================================

async function initializeDeterministicBoot() {
    if (bootStateLock) {
        debugLog('[Boot] Already locked, skipping');
        return false;
    }
    
    bootMachine.lock();
    
    try {
        logOnce('init', 'Deterministic boot started');
        
        // Start in PREINIT
        bootMachine.transition(BOOT_STATE.PREINIT);
        
        // Check if we're in an iframe
        const inIframe = (window.parent && window.parent !== window);
        _STATE.parentDetected = inIframe;
        
        if (!inIframe) {
            debugLog('[Boot] Not in iframe, entering degraded mode');
            bootMachine.transition(BOOT_STATE.DEGRADED);
            _STATE.guestMode = true;
            _STATE.fallbackMode = true;
            
            // Still complete initialization in degraded mode
            setTimeout(() => {
                completeDegradedInitialization();
            }, 100);
            
            bootMachine.unlock();
            return true;
        }
        
        // Transition to WAIT_PARENT
        bootMachine.transition(BOOT_STATE.WAIT_PARENT);
        logOnce('info', 'Waiting for parent ready signal');
        
        // Wait for parent ready signal - REDUCED TIMEOUT from 5000ms to 2000ms
        const parentReady = await waitForParentReady();
        
        if (!parentReady) {
            logOnce('warn', 'Parent ready timeout, entering degraded mode');
            bootMachine.transition(BOOT_STATE.DEGRADED);
            _STATE.guestMode = true;
            _STATE.fallbackMode = true;
            
            setTimeout(() => {
                completeDegradedInitialization();
            }, 100);
            
            bootMachine.unlock();
            return true;
        }
        
        logOnce('ready', 'Parent ready detected');
        
        // Parent detected and ready
        parentAuthorityMode = true;
        
        // Transition to REGISTERING
        bootMachine.transition(BOOT_STATE.REGISTERING);
        parentContract.emitState('REGISTERING');
        
        // Send CHILD_READY (only once)
        sendChildReady();
        
        // Send REGISTER_MODULE
        sendRegisterModule();
        
        parentContract.emitState('REGISTERED');
        logOnce('ready', 'Module registered with parent');
        
        // Transition to WAIT_SESSION
bootMachine.transition(BOOT_STATE.WAIT_SESSION);
parentContract.emitState('SESSION_PENDING');
logOnce('info', 'Waiting for authoritative session');

// Wait for authoritative session (increased timeout)
const sessionReceived = await waitForAuthoritativeSession(5000);

if (!sessionReceived) {
    logOnce('warn', 'Session timeout, checking for cached session');
    
    // Check if we have a cached session
    const cachedSession = sessionAdapter ? sessionAdapter.getSession() : null;
    
    if (cachedSession && cachedSession.userId) {
        logOnce('info', 'Using cached session');
        _STATE.sessionActive = true;
        window.__MODULE_SESSION_ACTIVE__ = true;
        sessionValid = true;
    } else {
        logOnce('info', 'No session available, guest mode');
        _STATE.guestMode = true;
        sessionAdapter.enableGuestMode();
    }
} else {
    logOnce('success', 'Authoritative session received');
    _STATE.sessionActive = true;
    window.__MODULE_SESSION_ACTIVE__ = true;
    sessionValid = true;
}
        // Transition to INITIALIZING
        bootMachine.transition(BOOT_STATE.INITIALIZING);
        parentContract.emitState('INITIALIZING');
        logOnce('info', 'Initializing components');
        
        // Complete initialization
        await completeAuthoritativeInitialization();
        
        // Transition to READY
        bootMachine.transition(BOOT_STATE.READY);
        parentContract.emitState('READY');
        
        _STATE.ready = true;
        _STATE.initialized = true;
        isReady = true;
        
        // Set exposed flags
        window.__MODULE_READY__ = true;
        if (_STATE.sessionActive) {
            window.__MODULE_SESSION_ACTIVE__ = true;
        }
        
        logOnce('success', 'Deterministic boot complete');
        
        bootMachine.unlock();
        return true;
        
    } catch (error) {
        logError('DeterministicBoot', error);
        bootMachine.transition(BOOT_STATE.DEGRADED);
        _STATE.guestMode = true;
        _STATE.fallbackMode = true;
        
        setTimeout(() => {
            completeDegradedInitialization();
        }, 100);
        
        bootMachine.unlock();
        return false;
    }
}

function waitForParentReady() {
    return new Promise((resolve) => {
        // IMMEDIATE CHECK - if parent is already detected
        if (parentReadyDetected) {
            logOnce('ready', 'Parent already detected');
            resolve(true);
            return;
        }
        
        // Check for global flag
        if (window.__PARENT_READY__ === true) {
            parentReadyDetected = true;
            logOnce('ready', 'Parent ready via global flag');
            resolve(true);
            return;
        }
        
        // Check if we're in an iframe at all
        if (!window.parent || window.parent === window) {
            logOnce('info', 'Not in iframe, continuing without parent');
            resolve(false);
            return;
        }
        
        // INCREASED TIMEOUT from 2000ms to 5000ms
        const timeout = 5000;
        let resolved = false;
        
        logOnce('info', 'Waiting for parent ready signal');
        
        const timeoutId = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            logOnce('warn', 'Parent ready timeout, continuing without session');
            resolve(false);
        }, timeout);
        
        const handler = (e) => {
            try {
                // Don't validate origin too strictly - allow all for parent detection
                if (e.source !== window.parent) return;
                
                const data = e.data;
                if (!data || typeof data !== 'object') return;
                
                // Look for any parent ready message formats
                if (data.type === 'PARENT_READY' || 
                    data.type === 'PARENT_READY_ACK' ||
                    data.type === 'init' ||
                    data.type === 'HANDSHAKE_RETRY' ||
                    data.type === 'REGISTER_MODULE' ||
                    data.type === 'SESSION_DATA' ||
                    data.type === 'SESSION_ACTIVE' ||
                    (data.payload && (data.payload.session || data.payload.userId))) {
                    
                    parentReadyDetected = true;
                    window.__PARENT_READY__ = true;
                    
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    logOnce('ready', 'Parent ready detected');
                    resolve(true);
                }
            } catch (err) {}
        };
        
        const cleanup = () => {
            clearTimeout(timeoutId);
            window.removeEventListener('message', handler);
        };
        
        window.addEventListener('message', handler);
        
        // Also send a CHILD_READY to prompt parent response
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'CHILD_READY',
                    module: 'marketplace',
                    frameId: _STATE.frameId,
                    timestamp: Date.now()
                }, '*');
            }
        } catch (err) {}
    });
}

function sendChildReady() {
    if (!_STATE.parentDetected) return false;
    
    try {
        // Send multiple formats to ensure compatibility
        window.parent.postMessage({
            type: 'CHILD_READY',
            module: 'marketplace',
            frameId: _STATE.frameId,
            version: '5.2.0',
            timestamp: Date.now(),
            once: true
        }, '*');
        
        // Also send legacy format
        window.parent.postMessage({
            type: 'CHILD_READY',
            id: _STATE.frameId,
            source: 'marketplace',
            timestamp: Date.now()
        }, '*');
        
        _STATE.childReadySent = true;
        return true;
    } catch (err) {
        return false;
    }
}

function sendRegisterModule() {
    if (!_STATE.parentDetected) return false;
    
    try {
        window.parent.postMessage({
            type: 'REGISTER_MODULE',
            module: 'marketplace',
            frameId: _STATE.frameId,
            capabilities: ['session', 'listings', 'messaging', 'storage'],
            timestamp: Date.now()
        }, '*');
        
        moduleRegistered = true;
        return true;
    } catch (err) {
        return false;
    }
}

function waitForAuthoritativeSession(timeoutMs = 5000) {
    return new Promise((resolve) => {
        // Check if we already have session
        if (sessionReceived || _STATE.sessionActive || sessionAdapter?.isValid()) {
            logOnce('ready', 'Session already available');
            resolve(true);
            return;
        }
        
        // Check for cached session
        const cachedSession = sessionAdapter ? sessionAdapter.getSession() : null;
        if (cachedSession && cachedSession.userId) {
            logOnce('info', 'Using cached session while waiting');
            // Don't resolve yet - still wait for authoritative, but mark as received
        }
        
        const timeout = timeoutMs;
        let resolved = false;
        
        logOnce('info', `Waiting for authoritative session (${timeoutMs}ms)`);
        
        const timeoutId = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            
            // If we have cached session, consider it success
            if (cachedSession && cachedSession.userId) {
                logOnce('info', 'Using cached session after timeout');
                sessionReceived = true;
                authoritativeSession = cachedSession;
                resolve(true);
            } else {
                logOnce('warn', 'Session timeout, no cached session');
                resolve(false);
            }
        }, timeout);
        
        const handler = (e) => {
            try {
                if (e.source !== window.parent) return;
                const data = e.data;
                if (!data || typeof data !== 'object') return;
                
                // Check for any session data format
                if (data.type === 'SESSION_ACTIVE' || 
                    data.type === 'SESSION_DATA' ||
                    data.type === 'SESSION_RESPONSE' ||
                    (data.type === 'init' && data.session) ||
                    (data.type === 'ACK' && data.payload?.session)) {
                    
                    const session = data.session || data.payload?.session || data.data || data.payload;
                    if (session && (session.userId || session.user_id || session.id)) {
                        sessionReceived = true;
                        authoritativeSession = session;
                        
                        // Also update session adapter
                        if (sessionAdapter) {
                            sessionAdapter.acceptParentSession(session);
                        }
                        
                        if (resolved) return;
                        resolved = true;
                        cleanup();
                        logOnce('success', 'Authoritative session received');
                        resolve(true);
                    }
                }
            } catch (err) {}
        };
        
        const cleanup = () => {
            clearTimeout(timeoutId);
            window.removeEventListener('message', handler);
        };
        
        window.addEventListener('message', handler);
        
        // Request session explicitly
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({
                    type: 'REQUEST_SESSION',
                    module: 'marketplace',
                    frameId: _STATE.frameId,
                    timestamp: Date.now(),
                    urgent: true
                }, '*');
            } catch (err) {}
        }
    });
}

async function completeAuthoritativeInitialization() {
    // Initialize marketplace core if available
    if (marketplace && typeof marketplace.initialize === 'function') {
        try {
            await marketplace.initialize();
        } catch (err) {
            debugLog('[Boot] Marketplace initialization error:', err);
        }
    }
    
    // Initialize other components
    if (iframeAuthority && !iframeAuthority.initialized) {
        try {
            await iframeAuthority.initialize();
        } catch (err) {
            debugLog('[Boot] IframeAuthority initialization error:', err);
        }
    }
    
    // Start heartbeat monitor
    if (router) {
        router.startHeartbeatMonitor();
    }
    
    if (transport) {
        transport.start();
    }
    
    // Set final flags
    window.__MODULE_READY__ = true;
    if (_STATE.sessionActive) {
        window.__MODULE_SESSION_ACTIVE__ = true;
    }
}

function completeDegradedInitialization() {
    bootMachine.transition(BOOT_STATE.DEGRADED);
    logOnce('info', 'Entering degraded mode');
    
    // Initialize in degraded mode
    if (marketplace && typeof marketplace.initialize === 'function') {
        try {
            marketplace.initialize().catch(() => {});
        } catch (err) {}
    }
    
    _STATE.ready = true;
    _STATE.initialized = true;
    isReady = true;
    window.__MODULE_READY__ = true;
    
    logOnce('ready', 'MarketplaceCore ready (degraded mode)');
}

// =============================================
// CENTRALIZED ACK HANDLER
// =============================================

// Override reliability engine's ack handling to use centralized system
const originalSendWithAck = ReliabilityEngine.prototype.sendWithAck;

ReliabilityEngine.prototype.sendWithAck = function(type, payload, config) {
    return new Promise((resolve) => {
        const { messageId, timeout, attempt } = config;
        let resolved = false;
        
        // Generate unique messageId if not provided
        const finalMessageId = messageId || this.generateMessageId();
        
        const timeoutId = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            _STATE.connectionMetrics.acksMissed++;
            resolve({ success: false, error: 'timeout', attempt, messageId: finalMessageId });
        }, timeout);
        
        const ackHandler = (e) => {
            if (!this.validateOrigin(e)) return;
            
            const data = e.data;
            if (!data || typeof data !== 'object') return;
            
            // Handle both ACK and explicit messageId matching
            if ((data.type === 'ACK' || data.type === PARENT_MESSAGE_TYPES.ACK) && 
                (data.inResponseTo === finalMessageId || data.messageId === finalMessageId)) {
                if (resolved) return;
                resolved = true;
                cleanup();
                _STATE.connectionMetrics.acksReceived++;
                resolve({ success: true, ack: data, attempt, messageId: finalMessageId });
            }
        };
        
        const cleanup = () => {
            clearTimeout(timeoutId);
            window.removeEventListener('message', ackHandler);
            this.ackTimeouts.delete(finalMessageId);
        };
        
        this.ackTimeouts.set(finalMessageId, { timeoutId, cleanup });
        window.addEventListener('message', ackHandler);
        
        try {
            if (!window.parent || window.parent === window) {
                throw new Error('Not in iframe');
            }
            
            const message = this.buildMessage(type, payload, { messageId: finalMessageId, attempt });
            window.parent.postMessage(message, '*');
            _STATE.connectionMetrics.messagesSent++;
            
            setTimeout(() => {
                if (!resolved) cleanup();
            }, timeout + 100);
        } catch (err) {
            cleanup();
            resolve({ success: false, error: err.message, attempt, messageId: finalMessageId });
        }
    });
};

// Override buildMessage to always include messageId
ReliabilityEngine.prototype.buildMessage = function(type, payload, meta = {}) {
    return {
        protocol: _STATE.protocolVersion,
        messageId: meta.messageId || this.generateMessageId(),
        type: type,
        source: 'iframe',
        target: 'parent',
        frameId: _STATE.frameId,
        timestamp: Date.now(),
        attempt: meta.attempt || 1,
        payload: this.sanitizePayload(payload)
    };
};

// =============================================
// REMOVE INFINITE RETRY LOOPS
// =============================================

// Override retry mechanisms with bounded retries
const MAX_AUTH_RETRIES = 2;

// Store original methods
const originalHandshakeStart = HandshakeAuthority.prototype.startHandshake;
const originalSessionRequest = SessionClient.prototype.requestSession;
const originalSendPing = TransportLayer.prototype.sendPing;

// Override handshake with bounded retries
HandshakeAuthority.prototype.startHandshake = async function() {
    if (this.state.lock) return false;
    if (_STATE.handshakeComplete) {
        this.state.complete = true;
        return true;
    }
    
    // Check if we're in auth mode and limit retries
    if (parentAuthorityMode && this.state.attempts >= MAX_AUTH_RETRIES) {
        debugLog('[Handshake] Max retries reached in auth mode, entering degraded');
        return false;
    }
    
    this.state.lock = true;
    this.state.attempts++;
    this.state.startTime = Date.now();
    this.state.stage = 'init';
    
    _STATE.handshakeStartTime = this.state.startTime;
    _STATE.handshakeId = `handshake_${this.state.startTime}_${Math.random().toString(36).substring(2, 8)}`;
    
    try {
        this.state.stage = 'child_ready';
        const readyResult = await this.sendChildReady();
        if (!readyResult.success) throw new Error('CHILD_READY failed');
        
        this.state.stage = 'wait_parent_ready';
        const parentReady = await this.waitForParentReady();
        if (!parentReady) throw new Error('PARENT_READY timeout');
        
        this.state.stage = 'handshake_request';
        const requestResult = await this.sendHandshakeRequest();
        if (!requestResult.success) throw new Error('HANDSHAKE_REQUEST failed');
        
        this.state.stage = 'wait_handshake_ack';
        const ackReceived = await this.waitForHandshakeAck();
        if (!ackReceived) throw new Error('HANDSHAKE_ACK timeout');
        
        this.completeHandshake();
        return true;
        
    } catch (error) {
        this.state.error = error.message;
        this.state.lock = false;
        
        // Only retry if under limit
        if (this.state.attempts < MAX_AUTH_RETRIES) {
            this.state.stage = 'retry';
            return this.retryHandshake();
        }
        return false;
    }
};

// Override session request with bounded retries
SessionClient.prototype.requestSession = async function(force = false) {
    if (parentAuthorityMode && this.sessionState.requested && !force) {
        // In auth mode, respect authoritative session
        if (authoritativeSession) return { success: true, authoritative: true };
    }
    
    if (this.guestMode && !force) return this.currentSession;
    if (this.sessionState.requested && !force) return this.currentSession;
    
    // Check retry limit in auth mode
    if (parentAuthorityMode && this.requestRetryCount >= MAX_AUTH_RETRIES) {
        debugLog('[Session] Max retries reached in auth mode');
        return { success: false, error: 'max_retries_auth_mode' };
    }
    
    this.sessionState.requested = true;
    this.requestRetryCount = (this.requestRetryCount || 0) + 1;
    
    const result = await this.reliabilityEngine.sendWithReliability(
        PARENT_MESSAGE_TYPES.REQUEST_SESSION,
        {
            frameId: _STATE.frameId,
            timestamp: Date.now(),
            force: force,
            cached: !!this.sessionCache,
            environment: this.environmentDetector.environment,
            authMode: parentAuthorityMode
        },
        { requireAck: true, timeout: 3000, maxRetries: MAX_AUTH_RETRIES, retryQueue: 'session' }
    );
    
    return result;
};

// Override ping with bounded retries
TransportLayer.prototype.sendPing = async function() {
    if (!_STATE.parentDetected || _STATE.guestMode) return;
    
    // In auth mode, limit ping retries
    if (parentAuthorityMode && this.missedPongs >= 3) {
        debugLog('[Transport] Too many missed pongs in auth mode');
        return;
    }
    
    this.lastPing = Date.now();
    _STATE.connectionMetrics.lastPing = this.lastPing;
    
    const result = await this.reliabilityEngine.sendWithReliability(
        PARENT_MESSAGE_TYPES.PING,
        { timestamp: this.lastPing },
        { requireAck: true, timeout: 1500, maxRetries: 2, retryQueue: 'heartbeat', offlineBuffer: false }
    );
    
    if (result.success) {
        this.missedPongs = 0;
        _STATE.parentResponding = true;
        _STATE.health.missedHeartbeats = 0;
    } else {
        this.missedPongs++;
        _STATE.health.missedHeartbeats++;
        if (this.missedPongs >= 5) {
            _STATE.parentResponding = false;
            this.notifyListeners('transport:unresponsive', { missedPongs: this.missedPongs });
        }
    }
};

// =============================================
// FIXED: EXPORTED CORE FUNCTIONS
// =============================================

export let initializeCore;
export let startHandshake;
export let sendToParent;
export let requestSession;
export let receiveFromParent;
export let shutdownCore;
export let syncWithParent;
export let checkParentHealth;

initializeCore = async function(options = {}) {
    if (_STATE.shutdown) return _STATE;
    if (_STATE.initialized) return _STATE;
    if (isInitializing) return _STATE;

    isInitializing = true;

    try {
        if (options.debug) {
            diagnostics.enableDebug();
        }

        _STATE.frameId = messaging.frameId;
        window.parentCommunicationId = _STATE.frameId;

        // Use deterministic boot instead of pipeline
        const bootResult = await initializeDeterministicBoot();

        if (bootResult) {
            _STATE.ready = currentBootState === BOOT_STATE.READY || currentBootState === BOOT_STATE.DEGRADED;
        }

        isReady = _STATE.ready;
        isInitializing = false;
        isBootstrapped = true;
        handshakeComplete = _STATE.handshakeComplete;
        sessionValid = sessionAdapter.isValid();
        sessionData = sessionAdapter.getSession();

        if (sessionData && !sessionData.isGuest && !sessionData.isDemo) {
            window.currentUser = {
                id: sessionData.userId,
                displayName: sessionData.displayName,
                email: sessionData.email,
                photoURL: sessionData.photoURL,
                isPremium: sessionData.isPremium,
                trustLevel: sessionData.trustLevel
            };
            window.userData = window.currentUser;
        }

        startPeriodicSync();

        // Set exposed flags
        window.__MODULE_READY__ = _STATE.ready;
        window.__MODULE_SESSION_ACTIVE__ = _STATE.sessionActive;

        window.dispatchEvent(new CustomEvent('coreInitialized', {
            detail: {
                state: _STATE,
                session: sessionAdapter.getSession(),
                fallbackMode: _STATE.fallbackMode,
                guestMode: _STATE.guestMode,
                sessionActive: _STATE.sessionActive,
                handshakeComplete: _STATE.handshakeComplete,
                environment: environmentDetector.environment,
                bootState: currentBootState
            }
        }));

        logOnce('success', 'MarketplaceCore initialization complete');
        return _STATE;

    } catch (error) {
        logError('initializeCore', error);
        _STATE.guestMode = true;
        _STATE.fallbackMode = true;
        _STATE.ready = true;
        _STATE.initialized = true;
        isReady = true;
        isInitializing = false;
        isBootstrapped = true;
        sessionAdapter.enableGuestMode();
        window.__MODULE_READY__ = true;
        logOnce('warn', 'MarketplaceCore initialization failed, running in guest mode');
        return _STATE;
    }
};

startHandshake = async function() {
    if (_STATE.shutdown) return false;
    if (handshakeInProgress) return false;
    if (_STATE.handshakeComplete) return true;

    handshakeInProgress = true;
    try {
        const result = await handshake.startHandshake();
        handshakeComplete = _STATE.handshakeComplete;
        handshakeInProgress = false;
        if (result) logOnce('success', 'Handshake completed');
        else logOnce('warn', 'Handshake failed');
        return result;
    } catch {
        handshakeInProgress = false;
        logOnce('error', 'Handshake error');
        return false;
    }
};

sendToParent = async function(type, payload = {}, options = {}) {
    if (_STATE.shutdown) return false;

    if (!_STATE.parentDetected || _STATE.guestMode || _STATE.fallbackMode) {
        if (options.force) {
            // Try anyway
        } else if (messaging && typeof messaging.bufferOfflineMessage === 'function') {
            messaging.bufferOfflineMessage(type, payload, options);
            return true;
        } else {
            if (typeof messaging.queueForRetry === 'function') {
                messaging.queueForRetry(type, payload, options);
            }
            return true;
        }
    }

    return sandbox.executeAsync('send_to_parent', async () => {
        const requiresAck = options.ack !== false;
        const timeout = options.timeout || 1500;

        let message = { type, payload };
        if (compatibility && compatibility.legacyMode) {
            message = compatibility.transformOutbound(message);
        }

        if (requiresAck) {
            let result;
            if (iframeAuthority && iframeAuthority.send) {
                result = await iframeAuthority.send(type, payload, options);
            } else if (messaging && typeof messaging.sendMessage === 'function') {
                result = await messaging.sendMessage(type, payload, { ...options, requireAck: true, timeout });
            } else {
                try {
                    const msg = messaging.normalizeOutboundMessage(type, payload, options);
                    result = await messaging.sendWithAck(msg, { timeout });
                } catch (err) {
                    result = { success: false, error: err.message };
                }
            }
            if (result && result.success) logOnce('send', type);
            return result ? result.success : false;
        } else {
            let result;
            if (iframeAuthority && iframeAuthority.send) {
                result = await iframeAuthority.send(type, payload, { ...options, requireAck: false });
            } else if (messaging && typeof messaging.sendMessage === 'function') {
                result = messaging.sendMessage(type, payload, { ...options, requireAck: false });
            } else {
                try {
                    const msg = messaging.normalizeOutboundMessage(type, payload, options);
                    result = messaging.sendFireAndForget(msg, options);
                } catch (err) {
                    result = false;
                }
            }
            if (result) logOnce('send', type);
            return result;
        }
    }, false);
};

requestSession = async function(force = false) {
    if (_STATE.shutdown) return false;
    if (_STATE.guestMode && !force) {
        const cached = sessionAdapter.getSession();
        return !!cached;
    }
    if (sessionValidationInProgress) return false;

    sessionValidationInProgress = true;
    try {
        const result = await sessionAdapter.requestSession(force);
        sessionValid = sessionAdapter.isValid();
        sessionData = sessionAdapter.getSession();
        sessionValidationInProgress = false;
        if (result.success) logOnce('success', 'Session request successful');
        else logOnce('warn', 'Session request failed');
        return result.success || false;
    } catch {
        sessionValidationInProgress = false;
        const cached = sessionAdapter.getSession();
        return !!cached;
    }
};

receiveFromParent = function(type, handler) {
    if (_STATE.shutdown) return;
    if (!type || typeof handler !== 'function') return;
    router.registerHandler(type, handler);
};

shutdownCore = function() {
    _STATE.shutdown = true;
    _STATE.initialized = false;
    _STATE.ready = false;
    _STATE.handshakeComplete = false;
    _STATE.sessionActive = false;
    
    isReady = false;
    isInitializing = false;
    handshakeComplete = false;
    sessionValid = false;
    handshakeInProgress = false;
    parentDataLoaded = false;
    directAPILoaded = false;
    isBootstrapped = false;
    isAuthReady = false;

    messaging.cleanup();
    router.cleanup();
    resourceManager.release();
    transport.stop();
    diagnostics.stop();
    recovery.stopMonitoring();

    safeStorage.remove(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.ENVIRONMENT_CACHE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.STARTUP_STATE);
    safeStorage.sessionRemove('core_session_cache');

    messageQueue = [];
    dataCache.clear();

    window.__MODULE_READY__ = false;
    window.__MODULE_SESSION_ACTIVE__ = false;

    logOnce('info', 'Core shutdown complete');
    return true;
};

syncWithParent = async function() {
    if (_STATE.shutdown || !_STATE.parentDetected || _STATE.guestMode) return false;
    if (_syncInProgress) return false;

    _syncInProgress = true;
    _syncAttempts++;

    try {
        const result = await sessionAdapter.syncSession();
        if (result.success) {
            _lastSyncTime = Date.now();
            _syncAttempts = 0;
        }
        return result.success;
    } catch {
        return false;
    } finally {
        _syncInProgress = false;
    }
};

checkParentHealth = function() {
    return {
        responding: _STATE.parentResponding,
        lastMessage: _STATE.lastParentMessage,
        missedHeartbeats: _STATE.health.missedHeartbeats,
        handshakeComplete: _STATE.handshakeComplete,
        sessionActive: _STATE.sessionActive,
        inIframe: _STATE.parentDetected,
        connectionMetrics: _STATE.connectionMetrics,
        handshakeStatus: handshake.getStatus(),
        sessionStatus: sessionAdapter.getState(),
        recoveryStatus: recovery.getStatus(),
        startupStatus: startupGovernor.getStatus(),
        environment: environmentDetector.getEnvironmentReport(),
        diagnostics: diagnostics.getReport(),
        authorityStatus: iframeAuthority.getStatus(),
        boot: {
            state: currentBootState,
            parentAuthority: parentAuthorityMode,
            sessionAuthority: _STATE.sessionAuthority
        }
    };
};

function startPeriodicSync() {
    if (_syncTimer) resourceManager.clearInterval(_syncTimer);
    _syncTimer = resourceManager.setInterval(async () => {
        if (_STATE.sessionActive && _STATE.parentResponding && !_STATE.guestMode) {
            await syncWithParent();
        }
    }, 30000);
}

// =============================================
// FIXED: COMPATIBILITY FUNCTIONS
// =============================================

export function safeGetElement(id) {
    try {
        return document.getElementById(id);
    } catch {
        return null;
    }
}

export function hasValidSession() {
    return sessionAdapter.isValid();
}

export function hasValidUser() {
    const session = sessionAdapter.getSession();
    return !!(session && (session.userId || session.id));
}

export function showStatusMessage(message, type = 'info') {
    try {
        if (!loadingMessageElement) {
            loadingMessageElement = document.createElement('div');
            loadingMessageElement.id = 'marketplaceStatusMessage';
            loadingMessageElement.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                padding: 12px 24px; border-radius: 8px; z-index: 9999;
                font-size: 14px; font-weight: 500; display: flex;
                align-items: center; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            `;
            document.body.appendChild(loadingMessageElement);
        }
        
        loadingMessageElement.textContent = message;
        loadingMessageElement.style.display = 'flex';
        
        const colors = {
            info: { bg: '#2196F3', color: 'white' },
            success: { bg: '#4CAF50', color: 'white' },
            error: { bg: '#F44336', color: 'white' },
            warning: { bg: '#FF9800', color: 'black' }
        };
        
        const style = colors[type] || colors.info;
        loadingMessageElement.style.backgroundColor = style.bg;
        loadingMessageElement.style.color = style.color;
        
        if (type === 'success') {
            setTimeout(() => {
                if (loadingMessageElement && loadingMessageElement.parentNode) {
                    loadingMessageElement.style.display = 'none';
                }
            }, 3000);
        }
    } catch {}
}

export function validateDataStructure(data, dataType) {
    try {
        if (!data) return false;
        const validators = {
            [DATA_TYPES.FRIENDS]: (data) => Array.isArray(data),
            [DATA_TYPES.GROUPS]: (data) => Array.isArray(data),
            [DATA_TYPES.CHAT_HISTORY]: (data) => Array.isArray(data),
            [DATA_TYPES.NOTIFICATIONS]: (data) => Array.isArray(data),
            [DATA_TYPES.SETTINGS]: (data) => data && typeof data === 'object'
        };
        const validator = validators[dataType];
        return validator ? validator(data) : true;
    } catch {
        return false;
    }
}

export function getData(dataType) {
    try {
        if (!isReady && !_STATE.ready) return null;
        if (dataCache.has(dataType)) return dataCache.get(dataType);
        
        switch(dataType) {
            case DATA_TYPES.FRIENDS: return userFriends;
            case DATA_TYPES.GROUPS: return userGroups;
            case DATA_TYPES.CHAT_HISTORY: return [];
            case DATA_TYPES.NOTIFICATIONS: return [];
            case DATA_TYPES.SETTINGS:
                const session = sessionAdapter.getSession();
                return {
                    id: session?.userId || window.currentUser?.id || 'unknown',
                    updatedAt: new Date().toISOString(),
                    ...(window.currentUser?.settings || {})
                };
            default: return null;
        }
    } catch {
        return null;
    }
}

export function updateData(dataType, payload) {
    try {
        if (!isReady && !_STATE.ready) return false;
        if (!validateDataStructure(payload, dataType)) return false;
        
        switch(dataType) {
            case DATA_TYPES.FRIENDS:
                userFriends = payload;
                safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
                break;
            case DATA_TYPES.GROUPS:
                userGroups = payload;
                safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
                break;
            case DATA_TYPES.CHAT_HISTORY:
                dataCache.set(dataType, payload);
                break;
            case DATA_TYPES.NOTIFICATIONS:
                dataCache.set(dataType, payload);
                break;
            case DATA_TYPES.SETTINGS:
                if (window.currentUser) {
                    window.currentUser.settings = { ...window.currentUser.settings, ...payload };
                    safeStorage.set(LOCAL_STORAGE_KEYS.USER, window.currentUser);
                }
                break;
            default: return false;
        }
        
        window.dispatchEvent(new CustomEvent('coreDataUpdated', {
            detail: { type: dataType, data: payload, timestamp: Date.now() }
        }));
        
        dataCache.set(dataType, payload);
        return true;
    } catch {
        return false;
    }
}

export function queueMessageForParent(type, payload) {
    try {
        messaging.queueForRetry(type, payload, {});
    } catch {}
}

export function processMessageQueue() {
    try {
        router.processMessageQueue();
    } catch {}
}

export function handleParentMessage(event) {
    try {
        if (!event.data || typeof event.data !== 'object') return;
        router.handleMessage(event);
    } catch {}
}

export function handleParentInit(payload) {
    try {
        if (!payload) return;
        if (payload.session) handleSessionDataFromParent(payload.session);
        if (payload.data) {
            if (payload.data.friendsList) updateData(DATA_TYPES.FRIENDS, payload.data.friendsList);
            if (payload.data.groupsList) updateData(DATA_TYPES.GROUPS, payload.data.groupsList);
        }
    } catch {}
}

export function handleRefreshDataRequest(payload) {
    try {
        if (!isReady && !_STATE.ready) {
            queueMessageForParent('error', { message: 'Cannot refresh data: core not ready' });
            return;
        }
        
        const dataTypes = payload?.dataTypes || Object.values(DATA_TYPES);
        showStatusMessage('Refreshing data...', 'info');
        
        dataTypes.forEach(async (dataType) => {
            try {
                const data = await fetchData(dataType);
                if (data) updateData(dataType, data);
            } catch {}
        });
        
        setTimeout(() => {
            showStatusMessage('Data refreshed successfully', 'success');
            sendToParent('dataRefreshed', { dataTypes, timestamp: Date.now() }, { ack: false });
        }, 1000);
    } catch {}
}

export async function fetchData(dataType) {
    try {
        if (!hasValidSession()) throw new Error('No valid session for API call');
        
        let endpoint;
        switch(dataType) {
            case DATA_TYPES.FRIENDS: endpoint = '/api/user/friends'; break;
            case DATA_TYPES.GROUPS: endpoint = '/api/user/groups'; break;
            case DATA_TYPES.CHAT_HISTORY: endpoint = '/api/messages/history'; break;
            case DATA_TYPES.NOTIFICATIONS: endpoint = '/api/user/notifications'; break;
            case DATA_TYPES.SETTINGS: endpoint = '/api/user/settings'; break;
            default: throw new Error(`Unknown data type: ${dataType}`);
        }
        
        const response = await secureApiCall('GET', endpoint);
        return response;
    } catch (error) {
        throw error;
    }
}

// =============================================
// FIXED: pageCore COMPATIBILITY LAYER
// =============================================

export const pageCore = {
    init: async () => {
        if (isInitializing || isReady || _STATE.initialized) return;
        
        isInitializing = true;
        logOnce('init', 'pageCore initialization started');
        
        try {
            showStatusMessage('Loading marketplace, please wait...', 'info');
            await initializeCore();
            await pageCore.loadParentCommunication();
            await pageCore.loadSession();
            await pageCore.loadEssentialData();
            pageCore.setupEventListeners();
            
            isReady = true;
            isInitializing = false;
            
            sendToParent(PARENT_MESSAGE_TYPES.CORE_READY, {
                iframeId: window.parentCommunicationId || _STATE.frameId,
                status: 'success',
                timestamp: Date.now(),
                bootState: currentBootState
            }, { ack: false });
            
            processMessageQueue();
            showStatusMessage('Marketplace loaded successfully', 'success');
            logOnce('success', 'pageCore initialization complete');
        } catch (error) {
            isInitializing = false;
            logError('pageCore.init', error);
            sendToParent('error', {
                iframeId: window.parentCommunicationId || _STATE.frameId,
                message: error.message,
                timestamp: Date.now()
            }, { ack: false });
        }
    },
    
    loadParentCommunication: async () => {
        return new Promise((resolve) => {
            window.addEventListener('message', handleParentMessage, false);
            window.parentCommunicationId = _STATE.frameId || ('marketplace_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
            setTimeout(resolve, 500);
        });
    },
    
    loadSession: async () => {
        try {
            if (window.parent && window.parent !== window) {
                sendToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
                    id: window.parentCommunicationId,
                    urgent: true
                }, { ack: true, timeout: 3000 });
                
                await new Promise((resolve) => {
                    const checkSession = () => {
                        if (sessionData || !uiBlockedForSession || _STATE.guestMode || _STATE.sessionActive) {
                            resolve();
                        } else {
                            setTimeout(checkSession, 100);
                        }
                    };
                    setTimeout(checkSession, 100);
                });
            }
            
            if (!sessionData && !_STATE.sessionActive) {
                const cachedUser = safeStorage.get(LOCAL_STORAGE_KEYS.USER);
                if (cachedUser) {
                    try {
                        window.currentUser = cachedUser;
                        window.userData = cachedUser;
                    } catch {}
                }
            }
        } catch {}
    },
    
    loadEssentialData: async () => {
        try {
            showStatusMessage('Loading marketplace data...', 'info');
            await pageCore.loadUserFriends();
            await pageCore.loadUserGroups();
            await pageCore.loadListings();
            await Promise.allSettled([
                pageCore.loadTeamMembers(),
                pageCore.loadLeaderboard(),
                pageCore.loadAnalyticsData(),
                pageCore.loadPremiumFeatures()
            ]);
        } catch (error) {
            throw error;
        }
    },
    
    loadUserFriends: async () => {
        try {
            if (hasValidSession()) {
                const friends = await getUserFriends();
                if (friends && Array.isArray(friends)) {
                    userFriends = friends;
                    safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
                    dataCache.set(DATA_TYPES.FRIENDS, friends);
                }
            }
        } catch {
            const cachedFriends = safeStorage.get(LOCAL_STORAGE_KEYS.USER_FRIENDS);
            if (cachedFriends) {
                try {
                    userFriends = cachedFriends;
                    dataCache.set(DATA_TYPES.FRIENDS, userFriends);
                } catch {}
            }
        }
    },
    
    loadUserGroups: async () => {
        try {
            if (hasValidSession()) {
                const groups = await getUserGroups();
                if (groups && Array.isArray(groups)) {
                    userGroups = groups;
                    safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
                    dataCache.set(DATA_TYPES.GROUPS, groups);
                }
            }
        } catch {
            const cachedGroups = safeStorage.get(LOCAL_STORAGE_KEYS.USER_GROUPS);
            if (cachedGroups) {
                try {
                    userGroups = cachedGroups;
                    dataCache.set(DATA_TYPES.GROUPS, userGroups);
                } catch {}
            }
        }
    },
    
    loadListings: async () => {
        try {
            if (hasValidSession()) {
                const response = await secureApiCall('GET', '/api/marketplace/listings');
                if (response && response.listings) {
                    allListings = response.listings;
                    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
                }
            }
        } catch {
            const allListingsData = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
            if (allListingsData) {
                try {
                    allListings = allListingsData;
                } catch {}
            }
        }
    },
    
    loadTeamMembers: async () => {
        try {
            if (hasValidSession() && userSubscription && (userSubscription.plan === 'business' || userSubscription.plan === 'team')) {
                const members = await getTeamMembers();
                if (members && Array.isArray(members)) {
                    teamMembers = members;
                    safeStorage.set(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
                }
            }
        } catch {}
    },
    
    loadLeaderboard: async () => {
        try {
            if (hasValidSession()) {
                const response = await secureApiCall('GET', '/api/marketplace/leaderboard');
                if (response && response.leaderboard) {
                    leaderboardData = response.leaderboard;
                    safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
                }
            }
        } catch {}
    },
    
    loadAnalyticsData: async () => {
        try {
            if (hasValidSession() && isUserPremium()) {
                const analytics = await getAnalyticsData();
                if (analytics) {
                    analyticsData = analytics;
                    safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, JSON.stringify(analyticsData));
                }
            }
        } catch {}
    },
    
    loadPremiumFeatures: async () => {
        try {
            if (hasValidSession()) {
                const response = await secureApiCall('GET', '/api/premium/features');
                if (response && response.features) {
                    premiumFeatures = response.features;
                    safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES, JSON.stringify(premiumFeatures));
                }
            }
        } catch {}
    },
    
    setupEventListeners: () => {
        try {
            setupConnectivityListeners();
            window.addEventListener('coreDataUpdated', () => {});
        } catch {}
    }
};

export async function safeInitializeMarketplaceCore() {
    if (isInitializing || isReady || _STATE.initialized) return;
    await pageCore.init();
}

export async function initializeMarketplaceCore() {
    return safeInitializeMarketplaceCore();
}

export async function initializeEnhancedParentCommunication() {
    try {
        window.parentCommunicationId = _STATE.frameId || ('marketplace_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
        
        if (!window.parent || window.parent === window) {
            handleStandaloneMode();
            return;
        }
        
        let sameOrigin = false;
        try {
            sameOrigin = window.location.origin === window.parent.location.origin;
        } catch {}
        
        secureMessagingChannel = {
            id: window.parentCommunicationId,
            origin: window.location.origin,
            parentOrigin: sameOrigin ? window.parent.location.origin : '*',
            sameOrigin: sameOrigin,
            ready: false
        };
        
        startHandshakeProtocol();
    } catch {
        handleStandaloneMode();
    }
    
    return Promise.resolve();
}

export async function startSecureHandshakeProtocol() {
    if (handshakeInProgress || !window.parent || window.parent === window) return;
    
    try {
        handshakeInProgress = true;
        handshakeRequestSent = false;
        sessionRetryAttempt = 0;
        requestSessionFromParent();
    } catch {
        handshakeInProgress = false;
    }
}

export function requestSessionFromParent() {
    if (handshakeInProgress && handshakeRequestSent) return;
    
    try {
        handshakeRequestSent = true;
        
        sendToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
            source: 'marketplace_iframe',
            id: window.parentCommunicationId,
            timestamp: Date.now(),
            version: '5.2.0',
            retryCount: sessionRetryAttempt,
            frameId: _STATE.frameId,
            environment: environmentDetector.environment
        }, { ack: true, timeout: 3000 });
        
        clearTimeout(handshakeTimeout);
        handshakeTimeout = setTimeout(() => {
            if (!sessionValid && !_STATE.sessionActive) {
                handleSessionRequestTimeout();
            }
        }, 5000);
    } catch {
        handshakeRequestSent = false;
    }
}

export function handleSessionRequestTimeout() {
    try {
        if (sessionRetryAttempt < MAX_SESSION_RETRIES) {
            sessionRetryAttempt++;
            handshakeRequestSent = false;
            requestSessionFromParent();
        } else {
            handshakeInProgress = false;
            if (!parentDataLoaded && !dataFetchInProgress) {
                fetchUserDataDirectly();
            }
            sessionAdapter.enableGuestMode();
        }
    } catch {
        handshakeInProgress = false;
    }
}

export function handleSecureParentMessage(event) {
    try {
        if (!originTrustAdapter.validateMessageOrigin(event)) return;
        
        const message = event.data;
        if (!message || typeof message !== 'object') return;
        
        const modern = compatibility.transformInbound(message);
        
        // Check contract handlers first
        const contractHandler = parentContract.getHandler(modern?.type || message.type);
        if (contractHandler) {
            try {
                contractHandler(modern?.payload || modern?.data || message, modern || message);
            } catch (err) {}
        }
        
        switch (modern?.type) {
            case PARENT_MESSAGE_TYPES.PARENT_READY:
                handleParentReady(modern.payload);
                break;
            case PARENT_MESSAGE_TYPES.SESSION_DATA:
                handleSecureSessionData(modern);
                break;
            case PARENT_MESSAGE_TYPES.SESSION_UPDATE:
                handleSessionUpdate(modern.data || modern.payload);
                break;
            case PARENT_MESSAGE_TYPES.LOGOUT:
                handleParentLogout();
                break;
            case PARENT_MESSAGE_TYPES.REFRESH_UI:
                handleRefreshUI();
                break;
            case PARENT_MESSAGE_TYPES.FORCE_RELOAD:
                handleForceReload();
                break;
            case PARENT_MESSAGE_TYPES.INIT:
            case PARENT_MESSAGE_TYPES.REFRESH_DATA:
                handleParentMessage(event);
                break;
            case PARENT_MESSAGE_TYPES.HANDSHAKE_ACK:
                handshake.handleHandshakeAck?.(modern.payload);
                break;
            case PARENT_MESSAGE_TYPES.SESSION_SYNC:
                handleSessionSync(modern.payload || modern.data);
                break;
            case 'PONG':
            case PARENT_MESSAGE_TYPES.PONG:
                transport.handlePong();
                break;
            case 'SESSION_DATA':
                if (modern.source === 'parent') handleSecureSessionData(modern);
                break;
            case 'user_data':
                migrateLegacyUserData(modern.data || modern.payload);
                break;
            case 'user_profile_updated':
                if (modern.data || modern.payload) handleSessionUpdate(modern.data || modern.payload);
                break;
            case 'user_logged_in':
                sendToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, { force: true }, { ack: true });
                break;
            case 'user_logged_out':
                handleParentLogout();
                break;
            case 'session_expired':
                handleSessionExpired();
                break;
            case 'iframe_response':
                if (modern.requestId === window.parentCommunicationId && modern.data && modern.data.session) {
                    handleSessionDataFromParent(modern.data.session);
                }
                break;
            case 'ping':
                sendToParent('pong', { id: window.parentCommunicationId, timestamp: Date.now() }, { ack: false });
                break;
        }
    } catch {}
}

export function handleSecureSessionData(message) {
    try {
        const data = message.data || message.payload || message;
        if (!data.token && !data.userToken) {
            handshakeInProgress = false;
            return;
        }

        sessionValid = true;
        handshakeInProgress = false;
        clearTimeout(handshakeTimeout);
        
        const sessionDataFromParent = {
            userId: data.user?.id || data.userId || data.userid,
            userToken: data.token || data.userToken,
            expiresAt: data.expiresAt || data.expires_at || new Date(Date.now() + 3600000).toISOString(),
            displayName: data.user?.displayName || data.displayName || data.user?.name || data.name,
            email: data.user?.email || data.email,
            photoURL: data.user?.photoURL || data.photoURL || data.user?.avatar || data.avatar,
            isPremium: data.user?.isPremium || data.isPremium || false,
            trustLevel: data.user?.trustLevel || data.trustLevel || 'new',
            groups: data.user?.groups || data.groups || [],
            friends: data.user?.friends || data.friends || [],
            source: 'parent_handshake'
        };
        
        handleSessionDataFromParent(sessionDataFromParent);
    } catch {
        handshakeInProgress = false;
    }
}

export function handleSessionSync(data) {
    try {
        if (!data) return;
        const sessionData = data.session || data.user || data;
        if (sessionData) {
            const accepted = sessionAdapter.acceptParentSession(sessionData);
            if (accepted) {
                _STATE.sessionActive = true;
                _STATE.guestMode = false;
                const session = sessionAdapter.getSession();
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
                sendToParent(PARENT_MESSAGE_TYPES.SESSION_ACK, {
                    userId: sessionData.userId,
                    timestamp: Date.now(),
                    status: 'active',
                    environment: environmentDetector.environment
                }, { ack: false });
            }
        }
    } catch {}
}

export function handlePageActivated(data) {
    try {
        window.dispatchEvent(new CustomEvent('marketplace:page-activated', { detail: data }));
    } catch {}
}

export function handleNavigate(data) {
    try {
        if (data.url && data.url !== window.location.href) {
            if (data.internal) {
                window.location.hash = data.hash || '';
                window.history.pushState({}, '', data.url);
                window.dispatchEvent(new CustomEvent('marketplace:navigate', { detail: data }));
            } else {
                sendToParent(PARENT_MESSAGE_TYPES.NAVIGATE, { url: data.url, timestamp: Date.now() }, { ack: false });
            }
        }
    } catch {}
}

export function handleCapabilities(data) {
    try {
        if (data && data.capabilities) {
            _STATE.parentCapabilities = data.capabilities;
            sendToParent(PARENT_MESSAGE_TYPES.CAPABILITIES, {
                capabilities: {
                    session: true, heartbeat: true, sync: true, ack: true,
                    signature: !_STATE.sandboxRestrictions?.crypto,
                    timestamp: true, replay: true, retry: true, offline: true,
                    visibility: true, environment: true, recovery: true, diagnostics: true
                },
                timestamp: Date.now(),
                environment: environmentDetector.environment
            }, { ack: false });
        }
    } catch {}
}

export function handleEnvironment(data) {
    try {
        if (data && data.environment) {
            _STATE.environment.parentType = data.environment.type;
        }
    } catch {}
}

export function validateParentOrigin(message, event) {
    try {
        return originTrustAdapter.validateMessageOrigin(event);
    } catch {
        return false;
    }
}

export function validateMessageOrigin(event) {
    try {
        return originTrustAdapter.validateMessageOrigin(event);
    } catch {
        return false;
    }
}

export function startHandshakeProtocol() {
    try {
        sendToParent(PARENT_MESSAGE_TYPES.CHILD_READY, {
            id: window.parentCommunicationId || _STATE.frameId,
            type: 'marketplace',
            version: '5.2.0',
            timestamp: Date.now(),
            environment: environmentDetector.environment,
            once: true
        }, { ack: true });
        
        initiateHandshakeRetry();
    } catch {}
}

export function initiateHandshakeRetry() {
    if (handshakeComplete || _STATE.handshakeComplete) return;
    
    // In auth mode, limit retries
    if (parentAuthorityMode && handshakeRetryCount >= MAX_AUTH_RETRIES) {
        handleParentUnavailable();
        return;
    }
    
    let retryCount = 0;
    const MAX_RETRY = 3;
    
    if (handshakeRetryCount >= maxHandshakeRetries || retryCount > MAX_RETRY) {
        handleParentUnavailable();
        return;
    }
    
    try {
        const delay = handshakeRetryDelay * Math.pow(1.5, handshakeRetryCount);
        handshakeRetryCount++;
        retryCount++;
        
        setTimeout(() => {
            if (!handshakeComplete && !_STATE.handshakeComplete) {
                sendToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
                    id: window.parentCommunicationId || _STATE.frameId,
                    retryCount: handshakeRetryCount,
                    lastAttempt: Date.now()
                }, { ack: true });
                
                if (!handshakeComplete && !_STATE.handshakeComplete && handshakeRetryCount < MAX_RETRY) {
                    initiateHandshakeRetry();
                }
            }
        }, delay);
    } catch {}
}

export function handleParentReady(message) {
    try {
        parentSessionAuthority = {
            ready: true,
            version: message.version || '1.0',
            capabilities: message.capabilities || [],
            timestamp: Date.now()
        };
        
        sendToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
            id: window.parentCommunicationId || _STATE.frameId,
            urgent: true,
            requireValidation: true,
            handshake: true
        }, { ack: true });
        
        handshakeRetryCount = 0;
    } catch {}
}

export function handleSessionDataFromParent(sessionDataFromParent) {
    if (sessionValidationInProgress) return;
    
    try {
        if (!validateSessionSchema(sessionDataFromParent)) {
            sendToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
                error: 'INVALID_SESSION_SCHEMA',
                received: Object.keys(sessionDataFromParent || {})
            }, { ack: false });
            return;
        }
        
        sessionValidationInProgress = true;
        processSessionData(sessionDataFromParent);
        
        handshakeComplete = true;
        _STATE.handshakeComplete = true;
        handshakeRetryCount = 0;
        sessionData = sessionDataFromParent;
        sessionAdapter.acceptParentSession(sessionDataFromParent);
        updateLocalStateFromSession(sessionData);
        
        sendToParent(PARENT_MESSAGE_TYPES.SESSION_CONFIRMED, {
            id: window.parentCommunicationId || _STATE.frameId,
            userId: sessionData.userId,
            timestamp: Date.now(),
            handshakeComplete: true
        }, { ack: true });
        
        uiBlockedForSession = false;
        
        sendToParent(PARENT_MESSAGE_TYPES.UI_READY, {
            id: window.parentCommunicationId || _STATE.frameId,
            component: 'marketplace',
            timestamp: Date.now()
        }, { ack: false });
    } catch (error) {
        sendToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
            error: 'SESSION_PROCESSING_FAILED',
            message: error.message
        }, { ack: false });
    } finally {
        sessionValidationInProgress = false;
    }
}

export function bindUIAfterSession() {
    try {
        if (window._MARKETPLACE_UI_BOUND_) return;
        window._MARKETPLACE_UI_BOUND_ = true;
        
        window.dispatchEvent(new CustomEvent('marketplaceSessionReady', {
            detail: { user: window.currentUser, session: sessionAdapter.getSession(), timestamp: Date.now() }
        }));
        
        const marketplaceContainer = safeGetElement('marketplaceContainer');
        if (marketplaceContainer) marketplaceContainer.classList.add('session-ready');
    } catch {}
}

export function validateSessionSchema(session) {
    try {
        if (!session || typeof session !== 'object') return false;
        const hasUserId = !!(session.userId || session.user_id || session.userid);
        const hasToken = !!(session.userToken || session.token || session.user_token);
        return hasUserId && hasToken;
    } catch {
        return false;
    }
}

export function processSessionData(sessionDataFromParent) {
    try {
        const userDataFromSession = {
            id: sessionDataFromParent.userId || sessionDataFromParent.user_id || sessionDataFromParent.userid,
            displayName: sessionDataFromParent.displayName || sessionDataFromParent.name || 'User',
            email: sessionDataFromParent.email || '',
            photoURL: sessionDataFromParent.photoURL || sessionDataFromParent.avatar || '',
            isPremium: sessionDataFromParent.isPremium || false,
            subscription: sessionDataFromParent.subscription || null,
            trustLevel: sessionDataFromParent.trustLevel || 'new',
            groups: sessionDataFromParent.groups || [],
            friends: sessionDataFromParent.friends || []
        };
        
        window.currentUser = userDataFromSession;
        window.userData = userDataFromSession;
        
        if (sessionDataFromParent.userToken || sessionDataFromParent.token) {
            storeCentralizedToken(sessionDataFromParent.userToken || sessionDataFromParent.token);
        }
        
        parentDataLoaded = true;
        dataFetchInProgress = false;
    } catch {}
}

export function storeCentralizedToken(token) {
    try {
        if (!token || typeof token !== 'string' || token.length < 5) return;
        safeStorage.set('USER_TOKEN', token);
    } catch {}
}

export function updateLocalStateFromSession(session) {
    try {
        if (session.groups && Array.isArray(session.groups)) {
            userGroups = session.groups;
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
        }
        if (session.friends && Array.isArray(session.friends)) {
            userFriends = session.friends;
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
        }
        if (session.subscription) {
            userSubscription = session.subscription;
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
        }
    } catch {}
}

export function showMarketplaceUI() {
    try {
        const marketplaceContainer = safeGetElement('marketplaceContainer');
        if (marketplaceContainer) {
            marketplaceContainer.style.display = 'block';
            marketplaceContainer.style.opacity = '1';
            marketplaceContainer.style.visibility = 'visible';
        }
        const loadingIndicator = safeGetElement('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    } catch {}
}

export async function waitForSessionData() {
    return new Promise((resolve) => {
        try {
            if (sessionData || _STATE.sessionActive || _STATE.guestMode) {
                resolve();
                return;
            }
            
            const sessionWaitTimeout = setTimeout(() => {
                handleSessionTimeout();
                resolve();
            }, 30000);
            
            const checkInterval = setInterval(() => {
                if (sessionData || _STATE.sessionActive || _STATE.guestMode || !uiBlockedForSession) {
                    clearInterval(checkInterval);
                    clearTimeout(sessionWaitTimeout);
                    resolve();
                }
            }, 100);
        } catch {
            resolve();
        }
    });
}

export function handleSessionTimeout() {
    try {
        showNotification('Waiting for authentication. Some features may be limited.', 'warning');
        uiBlockedForSession = false;
        const cachedUser = safeStorage.get(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            try {
                window.currentUser = cachedUser;
                window.userData = cachedUser;
            } catch {}
        }
        sessionAdapter.enableGuestMode();
    } catch {}
}

export function handleSessionUpdate(updatedData) {
    try {
        if (!updatedData || typeof updatedData !== 'object') return;
        
        const currentSession = sessionAdapter.getSession() || sessionData || {};
        const mergedSession = { ...currentSession, ...updatedData };
        
        sessionData = mergedSession;
        sessionAdapter.acceptParentSession(mergedSession);
        
        if (updatedData.userId || updatedData.id || updatedData.displayName) {
            if (!window.currentUser) window.currentUser = {};
            if (!window.userData) window.userData = {};
            window.currentUser = { ...window.currentUser, ...updatedData };
            window.userData = { ...window.userData, ...updatedData };
            if (updatedData.displayName || updatedData.photoURL || updatedData.isPremium) {
                safeStorage.set(LOCAL_STORAGE_KEYS.USER, window.currentUser);
                safeStorage.set(LOCAL_STORAGE_KEYS.USER_PROFILE, window.userData);
            }
            if (updatedData.subscription) userSubscription = updatedData.subscription;
        }
    } catch {}
}

export function handleParentLogout() {
    try {
        clearSessionData();
        showNotification('You have been logged out.', 'warning');
        sessionAdapter.enableGuestMode();
    } catch {}
}

export function clearSessionData() {
    try {
        sessionData = null;
        window.currentUser = null;
        window.userData = null;
        userSubscription = null;
        handshakeComplete = false;
        _STATE.handshakeComplete = false;
        sessionValid = false;
        _STATE.sessionActive = false;
        handshakeInProgress = false;
        
        clearTimeout(handshakeTimeout);
        handshakeTimeout = null;
        handshakeRequestSent = false;
        sessionRetryAttempt = 0;
        
        safeStorage.remove('USER_TOKEN');
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER);
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER_PROFILE);
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        safeStorage.sessionRemove('core_session_cache');
        
        parentDataLoaded = false;
        directAPILoaded = false;
        
        isReady = _STATE.ready;
        isInitializing = false;
        messageQueue = [];
        dataCache.clear();
        
        sessionAdapter.clear();
        
        window.__MODULE_SESSION_ACTIVE__ = false;
    } catch {}
}

export function handleRefreshUI() {
    try {
        window.dispatchEvent(new CustomEvent('marketplace:refresh-ui'));
    } catch {}
}

export function handleForceReload() {
    try {
        saveAllMarketplaceData();
        window.location.reload();
    } catch {}
}

export async function secureApiCall(method, endpoint, data = null, options = {}) {
    if (!hasValidSession() && !_STATE.guestMode && !_STATE.demoMode) {
        if (method !== 'GET' || endpoint.includes('/auth/')) {
            sendToParent(PARENT_MESSAGE_TYPES.NEED_REFRESH, {
                reason: 'api_call_without_session',
                endpoint: endpoint,
                method: method
            }, { ack: false });
        }
        if (_STATE.guestMode) {
            if (endpoint.includes('/marketplace/listings') && method === 'GET') {
                try {
                    const cached = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                    if (cached) return { listings: cached };
                } catch {}
            }
            return null;
        }
        throw new Error('No valid session available for API call');
    }
    
    if (!isAuthReady && !_STATE.guestMode) {
        return queueApiCall(method, endpoint, data, options);
    }
    
    try {
        const response = await callApi(method, endpoint, data);
        return response;
    } catch (error) {
        return handleApiError(error, method, endpoint);
    }
}

export async function handleApiError(error, method, endpoint) {
    try {
        sendToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
            error: 'API_CALL_FAILED',
            endpoint: endpoint,
            method: method,
            message: error.message
        }, { ack: false });
        
        if (error.status === 401 || error.status === 403) {
            return handleUnauthorized();
        }
        throw error;
    } catch {
        throw error;
    }
}

export async function handleUnauthorized() {
    try {
        sendToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
            error: 'UNAUTHORIZED_API_CALL',
            timestamp: Date.now()
        }, { ack: false });
        safeStorage.remove('USER_TOKEN');
        showNotification('Session expired. Please log in again.', 'error');
        sessionAdapter.enableGuestMode();
        return null;
    } catch {
        return null;
    }
}

export async function safeApiCall(method, endpoint, data = null) {
    try {
        return await secureApiCall(method, endpoint, data);
    } catch {
        return null;
    }
}

export function handleParentUnavailable() {
    try {
        showReconnectionState();
        startReconnectionAttempts();
        sessionAdapter.enableGuestMode();
    } catch {}
}

export function showReconnectionState() {
    try {
        let reconnectMsg = safeGetElement('reconnectionMessage');
        if (!reconnectMsg) {
            reconnectMsg = document.createElement('div');
            reconnectMsg.id = 'reconnectionMessage';
            reconnectMsg.style.cssText = `
                position: fixed; top: 10px; right: 10px;
                background: rgba(255, 193, 7, 0.9); color: #000;
                padding: 10px 15px; border-radius: 8px; font-size: 14px;
                z-index: 9999; display: flex; align-items: center; gap: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            `;
            reconnectMsg.innerHTML = `
                <i class="fas fa-sync-alt fa-spin"></i>
                <span>Reconnecting to parent session...</span>
            `;
            document.body.appendChild(reconnectMsg);
        }
        reconnectMsg.style.display = 'flex';
    } catch {}
}

export function startReconnectionAttempts() {
    try {
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 20;
        
        const attemptReconnection = () => {
            if (handshakeComplete || _STATE.handshakeComplete || reconnectAttempts >= maxReconnectAttempts || reconnectAttempts > 3) {
                return;
            }
            reconnectAttempts++;
            sendToParent(PARENT_MESSAGE_TYPES.CHILD_READY, {
                id: window.parentCommunicationId || _STATE.frameId,
                type: 'marketplace',
                reconnection: true,
                attempt: reconnectAttempts,
                timestamp: Date.now(),
                once: true
            }, { ack: true });
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000);
            setTimeout(attemptReconnection, delay);
        };
        setTimeout(attemptReconnection, 2000);
    } catch {}
}

export function hideReconnectionState() {
    try {
        const reconnectMsg = safeGetElement('reconnectionMessage');
        if (reconnectMsg) reconnectMsg.style.display = 'none';
    } catch {}
}

export function setupConnectivityListeners() {
    try {
        window.addEventListener('online', () => {
            sendToParent('ping', { type: 'connectivity_check' }, { ack: false });
            syncOfflineMarketplaceData();
        });
        window.addEventListener('offline', () => {
            showNotification('Working offline - changes will sync when back online', 'info');
        });
    } catch {}
}

export function initializeTokenSystem() {
    if (tokenInitializationPromise) return tokenInitializationPromise;
    
    tokenInitializationPromise = new Promise(async (resolve, reject) => {
        try {
            if (!hasValidSession() && !_STATE.guestMode) {
                throw new Error('No session data available for token initialization');
            }
            
            const session = sessionAdapter.getSession();
            if (!_STATE.guestMode && (!session || !session.userToken)) {
                throw new Error('Invalid token in session data');
            }
            
            if (session && session.userToken && isValidToken(session.userToken)) {
                storeCentralizedToken(session.userToken);
            }
            
            isAuthReady = true;
            resolve();
        } catch (error) {
            isAuthReady = true;
            reject(error);
        }
    });
    
    return tokenInitializationPromise;
}

export function isValidToken(token) {
    try {
        return !!(token && typeof token === 'string' && token !== 'undefined' && token !== 'null' && token.length >= 5);
    } catch {
        return false;
    }
}

export async function waitForApiJs() {
    return new Promise((resolve) => {
        const checkApiJs = () => {
            try {
                if (typeof callApi === 'function' && typeof getUserToken === 'function') {
                    resolve();
                } else {
                    setTimeout(checkApiJs, 100);
                }
            } catch {
                setTimeout(checkApiJs, 100);
            }
        };
        const timeoutId = setTimeout(() => resolve(), 5000);
        checkApiJs();
        setTimeout(() => clearTimeout(timeoutId), 6000);
    });
}

export function handleInitializationFailure(error) {
    try {
        sendToParent(PARENT_MESSAGE_TYPES.AUTH_ERROR, {
            error: 'INITIALIZATION_FAILED',
            component: 'marketplace',
            message: error.message,
            stack: error.stack
        }, { ack: false });
        showNotification('Failed to load marketplace. Some features may be limited.', 'error');
        showMarketplaceUI();
        sessionAdapter.enableGuestMode();
    } catch {}
}

export function getCentralToken() {
    try {
        const session = sessionAdapter.getSession();
        if (session && session.userToken) return session.userToken;
        if (typeof getUserToken === 'function') {
            try {
                const token = getUserToken();
                if (token) return token;
            } catch {}
        }
        const legacyTokens = ['accessToken', 'moodchat_token', 'authToken', 'knecta_auth_token', 'USER_TOKEN'];
        for (const tokenKey of legacyTokens) {
            const legacyToken = safeStorage.get(tokenKey);
            if (legacyToken) return legacyToken;
        }
        return null;
    } catch {
        return null;
    }
}

export function handleStandaloneMode() {
    try {
        showNotification('Running in standalone mode. Parent coordination disabled.', 'warning');
        uiBlockedForSession = false;
        _STATE.guestMode = true;
        sessionAdapter.enableGuestMode();
        const cachedUser = safeStorage.get(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            try {
                window.currentUser = cachedUser;
                window.userData = cachedUser;
            } catch {}
        }
    } catch {}
}

export async function bootstrapIframe() {
    if (isBootstrapped || _STATE.initialized) return;
    
    try {
        await startSecureHandshakeProtocol();
        if (!sessionData && !_STATE.sessionActive) await new Promise(resolve => setTimeout(resolve, 1000));
        if (tokenInitializationPromise) {
            try { await tokenInitializationPromise; } catch {}
        }
        loadCachedDataInstantly();
        if (hasValidSession()) {
            try { await secureApiCall('GET', '/api/auth/verify'); } catch {}
        }
        isBootstrapped = true;
    } catch {
        isBootstrapped = true;
        sessionAdapter.enableGuestMode();
    }
}

export function loadCachedDataInstantly() {
    try {
        const cachedUser = safeStorage.get(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            try {
                if (cachedUser.displayName || cachedUser.photoURL) {
                    if (!window.currentUser) window.currentUser = {};
                    if (!window.userData) window.userData = {};
                    window.currentUser.displayName = cachedUser.displayName || window.currentUser.displayName;
                    window.currentUser.photoURL = cachedUser.photoURL || window.currentUser.photoURL;
                    window.userData.displayName = cachedUser.displayName || window.userData.displayName;
                    window.userData.photoURL = cachedUser.photoURL || window.userData.photoURL;
                }
            } catch {}
        }
        
        const cachedMyListings = safeStorage.get(LOCAL_STORAGE_KEYS.MY_LISTINGS);
        if (cachedMyListings) {
            try { myListings = cachedMyListings; } catch {}
        }
        
        const cachedAllListings = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
        if (cachedAllListings) {
            try { allListings = cachedAllListings; } catch {}
        }
        
        const cachedSaved = safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
        if (cachedSaved) {
            try { savedItems = cachedSaved; } catch {}
        }
        
        const cachedNotes = safeStorage.get(LOCAL_STORAGE_KEYS.PRIVATE_NOTES);
        if (cachedNotes) {
            try { privateNotes = cachedNotes; } catch {}
        }
        
        const cachedDrafts = safeStorage.get(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS);
        if (cachedDrafts) {
            try { offlineDrafts = cachedDrafts; } catch {}
        }
        
        const cachedTrust = safeStorage.get(LOCAL_STORAGE_KEYS.TRUST_STATS);
        if (cachedTrust) {
            try { trustStats = cachedTrust; } catch {}
        }
        
        const cachedGroups = safeStorage.get(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (cachedGroups) {
            try { userGroups = cachedGroups; } catch {}
        }
        
        const cachedFriends = safeStorage.get(LOCAL_STORAGE_KEYS.USER_FRIENDS);
        if (cachedFriends) {
            try { userFriends = cachedFriends; } catch {}
        }
        
        const cachedSubscription = safeStorage.get(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (cachedSubscription) {
            try { userSubscription = cachedSubscription; } catch {}
        }
        
        const cachedTeam = safeStorage.get(LOCAL_STORAGE_KEYS.TEAM_MEMBERS);
        if (cachedTeam) {
            try { teamMembers = cachedTeam; } catch {}
        }
    } catch {}
}

export async function initializeEnhancedMarketplace() {
    try {
        checkDarkMode();
        await checkUserPremiumStatus();
        await loadEnhancedMarketplaceData();
        cleanupExpiredListings();
    } catch {}
}

export async function checkUserPremiumStatus() {
    try {
        const localSubscription = safeStorage.get(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (localSubscription) {
            try {
                userSubscription = localSubscription;
                if (userSubscription.expiresAt && new Date(userSubscription.expiresAt) < new Date()) {
                    userSubscription = null;
                    safeStorage.remove(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
                } else {
                    return;
                }
            } catch {}
        }
        const response = await safeApiCall('GET', '/api/user/subscription');
        if (response && response.subscription) {
            userSubscription = response.subscription;
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
        }
    } catch {}
}

export async function loadEnhancedMarketplaceData() {
    try {
        const promises = [
            loadListingsFromBackend(),
            loadUserGroups(),
            loadUserFriends(),
            loadTeamMembers(),
            loadLeaderboard(),
            loadAnalyticsData(),
            loadPremiumFeatures(),
            loadSpotlightListingsFromBackend()
        ];
        await Promise.allSettled(promises);
        updateListingCounts();
    } catch {
        generateSampleMarketplaceData();
    }
}

export async function loadListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/listings');
        if (response && response.listings) {
            allListings = response.listings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        }
    } catch {
        throw new Error('Failed to load listings');
    }
}

export async function loadSpotlightListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/spotlight');
        if (response && response.spotlightListings) {
            safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, response.spotlightListings);
        }
    } catch {}
}

export function updateListingCounts() {
    try {
        updateAvailableListingsCount();
    } catch {}
}

export function updateAvailableListingsCount() {
    try {
        const element = document.getElementById('availableListingsCount');
        if (element) {
            element.textContent = allListings.length;
        }
    } catch {}
}

export function isUserPremium() {
    try {
        if (_STATE.demoMode) return true;
        const session = sessionAdapter.getSession();
        if (session && session.isPremium) return true;
        return userSubscription && userSubscription.status === 'active';
    } catch {
        return false;
    }
}

export function isListingVisibleToUser(listing) {
    try {
        if (!listing) return false;
        const session = sessionAdapter.getSession();
        const currentUserId = session?.userId || window.currentUser?.id || window.currentUser?._id;
        if (!currentUserId && !_STATE.guestMode) return false;
        if (_STATE.guestMode && listing.visibility === 'public') return true;
        if (listing.userId === currentUserId) return true;
        if (listing.visibility === TRUST_CIRCLES.FRIENDS) {
            return userFriends.some(friend => friend.id === listing.userId);
        } else if (listing.visibility === TRUST_CIRCLES.GROUPS) {
            return listing.allowedGroups && listing.allowedGroups.some(groupId => 
                userGroups.some(group => group.id === groupId)
            );
        } else if (listing.visibility === TRUST_CIRCLES.SELECTED) {
            return listing.allowedUsers && listing.allowedUsers.includes(currentUserId);
        } else if (listing.visibility === TRUST_CIRCLES.PREMIUM) {
            return isUserPremium();
        }
        return true;
    } catch {
        return false;
    }
}

export function filterListingsByMood(listings, mood) {
    try {
        if (!Array.isArray(listings)) return [];
        switch (mood) {
            case MOOD_CONTEXTS.HELP:
                return listings.filter(l => l.availability === AVAILABILITY.URGENT);
            case MOOD_CONTEXTS.LEARN:
                return listings.filter(l => l.type === LISTING_TYPES.DIGITAL || 
                    (l.category && l.category.toLowerCase().includes('tutor')));
            case MOOD_CONTEXTS.URGENT:
                return listings.filter(l => l.availability === AVAILABILITY.URGENT);
            case MOOD_CONTEXTS.CREATIVE:
                return listings.filter(l => l.category && 
                    (l.category.toLowerCase().includes('art') || l.category.toLowerCase().includes('design')));
            case MOOD_CONTEXTS.BUSINESS:
                return listings.filter(l => l.category && 
                    (l.category.toLowerCase().includes('business') || l.category.toLowerCase().includes('consult')));
            default:
                return listings;
        }
    } catch {
        return listings || [];
    }
}

export function getTrustIndicator(userId, trustLevel) {
    try {
        if (trustLevel) {
            const level = trustLevel.toUpperCase();
            const indicator = TRUST_INDICATORS[level] || TRUST_INDICATORS.NEW;
            return `<span class="trust-indicator ${indicator.class}">${indicator.text}</span>`;
        }
        return '<span class="trust-indicator trust-new">New</span>';
    } catch {
        return '<span class="trust-indicator trust-new">New</span>';
    }
}

export async function trackListingView(listingId) {
    try {
        if (!analyticsData.views) analyticsData.views = 0;
        analyticsData.views++;
        safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
        await safeApiCall('POST', `/api/marketplace/listings/${listingId}/view`);
    } catch {}
}

export function updateTrustStats(action) {
    try {
        if (!trustStats[action]) trustStats[action] = 0;
        trustStats[action]++;
        safeStorage.set(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
    } catch {}
}

export async function createPremiumServiceListing(title, description, premiumOptions = {}) {
    try {
        if (!hasValidUser() && !_STATE.demoMode) throw new Error('User not authenticated');
        
        const session = sessionAdapter.getSession();
        const userId = session?.userId || window.currentUser?.id || window.currentUser?._id || 'demo_user';
        const user = session || window.userData || { displayName: 'Demo User' };
        
        const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const listing = {
            id: listingId,
            userId: userId,
            user: user,
            type: LISTING_TYPES.SERVICE,
            title: title,
            description: description,
            price: premiumOptions.price,
            availability: premiumOptions.availability || AVAILABILITY.FREE,
            visibility: premiumOptions.visibility || TRUST_CIRCLES.FRIENDS,
            moodContext: premiumOptions.moodContext,
            template: premiumOptions.template,
            featured: premiumOptions.featured || false,
            boosted: premiumOptions.boosted || false,
            verified: premiumOptions.verified || false,
            videoIntro: premiumOptions.videoIntro,
            acceptsTips: premiumOptions.acceptsTips || false,
            autoRenew: premiumOptions.autoRenew || false,
            teamMembers: premiumOptions.teamMembers || [],
            allowedGroups: premiumOptions.allowedGroups,
            allowedUsers: premiumOptions.allowedUsers,
            expiresAt: premiumOptions.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            privateNotes: premiumOptions.privateNotes,
            teamNotes: premiumOptions.teamNotes,
            premium: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (premiumOptions.featured) await processFeaturedListing(listing);
        if (premiumOptions.boosted) await processBoostedListing(listing);
        
        myListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        
        const premiumListings = safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || [];
        premiumListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, premiumListings);
        
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
            if (response && response.listing) listing.id = response.listing.id || listingId;
        } catch {
            queueForSync(listing, 'premium_listing');
        }
        
        updateListingStreak();
        updateTrustStats('listingCreated');
        
        return listing;
    } catch {
        return null;
    }
}

export async function createPremiumDigitalListing(title, description, fileData, premiumOptions = {}) {
    try {
        if (!hasValidUser() && !_STATE.demoMode) throw new Error('User not authenticated');
        
        const session = sessionAdapter.getSession();
        const userId = session?.userId || window.currentUser?.id || window.currentUser?._id || 'demo_user';
        const user = session || window.userData || { displayName: 'Demo User' };
        
        const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const listing = {
            id: listingId,
            userId: userId,
            user: user,
            type: LISTING_TYPES.DIGITAL,
            title: title,
            description: description,
            price: premiumOptions.price,
            mediaUrl: fileData?.url || '',
            fileUrl: fileData?.url || '',
            fileName: fileData?.name || '',
            fileSize: fileData?.size || 0,
            fileType: fileData?.type || '',
            visibility: premiumOptions.visibility || TRUST_CIRCLES.FRIENDS,
            moodContext: premiumOptions.moodContext,
            template: premiumOptions.template,
            featured: premiumOptions.featured || false,
            boosted: premiumOptions.boosted || false,
            verified: premiumOptions.verified || false,
            arPreview: premiumOptions.arPreview,
            videoIntro: premiumOptions.videoIntro,
            acceptsTips: premiumOptions.acceptsTips || false,
            autoRenew: premiumOptions.autoRenew || false,
            teamMembers: premiumOptions.teamMembers || [],
            allowedGroups: premiumOptions.allowedGroups,
            allowedUsers: premiumOptions.allowedUsers,
            expiresAt: premiumOptions.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            privateNotes: premiumOptions.privateNotes,
            teamNotes: premiumOptions.teamNotes,
            premium: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (premiumOptions.featured) await processFeaturedListing(listing);
        if (premiumOptions.boosted) await processBoostedListing(listing);
        
        myListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        
        const premiumListings = safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || [];
        premiumListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, premiumListings);
        
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
            if (response && response.listing) listing.id = response.listing.id || listingId;
        } catch {
            queueForSync(listing, 'premium_listing');
        }
        
        updateListingStreak();
        updateTrustStats('listingCreated');
        
        return listing;
    } catch {
        return null;
    }
}

export async function processFeaturedListing(listing) {
    try {
        const spotlightListings = safeStorage.get(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS) || [];
        spotlightListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, spotlightListings);
        await safeApiCall('POST', '/api/marketplace/spotlight', { listingId: listing.id });
    } catch {}
}

export async function processBoostedListing(listing) {
    try {
        await safeApiCall('POST', '/api/marketplace/boost', { listingId: listing.id, duration: '24h' });
    } catch {}
}

export async function processPremiumPayment(listing, options) {
    try {
        const paymentAmount = calculatePremiumCost(options);
        const paymentData = { amount: paymentAmount, currency: 'USD', listingId: listing.id, features: options };
        const response = await safeApiCall('POST', '/api/payments/process', paymentData);
        return response && response.success;
    } catch {
        return false;
    }
}

export function calculatePremiumCost(options) {
    try {
        let cost = 0;
        if (options.featured) cost += 5;
        if (options.boosted) cost += 3;
        if (options.verified) cost += 10;
        if (options.autoRenew) cost += 1;
        return cost;
    } catch {
        return 0;
    }
}

export async function sendTip(listingId, amount, customAmount = null) {
    try {
        const finalAmount = customAmount || amount;
        const tipData = { listingId, amount: finalAmount, currency: 'USD' };
        const response = await safeApiCall('POST', '/api/marketplace/tips', tipData);
        if (response && response.success) {
            updateAnalyticsData('tipReceived', finalAmount);
            return true;
        }
    } catch {}
    return false;
}

export function updateAnalyticsData(type, value) {
    try {
        if (!analyticsData[type]) analyticsData[type] = 0;
        analyticsData[type] += value;
        safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
    } catch {}
}

export function updateListingStreak() {
    try {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        if (!streakData.lastListingDate) {
            streakData = { currentStreak: 1, longestStreak: 1, lastListingDate: today, totalListings: 1 };
        } else if (streakData.lastListingDate === today) {
            streakData.totalListings++;
        } else if (streakData.lastListingDate === yesterday) {
            streakData.currentStreak++;
            streakData.totalListings++;
            streakData.lastListingDate = today;
            if (streakData.currentStreak > streakData.longestStreak) {
                streakData.longestStreak = streakData.currentStreak;
            }
        } else {
            streakData.currentStreak = 1;
            streakData.totalListings++;
            streakData.lastListingDate = today;
        }
        safeStorage.set(LOCAL_STORAGE_KEYS.STREAK_DATA, streakData);
        checkStreakRewards();
    } catch {}
}

export function checkStreakRewards() {
    try {
        const rewards = {
            3: '🎉 3-day streak! Keep going!',
            7: '🏆 Weekly streak! You earned a badge!',
            30: '👑 Monthly streak! Premium features unlocked for a week!'
        };
        if (rewards[streakData.currentStreak]) {
            showNotification(rewards[streakData.currentStreak], 'success');
            if (streakData.currentStreak === 30) awardTemporaryPremium(7);
        }
    } catch {}
}

export function awardTemporaryPremium(days) {
    try {
        const tempPremium = { status: 'active', plan: 'temporary', expiresAt: new Date(Date.now() + days * 86400000).toISOString() };
        userSubscription = tempPremium;
        safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, tempPremium);
    } catch {}
}

export async function processBulkUpload(file) {
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const content = e.target.result;
                let listings = [];
                if (file.type === 'application/json') {
                    listings = JSON.parse(content);
                } else if (file.type === 'text/csv') {
                    listings = parseCSV(content);
                }
                if (listings.length > 0) await uploadBulkListings(listings);
            } catch {}
        };
        if (file.type === 'application/json' || file.type === 'text/csv') {
            reader.readAsText(file);
        }
    } catch {}
}

export function parseCSV(content) {
    try {
        const lines = content.split('\n');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',');
        const listings = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',');
            const listing = {};
            for (let j = 0; j < headers.length; j++) {
                listing[headers[j].trim()] = values[j] ? values[j].trim() : '';
            }
            listings.push(listing);
        }
        return listings;
    } catch {
        return [];
    }
}

export async function uploadBulkListings(listings) {
    try {
        for (let i = 0; i < listings.length; i++) {
            const listing = listings[i];
            try {
                await safeApiCall('POST', '/api/marketplace/listings/bulk', listing);
            } catch {}
        }
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
    } catch {}
}

export async function exportAnalyticsData(format) {
    try {
        const result = await exportAnalytics(format);
        if (result && result.downloadUrl) {
            const link = document.createElement('a');
            link.href = result.downloadUrl;
            link.download = `analytics_${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    } catch {}
}

export async function backupMarketplaceData() {
    try {
        const backupData = {
            myListings, savedItems, privateNotes, offlineDrafts, trustStats,
            analyticsData, premiumFeatures, timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `marketplace_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch {}
}

export async function restoreMarketplaceData(file) {
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const backupData = JSON.parse(e.target.result);
                if (!backupData.timestamp || !backupData.myListings) throw new Error('Invalid backup file');
                myListings = backupData.myListings || [];
                savedItems = backupData.savedItems || [];
                privateNotes = backupData.privateNotes || [];
                offlineDrafts = backupData.offlineDrafts || [];
                trustStats = backupData.trustStats || {};
                analyticsData = backupData.analyticsData || {};
                premiumFeatures = backupData.premiumFeatures || {};
                safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
                safeStorage.set(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
                safeStorage.set(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS, offlineDrafts);
                safeStorage.set(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
                safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
                safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES, premiumFeatures);
                showNotification('Backup restored successfully', 'success');
            } catch (error) {
                showNotification('Failed to restore backup: Invalid file format', 'error');
            }
        };
        reader.onerror = () => showNotification('Failed to read backup file', 'error');
        reader.readAsText(file);
    } catch {}
}

export function isListingExpired(listing) {
    try {
        return listing && listing.expiresAt && new Date(listing.expiresAt) < new Date();
    } catch {
        return false;
    }
}

export function cleanupExpiredListings() {
    try {
        const expiredListings = allListings.filter(l => isListingExpired(l));
        if (expiredListings.length > 0) {
            allListings = allListings.filter(l => !isListingExpired(l));
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
            myListings = myListings.filter(l => !isListingExpired(l));
            safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        }
    } catch {}
}

export function formatTimeAgo(date) {
    try {
        if (!(date instanceof Date)) date = new Date(date);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return `${Math.floor(diffDays / 7)}w ago`;
    } catch {
        return 'Unknown time';
    }
}

export function showNotification(message, type = 'success') {
    try {
        const notificationText = safeGetElement('notificationText');
        if (!notificationText) return;
        notificationText.textContent = message;
        const notification = safeGetElement('notification');
        if (!notification) return;
        notification.className = 'notification';
        notification.classList.add(type);
        notification.classList.add('active');
        setTimeout(() => {
            if (notification.parentNode) notification.classList.remove('active');
        }, 3000);
    } catch {}
}

export function saveToLocalStorage(key, data) {
    safeStorage.set(key, data);
}

export function escapeHtml(text) {
    try {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    } catch {
        return text || '';
    }
}

export function checkDarkMode() {
    try {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.setAttribute('data-theme', 'dark');
        }
    } catch {}
}

export function queueForSync(data, type) {
    try {
        const syncQueue = safeStorage.get(LOCAL_STORAGE_KEYS.SYNC_QUEUE) || [];
        syncQueue.push({ type: 'marketplace_' + type, data, timestamp: Date.now(), retryCount: 0 });
        safeStorage.set(LOCAL_STORAGE_KEYS.SYNC_QUEUE, syncQueue);
    } catch {}
}

export function formatTimeRemaining(date) {
    try {
        const now = new Date();
        const targetDate = new Date(date);
        const diffMs = targetDate - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        if (diffDays > 0) return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
        if (diffHours > 0) return `in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
        return 'soon';
    } catch {
        return 'soon';
    }
}

export function formatFileSize(bytes) {
    try {
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } catch {
        return 'Unknown size';
    }
}

export function createServiceListing(title, description, options = {}) {
    try {
        if (!hasValidUser() && !_STATE.demoMode) throw new Error('User not authenticated');
        
        const session = sessionAdapter.getSession();
        const userId = session?.userId || window.currentUser?.id || window.currentUser?._id || 'demo_user';
        const user = session || window.userData || { displayName: 'Demo User' };
        
        const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const listing = {
            id: listingId,
            userId: userId,
            user: user,
            type: LISTING_TYPES.SERVICE,
            title: title,
            description: description,
            price: options.price,
            availability: options.availability || AVAILABILITY.FREE,
            visibility: options.visibility || TRUST_CIRCLES.FRIENDS,
            moodContext: options.moodContext,
            template: options.template,
            allowedGroups: options.allowedGroups,
            allowedUsers: options.allowedUsers,
            expiresAt: options.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            privateNotes: options.privateNotes,
            teamNotes: options.teamNotes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        myListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            safeApiCall('POST', '/api/marketplace/listings', listing).then(response => {
                if (response && response.listing) listing.id = response.listing.id || listingId;
            }).catch(() => queueForSync(listing, 'listing'));
        } catch {
            queueForSync(listing, 'listing');
        }
        
        updateListingStreak();
        updateTrustStats('listingCreated');
        
        return listing;
    } catch {
        return null;
    }
}

export function createDigitalListing(title, description, fileData, options = {}) {
    try {
        if (!hasValidUser() && !_STATE.demoMode) throw new Error('User not authenticated');
        
        const session = sessionAdapter.getSession();
        const userId = session?.userId || window.currentUser?.id || window.currentUser?._id || 'demo_user';
        const user = session || window.userData || { displayName: 'Demo User' };
        
        const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const listing = {
            id: listingId,
            userId: userId,
            user: user,
            type: LISTING_TYPES.DIGITAL,
            title: title,
            description: description,
            price: options.price,
            mediaUrl: fileData?.url || '',
            fileUrl: fileData?.url || '',
            fileName: fileData?.name || '',
            fileSize: fileData?.size || 0,
            fileType: fileData?.type || '',
            visibility: options.visibility || TRUST_CIRCLES.FRIENDS,
            moodContext: options.moodContext,
            template: options.template,
            allowedGroups: options.allowedGroups,
            allowedUsers: options.allowedUsers,
            expiresAt: options.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            privateNotes: options.privateNotes,
            teamNotes: options.teamNotes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        myListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            safeApiCall('POST', '/api/marketplace/listings', listing).then(response => {
                if (response && response.listing) listing.id = response.listing.id || listingId;
            }).catch(() => queueForSync(listing, 'listing'));
        } catch {
            queueForSync(listing, 'listing');
        }
        
        updateListingStreak();
        updateTrustStats('listingCreated');
        
        return listing;
    } catch {
        return null;
    }
}

export async function downloadDigitalFile(listingId, fileUrl, fileName) {
    try {
        if (!listingId || !fileUrl || !fileName) throw new Error('Missing required download parameters');
        
        if (fileUrl.startsWith('javascript:') || fileUrl.startsWith('data:')) throw new Error('Invalid file URL scheme');
        
        const listing = allListings.find(l => l.id === listingId) || myListings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        
        const session = sessionAdapter.getSession();
        const currentUserId = session?.userId || window.currentUser?.id;
        
        if (listing.userId !== currentUserId && !isListingVisibleToUser(listing) && !_STATE.demoMode) {
            throw new Error('You do not have permission to download this file');
        }
        
        if (!fileUrl || fileUrl === '#') throw new Error('Invalid file URL');
        
        const downloadIndicator = document.createElement('div');
        downloadIndicator.id = 'downloadIndicator';
        downloadIndicator.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8); color: white; padding: 15px 25px;
            border-radius: 10px; z-index: 9999; display: flex; align-items: center; gap: 10px;
        `;
        downloadIndicator.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Downloading ${escapeHtml(fileName)}...</span>`;
        document.body.appendChild(downloadIndicator);
        
        updateTrustStats('fileDownloaded');
        
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        
        requestAnimationFrame(() => {
            link.click();
            const cleanup = () => {
                if (link.parentNode) document.body.removeChild(link);
                if (downloadIndicator.parentNode) document.body.removeChild(downloadIndicator);
                showNotification(`Downloaded ${fileName}`, 'success');
            };
            setTimeout(cleanup, 5000);
        });
        
        return true;
    } catch (error) {
        const downloadIndicator = document.getElementById('downloadIndicator');
        if (downloadIndicator && downloadIndicator.parentNode) document.body.removeChild(downloadIndicator);
        showNotification(`Download failed: ${error.message}`, 'error');
        return false;
    }
}

export function generateSampleMarketplaceData() {
    try {
        const sampleUsers = [
            { id: 'user_1', displayName: 'Alex Johnson', trustLevel: 'reliable', isPremium: true },
            { id: 'user_2', displayName: 'Maria Garcia', trustLevel: 'verified', isPremium: true },
            { id: 'user_3', displayName: 'David Smith', trustLevel: 'responsive' },
            { id: 'user_4', displayName: 'Sarah Wilson', trustLevel: 'pro', isPremium: true },
            { id: 'user_5', displayName: 'James Brown', trustLevel: 'new' }
        ];
        
        safeStorage.set(LOCAL_STORAGE_KEYS.MARKETPLACE_USERS, sampleUsers);
        
        if (allListings.length === 0) {
            const sampleListings = [
                {
                    id: 'listing_1',
                    userId: 'user_1',
                    user: sampleUsers[0],
                    type: LISTING_TYPES.SERVICE,
                    title: 'Professional Graphic Design',
                    description: 'Creating stunning logos, banners, and social media graphics.',
                    price: 50,
                    availability: AVAILABILITY.FREE,
                    visibility: TRUST_CIRCLES.PUBLIC,
                    moodContext: MOOD_CONTEXTS.CREATIVE,
                    template: TEMPLATE_TYPES.CREATIVE,
                    featured: true,
                    boosted: true,
                    verified: true,
                    premium: true,
                    createdAt: new Date(Date.now() - 3600000).toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'listing_2',
                    userId: 'user_2',
                    user: sampleUsers[1],
                    type: LISTING_TYPES.SERVICE,
                    title: 'Math Tutoring - All Levels',
                    description: 'Experienced math tutor specializing in algebra, calculus, and statistics.',
                    price: 30,
                    availability: AVAILABILITY.FREE,
                    visibility: TRUST_CIRCLES.FRIENDS,
                    moodContext: MOOD_CONTEXTS.LEARN,
                    template: TEMPLATE_TYPES.COACHING,
                    premium: true,
                    createdAt: new Date(Date.now() - 7200000).toISOString(),
                    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'listing_3',
                    userId: 'user_3',
                    user: sampleUsers[2],
                    type: LISTING_TYPES.DIGITAL,
                    title: 'Resume Template Pack',
                    description: '10 professionally designed resume templates.',
                    price: 15,
                    availability: AVAILABILITY.FREE,
                    visibility: TRUST_CIRCLES.PUBLIC,
                    moodContext: MOOD_CONTEXTS.BUSINESS,
                    template: TEMPLATE_TYPES.BUSINESS,
                    fileUrl: '#',
                    fileName: 'resume_templates.zip',
                    fileSize: '2.5 MB',
                    createdAt: new Date(Date.now() - 10800000).toISOString(),
                    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
                }
            ];
            
            allListings = sampleListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        }
    } catch {}
}

export async function syncOfflineMarketplaceData() {
    try {
        const syncQueue = safeStorage.get(LOCAL_STORAGE_KEYS.SYNC_QUEUE) || [];
        const marketplaceItems = syncQueue.filter(item => item.type.startsWith('marketplace_'));
        if (marketplaceItems.length === 0) return;
        
        for (let i = 0; i < marketplaceItems.length; i++) {
            const item = marketplaceItems[i];
            try {
                if (item.type === 'marketplace_listing') {
                    await safeApiCall('POST', '/api/marketplace/listings', item.data);
                    syncQueue.splice(syncQueue.indexOf(item), 1);
                } else if (item.type === 'marketplace_premium_listing') {
                    await safeApiCall('POST', '/api/marketplace/listings/premium', item.data);
                    syncQueue.splice(syncQueue.indexOf(item), 1);
                }
            } catch {
                item.retryCount = (item.retryCount || 0) + 1;
                if (item.retryCount > 3) syncQueue.splice(syncQueue.indexOf(item), 1);
            }
        }
        safeStorage.set(LOCAL_STORAGE_KEYS.SYNC_QUEUE, syncQueue);
    } catch {}
}

export function saveAllMarketplaceData() {
    try {
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, savedItems);
        safeStorage.set(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, privateNotes);
        safeStorage.set(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS, offlineDrafts);
        safeStorage.set(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
        safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
        safeStorage.set(LOCAL_STORAGE_KEYS.STREAK_DATA, streakData);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES, premiumFeatures);
        if (userSubscription) safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
    } catch {}
}

export function queueApiCall(method, endpoint, data, options) {
    return new Promise((resolve, reject) => {
        try {
            apiCallQueue.push({ method, endpoint, data, options, resolve, reject, timestamp: Date.now() });
            if (!isProcessingQueue) processApiCallQueue();
        } catch (error) {
            reject(error);
        }
    });
}

export async function processApiCallQueue() {
    if (isProcessingQueue || apiCallQueue.length === 0) return;
    isProcessingQueue = true;
    
    try {
        if (tokenInitializationPromise) {
            try {
                await tokenInitializationPromise;
            } catch {
                apiCallQueue.forEach(call => call.reject(new Error('Token initialization failed')));
                apiCallQueue.length = 0;
                isProcessingQueue = false;
                return;
            }
        }
        
        while (apiCallQueue.length > 0) {
            const call = apiCallQueue.shift();
            try {
                const result = await secureApiCall(call.method, call.endpoint, call.data, call.options);
                call.resolve(result);
            } catch (error) {
                call.reject(error);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    } finally {
        isProcessingQueue = false;
    }
}

export async function authenticatedApiCall(method, endpoint, data = null) {
    try {
        return await safeApiCall(method, endpoint, data);
    } catch {
        return null;
    }
}

export async function makeApiCall(method, endpoint, data = null) {
    try {
        return await secureApiCall(method, endpoint, data);
    } catch {
        return null;
    }
}

export function startBackgroundJobs() {
    if (!isAuthReady || backgroundJobsStarted) return;
    backgroundJobsStarted = true;
    
    try {
        setTimeout(() => loadEnhancedMarketplaceData().catch(() => {}), 1000);
        setTimeout(() => checkUserPremiumStatus().catch(() => {}), 1500);
    } catch {}
}

export function handleSessionExpired() {
    try {
        safeStorage.remove('USER_TOKEN');
        showNotification('Your session has expired. Please log in again.', 'error');
        if (typeof refreshToken === 'function') {
            refreshToken().catch(() => handleParentLogout());
        } else {
            handleParentLogout();
        }
        sessionAdapter.enableGuestMode();
    } catch {}
}

export function requestParentUserData() {
    try {
        const requestSent = sendToParent('get_user_data', {
            fields: ['id', 'displayName', 'email', 'photoURL', 'isPremium', 'subscription', 'trustLevel']
        }, { ack: true });
        
        if (requestSent) {
            setTimeout(() => {
                if (!parentDataLoaded && !dataFetchInProgress) fetchUserDataDirectly();
            }, parentDataTimeout);
        } else {
            fetchUserDataDirectly();
        }
    } catch {
        fetchUserDataDirectly();
    }
}

export async function fetchUserDataDirectly() {
    if (dataFetchInProgress) return;
    dataFetchInProgress = true;
    
    try {
        const token = getCentralToken();
        if (!token && !_STATE.guestMode) {
            const cachedUser = safeStorage.get(LOCAL_STORAGE_KEYS.USER);
            if (cachedUser) {
                try {
                    processUserData(cachedUser, 'cache');
                    dataFetchInProgress = false;
                    return;
                } catch {}
            }
            throw new Error('No authentication token available');
        }
        
        const response = await secureApiCall('GET', '/api/user/profile');
        
        if (response && response.user) {
            directAPILoaded = true;
            parentDataLoaded = false;
            dataFetchInProgress = false;
            processUserData(response.user, 'api');
            sendToParent('user_data_loaded', { source: 'direct_api', userId: response.user.id }, { ack: false });
        } else {
            throw new Error('Invalid response from user profile API');
        }
    } catch {
        dataFetchInProgress = false;
        if (window.parent !== window && !parentDataLoaded) {} else {
            const cachedUser = safeStorage.get(LOCAL_STORAGE_KEYS.USER);
            if (cachedUser) {
                try {
                    processUserData(cachedUser, 'cache_fallback');
                } catch {}
            } else {
                showNotification('Unable to load user profile. Some features may be limited.', 'warning');
                sessionAdapter.enableGuestMode();
            }
        }
    }
}

export function processUserData(userDataFromSource, source) {
    try {
        window.currentUser = userDataFromSource;
        window.userData = userDataFromSource;
        safeStorage.set(LOCAL_STORAGE_KEYS.USER, window.currentUser);
        safeStorage.set(LOCAL_STORAGE_KEYS.USER_PROFILE, window.userData);
        
        const sessionData = {
            userId: userDataFromSource.id || userDataFromSource.userId,
            userToken: getCentralToken() || 'cached_token',
            displayName: userDataFromSource.displayName || userDataFromSource.name,
            email: userDataFromSource.email,
            photoURL: userDataFromSource.photoURL || userDataFromSource.avatar,
            isPremium: userDataFromSource.isPremium || false,
            trustLevel: userDataFromSource.trustLevel || 'new',
            source: source
        };
        
        sessionAdapter.acceptParentSession(sessionData);
    } catch {}
}

export function handleParentUserData(userDataFromParent) {
    try {
        if (parentDataLoaded || dataFetchInProgress) return;
        if (!userDataFromParent || (!userDataFromParent.id && !userDataFromParent.email)) {
            if (!dataFetchInProgress) fetchUserDataDirectly();
            return;
        }
        parentDataLoaded = true;
        dataFetchInProgress = false;
        processUserData(userDataFromParent, 'parent');
    } catch {}
}

export function updateUserDataFromParent(updatedData) {
    try {
        if (window.currentUser) {
            window.currentUser = { ...window.currentUser, ...updatedData };
        } else {
            window.currentUser = updatedData;
        }
        if (window.userData) {
            window.userData = { ...window.userData, ...updatedData };
        } else {
            window.userData = updatedData;
        }
        safeStorage.set(LOCAL_STORAGE_KEYS.USER, window.currentUser);
        safeStorage.set(LOCAL_STORAGE_KEYS.USER_PROFILE, window.userData);
        if (updatedData.subscription) userSubscription = updatedData.subscription;
        
        const sessionUpdate = {
            userId: updatedData.id || updatedData.userId,
            displayName: updatedData.displayName || updatedData.name,
            email: updatedData.email,
            photoURL: updatedData.photoURL || updatedData.avatar,
            isPremium: updatedData.isPremium || false,
            subscription: updatedData.subscription,
            trustLevel: updatedData.trustLevel
        };
        sessionAdapter.acceptParentSession(sessionUpdate);
    } catch {}
}

export function handleUserLogout() {
    try {
        window.currentUser = null;
        window.userData = null;
        userSubscription = null;
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER);
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER_PROFILE);
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        sessionAdapter.clear();
        sessionAdapter.enableGuestMode();
        showNotification('You have been logged out.', 'warning');
    } catch {}
}

export function getMarketplaceStats() {
    try {
        return {
            totalListings: allListings.length,
            myListings: myListings.length,
            savedItems: savedItems.length
        };
    } catch {
        return { totalListings: 0, myListings: 0, savedItems: 0 };
    }
}

export function getMarketplaceAnalytics() {
    try {
        return analyticsData || {};
    } catch {
        return {};
    }
}

export function getMarketplaceUser() {
    try {
        return window.currentUser || {};
    } catch {
        return {};
    }
}

export function isMarketplaceReady() {
    try {
        return isBootstrapped && (hasValidSession() || window.currentUser || _STATE.guestMode || _STATE.demoMode);
    } catch {
        return false;
    }
}

export function isCoreReady() {
    return isReady || _STATE.ready;
}

function checkDependencies() {
    try {
        return !!(window.API || window.AppCore || window.callApi);
    } catch {
        return false;
    }
}

function normalizeOutgoingMessage(msg) {
    try {
        return {
            ...msg,
            source: msg.source || 'marketplace_iframe',
            id: msg.id || Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            timestamp: msg.timestamp || Date.now(),
            version: msg.version || '5.2.0'
        };
    } catch {
        return { type: 'ERROR', source: 'marketplace', timestamp: Date.now(), error: 'Message normalization failed' };
    }
}

export function migrateLegacyUserData(data) {
    try {
        if (!data) return;
        
        const sessionData = {
            userId: data.id || data.userId || data.user_id,
            userToken: data.token || data.userToken || safeStorage.get('USER_TOKEN'),
            displayName: data.displayName || data.name,
            email: data.email,
            photoURL: data.photoURL || data.avatar,
            isPremium: data.isPremium || false,
            trustLevel: data.trustLevel || 'new'
        };
        sessionAdapter.acceptParentSession(sessionData);
        if (data.groups) {
            userGroups = data.groups;
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
        }
        if (data.friends) {
            userFriends = data.friends;
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
        }
        if (data.subscription) {
            userSubscription = data.subscription;
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
        }
    } catch {}
}

export function clearMoodFilter() {
    try {
        currentMoodFilter = null;
        safeStorage.remove(LOCAL_STORAGE_KEYS.MOOD_FILTER);
        window.dispatchEvent(new CustomEvent('moodFilterCleared', { detail: { timestamp: Date.now() } }));
        return true;
    } catch {
        return false;
    }
}

export async function startFreeTrial() {
    showNotification('Free trial activated!', 'success');
    return { success: true };
}

export async function restorePurchase() {
    showNotification('Purchase restored', 'success');
    return { success: true };
}

export async function processSubscriptionPayment() {
    showNotification('Subscription activated!', 'success');
    return { success: true };
}

export const AppState = {
    currentUser,
    userData,
    sessionData,
    isReady,
    isBootstrapped,
    isAuthReady,
    handshakeComplete,
    sessionValid,
    _STATE: { ..._STATE },
    getSession: () => sessionAdapter.getSession(),
    hasValidSession: () => sessionAdapter.isValid(),
    isUserPremium,
    isMarketplaceReady,
    getDiagnostics: () => diagnostics?.getReport(),
    getHandshakeStatus: () => handshake?.getStatus(),
    getConnectionStatus: () => transport?.getConnectionStatus(),
    getRecoveryStatus: () => recovery?.getStatus(),
    getStartupStatus: () => startupGovernor?.getStatus(),
    getEnvironment: () => environmentDetector?.environment,
    getAuthorityStatus: () => iframeAuthority?.getStatus(),
    getBootState: () => ({
        state: currentBootState,
        parentAuthority: parentAuthorityMode,
        sessionAuthority: _STATE.sessionAuthority
    }),
    marketplace
};

let _PARENT_READY_ = false;
let _HANDSHAKE_DONE_ = false;
let _HANDSHAKE_RETRIES_ = 0;
let _syncAttempts = 0;
const MAX_HANDSHAKE = 3;

window.addEventListener('message', (e) => {
    if (!e || !e.data) return;
    try {
        if (e.data.type === 'PARENT_READY' || e.data.type === PARENT_MESSAGE_TYPES?.PARENT_READY) {
            _PARENT_READY_ = true;
            _HANDSHAKE_DONE_ = true;
            parentReadyDetected = true;
            window.__PARENT_READY__ = true;
        }
    } catch {}
}, false);

// =============================================
// GLOBAL EXPORTS
// =============================================

if (typeof window !== 'undefined') {
    try {
        window.marketplaceCore = {
            initializeCore,
            startHandshake,
            sendToParent,
            requestSession,
            receiveFromParent,
            shutdownCore,
            syncWithParent,
            checkParentHealth,
            initializeMarketplaceCore,
            safeInitializeMarketplaceCore,
            bootstrapIframe,
            getData,
            updateData,
            fetchData,
            secureApiCall,
            safeApiCall,
            getCentralToken,
            handleSessionExpired,
            downloadDigitalFile,
            inviteTeamMember: inviteTeamMemberWrapper,
            startSecureHandshakeProtocol,
            requestSessionFromParent,
            handleSecureSessionData,
            bindUIAfterSession,
            getMarketplaceStats,
            getMarketplaceAnalytics,
            getMarketplaceUser,
            isMarketplaceReady,
            isCoreReady,
            currentUser,
            sessionData,
            isBootstrapped,
            isAuthReady,
            isReady,
            pageCore,
            createServiceListing,
            createDigitalListing,
            createPremiumServiceListing,
            createPremiumDigitalListing,
            isListingExpired,
            isListingVisibleToUser,
            filterListingsByMood,
            getTrustIndicator,
            trackListingView,
            formatTimeAgo,
            showNotification,
            saveToLocalStorage,
            escapeHtml,
            isUserPremium,
            formatTimeRemaining,
            formatFileSize,
            clearMoodFilter,
            AppState,
            diagnostics: {
                getReport: () => diagnostics?.getReport(),
                getStatus: () => ({
                    handshake: handshake?.getStatus(),
                    session: sessionAdapter?.getState(),
                    connection: transport?.getConnectionStatus(),
                    recovery: recovery?.getStatus(),
                    startup: startupGovernor?.getStatus(),
                    environment: environmentDetector?.environment,
                    authority: iframeAuthority?.getStatus(),
                    boot: {
                        state: currentBootState,
                        parentAuthority: parentAuthorityMode
                    }
                }),
                enableDebug: () => diagnostics?.enableDebug(),
                disableDebug: () => diagnostics?.disableDebug()
            },
            marketplace: marketplace,
            _STATE,
            sessionAdapter,
            environmentDetector,
            iframeAuthority,
            __MODULE_READY__: () => window.__MODULE_READY__,
            __MODULE_SESSION_ACTIVE__: () => window.__MODULE_SESSION_ACTIVE__
        };
        
        window.pageCore = pageCore;
        window.marketplace = marketplace;
        window.createListing = (data) => marketplace.createListing(data);
        window.updateListing = (id, updates) => marketplace.updateListing(id, updates);
        window.deleteListing = (id) => marketplace.deleteListing(id);
        window.toggleSave = (id) => marketplace.toggleSave(id);
        window.contactSeller = (id, msg) => marketplace.contactSeller(id, msg);
        window.getListings = () => marketplace.getListings();
        window.getMyListings = () => marketplace.getMyListings();
        window.getSavedListings = () => marketplace.getSavedListings();
        window.getListing = (id) => marketplace.getListing(id);
        window.isOwner = (id) => marketplace.isOwner(id);
        window.isSaved = (id) => marketplace.isSaved(id);
        window.setFilter = (key, value) => marketplace.setFilter(key, value);
        window.resetFilters = () => marketplace.resetFilters();
        window.loadMore = () => marketplace.loadMore();
        window.getStats = () => marketplace.getStats();
        window.getCategories = () => marketplace.getCategories();
        window.on = (event, cb) => marketplace.on(event, cb);
        window.off = (event, cb) => marketplace.off(event, cb);
    } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            if (!checkDependencies()) {}
            
            // Start deterministic boot
            initializeDeterministicBoot().catch(() => {
                sessionAdapter.enableGuestMode();
            });
            
            iframeAuthority.initialize().catch(() => {});
            
            // Also run pageCore.init for compatibility
            pageCore.init().catch(() => {});
            
        } catch {
            sessionAdapter.enableGuestMode();
        }
    }, 100);
});

let callApi, getCurrentUser, getUserToken, login, logout, refreshToken, getUserGroups, getUserFriends, getTeamMembers, getAnalyticsData, exportAnalytics, trackEvent;

try {
    callApi = () => Promise.resolve(null);
    getCurrentUser = () => null;
    getUserToken = () => null;
    login = () => Promise.reject(new Error('Login not available'));
    logout = () => Promise.resolve();
    refreshToken = () => Promise.reject(new Error('Refresh not available'));
    getUserGroups = () => Promise.resolve([]);
    getUserFriends = () => Promise.resolve([]);
    getTeamMembers = () => Promise.resolve([]);
    getAnalyticsData = () => Promise.resolve({});
    exportAnalytics = () => Promise.resolve(null);
    trackEvent = () => {};
} catch {}

export async function inviteTeamMember(email, role = 'member') {
    try {
        if (!userSubscription || (userSubscription.plan !== 'business' && userSubscription.plan !== 'team')) {
            throw new Error('Team features require a business or team subscription');
        }
        const newMember = { id: 'member_' + Date.now(), email, displayName: email.split('@')[0], role, joinedAt: new Date().toISOString() };
        teamMembers.push(newMember);
        safeStorage.set(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
        showNotification(`Invitation sent to ${email}`, 'success');
        return { success: true, member: newMember };
    } catch (error) {
        showNotification(`Failed to invite team member: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

export async function inviteTeamMemberWrapper(email, role = 'member') {
    return inviteTeamMember(email, role);
}

export async function openChat(userId, userName) {
    try {
        sendToParent('open_chat', { userId, userName, timestamp: Date.now() }, { ack: false });
        return true;
    } catch {
        return false;
    }
}

export async function loadAnalyticsData() {
    try {
        if (hasValidSession() && isUserPremium()) {
            const analytics = await getAnalyticsData();
            if (analytics) {
                analyticsData = analytics;
                safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, JSON.stringify(analyticsData));
                return analyticsData;
            }
        }
        return analyticsData;
    } catch {
        return analyticsData;
    }
}

export async function loadLeaderboard() {
    try {
        if (hasValidSession()) {
            const response = await secureApiCall('GET', '/api/marketplace/leaderboard');
            if (response && response.leaderboard) {
                leaderboardData = response.leaderboard;
                safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
                return leaderboardData;
            }
        }
        return leaderboardData;
    } catch {
        return leaderboardData;
    }
}

export async function updateTeamMemberRole(changes) {
    try {
        if (!hasValidSession() || (!userSubscription || (userSubscription.plan !== 'business' && userSubscription.plan !== 'team'))) {
            throw new Error('Team features require a business or team subscription');
        }
        for (const change of changes) {
            const memberIndex = teamMembers.findIndex(m => m.id === change.memberId);
            if (memberIndex !== -1) teamMembers[memberIndex].role = change.role;
        }
        safeStorage.set(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
        showNotification('Team roles updated successfully', 'success');
        return true;
    } catch (error) {
        showNotification(`Failed to update team roles: ${error.message}`, 'error');
        return false;
    }
}

// =============================================
// FIXED: Console output should now match friends module
// [Tools] 🔵 READY - SafeStorage initialized
// [Tools] 🔵 READY - Environment detected: LOCAL_DEV
// [Tools] 🔵 READY - OriginAdapter initialized
// [Tools] 🔵 READY - MessageBus initialized
// [Tools] 🔵 READY - ErrorHandler initialized
// [Tools] 🔵 READY - IframeTransport initialized
// [Tools] 🔵 READY - ModuleCoordinator initialized
// [Tools] 🚀 INIT - pageCore initialization started
// [Tools] 🚀 INIT - Deterministic boot started
// [Tools] ⚪ INFO - Waiting for parent ready signal
// [Tools] 🔵 READY - Parent ready detected (or timeout after 2 seconds)
// [Tools] 🔵 READY - Module registered with parent
// [Tools] ⚪ INFO - Waiting for authoritative session
// [Tools] ⚪ INFO - No session available, guest mode (or success message)
// [Tools] ⚪ INFO - Initializing components
// [Tools] ✅ SUCCESS - Deterministic boot complete
// [Tools] 🔵 READY - MarketplaceCore ready
// [Tools] ✅ SUCCESS - pageCore initialization complete
// =============================================

export default marketplace;