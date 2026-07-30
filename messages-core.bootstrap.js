// =============================================
// MESSAGES CORE :: BOOTSTRAP & CORE STATE
// One of 3 companion files (messages-core.bootstrap.js,
// messages-core.operations.js, messages-core.ui-bridge.js) that
// together replace the old single messages-core.js module.
// Loaded as plain classic scripts (defer, no type=module) IN ORDER
// so they share one global lexical scope, exactly like the original
// single IIFE did internally. Do not load out of order, and do not
// load this file without the other two.
// =============================================
'use strict';

// PART 1/3 — BOOTSTRAP & CORE STATE (real standalone script, not a text fragment)
'use strict';

'use strict';

    // =============================================
    // MODULE IDENTIFICATION
    // =============================================
    const MODULE_NAME = 'messages';
    const MODULE_VERSION = '8.0.7';
    
    // =============================================
    // DEBUG MODE
    // FIX (SILENT-CONSOLE): this was hardcoded `false`, which meant every
    // 📤/📥 send/receive log in this file AND messages-core.operations.js
    // (39 call sites) was permanently silenced — a working pipeline and a
    // broken one produced identical (zero) console output, so delivery
    // failures were undiagnosable from the browser console.
    // Now defaults ON, and can be toggled at runtime without a code edit:
    //   localStorage.setItem('kyn_debug_messages', '0')  -> silence
    //   localStorage.setItem('kyn_debug_messages', '1')  -> verbose (default)
    // =============================================
    let DEBUG = true;
    try {
        const _dbgOverride = window.localStorage && window.localStorage.getItem('kyn_debug_messages');
        if (_dbgOverride === '0' || _dbgOverride === 'false') DEBUG = false;
    } catch (_) { /* localStorage unavailable (privacy mode etc.) — keep default */ }
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
                    debugLog(`[${moduleName}][LifecycleGuard] CHILD_READY already sent, skipping duplicate`);
                    return false;
                }
                
                if (!window.__lifecycleCanSendChildReady(currentState)) {
                    console.warn(`[${moduleName}][LifecycleGuard] Cannot send CHILD_READY in state: ${currentState}`);
                    return false;
                }
                
                debugLog(`[${moduleName}][Lifecycle] Sending CHILD_READY (state: ${currentState})`);
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

    // FIX Bug 6 (FIX-AUDIT hardened): On visibility-restore, instead of wiping the
    // entire dedup set (which let an already-rendered message be duplicated if
    // redelivered after reconnect), reseed the set from message IDs currently
    // present in the DOM. Anything already on screen stays protected; anything
    // that arrived while hidden and was never rendered passes through normally.
    (function _installVisibilityResetForDedup() {
        const _reseedFromDom = () => {
            try {
                const container = document.getElementById('messagesContainer');
                if (!container) { processedMessageIds.clear(); return; }
                const renderedIds = Array.from(container.querySelectorAll('[data-message-id]'))
                    .map(el => el.getAttribute('data-message-id'))
                    .filter(Boolean);
                processedMessageIds.clear();
                renderedIds.forEach(id => processedMessageIds.add(id));
            } catch (_) {
                // If DOM isn't available for any reason, fall back to the old
                // behavior rather than throwing.
                processedMessageIds.clear();
            }
        };
        const _clearOnVisible = () => {
            if (document.visibilityState === 'visible') {
                // Only clear if we've been hidden for more than 2 seconds to avoid
                // clearing during brief focus losses (e.g. clicking a link)
                if (window._kynLastHiddenAt && Date.now() - window._kynLastHiddenAt > 2000) {
                    _reseedFromDom();
                }
            } else {
                window._kynLastHiddenAt = Date.now();
            }
        };
        document.addEventListener('visibilitychange', _clearOnVisible);
        // Also clear on postMessage PAGE_FOCUS (parent fires this when switching back to messages tab)
        window.addEventListener('message', (evt) => {
            if (evt.data && (evt.data.type === 'PAGE_FOCUS' || evt.data.type === 'MODULE_FOCUSED')) {
                _reseedFromDom();
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

        debugLog(`[${MODULE_NAME}] State: ${fromState} → ${nextState}${reason ? ` (${reason})` : ''}`);

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
            'https://nexora-3bla.onrender.com',
            'https://nexopa.onrender.com',
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
                debugLog(`[${MODULE_NAME}] ⚠️ Write allowed despite non-ACTIVE state — valid session present`);
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
    type: 'API_REQUEST',
    // FIX: this field was previously omitted, so handleApiResponse()'s
    // `if (pending.timeout) clearTimeout(pending.timeout)` was always a
    // no-op — the 45s timeout timer below kept running even after a normal,
    // on-time response had already resolved this request. Harmless in
    // isolation (the stale timer just no-ops against an already-deleted
    // requestId), but it's dead weight and masks the intent of that
    // clearTimeout call. Store the real handle so it's actually cleared.
    timeout: timeoutId
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
        
        debugLog(`[${MODULE_NAME}] 📥 API_RESPONSE received: ${requestId}`);
        
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
            debugLog(`[${MODULE_NAME}] Cannot flush queue - not ACTIVE (${currentState})`);
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

        // FIX (duplicate chat-history entries): the chatId lookup above only
        // catches a conversation already keyed under this exact chatId. If the
        // REST-loaded conversation for this same friend was keyed under a
        // different id (conversation id vs chat-room id — the two aren't
        // always the same value from this backend), we'd otherwise create a
        // second row for a friend who already has one. Search by friendId too
        // before creating anything new, and just re-key + update that row.
        const byFriend = (ChatManager._conversations || []).find(c => c && String(c.friendId) === friendId && !c.isPending);
        if (byFriend) {
            byFriend.id = String(chatId);
            byFriend.chatId = String(chatId);
            byFriend.lastMessage = normalizedMessage.content || byFriend.lastMessage || '';
            byFriend.lastMessageAt = normalizedMessage.createdAt || normalizedMessage.timestamp || Date.now();
            ChatManager._conversationsMap.set(String(chatId), byFriend);
            return byFriend;
        }

        // ROOT-CAUSE FIX (messages never appear unless BOTH sides opened the
        // chat from Chat History): the search above deliberately excluded
        // `isPending` rows, so when the RECEIVER had opened this chat from
        // Friend/Calls/Group/Status (which always creates a local
        // `pending_<friendId>` placeholder — see openChatWithUserInUI /
        // getOrCreatePendingConversation) and the sender's first message
        // arrives, this function never found that pending row and fell
        // through to creating a brand-new SECOND conversation object at the
        // real chatId. The receiver's screen was still pointed at (and
        // "active" on) the old pending_<friendId> object, which nothing ever
        // updates — so the incoming message got stored under the real chatId
        // while the visible panel kept comparing against the stale pending
        // id, and any reply the receiver typed afterwards went out on that
        // same dead pending id again. Only Chat History ever avoided this,
        // because opening from there loads/knows the real chatId up front
        // and never creates a pending row to begin with.
        // Fix: treat a matching PENDING row the same as a real one — reuse
        // the existing replacePendingConversation() path (already handles
        // re-keying _conversationsMap, active-conversation swap, and
        // re-stamping cached messages) instead of silently duplicating it.
        const byPendingFriend = (ChatManager._conversations || [])
            .find(c => c && c.isPending && String(c.friendId ?? c.pendingReceiverId) === friendId);
        if (byPendingFriend && typeof ChatManager.replacePendingConversation === 'function') {
            const friendRecordForPending = FriendManager && FriendManager.getFriend
                ? (FriendManager.getFriend(friendId) || FriendManager.getFriend(Number(friendId)))
                : null;
            const replaced = ChatManager.replacePendingConversation(byPendingFriend.id, {
                id: String(chatId),
                chatId: String(chatId),
                type: 'direct',
                friendId,
                participantIds: [myId, friendId].filter(Boolean),
                friendName: byPendingFriend.friendName || friendRecordForPending?.displayName || friendRecordForPending?.username || `User_${friendId}`,
                friendAvatar: byPendingFriend.friendAvatar || friendRecordForPending?.avatar || friendRecordForPending?.photoURL || '',
                lastMessage: normalizedMessage.content || '',
                lastMessageAt: normalizedMessage.createdAt || normalizedMessage.timestamp || Date.now(),
                unreadCount: senderId && senderId !== myId ? (byPendingFriend.unreadCount || 0) + 1 : (byPendingFriend.unreadCount || 0),
                online: !!(friendRecordForPending?.online || friendRecordForPending?.status === 'online'),
                isPending: false
            });
            if (replaced) return replaced;
        }

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

        // BUG-009 FIX: _notifySubscribers() was missing — the sidebar never re-rendered
        // when a new conversation was created by an incoming message:new from an unknown chatId.
        // The conversation was in the data store but invisible until a manual refresh.
        try { ChatManager._notifySubscribers(); } catch (_) {}

        // BUG-007b FIX: The conversation entry above is built optimistically from the
        // incoming message payload — it may be missing the correct chat name, avatar, or
        // participant data (especially when the sender is not in the receiver's friends list).
        // Trigger an async background fetch to replace the placeholder with authoritative
        // server-side data. Debounced (200ms) so multiple rapid inbound messages on the
        // same new chat don't trigger N parallel fetches.
        if (!ChatManager._upsertFetchDebounce) {
            ChatManager._upsertFetchDebounce = setTimeout(() => {
                ChatManager._upsertFetchDebounce = null;
                ChatManager.fetchConversations().catch(() => {});
            }, 200);
        }

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
                    debugLog('[LOCAL SAVE]', key, value);
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
                debugLog(`[${MODULE_NAME}] ${message}`, data || '');
            } else if (level === 'warn') {
                console.warn(`[${MODULE_NAME}] ⚠️ ${message}`, data || '');
            } else if (level === 'error') {
                console.error(`[${MODULE_NAME}] ❌ ${message}`, data || '');
            } else if (level === 'success') {
                debugLog(`[${MODULE_NAME}] ✅ ${message}`, data || '');
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
            // ✅ FIX: Check storage availability IMMEDIATELY (synchronously) so that
            // any set() calls made before the async init resolves still persist to
            // localStorage. Previously storageAvailable stayed false until the Promise
            // resolved, meaning early writes went only to memoryStore and were lost
            // when the user navigated away.
            this._checkStorage();
            this._initialized = true;
            this._initPromise = Promise.resolve(this);
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
            // FIX (MSG-DROPPED-VALID-SOURCE): this whitelist was missing several
            // source tags that legitimate first-party code already sends into this
            // iframe — 'background-sync' (service-worker.js's offline-queue-flush /
            // status-sync broadcasts), 'realtime-socket' (app.realtime.socket.js's
            // settings_updated / profile-identity relay, fanned out directly to
            // every iframe including this one), and 'message-iframe' /
            // 'parent-socket-relay' (this module's own echo + settings propagation
            // paths). Every one of those was being silently rejected here as
            // invalid_source, which both spammed the console and meant real
            // updates (delivery flushes, sender display-name/avatar changes,
            // settings changes) never reached the messages module.
            // FIX-ROOT-CAUSE-MISSING-RECEIVERID-2: 'marketplace-bridge' was still
            // missing — it's the source chat.html uses for OPEN_CHAT_WITH_USER
            // when a chat is opened from the marketplace/tools flow
            // (chat.html:6823), which seeds this iframe's local ChatManager with
            // the new conversation's pendingReceiverId. Being dropped here meant
            // the conversation showed up with no receiverId, so the next
            // sendMessage() threw "Invalid pending conversation: missing
            // receiverId" and nothing was ever sent to the network. Also adding
            // the other real source strings found in chat.html targeting this
            // iframe that were likewise missing: 'kyn-global-bridge',
            // 'parent-mp-bridge', 'parent-shell', 'stale-echo-retry'.
            const ALLOWED_SOURCES = new Set(['parent', 'ws-bridge', 'banner-bridge', 'parent-echo', 'parent-ws-broadcast', 'parent-accept-broadcast', 'parent-end-broadcast', 'parent-frame', 'parent-reject-broadcast', 'background-sync', 'realtime-socket', 'message-iframe', 'parent-socket-relay', 'parent-chat-hdr', 'marketplace-bridge', 'kyn-global-bridge', 'parent-mp-bridge', 'parent-shell', 'stale-echo-retry', 'friend-core', 'AppSettings']);
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
            
            debugLog('[SessionManager] Setting valid session', { userId: sessionData.userId });
            
            if (_demoModeEnabled) {
                debugLog('[SessionManager] Real session received - disabling demo mode');
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
                debugLog('[SessionManager] Valid session received, transitioning to ACTIVE');
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
                debugLog(`[SessionManager] Session set in state ${currentState} — fast-promoting to ACTIVE`);
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
                // FIX (CONSOLE-SPAM / EXTENSION-NOISE): browser extensions (MetaMask's
                // ObjectMultiplex etc.) inject their own window.postMessage traffic into
                // EVERY frame on the page, including this iframe. Those messages share
                // this page's origin (so SECURITY.validateOrigin below always let them
                // through) but have no app-shaped {type,...} envelope, so every single
                // one was falling through to SecurityValidator and getting logged as
                // "Rejected message: invalid_structure" / "invalid_source" — the exact
                // spam flooding the console on every page load. The one thing genuine
                // app traffic always has that extension traffic never does is a known
                // sender window: every real message to this iframe is posted either by
                // window.parent (chat.html directly, or chat.html relaying another
                // module's event) or by this frame echoing to itself. Gating on
                // event.source here silently drops the extension noise before it ever
                // reaches validation, without touching any legitimate app message path.
                if (event.source !== window.parent && event.source !== window) {
                    return;
                }
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
        // FORENSIC: previously only logged validation.reason (e.g. "invalid_source")
        // with no indication of WHICH source/type/target actually got rejected —
        // impossible to tell, from the console alone, which of the many postMessage
        // senders in this app is hitting the whitelist gap. Always visible
        // (console.log, not gated behind DEBUG) so a live test shows it immediately.
        console.log(`[${MODULE_NAME}] Rejected message: ${validation.reason} | source=${event.data && event.data.source} | type=${event.data && event.data.type} | target=${event.data && event.data.target}`);
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
                debugLog(`[${MODULE_NAME}] FRIENDS_LIST_UPDATE: ${friends.length} friends received`);
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
                debugLog(`[${MODULE_NAME}] Duplicate PARENT_READY ignored`);
                return;
            }
            
            if (data.module && data.module !== MODULE_NAME) {
                console.warn(`[${MODULE_NAME}] Invalid PARENT_READY - module mismatch (expected: ${MODULE_NAME}, got: ${data.module})`);
                return;
            }
            
            debugLog(`[${MODULE_NAME}] PARENT_READY received (state: ${currentState})`);
            
            parentReadyReceived = true;
            parentReadyData = data.payload || data;
            
            if (parentReadyResolver) {
                parentReadyResolver();
                parentReadyResolver = null;
            }
            
            const providedSession = parentReadyData.session || parentReadyData;
            if (providedSession && providedSession.token && providedSession.userId) {
                debugLog(`[${MODULE_NAME}] Session provided in PARENT_READY, userId: ${providedSession.userId}`);
                SessionManager.setSession(providedSession);
            } else {
                debugLog(`[${MODULE_NAME}] No session in PARENT_READY payload, will wait for SESSION_DATA`);
                // FIX: Never inject fake demo tokens. Load cached data for offline-first display instead.
                if (window.KynectaLocalStore) {
                    window.KynectaLocalStore.getAllConversations().then(convs => {
                        if (convs && convs.length > 0) {
                            debugLog(`[${MODULE_NAME}] Offline-first: rendering ${convs.length} cached conversations`);
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
                    debugLog(`[${MODULE_NAME}] ✅ ACTIVE (parent ready + valid session)`);
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
                    debugLog(`[${MODULE_NAME}] ⏳ WAITING_AUTH (no valid session yet) — requesting session`);
                    safeSend(OUTGOING_ACTIONS.REQUEST_SESSION, {
                        module: MODULE_NAME,
                        timestamp: Date.now()
                    }, { requireAck: false });
                    initializeUISafe();
                }
            } else if (currentState === LIFECYCLE_STATES.ACTIVE) {
                // Already ACTIVE — just refresh data
                debugLog(`[${MODULE_NAME}] PARENT_READY received while already ACTIVE — refreshing data`);
                if (SessionManager.isAuthenticated()) {
                    flushMessageQueue();
                    startDataFlow();
                }
            } else {
                debugLog(`[${MODULE_NAME}] PARENT_READY received in unexpected state: ${currentState}`);
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
                    debugLog(`[${MODULE_NAME}] SESSION_DATA arrived early (state: ${currentState}) — promoting to ACTIVE`);
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
            
            // FIX (Notifications audit): this used to fire unconditionally.
            // window.__messageNotificationsEnabled already gets kept current by
            // this file's own settings listener (folding in the master
            // "enableNotifications" toggle too) — it was just never read.
            if (UIFeatures && window.__messageNotificationsEnabled !== false) {
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
                debugLog(`[${MODULE_NAME}] CHILD_READY already sent, skipping duplicate`);
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
                debugLog(`[${MODULE_NAME}] CHILD_READY sent`);
                debugLog(`[${MODULE_NAME}] WAIT_PARENT`);
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
            // FIX: this used to run parseInt() on every ID for validation and
            // reject the result if it came out NaN — which rejects EVERY
            // UUID-based user ID (this app's actual ID format), not just
            // malformed ones, blocking login entirely. Only apply the
            // numeric-parse check when the ID is purely numeric; a non-empty
            // string that isn't purely numeric (a UUID) is valid as-is.
            const _rawSessionUserId = typeof userId === 'string' ? userId.trim() : userId;
            const _isPurelyNumericId = typeof _rawSessionUserId === 'string' && /^-?\d+$/.test(_rawSessionUserId);
            const _sessionIdIsInvalidNumber = (typeof _rawSessionUserId === 'number' || _isPurelyNumericId) &&
                (isNaN(parseInt(_rawSessionUserId, 10)) || parseInt(_rawSessionUserId, 10) === 0);
            if (!userId || (typeof userId !== 'string' && typeof userId !== 'number') || _sessionIdIsInvalidNumber) {
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

    // =========================================================================
    // MESSAGE LIFECYCLE REBUILD (messages-only scope, added 2026-07-26)
    // -------------------------------------------------------------------------
    // Purely additive. Initializes the new reliable send/receive pipeline
    // (js/core/message/MessageLifecycleClient.js) alongside everything else
    // already running in this file — it does not replace or disable any
    // existing render/relay logic. See that file's header comment for the
    // full rationale and the two concrete gaps it closes.
    // =========================================================================
    (function initMessageLifecycleClient(attempt) {
        attempt = attempt || 0;
        if (!window.MessageLifecycleClient) {
            if (attempt < 50) setTimeout(() => initMessageLifecycleClient(attempt + 1), 200);
            return;
        }
        const uid = getCurrentUserId();
        if (!uid) {
            if (attempt < 50) setTimeout(() => initMessageLifecycleClient(attempt + 1), 200);
            return;
        }
        window.MessageLifecycleClient.init({ currentUserId: uid });
    })();