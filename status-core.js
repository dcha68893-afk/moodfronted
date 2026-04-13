// =============================================
// STATUS SYSTEM - PASSIVE IFRAME MODULE
// DETERMINISTIC MICRO-FRONTEND VERSION v10.0
// PARENT-AUTHORITY ARCHITECTURE - STRICT LIFECYCLE
// PROTOCOL-COMPLIANT - ALL EXISTING FEATURES PRESERVED
// LIFECYCLE SYSTEM: DETERMINISTIC STATE MACHINE (HANDSHAKE V3)
// SANDBOX-SAFE STORAGE PROXY INTEGRATED
// REAL END-TO-END STATUS SYSTEM - NO FALLBACKS
// =============================================

(function() {
    'use strict';

// =============================================
// SESSION VALIDATION UTILITY - CRITICAL PATCH
// =============================================
function __isValidSession(session) {
    if (!session || typeof session !== 'object') return false;

    // Must have a token that is a non-empty string
    if (!session.token || typeof session.token !== 'string' || session.token.length === 0) {
        // In guest mode or cached mode, allow missing token temporarily
        if (session.guestMode === true || session.isGuest === true) {
            return true;
        }
        return false;
    }

    // Check userId - accept various formats
    let userId = session.userId;
    if (!userId && session.user) {
        userId = session.user.id || session.user.userId;
    }
    
    // If no userId at all, might be valid if we have token
    if (!userId && session.token) {
        return true; // Token-only session is valid
    }
    
    // If userId exists but is placeholder, reject
    if (userId === 'user' || userId === 'default' || userId === 0 || userId === '0') {
        return false;
    }

    return true;
}

// Store last valid session ID for deduplication
let _lastValidSessionId = null;
let _lastValidSessionHash = null;
let _backgroundInitStarted = false;
let _backgroundInitWithSessionStarted = false;

function __getSessionHash(session) {
    if (!session) return null;
    const tokenPart = session.token ? session.token.substring(0, 16) : 'null';
    const userIdPart = session.userId || session.user?.id || session.user?.userId || 'null';
    return `${tokenPart}:${userIdPart}`;
}

function __isDuplicateSession(session) {
    if (!session) return true;
    
    // Check by explicit sessionId if available
    if (session.sessionId && _lastValidSessionId === session.sessionId) {
        return true;
    }
    
    // Otherwise use hash
    const hash = __getSessionHash(session);
    if (hash && _lastValidSessionHash === hash) {
        return true;
    }
    
    return false;
}

function __storeValidSessionId(session) {
    if (session.sessionId) {
        _lastValidSessionId = session.sessionId;
    }
    _lastValidSessionHash = __getSessionHash(session);
}

// =============================================
// CLEAN CONSOLE LOGGING - SINGLE INSTANCE, NO SPAM
// =============================================
const DEBUG = false;
const MODULE_NAME = "status"; // EXACT MATCH - DO NOT CHANGE
const MODULE_VERSION = "10.0.0";

// Track which messages have been logged - prevents duplicates
const _loggedMessages = new Set();
const _loggedStatuses = new Set();

function logStatus(type, message, data = null) {
    // Create a unique key for this message
    const key = `${type}:${message}`;
    
    // If we've already logged this exact status, don't log again
    if (_loggedStatuses.has(key)) {
        return;
    }
    
    // Mark as logged
    _loggedStatuses.add(key);
    
    const now = Date.now();
    const emoji = {
        'INIT': '🚀',
        'SENDING': '📤',
        'WAITING': '⏳',
        'SUCCESS': '✅',
        'FAILED': '❌',
        'READY': '🔵',
        'WARNING': '⚠️',
        'DISCONNECTED': '🔴',
        'VIEW': '👁️',
        'REACTION': '👍',
        'POST': '📝',
        'EXPIRE': '⌛',
        'LIFECYCLE': '⚡'
    }[type] || '📋';
    
    console.log(`%c[${MODULE_NAME}] ${emoji} ${type}: ${message}`, 
        type === 'FAILED' || type === 'DISCONNECTED' ? 'color: #ff3b30; font-weight: bold;' :
        type === 'SUCCESS' || type === 'READY' ? 'color: #34c759; font-weight: bold;' :
        type === 'WARNING' ? 'color: #ff9500; font-weight: bold;' :
        type === 'SENDING' || type === 'WAITING' ? 'color: #0084ff; font-weight: bold;' :
        type === 'VIEW' ? 'color: #5856d6; font-weight: bold;' :
        type === 'REACTION' ? 'color: #ff2d55; font-weight: bold;' :
        type === 'POST' ? 'color: #64d2ff; font-weight: bold;' :
        type === 'LIFECYCLE' ? 'color: #aa00ff; font-weight: bold;' :
        'color: #5856d6; font-weight: bold;'
    );
    
    if (data && Object.keys(data).length > 0) {
        console.log('  📦', data);
    }
}

// Debug functions - each logs only once
const _debugLogs = new Set();
function debugLog(...args) {
    if (!DEBUG) return;
    
    const key = args.join('|');
    if (_debugLogs.has(key)) return;
    _debugLogs.add(key);
    
    console.log(`[${MODULE_NAME}]`, ...args);
}

const _debugErrors = new Set();
function debugError(...args) {
    if (!DEBUG) return;
    
    const key = args.join('|');
    if (_debugErrors.has(key)) return;
    _debugErrors.add(key);
    
    console.error(`[${MODULE_NAME} ERROR]`, ...args);
}

const _debugWarns = new Set();
function debugWarn(...args) {
    if (!DEBUG) return;
    
    const key = args.join('|');
    if (_debugWarns.has(key)) return;
    _debugWarns.add(key);
    
    console.warn(`[${MODULE_NAME} WARN]`, ...args);
}

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
// LIFECYCLE TRANSITION VALIDATION
// =============================================
const validTransitions = {
    [LIFECYCLE_STATES.BOOT]: [LIFECYCLE_STATES.INITIALIZING],
    [LIFECYCLE_STATES.INITIALIZING]: [LIFECYCLE_STATES.READY],
    [LIFECYCLE_STATES.READY]: [LIFECYCLE_STATES.WAIT_PARENT],
    [LIFECYCLE_STATES.WAIT_PARENT]: [LIFECYCLE_STATES.ACTIVE],
    [LIFECYCLE_STATES.ACTIVE]: []
};

function setState(nextState, reason = '') {
    if (currentState === nextState) return true;

    const allowed = validTransitions[currentState] || [];
    if (!allowed.includes(nextState)) {
        debugWarn(`Invalid transition: ${currentState} → ${nextState}`);
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
    
    window.dispatchEvent(new CustomEvent('statusLifecycleChange', {
        detail: { state: toState, previous: fromState, reason }
    }));
}

// =============================================
// LIFECYCLE GUARDS - CRITICAL
// =============================================
function ensureActive(actionName) {
    // Check BOTH state machines
    const isLegacyActive = (currentState === LIFECYCLE_STATES.ACTIVE);
    const isNewActive = (typeof _currentState !== 'undefined' && _currentState === LifecycleState.ACTIVE);
    
    if (!isLegacyActive && !isNewActive) {
        console.warn(`[${MODULE_NAME}] ❌ Blocked action '${actionName}' - not ACTIVE (legacy: ${currentState}, new: ${typeof _currentState !== 'undefined' ? _currentState : 'undefined'})`);
        if (typeof DiagnosticsAgent !== 'undefined') DiagnosticsAgent.increment('blockedActions');
        return false;
    }
    return true;
}

function canSendUserMessages() {
    return currentState === LIFECYCLE_STATES.ACTIVE;
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

function resetLifecycle() {
    currentState = LIFECYCLE_STATES.BOOT;
    childReadySent = false;
    parentReadyReceived = false;
    parentReadyData = null;
    stateHistory = [];
    processedMessageIds.clear();
    sentMessageIds.clear();
    
    parentReadyPromise = new Promise((resolve) => {
        parentReadyResolver = resolve;
    });
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

function genId() {
    return "msg_" + Math.random().toString(36).slice(2) + Date.now();
}

function genReqId() {
    return "req_" + Math.random().toString(36).slice(2) + Date.now();
}

// =============================================
// API REQUEST HANDLER (NO DIRECT FETCH - PARENT ROUTED)
// =============================================
const pendingRequests = new Map(); // requestId -> { resolve, reject, timeout, timestamp, type }
const TIMING = {
    REQUEST_TIMEOUT: 30000,
    CLEANUP_INTERVAL: 60000
};

function cleanupPendingRequests() {
    const now = Date.now();
    for (const [requestId, pending] of pendingRequests.entries()) {
        if (now - pending.timestamp > TIMING.REQUEST_TIMEOUT) {
            console.warn(`[${MODULE_NAME}] Request timeout: ${requestId} (${pending.type})`);
            if (pending.reject) {
                pending.reject(new Error(`Request timeout: ${pending.type}`));
            }
            pendingRequests.delete(requestId);
        }
    }
}

setInterval(cleanupPendingRequests, TIMING.CLEANUP_INTERVAL);

// In status-core.js, find the makeApiRequest function and update it:

function makeApiRequest(endpoint, method, data = null, params = null) {
    return new Promise((resolve, reject) => {
        if (!ensureActive(`API_REQUEST: ${endpoint}`)) {
            reject(new Error(`Module not ACTIVE (current: ${currentState})`));
            return;
        }
        
        // Get token directly from session
        const token = getSessionToken();
        const userId = getSessionUserId();
        
        // Normalize endpoint like other modules do
        let normalizedEndpoint = endpoint;
        if (normalizedEndpoint.startsWith('/api/')) {
            normalizedEndpoint = normalizedEndpoint.substring(4);
        }
        if (!normalizedEndpoint.startsWith('/')) {
            normalizedEndpoint = '/' + normalizedEndpoint;
        }
        
        const requestId = generateRequestId();
        const timestamp = Date.now();
        
        pendingRequests.set(requestId, {
            resolve,
            reject,
            timestamp,
            type: endpoint,
            timeout: setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    pendingRequests.delete(requestId);
                    reject(new Error(`API request timeout: ${endpoint}`));
                }
            }, TIMING.REQUEST_TIMEOUT)
        });
        
        // Include token in the payload so parent doesn't need to fetch it
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
                params: params || null,
                token: token,  // ← ADD THIS - send token directly
                userId: userId // ← ADD THIS - send userId
            },
            timestamp: timestamp
        };
        
        try {
            if (!window.parent || window.parent === window) {
                throw new Error('No parent window');
            }
            window.parent.postMessage(message, '*');
            logStatus('SENDING', `API_REQUEST: ${method} ${normalizedEndpoint} (token: ${!!token})`);
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

// Handle API_RESPONSE from parent
function handleApiResponse(data) {
    const requestId = data.requestId || data.payload?.requestId;  // also check nested
    const response = data.payload || data;
    
    if (!pendingRequests.has(requestId)) {
        console.warn(`[${MODULE_NAME}] No pending request for: ${requestId}`);
        // Still dispatch for UI listeners
        document.dispatchEvent(new CustomEvent('apiResponse', { detail: data }));
        return;
    }
    const pending = pendingRequests.get(requestId);
    
    if (pending.timeout) {
        clearTimeout(pending.timeout);
    }
    
    pendingRequests.delete(requestId);
    
    // Check if response indicates failure
    const isFailed = response && (
        response.success === false ||
        (response.statusCode && response.statusCode >= 400)
    );
    
    if (isFailed) {
        const errMsg = response.error || response.message || 'API request failed';
        console.error(`[${MODULE_NAME}] API request failed: ${errMsg}`);
        pending.reject(new Error(errMsg));
    } else {
        // Extract data from response
        let result = response;
        
        // Handle different response formats
        if (result && result.data !== undefined && result.success === true) {
            result = result.data;
        }
        if (result && result.status === 'success' && result.data !== undefined) {
            result = result.data;
        }
        
        pending.resolve(result);
    }
    document.dispatchEvent(new CustomEvent('apiResponse', { detail: data }));
}

// =============================================
// STORAGE PROXY - SANDBOX-SAFE, NO DIRECT STORAGE ACCESS
// =============================================
const StorageProxy = {
    _pendingRequests: new Map(),
    _requestCounter: 0,
    
    get(key) {
        return new Promise((resolve, reject) => {
            const requestId = `storage_get_${++this._requestCounter}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            
            const timeout = setTimeout(() => {
                if (this._pendingRequests.has(requestId)) {
                    this._pendingRequests.delete(requestId);
                    reject(new Error(`Storage get timeout for key: ${key}`));
                }
            }, 5000);
            
            this._pendingRequests.set(requestId, { resolve, reject, timeout });
            
            parent.postMessage({
                type: 'STORAGE_GET',
                key,
                requestId,
                module: MODULE_NAME,
                timestamp: Date.now()
            }, '*');
        });
    },
    
    set(key, value) {
        parent.postMessage({
            type: 'STORAGE_SET',
            key,
            value: typeof value === 'string' ? value : JSON.stringify(value),
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
    },
    
    remove(key) {
        parent.postMessage({
            type: 'STORAGE_REMOVE',
            key,
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
    },
    
    clear() {
        parent.postMessage({
            type: 'STORAGE_CLEAR',
            module: MODULE_NAME,
            timestamp: Date.now()
        }, '*');
    },
    
    async getJSON(key, defaultValue = null) {
        try {
            const value = await this.get(key);
            if (value === null || value === undefined) return defaultValue;
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        } catch {
            return defaultValue;
        }
    },
    
    setJSON(key, value) {
        this.set(key, JSON.stringify(value));
    },
    
    handleResponse(event) {
        if (event.data?.type === 'STORAGE_RESULT') {
            const { requestId, value, error } = event.data;
            const pending = this._pendingRequests.get(requestId);
            if (pending) {
                clearTimeout(pending.timeout);
                this._pendingRequests.delete(requestId);
                if (error) {
                    pending.reject(new Error(error));
                } else {
                    pending.resolve(value);
                }
            }
        }
    }
};

// =============================================
// MESSAGE GUARD - DEDUPLICATION
// =============================================
const MessageGuard = {
    _seen: new Set(),
    _maxSize: 1000,
    
    isDuplicate(id) {
        if (!id) return false;
        if (this._seen.has(id)) return true;
        this._seen.add(id);
        
        if (this._seen.size > this._maxSize) {
            const first = this._seen.values().next().value;
            this._seen.delete(first);
        }
        
        return false;
    },
    
    clear() {
        this._seen.clear();
    }
};

// =============================================
// DETERMINISTIC LIFECYCLE STATE MACHINE (HANDSHAKE V3)
// =============================================
const LifecycleState = {
    BOOT: 'BOOT',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    WAIT_PARENT: 'WAIT_PARENT',
    ACTIVE: 'ACTIVE'
};

let _currentState = LifecycleState.BOOT;
let _previousState = null;
let _childReadySent = false;
let _parentReadyReceived = false;
let _transitionLock = false;
let _parentReady = false;

const _validTransitions = {
    [LifecycleState.BOOT]: [LifecycleState.INITIALIZING],
    [LifecycleState.INITIALIZING]: [LifecycleState.READY],
    [LifecycleState.READY]: [LifecycleState.WAIT_PARENT],
    [LifecycleState.WAIT_PARENT]: [LifecycleState.ACTIVE],
    [LifecycleState.ACTIVE]: []
};

const _sentMessages = new Set();

function transitionTo(nextState, reason = '') {
    if (_transitionLock) {
        debugWarn(`[Lifecycle] Transition locked - cannot transition ${_currentState} → ${nextState}`, reason);
        return false;
    }
    
    if (_currentState === nextState) {
        return true;
    }
    
    const allowed = _validTransitions[_currentState] || [];
    if (!allowed.includes(nextState)) {
        debugWarn(`[Lifecycle] Invalid transition: ${_currentState} → ${nextState}`, reason);
        logStatus('LIFECYCLE', `Invalid transition blocked: ${_currentState} → ${nextState}`);
        return false;
    }
    
    _transitionLock = true;
    
    _previousState = _currentState;
    _currentState = nextState;
    
    const transitionKey = `lifecycle_${_previousState}_to_${nextState}`;
    if (!_loggedMessages.has(transitionKey)) {
        _loggedMessages.add(transitionKey);
        logStatus('LIFECYCLE', `${_previousState} → ${nextState}${reason ? ` (${reason})` : ''}`);
    }
    
    _transitionLock = false;
    
    if (nextState === LifecycleState.ACTIVE) {
        onModuleActive();
    }
    
    return true;
}

function isInState(state) {
    return _currentState === state;
}

function canTransitionTo(state) {
    const allowed = _validTransitions[_currentState] || [];
    return allowed.includes(state);
}

function assertActive(actionName) {
    if (_currentState !== LifecycleState.ACTIVE) {
        debugWarn(`[Lifecycle] Blocked action "${actionName}" — not ACTIVE (current: ${_currentState})`);
        logStatus('LIFECYCLE', `Blocked: ${actionName} - not ACTIVE`);
        if (typeof DiagnosticsAgent !== 'undefined') DiagnosticsAgent.increment('blockedActions');
        return false;
    }
    return true;
}

function onModuleActive() {
    logStatus('LIFECYCLE', 'Module ACTIVE - safe zone entered');
    
    // Only request session if we have a valid one already or need to get one
    if (isSessionReady() && __isValidSession({ token: _sessionToken, userId: _sessionUser?.id || _sessionUser?.userId })) {
        logStatus('SUCCESS', 'Active with valid session');
    } else {
        requestSession();
    }
    
    if (typeof startBackgroundInitialization === 'function') {
        setTimeout(() => {
            startBackgroundInitialization();
        }, 100);
    }
    
    // Dispatch moduleActive event for UI to pick up
    document.dispatchEvent(new CustomEvent('moduleActive', {
        detail: { module: MODULE_NAME, timestamp: Date.now(), state: 'ACTIVE' }
    }));
    
    // Also dispatch a more specific event
    window.dispatchEvent(new CustomEvent('statusModuleActive', {
        detail: { timestamp: Date.now() }
    }));
}


function sendChildReady() {
    if (_childReadySent) {
        debugWarn('[Lifecycle] CHILD_READY already sent — skipping');
        return false;
    }

    // Allow from INITIALIZING or READY state
    if (_currentState !== LifecycleState.READY && _currentState !== LifecycleState.INITIALIZING) {
        debugWarn(`[Lifecycle] Cannot send CHILD_READY — invalid state: ${_currentState}`);
        logStatus('LIFECYCLE', `CHILD_READY blocked - current state: ${_currentState}`);
        return false;
    }

    // If in INITIALIZING, transition to READY first
    if (_currentState === LifecycleState.INITIALIZING) {
        transitionTo(LifecycleState.READY, 'preparing_to_send_child_ready');
    }

    _childReadySent = true;

    const messageId = `child_ready_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    if (_sentMessages.has(messageId)) {
        debugWarn('[Lifecycle] Duplicate CHILD_READY prevented');
        return false;
    }
    _sentMessages.add(messageId);

    parent.postMessage({
        type: "CHILD_READY",
        source: MODULE_NAME,  // ADD THIS - parent checks source field
        module: MODULE_NAME,
        moduleVersion: '10.0',
        messageId: messageId,
        capabilities: [
            'view_statuses',
            'post_statuses',
            'react_to_statuses',
            'track_views',
            'expiration_management'
        ],
        timestamp: Date.now()
    }, "*");

    transitionTo(LifecycleState.WAIT_PARENT, 'child_ready_sent');
    
    logStatus('LIFECYCLE', 'CHILD_READY sent - waiting for parent (NO RETRIES)');
    return true;
}

function handleParentReady(messageData) {
    if (_parentReadyReceived) {
        debugWarn('[Lifecycle] PARENT_READY already received — ignoring duplicate');
        logStatus('LIFECYCLE', 'Duplicate PARENT_READY ignored');
        return;
    }

    if (_currentState !== LifecycleState.WAIT_PARENT) {
        debugWarn(`[Lifecycle] Unexpected PARENT_READY in state: ${_currentState} — ignoring`);
        logStatus('LIFECYCLE', `PARENT_READY received in unexpected state: ${_currentState} - ignoring`);
        return;
    }

    _parentReadyReceived = true;
    _parentReady = true;
    parentReady = true; // FIX: also set the legacy parentReady flag so flushQueue works

    logStatus('LIFECYCLE', 'PARENT_READY received');

    const sessionData = messageData.session || messageData.payload?.session || null;
    
    if (sessionData) {
        // Validate session before handling
        if (__isValidSession(sessionData)) {
            if (!__isDuplicateSession(sessionData)) {
                handleSession(sessionData);
                __storeValidSessionId(sessionData);
            } else {
                logStatus('WARNING', 'Duplicate session data ignored');
            }
        } else {
            logStatus('FAILED', 'Invalid session data in PARENT_READY - rejected');
        }
    }

    // Only transition to ACTIVE if we have a valid session
    // CRITICAL FIX: Do NOT activate without valid session
    if (isSessionReady() && __isValidSession({ token: _sessionToken, userId: _sessionUser?.id || _sessionUser?.userId })) {
        transitionTo(LifecycleState.ACTIVE, 'parent_ready_received_with_valid_session');
        flushQueue();
        
        if (parentReadyResolver) {
            parentReadyResolver({ type: 'PARENT_READY', timestamp: Date.now() });
        }
        
        if (typeof onParentReadyCallback === 'function') {
            onParentReadyCallback();
        }
    } else {
        // Stay in WAIT_PARENT and request session
        logStatus('WAITING', 'PARENT_READY received but no valid session - waiting for session');
        requestSession();
    }
}


function onParentReadyCallback() {
    debugLog('Parent ready callback triggered');
    logStatus('LIFECYCLE', 'Parent ready callback executed');
    
    if (typeof startBackgroundInitialization === 'function' && isInState(LifecycleState.ACTIVE)) {
        setTimeout(() => {
            startBackgroundInitialization();
        }, 100);
    }
}

// =============================================
// SESSION STORAGE - MEMORY ONLY, NO LOCALSTORAGE FOR TOKENS
// =============================================
let _sessionToken = null;
let _sessionUser = null;
let _sessionExpiresAt = null;
let _sessionReady = false;

let _sessionRequested = false;
let _sessionRequestRetries = 0;
const MAX_SESSION_REQUEST_RETRIES = 3;

function setSession(token, user, expiresAt = null) {
    // CRITICAL: Validate session before storing
    const sessionToValidate = {
        token: token,
        userId: user?.id || user?.userId,
        user: user
    };
    
    if (!__isValidSession(sessionToValidate)) {
        logStatus('FAILED', 'Attempted to set invalid session - rejected');
        return false;
    }
    
    // Check if this is a duplicate session
    if (__isDuplicateSession(sessionToValidate)) {
        logStatus('WARNING', 'Duplicate session set prevented');
        return false;
    }
    
    // Prevent session downgrade - if we already have a valid session, don't overwrite with invalid
    if (_sessionReady && _sessionToken) {
        const currentValid = __isValidSession({ token: _sessionToken, userId: _sessionUser?.id || _sessionUser?.userId });
        if (currentValid && !__isValidSession(sessionToValidate)) {
            logStatus('WARNING', 'Prevented session downgrade - keeping existing valid session');
            return false;
        }
    }
    
    _sessionToken = token;
    _sessionUser = user;
    _sessionExpiresAt = expiresAt ? new Date(expiresAt) : null;
    _sessionReady = true;
    
    __storeValidSessionId(sessionToValidate);
    
    logStatus('SUCCESS', 'Session stored in memory');
    
    // Load statuses after session is established — debounced to prevent multiple
    // rapid setSession() calls (AUTH_READY + PARENT_READY + SESSION_DATA) from
    // firing 3–5 parallel loadStatuses() fetches.
    if (_currentState === LifecycleState.ACTIVE) {
        if (setSession._loadDebounce) clearTimeout(setSession._loadDebounce);
        setSession._loadDebounce = setTimeout(() => {
            setSession._loadDebounce = null;
            loadStatuses();
        }, 150);
    }
    
    return true;
}

function getSessionToken() {
    if (!_sessionReady) {
        debugWarn('Session not ready - token unavailable');
        return null;
    }
    
    if (_sessionExpiresAt && new Date() >= _sessionExpiresAt) {
        debugWarn('Session token expired');
        clearSession();
        return null;
    }
    
    return _sessionToken;
}

function getSessionUser() {
    return _sessionReady ? _sessionUser : null;
}

function getSessionUserId() {
    if (!_sessionReady) return null;
    const userId = _sessionUser?.id || _sessionUser?.userId;
    // Validate that userId is a valid number, not "user" or other placeholder
    if (userId === 'user' || userId === 'default' || userId === 0 || userId === '0') {
        return null;
    }
    return userId;
}

function isSessionReady() {
    if (!_sessionReady || !_sessionToken) return false;
    
    // Validate stored session
    const sessionToValidate = {
        token: _sessionToken,
        userId: _sessionUser?.id || _sessionUser?.userId,
        user: _sessionUser
    };
    
    return __isValidSession(sessionToValidate);
}

function clearSession() {
    _sessionToken = null;
    _sessionUser = null;
    _sessionExpiresAt = null;
    _sessionReady = false;
    _sessionRequested = false;
    _sessionRequestRetries = 0;
    
    logStatus('INFO', 'Session cleared from memory');
}

// =============================================
// AUTHORIZED FETCH - ALWAYS INCLUDES BEARER TOKEN
// =============================================
async function authorizedFetch(url, options = {}) {
    if (!isSessionReady()) {
        const error = new Error('Session not ready - cannot make authorized request');
        error.code = 'SESSION_NOT_READY';
        debugWarn(`Blocked API call to ${url}: session not ready`);
        
        if (!_sessionRequested && isInState(LifecycleState.ACTIVE)) {
            requestSession();
        }
        
        throw error;
    }
    
    const token = getSessionToken();
    if (!token) {
        const error = new Error('No valid session token');
        error.code = 'NO_TOKEN';
        debugWarn(`Blocked API call to ${url}: no token`);
        throw error;
    }
    
    // CRITICAL: Use parent proxy instead of direct fetch
    // This ensures requests go through chat.html which has the correct backend URL
    try {
        // Route through parent proxy via API_REQUEST
        const endpoint = url.replace(/^https?:\/\/[^\/]+/, '');
        const response = await makeApiRequest(endpoint, options.method || 'GET', options.body, null);
        // makeApiRequest returns the parsed JSON response directly
        return {
            ok: true,
            status: 200,
            json: async () => response,
            text: async () => JSON.stringify(response),
            headers: new Headers({ 'content-type': 'application/json' })
        };
    } catch (error) {
        console.error(`[${MODULE_NAME}] Parent proxy request failed:`, error);
        throw error;
    }
}

async function authorizedFetchJSON(url, options = {}) {
    const response = await authorizedFetch(url, options);
    return response.json();
}

// =============================================
// ACTION GATE - Prevent actions before ACTIVE state
// =============================================
function canSendAction() {
    return isInState(LifecycleState.ACTIVE);
}

function safeSendAction(action, payload = {}) {
    if (!canSendAction()) {
        debugWarn(`Blocked action "${action}" - not in ACTIVE state (current: ${_currentState})`);
        logStatus('LIFECYCLE', `Blocked action: ${action} - not ACTIVE`);
        if (typeof DiagnosticsAgent !== 'undefined') DiagnosticsAgent.increment('blockedActions');
        return false;
    }
    
    return sendMessage('ACTION', {
        action,
        module: MODULE_NAME,
        payload,
        timestamp: Date.now()
    });
}

// =============================================
// MESSAGE QUEUE SYSTEM - CRITICAL FOR PROTOCOL COMPLIANCE
// =============================================
let parentReady = false;
const messageQueue = [];

function sendMessage(type, payload = {}, options = {}) {
    if (type !== 'CHILD_READY' && !isInState(LifecycleState.ACTIVE) && !parentReady) {
        debugLog(`Queueing ${type} - not active yet`);
        messageQueue.push({ type, payload, options, timestamp: Date.now() });
        return null;
    }
    
    try {
        const messageId = options.id || genId();
        
        if (_sentMessages.has(messageId)) {
            debugWarn(`Duplicate message prevented: ${type} (${messageId})`);
            return null;
        }
        _sentMessages.add(messageId);
        
        const message = {
            type: type,
            id: messageId,
            requestId: options.requestId || genReqId(),
            source: MODULE_NAME,
            target: "parent",
            payload: payload,
            timestamp: Date.now()
        };

        if (!message.type || !message.id || !message.requestId || !message.source || !message.target || message.timestamp === undefined) {
            debugError('Invalid message schema - missing required fields', message);
            return false;
        }

        if (!window.parent || window.parent === window) {
            debugLog('No parent window available');
            return false;
        }

        window.parent.postMessage(message, '*');
        if (typeof DiagnosticsAgent !== 'undefined') DiagnosticsAgent.increment('messagesSent');
        
        const logKey = `sent_${message.type}`;
        if (!_loggedMessages.has(logKey)) {
            _loggedMessages.add(logKey);
            logStatus('SENDING', `${message.type} sent`);
        }
        
        return message.id;
    } catch (error) {
        debugError('Failed to send message:', error);
        return false;
    }
}

function safeSend(type, payload = {}, options = {}) {
    if (type === 'CHILD_READY') {
        debugWarn('Use sendChildReady() instead of safeSend for CHILD_READY');
        return sendChildReady();
    }

    if (!parentReady) {
        debugLog(`Queueing ${type} - parent not ready`);
        messageQueue.push({ type, payload, options, timestamp: Date.now() });
        return true;
    }

    return sendMessage(type, payload, options);
}

function flushQueue() {
    if (!parentReady) {
        debugWarn('Cannot flush queue - parent not ready');
        return;
    }

    const queueLength = messageQueue.length;
    if (queueLength === 0) return;

    debugLog(`Flushing ${queueLength} queued messages`);
    
    while (messageQueue.length) {
        const { type, payload, options } = messageQueue.shift();
        sendMessage(type, payload, options);
    }
    
    const flushKey = 'queue_flushed';
    if (!_loggedMessages.has(flushKey)) {
        _loggedMessages.add(flushKey);
        logStatus('SUCCESS', `Flushed ${queueLength} queued messages`);
    }
}

// =============================================
// STANDARDIZED MESSAGE SCHEMA VALIDATOR - STRICT
// =============================================
const MessageValidator = {
    requiredFields: ['type', 'id', 'requestId', 'source', 'target', 'timestamp'],
    
    // For INBOUND messages from parent, only type is truly required.
    // For OUTBOUND messages (source === MODULE_NAME), full schema is enforced elsewhere.
    validate(message) {
        try {
            if (!message || typeof message !== 'object') {
                return { valid: false, reason: 'Not an object' };
            }

            // Every message must have a type
            if (!message.type || typeof message.type !== 'string') {
                return { valid: false, reason: 'Missing or invalid type' };
            }

            // For messages FROM parent, relax schema — parent controls its own format
            if (message.source === 'parent') {
                return { valid: true };
            }

            // For outbound messages (MODULE_NAME as source), enforce full schema
            const outboundRequired = ['id', 'requestId', 'source', 'target', 'timestamp'];
            for (const field of outboundRequired) {
                if (!message[field] && message[field] !== 0) {
                    return { valid: false, reason: `Missing required field: ${field}` };
                }
            }

            if (typeof message.source !== 'string') {
                return { valid: false, reason: 'source must be string' };
            }

            if (message.source !== 'parent' && message.target !== 'parent') {
                return { valid: false, reason: `Invalid target: ${message.target} - must be 'parent'` };
            }

            if (typeof message.id !== 'string') {
                return { valid: false, reason: 'id must be string' };
            }

            if (typeof message.requestId !== 'string') {
                return { valid: false, reason: 'requestId must be string' };
            }

            if (typeof message.timestamp !== 'number') {
                return { valid: false, reason: 'timestamp must be number' };
            }

            const now = Date.now();
            if (Math.abs(now - message.timestamp) > 300000) {
                debugWarn(`Timestamp out of range for ${message.type}: ${message.timestamp}`);
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, reason: error.message };
        }
    },
    
    createMessage(type, payload = {}, options = {}) {
        return {
            type,
            id: options.id || genId(),
            requestId: options.requestId || genReqId(),
            source: MODULE_NAME,
            target: 'parent',
            timestamp: Date.now(),
            payload,
            ...options
        };
    }
};

// =============================================
// IN-MEMORY STATE (PRIMARY SOURCE OF TRUTH)
// =============================================
let statusState = {
    statuses: [],
    myStatuses: [],
    loading: false,
    error: null,
    lastSync: null
};

const statusCache = new Set(); // For duplicate detection
const statusObservers = new Set();

function notifyStatusObservers() {
    statusObservers.forEach(observer => {
        try {
            observer(statusState);
        } catch (e) {}
    });
    
    window.dispatchEvent(new CustomEvent('statusStateChanged', {
        detail: { state: statusState }
    }));
}

function updateStatusState(updates) {
    Object.assign(statusState, updates);
    notifyStatusObservers();
}

function addStatus(status) {
    if (!status || !status.id) return false;
    
    if (statusCache.has(status.id)) {
        debugLog(`Duplicate status ignored: ${status.id}`);
        return false;
    }
    
    statusCache.add(status.id);
    
    statusState.statuses.unshift(status);
    
    const currentUserId = getSessionUserId();
    if (currentUserId && status.userId === currentUserId) {
        statusState.myStatuses.unshift(status);
    }
    
    statusState.statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    statusState.myStatuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    notifyStatusObservers();
    
    logStatus('SUCCESS', `Status added: ${status.id}`);
    return true;
}

function removeStatus(statusId) {
    const index = statusState.statuses.findIndex(s => s.id === statusId);
    if (index !== -1) {
        statusState.statuses.splice(index, 1);
        statusCache.delete(statusId);
    }
    
    const myIndex = statusState.myStatuses.findIndex(s => s.id === statusId);
    if (myIndex !== -1) {
        statusState.myStatuses.splice(myIndex, 1);
    }
    
    notifyStatusObservers();
    logStatus('INFO', `Status removed: ${statusId}`);
    return true;
}

function updateStatus(statusId, updates) {
    const status = statusState.statuses.find(s => s.id === statusId);
    if (status) {
        Object.assign(status, updates);
        notifyStatusObservers();
        return true;
    }
    
    const myStatus = statusState.myStatuses.find(s => s.id === statusId);
    if (myStatus) {
        Object.assign(myStatus, updates);
        notifyStatusObservers();
        return true;
    }
    
    return false;
}

function markStatusViewedLocally(statusId) {
    const status = statusState.statuses.find(s => s.id === statusId);
    if (status && !status.viewed) {
        status.viewed = true;
        status.viewedAt = new Date().toISOString();
        status.viewCount = (status.viewCount || 0) + 1;
        notifyStatusObservers();
        return true;
    }
    return false;
}

// =============================================
// STATUS API ACTIONS (REAL END-TO-END)
// =============================================

async function loadStatuses() {
    if (!ensureActive('loadStatuses')) {
        updateStatusState({ loading: false, error: 'Module not active' });
        return;
    }

    // Prevent concurrent calls — if a fetch is already in-flight, skip
    if (loadStatuses._inFlight) return;
    loadStatuses._inFlight = true;
    
    updateStatusState({ loading: true, error: null });
    
    try {
        // console.log(`[${MODULE_NAME}] 📤 Loading statuses from backend`);
        const response = await makeApiRequest('/api/status', 'GET');

        // Backend wraps data: { success, data: { statuses: [...] } }
        // After handleApiResponse resolves, we receive response.data (the inner data object).
        // Support both shapes for resilience.
        const statusList = (response && (response.statuses || (response.data && response.data.statuses))) || null;

        // console.log(`[${MODULE_NAME}] 📥 Received ${statusList?.length || 0} statuses from backend`);
        
        if (statusList && Array.isArray(statusList)) {
            statusCache.clear();
            statusState.statuses = [];
            statusState.myStatuses = [];
            
            const currentUserId = getSessionUserId();
            
            statusList.forEach(status => {
                if (status && status.id) {
                    statusCache.add(status.id);
                    statusState.statuses.push(status);
                    
                    if (currentUserId && status.userId === currentUserId) {
                        statusState.myStatuses.push(status);
                    }
                }
            });
            
            statusState.statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            statusState.myStatuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            statusState.lastSync = new Date().toISOString();
            statusState.loading = false;
            
            logStatus('SUCCESS', `Loaded ${statusState.statuses.length} statuses`);
            notifyStatusObservers();

            // Also load friends' statuses
            loadFriendsStatusesInBackground().catch(() => {});
        } else {
            throw new Error('Invalid response format');
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to load statuses:`, error);
        logStatus('FAILED', `Load statuses: ${error.message}`);

        // On network failure, serve whatever is in cache so UI isn't empty
        try {
            const cachedStatuses = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.STATUSES);
            if (cachedStatuses && Array.isArray(cachedStatuses) && cachedStatuses.length > 0) {
                statuses = cachedStatuses;
                statusState.statuses = cachedStatuses;
                statusState.loading = false;
                logStatus('INFO', `Serving ${cachedStatuses.length} cached statuses after fetch failure`);
                notifyStatusObservers();
            } else {
                updateStatusState({ loading: false, error: error.message || 'Failed to load statuses' });
            }
        } catch (_) {
            updateStatusState({ loading: false, error: error.message || 'Failed to load statuses' });
        }
    } finally {
        loadStatuses._inFlight = false;
    }
}

async function postStatus(statusData) {
    if (!ensureActive('postStatus')) {
        return { success: false, error: 'Module not active' };
    }
    if (!isSessionReady()) {
        return { success: false, error: 'Not authenticated' };
    }
    if (!statusData || (!(statusData.content || '').trim() && !(statusData.text || '').trim() && !statusData.media && !statusData.mediaUrl)) {
        return { success: false, error: 'Status content required' };
    }

    updateStatusState({ loading: true, error: null });

    const rawContent = statusData.content || statusData.text || '';

    const payload = {
        content: rawContent,
        type: statusData.type || 'text',
        moodType: statusData.mood || statusData.moodType || null,
        mediaUrl: statusData.media || statusData.mediaUrl || null,
        mediaType: statusData.mediaType || null,
        background: statusData.background || null,
        // Send both privacy (string) and isPublic (bool) so backend handles either form
        privacy: statusData.privacy || (statusData.isPublic === false ? 'friends' : 'public'),
        isPublic: (statusData.privacy === 'everyone' || statusData.privacy === 'public')
            ? true
            : (statusData.isPublic !== undefined ? statusData.isPublic : true),
        location: statusData.location || null,
        latitude: statusData.latitude || null,
        longitude: statusData.longitude || null,
    };

    // If offline — queue immediately without attempting a doomed request
    if (!isOnlineGlobal || !navigator.onLine) {
        try {
            const queue = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
            queue.push({ ...payload, _queuedAt: new Date().toISOString() });
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, queue);
            updateStatusState({ loading: false });
            logStatus('INFO', 'Status queued offline — will post when connection returns');
            return { success: true, queued: true, message: 'Queued for posting when online' };
        } catch (qErr) {
            updateStatusState({ loading: false, error: 'Failed to queue status offline' });
            return { success: false, error: 'Offline and queue failed' };
        }
    }

    try {
        // console.log(`[${MODULE_NAME}] 📤 Posting new status`);
        const response = await makeApiRequest('/api/status', 'POST', payload);
        // console.log(`[${MODULE_NAME}] 📥 Status posted successfully:`, response);

        const newStatus = response?.status || response?.data?.status || null;
        if (newStatus) {
            addStatus(newStatus);
            // Invalidate TTL so next background refresh picks up the new post
            SafeStorage.memoryStore.delete(LOCAL_STORAGE_KEYS.LAST_SYNC);
            updateStatusState({ loading: false });
            logStatus('POST', 'Status posted successfully');
            return { success: true, status: newStatus };
        } else {
            throw new Error('Invalid response from server');
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to post status:`, error);
        updateStatusState({ loading: false, error: error.message });
        logStatus('FAILED', `Post status: ${error.message}`);
        // Queue on network failures so the post isn't lost
        if (!navigator.onLine || error.message.includes('timeout') || error.message.includes('network') || error.message.includes('fetch')) {
            try {
                const queue = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
                queue.push({ ...payload, _queuedAt: new Date().toISOString() });
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, queue);
                logStatus('INFO', 'Network error — status queued for retry');
                return { success: false, queued: true, error: error.message, message: 'Queued for retry when online' };
            } catch (_) {}
        }
        return { success: false, error: error.message };
    }
}

async function markStatusViewed(statusId) {
    if (!ensureActive('markStatusViewed')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!statusId) {
        return { success: false, error: 'Status ID required' };
    }
    
    try {
        // console.log(`[${MODULE_NAME}] 📤 Marking status as viewed: ${statusId}`);
        
        // Correct RESTful endpoint: POST /api/status/:statusId/view
        const response = await makeApiRequest(`/api/status/${statusId}/view`, 'POST', {});
        
        // console.log(`[${MODULE_NAME}] 📥 Status marked as viewed:`, response);
        
        if (response && response.success !== false) {
            markStatusViewedLocally(statusId);
            logStatus('VIEW', `Status viewed: ${statusId}`);
            return { success: true };
        } else {
            throw new Error('Failed to mark as viewed');
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to mark status as viewed:`, error);
        logStatus('FAILED', `Mark viewed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function deleteStatus(statusId) {
    if (!ensureActive('deleteStatus')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!statusId) {
        return { success: false, error: 'Status ID required' };
    }
    
    try {
        // console.log(`[${MODULE_NAME}] 📤 Deleting status: ${statusId}`);
        
        // Correct RESTful endpoint: DELETE /api/status/:statusId
        const response = await makeApiRequest(`/api/status/${statusId}`, 'DELETE', null);
        
        // console.log(`[${MODULE_NAME}] 📥 Status deleted:`, response);
        
        if (response && response.success !== false) {
            removeStatus(statusId);
            logStatus('SUCCESS', `Status deleted: ${statusId}`);
            return { success: true };
        } else {
            throw new Error('Failed to delete status');
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to delete status:`, error);
        logStatus('FAILED', `Delete status: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function addReaction(statusId, reaction) {
    if (!ensureActive('addReaction')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!statusId || !reaction) {
        return { success: false, error: 'Status ID and reaction required' };
    }
    
    try {
        // console.log(`[${MODULE_NAME}] 📤 Adding reaction ${reaction} to status: ${statusId}`);
        
        const response = await makeApiRequest(`/api/status/${statusId}/like`, 'POST', {});
        
        // console.log(`[${MODULE_NAME}] 📥 Reaction added:`, response);
        
        if (response && response.success !== false) {
            const status = statusState.statuses.find(s => s.id === statusId);
            if (status) {
                if (!status.reactions) status.reactions = {};
                if (!status.reactions[reaction]) status.reactions[reaction] = [];
                const currentUserId = getSessionUserId();
                if (currentUserId && !status.reactions[reaction].includes(currentUserId)) {
                    status.reactions[reaction].push(currentUserId);
                }
                notifyStatusObservers();
            }
            logStatus('REACTION', `Added ${reaction} to ${statusId}`);
            return { success: true };
        } else {
            throw new Error('Failed to add reaction');
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to add reaction:`, error);
        logStatus('FAILED', `Add reaction: ${error.message}`);
        return { success: false, error: error.message };
    }
}

async function removeReaction(statusId, reaction) {
    if (!ensureActive('removeReaction')) {
        return { success: false, error: 'Module not active' };
    }
    
    if (!statusId || !reaction) {
        return { success: false, error: 'Status ID and reaction required' };
    }
    
    try {
        // console.log(`[${MODULE_NAME}] 📤 Removing reaction ${reaction} from status: ${statusId}`);
        
        const response = await makeApiRequest(`/api/status/${statusId}/like`, 'DELETE', null);
        
        // console.log(`[${MODULE_NAME}] 📥 Reaction removed:`, response);
        
        if (response && response.success !== false) {
            const status = statusState.statuses.find(s => s.id === statusId);
            if (status && status.reactions && status.reactions[reaction]) {
                const currentUserId = getSessionUserId();
                const index = status.reactions[reaction].indexOf(currentUserId);
                if (index !== -1) {
                    status.reactions[reaction].splice(index, 1);
                    if (status.reactions[reaction].length === 0) {
                        delete status.reactions[reaction];
                    }
                }
                notifyStatusObservers();
            }
            logStatus('REACTION', `Removed ${reaction} from ${statusId}`);
            return { success: true };
        } else {
            throw new Error('Failed to remove reaction');
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to remove reaction:`, error);
        logStatus('FAILED', `Remove reaction: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// =============================================
// REQUEST SESSION - ONLY AFTER ACTIVE
// =============================================
function requestSession() {
    if (_sessionRequested && _sessionRequestRetries >= MAX_SESSION_REQUEST_RETRIES) {
        debugWarn('Max session request retries reached');
        return;
    }
    
    if (!isInState(LifecycleState.ACTIVE) && currentState !== LIFECYCLE_STATES.WAIT_PARENT) {
        debugLog('Cannot request session - not ACTIVE or WAIT_PARENT (current: ' + _currentState + ')');
        return;
    }
    
    if (!parentReady) {
        debugLog('Cannot request session - parent not ready, queueing REQUEST_SESSION');
        safeSend('REQUEST_SESSION', {});
        return;
    }
    
    _sessionRequested = true;
    _sessionRequestRetries++;
    if (typeof DiagnosticsAgent !== 'undefined') DiagnosticsAgent.increment('sessionRequests');
    
    safeSend('REQUEST_SESSION', {});
    const sessionKey = 'session_requested';
    if (!_loggedMessages.has(sessionKey)) {
        _loggedMessages.add(sessionKey);
        logStatus('SENDING', 'Session requested');
    }
}

function handleSession(sessionData) {
    if (!sessionData) return;
    
    // CRITICAL: Validate session before accepting
    if (!__isValidSession(sessionData)) {
        logStatus('FAILED', 'Invalid session data received - rejected', { userId: sessionData.userId, hasToken: !!sessionData.token });
        return;
    }
    
    // Check for duplicate session
    if (__isDuplicateSession(sessionData)) {
        logStatus('WARNING', 'Duplicate session data ignored');
        return;
    }
    
    // Prevent session downgrade - if we already have a valid session, don't overwrite with invalid
    if (_sessionReady && _sessionToken) {
        const currentValid = __isValidSession({ token: _sessionToken, userId: _sessionUser?.id || _sessionUser?.userId });
        if (currentValid && !__isValidSession(sessionData)) {
            logStatus('WARNING', 'Prevented session downgrade - keeping existing valid session');
            return;
        }
    }
    
    // Extract user ID from various possible formats
    let userId = null;
    if (sessionData.userId) {
        userId = sessionData.userId;
    } else if (sessionData.user?.id) {
        userId = sessionData.user.id;
    } else if (sessionData.user?.userId) {
        userId = sessionData.user.userId;
    }
    
    // Final validation - ensure userId is valid
    if (!userId || userId === 'user' || userId === 'default' || userId === 0 || userId === '0') {
        logStatus('FAILED', 'Invalid userId in session data - rejected', { userId });
        return;
    }
    
    if (sessionData.token) {
        const user = sessionData.user || { id: userId, displayName: sessionData.user?.displayName || 'User' };
        setSession(sessionData.token, user, sessionData.expiresAt || null);
        
        _sessionRequestRetries = 0;
        if (typeof DiagnosticsAgent !== 'undefined') DiagnosticsAgent.increment('sessionSuccess');
        
        StorageProxy.remove('USER_TOKEN');
        StorageProxy.remove('USER_DATA');
        
        __storeValidSessionId(sessionData);
        
        // If we were waiting for session to activate, now we can activate
        if (_currentState === LifecycleState.WAIT_PARENT && (_parentReadyReceived || _parentReady) && !isInState(LifecycleState.ACTIVE)) {
            transitionTo(LifecycleState.ACTIVE, 'valid_session_received');
            flushQueue();
            
            if (parentReadyResolver) {
                parentReadyResolver({ type: 'PARENT_READY', timestamp: Date.now() });
            }
        }
    }
    
    if (typeof updateSessionMirror === 'function') {
        updateSessionMirror(sessionData, 'parent');
    }
    
    if (typeof ParentCommunication !== 'undefined' && ParentCommunication.handleSessionSync) {
        ParentCommunication.handleSessionSync(sessionData);
    }
    
    if (typeof SessionClient !== 'undefined' && SessionClient.updateSession) {
        SessionClient.updateSession(sessionData, 'parent');
    }
    
    if (sessionData.user) {
        if (typeof currentUser !== 'undefined') currentUser = sessionData.user;
        if (typeof userData !== 'undefined') userData = sessionData.user;
    }
    
    if (sessionData.token) {
        if (typeof state !== 'undefined') state.token = sessionData.token;
    }
    
    if (typeof isTokenReady !== 'undefined') {
        isTokenReady = true;
        if (typeof triggerTokenReadyCallbacks !== 'undefined') {
            triggerTokenReadyCallbacks();
        }
    }
    if (typeof processPendingApiRequests !== 'undefined') processPendingApiRequests();
    
    const sessionKey = 'session_received';
    if (!_loggedMessages.has(sessionKey)) {
        _loggedMessages.add(sessionKey);
        logStatus('SUCCESS', 'Session data received');
    }
}

// =============================================
// SEND HEARTBEAT ACK
// =============================================
function sendHeartbeatAck(inResponseTo) {
    safeSend('HEARTBEAT_ACK', {
        inResponseTo,
        timestamp: Date.now()
    });
}

// =============================================
// PARENT COMMUNICATION LAYER - ADAPTED FOR PROTOCOL COMPLIANCE
// =============================================
const ParentCommunication = {
    childReadySent: false,
    moduleRegistered: false,
    parentReadyReceived: false,
    sessionSynced: false,
    
    initialize() {
        debugLog('ParentCommunication initialized');
        return this;
    },
    
    sendChildReady() {
        return sendChildReady();
    },
    
    sendRegistration() {
        if (this.moduleRegistered) {
            debugLog('Already registered, skipping');
            return false;
        }
        
        if (!isInState(LifecycleState.WAIT_PARENT) && !isInState(LifecycleState.ACTIVE)) {
            debugWarn(`Cannot register in state ${_currentState} - must be WAIT_PARENT or ACTIVE`);
            return false;
        }
        
        const success = safeSend('REGISTER_MODULE', {
            moduleName: MODULE_NAME,
            moduleVersion: '10.0',
            capabilities: IframeEnvironment.getCapabilities(),
            features: [
                'status_text',
                'status_media',
                'status_poll',
                'reactions',
                'view_tracking',
                'expiration'
            ]
        });
        
        if (success) {
            this.moduleRegistered = true;
            logStatus('SENDING', 'REGISTER_MODULE sent');
        }
        
        return success;
    },
    
    sendHeartbeatAck(inResponseTo) {
        return safeSend('HEARTBEAT_ACK', {
            inResponseTo,
            timestamp: Date.now()
        });
    },
    
    handleSessionSync(sessionData) {
        if (!sessionData) return false;
        
        // Validate before handling
        if (!__isValidSession(sessionData)) {
            logStatus('FAILED', 'Invalid session in handleSessionSync - rejected');
            return false;
        }
        
        this.updateSessionState(sessionData);
        
        logStatus('SUCCESS', 'Session synchronized');
        
        return true;
    },
    
    updateSessionState(sessionData) {
        try {
            if (sessionData.user) {
                if (typeof currentUser !== 'undefined') currentUser = sessionData.user;
                if (typeof userData !== 'undefined') userData = sessionData.user;
            }
            
            if (sessionData.token) {
                if (typeof state !== 'undefined') state.token = sessionData.token;
            }
            
            if (sessionData.permissions) {
                if (typeof state !== 'undefined') state.permissionsGranted = sessionData.permissions;
            }
            
            if (sessionData.sessionId) {
                if (typeof state !== 'undefined') state.sessionId = sessionData.sessionId;
            }
            
            if (typeof updateSessionMirror === 'function') {
                updateSessionMirror(sessionData, 'session_sync');
            }
            if (typeof SessionClient !== 'undefined' && SessionClient.updateSession) {
                SessionClient.updateSession(sessionData, 'session_sync');
            }
            
            if (typeof isTokenReady !== 'undefined') {
                isTokenReady = true;
                if (typeof triggerTokenReadyCallbacks !== 'undefined') {
                    triggerTokenReadyCallbacks();
                }
            }
            if (typeof processPendingApiRequests !== 'undefined') processPendingApiRequests();
            
        } catch (error) {
            debugError('Failed to update session state:', error);
        }
    },
    
    handleParentMessage(message) {
        if (!message || !message.type) {
            return;
        }
        
        switch (message.type) {
            case 'PARENT_READY':
                this.parentReadyReceived = true;
                break;
                case 'AUTH_READY':
    logStatus('RECEIVE', 'AUTH_READY received in ParentCommunication');
    
    const authPayload = message.payload || message.data || {};
    const authSession = authPayload.session || authPayload;
    
    if (authSession && __isValidSession(authSession)) {
        if (!__isDuplicateSession(authSession)) {
            this.handleSessionSync(authSession);
            __storeValidSessionId(authSession);
        }
    }
    
    if (!this.parentReadyReceived && isInState(LifecycleState.WAIT_PARENT)) {
        this.parentReadyReceived = true;
        parentReady = true;
        _parentReady = true;
        
        if (isSessionReady() && __isValidSession({ token: _sessionToken, userId: _sessionUser?.id || _sessionUser?.userId })) {
            transitionTo(LifecycleState.ACTIVE, 'auth_ready_with_valid_session');
            flushQueue();
            
            if (parentReadyResolver) {
                parentReadyResolver({ type: 'AUTH_READY', timestamp: Date.now() });
            }
        }
    }
    break;
                
            case 'MODULE_REGISTERED':
                if (message.payload?.moduleName === MODULE_NAME) {
                    this.moduleRegistered = true;
                    logStatus('SUCCESS', 'Module registered');
                }
                break;
                
            case 'SESSION_DATA':
                // Validate session before handling
                if (message.payload && __isValidSession(message.payload)) {
                    this.handleSessionSync(message.payload);
                } else {
                    logStatus('WARNING', 'Invalid SESSION_DATA received');
                }
                break;
                
            case 'HEARTBEAT':
                this.sendHeartbeatAck(message.id);
                break;
                
            case 'SESSION_ACTIVE':
                if (message.payload && __isValidSession(message.payload)) {
                    this.handleSessionSync(message.payload);
                }
                break;
                
            default:
                break;
        }
    },
    
    sendAction(action, payload = {}) {
        return safeSendAction(action, payload);
    },
    
    reset() {
        this.childReadySent = false;
        this.parentReadyReceived = false;
        this.moduleRegistered = false;
        this.sessionSynced = false;
    }
}.initialize();

// =============================================
// MESSAGE TYPES - ENHANCED
// =============================================
const MESSAGE_TYPES = {
    CHILD_READY: 'CHILD_READY',
    PARENT_READY: 'PARENT_READY',
    REGISTER_MODULE: 'REGISTER_MODULE',
    MODULE_REGISTERED: 'MODULE_REGISTERED',
    SESSION_DATA: 'SESSION_DATA',
    HEARTBEAT: 'HEARTBEAT',
    HEARTBEAT_ACK: 'HEARTBEAT_ACK',
    ACK: 'ACK',
    ACTION: 'ACTION',
    SESSION_ACTIVE: 'SESSION_ACTIVE',
    REQUEST_SESSION: 'REQUEST_SESSION',
    
    STORAGE_GET: 'STORAGE_GET',
    STORAGE_SET: 'STORAGE_SET',
    STORAGE_REMOVE: 'STORAGE_REMOVE',
    STORAGE_CLEAR: 'STORAGE_CLEAR',
    STORAGE_RESULT: 'STORAGE_RESULT',
    
    READY: 'STATUS_READY',
    SESSION: 'STATUS_SESSION',
    DATA: 'STATUS_DATA',
    ERROR: 'STATUS_ERROR',
    STATUS: 'STATUS_UPDATE',
    REQUEST_SESSION_LEGACY: 'STATUS_REQUEST_SESSION',
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
    HANDSHAKE_ACK: 'HANDSHAKE_ACK',
    SESSION_ACK: 'SESSION_ACK',
    PING: 'PING',
    PONG: 'PONG',
    PAGE_ACTIVATED: 'PAGE_ACTIVATED',
    NAVIGATE: 'NAVIGATE',
    CAPABILITY_REQUEST: 'CAPABILITY_REQUEST',
    CAPABILITY_RESPONSE: 'CAPABILITY_RESPONSE',
    TOKEN_REFRESH: 'TOKEN_REFRESH',
    TOKEN_REFRESH_RESPONSE: 'TOKEN_REFRESH_RESPONSE',
    ORIGIN_VALIDATION: 'ORIGIN_VALIDATION',
    ORIGIN_VALIDATION_RESPONSE: 'ORIGIN_VALIDATION_RESPONSE',
    CONFIG_REQUEST: 'CONFIG_REQUEST',
    CONFIG_RESPONSE: 'CONFIG_RESPONSE',
    DIAGNOSTICS: 'DIAGNOSTICS',
    RECOVERY_REQUEST: 'RECOVERY_REQUEST',
    RECOVERY_RESPONSE: 'RECOVERY_RESPONSE',
    STATUS_VIEW: 'STATUS_VIEW',
    STATUS_REACT: 'STATUS_REACT',
    STATUS_REPLY: 'STATUS_REPLY',
    STATUS_PIN: 'STATUS_PIN',
    STATUS_UNPIN: 'STATUS_UNPIN',
    STATUS_MUTE: 'STATUS_MUTE',
    STATUS_UNMUTE: 'STATUS_UNMUTE',
    STATUS_REPORT: 'STATUS_REPORT',
    STATUS_DRAFT_SAVE: 'STATUS_DRAFT_SAVE',
    STATUS_DRAFT_LOAD: 'STATUS_DRAFT_LOAD',
    STATUS_DRAFT_DELETE: 'STATUS_DRAFT_DELETE',
    STATUS_SCHEDULE: 'STATUS_SCHEDULE',
    STATUS_SCHEDULE_CANCEL: 'STATUS_SCHEDULE_CANCEL',
    HIGHLIGHT_CREATE: 'HIGHLIGHT_CREATE',
    HIGHLIGHT_UPDATE: 'HIGHLIGHT_UPDATE',
    HIGHLIGHT_DELETE: 'HIGHLIGHT_DELETE',
    HIGHLIGHT_ADD_STATUS: 'HIGHLIGHT_ADD_STATUS',
    HIGHLIGHT_REMOVE_STATUS: 'HIGHLIGHT_REMOVE_STATUS',
    IFRAME_REGISTERED: 'IFRAME_REGISTERED',
    
    STATUS_CREATE: 'STATUS_CREATE',
    STATUS_POSTED: 'STATUS_POSTED',
    STATUS_VIEWED: 'STATUS_VIEWED',
    STATUS_REACTED: 'STATUS_REACTED',
    STATUS_REACTION_REMOVED: 'STATUS_REACTION_REMOVED',
    STATUS_EXPIRED: 'STATUS_EXPIRED',
    STATUS_SYNC_REQUEST: 'STATUS_SYNC_REQUEST',
    STATUS_SYNC_RESPONSE: 'STATUS_SYNC_RESPONSE',
    STATUSES_UPDATE: 'STATUSES_UPDATE',
    VIEWER_TRACKED: 'VIEWER_TRACKED',
    REACTION_ADDED: 'REACTION_ADDED',
    REACTION_REMOVED: 'REACTION_REMOVED',
    REACTION_CHANGED: 'REACTION_CHANGED',
    REACTIONS_UPDATE: 'REACTIONS_UPDATE',
    VIEWERS_UPDATE: 'VIEWERS_UPDATE',
    EXPIRED_STATUS_CLEANUP: 'EXPIRED_STATUS_CLEANUP'
};

// =============================================
// ENVIRONMENT AUTO-DETECTION SYSTEM
// =============================================
const IframeEnvironment = {
    type: 'UNKNOWN',
    isLocalDev: false,
    isRenderHosted: false,
    isVPNNetwork: false,
    isProduction: false,
    isSandboxed: false,
    isSecure: false,
    latency: 0,
    bandwidth: 0,
    connectionType: 'unknown',
    effectiveType: 'unknown',
    rtt: 0,
    downlink: 0,
    saveData: false,
    
    detect() {
        try {
            const start = performance.now();
            
            const hostname = window.location.hostname;
            const protocol = window.location.protocol;
            const isSecureContext = window.isSecureContext || protocol === 'https:';
            
            this.isLocalDev = (
                hostname === 'localhost' ||
                hostname === '127.0.0.1' ||
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.includes('.local') ||
                hostname.includes('.test') ||
                protocol === 'file:' ||
                hostname.includes('::1')
            );
            
            this.isRenderHosted = (
                hostname.includes('.onrender.com') ||
                hostname.includes('.render.com') ||
                hostname.includes('render.com')
            );
            
            if (navigator.connection) {
                const conn = navigator.connection;
                this.latency = conn.rtt || 0;
                this.bandwidth = conn.downlink || 0;
                this.connectionType = conn.type || 'unknown';
                this.effectiveType = conn.effectiveType || 'unknown';
                this.rtt = conn.rtt || 0;
                this.downlink = conn.downlink || 0;
                this.saveData = conn.saveData || false;
                
                this.isVPNNetwork = (
                    this.latency > 300 ||
                    this.effectiveType === 'slow-2g' ||
                    this.effectiveType === '2g' ||
                    (this.latency > 150 && this.latency < 300 && this.saveData)
                );
            } else {
                const end = performance.now();
                this.latency = end - start;
                this.isVPNNetwork = this.latency > 300;
            }
            
            this.isProduction = (
                !this.isLocalDev &&
                !this.isRenderHosted &&
                isSecureContext &&
                !hostname.includes('.local') &&
                !hostname.includes('.test') &&
                hostname.includes('.')
            );
            
            try {
                this.isSandboxed = (
                    !window.parent ||
                    window.parent === window ||
                    (() => {
                        try {
                            return !window.parent.location;
                        } catch {
                            return true;
                        }
                    })()
                );
            } catch {
                this.isSandboxed = true;
            }
            
            this.isSecure = isSecureContext;
            
            if (this.isLocalDev) this.type = 'LOCAL_DEV';
            else if (this.isRenderHosted) this.type = 'RENDER_HOSTED';
            else if (this.isVPNNetwork) this.type = 'VPN_NETWORK';
            else if (this.isProduction) this.type = 'PRODUCTION';
            else this.type = 'UNKNOWN';
            
            logStatus('INIT', `Environment: ${this.type}`);
            
            return this.type;
        } catch (e) {
            debugError('Environment detection failed:', e);
            this.type = 'UNKNOWN';
            return this.type;
        }
    },
    
    getConfig() {
        const baseConfig = {
            handshakeTimeout: 5000,
            heartbeatInterval: 30000,
            maxRetries: 3,
            maxRecoveryAttempts: 3,
            originChecks: 'standard',
            crypto: 'enabled',
            compatibilityMode: false,
            batchMessages: false,
            keepalive: false,
            offlineBufferSize: 100,
            retryBackoff: 'exponential',
            jitter: true
        };
        
        switch(this.type) {
            case 'LOCAL_DEV':
                return {
                    ...baseConfig,
                    handshakeTimeout: 5000,
                    heartbeatInterval: 30000,
                    maxRetries: 3,
                    maxRecoveryAttempts: 3,
                    originChecks: 'relaxed',
                    crypto: 'disabled',
                    compatibilityMode: true,
                    batchMessages: false,
                    keepalive: false
                };
            case 'RENDER_HOSTED':
                return {
                    ...baseConfig,
                    handshakeTimeout: 8000,
                    heartbeatInterval: 25000,
                    maxRetries: 5,
                    maxRecoveryAttempts: 4,
                    originChecks: 'strict',
                    crypto: 'enabled',
                    compatibilityMode: false,
                    batchMessages: true,
                    keepalive: true
                };
            case 'VPN_NETWORK':
                return {
                    ...baseConfig,
                    handshakeTimeout: 15000,
                    heartbeatInterval: 45000,
                    maxRetries: 7,
                    maxRecoveryAttempts: 5,
                    originChecks: 'standard',
                    crypto: 'enabled',
                    compatibilityMode: false,
                    batchMessages: true,
                    keepalive: true,
                    offlineBufferSize: 200,
                    retryBackoff: 'fibonacci'
                };
            case 'PRODUCTION':
                return {
                    ...baseConfig,
                    handshakeTimeout: 5000,
                    heartbeatInterval: 20000,
                    maxRetries: 3,
                    maxRecoveryAttempts: 2,
                    originChecks: 'strict',
                    crypto: 'enabled',
                    compatibilityMode: false,
                    batchMessages: false,
                    keepalive: false
                };
            default:
                return baseConfig;
        }
    },
    
    getCapabilities() {
        return {
            localStorage: !!window.localStorage,
            sessionStorage: !!window.sessionStorage,
            serviceWorker: 'serviceWorker' in navigator,
            indexedDB: !!window.indexedDB,
            webWorker: !!window.Worker,
            webSocket: !!window.WebSocket,
            webRTC: !!window.RTCPeerConnection,
            crypto: !!window.crypto && !!window.crypto.subtle,
            mediaDevices: !!navigator.mediaDevices,
            geolocation: !!navigator.geolocation,
            notifications: 'Notification' in window,
            bluetooth: !!navigator.bluetooth,
            usb: !!navigator.usb,
            hid: !!navigator.hid,
            serial: !!navigator.serial,
            webShare: !!navigator.share,
            webAssembly: !!window.WebAssembly,
            bigInt: typeof BigInt !== 'undefined',
            webGL: (() => {
                try {
                    const canvas = document.createElement('canvas');
                    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
                } catch {
                    return false;
                }
            })(),
            webGL2: (() => {
                try {
                    const canvas = document.createElement('canvas');
                    return !!canvas.getContext('webgl2');
                } catch {
                    return false;
                }
            })(),
            webAudio: !!window.AudioContext || !!window.webkitAudioContext,
            webMIDI: !!navigator.requestMIDIAccess,
            webUSB: !!navigator.usb,
            webBluetooth: !!navigator.bluetooth,
            webNFC: !!navigator.nfc,
            webXR: !!navigator.xr,
            webVTT: !!window.VTTCue,
            webAnimation: !!document.createElement('div').animate,
            webSpeech: !!window.SpeechRecognition || !!window.webkitSpeechRecognition,
            webPayment: !!window.PaymentRequest,
            webCredentials: !!navigator.credentials,
            webLocks: !!navigator.locks,
            webStorage: !!window.localStorage,
            webDatabase: !!window.openDatabase,
            webSQL: !!window.openDatabase,
            webIndexedDB: !!window.indexedDB,
            webFileSystem: !!window.requestFileSystem || !!window.webkitRequestFileSystem,
            webFileReader: !!window.FileReader,
            webFileWriter: !!window.FileWriter,
            webFile: !!window.File,
            webBlob: !!window.Blob,
            webFormData: !!window.FormData,
            webURL: !!window.URL,
            webURLSearchParams: !!window.URLSearchParams,
            webHeaders: !!window.Headers,
            webRequest: !!window.Request,
            webResponse: !!window.Response,
            webFetch: !!window.fetch,
            webAbortController: !!window.AbortController,
            webAbortSignal: !!window.AbortSignal,
            webIntersectionObserver: !!window.IntersectionObserver,
            webMutationObserver: !!window.MutationObserver,
            webResizeObserver: !!window.ResizeObserver,
            webPerformanceObserver: !!window.PerformanceObserver,
            webReportingObserver: !!window.ReportingObserver,
            webGamepad: !!navigator.getGamepads,
            webBattery: !!navigator.getBattery,
            webVibrate: !!navigator.vibrate,
            webWakeLock: !!navigator.wakeLock,
            webSMS: !!navigator.sms,
            webContacts: !!navigator.contacts,
            webClipboard: !!navigator.clipboard,
            webPermissions: !!navigator.permissions,
            webPresentation: !!navigator.presentation,
            webNetworkInformation: !!navigator.connection,
            webDeviceMemory: !!navigator.deviceMemory,
            webHardwareConcurrency: !!navigator.hardwareConcurrency,
            webMaxTouchPoints: !!navigator.maxTouchPoints,
            webCookieEnabled: navigator.cookieEnabled,
            webDoNotTrack: navigator.doNotTrack,
            webLanguages: !!navigator.languages,
            webPlatform: !!navigator.platform,
            webProduct: !!navigator.product,
            webVendor: !!navigator.vendor
        };
    },
    
    logEnvironment() {
        // Already logged in detect()
    }
};

IframeEnvironment.detect();

// =============================================
// COMPATIBILITY BRIDGE - ENSURES BACKWARD COMPATIBILITY
// =============================================
const CompatibilityBridge = {
    version: '10.0',
    legacyMode: false,
    adapters: new Map(),
    transforms: new Map(),
    fallbacks: new Map(),
    
    initialize() {
        this.legacyMode = IframeEnvironment.type === 'LOCAL_DEV' || IframeEnvironment.isSandboxed;
        this.registerAdapters();
        this.registerTransforms();
        this.registerFallbacks();
        debugLog('CompatibilityBridge initialized, legacyMode:', this.legacyMode);
        return this;
    },
    
    registerAdapters() {
        this.adapters.set('message', {
            toLegacy: (msg) => {
                if (!msg) return msg;
                return {
                    ...msg,
                    type: msg.type || msg.event,
                    data: msg.payload || msg.data,
                    id: msg.id || msg.messageId,
                    timestamp: msg.timestamp || Date.now()
                };
            },
            fromLegacy: (msg) => {
                if (!msg) return msg;
                return {
                    type: msg.type || msg.event,
                    id: msg.id || msg.messageId || genId(),
                    requestId: genReqId(),
                    source: MODULE_NAME,
                    target: 'parent',
                    timestamp: Date.now(),
                    payload: msg.data || msg.payload || {}
                };
            }
        });
        
        this.adapters.set('session', {
            toLegacy: (session) => {
                if (!session) return session;
                return {
                    ...session,
                    user: session.user || session.userData,
                    token: session.token || session.accessToken,
                    refreshToken: session.refreshToken || session.refresh_token
                };
            },
            fromLegacy: (session) => {
                if (!session) return session;
                return {
                    ...session,
                    user: session.user || session.userData,
                    token: session.token || session.accessToken,
                    refreshToken: session.refreshToken || session.refresh_token
                };
            }
        });
        
        this.adapters.set('storage', {
            toLegacy: (key, value) => {
                return { key, value };
            },
            fromLegacy: (key, value) => {
                return { key, value };
            }
        });
    },
    
    registerTransforms() {
        this.transforms.set('handshake', (data) => {
            if (this.legacyMode) {
                return {
                    ...data,
                    protocol: '1.0',
                    handshake: data.handshake || data.handshakeId
                };
            }
            return data;
        });
        
        this.transforms.set('status', (data) => {
            if (this.legacyMode) {
                return {
                    ...data,
                    statusId: data.statusId || data.id,
                    userId: data.userId || data.user?.id
                };
            }
            return data;
        });
        
        this.transforms.set('reaction', (data) => {
            if (this.legacyMode) {
                return {
                    ...data,
                    reactionType: data.reactionType || data.reaction,
                    statusId: data.statusId || data.id
                };
            }
            return data;
        });
    },
    
    registerFallbacks() {
        this.fallbacks.set('postMessage', (target, message, origin) => {
            try {
                if (typeof target.postMessage === 'function') {
                    return target.postMessage(message, origin || '*');
                }
                return false;
            } catch (e) {
                return false;
            }
        });
        
        this.fallbacks.set('storage', {
            get: async (key) => {
                try {
                    return await StorageProxy.get(key);
                } catch {
                    return null;
                }
            },
            set: (key, value) => {
                try {
                    StorageProxy.set(key, value);
                    return true;
                } catch {
                    return false;
                }
            },
            remove: (key) => {
                try {
                    StorageProxy.remove(key);
                    return true;
                } catch {
                    return false;
                }
            }
        });
        
        this.fallbacks.set('fetch', async (url, options) => {
            try {
                return await fetch(url, options);
            } catch (e) {
                throw new Error('Fetch failed in compatibility mode');
            }
        });
    },
    
    adapt(type, data, direction = 'to') {
        const adapter = this.adapters.get(type);
        if (!adapter) return data;
        
        try {
            return direction === 'to' ? adapter.toLegacy(data) : adapter.fromLegacy(data);
        } catch (e) {
            return data;
        }
    },
    
    transform(type, data) {
        const transform = this.transforms.get(type);
        if (!transform) return data;
        
        try {
            return transform(data);
        } catch (e) {
            return data;
        }
    },
    
    fallback(type, ...args) {
        const fallback = this.fallbacks.get(type);
        if (!fallback) return null;
        
        try {
            return typeof fallback === 'function' ? fallback(...args) : fallback;
        } catch (e) {
            return null;
        }
    },
    
    isLegacy() {
        return this.legacyMode;
    }
}.initialize();

// =============================================
// STANDALONE MODE DETECTION
// =============================================
const isStandaloneMode = !window.parent || window.parent === window || !document.referrer;

if (isStandaloneMode && !_loggedMessages.has('standalone')) {
    _loggedMessages.add('standalone');
    debugLog('Running in standalone mode (no parent iframe)');
}

// =============================================
// IFRAME AUTHORITY - CENTRALIZED CONTROL
// =============================================
const IframeAuthority = {
    id: `iframe_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`,
    instanceId: `instance_${Date.now()}_${Math.random().toString(36).substr(2, 15)}`,
    parentOrigin: null,
    parentDetected: false,
    parentCapabilities: new Set(),
    securityLevel: 'standard',
    compatibilityMode: IframeEnvironment.type === 'LOCAL_DEV' || IframeEnvironment.isSandboxed,
    backendDomain: 'https://moodchat-fy56.onrender.com',
    frontendDomain: 'https://moodfronted.onrender.com',
    trustedDomains: new Set([
        'https://moodchat-fy56.onrender.com',
        'https://moodfronted.onrender.com',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://localhost:5000',
        'http://localhost:8080',
        'https://localhost:3000',
        'https://localhost:5500',
        'https://localhost:5000',
        'https://localhost:8080',
        'http://127.0.0.1:3000',
        'http://localhost:4000',
        'http://127.0.0.1:5000',
        'http://127.0.0.1:8080',
        'https://127.0.0.1:3000',
        'https://127.0.0.1:5500',
        'https://127.0.0.1:5000',
        'https://127.0.0.1:8080'
    ]),
    
    initialize() {
        this.detectParent();
        this.validateSecurityContext();
        this.addTrustedDomain(this.backendDomain);
        this.addTrustedDomain(this.frontendDomain);
        debugLog('IframeAuthority initialized');
        return this;
    },
    
    detectParent() {
        try {
            this.parentDetected = !!(window.parent && window.parent !== window);
            if (this.parentDetected && document.referrer) {
                try {
                    this.parentOrigin = new URL(document.referrer).origin;
                    this.addTrustedDomain(this.parentOrigin);
                    debugLog('Parent detected from referrer:', this.parentOrigin);
                } catch {}
            }
        } catch (e) {
            this.parentDetected = false;
        }
    },
    
    validateSecurityContext() {
        if (this.compatibilityMode || IframeEnvironment.isSandboxed) {
            this.securityLevel = 'compatibility';
        } else if (IframeEnvironment.type === 'PRODUCTION') {
            this.securityLevel = 'strict';
        } else {
            this.securityLevel = 'standard';
        }
    },
    
    addTrustedDomain(domain) {
        if (domain) {
            this.trustedDomains.add(domain);
        }
    },
    
    isTrustedOrigin(origin) {
        if (!origin) return false;
        if (this.securityLevel === 'compatibility') return true;
        
        if (this.trustedDomains.has(origin)) return true;
        
        if (origin.includes('.onrender.com') || origin.includes('.render.com')) return true;
        
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) return true;
        
        if (this.parentOrigin && origin === this.parentOrigin) return true;
        
        return false;
    },
    
    getCapabilities() {
        return Array.from(this.parentCapabilities);
    },
    
    getBackendURL(path = '') {
        return `${this.backendDomain}${path}`;
    },
    
    getFrontendURL(path = '') {
        return `${this.frontendDomain}${path}`;
    }
}.initialize();

// =============================================
// DIAGNOSTICS AGENT - TELEMETRY & DEBUGGING
// =============================================
const DiagnosticsAgent = {
    enabled: true,
    reports: [],
    maxReports: 100,
    metrics: {
        startTime: Date.now(),
        messagesSent: 0,
        messagesReceived: 0,
        errors: 0,
        warnings: 0,
        handshakeAttempts: 0,
        handshakeSuccess: 0,
        handshakeFailures: 0,
        recoveryAttempts: 0,
        recoverySuccess: 0,
        recoveryFailures: 0,
        tokenRefreshes: 0,
        apiCalls: 0,
        apiErrors: 0,
        storageReads: 0,
        storageWrites: 0,
        storageErrors: 0,
        offlineOperations: 0,
        statusViews: 0,
        statusReactions: 0,
        statusPosts: 0,
        statusExpired: 0,
        sessionRequests: 0,
        sessionSuccess: 0,
        sessionFailures: 0,
        lifecycleTransitions: 0,
        invalidTransitions: 0,
        blockedActions: 0
    },
    events: [],
    maxEvents: 1000,
    
    enable() {
        this.enabled = true;
        debugLog('Diagnostics enabled');
    },
    
    disable() {
        this.enabled = false;
    },
    
    log(level, module, message, data = null) {
        if (!this.enabled && level !== 'error') return;
        
        const entry = {
            timestamp: Date.now(),
            level,
            module,
            message,
            data: this.sanitize(data),
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
        };
        
        this.events.push(entry);
        
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }
        
        if (level === 'error') {
            this.metrics.errors++;
        } else if (level === 'warn') {
            this.metrics.warnings++;
        }
    },
    
    sanitize(data) {
        if (!data || typeof data !== 'object') return data;
        
        try {
            return JSON.parse(JSON.stringify(data, (key, value) => {
                if (key === 'token' || key === 'accessToken' || key === 'refreshToken') {
                    return '[REDACTED]';
                }
                if (typeof value === 'string' && value.length > 1000) {
                    return value.substring(0, 1000) + '... [truncated]';
                }
                return value;
            }));
        } catch {
            return data;
        }
    },
    
    error(module, message, data) {
        this.log('error', module, message, data);
    },
    
    warn(module, message, data) {
        this.log('warn', module, message, data);
    },
    
    info(module, message, data) {
        this.log('info', module, message, data);
    },
    
    debug(module, message, data) {
        this.log('debug', module, message, data);
    },
    
    increment(metric) {
        if (this.metrics[metric] !== undefined) {
            this.metrics[metric]++;
        }
    },
    
    getReport() {
        return {
            timestamp: Date.now(),
            uptime: Date.now() - this.metrics.startTime,
            metrics: { ...this.metrics },
            recentEvents: this.events.slice(-20),
            environment: {
                type: IframeEnvironment.type,
                isLocalDev: IframeEnvironment.isLocalDev,
                isRenderHosted: IframeEnvironment.isRenderHosted,
                isVPNNetwork: IframeEnvironment.isVPNNetwork,
                isProduction: IframeEnvironment.isProduction,
                isSandboxed: IframeEnvironment.isSandboxed,
                latency: IframeEnvironment.latency,
                connectionType: IframeEnvironment.connectionType
            },
            authority: {
                id: IframeAuthority.id,
                instanceId: IframeAuthority.instanceId,
                parentDetected: IframeAuthority.parentDetected,
                parentOrigin: IframeAuthority.parentOrigin,
                securityLevel: IframeAuthority.securityLevel,
                compatibilityMode: IframeAuthority.compatibilityMode
            },
            lifecycle: getLifecycleState()
        };
    },
    
    clear() {
        this.events = [];
        this.metrics = {
            startTime: Date.now(),
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0,
            warnings: 0,
            handshakeAttempts: 0,
            handshakeSuccess: 0,
            handshakeFailures: 0,
            recoveryAttempts: 0,
            recoverySuccess: 0,
            recoveryFailures: 0,
            tokenRefreshes: 0,
            apiCalls: 0,
            apiErrors: 0,
            storageReads: 0,
            storageWrites: 0,
            storageErrors: 0,
            offlineOperations: 0,
            statusViews: 0,
            statusReactions: 0,
            statusPosts: 0,
            statusExpired: 0,
            sessionRequests: 0,
            sessionSuccess: 0,
            sessionFailures: 0,
            lifecycleTransitions: 0,
            invalidTransitions: 0,
            blockedActions: 0
        };
    }
};

// =============================================
// LOGGING SYSTEM - STRUCTURED, NO DUPLICATES
// =============================================
const LOG_LEVEL = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

let currentLogLevel = LOG_LEVEL.DEBUG;
const errorCache = new Set();
const warningCache = new Set();

function log(level, module, message, data = null) {
    try {
        if (level < currentLogLevel) return;
        
        if (level === LOG_LEVEL.ERROR) {
            const key = `${module}:${message}`;
            if (!errorCache.has(key)) {
                errorCache.add(key);
                DiagnosticsAgent.error(module, message, data);
                setTimeout(() => errorCache.delete(key), 60000);
            }
        } else if (level === LOG_LEVEL.WARN) {
            const key = `${module}:${message}`;
            if (!warningCache.has(key)) {
                warningCache.add(key);
                DiagnosticsAgent.warn(module, message, data);
                setTimeout(() => warningCache.delete(key), 30000);
            }
        }
    } catch (e) {}
}

// =============================================
// SAFE STORAGE LAYER - USES STORAGE PROXY
// =============================================
const SafeStorage = {
    memoryStore: new Map(),
    storageAvailable: false,
    storageType: 'proxy',
    quota: 5 * 1024 * 1024,
    used: 0,
    
    initialize() {
        this.checkAvailability();
        this.calculateUsage();
        debugLog('SafeStorage initialized, available:', this.storageAvailable, 'type:', this.storageType);
        return this;
    },
    
    checkAvailability() {
        try {
            this.storageAvailable = true;
            this.storageType = 'proxy';
        } catch (e) {
            this.storageAvailable = false;
            this.storageType = 'memory';
        }
    },
    
    calculateUsage() {
        if (!this.storageAvailable || this.storageType === 'memory') return 0;
        return 0;
    },
    
    hasQuota(size) {
        return this.used + size <= this.quota;
    },
    
    async get(key, fallback = null) {
        DiagnosticsAgent.increment('storageReads');
        
        if (this.storageAvailable && this.storageType === 'proxy') {
            try {
                const value = await StorageProxy.get(key);
                if (value !== null && value !== undefined) return value;
            } catch (e) {
                DiagnosticsAgent.increment('storageErrors');
                debugWarn(`Storage get failed for ${key}:`, e.message);
            }
        }
        
        return this.memoryStore.has(key) ? this.memoryStore.get(key) : fallback;
    },
    
    set(key, value) {
        DiagnosticsAgent.increment('storageWrites');
        
        let success = false;
        const size = (key.length + (value ? value.length : 0)) * 2;
        
        if (this.storageAvailable && this.storageType === 'proxy') {
            try {
                StorageProxy.set(key, String(value));
                this.used += size;
                success = true;
            } catch (e) {
                DiagnosticsAgent.increment('storageErrors');
                debugWarn(`Storage set failed for ${key}:`, e.message);
            }
        }
        
        this.memoryStore.set(key, String(value));
        return success;
    },
    
    remove(key) {
        if (this.storageAvailable && this.storageType === 'proxy') {
            try {
                StorageProxy.remove(key);
                this.used -= (key.length + (this.memoryStore.get(key)?.length || 0)) * 2;
            } catch (e) {
                // Silent error
            }
        }
        this.memoryStore.delete(key);
    },
    
    async getJSON(key, fallback = null) {
        const value = await this.get(key);
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
        
        if (this.storageAvailable && this.storageType === 'proxy') {
            try {
                StorageProxy.clear();
                this.used = 0;
            } catch (e) {}
        }
    },
    
    async keys() {
        const keys = new Set();
        
        this.memoryStore.forEach((_, key) => keys.add(key));
        return Array.from(keys);
    },
    
    size() {
        return this.memoryStore.size;
    }
}.initialize();

// =============================================
// ORIGIN TRUST ADAPTER - DYNAMIC TRUST EVALUATION
// =============================================
const OriginTrustAdapter = {
    trustedOrigins: new Set(),
    blockedOrigins: new Set(),
    dynamicTrustCache: new Map(),
    trustLevel: 'standard',
    parentOrigin: null,
    backendDomain: 'https://moodchat-fy56.onrender.com',
    frontendDomain: 'https://moodfronted.onrender.com',
    
    initialize() {
        this.loadBuiltinTrustedOrigins();
        this.setTrustLevelFromEnvironment();
        this.addTrustedOrigin(this.backendDomain);
        this.addTrustedOrigin(this.frontendDomain);
        debugLog('OriginTrustAdapter initialized, trustLevel:', this.trustLevel);
        return this;
    },
    
    loadBuiltinTrustedOrigins() {
        const builtin = [
            window.location.origin,
            'http://localhost',
            'http://127.0.0.1',
            'https://localhost',
            'https://127.0.0.1',
            'http://localhost:3000',
            'http://localhost:5500',
            'http://localhost:5000',
            'http://localhost:8080',
            'https://localhost:3000',
            'https://localhost:5500',
            'https://localhost:5000',
            'https://localhost:8080',
            'http://127.0.0.1:3000',
            'http://localhost:4000',
            'http://127.0.0.1:5000',
            'http://127.0.0.1:8080',
            'https://127.0.0.1:3000',
            'https://127.0.0.1:5500',
            'https://127.0.0.1:5000',
            'https://127.0.0.1:8080',
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com'
        ];
        
        builtin.forEach(origin => this.trustedOrigins.add(origin));
        
        this.trustedOrigins.add('https://*.onrender.com');
        this.trustedOrigins.add('https://*.render.com');
    },
    
    setTrustLevelFromEnvironment() {
        if (IframeEnvironment.type === 'LOCAL_DEV' || IframeAuthority.compatibilityMode) {
            this.trustLevel = 'relaxed';
        } else if (IframeEnvironment.type === 'PRODUCTION') {
            this.trustLevel = 'strict';
        } else {
            this.trustLevel = 'standard';
        }
    },
    
    isTrusted(origin) {
        if (!origin) return false;
        
        if (this.dynamicTrustCache.has(origin)) {
            return this.dynamicTrustCache.get(origin);
        }
        
        if (this.blockedOrigins.has(origin)) {
            this.dynamicTrustCache.set(origin, false);
            return false;
        }
        
        if (this.trustedOrigins.has(origin)) {
            this.dynamicTrustCache.set(origin, true);
            return true;
        }
        
        for (const trusted of this.trustedOrigins) {
            if (trusted.includes('*')) {
                const pattern = trusted.replace(/\*/g, '[^.]+').replace(/\./g, '\\.');
                const regex = new RegExp(`^${pattern}$`);
                if (regex.test(origin)) {
                    this.dynamicTrustCache.set(origin, true);
                    return true;
                }
            }
        }
        
        for (const trusted of this.trustedOrigins) {
            if (!trusted.includes('*') && origin.endsWith(trusted.replace(/^https?:\/\//, ''))) {
                this.dynamicTrustCache.set(origin, true);
                return true;
            }
        }
        
        if (this.trustLevel === 'relaxed') {
            try {
                const originHostname = new URL(origin).hostname;
                const currentHostname = window.location.hostname;
                
                if (originHostname === currentHostname ||
                    originHostname.endsWith('.' + currentHostname) ||
                    currentHostname.endsWith('.' + originHostname)) {
                    this.dynamicTrustCache.set(origin, true);
                    return true;
                }
            } catch {}
        }
        
        if (this.parentOrigin && origin === this.parentOrigin) {
            this.dynamicTrustCache.set(origin, true);
            return true;
        }
        
        const trusted = this.trustLevel === 'relaxed' || 
                       (this.trustLevel === 'standard' && origin.startsWith('https://'));
        
        this.dynamicTrustCache.set(origin, trusted);
        return trusted;
    },
    
    addTrustedOrigin(origin) {
        if (origin) {
            this.trustedOrigins.add(origin);
            this.dynamicTrustCache.delete(origin);
        }
    },
    
    blockOrigin(origin) {
        if (origin) {
            this.blockedOrigins.add(origin);
            this.dynamicTrustCache.delete(origin);
        }
    },
    
    setParentOrigin(origin) {
        if (origin) {
            this.parentOrigin = origin;
            this.addTrustedOrigin(origin);
        }
    },
    
    validateMessageOrigin(origin) {
        if (!origin) return false;
        if (this.trustLevel === 'relaxed' && !origin.includes('chrome-extension')) return true;
        return this.isTrusted(origin);
    },
    
    getTrustLevel() {
        return this.trustLevel;
    },
    
    reset() {
        this.dynamicTrustCache.clear();
        this.blockedOrigins.clear();
    }
}.initialize();

// =============================================
// MESSAGE BUS - CENTRALIZED COMMUNICATION
// =============================================
const MessageBus = {
    channels: new Map(),
    messageQueue: [],
    processing: false,
    maxQueueSize: 100,
    messageCounter: 0,
    pendingAcks: new Map(),
    messageHandlers: new Map(),
    history: new Map(),
    maxHistory: 100,
    
    createChannel(channelName) {
        if (!this.channels.has(channelName)) {
            this.channels.set(channelName, {
                subscribers: new Set(),
                messageHistory: []
            });
        }
        return this.channels.get(channelName);
    },
    
    subscribe(channelName, handler) {
        const channel = this.createChannel(channelName);
        channel.subscribers.add(handler);
        
        return () => {
            channel.subscribers.delete(handler);
        };
    },
    
    publish(channelName, message) {
        const channel = this.channels.get(channelName);
        if (!channel) return;
        
        const messageId = ++this.messageCounter;
        const enrichedMessage = {
            ...message,
            messageId,
            timestamp: Date.now(),
            channel: channelName,
            source: 'message-bus',
            busId: `bus_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
        };
        
        channel.messageHistory.push(enrichedMessage);
        if (channel.messageHistory.length > 50) {
            channel.messageHistory.shift();
        }
        
        if (!this.history.has(channelName)) {
            this.history.set(channelName, []);
        }
        const history = this.history.get(channelName);
        history.push(enrichedMessage);
        if (history.length > this.maxHistory) {
            history.shift();
        }
        
        channel.subscribers.forEach(handler => {
            try {
                handler(enrichedMessage);
            } catch (e) {}
        });
    },
    
    request(channelName, message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const responseChannel = `${channelName}_response_${requestId}`;
            
            const timeoutId = setTimeout(() => {
                this.unsubscribe(responseChannel, responseHandler);
                reject(new Error(`Request timeout on channel ${channelName}`));
            }, timeout);
            
            const responseHandler = (response) => {
                clearTimeout(timeoutId);
                this.unsubscribe(responseChannel, responseHandler);
                resolve(response);
            };
            
            this.subscribe(responseChannel, responseHandler);
            this.publish(channelName, {
                ...message,
                requestId,
                responseChannel
            });
        });
    },
    
    addMessageHandler(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, new Set());
        }
        this.messageHandlers.get(type).add(handler);
    },
    
    removeMessageHandler(type, handler) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            handlers.delete(handler);
        }
    },
    
    processMessage(message) {
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message);
                } catch (e) {}
            });
        }
    },
    
    getHistory(channelName) {
        return this.history.get(channelName) || [];
    },
    
    clearHistory() {
        this.history.clear();
        this.channels.forEach(channel => {
            channel.messageHistory = [];
        });
    }
};

// =============================================
// PARENT READY PROMISE - EVENT-DRIVEN WAITING
// =============================================
let _parentReadyResolver = null;
let _parentReadyRejecter = null;
const _parentReadyPromise = new Promise((resolve, reject) => {
    _parentReadyResolver = resolve;
    _parentReadyRejecter = reject;
});

// =============================================
// PARENT MESSAGE HANDLER - PROTOCOL-COMPLIANT
// =============================================
function handleParentMessage(event) {
    // Process message asynchronously to avoid blocking
    setTimeout(() => {
        try {
            const msg = event.data;

            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'STORAGE_RESULT') {
                StorageProxy.handleResponse(event);
                return;
            }

            if (msg.id && isDuplicateMessage(msg.id)) {
                const dupKey = `duplicate_${msg.type}_${msg.id}`;
                if (!_loggedMessages.has(dupKey)) {
                    _loggedMessages.add(dupKey);
                    debugLog(`Duplicate message ignored: ${msg.type} (${msg.id})`);
                }
                return;
            }

            if (!OriginTrustAdapter.validateMessageOrigin(event.origin)) {
                debugWarn(`Message from untrusted origin ignored: ${event.origin}`);
                return;
            }

            if (!MessageValidator.validate(msg).valid) {
                debugWarn(`Invalid message schema: ${msg.type}`);
                return;
            }

            DiagnosticsAgent.increment('messagesReceived');

            // Handle PARENT_READY
            if (msg.type === 'PARENT_READY') {
                // console.log('[status] 📥 PARENT_READY received via direct handler');
                handleParentReady(msg);
                return;
            }

            // Handle AUTH_READY directly
if (msg.type === 'AUTH_READY') {
    // console.log('[status] 📥 AUTH_READY received via direct handler');
    
    const payload = msg.payload || {};
    const sessionData = payload.session || payload;
    
    if (sessionData && __isValidSession(sessionData)) {
        if (!__isDuplicateSession(sessionData)) {
            handleSession(sessionData);
            __storeValidSessionId(sessionData);
            logStatus('SUCCESS', 'Session applied from AUTH_READY');
        } else {
            logStatus('WARNING', 'Duplicate session data in AUTH_READY ignored');
        }
    }
    
    // Mark parent as ready
    parentReady = true;
    _parentReady = true;
    
    // Check BOTH state machines (legacy currentState and new _currentState)
    const isInWaitParent = (currentState === LIFECYCLE_STATES.WAIT_PARENT) || 
                           (typeof _currentState !== 'undefined' && _currentState === LifecycleState.WAIT_PARENT);
    
    // If we're in WAIT_PARENT, transition to ACTIVE
    if (isInWaitParent) {
        if (isSessionReady() && __isValidSession({ token: _sessionToken, userId: _sessionUser?.id || _sessionUser?.userId })) {
            // Transition BOTH state machines
            transitionTo(LIFECYCLE_STATES.ACTIVE, 'auth_ready_with_valid_session');
            if (typeof transitionTo === 'function' && LifecycleState && LifecycleState.ACTIVE) {
                try {
                    if (typeof _currentState !== 'undefined' && _currentState !== LifecycleState.ACTIVE) {
                        // Call the second state machine's transition if it exists
                        if (typeof window.transitionTo === 'function') window.transitionTo(LifecycleState.ACTIVE, 'auth_ready');
                    }
                } catch(e) {}
            }
            flushQueue();
            
            if (parentReadyResolver) {
                parentReadyResolver({ type: 'AUTH_READY', timestamp: Date.now() });
            }
        }
    }
    return;
}

            // Handle SESSION_DATA
            if (msg.type === 'SESSION_DATA') {
                if (msg.payload && __isValidSession(msg.payload)) {
                    if (!__isDuplicateSession(msg.payload)) {
                        handleSession(msg.payload);
                        __storeValidSessionId(msg.payload);
                    } else {
                        logStatus('WARNING', 'Duplicate SESSION_DATA ignored');
                    }
                } else {
                    logStatus('FAILED', 'Invalid SESSION_DATA received - rejected');
                }
                return;
            }

            // Handle MODULE_REGISTERED
            if (msg.type === 'MODULE_REGISTERED') {
                if (msg.payload?.moduleName === MODULE_NAME) {
                    const moduleKey = 'module_registered';
                    if (!_loggedMessages.has(moduleKey)) {
                        _loggedMessages.add(moduleKey);
                        logStatus('SUCCESS', 'Module registered');
                    }
                }
                return;
            }

            // Handle HEARTBEAT
            if (msg.type === 'HEARTBEAT') {
                sendHeartbeatAck(msg.id);
                return;
            }
            
            // Handle API_RESPONSE
            if (msg.type === 'API_RESPONSE') {
                handleApiResponse(msg);
                return;
            }
            
            // Handle STATUS_UPDATE
            if (msg.type === 'STATUS_UPDATE') {
                const status = msg.payload || msg;
                if (status && status.id) {
                    if (status.deleted) {
                        removeStatus(status.id);
                    } else {
                        addStatus(status);
                    }
                }
                return;
            }

            // ── SETTINGS: Apply per-key or full-settings changes immediately ──
            if (msg.type === 'SETTING_CHANGED' || msg.type === 'SETTINGS_UPDATED') {
                const payload = msg.payload || msg.data || {};
                if (msg.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
                    const { section, key, value } = payload;
                    if (typeof applySettingToStatusModule === 'function') {
                        applySettingToStatusModule(section, key, value);
                    }
                    window.dispatchEvent(new CustomEvent('settingChanged', { detail: { section, key, value, timestamp: Date.now() } }));
                    if (typeof EventBus !== 'undefined' && EventBus.emit) EventBus.emit('settingChanged', { section, key, value });
                }
                if (msg.type === 'SETTINGS_UPDATED' && payload.settings) {
                    const s = payload.settings;
                    if (typeof applySettingToStatusModule === 'function') {
                        Object.entries(s).forEach(([sec, secVal]) => {
                            if (secVal && typeof secVal === 'object')
                                Object.entries(secVal).forEach(([k, v]) => applySettingToStatusModule(sec, k, v));
                        });
                    }
                    if (typeof SafeStorage !== 'undefined') SafeStorage.setJSON('user_settings', s);
                    window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { settings: s, timestamp: Date.now() } }));
                    if (typeof EventBus !== 'undefined' && EventBus.emit) EventBus.emit('settingsUpdated', { settings: s });
                }
                return;
            }

            // Pass to ParentCommunication if needed
            if (typeof ParentCommunication !== 'undefined') {
                ParentCommunication.handleParentMessage(msg);
            }

            // Handle any registered message handlers
            const handlers = messageHandlers.get(msg.type) || [];
            for (const handler of handlers) {
                try {
                    handler(msg, event.origin);
                } catch (e) {
                    debugError(`Handler error for ${msg.type}:`, e);
                }
            }

        } catch (error) {
            debugError('Error handling parent message:', error);
        }
    }, 0);
}

// =============================================
// MESSAGE HANDLER REGISTRATION - DEFINED ONCE
// =============================================
const messageHandlers = new Map();

function addMessageHandler(type, handler) {
    if (!messageHandlers.has(type)) {
        messageHandlers.set(type, []);
    }
    messageHandlers.get(type).push(handler);
}

// Register all message handlers
addMessageHandler('ACK', (message) => {});

addMessageHandler('STATUS', (message) => {
    document.dispatchEvent(new CustomEvent('statusUpdate', {
        detail: message.payload
    }));
});

addMessageHandler('ERROR', (message) => {
    const errorKey = `parent_error_${message.payload?.error || 'unknown'}`;
    if (!_loggedMessages.has(errorKey)) {
        _loggedMessages.add(errorKey);
        logStatus('FAILED', `Error from parent: ${message.payload?.error || 'Unknown error'}`);
    }
});

addMessageHandler('DATA', (message) => {
    document.dispatchEvent(new CustomEvent('coreData', {
        detail: message.payload
    }));
});

addMessageHandler('HANDSHAKE_RESPONSE', (message) => {
    if (typeof HandshakeClient !== 'undefined') HandshakeClient.handleResponse(message);
});

addMessageHandler('SESSION', (message) => {
    if (typeof HandshakeClient !== 'undefined') HandshakeClient.handleSessionInit(message);
});

addMessageHandler('SESSION_DATA', (message) => {
    if (message.payload && __isValidSession(message.payload)) {
        if (typeof HandshakeClient !== 'undefined') HandshakeClient.handleSessionInit(message);
    }
});

addMessageHandler('SESSION_UPDATE', (message) => {
    const payload = message.payload || message.data || {};
    if (__isValidSession(payload)) {
        if (typeof updateSessionMirror !== 'undefined') updateSessionMirror(payload, 'session_update');
    }
});

addMessageHandler('SESSION_ACTIVE', (message) => {
    const payload = message.payload || message.data || {};
    if (__isValidSession(payload)) {
        if (typeof updateSessionMirror !== 'undefined') updateSessionMirror(payload, 'session_active');
    }
});

addMessageHandler('AUTH_VALIDATED', (message) => {
    const payload = message.payload || message.data || {};
    if (payload.success) {
        if (typeof isTokenReady !== 'undefined') {
            isTokenReady = true;
            if (typeof triggerTokenReadyCallbacks !== 'undefined') {
                triggerTokenReadyCallbacks();
            }
        }
        const authKey = 'auth_validated';
        if (!_loggedMessages.has(authKey)) {
            _loggedMessages.add(authKey);
            logStatus('SUCCESS', 'Auth validated');
        }
    }
});

addMessageHandler('PARENT_READY', (message) => {
    // console.log('[status] 📥 PARENT_READY via registered handler');
    handleParentReady(message);
});

addMessageHandler('AUTH_READY', (message) => {
    // console.log('[status] 📥 AUTH_READY via registered handler');
    
    const payload = message.payload || message.data || {};
    const sessionData = payload.session || payload;
    
    if (sessionData && __isValidSession(sessionData)) {
        if (!__isDuplicateSession(sessionData)) {
            handleSession(sessionData);
            __storeValidSessionId(sessionData);
            logStatus('SUCCESS', 'Session applied from AUTH_READY (registered handler)');
        } else {
            logStatus('WARNING', 'Duplicate session data in AUTH_READY ignored');
        }
    }
    
    // Mark parent as ready
    parentReady = true;
    _parentReady = true;
    
    // If we're in READY state (haven't sent CHILD_READY yet), send it now
    if (isInState(LifecycleState.READY)) {
        logStatus('LIFECYCLE', 'AUTH_READY received in READY - sending CHILD_READY');
        sendChildReady();
    } else if (isInState(LifecycleState.WAIT_PARENT)) {
        logStatus('LIFECYCLE', 'AUTH_READY received in WAIT_PARENT - activating');
        
        // If we have a valid session, transition to ACTIVE
        if (isSessionReady() && __isValidSession({ token: _sessionToken, userId: _sessionUser?.id || _sessionUser?.userId })) {
            transitionTo(LifecycleState.ACTIVE, 'auth_ready_with_valid_session');
            flushQueue();
            
            if (parentReadyResolver) {
                parentReadyResolver({ type: 'AUTH_READY', timestamp: Date.now() });
            }
        }
    }
});

addMessageHandler('MODULE_REGISTERED', (message) => {
    if (message.payload?.moduleName === MODULE_NAME) {
        if (typeof ParentCommunication !== 'undefined') ParentCommunication.moduleRegistered = true;
    }
});

addMessageHandler('HEARTBEAT', (message) => {
    if (typeof ParentCommunication !== 'undefined') ParentCommunication.sendHeartbeatAck(message.id);
});

addMessageHandler('LOGOUT', (message) => {
    if (typeof handleLogout !== 'undefined') handleLogout(message.payload);
});

addMessageHandler('API_RESPONSE', (message) => {
    if (typeof handleApiResponse !== 'undefined') handleApiResponse(message); // pass full message
});

addMessageHandler('API_ERROR', (message) => {
    if (typeof handleApiError !== 'undefined') handleApiError(message.payload);
});

addMessageHandler('PONG', (message) => {
    if (typeof state !== 'undefined') {
        if (typeof state.lastHeartbeatReceived !== 'undefined') state.lastHeartbeatReceived = Date.now();
        if (typeof state.heartbeatFailures !== 'undefined') state.heartbeatFailures = 0;
    }
});

addMessageHandler('PAGE_ACTIVATED', (message) => {
    if (typeof state !== 'undefined') {
        if (typeof state.pageActivated !== 'undefined') state.pageActivated = true;
    }
    
    const pageKey = 'page_activated_handler';
    if (!_loggedMessages.has(pageKey)) {
        _loggedMessages.add(pageKey);
        logStatus('INFO', 'Page activated');
    }
    
    if (typeof loadFreshDataInBackground !== 'undefined' && isInState(LifecycleState.ACTIVE)) {
        setTimeout(() => {
            if (typeof loadFreshDataInBackground !== 'undefined') loadFreshDataInBackground();
        }, 100);
    }
    
    document.dispatchEvent(new CustomEvent('pageActivated', {
        detail: { timestamp: Date.now() }
    }));
});

addMessageHandler('NAVIGATE', (message) => {
    if (message.payload && message.payload.path) {
        document.dispatchEvent(new CustomEvent('navigate', {
            detail: message.payload
        }));
    }
});

addMessageHandler('CAPABILITY_RESPONSE', (message) => {
    if (message.payload && Array.isArray(message.payload.capabilities)) {
        message.payload.capabilities.forEach(cap => {
            if (typeof state !== 'undefined') {
                if (typeof state.parentCapabilities !== 'undefined') state.parentCapabilities.add(cap);
            }
            if (typeof IframeAuthority !== 'undefined') IframeAuthority.parentCapabilities.add(cap);
        });
    }
});

addMessageHandler('TOKEN_REFRESH_RESPONSE', (message) => {
    if (message.payload && message.payload.token) {
        if (typeof state !== 'undefined') {
            if (typeof state.token !== 'undefined') state.token = message.payload.token;
        }
        if (typeof setSession !== 'undefined') setSession(message.payload.token, state?.user, state?.sessionExpiry);
        
        if (message.payload.refreshToken && typeof state !== 'undefined') {
            if (typeof state.sessionMirror !== 'undefined') state.sessionMirror.refreshToken = message.payload.refreshToken;
        }
    }
});

addMessageHandler('ORIGIN_VALIDATION_RESPONSE', (message) => {
    if (message.payload && message.payload.valid && typeof state !== 'undefined') {
        if (typeof state.securityContext !== 'undefined') state.securityContext.originValidated = true;
    }
});

addMessageHandler('CONFIG_RESPONSE', (message) => {
    if (message.payload && message.payload.config) {
        if (typeof applyParentConfig !== 'undefined') applyParentConfig(message.payload.config);
    }
});

addMessageHandler('RECOVERY_RESPONSE', (message) => {
    if (message.payload && message.payload.success && typeof state !== 'undefined') {
        if (typeof state.metrics !== 'undefined') state.metrics.successfulRecoveries++;
    }
});

addMessageHandler('IFRAME_REGISTERED', (message) => {
    if (message.payload && message.payload.module === 'status') {
        // Acknowledgment received
        logStatus('SUCCESS', 'IFRAME_REGISTERED received');
    }
});

// =============================================
// RECOVERY MANAGER - PASSIVE, WAITS FOR PARENT
// =============================================
const RecoveryManager = {
    recoveryAttempts: 0,
    maxRecoveryAttempts: 2,
    recoveryInProgress: false,
    lastRecoveryTime: null,
    recoveryStrategies: new Map(),
    recoveryHistory: [],
    
    initialize() {
        this.registerStrategies();
        debugLog('RecoveryManager initialized');
        return this;
    },
    
    registerStrategies() {
        this.recoveryStrategies.set('handshake', this.recoverHandshake.bind(this));
        this.recoveryStrategies.set('session', this.recoverSession.bind(this));
        this.recoveryStrategies.set('connection', this.recoverConnection.bind(this));
        this.recoveryStrategies.set('token', this.recoverToken.bind(this));
        this.recoveryStrategies.set('storage', this.recoverStorage.bind(this));
        this.recoveryStrategies.set('ui', this.recoverUI.bind(this));
    },
    
    async recover(problem, context = {}) {
        if (this.recoveryInProgress) {
            return { success: false, reason: 'Recovery already in progress' };
        }
        
        if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
            debugWarn('Max recovery attempts reached, entering passive waiting');
            return { success: false, reason: 'Max attempts exceeded' };
        }
        
        this.recoveryAttempts++;
        this.recoveryInProgress = true;
        this.lastRecoveryTime = Date.now();
        
        const strategy = this.recoveryStrategies.get(problem);
        if (!strategy) {
            this.recoveryInProgress = false;
            return { success: false, reason: 'No recovery strategy' };
        }
        
        try {
            const result = await strategy(context);
            
            this.recoveryHistory.push({
                problem,
                attempt: this.recoveryAttempts,
                success: result.success,
                timestamp: Date.now()
            });
            
            this.recoveryInProgress = false;
            return result;
        } catch (error) {
            this.recoveryInProgress = false;
            return { success: false, error: error.message };
        }
    },
    
    async recoverHandshake(context) {
        if (!parentReady && !_parentReadyReceived) {
            return { success: true, waiting: true };
        }
        return { success: false };
    },
    
    async recoverSession(context) {
        if (isSessionReady()) {
            return { success: true, valid: true };
        }
        return { success: false };
    },
    
    async recoverConnection(context) {
        return { success: true, waiting: true };
    },
    
    async recoverToken(context) {
        return { success: false };
    },
    
    async recoverStorage(context) {
        try {
            SafeStorage.initialize();
            return { success: true };
        } catch (error) {}
        return { success: false };
    },
    
    async recoverUI(context) {
        if (typeof window !== 'undefined') {
            document.dispatchEvent(new CustomEvent('uiRecovery', {
                detail: { timestamp: Date.now() }
            }));
        }
        return { success: true };
    },
    
    canRecover() {
        return this.recoveryAttempts < this.maxRecoveryAttempts && !this.recoveryInProgress;
    },
    
    reset() {
        this.recoveryAttempts = 0;
        this.recoveryInProgress = false;
        this.recoveryHistory = [];
    },
    
    getHistory() {
        return [...this.recoveryHistory];
    }
}.initialize();

// =============================================
// MESSAGE FIREWALL & PARSER
// =============================================
const MessageFirewall = {
    validators: new Map(),
    replayCache: new Set(),
    maxCacheSize: 1000,
    sequenceTracker: new Map(),
    
    init() {
        this.registerValidators();
        debugLog('MessageFirewall initialized');
        return this;
    },
    
    registerValidators() {
        this.validators.set('SESSION_DATA', (msg) => {
            return msg.payload && 
                   (msg.payload.token || msg.payload.user) &&
                   (!msg.payload.token || typeof msg.payload.token === 'string') &&
                   (!msg.payload.user || msg.payload.user.id || msg.payload.user.userId);
        });
        
        this.validators.set('PARENT_READY', (msg) => {
            // FIX: parent sends payload without timestamp; accept any payload or just a type match
            return !!msg.type;
        });
        
        this.validators.set('MODULE_REGISTERED', (msg) => {
            return msg.payload && msg.payload.moduleName;
        });
        
        this.validators.set('HEARTBEAT', (msg) => {
            return msg.payload && msg.payload.timestamp;
        });
        
        this.validators.set('HEARTBEAT_ACK', (msg) => {
            return msg.payload?.inResponseTo || msg.inResponseTo;
        });
        
        this.validators.set('SESSION_ACTIVE', (msg) => {
            return msg.payload && 
                   (msg.payload.sessionId || msg.payload.token || msg.payload.user);
        });
        
        this.validators.set('STATUS_POSTED', (msg) => {
            return msg.payload && msg.payload.status && msg.payload.status.id;
        });
        
        this.validators.set('STATUS_VIEWED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId;
        });
        
        this.validators.set('STATUS_REACTED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId && msg.payload.emoji;
        });
        
        this.validators.set('STATUS_EXPIRED', (msg) => {
            return msg.payload && msg.payload.statusId;
        });
        
        this.validators.set('VIEWER_TRACKED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.viewerCount !== undefined;
        });
        
        this.validators.set('REACTION_ADDED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId && msg.payload.emoji;
        });
        
        this.validators.set('REACTION_REMOVED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId && msg.payload.emoji;
        });
        
        this.validators.set('REACTION_CHANGED', (msg) => {
            return msg.payload && msg.payload.statusId && msg.payload.userId && 
                   msg.payload.oldEmoji && msg.payload.newEmoji;
        });
        
        this.validators.set('API_RESPONSE', (msg) => {
            return msg.requestId && (msg.payload !== undefined);
        });
    },
    
    validate(message, origin) {
        try {
            if (!message || typeof message !== 'object') {
                return false;
            }
            
            if (!OriginTrustAdapter.validateMessageOrigin(origin)) {
                const originKey = `invalid_origin_${origin}`;
                if (!_loggedMessages.has(originKey)) {
                    _loggedMessages.add(originKey);
                    debugWarn(`Invalid origin: ${origin}`);
                }
                return false;
            }
            
            if (!message.type) {
                return false;
            }
            
            if (message.id && isDuplicateMessage(message.id)) {
                const replayKey = `replay_${message.id}`;
                if (!_loggedMessages.has(replayKey)) {
                    _loggedMessages.add(replayKey);
                    debugWarn(`Replay detected: ${message.id}`);
                }
                return false;
            }
            
            const validator = this.validators.get(message.type);
            if (validator && !validator(message) && !IframeAuthority.compatibilityMode) {
                const schemaKey = `schema_${message.type}`;
                if (!_loggedMessages.has(schemaKey)) {
                    _loggedMessages.add(schemaKey);
                    debugWarn(`Schema validation failed for ${message.type}`);
                }
                return false;
            }
            
            return true;
        } catch (e) {
            debugError('Message validation error:', e);
            return false;
        }
    },
    
    sanitize(message) {
        try {
            const sanitized = { ...message };
            
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
function generateSequenceId() {
    return `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateHandshakeId() {
    return `handshake_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

function generateFrameId() {
    return `frame_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
}

function generateInstanceId() {
    return `instance_${Date.now()}_${Math.random().toString(36).substr(2, 15)}`;
}

// =============================================
// ORIGIN VALIDATION & SECURITY
// =============================================
const TRUSTED_ORIGINS = new Set([
    window.location.origin,
    'http://localhost:4000',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:5000',
    'http://localhost:5000',
    'http://127.0.0.1:8080',
    'http://localhost:8080',
    'https://127.0.0.1:5500',
    'https://localhost:5500',
    'https://127.0.0.1:3000',
    'https://localhost:3000',
    'https://127.0.0.1:5000',
    'https://localhost:5000',
    'https://127.0.0.1:8080',
    'https://localhost:8080',
    'https://*.onrender.com',
    'https://moodchat-fy56.onrender.com',
    'https://moodfronted.onrender.com'
]);

function isValidOrigin(origin) {
    try {
        if (!origin) return false;
        if (origin === window.location.origin) return true;
        if (TRUSTED_ORIGINS.has(origin)) return true;
        
        for (const trusted of TRUSTED_ORIGINS) {
            if (trusted.includes('*')) {
                const pattern = trusted.replace(/\*/g, '[^.]+').replace(/\./g, '\\.');
                const regex = new RegExp(`^${pattern}$`);
                if (regex.test(origin)) return true;
            } else if (origin.endsWith(trusted.replace(/^https?:\/\//, ''))) {
                return true;
            }
        }
        
        if (origin.includes('.onrender.com') || origin.includes('.render.com')) {
            return true;
        }
        
        return false;
    } catch (e) {
        return false;
    }
}

function validateMessage(message, origin) {
    return MessageFirewall.validate(message, origin);
}

// =============================================
// LEGACY MESSAGE ADAPTER
// =============================================
function adaptLegacyMessage(message) {
    try {
        if (message.id && message.requestId) return message;
        
        const adapted = {
            type: message.type,
            id: message.id || message.messageId || genId(),
            requestId: message.requestId || genReqId(),
            source: message.source || MODULE_NAME,
            target: 'parent',
            timestamp: message.timestamp || Date.now(),
            payload: message.payload || message.data || {},
            legacy: true
        };
        
        if (message.inResponseTo) adapted.inResponseTo = message.inResponseTo;
        if (message.token) adapted.token = message.token;
        if (message.signature) adapted.signature = message.signature;
        
        return adapted;
    } catch (e) {
        DiagnosticsAgent.error('Adapter', `Failed to adapt legacy message: ${e.message}`, e);
        return message;
    }
}

// =============================================
// CANONICAL MESSAGE FORMATTER
// =============================================
function formatCanonicalMessage(type, payload = {}, options = {}) {
    return {
        type: type,
        id: options.id || genId(),
        requestId: options.requestId || genReqId(),
        source: options.source || MODULE_NAME,
        target: options.target || 'parent',
        timestamp: Date.now(),
        payload: payload,
        ...options
    };
}

// =============================================
// COMMUNICATION ENGINE - PARENT-ONLY ROUTING
// =============================================
const receiveFromParent = function(event) {
    handleParentMessage(event);
};

const sendToParent = function(type, payload = {}, options = {}) {
    if (type === 'CHILD_READY') {
        return sendChildReady();
    }
    
    if (type === 'REGISTER_MODULE') {
        if (typeof ParentCommunication !== 'undefined') return ParentCommunication.sendRegistration();
    }
    
    if (type === 'ACTION' || type.startsWith('STATUS_')) {
        const action = type.startsWith('STATUS_') ? type : payload.action;
        return safeSendAction(action, payload.payload || payload);
    }
    
    return safeSend(type, payload, {
        expectAck: options.requiresAck || false
    });
};

// =============================================
// DETERMINISTIC INITIALIZATION SEQUENCE (HANDSHAKE V3)
// =============================================
let initializationStarted = false;

function initializeModule() {
    if (initializationStarted) {
        debugLog('Initialization already started');
        return;
    }
    
    initializationStarted = true;
    
    transitionTo(LifecycleState.INITIALIZING, 'module_initialize');
    
    logStatus('INIT', 'Module initializing');
    
    transitionTo(LifecycleState.READY, 'setup_complete');
    logStatus('READY', 'Module ready');
    
    sendChildReady();
    
    logStatus('WAITING', 'Waiting for PARENT_READY (no retries)');
}

// =============================================
// PASSIVE REGISTRATION - ONCE ONLY
// =============================================
let statusRegistered = false;
let lastStatusRegister = 0;

function registerStatusModule() {
    if (statusRegistered) return;
    
    const now = Date.now();
    if (now - lastStatusRegister < 3000) return;
    
    lastStatusRegister = now;
    
    if (!_childReadySent && isInState(LifecycleState.READY)) {
        sendChildReady();
        statusRegistered = true;
    }
}

window.addEventListener('load', registerStatusModule);

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
    
    handshakeState: 'idle',
    handshakeStartTime: null,
    handshakeEndTime: null,
    handshakeRetryCount: 0,
    handshakeMaxRetries: IframeEnvironment.getConfig().maxRetries,
    handshakeTimeoutMs: IframeEnvironment.getConfig().handshakeTimeout,
    parentReadyReceived: false,
    childReadySent: false,
    handshakeAckReceived: false,
    sessionSyncReceived: false,
    pageActivated: false,
    
    frameId: IframeAuthority.id,
    instanceId: IframeAuthority.instanceId,
    sessionId: null,
    
    capabilities: new Map(),
    parentCapabilities: new Set(),
    
    securityContext: {
        originValidated: false,
        parentOrigin: null,
        signatureRequired: !IframeEnvironment.isSandboxed && IframeEnvironment.type !== 'LOCAL_DEV',
        encryptionRequired: false,
        hmacKey: null,
        timestampTolerance: IframeEnvironment.isVPNNetwork ? 60000 : 30000,
        replayProtection: !IframeEnvironment.isSandboxed,
        messageSequence: new Map()
    },
    
    sessionMirror: {
        token: null,
        user: null,
        expiry: null,
        permissions: [],
        timestamp: 0,
        messageId: null,
        validated: false,
        source: null,
        refreshToken: null,
        lastRefresh: null,
        refreshInProgress: false,
        capabilities: []
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
    
    retryQueue: [],
    retryTimers: new Map(),
    maxRetryAttempts: 3,
    baseRetryDelay: 1000,
    maxRetryDelay: 30000,
    
    offlineBuffer: [],
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    offlineModeEnabled: false,
    
    heartbeatFailures: 0,
    maxHeartbeatFailures: 3,
    lastHeartbeatSent: null,
    lastHeartbeatReceived: null,
    
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
        handshakeFailures: 0,
        retryCount: 0,
        offlineOperations: 0,
        tokenRefreshes: 0,
        originValidations: 0,
        capabilityNegotiations: 0,
        recoveryAttempts: 0,
        successfulRecoveries: 0,
        statusViews: 0,
        statusReactions: 0,
        statusPosts: 0,
        statusExpired: 0,
        sessionRequests: 0,
        sessionSuccess: 0,
        sessionFailures: 0,
        lifecycleTransitions: 0,
        invalidTransitions: 0,
        blockedActions: 0
    },
    
    handshakeId: null,
    handshakePromise: null,
    handshakeResolve: null,
    handshakeReject: null,
    handshakeTimer: null,
    handshakeRetries: 0,
    maxHandshakeRetries: IframeEnvironment.getConfig().maxRetries,
    
    protocolVersion: '10.0',
    parentProtocolVersion: null,
    
    diagnosticsEnabled: true,
    diagnosticData: []
};

// =============================================
// IFRAME TRANSPORT - CENTRALIZED COMMUNICATION LAYER
// =============================================
const IframeTransport = {
    version: '10.0',
    messageQueue: [],
    isProcessing: false,
    maxRetries: 3,
    baseRetryDelay: 1000,
    maxRetryDelay: 30000,
    messageCounter: 0,
    pendingAcks: new Map(),
    heartbeatInterval: null,
    lastHeartbeatSent: null,
    lastHeartbeatReceived: null,
    heartbeatMissed: 0,
    maxMissedHeartbeats: 3,
    connectionStatus: 'disconnected',
    offlineBuffer: [],
    batchMessages: IframeEnvironment.getConfig().batchMessages,
    keepalive: IframeEnvironment.getConfig().keepalive,
    _messageLogs: new Set(),
    
    initialize() {
        debugLog('IframeTransport initialized');
        return this;
    },
    
    send(type, payload = {}, options = {}) {
        if (type === 'CHILD_READY') {
            sendChildReady();
            return Promise.resolve({ success: true });
        }
        
        if (type === 'REGISTER_MODULE') {
            if (typeof ParentCommunication !== 'undefined') ParentCommunication.sendRegistration();
            return Promise.resolve({ success: true });
        }
        
        if (type === 'ACTION' || type.startsWith('STATUS_')) {
            const action = type.startsWith('STATUS_') ? type : payload.action;
            const result = safeSendAction(action, payload.payload || payload);
            return result ? Promise.resolve({ success: true, messageId: result }) : Promise.reject(new Error('Failed to send action'));
        }
        
        const sent = safeSend(type, payload, {
            expectAck: options.requiresAck || false
        });
        
        if (sent) {
            return Promise.resolve({ success: true, messageId: sent });
        } else {
            return Promise.reject(new Error('Failed to send message'));
        }
    },
    
    sanitizePayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;
        
        try {
            return JSON.parse(JSON.stringify(payload, (key, value) => {
                if (typeof value === 'string' && value.length > 10000) {
                    return value.substring(0, 10000) + '... [truncated]';
                }
                if (key === 'token' && typeof value === 'string') {
                    return '[REDACTED]';
                }
                return value;
            }));
        } catch {
            return payload;
        }
    },
    
    queueOffline(type, payload, options, resolve, reject) {
        const offlineItem = {
            id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            type,
            payload,
            options,
            resolve,
            reject,
            timestamp: Date.now()
        };
        
        this.offlineBuffer.push(offlineItem);
        
        DiagnosticsAgent.increment('offlineOperations');
        
        const offlineKey = `offline_${type}`;
        if (!this._messageLogs.has(offlineKey)) {
            this._messageLogs.add(offlineKey);
            logStatus('WARNING', `Offline - queued ${type}`);
        }
    },
    
    calculateRetryDelay(attempt) {
        const baseDelay = IframeEnvironment.isVPNNetwork ? 2000 : 1000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), this.maxRetryDelay);
        const jitter = Math.random() * 200;
        return delay + jitter;
    },
    
    cleanupPendingAcks() {
        const now = Date.now();
        for (const [id, handler] of this.pendingAcks.entries()) {
            if (now - handler.timestamp > 30000) {
                clearTimeout(handler.timer);
                this.pendingAcks.delete(id);
            }
        }
    },
    
    startHeartbeat() {
        debugLog('Heartbeat disabled - waiting for parent heartbeats');
    },
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    },
    
    async processOfflineQueue() {
        if (this.offlineBuffer.length === 0 || !IframeAuthority.parentDetected) return;
        
        const processKey = 'offline_process';
        if (!this._messageLogs.has(processKey)) {
            this._messageLogs.add(processKey);
            logStatus('INFO', `Processing ${this.offlineBuffer.length} offline messages`);
        }
        
        const queue = [...this.offlineBuffer];
        this.offlineBuffer = [];
        
        for (const item of queue) {
            try {
                const result = await this.send(item.type, item.payload, item.options);
                item.resolve(result);
            } catch (error) {
                item.reject(error);
            }
            
            await new Promise(r => setTimeout(r, 10));
        }
        
        const completeKey = 'offline_complete';
        if (!this._messageLogs.has(completeKey)) {
            this._messageLogs.add(completeKey);
            logStatus('SUCCESS', 'Offline queue processed');
        }
    },
    
    getStatus() {
        return {
            connectionStatus: this.connectionStatus,
            pendingAcks: this.pendingAcks.size,
            retryQueue: this.retryQueue.size,
            offlineBuffer: this.offlineBuffer.length,
            heartbeatMissed: this.heartbeatMissed,
            lastHeartbeatSent: this.lastHeartbeatSent,
            lastHeartbeatReceived: this.lastHeartbeatReceived
        };
    }
}.initialize();

// =============================================
// NAVIGATION GUARD - PROTECTS PAGE TRANSITIONS
// =============================================
const NavigationGuard = {
    active: false,
    pendingOperations: 0,
    guardElement: null,
    beforeUnloadHandler: null,
    navigationListeners: new Set(),
    historyState: [],
    maxHistory: 50,
    
    initialize() {
        this.createGuardElement();
        this.setupBeforeUnload();
        this.setupHistoryTracking();
        this.setupNavigationListeners();
        debugLog('NavigationGuard initialized');
        return this;
    },
    
    createGuardElement() {
        if (document.getElementById('navigationGuard')) return;
        
        const guard = document.createElement('div');
        guard.id = 'navigationGuard';
        guard.className = 'navigation-guard';
        guard.innerHTML = `
            <i class="fas fa-sync-alt fa-spin"></i>
            <span>Operation in progress. Please wait...</span>
        `;
        
        document.body.appendChild(guard);
        this.guardElement = guard;
    },
    
    setupBeforeUnload() {
        this.beforeUnloadHandler = (e) => {
            if (this.pendingOperations > 0) {
                e.preventDefault();
                e.returnValue = 'There are pending operations. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
    },
    
    setupHistoryTracking() {
        const pushState = history.pushState;
        const replaceState = history.replaceState;
        
        history.pushState = (...args) => {
            const result = pushState.apply(history, args);
            this.trackHistoryChange('push', args[2]);
            return result;
        };
        
        history.replaceState = (...args) => {
            const result = replaceState.apply(history, args);
            this.trackHistoryChange('replace', args[2]);
            return result;
        };
        
        window.addEventListener('popstate', () => {
            this.trackHistoryChange('pop', window.location.pathname);
        });
    },
    
    trackHistoryChange(type, url) {
        this.historyState.push({
            type,
            url,
            timestamp: Date.now()
        });
        
        if (this.historyState.length > this.maxHistory) {
            this.historyState.shift();
        }
    },
    
    setupNavigationListeners() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && link.target !== '_blank') {
                this.handleNavigation(link.href);
            }
        });
        
        window.addEventListener('pagehide', () => {
            this.handlePageHide();
        });
    },
    
    handleNavigation(url) {
        if (this.pendingOperations > 0) {
            if (!confirm('There are pending operations. Navigate away?')) {
                return false;
            }
        }
        return true;
    },
    
    handlePageHide() {
        if (this.pendingOperations > 0 && typeof sendToParent !== 'undefined') {
            sendToParent('PAGE_HIDE', {
                pendingOperations: this.pendingOperations,
                timestamp: Date.now()
            }, { requiresAck: false, silent: true });
        }
    },
    
    startOperation(operation) {
        this.pendingOperations++;
        this.active = true;
        this.updateGuard();
    },
    
    endOperation(operation) {
        this.pendingOperations = Math.max(0, this.pendingOperations - 1);
        this.active = this.pendingOperations > 0;
        this.updateGuard();
    },
    
    updateGuard() {
        if (!this.guardElement) return;
        
        if (this.pendingOperations > 0) {
            this.guardElement.classList.add('active');
        } else {
            this.guardElement.classList.remove('active');
        }
    },
    
    wrapOperation(fn, operationName) {
        return async (...args) => {
            this.startOperation(operationName);
            try {
                return await fn(...args);
            } finally {
                this.endOperation(operationName);
            }
        };
    },
    
    addNavigationListener(listener) {
        this.navigationListeners.add(listener);
        return () => this.navigationListeners.delete(listener);
    },
    
    getState() {
        return {
            active: this.active,
            pendingOperations: this.pendingOperations,
            historySize: this.historyState.length
        };
    },
    
    reset() {
        this.pendingOperations = 0;
        this.active = false;
        this.updateGuard();
        this.historyState = [];
    }
}.initialize();

// =============================================
// ERROR BOUNDARY SYSTEM
// =============================================
function createErrorBoundary(fn, featureName, fallback = null) {
    return async function(...args) {
        if (typeof state !== 'undefined' && state.disabledFeatures?.has(featureName)) {
            return typeof fallback === 'function' ? fallback(...args) : fallback;
        }

        try {
            return await fn(...args);
        } catch (error) {
            const errorKey = `error_${featureName}`;
            if (!_loggedMessages.has(errorKey)) {
                _loggedMessages.add(errorKey);
                logStatus('FAILED', `${featureName}: ${error.message}`);
            }
            
            if (typeof state !== 'undefined' && state.disabledFeatures) {
                state.disabledFeatures.add(featureName);
            }
            
            const key = featureName.split(':')[0];
            if (typeof CIRCUIT_BREAKER !== 'undefined') {
                if (typeof CIRCUIT_BREAKER.failures !== 'undefined') {
                    CIRCUIT_BREAKER.failures[key] = (CIRCUIT_BREAKER.failures[key] || 0) + 1;
                }
                if (typeof CIRCUIT_BREAKER.lastFailure !== 'undefined') {
                    CIRCUIT_BREAKER.lastFailure[key] = Date.now();
                }
            }
            
            return typeof fallback === 'function' ? fallback(...args) : fallback;
        }
    };
}

// =============================================
// CIRCUIT BREAKER
// =============================================
const CIRCUIT_BREAKER = {
    failures: {},
    threshold: 5,
    timeout: 30000,
    lastFailure: {},
    
    isOpen(service) {
        const failures = this.failures[service] || 0;
        const lastFailure = this.lastFailure[service] || 0;
        const timeSinceFailure = Date.now() - lastFailure;
        
        if (failures >= this.threshold && timeSinceFailure < this.timeout) {
            return true;
        }
        
        if (timeSinceFailure >= this.timeout) {
            this.failures[service] = 0;
            return false;
        }
        
        return false;
    },
    
    recordFailure(service) {
        this.failures[service] = (this.failures[service] || 0) + 1;
        this.lastFailure[service] = Date.now();
        
        const key = `circuit_${service}`;
        if (!_loggedMessages.has(key)) {
            _loggedMessages.add(key);
            logStatus('WARNING', `Circuit failure for ${service}: ${this.failures[service]}`);
        }
    },
    
    recordSuccess(service) {
        this.failures[service] = 0;
    }
};

function isCircuitOpen(service) {
    return CIRCUIT_BREAKER.isOpen(service);
}

// =============================================
// ENHANCED HANDSHAKE CLIENT
// =============================================
const HandshakeClient = {
    status: 'idle',
    handshakeId: null,
    startTime: null,
    endTime: null,
    resolve: null,
    reject: null,
    timer: null,
    retries: 0,
    maxRetries: IframeEnvironment.getConfig().maxRetries,
    childReadySent: false,
    parentReadyReceived: false,
    handshakeAckReceived: false,
    sessionSyncReceived: false,
    handshakePromise: null,
    handshakeInProgress: false,
    handshakeLock: false,
    _handshakeLogged: false,
    
    initialize() {
        this.reset();
        debugLog('HandshakeClient initialized');
        return this;
    },
    
    reset() {
        this.status = 'idle';
        this.handshakeId = null;
        this.startTime = null;
        this.endTime = null;
        this.resolve = null;
        this.reject = null;
        this.retries = 0;
        this.childReadySent = false;
        this.parentReadyReceived = false;
        this.handshakeAckReceived = false;
        this.sessionSyncReceived = false;
        this.handshakeInProgress = false;
        this._handshakeLogged = false;
        
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    },
    
    async execute(options = {}) {
        if (!_childReadySent && isInState(LifecycleState.READY)) {
            sendChildReady();
        }
        
        return { success: true, delegated: true };
    },
    
    handleResponse(message) {
        if (message.type === 'PARENT_READY') {
            if (typeof ParentCommunication !== 'undefined') ParentCommunication.parentReadyReceived = true;
        }
        
        if (message.type === 'MODULE_REGISTERED') {
            if (typeof ParentCommunication !== 'undefined') ParentCommunication.moduleRegistered = true;
        }
        
        if (message.type === 'SESSION_DATA' || message.type === 'SESSION_ACTIVE') {
            // Validate before handling
            if (message.payload && __isValidSession(message.payload)) {
                if (typeof ParentCommunication !== 'undefined') ParentCommunication.handleSessionSync(message.payload);
            }
        }
    },
    
    handleSessionInit(message) {
        // Validate before handling
        if ((message.payload || message.data) && __isValidSession(message.payload || message.data)) {
            if (typeof ParentCommunication !== 'undefined') ParentCommunication.handleSessionSync(message.payload || message.data);
        }
    }
}.initialize();

// =============================================
// IFRAME HANDSHAKE AUTHORITY - DETERMINISTIC HANDSHAKE
// =============================================
const IframeHandshakeAuthority = {
    status: 'idle',
    handshakeId: null,
    startTime: null,
    endTime: null,
    resolve: null,
    reject: null,
    timer: null,
    retries: 0,
    maxRetries: IframeEnvironment.getConfig().maxRetries,
    childReadySent: false,
    parentReadyReceived: false,
    handshakeAckReceived: false,
    sessionSyncReceived: false,
    handshakePromise: null,
    handshakeInProgress: false,
    handshakeLock: false,
    _handshakeLogged: false,
    
    initialize() {
        this.reset();
        debugLog('IframeHandshakeAuthority initialized');
        return this;
    },
    
    reset() {
        this.status = 'idle';
        this.handshakeId = null;
        this.startTime = null;
        this.endTime = null;
        this.resolve = null;
        this.reject = null;
        this.retries = 0;
        this.childReadySent = false;
        this.parentReadyReceived = false;
        this.handshakeAckReceived = false;
        this.sessionSyncReceived = false;
        this.handshakeInProgress = false;
        this._handshakeLogged = false;
        
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    },
    
    async execute(options = {}) {
        if (this.handshakeInProgress) {
            return this.handshakePromise;
        }
        
        this.handshakeInProgress = true;
        this.status = 'connecting';
        this.startTime = Date.now();
        this.handshakeId = generateHandshakeId();
        
        this.handshakePromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            
            if (!_childReadySent && isInState(LifecycleState.READY)) {
                sendChildReady();
                this.childReadySent = true;
            }
        });
        
        return this.handshakePromise;
    },
    
    handleResponse(message) {
        if (message.type === 'PARENT_READY') {
            this.parentReadyReceived = true;
            this.status = 'parent_ready';
            
        } else if (message.type === 'MODULE_REGISTERED') {
            this.handshakeAckReceived = true;
            this.status = 'registered';
            
        } else if (message.type === 'SESSION_DATA' || message.type === 'SESSION_ACTIVE') {
            if (message.payload && __isValidSession(message.payload)) {
                this.sessionSyncReceived = true;
                this.status = 'connected';
                this.endTime = Date.now();
                this.handshakeInProgress = false;
                
                if (this.timer) {
                    clearTimeout(this.timer);
                    this.timer = null;
                }
                
                if (this.resolve) {
                    this.resolve({ success: true, handshakeId: this.handshakeId });
                }
            }
        }
    },
    
    handleSessionInit(message) {
        if ((message.payload || message.data) && __isValidSession(message.payload || message.data)) {
            if (typeof ParentCommunication !== 'undefined') ParentCommunication.handleSessionSync(message.payload || message.data);
        }
    }
}.initialize();

// =============================================
// STARTUP GOVERNOR - CONTROLLED INITIALIZATION
// =============================================
const StartupGovernor = {
    state: 'PENDING',
    stages: {
        PREFLIGHT: 'PREFLIGHT',
        DEPENDENCY_CHECK: 'DEPENDENCY_CHECK',
        PARENT_DETECT: 'PARENT_DETECT',
        HANDSHAKE: 'HANDSHAKE',
        REGISTRATION: 'REGISTRATION',
        SESSION_SYNC: 'SESSION_SYNC',
        ACTIVE: 'ACTIVE',
        DEGRADED: 'DEGRADED',
        RECOVERING: 'RECOVERING'
    },
    currentStage: 'PREFLIGHT',
    startTime: Date.now(),
    stageTimes: {},
    errors: [],
    
    initialize() {
        debugLog('StartupGovernor initialized');
        return this;
    },
    
    transitionTo(stage) {
        this.stageTimes[stage] = Date.now() - this.startTime;
        this.currentStage = stage;
        this.state = stage;
        
        document.dispatchEvent(new CustomEvent('governorStateChange', {
            detail: { newState: stage, previousState: this.currentStage }
        }));
        
        debugLog(`StartupGovernor: ${stage}`);
    },
    
    recordError(error) {
        this.errors.push({
            stage: this.currentStage,
            error: error.message,
            timestamp: Date.now()
        });
    },
    
    canProceed() {
        return this.state !== 'DEGRADED';
    },
    
    getMetrics() {
        return {
            currentStage: this.currentStage,
            stageTimes: this.stageTimes,
            errors: this.errors,
            totalTime: Date.now() - this.startTime
        };
    }
}.initialize();

// =============================================
// SESSION CLIENT - RESILIENT SESSION MANAGEMENT
// =============================================
const SessionClient = {
    session: null,
    sessionValid: false,
    sessionExpiry: null,
    refreshInProgress: false,
    refreshTimer: null,
    sessionListeners: new Set(),
    offlineMode: false,
    
    initialize() {
        this.setupRefreshTimer();
        debugLog('SessionClient initialized');
        return this;
    },
    
    loadCachedSession() {
        return false;
    },
    
    setupRefreshTimer() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        this.refreshTimer = setInterval(() => {
            this.checkSession();
        }, 300000);
    },
    
    async checkSession() {
        if (!this.sessionValid) return;
        
        if (this.sessionExpiry) {
            const timeToExpiry = this.sessionExpiry - new Date();
            if (timeToExpiry < 300000 && timeToExpiry > 0) {
                const expiryKey = 'session_expiring';
                if (!_loggedMessages.has(expiryKey)) {
                    _loggedMessages.add(expiryKey);
                    logStatus('WARNING', 'Session expiring soon, refreshing...');
                }
                await this.refreshSession();
            }
        }
    },
    
    async refreshSession() {
        if (this.refreshInProgress) return this.session;
        
        this.refreshInProgress = true;
        
        try {
            const response = await safeSendAction('TOKEN_REFRESH', {
                refreshToken: this.session?.refreshToken
            });
            
            if (response && response.payload && response.payload.token) {
                // Validate new token before updating
                const newSessionData = {
                    token: response.payload.token,
                    userId: this.session?.user?.id || this.session?.userId,
                    user: this.session?.user
                };
                
                if (__isValidSession(newSessionData)) {
                    this.session.token = response.payload.token;
                    if (response.payload.refreshToken) {
                        this.session.refreshToken = response.payload.refreshToken;
                    }
                    if (response.payload.expiry) {
                        this.session.expiry = response.payload.expiry;
                        this.sessionExpiry = new Date(response.payload.expiry);
                    }
                    
                    this.notifyListeners('refreshed', this.session);
                    
                    const refreshKey = 'session_refreshed';
                    if (!_loggedMessages.has(refreshKey)) {
                        _loggedMessages.add(refreshKey);
                        logStatus('SUCCESS', 'Session refreshed');
                    }
                    
                    return this.session;
                }
            }
        } catch (error) {
            if (this.session) {
                const failKey = 'session_refresh_failed';
                if (!_loggedMessages.has(failKey)) {
                    _loggedMessages.add(failKey);
                    logStatus('FAILED', 'Session refresh failed');
                }
                
                this.offlineMode = true;
            }
        } finally {
            this.refreshInProgress = false;
        }
        
        return this.session;
    },
    
    updateSession(sessionData, source = 'parent') {
        if (!sessionData) return false;
        
        // Validate session before updating
        if (!__isValidSession(sessionData)) {
            logStatus('FAILED', `Invalid session in updateSession from ${source} - rejected`);
            return false;
        }
        
        // Check for duplicate
        if (__isDuplicateSession(sessionData)) {
            logStatus('WARNING', 'Duplicate session update ignored');
            return false;
        }
        
        // Prevent session downgrade
        if (this.session && this.sessionValid) {
            const currentValid = __isValidSession({ token: this.session.token, userId: this.session.user?.id || this.session.userId });
            if (currentValid && !__isValidSession(sessionData)) {
                logStatus('WARNING', 'Prevented session downgrade in SessionClient');
                return false;
            }
        }
        
        const oldSession = this.session ? { ...this.session } : null;
        
        if (sessionData.token) {
            if (!this.session) this.session = {};
            this.session.token = sessionData.token;
            if (typeof state !== 'undefined') {
                state.token = sessionData.token;
            }
            setSession(sessionData.token, sessionData.user || oldSession?.user, sessionData.expiry);
        }
        
        if (sessionData.user) {
            if (!this.session) this.session = {};
            this.session.user = {
                id: sessionData.user.id || sessionData.user.userId,
                displayName: sessionData.user.displayName || sessionData.user.name,
                photoURL: sessionData.user.photoURL || sessionData.user.avatar,
                email: sessionData.user.email,
                isGuest: sessionData.user.isGuest || false
            };
            if (typeof state !== 'undefined') {
                state.user = this.session.user;
            }
        }
        
        if (sessionData.refreshToken) {
            if (!this.session) this.session = {};
            this.session.refreshToken = sessionData.refreshToken;
        }
        
        if (sessionData.expiry) {
            this.session.expiry = sessionData.expiry;
            this.sessionExpiry = new Date(sessionData.expiry);
        }
        
        if (sessionData.permissions) {
            if (!this.session) this.session = {};
            this.session.permissions = [...sessionData.permissions];
            if (typeof state !== 'undefined') {
                state.permissionsGranted = [...sessionData.permissions];
            }
        }
        
        if (sessionData.sessionId && typeof state !== 'undefined') {
            state.sessionId = sessionData.sessionId;
        }
        
        this.sessionValid = true;
        __storeValidSessionId(sessionData);
        
        this.notifyListeners('updated', this.session, oldSession);
        
        const updateKey = `session_updated_${source}`;
        if (!_loggedMessages.has(updateKey)) {
            _loggedMessages.add(updateKey);
            logStatus('SUCCESS', `Session updated from ${source}`);
        }
        
        this.offlineMode = false;
        
        return true;
    },
    
    clearSession() {
        this.session = null;
        this.sessionValid = false;
        this.sessionExpiry = null;
        this.offlineMode = true;
        
        clearSession();
        
        this.notifyListeners('cleared', null);
        
        const clearKey = 'session_cleared';
        if (!_loggedMessages.has(clearKey)) {
            _loggedMessages.add(clearKey);
            logStatus('WARNING', 'Session cleared');
        }
    },
    
    cacheSession() {
    },
    
    getSession() {
        return this.session ? { ...this.session } : null;
    },
    
    isAuthenticated() {
        return this.sessionValid && !!this.session?.token && !!this.session?.user && 
               __isValidSession({ token: this.session.token, userId: this.session.user?.id || this.session.userId });
    },
    
    isGuest() {
        return !this.isAuthenticated() || this.session?.user?.isGuest === true;
    },
    
    isOfflineMode() {
        return this.offlineMode;
    },
    
    addListener(listener) {
        this.sessionListeners.add(listener);
        return () => this.sessionListeners.delete(listener);
    },
    
    notifyListeners(event, session, oldSession = null) {
        this.sessionListeners.forEach(listener => {
            try {
                listener({ event, session, oldSession });
            } catch (e) {}
        });
    }
}.initialize();

// =============================================
// SESSION MIRROR LAYER - ENHANCED
// =============================================
function updateSessionMirror(sessionData, source = 'parent') {
    try {
        if (!sessionData) return false;
        
        // Validate session before updating
        if (!__isValidSession(sessionData)) {
            logStatus('FAILED', `Invalid session in updateSessionMirror from ${source} - rejected`);
            return false;
        }
        
        // Check for duplicate
        if (__isDuplicateSession(sessionData)) {
            logStatus('WARNING', 'Duplicate session mirror update ignored');
            return false;
        }
        
        // Prevent session downgrade
        if (state.sessionMirror.validated && state.sessionMirror.token && state.sessionMirror.user) {
            const currentValid = __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id || state.sessionMirror.user?.userId });
            if (currentValid && !__isValidSession(sessionData)) {
                logStatus('WARNING', 'Prevented session downgrade in updateSessionMirror');
                return false;
            }
        }
        
        const previousState = { ...state.sessionMirror };
        
        if (sessionData.token && typeof sessionData.token === 'string') {
            if (sessionData.token === 'present' && sessionData.actualToken) {
                state.sessionMirror.token = sessionData.actualToken;
                state.token = sessionData.actualToken;
                setSession(sessionData.actualToken, state.sessionMirror.user, state.sessionMirror.expiry);
            } else {
                state.sessionMirror.token = sessionData.token;
                state.token = sessionData.token;
                setSession(sessionData.token, state.sessionMirror.user, state.sessionMirror.expiry);
            }
        }
        
        if (sessionData.refreshToken) {
            state.sessionMirror.refreshToken = sessionData.refreshToken;
        }
        
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
        
        if (sessionData.permissions && Array.isArray(sessionData.permissions)) {
            state.sessionMirror.permissions = [...sessionData.permissions];
            state.permissionsGranted = [...sessionData.permissions];
        }
        
        if (sessionData.capabilities && Array.isArray(sessionData.capabilities)) {
            state.sessionMirror.capabilities = [...sessionData.capabilities];
        }
        
        if (sessionData.expiry) {
            state.sessionMirror.expiry = new Date(sessionData.expiry);
            state.sessionExpiry = state.sessionMirror.expiry;
        }
        
        if (sessionData.sessionId) {
            state.sessionId = sessionData.sessionId;
        }
        
        state.sessionMirror.timestamp = Date.now();
        state.sessionMirror.source = source;
        state.sessionMirror.messageId = sessionData.messageId || sessionData.id;
        
        if (state.sessionMirror.token && state.sessionMirror.user) {
            state.sessionMirror.validated = true;
            state.sessionActive = true;
            state.isGuestMode = false;
            __storeValidSessionId(sessionData);
            
            SessionClient.updateSession(sessionData, source);
            
            const updateKey = `mirror_updated_${source}`;
            if (!_loggedMessages.has(updateKey)) {
                _loggedMessages.add(updateKey);
                logStatus('SUCCESS', `Session mirror updated from ${source}`);
            }
            
            if (typeof isTokenReady !== 'undefined') {
                isTokenReady = true;
                if (typeof triggerTokenReadyCallbacks !== 'undefined') {
                    triggerTokenReadyCallbacks();
                }
            }
            
            if (typeof processPendingApiRequests !== 'undefined') {
                processPendingApiRequests();
            }
            
            return true;
        }
        
        return false;
    } catch (error) {
        const errorKey = `mirror_update_${error.message}`;
        if (!_loggedMessages.has(errorKey)) {
            _loggedMessages.add(errorKey);
            logStatus('FAILED', `updateSessionMirror: ${error.message}`);
        }
        return false;
    }
}

function getSessionMirror() {
    return {
        ...state.sessionMirror,
        user: state.sessionMirror.user ? { ...state.sessionMirror.user } : null,
        capabilities: state.sessionMirror.capabilities ? [...state.sessionMirror.capabilities] : []
    };
}

function isSessionMirrorValid() {
    if (!state.sessionMirror.validated) return false;
    if (!state.sessionMirror.token || !state.sessionMirror.user) return false;
    if (state.sessionMirror.expiry && new Date() >= state.sessionMirror.expiry) return false;
    return __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id || state.sessionMirror.user?.userId });
}

// =============================================
// PARENT CONFIGURATION REQUEST
// =============================================
async function requestParentConfig() {
    if (!isInState(LifecycleState.ACTIVE)) {
        debugLog('Cannot request config - not active');
        return;
    }
    
    safeSendAction('REQUEST_CONFIG', {});
}

function applyParentConfig(config) {
    try {
        if (config.heartbeatInterval) {
            IframeEnvironment.getConfig().heartbeatInterval = config.heartbeatInterval;
        }
        
        if (config.sessionTimeout) {
            state.sessionExpiry = new Date(Date.now() + config.sessionTimeout);
        }
        
        if (config.maxRetries) {
            state.maxRetryAttempts = config.maxRetries;
        }
        
        if (config.security) {
            if (config.security.signatureRequired !== undefined) {
                state.securityContext.signatureRequired = config.security.signatureRequired && !IframeAuthority.compatibilityMode;
            }
            if (config.security.timestampTolerance) {
                state.securityContext.timestampTolerance = config.security.timestampTolerance;
            }
        }
        
        const applyKey = 'config_applied';
        if (!_loggedMessages.has(applyKey)) {
            _loggedMessages.add(applyKey);
            logStatus('SUCCESS', 'Parent config applied');
        }
        
        document.dispatchEvent(new CustomEvent('configApplied', {
            detail: config
        }));
        
    } catch (error) {}
}

// =============================================
// TOKEN REFRESH HANDLER
// =============================================
async function refreshToken() {
    if (state.sessionMirror.refreshInProgress) return state.token;
    
    state.sessionMirror.refreshInProgress = true;
    
    try {
        const response = await safeSendAction('TOKEN_REFRESH', {
            refreshToken: state.sessionMirror.refreshToken
        });
        
        if (response && response.payload && response.payload.token) {
            // Validate new token before updating
            const newTokenData = {
                token: response.payload.token,
                userId: state.sessionMirror.user?.id || state.sessionMirror.user?.userId,
                user: state.sessionMirror.user
            };
            
            if (__isValidSession(newTokenData)) {
                state.token = response.payload.token;
                state.sessionMirror.token = response.payload.token;
                state.sessionMirror.lastRefresh = Date.now();
                
                setSession(response.payload.token, state.sessionMirror.user, state.sessionMirror.expiry);
                
                if (response.payload.refreshToken) {
                    state.sessionMirror.refreshToken = response.payload.refreshToken;
                }
                
                const refreshKey = 'token_refreshed';
                if (!_loggedMessages.has(refreshKey)) {
                    _loggedMessages.add(refreshKey);
                    logStatus('SUCCESS', 'Token refreshed');
                }
                
                return state.token;
            }
        }
    } catch (error) {
        const failKey = 'token_refresh_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', 'Token refresh failed');
        }
    } finally {
        state.sessionMirror.refreshInProgress = false;
    }
    
    return state.token;
}

// =============================================
// PARENT AVAILABILITY DETECTION
// =============================================
const ParentDetector = {
    status: 'unknown',
    checkCount: 0,
    maxChecks: 3,
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
                    IframeAuthority.parentDetected = true;
                    
                    if (this.checkInterval) {
                        clearInterval(this.checkInterval);
                        this.checkInterval = null;
                    }
                    
                    const detectKey = 'parent_detected';
                    if (!_loggedMessages.has(detectKey)) {
                        _loggedMessages.add(detectKey);
                        logStatus('SUCCESS', 'Parent detected');
                    }
                    
                    resolve(true);
                    return;
                }
                
                if (this.checkCount >= this.maxChecks) {
                    this.status = 'unavailable';
                    state.parentDetected = false;
                    IframeAuthority.parentDetected = false;
                    
                    if (this.checkInterval) {
                        clearInterval(this.checkInterval);
                        this.checkInterval = null;
                    }
                    
                    const noParentKey = 'parent_not_detected';
                    if (!_loggedMessages.has(noParentKey)) {
                        _loggedMessages.add(noParentKey);
                        logStatus('WARNING', 'Parent not detected');
                    }
                    
                    resolve(false);
                    return;
                }
            };
            
            check();
            
            this.checkInterval = setInterval(check, 100);
        });
    },
    
    checkAvailability() {
        try {
            if (window.self === window.top) {
                return false;
            }
            
            if (!window.parent || window.parent === window) {
                return false;
            }
            
            if (typeof window.parent.postMessage !== 'function') {
                return false;
            }
            
            return true;
        } catch (e) {
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
// INITIALIZATION PIPELINE - PREFLIGHT → READY (NO TIMEOUTS)
// =============================================
async function preflightStage() {
    try {
        if (typeof window === 'undefined') throw new Error('Window not available');
        if (typeof document === 'undefined') throw new Error('Document not available');
        
        IframeEnvironment.detect();
        
        const preflightKey = 'preflight_complete';
        if (!_loggedMessages.has(preflightKey)) {
            _loggedMessages.add(preflightKey);
            logStatus('SUCCESS', 'Preflight complete');
        }
        
        return { success: true };
    } catch (error) {
        const failKey = 'preflight_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Preflight failed: ${error.message}`);
        }
        return { success: false, fallback: true };
    }
}

async function dependencyCheckStage() {
    try {
        const requiredApis = ['postMessage', 'addEventListener'];
        const missing = requiredApis.filter(api => typeof window[api] === 'undefined');
        
        if (missing.length > 0) {
            state.dependenciesLoaded = false;
            const missingKey = 'missing_deps_' + missing.join('_');
            if (!_loggedMessages.has(missingKey)) {
                _loggedMessages.add(missingKey);
                logStatus('WARNING', `Missing dependencies: ${missing.join(', ')}`);
            }
            return { success: false, fallback: true, missing };
        }
        
        state.dependenciesLoaded = true;
        
        const depsKey = 'deps_ok';
        if (!_loggedMessages.has(depsKey)) {
            _loggedMessages.add(depsKey);
            logStatus('SUCCESS', 'Dependencies OK');
        }
        
        return { success: true };
    } catch (error) {
        const failKey = 'deps_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Dependency check failed: ${error.message}`);
        }
        state.dependenciesLoaded = false;
        return { success: false, fallback: true };
    }
}

async function parentDetectStage(timeout = 2000) {
    const detected = await ParentDetector.detect();
    
    if (detected) {
        return { success: true };
    } else {
        return { success: false, fallback: true };
    }
}

async function handshakeStage(options = {}) {
    if (!state.parentDetected) {
        state.handshakeComplete = false;
        const noParentKey = 'handshake_no_parent';
        if (!_loggedMessages.has(noParentKey)) {
            _loggedMessages.add(noParentKey);
            logStatus('WARNING', 'No parent detected, skipping handshake');
        }
        return { success: false, fallback: true };
    }
    
    if (isInState(LifecycleState.READY)) {
        sendChildReady();
    }
    
    return { success: true, delegated: true };
}

async function sessionSyncStage(timeout = 5000) {
    if (!state.handshakeComplete || !state.parentDetected) {
        if (state.sessionMirror.validated && isSessionReady()) {
            activateSessionFromMirror();
            const cacheKey = 'using_cached_session';
            if (!_loggedMessages.has(cacheKey)) {
                _loggedMessages.add(cacheKey);
                logStatus('SUCCESS', 'Using cached session');
            }
            return { success: true, guestMode: false, cached: true };
        }
        
        enableGuestMode();
        const noSessionKey = 'no_session_guest';
        if (!_loggedMessages.has(noSessionKey)) {
            _loggedMessages.add(noSessionKey);
            logStatus('WARNING', 'No session, using guest mode');
        }
        return { success: false, guestMode: true };
    }
    
    return { success: true, waiting: true };
}

function activateSessionFromMirror() {
    if (!state.sessionMirror.validated) return false;
    
    // Validate mirror session before activating
    const mirrorValid = __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id || state.sessionMirror.user?.userId });
    if (!mirrorValid) {
        logStatus('FAILED', 'Invalid session mirror - cannot activate');
        return false;
    }
    
    if (state.sessionMirror.token) {
        setSession(state.sessionMirror.token, state.sessionMirror.user, state.sessionMirror.expiry);
    }
    
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
        expiry: state.sessionMirror.expiry,
        capabilities: state.sessionMirror.capabilities
    };
    
    __storeValidSessionId({ token: state.sessionMirror.token, userId: state.user?.id || state.user?.userId });
    
    const activateKey = 'session_activated';
    if (!_loggedMessages.has(activateKey)) {
        _loggedMessages.add(activateKey);
        logStatus('SUCCESS', 'Session activated from mirror');
    }
    
    return true;
}

async function serviceInitStage() {
    try {
        const serviceKey = 'service_init_complete';
        if (!_loggedMessages.has(serviceKey)) {
            _loggedMessages.add(serviceKey);
            logStatus('SUCCESS', 'Service init complete');
        }
        
        return { success: true };
    } catch (error) {
        const failKey = 'service_init_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Service init failed: ${error.message}`);
        }
        return { success: false, fallback: true };
    }
}

function readyStage() {
    state.initialized = true;
    state.readyState = 'ready';
    
    window.addEventListener('message', receiveFromParent);
    state.listeners.add({ type: 'message', handler: receiveFromParent });
    
    const readyKey = 'status_core_ready';
    if (!_loggedMessages.has(readyKey)) {
        _loggedMessages.add(readyKey);
        logStatus('READY', 'Status core ready');
    }
    
    return { success: true, state: state.readyState, guestMode: state.isGuestMode };
}

const initializeCore = createErrorBoundary(async function(options = {}) {
    if (state.initialized) {
        const alreadyKey = 'core_already_initialized';
        if (!_loggedMessages.has(alreadyKey)) {
            _loggedMessages.add(alreadyKey);
            logStatus('INFO', 'Core already initialized');
        }
        return { success: true, state: state.readyState };
    }
    
    const startKey = 'core_init_start';
    if (!_loggedMessages.has(startKey)) {
        _loggedMessages.add(startKey);
        logStatus('INIT', 'Starting core initialization');
    }
    
    try {
        state.readyState = 'preflight';
        await preflightStage();
        
        state.readyState = 'dependencyCheck';
        await dependencyCheckStage();
        
        state.readyState = 'parentDetect';
        await parentDetectStage(options.parentTimeout || 2000);
        
        state.readyState = 'handshake';
        await handshakeStage({ maxRetries: 3 });
        
        state.readyState = 'sessionSync';
        await sessionSyncStage(options.sessionTimeout || 5000);
        
        state.readyState = 'serviceInit';
        await serviceInitStage();
        
        state.readyState = 'ready';
        const result = readyStage();
        
        return result;
        
    } catch (error) {
        const failKey = 'core_init_failed';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Core initialization: ${error.message}`);
        }
        
        if (state.sessionMirror.validated && isSessionReady() && __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id })) {
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

const requestSessionWrapper = createErrorBoundary(async function(options = { timeout: 5000 }) {
    if (!parentReady) {
        safeSend('REQUEST_SESSION', {});
        return { success: true, queued: true };
    }
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
    
    clearSession();
    
    state.sessionMirror = {
        ...state.sessionMirror,
        validated: false,
        guestMode: true
    };
    
    const guestKey = 'guest_mode_enabled';
    if (!_loggedMessages.has(guestKey)) {
        _loggedMessages.add(guestKey);
        logStatus('INFO', 'Guest mode enabled');
    }
    
    document.dispatchEvent(new CustomEvent('guestModeEnabled', {
        detail: { timestamp: Date.now() }
    }));
}

function loadCachedSession() {
    return null;
}

// =============================================
// SHUTDOWN & RESOURCE MANAGEMENT
// =============================================
const shutdownCore = createErrorBoundary(async function() {
    if (state.shutdownInProgress) return;
    
    state.shutdownInProgress = true;
    
    const shutdownKey = 'shutdown_start';
    if (!_loggedMessages.has(shutdownKey)) {
        _loggedMessages.add(shutdownKey);
        logStatus('INFO', 'Shutting down core');
    }
    
    try {
        state.intervals.forEach(clearInterval);
        state.intervals.clear();
        
        state.timeouts.forEach(clearTimeout);
        state.timeouts.clear();
        
        state.retryTimers.forEach((timer) => clearTimeout(timer));
        state.retryTimers.clear();
        
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
        state.retryQueue = [];
        
        messageHandlers.clear();
        
        _sentMessages.clear();
        processedMessageIds.clear();
        
        clearSession();
        
        if (state.parentDetected) {
            safeSendAction('STATUS_SHUTDOWN', {
                metrics: state.metrics
            });
        }
        
        const completeKey = 'shutdown_complete';
        if (!_loggedMessages.has(completeKey)) {
            _loggedMessages.add(completeKey);
            logStatus('SUCCESS', 'Core shutdown complete');
        }
        
    } catch (error) {
        const failKey = 'shutdown_error';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Shutdown error: ${error.message}`);
        }
    } finally {
        state.shutdownInProgress = false;
    }
}, 'shutdownCore', null);

// =============================================
// FEATURE ISOLATION SYSTEM
// =============================================
function registerFeature(name, implementation) {
    try {
        if (state.features.has(name)) {
            return false;
        }
        
        const wrappedImplementation = createErrorBoundary(implementation, `Feature:${name}`, null);
        state.features.set(name, wrappedImplementation);
        return true;
    } catch (e) {
        const regKey = `feature_reg_fail_${name}`;
        if (!_loggedMessages.has(regKey)) {
            _loggedMessages.add(regKey);
            logStatus('FAILED', `Feature registration failed: ${name} - ${e.message}`);
        }
        return false;
    }
}

function executeFeature(name, ...args) {
    try {
        if (isCircuitOpen(`feature:${name}`)) {
            return null;
        }
        
        if (state.disabledFeatures.has(name)) {
            return null;
        }
        
        const feature = state.features.get(name);
        if (!feature) {
            return null;
        }
        
        return feature(...args);
    } catch (error) {
        const execKey = `feature_exec_fail_${name}`;
        if (!_loggedMessages.has(execKey)) {
            _loggedMessages.add(execKey);
            logStatus('FAILED', `Feature execution failed: ${name} - ${error.message}`);
        }
        state.disabledFeatures.add(name);
        return null;
    }
}

// =============================================
// SESSION & TOKEN MANAGEMENT
// =============================================
function getSession() {
    if (state.sessionMirror.validated) {
        const isValid = __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id || state.sessionMirror.user?.userId });
        if (isValid) {
            return {
                active: true,
                user: state.sessionMirror.user,
                token: state.sessionMirror.token,
                expiry: state.sessionMirror.expiry,
                guestMode: false,
                permissions: [...state.sessionMirror.permissions],
                validated: true,
                source: state.sessionMirror.source,
                capabilities: state.sessionMirror.capabilities ? [...state.sessionMirror.capabilities] : []
            };
        }
    }
    
    return {
        active: state.sessionActive,
        user: state.user,
        token: state.token,
        expiry: state.sessionExpiry,
        guestMode: state.isGuestMode,
        permissions: [...state.permissionsGranted],
        validated: state.sessionMirror.validated,
        capabilities: []
    };
}

function isSessionValid() {
    if (state.isGuestMode) return true;
    if (state.sessionMirror.validated) {
        if (!state.sessionMirror.expiry) return true;
        const isValid = __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id || state.sessionMirror.user?.userId });
        if (!isValid) return false;
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
        handshakeState: state.handshakeState,
        sessionActive: state.sessionActive,
        sessionMirrorValid: state.sessionMirror.validated && __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id }),
        guestMode: state.isGuestMode,
        protocolVersion: state.protocolVersion,
        parentProtocolVersion: state.parentProtocolVersion,
        frameId: state.frameId,
        instanceId: state.instanceId,
        sessionId: state.sessionId,
        circuitBreakers: { ...CIRCUIT_BREAKER.failures },
        disabledFeatures: Array.from(state.disabledFeatures),
        pendingAcks: state.pendingAcks.size,
        pendingRequests: state.pendingRequests.size,
        retryQueue: state.retryQueue.length,
        offlineBuffer: state.offlineBuffer.length,
        features: state.features.size,
        messageCacheSize: state.messageCache.size,
        lastHeartbeat: state.lastHeartbeatSent,
        lastHeartbeatReceived: state.lastHeartbeatReceived,
        heartbeatFailures: state.heartbeatFailures,
        isOnline: state.isOnline,
        offlineModeEnabled: state.offlineModeEnabled,
        parentCapabilities: Array.from(state.parentCapabilities),
        originValidated: state.securityContext.originValidated,
        diagnosticsEnabled: state.diagnosticsEnabled,
        
        environment: IframeEnvironment.type,
        environmentDetails: {
            isLocalDev: IframeEnvironment.isLocalDev,
            isRenderHosted: IframeEnvironment.isRenderHosted,
            isVPNNetwork: IframeEnvironment.isVPNNetwork,
            isProduction: IframeEnvironment.isProduction,
            isSandboxed: IframeEnvironment.isSandboxed,
            latency: IframeEnvironment.latency,
            connectionType: IframeEnvironment.connectionType
        },
        
        lifecycle: getLifecycleState(),
        
        transport: IframeTransport.getStatus(),
        
        sessionClient: {
            sessionValid: SessionClient.sessionValid,
            sessionExpiry: SessionClient.sessionExpiry,
            offlineMode: SessionClient.offlineMode
        },
        
        navigation: NavigationGuard.getState(),
        
        parentReady: parentReady,
        
        sessionReady: isSessionReady()
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
    maxHandshakeRetries: 3,
    handshakeInterval: null,
    parentOrigin: null,
    handshakeInProgress: false,
    sessionValid: false,
    handshakeTimeout: null,
    sessionRequestSent: false,
    trustedOrigins: TRUSTED_ORIGINS,
    lastMessageOrigin: null,
    sequenceId: null,
    
    frameId: state.frameId,
    instanceId: state.instanceId,
    handshakeState: 'idle',
    childReadySent: false,
    parentReadyReceived: false,
    capabilities: new Set()
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
        
        const initKey = 'parent_coord_init';
        if (!_loggedMessages.has(initKey)) {
            _loggedMessages.add(initKey);
            logStatus('INFO', 'Parent coordination initialized');
        }
        
        if (isInState(LifecycleState.READY)) {
            sendChildReady();
        }
        
    } catch (error) {
        const failKey = 'parent_coord_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Parent coordination: ${error.message}`);
        }
        handleParentUnavailable();
    }
}

function handleEnhancedParentMessage(event) {
    try {
        parentCoordinator.lastMessageOrigin = event.origin;
        
        if (event.data?.type === 'STORAGE_RESULT') {
            StorageProxy.handleResponse(event);
            return;
        }
        
        if (event.data?.id && isDuplicateMessage(event.data.id)) {
            return;
        }
        
        if (!OriginTrustAdapter.validateMessageOrigin(event.origin)) {
            debugWarn(`Message from untrusted origin ignored: ${event.origin}`);
            return;
        }
        
        const message = event.data;
        
        if (!MessageValidator.validate(message).valid) {
            return;
        }
        
        const sanitizedMessage = MessageFirewall.sanitize(message);
        
        const messageKey = `${sanitizedMessage.type}:${sanitizedMessage.id || 'no-id'}:${sanitizedMessage.timestamp || Date.now()}`;
        if (state.messageCache.has(messageKey)) return;
        state.messageCache.add(messageKey);
        
        if (state.messageCache.size > 100) {
            const firstKey = state.messageCache.values().next().value;
            state.messageCache.delete(firstKey);
        }
        
        if (sanitizedMessage.type === 'PARENT_READY') {
            handleParentReady(sanitizedMessage);
            return;
        }
        
        // =============================================
        // SETTING CHANGED HANDLER - PLACED CORRECTLY HERE
        // =============================================
        if (sanitizedMessage.type === 'SETTING_CHANGED' || sanitizedMessage.type === 'SETTINGS_UPDATED') {
            const payload = sanitizedMessage.payload || sanitizedMessage.data || {};

            if (sanitizedMessage.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
                const { section, key, value } = payload;
                if (typeof applySettingToStatusModule === 'function') {
                    applySettingToStatusModule(section, key, value);
                }
                window.dispatchEvent(new CustomEvent('settingChanged', { 
                    detail: { section, key, value, timestamp: Date.now() } 
                }));
                if (typeof EventBus !== 'undefined') {
                    EventBus.emit('settingChanged', { section, key, value });
                }
            }

            if (sanitizedMessage.type === 'SETTINGS_UPDATED' && payload.settings) {
                const s = payload.settings;
                if (typeof applySettingToStatusModule === 'function') {
                    Object.entries(s).forEach(([sec, secVal]) => {
                        if (secVal && typeof secVal === 'object') {
                            Object.entries(secVal).forEach(([k, v]) => applySettingToStatusModule(sec, k, v));
                        }
                    });
                }
                if (typeof SafeStorage !== 'undefined') {
                    SafeStorage.setJSON('user_settings', s);
                }
                window.dispatchEvent(new CustomEvent('settingsUpdated', { 
                    detail: { settings: s, timestamp: Date.now() } 
                }));
                if (typeof EventBus !== 'undefined') {
                    EventBus.emit('settingsUpdated', { settings: s });
                }
            }
            return;
        }
        
        switch (sanitizedMessage.type) {
            case 'SESSION_DATA':
            case 'SESSION':
            case 'SESSION_ACTIVE':
            case 'SESSION_UPDATE':
                if (sanitizedMessage.payload && __isValidSession(sanitizedMessage.payload)) {
                    handleSecureSessionData(sanitizedMessage);
                } else {
                    logStatus('WARNING', 'Invalid session data in enhanced message - rejected');
                }
                break;
            case 'SESSION_SYNC':
                if (sanitizedMessage.payload && __isValidSession(sanitizedMessage.payload)) {
                    handleSecureSessionData(sanitizedMessage);
                }
                break;
            case 'LOGOUT':
                if (typeof handleLogout !== 'undefined') handleLogout(sanitizedMessage.data || sanitizedMessage.payload);
                break;
            case 'API_RESPONSE':
                if (typeof handleApiResponse !== 'undefined') handleApiResponse(sanitizedMessage);
                break;
            case 'API_ERROR':
                if (typeof handleApiError !== 'undefined') handleApiError(sanitizedMessage.data || sanitizedMessage.payload);
                break;
            case 'AUTH_VALIDATED':
                if (typeof handleAuthValidated !== 'undefined') handleAuthValidated(sanitizedMessage.data || sanitizedMessage.payload);
                break;
            case 'HANDSHAKE_RESPONSE':
                HandshakeClient.handleResponse(sanitizedMessage);
                break;
            case 'MODULE_REGISTERED':
                if (typeof ParentCommunication !== 'undefined') ParentCommunication.moduleRegistered = true;
                break;
            case 'HEARTBEAT':
                if (typeof ParentCommunication !== 'undefined') ParentCommunication.sendHeartbeatAck(sanitizedMessage.id);
                break;
            case 'PONG':
                state.lastHeartbeatReceived = Date.now();
                state.heartbeatFailures = 0;
                break;
            case 'PAGE_ACTIVATED':
                parentCoordinator.handshakeState = 'active';
                if (typeof loadFreshDataInBackground !== 'undefined' && isInState(LifecycleState.ACTIVE)) {
                    setTimeout(() => {
                        if (typeof loadFreshDataInBackground !== 'undefined') loadFreshDataInBackground();
                    }, 100);
                }
                break;
            case 'STATUS_POSTED':
            case 'STATUS_VIEWED':
            case 'STATUS_REACTED':
            case 'REACTION_REMOVED':
            case 'REACTION_CHANGED':
            case 'STATUS_EXPIRED':
            case 'STATUSES_UPDATE':
                document.dispatchEvent(new CustomEvent('parentStatusUpdate', {
                    detail: { type: sanitizedMessage.type, payload: sanitizedMessage.payload }
                }));
                break;
            default:
                break;
        }
        
    } catch (error) {
        const handlerKey = `enhanced_parent_msg_${error.message}`;
        if (!_loggedMessages.has(handlerKey)) {
            _loggedMessages.add(handlerKey);
            logStatus('FAILED', `handleEnhancedParentMessage: ${error.message}`);
        }
    }
}

function startSecureHandshake() {
    try {
        clearSecureHandshake();
        
        if (isInState(LifecycleState.READY)) {
            sendChildReady();
        }
        
    } catch (error) {
        const failKey = 'secure_handshake_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `Secure handshake: ${error.message}`);
        }
    }
}

function sendChildReadyMessage() {
    if (isInState(LifecycleState.READY)) {
        sendChildReady();
    }
}

function requestSessionFromParent() {
    safeSend('REQUEST_SESSION', {});
}

function handleSecureSessionData(message) {
    try {
        if (message.source !== 'parent' && message.source !== 'PARENT') return;
        
        const sessionData = message.data || message.payload;
        
        if (!sessionData) {
            return;
        }
        
        // Validate session data
        if (!__isValidSession(sessionData)) {
            logStatus('FAILED', 'Invalid secure session data - rejected');
            return;
        }
        
        // Check for duplicate
        if (__isDuplicateSession(sessionData)) {
            logStatus('WARNING', 'Duplicate secure session data ignored');
            return;
        }
        
        const updated = updateSessionMirror(sessionData, 'secure_handshake');
        
        if (updated) {
            parentCoordinator.sessionValid = true;
            parentCoordinator.handshakeComplete = true;
            parentCoordinator.handshakeState = 'active';
            parentCoordinator.handshakeInProgress = false;
            clearTimeout(parentCoordinator.handshakeTimeout);
            parentCoordinator.sessionData = sessionData;
            __storeValidSessionId(sessionData);
            
            if (typeof ParentCommunication !== 'undefined') ParentCommunication.handleSessionSync(sessionData);
            
            const dataKey = 'secure_session_data';
            if (!_loggedMessages.has(dataKey)) {
                _loggedMessages.add(dataKey);
                logStatus('SUCCESS', 'Secure session data received');
            }
            
            if (typeof bindUIAfterSession !== 'undefined') bindUIAfterSession();
            
            sendSecureResponseToParent('AUTH_VALIDATED', {
                success: true,
                module: MODULE_NAME,
                frameId: state.frameId
            });
            
            if (typeof startBackgroundInitializationWithSession !== 'undefined') startBackgroundInitializationWithSession();
        } else {
            parentCoordinator.handshakeInProgress = false;
            clearTimeout(parentCoordinator.handshakeTimeout);
        }
        
    } catch (error) {
        const failKey = 'secure_session_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `handleSecureSessionData: ${error.message}`);
        }
        parentCoordinator.handshakeInProgress = false;
        clearTimeout(parentCoordinator.handshakeTimeout);
    }
}

function bindUIAfterSession() {
    try {
        if (typeof window.initializeStatusUI === 'function') {
            window.initializeStatusUI();
        }
        if (typeof updateUIBasedOnAuth !== 'undefined') updateUIBasedOnAuth();
    } catch (error) {
        const bindKey = 'ui_bind_fail';
        if (!_loggedMessages.has(bindKey)) {
            _loggedMessages.add(bindKey);
            logStatus('FAILED', `bindUIAfterSession: ${error.message}`);
        }
    }
}

function updateUIBasedOnAuth() {
    try {
        document.dispatchEvent(new CustomEvent('sessionReady', {
            detail: { user: typeof currentUser !== 'undefined' ? currentUser : null }
        }));
    } catch (error) {
        const uiKey = 'ui_auth_fail';
        if (!_loggedMessages.has(uiKey)) {
            _loggedMessages.add(uiKey);
            logStatus('FAILED', `updateUIBasedOnAuth: ${error.message}`);
        }
    }
}

function sendSecureResponseToParent(type, data = {}) {
    try {
        if (!window.parent || window.parent === window) return;
        
        safeSend(type, {
            ...data,
            source: MODULE_NAME,
            timestamp: Date.now(),
            frameId: state.frameId
        });
        
    } catch (error) {
        const sendKey = 'secure_response_fail';
        if (!_loggedMessages.has(sendKey)) {
            _loggedMessages.add(sendKey);
            logStatus('FAILED', `sendSecureResponseToParent: ${error.message}`);
        }
    }
}

function handleSessionFailed() {
    parentCoordinator.handshakeInProgress = false;
    parentCoordinator.handshakeComplete = false;
    parentCoordinator.handshakeState = 'failed';
    
    logStatus('WAITING', 'Session failed - waiting for parent');
    
    if (state.sessionMirror.validated && isSessionReady() && __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id })) {
        activateSessionFromMirror();
    } else {
        if (typeof loadCachedDataInstantly !== 'undefined') loadCachedDataInstantly();
        enableGuestMode();
    }
    
    if (typeof initializeUIWithCachedData !== 'undefined') initializeUIWithCachedData();
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
        const clearKey = 'clear_handshake_fail';
        if (!_loggedMessages.has(clearKey)) {
            _loggedMessages.add(clearKey);
            logStatus('FAILED', `clearSecureHandshake: ${error.message}`);
        }
    }
}

function handleSessionData(sessionData) {
    try {
        if (!validateSessionData(sessionData)) {
            sendToParent('ERROR', {
                error: 'INVALID_SESSION_SCHEMA',
                message: 'Session data validation failed'
            });
            return;
        }
        
        // Validate session data before updating
        if (!__isValidSession(sessionData)) {
            logStatus('FAILED', 'Invalid session data in handleSessionData - rejected');
            sendToParent('ERROR', {
                error: 'INVALID_SESSION_DATA',
                message: 'Session data validation failed'
            });
            return;
        }
        
        updateSessionMirror(sessionData, 'session_data');
        
        parentCoordinator.sessionData = sessionData;
        parentCoordinator.handshakeComplete = true;
        parentCoordinator.handshakeState = 'active';
        
        if (typeof ParentCommunication !== 'undefined') ParentCommunication.handleSessionSync(sessionData);
        
        if (parentCoordinator.handshakeInterval) {
            clearInterval(parentCoordinator.handshakeInterval);
            parentCoordinator.handshakeInterval = null;
        }
        
        const dataKey = 'session_data_received';
        if (!_loggedMessages.has(dataKey)) {
            _loggedMessages.add(dataKey);
            logStatus('SUCCESS', 'Session data received');
        }
        
        sendToParent('AUTH_VALIDATED', {
            module: MODULE_NAME,
            success: true,
            frameId: state.frameId
        });
        
        if (typeof startBackgroundInitializationWithSession !== 'undefined') startBackgroundInitializationWithSession();
        
    } catch (error) {
        const failKey = 'session_data_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `handleSessionData: ${error.message}`);
        }
        sendToParent('ERROR', {
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
        
        // Validate update data
        if (!__isValidSession(updateData)) {
            logStatus('WARNING', 'Invalid session update data - rejected');
            return;
        }
        
        updateSessionMirror(updateData, 'session_update');
        
    } catch (error) {
        const updateKey = 'session_update_fail';
        if (!_loggedMessages.has(updateKey)) {
            _loggedMessages.add(updateKey);
            logStatus('FAILED', `handleSessionUpdate: ${error.message}`);
        }
    }
}

function handleLogout(logoutData) {
    try {
        parentCoordinator.sessionData = null;
        parentCoordinator.handshakeComplete = false;
        parentCoordinator.sessionValid = false;
        parentCoordinator.handshakeState = 'idle';
        
        transitionTo(LifecycleState.BOOT, 'logout');
        
        state.sessionMirror = {
            token: null,
            user: null,
            expiry: null,
            permissions: [],
            timestamp: 0,
            messageId: null,
            validated: false,
            source: null,
            refreshToken: null,
            lastRefresh: null,
            refreshInProgress: false,
            capabilities: []
        };
        
        if (typeof currentUser !== 'undefined') currentUser = null;
        if (typeof userData !== 'undefined') userData = null;
        
        clearSession();
        
        if (typeof isTokenReady !== 'undefined') isTokenReady = false;
        state.sessionActive = false;
        state.user = null;
        state.token = null;
        enableGuestMode();
        
        const logoutKey = 'logout_handled';
        if (!_loggedMessages.has(logoutKey)) {
            _loggedMessages.add(logoutKey);
            logStatus('INFO', 'Logout handled');
        }
        
        safeSendAction('CHILD_LOADED', {
            module: MODULE_NAME,
            loggedOut: true
        });
        
    } catch (error) {
        const failKey = 'logout_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `handleLogout: ${error.message}`);
        }
    }
}

function handleParentUnavailable() {
    if (typeof loadCachedDataInstantly !== 'undefined') loadCachedDataInstantly();
    
    if (state.sessionMirror.validated && isSessionReady() && __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id })) {
        activateSessionFromMirror();
    } else {
        enableGuestMode();
    }
    
    state.offlineModeEnabled = true;
    
    const unavailKey = 'parent_unavailable';
    if (!_loggedMessages.has(unavailKey)) {
        _loggedMessages.add(unavailKey);
        logStatus('WARNING', 'Parent unavailable');
    }
    
    logStatus('WAITING', 'Parent unavailable - waiting for parent');
}

function startBackgroundInitializationWithSession() {
    if (typeof isBackgroundInitialized !== 'undefined' && isBackgroundInitialized) return;
    if (_backgroundInitWithSessionStarted) return; // ← ADD THIS LINE
    _backgroundInitWithSessionStarted = true; // ← ADD THIS LINE
    
    try {
        setTimeout(async () => {
            try {
                if (typeof loadFreshDataInBackground !== 'undefined' && isInState(LifecycleState.ACTIVE)) {
                    await loadFreshDataInBackground();
                }
                
                if (typeof isBackgroundInitialized !== 'undefined') {
                    isBackgroundInitialized = true;
                }
                
                if (parentCoordinator.handshakeComplete) {
                    safeSendAction('UI_READY', {
                        module: MODULE_NAME
                    });
                }
                
                const bgKey = 'background_init_complete';
                if (!_loggedMessages.has(bgKey)) {
                    _loggedMessages.add(bgKey);
                    logStatus('SUCCESS', 'Background initialization complete');
                }
            } catch (error) {
                const bgFailKey = 'background_init_fail';
                if (!_loggedMessages.has(bgFailKey)) {
                    _loggedMessages.add(bgFailKey);
                    logStatus('FAILED', `startBackgroundInitialization: ${error.message}`);
                }
            }
        }, 1000);
    } catch (error) {
        const bgSetupKey = 'background_init_setup_fail';
        if (!_loggedMessages.has(bgSetupKey)) {
            _loggedMessages.add(bgSetupKey);
            logStatus('FAILED', `startBackgroundInitialization: ${error.message}`);
        }
    }
}

async function makeParentApiRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
        try {
            const requestId = genReqId();
            
            const responseHandler = (event) => {
                try {
                    if (!OriginTrustAdapter.validateMessageOrigin(event.origin)) return;
                    
                    const message = event.data;
                    if (!message || !message.type || !message.payload || message.payload.requestId !== requestId) return;
                    
                    if (message.type === 'API_RESPONSE') {
                        window.removeEventListener('message', responseHandler);
                        resolve(message.payload.response || message.payload.data);
                    } else if (message.type === 'API_ERROR') {
                        window.removeEventListener('message', responseHandler);
                        reject(new Error(message.payload.error || 'API Error'));
                    }
                } catch (error) {
                    window.removeEventListener('message', responseHandler);
                    reject(error);
                }
            };
            
            window.addEventListener('message', responseHandler);
            
            safeSend('API_REQUEST', {
                requestId,
                endpoint,
                options: {
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body,
                    credentials: 'include'
                },
                timestamp: Date.now(),
                frameId: state.frameId
            });
            
            const reqKey = `api_req_${endpoint}`;
            if (!_loggedMessages.has(reqKey)) {
                _loggedMessages.add(reqKey);
                logStatus('SENDING', `API request: ${endpoint}`);
            }
            
            const timeoutMs = IframeEnvironment.isVPNNetwork ? 60000 : 30000;
            
            const timer = setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                reject(new Error('Request timeout'));
            }, timeoutMs);
            
            state.timeouts.add(timer);
            
        } catch (error) {
            reject(error);
        }
    });
}

// NOTE: Real handleApiResponse is defined earlier (line ~430) - this is a supplemental notifier
function notifyApiResponse(responseData) {
    document.dispatchEvent(new CustomEvent('apiResponse', {
        detail: responseData
    }));
}

function handleApiError(errorData) {
    const errorKey = `api_error_${errorData.error || 'unknown'}`;
    if (!_loggedMessages.has(errorKey)) {
        _loggedMessages.add(errorKey);
        logStatus('FAILED', `API Error: ${errorData.error || 'Unknown error'}`);
    }
}

function handleAuthValidated(data) {
    try {
        if (data.success) {
            if (typeof isTokenReady !== 'undefined') {
                isTokenReady = true;
                if (typeof triggerTokenReadyCallbacks !== 'undefined') {
                    triggerTokenReadyCallbacks();
                }
            }
            const authKey = 'auth_validated_handler';
            if (!_loggedMessages.has(authKey)) {
                _loggedMessages.add(authKey);
                logStatus('SUCCESS', 'Auth validated');
            }
        }
    } catch (error) {
        const failKey = 'auth_validated_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `handleAuthValidated: ${error.message}`);
        }
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
            // Check all possible token-ready signals immediately
            if (isTokenReady || isSessionReady() || getSessionToken()) {
                resolve(true);
                return;
            }
            
            if (state.sessionMirror.validated && state.sessionMirror.token && __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id })) {
                isTokenReady = true;
                resolve(true);
                triggerTokenReadyCallbacks();
                return;
            }
            
            if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData && __isValidSession(parentCoordinator.sessionData)) {
                isTokenReady = true;
                resolve(true);
                triggerTokenReadyCallbacks();
                return;
            }
            
            let resolved = false;
            // 30-second hard timeout — resolves true optimistically if any token source appears
            const hardTimeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    if (getSessionToken()) { resolve(true); } else { resolve(false); }
                }
            }, 30000);
            
            const checkToken = () => {
                try {
                    if (resolved) return;
                    const tok = getSessionToken();
                    const ready = (isTokenReady || isSessionReady() || tok) &&
                                  (tok ? __isValidSession({ token: tok, userId: getSessionUserId() }) : isSessionReady());
                    if (ready) {
                        resolved = true;
                        clearTimeout(hardTimeout);
                        isTokenReady = true;
                        resolve(true);
                        triggerTokenReadyCallbacks();
                        return;
                    }
                    setTimeout(checkToken, 100);
                } catch (error) {
                    if (!resolved) { resolved = true; clearTimeout(hardTimeout); resolve(false); }
                }
            };
            
            checkToken();
        } catch (error) {
            resolve(false);
        }
    });
}

// NOTE: duplicate waitForTokenReady removed — the version above is the canonical one

function onTokenReady(callback) {
    try {
        if (isTokenReady || (isSessionReady() && __isValidSession({ token: getSessionToken(), userId: getSessionUserId() }))) {
            callback();
        } else {
            tokenReadyCallbacks.push(callback);
        }
    } catch (error) {
        const readyKey = 'token_ready_callback_fail';
        if (!_loggedMessages.has(readyKey)) {
            _loggedMessages.add(readyKey);
            logStatus('FAILED', `onTokenReady: ${error.message}`);
        }
    }
}

function triggerTokenReadyCallbacks() {
    try {
        while (tokenReadyCallbacks.length > 0) {
            const callback = tokenReadyCallbacks.shift();
            try {
                callback();
            } catch (error) {
                const cbKey = 'token_callback_fail';
                if (!_loggedMessages.has(cbKey)) {
                    _loggedMessages.add(cbKey);
                    logStatus('FAILED', `triggerTokenReadyCallbacks: ${error.message}`);
                }
            }
        }
    } catch (error) {
        const triggerKey = 'token_trigger_fail';
        if (!_loggedMessages.has(triggerKey)) {
            _loggedMessages.add(triggerKey);
            logStatus('FAILED', `triggerTokenReadyCallbacks: ${error.message}`);
        }
    }
}

function getUnifiedToken() {
    return getSessionToken();
}

function migrateLegacyTokens() {
    return null;
}

function isAuthenticated() {
    try {
        if (state.sessionMirror.validated && state.sessionMirror.token && state.sessionMirror.user) {
            return __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id });
        }
        if (parentCoordinator.handshakeComplete && parentCoordinator.sessionData) {
            return __isValidSession(parentCoordinator.sessionData);
        }
        if (state.sessionActive && !state.isGuestMode) {
            return __isValidSession({ token: state.token, userId: state.user?.id });
        }
        return isSessionReady();
    } catch (error) {
        return false;
    }
}

async function queueApiRequest(requestFunction) {
    if (isTokenReady || (isSessionReady() && __isValidSession({ token: getSessionToken(), userId: getSessionUserId() }))) return requestFunction();
    
    return new Promise((resolve, reject) => {
        try {
            pendingApiRequests.push({ requestFunction, resolve, reject });
            if (!apiCheckInterval) startTokenReadinessCheck();
        } catch (error) {
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
                reject(error);
            }
        }
    } catch (error) {
        const processKey = 'process_api_fail';
        if (!_loggedMessages.has(processKey)) {
            _loggedMessages.add(processKey);
            logStatus('FAILED', `processPendingApiRequests: ${error.message}`);
        }
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
                
                if (isTokenReady || (isSessionReady() && __isValidSession({ token: getSessionToken(), userId: getSessionUserId() })) || 
                    parentCoordinator.handshakeComplete || 
                    state.token || (state.sessionMirror.validated && __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id }))) {
                    clearInterval(apiCheckInterval);
                    apiCheckInterval = null;
                    isTokenReady = true;
                    processPendingApiRequests();
                    triggerTokenReadyCallbacks();
                } else if (checkCount >= maxChecks) {
                    clearInterval(apiCheckInterval);
                    apiCheckInterval = null;
                }
            } catch (error) {}
        }, 100);
    } catch (error) {
        const startKey = 'token_check_start_fail';
        if (!_loggedMessages.has(startKey)) {
            _loggedMessages.add(startKey);
            logStatus('FAILED', `startTokenReadinessCheck: ${error.message}`);
        }
    }
}

// =============================================
// SECURE API CALL WITH FALLBACK - Using parent proxy
// REPLACE the entire secureApiCall function with this:

// =============================================
// REPLACE the entire secureApiCall function (around line 4240) with:
// =============================================

const secureApiCall = createErrorBoundary(async function(endpoint, options = {}) {
    // ALWAYS use parent proxy - never direct fetch
    if (!ensureActive('secureApiCall')) {
        throw new Error('Module not active');
    }
    
    if (!isSessionReady()) {
        throw new Error('Session not ready');
    }
    
    const method = options.method || 'GET';
    const body = options.body;
    const params = options.params;
    
    // Use makeApiRequest which sends to parent and returns the unwrapped data object.
    // DO NOT wrap in a fake Response — all callers access properties directly
    // (response?.statuses, response?.data?.user, etc.).
    const result = await makeApiRequest(endpoint, method, body, params);
    return result;
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
// INSTANT UI RENDERING WITH CACHED DATA (CACHE ONLY, NOT PRIMARY)
// =============================================
function initializeUIWithCachedData() {
    try {
        loadCachedDataInstantly();
        
        if (typeof window.initializeStatusUI === 'function') {
            window.initializeStatusUI();
        }
        
        if (parentReady) {
            startBackgroundInitializationWithSession();
        }
        
        const uiKey = 'ui_cached_init';
        if (!_loggedMessages.has(uiKey)) {
            _loggedMessages.add(uiKey);
            logStatus('INFO', 'UI initialized with cached data');
        }
        
    } catch (error) {
        const failKey = 'ui_cached_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `initializeUIWithCachedData: ${error.message}`);
        }
    }
}

function loadUserFromCache() {
    try {
        // Try memoryStore first (synchronous, always available)
        const raw = SafeStorage.memoryStore.get(LOCAL_STORAGE_KEYS.USER);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.id) return parsed;
        }
    } catch(e) {}
    return null;
}

async function loadCachedDataInstantly() {
    try {
        const statusesData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.STATUSES);
        if (statusesData) {
            try { statuses = statusesData || []; } catch { statuses = []; }
            
            const statusKey = 'statuses_cached';
            if (!_loggedMessages.has(statusKey)) {
                _loggedMessages.add(statusKey);
                logStatus('INFO', `Loaded ${statuses.length} statuses from cache`);
            }
        }
        
        const myStatusesData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.MY_STATUSES);
        if (myStatusesData) {
            try { myStatuses = myStatusesData || []; } catch { myStatuses = []; }
        }
        
        const viewedStatusesData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.VIEWED_STATUSES);
        if (viewedStatusesData) {
            try { viewedStatuses = new Set(viewedStatusesData || []); } catch { viewedStatuses = new Set(); }
        }
        
        const mutedUsersData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.MUTED_USERS);
        if (mutedUsersData) {
            try { mutedUsers = new Set(mutedUsersData || []); } catch { mutedUsers = new Set(); }
        }
        
        const highlightsData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS);
        if (highlightsData) {
            try { highlights = highlightsData || []; } catch { highlights = []; }
        }
        
        const draftsData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
        if (draftsData) {
            try { drafts = draftsData || []; } catch { drafts = []; }
        }
        
        const scheduledData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SCHEDULED);
        if (scheduledData) {
            try { scheduledStatuses = scheduledData || []; } catch { scheduledStatuses = []; }
        }
        
        const pendingRepliesData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.PENDING_REPLIES);
        if (pendingRepliesData) {
            try { pendingReplies = pendingRepliesData || []; } catch { pendingReplies = []; }
        }
        
        const pendingReactionsData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS);
        if (pendingReactionsData) {
            try { pendingReactions = pendingReactionsData || []; } catch { pendingReactions = []; }
        }
        
        const moodData = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.MOOD_DATA);
        if (moodData) {
            try { moodChartData = moodData || []; } catch { moodChartData = []; }
        }
        
        const streakData = await SafeStorage.get(LOCAL_STORAGE_KEYS.STREAK);
        if (streakData) {
            try { streakCount = parseInt(streakData) || 0; } catch { streakCount = 0; }
        }
        
        const lastPostDateData = await SafeStorage.get(LOCAL_STORAGE_KEYS.LAST_POST_DATE);
        if (lastPostDateData) {
            try { lastPostDate = new Date(lastPostDateData); } catch { lastPostDate = null; }
        }

        // Restore LAST_SYNC into memoryStore so TTL guard works correctly on first load
        const lastSyncData = await SafeStorage.get(LOCAL_STORAGE_KEYS.LAST_SYNC);
        if (lastSyncData) {
            SafeStorage.memoryStore.set(LOCAL_STORAGE_KEYS.LAST_SYNC, lastSyncData);
        }
        
    } catch (error) {}
}

// =============================================
// BACKGROUND INITIALIZATION
// =============================================
async function startBackgroundInitialization() {
    if (isBackgroundInitialized) return;
    if (_backgroundInitStarted) return; // ← ADD THIS LINE
    _backgroundInitStarted = true; // ← ADD THIS LINE
    
    try {
        onTokenReady(async () => {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                
                if (parentCoordinator.handshakeComplete && parentReady) {
                    safeSendAction('UI_READY', {
                        module: MODULE_NAME
                    });
                }
                
                const bgKey = 'background_init_complete';
                if (!_loggedMessages.has(bgKey)) {
                    _loggedMessages.add(bgKey);
                    logStatus('SUCCESS', 'Background initialization complete');
                }
            } catch (error) {}
        });
        
        if ((isSessionReady() && __isValidSession({ token: getSessionToken(), userId: getSessionUserId() })) || parentCoordinator.handshakeComplete || state.token || (state.sessionMirror.validated && __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id }))) {
            try {
                await loadFreshDataInBackground();
                isBackgroundInitialized = true;
                
                if (parentCoordinator.handshakeComplete && parentReady) {
                    safeSendAction('UI_READY', {
                        module: MODULE_NAME
                    });
                }
                
                const bgKey = 'background_init_complete';
                if (!_loggedMessages.has(bgKey)) {
                    _loggedMessages.add(bgKey);
                    logStatus('SUCCESS', 'Background initialization complete');
                }
            } catch (error) {}
        }
        
    } catch (error) {}
}

async function loadFreshDataInBackground() {
    try {
        // --- TTL guard: skip full refresh if data was synced recently (< 60 s) ---
        const SYNC_TTL_MS = 60_000;
        const lastSyncRaw = SafeStorage.memoryStore.get(LOCAL_STORAGE_KEYS.LAST_SYNC);
        if (lastSyncRaw) {
            const age = Date.now() - parseInt(lastSyncRaw, 10);
            if (age < SYNC_TTL_MS) {
                logStatus('INFO', `Skipping background refresh — data is ${Math.round(age/1000)}s old (TTL ${SYNC_TTL_MS/1000}s)`);
                return;
            }
        }

        const loadPromises = [];
        if (typeof loadStatusesInBackground !== 'undefined') loadPromises.push(safeApiOperation(() => loadStatusesInBackground()));
        if (typeof loadMyStatusesInBackground !== 'undefined') loadPromises.push(safeApiOperation(() => loadMyStatusesInBackground()));
        if (typeof loadHighlightsInBackground !== 'undefined') loadPromises.push(safeApiOperation(() => loadHighlightsInBackground()));
        if (typeof loadUserDataInBackground !== 'undefined') loadPromises.push(safeApiOperation(() => loadUserDataInBackground()));
        await Promise.allSettled(loadPromises);

        // Stamp the sync time
        SafeStorage.set(LOCAL_STORAGE_KEYS.LAST_SYNC, String(Date.now()));
    } catch (error) {}
}

async function safeApiOperation(operation) {
    try {
        if (!isAuthenticated()) throw new Error('Not authenticated');
        return await operation();
    } catch (error) {
        return null;
    }
}


async function loadStatusesInBackground() {
    // Wait for token before attempting API call
    try {
        await waitForTokenReady();
    } catch (err) {
        logStatus('WARNING', 'Token wait timeout for /status - skipping');
        return;
    }
    
    if (!isSessionReady() && !getSessionToken()) {
        logStatus('WARNING', 'No token available for /status - skipping');
        return;
    }
    
    try {
        // Use secureApiCall which now uses parent proxy
        const response = await secureApiCall('/api/status');
        const list = response?.statuses || response?.data?.statuses || [];
        if (list && list.length >= 0) {
            statuses = list;
            if (typeof filterStatusesByPrivacy !== 'undefined') statuses = filterStatusesByPrivacy(statuses);
            statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
            logStatus('SUCCESS', `Loaded ${statuses.length} statuses`);
        }
    } catch (error) {
        logStatus('FAILED', `loadStatusesInBackground: ${error.message}`);
        throw error;
    }
}

// Helper function to wait for token with timeout
async function waitForToken(timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        if (isSessionReady() && getSessionToken()) {
            return getSessionToken();
        }
        if (isTokenReady && getSessionToken()) {
            return getSessionToken();
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null;
}

async function loadMyStatusesInBackground() {
    // Wait for token to be available using the existing token readiness system
    try {
        await waitForTokenReady();
    } catch (err) {
        logStatus('WARNING', 'Token wait timeout for /status/my - skipping');
        return;
    }
    
    // Double-check token is actually ready
    if (!isSessionReady() && !getSessionToken()) {
        logStatus('WARNING', 'No token available for /status/my - skipping');
        return;
    }
    
    try {
        // Use makeApiRequest directly (same as messages module)
        const response = await makeApiRequest('/api/status/my', 'GET');
        const list = response?.statuses || response?.data?.statuses || [];
        if (Array.isArray(list)) {
            myStatuses = list;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
            logStatus('SUCCESS', `Loaded ${myStatuses.length} my statuses`);
        }
    } catch (error) {
        logStatus('FAILED', `loadMyStatusesInBackground: ${error.message}`);
        // Serve cache on failure so UI shows previous statuses
        try {
            const cached = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.MY_STATUSES);
            if (cached && Array.isArray(cached) && cached.length > 0) {
                myStatuses = cached;
                logStatus('INFO', `Serving ${cached.length} cached my-statuses after fetch failure`);
            }
        } catch (_) {}
        throw error;
    }
}
async function loadFriendsStatusesInBackground() {
    try {
        const response = await secureApiCall('/api/status/friends');
        const list = response?.statuses || response?.data?.statuses || [];
        if (list) {
            friendsStatuses = list;
            logStatus('SUCCESS', `Loaded ${friendsStatuses.length} friends statuses`);
            notifyStatusObservers();
        }
    } catch (error) {
        logStatus('WARNING', `loadFriendsStatusesInBackground: ${error.message}`);
    }
}

async function loadHighlightsInBackground() {
    // Wait for token before attempting API call
    try {
        await waitForTokenReady();
    } catch (err) {
        logStatus('WARNING', 'Token wait timeout for /highlights - skipping');
        return;
    }
    
    if (!isSessionReady() && !getSessionToken()) {
        logStatus('WARNING', 'No token available for /highlights - skipping');
        return;
    }
    
    try {
        // Use makeApiRequest directly (same as messages module)
        const response = await makeApiRequest('/api/status/highlights', 'GET');
        const list = response?.statuses || response?.data?.statuses || [];
        if (Array.isArray(list)) {
            // highlights endpoint returns top-liked/viewed statuses — keep all of them
            highlights = list;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS, highlights);
            logStatus('SUCCESS', `Loaded ${highlights.length} highlights`);
        }
    } catch (error) {
        logStatus('FAILED', `loadHighlightsInBackground: ${error.message}`);
        // Serve cache on failure
        try {
            const cached = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS);
            if (cached && Array.isArray(cached) && cached.length > 0) {
                highlights = cached;
                logStatus('INFO', `Serving ${cached.length} cached highlights after fetch failure`);
            }
        } catch (_) {}
        throw error;
    }
}

async function loadUserDataInBackground() {
    // Wait for token before attempting API call
    try {
        await waitForTokenReady();
    } catch (err) {
        logStatus('WARNING', 'Token wait timeout for /auth/me - skipping');
        return;
    }
    
    if (!isSessionReady() && !getSessionToken()) {
        logStatus('WARNING', 'No token available for /auth/me - skipping');
        return;
    }
    
    try {
        const response = await secureApiCall('/api/auth/me');
        // makeApiRequest unwraps { success, data:{user} } → response = { user:{...} }
        const user = response?.user || response?.data?.user || response;
        if (user && (user.id || user.userId)) {
            currentUser = user;
            userData = user;
            // Persist to SafeStorage so loadUserFromCache() can serve it on next load
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER, user);
            logStatus('SUCCESS', 'User data loaded');
        }
    } catch (error) {
        logStatus('WARNING', `loadUserDataInBackground: ${error.message}`);
        // Serve cached user on failure
        const cached = loadUserFromCache();
        if (cached && !currentUser) {
            currentUser = cached;
            userData = cached;
            logStatus('INFO', 'Serving cached user data after fetch failure');
        }
    }
}

// =============================================
// BOOTSTRAP APPLICATION
// =============================================
async function bootstrapApp() {
    try {
        initializeParentCoordination();
        initializeUIWithCachedData();
        startTokenReadinessCheck();
        
        setTimeout(() => {
            safeSendAction('CHILD_LOADED', {
                module: MODULE_NAME
            });
        }, 500);
        
        const bootKey = 'app_bootstrapped';
        if (!_loggedMessages.has(bootKey)) {
            _loggedMessages.add(bootKey);
            logStatus('SUCCESS', 'App bootstrapped');
        }
        
        return true;
    } catch (error) {
        const failKey = 'bootstrap_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `bootstrapApp: ${error.message}`);
        }
        return false;
    }
}

const bootstrapApplication = bootstrapApp;

// =============================================
// AUTHENTICATION ERROR HANDLING
// =============================================
function handleAuthError(message) {
    try {
        if (parentCoordinator.handshakeComplete && parentReady) {
            safeSendAction('NEEDS_AUTH', {
                module: MODULE_NAME,
                error: message
            });
        }
        
        if (statuses.length === 0 && myStatuses.length === 0) {
            // No action needed
        } else {
            state.offlineModeEnabled = true;
            isOfflineMode = true;
            
            logStatus('WAITING', 'Auth error - waiting for parent');
        }
        
        const authKey = 'auth_error';
        if (!_loggedMessages.has(authKey)) {
            _loggedMessages.add(authKey);
            logStatus('WARNING', message);
        }
    } catch (error) {}
}

async function initializeStatusSystem() {
    try {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout loading data')), 10000)
        );
        
        await Promise.race([loadInitialData(), timeoutPromise]);
        
    } catch (error) {
        loadCachedDataInstantly();
        if (!state.offlineModeEnabled) state.offlineModeEnabled = true;
        if (!isOfflineMode) isOfflineMode = true;
        
        logStatus('WAITING', 'Data load timeout - using cached data');
        
        const timeoutKey = 'data_load_timeout';
        if (!_loggedMessages.has(timeoutKey)) {
            _loggedMessages.add(timeoutKey);
            logStatus('WARNING', 'Data load timeout, using cached data');
        }
    }
}

// ADD THESE VARIABLES RIGHT BEFORE THE FUNCTION
let _initialDataLoading = false;
let _initialDataPromise = null;

async function loadInitialData() {
    if (_initialDataLoading) {
        return _initialDataPromise;
    }
    
    _initialDataLoading = true;
    _initialDataPromise = (async () => {
        try {
            // Use makeApiRequest for all calls
            const statusesResponse = await makeApiRequest('/api/status', 'GET');
            const list = statusesResponse?.statuses || statusesResponse?.data?.statuses || [];
            if (list) {
                statuses = list;
                if (typeof filterStatusesByPrivacy !== 'undefined') statuses = filterStatusesByPrivacy(statuses);
                statuses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
            }
            
            const myStatusesResponse = await makeApiRequest('/api/status/my', 'GET');
            const myList = myStatusesResponse?.statuses || myStatusesResponse?.data?.statuses || [];
            if (myList) {
                myStatuses = myList;
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
            }
            
            const friendsResponse = await makeApiRequest('/api/status/friends', 'GET');
            const friendsList = friendsResponse?.statuses || friendsResponse?.data?.statuses || [];
            if (friendsList) {
                friendsStatuses = friendsList;
            }
            
            const userResponse = await makeApiRequest('/api/auth/me', 'GET');
            if (userResponse && (userResponse.data?.user || userResponse.user)) {
                currentUser = userResponse.data?.user || userResponse.user;
                userData = currentUser;
            }
            
            logStatus('SUCCESS', 'Initial data loaded');
        } catch (error) {
            logStatus('FAILED', `loadInitialData: ${error.message}`);
            throw error;
        } finally {
            _initialDataLoading = false;
        }
    })();
    
    return _initialDataPromise;
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
        return 'No statuses available';
    }
}

// =============================================
// STATUS ACTIONS - WITH PARENT ROUTING
// =============================================
const addReactionToStatus = createErrorBoundary(async function(statusId, reaction) {
    if (!statusId || !reaction) throw new Error('Missing required parameters');
    
    const reactKey = `reaction_add_${statusId}_${reaction}`;
    if (!_loggedMessages.has(reactKey)) {
        _loggedMessages.add(reactKey);
        logStatus('REACTION', `Adding ${reaction} to ${statusId}`);
    }
    
    if (state.offlineModeEnabled) {
        pendingReactions.push({ statusId, reaction, timestamp: new Date().toISOString() });
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        const offlineKey = `reaction_offline_${statusId}_${reaction}`;
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('SUCCESS', `Reaction queued offline: ${reaction}`);
        }
        return { success: true, offline: true };
    }
    
    return safeSendAction('ADD_REACTION', { statusId, reaction });
}, 'addReactionToStatus', { success: false });

const removeReactionFromStatus = createErrorBoundary(async function(statusId, reaction) {
    if (!statusId || !reaction) throw new Error('Missing required parameters');
    
    const removeKey = `reaction_remove_${statusId}_${reaction}`;
    if (!_loggedMessages.has(removeKey)) {
        _loggedMessages.add(removeKey);
        logStatus('REACTION', `Removing ${reaction} from ${statusId}`);
    }
    
    if (state.offlineModeEnabled) {
        pendingReactions = pendingReactions.filter(r => !(r.statusId === statusId && r.reaction === reaction));
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        const offlineKey = `reaction_remove_offline_${statusId}`;
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('SUCCESS', `Reaction removal queued offline`);
        }
        return { success: true, offline: true };
    }
    
    return safeSendAction('REMOVE_REACTION', { statusId, reaction });
}, 'removeReactionFromStatus', { success: false });

const changeReaction = createErrorBoundary(async function(statusId, oldEmoji, newEmoji) {
    if (!statusId || !oldEmoji || !newEmoji) throw new Error('Missing required parameters');
    
    const changeKey = `reaction_change_${statusId}_${oldEmoji}_to_${newEmoji}`;
    if (!_loggedMessages.has(changeKey)) {
        _loggedMessages.add(changeKey);
        logStatus('REACTION', `Changing from ${oldEmoji} to ${newEmoji} on ${statusId}`);
    }
    
    if (state.offlineModeEnabled) {
        pendingReactions = pendingReactions.filter(r => !(r.statusId === statusId && r.reaction === oldEmoji));
        pendingReactions.push({ statusId, reaction: newEmoji, timestamp: new Date().toISOString() });
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);
        const offlineKey = `reaction_change_offline_${statusId}`;
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('SUCCESS', `Reaction change queued offline`);
        }
        return { success: true, offline: true };
    }
    
    return safeSendAction('CHANGE_REACTION', { statusId, oldEmoji, newEmoji });
}, 'changeReaction', { success: false });

const trackStatusView = createErrorBoundary(async function(statusId) {
    if (!statusId) throw new Error('Missing status ID');
    
    if (viewedStatuses.has(statusId)) {
        const viewedKey = `status_already_viewed_${statusId}`;
        if (!_loggedMessages.has(viewedKey)) {
            _loggedMessages.add(viewedKey);
            logStatus('VIEW', `Status ${statusId} already viewed`);
        }
        return { success: true, alreadyViewed: true };
    }
    
    const trackKey = `track_view_${statusId}`;
    if (!_loggedMessages.has(trackKey)) {
        _loggedMessages.add(trackKey);
        logStatus('VIEW', `Tracking view for ${statusId}`);
    }
    
    if (state.offlineModeEnabled) {
        viewedStatuses.add(statusId);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.VIEWED_STATUSES, Array.from(viewedStatuses));
        const offlineKey = `view_offline_${statusId}`;
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('VIEW', `View tracked offline for ${statusId}`);
        }
        return { success: true, offline: true };
    }
    
    viewedStatuses.add(statusId);
    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.VIEWED_STATUSES, Array.from(viewedStatuses));
    
    return safeSendAction('VIEW_STATUS', { statusId });
}, 'trackStatusView', { success: false });

const voteOnPoll = createErrorBoundary(async function(statusId, optionId) {
    if (!statusId || !optionId) throw new Error('Missing required parameters');
    
    const voteKey = `vote_${statusId}_${optionId}`;
    if (!_loggedMessages.has(voteKey)) {
        _loggedMessages.add(voteKey);
        logStatus('SENDING', `Voting on poll ${statusId}, option ${optionId}`);
    }
    
    if (state.offlineModeEnabled) return { success: false, offline: true };
    
    return safeSendAction('VOTE_POLL', { statusId, optionId });
}, 'voteOnPoll', { success: false });

const pinStatus = createErrorBoundary(async function(statusData) {
    if (!statusData || !statusData.id) throw new Error('Invalid status data');
    
    const pinKey = `pin_${statusData.id}`;
    if (!_loggedMessages.has(pinKey)) {
        _loggedMessages.add(pinKey);
        logStatus('SENDING', `Pinning status ${statusData.id}`);
    }
    
    return safeSendAction('PIN_STATUS', { statusId: statusData.id });
}, 'pinStatus', { success: false });

const unpinStatus = createErrorBoundary(async function(statusData) {
    if (!statusData || !statusData.id) throw new Error('Invalid status data');
    
    const unpinKey = `unpin_${statusData.id}`;
    if (!_loggedMessages.has(unpinKey)) {
        _loggedMessages.add(unpinKey);
        logStatus('SENDING', `Unpinning status ${statusData.id}`);
    }
    
    return safeSendAction('UNPIN_STATUS', { statusId: statusData.id });
}, 'unpinStatus', { success: false });

const muteUser = createErrorBoundary(async function(userId) {
    if (!userId) throw new Error('Invalid user ID');
    
    const muteKey = `mute_${userId}`;
    if (!_loggedMessages.has(muteKey)) {
        _loggedMessages.add(muteKey);
        logStatus('SENDING', `Muting user ${userId}`);
    }
    
    mutedUsers.add(userId);
    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MUTED_USERS, Array.from(mutedUsers));
    
    return safeSendAction('MUTE_USER', { userId });
}, 'muteUser', { success: false });

const unmuteUser = createErrorBoundary(async function(userId) {
    if (!userId) throw new Error('Invalid user ID');
    
    const unmuteKey = `unmute_${userId}`;
    if (!_loggedMessages.has(unmuteKey)) {
        _loggedMessages.add(unmuteKey);
        logStatus('SENDING', `Unmuting user ${userId}`);
    }
    
    mutedUsers.delete(userId);
    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MUTED_USERS, Array.from(mutedUsers));
    
    return safeSendAction('UNMUTE_USER', { userId });
}, 'unmuteUser', { success: false });

const postStatusLegacy = createErrorBoundary(async function(statusData) {
    if (!statusData) throw new Error('Invalid status data');
    
    const postKey = `post_status_${Date.now()}`;
    if (!_loggedMessages.has(postKey)) {
        _loggedMessages.add(postKey);
        logStatus('POST', 'Posting new status', { type: statusData.type });
    }
    
    const sanitizedData = sanitizeStatusData(statusData);
    
    if (state.offlineModeEnabled) {
        const offlineQueue = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
        sanitizedData.id = 'offline_' + Date.now();
        sanitizedData.createdAt = new Date().toISOString();
        sanitizedData.offline = true;
        sanitizedData.expiresAt = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString();
        offlineQueue.push(sanitizedData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
        
        statuses.unshift(sanitizedData);
        myStatuses.unshift(sanitizedData);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        
        lastPostDate = new Date();
        SafeStorage.set(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
        updateStreakCounter();
        
        const offlineKey = 'status_queued_offline';
        if (!_loggedMessages.has(offlineKey)) {
            _loggedMessages.add(offlineKey);
            logStatus('POST', 'Status queued offline');
        }
        
        return { success: true, status: sanitizedData, offline: true };
    }
    
    if (!isSessionReady()) {
        debugWarn('Cannot post status - session not ready');
        return { success: false, reason: 'SESSION_NOT_READY' };
    }
    
    const messageId = safeSendAction('UPLOAD_STATUS', sanitizedData);
    
    if (messageId) {
        const tempStatus = {
            ...sanitizedData,
            id: `temp_${Date.now()}`,
            createdAt: new Date().toISOString(),
            pending: true
        };
        
        statuses.unshift(tempStatus);
        myStatuses.unshift(tempStatus);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        
        lastPostDate = new Date();
        SafeStorage.set(LOCAL_STORAGE_KEYS.LAST_POST_DATE, lastPostDate.toISOString());
        updateStreakCounter();
        
        if (sanitizedData.mood) {
            moodChartData.push({
                mood: sanitizedData.mood,
                value: 50 + Math.floor(Math.random() * 30),
                date: new Date().toISOString()
            });
            if (moodChartData.length > 30) moodChartData = moodChartData.slice(-30);
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MOOD_DATA, moodChartData);
        }
        
        DiagnosticsAgent.increment('statusPosts');
        
        return { success: true, status: tempStatus, pending: true };
    }
    
    return { success: false };
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
        
        if (typeof validateStatusPayload !== 'undefined') validateStatusPayload(sanitized);
        
        return sanitized;
    } catch (error) {
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
        
        SafeStorage.set(LOCAL_STORAGE_KEYS.STREAK, streakCount.toString());
    } catch (error) {}
}

const scheduleStatus = createErrorBoundary(async function(statusData, scheduleTime) {
    if (!statusData || !scheduleTime) throw new Error('Missing required parameters');
    
    const scheduleKey = `schedule_${Date.now()}`;
    if (!_loggedMessages.has(scheduleKey)) {
        _loggedMessages.add(scheduleKey);
        logStatus('SENDING', `Scheduling status for ${scheduleTime}`);
    }
    
    const sanitizedData = sanitizeStatusData(statusData);
    
    const response = await safeSendAction('SCHEDULE_STATUS', {
        ...sanitizedData,
        scheduledFor: scheduleTime
    });
    
    if (response) {
        scheduledStatuses.push({ ...sanitizedData, scheduledFor: scheduleTime });
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SCHEDULED, scheduledStatuses);
        const successKey = 'schedule_success';
        if (!_loggedMessages.has(successKey)) {
            _loggedMessages.add(successKey);
            logStatus('SUCCESS', 'Status scheduled');
        }
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
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.DRAFTS, drafts);
        
        const draftKey = 'draft_saved';
        if (!_loggedMessages.has(draftKey)) {
            _loggedMessages.add(draftKey);
            logStatus('SUCCESS', 'Draft saved');
        }
        return { success: true };
    } catch (error) {
        throw error;
    }
}

const reportStatus = createErrorBoundary(async function(statusId, reason, details) {
    if (!statusId || !reason) throw new Error('Missing required parameters');
    
    const reportKey = `report_${statusId}`;
    if (!_loggedMessages.has(reportKey)) {
        _loggedMessages.add(reportKey);
        logStatus('SENDING', `Reporting status ${statusId}`);
    }
    
    const sanitizedDetails = escapeHtml(details || '');
    
    return safeSendAction('REPORT_STATUS', { statusId, reason, details: sanitizedDetails });
}, 'reportStatus', { success: false });

// =============================================
// EXPIRATION MANAGEMENT
// =============================================

let expirationCheckInterval = null;

function startExpirationMonitoring() {
    if (expirationCheckInterval) {
        clearInterval(expirationCheckInterval);
    }
    
    const startKey = 'expiration_monitoring_start';
    if (!_loggedMessages.has(startKey)) {
        _loggedMessages.add(startKey);
        logStatus('INFO', 'Starting expiration monitoring');
    }
    
    expirationCheckInterval = setInterval(() => {
        checkAndCleanExpiredStatuses();
    }, 60000);
    
    state.intervals.add(expirationCheckInterval);
}

function stopExpirationMonitoring() {
    if (expirationCheckInterval) {
        clearInterval(expirationCheckInterval);
        expirationCheckInterval = null;
        state.intervals.delete(expirationCheckInterval);
        
        const stopKey = 'expiration_monitoring_stop';
        if (!_loggedMessages.has(stopKey)) {
            _loggedMessages.add(stopKey);
            logStatus('INFO', 'Expiration monitoring stopped');
        }
    }
}

function checkAndCleanExpiredStatuses() {
    const now = Date.now();
    let hasExpired = false;
    let expiredCount = 0;
    
    const initialStatusCount = statuses.length;
    statuses = statuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) {
                hasExpired = true;
                expiredCount++;
                
                const expireKey = `status_expired_${status.id}`;
                if (!_loggedMessages.has(expireKey)) {
                    _loggedMessages.add(expireKey);
                    logStatus('EXPIRE', `Status ${status.id} expired`);
                }
                
                safeSendAction('STATUS_EXPIRED', {
                    statusId: status.id,
                    userId: status.userId
                });
                
                document.dispatchEvent(new CustomEvent('statusExpired', {
                    detail: { statusId: status.id }
                }));
                
                return false;
            }
        }
        return true;
    });
    
    if (initialStatusCount !== statuses.length) {
        const removedKey = `expired_removed_${Date.now()}`;
        if (!_loggedMessages.has(removedKey)) {
            _loggedMessages.add(removedKey);
            logStatus('EXPIRE', `Removed ${initialStatusCount - statuses.length} expired statuses`);
        }
    }
    
    myStatuses = myStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    friendsStatuses = friendsStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    closeFriendsStatuses = closeFriendsStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    pinnedStatuses = pinnedStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    mutedStatuses = mutedStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    microCirclesStatuses = microCirclesStatuses.filter(status => {
        if (status.expiresAt) {
            const expiresAt = new Date(status.expiresAt).getTime();
            if (now >= expiresAt) return false;
        }
        return true;
    });
    
    if (hasExpired) {
        highlights.forEach(highlight => {
            if (highlight.statusIds) {
                const originalLength = highlight.statusIds.length;
                highlight.statusIds = highlight.statusIds.filter(id => {
                    return statuses.some(s => s.id === id) || myStatuses.some(s => s.id === id);
                });
                if (highlight.statusIds.length !== originalLength) {
                    highlight.count = highlight.statusIds.length;
                }
            }
        });
        
        DiagnosticsAgent.metrics.statusExpired += expiredCount;
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.STATUSES, statuses);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.MY_STATUSES, myStatuses);
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.HIGHLIGHTS, highlights);
        
        document.dispatchEvent(new CustomEvent('statusUpdate', {
            detail: { type: 'bulk', statuses: statuses.slice(0, 10) }
        }));
    }
}

// =============================================
// USER STATUS TRACKING
// =============================================
let userStatusInterval = null;
let lastActivityTime = Date.now();
let isOnlineGlobal = typeof navigator !== 'undefined' ? navigator.onLine : true;
let heartbeatIntervalGlobal = null;
let isTrackingInitialized = false;
let lastOnlineStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;
let activityThrottleTimer = null;
let activityEventHandlers = [];

function initializeUserStatusTracking() {
    if (isTrackingInitialized) return;
    
    try {
        isOnlineGlobal = typeof navigator !== 'undefined' ? navigator.onLine : true;
        lastOnlineStatus = isOnlineGlobal;
        state.isOnline = isOnlineGlobal;
        
        setupNetworkDetection();
        setupActivityTracking();
        updateUserStatus();
        
        isTrackingInitialized = true;
        
        const trackKey = 'user_tracking_initialized';
        if (!_loggedMessages.has(trackKey)) {
            _loggedMessages.add(trackKey);
            logStatus('SUCCESS', 'User status tracking initialized');
        }
        
    } catch (error) {}
}

function setupNetworkDetection() {
    try {
        if (typeof window === 'undefined') return;
        
        const handleNetworkChange = () => {
            const currentOnline = navigator.onLine;
            if (currentOnline === lastOnlineStatus) return;
            
            lastOnlineStatus = currentOnline;
            state.isOnline = currentOnline;
            
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
    } catch (error) {}
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
    } catch (error) {}
}

function handleOnlineStatus() {
    try {
        if (isOnlineGlobal) return;
        
        isOnlineGlobal = true;
        state.isOnline = true;
        
        setTimeout(() => { updateUserStatus(); }, 100);
        
        if (state.offlineModeEnabled) {
            state.offlineModeEnabled = false;
            isOfflineMode = false;
            setTimeout(() => { syncPendingData(); }, 500);
            
            const onlineKey = 'online_status';
            if (!_loggedMessages.has(onlineKey)) {
                _loggedMessages.add(onlineKey);
                logStatus('SUCCESS', 'Online - syncing pending data');
            }
        }
        
        if (!parentReady && RecoveryManager.canRecover()) {
            logStatus('WAITING', 'Recovery - waiting for parent');
        }
    } catch (error) {}
}

function handleOfflineStatus() {
    try {
        if (!isOnlineGlobal) return;
        
        isOnlineGlobal = false;
        state.isOnline = false;
        
        setTimeout(() => { updateUserStatus(); }, 100);
        
        if (!state.offlineModeEnabled) {
            state.offlineModeEnabled = true;
            isOfflineMode = true;
            
            const offlineKey = 'offline_status';
            if (!_loggedMessages.has(offlineKey)) {
                _loggedMessages.add(offlineKey);
                logStatus('WARNING', 'Offline mode enabled');
            }
            
            logStatus('WAITING', 'Offline - waiting for parent');
        }
    } catch (error) {}
}

function sendUserActive() {
    try {
        if (parentCoordinator.handshakeComplete && parentReady && currentUser?.id) {
            safeSendAction('USER_ACTIVE', {
                userId: currentUser.id
            });
        }
    } catch (error) {}
}

function sendUserInactive() {
    try {
        if (parentCoordinator.handshakeComplete && parentReady && currentUser?.id) {
            safeSendAction('USER_INACTIVE', {
                userId: currentUser.id,
                lastActive: lastActivityTime
            });
        }
    } catch (error) {}
}

async function updateUserStatus() {
    try {
        if (!currentUser && !state.user && !isAuthenticated()) return;
        
        const userId = currentUser?.id || state.user?.id;
        if (!userId) return;
        
        const status = isOnlineGlobal ? 'online' : 'offline';
        
        if (currentUser) {
            currentUser.status = status;
            currentUser.lastSeen = new Date().toISOString();
        }
        
        if (parentCoordinator.handshakeComplete && parentReady) {
            safeSendAction('STATUS_UPDATE', {
                userId: userId,
                status: status,
                lastSeen: new Date().toISOString(),
                isOnline: isOnlineGlobal
            });
        }
    } catch (error) {}
}

if (isOnlineGlobal && !state.offlineModeEnabled && parentReady && isSessionReady()) {
    // The backend doesn't have a /api/user/status endpoint
    // Instead, just update local state and notify parent
    if (parentCoordinator.handshakeComplete && parentReady) {
        safeSendAction('USER_STATUS_UPDATE', {
            userId: userId,
            status: status,
            lastSeen: new Date().toISOString()
        });
    }
}

async function syncPendingData() {
    if (!isAuthenticated() || !isSessionReady()) {
        logStatus('WARNING', 'syncPendingData: skipping — not authenticated');
        return;
    }

    try {
        // ── 1. Sync pending reactions with retry ──────────────────────────────
        const reactionsToSync = [...pendingReactions];
        const failedReactions = [];
        for (const reaction of reactionsToSync) {
            let synced = false;
            for (let attempt = 1; attempt <= 3 && !synced; attempt++) {
                try {
                    await makeApiRequest(
                        `/api/status/${reaction.statusId}/like`,
                        reaction.remove ? 'DELETE' : 'POST',
                        {}
                    );
                    synced = true;
                } catch (err) {
                    if (attempt < 3) {
                        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
                    }
                }
            }
            if (!synced) failedReactions.push(reaction);
        }
        // Keep only items that still failed
        pendingReactions = failedReactions;
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.PENDING_REACTIONS, pendingReactions);

        // ── 2. Drain offline status queue with retry ──────────────────────────
        const offlineQueue = await SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE) || [];
        const stillQueued = [];
        for (const statusData of offlineQueue) {
            let posted = false;
            for (let attempt = 1; attempt <= 3 && !posted; attempt++) {
                try {
                    await makeApiRequest('/api/status', 'POST', statusData);
                    posted = true;
                } catch (err) {
                    if (attempt < 3) {
                        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
                    }
                }
            }
            if (!posted) stillQueued.push(statusData);
        }
        if (stillQueued.length > 0) {
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, stillQueued);
            logStatus('WARNING', `syncPendingData: ${stillQueued.length} status(es) still queued after retries`);
        } else {
            SafeStorage.remove(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
        }

        // ── 3. Force a fresh data pull (bypassing TTL) ────────────────────────
        SafeStorage.memoryStore.delete(LOCAL_STORAGE_KEYS.LAST_SYNC); // clear TTL so refresh runs
        await loadFreshDataInBackground();

        logStatus('SUCCESS', 'Pending data synced');

    } catch (error) {
        logStatus('FAILED', `syncPendingData: ${error.message}`);
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
                    const baseDelay = IframeEnvironment.isVPNNetwork ? 2000 : 1000;
                    const delay = Math.min(baseDelay * Math.pow(2, i), 10000);
                    const jitter = Math.random() * 200;
                    await new Promise(resolve => setTimeout(resolve, delay + jitter));
                }
            }
        }
        
        throw lastError;
    } catch (error) {
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
let messageCacheGlobal = new Set();

function safeLogError(module, functionName, error, data = null) {
    try {
        const errorKey = `${module}:${functionName}:${error?.message || 'unknown'}`;
        
        if (!errorLogCounts[errorKey]) errorLogCounts[errorKey] = 0;
        errorLogCounts[errorKey]++;
        
        if (errorLogCounts[errorKey] <= maxErrorLogs) {
            logStatus('FAILED', `${module}: ${functionName} - ${error?.message || error}`);
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
            if (!state.sessionActive && !state.isGuestMode && !currentUser && !parentCoordinator.sessionData && !state.sessionMirror.validated && !isSessionReady()) {
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
        
        // Validate session before updating
        if (!__isValidSession(sessionData)) {
            logStatus('FAILED', 'Invalid session in updateLocalStateWithSession - rejected');
            return false;
        }
        
        if (sessionData.user) {
            currentUser = sessionData.user;
            userData = sessionData.user;
        }
        
        if (sessionData.token) {
            state.token = sessionData.token;
            setSession(sessionData.token, sessionData.user || currentUser, sessionData.expiry);
        }
        
        if (sessionData.refreshToken) {
            SafeStorage.setJSON('REFRESH_TOKEN', sessionData.refreshToken);
            state.sessionMirror.refreshToken = sessionData.refreshToken;
        }
        
        if (sessionData.permissions && Array.isArray(sessionData.permissions)) {
            state.permissionsGranted = [...sessionData.permissions];
        }
        
        if (sessionData.capabilities && Array.isArray(sessionData.capabilities)) {
            state.sessionMirror.capabilities = [...sessionData.capabilities];
        }
        
        if (sessionData.sessionId) {
            state.sessionId = sessionData.sessionId;
        }
        
        updateSessionMirror(sessionData, 'local_update');
        SessionClient.updateSession(sessionData, 'local_update');
        
        isTokenReady = true;
        triggerTokenReadyCallbacks();
        processPendingApiRequests();
        
        const updateKey = 'local_state_updated';
        if (!_loggedMessages.has(updateKey)) {
            _loggedMessages.add(updateKey);
            logStatus('SUCCESS', 'Local state updated with session');
        }
        
        return true;
    } catch (error) {
        const failKey = 'local_state_update_fail';
        if (!_loggedMessages.has(failKey)) {
            _loggedMessages.add(failKey);
            logStatus('FAILED', `updateLocalStateWithSession: ${error.message}`);
        }
        return false;
    }
}

// =============================================
// DIAGNOSTICS AND MONITORING
// =============================================
function enableDiagnostics() {
    state.diagnosticsEnabled = true;
    window.__IFRAME_DEBUG__ = true;
    DiagnosticsAgent.enable();
    
    const enableKey = 'diagnostics_enabled';
    if (!_loggedMessages.has(enableKey)) {
        _loggedMessages.add(enableKey);
        logStatus('INFO', 'Diagnostics enabled');
    }
}

function disableDiagnostics() {
    state.diagnosticsEnabled = false;
    window.__IFRAME_DEBUG__ = false;
    DiagnosticsAgent.disable();
    
    const disableKey = 'diagnostics_disabled';
    if (!_loggedMessages.has(disableKey)) {
        _loggedMessages.add(disableKey);
        logStatus('INFO', 'Diagnostics disabled');
    }
}

function getDiagnostics() {
    return {
        health: getHealthMetrics(),
        diagnosticLog: state.diagnosticData,
        lifecycle: getLifecycleState(),
        handshake: {
            state: state.handshakeState,
            startTime: state.handshakeStartTime,
            endTime: state.handshakeEndTime,
            duration: state.handshakeEndTime ? state.handshakeEndTime - state.handshakeStartTime : null,
            childReadySent: state.childReadySent,
            parentReadyReceived: state.parentReadyReceived,
            handshakeAckReceived: state.handshakeAckReceived,
            sessionSyncReceived: state.sessionSyncReceived,
            pageActivated: state.pageActivated
        },
        session: getSessionMirror(),
        security: state.securityContext,
        frame: {
            id: state.frameId,
            instanceId: state.instanceId
        },
        parent: {
            detected: state.parentDetected,
            origin: state.securityContext.parentOrigin,
            protocol: state.parentProtocolVersion,
            capabilities: Array.from(state.parentCapabilities),
            ready: parentReady
        },
        retry: {
            queueSize: state.retryQueue.length,
            pendingAcks: state.pendingAcks.size
        },
        offline: {
            enabled: state.offlineModeEnabled,
            isOnline: state.isOnline,
            bufferSize: state.offlineBuffer.length
        },
        environment: {
            type: IframeEnvironment.type,
            isLocalDev: IframeEnvironment.isLocalDev,
            isRenderHosted: IframeEnvironment.isRenderHosted,
            isVPNNetwork: IframeEnvironment.isVPNNetwork,
            isProduction: IframeEnvironment.isProduction,
            isSandboxed: IframeEnvironment.isSandboxed,
            latency: IframeEnvironment.latency,
            connectionType: IframeEnvironment.connectionType
        },
        sessionClient: {
            sessionValid: SessionClient.sessionValid,
            sessionExpiry: SessionClient.sessionExpiry,
            offlineMode: SessionClient.offlineMode
        },
        transport: IframeTransport.getStatus(),
        navigation: NavigationGuard.getState(),
        diagnostics: DiagnosticsAgent.getReport(),
        sessionReady: isSessionReady()
    };
}

// =============================================
// SANDBOX DETECTION
// =============================================
function detectSandbox() {
    try {
        const sandboxed = !window.parent || window.parent === window || 
                          (() => { try { return !window.parent.location; } catch { return true; } })();
        
        if (sandboxed) {
            state.securityContext.signatureRequired = false;
            state.securityContext.encryptionRequired = false;
            state.securityContext.replayProtection = false;
            
            try {
                if (document.referrer) {
                    const referrerOrigin = new URL(document.referrer).origin;
                    TRUSTED_ORIGINS.add(referrerOrigin);
                }
            } catch (e) {}
            
            const sandboxKey = 'sandbox_detected';
            if (!_loggedMessages.has(sandboxKey)) {
                _loggedMessages.add(sandboxKey);
                logStatus('INFO', 'Sandbox detected');
            }
            
            return true;
        }
        
        return false;
    } catch (error) {
        return true;
    }
}

// =============================================
// CLEANUP AND MEMORY MANAGEMENT
// =============================================
function cleanup() {
    try {
        stopExpirationMonitoring();
        
        if (apiCheckInterval) { clearInterval(apiCheckInterval); apiCheckInterval = null; }
        if (parentCoordinator.handshakeInterval) { clearInterval(parentCoordinator.handshakeInterval); parentCoordinator.handshakeInterval = null; }
        if (heartbeatIntervalGlobal) { clearInterval(heartbeatIntervalGlobal); heartbeatIntervalGlobal = null; }
        if (autoAdvanceInterval) { clearInterval(autoAdvanceInterval); autoAdvanceInterval = null; }
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
        if (parentCoordinator.handshakeTimeout) { clearTimeout(parentCoordinator.handshakeTimeout); parentCoordinator.handshakeTimeout = null; }
        if (activityThrottleTimer) { clearTimeout(activityThrottleTimer); activityThrottleTimer = null; }
        if (HandshakeClient.timer) { clearTimeout(HandshakeClient.timer); HandshakeClient.timer = null; }
        
        state.retryTimers.forEach((timer) => clearTimeout(timer));
        state.retryTimers.clear();
        
        cleanupEventListeners();
        
        tokenReadyCallbacks = [];
        pendingApiRequests = [];
        state.retryQueue = [];
        
        _sentMessages.clear();
        processedMessageIds.clear();
        
        parentCoordinator.handshakeInProgress = false;
        parentCoordinator.sessionValid = false;
        parentCoordinator.sessionRequestSent = false;
        parentCoordinator.handshakeRetries = 0;
        
        errorLogCounts = {};
        retryCounts = {};
        messageCacheGlobal.clear();
        
        clearSession();
        
        const cleanupKey = 'cleanup_complete';
        if (!_loggedMessages.has(cleanupKey)) {
            _loggedMessages.add(cleanupKey);
            logStatus('INFO', 'Cleanup complete');
        }
        
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
// MODULE LIFECYCLE CONTROLLER
// =============================================
const ModuleLifecycleController = {
    _initialized: false,
    _started: false,
    
    init() {
        if (this._initialized) return this;
        this._initialized = true;
        logStatus('LIFECYCLE', 'ModuleLifecycleController initialized');
        return this;
    },
    
    start() {
        if (this._started) return this;
        this._started = true;
        logStatus('LIFECYCLE', 'ModuleLifecycleController started');
        return this;
    },
    
    getState() {
        return {
            initialized: this._initialized,
            started: this._started,
            lifecycleState: currentState
        };
    },
    
    reset() {
        this._initialized = false;
        this._started = false;
        logStatus('LIFECYCLE', 'ModuleLifecycleController reset');
        return this;
    }
};

// =============================================
// EVENT BUS
// =============================================
const EventBus = {
    _events: new Map(),
    
    on(event, callback) {
        if (!this._events.has(event)) {
            this._events.set(event, []);
        }
        this._events.get(event).push(callback);
        return () => this.off(event, callback);
    },
    
    off(event, callback) {
        const callbacks = this._events.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) callbacks.splice(index, 1);
        }
    },
    
    emit(event, data) {
        const callbacks = this._events.get(event);
        if (callbacks) {
            callbacks.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {}
            });
        }
    },
    
    clear() {
        this._events.clear();
    }
};

// =============================================
// PARENT CONNECTION MANAGER
// =============================================
const ParentConnectionManager = {
    _connected: false,
    _listeners: new Set(),
    
    isConnected() {
        return this._connected || parentReady;
    },
    
    addListener(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    },
    
    notifyListeners(status) {
        this._listeners.forEach(cb => {
            try {
                cb(status);
            } catch (e) {}
        });
    },
    
    setConnected(connected) {
        this._connected = connected;
        this.notifyListeners(connected);
    }
};

// =============================================
// UIBRIDGE - UI Communication Bridge
// =============================================
const UIBridge = {
    subscriptions: new Map(),
    validators: new Map(),
    messageQueue: [],
    processing: false,
    
    initialize() {
        this.registerValidators();
        this.setupCoreSubscriptions();
        logStatus('INFO', 'UIBridge initialized');
        return this;
    },

    registerValidators() {
        this.validators.set('statusUpdate', (data) => {
            return data && typeof data === 'object' && data.id;
        });

        this.validators.set('sessionData', (data) => {
            return data && typeof data === 'object' && (data.user || data.token) && __isValidSession(data);
        });

        this.validators.set('reaction', (data) => {
            return data && data.statusId && data.reaction;
        });

        this.validators.set('handshake', (data) => {
            return data && data.status && ['connecting', 'connected', 'failed', 'reconnecting'].includes(data.status);
        });

        this.validators.set('apiResponse', (data) => {
            return data && data.requestId;
        });

        this.validators.set('navigation', (data) => {
            return data && data.path;
        });
        
        this.validators.set('lifecycle', (data) => {
            return data && data.state && Object.values(LIFECYCLE_STATES).includes(data.state);
        });
        
        this.validators.set('statusState', (data) => {
            return data && (data.statuses !== undefined || data.myStatuses !== undefined);
        });
        
        this.validators.set('viewerUpdate', (data) => {
            return data && data.statusId;
        });
        
        this.validators.set('reactionUpdate', (data) => {
            return data && data.statusId && data.reaction;
        });
        
        this.validators.set('statusExpired', (data) => {
            return data && data.statusId;
        });
    },

    setupCoreSubscriptions() {
        document.addEventListener('statusUpdate', (e) => {
            this.handleCoreEvent('statusUpdate', e.detail);
        });

        document.addEventListener('coreData', (e) => {
            this.handleCoreEvent('coreData', e.detail);
        });

        document.addEventListener('sessionReady', (e) => {
            this.handleCoreEvent('sessionReady', e.detail);
        });

        document.addEventListener('handshakeUpdate', (e) => {
            this.handleCoreEvent('handshake', e.detail);
        });

        document.addEventListener('connectionLost', (e) => {
            this.handleCoreEvent('connectionLost', e.detail);
        });

        document.addEventListener('connectionRestored', (e) => {
            this.handleCoreEvent('connectionRestored', e.detail);
        });
        
        document.addEventListener('governorStateChange', (e) => {
            if (e.detail.newState === 'ACTIVE') {
                this.handleCoreEvent('handshake', { status: 'connected' });
                this.handleCoreEvent('lifecycle', { state: LIFECYCLE_STATES.ACTIVE });
            } else if (e.detail.newState === 'DEGRADED') {
                this.handleCoreEvent('handshake', { status: 'failed' });
            } else if (e.detail.newState === 'RECOVERING') {
                this.handleCoreEvent('handshake', { status: 'reconnecting' });
            }
        });

        document.addEventListener('apiResponse', (e) => {
            this.handleCoreEvent('apiResponse', e.detail);
        });

        document.addEventListener('navigate', (e) => {
            this.handleCoreEvent('navigation', e.detail);
        });

        document.addEventListener('uiRecovery', (e) => {
            this.handleCoreEvent('uiRecovery', e.detail);
            this.processMessageQueue();
        });

        document.addEventListener('configApplied', (e) => {
            this.handleCoreEvent('configApplied', e.detail);
        });
        
        document.addEventListener('viewerUpdate', (e) => {
            this.handleCoreEvent('viewerUpdate', e.detail);
        });
        
        document.addEventListener('reactionUpdate', (e) => {
            this.handleCoreEvent('reactionUpdate', e.detail);
        });
        
        document.addEventListener('statusExpired', (e) => {
            this.handleCoreEvent('statusExpired', e.detail);
        });
        
        document.addEventListener('moduleActive', (e) => {
            this.handleCoreEvent('lifecycle', { state: LIFECYCLE_STATES.ACTIVE, detail: e.detail });
        });
        
        document.addEventListener('statusStateChanged', (e) => {
            if (e.detail.state) {
                this.handleCoreEvent('statusState', e.detail.state);
            }
        });
    },

    handleCoreEvent(type, data) {
        if (!data) return;

        const validator = this.validators.get(type);
        if (validator && !validator(data)) return;

        this.messageQueue.push({ type, data, timestamp: Date.now() });

        if (!this.processing) {
            this.processMessageQueue();
        }
    },

    async processMessageQueue() {
        if (this.processing || this.messageQueue.length === 0) return;

        this.processing = true;

        while (this.messageQueue.length > 0) {
            const item = this.messageQueue.shift();

            if (Date.now() - item.timestamp > 60000) continue;

            const handlers = this.subscriptions.get(item.type) || [];
            handlers.forEach(handler => {
                try {
                    handler(this.sanitizeEventData(item.data));
                } catch (error) {
                    debugError('Bridge', `Handler failed for ${item.type}`, error);
                }
            });

            await new Promise(r => setTimeout(r, 10));
        }

        this.processing = false;
    },

    sanitizeEventData(data) {
        if (!data || typeof data !== 'object') return data;
        
        try {
            return JSON.parse(JSON.stringify(data, (key, value) => {
                if (key === 'token' || key === 'accessToken' || key === 'refreshToken') {
                    return '[REDACTED]';
                }
                if (typeof value === 'string' && value.length > 5000) {
                    return value.slice(0, 5000) + '... [truncated]';
                }
                return value;
            }));
        } catch (e) {
            return data;
        }
    },

    subscribe(event, handler) {
        if (!this.subscriptions.has(event)) {
            this.subscriptions.set(event, new Set());
        }
        this.subscriptions.get(event).add(handler);
        
        return () => {
            const handlers = this.subscriptions.get(event);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    },

    unsubscribe(event, handler) {
        const handlers = this.subscriptions.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    },

    clearSubscriptions() {
        this.subscriptions.clear();
        this.messageQueue = [];
        logStatus('INFO', 'UIBridge subscriptions cleared');
    }
};

// Initialize UIBridge
UIBridge.initialize();

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
    logStatus(level === 'error' ? 'FAILED' : 'WARNING', msg);
}
async function safeInit() {
    if (_INITIALIZATION_STARTED_) {
        return;
    }
    
    _INITIALIZATION_STARTED_ = true;
    
    let tries = 0;
    const maxTries = 5;
    
    const initKey = 'safe_init_start';
    if (!_loggedMessages.has(initKey)) {
        _loggedMessages.add(initKey);
        logStatus('INIT', 'Starting safe initialization');
    }
    
    IframeEnvironment.detect();
    detectSandbox();
    
    window.addEventListener('message', handleParentMessage);
    state.listeners.add({ type: 'message', handler: handleParentMessage });
    
    const parentAvailable = await ParentDetector.detect();
    
    if (parentAvailable) {
        const parentKey = 'parent_available';
        if (!_loggedMessages.has(parentKey)) {
            _loggedMessages.add(parentKey);
            logStatus('INFO', 'Parent available, starting handshake');
        }
        
        // CRITICAL: Call initializeModule to start the handshake
        initializeModule();
        
    } else {
        const noParentKey = 'parent_not_available';
        if (!_loggedMessages.has(noParentKey)) {
            _loggedMessages.add(noParentKey);
            logStatus('WARNING', 'Parent not available');
        }
        // Still call initializeModule to set up the state machine
        initializeModule();
        
        if (state.sessionMirror.validated && isSessionReady() && __isValidSession({ token: state.sessionMirror.token, userId: state.sessionMirror.user?.id })) {
            transitionTo(LifecycleState.ACTIVE, 'cached_session');
            logStatus('SUCCESS', 'Session activated from cache');
        } else {
            enableGuestMode();
        }
    }
    
    try {
        initializeUIWithCachedData();
        startExpirationMonitoring();
        
        const uiKey = 'ui_cached_init_complete';
        if (!_loggedMessages.has(uiKey)) {
            _loggedMessages.add(uiKey);
            logStatus('SUCCESS', 'UI initialized with cached data');
        }
        
        setTimeout(async () => {
            try {
                await bootstrapApp();
                setTimeout(() => { initializeUserStatusTracking(); }, 1000);
            } catch (error) {
                safeLogError('Status', 'safeInit.bootstrap', error);
            }
        }, 50);
        
    } catch (e) {
        logOnce('error', `Initialization failed: ${e.message}`);
    }
}

function notifyParentReady() {
    if (!_childReadySent && isInState(LifecycleState.READY)) {
        sendChildReady();
    }
}
function initPageCore() {
    try {
        setTimeout(() => {
            safeInit().catch(error => {
                safeLogError('Status', 'initPageCore.safeInit', error);
            });
        }, 10);
    } catch (error) {
        safeLogError('Status', 'initPageCore', error);
    }
}

// Expose initPageCore to window so it can be called from outside the IIFE
window.initPageCore = initPageCore;

// =============================================
// FETCH FAILURE SAFE HANDLING
// =============================================
const _fetchAttempts = {};

async function safeFetch(url, options = {}) {
    if (!navigator.onLine) {
        logStatus('WARNING', 'Network offline');
        return { success: false, message: "Network offline", offline: true };
    }
    
    const fetchKey = `fetch_${url}`;
    
    try {
        const response = await fetch(url, {
            credentials: "include",
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        
        if (_fetchAttempts[fetchKey]) {
            delete _fetchAttempts[fetchKey];
        }
        
        if (!_loggedMessages.has(`fetch_success_${url}`)) {
            _loggedMessages.add(`fetch_success_${url}`);
            logStatus('SUCCESS', `Fetch: ${url}`);
        }
        
        return data;
    } catch (error) {
        _fetchAttempts[fetchKey] = (_fetchAttempts[fetchKey] || 0) + 1;
        
        if (_fetchAttempts[fetchKey] === 1 && !_loggedMessages.has(`fetch_fail_${url}`)) {
            _loggedMessages.add(`fetch_fail_${url}`);
            logStatus('FAILED', `Fetch: ${url} - ${error.message}`);
        }
        
        return { success: false, message: "Network issue", error: error.message };
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
// PUBLIC API EXPOSURE
// =============================================
const StatusCore = {
    version: MODULE_VERSION,
    
    // Lifecycle
    getState: getLifecycleState,
    isReady: () => currentState === LIFECYCLE_STATES.ACTIVE,
    ensureActive: ensureActive,
    
    // Session
    SessionManager: {
        getToken: getSessionToken,
        getUser: getSessionUser,
        getUserId: getSessionUserId,
        isAuthenticated: isSessionReady,
        setSession: setSession,
        clearSession: clearSession
    },
    
    // Status API - REAL END-TO-END
    loadStatuses,
    postStatus,
    markStatusViewed,
    deleteStatus,
    addReaction,
    removeReaction,
    
    // State
    getStatuses: () => [...statusState.statuses],
    getMyStatuses: () => [...statusState.myStatuses],
    getStatusState: () => ({ ...statusState }),
    subscribe: (callback) => statusObservers.add(callback),
    
    // UI Bridge
    UI: UIBridge,
    
    // Event Bus
    on: (event, callback) => EventBus.on(event, callback),
    off: (event, callback) => EventBus.off(event, callback),
    emit: (event, data) => EventBus.emit(event, data),
    
    // Retry
    retryLoad: () => {
        if (currentState === LIFECYCLE_STATES.ACTIVE && isSessionReady()) {
            loadStatuses();
        }
    },
    
    // Legacy compatibility
    addReactionToStatus,
    removeReactionFromStatus,
    changeReaction,
    trackStatusView,
    voteOnPoll,
    pinStatus,
    unpinStatus,
    muteUser,
    unmuteUser,
    postStatusLegacy,
    scheduleStatus,
    saveDraft,
    reportStatus,
    
    // Helpers
    escapeHtml,
    formatTimeAgo,
    retryOperation,
    generateSampleMoodData,
    
    // State getters
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
    
    // Expiration
    startExpirationMonitoring,
    stopExpirationMonitoring,
    checkAndCleanExpiredStatuses,
    
    // Parent communication
    sendToParent,
    requestSession: requestSessionWrapper,
    
    // Diagnostics
    enableDiagnostics,
    disableDiagnostics,
    getDiagnostics,
    DiagnosticsAgent,
    getHealthMetrics,
    
    // Storage
    SafeStorage,
    StorageProxy,
    
    // Module lifecycle
    ModuleLifecycleController,
    
    // Debug
    debug: {
        getState: getLifecycleState,
        getStatusState: () => ({ ...statusState }),
        getPendingRequests: () => Array.from(pendingRequests.keys()),
        ParentConnectionManager,
        DiagnosticsAgent
    }
};

// Add additional exports to window for status-ui.js to import
window.StatusCore = StatusCore;
window.__STATUS_MODULE_NAME__ = MODULE_NAME;
window.__STATUS_VERSION__ = MODULE_VERSION;
window.DiagnosticsAgent = DiagnosticsAgent;
window.SafeStorage = SafeStorage;
window.StorageProxy = StorageProxy;
window.UIBridge = UIBridge;
window.LifecycleState = LIFECYCLE_STATES;
window.ModuleLifecycleController = ModuleLifecycleController;
window.EventBus = EventBus;
window.ParentConnectionManager = ParentConnectionManager;

// =============================================
// INITIALIZATION
// =============================================

// =============================================
// INITIALIZATION
// =============================================
console.log(`[${MODULE_NAME}] 🚀 Status Core v${MODULE_VERSION} (Strict Parent-Controlled Protocol | Real Data Only)`);

try {
    setState(LIFECYCLE_STATES.BOOT, 'initialization_start');
    
    ModuleLifecycleController.init();
    ModuleLifecycleController.start();
    
    stateListeners.add((toState) => {
        if (toState === LIFECYCLE_STATES.ACTIVE) {
            console.log(`[${MODULE_NAME}] ✅ Module ACTIVE - ready for user interaction`);
        }
    });
    
    // CRITICAL: Start the initialization sequence
    // This must be called to transition from BOOT → INITIALIZING → READY → WAIT_PARENT
    setTimeout(() => {
        initializeModule();
    }, 10);
    
    console.log(`[${MODULE_NAME}] ✅ Initialized - waiting for parent activation`);
    
} catch (error) {
    console.error(`[${MODULE_NAME}] Initialization error:`, error);
}
})();
// =============================================
// ES MODULE EXPORTS - ADD THIS AFTER THE IIFE CLOSES
// =============================================

// Since the file is wrapped in an IIFE, we need to expose the exports
// after the IIFE executes by capturing them from the global scope

// Wait for the IIFE to execute and expose things to window
setTimeout(() => {
    // Create the export object from window properties
    const exports = {
        // Core state & session
        currentUser: window.currentUser,
        userData: window.userData,
        statuses: window.statuses,
        myStatuses: window.myStatuses,
        friendsStatuses: window.friendsStatuses,
        closeFriendsStatuses: window.closeFriendsStatuses,
        pinnedStatuses: window.pinnedStatuses,
        mutedStatuses: window.mutedStatuses,
        microCirclesStatuses: window.microCirclesStatuses,
        highlights: window.highlights,
        drafts: window.drafts,
        scheduledStatuses: window.scheduledStatuses,
        viewedStatuses: window.viewedStatuses,
        mutedUsers: window.mutedUsers,
        currentViewerStatus: window.currentViewerStatus,
        currentSlideIndex: window.currentSlideIndex,
        autoAdvanceInterval: window.autoAdvanceInterval,
        isAutoAdvancePaused: window.isAutoAdvancePaused,
        progressInterval: window.progressInterval,
        currentCategoryFilter: window.currentCategoryFilter,
        currentIntentFilter: window.currentIntentFilter,
        currentMoodFilter: window.currentMoodFilter,
        isMobile: window.isMobile,
        isOfflineMode: window.isOfflineMode,
        pendingReplies: window.pendingReplies,
        pendingReactions: window.pendingReactions,
        moodChartData: window.moodChartData,
        streakCount: window.streakCount,
        lastPostDate: window.lastPostDate,
        activeFilters: window.activeFilters,
        selectedDraft: window.selectedDraft,
        isBackgroundInitialized: window.isBackgroundInitialized,
        isTokenReady: window.isTokenReady,
        
        // Status definitions
        statusTypes: window.statusTypes,
        statusIntents: window.statusIntents,
        statusMoods: window.statusMoods,
        statusCategories: window.statusCategories,
        actionButtons: window.actionButtons,
        privacySettings: window.privacySettings,
        durationOptions: window.durationOptions,
        reportReasons: window.reportReasons,
        reactions: window.reactions,
        emojis: window.emojis,
        backgroundOptions: window.backgroundOptions,
        statusTemplates: window.statusTemplates,
        
        // Storage keys
        LOCAL_STORAGE_KEYS: window.LOCAL_STORAGE_KEYS,
        
        // Core functions
        loadStatuses: window.loadStatuses,
        postStatus: window.postStatus,
        markStatusViewed: window.markStatusViewed,
        deleteStatus: window.deleteStatus,
        addReaction: window.addReaction,
        removeReaction: window.removeReaction,
        
        // Helper functions
        sendToParent: window.sendToParent,
        updateLocalStateWithSession: window.updateLocalStateWithSession,
        handleLogout: window.handleLogout,
        handleParentUnavailable: window.handleParentUnavailable,
        makeParentApiRequest: window.makeParentApiRequest,
        waitForTokenReady: window.waitForTokenReady,
        onTokenReady: window.onTokenReady,
        triggerTokenReadyCallbacks: window.triggerTokenReadyCallbacks,
        getUnifiedToken: window.getUnifiedToken,
        isAuthenticated: window.isAuthenticated,
        queueApiRequest: window.queueApiRequest,
        processPendingApiRequests: window.processPendingApiRequests,
        startTokenReadinessCheck: window.startTokenReadinessCheck,
        initializeUIWithCachedData: window.initializeUIWithCachedData,
        loadCachedDataInstantly: window.loadCachedDataInstantly,
        startBackgroundInitialization: window.startBackgroundInitialization,
        loadFreshDataInBackground: window.loadFreshDataInBackground,
        safeApiOperation: window.safeApiOperation,
        loadStatusesInBackground: window.loadStatusesInBackground,
        loadMyStatusesInBackground: window.loadMyStatusesInBackground,
        loadHighlightsInBackground: window.loadHighlightsInBackground,
        loadUserDataInBackground: window.loadUserDataInBackground,
        bootstrapApplication: window.bootstrapApplication,
        handleAuthError: window.handleAuthError,
        loadInitialData: window.loadInitialData,
        filterStatusesByPrivacy: window.filterStatusesByPrivacy,
        getStatusPreviewText: window.getStatusPreviewText,
        filterStatusesByType: window.filterStatusesByType,
        getEmptyStateMessage: window.getEmptyStateMessage,
        addReactionToStatus: window.addReactionToStatus,
        removeReactionFromStatus: window.removeReactionFromStatus,
        changeReaction: window.changeReaction,
        trackStatusView: window.trackStatusView,
        voteOnPoll: window.voteOnPoll,
        pinStatus: window.pinStatus,
        unpinStatus: window.unpinStatus,
        muteUser: window.muteUser,
        unmuteUser: window.unmuteUser,
        postStatusLegacy: window.postStatusLegacy,
        updateStreakCounter: window.updateStreakCounter,
        scheduleStatus: window.scheduleStatus,
        saveDraft: window.saveDraft,
        reportStatus: window.reportStatus,
        escapeHtml: window.escapeHtml,
        formatTimeAgo: window.formatTimeAgo,
        retryOperation: window.retryOperation,
        generateSampleMoodData: window.generateSampleMoodData,
        initPageCore: window.initPageCore,
        getSession: window.getSession,
        isSessionValid: window.isSessionValid,
        
        // Enhanced core exports
        getHealthMetrics: window.getHealthMetrics,
        getDiagnostics: window.getDiagnostics,
        refreshToken: window.refreshToken,
        requestParentConfig: window.requestParentConfig,
        SessionClient: window.SessionClient,
        IframeHandshakeAuthority: window.IframeHandshakeAuthority,
        StartupGovernor: window.StartupGovernor,
        DiagnosticsAgent: window.DiagnosticsAgent,
        SafeStorage: window.SafeStorage,
        StorageProxy: window.StorageProxy,
        NavigationGuard: window.NavigationGuard,
        IframeEnvironment: window.IframeEnvironment,
        logStatus: window.logStatus,
        UIBridge: window.UIBridge,
        EventBus: window.EventBus,
        ParentConnectionManager: window.ParentConnectionManager,
        ModuleLifecycleController: window.ModuleLifecycleController,
        
        // Setter functions for constants
        setCurrentIntentFilter: window.setCurrentIntentFilter,
        setCurrentMoodFilter: window.setCurrentMoodFilter,
        setCurrentCategoryFilter: window.setCurrentCategoryFilter,
        
        // Lifecycle exports
        LifecycleState: window.LifecycleState,
        isInState: window.isInState,
        assertActive: window.assertActive,
        getLifecycleState: window.getLifecycleState,
        parentReady: window.parentReady,
        messageQueue: window.messageQueue,
        flushQueue: window.flushQueue,
        sendMessage: window.sendMessage,
        safeSend: window.safeSend,
        handleParentMessage: window.handleParentMessage,
        genId: window.genId,
        genReqId: window.genReqId,
        onTokenReady: window.onTokenReady,  // Add this line

        // Session functions
        isSessionReady: window.isSessionReady,
        getSessionToken: window.getSessionToken,
        getSessionUser: window.getSessionUser,
        
        // Module version
        MODULE_VERSION: window.MODULE_VERSION
    };
    
    if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatusCore;
}

// CRITICAL: Start the initialization
// This ensures the module starts even if DOMContentLoaded already fired
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageCore);
} else {
    initPageCore();
}

// ── SETTINGS CACHE BOOTSTRAP ─────────────────────────────────────────────────
// On load, ask the parent for the cached settings so this module starts with
// the right theme/font/preferences before the first SETTINGS_UPDATED arrives.
(function bootstrapSettingsCache() {
    try {
        // Request cached settings from parent via StorageProxy (now wired)
        SafeStorage.getJSON('knecta_settings_cache').then(settings => {
            if (settings && typeof applySettingToStatusModule === 'function') {
                Object.entries(settings).forEach(([sec, secVal]) => {
                    if (secVal && typeof secVal === 'object') {
                        Object.entries(secVal).forEach(([k, v]) => {
                            try { applySettingToStatusModule(sec, k, v); } catch(_) {}
                        });
                    }
                });
                if (typeof logStatus === 'function') {
                    logStatus('INFO', 'Settings applied from cache on startup');
                }
            }
        }).catch(() => {});
    } catch(_) {}
})();
    
    // Also make available as a named export
    if (typeof exports !== 'undefined') {
        Object.keys(exports).forEach(key => {
            if (typeof exports !== 'undefined' && exports[key] !== undefined) {
                try {
                    // This is for ES module compatibility
                    if (typeof globalThis !== 'undefined') {
                        globalThis[key] = exports[key];
                    }
                } catch(e) {}
            }
        });
    }
}, 0);

function applySettingToStatusModule(section, key, value) {
    // NOTE: This function is outside the main IIFE, so logStatus is not accessible here.
    // Use console.log directly for any debug output needed.
    if (section === 'appearance') {
        if (key === 'theme') {
            const theme = value === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value;
            document.documentElement.setAttribute('data-theme', theme);
            document.body.setAttribute('data-theme', theme);
        }
        if (key === 'fontSize') {
            document.documentElement.style.fontSize = value + 'px';
        }
        if (key === 'language') window.__appLanguage = value;
        if (key === 'accentColor') document.documentElement.style.setProperty('--accent-color', value);
    }
    if (section === 'notifications') {
        if (key === 'soundEnabled' || key === 'notificationSound') {
            window.__notificationSoundEnabled = value;
            if (typeof window.updateNotificationSound === 'function') window.updateNotificationSound(value);
        }
        if (key === 'vibrationEnabled' || key === 'notificationVibration') window.__vibrationEnabled = value;
        if (key === 'desktopEnabled') {
            window.desktopNotificationsEnabled = value;
            if (typeof window.updateDesktopNotifications === 'function') window.updateDesktopNotifications(value);
        }
        if (key === 'enableNotifications' || key === 'messageNotifications') window.__messageNotificationsEnabled = value;
    }
    if (section === 'privacy') {
        if (key === 'onlineStatus') window.__showOnlineStatus = value;
        if (key === 'lastSeen')     window.__showLastSeen     = value;
    }
    if (section === 'chat') {
        if (key === 'enterToSend')    window.__enterToSend    = value;
        if (key === 'showTimestamps') window.__showTimestamps = value;
    }
}