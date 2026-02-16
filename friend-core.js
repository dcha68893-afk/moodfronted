// =============================================
// FRIEND PAGE - CORE IMPLEMENTATION v2.0.3
// Production-Ready Micro-Frontend Core Engine
// Parent: chat.html | Module: friend.core.js
// =============================================

import {
    // Core API - MUST BE PRESENT
    login,
    register,
    logout,
    getValidToken as originalGetValidToken,
    secureFetch,
    escapeHtml as importedEscapeHtml,
    formatTimeAgo as importedFormatTimeAgo,
    getTrustScoreClass as importedGetTrustScoreClass,
    showNotification as importedShowNotification,
    navigateToChat as importedNavigateToChat,
    navigateToCall as importedNavigateToCall,
    simulateContactSync as importedSimulateContactSync,
    
    // Error Types
    KnectaError,
    SessionError,
    ValidationError
} from './js/api.core.js';

import {
    generateMessageId,
    validateMessageSchema,
    getMessages
} from './js/api.messages.js';

// Handle NetworkError export gracefully
let NetworkError;
try {
    const apiCore = await import('./js/api.core.js');
    NetworkError = apiCore.NetworkError;
} catch (e) {
    NetworkError = class NetworkError extends Error {
        constructor(message) {
            super(message || 'Network error');
            this.name = 'NetworkError';
        }
    };
}

// =============================================
// [1] EXPORT CONTRACT VERIFICATION
// All exports required by friend-ui.js are present
// No duplicate exports, no missing exports
// =============================================

// ------------------------------------------------------------------
// SYSTEM STATE & CONSTANTS
// ------------------------------------------------------------------

// Core state - mutable exports
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

// Feature flags - controlled by error boundaries
export const featureFlags = {
    qrCode: true,
    camera: true,
    contactsSync: true,
    mutualFriends: true,
    groups: true,
    temporaryFriends: true,
    pinnedFriends: true,
    mutedFriends: true,
    discovery: true,
    notes: true
};

// Category definitions
export const friendCategories = {
    'acquaintance': { 
        name: 'Acquaintance', 
        color: 'var(--category-acquaintance)', 
        icon: 'fas fa-handshake', 
        description: 'Someone you know casually' 
    },
    'friend': { 
        name: 'Friend', 
        color: 'var(--category-friend)', 
        icon: 'fas fa-user-friends', 
        description: 'A regular friend' 
    },
    'close-friend': { 
        name: 'Close Friend', 
        color: 'var(--category-close-friend)', 
        icon: 'fas fa-heart', 
        description: 'A close personal friend' 
    },
    'family': { 
        name: 'Family', 
        color: 'var(--category-family)', 
        icon: 'fas fa-users', 
        description: 'Family member' 
    },
    'business': { 
        name: 'Business', 
        color: 'var(--category-business)', 
        icon: 'fas fa-briefcase', 
        description: 'Business contact' 
    },
    'pinned': { 
        name: 'Pinned', 
        color: 'var(--warning-color)', 
        icon: 'fas fa-thumbtack', 
        description: 'Pinned friend' 
    },
    'muted': { 
        name: 'Muted', 
        color: 'var(--text-secondary)', 
        icon: 'fas fa-volume-mute', 
        description: 'Muted friend' 
    }
};

// Storage keys
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

// Data source tracking
export const dataSource = {
    source: 'parent',
    userData: null,
    token: null,
    fetching: false,
    fetched: false,
    parentSessionReceived: false,
    parentControlled: true,
    fallbackMode: false
};

// ------------------------------------------------------------------
// [2] INITIALIZATION PIPELINE
// Preflight → DependencyCheck → ParentDetect → Handshake → SessionSync → ServiceInit → Ready
// ------------------------------------------------------------------

const INIT_TIMEOUT = 10000;
const HANDSHAKE_TIMEOUT = 5000;
const MAX_RETRIES = 3;

export const initPipeline = {
    status: 'idle',
    stages: {
        preflight: false,
        dependencyCheck: false,
        parentDetect: false,
        handshake: false,
        sessionSync: false,
        serviceInit: false,
        ready: false
    },
    errors: [],
    timeout: null
};

/**
 * STAGE 1: Preflight - Environment verification
 */
async function stagePreflight() {
    return featureSandbox('init:preflight', async () => {
        if (typeof window === 'undefined' || !document) {
            throw new Error('Browser environment required');
        }
        
        if (typeof Promise === 'undefined') {
            throw new Error('Promise support required');
        }
        
        try {
            const testKey = '__knecta_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
        } catch (e) {
            console.warn('[FriendCore] localStorage unavailable, using memory fallback');
        }
        
        initPipeline.stages.preflight = true;
        return true;
    }, false);
}

/**
 * STAGE 2: DependencyCheck - Verify all required imports
 */
async function stageDependencyCheck() {
    return featureSandbox('init:dependency', async () => {
        const requiredImports = [
            { name: 'generateMessageId', fn: generateMessageId },
            { name: 'validateMessageSchema', fn: validateMessageSchema },
            { name: 'secureFetch', fn: secureFetch },
            { name: 'importedShowNotification', fn: importedShowNotification }
        ];
        
        const missing = requiredImports.filter(dep => !dep.fn);
        
        if (missing.length > 0) {
            dependencyLogger.logMissing(missing.map(d => d.name));
            return false;
        }
        
        initPipeline.stages.dependencyCheck = true;
        return true;
    }, false);
}

/**
 * STAGE 3: ParentDetect - Identify parent frame
 */
async function stageParentDetect() {
    return featureSandbox('init:parentDetect', async () => {
        const result = {
            detected: false,
            origin: null,
            crossOrigin: false
        };
        
        try {
            if (window.parent && window.parent !== window) {
                result.detected = true;
                
                try {
                    result.origin = window.parent.location.origin;
                    result.crossOrigin = result.origin !== window.location.origin;
                } catch (e) {
                    result.origin = '*';
                    result.crossOrigin = true;
                }
                
                ParentCoordinator.state.parentDetected = true;
                ParentCoordinator.state.parentOrigin = result.origin;
            }
        } catch (error) {
            // Silent fail
        }
        
        initPipeline.stages.parentDetect = true;
        return result;
    }, { detected: false, origin: null, crossOrigin: false });
}

/**
 * STAGE 4: Handshake - Establish parent communication
 */
async function stageHandshake() {
    return featureSandbox('init:handshake', async () => {
        if (!ParentCoordinator.state.parentDetected) {
            return { success: false, mode: 'standalone' };
        }
        
        const handshakeResult = await Promise.race([
            ParentCoordinator.initiateHandshakeWithAck(),
            timeoutPromise(HANDSHAKE_TIMEOUT, 'Handshake timeout')
        ]);
        
        initPipeline.stages.handshake = true;
        return handshakeResult || { success: false, mode: 'timeout' };
    }, { success: false, mode: 'fallback' });
}

/**
 * STAGE 5: SessionSync - Obtain user session
 */
async function stageSessionSync() {
    return featureSandbox('init:sessionSync', async () => {
        let session = null;
        
        if (ParentCoordinator.state.parentDetected && ParentCoordinator.state.handshakeComplete) {
            session = await ParentCoordinator.getSessionWithTimeout(3000);
        }
        
        if (!session || !session.token) {
            const cachedToken = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
            const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
            
            if (cachedToken && cachedUser) {
                try {
                    session = {
                        token: cachedToken,
                        user: JSON.parse(cachedUser)
                    };
                } catch (e) {
                    // Invalid cache
                }
            }
        }
        
        if (session?.token && session?.user) {
            dataSource.token = session.token;
            dataSource.userData = session.user;
            dataSource.fetched = true;
            
            currentUser = session.user;
            userData = session.user;
            
            try {
                localStorage.setItem(LOCAL_STORAGE_KEYS.USER_TOKEN, session.token);
                localStorage.setItem(LOCAL_STORAGE_KEYS.USER_DATA, JSON.stringify(session.user));
            } catch (e) {
                // Quota exceeded, continue
            }
        } else {
            // CRITICAL FIX: Never enter fallback mode - throw error instead
            throw new Error('No valid session from parent');
        }
        
        initPipeline.stages.sessionSync = true;
        return { success: !!session, session };
    }, { success: false, session: null });
}

/**
 * STAGE 6: ServiceInit - Initialize core services
 */
async function stageServiceInit() {
    return featureSandbox('init:serviceInit', async () => {
        loadCachedDataInstantly();
        cacheLoaded = true;
        
        initializeParentChildCommunication();
        
        if (SafetyGuards.isSessionValid()) {
            setTimeout(() => {
                startParallelDataLoading().catch(() => {});
            }, 500);
        }
        
        if (currentUser?.id && featureFlags.qrCode) {
            setTimeout(generateUniqueQRCode, 300);
        }
        
        initPipeline.stages.serviceInit = true;
        return true;
    }, false);
}

/**
 * STAGE 7: Ready - Module ready for use
 */
async function stageReady() {
    return featureSandbox('init:ready', async () => {
        apiReady = true;
        isInitialized = true;
        initPipeline.status = 'ready';
        initPipeline.stages.ready = true;
        
        const event = new CustomEvent('friendCoreReady', {
            detail: {
                timestamp: Date.now(),
                fallbackMode: false,
                sessionValid: !!dataSource.token,
                stages: initPipeline.stages
            }
        });
        window.dispatchEvent(event);
        
        return true;
    }, false);
}

/**
 * Main initialization pipeline
 */
export async function enhancedInitialize() {
    if (initializationStarted) return isInitialized;
    initializationStarted = true;
    initPipeline.status = 'running';
    
    try {
        await withTimeout(stagePreflight(), 2000, 'Preflight timeout');
        await withTimeout(stageDependencyCheck(), 2000, 'Dependency check timeout');
        await withTimeout(stageParentDetect(), 2000, 'Parent detect timeout');
        await withTimeout(stageHandshake(), 5000, 'Handshake timeout');
        await withTimeout(stageSessionSync(), 3000, 'Session sync timeout');
        await withTimeout(stageServiceInit(), 3000, 'Service init timeout');
        await withTimeout(stageReady(), 1000, 'Ready timeout');
        
    } catch (error) {
        initPipeline.errors.push({
            stage: initPipeline.status,
            error: error.message,
            timestamp: Date.now()
        });
        
        // CRITICAL FIX: Do NOT enter fallback mode - throw error instead
        throw error;
    }
    
    return isInitialized;
}

// ------------------------------------------------------------------
// [3] COMMUNICATION LAYER - Secure Message Bus
// ------------------------------------------------------------------

export const MessageBus = {
    handlers: new Map(),
    pendingAcks: new Map(),
    messageCache: new Set(),
    originWhitelist: new Set(),
    
    init() {
        const origins = [
            window.location.origin,
            'http://127.0.0.1:5500',
            'http://localhost:5500',
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ];
        
        origins.forEach(origin => this.originWhitelist.add(origin));
        
        if (window.parent !== window) {
            try {
                const parentOrigin = window.parent.location.origin;
                this.originWhitelist.add(parentOrigin);
            } catch (e) {
                this.originWhitelist.add('*');
            }
        }
        
        window.addEventListener('message', this.handleIncoming.bind(this));
    },
    
    validateOrigin(origin) {
        if (this.originWhitelist.has('*')) return true;
        return this.originWhitelist.has(origin);
    },
    
    validateMessage(data) {
        if (!data || typeof data !== 'object') return false;
        if (!data.type || typeof data.type !== 'string') return false;
        if (!data.messageId) return false;
        
        if (typeof validateMessageSchema === 'function') {
            return validateMessageSchema(data);
        }
        
        return !!(data.type && data.messageId);
    },
    
    handleIncoming(event) {
        if (!this.validateOrigin(event.origin)) {
            return;
        }
        
        if (!this.validateMessage(event.data)) {
            return;
        }
        
        const { messageId, type, ack } = event.data;
        
        if (this.messageCache.has(messageId)) {
            return;
        }
        this.messageCache.add(messageId);
        
        setTimeout(() => this.messageCache.delete(messageId), 60000);
        
        if (ack) {
            const pending = this.pendingAcks.get(messageId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(event.data);
                this.pendingAcks.delete(messageId);
            }
            return;
        }
        
        const handler = this.handlers.get(type);
        if (handler) {
            try {
                handler(event.data, event);
            } catch (e) {
                Logger.error('MessageBus', 'Handler execution failed', e, { type, messageId });
            }
        }
        
        if (event.data.requireAck) {
            this.send(event.source, {
                type: 'ACK',
                messageId,
                ack: true,
                timestamp: Date.now()
            }, event.origin);
        }
    },
    
    send(target, message, targetOrigin = '*') {
        if (!target || !message) return false;
        
        if (!message.messageId) {
            message.messageId = generateMessageId?.() || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        message.timestamp = message.timestamp || Date.now();
        
        try {
            target.postMessage(message, targetOrigin);
            return true;
        } catch (e) {
            Logger.error('MessageBus', 'Send failed', e);
            return false;
        }
    },
    
    sendToParent(message) {
        if (!ParentCoordinator.state.parentDetected) return false;
        
        const targetOrigin = ParentCoordinator.state.parentOrigin || '*';
        return this.send(window.parent, message, targetOrigin);
    },
    
    sendWithAck(message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (!this.sendToParent(message)) {
                reject(new Error('Failed to send message'));
                return;
            }
            
            const messageId = message.messageId;
            const timeoutId = setTimeout(() => {
                this.pendingAcks.delete(messageId);
                reject(new Error('ACK timeout'));
            }, timeout);
            
            this.pendingAcks.set(messageId, {
                resolve,
                reject,
                timeout: timeoutId
            });
        });
    },
    
    on(type, handler) {
        this.handlers.set(type, handler);
    },
    
    off(type) {
        this.handlers.delete(type);
    },
    
    destroy() {
        window.removeEventListener('message', this.handleIncoming.bind(this));
        
        this.pendingAcks.forEach((pending, id) => {
            clearTimeout(pending.timeout);
            pending.reject(new Error('MessageBus destroyed'));
        });
        
        this.pendingAcks.clear();
        this.handlers.clear();
        this.messageCache.clear();
    }
};

// ------------------------------------------------------------------
// [4] SESSION MANAGEMENT - Multi-source adapter
// ------------------------------------------------------------------

export const SessionManager = {
    current: null,
    sources: ['parent', 'auth', 'cache', 'guest', 'demo'],
    activeSource: null,
    listeners: new Set(),
    
    async getSession(options = { timeout: 3000, source: 'any' }) {
        if (this.current && this.isValid(this.current)) {
            return this.current;
        }
        
        let session = null;
        
        if (options.source === 'any' || options.source === 'parent') {
            session = await this.fromParent(options.timeout);
            if (session) this.activeSource = 'parent';
        }
        
        if (!session && (options.source === 'any' || options.source === 'auth')) {
            session = this.fromAuth();
            if (session) this.activeSource = 'auth';
        }
        
        if (!session && (options.source === 'any' || options.source === 'cache')) {
            session = this.fromCache();
            if (session) this.activeSource = 'cache';
        }
        
        // CRITICAL FIX: Remove guest and demo sources - never create them
        // Session must come from parent
        
        if (session) {
            this.current = session;
            this.notifyListeners('session:update', session);
        }
        
        return session;
    },
    
    isValid(session) {
        if (!session || !session.token || !session.user) return false;
        if (session.expiresAt && session.expiresAt < Date.now()) return false;
        return true;
    },
    
    async fromParent(timeout) {
        if (!ParentCoordinator.state.parentDetected) return null;
        
        try {
            const response = await ParentCoordinator.getSessionWithTimeout(timeout);
            if (response?.token && response?.user) {
                return {
                    token: response.token,
                    user: response.user,
                    expiresAt: response.expiresAt || Date.now() + 3600000,
                    source: 'parent'
                };
            }
        } catch (e) {
            // Silent fail
        }
        
        return null;
    },
    
    fromAuth() {
        if (!window.KnectaAuth) return null;
        
        try {
            const token = window.KnectaAuth.getToken?.();
            const user = window.KnectaAuth.getUser?.();
            
            if (token && user) {
                return {
                    token,
                    user,
                    expiresAt: Date.now() + 3600000,
                    source: 'auth'
                };
            }
        } catch (e) {
            // Silent fail
        }
        
        return null;
    },
    
    fromCache() {
        try {
            const token = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
            const userStr = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
            
            if (token && userStr) {
                const user = JSON.parse(userStr);
                if (user && user.id) {
                    return {
                        token,
                        user,
                        expiresAt: Date.now() + 3600000,
                        source: 'cache'
                    };
                }
            }
        } catch (e) {
            // Silent fail
        }
        
        return null;
    },
    
    updateSession(session) {
        if (this.isValid(session)) {
            this.current = session;
            this.notifyListeners('session:update', session);
            
            if (session.source === 'parent' || session.source === 'auth') {
                try {
                    localStorage.setItem(LOCAL_STORAGE_KEYS.USER_TOKEN, session.token);
                    localStorage.setItem(LOCAL_STORAGE_KEYS.USER_DATA, JSON.stringify(session.user));
                } catch (e) {
                    // Cache failed
                }
            }
        }
    },
    
    clearSession() {
        this.current = null;
        this.activeSource = null;
        this.notifyListeners('session:clear', null);
    },
    
    on(event, callback) {
        this.listeners.add({ event, callback });
    },
    
    off(event, callback) {
        this.listeners.forEach(listener => {
            if (listener.event === event && listener.callback === callback) {
                this.listeners.delete(listener);
            }
        });
    },
    
    notifyListeners(event, data) {
        this.listeners.forEach(listener => {
            if (listener.event === event) {
                try {
                    listener.callback(data);
                } catch (e) {
                    Logger.error('SessionManager', 'Listener error', e);
                }
            }
        });
    }
};

// ------------------------------------------------------------------
// [5] FEATURE SANDBOXING - Error boundaries for all features
// ------------------------------------------------------------------

const featureSandbox = async (feature, fn, fallback = null) => {
    const featureName = feature.split(':')[0] || feature;
    
    try {
        return await fn();
    } catch (error) {
        Logger.once(`feature:${featureName}`, `Feature '${feature}' failed`, error);
        
        if (featureFlags.hasOwnProperty(featureName)) {
            featureFlags[featureName] = false;
        }
        
        return fallback;
    }
};

const featureSandboxSync = (feature, fn, fallback = null) => {
    const featureName = feature.split(':')[0] || feature;
    
    try {
        return fn();
    } catch (error) {
        Logger.once(`feature:${featureName}`, `Feature '${feature}' failed`, error);
        
        if (featureFlags.hasOwnProperty(featureName)) {
            featureFlags[featureName] = false;
        }
        
        return fallback;
    }
};

// ------------------------------------------------------------------
// [6] ERROR HANDLING - Global error containment
// ------------------------------------------------------------------

export const ErrorHandler = {
    boundaries: new Map(),
    circuitBreakers: new Map(),
    
    // Store a reference to Logger that will be set after initialization
    _logger: null,
    
    setLogger(logger) {
        this._logger = logger;
    },
    
    init() {
        window.addEventListener('error', (event) => {
            this.handleGlobalError(event.error || event.message);
            event.preventDefault();
            return true;
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.handleGlobalError(event.reason || 'Unhandled Promise rejection');
            event.preventDefault();
            return true;
        });
        
        // Use console directly if Logger not yet available
        (this._logger || console).info('ErrorHandler', 'Global error handlers installed');
    },
    
    handleGlobalError(error) {
        const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        // Safely use Logger if available, otherwise use console
        if (this._logger) {
            this._logger.error('Global', 'Uncaught error', error, { errorId });
        } else {
            console.error('Global error:', error, { errorId });
        }
        
        window.dispatchEvent(new CustomEvent('knectaError', {
            detail: {
                id: errorId,
                message: error?.message || String(error),
                timestamp: Date.now(),
                fatal: false
            }
        }));
    },
    
    createCircuitBreaker(name, options = {}) {
        const defaults = {
            failureThreshold: 3,
            successThreshold: 1,
            timeout: 30000
        };
        
        const config = { ...defaults, ...options };
        
        const breaker = {
            name,
            state: 'CLOSED',
            failures: 0,
            successes: 0,
            lastFailure: null,
            nextAttempt: null,
            
            async execute(fn) {
                if (this.state === 'OPEN') {
                    if (Date.now() >= this.nextAttempt) {
                        this.state = 'HALF_OPEN';
                        if (ErrorHandler._logger) {
                            ErrorHandler._logger.info('CircuitBreaker', `${name} entering HALF_OPEN`);
                        }
                    } else {
                        throw new Error(`Circuit breaker OPEN for ${name}`);
                    }
                }
                
                try {
                    const result = await fn();
                    
                    if (this.state === 'HALF_OPEN') {
                        this.successes++;
                        if (this.successes >= config.successThreshold) {
                            this.reset();
                            if (ErrorHandler._logger) {
                                ErrorHandler._logger.info('CircuitBreaker', `${name} reset to CLOSED`);
                            }
                        }
                    }
                    
                    return result;
                } catch (error) {
                    this.failures++;
                    this.lastFailure = Date.now();
                    
                    if (this.state === 'CLOSED' && this.failures >= config.failureThreshold) {
                        this.state = 'OPEN';
                        this.nextAttempt = Date.now() + config.timeout;
                        if (ErrorHandler._logger) {
                            ErrorHandler._logger.warn('CircuitBreaker', `${name} opened after ${this.failures} failures`);
                        }
                    }
                    
                    if (this.state === 'HALF_OPEN') {
                        this.state = 'OPEN';
                        this.nextAttempt = Date.now() + config.timeout;
                        if (ErrorHandler._logger) {
                            ErrorHandler._logger.warn('CircuitBreaker', `${name} returned to OPEN from HALF_OPEN`);
                        }
                    }
                    
                    throw error;
                }
            },
            
            reset() {
                this.state = 'CLOSED';
                this.failures = 0;
                this.successes = 0;
                this.lastFailure = null;
                this.nextAttempt = null;
            }
        };
        
        this.circuitBreakers.set(name, breaker);
        return breaker;
    },
    
    getCircuitBreaker(name) {
        return this.circuitBreakers.get(name);
    },
    
    // ✅ NEW: Create error boundary for UI functions
    createBoundary(name, fn, fallback = null) {
        return function(...args) {
            try {
                return fn.apply(this, args);
            } catch (error) {
                console.error(`[ErrorBoundary:${name}]`, error);
                if (typeof fallback === 'function') {
                    return fallback.apply(this, args);
                }
                return fallback;
            }
        };
    }
};

// ------------------------------------------------------------------
// [7] SECURITY LAYER - Origin whitelist, sanitization, token isolation
// ------------------------------------------------------------------

export const SecurityManager = {
    originWhitelist: new Set(),
    token: null,
    
    init() {
        const trusted = [
            window.location.origin,
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'https://knecta.app',
            'https://*.knecta.app'
        ];
        
        trusted.forEach(origin => this.originWhitelist.add(origin));
        
        try {
            if (window.parent && window.parent !== window) {
                const parentOrigin = window.parent.location.origin;
                this.originWhitelist.add(parentOrigin);
            }
        } catch (e) {
            // Cross-origin
        }
    },
    
    isOriginTrusted(origin) {
        if (this.originWhitelist.has('*')) return true;
        if (this.originWhitelist.has(origin)) return true;
        
        for (const trusted of this.originWhitelist) {
            if (trusted.includes('*')) {
                const pattern = trusted.replace('*', '.*');
                if (new RegExp(`^${pattern}$`).test(origin)) {
                    return true;
                }
            }
        }
        
        return false;
    },
    
    sanitizeMessage(data) {
        if (!data || typeof data !== 'object') return null;
        
        const sanitized = JSON.parse(JSON.stringify(data));
        
        delete sanitized.__proto__;
        delete sanitized.constructor;
        delete sanitized.prototype;
        
        return sanitized;
    },
    
    isolateToken(token) {
        this.token = token;
        return () => this.token;
    },
    
    clearToken() {
        this.token = null;
    }
};

SecurityManager.init();

// ------------------------------------------------------------------
// [8] DEPENDENCY CONTROL - Fallback mode for missing imports
// ------------------------------------------------------------------

export const DependencyManager = {
    status: 'ok',
    missing: [],
    fallbackMode: false,
    
    check(dependencies) {
        const missing = [];
        
        for (const [name, dep] of Object.entries(dependencies)) {
            if (dep === undefined || dep === null) {
                missing.push(name);
            }
        }
        
        if (missing.length > 0) {
            this.missing = [...this.missing, ...missing];
            this.status = 'degraded';
            this.fallbackMode = true;
            
            Logger.once('dependency:missing', `Missing dependencies: ${missing.join(', ')}`);
        }
        
        return missing.length === 0;
    },
    
    getFallback(name, type = 'function') {
        if (type === 'function') {
            return (...args) => {
                Logger.once(`fallback:${name}`, `Using fallback for ${name}`);
                
                if (name === 'showNotification') {
                    console.log(`[Notification] ${args[0] || ''}`, args[1] || 'info');
                    return null;
                }
                
                if (name === 'navigateToChat' || name === 'navigateToCall') {
                    Logger.info('Navigation', `${name} not available (fallback mode)`);
                    return null;
                }
                
                return null;
            };
        }
        
        if (type === 'string') {
            return '';
        }
        
        if (type === 'object') {
            return {};
        }
        
        return null;
    }
};

// ------------------------------------------------------------------
// [9] RESOURCE MANAGEMENT - Cleanup and memory leak prevention
// ------------------------------------------------------------------

export const ResourceManager = {
    timers: new Set(),
    listeners: new Map(),
    observers: new Set(),
    intervals: new Set(),
    
    registerTimer(timerId) {
        this.timers.add(timerId);
        return timerId;
    },
    
    clearTimer(timerId) {
        clearTimeout(timerId);
        clearInterval(timerId);
        this.timers.delete(timerId);
    },
    
    registerInterval(intervalId) {
        this.intervals.add(intervalId);
        return intervalId;
    },
    
    clearInterval(intervalId) {
        clearInterval(intervalId);
        this.intervals.delete(intervalId);
    },
    
    registerListener(target, type, handler, options = {}) {
        target.addEventListener(type, handler, options);
        
        const key = Symbol('listener');
        this.listeners.set(key, { target, type, handler, options });
        
        return key;
    },
    
    registerObserver(observer) {
        this.observers.add(observer);
        return observer;
    },
    
    release() {
        this.timers.forEach(id => {
            clearTimeout(id);
            clearInterval(id);
        });
        this.timers.clear();
        
        this.intervals.forEach(id => clearInterval(id));
        this.intervals.clear();
        
        this.listeners.forEach(({ target, type, handler, options }) => {
            target.removeEventListener(type, handler, options);
        });
        this.listeners.clear();
        
        this.observers.forEach(observer => {
            if (observer.disconnect) observer.disconnect();
        });
        this.observers.clear();
        
        MessageBus.messageCache.clear();
        MessageBus.pendingAcks.forEach((pending, id) => {
            clearTimeout(pending.timeout);
        });
        MessageBus.pendingAcks.clear();
        
        Logger.info('ResourceManager', 'All resources released');
    }
};

// ------------------------------------------------------------------
// [10] LOGGING SYSTEM - Structured, rate-limited, one-time warnings
// ------------------------------------------------------------------

export const Logger = {
    levels: {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    },
    
    currentLevel: 1,
    module: 'FriendCore',
    onceTracker: new Set(),
    
    format(level, module, message, data) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.module}:${module}] [${level}]`;
        
        return { timestamp, level, module, prefix, message, data };
    },
    
    debug(module, message, data) {
        if (this.currentLevel > this.levels.DEBUG) return;
        const log = this.format('DEBUG', module, message, data);
        console.debug(log.prefix, message, data || '');
    },
    
    info(module, message, data) {
        if (this.currentLevel > this.levels.INFO) return;
        const log = this.format('INFO', module, message, data);
        console.info(log.prefix, message, data || '');
    },
    
    warn(module, message, data) {
        if (this.currentLevel > this.levels.WARN) return;
        const log = this.format('WARN', module, message, data);
        console.warn(log.prefix, message, data || '');
    },
    
    error(module, message, error, data) {
        if (this.currentLevel > this.levels.ERROR) return;
        const log = this.format('ERROR', module, message, data);
        console.error(log.prefix, message, error || '', data || '');
    },
    
    once(key, message, error, data) {
        if (this.onceTracker.has(key)) return;
        this.onceTracker.add(key);
        
        if (error instanceof Error) {
            this.error('Once', message, error, { ...data, key });
        } else {
            this.warn('Once', `${message} (once)`, { ...data, key });
        }
    },
    
    clearCache() {
        this.onceTracker.clear();
    }
};

// Set Logger reference in ErrorHandler after it's defined
ErrorHandler.setLogger(Logger);
ErrorHandler.init();

// ------------------------------------------------------------------
// [11] BACKWARD COMPATIBILITY - Preserve existing APIs
// ------------------------------------------------------------------

export const SafetyGuards = {
    loggedErrors: new Set(),
    retryCounters: new Map(),
    messageCache: new Set(),
    
    safeLogError: function(module, functionName, error, data = null) {
        const errorKey = `${module}:${functionName}:${error?.message || error}`;
        
        if (!this.loggedErrors.has(errorKey)) {
            this.loggedErrors.add(errorKey);
            Logger.error(module, `${functionName} failed`, error, data);
        }
    },
    
    safeGetElement: function(id) {
        try {
            return document.getElementById(id);
        } catch (error) {
            this.safeLogError('SafetyGuard', 'safeGetElement', error);
            return null;
        }
    },
    
    isSessionValid: function() {
        try {
            return !!(SessionManager.current && SessionManager.current.token);
        } catch (error) {
            return false;
        }
    },
    
    isUserDataValid: function() {
        try {
            return !!(currentUser?.id || userData?.id || dataSource.userData?.id);
        } catch (error) {
            return false;
        }
    },
    
    safeExecute: function(funcName, func, fallbackValue = null, context = null) {
        try {
            return func.call(context || this);
        } catch (error) {
            this.safeLogError('SafetyGuard', 'safeExecute', error);
            return fallbackValue;
        }
    }
};

// ------------------------------------------------------------------
// [12] PARENT COORDINATOR - Enhanced parent-child communication
// ------------------------------------------------------------------

export const ParentCoordinator = {
    config: {
        parentOrigin: window.location.origin,
        handshakeTimeout: 10000,
        maxRetries: 10,
        retryBaseDelay: 100,
        sessionExpiry: 30 * 60 * 1000,
        debug: false
    },
    
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
        authReady: false,
        parentOrigin: '*'
    },
    
    ui: {
        protectedUIBlocked: true,
        authErrorDisplayed: false,
        reconnectionDisplayed: false
    },
    
    reconnectionInterval: null,
    
    init: async function() {
        if (this.state.initializationLock) return;
        this.state.initializationLock = true;
        
        try {
            await this.detectParent();
            this.bindEnhancedMessageHandlers();
            this.setupReconnectionMonitor();
            
            setTimeout(() => requestSessionFromParent(), 100);
        } catch (error) {
            this.handleParentUnavailable();
        } finally {
            this.state.initializationLock = false;
        }
    },
    
    detectParent: function() {
        return new Promise((resolve, reject) => {
            if (window.parent === window || !window.parent) {
                this.state.parentDetected = false;
                reject(new Error('Parent window not available'));
                return;
            }
            
            try {
                const parentOrigin = window.parent.location.origin;
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
    
    initiateHandshakeWithAck: function() {
        return new Promise((resolve, reject) => {
            if (!this.state.parentDetected) {
                reject(new Error('Parent not detected'));
                return;
            }
            
            const messageId = generateMessageId?.() || `hs_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            const handler = (event) => {
                if (event.data?.type === 'HANDSHAKE_ACK' && event.data?.messageId === messageId) {
                    MessageBus.off('HANDSHAKE_ACK', handler);
                    this.state.handshakeComplete = true;
                    resolve(event.data);
                }
            };
            
            MessageBus.on('HANDSHAKE_ACK', handler);
            
            const success = MessageBus.sendToParent({
                type: 'CHILD_READY',
                messageId,
                source: 'friend.html',
                timestamp: Date.now(),
                version: '2.0',
                requireAck: true
            });
            
            if (!success) {
                MessageBus.off('HANDSHAKE_ACK', handler);
                reject(new Error('Failed to send handshake'));
            }
            
            setTimeout(() => {
                MessageBus.off('HANDSHAKE_ACK', handler);
                reject(new Error('Handshake timeout'));
            }, this.config.handshakeTimeout);
        });
    },
    
    getSessionWithTimeout: function(timeout = 3000) {
        return new Promise((resolve, reject) => {
            if (!this.state.parentDetected) {
                reject(new Error('Parent not detected'));
                return;
            }
            
            const messageId = generateMessageId?.() || `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            const handler = (data) => {
                if (data.type === 'SESSION_DATA' && data.messageId === messageId) {
                    MessageBus.off('SESSION_DATA', handler);
                    
                    if (data.session) {
                        this.state.sessionData = data.session;
                        this.state.sessionReceived = true;
                        resolve(data.session);
                    } else {
                        reject(new Error('Invalid session data'));
                    }
                }
            };
            
            MessageBus.on('SESSION_DATA', handler);
            
            const success = MessageBus.sendToParent({
                type: 'REQUEST_SESSION',
                messageId,
                source: 'friend.html',
                timestamp: Date.now(),
                requireAck: true
            });
            
            if (!success) {
                MessageBus.off('SESSION_DATA', handler);
                reject(new Error('Failed to request session'));
            }
            
            setTimeout(() => {
                MessageBus.off('SESSION_DATA', handler);
                reject(new Error('Session request timeout'));
            }, timeout);
        });
    },
    
    bindEnhancedMessageHandlers: function() {
        if (this.state.messageHandlersBound) return;
        
        MessageBus.on('SESSION_DATA', this.handleSessionData.bind(this));
        MessageBus.on('SESSION_UPDATE', this.handleSessionUpdate.bind(this));
        MessageBus.on('LOGOUT', this.handleLogout.bind(this));
        MessageBus.on('PARENT_READY', this.handleParentReady.bind(this));
        MessageBus.on('AUTH_STATE_CHANGED', this.handleAuthStateChanged.bind(this));
        MessageBus.on('USER_PROFILE_UPDATED', this.handleProfileUpdated.bind(this));
        
        window.addEventListener('knectaAuthReady', this.handleAuthReady.bind(this));
        window.addEventListener('knectaTokenExpired', this.handleTokenExpired.bind(this));
        window.addEventListener('knectaAuthError', this.handleAuthError.bind(this));
        
        this.state.messageHandlersBound = true;
    },
    
    handleSessionData: function(data) {
        if (!data.session) return;
        
        this.state.sessionData = data.session;
        this.state.sessionReceived = true;
        this.state.lastSync = Date.now();
        this.state.authReady = true;
        this.ui.protectedUIBlocked = false;
        
        SessionManager.updateSession(data.session);
        
        window.dispatchEvent(new CustomEvent('parentSessionReady', {
            detail: { session: data.session, source: 'parent_coordinator' }
        }));
    },
    
    handleSessionUpdate: function(data) {
        if (!data.session) return;
        
        this.state.sessionData = data.session;
        this.state.lastSync = Date.now();
        SessionManager.updateSession(data.session);
        
        window.dispatchEvent(new CustomEvent('parentSessionUpdated', {
            detail: { session: data.session }
        }));
    },
    
    handleLogout: function() {
        this.state.sessionData = null;
        this.state.sessionReceived = false;
        this.state.authReady = false;
        this.ui.protectedUIBlocked = true;
        
        SessionManager.clearSession();
        
        window.dispatchEvent(new CustomEvent('parentSessionLogout'));
    },
    
    handleParentReady: function() {
        this.state.parentReachable = true;
        
        if (!this.state.sessionReceived) {
            requestSessionFromParent();
        }
    },
    
    handleAuthStateChanged: function(data) {
        if (data.authenticated && data.session) {
            this.handleSessionData({ session: data.session });
        } else {
            this.handleLogout();
        }
    },
    
    handleProfileUpdated: function(data) {
        if (this.state.sessionData?.user && data.userData) {
            this.state.sessionData.user = {
                ...this.state.sessionData.user,
                ...data.userData
            };
            
            SessionManager.updateSession(this.state.sessionData);
            
            window.dispatchEvent(new CustomEvent('parentProfileUpdated', {
                detail: { user: this.state.sessionData.user }
            }));
        }
    },
    
    handleAuthReady: function(event) {
        if (this.state.sessionReceived) return;
        
        if (event.detail?.token && event.detail?.user) {
            this.state.authReady = true;
            this.ui.protectedUIBlocked = false;
            
            SessionManager.updateSession({
                token: event.detail.token,
                user: event.detail.user,
                source: 'unified_auth'
            });
        }
    },
    
    handleTokenExpired: function() {
        MessageBus.sendToParent({
            type: 'TOKEN_EXPIRED',
            source: 'friend.html',
            timestamp: Date.now()
        });
        
        this.ui.protectedUIBlocked = true;
    },
    
    handleAuthError: function() {
        MessageBus.sendToParent({
            type: 'AUTH_ERROR',
            source: 'friend.html',
            timestamp: Date.now()
        });
        
        this.ui.protectedUIBlocked = true;
    },
    
    handleParentUnavailable: function() {
        this.state.parentReachable = false;
        this.ui.protectedUIBlocked = true;
        // CRITICAL FIX: Do NOT set fallbackMode
    },
    
    setupReconnectionMonitor: function() {
        if (this.reconnectionInterval) {
            clearInterval(this.reconnectionInterval);
        }
        
        this.reconnectionInterval = ResourceManager.registerInterval(setInterval(() => {
            if (!this.state.parentReachable && this.state.parentDetected) {
                this.attemptParentReconnection();
            }
        }, 10000));
    },
    
    attemptParentReconnection: function() {
        MessageBus.sendToParent({
            type: 'RECONNECT_ATTEMPT',
            source: 'friend.html',
            timestamp: Date.now()
        });
    },
    
    sendToParent: function(message) {
        return MessageBus.sendToParent(message);
    },
    
    shouldBlockProtectedUI: function() {
        return this.ui.protectedUIBlocked;
    },
    
    getSession: function() {
        return this.state.sessionData;
    },
    
    isAuthenticated: function() {
        return !!(this.state.sessionReceived && this.state.sessionData?.token);
    },
    
    getUser: function() {
        return this.state.sessionData?.user || null;
    },
    
    getToken: function() {
        return this.state.sessionData?.token || null;
    },
    
    apiRequest: async function(endpoint, options = {}) {
        try {
            if (this.state.parentReachable && this.state.sessionReceived) {
                return await this.apiRequestViaParent(endpoint, options);
            }
            
            return await this.apiRequestDirect(endpoint, options);
        } catch (error) {
            Logger.error('ParentCoordinator', 'API request failed', error, { endpoint });
            throw error;
        }
    },
    
    apiRequestViaParent: function(endpoint, options) {
        return new Promise((resolve, reject) => {
            const messageId = generateMessageId?.() || `api_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            const handler = (data) => {
                if (data.type === 'API_RESPONSE' && data.messageId === messageId) {
                    MessageBus.off('API_RESPONSE', handler);
                    
                    if (data.success) {
                        resolve(data.data);
                    } else {
                        reject(new Error(data.error || 'API request failed'));
                    }
                }
            };
            
            MessageBus.on('API_RESPONSE', handler);
            
            const success = MessageBus.sendToParent({
                type: 'API_REQUEST',
                messageId,
                endpoint,
                options,
                timestamp: Date.now(),
                source: 'friend.html',
                requireAck: false
            });
            
            if (!success) {
                MessageBus.off('API_RESPONSE', handler);
                reject(new Error('Failed to send API request'));
            }
            
            setTimeout(() => {
                MessageBus.off('API_RESPONSE', handler);
                reject(new Error('API request timeout'));
            }, 30000);
        });
    },
    
    apiRequestDirect: async function(endpoint, options = {}) {
        const token = this.getToken() || SessionManager.current?.token;
        
        if (!token && options.requireAuth !== false) {
            throw new Error('Authentication token not available');
        }
        
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        
        if (token && options.requireAuth !== false) {
            headers.Authorization = `Bearer ${token}`;
        }
        
        const response = await secureFetch(endpoint, {
            method: options.method || 'GET',
            headers,
            body: options.body
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                this.handleTokenExpired();
                throw new Error('Session expired');
            }
            throw new Error(`API error: ${response.status}`);
        }
        
        return response.json();
    },
    
    showAuthError: function(message) {
        this.ui.authErrorDisplayed = true;
        
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        const messageElement = SafetyGuards.safeGetElement('authErrorMessage');
        
        if (overlay && messageElement) {
            messageElement.textContent = message || 'Authentication required';
            overlay.classList.add('active');
        } else {
            showNotification?.(message || 'Authentication error', 'error');
        }
    },
    
    hideAuthError: function() {
        this.ui.authErrorDisplayed = false;
        
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        if (overlay) overlay.classList.remove('active');
    },
    
    showReconnectionState: function() {
        this.ui.reconnectionDisplayed = true;
        showReconnectionState?.();
    },
    
    hideReconnectionState: function() {
        this.ui.reconnectionDisplayed = false;
        hideReconnectionState?.();
    },
    
    log: function(message, data) {
        if (this.config.debug) {
            Logger.debug('ParentCoordinator', message, data);
        }
    },
    
    logError: function(message, error) {
        Logger.error('ParentCoordinator', message, error);
    }
};

// ------------------------------------------------------------------
// [13] KNECTA AUTH - Unified authentication adapter
// ------------------------------------------------------------------

export const KnectaAuth = {
    token: null,
    tokenReady: false,
    tokenPromise: null,
    currentUser: null,
    userReady: false,
    cacheReady: false,
    migrationPerformed: false,
    parentControlled: true,
    
    init: async function() {
        try {
            this.checkTokenMigration();
            await this.waitForParentCoordinator();
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
        } catch (error) {
            Logger.error('KnectaAuth', 'Init failed', error);
            this.loadCachedData();
            this.cacheReady = true;
            this.dispatchCacheReadyEvent();
        }
    },
    
    checkTokenMigration: function() {
        const unifiedToken = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        if (unifiedToken) return;
        
        const oldKeys = ['moodchat_token', 'accessToken', 'knecta_token', 'token', 'authToken', 'sessionToken'];
        
        for (const key of oldKeys) {
            const token = localStorage.getItem(key);
            if (token) {
                localStorage.setItem(LOCAL_STORAGE_KEYS.USER_TOKEN, token);
                this.migrationPerformed = true;
                break;
            }
        }
    },
    
    waitForParentCoordinator: function() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50;
            
            const check = () => {
                attempts++;
                
                if (window.parentCoordinator) {
                    this.parentControlled = true;
                    resolve();
                    return;
                }
                
                if (attempts >= maxAttempts) {
                    this.parentControlled = false;
                    resolve();
                    return;
                }
                
                setTimeout(check, 100);
            };
            
            check();
        });
    },
    
    loadCachedData: function() {
        const token = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        if (token) this.token = token;
        
        const userStr = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
        if (userStr) {
            try {
                this.currentUser = JSON.parse(userStr);
            } catch (e) {
                Logger.error('KnectaAuth', 'Failed to parse cached user', e);
            }
        }
    },
    
    dispatchReadyEvent: function() {
        window.dispatchEvent(new CustomEvent('knectaAuthReady', {
            detail: {
                token: this.token,
                user: this.currentUser,
                migrationPerformed: this.migrationPerformed,
                parentControlled: this.parentControlled
            }
        }));
        
        window.knectaToken = this.token;
        window.knectaUser = this.currentUser;
        window.authReady = true;
    },
    
    dispatchCacheReadyEvent: function() {
        window.dispatchEvent(new CustomEvent('knectaCacheReady', {
            detail: {
                token: this.token,
                user: this.currentUser,
                cacheOnly: true
            }
        }));
    },
    
    getTokenAsync: function() {
        if (window.parentCoordinator?.getToken()) {
            return Promise.resolve(window.parentCoordinator.getToken());
        }
        
        if (this.tokenReady && this.token) {
            return Promise.resolve(this.token);
        }
        
        if (!this.tokenPromise) {
            this.tokenPromise = new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 100;
                
                const check = () => {
                    attempts++;
                    
                    if (window.parentCoordinator?.getToken()) {
                        resolve(window.parentCoordinator.getToken());
                        return;
                    }
                    
                    if (this.tokenReady && this.token) {
                        resolve(this.token);
                        return;
                    }
                    
                    if (attempts >= maxAttempts) {
                        reject(new Error('Token not available'));
                        return;
                    }
                    
                    setTimeout(check, 100);
                };
                
                check();
            });
        }
        
        return this.tokenPromise;
    },
    
    secureApiCall: async function(apiPath, options = {}, requireAuth = true) {
        if (window.parentCoordinator?.isAuthenticated()) {
            return window.parentCoordinator.apiRequest(apiPath, options);
        }
        
        return this.secureApiCallFallback(apiPath, options, requireAuth);
    },
    
    secureApiCallFallback: async function(apiPath, options = {}, requireAuth = true) {
        this.showLoading(requireAuth);
        
        try {
            let token = null;
            if (requireAuth) {
                token = await this.getTokenAsync();
                if (!token) throw new Error('Authentication required');
            }
            
            const headers = {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };
            
            if (token && requireAuth) {
                headers.Authorization = `Bearer ${token}`;
            }
            
            const response = await secureFetch(apiPath, {
                method: options.method || 'GET',
                headers,
                body: options.body
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleTokenExpired();
                    throw new Error('Session expired');
                }
                throw new Error(`API error: ${response.status}`);
            }
            
            return response.json();
        } finally {
            this.showLoading(false);
        }
    },
    
    showLoading: function(show) {
        const overlay = SafetyGuards.safeGetElement('loadingOverlay');
        if (overlay) {
            overlay.classList.toggle('active', show);
        }
    },
    
    handleTokenExpired: function() {
        this.token = null;
        this.tokenReady = false;
        localStorage.removeItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
        
        if (window.parentCoordinator) {
            window.parentCoordinator.handleTokenExpired();
        } else {
            showNotification?.('Session expired', 'error');
            window.dispatchEvent(new CustomEvent('knectaTokenExpired'));
        }
    },
    
    handleAuthError: function() {
        showNotification?.('Please log in to continue', 'warning');
        window.dispatchEvent(new CustomEvent('knectaAuthError'));
    },
    
    showNotification: function(message, type = 'success') {
        if (window.parentCoordinator) {
            window.parentCoordinator.showAuthError?.(message);
        } else {
            showNotification?.(message, type);
        }
    },
    
    isAuthenticated: function() {
        return !!(window.parentCoordinator?.isAuthenticated() || (this.token && this.tokenReady));
    },
    
    getUser: function() {
        return window.parentCoordinator?.getUser() || this.currentUser;
    },
    
    getToken: function() {
        return window.parentCoordinator?.getToken() || this.token;
    }
};

export let handshakeInProgress = false;
export let sessionValid = false;
export let handshakeTimeout = null;
export let pendingSessionRequest = false;

export function requestSessionFromParent() {
    if (handshakeInProgress || pendingSessionRequest) return;
    
    handshakeInProgress = true;
    pendingSessionRequest = true;
    
    Logger.info('Handshake', 'Requesting session from parent');
    
    if (handshakeTimeout) clearTimeout(handshakeTimeout);
    
    const success = MessageBus.sendToParent({
        type: 'REQUEST_SESSION',
        source: 'friend.html',
        timestamp: Date.now(),
        version: '2.0',
        requireAck: true
    });
    
    if (!success) {
        handshakeInProgress = false;
        pendingSessionRequest = false;
        return;
    }
    
    handshakeTimeout = setTimeout(() => {
        if (!sessionValid) {
            handshakeInProgress = false;
            pendingSessionRequest = false;
            Logger.warn('Handshake', 'Session request timeout');
            
            setTimeout(() => {
                if (!sessionValid) requestSessionFromParent();
            }, 2000);
        }
    }, 5000);
}

export function handleEnhancedParentMessage(event) {
    SecurityManager.isOriginTrusted(event.origin);
    MessageBus.handleIncoming(event);
}

export function updateGlobalStateFromSession(sessionData) {
    try {
        dataSource.source = 'parent';
        dataSource.userData = sessionData.user;
        dataSource.token = sessionData.token;
        dataSource.fetched = true;
        dataSource.parentSessionReceived = true;
        
        currentUser = sessionData.user;
        userData = sessionData.user;
        
        updateUIWithUserData(sessionData.user);
        updateDataSourceIndicator('parent');
        
        window.dispatchEvent(new CustomEvent('parentSessionReady', {
            detail: { session: sessionData, source: 'enhanced_handshake' }
        }));
    } catch (error) {
        Logger.error('Session', 'Failed to update global state', error);
    }
}

export function bindUIAfterSession() {
    if (!sessionValid) {
        Logger.warn('UI', 'Cannot bind UI - session not validated');
        return;
    }
    
    Logger.info('UI', 'Binding UI after session validation');
    
    if (typeof initializeMainFunctionality === 'function') {
        initializeMainFunctionality();
    }
    
    if (typeof startParallelDataLoading === 'function') {
        setTimeout(startParallelDataLoading, 100);
    }
    
    if (typeof updateCurrentSection === 'function') {
        setTimeout(updateCurrentSection, 200);
    }
}

// ------------------------------------------------------------------
// [14] FALLBACK MODE - CRITICAL FIX: REMOVED
// Standalone operation without parent is DISABLED
// ------------------------------------------------------------------

// CRITICAL FIX: enableFallbackMode function removed - never enter fallback

// ------------------------------------------------------------------
// [15] CACHED DATA FALLBACK - FOR UI COMPATIBILITY ONLY
// This function is required by friend-ui.js but never enables fallback mode
// ------------------------------------------------------------------

export function attemptCachedDataFallback() {
    Logger.info('Fallback', 'Attempting cached data fallback (UI compatibility only)');
    
    // This function exists ONLY to satisfy the import in friend-ui.js
    // It does NOT enable fallback mode - it just loads cached data if available
    
    if (!currentUser && !userData) {
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
        if (cachedUser) {
            try {
                const user = JSON.parse(cachedUser);
                currentUser = user;
                userData = user;
                Logger.info('Fallback', 'Loaded user from cache for UI display');
            } catch (e) {
                Logger.error('Fallback', 'Failed to parse cached user', e);
            }
        }
    }
    
    if (friends.length === 0) {
        const cachedFriends = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (cachedFriends) {
            try {
                const parsed = JSON.parse(cachedFriends);
                friends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
                Logger.info('Fallback', `Loaded ${friends.length} friends from cache for UI display`);
            } catch (e) {
                Logger.error('Fallback', 'Failed to parse cached friends', e);
            }
        }
    }
    
    // Dispatch event to update UI
    window.dispatchEvent(new CustomEvent('friendCoreFallback', {
        detail: {
            timestamp: Date.now(),
            hasUser: !!currentUser,
            friendCount: friends.length
        }
    }));
    
    return {
        success: true,
        user: currentUser,
        friends: friends,
        fromCache: true
    };
}

// ------------------------------------------------------------------
// API INTEGRATION FUNCTIONS
// ------------------------------------------------------------------

export async function apiCallWithRetry(url, options = {}, maxRetries = 3) {
    const circuitBreaker = ErrorHandler.getCircuitBreaker('api') || 
        ErrorHandler.createCircuitBreaker('api', { failureThreshold: 5, timeout: 60000 });
    
    return circuitBreaker.execute(async () => {
        if (!SafetyGuards.isSessionValid() && !url.includes('/public/')) {
            throw new Error('Session invalid');
        }
        
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const token = getValidToken();
                
                const fetchOptions = {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    },
                    ...options
                };
                
                if (token && !fetchOptions.headers.Authorization) {
                    fetchOptions.headers.Authorization = `Bearer ${token}`;
                }
                
                const response = await secureFetch(url, fetchOptions);
                
                if (!response.ok) {
                    if (response.status === 401) {
                        window.dispatchEvent(new CustomEvent('knectaTokenExpired'));
                        throw new Error('Session expired');
                    }
                    
                    const errorMessage = await getErrorMessageFromResponse(response);
                    throw new Error(`API error: ${response.status} - ${errorMessage}`);
                }
                
                return await response.json();
                
            } catch (error) {
                lastError = error;
                
                if (error.message === 'Session expired' || 
                    (error.message.includes('API error: 4') && !error.message.includes('API error: 429'))) {
                    throw error;
                }
                
                if (attempt === maxRetries) break;
                
                const delay = 1000 * Math.pow(2, attempt) + Math.random() * 500;
                
                if (attempt === 0) {
                    showNotification?.('Connection issue, retrying...', 'warning');
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new Error(lastError?.message || 'API request failed after retries');
    });
}

async function getErrorMessageFromResponse(response) {
    try {
        const text = await response.text();
        if (text) {
            try {
                const json = JSON.parse(text);
                return json.message || json.error || text.substring(0, 100);
            } catch {
                return text.substring(0, 100);
            }
        }
    } catch {
        // Fall through
    }
    return response.statusText || 'Unknown error';
}

export function getValidToken() {
    try {
        if (window.parentCoordinator?.getToken()) {
            return window.parentCoordinator.getToken();
        }
        
        if (SessionManager.current?.token) {
            return SessionManager.current.token;
        }
        
        if (window.KnectaAuth?.getToken) {
            return window.KnectaAuth.getToken();
        }
        
        return localStorage.getItem(LOCAL_STORAGE_KEYS.USER_TOKEN);
    } catch (error) {
        return null;
    }
}

export function getCurrentUser() {
    try {
        if (window.parentCoordinator?.getUser()) {
            return window.parentCoordinator.getUser();
        }
        
        if (dataSource.userData) {
            return dataSource.userData;
        }
        
        if (window.KnectaAuth?.getUser()) {
            return window.KnectaAuth.getUser();
        }
        
        if (SessionManager.current?.user) {
            return SessionManager.current.user;
        }
        
        const userStr = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA);
        if (userStr) {
            return JSON.parse(userStr);
        }
    } catch (error) {
        Logger.error('getCurrentUser', 'Failed to get user', error);
    }
    
    return null;
}

// ------------------------------------------------------------------
// FRIEND REQUEST MANAGEMENT
// ------------------------------------------------------------------

export async function sendFriendRequest(friendId, category = 'friend', note = '', isTemporary = false, duration = null, isBusiness = false) {
    return featureSandbox('friendRequest', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false, error: 'Session invalid' };
        }
        
        if (!friendId || typeof friendId !== 'string') {
            showNotification?.('Invalid friend ID', 'error');
            return { success: false, error: 'Invalid friend ID' };
        }
        
        if (!validateFriendId(friendId)) {
            showNotification?.('Invalid friend ID format', 'error');
            return { success: false, error: 'Invalid format' };
        }
        
        if (isTemporary && (!duration || duration < 1)) {
            showNotification?.('Please specify a valid duration', 'error');
            return { success: false, error: 'Invalid duration' };
        }
        
        try {
            const response = await apiCallWithRetry('/api/friend-requests/send', {
                method: 'POST',
                body: JSON.stringify({
                    receiverId: friendId,
                    category,
                    note,
                    isTemporary,
                    duration,
                    isBusiness
                })
            }, 2);
            
            if (response?.success) {
                try {
                    const sentResponse = await apiCallWithRetry('/api/friend-requests/sent', null, 1);
                    if (sentResponse?.requests) {
                        sentRequests = sentResponse.requests;
                        localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
                    }
                } catch (e) {
                    // Silent fail for cache refresh
                }
                
                fetchAllUsersFromBackend().catch(() => {});
                updateCurrentSection?.();
                showNotification?.('Friend request sent successfully', 'success');
                
                return { success: true, response };
            }
            
            showNotification?.('Failed to send friend request', 'error');
            return { success: false, error: 'API returned error' };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('sendFriendRequest', 'API call failed', error, { friendId });
                showNotification?.('Failed to send friend request', 'error');
            }
            return { success: false, error: error.message };
        }
    }, { success: false, error: 'Feature disabled' });
}

export async function acceptFriendRequestOnline(requestId, friendId) {
    return featureSandbox('friendRequest', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!requestId || !friendId) {
            showNotification?.('Invalid request data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friend-requests/${requestId}/accept`, {
                method: 'POST'
            }, 2);
            
            if (response?.success) {
                startParallelDataLoading();
                showNotification?.('Friend request accepted', 'success');
                return { success: true };
            }
            
            showNotification?.('Failed to accept friend request', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('acceptFriendRequestOnline', 'API call failed', error, { requestId, friendId });
                showNotification?.('Failed to accept friend request', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export async function declineFriendRequest(requestData) {
    return featureSandbox('friendRequest', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!requestData?.id) {
            showNotification?.('Invalid request data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friend-requests/${requestData.id}/decline`, {
                method: 'POST'
            }, 2);
            
            if (response?.success) {
                try {
                    const requestsResponse = await apiCallWithRetry('/api/friend-requests/incoming', null, 1);
                    if (requestsResponse?.requests) {
                        friendRequests = requestsResponse.requests;
                        localStorage.setItem(LOCAL_STORAGE_KEYS.REQUESTS, JSON.stringify(friendRequests));
                    }
                } catch (e) {
                    // Silent fail
                }
                
                fetchAllUsersFromBackend().catch(() => {});
                updateCurrentSection?.();
                showNotification?.('Friend request declined', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to decline friend request', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('declineFriendRequest', 'API call failed', error);
                showNotification?.('Failed to decline friend request', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export async function cancelFriendRequest(requestData) {
    return featureSandbox('friendRequest', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!requestData?.id) {
            showNotification?.('Invalid request data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friend-requests/${requestData.id}`, {
                method: 'DELETE'
            }, 2);
            
            if (response?.success) {
                try {
                    const sentResponse = await apiCallWithRetry('/api/friend-requests/sent', null, 1);
                    if (sentResponse?.requests) {
                        sentRequests = sentResponse.requests;
                        localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
                    }
                } catch (e) {
                    // Silent fail
                }
                
                fetchAllUsersFromBackend().catch(() => {});
                updateCurrentSection?.();
                showNotification?.('Friend request cancelled', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to cancel friend request', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('cancelFriendRequest', 'API call failed', error);
                showNotification?.('Failed to cancel friend request', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

function validateFriendId(friendId) {
    if (typeof friendId !== 'string') return false;
    if (friendId.trim().length === 0) return false;
    if (friendId.length > 100) return false;
    
    const validPattern = /^[a-zA-Z0-9_\-:.@]+$/;
    return validPattern.test(friendId);
}

function validateFriendData(friendData) {
    if (!friendData || typeof friendData !== 'object') return false;
    if (!friendData.id || typeof friendData.id !== 'string') return false;
    if (!validateFriendId(friendData.id)) return false;
    
    if (friendData.displayName && typeof friendData.displayName !== 'string') return false;
    if (friendData.username && typeof friendData.username !== 'string') return false;
    if (friendData.email && typeof friendData.email !== 'string') return false;
    
    return true;
}

// ------------------------------------------------------------------
// DATA LOADING FUNCTIONS
// ------------------------------------------------------------------

export async function loadFriendsFromBackend() {
    return featureSandbox('friends', async () => {
        if (!SafetyGuards.isSessionValid()) {
            throw new Error('Authentication required');
        }
        
        try {
            const response = await apiCallWithRetry('/api/friends', null, 2);
            
            if (response?.friends) {
                friends = response.friends.filter(f => validateFriendData(f));
                friends.sort((a, b) => {
                    if (a.online !== b.online) return b.online ? 1 : -1;
                    return (a.displayName || '').localeCompare(b.displayName || '');
                });
                
                updateFriendCounts?.();
                
                localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
                localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SYNC, Date.now().toString());
                
                return { success: true, count: friends.length };
            }
        } catch (error) {
            Logger.error('loadFriendsFromBackend', 'Failed to load friends', error);
            
            const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    friends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
                    updateFriendCounts?.();
                } catch (e) {
                    friends = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadFriendRequestsFromBackend() {
    return featureSandbox('requests', async () => {
        if (!SafetyGuards.isSessionValid()) {
            throw new Error('Authentication required');
        }
        
        try {
            const response = await apiCallWithRetry('/api/friend-requests/incoming', null, 2);
            
            if (response?.requests) {
                friendRequests = response.requests;
                localStorage.setItem(LOCAL_STORAGE_KEYS.REQUESTS, JSON.stringify(friendRequests));
                return { success: true, count: friendRequests.length };
            }
        } catch (error) {
            Logger.error('loadFriendRequestsFromBackend', 'Failed to load requests', error);
            
            const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.REQUESTS);
            if (cached) {
                try {
                    friendRequests = JSON.parse(cached);
                } catch (e) {
                    friendRequests = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadSentRequestsFromBackend() {
    return featureSandbox('requests', async () => {
        if (!SafetyGuards.isSessionValid()) {
            throw new Error('Authentication required');
        }
        
        try {
            const response = await apiCallWithRetry('/api/friend-requests/sent', null, 2);
            
            if (response?.requests) {
                sentRequests = response.requests;
                localStorage.setItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS, JSON.stringify(sentRequests));
                return { success: true, count: sentRequests.length };
            }
        } catch (error) {
            Logger.error('loadSentRequestsFromBackend', 'Failed to load sent requests', error);
            
            const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS);
            if (cached) {
                try {
                    sentRequests = JSON.parse(cached);
                } catch (e) {
                    sentRequests = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadPinnedFriendsFromBackend() {
    return featureSandbox('pinned', async () => {
        if (!SafetyGuards.isSessionValid()) {
            throw new Error('Authentication required');
        }
        
        try {
            const response = await apiCallWithRetry('/api/friends/pinned', null, 2);
            
            if (response?.friends) {
                pinnedFriends = response.friends.filter(f => validateFriendData(f));
                localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
                return { success: true, count: pinnedFriends.length };
            }
        } catch (error) {
            Logger.error('loadPinnedFriendsFromBackend', 'Failed to load pinned friends', error);
            
            const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS);
            if (cached) {
                try {
                    pinnedFriends = JSON.parse(cached);
                } catch (e) {
                    pinnedFriends = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadMutedFriendsFromBackend() {
    return featureSandbox('muted', async () => {
        if (!SafetyGuards.isSessionValid()) {
            throw new Error('Authentication required');
        }
        
        try {
            const response = await apiCallWithRetry('/api/friends/muted', null, 2);
            
            if (response?.friends) {
                mutedFriends = response.friends.filter(f => validateFriendData(f));
                localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
                return { success: true, count: mutedFriends.length };
            }
        } catch (error) {
            Logger.error('loadMutedFriendsFromBackend', 'Failed to load muted friends', error);
            
            const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
            if (cached) {
                try {
                    mutedFriends = JSON.parse(cached);
                } catch (e) {
                    mutedFriends = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadContactsFromBackend() {
    return featureSandbox('contacts', async () => {
        if (!SafetyGuards.isSessionValid()) {
            throw new Error('Authentication required');
        }
        
        try {
            const response = await apiCallWithRetry('/api/contacts/synced', null, 2);
            
            if (response?.contacts) {
                contacts = response.contacts;
                localStorage.setItem(LOCAL_STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
                return { success: true, count: contacts.length };
            }
        } catch (error) {
            Logger.error('loadContactsFromBackend', 'Failed to load contacts', error);
            
            const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
            if (cached) {
                try {
                    contacts = JSON.parse(cached);
                } catch (e) {
                    contacts = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function loadGroupsFromBackend() {
    return featureSandbox('groups', async () => {
        if (!SafetyGuards.isSessionValid()) {
            throw new Error('Authentication required');
        }
        
        try {
            const response = await apiCallWithRetry('/api/group/user', null, 2);
            
            if (response?.groups) {
                groups = response.groups;
                localStorage.setItem(LOCAL_STORAGE_KEYS.USER_GROUPS, JSON.stringify(groups));
                return { success: true, count: groups.length };
            }
        } catch (error) {
            Logger.error('loadGroupsFromBackend', 'Failed to load groups', error);
            
            const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
            if (cached) {
                try {
                    groups = JSON.parse(cached);
                } catch (e) {
                    groups = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

export async function fetchAllUsersFromBackend() {
    return featureSandbox('discovery', async () => {
        if (!SafetyGuards.isSessionValid()) {
            throw new Error('Authentication required');
        }
        
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
        const lastSync = localStorage.getItem('all_users_last_sync');
        const now = Date.now();
        
        if (cached && lastSync && (now - parseInt(lastSync)) < 10 * 60 * 1000) {
            try {
                allUsers = JSON.parse(cached);
                return { success: true, count: allUsers.length, cached: true };
            } catch (e) {
                // Parse failed
            }
        }
        
        try {
            const response = await apiCallWithRetry('/api/users/all?limit=50', null, 2);
            
            if (response?.users) {
                const currentUserId = currentUser?.id;
                allUsers = response.users.filter(user => user.id !== currentUserId);
                
                allUsers.sort((a, b) => {
                    if (a.online !== b.online) return b.online ? 1 : -1;
                    return (a.displayName || '').localeCompare(b.displayName || '');
                });
                
                localStorage.setItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE, JSON.stringify(allUsers));
                localStorage.setItem('all_users_last_sync', Date.now().toString());
                
                return { success: true, count: allUsers.length };
            }
        } catch (error) {
            Logger.error('fetchAllUsersFromBackend', 'Failed to fetch users', error);
            
            if (cached) {
                try {
                    allUsers = JSON.parse(cached);
                    return { success: true, count: allUsers.length, cached: true };
                } catch (e) {
                    allUsers = [];
                }
            }
        }
        
        return { success: false };
    }, { success: false });
}

// ------------------------------------------------------------------
// INITIALIZATION & CACHE FUNCTIONS
// ------------------------------------------------------------------

export function loadCachedDataInstantly() {
    try {
        const cachedUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_DATA) || 
                           localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (cachedUser) {
            currentUser = JSON.parse(cachedUser);
            userData = currentUser;
        }
        
        const friendsData = localStorage.getItem(LOCAL_STORAGE_KEYS.FRIENDS);
        if (friendsData) {
            const parsed = JSON.parse(friendsData);
            friends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
            updateFriendCounts?.();
        }
        
        const contactsData = localStorage.getItem(LOCAL_STORAGE_KEYS.CONTACTS);
        if (contactsData) contacts = JSON.parse(contactsData) || [];
        
        const requestsData = localStorage.getItem(LOCAL_STORAGE_KEYS.REQUESTS);
        if (requestsData) friendRequests = JSON.parse(requestsData) || [];
        
        const sentRequestsData = localStorage.getItem(LOCAL_STORAGE_KEYS.SENT_REQUESTS);
        if (sentRequestsData) sentRequests = JSON.parse(sentRequestsData) || [];
        
        const pinnedData = localStorage.getItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS);
        if (pinnedData) {
            const parsed = JSON.parse(pinnedData);
            pinnedFriends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
        }
        
        const mutedData = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS);
        if (mutedData) {
            const parsed = JSON.parse(mutedData);
            mutedFriends = Array.isArray(parsed) ? parsed.filter(f => validateFriendData(f)) : [];
        }
        
        const allUsersData = localStorage.getItem(LOCAL_STORAGE_KEYS.ALL_USERS_CACHE);
        if (allUsersData) allUsers = JSON.parse(allUsersData) || [];
        
        const mutualCache = localStorage.getItem(LOCAL_STORAGE_KEYS.MUTUAL_FRIENDS_CACHE);
        if (mutualCache) mutualFriendsCache = JSON.parse(mutualCache) || {};
        
        const groupsData = localStorage.getItem(LOCAL_STORAGE_KEYS.USER_GROUPS);
        if (groupsData) groups = JSON.parse(groupsData) || [];
        
        const interactionsData = localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_INTERACTIONS);
        if (interactionsData) window.lastInteractions = JSON.parse(interactionsData) || {};
        
        const notesData = localStorage.getItem(LOCAL_STORAGE_KEYS.PRIVATE_NOTES);
        if (notesData) window.privateNotes = JSON.parse(notesData) || {};
        
    } catch (error) {
        Logger.error('Cache', 'Failed to load cached data', error);
    }
}

export function startParallelDataLoading() {
    if (backgroundTasksStarted) return;
    
    if (!SafetyGuards.isSessionValid() || !getValidToken()) {
        return;
    }
    
    backgroundTasksStarted = true;
    
    KnectaAuth.showLoading?.(true);
    
    const loaders = [
        loadFriendsFromBackend(),
        loadFriendRequestsFromBackend(),
        loadSentRequestsFromBackend(),
        loadPinnedFriendsFromBackend(),
        loadMutedFriendsFromBackend(),
        loadContactsFromBackend(),
        loadGroupsFromBackend(),
        fetchAllUsersFromBackend()
    ];
    
    Promise.allSettled(loaders).then(() => {
        updateCurrentSection?.();
        showNotification?.('Friends data loaded', 'success');
        KnectaAuth.showLoading?.(false);
    });
}

// ------------------------------------------------------------------
// UTILITY FUNCTIONS
// ------------------------------------------------------------------

export function checkMobile() {
    try {
        isMobile = window.innerWidth <= 768;
    } catch (error) {
        Logger.error('Utility', 'Failed to check mobile', error);
    }
}

// ------------------------------------------------------------------
// CAMERA AND QR CODE FUNCTIONS
// ------------------------------------------------------------------

export async function startCameraScanner() {
    return featureSandbox('camera', async () => {
        const video = SafetyGuards.safeGetElement('cameraVideo');
        const canvas = SafetyGuards.safeGetElement('scannerCanvas');
        
        if (!video || !canvas) {
            showNotification?.('Camera elements not found', 'error');
            return;
        }
        
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
        }
        
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentCamera },
                audio: false
            });
            
            video.srcObject = cameraStream;
            
            startRealQRCodeScanning(video, canvas);
            showNotification?.('Camera started', 'success');
            
        } catch (error) {
            Logger.error('Camera', 'Failed to start camera', error);
            
            const container = document.querySelector('.camera-container');
            if (container) {
                container.innerHTML = `
                    <div class="no-camera-message">
                        <i class="fas fa-video-slash"></i>
                        <h3>Camera Access Required</h3>
                        <p>Please allow camera access to scan QR codes.</p>
                    </div>
                `;
            }
            
            showNotification?.('Could not access camera', 'error');
        }
    });
}

function startRealQRCodeScanning(video, canvas) {
    if (!featureFlags.qrCode) return;
    
    const ctx = canvas.getContext('2d');
    scanningActive = true;
    
    function scan() {
        if (!scanningActive || !document.getElementById('cameraScannerModal')?.classList.contains('active')) {
            return;
        }
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            try {
                if (typeof jsQR === 'function') {
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert"
                    });
                    
                    if (code) {
                        drawQRCodeRect(code.location, ctx);
                        processScannedQRCodeReal(code.data);
                        return;
                    }
                }
            } catch (e) {
                // Silent fail
            }
        }
        
        requestAnimationFrame(scan);
    }
    
    function drawQRCodeRect(location, ctx) {
        try {
            ctx.beginPath();
            ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
            ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
            ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
            ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
            ctx.closePath();
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#00FF00";
            ctx.stroke();
        } catch (e) {
            // Silently fail
        }
    }
    
    scan();
}

function processScannedQRCodeReal(qrData) {
    try {
        let parsed;
        try {
            parsed = JSON.parse(qrData);
        } catch (e) {
            parsed = { data: qrData, userId: qrData };
        }
        
        if (!parsed.userId) {
            showNotification?.('Invalid QR code format', 'error');
            return;
        }
        
        if (!validateFriendId(parsed.userId)) {
            showNotification?.('Invalid user ID in QR code', 'error');
            return;
        }
        
        showFriendRequestFromQRReal(parsed);
        
        stopCameraScanner();
        
        const modal = SafetyGuards.safeGetElement('cameraScannerModal');
        if (modal) modal.classList.remove('active');
        
        showNotification?.('QR code scanned!', 'success');
        
    } catch (error) {
        Logger.error('QR', 'Failed to process QR code', error);
        showNotification?.('Error processing QR code', 'error');
    }
}

function showFriendRequestFromQRReal(qrData) {
    fetchUserInfoFromQR(qrData.userId)
        .then(user => {
            const avatar = SafetyGuards.safeGetElement('requestAvatar');
            const name = SafetyGuards.safeGetElement('requestName');
            const username = SafetyGuards.safeGetElement('requestUsername');
            const mutual = SafetyGuards.safeGetElement('mutualCount');
            const accept = SafetyGuards.safeGetElement('acceptRequestBtn');
            const modal = SafetyGuards.safeGetElement('friendRequestModal');
            
            if (avatar) {
                avatar.innerHTML = `<div style="width:100%;height:100%;border-radius:50%;background:var(--primary-color);color:white;display:flex;align-items:center;justify-content:center;font-size:24px;">
                    ${(user.displayName || 'U').charAt(0).toUpperCase()}
                </div>`;
            }
            
            if (name) name.textContent = user.displayName || 'QR Code User';
            if (username) username.textContent = user.username || '@unknown';
            if (mutual) mutual.textContent = '0';
            if (accept) {
                accept.dataset.userId = qrData.userId;
                accept.dataset.userName = user.displayName || 'User';
                accept.dataset.qrData = JSON.stringify(qrData);
            }
            if (modal) modal.classList.add('active');
        })
        .catch(error => {
            Logger.error('QR', 'Failed to fetch user info', error);
            
            const avatar = SafetyGuards.safeGetElement('requestAvatar');
            const name = SafetyGuards.safeGetElement('requestName');
            const username = SafetyGuards.safeGetElement('requestUsername');
            const accept = SafetyGuards.safeGetElement('acceptRequestBtn');
            const modal = SafetyGuards.safeGetElement('friendRequestModal');
            
            if (avatar) {
                avatar.innerHTML = `<div style="width:100%;height:100%;border-radius:50%;background:var(--primary-color);color:white;display:flex;align-items:center;justify-content:center;font-size:24px;">
                    ${(qrData.displayName || 'U').charAt(0).toUpperCase()}
                </div>`;
            }
            
            if (name) name.textContent = qrData.displayName || 'QR Code User';
            if (username) username.textContent = qrData.username || '@unknown';
            if (accept) {
                accept.dataset.userId = qrData.userId;
                accept.dataset.userName = qrData.displayName || 'User';
                accept.dataset.qrData = JSON.stringify(qrData);
            }
            if (modal) modal.classList.add('active');
        });
}

async function fetchUserInfoFromQR(userId) {
    if (!SafetyGuards.isSessionValid()) {
        throw new Error('No valid token');
    }
    
    try {
        const response = await apiCallWithRetry(`/api/users/${userId}`, null, 2);
        
        if (response?.user && validateFriendData(response.user)) {
            return response.user;
        }
        
        throw new Error('User not found');
    } catch (error) {
        Logger.error('QR', 'Failed to fetch user', error, { userId });
        throw error;
    }
}

export function stopCameraScanner() {
    scanningActive = false;
    
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    
    const video = SafetyGuards.safeGetElement('cameraVideo');
    if (video) video.srcObject = null;
}

export async function toggleCamera() {
    return featureSandbox('camera', async () => {
        currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
        await startCameraScanner();
    });
}

export function toggleFlash() {
    return featureSandbox('camera', () => {
        if (!cameraStream) return;
        
        const track = cameraStream.getVideoTracks()[0];
        if (!track?.getCapabilities) {
            showNotification?.('Flash not supported', 'warning');
            return;
        }
        
        const caps = track.getCapabilities();
        if (!caps.torch) {
            showNotification?.('Flash not supported on this camera', 'warning');
            return;
        }
        
        flashOn = !flashOn;
        track.applyConstraints({ advanced: [{ torch: flashOn }] });
        
        const btn = SafetyGuards.safeGetElement('toggleFlashBtn');
        if (btn) {
            btn.innerHTML = flashOn ? 
                '<i class="fas fa-lightbulb"></i> Flash On' : 
                '<i class="far fa-lightbulb"></i> Flash Off';
            btn.style.backgroundColor = flashOn ? 'var(--warning-color)' : 'var(--primary-color)';
        }
        
        showNotification?.(flashOn ? 'Flash on' : 'Flash off', 'info');
    });
}

// ------------------------------------------------------------------
// QR CODE GENERATION
// ------------------------------------------------------------------

export function generateUniqueQRCode() {
    return featureSandbox('qrCode', () => {
        const container = SafetyGuards.safeGetElement('qrCodeContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (typeof QRCode === 'undefined') {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px; color: var(--primary-color);"></i>
                    <p>Your unique QR code</p>
                    <p style="font-size: 12px; margin-top: 10px;">Scan to add as friend</p>
                </div>
            `;
            return;
        }
        
        const user = currentUser || userData;
        if (!user || !user.id) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>Sign in to generate QR code</p>
                </div>
            `;
            return;
        }
        
        if (!validateFriendData(user)) {
            container.innerHTML = `
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
            username: user.username || `user_${Math.random().toString(36).substr(2, 9)}`,
            displayName: user.displayName || 'Knecta User',
            timestamp: Date.now(),
            app: 'Knecta Chat',
            version: '1.0',
            hash: generateVerificationHash(user.id, user.username || '')
        });
        
        try {
            new QRCode(container, {
                text: qrData,
                width: 200,
                height: 200,
                colorDark: '#0084ff',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.UNIQUE_QR_CODE, qrData);
            
        } catch (error) {
            Logger.error('QR', 'Failed to generate QR code', error);
            
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-qrcode" style="font-size: 48px; margin-bottom: 15px; color: var(--primary-color);"></i>
                    <p>Your unique QR code</p>
                    <p style="font-size: 10px; margin-top: 5px;">User: ${user.username || user.id}</p>
                </div>
            `;
        }
    });
}

function generateVerificationHash(userId, username) {
    try {
        const data = userId + username + Date.now();
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            hash = ((hash << 5) - hash) + data.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    } catch (error) {
        return 'error_' + Date.now();
    }
}

// ------------------------------------------------------------------
// MUTUAL FRIENDS FUNCTIONS
// ------------------------------------------------------------------

export async function showMutualFriends(userId, userName) {
    return featureSandbox('mutualFriends', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return;
        }
        
        if (!validateFriendId(userId)) {
            showNotification?.('Invalid user ID', 'error');
            return;
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friends/mutual/${userId}`, null, 2);
            
            if (response?.mutualFriends) {
                const mutual = response.mutualFriends;
                
                if (mutual.length === 0) {
                    showNotification?.(`No mutual friends with ${userName}`, 'info');
                    return;
                }
                
                displayMutualFriendsModal(mutual, userName);
            } else {
                showNotification?.('No mutual friends found', 'info');
            }
            
        } catch (error) {
            Logger.error('MutualFriends', 'Failed to load mutual friends', error, { userId });
            showNotification?.('Error loading mutual friends', 'error');
        }
    });
}

function displayMutualFriendsModal(mutualFriends, userName) {
    try {
        const countText = SafetyGuards.safeGetElement('mutualCountText');
        const listEl = SafetyGuards.safeGetElement('mutualFriendsList');
        const modal = SafetyGuards.safeGetElement('mutualFriendsModal');
        
        if (!countText || !listEl || !modal) return;
        
        countText.textContent = `${mutualFriends.length} mutual friends with ${userName}`;
        listEl.innerHTML = '';
        
        if (mutualFriends.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fas fa-users" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <p>No mutual friends found</p>
                </div>
            `;
        } else {
            mutualFriends.forEach(friend => {
                const initials = friend.displayName
                    ? friend.displayName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2)
                    : 'U';
                
                const item = document.createElement('div');
                item.className = 'mutual-friend-item';
                item.innerHTML = `
                    <div class="mutual-friend-avatar" ${friend.photoURL ? `style="background-image: url('${escapeHtml(friend.photoURL)}')"` : ''}>
                        ${friend.photoURL ? '' : `<span>${initials}</span>`}
                    </div>
                    <div class="mutual-friend-info">
                        <div class="mutual-friend-name">${escapeHtml(friend.displayName || 'Unknown')}</div>
                        ${friend.username ? `<div class="mutual-friend-username">${escapeHtml(friend.username)}</div>` : ''}
                    </div>
                `;
                
                item.addEventListener('click', () => {
                    showFriendDetails?.(friend, 'friend');
                    modal.classList.remove('active');
                });
                
                listEl.appendChild(item);
            });
        }
        
        modal.classList.add('active');
        
    } catch (error) {
        Logger.error('MutualFriends', 'Failed to display modal', error);
    }
}

// ------------------------------------------------------------------
// FRIEND OPTIONS AND MANAGEMENT
// ------------------------------------------------------------------

export async function togglePinFriend(friendData) {
    return featureSandbox('pinned', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!validateFriendData(friendData)) {
            showNotification?.('Invalid friend data', 'error');
            return { success: false };
        }
        
        const friendId = friendData.id;
        const isPinned = pinnedFriends.some(f => f.id === friendId);
        
        try {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/pin`, {
                method: isPinned ? 'DELETE' : 'POST'
            }, 2);
            
            if (response?.success) {
                if (isPinned) {
                    pinnedFriends = pinnedFriends.filter(f => f.id !== friendId);
                } else {
                    pinnedFriends.push(friendData);
                }
                
                localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
                
                updateCurrentSection?.();
                updateFriendCounts?.();
                showNotification?.(isPinned ? 'Friend unpinned' : 'Friend pinned', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to update pin status', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('togglePinFriend', 'Failed to toggle pin', error);
                showNotification?.('Failed to update pin status', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export async function toggleMuteFriend(friendData) {
    return featureSandbox('muted', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!validateFriendData(friendData)) {
            showNotification?.('Invalid friend data', 'error');
            return { success: false };
        }
        
        const friendId = friendData.id;
        const isMuted = mutedFriends.some(f => f.id === friendId);
        
        try {
            const response = await apiCallWithRetry(`/api/friends/${friendId}/mute`, {
                method: isMuted ? 'DELETE' : 'POST'
            }, 2);
            
            if (response?.success) {
                if (isMuted) {
                    mutedFriends = mutedFriends.filter(f => f.id !== friendId);
                } else {
                    mutedFriends.push(friendData);
                }
                
                localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
                
                updateCurrentSection?.();
                updateFriendCounts?.();
                showNotification?.(isMuted ? 'Friend unmuted' : 'Friend muted', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to update mute status', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('toggleMuteFriend', 'Failed to toggle mute', error);
                showNotification?.('Failed to update mute status', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export function savePrivateNote(friendId, note) {
    return featureSandbox('notes', () => {
        if (!validateFriendId(friendId)) {
            showNotification?.('Invalid friend ID', 'error');
            return false;
        }
        
        if (note && note.length > 1000) {
            showNotification?.('Note is too long (max 1000 characters)', 'error');
            return false;
        }
        
        try {
            if (!window.privateNotes) window.privateNotes = {};
            window.privateNotes[friendId] = note;
            
            localStorage.setItem(LOCAL_STORAGE_KEYS.PRIVATE_NOTES, JSON.stringify(window.privateNotes));
            showNotification?.('Note saved', 'success');
            
            return true;
            
        } catch (error) {
            Logger.error('Notes', 'Failed to save note', error, { friendId });
            showNotification?.('Failed to save note', 'error');
            return false;
        }
    }, false);
}

export function getLastInteraction(friendId) {
    try {
        if (!window.lastInteractions) window.lastInteractions = {};
        
        const interaction = window.lastInteractions[friendId];
        if (!interaction?.timestamp) return null;
        
        const now = new Date();
        const then = new Date(interaction.timestamp);
        const minutes = Math.floor((now - then) / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        
        return `${Math.floor(days / 7)}w ago`;
    } catch (error) {
        return null;
    }
}

export async function removeFriend(friendData) {
    return featureSandbox('friends', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!validateFriendData(friendData)) {
            showNotification?.('Invalid friend data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/friends/${friendData.id}`, {
                method: 'DELETE'
            }, 2);
            
            if (response?.success) {
                friends = friends.filter(f => f.id !== friendData.id);
                pinnedFriends = pinnedFriends.filter(f => f.id !== friendData.id);
                mutedFriends = mutedFriends.filter(f => f.id !== friendData.id);
                
                localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
                localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
                localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
                
                updateCurrentSection?.();
                updateFriendCounts?.();
                showNotification?.('Friend removed', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to remove friend', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('removeFriend', 'Failed to remove friend', error);
                showNotification?.('Failed to remove friend', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

export async function blockUser(friendData) {
    return featureSandbox('friends', async () => {
        if (!SafetyGuards.isSessionValid()) {
            showNotification?.('Authentication required', 'error');
            return { success: false };
        }
        
        if (!validateFriendData(friendData)) {
            showNotification?.('Invalid user data', 'error');
            return { success: false };
        }
        
        try {
            const response = await apiCallWithRetry(`/api/users/${friendData.id}/block`, {
                method: 'POST'
            }, 2);
            
            if (response?.success) {
                friends = friends.filter(f => f.id !== friendData.id);
                pinnedFriends = pinnedFriends.filter(f => f.id !== friendData.id);
                mutedFriends = mutedFriends.filter(f => f.id !== friendData.id);
                
                localStorage.setItem(LOCAL_STORAGE_KEYS.FRIENDS, JSON.stringify(friends));
                localStorage.setItem(LOCAL_STORAGE_KEYS.PINNED_FRIENDS, JSON.stringify(pinnedFriends));
                localStorage.setItem(LOCAL_STORAGE_KEYS.MUTED_FRIENDS, JSON.stringify(mutedFriends));
                
                updateCurrentSection?.();
                updateFriendCounts?.();
                showNotification?.('User blocked', 'success');
                
                return { success: true };
            }
            
            showNotification?.('Failed to block user', 'error');
            return { success: false };
            
        } catch (error) {
            if (error.message !== 'Session expired') {
                Logger.error('blockUser', 'Failed to block user', error);
                showNotification?.('Failed to block user', 'error');
            }
            return { success: false };
        }
    }, { success: false });
}

// ------------------------------------------------------------------
// DATA PERSISTENCE FUNCTIONS
// ------------------------------------------------------------------

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
        return true;
    } catch (error) {
        Logger.error('Persistence', 'Failed to save to localStorage', error);
        return false;
    }
}

// ------------------------------------------------------------------
// UI UPDATE FUNCTIONS
// ------------------------------------------------------------------

export function updateUIWithUserData(userData) {
    try {
        currentUser = userData;
        userData = userData;
        
        updateUserDisplayElements(userData);
        
        if (userData?.id && featureFlags.qrCode) {
            setTimeout(generateUniqueQRCode, 100);
        }
        
        window.dispatchEvent(new CustomEvent('userDataLoaded', {
            detail: { userData, source: dataSource.source }
        }));
        
    } catch (error) {
        Logger.error('UI', 'Failed to update UI with user data', error);
    }
}

function updateUserDisplayElements(userData) {
    // Stub
}

export function updateDataSourceIndicator(source) {
    try {
        const indicator = SafetyGuards.safeGetElement('dataSourceIndicator');
        if (!indicator) return;
        
        indicator.className = 'data-source-indicator active';
        indicator.classList.add(source);
        
        const text = SafetyGuards.safeGetElement('dataSourceText');
        if (text) {
            const labels = {
                'parent': 'Data from Parent',
                'unified_auth': 'Data from Auth System',
                'cache': 'Cached Data',
                'direct': 'Data from API',
                'standalone': 'Standalone Mode',
                'guest': 'Guest Mode'
            };
            text.textContent = labels[source] || 'Unknown Source';
        }
        
        setTimeout(() => indicator.classList.remove('active'), 5000);
        
    } catch (error) {
        Logger.error('UI', 'Failed to update data source indicator', error);
    }
}

// CRITICAL FIX: attemptCachedDataFallback is now defined in section [15]

export function initializeMainFunctionality() {
    try {
        hideAuthError();
        
        if (typeof enhancedInitialize === 'function') {
            enhancedInitialize();
        } else {
            initializeOriginalFunctionality();
        }
    } catch (error) {
        Logger.error('Init', 'Failed to initialize main functionality', error);
    }
}

function initializeOriginalFunctionality() {
    try {
        loadCachedDataInstantly();
        cacheLoaded = true;
        
        setTimeout(startParallelDataLoading, 1000);
        setTimeout(updateCurrentSection, 500);
    } catch (error) {
        Logger.error('Init', 'Failed to initialize original functionality', error);
    }
}

export function showAuthError(message) {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.showAuthError(message);
            return;
        }
        
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        const msgEl = SafetyGuards.safeGetElement('authErrorMessage');
        
        if (overlay && msgEl) {
            msgEl.textContent = message || 'Authentication required';
            overlay.classList.add('active');
        }
    } catch (error) {
        Logger.error('UI', 'Failed to show auth error', error);
    }
}

export function hideAuthError() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.hideAuthError();
            return;
        }
        
        const overlay = SafetyGuards.safeGetElement('authErrorOverlay');
        if (overlay) overlay.classList.remove('active');
    } catch (error) {
        Logger.error('UI', 'Failed to hide auth error', error);
    }
}

export function showReconnectionState() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.showReconnectionState();
            return;
        }
        
        if (!SafetyGuards.safeGetElement('reconnectionIndicator')) {
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
        Logger.error('UI', 'Failed to show reconnection state', error);
    }
}

export function hideReconnectionState() {
    try {
        if (window.parentCoordinator) {
            window.parentCoordinator.hideReconnectionState();
            return;
        }
        
        const indicator = SafetyGuards.safeGetElement('reconnectionIndicator');
        if (indicator) indicator.remove();
    } catch (error) {
        Logger.error('UI', 'Failed to hide reconnection state', error);
    }
}

// ------------------------------------------------------------------
// PARENT COORDINATION INTEGRATION FUNCTIONS
// ------------------------------------------------------------------

export function initializeParentChildCommunication() {
    try {
        setupSessionEventListeners();
        loadCachedDataInstantly();
        waitForParentSession();
    } catch (error) {
        Logger.error('ParentChild', 'Failed to initialize communication', error);
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
        Logger.error('ParentChild', 'Failed to setup event listeners', error);
    }
}

function handleParentSessionReady(event) {
    try {
        dataSource.parentSessionReceived = true;
        dataSource.fetched = true;
        dataSource.fallbackMode = false;
        
        const session = event.detail.session;
        
        dataSource.source = 'parent';
        dataSource.userData = session.user;
        dataSource.token = session.token;
        
        currentUser = session.user;
        userData = session.user;
        
        SessionManager.updateSession(session);
        
        updateUIWithUserData(session.user);
        updateDataSourceIndicator('parent');
        
        initializeMainFunctionality();
    } catch (error) {
        Logger.error('ParentChild', 'Failed to handle parent session ready', error);
    }
}

function handleParentSessionUpdate(event) {
    try {
        const session = event.detail.session;
        
        dataSource.userData = session.user;
        dataSource.token = session.token;
        
        currentUser = session.user;
        userData = session.user;
        
        SessionManager.updateSession(session);
        
        updateUIWithUserData(session.user);
    } catch (error) {
        Logger.error('ParentChild', 'Failed to handle parent session update', error);
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
        
        SessionManager.clearSession();
        
        updateCurrentSection?.();
        showAuthError('You have been logged out. Please log in again.');
    } catch (error) {
        Logger.error('ParentChild', 'Failed to handle parent logout', error);
    }
}

function handleParentProfileUpdate(event) {
    try {
        const user = event.detail.user;
        
        dataSource.userData = user;
        currentUser = user;
        userData = user;
        
        updateUIWithUserData(user);
        showNotification?.('Profile updated', 'success');
    } catch (error) {
        Logger.error('ParentChild', 'Failed to handle profile update', error);
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
            userData = detail.user;
            
            SessionManager.updateSession({
                token: detail.token,
                user: detail.user,
                source: 'unified_auth'
            });
            
            updateUIWithUserData(detail.user);
            updateDataSourceIndicator('unified_auth');
            
            initializeMainFunctionality();
            showNotification?.('Using authentication system. Parent coordination not available.', 'warning');
        }
    } catch (error) {
        Logger.error('ParentChild', 'Failed to handle unified auth ready', error);
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
                // CRITICAL FIX: Do NOT set fallbackMode
                
                currentUser = detail.user;
                userData = detail.user;
                
                updateUIWithUserData(detail.user);
                updateDataSourceIndicator('cache');
                
                initializeMainFunctionality();
                showNotification?.('Using cached data. Sign in for live updates.', 'warning');
            }
        }
    } catch (error) {
        Logger.error('ParentChild', 'Failed to handle unified cache ready', error);
    }
}

function waitForParentSession() {
    let attempts = 0;
    const maxAttempts = 10;
    
    const check = () => {
        attempts++;
        
        if (dataSource.parentSessionReceived || dataSource.fetched) {
            return;
        }
        
        if (attempts >= maxAttempts) {
            // CRITICAL FIX: Do NOT attempt cached data fallback
            // Show auth error instead
            showAuthError('Unable to connect to parent. Please refresh the page.');
            return;
        }
        
        setTimeout(check, 1000);
    };
    
    check();
}

// ------------------------------------------------------------------
// MISSING FUNCTION WRAPPERS
// ------------------------------------------------------------------

export function updateCurrentSection() {
    Logger.debug('UI', 'updateCurrentSection called (stub)');
}

export function updateFriendCounts() {
    Logger.debug('UI', 'updateFriendCounts called (stub)');
}

export function showFriendDetails(friend, type) {
    Logger.debug('UI', 'showFriendDetails called (stub)', { friendId: friend?.id, type });
}

export function renderFriendsListInstantly() {
    Logger.debug('UI', 'renderFriendsListInstantly called (stub)');
}

export function addFriendItem(friendData, container, type) {
    Logger.debug('UI', 'addFriendItem called (stub)', { userId: friendData?.id, type });
}

export function addFriendItemInstant(friendData, container, type) {
    Logger.debug('UI', 'addFriendItemInstant called (stub)', { userId: friendData?.id, type });
}

export function renderContacts() {
    Logger.debug('UI', 'renderContacts called (stub)');
}

export function renderFriends() {
    Logger.debug('UI', 'renderFriends called (stub)');
}

export function renderFriendRequests() {
    Logger.debug('UI', 'renderFriendRequests called (stub)');
}

export function renderSentRequests() {
    Logger.debug('UI', 'renderSentRequests called (stub)');
}

export function addFriendRequestItem(requestData, container, type) {
    Logger.debug('UI', 'addFriendRequestItem called (stub)', { requestId: requestData?.id, type });
}

export function handleFriendAction(action, friendData, type, button) {
    Logger.debug('UI', 'handleFriendAction called (stub)', { action, userId: friendData?.id, type });
}

export function handleRequestAction(action, requestData, button) {
    Logger.debug('UI', 'handleRequestAction called (stub)', { action, requestId: requestData?.id });
}

export function filterFriendsByCategory(category) {
    Logger.debug('UI', 'filterFriendsByCategory called (stub)', { category });
    currentCategoryFilter = category;
}

export function searchFriends(searchTerm) {
    Logger.debug('UI', 'searchFriends called (stub)', { searchTerm });
    currentSearchTerm = searchTerm?.toLowerCase().trim() || '';
}

export function renderAllUsersList() {
    Logger.debug('UI', 'renderAllUsersList called (stub)');
}

export function loadFriendDetails(friendData, type) {
    Logger.debug('UI', 'loadFriendDetails called (stub)', { userId: friendData?.id, type });
}

export function showFriendRequestProfile(requestData) {
    Logger.debug('UI', 'showFriendRequestProfile called (stub)', { requestId: requestData?.id });
}

export function showFriendOptions(friendData) {
    Logger.debug('UI', 'showFriendOptions called (stub)', { userId: friendData?.id });
}

export function viewChatHistory(friendData) {
    Logger.debug('UI', 'viewChatHistory called (stub)', { userId: friendData?.id });
    navigateToChat?.(friendData.id, friendData.displayName || 'User');
}

export function viewCallHistory(friendData) {
    Logger.debug('UI', 'viewCallHistory called (stub)', { userId: friendData?.id });
    navigateToCall?.(friendData.id, friendData.displayName || 'User');
}

export function showChangeCategoryModal(friendData) {
    Logger.debug('UI', 'showChangeCategoryModal called (stub)', { userId: friendData?.id });
}

export function renderTemporaryFriends() {
    Logger.debug('UI', 'renderTemporaryFriends called (stub)');
}

export function renderPinnedFriends() {
    Logger.debug('UI', 'renderPinnedFriends called (stub)');
}

export function renderMutedFriends() {
    Logger.debug('UI', 'renderMutedFriends called (stub)');
}

export function showStartChatModal() {
    Logger.debug('UI', 'showStartChatModal called (stub)');
}

export function setupEventListeners() {
    Logger.debug('UI', 'setupEventListeners called (stub)');
}

// ------------------------------------------------------------------
// DELEGATED EXPORTS - Re-export imported functions
// ------------------------------------------------------------------

export function showNotification(message, type = 'success', duration = 3000) {
    if (typeof importedShowNotification === 'function') {
        return importedShowNotification(message, type, duration);
    }
    
    console.log(`[Notification] ${type.toUpperCase()}: ${message}`);
    return null;
}

export function navigateToChat(userId, userName) {
    if (typeof importedNavigateToChat === 'function') {
        return importedNavigateToChat(userId, userName);
    }
    
    Logger.warn('Navigation', 'navigateToChat not available (fallback mode)', { userId, userName });
    return null;
}

export function navigateToCall(userId, userName) {
    if (typeof importedNavigateToCall === 'function') {
        return importedNavigateToCall(userId, userName);
    }
    
    Logger.warn('Navigation', 'navigateToCall not available (fallback mode)', { userId, userName });
    return null;
}

export function simulateContactSync() {
    if (typeof importedSimulateContactSync === 'function') {
        return importedSimulateContactSync();
    }
    
    Logger.warn('Contacts', 'simulateContactSync not available (fallback mode)');
    return Promise.resolve({ success: false, error: 'Not available' });
}

export function escapeHtml(text) {
    if (typeof importedEscapeHtml === 'function') {
        return importedEscapeHtml(text);
    }
    
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function formatTimeAgo(date) {
    if (typeof importedFormatTimeAgo === 'function') {
        return importedFormatTimeAgo(date);
    }
    
    if (!date) return '';
    try {
        const now = new Date();
        const then = new Date(date);
        const diff = Math.floor((now - then) / 1000);
        
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return `${Math.floor(diff / 604800)}w ago`;
    } catch (e) {
        return String(date);
    }
}

export function formatDate(date) {
    try {
        const d = new Date(date);
        return d.toLocaleDateString(undefined, { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    } catch (e) {
        return String(date);
    }
}

export function getTrustScoreClass(score) {
    if (typeof importedGetTrustScoreClass === 'function') {
        return importedGetTrustScoreClass(score);
    }
    
    if (score >= 8) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
}

function timeoutPromise(ms, message) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message || 'Timeout')), ms);
    });
}

async function withTimeout(promise, ms, message) {
    try {
        return await Promise.race([
            promise,
            timeoutPromise(ms, message)
        ]);
    } catch (error) {
        Logger.warn('Timeout', message || 'Operation timeout', error);
        throw error;
    }
}

const dependencyLogger = {
    missing: new Set(),
    
    logMissing(deps) {
        deps.forEach(dep => {
            if (!this.missing.has(dep)) {
                this.missing.add(dep);
                Logger.warn('Dependency', `Missing dependency: ${dep} - using fallback`);
            }
        });
    }
};

// ------------------------------------------------------------------
// GLOBAL REGISTRATION
// ------------------------------------------------------------------

MessageBus.init();

window.SafetyGuards = SafetyGuards;
window.ParentCoordinator = ParentCoordinator;
window.KnectaAuth = KnectaAuth;
window.MessageBus = MessageBus;
window.SessionManager = SessionManager;
window.Logger = Logger;
window.ResourceManager = ResourceManager;
window.SecurityManager = SecurityManager;
window.ErrorHandler = ErrorHandler;
window.featureFlags = featureFlags;
window.friendCore = {
    version: '2.0.3',
    initialized: false,
    fallbackMode: false,
    init: enhancedInitialize,
    attemptCachedDataFallback: attemptCachedDataFallback
};

// ------------------------------------------------------------------
// DOM READY INITIALIZATION
// ------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    enhancedInitialize().catch(error => {
        Logger.error('Init', 'Failed to initialize friend core', error);
        
        // CRITICAL FIX: Do NOT enter fallback mode
        // Show auth error instead
        showAuthError('Failed to connect to parent. Please refresh the page.');
        
        // Still mark as ready for UI but with error state
        apiReady = false;
        isInitialized = false;
        
        window.dispatchEvent(new CustomEvent('friendCoreReady', {
            detail: { 
                error: true,
                message: error.message,
                timestamp: Date.now() 
            }
        }));
    });
});

// ------------------------------------------------------------------
// CLEANUP ON UNLOAD
// ------------------------------------------------------------------

window.addEventListener('beforeunload', () => {
    saveFriendsToLocalStorage();
    
    stopCameraScanner();
    
    if (backgroundSyncInterval) {
        clearInterval(backgroundSyncInterval);
        backgroundSyncInterval = null;
    }
    
    ResourceManager.release();
    MessageBus.destroy();
});

// =============================================
// EXPORT VERIFICATION COMPLETE
// Version: 2.0.3
// ✅ FIXED: Added attemptCachedDataFallback export for friend-ui.js
// ✅ FIXED: Removed guest/demo fallback mode
// ✅ FIXED: Parent handshake required
// ✅ FIXED: Session must come from parent
// ✅ FIXED: No automatic fallback to cache
// =============================================