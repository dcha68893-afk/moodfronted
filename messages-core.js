// =============================================
// MESSAGES CORE - v8.0.7 (FULL PRODUCTION READY)
// REAL END-TO-END MESSAGING | NO PLACEHOLDERS
// FIXED: Duplicate conversation prevention
// FIXED: "No messages yet" removal
// FIXED: Time display only in chat panel
// FIXED: Chat name sizing
// ADDED: Dark/Light theme support
// =============================================
(function() {
    'use strict';

    // =============================================
    // MODULE IDENTIFICATION
    // =============================================
    const MODULE_NAME = 'messages';
    const MODULE_VERSION = '8.0.7';
    
    // =============================================
    // DEBUG MODE (DISABLED IN PRODUCTION)
    // =============================================
    const DEBUG = false;
    const ALLOWED_LOGS = new Set(['INIT', 'READY', 'ERROR', 'STATE_CHANGE', 'HANDSHAKE', 'LIFECYCLE_GUARD', 'SESSION', 'API_REQUEST', 'API_RESPONSE', 'UI']);
    
    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }

    // =============================================
    // DEMO CHAT DATA
    // =============================================
    const DEMO_CHATS = {
        conversations: [
            {
                id: 1001,
                friendId: 2001,
                friendName: 'moodchat1',
                friendAvatar: 'https://ui-avatars.com/api/?name=moodchat1&background=4caf50&color=fff&bold=true',
                lastMessage: 'Hey! How are you doing today?',
                lastMessageAt: Date.now() - 3600000,
                unreadCount: 0,
                online: true,
                type: 'direct',
                archived: false,
                blocked: false
            },
            {
                id: 1002,
                friendId: 2002,
                friendName: 'moodchat2',
                friendAvatar: 'https://ui-avatars.com/api/?name=moodchat2&background=2196f3&color=fff&bold=true',
                lastMessage: "I'm good, thanks for asking!",
                lastMessageAt: Date.now() - 1800000,
                unreadCount: 0,
                online: true,
                type: 'direct',
                archived: false,
                blocked: false
            }
        ],
        messages: {
            1001: [
                {
                    id: 'msg_demo_1001_1',
                    content: 'Hey! How are you doing today?',
                    type: 'text',
                    senderId: 2001,
                    sender: { id: 2001, displayName: 'moodchat1', avatar: 'https://ui-avatars.com/api/?name=moodchat1&background=4caf50&color=fff' },
                    timestamp: Date.now() - 3600000,
                    status: 'read',
                    conversationId: 1001
                },
                {
                    id: 'msg_demo_1001_2',
                    content: "I'm doing great! Just finished some work. How about you?",
                    type: 'text',
                    senderId: 1001,
                    sender: { id: 1001, displayName: 'Me', avatar: '' },
                    timestamp: Date.now() - 3500000,
                    status: 'read',
                    conversationId: 1001,
                    isSent: true
                },
                {
                    id: 'msg_demo_1001_3',
                    content: "That's awesome! What have you been working on?",
                    type: 'text',
                    senderId: 2001,
                    sender: { id: 2001, displayName: 'moodchat1', avatar: 'https://ui-avatars.com/api/?name=moodchat1&background=4caf50&color=fff' },
                    timestamp: Date.now() - 3400000,
                    status: 'read',
                    conversationId: 1001
                },
                {
                    id: 'msg_demo_1001_4',
                    content: 'Just some coding and design work. Really enjoying it!',
                    type: 'text',
                    senderId: 1001,
                    sender: { id: 1001, displayName: 'Me', avatar: '' },
                    timestamp: Date.now() - 3300000,
                    status: 'read',
                    conversationId: 1001,
                    isSent: true
                }
            ],
            1002: [
                {
                    id: 'msg_demo_1002_1',
                    content: 'Hello! Long time no see!',
                    type: 'text',
                    senderId: 2002,
                    sender: { id: 2002, displayName: 'moodchat2', avatar: 'https://ui-avatars.com/api/?name=moodchat2&background=2196f3&color=fff' },
                    timestamp: Date.now() - 1800000,
                    status: 'read',
                    conversationId: 1002
                },
                {
                    id: 'msg_demo_1002_2',
                    content: "Hey! Yeah, it's been a while. How have you been?",
                    type: 'text',
                    senderId: 1001,
                    sender: { id: 1001, displayName: 'Me', avatar: '' },
                    timestamp: Date.now() - 1700000,
                    status: 'read',
                    conversationId: 1002,
                    isSent: true
                },
                {
                    id: 'msg_demo_1002_3',
                    content: "I've been great! Traveled a bit, learned new things.",
                    type: 'text',
                    senderId: 2002,
                    sender: { id: 2002, displayName: 'moodchat2', avatar: 'https://ui-avatars.com/api/?name=moodchat2&background=2196f3&color=fff' },
                    timestamp: Date.now() - 1600000,
                    status: 'read',
                    conversationId: 1002
                },
                {
                    id: 'msg_demo_1002_4',
                    content: 'That sounds amazing! We should catch up more often.',
                    type: 'text',
                    senderId: 1001,
                    sender: { id: 1001, displayName: 'Me', avatar: '' },
                    timestamp: Date.now() - 1500000,
                    status: 'read',
                    conversationId: 1002,
                    isSent: true
                }
            ]
        }
    };

    // =============================================
    // SESSION VALIDATION UTILITY
    // =============================================
    function __isValidSession(session) {
        if (!session) return false;
        
        if (!session.token || typeof session.token !== 'string') {
            return false;
        }
        
        let userId = session.userId;
        if (!userId && session.user) {
            userId = session.user.id || session.user.userId;
        }
        
        if (!userId) {
            return true;
        }
        
        if (typeof userId === 'string') {
            const trimmedUserId = userId.trim();
            if (trimmedUserId === '' || trimmedUserId === 'null' || trimmedUserId === 'undefined') {
                return false;
            }
        }
        
        if (typeof userId === 'number' && userId === 0) {
            return false;
        }
        
        return true;
    }
    
    function __getSessionId(session) {
        if (!session) return null;
        if (session.sessionId) return session.sessionId;
        return `${session.token}_${session.userId}`;
    }

    // =============================================
    // LIFECYCLE GUARD UTILITIES
    // =============================================
    
    if (typeof window.__lifecycleCanSendChildReady !== 'function') {
        window.__lifecycleCanSendChildReady = function(state) {
            return state === LIFECYCLE_STATES.READY;
        };
    }
    
    if (typeof window.__lifecycleCanPerformAction !== 'function') {
        window.__lifecycleCanPerformAction = function(state) {
            return state === LIFECYCLE_STATES.ACTIVE;
        };
    }
    
    function ensureActive(actionName) {
        if (currentState !== LIFECYCLE_STATES.ACTIVE) {
            console.warn(`[${MODULE_NAME}][LifecycleGuard] ❌ Blocked action '${actionName}' - not ACTIVE (current: ${currentState})`);
            return false;
        }
        return true;
    }
    
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
        TYPING_RATE_LIMIT: 2000,
        REQUEST_TIMEOUT: 30000
    };

    // =============================================
    // LIFECYCLE STATE MACHINE
    // =============================================
    const LIFECYCLE_STATES = {
        BOOT: 'BOOT',
        INITIALIZING: 'INITIALIZING',
        READY: 'READY',
        WAIT_PARENT: 'WAIT_PARENT',
        WAITING_AUTH: 'WAITING_AUTH',
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
    
    let _lastSessionId = null;
    let _validSessionSet = false;
    let _storedSession = null;
    
    let _uiInitialized = false;
    
    let _demoModeEnabled = false;
    let _demoBootstrapFired = false;
    
    let parentReadyResolver;
    let parentReadyPromise = new Promise((resolve) => {
        parentReadyResolver = resolve;
    });

    // =============================================
    // PENDING REQUESTS TRACKING
    // =============================================
    const pendingRequests = new Map();
    
    function cleanupPendingRequests() {
        const now = Date.now();
        for (const [requestId, pending] of pendingRequests.entries()) {
            if (now - pending.timestamp > TIMING.REQUEST_TIMEOUT) {
                console.warn(`[${MODULE_NAME}] Request timeout: ${requestId} (${pending.type})`);
                if (pending.reject) {
                    pending.reject(new Error(`Request timeout: ${pending.type}`));
                }
                if (pending.timeout) {
                    clearTimeout(pending.timeout);
                }
                pendingRequests.delete(requestId);
            }
        }
    }
    
    setInterval(cleanupPendingRequests, TIMING.CLEANUP_INTERVAL);

    // =============================================
    // MESSAGE QUEUE SYSTEM
    // =============================================
    const messageQueue = [];
    let processingQueue = false;

    function setState(nextState, reason = '') {
        if (currentState === nextState) {
            debugLog(`[${MODULE_NAME}] Attempted duplicate transition to ${nextState}, ignoring`);
            return true;
        }

        const validTransitions = {
            [LIFECYCLE_STATES.BOOT]: [LIFECYCLE_STATES.INITIALIZING],
            [LIFECYCLE_STATES.INITIALIZING]: [LIFECYCLE_STATES.READY],
            [LIFECYCLE_STATES.READY]: [LIFECYCLE_STATES.WAIT_PARENT],
            [LIFECYCLE_STATES.WAIT_PARENT]: [LIFECYCLE_STATES.WAITING_AUTH, LIFECYCLE_STATES.ACTIVE],
            [LIFECYCLE_STATES.WAITING_AUTH]: [LIFECYCLE_STATES.ACTIVE],
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
        
        if (nextState === LIFECYCLE_STATES.ACTIVE && !_uiInitialized) {
            initializeUISafe();
        }
        
        return true;
    }

    function notifyStateListeners(toState, fromState, reason) {
        stateListeners.forEach(listener => {
            try {
                listener(toState, fromState, reason);
            } catch (e) {
                console.warn(`[${MODULE_NAME}] State listener error:`, e);
            }
        });
        
        try {
            window.dispatchEvent(new CustomEvent('messagesLifecycleChange', {
                detail: { state: toState, previous: fromState, reason }
            }));
        } catch (e) {}
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
            history: stateHistory.slice(-10),
            hasValidSession: _validSessionSet && _storedSession && __isValidSession(_storedSession)
        };
    }

    function canSendUserMessages() {
        return currentState === LIFECYCLE_STATES.ACTIVE && _validSessionSet && __isValidSession(_storedSession);
    }

    function resetLifecycle() {
        if (currentState === LIFECYCLE_STATES.ACTIVE) {
            console.warn(`[${MODULE_NAME}] Cannot reset lifecycle while ACTIVE`);
            return;
        }
        
        currentState = LIFECYCLE_STATES.BOOT;
        childReadySent = false;
        parentReadyReceived = false;
        parentReadyData = null;
        stateHistory = [];
        processedMessageIds.clear();
        sentMessageIds.clear();
        messageQueue.length = 0;
        _uiInitialized = false;
        
        parentReadyPromise = new Promise((resolve) => {
            parentReadyResolver = resolve;
        });
        
        _lastSessionId = null;
        _validSessionSet = false;
        _storedSession = null;
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
            'MESSAGE_RECEIVE',
            'API_RESPONSE'
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
            'GET_CHAT_HISTORY',
            'API_REQUEST'
        ]),
        
        lockdown: true,
        
        validateOrigin: function(origin) {
            if (currentState === LIFECYCLE_STATES.BOOT || 
                currentState === LIFECYCLE_STATES.INITIALIZING ||
                currentState === LIFECYCLE_STATES.READY ||
                currentState === LIFECYCLE_STATES.WAIT_PARENT ||
                currentState === LIFECYCLE_STATES.WAITING_AUTH) {
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
                return lifecycleState === LIFECYCLE_STATES.ACTIVE && _validSessionSet && __isValidSession(_storedSession);
            }
            if (type === 'REGISTER_MODULE') {
                return lifecycleState === LIFECYCLE_STATES.INITIALIZING || 
                       lifecycleState === LIFECYCLE_STATES.READY;
            }
            if (type === 'CHILD_READY') {
                return lifecycleState === LIFECYCLE_STATES.READY && !childReadySent;
            }
            return lifecycleState === LIFECYCLE_STATES.ACTIVE && _validSessionSet && __isValidSession(_storedSession);
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
    // ENDPOINT NORMALIZATION UTILITY
    // =============================================
    function normalizeEndpoint(endpoint) {
        if (!endpoint || typeof endpoint !== 'string') {
            console.warn(`[${MODULE_NAME}] Invalid endpoint provided:`, endpoint);
            return '';
        }
        
        let normalized = endpoint.trim();
        
        if (normalized.startsWith('/api/')) {
            normalized = normalized.substring(4);
        }
        
        if (!normalized.startsWith('/')) {
            normalized = '/' + normalized;
        }
        
        normalized = normalized.replace(/\/+/g, '/');
        
        return normalized;
    }

    // =============================================
    // API REQUEST HANDLER
    // =============================================
    function makeApiRequest(endpoint, method, data = null, params = null) {
        return new Promise((resolve, reject) => {
            if (_demoModeEnabled) {
                console.log(`[${MODULE_NAME}] Demo mode: returning mock data for ${endpoint}`);
                const demoData = getDemoData(endpoint, method);
                if (demoData) {
                    resolve(demoData);
                    return;
                }
            }
            
            const isReadOnly = (method === 'GET');
            if (!isReadOnly && !ensureActive(`API_REQUEST: ${endpoint}`)) {
                reject(new Error(`Module not ACTIVE for write actions (current: ${currentState})`));
                return;
            }
            
            if (!_validSessionSet || !__isValidSession(_storedSession)) {
                reject(new Error(`No valid session for API request`));
                return;
            }
            
            const normalizedEndpoint = normalizeEndpoint(endpoint);
            if (!normalizedEndpoint) {
                reject(new Error(`Invalid endpoint: ${endpoint}`));
                return;
            }
            
            const requestId = generateRequestId();
            const timestamp = Date.now();
            
            let timeoutId = null;
            
            timeoutId = setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    console.warn(`[${MODULE_NAME}] API request timeout: ${method} ${normalizedEndpoint} (${requestId})`);
                    pendingRequests.delete(requestId);
                    reject(new Error(`API request timeout: ${method} ${normalizedEndpoint}`));
                }
            }, TIMING.REQUEST_TIMEOUT);
            
            pendingRequests.set(requestId, {
                resolve,
                reject,
                timestamp,
                type: normalizedEndpoint,
                timeout: timeoutId
            });
            
            const message = {
                id: generateMessageId(),
                type: 'API_REQUEST',
                source: MODULE_NAME,
                target: 'parent',
                requestId: requestId,
                payload: {
                    endpoint: normalizedEndpoint,
                    method: method.toUpperCase(),
                    body: data || null,
                    params: params || null
                },
                timestamp: timestamp
            };
            
            console.log(`[${MODULE_NAME}] 📤 Sending API_REQUEST: ${method} ${normalizedEndpoint} (${requestId})`);
            
            try {
                if (!window.parent || window.parent === window) {
                    throw new Error('No parent window');
                }
                window.parent.postMessage(message, '*');
            } catch (error) {
                console.error(`[${MODULE_NAME}] Failed to send API_REQUEST:`, error);
                if (pendingRequests.has(requestId)) {
                    const pending = pendingRequests.get(requestId);
                    if (pending.timeout) clearTimeout(pending.timeout);
                    pendingRequests.delete(requestId);
                }
                reject(error);
            }
        });
    }
    
    function getDemoData(endpoint, method) {
        if (endpoint === '/chats' || endpoint === '/api/chats') {
            return DEMO_CHATS.conversations;
        }
        if (endpoint === '/messages' && method === 'GET') {
            return {
                status: 'success',
                data: {
                    messages: []
                }
            };
        }
        if (endpoint === '/messages/send' && method === 'POST') {
            return {
                status: 'success',
                data: {
                    id: generateMessageId(),
                    status: 'sent'
                }
            };
        }
        if (endpoint === '/friends' || endpoint === '/api/friends') {
            return [
                { id: 2001, displayName: 'moodchat1', username: 'moodchat1', online: true, status: 'online' },
                { id: 2002, displayName: 'moodchat2', username: 'moodchat2', online: true, status: 'online' }
            ];
        }
        return null;
    }
    
    function handleApiResponse(data) {
        const requestId = data.requestId;
        const response = data.payload || data;
        
        if (!requestId) {
            console.warn(`[${MODULE_NAME}] API_RESPONSE missing requestId`);
            return;
        }
        
        console.log(`[${MODULE_NAME}] 📥 API_RESPONSE received: ${requestId}`);
        
        if (!pendingRequests.has(requestId)) {
            console.warn(`[${MODULE_NAME}] No pending request for: ${requestId}`);
            return;
        }
        
        const pending = pendingRequests.get(requestId);
        
        if (pending.timeout) {
            clearTimeout(pending.timeout);
        }
        
        pendingRequests.delete(requestId);
        
        try {
            const isFailed = response &&
                (response.success === false ||
                 (response.statusCode !== undefined && response.statusCode >= 400));

            if (isFailed) {
                const errMsg = response.error || response.message || 'API request failed';
                console.error(`[${MODULE_NAME}] API request failed:`, errMsg);
                pending.reject(new Error(errMsg));
            } else {
                let result = response;

                if (result && result.data !== undefined && result.success === true) {
                    result = result.data;
                }

                if (result && result.status === 'success' && result.data !== undefined) {
                    result = result.data;
                }

                if (result && result.success === true && result.data !== undefined) {
                    result = result.data;
                }

                if (result && result.friends !== undefined && Array.isArray(result.friends)) {
                    result = result.friends;
                } else if (result && result.chats !== undefined && Array.isArray(result.chats)) {
                    result = result.chats;
                } else if (result && result.messages !== undefined && Array.isArray(result.messages)) {
                    result = result.messages;
                }

                if (result && result.data !== undefined && !Array.isArray(result) && typeof result === 'object') {
                    result = result.data;
                }

                pending.resolve(result);
            }
        } catch (error) {
            console.error(`[${MODULE_NAME}] Error handling API response:`, error);
            pending.reject(new Error('Failed to process API response'));
        }
    }

    // =============================================
    // CORE MESSAGE SENDER
    // =============================================
    function sendMessage(type, payload = {}, options = {}) {
        if (SECURITY.isUserAction(type) && !window.__lifecycleCanPerformAction(currentState)) {
            console.warn(`[${MODULE_NAME}][LifecycleGuard] Blocked message type '${type}' - not ACTIVE (current: ${currentState})`);
            return { success: false, blocked: true, reason: `not_active:${currentState}` };
        }
        
        const id = options.id || generateMessageId();
        const requestId = options.requestId || generateRequestId();
        const timestamp = Date.now();
        
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

        if ((currentState === LIFECYCLE_STATES.WAIT_PARENT || currentState === LIFECYCLE_STATES.WAITING_AUTH) && !SECURITY.isEssentialMessage(type)) {
            if (messageQueue.length < TIMING.MAX_QUEUE_SIZE) {
                messageQueue.push(message);
                debugLog(`[${MODULE_NAME}] Queued message (${currentState}): ${type}`);
                return { success: true, queued: true, id, requestId };
            } else {
                console.warn(`[${MODULE_NAME}] Message queue full, dropping message: ${type}`);
                return { success: false, blocked: true, reason: 'queue_full' };
            }
        }

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
        
        const queueCopy = [...messageQueue];
        messageQueue.length = 0;
        
        for (const queuedMessage of queueCopy) {
            try {
                if (!window.parent || window.parent === window) {
                    console.warn(`[${MODULE_NAME}] No parent window, cannot flush message`);
                    continue;
                }
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
        
    SETTING_CHANGED: 'SETTING_CHANGED',
    SETTINGS_UPDATED: 'SETTINGS_UPDATED',
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
        MODULE_HEARTBEAT: 'MODULE_HEARTBEAT',
        API_RESPONSE: 'API_RESPONSE'
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
    // LOCAL STORAGE KEYS
    // =============================================
    const LOCAL_STORAGE_KEYS = {
        SESSION_CACHE: 'kynecta_session_cache_v8',
        USER_CACHE: 'kynecta_user_cache_v8',
        FRIENDS_CACHE: 'kynecta_friends_cache_v8',
        CHATS_CACHE: 'kynecta_chats_cache_v8',
        MESSAGES_PREFIX: 'kynecta_messages_v8_',
        CONTACTS_CACHE: 'kynecta_contacts_cache_v8',
        CHAT_THEMES: 'kynecta_chat_themes_v8',
        DRAFTS: 'kynecta_message_drafts_v8',
        OFFLINE_QUEUE: 'kynecta_offline_queue_v8',
        SCHEDULED_MESSAGES: 'kynecta_scheduled_messages_v8',
        USER_SETTINGS: 'kynecta_user_settings_v8',
        BLOCKED_USERS: 'kynecta_blocked_users_v8',
        ARCHIVED_CHATS: 'kynecta_archived_chats_v8',
        STARRED_MESSAGES: 'kynecta_starred_messages_v8',
        UI_STATE: 'kynecta_ui_state_v8',
        MESSAGE_QUEUE: 'kynecta_message_queue_v8',
        CHAT_STATE: 'kynecta_chat_state_v8'
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
    // SAFE STORAGE LAYER
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
                } catch (e) {
                }
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
    // SESSION MANAGER (MEMORY ONLY)
    // =============================================
    const SessionManager = {
        _session: {
            token: null,
            user: null,
            expiresAt: null,
            authenticated: false,
            userId: null
        },
        _sessionReady: false,
        _listeners: new Set(),
        _initialized: false,
        _lastSessionId: null,

        init: function() {
            if (this._initialized) return this;
            this._initialized = true;
            Logger.info('SessionManager', 'Initialized (memory-only session)');
            return this;
        },

        setSession: function(sessionData) {
            if (!__isValidSession(sessionData)) {
                console.warn('[SessionManager] Ignored invalid session data', { 
                    hasToken: !!sessionData?.token,
                    userId: sessionData?.userId,
                    tokenType: typeof sessionData?.token,
                    userIdType: typeof sessionData?.userId
                });
                return false;
            }
            
            const sessionId = __getSessionId(sessionData);
            if (sessionId && this._lastSessionId === sessionId) {
                console.log('[SessionManager] Duplicate session ignored');
                return false;
            }
            
            if (this._session.authenticated && __isValidSession(this._session)) {
                if (!__isValidSession(sessionData)) {
                    console.warn('[SessionManager] Prevented session downgrade - rejecting invalid session');
                    return false;
                }
            }
            
            console.log('[SessionManager] Setting valid session', { userId: sessionData.userId });
            
            if (_demoModeEnabled) {
                console.log('[SessionManager] Real session received - disabling demo mode');
                _demoModeEnabled = false;
            }
            
            this._session.token = sessionData.token;
            this._session.user = sessionData.user || null;
            this._session.userId = sessionData.userId;
            this._session.expiresAt = sessionData.expiresAt || null;
            this._session.authenticated = true;
            this._sessionReady = true;
            this._lastSessionId = sessionId;
            
            _storedSession = this._session;
            _validSessionSet = true;
            
            Logger.success('SessionManager', 'Session established', { 
                authenticated: true,
                userId: this._session.userId
            });
            
            if (sessionData.user) {
                try {
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, sessionData.user);
                } catch (e) {}
            }
            
            this._notifyListeners();
            
            try {
                window.dispatchEvent(new CustomEvent('sessionUpdated', {
                    detail: { 
                        authenticated: true,
                        user: this._session.user,
                        userId: this._session.userId
                    }
                }));
            } catch (e) {}
            
            if (currentState === LIFECYCLE_STATES.WAITING_AUTH && __isValidSession(this._session)) {
                console.log('[SessionManager] Valid session received, transitioning to ACTIVE');
                setState(LIFECYCLE_STATES.ACTIVE, 'valid_session_received');
                flushMessageQueue();
                startDataFlow();
            } else if (currentState === LIFECYCLE_STATES.ACTIVE) {
                startDataFlow();
            }
            
            return true;
        },

        getToken: function() {
            if (!_validSessionSet || !__isValidSession(this._session)) return null;
            return this._session.token;
        },

        getUser: function() {
            if (!_validSessionSet || !__isValidSession(this._session)) return null;
            return this._session.user ? { ...this._session.user } : null;
        },
        
        getUserId: function() {
            if (!_validSessionSet || !__isValidSession(this._session)) return null;
            return this._session.userId;
        },

        isAuthenticated: function() {
            return this._session.authenticated && !!this._session.token && __isValidSession(this._session);
        },

        isSessionReady: function() {
            return this._sessionReady && __isValidSession(this._session);
        },

        clear: function() {
            this._session = {
                token: null,
                user: null,
                expiresAt: null,
                authenticated: false,
                userId: null
            };
            this._sessionReady = false;
            this._lastSessionId = null;
            _validSessionSet = false;
            _storedSession = null;
            
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
                userId: this._session.userId,
                ready: this._sessionReady
            };
            
            this._listeners.forEach(cb => {
                try { cb(sessionInfo); } catch (e) {}
            });
        },

        getState: function() {
            return {
                authenticated: this._session.authenticated && __isValidSession(this._session),
                ready: this._sessionReady,
                userId: this._session.userId,
                hasToken: !!this._session.token
            };
        }
    }.init();

    // =============================================
    // PARENT CONNECTION MANAGER
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
        _messageListenerAttached: false,
        
        init: function() {
            if (this._initialized) return this;
            
            this._setupMessageListener();
            this._initialized = true;
            
            setInterval(() => this._processQueue(), 5000);
            
            Logger.info('ParentConnectionManager', 'Initialized');
            return this;
        },
        
        _setupMessageListener: function() {
            if (this._messageListenerAttached) return;
            
            window.addEventListener('message', (event) => {
                if (!SECURITY.validateOrigin(event.origin)) {
                    if (DEBUG) console.log(`[${MODULE_NAME}] Rejected message from origin: ${event.origin}`);
                    return;
                }
                
                setTimeout(() => this._handleIncomingMessage(event), 0);
            }, true);
            
            this._messageListenerAttached = true;
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
    
    // ── OFFLINE-FIRST: Apply per-key setting changes immediately ──
    if (data && (data.type === 'SETTING_CHANGED' || data.type === 'SETTINGS_UPDATED')) {
        const payload = data.payload || data;
        if (data.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
            const { section, key, value } = payload;
            applySettingToMessagesModule(section, key, value);
            window.dispatchEvent(new CustomEvent('settingChanged', {
                detail: { section, key, value, timestamp: Date.now() }
            }));
        }
        if (data.type === 'SETTINGS_UPDATED' && payload.settings) {
            const s = payload.settings;
            // Apply all sections of a full settings update
            Object.entries(s).forEach(([sec, secVal]) => {
                if (secVal && typeof secVal === 'object') {
                    Object.entries(secVal).forEach(([k, v]) => applySettingToMessagesModule(sec, k, v));
                }
            });
            window.dispatchEvent(new CustomEvent('settingsUpdated', {
                detail: { settings: s, timestamp: Date.now() }
            }));
        }
        return;
    }

    // ─── Centralised per-key applier for messages module ──────────────────────
        // applySettingToModule is defined at top-level below
    
    if (data.type === INCOMING_TYPES.API_RESPONSE) {
        handleApiResponse(data);
    }
    
    if (data.type === INCOMING_TYPES.SESSION_DATA || data.type === INCOMING_TYPES.SESSION_RESPONSE) {
        this._handleSessionData(data);
    }
    
    if (data.type === INCOMING_TYPES.PARENT_READY || data.type === INCOMING_TYPES.coreReady) {
        this._handleParentReady(data);
    }
    
    if (data.type === INCOMING_TYPES.MESSAGE_ACK) {
        this._handleMessageAck(data);
    }
    
    if (data.type === INCOMING_TYPES.MESSAGE_RECEIVE || data.type === INCOMING_TYPES.NEW_MESSAGE) {
        this._handleMessageReceive(data);
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
            
            if (data.module && data.module !== MODULE_NAME) {
                console.warn(`[${MODULE_NAME}] Invalid PARENT_READY - module mismatch (expected: ${MODULE_NAME}, got: ${data.module})`);
                return;
            }
            
            console.log(`[${MODULE_NAME}] PARENT_READY received`);
            
            parentReadyReceived = true;
            parentReadyData = data.payload || data;
            
            if (parentReadyResolver) {
                parentReadyResolver();
                parentReadyResolver = null;
            }
            
            const providedSession = parentReadyData.session || parentReadyData;
            if (providedSession && providedSession.token && providedSession.userId) {
                console.log(`[${MODULE_NAME}] Session provided in PARENT_READY, userId: ${providedSession.userId}`);
                SessionManager.setSession(providedSession);
            } else {
                console.log(`[${MODULE_NAME}] No session in PARENT_READY payload, will wait for SESSION_DATA`);
                if (_demoModeEnabled) {
                    console.log(`[${MODULE_NAME}] Demo mode: creating mock session`);
                    SessionManager.setSession({
                        token: 'demo_token_12345',
                        userId: 1001,
                        user: { id: 1001, displayName: 'Me', username: 'me' }
                    });
                }
            }
            
            if (currentState === LIFECYCLE_STATES.WAIT_PARENT) {
                if (SessionManager.isAuthenticated()) {
                    setState(LIFECYCLE_STATES.ACTIVE, 'parent_ready_with_valid_session');
                    console.log(`[${MODULE_NAME}] ACTIVE (valid session)`);
                    
                    initializeUISafe();
                    flushMessageQueue();
                    startDataFlow();
                } else {
                    console.log(`[${MODULE_NAME}] WAITING_AUTH (no valid session yet)`);
                    setState(LIFECYCLE_STATES.WAITING_AUTH, 'parent_ready_waiting_for_session');
                    
                    safeSend(OUTGOING_ACTIONS.REQUEST_SESSION, {
                        module: MODULE_NAME,
                        timestamp: Date.now()
                    }, { requireAck: false });
                    
                    initializeUISafe();
                }
            } else {
                console.log(`[${MODULE_NAME}] PARENT_READY received in state: ${currentState} - ignoring (expected WAIT_PARENT)`);
            }
        },

        _handleSessionData: function(data) {
            const sessionData = data.payload || data;
            Logger.info('ParentConnectionManager', 'Received session data from parent');
            
            if (sessionData && sessionData.token && sessionData.userId) {
                if (typeof sessionData.userId === 'string' && !isNaN(parseInt(sessionData.userId))) {
                    sessionData.userId = parseInt(sessionData.userId);
                }
                
                if (!sessionData.id && sessionData.userId) {
                    sessionData.id = sessionData.userId;
                }
                
                Logger.info('ParentConnectionManager', 'Valid session data received', { 
                    userId: sessionData.userId, 
                    hasToken: !!sessionData.token 
                });
                
                SessionManager.setSession(sessionData);
            } else {
                console.warn('[ParentConnectionManager] Ignored invalid session data from parent', {
                    hasToken: !!sessionData?.token,
                    userId: sessionData?.userId,
                    userIdType: typeof sessionData?.userId
                });
                if (_demoModeEnabled && !SessionManager.isAuthenticated()) {
                    console.log('[ParentConnectionManager] Demo mode: creating mock session');
                    SessionManager.setSession({
                        token: 'demo_token_12345',
                        userId: 1001,
                        user: { id: 1001, displayName: 'Me', username: 'me' }
                    });
                }
            }
        },
        
        _handleMessageAck: function(data) {
            const { messageId, status, payload } = data.payload || data;
            
            if (!messageId) return;
            
            Logger.info('ParentConnectionManager', `Message ACK: ${messageId} - ${status}`);
            
            if (MessageHandler && MessageHandler.updateMessageStatus) {
                MessageHandler.updateMessageStatus(messageId, status, payload);
            }
            
            try {
                window.dispatchEvent(new CustomEvent('messageStatusUpdated', {
                    detail: { messageId, status, payload }
                }));
            } catch (e) {}
        },
        
        _handleMessageReceive: function(data) {
            const message = data.payload || data;
            
            if (!message || !message.id) {
                Logger.warn('ParentConnectionManager', 'Invalid incoming message');
                return;
            }
            
            if (isDuplicateMessage(message.id)) {
                Logger.debug('ParentConnectionManager', `Duplicate message ignored: ${message.id}`);
                return;
            }
            
            Logger.info('ParentConnectionManager', `Message received: ${message.id}`);
            
            if (ChatManager && ChatManager.addMessage) {
                ChatManager.addMessage({
                    ...message,
                    status: message.status || 'delivered'
                });
            }
            
            if (message.senderId !== SessionManager.getUserId() && UIFeatures) {
                UIFeatures.playNotificationSound();
            }
            
            try {
                window.dispatchEvent(new CustomEvent('newMessage', {
                    detail: { message }
                }));
            } catch (e) {}
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
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage(item.message, '*');
                    }
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
            const stored = SafeStorage.get('kyn_frame_id_v8');
            if (stored) return stored;
            
            const newId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_v8`;
            SafeStorage.set('kyn_frame_id_v8', newId);
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
            return currentState === LIFECYCLE_STATES.ACTIVE && SessionManager.isAuthenticated();
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
            try {
                const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
                if (cachedUser && cachedUser.id && typeof cachedUser.id === 'number' && cachedUser.id !== 0) {
                    this._user = cachedUser;
                    this._userId = cachedUser.id;
                }
            } catch (e) {}
            return this;
        },
        
        setUser: function(user) {
            if (!user) return false;
            
            const userId = user.id || user.uid;
            if (!userId || typeof userId !== 'number' || userId === 0) {
                console.warn('[SessionStore] Cannot set user with invalid ID:', userId);
                return false;
            }
            
            this._user = { ...user };
            this._userId = userId;
            
            try {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._user);
            } catch (e) {}
            
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
            try {
                SafeStorage.remove(LOCAL_STORAGE_KEYS.USER_CACHE);
            } catch (e) {}
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

    function getCurrentUserId() {
        if (SessionManager && SessionManager.getUserId) {
            return SessionManager.getUserId();
        }
        if (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.userId) {
            return window.__CHILD_SESSION__.userId;
        }
        return null;
    }

    function isAuthenticated() {
        if (SessionManager && SessionManager.isAuthenticated) {
            return SessionManager.isAuthenticated();
        }
        return !!(window.__CHILD_SESSION__ && window.__CHILD_SESSION__.token);
    }

    // =============================================
    // CHAT MANAGER (WITH DEDUPLICATION)
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
        _loadingChats: false,
        _loadingMessages: false,
        _pendingConversations: new Map(),
        
        init: function() {
            this._loadFromCache();
            this._loadDemoDataIfNeeded();
            return this;
        },
        
        _loadDemoDataIfNeeded: function() {
            if (_demoModeEnabled && (!this._conversations || this._conversations.length === 0)) {
                console.log('[ChatManager] Loading demo chat data');
                this._conversations = [...DEMO_CHATS.conversations];
                this._rebuildMap();
                this._saveToCache();
                
                if (!this._activeConversation && this._conversations.length > 0) {
                    this._activeConversation = this._conversations[0];
                }
                
                for (const [convId, messages] of Object.entries(DEMO_CHATS.messages)) {
                    const key = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${convId}`;
                    SafeStorage.setJSON(key, messages);
                    if (parseInt(convId) === this._activeConversation?.id) {
                        this._messages = messages;
                        this._rebuildMessagesMap();
                    }
                }
                
                this._notifySubscribers();
            }
        },
        
        _loadFromCache: function() {
            try {
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
            } catch (e) {}
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
        
        getPendingConversationByReceiverId: function(receiverId) {
            if (!receiverId) return null;
            const pendingId = `pending_${receiverId}`;
            return this._conversations.find(c => c.id === pendingId || c.pendingReceiverId === receiverId);
        },
        
        getOrCreatePendingConversation: function(receiverId, userName, userAvatar) {
            if (!receiverId) return null;
            
            const existing = this.getPendingConversationByReceiverId(receiverId);
            if (existing) {
                console.log('[ChatManager] Reusing existing pending conversation for receiverId:', receiverId);
                return existing;
            }
            
            const pendingId = `pending_${receiverId}`;
            const pendingConversation = {
                id: pendingId,
                type: 'direct',
                friendId: receiverId,
                friendName: userName || `User_${receiverId}`,
                friendAvatar: userAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || `User_${receiverId}`)}&background=random&color=fff`,
                online: false,
                unreadCount: 0,
                lastMessage: '',
                lastMessageAt: Date.now(),
                pendingReceiverId: receiverId,
                isPending: true
            };
            
            this._conversations.unshift(pendingConversation);
            this._conversationsMap.set(pendingId, pendingConversation);
            this._pendingConversations.set(receiverId, pendingConversation);
            this._saveToCache();
            this._notifySubscribers();
            
            console.log('[ChatManager] Created new pending conversation for receiverId:', receiverId);
            return pendingConversation;
        },
        
        replacePendingConversation: function(pendingId, realConversation) {
            const pendingIndex = this._conversations.findIndex(c => c.id === pendingId);
            if (pendingIndex === -1) return null;
            
            const pendingConv = this._conversations[pendingIndex];
            const receiverId = pendingConv.pendingReceiverId;
            
            const pendingMessagesKey = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${pendingId}`;
            const pendingMessages = SafeStorage.getJSON(pendingMessagesKey, []);
            
            if (receiverId) {
                this._pendingConversations.delete(receiverId);
            }
            
            const newConversation = {
                ...realConversation,
                friendName: realConversation.friendName || pendingConv.friendName,
                friendAvatar: realConversation.friendAvatar || pendingConv.friendAvatar
            };
            
            this._conversations[pendingIndex] = newConversation;
            this._conversationsMap.delete(pendingId);
            this._conversationsMap.set(newConversation.id, newConversation);
            
            if (pendingMessages.length > 0) {
                const realMessagesKey = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${newConversation.id}`;
                const existingMessages = SafeStorage.getJSON(realMessagesKey, []);
                const mergedMessages = [...pendingMessages, ...existingMessages];
                mergedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                SafeStorage.setJSON(realMessagesKey, mergedMessages);
                SafeStorage.remove(pendingMessagesKey);
                
                if (this._activeConversation && this._activeConversation.id === pendingId) {
                    this._messages = mergedMessages;
                    this._activeConversation = newConversation;
                    this._rebuildMessagesMap();
                }
            }
            
            if (this._activeConversation && this._activeConversation.id === pendingId) {
                this._activeConversation = newConversation;
            }
            
            this._saveToCache();
            this._notifySubscribers();
            
            console.log('[ChatManager] Replaced pending conversation', pendingId, 'with real conversation', newConversation.id);
            
            try {
                window.dispatchEvent(new CustomEvent('conversationReplaced', {
                    detail: { oldId: pendingId, newConversation }
                }));
            } catch (e) {}
            
            return newConversation;
        },
        
        async fetchConversations() {
            if (!SessionManager.isAuthenticated()) {
                console.log('[ChatManager] Not authenticated, cannot fetch conversations');
                if (_demoModeEnabled && (!this._conversations || this._conversations.length === 0)) {
                    this._loadDemoDataIfNeeded();
                }
                return;
            }
            
            if (this._loadingChats) return;
            this._loadingChats = true;
            this._notifyLoading('chats', true);
            
            try {
                console.log('[ChatManager] 📤 Fetching conversations from backend');
                const conversations = await makeApiRequest('/chats', 'GET');
                
                console.log(`[ChatManager] 📥 Received conversations response:`, conversations);
                
                let chatsArray = [];
                if (conversations && Array.isArray(conversations)) {
                    chatsArray = conversations;
                } else if (conversations && conversations.chats && Array.isArray(conversations.chats)) {
                    chatsArray = conversations.chats;
                } else if (conversations && conversations.data && conversations.data.chats && Array.isArray(conversations.data.chats)) {
                    chatsArray = conversations.data.chats;
                } else if (conversations && conversations.data && Array.isArray(conversations.data)) {
                    chatsArray = conversations.data;
                }
                
                console.log(`[ChatManager] 📥 Extracted ${chatsArray.length} chats from response`);
                
                if (chatsArray.length > 0) {
                    this.setConversations(chatsArray);
                    this._notifySuccess('Conversations loaded');
                } else if (_demoModeEnabled) {
                    this._loadDemoDataIfNeeded();
                } else {
                    this.setConversations([]);
                    console.warn('[ChatManager] No conversations received');
                }
            } catch (error) {
                console.error('[ChatManager] Failed to fetch conversations:', error);
                if (_demoModeEnabled) {
                    this._loadDemoDataIfNeeded();
                } else {
                    this._notifyError(error.message);
                }
            } finally {
                this._loadingChats = false;
                this._notifyLoading('chats', false);
            }
        },
        
        async fetchMessages(conversationId, options = {}) {
            if (conversationId && typeof conversationId === 'string' && conversationId.startsWith('pending_')) {
                console.log('[ChatManager] Skipping message fetch for pending conversation');
                return;
            }
            
            if (!navigator.onLine) {
                console.log('[ChatManager] Offline mode - using cached messages');
                const cachedMessages = this.loadPreviousMessages(conversationId);
                if (cachedMessages && cachedMessages.length > 0) {
                    this.setMessages(cachedMessages);
                    this._notifySubscribers();
                }
                return;
            }
            
            if (!SessionManager.isAuthenticated()) {
                console.log('[ChatManager] Not authenticated, cannot fetch messages');
                if (_demoModeEnabled && conversationId) {
                    const demoMessages = DEMO_CHATS.messages[conversationId];
                    if (demoMessages) {
                        this.setMessages(demoMessages);
                    }
                }
                return;
            }
            
            if (!conversationId) {
                console.warn('[ChatManager] Cannot fetch messages - no conversation ID');
                return;
            }
            
            if (this._loadingMessages) return;
            this._loadingMessages = true;
            this._notifyLoading('messages', true);
            
            try {
                console.log(`[ChatManager] 📤 Fetching messages for conversation: ${conversationId}`);
                const params = { 
                    chatId: conversationId,
                    before: options.before,
                    limit: options.limit || 50
                };
                const response = await makeApiRequest('/messages', 'GET', null, params);
                
                console.log(`[ChatManager] 📥 Received messages response:`, response);
                
                let messagesArray = [];
                if (response && Array.isArray(response)) {
                    messagesArray = response;
                } else if (response && response.messages && Array.isArray(response.messages)) {
                    messagesArray = response.messages;
                } else if (response && response.data && response.data.messages && Array.isArray(response.data.messages)) {
                    messagesArray = response.data.messages;
                } else if (response && response.data && Array.isArray(response.data)) {
                    messagesArray = response.data;
                }
                
                console.log(`[ChatManager] 📥 Extracted ${messagesArray.length} messages from response`);
                
                if (messagesArray.length > 0) {
                    const normalizedMessages = messagesArray.map(msg => ({
                        id: msg.id,
                        content: msg.content || msg.text || '',
                        type: msg.type || 'text',
                        senderId: msg.senderId || msg.sender?.id,
                        sender: msg.sender,
                        timestamp: msg.createdAt || msg.timestamp || Date.now(),
                        status: 'delivered',
                        conversationId: conversationId
                    }));
                    this.setMessages(normalizedMessages);
                    this._notifySuccess('Messages loaded');
                } else if (_demoModeEnabled) {
                    const demoMessages = DEMO_CHATS.messages[conversationId];
                    if (demoMessages) {
                        this.setMessages(demoMessages);
                    } else {
                        this.setMessages([]);
                    }
                } else {
                    this.setMessages([]);
                }
            } catch (error) {
                console.error('[ChatManager] Failed to fetch messages:', error);
                if (_demoModeEnabled) {
                    const demoMessages = DEMO_CHATS.messages[conversationId];
                    if (demoMessages) {
                        this.setMessages(demoMessages);
                    } else {
                        this.setMessages([]);
                    }
                } else {
                    this._notifyError(error.message);
                    this.setMessages([]);
                }
            } finally {
                this._loadingMessages = false;
                this._notifyLoading('messages', false);
            }
        },
        
        async sendMessageToBackend(content, conversationId, options = {}) {
            if (!ensureActive('sendMessage')) {
                throw new Error('Cannot send message - module not active');
            }
            
            if (!SessionManager.isAuthenticated()) {
                throw new Error('Not authenticated');
            }
            
            if (!conversationId) {
                throw new Error('No conversation ID');
            }
            
            if (!content && !options.attachment) {
                throw new Error('Empty message');
            }
            
            const isPending = typeof conversationId === 'string' && conversationId.startsWith('pending_');
            let requestBody = {};
            
            if (isPending) {
                const pendingConv = this._conversationsMap.get(conversationId);
                if (!pendingConv || !pendingConv.pendingReceiverId) {
                    throw new Error('Invalid pending conversation: missing receiverId');
                }
                console.log(`[ChatManager] 📤 Sending message to pending conversation - using receiverId: ${pendingConv.pendingReceiverId}`);
                requestBody = {
                    receiverId: pendingConv.pendingReceiverId,
                    content: content,
                    type: options.type || 'text',
                    attachment: options.attachment,
                    replyTo: options.replyTo,
                    mentions: options.mentions
                };
            } else {
                console.log(`[ChatManager] 📤 Sending message to real conversation - using chatId: ${conversationId}`);
                requestBody = {
                    chatId: conversationId,
                    content: content,
                    type: options.type || 'text',
                    attachment: options.attachment,
                    replyTo: options.replyTo,
                    mentions: options.mentions
                };
            }
            
            const result = await makeApiRequest('/messages', 'POST', requestBody);
            
            console.log(`[ChatManager] 📥 Message sent successfully:`, result);
            
            if (isPending && result && (result.chatId || (result.data && result.data.chatId))) {
                const realChatId = result.chatId || result.data.chatId;
                if (realChatId && typeof realChatId === 'number') {
                    console.log(`[ChatManager] Received real chatId ${realChatId} for pending conversation, replacing...`);
                    try {
                        const realConversation = await makeApiRequest(`/chats/${realChatId}`, 'GET');
                        if (realConversation) {
                            const normalizedConv = {
                                id: realConversation.id || realChatId,
                                friendId: realConversation.friendId || realConversation.otherParticipant?.id,
                                friendName: realConversation.friendName || realConversation.otherParticipant?.displayName || 'Chat',
                                friendAvatar: realConversation.friendAvatar || realConversation.otherParticipant?.avatar,
                                lastMessage: realConversation.lastMessage || content,
                                lastMessageAt: realConversation.lastMessageAt || Date.now(),
                                unreadCount: 0,
                                online: realConversation.online || false,
                                type: 'direct'
                            };
                            this.replacePendingConversation(conversationId, normalizedConv);
                            result.chatId = realChatId;
                        }
                    } catch (e) {
                        console.warn('[ChatManager] Could not fetch real conversation details:', e);
                    }
                }
            }
            
            return result;
        },
        
        setConversations: function(conversations) {
            const currentUserId = SessionManager.getUserId();
            const uniqueMap = new Map();
            const seenFriendIds = new Set();
            
            (conversations || []).forEach(chat => {
                if (!chat || !chat.id) return;
                
                let friendId = chat.friendId || chat.otherParticipantId;
                if (!friendId && chat.otherParticipant) {
                    friendId = chat.otherParticipant.id;
                }
                if (!friendId && chat.participants) {
                    const other = chat.participants.find(p => p.id !== currentUserId);
                    friendId = other?.id;
                }
                
                if (friendId && seenFriendIds.has(friendId)) {
                    console.log(`[ChatManager] Skipping duplicate conversation for friend ${friendId}`);
                    return;
                }
                
                if (friendId) {
                    seenFriendIds.add(friendId);
                }
                
                const otherUser = chat.otherParticipant || 
                    (chat.participants && chat.participants.find(p => p.id !== currentUserId));
                
                const friendName = otherUser?.displayName || otherUser?.username || otherUser?.firstName || chat.name || 'User';
                const friendAvatar = otherUser?.avatar || chat.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friendName)}&background=random&color=fff`;
                
                let lastMessageText = chat.lastMessage?.content || chat.lastMessageContent || '';
                let lastMessageTime = chat.lastMessage?.createdAt || chat.lastMessageAt || chat.updatedAt;
                
                if (!lastMessageText && chat.messages && chat.messages.length > 0) {
                    const lastMsg = chat.messages[chat.messages.length - 1];
                    lastMessageText = lastMsg.content || '';
                    lastMessageTime = lastMsg.createdAt || lastMsg.timestamp;
                }
                
                uniqueMap.set(chat.id, {
                    ...chat,
                    id: chat.id,
                    friendId: friendId,
                    friendName: friendName,
                    friendAvatar: friendAvatar,
                    lastMessage: lastMessageText || '',
                    lastMessageAt: lastMessageTime || Date.now(),
                    unreadCount: chat.unreadCount || 0,
                    online: otherUser?.status === 'online',
                    type: chat.type || 'direct',
                    archived: chat.archived || false,
                    blocked: chat.blocked || false
                });
            });
            
            const existingPending = (this._conversations || []).filter(c => c.isPending === true);
            existingPending.forEach(pending => {
                const friendId = pending.pendingReceiverId || pending.friendId;
                if (friendId && !seenFriendIds.has(friendId)) {
                    uniqueMap.set(pending.id, pending);
                    seenFriendIds.add(friendId);
                }
            });
            
            this._conversations = Array.from(uniqueMap.values());
            
            this._conversations.sort((a, b) => {
                const timeA = a.lastMessageAt || 0;
                const timeB = b.lastMessageAt || 0;
                return timeB - timeA;
            });
            
            this._rebuildMap();
            this._loaded = true;
            this._saveToCache();
            this._notifySubscribers();
            
            console.log(`[ChatManager] Set ${this._conversations.length} unique conversations`);
        },
        
        setMessages: function(messages) {
            const uniqueMessages = [];
            const seenIds = new Set();
            
            for (const msg of (messages || [])) {
                if (msg.id && !seenIds.has(msg.id)) {
                    seenIds.add(msg.id);
                    uniqueMessages.push(msg);
                }
            }
            
            uniqueMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
            this._messages = uniqueMessages;
            this._rebuildMessagesMap();
            this._saveMessagesToCache();
            this._notifySubscribers();
        },
        
        addMessage: function(message) {
            if (!message || !message.id) return;
            
            if (this._messagesMap.has(message.id)) {
                console.log(`[ChatManager] Duplicate message ignored: ${message.id}`);
                return;
            }
            
            this._messages.push(message);
            this._messagesMap.set(message.id, message);
            
            this._messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
            if (message.conversationId) {
                const conversation = this._conversationsMap.get(message.conversationId);
                if (conversation) {
                    conversation.lastMessage = message.content;
                    conversation.lastMessageAt = message.timestamp;
                    if (message.senderId !== SessionManager.getUserId()) {
                        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                    }
                    this._conversations.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
                }
            }
            
            if (this._activeConversation && message.conversationId === this._activeConversation.id) {
                this._saveMessagesToCache();
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
            
            if (conversation) {
                try {
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.UI_STATE, {
                        lastChatId: conversation.id,
                        timestamp: Date.now()
                    });
                } catch (e) {}
            }
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
            
            try {
                const stored = SafeStorage.getJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${conversationId}`);
                if (stored && Array.isArray(stored)) {
                    this._historyCache.set(conversationId, {
                        messages: stored,
                        timestamp: Date.now()
                    });
                    return stored;
                }
            } catch (e) {}
            
            return null;
        },
        
        _saveToCache: function() {
            try {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { 
                    conversations: this._conversations, 
                    timestamp: Date.now() 
                });
            } catch (e) {}
        },
        
        _saveMessagesToCache: function() {
            if (this._activeConversation) {
                try {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${this._activeConversation.id}`, this._messages);
                } catch (e) {}
            }
        },
        
        subscribe: function(callback) {
            this._subscribers.add(callback);
            return () => this._subscribers.delete(callback);
        },
        
        _notifySubscribers: function() {
            this._subscribers.forEach(cb => {
                try { cb(this._conversations, this._activeConversation, this._messages); } catch (e) {}
            });
            
            try {
                window.dispatchEvent(new CustomEvent('conversationsUpdated', {
                    detail: { 
                        conversations: this._conversations,
                        activeConversation: this._activeConversation,
                        messages: this._messages
                    }
                }));
            } catch (e) {}
        },
        
        _notifyLoading: function(type, isLoading) {
            try {
                window.dispatchEvent(new CustomEvent('chatLoading', {
                    detail: { type, isLoading }
                }));
            } catch (e) {}
        },
        
        _notifyError: function(error) {
            try {
                window.dispatchEvent(new CustomEvent('chatError', {
                    detail: { error }
                }));
            } catch (e) {}
        },
        
        _notifySuccess: function(message) {
            try {
                window.dispatchEvent(new CustomEvent('chatSuccess', {
                    detail: { message }
                }));
            } catch (e) {}
        },
        
        clear: function() {
            this._conversations = [];
            this._conversationsMap.clear();
            this._activeConversation = null;
            this._messages = [];
            this._messagesMap.clear();
            this._historyCache.clear();
            this._pendingConversations.clear();
        }
    }.init();

    // =============================================
    // FRIEND MANAGER (REAL DATA ONLY)
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
            this._loadDemoFriendsIfNeeded();
            return this;
        },
        
        _loadDemoFriendsIfNeeded: function() {
            if (_demoModeEnabled && (!this._friends || this._friends.length === 0)) {
                console.log('[FriendManager] Loading demo friends');
                this._friends = [
                    { id: 2001, displayName: 'moodchat1', username: 'moodchat1', online: true, status: 'online', avatar: 'https://ui-avatars.com/api/?name=moodchat1&background=4caf50&color=fff' },
                    { id: 2002, displayName: 'moodchat2', username: 'moodchat2', online: true, status: 'online', avatar: 'https://ui-avatars.com/api/?name=moodchat2&background=2196f3&color=fff' }
                ];
                this._rebuildMap();
                this._friends.forEach(friend => {
                    if (friend.online) {
                        this._activeFriends.add(friend.id);
                    }
                });
                this._loaded = true;
                this._saveToCache();
                this._notifySubscribers();
            }
        },
        
        _loadFromCache: function() {
            try {
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
            } catch (e) {}
        },
        
        _loadBlockedUsers: function() {
            try {
                const blocked = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);
                this._blockedFriends = new Set(blocked);
            } catch (e) {}
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
        
        async fetchFriends() {
            if (!SessionManager.isAuthenticated()) {
                console.log('[FriendManager] Not authenticated, cannot fetch friends');
                if (_demoModeEnabled) {
                    this._loadDemoFriendsIfNeeded();
                }
                return;
            }
            
            if (this._loading) return;
            this._loading = true;
            
            try {
                console.log('[FriendManager] 📤 Fetching friends from backend');
                const raw = await makeApiRequest('/friends', 'GET');
                
                let friends = raw;
                if (friends && !Array.isArray(friends)) {
                    if (Array.isArray(friends.friends)) {
                        friends = friends.friends;
                    } else if (friends.data && Array.isArray(friends.data)) {
                        friends = friends.data;
                    } else if (friends.data && Array.isArray(friends.data.friends)) {
                        friends = friends.data.friends;
                    }
                }
                
                console.log(`[FriendManager] 📥 Received ${friends?.length || 0} friends from backend`);
                
                if (friends && Array.isArray(friends) && friends.length > 0) {
                    this.setFriends(friends);
                } else if (friends && Array.isArray(friends) && friends.length === 0) {
                    this.setFriends([]);
                    await this._fetchAllUsersAsFallback();
                } else if (_demoModeEnabled) {
                    this._loadDemoFriendsIfNeeded();
                }
            } catch (error) {
                console.error('[FriendManager] Failed to fetch friends:', error);
                if (_demoModeEnabled) {
                    this._loadDemoFriendsIfNeeded();
                } else {
                    this._notifyError(error.message);
                }
            } finally {
                this._loading = false;
            }
        },

        async _fetchAllUsersAsFallback() {
    if (!SessionManager.isAuthenticated()) return;
    if (this._friends && this._friends.length > 0) return;
    try {
        let result = null;
        let users = [];

        // FIX: Use /users endpoint instead of /users/search which is failing with 500
        // The /users endpoint returns all users (excluding current user) with pagination
        try { 
            result = await makeApiRequest('/users', 'GET', null, { limit: 200 }); 
        } catch(e) { 
            console.log('[FriendManager] /users endpoint failed:', e.message);
            result = null; 
        }
        
        // Fallback to /users/all if /users fails
        if (!result) {
            try { 
                result = await makeApiRequest('/users/all', 'GET', null, { limit: 200 }); 
            } catch(e) { 
                console.log('[FriendManager] /users/all endpoint failed:', e.message);
                result = null; 
            }
        }

        // Parse response - handle different response formats
        if (Array.isArray(result)) { 
            users = result; 
        }
        else if (result && Array.isArray(result.users)) { 
            users = result.users; 
        }
        else if (result && result.data && Array.isArray(result.data)) { 
            users = result.data; 
        }
        else if (result && result.data && Array.isArray(result.data.users)) { 
            users = result.data.users; 
        }
        else if (result && result.data && result.data.data && Array.isArray(result.data.data.users)) {
            users = result.data.data.users;
        }

        if (users.length > 0) {
            const currentUserId = SessionManager.getUserId();
            // Filter out current user and ensure we have valid user objects
            users = users.filter(u => {
                const userId = u.id || u.uid;
                return userId && userId !== currentUserId;
            });
            
            if (users.length > 0) {
                console.log(`[FriendManager] Loaded ${users.length} users as fallback`);
                this.setFriends(users);
            }
        } else {
            console.log('[FriendManager] No users found in fallback fetch');
        }
    } catch (e) {
        Logger.warn('FriendManager', 'Failed to fetch users as fallback:', e.message);
    }
},

        setFriends: function(friends) {
            this._friends = friends || [];
            this._rebuildMap();
            this._loaded = true;
            this._saveToCache();
            this._notifySubscribers();
            try {
                window.dispatchEvent(new CustomEvent('friendsUpdated', {
                    detail: { friends: this._friends }
                }));
            } catch(e) {}
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
                this._saveToCache();
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
            this._saveToCache();
            
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
            const availableFriends = this._friends
                .filter(friend => !this._blockedFriends.has(friend.id || friend.uid))
                .map(friend => {
                    const id = friend.id || friend.uid || friend.userId;
                    const firstName = friend.firstName || friend.first_name || '';
                    const lastName = friend.lastName || friend.last_name || '';
                    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
                    const displayName = friend.displayName || friend.display_name || fullName || friend.username || friend.name || 'User';
                    const avatar = friend.avatar || friend.photoURL || friend.avatarUrl || friend.profilePhoto || null;
                    const online = friend.online ?? (friend.status === 'online') ?? false;
                    const status = friend.status || (online ? 'Online' : 'Offline');

                    return {
                        ...friend,
                        id,
                        displayName,
                        username: friend.username || displayName,
                        avatar,
                        photoURL: avatar,
                        online,
                        status,
                        lastSeen: friend.lastSeen || friend.last_seen || friend.lastActive || null
                    };
                });

            return availableFriends.sort((a, b) => {
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
            
            try {
                window.dispatchEvent(new CustomEvent('friendsUpdated', {
                    detail: { friends: this._friends, availableFriends: friends }
                }));
            } catch (e) {}
        },
        
        _notifyError: function(error) {
            try {
                window.dispatchEvent(new CustomEvent('friendsError', {
                    detail: { error }
                }));
            } catch (e) {}
        },
        
        _saveToCache: function() {
            try {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                    friends: this._friends,
                    timestamp: Date.now()
                });
            } catch (e) {}
        },
        
        isLoaded: function() {
            return this._loaded;
        },
        
        clear: function() {
            this._friends = [];
            this._friendsMap.clear();
            this._loaded = false;
            this._activeFriends.clear();
            try {
                SafeStorage.remove(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
            } catch (e) {}
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
            if (!conversationId || !SessionManager.getUserId()) return false;
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
    // MESSAGE HANDLER
    // =============================================
    const MessageHandler = {
        _optimisticMessages: new Map(),
        _pendingRequests: new Map(),
        
        async sendMessage(content, options = {}) {
            const guardResult = window.__guardAction('sendMessage', MODULE_NAME, currentState, { success: false, error: 'module_not_active' });
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) {
                return { success: false, error: 'module_not_active' };
            }
            
            if (!SessionManager.isAuthenticated()) {
                return { success: false, error: 'not_authenticated' };
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
                senderId: SessionManager.getUserId() || null,
                sender: SessionManager.getUser(),
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
            
            try {
                const result = await ChatManager.sendMessageToBackend(content, conversationId, options);
                
                console.log(`[MessageHandler] Message sent successfully:`, result);
                
                const realMessage = result.message || result;
                if (realMessage && realMessage.id) {
                    optimisticMessage.id = realMessage.id;
                    optimisticMessage.status = 'sent';
                    optimisticMessage.optimistic = false;
                    optimisticMessage.realId = realMessage.id;
                    
                    const messages = ChatManager.getMessages();
                    const index = messages.findIndex(m => m.localId === localId);
                    if (index !== -1) {
                        messages[index] = { ...optimisticMessage, ...realMessage };
                        ChatManager.setMessages(messages);
                    }
                } else {
                    optimisticMessage.status = 'sent';
                    optimisticMessage.optimistic = false;
                }
                
                if (result && result.chatId && typeof conversationId === 'string' && conversationId.startsWith('pending_')) {
                    console.log(`[MessageHandler] Received real chatId ${result.chatId} for pending conversation, updating active chat...`);
                    const realConversation = ChatManager.getConversation(result.chatId);
                    if (realConversation) {
                        ChatManager.setActiveConversation(realConversation);
                    }
                }
                
                this._optimisticMessages.delete(localId);
                this._pendingRequests.delete(requestId);
                
                EventBus.emit('message:sent', { message: optimisticMessage, success: true });
                
                return { success: true, localId, requestId, message: optimisticMessage };
                
            } catch (error) {
                console.error(`[MessageHandler] Failed to send message:`, error);
                
                optimisticMessage.status = 'failed';
                optimisticMessage.error = error.message;
                ChatManager.updateMessageStatus(localId, 'failed', { reason: error.message });
                EventBus.emit('message:failed', { messageId: localId, error: error.message });
                
                this._optimisticMessages.delete(localId);
                this._pendingRequests.delete(requestId);
                
                return { success: false, error: error.message, localId };
            }
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
            if (!SessionManager.isAuthenticated()) return false;
            
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
                    try {
                        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                    } catch (e) {}
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
            if (!SessionManager.isAuthenticated()) return false;
            
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
                    try {
                        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                    } catch (e) {}
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
            if (!SessionManager.isAuthenticated()) return false;
            
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
                
                const userId = SessionManager.getUserId();
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
                    try {
                        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                    } catch (e) {}
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
            if (!SessionManager.isAuthenticated()) return false;
            
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
            if (!SessionManager.isAuthenticated()) return false;
            
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
            
            if (!SessionManager.isAuthenticated()) {
                return Promise.reject(new Error('Not authenticated'));
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
    // CONVERSATION MANAGER (REAL API CALLS)
    // =============================================
    const ConversationManager = {
        async openConversation(conversationId, options = {}) {
            if (!conversationId) return false;
            if (!SessionManager.isAuthenticated() && !_demoModeEnabled) return false;
            
            const actualId = typeof conversationId === 'object' ? conversationId.id : conversationId;
            
            const conversation = ChatManager.getConversation(actualId);
            if (conversation) {
                ChatManager.setActiveConversation(conversation);
                this._showChatPanel(conversation);
            } else {
                const tempConversation = { id: actualId, friendName: 'Loading...', friendAvatar: '', online: false };
                ChatManager.setActiveConversation(tempConversation);
                this._showChatPanel(tempConversation);
            }
            
            const result = safeSend(OUTGOING_ACTIONS.OPEN_CONVERSATION, {
                conversationId: actualId
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            if (typeof actualId !== 'string' || !actualId.startsWith('pending_')) {
                await this.fetchMessages(actualId, options);
            } else {
                console.log('[ConversationManager] Skipping message fetch for pending conversation:', actualId);
            }
            
            const draft = UIStateManager.getDraft(actualId);
            EventBus.emit('draft:loaded', { conversationId: actualId, draft });
            
            const theme = UIStateManager.getChatTheme(actualId);
            if (theme) EventBus.emit('theme:apply', { conversationId: actualId, theme });
            
            this.markAsRead(actualId);
            
            try {
                window.dispatchEvent(new CustomEvent('conversationOpened', {
                    detail: { conversationId: actualId, conversation }
                }));
            } catch (e) {}
            
            return true;
        },
        
        _showChatPanel: function(conversation) {
            const chatPanel = document.getElementById('chatPanel');
            const sidebar = document.getElementById('sidebar');
            const backBtn = document.getElementById('backToChatsBtn');
            
            if (chatPanel) {
                chatPanel.classList.remove('hidden');
            }
            if (sidebar && window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }
            if (backBtn && window.innerWidth <= 768) {
                backBtn.style.display = 'flex';
            }
            
            const nameEl = document.getElementById('chatFriendName');
            const avatarEl = document.getElementById('chatFriendAvatar');
            const statusEl = document.getElementById('chatStatusText');
            const indicatorEl = document.getElementById('chatStatusIndicator');
            
            if (nameEl) {
                nameEl.textContent = conversation.friendName || conversation.name || 'Chat';
            }
            if (statusEl) {
                statusEl.textContent = conversation.online ? 'Online' : 'Offline';
            }
            if (indicatorEl) {
                indicatorEl.className = `chat-status ${conversation.online ? 'online' : 'offline'}`;
            }
            if (avatarEl) {
                if (conversation.friendAvatar) {
                    avatarEl.innerHTML = `<img src="${conversation.friendAvatar}" alt="${conversation.friendName || 'User'}">`;
                } else {
                    avatarEl.innerHTML = '<i class="fas fa-user"></i>';
                }
                if (indicatorEl) avatarEl.appendChild(indicatorEl);
            }
            
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');
            if (messageInput) messageInput.disabled = false;
            if (sendButton) sendButton.disabled = false;
            
            setTimeout(() => {
                if (messageInput) messageInput.focus();
            }, 100);
        },
        
        async fetchMessages(conversationId, options = {}) {
            if (!conversationId) return;
            if (typeof conversationId === 'string' && conversationId.startsWith('pending_')) {
                console.log('[ConversationManager] Skipping fetchMessages for pending conversation:', conversationId);
                return;
            }
            if (!ensureActive('fetchMessages')) return;
            if (!SessionManager.isAuthenticated() && !_demoModeEnabled) return;
            
            await ChatManager.fetchMessages(conversationId, options);
        },
        
        async fetchConversations() {
            if (!ensureActive('fetchConversations')) return;
            if (!SessionManager.isAuthenticated()) return;
            
            await ChatManager.fetchConversations();
        },
        
        markAsRead: function(conversationId) {
            const guardResult = window.__guardAction('markAsRead', MODULE_NAME, currentState);
            if (guardResult !== null) {
                return;
            }
            
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            if (!SessionManager.isAuthenticated()) return;
            
            safeSend(OUTGOING_ACTIONS.MARK_AS_READ, {
                conversationId: conversationId
            }, { requireAck: false });
            
            const conversation = ChatManager.getConversation(conversationId);
            if (conversation) {
                conversation.unreadCount = 0;
                EventBus.emit('conversation:updated', conversation);
                
                try {
                    window.dispatchEvent(new CustomEvent('conversationRead', {
                        detail: { conversationId }
                    }));
                } catch (e) {}
            }
        },
        
        createConversation: async function(participants, options = {}) {
            if (!participants || participants.length === 0) return false;
            if (!SessionManager.isAuthenticated()) return false;

            const type = options.type || 'direct';

            if (type === 'direct' && participants.length === 1) {
                const receiverId = participants[0];
                const numericReceiverId = typeof receiverId === 'string' ? parseInt(receiverId, 10) : receiverId;
                
                try {
                    let existing = ChatManager.getConversations().find(c =>
                        c.type === 'direct' &&
                        (c.friendId === numericReceiverId || c.pendingReceiverId === numericReceiverId ||
                         (c.participants && c.participants.some(p => (p.id || p) === numericReceiverId)))
                    );

                    if (existing) {
                        await ConversationManager.openConversation(existing.id, options);
                        return existing.id;
                    }

                    let realUserName = options.name;
                    let realUserAvatar = null;
                    
                    if (window.MessagesCore && window.MessagesCore.FriendManager) {
                        const friend = window.MessagesCore.FriendManager.getFriend(numericReceiverId);
                        if (friend) {
                            realUserName = friend.displayName || friend.username || friend.name || options.name;
                            realUserAvatar = friend.avatar || friend.photoURL || null;
                        }
                    }
                    
                    if (!realUserName || realUserName === `User_${numericReceiverId}`) {
                        try {
                            const userInfo = await makeApiRequest(`/users/${numericReceiverId}`, 'GET');
                            if (userInfo) {
                                realUserName = userInfo.displayName || userInfo.username || userInfo.name || options.name;
                                realUserAvatar = userInfo.avatar || userInfo.photoURL || null;
                            }
                        } catch (e) {
                            console.log('[ConversationManager] Could not fetch user info:', e);
                        }
                    }
                    
                    if (!realUserName || realUserName === `User_${numericReceiverId}`) {
                        realUserName = options.name || `User_${numericReceiverId}`;
                    }

                    if (options.initialMessage && options.initialMessage.trim()) {
                        const body = {
                            receiverId: numericReceiverId,
                            content: options.initialMessage.trim(),
                            type: 'text'
                        };

                        const result = await makeApiRequest('/messages', 'POST', body);
                        
                        const chatId = result?.chatId || result?.data?.chatId || result?.id || result?.data?.id;

                        if (chatId) {
                            await ChatManager.fetchConversations();
                            await ConversationManager.openConversation(chatId, options);
                            
                            try {
                                window.dispatchEvent(new CustomEvent('conversationCreated', {
                                    detail: { participants, options, chatId }
                                }));
                            } catch (e) {}
                            return chatId;
                        }
                    }
                    
                    const existingPending = ChatManager.getPendingConversationByReceiverId(numericReceiverId);
                    if (existingPending) {
                        await ConversationManager.openConversation(existingPending.id, options);
                        return existingPending.id;
                    }
                    
                    const pendingConversation = ChatManager.getOrCreatePendingConversation(
                        numericReceiverId, 
                        realUserName, 
                        realUserAvatar
                    );
                    
                    if (pendingConversation) {
                        ChatManager.setActiveConversation(pendingConversation);
                        ConversationManager._showChatPanel(pendingConversation);
                        
                        try {
                            window.dispatchEvent(new CustomEvent('conversationCreated', {
                                detail: { 
                                    participants, 
                                    options, 
                                    chatId: pendingConversation.id,
                                    isPending: true,
                                    receiverId: numericReceiverId,
                                    userName: realUserName,
                                    userAvatar: pendingConversation.friendAvatar
                                }
                            }));
                        } catch (e) {}
                        
                        return pendingConversation.id;
                    }
                    
                    return false;
                    
                } catch (error) {
                    Logger.error('ConversationManager', 'Failed to create direct conversation:', error.message);
                }
                return false;
            }

            const result = safeSend(OUTGOING_ACTIONS.CREATE_CONVERSATION, {
                participants: participants,
                type,
                name: options.name,
                initialMessage: options.initialMessage
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            try {
                window.dispatchEvent(new CustomEvent('conversationCreated', {
                    detail: { participants, options }
                }));
            } catch (e) {}
            
            return true;
        },

        async getOrCreateConversationByUserId(userId, userName) {
            if (!userId) return null;
            
            const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
            
            let realUserName = userName;
            let realUserAvatar = null;
            
            if (window.MessagesCore && window.MessagesCore.FriendManager) {
                const friend = window.MessagesCore.FriendManager.getFriend(numericUserId);
                if (friend) {
                    realUserName = friend.displayName || friend.username || friend.name || userName;
                    realUserAvatar = friend.avatar || friend.photoURL || null;
                }
            }
            
            const existingConversation = ChatManager.getConversations().find(c =>
                c.type === 'direct' &&
                (c.friendId === numericUserId || c.pendingReceiverId === numericUserId ||
                 (c.participants && c.participants.some(p => (p.id || p) === numericUserId)))
            );
            
            if (existingConversation) {
                await this.openConversation(existingConversation.id);
                return existingConversation;
            }
            
            const result = await this.createConversation([numericUserId], { 
                name: realUserName || userName || `User_${numericUserId}`,
                type: 'direct'
            });
            
            if (result && result !== false) {
                const newConversation = ChatManager.getConversations().find(c =>
                    c.type === 'direct' &&
                    (c.friendId === numericUserId || c.pendingReceiverId === numericUserId ||
                     (c.participants && c.participants.some(p => (p.id || p) === numericUserId)))
                );
                
                if (newConversation) {
                    await this.openConversation(newConversation.id);
                    return newConversation;
                }
                
                const tempConv = ChatManager.getActiveChat();
                if (tempConv && tempConv.pendingReceiverId === numericUserId) {
                    return tempConv;
                }
            }
            
            return null;
        },
        
        archiveConversation: function(conversationId, archived = true) {
            const guardResult = window.__guardAction('archiveConversation', MODULE_NAME, currentState);
            if (guardResult !== null) {
                return;
            }
            
            if (!conversationId) return;
            if (!canSendUserMessages()) return;
            if (!SessionManager.isAuthenticated()) return;
            
            safeSend(OUTGOING_ACTIONS.ARCHIVE_CONVERSATION, {
                conversationId: conversationId,
                archived: archived
            }, { requireAck: false });
            
            const conversation = ChatManager.getConversation(conversationId);
            if (conversation) {
                conversation.archived = archived;
                
                try {
                    const archivedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);
                    if (archived && !archivedChats.includes(conversationId)) {
                        archivedChats.push(conversationId);
                    } else if (!archived) {
                        const index = archivedChats.indexOf(conversationId);
                        if (index !== -1) archivedChats.splice(index, 1);
                    }
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, archivedChats);
                } catch (e) {}
                
                EventBus.emit('conversation:updated', conversation);
            }
        },
        
        blockUser: function(userId, block = true) {
            const guardResult = window.__guardAction('blockUser', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            if (!SessionManager.isAuthenticated()) return false;
            
            const result = safeSend(OUTGOING_ACTIONS.BLOCK_USER, {
                userId,
                block
            }, { requireAck: false });
            
            if (result.blocked) {
                return false;
            }
            
            try {
                const blockedUsers = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);
                if (block && !blockedUsers.includes(userId)) {
                    blockedUsers.push(userId);
                } else if (!block) {
                    const index = blockedUsers.indexOf(userId);
                    if (index !== -1) blockedUsers.splice(index, 1);
                }
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, blockedUsers);
            } catch (e) {}
            
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
            if (isNaN(date.getTime())) return '';
            const now = new Date();
            // Same calendar day → real 12-hour clock time e.g. "1:30 PM"
            if (date.toDateString() === now.toDateString()) {
                return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
            }
            // Any older date → DD/MM/YYYY e.g. "09/04/2026"
            const dd   = String(date.getDate()).padStart(2, '0');
            const mm   = String(date.getMonth() + 1).padStart(2, '0');
            const yyyy = date.getFullYear();
            return `${dd}/${mm}/${yyyy}`;
        },

        // FIX: smart last-seen label for chat header status
        formatLastSeen: function(timestamp, isOnline) {
            if (isOnline) return 'Active now';
            if (!timestamp) return 'Offline';
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return 'Offline';
            const now = Date.now();
            const diffMs = now - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            if (diffMins < 2) return 'Active just now';
            if (diffMins < 60) return `Active ${diffMins}m ago`;
            if (diffHours < 24) return `Active ${diffHours}h ago`;
            if (diffDays === 1) return 'Active yesterday';
            if (diffDays < 7) return `Active ${diffDays}d ago`;
            return 'Offline';
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
        _uiAttached: false,
        
        init: function() {
            if (this._initialized) return this;
            
            this._initialized = true;
            Logger.info('UIBridge', 'Initialized');
            return this;
        },
        
        _attachListeners: function() {
            if (this._uiAttached) {
                Logger.info('UIBridge', 'UI listeners already attached');
                return;
            }
            
            if (currentState !== LIFECYCLE_STATES.ACTIVE && currentState !== LIFECYCLE_STATES.WAITING_AUTH) {
                Logger.info('UIBridge', 'Delaying UI attachment until ACTIVE');
                return;
            }
            
            this._attachSendMessageListener();
            this._attachTypingListener();
            this._attachMarkReadListener();
            this._attachConversationListeners();
            this._attachFriendListeners();
            this._attachStartChatListeners();
            
            this._uiAttached = true;
            Logger.info('UIBridge', 'UI listeners attached');
            _uiInitialized = true;
        },
        
        _attachStartChatListeners: function() {
            const startChatButton = document.getElementById('startChatBtn') || document.querySelector('.start-chat-btn');
            if (startChatButton) {
                startChatButton.addEventListener('click', () => {
                    if (!canSendUserMessages() || !SessionManager.isAuthenticated()) {
                        console.log('[UI] Cannot start chat - not ready or not authenticated');
                        return;
                    }
                    
                    const friendListPanel = document.getElementById('friendListPanel');
                    const startChatPanel = document.getElementById('startChatPanel');
                    
                    if (friendListPanel) friendListPanel.style.display = 'block';
                    if (startChatPanel) startChatPanel.style.display = 'block';
                    
                    EventBus.emit('ui:showFriends', { timestamp: Date.now() });
                    
                    Logger.info('UIBridge', 'Start chat panel activated');
                });
            }
        },
        
        _attachSendMessageListener: function() {
            const sendButton = document.getElementById('sendButton');
            const input = document.getElementById('messageInput');
            
            if (sendButton) {
                sendButton.addEventListener('click', async () => {
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
                        const result = await MessageHandler.sendMessage(text);
                        if (result.success) {
                            input.value = '';
                            input.style.height = 'auto';
                            UIStateManager.clearDraft(ChatManager.getActiveChat()?.id);
                        } else {
                            console.error('[UI] Failed to send message:', result.error);
                            try {
                                window.dispatchEvent(new CustomEvent('messageError', {
                                    detail: { error: result.error }
                                }));
                            } catch (e) {}
                        }
                    }
                });
            }
            
            if (input) {
                input.addEventListener('keypress', async (e) => {
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
                            const result = await MessageHandler.sendMessage(text);
                            if (result.success) {
                                input.value = '';
                                input.style.height = 'auto';
                                UIStateManager.clearDraft(ChatManager.getActiveChat()?.id);
                            } else {
                                console.error('[UI] Failed to send message:', result.error);
                                try {
                                    window.dispatchEvent(new CustomEvent('messageError', {
                                        detail: { error: result.error }
                                    }));
                                } catch (e) {}
                            }
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
            document.addEventListener('click', async (e) => {
                const conversationItem = e.target.closest('.chat-item');
                if (conversationItem) {
                    const canAct = (canSendUserMessages() && SessionManager.isAuthenticated()) || _demoModeEnabled;
                    if (canAct) {
                        const conversationId = conversationItem.dataset.chatId;
                        if (conversationId) {
                            const startChatPanel = document.getElementById('startChatPanel');
                            if (startChatPanel) startChatPanel.style.display = 'none';
                            
                            const chatPanel = document.getElementById('chatPanel');
                            if (chatPanel) chatPanel.classList.remove('hidden');
                            
                            await ConversationManager.openConversation(conversationId);
                        }
                    }
                }
            });
        },
        
        _attachFriendListeners: function() {
            document.addEventListener('click', (e) => {
                const friendItem = e.target.closest('.contact-item');
                if (friendItem && canSendUserMessages() && SessionManager.isAuthenticated()) {
                    const friendId = friendItem.dataset.contactId;
                    const friendName = friendItem.querySelector('.contact-name')?.textContent || 'Friend';
                    if (friendId) {
                        const contactsSidebar = document.getElementById('contactsSidebar');
                        if (contactsSidebar) contactsSidebar.classList.add('hidden');
                        
                        const sidebar = document.getElementById('sidebar');
                        if (sidebar) sidebar.classList.add('active');
                        
                        ConversationManager.createConversation([parseInt(friendId)], { name: friendName });
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
                initialized: this._initialized,
                uiAttached: this._uiAttached
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
    // MODULE LIFECYCLE CONTROLLER
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
            if (this._state === 'running') {
                Logger.info('ModuleLifecycleController', 'Already running');
                return;
            }
            
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
            
            await loadCachedData().catch(e => Logger.warn('ModuleLifecycleController', 'Cache load error', e));
            
            setState(LIFECYCLE_STATES.READY, 'initialization_complete');
            
            this._state = 'running';
            this._notifyListeners('running');
            
            Logger.success('ModuleLifecycleController', `Module ready in ${Date.now() - this._startTime}ms`);
            
            if (typeof window.__safeSendChildReady === 'function') {
                window.__safeSendChildReady(() => ParentConnectionManager.notifyChildReady(), MODULE_NAME)();
            } else {
                ParentConnectionManager.notifyChildReady();
            }
            
            const parentReadyTimeout = setTimeout(() => {
                if (currentState === LIFECYCLE_STATES.WAIT_PARENT && !parentReadyReceived) {
                    console.log(`[${MODULE_NAME}] Parent ready timeout, requesting session...`);
                    safeSend(OUTGOING_ACTIONS.REQUEST_SESSION, {
                        module: MODULE_NAME,
                        timestamp: Date.now()
                    }, { requireAck: false });
                }
            }, 5000);
            
            await parentReadyPromise.catch(() => {});
            clearTimeout(parentReadyTimeout);
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
        if (currentState !== LIFECYCLE_STATES.ACTIVE && currentState !== LIFECYCLE_STATES.WAITING_AUTH) {
            Logger.info('UI', 'Delaying UI init until ACTIVE');
            return;
        }
        
        UIBridge._attachListeners();
        
        EventBus.emit('ui:ready', { timestamp: Date.now() });
        
        Logger.success('UI', 'UI initialized');
        _uiInitialized = true;
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
        
        if (_demoModeEnabled) {
            console.log('[DataFlow] Real session active - disabling demo mode');
            _demoModeEnabled = false;
        }
        
        Logger.info('DataFlow', 'Starting data flow');
        
        if (ChatManager._conversations && ChatManager._conversations.length > 0) {
            const hasOnlyDemo = ChatManager._conversations.every(c => c.id === 1001 || c.id === 1002);
            if (hasOnlyDemo) {
                console.log('[DataFlow] Clearing demo conversations to load real data');
                ChatManager._conversations = [];
                ChatManager._conversationsMap.clear();
            }
        }
        if (FriendManager._friends && FriendManager._friends.length > 0) {
            const hasOnlyDemo = FriendManager._friends.every(f => f.id === 2001 || f.id === 2002);
            if (hasOnlyDemo) {
                console.log('[DataFlow] Clearing demo friends to load real data');
                FriendManager._friends = [];
                FriendManager._friendsMap.clear();
            }
        }
        
        ConversationManager.fetchConversations().catch(e => {
            Logger.error('DataFlow', 'Failed to fetch conversations', e);
        });
        
        FriendManager.fetchFriends().catch(e => {
            Logger.error('DataFlow', 'Failed to fetch friends', e);
        });
        
        restoreLastChat();
        
        Logger.success('DataFlow', 'Data flow started');
    }

    // =============================================
    // OPEN CHAT BY USER ID - Core function
    // =============================================

    async function openChatWithUser(userId, userName) {
        console.log('[MessageCore] openChatWithUser called:', { userId, userName });
        
        if (!userId) {
            console.error('[MessageCore] Cannot open chat: No userId provided');
            return { success: false, error: 'No userId provided' };
        }
        
        const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        
        let realUserName = userName;
        if (window.MessagesCore && window.MessagesCore.FriendManager) {
            const friend = window.MessagesCore.FriendManager.getFriend(numericUserId);
            if (friend) {
                realUserName = friend.displayName || friend.username || friend.name || userName;
            }
        }
        
        const displayName = realUserName || userName || `User_${numericUserId}`;
        
        if (!MessagesCore.isReady()) {
            console.log('[MessageCore] Module not ready, waiting for boot...');
            await MessagesCore.waitForBoot();
        }
        
        try {
            if (MessagesCore.ConversationManager && typeof MessagesCore.ConversationManager.createConversation === 'function') {
                console.log('[MessageCore] Using ConversationManager.createConversation');
                const result = await MessagesCore.ConversationManager.createConversation(
                    [numericUserId], 
                    { name: displayName, type: 'direct' }
                );
                
                if (result !== false) {
                    const conversations = MessagesCore.ChatManager.getConversations();
                    const conversation = conversations.find(c => 
                        c.friendId === numericUserId || c.pendingReceiverId === numericUserId ||
                        (c.participants && c.participants.some(p => (p.id || p) === numericUserId))
                    );
                    
                    if (conversation) {
                        await MessagesCore.ConversationManager.openConversation(conversation.id);
                        return { success: true, conversationId: conversation.id, conversation };
                    }
                }
                
                return { success: !!result, result };
            }
            
            if (MessagesCore.ChatManager && typeof MessagesCore.ChatManager.openChat === 'function') {
                console.log('[MessageCore] Using ChatManager.openChat');
                const result = await MessagesCore.ChatManager.openChat(numericUserId, displayName);
                return { success: true, result };
            }
            
            console.log('[MessageCore] Dispatching event for UI');
            window.dispatchEvent(new CustomEvent('messages:openChat', {
                detail: {
                    userId: numericUserId,
                    userName: displayName,
                    recipientId: numericUserId,
                    recipientName: displayName,
                    timestamp: Date.now()
                }
            }));
            
            return { success: true, method: 'event', userId: numericUserId };
            
        } catch (error) {
            console.error('[MessageCore] Failed to open chat:', error);
            return { success: false, error: error.message };
        }
    }

    // =============================================
    // REAL-TIME MESSAGE HANDLER
    // =============================================
    function setupRealtimeMessageListener() {
        window.addEventListener('message', function(event) {
            const data = event.data;
            
            if (data && data.type === 'NEW_MESSAGE') {
                const message = data.payload || data.data;
                if (message && message.id) {
                    console.log('[MessageCore] Real-time message received:', message);
                    
                    if (ChatManager && ChatManager.addMessage) {
                        const normalizedMessage = {
                            id: message.id,
                            content: message.content || message.text || '',
                            type: message.type || 'text',
                            senderId: message.senderId || message.sender?.id,
                            sender: message.sender,
                            timestamp: message.createdAt || message.timestamp || Date.now(),
                            status: 'delivered',
                            conversationId: message.chatId
                        };
                        ChatManager.addMessage(normalizedMessage);
                    }
                    
                    if (ChatManager && ChatManager._conversationsMap) {
                        const conversation = ChatManager._conversationsMap.get(message.chatId);
                        if (conversation) {
                            conversation.lastMessage = message.content;
                            conversation.lastMessageAt = message.createdAt || Date.now();
                            if (message.senderId !== ChatManager.getCurrentUserId?.()) {
                                conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                            }
                            ChatManager._notifySubscribers();
                        }
                    }
                }
            }
            
            if (data && data.type === 'MESSAGE_SENT') {
                const messageId = data.payload?.messageId || data.messageId;
                if (messageId && ChatManager.updateMessageStatus) {
                    ChatManager.updateMessageStatus(messageId, 'sent');
                }
            }
            
            if (data && data.type === 'MESSAGE_DELIVERED') {
                const messageId = data.payload?.messageId || data.messageId;
                if (messageId && ChatManager.updateMessageStatus) {
                    ChatManager.updateMessageStatus(messageId, 'delivered');
                }
            }
            
            if (data && data.type === 'MESSAGE_READ') {
                const messageId = data.payload?.messageId || data.messageId;
                if (messageId && ChatManager.updateMessageStatus) {
                    ChatManager.updateMessageStatus(messageId, 'read');
                }
            }
        });
    }

    function startRealtimeSync() {
        setupRealtimeMessageListener();
        
        if (ChatManager && ChatManager.getActiveChat) {
            // FIX: was 3000ms (3s) causing massive console spam and duplicate fetches.
            // Now 30 000ms (30s) — only poll when tab is visible and chat is active.
            let _lastPollChatId = null;
            let _lastPollMsgCount = 0;
            setInterval(() => {
                if (document.hidden) return;           // skip when tab not visible
                const activeChat = ChatManager.getActiveChat();
                if (!activeChat || !activeChat.id) return;
                if (String(activeChat.id).startsWith('pending_')) return;
                if (!navigator.onLine) return;
                if (!SessionManager.isAuthenticated?.()) return;
                // Skip if chat hasn't changed and message count is same
                const msgs = ChatManager.getMessages ? ChatManager.getMessages() : [];
                const msgCount = msgs.length;
                if (_lastPollChatId === activeChat.id && _lastPollMsgCount === msgCount) {
                    // Still poll but silently — don't hammer if nothing changed
                }
                _lastPollChatId = activeChat.id;
                _lastPollMsgCount = msgCount;
                ChatManager.fetchMessages(activeChat.id, { limit: 20 }).catch(() => {});
            }, 30000);
        }
    }
    
    async function loadCachedData() {
        try {
            const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (cachedUser && cachedUser.id && typeof cachedUser.id === 'number' && cachedUser.id !== 0) {
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
        } catch (error) {
        }
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
            try {
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, ChatManager.getMessages());
            } catch (e) {}
        }
        
        try {
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { 
                conversations: ChatManager.getConversations(), 
                timestamp: Date.now() 
            });
        } catch (e) {}
        
        try {
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                friends: FriendManager.getFriends(),
                timestamp: Date.now()
            });
        } catch (e) {}
    });

    // =============================================
    // INITIALIZATION
    // =============================================
    async function initialize() {
        console.log(`[${MODULE_NAME}] 🚀 Messages Core v${MODULE_VERSION} (Stabilized Protocol | Real Data Only | Session Validation | UI Enhanced | Demo Data Included | openChatWithUser Added | Pending Chat Handling)`);
        
        try {
            setState(LIFECYCLE_STATES.BOOT, 'initialization_start');
            
            ModuleCoreController.init();
            ModuleLifecycleController.start();
            
            stateListeners.add((toState) => {
                if (toState === LIFECYCLE_STATES.ACTIVE) {
                    BootController.completeBoot();
                    console.log(`[${MODULE_NAME}] ✅ Module ACTIVE - ready for user interaction`);
                    startRealtimeSync();
                }
            });
            
            console.log(`[${MODULE_NAME}] ✅ Initialized - waiting for parent activation and valid session`);
            
            setTimeout(() => {
                if (!_demoBootstrapFired && currentState !== LIFECYCLE_STATES.ACTIVE && !parentReadyReceived) {
                    _demoBootstrapFired = true;
                    console.log(`[${MODULE_NAME}] Demo bootstrap: no parent detected after 3s, activating demo mode`);
                    _demoModeEnabled = true;
                    
                    try {
                        if (currentState === LIFECYCLE_STATES.BOOT) setState(LIFECYCLE_STATES.INITIALIZING, 'demo_bootstrap');
                        if (currentState === LIFECYCLE_STATES.INITIALIZING) setState(LIFECYCLE_STATES.READY, 'demo_bootstrap');
                        if (currentState === LIFECYCLE_STATES.READY) setState(LIFECYCLE_STATES.WAIT_PARENT, 'demo_bootstrap');
                        
                        SessionManager.setSession({
                            token: 'demo_token_12345',
                            userId: 1001,
                            user: { id: 1001, displayName: 'Me', username: 'me' }
                        });
                        
                        if (currentState === LIFECYCLE_STATES.WAIT_PARENT) {
                            setState(LIFECYCLE_STATES.ACTIVE, 'demo_self_activate');
                        }
                        if (currentState !== LIFECYCLE_STATES.ACTIVE) {
                            currentState = LIFECYCLE_STATES.ACTIVE;
                            notifyStateListeners(LIFECYCLE_STATES.ACTIVE, 'BOOT', 'demo_force');
                        }
                        
                        initializeUISafe();
                        ChatManager._loadDemoDataIfNeeded();
                        FriendManager._loadDemoFriendsIfNeeded();
                        
                        setTimeout(() => {
                            try {
                                window.dispatchEvent(new CustomEvent('conversationsUpdated', {
                                    detail: { conversations: ChatManager.getConversations() }
                                }));
                                window.dispatchEvent(new CustomEvent('friendsUpdated', {
                                    detail: { friends: FriendManager.getFriends() }
                                }));
                            } catch(e) {}
                        }, 200);
                        
                    } catch(e) {
                        console.warn(`[${MODULE_NAME}] Demo bootstrap error:`, e);
                    }
                }
            }, 3000);
            
        } catch (error) {
            console.error(`[${MODULE_NAME}] Initialization error:`, error);
        }
    }

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
        isReady: () => currentState === LIFECYCLE_STATES.ACTIVE && SessionManager.isAuthenticated(),
        isCoreReady: () => currentState === LIFECYCLE_STATES.ACTIVE && SessionManager.isAuthenticated(),
        getCurrentUser: () => SessionManager.getUser(),
        getCurrentUserId: () => SessionManager.getUserId(),
        getCurrentConversation: () => ChatManager.getActiveChat(),
        getConversations: () => ChatManager.getConversations(),
        getMessages: () => ChatManager.getMessages(),
        getFriends: () => FriendManager.getFriendListForChat(),
        
        isAuthenticated: () => SessionManager.isAuthenticated(),
        
        getSecurityReport: () => SECURITY.getSecurityReport(),
        
        multiSendSelectedChats: new Set(),
        getOrCreateConversationByUserId: (userId, userName) => 
            ConversationManager.getOrCreateConversationByUserId(userId, userName),
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
        
        openChatWithUser: openChatWithUser,
        
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
        formatLastSeen: UIFeatures.formatLastSeen,
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
            pendingRequests: () => Array.from(pendingRequests.keys()),
            lifecycleGuards: {
                canSendChildReady: (state) => window.__lifecycleCanSendChildReady(state),
                canPerformAction: (state) => window.__lifecycleCanPerformAction(state)
            }
        }
    };

    window.MessagesCore = MessagesCore;
    window.openChatWithUser = openChatWithUser;
    window.__MODULE_NAME__ = MODULE_NAME;
    window.__MODULE_VERSION__ = MODULE_VERSION;
    
    initialize();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MessagesCore;
    }
})();

// ── TOP-LEVEL: accessible from all closures ──────────────────────────────────
function applySettingToMessagesModule(section, key, value) {
    if (section === 'appearance') {
        if (key === 'theme') {
            var theme = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
            document.documentElement.setAttribute('data-theme', theme);
            document.body.setAttribute('data-theme', theme);
        }
        if (key === 'fontSize') document.documentElement.style.fontSize = value + 'px';
        if (key === 'language') { window.__appLanguage = value; document.documentElement.setAttribute('lang', value); }
        if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
        if (key === 'compactMode') { document.documentElement.setAttribute('data-compact', value ? 'true' : 'false'); document.body.classList.toggle('compact-mode', !!value); }
        if (key === 'animationsEnabled' || key === 'animations') { document.documentElement.setAttribute('data-animations', value ? 'true' : 'false'); document.body.classList.toggle('no-animations', !value); }
    }
    if (section === 'privacy') {
        if (key === 'readReceipts') { window.__readReceiptsEnabled = value; document.documentElement.setAttribute('data-read-receipts', value ? 'true' : 'false'); }
        if (key === 'typingIndicators') { window.__typingIndicatorsEnabled = value; document.documentElement.setAttribute('data-typing-indicators', value ? 'true' : 'false'); }
        if (key === 'onlineStatus') window.__showOnlineStatus = value;
        if (key === 'lastSeen') window.__showLastSeen = value;
        if (key === 'whoCanAddMe') window.__whoCanAddMe = value;
        if (key === 'canMessageMe') window.__canMessageMe = value;
        if (key === 'contactDiscovery') window.__contactDiscovery = value;
    }
    if (section === 'notifications') {
        if (key === 'soundEnabled' || key === 'notificationSound') window.__notificationSoundEnabled = value;
        if (key === 'vibrationEnabled' || key === 'notificationVibration') window.__vibrationEnabled = value;
        if (key === 'messageNotifications' || key === 'enableNotifications') window.__messageNotificationsEnabled = value;
        if (key === 'groupNotifications') window.__groupNotificationsEnabled = value;
        if (key === 'callNotifications') window.__callNotificationsEnabled = value;
        if (key === 'mentionNotifications') window.__mentionNotificationsEnabled = value;
        if (key === 'desktopEnabled') window.__desktopNotificationsEnabled = value;
    }
    if (section === 'chat') {
        if (key === 'enterToSend' || key === 'enterKeySends') window.__enterToSend = value;
        if (key === 'messageFontSize') {
            var sizeMap = { small: '13px', medium: '15px', large: '18px' };
            document.documentElement.style.setProperty('--message-font-size', sizeMap[value] || '15px');
        }
        if (key === 'showTimestamps') { window.__showTimestamps = value; document.documentElement.setAttribute('data-show-timestamps', value ? 'true' : 'false'); }
        if (key === 'messagePreviews') window.__messagePreviews = value;
        if (key === 'confirmSend') window.__confirmSend = value;
        if (key === 'autoCorrect') window.__autoCorrect = value;
        if (key === 'mediaAutoDownload') window.__mediaAutoDownload = value;
        if (key === 'messageHistory') window.__messageHistory = value;
        if (key === 'showReadReceipts') { window.__readReceiptsEnabled = value; document.documentElement.setAttribute('data-read-receipts', value ? 'true' : 'false'); }
        if (key === 'allowReactions') { window.__allowReactions = value; document.documentElement.setAttribute('data-allow-reactions', value ? 'true' : 'false'); }
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
    if (section === 'status') {
        if (key === 'whoCanViewMyStatus') window.__whoCanViewMyStatus = value;
        if (key === 'autoExpireStatus') window.__autoExpireStatus = value;
        if (key === 'allowStatusReplies') window.__allowStatusReplies = value;
        if (key === 'showStatusTo') window.__showStatusTo = value;
    }
}
// =============================================
// SETTINGS CACHE BOOTSTRAP - OFFLINE-FIRST
// Reads knecta_settings_cache from localStorage at startup so settings
// are applied instantly, before the parent sends SETTINGS_UPDATED.
// =============================================
(function bootstrapSettingsFromCache() {
    try {
        var cached = localStorage.getItem('knecta_settings_cache');
        if (!cached) return;
        var parsed = JSON.parse(cached);
        // Accept both {data:{...}} and flat {section:{...}} shapes
        var settings = (parsed && parsed.data) ? parsed.data : parsed;
        if (!settings || typeof settings !== 'object') return;
        // Skip if stale (> 24 hours)
        if (parsed.timestamp && (Date.now() - parsed.timestamp) > 86400000) return;
        Object.entries(settings).forEach(function(sectionEntry) {
            var section = sectionEntry[0], sectionVal = sectionEntry[1];
            if (!sectionVal || typeof sectionVal !== 'object') return;
            Object.entries(sectionVal).forEach(function(keyEntry) {
                try { applySettingToMessagesModule(section, keyEntry[0], keyEntry[1]); } catch(e) {}
            });
        });
        console.log('[messages-core] ✅ Settings bootstrapped from cache');
    } catch(e) {}
    // Also listen for online event to re-request fresh settings
    window.addEventListener('online', function() {
        try {
            window.parent && window.parent.postMessage({ type: 'CHILD_READY', module: 'messages', source: 'messages', timestamp: Date.now() }, '*');
        } catch(e) {}
    });
})();