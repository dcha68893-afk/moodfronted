// calls-core.js
// ==================== CALL IFRAME CORE MODULE - PROTOCOL COMPLIANT ====================
// Version: 7.2.3 - PROTOCOL COMPLIANT: Strict message schema, parent-controlled lifecycle
// ====================================================================================

(function() {
    'use strict';

    const MODULE_NAME = 'calls';  // EXACT module name per contract
    let state = 'INITIALIZING';    // Start in INITIALIZING per lifecycle
    const processedMessages = new Set();
    const allowedOrigins = [
        window.location.origin,
        'http://localhost',
        'http://127.0.0.1',
        null
    ];
    let childReadySent = false;
    let registrationSent = false;
    let parentReadyReceived = false;
    
    // ==================== MESSAGE QUEUE SYSTEM ====================
    const messageQueue = [];
    let parentReady = false;
    
    // ==================== ID GENERATION ====================
    function generateId() {
        return 'msg_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    }
    
    function generateRequestId() {
        return 'req_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    }

    // ==================== MODULE LIFECYCLE STATES ====================
    const LIFECYCLE_STATE = {
        BOOTING: 'BOOTING',
        INITIALIZING: 'INITIALIZING',
        READY: 'READY',
        WAIT_PARENT: 'WAIT_PARENT',
        ACTIVE: 'ACTIVE'
    };

    // Strict state transition validation
    function setState(next) {
        if (state === next) return;

        const validTransitions = {
            INITIALIZING: ['READY'],           // Updated to match contract
            READY: ['WAIT_PARENT'],
            WAIT_PARENT: ['ACTIVE'],
            ACTIVE: [],
            BOOTING: ['INITIALIZING']          // Keep for backward compatibility
        };

        // Normalize state for transition checking
        const currentState = state === 'BOOTING' ? 'INITIALIZING' : state;
        
        if (!validTransitions[currentState]?.includes(next)) {
            console.warn(`[${MODULE_NAME}] Invalid transition: ${state} → ${next}`);
            return;
        }

        console.log(`[${MODULE_NAME}] Lifecycle: ${state} → ${next}`);
        state = next;
    }

    // ==================== STANDARDIZED MESSAGE SENDER ====================
    function sendMessage(type, payload = {}, requireAck = false) {
        try {
            // Only send if in WAIT_PARENT or ACTIVE state
            if (state !== 'WAIT_PARENT' && state !== 'ACTIVE') {
                console.warn(`[${MODULE_NAME}] Cannot send ${type} - invalid state: ${state}`);
                return Promise.resolve({ success: false, reason: 'invalid_state' });
            }
            
            const messageId = generateId();
            const requestId = generateRequestId();
            
            // ENFORCE EXACT PROTOCOL SCHEMA
            const message = {
                type: type,
                id: messageId,
                requestId: requestId,
                source: MODULE_NAME,           // EXACT module name
                target: 'parent',               // REQUIRED
                timestamp: Date.now(),
                payload: payload
            };

            console.log(`[${MODULE_NAME}] 📤 ${type}`, { messageId, requestId });
            window.parent.postMessage(message, '*');
            
            if (requireAck) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({ success: true, messageId, requestId, timeout: true });
                    }, 3000);
                });
            }
            
            return Promise.resolve({ success: true, messageId, requestId });
        } catch (error) {
            console.error(`[${MODULE_NAME}] Failed to send ${type}`, error);
            return Promise.reject(error);
        }
    }

    // ==================== SAFE SEND WITH QUEUE ====================
    function safeSend(type, payload = {}, requireAck = false) {
        // CRITICAL: No outbound messages before PARENT_READY
        if (!parentReady) {
            console.log(`[${MODULE_NAME}] Queueing ${type} - parent not ready`);
            const queuedMessage = { type, payload, requireAck, timestamp: Date.now() };
            messageQueue.push(queuedMessage);
            
            // Return a promise that will resolve when sent
            return new Promise((resolve) => {
                // Store resolve function with the queued message
                queuedMessage.resolve = resolve;
            });
        }
        
        return sendMessage(type, payload, requireAck);
    }

    // ==================== FLUSH QUEUE ====================
    function flushQueue() {
        console.log(`[${MODULE_NAME}] Flushing ${messageQueue.length} queued messages`);
        
        while (messageQueue.length) {
            const queued = messageQueue.shift();
            const result = sendMessage(queued.type, queued.payload, queued.requireAck);
            
            // Resolve the promise if one was stored
            if (queued.resolve) {
                result.then(queued.resolve).catch(queued.resolve);
            }
        }
    }

    // Safe CHILD_READY sender - only sends once and only from READY state
    function sendChildReady() {
        if (childReadySent) {
            console.warn(`[${MODULE_NAME}] CHILD_READY already sent, ignoring`);
            return;
        }
        
        // CRITICAL: ONLY send CHILD_READY when state === "READY"
        if (state !== 'READY') {
            console.warn(`[${MODULE_NAME}] Cannot send CHILD_READY - not in READY state (current: ${state})`);
            return;
        }
        
        childReadySent = true;
        callsState.childReadySent = true;
        
        // EXACT format per contract
        safeSend('CHILD_READY', { module: MODULE_NAME });
        
        console.log(`[${MODULE_NAME}] ✅ CHILD_READY sent`);
        setState('WAIT_PARENT');
    }

    // ==================== REGISTER MODULE ====================
    function registerModule() {
        if (registrationSent) {
            console.warn(`[${MODULE_NAME}] REGISTER_MODULE already sent, ignoring`);
            return;
        }
        
        registrationSent = true;
        callsState.registrationSent = true;
        
        // CRITICAL: Only send if parent is ready
        if (!parentReady) {
            console.warn(`[${MODULE_NAME}] Cannot register - parent not ready`);
            return;
        }
        
        safeSend('REGISTER_MODULE', {
            moduleName: MODULE_NAME,
            version: CONFIG.VERSION,
            capabilities: [
                'voice',
                'video',
                'screenShare',
                'whiteboard',
                'polls',
                'notes'
            ]
        }, false);
        
        console.log(`[${MODULE_NAME}] ✅ REGISTER_MODULE sent`);
        setState('ACTIVE');
        callsState.registered = true;
        
        window.dispatchEvent(new CustomEvent('MODULE_READY', {
            detail: { module: MODULE_NAME, timestamp: Date.now() }
        }));
    }

    // ==================== REQUEST SESSION ====================
    function requestSession() {
        // CRITICAL: ONLY request session after parent ready
        if (!parentReady) {
            console.warn(`[${MODULE_NAME}] Cannot request session - parent not ready`);
            return;
        }
        
        if (state !== 'ACTIVE') {
            console.warn(`[${MODULE_NAME}] Cannot request session - invalid state: ${state}`);
            return;
        }

        if (IframeTransport._sessionRequested) return;

        IframeTransport._sessionRequested = true;

        if (IframeTransport._sessionRequestTimer) {
            clearTimeout(IframeTransport._sessionRequestTimer);
        }

        IframeTransport._sessionRequestTimer = setTimeout(() => {
            IframeTransport._sessionRequested = false;
        }, 10000);

        // Use safeSend which now has parentReady=true
        safeSend('REQUEST_SESSION', {
            timestamp: Date.now(),
            frameId: window.name || 'calls-iframe'
        }, false).catch(() => {});

        console.log(`[${MODULE_NAME}] 📤 REQUEST_SESSION sent`);
    }

    function sendHeartbeatAck(originalMessageId) {
        if (state !== 'ACTIVE') return;
        if (!parentReady) return;  // CRITICAL: No messages before parent ready
        
        safeSend('HEARTBEAT_ACK', {
            ackId: originalMessageId,
            module: MODULE_NAME,
            timestamp: Date.now()
        });
    }

    // ==================== GLOBAL CALL STATE STRUCTURE ====================
    const callsState = {
        moduleName: MODULE_NAME,
        lifecycleState: LIFECYCLE_STATE.INITIALIZING,
        registered: false,
        parentReady: false,
        parentOrigin: null,
        parentOriginLocked: false,
        initialized: false,
        session: null,
        sessionStatus: 'pending',
        token: null,
        verified: false,
        verificationLock: false,
        heartbeatEnabled: false,
        callActive: false,
        pendingCall: null,
        webrtcInitialized: false,
        recoveryMode: false,
        sessionReceived: false,
        
        // Local media state
        localStream: null,
        remoteStream: null,
        remoteStreams: new Map(),
        micEnabled: true,
        cameraEnabled: false,
        cameraFacingMode: 'user',
        screenSharing: false,
        mediaDevices: {
            audioInput: [],
            videoInput: [],
            audioOutput: []
        },
        
        // Call state
        activeCallId: null,
        callParticipants: [],
        callStartTime: null,
        callDuration: 0,
        callType: null,
        callInvitationTimer: null,
        callInvitationTimeout: 30000,
        
        // WebRTC
        peerConnection: null,
        iceCandidates: [],
        iceRestartCount: 0,
        maxIceRestarts: 3,
        
        // UI state
        currentMood: 'neutral',
        currentIntention: 'quick',
        currentFocusMode: false,
        currentPanel: 'participants',
        
        // Premium features
        isPremium: false,
        premiumFeatures: {
            groupCalls: false,
            screenSharing: false,
            whiteboard: false,
            polls: false,
            relationshipInsights: false,
            callLinks: false
        },
        
        // Retry tracking
        childReadySent: false,
        registrationSent: false,
        
        // Message tracking
        processedMessageIds: new Set(),
        lastMessageCleanup: Date.now()
    };

    // ==================== CLEAN LOGGING SYSTEM ====================
    const _infoLogs = new Map();
    const _warnLogs = new Map();
    const _errorLogs = new Map();
    const _successLogs = new Map();
    const _sendingLogs = new Map();
    const _readyLogs = new Map();
    const _stateLogs = new Map();
    const _sessionLogs = new Map();
    const _heartbeatLogs = new Map();

    function logInfo(module, message, data = null) {
        const key = `${module}:${message}`;
        if (_infoLogs.has(key)) {
            const lastTime = _infoLogs.get(key);
            if (Date.now() - lastTime < 5000) return;
        }
        _infoLogs.set(key, Date.now());
        setTimeout(() => _infoLogs.delete(key), 5000);
        console.log(`[${module}] ℹ️ ${message}`, data ? data : '');
    }

    function logWarn(module, message, data = null) {
        const key = `${module}:${message}`;
        if (_warnLogs.has(key)) {
            const lastTime = _warnLogs.get(key);
            if (Date.now() - lastTime < 10000) return;
        }
        _warnLogs.set(key, Date.now());
        setTimeout(() => _warnLogs.delete(key), 10000);
        console.warn(`[${module}] ⚠️ ${message}`, data ? data : '');
    }

    function logError(module, message, error = null, data = null) {
        const key = `${module}:${message}`;
        if (_errorLogs.has(key)) {
            const lastTime = _errorLogs.get(key);
            if (Date.now() - lastTime < 30000) return;
        }
        _errorLogs.set(key, Date.now());
        setTimeout(() => _errorLogs.delete(key), 30000);
        console.error(`[${module}] 🔴 ${message}`, error ? error : '', data ? data : '');
    }

    function logSuccess(module, message, data = null) {
        const key = `${module}:${message}`;
        if (_successLogs.has(key)) {
            const lastTime = _successLogs.get(key);
            if (Date.now() - lastTime < 5000) return;
        }
        _successLogs.set(key, Date.now());
        setTimeout(() => _successLogs.delete(key), 5000);
        console.log(`[${module}] ✅ ${message}`, data ? data : '');
    }

    function logSending(module, message, data = null) {
        const key = `${module}:${message}`;
        if (_sendingLogs.has(key)) {
            const lastTime = _sendingLogs.get(key);
            if (Date.now() - lastTime < 2000) return;
        }
        _sendingLogs.set(key, Date.now());
        setTimeout(() => _sendingLogs.delete(key), 2000);
        console.log(`[${module}] 📤 ${message}`, data ? data : '');
    }

    function logReady(module, message, data = null) {
        const key = `${module}:${message}`;
        if (_readyLogs.has(key)) {
            const lastTime = _readyLogs.get(key);
            if (Date.now() - lastTime < 30000) return;
        }
        _readyLogs.set(key, Date.now());
        setTimeout(() => _readyLogs.delete(key), 30000);
        console.log(`[${module}] 🔵 ${message}`, data ? data : '');
    }

    function logState(module, fromState, toState, reason = '') {
        const key = `${module}:${fromState}→${toState}`;
        if (_stateLogs.has(key)) {
            const lastTime = _stateLogs.get(key);
            if (Date.now() - lastTime < 1000) return;
        }
        _stateLogs.set(key, Date.now());
        setTimeout(() => _stateLogs.delete(key), 1000);
        console.log(`[${module}] 📊 ${fromState} → ${toState}${reason ? ` (${reason})` : ''}`);
    }

    function logSession(module, message, data = null) {
        const key = `${module}:session:${message}`;
        if (_sessionLogs.has(key)) {
            const lastTime = _sessionLogs.get(key);
            if (Date.now() - lastTime < 10000) return;
        }
        _sessionLogs.set(key, Date.now());
        setTimeout(() => _sessionLogs.delete(key), 10000);
        console.log(`[${module}] 🎫 ${message}`, data ? data : '');
    }

    function logHeartbeat(module, message, data = null) {
        const key = `${module}:heartbeat:${message}`;
        if (_heartbeatLogs.has(key)) {
            const lastTime = _heartbeatLogs.get(key);
            if (Date.now() - lastTime < 2000) return;
        }
        _heartbeatLogs.set(key, Date.now());
        setTimeout(() => _heartbeatLogs.delete(key), 2000);
        console.log(`[${module}] 💓 ${message}`, data ? data : '');
    }

    const MODULE = 'CallsCore';

    // ==================== CALLS STATE MACHINE ====================
    const CALLS_STATE = {
        INIT: 'INIT',
        REGISTERING: 'REGISTERING',
        REGISTERED: 'REGISTERED',
        SESSION_PENDING: 'SESSION_PENDING',
        SESSION_RECEIVED: 'SESSION_RECEIVED',
        ACTIVE: 'ACTIVE',
        CALL_READY: 'CALL_READY',
        IN_CALL: 'IN_CALL',
        TERMINATED: 'TERMINATED'
    };

    // V5 state mapping for backward compatibility
    const V5_STATE = {
        BOOTING: 'BOOTING',
        REGISTERING: 'REGISTERING',
        WAITING_SESSION: 'WAITING_SESSION',
        WAITING_PARENT_READY: 'WAITING_PARENT_READY',
        ACTIVE: 'ACTIVE',
        DEGRADED: 'DEGRADED',
        RECOVERY: 'RECOVERY',
        STANDALONE: 'STANDALONE',
        OFFLINE: 'OFFLINE'
    };

    const STATE = {
        UNINITIALIZED: 'UNINITIALIZED',
        BOOTSTRAPPING: 'BOOTSTRAPPING',
        REGISTERING: 'REGISTERING',
        REGISTERED: 'REGISTERED',
        SESSION_PENDING: 'SESSION_PENDING',
        SESSION_ACTIVE: 'SESSION_ACTIVE',
        SERVICES_INITIALIZING: 'SERVICES_INITIALIZING',
        ACTIVE: 'ACTIVE',
        ERROR_RECOVERABLE: 'ERROR_RECOVERABLE',
        ERROR_FATAL: 'ERROR_FATAL',
        RECOVERING: 'RECOVERING',
        INIT: 'INIT',
        PREFLIGHT: 'PREFLIGHT',
        DEPENDENCY: 'DEPENDENCY',
        PARENT_DETECT: 'PARENT_DETECT',
        SYNC: 'SYNC',
        PERMISSIONS: 'PERMISSIONS',
        READY: 'READY',
        SUSPENDED: 'SUSPENDED',
        DEGRADED: 'DEGRADED',
        DESTROYED: 'DESTROYED',
        HANDSHAKE_IDLE: 'HANDSHAKE_IDLE',
        HANDSHAKE_WAITING: 'HANDSHAKE_WAITING',
        HANDSHAKE_IN_PROGRESS: 'HANDSHAKE_IN_PROGRESS',
        HANDSHAKE_FAILED: 'HANDSHAKE_FAILED',
        SESSION_IDLE: 'SESSION_IDLE',
        SESSION_WAITING: 'SESSION_WAITING',
        SESSION_VALID: 'SESSION_VALID',
        SESSION_EXPIRED: 'SESSION_EXPIRED',
        SESSION_ERROR: 'SESSION_ERROR'
    };

    const CallCoreState = {
        IDLE: 'IDLE',
        WAITING_PARENT: 'WAITING_PARENT',
        WAITING_SESSION: 'WAITING_SESSION',
        SYNCED: 'SYNCED',
        ACTIVE: 'ACTIVE',
        ERROR: 'ERROR',
        RECOVERING: 'RECOVERING'
    };

    // ==================== MESSAGE TYPES ====================
    const MESSAGE_TYPES = {
        // Core lifecycle
        CHILD_READY: 'CHILD_READY',
        PARENT_READY: 'PARENT_READY',
        REGISTER_MODULE: 'REGISTER_MODULE',
        MODULE_REGISTERED: 'MODULE_REGISTERED',
        MODULE_READY: 'MODULE_READY',
        MODULE_INIT_DATA: 'MODULE_INIT_DATA',
        
        // Handshake
        HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
        HANDSHAKE_ACK: 'HANDSHAKE_ACK',
        HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
        HANDSHAKE_RETRY: 'HANDSHAKE_RETRY',

        // Session management
        REQUEST_SESSION: 'REQUEST_SESSION',
        SESSION_ACTIVE: 'SESSION_ACTIVE',
        SESSION_NULL: 'SESSION_NULL',
        SESSION_RESPONSE: 'SESSION_RESPONSE',
        SESSION_DATA: 'SESSION_DATA',
        SESSION_UPDATE: 'SESSION_UPDATE',
        SESSION_SYNC: 'SESSION_SYNC',
        SESSION_ACK: 'SESSION_ACK',
        VERIFY_SESSION: 'VERIFY_SESSION',
        SESSION_VERIFIED: 'SESSION_VERIFIED',
        SESSION_REFRESHED: 'SESSION_REFRESHED',
        SESSION_INVALIDATED: 'SESSION_INVALIDATED',
        SESSION_RECOVERY: 'SESSION_RECOVERY',

        // Heartbeat
        HEARTBEAT: 'HEARTBEAT',
        HEARTBEAT_ACK: 'HEARTBEAT_ACK',

        // ACK
        ACK: 'ACK',

        // API
        API_REQUEST: 'API_REQUEST',
        API_RESPONSE: 'API_RESPONSE',

        // Navigation
        PAGE_ACTIVATED: 'PAGE_ACTIVATED',
        NAVIGATE: 'NAVIGATE',

        // Recovery
        PARENT_RECOVERY: 'PARENT_RECOVERY',
        REQUEST_RESYNC: 'REQUEST_RESYNC',
        PARENT_CRASH_RECOVERY: 'PARENT_CRASH_RECOVERY',
        RECOVERY_REQUEST: 'RECOVERY_REQUEST',

        // Errors
        AUTH_ERROR: 'AUTH_ERROR',
        SESSION_ERROR: 'SESSION_ERROR',

        // Call actions
        ACTION: 'ACTION',
        
        // Call events
        CALL_INCOMING: 'CALL_INCOMING',
        CALL_INITIATED: 'CALL_INITIATED',
        CALL_CONNECTING: 'CALL_CONNECTING',
        CALL_STARTED: 'CALL_STARTED',
        CALL_CONNECTED: 'CALL_CONNECTED',
        CALL_ENDED: 'CALL_ENDED',
        CALL_REJECTED: 'CALL_REJECTED',
        CALL_FAILED: 'CALL_FAILED',
        
        // Signaling messages
        SIGNALING_MESSAGE: 'SIGNALING_MESSAGE',
        SIGNAL_OFFER: 'SIGNAL_OFFER',
        SIGNAL_ANSWER: 'SIGNAL_ANSWER',
        ICE_CANDIDATE: 'ICE_CANDIDATE',
        
        // Remote streams
        REMOTE_STREAM_ADDED: 'REMOTE_STREAM_ADDED',
        REMOTE_STREAM_REMOVED: 'REMOTE_STREAM_REMOVED',

        // Media controls
        AUDIO_MUTED: 'AUDIO_MUTED',
        VIDEO_MUTED: 'VIDEO_MUTED',
        MIC_TOGGLED: 'MIC_TOGGLED',
        CAMERA_TOGGLED: 'CAMERA_TOGGLED',
        CAMERA_SWITCHED: 'CAMERA_SWITCHED',
        SCREEN_SHARE_STARTED: 'SCREEN_SHARE_STARTED',
        SCREEN_SHARE_ENDED: 'SCREEN_SHARE_ENDED',

        // Mood/Intention
        MOOD_UPDATE: 'MOOD_UPDATE',
        INTENTION_UPDATE: 'INTENTION_UPDATE',
        REACTION: 'REACTION',

        // Data sync
        DATA_SYNC_COMPLETE: 'DATA_SYNC_COMPLETE',
        CONTACTS_UPDATE: 'CONTACTS_UPDATE',
        CALL_HISTORY_UPDATE: 'CALL_HISTORY_UPDATE',

        // Token
        REQUEST_TOKEN: 'REQUEST_TOKEN',
        TOKEN_RESPONSE: 'TOKEN_RESPONSE',
        TOKEN_UPDATE: 'TOKEN_UPDATE',

        // Iframe state
        IFRAME_READY: 'IFRAME_READY',
        IFRAME_STATE_CHANGE: 'IFRAME_STATE_CHANGE',
        IFRAME_SUSPENDED: 'IFRAME_SUSPENDED',
        IFRAME_ACTIVE: 'IFRAME_ACTIVE',
        IFRAME_DESTROYED: 'IFRAME_DESTROYED',

        // Network
        NETWORK_RESTORED: 'NETWORK_RESTORED',
        NETWORK_LOST: 'NETWORK_LOST',

        // User events
        USER_LOGGED_OUT: 'USER_LOGGED_OUT',
        USER_LOGGED_IN: 'USER_LOGGED_IN',

        // Updates from other modules
        NEW_MESSAGE: 'NEW_MESSAGE',
        FRIEND_UPDATE: 'FRIEND_UPDATE',
        GROUP_UPDATE: 'GROUP_UPDATE',
        STATUS_UPDATE: 'STATUS_UPDATE',
        SETTINGS_UPDATED: 'SETTINGS_UPDATED'
    };

    // ==================== CONFIGURATION - STRICT LIMITS ====================
    const CONFIG = {
        VERSION: '7.2.3',  // Updated version
        PROTOCOL_VERSION: 'KYN-8.0',
        
        // Strict lifecycle timeouts (kept for safety but not used for logic)
        PARENT_READY_TIMEOUT: 20000,
        REGISTRATION_TIMEOUT: 5000,
        
        // Retry limits
        MAX_REGISTRATION_ATTEMPTS: 1,
        MAX_CHILD_READY_ATTEMPTS: 1,
        
        // Heartbeat
        HEARTBEAT_ACK_TIMEOUT: 1000,
        
        // WebRTC
        ICE_RESTART_TIMEOUT: 5000,
        MAX_ICE_RESTARTS: 3,
        
        // Storage
        STORAGE_PREFIX: 'calls_core_',
        
        // Trusted domains
        TRUSTED_DOMAINS: [
            'moodchat-fy56.onrender.com',
            'moodfronted.onrender.com',
            'localhost',
            '127.0.0.1'
        ],
        
        // Message cache cleanup
        MESSAGE_CACHE_MAX_SIZE: 1000,
        MESSAGE_CACHE_TTL: 30000,
        
        // Queue limits
        MAX_QUEUE_SIZE: 100,
        
        // Message rate limiting
        MAX_MESSAGES_PER_SECOND: 50,
        MESSAGE_WINDOW_MS: 1000
    };

    // ==================== ENVIRONMENT DETECTION ====================
    const ENVIRONMENT = {
        current: null,
        isDevelopment: false,
        isProduction: false,

        detect: function() {
            const hostname = window.location.hostname;
            
            if (hostname === 'localhost' || hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
                this.current = 'development';
                this.isDevelopment = true;
                this.isProduction = false;
            }
            else if (hostname.endsWith('.onrender.com')) {
                this.current = 'production';
                this.isDevelopment = false;
                this.isProduction = true;
            }
            else {
                this.current = 'production';
                this.isDevelopment = false;
                this.isProduction = true;
            }

            logInfo(MODULE, `Environment detected: ${this.current}`);
            return this;
        }
    };

    ENVIRONMENT.detect();

    function isValidOrigin(origin) {
        if (!origin) return true;
        return allowedOrigins.includes(origin) || CONFIG.TRUSTED_DOMAINS.some(domain => 
            origin.includes(domain) || origin === `http://${domain}` || origin === `https://${domain}`
        );
    }

    function isDuplicate(id) {
        if (processedMessages.has(id)) return true;
        processedMessages.add(id);
        if (processedMessages.size > CONFIG.MESSAGE_CACHE_MAX_SIZE) {
            processedMessages.clear();
        }
        return false;
    }

    function validateMessage(msg) {
        return (
            msg &&
            typeof msg.type === 'string' &&
            (msg.source === undefined || typeof msg.source === 'string') &&
            (msg.messageId === undefined || typeof msg.messageId === 'string')
        );
    }

    // ==================== ORIGIN SECURITY ====================
    const OriginSecurity = {
        _trustedOrigins: new Set(),
        _trustedDomains: new Set(CONFIG.TRUSTED_DOMAINS),
        _strictMode: true,
        _cache: new Map(),

        initialize: function() {
            this._addTrustedOrigin(window.location.origin);
            try {
                if (window.parent && window.parent !== window && window.parent.location) {
                    this._addTrustedOrigin(window.parent.location.origin);
                }
            } catch (e) {}

            CONFIG.TRUSTED_DOMAINS.forEach(domain => {
                if (domain.includes('.')) this._trustedDomains.add(domain);
            });

            logReady(MODULE, 'OriginSecurity initialized');
            return this;
        },

        _addTrustedOrigin: function(origin) {
            if (!origin) return;
            try {
                const url = new URL(origin);
                this._trustedOrigins.add(origin);

                const parts = url.hostname.split('.');
                if (parts.length > 2) {
                    const domain = parts.slice(-2).join('.');
                    this._trustedDomains.add(domain);
                }
            } catch (e) {}
        },

        isTrusted: function(origin) {
            if (!origin) return false;
            if (this._cache.has(origin)) return this._cache.get(origin);

            let trusted = false;

            if (this._trustedOrigins.has(origin)) trusted = true;

            if (!trusted) {
                try {
                    const url = new URL(origin);
                    const hostname = url.hostname;

                    for (const domain of this._trustedDomains) {
                        if (hostname === domain || hostname.endsWith('.' + domain)) {
                            trusted = true;
                            break;
                        }
                    }
                } catch (e) {}
            }

            this._cache.set(origin, trusted);
            setTimeout(() => this._cache.delete(origin), 60000);
            return trusted;
        },

        validateEvent: function(event) {
            if (!event || !event.origin) return false;
            return this.isTrusted(event.origin);
        },

        lockParentOrigin: function(origin) {
            if (!callsState.parentOriginLocked && origin) {
                callsState.parentOrigin = origin;
                callsState.parentOriginLocked = true;
                logInfo(MODULE, 'Parent origin locked', { origin });
            }
        },

        getTargetOrigin: function() {
            if (callsState.parentOriginLocked && callsState.parentOrigin) {
                return callsState.parentOrigin;
            }
            try {
                if (window.parent && window.parent.location) {
                    return window.parent.location.origin;
                }
            } catch (e) {}
            return '*';
        },

        getMode: function() {
            return {
                strictMode: this._strictMode,
                trustedOrigins: this._trustedOrigins.size,
                trustedDomains: this._trustedDomains.size,
                parentLocked: callsState.parentOriginLocked
            };
        }
    };

    OriginSecurity.initialize();

    // ==================== SAFE STORAGE ====================
    const SafeStorage = {
        _memory: new Map(),
        _strategy: 'memory',
        _available: null,

        initialize: function() {
            this._checkAvailability();
            logReady(MODULE, `SafeStorage initialized (${this._strategy})`);
            return this;
        },

        _checkAvailability: function() {
            try {
                localStorage.setItem('_test_', '_test_');
                localStorage.removeItem('_test_');
                this._available = true;
                this._strategy = 'local';
            } catch (e) {
                this._available = false;
                this._strategy = 'memory';
            }
        },

        get: function(key, fallback = null) {
            const fullKey = CONFIG.STORAGE_PREFIX + key;
            try {
                if (this._strategy === 'local' && this._available) {
                    const value = localStorage.getItem(fullKey);
                    return value !== null ? this._deserialize(value) : fallback;
                } else {
                    return this._memory.has(fullKey) ? this._memory.get(fullKey) : fallback;
                }
            } catch (e) {
                return fallback;
            }
        },

        set: function(key, value) {
            const fullKey = CONFIG.STORAGE_PREFIX + key;
            const serialized = this._serialize(value);

            try {
                if (this._strategy === 'local' && this._available) {
                    localStorage.setItem(fullKey, serialized);
                } else {
                    this._memory.set(fullKey, value);
                }
                return true;
            } catch (e) {
                return false;
            }
        },

        remove: function(key) {
            const fullKey = CONFIG.STORAGE_PREFIX + key;
            try {
                if (this._strategy === 'local' && this._available) {
                    localStorage.removeItem(fullKey);
                } else {
                    this._memory.delete(fullKey);
                }
                return true;
            } catch (e) {
                return false;
            }
        },

        clear: function() {
            try {
                if (this._strategy === 'local' && this._available) {
                    const keys = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith(CONFIG.STORAGE_PREFIX)) keys.push(key);
                    }
                    keys.forEach(key => localStorage.removeItem(key));
                }
                this._memory.clear();
                return true;
            } catch (e) {
                return false;
            }
        },

        _serialize: function(value) {
            if (value === undefined) return 'undefined';
            if (value === null) return 'null';
            try {
                return JSON.stringify(value);
            } catch (e) {
                return String(value);
            }
        },

        _deserialize: function(str) {
            if (str === 'undefined') return undefined;
            if (str === 'null') return null;
            try {
                return JSON.parse(str);
            } catch (e) {
                return str;
            }
        },

        getStrategy: function() { return this._strategy; },
        isAvailable: function() { return this._available; }
    };

    SafeStorage.initialize();

    // ==================== MESSAGE REGISTRY ====================
    const MessageRegistry = {
        _pendingMessages: new Map(),
        _processedMessages: new Set(),
        _ackTimeout: 3000,
        _cleanupTimer: null,
        _messageRateCounter: 0,
        _messageRateResetTimer: null,

        initialize: function() {
            this._startCleanup();
            this._startRateLimiting();
            logReady(MODULE, 'MessageRegistry initialized');
            return this;
        },

        _startCleanup: function() {
            if (this._cleanupTimer) clearInterval(this._cleanupTimer);
            this._cleanupTimer = setInterval(() => this._cleanup(), 30000);
        },

        _startRateLimiting: function() {
            this._messageRateCounter = 0;
            if (this._messageRateResetTimer) clearInterval(this._messageRateResetTimer);
            this._messageRateResetTimer = setInterval(() => {
                this._messageRateCounter = 0;
            }, CONFIG.MESSAGE_WINDOW_MS);
        },

        _cleanup: function() {
            const now = Date.now();
            
            for (const [messageId, pending] of this._pendingMessages) {
                if (pending.expiry < now) {
                    this._failWithReason(messageId, 'expired');
                }
            }

            if (this._processedMessages.size > CONFIG.MESSAGE_CACHE_MAX_SIZE) {
                this._processedMessages.clear();
            }
            
            if (callsState.processedMessageIds.size > CONFIG.MESSAGE_CACHE_MAX_SIZE) {
                callsState.processedMessageIds.clear();
            }
        },

        register: function(messageId, type, options = {}) {
            if (this._processedMessages.has(messageId)) {
                return Promise.resolve({ success: true, cached: true });
            }

            if (this._messageRateCounter >= CONFIG.MAX_MESSAGES_PER_SECOND) {
                logWarn(MODULE, 'Message rate limit exceeded', { type, messageId });
                return Promise.reject(new Error('Rate limit exceeded'));
            }
            this._messageRateCounter++;

            for (const [id, pending] of this._pendingMessages) {
                if (pending.originalId === messageId || pending.options?.originalId === messageId) {
                    return pending.promise;
                }
            }

            const timeout = options.timeout || this._ackTimeout;

            let resolve, reject;
            const promise = new Promise((res, rej) => {
                resolve = res;
                reject = rej;
            });

            const timer = setTimeout(() => {
                this._failWithReason(messageId, 'timeout');
            }, timeout);

            this._pendingMessages.set(messageId, {
                type,
                resolve,
                reject,
                timer,
                expiry: Date.now() + timeout,
                options,
                originalId: messageId,
                promise
            });

            return promise;
        },

        acknowledge: function(messageId, payload = {}) {
            this._processedMessages.add(messageId);

            let pending = this._pendingMessages.get(messageId);
            
            if (!pending) {
                for (const [id, p] of this._pendingMessages.entries()) {
                    if (p.options && p.options.originalId === messageId) {
                        pending = p;
                        break;
                    }
                }
            }

            if (pending) {
                clearTimeout(pending.timer);
                pending.resolve(payload);
                this._pendingMessages.delete(pending.originalId || messageId);
                return true;
            }

            return false;
        },

        _failWithReason: function(messageId, reason) {
            const pending = this._pendingMessages.get(messageId);
            if (!pending) return;

            clearTimeout(pending.timer);
            pending.reject(new Error(`Message failed: ${reason}`));
            this._pendingMessages.delete(messageId);
        },

        hasPending: function(messageId) {
            return this._pendingMessages.has(messageId);
        },

        getPendingCount: function() {
            return this._pendingMessages.size;
        },

        isProcessed: function(messageId) {
            return this._processedMessages.has(messageId) || 
                   callsState.processedMessageIds.has(messageId);
        },

        reset: function() {
            for (const [messageId, pending] of this._pendingMessages) {
                clearTimeout(pending.timer);
                pending.reject(new Error('Registry reset'));
            }
            this._pendingMessages.clear();
            this._processedMessages.clear();
        }
    };

    MessageRegistry.initialize();

    // ==================== IFRAME TRANSPORT - PARENT-CONTROLLED ====================
    const IframeTransport = {
        _messageId: 0,
        _queue: [],
        _processing: false,
        _online: navigator.onLine,
        _listeners: new Set(),
        _targetOrigin: OriginSecurity.getTargetOrigin(),
        _sessionRequested: false,
        _sessionRequestTimer: null,
        _sessionActive: false,
        _messageHandler: null,
        _rateLimitCounter: 0,
        _rateLimitResetTimer: null,

        initialize: function() {
            this._setupMessageHandler();
            this._setupListeners();
            this._startRateLimiting();
            logReady(MODULE, 'IframeTransport initialized');
            return this;
        },

        _startRateLimiting: function() {
            this._rateLimitCounter = 0;
            if (this._rateLimitResetTimer) clearInterval(this._rateLimitResetTimer);
            this._rateLimitResetTimer = setInterval(() => {
                this._rateLimitCounter = 0;
            }, CONFIG.MESSAGE_WINDOW_MS);
        },

        _setupMessageHandler: function() {
            if (this._messageHandler) {
                window.removeEventListener('message', this._messageHandler);
            }
            
            this._messageHandler = (event) => {
                // PERFORMANCE FIX: Move heavy logic out of message listener
                setTimeout(() => this.handleIncoming(event), 0);
            };
            
            window.addEventListener('message', this._messageHandler);
            
            logInfo(MODULE, 'Message handler installed');
        },

        _setupListeners: function() {
            window.addEventListener('online', () => {
                this._online = true;
                this._notifyListeners('online', {});
                logInfo(MODULE, 'Network online');
            });

            window.addEventListener('offline', () => {
                this._online = false;
                this._notifyListeners('offline', {});
                logWarn(MODULE, 'Network offline');
            });
        },

        _generateMessageId: function() {
            return `${Date.now()}-${++this._messageId}-${Math.random().toString(36).substring(2, 9)}`;
        },

        _validateMessage: function(type, payload, options) {
            if (!this._canSend()) {
                return { valid: false, reason: 'cannot_send' };
            }

            if (this._rateLimitCounter >= CONFIG.MAX_MESSAGES_PER_SECOND) {
                logWarn(MODULE, 'Send rate limit exceeded', { type });
                return { valid: false, reason: 'rate_limit' };
            }

            return { valid: true };
        },

        _canSend: function() {
            const allowedStates = [
                'WAIT_PARENT',
                'ACTIVE'
            ];
            
            return allowedStates.includes(state) && 
                   this._online && 
                   window.parent && 
                   window.parent !== window;
        },

        send: function(type, payload = {}, options = {}) {
            // Redirect to safeSend which handles queueing
            return safeSend(type, payload, options.requireAck || false);
        },

        sendAction: function(action, payload = {}) {
            if (state !== 'ACTIVE') {
                logWarn(MODULE, 'Cannot send action - not in ACTIVE state', { action, state });
                return Promise.resolve({ success: false, reason: 'not_active' });
            }

            return this.send('ACTION', {
                action: action,
                data: payload,
                timestamp: Date.now()
            }, { requireAck: false });
        },

        sendChildReady: function() {
            // Redirect to sendChildReady function
            return Promise.resolve({ success: true, delegated: true });
        },

        requestSessionFromParent: function() {
            // Redirect to requestSession function
            requestSession();
        },

        handleIncoming: function(event) {
            try {
                if (!OriginSecurity.validateEvent(event)) {
                    logWarn(MODULE, 'Invalid origin', { origin: event.origin });
                    return;
                }

                const message = event.data;

                if (!message || typeof message !== 'object') return;
                if (!validateMessage(message)) {
                    logWarn(MODULE, 'Invalid message format', message);
                    return;
                }

                if (isDuplicate(message.messageId)) {
                    logInfo(MODULE, 'Duplicate message ignored', { messageId: message.messageId });
                    return;
                }

                if (message.source && message.source !== 'parent') {
                    return;
                }

                OriginSecurity.lockParentOrigin(event.origin);

                if (message.messageId) {
                    callsState.processedMessageIds.add(message.messageId);
                }

                // ==================== PARENT_READY HANDLER ====================
                if (message.type === MESSAGE_TYPES.PARENT_READY) {
                    logSuccess(MODULE, 'PARENT_READY received');
                    
                    // CRITICAL: Set parentReady flag and update state
                    parentReady = true;
                    parentReadyReceived = true;
                    callsState.parentReady = true;
                    
                    // Resolve parent ready promise
                    if (parentReadyResolve) {
                        parentReadyResolve();
                    }
                    
                    // Update state to ACTIVE
                    setState('ACTIVE');
                    
                    // FLUSH QUEUE - Send all queued messages now
                    flushQueue();
                    
                    // Register module
                    registerModule();
                    
                    // Request session after a small delay
                    setTimeout(() => {
                        requestSession();
                    }, 100);
                    
                    return;
                }

                if (message.type === MESSAGE_TYPES.ACK) {
                    const ackId = message.payload?.ackId || message.ackId || message.messageId;
                    if (ackId) {
                        MessageRegistry.acknowledge(ackId, message.payload);
                    }
                    return;
                }

                if (message.type === MESSAGE_TYPES.HEARTBEAT) {
                    this._handleHeartbeat(message);
                    return;
                }

                if (message.type === 'MODULE_REGISTERED') {
                    this._handleModuleRegistered(message);
                    return;
                }

                if (message.type === MESSAGE_TYPES.SESSION_SYNC) {
                    this._handleSessionSync(message);
                    return;
                }

                if (message.type === MESSAGE_TYPES.MODULE_INIT_DATA) {
                    handleInitData(message);
                }

                if (message.type === MESSAGE_TYPES.SESSION_RESPONSE || 
                    message.type === MESSAGE_TYPES.SESSION_DATA || 
                    message.type === MESSAGE_TYPES.SESSION_ACTIVE) {
                    
                    this._handleSessionMessage(message);
                }

                if (message.type === 'SESSION_NULL') {
                    callsState.session = null;
                    callsState.token = null;
                    callsState.sessionReceived = false;
                    callsState.sessionStatus = 'invalid';
                    this._sessionActive = false;
                    logSession(MODULE, 'SESSION_NULL received');
                    return;
                }

                if (message.type === 'VERIFY_RESPONSE' || message.type === 'SESSION_VERIFIED') {
                    const isValid = message.valid === true || message.payload?.valid === true;
                    callsState.verified = isValid;
                    callsState.verificationLock = false;
                    
                    const requestId = message.requestId || message.messageId || message.id;
                    if (requestId) {
                        MessageRegistry.acknowledge(requestId, { valid: isValid });
                    }
                    return;
                }

                if (message.type === MESSAGE_TYPES.CALL_INCOMING) {
                    handleIncomingCall(message.payload || message.data);
                    return;
                }

                if (message.type === MESSAGE_TYPES.CALL_STARTED) {
                    handleCallStarted(message.payload || message.data);
                    return;
                }

                if (message.type === MESSAGE_TYPES.CALL_CONNECTED) {
                    handleCallConnected(message.payload || message.data);
                    return;
                }

                if (message.type === MESSAGE_TYPES.CALL_REJECTED) {
                    handleCallRejected(message.payload || message.data);
                    
                    if (callsState.callInvitationTimer) {
                        clearTimeout(callsState.callInvitationTimer);
                        callsState.callInvitationTimer = null;
                    }
                    return;
                }

                if (message.type === MESSAGE_TYPES.CALL_ENDED) {
                    handleCallEnded(message.payload || message.data);
                    return;
                }

                if (message.type === MESSAGE_TYPES.CALL_FAILED) {
                    handleCallFailed(message.payload || message.data);
                    
                    if (callsState.callInvitationTimer) {
                        clearTimeout(callsState.callInvitationTimer);
                        callsState.callInvitationTimer = null;
                    }
                    return;
                }

                if (message.type === MESSAGE_TYPES.REMOTE_STREAM_ADDED) {
                    handleRemoteStreamAdded(message.payload || message.data);
                    return;
                }

                if (message.type === MESSAGE_TYPES.REMOTE_STREAM_REMOVED) {
                    handleRemoteStreamRemoved(message.payload || message.data);
                    return;
                }

                if (message.type === MESSAGE_TYPES.SIGNAL_OFFER ||
                    message.type === MESSAGE_TYPES.SIGNAL_ANSWER ||
                    message.type === MESSAGE_TYPES.ICE_CANDIDATE) {
                    
                    handleSignalingMessage(message.type, message.payload || message.data);
                    return;
                }

                if (message.type === 'FRIEND_UPDATE' || message.type === 'CONTACTS_UPDATE') {
                    notifyListeners('contacts_update', message.payload || message.data);
                    return;
                }

                if (message.type === 'CALL_HISTORY_UPDATE') {
                    notifyListeners('call_history_update', message.payload || message.data);
                    return;
                }

                if (message.type === 'SETTINGS_UPDATED' && (message.payload || message.data)) {
                    const data = message.payload || message.data;
                    if (data.premium !== undefined) {
                        callsState.isPremium = data.premium;
                    }
                    if (data.premiumFeatures) {
                        callsState.premiumFeatures = { ...callsState.premiumFeatures, ...data.premiumFeatures };
                    }
                    notifyListeners('settings_update', data);
                    return;
                }

                if (message.type === 'USER_LOGGED_OUT') {
                    callsState.session = null;
                    callsState.token = null;
                    callsState.verified = false;
                    callsState.sessionReceived = false;
                    callsState.sessionStatus = 'invalid';
                    this._sessionActive = false;
                    notifyListeners('logout', {});
                    return;
                }

                if (message.type === 'SESSION_REFRESHED') {
                    if ((message.payload || message.data) && (message.payload || message.data).token) {
                        const data = message.payload || message.data;
                        callsState.token = data.token;
                        if (callsState.session) {
                            callsState.session.token = data.token;
                        }
                    }
                    return;
                }

                if (message.type === 'SESSION_INVALIDATED') {
                    callsState.session = null;
                    callsState.token = null;
                    callsState.sessionReceived = false;
                    callsState.sessionStatus = 'invalid';
                    this._sessionActive = false;
                    return;
                }

                if (message.type === 'NEW_MESSAGE' && (message.payload || message.data)) {
                    notifyListeners('new_message', message.payload || message.data);
                    return;
                }

                if (message.type === 'STATUS_UPDATE' && (message.payload || message.data)) {
                    notifyListeners('status_update', message.payload || message.data);
                    return;
                }

                if (message.type === 'GROUP_UPDATE' && (message.payload || message.data)) {
                    notifyListeners('group_update', message.payload || message.data);
                    return;
                }

                this._notifyListeners('received', { type: message.type, data: message });
            } catch (error) {
                logError(MODULE, 'Error handling incoming message', error);
            }
        },

        _handleHeartbeat: function(message) {
            if (state !== 'ACTIVE') return;
            
            logHeartbeat(MODULE, 'Heartbeat received from parent');
            
            // Use safeSend which will queue if parent not ready
            safeSend('HEARTBEAT_ACK', {
                ackId: message.messageId,
                module: MODULE_NAME,
                timestamp: Date.now()
            });
        },

        _handleModuleRegistered: function(message) {
            if (callsState.registered) {
                logInfo(MODULE, 'Already registered, ignoring duplicate');
                return;
            }

            logSuccess(MODULE, 'MODULE_REGISTERED received');
            callsState.registered = true;
            setState('ACTIVE');

            if (message.expectAck) {
                safeSend('ACK', {
                    ackId: message.messageId
                }, false).catch(() => {});
            }

            setTimeout(() => {
                requestSession();
            }, 100);
        },

        _handleSessionSync: function(message) {
            const sessionData = message.payload || message.data || {};
            
            logSession(MODULE, 'SESSION_SYNC received', {
                hasToken: !!(sessionData.token || sessionData.jwt)
            });

            const token = sessionData.token || sessionData.jwt || sessionData.accessToken;
            if (token) {
                const normalizedSession = {
                    token: token,
                    user: sessionData.user || { id: sessionData.userId },
                    userId: sessionData.userId || sessionData.user?.id,
                    expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),
                    authenticated: sessionData.authenticated !== false
                };
                
                callsState.session = normalizedSession;
                callsState.token = token;
                callsState.sessionStatus = 'valid';
                callsState.sessionReceived = true;
                this._sessionActive = true;
                
                safeSend('SESSION_ACK', {
                    status: 'synced',
                    timestamp: Date.now()
                }, false).catch(() => {});

                window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {
                    detail: { core: window.callCore, timestamp: Date.now() }
                }));
                
                window.dispatchEvent(new CustomEvent('MODULE_READY', {
                    detail: { module: MODULE_NAME, timestamp: Date.now() }
                }));
            }
        },

        _handleSessionMessage: function(message) {
            this._sessionRequested = false;
            if (this._sessionRequestTimer) {
                clearTimeout(this._sessionRequestTimer);
                this._sessionRequestTimer = null;
            }

            const requestId = message.requestId || message.payload?.requestId || message.id;
            if (requestId) {
                MessageRegistry.acknowledge(requestId, message.payload);
            }

            const sessionData = message.payload || message.data || message;
            
            logSession(MODULE, 'Session message received from parent', { 
                hasToken: !!(sessionData.token || sessionData.jwt || sessionData.accessToken)
            });
            
            const token = sessionData.token || sessionData.jwt || sessionData.accessToken;
            if (token) {
                const normalizedSession = {
                    token: token,
                    user: sessionData.user || { id: sessionData.userId },
                    userId: sessionData.userId || sessionData.user?.id,
                    expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),
                    authenticated: sessionData.authenticated !== false
                };
                
                callsState.session = normalizedSession;
                callsState.token = token;
                callsState.sessionStatus = 'valid';
                
                if (!callsState.sessionReceived) {
                    callsState.sessionReceived = true;
                    logSession(MODULE, 'Session activated', { 
                        authenticated: normalizedSession.authenticated,
                        userId: normalizedSession.userId
                    });
                }
                
                this._sessionActive = true;
                
                window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {
                    detail: { core: window.callCore, timestamp: Date.now() }
                }));
                
                window.dispatchEvent(new CustomEvent('MODULE_READY', {
                    detail: { module: MODULE_NAME, timestamp: Date.now() }
                }));
            }
        },

        _processQueue: function() {
            if (this._processing) return;
            if (this._queue.length === 0) return;

            this._processing = true;

            const now = Date.now();
            const validQueue = this._queue.filter(item => {
                return now - item.timestamp < 30000;
            });

            this._queue = [];

            validQueue.forEach(item => {
                this.send(item.type, item.payload, item.options)
                    .then(item.resolve)
                    .catch(item.reject);
            });

            this._processing = false;
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getStatus: function() {
            return {
                online: this._online,
                queueSize: this._queue.length,
                pendingAcks: MessageRegistry.getPendingCount(),
                targetOrigin: this._targetOrigin,
                sessionRequested: this._sessionRequested,
                sessionActive: this._sessionActive,
                rateLimitCounter: this._rateLimitCounter,
                parentReady: parentReady,
                messageQueueSize: messageQueue.length
            };
        },

        cleanup: function() {
            if (this._sessionRequestTimer) {
                clearTimeout(this._sessionRequestTimer);
                this._sessionRequestTimer = null;
            }
            if (this._rateLimitResetTimer) {
                clearInterval(this._rateLimitResetTimer);
                this._rateLimitResetTimer = null;
            }
            if (this._messageHandler) {
                window.removeEventListener('message', this._messageHandler);
                this._messageHandler = null;
            }
            this._queue = [];
            messageQueue.length = 0;  // Clear main queue
            MessageRegistry.reset();
            this._listeners.clear();
        }
    };

    IframeTransport.initialize();

    // ==================== PERMISSION MANAGER ====================
    const PermissionManager = {
        checkPermissions: async function(required = { audio: true, video: false }) {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                    return { 
                        success: false, 
                        error: 'Media devices not supported',
                        permissions: { audio: false, video: false }
                    };
                }

                const devices = await navigator.mediaDevices.enumerateDevices();
                
                const hasAudioInput = devices.some(d => d.kind === 'audioinput');
                const hasVideoInput = devices.some(d => d.kind === 'videoinput');
                
                if (required.audio && !hasAudioInput) {
                    return { 
                        success: false, 
                        error: 'No microphone found',
                        permissions: { audio: false, video: hasVideoInput }
                    };
                }
                
                if (required.video && !hasVideoInput) {
                    return { 
                        success: false, 
                        error: 'No camera found',
                        permissions: { audio: hasAudioInput, video: false }
                    };
                }
                
                if (required.audio || required.video) {
                    try {
                        const testStream = await navigator.mediaDevices.getUserMedia({
                            audio: required.audio,
                            video: required.video
                        });
                        
                        testStream.getTracks().forEach(track => track.stop());
                        
                        return { 
                            success: true, 
                            permissions: { 
                                audio: required.audio, 
                                video: required.video 
                            }
                        };
                    } catch (permError) {
                        let errorMessage = 'Permission denied';
                        if (permError.name === 'NotAllowedError') {
                            errorMessage = 'Microphone or camera access denied';
                        } else if (permError.name === 'NotFoundError') {
                            errorMessage = 'Required device not found';
                        }
                        
                        return { 
                            success: false, 
                            error: errorMessage,
                            permissions: { audio: false, video: false }
                        };
                    }
                }
                
                return { 
                    success: true, 
                    permissions: { audio: hasAudioInput, video: hasVideoInput }
                };
                
            } catch (error) {
                logError(MODULE, 'Permission check failed', error);
                return { 
                    success: false, 
                    error: error.message,
                    permissions: { audio: false, video: false }
                };
            }
        },
        
        requestPermissions: async function(required = { audio: true, video: false }) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia(required);
                stream.getTracks().forEach(track => track.stop());
                return { success: true };
            } catch (error) {
                return { 
                    success: false, 
                    error: error.message 
                };
            }
        }
    };

    // ==================== MEDIA MANAGER ====================
    const MediaManager = {
        _stream: null,
        _audioTracks: [],
        _videoTracks: [],
        _listeners: new Set(),
        _deviceCheckDone: false,

        initialize: async function() {
            try {
                logInfo(MODULE, 'Initializing media manager');
                
                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                    logWarn(MODULE, 'Media devices not fully supported');
                    return { success: false, error: 'Media devices not supported' };
                }
                
                return { success: true, deferred: true };
                
            } catch (error) {
                logError(MODULE, 'Media manager initialization failed', error);
                return { success: false, error: error.message };
            }
        },

        enumerateDevices: async function() {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                
                callsState.mediaDevices = {
                    audioInput: devices.filter(d => d.kind === 'audioinput'),
                    videoInput: devices.filter(d => d.kind === 'videoinput'),
                    audioOutput: devices.filter(d => d.kind === 'audiooutput')
                };
                
                this._deviceCheckDone = true;
                
                logSuccess(MODULE, 'Media devices enumerated', {
                    audioInput: callsState.mediaDevices.audioInput.length,
                    videoInput: callsState.mediaDevices.videoInput.length
                });
                
                return { success: true, devices: callsState.mediaDevices };
            } catch (error) {
                logError(MODULE, 'Device enumeration failed', error);
                return { success: false, error: error.message };
            }
        },

        getLocalStream: async function(constraints = { audio: true, video: false }) {
            try {
                logInfo(MODULE, 'Getting local media stream', constraints);
                
                if (!this._deviceCheckDone) {
                    await this.enumerateDevices();
                }
                
                this.stopLocalStream();
                
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                
                this._stream = stream;
                this._audioTracks = stream.getAudioTracks();
                this._videoTracks = stream.getVideoTracks();
                
                callsState.localStream = stream;
                callsState.micEnabled = this._audioTracks.length > 0;
                callsState.cameraEnabled = this._videoTracks.length > 0;
                
                logSuccess(MODULE, 'Local media stream acquired', {
                    audio: this._audioTracks.length > 0,
                    video: this._videoTracks.length > 0
                });
                
                this._notifyListeners('local_stream_ready', { stream });
                
                return { success: true, stream };
                
            } catch (error) {
                logError(MODULE, 'Failed to get local media stream', error);
                
                let errorMessage = 'Could not access media devices';
                if (error.name === 'NotAllowedError') {
                    errorMessage = 'Microphone or camera access denied';
                } else if (error.name === 'NotFoundError') {
                    errorMessage = 'Required device not found';
                } else if (error.name === 'NotReadableError') {
                    errorMessage = 'Device in use by another application';
                }
                
                this._notifyListeners('stream_error', { error: errorMessage });
                
                return { success: false, error: errorMessage };
            }
        },

        toggleMic: function(enabled) {
            if (this._audioTracks.length === 0) {
                logWarn(MODULE, 'No audio tracks to toggle');
                return false;
            }
            
            try {
                this._audioTracks.forEach(track => {
                    track.enabled = enabled;
                });
                
                callsState.micEnabled = enabled;
                
                logInfo(MODULE, `Microphone ${enabled ? 'enabled' : 'disabled'}`);
                this._notifyListeners('mic_toggled', { enabled });
                
                return true;
                
            } catch (error) {
                logError(MODULE, 'Failed to toggle microphone', error);
                return false;
            }
        },

        toggleCamera: function(enabled) {
            if (this._videoTracks.length === 0) {
                logWarn(MODULE, 'No video tracks to toggle');
                return false;
            }
            
            try {
                this._videoTracks.forEach(track => {
                    track.enabled = enabled;
                });
                
                callsState.cameraEnabled = enabled;
                
                logInfo(MODULE, `Camera ${enabled ? 'enabled' : 'disabled'}`);
                this._notifyListeners('camera_toggled', { enabled });
                
                return true;
                
            } catch (error) {
                logError(MODULE, 'Failed to toggle camera', error);
                return false;
            }
        },

        switchCamera: async function() {
            if (this._videoTracks.length === 0) {
                logWarn(MODULE, 'No video tracks to switch');
                return { success: false, error: 'No video tracks' };
            }
            
            try {
                const newMode = callsState.cameraFacingMode === 'user' ? 'environment' : 'user';
                
                const currentConstraints = {
                    audio: this._audioTracks.length > 0,
                    video: {
                        facingMode: newMode,
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                };
                
                this._videoTracks.forEach(track => track.stop());
                
                const newStream = await navigator.mediaDevices.getUserMedia(currentConstraints);
                const newVideoTracks = newStream.getVideoTracks();
                
                if (this._stream) {
                    this._videoTracks.forEach(track => {
                        this._stream.removeTrack(track);
                    });
                    
                    newVideoTracks.forEach(track => {
                        this._stream.addTrack(track);
                    });
                }
                
                this._videoTracks = newVideoTracks;
                callsState.cameraFacingMode = newMode;
                
                logSuccess(MODULE, `Camera switched to ${newMode} mode`);
                this._notifyListeners('camera_switched', { facingMode: newMode });
                
                return { success: true, facingMode: newMode };
                
            } catch (error) {
                logError(MODULE, 'Failed to switch camera', error);
                return { success: false, error: error.message };
            }
        },

        startScreenShare: async function() {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                    return { success: false, error: 'Screen sharing not supported' };
                }
                
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
                
                callsState.screenSharing = true;
                this._notifyListeners('screen_share_started', { stream: screenStream });
                
                return { success: true, stream: screenStream };
                
            } catch (error) {
                logError(MODULE, 'Failed to start screen share', error);
                return { success: false, error: error.message };
            }
        },

        stopScreenShare: function() {
            callsState.screenSharing = false;
            this._notifyListeners('screen_share_ended', {});
        },

        stopLocalStream: function() {
            if (this._stream) {
                this._stream.getTracks().forEach(track => {
                    track.stop();
                });
                this._stream = null;
                this._audioTracks = [];
                this._videoTracks = [];
                
                callsState.localStream = null;
                callsState.micEnabled = true;
                callsState.cameraEnabled = false;
                callsState.screenSharing = false;
                
                logInfo(MODULE, 'Local stream stopped');
                this._notifyListeners('local_stream_stopped', {});
            }
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getStatus: function() {
            return {
                hasStream: !!this._stream,
                audioTracks: this._audioTracks.length,
                videoTracks: this._videoTracks.length,
                micEnabled: callsState.micEnabled,
                cameraEnabled: callsState.cameraEnabled,
                cameraFacingMode: callsState.cameraFacingMode,
                screenSharing: callsState.screenSharing,
                devices: callsState.mediaDevices,
                deviceCheckDone: this._deviceCheckDone
            };
        }
    };

    MediaManager.initialize().catch(error => {
        logError(MODULE, 'Media manager initialization failed', error);
    });

    // ==================== WEBRTC MANAGER ====================
    const WebRTCManager = {
        _peerConnection: null,
        _iceCandidates: [],
        _iceRestartCount: 0,
        _remoteStreams: new Map(),
        _dataChannel: null,
        _listeners: new Set(),

        initialize: function() {
            logInfo(MODULE, 'WebRTC manager initialized');
        },

        createPeerConnection: function(config = {}) {
            try {
                const pcConfig = {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' }
                    ],
                    iceCandidatePoolSize: 10,
                    ...config
                };
                
                this._peerConnection = new RTCPeerConnection(pcConfig);
                
                this._setupPeerConnectionListeners();
                
                logSuccess(MODULE, 'Peer connection created');
                
                return this._peerConnection;
                
            } catch (error) {
                logError(MODULE, 'Failed to create peer connection', error);
                throw error;
            }
        },

        _setupPeerConnectionListeners: function() {
            if (!this._peerConnection) return;
            
            this._peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this._iceCandidates.push(event.candidate);
                    this._notifyListeners('ice_candidate', { candidate: event.candidate });
                    
                    IframeTransport.sendAction('ICE_CANDIDATE', {
                        candidate: event.candidate,
                        callId: callsState.activeCallId
                    }).catch(() => {});
                }
            };
            
            this._peerConnection.oniceconnectionstatechange = () => {
                const state = this._peerConnection.iceConnectionState;
                logInfo(MODULE, `ICE connection state: ${state}`);
                
                if (state === 'failed' || state === 'disconnected') {
                    this.handleIceFailure();
                }
                
                this._notifyListeners('ice_state', { state });
            };
            
            this._peerConnection.onsignalingstatechange = () => {
                const state = this._peerConnection.signalingState;
                logInfo(MODULE, `Signaling state: ${state}`);
                this._notifyListeners('signaling_state', { state });
            };
            
            this._peerConnection.ontrack = (event) => {
                const stream = event.streams[0];
                if (stream) {
                    this._remoteStreams.set(stream.id, stream);
                    callsState.remoteStreams.set(stream.id, stream);
                    
                    this._notifyListeners('remote_stream_added', { stream, track: event.track });
                }
            };
            
            this._peerConnection.ondatachannel = (event) => {
                this._dataChannel = event.channel;
                this._setupDataChannel(this._dataChannel);
                this._notifyListeners('data_channel', { channel: event.channel });
            };
        },

        _setupDataChannel: function(channel) {
            channel.onopen = () => {
                logInfo(MODULE, 'Data channel opened');
                this._notifyListeners('data_channel_open', {});
            };
            
            channel.onclose = () => {
                logInfo(MODULE, 'Data channel closed');
                this._notifyListeners('data_channel_close', {});
            };
            
            channel.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this._notifyListeners('data_message', data);
                } catch (e) {
                    logError(MODULE, 'Failed to parse data channel message', e);
                }
            };
            
            channel.onerror = (error) => {
                logError(MODULE, 'Data channel error', error);
                this._notifyListeners('data_channel_error', { error });
            };
        },

        createDataChannel: function(label = 'chat') {
            if (!this._peerConnection) {
                logError(MODULE, 'No peer connection to create data channel');
                return null;
            }
            
            try {
                this._dataChannel = this._peerConnection.createDataChannel(label);
                this._setupDataChannel(this._dataChannel);
                return this._dataChannel;
            } catch (error) {
                logError(MODULE, 'Failed to create data channel', error);
                return null;
            }
        },

        sendData: function(data) {
            if (!this._dataChannel || this._dataChannel.readyState !== 'open') {
                logWarn(MODULE, 'Data channel not open');
                return false;
            }
            
            try {
                this._dataChannel.send(JSON.stringify(data));
                return true;
            } catch (error) {
                logError(MODULE, 'Failed to send data', error);
                return false;
            }
        },

        addStream: function(stream) {
            if (!this._peerConnection) return false;
            
            try {
                stream.getTracks().forEach(track => {
                    this._peerConnection.addTrack(track, stream);
                });
                return true;
            } catch (error) {
                logError(MODULE, 'Failed to add stream to peer connection', error);
                return false;
            }
        },

        removeStream: function(stream) {
            if (!this._peerConnection) return false;
            
            try {
                const senders = this._peerConnection.getSenders();
                senders.forEach(sender => {
                    if (sender.track && stream.getTracks().includes(sender.track)) {
                        this._peerConnection.removeTrack(sender);
                    }
                });
                return true;
            } catch (error) {
                logError(MODULE, 'Failed to remove stream from peer connection', error);
                return false;
            }
        },

        createOffer: async function(options = {}) {
            if (!this._peerConnection) throw new Error('No peer connection');
            
            try {
                const offer = await this._peerConnection.createOffer(options);
                await this._peerConnection.setLocalDescription(offer);
                return offer;
            } catch (error) {
                logError(MODULE, 'Failed to create offer', error);
                throw error;
            }
        },

        createAnswer: async function(options = {}) {
            if (!this._peerConnection) throw new Error('No peer connection');
            
            try {
                const answer = await this._peerConnection.createAnswer(options);
                await this._peerConnection.setLocalDescription(answer);
                return answer;
            } catch (error) {
                logError(MODULE, 'Failed to create answer', error);
                throw error;
            }
        },

        setRemoteDescription: async function(description) {
            if (!this._peerConnection) throw new Error('No peer connection');
            
            try {
                await this._peerConnection.setRemoteDescription(description);
                logInfo(MODULE, 'Remote description set');
            } catch (error) {
                logError(MODULE, 'Failed to set remote description', error);
                throw error;
            }
        },

        addIceCandidate: async function(candidate) {
            if (!this._peerConnection) return;
            
            try {
                await this._peerConnection.addIceCandidate(candidate);
                logInfo(MODULE, 'ICE candidate added');
            } catch (error) {
                logError(MODULE, 'Failed to add ICE candidate', error);
            }
        },

        handleIceFailure: function() {
            logWarn(MODULE, 'ICE connection failed');
            
            if (this._iceRestartCount < CONFIG.MAX_ICE_RESTARTS) {
                this._iceRestartCount++;
                
                logInfo(MODULE, `Attempting ICE restart (${this._iceRestartCount}/${CONFIG.MAX_ICE_RESTARTS})`);
                
                this.createOffer({ iceRestart: true })
                    .then(offer => {
                        IframeTransport.sendAction('SIGNAL_OFFER', {
                            offer: offer,
                            callId: callsState.activeCallId,
                            iceRestart: true
                        }).catch(() => {});
                    })
                    .catch(error => {
                        logError(MODULE, 'ICE restart failed', error);
                    });
            } else {
                logError(MODULE, 'Max ICE restarts reached, call may fail');
                this._notifyListeners('call_failed', { reason: 'ice_failed' });
            }
        },

        close: function() {
            if (this._peerConnection) {
                this._peerConnection.close();
                this._peerConnection = null;
            }
            this._iceCandidates = [];
            this._iceRestartCount = 0;
            this._remoteStreams.clear();
            this._dataChannel = null;
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getStatus: function() {
            return {
                hasPeerConnection: !!this._peerConnection,
                iceConnectionState: this._peerConnection?.iceConnectionState || 'new',
                signalingState: this._peerConnection?.signalingState || 'stable',
                iceCandidates: this._iceCandidates.length,
                iceRestartCount: this._iceRestartCount,
                remoteStreams: this._remoteStreams.size,
                hasDataChannel: !!this._dataChannel,
                dataChannelState: this._dataChannel?.readyState || 'closed'
            };
        }
    };

    WebRTCManager.initialize();

    // ==================== CALL STATE GOVERNOR ====================
    const CallsStateGovernor = {
        _currentState: CALLS_STATE.INIT,
        _previousState: null,
        _transitionLock: false,
        _stateChangeListeners: new Set(),
        _moduleRegistered: false,
        _sessionReceived: false,
        _parentReadyReceived: false,
        _session: null,
        _verificationInProgress: false,
        _lastVerificationTime: 0,
        _lastVerificationResult: true,

        initialize: function() {
            this._currentState = CALLS_STATE.INIT;
            this._previousState = null;
            this._moduleRegistered = false;
            this._sessionReceived = false;
            this._parentReadyReceived = false;
            this._session = null;
            
            callsState.registered = false;
            callsState.parentReady = false;
            callsState.session = null;
            callsState.sessionStatus = 'pending';
            callsState.token = null;
            callsState.verified = false;
            callsState.verificationLock = false;
            callsState.callActive = false;
            callsState.pendingCall = null;
            callsState.webrtcInitialized = false;
            callsState.recoveryMode = false;
            callsState.sessionReceived = false;
            callsState.childReadySent = false;
            callsState.registrationSent = false;
            setState('INITIALIZING');  // Updated to match contract

            logInfo(MODULE, 'Calls State Governor initialized');
            return this;
        },

        transition: function(newState, reason = '') {
            if (this._transitionLock) {
                return false;
            }

            const oldState = this._currentState;
            if (oldState === newState) return false;

            const isLegal = this._isLegalTransition(oldState, newState);
            
            if (!isLegal) {
                logWarn(MODULE, `Illegal state transition: ${oldState} → ${newState}`);
                return false;
            }

            this._previousState = oldState;
            this._currentState = newState;

            logState(MODULE, oldState, newState, reason);
            this._notifyListeners('state', { oldState, newState, reason });

            this._handleStateActions(newState);

            return true;
        },

        _isLegalTransition: function(from, to) {
            const legalTransitions = {
                [CALLS_STATE.INIT]: [CALLS_STATE.REGISTERING],
                [CALLS_STATE.REGISTERING]: [CALLS_STATE.REGISTERED, CALLS_STATE.SESSION_PENDING],
                [CALLS_STATE.REGISTERED]: [CALLS_STATE.SESSION_PENDING, CALLS_STATE.REGISTERING],
                [CALLS_STATE.SESSION_PENDING]: [CALLS_STATE.SESSION_RECEIVED],
                [CALLS_STATE.SESSION_RECEIVED]: [CALLS_STATE.ACTIVE],
                [CALLS_STATE.ACTIVE]: [CALLS_STATE.CALL_READY, CALLS_STATE.SESSION_RECEIVED],
                [CALLS_STATE.CALL_READY]: [CALLS_STATE.IN_CALL, CALLS_STATE.ACTIVE],
                [CALLS_STATE.IN_CALL]: [CALLS_STATE.CALL_READY, CALLS_STATE.TERMINATED],
                [CALLS_STATE.TERMINATED]: [CALLS_STATE.INIT]
            };
            return legalTransitions[from] ? legalTransitions[from].includes(to) : false;
        },

        _handleStateActions: function(state) {
            switch (state) {
                case CALLS_STATE.ACTIVE:
                    this._flushQueue();
                    break;
                case CALLS_STATE.IN_CALL:
                    break;
                case CALLS_STATE.TERMINATED:
                    break;
                default:
                    break;
            }
        },

        handleModuleRegistered: function() {
            if (this._moduleRegistered) return;
            
            this._moduleRegistered = true;
            callsState.registered = true;
            logSuccess(MODULE, 'MODULE_REGISTERED received');

            if (this._currentState === CALLS_STATE.REGISTERING) {
                this.transition(CALLS_STATE.REGISTERED, 'module_registered');
            }
            
            this.transition(CALLS_STATE.SESSION_PENDING, 'waiting_for_session');
        },

        handleSessionActive: function(sessionData) {
            if (!sessionData || typeof sessionData !== 'object') {
                logError(MODULE, 'Invalid session data', null, sessionData);
                return;
            }

            const session = {
                authenticated: sessionData.authenticated === true,
                userId: sessionData.userId || sessionData.user?.id,
                token: sessionData.token || sessionData.jwt || sessionData.accessToken,
                user: sessionData.user || {},
                expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),
                version: sessionData.version || 1
            };

            this._session = session;
            callsState.session = session;
            callsState.token = session.token;
            callsState.sessionStatus = 'valid';
            
            if (!this._sessionReceived) {
                this._sessionReceived = true;
                callsState.sessionReceived = true;
                logSession(MODULE, 'SESSION_ACTIVE received', { 
                    authenticated: session.authenticated,
                    userId: session.userId
                });

                if (this._currentState === CALLS_STATE.SESSION_PENDING || this._currentState === CALLS_STATE.REGISTERED) {
                    this.transition(CALLS_STATE.SESSION_RECEIVED, 'session_active');
                }

                if (this._parentReadyReceived) {
                    this.transition(CALLS_STATE.ACTIVE, 'parent_ready_after_session');
                }

                window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {
                    detail: { core: window.callCore, timestamp: Date.now() }
                }));
                
                window.dispatchEvent(new CustomEvent('MODULE_READY', {
                    detail: { module: MODULE_NAME, timestamp: Date.now() }
                }));
            }
        },

        handleSessionNull: function() {
            logInfo(MODULE, 'SESSION_NULL received - no authenticated session');
            
            this._session = {
                authenticated: false,
                userId: null,
                token: null,
                user: {},
                expiresAt: 0,
                version: 1
            };
            callsState.session = null;
            callsState.token = null;
            callsState.sessionReceived = false;
            callsState.sessionStatus = 'invalid';
            
            if (!this._sessionReceived) {
                this._sessionReceived = true;

                if (this._currentState === CALLS_STATE.SESSION_PENDING || this._currentState === CALLS_STATE.REGISTERED) {
                    this.transition(CALLS_STATE.SESSION_RECEIVED, 'session_null');
                }
            }
        },

        handleParentReady: function() {
            if (this._parentReadyReceived) return;
            
            this._parentReadyReceived = true;
            callsState.parentReady = true;
            logSuccess(MODULE, 'PARENT_READY received');

            if (this._currentState === CALLS_STATE.SESSION_RECEIVED) {
                this.transition(CALLS_STATE.ACTIVE, 'parent_ready');
            } else if (this._currentState === CALLS_STATE.SESSION_PENDING) {
                logInfo(MODULE, 'PARENT_READY received before session - waiting for SESSION_ACTIVE');
            }
        },

        verifySession: function(force = false) {
            return new Promise((resolve) => {
                const now = Date.now();
                if (!force && now - this._lastVerificationTime < 5000) {
                    logInfo(MODULE, 'Verification skipped - cooldown', { 
                        lastVerification: this._lastVerificationTime 
                    });
                    resolve({ valid: callsState.verified, cached: true });
                    return;
                }

                if (callsState.verificationLock) {
                    logInfo(MODULE, 'Verification already in progress, waiting');
                    
                    const checkInterval = setInterval(() => {
                        if (!callsState.verificationLock) {
                            clearInterval(checkInterval);
                            resolve({ valid: callsState.verified, cached: true });
                        }
                    }, 50);
                    
                    setTimeout(() => {
                        clearInterval(checkInterval);
                        resolve({ valid: callsState.verified, cached: true, timeout: true });
                    }, 1000);
                    
                    return;
                }

                if (!callsState.session || !callsState.session.token) {
                    resolve({ valid: false, reason: 'no_token' });
                    return;
                }

                if (this._session && this._session.authenticated && this._session.expiresAt > Date.now()) {
                    const timeSinceLast = Date.now() - this._lastVerificationTime;
                    if (force || timeSinceLast > 30000) {
                        this._performVerification().then(result => {
                            resolve(result);
                        }).catch(() => {
                            resolve({ valid: true, cached: true });
                        });
                    } else {
                        resolve({ valid: true, cached: true });
                    }
                } else {
                    resolve({ valid: false, reason: 'no_session' });
                }
            });
        },

        _performVerification: function() {
            return new Promise((resolve) => {
                callsState.verificationLock = true;
                this._verificationInProgress = true;

                const requestId = `verify_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                let responded = false;

                logSending(MODULE, 'VERIFY_SESSION sent', { requestId });

                safeSend('VERIFY_SESSION', {
                    requestId: requestId
                }, { 
                    requireAck: true,
                    timeout: 2000
                })
                    .then((response) => {
                        responded = true;
                        this._verificationInProgress = false;
                        this._lastVerificationTime = Date.now();
                        
                        const isValid = response?.result?.valid === true;
                        this._lastVerificationResult = isValid;
                        
                        callsState.verified = isValid;
                        callsState.verificationLock = false;

                        logSuccess(MODULE, isValid ? 'Session verified' : 'Session verification failed');
                        resolve({ valid: isValid, verified: true });
                    })
                    .catch(() => {
                        if (!responded) {
                            logWarn(MODULE, 'Verification timeout', { requestId });
                            
                            callsState.verificationLock = false;
                            this._verificationInProgress = false;
                            
                            if (this._session && this._session.authenticated && this._session.expiresAt > Date.now()) {
                                logWarn(MODULE, 'Using cached session after timeout');
                                callsState.verified = true;
                                resolve({ valid: true, cached: true, timeout: true });
                            } else {
                                resolve({ valid: false, reason: 'timeout' });
                            }
                        }
                    });
            });
        },

        _flushQueue: function() {
            // Queue is now flushed at the message handler level
        },

        initiateCall: async function(callType, participants = []) {
            if (state !== 'ACTIVE') {
                logWarn(MODULE, 'Cannot initiate call - not in ACTIVE state', { state });
                this._notifyListeners('call_blocked', { reason: 'not_active' });
                return { success: false, reason: 'not_active' };
            }

            if (!parentReady) {
                logWarn(MODULE, 'Cannot initiate call - parent not ready');
                this._notifyListeners('call_blocked', { reason: 'parent_not_ready' });
                return { success: false, reason: 'parent_not_ready' };
            }

            if (callsState.callActive) {
                logWarn(MODULE, 'Cannot initiate call - call already active', { state });
                this._notifyListeners('call_blocked', { reason: 'call_active' });
                return { success: false, reason: 'call_active' };
            }

            if (callsState.recoveryMode) {
                logWarn(MODULE, 'Cannot initiate call - recovery mode active', { state });
                this._notifyListeners('call_blocked', { reason: 'recovery' });
                return { success: false, reason: 'recovery' };
            }

            const permCheck = await PermissionManager.checkPermissions({
                audio: true,
                video: callType === 'video'
            });
            
            if (!permCheck.success) {
                logWarn(MODULE, 'Call blocked - permission check failed', { error: permCheck.error });
                this._notifyListeners('permission_denied', { error: permCheck.error });
                return { success: false, reason: 'permission_denied', error: permCheck.error };
            }

            callsState.pendingCall = { type: callType, participants };

            const verifyResult = await this.verifySession(true);

            if (!verifyResult.valid) {
                logWarn(MODULE, 'Call blocked - session verification failed', verifyResult);
                callsState.pendingCall = null;
                return { success: false, reason: 'verification_failed' };
            }

            callsState.verified = true;

            if (!callsState.parentReady) {
                logWarn(MODULE, 'Call blocked - parent not ready');
                callsState.pendingCall = null;
                return { success: false, reason: 'parent_not_ready' };
            }

            if (!this._session || !this._session.authenticated) {
                logWarn(MODULE, 'Call blocked - no valid session');
                callsState.pendingCall = null;
                return { success: false, reason: 'no_session' };
            }

            if (!callsState.token) {
                logWarn(MODULE, 'Call blocked - no token');
                callsState.pendingCall = null;
                return { success: false, reason: 'no_token' };
            }

            if (callsState.callActive) {
                logWarn(MODULE, 'Call blocked - call already active');
                callsState.pendingCall = null;
                return { success: false, reason: 'call_active' };
            }

            try {
                callsState.callActive = true;
                callsState.webrtcInitialized = true;

                const constraints = {
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
                };

                const streamResult = await MediaManager.getLocalStream(constraints);
                
                if (!streamResult.success) {
                    throw new Error(streamResult.error || 'Failed to get media stream');
                }

                const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
                callsState.activeCallId = callId;
                callsState.callParticipants = participants;
                callsState.callStartTime = Date.now();
                callsState.callType = callType;

                WebRTCManager.createPeerConnection();
                WebRTCManager.addStream(streamResult.stream);

                callsState.callInvitationTimer = setTimeout(() => {
                    if (callsState.callActive && !callsState.webrtcInitialized) {
                        logWarn(MODULE, 'Call invitation timed out');
                        this.endCall();
                        this._notifyListeners('call_timeout', { callId });
                    }
                }, CONFIG.CALL_INVITATION_TIMEOUT);

                IframeTransport.sendAction('START_CALL', {
                    callId,
                    callType,
                    participants,
                    timestamp: Date.now()
                }).catch(error => {
                    logError(MODULE, 'Failed to send START_CALL action', error);
                });

                this.transition(CALLS_STATE.CALL_READY, 'call_initiated');

                logSuccess(MODULE, 'Call initiated', { type: callType, callId });
                
                callsState.pendingCall = null;

                return { 
                    success: true, 
                    callId,
                    stream: streamResult.stream
                };

            } catch (error) {
                logError(MODULE, 'Failed to initiate call', error);
                callsState.callActive = false;
                callsState.webrtcInitialized = false;
                callsState.pendingCall = null;
                MediaManager.stopLocalStream();
                WebRTCManager.close();
                return { success: false, reason: error.message };
            }
        },

        endCall: async function() {
            if (!callsState.activeCallId) return;

            logInfo(MODULE, 'Ending call', { callId: callsState.activeCallId });

            if (callsState.callInvitationTimer) {
                clearTimeout(callsState.callInvitationTimer);
                callsState.callInvitationTimer = null;
            }

            IframeTransport.sendAction('END_CALL', {
                callId: callsState.activeCallId,
                timestamp: Date.now()
            }).catch(error => {
                logError(MODULE, 'Failed to send END_CALL action', error);
            });

            MediaManager.stopLocalStream();
            WebRTCManager.close();

            callsState.activeCallId = null;
            callsState.callActive = false;
            callsState.webrtcInitialized = false;
            callsState.remoteStream = null;
            callsState.remoteStreams.clear();
            callsState.callType = null;
            
            if (this._currentState === CALLS_STATE.IN_CALL) {
                this.transition(CALLS_STATE.CALL_READY, 'call_ended');
            }

            logSuccess(MODULE, 'Call ended');
        },

        handleIncomingCall: function(callData) {
            logInfo(MODULE, 'Incoming call received', callData);

            if (!parentReady) {
                logWarn(MODULE, 'Incoming call ignored - parent not ready');
                return;
            }

            if (!this._session || !this._session.authenticated || this._session.expiresAt <= Date.now()) {
                logWarn(MODULE, 'Incoming call rejected - session invalid');
                return;
            }

            if (callsState.recoveryMode) {
                logWarn(MODULE, 'Incoming call queued - recovery mode active');
                callsState.pendingCall = callData;
                return;
            }

            if (callsState.callActive) {
                logWarn(MODULE, 'Incoming call rejected - already in a call');
                
                IframeTransport.sendAction('DECLINE_CALL', {
                    callId: callData.callId,
                    reason: 'busy',
                    timestamp: Date.now()
                });
                return;
            }

            this.verifySession().then(result => {
                if (!result.valid) {
                    logWarn(MODULE, 'Incoming call rejected - verification failed');
                    return;
                }

                callsState.callData = callData;
                callsState.callState = 'incoming';
                this._notifyListeners('incoming_call', callData);
            });
        },

        getState: function() {
            return this._currentState;
        },

        getSession: function() {
            return this._session ? { ...this._session } : null;
        },

        isActive: function() {
            return this._currentState === CALLS_STATE.ACTIVE;
        },

        isCallReady: function() {
            return this._currentState === CALLS_STATE.CALL_READY;
        },

        isInCall: function() {
            return this._currentState === CALLS_STATE.IN_CALL;
        },

        canInitiateCall: function() {
            return this._currentState === CALLS_STATE.ACTIVE && 
                   this._session && 
                   this._session.authenticated &&
                   this._session.expiresAt > Date.now() &&
                   callsState.verified &&
                   callsState.parentReady &&
                   !callsState.recoveryMode;
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._stateChangeListeners.add(listener);
        },

        removeListener: function(listener) {
            this._stateChangeListeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._stateChangeListeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        reset: function() {
            this._clearTimers();
            this._currentState = CALLS_STATE.INIT;
            this._previousState = null;
            this._moduleRegistered = false;
            this._sessionReceived = false;
            this._parentReadyReceived = false;
            this._session = null;
            this._verificationInProgress = false;
            callsState.activeCallId = null;
            callsState.callActive = false;
            callsState.webrtcInitialized = false;
            callsState.registered = false;
            callsState.parentReady = false;
            callsState.session = null;
            callsState.sessionStatus = 'pending';
            callsState.token = null;
            callsState.verified = false;
            callsState.verificationLock = false;
            callsState.callActive = false;
            callsState.pendingCall = null;
            callsState.recoveryMode = false;
            callsState.sessionReceived = false;
            callsState.childReadySent = false;
            callsState.registrationSent = false;
            setState('INITIALIZING');
            
            MediaManager.stopLocalStream();
            WebRTCManager.close();
        },

        _clearTimers: function() {
        }
    };

    CallsStateGovernor.initialize();

    // ==================== V5 STATE GOVERNOR (Compatibility) ====================
    const V5StateGovernor = {
        _currentV5State: V5_STATE.BOOTING,

        initialize: function() {
            logInfo(MODULE, 'V5StateGovernor initialized (compatibility)');
            return this;
        },

        transition: function(newV5State, reason = '') {
            const mapping = {
                [V5_STATE.BOOTING]: CALLS_STATE.INIT,
                [V5_STATE.REGISTERING]: CALLS_STATE.REGISTERING,
                [V5_STATE.WAITING_SESSION]: CALLS_STATE.REGISTERED,
                [V5_STATE.WAITING_PARENT_READY]: CALLS_STATE.SESSION_RECEIVED,
                [V5_STATE.ACTIVE]: CALLS_STATE.ACTIVE,
                [V5_STATE.DEGRADED]: CALLS_STATE.TERMINATED,
                [V5_STATE.STANDALONE]: CALLS_STATE.TERMINATED,
                [V5_STATE.OFFLINE]: CALLS_STATE.TERMINATED
            };
            
            const callsState = mapping[newV5State] || CALLS_STATE.INIT;
            CallsStateGovernor.transition(callsState, reason);
            return true;
        },

        startRegistration: function() {
            CallsStateGovernor.startHandshake();
        },

        handleModuleRegistered: function() {
            CallsStateGovernor.handleModuleRegistered();
        },

        handleSessionActive: function(sessionData) {
            CallsStateGovernor.handleSessionActive(sessionData);
        },

        handleSessionNull: function() {
            CallsStateGovernor.handleSessionNull();
        },

        handleParentReady: function() {
            CallsStateGovernor.handleParentReady();
        },

        handleHeartbeatAck: function() {
        },

        handleOnline: function() {
        },

        handleOffline: function() {
        },

        verifySession: function(force) {
            return CallsStateGovernor.verifySession(force);
        },

        queueMessage: function(message) {
        },

        canSendOperational: function() {
            return CallsStateGovernor.isActive() && CallsStateGovernor._parentReadyReceived;
        },

        getState: function() {
            const callsState = CallsStateGovernor.getState();
            const mapping = {
                [CALLS_STATE.INIT]: V5_STATE.BOOTING,
                [CALLS_STATE.REGISTERING]: V5_STATE.REGISTERING,
                [CALLS_STATE.REGISTERED]: V5_STATE.WAITING_SESSION,
                [CALLS_STATE.SESSION_RECEIVED]: V5_STATE.WAITING_PARENT_READY,
                [CALLS_STATE.ACTIVE]: V5_STATE.ACTIVE,
                [CALLS_STATE.CALL_READY]: V5_STATE.ACTIVE,
                [CALLS_STATE.IN_CALL]: V5_STATE.ACTIVE,
                [CALLS_STATE.TERMINATED]: V5_STATE.DEGRADED
            };
            return mapping[callsState] || V5_STATE.BOOTING;
        },

        isActive: function() {
            return CallsStateGovernor.isActive();
        },

        isDegraded: function() {
            return CallsStateGovernor.getState() === CALLS_STATE.TERMINATED;
        },

        isOffline: function() {
            return !navigator.onLine;
        },

        addListener: function(listener) {
            CallsStateGovernor.addListener(listener);
        },

        removeListener: function(listener) {
            CallsStateGovernor.removeListener(listener);
        },

        reset: function() {
            CallsStateGovernor.reset();
        }
    };

    V5StateGovernor.initialize();

    // ==================== STATE GOVERNOR ====================
    const StateGovernor = {
        _currentState: STATE.UNINITIALIZED,
        _previousState: null,
        _stateLock: false,
        _transitionLock: false,
        _stateChangeListeners: new Set(),
        _initializationPromise: null,
        _initializationResolve: null,
        _initializationReject: null,
        _sessionPromise: null,
        _sessionResolve: null,
        _sessionReject: null,
        _sessionTimeoutId: null,
        _initialized: false,
        _sessionActive: false,
        _fatalError: null,
        _allowTransitions: true,

        initialize: function() {
            if (this._initializationPromise) return this._initializationPromise;

            this._initializationPromise = new Promise((resolve, reject) => {
                this._initializationResolve = resolve;
                this._initializationReject = reject;
            });

            this._transition(STATE.UNINITIALIZED, STATE.BOOTSTRAPPING, 'initialize');
            return this._initializationPromise;
        },

        _transition: function(newState, reason = '') {
            if (!this._allowTransitions) {
                return false;
            }

            if (this._stateLock || this._transitionLock) {
                return false;
            }

            const oldState = this._currentState;
            if (oldState === newState) return false;

            if (!this._isLegalTransition(oldState, newState)) {
                logWarn(MODULE, `Illegal state transition: ${oldState} → ${newState}`);
                return false;
            }

            this._previousState = oldState;
            this._currentState = newState;

            this._updateDerivedState(newState);

            logState(MODULE, oldState, newState, reason);

            this._notifyListeners('state', { oldState, newState, reason });

            this._resolvePromisesForState(newState);

            return true;
        },

        transition: function(newState, reason = '') {
            return this._transition(newState, reason);
        },

        _isLegalTransition: function(from, to) {
            if (to === STATE.ERROR_RECOVERABLE || to === STATE.ERROR_FATAL) return true;
            if (to === STATE.RECOVERING) return from === STATE.ERROR_RECOVERABLE || from === STATE.ERROR_FATAL;

            const forwardTransitions = {
                [STATE.UNINITIALIZED]: [STATE.BOOTSTRAPPING],
                [STATE.BOOTSTRAPPING]: [STATE.REGISTERING, STATE.ERROR_RECOVERABLE],
                [STATE.REGISTERING]: [STATE.REGISTERED, STATE.ERROR_RECOVERABLE],
                [STATE.REGISTERED]: [STATE.SESSION_PENDING, STATE.ERROR_RECOVERABLE],
                [STATE.SESSION_PENDING]: [STATE.SESSION_ACTIVE, STATE.ERROR_RECOVERABLE],
                [STATE.SESSION_ACTIVE]: [STATE.SERVICES_INITIALIZING, STATE.ERROR_RECOVERABLE],
                [STATE.SERVICES_INITIALIZING]: [STATE.ACTIVE, STATE.ERROR_RECOVERABLE],
                [STATE.ACTIVE]: [STATE.SUSPENDED, STATE.DEGRADED, STATE.ERROR_RECOVERABLE],
                [STATE.SUSPENDED]: [STATE.ACTIVE, STATE.DEGRADED, STATE.ERROR_RECOVERABLE],
                [STATE.DEGRADED]: [STATE.RECOVERING, STATE.ERROR_RECOVERABLE],
                [STATE.RECOVERING]: [STATE.BOOTSTRAPPING, STATE.ERROR_FATAL],
                [STATE.ERROR_RECOVERABLE]: [STATE.RECOVERING, STATE.ERROR_FATAL],
                [STATE.ERROR_FATAL]: [STATE.RECOVERING]
            };

            return forwardTransitions[from] ? forwardTransitions[from].includes(to) : false;
        },

        _updateDerivedState: function(state) {
            switch (state) {
                case STATE.SESSION_ACTIVE:
                    this._sessionActive = true;
                    break;
                case STATE.ACTIVE:
                    this._initialized = true;
                    break;
                case STATE.ERROR_FATAL:
                    this._fatalError = true;
                    break;
            }
        },

        _resolvePromisesForState: function(state) {
            if (state === STATE.ACTIVE && this._initializationResolve) {
                this._initializationResolve({ success: true, state: STATE.ACTIVE });
                this._initializationResolve = null;
                this._initializationReject = null;
            }

            if (state === STATE.SESSION_ACTIVE && this._sessionResolve) {
                this._sessionResolve({ success: true });
                this._sessionResolve = null;
                this._sessionReject = null;
            }

            if (state === STATE.ERROR_FATAL) {
                if (this._initializationReject) {
                    this._initializationReject(new Error('Initialization failed: fatal error'));
                    this._initializationResolve = null;
                    this._initializationReject = null;
                }
                if (this._sessionReject) {
                    this._sessionReject(new Error('Session acquisition failed: fatal error'));
                    this._sessionResolve = null;
                    this._sessionReject = null;
                }
            }
        },

        lock: function() {
            if (this._stateLock) return false;
            this._stateLock = true;
            return true;
        },

        unlock: function() {
            this._stateLock = false;
        },

        transitionLock: function() {
            if (this._transitionLock) return false;
            this._transitionLock = true;
            return true;
        },

        transitionUnlock: function() {
            this._transitionLock = false;
        },

        disableTransitions: function() {
            this._allowTransitions = false;
        },

        enableTransitions: function() {
            this._allowTransitions = true;
        },

        getState: function() { return this._currentState; },
        isInitialized: function() { return this._initialized; },
        isSessionActive: function() { return this._sessionActive; },
        hasFatalError: function() { return this._fatalError; },

        waitForSession: function(timeout = 5000) {
            if (this._sessionActive) {
                logInfo(MODULE, 'Session already active, resolving immediately');
                return Promise.resolve({ success: true, immediate: true });
            }
            
            if (callsState.session && callsState.token) {
                logInfo(MODULE, 'Valid session found in callsState');
                this._sessionActive = true;
                return Promise.resolve({ success: true, fromState: true });
            }
            
            try {
                const storedSession = SafeStorage.get('session');
                if (storedSession && storedSession.token && storedSession.expiresAt > Date.now()) {
                    logInfo(MODULE, 'Valid session found in storage');
                    callsState.session = storedSession;
                    callsState.token = storedSession.token;
                    this._sessionActive = true;
                    callsState.sessionReceived = true;
                    callsState.sessionStatus = 'valid';
                    return Promise.resolve({ success: true, fromStorage: true });
                }
            } catch (e) {}
            
            if (this._fatalError) {
                return Promise.reject(new Error('Fatal error occurred'));
            }

            if (this._sessionPromise) {
                logInfo(MODULE, 'Returning existing session promise');
                return this._sessionPromise;
            }

            logInfo(MODULE, `Creating new session promise with timeout ${timeout}ms`);

            this._sessionPromise = new Promise((resolve) => {
                this._sessionResolve = resolve;

                this._sessionTimeoutId = setTimeout(() => {
                    if (callsState.session && callsState.token) {
                        logInfo(MODULE, 'Session became valid during timeout');
                        this._sessionActive = true;
                        callsState.sessionReceived = true;
                        callsState.sessionStatus = 'valid';
                        if (this._sessionResolve) {
                            this._sessionResolve({ success: true, delayed: true });
                        }
                    } else {
                        logWarn(MODULE, `Session acquisition timeout after ${timeout}ms - continuing with pending state`);
                        if (this._sessionResolve) {
                            this._sessionResolve({ success: true, pending: true, timeout: true });
                        }
                    }
                    
                    this._sessionPromise = null;
                    this._sessionResolve = null;
                    this._sessionReject = null;
                    this._sessionTimeoutId = null;
                }, timeout);
            });

            return this._sessionPromise;
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._stateChangeListeners.add(listener);
        },

        removeListener: function(listener) {
            this._stateChangeListeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._stateChangeListeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        reset: function() {
            this._currentState = STATE.UNINITIALIZED;
            this._previousState = null;
            this._initialized = false;
            this._sessionActive = false;
            this._fatalError = null;
            this._initializationPromise = null;
            this._initializationResolve = null;
            this._initializationReject = null;
            this._sessionPromise = null;
            this._sessionResolve = null;
            this._sessionReject = null;
            if (this._sessionTimeoutId) {
                clearTimeout(this._sessionTimeoutId);
                this._sessionTimeoutId = null;
            }
        }
    };

    // ==================== IFRAME SESSION CLIENT ====================
    const IframeSessionClient = {
        _session: null,
        _token: null,
        _userId: null,
        _expiresAt: null,
        _state: 'pending',
        _valid: false,
        _guestMode: false,
        _refreshTimer: null,
        _checkTimer: null,
        _listeners: new Set(),
        _expiryWarningSent: false,
        _usingCachedSession: false,
        _tokenReceived: false,
        _processingToken: false,
        _sessionPromise: null,
        _sessionResolve: null,
        _sessionReject: null,
        _initLock: false,

        initialize: function() {
            if (this._initLock) return this;
            this._initLock = true;
            
            this._state = 'pending';
            this._valid = false;
            
            this._loadFromStorage();
            this._setupListeners();
            this._startRefreshTimer();
            this._startCheckTimer();

            logReady(MODULE, 'IframeSessionClient initialized', { state: this._state });
            return this;
        },

        checkStorage: function() {
            try {
                const stored = SafeStorage.get('session');
                if (!stored) return false;
                
                if (stored.token && stored.token.length > 10) {
                    const expiresAt = stored.expiresAt || stored.expiry;
                    if (expiresAt && expiresAt < Date.now()) {
                        SafeStorage.remove('session');
                        return false;
                    }
                    
                    this._token = stored.token;
                    this._userId = stored.userId;
                    this._expiresAt = expiresAt || (Date.now() + 3600000);
                    this._valid = true;
                    this._state = 'valid';
                    
                    logSession(MODULE, 'emergency recovery from storage');
                    return true;
                }
            } catch (e) {
                logError(MODULE, 'checkStorage error', e);
            }
            return false;
        },

        _resolveSessionPromise: function() {
            if (this._sessionResolve) {
                this._sessionResolve({ success: true });
                this._sessionResolve = null;
                this._sessionReject = null;
                this._sessionPromise = null;
            }
        },

        _rejectSessionPromise: function(error) {
            if (this._sessionReject) {
                this._sessionReject(error);
                this._sessionResolve = null;
                this._sessionReject = null;
                this._sessionPromise = null;
            }
        },

        waitForSession: function(timeout = 5000) {
            if (this._valid) {
                return Promise.resolve({ success: true });
            }

            if (this._sessionPromise) {
                return this._sessionPromise;
            }

            this._sessionPromise = new Promise((resolve, reject) => {
                this._sessionResolve = resolve;
                this._sessionReject = reject;

                setTimeout(() => {
                    if (this._sessionPromise && this._sessionReject) {
                        this._sessionReject(new Error('Session acquisition timeout'));
                        this._sessionResolve = null;
                        this._sessionReject = null;
                        this._sessionPromise = null;
                        logSession(MODULE, 'acquisition timeout');
                    }
                }, timeout);
            });

            return this._sessionPromise;
        },

        _setupListeners: function() {
        },

        _handleSessionUpdate: function(data) {
            let updated = false;
            let hadToken = !!this._token;

            if (data.token) {
                this._token = data.token;
                this._tokenReceived = true;
                updated = true;
                logSession(MODULE, 'token received');
            }

            if (data.userId || data.user?.id) {
                this._userId = data.userId || data.user?.id;
                updated = true;
            }

            if (data.expires || data.expiry) {
                this._expiresAt = data.expires || data.expiry;
                updated = true;
            }

            if (data.authenticated !== undefined) {
                this._valid = data.authenticated;
                this._state = data.authenticated ? 'valid' : 'invalid';
                updated = true;
            }

            if (updated) {
                this._updateSession();
                this._saveToStorage();
                this._expiryWarningSent = false;
                this._usingCachedSession = false;

                this._notifyListeners('update', data);
                
                if (this._sessionResolve) {
                    logSession(MODULE, 'resolving promise from update');
                    this._sessionResolve({ success: true, fromUpdate: true });
                    this._sessionResolve = null;
                    this._sessionReject = null;
                    this._sessionPromise = null;
                }
                
                logSession(MODULE, 'updated from parent' + (hadToken ? ' (refresh)' : ''));
            }
        },

        _handleTokenUpdate: function(data) {
            if (this._processingToken) return;
            this._processingToken = true;

            try {
                if (!data || !data.token) return;
                if (this._token === data.token) return;

                this._token = data.token;
                this._tokenReceived = true;
                this._expiresAt = data.expires || data.expiry || (Date.now() + 3600000);
                this._state = 'valid';
                this._valid = true;

                this._updateSession();
                this._saveToStorage();

                this._notifyListeners('token', data);
                this._resolveSessionPromise();
                logSession(MODULE, 'updated from parent');

            } finally {
                setTimeout(() => { this._processingToken = false; }, 500);
            }
        },

        _handleAuthError: function() {
            this.clear();
        },

        _updateSession: function() {
            this._session = {
                token: this._token,
                userId: this._userId,
                expiresAt: this._expiresAt,
                valid: this._valid,
                guestMode: this._guestMode
            };

            this._state = this._valid ? 'valid' : 'invalid';
            this._valid = true;
            
            callsState.session = this._session;
            callsState.token = this._token;
            callsState.sessionStatus = this._state;
        },

        _saveToStorage: function() {
            SafeStorage.set('session', {
                token: this._token,
                userId: this._userId,
                expiresAt: this._expiresAt,
                valid: this._valid,
                timestamp: Date.now()
            });
        },

        _loadFromStorage: function() {
            try {
                const stored = SafeStorage.get('session');
                if (!stored) {
                    return false;
                }

                if (stored.token && stored.token.length > 10) {
                    const expiresAt = stored.expiresAt || stored.expiry;
                    if (expiresAt && expiresAt < Date.now()) {
                        SafeStorage.remove('session');
                        return false;
                    }

                    this._token = stored.token;
                    this._userId = stored.userId;
                    this._expiresAt = expiresAt || (Date.now() + 3600000);
                    this._valid = true;
                    this._state = 'valid';
                    this._usingCachedSession = true;
                    
                    this._session = {
                        token: this._token,
                        userId: this._userId,
                        expiresAt: this._expiresAt,
                        valid: true,
                        guestMode: this._guestMode
                    };
                    
                    callsState.session = this._session;
                    callsState.token = this._token;
                    callsState.sessionReceived = true;
                    callsState.sessionStatus = 'valid';
                    
                    this._notifyListeners('update', { 
                        token: this._token, 
                        userId: this._userId,
                        fromStorage: true 
                    });
                    
                    logSession(MODULE, 'loaded from storage');
                    return true;
                }

                SafeStorage.remove('session');
                return false;

            } catch (error) {
                return false;
            }
        },

        clear: function() {
            this._session = null;
            this._token = null;
            this._userId = null;
            this._expiresAt = null;
            this._valid = false;
            this._guestMode = false;
            this._state = 'invalid';
            this._usingCachedSession = false;
            this._tokenReceived = false;

            SafeStorage.remove('session');

            this._notifyListeners('clear', {});
            this._expiryWarningSent = false;

            this._rejectSessionPromise(new Error('Session cleared'));
            
            callsState.session = null;
            callsState.token = null;
            callsState.sessionReceived = false;
            callsState.sessionStatus = 'invalid';
            
            logInfo(MODULE, 'Session cleared');
        },

        _startRefreshTimer: function() {
            if (this._refreshTimer) clearTimeout(this._refreshTimer);

            if (!this._expiresAt) return;

            const now = Date.now();
            const timeUntilExpiry = this._expiresAt - now;
            const refreshTime = Math.max(0, timeUntilExpiry - 600000);

            if (refreshTime <= 0) {
                return;
            }

            this._refreshTimer = setTimeout(() => {
                logInfo(MODULE, 'Session expiry approaching - waiting for parent refresh');
            }, refreshTime);
        },

        _startCheckTimer: function() {
            if (this._checkTimer) clearInterval(this._checkTimer);

            this._checkTimer = setInterval(() => {
                if (this._expiresAt && this._expiresAt < Date.now()) {
                    if (!this._expiryWarningSent) {
                        this._expiryWarningSent = true;
                        this._notifyListeners('expired', {});
                    }

                    this.clear();
                } else if (this._expiresAt && (this._expiresAt - Date.now()) < 600000 && !this._expiryWarningSent) {
                    this._expiryWarningSent = true;
                    this._notifyListeners('expiring', { timeLeft: this._expiresAt - Date.now() });
                }
            }, 120000);
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getSession: function() { return this._session ? { ...this._session } : null; },
        getToken: function() { return this._token; },
        getUserId: function() { return this._userId; },
        getState: function() { return this._state; },
        
        isValid: function() {
            if (!this._token || this._token.length < 10) {
                this._loadFromStorage();
                if (!this._token || this._token.length < 10) {
                    return false;
                }
            }

            if (this._expiresAt && this._expiresAt < Date.now()) {
                return false;
            }

            return this._valid;
        },

        checkStorage: function() {
            return this._loadFromStorage();
        },

        isDemoMode: function() { return false; },
        isGuestMode: function() { return this._guestMode; },
        getTimeRemaining: function() { return this._expiresAt ? Math.max(0, this._expiresAt - Date.now()) : 0; },

        cleanup: function() {
            if (this._refreshTimer) {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
            }
            if (this._checkTimer) {
                clearInterval(this._checkTimer);
                this._checkTimer = null;
            }
            this._listeners.clear();
        }
    };

    IframeSessionClient.initialize();

    // ==================== RELIABILITY ENGINE - NO RETRIES ====================
    const ReliabilityEngine = {
        _circuitBreakers: new Map(),
        _retryCounters: new Map(),
        _backoffBase: 500,
        _maxRetries: 1,
        _offlineQueue: [],
        _online: navigator.onLine,
        _listeners: new Set(),
        _sessionActive: false,

        initialize: function() {
            this._setupListeners();
            logReady(MODULE, 'ReliabilityEngine initialized');
            return this;
        },

        _setupListeners: function() {
            window.addEventListener('online', () => {
                this._online = true;
                this._processOfflineQueue();
            });

            window.addEventListener('offline', () => {
                this._online = false;
            });
        },

        getCircuitBreaker: function(name) {
            if (!this._circuitBreakers.has(name)) {
                this._circuitBreakers.set(name, new CircuitBreaker(name));
            }
            return this._circuitBreakers.get(name);
        },

        canRetry: function(key) {
            return false;
        },

        incrementRetry: function(key) {
            return 1;
        },

        resetRetry: function(key) {
            this._retryCounters.delete(key);
        },

        recordFailure: function(key) {
            const breaker = this.getCircuitBreaker(key);
            breaker.failure();
        },

        getBackoffDelay: function(key) {
            return 0;
        },

        executeWithRetry: async function(fn, key, options = {}) {
            try {
                return await fn();
            } catch (error) {
                this.recordFailure(key);
                throw error;
            }
        },

        queueOffline: function(operation) {
            this._offlineQueue.push({ ...operation, timestamp: Date.now() });
            this._notifyListeners('queued', { type: operation.type });
        },

        _processOfflineQueue: function() {
            if (this._offlineQueue.length === 0) return;

            const queue = [...this._offlineQueue];
            this._offlineQueue = [];

            queue.forEach(operation => {
                try {
                    if (operation.execute) {
                        operation.execute().catch(() => {
                            logWarn(MODULE, 'Offline operation failed', { type: operation.type });
                        });
                    }
                } catch (e) {
                    logWarn(MODULE, 'Offline operation error', e);
                }
            });
        },

        setSessionActive: function(active) {
            this._sessionActive = active;
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getStatus: function() {
            return {
                online: this._online,
                circuitBreakers: this._circuitBreakers.size,
                retryCounters: this._retryCounters.size,
                offlineQueueSize: this._offlineQueue.length,
                sessionActive: this._sessionActive
            };
        }
    };

    class CircuitBreaker {
        constructor(name) {
            this.name = name;
            this.failureThreshold = 1;
            this.resetTimeout = 30000;
            this.state = 'CLOSED';
            this.failureCount = 0;
            this.lastFailureTime = null;
            this.nextAttemptTime = null;
        }

        success() {
            this.state = 'CLOSED';
            this.failureCount = 0;
        }

        failure() {
            this.failureCount++;
            this.lastFailureTime = Date.now();

            if (this.failureCount >= this.failureThreshold) {
                this.state = 'OPEN';
                this.nextAttemptTime = Date.now() + this.resetTimeout;
            }
        }

        canExecute() {
            if (this.state === 'CLOSED') return true;

            if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTime) {
                this.state = 'HALF_OPEN';
                return true;
            }

            return this.state === 'HALF_OPEN';
        }

        getState() { return this.state; }
    }

    ReliabilityEngine.initialize();

    // ==================== RECOVERY MANAGER - PASSIVE ====================
    const RecoveryManager = {
        _recoveryInProgress: false,
        _recoveryAttempts: 0,
        _maxRecoveryAttempts: 1,
        _recoveryBackoff: 5000,
        _lastCheckpoint: null,
        _checkpoints: [],
        _recoveryTimer: null,
        _listeners: new Set(),
        _recoveryPromise: null,

        initialize: function() {
            this._recoveryAttempts = 0;
            this._recoveryInProgress = false;
            this._loadLastCheckpoint();
            logReady(MODULE, 'RecoveryManager initialized');
            return this;
        },

        createCheckpoint: function(name, data = {}) {
            const checkpoint = {
                name,
                timestamp: Date.now(),
                state: StateGovernor.getState(),
                sessionValid: IframeSessionClient.isValid(),
                environment: 'production',
                data: data
            };

            this._checkpoints.push(checkpoint);
            if (this._checkpoints.length > 10) this._checkpoints.shift();
            this._lastCheckpoint = checkpoint;

            this._saveCheckpoint();

            logInfo(MODULE, `Checkpoint created: ${name}`);
            return checkpoint;
        },

        _saveCheckpoint: function() {
            if (this._lastCheckpoint) {
                SafeStorage.set('checkpoint', {
                    name: this._lastCheckpoint.name,
                    timestamp: this._lastCheckpoint.timestamp,
                    state: this._lastCheckpoint.state,
                    sessionValid: this._lastCheckpoint.sessionValid
                });
            }
        },

        _loadLastCheckpoint: function() {
            try {
                const stored = SafeStorage.get('checkpoint');
                if (stored) {
                    this._lastCheckpoint = stored;
                    logInfo(MODULE, 'Loaded last checkpoint', stored);
                }
            } catch (error) {
                logWarn(MODULE, 'Failed to load checkpoint', error);
            }
        },

        recover: async function() {
            if (this._recoveryPromise) return this._recoveryPromise;

            if (this._recoveryInProgress) {
                return { success: false, reason: 'in_progress' };
            }

            if (this._recoveryAttempts >= this._maxRecoveryAttempts) {
                logWarn(MODULE, 'Max recovery attempts reached');
                return { success: false, reason: 'max_attempts' };
            }

            this._recoveryInProgress = true;
            this._recoveryAttempts++;

            logInfo(MODULE, `Starting recovery (attempt ${this._recoveryAttempts})`);
            this._notifyListeners('start', { attempt: this._recoveryAttempts });

            this._recoveryPromise = (async () => {
                try {
                    if (!navigator.onLine) {
                        logWarn(MODULE, 'Recovery: Offline, waiting for network');
                        await this._waitForNetwork();
                    }

                    if (!window.parent || window.parent === window) {
                        logWarn(MODULE, 'Recovery: No parent window');
                        this._recoveryInProgress = false;
                        this._notifyListeners('failed', { reason: 'no_parent' });
                        return { success: false, reason: 'no_parent' };
                    }

                    safeSend('RECOVERY_REQUEST', {
                        module: MODULE_NAME,
                        timestamp: Date.now(),
                        attempts: this._recoveryAttempts
                    }, { requireAck: false }).catch(() => {});

                    logInfo(MODULE, 'Recovery request sent, waiting for parent');

                    this._recoveryAttempts = 0;
                    this._recoveryInProgress = false;

                    logSuccess(MODULE, 'Recovery request sent');
                    this._notifyListeners('request_sent', {});

                    return { success: true, requested: true };

                } catch (error) {
                    logError(MODULE, 'Recovery failed', error);
                    this._recoveryInProgress = false;
                    this._notifyListeners('failed', { error: error.message });
                    return { success: false, reason: error.message };
                } finally {
                    this._recoveryPromise = null;
                }
            })();

            return this._recoveryPromise;
        },

        _waitForNetwork: function() {
            return new Promise((resolve) => {
                if (navigator.onLine) {
                    resolve();
                    return;
                }
                const handler = () => {
                    window.removeEventListener('online', handler);
                    resolve();
                };
                window.addEventListener('online', handler);
                setTimeout(() => {
                    window.removeEventListener('online', handler);
                    resolve();
                }, 60000);
            });
        },

        scheduleRecovery: function(delay = 5000) {
            if (this._recoveryTimer) clearTimeout(this._recoveryTimer);

            this._recoveryTimer = setTimeout(() => {
                if (state !== 'ACTIVE' && !callsState.inPassiveMode) {
                    this.recover();
                }
            }, delay);
        },

        cancelRecovery: function() {
            if (this._recoveryTimer) {
                clearTimeout(this._recoveryTimer);
                this._recoveryTimer = null;
            }
            if (this._recoveryPromise) this._recoveryPromise = null;
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getStatus: function() {
            return {
                recoveryInProgress: this._recoveryInProgress,
                recoveryAttempts: this._recoveryAttempts,
                maxRecoveryAttempts: this._maxRecoveryAttempts,
                lastCheckpoint: this._lastCheckpoint ? {
                    name: this._lastCheckpoint.name,
                    timestamp: this._lastCheckpoint.timestamp,
                    state: this._lastCheckpoint.state
                } : null,
                checkpoints: this._checkpoints.length
            };
        }
    };

    RecoveryManager.initialize();

    // ==================== COMPATIBILITY BRIDGE ====================
    const CompatibilityBridge = {
        _legacyMode: false,
        _parentCapabilities: new Set(),
        _detected: false,
        _version: CONFIG.VERSION,

        detect: function() {
            if (this._detected) return this._legacyMode;

            try {
                const parentProtocol = window.parent?.__PROTOCOL_VERSION__;
                
                if (parentProtocol && parentProtocol >= 'KYN-6.0') {
                    this._legacyMode = false;
                    this._parentCapabilities.add('modern_protocol');
                    logInfo(MODULE, 'Modern parent protocol detected', { version: parentProtocol });
                } else {
                    this._legacyMode = false;
                }
            } catch (e) {
                this._legacyMode = false;
            }

            this._detected = true;

            logInfo(MODULE, `Compatibility bridge: ${this._legacyMode ? 'legacy' : 'modern'} mode`);
            return this._legacyMode;
        },

        adaptOutgoing: function(message) {
            return message;
        },

        adaptIncoming: function(rawMessage) {
            if (!rawMessage || typeof rawMessage !== 'object') return null;

            return rawMessage;
        },

        supports: function(feature) {
            this.detect();
            return this._parentCapabilities.has(feature);
        },

        getStatus: function() {
            return {
                legacyMode: this._legacyMode,
                capabilities: Array.from(this._parentCapabilities),
                version: this._version
            };
        }
    };

    CompatibilityBridge.detect();

    // ==================== DIAGNOSTICS AGENT ====================
    const DiagnosticsAgent = {
        _enabled: window.__IFRAME_DEBUG__ || false,
        _metrics: {
            messagesSent: 0,
            messagesReceived: 0,
            handshakeAttempts: 0,
            handshakeSuccesses: 0,
            sessionUpdates: 0,
            errors: 0,
            retries: 0,
            recoveries: 0,
            stateChanges: 0,
            callStartTime: 0,
            callEndReason: null,
            recoveryTriggers: 0
        },
        _history: [],
        _startTime: Date.now(),
        _snapshots: [],
        _maxHistory: 100,
        _maxSnapshots: 20,

        enable: function() {
            this._enabled = true;
            this._startTime = Date.now();
            logInfo(MODULE, 'DiagnosticsAgent enabled');
        },

        disable: function() { this._enabled = false; },

        record: function(name, data = {}) {
            if (!this._enabled) return;

            if (this._metrics.hasOwnProperty(name)) this._metrics[name]++;

            if (name === 'call_start') {
                this._metrics.callStartTime = Date.now();
                this._metrics.callEndReason = null;
            }
            if (name === 'call_end' && data.reason) {
                this._metrics.callEndReason = data.reason;
            }
            if (name === 'recovery_trigger') {
                this._metrics.recoveryTriggers++;
            }

            const entry = {
                name,
                data,
                timestamp: Date.now(),
                state: {
                    coreState: StateGovernor.getState(),
                    sessionValid: IframeSessionClient.isValid(),
                    online: navigator.onLine,
                    visible: !document.hidden,
                    v5State: V5StateGovernor ? V5StateGovernor.getState() : 'unknown',
                    tokenValid: !!callsState.token,
                    lifecycleState: state,
                    inPassiveMode: false
                }
            };

            this._history.push(entry);
            if (this._history.length > this._maxHistory) this._history.shift();
        },

        snapshot: function(label) {
            if (!this._enabled) return;

            const snapshot = {
                label,
                timestamp: Date.now(),
                metrics: { ...this._metrics },
                state: {
                    coreState: StateGovernor.getState(),
                    sessionValid: IframeSessionClient.isValid(),
                    online: navigator.onLine,
                    visible: !document.hidden,
                    v5State: V5StateGovernor ? V5StateGovernor.getState() : 'unknown',
                    tokenValid: !!callsState.token,
                    lifecycleState: state,
                    inPassiveMode: false
                },
                environment: { environment: ENVIRONMENT.current },
                transport: IframeTransport.getStatus(),
                handshake: { state: 'unknown' },
                session: IframeSessionClient.isValid() ? {
                    valid: true,
                    timeRemaining: IframeSessionClient.getTimeRemaining()
                } : { valid: false },
                recovery: RecoveryManager.getStatus(),
                callsState: { ...callsState }
            };

            this._snapshots.push(snapshot);
            if (this._snapshots.length > this._maxSnapshots) this._snapshots.shift();
        },

        getReport: function() {
            const uptime = Date.now() - this._startTime;

            return {
                uptime,
                metrics: { ...this._metrics },
                history: this._history.slice(-10),
                snapshots: this._snapshots.slice(-5),
                state: {
                    coreState: StateGovernor.getState(),
                    sessionValid: IframeSessionClient.isValid(),
                    online: navigator.onLine,
                    visible: !document.hidden,
                    v5State: V5StateGovernor ? V5StateGovernor.getState() : 'unknown',
                    tokenValid: !!callsState.token,
                    lifecycleState: state,
                    inPassiveMode: false
                },
                environment: { environment: ENVIRONMENT.current },
                transport: IframeTransport.getStatus(),
                session: IframeSessionClient.isValid() ? {
                    valid: true,
                    timeRemaining: IframeSessionClient.getTimeRemaining()
                } : { valid: false },
                recovery: RecoveryManager.getStatus(),
                callsState: { ...callsState }
            };
        },

        reset: function() {
            this._metrics = {
                messagesSent: 0,
                messagesReceived: 0,
                handshakeAttempts: 0,
                handshakeSuccesses: 0,
                sessionUpdates: 0,
                errors: 0,
                retries: 0,
                recoveries: 0,
                stateChanges: 0,
                callStartTime: 0,
                callEndReason: null,
                recoveryTriggers: 0
            };
            this._history = [];
            this._snapshots = [];
            this._startTime = Date.now();
        }
    };

    if (window.__IFRAME_DEBUG__) DiagnosticsAgent.enable();

    // ==================== MULTI-MODULE COORDINATOR ====================
    const MultiModuleCoordinator = {
        _modules: new Map(),
        _authority: null,
        _initialized: false,

        initialize: function() {
            if (this._initialized) return this;

            this._authority = {
                environment: ENVIRONMENT,
                storage: SafeStorage,
                transport: IframeTransport,
                session: IframeSessionClient,
                reliability: ReliabilityEngine,
                recovery: RecoveryManager,
                compatibility: CompatibilityBridge,
                diagnostics: DiagnosticsAgent,
                origin: OriginSecurity,
                state: StateGovernor,
                v5State: V5StateGovernor,
                callsState: callsState
            };

            this._initialized = true;
            logReady(MODULE, 'MultiModuleCoordinator initialized');

            return this;
        },

        register: function(name, module) {
            if (this._modules.has(name)) {
                logWarn(MODULE, `Module ${name} already registered, overriding`);
            }
            this._modules.set(name, module);
            logInfo(MODULE, `Module registered: ${name}`);
        },

        get: function(name) {
            return this._authority?.[name] || this._modules.get(name);
        },

        getAuthority: function() { return this._authority; },

        getStatus: function() {
            const status = { authority: {}, modules: {} };

            if (this._authority) {
                Object.keys(this._authority).forEach(key => {
                    const module = this._authority[key];
                    if (module && typeof module.getStatus === 'function') {
                        status.authority[key] = module.getStatus();
                    } else {
                        status.authority[key] = { available: !!module };
                    }
                });
            }

            this._modules.forEach((module, name) => {
                if (module && typeof module.getStatus === 'function') {
                    status.modules[name] = module.getStatus();
                } else {
                    status.modules[name] = { available: !!module };
                }
            });

            return status;
        }
    };

    MultiModuleCoordinator.initialize();

    // ==================== UI FAILSAFE ====================
    const UIFailsafe = {
        _enabled: true,
        _fallbackMode: false,
        _disabledButtons: new Set(),
        _disabledInputs: new Set(),
        _originalStates: new Map(),
        _listeners: new Set(),

        initialize: function() {
            logReady(MODULE, 'UIFailsafe initialized');
            return this;
        },

        enableFallbackMode: function() {
            if (this._fallbackMode) return;
            this._fallbackMode = true;
            this._notifyListeners('fallback', { enabled: true });
            logWarn(MODULE, 'UI fallback mode enabled');
        },

        disableFallbackMode: function() {
            if (!this._fallbackMode) return;
            this._fallbackMode = false;
            this._restoreUI();
            this._notifyListeners('fallback', { enabled: false });
            logInfo(MODULE, 'UI fallback mode disabled');
        },

        protectButton: function(button, fallbackHandler) {
            if (!button) return;
            const id = button.id || `btn-${Date.now()}-${Math.random()}`;
            this._originalStates.set(id, { disabled: button.disabled, onclick: button.onclick });

            const originalClick = button.onclick;
            button.onclick = (e) => {
                if (this._fallbackMode) {
                    if (fallbackHandler) {
                        fallbackHandler(e);
                    } else {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                } else if (originalClick) {
                    originalClick.call(button, e);
                }
            };
            this._disabledButtons.add(id);
        },

        protectInput: function(input, fallbackValue) {
            if (!input) return;
            const id = input.id || `input-${Date.now()}-${Math.random()}`;
            this._originalStates.set(id, { disabled: input.disabled, value: input.value, oninput: input.oninput });

            const originalInput = input.oninput;
            input.oninput = (e) => {
                if (this._fallbackMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (fallbackValue !== undefined) input.value = fallbackValue;
                } else if (originalInput) {
                    originalInput.call(input, e);
                }
            };
            this._disabledInputs.add(id);
        },

        showFallbackMessage: function(message, type = 'warning') {
            const notificationArea = document.getElementById('notificationArea') || document.body;
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

            notification.querySelector('.call-notification-close').addEventListener('click', () => notification.remove());

            notificationArea.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 10000);
        },

        _restoreUI: function() {
            this._originalStates.forEach((state, id) => {
                const element = document.getElementById(id);
                if (element) {
                    if (state.disabled !== undefined) element.disabled = state.disabled;
                    if (state.value !== undefined) element.value = state.value;
                    if (state.onclick) element.onclick = state.onclick;
                    if (state.oninput) element.oninput = state.oninput;
                }
            });
            this._originalStates.clear();
            this._disabledButtons.clear();
            this._disabledInputs.clear();
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getStatus: function() {
            return {
                enabled: this._enabled,
                fallbackMode: this._fallbackMode,
                protectedButtons: this._disabledButtons.size,
                protectedInputs: this._disabledInputs.size
            };
        }
    };

    UIFailsafe.initialize();

    // ==================== NAVIGATION GUARD ====================
    const NavigationGuard = {
        _currentPath: window.location.pathname,
        _currentHash: window.location.hash,
        _navigationInProgress: false,
        _pendingNavigation: null,
        _listeners: new Set(),

        initialize: function() {
            this._setupListeners();
            logReady(MODULE, 'NavigationGuard initialized');
            return this;
        },

        _setupListeners: function() {
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = (...args) => {
                if (this.shouldBlockNavigation()) {
                    return false;
                }
                this._handleNavigation('pushState', args);
                return originalPushState.apply(history, args);
            };

            history.replaceState = (...args) => {
                if (this.shouldBlockNavigation()) {
                    return false;
                }
                this._handleNavigation('replaceState', args);
                return originalReplaceState.apply(history, args);
            };

            window.addEventListener('popstate', () => {
                if (this.shouldBlockNavigation()) {
                    return false;
                }
                this._handleNavigation('popstate', {});
            });

            window.addEventListener('hashchange', () => {
                if (this.shouldBlockNavigation()) {
                    return false;
                }
                this._handleNavigation('hashchange', { hash: window.location.hash });
            });
        },

        shouldBlockNavigation: function() {
            return callsState.callActive === true;
        },

        _handleNavigation: function(type, data) {
            if (this._navigationInProgress) {
                this._pendingNavigation = { type, data };
                return;
            }

            const oldPath = this._currentPath;
            const oldHash = this._currentHash;

            this._currentPath = window.location.pathname;
            this._currentHash = window.location.hash;

            this._notifyListeners('navigation', {
                type, oldPath, newPath: this._currentPath, oldHash, newHash: this._currentHash, data
            });
        },

        guard: function(callback) {
            this.addListener((event, data) => {
                if (event === 'navigation') callback(data);
            });
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getCurrentPath: function() { return this._currentPath; },
        getCurrentHash: function() { return this._currentHash; },
        getStatus: function() {
            return {
                currentPath: this._currentPath,
                currentHash: this._currentHash,
                navigationInProgress: this._navigationInProgress,
                hasPendingNavigation: !!this._pendingNavigation,
                blockActive: callsState.callActive
            };
        }
    };

    NavigationGuard.initialize();

    // ==================== LIFECYCLE CONTROLLER ====================
    const LifecycleController = {
        _initializationPromise: null,
        _initializationLock: false,
        _pipelineCompleted: false,
        _pipelineStage: null,
        _pipelineStartTime: 0,
        _pipelineResults: {},
        _listeners: new Set(),
        _handshakeCompleted: false,
        _sessionAcquired: false,
        _pipelineAttempts: 0,
        _maxPipelineAttempts: 1,

        initialize: function() {
            logReady(MODULE, 'LifecycleController initialized');
            return this;
        },

        runDeterministicPipeline: async function() {
            if (this._initializationPromise) {
                return this._initializationPromise;
            }

            if (this._initializationLock) {
                logWarn(MODULE, 'Pipeline already running, waiting');
                return new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (this._pipelineCompleted || !this._initializationLock) {
                            clearInterval(checkInterval);
                            resolve(this._pipelineResults);
                        }
                    }, 100);
                });
            }

            this._pipelineAttempts++;
            if (this._pipelineAttempts > this._maxPipelineAttempts) {
                logWarn(MODULE, 'Max pipeline attempts reached, completing');
                this._pipelineResults = { success: true, degraded: true };
                this._pipelineCompleted = true;
                return this._pipelineResults;
            }

            this._initializationLock = true;
            this._pipelineStartTime = Date.now();
            this._pipelineResults = {};

            this._initializationPromise = this._executePipeline();

            return this._initializationPromise;
        },

        _executePipeline: async function() {
            try {
                logInfo(MODULE, 'Starting deterministic pipeline');

                StateGovernor.enableTransitions();

                const pipelineResult = await SessionPipeline.run();
                
                this._pipelineResults = pipelineResult;
                this._pipelineCompleted = true;
                this._initializationLock = false;

                if (pipelineResult.success) {
                    logSuccess(MODULE, `Deterministic pipeline completed in ${pipelineResult.duration || 0}ms`, { degraded: pipelineResult.degraded });

                    window.dispatchEvent(new CustomEvent('core.ready', {
                        detail: {
                            timestamp: Date.now(),
                            version: CONFIG.VERSION,
                            environment: ENVIRONMENT.current,
                            duration: pipelineResult.duration || 0,
                            degraded: pipelineResult.degraded || false
                        }
                    }));

                    return pipelineResult;
                } else {
                    throw new Error(pipelineResult.error || 'Pipeline failed');
                }

            } catch (error) {
                logError(MODULE, 'Pipeline execution failed', error);
                this._initializationLock = false;
                StateGovernor._currentState = STATE.ERROR_FATAL;
                RecoveryManager.scheduleRecovery();

                this._pipelineResults.success = false;
                this._pipelineResults.error = error.message;
                return this._pipelineResults;
            } finally {
                StateGovernor.disableTransitions();
            }
        },

        getPipelineStatus: function() {
            return {
                stage: this._pipelineStage,
                completed: this._pipelineCompleted,
                locked: this._initializationLock,
                startTime: this._pipelineStartTime,
                duration: this._pipelineStartTime ? Date.now() - this._pipelineStartTime : 0,
                results: this._pipelineResults
            };
        },

        reset: function() {
            this._initializationPromise = null;
            this._initializationLock = false;
            this._pipelineCompleted = false;
            this._pipelineStage = null;
            this._pipelineStartTime = 0;
            this._pipelineResults = {};
            this._handshakeCompleted = false;
            this._sessionAcquired = false;
            this._pipelineAttempts = 0;
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        }
    };

    LifecycleController.initialize();

    // ==================== SESSION PIPELINE ====================
    const SessionPipeline = {
        _stages: [
            'preflight',
            'dependencyCheck',
            'parentDetection',
            'handshake',
            'sessionSync',
            'serviceInit',
            'ready'
        ],
        _currentStage: null,
        _stageResults: {},
        _stageAttempts: {},
        _maxAttempts: 1,
        _pipelineInProgress: false,
        _pipelineCompleted: false,
        _pipelineDegraded: false,
        _pipelineStartTime: 0,
        _pipelineEndTime: 0,
        _listeners: new Set(),

        initialize: function() {
            this._reset();
            logReady(MODULE, 'SessionPipeline initialized');
            return this;
        },

        _reset: function() {
            this._currentStage = null;
            this._stageResults = {};
            this._stageAttempts = {};
            this._pipelineInProgress = false;
            this._pipelineCompleted = false;
            this._pipelineDegraded = false;
        },

        run: async function() {
            if (this._pipelineInProgress) {
                logPipeline(MODULE, 'pipeline', 'already in progress');
                return this._waitForCompletion();
            }

            if (this._pipelineCompleted) {
                logPipeline(MODULE, 'pipeline', 'already completed', { degraded: this._pipelineDegraded });
                return { success: true, completed: true, degraded: this._pipelineDegraded };
            }

            this._pipelineInProgress = true;
            this._pipelineStartTime = Date.now();
            this._pipelineDegraded = false;

            logPipeline(MODULE, 'pipeline', 'start');

            for (const stage of this._stages) {
                this._currentStage = stage;
                this._stageAttempts[stage] = 0;
                
                logPipeline(MODULE, stage, 'start');
                
                const stageResult = await this._executeStageWithRetry(stage);
                this._stageResults[stage] = stageResult;
                
                if (stageResult.success) {
                    logPipeline(MODULE, stage, 'success', { attempt: stageResult.attempt });
                } else {
                    logPipeline(MODULE, stage, 'fail', { attempt: stageResult.attempt, error: stageResult.error });
                    
                    const criticalStages = ['preflight', 'dependencyCheck'];
                    
                    if (criticalStages.includes(stage)) {
                        logPipeline(MODULE, 'pipeline', 'critical failure', { stage });
                        this._pipelineInProgress = false;
                        return { success: false, stage, error: stageResult.error };
                    }
                    
                    this._pipelineDegraded = true;
                    
                    if (stage === 'sessionSync') {
                        logPipeline(MODULE, 'pipeline', 'continuing in degraded mode', { stage });
                    } else {
                        logPipeline(MODULE, 'pipeline', 'continuing despite failure', { stage });
                    }
                }
            }

            this._pipelineCompleted = true;
            this._pipelineInProgress = false;
            this._pipelineEndTime = Date.now();

            const duration = this._pipelineEndTime - this._pipelineStartTime;
            
            logPipeline(MODULE, 'pipeline', 'complete', { 
                degraded: this._pipelineDegraded,
                duration: duration + 'ms'
            });

            return { 
                success: true, 
                degraded: this._pipelineDegraded,
                duration,
                stages: this._stageResults
            };
        },

        _executeStageWithRetry: async function(stage) {
            this._stageAttempts[stage] = 1;
            
            try {
                let result;
                
                switch (stage) {
                    case 'preflight':
                        result = await this._runPreflight();
                        break;
                    case 'dependencyCheck':
                        result = await this._runDependencyCheck();
                        break;
                    case 'parentDetection':
                        result = await this._runParentDetection();
                        break;
                    case 'handshake':
                        result = await this._runHandshake();
                        break;
                    case 'sessionSync':
                        result = await this._runSessionSync();
                        break;
                    case 'serviceInit':
                        result = await this._runServiceInit();
                        break;
                    case 'ready':
                        result = { success: true, ready: true };
                        break;
                    default:
                        result = { success: false, error: 'Unknown stage' };
                }
                
                if (result.success) {
                    return { success: true, attempt: 1, result };
                }
                
                return { success: false, attempt: 1, error: result.error || 'Stage failed' };
                
            } catch (error) {
                logError(MODULE, `Stage ${stage} error`, error);
                return { success: false, attempt: 1, error: error.message };
            }
        },

        _runPreflight: async function() {
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve, { once: true });
                });
            }
            
            const capabilities = {
                postMessage: typeof window.postMessage === 'function',
                addEventListener: typeof window.addEventListener === 'function',
                Promise: typeof Promise !== 'undefined'
            };
            
            const missing = Object.entries(capabilities)
                .filter(([_, available]) => !available)
                .map(([name]) => name);
            
            if (missing.length > 0) {
                logWarn(MODULE, 'Preflight: missing capabilities', { missing });
                return { success: false, error: `Missing: ${missing.join(', ')}` };
            }
            
            return { success: true, capabilities, readyState: document.readyState };
        },

        _runDependencyCheck: async function() {
            const dependencies = {
                window: typeof window !== 'undefined',
                document: typeof document !== 'undefined',
                navigator: typeof navigator !== 'undefined',
                mediaDevices: typeof navigator.mediaDevices !== 'undefined'
            };
            
            const missing = Object.entries(dependencies)
                .filter(([_, available]) => !available)
                .map(([name]) => name);
            
            if (missing.length > 0) {
                return { success: false, error: `Missing dependencies: ${missing.join(', ')}` };
            }
            
            return { success: true, dependencies };
        },

        _runParentDetection: async function() {
            const parentDetected = !!(window.parent && window.parent !== window);
            let sameOrigin = false;
            let parentOrigin = null;
            
            if (parentDetected) {
                try {
                    parentOrigin = window.parent.location.origin;
                    sameOrigin = window.location.origin === parentOrigin;
                } catch (e) {
                    sameOrigin = false;
                }
            }
            
            logInfo(MODULE, 'Parent detection', { parentDetected, sameOrigin, parentOrigin });
            
            return { 
                success: true, 
                parentDetected, 
                sameOrigin, 
                parentOrigin 
            };
        },

        _runHandshake: async function() {
            try {
                // This will queue the message if parent not ready
                sendChildReady();
                
                return { success: true };
            } catch (error) {
                logError(MODULE, 'Handshake failed', error);
                return { success: true, degraded: true, error: error.message };
            }
        },

        _runSessionSync: async function() {
            if (IframeSessionClient && IframeSessionClient.isValid()) {
                logSession(MODULE, 'already valid');
                return { success: true, cached: true };
            }
            
            try {
                requestSession();
                
                const sessionResult = await StateGovernor.waitForSession(5000);
                
                if (sessionResult && sessionResult.success) {
                    logSession(MODULE, 'acquired');
                    return { success: true };
                }
            } catch (error) {
                logSession(MODULE, 'failed', error.message);
            }
            
            if (IframeSessionClient && IframeSessionClient.checkStorage()) {
                logSession(MODULE, 'using cached session');
                return { success: true, degraded: true, cached: true, error: 'Using cached session - no parent session' };
            }
            
            return { success: true, pending: true, error: 'Session sync failed - continuing with pending state' };
        },

        _runServiceInit: async function() {
            return { success: true };
        },

        _waitForCompletion: function() {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!this._pipelineInProgress) {
                        clearInterval(checkInterval);
                        resolve({ 
                            success: this._pipelineCompleted, 
                            degraded: this._pipelineDegraded,
                            stages: this._stageResults 
                        });
                    }
                }, 100);
                
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve({ 
                        success: this._pipelineCompleted, 
                        degraded: this._pipelineDegraded,
                        timeout: true 
                    });
                }, 30000);
            });
        },

        getStatus: function() {
            return {
                currentStage: this._currentStage,
                pipelineInProgress: this._pipelineInProgress,
                pipelineCompleted: this._pipelineCompleted,
                pipelineDegraded: this._pipelineDegraded,
                startTime: this._pipelineStartTime,
                endTime: this._pipelineEndTime,
                duration: this._pipelineEndTime ? this._pipelineEndTime - this._pipelineStartTime : 0,
                stages: this._stageResults,
                attempts: { ...this._stageAttempts }
            };
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        }
    };

    function logPipeline(module, stage, status, data = null) {
        const key = `${module}:pipeline:${stage}:${status}`;
        const icon = status === 'start' ? '🚀' : status === 'success' ? '✅' : status === 'fail' ? '❌' : '⏳';
        console.log(`[${module}] ${icon} Pipeline stage: ${stage} - ${status}`, data ? data : '');
    }

    SessionPipeline.initialize();

    // ==================== EVENT HANDLERS ====================
    function handleInitData(message) {
        const data = message.payload || message.data || {};
        
        logSuccess(MODULE, 'Received module init data', {
            hasSession: !!(data.session || data.user)
        });
        
        if (data.session) {
            callsState.session = data.session;
            if (data.session.token) callsState.token = data.session.token;
            callsState.sessionReceived = true;
            callsState.sessionStatus = 'valid';
        } else if (data.user) {
            callsState.session = {
                user: data.user,
                token: data.token,
                authenticated: data.authenticated !== false
            };
            if (data.token) callsState.token = data.token;
            if (data.user && data.token) {
                callsState.sessionReceived = true;
                callsState.sessionStatus = 'valid';
            }
        }
        
        if (data.isPremium !== undefined) {
            callsState.isPremium = data.isPremium;
        }
        
        if (data.premiumFeatures) {
            callsState.premiumFeatures = { ...callsState.premiumFeatures, ...data.premiumFeatures };
        }
        
        callsState.initialized = true;
        
        notifyListeners('module_ready', {
            session: callsState.session,
            isPremium: callsState.isPremium
        });
        
        logSuccess(MODULE, 'Module initialization complete');
    }

    function handleIncomingCall(callData) {
        callsState.callData = callData;
        callsState.callState = 'incoming';
        callsState.callActive = true;
        
        notifyListeners('incoming_call', callData);
    }

    function handleCallStarted(callData) {
        callsState.callData = callData;
        callsState.callState = 'outgoing';
        callsState.callActive = true;
        callsState.activeCallId = callData.callId;
        callsState.callParticipants = callData.participants || [];
        callsState.callStartTime = Date.now();
        callsState.callType = callData.callType;
        
        if (callsState.callInvitationTimer) {
            clearTimeout(callsState.callInvitationTimer);
            callsState.callInvitationTimer = null;
        }
        
        notifyListeners('call_started', callData);
    }

    function handleCallConnected(callData) {
        callsState.callState = 'active';
        
        notifyListeners('call_connected', callData);
    }

    function handleCallRejected(callData) {
        callsState.callState = 'idle';
        callsState.callActive = false;
        callsState.activeCallId = null;
        
        if (callsState.callInvitationTimer) {
            clearTimeout(callsState.callInvitationTimer);
            callsState.callInvitationTimer = null;
        }
        
        notifyListeners('call_rejected', callData);
        
        MediaManager.stopLocalStream();
        WebRTCManager.close();
    }

    function handleCallEnded(callData) {
        callsState.callState = 'idle';
        callsState.callActive = false;
        callsState.activeCallId = null;
        callsState.callParticipants = [];
        callsState.callStartTime = null;
        callsState.callType = null;
        
        if (callsState.callInvitationTimer) {
            clearTimeout(callsState.callInvitationTimer);
            callsState.callInvitationTimer = null;
        }
        
        notifyListeners('call_ended', callData);
        
        MediaManager.stopLocalStream();
        WebRTCManager.close();
    }

    function handleCallFailed(callData) {
        callsState.callState = 'idle';
        callsState.callActive = false;
        callsState.activeCallId = null;
        
        if (callsState.callInvitationTimer) {
            clearTimeout(callsState.callInvitationTimer);
            callsState.callInvitationTimer = null;
        }
        
        notifyListeners('call_failed', callData);
        
        MediaManager.stopLocalStream();
        WebRTCManager.close();
    }

    function handleRemoteStreamAdded(payload) {
        if (payload.stream) {
            callsState.remoteStream = payload.stream;
        }
        
        notifyListeners('remote_stream_added', payload);
    }

    function handleRemoteStreamRemoved(payload) {
        callsState.remoteStream = null;
        
        notifyListeners('remote_stream_removed', payload);
    }

    function handleSignalingMessage(type, payload) {
        switch (type) {
            case MESSAGE_TYPES.SIGNAL_OFFER:
                if (payload.offer) {
                    WebRTCManager.setRemoteDescription(payload.offer)
                        .then(() => WebRTCManager.createAnswer())
                        .then(answer => {
                            IframeTransport.sendAction('SIGNAL_ANSWER', {
                                answer: answer,
                                callId: payload.callId
                            }).catch(() => {});
                        })
                        .catch(error => {
                            logError(MODULE, 'Failed to handle offer', error);
                        });
                }
                break;
                
            case MESSAGE_TYPES.SIGNAL_ANSWER:
                if (payload.answer) {
                    WebRTCManager.setRemoteDescription(payload.answer)
                        .catch(error => {
                            logError(MODULE, 'Failed to handle answer', error);
                        });
                }
                break;
                
            case MESSAGE_TYPES.ICE_CANDIDATE:
                if (payload.candidate) {
                    WebRTCManager.addIceCandidate(payload.candidate)
                        .catch(error => {
                            logError(MODULE, 'Failed to add ICE candidate', error);
                        });
                }
                break;
        }
    }

    // ==================== NOTIFICATION SYSTEM ====================
    const listeners = new Set();

    function notifyListeners(event, data) {
        listeners.forEach(listener => {
            try { listener(event, data); } catch (e) {}
        });
    }

    // ==================== UI BRIDGE ====================
    const UIBridge = {
        _initialized: false,
        _eventListeners: new Map(),
        _elements: new Map(),

        initialize: function() {
            if (this._initialized) return this;

            document.addEventListener('DOMContentLoaded', () => {
                this._setupEventListeners();
            });

            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                setTimeout(() => this._setupEventListeners(), 100);
            }

            this._initialized = true;
            logReady(MODULE, 'UIBridge initialized');
            return this;
        },

        _setupEventListeners: function() {
            this._attachCallButtons();
            this._attachMediaControls();
            this._attachMoodControls();
            this._attachChatInputs();
        },

        _attachCallButtons: function() {
            const callButtons = document.querySelectorAll('[data-action="start-call"], .start-call-btn, #startCallBtn');
            callButtons.forEach(button => {
                const callType = button.dataset.callType || button.getAttribute('data-call-type') || 'voice';
                const targetUserId = button.dataset.targetUserId || button.getAttribute('data-target-user-id');

                const handler = (e) => {
                    e.preventDefault();
                    if (!callsState.session || callsState.sessionStatus !== 'valid') {
                        notifyListeners('session_required', { action: 'start-call' });
                        return;
                    }
                    window.callCore.startCall(targetUserId, callType).catch(error => {
                        logError(MODULE, 'Call initiation failed', error);
                        notifyListeners('call_error', { error: error.message });
                    });
                };

                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });
        },

        _attachMediaControls: function() {
            const micButtons = document.querySelectorAll('[data-action="toggle-mic"], .toggle-mic-btn, #toggleMicBtn');
            micButtons.forEach(button => {
                const handler = (e) => {
                    e.preventDefault();
                    window.callCore.toggleMic();
                };
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });

            const cameraButtons = document.querySelectorAll('[data-action="toggle-camera"], .toggle-camera-btn, #toggleCameraBtn');
            cameraButtons.forEach(button => {
                const handler = (e) => {
                    e.preventDefault();
                    window.callCore.toggleCamera();
                };
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });

            const switchCameraButtons = document.querySelectorAll('[data-action="switch-camera"], .switch-camera-btn, #switchCameraBtn');
            switchCameraButtons.forEach(button => {
                const handler = (e) => {
                    e.preventDefault();
                    window.callCore.switchCamera();
                };
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });

            const screenShareButtons = document.querySelectorAll('[data-action="screen-share"], .screen-share-btn, #screenShareBtn');
            screenShareButtons.forEach(button => {
                const handler = (e) => {
                    e.preventDefault();
                    if (callsState.screenSharing) {
                        window.callCore.stopScreenShare();
                    } else {
                        window.callCore.startScreenShare();
                    }
                };
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });
        },

        _attachMoodControls: function() {
            const moodButtons = document.querySelectorAll('[data-action="set-mood"], .set-mood-btn');
            moodButtons.forEach(button => {
                const mood = button.dataset.mood || button.getAttribute('data-mood');
                if (!mood) return;

                const handler = (e) => {
                    e.preventDefault();
                    window.callCore.setMood(mood);
                };
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });

            const intentionButtons = document.querySelectorAll('[data-action="set-intention"], .set-intention-btn');
            intentionButtons.forEach(button => {
                const intention = button.dataset.intention || button.getAttribute('data-intention');
                if (!intention) return;

                const handler = (e) => {
                    e.preventDefault();
                    window.callCore.setIntention(intention);
                };
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });

            const focusModeButtons = document.querySelectorAll('[data-action="toggle-focus"], .toggle-focus-btn, #toggleFocusBtn');
            focusModeButtons.forEach(button => {
                const handler = (e) => {
                    e.preventDefault();
                    window.callCore.toggleFocusMode();
                };
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });

            const reactionButtons = document.querySelectorAll('[data-action="send-reaction"], .send-reaction-btn');
            reactionButtons.forEach(button => {
                const reaction = button.dataset.reaction || button.getAttribute('data-reaction');
                if (!reaction) return;

                const handler = (e) => {
                    e.preventDefault();
                    window.callCore.sendReaction(reaction);
                };
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });
        },

        _attachChatInputs: function() {
            const chatInputs = document.querySelectorAll('[data-action="send-message"], .chat-input, #chatInput');
            chatInputs.forEach(input => {
                const handler = (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const message = input.value.trim();
                        if (message) {
                            window.callCore.sendChatMessage(message);
                            input.value = '';
                        }
                    }
                };
                input.removeEventListener('keydown', handler);
                input.addEventListener('keydown', handler);
                this._eventListeners.set(input, { type: 'keydown', handler });
            });

            const sendButtons = document.querySelectorAll('[data-action="send-chat"], .send-chat-btn, #sendChatBtn');
            sendButtons.forEach(button => {
                const handler = (e) => {
                    e.preventDefault();
                    const input = document.querySelector('[data-action="send-message"], .chat-input, #chatInput');
                    if (input) {
                        const message = input.value.trim();
                        if (message) {
                            window.callCore.sendChatMessage(message);
                            input.value = '';
                        }
                    }
                };
                button.removeEventListener('click', handler);
                button.addEventListener('click', handler);
                this._eventListeners.set(button, { type: 'click', handler });
            });
        },

        cleanup: function() {
            this._eventListeners.forEach((listener, element) => {
                element.removeEventListener(listener.type, listener.handler);
            });
            this._eventListeners.clear();
            this._elements.clear();
        },

        getStatus: function() {
            return {
                initialized: this._initialized,
                eventListeners: this._eventListeners.size
            };
        }
    };

    UIBridge.initialize();

    // ==================== INITIALIZATION SEQUENCE ====================
    function initializeModule() {
        setState('INITIALIZING');
        
        logInfo(MODULE_NAME, 'Initializing module');
        
        // Perform any synchronous initialization
        setState('READY');
        logSuccess(MODULE_NAME, 'READY');
        
        // Send CHILD_READY (will be queued if parent not ready)
        sendChildReady();
    }

    // Parent ready promise
    let parentReadyResolve;
    const parentReadyPromise = new Promise(resolve => {
        parentReadyResolve = resolve;
    });

    // ==================== MESSAGE HANDLER ====================
    window.addEventListener('message', (event) => {
        // PERFORMANCE FIX: Move heavy logic out of message listener
        setTimeout(() => {
            try {
                if (!isValidOrigin(event.origin)) {
                    logWarn(MODULE_NAME, 'Invalid origin', { origin: event.origin });
                    return;
                }

                const msg = event.data;

                if (!msg || typeof msg !== 'object') return;
                
                // Special handling for HANDSHAKE_RETRY - just log and ignore
                if (msg.type === 'HANDSHAKE_RETRY') {
                    logInfo(MODULE_NAME, 'Received HANDSHAKE_RETRY - ignoring');
                    return;
                }

                if (!validateMessage(msg)) {
                    logWarn(MODULE_NAME, 'Invalid message format', msg);
                    return;
                }

                if (msg.messageId && isDuplicate(msg.messageId)) {
                    logInfo(MODULE_NAME, 'Duplicate message ignored', { messageId: msg.messageId });
                    return;
                }

                if (msg.source && msg.source !== 'parent') {
                    return;
                }

                // Handle PARENT_READY
                if (msg.type === MESSAGE_TYPES.PARENT_READY) {
                    logSuccess(MODULE_NAME, 'PARENT_READY received');
                    
                    // CRITICAL: Set parentReady flag
                    parentReady = true;
                    parentReadyReceived = true;
                    callsState.parentReady = true;
                    
                    // Resolve parent ready promise
                    if (parentReadyResolve) {
                        parentReadyResolve();
                    }
                    
                    // Update state to ACTIVE
                    setState('ACTIVE');
                    
                    // FLUSH QUEUE - Send all queued messages now
                    flushQueue();
                    
                    // Register module
                    registerModule();
                    
                    // Request session
                    setTimeout(() => {
                        requestSession();
                    }, 100);
                    
                    return;
                }
                
                // Handle HEARTBEAT
                if (msg.type === MESSAGE_TYPES.HEARTBEAT) {
                    logHeartbeat(MODULE_NAME, 'Heartbeat received');
                    sendHeartbeatAck(msg.messageId);
                    return;
                }
                
                // Handle MODULE_REGISTERED
                if (msg.type === 'MODULE_REGISTERED') {
                    logSuccess(MODULE_NAME, 'MODULE_REGISTERED received');
                    callsState.registered = true;
                    setState('ACTIVE');
                    
                    window.dispatchEvent(new CustomEvent('MODULE_READY', {
                        detail: { module: MODULE_NAME, timestamp: Date.now() }
                    }));
                    
                    return;
                }
                
                // Handle MODULE_INIT_DATA
                if (msg.type === MESSAGE_TYPES.MODULE_INIT_DATA) {
                    handleInitData(msg);
                    return;
                }
                
                // Handle session messages
                if (msg.type === MESSAGE_TYPES.SESSION_ACTIVE || 
                    msg.type === MESSAGE_TYPES.SESSION_DATA ||
                    msg.type === MESSAGE_TYPES.SESSION_SYNC) {
                    
                    const sessionData = msg.payload || msg.data || {};
                    if (sessionData.token) {
                        callsState.session = sessionData;
                        callsState.token = sessionData.token;
                        callsState.sessionReceived = true;
                        callsState.sessionStatus = 'valid';
                        logSession(MODULE_NAME, 'Session received');
                        
                        window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {
                            detail: { core: window.callCore, timestamp: Date.now() }
                        }));
                    }
                    
                    return;
                }
                
                if (msg.type === MESSAGE_TYPES.SESSION_NULL) {
                    callsState.session = null;
                    callsState.token = null;
                    callsState.sessionReceived = false;
                    callsState.sessionStatus = 'invalid';
                    logSession(MODULE_NAME, 'SESSION_NULL received');
                    return;
                }

                if (msg.type === MESSAGE_TYPES.CALL_INCOMING) {
                    handleIncomingCall(msg.payload || msg.data);
                    return;
                }

                if (msg.type === MESSAGE_TYPES.CALL_STARTED) {
                    handleCallStarted(msg.payload || msg.data);
                    return;
                }

                if (msg.type === MESSAGE_TYPES.CALL_CONNECTED) {
                    handleCallConnected(msg.payload || msg.data);
                    return;
                }

                if (msg.type === MESSAGE_TYPES.CALL_REJECTED) {
                    handleCallRejected(msg.payload || msg.data);
                    return;
                }

                if (msg.type === MESSAGE_TYPES.CALL_ENDED) {
                    handleCallEnded(msg.payload || msg.data);
                    return;
                }

                if (msg.type === MESSAGE_TYPES.CALL_FAILED) {
                    handleCallFailed(msg.payload || msg.data);
                    return;
                }

                if (msg.type === MESSAGE_TYPES.REMOTE_STREAM_ADDED) {
                    handleRemoteStreamAdded(msg.payload || msg.data);
                    return;
                }

                if (msg.type === MESSAGE_TYPES.REMOTE_STREAM_REMOVED) {
                    handleRemoteStreamRemoved(msg.payload || msg.data);
                    return;
                }

                if (msg.type === MESSAGE_TYPES.SIGNAL_OFFER ||
                    msg.type === MESSAGE_TYPES.SIGNAL_ANSWER ||
                    msg.type === MESSAGE_TYPES.ICE_CANDIDATE) {
                    
                    handleSignalingMessage(msg.type, msg.payload || msg.data);
                    return;
                }

                if (msg.type === 'FRIEND_UPDATE' || msg.type === 'CONTACTS_UPDATE') {
                    notifyListeners('contacts_update', msg.payload || msg.data);
                    return;
                }

                if (msg.type === 'CALL_HISTORY_UPDATE') {
                    notifyListeners('call_history_update', msg.payload || msg.data);
                    return;
                }

                if (msg.type === 'SETTINGS_UPDATED') {
                    const data = msg.payload || msg.data;
                    if (data) {
                        if (data.premium !== undefined) {
                            callsState.isPremium = data.premium;
                        }
                        if (data.premiumFeatures) {
                            callsState.premiumFeatures = { ...callsState.premiumFeatures, ...data.premiumFeatures };
                        }
                        notifyListeners('settings_update', data);
                    }
                    return;
                }

                if (msg.type === 'USER_LOGGED_OUT') {
                    callsState.session = null;
                    callsState.token = null;
                    callsState.verified = false;
                    callsState.sessionReceived = false;
                    callsState.sessionStatus = 'invalid';
                    notifyListeners('logout', {});
                    return;
                }

                if (msg.type === 'SESSION_REFRESHED') {
                    const data = msg.payload || msg.data;
                    if (data && data.token) {
                        callsState.token = data.token;
                        if (callsState.session) {
                            callsState.session.token = data.token;
                        }
                    }
                    return;
                }

                if (msg.type === 'NEW_MESSAGE') {
                    notifyListeners('new_message', msg.payload || msg.data);
                    return;
                }

                if (msg.type === 'STATUS_UPDATE') {
                    notifyListeners('status_update', msg.payload || msg.data);
                    return;
                }

                if (msg.type === 'GROUP_UPDATE') {
                    notifyListeners('group_update', msg.payload || msg.data);
                    return;
                }

            } catch (error) {
                logError(MODULE_NAME, 'Error handling message', error);
            }
        }, 0);
    });

    // ==================== PUBLIC API ====================
    window.callCore = {
        moduleName: MODULE_NAME,
        version: CONFIG.VERSION,
        
        getLifecycleState: function() {
            return state;
        },
        
        isCoreReady: function() {
            return state === 'ACTIVE' &&
                   callsState.registered && 
                   callsState.sessionReceived && 
                   callsState.sessionStatus === 'valid' &&
                   callsState.parentReady;
        },
        
        getState: function() {
            return {
                lifecycleState: state,
                registered: callsState.registered,
                initialized: callsState.initialized,
                parentReady: callsState.parentReady,
                coreReady: this.isCoreReady(),
                callState: callsState.callState,
                callActive: callsState.callActive,
                micEnabled: callsState.micEnabled,
                cameraEnabled: callsState.cameraEnabled,
                cameraFacingMode: callsState.cameraFacingMode,
                screenSharing: callsState.screenSharing,
                hasLocalStream: !!callsState.localStream,
                hasRemoteStream: !!callsState.remoteStream,
                deviceInitialized: MediaManager._deviceCheckDone,
                isPremium: callsState.isPremium,
                currentMood: callsState.currentMood,
                currentIntention: callsState.currentIntention,
                currentFocusMode: callsState.currentFocusMode,
                callParticipants: callsState.callParticipants,
                callStartTime: callsState.callStartTime,
                callDuration: callsState.callStartTime ? Math.floor((Date.now() - callsState.callStartTime) / 1000) : 0,
                callType: callsState.callType,
                sessionReceived: callsState.sessionReceived,
                sessionStatus: callsState.sessionStatus,
                degraded: callsState.degraded,
                governorState: CallsStateGovernor.getState(),
                webRTC: WebRTCManager.getStatus(),
                childReadySent: callsState.childReadySent,
                registrationSent: callsState.registrationSent,
                parentReady: parentReady,
                queuedMessages: messageQueue.length
            };
        },
        
        getCallsState: function() {
            return { ...callsState };
        },
        
        getSession: function() {
            return callsState.session ? { ...callsState.session } : null;
        },
        
        getSessionStatus: function() {
            return callsState.sessionStatus;
        },
        
        isAuthenticated: function() {
            return callsState.sessionStatus === 'valid' && 
                   !!(callsState.session && callsState.session.authenticated);
        },
        
        checkPermissions: function(required) {
            return PermissionManager.checkPermissions(required);
        },
        
        requestPermissions: function(required) {
            return PermissionManager.requestPermissions(required);
        },
        
        startCall: function(targetUserId, callType = 'voice', options = {}) {
            // Use safeSend which will queue if parent not ready
            return IframeTransport.sendAction('START_CALL', {
                targetUserId,
                callType,
                ...options,
                timestamp: Date.now()
            });
        },
        
        startGroupCall: function(participants = [], callType = 'voice', options = {}) {
            if (!callsState.isPremium && !callsState.premiumFeatures.groupCalls) {
                notifyListeners('premium_required', { feature: 'groupCalls' });
                return { success: false, reason: 'premium_required' };
            }
            
            return IframeTransport.sendAction('START_GROUP_CALL', {
                participants,
                callType,
                ...options,
                timestamp: Date.now()
            });
        },
        
        answerCall: function(callId) {
            return IframeTransport.sendAction('ANSWER_CALL', {
                callId,
                timestamp: Date.now()
            });
        },
        
        declineCall: function(callId) {
            return IframeTransport.sendAction('DECLINE_CALL', {
                callId,
                timestamp: Date.now()
            });
        },
        
        endCall: function(callId) {
            const result = IframeTransport.sendAction('END_CALL', {
                callId: callId || callsState.activeCallId,
                timestamp: Date.now()
            });
            
            MediaManager.stopLocalStream();
            WebRTCManager.close();
            
            return result;
        },
        
        toggleMic: function() {
            const newState = !callsState.micEnabled;
            const result = MediaManager.toggleMic(newState);
            
            if (result) {
                IframeTransport.sendAction('TOGGLE_MIC', {
                    enabled: newState,
                    timestamp: Date.now()
                });
            }
            
            return result;
        },
        
        toggleCamera: function() {
            const newState = !callsState.cameraEnabled;
            const result = MediaManager.toggleCamera(newState);
            
            if (result) {
                IframeTransport.sendAction('TOGGLE_CAMERA', {
                    enabled: newState,
                    timestamp: Date.now()
                });
            }
            
            return result;
        },
        
        switchCamera: function() {
            return MediaManager.switchCamera().then(result => {
                if (result.success) {
                    IframeTransport.sendAction('SWITCH_CAMERA', {
                        facingMode: result.facingMode,
                        timestamp: Date.now()
                    });
                }
                return result;
            });
        },
        
        startScreenShare: function() {
            if (!callsState.isPremium && !callsState.premiumFeatures.screenSharing) {
                notifyListeners('premium_required', { feature: 'screenSharing' });
                return Promise.resolve({ success: false, reason: 'premium_required' });
            }
            
            return MediaManager.startScreenShare().then(result => {
                if (result.success) {
                    IframeTransport.sendAction('START_SCREEN_SHARE', {
                        timestamp: Date.now()
                    });
                }
                return result;
            });
        },
        
        stopScreenShare: function() {
            MediaManager.stopScreenShare();
            IframeTransport.sendAction('STOP_SCREEN_SHARE', {
                timestamp: Date.now()
            });
        },
        
        getLocalStream: function(constraints) {
            return MediaManager.getLocalStream(constraints);
        },
        
        stopLocalStream: function() {
            MediaManager.stopLocalStream();
        },
        
        enumerateDevices: function() {
            return MediaManager.enumerateDevices();
        },
        
        getWebRTCManager: function() {
            return WebRTCManager;
        },
        
        sendDataChannelMessage: function(data) {
            return WebRTCManager.sendData(data);
        },
        
        setMood: function(mood) {
            callsState.currentMood = mood;
            IframeTransport.sendAction('SET_MOOD', {
                mood,
                timestamp: Date.now()
            });
            notifyListeners('mood_updated', { mood });
        },
        
        setIntention: function(intention) {
            callsState.currentIntention = intention;
            IframeTransport.sendAction('SET_INTENTION', {
                intention,
                timestamp: Date.now()
            });
            notifyListeners('intention_updated', { intention });
        },
        
        toggleFocusMode: function() {
            const newState = !callsState.currentFocusMode;
            callsState.currentFocusMode = newState;
            IframeTransport.sendAction('TOGGLE_FOCUS_MODE', {
                enabled: newState,
                timestamp: Date.now()
            });
            notifyListeners('focus_mode_toggled', { enabled: newState });
        },
        
        sendReaction: function(reaction) {
            IframeTransport.sendAction('SEND_REACTION', {
                reaction,
                timestamp: Date.now()
            });
        },
        
        sendChatMessage: function(message) {
            IframeTransport.sendAction('SEND_CHAT_MESSAGE', {
                message,
                timestamp: Date.now()
            });
        },
        
        saveNotes: function(notes) {
            IframeTransport.sendAction('SAVE_NOTES', {
                notes,
                timestamp: Date.now()
            });
        },
        
        startWhiteboard: function() {
            if (!callsState.isPremium && !callsState.premiumFeatures.whiteboard) {
                notifyListeners('premium_required', { feature: 'whiteboard' });
                return;
            }
            IframeTransport.sendAction('START_WHITEBOARD', {
                timestamp: Date.now()
            });
        },
        
        createPoll: function(question, options) {
            if (!callsState.isPremium && !callsState.premiumFeatures.polls) {
                notifyListeners('premium_required', { feature: 'polls' });
                return;
            }
            IframeTransport.sendAction('CREATE_POLL', {
                question,
                options,
                timestamp: Date.now()
            });
        },
        
        votePoll: function(pollId, optionId) {
            IframeTransport.sendAction('VOTE_POLL', {
                pollId,
                optionId,
                timestamp: Date.now()
            });
        },
        
        getDevices: function() {
            return { ...callsState.mediaDevices };
        },
        
        hasAudioInput: function() {
            return callsState.mediaDevices.audioInput.length > 0;
        },
        
        hasVideoInput: function() {
            return callsState.mediaDevices.videoInput.length > 0;
        },
        
        isPremium: function() {
            return callsState.isPremium;
        },
        
        hasPremiumFeature: function(feature) {
            return callsState.isPremium || callsState.premiumFeatures[feature];
        },
        
        createCallLink: function(callType = 'voice') {
            if (!callsState.isPremium && !callsState.premiumFeatures.callLinks) {
                notifyListeners('premium_required', { feature: 'callLinks' });
                return;
            }
            IframeTransport.sendAction('CREATE_CALL_LINK', {
                callType,
                timestamp: Date.now()
            });
        },
        
        addListener: function(listener) {
            if (typeof listener === 'function') listeners.add(listener);
        },
        
        removeListener: function(listener) {
            listeners.delete(listener);
        },
        
        addMediaListener: function(listener) {
            MediaManager.addListener(listener);
        },
        
        removeMediaListener: function(listener) {
            MediaManager.removeListener(listener);
        },
        
        addWebRTCListener: function(listener) {
            WebRTCManager.addListener(listener);
        },
        
        removeWebRTCListener: function(listener) {
            WebRTCManager.removeListener(listener);
        },
        
        setRecoveryMode: function(mode) {
            callsState.recoveryMode = mode;
        },
        
        verifyBeforeCall: function() {
            return CallsStateGovernor.verifySession(true);
        },
        
        getPipelineStatus: function() {
            return SessionPipeline ? SessionPipeline.getStatus() : null;
        },
        
        getDiagnostics: function() {
            return DiagnosticsAgent.getReport();
        },
        
        StateGovernor: StateGovernor,
        V5StateGovernor: V5StateGovernor,
        CallsStateGovernor: CallsStateGovernor,
        
        sendToParent: function(type, payload, options) {
            return safeSend(type, payload, options?.requireAck || false);
        },
        
        sendAction: function(action, payload) {
            return IframeTransport.sendAction(action, payload);
        },
        
        initCall: function(callType, participants) {
            return CallsStateGovernor.initiateCall(callType, participants);
        },
        
        cleanup: function() {
            logInfo(MODULE_NAME, 'Cleaning up call core');
            
            MediaManager.stopLocalStream();
            WebRTCManager.close();
            IframeTransport.cleanup();
            IframeSessionClient.cleanup();
            RecoveryManager.cancelRecovery();
            UIBridge.cleanup();
            
            // Clear queue
            messageQueue.length = 0;
            
            callsState.callState = 'idle';
            callsState.callActive = false;
            callsState.activeCallId = null;
            callsState.callParticipants = [];
            callsState.callStartTime = null;
            callsState.callType = null;
            callsState.remoteStream = null;
            callsState.remoteStreams.clear();
            
            listeners.clear();
        },
        
        reinitialize: function() {
            this.cleanup();
            initialize();
        },
        
        isReady: function() {
            return this.isCoreReady();
        },
        
        waitForReady: function(timeout = 5000) {
            return new Promise((resolve) => {
                if (this.isReady()) {
                    resolve(true);
                    return;
                }
                
                const start = Date.now();
                const checkInterval = setInterval(() => {
                    if (this.isReady()) {
                        clearInterval(checkInterval);
                        resolve(true);
                    } else if (Date.now() - start > timeout) {
                        clearInterval(checkInterval);
                        resolve(false);
                    }
                }, 100);
            });
        },
        
        getParentReady: function() {
            return parentReady;
        },
        
        getQueuedMessages: function() {
            return [...messageQueue];
        },
        
        flushQueue: function() {
            flushQueue();
        },
        
        MessageRegistry: MessageRegistry,
        IframeTransport: IframeTransport,
        OriginSecurity: OriginSecurity,
        SafeStorage: SafeStorage,
        PermissionManager: PermissionManager,
        WebRTCManager: WebRTCManager,
        MediaManager: MediaManager,
        CallsStateGovernor: CallsStateGovernor,
        SessionClient: IframeSessionClient,
        NavigationGuard: NavigationGuard,
        ReliabilityEngine: ReliabilityEngine,
        RecoveryManager: RecoveryManager,
        CompatibilityBridge: CompatibilityBridge,
        DiagnosticsAgent: DiagnosticsAgent,
        MultiModuleCoordinator: MultiModuleCoordinator,
        UIFailsafe: UIFailsafe,
        LifecycleController: LifecycleController,
        SessionPipeline: SessionPipeline,
        UIBridge: UIBridge
    };

    // ==================== MODULE CORE CONTROLLER ====================
    const ModuleCoreController = {
        _startTime: Date.now(),
        _initializationPromise: null,
        _initialized: false,
        _listeners: new Set(),

        start: function() {
            if (this._initializationPromise) return this._initializationPromise;

            this._initializationPromise = this._executeInitializationSequence();
            return this._initializationPromise;
        },

        _executeInitializationSequence: async function() {
            try {
                logInfo(MODULE, 'ModuleCoreController starting initialization sequence');

                OriginSecurity.initialize();
                this._notifyListeners('security_initialized', {});

                IframeTransport.initialize();
                this._notifyListeners('connection_initialized', {});

                MessageRegistry.initialize();
                this._notifyListeners('dispatcher_initialized', {});

                ReliabilityEngine.initialize();
                this._notifyListeners('reliability_initialized', {});

                IframeSessionClient.initialize();
                this._notifyListeners('session_initialized', {});

                UIBridge.initialize();
                this._notifyListeners('ui_initialized', {});

                LifecycleController.initialize();
                this._notifyListeners('lifecycle_initialized', {});

                // Send CHILD_READY - will be queued if parent not ready
                sendChildReady();
                this._notifyListeners('child_ready_sent', {});

                logInfo(MODULE, 'CHILD_READY sent, waiting for parent');

                this._initialized = true;
                logSuccess(MODULE, 'ModuleCoreController initialization complete');

                return { success: true };

            } catch (error) {
                logError(MODULE, 'ModuleCoreController initialization failed', error);
                throw error;
            }
        },

        addListener: function(listener) {
            if (typeof listener === 'function') this._listeners.add(listener);
        },

        removeListener: function(listener) {
            this._listeners.delete(listener);
        },

        _notifyListeners: function(event, data) {
            this._listeners.forEach(listener => {
                try { listener(event, data); } catch (e) {}
            });
        },

        getStatus: function() {
            return {
                startTime: this._startTime,
                uptime: Date.now() - this._startTime,
                initialized: this._initialized
            };
        }
    };

    ModuleCoreController.start();

    // ==================== INITIALIZATION ====================
    function initialize() {
        logInfo(MODULE, 'Initializing call core module');
        
        MediaManager.initialize().catch(error => {
            logError(MODULE, 'Media manager initialization failed', error);
        });
        
        logSuccess(MODULE, 'Call core module initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initializeModule());
    } else {
        initializeModule();
    }

    window.addEventListener('beforeunload', () => {
        if (window.callCore) window.callCore.cleanup();
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.callCore;
    }

    logSuccess(MODULE, 'Call core module loaded');

})();