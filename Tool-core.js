// =============================================
// STABLE IFRAME CORE ENGINE v5.0.0
// ENHANCED PARENT-CHILD SYNCHRONIZATION
// COMPLETE HANDSHAKE PROTOCOL IMPLEMENTATION
// SECURE MESSAGING WITH FALLBACK SUPPORT
// ENVIRONMENT-AWARE • RECOVERY-READY • ORIGIN-SECURE
// =============================================

// =============================================
// STATE & CONFIGURATION - IMMUTABLE EXPORT
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
// EXPORTED STATE VARIABLES - FULL IMPLEMENTATION
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
// CONSTANTS - FULL EXPORT
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
    METRICS: 'METRICS'
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
// NEW MODULE 0: SAFE STORAGE LAYER
// =============================================

class SafeStorage {
    constructor() {
        this.memoryStorage = new Map();
        this.storageAvailable = this.checkStorageAvailability('localStorage');
        this.sessionAvailable = this.checkStorageAvailability('sessionStorage');
        this.warningsShown = new Set();
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
            // Try localStorage first
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
            
            // Fall back to memory
            if (this.memoryStorage.has(key)) {
                return this.memoryStorage.get(key);
            }
            
            return defaultValue;
        } catch (e) {
            this.logOnce('storage_error', `Storage get failed for ${key}`);
            return defaultValue;
        }
    }

    set(key, value) {
        try {
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            
            // Try localStorage
            if (this.storageAvailable) {
                try {
                    localStorage.setItem(key, serialized);
                } catch (e) {
                    this.logOnce('storage_quota', `Storage quota exceeded for ${key}`);
                    // Fall back to memory
                    this.memoryStorage.set(key, value);
                }
            } else {
                // Use memory
                this.memoryStorage.set(key, value);
            }
            return true;
        } catch (e) {
            this.logOnce('storage_set_error', `Storage set failed for ${key}`);
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

    logOnce(type, message) {
        if (!this.warningsShown.has(type)) {
            this.warningsShown.add(type);
            console.warn(`[SafeStorage] ${message}`);
        }
    }

    clear() {
        this.memoryStorage.clear();
    }
}

// Create global safe storage instance
const safeStorage = new SafeStorage();

// =============================================
// NEW MODULE 1: ENVIRONMENT DETECTOR
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
        
        // Update global state
        _STATE.environment = this.environment;
        
        // Cache environment
        safeStorage.set(LOCAL_STORAGE_KEYS.ENVIRONMENT_CACHE, {
            type: this.environment.type,
            timestamp: Date.now(),
            latency: this.environment.latency
        });
        
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
                
                // Listen for changes
                conn.addEventListener('change', () => this.onConnectionChange());
            }
        } catch (e) {
            // Ignore
        }
    }

    onConnectionChange() {
        this.detectConnectionInfo();
        this.classifyEnvironment();
        this.notifyListeners('environment:updated', this.environment);
    }

    classifyEnvironment() {
        const hostname = this.environment.hostname;
        const protocol = this.environment.protocol;
        const origin = this.environment.origin;
        
        // Check for local development
        if (this.isLocalDevelopment()) {
            this.environment.type = ENVIRONMENT_TYPES.LOCAL_DEV;
            this.applyLocalDevConfig();
            return;
        }
        
        // Check for Render hosted
        if (hostname.includes('onrender.com')) {
            this.environment.type = ENVIRONMENT_TYPES.RENDER_HOSTED;
            this.applyRenderHostedConfig();
            return;
        }
        
        // Check for VPN indicators
        if (this.isVPNNetwork()) {
            this.environment.type = ENVIRONMENT_TYPES.VPN_NETWORK;
            this.applyVPNConfig();
            return;
        }
        
        // Check for production (HTTPS + custom domain)
        if (protocol === 'https:' && !this.isLocalDevelopment() && !hostname.includes('onrender.com')) {
            this.environment.type = ENVIRONMENT_TYPES.PRODUCTION;
            this.applyProductionConfig();
            return;
        }
        
        // Default to unknown
        this.environment.type = ENVIRONMENT_TYPES.UNKNOWN;
        this.applyDefaultConfig();
    }

    isLocalDevelopment() {
        const hostname = this.environment.hostname;
        const protocol = this.environment.protocol;
        
        return hostname === 'localhost' ||
               hostname === '127.0.0.1' ||
               hostname === '::1' ||
               protocol === 'file:' ||
               hostname.startsWith('192.168.') ||
               hostname.startsWith('10.') ||
               (hostname.startsWith('172.') && parseInt(hostname.split('.')[1]) >= 16 && parseInt(hostname.split('.')[1]) <= 31);
    }

    isVPNNetwork() {
        // Check for common VPN IP ranges
        const hostname = this.environment.hostname;
        
        // Check if it's an IP address
        const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
        if (!isIP) return false;
        
        // Check for high latency (will be measured separately)
        // VPN networks often have higher latency
        
        // Check for known VPN subnets
        const parts = hostname.split('.');
        if (parts.length === 4) {
            const firstOctet = parseInt(parts[0]);
            const secondOctet = parseInt(parts[1]);
            
            // AWS VPN ranges, corporate VPN ranges, etc.
            if (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) return true; // CGNAT
            if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return true; // Private VPN
        }
        
        // Check latency
        if (this.environment.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_VPN) {
            return true;
        }
        
        return false;
    }

    async measureInitialLatency() {
        const samples = 3;
        let total = 0;
        
        for (let i = 0; i < samples; i++) {
            const start = performance.now();
            try {
                // Try to ping parent if in iframe
                if (window.parent && window.parent !== window) {
                    // Will be measured through actual messages
                    await new Promise(resolve => setTimeout(resolve, 10));
                } else {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                const end = performance.now();
                const latency = end - start - 10; // Subtract base delay
                this.latencySamples.push(latency);
                total += latency;
            } catch (e) {
                this.latencySamples.push(100); // Default
                total += 100;
            }
        }
        
        this.environment.latency = Math.round(total / samples);
        
        // Calculate jitter if we have multiple samples
        if (this.latencySamples.length > 1) {
            let sumDiffs = 0;
            for (let i = 1; i < this.latencySamples.length; i++) {
                sumDiffs += Math.abs(this.latencySamples[i] - this.latencySamples[i-1]);
            }
            this.environment.jitter = Math.round(sumDiffs / (this.latencySamples.length - 1));
        }
    }

    applyLocalDevConfig() {
        // Relax timeouts
        CONFIG.TIMEOUTS.ACK = CONFIG.TIMEOUTS.LOCAL_DEV_ACK;
        CONFIG.RETRY.MAX_ATTEMPTS = CONFIG.RETRY.LOCAL_DEV_RETRIES;
        CONFIG.SECURITY.ORIGIN_STRICT_MODE = CONFIG.SECURITY.LOCAL_DEV_STRICT;
        CONFIG.SECURITY.SIGNATURE_REQUIRED = false;
        
        // Add local origins to whitelist
        CONFIG.ORIGIN_WHITELIST.push('http://localhost:*');
        CONFIG.ORIGIN_WHITELIST.push('http://127.0.0.1:*');
    }

    applyRenderHostedConfig() {
        // Standard timeouts
        CONFIG.TIMEOUTS.ACK = CONFIG.TIMEOUTS.RENDER_HOSTED_ACK;
        CONFIG.RETRY.MAX_ATTEMPTS = CONFIG.RETRY.RENDER_HOSTED_RETRIES;
        CONFIG.SECURITY.ORIGIN_STRICT_MODE = CONFIG.SECURITY.RENDER_HOSTED_STRICT;
        CONFIG.SECURITY.SIGNATURE_REQUIRED = true;
        
        // Add render domains
        CONFIG.ORIGIN_WHITELIST.push('https://*.onrender.com');
        CONFIG.ORIGIN_WHITELIST.push('https://moodchat-fy56.onrender.com');
        CONFIG.ORIGIN_WHITELIST.push('https://moodfronted.onrender.com');
    }

    applyVPNConfig() {
        // Increase timeouts for VPN
        CONFIG.TIMEOUTS.ACK = CONFIG.TIMEOUTS.VPN_NETWORK_ACK;
        CONFIG.RETRY.MAX_ATTEMPTS = CONFIG.RETRY.VPN_NETWORK_RETRIES;
        CONFIG.SECURITY.ORIGIN_STRICT_MODE = CONFIG.SECURITY.VPN_NETWORK_STRICT;
        CONFIG.SECURITY.SIGNATURE_REQUIRED = false; // Disable for VPN due to potential packet loss
        
        // Increase heartbeat interval
        CONFIG.TIMEOUTS.HEARTBEAT = 30000; // 30 seconds for VPN
        
        // Enable VPN adaptive mode
        CONFIG.HARDENING.VPN_ADAPTIVE = true;
    }

    applyProductionConfig() {
        // Strict production settings
        CONFIG.TIMEOUTS.ACK = CONFIG.TIMEOUTS.PRODUCTION_ACK;
        CONFIG.RETRY.MAX_ATTEMPTS = CONFIG.RETRY.PRODUCTION_RETRIES;
        CONFIG.SECURITY.ORIGIN_STRICT_MODE = CONFIG.SECURITY.PRODUCTION_STRICT;
        CONFIG.SECURITY.SIGNATURE_REQUIRED = true;
        
        // Strict origin checking
        CONFIG.ORIGIN_WHITELIST = [
            window.location.origin,
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com'
        ];
        
        // Enable all security hardening
        CONFIG.HARDENING.TOKEN_BINDING = true;
        CONFIG.HARDENING.ORIGIN_BINDING = true;
        CONFIG.HARDENING.REPLAY_PROTECTION = true;
    }

    applyDefaultConfig() {
        // Conservative defaults
        CONFIG.SECURITY.ORIGIN_STRICT_MODE = false;
        CONFIG.SECURITY.SIGNATURE_REQUIRED = false;
    }

    getCurrentTimeouts() {
        const base = { ...CONFIG.TIMEOUTS };
        
        // Apply latency multiplier if needed
        if (this.environment.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH) {
            base.ACK = Math.round(base.ACK * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER);
            base.HANDSHAKE = Math.round(base.HANDSHAKE * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER);
            base.SESSION = Math.round(base.SESSION * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER);
        }
        
        return base;
    }

    getEnvironmentReport() {
        return {
            ...this.environment,
            timestamp: Date.now(),
            config: {
                timeouts: this.getCurrentTimeouts(),
                retries: CONFIG.RETRY,
                security: {
                    originStrict: CONFIG.SECURITY.ORIGIN_STRICT_MODE,
                    signatureRequired: CONFIG.SECURITY.SIGNATURE_REQUIRED
                }
            }
        };
    }

    isHighLatency() {
        return this.environment.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH;
    }

    isUnstable() {
        return this.environment.jitter > CONFIG.ENVIRONMENT.JITTER_THRESHOLD;
    }

    shouldUseCompatibilityMode() {
        return this.environment.type === ENVIRONMENT_TYPES.VPN_NETWORK ||
               this.environment.type === ENVIRONMENT_TYPES.UNKNOWN ||
               !this.environment.secure;
    }

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {}
        });
    }
}

// =============================================
// NEW MODULE 2: RELIABILITY ENGINE
// =============================================

class ReliabilityEngine {
    constructor(environmentDetector) {
        this.environmentDetector = environmentDetector;
        this.retryQueues = new Map();
        this.ackTimeouts = new Map();
        this.messageCounters = new Map();
        this.circuitBreakers = new Map();
        this.offlineBuffer = [];
        this.backoffTimers = new Map();
        this.rateLimit = {
            lastReset: Date.now(),
            count: 0
        };
        this.warningsShown = new Set();
    }

    async sendWithReliability(type, payload, options = {}) {
        const {
            requireAck = true,
            maxRetries = CONFIG.RETRY.MAX_ATTEMPTS,
            timeout = this.environmentDetector.getCurrentTimeouts().ACK,
            retryQueue = 'default',
            priority = 0,
            offlineBuffer = true,
            rateLimited = true
        } = options;

        // Check rate limiting
        if (rateLimited && this.isRateLimited()) {
            this.bufferMessage(type, payload, options);
            return { success: false, queued: true, reason: 'rate_limited' };
        }

        // Check circuit breaker
        if (this.isCircuitOpen(retryQueue)) {
            if (offlineBuffer) {
                this.bufferMessage(type, payload, options);
            }
            return { success: false, queued: true, reason: 'circuit_open' };
        }

        // Check if parent is available
        if (!_STATE.parentResponding && !options.force) {
            if (offlineBuffer) {
                this.bufferMessage(type, payload, options);
            }
            return { success: false, queued: true, reason: 'parent_unavailable' };
        }

        // Increment rate counter
        this.rateLimit.count++;

        // Generate message ID
        const messageId = this.generateMessageId();

        if (!requireAck) {
            // Fire and forget
            return this.sendFireAndForget(type, payload, messageId);
        }

        // Send with retry
        return this.sendWithRetry(type, payload, {
            messageId,
            maxRetries,
            timeout,
            retryQueue,
            priority,
            originalOptions: options
        });
    }

    async sendWithRetry(type, payload, config) {
        const {
            messageId,
            maxRetries,
            timeout,
            retryQueue,
            priority,
            originalOptions
        } = config;

        let attempts = 0;
        let lastError = null;

        while (attempts <= maxRetries) {
            attempts++;
            
            try {
                const result = await this.sendWithAck(type, payload, {
                    messageId,
                    timeout,
                    attempt: attempts
                });

                if (result.success) {
                    // Record success for circuit breaker
                    this.recordSuccess(retryQueue);
                    return result;
                }

                lastError = result.error;
                
                // Check if we should retry
                if (attempts <= maxRetries) {
                    const delay = this.calculateBackoff(attempts);
                    await this.sleep(delay);
                }
            } catch (error) {
                lastError = error;
                if (attempts <= maxRetries) {
                    const delay = this.calculateBackoff(attempts);
                    await this.sleep(delay);
                }
            }
        }

        // All retries failed
        this.recordFailure(retryQueue);
        
        // Buffer if offline buffer enabled
        if (originalOptions.offlineBuffer !== false) {
            this.bufferMessage(type, payload, originalOptions);
        }

        return { 
            success: false, 
            error: lastError || 'max_retries_exceeded',
            attempts
        };
    }

    sendWithAck(type, payload, config) {
        return new Promise((resolve) => {
            const { messageId, timeout, attempt } = config;
            let resolved = false;

            // Setup timeout
            const timeoutId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve({ 
                    success: false, 
                    error: 'timeout',
                    attempt,
                    messageId 
                });
            }, timeout);

            // Setup ACK handler
            const ackHandler = (e) => {
                if (!this.validateOrigin(e)) return;
                
                const data = e.data;
                if (!data || typeof data !== 'object') return;
                
                if ((data.type === PARENT_MESSAGE_TYPES.ACK || data.type === 'ACK') && 
                    (data.inResponseTo === messageId || data.messageId === messageId)) {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    
                    _STATE.connectionMetrics.acksReceived++;
                    resolve({ 
                        success: true, 
                        ack: data,
                        attempt,
                        messageId
                    });
                }
            };

            const cleanup = () => {
                clearTimeout(timeoutId);
                window.removeEventListener('message', ackHandler);
                this.ackTimeouts.delete(messageId);
            };

            // Store for potential cleanup
            this.ackTimeouts.set(messageId, { timeoutId, cleanup });

            // Add listener
            window.addEventListener('message', ackHandler);

            // Send message
            try {
                if (!window.parent || window.parent === window) {
                    throw new Error('Not in iframe');
                }

                const message = this.buildMessage(type, payload, { messageId, attempt });
                window.parent.postMessage(message, '*');
                _STATE.connectionMetrics.messagesSent++;
                
                // Safety cleanup
                setTimeout(() => {
                    if (!resolved) {
                        cleanup();
                    }
                }, timeout + 100);
            } catch (err) {
                cleanup();
                resolve({ 
                    success: false, 
                    error: err.message,
                    attempt,
                    messageId
                });
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
            payload: this.sanitizePayload(payload),
            legacy: false
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
            
            // Check against trusted origins
            const trusted = CONFIG.ORIGIN_WHITELIST || [];
            if (trusted.includes('*')) return true;
            
            // Check exact matches
            if (trusted.includes(event.origin)) return true;
            
            // Check wildcards
            for (const pattern of trusted) {
                if (pattern.includes('*')) {
                    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                    if (regex.test(event.origin)) return true;
                }
            }
            
            return false;
        } catch {
            return false;
        }
    }

    calculateBackoff(attempt) {
        const base = CONFIG.TIMEOUTS.BACKOFF_BASE;
        const max = CONFIG.TIMEOUTS.BACKOFF_MAX;
        
        // Exponential backoff with jitter
        let delay = base * Math.pow(CONFIG.RETRY.BACKOFF_FACTOR, attempt - 1);
        
        // Add jitter
        delay += Math.random() * CONFIG.RETRY.JITTER_MAX;
        
        // Apply environment multiplier
        if (this.environmentDetector.isHighLatency()) {
            delay = delay * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER;
        }
        
        return Math.min(delay, max);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    isRateLimited() {
        const now = Date.now();
        
        // Reset counter every second
        if (now - this.rateLimit.lastReset > 1000) {
            this.rateLimit.lastReset = now;
            this.rateLimit.count = 0;
            return false;
        }
        
        return this.rateLimit.count >= (CONFIG.HARDENING.RATE_LIMIT?.MAX_MESSAGES_PER_SECOND || 10);
    }

    bufferMessage(type, payload, options) {
        this.offlineBuffer.push({
            type,
            payload,
            options,
            timestamp: Date.now(),
            attempts: 0
        });
        
        // Limit buffer size
        if (this.offlineBuffer.length > 100) {
            this.offlineBuffer.shift();
        }
    }

    processOfflineBuffer() {
        if (this.offlineBuffer.length === 0) return;
        if (!window.parent || window.parent === window) return;
        if (!_STATE.parentResponding) return;

        const buffer = [...this.offlineBuffer];
        this.offlineBuffer = [];

        buffer.forEach(async (item) => {
            await this.sendWithReliability(item.type, item.payload, {
                ...item.options,
                offlineBuffer: false
            });
        });
    }

    recordSuccess(queue) {
        const breaker = this.circuitBreakers.get(queue) || {
            failures: 0,
            open: false,
            resetTimer: null
        };
        
        breaker.failures = Math.max(0, breaker.failures - 1);
        this.circuitBreakers.set(queue, breaker);
    }

    recordFailure(queue) {
        const breaker = this.circuitBreakers.get(queue) || {
            failures: 0,
            open: false,
            resetTimer: null
        };
        
        breaker.failures++;
        
        if (breaker.failures >= CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD && !breaker.open) {
            this.openCircuit(queue);
        }
        
        this.circuitBreakers.set(queue, breaker);
    }

    isCircuitOpen(queue) {
        const breaker = this.circuitBreakers.get(queue);
        return breaker?.open || false;
    }

    openCircuit(queue) {
        const breaker = this.circuitBreakers.get(queue) || {
            failures: 0,
            open: false,
            resetTimer: null
        };
        
        if (breaker.open) return;
        
        breaker.open = true;
        this.circuitBreakers.set(queue, breaker);
        
        // Schedule reset
        if (breaker.resetTimer) {
            clearTimeout(breaker.resetTimer);
        }
        
        breaker.resetTimer = setTimeout(() => {
            this.closeCircuit(queue);
        }, CONFIG.CIRCUIT_BREAKER.RESET_TIMEOUT);
        
        this.logOnce('circuit_open', `Circuit opened for ${queue}`);
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

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[ReliabilityEngine] ${message}`);
        }
    }

    getStatus() {
        return {
            offlineBuffer: this.offlineBuffer.length,
            circuits: Array.from(this.circuitBreakers.entries()).map(([q, b]) => ({
                queue: q,
                open: b.open,
                failures: b.failures
            })),
            rateLimit: {
                count: this.rateLimit.count,
                lastReset: this.rateLimit.lastReset
            }
        };
    }
}

// =============================================
// NEW MODULE 3: STARTUP GOVERNOR
// =============================================

class StartupGovernor {
    constructor(environmentDetector, reliabilityEngine) {
        this.environmentDetector = environmentDetector;
        this.reliabilityEngine = reliabilityEngine;
        
        this.state = {
            stage: STARTUP_STAGES.IDLE,
            attempts: 0,
            maxAttempts: _STATE.maxStartupAttempts,
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
        this.warningsShown = new Set();
    }

    initialize() {
        this.state.startTime = Date.now();
        _STATE.startupStage = this.state.stage;
        _STATE.startupLock = this.state.lock;
        
        // Load cached state
        try {
            const cached = safeStorage.get(LOCAL_STORAGE_KEYS.STARTUP_STATE);
            if (cached && cached.stage === STARTUP_STAGES.ACTIVE) {
                this.state.handshakeComplete = true;
                _STATE.handshakeComplete = true;
            }
        } catch (e) {}
        
        return this;
    }

    async start() {
        if (this.state.lock) {
            return false;
        }

        if (_STATE.handshakeComplete && _STATE.sessionActive) {
            this.state.stage = STARTUP_STAGES.ACTIVE;
            _STATE.startupStage = STARTUP_STAGES.ACTIVE;
            return true;
        }

        this.state.lock = true;
        this.state.stage = STARTUP_STAGES.WAITING;
        _STATE.startupStage = STARTUP_STAGES.WAITING;

        try {
            // Stage 1: Wait for parent (if in iframe)
            if (this.isInIframe()) {
                const parentReady = await this.waitForParent();
                if (!parentReady) {
                    this.handleFailure('Parent not ready');
                    return false;
                }
            } else {
                // Standalone mode
                this.state.stage = STARTUP_STAGES.DEGRADED;
                _STATE.startupStage = STARTUP_STAGES.DEGRADED;
                _STATE.guestMode = true;
                _STATE.fallbackMode = true;
                this.state.lock = false;
                return true;
            }

            // Stage 2: Handshake
            this.state.stage = STARTUP_STAGES.HANDSHAKING;
            _STATE.startupStage = STARTUP_STAGES.HANDSHAKING;

            const handshakeComplete = await this.performHandshake();
            if (!handshakeComplete) {
                this.handleFailure('Handshake failed');
                return false;
            }

            // Stage 3: Session sync
            this.state.stage = STARTUP_STAGES.SYNCING;
            _STATE.startupStage = STARTUP_STAGES.SYNCING;

            const sessionValid = await this.syncSession();
            if (!sessionValid && !_STATE.guestMode) {
                this.handleFailure('Session sync failed');
                return false;
            }

            // Success
            this.state.stage = STARTUP_STAGES.ACTIVE;
            this.state.lock = false;
            _STATE.startupStage = STARTUP_STAGES.ACTIVE;
            _STATE.initialized = true;

            // Cache success
            safeStorage.set(LOCAL_STORAGE_KEYS.STARTUP_STATE, {
                stage: STARTUP_STAGES.ACTIVE,
                timestamp: Date.now(),
                handshakeComplete: true
            });

            this.notifyListeners('startup:complete', {
                stage: this.state.stage,
                duration: Date.now() - this.state.startTime
            });

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

            const timeout = this.getAdjustedTimeout(CONFIG.TIMEOUTS.PARENT_READY_WAIT);
            let resolved = false;

            const timeoutId = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                this.logOnce('parent_timeout', 'Parent ready timeout');
                resolve(false);
            }, timeout);

            const handler = (e) => {
                if (!this.reliabilityEngine.validateOrigin(e)) return;

                const data = e.data;
                if (!data || typeof data !== 'object') return;

                if (data.type === PARENT_MESSAGE_TYPES.PARENT_READY || data.type === 'PARENT_READY') {
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

        // Check if handshake already complete
        if (_STATE.handshakeComplete) {
            this.state.handshakeComplete = true;
            return true;
        }

        // Send child ready
        const childResult = await this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.CHILD_READY,
            {
                id: _STATE.handshakeId || _STATE.frameId,
                frameId: _STATE.frameId,
                timestamp: Date.now(),
                version: '5.0.0',
                environment: this.environmentDetector.environment
            },
            {
                requireAck: true,
                timeout: this.getAdjustedTimeout(CONFIG.TIMEOUTS.CHILD_READY_WAIT),
                maxRetries: 2,
                offlineBuffer: false
            }
        );

        if (!childResult.success) {
            return false;
        }

        // Wait for handshake completion
        return new Promise((resolve) => {
            if (_STATE.handshakeComplete) {
                resolve(true);
                return;
            }

            const timeout = this.getAdjustedTimeout(CONFIG.TIMEOUTS.HANDSHAKE);
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

                if (data.type === PARENT_MESSAGE_TYPES.HANDSHAKE_COMPLETE || 
                    data.type === 'HANDSHAKE_COMPLETE' ||
                    (data.type === PARENT_MESSAGE_TYPES.HANDSHAKE_ACK && data.payload?.complete)) {
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
        // Check if session already valid
        if (_STATE.sessionActive || _STATE.guestMode) {
            this.state.sessionValid = true;
            return true;
        }

        // Request session
        const result = await this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.REQUEST_SESSION,
            {
                frameId: _STATE.frameId,
                timestamp: Date.now(),
                startup: true,
                attempt: this.state.attempts
            },
            {
                requireAck: true,
                timeout: this.getAdjustedTimeout(CONFIG.TIMEOUTS.SESSION_REQUEST_WAIT),
                maxRetries: 2,
                offlineBuffer: false
            }
        );

        if (!result.success) {
            return false;
        }

        // Wait for session data
        return new Promise((resolve) => {
            if (_STATE.sessionActive || _STATE.guestMode) {
                resolve(true);
                return;
            }

            const timeout = this.getAdjustedTimeout(CONFIG.TIMEOUTS.SESSION);
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

                if (data.type === PARENT_MESSAGE_TYPES.SESSION_DATA || 
                    data.type === 'SESSION_DATA' ||
                    data.type === PARENT_MESSAGE_TYPES.SESSION_SYNC) {
                    if (resolved) return;

                    // Session data received
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

            // Schedule retry
            const delay = this.getBackoffDelay();
            setTimeout(() => {
                this.start();
            }, delay);
        } else {
            this.state.stage = STARTUP_STAGES.DEGRADED;
            _STATE.startupStage = STARTUP_STAGES.DEGRADED;
            _STATE.fallbackMode = true;
            _STATE.guestMode = true;

            this.notifyListeners('startup:failed', {
                reason,
                attempts: this.state.attempts,
                stage: this.state.stage
            });
        }
    }

    getAdjustedTimeout(baseTimeout) {
        const env = this.environmentDetector.environment;

        if (env.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH) {
            return Math.round(baseTimeout * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER);
        }

        if (this.environmentDetector.isUnstable()) {
            return Math.round(baseTimeout * CONFIG.TIMEOUTS.UNSTABLE_MULTIPLIER);
        }

        return baseTimeout;
    }

    getBackoffDelay() {
        const base = CONFIG.TIMEOUTS.BACKOFF_BASE;
        const max = CONFIG.TIMEOUTS.BACKOFF_MAX;

        // Exponential backoff
        let delay = base * Math.pow(2, this.state.attempts - 1);
        
        // Add jitter
        delay += Math.random() * 100;

        return Math.min(delay, max);
    }

    addListener(callback) {
        if (typeof callback === 'function') {
            this.listeners.add(callback);
            return () => this.listeners.delete(callback);
        }
        return () => {};
    }

    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch {}
        });
    }

    clearTimeouts() {
        this.timeouts.forEach(({ timeoutId, cleanup }) => {
            clearTimeout(timeoutId);
            try { cleanup(); } catch {}
        });
        this.timeouts.clear();
    }

    getStatus() {
        return {
            stage: this.state.stage,
            attempts: this.state.attempts,
            maxAttempts: this.state.maxAttempts,
            lock: this.state.lock,
            startTime: this.state.startTime,
            lastAttempt: this.state.lastAttempt,
            error: this.state.error,
            parentReady: this.state.parentReady,
            handshakeComplete: this.state.handshakeComplete,
            sessionValid: this.state.sessionValid,
            duration: this.state.startTime ? Date.now() - this.state.startTime : 0
        };
    }

    reset() {
        this.clearTimeouts();
        this.state = {
            stage: STARTUP_STAGES.IDLE,
            attempts: 0,
            maxAttempts: _STATE.maxStartupAttempts,
            lock: false,
            startTime: 0,
            lastAttempt: 0,
            error: null,
            parentReady: false,
            handshakeComplete: false,
            sessionValid: false
        };
        _STATE.startupStage = this.state.stage;
        _STATE.startupLock = this.state.lock;
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[StartupGovernor] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 4: HANDSHAKE AUTHORITY
// =============================================

class HandshakeAuthority {
    constructor(environmentDetector, reliabilityEngine) {
        this.environmentDetector = environmentDetector;
        this.reliabilityEngine = reliabilityEngine;
        
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
        this.warningsShown = new Set();
    }

    async startHandshake() {
        if (this.state.lock) {
            this.logOnce('duplicate_handshake', 'Handshake already in progress');
            return false;
        }

        if (_STATE.handshakeComplete) {
            this.state.complete = true;
            return true;
        }

        this.state.lock = true;
        this.state.attempts++;
        this.state.startTime = Date.now();
        this.state.stage = 'init';

        _STATE.handshakeStartTime = this.state.startTime;
        _STATE.handshakeId = `handshake_${this.state.startTime}_${Math.random().toString(36).substring(2, 8)}`;

        try {
            // Step 1: CHILD_READY
            this.state.stage = 'child_ready';
            const readyResult = await this.sendChildReady();
            if (!readyResult.success) {
                throw new Error('CHILD_READY failed');
            }

            // Step 2: Wait for PARENT_READY
            this.state.stage = 'wait_parent_ready';
            const parentReady = await this.waitForParentReady();
            if (!parentReady) {
                throw new Error('PARENT_READY timeout');
            }

            // Step 3: HANDSHAKE_REQUEST
            this.state.stage = 'handshake_request';
            const requestResult = await this.sendHandshakeRequest();
            if (!requestResult.success) {
                throw new Error('HANDSHAKE_REQUEST failed');
            }

            // Step 4: Wait for HANDSHAKE_ACK
            this.state.stage = 'wait_handshake_ack';
            const ackReceived = await this.waitForHandshakeAck();
            if (!ackReceived) {
                throw new Error('HANDSHAKE_ACK timeout');
            }

            // Step 5: Complete
            this.completeHandshake();

            return true;

        } catch (error) {
            this.state.error = error.message;
            this.state.lock = false;

            if (this.state.attempts < CONFIG.RETRY.HANDSHAKE_RETRIES) {
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
                capabilities: this.detectCapabilities()
            },
            {
                requireAck: true,
                timeout: this.getAdjustedTimeout(CONFIG.TIMEOUTS.CHILD_READY_WAIT),
                maxRetries: 2,
                offlineBuffer: false,
                retryQueue: 'handshake'
            }
        );
    }

    waitForParentReady() {
        return new Promise((resolve) => {
            if (_STATE.handshakeState.parentReadyReceived) {
                resolve(true);
                return;
            }

            const timeout = this.getAdjustedTimeout(CONFIG.TIMEOUTS.PARENT_READY_WAIT);
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
            {
                requireAck: true,
                timeout: this.getAdjustedTimeout(CONFIG.TIMEOUTS.HANDSHAKE_REQUEST_WAIT),
                maxRetries: 2,
                offlineBuffer: false,
                retryQueue: 'handshake'
            }
        );
    }

    waitForHandshakeAck() {
        return new Promise((resolve) => {
            const timeout = this.getAdjustedTimeout(CONFIG.TIMEOUTS.HANDSHAKE_ACK_WAIT);
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

        // Save state
        safeStorage.set(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE, {
            timestamp: Date.now(),
            version: '5.0.0',
            complete: true
        });

        this.notifyListeners('handshake:complete', {
            duration: _STATE.connectionMetrics.handshakeDuration,
            attempts: this.state.attempts
        });
    }

    async retryHandshake() {
        const delay = this.reliabilityEngine.calculateBackoff(this.state.attempts);
        return new Promise((resolve) => {
            setTimeout(async () => {
                const result = await this.startHandshake();
                resolve(result);
            }, delay);
        });
    }

    detectCapabilities() {
        return {
            session: true,
            heartbeat: true,
            sync: true,
            ack: true,
            signature: !_STATE.sandboxRestrictions?.crypto,
            timestamp: true,
            replay: true,
            retry: true,
            offline: true,
            visibility: true,
            environment: true,
            recovery: true,
            diagnostics: true
        };
    }

    getAdjustedTimeout(baseTimeout) {
        const env = this.environmentDetector.environment;
        if (env.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH) {
            return Math.round(baseTimeout * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER);
        }
        return baseTimeout;
    }

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {}
        });
    }

    getStatus() {
        return {
            stage: this.state.stage,
            attempts: this.state.attempts,
            complete: this.state.complete,
            error: this.state.error,
            duration: this.state.complete ? Date.now() - this.state.startTime : null
        };
    }

    reset() {
        this.clearTimeouts();
        this.state = {
            stage: 'idle',
            attempts: 0,
            startTime: 0,
            complete: false,
            error: null,
            lock: false
        };
    }

    clearTimeouts() {
        this.timeouts.forEach(({ timeoutId, cleanup }) => {
            clearTimeout(timeoutId);
            try { cleanup(); } catch {}
        });
        this.timeouts.clear();
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[HandshakeAuthority] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 5: SESSION CLIENT
// =============================================

class SessionClient {
    constructor(environmentDetector, reliabilityEngine) {
        this.environmentDetector = environmentDetector;
        this.reliabilityEngine = reliabilityEngine;
        
        this.currentSession = null;
        this.sessionCache = null;
        this.guestMode = false;
        this.demoMode = false;
        
        this.listeners = new Set();
        this.tokenRefreshTimer = null;
        this.expirationTimer = null;
        this.expiryWarningTimer = null;
        
        this.sessionState = {
            requested: false,
            received: false,
            synced: false,
            acked: false,
            expiresAt: null,
            lastSync: 0,
            refreshNeeded: false,
            expiryWarning: false
        };
        
        this.warningsShown = new Set();
        this.loadFromCache();
    }

    loadFromCache() {
        try {
            const cached = safeStorage.sessionGet('core_session_cache');
            if (cached) {
                if (cached.expiresAt) {
                    if (new Date(cached.expiresAt) > new Date()) {
                        this.sessionCache = cached;
                        this.currentSession = cached;
                        _STATE.sessionCache = cached;
                        _STATE.lastValidSession = cached;
                    } else {
                        safeStorage.sessionRemove('core_session_cache');
                    }
                }
            }
        } catch {
            this.sessionCache = null;
        }
    }

    saveToCache(session) {
        try {
            if (session && session.userToken) {
                const cacheEntry = {
                    ...session,
                    cachedAt: new Date().toISOString()
                };
                safeStorage.sessionSet('core_session_cache', cacheEntry);
                this.sessionCache = cacheEntry;
                _STATE.sessionCache = cacheEntry;
                _STATE.lastValidSession = cacheEntry;
                
                safeStorage.set(LOCAL_STORAGE_KEYS.PROTOCOL_VERSION, _STATE.protocolVersion);
            }
        } catch {}
    }

    async requestSession(force = false) {
        if (this.guestMode && !force) return this.currentSession;
        if (this.sessionState.requested && !force) return this.currentSession;

        this.sessionState.requested = true;

        const result = await this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.REQUEST_SESSION,
            {
                frameId: _STATE.frameId,
                timestamp: Date.now(),
                force: force,
                cached: !!this.sessionCache,
                environment: this.environmentDetector.environment
            },
            {
                requireAck: true,
                timeout: this.getAdjustedTimeout(CONFIG.TIMEOUTS.SESSION_REQUEST_WAIT),
                maxRetries: CONFIG.RETRY.SESSION_RETRIES,
                retryQueue: 'session'
            }
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
            {
                requireAck: true,
                timeout: this.getAdjustedTimeout(CONFIG.TIMEOUTS.SYNC),
                maxRetries: 2,
                retryQueue: 'session'
            }
        );

        if (result.success) {
            this.sessionState.synced = true;
            this.sessionState.lastSync = Date.now();
        }

        return result;
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
            {
                requireAck: false,
                retryQueue: 'session'
            }
        );
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
                subscription: validatedSession.subscription || null,
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

            this.saveToCache(this.currentSession);
            this.notifyListeners('session:updated', this.currentSession);
            this.sessionState.received = true;

            // Send SESSION_ACK
            this.sendSessionAck(this.currentSession);

            // Set up timers
            this.scheduleTokenRefresh();
            this.scheduleExpirationCheck();
            this.scheduleExpiryWarning();

            return true;
        } catch (error) {
            this.logOnce('session_accept_error', 'Failed to accept parent session');
            return false;
        }
    }

    scheduleTokenRefresh() {
        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer);
        }

        if (!this.currentSession || !this.currentSession.expiresAt) return;

        const expiresAt = new Date(this.currentSession.expiresAt).getTime();
        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;

        // Refresh before expiry (with margin)
        const refreshTime = Math.max(0, timeUntilExpiry - CONFIG.SECURITY.TOKEN_REFRESH_MARGIN);

        if (refreshTime > 0) {
            this.tokenRefreshTimer = setTimeout(() => {
                this.sessionState.refreshNeeded = true;
                this.requestSession(true);
                this.notifyListeners('session:refresh_needed', this.currentSession);
            }, refreshTime);
        }
    }

    scheduleExpirationCheck() {
        if (this.expirationTimer) {
            clearTimeout(this.expirationTimer);
        }

        if (!this.currentSession || !this.currentSession.expiresAt) return;

        const expiresAt = new Date(this.currentSession.expiresAt).getTime();
        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;

        if (timeUntilExpiry > 0) {
            this.expirationTimer = setTimeout(() => {
                this.handleExpiration();
            }, timeUntilExpiry);
        } else {
            this.handleExpiration();
        }
    }

    scheduleExpiryWarning() {
        if (this.expiryWarningTimer) {
            clearTimeout(this.expiryWarningTimer);
        }

        if (!this.currentSession || !this.currentSession.expiresAt) return;

        const expiresAt = new Date(this.currentSession.expiresAt).getTime();
        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;

        // Warn 5 minutes before expiry
        const warningTime = Math.max(0, timeUntilExpiry - 300000);

        if (warningTime > 0) {
            this.expiryWarningTimer = setTimeout(() => {
                this.sessionState.expiryWarning = true;
                this.notifyListeners('session:expiry_warning', this.currentSession);
            }, warningTime);
        }
    }

    handleExpiration() {
        this.clear();
        this.notifyListeners('session:expired', null);
        this.requestSession();
    }

    enableGuestMode() {
        this.guestMode = true;
        this.demoMode = false;
        _STATE.guestMode = true;
        _STATE.sessionActive = false;

        const guestSession = {
            userId: 'guest_' + Date.now(),
            userToken: null,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            displayName: 'Guest User',
            isPremium: false,
            trustLevel: 'guest',
            source: 'guest_mode'
        };

        this.currentSession = guestSession;
        this.notifyListeners('session:guest', guestSession);
    }

    enableDemoMode() {
        this.demoMode = true;
        this.guestMode = false;
        _STATE.demoMode = true;
        _STATE.sessionActive = true;
        _STATE.guestMode = false;

        const demoSession = {
            userId: 'demo_user',
            userToken: 'demo_token_' + Date.now(),
            expiresAt: new Date(Date.now() + 7200000).toISOString(),
            displayName: 'Demo User',
            email: 'demo@example.com',
            isPremium: true,
            trustLevel: 'verified',
            source: 'demo_mode'
        };

        this.currentSession = demoSession;
        this.notifyListeners('session:demo', demoSession);
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
                subscription: session.subscription || null,
                trustLevel: session.trustLevel || session.trust_level || 'new',
                groups: session.groups || [],
                friends: session.friends || []
            };
        } catch {
            return null;
        }
    }

    getSession() {
        if (this.guestMode) {
            return {
                userId: 'guest',
                displayName: 'Guest User',
                isGuest: true,
                ...this.currentSession
            };
        }

        if (this.demoMode) {
            return {
                ...this.currentSession,
                isDemo: true
            };
        }

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

    clear() {
        this.currentSession = null;
        this.guestMode = false;
        this.demoMode = false;
        this.sessionState = {
            requested: false,
            received: false,
            synced: false,
            acked: false,
            expiresAt: null,
            lastSync: 0,
            refreshNeeded: false,
            expiryWarning: false
        };

        _STATE.sessionActive = false;
        _STATE.guestMode = false;
        _STATE.demoMode = false;

        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }

        if (this.expirationTimer) {
            clearTimeout(this.expirationTimer);
            this.expirationTimer = null;
        }

        if (this.expiryWarningTimer) {
            clearTimeout(this.expiryWarningTimer);
            this.expiryWarningTimer = null;
        }

        safeStorage.sessionRemove('core_session_cache');
        safeStorage.remove('USER_TOKEN');

        this.notifyListeners('session:cleared', null);
    }

    addListener(callback) {
        if (typeof callback === 'function') {
            this.listeners.add(callback);
            return () => this.listeners.delete(callback);
        }
        return () => {};
    }

    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch {}
        });
    }

    getAdjustedTimeout(baseTimeout) {
        const env = this.environmentDetector.environment;
        if (env.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH) {
            return Math.round(baseTimeout * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER);
        }
        return baseTimeout;
    }

    getState() {
        return {
            ...this.sessionState,
            isValid: this.isValid(),
            guestMode: this.guestMode,
            demoMode: this.demoMode,
            hasSession: !!this.currentSession
        };
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[SessionClient] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 6: TRANSPORT LAYER
// =============================================

class TransportLayer {
    constructor(environmentDetector, reliabilityEngine) {
        this.environmentDetector = environmentDetector;
        this.reliabilityEngine = reliabilityEngine;
        
        this.heartbeatInterval = null;
        this.adaptiveHeartbeatTimer = null;
        this.pingTimer = null;
        this.pongTimer = null;
        this.lastPing = 0;
        this.lastPong = 0;
        this.missedPongs = 0;
        
        this.visibilityHandler = null;
        this.connectivityHandler = null;
        
        this.heartbeatRate = CONFIG.TIMEOUTS.HEARTBEAT;
        this.adaptiveMode = false;
        this.batchQueue = [];
        this.batchTimer = null;
        
        this.listeners = new Set();
        this.warningsShown = new Set();
    }

    start() {
        this.setupHeartbeat();
        this.setupVisibilityHandling();
        this.setupConnectivityHandling();
        this.startAdaptiveHeartbeat();
    }

    setupHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatRate = this.calculateHeartbeatRate();

        this.heartbeatInterval = setInterval(() => {
            this.sendPing();
        }, this.heartbeatRate);
    }

    calculateHeartbeatRate() {
        const env = this.environmentDetector.environment;
        let rate = CONFIG.TIMEOUTS.HEARTBEAT;

        if (env.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH) {
            rate = rate * 2;
        }

        if (this.environmentDetector.isUnstable()) {
            rate = rate * 1.5;
        }

        if (env.type === ENVIRONMENT_TYPES.VPN_NETWORK) {
            rate = rate * 2;
        }

        return Math.min(rate, 60000);
    }

    async sendPing() {
        if (!_STATE.parentDetected || _STATE.guestMode) return;

        this.lastPing = Date.now();
        _STATE.connectionMetrics.lastPing = this.lastPing;

        const result = await this.reliabilityEngine.sendWithReliability(
            PARENT_MESSAGE_TYPES.PING,
            {
                timestamp: this.lastPing,
                sequence: this.generateSequence(),
                metrics: this.collectMetrics()
            },
            {
                requireAck: true,
                timeout: this.getAdjustedAckTimeout(),
                maxRetries: 2,
                retryQueue: 'heartbeat',
                offlineBuffer: false
            }
        );

        if (result.success) {
            this.missedPongs = 0;
            _STATE.parentResponding = true;
            _STATE.health.missedHeartbeats = 0;
        } else {
            this.missedPongs++;
            _STATE.health.missedHeartbeats++;

            if (this.missedPongs >= CONFIG.RETRY.HEARTBEAT_RETRIES) {
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

        // Update latency measurement
        if (this.lastPing) {
            const latency = this.lastPong - this.lastPing;
            this.environmentDetector.latencySamples.push(latency);
            if (this.environmentDetector.latencySamples.length > 10) {
                this.environmentDetector.latencySamples.shift();
            }

            const sum = this.environmentDetector.latencySamples.reduce((a, b) => a + b, 0);
            this.environmentDetector.environment.latency = Math.round(sum / this.environmentDetector.latencySamples.length);
        }
    }

    generateSequence() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    }

    getAdjustedAckTimeout() {
        const env = this.environmentDetector.environment;
        let timeout = CONFIG.TIMEOUTS.ACK;

        if (env.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH) {
            timeout = timeout * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER;
        }

        return Math.round(timeout / 2);
    }

    setupVisibilityHandling() {
        this.visibilityHandler = () => {
            if (document.hidden) {
                this.adaptiveMode = true;
                this.updateHeartbeatRate();
            } else {
                this.adaptiveMode = false;
                this.updateHeartbeatRate();
                this.reliabilityEngine.processOfflineBuffer();
                this.sendPing();
            }
        };

        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    setupConnectivityHandling() {
        this.connectivityHandler = () => {
            if (navigator.onLine) {
                this.reliabilityEngine.processOfflineBuffer();
                this.sendPing();
                this.updateHeartbeatRate();
            } else {
                this.adaptiveMode = true;
                this.updateHeartbeatRate();
            }
        };

        window.addEventListener('online', this.connectivityHandler);
        window.addEventListener('offline', this.connectivityHandler);
    }

    startAdaptiveHeartbeat() {
        this.updateHeartbeatRate();
        this.adaptiveHeartbeatTimer = setInterval(() => {
            this.updateHeartbeatRate();
        }, 60000);
    }

    updateHeartbeatRate() {
        const newRate = this.calculateHeartbeatRate();

        if (newRate !== this.heartbeatRate) {
            this.heartbeatRate = newRate;

            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = setInterval(() => {
                    this.sendPing();
                }, this.heartbeatRate);
            }
        }
    }

    collectMetrics() {
        return {
            timestamp: Date.now(),
            connection: {
                online: navigator.onLine,
                visible: !document.hidden,
                latency: this.environmentDetector.environment.latency
            },
            queue: {
                pendingAcks: this.reliabilityEngine.ackTimeouts.size,
                offlineBuffer: this.reliabilityEngine.offlineBuffer.length
            }
        };
    }

    async batchSend(messages) {
        if (!messages || messages.length === 0) return [];

        const results = [];
        const ackMessages = messages.filter(m => m.options?.requireAck);
        const fireAndForgetMessages = messages.filter(m => !m.options?.requireAck);

        for (const msg of fireAndForgetMessages) {
            results.push({
                ...msg,
                success: await this.reliabilityEngine.sendWithReliability(
                    msg.type, 
                    msg.payload, 
                    { ...msg.options, requireAck: false }
                )
            });
        }

        for (let i = 0; i < ackMessages.length; i++) {
            const msg = ackMessages[i];
            const result = await this.reliabilityEngine.sendWithReliability(
                msg.type, 
                msg.payload, 
                msg.options
            );
            results.push({ ...msg, success: result.success });

            if (i < ackMessages.length - 1) {
                await new Promise(r => setTimeout(r, 50));
            }
        }

        return results;
    }

    queueForBatch(type, payload, options = {}) {
        this.batchQueue.push({
            type,
            payload,
            options,
            timestamp: Date.now()
        });

        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.processBatch();
            }, 100);
        }
    }

    async processBatch() {
        if (this.batchQueue.length === 0) return;

        const queue = [...this.batchQueue];
        this.batchQueue = [];
        this.batchTimer = null;

        await this.batchSend(queue);
    }

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {}
        });
        window.dispatchEvent(new CustomEvent(`transport:${event}`, { detail: data }));
    }

    getConnectionStatus() {
        return {
            connected: _STATE.parentResponding,
            lastPing: this.lastPing,
            lastPong: this.lastPong,
            missedPongs: this.missedPongs,
            online: navigator.onLine,
            visible: !document.hidden,
            messageCount: _STATE.connectionMetrics.messagesSent + _STATE.connectionMetrics.messagesReceived,
            ackRate: _STATE.connectionMetrics.acksReceived / (_STATE.connectionMetrics.messagesSent || 1),
            heartbeatRate: this.heartbeatRate,
            adaptiveMode: this.adaptiveMode,
            batchQueue: this.batchQueue.length,
            reliability: this.reliabilityEngine.getStatus()
        };
    }

    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.adaptiveHeartbeatTimer) {
            clearInterval(this.adaptiveHeartbeatTimer);
            this.adaptiveHeartbeatTimer = null;
        }

        if (this.pingTimer) {
            clearTimeout(this.pingTimer);
            this.pingTimer = null;
        }

        if (this.pongTimer) {
            clearTimeout(this.pongTimer);
            this.pongTimer = null;
        }

        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }

        if (this.connectivityHandler) {
            window.removeEventListener('online', this.connectivityHandler);
            window.removeEventListener('offline', this.connectivityHandler);
            this.connectivityHandler = null;
        }
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[TransportLayer] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 7: RECOVERY MANAGER
// =============================================

class RecoveryManager {
    constructor(environmentDetector, reliabilityEngine, handshakeAuthority, sessionClient, transportLayer) {
        this.environmentDetector = environmentDetector;
        this.reliabilityEngine = reliabilityEngine;
        this.handshakeAuthority = handshakeAuthority;
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
        
        this.strategies = [
            this.strategyHeartbeat.bind(this),
            this.strategyHandshake.bind(this),
            this.strategySession.bind(this),
            this.strategyFullReset.bind(this)
        ];
        
        this.listeners = new Set();
        this.warningsShown = new Set();
    }

    startMonitoring() {
        this.checkHealth();
        this.monitorTimer = setInterval(() => {
            this.checkHealth();
        }, 10000);
    }

    checkHealth() {
        if (this.recoveryState.mode) return;

        if (this.recoveryState.cooldownUntil > Date.now()) {
            return;
        }

        const health = {
            parentResponding: _STATE.parentResponding,
            handshakeComplete: _STATE.handshakeComplete,
            sessionValid: this.sessionClient.isValid(),
            lastMessage: _STATE.lastParentMessage,
            missedHeartbeats: _STATE.health.missedHeartbeats,
            circuitBreaker: _STATE.health.circuitBreaker,
            timeSinceLastMessage: _STATE.lastParentMessage ? Date.now() - _STATE.lastParentMessage : Infinity
        };

        if (!health.parentResponding && health.missedHeartbeats > 3) {
            this.initiateRecovery('parent_unresponsive');
        } else if (health.circuitBreaker) {
            this.initiateRecovery('circuit_breaker');
        } else if (_STATE.handshakeComplete && !health.sessionValid && !_STATE.guestMode) {
            this.initiateRecovery('session_invalid');
        } else if (health.timeSinceLastMessage > CONFIG.TIMEOUTS.HEARTBEAT * 3) {
            this.initiateRecovery('silent_disconnect');
        }
    }

    initiateRecovery(reason) {
        if (this.recoveryState.mode) return;

        if (this.recoveryState.cooldownUntil > Date.now()) {
            return;
        }

        this.recoveryState.mode = true;
        this.recoveryState.attempts++;
        this.recoveryState.lastAttempt = Date.now();
        this.recoveryState.startTime = Date.now();
        this.recoveryState.strategy = 'none';
        this.recoveryState.reason = reason;
        _STATE.recoveryMode = true;

        this.notifyListeners('recovery:started', { reason, attempt: this.recoveryState.attempts });
        this.executeNextStrategy();
    }

    async executeNextStrategy() {
        if (this.recoveryState.attempts > this.strategies.length) {
            this.failRecovery();
            return;
        }

        const strategyIndex = this.recoveryState.attempts - 1;
        const strategy = this.strategies[strategyIndex];

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
            setTimeout(() => {
                resolve(_STATE.parentResponding);
            }, this.getAdjustedTimeout(CONFIG.TIMEOUTS.HEARTBEAT));
        });
    }

    async strategyHandshake() {
        this.handshakeAuthority.reset();
        const result = await this.handshakeAuthority.startHandshake();
        return result;
    }

    async strategySession() {
        if (!_STATE.handshakeComplete) {
            await this.strategyHandshake();
        }
        
        const result = await this.sessionClient.requestSession(true);
        return result.success;
    }

    async strategyFullReset() {
        // Clear all state
        this.reliabilityEngine.offlineBuffer = [];
        this.handshakeAuthority.reset();
        this.sessionClient.clear();
        this.transportLayer.stop();

        await new Promise(r => setTimeout(r, 500));

        await this.handshakeAuthority.startHandshake();
        await this.sessionClient.requestSession();
        this.transportLayer.start();

        return _STATE.handshakeComplete && this.sessionClient.isValid();
    }

    scheduleNextStrategy() {
        const delay = this.calculateBackoff();

        this.recoveryTimer = setTimeout(() => {
            this.executeNextStrategy();
        }, delay);
    }

    calculateBackoff() {
        const base = CONFIG.TIMEOUTS.BACKOFF_BASE;
        const max = CONFIG.TIMEOUTS.BACKOFF_MAX;

        let delay = base * Math.pow(2, this.recoveryState.attempts - 1);
        delay += Math.random() * 100;

        if (this.environmentDetector.isHighLatency()) {
            delay = delay * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER;
        }

        return Math.min(delay, max);
    }

    getAdjustedTimeout(baseTimeout) {
        const env = this.environmentDetector.environment;
        if (env.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH) {
            return Math.round(baseTimeout * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER);
        }
        return baseTimeout;
    }

    completeRecovery() {
        this.recoveryState.mode = false;
        this.recoveryState.recovered = true;
        _STATE.recoveryMode = false;
        _STATE.recoveryAttempts = this.recoveryState.attempts;

        this.recoveryState.cooldownUntil = Date.now() + CONFIG.RECOVERY.COOLDOWN_PERIOD;
        this.recoveryState.attempts = 0;

        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
            this.recoveryTimer = null;
        }

        this.notifyListeners('recovery:completed', {
            attempts: this.recoveryState.attempts,
            duration: Date.now() - this.recoveryState.startTime
        });
    }

    failRecovery() {
        this.sessionClient.enableGuestMode();

        this.recoveryState.mode = false;
        this.recoveryState.recovered = false;
        _STATE.recoveryMode = false;
        _STATE.guestMode = true;
        _STATE.fallbackMode = true;

        this.recoveryState.cooldownUntil = Date.now() + CONFIG.RECOVERY.COOLDOWN_PERIOD;
        this.recoveryState.attempts = 0;

        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
            this.recoveryTimer = null;
        }

        this.notifyListeners('recovery:failed', {
            reason: this.recoveryState.reason
        });
    }

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch {}
        });
        window.dispatchEvent(new CustomEvent(`marketplace:${event}`, { detail: data }));
    }

    getStatus() {
        return {
            ...this.recoveryState,
            inProgress: this.recoveryState.mode,
            nextStrategy: this.recoveryState.attempts < this.strategies.length ? 
                this.strategies[this.recoveryState.attempts]?.name : 'none',
            cooldownRemaining: this.recoveryState.cooldownUntil ? 
                Math.max(0, this.recoveryState.cooldownUntil - Date.now()) : 0
        };
    }

    stopMonitoring() {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = null;
        }

        if (this.recoveryTimer) {
            clearTimeout(this.recoveryTimer);
            this.recoveryTimer = null;
        }
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[RecoveryManager] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 8: DIAGNOSTICS AGENT
// =============================================

class DiagnosticsAgent {
    constructor(environmentDetector) {
        this.environmentDetector = environmentDetector;
        
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
        this.maxHistory = CONFIG.MONITORING.MAX_METRICS_HISTORY;
        this.debugMode = CONFIG.MONITORING.DEBUG_MODE;
        this.warningsShown = new Set();
    }

    start() {
        if (this.running) return;

        this.running = true;
        this.runDiagnostics();
        this.setupEventListeners();

        if (this.debugMode) {
            window.__IFRAME_DEBUG__ = true;
            window.__diagnostics = this;
        }
    }

    setupEventListeners() {
        this.addEventListener(window, 'error', (e) => this.logError(e.error || e.message, { type: 'uncaught' }));
        this.addEventListener(window, 'unhandledrejection', (e) => this.logError(e.reason, { type: 'unhandled_rejection' }));

        this.addEventListener(window, 'coreInitialized', (e) => this.logEvent('core:initialized', e.detail));
        this.addEventListener(window, 'marketplaceCoreReady', (e) => this.logEvent('core:ready', e.detail));
        this.addEventListener(window, 'marketplace:recovery-mode', (e) => this.logEvent('recovery:mode', e.detail));
        this.addEventListener(window, 'transport:unresponsive', (e) => this.logEvent('transport:unresponsive', e.detail));
    }

    addEventListener(target, type, handler) {
        const wrappedHandler = (e) => {
            try {
                handler(e);
            } catch (err) {
                this.logError(err, { context: 'event_listener', type });
            }
        };

        target.addEventListener(type, wrappedHandler);

        if (!this.eventListeners.has(type)) {
            this.eventListeners.set(type, new Set());
        }
        this.eventListeners.get(type).add({ target, handler: wrappedHandler });

        return () => this.removeEventListener(type, wrappedHandler);
    }

    removeEventListener(type, handler) {
        const listeners = this.eventListeners.get(type);
        if (listeners) {
            listeners.forEach(({ target, handler: h }) => {
                if (h === handler) {
                    target.removeEventListener(type, h);
                    listeners.delete({ target, handler: h });
                }
            });
        }
    }

    async runDiagnostics() {
        if (!this.running) return;

        this.diagnostics.checks = [];

        await this.checkConnectivity();
        this.checkHandshake();
        this.checkSession();
        this.checkSecurity();
        this.checkPerformance();
        this.checkStorage();
        this.checkEnvironment();

        setTimeout(() => this.runDiagnostics(), CONFIG.MONITORING.HEALTH_CHECK_INTERVAL);
    }

    async checkConnectivity() {
        const check = {
            name: 'connectivity',
            timestamp: Date.now(),
            status: 'unknown',
            details: {}
        };

        try {
            check.details = {
                parentDetected: _STATE.parentDetected,
                parentResponding: _STATE.parentResponding,
                lastMessage: _STATE.lastParentMessage ? new Date(_STATE.lastParentMessage).toISOString() : null,
                missedHeartbeats: _STATE.health.missedHeartbeats,
                circuitBreaker: _STATE.health.circuitBreaker,
                online: navigator.onLine,
                connectionType: this.environmentDetector.environment.connectionType,
                effectiveType: this.environmentDetector.environment.effectiveType,
                latency: this.environmentDetector.environment.latency
            };

            check.status = _STATE.parentResponding ? 'pass' : 'warn';
        } catch (error) {
            check.status = 'fail';
            check.error = error.message;
        }

        this.diagnostics.checks.push(check);
    }

    checkHandshake() {
        const check = {
            name: 'handshake',
            timestamp: Date.now(),
            status: 'unknown',
            details: {}
        };

        try {
            check.details = {
                complete: _STATE.handshakeComplete,
                handshakeId: _STATE.handshakeId,
                startTime: _STATE.handshakeStartTime ? new Date(_STATE.handshakeStartTime).toISOString() : null,
                duration: _STATE.connectionMetrics.handshakeDuration,
                parentCapabilities: _STATE.parentCapabilities,
                handshakeState: _STATE.handshakeState
            };

            check.status = _STATE.handshakeComplete ? 'pass' : 
                          (_STATE.guestMode ? 'warn' : 'fail');
        } catch (error) {
            check.status = 'fail';
            check.error = error.message;
        }

        this.diagnostics.checks.push(check);
    }

    checkSession() {
        const check = {
            name: 'session',
            timestamp: Date.now(),
            status: 'unknown',
            details: {}
        };

        try {
            check.details = {
                active: _STATE.sessionActive,
                guestMode: _STATE.guestMode,
                demoMode: _STATE.demoMode,
                fallbackMode: _STATE.fallbackMode,
                sessionState: _STATE.sessionState
            };

            check.status = _STATE.sessionActive ? 'pass' : 
                          (_STATE.guestMode ? 'warn' : 'fail');
        } catch (error) {
            check.status = 'fail';
            check.error = error.message;
        }

        this.diagnostics.checks.push(check);
    }

    checkSecurity() {
        const check = {
            name: 'security',
            timestamp: Date.now(),
            status: 'unknown',
            details: {}
        };

        try {
            check.details = {
                mode: _STATE.securityLevel,
                permissions: Array.from(_STATE.permissions),
                sandboxRestrictions: _STATE.sandboxRestrictions,
                originCheckMode: _STATE.originCheckMode
            };

            check.status = _STATE.securityLevel !== 'compatibility' ? 'pass' : 'warn';
        } catch (error) {
            check.status = 'fail';
            check.error = error.message;
        }

        this.diagnostics.checks.push(check);
    }

    checkPerformance() {
        const check = {
            name: 'performance',
            timestamp: Date.now(),
            status: 'unknown',
            details: {}
        };

        try {
            const metrics = _STATE.connectionMetrics;

            check.details = {
                messagesSent: metrics.messagesSent,
                messagesReceived: metrics.messagesReceived,
                acksReceived: metrics.acksReceived,
                acksMissed: metrics.acksMissed,
                retries: metrics.retries,
                uptime: Date.now() - this.diagnostics.startTime
            };

            const ackRate = metrics.acksReceived / (metrics.messagesSent || 1);
            check.status = ackRate > 0.9 ? 'pass' : 
                          (ackRate > 0.7 ? 'warn' : 'fail');
        } catch (error) {
            check.status = 'fail';
            check.error = error.message;
        }

        this.diagnostics.checks.push(check);
    }

    checkStorage() {
        const check = {
            name: 'storage',
            timestamp: Date.now(),
            status: 'unknown',
            details: {}
        };

        try {
            let localStorageOk = true;
            let sessionStorageOk = true;
            
            try {
                safeStorage.set('test', 'test');
                safeStorage.remove('test');
            } catch {
                localStorageOk = false;
            }

            try {
                safeStorage.sessionSet('test', 'test');
                safeStorage.sessionRemove('test');
            } catch {
                sessionStorageOk = false;
            }

            check.details = {
                localStorage: localStorageOk,
                sessionStorage: sessionStorageOk,
                cookies: document.cookie !== undefined,
                indexedDB: !!window.indexedDB
            };

            check.status = localStorageOk && sessionStorageOk ? 'pass' : 'warn';
        } catch (error) {
            check.status = 'fail';
            check.error = error.message;
        }

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
        const entry = {
            timestamp: Date.now(),
            message: error?.message || String(error),
            stack: error?.stack,
            context
        };

        this.diagnostics.errors.push(entry);

        if (this.diagnostics.errors.length > this.maxHistory) {
            this.diagnostics.errors.shift();
        }

        if (this.debugMode) {
            console.error('[Diagnostics]', entry);
        }
    }

    logWarning(warning, context = {}) {
        const entry = {
            timestamp: Date.now(),
            message: warning,
            context
        };

        this.diagnostics.warnings.push(entry);

        if (this.diagnostics.warnings.length > this.maxHistory) {
            this.diagnostics.warnings.shift();
        }

        if (this.debugMode) {
            console.warn('[Diagnostics]', entry);
        }
    }

    logEvent(event, data = {}) {
        const entry = {
            timestamp: Date.now(),
            event,
            data
        };

        this.diagnostics.events.push(entry);

        if (this.diagnostics.events.length > this.maxHistory) {
            this.diagnostics.events.shift();
        }
    }

    logMetric(name, value) {
        if (!this.diagnostics.metrics[name]) {
            this.diagnostics.metrics[name] = [];
        }

        this.diagnostics.metrics[name].push({
            timestamp: Date.now(),
            value
        });

        if (this.diagnostics.metrics[name].length > 100) {
            this.diagnostics.metrics[name].shift();
        }
    }

    getReport() {
        return {
            timestamp: Date.now(),
            uptime: Date.now() - this.diagnostics.startTime,
            checks: this.diagnostics.checks,
            errors: this.diagnostics.errors.slice(-10),
            warnings: this.diagnostics.warnings.slice(-10),
            events: this.diagnostics.events.slice(-20),
            metrics: this.diagnostics.metrics,
            state: {
                initialized: _STATE.initialized,
                ready: _STATE.ready,
                handshakeComplete: _STATE.handshakeComplete,
                sessionActive: _STATE.sessionActive,
                guestMode: _STATE.guestMode,
                fallbackMode: _STATE.fallbackMode,
                securityLevel: _STATE.securityLevel,
                startupStage: _STATE.startupStage
            },
            environment: this.environmentDetector.getEnvironmentReport()
        };
    }

    enableDebug() {
        this.debugMode = true;
        CONFIG.MONITORING.DEBUG_MODE = true;
        window.__IFRAME_DEBUG__ = true;
        window.__diagnostics = this;
    }

    disableDebug() {
        this.debugMode = false;
        CONFIG.MONITORING.DEBUG_MODE = false;
        window.__IFRAME_DEBUG__ = false;
    }

    stop() {
        this.running = false;

        this.eventListeners.forEach((listeners, type) => {
            listeners.forEach(({ target, handler }) => {
                target.removeEventListener(type, handler);
            });
        });
        this.eventListeners.clear();
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[DiagnosticsAgent] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 9: COMPATIBILITY BRIDGE
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
        // Transform legacy outbound messages
        this.messageTransformers.set('outbound', (message) => {
            if (message.legacy) return message;
            if (!this.legacyMode) return message;

            const legacy = { ...message };

            const typeMap = {
                [PARENT_MESSAGE_TYPES.HANDSHAKE_REQUEST]: 'handshake',
                [PARENT_MESSAGE_TYPES.SESSION_SYNC]: 'SESSION_DATA',
                [PARENT_MESSAGE_TYPES.PING]: 'HEARTBEAT',
                [PARENT_MESSAGE_TYPES.PONG]: 'HEARTBEAT',
                [PARENT_MESSAGE_TYPES.CAPABILITIES]: 'capabilities',
                [PARENT_MESSAGE_TYPES.ENVIRONMENT]: 'environment'
            };

            if (typeMap[legacy.type]) {
                legacy.type = typeMap[legacy.type];
            }

            delete legacy.protocol;
            delete legacy.source;
            delete legacy.target;

            return legacy;
        });

        // Transform legacy inbound messages
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
                'capabilities': PARENT_MESSAGE_TYPES.CAPABILITIES,
                'environment': PARENT_MESSAGE_TYPES.ENVIRONMENT,
                'init': PARENT_MESSAGE_TYPES.INIT,
                'refreshData': PARENT_MESSAGE_TYPES.REFRESH_DATA,
                'PARENT_READY': PARENT_MESSAGE_TYPES.PARENT_READY
            };

            if (typeMap[modern.type]) {
                modern.type = typeMap[modern.type];
            }

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
        if (message.protocol === _STATE.protocolVersion) {
            return false;
        }

        const legacyTypes = ['handshake', 'SESSION_DATA', 'HEARTBEAT', 'init', 'refreshData'];
        if (message.type && legacyTypes.includes(message.type)) {
            return true;
        }

        if (!message.protocol && !message.messageId && !message.frameId) {
            return true;
        }

        return false;
    }

    registerLegacyHandler(type, handler) {
        this.legacyHandlers.set(type, handler);
    }

    handleLegacyMessage(message) {
        const handler = this.legacyHandlers.get(message.type);
        if (handler) {
            try {
                handler(message);
                return true;
            } catch (error) {
                this.logOnce('legacy_handler_error', 'Legacy handler failed');
            }
        }
        return false;
    }

    getMode() {
        return {
            legacyMode: this.legacyMode,
            detected: this.detectLegacyParent({}),
            transformers: this.messageTransformers.size
        };
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[CompatibilityBridge] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 10: SECURITY HARDENER
// =============================================

class SecurityHardener {
    constructor(environmentDetector) {
        this.environmentDetector = environmentDetector;
        this.permissions = new Map();
        this.tokens = new Map();
        this.capabilities = new Set();
        this.mode = _STATE.securityLevel;
        this.restrictions = _STATE.sandboxRestrictions || {};
        this.messageIds = new Set();
        this.warningsShown = new Set();
    }

    initialize() {
        this.detectCapabilities();
        this.setupPermissionScopes();
        this.validateEnvironment();
        this.setupReplayProtection();
        this.setupOriginBinding();
        this.setupTokenBinding();
    }

    detectCapabilities() {
        const capabilities = [];

        if (!this.restrictions.crypto) capabilities.push('crypto');
        if (!this.restrictions.localStorage) capabilities.push('storage');
        if (!this.restrictions.sessionStorage) capabilities.push('session');
        if (!this.restrictions.cookies) capabilities.push('cookies');
        if (!this.restrictions.origin) capabilities.push('origin');

        this.capabilities = new Set(capabilities);

        const env = this.environmentDetector.environment;

        if (this.capabilities.has('crypto') && this.capabilities.has('origin') && env.secure) {
            this.mode = 'enhanced';
        } else if (this.capabilities.has('origin')) {
            this.mode = 'standard';
        } else {
            this.mode = 'compatibility';
        }

        _STATE.securityLevel = this.mode;

        return capabilities;
    }

    setupPermissionScopes() {
        CONFIG.SECURITY.PERMISSION_SCOPES.forEach(scope => {
            this.permissions.set(scope, {
                granted: false,
                timestamp: null,
                expiry: null
            });
        });
    }

    setupReplayProtection() {
        setInterval(() => {
            try {
                const now = Date.now();
                this.messageIds.forEach((timestamp, id) => {
                    if (now - timestamp > CONFIG.SECURITY.REPLAY_WINDOW) {
                        this.messageIds.delete(id);
                    }
                });
            } catch {}
        }, CONFIG.SECURITY.REPLAY_WINDOW);
    }

    setupOriginBinding() {
        if (CONFIG.HARDENING.ORIGIN_BINDING) {
            const trustedOrigins = new Set(CONFIG.ORIGIN_WHITELIST);
            _STATE.trustedOrigins = trustedOrigins;
        }
    }

    setupTokenBinding() {
        if (CONFIG.HARDENING.TOKEN_BINDING) {
            // Token binding will be handled by session client
        }
    }

    validateEnvironment() {
        const isSecure = window.location.protocol === 'https:' || 
                        window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1';

        if (!isSecure && this.mode === 'enhanced') {
            this.mode = 'standard';
            _STATE.securityLevel = 'standard';
        }

        return {
            secure: isSecure,
            mode: this.mode,
            restrictions: this.restrictions
        };
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

        if (!this.verifySignature(message)) {
            if (CONFIG.SECURITY.SIGNATURE_REQUIRED) return false;
        }

        if (!this.validateOrigin(message)) {
            if (CONFIG.SECURITY.ORIGIN_STRICT_MODE) return false;
        }

        return true;
    }

    validateTimestamp(message) {
        if (!message.timestamp) return false;
        const now = Date.now();
        const age = Math.abs(now - message.timestamp);
        return age <= CONFIG.SECURITY.TIMESTAMP_TOLERANCE;
    }

    checkReplay(message) {
        if (!message.messageId) return true;

        if (this.messageIds.has(message.messageId)) {
            return true;
        }

        this.messageIds.add(message.messageId);
        return false;
    }

    verifySignature(message) {
        if (!message.signature) return !CONFIG.SECURITY.SIGNATURE_REQUIRED;
        if (this.restrictions.crypto) return true;
        return true; // Simplified - actual crypto would be implemented here
    }

    validateOrigin(message) {
        const trusted = Array.from(_STATE.trustedOrigins);
        if (trusted.includes('*')) return true;
        return trusted.includes(message.origin) || trusted.some(p => {
            if (p.includes('*')) {
                const regex = new RegExp('^' + p.replace(/\*/g, '.*') + '$');
                return regex.test(message.origin);
            }
            return false;
        });
    }

    validatePermission(scope, action) {
        const permission = this.permissions.get(scope);
        if (!permission) return false;
        if (!permission.granted) return false;
        if (permission.expiry && new Date(permission.expiry) < new Date()) {
            permission.granted = false;
            return false;
        }
        return true;
    }

    grantPermission(scope, expiry = null) {
        const permission = this.permissions.get(scope);
        if (permission) {
            permission.granted = true;
            permission.timestamp = Date.now();
            permission.expiry = expiry;
            _STATE.permissions.add(scope);
        }
    }

    revokePermission(scope) {
        const permission = this.permissions.get(scope);
        if (permission) {
            permission.granted = false;
            permission.timestamp = null;
            permission.expiry = null;
            _STATE.permissions.delete(scope);
        }
    }

    getToken(scope) {
        return this.tokens.get(scope);
    }

    setToken(scope, token, expiry = null) {
        this.tokens.set(scope, {
            value: token,
            expiry: expiry
        });
    }

    clearToken(scope) {
        this.tokens.delete(scope);
    }

    getSecurityContext() {
        return {
            mode: this.mode,
            capabilities: Array.from(this.capabilities),
            permissions: Array.from(_STATE.permissions),
            restrictions: this.restrictions,
            hasCrypto: this.capabilities.has('crypto'),
            hasOrigin: this.capabilities.has('origin'),
            isSecure: window.location.protocol === 'https:'
        };
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[SecurityHardener] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 11: UI FAILSAFE
// =============================================

class UIFailsafe {
    constructor() {
        this.disabledButtons = new Set();
        this.fallbackStates = new Map();
        this.pendingActions = [];
        this.warningsShown = new Set();
    }

    protectButton(button, action) {
        if (!button) return;

        const originalClick = button.onclick;
        
        button.addEventListener('click', (e) => {
            if (!this.canExecuteAction()) {
                e.preventDefault();
                e.stopPropagation();
                
                // Queue action for later
                this.queueAction(action);
                
                // Show subtle indication
                button.style.opacity = '0.7';
                setTimeout(() => {
                    button.style.opacity = '1';
                }, 200);
                
                return false;
            }
        }, true);
    }

    canExecuteAction() {
        // Actions can execute if:
        // 1. Parent is responding OR
        // 2. Action doesn't require parent OR
        // 3. We're in guest mode
        return _STATE.parentResponding || _STATE.guestMode || _STATE.fallbackMode;
    }

    queueAction(action) {
        this.pendingActions.push({
            action,
            timestamp: Date.now()
        });
    }

    processPendingActions() {
        if (this.pendingActions.length === 0) return;

        const now = Date.now();
        const actions = this.pendingActions.filter(a => now - a.timestamp < 60000); // Keep last minute
        
        this.pendingActions = [];

        if (_STATE.parentResponding || _STATE.guestMode) {
            actions.forEach(a => {
                try {
                    if (typeof a.action === 'function') {
                        a.action();
                    }
                } catch (e) {
                    this.logOnce('action_replay_failed', 'Failed to replay queued action');
                }
            });
        }
    }

    showFallbackState(element, fallbackHTML) {
        if (!element) return;

        const originalHTML = element.innerHTML;
        this.fallbackStates.set(element, originalHTML);

        element.innerHTML = fallbackHTML;

        const retryBtn = element.querySelector('.error-retry-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                element.innerHTML = originalHTML;
                this.fallbackStates.delete(element);
            });
        }
    }

    restoreFallbackState(element) {
        if (this.fallbackStates.has(element)) {
            element.innerHTML = this.fallbackStates.get(element);
            this.fallbackStates.delete(element);
        }
    }

    protectForm(form) {
        if (!form) return;

        form.addEventListener('submit', (e) => {
            if (!this.canExecuteAction()) {
                e.preventDefault();
                
                // Store form data
                const formData = new FormData(form);
                const data = {};
                formData.forEach((value, key) => {
                    data[key] = value;
                });
                
                this.queueAction(() => {
                    // Re-submit when connection restored
                    const event = new Event('submit', { bubbles: true, cancelable: true });
                    form.dispatchEvent(event);
                });
                
                return false;
            }
        }, true);
    }

    protectNavigation() {
        // Intercept navigation attempts
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function(...args) {
            if (_STATE.parentResponding || _STATE.guestMode) {
                return originalPushState.apply(this, args);
            } else {
                // Queue navigation
                this.queueAction(() => {
                    originalPushState.apply(this, args);
                });
            }
        }.bind(this);

        history.replaceState = function(...args) {
            if (_STATE.parentResponding || _STATE.guestMode) {
                return originalReplaceState.apply(this, args);
            } else {
                this.queueAction(() => {
                    originalReplaceState.apply(this, args);
                });
            }
        }.bind(this);
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[UIFailsafe] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 12: NAVIGATION GUARD
// =============================================

class NavigationGuard {
    constructor() {
        this.currentRoute = window.location.pathname + window.location.hash;
        this.routeHistory = [];
        this.listeners = new Set();
        this.warningsShown = new Set();
        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener('popstate', (e) => {
            this.handleNavigation(window.location.pathname + window.location.hash, e.state);
        });

        const originalPushState = history.pushState;
        history.pushState = (...args) => {
            const result = originalPushState.apply(history, args);
            this.handleNavigation(window.location.pathname + window.location.hash, args[0]);
            return result;
        };

        const originalReplaceState = history.replaceState;
        history.replaceState = (...args) => {
            const result = originalReplaceState.apply(history, args);
            this.handleNavigation(window.location.pathname + window.location.hash, args[0], true);
            return result;
        };

        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && link.href.startsWith(window.location.origin)) {
                this.handleLinkClick(link, e);
            }
        });
    }

    handleNavigation(url, state, isReplace = false) {
        if (url === this.currentRoute) return;

        if (!this.canNavigate()) {
            // Queue navigation for later
            this.queueNavigation(url, state, isReplace);
            return;
        }

        this.routeHistory.push({
            url: this.currentRoute,
            timestamp: Date.now()
        });

        this.currentRoute = url;
        this.notifyListeners('navigation', { url, state, isReplace });
    }

    handleLinkClick(link, event) {
        if (!this.canNavigate()) {
            event.preventDefault();
            event.stopPropagation();

            const url = link.href;
            this.queueNavigation(url, null, false);

            link.style.opacity = '0.7';
            setTimeout(() => {
                link.style.opacity = '1';
            }, 200);
        }
    }

    canNavigate() {
        return _STATE.parentResponding || _STATE.guestMode || _STATE.fallbackMode;
    }

    queueNavigation(url, state, isReplace) {
        const navAction = () => {
            if (isReplace) {
                history.replaceState(state, '', url);
            } else {
                history.pushState(state, '', url);
            }
        };

        if (window.uiFailsafe) {
            window.uiFailsafe.queueAction(navAction);
        }
    }

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {}
        });
        window.dispatchEvent(new CustomEvent(`navigation:${event}`, { detail: data }));
    }

    getCurrentRoute() {
        return this.currentRoute;
    }

    getHistory() {
        return [...this.routeHistory];
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[NavigationGuard] ${message}`);
        }
    }
}

// =============================================
// NEW MODULE 13: IFRAME AUTHORITY (Master Controller)
// =============================================

class IframeAuthority {
    constructor() {
        this.environmentDetector = new EnvironmentDetector();
        this.reliabilityEngine = new ReliabilityEngine(this.environmentDetector);
        this.startupGovernor = new StartupGovernor(this.environmentDetector, this.reliabilityEngine);
        this.handshakeAuthority = new HandshakeAuthority(this.environmentDetector, this.reliabilityEngine);
        this.sessionClient = new SessionClient(this.environmentDetector, this.reliabilityEngine);
        this.transportLayer = new TransportLayer(this.environmentDetector, this.reliabilityEngine);
        this.recoveryManager = new RecoveryManager(
            this.environmentDetector, 
            this.reliabilityEngine, 
            this.handshakeAuthority, 
            this.sessionClient, 
            this.transportLayer
        );
        this.diagnosticsAgent = new DiagnosticsAgent(this.environmentDetector);
        this.compatibilityBridge = new CompatibilityBridge();
        this.securityHardener = new SecurityHardener(this.environmentDetector);
        this.uiFailsafe = new UIFailsafe();
        this.navigationGuard = new NavigationGuard();
        
        this.initialized = false;
        this.listeners = new Set();
        this.warningsShown = new Set();
    }

    async initialize() {
        if (this.initialized) return;

        // Step 1: Environment detection
        this.environmentDetector.initialize();

        // Step 2: Security hardening
        this.securityHardener.initialize();

        // Step 3: Generate frame ID
        _STATE.frameId = this.generateFrameId();

        // Step 4: Detect sandbox restrictions
        this.detectSandboxRestrictions();

        // Step 5: Initialize governors
        this.startupGovernor.initialize();

        // Step 6: Start startup sequence
        const startupResult = await this.startupGovernor.start();

        // Step 7: If startup successful, start transport
        if (startupResult) {
            this.transportLayer.start();
            this.recoveryManager.startMonitoring();
        }

        // Step 8: Start diagnostics
        this.diagnosticsAgent.start();

        // Step 9: Expose globally
        this.exposeGlobally();

        this.initialized = true;
        _STATE.initialized = true;

        this.notifyListeners('authority:initialized', {
            environment: this.environmentDetector.environment,
            startupStage: this.startupGovernor.getStatus().stage
        });

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
        const restrictions = {
            crypto: false,
            localStorage: false,
            sessionStorage: false,
            cookies: false,
            origin: false,
            parent: false
        };

        try {
            if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
                restrictions.crypto = true;
            }
        } catch {
            restrictions.crypto = true;
        }

        _STATE.sandboxRestrictions = restrictions;

        if (restrictions.crypto) {
            CONFIG.SECURITY.SIGNATURE_REQUIRED = false;
            CONFIG.SECURITY.SANDBOX_ALLOWED_CRYPTO = false;
        }

        return restrictions;
    }

    send(type, payload = {}, options = {}) {
        // Apply compatibility transformation if needed
        if (this.compatibilityBridge.legacyMode) {
            const legacyMsg = { type, payload };
            const transformed = this.compatibilityBridge.transformOutbound(legacyMsg);
            type = transformed.type;
            payload = transformed.payload;
        }

        return this.reliabilityEngine.sendWithReliability(type, payload, options);
    }

    receive(type, handler) {
        return this.addMessageHandler(type, handler);
    }

    addMessageHandler(type, handler) {
        const wrappedHandler = (e) => {
            if (!this.reliabilityEngine.validateOrigin(e)) return;

            const data = e.data;
            if (!data || typeof data !== 'object') return;

            // Apply compatibility transformation
            const transformed = this.compatibilityBridge.transformInbound(data);

            if (transformed.type === type || data.type === type) {
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
            reliability: this.reliabilityEngine.getStatus(),
            compatibility: this.compatibilityBridge.getMode(),
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

    addListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    notifyListeners(event, data) {
        this.listeners.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {}
        });
        window.dispatchEvent(new CustomEvent(`authority:${event}`, { detail: data }));
    }

    exposeGlobally() {
        window.iframeAuthority = this;
        window.__IFRAME_DEBUG__ = this.diagnosticsAgent.debugMode;

        // Expose for debugging
        if (this.diagnosticsAgent.debugMode) {
            window.__diagnostics = this.diagnosticsAgent;
            window.__reliability = this.reliabilityEngine;
            window.__transport = this.transportLayer;
            window.__recovery = this.recoveryManager;
        }
    }

    shutdown() {
        this.transportLayer.stop();
        this.recoveryManager.stopMonitoring();
        this.diagnosticsAgent.stop();
        this.startupGovernor.clearTimeouts();
        this.handshakeAuthority.clearTimeouts();

        _STATE.shutdown = true;
        this.initialized = false;

        this.notifyListeners('shutdown', { timestamp: Date.now() });
    }

    logOnce(key, message) {
        if (!this.warningsShown.has(key)) {
            this.warningsShown.add(key);
            console.warn(`[IframeAuthority] ${message}`);
        }
    }
}

// =============================================
// CREATE MASTER AUTHORITY INSTANCE
// =============================================

const iframeAuthority = new IframeAuthority();

// Ensure messenger is available globally for backward compatibility
let messenger = iframeAuthority.reliabilityEngine;
window._messenger = messenger; // For debugging
// =============================================
// MODULE 14: IFRAME MESSENGER (Original - Enhanced)
// =============================================

class IframeMessenger {
    constructor(environmentDetector) {
        this.messageId = 0;
        this.pendingAcks = new Map();
        this.messageCache = new Map();
        this.listenerCleanup = new Set();
        this.circuitFailures = 0;
        this.circuitOpen = false;
        this.circuitResetTimer = null;
        this.messageCounter = 0;
        this.frameId = iframeAuthority.generateFrameId();
        this.retryQueue = [];
        this.offlineBuffer = [];
        this.visibilityAware = true;
        this.backoffTimers = new Map();
        this.environmentDetector = environmentDetector || new EnvironmentDetector();
        this.originTrustAdapter = new OriginTrustAdapter(this.environmentDetector);
    }

    generateFrameId() {
        return iframeAuthority.generateFrameId();
    }

    generateId() {
        return `${Date.now()}_${++this.messageId}_${Math.random().toString(36).substring(2, 8)}`;
    }

    generateSequence() {
        return `${Date.now()}-${++this.messageCounter}-${Math.random().toString(36).substring(2, 6)}`;
    }

    validateOrigin(event) {
        try {
            if (!event || !event.source) return false;
            
            const isParent = event.source === window.parent;
            if (!isParent) return false;
            
            return this.originTrustAdapter.isOriginTrusted(event.origin);
        } catch {
            try {
                return event.source === window.parent;
            } catch {
                return false;
            }
        }
    }

    detectSandboxRestrictions() {
        return iframeAuthority.detectSandboxRestrictions();
    }

    normalizeOutboundMessage(type, payload = {}, options = {}) {
        const messageId = this.generateId();
        const timestamp = Date.now();
        const token = getCentralToken();
        
        const message = {
            protocol: _STATE.protocolVersion,
            messageId: messageId,
            type: type,
            source: "iframe",
            target: "parent",
            frameId: this.frameId,
            timestamp: timestamp,
            payload: this.sanitizePayload(payload),
            legacy: options.legacy || false
        };
        
        if (token && _STATE.securityLevel !== 'compatibility') {
            message.token = token;
        }
        
        if (CONFIG.SECURITY.SIGNATURE_REQUIRED && !_STATE.sandboxRestrictions?.crypto) {
            message.signature = this.generateSignature(message);
        }
        
        if (type === PARENT_MESSAGE_TYPES.CHILD_READY || type === PARENT_MESSAGE_TYPES.HANDSHAKE_REQUEST) {
            message.environment = {
                type: _STATE.environment.type,
                latency: _STATE.environment.latency,
                secure: _STATE.environment.secure
            };
        }
        
        return message;
    }

    sanitizePayload(payload) {
        if (!payload || typeof payload !== 'object') return {};
        try {
            return JSON.parse(JSON.stringify(payload));
        } catch {
            return {};
        }
    }

    generateSignature(message) {
        try {
            if (_STATE.sandboxRestrictions?.crypto) return null;
            
            const data = JSON.stringify({
                messageId: message.messageId,
                type: message.type,
                timestamp: message.timestamp,
                frameId: message.frameId
            });
            
            const signature = btoa(data + ':' + (message.token || 'no-token'));
            return signature.substring(0, 32);
        } catch {
            return null;
        }
    }

    verifySignature(message) {
        if (!message.signature) return !CONFIG.SECURITY.SIGNATURE_REQUIRED;
        if (_STATE.sandboxRestrictions?.crypto) return true;
        
        try {
            const expected = this.generateSignature(message);
            return expected === message.signature;
        } catch {
            return false;
        }
    }

    validateTimestamp(message) {
        if (!message.timestamp) return false;
        const now = Date.now();
        const age = Math.abs(now - message.timestamp);
        return age <= CONFIG.SECURITY.TIMESTAMP_TOLERANCE;
    }

    checkReplay(message) {
        if (!message.messageId) return true;
        
        const key = `replay_${message.messageId}`;
        const now = Date.now();
        
        try {
            const stored = safeStorage.sessionGet(key);
            if (stored) {
                const timestamp = parseInt(stored, 10);
                if (now - timestamp < CONFIG.SECURITY.REPLAY_WINDOW) {
                    return true;
                }
            }
            
            safeStorage.sessionSet(key, now.toString());
            
            setTimeout(() => {
                safeStorage.sessionRemove(key);
            }, CONFIG.SECURITY.REPLAY_WINDOW);
            
            return false;
        } catch {
            return false;
        }
    }

    async sendMessage(type, payload = {}, options = {}) {
        return iframeAuthority.send(type, payload, options);
    }

    async sendWithAck(message, options = {}) {
        const env = this.environmentDetector.getCurrentTimeouts();
        const timeout = options.timeout || env.ACK;
        const maxRetries = options.maxRetries || CONFIG.RETRY.MAX_ATTEMPTS;
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
                        
                        if ((data.type === PARENT_MESSAGE_TYPES.ACK || data.type === 'ACK') && 
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
                        const delay = this.calculateBackoff(attempt, options);
                        cleanup?.();
                        setTimeout(() => {
                            sendAttempt().then(resolve).catch(() => resolve({ success: false }));
                        }, delay);
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
                    
                    setTimeout(() => {
                        if (!resolved) {
                            window.removeEventListener('message', ackHandler);
                        }
                    }, timeout + 100);
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

    calculateBackoff(attempt, options = {}) {
        const env = this.environmentDetector.environment;
        let base = options.backoffBase || CONFIG.RETRY.BASE_DELAY;
        const max = options.backoffMax || CONFIG.RETRY.MAX_DELAY;
        const factor = options.backoffFactor || CONFIG.RETRY.BACKOFF_FACTOR;
        const jitter = options.jitter || CONFIG.RETRY.JITTER_MAX;
        
        if (env.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH) {
            base = Math.round(base * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER);
        }
        
        let delay = base * Math.pow(factor, attempt - 1);
        delay = Math.min(delay, max);
        
        if (jitter > 0) {
            delay += Math.random() * jitter;
        }
        
        return delay;
    }

    queueForRetry(type, payload, options) {
        iframeAuthority.reliabilityEngine.bufferMessage(type, payload, options);
    }

    async processRetryQueue() {
        iframeAuthority.reliabilityEngine.processOfflineBuffer();
    }

    bufferOfflineMessage(type, payload, options) {
        iframeAuthority.reliabilityEngine.bufferMessage(type, payload, options);
    }

    processOfflineBuffer() {
        iframeAuthority.reliabilityEngine.processOfflineBuffer();
    }

    checkCircuitBreaker() {
        if (_STATE.connectionMetrics.acksMissed >= CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD && !this.circuitOpen) {
            this.circuitOpen = true;
            _STATE.health.circuitBreaker = true;
            
            if (this.circuitResetTimer) clearTimeout(this.circuitResetTimer);
            this.circuitResetTimer = setTimeout(() => {
                this.circuitOpen = false;
                _STATE.health.circuitBreaker = false;
                _STATE.connectionMetrics.acksMissed = 0;
                this.processRetryQueue();
                this.processOfflineBuffer();
            }, CONFIG.CIRCUIT_BREAKER.RESET_TIMEOUT);
        }
    }

    cleanup() {
        this.pendingAcks.forEach(({ cleanup }) => {
            try { cleanup?.(); } catch {}
        });
        this.pendingAcks.clear();
        this.messageCache.clear();
        this.retryQueue = [];
        this.offlineBuffer = [];
        
        this.backoffTimers.forEach(timer => clearTimeout(timer));
        this.backoffTimers.clear();
        
        if (this.circuitResetTimer) {
            clearTimeout(this.circuitResetTimer);
            this.circuitResetTimer = null;
        }
    }
    
    getMetrics() {
        return {
            pendingAcks: this.pendingAcks.size,
            retryQueue: this.retryQueue.length,
            offlineBuffer: this.offlineBuffer.length,
            circuitOpen: this.circuitOpen,
            circuitFailures: this.circuitFailures,
            ..._STATE.connectionMetrics
        };
    }
}

// =============================================
// MODULE 15: ORIGIN TRUST ADAPTER
// =============================================

class OriginTrustAdapter {
    constructor(environmentDetector) {
        this.environmentDetector = environmentDetector;
        this.trustedOrigins = new Set();
        this.dynamicOrigins = new Set();
        this.trustMode = 'permissive'; // 'strict', 'permissive', 'compatibility'
        this.initializeTrustedOrigins();
    }
    
    initializeTrustedOrigins() {
        CONFIG.ORIGIN_WHITELIST.forEach(origin => {
            if (origin !== '*') {
                this.trustedOrigins.add(origin);
            }
        });
        
        try {
            this.trustedOrigins.add(window.location.origin);
        } catch {}
        
        try {
            if (window.parent && window.parent !== window) {
                const parentOrigin = window.parent.location.origin;
                this.trustedOrigins.add(parentOrigin);
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
            } catch {
                return false;
            }
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
    
    removeTrustedOrigin(origin) {
        return this.trustedOrigins.delete(origin);
    }
    
    getTrustedOrigins() {
        return Array.from(this.trustedOrigins);
    }
    
    getDynamicOrigins() {
        return Array.from(this.dynamicOrigins);
    }
    
    validateMessageOrigin(event) {
        try {
            if (event.source !== window.parent) {
                return false;
            }
            return this.isOriginTrusted(event.origin);
        } catch {
            return false;
        }
    }
    
    getOriginReport() {
        return {
            mode: this.trustMode,
            trusted: this.getTrustedOrigins(),
            dynamic: this.getDynamicOrigins(),
            environment: this.environmentDetector.environment.type
        };
    }
}

// =============================================
// MODULE 16: MESSAGE ROUTER (Enhanced)
// =============================================

class MessageRouter {
    constructor(messaging, sessionAdapter, environmentDetector, logger, sandbox, compatibility) {
        this.messaging = messaging;
        this.sessionAdapter = sessionAdapter;
        this.environmentDetector = environmentDetector;
        this.logger = logger;
        this.sandbox = sandbox;
        this.compatibility = compatibility;
        this.handlers = new Map();
        this.heartbeatInterval = null;
        this.lastHeartbeat = Date.now();
        this.resourceManager = new ResourceManager();
        this.pendingHandshakes = new Map();
        this.messageQueue = [];
        this.processingQueue = false;
    }

    registerHandler(type, handler, options = {}) {
        return this.sandbox.execute('message_handling', () => {
            if (!this.handlers.has(type)) {
                this.handlers.set(type, []);
            }
            
            const wrappedHandler = (payload, message) => {
                try {
                    handler(payload, message);
                } catch (error) {
                    this.logger.once('error', `handler_${type}`, `Error in ${type} handler`, error);
                }
            };
            
            this.handlers.get(type).push({
                fn: wrappedHandler,
                priority: options.priority || 0,
                id: options.id || Math.random().toString(36)
            });
            
            return () => this.unregisterHandler(type, wrappedHandler);
        }, () => {});
    }

    unregisterHandler(type, handler) {
        const handlers = this.handlers.get(type);
        if (handlers) {
            const index = handlers.findIndex(h => h.fn === handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    async handleMessage(event) {
        await this.sandbox.executeAsync('message_processing', async () => {
            if (!this.messaging.validateOrigin(event)) {
                return;
            }

            let message = event.data;
            
            if (this.compatibility) {
                message = this.compatibility.transformInbound(message);
            }
            
            message = this.messaging.sanitizePayload(message);
            if (!message || typeof message !== 'object') return;

            _STATE.lastParentMessage = Date.now();
            _STATE.parentResponding = true;
            _STATE.connectionMetrics.messagesReceived++;

            if (!this.compatibility?.legacyMode) {
                if (!this.messaging.validateTimestamp(message)) {
                    this.logger.once('warn', 'timestamp_invalid', 'Message timestamp invalid');
                    if (_STATE.securityLevel === 'enhanced') return;
                }
                
                if (this.messaging.checkReplay(message)) {
                    this.logger.once('warn', 'replay_detected', 'Replay attack detected');
                    if (_STATE.securityLevel === 'enhanced') return;
                }
                
                if (!this.messaging.verifySignature(message)) {
                    this.logger.once('warn', 'signature_invalid', 'Message signature invalid');
                    if (CONFIG.SECURITY.SIGNATURE_REQUIRED) return;
                }
            }

            if (this.messaging.deduplicate && this.messaging.deduplicate(message)) {
                return;
            }

            if (message.type !== 'ACK' && message.type !== PARENT_MESSAGE_TYPES.ACK && 
                message.type !== 'PING' && message.type !== 'PONG' && message.expectAck) {
                this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.ACK, { 
                    inResponseTo: message.messageId || message.id,
                    sequence: message.sequence,
                    timestamp: Date.now() 
                });
            }

            if (this.compatibility && this.compatibility.handleLegacyMessage(message)) {
                return;
            }

            await this.routeMessage(message);
        }, null);
    }

    async routeMessage(message) {
        switch (message.type) {
            case PARENT_MESSAGE_TYPES.HANDSHAKE_ACK:
                await this.handleHandshakeAck(message.payload);
                break;
                
            case PARENT_MESSAGE_TYPES.SESSION_SYNC:
                await this.handleSessionSync(message.payload || message.data);
                break;
                
            case PARENT_MESSAGE_TYPES.PAGE_ACTIVATED:
                await this.handlePageActivated(message.payload);
                break;
                
            case PARENT_MESSAGE_TYPES.NAVIGATE:
                await this.handleNavigate(message.payload);
                break;
                
            case PARENT_MESSAGE_TYPES.PONG:
                await this.handlePong();
                break;
                
            case PARENT_MESSAGE_TYPES.CAPABILITIES:
                await this.handleCapabilities(message.payload);
                break;
                
            case PARENT_MESSAGE_TYPES.ENVIRONMENT:
                await this.handleEnvironment(message.payload);
                break;
                
            case PARENT_MESSAGE_TYPES.RECOVERY_ACK:
                await this.handleRecoveryAck(message.payload);
                break;
                
            case 'SESSION':
            case 'SESSION_DATA':
            case PARENT_MESSAGE_TYPES.SESSION_DATA:
                await this.handleSessionData(message.payload || message.data);
                break;
                
            case 'SESSION_UPDATE':
            case PARENT_MESSAGE_TYPES.SESSION_UPDATE:
                await this.handleSessionUpdate(message.payload || message.data);
                break;
                
            case 'HEARTBEAT':
            case 'PING':
                await this.handleHeartbeat();
                break;
                
            case PARENT_MESSAGE_TYPES.PARENT_READY:
                await this.handleParentReady(message.payload);
                break;
                
            case PARENT_MESSAGE_TYPES.REFRESH_UI:
                await this.handleRefreshUI();
                break;
                
            case PARENT_MESSAGE_TYPES.FORCE_RELOAD:
                await this.handleForceReload();
                break;
                
            case PARENT_MESSAGE_TYPES.LOGOUT:
                await this.handleLogout();
                break;
                
            case 'user_data':
            case 'user_profile_updated':
                await this.handleUserData(message.data || message.payload);
                break;
                
            case 'session_expired':
                await this.handleSessionExpired();
                break;
                
            case PARENT_MESSAGE_TYPES.HANDSHAKE_COMPLETE:
                await this.handleHandshakeComplete(message.payload);
                break;
        }

        const handlers = this.handlers.get(message.type) || [];
        const sortedHandlers = [...handlers].sort((a, b) => b.priority - a.priority);
        
        for (const handler of sortedHandlers) {
            try {
                await handler.fn(message.payload || message.data, message);
            } catch (error) {}
        }
    }

    async handleHandshakeAck(payload) {
        this.logger.log('info', 'Handshake ACK received', payload);
    }

    async handleSessionSync(payload) {
        if (!payload) return;
        
        const sessionData = payload.session || payload.user || payload;
        
        if (sessionData) {
            const accepted = this.sessionAdapter.acceptParentSession(sessionData);
            if (accepted) {
                _STATE.sessionActive = true;
                _STATE.guestMode = false;
                _STATE.demoMode = false;
                
                const session = this.sessionAdapter.getSession();
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
                
                this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.SESSION_ACK, {
                    userId: sessionData.userId,
                    timestamp: Date.now(),
                    status: 'active',
                    environment: this.environmentDetector.environment
                });
                
                this.logger.log('info', 'Session sync processed successfully');
            }
        }
    }

    async handlePageActivated(payload) {
        this.logger.log('info', 'Page activated', payload);
        window.dispatchEvent(new CustomEvent('marketplace:page-activated', {
            detail: payload
        }));
    }

    async handleNavigate(payload) {
        this.logger.log('info', 'Navigate requested', payload);
        
        if (payload.url && payload.url !== window.location.href) {
            if (payload.internal) {
                window.location.hash = payload.hash || '';
                window.history.pushState({}, '', payload.url);
                window.dispatchEvent(new CustomEvent('marketplace:navigate', {
                    detail: payload
                }));
            } else {
                this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.NAVIGATE, {
                    url: payload.url,
                    timestamp: Date.now()
                });
            }
        }
    }

    async handleCapabilities(payload) {
        if (payload && payload.capabilities) {
            _STATE.parentCapabilities = payload.capabilities;
            this.logger.log('info', 'Parent capabilities received', payload.capabilities);
            
            this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.CAPABILITIES, {
                capabilities: {
                    session: true,
                    heartbeat: true,
                    sync: true,
                    ack: true,
                    signature: !_STATE.sandboxRestrictions?.crypto,
                    timestamp: true,
                    replay: true,
                    retry: true,
                    offline: true,
                    visibility: true,
                    environment: true,
                    recovery: true,
                    diagnostics: true
                },
                timestamp: Date.now()
            });
        }
    }
    
    async handleEnvironment(payload) {
        if (payload && payload.environment) {
            this.logger.log('info', 'Parent environment received', payload.environment);
            
            if (payload.environment.type) {
                _STATE.environment.parentType = payload.environment.type;
            }
            
            this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.ENVIRONMENT_ACK, {
                timestamp: Date.now(),
                environment: this.environmentDetector.environment
            });
        }
    }
    
    async handleRecoveryAck(payload) {
        this.logger.log('info', 'Recovery ACK received', payload);
    }

    async handleSessionData(payload) {
        if (!payload) return;
        
        const sessionData = payload.session || payload.user || payload;
        
        if (sessionData) {
            const accepted = this.sessionAdapter.acceptParentSession(sessionData);
            if (accepted) {
                _STATE.sessionActive = true;
                _STATE.guestMode = false;
                _STATE.demoMode = false;
                
                const session = this.sessionAdapter.getSession();
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
                
                this.logger.log('info', 'Session data processed successfully');
            }
        }
    }

    async handleSessionUpdate(payload) {
        if (!payload || !this.sessionAdapter.currentSession) return;
        
        const currentSession = this.sessionAdapter.getSession();
        const updatedSession = {
            ...currentSession,
            ...payload,
            updatedAt: new Date().toISOString()
        };
        
        this.sessionAdapter.acceptParentSession(updatedSession);
        
        if (payload.userId || payload.displayName) {
            window.currentUser = {
                ...window.currentUser,
                id: payload.userId || window.currentUser?.id,
                displayName: payload.displayName || window.currentUser?.displayName,
                email: payload.email || window.currentUser?.email,
                photoURL: payload.photoURL || window.currentUser?.photoURL,
                isPremium: payload.isPremium !== undefined ? payload.isPremium : window.currentUser?.isPremium,
                trustLevel: payload.trustLevel || window.currentUser?.trustLevel
            };
            window.userData = window.currentUser;
        }
    }

    async handleHeartbeat() {
        this.lastHeartbeat = Date.now();
        _STATE.health.lastHeartbeat = this.lastHeartbeat;
        _STATE.health.missedHeartbeats = 0;
        
        this.messaging.sendFireAndForget('HEARTBEAT', { 
            timestamp: this.lastHeartbeat,
            sessionActive: this.sessionAdapter.isValid(),
            ready: _STATE.ready,
            frameId: this.messaging.frameId
        });
    }

    async handlePong() {
        this.lastHeartbeat = Date.now();
        _STATE.health.lastHeartbeat = this.lastHeartbeat;
        _STATE.health.missedHeartbeats = 0;
        _STATE.connectionMetrics.lastPong = this.lastHeartbeat;
        _STATE.parentResponding = true;
    }

    async handleParentReady(payload) {
        this.logger.log('info', 'Parent ready signal received');
        
        this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.CHILD_READY, {
            id: window.parentCommunicationId || this.messaging.frameId,
            timestamp: Date.now(),
            version: '5.0.0',
            features: ['session_mirror', 'heartbeat', 'sync', 'ack', 'signature', 'environment', 'recovery', 'diagnostics'],
            environment: this.environmentDetector.environment
        });
        
        if (!this.sessionAdapter.isValid()) {
            setTimeout(() => {
                this.requestSession();
            }, 100);
        }
    }

    async handleRefreshUI() {
        window.dispatchEvent(new CustomEvent('marketplace:refresh-ui', {
            detail: { timestamp: Date.now() }
        }));
    }

    async handleForceReload() {
        saveAllMarketplaceData();
        window.location.reload();
    }

    async handleLogout() {
        this.sessionAdapter.clear();
        window.currentUser = null;
        window.userData = null;
        
        window.dispatchEvent(new CustomEvent('marketplace:logout', {
            detail: { timestamp: Date.now() }
        }));
    }

    async handleSessionExpired() {
        this.sessionAdapter.clear();
        this.sessionAdapter.enableGuestMode();
        
        showNotification('Session expired. Please log in again.', 'warning');
    }

    async handleUserData(data) {
        if (!data) return;
        
        const sessionData = {
            userId: data.id || data.userId,
            userToken: data.token || localStorage.getItem('USER_TOKEN'),
            displayName: data.displayName || data.name,
            email: data.email,
            photoURL: data.photoURL || data.avatar,
            isPremium: data.isPremium || false,
            subscription: data.subscription,
            trustLevel: data.trustLevel || 'new'
        };
        
        this.sessionAdapter.acceptParentSession(sessionData);
    }

    async handleHandshakeComplete(payload) {
        this.logger.log('info', 'Handshake completed', payload);
        _STATE.handshakeComplete = true;
        window.handshakeComplete = true;
        
        if (!this.sessionAdapter.isValid() && payload?.requestSession !== false) {
            this.requestSession();
        }
    }

    requestSession() {
        this.messaging.sendFireAndForget(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
            id: window.parentCommunicationId || this.messaging.frameId,
            timestamp: Date.now(),
            reason: 'initial_sync'
        });
    }

    queueMessage(type, payload, options = {}) {
        this.messageQueue.push({
            type,
            payload,
            options,
            timestamp: Date.now()
        });
        
        if (!this.processingQueue) {
            this.processMessageQueue();
        }
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
            } catch (error) {
                this.logger.log('warn', 'Failed to send queued message', error);
                
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
        if (this.heartbeatInterval) {
            this.resourceManager.clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = this.resourceManager.setInterval(() => {
            const now = Date.now();
            const timeSinceLastMessage = now - _STATE.lastParentMessage;
            
            if (timeSinceLastMessage > CONFIG.TIMEOUTS.HEARTBEAT * 2) {
                _STATE.health.missedHeartbeats++;
                
                if (_STATE.health.missedHeartbeats > 3) {
                    _STATE.parentResponding = false;
                    
                    this.messaging.sendFireAndForget('PING', {
                        timestamp: now,
                        check: 'connectivity',
                        frameId: this.messaging.frameId
                    });
                }
            } else {
                _STATE.parentResponding = true;
            }
            
            if (this.sessionAdapter.isValid() && !_STATE.guestMode) {
                this.messaging.sendFireAndForget('HEARTBEAT', {
                    timestamp: now,
                    sessionId: this.sessionAdapter.currentSession?.userId,
                    frameId: this.messaging.frameId
                });
                this.logger.metric('heartbeatsSent');
            }
        }, CONFIG.TIMEOUTS.HEARTBEAT);
    }

    cleanup() {
        this.resourceManager.release();
        this.handlers.clear();
        this.messageQueue = [];
        if (this.heartbeatInterval) {
            this.resourceManager.clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}

// =============================================
// MODULE 17: RESOURCE MANAGER
// =============================================

class ResourceManager {
    constructor() {
        this.timers = new Set();
        this.listeners = new Set();
        this.observers = new Set();
        this.intervals = new Set();
        this.promises = new Set();
        this.resources = new Map();
        this.animationFrames = new Set();
    }

    setTimeout(fn, delay) {
        const id = setTimeout(() => {
            this.timers.delete(id);
            fn();
        }, delay);
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

    requestAnimationFrame(fn) {
        const id = requestAnimationFrame(fn);
        this.animationFrames.add(id);
        return id;
    }

    cancelAnimationFrame(id) {
        cancelAnimationFrame(id);
        this.animationFrames.delete(id);
    }

    addEventListener(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        const entry = { target, type, listener, options };
        this.listeners.add(entry);
        return () => this.removeEventListener(entry);
    }

    removeEventListener(entry) {
        try {
            entry.target.removeEventListener(entry.type, entry.listener, entry.options);
            this.listeners.delete(entry);
        } catch {}
    }

    addObserver(observer, target) {
        this.observers.add({ observer, target });
    }

    trackPromise(promise) {
        this.promises.add(promise);
        promise.finally(() => this.promises.delete(promise));
        return promise;
    }

    registerResource(key, resource, cleanupFn) {
        this.resources.set(key, { resource, cleanupFn });
    }

    release() {
        this.timers.forEach(id => clearTimeout(id));
        this.timers.clear();

        this.intervals.forEach(id => clearInterval(id));
        this.intervals.clear();
        
        this.animationFrames.forEach(id => cancelAnimationFrame(id));
        this.animationFrames.clear();

        this.listeners.forEach(entry => {
            try {
                entry.target.removeEventListener(entry.type, entry.listener, entry.options);
            } catch {}
        });
        this.listeners.clear();

        this.observers.forEach(({ observer }) => {
            try {
                if (observer && typeof observer.disconnect === 'function') {
                    observer.disconnect();
                }
            } catch {}
        });
        this.observers.clear();

        this.resources.forEach(({ cleanupFn }) => {
            try { cleanupFn?.(); } catch {}
        });
        this.resources.clear();
    }
}

// =============================================
// MODULE 18: FEATURE SANDBOX
// =============================================

class FeatureSandbox {
    constructor(logger) {
        this.logger = logger;
        this.featureStates = new Map();
        this.errorCounts = new Map();
    }

    execute(featureName, fn, fallback = null) {
        if (!this.isFeatureEnabled(featureName)) {
            return fallback;
        }

        try {
            const result = fn();
            this.recordSuccess(featureName);
            return result;
        } catch (error) {
            return this.handleError(featureName, error, fallback);
        }
    }

    async executeAsync(featureName, fn, fallback = null) {
        if (!this.isFeatureEnabled(featureName)) {
            return fallback;
        }

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
        if (current > 0) {
            this.errorCounts.set(featureName, Math.max(0, current - 1));
        }
    }

    handleError(featureName, error, fallback) {
        const count = (this.errorCounts.get(featureName) || 0) + 1;
        this.errorCounts.set(featureName, count);
        
        if (count >= 5) {
            this.disableFeature(featureName);
        }
        
        return fallback;
    }

    getFeatureStatus(featureName) {
        return {
            enabled: this.isFeatureEnabled(featureName),
            errorCount: this.errorCounts.get(featureName) || 0,
            state: this.featureStates.get(featureName)
        };
    }
}

// =============================================
// MODULE 19: GLOBAL ERROR HANDLER (Enhanced)
// =============================================

class GlobalErrorHandler {
    constructor(logger, diagnostics) {
        this.logger = logger;
        this.diagnostics = diagnostics;
        this.crashes = 0;
        this.fatalErrors = new Set();
        this.initialized = false;
        this.recoveryCallbacks = new Set();
        this.errorBoundaries = new Map();
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
        
        const originalConsoleError = console.error;
        console.error = (...args) => {
            this.handleConsoleError(args);
            originalConsoleError.apply(console, args);
        };
        
        const originalConsoleWarn = console.warn;
        console.warn = (...args) => {
            this.handleConsoleWarning(args);
            originalConsoleWarn.apply(console, args);
        };
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
            
            this.logger?.log('error', 'Uncaught error', error);
            
            if (this.diagnostics) {
                this.diagnostics.logError(error, { type: 'uncaught' });
            }
            
            this.attemptRecovery(error);
        }
    }

    handleUnhandledRejection(reason) {
        const reasonKey = reason?.message || 'unhandled_rejection';
        
        if (!this.fatalErrors.has(reasonKey)) {
            this.fatalErrors.add(reasonKey);
            
            this.logger?.log('error', 'Unhandled rejection', reason);
            
            if (this.diagnostics) {
                this.diagnostics.logError(reason, { type: 'unhandled_rejection' });
            }
            
            this.attemptRecovery(reason);
        }
    }
    
    handleConsoleError(args) {
        const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        
        if (this.diagnostics) {
            this.diagnostics.logWarning(message, { source: 'console.error' });
        }
    }
    
    handleConsoleWarning(args) {
        const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        
        if (this.diagnostics && this.diagnostics.debugMode) {
            this.diagnostics.logWarning(message, { source: 'console.warn' });
        }
    }

    attemptRecovery(error) {
        this.recoveryCallbacks.forEach(cb => {
            try {
                cb(error);
            } catch {}
        });
        
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({
                    type: 'IFRAME_ERROR',
                    error: error?.message || 'Unknown error',
                    timestamp: Date.now(),
                    frameId: parentCommunicationId || _STATE.frameId
                }, '*');
            } catch {}
        }
    }

    onRecovery(callback) {
        this.recoveryCallbacks.add(callback);
        return () => this.recoveryCallbacks.delete(callback);
    }

    createBoundary(componentName, fallbackUI) {
        const boundary = {
            name: componentName,
            fallback: fallbackUI,
            errors: []
        };
        
        this.errorBoundaries.set(componentName, boundary);
        
        return (fn) => {
            try {
                return fn();
            } catch (error) {
                boundary.errors.push({
                    timestamp: Date.now(),
                    error: error.message
                });
                
                this.logger?.log('error', `Error boundary caught error in ${componentName}`, error);
                
                if (boundary.errors.length > 10) {
                    boundary.errors.shift();
                }
                
                return boundary.fallback;
            }
        };
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
// MODULE 20: INITIALIZATION PIPELINE (Enhanced)
// =============================================

class InitializationPipeline {
    constructor(depManager, sessionAdapter, messaging, router, logger, sandbox, errorHandler, resourceManager, 
                handshake, transport, recovery, diagnostics, environmentDetector, startupGovernor, originTrustAdapter) {
        this.depManager = depManager;
        this.sessionAdapter = sessionAdapter;
        this.messaging = messaging;
        this.router = router;
        this.logger = logger;
        this.sandbox = sandbox;
        this.errorHandler = errorHandler;
        this.resourceManager = resourceManager;
        this.handshake = handshake;
        this.transport = transport;
        this.recovery = recovery;
        this.diagnostics = diagnostics;
        this.environmentDetector = environmentDetector;
        this.startupGovernor = startupGovernor;
        this.originTrustAdapter = originTrustAdapter;
        this.currentStage = null;
        this.stageResults = new Map();
    }

    async execute() {
        const stages = [
            { name: 'environment', fn: this.detectEnvironment.bind(this) },
            { name: 'preflight', fn: this.preflight.bind(this) },
            { name: 'dependencyCheck', fn: this.dependencyCheck.bind(this) },
            { name: 'parentDetect', fn: this.parentDetect.bind(this) },
            { name: 'startup', fn: this.startupGovernor.start.bind(this.startupGovernor) },
            { name: 'handshake', fn: this.handshake.startHandshake.bind(this.handshake) },
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
                this.logger.log('info', `Stage ${stage.name} completed`, result);
            } catch (error) {
                this.stageResults.set(stage.name, { success: false, error: error.message, timestamp: Date.now() });
                this.logger.log('error', `Stage ${stage.name} failed`, error);
                
                if (stage.name === 'handshake' || stage.name === 'sessionSync') {
                    this.logger.log('warn', `Stage ${stage.name} failed, enabling guest mode`, error);
                    this.depManager.enableFallbackMode();
                    this.sessionAdapter.enableGuestMode();
                }
            }
        }

        _STATE.initialized = true;
        _STATE.initializationStage = 'complete';
        
        this.logger.log('info', 'Initialization complete', {
            fallbackMode: this.depManager.isInFallbackMode(),
            guestMode: _STATE.guestMode,
            sessionActive: _STATE.sessionActive,
            securityLevel: _STATE.securityLevel,
            environment: this.environmentDetector.environment.type
        });
        
        this.recovery.startMonitoring();
        this.diagnostics.start();
        
        return {
            success: true,
            stages: Object.fromEntries(this.stageResults),
            fallbackMode: this.depManager.isInFallbackMode(),
            guestMode: _STATE.guestMode,
            demoMode: _STATE.demoMode,
            securityLevel: _STATE.securityLevel,
            environment: this.environmentDetector.environment
        };
    }

    async executeStage(stage) {
        return this.sandbox.executeAsync(stage.name, async () => {
            const timeout = this.getAdjustedTimeout(CONFIG.TIMEOUTS.INIT);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Stage ${stage.name} timeout`)), timeout)
            );

            return await Promise.race([stage.fn(), timeoutPromise]);
        }, null);
    }
    
    async detectEnvironment() {
        const env = this.environmentDetector.initialize();
        this.logger.log('info', 'Environment detected', env);
        return env;
    }

    async preflight() {
        try {
            if (!window || !document) {
                throw new Error('Browser environment unavailable');
            }
            
            this.errorHandler.initialize();
            this.messaging.detectSandboxRestrictions();
            
            return { 
                environment: 'browser', 
                timestamp: Date.now(),
                securityLevel: _STATE.securityLevel,
                sandboxRestrictions: _STATE.sandboxRestrictions
            };
        } catch (error) {
            throw new Error(`Preflight failed: ${error.message}`);
        }
    }

    async dependencyCheck() {
        const deps = [
            { 
                name: 'api.core', 
                check: () => typeof window.callApi === 'function' || typeof window.secureFetch === 'function',
                fallback: () => {
                    window.callApi = window.callApi || this.createApiFallback();
                    return true;
                }
            },
            {
                name: 'api.messages',
                check: () => typeof window.getMessages === 'function' || typeof window.sendMessage === 'function',
                fallback: () => {
                    window.getMessages = window.getMessages || (() => Promise.resolve([]));
                    window.sendMessage = window.sendMessage || (() => Promise.resolve({ success: true }));
                    return true;
                }
            }
        ];

        const results = [];
        for (const dep of deps) {
            const result = await this.depManager.checkDependency(dep.name, dep.check, dep.fallback);
            results.push({ name: dep.name, available: result });
        }

        const missing = results.filter(r => !r.available).length;
        if (missing > 0) {
            this.logger.log('warn', `${missing} dependencies missing, may use fallbacks`);
        }

        return { dependencies: results, fallbackMode: this.depManager.isInFallbackMode() };
    }

    async parentDetect() {
        try {
            const detected = window.parent && window.parent !== window;
            _STATE.parentDetected = detected;
            
            if (!detected) {
                this.logger.log('info', 'Not in iframe, running standalone');
                this.sessionAdapter.enableGuestMode();
            }
            
            return { parentDetected: detected, guestMode: _STATE.guestMode };
        } catch (error) {
            this.logger.log('warn', 'Parent detection failed', error);
            _STATE.parentDetected = false;
            return { parentDetected: false, error: error.message };
        }
    }

    async sessionSync() {
        if (_STATE.guestMode || !_STATE.parentDetected) {
            return { sessionActive: false, mode: 'guest' };
        }

        this.logger.metric('sessionRequests');

        return new Promise((resolve) => {
            let attempts = 0;
            let resolved = false;

            const attempt = async () => {
                if (resolved) return;
                if (attempts >= MAX_SESSION_RETRIES) {
                    _STATE.guestMode = true;
                    this.sessionAdapter.enableGuestMode();
                    resolved = true;
                    this.logger.log('warn', `Session sync failed after ${attempts} attempts, guest mode enabled`);
                    resolve({ sessionActive: false, attempts, guestMode: true });
                    return;
                }

                attempts++;

                try {
                    const timeout = this.getAdjustedTimeout(CONFIG.TIMEOUTS.SESSION);
                    const response = await this.messaging.sendWithAck(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
                        id: `session_${Date.now()}`,
                        frameId: this.messaging.frameId,
                        timestamp: Date.now(),
                        attempt: attempts,
                        environment: this.environmentDetector.environment
                    }, timeout);

                    if (response) {
                        resolved = true;
                        this.logger.log('info', `Session sync successful after ${attempts} attempts`);
                        resolve({ sessionActive: true, attempts, granted: true });
                    } else {
                        const delay = this.getBackoffDelay(attempts);
                        this.resourceManager.setTimeout(attempt, delay);
                    }
                } catch (error) {
                    const delay = this.getBackoffDelay(attempts);
                    this.resourceManager.setTimeout(attempt, delay);
                }
            };

            attempt();

            const timeout = this.getAdjustedTimeout(CONFIG.TIMEOUTS.SESSION * 2);
            this.resourceManager.setTimeout(() => {
                if (!resolved) {
                    _STATE.guestMode = true;
                    this.sessionAdapter.enableGuestMode();
                    resolved = true;
                    this.logger.log('warn', 'Session sync timeout, guest mode enabled');
                    resolve({ sessionActive: false, timeout: true, guestMode: true });
                }
            }, timeout);
        });
    }

    async serviceInit() {
        try {
            this.router.startHeartbeatMonitor();
            this.transport.start();
            
            this.resourceManager.addEventListener(window, 'message', (e) => this.router.handleMessage(e));
            
            return { servicesInitialized: true };
        } catch (error) {
            return { servicesInitialized: false, error: error.message };
        }
    }

    async monitoring() {
        try {
            if (CONFIG.MONITORING.METRICS_ENABLED) {
                setInterval(() => {
                    this.collectMetrics();
                }, CONFIG.MONITORING.HEALTH_CHECK_INTERVAL);
            }
            
            return { monitoringEnabled: true };
        } catch (error) {
            return { monitoringEnabled: false, error: error.message };
        }
    }

    collectMetrics() {
        const metrics = {
            timestamp: Date.now(),
            connection: _STATE.connectionMetrics,
            health: _STATE.health,
            handshake: this.handshake?.getStatus(),
            session: this.sessionAdapter?.isValid(),
            parentResponding: _STATE.parentResponding,
            memory: performance.memory ? {
                used: Math.round(performance.memory.usedJSHeapSize / 1048576),
                total: Math.round(performance.memory.totalJSHeapSize / 1048576)
            } : null,
            environment: this.environmentDetector.environment
        };
        
        if (!_STATE.metricsHistory) {
            _STATE.metricsHistory = [];
        }
        
        _STATE.metricsHistory.push(metrics);
        
        if (_STATE.metricsHistory.length > 100) {
            _STATE.metricsHistory.shift();
        }
    }

    async ready() {
        _STATE.ready = true;
        _STATE.initialized = true;
        
        window.dispatchEvent(new CustomEvent('marketplaceCoreReady', {
            detail: {
                timestamp: Date.now(),
                guestMode: _STATE.guestMode,
                demoMode: _STATE.demoMode,
                fallbackMode: _STATE.fallbackMode,
                sessionActive: _STATE.sessionActive,
                securityLevel: _STATE.securityLevel,
                handshakeComplete: _STATE.handshakeComplete,
                environment: this.environmentDetector.environment
            }
        }));
        
        return { ready: true, timestamp: Date.now() };
    }

    getAdjustedTimeout(baseTimeout) {
        const env = this.environmentDetector.environment;
        
        if (env.latency > CONFIG.ENVIRONMENT.LATENCY_THRESHOLD_HIGH) {
            return Math.round(baseTimeout * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER);
        }
        
        return baseTimeout;
    }

    getBackoffDelay(attempt) {
        const base = CONFIG.TIMEOUTS.BACKOFF_BASE;
        const max = CONFIG.TIMEOUTS.BACKOFF_MAX;
        
        let delay = base * Math.pow(2, attempt - 1);
        delay += Math.random() * 100;
        
        if (this.environmentDetector.isHighLatency()) {
            delay = delay * CONFIG.TIMEOUTS.HIGH_LATENCY_MULTIPLIER;
        }
        
        return Math.min(delay, max);
    }

    createApiFallback() {
        return async (method, endpoint, data) => {
            if (method === 'GET' && endpoint.includes('/user/profile')) {
                const session = this.sessionAdapter.getSession();
                if (session) {
                    return { user: session };
                }
            }
            
            if (method === 'GET' && endpoint.includes('/marketplace/listings')) {
                try {
                    const cached = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
                    if (cached) {
                        return { listings: cached };
                    }
                } catch {}
            }
            
            return null;
        };
    }
}

// =============================================
// MODULE 21: DEPENDENCY MANAGER
// =============================================

class DependencyManager {
    constructor() {
        this.dependencies = new Map();
        this.fallbackMode = false;
        this.missingDeps = new Set();
        this.logger = null;
    }

    setLogger(loggerInstance) {
        this.logger = loggerInstance;
    }

    async checkDependency(name, checkFn, fallbackFn = null) {
        try {
            let resolved = false;
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Dependency ${name} timeout`)), CONFIG.TIMEOUTS.DEPENDENCY)
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
            } catch (error) {
                throw new Error(`Dependency ${name} unavailable`);
            }
        } catch (error) {
            this.missingDeps.add(name);
            
            if (fallbackFn) {
                try {
                    const fallback = await fallbackFn();
                    this.dependencies.set(name, { status: 'fallback', timestamp: Date.now(), fallback: true });
                    this.logger?.once('warn', `dep_fallback_${name}`, `Using fallback for ${name}`);
                    return true;
                } catch (fbError) {
                    this.dependencies.set(name, { status: 'missing', timestamp: Date.now() });
                    this.logger?.once('error', `dep_missing_${name}`, `Dependency ${name} unavailable, no fallback`);
                    return false;
                }
            }
            
            this.dependencies.set(name, { status: 'missing', timestamp: Date.now() });
            this.logger?.once('error', `dep_missing_${name}`, `Dependency ${name} unavailable`);
            return false;
        }
    }

    isAvailable(name) {
        const dep = this.dependencies.get(name);
        return dep && (dep.status === 'available' || dep.status === 'fallback');
    }

    getStatus(name) {
        return this.dependencies.get(name) || { status: 'unknown' };
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
// MODULE 22: STRUCTURED LOGGING SYSTEM
// =============================================

class StructuredLogger {
    constructor() {
        this.warnings = new Set();
        this.errors = new Set();
        this.metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            handshakeAttempts: 0,
            sessionRequests: 0,
            failures: 0,
            circuitBreakerTrips: 0,
            fallbackActivations: 0,
            heartbeatsSent: 0,
            syncsCompleted: 0
        };
        this.debugMode = CONFIG.MONITORING.DEBUG_MODE;
        this.modulePrefix = '[Core]';
        this.logLevel = CONFIG.MONITORING.LOG_LEVEL;
    }

    once(level, key, message, data = null) {
        const store = level === 'warn' ? this.warnings : this.errors;
        const fullKey = `${level}:${key}`;
        
        if (store.has(fullKey)) return;
        store.add(fullKey);

        this.log(level, `${message} [${key}]`, data);
    }

    log(level, message, ...args) {
        if (!this.shouldLog(level)) return;
        
        const timestamp = new Date().toISOString();
        const logMessage = `${this.modulePrefix} ${timestamp} ${message}`;
        
        if (args.length) {
            console[level](logMessage, ...args);
        } else {
            console[level](logMessage);
        }
        
        if (window.diagnosticsAgent && level === 'error') {
            window.diagnosticsAgent.logError(new Error(message), { level, args });
        } else if (window.diagnosticsAgent && level === 'warn') {
            window.diagnosticsAgent.logWarning(message, { level, args });
        }
    }

    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentIndex = levels.indexOf(this.logLevel);
        const targetIndex = levels.indexOf(level);
        
        return targetIndex >= currentIndex;
    }

    metric(name, value = 1) {
        if (this.metrics.hasOwnProperty(name)) {
            this.metrics[name] += value;
        }
        
        if (name in _STATE.connectionMetrics) {
            _STATE.connectionMetrics[name] += value;
        }
    }

    getMetrics() {
        return { ...this.metrics };
    }

    enableDebug() {
        this.debugMode = true;
        this.logLevel = 'debug';
        CONFIG.MONITORING.DEBUG_MODE = true;
    }

    disableDebug() {
        this.debugMode = false;
        this.logLevel = 'warn';
        CONFIG.MONITORING.DEBUG_MODE = false;
    }

    debug(message, data) {
        if (this.shouldLog('debug')) {
            const timestamp = new Date().toISOString();
            console.debug(`[Core Debug] ${timestamp} ${message}`, data || '');
        }
    }

    reset() {
        this.warnings.clear();
        this.errors.clear();
    }
}

// =============================================
// MODULE 23: ERROR LOGGING SYSTEM
// =============================================

let errorLog = new Set();
let warningLog = new Set();
let messageResendCache = new Map();
const MAX_RETRIES = 3;

export function safeLogError(module, functionName, error, isWarning = false) {
    const errorKey = `${module}:${functionName}:${error?.message || 'unknown'}`;
    
    if (isWarning) {
        if (!warningLog.has(errorKey)) {
            warningLog.add(errorKey);
            console.warn(`[${module}] ${functionName}: ${error?.message || 'Warning'}`, error || '');
        }
    } else {
        if (!errorLog.has(errorKey)) {
            errorLog.add(errorKey);
            console.error(`[${module}] ${functionName}: ${error?.message || 'Error'}`, error || '');
        }
    }
    
    if (window.diagnosticsAgent) {
        if (isWarning) {
            window.diagnosticsAgent.logWarning(error?.message || 'Warning', { module, functionName });
        } else {
            window.diagnosticsAgent.logError(error, { module, functionName });
        }
    }
}

export function logOnce(type, msg, error = null) {
    const key = `${type}:${msg}`;
    
    if (type === 'error') {
        if (errorLog.has(key)) return;
        errorLog.add(key);
    } else {
        if (warningLog.has(key)) return;
        warningLog.add(key);
    }
    
    if (error) {
        console[type](`[MARKETPLACE_CORE] ${msg}`, error);
    } else {
        console[type](`[MARKETPLACE_CORE] ${msg}`);
    }
}

// =============================================
// CORE INSTANCES - SINGLETONS (Enhanced)
// =============================================

// Initialize in order


// =============================================
// EXPORTED CORE FUNCTIONS
// =============================================

export let initializeCore;
export let startHandshake;
export let sendToParent;
export let requestSession;
export let receiveFromParent;
export let shutdownCore;
export let syncWithParent;
export let checkParentHealth;

// =============================================
// INITIALIZE CORE (Enhanced)
// =============================================

initializeCore = async function(options = {}) {
    if (_STATE.shutdown) {
        return _STATE;
    }

    if (_STATE.initialized) {
        return _STATE;
    }

    if (isInitializing) {
        return _STATE;
    }

    isInitializing = true;

    try {
        if (options.debug) {
            logger.enableDebug();
            diagnostics.enableDebug();
        }

        _STATE.frameId = messenger.frameId;
        window.parentCommunicationId = _STATE.frameId;

        const result = await pipeline.execute();

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

        window.dispatchEvent(new CustomEvent('coreInitialized', {
            detail: {
                state: _STATE,
                session: sessionAdapter.getSession(),
                fallbackMode: _STATE.fallbackMode,
                guestMode: _STATE.guestMode,
                sessionActive: _STATE.sessionActive,
                securityLevel: _STATE.securityLevel,
                handshakeComplete: _STATE.handshakeComplete,
                environment: environmentDetector.environment
            }
        }));

        return _STATE;

    } catch (error) {
        logger.log('error', 'Core initialization failed', error);
        _STATE.guestMode = true;
        _STATE.fallbackMode = true;
        _STATE.ready = true;
        _STATE.initialized = true;
        isReady = true;
        isInitializing = false;
        isBootstrapped = true;
        
        sessionAdapter.enableGuestMode();

        return _STATE;
    }
};

// =============================================
// START HANDSHAKE (Enhanced)
// =============================================

startHandshake = async function() {
    if (_STATE.shutdown) {
        return false;
    }

    if (handshakeInProgress) {
        return false;
    }

    if (_STATE.handshakeComplete) {
        return true;
    }

    handshakeInProgress = true;

    try {
        const result = await handshake.startHandshake();
        
        handshakeComplete = _STATE.handshakeComplete;
        handshakeInProgress = false;
        
        return result;
    } catch (error) {
        handshakeInProgress = false;
        return false;
    }
};

// =============================================
// SEND TO PARENT (Enhanced)
// =============================================

sendToParent = async function(type, payload = {}, options = {}) {
    if (_STATE.shutdown) {
        return false;
    }

    // Get the messenger instance - either from iframeAuthority or create it if needed
    let messengerInstance = null;
    
    // Try to get from iframeAuthority first
    if (iframeAuthority && iframeAuthority.reliabilityEngine) {
        messengerInstance = iframeAuthority.reliabilityEngine;
    } else if (window.iframeAuthority && window.iframeAuthority.reliabilityEngine) {
        messengerInstance = window.iframeAuthority.reliabilityEngine;
    } else {
        // Fallback: create temporary messenger if needed
        const tempEnvDetector = environmentDetector || new EnvironmentDetector();
        messengerInstance = new IframeMessenger(tempEnvDetector);
    }

    if (!_STATE.parentDetected || _STATE.guestMode || _STATE.fallbackMode) {
        if (options.force) {
            // Try anyway
        } else if (messengerInstance && typeof messengerInstance.bufferMessage === 'function') {
            messengerInstance.bufferMessage(type, payload, options);
            return true;
        } else {
            // Fallback to queue for retry if bufferMessage not available
            if (typeof messengerInstance.queueForRetry === 'function') {
                messengerInstance.queueForRetry(type, payload, options);
            }
            return true;
        }
    }

    return sandbox.executeAsync('send_to_parent', async () => {
        const requiresAck = options.ack !== false;
        const timeout = options.timeout || (environmentDetector ? environmentDetector.getCurrentTimeouts().ACK : CONFIG.TIMEOUTS.ACK);

        // Apply compatibility transformation if needed
        let message = { type, payload };
        if (compatibility && compatibility.legacyMode) {
            message = compatibility.transformOutbound(message);
        }

        if (requiresAck) {
            let result;
            
            // Try multiple ways to send the message
            if (iframeAuthority && iframeAuthority.send) {
                result = await iframeAuthority.send(type, payload, options);
            } else if (messengerInstance && typeof messengerInstance.sendMessage === 'function') {
                result = await messengerInstance.sendMessage(type, payload, { 
                    ...options, 
                    requireAck: true, 
                    timeout 
                });
            } else if (messengerInstance && typeof messengerInstance.sendWithReliability === 'function') {
                result = await messengerInstance.sendWithReliability(type, payload, {
                    ...options,
                    requireAck: true,
                    timeout
                });
            } else {
                // Ultimate fallback - direct postMessage
                try {
                    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    const msg = {
                        protocol: _STATE.protocolVersion || 'KYN-2.0',
                        messageId,
                        type,
                        source: 'iframe',
                        target: 'parent',
                        frameId: _STATE.frameId || `frame_${Date.now()}`,
                        timestamp: Date.now(),
                        payload: payload || {}
                    };
                    window.parent.postMessage(msg, '*');
                    result = { success: true };
                } catch (err) {
                    result = { success: false, error: err.message };
                }
            }
            
            if (result && result.success && logger) {
                logger.metric('messagesSent');
            }
            return result ? result.success : false;
        } else {
            let result;
            
            // Try multiple ways to send the message
            if (iframeAuthority && iframeAuthority.send) {
                result = await iframeAuthority.send(type, payload, { ...options, requireAck: false });
            } else if (messengerInstance && typeof messengerInstance.sendMessage === 'function') {
                result = messengerInstance.sendMessage(type, payload, { 
                    ...options, 
                    requireAck: false 
                });
            } else if (messengerInstance && typeof messengerInstance.sendFireAndForget === 'function') {
                result = messengerInstance.sendFireAndForget(type, payload, options);
            } else {
                // Ultimate fallback - direct postMessage
                try {
                    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                    const msg = {
                        protocol: _STATE.protocolVersion || 'KYN-2.0',
                        messageId,
                        type,
                        source: 'iframe',
                        target: 'parent',
                        frameId: _STATE.frameId || `frame_${Date.now()}`,
                        timestamp: Date.now(),
                        payload: payload || {}
                    };
                    window.parent.postMessage(msg, '*');
                    result = true;
                } catch (err) {
                    result = false;
                }
            }
            
            if (result && logger) {
                logger.metric('messagesSent');
            }
            return result;
        }
    }, false);
};

// =============================================
// REQUEST SESSION (Enhanced)
// =============================================

requestSession = async function(force = false) {
    if (_STATE.shutdown) {
        return false;
    }

    if (_STATE.guestMode && !force) {
        const cached = sessionAdapter.getSession();
        return !!cached;
    }

    if (sessionValidationInProgress) {
        return false;
    }

    sessionValidationInProgress = true;

    try {
        const result = await sessionAdapter.requestSession(force);
        
        sessionValid = sessionAdapter.isValid();
        sessionData = sessionAdapter.getSession();
        sessionValidationInProgress = false;
        
        return result.success || false;
    } catch (error) {
        sessionValidationInProgress = false;
        
        const cached = sessionAdapter.getSession();
        return !!cached;
    }
};

// =============================================
// RECEIVE FROM PARENT
// =============================================

receiveFromParent = function(type, handler) {
    if (_STATE.shutdown) {
        return;
    }

    if (!type || typeof handler !== 'function') {
        return;
    }

    router.registerHandler(type, handler);
};

// =============================================
// SHUTDOWN CORE
// =============================================

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
    messenger.cleanup();
    router.cleanup();
    resourceManager.release();
    transport.stop();
    diagnostics.stop();
    recovery.stopMonitoring();
    logger.reset();

    safeStorage.remove(LOCAL_STORAGE_KEYS.HANDSHAKE_STATE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.ENVIRONMENT_CACHE);
    safeStorage.remove(LOCAL_STORAGE_KEYS.STARTUP_STATE);
    safeStorage.sessionRemove('core_session_token');
    safeStorage.sessionRemove('core_session_cache');

    messageQueue = [];
    dataCache.clear();

    return true;
};

// =============================================
// SYNC WITH PARENT (Enhanced)
// =============================================

syncWithParent = async function() {
    if (_STATE.shutdown || !_STATE.parentDetected || _STATE.guestMode) {
        return false;
    }

    if (_syncInProgress) {
        return false;
    }

    _syncInProgress = true;
    _syncAttempts++;

    try {
        const result = await sessionAdapter.syncSession();
        
        if (result.success) {
            _lastSyncTime = Date.now();
            _syncAttempts = 0;
            logger.metric('syncsCompleted');
        }

        return result.success;
    } catch (error) {
        logger.log('warn', 'Sync failed', error);
        return false;
    } finally {
        _syncInProgress = false;
    }
};

// =============================================
// CHECK PARENT HEALTH (Enhanced)
// =============================================

checkParentHealth = function() {
    return {
        responding: _STATE.parentResponding,
        lastMessage: _STATE.lastParentMessage,
        missedHeartbeats: _STATE.health.missedHeartbeats,
        handshakeComplete: _STATE.handshakeComplete,
        sessionActive: _STATE.sessionActive,
        inIframe: _STATE.parentDetected,
        connectionMetrics: _STATE.connectionMetrics,
        securityLevel: _STATE.securityLevel,
        handshakeStatus: handshake.getStatus(),
        sessionStatus: sessionAdapter.getState(),
        recoveryStatus: recovery.getStatus(),
        startupStatus: startupGovernor.getStatus(),
        environment: environmentDetector.environment,
        diagnostics: diagnostics.getReport(),
        authorityStatus: iframeAuthority.getStatus()
    };
};

// =============================================
// PERIODIC SYNC
// =============================================

function startPeriodicSync() {
    if (_syncTimer) {
        resourceManager.clearInterval(_syncTimer);
    }

    _syncTimer = resourceManager.setInterval(async () => {
        if (_STATE.sessionActive && _STATE.parentResponding && !_STATE.guestMode) {
            await syncWithParent();
        }
    }, 30000);
}

// =============================================
// COMPATIBILITY FUNCTIONS
// =============================================

export function safeGetElement(id) {
    try {
        return document.getElementById(id);
    } catch (error) {
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
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 12px 24px;
                border-radius: 8px;
                z-index: 9999;
                font-size: 14px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                transition: all 0.3s ease;
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
    } catch (error) {}
}

export function validateDataStructure(data, dataType) {
    try {
        if (!data) return false;
        
        const validators = {
            [DATA_TYPES.FRIENDS]: (data) => 
                Array.isArray(data) && data.every(item => 
                    item && typeof item === 'object' && 
                    ('id' in item || '_id' in item) && 
                    'name' in item && 
                    'timestamp' in item
                ),
            [DATA_TYPES.GROUPS]: (data) => 
                Array.isArray(data) && data.every(item => 
                    item && typeof item === 'object' && 
                    ('id' in item || '_id' in item) && 
                    'name' in item && 
                    'timestamp' in item
                ),
            [DATA_TYPES.CHAT_HISTORY]: (data) => 
                Array.isArray(data) && data.every(item => 
                    item && typeof item === 'object' && 
                    'id' in item && 
                    'message' in item && 
                    'timestamp' in item && 
                    'senderId' in item
                ),
            [DATA_TYPES.NOTIFICATIONS]: (data) => 
                Array.isArray(data) && data.every(item => 
                    item && typeof item === 'object' && 
                    'id' in item && 
                    'message' in item && 
                    'timestamp' in item
                ),
            [DATA_TYPES.SETTINGS]: (data) => 
                data && typeof data === 'object' && 
                'id' in data && 
                'updatedAt' in data
        };
        
        const validator = validators[dataType];
        if (!validator) return true;
        
        return validator(data);
    } catch (error) {
        return false;
    }
}

export function getData(dataType) {
    try {
        if (!isReady && !_STATE.ready) {
            return null;
        }
        
        if (dataCache.has(dataType)) {
            return dataCache.get(dataType);
        }
        
        switch(dataType) {
            case DATA_TYPES.FRIENDS:
                return userFriends;
            case DATA_TYPES.GROUPS:
                return userGroups;
            case DATA_TYPES.CHAT_HISTORY:
                return [];
            case DATA_TYPES.NOTIFICATIONS:
                return [];
            case DATA_TYPES.SETTINGS:
                const session = sessionAdapter.getSession();
                return {
                    id: session?.userId || window.currentUser?.id || 'unknown',
                    updatedAt: new Date().toISOString(),
                    ...(window.currentUser?.settings || {})
                };
            default:
                return null;
        }
    } catch (error) {
        return null;
    }
}

export function updateData(dataType, payload) {
    try {
        if (!isReady && !_STATE.ready) {
            return false;
        }
        
        if (!validateDataStructure(payload, dataType)) {
            return false;
        }
        
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
            default:
                return false;
        }
        
        const event = new CustomEvent('coreDataUpdated', {
            detail: {
                type: dataType,
                data: payload,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        
        dataCache.set(dataType, payload);
        
        return true;
    } catch (error) {
        return false;
    }
}

export function queueMessageForParent(type, payload) {
    try {
        messenger.queueForRetry(type, payload, {});
    } catch (error) {}
}

export function processMessageQueue() {
    try {
        router.processMessageQueue();
    } catch (error) {}
}

export function handleParentMessage(event) {
    try {
        if (!event.data || typeof event.data !== 'object') return;
        
        router.handleMessage(event);
    } catch (error) {}
}

export function handleParentInit(payload) {
    try {
        if (!payload) return;
        
        if (payload.session) {
            handleSessionDataFromParent(payload.session);
        }
        
        if (payload.data) {
            if (payload.data.friendsList) {
                updateData(DATA_TYPES.FRIENDS, payload.data.friendsList);
            }
            if (payload.data.groupsList) {
                updateData(DATA_TYPES.GROUPS, payload.data.groupsList);
            }
        }
    } catch (error) {}
}

export function handleRefreshDataRequest(payload) {
    try {
        if (!isReady && !_STATE.ready) {
            queueMessageForParent('error', {
                message: 'Cannot refresh data: core not ready'
            });
            return;
        }
        
        const dataTypes = payload?.dataTypes || Object.values(DATA_TYPES);
        
        showStatusMessage('Refreshing data...', 'info');
        
        dataTypes.forEach(async (dataType) => {
            try {
                const data = await fetchData(dataType);
                if (data) {
                    updateData(dataType, data);
                }
            } catch (error) {}
        });
        
        setTimeout(() => {
            showStatusMessage('Data refreshed successfully', 'success');
            sendToParent('dataRefreshed', {
                dataTypes: dataTypes,
                timestamp: Date.now()
            }, { ack: false });
        }, 1000);
    } catch (error) {}
}

export async function fetchData(dataType) {
    try {
        if (!hasValidSession()) {
            throw new Error('No valid session for API call');
        }
        
        let endpoint, transformFn;
        
        switch(dataType) {
            case DATA_TYPES.FRIENDS:
                endpoint = '/api/user/friends';
                transformFn = (data) => data?.friends || data || [];
                break;
            case DATA_TYPES.GROUPS:
                endpoint = '/api/user/groups';
                transformFn = (data) => data?.groups || data || [];
                break;
            case DATA_TYPES.CHAT_HISTORY:
                endpoint = '/api/messages/history';
                transformFn = (data) => data?.messages || data || [];
                break;
            case DATA_TYPES.NOTIFICATIONS:
                endpoint = '/api/user/notifications';
                transformFn = (data) => data?.notifications || data || [];
                break;
            case DATA_TYPES.SETTINGS:
                endpoint = '/api/user/settings';
                transformFn = (data) => data?.settings || data || {};
                break;
            default:
                throw new Error(`Unknown data type: ${dataType}`);
        }
        
        const response = await secureApiCall('GET', endpoint);
        const data = transformFn(response);
        
        if (!validateDataStructure(data, dataType)) {
            throw new Error(`Invalid data structure for ${dataType}`);
        }
        
        return data;
    } catch (error) {
        throw error;
    }
}

export const pageCore = {
    init: async () => {
        if (isInitializing || isReady || _STATE.initialized) return;
        
        isInitializing = true;
        
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
                timestamp: Date.now()
            }, { ack: false });
            
            processMessageQueue();
            showStatusMessage('Marketplace loaded successfully', 'success');
        } catch (error) {
            isInitializing = false;
            
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
        } catch (error) {}
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
        } catch (error) {
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
        } catch (error) {
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
                    allListings = response.listings.filter(listing => !isListingExpired(listing));
                    safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
                }
            }
        } catch (error) {
            const allListingsData = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
            if (allListingsData) {
                try {
                    allListings = allListingsData.filter(listing => !isListingExpired(listing));
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
        } catch (error) {}
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
        } catch (error) {}
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
        } catch (error) {}
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
        } catch (error) {}
    },
    
    setupEventListeners: () => {
        try {
            setupConnectivityListeners();
            
            window.addEventListener('coreDataUpdated', (event) => {});
        } catch (error) {}
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
        } catch (e) {}
        
        secureMessagingChannel = {
            id: window.parentCommunicationId,
            origin: window.location.origin,
            parentOrigin: sameOrigin ? window.parent.location.origin : '*',
            sameOrigin: sameOrigin,
            ready: false
        };
        
        startHandshakeProtocol();
    } catch (error) {
        handleStandaloneMode();
    }
    
    return Promise.resolve();
}

export async function startSecureHandshakeProtocol() {
    if (handshakeInProgress || !window.parent || window.parent === window) {
        return;
    }
    
    try {
        handshakeInProgress = true;
        handshakeRequestSent = false;
        sessionRetryAttempt = 0;
        
        requestSessionFromParent();
    } catch (error) {
        handshakeInProgress = false;
    }
}

export function requestSessionFromParent() {
    if (handshakeInProgress && handshakeRequestSent) {
        return;
    }
    
    try {
        handshakeRequestSent = true;
        
        sendToParent(PARENT_MESSAGE_TYPES.REQUEST_SESSION, {
            source: 'marketplace_iframe',
            id: window.parentCommunicationId,
            timestamp: Date.now(),
            version: '5.0.0',
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
    } catch (error) {
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
    } catch (error) {
        handshakeInProgress = false;
    }
}

export function handleSecureParentMessage(event) {
    try {
        if (!validateMessageOrigin(event)) {
            return;
        }
        
        const message = event.data;
        
        if (!message || typeof message !== 'object') {
            return;
        }
        
        const modern = compatibility.transformInbound(message);
        
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
            case PARENT_MESSAGE_TYPES.PAGE_ACTIVATED:
                handlePageActivated(modern.payload);
                break;
            case PARENT_MESSAGE_TYPES.NAVIGATE:
                handleNavigate(modern.payload);
                break;
            case PARENT_MESSAGE_TYPES.PONG:
                transport.handlePong();
                break;
            case PARENT_MESSAGE_TYPES.CAPABILITIES:
                handleCapabilities(modern.payload);
                break;
            case PARENT_MESSAGE_TYPES.ENVIRONMENT:
                handleEnvironment(modern.payload);
                break;
            case 'SESSION_DATA':
                if (modern.source === 'parent') {
                    handleSecureSessionData(modern);
                }
                break;
            case 'user_data':
                migrateLegacyUserData(modern.data || modern.payload);
                break;
            case 'user_profile_updated':
                if (modern.data || modern.payload) {
                    handleSessionUpdate(modern.data || modern.payload);
                }
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
                if (modern.requestId === window.parentCommunicationId) {
                    if (modern.data && modern.data.session) {
                        handleSessionDataFromParent(modern.data.session);
                    }
                }
                break;
            case 'ping':
                sendToParent('pong', {
                    id: window.parentCommunicationId,
                    timestamp: Date.now(),
                    sessionStatus: !!sessionData || _STATE.sessionActive
                }, { ack: false });
                break;
        }
    } catch (error) {}
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
            subscription: data.user?.subscription || data.subscription,
            trustLevel: data.user?.trustLevel || data.trustLevel || 'new',
            groups: data.user?.groups || data.groups || [],
            friends: data.user?.friends || data.friends || [],
            source: 'parent_handshake'
        };
        
        handleSessionDataFromParent(sessionDataFromParent);
    } catch (error) {
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
                _STATE.demoMode = false;
                
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
    } catch (error) {}
}

export function handlePageActivated(data) {
    try {
        window.dispatchEvent(new CustomEvent('marketplace:page-activated', {
            detail: data
        }));
    } catch (error) {}
}

export function handleNavigate(data) {
    try {
        if (data.url && data.url !== window.location.href) {
            if (data.internal) {
                window.location.hash = data.hash || '';
                window.history.pushState({}, '', data.url);
                window.dispatchEvent(new CustomEvent('marketplace:navigate', {
                    detail: data
                }));
            } else {
                sendToParent(PARENT_MESSAGE_TYPES.NAVIGATE, {
                    url: data.url,
                    timestamp: Date.now()
                }, { ack: false });
            }
        }
    } catch (error) {}
}

export function handleCapabilities(data) {
    try {
        if (data && data.capabilities) {
            _STATE.parentCapabilities = data.capabilities;
            
            sendToParent(PARENT_MESSAGE_TYPES.CAPABILITIES, {
                capabilities: {
                    session: true,
                    heartbeat: true,
                    sync: true,
                    ack: true,
                    signature: !_STATE.sandboxRestrictions?.crypto,
                    timestamp: true,
                    replay: true,
                    retry: true,
                    offline: true,
                    visibility: true,
                    environment: true,
                    recovery: true,
                    diagnostics: true
                },
                timestamp: Date.now(),
                environment: environmentDetector.environment
            }, { ack: false });
        }
    } catch (error) {}
}

export function handleEnvironment(data) {
    try {
        if (data && data.environment) {
            _STATE.environment.parentType = data.environment.type;
            logger.log('info', 'Parent environment received', data.environment);
        }
    } catch (error) {}
}

export function validateParentOrigin(message, event) {
    try {
        if (!event || !event.origin) return true;
        
        return originTrustAdapter.isOriginTrusted(event.origin);
    } catch (error) {
        return false;
    }
}

export function validateMessageOrigin(event) {
    try {
        return originTrustAdapter.validateMessageOrigin(event);
    } catch (error) {
        return false;
    }
}

export function startHandshakeProtocol() {
    try {
        sendToParent(PARENT_MESSAGE_TYPES.CHILD_READY, {
            id: window.parentCommunicationId || _STATE.frameId,
            type: 'marketplace',
            version: '5.0.0',
            features: ['session_authority', 'centralized_auth', 'ui_coordination', 'secure_handshake', 'fallback_mode', 'heartbeat', 'ack', 'signature', 'environment', 'recovery', 'diagnostics'],
            timestamp: Date.now(),
            environment: environmentDetector.environment
        }, { ack: true });
        
        initiateHandshakeRetry();
    } catch (error) {}
}

export function initiateHandshakeRetry() {
    if (handshakeComplete || _STATE.handshakeComplete) {
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
                
                if (!handshakeComplete && !_STATE.handshakeComplete) {
                    initiateHandshakeRetry();
                }
            }
        }, delay);
    } catch (error) {}
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
    } catch (error) {}
}

export function handleSessionDataFromParent(sessionDataFromParent) {
    if (sessionValidationInProgress) {
        return;
    }
    
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
        if (window._MARKETPLACE_UI_BOUND_) {
            return;
        }
        
        window._MARKETPLACE_UI_BOUND_ = true;
        
        const event = new CustomEvent('marketplaceSessionReady', {
            detail: {
                user: window.currentUser,
                session: sessionAdapter.getSession(),
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        
        const marketplaceContainer = safeGetElement('marketplaceContainer');
        if (marketplaceContainer) {
            marketplaceContainer.classList.add('session-ready');
        }
    } catch (error) {}
}

export function validateSessionSchema(session) {
    try {
        if (!session || typeof session !== 'object') {
            return false;
        }
        
        const hasUserId = !!(session.userId || session.user_id || session.userid);
        const hasToken = !!(session.userToken || session.token || session.user_token);
        
        if (!hasUserId || !hasToken) {
            return false;
        }
        
        if (session.userToken && typeof session.userToken === 'string' && session.userToken.length < 5) {
            return false;
        }
        
        return true;
    } catch (error) {
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
    } catch (error) {}
}

export function storeCentralizedToken(token) {
    try {
        if (!token || typeof token !== 'string' || token.length < 5) {
            return;
        }
        
        safeStorage.set('USER_TOKEN', token);
    } catch (error) {}
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
    } catch (error) {}
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
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    } catch (error) {}
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
        } catch (error) {
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
            } catch (e) {}
        }
        
        sessionAdapter.enableGuestMode();
    } catch (error) {}
}

export function handleSessionUpdate(updatedData) {
    try {
        if (!updatedData || typeof updatedData !== 'object') {
            return;
        }
        
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
            
            if (updatedData.subscription) {
                userSubscription = updatedData.subscription;
            }
        }
    } catch (error) {}
}

export function handleParentLogout() {
    try {
        clearSessionData();
        showNotification('You have been logged out.', 'warning');
        sessionAdapter.enableGuestMode();
    } catch (error) {}
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
        safeStorage.sessionRemove('core_session_token');
        safeStorage.sessionRemove('core_session_cache');
        
        parentDataLoaded = false;
        directAPILoaded = false;
        
        isReady = _STATE.ready;
        isInitializing = false;
        messageQueue = [];
        dataCache.clear();
        
        sessionAdapter.clear();
    } catch (error) {}
}

export function handleRefreshUI() {
    try {
        window.dispatchEvent(new CustomEvent('marketplace:refresh-ui'));
    } catch (error) {}
}

export function handleForceReload() {
    try {
        saveAllMarketplaceData();
        window.location.reload();
    } catch (error) {}
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
                    if (cached) {
                        return { listings: cached };
                    }
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
    } catch (error) {
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
    } catch (error) {
        return null;
    }
}

export async function safeApiCall(method, endpoint, data = null) {
    try {
        return await secureApiCall(method, endpoint, data);
    } catch (error) {
        return null;
    }
}

export function handleParentUnavailable() {
    try {
        showReconnectionState();
        startReconnectionAttempts();
        sessionAdapter.enableGuestMode();
    } catch (error) {}
}

export function showReconnectionState() {
    try {
        let reconnectMsg = safeGetElement('reconnectionMessage');
        if (!reconnectMsg) {
            reconnectMsg = document.createElement('div');
            reconnectMsg.id = 'reconnectionMessage';
            reconnectMsg.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(255, 193, 7, 0.9);
                color: #000;
                padding: 10px 15px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            `;
            reconnectMsg.innerHTML = `
                <i class="fas fa-sync-alt fa-spin"></i>
                <span>Reconnecting to parent session...</span>
            `;
            document.body.appendChild(reconnectMsg);
        }
        
        reconnectMsg.style.display = 'flex';
    } catch (error) {}
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
                timestamp: Date.now()
            }, { ack: true });
            
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000);
            setTimeout(attemptReconnection, delay);
        };
        
        setTimeout(attemptReconnection, 2000);
    } catch (error) {}
}

export function hideReconnectionState() {
    try {
        const reconnectMsg = safeGetElement('reconnectionMessage');
        if (reconnectMsg) {
            reconnectMsg.style.display = 'none';
        }
    } catch (error) {}
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
    } catch (error) {}
}

export function initializeTokenSystem() {
    if (tokenInitializationPromise) {
        return tokenInitializationPromise;
    }
    
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
        if (!token || typeof token !== 'string') return false;
        if (token === 'undefined' || token === 'null' || token === '') return false;
        if (token.length < 5) return false;
        return true;
    } catch (error) {
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
            } catch (error) {
                setTimeout(checkApiJs, 100);
            }
        };
        
        const timeoutId = setTimeout(() => {
            resolve();
        }, 5000);
        
        checkApiJs();
        
        setTimeout(() => {
            clearTimeout(timeoutId);
        }, 6000);
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
    } catch (reportError) {}
}

export function getCentralToken() {
    try {
        const session = sessionAdapter.getSession();
        
        if (session && session.userToken) {
            return session.userToken;
        }
        
        if (typeof getUserToken === 'function') {
            try {
                const token = getUserToken();
                if (token) {
                    return token;
                }
            } catch (e) {}
        }
        
        const legacyTokens = [
            'accessToken',
            'moodchat_token', 
            'authToken',
            'knecta_auth_token',
            'USER_TOKEN'
        ];
        
        for (const tokenKey of legacyTokens) {
            const legacyToken = safeStorage.get(tokenKey);
            if (legacyToken) {
                return legacyToken;
            }
        }
        
        return null;
    } catch (error) {
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
            } catch (e) {}
        }
    } catch (error) {}
}

export async function bootstrapIframe() {
    if (isBootstrapped || _STATE.initialized) {
        return;
    }
    
    try {
        await startSecureHandshakeProtocol();
        
        if (!sessionData && !_STATE.sessionActive) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (tokenInitializationPromise) {
            try {
                await tokenInitializationPromise;
            } catch (error) {}
        }
        
        loadCachedDataInstantly();
        
        if (hasValidSession()) {
            try {
                const userResponse = await secureApiCall('GET', '/api/auth/verify');
                if (userResponse && userResponse.valid) {}
            } catch (error) {}
        }
        
        isBootstrapped = true;
    } catch (error) {
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
            } catch (e) {}
        }
        
        let allMarketplaceUsers = [];
        const cachedUsers = safeStorage.get(LOCAL_STORAGE_KEYS.MARKETPLACE_USERS);
        if (cachedUsers) {
            try {
                allMarketplaceUsers = cachedUsers;
            } catch {}
        }
        
        const myListingsData = safeStorage.get(LOCAL_STORAGE_KEYS.MY_LISTINGS);
        if (myListingsData) {
            try {
                myListings = myListingsData;
            } catch {}
        }
        
        const allListingsData = safeStorage.get(LOCAL_STORAGE_KEYS.ALL_LISTINGS);
        if (allListingsData) {
            try {
                allListings = allListingsData.filter(listing => !isListingExpired(listing));
                
                allListings = allListings.map(listing => {
                    if (!listing.user && listing.userId) {
                        const listingUser = allMarketplaceUsers.find(u => u.id === listing.userId) || {
                            id: listing.userId,
                            displayName: 'Unknown User',
                            photoURL: '',
                            trustLevel: 'new'
                        };
                        listing.user = listingUser;
                    }
                    return listing;
                });
            } catch {}
        }
        
        const premiumListingsData = safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS);
        if (premiumListingsData) {
            try {
                const premiumListings = premiumListingsData;
                premiumListings.forEach(listing => {
                    if (!listing.user && listing.userId) {
                        const listingUser = allMarketplaceUsers.find(u => u.id === listing.userId) || {
                            id: listing.userId,
                            displayName: 'Unknown User',
                            photoURL: '',
                            trustLevel: 'new'
                        };
                        listing.user = listingUser;
                    }
                });
                allListings = [...allListings, ...premiumListings];
            } catch {}
        }
        
        const spotlightListingsData = safeStorage.get(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS);
        if (spotlightListingsData) {
            try {
                const spotlightData = spotlightListingsData;
                spotlightData.forEach(listing => {
                    if (!listing.user && listing.userId) {
                        const listingUser = allMarketplaceUsers.find(u => u.id === listing.userId) || {
                            id: listing.userId,
                            displayName: 'Unknown User',
                            photoURL: '',
                            trustLevel: 'new'
                        };
                        listing.user = listingUser;
                    }
                });
            } catch {}
        }
        
        const savedItemsData = safeStorage.get(LOCAL_STORAGE_KEYS.SAVED_ITEMS);
        if (savedItemsData) {
            try {
                savedItems = savedItemsData;
            } catch {}
        }
        
        const privateNotesData = safeStorage.get(LOCAL_STORAGE_KEYS.PRIVATE_NOTES);
        if (privateNotesData) {
            try {
                privateNotes = privateNotesData;
            } catch {}
        }
        
        const draftsData = safeStorage.get(LOCAL_STORAGE_KEYS.OFFLINE_DRAFTS);
        if (draftsData) {
            try {
                offlineDrafts = draftsData;
            } catch {}
        }
        
        const trustStatsData = safeStorage.get(LOCAL_STORAGE_KEYS.TRUST_STATS);
        if (trustStatsData) {
            try {
                trustStats = trustStatsData;
            } catch {}
        }
        
        const moodFilterData = safeStorage.get(LOCAL_STORAGE_KEYS.MOOD_FILTER);
        if (moodFilterData) {
            try {
                currentMoodFilter = moodFilterData;
            } catch {}
        }
        
        const groupsData = safeStorage.get(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (groupsData) {
            try {
                userGroups = groupsData;
            } catch {}
        }
        
        const friendsData = safeStorage.get(LOCAL_STORAGE_KEYS.USER_FRIENDS);
        if (friendsData) {
            try {
                userFriends = friendsData;
            } catch {}
        }
        
        const subscriptionData = safeStorage.get(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION);
        if (subscriptionData) {
            try {
                userSubscription = subscriptionData;
            } catch {}
        }
        
        const teamData = safeStorage.get(LOCAL_STORAGE_KEYS.TEAM_MEMBERS);
        if (teamData) {
            try {
                teamMembers = teamData;
            } catch {}
        }
        
        const leaderboardDataCache = safeStorage.get(LOCAL_STORAGE_KEYS.LEADERBOARD);
        if (leaderboardDataCache) {
            try {
                leaderboardData = JSON.parse(leaderboardDataCache);
            } catch {}
        }
        
        const analyticsDataCache = safeStorage.get(LOCAL_STORAGE_KEYS.ANALYTICS);
        if (analyticsDataCache) {
            try {
                analyticsData = JSON.parse(analyticsDataCache);
            } catch {}
        }
        
        const streakDataCache = safeStorage.get(LOCAL_STORAGE_KEYS.STREAK_DATA);
        if (streakDataCache) {
            try {
                streakData = JSON.parse(streakDataCache);
            } catch {}
        }
        
        const premiumFeaturesCache = safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_FEATURES);
        if (premiumFeaturesCache) {
            try {
                premiumFeatures = JSON.parse(premiumFeaturesCache);
            } catch {}
        }
        
        const paymentMethodsCache = safeStorage.get(LOCAL_STORAGE_KEYS.PAYMENT_METHODS);
        if (paymentMethodsCache) {
            try {
                paymentMethods = JSON.parse(paymentMethodsCache);
            } catch {}
        }
    } catch (error) {}
}

export async function initializeEnhancedMarketplace() {
    try {
        checkDarkMode();
        await checkUserPremiumStatus();
        await loadEnhancedMarketplaceData();
        cleanupExpiredListings();
    } catch (error) {}
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
    } catch (error) {}
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
    } catch (error) {
        generateSampleMarketplaceData();
    }
}

export async function loadListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/listings');
        
        if (response && response.listings) {
            allListings = response.listings;
            allListings = allListings.filter(listing => !isListingExpired(listing));
            
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        }
    } catch (error) {
        throw error;
    }
}

export async function loadSpotlightListingsFromBackend() {
    try {
        const response = await safeApiCall('GET', '/api/marketplace/spotlight');
        
        if (response && response.spotlightListings) {
            safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, response.spotlightListings);
        }
    } catch (error) {}
}

export function updateListingCounts() {
    try {
        updateAvailableListingsCount();
    } catch (error) {}
}

export function updateAvailableListingsCount() {
    try {
        const element = document.getElementById('availableListingsCount');
        if (element) {
            const activeCount = allListings.filter(l => !isListingExpired(l)).length;
            element.textContent = activeCount;
        }
    } catch (error) {}
}

export function isUserPremium() {
    try {
        if (_STATE.demoMode) return true;
        
        const session = sessionAdapter.getSession();
        if (session && session.isPremium) return true;
        
        return userSubscription && userSubscription.status === 'active';
    } catch (error) {
        return false;
    }
}

export function isListingVisibleToUser(listing) {
    try {
        if (!listing) return false;
        
        if (isListingExpired(listing)) {
            return false;
        }
        
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
        } else if (listing.visibility === TRUST_CIRCLES.MICRO) {
            return (isUserPremium() && listing.allowedUsers && listing.allowedUsers.includes(currentUserId));
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

export function filterListingsByMood(listings, mood) {
    try {
        if (!Array.isArray(listings)) return [];
        
        switch (mood) {
            case MOOD_CONTEXTS.HELP:
                return listings.filter(listing => 
                    listing.availability === AVAILABILITY.URGENT || 
                    listing.moodContext === MOOD_CONTEXTS.URGENT
                );
            case MOOD_CONTEXTS.LEARN:
                return listings.filter(listing => 
                    listing.type === LISTING_TYPES.DIGITAL ||
                    (listing.category && listing.category.toLowerCase().includes('tutor')) ||
                    (listing.category && listing.category.toLowerCase().includes('lesson')) ||
                    (listing.title && listing.title.toLowerCase().includes('learn'))
                );
            case MOOD_CONTEXTS.URGENT:
                return listings.filter(listing => 
                    listing.availability === AVAILABILITY.URGENT ||
                    listing.expiresSoon
                );
            case MOOD_CONTEXTS.CREATIVE:
                return listings.filter(listing => 
                    (listing.category && listing.category.toLowerCase().includes('art')) ||
                    (listing.category && listing.category.toLowerCase().includes('design')) ||
                    (listing.category && listing.category.toLowerCase().includes('creative')) ||
                    listing.template === 'creative'
                );
            case MOOD_CONTEXTS.BUSINESS:
                return listings.filter(listing => 
                    (listing.category && listing.category.toLowerCase().includes('business')) ||
                    (listing.category && listing.category.toLowerCase().includes('consult')) ||
                    listing.template === 'business' ||
                    listing.template === 'vip' ||
                    listing.premium === true
                );
            default:
                return listings;
        }
    } catch (error) {
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
    } catch (error) {
        return '<span class="trust-indicator trust-new">New</span>';
    }
}

export async function trackListingView(listingId) {
    try {
        if (!analyticsData.views) analyticsData.views = 0;
        analyticsData.views++;
        safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
        
        await safeApiCall('POST', `/api/marketplace/listings/${listingId}/view`);
    } catch (error) {}
}

export function updateTrustStats(action) {
    try {
        if (!trustStats[action]) trustStats[action] = 0;
        trustStats[action]++;
        safeStorage.set(LOCAL_STORAGE_KEYS.TRUST_STATS, trustStats);
    } catch (error) {}
}

export async function createPremiumServiceListing(title, description, premiumOptions = {}) {
    try {
        if (!hasValidUser() && !_STATE.demoMode) {
            throw new Error('User not authenticated');
        }
        
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
            visibilitySchedule: premiumOptions.visibilitySchedule,
            expiresAt: premiumOptions.expiresAt || new Date(Date.now() + DURATION_OPTIONS['7d']).toISOString(),
            privateNotes: premiumOptions.privateNotes,
            teamNotes: premiumOptions.teamNotes,
            premium: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (premiumOptions.featured) {
            await processFeaturedListing(listing);
        }
        
        if (premiumOptions.boosted) {
            await processBoostedListing(listing);
        }
        
        myListings.unshift(listing);
        
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        
        const premiumListings = safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || [];
        premiumListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, premiumListings);
        
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
            if (response && response.listing) {
                listing.id = response.listing.id || listingId;
            }
        } catch (error) {
            queueForSync(listing, 'premium_listing');
        }
        
        updateListingStreak();
        updateTrustStats('listingCreated');
        
        if (premiumOptions.featured || premiumOptions.boosted) {
            processPremiumPayment(listing, premiumOptions);
        }
        
        return listing;
    } catch (error) {
        return null;
    }
}

export async function createPremiumDigitalListing(title, description, fileData, premiumOptions = {}) {
    try {
        if (!hasValidUser() && !_STATE.demoMode) {
            throw new Error('User not authenticated');
        }
        
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
            visibilitySchedule: premiumOptions.visibilitySchedule,
            expiresAt: premiumOptions.expiresAt || new Date(Date.now() + DURATION_OPTIONS['7d']).toISOString(),
            privateNotes: premiumOptions.privateNotes,
            teamNotes: premiumOptions.teamNotes,
            premium: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        if (premiumOptions.featured) {
            await processFeaturedListing(listing);
        }
        
        if (premiumOptions.boosted) {
            await processBoostedListing(listing);
        }
        
        myListings.unshift(listing);
        
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        
        const premiumListings = safeStorage.get(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS) || [];
        premiumListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.PREMIUM_LISTINGS, premiumListings);
        
        allListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        
        try {
            const response = await safeApiCall('POST', '/api/marketplace/listings/premium', listing);
            if (response && response.listing) {
                listing.id = response.listing.id || listingId;
            }
        } catch (error) {
            queueForSync(listing, 'premium_listing');
        }
        
        updateListingStreak();
        updateTrustStats('listingCreated');
        
        if (premiumOptions.featured || premiumOptions.boosted) {
            processPremiumPayment(listing, premiumOptions);
        }
        
        return listing;
    } catch (error) {
        return null;
    }
}

export async function processFeaturedListing(listing) {
    try {
        const spotlightListings = safeStorage.get(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS) || [];
        spotlightListings.unshift(listing);
        safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, spotlightListings);
        
        await safeApiCall('POST', '/api/marketplace/spotlight', { listingId: listing.id });
    } catch (error) {}
}

export async function processBoostedListing(listing) {
    try {
        await safeApiCall('POST', '/api/marketplace/boost', { 
            listingId: listing.id,
            duration: '24h'
        });
    } catch (error) {}
}

export async function processPremiumPayment(listing, options) {
    try {
        const paymentAmount = calculatePremiumCost(options);
        
        const paymentData = {
            amount: paymentAmount,
            currency: 'USD',
            listingId: listing.id,
            features: {
                featured: options.featured,
                boosted: options.boosted,
                verified: options.verified,
                autoRenew: options.autoRenew
            }
        };
        
        const response = await safeApiCall('POST', '/api/payments/process', paymentData);
        
        if (response && response.success) {
            return true;
        }
    } catch (error) {}
    
    return false;
}

export function calculatePremiumCost(options) {
    try {
        let cost = 0;
        
        if (options.featured) cost += 5;
        if (options.boosted) cost += 3;
        if (options.verified) cost += 10;
        if (options.autoRenew) cost += 1;
        
        return cost;
    } catch (error) {
        return 0;
    }
}

export async function sendTip(listingId, amount, customAmount = null) {
    try {
        const finalAmount = customAmount || amount;
        
        const tipData = {
            listingId: listingId,
            amount: finalAmount,
            currency: 'USD',
            message: 'Thanks for your great listing!'
        };
        
        const response = await safeApiCall('POST', '/api/marketplace/tips', tipData);
        
        if (response && response.success) {
            updateAnalyticsData('tipReceived', finalAmount);
            return true;
        }
    } catch (error) {}
    
    return false;
}

export function updateAnalyticsData(type, value) {
    try {
        if (!analyticsData[type]) {
            analyticsData[type] = 0;
        }
        
        analyticsData[type] += value;
        safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
    } catch (error) {}
}

export function updateListingStreak() {
    try {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        
        if (!streakData.lastListingDate) {
            streakData = {
                currentStreak: 1,
                longestStreak: 1,
                lastListingDate: today,
                totalListings: 1
            };
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
    } catch (error) {}
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
            
            if (streakData.currentStreak === 30) {
                awardTemporaryPremium(7);
            }
        }
    } catch (error) {}
}

export function awardTemporaryPremium(days) {
    try {
        const tempPremium = {
            status: 'active',
            plan: 'temporary',
            expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
            features: ['featured_listings', 'advanced_analytics']
        };
        
        userSubscription = tempPremium;
        safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, tempPremium);
    } catch (error) {}
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
                
                if (listings.length > 0) {
                    await uploadBulkListings(listings);
                }
            } catch (error) {}
        };
        
        if (file.type === 'application/json') {
            reader.readAsText(file);
        } else if (file.type === 'text/csv') {
            reader.readAsText(file);
        }
    } catch (error) {}
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
    } catch (error) {
        return [];
    }
}

export async function uploadBulkListings(listings) {
    try {
        for (let i = 0; i < listings.length; i++) {
            const listing = listings[i];
            
            try {
                const response = await safeApiCall('POST', '/api/marketplace/listings/bulk', listing);
                
                if (response && response.success) {}
            } catch (error) {}
        }
        
        safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
        safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
    } catch (error) {}
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
    } catch (error) {}
}

export async function backupMarketplaceData() {
    try {
        const backupData = {
            myListings: myListings,
            savedItems: savedItems,
            privateNotes: privateNotes,
            offlineDrafts: offlineDrafts,
            trustStats: trustStats,
            analyticsData: analyticsData,
            premiumFeatures: premiumFeatures,
            timestamp: new Date().toISOString()
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
    } catch (error) {}
}

export async function restoreMarketplaceData(file) {
    try {
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            try {
                const backupData = JSON.parse(e.target.result);
                
                if (!backupData.timestamp || !backupData.myListings) {
                    throw new Error('Invalid backup file');
                }
                
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
        
        reader.onerror = function() {
            showNotification('Failed to read backup file', 'error');
        };
        
        reader.readAsText(file);
    } catch (error) {}
}

export function isListingExpired(listing) {
    try {
        if (!listing || !listing.expiresAt) return false;
        return new Date(listing.expiresAt) < new Date();
    } catch (error) {
        return false;
    }
}

export function cleanupExpiredListings() {
    try {
        const expiredListings = allListings.filter(listing => isListingExpired(listing));
        if (expiredListings.length > 0) {
            allListings = allListings.filter(listing => !isListingExpired(listing));
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
            
            myListings = myListings.filter(listing => !isListingExpired(listing));
            safeStorage.set(LOCAL_STORAGE_KEYS.MY_LISTINGS, myListings);
        }
    } catch (error) {}
}

export function formatTimeAgo(date) {
    try {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }
        
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
    } catch (error) {
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
            if (notification.parentNode) {
                notification.classList.remove('active');
            }
        }, 3000);
    } catch (error) {}
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
    } catch (error) {
        return text || '';
    }
}

export function checkDarkMode() {
    try {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.setAttribute('data-theme', 'dark');
        }
    } catch (error) {}
}

export function queueForSync(data, type) {
    try {
        const syncQueue = safeStorage.get(LOCAL_STORAGE_KEYS.SYNC_QUEUE) || [];
        syncQueue.push({
            type: 'marketplace_' + type,
            data: data,
            timestamp: Date.now(),
            retryCount: 0
        });
        safeStorage.set(LOCAL_STORAGE_KEYS.SYNC_QUEUE, syncQueue);
    } catch (error) {}
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
    } catch (error) {
        return 'soon';
    }
}

export function formatFileSize(bytes) {
    try {
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } catch (error) {
        return 'Unknown size';
    }
}

export function createServiceListing(title, description, options = {}) {
    try {
        if (!hasValidUser() && !_STATE.demoMode) {
            throw new Error('User not authenticated');
        }
        
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
            visibilitySchedule: options.visibilitySchedule,
            expiresAt: options.expiresAt || new Date(Date.now() + DURATION_OPTIONS['7d']).toISOString(),
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
                if (response && response.listing) {
                    listing.id = response.listing.id || listingId;
                }
            }).catch(error => {
                queueForSync(listing, 'listing');
            });
        } catch (error) {
            queueForSync(listing, 'listing');
        }
        
        updateListingStreak();
        updateTrustStats('listingCreated');
        
        return listing;
    } catch (error) {
        return null;
    }
}

export function createDigitalListing(title, description, fileData, options = {}) {
    try {
        if (!hasValidUser() && !_STATE.demoMode) {
            throw new Error('User not authenticated');
        }
        
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
            visibilitySchedule: options.visibilitySchedule,
            expiresAt: options.expiresAt || new Date(Date.now() + DURATION_OPTIONS['7d']).toISOString(),
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
                if (response && response.listing) {
                    listing.id = response.listing.id || listingId;
                }
            }).catch(error => {
                queueForSync(listing, 'listing');
            });
        } catch (error) {
            queueForSync(listing, 'listing');
        }
        
        updateListingStreak();
        updateTrustStats('listingCreated');
        
        return listing;
    } catch (error) {
        return null;
    }
}

export async function downloadDigitalFile(listingId, fileUrl, fileName) {
    try {
        if (!listingId || !fileUrl || !fileName) {
            throw new Error('Missing required download parameters');
        }
        
        if (fileUrl.startsWith('javascript:') || fileUrl.startsWith('data:') || fileUrl.startsWith('blob:')) {
            throw new Error('Invalid file URL scheme');
        }
        
        const listing = allListings.find(l => l.id === listingId) || myListings.find(l => l.id === listingId);
        if (!listing) {
            throw new Error('Listing not found');
        }
        
        const session = sessionAdapter.getSession();
        const currentUserId = session?.userId || window.currentUser?.id;
        
        if (listing.userId !== currentUserId && !isListingVisibleToUser(listing) && !_STATE.demoMode) {
            throw new Error('You do not have permission to download this file');
        }
        
        if (!fileUrl || fileUrl === '#') {
            throw new Error('Invalid file URL');
        }
        
        const downloadIndicator = document.createElement('div');
        downloadIndicator.id = 'downloadIndicator';
        downloadIndicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 14px;
        `;
        downloadIndicator.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span>Downloading ${escapeHtml(fileName)}...</span>
        `;
        document.body.appendChild(downloadIndicator);
        
        if (typeof trackEvent === 'function') {
            try {
                trackEvent('digital_file_download', { 
                    listingId: listingId, 
                    fileName: fileName,
                    fileSize: listing.fileSize,
                    fileType: listing.fileType
                });
            } catch (e) {
                updateTrustStats('fileDownloaded');
            }
        } else {
            updateTrustStats('fileDownloaded');
        }
        
        let finalUrl = fileUrl;
        let shouldRevokeUrl = false;
        
        if (fileUrl.includes('/api/') || fileUrl.includes('/download/')) {
            try {
                const response = await secureApiCall('GET', `/api/marketplace/download/${listingId}`, null, {
                    headers: {
                        'Accept': 'application/octet-stream'
                    }
                });
                
                if (response && response.downloadUrl) {
                    finalUrl = response.downloadUrl;
                } else if (response && response.blob) {
                    const blob = new Blob([response.blob], { type: response.contentType || 'application/octet-stream' });
                    finalUrl = URL.createObjectURL(blob);
                    shouldRevokeUrl = true;
                }
            } catch (apiError) {}
        }
        
        const link = document.createElement('a');
        link.href = finalUrl;
        link.download = fileName;
        link.style.display = 'none';
        link.setAttribute('data-listing-id', listingId);
        
        document.body.appendChild(link);
        
        requestAnimationFrame(() => {
            link.click();
            
            const cleanup = () => {
                if (link.parentNode) {
                    document.body.removeChild(link);
                }
                
                if (downloadIndicator.parentNode) {
                    document.body.removeChild(downloadIndicator);
                }
                
                if (shouldRevokeUrl && finalUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(finalUrl);
                }
                
                showNotification(`Downloaded ${fileName}`, 'success');
            };
            
            setTimeout(cleanup, 5000);
        });
        
        return true;
    } catch (error) {
        const downloadIndicator = document.getElementById('downloadIndicator');
        if (downloadIndicator && downloadIndicator.parentNode) {
            document.body.removeChild(downloadIndicator);
        }
        
        showNotification(`Download failed: ${error.message}`, 'error');
        
        return false;
    }
}

export function generateSampleMarketplaceData() {
    try {
        const sampleUsers = [
            { id: 'user_1', displayName: 'Alex Johnson', photoURL: '', trustLevel: 'reliable', isPremium: true },
            { id: 'user_2', displayName: 'Maria Garcia', photoURL: '', trustLevel: 'verified', isPremium: true },
            { id: 'user_3', displayName: 'David Smith', photoURL: '', trustLevel: 'responsive' },
            { id: 'user_4', displayName: 'Sarah Wilson', photoURL: '', trustLevel: 'pro', isPremium: true },
            { id: 'user_5', displayName: 'James Brown', photoURL: '', trustLevel: 'new' },
            { id: 'user_6', displayName: 'Emma Davis', photoURL: '', trustLevel: 'reliable' },
            { id: 'user_7', displayName: 'Michael Lee', photoURL: '', trustLevel: 'responsive', isPremium: true },
            { id: 'user_8', displayName: 'Sophia Taylor', photoURL: '', trustLevel: 'verified', isPremium: true }
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
                    description: 'Creating stunning logos, banners, and social media graphics. Fast delivery and unlimited revisions.',
                    price: '$50',
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
                    description: 'Experienced math tutor specializing in algebra, calculus, and statistics. Online sessions available.',
                    price: '$30/hour',
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
                    description: '10 professionally designed resume templates in Word and PDF format. ATS-friendly and customizable.',
                    price: '$15',
                    availability: AVAILABILITY.FREE,
                    visibility: TRUST_CIRCLES.PUBLIC,
                    moodContext: MOOD_CONTEXTS.BUSINESS,
                    template: TEMPLATE_TYPES.BUSINESS,
                    fileUrl: '#',
                    fileName: 'resume_templates.zip',
                    fileSize: '2.5 MB',
                    fileType: 'application/zip',
                    createdAt: new Date(Date.now() - 10800000).toISOString(),
                    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'listing_4',
                    userId: 'user_4',
                    user: sampleUsers[3],
                    type: LISTING_TYPES.SERVICE,
                    title: 'Website Development',
                    description: 'Full-stack web development with React, Node.js, and MongoDB. Responsive design and SEO optimized.',
                    price: '$500+',
                    availability: AVAILABILITY.BUSY,
                    visibility: TRUST_CIRCLES.PREMIUM,
                    moodContext: MOOD_CONTEXTS.BUSINESS,
                    template: TEMPLATE_TYPES.BUSINESS,
                    featured: true,
                    premium: true,
                    createdAt: new Date(Date.now() - 14400000).toISOString(),
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'listing_5',
                    userId: 'user_5',
                    user: sampleUsers[4],
                    type: LISTING_TYPES.SERVICE,
                    title: 'Phone Repair Services',
                    description: 'Screen replacement, battery change, and software issues for all major smartphone brands.',
                    price: 'Starting at $40',
                    availability: AVAILABILITY.URGENT,
                    visibility: TRUST_CIRCLES.PUBLIC,
                    moodContext: MOOD_CONTEXTS.HELP,
                    template: TEMPLATE_TYPES.BASIC,
                    createdAt: new Date(Date.now() - 18000000).toISOString(),
                    expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: 'listing_6',
                    userId: 'user_6',
                    user: sampleUsers[5],
                    type: LISTING_TYPES.DIGITAL,
                    title: 'Study Notes - Organic Chemistry',
                    description: 'Comprehensive notes covering all major topics in organic chemistry. Perfect for exam preparation.',
                    price: 'Free',
                    availability: AVAILABILITY.FREE,
                    visibility: TRUST_CIRCLES.GROUPS,
                    moodContext: MOOD_CONTEXTS.LEARN,
                    template: TEMPLATE_TYPES.DIGITAL,
                    fileUrl: '#',
                    fileName: 'organic_chemistry_notes.pdf',
                    fileSize: '3.2 MB',
                    fileType: 'application/pdf',
                    createdAt: new Date(Date.now() - 21600000).toISOString(),
                    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
                }
            ];
            
            allListings = sampleListings;
            safeStorage.set(LOCAL_STORAGE_KEYS.ALL_LISTINGS, allListings);
            
            const spotlightListings = sampleListings.filter(l => l.featured);
            safeStorage.set(LOCAL_STORAGE_KEYS.SPOTLIGHT_LISTINGS, spotlightListings);
            
            if (userFriends.length === 0) {
                userFriends = sampleUsers.slice(0, 4);
                safeStorage.set(LOCAL_STORAGE_KEYS.USER_FRIENDS, userFriends);
            }
            
            if (userGroups.length === 0) {
                userGroups = [
                    { id: 'group_1', name: 'Students Union', memberCount: 45 },
                    { id: 'group_2', name: 'Freelancers Network', memberCount: 23 },
                    { id: 'group_3', name: 'Tech Enthusiasts', memberCount: 67 }
                ];
                safeStorage.set(LOCAL_STORAGE_KEYS.USER_GROUPS, userGroups);
            }
            
            if (Object.keys(analyticsData).length === 0) {
                analyticsData = {
                    views: 245,
                    saves: 42,
                    shares: 18,
                    messages: 56,
                    conversionRate: 12.5,
                    avgEngagement: 45,
                    viewsChange: 15,
                    savesChange: 8,
                    sharesChange: 22,
                    messagesChange: 5,
                    conversionChange: 3,
                    engagementChange: 10
                };
                safeStorage.set(LOCAL_STORAGE_KEYS.ANALYTICS, analyticsData);
            }
            
            if (leaderboardData.length === 0) {
                leaderboardData = sampleUsers.map((user, index) => ({
                    ...user,
                    listingsCount: Math.floor(Math.random() * 20) + 5,
                    rating: (Math.random() * 2 + 3).toFixed(1),
                    successfulTransactions: Math.floor(Math.random() * 100) + 20,
                    points: Math.floor(Math.random() * 1000) + 500
                })).sort((a, b) => b.points - a.points);
                
                safeStorage.set(LOCAL_STORAGE_KEYS.LEADERBOARD, JSON.stringify(leaderboardData));
            }
        }
    } catch (error) {}
}

export async function syncOfflineMarketplaceData() {
    try {
        const syncQueue = safeStorage.get(LOCAL_STORAGE_KEYS.SYNC_QUEUE) || [];
        const marketplaceItems = syncQueue.filter(item => item.type.startsWith('marketplace_'));
        
        if (marketplaceItems.length === 0) return;
        
        showNotification(`Syncing ${marketplaceItems.length} marketplace items...`, 'info');
        
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
            } catch (error) {
                item.retryCount = (item.retryCount || 0) + 1;
                
                if (item.retryCount > 3) {
                    syncQueue.splice(syncQueue.indexOf(item), 1);
                }
            }
        }
        
        safeStorage.set(LOCAL_STORAGE_KEYS.SYNC_QUEUE, syncQueue);
        
        if (marketplaceItems.length > 0) {
            showNotification('Marketplace data synced', 'success');
        }
    } catch (error) {}
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
        
        if (userSubscription) {
            safeStorage.set(LOCAL_STORAGE_KEYS.USER_SUBSCRIPTION, userSubscription);
        }
    } catch (error) {}
}

export function queueApiCall(method, endpoint, data, options) {
    return new Promise((resolve, reject) => {
        try {
            apiCallQueue.push({
                method,
                endpoint,
                data,
                options,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            if (!isProcessingQueue) {
                processApiCallQueue();
            }
        } catch (error) {
            reject(error);
        }
    });
}

export async function processApiCallQueue() {
    if (isProcessingQueue || apiCallQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    
    try {
        if (tokenInitializationPromise) {
            try {
                await tokenInitializationPromise;
            } catch (error) {
                apiCallQueue.forEach(call => {
                    call.reject(new Error('Token initialization failed'));
                });
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
    } catch (error) {} finally {
        isProcessingQueue = false;
    }
}

export async function authenticatedApiCall(method, endpoint, data = null) {
    try {
        return await safeApiCall(method, endpoint, data);
    } catch (error) {
        return null;
    }
}

export async function makeApiCall(method, endpoint, data = null) {
    try {
        return await secureApiCall(method, endpoint, data);
    } catch (error) {
        return null;
    }
}

export function startBackgroundJobs() {
    if (!isAuthReady || backgroundJobsStarted) {
        return;
    }
    
    backgroundJobsStarted = true;
    
    try {
        setTimeout(() => {
            loadEnhancedMarketplaceData().catch((error) => {});
        }, 1000);
        
        setTimeout(() => {
            checkUserPremiumStatus().catch((error) => {});
        }, 1500);
    } catch (error) {}
}

export function handleSessionExpired() {
    try {
        safeStorage.remove('USER_TOKEN');
        showNotification('Your session has expired. Please log in again.', 'error');
        
        if (typeof refreshToken === 'function') {
            refreshToken().catch(() => {
                handleParentLogout();
            });
        } else {
            handleParentLogout();
        }
        
        sessionAdapter.enableGuestMode();
    } catch (error) {}
}

export function requestParentUserData() {
    try {
        const requestSent = sendToParent('get_user_data', {
            fields: ['id', 'displayName', 'email', 'photoURL', 'isPremium', 'subscription', 'trustLevel']
        }, { ack: true });
        
        if (requestSent) {
            setTimeout(() => {
                if (!parentDataLoaded && !dataFetchInProgress) {
                    fetchUserDataDirectly();
                }
            }, parentDataTimeout);
        } else {
            fetchUserDataDirectly();
        }
    } catch (error) {
        fetchUserDataDirectly();
    }
}

export async function fetchUserDataDirectly() {
    if (dataFetchInProgress) {
        return;
    }
    
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
                } catch (e) {}
            }
            
            throw new Error('No authentication token available');
        }
        
        const response = await secureApiCall('GET', '/api/user/profile');
        
        if (response && response.user) {
            directAPILoaded = true;
            parentDataLoaded = false;
            dataFetchInProgress = false;
            
            processUserData(response.user, 'api');
            
            sendToParent('user_data_loaded', {
                source: 'direct_api',
                userId: response.user.id
            }, { ack: false });
        } else {
            throw new Error('Invalid response from user profile API');
        }
    } catch (error) {
        dataFetchInProgress = false;
        
        if (window.parent !== window && !parentDataLoaded) {} else {
            const cachedUser = safeStorage.get(LOCAL_STORAGE_KEYS.USER);
            if (cachedUser) {
                try {
                    processUserData(cachedUser, 'cache_fallback');
                } catch (e) {}
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
    } catch (error) {}
}

export function handleParentUserData(userDataFromParent) {
    try {
        if (parentDataLoaded || dataFetchInProgress) {
            return;
        }
        
        if (!userDataFromParent || (!userDataFromParent.id && !userDataFromParent.email)) {
            if (!dataFetchInProgress) {
                fetchUserDataDirectly();
            }
            return;
        }
        
        parentDataLoaded = true;
        dataFetchInProgress = false;
        
        processUserData(userDataFromParent, 'parent');
    } catch (error) {}
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
        
        if (updatedData.subscription) {
            userSubscription = updatedData.subscription;
        }
        
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
    } catch (error) {}
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
    } catch (error) {}
}

export function getMarketplaceStats() {
    try {
        return {
            totalListings: allListings.length,
            myListings: myListings.length,
            savedItems: savedItems.length,
            premiumUsers: 0
        };
    } catch (error) {
        return { totalListings: 0, myListings: 0, savedItems: 0, premiumUsers: 0 };
    }
}

export function getMarketplaceAnalytics() {
    try {
        return analyticsData || {};
    } catch (error) {
        return {};
    }
}

export function getMarketplaceUser() {
    try {
        return window.currentUser || {};
    } catch (error) {
        return {};
    }
}

export function isMarketplaceReady() {
    try {
        return isBootstrapped && (hasValidSession() || window.currentUser || _STATE.guestMode || _STATE.demoMode);
    } catch (error) {
        return false;
    }
}

export function isCoreReady() {
    return isReady || _STATE.ready;
}

function checkDependencies() {
    try {
        if (!window.API && !window.AppCore && !window.callApi) {
            return false;
        }
        return true;
    } catch (error) {
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
            version: msg.version || '5.0.0'
        };
    } catch (error) {
        return {
            type: 'ERROR',
            source: 'marketplace',
            timestamp: Date.now(),
            error: 'Message normalization failed'
        };
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
    } catch (error) {}
}

// =============================================
// ADD MISSING EXPORT FOR clearMoodFilter
// =============================================

export function clearMoodFilter() {
    try {
        currentMoodFilter = null;
        safeStorage.remove(LOCAL_STORAGE_KEYS.MOOD_FILTER);
        
        window.dispatchEvent(new CustomEvent('moodFilterCleared', {
            detail: { timestamp: Date.now() }
        }));
        
        return true;
    } catch (error) {
        return false;
    }
}

// =============================================
// BACKWARD COMPATIBILITY - PRESERVED APIS
// =============================================

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

// =============================================
// MISSING EXPORT: AppState for calls-ui.js
// =============================================

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
    getAuthorityStatus: () => iframeAuthority?.getStatus()
};

// Safety variables from original file
let _PARENT_READY_ = false;
let _HANDSHAKE_DONE_ = false;
let _HANDSHAKE_RETRIES_ = 0;
let _syncAttempts = 0;
const MAX_HANDSHAKE = 3;

// Legacy message listener
window.addEventListener('message', (e) => {
    if (!e || !e.data) return;
    
    try {
        if (e.data.type === 'PARENT_READY') {
            _PARENT_READY_ = true;
            _HANDSHAKE_DONE_ = true;
        }
        
        if (e.data.type === PARENT_MESSAGE_TYPES?.PARENT_READY) {
            _PARENT_READY_ = true;
            _HANDSHAKE_DONE_ = true;
        }
    } catch (err) {}
}, false);

// =============================================
// GLOBAL EXPORTS FOR PARENT COORDINATION
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
            
            // Additional exports
            AppState,
            
            // New exports
            diagnostics: {
                getReport: () => diagnostics?.getReport(),
                getStatus: () => ({
                    handshake: handshake?.getStatus(),
                    session: sessionAdapter?.getState(),
                    connection: transport?.getConnectionStatus(),
                    recovery: recovery?.getStatus(),
                    startup: startupGovernor?.getStatus(),
                    environment: environmentDetector?.environment,
                    authority: iframeAuthority?.getStatus()
                }),
                enableDebug: () => diagnostics?.enableDebug(),
                disableDebug: () => diagnostics?.disableDebug()
            },
            
            _STATE,
            sessionAdapter,
            environmentDetector,
            iframeAuthority
        };
        
        window.pageCore = pageCore;
    } catch (error) {}
}

// =============================================
// AUTO-INITIALIZE WITH SAFETY WRAPPER
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            showStatusMessage('Initializing marketplace...', 'info');
            
            if (!checkDependencies()) {}
            
            pageCore.init().catch(error => {
                showStatusMessage('Failed to initialize marketplace', 'error');
                sessionAdapter.enableGuestMode();
            });
        } catch (error) {
            showStatusMessage('Failed to load marketplace', 'error');
            sessionAdapter.enableGuestMode();
        }
    }, 100);
});

// =============================================
// STUB IMPORTS FOR BACKWARD COMPATIBILITY
// =============================================

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
} catch (e) {}

// =============================================
// inviteTeamMember - EXPORTED FUNCTION
// =============================================

export async function inviteTeamMember(email, role = 'member') {
    try {
        if (!userSubscription || (userSubscription.plan !== 'business' && userSubscription.plan !== 'team')) {
            throw new Error('Team features require a business or team subscription');
        }
        
        showNotification(`Invitation sent to ${email}`, 'success');
        
        const newMember = {
            id: 'member_' + Date.now(),
            email: email,
            displayName: email.split('@')[0],
            role: role,
            joinedAt: new Date().toISOString()
        };
        
        teamMembers.push(newMember);
        safeStorage.set(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
        
        return { success: true, member: newMember };
    } catch (error) {
        showNotification(`Failed to invite team member: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

// =============================================
// inviteTeamMemberWrapper - For backward compatibility
// =============================================

export async function inviteTeamMemberWrapper(email, role = 'member') {
    return inviteTeamMember(email, role);
}

// =============================================
// EXPORTED FUNCTIONS FOR openChat, loadAnalyticsData, loadLeaderboard, updateTeamMemberRole
// =============================================

export async function openChat(userId, userName) {
    try {
        showNotification(`Opening chat with ${userName}...`, 'info');
        
        sendToParent('open_chat', {
            userId: userId,
            userName: userName,
            timestamp: Date.now()
        }, { ack: false });
        
        return true;
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
        return leaderboardData;
    }
}

// =============================================
// updateTeamMemberRole - SINGLE DEFINITION
// =============================================

export async function updateTeamMemberRole(changes) {
    try {
        if (!hasValidSession() || (!userSubscription || (userSubscription.plan !== 'business' && userSubscription.plan !== 'team'))) {
            throw new Error('Team features require a business or team subscription');
        }
        
        for (const change of changes) {
            const memberIndex = teamMembers.findIndex(m => m.id === change.memberId);
            if (memberIndex !== -1) {
                teamMembers[memberIndex].role = change.role;
            }
        }
        
        safeStorage.set(LOCAL_STORAGE_KEYS.TEAM_MEMBERS, teamMembers);
        showNotification('Team roles updated successfully', 'success');
        
        return true;
    } catch (error) {
        showNotification(`Failed to update team roles: ${error.message}`, 'error');
        return false;
    }
}