// js/api.messages.js
// ============================================================================
// AUTHORITATIVE MESSAGING SERVICE - VERSION 2.0.3
// ============================================================================
// PRODUCTION-READY - WITH ALL EXPORTS - COMPLETE IMPLEMENTATION
// INCLUDES ALL FUNCTIONS REQUIRED BY FRIEND-CORE.JS
// ============================================================================

// ============================================================================
// SECTION 1: CORE CONSTANTS - FROZEN, IMMUTABLE, COMPLETE
// ============================================================================

export const STRICT_MESSAGE_TYPES = Object.freeze({
    CHILD_READY: 'CHILD_READY',
    FRAME_ID: 'FRAME_ID',
    API_READY: 'API_READY',
    REQUEST_SESSION: 'REQUEST_SESSION',
    SESSION_DATA: 'SESSION_DATA',
    SESSION_ERROR: 'SESSION_ERROR',
    CHILD_ERROR: 'CHILD_ERROR',
    DATA_UPDATE: 'DATA_UPDATE',
    MESSAGE_SENT: 'MESSAGE_SENT',
    USER_TYPING: 'USER_TYPING',
    CHAT_HISTORY_CLEARED: 'CHAT_HISTORY_CLEARED',
    MESSAGE_DELETED: 'MESSAGE_DELETED',
    MESSAGE_EDITED: 'MESSAGE_EDITED',
    MESSAGE_FORWARDED: 'MESSAGE_FORWARDED',
    MESSAGE_PINNED: 'MESSAGE_PINNED',
    MESSAGE_UNPINNED: 'MESSAGE_UNPINNED',
    CONVERSATION_CREATED: 'CONVERSATION_CREATED',
    CONVERSATION_LEFT: 'CONVERSATION_LEFT',
    TRANSPARENCY_LOG: 'TRANSPARENCY_LOG',
    MESSAGE_ACK: 'MESSAGE_ACK',
    MESSAGE_NACK: 'MESSAGE_NACK',
    MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
    MESSAGE_READ: 'MESSAGE_READ',
    INCOMING_CALL: 'INCOMING_CALL',
    CALL_ACCEPTED: 'CALL_ACCEPTED',
    CALL_REJECTED: 'CALL_REJECTED',
    CALL_ENDED: 'CALL_ENDED',
    // Additional types for friend-core.js compatibility
    GET_MESSAGES: 'GET_MESSAGES',
    GET_CONVERSATIONS: 'GET_CONVERSATIONS',
    SEND_MESSAGE: 'SEND_MESSAGE',
    EDIT_MESSAGE: 'EDIT_MESSAGE',
    DELETE_MESSAGE: 'DELETE_MESSAGE',
    FORWARD_MESSAGE: 'FORWARD_MESSAGE',
    REACT_TO_MESSAGE: 'REACT_TO_MESSAGE',
    GET_MESSAGE_HISTORY: 'GET_MESSAGE_HISTORY',
    CREATE_CONVERSATION: 'CREATE_CONVERSATION',
    ARCHIVE_CONVERSATION: 'ARCHIVE_CONVERSATION',
    MUTE_CONVERSATION: 'MUTE_CONVERSATION',
    PIN_CONVERSATION: 'PIN_CONVERSATION',
    SEARCH_MESSAGES: 'SEARCH_MESSAGES',
    UPLOAD_FILE: 'UPLOAD_FILE',
    DOWNLOAD_FILE: 'DOWNLOAD_FILE',
    GET_FILE_INFO: 'GET_FILE_INFO',
    GET_MESSAGE_STATUS: 'GET_MESSAGE_STATUS',
    GET_UNREAD_COUNT: 'GET_UNREAD_COUNT',
    GET_TYPING_STATUS: 'GET_TYPING_STATUS',
    SET_TYPING_STATUS: 'SET_TYPING_STATUS',
    GET_ONLINE_STATUS: 'GET_ONLINE_STATUS',
    GET_LAST_SEEN: 'GET_LAST_SEEN',
    GET_MESSAGE_REACTIONS: 'GET_MESSAGE_REACTIONS',
    GET_MESSAGE_THREAD: 'GET_MESSAGE_THREAD',
    GET_PINNED_MESSAGES: 'GET_PINNED_MESSAGES',
    GET_STARRED_MESSAGES: 'GET_STARRED_MESSAGES',
    GET_SAVED_MESSAGES: 'GET_SAVED_MESSAGES',
    SAVE_MESSAGE: 'SAVE_MESSAGE',
    UNSAVE_MESSAGE: 'UNSAVE_MESSAGE',
    QUOTE_MESSAGE: 'QUOTE_MESSAGE',
    GET_MESSAGE_LINK: 'GET_MESSAGE_LINK',
    SHARE_MESSAGE: 'SHARE_MESSAGE',
    REPORT_MESSAGE: 'REPORT_MESSAGE',
    DELETE_FOR_EVERYONE: 'DELETE_FOR_EVERYONE',
    DELETE_FOR_ME: 'DELETE_FOR_ME',
    GET_DELETED_MESSAGES: 'GET_DELETED_MESSAGES',
    RESTORE_DELETED_MESSAGE: 'RESTORE_DELETED_MESSAGE',
    GET_ARCHIVED_CONVERSATIONS: 'GET_ARCHIVED_CONVERSATIONS',
    GET_MUTED_CONVERSATIONS: 'GET_MUTED_CONVERSATIONS',
    GET_PINNED_CONVERSATIONS: 'GET_PINNED_CONVERSATIONS',
    GET_CONVERSATION_SETTINGS: 'GET_CONVERSATION_SETTINGS',
    UPDATE_CONVERSATION_SETTINGS: 'UPDATE_CONVERSATION_SETTINGS',
    GET_CONVERSATION_MEMBERS: 'GET_CONVERSATION_MEMBERS',
    ADD_CONVERSATION_MEMBERS: 'ADD_CONVERSATION_MEMBERS',
    REMOVE_CONVERSATION_MEMBERS: 'REMOVE_CONVERSATION_MEMBERS',
    PROMOTE_CONVERSATION_MEMBER: 'PROMOTE_CONVERSATION_MEMBER',
    DEMOTE_CONVERSATION_MEMBER: 'DEMOTE_CONVERSATION_MEMBER',
    LEAVE_CONVERSATION: 'LEAVE_CONVERSATION',
    JOIN_CONVERSATION: 'JOIN_CONVERSATION',
    GET_CONVERSATION_INVITE_LINK: 'GET_CONVERSATION_INVITE_LINK',
    REVOKE_CONVERSATION_INVITE_LINK: 'REVOKE_CONVERSATION_INVITE_LINK',
    GET_CONVERSATION_BANS: 'GET_CONVERSATION_BANS',
    BAN_CONVERSATION_MEMBER: 'BAN_CONVERSATION_MEMBER',
    UNBAN_CONVERSATION_MEMBER: 'UNBAN_CONVERSATION_MEMBER',
    GET_CONVERSATION_MUTES: 'GET_CONVERSATION_MUTES',
    MUTE_CONVERSATION_MEMBER: 'MUTE_CONVERSATION_MEMBER',
    UNMUTE_CONVERSATION_MEMBER: 'UNMUTE_CONVERSATION_MEMBER',
    GET_CONVERSATION_PINS: 'GET_CONVERSATION_PINS',
    PIN_CONVERSATION_MESSAGE: 'PIN_CONVERSATION_MESSAGE',
    UNPIN_CONVERSATION_MESSAGE: 'UNPIN_CONVERSATION_MESSAGE',
    GET_CONVERSATION_MEDIA: 'GET_CONVERSATION_MEDIA',
    GET_CONVERSATION_FILES: 'GET_CONVERSATION_FILES',
    GET_CONVERSATION_LINKS: 'GET_CONVERSATION_LINKS',
    GET_CONVERSATION_VOICE_MESSAGES: 'GET_CONVERSATION_VOICE_MESSAGES',
    GET_CONVERSATION_VIDEO_MESSAGES: 'GET_CONVERSATION_VIDEO_MESSAGES',
    GET_CONVERSATION_STICKERS: 'GET_CONVERSATION_STICKERS',
    GET_CONVERSATION_GIFS: 'GET_CONVERSATION_GIFS',
    SEARCH_CONVERSATION: 'SEARCH_CONVERSATION',
    FILTER_CONVERSATION_BY_TYPE: 'FILTER_CONVERSATION_BY_TYPE',
    FILTER_CONVERSATION_BY_DATE: 'FILTER_CONVERSATION_BY_DATE',
    FILTER_CONVERSATION_BY_SENDER: 'FILTER_CONVERSATION_BY_SENDER',
    FILTER_CONVERSATION_BY_MENTION: 'FILTER_CONVERSATION_BY_MENTION',
    FILTER_CONVERSATION_BY_HASHTAG: 'FILTER_CONVERSATION_BY_HASHTAG',
    EXPORT_CONVERSATION: 'EXPORT_CONVERSATION',
    IMPORT_CONVERSATION: 'IMPORT_CONVERSATION',
    BACKUP_CONVERSATIONS: 'BACKUP_CONVERSATIONS',
    RESTORE_CONVERSATIONS: 'RESTORE_CONVERSATIONS',
    CLEAR_CONVERSATION_HISTORY: 'CLEAR_CONVERSATION_HISTORY',
    DELETE_CONVERSATION: 'DELETE_CONVERSATION',
    REPLY_TO_MESSAGE: 'REPLY_TO_MESSAGE',
    // Status (Stories) action types
    STATUS_VIEW:             'STATUS_VIEW',
    STATUS_REACT:            'STATUS_REACT',
    STATUS_REACT_REMOVE:     'STATUS_REACT_REMOVE',
    STATUS_REPLY:            'STATUS_REPLY',
    STATUS_REPLY_RECEIVED:   'STATUS_REPLY_RECEIVED'
});

export const MESSAGE_TYPES = STRICT_MESSAGE_TYPES;

export const MESSAGE_STATUS = Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    DELIVERED: 'delivered',
    ACKNOWLEDGED: 'acknowledged',
    FAILED: 'failed',
    INVALID: 'invalid',
    TIMEOUT: 'timeout',
    REJECTED: 'rejected',
    RETRY: 'retry'
});

export const MESSAGE_SOURCE = Object.freeze({
    PARENT: 'parent',
    IFRAME: 'iframe',
    SYSTEM: 'system',
    RESPONSE: 'response',
    UNKNOWN: 'unknown'
});

export const MESSAGE_PRIORITY = Object.freeze({
    HIGH: 1,
    NORMAL: 2,
    LOW: 3,
    BACKGROUND: 4
});

const DELIVERY_CONFIG = Object.freeze({
    ACK_TIMEOUT_MS: 5000,
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_BASE_DELAY_MS: 300,
    RETRY_MAX_DELAY_MS: 3000,
    DEDUPLICATION_WINDOW_MS: 10000,
    CLEANUP_INTERVAL_MS: 60000,
    QUEUE_PROCESS_INTERVAL_MS: 50,
    MAX_QUEUE_SIZE: 1000,
    MAX_REGISTRY_SIZE: 5000,
    BATCH_SIZE: 50,
    ORIGIN_CACHE_TTL_MS: 300000,
    SESSION_CACHE_TTL_MS: 3600000
});

const VALIDATION_CONFIG = Object.freeze({
    MIN_MESSAGE_ID_LENGTH: 8,
    MAX_MESSAGE_ID_LENGTH: 64,
    MIN_PAYLOAD_SIZE_BYTES: 0,
    MAX_PAYLOAD_SIZE_BYTES: 524288,
    MAX_TIMESTAMP_FUTURE_MS: 60000,
    MAX_TIMESTAMP_PAST_MS: 604800000,
    REQUIRED_MESSAGE_FIELDS: ['id', 'type', 'source', 'timestamp', 'status', 'version'],
    ALLOWED_SOURCES: ['parent', 'iframe', 'system', 'response'],
    ALLOWED_TARGETS: ['all', 'parent', 'iframe', 'system'],
    VERSION_PATTERN: /^\d+\.\d+\.\d+$/
});

const SECURITY_CONFIG = Object.freeze({
    MAX_HANDSHAKE_ATTEMPTS: 3,
    HANDSHAKE_TIMEOUT_MS: 5000,
    SESSION_TOKEN_REQUIRED: true,
    REJECT_UNAUTHORIZED_ORIGINS: true,
    REJECT_NON_SERIALIZABLE_PAYLOAD: true,
    MAX_REPLAY_WINDOW_MS: 300000,
    MAX_ERROR_LOG_CACHE_SIZE: 1000,
    ERROR_CACHE_TTL_MS: 60000,
    DISABLE_ON_CRITICAL_FAILURES: true
});

const ALLOWED_ORIGINS = Object.freeze([
    window.location.origin,
    'http://localhost:3000',
    'http://localhost:8080',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:4000',
    'https://moodchat-fy56.onrender.com',
    'https://moodfronted.onrender.com'
]);

const MESSAGE_SCHEMAS = Object.freeze({
    BASE: {
        id: { type: 'string', required: true, pattern: /^msg_\d+_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/ },
        type: { type: 'string', required: true, enum: Object.values(STRICT_MESSAGE_TYPES) },
        source: { type: 'string', required: true, enum: Object.values(MESSAGE_SOURCE) },
        target: { type: 'string', required: false, default: 'all', enum: ['all', 'parent', 'iframe', 'system'] },
        timestamp: { type: 'number', required: true, min: 1 },
        status: { type: 'string', required: true, enum: Object.values(MESSAGE_STATUS) },
        version: { type: 'string', required: true, pattern: VALIDATION_CONFIG.VERSION_PATTERN },
        session: { type: 'string', required: false, nullable: true },
        payload: { type: 'object', required: false, default: {} },
        ack: { type: 'boolean', required: false, default: false },
        retryCount: { type: 'number', required: false, default: 0, min: 0, max: DELIVERY_CONFIG.MAX_RETRY_ATTEMPTS }
    },
    CHILD_READY: {
        payload: { 
            type: 'object', 
            required: true, 
            schema: {
                attempts: { type: 'number', required: true },
                version: { type: 'string', required: true, pattern: VALIDATION_CONFIG.VERSION_PATTERN }
            }
        }
    },
    SESSION_DATA: {
        payload: { type: 'object', required: true }
    },
    DATA_UPDATE: {
        payload: { type: 'object', required: true }
    },
    MESSAGE_ACK: {
        payload: { 
            type: 'object', 
            required: true, 
            schema: {
                originalMessageId: { type: 'string', required: true },
                deliveredAt: { type: 'number', required: true }
            }
        }
    }
});

// ============================================================================
// SECTION 2: SINGLETON ID AUTHORITY - COMPLETE IMPLEMENTATION
// ============================================================================

class MessageIdAuthority {
    constructor() {
        this.counter = 0;
        this.prefix = 'msg';
        this.instanceId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        this.generatedIds = new Set();
        this.idGenerationCount = 0;
    }

    generate() {
        this.counter = (this.counter + 1) % 1000000;
        this.idGenerationCount++;
        
        const timestamp = Date.now();
        const counterStr = this.counter.toString(36).padStart(4, '0');
        const instancePart = this.instanceId;
        const randomPart = Math.random().toString(36).substring(2, 6);
        
        const messageId = `${this.prefix}_${timestamp}_${counterStr}_${instancePart}_${randomPart}`;
        
        if (this.generatedIds.has(messageId)) {
            return this.generate();
        }
        
        if (this.generatedIds.size > 10000) {
            const entries = Array.from(this.generatedIds);
            this.generatedIds.clear();
            for (let i = entries.length - 5000; i < entries.length; i++) {
                this.generatedIds.add(entries[i]);
            }
        }
        
        this.generatedIds.add(messageId);
        return messageId;
    }

    validate(id) {
        if (!id || typeof id !== 'string') return false;
        const pattern = /^msg_\d+_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/;
        return pattern.test(id);
    }

    getStats() {
        return {
            totalGenerated: this.idGenerationCount,
            currentCounter: this.counter,
            instanceId: this.instanceId,
            cachedIds: this.generatedIds.size
        };
    }
}

const GlobalMessageIdAuthority = new MessageIdAuthority();

// ============================================================================
// SECTION 3: VALIDATION ENGINE - COMPLETE IMPLEMENTATION
// ============================================================================

class ValidationEngine {
    constructor() {
        this.schemas = MESSAGE_SCHEMAS;
        this.allowedOrigins = [...ALLOWED_ORIGINS];
        this.originCache = new Map();
        this.validationCache = new Map();
        this.failedValidations = new Map();
        this.replayCache = new Map();
        this.initialized = true;
    }

    validateMessage(message, context = {}) {
        const errors = [];
        const warnings = [];
        let normalized = null;

        if (!message || typeof message !== 'object') {
            errors.push('Message must be an object');
            return { isValid: false, errors, warnings, normalized: null };
        }

        normalized = this.normalizeMessage(message);
        if (!normalized) {
            errors.push('Failed to normalize message');
            return { isValid: false, errors, warnings, normalized: null };
        }

        for (const field of VALIDATION_CONFIG.REQUIRED_MESSAGE_FIELDS) {
            if (normalized[field] === undefined || normalized[field] === null) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        if (normalized.id) {
            if (!GlobalMessageIdAuthority.validate(normalized.id)) {
                errors.push(`Invalid message ID format: ${normalized.id}`);
            }
            if (typeof normalized.id !== 'string' || 
                normalized.id.length < VALIDATION_CONFIG.MIN_MESSAGE_ID_LENGTH ||
                normalized.id.length > VALIDATION_CONFIG.MAX_MESSAGE_ID_LENGTH) {
                errors.push(`Message ID length invalid: ${normalized.id.length}`);
            }
        }

        if (normalized.type) {
            const validTypes = Object.values(STRICT_MESSAGE_TYPES);
            if (!validTypes.includes(normalized.type)) {
                if (normalized.type.endsWith('_RESPONSE')) {
                    warnings.push(`Response type not in strict types: ${normalized.type}`);
                } else {
                    errors.push(`Unknown message type: ${normalized.type}`);
                }
            }
        }

        if (normalized.source) {
            if (!VALIDATION_CONFIG.ALLOWED_SOURCES.includes(normalized.source)) {
                errors.push(`Invalid source: ${normalized.source}`);
            }
            
            if (context.isIncoming) {
                const expectedSource = window.parent === window ? 
                    MESSAGE_SOURCE.PARENT : MESSAGE_SOURCE.IFRAME;
                if (normalized.source === expectedSource) {
                    errors.push(`Spoofing attempt: message claims source ${normalized.source} from wrong context`);
                }
            }
        }

        if (normalized.target && !VALIDATION_CONFIG.ALLOWED_TARGETS.includes(normalized.target)) {
            errors.push(`Invalid target: ${normalized.target}`);
        }

        if (typeof normalized.timestamp === 'number') {
            const now = Date.now();
            if (normalized.timestamp > now + VALIDATION_CONFIG.MAX_TIMESTAMP_FUTURE_MS) {
                errors.push(`Timestamp ${normalized.timestamp} is too far in future`);
            }
            if (normalized.timestamp < now - VALIDATION_CONFIG.MAX_TIMESTAMP_PAST_MS) {
                errors.push(`Timestamp ${normalized.timestamp} is too old`);
            }
        }

        if (normalized.status && !Object.values(MESSAGE_STATUS).includes(normalized.status)) {
            errors.push(`Invalid status: ${normalized.status}`);
        }

        if (normalized.version && !VALIDATION_CONFIG.VERSION_PATTERN.test(normalized.version)) {
            errors.push(`Invalid version format: ${normalized.version}`);
        }

        if (normalized.payload !== undefined) {
            if (typeof normalized.payload !== 'object') {
                errors.push('Payload must be an object');
            } else {
                try {
                    const serialized = JSON.stringify(normalized.payload);
                    if (serialized.length > VALIDATION_CONFIG.MAX_PAYLOAD_SIZE_BYTES) {
                        errors.push(`Payload exceeds maximum size: ${serialized.length} bytes`);
                    }
                } catch (e) {
                    errors.push('Payload contains non-serializable values');
                }
            }
        }

        const schema = this.schemas[normalized.type] || this.schemas.BASE;
        const schemaErrors = this.validateAgainstSchema(normalized, schema);
        errors.push(...schemaErrors);

        if (context.isIncoming && context.origin) {
            if (!this.validateOrigin(context.origin)) {
                errors.push(`Unauthorized origin: ${context.origin}`);
            }
        }

        if (context.isIncoming && normalized.id) {
            if (this.isReplayAttack(normalized.id, normalized.timestamp)) {
                errors.push(`Replay attack detected: ${normalized.id}`);
            }
        }

        if (SECURITY_CONFIG.SESSION_TOKEN_REQUIRED && 
            !normalized.session && 
            normalized.source !== MESSAGE_SOURCE.SYSTEM) {
            warnings.push('Message missing session token');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            normalized
        };
    }

    validateAgainstSchema(message, schema) {
        const errors = [];
        
        for (const [field, rules] of Object.entries(schema)) {
            const value = message[field];
            
            if (rules.required && (value === undefined || value === null)) {
                errors.push(`Schema validation: missing required field "${field}"`);
                continue;
            }
            
            if (value !== undefined && value !== null) {
                if (rules.type && typeof value !== rules.type) {
                    errors.push(`Schema validation: field "${field}" must be type "${rules.type}", got "${typeof value}"`);
                }
                
                if (rules.enum && !rules.enum.includes(value)) {
                    errors.push(`Schema validation: field "${field}" must be one of [${rules.enum.join(', ')}]`);
                }
                
                if (rules.pattern && !rules.pattern.test(value)) {
                    errors.push(`Schema validation: field "${field}" does not match pattern`);
                }
                
                if (rules.min !== undefined && value < rules.min) {
                    errors.push(`Schema validation: field "${field}" must be >= ${rules.min}`);
                }
                if (rules.max !== undefined && value > rules.max) {
                    errors.push(`Schema validation: field "${field}" must be <= ${rules.max}`);
                }
                
                if (rules.schema && typeof value === 'object') {
                    const nestedErrors = this.validateAgainstSchema(value, rules.schema);
                    errors.push(...nestedErrors.map(e => `${field}.${e}`));
                }
            }
        }
        
        return errors;
    }

    normalizeMessage(rawMessage) {
        if (!rawMessage || typeof rawMessage !== 'object') return null;
        
        try {
            const normalized = {};
            const now = Date.now();
            
            if (rawMessage.id && GlobalMessageIdAuthority.validate(rawMessage.id)) {
                normalized.id = rawMessage.id;
            } else if (rawMessage.messageId) {
                normalized.id = rawMessage.messageId;
            } else if (rawMessage._id) {
                normalized.id = rawMessage._id;
            } else {
                normalized.id = GlobalMessageIdAuthority.generate();
            }
            
            normalized.type = rawMessage.type || rawMessage.messageType || rawMessage.event || STRICT_MESSAGE_TYPES.DATA_UPDATE;
            
            if (rawMessage.source && VALIDATION_CONFIG.ALLOWED_SOURCES.includes(rawMessage.source)) {
                normalized.source = rawMessage.source;
            } else if (rawMessage.from === 'parent' || rawMessage.origin === 'parent') {
                normalized.source = MESSAGE_SOURCE.PARENT;
            } else if (rawMessage.from === 'iframe' || rawMessage.origin === 'iframe') {
                normalized.source = MESSAGE_SOURCE.IFRAME;
            } else if (rawMessage.source === 'response' || rawMessage.isResponse) {
                normalized.source = MESSAGE_SOURCE.RESPONSE;
            } else {
                normalized.source = MESSAGE_SOURCE.SYSTEM;
            }
            
            normalized.target = rawMessage.target || 'all';
            if (!VALIDATION_CONFIG.ALLOWED_TARGETS.includes(normalized.target)) {
                normalized.target = 'all';
            }
            
            normalized.timestamp = typeof rawMessage.timestamp === 'number' && rawMessage.timestamp > 0 
                ? rawMessage.timestamp 
                : (rawMessage.timestamp ? new Date(rawMessage.timestamp).getTime() : now);
            
            normalized.status = rawMessage.status && Object.values(MESSAGE_STATUS).includes(rawMessage.status)
                ? rawMessage.status
                : MESSAGE_STATUS.PENDING;
            
            normalized.version = rawMessage.version || '2.0.3';
            if (!VALIDATION_CONFIG.VERSION_PATTERN.test(normalized.version)) {
                normalized.version = '2.0.3';
            }
            
            try {
                normalized.session = rawMessage.session || null;
            } catch (e) {
                normalized.session = null;
            }
            
            if (rawMessage.payload && typeof rawMessage.payload === 'object') {
                normalized.payload = rawMessage.payload;
            } else if (rawMessage.data && typeof rawMessage.data === 'object') {
                normalized.payload = rawMessage.data;
            } else if (rawMessage.content) {
                normalized.payload = { content: rawMessage.content };
            } else {
                normalized.payload = rawMessage.payload || {};
            }
            
            normalized.ack = rawMessage.ack === true;
            normalized.retryCount = typeof rawMessage.retryCount === 'number' 
                ? Math.min(rawMessage.retryCount, DELIVERY_CONFIG.MAX_RETRY_ATTEMPTS) 
                : 0;
            
            return normalized;
        } catch (error) {
            return null;
        }
    }

    validateOrigin(origin) {
        if (!origin || typeof origin !== 'string') return false;
        
        const cached = this.originCache.get(origin);
        if (cached) {
            if (Date.now() - cached.timestamp < DELIVERY_CONFIG.ORIGIN_CACHE_TTL_MS) {
                return cached.allowed;
            }
            this.originCache.delete(origin);
        }
        
        if (this.allowedOrigins.includes(origin)) {
            this.originCache.set(origin, { allowed: true, timestamp: Date.now() });
            return true;
        }
        
        // Check for pattern matches (render.com domains)
        if (origin.includes('.onrender.com') || origin.includes('render.com')) {
            this.originCache.set(origin, { allowed: true, timestamp: Date.now() });
            return true;
        }
        
        this.originCache.set(origin, { allowed: false, timestamp: Date.now() });
        return false;
    }

    isReplayAttack(messageId, timestamp) {
        const now = Date.now();
        
        for (const [id, data] of this.replayCache.entries()) {
            if (now - data.timestamp > SECURITY_CONFIG.MAX_REPLAY_WINDOW_MS) {
                this.replayCache.delete(id);
            }
        }
        
        if (this.replayCache.has(messageId)) {
            const entry = this.replayCache.get(messageId);
            if (Math.abs(now - entry.timestamp) < SECURITY_CONFIG.MAX_REPLAY_WINDOW_MS) {
                return true;
            }
        }
        
        this.replayCache.set(messageId, { timestamp: now, originalTimestamp: timestamp });
        
        if (this.replayCache.size > 10000) {
            const entries = Array.from(this.replayCache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toRemove = entries.slice(0, 5000);
            for (const [id] of toRemove) {
                this.replayCache.delete(id);
            }
        }
        
        return false;
    }

    cleanup() {
        const now = Date.now();
        
        for (const [origin, data] of this.originCache.entries()) {
            if (now - data.timestamp > DELIVERY_CONFIG.ORIGIN_CACHE_TTL_MS) {
                this.originCache.delete(origin);
            }
        }
        
        for (const [id, data] of this.replayCache.entries()) {
            if (now - data.timestamp > SECURITY_CONFIG.MAX_REPLAY_WINDOW_MS) {
                this.replayCache.delete(id);
            }
        }
        
        for (const [key, data] of this.validationCache.entries()) {
            if (now - data.timestamp > 60000) {
                this.validationCache.delete(key);
            }
        }
    }
}

const GlobalValidationEngine = new ValidationEngine();

// ============================================================================
// SECTION 4: DELIVERY SYSTEM - COMPLETE IMPLEMENTATION
// ============================================================================

class DeliverySystem {
    constructor() {
        this.pendingMessages = new Map();
        this.deliveredMessages = new Map();
        this.failedMessages = new Map();
        this.messageQueues = {
            [MESSAGE_PRIORITY.HIGH]: [],
            [MESSAGE_PRIORITY.NORMAL]: [],
            [MESSAGE_PRIORITY.LOW]: [],
            [MESSAGE_PRIORITY.BACKGROUND]: []
        };
        this.processing = false;
        this.cleanupInterval = null;
        this.processInterval = null;
        this.stats = {
            sent: 0,
            delivered: 0,
            acknowledged: 0,
            failed: 0,
            retried: 0,
            deduped: 0,
            rejected: 0,
            timedout: 0
        };
        
        this.initialize();
    }

    initialize() {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
            GlobalValidationEngine.cleanup();
        }, DELIVERY_CONFIG.CLEANUP_INTERVAL_MS);
        
        this.processInterval = setInterval(() => {
            this.processQueues();
        }, DELIVERY_CONFIG.QUEUE_PROCESS_INTERVAL_MS);
    }

    send(message, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                const messageId = message.id;
                const priority = options.priority || MESSAGE_PRIORITY.NORMAL;
                const requireAck = options.requireAck !== false;
                const timeout = options.timeout || DELIVERY_CONFIG.ACK_TIMEOUT_MS;
                const targetOrigin = options.targetOrigin || '*';
                
                if (this.isDuplicate(messageId)) {
                    this.stats.deduped++;
                    const existing = this.deliveredMessages.get(messageId);
                    return resolve({
                        success: true,
                        messageId,
                        status: 'duplicate',
                        deliveredAt: existing ? existing.timestamp : Date.now(),
                        ack: existing ? existing.ack : false
                    });
                }
                
                const deliveryEntry = {
                    message,
                    messageId,
                    priority,
                    requireAck,
                    targetOrigin,
                    status: MESSAGE_STATUS.PENDING,
                    attempts: 0,
                    maxAttempts: DELIVERY_CONFIG.MAX_RETRY_ATTEMPTS,
                    createdAt: Date.now(),
                    timeout,
                    timeoutId: null,
                    resolve,
                    reject,
                    ackReceived: false,
                    ackData: null
                };
                
                this.pendingMessages.set(messageId, deliveryEntry);
                this.enqueue(messageId, priority);
                
                if (requireAck) {
                    deliveryEntry.timeoutId = setTimeout(() => {
                        this.handleTimeout(messageId);
                    }, timeout);
                }
                
                this.stats.sent++;
            } catch (error) {
                reject(error);
            }
        });
    }

    enqueue(messageId, priority) {
        const queue = this.messageQueues[priority];
        if (queue) {
            if (queue.length < DELIVERY_CONFIG.MAX_QUEUE_SIZE) {
                queue.push(messageId);
            } else {
                this.messageQueues[MESSAGE_PRIORITY.NORMAL].push(messageId);
            }
        }
    }

    async processQueues() {
        if (this.processing) return;
        this.processing = true;
        
        try {
            for (const priority of [MESSAGE_PRIORITY.HIGH, MESSAGE_PRIORITY.NORMAL, 
                                    MESSAGE_PRIORITY.LOW, MESSAGE_PRIORITY.BACKGROUND]) {
                const queue = this.messageQueues[priority];
                let processed = 0;
                
                while (queue.length > 0 && processed < DELIVERY_CONFIG.BATCH_SIZE) {
                    const messageId = queue.shift();
                    if (this.pendingMessages.has(messageId)) {
                        await this.deliver(messageId);
                    }
                    processed++;
                }
                
                if (processed > 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        } finally {
            this.processing = false;
        }
    }

    async deliver(messageId) {
        const entry = this.pendingMessages.get(messageId);
        if (!entry) return;
        
        entry.attempts++;
        entry.status = MESSAGE_STATUS.PROCESSING;
        entry.lastAttempt = Date.now();
        
        try {
            const message = entry.message;
            const targetOrigin = entry.targetOrigin;
            
            message.status = MESSAGE_STATUS.PROCESSING;
            message.retryCount = entry.attempts - 1;
            
            const postMessageFn = window.originalPostMessage || window.postMessage;
            postMessageFn.call(window, message, targetOrigin);
            
            if (!entry.requireAck) {
                this.markDelivered(messageId, false);
                entry.resolve({
                    success: true,
                    messageId,
                    status: 'sent',
                    timestamp: Date.now()
                });
            }
            
            this.stats.delivered++;
        } catch (error) {
            this.handleDeliveryError(messageId, error);
        }
    }

    handleAck(ackMessage) {
        const payload = ackMessage.payload || {};
        const originalMessageId = payload.originalMessageId || ackMessage.id;
        
        if (!this.pendingMessages.has(originalMessageId)) {
            return;
        }
        
        const entry = this.pendingMessages.get(originalMessageId);
        
        if (entry.timeoutId) {
            clearTimeout(entry.timeoutId);
            entry.timeoutId = null;
        }
        
        entry.ackReceived = true;
        entry.ackData = payload;
        entry.status = MESSAGE_STATUS.ACKNOWLEDGED;
        
        this.markDelivered(originalMessageId, true);
        
        entry.resolve({
            success: true,
            messageId: originalMessageId,
            status: 'acknowledged',
            deliveredAt: payload.deliveredAt || Date.now(),
            ack: true
        });
        
        this.stats.acknowledged++;
    }

    handleNack(nackMessage) {
        const payload = nackMessage.payload || {};
        const originalMessageId = payload.originalMessageId || nackMessage.id;
        
        if (!this.pendingMessages.has(originalMessageId)) {
            return;
        }
        
        const entry = this.pendingMessages.get(originalMessageId);
        
        if (entry.timeoutId) {
            clearTimeout(entry.timeoutId);
            entry.timeoutId = null;
        }
        
        if (entry.attempts < entry.maxAttempts) {
            entry.status = MESSAGE_STATUS.RETRY;
            this.stats.retried++;
            
            const delay = Math.min(
                DELIVERY_CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, entry.attempts - 1),
                DELIVERY_CONFIG.RETRY_MAX_DELAY_MS
            );
            
            setTimeout(() => {
                this.enqueue(originalMessageId, entry.priority);
            }, delay);
        } else {
            this.handleDeliveryError(originalMessageId, new Error('Max retry attempts exceeded'));
        }
    }

    handleTimeout(messageId) {
        if (!this.pendingMessages.has(messageId)) return;
        
        const entry = this.pendingMessages.get(messageId);
        
        if (entry.attempts < entry.maxAttempts) {
            entry.status = MESSAGE_STATUS.RETRY;
            this.stats.retried++;
            
            const delay = Math.min(
                DELIVERY_CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, entry.attempts - 1),
                DELIVERY_CONFIG.RETRY_MAX_DELAY_MS
            );
            
            setTimeout(() => {
                this.enqueue(messageId, entry.priority);
            }, delay);
        } else {
            this.handleDeliveryError(messageId, new Error('Message timeout'));
            this.stats.timedout++;
        }
    }

    handleDeliveryError(messageId, error) {
        const entry = this.pendingMessages.get(messageId);
        if (!entry) return;
        
        entry.status = MESSAGE_STATUS.FAILED;
        
        if (entry.timeoutId) {
            clearTimeout(entry.timeoutId);
            entry.timeoutId = null;
        }
        
        this.failedMessages.set(messageId, {
            message: entry.message,
            error: error.message,
            timestamp: Date.now(),
            attempts: entry.attempts
        });
        
        this.pendingMessages.delete(messageId);
        entry.reject(error);
        
        this.stats.failed++;
    }

    markDelivered(messageId, ack = false) {
        const entry = this.pendingMessages.get(messageId);
        if (!entry) return;
        
        this.deliveredMessages.set(messageId, {
            messageId,
            timestamp: Date.now(),
            ack,
            priority: entry.priority,
            attempts: entry.attempts
        });
        
        this.pendingMessages.delete(messageId);
        
        if (entry.timeoutId) {
            clearTimeout(entry.timeoutId);
            entry.timeoutId = null;
        }
    }

    isDuplicate(messageId) {
        if (this.deliveredMessages.has(messageId)) {
            const delivered = this.deliveredMessages.get(messageId);
            if (Date.now() - delivered.timestamp < DELIVERY_CONFIG.DEDUPLICATION_WINDOW_MS) {
                return true;
            }
            this.deliveredMessages.delete(messageId);
        }
        return false;
    }

    receive(message) {
        if (!message || !message.id) return false;
        
        if (message.type === STRICT_MESSAGE_TYPES.MESSAGE_ACK) {
            this.handleAck(message);
            return true;
        }
        
        if (message.type === STRICT_MESSAGE_TYPES.MESSAGE_NACK) {
            this.handleNack(message);
            return true;
        }
        
        return false;
    }

    cleanup() {
        const now = Date.now();
        
        for (const [id, data] of this.deliveredMessages.entries()) {
            if (now - data.timestamp > DELIVERY_CONFIG.DEDUPLICATION_WINDOW_MS) {
                this.deliveredMessages.delete(id);
            }
        }
        
        for (const [id, data] of this.failedMessages.entries()) {
            if (now - data.timestamp > DELIVERY_CONFIG.DEDUPLICATION_WINDOW_MS * 2) {
                this.failedMessages.delete(id);
            }
        }
        
        for (const [id, entry] of this.pendingMessages.entries()) {
            if (now - entry.createdAt > DELIVERY_CONFIG.ACK_TIMEOUT_MS * 3) {
                this.pendingMessages.delete(id);
            }
        }
        
        if (this.deliveredMessages.size > DELIVERY_CONFIG.MAX_REGISTRY_SIZE) {
            const entries = Array.from(this.deliveredMessages.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toRemove = entries.slice(0, entries.length - DELIVERY_CONFIG.MAX_REGISTRY_SIZE);
            for (const [id] of toRemove) {
                this.deliveredMessages.delete(id);
            }
        }
    }

    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        if (this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = null;
        }
    }

    getStats() {
        return {
            ...this.stats,
            pendingCount: this.pendingMessages.size,
            deliveredCount: this.deliveredMessages.size,
            failedCount: this.failedMessages.size,
            queueSizes: {
                high: this.messageQueues[MESSAGE_PRIORITY.HIGH].length,
                normal: this.messageQueues[MESSAGE_PRIORITY.NORMAL].length,
                low: this.messageQueues[MESSAGE_PRIORITY.LOW].length,
                background: this.messageQueues[MESSAGE_PRIORITY.BACKGROUND].length
            }
        };
    }
}

const GlobalDeliverySystem = new DeliverySystem();

// ============================================================================
// SECTION 5: SECURITY MANAGER - COMPLETE IMPLEMENTATION
// ============================================================================

class SecurityManager {
    constructor() {
        this.disabledModules = new Set();
        this.errorLogCache = new Map();
        this.handshakeComplete = false;
        this.handshakeAttempts = 0;
        this.handshakeTimeoutId = null;
        this.initState = {
            status: 'not_started',
            promise: null,
            timestamp: null
        };
        this.messageCounter = 0;
    }

    validateIncomingMessage(message, event) {
        if (!message || !event) {
            return { valid: false, reason: 'Missing message or event' };
        }
        
        if (event.source === window) {
            return { valid: false, reason: 'Self-message' };
        }
        
        if (SECURITY_CONFIG.REJECT_UNAUTHORIZED_ORIGINS) {
            if (!GlobalValidationEngine.validateOrigin(event.origin)) {
                this.logSecurityEvent('Unauthorized origin', event.origin);
                return { valid: false, reason: 'Unauthorized origin' };
            }
        }
        
        if (message._internal) {
            return { valid: false, reason: 'Internal message' };
        }
        
        if (!this.handshakeComplete && 
            message.type !== STRICT_MESSAGE_TYPES.CHILD_READY && 
            message.type !== STRICT_MESSAGE_TYPES.FRAME_ID &&
            message.type !== STRICT_MESSAGE_TYPES.API_READY) {
            return { valid: false, reason: 'Pre-handshake message' };
        }
        
        return { valid: true };
    }

    performSafeHandshake() {
        if (this.handshakeComplete) return;
        if (this.handshakeAttempts >= SECURITY_CONFIG.MAX_HANDSHAKE_ATTEMPTS) {
            this.logSecurityEvent('Max handshake attempts exceeded');
            return;
        }
        
        this.handshakeAttempts++;
        
        try {
            const handshakeMessage = {
                id: GlobalMessageIdAuthority.generate(),
                type: STRICT_MESSAGE_TYPES.CHILD_READY,
                source: MESSAGE_SOURCE.IFRAME,
                target: 'parent',
                timestamp: Date.now(),
                status: MESSAGE_STATUS.PENDING,
                version: '2.0.3',
                session: null,
                payload: {
                    attempts: this.handshakeAttempts,
                    version: '2.0.3',
                    userAgent: navigator.userAgent.substring(0, 100),
                    timestamp: Date.now()
                }
            };
            
            GlobalDeliverySystem.send(handshakeMessage, { 
                requireAck: false,
                priority: MESSAGE_PRIORITY.HIGH 
            }).catch(() => {});
        } catch (error) {
            this.logSecurityError('Handshake', error);
        }
    }

    waitForHandshake() {
        if (this.handshakeComplete) {
            return Promise.resolve();
        }
        
        return new Promise((resolve) => {
            if (this.handshakeTimeoutId) {
                clearTimeout(this.handshakeTimeoutId);
            }
            
            this.handshakeTimeoutId = setTimeout(() => {
                this.handshakeComplete = true;
                resolve();
            }, SECURITY_CONFIG.HANDSHAKE_TIMEOUT_MS);
            
            const checkInterval = setInterval(() => {
                if (this.handshakeComplete) {
                    clearInterval(checkInterval);
                    if (this.handshakeTimeoutId) {
                        clearTimeout(this.handshakeTimeoutId);
                        this.handshakeTimeoutId = null;
                    }
                    resolve();
                }
            }, 100);
        });
    }

    logSecurityEvent(event, data = null) {
        const key = `sec:${event}:${Date.now()}`;
        const timestamp = Date.now();
        
        for (const [k, t] of this.errorLogCache.entries()) {
            if (timestamp - t > SECURITY_CONFIG.ERROR_CACHE_TTL_MS) {
                this.errorLogCache.delete(k);
            }
        }
        
        if (this.errorLogCache.size > SECURITY_CONFIG.MAX_ERROR_LOG_CACHE_SIZE) {
            const entries = Array.from(this.errorLogCache.entries());
            entries.sort((a, b) => a[1] - b[1]);
            const toRemove = entries.slice(0, entries.length - SECURITY_CONFIG.MAX_ERROR_LOG_CACHE_SIZE);
            for (const [k] of toRemove) {
                this.errorLogCache.delete(k);
            }
        }
        
        this.errorLogCache.set(key, timestamp);
    }

    logSecurityError(context, error) {
        const key = `err:${context}:${error.message}`;
        const timestamp = Date.now();
        
        if (!this.errorLogCache.has(key)) {
            this.errorLogCache.set(key, timestamp);
        }
    }

    isModuleDisabled(moduleName) {
        return this.disabledModules.has(moduleName);
    }

    disableModule(moduleName, reason) {
        this.disabledModules.add(moduleName);
        this.logSecurityEvent(`Module disabled: ${moduleName}`, reason);
    }

    cleanup() {
        const now = Date.now();
        
        for (const [key, timestamp] of this.errorLogCache.entries()) {
            if (now - timestamp > SECURITY_CONFIG.ERROR_CACHE_TTL_MS) {
                this.errorLogCache.delete(key);
            }
        }
    }
}

const GlobalSecurityManager = new SecurityManager();

// ============================================================================
// SECTION 6: PUBLIC API FUNCTIONS - WITH ALL EXPORTS
// ============================================================================

export function createMessage(type, payload = {}, options = {}) {
    if (!Object.values(STRICT_MESSAGE_TYPES).includes(type)) {
        // Allow but warn
    }
    
    const now = Date.now();
    const source = options.source || (window.parent === window ? MESSAGE_SOURCE.PARENT : MESSAGE_SOURCE.IFRAME);
    
    const message = {
        id: GlobalMessageIdAuthority.generate(),
        type: type,
        source: source,
        target: options.target || 'all',
        timestamp: now,
        status: MESSAGE_STATUS.PENDING,
        version: '2.0.3',
        session: null,
        payload: payload || {},
        ack: options.requireAck || false,
        retryCount: 0,
        _internal: false
    };
    
    return message;
}

export function generateMessageId() {
    return GlobalMessageIdAuthority.generate();
}

export function validateMessageId(id) {
    return GlobalMessageIdAuthority.validate(id);
}

export function validateMessageSchema(message, schemaName = 'BASE') {
    const schema = MESSAGE_SCHEMAS[schemaName] || MESSAGE_SCHEMAS.BASE;
    const normalized = GlobalValidationEngine.normalizeMessage(message);
    
    if (!normalized) {
        return {
            isValid: false,
            errors: ['Failed to normalize message'],
            normalized: null
        };
    }
    
    const errors = GlobalValidationEngine.validateAgainstSchema(normalized, schema);
    
    return {
        isValid: errors.length === 0,
        errors,
        normalized
    };
}

export function messageResponse(originalType, data, success = true, error = null) {
    return createMessage(
        originalType + '_RESPONSE',
        {
            originalType,
            success,
            error,
            ...data,
            responseTimestamp: Date.now()
        },
        {
            source: MESSAGE_SOURCE.RESPONSE,
            status: success ? MESSAGE_STATUS.ACKNOWLEDGED : MESSAGE_STATUS.REJECTED,
            requireAck: false
        }
    );
}

export async function sendPostMessage(message, options = {}) {
    const normalized = GlobalValidationEngine.normalizeMessage(message);
    if (!normalized) {
        return Promise.reject(new Error('Failed to normalize message'));
    }
    
    const validation = GlobalValidationEngine.validateMessage(normalized, { isIncoming: false });
    if (!validation.isValid) {
        return Promise.reject(new Error(`Message validation failed: ${validation.errors.join(', ')}`));
    }
    
    if (normalized.source === MESSAGE_SOURCE.IFRAME && 
        normalized.target !== 'iframe' && 
        !GlobalSecurityManager.handshakeComplete) {
        await GlobalSecurityManager.waitForHandshake();
    }
    
    const sendOptions = {
        targetOrigin: options.targetOrigin || '*',
        requireAck: options.requireAck !== undefined ? options.requireAck : true,
        priority: options.priority || MESSAGE_PRIORITY.NORMAL,
        timeout: options.timeout || DELIVERY_CONFIG.ACK_TIMEOUT_MS
    };
    
    return GlobalDeliverySystem.send(normalized, sendOptions);
}

export const sendMessage = sendPostMessage;

export function sendParentMessage(type, data, targetOrigin = '*', options = {}) {
    const message = createMessage(type, data, {
        target: 'parent',
        requireAck: options.requireAck
    });
    
    return sendPostMessage(message, {
        targetOrigin,
        requireAck: options.requireAck,
        priority: options.priority || MESSAGE_PRIORITY.NORMAL
    });
}

export function sendToParent(type, payload, options = {}) {
    return sendParentMessage(type, payload, '*', options);
}

export function sendMessageToIframe(iframe, type, data, targetOrigin = '*') {
    if (!iframe || !iframe.contentWindow) {
        return Promise.reject(new Error('Invalid iframe target'));
    }
    
    const message = createMessage(type, data, {
        target: 'iframe',
        source: MESSAGE_SOURCE.PARENT
    });
    
    const originalSend = window.originalPostMessage || window.postMessage;
    
    return new Promise((resolve, reject) => {
        try {
            originalSend.call(iframe.contentWindow, message, targetOrigin);
            resolve({
                success: true,
                messageId: message.id,
                status: 'sent',
                timestamp: Date.now()
            });
        } catch (error) {
            reject(error);
        }
    });
}

function createSafeMessageHandler(callback, filterTypes) {
    return function safeMessageHandler(event) {
        try {
            if (!event.data || typeof event.data !== 'object') return;
            
            const securityCheck = GlobalSecurityManager.validateIncomingMessage(event.data, event);
            if (!securityCheck.valid) return;
            
            const normalized = GlobalValidationEngine.normalizeMessage(event.data);
            if (!normalized) return;
            
            const validation = GlobalValidationEngine.validateMessage(normalized, {
                isIncoming: true,
                origin: event.origin
            });
            
            if (!validation.isValid) {
                return;
            }
            
            if (GlobalSecurityManager.isModuleDisabled('messageHandler')) return;
            
            if (filterTypes && Array.isArray(filterTypes) && filterTypes.length > 0) {
                if (!filterTypes.includes(normalized.type)) return;
            }
            
            GlobalDeliverySystem.receive(normalized);
            callback(normalized, event);
        } catch (error) {
            GlobalSecurityManager.logSecurityError('messageHandler', error);
        }
    };
}

export function listenToParentMessages(callback, filterTypes = null) {
    if (GlobalSecurityManager.isModuleDisabled('listenToParentMessages')) {
        return () => {};
    }
    
    if (typeof callback !== 'function') {
        return () => {};
    }
    
    const handler = createSafeMessageHandler(callback, filterTypes);
    window.addEventListener('message', handler);
    
    return () => {
        try {
            window.removeEventListener('message', handler);
        } catch (error) {
            GlobalSecurityManager.logSecurityError('listenerCleanup', error);
        }
    };
}

export function configureMessaging(config = {}) {
    const currentConfig = {
        strictMode: true,
        validateOrigins: SECURITY_CONFIG.REJECT_UNAUTHORIZED_ORIGINS,
        debounceEnabled: true,
        throttleEnabled: true,
        allowedOrigins: [...ALLOWED_ORIGINS],
        cooldownMs: 500,
        ackTimeout: DELIVERY_CONFIG.ACK_TIMEOUT_MS,
        maxRetries: DELIVERY_CONFIG.MAX_RETRY_ATTEMPTS
    };
    
    return { ...currentConfig };
}

export function getDeliveryStats() {
    return GlobalDeliverySystem.getStats();
}

export function getMessageIdStats() {
    return GlobalMessageIdAuthority.getStats();
}

async function safeFetch(url, options = {}) {
    try {
        const fetchFunction = window.fetch;
        const response = await fetchFunction(url, options);
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error details');
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        return response;
    } catch (error) {
        throw error;
    }
}

// ============================================================================
// MESSAGE API FUNCTIONS - All functions required by friend-core.js
// ============================================================================

export async function sendMessageHTTP(conversationId, content, messageType = 'text', metadata = {}) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content,
                type: messageType,
                metadata,
                timestamp: new Date().toISOString()
            })
        });

        const messageData = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(STRICT_MESSAGE_TYPES.MESSAGE_SENT, {
                conversationId,
                message: messageData
            }, { requireAck: false });
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return messageData;
    } catch (error) {
        throw error;
    }
}

export async function fetchMessages(conversationId, limit = 50, before = null, after = null) {
    try {
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        if (before) params.append('before', before);
        if (after) params.append('after', after);

        const response = await safeFetch(`/api/conversations/${conversationId}/messages?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });

        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getMessages(conversationId, limit = 50, before = null, after = null) {
    return fetchMessages(conversationId, limit, before, after);
}

export async function markAsRead(conversationId, messageIds) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/messages/read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messageIds: Array.isArray(messageIds) ? messageIds : [messageIds],
                readAt: new Date().toISOString()
            })
        });

        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function markChatAsRead(conversationId, messageIds) {
    return markAsRead(conversationId, messageIds);
}

export async function addReaction(messageId, reaction) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/reactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reaction,
                timestamp: new Date().toISOString()
            })
        });

        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function clearChatHistory(conversationId, archive = true) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/messages`, {
            method: archive ? 'POST' : 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: archive ? JSON.stringify({
                action: 'archive',
                timestamp: new Date().toISOString()
            }) : null
        });

        const result = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(STRICT_MESSAGE_TYPES.CHAT_HISTORY_CLEARED, {
                conversationId,
                archived: archive,
                timestamp: result.timestamp
            }, { requireAck: false });
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return result;
    } catch (error) {
        throw error;
    }
}

export async function deleteMessage(messageId, forEveryone = false) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                forEveryone,
                deletedAt: new Date().toISOString()
            })
        });

        const result = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(STRICT_MESSAGE_TYPES.MESSAGE_DELETED, {
                messageId,
                forEveryone,
                timestamp: result.deletedAt
            }, { requireAck: false });
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return result;
    } catch (error) {
        throw error;
    }
}

export async function editMessage(messageId, newContent, metadata = {}) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: newContent,
                metadata,
                editedAt: new Date().toISOString()
            })
        });

        const updatedMessage = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(STRICT_MESSAGE_TYPES.MESSAGE_EDITED, {
                messageId,
                message: updatedMessage,
                timestamp: updatedMessage.editedAt
            }, { requireAck: false });
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return updatedMessage;
    } catch (error) {
        throw error;
    }
}

export async function forwardMessage(messageId, targetConversationId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/forward`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                targetConversationId,
                forwardedAt: new Date().toISOString()
            })
        });

        const forwardedMessage = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(STRICT_MESSAGE_TYPES.MESSAGE_FORWARDED, {
                originalMessageId: messageId,
                targetConversationId,
                message: forwardedMessage,
                timestamp: forwardedMessage.timestamp
            }, { requireAck: false });
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return forwardedMessage;
    } catch (error) {
        throw error;
    }
}

export async function pinMessage(messageId, pin = true) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/pin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pinned: pin,
                pinnedAt: pin ? new Date().toISOString() : null
            })
        });

        const updatedMessage = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(
                pin ? STRICT_MESSAGE_TYPES.MESSAGE_PINNED : STRICT_MESSAGE_TYPES.MESSAGE_UNPINNED,
                {
                    messageId,
                    message: updatedMessage,
                    pinned: pin
                },
                { requireAck: false }
            );
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return updatedMessage;
    } catch (error) {
        throw error;
    }
}

export async function searchMessages(query, conversationId = null, limit = 20, offset = 0) {
    try {
        const params = new URLSearchParams();
        params.append('q', query);
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());
        if (conversationId) params.append('conversationId', conversationId);

        const response = await safeFetch(`/api/messages/search?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });

        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationInfo(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}`, {
            method: 'GET',
            headers: {}
        });

        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function createConversation(participantIds, title = null, type = 'direct') {
    try {
        const response = await safeFetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                participantIds,
                title,
                type,
                createdAt: new Date().toISOString()
            })
        });

        const newConversation = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(STRICT_MESSAGE_TYPES.CONVERSATION_CREATED, {
                conversation: newConversation,
                timestamp: newConversation.createdAt
            }, { requireAck: false });
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return newConversation;
    } catch (error) {
        throw error;
    }
}

export async function leaveConversation(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/leave`, {
            method: 'POST',
            headers: {}
        });

        const result = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(STRICT_MESSAGE_TYPES.CONVERSATION_LEFT, {
                conversationId,
                timestamp: new Date().toISOString()
            }, { requireAck: false });
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return result;
    } catch (error) {
        throw error;
    }
}

export function simulateIncomingCall(callerInfo) {
    if (GlobalSecurityManager.isModuleDisabled('simulateIncomingCall')) {
        return false;
    }
    
    try {
        if (!callerInfo || typeof callerInfo !== 'object') {
            return false;
        }
        
        const defaultCallerInfo = {
            id: 'simulated-caller-' + Date.now(),
            name: 'Test Caller',
            avatar: null,
            isVideo: false,
            ...callerInfo
        };
        
        const event = new CustomEvent('incoming-call', {
            detail: {
                caller: defaultCallerInfo,
                timestamp: Date.now(),
                callId: 'simulated-call-' + Date.now()
            }
        });
        window.dispatchEvent(event);
        
        if (window.parent !== window) {
            const notification = createMessage(STRICT_MESSAGE_TYPES.INCOMING_CALL, {
                caller: defaultCallerInfo,
                simulated: true
            }, { requireAck: false });
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return true;
    } catch (error) {
        GlobalSecurityManager.disableModule('simulateIncomingCall', 'Unhandled error');
        return false;
    }
}

export function buildSettingsMenu(containerId, options = {}) {
    if (GlobalSecurityManager.isModuleDisabled('buildSettingsMenu')) {
        return false;
    }
    
    try {
        const container = document.getElementById(containerId);
        if (!container) {
            return false;
        }
        
        const menuStructure = options.menuStructure || [
            { id: 'general', label: 'General', icon: '⚙️', enabled: true },
            { id: 'privacy', label: 'Privacy', icon: '🔒', enabled: true },
            { id: 'notifications', label: 'Notifications', icon: '🔔', enabled: true },
            { id: 'appearance', label: 'Appearance', icon: '🎨', enabled: true }
        ];
        
        const menuHTML = `
            <div class="settings-menu-container">
                ${menuStructure.map(item => `
                    <div class="settings-menu-item ${item.enabled ? '' : 'disabled'}" 
                         data-section="${item.id}">
                        <span class="settings-menu-icon">${item.icon}</span>
                        <span class="settings-menu-label">${item.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.innerHTML = menuHTML;
        
        return true;
    } catch (error) {
        GlobalSecurityManager.disableModule('buildSettingsMenu', 'Unhandled error');
        return false;
    }
}

export function sendTypingIndicator(conversationId, isTyping = true) {
    if (GlobalSecurityManager.isModuleDisabled('sendTypingIndicator')) {
        return false;
    }
    
    try {
        const typingMessage = createMessage(
            STRICT_MESSAGE_TYPES.USER_TYPING,
            {
                conversationId,
                isTyping,
                userId: null
            },
            { requireAck: false }
        );
        
        if (window.parent !== window) {
            sendPostMessage(typingMessage, { requireAck: false }).catch(() => {});
        }
        
        const typingEvent = new CustomEvent('user-typing', {
            detail: { conversationId, isTyping }
        });
        window.dispatchEvent(typingEvent);
        
        return true;
    } catch (error) {
        GlobalSecurityManager.disableModule('sendTypingIndicator', 'Unhandled error');
        return false;
    }
}

export function logTransparencyAction(action, data = {}) {
    if (GlobalSecurityManager.isModuleDisabled('logTransparencyAction')) {
        return false;
    }
    
    try {
        const logData = {
            action,
            data,
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: Date.now()
        };
        
        if (window.parent !== window) {
            const notification = createMessage(
                STRICT_MESSAGE_TYPES.TRANSPARENCY_LOG,
                logData,
                { requireAck: false }
            );
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return true;
    } catch (error) {
        GlobalSecurityManager.disableModule('logTransparencyAction', 'Unhandled error');
        return false;
    }
}

export function openChat(conversationId, options = {}) {
    if (GlobalSecurityManager.isModuleDisabled('openChat')) {
        return false;
    }
    
    try {
        const chatEvent = new CustomEvent('open-chat', {
            detail: {
                conversationId,
                options,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(chatEvent);
        
        if (window.parent !== window) {
            const notification = createMessage(
                STRICT_MESSAGE_TYPES.DATA_UPDATE,
                {
                    type: 'CHAT_OPENED',
                    conversationId,
                    options
                },
                { requireAck: false }
            );
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return true;
    } catch (error) {
        GlobalSecurityManager.disableModule('openChat', 'Unhandled error');
        return false;
    }
}

export async function getMessageById(messageId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}`, {
            method: 'GET',
            headers: {}
        });

        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversations(limit = 50, offset = 0) {
    try {
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());

        const response = await safeFetch(`/api/conversations?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });

        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function updateConversation(conversationId, updates) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        });

        const updatedConversation = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(
                STRICT_MESSAGE_TYPES.DATA_UPDATE,
                {
                    type: 'CONVERSATION_UPDATED',
                    conversationId,
                    conversation: updatedConversation
                },
                { requireAck: false }
            );
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return updatedConversation;
    } catch (error) {
        throw error;
    }
}

export async function addParticipants(conversationId, participantIds) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/participants`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                participantIds,
                addedAt: new Date().toISOString()
            })
        });

        const updatedConversation = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(
                STRICT_MESSAGE_TYPES.DATA_UPDATE,
                {
                    type: 'PARTICIPANTS_ADDED',
                    conversationId,
                    participantIds,
                    conversation: updatedConversation
                },
                { requireAck: false }
            );
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return updatedConversation;
    } catch (error) {
        throw error;
    }
}

export async function removeParticipants(conversationId, participantIds) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/participants`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                participantIds,
                removedAt: new Date().toISOString()
            })
        });

        const updatedConversation = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(
                STRICT_MESSAGE_TYPES.DATA_UPDATE,
                {
                    type: 'PARTICIPANTS_REMOVED',
                    conversationId,
                    participantIds,
                    conversation: updatedConversation
                },
                { requireAck: false }
            );
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return updatedConversation;
    } catch (error) {
        throw error;
    }
}

export async function getUnreadCount(conversationId = null) {
    try {
        let url = '/api/messages/unread/count';
        if (conversationId) {
            url = `/api/conversations/${conversationId}/messages/unread/count`;
        }

        const response = await safeFetch(url, {
            method: 'GET',
            headers: {}
        });

        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getMessageStatistics(conversationId, period = 'month') {
    try {
        const params = new URLSearchParams();
        params.append('period', period);

        const response = await safeFetch(`/api/conversations/${conversationId}/messages/statistics?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });

        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function exportConversation(conversationId, format = 'json') {
    try {
        const params = new URLSearchParams();
        params.append('format', format);

        const response = await safeFetch(`/api/conversations/${conversationId}/export?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conversation-${conversationId}-export.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        return blob;
    } catch (error) {
        throw error;
    }
}

export async function sendBulkMessages(conversationIds, content, messageType = 'text', metadata = {}) {
    try {
        const response = await safeFetch('/api/messages/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversationIds,
                content,
                type: messageType,
                metadata,
                timestamp: new Date().toISOString()
            })
        });

        const results = await response.json();
        
        if (window.parent !== window) {
            const notification = createMessage(
                STRICT_MESSAGE_TYPES.DATA_UPDATE,
                {
                    type: 'BULK_MESSAGES_SENT',
                    conversationIds,
                    results
                },
                { requireAck: false }
            );
            
            sendPostMessage(notification, { requireAck: false }).catch(() => {});
        }
        
        return results;
    } catch (error) {
        throw error;
    }
}

// ============================================================================
// ADDITIONAL FUNCTIONS REQUIRED BY FRIEND-CORE.JS
// ============================================================================

export async function reactToMessage(messageId, reaction) {
    return addReaction(messageId, reaction);
}

export async function getMessageHistory(conversationId, limit = 50, before = null) {
    return fetchMessages(conversationId, limit, before);
}

export async function archiveConversation(conversationId) {
    return updateConversation(conversationId, { archived: true });
}

export async function muteConversation(conversationId, muted = true) {
    return updateConversation(conversationId, { muted });
}

export async function pinConversation(conversationId, pinned = true) {
    return updateConversation(conversationId, { pinned });
}

export async function getMessageStatus(messageId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/status`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getTypingStatus(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/typing`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function setTypingStatus(conversationId, isTyping) {
    return sendTypingIndicator(conversationId, isTyping);
}

export async function getOnlineStatus(userId) {
    try {
        const response = await safeFetch(`/api/users/${userId}/online`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getLastSeen(userId) {
    try {
        const response = await safeFetch(`/api/users/${userId}/last-seen`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getMessageReactions(messageId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/reactions`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getMessageThread(messageId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/thread`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getPinnedMessages(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/pinned`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getStarredMessages(userId) {
    try {
        const response = await safeFetch(`/api/users/${userId}/starred`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getSavedMessages(userId) {
    try {
        const response = await safeFetch(`/api/users/${userId}/saved`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function saveMessage(messageId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/save`, {
            method: 'POST',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function unsaveMessage(messageId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/unsave`, {
            method: 'POST',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function replyToMessage(messageId, content) {
    return sendMessageHTTP(null, content, 'reply', { replyTo: messageId });
}

export async function quoteMessage(messageId, content) {
    return sendMessageHTTP(null, content, 'quote', { quote: messageId });
}

export async function getMessageLink(messageId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/link`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function shareMessage(messageId, targetUserId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetUserId })
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function reportMessage(messageId, reason) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function deleteForEveryone(messageId) {
    return deleteMessage(messageId, true);
}

export async function deleteForMe(messageId) {
    return deleteMessage(messageId, false);
}

export async function getDeletedMessages(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/deleted`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function restoreDeletedMessage(messageId) {
    try {
        const response = await safeFetch(`/api/messages/${messageId}/restore`, {
            method: 'POST',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getArchivedConversations() {
    try {
        const response = await safeFetch('/api/conversations/archived', {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getMutedConversations() {
    try {
        const response = await safeFetch('/api/conversations/muted', {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getPinnedConversations() {
    try {
        const response = await safeFetch('/api/conversations/pinned', {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationSettings(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/settings`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function updateConversationSettings(conversationId, settings) {
    return updateConversation(conversationId, { settings });
}

export async function getConversationMembers(conversationId) {
    return getGroupMembers(conversationId);
}

export async function addConversationMembers(conversationId, memberIds) {
    return addParticipants(conversationId, memberIds);
}

export async function removeConversationMembers(conversationId, memberIds) {
    return removeParticipants(conversationId, memberIds);
}

export async function promoteConversationMember(conversationId, memberId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/members/${memberId}/promote`, {
            method: 'POST',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function demoteConversationMember(conversationId, memberId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/members/${memberId}/demote`, {
            method: 'POST',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function joinConversation(conversationId) {
    return addParticipants(conversationId, ['me']);
}

export async function getConversationInviteLink(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/invite`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function revokeConversationInviteLink(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/invite`, {
            method: 'DELETE',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationBans(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/bans`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function banConversationMember(conversationId, memberId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/bans`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ memberId })
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function unbanConversationMember(conversationId, memberId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/bans/${memberId}`, {
            method: 'DELETE',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationMutes(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/mutes`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function muteConversationMember(conversationId, memberId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/mutes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ memberId })
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function unmuteConversationMember(conversationId, memberId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/mutes/${memberId}`, {
            method: 'DELETE',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationPins(conversationId) {
    return getPinnedMessages(conversationId);
}

export async function pinConversationMessage(conversationId, messageId) {
    return pinMessage(messageId, true);
}

export async function unpinConversationMessage(conversationId, messageId) {
    return pinMessage(messageId, false);
}

export async function getConversationMedia(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/media`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationFiles(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/files`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationLinks(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/links`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationVoiceMessages(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/voice`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationVideoMessages(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/video`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationStickers(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/stickers`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function getConversationGifs(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/gifs`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function searchConversation(conversationId, query) {
    return searchMessages(query, conversationId);
}

export async function filterConversationByType(conversationId, messageType) {
    try {
        const params = new URLSearchParams();
        params.append('type', messageType);
        const response = await safeFetch(`/api/conversations/${conversationId}/messages/filter?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function filterConversationByDate(conversationId, startDate, endDate) {
    try {
        const params = new URLSearchParams();
        params.append('start', startDate);
        params.append('end', endDate);
        const response = await safeFetch(`/api/conversations/${conversationId}/messages/date?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function filterConversationBySender(conversationId, senderId) {
    try {
        const params = new URLSearchParams();
        params.append('sender', senderId);
        const response = await safeFetch(`/api/conversations/${conversationId}/messages/sender?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function filterConversationByMention(conversationId, userId) {
    try {
        const params = new URLSearchParams();
        params.append('mention', userId);
        const response = await safeFetch(`/api/conversations/${conversationId}/messages/mentions?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function filterConversationByHashtag(conversationId, hashtag) {
    try {
        const params = new URLSearchParams();
        params.append('hashtag', hashtag);
        const response = await safeFetch(`/api/conversations/${conversationId}/messages/hashtags?${params.toString()}`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function importConversation(conversationId, data) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}/import`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function backupConversations() {
    try {
        const response = await safeFetch('/api/conversations/backup', {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function restoreConversations(backupData) {
    try {
        const response = await safeFetch('/api/conversations/restore', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(backupData)
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

export async function clearConversationHistory(conversationId) {
    return clearChatHistory(conversationId, false);
}

export async function deleteConversation(conversationId) {
    try {
        const response = await safeFetch(`/api/conversations/${conversationId}`, {
            method: 'DELETE',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

// ============================================================================
// FILE UPLOAD/DOWNLOAD FUNCTIONS
// ============================================================================

export async function uploadFile(conversationId, file, onProgress = null) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        if (conversationId) formData.append('conversationId', conversationId);
        
        const xhr = new XMLHttpRequest();
        
        const uploadPromise = new Promise((resolve, reject) => {
            // FIX: use absolute URL and include auth token
            const token = localStorage.getItem('authToken') || localStorage.getItem('token') ||
                          sessionStorage.getItem('authToken') || sessionStorage.getItem('token') || '';
            const baseUrl = window.__API_BASE_URL || window.API_BASE_URL || '';
            xhr.open('POST', `${baseUrl}/api/files/upload`);
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            
            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) onProgress(e.loaded / e.total);
                });
            }
            
            xhr.onload = () => {
                // FIX: accept both 200 and 201 (new files.js returns 201)
                if (xhr.status === 200 || xhr.status === 201) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        reject(new Error('Invalid response'));
                    }
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            };
            
            xhr.onerror = () => reject(new Error('Network error during upload'));
            xhr.send(formData);
        });
        
        return uploadPromise;
    } catch (error) {
        throw error;
    }
}

export async function downloadFile(fileId, fileName) {
    try {
        const response = await safeFetch(`/api/files/${fileId}/download`, {
            method: 'GET'
        });
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || `file-${fileId}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        return { success: true };
    } catch (error) {
        throw error;
    }
}

export async function getFileInfo(fileId) {
    try {
        const response = await safeFetch(`/api/files/${fileId}`, {
            method: 'GET',
            headers: {}
        });
        return await response.json();
    } catch (error) {
        throw error;
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initializeGlobalAPI() {
    if (GlobalSecurityManager.initState.status === 'ready' || 
        GlobalSecurityManager.initState.status === 'initializing') {
        return Promise.resolve({
            STRICT_MESSAGE_TYPES,
            MESSAGE_TYPES,
            MESSAGE_STATUS,
            MESSAGE_SOURCE,
            MESSAGE_PRIORITY,
            createMessage,
            generateMessageId,
            validateMessageId,
            validateMessageSchema,
            messageResponse,
            sendPostMessage,
            sendMessage,
            sendParentMessage,
            sendToParent,
            sendMessageToIframe,
            listenToParentMessages,
            configureMessaging,
            getDeliveryStats,
            getMessageIdStats,
            sendMessageHTTP,
            fetchMessages,
            getMessages,
            markAsRead,
            markChatAsRead,
            addReaction,
            reactToMessage,
            clearChatHistory,
            deleteMessage,
            editMessage,
            forwardMessage,
            pinMessage,
            searchMessages,
            getConversationInfo,
            createConversation,
            leaveConversation,
            simulateIncomingCall,
            buildSettingsMenu,
            sendTypingIndicator,
            logTransparencyAction,
            openChat,
            getMessageById,
            getConversations,
            updateConversation,
            addParticipants,
            removeParticipants,
            getUnreadCount,
            getMessageStatistics,
            exportConversation,
            sendBulkMessages,
            getMessageHistory,
            archiveConversation,
            muteConversation,
            pinConversation,
            getMessageStatus,
            getTypingStatus,
            setTypingStatus,
            getOnlineStatus,
            getLastSeen,
            getMessageReactions,
            getMessageThread,
            getPinnedMessages,
            getStarredMessages,
            getSavedMessages,
            saveMessage,
            unsaveMessage,
            replyToMessage,
            quoteMessage,
            getMessageLink,
            shareMessage,
            reportMessage,
            deleteForEveryone,
            deleteForMe,
            getDeletedMessages,
            restoreDeletedMessage,
            getArchivedConversations,
            getMutedConversations,
            getPinnedConversations,
            getConversationSettings,
            updateConversationSettings,
            getConversationMembers,
            addConversationMembers,
            removeConversationMembers,
            promoteConversationMember,
            demoteConversationMember,
            joinConversation,
            getConversationInviteLink,
            revokeConversationInviteLink,
            getConversationBans,
            banConversationMember,
            unbanConversationMember,
            getConversationMutes,
            muteConversationMember,
            unmuteConversationMember,
            getConversationPins,
            pinConversationMessage,
            unpinConversationMessage,
            getConversationMedia,
            getConversationFiles,
            getConversationLinks,
            getConversationVoiceMessages,
            getConversationVideoMessages,
            getConversationStickers,
            getConversationGifs,
            searchConversation,
            filterConversationByType,
            filterConversationByDate,
            filterConversationBySender,
            filterConversationByMention,
            filterConversationByHashtag,
            importConversation,
            backupConversations,
            restoreConversations,
            clearConversationHistory,
            deleteConversation,
            uploadFile,
            downloadFile,
            getFileInfo
        });
    }
    
    if (GlobalSecurityManager.initState.promise) {
        return GlobalSecurityManager.initState.promise;
    }
    
    GlobalSecurityManager.initState.status = 'initializing';
    GlobalSecurityManager.initState.timestamp = Date.now();
    
    GlobalSecurityManager.initState.promise = new Promise((resolve) => {
        try {
            if (!window.__API_MESSAGES) {
                window.__API_MESSAGES = {
                    ready: true,
                    version: '2.0.3',
                    exports: {},
                    config: {
                        strictMode: true,
                        validateOrigins: SECURITY_CONFIG.REJECT_UNAUTHORIZED_ORIGINS,
                        allowedOrigins: [...ALLOWED_ORIGINS],
                        ackTimeout: DELIVERY_CONFIG.ACK_TIMEOUT_MS,
                        maxRetries: DELIVERY_CONFIG.MAX_RETRY_ATTEMPTS
                    }
                };
            }
            
            window.__API_MESSAGES.exports = {
                STRICT_MESSAGE_TYPES,
                MESSAGE_TYPES,
                MESSAGE_STATUS,
                MESSAGE_SOURCE,
                MESSAGE_PRIORITY,
                createMessage,
                generateMessageId,
                validateMessageId,
                validateMessageSchema,
                messageResponse,
                sendPostMessage,
                sendMessage,
                sendParentMessage,
                sendToParent,
                sendMessageToIframe,
                listenToParentMessages,
                configureMessaging,
                getDeliveryStats,
                getMessageIdStats,
                sendMessageHTTP,
                fetchMessages,
                getMessages,
                markAsRead,
                markChatAsRead,
                addReaction,
                reactToMessage,
                clearChatHistory,
                deleteMessage,
                editMessage,
                forwardMessage,
                pinMessage,
                searchMessages,
                getConversationInfo,
                createConversation,
                leaveConversation,
                simulateIncomingCall,
                buildSettingsMenu,
                sendTypingIndicator,
                logTransparencyAction,
                openChat,
                getMessageById,
                getConversations,
                updateConversation,
                addParticipants,
                removeParticipants,
                getUnreadCount,
                getMessageStatistics,
                exportConversation,
                sendBulkMessages,
                getMessageHistory,
                archiveConversation,
                muteConversation,
                pinConversation,
                getMessageStatus,
                getTypingStatus,
                setTypingStatus,
                getOnlineStatus,
                getLastSeen,
                getMessageReactions,
                getMessageThread,
                getPinnedMessages,
                getStarredMessages,
                getSavedMessages,
                saveMessage,
                unsaveMessage,
                replyToMessage,
                quoteMessage,
                getMessageLink,
                shareMessage,
                reportMessage,
                deleteForEveryone,
                deleteForMe,
                getDeletedMessages,
                restoreDeletedMessage,
                getArchivedConversations,
                getMutedConversations,
                getPinnedConversations,
                getConversationSettings,
                updateConversationSettings,
                getConversationMembers,
                addConversationMembers,
                removeConversationMembers,
                promoteConversationMember,
                demoteConversationMember,
                joinConversation,
                getConversationInviteLink,
                revokeConversationInviteLink,
                getConversationBans,
                banConversationMember,
                unbanConversationMember,
                getConversationMutes,
                muteConversationMember,
                unmuteConversationMember,
                getConversationPins,
                pinConversationMessage,
                unpinConversationMessage,
                getConversationMedia,
                getConversationFiles,
                getConversationLinks,
                getConversationVoiceMessages,
                getConversationVideoMessages,
                getConversationStickers,
                getConversationGifs,
                searchConversation,
                filterConversationByType,
                filterConversationByDate,
                filterConversationBySender,
                filterConversationByMention,
                filterConversationByHashtag,
                importConversation,
                backupConversations,
                restoreConversations,
                clearConversationHistory,
                deleteConversation,
                uploadFile,
                downloadFile,
                getFileInfo
            };
            
            window.__API_MESSAGES.ready = true;
            GlobalSecurityManager.initState.status = 'ready';
            
            if (!window.apiMessages) {
                window.apiMessages = window.__API_MESSAGES.exports;
            }
            
            const readyMessage = createMessage(
                STRICT_MESSAGE_TYPES.API_READY,
                { version: '2.0.3' },
                { source: MESSAGE_SOURCE.SYSTEM, status: MESSAGE_STATUS.ACKNOWLEDGED }
            );
            
            sendPostMessage(readyMessage, { requireAck: false }).catch(() => {});
            
            const readyEvent = new CustomEvent('api-messages-ready', {
                detail: readyMessage
            });
            window.dispatchEvent(readyEvent);
            
            resolve(window.__API_MESSAGES.exports);
        } catch (error) {
            GlobalSecurityManager.initState.status = 'failed';
            resolve({});
        }
    });
    
    return GlobalSecurityManager.initState.promise;
}

if (!window.originalPostMessage) {
    window.originalPostMessage = window.postMessage;
}

window.postMessage = function(message, targetOrigin, transfer) {
    if (message && typeof message === 'object' && message.id && message.type) {
        return window.originalPostMessage.call(this, message, targetOrigin, transfer);
    }
    return window.originalPostMessage.call(this, message, targetOrigin, transfer);
};

setTimeout(() => {
    if (GlobalSecurityManager.initState.status === 'not_started') {
        initializeGlobalAPI();
    }
    
    if (window.parent !== window) {
        setTimeout(() => {
            GlobalSecurityManager.performSafeHandshake();
        }, 500);
    }
}, 50);

export default {
    STRICT_MESSAGE_TYPES,
    MESSAGE_TYPES,
    MESSAGE_STATUS,
    MESSAGE_SOURCE,
    MESSAGE_PRIORITY,
    createMessage,
    generateMessageId,
    validateMessageId,
    validateMessageSchema,
    messageResponse,
    sendPostMessage,
    sendMessage,
    sendParentMessage,
    sendToParent,
    sendMessageToIframe,
    listenToParentMessages,
    configureMessaging,
    getDeliveryStats,
    getMessageIdStats,
    sendMessageHTTP,
    fetchMessages,
    getMessages,
    markAsRead,
    markChatAsRead,
    addReaction,
    reactToMessage,
    clearChatHistory,
    deleteMessage,
    editMessage,
    forwardMessage,
    pinMessage,
    searchMessages,
    getConversationInfo,
    createConversation,
    leaveConversation,
    simulateIncomingCall,
    buildSettingsMenu,
    sendTypingIndicator,
    logTransparencyAction,
    openChat,
    getMessageById,
    getConversations,
    updateConversation,
    addParticipants,
    removeParticipants,
    getUnreadCount,
    getMessageStatistics,
    exportConversation,
    sendBulkMessages,
    getMessageHistory,
    archiveConversation,
    muteConversation,
    pinConversation,
    getMessageStatus,
    getTypingStatus,
    setTypingStatus,
    getOnlineStatus,
    getLastSeen,
    getMessageReactions,
    getMessageThread,
    getPinnedMessages,
    getStarredMessages,
    getSavedMessages,
    saveMessage,
    unsaveMessage,
    replyToMessage,
    quoteMessage,
    getMessageLink,
    shareMessage,
    reportMessage,
    deleteForEveryone,
    deleteForMe,
    getDeletedMessages,
    restoreDeletedMessage,
    getArchivedConversations,
    getMutedConversations,
    getPinnedConversations,
    getConversationSettings,
    updateConversationSettings,
    getConversationMembers,
    addConversationMembers,
    removeConversationMembers,
    promoteConversationMember,
    demoteConversationMember,
    joinConversation,
    getConversationInviteLink,
    revokeConversationInviteLink,
    getConversationBans,
    banConversationMember,
    unbanConversationMember,
    getConversationMutes,
    muteConversationMember,
    unmuteConversationMember,
    getConversationPins,
    pinConversationMessage,
    unpinConversationMessage,
    getConversationMedia,
    getConversationFiles,
    getConversationLinks,
    getConversationVoiceMessages,
    getConversationVideoMessages,
    getConversationStickers,
    getConversationGifs,
    searchConversation,
    filterConversationByType,
    filterConversationByDate,
    filterConversationBySender,
    filterConversationByMention,
    filterConversationByHashtag,
    importConversation,
    backupConversations,
    restoreConversations,
    clearConversationHistory,
    deleteConversation,
    uploadFile,
    downloadFile,
    getFileInfo
};