// =============================================
// STATUS SYSTEM - CENTRALIZED TOKEN ACCESS - CORE
// HARDENED VERSION v2.2 - COMPLETE FIXED VERSION
// =============================================
// EXPORT CONTRACT: ALL SYMBOLS REQUIRED BY status-ui.js
// =============================================

// =============================================
// SECURITY & SANDBOX CONFIGURATION
// =============================================
const TRUSTED_ORIGINS = new Set([
    window.location.origin,
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'https://127.0.0.1:5500',
    'https://localhost:5500',
    'https://127.0.0.1:3000',
    'https://localhost:3000'
]);

const MESSAGE_TYPES = {
    READY: 'STATUS_READY',
    ACK: 'STATUS_ACK',
    SESSION: 'STATUS_SESSION',
    SESSION_DATA: 'SESSION_DATA',
    DATA: 'STATUS_DATA',
    ERROR: 'STATUS_ERROR',
    HEARTBEAT: 'STATUS_HEARTBEAT',
    STATUS: 'STATUS_UPDATE',
    REQUEST_SESSION: 'STATUS_REQUEST_SESSION',
    CHILD_LOADED: 'STATUS_CHILD_LOADED',
    UI_READY: 'STATUS_UI_READY',
    NEEDS_AUTH: 'STATUS_NEEDS_AUTH',
    API_REQUEST: 'API_REQUEST',
    API_RESPONSE: 'API_RESPONSE',
    API_ERROR: 'API_ERROR',
    AUTH_VALIDATED: 'AUTH_VALIDATED',
    SESSION_UPDATE: 'SESSION_UPDATE',
    LOGOUT: 'LOGOUT',
    IFRAME_READY: 'IFRAME_READY',
    STATUS_SHUTDOWN: 'STATUS_SHUTDOWN',
    USER_ACTIVE: 'USER_ACTIVE',
    USER_INACTIVE: 'USER_INACTIVE',
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
    HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
    PARENT_READY: 'PARENT_READY'
};

const LOG_LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// =============================================
// GLOBAL STATE - MODULE SCOPED
// =============================================
const state = {
    initialized: false,
    parentDetected: false,
    handshakeComplete: false,
    sessionActive: false,
    permissionsGranted: ['guest', 'view_statuses'],
    dependenciesLoaded: false,
    readyState: 'preflight',
    shutdownInProgress: false,
    
    // Session Mirror Layer
    sessionMirror: {
        token: null,
        user: null,
        expiry: null,
        permissions: [],
        timestamp: 0,
        messageId: null,
        validated: false,
        source: null
    },
    
    sessionData: null,
    token: null,
    user: null,
    isGuestMode: true,
    sessionExpiry: null,
    
    messageId: 0,
    pendingAcks: new Map(),
    pendingRequests: new Map(),
    messageCache: new Set(),
    messageSequence: new Map(),
    originValidated: false,
    
    listeners: new Set(),
    intervals: new Set(),
    timeouts: new Set(),
    
    features: new Map(),
    disabledFeatures: new Set(),
    
    metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        handshakeAttempts: 0,
        errorsLogged: 0,
        startTime: Date.now(),
        lastHandshake: 0,
        handshakeFailures: 0
    },
    
    // Handshake tracking
    handshakeId: null,
    handshakePromise: null,
    handshakeResolve: null,
    handshakeReject: null,
    handshakeTimer: null,
    handshakeRetries: 0,
    maxHandshakeRetries: 3,
    
    // Protocol version
    protocolVersion: '2.0',
    parentProtocolVersion: null
};

const CIRCUIT_BREAKER = {
    failures: {},
    threshold: 5,
    timeout: 30000,
    lastFailure: {}
};

// =============================================
// LOGGING SYSTEM - STRUCTURED, NO SPAM
// =============================================
let currentLogLevel = LOG_LEVEL.INFO;
const errorCache = new Set();
const warningCache = new Set();
const metricCache = {
    lastHeartbeat: null,
    messagesPerMinute: 0,
    errorRate: 0
};

function log(level, module, message, data = null) {
    try {
        if (level < currentLogLevel) return;
        
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${module}]`;
        
        if (level === LOG_LEVEL.ERROR) {
            const key = `${module}:${message}`;
            if (!errorCache.has(key)) {
                errorCache.add(key);
                console.error(`${prefix} ${message}`, data || '');
                state.metrics.errorsLogged++;
            }
        } else if (level === LOG_LEVEL.WARN) {
            const key = `${module}:${message}`;
            if (!warningCache.has(key)) {
                warningCache.add(key);
                console.warn(`${prefix} ${message}`, data || '');
            }
        } else if (level === LOG_LEVEL.DEBUG) {
            console.debug(`${prefix} ${message}`, data || '');
        } else {
            console.log(`${prefix} ${message}`, data || '');
        }
    } catch (e) {}
}

// =============================================
// ERROR BOUNDARY SYSTEM
// =============================================
function createErrorBoundary(fn, featureName, fallback = null) {
    return async function(...args) {
        if (state.disabledFeatures.has(featureName)) {
            return typeof fallback === 'function' ? fallback(...args) : fallback;
        }

        try {
            return await fn(...args);
        } catch (error) {
            log(LOG_LEVEL.ERROR, 'ErrorBoundary', `${featureName}: ${error.message}`);
            
            state.disabledFeatures.add(featureName);
            
            const key = featureName.split(':')[0];
            CIRCUIT_BREAKER.failures[key] = (CIRCUIT_BREAKER.failures[key] || 0) + 1;
            CIRCUIT_BREAKER.lastFailure[key] = Date.now();
            
            return typeof fallback === 'function' ? fallback(...args) : fallback;
        }
    };
}

function isCircuitOpen(service) {
    const failures = CIRCUIT_BREAKER.failures[service] || 0;
    const lastFailure = CIRCUIT_BREAKER.lastFailure[service] || 0;
    const timeSinceFailure = Date.now() - lastFailure;
    
    if (failures >= CIRCUIT_BREAKER.threshold && timeSinceFailure < CIRCUIT_BREAKER.timeout) {
        return true;
    }
    
    if (timeSinceFailure >= CIRCUIT_BREAKER.timeout) {
        CIRCUIT_BREAKER.failures[service] = 0;
        return false;
    }
    
    return false;
}

// =============================================
// SECURE STORAGE ABSTRACTION
// =============================================
const SecureStorage = {
    memoryStore: new Map(),
    storageAvailable: true,
    
    init() {
        try {
            const testKey = '_kynecta_test_';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            this.storageAvailable = true;
        } catch (e) {
            this.storageAvailable = false;
            log(LOG_LEVEL.WARN, 'Storage', 'localStorage unavailable, using memory fallback');
        }
        return this;
    },
    
    get(key, fallback = null) {
        if (this.storageAvailable) {
            try {
                const value = localStorage.getItem(key);
                if (value !== null) return value;
            } catch (e) {
                log(LOG_LEVEL.WARN, 'Storage', `Error reading ${key} from localStorage`);
            }
        }
        return this.memoryStore.has(key) ? this.memoryStore.get(key) : fallback;
    },
    
    set(key, value) {
        let success = false;
        if (this.storageAvailable) {
            try {
                localStorage.setItem(key, String(value));
                success = true;
            } catch (e) {
                log(LOG_LEVEL.WARN, 'Storage', `Error writing ${key} to localStorage`);
            }
        }
        this.memoryStore.set(key, String(value));
        return success;
    },
    
    remove(key) {
        if (this.storageAvailable) {
            try {
                localStorage.removeItem(key);
            } catch (e) {}
        }
        this.memoryStore.delete(key);
    },
    
    getJSON(key, fallback = null) {
        const value = this.get(key);
        if (!value) return fallback;
        try {
            return JSON.parse(value);
        } catch (e) {
            return fallback;
        }
    },
    
    setJSON(key, value) {
        try {
            return this.set(key, JSON.stringify(value));
        } catch (e) {
            return false;
        }
    },
    
    clear() {
        this.memoryStore.clear();
        if (this.storageAvailable) {
            try {
                localStorage.clear();
            } catch (e) {}
        }
    }
}.init();

// =============================================
// MESSAGE FIREWALL & PARSER
// =============================================
const MessageFirewall = {
    validators: new Map(),
    replayCache: new Set(),
    maxCacheSize: 1000,
    
    init() {
        this.registerValidators();
        return this;
    },
    
    registerValidators() {
        this.validators.set('SESSION_DATA', (msg) => {
            return msg.payload && 
                   (msg.payload.token || msg.payload.user) &&
                   (!msg.payload.token || typeof msg.payload.token === 'string') &&
                   (!msg.payload.user || (msg.payload.user.id && msg.payload.user.displayName));
        });
        
        this.validators.set('HANDSHAKE_REQUEST', (msg) => {
            return msg.payload && 
                   msg.payload.messageId &&
                   msg.payload.protocolVersion;
        });
        
        this.validators.set('HANDSHAKE_RESPONSE', (msg) => {
            return msg.payload && 
                   msg.payload.messageId &&
                   msg.payload.session;
        });
        
        this.validators.set('STATUS_ACK', (msg) => {
            return msg.inResponseTo || msg.payload?.inResponseTo;
        });
        
        this.validators.set('STATUS_READY', (msg) => {
            return msg.payload && msg.payload.module === 'status';
        });
        
        this.validators.set('API_REQUEST', (msg) => {
            return msg.payload && msg.payload.requestId && msg.payload.endpoint;
        });
        
        this.validators.set('API_RESPONSE', (msg) => {
            return msg.payload && msg.payload.requestId;
        });
        
        this.validators.set('API_ERROR', (msg) => {
            return msg.payload && msg.payload.requestId;
        });
    },
    
    validate(message, origin) {
        try {
            // Structural validation
            if (!message || typeof message !== 'object') {
                log(LOG_LEVEL.WARN, 'Firewall', 'Invalid message structure');
                return false;
            }
            
            // Origin validation
            if (!isValidOrigin(origin)) {
                log(LOG_LEVEL.WARN, 'Firewall', `Invalid origin: ${origin}`);
                return false;
            }
            
            // Required fields
            if (!message.type) {
                log(LOG_LEVEL.WARN, 'Firewall', 'Missing message type');
                return false;
            }
            
            // Replay protection
            if (message.messageId || message.id) {
                const msgId = message.messageId || message.id;
                const cacheKey = `${origin}:${msgId}`;
                
                if (this.replayCache.has(cacheKey)) {
                    log(LOG_LEVEL.WARN, 'Firewall', `Replay detected: ${msgId}`);
                    return false;
                }
                
                this.replayCache.add(cacheKey);
                if (this.replayCache.size > this.maxCacheSize) {
                    const first = this.replayCache.values().next().value;
                    this.replayCache.delete(first);
                }
            }
            
            // Schema validation
            const validator = this.validators.get(message.type);
            if (validator && !validator(message)) {
                log(LOG_LEVEL.WARN, 'Firewall', `Schema validation failed for ${message.type}`);
                return false;
            }
            
            return true;
        } catch (e) {
            log(LOG_LEVEL.ERROR, 'Firewall', `Validation error: ${e.message}`);
            return false;
        }
    },
    
    sanitize(message) {
        try {
            const sanitized = { ...message };
            
            // Sanitize strings
            if (sanitized.payload) {
                sanitized.payload = JSON.parse(JSON.stringify(sanitized.payload, (key, value) => {
                    if (typeof value === 'string') {
                        return value
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/&/g, '&amp;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#039;');
                    }
                    return value;
                }));
            }
            
            // Redact tokens for logging
            if (sanitized.payload && sanitized.payload.token) {
                sanitized.payload.token = '[REDACTED]';
            }
            if (sanitized.token) {
                sanitized.token = '[REDACTED]';
            }
            
            return sanitized;
        } catch (e) {
            return message;
        }
    }
}.init();

// =============================================
// MESSAGE ID GENERATOR
// =============================================
function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${++state.messageId}`;
}

function generateSequenceId() {
    return `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateHandshakeId() {
    return `handshake_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

// =============================================
// ORIGIN VALIDATION & SECURITY
// =============================================
function isValidOrigin(origin) {
    try {
        if (!origin) return false;
        if (origin === window.location.origin) return true;
        if (TRUSTED_ORIGINS.has(origin)) return true;
        
        for (const trusted of TRUSTED_ORIGINS) {
            if (origin.endsWith(trusted.replace(/^https?:\/\//, ''))) {
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

function validateMessage(message, origin) {
    return MessageFirewall.validate(message, origin);
}

function signMessage(message) {
    return {
        ...message,
        id: generateMessageId(),
        messageId: generateMessageId(),
        timestamp: Date.now(),
        origin: window.location.origin,
        signature: btoa(`${message.type}:${Date.now()}:${state.messageId}`),
        protocolVersion: state.protocolVersion
    };
}

// =============================================
// COMMUNICATION ENGINE - WITH ACK/RETRY
// =============================================
const messageHandlers = new Map();

function addMessageHandler(type, handler) {
    if (!messageHandlers.has(type)) {
        messageHandlers.set(type, []);
    }
    messageHandlers.get(type).push(createErrorBoundary(handler, `Message:${type}`));
}

function removeMessageHandler(type, handler) {
    if (!messageHandlers.has(type)) return;
    const handlers = messageHandlers.get(type);
    const index = handlers.indexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
}

const receiveFromParent = createErrorBoundary(async function(event) {
    try {
        if (!validateMessage(event.data, event.origin)) {
            return;
        }
        
        const message = MessageFirewall.sanitize(event.data);
        state.metrics.messagesReceived++;
        
        // Update parent protocol version
        if (message.protocolVersion) {
            state.parentProtocolVersion = message.protocolVersion;
        }
        
        // Handle ACK messages
        if ((message.type === MESSAGE_TYPES.ACK || message.type === 'ACK') && 
            (message.inResponseTo || message.payload?.inResponseTo)) {
            const responseTo = message.inResponseTo || message.payload.inResponseTo;
            const ackHandler = state.pendingAcks.get(responseTo);
            if (ackHandler) {
                ackHandler.resolve(message);
                state.pendingAcks.delete(responseTo);
                if (ackHandler.timer) clearTimeout(ackHandler.timer);
            }
            return;
        }
        
        // Handle legacy ACK format
        if (message.type === 'STATUS_ACK' && message.inResponseTo) {
            const ackHandler = state.pendingAcks.get(message.inResponseTo);
            if (ackHandler) {
                ackHandler.resolve(message);
                state.pendingAcks.delete(message.inResponseTo);
                if (ackHandler.timer) clearTimeout(ackHandler.timer);
            }
            return;
        }
        
        const handlers = messageHandlers.get(message.type) || [];
        for (const handler of handlers) {
            handler(message, event.origin);
        }
        
    } catch (e) {
        log(LOG_LEVEL.ERROR, 'Receive', e.message);
    }
}, 'receiveFromParent', null);

const sendToParent = createErrorBoundary(async function(type, payload = {}, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            if (!state.parentDetected || !window.parent || window.parent === window) {
                if (!options.silent) {
                    log(LOG_LEVEL.WARN, 'Send', 'Parent not available');
                }
                resolve(null);
                return;
            }
            
            if (isCircuitOpen('sendToParent')) {
                log(LOG_LEVEL.WARN, 'Send', 'Circuit breaker open, skipping');
                resolve(null);
                return;
            }
            
            const message = signMessage({
                type,
                payload,
                source: 'status-core',
                requiresAck: options.requiresAck !== false,
                inResponseTo: options.inResponseTo,
                messageId: options.messageId || generateMessageId(),
                protocolVersion: state.protocolVersion
            });
            
            state.metrics.messagesSent++;
            
            if (message.requiresAck) {
                const timeout = options.timeout || 5000;
                const timer = setTimeout(() => {
                    if (state.pendingAcks.has(message.id)) {
                        const handler = state.pendingAcks.get(message.id);
                        handler.reject(new Error('ACK timeout'));
                        state.pendingAcks.delete(message.id);
                        CIRCUIT_BREAKER.failures.sendToParent = (CIRCUIT_BREAKER.failures.sendToParent || 0) + 1;
                        
                        log(LOG_LEVEL.WARN, 'Send', `ACK timeout for ${type} (${message.id})`);
                    }
                }, timeout);
                
                state.pendingAcks.set(message.id, {
                    resolve,
                    reject,
                    timer,
                    timestamp: Date.now(),
                    type
                });
            }
            
            window.parent.postMessage(message, '*');
            
            if (!message.requiresAck) {
                resolve({ success: true, id: message.id });
            }
            
            // Cleanup old pending acks
            const now = Date.now();
            for (const [id, handler] of state.pendingAcks.entries()) {
                if (now - handler.timestamp > 30000) {
                    clearTimeout(handler.timer);
                    state.pendingAcks.delete(id);
                }
            }
            
        } catch (e) {
            log(LOG_LEVEL.ERROR, 'Send', e.message);
            reject(e);
        }
    });
}, 'sendToParent', null);

// =============================================
// HANDSHAKE CLIENT - COMPLETE IMPLEMENTATION
// =============================================
const HandshakeClient = {
    status: 'idle', // idle, in-progress, complete, failed
    handshakeId: null,
    startTime: null,
    resolve: null,
    reject: null,
    timer: null,
    retries: 0,
    maxRetries: 3,
    
    init() {
        this.reset();
        log(LOG_LEVEL.INFO, 'Handshake', 'Handshake client initialized');
        return this;
    },
    
    reset() {
        this.status = 'idle';
        this.handshakeId = null;
        this.startTime = null;
        this.resolve = null;
        this.reject = null;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.retries = 0;
    },
    
    async execute(options = {}) {
        if (this.status === 'in-progress') {
            log(LOG_LEVEL.WARN, 'Handshake', 'Handshake already in progress');
            return state.handshakePromise;
        }
        
        if (state.handshakeComplete) {
            log(LOG_LEVEL.INFO, 'Handshake', 'Handshake already complete');
            return { success: true, cached: true };
        }
        
        this.reset();
        this.status = 'in-progress';
        this.handshakeId = generateHandshakeId();
        this.startTime = Date.now();
        this.maxRetries = options.maxRetries || 3;
        
        log(LOG_LEVEL.INFO, 'Handshake', `Starting handshake ${this.handshakeId} (attempt ${this.retries + 1}/${this.maxRetries})`);
        
        state.handshakeId = this.handshakeId;
        state.handshakePromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            
            this.sendHandshakeRequest();
        });
        
        return state.handshakePromise;
    },
    
    sendHandshakeRequest() {
        const payload = {
            messageId: this.handshakeId,
            timestamp: Date.now(),
            protocolVersion: state.protocolVersion,
            module: 'status',
            session: {
                cached: state.sessionMirror.validated,
                token: state.sessionMirror.token ? 'present' : 'none',
                timestamp: state.sessionMirror.timestamp
            }
        };
        
        const timeout = this.retries === 0 ? 3000 : 5000;
        
        this.timer = setTimeout(() => {
            this.handleTimeout();
        }, timeout);
        
        sendToParent(MESSAGE_TYPES.HANDSHAKE_REQUEST, payload, { 
            requiresAck: false,
            messageId: this.handshakeId
        }).catch(e => {
            log(LOG_LEVEL.ERROR, 'Handshake', `Send failed: ${e.message}`);
        });
    },
    
    handleTimeout() {
        this.retries++;
        
        if (this.retries < this.maxRetries) {
            log(LOG_LEVEL.WARN, 'Handshake', `Attempt ${this.retries}/${this.maxRetries} timed out, retrying...`);
            
            const delay = Math.min(500 * Math.pow(1.5, this.retries), 3000);
            setTimeout(() => {
                this.sendHandshakeRequest();
            }, delay);
        } else {
            this.status = 'failed';
            log(LOG_LEVEL.ERROR, 'Handshake', `Handshake failed after ${this.maxRetries} attempts`);
            
            if (this.reject) {
                this.reject(new Error('Handshake timeout'));
            }
            
            state.metrics.handshakeFailures++;
            
            // Attempt legacy handshake
            this.attemptLegacyHandshake();
        }
    },
    
    handleResponse(message) {
        if (this.status !== 'in-progress') return;
        
        clearTimeout(this.timer);
        
        const payload = message.payload || message.data || {};
        
        // Validate response
        if (payload.messageId !== this.handshakeId) {
            log(LOG_LEVEL.WARN, 'Handshake', `Message ID mismatch: expected ${this.handshakeId}, got ${payload.messageId}`);
            return;
        }
        
        // Process session data
        if (payload.session) {
            updateSessionMirror(payload.session, 'handshake');
        }
        
        this.status = 'complete';
        state.handshakeComplete = true;
        state.parentProtocolVersion = payload.protocolVersion || '1.0';
        state.metrics.lastHandshake = Date.now();
        
        log(LOG_LEVEL.INFO, 'Handshake', `Handshake complete in ${Date.now() - this.startTime}ms (protocol: ${state.parentProtocolVersion})`);
        
        if (this.resolve) {
            this.resolve({ 
                success: true, 
                session: payload.session,
                protocolVersion: state.parentProtocolVersion
            });
        }
        
        // Send acknowledgment
        sendToParent(MESSAGE_TYPES.ACK, {
            inResponseTo: this.handshakeId,
            status: 'success',
            timestamp: Date.now()
        }, { requiresAck: false }).catch(() => {});
    },
    
    attemptLegacyHandshake() {
        log(LOG_LEVEL.INFO, 'Handshake', 'Attempting legacy handshake');
        
        // Try multiple legacy message types
        const messages = [
            { type: MESSAGE_TYPES.READY, payload: { module: 'status', timestamp: Date.now(), version: '1.0' } },
            { type: MESSAGE_TYPES.IFRAME_READY, payload: { module: 'status', timestamp: Date.now() } },
            { type: MESSAGE_TYPES.CHILD_LOADED, payload: { module: 'status', timestamp: Date.now() } }
        ];
        
        messages.forEach(msg => {
            sendToParent(msg.type, msg.payload, { requiresAck: false }).catch(() => {});
        });
        
        // Set a longer timeout for legacy handshake
        setTimeout(() => {
            if (!state.handshakeComplete && state.parentDetected) {
                log(LOG_LEVEL.WARN, 'Handshake', 'Legacy handshake timeout, enabling guest mode');
                enableGuestMode();
            }
        }, 5000);
    },
    
    handleSessionInit(message) {
        const payload = message.payload || message.data || {};
        
        if (payload.token || payload.user) {
            updateSessionMirror(payload, 'session_init');
            
            // Send ACK with same messageId
            if (message.messageId || message.id) {
                sendToParent(MESSAGE_TYPES.ACK, {
                    inResponseTo: message.messageId || message.id,
                    status: 'success',
                    timestamp: Date.now()
                }, { requiresAck: false }).catch(() => {});
            }
        }
    }
}.init();

// =============================================
// SESSION MIRROR LAYER
// =============================================
function updateSessionMirror(sessionData, source = 'parent') {
    try {
        if (!sessionData) return false;
        
        const previousState = { ...state.sessionMirror };
        
        // Update token if provided
        if (sessionData.token && typeof sessionData.token === 'string') {
            state.sessionMirror.token = sessionData.token;
            state.token = sessionData.token;
        }
        
        // Update user if provided
        if (sessionData.user) {
            state.sessionMirror.user = {
                id: sessionData.user.id || sessionData.user.userId,
                displayName: sessionData.user.displayName || sessionData.user.name,
                photoURL: sessionData.user.photoURL || sessionData.user.avatar,
                email: sessionData.user.email,
                isGuest: sessionData.user.isGuest || false
            };
            state.user = state.sessionMirror.user;
        }
        
        // Update permissions
        if (sessionData.permissions && Array.isArray(sessionData.permissions)) {
            state.sessionMirror.permissions = [...sessionData.permissions];
            state.permissionsGranted = [...sessionData.permissions];
        }
        
        // Update expiry
        if (sessionData.expiry) {
            state.sessionMirror.expiry = new Date(sessionData.expiry);
            state.sessionExpiry = state.sessionMirror.expiry;
        }
        
        // Update metadata
        state.sessionMirror.timestamp = Date.now();
        state.sessionMirror.source = source;
        state.sessionMirror.messageId = sessionData.messageId || sessionData.id;
        
        // Validate session
        if (state.sessionMirror.token && state.sessionMirror.user) {
            state.sessionMirror.validated = true;
            state.sessionActive = true;
            state.isGuestMode = false;
            
            log(LOG_LEVEL.INFO, 'Session', `Session mirror updated from ${source}`, {
                user: state.sessionMirror.user?.id,
                hasToken: !!state.sessionMirror.token
            });
            
            // Cache session
            if (SecureStorage.storageAvailable) {
                SecureStorage.setJSON(UNIFIED_TOKEN_KEY, state.sessionMirror.token);
                SecureStorage.setJSON(LOCAL_STORAGE_KEYS.USER, state.sessionMirror.user);
            }
            
            // Trigger callbacks
            isTokenReady = true;
            triggerTokenReadyCallbacks();
            processPendingApiRequests();
            
            return true;
        }
        
        return false;
    } catch (error) {
        safeLogError('Session', 'updateSessionMirror', error);
        return false;
    }
}

function getSessionMirror() {
    return {
        ...state.sessionMirror,
        user: state.sessionMirror.user ? { ...state.sessionMirror.user } : null
    };
}

function isSessionMirrorValid() {
    if (!state.sessionMirror.validated) return false;
    if (!state.sessionMirror.token || !state.sessionMirror.user) return false;
    if (state.sessionMirror.expiry && new Date() >= state.sessionMirror.expiry) return false;
    return true;
}

// =============================================
// PARENT AVAILABILITY DETECTION
// =============================================
const ParentDetector = {
    status: 'unknown', // unknown, available, unavailable, degraded
    checkCount: 0,
    maxChecks: 5,
    checkInterval: null,
    
    detect() {
        return new Promise((resolve) => {
            this.status = 'checking';
            this.checkCount = 0;
            
            const check = () => {
                this.checkCount++;
                
                const isAvailable = this.checkAvailability();
                
                if (isAvailable) {
                    this.status = 'available';
                    state.parentDetected = true;
                    
                    if (this.checkInterval) {
                        clearInterval(this.checkInterval);
                        this.checkInterval = null;
                    }
                    
                    log(LOG_LEVEL.INFO, 'Parent', 'Parent detected and available');
                    resolve(true);
                    return;
                }
                
                if (this.checkCount >= this.maxChecks) {
                    this.status = 'unavailable';
                    state.parentDetected = false;
                    
                    if (this.checkInterval) {
                        clearInterval(this.checkInterval);
                        this.checkInterval = null;
                    }
                    
                    log(LOG_LEVEL.WARN, 'Parent', 'Parent not available after max checks');
                    resolve(false);
                    return;
                }
            };
            
            // First check immediately
            check();
            
            // Then check every 100ms
            this.checkInterval = setInterval(check, 100);
        });
    },
    
    checkAvailability() {
        try {
            // Check if in iframe
            if (window.self === window.top) {
                return false;
            }
            
            // Check if parent accessible
            if (!window.parent || window.parent === window) {
                return false;
            }
            
            // Check postMessage availability
            if (typeof window.parent.postMessage !== 'function') {
                return false;
            }
            
            return true;
        } catch (e) {
            // Cross-origin errors indicate parent exists but is cross-origin
            if (e.name === 'SecurityError') {
                return true;
            }
            return false;
        }
    },
    
    isAvailable() {
        return this.status === 'available';
    },
    
    reset() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.status = 'unknown';
        this.checkCount = 0;
    }
};

// =============================================
// INITIALIZATION PIPELINE - PREFLIGHT → READY
// =============================================
async function preflightStage() {
    log(LOG_LEVEL.INFO, 'Init', 'Preflight stage');
    try {
        if (typeof window === 'undefined') throw new Error('Window not available');
        if (typeof document === 'undefined') throw new Error('Document not available');
        return { success: true };
    } catch (error) {
        log(LOG_LEVEL.ERROR, 'Init', `Preflight failed: ${error.message}`);
        return { success: false, fallback: true };
    }
}

async function dependencyCheckStage() {
    log(LOG_LEVEL.INFO, 'Init', 'Dependency check stage');
    try {
        const requiredApis = ['localStorage', 'postMessage', 'addEventListener'];
        const missing = requiredApis.filter(api => typeof window[api] === 'undefined');
        
        if (missing.length > 0) {
            log(LOG_LEVEL.WARN, 'Init', `Missing dependencies: ${missing.join(', ')}`);
            state.dependenciesLoaded = false;
            return { success: false, fallback: true, missing };
        }
        
        state.dependenciesLoaded = true;
        return { success: true };
    } catch (error) {
        log(LOG_LEVEL.ERROR, 'Init', `Dependency check failed: ${error.message}`);
        state.dependenciesLoaded = false;
        return { success: false, fallback: true };
    }
}

async function parentDetectStage(timeout = 2000) {
    log(LOG_LEVEL.INFO, 'Init', 'Parent detect stage');
    
    const detected = await ParentDetector.detect();
    
    if (detected) {
        return { success: true };
    } else {
        log(LOG_LEVEL.WARN, 'Init', 'Parent not detected');
        return { success: false, fallback: true };
    }
}

async function handshakeStage(options = {}) {
    log(LOG_LEVEL.INFO, 'Init', 'Handshake stage');
    
    if (!state.parentDetected) {
        log(LOG_LEVEL.WARN, 'Init', 'Parent not detected, skipping handshake');
        state.handshakeComplete = false;
        return { success: false, fallback: true };
    }
    
    try {
        const result = await HandshakeClient.execute({
            maxRetries: options.maxRetries || 3
        });
        
        if (result && result.success) {
            return { success: true };
        }
    } catch (error) {
        log(LOG_LEVEL.ERROR, 'Init', `Handshake failed: ${error.message}`);
    }
    
    state.handshakeComplete = false;
    return { success: false, fallback: true };
}

async function sessionSyncStage(timeout = 5000) {
    log(LOG_LEVEL.INFO, 'Init', 'Session sync stage');
    
    if (!state.handshakeComplete || !state.parentDetected) {
        if (state.sessionMirror.validated) {
            log(LOG_LEVEL.INFO, 'Init', 'Using cached session mirror');
            activateSessionFromMirror();
            return { success: true, guestMode: false, cached: true };
        }
        
        log(LOG_LEVEL.WARN, 'Init', 'Handshake incomplete, enabling guest mode');
        enableGuestMode();
        return { success: false, guestMode: true };
    }
    
    try {
        const sessionPromise = new Promise(async (resolveSession) => {
            const handler = (message) => {
                const payload = message.payload || message.data || {};
                
                if (message.type === MESSAGE_TYPES.SESSION || 
                    message.type === MESSAGE_TYPES.SESSION_DATA ||
                    message.type === MESSAGE_TYPES.SESSION_UPDATE) {
                    
                    removeMessageHandler(MESSAGE_TYPES.SESSION, handler);
                    removeMessageHandler(MESSAGE_TYPES.SESSION_DATA, handler);
                    removeMessageHandler(MESSAGE_TYPES.SESSION_UPDATE, handler);
                    
                    resolveSession(payload);
                }
            };
            
            addMessageHandler(MESSAGE_TYPES.SESSION, handler);
            addMessageHandler(MESSAGE_TYPES.SESSION_DATA, handler);
            addMessageHandler(MESSAGE_TYPES.SESSION_UPDATE, handler);
            
            await sendToParent(MESSAGE_TYPES.REQUEST_SESSION, {
                module: 'status',
                timestamp: Date.now(),
                handshakeId: state.handshakeId
            }, { requiresAck: false });
        });
        
        const timeoutPromise = new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('Session timeout')), timeout);
            state.timeouts.add(timer);
        });
        
        const sessionData = await Promise.race([sessionPromise, timeoutPromise]).catch(() => null);
        
        if (sessionData && (sessionData.token || sessionData.user)) {
            updateSessionMirror(sessionData, 'session_sync');
            activateSessionFromMirror();
            
            log(LOG_LEVEL.INFO, 'Init', 'Authenticated session established');
            return { success: true, guestMode: false, user: state.user };
        }
    } catch (error) {
        log(LOG_LEVEL.ERROR, 'Init', `Session sync failed: ${error.message}`);
    }
    
    if (state.sessionMirror.validated) {
        log(LOG_LEVEL.INFO, 'Init', 'Falling back to cached session mirror');
        activateSessionFromMirror();
        return { success: true, guestMode: false, cached: true };
    }
    
    enableGuestMode();
    return { success: false, guestMode: true };
}

function activateSessionFromMirror() {
    if (!state.sessionMirror.validated) return false;
    
    state.sessionActive = true;
    state.isGuestMode = false;
    state.token = state.sessionMirror.token;
    state.user = state.sessionMirror.user;
    state.permissionsGranted = state.sessionMirror.permissions.length > 0 ? 
        state.sessionMirror.permissions : ['view_statuses', 'create_status'];
    state.sessionData = {
        user: state.user,
        token: state.token,
        permissions: state.permissionsGranted,
        expiry: state.sessionMirror.expiry
    };
    
    log(LOG_LEVEL.INFO, 'Session', 'Activated from mirror', {
        user: state.user?.id,
        hasToken: !!state.token
    });
    
    return true;
}

async function serviceInitStage() {
    log(LOG_LEVEL.INFO, 'Init', 'Service init stage');
    try {
        const cachedSession = loadCachedSession();
        if (cachedSession && !state.sessionActive && !state.sessionMirror.validated) {
            updateSessionMirror(cachedSession, 'cache');
        }
        
        return { success: true };
    } catch (error) {
        log(LOG_LEVEL.ERROR, 'Init', `Service init failed: ${error.message}`);
        return { success: false, fallback: true };
    }
}

function readyStage() {
    log(LOG_LEVEL.INFO, 'Init', 'Ready stage');
    state.initialized = true;
    state.readyState = 'ready';
    
    window.addEventListener('message', receiveFromParent);
    state.listeners.add({ type: 'message', handler: receiveFromParent });
    
    startHeartbeat();
    
    return { success: true, state: state.readyState, guestMode: state.isGuestMode };
}

const initializeCore = createErrorBoundary(async function(options = {}) {
    if (state.initialized) {
        log(LOG_LEVEL.WARN, 'Core', 'Already initialized');
        return { success: true, state: state.readyState };
    }
    
    log(LOG_LEVEL.INFO, 'Core', 'Starting initialization pipeline');
    
    try {
        state.readyState = 'preflight';
        await preflightStage();
        
        state.readyState = 'dependencyCheck';
        await dependencyCheckStage();
        
        state.readyState = 'parentDetect';
        await parentDetectStage(options.parentTimeout || 2000);
        
        state.readyState = 'handshake';
        await handshakeStage({ maxRetries: options.handshakeRetries || 3 });
        
        state.readyState = 'sessionSync';
        await sessionSyncStage(options.sessionTimeout || 5000);
        
        state.readyState = 'serviceInit';
        await serviceInitStage();
        
        state.readyState = 'ready';
        return readyStage();
        
    } catch (error) {
        log(LOG_LEVEL.ERROR, 'Core', `Initialization failed: ${error.message}`);
        
        if (state.sessionMirror.validated) {
            activateSessionFromMirror();
        } else {
            enableGuestMode();
        }
        
        state.initialized = true;
        state.readyState = 'ready';
        return { success: false, state: 'ready', guestMode: state.isGuestMode };
    }
}, 'initializeCore', { success: false, guestMode: true });

const startHandshake = createErrorBoundary(async function(options = { retries: 3 }) {
    return handshakeStage({ maxRetries: options.retries });
}, 'startHandshake', { success: false });

const requestSession = createErrorBoundary(async function(options = { timeout: 5000 }) {
    return sessionSyncStage(options.timeout);
}, 'requestSession', { guestMode: true });

function enableGuestMode() {
    if (state.isGuestMode) return;
    
    state.isGuestMode = true;
    state.sessionActive = false;
    state.permissionsGranted = ['guest', 'view_statuses'];
    state.sessionData = {
        user: { id: 'guest', displayName: 'Guest', isGuest: true },
        permissions: ['guest', 'view_statuses'],
        guestMode: true
    };
    state.user = state.sessionData.user;
    state.token = null;
    
    // Update mirror but mark as not validated
    state.sessionMirror = {
        ...state.sessionMirror,
        validated: false,
        guestMode: true
    };
    
    log(LOG_LEVEL.INFO, 'Guest', 'Guest mode enabled');
}

function loadCachedSession() {
    try {
        const userData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.USER);
        const token = getUnifiedToken();
        
        if (userData && token) {
            const user = userData;
            if (user && user.id) {
                return { user, token, permissions: ['view_statuses'] };
            }
        }
    } catch (error) {
        log(LOG_LEVEL.ERROR, 'Session', `Failed to load cached session: ${error.message}`);
    }
    return null;
}

function startHeartbeat() {
    const interval = setInterval(async () => {
        try {
            if (!state.parentDetected || !state.handshakeComplete) return;
            
            metricCache.lastHeartbeat = Date.now();
            
            await sendToParent(MESSAGE_TYPES.HEARTBEAT, {
                timestamp: Date.now(),
                readyState: state.readyState,
                guestMode: state.isGuestMode,
                sessionValid: isSessionMirrorValid(),
                metrics: {
                    messagesSent: state.metrics.messagesSent,
                    messagesReceived: state.metrics.messagesReceived,
                    uptime: Date.now() - state.metrics.startTime
                }
            }, { requiresAck: false, silent: true });
            
        } catch (e) {}
    }, 30000);
    
    state.intervals.add(interval);
}

// =============================================
// SHUTDOWN & RESOURCE MANAGEMENT
// =============================================
const shutdownCore = createErrorBoundary(async function() {
    if (state.shutdownInProgress) return;
    
    state.shutdownInProgress = true;
    log(LOG_LEVEL.INFO, 'Core', 'Shutting down');
    
    try {
        state.intervals.forEach(clearInterval);
        state.intervals.clear();
        
        state.timeouts.forEach(clearTimeout);
        state.timeouts.clear();
        
        state.listeners.forEach(({ type, handler }) => {
            try {
                window.removeEventListener(type, handler);
            } catch (e) {}
        });
        state.listeners.clear();
        
        state.pendingAcks.forEach((handler) => {
            clearTimeout(handler.timer);
        });
        state.pendingAcks.clear();
        
        state.pendingRequests.clear();
        state.messageCache.clear();
        
        messageHandlers.clear();
        
        if (state.parentDetected && state.handshakeComplete) {
            await sendToParent(MESSAGE_TYPES.STATUS_SHUTDOWN, {
                timestamp: Date.now(),
                metrics: state.metrics
            }, { requiresAck: false, silent: true });
        }
        
        log(LOG_LEVEL.INFO, 'Core', 'Shutdown complete');
        
    } catch (error) {
        log(LOG_LEVEL.ERROR, 'Core', `Shutdown error: ${error.message}`);
    } finally {
        state.shutdownInProgress = false;
    }
}, 'shutdownCore', null);

// =============================================
// MESSAGE HANDLER REGISTRATION
// =============================================
addMessageHandler(MESSAGE_TYPES.ACK, (message) => {});
addMessageHandler(MESSAGE_TYPES.STATUS, (message) => {
    document.dispatchEvent(new CustomEvent('statusUpdate', {
        detail: message.payload
    }));
});
addMessageHandler(MESSAGE_TYPES.ERROR, (message) => {
    log(LOG_LEVEL.ERROR, 'Parent', 'Error from parent', message.payload);
});
addMessageHandler(MESSAGE_TYPES.DATA, (message) => {
    document.dispatchEvent(new CustomEvent('coreData', {
        detail: message.payload
    }));
});

// Handshake response handler
addMessageHandler(MESSAGE_TYPES.HANDSHAKE_RESPONSE, (message) => {
    HandshakeClient.handleResponse(message);
});

// Session handlers
addMessageHandler(MESSAGE_TYPES.SESSION, (message) => {
    HandshakeClient.handleSessionInit(message);
});
addMessageHandler(MESSAGE_TYPES.SESSION_DATA, (message) => {
    HandshakeClient.handleSessionInit(message);
});
addMessageHandler(MESSAGE_TYPES.SESSION_UPDATE, (message) => {
    const payload = message.payload || message.data || {};
    updateSessionMirror(payload, 'session_update');
});
addMessageHandler(MESSAGE_TYPES.AUTH_VALIDATED, (message) => {
    const payload = message.payload || message.data || {};
    if (payload.success) {
        isTokenReady = true;
        triggerTokenReadyCallbacks();
    }
});

// Parent ready handler
addMessageHandler(MESSAGE_TYPES.PARENT_READY, (message) => {
    log(LOG_LEVEL.INFO, 'Parent', 'Parent ready signal received');
    
    if (!state.handshakeComplete) {
        HandshakeClient.execute().catch(() => {});
    }
});

// Logout handler
addMessageHandler(MESSAGE_TYPES.LOGOUT, (message) => {
    log(LOG_LEVEL.INFO, 'Session', 'Logout received from parent');
    handleLogout(message.payload);
});

// API response handlers
addMessageHandler(MESSAGE_TYPES.API_RESPONSE, (message) => {
    handleApiResponse(message.payload);
});
addMessageHandler(MESSAGE_TYPES.API_ERROR, (message) => {
    handleApiError(message.payload);
});

// =============================================
// FEATURE ISOLATION SYSTEM
// =============================================
function registerFeature(name, implementation) {
    try {
        if (state.features.has(name)) {
            log(LOG_LEVEL.WARN, 'Feature', `Duplicate registration: ${name}`);
            return false;
        }
        
        const wrappedImplementation = createErrorBoundary(implementation, `Feature:${name}`, null);
        state.features.set(name, wrappedImplementation);
        log(LOG_LEVEL.DEBUG, 'Feature', `Registered: ${name}`);
        return true;
    } catch (e) {
        log(LOG_LEVEL.ERROR, 'Feature', `Registration failed ${name}: ${e.message}`);
        return false;
    }
}

function executeFeature(name, ...args) {
    try {
        if (isCircuitOpen(`feature:${name}`)) {
            log(LOG_LEVEL.WARN, 'Feature', `Circuit breaker open: ${name}`);
            return null;
        }
        
        if (state.disabledFeatures.has(name)) {
            return null;
        }
        
        const feature = state.features.get(name);
        if (!feature) {
            log(LOG_LEVEL.WARN, 'Feature', `Not found: ${name}`);
            return null;
        }
        
        return feature(...args);
    } catch (error) {
        log(LOG_LEVEL.ERROR, 'Feature', `Execution failed ${name}: ${error.message}`);
        state.disabledFeatures.add(name);
        return null;
    }
}

// =============================================
// SESSION & TOKEN MANAGEMENT
// =============================================
function getSession() {
    if (state.sessionMirror.validated) {
        return {
            active: true,
            user: state.sessionMirror.user,
            token: state.sessionMirror.token,
            expiry: state.sessionMirror.expiry,
            guestMode: false,
            permissions: [...state.sessionMirror.permissions],
            validated: true,
            source: state.sessionMirror.source
        };
    }
    
    return {
        active: state.sessionActive,
        user: state.user,
        token: state.token,
        expiry: state.sessionExpiry,
        guestMode: state.isGuestMode,
        permissions: [...state.permissionsGranted],
        validated: state.sessionMirror.validated
    };
}

function isSessionValid() {
    if (state.isGuestMode) return true;
    if (state.sessionMirror.validated) {
        if (!state.sessionMirror.expiry) return true;
        return new Date() < state.sessionMirror.expiry;
    }
    if (!state.sessionActive || !state.sessionExpiry) return false;
    return new Date() < state.sessionExpiry;
}

// =============================================
// HEALTH METRICS
// =============================================
function getHealthMetrics() {
    return {
        ...state.metrics,
        uptime: Date.now() - state.metrics.startTime,
        readyState: state.readyState,
        initialized: state.initialized,
        parentDetected: state.parentDetected,
        handshakeComplete: state.handshakeComplete,
        sessionActive: state.sessionActive,
        sessionMirrorValid: state.sessionMirror.validated,
        guestMode: state.isGuestMode,
        protocolVersion: state.protocolVersion,
        parentProtocolVersion: state.parentProtocolVersion,
        circuitBreakers: { ...CIRCUIT_BREAKER.failures },
        disabledFeatures: Array.from(state.disabledFeatures),
        pendingAcks: state.pendingAcks.size,
        pendingRequests: state.pendingRequests.size,
        features: state.features.size,
        messageCacheSize: state.messageCache.size,
        lastHeartbeat: metricCache.lastHeartbeat
    };
}

// =============================================
// PARENT COORDINATION - ENHANCED FOR UI REQUIREMENTS
// =============================================
const parentCoordinator = {
    isInitialized: false,
    handshakeComplete: false,
    sessionData: null,
    messageChannel: null,
    handshakeRetries: 0,
    maxHandshakeRetries: 10,
    handshakeInterval: null,
    parentOrigin: null,
    handshakeInProgress: false,
    sessionValid: false,
    handshakeTimeout: null,
    sessionRequestSent: false,
    trustedOrigins: TRUSTED_ORIGINS,
    lastMessageOrigin: null,
    sequenceId: null
};

function initializeParentCoordination() {
    if (parentCoordinator.isInitialized) return;
    
    try {
        if (!window.parent || window.parent === window) {
            handleParentUnavailable();
            return;
        }
        
        parentCoordinator.trustedOrigins.add(window.location.origin);
        parentCoordinator.parentOrigin = window.location.origin;
        
        window.removeEventListener('message', handleEnhancedParentMessage);
        window.addEventListener('message', handleEnhancedParentMessage);
        parentCoordinator.messageChannel = window;
        parentCoordinator.isInitialized = true;
        
        startSecureHandshake();
        
    } catch (error) {
        safeLogError('Status', 'initializeParentCoordination', error);
        handleParentUnavailable();
    }
}

function handleEnhancedParentMessage(event) {
    try {
        parentCoordinator.lastMessageOrigin = event.origin;
        
        if (!isValidOrigin(event.origin) && !parentCoordinator.trustedOrigins.has(event.origin)) {
            return;
        }
        
        if (!MessageFirewall.validate(event.data, event.origin)) {
            return;
        }
        
        const message = MessageFirewall.sanitize(event.data);
        
        const messageKey = `${message.type}:${message.messageId || message.id || 'no-id'}:${message.timestamp || Date.now()}`;
        if (state.messageCache.has(messageKey)) return;
        state.messageCache.add(messageKey);
        
        if (state.messageCache.size > 100) {
            const firstKey = state.messageCache.values().next().value;
            state.messageCache.delete(firstKey);
        }
        
        switch (message.type) {
            case 'SESSION_DATA':
            case MESSAGE_TYPES.SESSION:
            case MESSAGE_TYPES.SESSION_DATA:
            case MESSAGE_TYPES.SESSION_UPDATE:
                handleSecureSessionData(message);
                break;
            case 'SESSION_UPDATE':
                handleSessionUpdate(message.data || message.payload);
                break;
            case 'LOGOUT':
                handleLogout(message.data || message.payload);
                break;
            case 'API_RESPONSE':
                handleApiResponse(message.data || message.payload);
                break;
            case 'API_ERROR':
                handleApiError(message.data || message.payload);
                break;
            case 'AUTH_VALIDATED':
                handleAuthValidated(message.data || message.payload);
                break;
            case MESSAGE_TYPES.HANDSHAKE_RESPONSE:
                HandshakeClient.handleResponse(message);
                break;
        }
    } catch (error) {
        safeLogError('Status', 'handleEnhancedParentMessage', error);
    }
}

function startSecureHandshake() {
    try {
        clearSecureHandshake();
        requestSessionFromParent();
    } catch (error) {
        safeLogError('Status', 'startSecureHandshake', error);
    }
}

function requestSessionFromParent() {
    try {
        if (parentCoordinator.handshakeInProgress) return;
        
        parentCoordinator.handshakeInProgress = true;
        parentCoordinator.sessionRequestSent = true;
        parentCoordinator.sequenceId = generateSequenceId();
        
        const message = {
            type: MESSAGE_TYPES.REQUEST_SESSION,
            source: 'status-core',
            sequenceId: parentCoordinator.sequenceId,
            timestamp: Date.now(),
            module: 'status',
            protocolVersion: state.protocolVersion
        };
        
        window.parent.postMessage(message, '*');
        
        parentCoordinator.handshakeTimeout = setTimeout(() => {
            if (!parentCoordinator.sessionValid) {
                if (!parentCoordinator.handshakeRetries || parentCoordinator.handshakeRetries < 1) {
                    parentCoordinator.handshakeRetries++;
                    parentCoordinator.handshakeInProgress = false;
                    setTimeout(requestSessionFromParent, 1000);
                } else {
                    log(LOG_LEVEL.WARN, 'Handshake', 'Secure handshake failed');
                    handleSessionFailed();
                }
            }
        }, 5000);
        
    } catch (error) {
        safeLogError('Status', 'requestSessionFromParent', error);
        parentCoordinator.handshakeInProgress = false;
        handleSessionFailed();
    }
}

function handleSecureSessionData(message) {
    try {
        if (message.source !== 'parent' && message.source !== 'PARENT') return;
        
        if (parentCoordinator.sequenceId && message.sequenceId && 
            message.sequenceId !== parentCoordinator.sequenceId) return;
        
        const sessionData = message.data || message.payload;
        
        if (!sessionData) {
            parentCoordinator.handshakeInProgress = false;
            clearTimeout(parentCoordinator.handshakeTimeout);
            return;
        }
        
        const updated = updateSessionMirror(sessionData, 'secure_handshake');
        
        if (updated) {
            parentCoordinator.sessionValid = true;
            parentCoordinator.handshakeComplete = true;
            parentCoordinator.handshakeInProgress = false;
            clearTimeout(parentCoordinator.handshakeTimeout);
            parentCoordinator.sessionData = sessionData;
            
            bindUIAfterSession();
            
            sendSecureResponseToParent(MESSAGE_TYPES.AUTH_VALIDATED, {
                success: true,
                module: 'status',
                sequenceId: parentCoordinator.sequenceId
            });
            
            startBackgroundInitializationWithSession();
        } else {
            parentCoordinator.handshakeInProgress = false;
            clearTimeout(parentCoordinator.handshakeTimeout);
        }
        
    } catch (error) {
        safeLogError('Status', 'handleSecureSessionData', error);
        parentCoordinator.handshakeInProgress = false;
        clearTimeout(parentCoordinator.handshakeTimeout);
    }
}

function bindUIAfterSession() {
    try {
        if (typeof window.initializeStatusUI === 'function') {
            window.initializeStatusUI();
        }
        updateUIBasedOnAuth();
    } catch (error) {
        safeLogError('Status', 'bindUIAfterSession', error);
    }
}

function updateUIBasedOnAuth() {
    try {
        document.dispatchEvent(new CustomEvent('sessionReady', {
            detail: { user: currentUser }
        }));
    } catch (error) {
        safeLogError('Status', 'updateUIBasedOnAuth', error);
    }
}

function sendSecureResponseToParent(type, data = {}) {
    try {
        if (!window.parent || window.parent === window) return;
        
        const message = signMessage({
            type,
            payload: {
                ...data,
                source: 'status-core',
                timestamp: Date.now(),
                sequenceId: parentCoordinator.sequenceId || generateSequenceId()
            }
        });
        
        window.parent.postMessage(message, '*');
        
    } catch (error) {
        safeLogError('Status', 'sendSecureResponseToParent', error);
    }
}

function handleSessionFailed() {
    parentCoordinator.handshakeInProgress = false;
    parentCoordinator.handshakeComplete = false;
    
    if (state.sessionMirror.validated) {
        activateSessionFromMirror();
    } else {
        loadCachedDataInstantly();
        enableGuestMode();
    }
    
    initializeUIWithCachedData();
}

function clearSecureHandshake() {
    try {
        if (parentCoordinator.handshakeTimeout) {
            clearTimeout(parentCoordinator.handshakeTimeout);
            parentCoordinator.handshakeTimeout = null;
        }
        parentCoordinator.handshakeInProgress = false;
        parentCoordinator.sessionValid = false;
        parentCoordinator.sessionRequestSent = false;
        parentCoordinator.handshakeRetries = 0;
    } catch (error) {
        safeLogError('Status', 'clearSecureHandshake', error);
    }
}

function handleSessionData(sessionData) {
    try {
        if (!validateSessionData(sessionData)) {
            sendToParent(MESSAGE_TYPES.ERROR, {
                error: 'INVALID_SESSION_SCHEMA',
                message: 'Session data validation failed'
            });
            return;
        }
        
        updateSessionMirror(sessionData, 'session_data');
        
        parentCoordinator.sessionData = sessionData;
        parentCoordinator.handshakeComplete = true;
        
        if (parentCoordinator.handshakeInterval) {
            clearInterval(parentCoordinator.handshakeInterval);
            parentCoordinator.handshakeInterval = null;
        }
        
        sendToParent(MESSAGE_TYPES.AUTH_VALIDATED, {
            module: 'status',
            success: true
        });
        
        startBackgroundInitializationWithSession();
        
    } catch (error) {
        safeLogError('Status', 'handleSessionData', error);
        sendToParent(MESSAGE_TYPES.ERROR, {
            error: 'SESSION_PROCESSING_ERROR',
            message: error.message
        });
    }
}

function validateSessionData(sessionData) {
    try {
        if (!sessionData || typeof sessionData !== 'object') return false;
        
        if (sessionData.token && typeof sessionData.token !== 'string') return false;
        if (sessionData.user && (!sessionData.user.id || !sessionData.user.displayName)) return false;
        
        return true;
    } catch (error) {
        return false;
    }
}

function handleSessionUpdate(updateData) {
    try {
        if (!updateData) return;
        
        updateSessionMirror(updateData, 'session_update');
        
    } catch (error) {
        safeLogError('Status', 'handleSessionUpdate', error);
    }
}

function handleLogout(logoutData) {
    try {
        parentCoordinator.sessionData = null;
        parentCoordinator.handshakeComplete = false;
        parentCoordinator.sessionValid = false;
        
        state.sessionMirror = {
            token: null,
            user: null,
            expiry: null,
            permissions: [],
            timestamp: 0,
            messageId: null,
            validated: false,
            source: null
        };
        
        currentUser = null;
        userData = null;
        
        SecureStorage.remove(LOCAL_STORAGE_KEYS.USER);
        SecureStorage.remove(UNIFIED_TOKEN_KEY);
        
        isTokenReady = false;
        state.sessionActive = false;
        state.user = null;
        state.token = null;
        enableGuestMode();
        
        sendToParent(MESSAGE_TYPES.CHILD_LOADED, {
            module: 'status',
            loggedOut: true,
            timestamp: Date.now()
        });
        
    } catch (error) {
        safeLogError('Status', 'handleLogout', error);
    }
}

function handleParentUnavailable() {
    loadCachedDataInstantly();
    
    if (state.sessionMirror.validated) {
        activateSessionFromMirror();
    } else {
        enableGuestMode();
    }
}

function startBackgroundInitializationWithSession() {
    if (isBackgroundInitialized) return;
    
    try {
        setTimeout(async () => {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                
                if (parentCoordinator.handshakeComplete) {
                    sendToParent(MESSAGE_TYPES.UI_READY, {
                        module: 'status',
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                safeLogError('Status', 'startBackgroundInitializationWithSession', error);
            }
        }, 1000);
    } catch (error) {
        safeLogError('Status', 'startBackgroundInitializationWithSession', error);
    }
}

async function makeParentApiRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const responseHandler = (event) => {
                try {
                    if (!isValidOrigin(event.origin) && !parentCoordinator.trustedOrigins.has(event.origin)) return;
                    
                    const message = event.data;
                    if (!message || !message.type || !message.payload || message.payload.requestId !== requestId) return;
                    
                    if (message.type === 'API_RESPONSE' || message.type === MESSAGE_TYPES.API_RESPONSE) {
                        window.removeEventListener('message', responseHandler);
                        resolve(message.payload.response || message.payload.data);
                    } else if (message.type === 'API_ERROR' || message.type === MESSAGE_TYPES.API_ERROR) {
                        window.removeEventListener('message', responseHandler);
                        reject(new Error(message.payload.error || 'API Error'));
                    }
                } catch (error) {
                    window.removeEventListener('message', responseHandler);
                    reject(error);
                }
            };
            
            window.addEventListener('message', responseHandler);
            
            const message = signMessage({
                type: MESSAGE_TYPES.API_REQUEST,
                payload: {
                    requestId,
                    endpoint,
                    options: {
                        method: options.method || 'GET',
                        headers: options.headers || {},
                        body: options.body,
                        credentials: 'include'
                    },
                    timestamp: Date.now()
                }
            });
            
            window.parent.postMessage(message, '*');
            
            const timer = setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('Request timeout'));
            }, 30000);
            
            state.timeouts.add(timer);
            
        } catch (error) {
            reject(error);
        }
    });
}

function handleApiResponse(responseData) {
    document.dispatchEvent(new CustomEvent('apiResponse', {
        detail: responseData
    }));
}

function handleApiError(errorData) {
    log(LOG_LEVEL.ERROR, 'API', 'API Error', errorData);
}

function handleAuthValidated(data) {
    try {
        if (data.success) {
            isTokenReady = true;
            triggerTokenReadyCallbacks();
        }
    } catch (error) {
        safeLogError('Status', 'handleAuthValidated', error);
    }
}

// =============================================
// CENTRALIZED TOKEN ACCESS SYSTEM
// =============================================
let isTokenReady = false;
let tokenReadyCallbacks = [];
let pendingApiRequests = [];
let apiCheckInterval = null;
let apiReadyReceived = false;
let authValidated = false;
let authChecked = false;

const UNIFIED_TOKEN_KEY = 'USER_TOKEN';

function waitForTokenReady() {
    return new Promise((resolve) => {
        try {
            if (isTokenReady) {
                resolve(true);
                return;
            }
            
            if (state.sessionMirror.validated && state.sessionMirror.token) {
                isTokenReady = true;
                resolve(true);
                triggerTokenReadyCallbacks();
                return;
            }
            
            if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData) {
                isTokenReady = true;
                resolve(true);
                triggerTokenReadyCallbacks();
                return;
            }
            
            const checkToken = () => {
                try {
                    const token = getUnifiedToken();
                    if (token) {
                        isTokenReady = true;
                        resolve(true);
                        triggerTokenReadyCallbacks();
                        return;
                    }
                    setTimeout(checkToken, 100);
                } catch (error) {
                    safeLogError('Status', 'waitForTokenReady.checkToken', error);
                    resolve(false);
                }
            };
            
            checkToken();
        } catch (error) {
            safeLogError('Status', 'waitForTokenReady', error);
            resolve(false);
        }
    });
}

function onTokenReady(callback) {
    try {
        if (isTokenReady) {
            callback();
        } else {
            tokenReadyCallbacks.push(callback);
        }
    } catch (error) {
        safeLogError('Status', 'onTokenReady', error);
    }
}

function triggerTokenReadyCallbacks() {
    try {
        while (tokenReadyCallbacks.length > 0) {
            const callback = tokenReadyCallbacks.shift();
            try {
                callback();
            } catch (error) {
                safeLogError('Status', 'triggerTokenReadyCallbacks', error);
            }
        }
    } catch (error) {
        safeLogError('Status', 'triggerTokenReadyCallbacks', error);
    }
}

function getUnifiedToken() {
    try {
        if (state.sessionMirror.validated && state.sessionMirror.token) {
            return state.sessionMirror.token;
        }
        
        if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData && parentCoordinator.sessionData.token) {
            return parentCoordinator.sessionData.token;
        }
        
        if (state.token) return state.token;
        
        try {
            if (typeof window.getUserToken === 'function') {
                const token = window.getUserToken();
                if (token && typeof token === 'string' && token.length > 10) return token;
            }
        } catch (error) {}
        
        try {
            const token = SecureStorage.get(UNIFIED_TOKEN_KEY);
            if (token && typeof token === 'string' && token.length > 10 && token !== 'undefined' && token !== 'null') {
                if (token.split('.').length === 3) return token;
            }
        } catch (error) {}
        
        const legacyToken = migrateLegacyTokens();
        if (legacyToken) return legacyToken;
        
        return null;
    } catch (error) {
        safeLogError('Status', 'getUnifiedToken', error);
        return null;
    }
}

function migrateLegacyTokens() {
    try {
        const legacyKeys = [
            'knecta_access_token',
            'accessToken',
            'moodchat_token',
            'auth_token',
            'knecta_token'
        ];
        
        for (const key of legacyKeys) {
            try {
                const token = SecureStorage.get(key);
                if (token && typeof token === 'string' && token.length > 10 && token !== 'undefined' && token !== 'null') {
                    if (token.split('.').length === 3) {
                        SecureStorage.set(UNIFIED_TOKEN_KEY, token);
                        return token;
                    }
                }
            } catch (error) {}
        }
        
        return null;
    } catch (error) {
        safeLogError('Status', 'migrateLegacyTokens', error);
        return null;
    }
}

function isAuthenticated() {
    try {
        if (state.sessionMirror.validated && state.sessionMirror.token && state.sessionMirror.user) return true;
        if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData) return true;
        if (state.sessionActive && !state.isGuestMode) return true;
        return getUnifiedToken() !== null;
    } catch (error) {
        safeLogError('Status', 'isAuthenticated', error);
        return false;
    }
}

async function queueApiRequest(requestFunction) {
    if (isTokenReady) return requestFunction();
    
    return new Promise((resolve, reject) => {
        try {
            pendingApiRequests.push({ requestFunction, resolve, reject });
            if (!apiCheckInterval) startTokenReadinessCheck();
        } catch (error) {
            safeLogError('Status', 'queueApiRequest', error);
            reject(error);
        }
    });
}

function processPendingApiRequests() {
    try {
        while (pendingApiRequests.length > 0) {
            const { requestFunction, resolve, reject } = pendingApiRequests.shift();
            try {
                requestFunction().then(resolve).catch(reject);
            } catch (error) {
                safeLogError('Status', 'processPendingApiRequests', error);
                reject(error);
            }
        }
    } catch (error) {
        safeLogError('Status', 'processPendingApiRequests', error);
    }
}

function startTokenReadinessCheck() {
    try {
        if (apiCheckInterval) clearInterval(apiCheckInterval);
        
        let checkCount = 0;
        const maxChecks = 30;
        
        apiCheckInterval = setInterval(() => {
            try {
                checkCount++;
                
                if (isTokenReady || getUnifiedToken() || parentCoordinator.handshakeComplete || 
                    state.token || state.sessionMirror.validated) {
                    clearInterval(apiCheckInterval);
                    apiCheckInterval = null;
                    isTokenReady = true;
                    processPendingApiRequests();
                    triggerTokenReadyCallbacks();
                } else if (checkCount >= maxChecks) {
                    clearInterval(apiCheckInterval);
                    apiCheckInterval = null;
                    safeLogError('Status', 'startTokenReadinessCheck', new Error('Token readiness check timeout'));
                }
            } catch (error) {
                safeLogError('Status', 'startTokenReadinessCheck.interval', error);
            }
        }, 100);
    } catch (error) {
        safeLogError('Status', 'startTokenReadinessCheck', error);
    }
}

// =============================================
// SECURE API CALL WITH FALLBACK
// =============================================
const secureApiCall = createErrorBoundary(async function(endpoint, options = {}) {
    if (isOfflineMode && options.method && options.method !== 'GET') {
        throw new Error('Offline mode');
    }
    
    if (parentCoordinator.handshakeComplete) {
        try {
            return await makeParentApiRequest(endpoint, options);
        } catch (error) {
            // Fall through to local fetch
        }
    }
    
    const token = getUnifiedToken();
    if (!token) {
        return queueApiRequest(() => secureApiCall(endpoint, options));
    }
    
    try {
        // Use standard fetch with token
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(endpoint, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        const isAuthError = error.message?.includes('401') || 
                           error.message?.includes('403') ||
                           error.message?.includes('Unauthorized') || 
                           error.message?.includes('Authentication') || 
                           error.message?.includes('Session');
        
        if (isAuthError) {
            isOfflineMode = true;
            handleAuthError('Authentication failed. Using offline mode.');
        }
        throw error;
    }
}, 'secureApiCall', null);

// =============================================
// GLOBAL STATE VARIABLES
// =============================================
let currentUser = null;
let userData = null;

let statuses = [];
let myStatuses = [];
let friendsStatuses = [];
let closeFriendsStatuses = [];
let pinnedStatuses = [];
let mutedStatuses = [];
let microCirclesStatuses = [];
let highlights = [];
let drafts = [];
let scheduledStatuses = [];

let viewedStatuses = new Set();
let mutedUsers = new Set();
let currentViewerStatus = null;
let currentSlideIndex = 0;
let autoAdvanceInterval = null;
let isAutoAdvancePaused = false;
let progressInterval = null;
let currentCategoryFilter = 'all';
let currentIntentFilter = null;
let currentMoodFilter = null;
let isMobile = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
let isOfflineMode = false;
let pendingReplies = [];
let pendingReactions = [];
let moodChartData = [];
let streakCount = 0;
let lastPostDate = null;
let activeFilters = new Set();
let selectedDraft = null;
let isBackgroundInitialized = false;

const statusTypes = {
    'text': { name: 'Text Status', icon: 'fas fa-font', color: 'var(--primary-color)' },
    'media': { name: 'Media Status', icon: 'fas fa-image', color: 'var(--success-color)' },
    'poll': { name: 'Poll Status', icon: 'fas fa-poll', color: 'var(--warning-color)' }
};

const statusIntents = {
    'feedback': { name: 'Looking for feedback', icon: 'fas fa-comments', color: 'var(--intent-feedback)' },
    'achievement': { name: 'Sharing achievement', icon: 'fas fa-trophy', color: 'var(--intent-achievement)' },
    'advice': { name: 'Need advice', icon: 'fas fa-hands-helping', color: 'var(--intent-advice)' },
    'chat': { name: 'Available to chat', icon: 'fas fa-comment-dots', color: 'var(--intent-chat)' },
    'venting': { name: 'Just venting', icon: 'fas fa-wind', color: 'var(--intent-venting)' },
    'reflection': { name: 'Personal reflection', icon: 'fas fa-brain', color: 'var(--intent-reflection)' },
    'question': { name: 'Asking a question', icon: 'fas fa-question-circle', color: 'var(--intent-question)' },
    'celebration': { name: 'Celebration', icon: 'fas fa-glass-cheers', color: 'var(--intent-celebration)' }
};

const statusMoods = {
    'happy': { name: 'Happy', emoji: '😊', color: 'var(--mood-happy)' },
    'stressed': { name: 'Stressed', emoji: '😫', color: 'var(--mood-stressed)' },
    'motivated': { name: 'Motivated', emoji: '💪', color: 'var(--mood-motivated)' },
    'lonely': { name: 'Lonely', emoji: '😔', color: 'var(--mood-lonely)' },
    'excited': { name: 'Excited', emoji: '🤩', color: 'var(--mood-excited)' },
    'calm': { name: 'Calm', emoji: '😌', color: 'var(--mood-calm)' },
    'sad': { name: 'Sad', emoji: '😢', color: 'var(--mood-sad)' },
    'angry': { name: 'Angry', emoji: '😠', color: 'var(--mood-angry)' }
};

const statusCategories = {
    'life': { name: 'Life', icon: 'fas fa-heart', color: 'var(--category-life)' },
    'business': { name: 'Business', icon: 'fas fa-briefcase', color: 'var(--category-business)' },
    'study': { name: 'Study', icon: 'fas fa-graduation-cap', color: 'var(--category-study)' },
    'motivation': { name: 'Motivation', icon: 'fas fa-fire', color: 'var(--category-motivation)' },
    'event': { name: 'Event', icon: 'fas fa-calendar-alt', color: 'var(--category-event)' }
};

const actionButtons = {
    'message': { name: 'Message me', icon: 'fas fa-comments', color: 'var(--primary-color)' },
    'join': { name: 'Join discussion', icon: 'fas fa-users', color: 'var(--success-color)' },
    'vote': { name: 'Vote now', icon: 'fas fa-vote-yea', color: 'var(--warning-color)' },
    'book': { name: 'Book a call', icon: 'fas fa-phone', color: 'var(--info-color)' },
    'learn': { name: 'Learn more', icon: 'fas fa-book', color: 'var(--primary-color)' },
    'support': { name: 'Show support', icon: 'fas fa-hands-helping', color: 'var(--success-color)' },
    'collaborate': { name: 'Collaborate', icon: 'fas fa-handshake', color: 'var(--warning-color)' },
    'resource': { name: 'View resource', icon: 'fas fa-external-link-alt', color: 'var(--info-color)' }
};

const privacySettings = {
    'everyone': { name: 'Everyone', description: 'Visible to all Knecta users', icon: 'fas fa-globe' },
    'friends': { name: 'Friends Only', description: 'Visible to your friends only', icon: 'fas fa-user-friends' },
    'close-friends': { name: 'Close Friends', description: 'Visible to close friends only', icon: 'fas fa-heart' },
    'except': { name: 'All Except...', description: 'Hide from specific people', icon: 'fas fa-user-minus' },
    'specific': { name: 'Specific People...', description: 'Share with select individuals', icon: 'fas fa-user-check' },
    'micro-circle': { name: 'Micro Circle', description: 'Share with a specific group', icon: 'fas fa-users' }
};

const durationOptions = {
    '3600': '1 hour',
    '21600': '6 hours',
    '43200': '12 hours',
    '86400': '24 hours',
    '0': 'Permanent'
};

const reportReasons = {
    'spam': 'Spam',
    'inappropriate': 'Inappropriate Content',
    'harassment': 'Harassment',
    'false-info': 'False Information',
    'violence': 'Violence',
    'hate-speech': 'Hate Speech',
    'self-harm': 'Self-Harm',
    'copyright': 'Copyright Violation'
};

const reactions = {
    'like': '👍',
    'love': '❤️',
    'helpful': '💡',
    'inspiring': '✨',
    'funny': '😂',
    'not-useful': '👎'
};

const emojis = ['😊', '😂', '🥰', '😍', '🤩', '😎', '🤔', '😴', '🥳', '😢', '😠', '😱', '👍', '👎', '❤️', '🔥', '💯', '✨', '🎉', '🙏', '🤝', '💪', '👏', '🙌', '🤗', '😇', '🥺', '🤯', '😳', '🤪', '😜', '🤓', '😎', '🥶', '😈', '👻', '💀', '👀', '🦄', '🐶', '🐱', '🦁', '🐯', '🦊', '🐻', '🐼', '🐨', '🐵', '🦉', '🐣', '🦋', '🐝', '🐙', '🦑', '🐋', '🦈', '🐊', '🦒', '🐘', '🦏', '🦘', '🐫', '🦙', '🦌', '🐎', '🐖', '🐑', '🐕', '🐈', '🐇', '🦔', '🐿️', '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐', '🌟', '✨', '⚡', '☄️', '💥', '🔥', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️', '💨', '💧', '💦', '☔', '☂️', '🌊', '🌫️'];

const backgroundOptions = [
    { id: '1', type: 'solid', color: 'var(--status-bg-1)' },
    { id: '2', type: 'solid', color: 'var(--status-bg-2)' },
    { id: '3', type: 'solid', color: 'var(--status-bg-3)' },
    { id: '4', type: 'solid', color: 'var(--status-bg-4)' },
    { id: '5', type: 'solid', color: 'var(--status-bg-5)' },
    { id: '6', type: 'solid', color: 'var(--status-bg-6)' },
    { id: '7', type: 'solid', color: 'var(--status-bg-7)' },
    { id: '8', type: 'solid', color: 'var(--status-bg-8)' },
    { id: 'gradient-1', type: 'gradient', gradient: 'linear-gradient(45deg, #667eea, #764ba2)' },
    { id: 'gradient-2', type: 'gradient', gradient: 'linear-gradient(45deg, #f6d365, #fda085)' },
    { id: 'gradient-3', type: 'gradient', gradient: 'linear-gradient(45deg, #a8edea, #fed6e3)' },
    { id: 'gradient-4', type: 'gradient', gradient: 'linear-gradient(45deg, #ff6b6b, #ffa726)' }
];

const statusTemplates = {
    'motivation': {
        name: 'Motivation',
        text: 'Today is a new opportunity to be better than yesterday. Keep pushing forward! 💪',
        background: 'gradient-2',
        mood: 'motivated',
        intent: 'reflection'
    },
    'question': {
        name: 'Question',
        text: 'What\'s the best piece of advice you\'ve ever received? 🤔',
        background: '3',
        mood: 'curious',
        intent: 'question'
    },
    'achievement': {
        name: 'Achievement',
        text: 'Just reached a personal milestone! Celebrating small wins along the way. 🎉',
        background: 'gradient-1',
        mood: 'happy',
        intent: 'achievement'
    },
    'reflection': {
        name: 'Reflection',
        text: 'Taking a moment to reflect on what truly matters in life. Peace comes from within. ✨',
        background: '6',
        mood: 'calm',
        intent: 'reflection'
    }
};

const LOCAL_STORAGE_KEYS = {
    USER: 'knecta_current_user',
    USER_TOKEN: 'knecta_user_token',
    STATUSES: 'knecta_statuses_cache',
    MY_STATUSES: 'knecta_my_statuses_cache',
    VIEWED_STATUSES: 'knecta_viewed_statuses',
    MUTED_USERS: 'knecta_muted_users',
    HIGHLIGHTS: 'knecta_status_highlights',
    DRAFTS: 'knecta_status_drafts',
    SCHEDULED: 'knecta_scheduled_statuses',
    PENDING_REPLIES: 'knecta_pending_replies',
    PENDING_REACTIONS: 'knecta_pending_reactions',
    MOOD_DATA: 'knecta_mood_data',
    STREAK: 'knecta_posting_streak',
    LAST_POST_DATE: 'knecta_last_post_date',
    OFFLINE_QUEUE: 'knecta_offline_status_queue',
    LAST_SYNC: 'knecta_status_last_sync'
};

// =============================================
// INSTANT UI RENDERING WITH CACHED DATA
// =============================================
function initializeUIWithCachedData() {
    try {
        loadUserFromCache();
        loadCachedDataInstantly();
        
        if (typeof window.initializeStatusUI === 'function') {
            window.initializeStatusUI();
        }
        
        if (parentCoordinator.handshakeComplete) {
            startBackgroundInitializationWithSession();
        }
        
    } catch (error) {
        safeLogError('Status', 'initializeUIWithCachedData', error);
    }
}

function loadUserFromCache() {
    try {
        const userData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.USER);
        if (userData && userData !== 'undefined' && userData !== 'null') {
            if (userData && typeof userData === 'object' && userData.id) {
                currentUser = userData;
            }
        }
    } catch (error) {
        safeLogError('Status', 'loadUserFromCache', error);
    }
}

function loadCachedDataInstantly() {
    try {
        const statusesData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.STATUSES);
        if (statusesData) {
            try { statuses = statusesData || []; } catch { statuses = []; }
        }
        
        const myStatusesData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.MY_STATUSES);
        if (myStatusesData) {
            try { myStatuses = myStatusesData || []; } catch { myStatuses = []; }
        }
        
        const viewedStatusesData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.VIEWED_STATUSES);
        if (viewedStatusesData) {
            try { viewedStatuses = new Set(viewedStatusesData || []); } catch { viewedStatuses = new Set(); }
        }
        
        const mutedUsersData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.MUTED_USERS);
        if (mutedUsersData) {
            try { mutedUsers = new Set(mutedUsersData || []); } catch { mutedUsers = new Set(); }
        }
        
        const highlightsData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS);
        if (highlightsData) {
            try { highlights = highlightsData || []; } catch { highlights = []; }
        }
        
        const draftsData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
        if (draftsData) {
            try { drafts = draftsData || []; } catch { drafts = []; }
        }
        
        const scheduledData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.SCHEDULED);
        if (scheduledData) {
            try { scheduledStatuses = scheduledData || []; } catch { scheduledStatuses = []; }
        }
        
        const pendingRepliesData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.PENDING_REPLIES);
        if (pendingRepliesData) {
            try { pendingReplies = pendingRepliesData || []; } catch { pendingReplies = []; }
        }
        
        const pendingReactionsData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS);
        if (pendingReactionsData) {
            try { pendingReactions = pendingReactionsData || []; } catch { pendingReactions = []; }
        }
        
        const moodData = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.MOOD_DATA);
        if (moodData) {
            try { moodChartData = moodData || []; } catch { moodChartData = []; }
        }
        
        const streakData = SecureStorage.get(LOCAL_STORAGE_KEYS.STREAK);
        if (streakData) {
            try { streakCount = parseInt(streakData) || 0; } catch { streakCount = 0; }
        }
        
        const lastPostDateData = SecureStorage.get(LOCAL_STORAGE_KEYS.LAST_POST_DATE);
        if (lastPostDateData) {
            try { lastPostDate = new Date(lastPostDateData); } catch { lastPostDate = null; }
        }
        
    } catch (error) {
        safeLogError('Status', 'loadCachedDataInstantly', error);
    }
}

// =============================================
// BACKGROUND INITIALIZATION
// =============================================
async function startBackgroundInitialization() {
    if (isBackgroundInitialized) return;
    
    try {
        onTokenReady(async () => {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                
                if (parentCoordinator.handshakeComplete) {
                    sendToParent(MESSAGE_TYPES.UI_READY, {
                        module: 'status',
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                safeLogError('Status', 'startBackgroundInitialization.onTokenReady', error);
            }
        });
        
        if (getUnifiedToken() || parentCoordinator.handshakeComplete || state.token || state.sessionMirror.validated) {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                
                if (parentCoordinator.handshakeComplete) {
                    sendToParent(MESSAGE_TYPES.UI_READY, {
                        module: 'status',
                        timestamp: Date.now()
                    });
                }
            } catch (error) {
                safeLogError('Status', 'startBackgroundInitialization.immediate', error);
            }
        }
        
    } catch (error) {
        safeLogError('Status', 'startBackgroundInitialization', error);
    }
}

async function loadFreshDataInBackground() {
    try {
        const loadPromises = [];
        loadPromises.push(safeApiOperation(() => loadStatusesInBackground()));
        loadPromises.push(safeApiOperation(() => loadMyStatusesInBackground()));
        loadPromises.push(safeApiOperation(() => loadHighlightsInBackground()));
        loadPromises.push(safeApiOperation(() => loadUserDataInBackground()));
        await Promise.allSettled(loadPromises);
    } catch (error) {
        safeLogError('Status', 'loadFreshDataInBackground', error);
    }
}

async function safeApiOperation(operation) {
    try {
        if (!isAuthenticated()) throw new Error('Not authenticated');
        return await operation();
    } catch (error) {
        safeLogError('Status', 'safeApiOperation', error);
        return null;
    }
}

async function loadStatusesInBackground() {
    try {
        const response = await secureApiCall('/api/statuses');
        if (response && response.statuses) {
            statuses = response.statuses;
            statuses = filterStatusesByPrivacy(statuses);
            statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            SecureStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        }
    } catch (error) {
        throw error;
    }
}

async function loadMyStatusesInBackground() {
    try {
        const response = await secureApiCall('/api/statuses/my');
        if (response && response.statuses) {
            myStatuses = response.statuses;
            SecureStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        }
    } catch (error) {
        throw error;
    }
}

async function loadHighlightsInBackground() {
    try {
        const response = await secureApiCall('/api/statuses/highlights');
        if (response && response.highlights) {
            highlights = response.highlights;
            SecureStorage.setJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS, highlights);
        }
    } catch (error) {
        throw error;
    }
}

async function loadUserDataInBackground() {
    try {
        const response = await secureApiCall('/api/user/me');
        if (response && response.user) {
            currentUser = response.user;
            userData = response.user;
            SecureStorage.setJSON(LOCAL_STORAGE_KEYS.USER, response.user);
        }
    } catch (error) {
        throw error;
    }
}

// =============================================
// BOOTSTRAP APPLICATION - ALIASED AS bootstrapApplication FOR COMPATIBILITY
// =============================================
async function bootstrapApp() {
    try {
        initializeParentCoordination();
        initializeUIWithCachedData();
        startTokenReadinessCheck();
        
        setTimeout(() => {
            sendToParent(MESSAGE_TYPES.CHILD_LOADED, {
                module: 'status',
                timestamp: Date.now()
            });
        }, 500);
        
        return true;
    } catch (error) {
        safeLogError('Status', 'bootstrapApp', error);
        return false;
    }
}

const bootstrapApplication = bootstrapApp;

// =============================================
// AUTHENTICATION ERROR HANDLING
// =============================================
function handleAuthError(message) {
    try {
        if (parentCoordinator.handshakeComplete) {
            sendToParent(MESSAGE_TYPES.NEEDS_AUTH, {
                module: 'status',
                error: message,
                timestamp: Date.now()
            });
        }
        
        if (statuses.length === 0 && myStatuses.length === 0) {
            // No action needed
        } else {
            isOfflineMode = true;
        }
    } catch (error) {
        safeLogError('Status', 'handleAuthError', error);
    }
}

async function initializeStatusSystem() {
    try {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout loading data')), 10000)
        );
        
        await Promise.race([loadInitialData(), timeoutPromise]);
        
    } catch (error) {
        loadCachedDataInstantly();
        if (!isOfflineMode) isOfflineMode = true;
    }
}

async function loadInitialData() {
    try {
        const loadPromises = [];
        
        loadPromises.push(safeApiOperation(async () => {
            const statusesResponse = await secureApiCall('/api/statuses');
            if (statusesResponse && statusesResponse.statuses) {
                statuses = statusesResponse.statuses;
                statuses = filterStatusesByPrivacy(statuses);
                statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                SecureStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
            }
        }));
        
        loadPromises.push(safeApiOperation(async () => {
            const myStatusesResponse = await secureApiCall('/api/statuses/my');
            if (myStatusesResponse && myStatusesResponse.statuses) {
                myStatuses = myStatusesResponse.statuses;
                SecureStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
            }
        }));
        
        loadPromises.push(safeApiOperation(async () => {
            const highlightsResponse = await secureApiCall('/api/statuses/highlights');
            if (highlightsResponse && highlightsResponse.highlights) {
                highlights = highlightsResponse.highlights;
                SecureStorage.setJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS, highlights);
            }
        }));
        
        loadPromises.push(safeApiOperation(async () => {
            const userResponse = await secureApiCall('/api/user/me');
            if (userResponse && userResponse.user) {
                currentUser = userResponse.user;
                userData = userResponse.user;
                SecureStorage.setJSON(LOCAL_STORAGE_KEYS.USER, userResponse.user);
            }
        }));
        
        await Promise.allSettled(loadPromises);
        
    } catch (error) {
        safeLogError('Status', 'loadInitialData', error);
        throw error;
    }
}

// =============================================
// CORE STATUS FUNCTIONS
// =============================================
function filterStatusesByPrivacy(statuses) {
    try {
        if (!Array.isArray(statuses)) return [];
        
        return statuses.filter(status => {
            if (!status || !status.userId) return false;
            if (mutedUsers.has(status.userId)) return false;
            
            const privacy = status.privacy || 'friends';
            
            switch(privacy) {
                case 'everyone': return true;
                case 'friends': return true;
                case 'close-friends': return false;
                case 'except': return true;
                case 'specific': return false;
                case 'micro-circle': return false;
                default: return true;
            }
        });
    } catch (error) {
        safeLogError('Status', 'filterStatusesByPrivacy', error);
        return [];
    }
}

function getStatusPreviewText(status) {
    try {
        if (!status) return 'Status';
        
        if (status.type === 'text') {
            return status.text && status.text.length > 30 ? status.text.substring(0, 30) + '...' : status.text || 'Text status';
        } else if (status.type === 'media') {
            return status.caption ? status.caption.substring(0, 30) + '...' : 'Media status';
        } else if (status.type === 'poll') {
            return status.question ? status.question.substring(0, 30) + '...' : 'Poll status';
        }
        return 'Status';
    } catch (error) {
        safeLogError('Status', 'getStatusPreviewText', error);
        return 'Status';
    }
}

function filterStatusesByType(type) {
    try {
        if (!Array.isArray(statuses)) return [];
        
        switch(type) {
            case 'friends':
                return statuses.filter(status => status && (status.privacy === 'friends' || status.privacy === 'everyone'));
            case 'close-friends':
                return statuses.filter(status => status && status.privacy === 'close-friends');
            case 'pinned':
                return statuses.filter(status => status && status.isPinned);
            case 'muted':
                return statuses.filter(status => status && mutedUsers.has(status.userId));
            case 'micro-circle':
                return statuses.filter(status => status && status.privacy === 'micro-circle');
            default:
                return statuses;
        }
    } catch (error) {
        safeLogError('Status', 'filterStatusesByType', error);
        return [];
    }
}

function getEmptyStateMessage() {
    try {
        if (activeFilters.size > 0) {
            return `No statuses match your filters`;
        }
        if (currentIntentFilter) {
            return `No statuses with "${statusIntents[currentIntentFilter]?.name || currentIntentFilter}" intent`;
        }
        if (currentMoodFilter) {
            return `No statuses with "${statusMoods[currentMoodFilter]?.name || currentMoodFilter}" mood`;
        }
        return 'Be the first to post a status!';
    } catch (error) {
        safeLogError('Status', 'getEmptyStateMessage', error);
        return 'No statuses available';
    }
}

// =============================================
// STATUS ACTIONS - WITH SECURE API CALLS
// =============================================
const addReactionToStatus = createErrorBoundary(async function(statusId, reaction) {
    if (!statusId || !reaction) throw new Error('Missing required parameters');
    
    if (isOfflineMode) {
        pendingReactions.push({ statusId, reaction, timestamp: new Date().toISOString() });
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        return { success: true, offline: true };
    }
    
    const response = await secureApiCall(`/api/statuses/${statusId}/react`, {
        method: 'POST',
        body: JSON.stringify({ reaction })
    });
    
    return response;
}, 'addReactionToStatus', { success: false });

const voteOnPoll = createErrorBoundary(async function(statusId, optionId) {
    if (!statusId || !optionId) throw new Error('Missing required parameters');
    
    if (isOfflineMode) return { success: false, offline: true };
    
    const response = await secureApiCall(`/api/statuses/${statusId}/vote`, {
        method: 'POST',
        body: JSON.stringify({ optionId })
    });
    
    return response;
}, 'voteOnPoll', { success: false });

const pinStatus = createErrorBoundary(async function(statusData) {
    if (!statusData || !statusData.id) throw new Error('Invalid status data');
    
    const response = await secureApiCall(`/api/statuses/${statusData.id}/pin`, {
        method: 'POST'
    });
    
    if (response && response.success) {
        statusData.isPinned = true;
        pinnedStatuses.push(statusData);
    }
    return response;
}, 'pinStatus', { success: false });

const unpinStatus = createErrorBoundary(async function(statusData) {
    if (!statusData || !statusData.id) throw new Error('Invalid status data');
    
    const response = await secureApiCall(`/api/statuses/${statusData.id}/pin`, {
        method: 'DELETE'
    });
    
    if (response && response.success) {
        statusData.isPinned = false;
        pinnedStatuses = pinnedStatuses.filter(s => s && s.id !== statusData.id);
    }
    return response;
}, 'unpinStatus', { success: false });

const muteUser = createErrorBoundary(async function(userId) {
    if (!userId) throw new Error('Invalid user ID');
    
    const response = await secureApiCall(`/api/users/${userId}/mute`, {
        method: 'POST'
    });
    
    if (response && response.success) {
        mutedUsers.add(userId);
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.MUTED_USERS, Array.from(mutedUsers));
    }
    return response;
}, 'muteUser', { success: false });

const unmuteUser = createErrorBoundary(async function(userId) {
    if (!userId) throw new Error('Invalid user ID');
    
    const response = await secureApiCall(`/api/users/${userId}/mute`, {
        method: 'DELETE'
    });
    
    if (response && response.success) {
        mutedUsers.delete(userId);
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.MUTED_USERS, Array.from(mutedUsers));
    }
    return response;
}, 'unmuteUser', { success: false });

const postStatus = createErrorBoundary(async function(statusData) {
    if (!statusData) throw new Error('Invalid status data');
    
    const sanitizedData = sanitizeStatusData(statusData);
    
    if (isOfflineMode) {
        const offlineQueue = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
        sanitizedData.id = 'offline_' + Date.now();
        sanitizedData.createdAt = new Date().toISOString();
        sanitizedData.offline = true;
        offlineQueue.push(sanitizedData);
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
        
        statuses.unshift(sanitizedData);
        myStatuses.unshift(sanitizedData);
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        
        lastPostDate = new Date();
        SecureStorage.set(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
        updateStreakCounter();
        
        return { success: true, status: sanitizedData, offline: true };
    }
    
    const response = await secureApiCall('/api/statuses/create', {
        method: 'POST',
        body: JSON.stringify(sanitizedData)
    });
    
    if (response && response.status) {
        statuses.unshift(response.status);
        myStatuses.unshift(response.status);
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        
        lastPostDate = new Date();
        SecureStorage.set(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
        updateStreakCounter();
        
        if (sanitizedData.mood) {
            moodChartData.push({
                mood: sanitizedData.mood,
                value: 50 + Math.floor(Math.random() * 30),
                date: new Date().toISOString()
            });
            if (moodChartData.length > 30) moodChartData = moodChartData.slice(-30);
            SecureStorage.setJSON(LOCAL_STORAGE_KEYS.MOOD_DATA, moodChartData);
        }
    }
    return response;
}, 'postStatus', { success: false });

function sanitizeStatusData(statusData) {
    try {
        const sanitized = { ...statusData };
        
        if (sanitized.text) sanitized.text = escapeHtml(sanitized.text);
        if (sanitized.caption) sanitized.caption = escapeHtml(sanitized.caption);
        if (sanitized.question) sanitized.question = escapeHtml(sanitized.question);
        
        if (sanitized.privacy && !privacySettings[sanitized.privacy]) sanitized.privacy = 'friends';
        if (sanitized.mood && !statusMoods[sanitized.mood]) sanitized.mood = null;
        if (sanitized.intent && !statusIntents[sanitized.intent]) sanitized.intent = null;
        if (sanitized.category && !statusCategories[sanitized.category]) sanitized.category = null;
        
        validateStatusPayload(sanitized);
        
        return sanitized;
    } catch (error) {
        safeLogError('Status', 'sanitizeStatusData', error);
        return statusData;
    }
}

function validateStatusPayload(payload) {
    if (payload.type === 'text') {
        if (!payload.text || typeof payload.text !== 'string' || payload.text.trim().length === 0) {
            throw new Error('Text status requires non-empty text');
        }
        if (payload.text.length > 5000) throw new Error('Text too long (max 5000 characters)');
    }
    
    if (payload.type === 'media') {
        if (!payload.mediaUrls || !Array.isArray(payload.mediaUrls) || payload.mediaUrls.length === 0) {
            throw new Error('Media status requires media URLs');
        }
        if (payload.caption && payload.caption.length > 1000) throw new Error('Caption too long (max 1000 characters)');
    }
    
    if (payload.type === 'poll') {
        if (!payload.question || typeof payload.question !== 'string' || payload.question.trim().length === 0) {
            throw new Error('Poll requires a question');
        }
        if (!payload.options || !Array.isArray(payload.options) || payload.options.length < 2) {
            throw new Error('Poll requires at least 2 options');
        }
        if (payload.options.length > 10) throw new Error('Too many poll options (max 10)');
    }
    
    if (payload.duration && !durationOptions[payload.duration.toString()]) throw new Error('Invalid duration option');
    if (payload.mood && !statusMoods[payload.mood]) throw new Error('Invalid mood');
    if (payload.intent && !statusIntents[payload.intent]) throw new Error('Invalid intent');
    if (payload.category && !statusCategories[payload.category]) throw new Error('Invalid category');
    if (payload.privacy && !privacySettings[payload.privacy]) throw new Error('Invalid privacy setting');
}

function updateStreakCounter() {
    try {
        const today = new Date().toDateString();
        if (lastPostDate && lastPostDate.toDateString() === today) return;
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastPostDate && lastPostDate.toDateString() === yesterday.toDateString()) {
            streakCount++;
        } else if (lastPostDate) {
            streakCount = 1;
        } else {
            streakCount = 1;
        }
        
        SecureStorage.set(LOCAL_STORAGE_KEYS.STREAK, streakCount.toString());
    } catch (error) {
        safeLogError('Status', 'updateStreakCounter', error);
    }
}

const scheduleStatus = createErrorBoundary(async function(statusData, scheduleTime) {
    if (!statusData || !scheduleTime) throw new Error('Missing required parameters');
    
    const sanitizedData = sanitizeStatusData(statusData);
    
    const response = await secureApiCall('/api/statuses/schedule', {
        method: 'POST',
        body: JSON.stringify({
            ...sanitizedData,
            scheduledFor: scheduleTime
        })
    });
    
    if (response && response.success) {
        scheduledStatuses.push({ ...sanitizedData, scheduledFor: scheduleTime });
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.SCHEDULED, scheduledStatuses);
    }
    return response;
}, 'scheduleStatus', { success: false });

function saveDraft(statusData) {
    try {
        if (!statusData) throw new Error('Invalid status data');
        
        const sanitizedData = sanitizeStatusData(statusData);
        sanitizedData.id = 'draft_' + Date.now();
        sanitizedData.createdAt = new Date().toISOString();
        sanitizedData.isDraft = true;
        drafts.unshift(sanitizedData);
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.DRAFTS, drafts);
        return { success: true };
    } catch (error) {
        safeLogError('Status', 'saveDraft', error);
        throw error;
    }
}

const reportStatus = createErrorBoundary(async function(statusId, reason, details) {
    if (!statusId || !reason) throw new Error('Missing required parameters');
    
    const sanitizedDetails = escapeHtml(details || '');
    
    const response = await secureApiCall(`/api/statuses/${statusId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason, details: sanitizedDetails })
    });
    
    return response;
}, 'reportStatus', { success: false });

// =============================================
// USER STATUS TRACKING
// =============================================
let userStatusInterval = null;
let lastActivityTime = Date.now();
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let heartbeatInterval = null;
let isTrackingInitialized = false;
let lastOnlineStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;
let activityThrottleTimer = null;
let activityEventHandlers = [];

function initializeUserStatusTracking() {
    if (isTrackingInitialized) return;
    
    try {
        isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        lastOnlineStatus = isOnline;
        
        setupNetworkDetection();
        setupActivityTracking();
        startHeartbeat();
        updateUserStatus();
        
        isTrackingInitialized = true;
        
    } catch (error) {
        safeLogError('Status', 'initializeUserStatusTracking', error);
    }
}

function setupNetworkDetection() {
    try {
        if (typeof window === 'undefined') return;
        
        const handleNetworkChange = () => {
            const currentOnline = navigator.onLine;
            if (currentOnline === lastOnlineStatus) return;
            
            lastOnlineStatus = currentOnline;
            
            if (currentOnline) {
                handleOnlineStatus();
            } else {
                handleOfflineStatus();
            }
        };
        
        window.removeEventListener('online', handleNetworkChange);
        window.removeEventListener('offline', handleNetworkChange);
        
        window.addEventListener('online', handleNetworkChange);
        window.addEventListener('offline', handleNetworkChange);
        
        activityEventHandlers.push({ element: window, type: 'online', handler: handleNetworkChange });
        activityEventHandlers.push({ element: window, type: 'offline', handler: handleNetworkChange });
    } catch (error) {
        safeLogError('Status', 'setupNetworkDetection', error);
    }
}

function setupActivityTracking() {
    try {
        if (typeof document === 'undefined') return;
        
        const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        
        const updateActivity = () => {
            if (activityThrottleTimer) clearTimeout(activityThrottleTimer);
            activityThrottleTimer = setTimeout(() => {
                lastActivityTime = Date.now();
                activityThrottleTimer = null;
            }, 1000);
        };
        
        activityEvents.forEach(eventType => {
            document.removeEventListener(eventType, updateActivity);
        });
        
        activityEvents.forEach(eventType => {
            document.addEventListener(eventType, updateActivity);
            activityEventHandlers.push({ element: document, type: eventType, handler: updateActivity });
        });
    } catch (error) {
        safeLogError('Status', 'setupActivityTracking', error);
    }
}

function handleOnlineStatus() {
    try {
        if (isOnline) return;
        
        isOnline = true;
        
        setTimeout(() => { updateUserStatus(); }, 100);
        
        if (isOfflineMode) {
            isOfflineMode = false;
            setTimeout(() => { syncPendingData(); }, 500);
        }
    } catch (error) {
        safeLogError('Status', 'handleOnlineStatus', error);
    }
}

function handleOfflineStatus() {
    try {
        if (!isOnline) return;
        
        isOnline = false;
        
        setTimeout(() => { updateUserStatus(); }, 100);
        
        if (!isOfflineMode) isOfflineMode = true;
    } catch (error) {
        safeLogError('Status', 'handleOfflineStatus', error);
    }
}

function sendUserActive() {
    try {
        if (parentCoordinator.handshakeComplete && currentUser?.id) {
            sendToParent('USER_ACTIVE', {
                timestamp: Date.now(),
                userId: currentUser.id,
                sequenceId: generateSequenceId()
            }, { silent: true });
        }
    } catch (error) {
        safeLogError('Status', 'sendUserActive', error);
    }
}

function sendUserInactive() {
    try {
        if (parentCoordinator.handshakeComplete && currentUser?.id) {
            sendToParent('USER_INACTIVE', {
                timestamp: Date.now(),
                userId: currentUser.id,
                lastActive: lastActivityTime,
                sequenceId: generateSequenceId()
            }, { silent: true });
        }
    } catch (error) {
        safeLogError('Status', 'sendUserInactive', error);
    }
}

async function updateUserStatus() {
    try {
        if (!currentUser && !state.user && !isAuthenticated()) return;
        
        const userId = currentUser?.id || state.user?.id;
        if (!userId) return;
        
        const status = isOnline ? 'online' : 'offline';
        
        if (currentUser) {
            currentUser.status = status;
            currentUser.lastSeen = new Date().toISOString();
        }
        
        if (parentCoordinator.handshakeComplete) {
            sendToParent('STATUS_UPDATE', {
                userId: userId,
                status: status,
                lastSeen: new Date().toISOString(),
                isOnline: isOnline,
                timestamp: Date.now(),
                sequenceId: generateSequenceId(),
                source: 'status-core'
            }, { silent: true });
        }
        
        if (isOnline && !isOfflineMode) {
            try {
                await secureApiCall('/api/user/status', {
                    method: 'POST',
                    body: JSON.stringify({ status: status, lastSeen: new Date().toISOString() })
                });
            } catch (apiError) {
                safeLogError('Status', 'updateUserStatus.api', apiError);
            }
        }
        
    } catch (error) {
        safeLogError('Status', 'updateUserStatus', error);
    }
}

async function syncPendingData() {
    try {
        const reactionsToSync = [...pendingReactions];
        for (const reaction of reactionsToSync) {
            try {
                await secureApiCall(`/api/statuses/${reaction.statusId}/react`, {
                    method: 'POST',
                    body: JSON.stringify({ reaction: reaction.reaction })
                });
                pendingReactions = pendingReactions.filter(r => 
                    !(r.statusId === reaction.statusId && r.reaction === reaction.reaction)
                );
            } catch (error) {
                safeLogError('Status', 'syncPendingData.reaction', error);
            }
        }
        
        SecureStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        
        const offlineQueue = SecureStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
        for (const statusData of offlineQueue) {
            try {
                await secureApiCall('/api/statuses/create', {
                    method: 'POST',
                    body: JSON.stringify(statusData)
                });
            } catch (error) {
                safeLogError('Status', 'syncPendingData.offline', error);
            }
        }
        
        SecureStorage.remove(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
        await loadFreshDataInBackground();
        
    } catch (error) {
        safeLogError('Status', 'syncPendingData', error);
    }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================
function escapeHtml(text) {
    try {
        if (!text) return '';
        if (typeof document === 'undefined') return text;
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    } catch (error) {
        safeLogError('Status', 'escapeHtml', error);
        return text || '';
    }
}

function formatTimeAgo(date) {
    try {
        if (!date) return 'Unknown';
        
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) return 'Unknown';
        
        const now = new Date();
        const diffMs = now - dateObj;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return `${Math.floor(diffDays / 7)}w ago`;
    } catch (error) {
        safeLogError('Status', 'formatTimeAgo', error);
        return 'Unknown';
    }
}

async function retryOperation(operation, maxRetries = 3) {
    try {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    const delay = Math.min(1000 * Math.pow(2, i), 10000);
                    const jitter = Math.random() * 200;
                    await new Promise(resolve => setTimeout(resolve, delay + jitter));
                }
            }
        }
        
        throw lastError;
    } catch (error) {
        safeLogError('Status', 'retryOperation', error);
        throw error;
    }
}

function generateSampleMoodData() {
    try {
        const moods = Object.keys(statusMoods);
        const sampleData = [];
        const now = new Date();
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            
            const randomMood = moods[Math.floor(Math.random() * moods.length)];
            sampleData.push({
                mood: randomMood,
                value: 40 + Math.floor(Math.random() * 50),
                date: date.toISOString().split('T')[0],
                timestamp: date.getTime()
            });
        }
        
        sampleData.sort((a, b) => a.timestamp - b.timestamp);
        return sampleData;
    } catch (error) {
        safeLogError('Status', 'generateSampleMoodData', error);
        return [];
    }
}

// =============================================
// SAFE LOG ERROR UTILITY
// =============================================
let errorLogCounts = {};
let maxErrorLogs = 1;
let retryCounts = {};
let maxRetries = 3;
let messageCache = new Set();

function safeLogError(module, functionName, error, data = null) {
    try {
        const errorKey = `${module}:${functionName}:${error?.message || 'unknown'}`;
        
        if (!errorLogCounts[errorKey]) errorLogCounts[errorKey] = 0;
        errorLogCounts[errorKey]++;
        
        if (errorLogCounts[errorKey] <= maxErrorLogs) {
            log(LOG_LEVEL.WARN, module, `${functionName} error: ${error?.message || error}`);
        }
        
        if (functionName.includes('get') || functionName.includes('load')) {
            return Array.isArray(data) ? [] : null;
        }
    } catch (e) {}
}

// =============================================
// USER GUARD AND API GUARD
// =============================================
function withUserGuard(fn, defaultValue = null) {
    return function(...args) {
        try {
            if (!state.sessionActive && !state.isGuestMode && !currentUser && !parentCoordinator.sessionData && !state.sessionMirror.validated) {
                safeLogError('Status', fn.name || 'anonymous', new Error('No user session'));
                return defaultValue;
            }
            return fn(...args);
        } catch (error) {
            safeLogError('Status', fn.name || 'anonymous', error);
            return defaultValue;
        }
    };
}

function withApiGuard(fn, defaultValue = null) {
    return async function(...args) {
        try {
            return await fn(...args);
        } catch (error) {
            safeLogError('Status', fn.name || 'anonymous', error);
            return defaultValue;
        }
    };
}

function safeGetElement(selector) {
    try {
        const element = document.querySelector(selector);
        if (!element) safeLogError('Status', 'safeGetElement', new Error(`Element not found: ${selector}`));
        return element;
    } catch (error) {
        safeLogError('Status', 'safeGetElement', error);
        return null;
    }
}

// =============================================
// STUB FUNCTIONS FOR COMPATIBILITY
// =============================================
function getFriendsStatuses() {
    try { return friendsStatuses || []; } catch (error) { safeLogError('Status', 'getFriendsStatuses', error); return []; }
}

function getCloseFriendsStatuses() {
    try { return closeFriendsStatuses || []; } catch (error) { safeLogError('Status', 'getCloseFriendsStatuses', error); return []; }
}

function getMicroCirclesStatuses() {
    try { return microCirclesStatuses || []; } catch (error) { safeLogError('Status', 'getMicroCirclesStatuses', error); return []; }
}

function getMutedStatuses() {
    try { return mutedStatuses || []; } catch (error) { safeLogError('Status', 'getMutedStatuses', error); return []; }
}

function setCurrentViewerStatus(status) {
    try { currentViewerStatus = status; } catch (error) { safeLogError('Status', 'setCurrentViewerStatus', error); }
}

function getCurrentViewerStatus() {
    try { return currentViewerStatus; } catch (error) { safeLogError('Status', 'getCurrentViewerStatus', error); return null; }
}

function setCurrentSlideIndex(index) {
    try { currentSlideIndex = index || 0; } catch (error) { safeLogError('Status', 'setCurrentSlideIndex', error); }
}

function getCurrentSlideIndex() {
    try { return currentSlideIndex || 0; } catch (error) { safeLogError('Status', 'getCurrentSlideIndex', error); return 0; }
}

function toggleAutoAdvancePause() {
    try { isAutoAdvancePaused = !isAutoAdvancePaused; return isAutoAdvancePaused; } catch (error) { safeLogError('Status', 'toggleAutoAdvancePause', error); return false; }
}

function setCurrentCategoryFilter(category) {
    try { currentCategoryFilter = category || 'all'; } catch (error) { safeLogError('Status', 'setCurrentCategoryFilter', error); }
}

function getCurrentCategoryFilter() {
    try { return currentCategoryFilter || 'all'; } catch (error) { safeLogError('Status', 'getCurrentCategoryFilter', error); return 'all'; }
}

function setCurrentIntentFilter(intent) {
    try { currentIntentFilter = intent; } catch (error) { safeLogError('Status', 'setCurrentIntentFilter', error); }
}

function getCurrentIntentFilter() {
    try { return currentIntentFilter; } catch (error) { safeLogError('Status', 'getCurrentIntentFilter', error); return null; }
}

function setCurrentMoodFilter(mood) {
    try { currentMoodFilter = mood; } catch (error) { safeLogError('Status', 'setCurrentMoodFilter', error); }
}

function getCurrentMoodFilter() {
    try { return currentMoodFilter; } catch (error) { safeLogError('Status', 'getCurrentMoodFilter', error); return null; }
}

function getPendingReplies() {
    try { return pendingReplies || []; } catch (error) { safeLogError('Status', 'getPendingReplies', error); return []; }
}

function getPendingReactions() {
    try { return pendingReactions || []; } catch (error) { safeLogError('Status', 'getPendingReactions', error); return []; }
}

function getMoodChartData() {
    try { return moodChartData || []; } catch (error) { safeLogError('Status', 'getMoodChartData', error); return []; }
}

function getStreakCount() {
    try { return streakCount || 0; } catch (error) { safeLogError('Status', 'getStreakCount', error); return 0; }
}

function getLastPostDate() {
    try { return lastPostDate; } catch (error) { safeLogError('Status', 'getLastPostDate', error); return null; }
}

function getActiveFilters() {
    try { return activeFilters || new Set(); } catch (error) { safeLogError('Status', 'getActiveFilters', error); return new Set(); }
}

function getSelectedDraft() {
    try { return selectedDraft; } catch (error) { safeLogError('Status', 'getSelectedDraft', error); return null; }
}

function setSelectedDraft(draft) {
    try { selectedDraft = draft; } catch (error) { safeLogError('Status', 'setSelectedDraft', error); }
}

// =============================================
// NEW FUNCTION: updateLocalStateWithSession - REQUIRED BY status-ui.js
// =============================================
function updateLocalStateWithSession(sessionData) {
    try {
        if (!sessionData) return false;
        
        log(LOG_LEVEL.INFO, 'Session', 'Updating local state with session data');
        
        // Update currentUser
        if (sessionData.user) {
            currentUser = sessionData.user;
            userData = sessionData.user;
            
            // Cache user
            SecureStorage.setJSON(LOCAL_STORAGE_KEYS.USER, sessionData.user);
        }
        
        // Update token
        if (sessionData.token) {
            SecureStorage.set(UNIFIED_TOKEN_KEY, sessionData.token);
            state.token = sessionData.token;
        }
        
        // Update permissions
        if (sessionData.permissions && Array.isArray(sessionData.permissions)) {
            state.permissionsGranted = [...sessionData.permissions];
        }
        
        // Update session mirror
        updateSessionMirror(sessionData, 'local_update');
        
        // Trigger token ready
        isTokenReady = true;
        triggerTokenReadyCallbacks();
        processPendingApiRequests();
        
        log(LOG_LEVEL.INFO, 'Session', 'Local state updated from session', {
            user: sessionData.user?.id,
            hasToken: !!sessionData.token
        });
        
        return true;
    } catch (error) {
        safeLogError('Status', 'updateLocalStateWithSession', error);
        return false;
    }
}

// =============================================
// CLEANUP AND MEMORY MANAGEMENT
// =============================================
function cleanup() {
    try {
        if (apiCheckInterval) { clearInterval(apiCheckInterval); apiCheckInterval = null; }
        if (parentCoordinator.handshakeInterval) { clearInterval(parentCoordinator.handshakeInterval); parentCoordinator.handshakeInterval = null; }
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
        if (autoAdvanceInterval) { clearInterval(autoAdvanceInterval); autoAdvanceInterval = null; }
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
        if (parentCoordinator.handshakeTimeout) { clearTimeout(parentCoordinator.handshakeTimeout); parentCoordinator.handshakeTimeout = null; }
        if (activityThrottleTimer) { clearTimeout(activityThrottleTimer); activityThrottleTimer = null; }
        if (HandshakeClient.timer) { clearTimeout(HandshakeClient.timer); HandshakeClient.timer = null; }
        
        cleanupEventListeners();
        
        tokenReadyCallbacks = [];
        pendingApiRequests = [];
        
        parentCoordinator.handshakeInProgress = false;
        parentCoordinator.sessionValid = false;
        parentCoordinator.sessionRequestSent = false;
        parentCoordinator.handshakeRetries = 0;
        
        errorLogCounts = {};
        retryCounts = {};
        messageCache.clear();
        
        shutdownCore().catch(() => {});
        
    } catch (error) {
        safeLogError('Status', 'cleanup', error);
    }
}

function cleanupEventListeners() {
    try {
        activityEventHandlers.forEach(({ element, type, handler }) => {
            try { element.removeEventListener(type, handler); } catch (error) {}
        });
        activityEventHandlers = [];
        
        window.removeEventListener('message', handleEnhancedParentMessage);
        window.removeEventListener('message', receiveFromParent);
        
        isTrackingInitialized = false;
    } catch (error) {
        safeLogError('Status', 'cleanupEventListeners', error);
    }
}

// =============================================
// SAFE INITIALIZATION WITH PARENT HANDSHAKE
// =============================================
let _PARENT_READY_ = false;
let _HANDSHAKE_DONE_ = false;
let _HANDSHAKE_RETRIES_ = 0;
const MAX_HANDSHAKE = 3;
let _INITIALIZATION_STARTED_ = false;
let _UI_BINDING_DONE_ = false;
let _CORE_READY_ = false;
let _PAGE_LOADED_ = false;
let _LOADING_MESSAGE_ = null;
let _ERROR_CACHE_ = new Set();

function logOnce(level, msg) {
    if (_ERROR_CACHE_.has(msg)) return;
    _ERROR_CACHE_.add(msg);
    log(level, 'StatusCore', msg);
}

async function safeInit() {
    if (_INITIALIZATION_STARTED_) {
        logOnce(LOG_LEVEL.WARN, 'Initialization already started');
        return;
    }
    
    _INITIALIZATION_STARTED_ = true;
    
    let tries = 0;
    const maxTries = 5;
    
    logOnce(LOG_LEVEL.INFO, 'Starting safe initialization');
    
    // Use ParentDetector for reliable detection
    const parentAvailable = await ParentDetector.detect();
    
    if (parentAvailable) {
        logOnce(LOG_LEVEL.INFO, 'Parent handshake establishing');
        
        // Execute handshake
        const handshakeResult = await HandshakeClient.execute({ maxRetries: 3 }).catch(() => null);
        
        if (handshakeResult && handshakeResult.success) {
            _PARENT_READY_ = true;
            _HANDSHAKE_DONE_ = true;
            logOnce(LOG_LEVEL.INFO, 'Parent handshake established');
        } else {
            logOnce(LOG_LEVEL.WARN, 'Running in fallback mode - handshake failed');
            
            // Try to load from mirror
            if (state.sessionMirror.validated) {
                activateSessionFromMirror();
            } else {
                enableGuestMode();
            }
        }
    } else {
        logOnce(LOG_LEVEL.WARN, 'Running in fallback mode - parent not ready');
        
        if (state.sessionMirror.validated) {
            activateSessionFromMirror();
        } else {
            enableGuestMode();
        }
    }
    
    try {
        logOnce(LOG_LEVEL.INFO, 'Binding UI immediately');
        initializeUIWithCachedData();
        
        setTimeout(async () => {
            try {
                await bootstrapApp();
                setTimeout(() => { initializeUserStatusTracking(); }, 1000);
            } catch (error) {
                safeLogError('Status', 'safeInit.bootstrap', error);
            }
        }, 50);
        
    } catch (e) {
        logOnce(LOG_LEVEL.ERROR, `Initialization failed: ${e.message}`);
    }
}

function notifyParentReady() {
    if (_HANDSHAKE_DONE_) return;
    
    if (_HANDSHAKE_RETRIES_ >= MAX_HANDSHAKE) {
        logOnce(LOG_LEVEL.WARN, `Handshake failed after ${MAX_HANDSHAKE} attempts`);
        return;
    }
    
    if (window.parent && window.parent !== window) {
        try {
            const message = signMessage({
                type: MESSAGE_TYPES.IFRAME_READY,
                source: 'iframe',
                page: location.pathname,
                module: 'status-core',
                timestamp: Date.now(),
                version: '2.0',
                protocolVersion: state.protocolVersion
            });
            
            window.parent.postMessage(message, '*');
            
            _HANDSHAKE_RETRIES_++;
            logOnce(LOG_LEVEL.INFO, `Handshake attempt ${_HANDSHAKE_RETRIES_}/${MAX_HANDSHAKE}`);
        } catch (error) {
            logOnce(LOG_LEVEL.ERROR, 'Failed to send handshake to parent');
        }
    }
}

function initPageCore() {
    try {
        setTimeout(() => {
            safeInit().catch(error => {
                safeLogError('Status', 'initPageCore.safeInit', error);
            });
        }, 50);
    } catch (error) {
        safeLogError('Status', 'initPageCore', error);
    }
}

// =============================================
// PAGE CORE COMPATIBILITY LAYER
// =============================================
const pageCore = {
    isReady: () => state.initialized,
    getData: (type) => {
        switch(type) {
            case 'statuses': return statuses;
            case 'myStatuses': return myStatuses;
            case 'friendsList': return [];
            case 'notifications': return [];
            default: return null;
        }
    },
    updateData: () => {},
    showMessage: () => {},
    sendToParent
};

// =============================================
// AUTO-CLEANUP ON UNLOAD
// =============================================
if (typeof window !== 'undefined') {
    try {
        window.addEventListener('beforeunload', cleanup);
        window.addEventListener('pagehide', cleanup);
    } catch (error) {
        safeLogError('Status', 'initPageCore.eventListeners', error);
    }
}

// =============================================
// GLOBAL EXPOSURE - LEGACY SUPPORT
// =============================================
if (typeof window !== 'undefined') {
    try {
        window.statusCore = {
            initializeCore,
            startHandshake,
            sendToParent,
            requestSession,
            receiveFromParent,
            shutdownCore,
            initializeParentCoordination,
            getUnifiedToken,
            secureApiCall,
            initializeUserStatusTracking,
            cleanup,
            generateSampleMoodData,
            startSecureHandshake,
            safeLogError,
            withUserGuard,
            withApiGuard,
            safeGetElement,
            logOnce,
            safeInit,
            getData: pageCore.getData,
            updateData: pageCore.updateData,
            isReady: () => state.initialized || pageCore.isReady(),
            getHealthMetrics,
            getSession,
            isSessionValid,
            UNIFIED_TOKEN_KEY,
            LOCAL_STORAGE_KEYS,
            bootstrapApplication,
            handleSessionData,
            validateSessionData,
            updateLocalStateWithSession,
            handleSessionUpdate,
            handleLogout,
            handleParentUnavailable,
            startBackgroundInitializationWithSession,
            makeParentApiRequest,
            handleAuthValidated,
            waitForTokenReady,
            onTokenReady,
            triggerTokenReadyCallbacks,
            migrateLegacyTokens,
            isAuthenticated,
            queueApiRequest,
            processPendingApiRequests,
            startTokenReadinessCheck,
            initializeUIWithCachedData,
            loadUserFromCache,
            loadCachedDataInstantly,
            startBackgroundInitialization,
            loadFreshDataInBackground,
            safeApiOperation,
            loadStatusesInBackground,
            loadMyStatusesInBackground,
            loadHighlightsInBackground,
            loadUserDataInBackground,
            handleAuthError,
            initializeStatusSystem,
            loadInitialData,
            filterStatusesByPrivacy,
            getStatusPreviewText,
            filterStatusesByType,
            getEmptyStateMessage,
            addReactionToStatus,
            voteOnPoll,
            pinStatus,
            unpinStatus,
            muteUser,
            unmuteUser,
            postStatus,
            sanitizeStatusData,
            validateStatusPayload,
            updateStreakCounter,
            scheduleStatus,
            saveDraft,
            reportStatus,
            escapeHtml,
            formatTimeAgo,
            retryOperation,
            getFriendsStatuses,
            getCloseFriendsStatuses,
            getMicroCirclesStatuses,
            getMutedStatuses,
            setCurrentViewerStatus,
            getCurrentViewerStatus,
            setCurrentSlideIndex,
            getCurrentSlideIndex,
            toggleAutoAdvancePause,
            setCurrentCategoryFilter,
            getCurrentCategoryFilter,
            setCurrentIntentFilter,
            getCurrentIntentFilter,
            setCurrentMoodFilter,
            getCurrentMoodFilter,
            getPendingReplies,
            getPendingReactions,
            getMoodChartData,
            getStreakCount,
            getLastPostDate,
            getActiveFilters,
            getSelectedDraft,
            setSelectedDraft,
            
            // New exports
            HandshakeClient,
            ParentDetector,
            SecureStorage,
            MessageFirewall,
            getSessionMirror,
            isSessionMirrorValid
        };
    } catch (error) {
        safeLogError('Status', 'globalExposure', error);
    }
}

// =============================================
// EXPORT CONTRACT - ALL SYMBOLS REQUIRED BY status-ui.js
// =============================================
export {
    // Core state & session
    currentUser,
    userData,
    statuses,
    myStatuses,
    friendsStatuses,
    closeFriendsStatuses,
    pinnedStatuses,
    mutedStatuses,
    microCirclesStatuses,
    highlights,
    drafts,
    scheduledStatuses,
    viewedStatuses,
    mutedUsers,
    currentViewerStatus,
    currentSlideIndex,
    autoAdvanceInterval,
    isAutoAdvancePaused,
    progressInterval,
    currentCategoryFilter,
    currentIntentFilter,
    currentMoodFilter,
    isMobile,
    isOfflineMode,
    pendingReplies,
    pendingReactions,
    moodChartData,
    streakCount,
    lastPostDate,
    activeFilters,
    selectedDraft,
    isBackgroundInitialized,
    isTokenReady,
    
    // Parent coordination
    parentCoordinator,
    
    // Status definitions
    statusTypes,
    statusIntents,
    statusMoods,
    statusCategories,
    actionButtons,
    privacySettings,
    durationOptions,
    reportReasons,
    reactions,
    emojis,
    backgroundOptions,
    statusTemplates,
    
    // Storage keys
    LOCAL_STORAGE_KEYS,
    UNIFIED_TOKEN_KEY,
    
    // Core functions - ALL REQUIRED BY UI
    initializeCore,
    startHandshake,
    sendToParent,
    requestSession,
    receiveFromParent,
    shutdownCore,
    getHealthMetrics,
    getSession,
    isSessionValid,
    registerFeature,
    executeFeature,
    initializeParentCoordination,
    getUnifiedToken,
    secureApiCall,
    initializeUserStatusTracking,
    cleanup,
    generateSampleMoodData,
    startSecureHandshake,
    safeLogError,
    withUserGuard,
    withApiGuard,
    safeGetElement,
    logOnce,
    safeInit,
    initPageCore,
    bootstrapApp,
    bootstrapApplication,
    handleSessionData,
    validateSessionData,
    updateLocalStateWithSession,
    handleSessionUpdate,
    handleLogout,
    handleParentUnavailable,
    startBackgroundInitializationWithSession,
    makeParentApiRequest,
    handleAuthValidated,
    waitForTokenReady,
    onTokenReady,
    triggerTokenReadyCallbacks,
    migrateLegacyTokens,
    isAuthenticated,
    queueApiRequest,
    processPendingApiRequests,
    startTokenReadinessCheck,
    initializeUIWithCachedData,
    loadUserFromCache,
    loadCachedDataInstantly,
    startBackgroundInitialization,
    loadFreshDataInBackground,
    safeApiOperation,
    loadStatusesInBackground,
    loadMyStatusesInBackground,
    loadHighlightsInBackground,
    loadUserDataInBackground,
    handleAuthError,
    initializeStatusSystem,
    loadInitialData,
    filterStatusesByPrivacy,
    getStatusPreviewText,
    filterStatusesByType,
    getEmptyStateMessage,
    addReactionToStatus,
    voteOnPoll,
    pinStatus,
    unpinStatus,
    muteUser,
    unmuteUser,
    postStatus,
    sanitizeStatusData,
    validateStatusPayload,
    updateStreakCounter,
    scheduleStatus,
    saveDraft,
    reportStatus,
    escapeHtml,
    formatTimeAgo,
    retryOperation,
    getFriendsStatuses,
    getCloseFriendsStatuses,
    getMicroCirclesStatuses,
    getMutedStatuses,
    setCurrentViewerStatus,
    getCurrentViewerStatus,
    setCurrentSlideIndex,
    getCurrentSlideIndex,
    toggleAutoAdvancePause,
    setCurrentCategoryFilter,
    getCurrentCategoryFilter,
    setCurrentIntentFilter,
    getCurrentIntentFilter,
    setCurrentMoodFilter,
    getCurrentMoodFilter,
    getPendingReplies,
    getPendingReactions,
    getMoodChartData,
    getStreakCount,
    getLastPostDate,
    getActiveFilters,
    getSelectedDraft,
    setSelectedDraft,
    
    // New exports for enhanced functionality
    getSessionMirror,
    isSessionMirrorValid
};

// =============================================
// CORE INITIALIZATION - AUTOMATIC
// =============================================
if (typeof window !== 'undefined' && !state.initialized) {
    setTimeout(() => {
        initPageCore();
    }, 10);
}

console.log('[Status] Core system initialized successfully (v2.1 - hardened)');