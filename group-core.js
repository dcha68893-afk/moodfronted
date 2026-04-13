// =============================================
// GROUPS MODULE - PARENT AUTHORITY COMPLIANT
// DETERMINISTIC STATE MACHINE - VERSION 9.0.1
// FIXED MESSAGE SCHEMA - PARENT AUTHORITY ONLY
// SESSION-AWARE API CALLS - FIXED AUTH HEADERS
// STRICT PROTOCOL COMPLIANCE - NO FALLBACK/RETRY LOOPS
// =============================================

// =============================================
// MODULE IDENTIFICATION - SINGLETON
// =============================================
const MODULE_NAME = 'groups'; // EXACT MATCH - DO NOT CHANGE
const MODULE_VERSION = '9.0.1';
const MODULE_CAPABILITIES = [
    'group_management',
    'group_messaging',
    'member_management',
    'join_requests',
    'group_notes',
    'group_events',
    'transparency_logs',
    'energy_suggestions'
];

// =============================================
// PROTOCOL COMPLIANCE FLAGS - STRICT
// =============================================
let parentReadyReceived = false;
let childReadySent = false;
let handshakeCompleted = false;
let sessionReceived = false;
let initializationComplete = false;
let sessionReady = false;
let parentReady = false;
let moduleInitialized = false; // CRITICAL: Prevent duplicate initialization
let _childReadySentFlag = false; // ADDED: Extra guard for CHILD_READY
let _parentReadyProcessedFlag = false; // ADDED: Extra guard for PARENT_READY

// =============================================
// LIFECYCLE STATE MACHINE - STRICT DETERMINISTIC
// =============================================
const LifecycleState = (function() {
    // States - STRICT ORDER
    const STATES = {
        BOOT: 'BOOT',
        INITIALIZING: 'INITIALIZING',
        READY: 'READY',
        WAIT_PARENT: 'WAIT_PARENT',
        ACTIVE: 'ACTIVE'
    };
    
    // Current state - STRICT SINGLE SOURCE OF TRUTH
    let _state = STATES.BOOT;
    let _registered = false;
    let _listeners = new Set();
    let _initialized = false;
    
    function getState() {
        return _state;
    }
    
    function setState(newState) {
        // STRICT: No backward transitions
        const order = [STATES.BOOT, STATES.INITIALIZING, STATES.READY, STATES.WAIT_PARENT, STATES.ACTIVE];
        const currentIdx = order.indexOf(_state);
        const targetIdx = order.indexOf(newState);
        
        if (currentIdx === -1 || targetIdx === -1) {
            console.warn(`[${MODULE_NAME}] Invalid state transition attempt: ${_state} → ${newState}`);
            return false;
        }
        
        // FIX: Prevent duplicate transitions
        if (_state === newState) {
            debugLog(`State transition prevented: already in ${newState}`);
            return false;
        }
        
        // FIX: Strict transition validation
        if (targetIdx <= currentIdx) {
            console.warn(`[${MODULE_NAME}] Invalid backward transition prevented: ${_state} → ${newState}`);
            return false;
        }
        
        const oldState = _state;
        _state = newState;
        
        /* lifecycle log suppressed */
        
        // Notify listeners
        _listeners.forEach(listener => {
            try {
                listener(newState, oldState);
            } catch (e) {
                // Silent failure
            }
        });
        
        return true;
    }
    
    function canTransitionTo(newState) {
        const order = [STATES.BOOT, STATES.INITIALIZING, STATES.READY, STATES.WAIT_PARENT, STATES.ACTIVE];
        const currentIdx = order.indexOf(_state);
        const targetIdx = order.indexOf(newState);
        
        if (currentIdx === -1 || targetIdx === -1) return false;
        return targetIdx > currentIdx;
    }
    
    function isAtLeast(targetState) {
        const order = [STATES.BOOT, STATES.INITIALIZING, STATES.READY, STATES.WAIT_PARENT, STATES.ACTIVE];
        const currentIdx = order.indexOf(_state);
        const targetIdx = order.indexOf(targetState);
        return currentIdx >= targetIdx && currentIdx !== -1 && targetIdx !== -1;
    }
    
    function isActive() {
        return _state === STATES.ACTIVE;
    }
    
    function isWaitingForParent() {
        return _state === STATES.WAIT_PARENT;
    }
    
    function isReady() {
        return _state === STATES.READY;
    }
    
    function isRegistered() {
        return _registered;
    }
    
    function setRegistered() {
        _registered = true;
    }
    
    function subscribe(listener) {
        _listeners.add(listener);
        listener(_state, null);
        return () => _listeners.delete(listener);
    }
    
    function reset() {
        _state = STATES.BOOT;
        _registered = false;
        parentReadyReceived = false;
        childReadySent = false;
        handshakeCompleted = false;
        sessionReceived = false;
        parentReady = false;
        sessionReady = false;
        _initialized = false;
        moduleInitialized = false;
        _childReadySentFlag = false;
        _parentReadyProcessedFlag = false;
    }
    
    function isInitialized() {
        return _initialized;
    }
    
    function setInitialized() {
        _initialized = true;
    }
    
    // STRICT: Ensure active state guard
    function ensureActive() {
        if (!isActive()) {
            console.warn(`[${MODULE_NAME}] ❌ Blocked action - not ACTIVE (current: ${_state})`);
            return false;
        }
        return true;
    }
    
    return {
        STATES,
        getState,
        setState,
        canTransitionTo,
        isAtLeast,
        isActive,
        isWaitingForParent,
        isReady,
        isRegistered,
        setRegistered,
        subscribe,
        reset,
        isInitialized,
        setInitialized,
        ensureActive
    };
})();

// =============================================
// SESSION STORAGE - MEMORY ONLY (NO LOCALSTORAGE)
// =============================================
let session = {
    token: null,
    user: null,
    expiresAt: null
};

// =============================================
// SESSION VALIDATION GUARD (MANDATORY)
// =============================================
function __isValidSession(sessionObj) {
    if (!sessionObj) return false;

    if (!sessionObj.token || typeof sessionObj.token !== 'string') return false;

    const userId = sessionObj.user?.id ?? sessionObj.user?.uid ?? sessionObj.userId;
    if (userId === undefined || userId === null || userId === 'user' || typeof userId !== 'number') return false;

    return true;
}

// =============================================
// LIFECYCLE GUARD UTILITIES - STRICT
// =============================================
if (typeof window.__lifecycleGuard === 'undefined') {
    window.__lifecycleGuard = {
        actionQueue: []
    };
}

// STRICT: Only allow actions in ACTIVE state
function canSendAction() {
    return LifecycleState.isActive() && parentReady;
}

// STRICT: Only allow API calls in ACTIVE with session
function canMakeApiCall() {
    return LifecycleState.isActive() && parentReady && sessionReady && session.token && __isValidSession(session);
}

// =============================================
// MESSAGE QUEUE SYSTEM - PRE-ACTIVE QUEUE
// =============================================
const messageQueue = [];
let isFlushingQueue = false;

// =============================================
// DEBUG FLAG - CONTROL CONSOLE NOISE
// =============================================
const DEBUG = false;

// Safe console logging wrapper
function debugLog(...args) {
    if (DEBUG) {
        console.log('[groups:debug]', ...args);
    }
}

// =============================================
// ID GENERATION - MANDATORY FOR PROTOCOL
// =============================================
function generateId() {
    return `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================
// STANDARDIZED MESSAGE SCHEMA UTILITIES
// =============================================
function createMessage(type, payload = {}, target = 'parent') {
    const id = generateId();
    return {
        type,
        id,                         // REQUIRED by protocol
        requestId: id,              // REQUIRED for request-response pairing
        source: MODULE_NAME,        // EXACT module name
        target,                     // MUST be "parent"
        timestamp: Date.now(),      // REQUIRED
        module: MODULE_NAME,        // CRITICAL: Parent expects this field
        payload
    };
}

// =============================================
// PENDING REQUESTS TRACKING - REQUEST/RESPONSE PAIRING
// =============================================
const pendingRequests = new Map();

function registerRequest(requestId, resolve, reject) {
    pendingRequests.set(requestId, { resolve, reject, timestamp: Date.now() });
    
    // Clean up old requests after 30 seconds
    setTimeout(() => {
        if (pendingRequests.has(requestId)) {
            const pending = pendingRequests.get(requestId);
            if (pending) {
                // FIX: Graceful timeout with safe fallback
                try {
                    pending.reject(new Error('Request timeout'));
                } catch (e) {
                    debugLog('Error rejecting timed out request:', e);
                }
                pendingRequests.delete(requestId);
            }
        }
    }, 30000);
}

function resolveRequest(requestId, data) {
    const pending = pendingRequests.get(requestId);
    if (pending) {
        try {
            pending.resolve(data);
        } catch (e) {
            debugLog('Error resolving request:', e);
        }
        pendingRequests.delete(requestId);
        return true;
    }
    return false;
}

function rejectRequest(requestId, error) {
    const pending = pendingRequests.get(requestId);
    if (pending) {
        try {
            pending.reject(error);
        } catch (e) {
            debugLog('Error rejecting request:', e);
        }
        pendingRequests.delete(requestId);
        return true;
    }
    return false;
}

// =============================================
// SAFE SEND WITH QUEUE - STRICT PROTOCOL COMPLIANT
// =============================================
function sendMessage(message) {
    // FIX: Validate parent exists
    if (!window.parent || window.parent === window) {
        debugLog('No parent window');
        return { success: false, error: 'no_parent' };
    }
    
    // FIX: Validate message structure
    if (!message || typeof message !== 'object') {
        debugLog('Invalid message object');
        return { success: false, error: 'invalid_message' };
    }
    
    try {
        window.parent.postMessage(message, '*');
        debugLog(`Sent: ${message.type}`, message.id);
        return { success: true, messageId: message.id };
    } catch (error) {
        console.warn(`[${MODULE_NAME}] Error sending message:`, error);
        debugLog('Error sending message:', error);
        return { success: false, error: error.message };
    }
}

function safeSend(type, payload = {}) {
    // STRICT: Guard against premature sending
    // CHILD_READY is the ONLY message allowed before ACTIVE
    if (!canSendAction() && type !== 'CHILD_READY' && type !== 'REGISTER_MODULE') {
        debugLog(`[LifecycleGuard] Queueing ${type} - state: ${LifecycleState.getState()}`);
        const queuedMessage = createMessage(type, payload);
        messageQueue.push(queuedMessage);
        
        // Limit queue size
        if (messageQueue.length > 100) {
            messageQueue.shift();
        }
        
        return Promise.resolve({ 
            success: true, 
            queued: true, 
            messageId: queuedMessage.id 
        });
    }
    
    const message = createMessage(type, payload);
    
    // If parent not ready, queue the message
    if (!parentReady) {
        debugLog(`Queueing ${type} - parent not ready`);
        messageQueue.push(message);
        
        if (messageQueue.length > 100) {
            messageQueue.shift();
        }
        
        return Promise.resolve({ 
            success: true, 
            queued: true, 
            messageId: message.id 
        });
    }
    
    // Send immediately if parent ready and state is ACTIVE
    const result = sendMessage(message);
    return Promise.resolve(result);
}

// =============================================
// API REQUEST FUNCTION - STRICT PARENT PIPELINE
// =============================================
function apiRequest(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        // STRICT: Only allow in ACTIVE state
        if (!LifecycleState.ensureActive()) {
            reject(new Error('Module not active'));
            return;
        }
        
        // FIX: Normalize endpoint
        let normalizedEndpoint = endpoint;
        if (!normalizedEndpoint.startsWith('/')) {
            normalizedEndpoint = '/' + normalizedEndpoint;
        }
        // FIX: Remove /api prefix if present (parent handles it)
        if (normalizedEndpoint.startsWith('/api/')) {
            normalizedEndpoint = normalizedEndpoint.substring(4);
        }
        // FIX: Prevent double slashes
        normalizedEndpoint = normalizedEndpoint.replace(/\/+/g, '/');
        
        const requestId = generateRequestId();
        
        // Register for response
        registerRequest(requestId, resolve, reject);
        
        // Send to parent
        const message = createMessage('API_REQUEST', {
            endpoint: normalizedEndpoint,
            method,
            body,
            requestId
        });
        
        /* lifecycle log suppressed */
        
        if (!parentReady) {
            messageQueue.push(message);
            debugLog(`Queued API request: ${normalizedEndpoint}`);
            return;
        }
        
        sendMessage(message);
    });
}

// =============================================
// FLUSH QUEUE - SEND ALL QUEUED MESSAGES AFTER ACTIVE
// =============================================
function flushQueue() {
    if (isFlushingQueue || messageQueue.length === 0) return;
    
    // STRICT: Only flush when ACTIVE and parent ready
    if (!LifecycleState.isActive() || !parentReady) {
        debugLog('Cannot flush queue - not ACTIVE or parent not ready');
        return;
    }
    
    isFlushingQueue = true;
    debugLog(`Flushing ${messageQueue.length} queued messages`);
    
    // Process queue synchronously
    const messagesToSend = [...messageQueue];
    messageQueue.length = 0;
    
    messagesToSend.forEach(message => {
        sendMessage(message);
    });
    
    isFlushingQueue = false;
}

// =============================================
// CHILD_READY SENDER - EXACTLY ONCE, STRICT STATE
// =============================================
function sendChildReady() {
    // STRICT: Only send in READY state
    if (!LifecycleState.isReady()) {
        /* lifecycle log suppressed */
        return false;
    }
    
    // STRICT: Only send once - enhanced guard
    if (childReadySent || _childReadySentFlag) {
        /* lifecycle log suppressed */
        return false;
    }
    
    _childReadySentFlag = true;
    childReadySent = true;
    
    // Use direct postMessage for handshake - no queue
    const message = {
        type: 'CHILD_READY',
        module: MODULE_NAME,
        version: MODULE_VERSION,
        capabilities: MODULE_CAPABILITIES,
        timestamp: Date.now(),
        id: generateId(),
        requestId: generateId(),
        source: MODULE_NAME,
        target: 'parent'
    };
    
    try {
        const result = sendMessage(message);
        if (result.success) {
            /* lifecycle log suppressed */
            
            // STRICT: Transition to WAIT_PARENT immediately after sending
            LifecycleState.setState(LifecycleState.STATES.WAIT_PARENT);
            /* lifecycle log suppressed */
            
            return true;
        } else {
            console.error(`[${MODULE_NAME}] Failed to send CHILD_READY: ${result.error}`);
            childReadySent = false;
            _childReadySentFlag = false;
            return false;
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to send CHILD_READY:`, error);
        childReadySent = false;
        _childReadySentFlag = false;
        return false;
    }
}

// =============================================
// NO RETRY SYSTEM - STRICT: WAIT PARENT ONLY
// =============================================
// All retry logic REMOVED. Module must wait for PARENT_READY.
// No setInterval, no retry loops, no automatic resend.

// =============================================
// PROCESSED MESSAGES DEDUPLICATION
// =============================================
const processedMessages = new Set();

function isDuplicate(messageId) {
    if (!messageId) return false;
    if (processedMessages.has(messageId)) return true;
    processedMessages.add(messageId);
    
    // Limit set size
    if (processedMessages.size > 100) {
        const iterator = processedMessages.values();
        for (let i = 0; i < 20; i++) {
            const value = iterator.next().value;
            if (value) processedMessages.delete(value);
        }
    }
    return false;
}

// =============================================
// AUTHORIZED FETCH - REMOVED - USE apiRequest ONLY
// =============================================
// All direct fetch calls are removed. Use apiRequest instead.

// =============================================
// REQUEST SESSION FROM PARENT - STRICT
// =============================================
let sessionRequestCount = 0;
const MAX_SESSION_REQUESTS = 3;
let sessionRequestTimeout = null;

function requestSession() {
    // STRICT: Only request session when ACTIVE
    if (!LifecycleState.isActive()) {
        debugLog('Cannot request session: not active');
        return false;
    }
    
    if (sessionRequestCount >= MAX_SESSION_REQUESTS) {
        console.warn(`[${MODULE_NAME}] Max session requests reached, waiting for parent`);
        return false;
    }
    
    // Clear any pending timeout
    if (sessionRequestTimeout) {
        clearTimeout(sessionRequestTimeout);
        sessionRequestTimeout = null;
    }
    
    sessionRequestCount++;
    
    // Simple delay without exponential backoff
    const delay = 1000;
    
    sessionRequestTimeout = setTimeout(() => {
        // Only send if still ACTIVE
        if (LifecycleState.isActive()) {
            safeSend('REQUEST_SESSION', {
                module: MODULE_NAME,
                reason: sessionRequestCount > 1 ? 'retry' : 'initial'
            });
        }
        sessionRequestTimeout = null;
    }, delay);
    
    return true;
}

// =============================================
// PARENT MESSAGING - STANDARDIZED PROTOCOL
// =============================================
const ParentMessaging = {
    _pendingAcks: new Map(),
    _allowedOrigins: new Set([
        window.location.origin,
        'http://localhost',
        'http://127.0.0.1',
        'null'
    ]),
    _expectedParentOrigin: window.location.origin,
    
    // Check if origin is trusted
    isTrustedOrigin(origin) {
        if (!origin) return false;
        
        // Allow localhost variations
        if (origin.startsWith('http://localhost:') || 
            origin.startsWith('http://127.0.0.1:')) {
            return true;
        }
        
        return this._allowedOrigins.has(origin);
    },
    
    // Validate message follows standardized schema
    validateMessage(msg) {
        // FIX: Basic validation first
        if (!msg || typeof msg !== 'object') {
            debugLog('Invalid message: not an object');
            return false;
        }
        if (!msg.type || typeof msg.type !== 'string') {
            debugLog('Invalid message: missing or invalid type');
            return false;
        }
        
        // Minimal validation for handshake messages
        if (msg.type === 'CHILD_READY' || msg.type === 'PARENT_READY') {
            return true;
        }
        
        // Full validation for other messages
        if (!msg.id || typeof msg.id !== 'string') {
            debugLog('Invalid message: missing id');
            return false;
        }
        if (!msg.requestId || typeof msg.requestId !== 'string') {
            debugLog('Invalid message: missing requestId');
            return false;
        }
        if (!msg.source || typeof msg.source !== 'string') {
            debugLog('Invalid message: missing source');
            return false;
        }
        if (!msg.target || typeof msg.target !== 'string') {
            debugLog('Invalid message: missing target');
            return false;
        }
        if (!msg.timestamp || typeof msg.timestamp !== 'number') {
            debugLog('Invalid message: missing timestamp');
            return false;
        }
        if (msg.payload === undefined) {
            debugLog('Invalid message: missing payload');
            return false;
        }
        
        return true;
    },
    
    // Send message to parent using standardized schema
    send(type, payload = {}) {
        return safeSend(type, payload);
    },
    
    // Handle incoming message from parent
    handleIncoming(event) {
        // FIX: Validate event exists
        if (!event || !event.data) {
            debugLog('Invalid event received');
            return false;
        }
        
        const message = event.data;
        
        // STRICT: Validate origin for all messages
        if (!this.isTrustedOrigin(event.origin)) {
            console.warn(`[${MODULE_NAME}] Blocked message from untrusted origin:`, event.origin);
            return false;
        }
        
        // Validate message structure
        if (!this.validateMessage(message)) {
            debugLog('Invalid message format:', message);
            return false;
        }
        
        // Check if message is for us
        if (message.target && message.target !== MODULE_NAME && message.target !== '*' && message.target !== 'parent') {
            return false;
        }
        
        // STRICT: Deduplicate by messageId
        if (message.id && isDuplicate(message.id)) {
            /* lifecycle log suppressed */
            return true;
        }
        
        debugLog('Received:', message.type, message.id);
        
        // Route to appropriate handler
        return MessageRouter.handle(message);
    }
};

// =============================================
// MESSAGE ROUTER - SINGLE ENTRY POINT
// =============================================
const MessageRouter = {
    // Handle messages based on type
    handle(message) {
        // FIX: Validate message exists
        if (!message || !message.type) {
            debugLog('Cannot handle message: invalid or missing type');
            return false;
        }
        
        // Use setTimeout to prevent blocking the message listener
        setTimeout(() => {
            try {
                this._handleSync(message);
            } catch (error) {
                console.error(`[${MODULE_NAME}] Error handling message:`, error);
            }
        }, 0);
        
        return true;
    },
    
    _handleSync(message) {
        try {
            switch (message.type) {
                // Lifecycle messages
                case 'PARENT_READY':
                    this.handleParentReady(message);
                    return true;
                    
                case 'MODULE_REGISTERED':
                    this.handleModuleRegistered(message);
                    return true;
                    
                case 'SESSION_DATA':
                case 'SESSION_ACTIVE':
                    this.handleSessionSync(message);
                    return true;
                    
                case 'SESSION_UPDATE':
                    this.handleSessionUpdate(message);
                    return true;
                    
                case 'HEARTBEAT':
                    this.handleHeartbeat(message);
                    return true;
                    
                // API Response messages
                case 'API_RESPONSE':
                    this.handleApiResponse(message);
                    return true;
                    
                // Group management messages
                case 'GROUP_LIST_RESPONSE':
                    this.handleGroupListResponse(message);
                    return true;
                    
                case 'GROUP_CREATED':
                    this.handleGroupCreated(message);
                    return true;
                    
                case 'GROUP_UPDATED':
                    this.handleGroupUpdated(message);
                    return true;
                    
                case 'GROUP_DELETED':
                    this.handleGroupDeleted(message);
                    return true;
                    
                case 'GROUP_MEMBER_ADDED':
                case 'MEMBER_ADDED':
                    this.handleMemberAdded(message);
                    return true;
                    
                case 'GROUP_MEMBER_REMOVED':
                case 'GROUP_MEMBER_LEFT':
                case 'MEMBER_REMOVED':
                    this.handleMemberRemoved(message);
                    return true;
                    
                case 'GROUP_ADMIN_PROMOTED':
                    this.handleAdminPromoted(message);
                    return true;
                    
                case 'GROUP_ADMIN_DEMOTED':
                    this.handleAdminDemoted(message);
                    return true;
                    
                case 'GROUP_JOIN_REQUEST_RECEIVED':
                    this.handleJoinRequestReceived(message);
                    return true;
                    
                case 'GROUP_JOIN_REQUEST_APPROVED':
                    this.handleJoinRequestApproved(message);
                    return true;
                    
                case 'GROUP_JOIN_REQUEST_REJECTED':
                    this.handleJoinRequestRejected(message);
                    return true;
                    
                // Group messages
                case 'NEW_MESSAGE':
                case 'GROUP_MESSAGE':
                    this.handleGroupMessage(message);
                    return true;
                    
                case 'UNREAD_COUNT_UPDATED':
                    this.handleUnreadCountUpdated(message);
                    return true;
                    
                case 'GROUP_TYPING':
                    this.handleTypingIndicator(message);
                    return true;
                    
                // Error handling
                case 'ERROR':
                    this.handleError(message);
                    return true;
                    
case 'SETTING_CHANGED':
            case 'SETTINGS_UPDATED':
              
                this.handleSettingsChange(message);
                return true;

                default:
                    debugLog('Unhandled message type:', message.type);
                    return false;
            }
        } catch (error) {
            console.error(`[${MODULE_NAME}] Error in message handler:`, error);
            return false;
        }
    },
    

    // =========================================
    // LIFECYCLE HANDLERS - STRICT PROTOCOL
    // =========================================
    
    handleParentReady(message) {
        // STRICT: Only process if waiting for parent
        if (!LifecycleState.isWaitingForParent()) {
            /* lifecycle log suppressed */
            return;
        }
        
        // STRICT: Prevent duplicate processing - enhanced guard
        if (parentReadyReceived || _parentReadyProcessedFlag) {
            /* lifecycle log suppressed */
            return;
        }
        
        _parentReadyProcessedFlag = true;
        parentReadyReceived = true;
        handshakeCompleted = true;
        
        /* lifecycle log suppressed */
        
        // Extract session data from message
        const sessionData = message.payload?.session || message.session || message.payload;
        
        if (sessionData) {
            applySession(sessionData);
        }
        
        // Set parent ready flag
        parentReady = true;
        
        // STRICT: Transition to ACTIVE ONLY IF session is valid
        if (__isValidSession(session)) {
            LifecycleState.setState(LifecycleState.STATES.ACTIVE);
            console.log(`[${MODULE_NAME}] State: WAIT_PARENT → ACTIVE (session valid)`);
        } else {
            console.warn(`[${MODULE_NAME}] Cannot activate — invalid session. Staying in WAIT_PARENT.`);
            return;
        }
        
        // Flush any queued messages
        flushQueue();
        
        // Send registration if needed
        if (!LifecycleState.isRegistered()) {
            safeSend('REGISTER_MODULE', {
                module: MODULE_NAME,
                version: MODULE_VERSION,
                capabilities: MODULE_CAPABILITIES
            });
        }
        
        // Request session if not received
        if (!sessionReceived) {
            requestSession();
        }
        
        // Now ACTIVE - initialize UI and start data flow
        onModuleActive();
    },
    
    handleModuleRegistered(message) {
        /* lifecycle log suppressed */
        
        if (LifecycleState.isActive() && message.payload?.success) {
            LifecycleState.setRegistered();
        }
    },
    
    handleSessionSync(message) {
        const sessionData = message.payload;
        /* lifecycle log suppressed */
        
        // Validate session data before applying
        if (!__isValidSession(sessionData)) {
            console.warn('[MODULE] Ignored invalid SESSION_DATA', sessionData);
            return;
        }
        
        if (sessionData) {
            // Prevent session downgrade
            if (session && __isValidSession(session)) {
                if (!__isValidSession(sessionData)) {
                    console.warn('[MODULE] Prevented session downgrade');
                    return;
                }
            }
            
            // Deduplicate session events
            const sessionHash = `${sessionData.token}_${sessionData.user?.id ?? sessionData.userId}`;
            if (this._lastSessionHash === sessionHash) {
                debugLog('Duplicate SESSION_DATA ignored');
                return;
            }
            this._lastSessionHash = sessionHash;
            
            applySession(sessionData);
            
            // Clear session request timeout
            if (sessionRequestTimeout) {
                clearTimeout(sessionRequestTimeout);
                sessionRequestTimeout = null;
            }
            
            // Reset session request counter on success
            sessionRequestCount = 0;
            
            // Request initial group list if ACTIVE
            if (LifecycleState.isActive() && GroupCore && typeof GroupCore.requestGroupList === 'function') {
                GroupCore.requestGroupList();
            }
        }
    },
    
    handleSessionUpdate(message) {
        const updateData = message.payload;
        /* lifecycle log suppressed */
        
        if (updateData && LifecycleState.isActive()) {
            // Validate partial update (only fields we care about)
            if (updateData.token && typeof updateData.token !== 'string') {
                console.warn('[MODULE] Invalid token in SESSION_UPDATE, ignoring');
                return;
            }
            if (updateData.user && (!updateData.user.id || updateData.user.id === 'user' || typeof updateData.user.id !== 'number')) {
                console.warn('[MODULE] Invalid user in SESSION_UPDATE, ignoring');
                return;
            }
            
            // Merge session in memory only if valid
            if (__isValidSession(updateData)) {
                session.token = updateData.token || session.token;
                session.user = updateData.user || session.user;
                session.expiresAt = updateData.expiresAt ? new Date(updateData.expiresAt).getTime() : session.expiresAt;
            } else if (updateData.token && updateData.user && __isValidSession({ token: updateData.token, user: updateData.user })) {
                session.token = updateData.token;
                session.user = updateData.user;
                session.expiresAt = updateData.expiresAt ? new Date(updateData.expiresAt).getTime() : null;
            }
            
            updateSessionInCore(session);
        }
    },
    
    handleHeartbeat(message) {
        debugLog('HEARTBEAT received');
        
        // Only respond with HEARTBEAT_ACK if ACTIVE
        if (LifecycleState.isActive() && parentReady) {
            safeSend('HEARTBEAT_ACK', {
                inResponseTo: message.id,
                timestamp: Date.now(),
                state: LifecycleState.getState(),
                sessionReady
            });
        }
    },
    
    // =========================================
    // API RESPONSE HANDLER
    // =========================================
    
    handleApiResponse(message) {
        const payload = message.payload || {};
        const { requestId, success, data, error } = payload;
        
        console.log(`[${MODULE_NAME}] API_RESPONSE received for ${requestId}: ${success ? 'SUCCESS' : 'FAILED'}`);
        
        if (requestId) {
            if (success) {
                resolveRequest(requestId, { success: true, data });
            } else {
                rejectRequest(requestId, new Error(error || 'API request failed'));
            }
        }
    },
    
    handleError(message) {
    const errorMsg = message.payload?.message || 'Unknown error';
    console.warn(`[${MODULE_NAME}] Error from parent:`, errorMsg);
},

// =========================================
// ADD THIS NEW HANDLER METHOD HERE
// =========================================
handleSettingsChange(message) {
    const payload = message.payload || {};
    const { section, key, value, settings } = payload;

    debugLog('Settings change notification:', { section, key, value });

    // Apply the single key change using the full applier
    if (section && key !== undefined) {
        applySettingToGroupModule(section, key, value);
    }

    // If a full settings object was provided, apply all keys
    if (settings && typeof settings === 'object') {
        Object.entries(settings).forEach(([sec, secVal]) => {
            if (secVal && typeof secVal === 'object')
                Object.entries(secVal).forEach(([k, v]) => applySettingToGroupModule(sec, k, v));
        });
        try { SafeStorage.setItem('user_settings', settings); } catch (e) {}
    }

    GroupCore.emit('setting_changed', { section, key, value, settings });
},

    // =========================================
    // GROUP MANAGEMENT HANDLERS (PRESERVED)
    // =========================================
    
    handleGroupListResponse(message) {
        const payload = message.payload || {};
        
        if (payload.groups) {
            // Update GroupCore
            if (GroupCore) {
                GroupCore.groups = payload.groups || [];
                GroupCore.myGroups = payload.myGroups || [];
                GroupCore.joinedGroups = payload.joinedGroups || [];
                GroupCore.adminGroups = payload.adminGroups || [];
                
                GroupCore.saveGroups();
                GroupCore.emit('groups:list-updated', {
                    groups: GroupCore.groups,
                    myGroups: GroupCore.myGroups,
                    joinedGroups: GroupCore.joinedGroups,
                    adminGroups: GroupCore.adminGroups
                });
            }
            
            // Update global variables for backward compatibility
            if (typeof groups !== 'undefined') {
                groups = payload.groups || [];
            }
            if (typeof myGroups !== 'undefined') {
                myGroups = payload.myGroups || [];
            }
            if (typeof joinedGroups !== 'undefined') {
                joinedGroups = payload.joinedGroups || [];
            }
            if (typeof adminGroups !== 'undefined') {
                adminGroups = payload.adminGroups || [];
            }
        }
    },
    
    handleGroupCreated(message) {
        const payload = message.payload || {};
        
        if (payload.group) {
            const newGroup = payload.group;
            
            // Update GroupCore
            if (GroupCore) {
                if (!GroupCore.groups.some(g => g.id === newGroup.id)) {
                    GroupCore.groups.push(newGroup);
                    
                    const currentUserId = GroupCore.getCurrentUser()?.id || GroupCore.getCurrentUser()?.uid;
                    if (newGroup.createdBy === currentUserId) {
                        GroupCore.myGroups.push(newGroup);
                        GroupCore.adminGroups.push(newGroup);
                    } else {
                        GroupCore.joinedGroups.push(newGroup);
                    }
                    
                    GroupCore.saveGroups();
                    GroupCore.emit('group:created', newGroup);
                }
            }
            
            // Update global variables
            if (typeof groups !== 'undefined' && !groups.some(g => g.id === newGroup.id)) {
                groups.push(newGroup);
                
                const currentUserId = getCurrentUserLocal()?.id || getCurrentUserLocal()?.uid;
                if (newGroup.createdBy === currentUserId) {
                    if (typeof myGroups !== 'undefined') myGroups.push(newGroup);
                    if (typeof adminGroups !== 'undefined') adminGroups.push(newGroup);
                } else {
                    if (typeof joinedGroups !== 'undefined') joinedGroups.push(newGroup);
                }
            }
        }
    },
    
    handleGroupUpdated(message) {
        const payload = message.payload || {};
        
        if (payload.group) {
            const updatedGroup = payload.group;
            
            // Update GroupCore
            if (GroupCore) {
                GroupCore.updateGroupInLists(updatedGroup);
                GroupCore.saveGroups();
                GroupCore.emit('group:updated', updatedGroup);
            }
            
            // Update global variables
            updateGroupInAllLists(updatedGroup);
            
            // Update UI if needed (only if ACTIVE)
            if (LifecycleState.isActive()) {
                if (selectedGroup && selectedGroup.id === updatedGroup.id) {
                    selectedGroup = updatedGroup;
                    if (typeof loadGroupDetails === 'function') {
                        loadGroupDetails(selectedGroup, selectedGroup.type || 'group');
                    }
                }
                
                if (currentChatGroup && currentChatGroup.id === updatedGroup.id) {
                    currentChatGroup = updatedGroup;
                    if (typeof updateChatHeaderUniqueFeatures === 'function') {
                        updateChatHeaderUniqueFeatures(updatedGroup);
                    }
                    if (typeof checkPostingRules === 'function') {
                        checkPostingRules(updatedGroup);
                    }
                }
            }
        }
    },
    
    handleGroupDeleted(message) {
        const payload = message.payload || {};
        
        if (payload.groupId) {
            const groupId = payload.groupId;
            
            // Update GroupCore
            if (GroupCore) {
                GroupCore.groups = GroupCore.groups.filter(g => g.id !== groupId);
                GroupCore.myGroups = GroupCore.myGroups.filter(g => g.id !== groupId);
                GroupCore.adminGroups = GroupCore.adminGroups.filter(g => g.id !== groupId);
                GroupCore.joinedGroups = GroupCore.joinedGroups.filter(g => g.id !== groupId);
                
                delete GroupCore.groupMessages[groupId];
                delete GroupCore.groupUnreadCounts[groupId];
                
                GroupCore.saveGroups();
                GroupCore.emit('group:deleted', { groupId });
            }
            
            // Update global variables
            if (typeof groups !== 'undefined') {
                groups = groups.filter(g => g.id !== groupId);
            }
            if (typeof myGroups !== 'undefined') {
                myGroups = myGroups.filter(g => g.id !== groupId);
            }
            if (typeof adminGroups !== 'undefined') {
                adminGroups = adminGroups.filter(g => g.id !== groupId);
            }
            if (typeof joinedGroups !== 'undefined') {
                joinedGroups = joinedGroups.filter(g => g.id !== groupId);
            }
            if (typeof groupInvites !== 'undefined') {
                groupInvites = groupInvites.filter(invite => invite.groupId !== groupId && invite.id !== groupId);
            }
            
            if (typeof groupMessages !== 'undefined') {
                delete groupMessages[groupId];
            }
            if (typeof groupUnreadCounts !== 'undefined') {
                delete groupUnreadCounts[groupId];
            }
            
            // Clean up storage
            try {
                SafeStorage?.removeItem(`group_messages_${groupId}`);
                SafeStorage?.removeItem(`group_unread_${groupId}`);
            } catch (e) {}
            
            // Close chat if open (only if ACTIVE)
            if (LifecycleState.isActive()) {
                if (currentChatGroup && currentChatGroup.id === groupId) {
                    if (typeof closeGroupChatMobile === 'function') {
                        closeGroupChatMobile();
                    }
                    currentChatGroup = null;
                }
                
                // Update UI
                if (typeof updateGroupCounts === 'function') {
                    updateGroupCounts();
                }
                if (typeof updateCurrentSection === 'function') {
                    updateCurrentSection();
                }
            }
        }
    },
    
    handleMemberAdded(message) {
        const payload = message.payload || {};
        
        if (payload.groupId && payload.member) {
            const { groupId, member } = payload;
            
            // Update GroupCore
            if (GroupCore) {
                const group = GroupCore.getGroupById(groupId);
                if (group) {
                    if (!group.members) group.members = [];
                    if (!group.members.some(m => m.userId === member.userId)) {
                        group.members.push(member);
                        if (group.memberCount !== undefined) {
                            group.memberCount = group.members.length;
                        }
                        GroupCore.updateGroupInLists(group);
                        GroupCore.saveGroups();
                        GroupCore.emit('group:member-added', { groupId, member });
                    }
                }
            }
            
            // Update global variables
            const group = (typeof groups !== 'undefined' ? groups.find(g => g.id === groupId) : null) ||
                         (typeof myGroups !== 'undefined' ? myGroups.find(g => g.id === groupId) : null) ||
                         (typeof adminGroups !== 'undefined' ? adminGroups.find(g => g.id === groupId) : null) ||
                         (typeof joinedGroups !== 'undefined' ? joinedGroups.find(g => g.id === groupId) : null);
            
            if (group) {
                if (!group.members) group.members = [];
                if (!group.members.some(m => m.userId === member.userId)) {
                    group.members.push(member);
                    if (group.memberCount !== undefined) {
                        group.memberCount = group.members.length;
                    }
                    updateGroupInAllLists(group);
                }
            }
        }
    },
    
    handleMemberRemoved(message) {
        const payload = message.payload || {};
        
        if (payload.groupId && payload.userId) {
            const { groupId, userId } = payload;
            
            // Update GroupCore
            if (GroupCore) {
                const group = GroupCore.getGroupById(groupId);
                if (group && group.members) {
                    group.members = group.members.filter(m => m.userId !== userId);
                    if (group.memberCount !== undefined) {
                        group.memberCount = group.members.length;
                    }
                    GroupCore.updateGroupInLists(group);
                    GroupCore.saveGroups();
                    GroupCore.emit('group:member-removed', { groupId, userId });
                }
            }
            
            // Update global variables
            const group = (typeof groups !== 'undefined' ? groups.find(g => g.id === groupId) : null) ||
                         (typeof myGroups !== 'undefined' ? myGroups.find(g => g.id === groupId) : null) ||
                         (typeof adminGroups !== 'undefined' ? adminGroups.find(g => g.id === groupId) : null) ||
                         (typeof joinedGroups !== 'undefined' ? joinedGroups.find(g => g.id === groupId) : null);
            
            if (group && group.members) {
                group.members = group.members.filter(m => m.userId !== userId);
                if (group.memberCount !== undefined) {
                    group.memberCount = group.members.length;
                }
                updateGroupInAllLists(group);
            }
            
            // If current user was removed, clean up (only if ACTIVE)
            const currentUserId = getCurrentUserLocal()?.id || getCurrentUserLocal()?.uid;
            if (userId === currentUserId && LifecycleState.isActive()) {
                if (typeof groups !== 'undefined') {
                    groups = groups.filter(g => g.id !== groupId);
                }
                if (typeof myGroups !== 'undefined') {
                    myGroups = myGroups.filter(g => g.id !== groupId);
                }
                if (typeof adminGroups !== 'undefined') {
                    adminGroups = adminGroups.filter(g => g.id !== groupId);
                }
                if (typeof joinedGroups !== 'undefined') {
                    joinedGroups = joinedGroups.filter(g => g.id !== groupId);
                }
                
                if (currentChatGroup && currentChatGroup.id === groupId) {
                    if (typeof closeGroupChatMobile === 'function') {
                        closeGroupChatMobile();
                    }
                    currentChatGroup = null;
                }
            }
        }
    },
    
    handleAdminPromoted(message) {
        const payload = message.payload || {};
        
        if (payload.groupId && payload.userId) {
            const { groupId, userId } = payload;
            
            // Update GroupCore
            if (GroupCore) {
                const group = GroupCore.getGroupById(groupId);
                if (group && group.members) {
                    const member = group.members.find(m => m.userId === userId);
                    if (member) {
                        member.role = 'admin';
                        GroupCore.updateGroupInLists(group);
                        GroupCore.saveGroups();
                        GroupCore.emit('group:admin-promoted', { groupId, userId });
                    }
                }
            }
            
            // Update global variables
            const group = (typeof groups !== 'undefined' ? groups.find(g => g.id === groupId) : null) ||
                         (typeof myGroups !== 'undefined' ? myGroups.find(g => g.id === groupId) : null) ||
                         (typeof adminGroups !== 'undefined' ? adminGroups.find(g => g.id === groupId) : null) ||
                         (typeof joinedGroups !== 'undefined' ? joinedGroups.find(g => g.id === groupId) : null);
            
            if (group && group.members) {
                const member = group.members.find(m => m.userId === userId);
                if (member) {
                    member.role = 'admin';
                    updateGroupInAllLists(group);
                }
            }
        }
    },
    
    handleAdminDemoted(message) {
        const payload = message.payload || {};
        
        if (payload.groupId && payload.userId) {
            const { groupId, userId } = payload;
            
            // Update GroupCore
            if (GroupCore) {
                const group = GroupCore.getGroupById(groupId);
                if (group && group.members) {
                    const member = group.members.find(m => m.userId === userId);
                    if (member) {
                        member.role = 'member';
                        GroupCore.updateGroupInLists(group);
                        GroupCore.saveGroups();
                        GroupCore.emit('group:admin-demoted', { groupId, userId });
                    }
                }
            }
            
            // Update global variables
            const group = (typeof groups !== 'undefined' ? groups.find(g => g.id === groupId) : null) ||
                         (typeof myGroups !== 'undefined' ? myGroups.find(g => g.id === groupId) : null) ||
                         (typeof adminGroups !== 'undefined' ? adminGroups.find(g => g.id === groupId) : null) ||
                         (typeof joinedGroups !== 'undefined' ? joinedGroups.find(g => g.id === groupId) : null);
            
            if (group && group.members) {
                const member = group.members.find(m => m.userId === userId);
                if (member) {
                    member.role = 'member';
                    updateGroupInAllLists(group);
                }
            }
        }
    },
    
    handleJoinRequestReceived(message) {
        const payload = message.payload || {};
        
        if (payload.groupId && payload.request) {
            if (GroupCore) {
                GroupCore.emit('group:join-request-received', { 
                    groupId: payload.groupId, 
                    request: payload.request 
                });
            }
        }
    },
    
    handleJoinRequestApproved(message) {
        const payload = message.payload || {};
        
        if (payload.groupId && payload.userId) {
            if (GroupCore) {
                GroupCore.emit('group:join-request-approved', { 
                    groupId: payload.groupId, 
                    userId: payload.userId 
                });
            }
        }
    },
    
    handleJoinRequestRejected(message) {
        const payload = message.payload || {};
        
        if (payload.groupId && payload.userId) {
            if (GroupCore) {
                GroupCore.emit('group:join-request-rejected', { 
                    groupId: payload.groupId, 
                    userId: payload.userId 
                });
            }
        }
    },
    
    handleGroupMessage(message) {
        const payload = message.payload || {};
        
        if (payload.groupId && payload.message) {
            const { groupId, message: messageData } = payload;
            
            // Update GroupCore
            if (GroupCore) {
                GroupCore.addGroupMessage(groupId, messageData);
            }
            
            // Update global variables
            if (typeof groupMessages !== 'undefined') {
                if (!groupMessages[groupId]) {
                    groupMessages[groupId] = [];
                }
                groupMessages[groupId].push(messageData);
                
                // Limit size
                if (groupMessages[groupId].length > 100) {
                    groupMessages[groupId].splice(0, groupMessages[groupId].length - 100);
                }
                
                try {
                    SafeStorage?.setItem(`group_messages_${groupId}`, groupMessages[groupId]);
                } catch (e) {}
            }
            
            // Update unread count (only if ACTIVE)
            if (LifecycleState.isActive()) {
                if (currentChatGroup && currentChatGroup.id === groupId) {
                    // Don't increment if chat is open
                    if (typeof addMessageToChat === 'function') {
                        addMessageToChat(messageData, true);
                    }
                } else {
                    if (typeof incrementGroupUnreadCount === 'function') {
                        incrementGroupUnreadCount(groupId);
                    }
                }
            }
        }
    },
    
    handleUnreadCountUpdated(message) {
        const payload = message.payload || {};
        
        if (payload.groupId) {
            const { groupId, count } = payload;
            
            if (typeof groupUnreadCounts !== 'undefined') {
                groupUnreadCounts[groupId] = count !== undefined ? count : 0;
                
                try {
                    SafeStorage?.setItem(`group_unread_${groupId}`, groupUnreadCounts[groupId]);
                } catch (e) {}
            }
            
            if (GroupCore) {
                GroupCore.groupUnreadCounts[groupId] = count !== undefined ? count : 0;
                GroupCore.emit('group:unread-count-updated', { groupId, count: count || 0 });
            }
        }
    },
    
    handleTypingIndicator(message) {
        const payload = message.payload || {};
        
        if (payload.groupId && payload.userId) {
            const { groupId, userId, isTyping } = payload;
            
            if (GroupCore && typeof GroupCore.handleTyping === 'function') {
                GroupCore.handleTyping(groupId, userId, isTyping === true);
            }
            
            if (typeof groupTypingUsers !== 'undefined') {
                if (!groupTypingUsers[groupId]) {
                    groupTypingUsers[groupId] = {};
                }
                
                if (isTyping) {
                    groupTypingUsers[groupId][userId] = Date.now();
                } else {
                    delete groupTypingUsers[groupId][userId];
                }
            }
        }
    }
};

// =============================================
// APPLY SESSION - CENTRALIZED SESSION HANDLER
// =============================================


function updateSessionInCore(sessionData) {
    applySession(sessionData);
}

// =============================================// =============================================
// APPLY SESSION - CENTRALIZED SESSION HANDLER
// =============================================
// Store the last session hash globally, not as a property of the function
let _lastAppliedSessionHash = null;

function applySession(sessionData) {
    if (!sessionData) return;
    
    // Validate session data before applying
    if (!__isValidSession(sessionData)) {
        console.warn('[MODULE] applySession: Invalid session data, ignoring');
        return;
    }
    
    // Prevent session downgrade
    if (session && __isValidSession(session)) {
        if (!__isValidSession(sessionData)) {
            console.warn('[MODULE] applySession: Prevented session downgrade');
            return;
        }
    }
    
    // Deduplicate session events (simple hash based on token+userId)
    const sessionHash = `${sessionData.token}_${sessionData.user?.id ?? sessionData.userId}`;
    if (_lastAppliedSessionHash === sessionHash) {
        debugLog('Duplicate applySession ignored');
        return;
    }
    _lastAppliedSessionHash = sessionHash;
    
    sessionReceived = true;
    sessionReady = true;
    
    // Store session in memory ONLY - NEVER in localStorage
    if (sessionData.token) {
        session.token = sessionData.token;
        session.user = sessionData.user || null;
        session.expiresAt = sessionData.expiresAt ? new Date(sessionData.expiresAt).getTime() : null;
    }
    
    // Update GroupCore with session data (memory only)
    if (GroupCore && sessionData.user) {
        GroupCore.currentUser = sessionData.user;
        GroupCore.userData = {
            displayName: sessionData.user.displayName || sessionData.user.name || 'User',
            username: sessionData.user.username || '',
            email: sessionData.user.email || '',
            photoURL: sessionData.user.photoURL || sessionData.user.avatar || ''
        };
    }
    
    // Update global variables (memory only)
    if (sessionData.user) {
        if (typeof currentUser !== 'undefined') {
            currentUser = sessionData.user;
        }
        if (typeof userData !== 'undefined') {
            userData = {
                displayName: sessionData.user.displayName || sessionData.user.name || 'User',
                username: sessionData.user.username || '',
                email: sessionData.user.email || '',
                photoURL: sessionData.user.photoURL || sessionData.user.avatar || ''
            };
        }
    }
    
    // Update auth flags
    if (typeof authReady !== 'undefined') {
        authReady = true;
    }
    if (typeof authCheckComplete !== 'undefined') {
        authCheckComplete = true;
    }
    if (typeof __SESSION_READY__ !== 'undefined') {
        __SESSION_READY__ = true;
    }
    
    // Update UI only if ACTIVE
    if (LifecycleState.isActive() && typeof updateUserUI === 'function') {
        updateUserUI();
    }
}
// UI INITIALIZATION - ONLY AFTER ACTIVE
// =============================================
function onModuleActive() {
    if (!LifecycleState.isActive()) return;
    
    debugLog('Module activated - initializing UI');
    
    // Load cached data (non-auth data only)
    if (typeof loadCachedDataInstantly === 'function') {
        loadCachedDataInstantly();
    }
    if (typeof loadUniqueFeaturesData === 'function') {
        loadUniqueFeaturesData();
    }
    
    // Setup UI event listeners
    if (typeof setupUIEventListeners === 'function') {
        setupUIEventListeners();
    }
    if (typeof setupResponsiveBehavior === 'function') {
        setupResponsiveBehavior();
    }
    
    // Update UI
    if (typeof updateGroupCounts === 'function') {
        updateGroupCounts();
    }
    if (typeof updateCurrentSection === 'function') {
        updateCurrentSection();
    }
    if (typeof updateUserUI === 'function') {
        updateUserUI();
    }
    
    // Start data flow (only if session ready)
    if (sessionReady) {
        startDataFlow();
    }
}

function initUIAfterActivation() {
    onModuleActive();
}

// =============================================
// DATA FLOW - ONLY WHEN ACTIVE AND SESSION READY
// =============================================
function startDataFlow() {
    if (!LifecycleState.isActive()) {
        debugLog('Data flow blocked: not ACTIVE');
        return;
    }
    
    if (!sessionReady) {
        debugLog('Data flow blocked: session not ready');
        requestSession();
        return;
    }
    
    debugLog('Starting data flow');
    
    // Request initial group list
    if (GroupCore && typeof GroupCore.requestGroupList === 'function') {
        GroupCore.requestGroupList();
    }
    
    // Load user data in background
    if (typeof loadUserDataInBackground === 'function') {
        loadUserDataInBackground().catch(() => {});
    }
    
    // Start background sync
    if (typeof startBackgroundSync === 'function') {
        startBackgroundSync();
    }
}

// =============================================
// SAFE STORAGE - Deterministic data persistence (NON-AUTH DATA ONLY)
// =============================================
const SafeStorage = (function() {
    'use strict';
    
    const STORAGE_PREFIX = 'knecta_groups_';
    const storage = new Map();
    let useLocalStorage = true;
    let initialized = false;
    const subscribers = new Map();
    
    // Test localStorage availability immediately
    try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
    } catch (e) {
        useLocalStorage = false;
    }
    
    function init() {
        if (initialized) return;
        
        try {
            if (useLocalStorage) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(STORAGE_PREFIX)) {
                        try {
                            const value = localStorage.getItem(key);
                            const storageKey = key.substring(STORAGE_PREFIX.length);
                            storage.set(storageKey, JSON.parse(value));
                        } catch (e) {}
                    }
                }
            }
            
            initialized = true;
            debugLog('SafeStorage initialized');
        } catch (error) {
            debugLog('SafeStorage init error:', error);
        }
    }
    
    function getKey(key) {
        return `${STORAGE_PREFIX}${key}`;
    }
    
    function setItem(key, value, skipBroadcast = false) {
        try {
            const storageKey = key;
            const serialized = JSON.stringify(value);
            
            storage.set(storageKey, value);
            
            if (useLocalStorage) {
                localStorage.setItem(getKey(storageKey), serialized);
            }
            
            return true;
        } catch (error) {
            debugLog('SafeStorage setItem error:', error);
            return false;
        }
    }
    
    function getItem(key, defaultValue = null) {
        try {
            const storageKey = key;
            
            if (storage.has(storageKey)) {
                return storage.get(storageKey);
            }
            
            if (useLocalStorage) {
                const serialized = localStorage.getItem(getKey(storageKey));
                if (serialized) {
                    const value = JSON.parse(serialized);
                    storage.set(storageKey, value);
                    return value;
                }
            }
            
            return defaultValue;
        } catch (error) {
            debugLog('SafeStorage getItem error:', error);
            return defaultValue;
        }
    }
    
    function removeItem(key, skipBroadcast = false) {
        try {
            const storageKey = key;
            
            storage.delete(storageKey);
            
            if (useLocalStorage) {
                localStorage.removeItem(getKey(storageKey));
            }
            
            return true;
        } catch (error) {
            debugLog('SafeStorage removeItem error:', error);
            return false;
        }
    }
    
    function clear() {
        try {
            storage.clear();
            
            if (useLocalStorage) {
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(STORAGE_PREFIX)) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
            }
            
            return true;
        } catch (error) {
            debugLog('SafeStorage clear error:', error);
            return false;
        }
    }
    
    function getKeys() {
        const keys = new Set();
        
        storage.forEach((_, key) => keys.add(key));
        
        if (useLocalStorage) {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    keys.add(key.substring(STORAGE_PREFIX.length));
                }
            }
        }
        
        return Array.from(keys);
    }
    
    function destroy() {
        storage.clear();
        subscribers.clear();
        initialized = false;
    }
    
    // Auto-initialize
    init();
    
    return {
        init,
        setItem,
        getItem,
        removeItem,
        clear,
        getKeys,
        destroy,
        isAvailable: () => initialized
    };
})();

// =============================================
// GROUP CORE - Main communication and state manager
// =============================================
const GroupCore = {
    // State stores
    groups: [],
    myGroups: [],
    joinedGroups: [],
    groupInvites: [],
    adminGroups: [],
    groupMessages: {},
    groupUnreadCounts: {},
    groupTypingUsers: {},
    joinRequests: {},
    
    // Session data (memory only)
    currentUser: null,
    userData: null,
    
    // Event listeners
    _eventListeners: new Map(),
    
    // Initialization flag
    _initialized: false,
    
    // Initialize the core
    init() {
        if (this._initialized) return;
        this._initialized = true;
        
        debugLog('GroupCore initialized');
        
        // Load cached data (non-auth only)
        this.loadCachedData();
        
        return this;
    },
    
    // Event system for UI communication
    on(event, callback) {
        if (!this._eventListeners.has(event)) {
            this._eventListeners.set(event, new Set());
        }
        this._eventListeners.get(event).add(callback);
        return () => this.off(event, callback);
    },
    
    off(event, callback) {
        if (this._eventListeners.has(event)) {
            this._eventListeners.get(event).delete(callback);
        }
    },
    
    emit(event, data) {
        if (this._eventListeners.has(event)) {
            this._eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`Error in event listener for ${event}:`, e);
                }
            });
        }
    },
    
    // Load cached data from SafeStorage (NON-AUTH ONLY)
    loadCachedData() {
        try {
            const groupsData = SafeStorage.getItem('groups');
            if (groupsData) {
                this.groups = groupsData;
            }
            
            const myGroupsData = SafeStorage.getItem('myGroups');
            if (myGroupsData) this.myGroups = myGroupsData;
            
            const joinedData = SafeStorage.getItem('joinedGroups');
            if (joinedData) this.joinedGroups = joinedData;
            
            const invitesData = SafeStorage.getItem('groupInvites');
            if (invitesData) this.groupInvites = invitesData;
            
            const adminData = SafeStorage.getItem('adminGroups');
            if (adminData) this.adminGroups = adminData;
            
            // DO NOT load user from storage - session only from parent
            this.currentUser = null;
            this.userData = null;
            
            // Load message caches
            const allGroupIds = new Set();
            this.groups.forEach(g => allGroupIds.add(g.id));
            this.myGroups.forEach(g => allGroupIds.add(g.id));
            this.joinedGroups.forEach(g => allGroupIds.add(g.id));
            this.adminGroups.forEach(g => allGroupIds.add(g.id));
            
            allGroupIds.forEach(groupId => {
                try {
                    const messagesData = SafeStorage.getItem(`group_messages_${groupId}`);
                    if (messagesData) {
                        this.groupMessages[groupId] = messagesData;
                    }
                    
                    const unreadData = SafeStorage.getItem(`group_unread_${groupId}`);
                    if (unreadData !== null) {
                        this.groupUnreadCounts[groupId] = unreadData;
                    }
                } catch (e) {}
            });
            
            this.emit('groups:loaded', { groups: this.groups });
        } catch (error) {
            console.error('Error loading cached data:', error);
        }
    },
    
    // Save groups to storage (NON-AUTH ONLY)
    saveGroups() {
        try {
            SafeStorage.setItem('groups', this.groups);
            SafeStorage.setItem('myGroups', this.myGroups);
            SafeStorage.setItem('joinedGroups', this.joinedGroups);
            SafeStorage.setItem('groupInvites', this.groupInvites);
            SafeStorage.setItem('adminGroups', this.adminGroups);
            SafeStorage.setItem('lastCacheTime', Date.now().toString());
            
            // DO NOT save user data to storage
        } catch (error) {
            console.error('Error saving groups:', error);
        }
    },
    
    // Get group by ID
    getGroupById(groupId) {
        return this.groups.find(g => g.id === groupId) || 
               this.myGroups.find(g => g.id === groupId) || 
               this.adminGroups.find(g => g.id === groupId) ||
               this.joinedGroups.find(g => g.id === groupId);
    },
    
    // Update group in all lists
    updateGroupInLists(updatedGroup) {
        const groupIndex = this.groups.findIndex(g => g.id === updatedGroup.id);
        if (groupIndex !== -1) {
            this.groups[groupIndex] = updatedGroup;
        }
        
        const myIndex = this.myGroups.findIndex(g => g.id === updatedGroup.id);
        if (myIndex !== -1) {
            this.myGroups[myIndex] = updatedGroup;
        }
        
        const adminIndex = this.adminGroups.findIndex(g => g.id === updatedGroup.id);
        if (adminIndex !== -1) {
            this.adminGroups[adminIndex] = updatedGroup;
        }
        
        const joinedIndex = this.joinedGroups.findIndex(g => g.id === updatedGroup.id);
        if (joinedIndex !== -1) {
            this.joinedGroups[joinedIndex] = updatedGroup;
        }
        
        this.emit('group:updated', updatedGroup);
    },
    
    // =============================================
    // GROUP MANAGEMENT API CALLS - USING apiRequest
    // =============================================
    
    // Request group list from parent using apiRequest
    async requestGroupList() {
        if (!LifecycleState.ensureActive()) {
            debugLog('Cannot request groups: not active');
            return { success: false, reason: 'not_active' };
        }
        
        if (!sessionReady) {
            debugLog('Cannot request groups: session not ready');
            requestSession();
            return { success: false, reason: 'session_not_ready' };
        }
        
        debugLog('Requesting group list via apiRequest');
        
        try {
            const response = await apiRequest('/groups/user', 'GET');
            
            if (response && response.success && response.data) {
                const groupsData = response.data;
                this.groups = groupsData.groups || [];
                this.myGroups = groupsData.myGroups || [];
                this.joinedGroups = groupsData.joinedGroups || [];
                this.adminGroups = groupsData.adminGroups || [];
                
                this.saveGroups();
                this.emit('groups:list-updated', {
                    groups: this.groups,
                    myGroups: this.myGroups,
                    joinedGroups: this.joinedGroups,
                    adminGroups: this.adminGroups
                });
                
                debugLog(`Loaded ${this.groups.length} groups from backend`);
                return { success: true, data: response.data };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to load groups:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Create a new group using apiRequest
    async createGroup(groupData) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'createGroup', data: groupData });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'createGroup', data: groupData });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Creating group via apiRequest');
        
        try {
            const response = await apiRequest('/groups', 'POST', {
                name: groupData.name,
                description: groupData.description || '',
                members: groupData.members || [],
                privacy: groupData.privacy || 'private',
                purpose: groupData.purpose || '',
                mood: groupData.mood || '',
                postingRule: groupData.postingRule || 'everyone',
                quietHours: groupData.quietHours || {},
                scheduledPosting: groupData.scheduledPosting || {},
                participationModes: groupData.participationModes || {}
            });
            
            if (response && response.success && response.data) {
                const newGroup = response.data;
                
                // Add to local stores
                this.groups.push(newGroup);
                if (newGroup.createdBy === (this.currentUser?.uid || this.currentUser?.id)) {
                    this.myGroups.push(newGroup);
                    this.adminGroups.push(newGroup);
                } else {
                    this.joinedGroups.push(newGroup);
                }
                
                this.saveGroups();
                this.emit('group:created', newGroup);
                debugLog(`Group created: ${newGroup.name}`);
                return { success: true, data: newGroup };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to create group:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get group details using apiRequest
    async getGroupDetails(groupId) {
        if (!LifecycleState.ensureActive()) {
            return { success: false, reason: 'not_active' };
        }
        
        if (!sessionReady) {
            requestSession();
            return { success: false, reason: 'session_not_ready' };
        }
        
        debugLog(`Getting group details for ${groupId}`);
        
        try {
            const response = await apiRequest(`/groups/${groupId}`, 'GET');
            
            if (response && response.success && response.data) {
                const group = response.data;
                this.updateGroupInLists(group);
                this.saveGroups();
                this.emit('group:details-loaded', group);
                return { success: true, data: group };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to get group details:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Update group settings using apiRequest
    async updateGroup(groupId, groupData) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'updateGroup', groupId, data: groupData });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'updateGroup', groupId, data: groupData });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Updating group via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}`, 'PUT', {
                name: groupData.name,
                description: groupData.description,
                privacy: groupData.privacy,
                purpose: groupData.purpose,
                mood: groupData.mood,
                postingRule: groupData.postingRule,
                quietHours: groupData.quietHours,
                scheduledPosting: groupData.scheduledPosting,
                participationModes: groupData.participationModes
            });
            
            if (response && response.success && response.data) {
                const updatedGroup = response.data;
                this.updateGroupInLists(updatedGroup);
                this.saveGroups();
                this.emit('group:updated', updatedGroup);
                debugLog(`Group updated: ${updatedGroup.name}`);
                return { success: true, data: updatedGroup };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to update group:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Delete group using apiRequest
    async deleteGroup(groupId) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'deleteGroup', groupId });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'deleteGroup', groupId });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Deleting group via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}`, 'DELETE');
            
            if (response && response.success) {
                // Remove from local stores
                this.groups = this.groups.filter(g => g.id !== groupId);
                this.myGroups = this.myGroups.filter(g => g.id !== groupId);
                this.adminGroups = this.adminGroups.filter(g => g.id !== groupId);
                this.joinedGroups = this.joinedGroups.filter(g => g.id !== groupId);
                
                delete this.groupMessages[groupId];
                delete this.groupUnreadCounts[groupId];
                
                this.saveGroups();
                this.emit('group:deleted', { groupId });
                debugLog('Group deleted');
                return { success: true };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to delete group:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Add member to group using apiRequest
    async addMember(groupId, userId, role = 'member') {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'addMember', groupId, userId, role });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'addMember', groupId, userId, role });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Adding member to group via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}/members/${userId}`, 'POST', {
                groupId,
                userId,
                role
            });
            
            if (response && response.success && response.data) {
                const member = response.data;
                const group = this.getGroupById(groupId);
                
                if (group) {
                    if (!group.members) group.members = [];
                    if (!group.members.some(m => m.userId === userId)) {
                        group.members.push(member);
                        if (group.memberCount !== undefined) {
                            group.memberCount = group.members.length;
                        }
                        this.updateGroupInLists(group);
                        this.saveGroups();
                        this.emit('group:member-added', { groupId, member });
                        debugLog('Member added to group');
                    }
                }
                return { success: true, data: member };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to add member:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Remove member from group using apiRequest
    async removeMember(groupId, userId) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'removeMember', groupId, userId });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'removeMember', groupId, userId });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Removing member from group via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}/members/${userId}`, 'DELETE');const _unused = {
                groupId,
                userId
            };
            
            if (response && response.success) {
                const group = this.getGroupById(groupId);
                
                if (group && group.members) {
                    group.members = group.members.filter(m => m.userId !== userId);
                    if (group.memberCount !== undefined) {
                        group.memberCount = group.members.length;
                    }
                    this.updateGroupInLists(group);
                    this.saveGroups();
                    this.emit('group:member-removed', { groupId, userId });
                    debugLog('Member removed from group');
                }
                return { success: true };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to remove member:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Leave group using apiRequest
    async leaveGroup(groupId) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'leaveGroup', groupId });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'leaveGroup', groupId });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Leaving group via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}/leave`, 'POST');
            
            if (response && response.success) {
                // Remove from local stores
                this.groups = this.groups.filter(g => g.id !== groupId);
                this.joinedGroups = this.joinedGroups.filter(g => g.id !== groupId);
                this.myGroups = this.myGroups.filter(g => g.id !== groupId);
                this.adminGroups = this.adminGroups.filter(g => g.id !== groupId);
                
                this.saveGroups();
                this.emit('group:left', { groupId });
                debugLog('Left group');
                return { success: true };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to leave group:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Promote to admin using apiRequest
    async promoteToAdmin(groupId, userId) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'promoteToAdmin', groupId, userId });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'promoteToAdmin', groupId, userId });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Promoting to admin via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}/members/${userId}/role`, 'PUT', {
                role: 'admin'
            });
            
            if (response && response.success) {
                const group = this.getGroupById(groupId);
                
                if (group && group.members) {
                    const member = group.members.find(m => m.userId === userId);
                    if (member) {
                        member.role = 'admin';
                        this.updateGroupInLists(group);
                        this.saveGroups();
                        this.emit('group:admin-promoted', { groupId, userId });
                        debugLog('User promoted to admin');
                    }
                }
                return { success: true };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to promote to admin:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Demote from admin using apiRequest
    async demoteFromAdmin(groupId, userId) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'demoteFromAdmin', groupId, userId });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'demoteFromAdmin', groupId, userId });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Demoting from admin via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}/members/${userId}/role`, 'PUT', {
                role: 'member'
            });
            
            if (response && response.success) {
                const group = this.getGroupById(groupId);
                
                if (group && group.members) {
                    const member = group.members.find(m => m.userId === userId);
                    if (member) {
                        member.role = 'member';
                        this.updateGroupInLists(group);
                        this.saveGroups();
                        this.emit('group:admin-demoted', { groupId, userId });
                        debugLog('User demoted from admin');
                    }
                }
                return { success: true };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to demote from admin:', error);
            return { success: false, error: error.message };
        }
    },
    
    // ===== Invite a user to a group via the real invitation API =====
    async inviteToGroup(groupId, inviteeId, role = 'member', message = '') {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'inviteToGroup', groupId, inviteeId, role });
            return { queued: true };
        }
        if (!sessionReady) {
            queueGroupAction({ type: 'inviteToGroup', groupId, inviteeId, role });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        debugLog(`Inviting user ${inviteeId} to group ${groupId}`);
        try {
            const response = await apiRequest(`/group-members/${groupId}/invitations`, 'POST', {
                inviteeId,
                role,
                message,
            });
            if (response && response.success) {
                this.emit('group:invitation-sent', { groupId, inviteeId });
                debugLog('Invitation sent');
                return { success: true, data: response.data };
            }
            return { success: false, error: response?.error || 'Failed to send invitation' };
        } catch (error) {
            debugLog('Failed to invite user:', error);
            return { success: false, error: error.message };
        }
    },

    // ===== Cancel a pending invitation =====
    async cancelInvitation(invitationId) {
        if (!LifecycleState.ensureActive()) return { success: false, reason: 'not_active' };
        if (!sessionReady) { requestSession(); return { success: false, reason: 'session_not_ready' }; }
        debugLog(`Cancelling invitation ${invitationId}`);
        try {
            const response = await apiRequest(`/group-members/invitations/${invitationId}`, 'DELETE');
            if (response && response.success) {
                this.emit('group:invitation-cancelled', { invitationId });
                return { success: true };
            }
            return { success: false, error: response?.error || 'Failed to cancel invitation' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // ===== Fetch pending invitations for a group =====
    async getGroupInvitations(groupId) {
        if (!LifecycleState.ensureActive()) return { success: false, data: [] };
        if (!sessionReady) { requestSession(); return { success: false, data: [] }; }
        try {
            const response = await apiRequest(`/group-members/${groupId}/invitations`, 'GET');
            if (response && response.success) return { success: true, data: response.data };
            return { success: false, data: [] };
        } catch (error) {
            return { success: false, data: [], error: error.message };
        }
    },

    // Send join request using apiRequest
    async sendJoinRequest(groupId, message = '') {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'sendJoinRequest', groupId, message });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'sendJoinRequest', groupId, message });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Sending join request via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}/join`, 'POST', {
                message
            });
            
            if (response && response.success) {
                this.emit('group:join-request-sent', { groupId });
                debugLog('Join request sent');
                return { success: true };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to send join request:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Approve join request using apiRequest
    async approveJoinRequest(groupId, requestId, userId) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'approveJoinRequest', groupId, requestId, userId });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'approveJoinRequest', groupId, requestId, userId });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Approving join request via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}/members/${requestId}`, 'POST');
            
            if (response && response.success) {
                this.emit('group:join-request-approved', { groupId, userId });
                debugLog('Join request approved');
                return { success: true };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to approve join request:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Reject join request using apiRequest
    async rejectJoinRequest(groupId, requestId, userId) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'rejectJoinRequest', groupId, requestId, userId });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'rejectJoinRequest', groupId, requestId, userId });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Rejecting join request via apiRequest');
        
        try {
            // FIXED: Use correct reject endpoint
            const response = await apiRequest(`/groups/${groupId}/join-requests/${requestId}/reject`, 'POST', { userId });
            
            if (response && response.success) {
                this.emit('group:join-request-rejected', { groupId, userId });
                debugLog('Join request rejected');
                return { success: true };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to reject join request:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Send group message using apiRequest
    async sendGroupMessage(groupId, content, topic = null, anonymous = false) {
        if (!LifecycleState.ensureActive()) {
            queueGroupAction({ type: 'sendMessage', groupId, content, topic, anonymous });
            return { queued: true };
        }
        
        if (!sessionReady) {
            queueGroupAction({ type: 'sendMessage', groupId, content, topic, anonymous });
            requestSession();
            return { queued: true, reason: 'session_not_ready' };
        }
        
        debugLog('Sending group message via apiRequest');
        
        try {
            const response = await apiRequest(`/groups/${groupId}/messages`, 'POST', {
                groupId,
                content,
                topic,
                anonymous
            });
            
            if (response && response.success && response.data) {
                const messageData = response.data;
                this.addGroupMessage(groupId, messageData);
                this.emit('group:message-sent', { groupId, message: messageData });
                debugLog('Message sent');
                return { success: true, data: messageData };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to send message:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Load group messages using apiRequest
    async loadGroupMessages(groupId, limit = 50) {
        if (!LifecycleState.ensureActive()) {
            return { success: false, reason: 'not_active' };
        }
        
        if (!sessionReady) {
            requestSession();
            return { success: false, reason: 'session_not_ready' };
        }
        
        debugLog(`Loading messages for group ${groupId}`);
        
        try {
            const response = await apiRequest(`/groups/${groupId}/messages?limit=${limit}`, 'GET');
            
            if (response && response.success && response.data) {
                const messages = response.data;
                this.groupMessages[groupId] = messages;
                
                try {
                    SafeStorage.setItem(`group_messages_${groupId}`, messages);
                } catch (e) {}
                
                this.emit('group:messages-loaded', { groupId, messages });
                debugLog(`Loaded ${messages.length} messages`);
                return { success: true, data: messages };
            }
            return { success: false, error: 'Invalid response' };
        } catch (error) {
            debugLog('Failed to load messages:', error);
            return { success: false, error: error.message };
        }
    },
    
    // Get group messages
    getGroupMessages(groupId) {
        return this.groupMessages[groupId] || [];
    },
    
    // Save group messages
    saveGroupMessages(groupId, messages) {
        const existing = this.groupMessages[groupId] || [];
        const combined = [...existing, ...messages];
        
        // Limit to 100 messages per group
        if (combined.length > 100) {
            this.groupMessages[groupId] = combined.slice(-100);
        } else {
            this.groupMessages[groupId] = combined;
        }
        
        try {
            SafeStorage.setItem(`group_messages_${groupId}`, this.groupMessages[groupId]);
        } catch (e) {}
    },
    
    // Add group message
    addGroupMessage(groupId, message) {
        if (!groupId || !message) return;
        
        const messages = this.groupMessages[groupId] || [];
        
        // Check for duplicates
        if (messages.some(m => m.id === message.id)) return;
        
        messages.push(message);
        
        if (messages.length > 100) {
            messages.splice(0, messages.length - 100);
        }
        
        this.groupMessages[groupId] = messages;
        
        try {
            SafeStorage.setItem(`group_messages_${groupId}`, messages);
        } catch (e) {}
        
        this.incrementGroupUnreadCount(groupId);
        
        this.emit('group:message-received', { groupId, message });
    },
    
    // Get group unread count
    getGroupUnreadCount(groupId) {
        return this.groupUnreadCounts[groupId] || 0;
    },
    
    // Increment group unread count
    incrementGroupUnreadCount(groupId) {
        if (!groupId) return;
        
        if (currentChatGroup && currentChatGroup.id === groupId) {
            return;
        }
        
        const count = (this.groupUnreadCounts[groupId] || 0) + 1;
        this.groupUnreadCounts[groupId] = count;
        
        try {
            SafeStorage.setItem(`group_unread_${groupId}`, count);
        } catch (e) {}
        
        this.emit('group:unread-count-updated', { groupId, count });
    },
    
    // Reset group unread count
    resetGroupUnreadCount(groupId) {
        if (!groupId) return;
        
        this.groupUnreadCounts[groupId] = 0;
        
        try {
            SafeStorage.setItem(`group_unread_${groupId}`, 0);
        } catch (e) {}
        
        this.emit('group:unread-count-updated', { groupId, count: 0 });
    },
    
    // Mark message as seen
    markMessageAsSeen(groupId, messageId, userId) {
        if (!groupId || !messageId || !userId) return;
        
        const messages = this.groupMessages[groupId];
        if (!messages) return;
        
        const message = messages.find(m => m.id === messageId);
        if (!message) return;
        
        if (!message.seenBy) {
            message.seenBy = [];
        }
        
        if (!message.seenBy.includes(userId)) {
            message.seenBy.push(userId);
        }
        
        this.saveGroupMessages(groupId, messages);
    },
    
    // Handle typing indicator
    handleTyping(groupId, userId, isTyping) {
        if (!groupId || !userId) return;
        
        if (!this.groupTypingUsers[groupId]) {
            this.groupTypingUsers[groupId] = {};
        }
        
        if (isTyping) {
            this.groupTypingUsers[groupId][userId] = Date.now();
        } else {
            delete this.groupTypingUsers[groupId][userId];
        }
        
        this.emit('group:typing', { groupId, userId, isTyping });
    },
    
    // Get current user (from session memory)
    getCurrentUser() {
        return session.user || this.currentUser;
    },
    
    // Check if ready for group operations
    isReady() {
        return LifecycleState.isActive() && parentReady && sessionReady;
    }
};

// Initialize GroupCore
GroupCore.init();

// =============================================
// SINGLE MESSAGE LISTENER - ONE INSTANCE
// =============================================
// =============================================
// SINGLE MESSAGE LISTENER - ONE INSTANCE
// =============================================
if (typeof window !== 'undefined' && !window.__GROUPS_MESSAGE_LISTENER_SET__) {
    window.__GROUPS_MESSAGE_LISTENER_SET__ = true;
    
    window.addEventListener('message', (event) => {
        try {
            const data = event.data;
            
            // ── OFFLINE-FIRST: Apply per-key setting changes immediately ──
            if (data && (data.type === 'SETTING_CHANGED' || data.type === 'SETTINGS_UPDATED')) {
                const payload = data.payload || data;

                if (data.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
                    const { section, key, value } = payload;
                    applySettingToGroupModule(section, key, value);
                    window.dispatchEvent(new CustomEvent('settingChanged', { detail: { section, key, value, timestamp: Date.now() } }));
                    debugLog(`Setting changed: ${section}.${key} = ${value}`);
                }
                if (data.type === 'SETTINGS_UPDATED' && payload.settings) {
                    const s = payload.settings;
                    Object.entries(s).forEach(([sec, secVal]) => {
                        if (secVal && typeof secVal === 'object')
                            Object.entries(secVal).forEach(([k, v]) => applySettingToGroupModule(sec, k, v));
                    });
                    window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { settings: s, timestamp: Date.now() } }));
                    debugLog('Settings updated:', s);
                }
                return;
            }
            
            // Normal message handling
            ParentMessaging.handleIncoming(event);
        } catch (error) {
            console.error(`[${MODULE_NAME}] Error handling message:`, error);
        }
    });
}


// Helper function to update group theme when settings change
function updateGroupThemeOnSettingChange(theme) {
    try {
        // Update any open group chat header
        if (currentChatGroup) {
            const themeInfo = groupThemes[theme === 'dark' ? 'dark' : 'blue'];
            const chatAvatar = safeGetElement('#chatAvatar');
            if (chatAvatar && themeInfo) {
                chatAvatar.style.background = themeInfo.gradient;
            }
        }
        
        // Update all group avatars in lists
        document.querySelectorAll('.group-avatar').forEach(avatar => {
            const groupItem = avatar.closest('.group-item');
            if (groupItem && groupItem.dataset.groupId) {
                const group = GroupCore.getGroupById(groupItem.dataset.groupId);
                if (group && group.theme) {
                    const groupThemeInfo = groupThemes[group.theme] || groupThemes.blue;
                    avatar.style.background = groupThemeInfo.gradient;
                }
            }
        });
    } catch (error) {
        debugLog('Error updating group theme:', error);
    }
}
// =============================================
// INITIALIZATION SEQUENCE - DETERMINISTIC PROTOCOL
// =============================================
function initializeModule() {
    // STRICT: Prevent duplicate initialization - CRITICAL FIX
    if (moduleInitialized) {
        console.warn(`[${MODULE_NAME}] ⚠️ Duplicate initialization prevented`);
        return;
    }
    
    if (LifecycleState.isInitialized()) {
        console.warn(`[${MODULE_NAME}] ⚠️ Already initialized`);
        return;
    }
    
    if (LifecycleState.getState() !== LifecycleState.STATES.BOOT) {
        console.warn(`[${MODULE_NAME}] ⚠️ Cannot initialize - not in BOOT state (current: ${LifecycleState.getState()})`);
        return;
    }
    
    moduleInitialized = true;
    LifecycleState.setInitialized();
    
    console.log(`[${MODULE_NAME}] Initializing - Version ${MODULE_VERSION}`);
    
    // STRICT: Transition to INITIALIZING
    LifecycleState.setState(LifecycleState.STATES.INITIALIZING);
    console.log(`[${MODULE_NAME}] State: BOOT → INITIALIZING`);
    
    // Initialize core dependencies synchronously
    if (typeof initCoreDependencies === 'function') {
        initCoreDependencies();
    }
    
    // STRICT: Transition to READY
    LifecycleState.setState(LifecycleState.STATES.READY);
    console.log(`[${MODULE_NAME}] State: INITIALIZING → READY`);
    
    // STRICT: Send CHILD_READY exactly once (transitions to WAIT_PARENT)
    sendChildReady();
    
    // STRICT: No retry mechanism - WAIT_PARENT is a hard wait state
    console.log(`[${MODULE_NAME}] WAIT_PARENT - waiting for parent ready`);
}

function initCoreDependencies() {
    // Initialize any core dependencies synchronously
    debugLog('Initializing core dependencies');
}

// =============================================
// SAFE INPUT VALIDATION
// =============================================
const SECURITY_CONFIG = {
    MAX_STRING_LENGTH: 10000,
    MAX_ARRAY_LENGTH: 1000,
    ALLOWED_PROTOCOLS: ['http:', 'https:', 'ws:', 'wss:'],
    BLOCKED_PATTERNS: [
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /onclick/i,
        /onerror/i,
        /onload/i,
        /onmouseover/i,
        /<script/i,
        /<\/script/i
    ]
};

function validateInput(input, maxLength = SECURITY_CONFIG.MAX_STRING_LENGTH) {
    if (input === null || input === undefined) return '';
    
    const str = String(input);
    if (str.length > maxLength) {
        return str.substring(0, maxLength);
    }
    
    for (const pattern of SECURITY_CONFIG.BLOCKED_PATTERNS) {
        if (pattern.test(str)) {
            return '';
        }
    }
    
    return str;
}

function safeGetElement(selector) {
    try {
        if (!selector || typeof selector !== 'string') return null;
        return document.querySelector(selector);
    } catch (error) {
        return null;
    }
}

// =============================================
// STATUS MACHINE - One Message Only Per State Change
// =============================================
const STATUS_MACHINE = (function() {
    'use strict';
    
    const shownStatuses = new Set();
    const lastState = new Map();
    
    const symbols = {
        'INIT': '🚀',
        'SENDING': '📤',
        'WAITING': '⏳',
        'SUCCESS': '✅',
        'FAILED': '❌',
        'READY': '🔵',
        'WARNING': '⚠️',
        'iframe-state': '📱',
        'registration': '📋',
        'session': '🔐'
    };
    
    const colors = {
        'INIT': '#aaa',
        'SENDING': '#33b5e5',
        'WAITING': '#ff8800',
        'SUCCESS': '#00C851',
        'FAILED': '#ff4444',
        'READY': '#0099CC',
        'WARNING': '#ffbb33'
    };
    
    return {
        log: function(context, status, details = '') {
            const key = `${context}:${status}`;
            
            const prev = lastState.get(context);
            if (prev === status) return;
            
            if (shownStatuses.has(key)) return;
            
            lastState.set(context, status);
            shownStatuses.add(key);
            
            const symbol = symbols[status] || symbols[context] || '•';
            
            if (DEBUG || status === 'INIT' || status === 'SUCCESS' || status === 'FAILED') {
                console.log(
                    `%c${symbol} ${status}${details ? ` ${details}` : ''}`,
                    `color: ${colors[status] || colors[context] || '#aaa'}; font-weight: bold;`
                );
            }
        }
    };
})();

window.__STATUS_MACHINE = STATUS_MACHINE;

// =============================================
// ACTION QUEUE MANAGEMENT
// =============================================
const groupActionQueue = [];
let isProcessingQueue = false;

function queueGroupAction(action) {
    groupActionQueue.push(action);
    
    if (!isProcessingQueue && LifecycleState.isActive() && sessionReady) {
        processGroupActionQueue();
    }
}

function processGroupActionQueue() {
    if (isProcessingQueue) return;
    if (groupActionQueue.length === 0) return;
    
    if (!LifecycleState.isActive() || !sessionReady) {
        return;
    }
    
    isProcessingQueue = true;
    
    const actions = [...groupActionQueue];
    groupActionQueue.length = 0;
    
    // Process synchronously without setTimeout
    actions.forEach(action => {
        try {
            if (typeof action === 'function') {
                action();
            } else if (action && action.type) {
                switch (action.type) {
                    case 'createGroup':
                        GroupCore.createGroup(action.data).catch(() => {});
                        break;
                    case 'updateGroup':
                        GroupCore.updateGroup(action.groupId, action.data).catch(() => {});
                        break;
                    case 'deleteGroup':
                        GroupCore.deleteGroup(action.groupId).catch(() => {});
                        break;
                    case 'addMember':
                        GroupCore.addMember(action.groupId, action.userId, action.role).catch(() => {});
                        break;
                    case 'removeMember':
                        GroupCore.removeMember(action.groupId, action.userId).catch(() => {});
                        break;
                    case 'leaveGroup':
                        GroupCore.leaveGroup(action.groupId).catch(() => {});
                        break;
                    case 'promoteToAdmin':
                        GroupCore.promoteToAdmin(action.groupId, action.userId).catch(() => {});
                        break;
                    case 'demoteFromAdmin':
                        GroupCore.demoteFromAdmin(action.groupId, action.userId).catch(() => {});
                        break;
                    case 'sendJoinRequest':
                        GroupCore.sendJoinRequest(action.groupId, action.message).catch(() => {});
                        break;
                    case 'approveJoinRequest':
                        GroupCore.approveJoinRequest(action.groupId, action.requestId, action.userId).catch(() => {});
                        break;
                    case 'rejectJoinRequest':
                        GroupCore.rejectJoinRequest(action.groupId, action.requestId, action.userId).catch(() => {});
                        break;
                    case 'sendMessage':
                        if (action.groupId && action.content) {
                            GroupCore.sendGroupMessage(action.groupId, action.content, action.topic, action.anonymous).catch(() => {});
                        } else if (action.fn && typeof action.fn === 'function') {
                            action.fn();
                        }
                        break;
                    case 'joinGroup':
                        if (action.groupId) {
                            GroupCore.sendJoinRequest(action.groupId, '').catch(() => {});
                        }
                        break;
                    case 'changeMemberRole':
                        if (action.groupId && action.userId && action.role === 'admin') {
                            GroupCore.promoteToAdmin(action.groupId, action.userId).catch(() => {});
                        } else if (action.groupId && action.userId) {
                            GroupCore.demoteFromAdmin(action.groupId, action.userId).catch(() => {});
                        }
                        break;
                }
            }
        } catch (e) {}
    });
    
    isProcessingQueue = false;
    
    if (groupActionQueue.length > 0) {
        processGroupActionQueue();
    }
}

// =============================================
// GLOBAL VARIABLES (PRESERVED FOR BACKWARD COMPATIBILITY)
// =============================================
let currentUser = null; // Will be updated from session
let userData = null;    // Will be updated from session
let groups = [];
let myGroups = [];
let joinedGroups = [];
let groupInvites = [];
let adminGroups = [];
let selectedGroup = null;
let currentTypeFilter = 'all';
let currentSearchTerm = '';
let isLoadedFromLocalStorage = false;
let isMobile = false;
let pendingGroupActions = [];
let offlineOverlayDismissed = false;
let friends = [];
let selectedFriends = [];

let groupMessages = {};
let groupUnreadCounts = {};
let groupTypingUsers = {};
let currentChatGroup = null;

// =============================================
// UNIQUE FEATURES VARIABLES (PRESERVED)
// =============================================
const groupPurposes = Object.freeze({
    'study': { name: 'Study', icon: '📚', color: '#4CAF50' },
    'prayer': { name: 'Prayer', icon: '🙏', color: '#9C27B0' },
    'work': { name: 'Work', icon: '💼', color: '#2196F3' },
    'family': { name: 'Family', icon: '👨‍👩‍👧‍👦', color: '#FF9800' },
    'event': { name: 'Event', icon: '🎉', color: '#E91E63' },
    'project': { name: 'Project', icon: '📋', color: '#009688' },
    'support': { name: 'Support', icon: '🤝', color: '#3F51B5' },
    'hobby': { name: 'Hobby', icon: '🎨', color: '#FF5722' },
    'fitness': { name: 'Fitness', icon: '💪', color: '#00BCD4' },
    'other': { name: 'Other', icon: '🔮', color: '#607D8B' }
});

const groupMoods = Object.freeze({
    'calm': { name: 'Calm', icon: '😌', color: '#1976d2', bgColor: '#e3f2fd' },
    'busy': { name: 'Busy', icon: '🏃', color: '#f57c00', bgColor: '#fff3e0' },
    'celebratory': { name: 'Celebratory', icon: '🎉', color: '#c2185b', bgColor: '#fce4ec' },
    'silent': { name: 'Silent', icon: '🔇', color: '#616161', bgColor: '#f5f5f5' },
    'urgent': { name: 'Urgent', icon: '🚨', color: '#d32f2f', bgColor: '#ffebee' }
});

const postingRules = Object.freeze({
    'everyone': { name: 'Everyone can post', color: '#4CAF50', bgColor: '#E8F5E9' },
    'admin_only': { name: 'Admin-only posting', color: '#FF9800', bgColor: '#FFF3E0' },
    'scheduled': { name: 'Scheduled posting times', color: '#2196F3', bgColor: '#E3F2FD' },
    'quiet_hours': { name: 'Quiet hours enabled', color: '#9C27B0', bgColor: '#F3E5F5' }
});

const participationModes = Object.freeze({
    'read_only': { name: 'Read Only', icon: '👁️', color: '#666', bgColor: '#F5F5F5' },
    'react_only': { name: 'React Only', icon: '👍', color: '#1976D2', bgColor: '#E3F2FD' },
    'anonymous': { name: 'Anonymous', icon: '🕵️', color: '#7B1FA2', bgColor: '#F3E5F5' }
});

const groupTopics = Object.freeze({
    'announcement': { name: 'Announcement', icon: '📢', color: '#1976d2', bgColor: '#e3f2fd' },
    'question': { name: 'Question', icon: '❓', color: '#7b1fa2', bgColor: '#f3e5f5' },
    'discussion': { name: 'Discussion', icon: '💬', color: '#2e7d32', bgColor: '#e8f5e8' }
});

const groupTypes = Object.freeze({
    'public': {
        name: 'Public',
        color: 'var(--success-color)',
        icon: 'fas fa-globe',
        description: 'Anyone can join'
    },
    'private': {
        name: 'Private',
        color: 'var(--warning-color)',
        icon: 'fas fa-lock',
        description: 'Invite only'
    },
    'secret': {
        name: 'Secret',
        color: 'var(--danger-color)',
        icon: 'fas fa-eye-slash',
        description: 'Hidden and invite only'
    },
    'family': {
        name: 'Family',
        color: '#9c27b0',
        icon: 'fas fa-home',
        description: 'Family members only'
    },
    'work': {
        name: 'Work',
        color: '#2196f3',
        icon: 'fas fa-briefcase',
        description: 'Work colleagues'
    }
});

const groupThemes = Object.freeze({
    'blue': {
        name: 'Blue',
        gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#667eea'
    },
    'green': {
        name: 'Green',
        gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
        color: '#11998e'
    },
    'red': {
        name: 'Red',
        gradient: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
        color: '#ff416c'
    },
    'purple': {
        name: 'Purple',
        gradient: 'linear-gradient(135deg, #8a2387 0%, #f27121 100%)',
        color: '#8a2387'
    },
    'dark': {
        name: 'Dark',
        gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
        color: '#0f2027'
    }
});

const groupRoles = Object.freeze({
    'admin': {
        name: 'Admin',
        color: 'var(--role-admin)',
        icon: 'fas fa-crown',
        permissions: ['manage_group', 'add_members', 'remove_members', 'post_messages', 'delete_messages', 'assign_roles', 'manage_events', 'manage_polls', 'manage_calls', 'moderate_chat']
    },
    'moderator': {
        name: 'Moderator',
        color: 'var(--role-moderator)',
        icon: 'fas fa-shield-alt',
        permissions: ['add_members', 'remove_members', 'post_messages', 'delete_messages', 'manage_events', 'moderate_chat']
    },
    'organizer': {
        name: 'Organizer',
        color: 'var(--role-organizer)',
        icon: 'fas fa-calendar-alt',
        permissions: ['manage_events', 'post_messages']
    },
    'helper': {
        name: 'Helper',
        color: 'var(--role-helper)',
        icon: 'fas fa-hands-helping',
        permissions: ['add_members', 'post_messages']
    },
    'member': {
        name: 'Member',
        color: 'var(--role-member)',
        icon: 'fas fa-user',
        permissions: ['post_messages']
    }
});

// =============================================
// CHAT & CALL VARIABLES (PRESERVED)
// =============================================
let chatMessagesList = [];
let isTyping = false;
let callInProgress = false;
let callStartTime = null;
let callTimer = null;
let localStream = null;
let peerConnections = {};

// =============================================
// UNIQUE FEATURES STATE (PRESERVED)
// =============================================
let currentParticipationMode = 'normal';
let isSilentMode = false;
let isAnonymousMode = false;
let groupNotes = {};
let groupEvents = {};
let transparencyLog = [];
let energySuggestions = [];

// =============================================
// LOCAL STORAGE KEYS (NON-AUTH ONLY)
// =============================================
const LOCAL_STORAGE_KEYS = Object.freeze({
    GROUPS: 'knecta_groups',
    MY_GROUPS: 'knecta_my_groups',
    JOINED_GROUPS: 'knecta_joined_groups',
    GROUP_INVITES: 'knecta_group_invites',
    ADMIN_GROUPS: 'knecta_admin_groups',
    LAST_SYNC: 'knecta_groups_last_sync',
    PENDING_ACTIONS: 'knecta_pending_group_actions',
    OFFLINE_OVERLAY_DISMISSED: 'knecta_offline_overlay_dismissed_groups',
    LAST_CACHE_TIME: 'knecta_groups_last_cache_time',
    FRIENDS: 'knecta_friends',
    GROUP_CHATS: 'knecta_group_chats',
    GROUP_MESSAGES: 'knecta_group_messages_',
    GROUP_TYPING: 'knecta_group_typing_',
    GROUP_CALLS: 'knecta_group_calls',
    GROUP_PURPOSES: 'knecta_group_purposes',
    GROUP_MOODS: 'knecta_group_moods',
    GROUP_POSTING_RULES: 'knecta_group_posting_rules',
    GROUP_NOTES: 'knecta_group_notes_',
    GROUP_EVENTS: 'knecta_group_events_',
    GROUP_TRANSPARENCY: 'knecta_group_transparency_',
    USER_PARTICIPATION_MODES: 'knecta_user_participation_modes',
    GROUP_UNREAD: 'knecta_group_unread_'
    
    // REMOVED: USER, USER_PROFILE, USER_TOKEN, API_BASE - these must come from parent session
});

// =============================================
// SECURE API WRAPPER - UPDATED TO USE apiRequest
// =============================================
const API_WRAPPER = {
    _ready: false,
    _readyPromise: null,
    _readyResolve: null,
    _pendingCalls: [],
    _stats: {
        total: 0,
        success: 0,
        failed: 0,
        retried: 0,
        cached: 0
    },
    _cache: new Map(),
    _cacheTTL: 5 * 60 * 1000,
    _maxRetries: 1,
    _retryDelay: 1000,
    _initialized: false,
    
    init() {
        if (this._initialized) return this;
        
        this._readyPromise = new Promise((resolve) => {
            this._readyResolve = resolve;
        });
        
        this._checkAPICore();
        this._initialized = true;
        
        return this;
    },
    
    _checkAPICore() {
        // Check synchronously without setInterval
        if (window.__API_CORE__ && window.__API_CORE__.isReady()) {
            this._ready = true;
            this._readyResolve(window.__API_CORE__);
            this._processPendingCalls();
        } else {
            // If not ready, mark as ready with null (no fallback)
            this._ready = true;
            this._readyResolve(null);
            
            if (this._pendingCalls.length > 0) {
                this._processPendingCallsDegraded();
            }
        }
    },
    
    async whenReady() {
        if (this._ready) return window.__API_CORE__;
        return this._readyPromise;
    },
    
    isReady() {
        return this._ready;
    },
    
    _processPendingCalls() {
        if (this._pendingCalls.length === 0) return;
        
        const pending = [...this._pendingCalls];
        this._pendingCalls = [];
        
        pending.forEach(call => {
            this.request(call.endpoint, call.options)
                .then(call.resolve)
                .catch(call.reject);
        });
    },
    
    _processPendingCallsDegraded() {
        if (this._pendingCalls.length === 0) return;
        
        const pending = [...this._pendingCalls];
        this._pendingCalls = [];
        
        pending.forEach(call => {
            const cacheKey = this._getCacheKey(call.endpoint, call.options);
            const cached = this._getCached(cacheKey);
            
            if (cached) {
                call.resolve({
                    success: true,
                    data: cached,
                    fromCache: true,
                    degraded: true
                });
            } else {
                call.resolve({
                    success: false,
                    status: 'degraded',
                    message: 'API core not available',
                    fromCache: false
                });
            }
        });
    },
    
    _getCacheKey(endpoint, options = {}) {
        const method = options.method || 'GET';
        return `${method}:${endpoint}`;
    },
    
    _setCached(key, data) {
        try {
            this._cache.set(key, {
                data,
                timestamp: Date.now()
            });
            
            if (this._cache.size > 100) {
                const oldestKey = this._cache.keys().next().value;
                this._cache.delete(oldestKey);
            }
        } catch (error) {}
    },
    
    _getCached(key) {
        const cached = this._cache.get(key);
        if (!cached) return null;
        
        const age = Date.now() - cached.timestamp;
        if (age > this._cacheTTL) {
            this._cache.delete(key);
            return null;
        }
        
        return cached.data;
    },
    
    async request(endpoint, options = {}) {
        this._stats.total++;
        
        // Check session readiness
        if (!sessionReady || !session.token) {
            if (options.method === 'GET') {
                const cacheKey = this._getCacheKey(endpoint, options);
                const cached = this._getCached(cacheKey);
                if (cached) {
                    this._stats.cached++;
                    return {
                        success: true,
                        data: cached,
                        fromCache: true,
                        stale: true
                    };
                }
            }
            
            return {
                success: false,
                status: 'no_session',
                message: 'Session not ready',
                fromCache: false
            };
        }
        
        if (endpoint && (endpoint.startsWith('http://') || endpoint.startsWith('https://'))) {
            return {
                success: false,
                status: 'error',
                message: 'Absolute URLs not allowed',
                fromCache: false
            };
        }
        
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const method = options.method || 'GET';
        const cacheKey = this._getCacheKey(cleanEndpoint, options);
        
        if (method === 'GET' && !options.skipCache) {
            const cached = this._getCached(cacheKey);
            if (cached) {
                this._stats.cached++;
                return {
                    success: true,
                    data: cached,
                    fromCache: true
                };
            }
        }
        
        try {
            const response = await apiRequest(cleanEndpoint, method, options.body);
            
            if (response && response.success) {
                this._stats.success++;
                
                if (method === 'GET' && response.data) {
                    this._setCached(cacheKey, response.data);
                }
                
                return response;
            }
            
            this._stats.failed++;
            return {
                success: false,
                status: 'error',
                message: response?.error || 'API request failed',
                fromCache: false
            };
        } catch (error) {
            this._stats.failed++;
            return {
                success: false,
                status: 'error',
                message: error.message || 'Network error',
                fromCache: false
            };
        }
    },
    
    getStats() {
        return { ...this._stats };
    },
    
    clearCache() {
        this._cache.clear();
        this._stats.cached = 0;
    }
};

API_WRAPPER.init();

// =============================================
// SECURE API CALL FUNCTION - UPDATED TO USE apiRequest
// =============================================
async function secureApiCall(endpoint, options = {}) {
    try {
        if (!options.skipReadyCheck) {
            await API_WRAPPER.whenReady();
        }
        
        // Check session readiness
        if (!sessionReady || !session.token) {
            return {
                success: false,
                status: 'no_session',
                message: 'Session not ready',
                fromCache: false
            };
        }
        
        const response = await API_WRAPPER.request(endpoint, {
            timeout: 10000,
            retry: 1,
            ...options
        });
        
        return response;
        
    } catch (error) {
        return {
            success: false,
            status: 'error',
            message: error.message || 'Network error',
            fromCache: false
        };
    }
}

async function safeApiCall(endpoint, options = {}) {
    return secureApiCall(endpoint, options);
}

// =============================================
// TOKEN MANAGEMENT - UPDATED TO USE SESSION ONLY
// =============================================
let tokenQueue = [];
let isProcessingTokenQueue = false;
let tokenReadyPromise = null;
let tokenReadyResolve = null;
let tokenReadyReject = null;

let authReady = false;
let authCheckComplete = false;
let apiInitialized = false;

let isPageInitialized = false;
let syncIntervalId = null;
let backgroundSyncRunning = false;

let __PARENT_READY__ = false;
let __SESSION_READY__ = false;
let __HANDSHAKE_COMPLETE__ = false;
let __SESSION_REQUEST_PENDING__ = false;

let handshakeInProgress = false;
let handshakeAttempts = 0;

function initializeTokenSystem() {
    try {
        tokenReadyPromise = new Promise((resolve, reject) => {
            tokenReadyResolve = resolve;
            tokenReadyReject = reject;
        });
        
        // DO NOT check localStorage for token - must come from parent
        // Just resolve with null and wait for parent session
        if (tokenReadyResolve) {
            tokenReadyResolve(null);
            authCheckComplete = true;
        }
    } catch (error) {}
}

async function waitForTokenReady() {
    try {
        // Check session memory first
        if (session.token) {
            authReady = true;
            authCheckComplete = true;
            return session.token;
        }
        
        if (tokenReadyPromise) {
            return await tokenReadyPromise;
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

function getUnifiedToken() {
    // Only return from session memory, never from localStorage
    return session.token || null;
}

function saveUnifiedToken(token) {
    // NO-OP - tokens must only come from parent
    // This function exists for backward compatibility but does nothing
    debugLog('saveUnifiedToken called but ignored - tokens must come from parent');
}

function getCurrentUserLocal() {
    // Return from session memory, not localStorage
    return session.user || currentUser || null;
}

function getCurrentUser() {
    return getCurrentUserLocal();
}

// =============================================
// QUEUE API CALL SYSTEM - UPDATED TO USE SESSION
// =============================================
function queueApiCall(apiCallFunction) {
    return new Promise(async (resolve, reject) => {
        try {
            const queuedCall = {
                fn: apiCallFunction,
                resolve,
                reject,
                timestamp: Date.now()
            };
            
            tokenQueue.push(queuedCall);
            
            if (tokenQueue.length > SECURITY_CONFIG.MAX_ARRAY_LENGTH) {
                tokenQueue.shift();
            }
            
            if (!isProcessingTokenQueue) {
                processTokenQueue();
            }
        } catch (error) {
            reject(error);
        }
    });
}

async function processTokenQueue() {
    if (isProcessingTokenQueue || tokenQueue.length === 0) return;
    
    isProcessingTokenQueue = true;
    
    try {
        const token = session.token; // Get from session, not waitForTokenReady
        
        if (!token) {
            const callsToProcess = [...tokenQueue];
            tokenQueue.length = 0;
            
            for (const call of callsToProcess) {
                try {
                    call.reject(new Error('No authentication token available'));
                } catch (error) {
                    call.reject(error);
                }
            }
            return;
        }
        
        const callsToProcess = [...tokenQueue];
        tokenQueue.length = 0;
        
        for (const call of callsToProcess) {
            try {
                const result = await call.fn(token);
                call.resolve(result);
            } catch (error) {
                call.reject(error);
            }
        }
    } catch (error) {
        tokenQueue.forEach(call => {
            call.reject(error);
        });
        tokenQueue.length = 0;
    } finally {
        isProcessingTokenQueue = false;
    }
}

// =============================================
// GROUP MEMBER MANAGEMENT FUNCTIONS (PRESERVED)
// =============================================
function getUserRoleInGroup(groupData, userId) {
    if (!groupData || !userId) return null;
    
    if (groupData.createdBy === userId) return 'creator';
    
    const member = groupData.members?.find(m => m.userId === userId);
    return member ? member.role : null;
}

function isUserAdmin(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId || 
           groupData.members?.some(m => m.userId === userId && m.role === 'admin');
}

function canUserManageGroup(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId || 
           groupData.members?.some(m => m.userId === userId && m.role === 'admin');
}

function canUserAddMembers(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId || 
           groupData.members?.some(m => m.userId === userId && (m.role === 'admin' || m.role === 'moderator'));
}

function canUserRemoveMembers(groupData, userId, targetUserId) {
    if (!groupData || !userId || !targetUserId) return false;
    
    if (groupData.createdBy === targetUserId) return false;
    
    if (groupData.createdBy === userId) return true;
    
    const userRole = getUserRoleInGroup(groupData, userId);
    const targetRole = getUserRoleInGroup(groupData, targetUserId);
    
    if (userRole === 'admin') {
        return targetRole !== 'admin' && targetRole !== 'creator';
    }
    
    if (userRole === 'moderator') {
        return targetRole === 'member';
    }
    
    return false;
}

function canUserChangeRole(groupData, userId, targetUserId) {
    if (!groupData || !userId || !targetUserId) return false;
    
    if (groupData.createdBy === targetUserId) return false;
    
    if (groupData.createdBy === userId) return true;
    
    return false;
}

function canUserDeleteGroup(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId;
}

function addMemberToGroup(groupId, userId, role = 'member') {
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId) ||
                  joinedGroups.find(g => g.id === groupId);
    
    if (!group) return { success: false, reason: 'group_not_found' };
    
    if (!canUserAddMembers(group, currentUser?.uid || currentUser?.id)) {
        return { success: false, reason: 'permission_denied' };
    }
    
    if (!group.members) {
        group.members = [];
    }
    
    if (group.members.some(m => m.userId === userId)) {
        return { success: false, reason: 'already_member' };
    }
    
    const newMember = {
        userId,
        role,
        joinedAt: Date.now()
    };
    
    group.members.push(newMember);
    group.memberCount = group.members.length;
    
    updateGroupInAllLists(group);
    
    GroupCore.saveGroups();
    
    // Use safeSend for parent communication
    safeSend('MEMBER_ADDED', {
        groupId: group.id,
        member: newMember,
        timestamp: Date.now()
    });
    
    return { success: true, member: newMember };
}

function removeMemberFromGroup(groupId, userId) {
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId) ||
                  joinedGroups.find(g => g.id === groupId);
    
    if (!group) return { success: false, reason: 'group_not_found' };
    
    if (!canUserRemoveMembers(group, currentUser?.uid || currentUser?.id, userId)) {
        return { success: false, reason: 'permission_denied' };
    }
    
    if (!group.members) {
        return { success: false, reason: 'no_members' };
    }
    
    const memberIndex = group.members.findIndex(m => m.userId === userId);
    if (memberIndex === -1) {
        return { success: false, reason: 'not_member' };
    }
    
    const removedMember = group.members[memberIndex];
    group.members.splice(memberIndex, 1);
    group.memberCount = group.members.length;
    
    updateGroupInAllLists(group);
    
    GroupCore.saveGroups();
    
    // Use safeSend for parent communication
    safeSend('MEMBER_REMOVED', {
        groupId: group.id,
        userId,
        removedMember,
        timestamp: Date.now()
    });
    
    return { success: true };
}

function changeMemberRole(groupId, userId, newRole) {
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId) ||
                  joinedGroups.find(g => g.id === groupId);
    
    if (!group) return { success: false, reason: 'group_not_found' };
    
    if (!canUserChangeRole(group, currentUser?.uid || currentUser?.id, userId)) {
        return { success: false, reason: 'permission_denied' };
    }
    
    if (!group.members) {
        return { success: false, reason: 'no_members' };
    }
    
    const member = group.members.find(m => m.userId === userId);
    if (!member) {
        return { success: false, reason: 'not_member' };
    }
    
    const oldRole = member.role;
    member.role = newRole;
    
    updateGroupInAllLists(group);
    
    GroupCore.saveGroups();
    
    // Use safeSend for parent communication
    safeSend('MEMBER_ROLE_CHANGED', {
        groupId: group.id,
        userId,
        oldRole,
        newRole,
        timestamp: Date.now()
    });
    
    return { success: true };
}

function deleteGroup(groupId) {
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId);
    
    if (!group) return { success: false, reason: 'group_not_found' };
    
    if (!canUserDeleteGroup(group, currentUser?.uid || currentUser?.id)) {
        return { success: false, reason: 'permission_denied' };
    }
    
    groups = groups.filter(g => g.id !== groupId);
    myGroups = myGroups.filter(g => g.id !== groupId);
    adminGroups = adminGroups.filter(g => g.id !== groupId);
    joinedGroups = joinedGroups.filter(g => g.id !== groupId);
    groupInvites = groupInvites.filter(invite => invite.groupId !== groupId && invite.id !== groupId);
    
    delete groupMessages[groupId];
    delete groupUnreadCounts[groupId];
    
    try {
        SafeStorage.removeItem(`group_messages_${groupId}`);
        SafeStorage.removeItem(`group_unread_${groupId}`);
    } catch (e) {}
    
    GroupCore.saveGroups();
    
    if (LifecycleState.isActive()) {
        if (currentChatGroup && currentChatGroup.id === groupId) {
            if (typeof closeGroupChatMobile === 'function') {
                closeGroupChatMobile();
            }
            currentChatGroup = null;
        }
    }
    
    // Use safeSend for parent communication
    safeSend('GROUP_DELETED', {
        groupId,
        timestamp: Date.now()
    });
    
    return { success: true };
}

function updateGroupInAllLists(updatedGroup) {
    const groupIndex = groups.findIndex(g => g.id === updatedGroup.id);
    if (groupIndex !== -1) {
        groups[groupIndex] = updatedGroup;
    }
    
    const myIndex = myGroups.findIndex(g => g.id === updatedGroup.id);
    if (myIndex !== -1) {
        myGroups[myIndex] = updatedGroup;
    }
    
    const adminIndex = adminGroups.findIndex(g => g.id === updatedGroup.id);
    if (adminIndex !== -1) {
        adminGroups[adminIndex] = updatedGroup;
    }
    
    const joinedIndex = joinedGroups.findIndex(g => g.id === updatedGroup.id);
    if (joinedIndex !== -1) {
        joinedGroups[joinedIndex] = updatedGroup;
    }
}

// =============================================
// ONLINE OPERATIONS (API) - UPDATED WITH SESSION CHECK
// =============================================
const addMemberOnline = async function(groupId, userId, role = 'member') {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'addMember', groupId, userId, role });
        return;
    }
    
    GroupCore.addMember(groupId, userId, role).catch(() => {});
};

const removeMemberOnline = async function(groupId, userId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'removeMember', groupId, userId });
        return;
    }
    
    GroupCore.removeMember(groupId, userId).catch(() => {});
};

const changeMemberRoleOnline = async function(groupId, userId, role) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'changeMemberRole', groupId, userId, role });
        return;
    }
    
    if (role === 'admin') {
        GroupCore.promoteToAdmin(groupId, userId).catch(() => {});
    } else {
        GroupCore.demoteFromAdmin(groupId, userId).catch(() => {});
    }
};

const deleteGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'deleteGroup', groupId });
        return;
    }
    
    GroupCore.deleteGroup(groupId).catch(() => {});
};

// =============================================
// CHAT AND GROUP MANAGEMENT FUNCTIONS (PRESERVED)
// =============================================
const openGroupChat = async function(groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => openGroupChat(groupData));
        return;
    }
    
    try {
        if (!groupData) return;
        
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        currentChatGroup = groupData;
        
        GroupCore.resetGroupUnreadCount(groupData.id);
        
        // Load fresh messages from backend
        await GroupCore.loadGroupMessages(groupData.id, 50);
        
        const chatTitle = safeGetElement('#chatTitle');
        const chatMemberCount = safeGetElement('#chatMemberCount');
        const chatActive = safeGetElement('#chatActive');
        const chatAvatar = safeGetElement('#chatAvatar');
        
        if (chatTitle) chatTitle.textContent = groupData.name || 'Group Chat';
        if (chatMemberCount) chatMemberCount.textContent = `${groupData.memberCount || 0} members`;
        if (chatActive) chatActive.textContent = 'Active now';
        
        const theme = groupData.theme || 'blue';
        const themeInfo = groupThemes[theme];
        const initials = groupData.name 
            ? groupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
            : 'G';
        
        if (chatAvatar) {
            if (groupData.photoURL) {
                chatAvatar.style.backgroundImage = `url('${groupData.photoURL}')`;
                chatAvatar.innerHTML = '';
            } else {
                chatAvatar.style.background = themeInfo.gradient;
                chatAvatar.innerHTML = `<span style="color: white; font-size: 16px;">${initials}</span>`;
            }
        }
        
        updateChatHeaderUniqueFeatures(groupData);
        
        const sidebar = safeGetElement('#sidebar');
        const groupChatPanel = safeGetElement('#groupChatPanel');
        
        if (isMobile) {
            if (sidebar) sidebar.style.display = 'none';
            if (groupChatPanel) {
                groupChatPanel.style.display = 'flex';
                groupChatPanel.classList.add('active');
            }
            
            const chatHeaderInfo = safeGetElement('#chatHeaderInfo');
            if (chatHeaderInfo && !chatHeaderInfo.querySelector('.mobile-back-btn')) {
                const backBtn = document.createElement('button');
                backBtn.className = 'mobile-back-btn';
                backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
                backBtn.style.cssText = 'background: none; border: none; color: var(--text-primary); cursor: pointer; font-size: 18px; margin-right: 10px;';
                backBtn.addEventListener('click', closeGroupChatMobile);
                chatHeaderInfo.insertBefore(backBtn, chatHeaderInfo.firstChild);
            }
        } else {
            hideAllPanels();
            if (groupChatPanel) groupChatPanel.classList.add('active');
        }
        
        const chatMessages = safeGetElement('#chatMessages');
        const chatMessagesContainer = safeGetElement('#chatMessagesContainer');
        
        if (chatMessages) chatMessages.innerHTML = '';
        if (chatMessagesContainer) chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        
        loadGroupChatMessages(groupData.id);
        setupTypingListener(groupData.id);
        
        loadUniqueFeaturesPanels(groupData.id);
        checkPostingRules(groupData);
        
    } catch (error) {}
};

function updateChatHeaderUniqueFeatures(groupData) {
    try {
        if (!groupData) return;
        
        const purpose = groupData.purpose || '';
        const chatPurposeTag = safeGetElement('#chatPurposeTag');
        if (purpose && groupPurposes[purpose] && chatPurposeTag) {
            const purposeInfo = groupPurposes[purpose];
            chatPurposeTag.textContent = `${purposeInfo.icon} ${purposeInfo.name}`;
            chatPurposeTag.style.backgroundColor = purposeInfo.color + '20';
            chatPurposeTag.style.color = purposeInfo.color;
            chatPurposeTag.style.display = 'inline-block';
        } else if (chatPurposeTag) {
            chatPurposeTag.style.display = 'none';
        }
        
        const pulse = calculateGroupPulse(groupData);
        const chatPulse = safeGetElement('#chatPulse');
        if (pulse && chatPulse) {
            chatPulse.textContent = pulse.text;
            chatPulse.className = `group-pulse ${pulse.class}`;
            chatPulse.style.display = 'inline-block';
        } else if (chatPulse) {
            chatPulse.style.display = 'none';
        }
        
        const mood = groupData.mood || '';
        const postingRule = groupData.postingRule || 'everyone';
        const chatMood = safeGetElement('#chatMood');
        const chatPostingRules = safeGetElement('#chatPostingRules');
        const chatMoodRules = safeGetElement('#chatMoodRules');
        
        if (mood && groupMoods[mood] && chatMood) {
            const moodInfo = groupMoods[mood];
            chatMood.innerHTML = `${moodInfo.icon} ${moodInfo.name}`;
            chatMood.className = `group-mood-indicator mood-${mood}`;
            chatMood.style.backgroundColor = moodInfo.bgColor;
            chatMood.style.color = moodInfo.color;
            chatMood.style.display = 'flex';
        } else if (chatMood) {
            chatMood.style.display = 'none';
        }
        
        if (postingRule && postingRules[postingRule] && chatPostingRules) {
            const ruleInfo = postingRules[postingRule];
            chatPostingRules.innerHTML = `<i class="fas fa-comment"></i> ${ruleInfo.name}`;
            chatPostingRules.className = `posting-rules-banner rule-${postingRule.replace('_', '-')}`;
            chatPostingRules.style.backgroundColor = ruleInfo.bgColor;
            chatPostingRules.style.color = ruleInfo.color;
            chatPostingRules.style.display = 'inline-flex';
        } else if (chatPostingRules) {
            chatPostingRules.style.display = 'none';
        }
        
        if (chatMoodRules) {
            if ((chatMood && chatMood.style.display !== 'none') || (chatPostingRules && chatPostingRules.style.display !== 'none')) {
                chatMoodRules.style.display = 'block';
            } else {
                chatMoodRules.style.display = 'none';
            }
        }
    } catch (error) {}
}

function checkPostingRules(groupData) {
    try {
        if (!groupData) return;
        
        const postingRule = groupData.postingRule || 'everyone';
        const quietHours = groupData.quietHours || {};
        const scheduledPosting = groupData.scheduledPosting || {};
        
        let canPost = true;
        let reason = '';
        
        if (postingRule === 'admin_only' && !groupData.isAdmin && !groupData.isCreator) {
            canPost = false;
            reason = 'Only admins can post in this group';
        }
        
        if (postingRule === 'quiet_hours' && quietHours.start && quietHours.end) {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentTime = currentHour * 60 + currentMinute;
            
            const [startHour, startMinute] = quietHours.start.split(':').map(Number);
            const [endHour, endMinute] = quietHours.end.split(':').map(Number);
            const startTime = startHour * 60 + startMinute;
            const endTime = endHour * 60 + endMinute;
            
            if (currentTime >= startTime && currentTime <= endTime) {
                canPost = false;
                reason = `Quiet hours: ${quietHours.start} - ${quietHours.end}`;
            }
        }
        
        if (postingRule === 'scheduled' && scheduledPosting.start && scheduledPosting.end) {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentTime = currentHour * 60 + currentMinute;
            
            const [startHour, startMinute] = scheduledPosting.start.split(':').map(Number);
            const [endHour, endMinute] = scheduledPosting.end.split(':').map(Number);
            const startTime = startHour * 60 + startMinute;
            const endTime = endHour * 60 + endMinute;
            
            if (currentTime < startTime || currentTime > endTime) {
                canPost = false;
                reason = `Posting allowed: ${scheduledPosting.start} - ${scheduledPosting.end}`;
            }
        }
        
        const chatInput = safeGetElement('#chatInput');
        const chatSendBtn = safeGetElement('#chatSendBtn');
        const topicSelection = safeGetElement('#topicSelection');
        const silentModeBtn = safeGetElement('#silentModeBtn');
        const anonymousModeBtn = safeGetElement('#anonymousModeBtn');
        
        if (chatInput && chatSendBtn) {
            if (!canPost) {
                chatInput.placeholder = reason;
                chatInput.disabled = true;
                chatSendBtn.disabled = true;
            } else {
                chatInput.placeholder = 'Type a message...';
                chatInput.disabled = false;
                chatSendBtn.disabled = false;
            }
        }
        
        const showTopics = groupData.features && groupData.features.topics === true;
        if (topicSelection) {
            topicSelection.style.display = showTopics ? 'block' : 'none';
        }
        
        const participationModes = groupData.participationModes || {};
        if (silentModeBtn) {
            silentModeBtn.style.display = participationModes.readOnly ? 'block' : 'none';
        }
        if (anonymousModeBtn) {
            anonymousModeBtn.style.display = participationModes.anonymous ? 'block' : 'none';
        }
        
        updateParticipationModeButtons();
    } catch (error) {}
}

function updateParticipationModeButtons() {
    try {
        const silentModeBtn = safeGetElement('#silentModeBtn');
        const chatInput = safeGetElement('#chatInput');
        const chatSendBtn = safeGetElement('#chatSendBtn');
        const anonymousModeBtn = safeGetElement('#anonymousModeBtn');
        
        if (silentModeBtn) {
            if (currentParticipationMode === 'read_only') {
                silentModeBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
                silentModeBtn.title = 'Exit Silent Mode';
                if (chatInput) chatInput.placeholder = 'Silent mode: Read only';
                if (chatInput) chatInput.disabled = true;
                if (chatSendBtn) chatSendBtn.disabled = true;
            } else {
                silentModeBtn.innerHTML = '<i class="fas fa-eye"></i>';
                silentModeBtn.title = 'Enter Silent Mode';
            }
        }
        
        if (anonymousModeBtn) {
            if (isAnonymousMode) {
                anonymousModeBtn.innerHTML = '<i class="fas fa-user-secret"></i>';
                anonymousModeBtn.title = 'Exit Anonymous Mode';
                if (chatInput) chatInput.placeholder = 'Anonymous mode enabled';
            } else {
                anonymousModeBtn.innerHTML = '<i class="fas fa-user"></i>';
                anonymousModeBtn.title = 'Enter Anonymous Mode';
            }
        }
    } catch (error) {}
}

function loadUniqueFeaturesPanels(groupId) {
    try {
        loadGroupNotes(groupId);
        loadGroupEvents(groupId);
        loadTransparencyLog(groupId);
        analyzeGroupEnergy(groupId);
    } catch (error) {}
}

async function loadGroupNotes(groupId) {
    try {
        const cacheKey = `group_notes_${groupId}`;
        const cachedNotes = SafeStorage.getItem(cacheKey);
        
        const groupNotesContent = safeGetElement('#groupNotesContent');
        if (groupNotesContent) {
            if (cachedNotes) {
                groupNotesContent.innerHTML = cachedNotes;
            } else {
                groupNotesContent.innerHTML = '<p style="margin: 0; color: var(--text-secondary);">No notes yet. Add important information here.</p>';
            }
        }
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/notes`, { silent: true });
            if (response && response.success && response.data && groupNotesContent) {
                const notes = response.data.notes || '';
                groupNotesContent.innerHTML = notes || '<p style="margin: 0; color: var(--text-secondary);">No notes yet. Add important information here.</p>';
                SafeStorage.setItem(cacheKey, notes);
            }
        } catch (error) {}
        
        const groupNotesPanel = safeGetElement('#groupNotesPanel');
        if (groupNotesPanel && currentChatGroup && (currentChatGroup.isAdmin || currentChatGroup.isCreator || cachedNotes)) {
            groupNotesPanel.style.display = 'block';
        }
    } catch (error) {
        const groupNotesPanel = safeGetElement('#groupNotesPanel');
        if (groupNotesPanel) groupNotesPanel.style.display = 'none';
    }
}

async function loadGroupEvents(groupId) {
    try {
        const cacheKey = `group_events_${groupId}`;
        const cachedEvents = SafeStorage.getItem(cacheKey);
        
        let events = [];
        if (cachedEvents) {
            try {
                events = cachedEvents;
            } catch (e) {}
        }
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/events`, { silent: true });
            if (response && response.success && response.data) {
                events = response.data;
                SafeStorage.setItem(cacheKey, events);
            }
        } catch (error) {}
        
        const now = new Date();
        const upcomingEvents = events
            .filter(event => new Date(event.date) > now)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const eventCountdownDisplay = safeGetElement('#eventCountdownDisplay');
        const eventCountdownPanel = safeGetElement('#eventCountdownPanel');
        
        if (eventCountdownDisplay && eventCountdownPanel) {
            if (upcomingEvents.length > 0) {
                const nextEvent = upcomingEvents[0];
                const eventDate = new Date(nextEvent.date);
                const timeDiff = eventDate.getTime() - now.getTime();
                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                
                if (daysDiff <= 7) {
                    eventCountdownDisplay.innerHTML = `
                        <div style="font-size: 14px; font-weight: 600;">${nextEvent.title}</div>
                        <div style="font-size: 12px; opacity: 0.9;">${formatDate(eventDate)} • ${daysDiff} day${daysDiff !== 1 ? 's' : ''} to go</div>
                    `;
                    eventCountdownPanel.style.display = 'block';
                } else {
                    eventCountdownPanel.style.display = 'none';
                }
            } else {
                eventCountdownDisplay.innerHTML = 'No upcoming events';
                eventCountdownPanel.style.display = currentChatGroup && (currentChatGroup.isAdmin || currentChatGroup.isCreator) ? 'block' : 'none';
            }
        }
    } catch (error) {
        const eventCountdownPanel = safeGetElement('#eventCountdownPanel');
        if (eventCountdownPanel) eventCountdownPanel.style.display = 'none';
    }
}

async function loadTransparencyLog(groupId) {
    try {
        const cacheKey = `group_transparency_${groupId}`;
        const cachedLog = SafeStorage.getItem(cacheKey);
        
        let log = [];
        if (cachedLog) {
            try {
                log = cachedLog;
            } catch (e) {}
        } else {
            log = generateInitialTransparencyLog(groupId);
            SafeStorage.setItem(cacheKey, log);
        }
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/transparency`, { silent: true });
            if (response && response.success && response.data) {
                log = response.data;
                SafeStorage.setItem(cacheKey, log);
            }
        } catch (error) {}
        
        const adminTransparencyLog = safeGetElement('#adminTransparencyLog');
        const adminTransparencyPanel = safeGetElement('#adminTransparencyPanel');
        
        if (adminTransparencyLog && adminTransparencyPanel) {
            if (log.length > 0 && currentChatGroup && currentChatGroup.isAdmin) {
                let logHTML = '';
                log.slice(0, 5).forEach(item => {
                    logHTML += `
                        <div class="transparency-log-item" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
                            <div><strong>${item.action}</strong></div>
                            <div style="font-size: 12px; color: var(--text-secondary);">
                                By ${item.by || 'Unknown'} • ${formatTimeAgo(item.timestamp)}
                            </div>
                        </div>
                    `;
                });
                
                adminTransparencyLog.innerHTML = logHTML || 'No recent changes';
                adminTransparencyPanel.style.display = 'block';
            } else {
                adminTransparencyPanel.style.display = 'none';
            }
        }
    } catch (error) {
        const adminTransparencyPanel = safeGetElement('#adminTransparencyPanel');
        if (adminTransparencyPanel) adminTransparencyPanel.style.display = 'none';
    }
}

function generateInitialTransparencyLog(groupId) {
    try {
        const now = new Date();
        return [
            {
                id: `log_${groupId}_1`,
                groupId: groupId,
                action: 'Group created',
                by: session.user?.uid || session.user?.id || 'system',
                byName: session.user?.displayName || 'System',
                timestamp: new Date(now.getTime() - 86400000 * 2).toISOString(),
                details: 'Group was created with initial settings'
            },
            {
                id: `log_${groupId}_2`,
                groupId: groupId,
                action: 'Welcome message set',
                by: session.user?.uid || session.user?.id || 'system',
                byName: session.user?.displayName || 'System',
                timestamp: new Date(now.getTime() - 86400000 * 1).toISOString(),
                details: 'Welcome message was configured'
            },
            {
                id: `log_${groupId}_3`,
                groupId: groupId,
                action: 'First members joined',
                by: 'system',
                byName: 'System',
                timestamp: new Date(now.getTime() - 43200000).toISOString(),
                details: 'Initial members joined the group'
            }
        ];
    } catch (error) {
        return [];
    }
}

async function analyzeGroupEnergy(groupId) {
    try {
        let messages = [];
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/messages`, { params: { limit: 50 }, silent: true });
            if (response && response.success && response.data) {
                messages = response.data;
            }
        } catch (error) {
            messages = [];
        }
        
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const recentMessages = messages.filter(m => new Date(m.timestamp) > oneHourAgo);
        const dailyMessages = messages.filter(m => new Date(m.timestamp) > oneDayAgo);
        
        const messagesPerHour = recentMessages.length;
        const messagesPerDay = dailyMessages.length;
        
        let suggestion = '';
        let icon = 'fas fa-lightbulb';
        
        if (messagesPerHour > 50) {
            suggestion = 'Group is very active! Consider switching to silent mode to reduce notifications.';
            icon = 'fas fa-fire';
        } else if (messagesPerHour > 20) {
            suggestion = 'Group is active. All good!';
            icon = 'fas fa-bolt';
        } else if (messagesPerHour > 5) {
            suggestion = 'Group is moderately active.';
            icon = 'fas fa-chart-line';
        } else if (messagesPerDay < 5) {
            suggestion = 'Group is quiet. Consider sending a check-in message.';
            icon = 'fas fa-volume-mute';
        } else {
            suggestion = 'Group activity is normal.';
            icon = 'fas fa-check-circle';
        }
        
        const energySuggestionContent = safeGetElement('#energySuggestionContent');
        const energySuggestionPanel = safeGetElement('#energySuggestionPanel');
        
        if (energySuggestionContent && energySuggestionPanel) {
            energySuggestionContent.innerHTML = `<i class="${icon}"></i> ${suggestion} <small>(${messagesPerHour}/hr, ${messagesPerDay}/day)</small>`;
            energySuggestionPanel.style.display = 'block';
        }
        
        energySuggestions.push({
            groupId,
            timestamp: now,
            messagesPerHour,
            messagesPerDay,
            suggestion
        });
    } catch (error) {
        const energySuggestionPanel = safeGetElement('#energySuggestionPanel');
        if (energySuggestionPanel) energySuggestionPanel.style.display = 'none';
    }
}

function closeGroupChatMobile() {
    try {
        const sidebar = safeGetElement('#sidebar');
        const groupChatPanel = safeGetElement('#groupChatPanel');
        
        if (isMobile) {
            if (sidebar) sidebar.style.display = 'flex';
            if (groupChatPanel) {
                groupChatPanel.style.display = 'none';
                groupChatPanel.classList.remove('active');
            }
            
            const mobileBackBtn = document.querySelector('.mobile-back-btn');
            if (mobileBackBtn) {
                mobileBackBtn.remove();
            }
        }
    } catch (error) {}
}

function hideAllPanels() {
    try {
        const groupDetailsPanel = safeGetElement('#groupDetailsPanel');
        const groupChatPanel = safeGetElement('#groupChatPanel');
        const groupCallPanel = safeGetElement('#groupCallPanel');
        const sidebar = safeGetElement('#sidebar');
        
        if (groupDetailsPanel) groupDetailsPanel.classList.remove('active');
        if (groupChatPanel) groupChatPanel.classList.remove('active');
        if (groupCallPanel) groupCallPanel.classList.remove('active');
        
        if (isMobile) {
            if (sidebar) sidebar.style.display = 'flex';
            if (groupChatPanel) groupChatPanel.style.display = 'none';
            if (groupCallPanel) groupCallPanel.style.display = 'none';
        }
    } catch (error) {}
}

async function loadGroupChatMessages(groupId) {
    try {
        const chatMessages = safeGetElement('#chatMessages');
        if (!chatMessages) return;
        
        const cachedMessagesKey = `group_messages_${groupId}`;
        const cachedMessages = SafeStorage.getItem(cachedMessagesKey);
        
        if (cachedMessages) {
            try {
                const messages = cachedMessages;
                messages.forEach(message => {
                    addMessageToChat(message, false);
                });
            } catch (error) {}
        }
        
        if (chatMessages.children.length === 0) {
            addSystemMessage(`Welcome to the group chat! Start the conversation.`);
        }
        
        const chatMessagesContainer = safeGetElement('#chatMessagesContainer');
        if (chatMessagesContainer) {
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
        
        try {
            const response = await GroupCore.loadGroupMessages(groupId, 50);
            if (response && response.success && response.data) {
                response.data.forEach(message => {
                    addMessageToChat(message, true);
                    GroupCore.saveGroupMessages(groupId, [message]);
                });
            }
        } catch (error) {}
    } catch (error) {}
}

function addMessageToChat(messageData, isNew = true) {
    try {
        const chatMessages = safeGetElement('#chatMessages');
        if (!chatMessages) return;
        
        const safeMessageData = JSON.parse(JSON.stringify(messageData));
        
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        
        const isSystem = safeMessageData.type === 'system';
        const isSent = safeMessageData.senderId === (session.user?.uid || session.user?.id);
        const isAnonymous = safeMessageData.anonymous === true;
        const topic = safeMessageData.topic || '';
        const topicInfo = topic ? groupTopics[topic] : null;
        
        if (isSystem) {
            messageElement.className = 'message system';
            messageElement.innerHTML = `
                <div class="message-content">${safeMessageData.content}</div>
                <div class="message-time">${formatMessageTime(safeMessageData.timestamp || new Date())}</div>
            `;
        } else {
            messageElement.className = isSent ? 'message sent' : 'message received';
            const senderName = isAnonymous ? 'Anonymous' : (isSent ? 'You' : (safeMessageData.senderName || 'Unknown'));
            
            messageElement.innerHTML = `
                ${!isSent ? `<div class="message-sender">${senderName} ${isAnonymous ? '<i class="fas fa-user-secret" style="margin-left: 5px; color: var(--text-secondary); font-size: 10px;"></i>' : ''}</div>` : ''}
                ${topicInfo ? `<div class="topic-label topic-${topic}" style="margin-bottom: 3px;">${topicInfo.icon} ${topicInfo.name}</div>` : ''}
                <div class="message-content">${safeMessageData.content}</div>
                <div class="message-time">${formatMessageTime(safeMessageData.timestamp || new Date())}</div>
                <div class="message-actions">
                    <button class="message-action-btn" title="React" onclick="window.reactToMessage('${safeMessageData.id}', this)">
                        <i class="far fa-smile"></i>
                    </button>
                    <button class="message-action-btn" title="Reply" onclick="window.replyToMessage('${safeMessageData.id}', '${senderName}')">
                        <i class="fas fa-reply"></i>
                    </button>
                    ${isSent ? `<button class="message-action-btn" title="Delete" onclick="window.deleteMessage('${safeMessageData.id}')">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </div>
            `;
        }
        
        chatMessages.appendChild(messageElement);
        
        const chatMessagesContainer = safeGetElement('#chatMessagesContainer');
        if (isNew && chatMessagesContainer) {
            chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        }
    } catch (error) {}
}

function addSystemMessage(content) {
    try {
        const chatMessages = safeGetElement('#chatMessages');
        if (!chatMessages) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = 'message system';
        messageElement.innerHTML = `
            <div class="message-content">${content}</div>
            <div class="message-time">${formatMessageTime(new Date())}</div>
        `;
        chatMessages.appendChild(messageElement);
    } catch (error) {}
}

function saveMessageToCache(groupId, message) {
    try {
        GroupCore.saveGroupMessages(groupId, [message]);
    } catch (error) {}
}

const sendGroupMessageOnline = async function(groupId, messageData) {
    try {
        const response = await GroupCore.sendGroupMessage(groupId, messageData.content, messageData.topic, messageData.anonymous);
        return response;
    } catch (error) {
        console.error('Failed to send message online:', error);
        throw error;
    }
};

const sendGroupMessage = async function() {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'sendMessage', fn: sendGroupMessage });
        return;
    }
    
    try {
        const chatInput = safeGetElement('#chatInput');
        const messageTopic = safeGetElement('#messageTopic');
        
        if (!currentChatGroup || !chatInput || !chatInput.value.trim()) return;
        
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        const messageContent = chatInput.value.trim();
        const selectedTopic = messageTopic ? messageTopic.value : '';
        
        chatInput.value = '';
        adjustTextareaHeight();
        
        const message = {
            groupId: currentChatGroup.id,
            senderId: session.user?.uid || session.user?.id,
            senderName: session.user?.displayName || 'User',
            content: messageContent,
            timestamp: new Date(),
            type: 'text',
            readBy: [session.user?.uid || session.user?.id],
            topic: selectedTopic || undefined,
            anonymous: isAnonymousMode
        };
        
        const tempMessage = {
            ...message,
            id: 'temp_' + Date.now()
        };
        
        addMessageToChat(tempMessage, true);
        
        try {
            const response = await GroupCore.sendGroupMessage(currentChatGroup.id, messageContent, selectedTopic, isAnonymousMode);
            
            if (response && response.success) {
                const finalMessage = {
                    ...tempMessage,
                    id: response.data?.id || tempMessage.id
                };
                GroupCore.saveGroupMessages(currentChatGroup.id, [finalMessage]);
                
                GroupCore.addGroupMessage(currentChatGroup.id, finalMessage);
                
                if (isAnonymousMode) {
                    toggleAnonymousMode();
                }
            } else {
                throw new Error(response?.error || 'Failed to send message');
            }
        } catch (error) {
            queueGroupAction({
                type: 'sendMessage',
                groupId: currentChatGroup.id,
                content: messageContent,
                topic: selectedTopic,
                anonymous: isAnonymousMode
            });
        }
        
        stopTypingIndicator();
    } catch (error) {}
};

function toggleSilentMode() {
    try {
        if (currentParticipationMode === 'read_only') {
            currentParticipationMode = 'normal';
            const chatInput = safeGetElement('#chatInput');
            const chatSendBtn = safeGetElement('#chatSendBtn');
            if (chatInput) chatInput.disabled = false;
            if (chatSendBtn) chatSendBtn.disabled = false;
            if (chatInput) chatInput.placeholder = 'Type a message...';
        } else {
            currentParticipationMode = 'read_only';
            const chatInput = safeGetElement('#chatInput');
            const chatSendBtn = safeGetElement('#chatSendBtn');
            if (chatInput) chatInput.disabled = true;
            if (chatSendBtn) chatSendBtn.disabled = true;
            if (chatInput) chatInput.placeholder = 'Silent mode: Read only';
        }
        
        SafeStorage.setItem('participationMode', currentParticipationMode);
        updateParticipationModeButtons();
    } catch (error) {}
}

function toggleAnonymousMode() {
    try {
        isAnonymousMode = !isAnonymousMode;
        updateParticipationModeButtons();
    } catch (error) {}
}

function reactToMessage(messageId, button) {
    try {
        const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        const reaction = reactions[Math.floor(Math.random() * reactions.length)];
        
        button.innerHTML = `<i class="fas fa-${reaction === '👍' ? 'thumbs-up' : reaction === '❤️' ? 'heart' : 'smile'}"></i>`;
        button.style.color = '#FF9800';
    } catch (error) {}
}

function replyToMessage(messageId, senderName) {
    try {
        const chatInput = safeGetElement('#chatInput');
        if (chatInput) {
            chatInput.value = `@${senderName} `;
            chatInput.focus();
        }
    } catch (error) {}
}

function deleteMessage(messageId) {
    try {
        if (confirm('Are you sure you want to delete this message?')) {
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageElement) {
                messageElement.remove();
            }
        }
    } catch (error) {}
}

let typingTimeout;
function setupTypingListener(groupId) {
    try {
        const chatInput = safeGetElement('#chatInput');
        if (!chatInput) return;
        
        const newChatInput = chatInput.cloneNode(true);
        chatInput.parentNode.replaceChild(newChatInput, chatInput);
        
        newChatInput.addEventListener('input', () => {
            try {
                if (!isTyping) {
                    isTyping = true;
                    GroupCore.handleTyping(groupId, session.user?.uid || session.user?.id, true);
                    secureApiCall(`/groups/${groupId}/typing`, { 
                        method: 'POST',
                        body: { typing: true },
                        silent: true
                    }).catch(() => {});
                }
                
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    try {
                        isTyping = false;
                        GroupCore.handleTyping(groupId, session.user?.uid || session.user?.id, false);
                        secureApiCall(`/groups/${groupId}/typing`, { 
                            method: 'POST',
                            body: { typing: false },
                            silent: true
                        }).catch(() => {});
                    } catch (error) {}
                }, 1000);
            } catch (error) {}
        });
    } catch (error) {}
}

function stopTypingIndicator() {
    try {
        isTyping = false;
        if (typingTimeout) clearTimeout(typingTimeout);
    } catch (error) {}
}

function adjustTextareaHeight() {
    try {
        const chatInput = safeGetElement('#chatInput');
        if (!chatInput) return;
        
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
    } catch (error) {}
}

function formatMessageTime(date) {
    try {
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        return '--:--';
    }
}

const openAdminManagement = async function(groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => openAdminManagement(groupData));
        return;
    }
    
    try {
        if (!groupData) return;
        
        if (!groupData.isAdmin && !groupData.isCreator) {
            return;
        }
        
        const adminManagementGroupName = safeGetElement('#adminManagementGroupName');
        if (adminManagementGroupName) {
            adminManagementGroupName.textContent = groupData.name;
        }
        
        const adminManagementModal = safeGetElement('#adminManagementModal');
        if (adminManagementModal) {
            adminManagementModal.classList.add('active');
        }
        
        loadGroupMembersForManagement(groupData);
        loadGroupSettingsForManagement(groupData);
        loadUniqueFeaturesForManagement(groupData);
        
    } catch (error) {}
};

async function loadGroupMembersForManagement(groupData) {
    try {
        const memberList = safeGetElement('#memberManagementList');
        if (!memberList) return;
        
        memberList.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading members...</p></div>';
        
        try {
            const response = await secureApiCall(`/groups/${groupData.id}/members`, { silent: true });
            
            if (response && response.success && response.data) {
                renderMembersList(response.data);
            } else {
                memberList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Error loading members</p>
                        <p class="subtext">Please try again later</p>
                    </div>
                `;
            }
        } catch (error) {
            memberList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading members</p>
                    <p class="subtext">Please try again later</p>
                </div>
            `;
        }
    } catch (error) {}
}

function renderMembersList(memberDetails) {
    try {
        const memberList = safeGetElement('#memberManagementList');
        if (!memberList) return;
        
        memberList.innerHTML = '';
        
        memberDetails.forEach(member => {
            const memberItem = document.createElement('div');
            memberItem.className = 'member-management-item';
            
            const initials = member.displayName 
                ? member.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
                : 'U';
            
            memberItem.innerHTML = `
                <div class="member-management-info">
                    <div class="friend-avatar" ${member.photoURL ? `style="background-image: url('${member.photoURL}')"` : ''}>
                        ${member.photoURL ? '' : `<span>${initials}</span>`}
                    </div>
                    <div>
                        <div style="font-weight: 500;">${member.displayName}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${member.username || ''}</div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                            ${member.isCreator ? '<span class="role-badge admin"><i class="fas fa-star"></i> Creator</span>' : ''}
                            ${member.isAdmin && !member.isCreator ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : ''}
                            ${!member.isAdmin && !member.isCreator ? '<span class="role-badge member"><i class="fas fa-user"></i> Member</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="member-management-actions">
                    ${!member.isCreator ? `
                        ${member.isAdmin ? `
                            <button class="member-action-btn demote" data-member-id="${member.id}" title="Demote to Member">
                                <i class="fas fa-arrow-down"></i> Demote
                            </button>
                        ` : `
                            <button class="member-action-btn promote" data-member-id="${member.id}" title="Promote to Admin">
                                <i class="fas fa-arrow-up"></i> Promote
                            </button>
                        `}
                        ${member.id !== (session.user?.uid || session.user?.id) ? `
                            <button class="member-action-btn remove" data-member-id="${member.id}" title="Remove from Group">
                                <i class="fas fa-user-times"></i> Remove
                            </button>
                        ` : ''}
                    ` : ''}
                </div>
            `;
            
            memberList.appendChild(memberItem);
        });
        
        memberList.querySelectorAll('.member-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                try {
                    const memberId = btn.dataset.memberId;
                    const action = btn.classList.contains('promote') ? 'promote' : 
                                  btn.classList.contains('demote') ? 'demote' : 'remove';
                    
                    handleMemberAction(action, memberId, selectedGroup);
                } catch (error) {}
            });
        });
    } catch (error) {}
}

async function handleMemberAction(action, memberId, groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => handleMemberAction(action, memberId, groupData));
        return;
    }
    
    try {
        if (!groupData) return;
        
        let success = false;
        
        switch(action) {
            case 'promote':
                success = (await GroupCore.promoteToAdmin(groupData.id, memberId)).success;
                await secureApiCall(`/groups/${groupData.id}/members/${memberId}/promote`, { method: 'POST' }).catch(() => {});
                logTransparencyAction(groupData.id, 'Promoted member to admin', memberId);
                break;
            case 'demote':
                success = (await GroupCore.demoteFromAdmin(groupData.id, memberId)).success;
                await secureApiCall(`/groups/${groupData.id}/members/${memberId}/demote`, { method: 'POST' }).catch(() => {});
                logTransparencyAction(groupData.id, 'Demoted admin to member', memberId);
                break;
            case 'remove':
                if (confirm('Are you sure you want to remove this member from the group?')) {
                    success = (await GroupCore.removeMember(groupData.id, memberId)).success;
                    await secureApiCall(`/groups/${groupData.id}/members/${memberId}`, { method: 'DELETE' }).catch(() => {});
                    logTransparencyAction(groupData.id, 'Removed member from group', memberId);
                }
                break;
        }
        
        if (success) {
            loadGroupMembersForManagement(groupData);
        }
    } catch (error) {}
}

async function logTransparencyAction(groupId, action, targetId = null) {
    try {
        const logEntry = {
            groupId,
            action,
            targetId,
            by: session.user?.uid || session.user?.id,
            byName: session.user?.displayName || 'Unknown',
            timestamp: new Date()
        };
        
        const cacheKey = `group_transparency_${groupId}`;
        const cachedLog = SafeStorage.getItem(cacheKey) || [];
        cachedLog.unshift(logEntry);
        if (cachedLog.length > 50) cachedLog.pop();
        SafeStorage.setItem(cacheKey, cachedLog);
        
        await secureApiCall(`/groups/${groupId}/transparency`, {
            method: 'POST',
            body: logEntry,
            silent: true
        });
    } catch (error) {}
}

function loadGroupSettingsForManagement(groupData) {
    try {
        if (!groupData) return;
        
        const adminPublicGroup = safeGetElement('#adminPublicGroup');
        const adminApproveMembers = safeGetElement('#adminApproveMembers');
        const adminAllowInvites = safeGetElement('#adminAllowInvites');
        const adminOnlyAdminsPost = safeGetElement('#adminOnlyAdminsPost');
        const adminAllowMedia = safeGetElement('#adminAllowMedia');
        const adminDisappearingMessages = safeGetElement('#adminDisappearingMessages');
        const adminMentionNotifications = safeGetElement('#adminMentionNotifications');
        const adminAnnouncementNotifications = safeGetElement('#adminAnnouncementNotifications');
        
        if (adminPublicGroup) adminPublicGroup.checked = groupData.type === 'public';
        if (adminApproveMembers) adminApproveMembers.checked = groupData.moderationSettings?.approveNewMembers || false;
        if (adminAllowInvites) adminAllowInvites.checked = groupData.moderationSettings?.allowInvites || true;
        if (adminOnlyAdminsPost) adminOnlyAdminsPost.checked = groupData.moderationSettings?.onlyAdminsCanPost || false;
        if (adminAllowMedia) adminAllowMedia.checked = groupData.moderationSettings?.allowMediaSharing || true;
        if (adminDisappearingMessages) adminDisappearingMessages.checked = groupData.moderationSettings?.disappearingMessages || false;
        if (adminMentionNotifications) adminMentionNotifications.checked = groupData.notificationSettings?.mentionNotifications || true;
        if (adminAnnouncementNotifications) adminAnnouncementNotifications.checked = groupData.notificationSettings?.announcementNotifications || true;
    } catch (error) {}
}

function loadUniqueFeaturesForManagement(groupData) {
    try {
        if (!groupData) return;
        
        const adminGroupPurpose = safeGetElement('#adminGroupPurpose');
        if (adminGroupPurpose) adminGroupPurpose.value = groupData.purpose || '';
        
        document.querySelectorAll('.mood-select-btn').forEach(btn => {
            try {
                btn.classList.remove('active');
                if (btn.dataset.mood === groupData.mood) {
                    btn.classList.add('active');
                    btn.style.borderWidth = '2px';
                }
            } catch (error) {}
        });
        
        const adminPostingMode = safeGetElement('#adminPostingMode');
        if (adminPostingMode) adminPostingMode.value = groupData.postingRule || 'everyone';
        updatePostingRulesUI();
        
        if (groupData.quietHours) {
            const adminQuietStart = safeGetElement('#adminQuietStart');
            const adminQuietEnd = safeGetElement('#adminQuietEnd');
            if (adminQuietStart) adminQuietStart.value = groupData.quietHours.start || '22:00';
            if (adminQuietEnd) adminQuietEnd.value = groupData.quietHours.end || '08:00';
        }
        
        if (groupData.scheduledPosting) {
            const adminPostingStart = safeGetElement('#adminPostingStart');
            const adminPostingEnd = safeGetElement('#adminPostingEnd');
            if (adminPostingStart) adminPostingStart.value = groupData.scheduledPosting.start || '09:00';
            if (adminPostingEnd) adminPostingEnd.value = groupData.scheduledPosting.end || '18:00';
        }
        
        const participationModes = groupData.participationModes || {};
        const adminEnableReadOnly = safeGetElement('#adminEnableReadOnly');
        const adminEnableReactOnly = safeGetElement('#adminEnableReactOnly');
        const adminEnableAnonymous = safeGetElement('#adminEnableAnonymous');
        
        if (adminEnableReadOnly) adminEnableReadOnly.checked = participationModes.readOnly || false;
        if (adminEnableReactOnly) adminEnableReactOnly.checked = participationModes.reactOnly || false;
        if (adminEnableAnonymous) adminEnableAnonymous.checked = participationModes.anonymous || false;
    } catch (error) {}
}

function updatePostingRulesUI() {
    try {
        const adminPostingMode = safeGetElement('#adminPostingMode');
        const adminQuietHoursSection = safeGetElement('#adminQuietHoursSection');
        const adminScheduledPostingSection = safeGetElement('#adminScheduledPostingSection');
        
        if (!adminPostingMode) return;
        
        const mode = adminPostingMode.value;
        if (adminQuietHoursSection) {
            adminQuietHoursSection.style.display = mode === 'quiet_hours' ? 'block' : 'none';
        }
        if (adminScheduledPostingSection) {
            adminScheduledPostingSection.style.display = mode === 'scheduled' ? 'block' : 'none';
        }
    } catch (error) {}
}

const saveGroupSettings = async function(groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => saveGroupSettings(groupData));
        return;
    }
    
    try {
        if (!groupData) return;
        
        const adminPublicGroup = safeGetElement('#adminPublicGroup');
        const adminApproveMembers = safeGetElement('#adminApproveMembers');
        const adminAllowInvites = safeGetElement('#adminAllowInvites');
        const adminOnlyAdminsPost = safeGetElement('#adminOnlyAdminsPost');
        const adminAllowMedia = safeGetElement('#adminAllowMedia');
        const adminDisappearingMessages = safeGetElement('#adminDisappearingMessages');
        const adminMentionNotifications = safeGetElement('#adminMentionNotifications');
        const adminAnnouncementNotifications = safeGetElement('#adminAnnouncementNotifications');
        const adminGroupPurpose = safeGetElement('#adminGroupPurpose');
        const adminPostingMode = safeGetElement('#adminPostingMode');
        const adminQuietStart = safeGetElement('#adminQuietStart');
        const adminQuietEnd = safeGetElement('#adminQuietEnd');
        const adminPostingStart = safeGetElement('#adminPostingStart');
        const adminPostingEnd = safeGetElement('#adminPostingEnd');
        const adminEnableReadOnly = safeGetElement('#adminEnableReadOnly');
        const adminEnableReactOnly = safeGetElement('#adminEnableReactOnly');
        const adminEnableAnonymous = safeGetElement('#adminEnableAnonymous');
        
        const settings = {
            privacy: adminPublicGroup && adminPublicGroup.checked ? 'public' : 'private',
            moderationSettings: {
                approveNewMembers: adminApproveMembers ? adminApproveMembers.checked : false,
                allowInvites: adminAllowInvites ? adminAllowInvites.checked : true,
                onlyAdminsCanPost: adminOnlyAdminsPost ? adminOnlyAdminsPost.checked : false,
                allowMediaSharing: adminAllowMedia ? adminAllowMedia.checked : true,
                disappearingMessages: adminDisappearingMessages ? adminDisappearingMessages.checked : false
            },
            notificationSettings: {
                mentionNotifications: adminMentionNotifications ? adminMentionNotifications.checked : true,
                announcementNotifications: adminAnnouncementNotifications ? adminAnnouncementNotifications.checked : true
            },
            purpose: adminGroupPurpose ? adminGroupPurpose.value : '',
            mood: document.querySelector('.mood-select-btn.active')?.dataset.mood || '',
            postingRule: adminPostingMode ? adminPostingMode.value : 'everyone',
            quietHours: adminPostingMode && adminPostingMode.value === 'quiet_hours' ? {
                start: adminQuietStart ? adminQuietStart.value : '22:00',
                end: adminQuietEnd ? adminQuietEnd.value : '08:00'
            } : {},
            scheduledPosting: adminPostingMode && adminPostingMode.value === 'scheduled' ? {
                start: adminPostingStart ? adminPostingStart.value : '09:00',
                end: adminPostingEnd ? adminPostingEnd.value : '18:00'
            } : {},
            participationModes: {
                readOnly: adminEnableReadOnly ? adminEnableReadOnly.checked : false,
                reactOnly: adminEnableReactOnly ? adminEnableReactOnly.checked : false,
                anonymous: adminEnableAnonymous ? adminEnableAnonymous.checked : false
            }
        };
        
        const response = await GroupCore.updateGroup(groupData.id, settings);
        
        if (response && response.success) {
            Object.assign(groupData, settings);
            
            updateGroupInAllLists(groupData);
            
            logTransparencyAction(groupData.id, 'Updated group settings');
            
            if (currentChatGroup && currentChatGroup.id === groupData.id) {
                updateChatHeaderUniqueFeatures(groupData);
                checkPostingRules(groupData);
            }
            
            const adminManagementModal = safeGetElement('#adminManagementModal');
            if (adminManagementModal) adminManagementModal.classList.remove('active');
            
            GroupCore.saveGroups();
        } else {
            throw new Error(response?.error || 'Failed to save settings');
        }
    } catch (error) {}
};

async function showFriendSelection() {
    try {
        const friendSelectionModal = safeGetElement('#friendSelectionModal');
        if (friendSelectionModal) friendSelectionModal.classList.add('active');
        selectedFriends = [];

        const friendSelectionContent = safeGetElement('#friendSelectionContent');
        if (friendSelectionContent) {
            friendSelectionContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading friends...</p></div>';
        }

        // FIXED: Actually fetch friends from the real API
        try {
            const token = (session && session.token) ||
                          localStorage.getItem('auth_token') ||
                          sessionStorage.getItem('auth_token');
            if (token) {
                const res = await fetch('/api/friends', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    // friends.js returns { success, data: { friends: [...] } }
                    const raw = data?.data?.friends || data?.data || data?.friends || [];
                    friends = raw.map(f => ({
                        id: f.id,
                        displayName: f.displayName || [f.firstName, f.lastName].filter(Boolean).join(' ') || f.username || 'Unknown',
                        username: f.username || '',
                        photoURL: f.avatar || null,
                        online: f.status === 'online'
                    }));
                }
            }
        } catch (fetchErr) {
            console.warn('[showFriendSelection] Could not fetch friends:', fetchErr.message);
        }

        renderFriendSelection();
    } catch (error) {
        console.error('[showFriendSelection]', error);
    }
}

function renderFriendSelection() {
    try {
        const friendSelectionContent = safeGetElement('#friendSelectionContent');
        if (!friendSelectionContent) return;
        
        if (friends.length === 0) {
            friendSelectionContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <p>No friends found</p>
                    <p class="subtext">Add friends first to invite them to groups</p>
                </div>
            `;
            return;
        }
        
        friendSelectionContent.innerHTML = '';
        
        friends.forEach(friend => {
            try {
                const friendItem = document.createElement('div');
                friendItem.className = 'friend-item';
                friendItem.dataset.friendId = friend.id;
                
                const initials = friend.displayName 
                    ? friend.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
                    : 'U';
                
                friendItem.innerHTML = `
                    <div class="friend-avatar" ${friend.photoURL ? `style="background-image: url('${friend.photoURL}')"` : ''}>
                        ${friend.photoURL ? '' : `<span>${initials}</span>`}
                    </div>
                    <div class="friend-info">
                        <div class="friend-name">${friend.displayName}</div>
                        <div class="friend-username">${friend.username || ''}</div>
                        <div style="font-size: 11px; color: ${friend.online ? 'var(--success-color)' : 'var(--text-secondary)'}; margin-top: 2px;">
                            <i class="fas fa-circle" style="font-size: 8px;"></i> ${friend.online ? 'Online' : 'Offline'}
                        </div>
                    </div>
                    <div class="friend-checkbox">
                        <i class="fas fa-check" style="display: none;"></i>
                    </div>
                `;
                
                friendItem.addEventListener('click', () => {
                    try {
                        const checkbox = friendItem.querySelector('.friend-checkbox');
                        const isSelected = checkbox.classList.contains('selected');
                        
                        if (isSelected) {
                            checkbox.classList.remove('selected');
                            checkbox.querySelector('i').style.display = 'none';
                            selectedFriends = selectedFriends.filter(id => id !== friend.id);
                        } else {
                            checkbox.classList.add('selected');
                            checkbox.querySelector('i').style.display = 'block';
                            selectedFriends.push(friend.id);
                        }
                        
                        updateSelectedFriendsList();
                    } catch (error) {}
                });
                
                friendSelectionContent.appendChild(friendItem);
            } catch (error) {}
        });
    } catch (error) {}
}

function updateSelectedFriendsList() {
    try {
        const selectedMembersList = safeGetElement('#selectedMembersList');
        if (!selectedMembersList) return;
        
        if (selectedFriends.length === 0) {
            selectedMembersList.innerHTML = `
                <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                    <i class="fas fa-users"></i>
                    <p>No members selected yet</p>
                    <p style="font-size: 14px;">Add friends to your group</p>
                </div>
            `;
            return;
        }
        
        selectedMembersList.innerHTML = '';
        
        selectedFriends.forEach(friendId => {
            try {
                const friend = friends.find(f => f.id === friendId);
                if (friend) {
                    const initials = friend.displayName 
                        ? friend.displayName.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
                        : 'U';
                    
                    const memberItem = document.createElement('div');
                    memberItem.className = 'friend-item';
                    memberItem.style.marginBottom = '5px';
                    memberItem.style.padding = '8px';
                    
                    memberItem.innerHTML = `
                        <div class="friend-avatar" ${friend.photoURL ? `style="background-image: url('${friend.photoURL}')"` : ''}>
                            ${friend.photoURL ? '' : `<span>${initials}</span>`}
                        </div>
                        <div class="friend-info">
                            <div class="friend-name">${friend.displayName}</div>
                            <div class="friend-username">${friend.username || ''}</div>
                        </div>
                        <div style="color: var(--danger-color); cursor: pointer;" onclick="window.removeSelectedFriend('${friend.id}')">
                            <i class="fas fa-times"></i>
                        </div>
                    `;
                    
                    selectedMembersList.appendChild(memberItem);
                }
            } catch (error) {}
        });
    } catch (error) {}
}

function removeSelectedFriend(friendId) {
    try {
        selectedFriends = selectedFriends.filter(id => id !== friendId);
        updateSelectedFriendsList();
        
        const friendItem = document.querySelector(`.friend-item[data-friend-id="${friendId}"]`);
        if (friendItem) {
            const checkbox = friendItem.querySelector('.friend-checkbox');
            checkbox.classList.remove('selected');
            checkbox.querySelector('i').style.display = 'none';
        }
    } catch (error) {}
}

const createGroupOnline = async function(groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'createGroup', data: groupData });
        return;
    }
    
    try {
        if (!groupData) return;
        
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        const members = [session.user?.uid || session.user?.id, ...selectedFriends];
        
        const groupDataToSave = {
            name: groupData.name,
            description: groupData.description || '',
            topic: groupData.topic || '',
            privacy: groupData.privacy || 'private',
            theme: groupData.theme || 'blue',
            welcomeMessage: groupData.welcomeMessage || '',
            rules: groupData.rules || [],
            moderationSettings: groupData.moderationSettings || {},
            joinQuestions: [],
            customReactions: groupData.customReactions || ['👍', '❤️', '😂'],
            badges: ['star', 'fire'],
            memberIds: members,
            purpose: groupData.purpose || '',
            mood: groupData.mood || '',
            postingRule: groupData.postingRule || 'everyone',
            quietHours: groupData.quietHours || {},
            scheduledPosting: groupData.scheduledPosting || {},
            participationModes: groupData.participationModes || {}
        };
        
        const response = await GroupCore.createGroup(groupDataToSave);
        
        if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to create group');
        }
        
        const newGroup = response.data;
        
        groups.push(newGroup);
        myGroups.push(newGroup);
        adminGroups.push(newGroup);
        
        GroupCore.saveGroups();
        updateGroupCounts();
        updateCurrentSection();
        
        const inviteLinkInput = safeGetElement('#inviteLinkInput');
        const copyInviteLinkBtn = safeGetElement('#copyInviteLinkBtn');
        const shareInviteLinkBtn = safeGetElement('#shareInviteLinkBtn');
        
        if (inviteLinkInput) inviteLinkInput.value = `${window.location.origin}/group.html?join=${newGroup.id}`;
        if (copyInviteLinkBtn) copyInviteLinkBtn.disabled = false;
        if (shareInviteLinkBtn) shareInviteLinkBtn.disabled = false;
        
        const createGroupModal = safeGetElement('#createGroupModal');
        const friendSelectionModal = safeGetElement('#friendSelectionModal');

        if (createGroupModal) {
            createGroupModal.classList.remove('active');
            createGroupModal.style.display = 'none';
        }
        if (friendSelectionModal) {
            friendSelectionModal.classList.remove('active');
            friendSelectionModal.style.display = 'none';
        }

        // FIXED: Send real invitations to every selected friend via the invite API.
        // Also read window.__pendingGroupInvites which is set by the UI Members tab
        // (window._cgSelectedMembers) since that Set lives outside this module scope.
        const allInvites = [
            ...new Set([
                ...(selectedFriends || []),
                ...(window.__pendingGroupInvites || [])
            ])
        ];
        if (allInvites.length > 0) {
            const groupId = newGroup.id || newGroup.group?.id;
            if (groupId) {
                for (const friendId of allInvites) {
                    if (!friendId) continue;
                    try {
                        await secureApiCall(`/group-members/${groupId}/invitations`, {
                            method: 'POST',
                            body: JSON.stringify({ inviteeId: friendId, role: 'member' }),
                            headers: { 'Content-Type': 'application/json' }
                        });
                    } catch (inviteErr) {
                        // Silently continue — restricted users may reject; non-friends may 403
                        debugLog(`[createGroupOnline] Invite failed for ${friendId}:`, inviteErr.message);
                    }
                }
            }
        }

        selectedFriends = [];
        // Clear the UI-level pending invites
        try { window.__pendingGroupInvites = []; } catch(_) {}
        showGroupDetails(newGroup, 'my_group');
        
        // Use safeSend for parent communication
        safeSend('GROUP_CREATED', {
            group: newGroup,
            timestamp: Date.now()
        });
        
    } catch (error) {}
};

const joinGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'joinGroup', groupId });
        return;
    }
    
    try {
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        const response = await GroupCore.sendJoinRequest(groupId);
        
        if (!response || !response.success) {
            return;
        }
        
        const updatedGroup = response.data;
        
        const existingIndex = groups.findIndex(g => g.id === groupId);
        if (existingIndex !== -1) {
            groups[existingIndex] = updatedGroup;
        } else {
            groups.push(updatedGroup);
        }
        
        joinedGroups.push(updatedGroup);
        groupInvites = groupInvites.filter(invite => invite.groupId !== groupId);
        
        GroupCore.saveGroups();
        updateGroupCounts();
        updateCurrentSection();
        
        const groupInviteModal = safeGetElement('#groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
        
        // Use safeSend for parent communication
        safeSend('MEMBER_ADDED', {
            groupId,
            member: {
                userId: session.user?.uid || session.user?.id,
                role: 'member',
                joinedAt: Date.now()
            },
            timestamp: Date.now()
        });
        
    } catch (error) {}
};

const leaveGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'leaveGroup', groupId });
        return;
    }
    
    try {
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        const response = await GroupCore.leaveGroup(groupId);
        
        if (!response || !response.success) {
            return;
        }
        
        groups = groups.filter(g => g.id !== groupId);
        joinedGroups = joinedGroups.filter(g => g.id !== groupId);
        adminGroups = adminGroups.filter(g => g.id !== groupId);
        
        GroupCore.saveGroups();
        updateGroupCounts();
        updateCurrentSection();
        
        const groupDetailsPanel = safeGetElement('#groupDetailsPanel');
        if (groupDetailsPanel && groupDetailsPanel.classList.contains('active')) {
            groupDetailsPanel.classList.remove('active');
            selectedGroup = null;
        }
        
        if (currentChatGroup && currentChatGroup.id === groupId) {
            if (typeof closeGroupChatMobile === 'function') {
                closeGroupChatMobile();
            }
            currentChatGroup = null;
        }
        
        // Use safeSend for parent communication
        safeSend('MEMBER_REMOVED', {
            groupId,
            userId: session.user?.uid || session.user?.id,
            timestamp: Date.now()
        });
        
    } catch (error) {}
};

async function acceptGroupInvite(inviteData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => acceptGroupInvite(inviteData));
        return;
    }
    
    try {
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        const inviteId = inviteData.id || inviteData.inviteId;
        const groupId = inviteData.groupId || inviteData.id;

        // FIXED: correct endpoint is /api/group-members/invitations/:id/accept
        const response = await secureApiCall(`/group-members/invitations/${inviteId}/accept`, {
            method: 'POST'
        });
        
        if (!response || !response.success) {
            return;
        }

        // Update local state — add to joinedGroups
        const groupData = response.data?.group || GroupCore.getGroupById(groupId);
        if (groupData) {
            if (!joinedGroups.find(g => g.id === groupId)) joinedGroups.push(groupData);
            if (!groups.find(g => g.id === groupId)) groups.push(groupData);
        }
        groupInvites = groupInvites.filter(inv => (inv.id || inv.inviteId) !== inviteId);
        GroupCore.saveGroups();
        updateGroupCounts();
        updateCurrentSection();
        const groupInviteModal = safeGetElement('#groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
    } catch (error) {}
}

async function declineGroupInvite(inviteData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => declineGroupInvite(inviteData));
        return;
    }
    
    try {
        if (!sessionReceived) {
            requestSession();
            return;
        }
        
        const inviteId = inviteData.id || inviteData.inviteId;

        // FIXED: correct endpoint is /api/group-members/invitations/:id/reject
        const response = await secureApiCall(`/group-members/invitations/${inviteId}/reject`, {
            method: 'POST'
        });

        if (!response || !response.success) {
            return;
        }

        groupInvites = groupInvites.filter(invite => (invite.id || invite.inviteId) !== inviteId);

        GroupCore.saveGroups();
        updateGroupCounts();
        updateCurrentSection();

        const groupInviteModal = safeGetElement('#groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
        
    } catch (error) {}
}

function leaveGroupConfirm(groupData) {
    try {
        if (confirm(`Are you sure you want to leave "${groupData.name}"? You will need to be invited again to rejoin.`)) {
            leaveGroupOnline(groupData.id);
        }
    } catch (error) {}
}

const showGroupDetails = async function(groupData, type) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => showGroupDetails(groupData, type));
        return;
    }
    
    try {
        if (!groupData) return;
        
        selectedGroup = groupData;
        
        const groupDetailsTitle = document.querySelector('.group-details-title');
        if (groupDetailsTitle) groupDetailsTitle.textContent = 'Group Details';
        
        const sidebar = safeGetElement('#sidebar');
        const groupDetailsPanel = safeGetElement('#groupDetailsPanel');
        
        if (isMobile) {
            if (sidebar) sidebar.style.display = 'none';
            if (groupDetailsPanel) {
                groupDetailsPanel.style.display = 'flex';
                groupDetailsPanel.classList.add('active');
            }
        } else {
            if (groupDetailsPanel) groupDetailsPanel.classList.add('active');
        }
        
        await loadGroupDetails(groupData, type);
    } catch (error) {}
};

async function loadGroupDetails(groupData, type) {
    try {
        const detailsContent = safeGetElement('#groupDetailsContent');
        if (!detailsContent) return;
        
        detailsContent.innerHTML = '<div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i><p>Loading group details...</p></div>';
        
        try {
            const theme = groupData.theme || 'blue';
            const themeInfo = groupThemes[theme];
            const groupType = groupData.type || 'private';
            const typeInfo = groupTypes[groupType];
            
            const initials = groupData.name 
                ? groupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
                : 'G';
            
            const userRole = groupData.isCreator ? 'creator' : 
                            groupData.isAdmin ? 'admin' : 'member';
            const roleInfo = groupRoles[userRole];
            
            const welcomeMessage = groupData.welcomeMessage || `Welcome to ${groupData.name}! We're glad to have you here.`;
            const rules = groupData.rules || [];
            
            const purpose = groupData.purpose || '';
            const mood = groupData.mood || '';
            const postingRule = groupData.postingRule || 'everyone';
            const purposeInfo = purpose ? groupPurposes[purpose] : null;
            const moodInfo = mood ? groupMoods[mood] : null;
            const ruleInfo = postingRules[postingRule];
            
            let realMembers = [];
            try {
                const response = await secureApiCall(`/groups/${groupData.id}/members`, { silent: true });
                if (response && response.success && response.data) {
                    realMembers = response.data.slice(0, 5);
                }
            } catch (error) {}
            
            detailsContent.innerHTML = `
                <div class="group-profile-header">
                    <div class="group-profile-avatar" ${groupData.photoURL ? `style="background-image: url('${groupData.photoURL}'); background: ${themeInfo.gradient};"` : `style="background: ${themeInfo.gradient};"`}>
                        ${groupData.photoURL ? '' : `<span style="color: white; font-size: 36px;">${initials}</span>`}
                        ${purposeInfo ? `<div class="group-purpose-badge-large" style="position: absolute; bottom: -10px; right: -10px; background: ${purposeInfo.color}; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px;">${purposeInfo.icon}</div>` : ''}
                    </div>
                    <div class="group-profile-name">${groupData.name || 'Unnamed Group'}</div>
                    ${purposeInfo ? `<div class="group-purpose-tag-large" style="margin: 5px 0; font-size: 14px; padding: 6px 12px; background: ${purposeInfo.color}20; color: ${purposeInfo.color}; border-radius: 20px;">${purposeInfo.icon} ${purposeInfo.name}</div>` : ''}
                    <div class="group-profile-topic">${groupData.topic || 'No topic set'}</div>
                    <div class="group-profile-type ${groupType}">
                        <i class="${typeInfo.icon}"></i> ${typeInfo.name}
                    </div>
                    <div class="role-badge ${userRole}">
                        <i class="${roleInfo.icon}"></i> ${roleInfo.name}
                    </div>
                    ${moodInfo ? `<div class="group-mood-indicator mood-${mood}" style="margin: 10px auto; background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 8px 16px; border-radius: 20px; display: inline-flex; align-items: center; gap: 8px;">${moodInfo.icon} ${moodInfo.name}</div>` : ''}
                    ${ruleInfo ? `<div class="posting-rules-banner rule-${postingRule.replace('_', '-')}" style="margin: 10px auto; background: ${ruleInfo.bgColor}; color: ${ruleInfo.color}; padding: 8px 16px; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px;"><i class="fas fa-comment"></i> ${ruleInfo.name}</div>` : ''}
                </div>
                
                ${welcomeMessage ? `
                <div class="welcome-message">
                    <div class="welcome-title">
                        <i class="fas fa-door-open"></i> Welcome!
                    </div>
                    <div>${welcomeMessage}</div>
                </div>
                ` : ''}
                
                ${groupData.description ? `
                <div class="group-info-section">
                    <div class="info-section-title">
                        <i class="fas fa-info-circle"></i>
                        <span>About This Group</span>
                    </div>
                    <div style="padding: 10px 0;">${groupData.description}</div>
                </div>
                ` : ''}
                
                ${rules.length > 0 ? `
                <div class="rules-section">
                    <div class="rules-title">
                        <i class="fas fa-gavel"></i>
                        <span>Group Rules</span>
                    </div>
                    <ul class="rules-list">
                        ${rules.map(rule => `<li><i class="fas fa-check-circle" style="color: var(--success-color);"></i> ${rule}</li>`).join('')}
                    </ul>
                </div>
                ` : ''}
                
                <div class="group-info-section">
                    <div class="info-section-title">
                        <i class="fas fa-chart-bar"></i>
                        <span>Group Statistics</span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Members:</span>
                        <span class="info-value">${groupData.memberCount || 0}</span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Created:</span>
                        <span class="info-value">${formatDate(groupData.createdAt || new Date())}</span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Last Activity:</span>
                        <span class="info-value">${formatTimeAgo(groupData.lastActivity || groupData.createdAt || new Date())}</span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Group Theme:</span>
                        <span class="info-value">
                            <div class="theme-badge ${theme}">
                                <i class="fas fa-palette"></i>
                                ${themeInfo.name}
                            </div>
                        </span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Privacy:</span>
                        <span class="info-value">
                            <div class="type-display ${groupType}">
                                <i class="${typeInfo.icon}"></i>
                                ${typeInfo.name}
                            </div>
                        </span>
                    </div>
                    
                    <div class="info-item">
                        <span class="info-label">Activity Pulse:</span>
                        <span class="info-value">
                            ${(() => {
                                const pulse = calculateGroupPulse(groupData);
                                return pulse ? `<div class="group-pulse ${pulse.class}"><i class="fas fa-heartbeat"></i> ${pulse.text}</div>` : '<span>Unknown</span>';
                            })()}
                        </span>
                    </div>
                </div>
                
                <div class="group-info-section">
                    <div class="info-section-title">
                        <i class="fas fa-users"></i>
                        <span>Members (${Math.min(groupData.memberCount || 0, 5)} shown)</span>
                    </div>
                    <div class="member-list">
                        ${realMembers.length > 0 ? 
                            realMembers.map((member, i) => `
                                <div class="member-item">
                                    <div class="member-avatar" ${member.photoURL ? `style="background-image: url('${member.photoURL}')"` : 'style="background: var(--secondary-color)"'}>
                                        ${member.photoURL ? '' : `<span style="color: var(--text-primary); font-size: 14px;">${member.displayName ? member.displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'U'}</span>`}
                                    </div>
                                    <div class="member-info">
                                        <div class="member-name">
                                            <span>${member.displayName || 'Unknown User'}</span>
                                            ${member.uid === (session.user?.uid || session.user?.id) ? `<span class="role-badge ${userRole}"><i class="${roleInfo.icon}"></i> ${roleInfo.name}</span>` : 
                                             groupData.admins && groupData.admins.includes(member.uid) ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : 
                                             '<span class="role-badge member"><i class="fas fa-user"></i> Member</span>'}
                                        </div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">
                                            ${member.uid === (session.user?.uid || session.user?.id) ? 'You' : (member.online ? 'Online' : 'Offline')}
                                        </div>
                                    </div>
                                </div>
                            `).join('') :
                            Array.from({length: Math.min(groupData.memberCount || 0, 5)}, (_, i) => `
                                <div class="member-item">
                                    <div class="member-avatar" style="background: ${i === 0 ? themeInfo.gradient : 'var(--secondary-color)'}">
                                        <span style="color: ${i === 0 ? 'white' : 'var(--text-primary)'}; font-size: 14px;">${i === 0 ? 'Y' : 'M'}</span>
                                    </div>
                                    <div class="member-info">
                                        <div class="member-name">
                                            <span>${i === 0 ? 'You' : 'Member ' + (i+1)}</span>
                                            ${i === 0 ? `<span class="role-badge ${userRole}"><i class="${roleInfo.icon}"></i> ${roleInfo.name}</span>` : 
                                               i < 3 ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : 
                                               '<span class="role-badge member"><i class="fas fa-user"></i> Member</span>'}
                                        </div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">
                                            ${i === 0 ? 'Online' : (i < 3 ? 'Recently active' : 'Member')}
                                        </div>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                    ${groupData.memberCount > 5 ? `
                        <div style="text-align: center; margin-top: 10px;">
                            <button class="action-btn secondary" id="viewAllMembersBtn" style="width: 100%;">
                                <i class="fas fa-users"></i> View All ${groupData.memberCount} Members
                            </button>
                        </div>
                    ` : ''}
                </div>
                
                ${groupData.participationModes ? `
                <div class="group-info-section">
                    <div class="info-section-title">
                        <i class="fas fa-user-secret"></i>
                        <span>Participation Modes</span>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;">
                        ${groupData.participationModes.readOnly ? `
                            <div class="participation-mode mode-read-only">
                                <i class="fas fa-eye"></i> Read Only
                            </div>
                        ` : ''}
                        ${groupData.participationModes.reactOnly ? `
                            <div class="participation-mode mode-react-only">
                                <i class="fas fa-thumbs-up"></i> React Only
                            </div>
                        ` : ''}
                        ${groupData.participationModes.anonymous ? `
                            <div class="participation-mode mode-anonymous">
                                <i class="fas fa-user-secret"></i> Anonymous
                            </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
                
                <div class="action-buttons">
                    <button class="action-btn success" id="openGroupChatBtn">
                        <i class="fas fa-comments"></i> Open Chat
                    </button>
                    
                    ${type === 'my_group' || type === 'admin' ? `
                        <button class="action-btn primary" id="manageGroupBtn">
                            <i class="fas fa-cog"></i> Manage
                        </button>
                    ` : ''}
                    
                    ${type === 'joined' ? `
                        <button class="action-btn danger" id="leaveGroupBtn">
                            <i class="fas fa-sign-out-alt"></i> Leave Group
                        </button>
                    ` : ''}
                    
                    <button class="action-btn secondary" id="groupOptionsBtn">
                        <i class="fas fa-ellipsis-h"></i> Options
                    </button>
                </div>
            `;
            
            const openGroupChatBtn = safeGetElement('#openGroupChatBtn');
            const manageGroupBtn = safeGetElement('#manageGroupBtn');
            const leaveGroupBtn = safeGetElement('#leaveGroupBtn');
            const groupOptionsBtn = safeGetElement('#groupOptionsBtn');
            const viewAllMembersBtn = safeGetElement('#viewAllMembersBtn');
            
            if (openGroupChatBtn) {
                openGroupChatBtn.addEventListener('click', () => {
                    openGroupChat(groupData);
                });
            }
            
            if (manageGroupBtn) {
                manageGroupBtn.addEventListener('click', () => {
                    openAdminManagement(groupData);
                });
            }
            
            if (leaveGroupBtn) {
                leaveGroupBtn.addEventListener('click', () => {
                    leaveGroupConfirm(groupData);
                });
            }
            
            if (groupOptionsBtn) {
                groupOptionsBtn.addEventListener('click', () => {
                    showGroupOptions(groupData);
                });
            }
            
            if (viewAllMembersBtn) {
                viewAllMembersBtn.addEventListener('click', () => {});
            }
            
        } catch (error) {
            detailsContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error loading group details</p>
                    <p class="subtext">Please try again later</p>
                </div>
            `;
        }
    } catch (error) {}
}

// =============================================
// DATA SYNC FUNCTIONS - UPDATED WITH SESSION CHECK
// =============================================
async function syncGroupsFromServer() {
    if (!sessionReady && !sessionReceived) return;
    
    try {
        const response = await GroupCore.requestGroupList();
        
        if (!response || !response.success) {
            return;
        }
        
        const groupsData = response.data;
        const serverGroups = groupsData.groups || [];
        const serverMyGroups = groupsData.myGroups || [];
        const serverJoinedGroups = groupsData.joinedGroups || [];
        const serverAdminGroups = groupsData.adminGroups || [];
        
        if (JSON.stringify(serverGroups) !== JSON.stringify(groups)) {
            groups = serverGroups;
            myGroups = serverMyGroups;
            joinedGroups = serverJoinedGroups;
            adminGroups = serverAdminGroups;
            
            SafeStorage.setItem('groups', groups);
            SafeStorage.setItem('myGroups', myGroups);
            SafeStorage.setItem('joinedGroups', joinedGroups);
            SafeStorage.setItem('adminGroups', adminGroups);
            SafeStorage.setItem('lastCacheTime', Date.now().toString());
            
            const allGroupsSection = safeGetElement('#allGroupsSection');
            if (allGroupsSection && allGroupsSection.classList.contains('active')) {
                updateCurrentSection();
                updateGroupCounts();
            }
        }
    } catch (error) {}
}

async function syncGroupInvitesFromServer() {
    if (!sessionReady && !sessionReceived) return;
    
    try {
        const response = await secureApiCall('/groups/invites/user', { silent: true });
        
        const serverInvites = [];
        
        if (response && response.success && response.data) {
            serverInvites.push(...response.data.map(invite => ({
                ...invite,
                id: invite.id || invite._id,
                type: 'group_invite',
                purpose: invite.purpose || '',
                mood: invite.mood || '',
                postingRule: invite.postingRule || 'everyone'
            })));
        }
        
        if (JSON.stringify(serverInvites) !== JSON.stringify(groupInvites)) {
            groupInvites = serverInvites;
            SafeStorage.setItem('groupInvites', groupInvites);
            
            const invitesCountEl = safeGetElement('#invitesCount');
            const invitesSectionCountEl = safeGetElement('#invitesSectionCount');
            if (invitesCountEl) invitesCountEl.textContent = groupInvites.length;
            if (invitesSectionCountEl) invitesSectionCountEl.textContent = groupInvites.length;
        }
    } catch (error) {}
}

async function syncUniqueFeaturesData() {
    if (!sessionReady && !sessionReceived) return;
    
    try {
        const purposesResponse = await secureApiCall('/groups/purposes', { silent: true });
        if (purposesResponse && purposesResponse.success && purposesResponse.data) {
            SafeStorage.setItem('groupPurposes', purposesResponse.data);
            
            purposesResponse.data.forEach(purpose => {
                const group = groups.find(g => g.id === purpose.groupId);
                if (group) {
                    group.purpose = purpose.purpose;
                }
            });
        }
        
        const moodsResponse = await secureApiCall('/groups/moods', { silent: true });
        if (moodsResponse && moodsResponse.success && moodsResponse.data) {
            SafeStorage.setItem('groupMoods', moodsResponse.data);
            
            moodsResponse.data.forEach(mood => {
                const group = groups.find(g => g.id === mood.groupId);
                if (group) {
                    group.mood = mood.mood;
                }
            });
        }
        
    } catch (error) {}
}

function matchesFilters(groupData) {
    try {
        if (!groupData) return false;
        
        if (currentTypeFilter !== 'all' && groupData.type !== currentTypeFilter) {
            return false;
        }
        
        if (currentSearchTerm && !matchesSearch(groupData, currentSearchTerm)) {
            return false;
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

function matchesSearch(groupData, searchTerm) {
    try {
        if (!searchTerm) return true;
        
        const searchIn = [
            groupData.name || '',
            groupData.topic || '',
            groupData.description || '',
            groupData.purpose ? groupPurposes[groupData.purpose]?.name || '' : ''
        ].join(' ').toLowerCase();
        
        return searchIn.includes(searchTerm.toLowerCase());
    } catch (error) {
        return false;
    }
}

function filterGroupsByType(type) {
    try {
        currentTypeFilter = type;
        updateCurrentSection();
        
        document.querySelectorAll('.type-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`.type-filter-btn[data-type="${type}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    } catch (error) {}
}

function searchGroups(searchTerm) {
    try {
        currentSearchTerm = searchTerm.toLowerCase().trim();
        updateCurrentSection();
    } catch (error) {}
}

function saveGroupsToLocalStorage() {
    GroupCore.saveGroups();
}

function formatTimeAgo(date) {
    try {
        const dateObj = date instanceof Date ? date : new Date(date);
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
        return '--';
    }
}

function formatDate(date) {
    try {
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        return '--';
    }
}

function showNotification(message, type = 'success') {
    try {
        const notificationText = safeGetElement('#notificationText');
        const notification = safeGetElement('#notification');
        
        if (!notificationText || !notification) return;
        
        notificationText.textContent = message;
        
        notification.className = 'notification';
        notification.classList.add(type);
        notification.classList.add('active');
        
        setTimeout(() => {
            try {
                notification.classList.remove('active');
            } catch (error) {}
        }, 3000);
    } catch (error) {}
}

function processPendingOfflineActions() {
    try {
        const pendingActions = SafeStorage.getItem('pendingActions') || [];
        if (pendingActions.length > 0) {}
    } catch (error) {}
}

function updateCreateGroupPostingRulesUI() {
    try {
        const postingRulesSelect = safeGetElement('#postingRulesSelect');
        const quietHoursSection = safeGetElement('#quietHoursSection');
        const scheduledPostingSection = safeGetElement('#scheduledPostingSection');
        
        if (!postingRulesSelect) return;
        
        const mode = postingRulesSelect.value;
        if (quietHoursSection) {
            quietHoursSection.style.display = mode === 'quiet_hours' ? 'block' : 'none';
        }
        if (scheduledPostingSection) {
            scheduledPostingSection.style.display = mode === 'scheduled' ? 'block' : 'none';
        }
    } catch (error) {}
}

// =============================================
// CORE FUNCTIONS (PRESERVED)
// =============================================
function loadCachedDataInstantly() {
    GroupCore.loadCachedData();
    updateGroupCounts();
}

function loadUniqueFeaturesData() {
    try {
        const cachedPurposes = SafeStorage.getItem('groupPurposes');
        if (cachedPurposes) {
            const purposes = cachedPurposes;
            groups.forEach(group => {
                if (purposes[group.id]) {
                    group.purpose = purposes[group.id];
                }
            });
        }
        
        const cachedMoods = SafeStorage.getItem('groupMoods');
        if (cachedMoods) {
            const moods = cachedMoods;
            groups.forEach(group => {
                if (moods[group.id]) {
                    group.mood = moods[group.id];
                }
            });
        }
        
        const cachedRules = SafeStorage.getItem('groupPostingRules');
        if (cachedRules) {
            const rules = cachedRules;
            groups.forEach(group => {
                if (rules[group.id]) {
                    group.postingRule = rules[group.id];
                }
            });
        }
        
        const cachedModes = SafeStorage.getItem('participationMode');
        if (cachedModes) {
            currentParticipationMode = cachedModes;
        }
    } catch (error) {}
}

function calculateGroupPulse(groupData) {
    try {
        if (!groupData || !groupData.lastActivity) return null;
        
        const lastActivity = new Date(groupData.lastActivity).getTime();
        const now = Date.now();
        const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60);
        
        if (hoursSinceActivity < 1) {
            return { text: 'Very Active', class: 'pulse-active' };
        } else if (hoursSinceActivity < 6) {
            return { text: 'Active', class: 'pulse-active' };
        } else if (hoursSinceActivity < 24) {
            return { text: 'Quiet', class: 'pulse-quiet' };
        } else if (hoursSinceActivity < 72) {
            return { text: 'Inactive', class: 'pulse-quiet' };
        } else {
            return { text: 'Dormant', class: 'pulse-quiet' };
        }
    } catch (error) {
        return null;
    }
}

function updateGroupCounts() {
    try {
        const totalGroupsEl = safeGetElement('#totalGroups');
        const activeGroupsEl = safeGetElement('#activeGroups');
        const totalMembersEl = safeGetElement('#totalMembers');
        const myGroupsCountEl = safeGetElement('#myGroupsCount');
        const joinedCountEl = safeGetElement('#joinedCount');
        const invitesCountEl = safeGetElement('#invitesCount');
        const adminCountEl = safeGetElement('#adminCount');
        
        if (totalGroupsEl) totalGroupsEl.textContent = groups.length;
        
        const activeGroups = groups.filter(g => g.lastActivity && (Date.now() - new Date(g.lastActivity).getTime()) < 86400000).length;
        if (activeGroupsEl) activeGroupsEl.textContent = activeGroups;
        
        const totalMembers = groups.reduce((sum, group) => sum + (group.memberCount || 0), 0);
        if (totalMembersEl) totalMembersEl.textContent = totalMembers;
        
        if (myGroupsCountEl) myGroupsCountEl.textContent = myGroups.length;
        if (joinedCountEl) joinedCountEl.textContent = joinedGroups.length;
        if (invitesCountEl) invitesCountEl.textContent = groupInvites.length;
        if (adminCountEl) adminCountEl.textContent = adminGroups.length;
    } catch (error) {}
}

function updateCurrentSection() {
    try {
        const activeSection = document.querySelector('.groups-section.active');
        if (activeSection) {
            const sectionId = activeSection.id;
            
            switch(sectionId) {
                case 'allGroupsSection':
                    renderAllGroups();
                    break;
                case 'myGroupsSection':
                    renderMyGroups();
                    break;
                case 'joinedSection':
                    renderJoinedGroups();
                    break;
                case 'invitesSection':
                    renderGroupInvites();
                    break;
                case 'adminSection':
                    renderAdminGroups();
                    break;
            }
        }
    } catch (error) {}
}

function renderAllGroups() {
    try {
        const allGroupsList = safeGetElement('#allGroupsList');
        if (!allGroupsList) return;
        
        allGroupsList.innerHTML = '';
        
        if (groups.length === 0) {
            allGroupsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No groups yet</p>
                    <p class="subtext">Create or join groups to start connecting</p>
                </div>
            `;
            return;
        }
        
        groups.forEach(group => {
            if (matchesFilters(group)) {
                addGroupItem(group, allGroupsList, 'group');
            }
        });
        
        if (allGroupsList.children.length === 0) {
            allGroupsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>No groups match your filters</p>
                    <p class="subtext">Try changing your search or filter criteria</p>
                </div>
            `;
        }
    } catch (error) {}
}

function renderMyGroups() {
    try {
        const myGroupsList = safeGetElement('#myGroupsList');
        if (!myGroupsList) return;
        
        myGroupsList.innerHTML = '';
        
        if (myGroups.length === 0) {
            myGroupsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No groups created yet</p>
                    <p class="subtext">Create your first group to get started</p>
                </div>
            `;
            return;
        }
        
        myGroups.forEach(group => {
            if (matchesFilters(group)) {
                addGroupItem(group, myGroupsList, 'my_group');
            }
        });
    } catch (error) {}
}

function renderJoinedGroups() {
    try {
        const joinedList = safeGetElement('#joinedList');
        if (!joinedList) return;
        
        joinedList.innerHTML = '';
        
        if (joinedGroups.length === 0) {
            joinedList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-plus"></i>
                    <p>No joined groups yet</p>
                    <p class="subtext">Join groups to see them here</p>
                </div>
            `;
            return;
        }
        
        joinedGroups.forEach(group => {
            if (matchesFilters(group)) {
                addGroupItem(group, joinedList, 'joined');
            }
        });
    } catch (error) {}
}

function renderGroupInvites() {
    try {
        const invitesList = safeGetElement('#invitesList');
        if (!invitesList) return;
        
        invitesList.innerHTML = '';
        
        if (groupInvites.length === 0) {
            invitesList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-envelope"></i>
                    <p>No pending invitations</p>
                    <p class="subtext">You'll see group invitations here</p>
                </div>
            `;
            return;
        }
        
        groupInvites.forEach(invite => {
            if (matchesFilters(invite)) {
                addGroupItem(invite, invitesList, 'group_invite');
            }
        });
    } catch (error) {}
}

function renderAdminGroups() {
    try {
        const adminList = safeGetElement('#adminList');
        if (!adminList) return;
        
        adminList.innerHTML = '';
        
        if (adminGroups.length === 0) {
            adminList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-crown"></i>
                    <p>No admin groups</p>
                    <p class="subtext">You'll see groups you administer here</p>
                </div>
            `;
            return;
        }
        
        adminGroups.forEach(group => {
            if (matchesFilters(group)) {
                addGroupItem(group, adminList, 'admin');
            }
        });
    } catch (error) {}
}

function addGroupItem(groupData, container, type) {
    try {
        if (!groupData || !container) return;
        
        const safeGroupData = JSON.parse(JSON.stringify(groupData));
        
        const existingItem = container.querySelector(`[data-group-id="${safeGroupData.id}"]`);
        if (existingItem) {
            existingItem.remove();
        }
        
        if (!matchesFilters(safeGroupData)) {
            return;
        }
        
        const groupItem = document.createElement('div');
        groupItem.className = 'group-item';
        groupItem.dataset.groupId = safeGroupData.id;
        groupItem.dataset.type = type;
        
        const initials = safeGroupData.name 
            ? safeGroupData.name.split(' ').map(word => word[0]).join('').toUpperCase().substring(0, 2)
            : 'G';
        
        const groupType = safeGroupData.type || 'private';
        const typeInfo = groupTypes[groupType];
        const theme = safeGroupData.theme || 'blue';
        const themeInfo = groupThemes[theme];
        
        const purpose = safeGroupData.purpose || '';
        const mood = safeGroupData.mood || '';
        const postingRule = safeGroupData.postingRule || 'everyone';
        const purposeInfo = purpose ? groupPurposes[purpose] : null;
        const moodInfo = mood ? groupMoods[mood] : null;
        const ruleInfo = postingRules[postingRule];
        const pulse = calculateGroupPulse(safeGroupData);
        
        const unreadCount = GroupCore.getGroupUnreadCount(safeGroupData.id) || 0;
        
        groupItem.innerHTML = `
            <div class="group-avatar" ${safeGroupData.photoURL ? `style="background-image: url('${safeGroupData.photoURL}'); background: ${themeInfo.gradient};"` : `style="background: ${themeInfo.gradient};"`}>
                ${safeGroupData.photoURL ? '' : `<span>${initials}</span>`}
                <div class="group-theme-badge ${theme}"></div>
                <div class="group-type-badge ${groupType}" title="${typeInfo ? typeInfo.name : 'Private'}">
                    <i class="${typeInfo ? typeInfo.icon : 'fas fa-lock'}"></i>
                </div>
                ${purposeInfo ? `<div class="group-purpose-badge" style="position: absolute; bottom: -5px; right: -5px; background: ${purposeInfo.color}; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px;">${purposeInfo.icon}</div>` : ''}
                ${unreadCount > 0 ? `<span class="group-unread-badge">${unreadCount}</span>` : ''}
            </div>
            <div class="group-info">
                <div class="group-name">
                    <span class="group-name-text">${safeGroupData.name || 'Unnamed Group'}</span>
                    ${pulse ? `<span class="group-pulse ${pulse.class}"><i class="fas fa-heartbeat"></i> ${pulse.text}</span>` : ''}
                    <span class="group-details">
                        ${safeGroupData.isAdmin ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : ''}
                        ${safeGroupData.isCreator ? '<span class="role-badge admin"><i class="fas fa-star"></i> Creator</span>' : ''}
                    </span>
                </div>
                <div class="group-details">
                    ${purposeInfo ? `<span class="group-purpose-tag">${purposeInfo.icon} ${purposeInfo.name}</span>` : ''}
                    ${moodInfo ? `<span class="group-mood-indicator mood-${mood}" style="background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 2px 8px; border-radius: 10px; font-size: 11px;">${moodInfo.icon} ${moodInfo.name}</span>` : ''}
                    ${safeGroupData.topic ? `<span class="group-topic">${safeGroupData.topic}</span>` : ''}
                    <span class="member-count"><i class="fas fa-users"></i> ${safeGroupData.memberCount || 0}</span>
                    <span>${typeInfo ? typeInfo.name : 'Private'}</span>
                    ${safeGroupData.theme ? `<span class="theme-badge ${safeGroupData.theme}"><i class="fas fa-palette"></i> ${groupThemes[safeGroupData.theme].name}</span>` : ''}
                </div>
                ${ruleInfo ? `<div style="font-size: 11px; color: ${ruleInfo.color}; margin-top: 3px;"><i class="fas fa-comment"></i> ${ruleInfo.name}</div>` : ''}
                ${safeGroupData.description ? `<div style="font-size: 13px; color: var(--text-secondary); margin-top: 5px;">${safeGroupData.description.substring(0, 100)}${safeGroupData.description.length > 100 ? '...' : ''}</div>` : ''}
            </div>
            <div class="group-actions">
                ${type === 'group_invite' ? `
                    <button class="group-action-btn success" data-action="accept-invite" title="Accept Invite">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="group-action-btn danger" data-action="decline-invite" title="Decline Invite">
                        <i class="fas fa-times"></i>
                    </button>
                ` : `
                    <button class="group-action-btn chat" data-action="open-chat" title="Open Chat">
                        <i class="fas fa-comments"></i>
                    </button>
                    <button class="group-action-btn" data-action="info" title="Group Info">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    ${type === 'my_group' || type === 'admin' ? `
                        <button class="group-action-btn" data-action="manage" title="Manage Group">
                            <i class="fas fa-cog"></i>
                        </button>
                    ` : ''}
                    ${type === 'joined' ? `
                        <button class="group-action-btn danger" data-action="leave" title="Leave Group">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    ` : ''}
                `}
            </div>
        `;
        
        groupItem.addEventListener('click', (e) => {
            if (!e.target.closest('.group-actions')) {
                showGroupDetails(safeGroupData, type);
            }
        });
        
        const actionButtons = groupItem.querySelectorAll('.group-action-btn');
        actionButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleGroupAction(action, safeGroupData, type, btn);
            });
        });
        
        container.appendChild(groupItem);
    } catch (error) {}
}

function handleGroupAction(action, groupData, type, button) {
    try {
        switch(action) {
            case 'open-chat':
                openGroupChat(groupData);
                break;
            case 'info':
                showGroupDetails(groupData, type);
                break;
            case 'manage':
                openAdminManagement(groupData);
                break;
            case 'leave':
                leaveGroupConfirm(groupData);
                break;
            case 'accept-invite':
                acceptGroupInvite(groupData);
                break;
            case 'decline-invite':
                declineGroupInvite(groupData);
                break;
            default:
                break;
        }
    } catch (error) {}
}

// =============================================
// BACKGROUND SYNC FUNCTIONS (PRESERVED)
// =============================================
let _backgroundSyncRetryCount = 0;
const MAX_BACKGROUND_RETRY = 1;

function startBackgroundSync() {
    try {
        if (backgroundSyncRunning) {
            return;
        }
        
        if (!sessionReady && !sessionReceived) {
            return;
        }
        
        backgroundSyncRunning = true;
        
        // Sync immediately without setTimeout
        backgroundSyncWithServer();
        
        syncIntervalId = setInterval(() => {
            try {
                if (sessionReady || sessionReceived) {
                    backgroundSyncWithServer();
                } else {
                    clearInterval(syncIntervalId);
                    syncIntervalId = null;
                    backgroundSyncRunning = false;
                }
            } catch (error) {}
        }, 30000);
        
        if (typeof processPendingOfflineActions === 'function') {
            processPendingOfflineActions();
        }
    } catch (error) {}
}

async function backgroundSyncWithServer() {
    if (!sessionReady && !sessionReceived) {
        return;
    }
    
    if (++_backgroundSyncRetryCount > MAX_BACKGROUND_RETRY) {
        return;
    }
    
    try {
        await syncGroupsFromServer();
        await syncGroupInvitesFromServer();
        await syncUniqueFeaturesData();
        
        SafeStorage.setItem('lastSync', Date.now().toString());
        _backgroundSyncRetryCount = 0;
    } catch (error) {}
}


// =============================================
// DOM CONTENT LOADED
// =============================================
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            initializeModule();
        } catch (error) {
            console.error(`[${MODULE_NAME}] Initialization error:`, error);
        }
    });
}

// =============================================
// UI SETUP FUNCTIONS (PRESERVED)
// =============================================
let _uiBound = false;

function setupUIEventListeners() {
    try {
        if (_uiBound) return;
        _uiBound = true;
        
        const searchInput = safeGetElement('#groupSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchGroups(e.target.value);
            });
        }
        
        document.querySelectorAll('.type-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterGroupsByType(e.target.dataset.type || btn.dataset.type);
            });
        });
        
        const createGroupBtn = safeGetElement('#createGroupBtn');
        if (createGroupBtn) {
            createGroupBtn.addEventListener('click', () => {
                if (!sessionReceived) {
                    requestSession();
                    return;
                }
                const createGroupModal = safeGetElement('#createGroupModal');
                if (createGroupModal) createGroupModal.classList.add('active');
            });
        }
        
        document.querySelectorAll('.category-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.category-btn').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.groups-section').forEach(s => s.classList.remove('active'));
                
                tab.classList.add('active');
                const sectionId = tab.id.replace('Tab', 'Section');
                const section = safeGetElement('#' + sectionId);
                if (section) {
                    section.classList.add('active');
                    updateCurrentSection();
                }
            });
        });
        
    } catch (error) {}
}

function setupResponsiveBehavior() {
    try {
        window.addEventListener('resize', () => {
            isMobile = window.innerWidth <= 768;
        });
    } catch (error) {}
}

// =============================================
// MISSING FUNCTION EXPORTS (PRESERVED)
// =============================================
function showGroupOptions(groupData) {
    try {} catch (error) {}
}

function downloadQRCode() {
    try {} catch (error) {}
}

function addPollOption() {
    try {} catch (error) {}
}

function removePollOption() {
    try {} catch (error) {}
}

function saveNewPoll() {
    try {} catch (error) {}
}

function voteOnPoll() {
    try {} catch (error) {}
}

function saveNewEvent() {
    try {} catch (error) {}
}

function viewGroupNotes() {
    try {} catch (error) {}
}

function viewGroupEvents() {
    try {} catch (error) {}
}

function viewGroupAnalytics() {
    try {} catch (error) {}
}

function loadGroupAnalytics() {
    try {
        return { success: true, data: {} };
    } catch (error) {
        return { success: false };
    }
}

function renderAnalyticsChart() {
    try {} catch (error) {}
}

function changePurposeMood() {
    try {} catch (error) {}
}

function viewChangeHistory() {
    try {} catch (error) {}
}

function showOptionsModal() {
    try {} catch (error) {}
}

function shareGroup() {
    try {} catch (error) {}
}

function muteGroup() {
    try {} catch (error) {}
}

function favoriteGroup() {
    try {} catch (error) {}
}

function reportGroup() {
    try {} catch (error) {}
}

function blockGroup() {
    try {} catch (error) {}
}

function showGroupQRCode() {
    try {} catch (error) {}
}

function copyInviteLink() {
    try {
        const inviteLinkInput = safeGetElement('#inviteLinkInput');
        if (inviteLinkInput && inviteLinkInput.value) {
            navigator.clipboard.writeText(inviteLinkInput.value);
        }
    } catch (error) {}
}

function inviteMembers() {
    try {
        showFriendSelection();
    } catch (error) {}
}

function editGroupInfo() {
    try {} catch (error) {}
}

function manageRoles() {
    try {} catch (error) {}
}

function createEvent() {
    try {} catch (error) {}
}

function createPoll() {
    try {} catch (error) {}
}

function showGroupInviteDetails() {
    try {} catch (error) {}
}

// =============================================
// MAIN INITIALIZATION FUNCTIONS
// =============================================

/**
 * Initialize the groups page
 */
export async function initGroupPage() {
    debugLog('Initializing groups page');
    
    try {
        // Load cached data first (safe to do before ACTIVE)
        loadCachedDataInstantly();
        loadUniqueFeaturesData();
        
        // Initialize token system if not already
        if (!authReady) {
            initializeTokenSystem();
        }
        
        return { success: true };
    } catch (error) {
        debugLog('Error initializing groups page:', error);
        return { success: false, error };
    }
}

/**
 * Load user data in background
 */
export async function loadUserDataInBackground() {
    try {
        if (!sessionReceived) {
            return;
        }
        
        const response = await secureApiCall('/auth/me', { silent: true });
        
        if (response && response.success && response.data) {
            // Update session memory
            session.user = response.data;
            session.token = session.token; // Keep existing token
            
            GroupCore.currentUser = response.data;
            GroupCore.userData = {
                displayName: session.user.displayName || session.user.name || 'User',
                username: session.user.username || null,
                email: session.user.email || null,
                photoURL: session.user.photoURL || session.user.avatar || null
            };
            
            // DO NOT save to localStorage
            
            if (LifecycleState.isActive()) {
                updateUserUI();
            }
            authReady = true;
            __SESSION_READY__ = true;
        }
    } catch (error) {
        debugLog('Error loading user data:', error);
    }
}

/**
 * Update user UI elements
 */
export function updateUserUI() {
    try {
        if (!LifecycleState.isActive()) return;
        
        const userElements = document.querySelectorAll('.user-info, .user-avatar');
        userElements.forEach(el => {
            if (GroupCore.userData && GroupCore.userData.displayName) {
                el.textContent = GroupCore.userData.displayName;
            }
        });
    } catch (error) {
        debugLog('Error updating user UI:', error);
    }
}

// =============================================
// HELPER FUNCTIONS
// =============================================
function isGroupOperationReady() {
    return LifecycleState.isActive() && parentReady && sessionReady;
}

// =============================================
// WINDOW EXPOSURES (PRESERVED)
// =============================================
if (typeof window !== 'undefined') {
    const secureExpose = (name, fn) => {
        Object.defineProperty(window, name, {
            value: fn,
            writable: false,
            configurable: false,
            enumerable: true
        });
    };
    
    secureExpose('reactToMessage', reactToMessage);
    secureExpose('replyToMessage', replyToMessage);
    secureExpose('deleteMessage', deleteMessage);
    secureExpose('removeSelectedFriend', removeSelectedFriend);
    secureExpose('showGroupDetails', showGroupDetails);
    secureExpose('openGroupChat', openGroupChat);
    secureExpose('acceptGroupInvite', acceptGroupInvite);
    secureExpose('declineGroupInvite', declineGroupInvite);
    secureExpose('leaveGroupConfirm', leaveGroupConfirm);
    secureExpose('copyInviteLink', copyInviteLink);
    secureExpose('shareGroup', shareGroup);
    secureExpose('muteGroup', muteGroup);
    secureExpose('favoriteGroup', favoriteGroup);
    secureExpose('reportGroup', reportGroup);
    secureExpose('blockGroup', blockGroup);
    secureExpose('showGroupQRCode', showGroupQRCode);
    secureExpose('downloadQRCode', downloadQRCode);
    secureExpose('editGroupInfo', editGroupInfo);
    secureExpose('manageRoles', manageRoles);
    secureExpose('createEvent', createEvent);
    secureExpose('saveNewEvent', saveNewEvent);
    secureExpose('createPoll', createPoll);
    secureExpose('saveNewPoll', saveNewPoll);
    secureExpose('addPollOption', addPollOption);
    secureExpose('removePollOption', removePollOption);
    secureExpose('voteOnPoll', voteOnPoll);
    
    secureExpose('getAPIStats', () => API_WRAPPER.getStats());
    secureExpose('clearAPICache', () => API_WRAPPER.clearCache());
    secureExpose('getIframeDebug', () => false);
    secureExpose('getIframeState', () => ({
        lifecycle: LifecycleState.getState(),
        session: sessionReceived,
        sessionReady,
        registered: LifecycleState.isRegistered(),
        active: LifecycleState.isActive(),
        parentReady
    }));
}

// =============================================
// INVITATION WRAPPER FUNCTIONS
// export{} blocks cannot contain expressions — these plain functions
// delegate to GroupCore and can be listed as normal named exports.
// =============================================
async function inviteToGroup(groupId, inviteeId, role, msg) {
    return GroupCore.inviteToGroup(groupId, inviteeId, role, msg);
}
async function cancelInvitation(invitationId) {
    return GroupCore.cancelInvitation(invitationId);
}
async function getGroupInvitations(groupId) {
    return GroupCore.getGroupInvitations(groupId);
}


// Full per-key settings applier for group module
// ── TOP-LEVEL: accessible from all closures ──────────────────────────────────
function applySettingToGroupModule(section, key, value) {
    if (section === 'appearance') {
        if (key === 'theme') {
            var theme = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
            document.documentElement.setAttribute('data-theme', theme);
            document.body.setAttribute('data-theme', theme);
            if (typeof updateGroupThemeOnSettingChange === 'function') updateGroupThemeOnSettingChange(theme);
        }
        if (key === 'fontSize') document.documentElement.style.fontSize = value + 'px';
        if (key === 'language') { window.__appLanguage = value; document.documentElement.setAttribute('lang', value); }
        if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
        if (key === 'compactMode') { document.documentElement.setAttribute('data-compact', value ? 'true' : 'false'); document.body.classList.toggle('compact-mode', !!value); }
        if (key === 'animationsEnabled' || key === 'animations') { document.documentElement.setAttribute('data-animations', value ? 'true' : 'false'); document.body.classList.toggle('no-animations', !value); }
    }
    if (section === 'notifications') {
        if (key === 'soundEnabled' || key === 'notificationSound') window.__notificationSoundEnabled = value;
        if (key === 'vibrationEnabled' || key === 'notificationVibration') window.__vibrationEnabled = value;
        if (key === 'groupNotifications' || key === 'enableNotifications') window.__groupNotificationsEnabled = value;
        if (key === 'messageNotifications') window.__messageNotificationsEnabled = value;
        if (key === 'callNotifications') window.__callNotificationsEnabled = value;
        if (key === 'mentionNotifications') window.__mentionNotificationsEnabled = value;
        if (key === 'desktopEnabled') window.__desktopNotificationsEnabled = value;
    }
    if (section === 'privacy') {
        if (key === 'readReceipts')     { window.__SHOW_READ_RECEIPTS = value; document.documentElement.setAttribute('data-read-receipts', value ? 'true' : 'false'); }
        if (key === 'typingIndicators') { window.__SHOW_TYPING_INDICATORS = value; document.documentElement.setAttribute('data-typing-indicators', value ? 'true' : 'false'); }
        if (key === 'onlineStatus')     window.__showOnlineStatus = value;
        if (key === 'lastSeen')         window.__showLastSeen = value;
        if (key === 'whoCanAddMe')      window.__whoCanAddMe = value;
        if (key === 'canMessageMe')     window.__canMessageMe = value;
        if (key === 'contactDiscovery') window.__contactDiscovery = value;
    }
    if (section === 'groups') {
        if (key === 'showReadReceipts' || key === 'groupReadReceipts') window.__SHOW_READ_RECEIPTS = value;
        if (key === 'typingIndicators')  window.__SHOW_TYPING_INDICATORS = value;
        if (key === 'messageSound' || key === 'groupMessageSound') window.__GROUP_MESSAGE_SOUND = value;
        if (key === 'groupInvitations') window.__groupInvitations = value;
        if (key === 'groupAnnouncements') window.__groupAnnouncements = value;
        if (key === 'allowGroupCreation') window.__allowGroupCreation = value;
        if (key === 'maxGroupSize') window.__maxGroupSize = value;
        if (key === 'groupAdminPermissions') window.__groupAdminPermissions = value;
        if (key === 'whoCanAddToGroups') window.__whoCanAddToGroups = value;
        if (key === 'allowInviteLinks') window.__allowInviteLinks = value;
        if (key === 'mentionsOnly') window.__groupMentionsOnly = value;
        if (key === 'groupMessagePreview') window.__groupMessagePreview = value;
    }
    if (section === 'chat') {
        if (key === 'enterToSend' || key === 'enterKeySends') window.__enterToSend = value;
        if (key === 'showTimestamps') { window.__showTimestamps = value; document.documentElement.setAttribute('data-show-timestamps', value ? 'true' : 'false'); }
        if (key === 'allowReactions') { window.__allowReactions = value; document.documentElement.setAttribute('data-allow-reactions', value ? 'true' : 'false'); }
        if (key === 'mediaAutoDownload') window.__mediaAutoDownload = value;
        if (key === 'messagePreviews') window.__messagePreviews = value;
    }
    if (section === 'profile') {
        if (key === 'displayName') window.__currentUserDisplayName = value;
        if (key === 'photoUrl') window.__currentUserAvatar = value;
        if (key === 'lastSeen') window.__showLastSeen = value;
        if (key === 'profileVisibility') window.__profileVisibility = value;
        if (key === 'currentMood') window.__currentMood = value;
    }
    if (section === 'security') {
        if (key === 'sessionTimeout') window.__sessionTimeout = value;
    }
    if (section === 'mood') {
        if (key === 'currentMood') { window.__currentMood = value; document.documentElement.setAttribute('data-mood', value); }
        if (key === 'autoMoodDetection') window.__autoMoodDetection = value;
        if (key === 'shareMoodStatus') window.__shareMoodStatus = value;
        if (key === 'showMoodTo') window.__showMoodTo = value;
    }
    if (section === 'status') {
        if (key === 'whoCanViewMyStatus') window.__whoCanViewMyStatus = value;
        if (key === 'autoExpireStatus') window.__autoExpireStatus = value;
        if (key === 'allowStatusReplies') window.__allowStatusReplies = value;
        if (key === 'showStatusTo') window.__showStatusTo = value;
    }
    if (section === 'advanced') {
        if (key === 'developerMode' || key === 'developerTools') window.__developerMode = value;
        if (key === 'debugLogging' || key === 'debugMode') window.__debugLogging = value;
        if (key === 'performanceMode') { window.__performanceMode = value; document.documentElement.setAttribute('data-performance-mode', value ? 'true' : 'false'); }
        if (key === 'dataSaver') window.__dataSaver = value;
        if (key === 'offlineMode') window.__offlineMode = value;
        if (key === 'reduceMotion') { document.documentElement.setAttribute('data-reduce-motion', value ? 'true' : 'false'); document.body.classList.toggle('reduce-motion', !!value); }
        if (key === 'experimentalFeatures') window.__experimentalFeatures = value;
    }
    if (section === 'storage') {
        if (key === 'autoClearCache') window.__autoClearCache = value;
    }
}
// ===
// ===========================================
// COMPREHENSIVE EXPORTS - ALL REQUIRED EXPORTS
// =============================================
export {
    // Core modules
    LifecycleState,
    ParentMessaging,
    MessageRouter,
    SafeStorage,
    GroupCore,
    
    // State variables
    currentUser,
    userData,
    groups,
    myGroups,
    joinedGroups,
    groupInvites,
    adminGroups,
    selectedGroup,
    currentTypeFilter,
    currentSearchTerm,
    isLoadedFromLocalStorage,
    isMobile,
    pendingGroupActions,
    offlineOverlayDismissed,
    friends,
    selectedFriends,
    groupMessages,
    groupUnreadCounts,
    groupTypingUsers,
    currentChatGroup,

    // Feature variables
    groupPurposes,
    groupMoods,
    postingRules,
    participationModes,
    groupTopics,
    groupTypes,
    groupThemes,
    groupRoles,

    // Chat & Call variables
    chatMessagesList,
    isTyping,
    callInProgress,
    callStartTime,
    callTimer,
    localStream,
    peerConnections,

    // Unique features state
    currentParticipationMode,
    isSilentMode,
    isAnonymousMode,
    groupNotes,
    groupEvents,
    transparencyLog,
    energySuggestions,

    // LOCAL STORAGE KEYS
    LOCAL_STORAGE_KEYS,

    // Flags and state
    isPageInitialized,
    authReady,
    authCheckComplete,
    backgroundSyncRunning,
    syncIntervalId,
    apiInitialized,
    tokenReadyPromise,
    tokenReadyResolve,
    tokenReadyReject,
    tokenQueue,
    isProcessingTokenQueue,
    
    // Session state
    session,
    sessionReady,
    
    // ===== FUNCTIONS - MAKE SURE ALL ARE HERE =====
    
    // Token management
    getCurrentUser,
    getCurrentUserLocal,
    getUnifiedToken,
    saveUnifiedToken,
    initializeTokenSystem,
    waitForTokenReady,
    
    // API functions
    queueApiCall,
    processTokenQueue,
    secureApiCall,
    safeApiCall,
    
    // Core group functions
    loadCachedDataInstantly,
    loadUniqueFeaturesData,
    calculateGroupPulse,
    updateGroupCounts,
    updateCurrentSection,
    renderAllGroups,
    renderMyGroups,
    renderJoinedGroups,
    renderGroupInvites,
    renderAdminGroups,
    addGroupItem,
    handleGroupAction,
    
    // Background sync
    startBackgroundSync,
    backgroundSyncWithServer,
    
    // Chat and group management
    openGroupChat,
    updateChatHeaderUniqueFeatures,
    checkPostingRules,
    updateParticipationModeButtons,
    loadUniqueFeaturesPanels,
    loadGroupNotes,
    loadGroupEvents,
    loadTransparencyLog,
    generateInitialTransparencyLog,
    analyzeGroupEnergy,
    closeGroupChatMobile,
    hideAllPanels,
    loadGroupChatMessages,
    addMessageToChat,
    addSystemMessage,
    saveMessageToCache,
    sendGroupMessage,
    sendGroupMessageOnline,
    toggleSilentMode,
    toggleAnonymousMode,
    reactToMessage,
    replyToMessage,
    deleteMessage,
    setupTypingListener,
    stopTypingIndicator,
    adjustTextareaHeight,
    formatMessageTime,
    
    // Admin management
    openAdminManagement,
    loadGroupMembersForManagement,
    renderMembersList,
    handleMemberAction,
    logTransparencyAction,
    loadGroupSettingsForManagement,
    loadUniqueFeaturesForManagement,
    updatePostingRulesUI,
    saveGroupSettings,
    
    // Friend selection
    showFriendSelection,
    renderFriendSelection,
    updateSelectedFriendsList,
    removeSelectedFriend,

    // Invitation helpers (new)
    inviteToGroup,
    cancelInvitation,
    getGroupInvitations,
    
    // Group creation and joining
    createGroupOnline,
    joinGroupOnline,
    leaveGroupOnline,
    acceptGroupInvite,
    declineGroupInvite,
    leaveGroupConfirm,
    
    // Group details
    showGroupDetails,
    loadGroupDetails,
    showGroupOptions,
    viewGroupNotes,
    viewGroupEvents,
    viewGroupAnalytics,
    loadGroupAnalytics,
    renderAnalyticsChart,
    changePurposeMood,
    viewChangeHistory,
    showOptionsModal,
    shareGroup,
    muteGroup,
    favoriteGroup,
    reportGroup,
    blockGroup,
    showGroupQRCode,
    downloadQRCode,
    copyInviteLink,
    inviteMembers,
    editGroupInfo,
    manageRoles,
    createEvent,
    saveNewEvent,
    createPoll,
    addPollOption,
    removePollOption,
    saveNewPoll,
    voteOnPoll,
    showGroupInviteDetails,
    
    // Member management
    getUserRoleInGroup,
    isUserAdmin,
    canUserManageGroup,
    canUserAddMembers,
    canUserRemoveMembers,
    canUserChangeRole,
    canUserDeleteGroup,
    addMemberToGroup,
    removeMemberFromGroup,
    changeMemberRole,
    deleteGroup,
    updateGroupInAllLists,
    addMemberOnline,
    removeMemberOnline,
    changeMemberRoleOnline,
    deleteGroupOnline,
    
    // Data sync
    syncGroupsFromServer,
    syncGroupInvitesFromServer,
    syncUniqueFeaturesData,
    matchesFilters,
    matchesSearch,
    filterGroupsByType,
    searchGroups,
    saveGroupsToLocalStorage,
    
    // Utility functions
    formatTimeAgo,
    formatDate,
    showNotification,
    processPendingOfflineActions,
    updateCreateGroupPostingRulesUI
};
// =============================================
// SETTINGS CACHE BOOTSTRAP - OFFLINE-FIRST
// =============================================
(function bootstrapSettingsFromCache() {
    try {
        var cached = localStorage.getItem('knecta_settings_cache');
        if (!cached) return;
        var parsed = JSON.parse(cached);
        var settings = (parsed && parsed.data) ? parsed.data : parsed;
        if (!settings || typeof settings !== 'object') return;
        if (parsed.timestamp && (Date.now() - parsed.timestamp) > 86400000) return;
        Object.entries(settings).forEach(function(sectionEntry) {
            var section = sectionEntry[0], sectionVal = sectionEntry[1];
            if (!sectionVal || typeof sectionVal !== 'object') return;
            Object.entries(sectionVal).forEach(function(keyEntry) {
                try { applySettingToGroupModule(section, keyEntry[0], keyEntry[1]); } catch(e) {}
            });
        });
        console.log('[group-core] ✅ Settings bootstrapped from cache');
    } catch(e) {}
    window.addEventListener('online', function() {
        try {
            window.parent && window.parent.postMessage({ type: 'CHILD_READY', module: 'group', source: 'group', timestamp: Date.now() }, '*');
        } catch(e) {}
    });
})();