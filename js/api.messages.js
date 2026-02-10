// js/api.messages.js
// ES Module for Message Handling - Contains ONLY functions missing from existing API modules
// Version: 1.0.6
// Date: 2024-01-02
// Updated: Added strict schema validation, handshake guards, race condition prevention
// Safety Update: Added safety guards for crash prevention, loop prevention, and error isolation

/**
 * STRICT_MESSAGE_TYPES constant - Frozen object defining standardized message types
 * for parent-child iframe communication with strict validation
 */
export const STRICT_MESSAGE_TYPES = Object.freeze({
    // Frame lifecycle messages
    CHILD_READY: 'CHILD_READY',
    FRAME_ID: 'FRAME_ID',
    
    // Session management messages
    REQUEST_SESSION: 'REQUEST_SESSION',
    SESSION_DATA: 'SESSION_DATA',
    SESSION_ERROR: 'SESSION_ERROR',
    
    // Error handling
    CHILD_ERROR: 'CHILD_ERROR',
    
    // Data update messages
    DATA_UPDATE: 'DATA_UPDATE',
    MESSAGE_SENT: 'MESSAGE_SENT',
    
    // User interaction
    USER_TYPING: 'USER_TYPING',
    
    // Legacy compatibility types
    CHAT_HISTORY_CLEARED: 'CHAT_HISTORY_CLEARED',
    MESSAGE_DELETED: 'MESSAGE_DELETED',
    MESSAGE_EDITED: 'MESSAGE_EDITED',
    MESSAGE_FORWARDED: 'MESSAGE_FORWARDED',
    MESSAGE_PINNED: 'MESSAGE_PINNED',
    MESSAGE_UNPINNED: 'MESSAGE_UNPINNED',
    CONVERSATION_CREATED: 'CONVERSATION_CREATED',
    CONVERSATION_LEFT: 'CONVERSATION_LEFT',
    TRANSPARENCY_LOG: 'TRANSPARENCY_LOG'
});

// Initialize MESSAGE_TYPES safely
let MESSAGE_TYPES = STRICT_MESSAGE_TYPES;

// Only merge with existing MESSAGE_TYPES if it exists and is an object
if (typeof window !== 'undefined' && window.MESSAGE_TYPES && typeof window.MESSAGE_TYPES === 'object') {
    MESSAGE_TYPES = Object.freeze({...STRICT_MESSAGE_TYPES, ...window.MESSAGE_TYPES});
}

export { MESSAGE_TYPES };

// =============== SAFETY GUARDS ADDITION ===============
// Track sent messages to prevent duplicates - ENHANCED with size limits
const sentMessageRegistry = new Map();
const receivedMessageRegistry = new Map(); // Added for incoming message deduplication
const MAX_REGISTRY_SIZE = 1000; // Prevent memory leaks
const RECEIVED_MESSAGE_TIMEOUT = 5000; // 5 seconds
const DEBOUNCE_DELAY = 300; // 300ms debounce
const INITIALIZATION_TIMEOUT = 10000; // 10 seconds max initialization
const HANDSHAKE_TIMEOUT = 5000; // 5 seconds handshake timeout

// Handshake safety guards
let handshakeAttempts = 0;
const MAX_HANDSHAKE_ATTEMPTS = 3;
let handshakeComplete = false;
let handshakeTimeoutId = null;

// Module failure tracking
const disabledModules = new Set();
const errorLogCache = new Map(); // Cache errors to prevent spam
const ERROR_CACHE_TIMEOUT = 60000; // 1 minute

// Allowed origins for secure messaging
const ALLOWED_ORIGINS = Object.freeze([
    window.location.origin,
    'http://localhost:3000',
    'http://localhost:8080',
    'https://*.yourdomain.com' // Replace with your actual domains
]);

// Cached trusted origin to prevent repeated checks
let cachedTrustedOrigin = null;

// Schema definitions for strict validation
const MESSAGE_SCHEMAS = Object.freeze({
    BASE: {
        type: 'string',
        timestamp: 'number',
        source: 'string',
        version: 'string'
    },
    CHILD_READY: {
        type: 'string',
        timestamp: 'number',
        source: 'string',
        version: 'string',
        data: 'object'
    },
    SESSION_DATA: {
        type: 'string',
        timestamp: 'number',
        source: 'string',
        version: 'string',
        data: 'object'
    },
    DATA_UPDATE: {
        type: 'string',
        timestamp: 'number',
        source: 'string',
        version: 'string',
        data: 'object'
    }
});

// Initialization state machine
const INIT_STATE = {
    NOT_STARTED: 'not_started',
    INITIALIZING: 'initializing',
    READY: 'ready',
    FAILED: 'failed'
};

let initializationState = INIT_STATE.NOT_STARTED;
let initializationPromise = null;

/**
 * Safety: Log error once per unique error to prevent spam
 */
function safeLogError(context, error, messageId = null) {
    const errorKey = `${context}:${error.message}:${messageId}`;
    const now = Date.now();
    
    // Clean old cache entries
    for (const [key, timestamp] of errorLogCache.entries()) {
        if (now - timestamp > ERROR_CACHE_TIMEOUT) {
            errorLogCache.delete(key);
        }
    }
    
    // Log only if not recently logged
    if (!errorLogCache.has(errorKey)) {
        errorLogCache.set(errorKey, now);
        console.warn(`⚠️ [Safety] ${context}: ${error.message}`, messageId ? `Message ID: ${messageId}` : '');
    }
}

/**
 * Safety: Check if module is disabled
 */
function isModuleDisabled(moduleName) {
    return disabledModules.has(moduleName);
}

/**
 * Safety: Disable a module to prevent crashes
 */
function disableModule(moduleName, reason) {
    disabledModules.add(moduleName);
    safeLogError(`Module ${moduleName} disabled`, new Error(reason));
}

/**
 * Safety: Validate message structure before processing
 */
function validateIncomingMessageStructure(message) {
    if (!message || typeof message !== 'object') {
        return { isValid: false, reason: 'Message is not an object' };
    }
    
    // Check required fields
    const requiredFields = ['type', 'source', 'messageId'];
    for (const field of requiredFields) {
        if (message[field] === undefined || message[field] === null) {
            return { isValid: false, reason: `Missing required field: ${field}` };
        }
    }
    
    // Check field types
    if (typeof message.type !== 'string') {
        return { isValid: false, reason: 'Field "type" must be a string' };
    }
    
    if (typeof message.source !== 'string') {
        return { isValid: false, reason: 'Field "source" must be a string' };
    }
    
    if (typeof message.messageId !== 'string') {
        return { isValid: false, reason: 'Field "messageId" must be a string' };
    }
    
    // Check for circular references in data
    if (message.data && typeof message.data === 'object') {
        try {
            JSON.stringify(message.data);
        } catch (e) {
            return { isValid: false, reason: 'Data field contains non-serializable values' };
        }
    }
    
    return { isValid: true, reason: null };
}

/**
 * Safety: Check for duplicate incoming messages
 */
function isDuplicateIncomingMessage(message) {
    if (!message || !message.messageId) {
        return false;
    }
    
    const messageId = message.messageId;
    const now = Date.now();
    
    if (receivedMessageRegistry.has(messageId)) {
        const receivedTime = receivedMessageRegistry.get(messageId);
        
        // Clean old entries
        if (now - receivedTime > RECEIVED_MESSAGE_TIMEOUT) {
            receivedMessageRegistry.delete(messageId);
            return false;
        }
        
        return true; // Duplicate detected
    }
    
    // Store message with timestamp
    receivedMessageRegistry.set(messageId, now);
    
    // Cleanup registry if too large
    if (receivedMessageRegistry.size > MAX_REGISTRY_SIZE) {
        // Remove oldest entries
        const entries = Array.from(receivedMessageRegistry.entries());
        entries.sort((a, b) => a[1] - b[1]);
        const toRemove = entries.slice(0, Math.floor(MAX_REGISTRY_SIZE / 2));
        for (const [id] of toRemove) {
            receivedMessageRegistry.delete(id);
        }
    }
    
    // Auto-cleanup after timeout
    setTimeout(() => {
        receivedMessageRegistry.delete(messageId);
    }, RECEIVED_MESSAGE_TIMEOUT);
    
    return false;
}

/**
 * Safety: Validate and cache origin
 */
function validateAndCacheOrigin(origin) {
    // Return cached result if available
    if (cachedTrustedOrigin === origin) {
        return true;
    }
    
    if (!origin || typeof origin !== 'string') {
        return false;
    }
    
    // Check exact matches first
    if (ALLOWED_ORIGINS.includes(origin)) {
        cachedTrustedOrigin = origin;
        return true;
    }
    
    // Check wildcard patterns
    for (const pattern of ALLOWED_ORIGINS) {
        if (pattern.includes('*')) {
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexPattern}$`);
            if (regex.test(origin)) {
                cachedTrustedOrigin = origin;
                return true;
            }
        }
    }
    
    return false;
}
// =============== END SAFETY GUARDS ===============

/**
 * normalizeLegacyMessage() - Normalize legacy message format to strict format
 * 
 * @param {object} message - Message object to normalize
 * @returns {object} Normalized message object
 */
function normalizeLegacyMessage(message) {
    if (!message || typeof message !== 'object') {
        return message;
    }
    
    const normalized = { ...message };
    
    // Normalize type field
    if (normalized.type === undefined && normalized.messageType !== undefined) {
        normalized.type = normalized.messageType;
        delete normalized.messageType;
    }
    
    // Normalize data field
    if (normalized.data === undefined && normalized.payload !== undefined) {
        normalized.data = normalized.payload;
        delete normalized.payload;
    }
    
    if (normalized.data === undefined && normalized.content !== undefined) {
        normalized.data = { content: normalized.content };
        delete normalized.content;
    }
    
    // Check for old-style action messages
    if (normalized.action && !normalized.type) {
        normalized.type = normalized.action.toUpperCase();
        delete normalized.action;
    }
    
    return normalized;
}

/**
 * injectMissingFields() - Inject missing required fields before sending
 * 
 * @param {object} message - Message object to fix
 * @param {boolean} isOutgoing - Whether this is an outgoing message
 * @returns {object} Fixed message object
 */
function injectMissingFields(message, isOutgoing = true) {
    const fixed = { ...message };
    const now = Date.now();
    
    // Inject source if missing
    if (!fixed.source || typeof fixed.source !== 'string') {
        if (isOutgoing) {
            fixed.source = window.parent === window ? 'parent' : 'iframe';
        } else {
            fixed.source = 'unknown';
        }
    }
    
    // Inject type if undefined
    if (fixed.type === undefined || fixed.type === null) {
        fixed.type = 'UNKNOWN_MESSAGE';
        console.warn('⚠️ injectMissingFields: Message type was undefined, set to UNKNOWN_MESSAGE');
    }
    
    // Inject id if missing
    if (!fixed.messageId && !fixed.id) {
        fixed.messageId = `msg_${now}_${Math.random().toString(36).substr(2, 9)}`;
    } else if (fixed.id && !fixed.messageId) {
        fixed.messageId = fixed.id;
        delete fixed.id;
    }
    
    // Inject timestamp if missing
    if (!fixed.timestamp || typeof fixed.timestamp !== 'number') {
        fixed.timestamp = now;
    }
    
    // Inject version for outgoing messages
    if (isOutgoing && (!fixed.version || typeof fixed.version !== 'string')) {
        fixed.version = '1.0.6';
    }
    
    return fixed;
}

/**
 * validateOrigin() - Strict origin validation for incoming messages
 * 
 * @param {string} origin - Origin to validate
 * @param {Array<string>} [allowedPatterns=ALLOWED_ORIGINS] - Allowed origin patterns
 * @returns {boolean} True if origin is allowed
 */
function validateOrigin(origin, allowedPatterns = ALLOWED_ORIGINS) {
    if (!origin || typeof origin !== 'string') {
        console.warn('⚠️ validateOrigin: Invalid origin format');
        return false;
    }
    
    // Check exact matches first
    if (allowedPatterns.includes(origin)) {
        return true;
    }
    
    // Check wildcard patterns
    for (const pattern of allowedPatterns) {
        if (pattern.includes('*')) {
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexPattern}$`);
            if (regex.test(origin)) {
                return true;
            }
        }
    }
    
    console.warn(`⚠️ validateOrigin: Origin not allowed - ${origin}`);
    return false;
}

/**
 * validateStrictMessage() - Strict validation for message structure and type
 * 
 * @param {object} message - Message object to validate
 * @param {boolean} [isOutgoing=false] - Whether this is an outgoing message
 * @returns {object} Validation result {isValid: boolean, errors: Array<string>, warnings: Array<string>}
 */
function validateStrictMessage(message, isOutgoing = false) {
    const errors = [];
    const warnings = [];
    
    // Basic structure validation
    if (!message || typeof message !== 'object') {
        errors.push('Message must be an object');
        return { isValid: false, errors, warnings };
    }
    
    // First normalize legacy messages
    const normalizedMessage = normalizeLegacyMessage(message);
    
    // Then inject missing fields
    const finalMessage = injectMissingFields(normalizedMessage, isOutgoing);
    
    // Required fields validation
    const requiredFields = ['type', 'timestamp', 'source'];
    
    for (const field of requiredFields) {
        if (finalMessage[field] === undefined || finalMessage[field] === null) {
            errors.push(`Message must have a "${field}" field`);
        }
    }
    
    if (errors.length > 0) {
        return { isValid: false, errors, warnings };
    }
    
    // Type validation
    if (typeof finalMessage.type !== 'string') {
        errors.push('Message "type" must be a string');
    }
    
    if (typeof finalMessage.timestamp !== 'number') {
        errors.push('Message "timestamp" must be a number');
    }
    
    if (typeof finalMessage.source !== 'string') {
        errors.push('Message "source" must be a string');
    }
    
    // Timestamp sanity check (not in future, not too old)
    const now = Date.now();
    if (finalMessage.timestamp > now + 60000) { // 1 minute in future
        warnings.push(`Message timestamp ${finalMessage.timestamp} is in the future`);
    }
    
    if (finalMessage.timestamp < now - 604800000) { // 1 week ago
        warnings.push(`Message timestamp ${finalMessage.timestamp} is very old`);
    }
    
    // Type validation against known types
    if (finalMessage.type) {
        const validTypes = Object.values(STRICT_MESSAGE_TYPES);
        if (!validTypes.includes(finalMessage.type) && !finalMessage.type.endsWith('_RESPONSE')) {
            // Check if it's a legacy type
            if (Object.values(MESSAGE_TYPES).includes(finalMessage.type)) {
                warnings.push(`Using legacy message type: ${finalMessage.type}`);
            } else {
                errors.push(`Unknown message type: ${finalMessage.type}`);
            }
        }
    }
    
    // Schema-based validation if schema exists
    const schema = MESSAGE_SCHEMAS[finalMessage.type] || MESSAGE_SCHEMAS.BASE;
    for (const [field, expectedType] of Object.entries(schema)) {
        if (finalMessage[field] !== undefined) {
            const actualType = typeof finalMessage[field];
            if (actualType !== expectedType) {
                errors.push(`Field "${field}" must be type "${expectedType}", got "${actualType}"`);
            }
        } else if (isOutgoing && field !== 'data') {
            // Outgoing messages must have all schema fields except optional data
            errors.push(`Missing required field "${field}" for outgoing message`);
        }
    }
    
    // Data field validation
    if (finalMessage.data !== undefined) {
        const validDataTypes = ['object', 'string', 'number', 'boolean'];
        const dataType = typeof finalMessage.data;
        if (!validDataTypes.includes(dataType) && finalMessage.data !== null) {
            errors.push(`Data field must be a valid JSON-serializable type, got "${dataType}"`);
        }
        
        // Deep validation for objects
        if (dataType === 'object' && finalMessage.data !== null) {
            try {
                JSON.stringify(finalMessage.data);
            } catch (e) {
                errors.push('Data field contains non-serializable values');
            }
        }
    }
    
    // Version validation for outgoing messages
    if (isOutgoing && (!finalMessage.version || typeof finalMessage.version !== 'string')) {
        errors.push('Outgoing messages must include a version string');
    }
    
    // Source validation
    const validSources = ['parent', 'iframe', 'response', 'system'];
    if (finalMessage.source && !validSources.includes(finalMessage.source)) {
        warnings.push(`Unknown source: ${finalMessage.source}`);
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        normalizedMessage: finalMessage
    };
}

/**
 * isDuplicateMessage() - Check if message is a duplicate
 * 
 * @param {object} message - Message to check
 * @returns {boolean} True if duplicate
 */
function isDuplicateMessage(message) {
    if (!message || !message.type || !message.timestamp) {
        return false;
    }
    
    // Generate a unique key for the message
    const dataHash = message.data ? 
        (typeof message.data === 'object' ? 
            JSON.stringify(message.data).slice(0, 100) : 
            String(message.data).slice(0, 100)) : 
        '';
    const messageKey = `${message.type}_${message.timestamp}_${message.source}_${dataHash}`;
    
    if (sentMessageRegistry.has(messageKey)) {
        const sentTime = sentMessageRegistry.get(messageKey);
        const now = Date.now();
        
        // Clean old entries
        if (now - sentTime > RECEIVED_MESSAGE_TIMEOUT) {
            sentMessageRegistry.delete(messageKey);
            return false;
        }
        
        console.warn(`⚠️ Duplicate message detected: ${messageKey}`);
        return true;
    }
    
    // Store message with timestamp
    sentMessageRegistry.set(messageKey, Date.now());
    
    // Cleanup old entries periodically
    setTimeout(() => {
        sentMessageRegistry.delete(messageKey);
    }, RECEIVED_MESSAGE_TIMEOUT);
    
    return false;
}

/**
 * debounce() - Debounce function to prevent rapid consecutive calls
 * 
 * @param {Function} func - Function to debounce
 * @param {number} wait - Debounce delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    let lastArgs;
    let lastThis;
    let lastCallTime = 0;
    
    return function executedFunction(...args) {
        const context = this;
        const now = Date.now();
        
        lastArgs = args;
        lastThis = context;
        
        const later = () => {
            const timeSinceLastCall = now - lastCallTime;
            if (timeSinceLastCall >= wait) {
                func.apply(context, args);
                lastCallTime = now;
            }
        };
        
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * initializeGlobalAPI() - Safe initialization with race condition prevention
 */
function initializeGlobalAPI() {
    if (initializationState === INIT_STATE.READY || initializationState === INIT_STATE.INITIALIZING) {
        console.log('⚠️ initializeGlobalAPI: Already initialized or initializing');
        return Promise.resolve(window.__API_MESSAGES.exports);
    }
    
    if (initializationPromise) {
        return initializationPromise;
    }
    
    initializationState = INIT_STATE.INITIALIZING;
    console.log('🔧 initializeGlobalAPI: Starting initialization...');
    
    initializationPromise = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            initializationState = INIT_STATE.FAILED;
            console.error('❌ initializeGlobalAPI: Initialization timeout');
            reject(new Error('API initialization timeout'));
        }, INITIALIZATION_TIMEOUT);
        
        try {
            // Initialize global namespace
            if (!window.__API_MESSAGES) {
                window.__API_MESSAGES = {
                    ready: false,
                    version: '1.0.6',
                    exports: {},
                    config: {
                        strictMode: true,
                        validateOrigins: true,
                        debounceEnabled: true,
                        allowedOrigins: [...ALLOWED_ORIGINS]
                    }
                };
            }
            
            // Populate global namespace
            window.__API_MESSAGES.exports = {
                STRICT_MESSAGE_TYPES,
                MESSAGE_TYPES,
                sendParentMessage,
                listenToParentMessages,
                sendToParent,
                sendMessageToIframe,
                validateMessage,
                messageResponse,
                configureMessaging,
                sendMessage,
                fetchMessages,
                getMessages,
                markAsRead,
                markChatAsRead,
                addReaction,
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
                sendBulkMessages
            };
            
            // Set ready flag
            window.__API_MESSAGES.ready = true;
            initializationState = INIT_STATE.READY;
            
            // Set global fallback
            if (!window.apiMessages) {
                window.apiMessages = window.__API_MESSAGES.exports;
            }
            
            clearTimeout(timeoutId);
            
            // Dispatch ready event using strict protocol
            const readyEvent = new CustomEvent('api-messages-ready', {
                detail: {
                    version: '1.0.6',
                    timestamp: Date.now(),
                    strictMode: window.__API_MESSAGES.config.strictMode,
                    state: 'ready'
                }
            });
            window.dispatchEvent(readyEvent);
            
            console.log('✅ api.messages.js: Module initialized and ready with strict messaging protocol');
            resolve(window.__API_MESSAGES.exports);
            
        } catch (error) {
            clearTimeout(timeoutId);
            initializationState = INIT_STATE.FAILED;
            console.error('❌ initializeGlobalAPI: Initialization failed', error);
            reject(error);
        }
    });
    
    return initializationPromise;
}

/**
 * ensureInitialized() - Guard function to ensure API is ready
 * @returns {Promise} Resolves when API is ready
 */
async function ensureInitialized() {
    if (initializationState === INIT_STATE.READY) {
        return Promise.resolve();
    }
    
    if (initializationState === INIT_STATE.FAILED) {
        throw new Error('API initialization failed');
    }
    
    return initializeGlobalAPI();
}

/**
 * Safety: Safe handshake with max attempts
 */
function performSafeHandshake() {
    if (handshakeComplete || handshakeAttempts >= MAX_HANDSHAKE_ATTEMPTS) {
        return;
    }
    
    handshakeAttempts++;
    
    if (handshakeAttempts > MAX_HANDSHAKE_ATTEMPTS) {
        safeLogError('Handshake', new Error(`Maximum handshake attempts (${MAX_HANDSHAKE_ATTEMPTS}) exceeded`));
        return;
    }
    
    try {
        // Send handshake message
        sendParentMessage(STRICT_MESSAGE_TYPES.CHILD_READY, {
            attempts: handshakeAttempts,
            timestamp: Date.now()
        });
    } catch (error) {
        safeLogError('Handshake', error);
    }
}

/**
 * waitForHandshake() - Wait for handshake completion with timeout
 * @returns {Promise} Resolves when handshake is complete
 */
function waitForHandshake() {
    if (handshakeComplete) {
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        if (handshakeTimeoutId) {
            clearTimeout(handshakeTimeoutId);
        }
        
        handshakeTimeoutId = setTimeout(() => {
            console.warn('⚠️ Handshake timeout - proceeding without handshake');
            handshakeComplete = true;
            resolve();
        }, HANDSHAKE_TIMEOUT);
        
        // Check periodically
        const checkInterval = setInterval(() => {
            if (handshakeComplete) {
                clearInterval(checkInterval);
                if (handshakeTimeoutId) {
                    clearTimeout(handshakeTimeoutId);
                }
                resolve();
            }
        }, 100);
    });
}

/**
 * validateMessageType() - Validate message type against MESSAGE_TYPES
 * 
 * @param {string} type - Message type to validate
 * @returns {boolean} True if valid
 */
function validateMessageType(type) {
    if (!type || typeof type !== 'string') {
        console.error('❌ validateMessageType: Invalid message type', type);
        return false;
    }
    
    // Check if type exists in MESSAGE_TYPES
    const validTypes = Object.values(MESSAGE_TYPES);
    if (!validTypes.includes(type) && !type.endsWith('_RESPONSE')) {
        console.warn('⚠️ validateMessageType: Unknown message type, but will allow:', type);
        return false; // Strict: unknown types are invalid
    }
    
    return true;
}

/**
 * sendParentMessage() - Send a message from an iframe to its parent window with strict validation
 * This function was missing from all existing API modules and is required for in-frame pages
 * 
 * @param {string} type - Message type from MESSAGE_TYPES
 * @param {any} data - Message payload
 * @param {string} targetOrigin - Target origin for postMessage (defaults to '*')
 * @param {object} [options] - Additional options {debounce: boolean, strict: boolean}
 * @returns {boolean} True if message was sent successfully
 */
export function sendParentMessage(type, data, targetOrigin = '*', options = {}) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('sendParentMessage')) {
        return false;
    }
    
    try {
        // Ensure API is initialized
        if (initializationState !== INIT_STATE.READY) {
            console.warn('⚠️ sendParentMessage: API not ready, queueing message');
            ensureInitialized().then(() => {
                sendParentMessage(type, data, targetOrigin, options);
            });
            return false;
        }
        
        // Wait for handshake if needed (except for CHILD_READY)
        if (type !== STRICT_MESSAGE_TYPES.CHILD_READY && window.parent !== window) {
            waitForHandshake().catch(() => {
                console.warn('⚠️ sendParentMessage: Handshake failed, sending anyway');
            });
        }
        
        // Apply debouncing if enabled
        if (window.__API_MESSAGES.config.debounceEnabled && options.debounce !== false) {
            const debouncedSend = debounce(sendParentMessage, DEBOUNCE_DELAY);
            return debouncedSend(type, data, targetOrigin, { ...options, debounce: false });
        }
        
        // Validate input
        if (!validateMessageType(type)) {
            console.error('❌ sendParentMessage: Invalid message type', type);
            return false;
        }
        
        // Check if we're in an iframe
        if (window.parent === window) {
            console.warn('⚠️ sendParentMessage: Not in an iframe, message will be sent to same window');
        }
        
        // Prepare the message object
        const message = {
            type: type,
            data: data || {},
            timestamp: Date.now(),
            source: 'iframe',
            version: '1.0.6',
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        // Safety: Validate outgoing message structure
        const structureCheck = validateIncomingMessageStructure(message);
        if (!structureCheck.isValid) {
            safeLogError('sendParentMessage', new Error(structureCheck.reason), message.messageId);
            return false;
        }
        
        // Strict validation if enabled
        if (window.__API_MESSAGES.config.strictMode && options.strict !== false) {
            const validation = validateStrictMessage(message, true);
            if (!validation.isValid) {
                console.error('❌ sendParentMessage: Strict validation failed:', validation.errors);
                return false;
            }
            if (validation.warnings.length > 0) {
                console.warn('⚠️ sendParentMessage: Validation warnings:', validation.warnings);
            }
        }
        
        // Inject missing fields for all messages (even in non-strict mode)
        const finalMessage = injectMissingFields(message, true);
        
        // Check for duplicate messages
        if (isDuplicateMessage(finalMessage)) {
            console.warn('⚠️ sendParentMessage: Duplicate message detected, skipping:', type);
            return true; // Return true as technically the message "was sent" (or would be duplicate)
        }
        
        // Validate target origin
        let finalTargetOrigin = targetOrigin;
        if (targetOrigin === '*') {
            // In strict mode, prefer parent origin
            if (window.__API_MESSAGES.config.strictMode) {
                try {
                    finalTargetOrigin = document.referrer || window.parent.location.origin || '*';
                } catch (e) {
                    // Cross-origin restriction, use wildcard
                    finalTargetOrigin = '*';
                }
            }
        }
        
        // Safety: Serialize with error handling
        let serializedMessage;
        try {
            serializedMessage = JSON.stringify(finalMessage);
        } catch (serializeError) {
            safeLogError('sendParentMessage', serializeError, finalMessage.messageId);
            disableModule('sendParentMessage', 'Serialization failure');
            return false;
        }
        
        // Send the message to parent
        try {
            window.parent.postMessage(finalMessage, finalTargetOrigin);
        } catch (postMessageError) {
            safeLogError('sendParentMessage', postMessageError, finalMessage.messageId);
            // Don't disable module for postMessage errors - they might be temporary
            return false;
        }
        
        // Update handshake state for CHILD_READY
        if (type === STRICT_MESSAGE_TYPES.CHILD_READY) {
            handshakeComplete = true;
            if (handshakeTimeoutId) {
                clearTimeout(handshakeTimeoutId);
            }
        }
        
        console.log(`📤 sendParentMessage: Sent "${type}" to parent`, {
            type: finalMessage.type,
            messageId: finalMessage.messageId,
            timestamp: finalMessage.timestamp,
            source: finalMessage.source,
            data: typeof data === 'object' ? '[Object]' : data,
            targetOrigin: finalTargetOrigin
        });
        return true;
        
    } catch (error) {
        safeLogError('sendParentMessage', error);
        disableModule('sendParentMessage', 'Unhandled error');
        return false;
    }
}

/**
 * sendToParent() - Alias for sendParentMessage for compatibility
 * 
 * @param {string} type - Message type from MESSAGE_TYPES
 * @param {any} payload - Message payload
 * @returns {boolean} True if message was sent successfully
 */
export function sendToParent(type, payload) {
    return sendParentMessage(type, payload);
}

/**
 * Safety: Safe message handler wrapper
 */
function createSafeMessageHandler(callback, filterTypes, options) {
    return function safeMessageHandler(event) {
        // Safety: Skip if module is disabled
        if (isModuleDisabled('listenToParentMessages')) {
            return;
        }
        
        try {
            // Skip messages from self
            if (event.source === window) {
                return;
            }
            
            // Safety: Validate and cache origin
            if (options.validateOrigin && !validateAndCacheOrigin(event.origin)) {
                safeLogError('listenToParentMessages', new Error(`Unauthorized origin: ${event.origin}`));
                return;
            }
            
            // Basic validation of the message
            if (!event.data || typeof event.data !== 'object') {
                return; // Ignore non-object messages
            }
            
            const message = event.data;
            
            // Skip internal messages
            if (message._internal) {
                return;
            }
            
            // Safety: Check for duplicate incoming messages
            if (isDuplicateIncomingMessage(message)) {
                return; // Skip duplicate
            }
            
            // Safety: Validate incoming message structure
            const structureCheck = validateIncomingMessageStructure(message);
            if (!structureCheck.isValid) {
                safeLogError('listenToParentMessages', new Error(structureCheck.reason), message.messageId);
                return;
            }
            
            // First normalize legacy messages
            const normalizedMessage = normalizeLegacyMessage(message);
            
            // Then inject missing fields for incoming messages
            const finalMessage = injectMissingFields(normalizedMessage, false);
            
            // Strict validation if enabled
            if (options.strict) {
                const validation = validateStrictMessage(finalMessage, false);
                if (!validation.isValid) {
                    safeLogError('listenToParentMessages', new Error(`Invalid message: ${validation.errors.join(', ')}`), finalMessage.messageId);
                    return;
                }
                if (validation.warnings.length > 0) {
                    console.warn('⚠️ listenToParentMessages: Validation warnings:', validation.warnings);
                }
            } else {
                // Basic validation for backward compatibility
                if (!finalMessage.type || typeof finalMessage.type !== 'string') {
                    return; // Ignore messages without type
                }
            }
            
            // Apply type filtering if specified
            if (filterTypes && Array.isArray(filterTypes)) {
                if (!filterTypes.includes(finalMessage.type)) {
                    return; // Skip if type not in filter
                }
            }
            
            // Check for handshake requirement
            if (options.requireHandshake && !handshakeComplete) {
                if (finalMessage.type === STRICT_MESSAGE_TYPES.FRAME_ID) {
                    handshakeComplete = true;
                    if (handshakeTimeoutId) {
                        clearTimeout(handshakeTimeoutId);
                    }
                } else {
                    safeLogError('listenToParentMessages', new Error(`Message received before handshake: ${finalMessage.type}`), finalMessage.messageId);
                    return;
                }
            }
            
            // Log for debugging (sanitized)
            console.log(`📥 listenToParentMessages: Received "${finalMessage.type}" from ${event.origin}`, {
                type: finalMessage.type,
                timestamp: finalMessage.timestamp,
                source: finalMessage.source,
                messageId: finalMessage.messageId,
                data: typeof finalMessage.data === 'object' ? '[Object]' : finalMessage.data
            });
            
            // Call the callback with the normalized message and event
            callback(finalMessage, event);
            
        } catch (error) {
            safeLogError('listenToParentMessages', error);
            // Don't disable module for individual message errors
        }
    };
}

/**
 * listenToParentMessages() - Set up a strict listener for messages from parent window
 * This function was missing from all existing API modules and is required for in-frame pages
 * 
 * @param {Function} callback - Function to call when a message is received
 * @param {Array<string>} [filterTypes] - Optional array of message types to listen for
 * @param {object} [options] - Listener options {validateOrigin: boolean, strict: boolean}
 * @returns {Function} Cleanup function to remove the event listener
 */
export function listenToParentMessages(callback, filterTypes = null, options = {}) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('listenToParentMessages')) {
        return () => {};
    }
    
    // Validate callback
    if (typeof callback !== 'function') {
        console.error('❌ listenToParentMessages: Callback must be a function');
        return () => {};
    }
    
    // Ensure API is initialized
    if (initializationState !== INIT_STATE.READY) {
        console.warn('⚠️ listenToParentMessages: API not ready, queuing listener setup');
        ensureInitialized().then(() => {
            listenToParentMessages(callback, filterTypes, options);
        });
        return () => {};
    }
    
    // Default options
    const listenerOptions = {
        validateOrigin: window.__API_MESSAGES.config.validateOrigins,
        strict: window.__API_MESSAGES.config.strictMode,
        requireHandshake: true,
        ...options
    };
    
    // Create safe message handler
    const messageHandler = createSafeMessageHandler(callback, filterTypes, listenerOptions);
    
    // Add the event listener
    window.addEventListener('message', messageHandler);
    
    console.log(`✅ listenToParentMessages: Strict listener attached${filterTypes ? ` with filter: ${filterTypes.join(', ')}` : ''}`);
    
    // Return cleanup function
    return () => {
        try {
            window.removeEventListener('message', messageHandler);
            console.log('✅ listenToParentMessages: Listener removed');
        } catch (error) {
            safeLogError('listenToParentMessages cleanup', error);
        }
    };
}

/**
 * Additional utility functions for message handling that were missing
 */

/**
 * sendMessageToIframe() - Send a message to a specific iframe (for parent window use)
 * This function was missing from all existing API modules
 * 
 * @param {HTMLIFrameElement} iframe - Target iframe element
 * @param {string} type - Message type from MESSAGE_TYPES
 * @param {any} data - Message payload
 * @param {string} targetOrigin - Target origin for postMessage (defaults to '*')
 * @returns {boolean} True if message was sent successfully
 */
export function sendMessageToIframe(iframe, type, data, targetOrigin = '*') {
    // Safety: Check if module is disabled
    if (isModuleDisabled('sendMessageToIframe')) {
        return false;
    }
    
    try {
        if (!iframe || !iframe.contentWindow) {
            console.error('❌ sendMessageToIframe: Invalid iframe element');
            return false;
        }
        
        if (!validateMessageType(type)) {
            console.error('❌ sendMessageToIframe: Invalid message type', type);
            return false;
        }
        
        const message = {
            type: type,
            data: data || {},
            timestamp: Date.now(),
            source: 'parent',
            version: '1.0.6',
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        // Safety: Validate outgoing message structure
        const structureCheck = validateIncomingMessageStructure(message);
        if (!structureCheck.isValid) {
            safeLogError('sendMessageToIframe', new Error(structureCheck.reason), message.messageId);
            return false;
        }
        
        // Strict validation
        const validation = validateStrictMessage(message, true);
        if (!validation.isValid) {
            console.error('❌ sendMessageToIframe: Strict validation failed:', validation.errors);
            return false;
        }
        if (validation.warnings.length > 0) {
            console.warn('⚠️ sendMessageToIframe: Validation warnings:', validation.warnings);
        }
        
        // Inject missing fields
        const finalMessage = injectMissingFields(message, true);
        
        // Check for duplicates
        if (isDuplicateMessage(finalMessage)) {
            console.warn('⚠️ sendMessageToIframe: Duplicate message detected, skipping:', type);
            return true;
        }
        
        // Validate target origin
        let finalTargetOrigin = targetOrigin;
        if (targetOrigin === '*') {
            try {
                finalTargetOrigin = iframe.src ? new URL(iframe.src).origin : '*';
            } catch (e) {
                finalTargetOrigin = '*';
            }
        }
        
        // Safety: Serialize with error handling
        try {
            JSON.stringify(finalMessage);
        } catch (serializeError) {
            safeLogError('sendMessageToIframe', serializeError, finalMessage.messageId);
            return false;
        }
        
        // Send message
        try {
            iframe.contentWindow.postMessage(finalMessage, finalTargetOrigin);
        } catch (postMessageError) {
            safeLogError('sendMessageToIframe', postMessageError, finalMessage.messageId);
            return false;
        }
        
        console.log(`📤 sendMessageToIframe: Sent "${type}" to iframe`, {
            type: finalMessage.type,
            messageId: finalMessage.messageId,
            timestamp: finalMessage.timestamp,
            source: finalMessage.source,
            data: typeof data === 'object' ? '[Object]' : data,
            targetOrigin: finalTargetOrigin
        });
        return true;
        
    } catch (error) {
        safeLogError('sendMessageToIframe', error);
        disableModule('sendMessageToIframe', 'Unhandled error');
        return false;
    }
}

/**
 * validateMessage() - Validate message structure (legacy function for backward compatibility)
 * This function was missing from all existing API modules
 * 
 * @param {object} message - Message object to validate
 * @returns {boolean} True if message is valid
 */
export function validateMessage(message) {
    try {
        // Normalize and inject missing fields first
        const normalizedMessage = normalizeLegacyMessage(message);
        const finalMessage = injectMissingFields(normalizedMessage, false);
        
        const validation = validateStrictMessage(finalMessage, false);
        if (validation.warnings.length > 0) {
            console.warn('⚠️ validateMessage: Validation warnings:', validation.warnings);
        }
        return validation.isValid;
    } catch (error) {
        safeLogError('validateMessage', error);
        return false;
    }
}

/**
 * messageResponse() - Create a standardized response message
 * This function was missing from all existing API modules
 * 
 * @param {string} originalType - Original message type that this is responding to
 * @param {any} data - Response data
 * @param {boolean} success - Whether the operation was successful
 * @param {string} [error] - Optional error message
 * @returns {object} Standardized response message
 */
export function messageResponse(originalType, data, success = true, error = null) {
    try {
        const response = {
            type: originalType + '_RESPONSE',
            data: data || {},
            success: success,
            error: error,
            timestamp: Date.now(),
            source: 'response',
            originalType: originalType,
            version: '1.0.6',
            messageId: `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        // Safety: Validate structure
        const structureCheck = validateIncomingMessageStructure(response);
        if (!structureCheck.isValid) {
            safeLogError('messageResponse', new Error(structureCheck.reason), response.messageId);
            return response; // Return anyway but log error
        }
        
        // Inject missing fields
        const finalResponse = injectMissingFields(response, true);
        
        // Validate the response
        const validation = validateStrictMessage(finalResponse, true);
        if (!validation.isValid) {
            console.error('❌ messageResponse: Invalid response structure:', validation.errors);
        }
        if (validation.warnings.length > 0) {
            console.warn('⚠️ messageResponse: Validation warnings:', validation.warnings);
        }
        
        return finalResponse;
    } catch (error) {
        safeLogError('messageResponse', error);
        // Return minimal valid response
        return {
            type: originalType + '_RESPONSE',
            data: {},
            success: false,
            error: 'Internal error',
            timestamp: Date.now(),
            source: 'response',
            originalType: originalType,
            version: '1.0.6',
            messageId: `error_${Date.now()}`
        };
    }
}

/**
 * configureMessaging() - Configure messaging protocol settings
 * 
 * @param {object} config - Configuration options
 * @returns {object} Current configuration
 */
export function configureMessaging(config = {}) {
    try {
        if (!window.__API_MESSAGES) {
            console.warn('⚠️ configureMessaging: API not initialized, initializing first');
            initializeGlobalAPI();
        }
        
        if (config.allowedOrigins) {
            window.__API_MESSAGES.config.allowedOrigins = [
                ...new Set([...window.__API_MESSAGES.config.allowedOrigins, ...config.allowedOrigins])
            ];
        }
        
        if (config.strictMode !== undefined) {
            window.__API_MESSAGES.config.strictMode = config.strictMode;
        }
        
        if (config.validateOrigins !== undefined) {
            window.__API_MESSAGES.config.validateOrigins = config.validateOrigins;
        }
        
        if (config.debounceEnabled !== undefined) {
            window.__API_MESSAGES.config.debounceEnabled = config.debounceEnabled;
        }
        
        console.log('✅ configureMessaging: Updated configuration', window.__API_MESSAGES.config);
        return { ...window.__API_MESSAGES.config };
    } catch (error) {
        safeLogError('configureMessaging', error);
        return {
            strictMode: false,
            validateOrigins: false,
            debounceEnabled: false,
            allowedOrigins: ['*']
        };
    }
}

/**
 * Safety: Safe fetch wrapper
 */
async function safeFetch(url, options = {}) {
    try {
        const fetchFunction = window.secureFetch || window.fetch || fetch;
        const response = await fetchFunction(url, options);
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error details');
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        return response;
    } catch (error) {
        safeLogError('safeFetch', error);
        throw error;
    }
}

/**
 * sendMessage() - Send a chat message to a conversation or user
 * This function was missing from existing API modules
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {string} content - Message content
 * @param {string} [messageType='text'] - Type of message (text, image, file, etc.)
 * @param {object} [metadata={}] - Additional metadata
 * @returns {Promise<object>} Message response
 */
export async function sendMessage(conversationId, content, messageType = 'text', metadata = {}) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('sendMessage')) {
        throw new Error('sendMessage module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                content: content,
                type: messageType,
                metadata: metadata,
                timestamp: new Date().toISOString()
            })
        });

        const messageData = await response.json();
        
        // Safety: Notify parent window if in iframe using strict protocol
        if (window.parent !== window) {
            try {
                sendParentMessage(STRICT_MESSAGE_TYPES.SESSION_DATA || 'SESSION_DATA', {
                    conversationId: conversationId,
                    message: messageData,
                    timestamp: Date.now(),
                    action: 'MESSAGE_SENT'
                }, '*', { strict: true });
            } catch (notificationError) {
                safeLogError('sendMessage notification', notificationError);
                // Continue even if notification fails
            }
        }

        console.log(`✅ sendMessage: Message sent to conversation ${conversationId}`, messageData);
        return messageData;
    } catch (error) {
        safeLogError('sendMessage', error);
        
        // Safety: Send error notification to parent if in iframe using strict protocol
        if (window.parent !== window) {
            try {
                sendParentMessage(STRICT_MESSAGE_TYPES.SESSION_ERROR || 'SESSION_ERROR', {
                    type: 'MESSAGE_SEND_FAILED',
                    conversationId: conversationId,
                    error: error.message,
                    timestamp: Date.now()
                }, '*', { strict: true });
            } catch (notificationError) {
                safeLogError('sendMessage error notification', notificationError);
            }
        }
        
        throw error;
    }
}

/**
 * fetchMessages() - Fetch messages for a conversation
 * This function was missing from existing API modules
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {number} [limit=50] - Number of messages to fetch
 * @param {string} [before] - Fetch messages before this timestamp
 * @param {string} [after] - Fetch messages after this timestamp
 * @returns {Promise<Array>} Array of messages
 */
export async function fetchMessages(conversationId, limit = 50, before = null, after = null) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('fetchMessages')) {
        throw new Error('fetchMessages module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        // Build query parameters
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        if (before) params.append('before', before);
        if (after) params.append('after', after);

        const response = await safeFetch(`/api/conversations/${conversationId}/messages?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        const messages = await response.json();
        
        console.log(`✅ fetchMessages: Fetched ${messages.length} messages for conversation ${conversationId}`);
        return messages;
    } catch (error) {
        safeLogError('fetchMessages', error);
        throw error;
    }
}

/**
 * getMessages() - Get messages for a conversation (alias for fetchMessages)
 * This function is requested by other modules
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {number} [limit=50] - Number of messages to fetch
 * @param {string} [before] - Fetch messages before this timestamp
 * @param {string} [after] - Fetch messages after this timestamp
 * @returns {Promise<Array>} Array of messages
 */
export async function getMessages(conversationId, limit = 50, before = null, after = null) {
    return fetchMessages(conversationId, limit, before, after);
}

/**
 * markAsRead() - Mark messages as read in a conversation
 * This function was missing from existing API modules
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {Array<string>} messageIds - Array of message IDs to mark as read
 * @returns {Promise<object>} Status response
 */
export async function markAsRead(conversationId, messageIds) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('markAsRead')) {
        throw new Error('markAsRead module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/conversations/${conversationId}/messages/read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                messageIds: Array.isArray(messageIds) ? messageIds : [messageIds],
                readAt: new Date().toISOString()
            })
        });

        const result = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'MESSAGES_READ',
                    conversationId: conversationId,
                    messageIds: messageIds,
                    readAt: result.readAt
                });
            } catch (notificationError) {
                safeLogError('markAsRead notification', notificationError);
            }
        }

        console.log(`✅ markAsRead: Marked ${messageIds.length} messages as read in conversation ${conversationId}`);
        return result;
    } catch (error) {
        safeLogError('markAsRead', error);
        throw error;
    }
}

/**
 * markChatAsRead() - Mark chat as read (alias for markAsRead)
 * This function is requested by other modules
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {Array<string>} messageIds - Array of message IDs to mark as read
 * @returns {Promise<object>} Status response
 */
export async function markChatAsRead(conversationId, messageIds) {
    return markAsRead(conversationId, messageIds);
}

/**
 * addReaction() - Add a reaction to a message
 * This function was missing from existing API modules
 * 
 * @param {string} messageId - ID of the message
 * @param {string} reaction - Reaction emoji or code
 * @returns {Promise<object>} Updated message with reactions
 */
export async function addReaction(messageId, reaction) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('addReaction')) {
        throw new Error('addReaction module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/messages/${messageId}/reactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                reaction: reaction,
                timestamp: new Date().toISOString()
            })
        });

        const updatedMessage = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'REACTION_ADDED',
                    messageId: messageId,
                    reaction: reaction,
                    message: updatedMessage
                });
            } catch (notificationError) {
                safeLogError('addReaction notification', notificationError);
            }
        }

        console.log(`✅ addReaction: Added reaction "${reaction}" to message ${messageId}`);
        return updatedMessage;
    } catch (error) {
        safeLogError('addReaction', error);
        throw error;
    }
}

/**
 * clearChatHistory() - Clear chat history for a conversation
 * This function was missing and causing errors in messages-core.js
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {boolean} [archive=true] - Whether to archive messages instead of permanent deletion
 * @returns {Promise<object>} Status response
 */
export async function clearChatHistory(conversationId, archive = true) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('clearChatHistory')) {
        throw new Error('clearChatHistory module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/conversations/${conversationId}/messages`, {
            method: archive ? 'POST' : 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: archive ? JSON.stringify({
                action: 'archive',
                timestamp: new Date().toISOString()
            }) : null
        });

        const result = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'CHAT_HISTORY_CLEARED',
                    conversationId: conversationId,
                    archived: archive,
                    timestamp: result.timestamp
                });
            } catch (notificationError) {
                safeLogError('clearChatHistory notification', notificationError);
            }
        }

        console.log(`✅ clearChatHistory: ${archive ? 'Archived' : 'Deleted'} chat history for conversation ${conversationId}`);
        return result;
    } catch (error) {
        safeLogError('clearChatHistory', error);
        throw error;
    }
}

/**
 * deleteMessage() - Delete a specific message
 * This function might be needed for message management
 * 
 * @param {string} messageId - ID of the message to delete
 * @param {boolean} [forEveryone=false] - Whether to delete for all participants
 * @returns {Promise<object>} Status response
 */
export async function deleteMessage(messageId, forEveryone = false) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('deleteMessage')) {
        throw new Error('deleteMessage module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/messages/${messageId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                forEveryone: forEveryone,
                deletedAt: new Date().toISOString()
            })
        });

        const result = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'MESSAGE_DELETED',
                    messageId: messageId,
                    forEveryone: forEveryone,
                    timestamp: result.deletedAt
                });
            } catch (notificationError) {
                safeLogError('deleteMessage notification', notificationError);
            }
        }

        console.log(`✅ deleteMessage: Deleted message ${messageId} ${forEveryone ? 'for everyone' : 'for me only'}`);
        return result;
    } catch (error) {
        safeLogError('deleteMessage', error);
        throw error;
    }
}

/**
 * editMessage() - Edit an existing message
 * This function might be needed for message management
 * 
 * @param {string} messageId - ID of the message to edit
 * @param {string} newContent - New message content
 * @param {object} [metadata={}] - Updated metadata
 * @returns {Promise<object>} Updated message
 */
export async function editMessage(messageId, newContent, metadata = {}) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('editMessage')) {
        throw new Error('editMessage module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/messages/${messageId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                content: newContent,
                metadata: metadata,
                editedAt: new Date().toISOString()
            })
        });

        const updatedMessage = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'MESSAGE_EDITED',
                    messageId: messageId,
                    message: updatedMessage,
                    timestamp: updatedMessage.editedAt
                });
            } catch (notificationError) {
                safeLogError('editMessage notification', notificationError);
            }
        }

        console.log(`✅ editMessage: Edited message ${messageId}`);
        return updatedMessage;
    } catch (error) {
        safeLogError('editMessage', error);
        throw error;
    }
}

/**
 * forwardMessage() - Forward a message to another conversation
 * This function might be needed for message management
 * 
 * @param {string} messageId - ID of the message to forward
 * @param {string} targetConversationId - ID of the target conversation
 * @returns {Promise<object>} New forwarded message
 */
export async function forwardMessage(messageId, targetConversationId) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('forwardMessage')) {
        throw new Error('forwardMessage module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/messages/${messageId}/forward`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                targetConversationId: targetConversationId,
                forwardedAt: new Date().toISOString()
            })
        });

        const forwardedMessage = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('MESSAGE_SENT', {
                    type: 'MESSAGE_FORWARDED',
                    originalMessageId: messageId,
                    targetConversationId: targetConversationId,
                    message: forwardedMessage,
                    timestamp: forwardedMessage.timestamp
                });
            } catch (notificationError) {
                safeLogError('forwardMessage notification', notificationError);
            }
        }

        console.log(`✅ forwardMessage: Forwarded message ${messageId} to conversation ${targetConversationId}`);
        return forwardedMessage;
    } catch (error) {
        safeLogError('forwardMessage', error);
        throw error;
    }
}

/**
 * pinMessage() - Pin a message in a conversation
 * This function might be needed for message management
 * 
 * @param {string} messageId - ID of the message to pin
 * @param {boolean} [pin=true] - Whether to pin or unpin
 * @returns {Promise<object>} Updated message
 */
export async function pinMessage(messageId, pin = true) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('pinMessage')) {
        throw new Error('pinMessage module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/messages/${messageId}/pin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                pinned: pin,
                pinnedAt: pin ? new Date().toISOString() : null
            })
        });

        const updatedMessage = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: pin ? 'MESSAGE_PINNED' : 'MESSAGE_UNPINNED',
                    messageId: messageId,
                    message: updatedMessage,
                    pinned: pin
                });
            } catch (notificationError) {
                safeLogError('pinMessage notification', notificationError);
            }
        }

        console.log(`✅ pinMessage: ${pin ? 'Pinned' : 'Unpinned'} message ${messageId}`);
        return updatedMessage;
    } catch (error) {
        safeLogError('pinMessage', error);
        throw error;
    }
}

/**
 * searchMessages() - Search for messages in conversations
 * This function might be needed for message search functionality
 * 
 * @param {string} query - Search query
 * @param {string} [conversationId] - Optional conversation ID to search within
 * @param {number} [limit=20] - Maximum number of results
 * @param {number} [offset=0] - Results offset
 * @returns {Promise<Array>} Search results
 */
export async function searchMessages(query, conversationId = null, limit = 20, offset = 0) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('searchMessages')) {
        throw new Error('searchMessages module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        // Build query parameters
        const params = new URLSearchParams();
        params.append('q', query);
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());
        if (conversationId) params.append('conversationId', conversationId);

        const response = await safeFetch(`/api/messages/search?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        const results = await response.json();
        
        console.log(`✅ searchMessages: Found ${results.length} messages matching "${query}"`);
        return results;
    } catch (error) {
        safeLogError('searchMessages', error);
        throw error;
    }
}

/**
 * getConversationInfo() - Get information about a conversation
 * This function might be needed for conversation details
 * 
 * @param {string} conversationId - ID of the conversation
 * @returns {Promise<object>} Conversation information
 */
export async function getConversationInfo(conversationId) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('getConversationInfo')) {
        throw new Error('getConversationInfo module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/conversations/${conversationId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        const conversationInfo = await response.json();
        
        console.log(`✅ getConversationInfo: Retrieved info for conversation ${conversationId}`);
        return conversationInfo;
    } catch (error) {
        safeLogError('getConversationInfo', error);
        throw error;
    }
}

/**
 * createConversation() - Create a new conversation
 * This function might be needed for starting new chats
 * 
 * @param {Array<string>} participantIds - Array of user IDs to include
 * @param {string} [title] - Optional conversation title
 * @param {string} [type='direct'] - Conversation type (direct, group)
 * @returns {Promise<object>} New conversation
 */
export async function createConversation(participantIds, title = null, type = 'direct') {
    // Safety: Check if module is disabled
    if (isModuleDisabled('createConversation')) {
        throw new Error('createConversation module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                participantIds: participantIds,
                title: title,
                type: type,
                createdAt: new Date().toISOString()
            })
        });

        const newConversation = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'CONVERSATION_CREATED',
                    conversation: newConversation,
                    timestamp: newConversation.createdAt
                });
            } catch (notificationError) {
                safeLogError('createConversation notification', notificationError);
            }
        }

        console.log(`✅ createConversation: Created new ${type} conversation`);
        return newConversation;
    } catch (error) {
        safeLogError('createConversation', error);
        throw error;
    }
}

/**
 * leaveConversation() - Leave a conversation
 * This function might be needed for group management
 * 
 * @param {string} conversationId - ID of the conversation to leave
 * @returns {Promise<object>} Status response
 */
export async function leaveConversation(conversationId) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('leaveConversation')) {
        throw new Error('leaveConversation module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/conversations/${conversationId}/leave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        const result = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'CONVERSATION_LEFT',
                    conversationId: conversationId,
                    timestamp: new Date().toISOString()
                });
            } catch (notificationError) {
                safeLogError('leaveConversation notification', notificationError);
            }
        }

        console.log(`✅ leaveConversation: Left conversation ${conversationId}`);
        return result;
    } catch (error) {
        safeLogError('leaveConversation', error);
        throw error;
    }
}

/**
 * simulateIncomingCall() - Function needed by calls-core.js
 * This simulates an incoming call for testing
 * 
 * @param {object} callerInfo - Information about the caller
 * @returns {boolean} True if simulation was successful
 */
export function simulateIncomingCall(callerInfo) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('simulateIncomingCall')) {
        return false;
    }
    
    try {
        if (!callerInfo || typeof callerInfo !== 'object') {
            console.warn('⚠️ simulateIncomingCall: Invalid caller info');
            return false;
        }
        
        // Ensure callerInfo has required fields
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
        
        // Safety: Also send to parent if in iframe using strict protocol
        if (window.parent !== window) {
            try {
                sendParentMessage(STRICT_MESSAGE_TYPES.SESSION_DATA || 'SESSION_DATA', {
                    type: 'INCOMING_CALL',
                    caller: defaultCallerInfo,
                    simulated: true,
                    timestamp: Date.now(),
                    action: 'CALL_START'
                }, '*', { strict: true });
            } catch (notificationError) {
                safeLogError('simulateIncomingCall notification', notificationError);
            }
        }
        
        console.log('✅ simulateIncomingCall: Incoming call simulated', defaultCallerInfo);
        return true;
    } catch (error) {
        safeLogError('simulateIncomingCall', error);
        disableModule('simulateIncomingCall', 'Unhandled error');
        return false;
    }
}

/**
 * buildSettingsMenu() - Function needed by settings-core.js
 * Builds the settings menu structure
 * 
 * @param {string} containerId - ID of the container element
 * @param {object} options - Configuration options
 * @returns {boolean} True if menu was built successfully
 */
export function buildSettingsMenu(containerId, options = {}) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('buildSettingsMenu')) {
        return false;
    }
    
    try {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('❌ buildSettingsMenu: Container not found', containerId);
            return false;
        }
        
        const menuStructure = options.menuStructure || [
            { id: 'general', label: 'General', icon: '⚙️', enabled: true },
            { id: 'privacy', label: 'Privacy', icon: '🔒', enabled: true },
            { id: 'notifications', label: 'Notifications', icon: '🔔', enabled: true },
            { id: 'appearance', label: 'Appearance', icon: '🎨', enabled: true },
            { id: 'account', label: 'Account', icon: '👤', enabled: true },
            { id: 'about', label: 'About', icon: 'ℹ️', enabled: true }
        ];
        
        const menuHTML = `
            <div class="settings-menu-container">
                ${menuStructure.map(item => `
                    <div class="settings-menu-item ${item.enabled ? '' : 'disabled'}" 
                         data-section="${item.id}"
                         onclick="if(!this.classList.contains('disabled')) window.dispatchEvent(new CustomEvent('settings-section-change', {detail: {section: '${item.id}'}}))">
                        <span class="settings-menu-icon">${item.icon}</span>
                        <span class="settings-menu-label">${item.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.innerHTML = menuHTML;
        
        // Add styles if not present
        if (!document.querySelector('#settings-menu-styles')) {
            const style = document.createElement('style');
            style.id = 'settings-menu-styles';
            style.textContent = `
                .settings-menu-container {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 16px;
                    background-color: #f8f9fa;
                    border-radius: 8px;
                    min-width: 200px;
                }
                .settings-menu-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.2s ease;
                    background-color: white;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .settings-menu-item:hover {
                    background-color: #e9ecef;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 5px rgba(0,0,0,0.15);
                }
                .settings-menu-item.active {
                    background-color: #007bff;
                    color: white;
                }
                .settings-menu-item.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .settings-menu-icon {
                    font-size: 20px;
                    width: 24px;
                    text-align: center;
                }
                .settings-menu-label {
                    font-size: 14px;
                    font-weight: 500;
                }
            `;
            document.head.appendChild(style);
        }
        
        console.log('✅ buildSettingsMenu: Settings menu built for', containerId);
        return true;
        
    } catch (error) {
        safeLogError('buildSettingsMenu', error);
        disableModule('buildSettingsMenu', 'Unhandled error');
        return false;
    }
}

/**
 * sendTypingIndicator() - Send typing indicator to conversation
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {boolean} isTyping - Whether user is typing
 * @returns {boolean} True if indicator was sent
 */
export function sendTypingIndicator(conversationId, isTyping = true) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('sendTypingIndicator')) {
        return false;
    }
    
    try {
        if (window.parent !== window) {
            sendParentMessage('DATA_UPDATE', {
                type: 'TYPING_INDICATOR',
                conversationId: conversationId,
                isTyping: isTyping,
                userId: localStorage.getItem('user_id') || 'unknown',
                timestamp: Date.now()
            }, '*', { debounce: true });
        }
        
        // Also send to server if needed
        const typingEvent = new CustomEvent('user-typing', {
            detail: {
                conversationId,
                isTyping,
                userId: localStorage.getItem('user_id') || 'unknown'
            }
        });
        window.dispatchEvent(typingEvent);
        
        console.log(`✅ sendTypingIndicator: ${isTyping ? 'Started' : 'Stopped'} typing in conversation ${conversationId}`);
        return true;
    } catch (error) {
        safeLogError('sendTypingIndicator', error);
        disableModule('sendTypingIndicator', 'Unhandled error');
        return false;
    }
}

/**
 * logTransparencyAction() - Log transparency action (for group-core.js compatibility)
 * 
 * @param {string} action - Action being performed
 * @param {object} data - Action data
 * @returns {boolean} True if logged successfully
 */
export function logTransparencyAction(action, data = {}) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('logTransparencyAction')) {
        return false;
    }
    
    try {
        const logData = {
            action: action,
            data: data,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };
        
        console.log('📊 Transparency Action:', logData);
        
        // Safety: Send to parent if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'TRANSPARENCY_LOG',
                    ...logData
                });
            } catch (notificationError) {
                safeLogError('logTransparencyAction notification', notificationError);
            }
        }
        
        return true;
    } catch (error) {
        safeLogError('logTransparencyAction', error);
        disableModule('logTransparencyAction', 'Unhandled error');
        return false;
    }
}

// =============== MISSING EXPORTS THAT OTHER MODULES ARE LOOKING FOR ===============

/**
 * openChat() - Function needed by Tool-core.js
 * Opens a chat window for the specified conversation
 * 
 * @param {string} conversationId - ID of the conversation to open
 * @param {object} options - Options for opening the chat
 * @returns {boolean} True if chat was opened successfully
 */
export function openChat(conversationId, options = {}) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('openChat')) {
        return false;
    }
    
    try {
        console.log(`✅ openChat: Opening chat for conversation ${conversationId}`, options);
        
        // Dispatch event to notify other components
        const chatEvent = new CustomEvent('open-chat', {
            detail: {
                conversationId: conversationId,
                options: options,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(chatEvent);
        
        // Safety: Send message to parent if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'CHAT_OPENED',
                    conversationId: conversationId,
                    options: options,
                    timestamp: Date.now()
                });
            } catch (notificationError) {
                safeLogError('openChat notification', notificationError);
            }
        }
        
        return true;
    } catch (error) {
        safeLogError('openChat', error);
        disableModule('openChat', 'Unhandled error');
        return false;
    }
}

/**
 * getMessageById() - Get a specific message by ID
 * This function might be needed by other modules
 * 
 * @param {string} messageId - ID of the message to retrieve
 * @returns {Promise<object>} The message
 */
export async function getMessageById(messageId) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('getMessageById')) {
        throw new Error('getMessageById module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/messages/${messageId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        const message = await response.json();
        
        console.log(`✅ getMessageById: Retrieved message ${messageId}`);
        return message;
    } catch (error) {
        safeLogError('getMessageById', error);
        throw error;
    }
}

/**
 * getConversations() - Get list of conversations for the current user
 * This function might be needed by other modules
 * 
 * @param {number} [limit=50] - Number of conversations to fetch
 * @param {number} [offset=0] - Results offset
 * @returns {Promise<Array>} Array of conversations
 */
export async function getConversations(limit = 50, offset = 0) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('getConversations')) {
        throw new Error('getConversations module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const params = new URLSearchParams();
        params.append('limit', limit.toString());
        params.append('offset', offset.toString());

        const response = await safeFetch(`/api/conversations?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        const conversations = await response.json();
        
        console.log(`✅ getConversations: Retrieved ${conversations.length} conversations`);
        return conversations;
    } catch (error) {
        safeLogError('getConversations', error);
        throw error;
    }
}

/**
 * updateConversation() - Update conversation information
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {object} updates - Updates to apply
 * @returns {Promise<object>} Updated conversation
 */
export async function updateConversation(conversationId, updates) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('updateConversation')) {
        throw new Error('updateConversation module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/conversations/${conversationId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify(updates)
        });

        const updatedConversation = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'CONVERSATION_UPDATED',
                    conversationId: conversationId,
                    conversation: updatedConversation,
                    timestamp: Date.now()
                });
            } catch (notificationError) {
                safeLogError('updateConversation notification', notificationError);
            }
        }

        console.log(`✅ updateConversation: Updated conversation ${conversationId}`);
        return updatedConversation;
    } catch (error) {
        safeLogError('updateConversation', error);
        throw error;
    }
}

/**
 * addParticipants() - Add participants to a conversation
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {Array<string>} participantIds - Array of user IDs to add
 * @returns {Promise<object>} Updated conversation
 */
export async function addParticipants(conversationId, participantIds) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('addParticipants')) {
        throw new Error('addParticipants module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/conversations/${conversationId}/participants`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                participantIds: participantIds,
                addedAt: new Date().toISOString()
            })
        });

        const updatedConversation = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'PARTICIPANTS_ADDED',
                    conversationId: conversationId,
                    participantIds: participantIds,
                    conversation: updatedConversation,
                    timestamp: Date.now()
                });
            } catch (notificationError) {
                safeLogError('addParticipants notification', notificationError);
            }
        }

        console.log(`✅ addParticipants: Added ${participantIds.length} participants to conversation ${conversationId}`);
        return updatedConversation;
    } catch (error) {
        safeLogError('addParticipants', error);
        throw error;
    }
}

/**
 * removeParticipants() - Remove participants from a conversation
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {Array<string>} participantIds - Array of user IDs to remove
 * @returns {Promise<object>} Updated conversation
 */
export async function removeParticipants(conversationId, participantIds) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('removeParticipants')) {
        throw new Error('removeParticipants module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch(`/api/conversations/${conversationId}/participants`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                participantIds: participantIds,
                removedAt: new Date().toISOString()
            })
        });

        const updatedConversation = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'PARTICIPANTS_REMOVED',
                    conversationId: conversationId,
                    participantIds: participantIds,
                    conversation: updatedConversation,
                    timestamp: Date.now()
                });
            } catch (notificationError) {
                safeLogError('removeParticipants notification', notificationError);
            }
        }

        console.log(`✅ removeParticipants: Removed ${participantIds.length} participants from conversation ${conversationId}`);
        return updatedConversation;
    } catch (error) {
        safeLogError('removeParticipants', error);
        throw error;
    }
}

/**
 * getUnreadCount() - Get unread message count for a conversation or all conversations
 * 
 * @param {string} [conversationId] - Optional conversation ID
 * @returns {Promise<number|object>} Unread count(s)
 */
export async function getUnreadCount(conversationId = null) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('getUnreadCount')) {
        throw new Error('getUnreadCount module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        let url = '/api/messages/unread/count';
        if (conversationId) {
            url = `/api/conversations/${conversationId}/messages/unread/count`;
        }

        const response = await safeFetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        const result = await response.json();
        
        console.log(`✅ getUnreadCount: Retrieved unread count${conversationId ? ` for conversation ${conversationId}` : ' for all conversations'}`);
        return result;
    } catch (error) {
        safeLogError('getUnreadCount', error);
        throw error;
    }
}

/**
 * getMessageStatistics() - Get message statistics for a conversation
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {string} [period='month'] - Time period (day, week, month, year)
 * @returns {Promise<object>} Message statistics
 */
export async function getMessageStatistics(conversationId, period = 'month') {
    // Safety: Check if module is disabled
    if (isModuleDisabled('getMessageStatistics')) {
        throw new Error('getMessageStatistics module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const params = new URLSearchParams();
        params.append('period', period);

        const response = await safeFetch(`/api/conversations/${conversationId}/messages/statistics?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        const statistics = await response.json();
        
        console.log(`✅ getMessageStatistics: Retrieved statistics for conversation ${conversationId} (period: ${period})`);
        return statistics;
    } catch (error) {
        safeLogError('getMessageStatistics', error);
        throw error;
    }
}

/**
 * exportConversation() - Export conversation data
 * 
 * @param {string} conversationId - ID of the conversation
 * @param {string} [format='json'] - Export format (json, csv, txt)
 * @returns {Promise<Blob>} Exported data as Blob
 */
export async function exportConversation(conversationId, format = 'json') {
    // Safety: Check if module is disabled
    if (isModuleDisabled('exportConversation')) {
        throw new Error('exportConversation module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const params = new URLSearchParams();
        params.append('format', format);

        const response = await safeFetch(`/api/conversations/${conversationId}/export?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            }
        });

        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conversation-${conversationId}-export.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log(`✅ exportConversation: Exported conversation ${conversationId} in ${format} format`);
        return blob;
    } catch (error) {
        safeLogError('exportConversation', error);
        throw error;
    }
}

/**
 * sendBulkMessages() - Send bulk messages to multiple conversations
 * 
 * @param {Array<string>} conversationIds - Array of conversation IDs
 * @param {string} content - Message content
 * @param {string} [messageType='text'] - Type of message
 * @param {object} [metadata={}] - Additional metadata
 * @returns {Promise<Array>} Array of message responses
 */
export async function sendBulkMessages(conversationIds, content, messageType = 'text', metadata = {}) {
    // Safety: Check if module is disabled
    if (isModuleDisabled('sendBulkMessages')) {
        throw new Error('sendBulkMessages module is disabled due to errors');
    }
    
    try {
        // Ensure API is initialized
        await ensureInitialized();
        
        const response = await safeFetch('/api/messages/bulk', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
            },
            body: JSON.stringify({
                conversationIds: conversationIds,
                content: content,
                type: messageType,
                metadata: metadata,
                timestamp: new Date().toISOString()
            })
        });

        const results = await response.json();
        
        // Safety: Notify parent window if in iframe
        if (window.parent !== window) {
            try {
                sendParentMessage('DATA_UPDATE', {
                    type: 'BULK_MESSAGES_SENT',
                    conversationIds: conversationIds,
                    results: results,
                    timestamp: Date.now()
                });
            } catch (notificationError) {
                safeLogError('sendBulkMessages notification', notificationError);
            }
        }

        console.log(`✅ sendBulkMessages: Sent messages to ${conversationIds.length} conversations`);
        return results;
    } catch (error) {
        safeLogError('sendBulkMessages', error);
        throw error;
    }
}

// Initialize global exports and ready state - with race condition prevention
setTimeout(() => {
    if (initializationState === INIT_STATE.NOT_STARTED) {
        initializeGlobalAPI().catch(error => {
            console.error('❌ API initialization failed:', error);
            // Set up emergency fallback
            if (!window.__API_MESSAGES) {
                window.__API_MESSAGES = {
                    ready: false,
                    version: '1.0.6',
                    exports: {},
                    config: {
                        strictMode: false,
                        validateOrigins: false,
                        debounceEnabled: false,
                        allowedOrigins: ['*']
                    }
                };
            }
        });
    }
    
    // Perform safe handshake
    if (window.parent !== window) {
        setTimeout(performSafeHandshake, 1000);
    }
}, 100);

// Export all functions and constants
export default {
    STRICT_MESSAGE_TYPES,
    MESSAGE_TYPES,
    sendParentMessage,
    listenToParentMessages,
    sendToParent,
    sendMessageToIframe,
    validateMessage,
    messageResponse,
    configureMessaging,
    sendMessage,
    fetchMessages,
    getMessages,
    markAsRead,
    markChatAsRead,
    addReaction,
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
    // New exports added
    openChat,
    getMessageById,
    getConversations,
    updateConversation,
    addParticipants,
    removeParticipants,
    getUnreadCount,
    getMessageStatistics,
    exportConversation,
    sendBulkMessages
};