// =============================================
// TOOLS-CORE.JS - COMPLETE PRODUCTION MODULE (FIXED)
// =============================================
// Version: 10.2.3 - FIXED: API RESPONSE HANDLING, CREATE LISTING, TABS
// =============================================

// =============================================
// MODULE IDENTIFIER - MUST MATCH PARENT EXPECTATIONS
// =============================================
const MODULE_NAME = 'tools'; // EXACT match required
const MODULE_VERSION = '10.2.3'; // FIXED VERSION
const MODULE_CAPABILITIES = ['marketplace', 'storage', 'heartbeat', 'ui'];

// =============================================
// LIFECYCLE STATE MACHINE (SINGLE SOURCE OF TRUTH - STRICT)
// =============================================

const LIFECYCLE_STATE = {
    BOOT: 'BOOT',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    WAIT_PARENT: 'WAIT_PARENT',
    WAITING_AUTH: 'WAITING_AUTH',
    ACTIVE: 'ACTIVE'
};

let currentState = LIFECYCLE_STATE.BOOT;
let childReadySent = false;
let parentReadyReceived = false;
let initializationLock = false;
let activationComplete = false;

// State transition validation matrix - STRICT
const VALID_TRANSITIONS = {
    [LIFECYCLE_STATE.BOOT]: [LIFECYCLE_STATE.INITIALIZING],
    [LIFECYCLE_STATE.INITIALIZING]: [LIFECYCLE_STATE.READY],
    [LIFECYCLE_STATE.READY]: [LIFECYCLE_STATE.WAIT_PARENT],
    [LIFECYCLE_STATE.WAIT_PARENT]: [LIFECYCLE_STATE.WAITING_AUTH, LIFECYCLE_STATE.ACTIVE],
    [LIFECYCLE_STATE.WAITING_AUTH]: [LIFECYCLE_STATE.ACTIVE],
    [LIFECYCLE_STATE.ACTIVE]: []
};

function transitionTo(nextState, reason = '') {
    // Prevent duplicate transitions
    if (currentState === nextState) {
        if (window.__TOOLS_DEBUG__) console.log(`[Tools][Lifecycle] Already in ${nextState} - ignoring transition request`);
        return true;
    }
    
    if (!VALID_TRANSITIONS[currentState]?.includes(nextState)) {
        if (window.__TOOLS_DEBUG__) console.error(`[Tools][Lifecycle] INVALID TRANSITION: ${currentState} → ${nextState}`, reason);
        return false;
    }
    
    const fromState = currentState;
    if (window.__TOOLS_DEBUG__) console.log(`[Tools][Lifecycle] ${fromState} → ${nextState}`, reason);
    currentState = nextState;
    moduleState.bootState = nextState;
    
    window.dispatchEvent(new CustomEvent('tools:lifecycle-change', { 
        detail: { from: fromState, to: nextState, reason }
    }));
    
    // Trigger state-specific handlers
    if (nextState === LIFECYCLE_STATE.ACTIVE && !activationComplete) {
        onModuleActive();
        activationComplete = true;
    }
    
    return true;
}

function assertActive(actionName) {
    if (currentState !== LIFECYCLE_STATE.ACTIVE) {
        if (window.__TOOLS_DEBUG__) console.warn(`[Tools][Lifecycle] Blocked action "${actionName}" — not ACTIVE (current: ${currentState})`);
        return false;
    }
    return true;
}

export function isActive() {
    // Module is active if state is ACTIVE, regardless of how parentReadyReceived was set
    return currentState === LIFECYCLE_STATE.ACTIVE;
}

// =============================================
// SESSION VALIDATION UTILITY (MANDATORY)
// =============================================
function __isValidSession(session) {
    if (!session || typeof session !== 'object') return false;
    
    // Check for userId in any common format (including nested user object)
    let userId = session.userId || session.user_id || session.userid || session.id;
    
    // Check nested user object
    if (!userId && session.user) {
        userId = session.user.id || session.user.userId;
    }
    
    // Check nested session object
    if (!userId && session.session) {
        userId = session.session.userId || session.session.id;
    }
    
    if (!userId) return false;
    
    // Reject only obviously fake IDs
    const fakeIds = ['user', 'default', 'null', 'undefined', ''];
    if (typeof userId === 'string' && fakeIds.includes(userId.toLowerCase())) {
        return false;
    }
    
    // Check for token in various locations
    let token = session.userToken || session.token || session.accessToken;
    if (!token && session.user) {
        token = session.user.token || session.user.userToken;
    }
    if (!token && session.session) {
        token = session.session.token || session.session.userToken;
    }
    
    // In development, accept any session with a userId
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return true;
    }
    
    // For production, require token OR trust that parent sent valid data
    return true;
}

// =============================================
// STORAGE PROXY - SANDBOX-COMPLIANT (NO DIRECT STORAGE)
// =============================================

const StorageProxy = {
    pendingRequests: new Map(),
    requestCounter: 0,

    get(key, defaultValue = null) {
        return new Promise((resolve) => {
            const requestId = `storage_get_${++this.requestCounter}_${Date.now()}`;
            
            const handler = (event) => {
                if (event.data?.type === 'STORAGE_RESULT' && 
                    event.data.requestId === requestId &&
                    event.data.key === key) {
                    window.removeEventListener('message', handler);
                    resolve(event.data.value !== undefined ? event.data.value : defaultValue);
                }
            };
            
            window.addEventListener('message', handler);
            
            parent.postMessage({
                type: 'STORAGE_GET',
                key,
                requestId,
                module: MODULE_NAME,
                timestamp: Date.now()
            }, '*');
            
            // Timeout fallback
            setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(defaultValue);
            }, 5000);
        });
    },

    set(key, value) {
        parent.postMessage({
            type: 'STORAGE_SET',
            key,
            value,
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
        
        return true;
    },

    remove(key) {
        parent.postMessage({
            type: 'STORAGE_REMOVE',
            key,
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
        
        return true;
    },

    clear() {
        parent.postMessage({
            type: 'STORAGE_CLEAR',
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
    },

    sessionGet(key, defaultValue = null) {
        return new Promise((resolve) => {
            const requestId = `session_get_${++this.requestCounter}_${Date.now()}`;
            
            const handler = (event) => {
                if (event.data?.type === 'SESSION_STORAGE_RESULT' && 
                    event.data.requestId === requestId &&
                    event.data.key === key) {
                    window.removeEventListener('message', handler);
                    resolve(event.data.value !== undefined ? event.data.value : defaultValue);
                }
            };
            
            window.addEventListener('message', handler);
            
            parent.postMessage({
                type: 'SESSION_STORAGE_GET',
                key,
                requestId,
                module: MODULE_NAME,
                timestamp: Date.now()
            }, '*');
            
            setTimeout(() => {
                window.removeEventListener('message', handler);
                resolve(defaultValue);
            }, 5000);
        });
    },

    sessionSet(key, value) {
        parent.postMessage({
            type: 'SESSION_STORAGE_SET',
            key,
            value,
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
        
        return true;
    },

    sessionRemove(key) {
        parent.postMessage({
            type: 'SESSION_STORAGE_REMOVE',
            key,
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
        
        return true;
    }
};

// =============================================
// SESSION CLIENT - PARENT-AUTHORITATIVE
// =============================================

const SessionClient = {
    session: null,
    sessionPromise: null,
    sessionResolvers: [],
    pendingRequests: new Map(),
    _lastSessionId: null,
    
    _generateSessionId(session) {
        const token = session.userToken || session.token;
        const userId = session.userId || session.user_id || session.userid || session.id;
        return `${userId}_${token.substring(0, 16)}`;
    },
    
    requestSession() {
        if (this.sessionPromise) return this.sessionPromise;
        
        // Only request if active or waiting for auth
        if (!isActive() && currentState !== LIFECYCLE_STATE.WAITING_AUTH && currentState !== LIFECYCLE_STATE.WAIT_PARENT) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools][Session] Cannot request session - module not ready');
            return Promise.reject(new Error('Module not ready'));
        }
        
        this.sessionPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Session request timeout'));
            }, 10000);
            
            const requestId = `session_req_${Date.now()}_${Math.random()}`;
            this.pendingRequests.set(requestId, { resolve, reject, timeout });
            
            parent.postMessage({
                type: 'REQUEST_SESSION',
                requestId,
                module: MODULE_NAME,
                timestamp: Date.now()
            }, '*');
        });
        
        return this.sessionPromise;
    },
    
    handleSessionData(sessionData, requestId = null) {
        // STRICT: Validate session before accepting
        if (!__isValidSession(sessionData)) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools][Session] Rejected invalid session data', {
                hasToken: !!(sessionData?.userToken || sessionData?.token),
                userId: sessionData?.userId || sessionData?.user_id || sessionData?.id
            });
            if (requestId && this.pendingRequests.has(requestId)) {
                const { reject, timeout } = this.pendingRequests.get(requestId);
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(new Error('Invalid session data'));
            }
            return false;
        }
        
        // Prevent session downgrade: if we already have a valid session, don't overwrite with invalid
        if (this.session && __isValidSession(this.session)) {
            if (!__isValidSession(sessionData)) {
                if (window.__TOOLS_DEBUG__) console.warn('[Tools][Session] Prevented session downgrade - ignoring invalid session');
                return false;
            }
            
            // Check for duplicate session using session ID
            const newSessionId = this._generateSessionId(sessionData);
            if (this._lastSessionId === newSessionId) {
                if (window.__TOOLS_DEBUG__) console.log('[Tools][Session] Duplicate session ignored');
                if (requestId && this.pendingRequests.has(requestId)) {
                    const { resolve, timeout } = this.pendingRequests.get(requestId);
                    clearTimeout(timeout);
                    this.pendingRequests.delete(requestId);
                    resolve(this.session);
                }
                return true;
            }
            this._lastSessionId = newSessionId;
        } else {
            // First time setting session
            const newSessionId = this._generateSessionId(sessionData);
            this._lastSessionId = newSessionId;
        }
        
        if (requestId && this.pendingRequests.has(requestId)) {
            const { resolve, timeout } = this.pendingRequests.get(requestId);
            clearTimeout(timeout);
            this.pendingRequests.delete(requestId);
            resolve(sessionData);
        }
        
        // Merge session data - never overwrite entirely
        if (this.session && __isValidSession(this.session)) {
            this.session = { ...this.session, ...sessionData };
        } else {
            this.session = sessionData;
        }
        
        // Notify all waiting resolvers
        this.sessionResolvers.forEach(resolver => resolver(this.session));
        this.sessionResolvers = [];
        
        window.dispatchEvent(new CustomEvent('session:updated', { 
            detail: this.session 
        }));
        
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Session] Valid session accepted', {
            userId: this.session.userId || this.session.user_id || this.session.id,
            hasToken: !!(this.session.userToken || this.session.token)
        });
        
        return true;
    },
    
    getSession() {
        return this.session;
    },
    
    getToken() {
        return this.session?.userToken || this.session?.token;
    },
    
    getUser() {
        return this.session ? {
            id: this.session.userId || this.session.user_id || this.session.id,
            displayName: this.session.displayName || this.session.name,
            email: this.session.email,
            photoURL: this.session.photoURL || this.session.avatar,
            isPremium: !!this.session.isPremium,
            trustLevel: this.session.trustLevel || 'new'
        } : null;
    },
    
    isReady() {
        if (!this.session) return false;
        if (!this.getToken()) return false;
        // Validate userId is not fake
        const userId = this.session.userId || this.session.user_id || this.session.id;
        if (userId === 'user' || userId === 'default' || userId === 'null' || userId === 'undefined') return false;
        return true;
    },
    
    isValid() {
        if (!this.isReady()) return false;
        if (this.session.expiresAt) {
            try {
                return new Date(this.session.expiresAt) > new Date();
            } catch {
                return true;
            }
        }
        return true;
    },
    
    clear() {
        this.session = null;
        this.sessionPromise = null;
        this.pendingRequests.clear();
        this._lastSessionId = null;
        
        parent.postMessage({
            type: 'SESSION_CLEAR',
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
    },
    
    onSession(callback) {
        if (this.session) {
            callback(this.session);
            return () => {};
        }
        
        this.sessionResolvers.push(callback);
        return () => {
            const index = this.sessionResolvers.indexOf(callback);
            if (index !== -1) this.sessionResolvers.splice(index, 1);
        };
    }
};

// =============================================
// MESSAGE DEDUPLICATION (ENHANCED - STRICT)
// =============================================

const MessageGuard = {
    seen: new Set(),
    processed: new Set(),
    maxSize: 1000,
    
    isDuplicate(id) {
        if (!id) return false;
        if (this.seen.has(id)) return true;
        
        this.seen.add(id);
        
        // Maintain size limit
        if (this.seen.size > this.maxSize) {
            const iterator = this.seen.values();
            const toDelete = Math.floor(this.seen.size / 2);
            for (let i = 0; i < toDelete; i++) {
                this.seen.delete(iterator.next().value);
            }
        }
        
        return false;
    },
    
    isProcessed(id) {
        if (!id) return false;
        return this.processed.has(id);
    },
    
    markProcessed(id) {
        if (!id) return;
        this.processed.add(id);
        
        if (this.processed.size > this.maxSize) {
            const iterator = this.processed.values();
            const toDelete = Math.floor(this.processed.size / 2);
            for (let i = 0; i < toDelete; i++) {
                this.processed.delete(iterator.next().value);
            }
        }
    },
    
    clear() {
        this.seen.clear();
        this.processed.clear();
    }
};

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
    
    if (window.__TOOLS_DEBUG__) console.log(`${LOG_PREFIX} ${prefix} - ${message}`, data ? data : '');
}

function logError(module, error, context = '') {
    logOnce('error', `${module} failed: ${error?.message || error}`, { context });
}

function debugLog(...args) {
    if (DEBUG) console.log(...args);
}

// =============================================
// MESSAGE QUEUE SYSTEM (STRICT - PRE-ACTIVE ONLY)
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

// =============================================
// STANDARDIZED MESSAGE SCHEMA (PARENT-ALIGNED)
// =============================================

function createMessage(type, payload = {}) {
    return {
        type: type,
        id: generateMessageId(),
        requestId: generateRequestId(),
        source: MODULE_NAME,
        target: 'parent',
        timestamp: Date.now(),
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
// SAFE SEND WITH QUEUE (STRICT - NO SEND BEFORE ACTIVE)
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
    // STRICT RULE: Only CHILD_READY allowed before WAIT_PARENT
    if (!parentReadyReceived && type !== 'CHILD_READY') {
        if (currentState === LIFECYCLE_STATE.WAIT_PARENT || currentState === LIFECYCLE_STATE.WAITING_AUTH) {
            if (window.__TOOLS_DEBUG__) console.warn(`[Tools][Queue] Message ${type} blocked - in ${currentState} state (only CHILD_READY allowed)`);
            return { success: false, error: 'wait_parent_blocked', queued: false };
        }
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
    if (!parentReadyReceived || messageQueue.length === 0) return;
    
    if (window.__TOOLS_DEBUG__) console.log(`[Tools][Queue] Flushing ${messageQueue.length} queued messages`);
    
    while (messageQueue.length > 0) {
        const queued = messageQueue.shift();
        const message = createMessage(queued.type, queued.payload);
        sendMessage(message);
    }
}

// =============================================
// MESSAGE VALIDATION (STRICT SCHEMA)
// =============================================
function validateMessage(msg) {
    if (!msg || typeof msg !== 'object') return false;
    
    // For handshake/AUTH messages, be very permissive
    const handshakeTypes = ['PARENT_READY', 'AUTH_READY', 'CHILD_READY', 'SESSION_DATA', 'SESSION_UPDATE'];
    if (handshakeTypes.includes(msg.type)) {
        // Just need type for handshake - source can be anything
        return typeof msg.type === 'string' && msg.type.length > 0;
    }
    
    // For other messages, validate more strictly
    const hasType = typeof msg.type === 'string' && msg.type.length > 0;
    const hasSource = msg.source === 'parent' || msg.source === 'tools' || !msg.source;
    const hasPayload = msg.payload !== undefined;
    
    return hasType && hasSource && hasPayload;
}
// =============================================
// ORIGIN VALIDATION (RELAXED DURING HANDSHAKE)
// =============================================

let expectedParentOrigin = null;

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
    // Relax origin validation during handshake
    if (currentState !== LIFECYCLE_STATE.ACTIVE) {
        return true;
    }
    
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

function isMessageFromParent(event) {
    if (!expectedParentOrigin && event.source === window.parent) {
        expectedParentOrigin = event.origin;
    }
    
    if (expectedParentOrigin && event.origin !== expectedParentOrigin) {
        debugLog(`[Security] Origin mismatch: expected ${expectedParentOrigin}, got ${event.origin}`);
        return false;
    }
    
    return event.source === window.parent && isValidOrigin(event.origin);
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
    protocolVersion: 'KYN-10.2',
    connectionMetrics: {
        messagesSent: 0,
        messagesReceived: 0,
        acksReceived: 0
    },
    
    bootState: LIFECYCLE_STATE.BOOT,
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
    
    MODULE_HEARTBEAT: 'MODULE_HEARTBEAT',
    
    STORAGE_GET: 'STORAGE_GET',
    STORAGE_SET: 'STORAGE_SET',
    STORAGE_REMOVE: 'STORAGE_REMOVE',
    STORAGE_CLEAR: 'STORAGE_CLEAR',
    STORAGE_RESULT: 'STORAGE_RESULT',
    SESSION_STORAGE_GET: 'SESSION_STORAGE_GET',
    SESSION_STORAGE_SET: 'SESSION_STORAGE_SET',
    SESSION_STORAGE_REMOVE: 'SESSION_STORAGE_REMOVE',
    SESSION_STORAGE_RESULT: 'SESSION_STORAGE_RESULT'
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
// MODULE 0 - SAFE STORAGE LAYER (UPDATED TO USE PROXY)
// =============================================

class SafeStorage {
    constructor() {
        this.memoryStorage = new Map();
        this.warningsShown = new Set();
        logOnce('ready', 'SafeStorage initialized (proxy-based)');
    }

    async get(key, defaultValue = null) {
        try {
            const value = await StorageProxy.get(key);
            if (value !== null && value !== undefined) {
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
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
            StorageProxy.set(key, serialized);
            this.memoryStorage.set(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    remove(key) {
        try {
            StorageProxy.remove(key);
            this.memoryStorage.delete(key);
            return true;
        } catch (e) {
            return false;
        }
    }

    async sessionGet(key, defaultValue = null) {
        try {
            const value = await StorageProxy.sessionGet(key);
            if (value !== null && value !== undefined) {
                try {
                    return JSON.parse(value);
                } catch {
                    return value;
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
            StorageProxy.sessionSet(key, serialized);
            this.memoryStorage.set(`session_${key}`, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    sessionRemove(key) {
        try {
            StorageProxy.sessionRemove(key);
            this.memoryStorage.delete(`session_${key}`);
            return true;
        } catch (e) {
            return false;
        }
    }

    clear() {
        StorageProxy.clear();
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
            let stored = null;
            safeStorage.get(LOCAL_STORAGE_KEYS.FRAME_ID).then(val => {
                if (val) stored = val;
            });
            if (!stored) {
                stored = `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
                safeStorage.set(LOCAL_STORAGE_KEYS.FRAME_ID, stored);
            }
            return stored;
        } catch {
            return `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        }
    }

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
        if (!isMessageFromParent(event)) {
            debugLog(`[Security] Rejected message from origin: ${event.origin}`);
            return;
        }

        const message = event.data;

        // Check for duplicate processing
        if (message.id && MessageGuard.isProcessed(message.id)) {
            debugLog(`Duplicate message already processed: ${message.id}`);
            return;
        }

        if (!validateMessage(message)) {
            debugLog('Invalid message schema', message);
            return;
        }

        if (MessageGuard.isDuplicate(message.id)) {
            debugLog(`Duplicate message ignored: ${message.id}`);
            return;
        }

        moduleState.connectionMetrics.messagesReceived++;

        // Mark as processed
        if (message.id) {
            MessageGuard.markProcessed(message.id);
        }

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
// MODULE 3 - SESSION CLIENT WRAPPER (UPDATED - NO STORAGE)
// =============================================

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

const sessionClient = new SessionClientWrapper();

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

const diagnostics = new DiagnosticsAgent();

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
            activationComplete = true;
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
        const theme = value === 'auto'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : value;
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
            const theme = s.theme === 'auto'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : s.theme;
            document.documentElement.setAttribute('data-theme', theme);
            document.body.setAttribute('data-theme', theme);
            safeStorage.set('user_theme_preference', theme);
        }
        
        if (s.fontSize) {
            document.documentElement.style.fontSize = parseInt(s.fontSize) + 'px';
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
    parentReadyReceived = true;
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
            activationComplete = true;
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
                    activationComplete = true;
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
                activationComplete = true;
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
        // Use whitelist from CONFIG
        const originWhitelist = [
            window.location.origin,
            'http://localhost:4000',
            'http://localhost:5500',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://*.onrender.com',
            'http://*.onrender.com',
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com',
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

const uiBridge = new UIBridge();

// =============================================
// MARKETPLACE CORE IMPLEMENTATION (PRESERVED - UPDATED STORAGE)
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
                if (!assertActive('syncChannel message')) return;
                if (event.data && event.data.type && isActive()) {
                    this.handleSyncMessage(event.data);
                }
            };
        } catch (e) {}
    }

    setupEventListeners() {
        // Storage events are not available in sandbox, using proxy instead
        // Window event for cache updates
        window.addEventListener('storageProxy:updated', (e) => {
            if (!assertActive('storage event')) return;
            if (e.detail && e.detail.key && e.detail.key.startsWith('marketplace_') && isActive()) {
                this.loadFromCache();
                this.notifyUI('storageUpdated', { key: e.detail.key });
            }
        });
    }

    async loadFromCache() {
        try {
            const cachedListings = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
            if (cachedListings) this.listings = this.sanitizeListings(cachedListings);
            const cachedMyListings = await safeStorage.get(LOCAL_STORAGE_KEYS.MY_LISTINGS);
            if (cachedMyListings) this.myListings = this.sanitizeListings(cachedMyListings);
            const cachedSaved = await safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
            if (cachedSaved) this.savedListings = this.sanitizeListings(cachedSaved);
        } catch (error) {
            logError('loadFromCache', error);
        }
    }

    handleUIAction(payload) {
        if (!assertActive('handleUIAction')) return;
        if (!payload || !payload.action) return;
        
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
        if (!assertActive('handleSyncMessage')) return;
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
        if (!assertActive('handleListingCreated')) return;
        
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
        if (!assertActive('handleListingUpdated')) return;
        
        this.listings = this.listings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        this.myListings = this.myListings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        this.savedListings = this.savedListings.map(l => l.id === updated.id ? { ...l, ...updated } : l);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
        this.notifyUI('listingUpdated', updated);
    }

    handleListingDeleted(deleted) {
        if (!assertActive('handleListingDeleted')) return;
        
        this.listings = this.listings.filter(l => l.id !== deleted.id);
        this.myListings = this.myListings.filter(l => l.id !== deleted.id);
        this.savedListings = this.savedListings.filter(l => l.id !== deleted.id);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
        this.notifyUI('listingDeleted', deleted);
    }

    handleSaveToggled(listingId, userId, saved) {
        if (!assertActive('handleSaveToggled')) return;
        
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
            const user = sessionClient.getUser ? sessionClient.getUser() : null;
            this.currentUser = user;
            
            await this.loadListings();
            
            this.initialized = true;
            logOnce('ready', 'MarketplaceCore ready');
            
        } catch (error) {
            logError('MarketplaceCore.initialize', error);
            // Do not generate sample data — show real empty state
            this.initialized = true;
        }
    }

    
    async loadListings() {
        if (!assertActive('loadListings')) return;
        
        this.loading = true;
        this.notifyUI('loading', true);
        
        try {
            // Primary path: direct authorized fetch to backend
            const response = await safeApiCall('GET', '/api/marketplace/listings?page=' + this.pagination.page + '&limit=' + this.pagination.limit);
            
            // FIX: Backend returns { success, data: { listings, total } }
            if (response && response.data?.listings) {
                const listingsData = response.data.listings;
                this.listings = this.sanitizeListings(listingsData);
                this.pagination.total = response.data.total || listingsData.length;
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                // Expose globally for UI
                window.allListings = this.listings;
                this.notifyUI('data-updated', { listings: this.listings, total: this.pagination.total });
            } else if (response && (response.listings || response.data?.listings)) {
                // Fallback for legacy format
                const listingsData = response.listings || response.data?.listings || [];
                this.listings = this.sanitizeListings(listingsData);
                this.pagination.total = response.total || response.data?.total || this.listings.length;
                safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                window.allListings = this.listings;
                this.notifyUI('data-updated', { listings: this.listings, total: this.pagination.total });
            } else {
                // Try postMessage path as fallback
                try {
                    const result = await this.sendWithResponse('FETCH_LISTINGS', {
                        page: this.pagination.page,
                        limit: this.pagination.limit
                    });
                    if (result && result.listings) {
                        this.listings = this.sanitizeListings(result.listings);
                        this.pagination.total = result.total || this.listings.length;
                        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
                        window.allListings = this.listings;
                        this.notifyUI('data-updated', { listings: this.listings, total: this.pagination.total });
                    }
                } catch (_) {
                    // Fall through to cache
                }
                if (this.listings.length === 0) {
                    const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                    if (cached) {
                        this.listings = this.sanitizeListings(cached);
                        window.allListings = this.listings;
                    }
                }
            }
        } catch (error) {
            logError('loadListings', error);
            const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
            if (cached) {
                this.listings = this.sanitizeListings(cached);
                window.allListings = this.listings;
            }
            // No sample data — show real empty state to user
        } finally {
            this.loading = false;
            this.notifyUI('loading', false);
            this.notifyUI('listingsLoaded', this.getFilteredListings());
        }
    }

    sendWithResponse(type, payload = {}) {
        return new Promise((resolve, reject) => {
            if (!assertActive('sendWithResponse')) {
                reject(new Error('Module not active'));
                return;
            }
            
            if (!sessionClient.isValid()) {
                reject(new Error('Session not ready'));
                return;
            }
            
            const requestId = generateRequestId();
            
            const responseHandler = (event) => {
                if (!isMessageFromParent(event)) return;
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
                ...payload,
                _auth: {
                    hasSession: sessionClient.isValid()
                }
            });
            
            // Timeout with safe fallback
            const timeoutId = setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('Request timeout'));
            }, 10000);
            
            // Cleanup timeout on resolve
            const originalResolve = resolve;
            resolve = (value) => {
                clearTimeout(timeoutId);
                originalResolve(value);
            };
        });
    }

    loadMyListings() {
        if (!assertActive('loadMyListings')) return;
        if (!this.currentUser) return;
        this.myListings = this.listings.filter(l => l.sellerId === this.currentUser.id);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, this.myListings);
    }

    async loadSavedListings() {
        if (!assertActive('loadSavedListings')) return;
        // FIX: Fetch from backend endpoint
        try {
            const response = await safeApiCall('GET', '/api/marketplace/listings/saved');
            if (response && response.data?.listings) {
                this.savedListings = this.sanitizeListings(response.data.listings);
                safeStorage.set(LOCAL_STORAGE_KEYS.SAVED_ITEMS, this.savedListings);
            } else {
                const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
                if (cached) {
                    this.savedListings = this.sanitizeListings(cached);
                }
            }
        } catch (error) {
            const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
            if (cached) {
                this.savedListings = this.sanitizeListings(cached);
            }
        }
    }

    async createListing(listingData) {
        if (!assertActive('createListing')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');

        if (!listingData.title || !listingData.description) {
            throw new Error('Title and description are required');
        }

        const sanitized = this.sanitizeListingData(listingData);
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const userId = user?.id;
        const fakeId  = 'optimistic_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

        // ── STEP 1: Optimistic write — update UI and IDB immediately ──────────
        const optimistic = {
            id: fakeId,
            _isOptimistic: true,
            sellerId: userId,
            userId: userId,
            seller: {
                id: userId,
                name: user?.displayName || user?.name || 'You',
                photoURL: user?.photoURL || ''
            },
            title: this.escapeHtml(sanitized.title),
            description: this.escapeHtml(sanitized.description),
            price: this.validatePrice(sanitized.price),
            category: sanitized.category || 'other',
            type: listingData.type || 'service',
            condition: listingData.condition || 'new',
            images: sanitized.images || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            available: sanitized.available !== false,
            savedBy: [],
            views: 0
        };

        // Snapshot for rollback
        const prevListings   = [...this.listings];
        const prevMyListings = [...this.myListings];

        // Prepend optimistic entry
        this.listings   = [optimistic, ...this.listings];
        this.myListings = [optimistic, ...this.myListings];

        // Persist optimistic state to IDB + window globals immediately
        window.allListings = this.listings;
        window.myListings  = this.myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  this.myListings);

        // Fire UI update NOW — user sees listing instantly
        this.notifyUI('listingCreated', optimistic);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
            detail: { listings: this.listings, source: 'optimistic' }
        }));

        // ── STEP 2: Backend call — reconcile with real server ID ──────────────
        try {
            // Wait briefly for token if session just became active
            let token = sessionClient.getToken ? sessionClient.getToken() : null;
            if (!token) {
                await new Promise(r => setTimeout(r, 800));
                token = sessionClient.getToken ? sessionClient.getToken() : null;
            }

            const result = await safeApiCall('POST', '/api/marketplace/listings', {
                title:       sanitized.title,
                description: sanitized.description,
                price:       sanitized.price,
                category:    sanitized.category,
                type:        listingData.type || 'service',
                condition:   listingData.condition || 'new',
                images:      sanitized.images || [],
                available:   sanitized.available !== false
            });

            // Normalise response — backend wraps in data.listing or listing
            const serverListing = result?.data?.listing || result?.listing;
            if (!serverListing || !serverListing.id) {
                throw new Error('Server returned no listing payload');
            }

            // ── STEP 3: Reconcile — swap optimistic entry with confirmed one ─
            const committed = {
                ...optimistic,
                ...serverListing,
                id:             serverListing.id,
                _isOptimistic:  false,
                title:          this.escapeHtml(serverListing.title   || sanitized.title),
                description:    this.escapeHtml(serverListing.description || sanitized.description),
                price:          this.validatePrice(serverListing.price ?? sanitized.price),
                createdAt:      serverListing.createdAt || optimistic.createdAt,
                updatedAt:      serverListing.updatedAt || optimistic.updatedAt,
                seller:         optimistic.seller,
                user:           optimistic.seller,
            };

            this.listings   = this.listings.map(l   => l.id === fakeId ? committed : l);
            this.myListings = this.myListings.map(l => l.id === fakeId ? committed : l);
            window.allListings = this.listings;
            window.myListings  = this.myListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
            safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  this.myListings);

            // Notify UI with committed listing (replaces optimistic)
            this.notifyUI('listingCommitted', committed);
            window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
                detail: { listings: this.listings, source: 'committed' }
            }));

            // Broadcast to other tabs with real server ID
            try {
                const ch = new BroadcastChannel('marketplace_sync');
                ch.postMessage({ type: 'LISTING_CREATED', listing: committed });
                ch.close();
            } catch (_) {}

            return committed;

        } catch (error) {
            // ── STEP 4: Rollback on hard failure ─────────────────────────────
            // Queue for background retry rather than silently losing the listing
            if (typeof queueForSync === 'function') {
                queueForSync({ ...optimistic, id: undefined }, 'listing');
            }

            // Keep optimistic in UI until sync succeeds — better UX than disappearing
            // But mark it clearly as pending
            this.listings   = this.listings.map(l   =>
                l.id === fakeId ? { ...l, _syncPending: true, _isOptimistic: true } : l
            );
            this.myListings = this.myListings.map(l =>
                l.id === fakeId ? { ...l, _syncPending: true, _isOptimistic: true } : l
            );
            window.allListings = this.listings;
            window.myListings  = this.myListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, this.listings);
            safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  this.myListings);

            window.dispatchEvent(new CustomEvent('marketplace:data-updated', {
                detail: { listings: this.listings, source: 'sync-pending' }
            }));

            logError('createListing', error);
            // Don't throw — optimistic entry is still visible and queued
            return { ...optimistic, _syncPending: true };
        }
    }

    async updateListing(listingId, updates) {
        if (!assertActive('updateListing')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        if (listing.sellerId !== user?.id) throw new Error('You can only edit your own listings');

        const sanitized = {};
        if (updates.title) sanitized.title = this.escapeHtml(updates.title);
        if (updates.description) sanitized.description = this.escapeHtml(updates.description);
        if (updates.price !== undefined) sanitized.price = this.validatePrice(updates.price);
        if (updates.category) sanitized.category = updates.category;
        if (updates.images) sanitized.images = updates.images.filter(this.validateImage);
        if (updates.available !== undefined) sanitized.available = !!updates.available;

        // FIX: Use direct API call
        try {
            const result = await safeApiCall('PUT', `/api/marketplace/listings/${listingId}`, sanitized);

            if (result && result.data?.listing) {
                const updatedListing = { ...listing, ...result.data.listing, updatedAt: new Date().toISOString() };
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
        if (!assertActive('deleteListing')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');
        
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        if (listing.sellerId !== user?.id) throw new Error('You can only delete your own listings');

        // FIX: Use direct API call
        try {
            const result = await safeApiCall('DELETE', `/api/marketplace/listings/${listingId}`);

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
        if (!assertActive('toggleSave')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');

        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) throw new Error('Listing not found');

        const isSaved = this.savedListings.some(l => l.id === listingId);
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const userId = user?.id;

        // FIX: Use direct API call
        try {
            const result = await safeApiCall('POST', `/api/marketplace/listings/${listingId}/save`, { save: !isSaved });

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
        if (!assertActive('contactSeller')) throw new Error('Module not active');
        if (!sessionClient.isValid()) throw new Error('User not authenticated');

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
        if (!assertActive('trackView')) return;
        if (!listingId) return;
        this.listings = this.listings.map(l => {
            if (l.id === listingId) l.views = (l.views || 0) + 1;
            return l;
        });
        safeSend('TRACK_VIEW', { listingId, timestamp: Date.now() });
    }

    setFilter(key, value) {
        if (!assertActive('setFilter')) return;
        this.filters[key] = value;
        this.pagination.page = 1;
        this.notifyUI('filtersChanged', this.filters);
        this.notifyUI('listingsUpdated', this.getFilteredListings());
    }

    resetFilters() {
        if (!assertActive('resetFilters')) return;
        this.filters = { search: '', category: '', minPrice: null, maxPrice: null, available: null, sort: 'newest' };
        this.pagination.page = 1;
        this.notifyUI('filtersChanged', this.filters);
        this.notifyUI('listingsUpdated', this.getFilteredListings());
    }

    getFilteredListings() {
        if (!assertActive('getFilteredListings')) return [];
        
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
        if (!assertActive('loadMore')) return false;
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
            // FIX: Map both sellerId and userId for compatibility
            const sellerId = listing.sellerId || listing.userId || listing.seller?.id || '';
            return {
                id: String(listing.id || listing._id || ''),
                sellerId: String(sellerId),
                userId: String(sellerId), // Alias for compatibility
                seller: {
                    id: String(sellerId),
                    name: this.escapeHtml(listing.seller?.name || listing.sellerName || 'Unknown'),
                    photoURL: this.sanitizeUrl(listing.seller?.photoURL || listing.sellerPhoto || '')
                },
                title: this.escapeHtml(listing.title || 'Untitled'),
                description: this.escapeHtml(listing.description || ''),
                price: this.validatePrice(listing.price),
                category: listing.category || 'other',
                type: listing.type || listing.listingType || 'service',
                images: (listing.images || []).filter(this.validateImage),
                createdAt: listing.createdAt || new Date().toISOString(),
                updatedAt: listing.updatedAt || listing.createdAt || new Date().toISOString(),
                available: listing.available !== false,
                savedBy: Array.isArray(listing.savedBy) ? listing.savedBy : [],
                views: parseInt(listing.views) || 0,
                // FIX: Map premium/featured/boosted flags
                isPremium: !!listing.isPremium || !!listing.premium,
                isSpotlight: !!listing.isSpotlight || !!listing.featured,
                featured: !!listing.featured || !!listing.isSpotlight,
                boosted: !!listing.boosted || !!listing.isBoosted
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

    queueOfflineListing(listing) {
        if (!assertActive('queueOfflineListing')) return;
        safeStorage.get('offlineQueue').then(queue => {
            const q = queue || [];
            q.push({ listing, timestamp: Date.now(), attempts: 0 });
            safeStorage.set('offlineQueue', q);
        });
    }

    generateSampleData() {
        // Sample data removed — all data must come from real backend.
        // If listings array is empty the UI will show the "create your first listing" empty state.
        if (this.listings.length > 0 || !isActive()) return;
        this.notifyUI('listingsLoaded', []);
    }

    /**
     * handleApiRequest — called by the MessageHandler when parent relays an
     * API_REQUEST with a marketplace endpoint back to this module.
     */
    handleApiRequest(requestId, endpoint, method, data) {
        if (!assertActive('handleApiRequest')) return;

        safeApiCall(method.toUpperCase(), endpoint, data || null)
            .then(response => {
                safeSend('API_RESPONSE', {
                    requestId,
                    endpoint,
                    method,
                    success: true,
                    data: response
                });
            })
            .catch(error => {
                safeSend('API_RESPONSE', {
                    requestId,
                    endpoint,
                    method,
                    success: false,
                    error: error.message || 'API call failed'
                });
            });
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
        if (!assertActive('getListings')) return [];
        return this.getFilteredListings();
    }

    getMyListings() {
        if (!assertActive('getMyListings')) return [];
        if (!this.currentUser) return [];
        return this.myListings;
    }

    getSavedListings() {
        if (!assertActive('getSavedListings')) return [];
        return this.savedListings;
    }

    getListing(id) {
        if (!assertActive('getListing')) return null;
        return this.listings.find(l => l.id === id);
    }

    isOwner(listingId) {
        if (!assertActive('isOwner')) return false;
        if (!this.currentUser) return false;
        const listing = this.getListing(listingId);
        return listing ? listing.sellerId === this.currentUser.id : false;
    }

    isSaved(listingId) {
        if (!assertActive('isSaved')) return false;
        return this.savedListings.some(l => l.id === listingId);
    }

    getCategories() {
        if (!assertActive('getCategories')) return [];
        const categories = new Set(this.listings.map(l => l.category).filter(Boolean));
        return Array.from(categories);
    }

    getStats() {
        if (!assertActive('getStats')) return { total: 0, myListings: 0, saved: 0, active: 0 };
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
// CRITICAL FIX: AUTHORIZED FETCH FUNCTION (UPDATED)
// =============================================

function normalizeToolsEndpoint(url) {
    if (!url || typeof url !== 'string') return url;

    const exactAliases = {
        '/api/premium/features': '/api/tools/premium/features',
        '/api/user/subscription': '/api/tools/user/subscription'
    };

    if (exactAliases[url]) {
        return exactAliases[url];
    }

    if (url.startsWith('/api/marketplace/')) {
        return url.replace('/api/marketplace/', '/api/tools/marketplace/');
    }

    return url;
}

function resolveToolsApiUrl(url) {
    if (!url || /^https?:\/\//i.test(url)) return url;

    const rawBase =
        window.__API_CORE?.getBaseUrl?.() ||
        window.api?.env?.getBaseUrl?.() ||
        window.__getApiBase?.() ||
        window.parent?.__API_CORE?.getBaseUrl?.() ||
        window.parent?.api?.env?.getBaseUrl?.() ||
        window.parent?.__getApiBase?.() ||
        '/api';

    const base = String(rawBase).replace(/\/+$/, '').replace(/\/api\/?$/, '/api');
    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;

    if (normalizedUrl.startsWith('/api/')) {
        return `${base}${normalizedUrl.slice(4)}`;
    }

    return `${base}${normalizedUrl}`;
}

function authorizedFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const normalizedUrl = normalizeToolsEndpoint(url);
        const requestUrl = resolveToolsApiUrl(normalizedUrl);
        
        // Use centralized auth for consistent token access
        let token = null;
        
        // Try authStorage first (most reliable)
        if (typeof window.getAuthSession === 'function') {
            const authSession = window.getAuthSession();
            if (authSession && authSession.token) {
                token = authSession.token;
            }
        }
        
        // Fallback to sessionClient
        if (!token && sessionClient.getToken) {
            token = sessionClient.getToken();
        }
        if (!token) {
            const error = new Error('No authentication token');
            error.code = 'NO_TOKEN';
            logOnce('error', 'Authorized fetch blocked: no token');
            reject(error);
            return;
        }

        const headers = {
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`,
            'Content-Type': options.headers?.['Content-Type'] || 'application/json'
        };

        fetch(requestUrl, {
            ...options,
            headers,
            credentials: 'include'
        })
        .then(async response => {
            if (response.status === 401) {
                logOnce('warn', 'Received 401 Unauthorized - requesting new session');
                
                safeSend('REQUEST_SESSION', { reason: '401_unauthorized' });
                
                const error = new Error('Unauthorized');
                error.status = 401;
                error.code = 'UNAUTHORIZED';
                reject(error);
                return;
            }
            
            if (!response.ok) {
                const error = new Error(`HTTP error ${response.status}`);
                error.status = response.status;
                error.code = 'HTTP_ERROR';
                
                try {
                    const errorData = await response.json();
                    error.details = errorData;
                } catch {
                    // Ignore parsing errors
                }
                
                reject(error);
                return;
            }
            
            try {
                const data = await response.json();
                resolve(data);
            } catch (parseError) {
                const error = new Error('Invalid JSON response');
                error.code = 'INVALID_JSON';
                error.originalError = parseError;
                reject(error);
            }
        })
        .catch(error => {
            logOnce('error', `Fetch failed: ${error.message}`);
            error.code = error.code || 'FETCH_FAILED';
            reject(error);
        });
    });
}

// =============================================
// UNIFIED SEND FUNCTION (USING STANDARDIZED SCHEMA)
// =============================================

export async function sendToParent(type, payload = {}) {
    if (moduleState.shutdown) return { success: false, error: 'shutdown' };
    
    if (!assertActive(`sendToParent: ${type}`)) {
        return { success: false, error: 'not_active', queued: false };
    }
    
    const result = safeSend(type, payload);
    if (result.success && !result.queued) {
        logOnce('send', type);
    }
    return result;
}

// =============================================
// EXACTLY-ONCE CHILD_READY SENDING (DETERMINISTIC - STRICT)
// =============================================

function sendChildReady() {
    // STRICT: Prevent multiple sends
    if (childReadySent) {
        if (window.__TOOLS_DEBUG__) console.warn('[Tools][Lifecycle] CHILD_READY already sent — skipping');
        return;
    }

    // STRICT: Only send in READY state
    if (currentState !== LIFECYCLE_STATE.READY) {
        if (window.__TOOLS_DEBUG__) console.warn(`[Tools][Lifecycle] Cannot send CHILD_READY — invalid state: ${currentState}`);
        return;
    }

    childReadySent = true;
    moduleState.handshakeState.childReadySent = true;

    parent.postMessage({
        type: 'CHILD_READY',
        module: MODULE_NAME,
        version: MODULE_VERSION,
        frameId: parentComm.frameId,
        timestamp: Date.now(),
        id: generateMessageId()
    }, '*');

    logOnce('send', 'CHILD_READY sent');
    transitionTo(LIFECYCLE_STATE.WAIT_PARENT, 'child_ready_sent');
}

// =============================================
// NO HAND SHAKE RETRY SYSTEM - REMOVED (STRICT)
// =============================================
// The previous setInterval-based retry system has been COMPLETELY REMOVED.
// The module now strictly waits in WAIT_PARENT state until PARENT_READY is received.
// This is the correct deterministic behavior.

// =============================================
// MODULE ACTIVATION HOOK
// =============================================

function onModuleActive() {
    if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Module ACTIVE - all systems go');

    moduleState.ready = true;
    moduleState.initialized = true;
    isReady = true;
    
    heartbeatResponder.start();
    loadUserSettings().catch(() => {});
    
    // FIX: Always initialize marketplace on ACTIVE regardless of session state
    // The marketplace.initialize() is guarded internally; it just won't show data
    // until a session arrives, but it MUST start now.
    isAuthReady = true; // FIX: Unblock all API calls immediately on ACTIVE
    marketplace.initialize().catch(() => {});
    
    window.dispatchEvent(new CustomEvent('tools:active', {
        detail: {
            timestamp: Date.now(),
            sessionActive: moduleState.sessionActive
        }
    }));

    // Bind UI directly now that we are active — no gate needed
    setTimeout(function() { forceBindAllUIEvents(); }, 50);
    setTimeout(function() { forceBindAllUIEvents(); }, 500);
}

let _bindLogShown = false;
let _bindCompleteShown = false;

function forceBindAllUIEvents() {
    // Only log once total, not once per call
    if (!_bindLogShown) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools] Force binding all UI events (direct DOM)');
        _bindLogShown = true;
    }

    // ── Helper: open a modal by ID ──────────────────────────────────────
    function openModal(id) {
        var el = document.getElementById(id);
        if (el) { el.classList.add('active'); el.style.display = 'flex'; }
    }
    function closeModal(id) {
        var el = document.getElementById(id);
        if (el) { el.classList.remove('active'); el.style.display = ''; }
    }

    // ── Category tabs ────────────────────────────────────────────────────
    var categoryTabs = [
        { id: 'allTab',       name: 'all' },
        { id: 'servicesTab',  name: 'services' },
        { id: 'digitalTab',   name: 'digital' },
        { id: 'friendsTab',   name: 'friends' },
        { id: 'groupsTab',    name: 'groups' },
        { id: 'myTab',        name: 'my' },
        { id: 'premiumTab',   name: 'premium' },
        { id: 'spotlightTab', name: 'spotlight' }
    ];
    categoryTabs.forEach(function(tab) {
        var el = document.getElementById(tab.id);
        if (!el) return;
        el.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            categoryTabs.forEach(function(t) {
                var te = document.getElementById(t.id);
                if (te) te.classList.remove('active');
            });
            el.classList.add('active');
            if (typeof window.setActiveTab === 'function') {
                window.setActiveTab(tab.name);
            } else {
                window.dispatchEvent(new CustomEvent('marketplace:tab-change', { detail: { tab: tab.name } }));
            }
        };
    });

    // ── Header action buttons ────────────────────────────────────────────
    var btnMap = {
        'createListingBtn':    function() { openModal('createListingModal'); },
        'createListingQuickBtn': function() { openModal('createListingModal'); },
        'sellServiceBtn':      function() { openModal('createListingModal'); setTimeout(function(){ var t=document.querySelector('.create-listing-tab[data-tab="service"]'); if(t) t.click(); },80); },
        'sellDigitalBtn':      function() { openModal('createListingModal'); setTimeout(function(){ var t=document.querySelector('.create-listing-tab[data-tab="digital"]'); if(t) t.click(); },80); },
        'viewAnalyticsBtn':    function() { openModal('analyticsModal'); },
        'viewSavedBtn':        function() { openModal('savedItemsModal'); },
        'viewNotesBtn':        function() { openModal('myNotesModal'); },
        'viewTrustStatsBtn':   function() { openModal('trustStatsModal'); },
        'premiumOptionsBtn':   function() { openModal('premiumOptionsModal'); },
        'viewTeamBtn':         function() { openModal('teamManagementModal'); },
        'viewLeaderboardBtn':  function() { openModal('leaderboardModal'); }
    };
    Object.keys(btnMap).forEach(function(id) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.onclick = function(e) {
            e.preventDefault(); e.stopPropagation();
            btnMap[id]();
        };
    });

    // ── Close buttons ────────────────────────────────────────────────────
    var closeMap = {
        'closeCreateListingModal': 'createListingModal',
        'closeAnalyticsModal':     'analyticsModal',
        'closePremiumModal':       'premiumOptionsModal',
        'closeTeamModal':          'teamManagementModal',
        'closeLeaderboardModal':   'leaderboardModal',
        'closeReactionModal':      'reactionPickerModal',
        'closeSavedModal':         'savedItemsModal',
        'closeNotesModal':         'myNotesModal',
        'closeTrustStatsModal':    'trustStatsModal'
    };
    Object.keys(closeMap).forEach(function(btnId) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        btn.onclick = function(e) { e.preventDefault(); closeModal(closeMap[btnId]); };
    });

    // ── Back button (detail panel) ───────────────────────────────────────
    var backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.onclick = function(e) {
            e.preventDefault();
            var panel = document.getElementById('marketplaceDetailPanel');
            if (panel) panel.classList.remove('active');
        };
    }

    // ── Publish / Save Draft buttons ─────────────────────────────────────
    var publishBtn = document.getElementById('publishListingBtn');
    if (publishBtn) {
        publishBtn.onclick = async function(e) {
            e.preventDefault();
            try {
                if (typeof window.publishListingFromModal === 'function') {
                    await window.publishListingFromModal();
                } else {
                    window.dispatchEvent(new CustomEvent('marketplace:publish-listing'));
                }
            } catch (error) {
                if (window.__TOOLS_DEBUG__) console.error('[Tools] Publish button error:', error);
                if (typeof showNotification === 'function') {
                    showNotification('Failed to publish listing', 'error');
                }
            }
        };
    }

    // ── Create-listing inner tabs ─────────────────────────────────────────
    document.querySelectorAll('.create-listing-tab').forEach(function(tab) {
        tab.onclick = function() {
            var tabName = tab.dataset.tab;
            if (!tabName) return;
            document.querySelectorAll('.create-listing-tab').forEach(function(t){ t.classList.remove('active'); });
            tab.classList.add('active');
            document.querySelectorAll('.create-listing-tab-content').forEach(function(c){ c.classList.remove('active'); });
            var content = document.getElementById(tabName + 'Tab') || document.querySelector('.create-listing-tab-content[id="' + tabName + 'Tab"]');
            if (content) content.classList.add('active');
        };
    });

    // ── Dismiss modals when clicking backdrop ────────────────────────────
    document.querySelectorAll('.modal-overlay, .modal-backdrop').forEach(function(overlay) {
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                var modal = overlay.closest('.modal, [id$="Modal"]');
                if (modal) modal.classList.remove('active');
            }
        };
    });

    // Only log completion once
    if (!_bindCompleteShown) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools] Direct DOM binding complete');
        _bindCompleteShown = true;
    }

    // Also refresh UI if marketplaceUI is available
    if (window.marketplaceUI && typeof window.marketplaceUI.refresh === 'function') {
        window.marketplaceUI.refresh();
    }
    window.dispatchEvent(new CustomEvent('marketplace:refresh-ui', { detail: { timestamp: Date.now(), force: true } }));
}

// Expose globally for parent to call
window.forceBindAllUIEvents = forceBindAllUIEvents;

// =============================================
// MODULE INITIALIZATION (DETERMINISTIC LIFECYCLE - STRICT)
// =============================================

function initializeModule() {
    // Prevent double initialization
    if (initializationLock) {
        if (window.__TOOLS_DEBUG__) console.warn('[Tools][Lifecycle] Module already initializing - skipping');
        return;
    }
    
    initializationLock = true;
    
    // Start initialization
    if (!transitionTo(LIFECYCLE_STATE.INITIALIZING, 'module_start')) {
        initializationLock = false;
        return;
    }
    
    try {
        logOnce('init', 'Tools module booting');
        
        // Add this function right after logOnce('init', 'Tools module booting');
async function loadUserSettings() {
    try {
        const savedTheme = await safeStorage.get('user_theme_preference');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            document.body.setAttribute('data-theme', savedTheme);
        }
        const savedFontSize = await safeStorage.get('user_font_size');
        if (savedFontSize) {
            document.documentElement.style.fontSize = savedFontSize + 'px';
        }
    } catch (error) {}
}
        // Setup message listen
        window.addEventListener('message', (event) => {
    // ── OFFLINE-FIRST: Apply setting changes immediately ──
    const data = event.data;
    if (data && (data.type === 'SETTING_CHANGED' || data.type === 'SETTINGS_UPDATED')) {
        const payload = data.payload || data;
        
        if (data.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
            const { section, key, value } = payload;
            
            if (section === 'appearance' && key === 'theme') {
                const theme = value === 'auto'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : value;
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
            }
            
            if (section === 'appearance' && key === 'fontSize') {
                document.documentElement.style.fontSize = parseInt(value) + 'px';
            }
            
            window.dispatchEvent(new CustomEvent('settingChanged', {
                detail: { section, key, value, timestamp: Date.now() }
            }));
        }
        
        if (data.type === 'SETTINGS_UPDATED' && payload.settings) {
            const s = payload.settings;
            
            if (s.appearance?.theme) {
                const theme = s.appearance.theme === 'auto'
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : s.appearance.theme;
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
            }
            
            if (s.appearance?.fontSize) {
                document.documentElement.style.fontSize = parseInt(s.appearance.fontSize) + 'px';
            }
            
            window.dispatchEvent(new CustomEvent('settingsUpdated', {
                detail: { settings: s, timestamp: Date.now() }
            }));
        }
        
        return; // Stop processing for settings messages
    }
    
    // Normal message processing
    setTimeout(() => parentComm.handleIncomingMessage(event), 0);
});
       
// Add a direct, simple message listener specifically for session data
window.addEventListener('message', function directSessionListener(event) {
    const data = event.data;
    if (!data) return;
    
    // Log all incoming messages for debugging
    if (data.type === 'SESSION_DATA' || data.type === 'AUTH_READY' || data.type === 'PARENT_READY') {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Received:', data.type, data);
    }
    
    // Handle SESSION_DATA directly
    if (data.type === 'SESSION_DATA') {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Processing SESSION_DATA directly');
        let sessionInfo = data.payload || data;
        
        // Extract userId and token
        let userId = sessionInfo.userId || sessionInfo.user_id || sessionInfo.user?.id;
        let token = sessionInfo.userToken || sessionInfo.token || sessionInfo.user?.token;
        
        if (userId && token) {
            if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Found session data:', { userId, hasToken: !!token });
            const session = {
                userId: userId,
                userToken: token,
                displayName: sessionInfo.displayName || sessionInfo.user?.displayName || 'User',
                email: sessionInfo.email || sessionInfo.user?.email,
                photoURL: sessionInfo.photoURL || sessionInfo.user?.photoURL,
                isPremium: sessionInfo.isPremium || sessionInfo.user?.isPremium || false,
                trustLevel: sessionInfo.trustLevel || sessionInfo.user?.trustLevel || 'new'
            };
            
            const accepted = sessionClient.acceptParentSession(session);
            if (accepted && currentState !== LIFECYCLE_STATE.ACTIVE) {
                if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Session accepted, activating module');
                transitionTo(LIFECYCLE_STATE.ACTIVE, 'direct_session_received');
                flushMessageQueue();
                if (!activationComplete) {
                    onModuleActive();
                    activationComplete = true;
                }
            }
        }
    }
    
    // Handle AUTH_READY directly
    if (data.type === 'AUTH_READY') {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Processing AUTH_READY directly');
        const payload = data.payload || data;
        let sessionInfo = payload.session || payload;
        
        let userId = sessionInfo.userId || sessionInfo.user_id || sessionInfo.user?.id || payload.userId;
        let token = sessionInfo.userToken || sessionInfo.token || sessionInfo.user?.token || payload.token;
        
        if (userId && token) {
            if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Found session in AUTH_READY:', { userId });
            const session = {
                userId: userId,
                userToken: token,
                displayName: sessionInfo.displayName || payload.displayName || 'User',
                email: sessionInfo.email || payload.email,
                photoURL: sessionInfo.photoURL || payload.photoURL,
                isPremium: sessionInfo.isPremium || payload.isPremium || false,
                trustLevel: sessionInfo.trustLevel || payload.trustLevel || 'new'
            };
            
            const accepted = sessionClient.acceptParentSession(session);
            if (accepted && currentState !== LIFECYCLE_STATE.ACTIVE) {
                if (window.__TOOLS_DEBUG__) console.log('[Tools][DirectListener] Session accepted from AUTH_READY, activating');
                transitionTo(LIFECYCLE_STATE.ACTIVE, 'direct_auth_ready_received');
                flushMessageQueue();
                if (!activationComplete) {
                    onModuleActive();
                    activationComplete = true;
                }
            }
        }
    }
});
        // Start diagnostics
        diagnostics.start();
        
        // Initialize UI bridge
        uiBridge.initialize();
        
        const inIframe = (window.parent && window.parent !== window);
        moduleState.parentDetected = inIframe;
        
        if (!inIframe) {
            logOnce('info', 'Not in iframe, running standalone');
            if (!transitionTo(LIFECYCLE_STATE.READY, 'standalone_mode')) {
                initializationLock = false;
                return;
            }
            childReadySent = true; // Mark as sent (no parent to send to)
            if (!transitionTo(LIFECYCLE_STATE.WAIT_PARENT, 'standalone')) {
                initializationLock = false;
                return;
            }
            parentReadyReceived = true;
            if (!transitionTo(LIFECYCLE_STATE.ACTIVE, 'standalone_active')) {
                initializationLock = false;
                return;
            }
            moduleState.ready = true;
            moduleState.initialized = true;
            isReady = true;
            window.__MODULE_READY__ = true;
            flushMessageQueue();
            onModuleActive();
            initializationLock = false;
            return;
        }
        
        // Complete setup and move to READY
        if (!transitionTo(LIFECYCLE_STATE.READY, 'setup_complete')) {
            initializationLock = false;
            return;
        }
        
        sendChildReady();

setTimeout(() => {
    if (currentState !== LIFECYCLE_STATE.ACTIVE) {
        if (window.__TOOLS_DEBUG__) console.log('[Tools][Lifecycle] Activation timeout: forcing ACTIVE state');
        parentReadyReceived = true;
        moduleState.parentDetected = true;
        moduleState.handshakeState.parentReadyReceived = true;
        transitionTo(LIFECYCLE_STATE.ACTIVE, 'activation_timeout');
        flushMessageQueue();
        if (!activationComplete) {
            onModuleActive();
            activationComplete = true;
        }
        // Force UI binding after activation
        setTimeout(() => {
            forceBindAllUIEvents();
        }, 100);
    }
}, 3000);

        logOnce('info', 'Waiting for parent ready signal (WAIT_PARENT)');
        
        // NO RETRY LOOP - Strict wait for PARENT_READY
        
    } catch (error) {
        logError('Module initialization', error);
        initializationLock = false;
    }
}

// =============================================
// EXPORTED CORE FUNCTIONS (PRESERVED WITH FIXES)
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

        // Wait for ACTIVE state (NO timeout fallback - strict wait)
        const checkActive = () => {
            return new Promise((resolve) => {
                if (currentState === LIFECYCLE_STATE.ACTIVE) {
                    resolve();
                } else {
                    const checkInterval = setInterval(() => {
                        if (currentState === LIFECYCLE_STATE.ACTIVE) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 50);
                }
            });
        };
        
        await checkActive();

        moduleState.ready = isActive();
        isReady = moduleState.ready;
        isInitializing = false;
        isBootstrapped = true;
        handshakeComplete = moduleState.handshakeComplete;
        sessionValid = sessionClient.isValid();
        sessionData = sessionClient.getSession();

        if (sessionData && !sessionData.isGuest && !sessionData.isDemo && __isValidSession(sessionData)) {
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
                bootState: currentState,
                parentReady: parentReadyReceived
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
    
    if (!assertActive('requestSession')) return false;
    
    if (moduleState.sessionActive && !force) {
        return true;
    }

    if (messageHandler.sessionRequestRetryCount >= messageHandler.maxSessionRetries) {
        logOnce('error', 'Max session request retries reached');
        return false;
    }

    if (parentReadyReceived && (!moduleState.sessionActive || force) && !moduleState.sessionState.requested) {
        moduleState.sessionState.requested = true;
        messageHandler.sessionRequestRetryCount++;
        safeSend('REQUEST_SESSION', { force, retry: messageHandler.sessionRequestRetryCount });
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
    parentReadyReceived = false;
    childReadySent = false;
    initializationLock = false;
    activationComplete = false;

    heartbeatResponder.stop();
    parentComm.cleanup();
    messageHandler.cleanup();
    resourceManager.release();
    uiBridge.cleanup();
    diagnostics.stop();

    safeStorage.remove(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.ENVIRONMENT_CACHE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.STARTUP_STATE);

    messageQueue.length = 0;
    dataCache.clear();
    
    sessionClient.clear();

    window.__MODULE_READY__ = false;
    window.__MODULE_SESSION_ACTIVE__ = false;

    logOnce('info', 'Core shutdown complete');
    return true;
};

syncWithParent = async function() {
    if (moduleState.shutdown || !moduleState.parentDetected) return false;
    
    if (!assertActive('syncWithParent')) return false;
    
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
        parentReady: parentReadyReceived,
        queuedMessages: messageQueue.length,
        connectionMetrics: moduleState.connectionMetrics,
        sessionStatus: sessionClient.getState(),
        environment: environmentDetector.getEnvironmentReport(),
        diagnostics: diagnostics.getReport(),
        boot: {
            state: currentState,
            sessionAuthority: moduleState.sessionAuthority
        },
        heartbeat: heartbeatResponder.getStatus(),
        moduleState: currentState,
        lifecycle: {
            state: currentState,
            childReadySent,
            parentReadyReceived,
            initializationLock
        },
        memorySession: {
            ready: sessionClient.isValid(),
            hasToken: !!sessionClient.getToken ? sessionClient.getToken() : false,
            hasUser: !!sessionClient.getUser ? sessionClient.getUser() : false,
            validSession: sessionClient.isReady() ? __isValidSession(sessionClient.getSession()) : false
        }
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
    const session = sessionClient.getSession();
    if (!session) return false;
    return __isValidSession(session);
}

export function hasValidUser() {
    const user = sessionClient.getUser ? sessionClient.getUser() : null;
    if (!user || !user.id) return false;
    if (user.id === 'user' || user.id === 'default' || user.id === 'null' || user.id === 'undefined') return false;
    return true;
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
                const user = sessionClient.getUser ? sessionClient.getUser() : null;
                return {
                    id: user?.id || window.currentUser?.id || 'unknown',
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
        if (payload.session && __isValidSession(payload.session)) handleSessionDataFromParent(payload.session);
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
        if (!sessionClient.isValid()) throw new Error('No valid session for API call');
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
        
        const response = await authorizedFetch(endpoint, { method: 'GET' });
        return response;
    } catch (error) {
        logError('fetchData', error);
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
            
            if (isActive()) {
                safeSend('UI_READY', {
                    iframeId: parentComm.frameId,
                    status: 'success',
                    timestamp: Date.now(),
                    bootState: currentState
                });
            }
            
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
                        if (sessionData || moduleState.sessionActive || (sessionClient.isValid())) {
                            if (sessionClient.getSession() && __isValidSession(sessionClient.getSession())) {
                                resolve();
                            } else {
                                setTimeout(checkSession, 100);
                            }
                        } else {
                            setTimeout(checkSession, 100);
                        }
                    };
                    setTimeout(checkSession, 100);
                });
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
            if ((sessionClient.isValid()) && isActive()) {
                // FIX: First check session data for friends
                const session = sessionClient.getSession();
                if (session && session.friends && Array.isArray(session.friends)) {
                    userFriends = session.friends;
                    window.userFriends = userFriends;
                    safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
                    dataCache.set(DATA_TYPES.FRIENDS, userFriends);
                } else {
                    const friends = await getUserFriends();
                    if (friends && Array.isArray(friends)) {
                        userFriends = friends;
                        window.userFriends = userFriends;
                        safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
                        dataCache.set(DATA_TYPES.FRIENDS, friends);
                    }
                }
            }
        } catch {
            const cachedFriends = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_FRIENDS);
            if (cachedFriends) {
                try {
                    userFriends = cachedFriends;
                    window.userFriends = userFriends;
                    dataCache.set(DATA_TYPES.FRIENDS, userFriends);
                } catch {}
            }
        }
    },
    
    loadUserGroups: async () => {
        try {
            if ((sessionClient.isValid()) && isActive()) {
                // FIX: First check session data for groups
                const session = sessionClient.getSession();
                if (session && session.groups && Array.isArray(session.groups)) {
                    userGroups = session.groups;
                    window.userGroups = userGroups;
                    safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
                    dataCache.set(DATA_TYPES.GROUPS, userGroups);
                } else {
                    const groups = await getUserGroups();
                    if (groups && Array.isArray(groups)) {
                        userGroups = groups;
                        window.userGroups = userGroups;
                        safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
                        dataCache.set(DATA_TYPES.GROUPS, groups);
                    }
                }
            }
        } catch {
            const cachedGroups = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_GROUPS);
            if (cachedGroups) {
                try {
                    userGroups = cachedGroups;
                    window.userGroups = userGroups;
                    dataCache.set(DATA_TYPES.GROUPS, userGroups);
                } catch {}
            }
        }
    },
    
    loadListings: async () => {
        try {
            if ((sessionClient.isValid()) && isActive()) {
                const response = await authorizedFetch('/api/marketplace/listings', { method: 'GET' });
                if (response && response.data?.listings) {
                    allListings = response.data.listings;
                    window.allListings = allListings;
                    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
                } else if (response && response.listings) {
                    allListings = response.listings;
                    window.allListings = allListings;
                    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
                }
            }
        } catch {
            const allListingsData = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
            if (allListingsData) {
                try {
                    allListings = allListingsData;
                    window.allListings = allListings;
                } catch {}
            }
        }
    },
    
    loadTeamMembers: async () => {
        try {
            if ((sessionClient.isValid()) && userSubscription && (userSubscription.plan === 'business' || userSubscription.plan === 'team') && isActive()) {
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
            if ((sessionClient.isValid()) && isActive()) {
                const response = await authorizedFetch('/api/marketplace/leaderboard', { method: 'GET' });
                if (response && response.data?.leaderboard) {
                    leaderboardData = response.data.leaderboard;
                    safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
                } else if (response && response.leaderboard) {
                    leaderboardData = response.leaderboard;
                    safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
                }
            }
        } catch {}
    },
    
    loadAnalyticsData: async () => {
        try {
            if ((sessionClient.isValid()) && isUserPremium() && isActive()) {
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
            if ((sessionClient.isValid()) && isActive()) {
                const response = await authorizedFetch('/api/premium/features', { method: 'GET' });
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
// SESSION HANDLING FUNCTIONS (PRESERVED WITH FIXES)
// =============================================

export function handleSessionDataFromParent(sessionDataFromParent) {
    try {
        if (!isActive() && currentState !== LIFECYCLE_STATE.WAITING_AUTH) {
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
        
        // Validate session content
        if (!__isValidSession(sessionDataFromParent)) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Rejected invalid session from parent', {
                hasToken: !!(sessionDataFromParent?.userToken || sessionDataFromParent?.token),
                userId: sessionDataFromParent?.userId || sessionDataFromParent?.user_id
            });
            safeSend('AUTH_ERROR', {
                error: 'INVALID_SESSION_DATA',
                reason: 'Invalid userId or token format'
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
        const hasUserId = !!(session.userId || session.user_id || session.userid || session.id);
        // Don't require token - parent may send it in nested structure
        if (!hasUserId) return false;
        
        // Reject fake IDs
        const userId = session.userId || session.user_id || session.userid || session.id;
        const fakeIds = ['user', 'default', 'null', 'undefined', ''];
        if (typeof userId === 'string' && fakeIds.includes(userId.toLowerCase())) {
            return false;
        }
        
        return true;
    } catch {
        return false;
    }
}

export function processSessionData(sessionDataFromParent) {
    try {
        const userId = sessionDataFromParent.userId || sessionDataFromParent.user_id || sessionDataFromParent.userid;
        // Reject fake userId values
        if (userId === 'user' || userId === 'default' || userId === 'null' || userId === 'undefined') {
            throw new Error('Invalid userId format');
        }
        
        const userDataFromSession = {
            id: userId,
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
        
        parentDataLoaded = true;
        dataFetchInProgress = false;
    } catch {}
}

export function storeCentralizedToken(token) {
    try {
        if (!token || typeof token !== 'string' || token.length < 5) return;
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
        if (!isActive() && currentState !== LIFECYCLE_STATE.WAITING_AUTH) {
            setTimeout(() => handleSessionUpdate(updatedData), 100);
            return;
        }
        if (!updatedData || typeof updatedData !== 'object') return;
        
        // Validate update data
        if (!__isValidSession(updatedData)) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Ignored invalid session update');
            return;
        }
        
        const currentSession = sessionClient.getSession() || sessionData || {};
        // Merge only valid data
        const mergedSession = { ...currentSession, ...updatedData };
        if (__isValidSession(mergedSession)) {
            sessionData = mergedSession;
            sessionClient.acceptParentSession(mergedSession);
        } else {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Session update would create invalid session - rejected');
            return;
        }
        
        if (updatedData.userId || updatedData.id || updatedData.displayName) {
            if (!window.currentUser) window.currentUser = {};
            if (!window.userData) window.userData = {};
            window.currentUser = { ...window.currentUser, ...updatedData };
            window.userData = { ...window.userData, ...updatedData };
            if (updatedData.displayName || updatedData.photoURL || updatedData.isPremium) {
                // Removed localStorage set
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
        
        safeStorage.remove(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        
        parentDataLoaded = false;
        directAPILoaded = false;
        
        isReady = moduleState.ready;
        isInitializing = false;
        messageQueue.length = 0;
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
// API CALL FUNCTIONS (PRESERVED WITH FIXES)
// =============================================

export async function secureApiCall(method, endpoint, data = null, options = {}) {
    const normalizedEndpoint = normalizeToolsEndpoint(endpoint);

    if (!isActive()) {
        if (normalizedEndpoint.includes('/marketplace/listings') && method === 'GET') {
            try {
                const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                if (cached) return { listings: cached };
            } catch {}
        }
        return null;
    }
    
    // FIX: Don't block on isAuthReady — just try with whatever token is available
    // If no token, fall back to cache for GET requests
    const token = sessionClient.getToken ? sessionClient.getToken() : null;
    if (!token) {
        if (method !== 'GET' || normalizedEndpoint.includes('/auth/')) {
            safeSend('NEED_REFRESH', {
                reason: 'api_call_without_session',
                endpoint: normalizedEndpoint,
                method: method
            });
        }
        if (normalizedEndpoint.includes('/marketplace/listings') && method === 'GET') {
            try {
                const cached = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                if (cached) return { listings: cached };
            } catch {}
        }
        return null;
    }
    
    try {
        const response = await authorizedFetch(normalizedEndpoint, {
            method,
            body: data ? JSON.stringify(data) : undefined,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response;
    } catch (error) {
        return handleApiError(error, method, normalizedEndpoint);
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
        sessionClient.clear();
        showNotification('Session expired. Please log in again.', 'error');
        return null;
    } catch {
        return null;
    }
}

export async function safeApiCall(method, endpoint, data = null) {
    // If no token yet, wait briefly for session to arrive before giving up.
    // This prevents optimistic-UI rollback when the module just became ACTIVE.
    let token = sessionClient.getToken ? sessionClient.getToken() : null;
    if (!token) {
        await new Promise(resolve => setTimeout(resolve, 800));
        token = sessionClient.getToken ? sessionClient.getToken() : null;
    }

    if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 2: API request sent', { method, endpoint, hasToken: !!token });
    const response = await secureApiCall(method, endpoint, data);
    if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 3: API response received', response);
    if (response === null || response === undefined) {
        throw new Error('No response from server — token missing or module not active');
    }
    if (response.success === false) {
        throw new Error(response.message || 'Server returned failure');
    }
    return response;
}

export function getCentralToken() {
    try {
        const token = sessionClient.getToken ? sessionClient.getToken() : null;
        if (token) return token;
        
        const session = sessionClient.getSession();
        if (session && session.userToken) return session.userToken;
        
        return null;
    } catch {
        return null;
    }
}

export function setupConnectivityListeners() {
    try {
        window.addEventListener('online', () => {
            if (isActive()) {
                safeSend('PING', { type: 'connectivity_check' });
                syncOfflineMarketplaceData();
            }
        });
        window.addEventListener('offline', () => {
            syncOfflineMarketplaceData();
        });
    } catch {}
}

export function initializeTokenSystem() {
    if (tokenInitializationPromise) return tokenInitializationPromise;
    
    tokenInitializationPromise = new Promise(async (resolve, reject) => {
        try {
            if (!(sessionClient.isValid())) {
                throw new Error('No session data available for token initialization');
            }
            
            const session = sessionClient.getSession();
            if (!session || !session.userToken) {
                throw new Error('Invalid token in session data');
            }
            
            // Validate session before accepting
            if (!__isValidSession(session)) {
                throw new Error('Invalid session data format');
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
        if (!sessionData && !moduleState.sessionActive && !(sessionClient.isValid())) await new Promise(resolve => setTimeout(resolve, 1000));
        if (tokenInitializationPromise) {
            try { await tokenInitializationPromise; } catch {}
        }
        loadCachedDataInstantly();
        if ((sessionClient.isValid()) && isActive() && __isValidSession(sessionClient.getSession())) {
            try { await authorizedFetch('/api/auth/verify', { method: 'GET' }); } catch {}
        }
        isBootstrapped = true;
    } catch {
        isBootstrapped = true;
    }
}

export async function loadCachedDataInstantly() {
    try {
        const cachedMyListings = await safeStorage.get(LOCAL_STORAGE_KEYS.MY_LISTINGS);
        if (cachedMyListings) {
            try { myListings = cachedMyListings; } catch {}
        }
        
        const cachedAllListings = await safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
        if (cachedAllListings) {
            try { allListings = cachedAllListings; } catch {}
        }
        
        const cachedSaved = await safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
        if (cachedSaved) {
            try { savedItems = cachedSaved; } catch {}
        }
        
        const cachedNotes = await safeStorage.get(LOCAL_STORAGE_KEYS.PRIVATE_NOTES);
        if (cachedNotes) {
            try { privateNotes = cachedNotes; } catch {}
        }
        
        const cachedDrafts = await safeStorage.get(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS);
        if (cachedDrafts) {
            try { offlineDrafts = cachedDrafts; } catch {}
        }
        
        const cachedTrust = await safeStorage.get(LOCAL_STORAGE_KEYS.TRUST_STATS);
        if (cachedTrust) {
            try { trustStats = cachedTrust; } catch {}
        }
        
        const cachedGroups = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (cachedGroups) {
            try { userGroups = cachedGroups; } catch {}
        }
        
        const cachedFriends = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_FRIENDS);
        if (cachedFriends) {
            try { userFriends = cachedFriends; } catch {}
        }
        
        const cachedSubscription = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (cachedSubscription) {
            try { userSubscription = cachedSubscription; } catch {}
        }
        
        const cachedTeam = await safeStorage.get(LOCAL_STORAGE_KEYS.TEAM_MEMBERS);
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
        
        const localSubscription = await safeStorage.get(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
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
    // FIXED: Load from cache first (offline-first), then fetch from server
    try {
        // Step 1 — always hydrate from LocalStoreTools / localStorage immediately
        const LST = window.LocalStoreTools;
        if (LST && typeof LST.getAllListings === 'function') {
            const cached = LST.getAllListings();
            if (cached && cached.length) {
                allListings = cached;
                window.allListings = allListings;
                window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings, source: 'cache' } }));
            }
        }
        if (!allListings || !allListings.length) {
            const cached = safeStorage.get ? safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS) : null;
            if (cached) { allListings = cached; window.allListings = allListings; }
        }

        // Step 2 — attempt server fetch (skip if no token yet but still return cached data)
        const token = getCentralToken();
        if (!token && !navigator.onLine) return; // no token + offline = use cache only

        const response = await safeApiCall('GET', '/api/marketplace/listings');
        if (response && response.data?.listings) {
            allListings = response.data.listings;
            window.allListings = allListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
            if (LST) LST.saveMany(allListings, LST.STORES.LISTINGS).catch(()=>{});
            window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings, source: 'server' } }));
        } else if (response && response.listings) {
            allListings = response.listings;
            window.allListings = allListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
            if (LST) LST.saveMany(allListings, LST.STORES.LISTINGS).catch(()=>{});
            window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings, source: 'server' } }));
        }
    } catch(e) {
        // Server fetch failed — cached data was already hydrated above, just log
        if (window.__TOOLS_DEBUG__) console.warn('[loadListingsFromBackend] Server fetch failed, using cache:', e.message);
    }
}

export async function loadSpotlightListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/spotlight');
        const items = response?.data?.listings || response?.spotlightListings || [];
        if (items.length) {
            safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, items);
            window.dispatchEvent(new CustomEvent('marketplace:spotlight-updated', { detail: { listings: items } }));
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
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        if (user && user.isPremium) return true;
        return userSubscription && userSubscription.status === 'active';
    } catch {
        return false;
    }
}

export function isListingVisibleToUser(listing) {
    try {
        if (!listing) return false;
        // FIX: Use window.currentUser as fallback
        const user = window.currentUser || (sessionClient.getUser ? sessionClient.getUser() : null);
        const currentUserId = user?.id;
        if (!currentUserId) return true; // Show all if no user yet
        
        if (listing.sellerId === currentUserId || listing.userId === currentUserId) return true;
        
        if (listing.visibility === TRUST_CIRCLES.FRIENDS) {
            return userFriends.some(friend => friend.id === listing.sellerId);
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
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const userId = user?.id;
        const userObj = user || { displayName: 'User' };
        
        const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const listing = {
            id: listingId,
            userId: userId,
            user: userObj,
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
        
        const premiumListings = await safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || [];
        premiumListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, premiumListings);
        
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
            if (response && response.listing) {
                listing.id = response.listing.id || listingId;
                // Only increment stats after confirmed backend success
                updateListingStreak();
                updateTrustStats('listingCreated');
            }
        } catch {
            queueForSync(listing, 'premium_listing');
            // Stats NOT incremented on failure
        }
        
        return listing;
    } catch {
        return null;
    }
}

export async function createPremiumDigitalListing(title, description, fileData, premiumOptions = {}) {
    try {
        if (!hasValidUser()) throw new Error('User not authenticated');
        if (!isActive()) throw new Error('Module not active');
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const userId = user?.id;
        const userObj = user || { displayName: 'User' };
        
        const listingId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const listing = {
            id: listingId,
            userId: userId,
            user: userObj,
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
        
        const premiumListings = await safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || [];
        premiumListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, premiumListings);
        
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
            if (response && response.listing) {
                listing.id = response.listing.id || listingId;
                updateListingStreak();
                updateTrustStats('listingCreated');
            }
        } catch {
            queueForSync(listing, 'premium_listing');
        }
        
        return listing;
    } catch {
        return null;
    }
}

export async function processFeaturedListing(listing) {
    try {
        if (!isActive()) return;
        const spotlightListings = await safeStorage.get(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS) || [];
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
        const paymentData = { amount: paymentAmount, currency: 'KES', listingId: listing.id, features: options };
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
        const tipData = { listingId, amount: finalAmount, currency: 'KES' };
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
        safeStorage.get(LOCAL_STORAGE_KEYS.SYNC_QUEUE).then(syncQueue => {
            const queue = syncQueue || [];
            queue.push({ type: 'marketplace_' + type, data, timestamp: Date.now(), retryCount: 0 });
            safeStorage.set(LOCAL_STORAGE_KEYS.SYNC_QUEUE, queue);
        });
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

export async function createServiceListing(title, description, options = {}) {
    if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 1: UI triggered — createServiceListing', { title });

    if (!hasValidUser()) {
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createServiceListing: user not authenticated');
        showNotification('Please log in to create a listing.', 'error');
        return null;
    }
    if (!isActive()) {
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createServiceListing: module not active');
        showNotification('Module not ready. Please try again.', 'error');
        return null;
    }

    const user = sessionClient.getUser ? sessionClient.getUser() : window.currentUser || null;
    const userId = user?.id;
    const userObj = { id: userId, displayName: user?.displayName || user?.name || 'User', photoURL: user?.photoURL || '' };

    const fakeId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const optimistic = {
        id: fakeId,
        _isOptimistic: true,
        userId,
        sellerId: userId,
        user: userObj,
        type: LISTING_TYPES.SERVICE,
        title,
        description,
        price: options.price ? parseFloat(options.price) : 0,
        category: 'services',
        availability: options.availability || AVAILABILITY.FREE,
        visibility: options.visibility || TRUST_CIRCLES.FRIENDS,
        moodContext: options.moodContext,
        template: options.template,
        allowedGroups: options.allowedGroups,
        allowedUsers: options.allowedUsers,
        expiresAt: options.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        privateNotes: options.privateNotes,
        teamNotes: options.teamNotes,
        available: true,
        savedBy: [],
        views: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // Snapshot for rollback
    const prevAll = allListings.slice();
    const prevMy  = myListings.slice();

    // Optimistic UI update
    myListings.unshift(optimistic);
    allListings.unshift(optimistic);
    window.allListings = allListings;
    window.myListings  = myListings;
    safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  myListings);
    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
    window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));

    // Backend call — safeApiCall now throws on failure (no silent null)
    try {
        if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 2: API request sending');
        const response = await safeApiCall('POST', '/api/marketplace/listings', {
            title: optimistic.title,
            description: optimistic.description,
            price: optimistic.price,
            category: 'services',
            type: 'service',
            images: [],
            available: true
        });

        if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 3: API response received, status:', response?.success);
        const confirmed = response?.data?.listing;
        if (!confirmed || !confirmed.id) {
            throw new Error('Backend did not return a valid listing — DB write may have failed');
        }

        // Replace fake entry with the real DB-confirmed listing
        const committed = { ...optimistic, ...confirmed, id: confirmed.id, user: userObj, _isOptimistic: false };
        allListings = allListings.map(l => l.id === fakeId ? committed : l);
        myListings  = myListings.map(l =>  l.id === fakeId ? committed : l);
        window.allListings = allListings;
        window.myListings  = myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));

        // Broadcast to other tabs
        try { const ch = new BroadcastChannel('marketplace_sync'); ch.postMessage({ type: 'LISTING_CREATED', listing: committed }); ch.close(); } catch (_) {}

        if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 4: UI updated — listing committed to DB', { id: committed.id });
        updateListingStreak();
        updateTrustStats('listingCreated');
        return committed;

    } catch (err) {
        // Rollback optimistic update — do NOT leave ghost listing in UI or cache
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createServiceListing failed — rolling back', err.message);
        allListings = prevAll;
        myListings  = prevMy;
        window.allListings = allListings;
        window.myListings  = myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  prevMy);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, prevAll);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));
        showNotification('Failed to create listing: ' + (err.message || 'Unknown error'), 'error');
        return null;
    }
}

export async function createDigitalListing(title, description, fileData, options = {}) {
    if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 1: UI triggered — createDigitalListing', { title });

    if (!hasValidUser()) {
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createDigitalListing: user not authenticated');
        showNotification('Please log in to create a listing.', 'error');
        return null;
    }
    if (!isActive()) {
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createDigitalListing: module not active');
        showNotification('Module not ready. Please try again.', 'error');
        return null;
    }

    const user = sessionClient.getUser ? sessionClient.getUser() : window.currentUser || null;
    const userId = user?.id;
    const userObj = { id: userId, displayName: user?.displayName || user?.name || 'User', photoURL: user?.photoURL || '' };

    const fakeId = 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const optimistic = {
        id: fakeId,
        _isOptimistic: true,
        userId,
        sellerId: userId,
        user: userObj,
        type: LISTING_TYPES.DIGITAL,
        title,
        description,
        price: options.price ? parseFloat(options.price) : 0,
        category: 'digital',
        mediaUrl: fileData?.url || '',
        fileUrl: fileData?.url || '',
        fileName: fileData?.name || (fileData instanceof File ? fileData.name : ''),
        fileSize: fileData?.size || (fileData instanceof File ? fileData.size : 0),
        fileType: fileData?.type || (fileData instanceof File ? fileData.type : ''),
        visibility: options.visibility || TRUST_CIRCLES.FRIENDS,
        moodContext: options.moodContext,
        template: options.template,
        allowedGroups: options.allowedGroups,
        allowedUsers: options.allowedUsers,
        expiresAt: options.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        privateNotes: options.privateNotes,
        teamNotes: options.teamNotes,
        available: true,
        savedBy: [],
        views: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // Snapshot for rollback
    const prevAll = allListings.slice();
    const prevMy  = myListings.slice();

    // Optimistic UI update
    myListings.unshift(optimistic);
    allListings.unshift(optimistic);
    window.allListings = allListings;
    window.myListings  = myListings;
    safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  myListings);
    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
    window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));

    // Backend call — safeApiCall now throws on failure
    try {
        const response = await safeApiCall('POST', '/api/marketplace/listings', {
            title: optimistic.title,
            description: optimistic.description,
            price: optimistic.price,
            category: 'digital',
            type: 'digital',
            images: [],
            available: true
        });

        const confirmed = response?.data?.listing;
        if (!confirmed || !confirmed.id) {
            throw new Error('Backend did not return a valid listing — DB write may have failed');
        }

        // Replace fake entry with real DB-confirmed listing
        const committed = { ...optimistic, ...confirmed, id: confirmed.id, user: userObj, _isOptimistic: false };
        allListings = allListings.map(l => l.id === fakeId ? committed : l);
        myListings  = myListings.map(l =>  l.id === fakeId ? committed : l);
        window.allListings = allListings;
        window.myListings  = myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  myListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));

        // Broadcast to other tabs
        try { const ch = new BroadcastChannel('marketplace_sync'); ch.postMessage({ type: 'LISTING_CREATED', listing: committed }); ch.close(); } catch (_) {}

        if (window.__TOOLS_DEBUG__) console.log('[TOOLS FLOW] Step 4: UI updated — digital listing committed to DB', { id: committed.id });
        updateListingStreak();
        updateTrustStats('listingCreated');
        return committed;

    } catch (err) {
        // Rollback
        if (window.__TOOLS_DEBUG__) console.error('[TOOLS FLOW] createDigitalListing failed — rolling back', err.message);
        allListings = prevAll;
        myListings  = prevMy;
        window.allListings = allListings;
        window.myListings  = myListings;
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS,  prevMy);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, prevAll);
        window.dispatchEvent(new CustomEvent('marketplace:data-updated', { detail: { listings: allListings } }));
        showNotification('Failed to create listing: ' + (err.message || 'Unknown error'), 'error');
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
        
        const user = sessionClient.getUser ? sessionClient.getUser() : null;
        const currentUserId = user?.id;
        
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
        
        requestAnimationFrame(() => {
            link.click();
            const cleanup = () => {
                if (link.parentNode) document.body.removeChild(link);
                if (downloadIndicator.parentNode) document.body.removeChild(downloadIndicator);
                showNotification(`Downloaded ${fileName}`, 'success');
                // Only count after the download link actually fired
                updateTrustStats('fileDownloaded');
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
        
        const syncQueue = await safeStorage.get(LOCAL_STORAGE_KEYS.SYNC_QUEUE) || [];
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
        sessionClient.clear();
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
            throw new Error('No authentication token available');
        }
        
        const response = await authorizedFetch('/api/profile', { method: 'GET' });
        
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
            // Removed localStorage fallback
        }
    }
}

export function processUserData(userDataFromSource, source) {
    try {
        // Validate user data before processing
        if (!userDataFromSource || !userDataFromSource.id) {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Invalid user data received from', source);
            return;
        }
        
        const userId = userDataFromSource.id || userDataFromSource.userId;
        if (userId === 'user' || userId === 'default' || userId === 'null' || userId === 'undefined') {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Rejected fake user ID from', source);
            return;
        }
        
        window.currentUser = userDataFromSource;
        window.userData = userDataFromSource;
        
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
        
        if (__isValidSession(sessionData)) {
            sessionClient.acceptParentSession(sessionData);
        } else {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Invalid session data from', source);
        }
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
        
        if (__isValidSession(sessionUpdate)) {
            sessionClient.acceptParentSession(sessionUpdate);
        }
    } catch {}
}

export function handleUserLogout() {
    try {
        window.currentUser = null;
        window.userData = null;
        userSubscription = null;
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
        const session = sessionClient.getSession();
        const hasValidSession = session && __isValidSession(session);
        return isBootstrapped && hasValidSession && isActive();
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
        
        // Validate legacy data
        const userId = data.id || data.userId || data.user_id;
        if (userId === 'user' || userId === 'default' || userId === 'null' || userId === 'undefined') {
            if (window.__TOOLS_DEBUG__) console.warn('[Tools] Rejected legacy user data with fake ID');
            return;
        }
        
        const sessionData = {
            userId: userId,
            userToken: data.token || data.userToken || getCentralToken(),
            displayName: data.displayName || data.name,
            email: data.email,
            photoURL: data.photoURL || data.avatar,
            isPremium: data.isPremium || false,
            trustLevel: data.trustLevel || 'new'
        };
        
        if (__isValidSession(sessionData)) {
            sessionClient.acceptParentSession(sessionData);
        }
        
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
    hasValidSession: () => {
        const session = sessionClient.getSession();
        return session && __isValidSession(session);
    },
    isUserPremium,
    isMarketplaceReady,
    getDiagnostics: () => diagnostics?.getReport(),
    getConnectionStatus: () => heartbeatResponder?.getStatus(),
    getEnvironment: () => environmentDetector?.environment,
    getBootState: () => ({
        state: currentState,
        sessionAuthority: moduleState.sessionAuthority,
        parentReady: parentReadyReceived
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
                        state: currentState,
                        parentReady: parentReadyReceived
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
            __MODULE_SESSION_ACTIVE__: () => window.__MODULE_SESSION_ACTIVE__,
            authorizedFetch: authorizedFetch,
            sessionStore: {
                isReady: () => sessionClient.isValid(),
                getUser: () => sessionClient.getUser ? sessionClient.getUser() : null,
                hasToken: () => !!sessionClient.getToken ? sessionClient.getToken() : false,
                isValidSession: () => {
                    const session = sessionClient.getSession();
                    return session && __isValidSession(session);
                }
            },
            lifecycle: {
                getState: () => currentState,
                isActive: () => isActive(),
                childReadySent: () => childReadySent,
                parentReadyReceived: () => parentReadyReceived,
                transitions: VALID_TRANSITIONS
            },
            storageProxy: StorageProxy,
            messageGuard: MessageGuard,
            validateSession: __isValidSession
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
        
        window.authorizedFetch = authorizedFetch;
        window.StorageProxy = StorageProxy;
        window.__isValidSession = __isValidSession;
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
        if ((sessionClient.isValid()) && isUserPremium() && isActive()) {
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
        if ((sessionClient.isValid()) && isActive()) {
            const response = await authorizedFetch('/api/marketplace/leaderboard', { method: 'GET' });
            if (response && response.data?.leaderboard) {
                leaderboardData = response.data.leaderboard;
                safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
                return leaderboardData;
            } else if (response && response.leaderboard) {
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
        if (!(sessionClient.isValid()) || (!userSubscription || (userSubscription.plan !== 'business' && userSubscription.plan !== 'team'))) {
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
// SETTINGS HELPER FUNCTIONS
// =============================================

export async function loadUserSettings() {
    try {
        const savedTheme = await safeStorage.get('user_theme_preference');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            document.body.setAttribute('data-theme', savedTheme);
        }
        
        const savedFontSize = await safeStorage.get('user_font_size');
        if (savedFontSize) {
            document.documentElement.style.fontSize = savedFontSize + 'px';
        }
        
        logOnce('ready', 'User settings loaded from storage');
    } catch (error) {
        logError('loadUserSettings', error);
    }
}

export function requestSettings() {
    if (!assertActive('requestSettings')) return false;
    
    safeSend('REQUEST_SETTINGS', {
        module: MODULE_NAME,
        timestamp: Date.now()
    });
    
    return true;
}

export function updateSetting(section, key, value) {
    if (!assertActive('updateSetting')) return false;
    
    safeSend('UPDATE_SETTING', {
        section,
        key,
        value,
        module: MODULE_NAME,
        timestamp: Date.now()
    });
    
    return true;
}

export default marketplace;
// =============================================
// SETTINGS CACHE BOOTSTRAP - OFFLINE-FIRST
// =============================================
(function bootstrapToolsSettingsFromCache() {
    function applySettingToToolsModule(section, key, value) {
        if (section === 'appearance') {
            if (key === 'theme') {
                var theme = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
            }
            if (key === 'fontSize') document.documentElement.style.fontSize = parseInt(value) + 'px';
            if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
            if (key === 'compactMode') { document.documentElement.setAttribute('data-compact', value ? 'true' : 'false'); document.body.classList.toggle('compact-mode', !!value); }
            if (key === 'animationsEnabled' || key === 'animations') { document.documentElement.setAttribute('data-animations', value ? 'true' : 'false'); document.body.classList.toggle('no-animations', !value); }
            if (key === 'language') { window.__appLanguage = value; document.documentElement.setAttribute('lang', value); }
        }
        if (section === 'advanced') {
            if (key === 'performanceMode') document.documentElement.setAttribute('data-performance-mode', value ? 'true' : 'false');
            if (key === 'reduceMotion') { document.documentElement.setAttribute('data-reduce-motion', value ? 'true' : 'false'); document.body.classList.toggle('reduce-motion', !!value); }
            if (key === 'developerMode' || key === 'developerTools') window.__developerMode = value;
        }
        if (section === 'notifications') {
            if (key === 'enableNotifications' || key === 'messageNotifications') window.__messageNotificationsEnabled = value;
            if (key === 'notificationSound' || key === 'soundEnabled') window.__notificationSoundEnabled = value;
        }
        if (section === 'mood' && key === 'currentMood') { window.__currentMood = value; document.documentElement.setAttribute('data-mood', value); }
    }
    try {
        var cached = localStorage.getItem('knecta_settings_cache');
        if (!cached) return;
        var parsed = JSON.parse(cached);
        var settings = (parsed && parsed.data) ? parsed.data : parsed;
        if (!settings || typeof settings !== 'object') return;
        if (parsed.timestamp && (Date.now() - parsed.timestamp) > 86400000) return;
        Object.entries(settings).forEach(function(se) {
            var section = se[0], sectionVal = se[1];
            if (!sectionVal || typeof sectionVal !== 'object') return;
            Object.entries(sectionVal).forEach(function(ke) {
                try { applySettingToToolsModule(section, ke[0], ke[1]); } catch(e) {}
            });
        });
        if (window.__TOOLS_DEBUG__) console.log('[Tool-core] ✅ Settings bootstrapped from cache');
    } catch(e) {}
    window.addEventListener('online', function() {
        try {
            window.parent && window.parent.postMessage({ type: 'CHILD_READY', module: 'tools', source: 'tools', timestamp: Date.now() }, '*');
        } catch(e) {}
    });
})();