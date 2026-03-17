// =============================================
// MESSAGES CORE - v7.5.11 (PARENT AUTHORITY ARCHITECTURE)
// UI-ONLY MODULE | STANDARDIZED COMMUNICATION PROTOCOL
// STRICT LIFECYCLE ENFORCEMENT | NO TIMEOUTS | NO FALLBACKS
// FIXED: Session request - parent expects 'id' field, not 'messageId'
// =============================================
(function() {
    'use strict';

    // =============================================
    // MODULE IDENTIFICATION - MUST MATCH PARENT EXPECTATIONS
    // =============================================
    const MODULE_NAME = 'messages';
    const MODULE_VERSION = '7.5.11';
    
    // =============================================
    // DEBUG MODE - ZERO NOISE POLICY
    // =============================================
    const DEBUG = false;
    const ALLOWED_LOGS = new Set(['INIT', 'READY', 'ERROR', 'STATE_CHANGE', 'HANDSHAKE']);
    
    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }

    // =============================================
    // LIFECYCLE STATE MACHINE - STRICT PARENT AUTHORITY
    // =============================================
    const LIFECYCLE_STATES = {
        BOOTING: 'BOOTING',                 // Module initializing
        INITIALIZING: 'INITIALIZING',       // Internal initialization
        READY: 'READY',                      // Internal ready, waiting to notify parent
        WAITING_FOR_PARENT: 'WAITING_FOR_PARENT', // CHILD_READY sent, waiting for PARENT_READY
        ACTIVE: 'ACTIVE'                      // Normal operation
    };

    let currentState = LIFECYCLE_STATES.BOOTING;
    let childReadySent = false;
    let parentReadyReceived = false;
    let stateHistory = [];
    const maxHistorySize = 50;
    const stateListeners = new Set();
    const processedMessageIds = new Set();

    // Parent ready promise - NO TIMEOUTS, just wait forever
    let parentReadyResolver;
    const parentReadyPromise = new Promise((resolve) => {
        parentReadyResolver = resolve;
    });

    function setState(nextState, reason = '') {
        if (currentState === nextState) return true;

        const validTransitions = {
            [LIFECYCLE_STATES.BOOTING]: [LIFECYCLE_STATES.INITIALIZING],
            [LIFECYCLE_STATES.INITIALIZING]: [LIFECYCLE_STATES.READY],
            [LIFECYCLE_STATES.READY]: [LIFECYCLE_STATES.WAITING_FOR_PARENT],
            [LIFECYCLE_STATES.WAITING_FOR_PARENT]: [LIFECYCLE_STATES.ACTIVE],
            [LIFECYCLE_STATES.ACTIVE]: []
        };

        const allowed = validTransitions[currentState] || [];
        if (!allowed.includes(nextState)) {
            console.warn(`[${MODULE_NAME}][Lifecycle] Invalid transition: ${currentState} → ${nextState}`);
            return false;
        }

        const fromState = currentState;
        currentState = nextState;
        
        stateHistory.push({
            from: fromState,
            to: nextState,
            timestamp: Date.now(),
            reason
        });
        
        if (stateHistory.length > maxHistorySize) {
            stateHistory.shift();
        }

        notifyStateListeners(nextState, fromState, reason);
        
        console.log(`[${MODULE_NAME}][Lifecycle] ${fromState} → ${nextState}${reason ? ` (${reason})` : ''}`);
        
        return true;
    }

    function notifyStateListeners(toState, fromState, reason) {
        stateListeners.forEach(listener => {
            try {
                listener(toState, fromState, reason);
            } catch (e) {}
        });
        
        window.dispatchEvent(new CustomEvent('messagesLifecycleChange', {
            detail: { state: toState, previous: fromState, reason }
        }));
    }

    function isDuplicateMessage(messageId) {
        if (!messageId) return false;
        if (processedMessageIds.has(messageId)) return true;
        processedMessageIds.add(messageId);
        
        // Clean up old IDs periodically (kept for memory management, not logic)
        if (processedMessageIds.size > 1000) {
            processedMessageIds.clear();
        }
        return false;
    }

    function getLifecycleState() {
        return {
            state: currentState,
            childReadySent,
            parentReadyReceived,
            history: stateHistory.slice(-10)
        };
    }

    function canSendUserMessages() {
        return currentState === LIFECYCLE_STATES.ACTIVE;
    }

    function resetLifecycle() {
        currentState = LIFECYCLE_STATES.BOOTING;
        childReadySent = false;
        parentReadyReceived = false;
        stateHistory = [];
        processedMessageIds.clear();
        
        // Recreate promise
        parentReadyPromise = new Promise((resolve) => {
            parentReadyResolver = resolve;
        });
    }

    // =============================================
    // SECURITY CONSTANTS - STRICT ORIGIN VALIDATION
    // =============================================
    const SECURITY = {
        ALLOWED_ORIGINS: new Set([
            window.location.origin,
            'http://localhost',
            'http://127.0.0.1',
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com',
            'null'
        ]),
        
        // Essential system messages allowed during handshake
        ESSENTIAL_TYPES: new Set([
            'PARENT_READY',
            'MODULE_REGISTERED',
            'SESSION_SYNC',
            'SESSION_DATA',
            'HEARTBEAT',
            'ACK',
            'ERROR'
        ]),
        
        // Messages that require ACK
        REQUIRES_ACK: new Set([
            'REGISTER_MODULE',
            'SEND_MESSAGE',
            'FETCH_MESSAGES',
            'FETCH_CONVERSATIONS',
            'DELETE_MESSAGE',
            'EDIT_MESSAGE',
            'ADD_REACTION',
            'CREATE_CONVERSATION',
            'BLOCK_USER',
            'REPORT_MESSAGE',
            'FORWARD_MESSAGE'
        ]),
        
        // User action messages (only allowed in ACTIVE state)
        USER_ACTIONS: new Set([
            'SEND_MESSAGE',
            'FETCH_MESSAGES',
            'FETCH_CONVERSATIONS',
            'OPEN_CONVERSATION',
            'START_TYPING',
            'STOP_TYPING',
            'MARK_AS_READ',
            'DELETE_MESSAGE',
            'EDIT_MESSAGE',
            'ADD_REACTION',
            'CREATE_CONVERSATION',
            'ARCHIVE_CONVERSATION',
            'BLOCK_USER',
            'REPORT_MESSAGE',
            'FORWARD_MESSAGE',
            'SEARCH_MESSAGES',
            'GET_FRIEND_LIST',
            'CREATE_CHAT',
            'GET_CHAT_HISTORY'
        ]),
        
        lockdown: true,
        
        validateOrigin: function(origin) {
            if (!origin || origin === 'null') return true;
            return this.ALLOWED_ORIGINS.has(origin) || 
                   origin === window.location.origin ||
                   origin.startsWith('http://localhost:') ||
                   origin.startsWith('http://127.0.0.1:');
        },
        
        isEssentialMessage: function(type) {
            return this.ESSENTIAL_TYPES.has(type);
        },
        
        requiresAck: function(type) {
            return this.REQUIRES_ACK.has(type);
        },
        
        isUserAction: function(type) {
            return this.USER_ACTIONS.has(type);
        },
        
        canSendMessage: function(type, lifecycleState) {
            // Essential messages always allowed
            if (this.isEssentialMessage(type)) return true;
            
            // User actions only allowed in ACTIVE
            if (this.isUserAction(type)) {
                return lifecycleState === LIFECYCLE_STATES.ACTIVE;
            }
            
            // Registration messages only allowed in specific states
            if (type === 'REGISTER_MODULE') {
                return lifecycleState === LIFECYCLE_STATES.INITIALIZING || 
                       lifecycleState === LIFECYCLE_STATES.READY;
            }
            
            if (type === 'CHILD_READY') {
                return lifecycleState === LIFECYCLE_STATES.READY;
            }
            
            // Default: only allowed in ACTIVE
            return lifecycleState === LIFECYCLE_STATES.ACTIVE;
        },
        
        getSecurityReport: function() {
            return {
                allowedOrigins: Array.from(this.ALLOWED_ORIGINS),
                lockdown: this.lockdown
            };
        }
    };

    // =============================================
    // ENVIRONMENT DETECTION
    // =============================================
    const ENV = {
        isLocal: window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1',
        isRender: window.location.hostname.includes('.onrender.com'),
        parentOrigin: document.referrer ? new URL(document.referrer).origin : '*'
    };

    // Add parent origin to allowed origins
    if (ENV.parentOrigin !== '*' && ENV.parentOrigin) {
        SECURITY.ALLOWED_ORIGINS.add(ENV.parentOrigin);
    }

    // =============================================
    // TIMING CONSTANTS - FOR REFERENCE ONLY, NO TIMEOUTS USED
    // =============================================
    const TIMING = {
        // No timeouts are used in the actual logic - these are for reference
        ACK_TIMEOUT: 5000,               // Reference only - actual waiting is infinite
        CLEANUP_INTERVAL: 60000,          // 1 minute cleanup - for memory management only
        MAX_QUEUE_SIZE: 500,
        MAX_MESSAGE_RETRIES: 3,
        TYPING_TIMEOUT: 3000,             // UI typing timeout - kept for UX
        TYPING_RATE_LIMIT: 2000,           // UI rate limiting - kept for UX
        MESSAGE_BURST_WINDOW: 1000,
        MAX_MESSAGES_PER_SECOND: 50
    };

    // =============================================
    // PROTOCOL TYPES
    // =============================================
    const PROTOCOL_TYPES = {
        V2: 'V2',
        V1: 'V1',
        HYBRID: 'HYBRID'
    };

    // =============================================
    // MESSAGE TYPES - COMPLETE LIST (PRESERVED)
    // =============================================
    const INCOMING_TYPES = {
        MODULE_REGISTERED: 'MODULE_REGISTERED',
        MODULE_INIT_DATA: 'MODULE_INIT_DATA',
        PARENT_READY: 'PARENT_READY',
        ACK: 'ACK',
        SESSION_ACTIVE: 'SESSION_ACTIVE',
        SESSION_NULL: 'SESSION_NULL',
        SESSION_REFRESHED: 'SESSION_REFRESHED',
        SESSION_INVALIDATED: 'SESSION_INVALIDATED',
        SESSION_VERIFIED: 'SESSION_VERIFIED',
        coreReady: 'coreReady',
        SESSION_RESPONSE: 'SESSION_RESPONSE',
        SESSION_SYNC: 'SESSION_SYNC',
        SESSION_DATA: 'SESSION_DATA',
        NEW_MESSAGE: 'NEW_MESSAGE',
        MESSAGES_LOADED: 'MESSAGES_LOADED',
        MESSAGE_SENT: 'MESSAGE_SENT',
        MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
        MESSAGE_READ: 'MESSAGE_READ',
        MESSAGE_STATUS_UPDATED: 'MESSAGE_STATUS_UPDATED',
        TYPING_INDICATOR: 'TYPING_INDICATOR',
        TYPING_START: 'TYPING_START',
        TYPING_STOP: 'TYPING_STOP',
        CONVERSATIONS_UPDATED: 'CONVERSATIONS_UPDATED',
        CHAT_HISTORY_RESPONSE: 'CHAT_HISTORY_RESPONSE',
        FRIEND_LIST_RESPONSE: 'FRIEND_LIST_RESPONSE',
        FRIEND_UPDATE: 'FRIEND_UPDATE',
        FRIEND_ONLINE: 'FRIEND_ONLINE',
        FRIEND_OFFLINE: 'FRIEND_OFFLINE',
        GROUP_UPDATE: 'GROUP_UPDATE',
        STATUS_UPDATE: 'STATUS_UPDATE',
        SETTINGS_UPDATED: 'SETTINGS_UPDATED',
        INCOMING_CALL: 'INCOMING_CALL',
        WS_CONNECTED: 'WS_CONNECTED',
        WS_AUTHENTICATED: 'WS_AUTHENTICATED',
        WS_DISCONNECTED: 'WS_DISCONNECTED',
        WS_ERROR: 'WS_ERROR',
        ERROR: 'ERROR',
        PING: 'PING',
        PONG: 'PONG',
        SYSTEM_READY: 'SYSTEM_READY',
        PARENT_RECOVERY: 'PARENT_RECOVERY',
        PERMISSION_UPDATE: 'PERMISSION_UPDATE',
        FORCE_LOGOUT: 'FORCE_LOGOUT',
        NAVIGATE: 'NAVIGATE',
        PAGE_ACTIVATED: 'PAGE_ACTIVATED',
        FORCE_RELOAD: 'FORCE_RELOAD',
        LOGOUT: 'LOGOUT',
        SYNC_COMPLETE: 'SYNC_COMPLETE',
        ACTION_RESPONSE: 'ACTION_RESPONSE',
        HEARTBEAT: 'HEARTBEAT',
        HEARTBEAT_ACK: 'HEARTBEAT_ACK',
        HANDSHAKE_RETRY: 'HANDSHAKE_RETRY',
        MODULE_DEGRADED: 'MODULE_DEGRADED',
        RETRY_LIMIT_REACHED: 'RETRY_LIMIT_REACHED',
        VERIFY_RESPONSE: 'VERIFY_RESPONSE',
        MODULE_HEARTBEAT: 'MODULE_HEARTBEAT',
        RECOVERY_REQUEST: 'RECOVERY_REQUEST'
    };

    // =============================================
    // OUTGOING ACTIONS (PRESERVED)
    // =============================================
    const OUTGOING_ACTIONS = {
        REGISTER_MODULE: 'REGISTER_MODULE',
        REQUEST_SESSION: 'REQUEST_SESSION',
        VERIFY_SESSION: 'VERIFY_SESSION',
        CHILD_READY: 'CHILD_READY',
        coreReady: 'coreReady',
        HEARTBEAT: 'HEARTBEAT',
        HEARTBEAT_ACK: 'HEARTBEAT_ACK',
        SEND_MESSAGE: 'SEND_MESSAGE',
        FETCH_MESSAGES: 'FETCH_MESSAGES',
        FETCH_CONVERSATIONS: 'FETCH_CONVERSATIONS',
        OPEN_CONVERSATION: 'OPEN_CONVERSATION',
        START_TYPING: 'START_TYPING',
        STOP_TYPING: 'STOP_TYPING',
        MARK_AS_READ: 'MARK_AS_READ',
        DELETE_MESSAGE: 'DELETE_MESSAGE',
        EDIT_MESSAGE: 'EDIT_MESSAGE',
        ADD_REACTION: 'ADD_REACTION',
        CREATE_CONVERSATION: 'CREATE_CONVERSATION',
        ARCHIVE_CONVERSATION: 'ARCHIVE_CONVERSATION',
        BLOCK_USER: 'BLOCK_USER',
        REPORT_MESSAGE: 'REPORT_MESSAGE',
        FORWARD_MESSAGE: 'FORWARD_MESSAGE',
        SEARCH_MESSAGES: 'SEARCH_MESSAGES',
        GET_FRIEND_LIST: 'GET_FRIEND_LIST',
        CREATE_CHAT: 'CREATE_CHAT',
        GET_CHAT_HISTORY: 'GET_CHAT_HISTORY',
        API_REQUEST: 'API_REQUEST',
        ACK: 'ACK',
        PONG: 'PONG',
        MODULE_HEARTBEAT: 'MODULE_HEARTBEAT'
    };

    // =============================================
    // LOCAL STORAGE KEYS (PRESERVED)
    // =============================================
    const LOCAL_STORAGE_KEYS = {
        SESSION_CACHE: 'kynecta_session_cache_v7',
        USER_CACHE: 'kynecta_user_cache_v7',
        FRIENDS_CACHE: 'kynecta_friends_cache_v7',
        CHATS_CACHE: 'kynecta_chats_cache_v7',
        MESSAGES_PREFIX: 'kynecta_messages_v7_',
        CONTACTS_CACHE: 'kynecta_contacts_cache_v7',
        CHAT_THEMES: 'kynecta_chat_themes_v7',
        DRAFTS: 'kynecta_message_drafts_v7',
        OFFLINE_QUEUE: 'kynecta_offline_queue_v7',
        SCHEDULED_MESSAGES: 'kynecta_scheduled_messages_v7',
        USER_SETTINGS: 'kynecta_user_settings_v7',
        BLOCKED_USERS: 'kynecta_blocked_users_v7',
        ARCHIVED_CHATS: 'kynecta_archived_chats_v7',
        STARRED_MESSAGES: 'kynecta_starred_messages_v7',
        UI_STATE: 'kynecta_ui_state_v7',
        MESSAGE_QUEUE: 'kynecta_message_queue_v7',
        CHAT_STATE: 'kynecta_chat_state_v7'
    };

    // =============================================
    // SECURITY UTILITIES - STRICT VALIDATION
    // =============================================
    const SecurityUtils = {
        messageIdCounter: 0,

        validateOrigin: function(origin) {
            return SECURITY.validateOrigin(origin);
        },

        generateMessageId: function() {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 10);
            const counter = (this.messageIdCounter++ % 1000).toString(36);
            return `msg_${timestamp}_${random}_${counter}`;
        },

        generateRequestId: function() {
            return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}_${Math.floor(Math.random() * 1000)}`;
        },

        generateUUID: function() {
            if (window.crypto && window.crypto.randomUUID) {
                return window.crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        validateMessageStructure: function(data) {
            if (!data || typeof data !== 'object') return false;
            if (!data.type || typeof data.type !== 'string') return false;
            return true;
        },

        validateMessageSchema: function(message) {
            // Outgoing messages must have required fields (STANDARDIZED SCHEMA)
            const required = ['type', 'source', 'target', 'messageId', 'timestamp'];
            for (const field of required) {
                if (!message[field]) return false;
            }
            
            if (message.source !== MODULE_NAME) return false;
            if (message.target !== 'parent') return false;
            
            return true;
        },

        sanitizeString: function(str) {
            if (!str || typeof str !== 'string') return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/javascript:/gi, '')
                .replace(/onload/gi, 'data-onload')
                .replace(/onerror/gi, 'data-onerror');
        },

        sanitizePayload: function(payload) {
            if (!payload || typeof payload !== 'object') return {};
            
            const sanitized = {};
            for (const [key, value] of Object.entries(payload)) {
                const safeKey = String(key).replace(/[^\w\-\.]/g, '');
                
                if (typeof value === 'string') {
                    sanitized[safeKey] = this.sanitizeString(value);
                } else if (typeof value === 'number' || typeof value === 'boolean') {
                    sanitized[safeKey] = value;
                } else if (value === null || value === undefined) {
                    sanitized[safeKey] = null;
                } else if (Array.isArray(value)) {
                    sanitized[safeKey] = value.map(item => 
                        typeof item === 'string' ? this.sanitizeString(item) : 
                        typeof item === 'object' ? this.sanitizePayload(item) : item
                    );
                } else if (typeof value === 'object') {
                    sanitized[safeKey] = this.sanitizePayload(value);
                } else {
                    sanitized[safeKey] = String(value);
                }
            }
            return sanitized;
        },

        escapeHtml: function(text) {
            if (!text || typeof text !== 'string') return '';
            return String(text).replace(/[&<>"'`=\/]/g, char => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
                '/': '&#x2F;',
                '`': '&#x60;',
                '=': '&#x3D;'
            })[char] || char);
        },

        escapeRegex: function(string) {
            if (!string || typeof string !== 'string') return '';
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        },

        isForThisFrame: function(message) {
            const targetFrame = message.target || message.frameId;
            return !targetFrame || targetFrame === 'iframe' || targetFrame === 'messagesIframe';
        },

        validateMessageFormat: function(message) {
            return !!(message && 
                     typeof message === 'object' && 
                     message.id && 
                     message.action && 
                     message.source && 
                     message.target && 
                     message.timestamp);
        }
    };

    // =============================================
    // MESSAGE ID CACHE - DEDUPLICATION
    // =============================================
    const MessageIdCache = {
        _cache: new Map(),
        _cleanupTimer: null,
        
        has: function(id) {
            return this._cache.has(id);
        },
        
        add: function(id) {
            this._cache.set(id, Date.now());
            this._scheduleCleanup();
        },
        
        _scheduleCleanup: function() {
            if (this._cleanupTimer) clearTimeout(this._cleanupTimer);
            this._cleanupTimer = setTimeout(() => {
                this.cleanup();
                this._cleanupTimer = null;
            }, 60000);
        },
        
        cleanup: function() {
            const now = Date.now();
            for (const [id, timestamp] of this._cache.entries()) {
                if (now - timestamp > 30000) {
                    this._cache.delete(id);
                }
            }
        }
    };

    // =============================================
    // LOGGER - REDUCED NOISE (PRESERVED)
    // =============================================
    const Logger = {
        _warned: new Map(),
        _logged: new Set(),
        _errors: new Map(),
        _success: new Set(),
        _logCache: new Set(),
        _stateLog: new Map(),
        
        _logOnce: function(key, message, data = null, level = 'log') {
            if (this._logCache.has(key)) return;
            this._logCache.add(key);
            
            setTimeout(() => {
                this._logCache.delete(key);
            }, 60000);
            
            if (level === 'log') {
                console.log(`[${MODULE_NAME}] ${message}`, data || '');
            } else if (level === 'warn') {
                console.warn(`[${MODULE_NAME}] ⚠️ ${message}`, data || '');
            } else if (level === 'error') {
                console.error(`[${MODULE_NAME}] ❌ ${message}`, data || '');
            } else if (level === 'success') {
                console.log(`[${MODULE_NAME}] ✅ ${message}`, data || '');
            } else if (level === 'info') {
                console.info(`[${MODULE_NAME}] ℹ️ ${message}`, data || '');
            }
        },
        
        debug: function(module, message, data = null) {
            debugLog(`[${module}] ${message}`, data);
        },
        
        info: function(module, message, data = null) {
            if (ALLOWED_LOGS.has(message.split(' ')[0]) || ALLOWED_LOGS.has(message)) {
                this._logOnce(`${module}:info:${message}`, `[${module}] ℹ️ ${message}`, data, 'info');
            } else {
                debugLog(`[${module}] ℹ️ ${message}`, data);
            }
        },
        
        success: function(module, message, data = null) {
            const key = `${module}:success:${message}`;
            if (!this._success.has(key)) {
                this._logOnce(key, `[${module}] ✅ ${message}`, data, 'success');
                this._success.add(key);
                setTimeout(() => this._success.delete(key), 5000);
            }
        },
        
        warn: function(module, message, data = null) {
            const key = `${module}:warn:${message}`;
            const now = Date.now();
            const lastWarn = this._warned.get(key) || 0;
            
            if (now - lastWarn > 60000) {
                this._logOnce(key, `[${module}] ⚠️ ${message}`, data, 'warn');
                this._warned.set(key, now);
            }
        },
        
        error: function(module, message, data = null) {
            const key = `${module}:error:${message}`;
            const now = Date.now();
            const lastLog = this._errors.get(key) || 0;
            
            if (now - lastLog > 30000) {
                this._logOnce(key, `[${module}] ❌ ${message}`, data, 'error');
                this._errors.set(key, now);
            }
        },
        
        state: function(module, oldState, newState, reason = '') {
            const arrow = oldState === newState ? '=' : '→';
            const key = `${module}:state:${oldState}:${newState}:${reason}`;
            this._logOnce(key, `[${module}] ${oldState} ${arrow} ${newState}${reason ? ` (${reason})` : ''}`, null, 'log');
            
            if (!this._stateLog.has(module)) {
                this._stateLog.set(module, []);
            }
            const history = this._stateLog.get(module);
            history.push({ oldState, newState, reason, timestamp: Date.now() });
            if (history.length > 50) history.shift();
        },
        
        once: function(module, message, data = null) {
            this._logOnce(`${module}:once:${message}`, `[${module}] ${message}`, data, 'info');
        },
        
        getStateHistory: function(module) {
            return this._stateLog.get(module) || [];
        }
    };

    // =============================================
    // SAFE STORAGE LAYER (PRESERVED)
    // =============================================
    const SafeStorage = {
        memoryStore: new Map(),
        storageAvailable: false,
        quotaExceeded: false,
        _initialized: false,
        _initPromise: null,
        
        init: function() {
            if (this._initialized) return this;
            
            this._initPromise = new Promise((resolve) => {
                this._checkStorage();
                this._initialized = true;
                resolve(this);
            });
            
            return this;
        },
        
        waitForInit: function() {
            return this._initPromise;
        },
        
        _checkStorage: function() {
            try {
                const testKey = '_kynecta_test_';
                localStorage.setItem(testKey, 'test');
                localStorage.removeItem(testKey);
                this.storageAvailable = true;
            } catch (e) {
                this.storageAvailable = false;
            }
        },
        
        get: function(key, fallback = null) {
            if (this.storageAvailable) {
                try {
                    const value = localStorage.getItem(key);
                    if (value !== null) return value;
                } catch (e) {}
            }
            return this.memoryStore.has(key) ? this.memoryStore.get(key) : fallback;
        },
        
        set: function(key, value) {
            this.memoryStore.set(key, value);
            if (this.storageAvailable) {
                try {
                    localStorage.setItem(key, String(value));
                } catch (e) {
                    if (e.name === 'QuotaExceededError') {
                        this.quotaExceeded = true;
                    }
                }
            }
            return true;
        },
        
        remove: function(key) {
            if (this.storageAvailable) {
                try { localStorage.removeItem(key); } catch (e) {}
            }
            this.memoryStore.delete(key);
        },
        
        getJSON: function(key, fallback = null) {
            const value = this.get(key);
            if (!value) return fallback;
            try {
                return JSON.parse(value);
            } catch (e) {
                return fallback;
            }
        },
        
        setJSON: function(key, value) {
            try {
                return this.set(key, JSON.stringify(value));
            } catch (e) {
                return false;
            }
        },
        
        clear: function() {
            if (this.storageAvailable) {
                try { localStorage.clear(); } catch (e) {}
            }
            this.memoryStore.clear();
        },
        
        isAvailable: function() {
            return this.storageAvailable;
        }
    }.init();

    // =============================================
    // SECURITY VALIDATOR - STRICT
    // =============================================
    const SecurityValidator = {
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            this._initialized = true;
            Logger.info('SecurityValidator', 'Initialized');
            return this;
        },
        
        validateIncomingMessage: function(event) {
            // Validate origin
            if (!SECURITY.validateOrigin(event.origin)) {
                return { valid: false, reason: 'invalid_origin' };
            }
            
            // Validate message structure
            if (!SecurityUtils.validateMessageStructure(event.data)) {
                return { valid: false, reason: 'invalid_structure' };
            }
            
            const data = event.data;
            
            // Validate source - must be parent
            if (data.source && data.source !== 'parent') {
                return { valid: false, reason: 'invalid_source' };
            }
            
            // Validate target - must be this module or all
            if (data.target && data.target !== MODULE_NAME && data.target !== 'all' && data.target !== '*') {
                return { valid: false, reason: 'wrong_target' };
            }
            
            // Check for duplicate message ID
            if (data.messageId && isDuplicateMessage(data.messageId)) {
                return { valid: false, reason: 'duplicate_message' };
            }
            
            return { valid: true, data };
        },
        
        validateOutgoingMessage: function(message, lifecycleState) {
            // Check if this message type is allowed in current state
            if (!SECURITY.canSendMessage(message.type, lifecycleState)) {
                return { 
                    valid: false, 
                    reason: `message_not_allowed_in_state:${lifecycleState}` 
                };
            }
            
            // Validate schema
            if (!SecurityUtils.validateMessageSchema(message)) {
                return { valid: false, reason: 'invalid_schema' };
            }
            
            return { valid: true };
        }
    }.init();

    // =============================================
    // MESSAGE TRACKER (PRESERVED - NO TIMEOUTS)
    // =============================================
    const MessageTracker = {
        _processedMessageIds: new Set(),
        _pendingRequestIds: new Map(),
        _maxProcessedSize: 1000,
        _retryCounts: new Map(),
        
        isProcessed(messageId) {
            return this._processedMessageIds.has(messageId);
        },
        
        markProcessed(messageId) {
            this._processedMessageIds.add(messageId);
            this._cleanupProcessed();
        },
        
        registerPending(requestId, type, resolve, reject) {
            const retryCount = this.getRetryCount(requestId);
            if (retryCount >= TIMING.MAX_MESSAGE_RETRIES) {
                reject(new Error('Retry limit exceeded'));
                return requestId;
            }
            
            if (this._pendingRequestIds.has(requestId)) {
                const old = this._pendingRequestIds.get(requestId);
                old.reject(new Error('Superseded by new request'));
                this.incrementRetryCount(requestId);
            } else {
                this.initRetryCount(requestId);
            }
            
            // NO TIMEOUT - wait indefinitely for parent response
            this._pendingRequestIds.set(requestId, {
                resolve,
                reject,
                type,
                timestamp: Date.now()
            });
            
            return requestId;
        },
        
        handleAck(ackMessage) {
            const { messageId, requestId } = ackMessage;
            const ackId = requestId || messageId;
            
            if (ackId && this._pendingRequestIds.has(ackId)) {
                const pending = this._pendingRequestIds.get(ackId);
                pending.resolve(ackMessage.payload || { success: true });
                this._pendingRequestIds.delete(ackId);
                this.resetRetryCount(ackId);
                this.markProcessed(ackId);
                return true;
            }
            return false;
        },
        
        resolvePending(requestId, result) {
            const pending = this._pendingRequestIds.get(requestId);
            if (pending) {
                pending.resolve(result);
                this._pendingRequestIds.delete(requestId);
                this.resetRetryCount(requestId);
                this.markProcessed(requestId);
                return true;
            }
            return false;
        },
        
        rejectPending(requestId, error) {
            const pending = this._pendingRequestIds.get(requestId);
            if (pending) {
                pending.reject(error);
                this._pendingRequestIds.delete(requestId);
                this.incrementRetryCount(requestId);
                this.markProcessed(requestId);
                return true;
            }
            return false;
        },
        
        initRetryCount(requestId) {
            this._retryCounts.set(requestId, 0);
        },
        
        incrementRetryCount(requestId) {
            const count = this._retryCounts.get(requestId) || 0;
            this._retryCounts.set(requestId, count + 1);
            return count + 1;
        },
        
        getRetryCount(requestId) {
            return this._retryCounts.get(requestId) || 0;
        },
        
        resetRetryCount(requestId) {
            this._retryCounts.delete(requestId);
        },
        
        _cleanupProcessed() {
            if (this._processedMessageIds.size > this._maxProcessedSize) {
                const toRemove = Array.from(this._processedMessageIds).slice(0, 200);
                toRemove.forEach(id => this._processedMessageIds.delete(id));
            }
        },
        
        // NO STALE CLEANUP - wait forever for parent
        reset() {
            this._processedMessageIds.clear();
            for (const [_, pending] of this._pendingRequestIds) {
                pending.reject(new Error('Reset'));
            }
            this._pendingRequestIds.clear();
            this._retryCounts.clear();
        }
    };

    // =============================================
    // ACK CONTROLLER - STRICT ACK ONLY WHEN REQUIRED
    // =============================================
    const AckController = {
        _pendingAcks: new Map(),
        _processedIds: new Set(),
        _maxRetries: TIMING.MAX_MESSAGE_RETRIES,
        _maxPending: 1000,
        _initialized: false,
        _pendingMessages: [],
        _rateLimitCount: 0,
        _rateLimitReset: Date.now(),
        
        init: function() {
            if (this._initialized) return this;
            
            const self = this;
            
            const messageHandler = function(event) {
                if (!SECURITY.validateOrigin(event.origin)) {
                    return;
                }
                
                const data = event.data;
                if (!data || typeof data !== 'object') return;
                
                // Only handle ACK messages
                if (data.type === 'ACK') {
                    const requestId = data.requestId || data.messageId;
                    if (requestId) {
                        self.handleAck(requestId, data.payload);
                    }
                }
            };
            
            window.addEventListener('message', messageHandler, true);
            
            this._initialized = true;
            
            // Rate limit reset - kept for UX, not for logic
            setInterval(() => {
                this._rateLimitCount = 0;
                this._rateLimitReset = Date.now();
            }, TIMING.MESSAGE_BURST_WINDOW);
            
            return this;
        },
        
        checkRateLimit: function() {
            const now = Date.now();
            if (now - this._rateLimitReset > TIMING.MESSAGE_BURST_WINDOW) {
                this._rateLimitCount = 0;
                this._rateLimitReset = now;
            }
            
            if (this._rateLimitCount >= TIMING.MAX_MESSAGES_PER_SECOND) {
                return false;
            }
            
            this._rateLimitCount++;
            return true;
        },
        
        register: function(requestId, message, sendFn, options = {}) {
            // Rate limiting
            if (!this.checkRateLimit()) {
                return { success: false, rateLimited: true, requestId };
            }
            
            if (this._processedIds.has(requestId)) {
                return { success: false, duplicate: true };
            }
            
            if (this._pendingAcks.size >= this._maxPending) {
                this._cleanupOldest();
            }
            
            // Only register if ACK is required
            if (!message.expectAck) {
                // Send immediately without tracking
                try {
                    sendFn();
                } catch (error) {
                    return { success: false, error: error.message };
                }
                return { success: true, requestId, tracked: false };
            }
            
            const maxRetries = Math.min(options.maxRetries ?? this._maxRetries, this._maxRetries);
            
            const record = {
                requestId,
                message,
                sendFn,
                attempts: 0,
                maxRetries,
                startTime: Date.now(),
                lastAttempt: Date.now(),
                status: 'pending',
                resolve: options.resolve,
                reject: options.reject
            };
            
            this._sendWithRetry(record);
            this._pendingAcks.set(requestId, record);
            
            return { success: true, requestId, tracked: true };
        },
        
        _sendWithRetry: function(record) {
            if (record.attempts >= record.maxRetries) {
                this._handleFailure(record, 'Max retries exceeded');
                return;
            }
            
            record.attempts++;
            record.lastAttempt = Date.now();
            record.status = 'sending';
            
            try {
                record.sendFn();
                // NO TIMEOUT - wait indefinitely for ACK
                // Parent will respond when ready
            } catch (error) {
                this._handleFailure(record, error.message);
            }
        },
        
        _handleFailure: function(record, reason) {
            record.status = 'failed';
            record.failureReason = reason;
            
            this._pendingAcks.delete(record.requestId);
            this._processedIds.add(record.requestId);
            
            const messageType = record.message?.type || 'unknown';
            if (messageType === 'REGISTER_MODULE') {
                console.warn(`[${MODULE_NAME}] ⚠️ ${messageType} failed after ${record.maxRetries} retries - waiting for parent`);
                // Just wait - don't retry
            } else {
                if (DEBUG) console.log(`[${MODULE_NAME}] Message ${record.requestId} failed: ${reason}`);
            }
            
            window.dispatchEvent(new CustomEvent('messageFailed', {
                detail: { requestId: record.requestId, message: record.message, reason }
            }));
            
            if (record.reject) {
                record.reject(new Error(reason));
            }
        },
        
        handleAck: function(requestId, payload) {
            if (this._processedIds.has(requestId)) {
                return { success: false, duplicate: true };
            }
            
            const record = this._pendingAcks.get(requestId);
            if (!record) {
                this._processedIds.add(requestId);
                return { success: false, notFound: true };
            }
            
            record.status = 'acknowledged';
            record.ackTime = Date.now();
            
            this._pendingAcks.delete(requestId);
            this._processedIds.add(requestId);
            
            window.dispatchEvent(new CustomEvent('messageAcknowledged', {
                detail: { requestId, message: record.message, payload }
            }));
            
            if (record.resolve) {
                record.resolve(payload || { success: true });
            }
            
            return { success: true, record };
        },
        
        handleMessageAck: function(messageId, payload) {
            for (const [requestId, record] of this._pendingAcks.entries()) {
                if (record.message.messageId === messageId || record.message.id === messageId) {
                    return this.handleAck(requestId, payload);
                }
            }
            return { success: false, notFound: true };
        },
        
        _cleanupOldest: function() {
            const entries = Array.from(this._pendingAcks.entries());
            entries.sort((a, b) => a[1].startTime - b[1].startTime);
            
            const toRemove = entries.slice(0, Math.floor(this._pendingAcks.size * 0.2));
            toRemove.forEach(([id, record]) => {
                this._pendingAcks.delete(id);
                this._processedIds.add(id);
            });
        },
        
        cleanup: function() {
            // NO TIMEOUT CLEANUP - just size management
            if (this._processedIds.size > 10000) {
                const toRemove = Array.from(this._processedIds).slice(0, 2000);
                toRemove.forEach(id => this._processedIds.delete(id));
            }
        },
        
        getPendingCount: function() {
            return this._pendingAcks.size;
        },
        
        getStats: function() {
            return {
                pending: this._pendingAcks.size,
                processed: this._processedIds.size,
                oldest: this._pendingAcks.size ? 
                    Math.min(...Array.from(this._pendingAcks.values()).map(r => r.startTime)) : 0
            };
        }
    }.init();

    // =============================================
    // RELIABILITY LAYER - STRICT RETRY POLICY, NO TIMEOUTS
    // =============================================
    const ReliabilityLayer = {
        _pendingMessages: new Map(),
        _retryCounts: new Map(),
        _maxRetries: TIMING.MAX_MESSAGE_RETRIES,
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            this._initialized = true;
            Logger.info('ReliabilityLayer', 'Initialized');
            return this;
        },
        
        trackMessage: function(messageId, sendFn, options = {}) {
            const maxRetries = Math.min(options.maxRetries || this._maxRetries, this._maxRetries);
            
            if (this._pendingMessages.has(messageId)) {
                return false;
            }
            
            const retryCount = this._retryCounts.get(messageId) || 0;
            if (retryCount >= maxRetries) {
                Logger.error('ReliabilityLayer', `Message ${messageId} exceeded max retries`);
                return false;
            }
            
            const record = {
                messageId,
                sendFn,
                attempts: retryCount + 1,
                maxRetries,
                timestamp: Date.now()
                // NO TIMER - wait indefinitely
            };
            
            this._pendingMessages.set(messageId, record);
            this._retryCounts.set(messageId, retryCount + 1);
            
            return true;
        },
        
        acknowledgeMessage: function(messageId) {
            const record = this._pendingMessages.get(messageId);
            if (record) {
                this._pendingMessages.delete(messageId);
                this._retryCounts.delete(messageId);
                return true;
            }
            return false;
        },
        
        getPendingCount: function() {
            return this._pendingMessages.size;
        },
        
        reset: function() {
            this._pendingMessages.clear();
            this._retryCounts.clear();
        }
    }.init();

    // =============================================
    // PARENT CONNECTION MANAGER - STRICT PARENT AUTHORITY
    // =============================================
    const ParentConnectionManager = {
        _sequence: 0,
        _outboundQueue: [],
        _parentOrigin: '*',
        _maxQueueSize: TIMING.MAX_QUEUE_SIZE,
        _processingQueue: false,
        _frameId: null,
        _protocol: null,
        _handlers: new Map(),
        _messageCache: new Set(),
        _lastHeartbeatTime: 0,
        _sessionData: null,
        _initialized: false,
        // NO TIMERS
        
        init: function() {
            if (this._initialized) return this;
            
            this._setupMessageListener();
            this._initialized = true;
            
            // Periodic queue processing - kept for UX, not for logic
            setInterval(() => this._processQueue(), 5000);
            
            // Periodic cleanup - kept for memory management
            setInterval(() => AckController.cleanup(), TIMING.CLEANUP_INTERVAL);
            
            Logger.info('ParentConnectionManager', 'Initialized');
            return this;
        },
        
        _setupMessageListener: function() {
            window.addEventListener('message', (event) => {
                // Validate incoming message
                const validation = SecurityValidator.validateIncomingMessage(event);
                if (!validation.valid) {
                    if (DEBUG) console.log(`[${MODULE_NAME}] Rejected message:`, validation.reason);
                    return;
                }
                
                const data = validation.data;
                
                // Deduplicate by messageId
                if (data.messageId && MessageIdCache.has(data.messageId)) {
                    return;
                }
                if (data.messageId) {
                    MessageIdCache.add(data.messageId);
                }
                
                // Handle PARENT_READY - CRITICAL for activation
                if (data.type === INCOMING_TYPES.PARENT_READY || data.type === INCOMING_TYPES.coreReady) {
                    this._handleParentReady(data);
                }
                
                // Route to registered handlers
                if (this._handlers.has(data.type)) {
                    const handlers = this._handlers.get(data.type);
                    handlers.forEach(handler => {
                        try {
                            handler(data.payload || data, data);
                        } catch (e) {
                            Logger.error('ParentConnectionManager', `Handler error for ${data.type}`, e);
                        }
                    });
                }
                
                // Wildcard handlers
                if (this._handlers.has('*')) {
                    const handlers = this._handlers.get('*');
                    handlers.forEach(handler => {
                        try {
                            handler(data.payload || data, data);
                        } catch (e) {
                            Logger.error('ParentConnectionManager', `Wildcard handler error`, e);
                        }
                    });
                }
            }, true);
        },
        
        _handleParentReady: function(data) {
            Logger.success('ParentConnectionManager', 'PARENT_READY received');
            
            parentReadyReceived = true;
            
            // Resolve the parent ready promise to activate module
            if (parentReadyResolver) {
                parentReadyResolver();
                parentReadyResolver = null;
            }
            
            // If we're in WAITING_FOR_PARENT, transition to ACTIVE
            if (currentState === LIFECYCLE_STATES.WAITING_FOR_PARENT) {
                setState(LIFECYCLE_STATES.ACTIVE, 'parent_ready_received');
                
                // Now safe to initialize UI and start data flow
                initializeUISafe();
                startDataFlow();
                
                Logger.success('ParentConnectionManager', 'Module ACTIVE');
            }
        },
        
        sendRaw: function(message, requireAck = false) {
            return new Promise((resolve, reject) => {
                if (!window.parent || window.parent === window) {
                    reject(new Error('No parent window'));
                    return;
                }
                
                try {
                    // Set expectAck if required
                    if (requireAck) {
                        message.expectAck = true;
                    }
                    
                    window.parent.postMessage(message, '*');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        },
        
        send: function(type, payload = {}, options = {}) {
            // Validate if this message can be sent in current state
            const validation = SecurityValidator.validateOutgoingMessage(
                { type, source: MODULE_NAME, target: 'parent' },
                currentState
            );
            
            if (!validation.valid) {
                Logger.warn('ParentConnectionManager', `Cannot send ${type}: ${validation.reason}`);
                return { 
                    success: false, 
                    blocked: true, 
                    reason: validation.reason,
                    type
                };
            }
            
            const messageId = options.messageId || SecurityUtils.generateUUID();
            const requestId = options.requestId || messageId;
            const timestamp = Date.now();
            
            const message = {
                type: type,
                source: MODULE_NAME,
                target: 'parent',
                messageId: messageId,
                requestId: requestId,
                timestamp: timestamp,
                expectAck: options.requireAck || SECURITY.requiresAck(type),
                payload: SecurityUtils.sanitizePayload(payload || {})
            };
            
            // Add session info if available (but not required)
            if (SessionStore.isAuthenticated() && currentState === LIFECYCLE_STATES.ACTIVE) {
                message.session = {
                    authenticated: true,
                    userId: SessionStore.getUserId()
                };
            }
            
            const sendFn = () => this.sendRaw(message, message.expectAck);
            
            // If ACK required, register with AckController
            if (message.expectAck) {
                const ackResult = AckController.register(requestId, message, sendFn, {
                    maxRetries: options.maxRetries || TIMING.MAX_MESSAGE_RETRIES,
                    resolve: options.resolve,
                    reject: options.reject
                });
                
                if (ackResult.rateLimited) {
                    this._queueMessage(message);
                    return { success: false, queued: true, reason: 'rate_limited' };
                }
                
                if (ackResult.duplicate) {
                    return { success: false, duplicate: true, requestId };
                }
                
                // Track for reliability
                if (ackResult.tracked) {
                    ReliabilityLayer.trackMessage(requestId, sendFn, {
                        maxRetries: options.maxRetries || TIMING.MAX_MESSAGE_RETRIES
                    });
                }
            }
            
            // Send immediately
            try {
                sendFn().catch(error => {
                    // Just log, no fallback
                    Logger.warn('ParentConnectionManager', `Send failed: ${error.message}`);
                });
                
                if (!message.expectAck) {
                    return { success: true, messageId, requestId };
                }
                
                // Return promise-like object for ACK waiting
                return {
                    success: true,
                    messageId,
                    requestId,
                    then: (resolve, reject) => {
                        const waitForAck = (e) => {
                            if (e.detail.requestId === requestId) {
                                window.removeEventListener('messageAcknowledged', waitForAck);
                                window.removeEventListener('messageFailed', waitForFail);
                                resolve({ success: true, requestId, ack: e.detail.payload });
                            }
                        };
                        
                        const waitForFail = (e) => {
                            if (e.detail.requestId === requestId) {
                                window.removeEventListener('messageAcknowledged', waitForAck);
                                window.removeEventListener('messageFailed', waitForFail);
                                reject(new Error(e.detail.reason));
                            }
                        };
                        
                        window.addEventListener('messageAcknowledged', waitForAck);
                        window.addEventListener('messageFailed', waitForFail);
                        
                        // NO TIMEOUT - wait forever for parent
                    }
                };
            } catch (error) {
                if (message.expectAck) {
                    return { success: false, error: error.message, requestId };
                }
                // For non-ACK messages, queue
                this._queueMessage(message);
                return { success: false, queued: true, error: error.message };
            }
        },
        
        sendHeartbeatAck: function(inResponseTo) {
            const message = {
                type: OUTGOING_ACTIONS.HEARTBEAT_ACK,
                source: MODULE_NAME,
                target: 'parent',
                messageId: SecurityUtils.generateUUID(),
                inResponseTo: inResponseTo,
                timestamp: Date.now(),
                payload: {
                    timestamp: Date.now()
                }
            };
            
            this.sendRaw(message, false).catch(() => {});
        },
        
        // FIXED: sendWithResponse method - use 'id' field for parent compatibility
        sendWithResponse: function(type, payload = {}) {
            return new Promise((resolve, reject) => {
                // Create a complete message with all required fields matching parent's expected schema
                // Parent's consolidated handler in chat.html expects:
                // - id: the message ID (REQUIRED for parent to recognize)
                // - type: the message type
                // - source: should be the module name
                // - target: should be 'parent'
                // - payload: the actual data
                // - timestamp: timestamp
                // - requestId: also include for ACK matching
                
                const id = SecurityUtils.generateUUID(); // This will be used as both id and messageId
                const timestamp = Date.now();
                
                const message = {
                    id: id,                          // CRITICAL: Parent looks for 'id' field
                    type: type,
                    source: MODULE_NAME,
                    target: 'parent',
                    messageId: id,                    // Include for backward compatibility
                    requestId: id,                    // Include for ACK tracking
                    timestamp: timestamp,
                    expectAck: true,
                    payload: SecurityUtils.sanitizePayload(payload || {})
                };
                
                // Validate the message before sending
                const validation = SecurityValidator.validateOutgoingMessage(message, currentState);
                if (!validation.valid) {
                    reject(new Error(`Message validation failed: ${validation.reason}`));
                    return;
                }
                
                Logger.info('ParentConnectionManager', `Sending ${type} with response expectation`, { id });
                
                const sendFn = () => this.sendRaw(message, true);
                
                // Set up response handlers with a reasonable timeout
                const timeout = setTimeout(() => {
                    window.removeEventListener('messageAcknowledged', ackHandler);
                    window.removeEventListener('messageFailed', failHandler);
                    Logger.error('ParentConnectionManager', `Request timeout for ${type}`, { id });
                    reject(new Error(`Request timeout for ${type}`));
                }, 10000); // 10 second timeout for responses
                
                const ackHandler = (e) => {
                    // Check both id and requestId for matching
                    if (e.detail.requestId === id || 
                        e.detail.messageId === id ||
                        e.detail.id === id) {
                        
                        clearTimeout(timeout);
                        window.removeEventListener('messageAcknowledged', ackHandler);
                        window.removeEventListener('messageFailed', failHandler);
                        Logger.success('ParentConnectionManager', `Received ACK for ${type}`, { id });
                        resolve(e.detail.payload || { success: true });
                    }
                };
                
                const failHandler = (e) => {
                    if (e.detail.requestId === id || e.detail.messageId === id) {
                        clearTimeout(timeout);
                        window.removeEventListener('messageAcknowledged', ackHandler);
                        window.removeEventListener('messageFailed', failHandler);
                        Logger.error('ParentConnectionManager', `Request failed for ${type}: ${e.detail.reason}`, { id });
                        reject(new Error(e.detail.reason || 'Request failed'));
                    }
                };
                
                window.addEventListener('messageAcknowledged', ackHandler);
                window.addEventListener('messageFailed', failHandler);
                
                // Send the message
                sendFn().catch(error => {
                    clearTimeout(timeout);
                    window.removeEventListener('messageAcknowledged', ackHandler);
                    window.removeEventListener('messageFailed', failHandler);
                    Logger.error('ParentConnectionManager', `Send failed for ${type}`, error);
                    reject(error);
                });
            });
        },
        
        _queueMessage: function(message) {
            if (this._outboundQueue.length >= this._maxQueueSize) {
                this._outboundQueue.shift();
            }
            
            this._outboundQueue.push({
                message,
                timestamp: Date.now()
            });
        },
        
        async _processQueue() {
            if (this._processingQueue || this._outboundQueue.length === 0) return;
            if (!canSendUserMessages()) return;
            
            this._processingQueue = true;
            
            const now = Date.now();
            const oneHour = 3600000;
            
            const freshQueue = this._outboundQueue.filter(item => 
                now - item.timestamp < oneHour
            );
            
            for (const item of freshQueue) {
                try {
                    await this.sendRaw(item.message, item.message.expectAck);
                } catch (e) {}
            }
            
            this._outboundQueue = [];
            this._processingQueue = false;
        },
        
        on: function(type, handler) {
            if (!this._handlers.has(type)) {
                this._handlers.set(type, new Set());
            }
            this._handlers.get(type).add(handler);
            return () => this.off(type, handler);
        },
        
        off: function(type, handler) {
            if (this._handlers.has(type)) {
                this._handlers.get(type).delete(handler);
            }
        },
        
        getFrameId: function() {
            if (!this._frameId) {
                this._frameId = this._generateFrameId();
            }
            return this._frameId;
        },
        
        _generateFrameId: function() {
            const stored = SafeStorage.get('kyn_frame_id_v7');
            if (stored) return stored;
            
            const newId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_v7`;
            SafeStorage.set('kyn_frame_id_v7', newId);
            return newId;
        },
        
        notifyChildReady: function() {
            if (childReadySent) {
                Logger.warn('ParentConnectionManager', 'CHILD_READY already sent');
                return;
            }
            
            if (currentState !== LIFECYCLE_STATES.READY) {
                Logger.warn('ParentConnectionManager', `Cannot send CHILD_READY in state: ${currentState}`);
                return;
            }
            
            const id = SecurityUtils.generateUUID();
            
            const message = {
                id: id,                              // Parent expects 'id' field
                type: OUTGOING_ACTIONS.CHILD_READY,
                source: MODULE_NAME,
                target: 'parent',
                messageId: id,                        // For backward compatibility
                timestamp: Date.now(),
                payload: {
                    module: MODULE_NAME,
                    version: MODULE_VERSION,
                    frameId: this.getFrameId(),
                    ready: true
                }
            };
            
            this.sendRaw(message, false).then(() => {
                childReadySent = true;
                setState(LIFECYCLE_STATES.WAITING_FOR_PARENT, 'child_ready_sent');
                Logger.success('ParentConnectionManager', 'CHILD_READY sent');
            }).catch(error => {
                Logger.error('ParentConnectionManager', 'Failed to send CHILD_READY', error);
            });
        },
        
        isConnected: function() {
            return currentState === LIFECYCLE_STATES.ACTIVE;
        },
        
        getProtocol: function() {
            return this._protocol;
        },
        
        getStats: function() {
            return {
                sequence: this._sequence,
                queued: this._outboundQueue.length,
                pendingAcks: AckController.getPendingCount(),
                ackStats: AckController.getStats(),
                protocol: this._protocol,
                frameId: this._frameId
            };
        },
        
        reset: function() {
            this._outboundQueue = [];
            this._protocol = null;
            this._sessionData = null;
        },
        
        destroy: function() {
            this.reset();
            this._handlers.clear();
            this._messageCache.clear();
        }
    }.init();

    // =============================================
    // HEARTBEAT CLIENT - RESPOND ONLY, NEVER INITIATE
    // =============================================
    const HeartbeatClient = {
        _lastHeartbeat: 0,
        _lastResponse: 0,
        _missedBeats: 0,
        _active: false,
        _listeners: new Set(),
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            this._initialized = true;
            Logger.info('HeartbeatClient', 'Initialized (response only)');
            return this;
        },
        
        recordHeartbeat: function() {
            this._lastHeartbeat = Date.now();
        },
        
        recordResponse: function() {
            this._lastResponse = Date.now();
            this._missedBeats = 0;
        },
        
        recordMissed: function() {
            this._missedBeats++;
            
            if (this._missedBeats >= 3) {
                Logger.warn('HeartbeatClient', `Missed ${this._missedBeats} heartbeats`);
            }
        },
        
        onHeartbeat: function() {
            this.recordHeartbeat();
        },
        
        onHeartbeatAck: function() {
            this.recordResponse();
        },
        
        getStats: function() {
            return {
                active: this._active,
                lastHeartbeat: this._lastHeartbeat,
                lastResponse: this._lastResponse,
                missedBeats: this._missedBeats
            };
        },
        
        reset: function() {
            this._lastHeartbeat = 0;
            this._lastResponse = 0;
            this._missedBeats = 0;
        }
    }.init();

    // =============================================
    // SESSION STORE (PRESERVED)
    // =============================================
    const SessionStore = {
        _user: null,
        _userId: null,
        _token: null,
        _authenticated: false,
        _listeners: new Set(),
        
        init: function() {
            this._loadFromCache();
            return this;
        },
        
        _loadFromCache: function() {
            const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (cachedUser) {
                this._user = cachedUser;
                this._userId = cachedUser.id;
                this._authenticated = true;
            }
        },
        
        setUser: function(user) {
            if (!user) return false;
            
            this._user = { ...user };
            this._userId = user.id || user.uid || null;
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._user);
            
            this._notifyListeners();
            return true;
        },
        
        setToken: function(token) {
            this._token = token;
        },
        
        setAuthenticated: function(authenticated) {
            this._authenticated = authenticated;
            this._notifyListeners();
        },
        
        getUser: function() {
            return this._user ? { ...this._user } : null;
        },
        
        getUserId: function() {
            return this._userId;
        },
        
        getToken: function() {
            return this._token;
        },
        
        isAuthenticated: function() {
            return this._authenticated;
        },
        
        clear: function() {
            this._user = null;
            this._userId = null;
            this._token = null;
            this._authenticated = false;
            SafeStorage.remove(LOCAL_STORAGE_KEYS.USER_CACHE);
            this._notifyListeners();
        },
        
        subscribe: function(callback) {
            this._listeners.add(callback);
            return () => this._listeners.delete(callback);
        },
        
        _notifyListeners: function() {
            this._listeners.forEach(cb => {
                try { cb(this._user); } catch (e) {}
            });
        }
    }.init();

    // =============================================
    // SESSION CLIENT (FIXED - PROPER ERROR HANDLING)
    // =============================================
    const SessionClient = {
        _session: null,
        _userId: null,
        _token: null,
        _authenticated: false,
        _permissions: new Set(),
        _listeners: new Set(),
        _pending: false,
        _retryCount: 0,
        _maxRetries: 3,
        _retryDelay: 2000,
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            this._loadFromCache();
            this._initialized = true;
            Logger.info('SessionClient', 'Initialized');
            return this;
        },
        
        _loadFromCache: function() {
            const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE);
            if (cached) {
                this._session = cached.session;
                this._userId = cached.userId;
                this._authenticated = cached.authenticated || false;
                this._permissions = new Set(cached.permissions || []);
            }
        },
        
        requestSession: function() {
            if (this._pending) {
                Logger.warn('SessionClient', 'Session request already pending');
                return Promise.reject(new Error('Session request already pending'));
            }
            
            if (currentState !== LIFECYCLE_STATES.WAITING_FOR_PARENT && 
                currentState !== LIFECYCLE_STATES.ACTIVE) {
                Logger.warn('SessionClient', `Cannot request session in state: ${currentState}`);
                return Promise.reject(new Error(`Cannot request session in state: ${currentState}`));
            }
            
            this._pending = true;
            this._retryCount = 0;
            
            Logger.info('SessionClient', 'Requesting session from parent');
            
            return this._attemptSessionRequest();
        },
        
        _attemptSessionRequest: function() {
            return ParentConnectionManager.sendWithResponse(OUTGOING_ACTIONS.REQUEST_SESSION, {
                module: MODULE_NAME,
                timestamp: Date.now(),
                version: MODULE_VERSION
            })
            .then((response) => {
                this._pending = false;
                this._retryCount = 0;
                this._handleSessionResponse(response);
                return response;
            })
            .catch((error) => {
                this._retryCount++;
                
                if (this._retryCount < this._maxRetries) {
                    Logger.warn('SessionClient', `Session request failed (attempt ${this._retryCount}/${this._maxRetries}), retrying...`, error);
                    
                    // Exponential backoff
                    const delay = this._retryDelay * Math.pow(1.5, this._retryCount - 1);
                    
                    return new Promise((resolve, reject) => {
                        setTimeout(() => {
                            this._attemptSessionRequest()
                                .then(resolve)
                                .catch(reject);
                        }, delay);
                    });
                } else {
                    this._pending = false;
                    Logger.error('SessionClient', 'Session request failed after max retries', error);
                    
                    // Try to use cached session as fallback
                    if (this._session) {
                        Logger.info('SessionClient', 'Using cached session as fallback');
                        return Promise.resolve({ payload: this._session, fromCache: true });
                    }
                    
                    throw error;
                }
            });
        },
        
        _handleSessionResponse: function(response) {
            this._pending = false;
            
            // Handle both direct payload and wrapped response
            const session = response.payload || response;
            
            if (session) {
                this._session = session;
                this._userId = session.userId || session.user?.id;
                this._authenticated = session.authenticated || false;
                this._permissions = new Set(session.permissions || []);
                
                // Cache the session
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
                    session: this._session,
                    userId: this._userId,
                    authenticated: this._authenticated,
                    permissions: Array.from(this._permissions),
                    timestamp: Date.now()
                });
                
                // Also update user cache if user data is present
                if (session.user) {
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, session.user);
                    SessionStore.setUser(session.user);
                }
                
                Logger.success('SessionClient', 'Session established', { 
                    authenticated: this._authenticated,
                    userId: this._userId 
                });
                
                this._notifyListeners();
                
                // Dispatch event for UI
                window.dispatchEvent(new CustomEvent('sessionUpdated', {
                    detail: { session: this._session, authenticated: this._authenticated }
                }));
            } else {
                Logger.warn('SessionClient', 'Empty session response received');
            }
        },
        
        setUser: function(user) {
            if (!user) return false;
            
            this._session = { ...this._session, user };
            this._userId = user.id || user.uid || null;
            this._authenticated = true;
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, user);
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SESSION_CACHE, {
                session: this._session,
                userId: this._userId,
                authenticated: this._authenticated,
                permissions: Array.from(this._permissions),
                timestamp: Date.now()
            });
            
            this._notifyListeners();
            return true;
        },
        
        setToken: function(token) {
            this._token = token;
            if (this._session) this._session.token = token;
        },
        
        setAuthenticated: function(authenticated) {
            this._authenticated = authenticated;
            this._notifyListeners();
        },
        
        getUser: function() {
            return this._session?.user || null;
        },
        
        getUserId: function() {
            return this._userId;
        },
        
        getToken: function() {
            return this._token;
        },
        
        isAuthenticated: function() {
            return this._authenticated;
        },
        
        hasPermission: function(permission) {
            return this._permissions.has(permission);
        },
        
        getPermissions: function() {
            return Array.from(this._permissions);
        },
        
        clear: function() {
            this._session = null;
            this._userId = null;
            this._token = null;
            this._authenticated = false;
            this._permissions.clear();
            SafeStorage.remove(LOCAL_STORAGE_KEYS.SESSION_CACHE);
            SafeStorage.remove(LOCAL_STORAGE_KEYS.USER_CACHE);
            this._notifyListeners();
        },
        
        subscribe: function(callback) {
            this._listeners.add(callback);
            return () => this._listeners.delete(callback);
        },
        
        _notifyListeners: function() {
            this._listeners.forEach(cb => {
                try { cb(this._session); } catch (e) {}
            });
        },
        
        getState: function() {
            return {
                authenticated: this._authenticated,
                userId: this._userId,
                hasSession: !!this._session,
                permissions: Array.from(this._permissions),
                pending: this._pending,
                retryCount: this._retryCount
            };
        }
    }.init();

    // =============================================
    // CHAT MANAGER (PRESERVED - NO CHANGES)
    // =============================================
    const ChatManager = {
        _conversations: [],
        _conversationsMap: new Map(),
        _activeConversation: null,
        _messages: [],
        _messagesMap: new Map(),
        _subscribers: new Set(),
        _loaded: false,
        _historyCache: new Map(),
        
        init: function() {
            this._loadFromCache();
            return this;
        },
        
        _loadFromCache: function() {
            const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cached && Array.isArray(cached.conversations)) {
                this._conversations = cached.conversations;
                this._rebuildMap();
                this._loaded = true;
            }
            
            const archived = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);
            archived.forEach(chatId => {
                const chat = this._conversationsMap.get(chatId);
                if (chat) chat.archived = true;
            });
        },
        
        _rebuildMap: function() {
            this._conversationsMap.clear();
            this._conversations.forEach(chat => {
                if (chat.id) {
                    this._conversationsMap.set(chat.id, chat);
                }
            });
        },
        
        _rebuildMessagesMap: function() {
            this._messagesMap.clear();
            this._messages.forEach(msg => {
                if (msg.id) {
                    this._messagesMap.set(msg.id, msg);
                }
            });
        },
        
        setConversations: function(conversations) {
            this._conversations = conversations || [];
            this._rebuildMap();
            this._loaded = true;
            this._notifySubscribers();
        },
        
        setMessages: function(messages) {
            this._messages = messages || [];
            this._rebuildMessagesMap();
            this._notifySubscribers();
        },
        
        addMessage: function(message) {
            if (!message || !message.id) return;
            
            const existing = this._messagesMap.get(message.id);
            if (existing) {
                Object.assign(existing, message);
            } else {
                this._messages.push(message);
                this._messagesMap.set(message.id, message);
            }
            
            this._messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
            if (message.conversationId) {
                const conversation = this._conversationsMap.get(message.conversationId);
                if (conversation) {
                    conversation.lastMessage = message.content;
                    conversation.lastMessageAt = message.timestamp;
                    if (message.senderId !== SessionStore.getUserId()) {
                        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                    }
                }
            }
            
            if (this._activeConversation && message.conversationId === this._activeConversation.id) {
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${this._activeConversation.id}`, this._messages);
            }
            
            this._notifySubscribers();
            EventBus.emit('message:added', message);
        },
        
        updateMessageStatus: function(messageId, status, details = {}) {
            const message = this._messagesMap.get(messageId);
            if (!message) return false;
            
            message.status = status;
            if (details.deliveredAt) message.deliveredAt = details.deliveredAt;
            if (details.readAt) message.readAt = details.readAt;
            
            EventBus.emit('message:status', { messageId, status, message });
            return true;
        },
        
        getConversations: function() {
            return [...this._conversations];
        },
        
        getConversation: function(id) {
            return this._conversationsMap.get(id) || null;
        },
        
        setActiveConversation: function(conversation) {
            this._activeConversation = conversation;
            this._notifySubscribers();
        },
        
        getActiveChat: function() {
            return this._activeConversation ? { ...this._activeConversation } : null;
        },
        
        getMessages: function() {
            return [...this._messages];
        },
        
        loadPreviousMessages: function(conversationId) {
            if (this._historyCache.has(conversationId)) {
                const cached = this._historyCache.get(conversationId);
                if (Date.now() - cached.timestamp < 300000) {
                    return cached.messages;
                }
            }
            
            const stored = SafeStorage.getJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${conversationId}`);
            if (stored && Array.isArray(stored)) {
                this._historyCache.set(conversationId, {
                    messages: stored,
                    timestamp: Date.now()
                });
                return stored;
            }
            
            return null;
        },
        
        subscribe: function(callback) {
            this._subscribers.add(callback);
            return () => this._subscribers.delete(callback);
        },
        
        _notifySubscribers: function() {
            this._subscribers.forEach(cb => {
                try { cb(this._conversations, this._activeConversation, this._messages); } catch (e) {}
            });
        },
        
        clear: function() {
            this._conversations = [];
            this._conversationsMap.clear();
            this._activeConversation = null;
            this._messages = [];
            this._messagesMap.clear();
            this._historyCache.clear();
        }
    }.init();

    // =============================================
    // FRIEND MANAGER (PRESERVED - NO CHANGES)
    // =============================================
    const FriendManager = {
        _friends: [],
        _friendsMap: new Map(),
        _loaded: false,
        _loading: false,
        _subscribers: new Set(),
        _activeFriends: new Set(),
        _blockedFriends: new Set(),
        
        init: function() {
            this._loadFromCache();
            this._loadBlockedUsers();
            return this;
        },
        
        _loadFromCache: function() {
            const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
            if (cached && Array.isArray(cached.friends)) {
                this._friends = cached.friends;
                this._rebuildMap();
                this._loaded = true;
                
                this._friends.forEach(friend => {
                    if (friend.online) {
                        this._activeFriends.add(friend.id || friend.uid);
                    }
                });
            }
        },
        
        _loadBlockedUsers: function() {
            const blocked = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);
            this._blockedFriends = new Set(blocked);
        },
        
        _rebuildMap: function() {
            this._friendsMap.clear();
            this._friends.forEach(friend => {
                if (friend.id || friend.uid) {
                    const id = friend.id || friend.uid;
                    this._friendsMap.set(id, friend);
                }
            });
        },
        
        setFriends: function(friends) {
            this._friends = friends || [];
            this._rebuildMap();
            this._loaded = true;
            this._notifySubscribers();
        },
        
        mergeFriends: function(newFriends) {
            if (!Array.isArray(newFriends)) return;
            
            let changed = false;
            
            newFriends.forEach(newFriend => {
                const id = newFriend.id || newFriend.uid;
                if (!id) return;
                
                const existing = this._friendsMap.get(id);
                if (!existing) {
                    this._friends.push(newFriend);
                    this._friendsMap.set(id, newFriend);
                    changed = true;
                } else {
                    if (JSON.stringify(existing) !== JSON.stringify(newFriend)) {
                        Object.assign(existing, newFriend);
                        changed = true;
                    }
                }
                
                if (newFriend.online) {
                    this._activeFriends.add(id);
                } else {
                    this._activeFriends.delete(id);
                }
            });
            
            if (changed) {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                    friends: this._friends,
                    timestamp: Date.now()
                });
                this._notifySubscribers();
            }
        },
        
        updateFriend: function(update) {
            const id = update.id || update.uid;
            if (!id) return false;
            
            const existing = this._friendsMap.get(id);
            if (!existing) {
                this._friends.push(update);
                this._friendsMap.set(id, update);
            } else {
                Object.assign(existing, update);
            }
            
            if (update.online) {
                this._activeFriends.add(id);
            } else if (update.online === false) {
                this._activeFriends.delete(id);
            }
            
            this._notifySubscribers();
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                friends: this._friends,
                timestamp: Date.now()
            });
            
            return true;
        },
        
        updateFriendStatus: function(status) {
            const id = status.userId || status.id;
            if (!id) return;
            
            const friend = this._friendsMap.get(id);
            if (friend) {
                friend.online = status.online;
                friend.lastSeen = status.lastSeen;
                friend.status = status.status;
                
                if (status.online) {
                    this._activeFriends.add(id);
                } else {
                    this._activeFriends.delete(id);
                }
                
                this._notifySubscribers();
            }
        },
        
        getFriends: function() {
            return [...this._friends];
        },
        
        getFriend: function(id) {
            return this._friendsMap.get(id) || null;
        },
        
        getFriendListForChat: function() {
            const availableFriends = this._friends.filter(friend => 
                !this._blockedFriends.has(friend.id || friend.uid)
            );
            
            return [...availableFriends].sort((a, b) => {
                if (a.online && !b.online) return -1;
                if (!a.online && b.online) return 1;
                
                const aName = (a.displayName || a.username || '').toLowerCase();
                const bName = (b.displayName || b.username || '').toLowerCase();
                return aName.localeCompare(bName);
            });
        },
        
        isFriendActive: function(id) {
            return this._activeFriends.has(id);
        },
        
        isFriendBlocked: function(id) {
            return this._blockedFriends.has(id);
        },
        
        subscribe: function(callback) {
            this._subscribers.add(callback);
            if (this._loaded) {
                try { callback(this._friends); } catch (e) {}
            }
            return () => this._subscribers.delete(callback);
        },
        
        _notifySubscribers: function() {
            const friends = this.getFriendListForChat();
            this._subscribers.forEach(cb => {
                try { cb(friends, this._friends); } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('friendsUpdated', {
                detail: { friends: this._friends, availableFriends: friends }
            }));
        },
        
        isLoaded: function() {
            return this._loaded;
        },
        
        clear: function() {
            this._friends = [];
            this._friendsMap.clear();
            this._loaded = false;
            this._activeFriends.clear();
            SafeStorage.remove(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
        }
    }.init();

    // =============================================
    // GROUP MANAGER (PRESERVED - NO CHANGES)
    // =============================================
    const GroupManager = {
        _groups: new Map(),
        _pendingInvites: new Set(),
        
        mergeGroups: function(groups) {
            groups.forEach(group => {
                this._groups.set(group.id, group);
                
                const existing = ChatManager.getConversation(group.id);
                if (!existing) {
                    const conversations = ChatManager.getConversations();
                    conversations.push(group);
                    ChatManager.setConversations(conversations);
                }
            });
            
            EventBus.emit('groups:updated', this.getGroups());
        },
        
        getGroups: function() {
            return Array.from(this._groups.values());
        },
        
        getGroup: function(groupId) {
            return this._groups.get(groupId) || ChatManager.getConversation(groupId);
        }
    };

    // =============================================
    // TYPING MANAGER (PRESERVED - ADAPTED)
    // =============================================
    const TypingManager = {
        _typingUsers: new Map(),
        _typingTimeout: null,
        _lastTypingTime: 0,
        _isTyping: false,
        
        addTypingUser: function(conversationId, userId, userInfo = {}) {
            if (!conversationId || !userId) return;
            
            const key = `${conversationId}:${userId}`;
            this._typingUsers.set(key, {
                userId,
                userInfo,
                timestamp: Date.now()
            });
            
            setTimeout(() => {
                this.removeTypingUser(conversationId, userId);
            }, 5000);
            
            EventBus.emit('typing:user', { conversationId, userId, userInfo, isTyping: true });
        },
        
        removeTypingUser: function(conversationId, userId) {
            if (!conversationId || !userId) return;
            
            const key = `${conversationId}:${userId}`;
            if (this._typingUsers.has(key)) {
                this._typingUsers.delete(key);
                EventBus.emit('typing:user', { conversationId, userId, isTyping: false });
            }
        },
        
        getTypingUsersForConversation: function(conversationId) {
            const result = [];
            for (const [key, value] of this._typingUsers.entries()) {
                if (key.startsWith(`${conversationId}:`)) {
                    const age = Date.now() - value.timestamp;
                    if (age < 5000) {
                        result.push(value);
                    } else {
                        this._typingUsers.delete(key);
                    }
                }
            }
            return result;
        },
        
        sendTyping: function(conversationId, isTyping) {
            if (!conversationId || !SessionStore.getUserId()) return false;
            if (!canSendUserMessages()) return false;
            
            const now = Date.now();
            
            if (isTyping) {
                if (now - this._lastTypingTime < TIMING.TYPING_RATE_LIMIT) return false;
                this._lastTypingTime = now;
            }
            
            const result = ParentConnectionManager.send(
                isTyping ? OUTGOING_ACTIONS.START_TYPING : OUTGOING_ACTIONS.STOP_TYPING,
                { conversationId: conversationId },
                { requireAck: false }
            );
            
            if (result.blocked) {
                return false;
            }
            
            if (isTyping) {
                if (this._typingTimeout) clearTimeout(this._typingTimeout);
                this._typingTimeout = setTimeout(() => {
                    if (this._isTyping) {
                        this._isTyping = false;
                        ParentConnectionManager.send(OUTGOING_ACTIONS.STOP_TYPING, { conversationId }, { requireAck: false });
                    }
                }, TIMING.TYPING_TIMEOUT);
            }
            
            this._isTyping = isTyping;
            return true;
        },
        
        stopTyping: function() {
            if (this._typingTimeout) {
                clearTimeout(this._typingTimeout);
                this._typingTimeout = null;
            }
            
            if (this._isTyping && ChatManager.getActiveChat()) {
                this._isTyping = false;
                ParentConnectionManager.send(OUTGOING_ACTIONS.STOP_TYPING, {
                    conversationId: ChatManager.getActiveChat().id
                }, { requireAck: false });
            }
        }
    };

    // =============================================
    // MESSAGE HANDLER (PRESERVED - ADAPTED)
    // =============================================
    const MessageHandler = {
        _optimisticMessages: new Map(),
        _pendingRequests: new Map(),
        
        sendMessage: function(content, options = {}) {
            if (!canSendUserMessages()) {
                return { success: false, error: 'module_not_active' };
            }
            
            if (!ChatManager.getActiveChat() && !options.conversationId) {
                return { success: false, error: 'no_conversation' };
            }
            
            const conversationId = options.conversationId || ChatManager.getActiveChat()?.id;
            if (!conversationId) return { success: false, error: 'invalid_conversation' };
            
            if (!content && !options.attachment) {
                return { success: false, error: 'empty_message' };
            }
            
            const localId = SecurityUtils.generateMessageId();
            const requestId = SecurityUtils.generateRequestId();
            
            const optimisticMessage = {
                id: localId,
                localId: localId,
                requestId: requestId,
                conversationId: conversationId,
                senderId: SessionStore.getUserId() || 'me',
                sender: SessionStore.getUser(),
                content: SecurityUtils.sanitizeString(content || ''),
                type: options.type || 'text',
                timestamp: Date.now(),
                status: 'sending',
                local: true,
                optimistic: true,
                attachment: options.attachment ? { ...options.attachment } : null,
                replyTo: options.replyTo,
                mentions: options.mentions
            };
            
            this._optimisticMessages.set(localId, optimisticMessage);
            this._pendingRequests.set(requestId, { localId, optimisticMessage, timestamp: Date.now() });
            
            ChatManager.addMessage(optimisticMessage);
            EventBus.emit('message:sending', { message: optimisticMessage, optimistic: true });
            
            const result = ParentConnectionManager.send(OUTGOING_ACTIONS.SEND_MESSAGE, {
                conversationId: conversationId,
                content: content,
                type: options.type || 'text',
                attachment: options.attachment,
                replyTo: options.replyTo,
                mentions: options.mentions,
                localId: localId,
                requestId: requestId
            }, { 
                requestId: requestId, 
                requireAck: true,
                maxRetries: TIMING.MAX_MESSAGE_RETRIES
            });
            
            if (result.blocked) {
                optimisticMessage.status = 'blocked';
                ChatManager.updateMessageStatus(localId, 'blocked', { reason: result.reason });
                EventBus.emit('message:failed', { messageId: localId, error: `Blocked: ${result.reason}` });
                this._optimisticMessages.delete(localId);
                this._pendingRequests.delete(requestId);
                return { success: false, blocked: true, reason: result.reason };
            }
            
            // NO TIMEOUT - wait indefinitely for parent response
            
            return { success: true, localId, requestId, optimistic: optimisticMessage };
        },
        
        handleMessageSent: function(response) {
            const { localId, messageId, requestId, timestamp, status } = response;
            
            if (localId && this._optimisticMessages.has(localId)) {
                const optimistic = this._optimisticMessages.get(localId);
                
                const message = ChatManager._messagesMap.get(localId);
                if (message) {
                    message.id = messageId || message.id;
                    message.status = status || 'sent';
                    if (timestamp) message.sentAt = timestamp;
                    delete message.optimistic;
                }
                
                ChatManager.updateMessageStatus(localId, status || 'sent', { timestamp });
                EventBus.emit('message:sent', { localId, messageId, success: true });
                
                this._optimisticMessages.delete(localId);
            }
            
            if (requestId) {
                this._pendingRequests.delete(requestId);
            }
        },
        
        handleMessageFailed: function(response) {
            const { localId, requestId, error, reason } = response;
            
            if (localId && this._optimisticMessages.has(localId)) {
                ChatManager.updateMessageStatus(localId, 'failed', { reason: error || reason });
                EventBus.emit('message:failed', { messageId: localId, error: error || reason });
                this._optimisticMessages.delete(localId);
            }
            
            if (requestId) {
                this._pendingRequests.delete(requestId);
            }
        },
        
        retryMessage: function(messageId) {
            if (!canSendUserMessages()) return false;
            
            const message = ChatManager.getMessages().find(m => m.id === messageId);
            if (!message || message.status !== 'failed') return false;
            
            return this.sendMessage(message.content, {
                type: message.type,
                attachment: message.attachment,
                replyTo: message.replyTo,
                conversationId: message.conversationId
            });
        },
        
        deleteMessage: function(messageId, forEveryone = false) {
            if (!canSendUserMessages()) return false;
            
            const result = ParentConnectionManager.send(OUTGOING_ACTIONS.DELETE_MESSAGE, {
                messageId,
                forEveryone
            }, { requireAck: true });
            
            if (result.blocked) {
                return false;
            }
            
            const messages = ChatManager.getMessages();
            const index = messages.findIndex(m => m.id === messageId);
            if (index !== -1) {
                if (forEveryone) {
                    messages[index].deleted = true;
                    messages[index].deletedAt = Date.now();
                } else {
                    messages.splice(index, 1);
                }
                
                if (ChatManager.getActiveChat()) {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                }
                
                EventBus.emit('message:deleted', { messageId, forEveryone });
            }
            
            return true;
        },
        
        editMessage: function(messageId, newContent) {
            if (!canSendUserMessages()) return false;
            
            const result = ParentConnectionManager.send(OUTGOING_ACTIONS.EDIT_MESSAGE, {
                messageId,
                content: newContent
            }, { requireAck: true });
            
            if (result.blocked) {
                return false;
            }
            
            const messages = ChatManager.getMessages();
            const message = messages.find(m => m.id === messageId);
            if (message) {
                message.content = SecurityUtils.sanitizeString(newContent);
                message.edited = true;
                message.editedAt = Date.now();
                
                if (ChatManager.getActiveChat()) {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                }
                
                EventBus.emit('message:edited', { messageId, content: newContent });
            }
            
            return true;
        },
        
        addReaction: function(messageId, emoji, add = true) {
            if (!canSendUserMessages()) return false;
            
            const result = ParentConnectionManager.send(OUTGOING_ACTIONS.ADD_REACTION, {
                messageId,
                emoji,
                add
            }, { requireAck: true });
            
            if (result.blocked) {
                return false;
            }
            
            const messages = ChatManager.getMessages();
            const message = messages.find(m => m.id === messageId);
            if (message) {
                if (!message.reactions) message.reactions = {};
                if (!message.reactions[emoji]) message.reactions[emoji] = [];
                
                const userId = SessionStore.getUserId();
                const userIndex = message.reactions[emoji].indexOf(userId);
                
                if (add && userIndex === -1) {
                    message.reactions[emoji].push(userId);
                } else if (!add && userIndex !== -1) {
                    message.reactions[emoji].splice(userIndex, 1);
                }
                
                if (message.reactions[emoji].length === 0) {
                    delete message.reactions[emoji];
                }
                
                if (ChatManager.getActiveChat()) {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                }
                
                EventBus.emit('message:reaction', { messageId, emoji, add });
            }
            
            return true;
        },
        
        forwardMessage: function(messageId, targetConversationIds) {
            if (!canSendUserMessages()) return false;
            
            const result = ParentConnectionManager.send(OUTGOING_ACTIONS.FORWARD_MESSAGE, {
                messageId,
                targetConversationIds
            }, { requireAck: true });
            
            if (result.blocked) {
                return false;
            }
            
            return true;
        },
        
        reportMessage: function(messageId, reason) {
            if (!canSendUserMessages()) return false;
            
            const result = ParentConnectionManager.send(OUTGOING_ACTIONS.REPORT_MESSAGE, {
                messageId,
                reason
            }, { requireAck: true });
            
            if (result.blocked) {
                return false;
            }
            
            return true;
        },
        
        searchMessages: function(conversationId, query, options = {}) {
            if (!canSendUserMessages()) {
                return Promise.reject(new Error('Module not active'));
            }
            
            return ParentConnectionManager.sendWithResponse(OUTGOING_ACTIONS.SEARCH_MESSAGES, {
                conversationId,
                query,
                ...options
            }).catch(error => {
                return { success: false, error: error.message };
            });
        },
        
        getPendingCount: function() {
            return this._optimisticMessages.size;
        }
    };

    // =============================================
    // CONVERSATION MANAGER (PRESERVED - ADAPTED)
    // =============================================
    const ConversationManager = {
        openConversation: function(conversationId, options = {}) {
            if (!conversationId) return false;
            
            const conversation = ChatManager.getConversation(conversationId);
            if (conversation) {
                ChatManager.setActiveConversation(conversation);
            }
            
            const result = ParentConnectionManager.send(OUTGOING_ACTIONS.OPEN_CONVERSATION, {
                conversationId: conversationId
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            this.fetchMessages(conversationId, options);
            
            const draft = UIStateManager.getDraft(conversationId);
            EventBus.emit('draft:loaded', { conversationId, draft });
            
            const theme = UIStateManager.getChatTheme(conversationId);
            if (theme) EventBus.emit('theme:apply', { conversationId, theme });
            
            this.markAsRead(conversationId);
            
            return true;
        },
        
        fetchMessages: function(conversationId, options = {}) {
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            
            ParentConnectionManager.send(OUTGOING_ACTIONS.FETCH_MESSAGES, {
                conversationId: conversationId,
                before: options.before,
                limit: options.limit || 50
            }, { requireAck: false });
        },
        
        fetchConversations: function() {
            if (!canSendUserMessages()) return;
            
            ParentConnectionManager.send(OUTGOING_ACTIONS.FETCH_CONVERSATIONS, {}, { requireAck: false });
        },
        
        markAsRead: function(conversationId) {
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            
            ParentConnectionManager.send(OUTGOING_ACTIONS.MARK_AS_READ, {
                conversationId: conversationId
            }, { requireAck: false });
            
            const conversation = ChatManager.getConversation(conversationId);
            if (conversation) {
                conversation.unreadCount = 0;
                EventBus.emit('conversation:updated', conversation);
            }
        },
        
        createConversation: function(participants, options = {}) {
            if (!participants || participants.length === 0) return false;
            if (!canSendUserMessages()) return false;
            
            const result = ParentConnectionManager.send(OUTGOING_ACTIONS.CREATE_CONVERSATION, {
                participants: participants,
                type: options.type || 'direct',
                name: options.name,
                initialMessage: options.initialMessage
            }, { requireAck: true });
            
            if (result.blocked) {
                return false;
            }
            
            return true;
        },
        
        archiveConversation: function(conversationId, archived = true) {
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            
            ParentConnectionManager.send(OUTGOING_ACTIONS.ARCHIVE_CONVERSATION, {
                conversationId: conversationId,
                archived: archived
            }, { requireAck: false });
            
            const conversation = ChatManager.getConversation(conversationId);
            if (conversation) {
                conversation.archived = archived;
                
                const archivedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);
                if (archived && !archivedChats.includes(conversationId)) {
                    archivedChats.push(conversationId);
                } else if (!archived) {
                    const index = archivedChats.indexOf(conversationId);
                    if (index !== -1) archivedChats.splice(index, 1);
                }
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, archivedChats);
                
                EventBus.emit('conversation:updated', conversation);
            }
        },
        
        blockUser: function(userId, block = true) {
            if (!canSendUserMessages()) return false;
            
            const result = ParentConnectionManager.send(OUTGOING_ACTIONS.BLOCK_USER, {
                userId,
                block
            }, { requireAck: true });
            
            if (result.blocked) {
                return false;
            }
            
            const blockedUsers = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);
            if (block && !blockedUsers.includes(userId)) {
                blockedUsers.push(userId);
            } else if (!block) {
                const index = blockedUsers.indexOf(userId);
                if (index !== -1) blockedUsers.splice(index, 1);
            }
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, blockedUsers);
            
            EventBus.emit('user:blocked', { userId, block });
            
            return true;
        }
    };

    // =============================================
    // UI STATE MANAGER (PRESERVED - NO CHANGES)
    // =============================================
    const UIStateManager = {
        _drafts: {},
        _chatThemes: {},
        _starredMessages: {},
        _uiSettings: {},
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            
            this._loadFromStorage();
            this._initialized = true;
            
            return this;
        },
        
        _loadFromStorage: function() {
            try {
                this._drafts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS, {});
                this._chatThemes = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHAT_THEMES, {});
                this._starredMessages = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.STARRED_MESSAGES, {});
                
                const uiState = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.UI_STATE, {});
                this._uiSettings = uiState.settings || {};
            } catch (e) {}
        },
        
        _saveToStorage: function() {
            try {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.DRAFTS, this._drafts);
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHAT_THEMES, this._chatThemes);
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STARRED_MESSAGES, this._starredMessages);
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.UI_STATE, {
                    settings: this._uiSettings,
                    timestamp: Date.now()
                });
            } catch (e) {}
        },
        
        saveDraft: function(conversationId, text, attachment = null) {
            if (!conversationId) return;
            
            if (text || attachment) {
                this._drafts[conversationId] = {
                    text: text || '',
                    attachment: attachment ? { ...attachment } : null,
                    timestamp: Date.now()
                };
            } else if (this._drafts[conversationId]) {
                delete this._drafts[conversationId];
            }
            
            this._saveToStorage();
            EventBus.emit('draft:saved', { conversationId, hasDraft: !!(text || attachment) });
        },
        
        getDraft: function(conversationId) {
            if (!conversationId) return null;
            
            const draft = this._drafts[conversationId];
            if (draft && Date.now() - draft.timestamp < 86400000) {
                return draft;
            }
            
            if (draft) delete this._drafts[conversationId];
            return null;
        },
        
        clearDraft: function(conversationId) {
            if (conversationId && this._drafts[conversationId]) {
                delete this._drafts[conversationId];
                this._saveToStorage();
                EventBus.emit('draft:saved', { conversationId, hasDraft: false });
            }
        },
        
        setChatTheme: function(conversationId, theme) {
            if (!conversationId) return;
            
            if (theme) {
                this._chatThemes[conversationId] = theme;
            } else {
                delete this._chatThemes[conversationId];
            }
            
            this._saveToStorage();
            EventBus.emit('theme:updated', { conversationId, theme });
        },
        
        getChatTheme: function(conversationId) {
            return conversationId ? this._chatThemes[conversationId] : null;
        },
        
        toggleStarred: function(messageId) {
            if (!messageId) return false;
            
            const isStarred = !!this._starredMessages[messageId];
            
            if (isStarred) {
                delete this._starredMessages[messageId];
            } else {
                this._starredMessages[messageId] = true;
            }
            
            this._saveToStorage();
            EventBus.emit('message:starred', { messageId, starred: !isStarred });
            return !isStarred;
        },
        
        isStarred: function(messageId) {
            return !!this._starredMessages[messageId];
        },
        
        getStarredMessages: function() {
            return Object.keys(this._starredMessages);
        },
        
        updateSettings: function(settings) {
            this._uiSettings = { ...this._uiSettings, ...settings };
            this._saveToStorage();
            EventBus.emit('settings:updated', this._uiSettings);
        },
        
        getSettings: function() {
            return { ...this._uiSettings };
        }
    }.init();

    // =============================================
    // UI FEATURES (PRESERVED - NO CHANGES)
    // =============================================
    const UIFeatures = {
        playNotificationSound: function() {
            try {
                const audio = new Audio();
                audio.src = 'data:audio/wav;base64,UklGR...';
                audio.volume = 0.5;
                audio.play().catch(() => {
                    if (Notification.permission === 'granted') {
                        new Notification('New message', { body: 'You have a new message' });
                    }
                });
            } catch (e) {
                if (Notification.permission === 'granted') {
                    new Notification('New message', { body: 'You have a new message' });
                }
            }
        },

        formatMessageText: function(text) {
            if (!text) return '';
            return SecurityUtils.sanitizeString(text);
        },

        formatTime: function(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },

        formatDate: function(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (date.toDateString() === today.toDateString()) {
                return 'Today';
            } else if (date.toDateString() === yesterday.toDateString()) {
                return 'Yesterday';
            } else {
                return date.toLocaleDateString();
            }
        },

        formatDateTime: function(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            return `${this.formatDate(timestamp)} ${this.formatTime(timestamp)}`;
        },

        formatFileSize: function(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
    };

    // =============================================
    // EVENT BUS (PRESERVED - NO CHANGES)
    // =============================================
    const EventBus = {
        _events: new Map(),
        
        on: function(event, callback) {
            if (!this._events.has(event)) {
                this._events.set(event, new Set());
            }
            this._events.get(event).add(callback);
            return () => this.off(event, callback);
        },
        
        off: function(event, callback) {
            if (this._events.has(event)) {
                this._events.get(event).delete(callback);
            }
        },
        
        emit: function(event, data) {
            if (this._events.has(event)) {
                this._events.get(event).forEach(callback => {
                    try {
                        callback(data);
                    } catch (e) {}
                });
            }
        },
        
        once: function(event, callback) {
            const wrapper = (data) => {
                this.off(event, wrapper);
                callback(data);
            };
            this.on(event, wrapper);
        }
    };

    // =============================================
    // UI BRIDGE (PRESERVED - ADAPTED)
    // =============================================
    const UIBridge = {
        _listeners: new Map(),
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            
            // Wait for DOM ready to attach listeners
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this._attachListeners());
            } else {
                // Only attach if module is already active
                if (currentState === LIFECYCLE_STATES.ACTIVE) {
                    this._attachListeners();
                }
            }
            
            this._initialized = true;
            Logger.info('UIBridge', 'Initialized (passive)');
            return this;
        },
        
        _attachListeners: function() {
            // Only attach if module is active
            if (currentState !== LIFECYCLE_STATES.ACTIVE) {
                Logger.info('UIBridge', 'Delaying UI attachment until ACTIVE');
                return;
            }
            
            this._attachSendMessageListener();
            this._attachTypingListener();
            this._attachMarkReadListener();
            this._attachConversationListeners();
            this._attachFriendListeners();
            
            Logger.info('UIBridge', 'UI listeners attached');
        },
        
        _attachSendMessageListener: function() {
            const sendButton = document.getElementById('sendMessageBtn');
            const input = document.getElementById('messageInput');
            
            if (sendButton) {
                sendButton.addEventListener('click', () => {
                    if (!canSendUserMessages()) {
                        console.log(`[${MODULE_NAME}] ⏳ Waiting for activation...`);
                        return;
                    }
                    if (!input) return;
                    const text = input.value.trim();
                    if (text) {
                        MessageHandler.sendMessage(text);
                        input.value = '';
                        UIStateManager.clearDraft(ChatManager.getActiveChat()?.id);
                    }
                });
            }
            
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!canSendUserMessages()) {
                            console.log(`[${MODULE_NAME}] ⏳ Waiting for activation...`);
                            return;
                        }
                        const text = input.value.trim();
                        if (text) {
                            MessageHandler.sendMessage(text);
                            input.value = '';
                            UIStateManager.clearDraft(ChatManager.getActiveChat()?.id);
                        }
                    }
                });
                
                input.addEventListener('input', () => {
                    const conversationId = ChatManager.getActiveChat()?.id;
                    if (conversationId && canSendUserMessages()) {
                        const text = input.value.trim();
                        UIStateManager.saveDraft(conversationId, text);
                        
                        if (text && !TypingManager._isTyping) {
                            TypingManager.sendTyping(conversationId, true);
                        } else if (!text && TypingManager._isTyping) {
                            TypingManager.sendTyping(conversationId, false);
                        }
                    }
                });
            }
        },
        
        _attachTypingListener: function() {
            EventBus.on('typing:user', (data) => {
                const typingIndicator = document.getElementById('typingIndicator');
                if (!typingIndicator) return;
                
                const activeChat = ChatManager.getActiveChat();
                if (!activeChat || data.conversationId !== activeChat.id) return;
                
                const typingUsers = TypingManager.getTypingUsersForConversation(data.conversationId);
                if (typingUsers.length > 0) {
                    const names = typingUsers.map(u => u.userInfo?.displayName || 'Someone');
                    const text = names.length === 1 ? 
                        `${names[0]} is typing...` : 
                        `${names.length} people are typing...`;
                    typingIndicator.textContent = text;
                    typingIndicator.style.display = 'block';
                } else {
                    typingIndicator.style.display = 'none';
                }
            });
        },
        
        _attachMarkReadListener: function() {
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting && canSendUserMessages()) {
                            const messageId = entry.target.dataset.messageId;
                            const conversationId = ChatManager.getActiveChat()?.id;
                            if (messageId && conversationId) {
                                ConversationManager.markAsRead(conversationId);
                            }
                        }
                    });
                }, { threshold: 0.5 });
                
                document.querySelectorAll('.message-item').forEach(msg => observer.observe(msg));
            }
        },
        
        _attachConversationListeners: function() {
            document.addEventListener('click', (e) => {
                const conversationItem = e.target.closest('.conversation-item');
                if (conversationItem && canSendUserMessages()) {
                    const conversationId = conversationItem.dataset.conversationId;
                    if (conversationId) {
                        ConversationManager.openConversation(conversationId);
                    }
                }
            });
        },
        
        _attachFriendListeners: function() {
            document.addEventListener('click', (e) => {
                const friendItem = e.target.closest('.friend-item');
                if (friendItem && canSendUserMessages()) {
                    const friendId = friendItem.dataset.friendId;
                    if (friendId) {
                        ConversationManager.createConversation([friendId]);
                    }
                }
            });
        },
        
        dispatch: function(action, payload) {
            if (!canSendUserMessages()) {
                Logger.info('UIBridge', `⏳ Waiting for activation - cannot dispatch ${action}`);
                return;
            }
            
            switch (action) {
                case 'sendMessage':
                    MessageHandler.sendMessage(payload.text, payload.options);
                    break;
                case 'startTyping':
                    TypingManager.sendTyping(payload.conversationId, true);
                    break;
                case 'stopTyping':
                    TypingManager.sendTyping(payload.conversationId, false);
                    break;
                case 'openChat':
                    ConversationManager.openConversation(payload.conversationId, payload.options);
                    break;
                case 'markAsRead':
                    ConversationManager.markAsRead(payload.conversationId);
                    break;
                case 'createChat':
                    ConversationManager.createConversation(payload.participants, payload.options);
                    break;
                default:
                    Logger.warn('UIBridge', `Unknown action: ${action}`);
            }
        },
        
        getStats: function() {
            return {
                listeners: this._listeners.size,
                initialized: this._initialized
            };
        }
    }.init();

    // =============================================
    // MESSAGE DISPATCHER (PRESERVED, ADAPTED)
    // =============================================
    const MessageDispatcher = {
        _handlers: new Map(),
        _messageQueue: [],
        _processing: false,
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            
            ParentConnectionManager.on('*', (payload, raw) => {
                this.dispatch(raw.type, payload, raw);
            });
            
            this._initialized = true;
            Logger.info('MessageDispatcher', 'Initialized');
            return this;
        },
        
        registerHandler: function(type, handler) {
            if (!this._handlers.has(type)) {
                this._handlers.set(type, new Set());
            }
            this._handlers.get(type).add(handler);
            return () => this.unregisterHandler(type, handler);
        },
        
        unregisterHandler: function(type, handler) {
            if (this._handlers.has(type)) {
                this._handlers.get(type).delete(handler);
            }
        },
        
        dispatch: function(type, payload, raw) {
            if (!type) return;
            
            if (this._handlers.has(type)) {
                const handlers = this._handlers.get(type);
                handlers.forEach(handler => {
                    try {
                        handler(payload, raw);
                    } catch (error) {
                        Logger.error('MessageDispatcher', `Handler error for ${type}`, error);
                    }
                });
            }
            
            if (this._handlers.has('*')) {
                const handlers = this._handlers.get('*');
                handlers.forEach(handler => {
                    try {
                        handler(payload, raw);
                    } catch (error) {
                        Logger.error('MessageDispatcher', `Wildcard handler error for ${type}`, error);
                    }
                });
            }
        },
        
        dispatchToParent: function(type, payload = {}, options = {}) {
            return ParentConnectionManager.send(type, payload, options);
        },
        
        getStats: function() {
            return {
                registeredHandlers: this._handlers.size,
                queuedMessages: this._messageQueue.length
            };
        }
    }.init();

    // =============================================
    // MODULE LIFECYCLE CONTROLLER - STRICT PARENT AUTHORITY
    // =============================================
    const ModuleLifecycleController = {
        _startTime: null,
        _state: 'stopped',
        _initialized: false,
        _listeners: new Set(),
        
        init: function() {
            if (this._initialized) return this;
            this._initialized = true;
            Logger.info('ModuleLifecycleController', 'Initialized');
            return this;
        },
        
        start: async function() {
            if (this._state === 'running') return;
            
            this._state = 'starting';
            this._startTime = Date.now();
            this._notifyListeners('starting');
            
            Logger.info('ModuleLifecycleController', 'Starting module');
            
            await this._executeStartSequence();
        },
        
        _executeStartSequence: async function() {
            // BOOTING → INITIALIZING
            setState(LIFECYCLE_STATES.INITIALIZING, 'start_sequence');
            
            // Initialize all subsystems (no timeouts, just initialization)
            SecurityValidator.init();
            ParentConnectionManager.init();
            MessageDispatcher.init();
            ReliabilityLayer.init();
            SessionClient.init();
            HeartbeatClient.init();
            
            // Load cached data but don't activate UI yet
            await loadCachedData();
            
            // INITIALIZING → READY
            setState(LIFECYCLE_STATES.READY, 'initialization_complete');
            
            // Mark as running
            this._state = 'running';
            this._notifyListeners('running');
            
            Logger.success('ModuleLifecycleController', `Module ready in ${Date.now() - this._startTime}ms`);
            
            // Send CHILD_READY exactly once at correct time
            ParentConnectionManager.notifyChildReady();
            
            // Wait for parent to activate us
            await parentReadyPromise;
            
            // UI will be initialized when PARENT_READY transitions to ACTIVE
        },
        
        stop: function() {
            if (this._state === 'stopped') return;
            
            this._state = 'stopping';
            this._notifyListeners('stopping');
            
            HeartbeatClient.reset();
            ParentConnectionManager.destroy();
            ReliabilityLayer.reset();
            
            resetLifecycle();
            
            this._state = 'stopped';
            this._notifyListeners('stopped');
            
            Logger.info('ModuleLifecycleController', 'Module stopped');
        },
        
        onStateChange: function(listener) {
            this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        },
        
        _notifyListeners: function(state) {
            this._listeners.forEach(listener => {
                try {
                    listener(state, this.getStats());
                } catch (e) {}
            });
        },
        
        getStats: function() {
            return {
                state: this._state,
                uptime: this._startTime ? Date.now() - this._startTime : 0,
                startTime: this._startTime
            };
        }
    }.init();

    // =============================================
    // MODULE CORE CONTROLLER - REGISTRY (PRESERVED)
    // =============================================
    const ModuleCoreController = {
        _version: MODULE_VERSION,
        _startTime: null,
        _modules: new Map(),
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            
            this._startTime = Date.now();
            this._registerModules();
            this._initialized = true;
            
            Logger.info('ModuleCoreController', `v${this._version} initialized`);
            return this;
        },
        
        _registerModules: function() {
            // Core modules
            this._modules.set('lifecycle', { getState: getLifecycleState });
            this._modules.set('security', SecurityValidator);
            this._modules.set('parentConnection', ParentConnectionManager);
            this._modules.set('messageDispatcher', MessageDispatcher);
            this._modules.set('reliability', ReliabilityLayer);
            this._modules.set('session', SessionClient);
            this._modules.set('heartbeat', HeartbeatClient);
            this._modules.set('moduleLifecycle', ModuleLifecycleController);
            
            // Data modules
            this._modules.set('sessionStore', SessionStore);
            this._modules.set('chat', ChatManager);
            this._modules.set('friends', FriendManager);
            this._modules.set('groups', GroupManager);
            this._modules.set('typing', TypingManager);
            this._modules.set('messageHandler', MessageHandler);
            this._modules.set('conversation', ConversationManager);
            
            // UI modules
            this._modules.set('uiState', UIStateManager);
            this._modules.set('uiBridge', UIBridge);
            this._modules.set('eventBus', EventBus);
            this._modules.set('uiFeatures', UIFeatures);
            
            // Utilities
            this._modules.set('safeStorage', SafeStorage);
            this._modules.set('securityUtils', SecurityUtils);
            this._modules.set('ackController', AckController);
            this._modules.set('messageTracker', MessageTracker);
        },
        
        start: function() {
            Logger.info('ModuleCoreController', 'Starting module');
            ModuleLifecycleController.start();
        },
        
        stop: function() {
            Logger.info('ModuleCoreController', 'Stopping module');
            ModuleLifecycleController.stop();
        },
        
        getModule: function(name) {
            return this._modules.get(name);
        },
        
        getStats: function() {
            const stats = {
                version: this._version,
                uptime: this._startTime ? Date.now() - this._startTime : 0,
                modules: Array.from(this._modules.keys()),
                lifecycle: getLifecycleState(),
                heartbeat: HeartbeatClient.getStats(),
                reliability: { pending: ReliabilityLayer.getPendingCount() },
                parentConnection: ParentConnectionManager.getStats(),
                messageDispatcher: MessageDispatcher.getStats(),
                session: SessionClient.getState(),
                uiBridge: UIBridge.getStats(),
                security: SECURITY.getSecurityReport()
            };
            
            return stats;
        },
        
        reset: function() {
            Logger.info('ModuleCoreController', 'Resetting module');
            ModuleLifecycleController.stop();
            
            // Reset everything
            resetLifecycle();
            ParentConnectionManager.reset();
            ReliabilityLayer.reset();
            SessionClient.clear();
            HeartbeatClient.reset();
            
            // Restart
            setTimeout(() => {
                ModuleLifecycleController.start();
            }, 100);
        }
    }.init();

    // =============================================
    // BOOT CONTROLLER (PRESERVED, ADAPTED)
    // =============================================
    const BootController = {
        _bootStartTime: null,
        _bootPromise: null,
        _bootResolve: null,
        
        init: function() {
            this._bootStartTime = Date.now();
            this._bootPromise = new Promise((resolve) => {
                this._bootResolve = resolve;
            });
            
            return this;
        },
        
        waitForBoot: function() {
            return this._bootPromise;
        },
        
        completeBoot: function() {
            if (this._bootResolve) {
                this._bootResolve({
                    success: true,
                    time: Date.now() - this._bootStartTime
                });
                this._bootResolve = null;
            }
        },
        
        isReady: function() {
            return currentState === LIFECYCLE_STATES.ACTIVE;
        },
        
        getState: function() {
            return getLifecycleState();
        }
    }.init();

    // =============================================
    // SAFE UI INITIALIZATION (ONLY WHEN ACTIVE)
    // =============================================
    function initializeUISafe() {
        if (currentState !== LIFECYCLE_STATES.ACTIVE) {
            Logger.info('UI', 'Delaying UI init until ACTIVE');
            return;
        }
        
        // Initialize UI modules only when ACTIVE
        UIBridge.init();
        
        // Notify that UI is ready
        EventBus.emit('ui:ready', { timestamp: Date.now() });
        
        Logger.success('UI', 'UI initialized');
    }
    
    function startDataFlow() {
        if (currentState !== LIFECYCLE_STATES.ACTIVE) {
            Logger.info('DataFlow', 'Delaying data flow until ACTIVE');
            return;
        }
        
        Logger.info('DataFlow', 'Starting data flow');
        
        // Now safe to fetch data
        ConversationManager.fetchConversations();
        
        // Request session with proper error handling
        SessionClient.requestSession()
            .then(() => {
                Logger.success('DataFlow', 'Session established');
            })
            .catch((error) => {
                Logger.warn('DataFlow', 'Session request failed - will retry later', error);
                // Schedule a retry after a delay
                setTimeout(() => {
                    if (currentState === LIFECYCLE_STATES.ACTIVE) {
                        SessionClient.requestSession().catch(e => {
                            Logger.error('DataFlow', 'Session retry failed', e);
                        });
                    }
                }, 5000);
            });
        
        restoreLastChat();
        
        Logger.success('DataFlow', 'Data flow started');
    }

    // =============================================
    // INITIALIZATION
    // =============================================
    async function initialize() {
        console.log(`[${MODULE_NAME}] 🚀 Messages Core v${MODULE_VERSION} (Parent Authority Architecture - Strict)`);
        
        try {
            // Set initial state
            setState(LIFECYCLE_STATES.BOOTING, 'initialization_start');
            
            // Start the module lifecycle
            ModuleCoreController.init();
            ModuleLifecycleController.start();
            
            // Listen for ACTIVE state to complete boot
            stateListeners.add((toState) => {
                if (toState === LIFECYCLE_STATES.ACTIVE) {
                    BootController.completeBoot();
                    console.log(`[${MODULE_NAME}] ✅ Module ACTIVE - UI and data flow ready`);
                }
            });
            
            console.log(`[${MODULE_NAME}] ✅ Initialized - waiting for parent`);
            
        } catch (error) {
            console.error(`[${MODULE_NAME}] Initialization error:`, error);
        }
    }
    
    async function loadCachedData() {
        try {
            const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (cachedUser) {
                SessionStore.setUser(cachedUser);
            }
            
            const cachedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cachedChats?.conversations) {
                ChatManager.setConversations(cachedChats.conversations);
            }
            
            const cachedFriends = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
            if (cachedFriends?.friends) {
                FriendManager.setFriends(cachedFriends.friends);
            }
            
            const uiState = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.UI_STATE);
            if (uiState?.lastChatId) {
                SafeStorage.set('lastChatId', uiState.lastChatId);
            }
        } catch (error) {}
    }
    
    function restoreLastChat() {
        // Only restore if ACTIVE
        if (currentState !== LIFECYCLE_STATES.ACTIVE) return;
        
        const lastChatId = SafeStorage.get('lastChatId');
        if (lastChatId) {
            const conversation = ChatManager.getConversation(lastChatId);
            if (conversation) {
                ConversationManager.openConversation(lastChatId);
            }
        }
    }

    // =============================================
    // CLEANUP (PRESERVED)
    // =============================================
    window.addEventListener('beforeunload', () => {
        if (ChatManager.getActiveChat()) {
            const input = document.getElementById('messageInput');
            if (input && input.value.trim()) {
                UIStateManager.saveDraft(ChatManager.getActiveChat().id, input.value.trim());
            }
        }
        
        TypingManager.stopTyping();
        
        if (ChatManager.getActiveChat()) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, ChatManager.getMessages());
        }
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { 
            conversations: ChatManager.getConversations(), 
            timestamp: Date.now() 
        });
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
            friends: FriendManager.getFriends(),
            timestamp: Date.now()
        });
        
        // Don't stop heartbeat - parent handles it
    });

    // =============================================
    // PUBLIC API (PRESERVED, ADAPTED)
    // =============================================
    const MessagesCore = {
        version: MODULE_VERSION,
        
        // Core modules
        SessionStore,
        ChatManager,
        FriendManager,
        GroupManager,
        ParentConnectionManager,
        EventBus,
        Security: SECURITY,
        
        // New subsystems
        SecurityValidator,
        ReliabilityLayer,
        SessionClient,
        MessageDispatcher,
        HeartbeatClient,
        UIBridge,
        ModuleLifecycleController,
        ModuleCoreController,
        
        // Feature modules
        MessageHandler,
        ConversationManager,
        TypingManager,
        UIStateManager,
        UIFeatures,
        
        // Utilities
        SecurityUtils,
        SafeStorage,
        Logger,
        
        // State
        getState: getLifecycleState,
        isReady: () => currentState === LIFECYCLE_STATES.ACTIVE,
        isCoreReady: () => currentState === LIFECYCLE_STATES.ACTIVE,
        getCurrentUser: () => SessionStore.getUser(),
        getCurrentConversation: () => ChatManager.getActiveChat(),
        getConversations: () => ChatManager.getConversations(),
        getMessages: () => ChatManager.getMessages(),
        getFriends: () => FriendManager.getFriendListForChat(),
        
        // Security
        getSecurityReport: () => SECURITY.getSecurityReport(),
        
        // Subscriptions
        subscribe: (callback) => stateListeners.add(callback),
        on: (event, callback) => EventBus.on(event, callback),
        off: (event, callback) => EventBus.off(event, callback),
        once: (event, callback) => EventBus.once(event, callback),
        
        // Message actions
        sendMessage: (content, options) => MessageHandler.sendMessage(content, options),
        retryMessage: (messageId) => MessageHandler.retryMessage(messageId),
        deleteMessage: (messageId, forEveryone) => MessageHandler.deleteMessage(messageId, forEveryone),
        editMessage: (messageId, newContent) => MessageHandler.editMessage(messageId, newContent),
        addReaction: (messageId, emoji, add) => MessageHandler.addReaction(messageId, emoji, add),
        forwardMessage: (messageId, targetConversationIds) => MessageHandler.forwardMessage(messageId, targetConversationIds),
        reportMessage: (messageId, reason) => MessageHandler.reportMessage(messageId, reason),
        searchMessages: (conversationId, query, options) => MessageHandler.searchMessages(conversationId, query, options),
        
        // Conversation actions
        openConversation: (conversationId, options) => ConversationManager.openConversation(conversationId, options),
        fetchMessages: (conversationId, options) => ConversationManager.fetchMessages(conversationId, options),
        fetchConversations: () => ConversationManager.fetchConversations(),
        markAsRead: (conversationId) => ConversationManager.markAsRead(conversationId),
        createConversation: (participants, options) => ConversationManager.createConversation(participants, options),
        archiveConversation: (conversationId, archived) => ConversationManager.archiveConversation(conversationId, archived),
        blockUser: (userId, block) => ConversationManager.blockUser(userId, block),
        
        // Typing
        sendTyping: (conversationId, isTyping) => TypingManager.sendTyping(conversationId, isTyping),
        stopTyping: () => TypingManager.stopTyping(),
        getTypingUsers: (conversationId) => TypingManager.getTypingUsersForConversation(conversationId),
        
        // UI State
        UI: {
            saveDraft: (conversationId, text, attachment) => UIStateManager.saveDraft(conversationId, text, attachment),
            getDraft: (conversationId) => UIStateManager.getDraft(conversationId),
            clearDraft: (conversationId) => UIStateManager.clearDraft(conversationId),
            
            setChatTheme: (conversationId, theme) => UIStateManager.setChatTheme(conversationId, theme),
            getChatTheme: (conversationId) => UIStateManager.getChatTheme(conversationId),
            
            toggleStarred: (messageId) => UIStateManager.toggleStarred(messageId),
            isStarred: (messageId) => UIStateManager.isStarred(messageId),
            getStarredMessages: () => UIStateManager.getStarredMessages(),
            
            updateSettings: (settings) => UIStateManager.updateSettings(settings),
            getSettings: () => UIStateManager.getSettings()
        },
        
        // UI Features
        features: UIFeatures,
        
        // Formatting utilities
        formatMessageText: UIFeatures.formatMessageText,
        formatTime: UIFeatures.formatTime,
        formatDate: UIFeatures.formatDate,
        formatDateTime: UIFeatures.formatDateTime,
        formatFileSize: UIFeatures.formatFileSize,
        escapeHtml: SecurityUtils.escapeHtml,
        escapeRegex: SecurityUtils.escapeRegex,
        sanitizeString: SecurityUtils.sanitizeString,
        
        // Pending count
        getPendingMessageCount: () => MessageHandler.getPendingCount(),
        
        // Send raw action
        sendAction: (type, payload, options) => ParentConnectionManager.send(type, payload, options),
        sendActionWithResponse: (type, payload) => ParentConnectionManager.sendWithResponse(type, payload),
        
        // Wait for boot
        waitForBoot: () => BootController.waitForBoot(),
        
        // Stats
        getStats: () => ModuleCoreController.getStats(),
        
        // Reset
        reset: () => ModuleCoreController.reset(),
        
        // Debug
        debug: {
            getState: getLifecycleState,
            ParentConnectionManager,
            AckController,
            MessageTracker,
            SafeStorage,
            Security: SECURITY,
            HeartbeatClient
        }
    };

    // Expose globally
    window.MessagesCore = MessagesCore;
    window.__MODULE_NAME__ = MODULE_NAME;
    window.__MODULE_VERSION__ = MODULE_VERSION;
    
    // Auto-initialize
    initialize();

    // Export for module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MessagesCore;
    }
})();