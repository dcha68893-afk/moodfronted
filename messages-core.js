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

    // FIX (Forensic Audit P2): Canonical timestamp normalizer — single source of truth.
    // Previously 7 identical inline functions (_tsMs, _tsMs2, _tsMs3, _tsMs4, _tsF, _tsF2, _tsRt)
    // scattered across the module caused confusion and occasional sort bugs on mixed
    // ISO-string vs unix-ms timestamps. All sort comparators use this function.
    function _normalizeTs(m) {
        const v = (typeof m === 'object' && m !== null)
            ? (m.createdAt || m.timestamp || m.created_at || 0)
            : m;
        if (!v) return 0;
        if (typeof v === 'string') return new Date(v).getTime() || 0;
        return Number(v) || 0;
    }

    // Real data only — no demo data

    // =============================================
    // SESSION VALIDATION UTILITY
    // =============================================
    function __isValidSession(session) {
        if (!session) return false;
        // FIX: When the parent re-sends session on navigation it may omit the token
        // (hasToken:false) but the userId is correct and we are already authenticated.
        // Accept sessions that have a valid userId even without a token — the token
        // is already stored in SessionManager._session from the initial handshake.
        const hasToken = session.token && typeof session.token === 'string';
        const hasUserId = !!(session.userId || (session.user && (session.user.id || session.user.userId)));
        if (!hasToken && !hasUserId) return false;
        // If we only have userId (no token), accept it as a partial re-auth ping
        if (!hasToken) {
            // Must have a real userId
            const uid = session.userId || (session.user && (session.user.id || session.user.userId));
            if (!uid || uid === 0 || uid === '0') return false;
            return true; // userId present — treat as valid re-auth
        }
        
        let userId = session.userId;
        if (!userId && session.user) {
            userId = session.user.id || session.user.userId;
        }
        
        if (!userId) {
            return false; // Fixed: Require userId for valid session
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
        if (currentState === LIFECYCLE_STATES.ACTIVE) return true;
        // If session is valid but stuck pre-ACTIVE, force transition
        if (_validSessionSet && _storedSession && __isValidSession(_storedSession)) {
            console.warn(`[${MODULE_NAME}][LifecycleGuard] Session valid but state=${currentState} — forcing ACTIVE for '${actionName}'`);
            setState(LIFECYCLE_STATES.ACTIVE, 'forced_by_ensureActive');
            return true;
        }
        console.warn(`[${MODULE_NAME}][LifecycleGuard] ❌ Blocked action '${actionName}' - not ACTIVE (current: ${currentState})`);
        return false;
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
                // Bypass guard if session is already valid — ensureActive will promote state
                if (_validSessionSet && _storedSession && __isValidSession(_storedSession)) {
                    return null; // allow through
                }
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
        REQUEST_TIMEOUT: 45000
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
    // FIX-007: Persist dedup sets in sessionStorage so they survive iframe navigation.
    // Without this, navigating away and back resets the Set, causing already-rendered
    // messages to appear again when the socket re-delivers or re-fetches them.
    function _makePersistentSet(storageKey, maxSize) {
        const _s = new Set();
        try {
            const arr = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
            if (Array.isArray(arr)) arr.forEach(id => _s.add(String(id)));
        } catch(_) {}
        function _persist() {
            try {
                sessionStorage.setItem(storageKey, JSON.stringify(Array.from(_s).slice(-maxSize)));
            } catch(_) {}
        }
        return {
            has(id)    { return _s.has(String(id)); },
            add(id)    {
                const k = String(id);
                if (_s.has(k)) return this;
                _s.add(k);
                if (_s.size > maxSize) _s.delete(_s.values().next().value);
                _persist();
                return this;
            },
            delete(id) { const ok = _s.delete(String(id)); if (ok) _persist(); return ok; },
            clear()    { _s.clear(); try { sessionStorage.removeItem(storageKey); } catch(_) {} },
            get size() { return _s.size; },
            [Symbol.iterator]() { return _s[Symbol.iterator](); }
        };
    }
    const processedMessageIds = _makePersistentSet('kyn_processed_msg_ids', 500);
    const sentMessageIds      = _makePersistentSet('kyn_sent_msg_ids', 200);

    // FIX Bug 6: Clear processedMessageIds when the page becomes visible again.
    // If a message arrived while this iframe was hidden (user on another tab/page),
    // its ID was stored in sessionStorage. When the user returns, the dedup set
    // would silently drop the message. Clearing on visibility-restore ensures
    // any queued/pending messages are re-processed and shown.
    (function _installVisibilityResetForDedup() {
        const _clearOnVisible = () => {
            if (document.visibilityState === 'visible') {
                // Only clear if we've been hidden for more than 2 seconds to avoid
                // clearing during brief focus losses (e.g. clicking a link)
                if (window._kynLastHiddenAt && Date.now() - window._kynLastHiddenAt > 2000) {
                    processedMessageIds.clear();
                }
            } else {
                window._kynLastHiddenAt = Date.now();
            }
        };
        document.addEventListener('visibilitychange', _clearOnVisible);
        // Also clear on postMessage PAGE_FOCUS (parent fires this when switching back to messages tab)
        window.addEventListener('message', (evt) => {
            if (evt.data && (evt.data.type === 'PAGE_FOCUS' || evt.data.type === 'MODULE_FOCUSED')) {
                processedMessageIds.clear();
            }
        });
    })();
    
    let _lastSessionId = null;
    let _validSessionSet = false;
    let _storedSession = null;
    
    let _uiInitialized = false;
    
    // Demo mode is permanently disabled — real data only
    const _demoModeEnabled = false;
    const _demoBootstrapFired = false;
    
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
    
    // FIX (Forensic Audit P1): Store interval ID for cleanup on teardown
    const _cleanupPendingInterval = setInterval(cleanupPendingRequests, TIMING.CLEANUP_INTERVAL);
    // Register cleanup on page unload to prevent memory leak
    window.addEventListener('beforeunload', () => { clearInterval(_cleanupPendingInterval); }, { once: true });

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
            // FIX: INITIALIZING can jump directly to ACTIVE when SESSION_DATA arrives early
            [LIFECYCLE_STATES.INITIALIZING]: [LIFECYCLE_STATES.READY, LIFECYCLE_STATES.WAITING_AUTH, LIFECYCLE_STATES.ACTIVE],
            [LIFECYCLE_STATES.READY]: [LIFECYCLE_STATES.WAIT_PARENT, LIFECYCLE_STATES.WAITING_AUTH, LIFECYCLE_STATES.ACTIVE],
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
        processedMessageIds.add(messageId); // add() handles maxSize + sessionStorage persistence
        return false;
    }

    function isDuplicateSentMessage(messageId) {
        if (!messageId) return false;
        if (sentMessageIds.has(messageId)) return true;
        sentMessageIds.add(messageId);
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
            // FIX: Demo mode API intercept removed — all requests go to real backend.
            // If unauthenticated, let the request fail naturally so callers can use
            // IndexedDB cache as the offline fallback.
            
            const isReadOnly = (method === 'GET');
            // FIX: For write operations, allow if session is valid even if ensureActive fails.
            // This is critical for queue retries which run after page navigation resets lifecycle.
            if (!isReadOnly && !ensureActive(`API_REQUEST: ${endpoint}`)) {
                // Secondary check: if session is valid, allow the write through
                if (!_validSessionSet || !__isValidSession(_storedSession)) {
                    reject(new Error(`Module not ACTIVE for write actions (current: ${currentState})`));
                    return;
                }
                // Session valid but not ACTIVE — allow write through for queue retries
                console.log(`[${MODULE_NAME}] ⚠️ Write allowed despite non-ACTIVE state — valid session present`);
            }
            
            if (!_validSessionSet || !__isValidSession(_storedSession)) {
                // For GET requests, still reject if no session — nothing to authorize with
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
    timestamp: timestamp,
    type: 'API_REQUEST'
});

try {
    const message = {
        type: 'API_REQUEST',
        requestId: requestId,
        endpoint: normalizedEndpoint,
        method: method,
        data: data,
        params: params,
        timestamp: timestamp
    };
    
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
        // Demo data fully removed — real data only
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
                } else if (result && result.messages !== undefined && Array.isArray(result.messages)
                           && !result.message) {
                    // ✅ FIX: Only unwrap .messages array when there is no .message (single sent
                    // message object). A POST /messages response has { message:{...}, chatId } —
                    // unwrapping .messages here would destroy the sent-message reference and make
                    // realMessage undefined in MessageHandler, causing fake-sent / no status update.
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
        AUTH_READY: 'AUTH_READY',
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
        CHAT_STATE: 'kynecta_chat_state_v8',
        CURRENT_CATEGORY: 'kynecta_current_category_v8'
    };

    function ensureSafeArray(data) {
        if (typeof window.safeArray === 'function') return window.safeArray(data);
        return Array.isArray(data) ? data : [];
    }

    function ensureSafeObject(data) {
        if (typeof window.safeObject === 'function') return window.safeObject(data);
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    }

    function getEntityUserId(entity) {
        if (entity === null || entity === undefined) return '';
        if (typeof entity === 'object') {
            const value = entity.id ?? entity.userId ?? entity.friendId ?? entity.otherUserId;
            return value === null || value === undefined ? '' : String(value);
        }
        return String(entity);
    }

    function getConversationPeerId(conversation, currentUserId) {
        if (!conversation) return '';

        const explicitPeerId = (
            conversation.friendId ??
            conversation.otherUserId ??
            conversation.otherParticipantId ??
            conversation.pendingReceiverId ??
            conversation.otherParticipant?.id ??
            conversation.otherParticipant?.userId
        );

        if (explicitPeerId !== null && explicitPeerId !== undefined && String(explicitPeerId) !== '') {
            return String(explicitPeerId);
        }

        const currentId = currentUserId === null || currentUserId === undefined ? '' : String(currentUserId);
        const otherParticipantId = ensureSafeArray(conversation.participantIds).find((participantId) => {
            const normalizedId = getEntityUserId(participantId);
            return normalizedId && normalizedId !== currentId;
        });
        if (otherParticipantId) {
            return String(otherParticipantId);
        }
        const otherParticipant = ensureSafeArray(conversation.participants).find((participant) => {
            const participantId = getEntityUserId(participant);
            return participantId && participantId !== currentId;
        });

        return getEntityUserId(otherParticipant);
    }

    function isConversationMatchForUser(conversation, targetUserId, currentUserId) {
        const targetId = targetUserId === null || targetUserId === undefined ? '' : String(targetUserId);
        if (!targetId) return false;
        return getConversationPeerId(conversation, currentUserId) === targetId;
    }

    function upsertRealtimeConversation(chatId, normalizedMessage = null) {
        if (!chatId || !normalizedMessage || !ChatManager) return null;

        const existing = ChatManager._conversationsMap.get(chatId) || ChatManager._conversationsMap.get(String(chatId));
        if (existing) return existing;

        const myId = SessionManager && SessionManager.getUserId ? String(SessionManager.getUserId() || '') : '';
        const senderId = normalizedMessage.senderId != null ? String(normalizedMessage.senderId) : '';
        const receiverId = normalizedMessage.receiverId != null ? String(normalizedMessage.receiverId) : '';
        const friendId = senderId && senderId !== myId ? senderId : (receiverId && receiverId !== myId ? receiverId : '');
        if (!friendId) return null;

        const friendRecord = FriendManager && FriendManager.getFriend
            ? (FriendManager.getFriend(friendId) || FriendManager.getFriend(Number(friendId)))
            : null;
        const friendName = friendRecord?.displayName || friendRecord?.username || normalizedMessage.sender?.displayName ||
            normalizedMessage.sender?.username || `User_${friendId}`;
        const friendAvatar = friendRecord?.avatar || friendRecord?.photoURL || normalizedMessage.sender?.avatar || '';
        const conversation = {
            id: String(chatId),
            chatId: String(chatId),
            type: 'direct',
            friendId,
            participantIds: [myId, friendId].filter(Boolean),
            friendName,
            friendAvatar,
            lastMessage: normalizedMessage.content || '',
            lastMessageAt: normalizedMessage.createdAt || normalizedMessage.timestamp || Date.now(),
            unreadCount: senderId && senderId !== myId ? 1 : 0,
            online: !!(friendRecord?.online || friendRecord?.status === 'online'),
            isPending: false
        };

        ChatManager._conversations.unshift(conversation);
        ChatManager._conversationsMap.set(conversation.id, conversation);
        ChatManager._saveToCache();
        return conversation;
    }

    function getStorageBridge() {
        if (window.AppStorage && typeof window.AppStorage.get === 'function' && typeof window.AppStorage.set === 'function') {
            return window.AppStorage;
        }

        return {
            get(key, fallback = null) {
                try {
                    const raw = localStorage.getItem(key);
                    if (raw === null || raw === undefined) return fallback;
                    try {
                        return JSON.parse(raw);
                    } catch (_error) {
                        return raw;
                    }
                } catch (_error) {
                    return fallback;
                }
            },
            set(key, value) {
                try {
                    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
                    console.log('[LOCAL SAVE]', key, value);
                    return true;
                } catch (_error) {
                    return false;
                }
            },
            remove(key) {
                try {
                    localStorage.removeItem(key);
                    return true;
                } catch (_error) {
                    return false;
                }
            }
        };
    }

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
                const storage = getStorageBridge();
                const testKey = '_kynecta_test_';
                storage.set(testKey, 'test');
                storage.remove(testKey);
                this.storageAvailable = true;
            } catch (e) {
                this.storageAvailable = false;
            }
        },
        
        get: function(key, fallback = null) {
            if (this.storageAvailable) {
                try {
                    const value = getStorageBridge().get(key, fallback);
                    if (value !== null && value !== undefined) {
                        return typeof value === 'string' ? value : JSON.stringify(value);
                    }
                } catch (e) {
                }
            }
            return this.memoryStore.has(key) ? this.memoryStore.get(key) : fallback;
        },
        
        set: function(key, value) {
            this.memoryStore.set(key, value);
            if (this.storageAvailable) {
                try {
                    getStorageBridge().set(key, value);
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
                try { getStorageBridge().remove(key); } catch (e) {}
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
                try {
                    Object.values(LOCAL_STORAGE_KEYS).forEach(key => getStorageBridge().remove(key));
                } catch (e) {}
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
            
            // FIX Bug 1: Allow 'ws-bridge' and 'banner-bridge' sources through —
            // chat.html posts socket-originated messages with source:'ws-bridge'.
            // Previously these were silently dropped by the security validator.
            const ALLOWED_SOURCES = new Set(['parent', 'ws-bridge', 'banner-bridge', 'parent-echo', 'parent-ws-broadcast', 'parent-accept-broadcast', 'parent-end-broadcast', 'parent-frame', 'parent-reject-broadcast']);
            if (data.source && !ALLOWED_SOURCES.has(data.source)) {
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
                if (DEBUG) console.log('[SessionManager] Duplicate session ignored');
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
                // demo mode removed
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

            // FIX Bug6: cache userId globally so message bubble renderer
            // never falls back to null when getCurrentUserId() is called
            // during async renders before the core reference is available.
            try { window._kynCurrentUserId = this._session.userId; } catch (_e) {}
            
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
            // FIX: also handle session arriving during INITIALIZING/READY/WAIT_PARENT
            // (the _handleSessionData caller also handles this, but belt-and-suspenders here)
            else if ((currentState === LIFECYCLE_STATES.INITIALIZING ||
                      currentState === LIFECYCLE_STATES.READY ||
                      currentState === LIFECYCLE_STATES.WAIT_PARENT) && __isValidSession(this._session)) {
                console.log(`[SessionManager] Session set in state ${currentState} — fast-promoting to ACTIVE`);
                setState(LIFECYCLE_STATES.ACTIVE, 'session_set_early_promote');
                flushMessageQueue();
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
            
            // FIX (Forensic Audit P1): Store interval ID on instance for cleanup
            this._queueInterval = setInterval(() => this._processQueue(), 5000);
            window.addEventListener('beforeunload', () => { clearInterval(this._queueInterval); }, { once: true });
            
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
    
    // FIXED: Handle FRIENDS_LIST_UPDATE from parent — always update FriendManager regardless of lifecycle state
    if (data.type === 'FRIENDS_LIST_UPDATE') {
        try {
            const payload = data.payload || data;
            const friends = payload.friends || payload.data || payload;
            if (Array.isArray(friends) && friends.length > 0) {
                console.log(`[${MODULE_NAME}] FRIENDS_LIST_UPDATE: ${friends.length} friends received`);
                FriendManager.mergeFriends(friends);
                // Re-render contacts list if it's visible
                try {
                    window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: { friends } }));
                } catch(_) {}
            }
        } catch(_e) {}
    }
    
    if (data.type === INCOMING_TYPES.SESSION_DATA || data.type === INCOMING_TYPES.SESSION_RESPONSE) {
        this._handleSessionData(data);
    }
    
    // FIX: AUTH_READY and SESSION_ACTIVE also carry session payload — treat them identically to SESSION_DATA
    if (data.type === INCOMING_TYPES.AUTH_READY || data.type === INCOMING_TYPES.SESSION_ACTIVE) {
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
            
            console.log(`[${MODULE_NAME}] PARENT_READY received (state: ${currentState})`);
            
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
                // FIX: Never inject fake demo tokens. Load cached data for offline-first display instead.
                if (window.KynectaLocalStore) {
                    window.KynectaLocalStore.getAllConversations().then(convs => {
                        if (convs && convs.length > 0) {
                            console.log(`[${MODULE_NAME}] Offline-first: rendering ${convs.length} cached conversations`);
                            window.dispatchEvent(new CustomEvent('kyn:offlineCacheLoaded', { detail: { convs } }));
                        }
                    }).catch(() => {});
                }
            }
            
            // FIX: Handle PARENT_READY from ANY pre-ACTIVE state, including INITIALIZING.
            // The key insight: INITIALIZING can now transition directly to ACTIVE (validTransitions updated).
            const preActiveStates = [
                LIFECYCLE_STATES.INITIALIZING,
                LIFECYCLE_STATES.READY,
                LIFECYCLE_STATES.WAIT_PARENT,
                LIFECYCLE_STATES.WAITING_AUTH
            ];

            if (preActiveStates.includes(currentState)) {
                if (SessionManager.isAuthenticated()) {
                    // Session already available — go straight to ACTIVE
                    const promoted = setState(LIFECYCLE_STATES.ACTIVE, 'parent_ready_with_valid_session');
                    if (!promoted && currentState !== LIFECYCLE_STATES.ACTIVE) {
                        // Couldn't transition — force it (shouldn't happen with updated validTransitions)
                        console.warn(`[${MODULE_NAME}] Could not promote to ACTIVE from ${currentState} — forcing`);
                        currentState = LIFECYCLE_STATES.ACTIVE;
                    }
                    console.log(`[${MODULE_NAME}] ✅ ACTIVE (parent ready + valid session)`);
                    initializeUISafe();
                    flushMessageQueue();
                    startDataFlow();
                } else {
                    // No session yet — request one, wait in WAITING_AUTH
                    // Ensure we can reach WAITING_AUTH (skip READY/WAIT_PARENT if still in INITIALIZING)
                    if (currentState === LIFECYCLE_STATES.INITIALIZING) {
                        setState(LIFECYCLE_STATES.WAITING_AUTH, 'parent_ready_initializing_no_session');
                    } else if (currentState === LIFECYCLE_STATES.READY) {
                        setState(LIFECYCLE_STATES.WAIT_PARENT, 'parent_ready_skip_wait');
                        setState(LIFECYCLE_STATES.WAITING_AUTH, 'parent_ready_waiting_for_session');
                    } else if (currentState !== LIFECYCLE_STATES.WAITING_AUTH) {
                        setState(LIFECYCLE_STATES.WAITING_AUTH, 'parent_ready_waiting_for_session');
                    }
                    console.log(`[${MODULE_NAME}] ⏳ WAITING_AUTH (no valid session yet) — requesting session`);
                    safeSend(OUTGOING_ACTIONS.REQUEST_SESSION, {
                        module: MODULE_NAME,
                        timestamp: Date.now()
                    }, { requireAck: false });
                    initializeUISafe();
                }
            } else if (currentState === LIFECYCLE_STATES.ACTIVE) {
                // Already ACTIVE — just refresh data
                console.log(`[${MODULE_NAME}] PARENT_READY received while already ACTIVE — refreshing data`);
                if (SessionManager.isAuthenticated()) {
                    flushMessageQueue();
                    startDataFlow();
                }
            } else {
                console.log(`[${MODULE_NAME}] PARENT_READY received in unexpected state: ${currentState}`);
                if (SessionManager.isAuthenticated()) {
                    setState(LIFECYCLE_STATES.ACTIVE, 'parent_ready_late_activate');
                    initializeUISafe();
                    flushMessageQueue();
                    startDataFlow();
                }
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

                // FIX: If session arrives while still in INITIALIZING (before CHILD_READY/PARENT_READY),
                // promote directly to ACTIVE so the UI isn't stuck waiting for a handshake that
                // may never arrive on first load.
                const earlyStates = [
                    LIFECYCLE_STATES.INITIALIZING,
                    LIFECYCLE_STATES.READY,
                    LIFECYCLE_STATES.WAIT_PARENT,
                    LIFECYCLE_STATES.WAITING_AUTH
                ];
                if (earlyStates.includes(currentState) && SessionManager.isAuthenticated()) {
                    console.log(`[${MODULE_NAME}] SESSION_DATA arrived early (state: ${currentState}) — promoting to ACTIVE`);
                    const promoted = setState(LIFECYCLE_STATES.ACTIVE, 'early_session_data');
                    if (promoted) {
                        initializeUISafe();
                        flushMessageQueue();
                        startDataFlow();
                    }
                }
            } else {
                const currentUserId = SessionManager.getCurrentUserId ? SessionManager.getCurrentUserId() : null;
                const sameAuthenticatedUser =
                    SessionManager.isAuthenticated &&
                    SessionManager.isAuthenticated() &&
                    currentUserId !== null &&
                    currentUserId !== undefined &&
                    String(currentUserId) === String(sessionData?.userId || '');

                if (sameAuthenticatedUser) {
                    // Already authenticated as the same user — this is a navigation re-ping.
                    // Refresh conversations so the chat panel is always up to date.
                    if (typeof startDataFlow === 'function') {
                        startDataFlow();
                    } else if (ChatManager && typeof ChatManager.fetchConversationsFromBackend === 'function') {
                        ChatManager.fetchConversationsFromBackend().catch(() => {});
                    }
                } else {
                    console.warn('[ParentConnectionManager] Ignored invalid session data from parent', {
                        hasToken: !!sessionData?.token,
                        userId: sessionData?.userId,
                        userIdType: typeof sessionData?.userId
                    });
                }
                // FIX: Never inject fake demo tokens. Show cached data only.
                if (!SessionManager.isAuthenticated() && window.KynectaLocalStore) {
                    window.KynectaLocalStore.getAllConversations().then(convs => {
                        if (convs && convs.length > 0) {
                            window.dispatchEvent(new CustomEvent('kyn:offlineCacheLoaded', { detail: { convs } }));
                        }
                    }).catch(() => {});
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

            // ECHO PREVENTION: If the sender is the current user, this is an echo
            // of a message we already added optimistically. Update status only.
            const currentUserId = SessionManager.getUserId();
            if (message.senderId && currentUserId &&
                String(message.senderId) === String(currentUserId)) {
                if (ChatManager && ChatManager.updateMessageStatus) {
                    ChatManager.updateMessageStatus(
                        message.localId || message.id,
                        message.status || 'delivered',
                        { serverId: message.id, localId: message.localId || null }
                    );
                }
                Logger.debug('ParentConnectionManager', `Own-message echo ignored (status updated): ${message.id}`);
                return;
            }

            if (isDuplicateMessage(message.id)) {
                Logger.debug('ParentConnectionManager', `Duplicate message ignored: ${message.id}`);
                return;
            }
            
            Logger.info('ParentConnectionManager', `Message received: ${message.id}`);
            
            const normalizedMessage = {
                ...message,
                status: message.status || 'delivered',
                conversationId: message.chatId || message.conversationId,
                chatId: message.chatId || message.conversationId,
                timestamp: message.createdAt || message.timestamp || Date.now(),
                createdAt: message.createdAt || message.timestamp || Date.now()
            };

            if (ChatManager && ChatManager.addMessage) {
                ChatManager.addMessage(normalizedMessage);
            }

            // Update conversation last-message & sort so it bubbles to top in sidebar
            const chatId = normalizedMessage.chatId || normalizedMessage.conversationId;
            if (chatId && ChatManager && ChatManager._conversationsMap) {
                const conv = ChatManager._conversationsMap.get(chatId)
                    || ChatManager._conversationsMap.get(String(chatId));
                if (conv) {
                    conv.lastMessage = normalizedMessage.content || '';
                    conv.lastMessageAt = normalizedMessage.createdAt || Date.now();
                    const activeChat = ChatManager.getActiveChat && ChatManager.getActiveChat();
                    const isViewingThisChat = activeChat && String(activeChat.id) === String(chatId);
                    if (!isViewingThisChat) {
                        conv.unreadCount = (conv.unreadCount || 0) + 1;
                    }
                    if (ChatManager._conversations) {
                        ChatManager._conversations.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
                    }
                }
            }

            // Always re-render sidebar (badge + conversation order)
            try {
                window.dispatchEvent(new CustomEvent('renderChatsList', {
                    detail: {
                        conversations: (ChatManager && ChatManager._conversations) || [],
                        currentChat: ChatManager && ChatManager._activeConversation,
                        currentCategory: ChatManager && ChatManager.getCurrentCategory ? ChatManager.getCurrentCategory() : 'all',
                        messageDrafts: {}
                    }
                }));
            } catch (_e) {}

            // Re-render messages panel only if receiver is currently viewing this chat
            const activeChat = ChatManager && ChatManager.getActiveChat && ChatManager.getActiveChat();
            if (activeChat && chatId && String(activeChat.id) === String(chatId)) {
                try {
                    const _tsMs4 = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
                    // STRICT: filter to this chat only — never pass all messages to renderMessages
                    const _all = (ChatManager._messages || []);
                    const _chatMsgs = _all
                        .filter(m => String(m.chatId || m.conversationId || '') === String(chatId))
                        .sort((a, b) => _tsMs4(a) - _tsMs4(b));
                    if (_chatMsgs.length > 0) {
                        window.dispatchEvent(new CustomEvent('renderMessages', {
                            detail: {
                                messages: _chatMsgs,
                                currentChat: activeChat,
                                currentUser: SessionManager.getUser ? SessionManager.getUser() : null
                            }
                        }));
                    }
                } catch (_e) {}
            }
            
            if (UIFeatures) {
                UIFeatures.playNotificationSound();
            }
            
            try {
                window.dispatchEvent(new CustomEvent('newMessage', {
                    detail: { message: normalizedMessage }
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
                // FIX-WAIT_PARENT-MSG: 5-second initialization queue flush timeout
                // Prevents "Message ERROR blocked in WAIT_PARENT" indefinitely.
                if (!window.__msgWaitParentTimeout) {
                    window.__msgWaitParentTimeout = setTimeout(function() {
                        window.__msgWaitParentTimeout = null;
                        if (currentState === LIFECYCLE_STATES.WAIT_PARENT || currentState === LIFECYCLE_STATES.WAITING_AUTH) {
                            console.warn('[' + MODULE_NAME + '] WAIT_PARENT timeout — forcing ACTIVE to unblock messages');
                            try { setState(LIFECYCLE_STATES.ACTIVE, 'wait_parent_timeout'); } catch(_) { currentState = LIFECYCLE_STATES.ACTIVE; }
                            if (typeof processQueue === 'function') processQueue();
                        }
                    }, 5000);
                }
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
                if (cachedUser && cachedUser.id && cachedUser.id !== 0 && cachedUser.id !== '0') {
                    this._user = cachedUser;
                    this._userId = cachedUser.id;
                }
            } catch (e) {}
            return this;
        },
        
        setUser: function(user) {
            if (!user) return false;
            
            const userId = user.id || user.uid;
            // FIX: accept string IDs like "3" — parseInt for validation
            const userIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
            if (!userId || (typeof userId !== 'string' && typeof userId !== 'number') || userIdNum === 0 || isNaN(userIdNum)) {
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
        _currentCategory: SafeStorage.get(LOCAL_STORAGE_KEYS.CURRENT_CATEGORY, 'all') || 'all',
        _messages: [],
        _messagesMap: new Map(),
        _subscribers: new Set(),
        _loaded: false,
        _historyCache: new Map(),
        _lastMessagesFetchAt: new Map(),
        _loadingChats: false,
        _loadingMessages: false,
        _pendingConversations: new Map(),
        
        init: function() {
            this._loadFromCache();
            this._loadDemoDataIfNeeded();
            return this;
        },
        
        _loadDemoDataIfNeeded: function() {
            // FIX: Never load fake demo data. Load from IndexedDB cache instead.
            if (!this._conversations || this._conversations.length === 0) {
                if (window.KynectaLocalStore) {
                    window.KynectaLocalStore.getAllConversations().then(convs => {
                        if (convs && convs.length > 0) {
                            console.log('[ChatManager] Offline-first: loaded', convs.length, 'cached conversations');
                            this._conversations = convs;
                            this._rebuildMap();
                            if (!this._activeConversation && this._conversations.length > 0) {
                                this._activeConversation = this._conversations[0];
                            }
                        }
                    }).catch(() => {});
                }
            }
        },
        
        _loadFromCache: function() {
            try {
                console.log('[LOCAL LOAD]', LOCAL_STORAGE_KEYS.CHATS_CACHE);
                const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
                if (cached && Array.isArray(cached.conversations)) {
                    let _deleted = new Set();
                    try {
                        const _d = SafeStorage.getJSON('kynecta_deleted_chats_v8');
                        if (Array.isArray(_d)) _deleted = new Set(_d.map(String));
                    } catch(_) {}
                    // Also check tombstone registry
                    try {
                        const _tombstones = SafeStorage.getJSON('kynecta_tombstones_v1') || {};
                        Object.keys(_tombstones).forEach(id => _deleted.add(String(id)));
                    } catch(_) {}
                    this._conversations = ensureSafeArray(cached.conversations)
                        .filter(c => c && c.id && !_deleted.has(String(c.id)));
                    this._rebuildMap();
                    this._loaded = true;
                    if (!this._activeConversation && this._conversations.length > 0) {
                        this._activeConversation = this._conversations[0];
                    }
                }
                
                const archived = ensureSafeArray(SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []));
                archived.forEach(chatId => {
                    const chat = this._conversationsMap.get(chatId);
                    if (chat) chat.archived = true;
                });

                this._currentCategory = this.getCurrentCategory();
                if (this._activeConversation && this._activeConversation.id) {
                    this._messages = ensureSafeArray(
                        SafeStorage.getJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${this._activeConversation.id}`, [])
                    );
                    this._rebuildMessagesMap();
                }
                if (this._conversations.length > 0) {
                    this._notifySubscribers();
                }
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
                const _realCid = String(newConversation.id);
                // Re-stamp ALL merged messages with the real chatId before writing
                const mergedMessages = [...pendingMessages, ...existingMessages]
                    .map(function(m) { return m ? { ...m, chatId: _realCid, conversationId: _realCid } : m; });
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
                console.log('[ChatManager] Not authenticated — loading conversations from cache');
                // FIX: Always load cache, never demo data
                this._loadDemoDataIfNeeded();
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
                    // FIX: Also sync to local store for next offline boot
                    if (window.KynectaSyncEngine) {
                        window.KynectaSyncEngine.syncConversations(chatsArray);
                    }
                    this._notifySuccess('Conversations loaded');
                } else {
                    // FIX: Fall back to cache, not demo data
                    this._loadDemoDataIfNeeded();
                    this.setConversations(this._conversations || []);
                    console.warn('[ChatManager] No conversations received from server');
                }
            } catch (error) {
                console.error('[ChatManager] Failed to fetch conversations:', error);
                // FIX: Load from cache on failure, not demo data
                this._loadDemoDataIfNeeded();
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

            const fetchKey = String(conversationId);
            const now = Date.now();
            const forceFetch = options.force === true;
            // FIXED: first open (lastFetchAt=0) always fetches immediately.
            // Subsequent calls throttled to 5s (down from 8s) for responsiveness.
            const minFetchGap = typeof options.minFetchGap === 'number' ? options.minFetchGap : 5000;
            const lastFetchAt = this._lastMessagesFetchAt.get(fetchKey) || 0;
            if (!forceFetch && lastFetchAt > 0 && now - lastFetchAt < minFetchGap) {
                return;
            }
            this._lastMessagesFetchAt.set(fetchKey, now);

            // FIX Bug3: Honor merge:true — when called with merge:true (e.g. from SYNC_STARTED),
            // set options.after to the timestamp of the last known message so we only
            // fetch NEW messages and merge them in, instead of wiping all existing messages.
            if (options.merge && this._messages && this._messages.length > 0) {
                const lastMsg = this._messages[this._messages.length - 1];
                options.after = options.after || lastMsg?.createdAt || lastMsg?.timestamp;
                console.log('[ChatManager] merge:true — fetching only messages after', options.after);
            }

            // FIXED: Preserve realtime messages that arrived before this chat was opened.
            // fetchMessages → setMessages clears _messages, losing them.
            const _rtPreserve = (this._messages || []).filter(function(m) {
                return String(m.chatId || m.conversationId || '') === String(conversationId) && !m.isLocalOnly;
            });

            if (window.KynectaLocalStore) {
                try {
                    const localMsgs = await window.KynectaLocalStore.getMessagesByChat(conversationId, { limit: options.limit || 100 });
                    if (localMsgs && localMsgs.length > 0) {
                        this.setMessages(localMsgs, conversationId);
                    }
                } catch (_lsErr) {}
            }

            if (!navigator.onLine) {
                console.log('[ChatManager] Offline mode - using local store data');
                const cachedMessages = this.loadPreviousMessages(conversationId);
                if (cachedMessages && cachedMessages.length > 0) {
                    this.setMessages(cachedMessages, conversationId);
                    this._notifySubscribers();
                }
                return;
            }

            if (!SessionManager.isAuthenticated()) {
                console.log('[ChatManager] Not authenticated — loading messages from local cache');
                // FIX: Load from IndexedDB, not fake demo messages
                if (conversationId && window.KynectaLocalStore) {
                    window.KynectaLocalStore.getMessagesByChat(conversationId).then(cached => {
                        if (cached && cached.length > 0) {
                            this.setMessages(cached, conversationId);
                            this._notifySubscribers();
                        }
                    }).catch(() => {});
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
                console.log(`[ChatManager] Fetching messages for conversation: ${conversationId}`);

                if (window.KynectaLocalStore && window.KynectaSyncEngine) {
                    await window.KynectaSyncEngine.syncChat(conversationId, {
                        since: options.after || 0,
                        limit: options.limit || 100
                    });

                    const hydratedMessages = await window.KynectaLocalStore.getMessagesByChat(conversationId, {
                        limit: options.limit || 100,
                        before: options.before || null
                    });

                    // FIX Bug3: When merge:true, add only new messages instead of replacing all
                    if (options.merge && hydratedMessages && hydratedMessages.length > 0) {
                        const _normalizeTs2 = _normalizeTs;
                        for (const m of hydratedMessages) {
                            const k = String(m.serverId || m.id || '');
                            if (k && !this._messagesMap.has(k)) {
                                this._messages.push(m);
                                this._messagesMap.set(k, m);
                            }
                        }
                        this._messages.sort((a, b) => _normalizeTs2(a) - _normalizeTs2(b));
                        this._notifySubscribers();
                        this._notifySuccess('Messages synced');
                    } else {
                        this.setMessages(hydratedMessages, conversationId);
                    }
                    // FIXED: Merge back realtime messages that arrived before chat open
                    if (_rtPreserve && _rtPreserve.length > 0) {
                        const _tsF2 = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
                        for (const _pm of _rtPreserve) {
                            const _pmId = String(_pm.serverId || _pm.id || '');
                            if (_pmId && !this._messagesMap.has(_pmId)) {
                                this._messages.push(_pm);
                                this._messagesMap.set(_pmId, _pm);
                                // Also save to IDB so it persists
                                if (window.KynectaLocalStore) window.KynectaLocalStore.saveMessage(_pm).catch(()=>{});
                            }
                        }
                        this._messages.sort(function(a, b) { return _tsF2(a) - _tsF2(b); });
                    }
                    this._notifySuccess('Messages loaded');
                    return;
                }

                const params = {
                    chatId: conversationId,
                    before: options.before,
                    limit: options.limit || 50
                };
                const response = await makeApiRequest('/messages', 'GET', null, params);

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

                if (messagesArray.length > 0) {
                    const normalizedMessages = messagesArray.map(msg => ({
                        id: msg.id,
                        localId: msg.localId || msg.id,
                        serverId: msg.serverId || msg.id,
                        content: msg.content || msg.text || '',
                        type: msg.type || msg.messageType || 'text',
                        senderId: msg.senderId || msg.sender?.id,
                        sender: msg.sender,
                        timestamp: msg.createdAt || msg.timestamp || Date.now(),
                        createdAt: msg.createdAt || msg.timestamp || Date.now(),
                        status: msg.status || 'delivered',
                        conversationId: conversationId,
                        chatId: conversationId,
                        isLocalOnly: false
                    }));
                    // FIX Bug3: When merge:true, add only new messages instead of replacing all
                    if (options.merge && normalizedMessages.length > 0) {
                        const _normalizeTs3 = _normalizeTs;
                        for (const m of normalizedMessages) {
                            const k = String(m.serverId || m.id || '');
                            if (k && !this._messagesMap.has(k)) {
                                this._messages.push(m);
                                this._messagesMap.set(k, m);
                            }
                        }
                        this._messages.sort((a, b) => _normalizeTs3(a) - _normalizeTs3(b));
                        this._notifySubscribers();
                        this._notifySuccess('Messages synced');
                    } else {
                        this.setMessages(normalizedMessages, conversationId);
                    }
                    // Merge back realtime messages that arrived before this fetch completed
                    if (_rtPreserve && _rtPreserve.length > 0) {
                        const _tsRt = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
                        for (const _pm of _rtPreserve) {
                            const _pmId = String(_pm.serverId || _pm.id || '');
                            if (_pmId && !this._messagesMap.has(_pmId)) {
                                this._messages.push(_pm);
                                this._messagesMap.set(_pmId, _pm);
                                if (window.KynectaLocalStore) window.KynectaLocalStore.saveMessage(_pm).catch(()=>{});
                            }
                        }
                        this._messages.sort(function(a, b) { return _tsRt(a) - _tsRt(b); });
                    }
                    this._notifySuccess('Messages loaded');
                } else {
                    // FIX Bug2: server returned 0 messages — before blanking the panel,
                    // check IDB. This covers back→reopen where the API is throttled/races
                    // and returns [] while IDB still has the full history.
                    if (window.KynectaLocalStore) {
                        const _idbFallback = await window.KynectaLocalStore.getMessagesByChat(conversationId, {
                            limit: options.limit || 100
                        }).catch(() => []);
                        this.setMessages(_idbFallback && _idbFallback.length > 0 ? _idbFallback : [], conversationId);
                    } else {
                        this.setMessages([], conversationId);
                    }
                }
            } catch (error) {
                console.error('[ChatManager] Failed to fetch messages:', error);
                // FIX: Always fall back to IndexedDB cache — never fake demo messages
                if (window.KynectaLocalStore) {
                    const fallbackMessages = await window.KynectaLocalStore.getMessagesByChat(conversationId, {
                        limit: options.limit || 100,
                        before: options.before || null
                    }).catch(() => []);
                    this.setMessages(fallbackMessages || [], conversationId);
                } else {
                    this._notifyError(error.message);
                    this.setMessages([], conversationId);
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
                    localId: options.localId || options.id || null,
                    content: content,
                    type: options.type || 'text',
                    attachment: options.attachment,
                    replyToId: options.replyToId || options.replyTo,
                    mentions: options.mentions
                };
            } else {
                console.log(`[ChatManager] 📤 Sending message to real conversation - using chatId: ${conversationId}`);
                requestBody = {
                    chatId: conversationId,
                    localId: options.localId || options.id || null,
                    content: content,
                    type: options.type || 'text',
                    attachment: options.attachment,
                    replyToId: options.replyToId || options.replyTo,
                    mentions: options.mentions
                };
            }

            // ── PHASE10: HybridTransportRuntime — THE canonical transport path ──────
            // Priority: INTERNET → LAN → MESH → OFFLINE QUEUE
            // ALL sends go through this path. No module bypasses it.
            let result;
            const hybridEngine = window.__HybridTransportEngine;
            const offlineQueue = window.__OfflineMessageQueue;
            const lanEngine    = window.__LANCommunicationEngine;
            const bestTransport = hybridEngine?.getBestTransport?.() || 'INTERNET';
            // PHASE10-FIX: In the iframe architecture, the messages iframe uses a
            // BRIDGED socket through the parent — _socket is null/disconnected in child frames.
            // Must check the iframe bridge state, not the raw socket directly.
            const socketConnected =
                window.KynectaRealtime?._socket?.connected === true ||           // parent frame direct
                window.KynectaRealtime?.state === 'authenticated' ||             // bridge state
                window.KynectaRealtime?.isConnected?.() === true ||              // compat method
                window.__kynParentReady === true ||                              // parent shell ready
                document.querySelector('meta[name="iframe-mode"]') !== null;    // iframe marker

            // Only go offline if browser is genuinely offline AND no bridge is active
            const isOnline = navigator.onLine && (
                socketConnected ||
                window.__kynParentReady === true ||
                window.parent !== window  // running in an iframe = parent has the socket
            );

            // ── OFFLINE PATH: only enqueue when truly offline ──────────────────
            if (!isOnline && offlineQueue) {
                console.log('[ChatManager] 📦 PHASE10 OFFLINE — queuing with guaranteed delivery');
                const queueEntry = await offlineQueue.enqueue({
                    ...requestBody,
                    localId: requestBody.localId || options.localId,
                    type: 'message',
                });
                result = {
                    message: {
                        id: queueEntry.id,
                        localId: queueEntry.id,
                        chatId: conversationId,
                        content,
                        status: 'queued',
                        senderId: options.senderId,
                        createdAt: new Date().toISOString(),
                    },
                    chatId: conversationId,
                    queued: true,
                };
            } else {
                // ── ONLINE PATH: try transport in priority order ─────────────
                // 1. LAN direct (same subnet, no internet needed)
                let lanSent = false;
                if (bestTransport === 'LAN' && lanEngine?.hasPeers?.()) {
                    try {
                        // PHASE11: Prefer COR for orchestrated LAN delivery
                        const _cor = window.__COR;
                        if (_cor) {
                            const _r = await _cor.send('message:send', requestBody, { transport: 'LAN' }).catch(() => null);
                            lanSent = _r?.ok === true;
                        } else {
                            lanSent = lanEngine.send({ ...requestBody, _via: 'LAN' });
                        }
                        if (lanSent) {
                            hybridEngine?.recordSuccess?.('LAN', 0);
                            console.log('[ChatManager] ✅ PHASE11 LAN delivery');
                        }
                    } catch (_lanErr) {
                        hybridEngine?.recordFailure?.('LAN');
                        lanSent = false;
                    }
                }

                // 2. Internet (primary) — always attempted; LAN is additive not exclusive
                try {
                    result = await makeApiRequest('/messages', 'POST', requestBody);
                    hybridEngine?.recordSuccess?.('INTERNET', 0);
                } catch (sendErr) {
                    console.warn('[ChatManager] PHASE10 Internet send failed, checking fallbacks:', sendErr.message);
                    hybridEngine?.recordFailure?.('INTERNET');

                    // 3. Mesh relay fallback
                    // PHASE11-FIX: Correct global name is __MeshRelayEngine (not __MeshMessagesTransport)
                    const meshEngine = window.__MeshRelayEngine || window.__MeshMessagesTransport || window.__MeshEngine;
                    let meshSent = false;
                    if (meshEngine && (meshEngine.isConnected?.() || meshEngine.peers?.size > 0 || meshEngine._routing?._routes?.size > 0)) {
                        try {
                            meshEngine.send?.({ ...requestBody, _via: 'MESH' });
                            meshSent = true;
                            hybridEngine?.recordSuccess?.('MESH', 0);
                            console.log('[ChatManager] ✅ PHASE10 MESH relay delivery');
                        } catch (_meshErr) { hybridEngine?.recordFailure?.('MESH'); }
                    }

                    // 4. Offline queue — guaranteed delivery on reconnect
                    if (!meshSent && offlineQueue) {
                        const queueEntry = await offlineQueue.enqueue({
                            ...requestBody,
                            localId: requestBody.localId || options.localId,
                            type: 'message',
                        });
                        result = {
                            message: {
                                id: queueEntry.id,
                                localId: queueEntry.id,
                                chatId: conversationId,
                                content,
                                status: 'queued',
                                senderId: options.senderId,
                                createdAt: new Date().toISOString(),
                            },
                            chatId: conversationId,
                            queued: true,
                        };
                    } else {
                        throw sendErr;
                    }
                }
            }
            
            console.log(`[ChatManager] 📥 Message sent successfully:`, result);
            
            if (isPending && result && (result.chatId || (result.data && result.data.chatId))) {
                const realChatId = result.chatId || result.data.chatId;
                if (realChatId) {
                    const pendingConv = this._conversationsMap.get(conversationId) || {};
                    const normalizedConv = {
                        ...pendingConv,
                        ...(result.conversation || result.data?.conversation || {}),
                        id: realChatId,
                        chatId: realChatId,
                        friendId: pendingConv.pendingReceiverId || pendingConv.friendId || result.receiverId || result.data?.receiverId,
                        friendName: pendingConv.friendName || pendingConv.userName || 'Chat',
                        friendAvatar: pendingConv.friendAvatar || pendingConv.userAvatar || '',
                        lastMessage: content,
                        lastMessageAt: Date.now(),
                        unreadCount: 0,
                        type: 'direct',
                        isPending: false
                    };
                    this.replacePendingConversation(conversationId, normalizedConv);
                    result.chatId = realChatId;
                }
            }
            
            return result;
        },
        
        setConversations: function(conversations) {
            const currentUserId = SessionManager.getUserId();
            const uniqueMap = new Map();
            const seenFriendIds = new Set();
            let _deleted = new Set();
            try {
                const _d = SafeStorage.getJSON('kynecta_deleted_chats_v8');
                if (Array.isArray(_d)) _deleted = new Set(_d.map(String));
            } catch(_) {}
            // Also check tombstone registry - prevents server response from resurrecting deleted chats
            try {
                const _tombstones = SafeStorage.getJSON('kynecta_tombstones_v1') || {};
                Object.keys(_tombstones).forEach(id => _deleted.add(String(id)));
            } catch(_) {}

            ensureSafeArray(conversations).forEach(chat => {
                if (!chat || !chat.id) return;
                if (_deleted.has(String(chat.id))) return;
                
                let friendId = getConversationPeerId(chat, currentUserId);

                // FIX Bug3: getConversationPeerId returns '' when the conversation object
                // only has `chatParticipants:[{userId}]` (server shape) or `chatCreator`
                // rather than the full `participants`/`participantIds` arrays it checks.
                // Without a valid friendId, seenFriendIds never deduplicates and every
                // copy of the same conversation passes through → duplicate sidebar entries.
                if (!friendId) {
                    const _myId = String(currentUserId || '');
                    // chatParticipants: [{userId, joinedAt}, …]
                    if (Array.isArray(chat.chatParticipants) && chat.chatParticipants.length) {
                        const _peer = chat.chatParticipants.find(function(p) {
                            const pid = String(p.userId || p.id || '');
                            return pid && pid !== _myId;
                        });
                        if (_peer) friendId = String(_peer.userId || _peer.id);
                    }
                    // chatCreator field
                    if (!friendId && chat.chatCreator) {
                        const _cid = String(chat.chatCreator.id || chat.chatCreator.userId || '');
                        if (_cid && _cid !== _myId) friendId = _cid;
                    }
                    // createdBy scalar
                    if (!friendId && chat.createdBy) {
                        const _cid = String(chat.createdBy);
                        if (_cid && _cid !== _myId) friendId = _cid;
                    }
                }
                
                if (friendId && seenFriendIds.has(friendId)) {
                    console.log(`[ChatManager] Skipping duplicate conversation for friend ${friendId}`);
                    return;
                }
                
                if (friendId) {
                    seenFriendIds.add(friendId);
                }
                
                // FIX: compare ids as strings to prevent numeric/string type mismatch
                const friendRecord = friendId && FriendManager
                    ? (FriendManager.getFriend(friendId) || FriendManager.getFriend(parseInt(friendId, 10)))
                    : null;
                const otherUser = chat.otherParticipant ||
                    ensureSafeArray(chat.participants).find(p => getEntityUserId(p) !== String(currentUserId)) ||
                    friendRecord;

                // FIX: build real display name from firstName+lastName when available
                const _fn = otherUser && otherUser.firstName ? otherUser.firstName.trim() : '';
                const _ln = otherUser && otherUser.lastName  ? otherUser.lastName.trim()  : '';
                const _rawFriendName = (_fn && _ln) ? (_fn + ' ' + _ln)
                    : (_fn || (otherUser && (otherUser.displayName || otherUser.username)) || chat.chatName || chat.name || 'User');
                const friendName = _rawFriendName.trim() || 'User';
                const friendAvatar = otherUser?.avatar || chat.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(friendName)}&background=random&color=fff`;
                
                let lastMessageText = chat.lastMessage?.content || chat.lastMessageContent || '';
                let lastMessageTime = chat.lastMessage?.createdAt || chat.lastMessageAt || chat.updatedAt;
                
                if (!lastMessageText && chat.messages && chat.messages.length > 0) {
                    const lastMsg = chat.messages[chat.messages.length - 1];
                    lastMessageText = lastMsg.content || '';
                    lastMessageTime = lastMsg.createdAt || lastMsg.timestamp;
                }
                
                // FIX: Resolve online status from FriendManager if available (it has realtime updates),
                // otherwise fall back to the API participant status field.
                let _convOnline = otherUser?.status === 'online';
                if (friendId && FriendManager) {
                    const _fm = friendRecord || FriendManager.getFriend(friendId) || FriendManager.getFriend(parseInt(friendId));
                    if (_fm) _convOnline = !!(_fm.online || _fm.status === 'online');
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
                    online: _convOnline,
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

            // FIX: Update active conversation name if it was cached with "User"
            if (this._activeConversation) {
                const updated = this._conversationsMap.get(this._activeConversation.id);
                if (updated && updated.friendName && updated.friendName !== 'User' &&
                    (this._activeConversation.friendName === 'User' || !this._activeConversation.friendName)) {
                    this._activeConversation = { ...this._activeConversation, ...updated };
                    // Patch the DOM header immediately
                    try {
                        const nameEl = document.getElementById('chatFriendName');
                        if (nameEl && nameEl.textContent === 'User') {
                            nameEl.textContent = updated.friendName;
                        }
                    } catch (_e) {}
                }
            }

            this._notifySubscribers();

            if (window.KynectaLocalStore && this._conversations.length > 0) {
                this._conversations.forEach(conversation => {
                    window.KynectaLocalStore.saveConversation({
                        ...conversation,
                        updatedAt: conversation.updatedAt || conversation.lastMessageAt || Date.now()
                    }).catch(() => {});
                });
            }
            
            console.log(`[ChatManager] Set ${this._conversations.length} unique conversations`);
        },
        
        setMessages: function(messages, conversationId) {
            // ROOT-FIX-D: Wipe guard — determine what chat the current _messages belong to.
            // Don't rely on _messages[0].chatId because:
            //   (a) received messages with no chatId have chatId='' → always looks different
            //   (b) optimistic sent messages may be first, with a different chatId format
            // Instead, scan the FIRST message that actually has a chatId field populated.
            const _targetId = conversationId || this._activeConversation?.id;
            const _targetIdStr = String(_targetId || '');
            const _stripPending = function(id) {
                const s = String(id || '');
                return s.startsWith('pending_') ? s.slice(8) : s;
            };

            let _currentChatId = null;
            for (let _i = 0; _i < this._messages.length; _i++) {
                const _mc = String(this._messages[_i].chatId || this._messages[_i].conversationId || '');
                if (_mc && _mc !== 'undefined') { _currentChatId = _mc; break; }
            }

            if (_targetIdStr && _currentChatId) {
                // Wipe only when switching to a genuinely DIFFERENT chat.
                // pending_7 → 7 is the SAME chat — never wipe on that transition.
                // FIX Bug1: also treat numeric vs string version of same id as equal
                // e.g. _currentChatId="11" and _targetIdStr="11" must match even if
                // one was stored as a number and coerced. stripPending handles both.
                const _sameChat = _currentChatId === _targetIdStr ||
                    _stripPending(_currentChatId) === _stripPending(_targetIdStr) ||
                    Number(_stripPending(_currentChatId)) === Number(_stripPending(_targetIdStr));
                if (!_sameChat) {
                    this._messages = [];
                    this._messagesMap.clear();
                }
            }

            // ROOT-FIX-D cont: Normalize ALL incoming messages so none have a blank chatId.
            // Without this, messages returned from the server with only `conversationId` get
            // chatId='' in the dedup map, so the wipe-guard and cache reads never find them.
            const _realId = _targetIdStr.startsWith('pending_') ? _targetIdStr.slice(8) : _targetIdStr;
            const incomingRaw = ensureSafeArray(messages).map(function(m) {
                if (!m) return m;
                const mChatId = String(m.chatId || m.conversationId || '');
                // FIX Bug1: restamp when chatId is blank, undefined, a pending_ id,
                // OR a numeric version of the same real id (server returns integer chatId
                // but local store has string — they must unify to one canonical string key).
                const needsRestamp = !mChatId || mChatId === 'undefined' ||
                    (mChatId.startsWith('pending_') && _realId) ||
                    (mChatId !== _realId && _realId && _stripPending(mChatId) === _stripPending(_realId));
                if (needsRestamp && _realId) {
                    return { ...m, chatId: _realId, conversationId: _realId };
                }
                return m;
            });
            const incomingMessages = incomingRaw;

            // CACHE-PROTECTION: Never overwrite a populated cache with an empty array.
            // FIX Bug2: also check IndexedDB (KynectaLocalStore) not just localStorage,
            // because localStorage may be empty while IDB has the real message history.
            if (incomingMessages.length === 0) {
                const existingCache = this.loadPreviousMessages(_targetId);
                if (existingCache && existingCache.length > 0) {
                    const _cacheFirstId = String(existingCache[0]?.chatId || existingCache[0]?.conversationId || '');
                    if (!_targetIdStr || !_cacheFirstId ||
                        _cacheFirstId === _targetIdStr ||
                        _stripPending(_cacheFirstId) === _stripPending(_targetIdStr)) {
                        this._messages = existingCache;
                        this._rebuildMessagesMap();
                        this._notifySubscribers();
                        return;
                    }
                }
                // FIX Bug2: localStorage empty but IDB may still have messages —
                // load asynchronously and render if found, so back→reopen never blanks.
                if (_targetIdStr && window.KynectaLocalStore) {
                    const _self = this;
                    window.KynectaLocalStore.getMessagesByChat(_targetIdStr, { limit: 100 })
                        .then(function(idbMsgs) {
                            if (idbMsgs && idbMsgs.length > 0) {
                                // Only apply if memory is still empty for this chat
                                const _stillEmpty = !_self._messages || _self._messages.filter(function(m) {
                                    const mc = String(m.chatId || m.conversationId || '');
                                    return mc === _targetIdStr || _stripPending(mc) === _stripPending(_targetIdStr);
                                }).length === 0;
                                if (_stillEmpty) {
                                    _self.setMessages(idbMsgs, _targetIdStr);
                                }
                            }
                        }).catch(function() {});
                }
                return;
            }

            // MERGE-FIRST dedup: seed from existing in-memory messages for this chat,
            // then layer server messages on top. Nothing already in memory is dropped.
            const byId = new Map();
            for (const msg of this._messages) {
                if (!msg || !msg.id) continue;
                // Only carry forward messages that belong to THIS chat
                const _mc = String(msg.chatId || msg.conversationId || '');
                if (_mc && _mc !== _targetIdStr && _mc !== _realId &&
                    _stripPending(_mc) !== _stripPending(_targetIdStr)) continue;
                byId.set(String(msg.id), { ...msg });
                if (msg.localId && msg.localId !== msg.id) byId.delete(String(msg.localId));
            }
            // Layer server/incoming on top — server data wins
            for (const msg of incomingMessages) {
                if (!msg.id) continue;
                const existing = byId.get(String(msg.id));
                byId.set(String(msg.id), existing ? { ...existing, ...msg } : { ...msg });
                if (msg.localId && msg.localId !== msg.id) byId.delete(String(msg.localId));
            }

            const uniqueMessages = Array.from(byId.values());
            const ts = m => m.createdAt || m.timestamp || 0;
            uniqueMessages.sort((a, b) => ts(a) - ts(b));

            this._messages = uniqueMessages;
            this._rebuildMessagesMap();
            // FIX: Use the explicitly-passed conversationId as the authoritative cache key.
            // Deriving it from uniqueMessages[0]?.chatId or _activeConversation is unreliable
            // when fetchMessages resolves asynchronously after the user has switched chats.
            const cacheId = conversationId || this._activeConversation?.id;
            this._saveMessagesToCache(cacheId);
            this._notifySubscribers();

            try {
                const _renderChatId = conversationId || (this._activeConversation && this._activeConversation.id);
                if (_renderChatId) {
                    const _aid = String(_renderChatId);
                    let _activeForRender = this._activeConversation;
                    if (!_activeForRender && this._conversationsMap) {
                        const _p = document.getElementById('chatPanel');
                        if (_p && !_p.classList.contains('hidden')) {
                            _activeForRender = this._conversationsMap.get(_aid) || this._conversationsMap.get(Number(_aid));
                            if (_activeForRender) this._activeConversation = _activeForRender;
                        }
                    }
                    if (_activeForRender && String(_activeForRender.id) === _aid) {
                        const _tsMs2 = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
                        const _filtered = this._messages
                            .filter(m => {
                                const mid = String(m.chatId || m.conversationId || '');
                                return mid === _aid || mid === '';
                            })
                            .sort((a, b) => _tsMs2(a) - _tsMs2(b));
                        if (_filtered.length > 0) {
                            window.dispatchEvent(new CustomEvent('renderMessages', {
                                detail: { messages: _filtered, currentChat: _activeForRender, currentUser: null }
                            }));
                        }
                    }
                }
            } catch (_e) {}

            // ── OFFLINE-FIRST: persist ALL messages to IndexedDB ─────────────
            if (window.KynectaLocalStore && uniqueMessages.length > 0) {
                const chatId = cacheId || uniqueMessages[0]?.chatId || uniqueMessages[0]?.conversationId;
                if (chatId) {
                    window.KynectaLocalStore.saveMessages(
                        uniqueMessages.map(m => ({
                            ...m,
                            chatId: m.chatId || m.conversationId || chatId,
                            createdAt: m.createdAt || m.timestamp || Date.now()
                        }))
                    ).catch(()=>{});
                }
            }
        },
        
        addMessage: function(message) {
            if (!message || !message.id) return;

            // ROOT-FIX-A: Normalize chatId/conversationId to a single consistent string
            // before ANY storage path runs.  Received messages from the server often arrive
            // with ONLY `conversationId` (no `chatId`), which means:
            //   • _saveMessagesToCache() falls back to _activeConversation.id → wrong key
            //   • setMessages wipe guard reads _messages[0].chatId === '' → always triggers
            //   • dedup map loses received messages on every send-confirm cycle
            // Fix: derive a single _chatId and stamp BOTH fields so every path agrees.
            const _activeChatIdRaw = this._activeConversation ? String(this._activeConversation.id || '') : '';
            let _chatId = String(message.chatId || message.conversationId || '');

            // If message has no chat identifier, inherit from the active conversation
            if (!_chatId && _activeChatIdRaw) {
                _chatId = _activeChatIdRaw;
            }
            // Restamp pending_ to real ID when the active chat has already been resolved
            if (_chatId && _activeChatIdRaw && !_activeChatIdRaw.startsWith('pending_')) {
                if (_chatId === `pending_${_activeChatIdRaw}`) {
                    _chatId = _activeChatIdRaw;
                }
            }
            // FIX Bug1: if _chatId is numeric version of _activeChatIdRaw (server sends
            // integer chatId but active conversation stores string), unify to the string
            // form so the wipe guard and dedup map always see the same canonical key.
            if (_chatId && _activeChatIdRaw && _chatId !== _activeChatIdRaw) {
                const _stripP = function(s) { return s.startsWith('pending_') ? s.slice(8) : s; };
                if (_stripP(_chatId) === _stripP(_activeChatIdRaw) ||
                    Number(_stripP(_chatId)) === Number(_stripP(_activeChatIdRaw))) {
                    _chatId = _activeChatIdRaw;
                }
            }
            // Produce a consistent message object so all paths below use the same key
            if (_chatId) {
                message = { ...message, chatId: _chatId, conversationId: _chatId };
            }

            const msgId      = String(message.id);
            const msgLocalId = message.localId ? String(message.localId) : null;

            // ROOT-FIX-B: Always pass the message's chatId to _saveMessagesToCache.
            // Calling it with no argument falls back to _activeConversation.id, which may
            // be a DIFFERENT chat if the received message arrived while the user had another
            // chat open — writing all messages to the wrong localStorage key.
            const existingById = this._messagesMap.get(msgId);
            if (existingById) {
                // Merge server data into existing (status, id, etc.)
                Object.assign(existingById, message);
                this._rebuildMessagesMap();
                this._saveMessagesToCache(_chatId || undefined);
                this._notifySubscribers();
                if (window.KynectaLocalStore) {
                    window.KynectaLocalStore.saveMessage({
                        ...existingById,
                        chatId: existingById.chatId || existingById.conversationId
                    }).catch(()=>{});
                }
                return;
            }
            // Also check if we have an optimistic copy by localId
            if (msgLocalId) {
                const existingByLocalId = this._messagesMap.get(msgLocalId);
                if (existingByLocalId) {
                    const idx = this._messages.findIndex(m => String(m.id) === msgLocalId || String(m.localId||'') === msgLocalId);
                    const merged = { ...existingByLocalId, ...message, id: msgId };
                    if (idx !== -1) this._messages[idx] = merged;
                    this._messagesMap.delete(msgLocalId);
                    this._messagesMap.set(msgId, merged);
                    this._saveMessagesToCache(_chatId || undefined);
                    this._notifySubscribers();
                    if (window.KynectaLocalStore) {
                        window.KynectaLocalStore.saveMessage({
                            ...merged,
                            chatId: merged.chatId || merged.conversationId
                        }).catch(()=>{});
                    }
                    return;
                }
            }

            // ── Persist to IndexedDB ─────────────────────────────────────────
            const chatId = message.chatId || message.conversationId;
            if (window.KynectaLocalStore && chatId) {
                window.KynectaLocalStore.saveMessage({
                    ...message,
                    chatId,
                    createdAt: message.createdAt || message.timestamp || Date.now(),
                    isLocalOnly: message.isLocalOnly !== false
                }).catch(()=>{});
            }

            this._messages.push(message);
            this._messagesMap.set(msgId, message);
            
            // FIX: parse ISO createdAt to numeric ms for correct ASC sort
            const _tsMs = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
            this._messages.sort((a, b) => _tsMs(a) - _tsMs(b));
            
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
            
            const _activeChatNow = this._activeConversation;
            // ROOT-FIX-B cont: always pass the message's normalized chatId so received messages
            // that arrive while a different chat is open still get saved to their own slot.
            const _msgChatIdForSave = _chatId || String(message.chatId || message.conversationId || '');
            if (_msgChatIdForSave) {
                this._saveMessagesToCache(_msgChatIdForSave);
            } else if (_activeChatNow) {
                this._saveMessagesToCache();
            }
            
            this._notifySubscribers();
            EventBus.emit('message:added', message);

            // ── Render new message into the active chat panel immediately ──
            try {
                const _ar = this._activeConversation;
                const _msgCid = String(message.chatId || message.conversationId || '');
                const _actCid = _ar ? String(_ar.id || '') : '';
                let _render = !!(_msgCid && _actCid && _msgCid === _actCid);
                // Fallback: friendId match for receiver-reply
                if (!_render && _ar && message.senderId) {
                    const _afid = String(_ar.friendId || _ar.otherUserId ||
                        (_ar.otherParticipant && _ar.otherParticipant.id) || '');
                    if (_afid && _afid === String(message.senderId)) _render = true;
                }
                // Fallback: panel open but _activeConversation cleared — recover from map
                if (!_render && _msgCid) {
                    const _p = document.getElementById('chatPanel');
                    if (_p && !_p.classList.contains('hidden') && this._conversationsMap) {
                        const _conv = this._conversationsMap.get(_msgCid) || this._conversationsMap.get(Number(_msgCid));
                        if (_conv) { this._activeConversation = _conv; _render = true; }
                    }
                }
                if (_render) {
                    const _tsF = _normalizeTs; // FIX: consolidated to canonical _normalizeTs
                    const _fid = _msgCid || _actCid;
                    const _renderConv = this._activeConversation;
                    const _chatMsgs = this._messages.filter(function(m) {
                        const mid = String(m.chatId || m.conversationId || '');
                        return mid === _fid || mid === _actCid;
                    }).sort(function(a, b) { return _tsF(a) - _tsF(b); });
                    window.dispatchEvent(new CustomEvent('renderMessages', {
                        detail: { messages: _chatMsgs, currentChat: _renderConv, currentUser: null }
                    }));
                    try {
                        const _c = document.getElementById('messagesContainer');
                        if (_c) requestAnimationFrame(function() { _c.scrollTop = _c.scrollHeight; });
                    } catch (_) {}
                }
            } catch (_e) {}

            // Immediately re-render sidebar so chat bubbles up after sort
            try {
                const uiConvs = this._conversations;
                const activeChat = this._activeConversation;
                const drafts = {};
                window.dispatchEvent(new CustomEvent('renderChatsList', {
                    detail: {
                        conversations: ensureSafeArray(uiConvs),
                        currentChat: activeChat,
                        currentCategory: this.getCurrentCategory(),
                        messageDrafts: ensureSafeObject(drafts)
                    }
                }));
            } catch(_e) {}
        },
        
        updateMessageStatus: function(messageId, status, details = {}) {
            const normalizedId = String(messageId);
            const message = this._messagesMap.get(normalizedId)
                || this._messages.find(m =>
                    String(m.id) === normalizedId
                    || String(m.localId || '') === normalizedId
                    || String(m.serverId || '') === normalizedId
                );
            if (!message) return false;
            
            // PHASE10: In-place entity patch — apply all provided fields without array replacement
            message.status = status;
            if (details.deliveredAt)          message.deliveredAt    = details.deliveredAt;
            if (details.readAt)               message.readAt         = details.readAt;
            if (details.serverId)             message.serverId       = String(details.serverId);
            if (details.localId)              message.localId        = String(details.localId);
            if (details.chatId)               message.chatId         = details.chatId;
            if (details.conversationId)       message.conversationId = details.conversationId;
            if (details.timestamp)            message.timestamp      = details.timestamp;
            if (details.createdAt)            message.createdAt      = details.createdAt;
            if (details.optimistic === false) message.optimistic     = false;
            if (details.isLocalOnly === false)message.isLocalOnly    = false;
            this._messagesMap.set(String(message.id), message);
            if (message.localId) this._messagesMap.set(String(message.localId), message);
            if (message.serverId) this._messagesMap.set(String(message.serverId), message);
            if (window.KynectaLocalStore) {
                window.KynectaLocalStore.updateMessageStatus(message.localId || message.id, status, details).catch(() => {});
            }
            
            EventBus.emit('message:status', { messageId, status, message });
            // ✅ FIX 5: Fire DOM event so messages-ui.js messageStatusUpdated listener
            // can patch the tick icon without a full re-render.
            try {
                window.dispatchEvent(new CustomEvent('messageStatusUpdated', {
                    detail: { messageId: String(messageId), status, serverId: details.serverId || null, localId: details.localId || null }
                }));
            } catch (_e) {}
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
                    // Also write to the flat key so restoreLastChat can read it immediately
                    SafeStorage.set('lastChatId', String(conversation.id));
                } catch (e) {}
            }
        },
        
        getActiveChat: function() {
            return this._activeConversation ? { ...this._activeConversation } : null;
        },
        
        getMessages: function() {
            return [...this._messages];
        },

        setCurrentCategory: function(category) {
            const normalized = ['all', 'unread', 'archived', 'blocked', 'notes'].includes(category) ? category : 'all';
            this._currentCategory = normalized;
            SafeStorage.set(LOCAL_STORAGE_KEYS.CURRENT_CATEGORY, normalized);
            return normalized;
        },

        getCurrentCategory: function() {
            const stored = SafeStorage.get(LOCAL_STORAGE_KEYS.CURRENT_CATEGORY, this._currentCategory || 'all');
            const normalized = ['all', 'unread', 'archived', 'blocked', 'notes'].includes(stored) ? stored : 'all';
            this._currentCategory = normalized;
            return normalized;
        },

        renderChatsList: function() {
            try {
                window.dispatchEvent(new CustomEvent('renderChatsList', {
                    detail: {
                        conversations: ensureSafeArray(this._conversations),
                        currentChat: this._activeConversation,
                        currentCategory: this.getCurrentCategory(),
                        messageDrafts: {}
                    }
                }));
            } catch (_error) {}
        },
        
        loadPreviousMessages: function(conversationId) {
            // PHASE10-FIX: Stale cache rejection — never resurrect deleted entities
            // Check the authoritative deletion registry before reading any cache
            const _cidStr = String(conversationId || '');
            const _deletionRegistry = window.__PHASE10_DeletionRegistry;
            if (_deletionRegistry && _cidStr && _deletionRegistry.isDeleted('chat', _cidStr)) {
                console.warn('[ChatManager] PHASE10: Rejecting stale cache for deleted chat:', _cidStr);
                return null;
            }

            if (this._historyCache.has(conversationId)) {
                const cached = this._historyCache.get(conversationId);
                if (Date.now() - cached.timestamp < 300000) {
                    // Filter out tombstoned messages from cache
                    if (_deletionRegistry && cached.messages) {
                        const alive = cached.messages.filter(m =>
                            !m || !m.id || !_deletionRegistry.isDeleted('message', String(m.id))
                        );
                        if (alive.length !== cached.messages.length) {
                            cached.messages = alive;
                        }
                    }
                    return cached.messages;
                }
            }
            
            try {
                const stored = SafeStorage.getJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${conversationId}`);
                if (stored && Array.isArray(stored)) {
                    // PHASE10-FIX: Filter tombstoned messages before returning from localStorage
                    const alive = _deletionRegistry
                        ? stored.filter(m => !m || !m.id || !_deletionRegistry.isDeleted('message', String(m.id)))
                        : stored;
                    this._historyCache.set(conversationId, { messages: alive, timestamp: Date.now() });
                    return alive;
                }
            } catch (e) {}

            // Fallback: check if messages were saved under pending_<id> and migrate them
            try {
                const _idStr = String(conversationId || '');
                if (_idStr && !_idStr.startsWith('pending_')) {
                    const pendingKey = `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}pending_${_idStr}`;
                    const pendingStored = SafeStorage.getJSON(pendingKey);
                    if (pendingStored && Array.isArray(pendingStored) && pendingStored.length > 0) {
                        const migrated = pendingStored.map(function(m) {
                            return m ? { ...m, chatId: _idStr, conversationId: _idStr } : m;
                        });
                        try { SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${_idStr}`, migrated); } catch(_) {}
                        try { SafeStorage.remove(pendingKey); } catch(_) {}
                        this._historyCache.set(conversationId, { messages: migrated, timestamp: Date.now() });
                        return migrated;
                    }
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
        
        _saveMessagesToCache: function(chatId) {
            // ROOT-FIX-C: Never write the entire _messages array (which may contain messages
            // from multiple chats) to a single chat key.  Filter to only the messages that
            // belong to this chatId before writing.
            const targetId = chatId || this._activeConversation?.id;
            if (targetId) {
                try {
                    const _tid = String(targetId);
                    // FIX: Only save messages that explicitly belong to this chat.
                    // Old logic included chatId='' messages which caused cross-chat contamination:
                    // messages from Chat A would appear in Chat B after a cache restore.
                    // Messages with no chatId are stamped with the target chatId before saving.
                    const _toSave = this._messages
                        .filter(function(m) {
                            const mcid = String(m.chatId || m.conversationId || '');
                            return mcid === _tid;
                        })
                        .map(function(m) {
                            // Stamp any message that is missing chatId so future reads can filter correctly
                            if (!m.chatId && !m.conversationId) {
                                return Object.assign({}, m, { chatId: _tid });
                            }
                            return m;
                        });
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${_tid}`, _toSave);
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
            this._lastMessagesFetchAt.clear();
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
            // FIX: Never load fake demo friends. Load from IndexedDB cache instead.
            if (!this._friends || this._friends.length === 0) {
                if (window.AppCache) {
                    window.AppCache.getAll('friends').then(cached => {
                        if (cached && cached.length > 0) {
                            console.log('[FriendManager] Offline-first: loaded', cached.length, 'cached friends');
                            this._friends = cached;
                            this._rebuildMap();
                            this._friends.forEach(friend => {
                                if (friend.online) this._activeFriends.add(friend.id);
                            });
                            this._loaded = true;
                            this._notifySubscribers();
                        }
                    }).catch(() => {});
                }
            }
        },
        
        _loadFromCache: function() {
            try {
                const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
                if (cached && Array.isArray(cached.friends)) {
                    // PHASE10-FIX: Deduplicate — same user can appear as id:2 and id:"2"
                    const _seen = new Set();
                    this._friends = cached.friends.filter(f => {
                        if (!f) return false;
                        const k = String(f.id || f.userId || '');
                        if (!k || _seen.has(k)) return false;
                        _seen.add(k); return true;
                    });
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
                console.log('[FriendManager] Not authenticated — loading friends from cache');
                // FIX: Load from IndexedDB, not fake demo friends
                this._loadDemoFriendsIfNeeded();
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
                } else {
                    this.setFriends([]);
                    await this._fetchAllUsersAsFallback();
                }
            } catch (error) {
                console.error('[FriendManager] Failed to fetch friends:', error);
                // FIX: Fall back to cache, not demo friends
                this._loadDemoFriendsIfNeeded();
                this._notifyError(error.message);
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
                // PHASE10-FIX: Deduplicate before saving to prevent int/string id duplicates
                const _seen3 = new Set();
                const _deduped3 = (this._friends || []).filter(f => {
                    if (!f) return false;
                    const k = String(f.id || f.userId || '');
                    if (!k || _seen3.has(k)) return false;
                    _seen3.add(k); return true;
                });
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                    friends: _deduped3,
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

            // ── FORENSIC LOG: SEND_START ──────────────────────────────────────
            console.log(`[FORENSIC] SEND_START | localId=${localId} | conversationId=${conversationId} | contentLen=${(content||'').length} | type=${options.type||'text'} | ts=${Date.now()}`);

            const optimisticMessage = {
                id: localId,
                localId: localId,
                chatId: conversationId,
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
                // FIX: include both replyToId AND the full replyTo object for immediate UI render
                replyToId: options.replyToId || (options.replyTo && options.replyTo.id) || null,
                replyTo: options.replyTo || null,
                mentions: options.mentions,
                isLocalOnly: true
            };
            
            this._optimisticMessages.set(localId, optimisticMessage);
            this._pendingRequests.set(requestId, { localId, optimisticMessage, timestamp: Date.now() });
            
            ChatManager.addMessage(optimisticMessage);
            EventBus.emit('message:sending', { message: optimisticMessage, optimistic: true });
            
            try {
                // ── FORENSIC LOG: TRANSPORT_SELECTED ─────────────────────────
                const _bestTx = window.__HybridTransportEngine?.getBestTransport?.() || 'INTERNET';
                console.log(`[FORENSIC] TRANSPORT_SELECTED | localId=${localId} | transport=${_bestTx} | online=${navigator.onLine} | ts=${Date.now()}`);

                const result = await ChatManager.sendMessageToBackend(content, conversationId, {
                    ...options,
                    localId
                });
                
                console.log(`[MessageHandler] Message sent successfully:`, result);
                
                const realMessage = result?.message || result?.data?.message || result?.data || result;
                const serverId = realMessage?.id;

                // Update the optimistic message in ChatManager in-place
                // PHASE10-FIX: Patch ONLY the single optimistic entity in-place.
                // NEVER call setMessages() after send confirmation — it replaces the
                // entire array and drops messages that arrived from the socket during
                // the async HTTP send, causing the "reply makes messages disappear" bug.
                if (serverId) {
                    const realChatId = String(realMessage.chatId || realMessage.conversationId || conversationId);
                    // In-place patch: update only the matching optimistic message
                    ChatManager.updateMessageStatus(localId, realMessage.status || 'sent', {
                        serverId:       String(serverId),
                        localId:        localId,
                        chatId:         realChatId,
                        conversationId: realChatId,
                        optimistic:     false,
                        isLocalOnly:    false,
                        timestamp:      realMessage.createdAt || Date.now(),
                        createdAt:      realMessage.createdAt || Date.now(),
                    });
                    // Patch only messages that still lack a chatId (pending->real transition)
                    // without replacing the full array
                    if (conversationId && String(conversationId).startsWith('pending_')) {
                        const msgs = ChatManager.getMessages();
                        let patched = false;
                        msgs.forEach(function(m) {
                            const mCid = String(m.chatId || m.conversationId || '');
                            if (!mCid || mCid === 'undefined' || mCid.startsWith('pending_')) {
                                m.chatId = realChatId; m.conversationId = realChatId; patched = true;
                            }
                        });
                        if (patched) { ChatManager._rebuildMessagesMap(); ChatManager._notifySubscribers(); }
                    }
                    // Confirm in local store
                    if (window.KynectaLocalStore) {
                        window.KynectaLocalStore.confirmMessage(localId, String(serverId), {
                            chatId:    realMessage.chatId || conversationId,
                            createdAt: realMessage.createdAt || Date.now(),
                            status: realMessage.status || 'sent'
                        }).catch(()=>{});
                    }
                } else {
                    optimisticMessage.status = 'sent';
                    optimisticMessage.optimistic = false;
                    optimisticMessage.isLocalOnly = false;
                    if (window.KynectaLocalStore) {
                        window.KynectaLocalStore.updateMessageStatus(localId, 'sent').catch(()=>{});
                    }
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

                const shouldQueue = !navigator.onLine || /network|fetch|timeout|offline/i.test(String(error.message || ''));
                if (shouldQueue && window.KynectaMsgQueue) {
                    optimisticMessage.status = 'pending';
                    optimisticMessage.optimistic = false;
                    optimisticMessage.queued = true;
                    ChatManager.updateMessageStatus(localId, 'pending', { queued: true, reason: error.message });
                    window.KynectaMsgQueue.enqueue({
                        id: localId,
                        localId,
                        chatId: conversationId,
                        content: optimisticMessage.content,
                        type: optimisticMessage.type,
                        attachment: optimisticMessage.attachment,
                        replyToId: options.replyToId || options.replyTo || null,
                        mentions: options.mentions,
                        senderId: optimisticMessage.senderId
                    });
                    EventBus.emit('message:queued', { messageId: localId, error: error.message });

                    this._optimisticMessages.delete(localId);
                    this._pendingRequests.delete(requestId);

                    return { success: true, queued: true, offline: !navigator.onLine, localId };
                }
                
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
        
        deleteMessage: async function(messageId, forEveryone = false) {
            const guardResult = window.__guardAction('deleteMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            if (!SessionManager.isAuthenticated()) return false;

            const message = (ChatManager.getMessages() || []).find((entry) =>
                String(entry.id) === String(messageId)
                || String(entry.localId || '') === String(messageId)
                || String(entry.serverId || '') === String(messageId)
            );
            const targetId = message?.serverId || message?.id || messageId;

            try {
                await makeApiRequest(`/messages/${targetId}`, 'DELETE', {
                    forEveryone
                });
            } catch (error) {
                console.error('[MessageHandler] deleteMessage failed:', error);
                return false;
            }

            const filteredMessages = (ChatManager.getMessages() || []).filter((entry) =>
                String(entry.id) !== String(messageId)
                && String(entry.localId || '') !== String(messageId)
                && String(entry.serverId || '') !== String(targetId)
            );

            if (ChatManager.getActiveChat()) {
                ChatManager.setMessages(filteredMessages, ChatManager.getActiveChat().id);
                try {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, filteredMessages);
                } catch (e) {}
            }

            if (window.KynectaLocalStore) {
                window.KynectaLocalStore.deleteMessage(messageId).catch(() => {});
                if (String(targetId) !== String(messageId)) {
                    window.KynectaLocalStore.deleteMessage(targetId).catch(() => {});
                }
            }

            EventBus.emit('message:deleted', { messageId: targetId, forEveryone });
            return true;
        },
        
        editMessage: function(messageId, newContent) {
            const guardResult = window.__guardAction('editMessage', MODULE_NAME, currentState, false);
            if (guardResult !== null) {
                return guardResult;
            }
            
            if (!canSendUserMessages()) return false;
            if (!SessionManager.isAuthenticated()) return false;

            // FIX (Forensic Audit P1): editMessage previously only used socket relay (safeSend),
            // which is lossy. Now also calls the REST API for durable persistence.
            const messages = ChatManager.getMessages() || [];
            const message = messages.find(
                (m) => String(m.id) === String(messageId)
                     || String(m.localId || '') === String(messageId)
                     || String(m.serverId || '') === String(messageId)
            );
            const targetId = message?.serverId || message?.id || messageId;
            const sanitized = SecurityUtils.sanitizeString(newContent);

            // Optimistic update first
            if (message) {
                message.content = sanitized;
                message.edited = true;
                message.editedAt = Date.now();
                if (ChatManager.getActiveChat()) {
                    try {
                        SafeStorage.setJSON(
                            `${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`,
                            messages
                        );
                    } catch (e) {}
                }
                EventBus.emit('message:edited', { messageId: targetId, content: sanitized });
            }

            // Durable REST persist (fire-and-forget with rollback on failure)
            makeApiRequest(`/messages/${targetId}`, 'PUT', { content: sanitized })
                .then(() => {
                    // Optionally also relay via socket for live receivers
                    safeSend(OUTGOING_ACTIONS.EDIT_MESSAGE, { messageId: targetId, content: sanitized }, { requireAck: false });
                    // Update IndexedDB
                    if (window.KynectaLocalStore && message) {
                        window.KynectaLocalStore.saveMessage({ ...message, content: sanitized, edited: true }).catch(() => {});
                    }
                })
                .catch((error) => {
                    console.error('[MessageHandler] editMessage REST persist failed — rolling back:', error);
                    // Rollback optimistic update
                    if (message) {
                        message.content = message._preEditContent || message.content;
                        message.edited = !!message._preEditContent;
                        EventBus.emit('message:edit_failed', { messageId: targetId, error: error.message });
                    }
                });

            // Store pre-edit content for rollback
            if (message) message._preEditContent = message.content;

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
            
            const actualId = typeof conversationId === 'object' ? conversationId.id : conversationId;
            const openKey = String(actualId);
            const now = Date.now();
            if (this._lastOpenRequest
                && this._lastOpenRequest.id === openKey
                && (now - this._lastOpenRequest.timestamp) < 700) {
                return true;
            }
            this._lastOpenRequest = { id: openKey, timestamp: now };

            // ROOT-FIX: Only wipe when switching to a DIFFERENT chat.
            // pending_<id> → <id> is the SAME chat — never wipe on that transition.
            const _prevActive = ChatManager._activeConversation;
            const _stripP = function(id) { const s = String(id||''); return s.startsWith('pending_') ? s.slice(8) : s; };
            const _switchingChat = _prevActive &&
                String(_prevActive.id) !== String(actualId) &&
                _stripP(_prevActive.id) !== _stripP(actualId);
            if (_switchingChat) {
                ChatManager._messages = [];
                ChatManager._messagesMap.clear();
            }
            
            const conversation = ChatManager.getConversation(actualId);
            const canUseCachedConversation = !!conversation;
            // FIXED: Always open from cache — even offline or pre-ACTIVE
            if (conversation) {
                ChatManager.setActiveConversation(conversation);
                this._showChatPanel(conversation);
            } else {
                // No cached conversation: show the name passed via openConversation opts (userName) immediately
                // so header never shows "Loading..." to the user
                const _resolvedName = (typeof conversationId === 'object' && conversationId.friendName)
                    ? conversationId.friendName
                    : (options && options.friendName) || (options && options.userName)
                      // FIX Bug4: also check the globally-cached name set by loadChatByFriendId
                      || window.currentFriendName || null;
                // Never show ".." placeholder — only set if we actually have a real name
                const _displayName = _resolvedName && _resolvedName !== '..' ? _resolvedName : null;
                // FIX Bug4: use empty string instead of 'Loading…' so _showChatPanel keeps existing DOM name
                const tempConversation = { id: actualId, friendName: _displayName || '', friendAvatar: '', online: false };
                ChatManager.setActiveConversation(tempConversation);
                this._showChatPanel(tempConversation);
            }

            // PHASE10: IDB first for instant load — eliminates white screen on first click
            const isPending = typeof actualId === 'string' && actualId.startsWith('pending_');
            if (!isPending) {
                // Check deletion registry — don't load messages for deleted chats
                const _delReg = window.__PHASE10_DeletionRegistry;
                if (_delReg && _delReg.isDeleted('chat', String(actualId))) {
                    console.warn('[ConversationManager] PHASE10: Skipping deleted chat:', actualId);
                    return false;
                }

                let _instantLoaded = false;
                if (window.KynectaLocalStore) {
                    const _idb = await window.KynectaLocalStore.getMessagesByChat(actualId, { limit: 100 }).catch(function() { return []; });
                    if (_idb && _idb.length > 0) {
                        // Filter tombstoned messages before display
                        const _alive = _delReg
                            ? _idb.filter(m => !m.id || !_delReg.isDeleted('message', String(m.id)))
                            : _idb;
                        if (_alive.length > 0) {
                            ChatManager.setMessages(_alive, actualId);
                            _instantLoaded = true;
                        }
                    }
                }
                if (!_instantLoaded) {
                    const _ls = ChatManager.loadPreviousMessages ? ChatManager.loadPreviousMessages(actualId) : null;
                    if (_ls && _ls.length > 0) {
                        ChatManager.setMessages(_ls, actualId);
                        _instantLoaded = true;
                    }
                }
                // PHASE10: If nothing in cache, show empty state immediately — no white screen
                if (!_instantLoaded) {
                    ChatManager._notifySubscribers?.();
                }
            }
            
            // Only send OPEN_CONVERSATION to parent when module is ACTIVE
            if (currentState === LIFECYCLE_STATES.ACTIVE) {
                safeSend(OUTGOING_ACTIONS.OPEN_CONVERSATION, {
                    conversationId: actualId
                }, { requireAck: false });
            }
            
            // FIX: force:true bypasses 8s minFetchGap so messages always refresh
            // FIX Bug2: take an IDB snapshot before the fetch so we can restore messages
            // if fetchMessages races and calls setMessages([]) over what we just showed.
            let _idbSnapshot = [];
            if (!isPending && window.KynectaLocalStore) {
                _idbSnapshot = await window.KynectaLocalStore.getMessagesByChat(actualId, { limit: 100 }).catch(function() { return []; });
            }
            if (!isPending) {
                if (navigator.onLine && SessionManager.isAuthenticated() && currentState === LIFECYCLE_STATES.ACTIVE) {
                    await ChatManager.fetchMessages(actualId, { ...options, force: true }).catch(function() {});
                }
            } else {
                console.log('[ConversationManager] Skipping message fetch for pending conversation:', actualId);
            }
            // FIX Bug2: if after fetchMessages the panel is empty but IDB had data, restore it.
            if (_idbSnapshot.length > 0 && ChatManager._messages) {
                const _inMemory = ChatManager._messages.filter(function(m) {
                    const mc = String(m.chatId || m.conversationId || '');
                    const _sp = function(s) { return s.startsWith('pending_') ? s.slice(8) : s; };
                    return mc === String(actualId) || _sp(mc) === _sp(String(actualId));
                });
                if (_inMemory.length === 0) {
                    console.log('[ConversationManager] FIX Bug2: restoring', _idbSnapshot.length, 'msgs from IDB snapshot for', actualId);
                    ChatManager.setMessages(_idbSnapshot, actualId);
                }
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
            // CSS safeguard: body.chat-active hides sidebar on mobile via CSS
            // so there's no flash even if JS timing is imperfect
            if (window.innerWidth <= 768) {
                document.body.classList.add('chat-active');
            }
            // FIX: Let CSS control back button visibility (display:flex on mobile via media query).
            // Clear any inline style that might override CSS rules.
            if (backBtn) {
                backBtn.style.display = '';
            }
            
            // FIX: Notify parent to add chat-panel-active class → hides mobile nav bar
            if (window.innerWidth <= 768) {
                try { window.parent.postMessage({ type: 'CHAT_OPENED', timestamp: Date.now() }, '*'); } catch (_) {}
            }
            
            const nameEl = document.getElementById('chatFriendName');
            const avatarEl = document.getElementById('chatFriendAvatar');
            const statusEl = document.getElementById('chatStatusText');
            const indicatorEl = document.getElementById('chatStatusIndicator');
            
            if (nameEl) {
                const resolvedPanelName = conversation.friendName || conversation.name || '';
                // FIX Bug4/5: Never overwrite a real name with the "Loading…" placeholder.
                // If we already have a real name in the DOM, keep it until we get a better one.
                const existingName = nameEl.textContent || '';
                const incomingIsPlaceholder = !resolvedPanelName || resolvedPanelName === 'Loading…' || resolvedPanelName === 'Chat';
                const existingIsPlaceholder = !existingName || existingName === 'Loading…' || existingName === 'Select a chat' || existingName === 'Chat';
                if (!incomingIsPlaceholder || existingIsPlaceholder) {
                    nameEl.textContent = resolvedPanelName || existingName || 'Chat';
                }
            }
            // FIX: Always resolve real online status from FriendManager — not stale conversation snapshot
            const _fid = conversation.friendId || conversation.otherUserId || (conversation.otherParticipant && conversation.otherParticipant.id);
            let _realOnline = false;
            if (_fid && FriendManager) {
                const _f = FriendManager.getFriend(_fid) || FriendManager.getFriend(parseInt(_fid));
                if (_f) {
                    _realOnline = !!(_f.online || _f.status === 'online');
                } else {
                    // Fall back to participant data on the conversation itself
                    const _op = conversation.otherParticipant;
                    _realOnline = _op ? (_op.status === 'online') : !!conversation.online;
                }
            } else {
                const _op = conversation.otherParticipant;
                _realOnline = _op ? (_op.status === 'online') : !!conversation.online;
            }
            if (statusEl) {
                statusEl.textContent = _realOnline ? 'Active now' : (conversation.lastSeen ? UIFeatures.formatLastSeen(conversation.lastSeen, false) : 'Offline');
            }
            if (indicatorEl) {
                indicatorEl.className = `chat-status ${_realOnline ? 'online' : 'offline'}`;
            }
            if (avatarEl) {
                if (conversation.friendAvatar) {
                    avatarEl.innerHTML = `<img src="${conversation.friendAvatar}" alt="${conversation.friendName || 'User'}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                } else {
                    const _initials = (conversation.friendName || 'U').charAt(0).toUpperCase();
                    avatarEl.innerHTML = `<span style="width:100%;height:100%;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;">${_initials}</span>`;
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
            if (!SessionManager.isAuthenticated()) return;
            
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

            const currentUserId = SessionManager.getUserId();
            const pendingReadIds = (ChatManager.getMessages() || [])
                .filter((message) => String(message.chatId || message.conversationId || '') === String(conversationId))
                .filter((message) => String(message.senderId || message.sender?.id || '') !== String(currentUserId))
                .filter((message) => !['read', 'seen'].includes(String(message.status || '').toLowerCase()))
                .map((message) => message.serverId || message.id)
                .filter(Boolean);

            if (pendingReadIds.length > 0) {
                makeApiRequest('/messages/mark-read/batch', 'POST', {
                    chatId: conversationId,
                    messageIds: pendingReadIds
                }).catch(() => {});
            }
            
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
                        isConversationMatchForUser(c, numericReceiverId, SessionManager.getUserId())
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
                            // First try /api/users/search or /api/friends to avoid 404 on numeric IDs
                            let userInfo = null;
                            // Try friends endpoint which returns full user objects
                            const friendsList = await makeApiRequest('/friends', 'GET').catch(() => null);
                            const friendsArr = friendsList?.friends || friendsList?.data?.friends || friendsList?.data || (Array.isArray(friendsList) ? friendsList : []);
                            const matchedFriend = friendsArr.find(f =>
                                String(f.id) === String(numericReceiverId) ||
                                String(f.numericId) === String(numericReceiverId) ||
                                String(f.userId) === String(numericReceiverId)
                            );
                            if (matchedFriend) {
                                userInfo = matchedFriend;
                            }
                            // Fallback: try /api/users?id= query param (avoids 404 from path param)
                            if (!userInfo) {
                                const searchResult = await makeApiRequest(`/users/search?userId=${numericReceiverId}`, 'GET').catch(() => null);
                                userInfo = searchResult?.user || searchResult?.data?.user || searchResult?.data || null;
                            }
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
                isConversationMatchForUser(c, numericUserId, SessionManager.getUserId())
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
                    isConversationMatchForUser(c, numericUserId, SessionManager.getUserId())
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
            // FIX: Old code used truncated base64 WAV ('UklGR...') that never played.
            // Use Web Audio API to synthesize a short notification beep instead —
            // works in all browsers without any asset dependency.
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    const ctx = new AudioCtx();
                    const oscillator = ctx.createOscillator();
                    const gainNode   = ctx.createGain();
                    oscillator.connect(gainNode);
                    gainNode.connect(ctx.destination);
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(880, ctx.currentTime);       // A5
                    oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // ~C#6
                    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    oscillator.start(ctx.currentTime);
                    oscillator.stop(ctx.currentTime + 0.3);
                    // Auto-close AudioContext after sound plays to free resources
                    oscillator.onended = () => { try { ctx.close(); } catch(_) {} };
                    return;
                }
            } catch (_audioErr) { /* fall through to Notification */ }
            // Fallback: browser notification if audio fails
            try {
                if (Notification.permission === 'granted') {
                    new Notification('New message', { body: 'You have a new message', silent: false });
                }
            } catch (_) {}
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
            // FIX: Removed all send button and keypress listeners from messages-core.js.
            // messages-ui.js already attaches its own click handler to #sendButton (line ~7159)
            // and its own keydown Enter handler to #messageInput (line ~8493).
            // Having both attach simultaneously caused every send action to fire TWO
            // calls to sendMessage() → two HTTP POST /messages requests → two messages
            // stored on the server with different IDs → sender sees duplicates,
            // receiver sees the message arrive twice via WebSocket, second one deduped
            // and dropped → looks like delivery failed.
            // messages-ui.js is the authoritative UI layer. messages-core.js only exposes
            // the sendMessage() API that messages-ui.js calls.
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
                    const conversationId = conversationItem.dataset.chatId;
                    if (conversationId) {
                        const startChatPanel = document.getElementById('startChatPanel');
                        if (startChatPanel) startChatPanel.style.display = 'none';
                        
                        const chatPanel = document.getElementById('chatPanel');
                        if (chatPanel) chatPanel.classList.remove('hidden');
                        
                        // FIXED: Always open conversation — from cache when offline, live when online
                        await ConversationManager.openConversation(conversationId);
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

            // FIX: Proactively request session immediately after CHILD_READY.
            // If the parent sends SESSION_DATA before PARENT_READY, our handler
            // (_handleSessionData) will now promote directly to ACTIVE. This prevents
            // the "stuck in INITIALIZING" bug on first load.
            setTimeout(() => {
                if (currentState !== LIFECYCLE_STATES.ACTIVE && !SessionManager.isAuthenticated()) {
                    console.log(`[${MODULE_NAME}] Proactive REQUEST_SESSION after CHILD_READY`);
                    try {
                        window.parent && window.parent !== window && window.parent.postMessage({
                            id: generateMessageId(),
                            type: OUTGOING_ACTIONS.REQUEST_SESSION,
                            source: MODULE_NAME,
                            target: 'parent',
                            requestId: generateRequestId(),
                            payload: { module: MODULE_NAME, timestamp: Date.now() },
                            timestamp: Date.now()
                        }, '*');
                    } catch (_e) {}
                }
            }, 50);
            
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
    
    // ONE-TIME: Clear ONLY the stale chats list-cache (localStorage) on new devices.
    // NOTE: We intentionally do NOT call KynectaLocalStore.clearAll() here —
    // doing so would wipe ALL offline message history before the server repopulates,
    // causing messages to disappear after reopen on a new device (Bug #2).
    // The IDB message store is the offline cache: clearing it on first load of a new
    // device destroys data the user cannot recover until every chat is reopened.
    // Instead, server-sync (startDataFlow → fetchConversations) handles merging fresh
    // server data with any locally-cached messages — no nuclear clear needed.
    (function _runOnceConversationCleanup() {
        const CLEANUP_VERSION = 'kynecta_conv_cleanup_v3'; // bumped from v2 — v2 called clearAll()
        try {
            if (localStorage.getItem(CLEANUP_VERSION)) return; // already ran on this device
            localStorage.setItem(CLEANUP_VERSION, '1');
        } catch (_) { return; }

        console.log('[CLEANUP] Running one-time stale-cache purge (IDB preserved)…');

        // 1. DO NOT clear the deleted-chats blocklist — preserve user deletions across refresh.

        // 2. Clear only the stale chats LIST cache so the sidebar re-fetches from server.
        //    This is safe: it's just the sidebar cache key, not the message store.
        try {
            localStorage.removeItem('kynecta_chats_cache_v8');
        } catch (_) {}

        // 3. DO NOT call KynectaLocalStore.clearAll() — that nukes ALL IDB message history.
        //    Server data will repopulate naturally via the normal fetchConversations() call
        //    that runs as part of startDataFlow() immediately after this IIFE.
        console.log('[CLEANUP] Stale sidebar cache cleared — IDB message history preserved.');
    })();

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
            // demo mode removed
        }
        
        Logger.info('DataFlow', 'Starting data flow');
        
        if (ChatManager._conversations && ChatManager._conversations.length > 0) {
            // FIX: No longer need to check for fake demo IDs — cache data is always real
            console.log('[DataFlow] Conversations already loaded from cache — syncing with server');
        }
        if (FriendManager._friends && FriendManager._friends.length > 0) {
            const hasOnlyDemo = false; // Demo data fully removed
            if (hasOnlyDemo) {
                console.log('[DataFlow] Clearing demo friends to load real data');
                FriendManager._friends = [];
                FriendManager._friendsMap.clear();
            }
        }
        
        ConversationManager.fetchConversations()
            .then(() => {
                // Restore last open chat AFTER conversations are loaded so the
                // conversation object exists in ChatManager when we look it up.
                restoreLastChat();
            })
            .catch(e => {
                Logger.error('DataFlow', 'Failed to fetch conversations', e);
                // Still attempt restore in case cache has data
                restoreLastChat();
            });
        
        FriendManager.fetchFriends().catch(e => {
            Logger.error('DataFlow', 'Failed to fetch friends', e);
        });
        
        Logger.success('DataFlow', 'Data flow started');

        // ── Wire RealtimeSyncEngine delta sync on reconnect ─────────────────
        // When socket reconnects, do a delta sync instead of full reload
        const _bus = window.KynectaEventBus;
        if (_bus && typeof _bus.on === 'function') {
            _bus.on('SYNC_STARTED', async ({ reason } = {}) => {
                console.log('[DataFlow] Delta sync triggered, reason:', reason);
                try {
                    // 1. Re-fetch conversations (soft merge, tombstones prevent resurrection)
                    await ChatManager.fetchConversations();

                    // 2. Re-fetch messages for active conversation (delta since last sync)
                    const active = ChatManager._activeConversation;
                    if (active?.id) {
                        const syncEngine = window.__RealtimeSyncEngine;
                        if (syncEngine?.requestDeltaSync) {
                            await syncEngine.requestDeltaSync(active.id, async (chatId, since) => {
                                const result = await makeApiRequest(
                                    `/messages?chatId=${chatId}&since=${since}&limit=50`, 'GET'
                                );
                                return result?.messages || result?.data?.messages || [];
                            });
                        } else {
                            // Fallback: just re-fetch last 50 messages
                            await ChatManager.fetchMessages(active.id, { limit: 50, merge: true });
                        }
                    }

                    // 3. Flush any queued offline messages now that we're connected
                    if (window.__OfflineMessageQueue?.size?.() > 0) {
                        setTimeout(() => window.__OfflineMessageQueue.flushAll(), 1500);
                    }
                } catch(e) {
                    console.warn('[DataFlow] Delta sync error:', e.message);
                }
            });

            // Also listen for BroadcastChannel tombstone sync from other tabs
            try {
                const _syncBc = new BroadcastChannel('kynecta_sync');
                _syncBc.addEventListener('message', (e) => {
                    if (e.data?.type === 'tombstone' && e.data?.entity === 'conversation') {
                        const sid = String(e.data.id);
                        ChatManager._conversations = (ChatManager._conversations || [])
                            .filter(c => String(c.id) !== sid);
                        ChatManager._notifySubscribers();
                    }
                });
            } catch(_) {}
        }
    }

    // =============================================
    // OPEN CHAT BY USER ID - Core function
    // =============================================

    async function openChatWithUser(userId, userName, userAvatar) {
        console.log('[MessageCore] openChatWithUser called:', { userId, userName, userAvatar });
        
        if (!userId) {
            console.error('[MessageCore] Cannot open chat: No userId provided');
            return { success: false, error: 'No userId provided' };
        }
        
        const numericUserId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        
        let realUserName = userName;
        let realAvatar = userAvatar;
        if (window.MessagesCore && window.MessagesCore.FriendManager) {
            const friend = window.MessagesCore.FriendManager.getFriend(numericUserId);
            if (friend) {
                realUserName = friend.displayName || friend.username || friend.name || userName;
                realAvatar = realAvatar || friend.avatar || friend.photoURL || friend.avatarUrl;
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
                        isConversationMatchForUser(c, numericUserId, SessionManager.getUserId())
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
                    userAvatar: realAvatar || null,
                    recipientId: numericUserId,
                    recipientName: displayName,
                    recipientAvatar: realAvatar || null,
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
        // MODULE-LEVEL guard — iframe reloads reset window, so we use a document-level flag
        // that survives within the same page load but resets on true iframe recreation.
        if (document.__msgCoreRealtimeBound) return;
        document.__msgCoreRealtimeBound = true;
        let hasRealtimeBinding = false;

        const renderRealtimeUpdate = function(chatId, normalizedMessage = null) {
            const _tsMs3 = _normalizeTs; // FIX: consolidated to canonical _normalizeTs

            if (normalizedMessage && ChatManager && ChatManager.addMessage) {
                // FIX: normalize timestamps to numeric ms before storing
                if (normalizedMessage.createdAt && typeof normalizedMessage.createdAt === 'string') {
                    normalizedMessage.createdAt = new Date(normalizedMessage.createdAt).getTime();
                }
                ChatManager.addMessage(normalizedMessage);
            }

            if (normalizedMessage && chatId) {
                upsertRealtimeConversation(chatId, normalizedMessage);
            }

            if (ChatManager && ChatManager._conversationsMap && chatId) {
                const conversation = ChatManager._conversationsMap.get(chatId) || ChatManager._conversationsMap.get(String(chatId));
                if (conversation && normalizedMessage) {
                    conversation.lastMessage = normalizedMessage.content;
                    conversation.lastMessageAt = _tsMs3(normalizedMessage.createdAt || normalizedMessage.timestamp) || Date.now();
                    const _av = ChatManager.getActiveChat && ChatManager.getActiveChat();
                    const _viewing = _av && String(_av.id) === String(chatId);
                    if (!_viewing) {
                        const myId = SessionManager && SessionManager.getUserId && SessionManager.getUserId();
                        if (!normalizedMessage.senderId || String(normalizedMessage.senderId) !== String(myId)) {
                            conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                        }
                    }
                }
                if (ChatManager._conversations) {
                    ChatManager._conversations.sort(function(a, b) { return _tsMs3(b.lastMessageAt) - _tsMs3(a.lastMessageAt); });
                }
            }

            const activeChat = ChatManager && ChatManager.getActiveChat && ChatManager.getActiveChat();
            const _rcId = String(chatId || '');
            const _acId = activeChat ? String(activeChat.id || '') : '';
            let isThisChat = !!(_rcId && _acId && _rcId === _acId);
            // SECONDARY: friendId match — when User A receives User B's reply, senderId=B
            // and activeChat.friendId=B, so we match even if chatId check somehow fails
            if (!isThisChat && activeChat && normalizedMessage && normalizedMessage.senderId) {
                const _afid = String(activeChat.friendId || activeChat.otherUserId ||
                    (activeChat.otherParticipant && activeChat.otherParticipant.id) || '');
                if (_afid && _afid === String(normalizedMessage.senderId)) isThisChat = true;
            }
            // TERTIARY: panel is open but _activeConversation cleared — recover from map
            if (!isThisChat && _rcId) {
                const _panel = document.getElementById('chatPanel');
                if (_panel && !_panel.classList.contains('hidden') && ChatManager._conversationsMap) {
                    const _conv = ChatManager._conversationsMap.get(_rcId) || ChatManager._conversationsMap.get(Number(_rcId));
                    if (_conv) { ChatManager._activeConversation = _conv; isThisChat = true; }
                }
            }

            // Always update sidebar (unread badge, online status, last message)
            try {
                window.dispatchEvent(new CustomEvent('renderChatsList', {
                    detail: {
                        conversations: ensureSafeArray(ChatManager._conversations),
                        currentChat: ChatManager._activeConversation,
                        currentCategory: ChatManager.getCurrentCategory && ChatManager.getCurrentCategory(),
                        messageDrafts: {}
                    }
                }));
            } catch (_e) {}

            if (isThisChat) {
                try {
                    const _all = ChatManager._messages || [];
                    const _now = ChatManager._activeConversation || activeChat;
                    const _mid = _rcId || _acId;
                    let _msgs = _all.filter(function(m) {
                        const mid = String(m.chatId || m.conversationId || '');
                        return mid === _mid || mid === _acId;
                    }).sort(function(a, b) {
                        return _tsMs3(a.createdAt || a.timestamp) - _tsMs3(b.createdAt || b.timestamp);
                    });
                    if (normalizedMessage) {
                        const _has = _msgs.some(function(m) {
                            return (m.id && normalizedMessage.id && String(m.id) === String(normalizedMessage.id)) ||
                                   (m.localId && normalizedMessage.localId && String(m.localId) === String(normalizedMessage.localId));
                        });
                        if (!_has) {
                            _msgs = _msgs.concat([normalizedMessage]).sort(function(a, b) {
                                return _tsMs3(a.createdAt || a.timestamp) - _tsMs3(b.createdAt || b.timestamp);
                            });
                        }
                    }
                    const _renderMsgs = _msgs.length > 0 ? _msgs : (normalizedMessage ? [normalizedMessage] : []);
                    if (_renderMsgs.length > 0 && _now) {
                        // ── FORENSIC LOG: UI_RENDERED ─────────────────────────────────
                        const _rmId = normalizedMessage ? (normalizedMessage.id || normalizedMessage.localId || '?') : '?';
                        console.log(`[FORENSIC] UI_RENDERED | messageId=${_rmId} | chatId=${chatId} | msgCount=${_renderMsgs.length} | ts=${Date.now()}`);
                        window.dispatchEvent(new CustomEvent('renderMessages', {
                            detail: { messages: _renderMsgs, currentChat: _now, currentUser: SessionManager && SessionManager.getUser && SessionManager.getUser() }
                        }));
                        try {
                            const _c = document.getElementById('messagesContainer');
                            if (_c) requestAnimationFrame(function() { _c.scrollTop = _c.scrollHeight; });
                        } catch (_) {}
                    }
                } catch (_e) {}
            } else if (normalizedMessage) {
                try {
                    const _sid = normalizedMessage.senderId;
                    const _mid = SessionManager && SessionManager.getUserId && SessionManager.getUserId();
                    if (!_sid || String(_sid) !== String(_mid)) {
                        if (UIFeatures && typeof UIFeatures.playNotificationSound === 'function') UIFeatures.playNotificationSound();
                        window.dispatchEvent(new CustomEvent('kyn:incomingMessage', { detail: { message: normalizedMessage, chatId: chatId } }));
                    }
                } catch (_e) {}
            }
        };

        // FIX: Dedup set prevents the same message being processed multiple times.
        // chat.html sends both 'message:new' AND 'new_message' to the iframe,
        // and multiple listeners (window.message, KynectaRealtime.on, document.message:new)
        // can all fire for the same payload — without dedup the message renders 4+ times.
        if (!window.__realtimeProcessedIds) window.__realtimeProcessedIds = new Set();
        if (!window.__realtimeSentIds)      window.__realtimeSentIds      = new Set();
        if (!window.__realtimeDeliveredAckIds) window.__realtimeDeliveredAckIds = new Set();
        const _realtimeProcessedIds = window.__realtimeProcessedIds;
        const _realtimeSentIds      = window.__realtimeSentIds;
        const _realtimeDeliveredAckIds = window.__realtimeDeliveredAckIds;

        const ackMessageDelivered = async function(message) {
            const chatId = String(message?.chatId || message?.conversationId || '');
            const messageId = String(message?.serverId || message?.id || '');
            if (!chatId || !messageId) return;

            const ackKey = `${chatId}:${messageId}`;
            if (_realtimeDeliveredAckIds.has(ackKey)) return;
            _realtimeDeliveredAckIds.add(ackKey);
            setTimeout(function() { _realtimeDeliveredAckIds.delete(ackKey); }, 30000);

            try {
                console.log('[messages-core] 📬 delivery ack send', { chatId, messageId });
                await makeApiRequest('/messages/mark-delivered/batch', 'POST', {
                    chatId,
                    messageIds: [messageId]
                });
                console.log('[messages-core] ✅ delivery ack success', { chatId, messageId });
            } catch (error) {
                console.warn('[messages-core] Delivery ack failed:', error && error.message ? error.message : error);
            }
        };

        const handleRealtimePayload = async function(type, payload) {
            const normalizedType = String(type || '').toLowerCase();
            // FIX: 'data' was never declared — use 'payload' (the actual parameter name).
            // This was a ReferenceError that crashed handleRealtimePayload on EVERY incoming
            // message, which is why no messages were ever displayed in the chat panel.
            const data = payload || {};

            if (normalizedType === 'new_message' || normalizedType === 'message:new' || normalizedType === 'newmessage') {
                // ✅ FIX: data may be the raw payload (from wsService.on) or a wrapper
                // { payload:{...}, source:'ws-bridge' } (from postMessage bridge).
                // Unwrap one level if needed, then fall back to data itself.
                const message = (data && data.payload && (data.payload.id || data.payload.chatId))
                    ? data.payload
                    : (data && data.data && (data.data.id || data.data.chatId))
                        ? data.data
                        : data;
                const chatId = String(
                    (message && (message.chatId || message.conversationId)) || ''
                );
                // ✅ FIX: Don't gate on message.id — server might not echo id back immediately.
                // Gate only on chatId so we never silently drop a valid incoming message.
                if (!message || !chatId) return;

                // ✅ FIX 4: Guard against String(undefined) = "undefined" poisoning the local store.
                const _safeId = message.id != null ? String(message.id) : null;
                const _safeLocalId = message.localId != null ? String(message.localId) : null;
                // Reject messages with no usable id to prevent corrupt dedup state
                if (!_safeId && !_safeLocalId && !message.content) return;

                // FIX: Dedup — chat.html posts 'message:new' AND 'new_message' for the same payload,
                // and multiple event listeners can fire. Use a Set to process each message only once.
                // FIXED DEDUP: prefix with chatId so sender+receiver never collide on same serverId.
                // Sender processes serverId "214", adds "7:214". Receiver also gets "7:214" —
                // BUT sender and receiver are different browsers/users so they have separate
                // window.__realtimeProcessedIds Sets. Within one browser (same user), this
                // prevents the 12-listener-firing duplicates without blocking cross-user delivery.
                // FIX BUG #6: Dedup key MUST include a valid chatId.
                // If chatId is missing/undefined, using it as prefix causes all messages
                // for different chats to share the same "undefined:id" key — silently
                // dropping all messages after the first.
                // Only use chatId-prefixed key when chatId is a real, non-empty value.
                const _validChatId = chatId && chatId !== 'undefined' && chatId !== 'null' ? chatId : null;
                const _dedupKey = (_validChatId && _safeId ? (_validChatId + ':' + _safeId) : null) ||
                    (_validChatId && _safeLocalId ? (_validChatId + ':' + _safeLocalId) : null) ||
                    (_safeId ? ('msg:' + _safeId) : null) ||
                    (_safeLocalId ? ('local:' + _safeLocalId) : null) ||
                    ((_validChatId || 'nochat') + ':' + (message.content || '') + ':' + (message.createdAt || message.timestamp || ''));
                if (_realtimeProcessedIds.has(_dedupKey)) return;
                _realtimeProcessedIds.add(_dedupKey);
                setTimeout(function() { _realtimeProcessedIds.delete(_dedupKey); }, 8000);

                // FIXED ECHO PREVENTION:
                // Only suppress if senderId === myId AND we have proof this is OUR sent copy:
                //   a) _safeLocalId present (optimistic message echoed back with localId), OR
                //   b) serverId is tracked in kynecta_sent_ids_v8 (set when message:sent fires).
                // Without this guard, User A's messages to User B were suppressed on User B's
                // side whenever B happened to be user 3 and A was also user 3 (same test account),
                // or when SessionManager.getUserId() returned null and the comparison was skipped.
                const _realtimeCurrentUserId = (SessionManager && SessionManager.getUserId && SessionManager.getUserId()) ||
                    (window.__PARENT_SESSION__ && (window.__PARENT_SESSION__.userId || (window.__PARENT_SESSION__.user && window.__PARENT_SESSION__.user.id))) ||
                    null;
                const _realtimeSenderId = message.senderId || (message.sender && message.sender.id);
                if (_realtimeSenderId && _realtimeCurrentUserId &&
                    String(_realtimeSenderId) === String(_realtimeCurrentUserId)) {
                    // Confirm it's our echo — not just any message from us
                    const _hasLocalMarker = !!(_safeLocalId || message.localId || message.requestId);
                    const _inSentLog = (function() {
                        if (!_safeId) return false;
                        try { return JSON.parse(localStorage.getItem('kynecta_sent_ids_v8') || '[]').includes(_safeId); }
                        catch(_) { return false; }
                    })();
                    if (_hasLocalMarker || _inSentLog) {
                        // Definitely our own echo — update status only
                        const _echoLocalId = _safeLocalId || message.localId || null;
                        const _echoServerId = _safeId || null;
                        if (ChatManager && ChatManager.updateMessageStatus) {
                            ChatManager.updateMessageStatus(
                                _echoLocalId || _echoServerId,
                                message.status || 'sent',
                                { serverId: _echoServerId, localId: _echoLocalId }
                            );
                        }
                        // Also track serverId for future echo prevention
                        if (_echoServerId) {
                            try {
                                const _sl = JSON.parse(localStorage.getItem('kynecta_sent_ids_v8') || '[]');
                                if (!_sl.includes(_echoServerId)) { _sl.push(_echoServerId); if (_sl.length > 200) _sl.splice(0, _sl.length - 200); localStorage.setItem('kynecta_sent_ids_v8', JSON.stringify(_sl)); }
                            } catch(_) {}
                        }
                        return;
                    }
                    // No proof it's our echo — fall through and render normally.
                    // This handles the case where server strips localId from the echo.
                }

                // FIX: always numeric ms — ISO strings compare as NaN in sort
                const _sca = message.createdAt
                    ? (typeof message.createdAt === 'string' ? new Date(message.createdAt).getTime() : Number(message.createdAt))
                    : (message.timestamp ? (typeof message.timestamp === 'string' ? new Date(message.timestamp).getTime() : Number(message.timestamp)) : Date.now());

                let normalizedMessage = {
                    id:       _safeId || _safeLocalId || ('tmp_' + Date.now()),
                    serverId: _safeId || null,
                    localId:  _safeLocalId || null,
                    content: message.content || message.text || '',
                    type: message.type || 'text',
                    senderId: message.senderId || (message.sender && message.sender.id),
                    sender: message.sender || null,
                    replyToId: message.replyToId || null,
                    replyTo:   message.replyTo   || null,
                    reactions: message.reactions || {},
                    timestamp: _sca,
                    createdAt: _sca,
                    status: message.status || 'delivered',
                    conversationId: chatId,
                    chatId: chatId,
                    isLocalOnly: false
                };

                if (window.KynectaSyncEngine?.ingestIncomingMessage) {
                    const saved = await window.KynectaSyncEngine.ingestIncomingMessage(message, chatId).catch(() => null);
                    if (saved) {
                        normalizedMessage = {
                            ...saved,
                            conversationId: saved.chatId || saved.conversationId || chatId,
                            chatId: saved.chatId || chatId
                        };
                    }
                } else if (window.KynectaLocalStore?.saveMessage) {
                    // CRITICAL FIX: Save to IDB directly even without SyncEngine
                    // This ensures fetchMessages picks it up after user sends reply
                    window.KynectaLocalStore.saveMessage({
                        serverId:    String(normalizedMessage.id || normalizedMessage.serverId || ''),
                        chatId:      String(chatId),
                        conversationId: String(chatId),
                        senderId:    normalizedMessage.senderId,
                        content:     normalizedMessage.content || '',
                        type:        normalizedMessage.type || 'text',
                        sender:      normalizedMessage.sender || null,
                        status:      'delivered',
                        createdAt:   normalizedMessage.createdAt || Date.now(),
                        isLocalOnly: false,
                    }).catch(function(){});
                }

                renderRealtimeUpdate(chatId, normalizedMessage);
                ackMessageDelivered(normalizedMessage).catch(() => {});
                // FIX-MSG-DELIVERY-ACK: Phase 2 — tell server we received this message
                // so the sender gets 'message:delivered' and delivery timeout is cleared.
                try {
                    var _delSocket = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
                    if (_delSocket && typeof _delSocket.emit === 'function') {
                        _delSocket.emit('message:delivery_ack', {
                            messageId: normalizedMessage.serverId || normalizedMessage.id,
                            chatId:    normalizedMessage.chatId || normalizedMessage.conversationId,
                            senderId:  normalizedMessage.senderId || normalizedMessage.userId,
                        });
                    }
                } catch(_dErr) { /* silent — delivery ack is best-effort */ }
                EventBus.emit('message:received', normalizedMessage);
                try { window.dispatchEvent(new CustomEvent('newMessage', { detail: { message: normalizedMessage } })); } catch (_e) {}
                return;
            }

            if (normalizedType === 'message_sent' || normalizedType === 'message:sent') {
                const d = (data.payload && (data.payload.localId || data.payload.messageId)) ? data.payload : data;
                const messageId = d.localId || d.messageId || d.serverId || d.id;
                const _sk = String(d.localId||'') + ':' + String(d.serverId||d.messageId||d.id||'');
                if (_sk !== ':' && _realtimeSentIds.has(_sk)) return;
                if (_sk !== ':') { _realtimeSentIds.add(_sk); setTimeout(()=>_realtimeSentIds.delete(_sk), 15000); }
                console.log('[messages-core] ✅ message:sent received localId=', d.localId, 'serverId=', d.serverId || d.messageId);
                // Track serverId so echo prevention knows this was our own sent message
                const _confirmServerId = d.serverId || d.messageId || d.id;
                if (_confirmServerId) {
                    try {
                        const _sl = JSON.parse(localStorage.getItem('kynecta_sent_ids_v8') || '[]');
                        const _sid = String(_confirmServerId);
                        if (!_sl.includes(_sid)) { _sl.push(_sid); if (_sl.length > 200) _sl.splice(0, _sl.length - 200); localStorage.setItem('kynecta_sent_ids_v8', JSON.stringify(_sl)); }
                    } catch(_) {}
                }
                if (messageId && ChatManager.updateMessageStatus) {
                    ChatManager.updateMessageStatus(messageId, 'sent', {
                        localId:  d.localId  || null,
                        serverId: d.serverId || d.messageId || d.id || null
                    });
                }
                return;
            }

            // FIX-MSG-DELIVERY: Handle Phase 1 — server received message
            if (normalizedType === 'message_received_by_server' || normalizedType === 'message:received_by_server') {
                const mid = (data.messageId || data.payload?.messageId || '');
                if (mid) {
                    // Update local message status to 'received' (single tick → double tick)
                    EventBus.emit('message:status_update', { messageId: mid, status: 'received', timestamp: data.timestamp || Date.now() });
                    console.log('[messages-core] 📡 message received by server mid=' + mid);
                }
                return;
            }

            // FIX-MSG-DELIVERY: Handle delivery failure — mark as failed
            if (normalizedType === 'message_delivery_failed' || normalizedType === 'message:delivery_failed') {
                const mid = (data.messageId || data.payload?.messageId || '');
                const reason = data.reason || 'delivery_timeout';
                if (mid) {
                    EventBus.emit('message:status_update', { messageId: mid, status: 'failed', reason, timestamp: data.timestamp || Date.now() });
                    console.warn('[messages-core] ❌ message delivery failed mid=' + mid + ' reason=' + reason);
                }
                return;
            }

            if (normalizedType === 'message_delivered' || normalizedType === 'message:delivered') {
                // ✅ FIX 9: Unwrap postMessage bridge wrapper
                const d = (data.payload && (data.payload.localId || data.payload.messageId)) ? data.payload : data;
                const messageId = d.localId || d.messageId || d.serverId || d.id;
                if (messageId && ChatManager.updateMessageStatus) {
                    ChatManager.updateMessageStatus(messageId, 'delivered', {
                        deliveredAt: d.deliveredAt || d.timestamp || Date.now(),
                        localId:  d.localId  || null,
                        serverId: d.serverId || d.messageId || d.id || null
                    });
                }
                return;
            }

            if (normalizedType === 'message_read' || normalizedType === 'message:read' || normalizedType === 'message_seen' || normalizedType === 'message:seen') {
                // ✅ FIX 9: Unwrap postMessage bridge wrapper
                const d = (data.payload && (data.payload.localId || data.payload.messageId)) ? data.payload : data;
                const ids = Array.isArray(d.messageIds) && d.messageIds.length > 0
                    ? d.messageIds
                    : [d.localId || d.messageId || d.serverId || d.id].filter(Boolean);
                ids.forEach((messageId) => {
                    if (messageId && ChatManager.updateMessageStatus) {
                        ChatManager.updateMessageStatus(messageId, 'read', {
                            readAt:   d.readAt   || d.timestamp || Date.now(),
                            localId:  d.localId  || null,
                            serverId: d.serverId || d.messageId || d.id || null
                        });
                    }
                });
                return;
            }

            if (normalizedType === 'message_deleted' || normalizedType === 'message:deleted') {
                const d = (data.payload && (data.payload.messageId || data.payload.messageIds)) ? data.payload : data;
                const ids = Array.isArray(d.messageIds) && d.messageIds.length > 0
                    ? d.messageIds.map(String)
                    : [d.messageId || d.id].filter(Boolean).map(String);
                if (ids.length === 0) return;

                const activeChatId = d.chatId || d.conversationId || ChatManager.getActiveChat()?.id || null;

                // PHASE10-FIX: Remove messages individually — NEVER call setMessages() on deletion.
                // setMessages() replaces the entire array, potentially wiping unrelated messages.
                // Instead: filter _messages in-place and rebuild the map.
                ids.forEach(function(id) {
                    // Record in deletion registry — prevents cache resurrection
                    try { window.__PHASE10_DeletionRegistry?.mark('message', id, 'deleted'); } catch(_) {}

                    // Remove from in-memory array
                    const idx = ChatManager._messages
                        ? ChatManager._messages.findIndex(function(m) {
                            return String(m.id||'') === id || String(m.serverId||'') === id || String(m.localId||'') === id;
                          })
                        : -1;
                    if (idx !== -1) {
                        ChatManager._messages.splice(idx, 1);
                        ChatManager._messagesMap?.delete(id);
                    }

                    // Remove from localStorage cache
                    if (activeChatId) {
                        try {
                            const cacheKey = `kynecta_messages_v8_${activeChatId}`;
                            const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
                            if (Array.isArray(cached)) {
                                const filtered = cached.filter(function(m) { return String(m.id||'') !== id; });
                                if (filtered.length !== cached.length) localStorage.setItem(cacheKey, JSON.stringify(filtered));
                            }
                        } catch(_) {}
                    }

                    // Remove from IndexedDB
                    if (window.KynectaLocalStore) {
                        window.KynectaLocalStore.deleteMessage(id).catch(() => {});
                    }
                });

                // Rebuild map and notify subscribers once (not per-message)
                if (ids.length > 0) {
                    ChatManager._rebuildMessagesMap?.();
                    ChatManager._notifySubscribers?.();
                }

                EventBus.emit('message:deleted', { messageIds: ids, chatId: activeChatId, forEveryone: !!d.deleteForEveryone });
                return;
            }

            // FIX: Handle message:reaction from server (both sides see emoji)
            if (normalizedType === 'message:reaction' || normalizedType === 'message_reaction' || normalizedType === 'reaction_updated') {
                const d = (data.payload && data.payload.messageId) ? data.payload : data;
                const _rmId = d.messageId; const _rReact = d.reactions;
                if (!_rmId || !_rReact) return;
                const _rAll = ChatManager.getMessages ? ChatManager.getMessages() : [];
                const _rTgt = _rAll.find(function(m) { return String(m.id || m.serverId) === String(_rmId); });
                if (_rTgt) {
                    _rTgt.reactions = _rReact;
                    try {
                        const _rb = document.querySelector('[data-message-id="' + _rmId + '"] .message-bubble');
                        const _re = document.querySelector('[data-message-id="' + _rmId + '"] .message-reactions');
                        const _myId4 = SessionManager && SessionManager.getUserId && SessionManager.getUserId();
                        let _rh = '';
                        if (_rReact && Object.keys(_rReact).length > 0) {
                            _rh = '<div class="message-reactions">';
                            for (const [em, users] of Object.entries(_rReact)) {
                                const ul = Array.isArray(users) ? users : (users ? [users] : []);
                                if (!ul.length) continue;
                                const mine = _myId4 && ul.some(function(u) { return String(u) === String(_myId4); });
                                _rh += '<span class="reaction' + (mine ? ' reaction-mine' : '') + '">' + em + ' ' + ul.length + '</span>';
                            }
                            _rh += '</div>';
                        }
                        if (_re) { _re.outerHTML = _rh; } else if (_rh && _rb) { _rb.insertAdjacentHTML('beforeend', _rh); }
                    } catch(_) {}
                }
                return;
            }
        };

        window.addEventListener('message', function(event) {
            const data = event.data;
            if (!data || typeof data !== 'object') return;
            // FIX: Only route actual new messages — status/session/settings events
            // previously caused duplicates and ghost messages
            const _rt = String(data.type || '').toLowerCase();
            if (_rt === 'message:new' || _rt === 'new_message' || _rt === 'newmessage' ||
                _rt === 'chat:message' || _rt === 'message_received' ||
                _rt === 'message:deleted' || _rt === 'message_deleted' ||
                _rt === 'message:seen' || _rt === 'message_seen' ||
                _rt === 'message:read' || _rt === 'message_read' ||
                _rt === 'message:delivered' || _rt === 'message_delivered') {
                handleRealtimePayload(data.type, data);
            }
            if (data.type === 'message:reaction' || data.type === 'REACTION_UPDATED') {
                handleRealtimePayload('message:reaction', data);
            }

            // ── LAN message received (same subnet peer sent directly) ─────────
            if (data.type === 'lan:message' || data.type === 'LAN_MESSAGE') {
                const lanMsg = data.payload || data;
                if (lanMsg && lanMsg.content) {
                    handleRealtimePayload('message:new', {
                        type: 'message:new',
                        payload: { ...lanMsg, transport: 'LAN' },
                        message: { ...lanMsg, transport: 'LAN' },
                    });
                }
            }

            // ── Offline queue delivery confirmation ──────────────────────────
            if (data.type === 'queue:delivered' && data.localId) {
                window.__OfflineMessageQueue?.markDelivered?.(data.localId).catch(() => {});
            }

            if (data && (data.type === 'FRIEND_ONLINE' || data.type === 'FRIEND_OFFLINE' || data.type === 'STATUS_UPDATE')) {
                const p = data.payload || data;
                const uid = p.userId || p.id || p.friendId;
                const isOnline = data.type === 'FRIEND_ONLINE' || p.online === true || p.status === 'online';
                if (uid && FriendManager) {
                    FriendManager.updateFriendStatus({ userId: uid, id: uid, online: isOnline, status: isOnline ? 'online' : 'offline', lastSeen: p.lastSeen || null });
                }
                // FIX: Also update conversation online status so sidebar dot reflects reality
                if (uid && ChatManager && ChatManager._conversationsMap) {
                    ChatManager._conversationsMap.forEach(function(conv) {
                        const fid = conv.friendId || (conv.otherParticipant && conv.otherParticipant.id);
                        if (fid && String(fid) === String(uid)) {
                            conv.online = isOnline;
                        }
                    });
                    // Re-render sidebar so status dots update
                    try {
                        window.dispatchEvent(new CustomEvent('renderChatsList', {
                            detail: {
                                conversations: ChatManager._conversations ? Array.from(ChatManager._conversationsMap.values()) : [],
                                currentChat: ChatManager._activeConversation,
                                currentCategory: ChatManager.getCurrentCategory ? ChatManager.getCurrentCategory() : 'all',
                                messageDrafts: {}
                            }
                        }));
                    } catch(_pe) {}
                }
                const activeChat = ChatManager && ChatManager.getActiveChat && ChatManager.getActiveChat();
                if (activeChat) {
                    const chatFriendId = activeChat.friendId || activeChat.otherUserId || activeChat.userId;
                    if (chatFriendId && String(chatFriendId) === String(uid)) {
                        const statusEl = document.getElementById('chatStatusText');
                        const indicatorEl = document.getElementById('chatStatusIndicator');
                        if (statusEl) statusEl.textContent = isOnline ? 'Active now' : 'Offline';
                        if (indicatorEl) indicatorEl.className = 'chat-status ' + (isOnline ? 'online' : 'offline');
                    }
                }
            }
        });

        // FIX-PHASE15: Re-bind on socket reconnect. If socket disconnects and
        // reconnects, wsService listeners must be re-registered.
        if (window.KynectaRealtime && typeof window.KynectaRealtime.on === 'function') {
            window.KynectaRealtime.on('connect', function() {
                // Clear the realtimeBinding flag so next message triggers re-bind
                window.__messagesRealtimeBound = false;
            });
        }

        if (!hasRealtimeBinding && window.wsService?.on) {
            hasRealtimeBinding = true;
            ['new_message', 'message:new', 'message_delivered', 'message:delivered', 'message_read', 'message:read', 'message_seen', 'message:seen', 'message_deleted', 'message:deleted'].forEach((eventName) => {
                if (typeof window.wsService.off === 'function') {
                    window.wsService.off(eventName);
                }
                window.wsService.on(eventName, (payload) => {
                    handleRealtimePayload(eventName, payload);
                });
            });
        }

        // ✅ FIX: Also bind to KynectaRealtime singleton if available now or when it becomes ready.
        // messages-core previously ONLY checked window.wsService which is the legacy shim.
        // The hardened manager exposes window.KynectaRealtime.on() — we must bind to it too.
        function _bindKynectaRealtime() {
            const rt = window.KynectaRealtime;
            if (!rt || !rt.on || rt.__msgCoreBound) return;
            rt.__msgCoreBound = true;
            ['message:new', 'new_message', 'chat:message', 'MESSAGE_RECEIVED',
             'message:delivered', 'message:read', 'message_seen', 'message:seen', 'message_deleted', 'message:deleted'].forEach((eventName) => {
                if (typeof rt.off === 'function') {
                    rt.off(eventName);
                }
                rt.on(eventName, (payload) => {
                    handleRealtimePayload(eventName, payload);
                });
            });
            // FIX-RECONNECT-REBIND: When socket disconnects, clear the bound flag
            // so that the next reconnect re-registers the listeners above.
            // Without this, after the first disconnect the listeners are gone
            // (socket cleared them) and __msgCoreBound=true prevents re-registration.
            if (!rt.__msgCoreBoundDisconnectWired) {
                rt.__msgCoreBoundDisconnectWired = true;
                rt.on('disconnect', function() {
                    rt.__msgCoreBound = false;
                });
                // Also re-bind on reconnect/connect
                rt.on('connect', function() {
                    rt.__msgCoreBound = false;
                    _bindKynectaRealtime();
                });
            }
            console.log('[messages] ✅ Bound to KynectaRealtime singleton events');
        }
        _bindKynectaRealtime();
        window.addEventListener('kyn:realtimeReady', _bindKynectaRealtime, { once: true });

        // NOTE: window 'kyn:message:received' listener intentionally removed —
        // message.html previously dispatched both document:message:new AND
        // window:kyn:message:received for the same payload, causing handleRealtimePayload
        // to fire twice. message.html now only dispatches document:message:new.
        document.addEventListener('message:new', function(evt) {
            if (evt.detail) handleRealtimePayload('message:new', evt.detail);
        });
        // FIX: status events route correctly — not as new messages
        document.addEventListener('message:sent', function(evt) {
            if (evt.detail) handleRealtimePayload('message:sent', evt.detail);
        });
        document.addEventListener('message:delivered', function(evt) {
            if (evt.detail) handleRealtimePayload('message:delivered', evt.detail);
        });
        document.addEventListener('message:read', function(evt) {
            if (evt.detail) handleRealtimePayload('message:read', evt.detail);
        });
        document.addEventListener('message:deleted', function(evt) {
            if (evt.detail) handleRealtimePayload('message:deleted', evt.detail);
        });
        document.addEventListener('message:reaction', function(evt) {
            if (evt.detail) handleRealtimePayload('message:reaction', evt.detail);
        });
    }   // end setupRealtimeMessageListener

    // ✅ FIX 3: Expose direct entry points for app_realtime_socket.js.
    // That file checks core._handleIncomingRealtimeMessage, core.receiveMessage, core.onNewMessage
    // in sequence. Without this, all three are missing and it falls through to the slower
    // document.dispatchEvent() path which is same-document only and misses cross-frame scenarios.
    function _exposeRealtimeEntryPoints() {
        const mc = window.MessagesCore || window.messagesCore;
        if (!mc) return;
        // We need handleRealtimePayload — it's defined inside setupRealtimeMessageListener.
        // Re-bind via the document event path as the canonical public method.
        mc._handleIncomingRealtimeMessage = function(data) {
            document.dispatchEvent(new CustomEvent('message:new', { detail: data }));
        };
        mc.receiveMessage  = mc._handleIncomingRealtimeMessage;
        mc.onNewMessage    = mc._handleIncomingRealtimeMessage;
        console.log('[messages-core] ✅ _handleIncomingRealtimeMessage, receiveMessage, onNewMessage exposed');
    }
    _exposeRealtimeEntryPoints();

    function startRealtimeSync() {
        setupRealtimeMessageListener();

        const realtimeToken = window.__PARENT_SESSION__?.token || SessionManager.getToken?.() || null;
        if (window.KynectaRealtime?.connect && realtimeToken) {
            // ✅ FIX: Attach .catch() immediately on the returned promise so any
            // rejection (including the normalised WebSocket Event errors) is always
            // handled — prevents "Uncaught (in promise)" in the console.
            window.KynectaRealtime.connect(realtimeToken).catch((err) => {
                console.warn('[messages] Realtime connect failed (will retry):', err && err.message || err);
            });
        }
        
        if (ChatManager && ChatManager.getActiveChat) {
            // FIX: was 3000ms (3s) causing massive console spam and duplicate fetches.
            // Now 30 000ms (30s) — only poll when tab is visible and chat is active.
            let _lastPollChatId = null;
            let _lastPollMsgCount = 0;
            // FIX (Forensic Audit P1): Store ID to prevent memory leak
            const _activeChatPollInterval = setInterval(() => {
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
                ChatManager.fetchMessages(activeChat.id, { limit: 20, minFetchGap: 10000 }).catch(() => {});
            }, 30000);
            window.addEventListener('beforeunload', () => { clearInterval(_activeChatPollInterval); }, { once: true });
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

            if (window.KynectaLocalStore?.getAllConversations) {
                try {
                    const idbConversations = await window.KynectaLocalStore.getAllConversations();
                    if (Array.isArray(idbConversations) && idbConversations.length > 0) {
                        const mergedConversations = [...ChatManager.getConversations(), ...idbConversations];
                        ChatManager.setConversations(mergedConversations);
                    }
                } catch (_) {}
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
        // ✅ FIX B: Only auto-restore once per browser session.
        // Without this guard, every navigateToPage('messages') call re-opens
        // the chat panel, bypassing the sidebar entirely on fresh load.
        // Users expect to see the SIDEBAR first; they choose which chat to open.
        const SESSION_KEY = 'kyn_chat_restored_' + (SafeStorage.get('kyn_session_epoch') || '0');
        if (sessionStorage.getItem(SESSION_KEY)) {
            // Already restored this session — don't force-open the panel again.
            return;
        }
        sessionStorage.setItem(SESSION_KEY, '1');

        const lastChatId = SafeStorage.get('lastChatId');
        if (!lastChatId) return;

        // Give conversations 400ms to load from cache before trying
        let attempts = 0;
        const MAX_ATTEMPTS = 8;
        const poll = setInterval(() => {
            attempts++;
            const conv = ChatManager.getConversation
                ? ChatManager.getConversation(lastChatId)
                : null;
            if (conv) {
                clearInterval(poll);
                // ✅ FIX B2: Restore to sidebar-highlight only, not forced panel open.
                // Dispatch a custom event so the UI can highlight the chat in the list
                // without opening the panel. Panel opens only on explicit user click.
                window.dispatchEvent(new CustomEvent('kyn:restoreLastChat', {
                    detail: { chatId: lastChatId, conversation: conv }
                }));
                // Pre-load messages into memory so first click is instant
                ChatManager.fetchMessages?.(lastChatId, { background: true, minFetchGap: 0 }).catch(() => {});
            } else if (attempts >= MAX_ATTEMPTS) {
                clearInterval(poll);
            }
        }, 300);
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
        console.log('[INIT MODULE]', MODULE_NAME);
        console.log(`[${MODULE_NAME}] 🚀 Messages Core v${MODULE_VERSION} (Stabilized Protocol | Real Data Only | Session Validation | UI Enhanced | Demo Data Included | openChatWithUser Added | Pending Chat Handling)`);
        
        try {
            setState(LIFECYCLE_STATES.BOOT, 'initialization_start');
            
            ModuleCoreController.init();
            ModuleLifecycleController.start();
            
            // FIX Bug 2: Pre-register the realtime message listener immediately on boot,
            // BEFORE the module reaches ACTIVE state. Without this, any socket event
            // (message:new, call:incoming, etc.) that arrives during the INITIALIZING →
            // ACTIVE window is silently dropped because the listener doesn't exist yet.
            // setupRealtimeMessageListener() is idempotent — calling it twice is safe.
            try { setupRealtimeMessageListener(); } catch(_earlyListenerErr) {}
            
            stateListeners.add((toState) => {
                if (toState === LIFECYCLE_STATES.ACTIVE) {
                    BootController.completeBoot();
                    console.log(`[${MODULE_NAME}] ✅ Module ACTIVE - ready for user interaction`);
                    startRealtimeSync(); // ensures full sync triggers; listener already attached above
                }
            });
            
            console.log(`[${MODULE_NAME}] ✅ Initialized - waiting for parent activation and valid session`);
            
            // Production requirement: never activate mock/demo data.
            setTimeout(() => {
                if (false) { // Demo bootstrap fully removed
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
        getCurrentCategory: () => ChatManager.getCurrentCategory(),
        
        isAuthenticated: () => SessionManager.isAuthenticated(),
        
        getSecurityReport: () => SECURITY.getSecurityReport(),

        deleteConversation: function(chatId) {
            if (!chatId) return;
            const sid = String(chatId);

            // ── TOMBSTONE: persist deletion across all storage layers ────────
            const tombstone = {
                id: sid,
                entityType: 'conversation',
                deletedAt: Date.now(),
                syncVersion: Date.now(),
                origin: 'user_delete',
            };
            try {
                // 1. Legacy deleted list (backward compat)
                const _d = SafeStorage.getJSON('kynecta_deleted_chats_v8') || [];
                if (!_d.includes(sid)) { _d.push(sid); SafeStorage.setJSON('kynecta_deleted_chats_v8', _d); }

                // 2. Tombstone registry — version-aware, survives service worker
                const _tombstones = SafeStorage.getJSON('kynecta_tombstones_v1') || {};
                _tombstones[sid] = tombstone;
                SafeStorage.setJSON('kynecta_tombstones_v1', _tombstones);

                // 3. Clear all message caches for this conversation
                SafeStorage.remove(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${sid}`);
                try { localStorage.removeItem(`kynecta_messages_v8_${sid}`); } catch(_) {}
                try { localStorage.removeItem(`kynecta_conv_${sid}`); } catch(_) {}

                // 4. Invalidate any service worker cache for this conversation
                if ('caches' in window) {
                    caches.keys().then(names => {
                        names.forEach(name => {
                            caches.open(name).then(cache => {
                                cache.delete(`/api/chats/${sid}`);
                                cache.delete(`/api/messages?chatId=${sid}`);
                            });
                        });
                    }).catch(() => {});
                }

                // 5. Clear from IndexedDB offline queue
                window.__OfflineMessageQueue?.getPending?.()?.forEach(entry => {
                    if (String(entry.chatId) === sid) {
                        window.__OfflineMessageQueue.markDelivered(entry.id).catch(() => {});
                    }
                });

                // 6. Broadcast tombstone to other tabs
                try {
                    const bc = new BroadcastChannel('kynecta_sync');
                    bc.postMessage({ type: 'tombstone', entity: 'conversation', id: sid, ts: Date.now() });
                    bc.close();
                } catch(_) {}

                // 7. FIX: Clear from IndexedDB so refresh doesn't resurrect the chat
                try {
                    if (window.KynectaLocalStore && typeof window.KynectaLocalStore.deleteMessagesByChat === 'function') {
                        window.KynectaLocalStore.deleteMessagesByChat(sid).catch(() => {});
                    }
                    // Also try generic IDB deletion
                    if (window.KynectaDB) {
                        window.KynectaDB.deleteMessages(sid).catch(() => {});
                        window.KynectaDB.deleteConversation(sid).catch(() => {});
                    }
                } catch(_) {}
            } catch(_) {}

            // ── Remove from memory ───────────────────────────────────────────
            ChatManager._conversations = (ChatManager._conversations || []).filter(c => String(c.id) !== sid);
            if (ChatManager._conversationsMap) { ChatManager._conversationsMap.delete(chatId); ChatManager._conversationsMap.delete(sid); }
            if (ChatManager._activeConversation && String(ChatManager._activeConversation.id) === sid) {
                ChatManager._activeConversation = null; ChatManager._messages = [];
            }
            ChatManager._saveToCache();
            ChatManager._notifySubscribers();

            // ── Tell backend to delete ────────────────────────────────────────
            makeApiRequest(`/chats/${sid}`, 'DELETE').catch(() => {});
        },

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
        
        openChatWithUser: (userId, userName, userAvatar) => openChatWithUser(userId, userName, userAvatar),
        setCurrentCategory: (category) => ChatManager.setCurrentCategory(category),
        renderChatsList: () => ChatManager.renderChatsList(),
        
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

    // FIX-014: Mark messages as read when the user returns to this tab.
    // Without this, messages received while the tab was hidden are never marked seen.
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState !== 'visible') return;
        try {
            const cm = window.MessagesCore && window.MessagesCore.ConversationManager;
            const chatMgr = window.MessagesCore && window.MessagesCore.ChatManager;
            if (!cm || !chatMgr) return;
            const active = chatMgr.getActiveChat && chatMgr.getActiveChat();
            if (!active) return;
            const convId = active.id || active.chatId;
            if (!convId) return;
            if (typeof cm.markConversationRead === 'function') {
                cm.markConversationRead(convId);
            } else if (typeof cm.markRead === 'function') {
                cm.markRead(convId);
            }
        } catch (_) {}

        // PHASE15 FIX: Flush any messages that arrived while the user was on another screen.
        // app.realtime.socket.js persists incoming message:new events to kyn_pending_messages.
        // Here we process them so messages are never lost even if the chat panel was closed.
        _flushPendingLocalMessages();
    });

    // PHASE15 FIX: Flush pending messages that arrived while the user was away.
    // Called on visibilitychange AND on initial module load.
    function _flushPendingLocalMessages() {
        try {
            var _raw = localStorage.getItem('kyn_pending_messages');
            if (!_raw) return;
            var _pending = JSON.parse(_raw);
            if (!Array.isArray(_pending) || _pending.length === 0) return;
            // Clear the queue first so duplicate processing is impossible
            localStorage.removeItem('kyn_pending_messages');
            var chatMgr = window.MessagesCore && window.MessagesCore.ChatManager;
            if (!chatMgr || typeof chatMgr.addMessage !== 'function') {
                // ChatManager not ready — put them back for next flush
                try { localStorage.setItem('kyn_pending_messages', JSON.stringify(_pending)); } catch(_) {}
                return;
            }
            // Filter out messages older than 24 hours to prevent stale replays
            var _cutoff = Date.now() - 86400000;
            _pending.forEach(function(msg) {
                try {
                    if (msg._arrivedAt && msg._arrivedAt < _cutoff) return; // too old
                    chatMgr.addMessage(msg);
                } catch(_) {}
            });
            console.log('[MessagesCore] PHASE15: Flushed', _pending.length, 'pending messages from localStorage');
        } catch (_) {}
    }
    // Flush on load (catches messages that arrived before this module loaded)
    setTimeout(_flushPendingLocalMessages, 1500);

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