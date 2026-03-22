// =============================================
// MESSAGES CORE - v7.6.0 (DETERMINISTIC PARENT-CONTROLLED PROTOCOL)
// UI-ONLY MODULE | STANDARDIZED COMMUNICATION PROTOCOL
// STRICT LIFECYCLE ENFORCEMENT | NO RETRY LOOPS | NO FALLBACKS
// WAIT_PARENT IS HARD DEAD STOP | NO AUTONOMOUS OPERATION
// COMPLETE REAL-TIME MESSAGE FLOW WITH PARENT SYNCHRONIZATION
// =============================================
(function() {
    'use strict';

    // =============================================
    // MODULE IDENTIFICATION
    // =============================================
    const MODULE_NAME = 'messages';
    const MODULE_VERSION = '7.6.0';
    
    // =============================================
    // DEBUG MODE (DISABLED IN PRODUCTION)
    // =============================================
    const DEBUG = false;
    const ALLOWED_LOGS = new Set(['INIT', 'READY', 'ERROR', 'STATE_CHANGE', 'HANDSHAKE', 'LIFECYCLE_GUARD', 'SESSION']);
    
    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }

    // =============================================
    // LIFECYCLE GUARD UTILITIES
    // =============================================
    
    // Safe check if we can send CHILD_READY (only when state is READY)
    if (typeof window.__lifecycleCanSendChildReady !== 'function') {
        window.__lifecycleCanSendChildReady = function(state) {
            return state === LIFECYCLE_STATES.READY;
        };
    }
    
    // Safe check if we can perform user actions (only when state is ACTIVE)
    if (typeof window.__lifecycleCanPerformAction !== 'function') {
        window.__lifecycleCanPerformAction = function(state) {
            return state === LIFECYCLE_STATES.ACTIVE;
        };
    }
    
    // Safe CHILD_READY sender - EXACTLY ONCE, NO RETRY
    if (typeof window.__safeSendChildReady !== 'function' && typeof window.safeSendChildReady !== 'function') {
        window.__safeSendChildReady = function(originalSendFn, moduleName) {
            let sent = false;
            
            return function() {
                if (sent) {
                    console.log(`[${moduleName}][LifecycleGuard] CHILD_READY already sent, skipping duplicate`);
                    return false;
                }
                
                if (!window.__lifecycleCanSendChildReady(currentState)) {
                    console.warn(`[${moduleName}][LifecycleGuard] Cannot send CHILD_READY in state: ${currentState}`);
                    return false;
                }
                
                console.log(`[${moduleName}][Lifecycle] Sending CHILD_READY (state: ${currentState})`);
                originalSendFn();
                sent = true;
                return true;
            };
        };
    }
    
    // Safe action guard (blocks actions when not ACTIVE)
    if (typeof window.__guardAction !== 'function') {
        window.__guardAction = function(actionName, moduleName, state, fallbackReturn = false) {
            if (!window.__lifecycleCanPerformAction(state)) {
                console.warn(`[${moduleName}][LifecycleGuard] Blocked action '${actionName}' - not ACTIVE (current: ${state})`);
                return fallbackReturn;
            }
            return null;
        };
    }

    // =============================================
    // TIMING CONSTANTS
    // =============================================
    const TIMING = {
        CLEANUP_INTERVAL: 60000,
        MAX_QUEUE_SIZE: 500,
        TYPING_TIMEOUT: 3000,
        TYPING_RATE_LIMIT: 2000
        // NO RETRY CONSTANTS - removed per deterministic protocol
        // NO HANDSHAKE_RETRY_INTERVAL - removed
        // NO MAX_MESSAGE_RETRIES - removed
        // NO MAX_SESSION_RETRIES - removed
    };

    // =============================================
    // LIFECYCLE STATE MACHINE (STRICT DETERMINISTIC)
    // =============================================
    const LIFECYCLE_STATES = {
        BOOT: 'BOOT',
        INITIALIZING: 'INITIALIZING',
        READY: 'READY',
        WAIT_PARENT: 'WAIT_PARENT',
        ACTIVE: 'ACTIVE'
    };

    let currentState = LIFECYCLE_STATES.BOOT;
    let childReadySent = false;
    let parentReadyReceived = false;
    let parentReadyData = null;
    let stateHistory = [];
    const maxHistorySize = 50;
    const stateListeners = new Set();
    const processedMessageIds = new Set();
    const sentMessageIds = new Set();
    
    // Parent ready promise
    let parentReadyResolver;
    let parentReadyPromise = new Promise((resolve) => {
        parentReadyResolver = resolve;
    });

    // =============================================
    // MESSAGE QUEUE SYSTEM (ONLY DURING WAIT_PARENT)
    // =============================================
    const messageQueue = [];
    let processingQueue = false;

    function setState(nextState, reason = '') {
        if (currentState === nextState) return true;

        const validTransitions = {
            [LIFECYCLE_STATES.BOOT]: [LIFECYCLE_STATES.INITIALIZING],
            [LIFECYCLE_STATES.INITIALIZING]: [LIFECYCLE_STATES.READY],
            [LIFECYCLE_STATES.READY]: [LIFECYCLE_STATES.WAIT_PARENT],
            [LIFECYCLE_STATES.WAIT_PARENT]: [LIFECYCLE_STATES.ACTIVE],
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

        console.log(`[${MODULE_NAME}] State: ${fromState} → ${nextState}${reason ? ` (${reason})` : ''}`);

        notifyStateListeners(nextState, fromState, reason);
        
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
        
        if (processedMessageIds.size > 1000) {
            processedMessageIds.clear();
        }
        return false;
    }
    
    function isDuplicateSentMessage(messageId) {
        if (!messageId) return false;
        if (sentMessageIds.has(messageId)) return true;
        sentMessageIds.add(messageId);
        
        if (sentMessageIds.size > 1000) {
            sentMessageIds.clear();
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
        currentState = LIFECYCLE_STATES.BOOT;
        childReadySent = false;
        parentReadyReceived = false;
        parentReadyData = null;
        stateHistory = [];
        processedMessageIds.clear();
        sentMessageIds.clear();
        messageQueue.length = 0;
        
        parentReadyPromise = new Promise((resolve) => {
            parentReadyResolver = resolve;
        });
    }

    // =============================================
    // SECURITY CONSTANTS
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
        
        ESSENTIAL_TYPES: new Set([
            'PARENT_READY',
            'MODULE_REGISTERED',
            'SESSION_SYNC',
            'SESSION_DATA',
            'HEARTBEAT',
            'ACK',
            'ERROR',
            'CHILD_READY',
            'MESSAGE_ACK',
            'MESSAGE_RECEIVE'
        ]),
        
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
            if (currentState === LIFECYCLE_STATES.BOOT || 
                currentState === LIFECYCLE_STATES.INITIALIZING ||
                currentState === LIFECYCLE_STATES.READY ||
                currentState === LIFECYCLE_STATES.WAIT_PARENT) {
                return true;
            }
            
            if (!origin || origin === 'null') return true;
            return this.ALLOWED_ORIGINS.has(origin) || 
                   origin === window.location.origin ||
                   origin.startsWith('http://localhost:') ||
                   origin.startsWith('http://127.0.0.1:');
        },
        
        isEssentialMessage: function(type) {
            return this.ESSENTIAL_TYPES.has(type);
        },
        
        isUserAction: function(type) {
            return this.USER_ACTIONS.has(type);
        },
        
        canSendMessage: function(type, lifecycleState) {
            if (this.isEssentialMessage(type)) return true;
            if (this.isUserAction(type)) {
                return lifecycleState === LIFECYCLE_STATES.ACTIVE;
            }
            if (type === 'REGISTER_MODULE') {
                return lifecycleState === LIFECYCLE_STATES.INITIALIZING || 
                       lifecycleState === LIFECYCLE_STATES.READY;
            }
            if (type === 'CHILD_READY') {
                return lifecycleState === LIFECYCLE_STATES.READY && !childReadySent;
            }
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

    if (ENV.parentOrigin !== '*' && ENV.parentOrigin) {
        SECURITY.ALLOWED_ORIGINS.add(ENV.parentOrigin);
    }

    // =============================================
    // ID GENERATION UTILITIES
    // =============================================
    function generateMessageId() {
        return 'msg_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    }

    function generateRequestId() {
        return 'req_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    }

    // =============================================
    // CORE MESSAGE SENDER (NO RETRY)
    // =============================================
    function sendMessage(type, payload = {}, options = {}) {
        // GUARD: Block if not ACTIVE for user actions
        if (SECURITY.isUserAction(type) && !window.__lifecycleCanPerformAction(currentState)) {
            console.warn(`[${MODULE_NAME}][LifecycleGuard] Blocked message type '${type}' - not ACTIVE (current: ${currentState})`);
            return { success: false, blocked: true, reason: `not_active:${currentState}` };
        }
        
        const id = options.id || generateMessageId();
        const requestId = options.requestId || generateRequestId();
        const timestamp = Date.now();
        
        // Prevent duplicate message sending
        if (isDuplicateSentMessage(id)) {
            console.warn(`[${MODULE_NAME}] Duplicate message prevented: ${id}`);
            return { success: false, blocked: true, reason: 'duplicate_message' };
        }
        
        const message = {
            id: id,
            type: type,
            source: MODULE_NAME,
            target: 'parent',
            requestId: requestId,
            payload: payload,
            timestamp: timestamp,
            messageId: id
        };

        const required = ['id', 'type', 'source', 'target', 'requestId', 'payload', 'timestamp'];
        for (const field of required) {
            if (!message[field]) {
                console.error(`[${MODULE_NAME}] Invalid message: missing ${field}`, message);
                return { success: false, error: `missing_${field}` };
            }
        }

        if (message.source !== MODULE_NAME) {
            console.error(`[${MODULE_NAME}] Invalid source: ${message.source}`, message);
            return { success: false, error: 'invalid_source' };
        }

        if (message.target !== 'parent') {
            console.error(`[${MODULE_NAME}] Invalid target: ${message.target}`, message);
            return { success: false, error: 'invalid_target' };
        }

        if (payload && typeof payload === 'object') {
            message.payload = SecurityUtils.sanitizePayload(payload);
        }

        debugLog(`[${MODULE_NAME}] Sending message:`, message);

        // Queue if in WAIT_PARENT - HARD BLOCK STATE
        if (currentState === LIFECYCLE_STATES.WAIT_PARENT && !SECURITY.isEssentialMessage(type)) {
            messageQueue.push(message);
            debugLog(`[${MODULE_NAME}] Queued message (WAIT_PARENT): ${type}`);
            return { success: true, queued: true, id, requestId };
        }

        // Block if not ACTIVE for user actions
        if (SECURITY.isUserAction(type) && currentState !== LIFECYCLE_STATES.ACTIVE) {
            console.warn(`[${MODULE_NAME}] Cannot send ${type} - not ACTIVE (${currentState})`);
            return { success: false, blocked: true, reason: `not_active:${currentState}` };
        }

        return sendMessageImmediate(message);
    }

    function sendMessageImmediate(message) {
        try {
            if (!window.parent || window.parent === window) {
                throw new Error('No parent window');
            }

            window.parent.postMessage(message, '*');
            
            return { 
                success: true, 
                id: message.id, 
                requestId: message.requestId,
                timestamp: message.timestamp 
            };
        } catch (error) {
            console.error(`[${MODULE_NAME}] Send failed:`, error);
            return { success: false, error: error.message };
        }
    }

    // =============================================
    // SAFE SEND (NO RETRY)
    // =============================================
    function safeSend(type, payload = {}, options = {}) {
        if (SECURITY.isUserAction(type)) {
            const guardResult = window.__guardAction(type, MODULE_NAME, currentState, { success: false, blocked: true, reason: `invalid_state:${currentState}` });
            if (guardResult !== null) {
                return guardResult;
            }
        }
        
        if (!SECURITY.canSendMessage(type, currentState)) {
            console.warn(`[${MODULE_NAME}] Cannot send ${type} in state ${currentState}`);
            return { success: false, blocked: true, reason: `invalid_state:${currentState}` };
        }

        return sendMessage(type, payload, options);
    }

    function flushMessageQueue() {
        if (processingQueue || messageQueue.length === 0) return;
        if (currentState !== LIFECYCLE_STATES.ACTIVE) {
            console.log(`[${MODULE_NAME}] Cannot flush queue - not ACTIVE (${currentState})`);
            return;
        }
        
        processingQueue = true;
        
        while (messageQueue.length > 0) {
            const queuedMessage = messageQueue.shift();
            try {
                window.parent.postMessage(queuedMessage, '*');
                debugLog(`[${MODULE_NAME}] Flushed queued message: ${queuedMessage.type}`);
            } catch (error) {
                console.error(`[${MODULE_NAME}] Failed to flush queued message:`, error);
            }
        }
        
        processingQueue = false;
    }

    // =============================================
    // MESSAGE TYPES
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
        MESSAGE_ACK: 'MESSAGE_ACK',
        MESSAGE_RECEIVE: 'MESSAGE_RECEIVE',
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
        MODULE_DEGRADED: 'MODULE_DEGRADED',
        VERIFY_RESPONSE: 'VERIFY_RESPONSE',
        MODULE_HEARTBEAT: 'MODULE_HEARTBEAT'
    };

    // =============================================
    // OUTGOING ACTIONS
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
    // LOCAL STORAGE KEYS (FOR UI STATE ONLY - NEVER TOKENS)
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
    // SECURITY UTILITIES
    // =============================================
    const SecurityUtils = {
        messageIdCounter: 0,

        validateOrigin: function(origin) {
            return SECURITY.validateOrigin(origin);
        },

        generateMessageId: function() {
            return generateMessageId();
        },

        generateRequestId: function() {
            return generateRequestId();
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
            const required = ['id', 'type', 'source', 'target', 'requestId', 'timestamp'];
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
                     message.type && 
                     message.source && 
                     message.target && 
                     message.timestamp);
        }
    };

    // =============================================
    // MESSAGE ID CACHE
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
    // LOGGER
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
    // SAFE STORAGE LAYER (UI STATE ONLY - NEVER TOKENS)
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
    // SECURITY VALIDATOR
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
            if (!SECURITY.validateOrigin(event.origin)) {
                return { valid: false, reason: 'invalid_origin' };
            }
            
            if (!SecurityUtils.validateMessageStructure(event.data)) {
                return { valid: false, reason: 'invalid_structure' };
            }
            
            const data = event.data;
            
            if (data.source && data.source !== 'parent') {
                return { valid: false, reason: 'invalid_source' };
            }
            
            if (data.target && data.target !== MODULE_NAME && data.target !== 'all' && data.target !== '*') {
                return { valid: false, reason: 'wrong_target' };
            }
            
            if (data.messageId && isDuplicateMessage(data.messageId)) {
                return { valid: false, reason: 'duplicate_message' };
            }
            
            return { valid: true, data };
        },
        
        validateOutgoingMessage: function(message, lifecycleState) {
            if (!SECURITY.canSendMessage(message.type, lifecycleState)) {
                return { 
                    valid: false, 
                    reason: `message_not_allowed_in_state:${lifecycleState}` 
                };
            }
            
            if (!SecurityUtils.validateMessageSchema(message)) {
                return { valid: false, reason: 'invalid_schema' };
            }
            
            return { valid: true };
        }
    }.init();

    // =============================================
    // SESSION MANAGER (MEMORY ONLY - NO STORAGE)
    // =============================================
    const SessionManager = {
        _session: {
            token: null,
            user: null,
            expiresAt: null,
            authenticated: false
        },
        _sessionReady: false,
        _listeners: new Set(),
        _initialized: false,

        init: function() {
            if (this._initialized) return this;
            this._initialized = true;
            Logger.info('SessionManager', 'Initialized (memory-only session)');
            return this;
        },

        setSession: function(sessionData) {
            if (sessionData && sessionData.token) {
                this._session.token = sessionData.token;
                this._session.user = sessionData.user || null;
                this._session.expiresAt = sessionData.expiresAt || null;
                this._session.authenticated = true;
                this._sessionReady = true;
                
                Logger.success('SessionManager', 'Session established', { 
                    authenticated: true,
                    userId: this._session.user?.id
                });
                
                if (sessionData.user) {
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, sessionData.user);
                }
                
                this._notifyListeners();
                
                window.dispatchEvent(new CustomEvent('sessionUpdated', {
                    detail: { 
                        authenticated: true,
                        user: this._session.user
                    }
                }));
                
                startDataFlow();
            } else {
                Logger.warn('SessionManager', 'Invalid session data - no token');
                this._session.authenticated = false;
                this._sessionReady = false;
            }
        },

        getToken: function() {
            return this._session.token;
        },

        getUser: function() {
            return this._session.user ? { ...this._session.user } : null;
        },

        isAuthenticated: function() {
            return this._session.authenticated && !!this._session.token;
        },

        isSessionReady: function() {
            return this._sessionReady;
        },

        clear: function() {
            this._session = {
                token: null,
                user: null,
                expiresAt: null,
                authenticated: false
            };
            this._sessionReady = false;
            
            this._notifyListeners();
            Logger.info('SessionManager', 'Session cleared');
        },

        subscribe: function(callback) {
            this._listeners.add(callback);
            return () => this._listeners.delete(callback);
        },

        _notifyListeners: function() {
            const sessionInfo = {
                authenticated: this._session.authenticated,
                user: this._session.user,
                ready: this._sessionReady
            };
            
            this._listeners.forEach(cb => {
                try { cb(sessionInfo); } catch (e) {}
            });
        },

        getState: function() {
            return {
                authenticated: this._session.authenticated,
                ready: this._sessionReady,
                userId: this._session.user?.id,
                hasToken: !!this._session.token
            };
        }
    }.init();

    // =============================================
    // PARENT CONNECTION MANAGER (DETERMINISTIC HANDSHAKE)
    // =============================================
    const ParentConnectionManager = {
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
        
        init: function() {
            if (this._initialized) return this;
            
            this._setupMessageListener();
            this._initialized = true;
            
            setInterval(() => this._processQueue(), 5000);
            
            Logger.info('ParentConnectionManager', 'Initialized');
            return this;
        },
        
        _setupMessageListener: function() {
            window.addEventListener('message', (event) => {
                if (!SECURITY.validateOrigin(event.origin)) {
                    if (DEBUG) console.log(`[${MODULE_NAME}] Rejected message from origin: ${event.origin}`);
                    return;
                }
                
                setTimeout(() => this._handleIncomingMessage(event), 0);
            }, true);
        },
        
        _handleIncomingMessage: function(event) {
            const validation = SecurityValidator.validateIncomingMessage(event);
            if (!validation.valid) {
                if (DEBUG) console.log(`[${MODULE_NAME}] Rejected message:`, validation.reason);
                return;
            }
            
            const data = validation.data;
            
            if (data.messageId && MessageIdCache.has(data.messageId)) {
                return;
            }
            if (data.messageId) {
                MessageIdCache.add(data.messageId);
            }
            
            // Handle PARENT_READY - DETERMINISTIC: Only activate if in WAIT_PARENT
            if (data.type === INCOMING_TYPES.PARENT_READY || data.type === INCOMING_TYPES.coreReady) {
                this._handleParentReady(data);
            }
            
            // Handle MESSAGE_ACK - Update message status
            if (data.type === INCOMING_TYPES.MESSAGE_ACK) {
                this._handleMessageAck(data);
            }
            
            // Handle MESSAGE_RECEIVE - Incoming message from parent
            if (data.type === INCOMING_TYPES.MESSAGE_RECEIVE || data.type === INCOMING_TYPES.NEW_MESSAGE) {
                this._handleMessageReceive(data);
            }
            
            // Handle SESSION_DATA
            if (data.type === INCOMING_TYPES.SESSION_DATA || data.type === INCOMING_TYPES.SESSION_RESPONSE) {
                this._handleSessionData(data);
            }
            
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
        },
        
        _handleParentReady: function(data) {
            if (parentReadyReceived) {
                console.log(`[${MODULE_NAME}] Duplicate PARENT_READY ignored`);
                return;
            }
            
            // Validate PARENT_READY structure
            if (!data.module || data.module !== MODULE_NAME) {
                console.warn(`[${MODULE_NAME}] Invalid PARENT_READY - module mismatch`);
                return;
            }
            
            console.log(`[${MODULE_NAME}] PARENT_READY received`);
            
            parentReadyReceived = true;
            parentReadyData = data.payload || data;
            
            if (parentReadyResolver) {
                parentReadyResolver();
                parentReadyResolver = null;
            }
            
            // Transition to ACTIVE ONLY from WAIT_PARENT
            if (currentState === LIFECYCLE_STATES.WAIT_PARENT) {
                setState(LIFECYCLE_STATES.ACTIVE, 'parent_ready_received');
                
                // Initialize UI after activation
                initializeUISafe();
                
                console.log(`[${MODULE_NAME}] ACTIVE`);
                
                // Set session if provided in PARENT_READY
                if (parentReadyData.session) {
                    SessionManager.setSession(parentReadyData.session);
                }
                
                // Flush queued messages
                flushMessageQueue();
            } else {
                console.log(`[${MODULE_NAME}] PARENT_READY received in state: ${currentState} - ignoring (expected WAIT_PARENT)`);
            }
        },
        
        _handleMessageAck: function(data) {
            const { messageId, status, payload } = data.payload || data;
            
            if (!messageId) return;
            
            Logger.info('ParentConnectionManager', `Message ACK: ${messageId} - ${status}`);
            
            // Update message status in UI
            MessageHandler.updateMessageStatus(messageId, status, payload);
            
            // Dispatch event for UI update
            window.dispatchEvent(new CustomEvent('messageStatusUpdated', {
                detail: { messageId, status, payload }
            }));
        },
        
        _handleMessageReceive: function(data) {
            const message = data.payload || data;
            
            if (!message || !message.id) {
                Logger.warn('ParentConnectionManager', 'Invalid incoming message');
                return;
            }
            
            // Prevent duplicate processing
            if (isDuplicateMessage(message.id)) {
                Logger.debug('ParentConnectionManager', `Duplicate message ignored: ${message.id}`);
                return;
            }
            
            Logger.info('ParentConnectionManager', `Message received: ${message.id}`);
            
            // Add to chat manager
            ChatManager.addMessage({
                ...message,
                status: message.status || 'delivered'
            });
            
            // Play notification if needed
            if (message.senderId !== SessionManager.getUser()?.id) {
                UIFeatures.playNotificationSound();
            }
            
            // Dispatch event for UI
            window.dispatchEvent(new CustomEvent('newMessage', {
                detail: { message }
            }));
        },
        
        _handleSessionData: function(data) {
            const sessionData = data.payload || data;
            Logger.info('ParentConnectionManager', 'Received session data from parent');
            
            if (sessionData && sessionData.token) {
                SessionManager.setSession(sessionData);
            }
        },
        
        send: function(type, payload = {}, options = {}) {
            return safeSend(type, payload, options);
        },
        
        sendHeartbeatAck: function(inResponseTo) {
            safeSend(OUTGOING_ACTIONS.HEARTBEAT_ACK, {
                inResponseTo: inResponseTo,
                timestamp: Date.now()
            }, { requireAck: false });
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
            if (currentState !== LIFECYCLE_STATES.ACTIVE) return;
            
            this._processingQueue = true;
            
            const now = Date.now();
            const oneHour = 3600000;
            
            const freshQueue = this._outboundQueue.filter(item => 
                now - item.timestamp < oneHour
            );
            
            for (const item of freshQueue) {
                try {
                    window.parent.postMessage(item.message, '*');
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
                console.log(`[${MODULE_NAME}] CHILD_READY already sent, skipping duplicate`);
                return;
            }
            
            if (currentState !== LIFECYCLE_STATES.READY) {
                console.warn(`[${MODULE_NAME}] Cannot send CHILD_READY in state: ${currentState} (expected READY)`);
                return;
            }
            
            const result = safeSend(OUTGOING_ACTIONS.CHILD_READY, {
                module: MODULE_NAME,
                version: MODULE_VERSION,
                frameId: this.getFrameId(),
                ready: true,
                timestamp: Date.now()
            }, { requireAck: false });
            
            if (!result.blocked) {
                childReadySent = true;
                setState(LIFECYCLE_STATES.WAIT_PARENT, 'child_ready_sent');
                console.log(`[${MODULE_NAME}] CHILD_READY sent`);
                console.log(`[${MODULE_NAME}] WAIT_PARENT`);
            } else {
                Logger.error('ParentConnectionManager', 'Failed to send CHILD_READY', result);
            }
        },
        
        isConnected: function() {
            return currentState === LIFECYCLE_STATES.ACTIVE;
        },
        
        getProtocol: function() {
            return this._protocol;
        },
        
        getStats: function() {
            return {
                queued: this._outboundQueue.length,
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
    // HEARTBEAT CLIENT
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
            Logger.info('HeartbeatClient', 'Initialized');
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
    // SESSION STORE (UI ONLY)
    // =============================================
    const SessionStore = {
        _user: null,
        _userId: null,
        _listeners: new Set(),
        
        init: function() {
            const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (cachedUser) {
                this._user = cachedUser;
                this._userId = cachedUser.id;
            }
            return this;
        },
        
        setUser: function(user) {
            if (!user) return false;
            
            this._user = { ...user };
            this._userId = user.id || user.uid || null;
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._user);
            
            this._notifyListeners();
            return true;
        },
        
        getUser: function() {
            return this._user ? { ...this._user } : null;
        },
        
        getUserId: function() {
            return this._userId;
        },
        
        clear: function() {
            this._user = null;
            this._userId = null;
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
    // CHAT MANAGER
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
    // FRIEND MANAGER
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
    // GROUP MANAGER
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
    // TYPING MANAGER
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
            
            const guardResult = window.__guardAction('sendTyping', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            const now = Date.now();
            
            if (isTyping) {
                if (now - this._lastTypingTime < TIMING.TYPING_RATE_LIMIT) return false;
                this._lastTypingTime = now;
            }
            
            const result = safeSend(
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
                        safeSend(OUTGOING_ACTIONS.STOP_TYPING, { conversationId }, { requireAck: false });
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
                safeSend(OUTGOING_ACTIONS.STOP_TYPING, {
                    conversationId: ChatManager.getActiveChat().id
                }, { requireAck: false });
            }
        }
    };

    // =============================================
    // MESSAGE HANDLER (NO RETRY, PARENT-ACKNOWLEDGED)
    // =============================================
    const MessageHandler = {
        _optimisticMessages: new Map(),
        _pendingRequests: new Map(),
        
        sendMessage: function(content, options = {}) {
            const guardResult = window.__guardAction('sendMessage', MODULE_NAME, currentState, { success: false, error: 'module_not_active' });
            if (guardResult !== null) {
                return guardResult;
            }
            
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
            
            // Send to parent - parent will respond with MESSAGE_ACK
            const result = safeSend(OUTGOING_ACTIONS.SEND_MESSAGE, {
                conversationId: conversationId,
                content: content,
                type: options.type || 'text',
                attachment: options.attachment,
                replyTo: options.replyTo,
                mentions: options.mentions,
                localId: localId,
                requestId: requestId,
                messageId: localId
            }, { requireAck: false });
            
            if (result.blocked) {
                optimisticMessage.status = 'blocked';
                ChatManager.updateMessageStatus(localId, 'blocked', { reason: result.reason });
                EventBus.emit('message:failed', { messageId: localId, error: `Blocked: ${result.reason}` });
                this._optimisticMessages.delete(localId);
                this._pendingRequests.delete(requestId);
                return { success: false, blocked: true, reason: result.reason };
            }
            
            return { success: true, localId, requestId, optimistic: optimisticMessage };
        },
        
        updateMessageStatus: function(messageId, status, details = {}) {
            ChatManager.updateMessageStatus(messageId, status, details);
            
            const optimistic = this._optimisticMessages.get(messageId);
            if (optimistic) {
                optimistic.status = status;
                if (status === 'sent' || status === 'delivered') {
                    delete optimistic.optimistic;
                }
                if (status === 'failed') {
                    EventBus.emit('message:failed', { messageId, error: details.reason || 'Send failed' });
                }
            }
            
            if (status === 'sent' || status === 'delivered') {
                this._optimisticMessages.delete(messageId);
            }
            
            const pending = Array.from(this._pendingRequests.entries()).find(([_, v]) => v.localId === messageId);
            if (pending) {
                this._pendingRequests.delete(pending[0]);
            }
        },
        
        deleteMessage: function(messageId, forEveryone = false) {
            const guardResult = window.__guardAction('deleteMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.DELETE_MESSAGE, {
                messageId,
                forEveryone
            }, { requireAck: false });
            
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
            const guardResult = window.__guardAction('editMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.EDIT_MESSAGE, {
                messageId,
                content: newContent
            }, { requireAck: false });
            
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
            const guardResult = window.__guardAction('addReaction', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.ADD_REACTION, {
                messageId,
                emoji,
                add
            }, { requireAck: false });
            
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
            const guardResult = window.__guardAction('forwardMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.FORWARD_MESSAGE, {
                messageId,
                targetConversationIds
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            return true;
        },
        
        reportMessage: function(messageId, reason) {
            const guardResult = window.__guardAction('reportMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.REPORT_MESSAGE, {
                messageId,
                reason
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            return true;
        },
        
        searchMessages: function(conversationId, query, options = {}) {
            const guardResult = window.__guardAction('searchMessages', MODULE_NAME, currentState, Promise.reject(new Error('Module not active')));
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) {
                return Promise.reject(new Error('Module not active'));
            }
            
            return new Promise((resolve, reject) => {
                const result = safeSend(OUTGOING_ACTIONS.SEARCH_MESSAGES, {
                    conversationId,
                    query,
                    ...options
                });
                
                if (result.blocked) {
                    reject(new Error(result.reason));
                } else {
                    resolve({ success: true });
                }
            }).catch(error => {
                return { success: false, error: error.message };
            });
        },
        
        getPendingCount: function() {
            return this._optimisticMessages.size;
        }
    };

    // =============================================
    // CONVERSATION MANAGER
    // =============================================
    const ConversationManager = {
        openConversation: function(conversationId, options = {}) {
            const guardResult = window.__guardAction('openConversation', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!conversationId) return false;
            
            const conversation = ChatManager.getConversation(conversationId);
            if (conversation) {
                ChatManager.setActiveConversation(conversation);
            }
            
            const result = safeSend(OUTGOING_ACTIONS.OPEN_CONVERSATION, {
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
            const guardResult = window.__guardAction('fetchMessages', MODULE_NAME, currentState);
            if (guardResult !== null) {
                return;
            }
            
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            
            safeSend(OUTGOING_ACTIONS.FETCH_MESSAGES, {
                conversationId: conversationId,
                before: options.before,
                limit: options.limit || 50
            }, { requireAck: false });
        },
        
        fetchConversations: function() {
            const guardResult = window.__guardAction('fetchConversations', MODULE_NAME, currentState);
            if (guardResult !== null) {
                return;
            }
            
            if (!canSendUserMessages()) return;
            
            safeSend(OUTGOING_ACTIONS.FETCH_CONVERSATIONS, {}, { requireAck: false });
        },
        
        markAsRead: function(conversationId) {
            const guardResult = window.__guardAction('markAsRead', MODULE_NAME, currentState);
            if (guardResult !== null) {
                return;
            }
            
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            
            safeSend(OUTGOING_ACTIONS.MARK_AS_READ, {
                conversationId: conversationId
            }, { requireAck: false });
            
            const conversation = ChatManager.getConversation(conversationId);
            if (conversation) {
                conversation.unreadCount = 0;
                EventBus.emit('conversation:updated', conversation);
            }
        },
        
        createConversation: function(participants, options = {}) {
            const guardResult = window.__guardAction('createConversation', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!participants || participants.length === 0) return false;
            if (!canSendUserMessages()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.CREATE_CONVERSATION, {
                participants: participants,
                type: options.type || 'direct',
                name: options.name,
                initialMessage: options.initialMessage
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            return true;
        },
        
        archiveConversation: function(conversationId, archived = true) {
            const guardResult = window.__guardAction('archiveConversation', MODULE_NAME, currentState);
            if (guardResult !== null) {
                return;
            }
            
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            
            safeSend(OUTGOING_ACTIONS.ARCHIVE_CONVERSATION, {
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
            const guardResult = window.__guardAction('blockUser', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.BLOCK_USER, {
                userId,
                block
            }, { requireAck: false });
            
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
    // UI STATE MANAGER
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
    // UI FEATURES
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
    // EVENT BUS
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
    // UI BRIDGE (ACTIVATES ONLY IN ACTIVE STATE)
    // =============================================
    const UIBridge = {
        _listeners: new Map(),
        _initialized: false,
        
        init: function() {
            if (this._initialized) return this;
            
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this._attachListeners());
            } else {
                if (currentState === LIFECYCLE_STATES.ACTIVE) {
                    this._attachListeners();
                }
            }
            
            this._initialized = true;
            Logger.info('UIBridge', 'Initialized');
            return this;
        },
        
        _attachListeners: function() {
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
                    const guardResult = window.__guardAction('UI:sendMessage', MODULE_NAME, currentState);
                    if (guardResult !== null) {
                        console.log(`[${MODULE_NAME}] ⏳ Waiting for activation...`);
                        return;
                    }
                    
                    if (!canSendUserMessages()) {
                        console.log(`[${MODULE_NAME}] ⏳ Waiting for activation...`);
                        return;
                    }
                    
                    if (!SessionManager.isAuthenticated()) {
                        console.log(`[${MODULE_NAME}] ⏳ Session not ready...`);
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
                        
                        const guardResult = window.__guardAction('UI:sendMessage', MODULE_NAME, currentState);
                        if (guardResult !== null) {
                            console.log(`[${MODULE_NAME}] ⏳ Waiting for activation...`);
                            return;
                        }
                        
                        if (!canSendUserMessages()) {
                            console.log(`[${MODULE_NAME}] ⏳ Waiting for activation...`);
                            return;
                        }
                        
                        if (!SessionManager.isAuthenticated()) {
                            console.log(`[${MODULE_NAME}] ⏳ Session not ready...`);
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
                    if (conversationId && canSendUserMessages() && SessionManager.isAuthenticated()) {
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
                        if (entry.isIntersecting && canSendUserMessages() && SessionManager.isAuthenticated()) {
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
                if (conversationItem && canSendUserMessages() && SessionManager.isAuthenticated()) {
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
                if (friendItem && canSendUserMessages() && SessionManager.isAuthenticated()) {
                    const friendId = friendItem.dataset.friendId;
                    if (friendId) {
                        ConversationManager.createConversation([friendId]);
                    }
                }
            });
        },
        
        dispatch: function(action, payload) {
            const guardResult = window.__guardAction(`UI:${action}`, MODULE_NAME, currentState);
            if (guardResult !== null) {
                Logger.info('UIBridge', `⏳ Waiting for activation - cannot dispatch ${action}`);
                return;
            }
            
            if (!canSendUserMessages()) {
                Logger.info('UIBridge', `⏳ Waiting for activation - cannot dispatch ${action}`);
                return;
            }
            
            const needsSession = ['sendMessage', 'startTyping', 'stopTyping', 'openChat', 'markAsRead', 'createChat'];
            if (needsSession.includes(action) && !SessionManager.isAuthenticated()) {
                Logger.info('UIBridge', `⏳ Session not ready - cannot dispatch ${action}`);
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
    // MESSAGE DISPATCHER
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
            return safeSend(type, payload, options);
        },
        
        getStats: function() {
            return {
                registeredHandlers: this._handlers.size,
                queuedMessages: this._messageQueue.length
            };
        }
    }.init();

    // =============================================
    // MODULE LIFECYCLE CONTROLLER (DETERMINISTIC HANDSHAKE)
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
            setState(LIFECYCLE_STATES.INITIALIZING, 'start_sequence');
            
            SecurityValidator.init();
            ParentConnectionManager.init();
            MessageDispatcher.init();
            SessionManager.init();
            HeartbeatClient.init();
            
            loadCachedData().catch(e => Logger.warn('ModuleLifecycleController', 'Cache load error', e));
            
            setState(LIFECYCLE_STATES.READY, 'initialization_complete');
            
            this._state = 'running';
            this._notifyListeners('running');
            
            Logger.success('ModuleLifecycleController', `Module ready in ${Date.now() - this._startTime}ms`);
            
            if (typeof window.__safeSendChildReady === 'function') {
                window.__safeSendChildReady(() => ParentConnectionManager.notifyChildReady(), MODULE_NAME)();
            } else {
                ParentConnectionManager.notifyChildReady();
            }
            
            await parentReadyPromise;
        },
        
        stop: function() {
            if (this._state === 'stopped') return;
            
            this._state = 'stopping';
            this._notifyListeners('stopping');
            
            HeartbeatClient.reset();
            ParentConnectionManager.destroy();
            
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
    // MODULE CORE CONTROLLER
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
            this._modules.set('lifecycle', { getState: getLifecycleState });
            this._modules.set('security', SecurityValidator);
            this._modules.set('parentConnection', ParentConnectionManager);
            this._modules.set('messageDispatcher', MessageDispatcher);
            this._modules.set('session', SessionManager);
            this._modules.set('heartbeat', HeartbeatClient);
            this._modules.set('moduleLifecycle', ModuleLifecycleController);
            
            this._modules.set('sessionStore', SessionStore);
            this._modules.set('chat', ChatManager);
            this._modules.set('friends', FriendManager);
            this._modules.set('groups', GroupManager);
            this._modules.set('typing', TypingManager);
            this._modules.set('messageHandler', MessageHandler);
            this._modules.set('conversation', ConversationManager);
            
            this._modules.set('uiState', UIStateManager);
            this._modules.set('uiBridge', UIBridge);
            this._modules.set('eventBus', EventBus);
            this._modules.set('uiFeatures', UIFeatures);
            
            this._modules.set('safeStorage', SafeStorage);
            this._modules.set('securityUtils', SecurityUtils);
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
                parentConnection: ParentConnectionManager.getStats(),
                messageDispatcher: MessageDispatcher.getStats(),
                session: SessionManager.getState(),
                uiBridge: UIBridge.getStats(),
                security: SECURITY.getSecurityReport()
            };
            
            return stats;
        },
        
        reset: function() {
            Logger.info('ModuleCoreController', 'Resetting module');
            ModuleLifecycleController.stop();
            
            resetLifecycle();
            ParentConnectionManager.reset();
            SessionManager.clear();
            HeartbeatClient.reset();
            
            setTimeout(() => {
                ModuleLifecycleController.start();
            }, 100);
        }
    }.init();

    // =============================================
    // BOOT CONTROLLER
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
    // SAFE UI INITIALIZATION
    // =============================================
    function initializeUISafe() {
        if (currentState !== LIFECYCLE_STATES.ACTIVE) {
            Logger.info('UI', 'Delaying UI init until ACTIVE');
            return;
        }
        
        UIBridge.init();
        
        EventBus.emit('ui:ready', { timestamp: Date.now() });
        
        Logger.success('UI', 'UI initialized');
    }
    
    function startDataFlow() {
        if (currentState !== LIFECYCLE_STATES.ACTIVE) {
            Logger.info('DataFlow', 'Delaying data flow until ACTIVE');
            return;
        }
        
        if (!SessionManager.isAuthenticated()) {
            Logger.info('DataFlow', 'Delaying data flow until session ready');
            return;
        }
        
        Logger.info('DataFlow', 'Starting data flow');
        
        ConversationManager.fetchConversations();
        
        restoreLastChat();
        
        Logger.success('DataFlow', 'Data flow started');
    }

    // =============================================
    // INITIALIZATION (DETERMINISTIC HANDSHAKE)
    // =============================================
    async function initialize() {
        console.log(`[${MODULE_NAME}] 🚀 Messages Core v${MODULE_VERSION} (Deterministic Parent-Controlled Protocol)`);
        
        try {
            setState(LIFECYCLE_STATES.BOOT, 'initialization_start');
            
            ModuleCoreController.init();
            ModuleLifecycleController.start();
            
            stateListeners.add((toState) => {
                if (toState === LIFECYCLE_STATES.ACTIVE) {
                    BootController.completeBoot();
                    console.log(`[${MODULE_NAME}] ✅ Module ACTIVE - ready for user interaction`);
                }
            });
            
            console.log(`[${MODULE_NAME}] ✅ Initialized - waiting for parent activation`);
            
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
        if (currentState !== LIFECYCLE_STATES.ACTIVE) return;
        if (!SessionManager.isAuthenticated()) return;
        
        const lastChatId = SafeStorage.get('lastChatId');
        if (lastChatId) {
            const conversation = ChatManager.getConversation(lastChatId);
            if (conversation) {
                ConversationManager.openConversation(lastChatId);
            }
        }
    }

    // =============================================
    // CLEANUP
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
    });

    // =============================================
    // PUBLIC API
    // =============================================
    const MessagesCore = {
        version: MODULE_VERSION,
        
        SessionStore,
        ChatManager,
        FriendManager,
        GroupManager,
        ParentConnectionManager,
        EventBus,
        Security: SECURITY,
        
        SecurityValidator,
        SessionManager,
        MessageDispatcher,
        HeartbeatClient,
        UIBridge,
        ModuleLifecycleController,
        ModuleCoreController,
        
        MessageHandler,
        ConversationManager,
        TypingManager,
        UIStateManager,
        UIFeatures,
        
        SecurityUtils,
        SafeStorage,
        Logger,
        
        getState: getLifecycleState,
        isReady: () => currentState === LIFECYCLE_STATES.ACTIVE,
        isCoreReady: () => currentState === LIFECYCLE_STATES.ACTIVE,
        getCurrentUser: () => SessionStore.getUser(),
        getCurrentConversation: () => ChatManager.getActiveChat(),
        getConversations: () => ChatManager.getConversations(),
        getMessages: () => ChatManager.getMessages(),
        getFriends: () => FriendManager.getFriendListForChat(),
        
        isAuthenticated: () => SessionManager.isAuthenticated(),
        
        getSecurityReport: () => SECURITY.getSecurityReport(),
        
        subscribe: (callback) => stateListeners.add(callback),
        on: (event, callback) => EventBus.on(event, callback),
        off: (event, callback) => EventBus.off(event, callback),
        once: (event, callback) => EventBus.once(event, callback),
        
        sendMessage: (content, options) => MessageHandler.sendMessage(content, options),
        deleteMessage: (messageId, forEveryone) => MessageHandler.deleteMessage(messageId, forEveryone),
        editMessage: (messageId, newContent) => MessageHandler.editMessage(messageId, newContent),
        addReaction: (messageId, emoji, add) => MessageHandler.addReaction(messageId, emoji, add),
        forwardMessage: (messageId, targetConversationIds) => MessageHandler.forwardMessage(messageId, targetConversationIds),
        reportMessage: (messageId, reason) => MessageHandler.reportMessage(messageId, reason),
        searchMessages: (conversationId, query, options) => MessageHandler.searchMessages(conversationId, query, options),
        
        openConversation: (conversationId, options) => ConversationManager.openConversation(conversationId, options),
        fetchMessages: (conversationId, options) => ConversationManager.fetchMessages(conversationId, options),
        fetchConversations: () => ConversationManager.fetchConversations(),
        markAsRead: (conversationId) => ConversationManager.markAsRead(conversationId),
        createConversation: (participants, options) => ConversationManager.createConversation(participants, options),
        archiveConversation: (conversationId, archived) => ConversationManager.archiveConversation(conversationId, archived),
        blockUser: (userId, block) => ConversationManager.blockUser(userId, block),
        
        sendTyping: (conversationId, isTyping) => TypingManager.sendTyping(conversationId, isTyping),
        stopTyping: () => TypingManager.stopTyping(),
        getTypingUsers: (conversationId) => TypingManager.getTypingUsersForConversation(conversationId),
        
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
        
        features: UIFeatures,
        
        formatMessageText: UIFeatures.formatMessageText,
        formatTime: UIFeatures.formatTime,
        formatDate: UIFeatures.formatDate,
        formatDateTime: UIFeatures.formatDateTime,
        formatFileSize: UIFeatures.formatFileSize,
        escapeHtml: SecurityUtils.escapeHtml,
        escapeRegex: SecurityUtils.escapeRegex,
        sanitizeString: SecurityUtils.sanitizeString,
        
        getPendingMessageCount: () => MessageHandler.getPendingCount(),
        
        sendAction: (type, payload, options) => safeSend(type, payload, options),
        
        waitForBoot: () => BootController.waitForBoot(),
        
        getStats: () => ModuleCoreController.getStats(),
        
        reset: () => ModuleCoreController.reset(),
        
        debug: {
            getState: getLifecycleState,
            ParentConnectionManager,
            SafeStorage,
            Security: SECURITY,
            HeartbeatClient,
            SessionManager,
            messageQueue,
            flushQueue: flushMessageQueue,
            lifecycleGuards: {
                canSendChildReady: (state) => window.__lifecycleCanSendChildReady(state),
                canPerformAction: (state) => window.__lifecycleCanPerformAction(state)
            }
        }
    };

    window.MessagesCore = MessagesCore;
    window.__MODULE_NAME__ = MODULE_NAME;
    window.__MODULE_VERSION__ = MODULE_VERSION;
    
    initialize();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MessagesCore;
    }
})();