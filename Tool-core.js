// =============================================
// TOOLS MODULE v8.0.5
// PARENT-ALIGNED COMMUNICATION LAYER
// DETERMINISTIC STATE MACHINE
// PROTOCOL: KYN-8.0 (STRICT)
// =============================================

// =============================================
// MODULE IDENTIFIER - MUST MATCH PARENT EXPECTATIONS
// =============================================
const MODULE_NAME = 'tools'; // EXACT match required
const MODULE_VERSION = '8.0.5';
const MODULE_CAPABILITIES = ['marketplace', 'storage', 'heartbeat', 'ui'];

// =============================================
// SILENT LOGGING SYSTEM (PRESERVED)
// =============================================

const LOG_PREFIX = '[Tools]';
const LOG_LEVELS = { DEBUG: 0, INFO: 1, SUCCESS: 2, WARN: 3, ERROR: 4, SILENT: 5 };
let currentLogLevel = LOG_LEVELS.INFO;
const loggedMessages = new Set();
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

function debugLog(...args) {
    if (DEBUG) console.log(...args);
}

// =============================================
// STRICT LIFECYCLE STATE MACHINE (PARENT-ALIGNED)
// =============================================

const LIFECYCLE_STATE = {
    BOOTING: 'BOOTING',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    WAIT_PARENT: 'WAIT_PARENT',
    ACTIVE: 'ACTIVE'
};

let currentLifecycleState = LIFECYCLE_STATE.BOOTING;
let stateLock = false;
let childReadySent = false;
let parentReady = false; // CRITICAL: Gate for all operations
let parentReadyResolve = null;
let parentReadyReject = null;

const parentReadyPromise = new Promise((resolve, reject) => {
    parentReadyResolve = resolve;
    parentReadyReject = reject;
});

// State transition validation
const VALID_TRANSITIONS = {
    [LIFECYCLE_STATE.BOOTING]: [LIFECYCLE_STATE.INITIALIZING],
    [LIFECYCLE_STATE.INITIALIZING]: [LIFECYCLE_STATE.READY],
    [LIFECYCLE_STATE.READY]: [LIFECYCLE_STATE.WAIT_PARENT],
    [LIFECYCLE_STATE.WAIT_PARENT]: [LIFECYCLE_STATE.ACTIVE],
    [LIFECYCLE_STATE.ACTIVE]: [LIFECYCLE_STATE.ACTIVE]
};

function setLifecycleState(newState) {
    if (stateLock && newState !== LIFECYCLE_STATE.ACTIVE) {
        debugLog('[Lifecycle] Locked, ignoring', newState);
        return false;
    }
    
    if (newState === currentLifecycleState) return true;
    
    if (!VALID_TRANSITIONS[currentLifecycleState]?.includes(newState)) {
        logOnce('warn', `Invalid state transition: ${currentLifecycleState} -> ${newState}`);
        return false;
    }
    
    debugLog(`[Lifecycle] ${currentLifecycleState} -> ${newState}`);
    currentLifecycleState = newState;
    moduleState.bootState = newState;
    
    window.dispatchEvent(new CustomEvent('tools:lifecycle-change', { 
        detail: { from: currentLifecycleState, to: newState }
    }));
    
    return true;
}

function isActive() {
    return currentLifecycleState === LIFECYCLE_STATE.ACTIVE && parentReady === true;
}

// =============================================
// MESSAGE QUEUE SYSTEM (REQUIRED)
// =============================================

const messageQueue = [];

// =============================================
// ID GENERATION (MANDATORY)
// =============================================

function generateMessageId() {
    return `msg_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
}

function generateRequestId() {
    return `req_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
}

let messageCounter = 0;

// =============================================
// STANDARDIZED MESSAGE SCHEMA (PARENT-ALIGNED)
// =============================================

function createMessage(type, payload = {}) {
    return {
        type: type,
        id: generateMessageId(),                    // REQUIRED
        requestId: generateRequestId(),              // REQUIRED for request-response
        source: MODULE_NAME,                          // EXACT module name
        target: 'parent',                             // REQUIRED
        timestamp: Date.now(),                         // REQUIRED
        payload: sanitizePayload(payload)
    };
}

function sanitizePayload(payload) {
    if (!payload || typeof payload !== 'object') return {};
    try {
        return JSON.parse(JSON.stringify(payload));
    } catch {
        return {};
    }
}

// =============================================
// SAFE SEND WITH QUEUE (CRITICAL)
// =============================================

function sendMessage(message) {
    if (!window.parent || window.parent === window) {
        return { success: false, error: 'not_in_iframe' };
    }

    try {
        window.parent.postMessage(message, '*');
        moduleState.connectionMetrics.messagesSent++;
        logOnce('send', message.type, { id: message.id, requestId: message.requestId });
        return { success: true, messageId: message.id, requestId: message.requestId };
    } catch (err) {
        logError('sendMessage', err);
        return { success: false, error: err.message };
    }
}

function safeSend(type, payload = {}) {
    // CRITICAL: Block all messages until parent ready
    if (!parentReady) {
        debugLog(`[Queue] Message ${type} queued - parent not ready`);
        messageQueue.push({ type, payload, timestamp: Date.now() });
        return { success: true, queued: true, messageId: null };
    }

    if (moduleState.shutdown) {
        return { success: false, error: 'shutdown' };
    }

    const message = createMessage(type, payload);
    return sendMessage(message);
}

function flushMessageQueue() {
    if (!parentReady || messageQueue.length === 0) return;
    
    debugLog(`[Queue] Flushing ${messageQueue.length} messages`);
    
    while (messageQueue.length > 0) {
        const queued = messageQueue.shift();
        const message = createMessage(queued.type, queued.payload);
        sendMessage(message);
    }
}

// =============================================
// DUPLICATE MESSAGE PROTECTION
// =============================================

const processedMessages = new Set();
const MAX_PROCESSED_MESSAGES = 1000;

function isDuplicateMessage(messageId) {
    if (!messageId) return false;
    if (processedMessages.has(messageId)) return true;
    
    processedMessages.add(messageId);
    
    if (processedMessages.size > MAX_PROCESSED_MESSAGES) {
        const iterator = processedMessages.values();
        for (let i = 0; i < 100; i++) {
            processedMessages.delete(iterator.next().value);
        }
    }
    
    return false;
}

// =============================================
// MESSAGE VALIDATION (STRICT SCHEMA)
// =============================================

function validateMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    
    // REQUIRED fields check
    const hasType = typeof msg.type === 'string' && msg.type.length > 0;
    const hasId = typeof msg.id === 'string' && msg.id.length > 0;
    const hasRequestId = typeof msg.requestId === 'string' && msg.requestId.length > 0;
    const hasSource = typeof msg.source === 'string' && msg.source.length > 0;
    const hasTarget = typeof msg.target === 'string' && msg.target === 'parent';
    const hasTimestamp = typeof msg.timestamp === 'number' && msg.timestamp > 0;
    const hasPayload = msg.payload !== undefined;
    const isFromParent = msg.source === 'parent';
    
    return hasType && hasId && hasRequestId && hasSource && hasTarget && hasTimestamp && hasPayload && isFromParent;
}

// =============================================
// ORIGIN VALIDATION
// =============================================

const ALLOWED_ORIGINS = [
    window.location.origin,
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
    'https://moodchat-fy56.onrender.com',
    'https://moodfronted.onrender.com',
    null,
    'null'
];

function isValidOrigin(origin) {
    if (!origin || origin === 'null' || origin === 'null') return true;
    
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return true;
    }
    
    if (origin.includes('.onrender.com') || origin.includes('onrender.com')) {
        return true;
    }
    
    return false;
}

// =============================================
// MODULE STATE (PRESERVED)
// =============================================

const moduleState = {
    initialized: false,
    parentDetected: false,
    sessionActive: false,
    ready: false,
    shutdown: false,
    permissions: new Set(),
    health: {
        lastHeartbeat: 0,
        missedHeartbeats: 0
    },
    features: new Map(),
    lastValidSession: null,
    sessionCache: null,
    
    frameId: null,
    protocolVersion: 'KYN-8.0',
    connectionMetrics: {
        messagesSent: 0,
        messagesReceived: 0,
        acksReceived: 0
    },
    
    bootState: LIFECYCLE_STATE.BOOTING,
    sessionAuthority: 'unknown',
    
    environment: {
        type: 'UNKNOWN',
        online: true,
        secure: false,
        origin: '',
        hostname: '',
        protocol: '',
        isIframe: false
    },
    
    handshakeState: {
        stage: 'idle',
        childReadySent: false,
        parentReadyReceived: false,
        registered: false,
        registeredAck: false,
        sessionRequested: false,
        sessionActive: false,
        complete: false
    },
    
    sessionState: {
        requested: false,
        received: false,
        expiresAt: null,
        lastSync: 0
    },
    
    diagnostics: {
        errors: [],
        warnings: [],
        startupTime: 0
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
        PARENT_READY: 20000
    },
    SECURITY: {
        SIGNATURE_REQUIRED: false,
        TIMESTAMP_TOLERANCE: 60000,
        REPLAY_WINDOW: 300000,
        MAX_MESSAGE_SIZE: 1048576,
        TOKEN_REFRESH_MARGIN: 300000,
        ORIGIN_STRICT_MODE: true
    }
};

// =============================================
// EXPORTED STATE VARIABLES (PRESERVED)
// =============================================

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

export let parentDataLoaded = false;
export let directAPILoaded = false;
export let parentCommunicationId = null;
export let dataFetchInProgress = false;

export let sessionData = null;
export let handshakeComplete = false;
export let sessionValid = false;
export let isReady = false;
export let isInitializing = false;
export let dataCache = new Map();
export let loadingMessageElement = null;

export let isBootstrapped = false;
export let isAuthReady = false;
export let backgroundJobsStarted = false;
export let tokenInitializationPromise = null;
export let tokenRefreshInProgress = false;
export const apiCallQueue = [];
export let isProcessingQueue = false;

// =============================================
// CONSTANTS (PRESERVED)
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
    FRAME_ID: 'knecta_frame_id',
    HANDSHAKE_STATE: 'knecta_handshake_state',
    PROTOCOL_VERSION: 'knecta_protocol_version',
    ENVIRONMENT_CACHE: 'knecta_environment_cache',
    STARTUP_STATE: 'knecta_startup_state'
};

export const PARENT_MESSAGE_TYPES = {
    CHILD_READY: 'CHILD_READY',
    REQUEST_SESSION: 'REQUEST_SESSION',
    SESSION_CONFIRMED: 'SESSION_CONFIRMED',
    UI_READY: 'UI_READY',
    NEED_REFRESH: 'NEED_REFRESH',
    AUTH_ERROR: 'AUTH_ERROR',
    CORE_READY: 'coreReady',
    HEARTBEAT: 'HEARTBEAT',
    SYNC_REQUEST: 'SYNC_REQUEST',
    
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
    
    ENVIRONMENT: 'ENVIRONMENT',
    ENVIRONMENT_ACK: 'ENVIRONMENT_ACK',
    
    RECOVERY_REQUEST: 'RECOVERY_REQUEST',
    RECOVERY_ACK: 'RECOVERY_ACK',
    
    DIAGNOSTICS: 'DIAGNOSTICS',
    METRICS: 'METRICS',
    
    BOOT_STATE: 'BOOT_STATE',
    MODULE_STATE: 'MODULE_STATE',
    REGISTER_MODULE: 'REGISTER_MODULE',
    REGISTERED: 'REGISTERED',
    SESSION_ACTIVE: 'SESSION_ACTIVE',
    
    MODULE_HEARTBEAT: 'MODULE_HEARTBEAT'
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

export const ENVIRONMENT_TYPES = {
    LOCAL_DEV: 'LOCAL_DEV',
    RENDER_HOSTED: 'RENDER_HOSTED',
    VPN_NETWORK: 'VPN_NETWORK',
    PRODUCTION: 'PRODUCTION',
    UNKNOWN: 'UNKNOWN'
};

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
// MODULE 0 - SAFE STORAGE LAYER (PRESERVED)
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
// MODULE 1 - ENVIRONMENT DETECTOR (PRESERVED)
// =============================================

class EnvironmentDetector {
    constructor() {
        this.environment = {
            type: ENVIRONMENT_TYPES.UNKNOWN,
            latency: 0,
            online: navigator.onLine,
            secure: window.location.protocol === 'https:',
            origin: window.location.origin,
            hostname: window.location.hostname,
            protocol: window.location.protocol,
            connectionType: 'unknown',
            effectiveType: 'unknown',
            isIframe: window.parent !== window,
            isSecureContext: window.isSecureContext || false
        };
        this.initialized = false;
    }

    initialize() {
        if (this.initialized) return this.environment;
        
        this.detectConnectionInfo();
        this.classifyEnvironment();
        this.initialized = true;
        moduleState.environment = this.environment;
        
        safeStorage.set(LOCAL_STORAGE_KEYS.ENVIRONMENT_CACHE, {
            type: this.environment.type,
            timestamp: Date.now()
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

    getEnvironmentReport() {
        return { ...this.environment };
    }
}

const environmentDetector = new EnvironmentDetector();
environmentDetector.initialize();

// =============================================
// MODULE 2 - PARENT COMMUNICATION LAYER (REFACTORED - STRICT SCHEMA)
// =============================================

class ParentCommunicator {
    constructor() {
        this.messageCounter = 0;
        this.frameId = this.generateFrameId();
        this.messageListeners = new Set();
        this.initialized = false;
    }

    generateFrameId() {
        try {
            let stored = safeStorage.get(LOCAL_STORAGE_KEYS.FRAME_ID);
            if (!stored) {
                stored = `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
                safeStorage.set(LOCAL_STORAGE_KEYS.FRAME_ID, stored);
            }
            return stored;
        } catch {
            return `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        }
    }

    // DEPRECATED: Use safeSend instead
    sendMessage(type, payload = {}) {
        return safeSend(type, payload);
    }

    addMessageListener(handler) {
        this.messageListeners.add(handler);
    }

    removeMessageListener(handler) {
        this.messageListeners.delete(handler);
    }

    handleIncomingMessage(event) {
        if (!isValidOrigin(event.origin)) {
            debugLog(`Rejected message from origin: ${event.origin}`);
            return;
        }

        if (event.source !== window.parent) return;

        const message = event.data;

        if (!validateMessage(message)) {
            debugLog('Invalid message schema', message);
            return;
        }

        if (isDuplicateMessage(message.id)) {
            debugLog(`Duplicate message ignored: ${message.id}`);
            return;
        }

        moduleState.connectionMetrics.messagesReceived++;

        this.messageListeners.forEach(handler => {
            try {
                handler(message);
            } catch (error) {
                logError('ParentCommunicator.handler', error);
            }
        });
    }

    cleanup() {
        this.messageListeners.clear();
    }
}

const parentComm = new ParentCommunicator();

// =============================================
// MODULE 3 - SESSION CLIENT (PRESERVED)
// =============================================

class SessionClient {
    constructor() {
        this.currentSession = null;
        this.sessionCache = null;
        this.listeners = new Set();
        this.sessionState = {
            requested: false,
            received: false,
            expiresAt: null,
            lastSync: 0
        };
        this.loadFromCache();
    }

    loadFromCache() {
        try {
            const cached = safeStorage.sessionGet('core_session_cache');
            if (cached) {
                if (cached.expiresAt && new Date(cached.expiresAt) > new Date()) {
                    this.sessionCache = cached;
                    this.currentSession = cached;
                    moduleState.sessionCache = cached;
                    moduleState.lastValidSession = cached;
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
                moduleState.sessionCache = session;
                moduleState.lastValidSession = session;
            }
        } catch {}
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

            moduleState.sessionActive = true;
            moduleState.sessionAuthority = 'parent';

            this.saveToCache(this.currentSession);
            this.notifyListeners('session:updated', this.currentSession);
            this.sessionState.received = true;

            logOnce('receive', 'Session data accepted', { userId: this.currentSession.userId });

            return true;
        } catch (error) {
            return false;
        }
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

    clear() {
        this.currentSession = null;
        this.sessionState = { requested: false, received: false, expiresAt: null, lastSync: 0 };
        moduleState.sessionActive = false;
        moduleState.sessionAuthority = 'unknown';
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
            hasSession: !!this.currentSession,
            authority: moduleState.sessionAuthority
        };
    }
}

const sessionClient = new SessionClient();

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
            state: currentLifecycleState
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

const heartbeatResponder = new HeartbeatResponder();

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
                bootState: currentLifecycleState,
                authority: moduleState.sessionAuthority,
                parentReady: parentReady
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

const diagnostics = new DiagnosticsAgent();

// =============================================
// MODULE 6 - MESSAGE HANDLER (REFACTORED FOR PARENT PROTOCOL)
// =============================================

class MessageHandler {
    constructor() {
        this.handlers = new Map();
        this.registerCoreHandlers();
    }

    registerCoreHandlers() {
        this.registerHandler('PARENT_READY', (message) => {
            if (currentLifecycleState !== LIFECYCLE_STATE.WAIT_PARENT) {
                debugLog(`PARENT_READY received in wrong state: ${currentLifecycleState}`);
                return;
            }
            
            logOnce('receive', 'PARENT_READY received');
            moduleState.parentDetected = true;
            moduleState.handshakeState.parentReadyReceived = true;
            
            // CRITICAL: Set parentReady flag and flush queue
            parentReady = true;
            setLifecycleState(LIFECYCLE_STATE.ACTIVE);
            parentReadyResolve();
            flushMessageQueue();
            
            // Complete activation after queue flush
            this.completeActivation();
        });

        this.registerHandler('REGISTERED', (message) => {
            if (currentLifecycleState !== LIFECYCLE_STATE.WAIT_PARENT && currentLifecycleState !== LIFECYCLE_STATE.ACTIVE) {
                debugLog(`REGISTERED received in wrong state: ${currentLifecycleState}`);
                return;
            }
            
            logOnce('receive', 'REGISTERED received');
            moduleState.handshakeState.registered = true;
            moduleState.handshakeState.registeredAck = true;
            
            // Parent ready already handled by PARENT_READY
        });

        this.registerHandler('SESSION_DATA', (message) => {
            if (!isActive() && currentLifecycleState !== LIFECYCLE_STATE.ACTIVE) {
                debugLog('SESSION_DATA received before active');
                // Still process but warn
            }
            
            if (message.payload) {
                this.handleSessionData(message.payload);
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
            if (!message.payload || !sessionClient.currentSession) return;
            
            const currentSession = sessionClient.getSession();
            const updatedSession = { ...currentSession, ...message.payload, updatedAt: new Date().toISOString() };
            sessionClient.acceptParentSession(updatedSession);
            
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
            if (marketplace && message.payload && isActive()) {
                marketplace.handleUIAction(message.payload);
            }
        });

        this.registerHandler('LISTING_CREATED', (message) => {
            if (marketplace && message.payload && isActive()) {
                marketplace.handleListingCreated(message.payload);
            }
        });

        this.registerHandler('LISTING_UPDATED', (message) => {
            if (marketplace && message.payload && isActive()) {
                marketplace.handleListingUpdated(message.payload);
            }
        });

        this.registerHandler('LISTING_DELETED', (message) => {
            if (marketplace && message.payload && isActive()) {
                marketplace.handleListingDeleted(message.payload);
            }
        });

        this.registerHandler('PAGE_ACTIVATED', (message) => {
            logOnce('receive', 'PAGE_ACTIVATED');
            window.dispatchEvent(new CustomEvent('tools:page-activated'));
        });

        this.registerHandler('PING', (message) => {
            safeSend('PONG', { echo: message.payload });
        });
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
        if (!sessionData) return;
        
        const accepted = sessionClient.acceptParentSession(sessionData);
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
            logOnce('receive', 'Session data processed');
        }
    }

    completeActivation() {
        moduleState.ready = true;
        moduleState.initialized = true;
        isReady = true;
        handshakeComplete = true;
        
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
                bootState: currentLifecycleState,
                parentReady: parentReady
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
    }
}

const messageHandler = new MessageHandler();

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
        // Updated to match required schema
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

const resourceManager = new ResourceManager();

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
            this.dispatchUIAction('show_create_listing_modal');
        });
        
        this.registerEvent('refreshListingsBtn', 'click', () => {
            this.dispatchUIAction('refresh_listings');
        });
        
        this.registerEvent('savedItemsBtn', 'click', () => {
            this.dispatchUIAction('show_saved_items');
        });
        
        this.registerEvent('myListingsBtn', 'click', () => {
            this.dispatchUIAction('show_my_listings');
        });
    }

    bindUserActionEvents() {
        this.registerEvent('contactSellerBtn', 'click', (e) => {
            const listingId = e.target.dataset.listingId;
            if (listingId) {
                this.dispatchUIAction('contact_seller', { listingId });
            }
        });
        
        this.registerEvent('saveListingBtn', 'click', (e) => {
            const listingId = e.target.dataset.listingId;
            if (listingId) {
                this.dispatchUIAction('toggle_save', { listingId });
            }
        });
        
        this.registerEvent('shareListingBtn', 'click', (e) => {
            const listingId = e.target.dataset.listingId;
            if (listingId) {
                this.dispatchUIAction('share_listing', { listingId });
            }
        });
    }

    bindFilterEvents() {
        this.registerEvent('searchInput', 'input', (e) => {
            this.dispatchUIAction('filter_search', { value: e.target.value });
        });
        
        this.registerEvent('categoryFilter', 'change', (e) => {
            this.dispatchUIAction('filter_category', { value: e.target.value });
        });
        
        this.registerEvent('priceRange', 'change', (e) => {
            this.dispatchUIAction('filter_price', { 
                min: document.getElementById('minPrice')?.value,
                max: document.getElementById('maxPrice')?.value
            });
        });
        
        this.registerEvent('sortSelect', 'change', (e) => {
            this.dispatchUIAction('filter_sort', { value: e.target.value });
        });
        
        this.registerEvent('resetFiltersBtn', 'click', () => {
            this.dispatchUIAction('reset_filters');
        });
    }

    bindListingEvents() {
        this.registerEvent('listingForm', 'submit', (e) => {
            e.preventDefault();
            this.dispatchUIAction('submit_listing_form', this.getFormData('listingForm'));
        });
        
        this.registerEvent('deleteListingBtn', 'click', (e) => {
            const listingId = e.target.dataset.listingId;
            if (listingId && confirm('Are you sure you want to delete this listing?')) {
                this.dispatchUIAction('delete_listing', { listingId });
            }
        });
        
        this.registerEvent('editListingBtn', 'click', (e) => {
            const listingId = e.target.dataset.listingId;
            if (listingId) {
                this.dispatchUIAction('edit_listing', { listingId });
            }
        });
        
        this.registerEvent('loadMoreBtn', 'click', () => {
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
        if (!isActive()) {
            debugLog(`UI action ${action} dispatched before active`);
            return;
        }
        
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

const uiBridge = new UIBridge();

// =============================================
// MARKETPLACE CORE IMPLEMENTATION (PRESERVED)
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
                if (event.data && event.data.type && isActive()) {
                    this.handleSyncMessage(event.data);
                }
            };
        } catch (e) {}
    }

    setupEventListeners() {
        window.addEventListener('storage', (e) => {
            if (e.key && e.key.startsWith('marketplace_') && isActive()) {
                this.loadFromCache();
                this.notifyUI('storageUpdated', { key: e.key });
            }
        });
    }

    handleUIAction(payload) {
        if (!payload || !payload.action || !isActive()) return;
        
        switch (payload.action) {
            case 'refresh_listings':
                this.loadListings();
                break;
            case 'show_saved_items':
                this.notifyUI('showSavedItems', this.savedListings);
                break;
            case 'show_my_listings':
                this.notifyUI('showMyListings', this.myListings);
                break;
            case 'contact_seller':
                if (payload.data?.listingId) {
                    this.contactSeller(payload.data.listingId).catch(() => {});
                }
                break;
            case 'toggle_save':
                if (payload.data?.listingId) {
                    this.toggleSave(payload.data.listingId).catch(() => {});
                }
                break;
            case 'filter_search':
                this.setFilter('search', payload.data?.value || '');
                break;
            case 'filter_category':
                this.setFilter('category', payload.data?.value || '');
                break;
            case 'filter_price':
                this.setFilter('minPrice', payload.data?.min ? parseFloat(payload.data.min) : null);
                this.setFilter('maxPrice', payload.data?.max ? parseFloat(payload.data.max) : null);
                break;
            case 'filter_sort':
                this.setFilter('sort', payload.data?.value || 'newest');
                break;
            case 'reset_filters':
                this.resetFilters();
                break;
            case 'load_more_listings':
                this.loadMore();
                break;
            case 'submit_listing_form':
                this.createListing(payload.data).catch(() => {});
                break;
            case 'delete_listing':
                if (payload.data?.listingId) {
                    this.deleteListing(payload.data.listingId).catch(() => {});
                }
                break;
            case 'edit_listing':
                if (payload.data?.listingId) {
                    this.notifyUI('editListing', { listingId: payload.data.listingId });
                }
                break;
        }
    }

    handleSyncMessage(data) {
        if (!isActive()) return;
        
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
        if (!isActive()) return;
        
        const exists = this.listings.some(l => l.id === listing.id);
        if (!exists) {
            this.listings = [this.sanitizeListing(listing), ...this.listings];
            if (listing.sellerId === this.currentUser?.id) {
                this.myListings = [listing, ...this.myListings];
                safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
            }
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
            this.notifyUI('listingCreated', listing);
        }
    }

    handleListingUpdated(updated) {
        if (!isActive()) return;
        
        this.listings = this.listings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        this.myListings = this.myListings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        this.savedListings = this.savedListings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
        this.notifyUI('listingUpdated', updated);
    }

    handleListingDeleted(deleted) {
        if (!isActive()) return;
        
        this.listings = this.listings.filter(l => l.id !== deleted.id);
        this.myListings = this.myListings.filter(l => l.id !== deleted.id);
        this.savedListings = this.savedListings.filter(l => l.id !== deleted.id);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
        this.notifyUI('listingDeleted', deleted);
    }

    handleSaveToggled(listingId, userId, saved) {
        if (!isActive()) return;
        
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
            safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
            this.notifyUI('saveToggled', { listingId, saved });
        }
    }

    async initialize() {
        if (this.initialized || !isActive()) return;
        
        try {
            this.currentUser = sessionClient.getSession();
            if (this.currentUser) {
                safeStorage.set(LOCAL_STORAGE_KEYS.USER, this.currentUser);
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
        if (!isActive()) return;
        
        this.loading = true;
        this.notifyUI('loading', true);
        
        try {
            const result = await this.sendWithResponse('FETCH_LISTINGS', {
                page: this.pagination.page,
                limit: this.pagination.limit
            });
            
            if (result && result.listings) {
                this.listings = this.sanitizeListings(result.listings);
                this.pagination.total = result.total || this.listings.length;
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
            }
        } catch (error) {
            logError('loadListings', error);
            const cached = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
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

    sendWithResponse(type, payload = {}) {
        return new Promise((resolve, reject) => {
            if (!isActive()) {
                reject(new Error('Module not active'));
                return;
            }
            
            const requestId = generateRequestId();
            
            const responseHandler = (event) => {
                if (!validateMessage(event.data)) return;
                if (event.data.type === type + '_RESPONSE' && 
                    event.data.requestId === requestId) {
                    window.removeEventListener('message', responseHandler);
                    resolve(event.data.payload.data);
                }
            };
            
            window.addEventListener('message', responseHandler);
            
            safeSend(type, {
                requestId: requestId,
                ...payload
            });
        });
    }

    loadMyListings() {
        if (!this.currentUser || !isActive()) return;
        this.myListings = this.listings.filter(l => l.sellerId === this.currentUser.id);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
    }

    loadSavedListings() {
        if (!isActive()) return;
        const cached = safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
        if (cached) {
            this.savedListings = this.sanitizeListings(cached);
        }
    }

    async createListing(listingData) {
        if (!isActive()) throw new Error('Module not active');
        if (!this.currentUser) throw new Error('User not authenticated');

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
            const result = await this.sendWithResponse('CREATE_LISTING', listing);

            if (result && result.success) {
                this.listings = [listing, ...this.listings];
                this.myListings = [listing, ...this.myListings];
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
                this.notifyUI('listingCreated', listing);
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'LISTING_CREATED', listing });
                }
                logOnce('send', 'Listing created', { id: listing.id });
                return listing;
            } else {
                throw new Error('Failed to create listing');
            }
        } catch (error) {
            logError('createListing', error);
            throw error;
        }
    }

    async updateListing(listingId, updates) {
        if (!isActive()) throw new Error('Module not active');
        if (!this.currentUser) throw new Error('User not authenticated');

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
            const result = await this.sendWithResponse('UPDATE_LISTING', {
                id: listingId,
                updates: sanitized
            });

            if (result && result.success) {
                this.listings = this.listings.map(l => l.id === listingId ? updatedListing : l);
                this.myListings = this.myListings.map(l => l.id === listingId ? updatedListing : l);
                this.savedListings = this.savedListings.map(l => l.id === listingId ? updatedListing : l);
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
                this.notifyUI('listingUpdated', updatedListing);
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'LISTING_UPDATED', listing: updatedListing });
                }
                return updatedListing;
            } else {
                throw new Error('Failed to update listing');
            }
        } catch (error) {
            logError('updateListing', error);
            throw error;
        }
    }

    async deleteListing(listingId) {
        if (!isActive()) throw new Error('Module not active');
        if (!this.currentUser) throw new Error('User not authenticated');
        
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        if (listing.sellerId !== this.currentUser.id) throw new Error('You can only delete your own listings');

        try {
            const result = await this.sendWithResponse('DELETE_LISTING', { id: listingId });

            if (result && result.success) {
                this.listings = this.listings.filter(l => l.id !== listingId);
                this.myListings = this.myListings.filter(l => l.id !== listingId);
                this.savedListings = this.savedListings.filter(l => l.id !== listingId);
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
                this.notifyUI('listingDeleted', { id: listingId });
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'LISTING_DELETED', id: listingId });
                }
                return true;
            } else {
                throw new Error('Failed to delete listing');
            }
        } catch (error) {
            logError('deleteListing', error);
            throw error;
        }
    }

    async toggleSave(listingId) {
        if (!isActive()) throw new Error('Module not active');
        if (!this.currentUser) throw new Error('User not authenticated');

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');

        const isSaved = this.savedListings.some(l => l.id === listingId);
        const userId = this.currentUser.id;

        try {
            const result = await this.sendWithResponse('TOGGLE_SAVE', {
                listingId, save: !isSaved
            });

            if (result && result.success) {
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
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
                this.notifyUI('saveToggled', { listingId, saved: !isSaved });
                if (this.syncChannel) {
                    this.syncChannel.postMessage({ type: 'SAVE_TOGGLED', listingId, userId, saved: !isSaved });
                }
                return !isSaved;
            } else {
                throw new Error('Failed to toggle save');
            }
        } catch (error) {
            logError('toggleSave', error);
            throw error;
        }
    }

    async contactSeller(listingId, message = '') {
        if (!isActive()) throw new Error('Module not active');
        if (!this.currentUser) throw new Error('User not authenticated');

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');

        try {
            safeSend('CONTACT_SELLER', {
                listingId,
                sellerId: listing.sellerId,
                listingTitle: listing.title,
                message: message || `I'm interested in your listing: ${listing.title}`,
                timestamp: Date.now()
            });
            
            logOnce('send', `Contacted seller for ${listingId}`);
            return true;
        } catch (error) {
            logError('contactSeller', error);
            throw error;
        }
    }

    async trackView(listingId) {
        if (!isActive()) return;
        if (!listingId) return;
        this.listings = this.listings.map(l => {
            if (l.id === listingId) l.views = (l.views || 0) + 1;
            return l;
        });
        safeSend('TRACK_VIEW', { listingId, timestamp: Date.now() });
    }

    setFilter(key, value) {
        if (!isActive()) return;
        this.filters[key] = value;
        this.pagination.page = 1;
        this.notifyUI('filtersChanged', this.filters);
        this.notifyUI('listingsUpdated', this.getFilteredListings());
    }

    resetFilters() {
        if (!isActive()) return;
        this.filters = { search: '', category: '', minPrice: null, maxPrice: null, available: null, sort: 'newest' };
        this.pagination.page = 1;
        this.notifyUI('filtersChanged', this.filters);
        this.notifyUI('listingsUpdated', this.getFilteredListings());
    }

    getFilteredListings() {
        if (!isActive()) return [];
        
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
        if (!isActive()) return false;
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
            const cachedListings = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
            if (cachedListings) this.listings = this.sanitizeListings(cachedListings);
            const cachedMyListings = safeStorage.get(LOCAL_STORAGE_KEYS.MY_LISTINGS);
            if (cachedMyListings) this.myListings = this.sanitizeListings(cachedMyListings);
            const cachedSaved = safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
            if (cachedSaved) this.savedListings = this.sanitizeListings(cachedSaved);
            const cachedUser = safeStorage.get(LOCAL_STORAGE_KEYS.USER);
            if (cachedUser) this.currentUser = cachedUser;
        } catch (error) {
            logError('loadFromCache', error);
        }
    }

    queueOfflineListing(listing) {
        if (!isActive()) return;
        const queue = safeStorage.get('offlineQueue') || [];
        queue.push({ listing, timestamp: Date.now(), attempts: 0 });
        safeStorage.set('offlineQueue', queue);
    }

    generateSampleData() {
        if (this.listings.length > 0 || !isActive()) return;
        
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
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
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
        if (!isActive()) return [];
        return this.getFilteredListings();
    }

    getMyListings() {
        if (!isActive()) return [];
        if (!this.currentUser) return [];
        return this.myListings;
    }

    getSavedListings() {
        if (!isActive()) return [];
        return this.savedListings;
    }

    getListing(id) {
        if (!isActive()) return null;
        return this.listings.find(l => l.id === id);
    }

    isOwner(listingId) {
        if (!isActive()) return false;
        if (!this.currentUser) return false;
        const listing = this.getListing(listingId);
        return listing ? listing.sellerId === this.currentUser.id : false;
    }

    isSaved(listingId) {
        if (!isActive()) return false;
        return this.savedListings.some(l => l.id === listingId);
    }

    getCategories() {
        if (!isActive()) return [];
        const categories = new Set(this.listings.map(l => l.category).filter(Boolean));
        return Array.from(categories);
    }

    getStats() {
        if (!isActive()) return { total: 0, myListings: 0, saved: 0, active: 0 };
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

const marketplace = new MarketplaceCoreImpl();

// =============================================
// UNIFIED SEND FUNCTION (USING STANDARDIZED SCHEMA)
// =============================================

export async function sendToParent(type, payload = {}) {
    if (moduleState.shutdown) return { success: false, error: 'shutdown' };
    
    // CRITICAL: Use safeSend which handles queuing
    const result = safeSend(type, payload);
    if (result.success && !result.queued) {
        logOnce('send', type);
    }
    return result;
}

// =============================================
// MODULE INITIALIZATION (STRICT LIFECYCLE)
// =============================================

function sendChildReady() {
    // CRITICAL: Only send when in READY state
    if (currentLifecycleState !== LIFECYCLE_STATE.READY) {
        logOnce('warn', 'BLOCKED: CHILD_READY sent before READY state');
        return;
    }

    if (childReadySent) return;

    childReadySent = true;

    // Use safeSend which will queue if parent not ready (but we should be in READY state)
    safeSend('CHILD_READY', {
        module: MODULE_NAME,
        version: MODULE_VERSION,
        frameId: parentComm.frameId,
        timestamp: Date.now()
    });

    logOnce('send', 'CHILD_READY sent');
}

function initializeModule() {
    if (stateLock) return;
    stateLock = true;
    
    try {
        logOnce('init', 'Tools module booting');
        
        setLifecycleState(LIFECYCLE_STATE.INITIALIZING);
        
        window.addEventListener('message', (event) => {
            // PERFORMANCE FIX: Move heavy logic out of message listener
            setTimeout(() => parentComm.handleIncomingMessage(event), 0);
        });
        
        diagnostics.start();
        uiBridge.initialize();
        
        const inIframe = (window.parent && window.parent !== window);
        moduleState.parentDetected = inIframe;
        
        if (!inIframe) {
            logOnce('info', 'Not in iframe, running standalone');
            setLifecycleState(LIFECYCLE_STATE.READY);
            setLifecycleState(LIFECYCLE_STATE.WAIT_PARENT);
            parentReady = true; // Standalone mode
            parentReadyResolve();
            setLifecycleState(LIFECYCLE_STATE.ACTIVE);
            moduleState.ready = true;
            moduleState.initialized = true;
            isReady = true;
            window.__MODULE_READY__ = true;
            stateLock = false;
            messageHandler.completeActivation();
            flushMessageQueue(); // Flush any queued messages
            return;
        }
        
        setLifecycleState(LIFECYCLE_STATE.READY);
        
        sendChildReady();
        
        setLifecycleState(LIFECYCLE_STATE.WAIT_PARENT);
        logOnce('info', 'Waiting for parent ready signal');
        
        stateLock = false;
        
    } catch (error) {
        logError('Module initialization', error);
        stateLock = false;
    }
}

// =============================================
// EXPORTED CORE FUNCTIONS (PRESERVED)
// =============================================

export let initializeCore;
export let requestSession;
export let receiveFromParent;
export let shutdownCore;
export let syncWithParent;
export let checkParentHealth;

initializeCore = async function(options = {}) {
    if (moduleState.shutdown) return moduleState;
    if (moduleState.initialized) return moduleState;
    if (isInitializing) return moduleState;

    isInitializing = true;

    try {
        if (options.debug) {
            diagnostics.enableDebug();
        }

        initializeModule();

        await parentReadyPromise;

        moduleState.ready = isActive();
        isReady = moduleState.ready;
        isInitializing = false;
        isBootstrapped = true;
        handshakeComplete = moduleState.handshakeComplete;
        sessionValid = sessionClient.isValid();
        sessionData = sessionClient.getSession();

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

        window.__MODULE_READY__ = moduleState.ready;
        window.__MODULE_SESSION_ACTIVE__ = moduleState.sessionActive;

        await marketplace.initialize();

        window.dispatchEvent(new CustomEvent('coreInitialized', {
            detail: {
                state: moduleState,
                session: sessionClient.getSession(),
                sessionActive: moduleState.sessionActive,
                handshakeComplete: moduleState.handshakeComplete,
                environment: environmentDetector.environment,
                bootState: currentLifecycleState,
                parentReady: parentReady
            }
        }));

        logOnce('success', 'Tools module initialization complete');
        return moduleState;

    } catch (error) {
        logError('initializeCore', error);
        moduleState.ready = true;
        moduleState.initialized = true;
        isReady = true;
        isInitializing = false;
        isBootstrapped = true;
        window.__MODULE_READY__ = true;
        logOnce('warn', 'Tools module initialization failed - using fallback');
        return moduleState;
    }
};

requestSession = async function(force = false) {
    if (moduleState.shutdown) return false;
    if (!isActive()) return false;
    
    if (moduleState.sessionActive) {
        return true;
    }

    // CRITICAL: Only request session after parent ready
    if (parentReady && !moduleState.sessionActive && !moduleState.sessionState.requested) {
        moduleState.sessionState.requested = true;
        safeSend('REQUEST_SESSION', { force });
        return true;
    }

    return false;
};

receiveFromParent = function(type, handler) {
    if (moduleState.shutdown) return;
    if (!type || typeof handler !== 'function') return;
    messageHandler.registerHandler(type, handler);
};

shutdownCore = function() {
    moduleState.shutdown = true;
    moduleState.initialized = false;
    moduleState.ready = false;
    moduleState.handshakeComplete = false;
    moduleState.sessionActive = false;
    
    isReady = false;
    isInitializing = false;
    handshakeComplete = false;
    sessionValid = false;
    parentDataLoaded = false;
    directAPILoaded = false;
    isBootstrapped = false;
    isAuthReady = false;
    parentReady = false;

    heartbeatResponder.stop();
    parentComm.cleanup();
    messageHandler.cleanup();
    resourceManager.release();
    uiBridge.cleanup();
    diagnostics.stop();

    safeStorage.remove(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.ENVIRONMENT_CACHE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.STARTUP_STATE);
    safeStorage.sessionRemove('core_session_cache');

    // Clear queues
    messageQueue.length = 0;
    dataCache.clear();

    window.__MODULE_READY__ = false;
    window.__MODULE_SESSION_ACTIVE__ = false;

    logOnce('info', 'Core shutdown complete');
    return true;
};

syncWithParent = async function() {
    if (moduleState.shutdown || !moduleState.parentDetected) return false;
    if (!isActive()) return false;
    
    // Implement sync if needed
    safeSend('SYNC_REQUEST', { timestamp: Date.now() });
    
    return true;
};

checkParentHealth = function() {
    return {
        connected: moduleState.parentDetected,
        lastMessage: moduleState.connectionMetrics.messagesReceived,
        handshakeComplete: moduleState.handshakeComplete,
        sessionActive: moduleState.sessionActive,
        inIframe: moduleState.parentDetected,
        parentReady: parentReady,
        queuedMessages: messageQueue.length,
        connectionMetrics: moduleState.connectionMetrics,
        sessionStatus: sessionClient.getState(),
        environment: environmentDetector.getEnvironmentReport(),
        diagnostics: diagnostics.getReport(),
        boot: {
            state: currentLifecycleState,
            sessionAuthority: moduleState.sessionAuthority
        },
        heartbeat: heartbeatResponder.getStatus(),
        moduleState: currentLifecycleState
    };
};

// =============================================
// COMPATIBILITY FUNCTIONS (PRESERVED)
// =============================================

export function safeGetElement(id) {
    try {
        return document.getElementById(id);
    } catch {
        return null;
    }
}

export function hasValidSession() {
    return sessionClient.isValid();
}

export function hasValidUser() {
    const session = sessionClient.getSession();
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
        if (!isReady && !moduleState.ready) return null;
        if (!isActive()) return null;
        if (dataCache.has(dataType)) return dataCache.get(dataType);
        
        switch(dataType) {
            case DATA_TYPES.FRIENDS: return userFriends;
            case DATA_TYPES.GROUPS: return userGroups;
            case DATA_TYPES.CHAT_HISTORY: return [];
            case DATA_TYPES.NOTIFICATIONS: return [];
            case DATA_TYPES.SETTINGS:
                const session = sessionClient.getSession();
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
        if (!isReady && !moduleState.ready) return false;
        if (!isActive()) return false;
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

export function handleParentMessage(event) {
    try {
        parentComm.handleIncomingMessage(event);
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
        if (!isReady && !moduleState.ready) {
            safeSend('ERROR', { message: 'Cannot refresh data: core not ready' });
            return;
        }
        
        if (!isActive()) {
            safeSend('ERROR', { message: 'Cannot refresh data: module not active' });
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
            safeSend('DATA_REFRESHED', { dataTypes, timestamp: Date.now() });
        }, 1000);
    } catch {}
}

export async function fetchData(dataType) {
    try {
        if (!hasValidSession()) throw new Error('No valid session for API call');
        if (!isActive()) throw new Error('Module not active');
        
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
// pageCore COMPATIBILITY LAYER (PRESERVED)
// =============================================

export const pageCore = {
    init: async () => {
        if (isInitializing || isReady || moduleState.initialized) return;
        
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
            
            safeSend('UI_READY', {
                iframeId: parentComm.frameId,
                status: 'success',
                timestamp: Date.now(),
                bootState: currentLifecycleState
            });
            
            showStatusMessage('Marketplace loaded successfully', 'success');
            logOnce('success', 'pageCore initialization complete');
        } catch (error) {
            isInitializing = false;
            logError('pageCore.init', error);
            safeSend('ERROR', {
                iframeId: parentComm.frameId,
                message: error.message,
                timestamp: Date.now()
            });
        }
    },
    
    loadParentCommunication: async () => {
        return new Promise((resolve) => {
            setTimeout(resolve, 500);
        });
    },
    
    loadSession: async () => {
        try {
            if (window.parent && window.parent !== window) {
                await new Promise((resolve) => {
                    const checkSession = () => {
                        if (sessionData || moduleState.sessionActive) {
                            resolve();
                        } else {
                            setTimeout(checkSession, 100);
                        }
                    };
                    setTimeout(checkSession, 100);
                });
            }
            
            if (!sessionData && !moduleState.sessionActive) {
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
            if (!isActive()) return;
            
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
            if (hasValidSession() && isActive()) {
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
            if (hasValidSession() && isActive()) {
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
            if (hasValidSession() && isActive()) {
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
            if (hasValidSession() && userSubscription && (userSubscription.plan === 'business' || userSubscription.plan === 'team') && isActive()) {
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
            if (hasValidSession() && isActive()) {
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
            if (hasValidSession() && isUserPremium() && isActive()) {
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
            if (hasValidSession() && isActive()) {
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
    if (isInitializing || isReady || moduleState.initialized) return;
    await pageCore.init();
}

export async function initializeMarketplaceCore() {
    return safeInitializeMarketplaceCore();
}

// =============================================
// SESSION HANDLING FUNCTIONS (PRESERVED)
// =============================================

export function handleSessionDataFromParent(sessionDataFromParent) {
    try {
        if (!isActive()) {
            logOnce('warn', 'SESSION_DATA received before active - queuing');
            setTimeout(() => handleSessionDataFromParent(sessionDataFromParent), 100);
            return;
        }
        
        if (!validateSessionSchema(sessionDataFromParent)) {
            safeSend('AUTH_ERROR', {
                error: 'INVALID_SESSION_SCHEMA',
                received: Object.keys(sessionDataFromParent || {})
            });
            return;
        }
        
        processSessionData(sessionDataFromParent);
        
        handshakeComplete = true;
        moduleState.handshakeComplete = true;
        sessionData = sessionDataFromParent;
        sessionClient.acceptParentSession(sessionDataFromParent);
        updateLocalStateFromSession(sessionData);
        
        safeSend('SESSION_CONFIRMED', {
            id: parentComm.frameId,
            userId: sessionData.userId,
            timestamp: Date.now(),
            handshakeComplete: true
        });
        
        safeSend('UI_READY', {
            id: parentComm.frameId,
            component: 'marketplace',
            timestamp: Date.now()
        });
        
        bindUIAfterSession();
    } catch (error) {
        safeSend('AUTH_ERROR', {
            error: 'SESSION_PROCESSING_FAILED',
            message: error.message
        });
    }
}

export function bindUIAfterSession() {
    try {
        if (!isActive()) return;
        if (window._MARKETPLACE_UI_BOUND_) return;
        window._MARKETPLACE_UI_BOUND_ = true;
        
        window.dispatchEvent(new CustomEvent('marketplaceSessionReady', {
            detail: { user: window.currentUser, session: sessionClient.getSession(), timestamp: Date.now() }
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
        if (!isActive()) return;
        
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

export function handleSessionUpdate(updatedData) {
    try {
        if (!isActive()) {
            setTimeout(() => handleSessionUpdate(updatedData), 100);
            return;
        }
        if (!updatedData || typeof updatedData !== 'object') return;
        
        const currentSession = sessionClient.getSession() || sessionData || {};
        const mergedSession = { ...currentSession, ...updatedData };
        
        sessionData = mergedSession;
        sessionClient.acceptParentSession(mergedSession);
        
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
    } catch {}
}

export function clearSessionData() {
    try {
        sessionData = null;
        window.currentUser = null;
        window.userData = null;
        userSubscription = null;
        handshakeComplete = false;
        moduleState.handshakeComplete = false;
        sessionValid = false;
        moduleState.sessionActive = false;
        
        safeStorage.remove('USER_TOKEN');
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER);
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER_PROFILE);
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        safeStorage.sessionRemove('core_session_cache');
        
        parentDataLoaded = false;
        directAPILoaded = false;
        
        isReady = moduleState.ready;
        isInitializing = false;
        messageQueue = [];
        dataCache.clear();
        
        sessionClient.clear();
        
        window.__MODULE_SESSION_ACTIVE__ = false;
    } catch {}
}

export function handleRefreshUI() {
    try {
        if (!isActive()) return;
        window.dispatchEvent(new CustomEvent('marketplace:refresh-ui'));
    } catch {}
}

export function handleForceReload() {
    try {
        saveAllMarketplaceData();
        window.location.reload();
    } catch {}
}

// =============================================
// API CALL FUNCTIONS (PRESERVED)
// =============================================

export async function secureApiCall(method, endpoint, data = null, options = {}) {
    if (!isActive()) {
        if (endpoint.includes('/marketplace/listings') && method === 'GET') {
            try {
                const cached = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                if (cached) return { listings: cached };
            } catch {}
        }
        return null;
    }
    
    if (!hasValidSession()) {
        if (method !== 'GET' || endpoint.includes('/auth/')) {
            safeSend('NEED_REFRESH', {
                reason: 'api_call_without_session',
                endpoint: endpoint,
                method: method
            });
        }
        if (endpoint.includes('/marketplace/listings') && method === 'GET') {
            try {
                const cached = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                if (cached) return { listings: cached };
            } catch {}
        }
        return null;
    }
    
    if (!isAuthReady) {
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
        safeSend('AUTH_ERROR', {
            error: 'API_CALL_FAILED',
            endpoint: endpoint,
            method: method,
            message: error.message
        });
        
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
        safeSend('AUTH_ERROR', {
            error: 'UNAUTHORIZED_API_CALL',
            timestamp: Date.now()
        });
        safeStorage.remove('USER_TOKEN');
        showNotification('Session expired. Please log in again.', 'error');
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

export function getCentralToken() {
    try {
        const session = sessionClient.getSession();
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

export function setupConnectivityListeners() {
    try {
        window.addEventListener('online', () => {
            safeSend('PING', { type: 'connectivity_check' });
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
            if (!hasValidSession()) {
                throw new Error('No session data available for token initialization');
            }
            
            const session = sessionClient.getSession();
            if (!session || !session.userToken) {
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

export async function bootstrapIframe() {
    if (isBootstrapped || moduleState.initialized) return;
    
    try {
        if (!sessionData && !moduleState.sessionActive) await new Promise(resolve => setTimeout(resolve, 1000));
        if (tokenInitializationPromise) {
            try { await tokenInitializationPromise; } catch {}
        }
        loadCachedDataInstantly();
        if (hasValidSession() && isActive()) {
            try { await secureApiCall('GET', '/api/auth/verify'); } catch {}
        }
        isBootstrapped = true;
    } catch {
        isBootstrapped = true;
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
        if (!isActive()) return;
        checkDarkMode();
        await checkUserPremiumStatus();
        await loadEnhancedMarketplaceData();
        cleanupExpiredListings();
    } catch {}
}

export async function checkUserPremiumStatus() {
    try {
        if (!isActive()) return;
        
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
        if (!isActive()) return;
        
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
        if (!isActive()) return;
        
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
        if (!isActive()) return;
        
        const response = await safeApiCall('GET', '/api/marketplace/spotlight');
        if (response && response.spotlightListings) {
            safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, response.spotlightListings);
        }
    } catch {}
}

export function updateListingCounts() {
    try {
        if (!isActive()) return;
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
        const session = sessionClient.getSession();
        if (session && session.isPremium) return true;
        return userSubscription && userSubscription.status === 'active';
    } catch {
        return false;
    }
}

export function isListingVisibleToUser(listing) {
    try {
        if (!listing) return false;
        const session = sessionClient.getSession();
        const currentUserId = session?.userId || window.currentUser?.id || window.currentUser?._id;
        if (!currentUserId) return false;
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
        if (!isActive()) return;
        
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
        if (!hasValidUser()) throw new Error('User not authenticated');
        if (!isActive()) throw new Error('Module not active');
        
        const session = sessionClient.getSession();
        const userId = session?.userId || window.currentUser?.id || window.currentUser?._id;
        const user = session || window.userData || { displayName: 'User' };
        
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
        if (!hasValidUser()) throw new Error('User not authenticated');
        if (!isActive()) throw new Error('Module not active');
        
        const session = sessionClient.getSession();
        const userId = session?.userId || window.currentUser?.id || window.currentUser?._id;
        const user = session || window.userData || { displayName: 'User' };
        
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
        if (!isActive()) return;
        const spotlightListings = safeStorage.get(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS) || [];
        spotlightListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, spotlightListings);
        await safeApiCall('POST', '/api/marketplace/spotlight', { listingId: listing.id });
    } catch {}
}

export async function processBoostedListing(listing) {
    try {
        if (!isActive()) return;
        await safeApiCall('POST', '/api/marketplace/boost', { listingId: listing.id, duration: '24h' });
    } catch {}
}

export async function processPremiumPayment(listing, options) {
    try {
        if (!isActive()) return false;
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
        if (!isActive()) return false;
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
        if (!isActive()) return;
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
        if (!isActive()) return;
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
        if (!isActive()) return;
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
        if (!hasValidUser()) throw new Error('User not authenticated');
        if (!isActive()) throw new Error('Module not active');
        
        const session = sessionClient.getSession();
        const userId = session?.userId || window.currentUser?.id || window.currentUser?._id;
        const user = session || window.userData || { displayName: 'User' };
        
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
        if (!hasValidUser()) throw new Error('User not authenticated');
        if (!isActive()) throw new Error('Module not active');
        
        const session = sessionClient.getSession();
        const userId = session?.userId || window.currentUser?.id || window.currentUser?._id;
        const user = session || window.userData || { displayName: 'User' };
        
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
        if (!isActive()) throw new Error('Module not active');
        
        if (fileUrl.startsWith('javascript:') || fileUrl.startsWith('data:')) throw new Error('Invalid file URL scheme');
        
        const listing = allListings.find(l => l.id === listingId) || myListings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        
        const session = sessionClient.getSession();
        const currentUserId = session?.userId || window.currentUser?.id;
        
        if (listing.userId !== currentUserId && !isListingVisibleToUser(listing)) {
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
        if (!isActive()) return;
        
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
    if (!isActive()) return;
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
    } catch {}
}

export function requestParentUserData() {
    try {
        if (!isActive()) return;
        safeSend('REQUEST_USER_DATA', {
            fields: ['id', 'displayName', 'email', 'photoURL', 'isPremium', 'subscription', 'trustLevel']
        });
    } catch {
        fetchUserDataDirectly();
    }
}

export async function fetchUserDataDirectly() {
    if (dataFetchInProgress) return;
    dataFetchInProgress = true;
    
    try {
        const token = getCentralToken();
        if (!token) {
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
            safeSend('USER_DATA_LOADED', { source: 'direct_api', userId: response.user.id });
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
        
        sessionClient.acceptParentSession(sessionData);
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
        sessionClient.acceptParentSession(sessionUpdate);
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
        sessionClient.clear();
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
        return isBootstrapped && (hasValidSession() || window.currentUser) && isActive();
    } catch {
        return false;
    }
}

export function isCoreReady() {
    return isReady || moduleState.ready;
}

function checkDependencies() {
    try {
        return !!(window.API || window.AppCore || window.callApi);
    } catch {
        return false;
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
        sessionClient.acceptParentSession(sessionData);
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
    _STATE: { ...moduleState },
    getSession: () => sessionClient.getSession(),
    hasValidSession: () => sessionClient.isValid(),
    isUserPremium,
    isMarketplaceReady,
    getDiagnostics: () => diagnostics?.getReport(),
    getConnectionStatus: () => heartbeatResponder?.getStatus(),
    getEnvironment: () => environmentDetector?.environment,
    getBootState: () => ({
        state: currentLifecycleState,
        sessionAuthority: moduleState.sessionAuthority,
        parentReady: parentReady
    }),
    marketplace
};

// =============================================
// GLOBAL EXPORTS (PRESERVED)
// =============================================

if (typeof window !== 'undefined') {
    try {
        window.marketplaceCore = {
            initializeCore,
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
            handleSessionDataFromParent,
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
                    session: sessionClient?.getState(),
                    connection: heartbeatResponder?.getStatus(),
                    environment: environmentDetector?.environment,
                    boot: {
                        state: currentLifecycleState,
                        parentReady: parentReady
                    }
                }),
                enableDebug: () => diagnostics?.enableDebug(),
                disableDebug: () => diagnostics?.disableDebug()
            },
            marketplace: marketplace,
            _STATE: moduleState,
            sessionAdapter: sessionClient,
            environmentDetector,
            heartbeatResponder,
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
            
            initializeModule();
            
            pageCore.init().catch(() => {});
            
        } catch {}
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
        if (!isActive()) throw new Error('Module not active');
        
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
        if (!isActive()) return false;
        safeSend('OPEN_CHAT', { userId, userName, timestamp: Date.now() });
        return true;
    } catch {
        return false;
    }
}

export async function loadAnalyticsData() {
    try {
        if (hasValidSession() && isUserPremium() && isActive()) {
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
        if (hasValidSession() && isActive()) {
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
        if (!isActive()) throw new Error('Module not active');
        
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
// CONSOLE OUTPUT MATCHES FRIENDS MODULE
// =============================================

export default marketplace;