/**
 * GROUP CORE — BOOTSTRAP & STATE
 * Module identity, parent/child handshake lifecycle, session validation,
 * postMessage transport (ParentMessaging/MessageRouter), SafeStorage,
 * the base GroupCore event-object, and the shared cross-module state block.
 *
 * This file is one of three cooperating modules that together replace the
 * former single group-core.js (9,361 lines). It is a real, independently
 * loadable ES module — not an arbitrary text slice — with explicit imports
 * and exports wiring it to the other two.
 *
 * Files: group-core-bootstrap.js -> group-core-operations.js -> group-core-bridge.js
 */

import {
    addMessageToChat,
    checkPostingRules,
    closeGroupChatMobile,
    getCurrentUserLocal,
    groupMessages,
    groupTypingUsers,
    groupUnreadCounts,
    loadCachedDataInstantly,
    loadGroupChatMessages,
    loadGroupDetails,
    loadUniqueFeaturesData,
    queueGroupAction,
    syncGroupInvitesFromServer,
    syncGroupsFromServer,
    updateChatHeaderUniqueFeatures,
    updateGroupCounts,
    updateGroupInAllLists
} from './group-core-operations.js';
import {
    applySettingToGroupModule,
    loadUserDataInBackground,
    setupResponsiveBehavior,
    setupUIEventListeners,
    startBackgroundSync,
    updateCurrentSection,
    updateUserUI
} from './group-core-bridge.js';

// =============================================
// SHARED CROSS-MODULE STATE
// These values are written from more than one file, so they live
// here as the single source of truth. Other files import the value
// directly for reads (ES module live bindings keep it current) and
// call the matching setter for writes.
// =============================================
let moduleInitialized = false;
let currentUser = null;
let userData = null;
let groups = [];
let myGroups = [];
let joinedGroups = [];
let groupInvites = [];
let adminGroups = [];
let selectedGroup = null;
let isMobile = false;
let currentChatGroup = null;
let authReady = false;
let authCheckComplete = false;
let syncIntervalId = null;
let backgroundSyncRunning = false;
let __SESSION_READY__ = false;

function setModuleInitialized(value) { moduleInitialized = value; return value; }
function setCurrentUser(value) { currentUser = value; return value; }
function setUserData(value) { userData = value; return value; }
function setGroups(value) { groups = value; return value; }
function setMyGroups(value) { myGroups = value; return value; }
function setJoinedGroups(value) { joinedGroups = value; return value; }
function setGroupInvites(value) { groupInvites = value; return value; }
function setAdminGroups(value) { adminGroups = value; return value; }
function setSelectedGroup(value) { selectedGroup = value; return value; }
function setIsMobile(value) { isMobile = value; return value; }
function setCurrentChatGroup(value) { currentChatGroup = value; return value; }
function setAuthReady(value) { authReady = value; return value; }
function setAuthCheckComplete(value) { authCheckComplete = value; return value; }
function setSyncIntervalId(value) { syncIntervalId = value; return value; }
function setBackgroundSyncRunning(value) { backgroundSyncRunning = value; return value; }
function setSessionReadyFlag(value) { __SESSION_READY__ = value; return value; }

const MODULE_NAME = 'groups';

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

let parentReadyReceived = false;

let childReadySent = false;

let handshakeCompleted = false;

let sessionReceived = false;

let initializationComplete = false;

let sessionReady = false;

let parentReady = false;

let _childReadySentFlag = false;

let _parentReadyProcessedFlag = false;

// ADDED: Extra guard for PARENT_READY

// =============================================
// LIFECYCLE STATE MACHINE - STRICT DETERMINISTIC
// =============================================
const LifecycleState = function () {
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
    setModuleInitialized(false);
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

  // FIX (lifecycle recovery): the state machine intentionally forbids
  // backward transitions in general (that invariant is what keeps the
  // handshake deterministic), but that also meant there was no way to
  // recover if the parent frame became unavailable after we'd already
  // reached ACTIVE (e.g. the parent tab reloaded/renavigated and re-sent
  // PARENT_READY). This is a single, explicit, narrowly-scoped exception
  // for exactly that case — it does not weaken setState()'s guard for
  // anything else.
  function reenterWaitParent(reason) {
    if (_state !== STATES.ACTIVE) return false;
    const oldState = _state;
    _state = STATES.WAIT_PARENT;
    console.warn(`[${MODULE_NAME}] Lifecycle recovery: ACTIVE → WAIT_PARENT (${reason || 'parent re-handshake'})`);
    _listeners.forEach(listener => {
      try { listener(_state, oldState); } catch (e) {}
    });
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
    ensureActive,
    reenterWaitParent
  };
}();

// =============================================
// SESSION STORAGE - MEMORY ONLY (NO LOCALSTORAGE)
// =============================================

let session = {
    token: null,
    user: null,
    expiresAt: null
};

function __isValidSession(sessionObj, _debugLabel) {
    if (!sessionObj) {
        if (_debugLabel) console.warn(`[${MODULE_NAME}] __isValidSession(${_debugLabel}): rejected — no session object`);
        return false;
    }

    if (!sessionObj.token || typeof sessionObj.token !== 'string') {
        if (_debugLabel) console.warn(`[${MODULE_NAME}] __isValidSession(${_debugLabel}): rejected — missing/non-string token`);
        return false;
    }

    const rawUserId = sessionObj.user?.id ?? sessionObj.user?.uid ?? sessionObj.userId;
    const userId = typeof rawUserId === 'string' ? Number(rawUserId) : rawUserId;
    if (!Number.isFinite(userId) || userId === 0) {
        // DIAGNOSTIC: previously this just returned false with no way to tell,
        // from the console, whether the rejection was because no userId was
        // present at all vs. a non-numeric id (e.g. a UUID) that Number()
        // turned into NaN. Surfacing rawUserId here is what you'd need to look
        // at first if "applySession: Invalid session data, ignoring" shows up
        // again for a session you know should be valid.
        if (_debugLabel) console.warn(`[${MODULE_NAME}] __isValidSession(${_debugLabel}): rejected — bad userId (raw=${JSON.stringify(rawUserId)}, coerced=${userId})`);
        return false;
    }

    return true;
}

if (typeof window.__lifecycleGuard === 'undefined') {
    window.__lifecycleGuard = {
        actionQueue: []
    };
}

function canSendAction() {
    return LifecycleState.isActive() && parentReady;
}

function canMakeApiCall() {
    return LifecycleState.isActive() && parentReady && sessionReady && session.token && __isValidSession(session);
}

const messageQueue = [];

let isFlushingQueue = false;

const DEBUG = false;

function debugLog(...args) {
    if (DEBUG) {
        console.log('[groups:debug]', ...args);
    }
}

function generateId() {
    return `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateRequestId() {
    return `${MODULE_NAME}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

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

function apiRequest(endpoint, method = 'GET', body = null, timeoutMs = 12000, _retryCount = 0) {
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
        
        // Set up timeout with retry on first failure
        const timeoutId = setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                // Retry once with shorter timeout before giving up
                if (_retryCount === 0 && method === 'GET') {
                    apiRequest(endpoint, method, body, 8000, 1)
                        .then(resolve)
                        .catch(() => reject(new Error(`API request timeout: ${method} ${normalizedEndpoint}`)));
                } else {
                    console.warn(`[${MODULE_NAME}] API request timeout: ${method} ${normalizedEndpoint} (ID: ${requestId})`);
                    reject(new Error(`Request timeout: ${method} ${normalizedEndpoint}`));
                }
            }
        }, timeoutMs);
        
        // Register for response with timeout cleanup
        registerRequest(requestId, (response) => {
            clearTimeout(timeoutId);
            resolve(response);
        }, (error) => {
            clearTimeout(timeoutId);
            reject(error);
        });
        
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

            // FIX (stuck-loading-spinner + no-retry hard wait): there was
            // previously no recovery path at all if the parent frame never
            // sent PARENT_READY (or sent a session that failed
            // __isValidSession) — WAIT_PARENT was a true hard wait with zero
            // retries, and every group list stayed on its static "Loading
            // groups..." placeholder. Before falling back to a cached
            // session or a manual reload, actually retry the handshake a
            // couple of times — a missed CHILD_READY (timing/navigation
            // race) is often recoverable without either fallback.
            const _resendChildReady = () => {
                if (!LifecycleState.isWaitingForParent()) return false;
                try {
                    const retryMsg = {
                        type: 'CHILD_READY', module: MODULE_NAME, version: MODULE_VERSION,
                        capabilities: MODULE_CAPABILITIES, timestamp: Date.now(),
                        id: generateId(), requestId: generateId(),
                        source: MODULE_NAME, target: 'parent'
                    };
                    const r = sendMessage(retryMsg);
                    if (r && r.success) {
                        console.warn(`[${MODULE_NAME}] Retrying handshake — resent CHILD_READY`);
                        return true;
                    }
                } catch (_) {}
                return false;
            };
            setTimeout(_resendChildReady, 3000);
            setTimeout(_resendChildReady, 6000);
            setTimeout(() => {
                if (!LifecycleState.isWaitingForParent()) return; // already progressed normally
                console.warn(`[${MODULE_NAME}] No PARENT_READY after retries — attempting cached-session fallback`);
                try {
                    // Same-origin with chat.html, so read the same keys
                    // app.core.session.js writes on login rather than
                    // waiting on a postMessage that may never arrive.
                    const token = localStorage.getItem('accessToken');
                    const userStr = localStorage.getItem('nexopa_user');
                    if (token && userStr) {
                        const user = JSON.parse(userStr);
                        const cachedSession = { token, user, userId: user?.id };
                        if (__isValidSession(cachedSession)) {
                            applySession(cachedSession);
                            parentReady = true; // best-effort: proceed without the parent frame
                            LifecycleState.setState(LifecycleState.STATES.ACTIVE);
                            console.log(`[${MODULE_NAME}] State: WAIT_PARENT → ACTIVE (cached-session fallback)`);
                            return;
                        }
                    }
                } catch (_fallbackErr) {}
                console.error(`[${MODULE_NAME}] No cached session available either — showing retry UI instead of hanging`);
                try {
                    document.querySelectorAll('.loading-placeholder, .empty-state').forEach(el => {
                        const p = el.querySelector('p');
                        if (p && /Loading groups/i.test(p.textContent || '')) {
                            el.innerHTML = `
                                <i class="fas fa-exclamation-circle" style="opacity:.6"></i>
                                <p>Taking longer than expected to connect</p>
                                <p class="subtext" style="cursor:pointer; text-decoration: underline;" onclick="window.location.reload()">Tap to retry</p>
                            `;
                        }
                    });
                } catch (_uiErr) {}
            }, 10000);

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

const processedMessages = new Set();

const processedGroupChatMessageIds = new Set();

function isDuplicateGroupChatMessage(messageId) {
    if (!messageId) return false;
    if (processedGroupChatMessageIds.has(messageId)) return true;
    processedGroupChatMessageIds.add(messageId);

    if (processedGroupChatMessageIds.size > 300) {
        const iterator = processedGroupChatMessageIds.values();
        for (let i = 0; i < 50; i++) {
            const value = iterator.next().value;
            if (value) processedGroupChatMessageIds.delete(value);
        }
    }
    return false;
}

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

        // CRITICAL FIX: Group message deletion was completely unhandled
        case 'group:message:deleted':
        case 'GROUP_MESSAGE_DELETED':
        case 'message:deleted':
        case 'message_deleted':
          {
            const dp = message.payload || message;
            const mid = dp.messageId || dp.id;
            const gid = dp.groupId || dp.chatId;
            if (mid && gid) {
              // Remove from in-memory store
              if (GroupCore && GroupCore.groupMessages && GroupCore.groupMessages[gid]) {
                GroupCore.groupMessages[gid] = GroupCore.groupMessages[gid].filter(m => String(m.id) !== String(mid));
              }
              // Track permanently deleted message IDs
              try {
                const KEY = 'kyn_deleted_msgs_v1';
                const del = JSON.parse(localStorage.getItem(KEY) || '{}');
                if (!del[gid]) del[gid] = [];
                if (!del[gid].includes(String(mid))) del[gid].push(String(mid));
                localStorage.setItem(KEY, JSON.stringify(del));
              } catch (_) {}
              // CRITICAL FIX: Remove from IndexedDB (LocalGroupStore)
              try {
                if (window.LocalGroupStore && typeof window.LocalGroupStore.deleteMessage === 'function') {
                  window.LocalGroupStore.deleteMessage(mid).catch(function () {});
                }
              } catch (_) {}
              // Also clear from localStorage group messages cache
              try {
                ['kyn_group_msgs_' + gid, 'group_messages_' + gid].forEach(function (k) {
                  const cached = JSON.parse(localStorage.getItem(k) || 'null');
                  if (cached && Array.isArray(cached.messages)) {
                    cached.messages = cached.messages.filter(function (m) {
                      return String(m.id) !== String(mid);
                    });
                    localStorage.setItem(k, JSON.stringify(cached));
                  }
                });
              } catch (_) {}
              // PHASE10: Record in DeletionRegistry to prevent stale resurrection
              try {
                window.__PHASE10_DeletionRegistry?.mark('message', String(mid), 'deleted');
              } catch (_) {}
              // Dispatch UI removal event (triggers DOM removal in messages-ui.js patch)
              window.dispatchEvent(new CustomEvent('groupMessageDeleted', {
                detail: {
                  messageId: mid,
                  groupId: gid
                }
              }));
              GroupCore.emit('group:message:deleted', {
                messageId: mid,
                groupId: gid
              });
            }
            return true;
          }
        case 'group:message:edited':
        case 'GROUP_MESSAGE_EDITED':
        case 'message_edited':
          {
            const ep = message.payload || message;
            const emid = ep.messageId || ep.id;
            const egid = ep.groupId || ep.chatId;
            if (emid && egid && GroupCore?.groupMessages?.[egid]) {
              const idx = GroupCore.groupMessages[egid].findIndex(m => String(m.id) === String(emid));
              if (idx >= 0) {
                GroupCore.groupMessages[egid][idx] = {
                  ...GroupCore.groupMessages[egid][idx],
                  content: ep.content,
                  isEdited: true,
                  editedAt: ep.editedAt || new Date().toISOString()
                };
                GroupCore.emit('group:message:edited', {
                  messageId: emid,
                  groupId: egid,
                  content: ep.content
                });
              }
            }
            return true;
          }
        case 'group:reaction':
        case 'GROUP_REACTION':
          {
            const rp = message.payload || message;
            GroupCore?.emit('group:reaction', rp);
            window.dispatchEvent(new CustomEvent('groupReaction', {
              detail: rp
            }));
            return true;
          }
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
        case 'group:refresh_needed':
        case 'GROUP_REFRESH_NEEDED':
          if (LifecycleState.isActive() && sessionReady) {
            setTimeout(() => {
              if (typeof syncGroupsFromServer === 'function') syncGroupsFromServer().catch(() => {});
            }, 200);
          }
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
    // FIX (lifecycle recovery): a fresh PARENT_READY while we're already
    // ACTIVE means the parent frame itself came back (reload/renavigation) —
    // previously this was silently ignored and the module was left ACTIVE
    // against a parent session that may no longer be valid, with no way to
    // recover short of the user manually reloading. Re-run the same
    // WAIT_PARENT → ACTIVE validation this message normally drives.
    //
    // FIX (parent-ready-bounce-loop): the check above fired on ANY fresh
    // PARENT_READY while ACTIVE, but chat.html legitimately re-sends
    // PARENT_READY many times during normal operation (module switches,
    // periodic session refresh — see chat.html's own multiple
    // sendSessionToModule() call sites), not only on an actual parent
    // reload. Since a genuine parent reload would also destroy and
    // recreate this very iframe (resetting LifecycleState from scratch,
    // so we could never observe ourselves as ACTIVE at that moment), the
    // old condition was actually firing on routine redundant resends of
    // the SAME still-valid session — producing a repeating
    // ACTIVE → WAIT_PARENT → ACTIVE bounce with no real state change.
    // The one case this guard genuinely needs to catch is a same-tab
    // account switch (parent re-authenticates as a different user without
    // a full page reload) — detectable by the incoming message's userId
    // actually differing from the user we're currently active for.
    if (LifecycleState.isActive()) {
      const incomingUserId = message?.payload?.userId ?? message?.userId ?? null;
      const activeUserId = (getCurrentUserLocal() || {}).id ?? (getCurrentUserLocal() || {}).uid ?? null;
      const isGenuineAccountSwitch = incomingUserId != null && activeUserId != null && String(incomingUserId) !== String(activeUserId);
      if (isGenuineAccountSwitch) {
        parentReadyReceived = false;
        _parentReadyProcessedFlag = false;
        LifecycleState.reenterWaitParent('account switch detected via fresh PARENT_READY while ACTIVE');
      } else {
        debugLog('Ignoring redundant PARENT_READY while ACTIVE (same user, no reload) — not re-entering WAIT_PARENT');
        return true;
      }
    }

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
    // Use let (not const) — we reassign when normalising the userId below
    let updateData = message.payload;
    /* lifecycle log suppressed */

    if (updateData && LifecycleState.isActive()) {
      const normalizedUpdateUserId = typeof updateData.user?.id === 'string' ? Number(updateData.user.id) : typeof updateData.userId === 'string' ? Number(updateData.userId) : updateData.user?.id;
      if (Number.isFinite(normalizedUpdateUserId)) {
        updateData = {
          ...updateData,
          userId: normalizedUpdateUserId,
          user: updateData.user ? {
            ...updateData.user,
            id: normalizedUpdateUserId,
            userId: normalizedUpdateUserId
          } : updateData.user
        };
      }

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
      } else if (updateData.token && updateData.user && __isValidSession({
        token: updateData.token,
        user: updateData.user
      })) {
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
    // FIX (groups-tabs-empty-root-cause): requestId is sent by the parent at
    // the TOP LEVEL of the postMessage envelope ({ type, requestId, payload,
    // timestamp }) — see chat.html's API_REQUEST handler — not nested inside
    // payload. Reading it from payload (as this used to) meant requestId was
    // always undefined here, so resolveRequest()/rejectRequest() never fired
    // for ANY apiRequest() call in this module: every call (requestGroupList,
    // etc.) silently ran out the clock and timed out after ~12-20s instead of
    // resolving, which is why the all/joined/admin/invited tabs rendered
    // nothing while Discover (which uses its own direct fetch() in
    // panelFetch, bypassing this bridge entirely) worked fine. Every sibling
    // module (friend-core.bootstrap.js, messages-core.bootstrap.js) reads
    // requestId off the top-level message — matched that pattern here.
    const requestId = message.requestId;
    const {
      success,
      error
    } = payload;
    // Normalise common backend response shapes so callers always get the entity directly:
    //   { data: { group: {…} } }  →  data = group object
    //   { data: { message: {…} } } →  data = message object
    //   { data: { member: {…} } }  →  data = member object
    //   { data: { groups: […] } }  →  left intact (requestGroupList expects array wrapper)
    let data = payload.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (data.group && !data.groups) data = data.group;else if (data.message && !data.groups) data = data.message;else if (data.member && !data.groups) data = data.member;
    }
    if (requestId) {
      if (success) {
        resolveRequest(requestId, {
          success: true,
          data
        });
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
    const {
      section,
      key,
      value,
      settings
    } = payload;
    debugLog('Settings change notification:', {
      section,
      key,
      value
    });

    // Apply the single key change using the full applier
    if (section && key !== undefined) {
      applySettingToGroupModule(section, key, value);
    }

    // If a full settings object was provided, apply all keys
    if (settings && typeof settings === 'object') {
      Object.entries(settings).forEach(([sec, secVal]) => {
        if (secVal && typeof secVal === 'object') Object.entries(secVal).forEach(([k, v]) => applySettingToGroupModule(sec, k, v));
      });
      try {
        SafeStorage.setItem('user_settings', settings);
      } catch (e) {}
    }
    GroupCore.emit('setting_changed', {
      section,
      key,
      value,
      settings
    });
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
        setGroups(payload.groups || []);
      }
      if (typeof myGroups !== 'undefined') {
        setMyGroups(payload.myGroups || []);
      }
      if (typeof joinedGroups !== 'undefined') {
        setJoinedGroups(payload.joinedGroups || []);
      }
      if (typeof adminGroups !== 'undefined') {
        setAdminGroups(payload.adminGroups || []);
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

      // Refresh UI so the new group appears immediately
      if (LifecycleState.isActive()) {
        if (typeof updateGroupCounts === 'function') updateGroupCounts();
        if (typeof updateCurrentSection === 'function') updateCurrentSection();
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
          setSelectedGroup(updatedGroup);
          if (typeof loadGroupDetails === 'function') {
            loadGroupDetails(selectedGroup, selectedGroup.type || 'group');
          }
        }
        if (currentChatGroup && currentChatGroup.id === updatedGroup.id) {
          setCurrentChatGroup(updatedGroup);
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
        GroupCore.emit('group:deleted', {
          groupId
        });
      }

      // Update global variables
      if (typeof groups !== 'undefined') {
        setGroups(groups.filter(g => g.id !== groupId));
      }
      if (typeof myGroups !== 'undefined') {
        setMyGroups(myGroups.filter(g => g.id !== groupId));
      }
      if (typeof adminGroups !== 'undefined') {
        setAdminGroups(adminGroups.filter(g => g.id !== groupId));
      }
      if (typeof joinedGroups !== 'undefined') {
        setJoinedGroups(joinedGroups.filter(g => g.id !== groupId));
      }
      if (typeof groupInvites !== 'undefined') {
        setGroupInvites(groupInvites.filter(invite => invite.groupId !== groupId && invite.id !== groupId));
      }
      if (typeof groupMessages !== 'undefined') {
        delete groupMessages[groupId];
      }
      if (typeof groupUnreadCounts !== 'undefined') {
        delete groupUnreadCounts[groupId];
      }

      // CRITICAL FIX: Full cache cleanup for deleted group
      try {
        SafeStorage?.removeItem(`group_messages_${groupId}`);
        SafeStorage?.removeItem(`group_unread_${groupId}`);
        SafeStorage?.removeItem(`group_data_${groupId}`);
        SafeStorage?.removeItem(`group_members_${groupId}`);
      } catch (e) {}

      // Track in permanent deleted-groups list so it never restores from cache
      try {
        const DELETED_KEY = 'kyn_deleted_groups_v1';
        const existing = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
        const gid = String(groupId);
        if (!existing.includes(gid)) {
          existing.push(gid);
          if (existing.length > 200) existing.splice(0, existing.length - 200);
          localStorage.setItem(DELETED_KEY, JSON.stringify(existing));
        }
      } catch (_) {}

      // Clean IndexedDB via LocalGroupStore
      try {
        if (window.LocalGroupStore && typeof window.LocalGroupStore.remove === 'function') {
          window.LocalGroupStore.remove(groupId).catch(() => {});
        }
      } catch (_) {}

      // Close chat if open (only if ACTIVE)
      if (LifecycleState.isActive()) {
        if (currentChatGroup && currentChatGroup.id === groupId) {
          if (typeof closeGroupChatMobile === 'function') {
            closeGroupChatMobile();
          }
          setCurrentChatGroup(null);
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
      const {
        groupId,
        member
      } = payload;
      const currentUserId = getCurrentUserLocal()?.id || getCurrentUserLocal()?.uid;

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
            // If THIS user was just added, ensure group appears in joinedGroups
            if (String(member.userId) === String(currentUserId)) {
              if (!GroupCore.joinedGroups.some(g => g.id === groupId)) {
                GroupCore.joinedGroups.push(group);
              }
              if (!GroupCore.groups.some(g => g.id === groupId)) {
                GroupCore.groups.push(group);
              }
            }
            GroupCore.saveGroups();
            GroupCore.emit('group:member-added', {
              groupId,
              member
            });
            // Refresh UI immediately
            if (LifecycleState.isActive()) {
              if (typeof updateGroupCounts === 'function') updateGroupCounts();
              if (typeof updateCurrentSection === 'function') updateCurrentSection();
            }
          }
        }
      }

      // Update global variables
      const group = (typeof groups !== 'undefined' ? groups.find(g => g.id === groupId) : null) || (typeof myGroups !== 'undefined' ? myGroups.find(g => g.id === groupId) : null) || (typeof adminGroups !== 'undefined' ? adminGroups.find(g => g.id === groupId) : null) || (typeof joinedGroups !== 'undefined' ? joinedGroups.find(g => g.id === groupId) : null);
      if (group) {
        if (!group.members) group.members = [];
        if (!group.members.some(m => m.userId === member.userId)) {
          group.members.push(member);
          if (group.memberCount !== undefined) {
            group.memberCount = group.members.length;
          }
          updateGroupInAllLists(group);
        }
      } else if (typeof groups !== 'undefined') {
        // Group not found locally — new group for this user, trigger full sync
        if (LifecycleState.isActive() && sessionReady) {
          setTimeout(() => {
            if (typeof syncGroupsFromServer === 'function') syncGroupsFromServer().catch(() => {});
          }, 500);
        }
      }
    }
  },
  handleMemberRemoved(message) {
    const payload = message.payload || {};
    if (payload.groupId && payload.userId) {
      const {
        groupId,
        userId
      } = payload;

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
          GroupCore.emit('group:member-removed', {
            groupId,
            userId
          });
        }
      }

      // Update global variables
      const group = (typeof groups !== 'undefined' ? groups.find(g => g.id === groupId) : null) || (typeof myGroups !== 'undefined' ? myGroups.find(g => g.id === groupId) : null) || (typeof adminGroups !== 'undefined' ? adminGroups.find(g => g.id === groupId) : null) || (typeof joinedGroups !== 'undefined' ? joinedGroups.find(g => g.id === groupId) : null);
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
          setGroups(groups.filter(g => g.id !== groupId));
        }
        if (typeof myGroups !== 'undefined') {
          setMyGroups(myGroups.filter(g => g.id !== groupId));
        }
        if (typeof adminGroups !== 'undefined') {
          setAdminGroups(adminGroups.filter(g => g.id !== groupId));
        }
        if (typeof joinedGroups !== 'undefined') {
          setJoinedGroups(joinedGroups.filter(g => g.id !== groupId));
        }
        if (currentChatGroup && currentChatGroup.id === groupId) {
          if (typeof closeGroupChatMobile === 'function') {
            closeGroupChatMobile();
          }
          setCurrentChatGroup(null);
        }
      }
    }
  },
  handleAdminPromoted(message) {
    const payload = message.payload || {};
    if (payload.groupId && payload.userId) {
      const {
        groupId,
        userId
      } = payload;

      // Update GroupCore
      if (GroupCore) {
        const group = GroupCore.getGroupById(groupId);
        if (group && group.members) {
          const member = group.members.find(m => m.userId === userId);
          if (member) {
            member.role = 'admin';
            GroupCore.updateGroupInLists(group);
            GroupCore.saveGroups();
            GroupCore.emit('group:admin-promoted', {
              groupId,
              userId
            });
          }
        }
      }

      // Update global variables
      const group = (typeof groups !== 'undefined' ? groups.find(g => g.id === groupId) : null) || (typeof myGroups !== 'undefined' ? myGroups.find(g => g.id === groupId) : null) || (typeof adminGroups !== 'undefined' ? adminGroups.find(g => g.id === groupId) : null) || (typeof joinedGroups !== 'undefined' ? joinedGroups.find(g => g.id === groupId) : null);
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
      const {
        groupId,
        userId
      } = payload;

      // Update GroupCore
      if (GroupCore) {
        const group = GroupCore.getGroupById(groupId);
        if (group && group.members) {
          const member = group.members.find(m => m.userId === userId);
          if (member) {
            member.role = 'member';
            GroupCore.updateGroupInLists(group);
            GroupCore.saveGroups();
            GroupCore.emit('group:admin-demoted', {
              groupId,
              userId
            });
          }
        }
      }

      // Update global variables
      const group = (typeof groups !== 'undefined' ? groups.find(g => g.id === groupId) : null) || (typeof myGroups !== 'undefined' ? myGroups.find(g => g.id === groupId) : null) || (typeof adminGroups !== 'undefined' ? adminGroups.find(g => g.id === groupId) : null) || (typeof joinedGroups !== 'undefined' ? joinedGroups.find(g => g.id === groupId) : null);
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
  async handleGroupMessage(message) {
    const payload = message.payload || {};
    if (payload.groupId && payload.message) {
      const {
        groupId,
        message: messageData
      } = payload;

      // FIX-DUPLICATE-GROUP-RENDER: The backend used to (and in some
      // paths still legitimately can, e.g. genuine reconnect resync)
      // deliver the same real message more than once — via different
      // socket event names, duplicate room membership, or the
      // group:localSync relay each independently reaching this
      // handler. The envelope-level dedup in ParentMessaging.handleIncoming
      // doesn't catch this because each delivery gets a fresh envelope
      // id. Check the actual message's own id/messageId here, before
      // it's ever pushed into state or rendered.
      const realMessageId = messageData && (messageData.id || messageData.messageId);
      if (realMessageId && isDuplicateGroupChatMessage(realMessageId)) {
        return;
      }

      // FIX-GROUP-ENCRYPTION: decrypt before this message is ever
      // stored or rendered — mirrors the 1:1 chat decrypt-at-the-
      // actual-write-point fix from an earlier round. Mutates
      // messageData.content in place; safe no-op if the message
      // isn't marked encrypted in its metadata.
      if (window.KynectaGroupE2E) {
        await window.KynectaGroupE2E.decryptIncoming(groupId, messageData).catch(() => {});
      }

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

      // Detect @mentions before branching on whether the chat is open, so
      // the highlight in buildGroupMessageMarkup works either way — not
      // just when triggering a notification.
      try {
        const _meUser = getCurrentUserLocal();
        const text = (messageData && (messageData.content || messageData.text || '')).toString();
        if (text && /@/.test(text)) {
          const candidates = [_meUser?.username, _meUser?.displayName, _meUser?.name]
            .filter(Boolean).map(s => s.toString().trim().toLowerCase()).filter(Boolean);
          messageData.isMention = candidates.some(name => text.toLowerCase().includes('@' + name));
        } else {
          messageData.isMention = false;
        }
      } catch (_) { messageData.isMention = false; }

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

          // FIX (Notifications audit): group messages previously had
          // NO notification pathway at all — no sound, no OS
          // notification, no backend push (group.js's message route
          // never calls pushNotificationService, unlike messages.js).
          // The "Group Notifications" toggle in Settings had nothing
          // to actually control. This reuses the same
          // kyn:incomingMessage event and native-notification listener
          // chat.html already has wired up for 1:1 messages, gated on
          // the settings this file already tracks (enableNotifications/
          // groupNotifications/notificationSound), and skips it for
          // your own messages echoing back.
          try {
            const _me = getCurrentUserLocal()?.id || getCurrentUserLocal()?.uid;
            const _sender = messageData && (messageData.senderId || messageData.userId);
            const _isSelf = _me && _sender && String(_me) === String(_sender);
            // group-core.js's settings listener already folds the master
            // "enableNotifications" toggle into __groupNotificationsEnabled
            // (both keys write to the same global), so this one check covers
            // both "notifications off entirely" and "group notifications off".
            const _groupNotifsOn = window.__groupNotificationsEnabled !== false;

            // FIX (Notifications audit): mentionNotifications existed as a
            // setting but there was no @mention detection anywhere in the
            // group message pipeline for it to gate — it had nothing to do.
            // isMention was computed above (before the open/closed branch);
            // treating a real mention as notify-worthy independently of the
            // general group notifications toggle is the same behavior
            // WhatsApp/Signal use, and the whole point of a separate setting.
            const _isMention = messageData.isMention === true && window.__mentionNotificationsEnabled !== false;

            if (!_isSelf && (_groupNotifsOn || _isMention)) {
              if (window.__notificationSoundEnabled !== false) {
                // group-core.js runs as its own iframe module — it has no
                // access to messages-core.js's UIFeatures object (a separate
                // iframe), so this mirrors that file's Web Audio beep rather
                // than referencing something that doesn't exist here.
                try {
                  const AudioCtx = window.AudioContext || window.webkitAudioContext;
                  if (AudioCtx) {
                    const ctx = new AudioCtx();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, ctx.currentTime);
                    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.3);
                    osc.onended = () => {
                      try {
                        ctx.close();
                      } catch (_) {}
                    };
                  }
                } catch (_soundErr) {}
              }
              if (window.__vibrationEnabled !== false && navigator.vibrate) {
                try { navigator.vibrate(200); } catch (_vibrateErr) {}
              }
              window.dispatchEvent(new CustomEvent('kyn:incomingMessage', {
                detail: {
                  message: messageData,
                  chatId: groupId,
                  isGroup: true
                }
              }));
              // dispatchEvent alone only fires within this iframe's own
              // window — nothing local listens for it (group UI updates
              // go through GroupCore's own emit/on system instead), and
              // chat.html's parent-level listener needs a postMessage.
              if (window.parent && window.parent !== window) {
                try {
                  window.parent.postMessage({
                    type: 'kyn:incomingMessage',
                    detail: {
                      message: messageData,
                      chatId: groupId,
                      isGroup: true
                    }
                  }, '*');
                } catch (_relayErr) {}
              }
            }
          } catch (_notifErr) {}
        }
      }
    }
  },
  handleUnreadCountUpdated(message) {
    const payload = message.payload || {};
    if (payload.groupId) {
      const {
        groupId,
        count
      } = payload;
      if (typeof groupUnreadCounts !== 'undefined') {
        groupUnreadCounts[groupId] = count !== undefined ? count : 0;
        try {
          SafeStorage?.setItem(`group_unread_${groupId}`, groupUnreadCounts[groupId]);
        } catch (e) {}
      }
      if (GroupCore) {
        GroupCore.groupUnreadCounts[groupId] = count !== undefined ? count : 0;
        GroupCore.emit('group:unread-count-updated', {
          groupId,
          count: count || 0
        });
      }
    }
  },
  handleTypingIndicator(message) {
    const payload = message.payload || {};
    if (payload.groupId && payload.userId) {
      const {
        groupId,
        userId,
        isTyping
      } = payload;
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

let _lastAppliedSessionHash = null;

function applySession(sessionData) {
  if (!sessionData) return;
  const normalizedUserId = typeof sessionData.user?.id === 'string' ? Number(sessionData.user.id) : typeof sessionData.userId === 'string' ? Number(sessionData.userId) : sessionData.user?.id ?? sessionData.userId;
  if (Number.isFinite(normalizedUserId)) {
    sessionData = {
      ...sessionData,
      id: normalizedUserId,
      userId: normalizedUserId,
      user: sessionData.user ? {
        ...sessionData.user,
        id: normalizedUserId,
        userId: normalizedUserId
      } : {
        id: normalizedUserId,
        userId: normalizedUserId
      }
    };
  }

  // Validate session data before applying
  if (!__isValidSession(sessionData, 'incoming')) {
    console.warn('[MODULE] applySession: Invalid session data, ignoring', sessionData);
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
      setCurrentUser(sessionData.user);
    }
    if (typeof userData !== 'undefined') {
      setUserData({
        displayName: sessionData.user.displayName || sessionData.user.name || 'User',
        username: sessionData.user.username || '',
        email: sessionData.user.email || '',
        photoURL: sessionData.user.photoURL || sessionData.user.avatar || ''
      });
    }
  }

  // Update auth flags
  if (typeof authReady !== 'undefined') {
    setAuthReady(true);
  }
  if (typeof authCheckComplete !== 'undefined') {
    setAuthCheckComplete(true);
  }
  if (typeof __SESSION_READY__ !== 'undefined') {
    setSessionReadyFlag(true);
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

    // Load cached data (OFFLINE-FIRST PRIORITY)
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
      this.emit('groups:loaded', {
        groups: this.groups
      });
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
      setGroups(this.groups);
      setMyGroups(this.myGroups);
      setJoinedGroups(this.joinedGroups);
      setAdminGroups(this.adminGroups);
      setGroupInvites(this.groupInvites);
    } catch (error) {
      console.error('Error saving groups:', error);
    }
  },
  // Get group by ID
  getGroupById(groupId) {
    const targetId = String(groupId);
    return this.groups.find(g => String(g.id) === targetId) || this.myGroups.find(g => String(g.id) === targetId) || this.adminGroups.find(g => String(g.id) === targetId) || this.joinedGroups.find(g => String(g.id) === targetId);
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

  // Request group list from parent using apiRequest - OFFLINE-FIRST
  async requestGroupList() {
    if (!LifecycleState.ensureActive()) {
      debugLog('Cannot request groups: not active');
      return {
        success: false,
        reason: 'not_active'
      };
    }

    // CRITICAL: Load from cache FIRST for instant UI
    await this.loadGroupsFromCache();
    if (!sessionReady) {
      debugLog('Cannot request groups: session not ready - using cache only');
      requestSession();
      return {
        success: true,
        fromCache: true,
        data: this.getGroupsData()
      };
    }
    debugLog('Requesting group list via apiRequest for sync');
    try {
      const response = await apiRequest('/groups/user', 'GET');
      if (response && response.success && response.data) {
        const groupsData = response.data;

        // Merge with cache - server wins for conflicts
        await this.mergeWithServerData(groupsData);
        this.saveGroups();
        this.emit('groups:list-updated', {
          groups: this.groups,
          myGroups: this.myGroups,
          joinedGroups: this.joinedGroups,
          adminGroups: this.adminGroups,
          fromServer: true
        });
        debugLog(`Synced ${this.groups.length} groups with backend`);
        return {
          success: true,
          fromServer: true,
          data: this.getGroupsData()
        };
      }
      return {
        success: true,
        fromCache: true,
        data: this.getGroupsData()
      };
    } catch (error) {
      debugLog('Failed to sync groups, using cache:', error);
      return {
        success: true,
        fromCache: true,
        data: this.getGroupsData()
      };
    }
  },
  // Load groups from cache - OFFLINE-FIRST PRIORITY
  async loadGroupsFromCache() {
    try {
      if (window.LocalGroupStore && typeof window.LocalGroupStore.getAll === 'function') {
        const cachedGroups = await window.LocalGroupStore.getAll();

        // CRITICAL FIX: Filter out permanently deleted groups
        let deletedGroupIds = new Set();
        try {
          const deleted = JSON.parse(localStorage.getItem('kyn_deleted_groups_v1') || '[]');
          deletedGroupIds = new Set(deleted.map(String));
        } catch (_) {}
        if (cachedGroups && cachedGroups.length > 0) {
          // Process cached groups into arrays - exclude deleted
          const filteredGroups = cachedGroups.filter(g => g && g.id && !deletedGroupIds.has(String(g.id)));
          this.groups = filteredGroups;
          // Reassign so old code below works
          const _cachedGroups_orig = filteredGroups;
          const _cuid = this.currentUser?.uid || this.currentUser?.id;
          // PHASE10-FIX: _cuid may not be set yet — also check all role fields
          // to avoid creator's groups showing as empty on first load
          this.myGroups = cachedGroups.filter(g => g.isCreator === true || g.role === 'owner' || _cuid && String(g.createdBy) === String(_cuid) || _cuid && String(g.creatorId) === String(_cuid) || g.isAdmin === true);
          this.joinedGroups = cachedGroups.filter(g => !g.isCreator && g.role !== 'owner' && !(_cuid && (String(g.createdBy) === String(_cuid) || String(g.creatorId) === String(_cuid))));
          this.adminGroups = cachedGroups.filter(g => g.isAdmin === true || g.isCreator === true || ['owner', 'admin'].includes(g.role));
          setGroups(this.groups);
          setMyGroups(this.myGroups);
          setJoinedGroups(this.joinedGroups);
          setAdminGroups(this.adminGroups);
          this.emit('groups:list-updated', {
            groups: this.groups,
            myGroups: this.myGroups,
            joinedGroups: this.joinedGroups,
            adminGroups: this.adminGroups,
            fromCache: true
          });
          debugLog(`Loaded ${this.groups.length} groups from cache - OFFLINE-FIRST`);
          return true;
        }
      }
    } catch (error) {
      debugLog('Cache load failed, will fallback to API:', error);
    }
    return false;
  },
  // Merge server data with cache - server wins for conflicts
  async mergeWithServerData(serverData) {
    try {
      const serverGroups = serverData.groups || [];
      const serverMap = new Map(serverGroups.map(g => [String(g.id), g]));

      // Update existing groups or add new ones
      for (const [id, serverGroup] of serverMap) {
        const existingIndex = this.groups.findIndex(g => String(g.id) === id);
        if (existingIndex >= 0) {
          // Merge - server data wins but preserve local-only fields
          const existing = this.groups[existingIndex];
          const mcUpd = parseInt(serverGroup.memberCount) || parseInt(serverGroup.member_count) || parseInt(serverGroup.stats && serverGroup.stats.totalMembers) || parseInt(serverGroup._count && serverGroup._count.members) || parseInt(existing.memberCount) || 0;
          this.groups[existingIndex] = {
            ...serverGroup,
            // Creator is always a member — ensure at least 1
            memberCount: Math.max(mcUpd, serverGroup.isCreator ? 1 : mcUpd),
            syncState: 'synced',
            isLocalOnly: false,
            cachedAt: existing.cachedAt,
            localMessages: existing.localMessages || []
          };
        } else {
          // New group from server — normalise memberCount
          const mc = parseInt(serverGroup.memberCount) || parseInt(serverGroup.member_count) || parseInt(serverGroup.stats && serverGroup.stats.totalMembers) || parseInt(serverGroup._count && serverGroup._count.members) || 0;
          this.groups.push({
            ...serverGroup,
            memberCount: Math.max(mc, serverGroup.isCreator ? 1 : mc),
            syncState: 'synced',
            isLocalOnly: false
          });
        }
      }

      // Remove groups that no longer exist on server (unless local-only)
      // CRITICAL FIX: Also never restore permanently deleted groups
      let _deletedGIDs = new Set();
      try {
        _deletedGIDs = new Set(JSON.parse(localStorage.getItem('kyn_deleted_groups_v1') || '[]').map(String));
      } catch (_) {}
      this.groups = this.groups.filter(g => !_deletedGIDs.has(String(g.id)) && (g.isLocalOnly || serverMap.has(String(g.id))));
      const _uid = this.currentUser?.uid || this.currentUser?.id;
      this.myGroups = this.groups.filter(g => g.isCreator === true || g.role === 'owner' || _uid && String(g.createdBy) === String(_uid));
      this.joinedGroups = this.groups.filter(g => !g.isCreator && g.role !== 'owner' && !(_uid && String(g.createdBy) === String(_uid)));
      this.adminGroups = this.groups.filter(g => g.isAdmin === true || g.isCreator === true || ['owner', 'admin'].includes(g.role));
      setGroups(this.groups);
      setMyGroups(this.myGroups);
      setJoinedGroups(this.joinedGroups);
      setAdminGroups(this.adminGroups);
    } catch (error) {
      debugLog('Failed to merge server data:', error);
    }
  },
  // Get current groups data structure
  getGroupsData() {
    return {
      groups: this.groups,
      myGroups: this.myGroups,
      joinedGroups: this.joinedGroups,
      adminGroups: this.adminGroups
    };
  },
  // Create a new group using apiRequest
  async createGroup(groupData) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'createGroup',
        data: groupData
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'createGroup',
        data: groupData
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
    }
    debugLog('Creating group via apiRequest');
    try {
      const response = await apiRequest('/groups', 'POST', {
        name: groupData.name,
        description: groupData.description || '',
        members: groupData.members || groupData.memberIds || [],
        memberIds: groupData.memberIds || groupData.members || [],
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
        return {
          success: true,
          data: newGroup
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to create group:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Get group details using apiRequest
  async getGroupDetails(groupId) {
    if (!LifecycleState.ensureActive()) {
      return {
        success: false,
        reason: 'not_active'
      };
    }
    if (!sessionReady) {
      requestSession();
      return {
        success: false,
        reason: 'session_not_ready'
      };
    }
    debugLog(`Getting group details for ${groupId}`);
    try {
      const response = await apiRequest(`/groups/${groupId}`, 'GET');
      if (response && response.success && response.data) {
        const group = response.data;
        this.updateGroupInLists(group);
        this.saveGroups();
        this.emit('group:details-loaded', group);
        return {
          success: true,
          data: group
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to get group details:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Update group settings using apiRequest
  async updateGroup(groupId, groupData) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'updateGroup',
        groupId,
        data: groupData
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'updateGroup',
        groupId,
        data: groupData
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
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
        return {
          success: true,
          data: updatedGroup
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to update group:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Delete group using apiRequest
  async deleteGroup(groupId) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'deleteGroup',
        groupId
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'deleteGroup',
        groupId
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
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
        this.emit('group:deleted', {
          groupId
        });
        debugLog('Group deleted');
        return {
          success: true
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to delete group:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Add member to group using apiRequest
  async addMember(groupId, userId, role = 'member') {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'addMember',
        groupId,
        userId,
        role
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'addMember',
        groupId,
        userId,
        role
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
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
            this.emit('group:member-added', {
              groupId,
              member
            });
            debugLog('Member added to group');
          }
        }
        return {
          success: true,
          data: member
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to add member:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Remove member from group using apiRequest
  async removeMember(groupId, userId) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'removeMember',
        groupId,
        userId
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'removeMember',
        groupId,
        userId
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
    }
    debugLog('Removing member from group via apiRequest');
    try {
      const response = await apiRequest(`/groups/${groupId}/members/${userId}`, 'DELETE');
      const _unused = {
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
          this.emit('group:member-removed', {
            groupId,
            userId
          });
          debugLog('Member removed from group');
        }
        return {
          success: true
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to remove member:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Leave group using apiRequest
  async leaveGroup(groupId) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'leaveGroup',
        groupId
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'leaveGroup',
        groupId
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
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
        this.emit('group:left', {
          groupId
        });
        debugLog('Left group');
        return {
          success: true
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to leave group:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Promote to admin using apiRequest
  async promoteToAdmin(groupId, userId) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'promoteToAdmin',
        groupId,
        userId
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'promoteToAdmin',
        groupId,
        userId
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
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
            this.emit('group:admin-promoted', {
              groupId,
              userId
            });
            debugLog('User promoted to admin');
          }
        }
        return {
          success: true
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to promote to admin:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Demote from admin using apiRequest
  async demoteFromAdmin(groupId, userId) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'demoteFromAdmin',
        groupId,
        userId
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'demoteFromAdmin',
        groupId,
        userId
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
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
            this.emit('group:admin-demoted', {
              groupId,
              userId
            });
            debugLog('User demoted from admin');
          }
        }
        return {
          success: true
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to demote from admin:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // ===== Invite a user to a group via the real invitation API =====
  async inviteToGroup(groupId, inviteeId, role = 'member', message = '') {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'inviteToGroup',
        groupId,
        inviteeId,
        role
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'inviteToGroup',
        groupId,
        inviteeId,
        role
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
    }
    debugLog(`Inviting user ${inviteeId} to group ${groupId}`);
    try {
      const response = await apiRequest(`/group-members/${groupId}/invitations`, 'POST', {
        inviteeId,
        role,
        message
      });
      if (response && response.success) {
        this.emit('group:invitation-sent', {
          groupId,
          inviteeId
        });
        debugLog('Invitation sent');
        return {
          success: true,
          data: response.data
        };
      }
      return {
        success: false,
        error: response?.error || 'Failed to send invitation'
      };
    } catch (error) {
      debugLog('Failed to invite user:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // ===== Cancel a pending invitation =====
  async cancelInvitation(invitationId) {
    if (!LifecycleState.ensureActive()) return {
      success: false,
      reason: 'not_active'
    };
    if (!sessionReady) {
      requestSession();
      return {
        success: false,
        reason: 'session_not_ready'
      };
    }
    debugLog(`Cancelling invitation ${invitationId}`);
    try {
      const response = await apiRequest(`/group-members/invitations/${invitationId}`, 'DELETE');
      if (response && response.success) {
        this.emit('group:invitation-cancelled', {
          invitationId
        });
        return {
          success: true
        };
      }
      return {
        success: false,
        error: response?.error || 'Failed to cancel invitation'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },
  // ===== Fetch pending invitations for a group =====
  async getGroupInvitations(groupId) {
    if (!LifecycleState.ensureActive()) return {
      success: false,
      data: []
    };
    if (!sessionReady) {
      requestSession();
      return {
        success: false,
        data: []
      };
    }
    try {
      const response = await apiRequest(`/group-members/${groupId}/invitations`, 'GET');
      if (response && response.success) return {
        success: true,
        data: response.data
      };
      return {
        success: false,
        data: []
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error.message
      };
    }
  },
  // Send join request using apiRequest
  async sendJoinRequest(groupId, message = '') {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'sendJoinRequest',
        groupId,
        message
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'sendJoinRequest',
        groupId,
        message
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
    }
    debugLog('Sending join request via apiRequest');
    try {
      const response = await apiRequest(`/groups/${groupId}/join`, 'POST', {
        message
      });
      if (response && response.success) {
        this.emit('group:join-request-sent', {
          groupId
        });
        debugLog('Join request sent');
        // Add the group to joinedGroups immediately so Joined tab updates
        const joinedGrp = response.data && (response.data.group || response.data) || null;
        if (joinedGrp && joinedGrp.id) {
          if (!this.groups.some(g => String(g.id) === String(joinedGrp.id))) {
            this.groups.push(joinedGrp);
          }
          if (!this.joinedGroups.some(g => String(g.id) === String(joinedGrp.id))) {
            this.joinedGroups.push(joinedGrp);
          }
          // Increment memberCount on the group object
          const gInList = this.groups.find(g => String(g.id) === String(joinedGrp.id));
          if (gInList) {
            gInList.memberCount = (gInList.memberCount || 0) + 1;
            if (gInList.stats) gInList.stats.totalMembers = gInList.memberCount;
          }
          this.saveGroups();
          // Dispatch live count update so cards refresh instantly
          window.dispatchEvent(new CustomEvent('kyn:memberJoined', {
            detail: {
              groupId,
              member: this.currentUser,
              newCount: gInList && gInList.memberCount
            }
          }));
          this.emit('groups:list-updated', {
            groups: this.groups,
            myGroups: this.myGroups,
            joinedGroups: this.joinedGroups,
            adminGroups: this.adminGroups,
            fromServer: false
          });
        }
        // Re-fetch fresh list in background to get accurate count from server
        setTimeout(() => {
          this.requestGroupList().catch(() => {});
        }, 1200);
        return {
          success: true,
          data: joinedGrp
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to send join request:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Approve join request using apiRequest
  async approveJoinRequest(groupId, requestId, userId) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'approveJoinRequest',
        groupId,
        requestId,
        userId
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'approveJoinRequest',
        groupId,
        requestId,
        userId
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
    }
    debugLog('Approving join request via apiRequest');
    try {
      const response = await apiRequest(`/groups/${groupId}/members/${requestId}`, 'POST');
      if (response && response.success) {
        this.emit('group:join-request-approved', {
          groupId,
          userId
        });
        debugLog('Join request approved');
        return {
          success: true
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to approve join request:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Reject join request using apiRequest
  async rejectJoinRequest(groupId, requestId, userId) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'rejectJoinRequest',
        groupId,
        requestId,
        userId
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'rejectJoinRequest',
        groupId,
        requestId,
        userId
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
    }
    debugLog('Rejecting join request via apiRequest');
    try {
      // FIXED: Use correct reject endpoint
      const response = await apiRequest(`/groups/${groupId}/join-requests/${requestId}/reject`, 'POST', {
        userId
      });
      if (response && response.success) {
        this.emit('group:join-request-rejected', {
          groupId,
          userId
        });
        debugLog('Join request rejected');
        return {
          success: true
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to reject join request:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Send group message using apiRequest
  async sendGroupMessage(groupId, content, topic = null, anonymous = false) {
    if (!LifecycleState.ensureActive()) {
      queueGroupAction({
        type: 'sendMessage',
        groupId,
        content,
        topic,
        anonymous
      });
      return {
        queued: true
      };
    }
    if (!sessionReady) {
      queueGroupAction({
        type: 'sendMessage',
        groupId,
        content,
        topic,
        anonymous
      });
      requestSession();
      return {
        queued: true,
        reason: 'session_not_ready'
      };
    }
    debugLog('Sending group message via apiRequest');

    // FIX-GROUP-ENCRYPTION: encrypt with this group's Sender Key before
    // it ever leaves the browser. window.KynectaGroupE2E (js/groupEncryption.client.js)
    // handles generating/distributing a key if we don't have one yet for
    // this group, and safely falls back to plaintext if E2E isn't active
    // (e.g. KynectaE2E hasn't initialized) — anonymous posts always stay
    // plaintext for now, since "anonymous" + "encrypted" interact in a
    // way (who do you even distribute the key to/from?) that needs its
    // own design, out of scope for this round.
    let outgoingContent = content;
    let encMeta = {
      encrypted: false
    };
    if (!anonymous && window.KynectaGroupE2E) {
      try {
        encMeta = await window.KynectaGroupE2E.encryptOutgoing(groupId, content);
        outgoingContent = encMeta.content;
      } catch (e) {
        debugLog('Group encryption failed, sending as plaintext:', e.message);
      }
    }
    try {
      const response = await apiRequest(`/groups/${groupId}/messages`, 'POST', {
        groupId,
        content: outgoingContent,
        topic,
        anonymous,
        metadata: {
          encrypted: !!encMeta.encrypted,
          keyGeneration: encMeta.keyGeneration || null
        }
      });
      if (response && response.success && response.data) {
        const messageData = response.data;
        // FIX-GROUP-ENCRYPTION: messageData.content here is whatever
        // the server echoed back — i.e. still the ciphertext we just
        // sent, if this message was encrypted. We already have the
        // real plaintext right here (the original `content` param),
        // so just use that directly instead of wastefully decrypting
        // our own message back out.
        if (encMeta.encrypted) {
          messageData.content = content;
        }
        this.saveGroupMessages(groupId, [messageData]);
        this.emit('group:message-sent', {
          groupId,
          message: messageData
        });
        debugLog('Message sent');
        return {
          success: true,
          data: messageData
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to send message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Load group messages using apiRequest
  async loadGroupMessages(groupId, limit = 50) {
    if (!LifecycleState.ensureActive()) {
      return {
        success: false,
        reason: 'not_active'
      };
    }
    if (!sessionReady) {
      requestSession();
      return {
        success: false,
        reason: 'session_not_ready'
      };
    }
    debugLog(`Loading messages for group ${groupId}`);
    try {
      const response = await apiRequest(`/groups/${groupId}/messages?limit=${limit}`, 'GET');
      if (response && response.success && response.data) {
        const messages = response.data;

        // FIX-GROUP-ENCRYPTION: decrypt the whole history batch
        // before it's cached or rendered — mirrors the 1:1 chat
        // syncChat() fix from an earlier round. One sender-key
        // fetch for the entire batch (not per-message) via
        // decryptIncomingBatch.
        if (window.KynectaGroupE2E) {
          await window.KynectaGroupE2E.decryptIncomingBatch(groupId, messages).catch(() => {});
        }
        this.groupMessages[groupId] = messages;
        try {
          SafeStorage.setItem(`group_messages_${groupId}`, messages);
        } catch (e) {}
        this.emit('group:messages-loaded', {
          groupId,
          messages
        });
        debugLog(`Loaded ${messages.length} messages`);
        return {
          success: true,
          data: messages
        };
      }
      return {
        success: false,
        error: 'Invalid response'
      };
    } catch (error) {
      debugLog('Failed to load messages:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  // Get group messages
  getGroupMessages(groupId) {
    return this.groupMessages[groupId] || [];
  },
  // Save group messages
  saveGroupMessages(groupId, messages) {
    const existing = this.groupMessages[groupId] || [];
    const merged = [];
    const seen = new Map();
    [...existing, ...(Array.isArray(messages) ? messages : [])].forEach(message => {
      if (!message) return;
      const key = String(message.id || message.localId || message.clientRequestId || `msg_${merged.length}`);
      const normalized = {
        ...message,
        groupId: message.groupId || groupId,
        createdAt: message.createdAt || message.timestamp || message.sentAt || new Date().toISOString(),
        timestamp: message.timestamp || message.createdAt || message.sentAt || new Date().toISOString()
      };
      if (seen.has(key)) {
        merged[seen.get(key)] = {
          ...merged[seen.get(key)],
          ...normalized
        };
        return;
      }
      seen.set(key, merged.length);
      merged.push(normalized);
    });
    merged.sort((a, b) => {
      const aTime = new Date(a.createdAt || a.timestamp || 0).getTime();
      const bTime = new Date(b.createdAt || b.timestamp || 0).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return Number(a.id || 0) - Number(b.id || 0);
    });
    this.groupMessages[groupId] = merged.slice(-100);
    try {
      SafeStorage.setItem(`group_messages_${groupId}`, this.groupMessages[groupId]);
    } catch (e) {}
  },
  // Add group message
  addGroupMessage(groupId, message) {
    if (!groupId || !message) return;

    // PHASE10: Check deletion registry — never resurrect deleted messages
    const _delReg = window.__PHASE10_DeletionRegistry;
    if (_delReg && message.id && _delReg.isDeleted('message', String(message.id))) return;
    const messages = this.groupMessages[groupId] || [];

    // PHASE10: Robust dedup — check id AND localId to prevent duplicates on echo
    const msgId = String(message.id || '');
    const msgLocalId = String(message.localId || '');
    const isDup = messages.some(m => {
      const mId = String(m.id || '');
      const mLid = String(m.localId || '');
      return msgId && (mId === msgId || mLid === msgId) || msgLocalId && (mId === msgLocalId || mLid === msgLocalId);
    });
    if (isDup) {
      // If we have a server id now but had only localId, patch in-place
      const existing = messages.find(m => msgLocalId && (String(m.id) === msgLocalId || String(m.localId) === msgLocalId));
      if (existing && msgId && msgId !== msgLocalId) {
        Object.assign(existing, {
          ...message,
          id: msgId
        });
        try {
          SafeStorage.setItem(`group_messages_${groupId}`, messages);
        } catch (e) {}
        this.emit('group:message-received', {
          groupId,
          message: existing
        });
      }
      return;
    }
    messages.push(message);
    if (messages.length > 200) {
      messages.splice(0, messages.length - 200);
    }
    this.groupMessages[groupId] = messages;
    try {
      SafeStorage.setItem(`group_messages_${groupId}`, messages);
    } catch (e) {}
    this.incrementGroupUnreadCount(groupId);
    this.emit('group:message-received', {
      groupId,
      message
    });
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
    this.emit('group:unread-count-updated', {
      groupId,
      count
    });
  },
  // Reset group unread count
  resetGroupUnreadCount(groupId) {
    if (!groupId) return;
    this.groupUnreadCounts[groupId] = 0;
    try {
      SafeStorage.setItem(`group_unread_${groupId}`, 0);
    } catch (e) {}
    this.emit('group:unread-count-updated', {
      groupId,
      count: 0
    });
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
    this.emit('group:typing', {
      groupId,
      userId,
      isTyping
    });
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

  // ✅ ENHANCED: Setup WebSocket event listeners for real-time member sync
  function setupGroupRealtimeListeners() {
    // Bind to WebSocket service if available
    if (window.wsService?.on) {
      ['group:member_added', 'group:member_removed', 'group:member_role_changed', 'group:member_joined', 'group:member_left'].forEach(eventName => {
        window.wsService.on(eventName, payload => {
          handleGroupMemberEvent(eventName, payload);
        });
      });
    }

    // Bind to KynectaRealtime singleton if available
    // FIX: Use a module-level Set to prevent duplicate listener registration on reconnect
    if (!window.__groupCoreListenersRegistered) {
      window.__groupCoreListenersRegistered = new Set();
    }
    if (window.KynectaRealtime?.on) {
      ['group:member_added', 'group:member_removed', 'group:member_role_changed', 'group:member_joined', 'group:member_left'].forEach(eventName => {
        if (window.__groupCoreListenersRegistered.has(eventName)) return;
        window.__groupCoreListenersRegistered.add(eventName);
        window.KynectaRealtime.on(eventName, payload => {
          handleGroupMemberEvent(eventName, payload);
        });
      });
    }

    // FIX: Listen for kyn:group:message CustomEvents dispatched by app.realtime.socket.js
    // This ensures group messages arrive even if the postMessage relay is slow
    if (!window.__groupCoreListenersRegistered.has('kyn:group:message')) {
      window.__groupCoreListenersRegistered.add('kyn:group:message');
      window.addEventListener('kyn:group:message', function (evt) {
        try {
          const msg = evt.detail;
          if (!msg || !msg.groupId) return;
          // Only handle if this group is currently open
          const activeGid = window._activeGroupId || GroupCore && GroupCore._state && GroupCore._state.activeGroupId;
          if (String(msg.groupId) !== String(activeGid)) return;
          if (GroupCore && typeof GroupCore.handleGroupMessage === 'function') {
            GroupCore.handleGroupMessage(msg);
          } else if (GroupCore && typeof GroupCore.addGroupMessage === 'function') {
            GroupCore.addGroupMessage(msg.groupId, msg);
          }
        } catch (_) {}
      });
    }

    // Bridge from DOM CustomEvents
    window.addEventListener('group:member_added', evt => {
      if (evt.detail) handleGroupMemberEvent('group:member_added', evt.detail);
    });
    window.addEventListener('group:member_removed', evt => {
      if (evt.detail) handleGroupMemberEvent('group:member_removed', evt.detail);
    });
    window.addEventListener('group:member_role_changed', evt => {
      if (evt.detail) handleGroupMemberEvent('group:member_role_changed', evt.detail);
    });

    // FIX: Listen for group:refresh_needed — server tells this user to sync
    const _handleRefreshNeeded = payload => {
      if (!LifecycleState.isActive() || !sessionReady) return;
      if (typeof syncGroupsFromServer === 'function') syncGroupsFromServer().catch(() => {});
      if (typeof syncGroupInvitesFromServer === 'function') syncGroupInvitesFromServer().catch(() => {});
    };
    if (window.wsService && window.wsService.on && !window.__groupCoreListenersRegistered.has('wsService:group:refresh_needed')) {
      window.__groupCoreListenersRegistered.add('wsService:group:refresh_needed');
      window.wsService.on('group:refresh_needed', _handleRefreshNeeded);
    }
    if (window.KynectaRealtime && window.KynectaRealtime.on && !window.__groupCoreListenersRegistered.has('rt:group:refresh_needed')) {
      window.__groupCoreListenersRegistered.add('rt:group:refresh_needed');
      window.KynectaRealtime.on('group:refresh_needed', _handleRefreshNeeded);
    }

    // FIX: Listen for GROUP_MEMBER_ADDED socket event
    const _handleMemberAddedSocket = payload => {
      if (!payload || !payload.groupId) return;
      const currentUserId = getCurrentUserLocal()?.id || getCurrentUserLocal()?.uid;
      if (String(payload.userId) === String(currentUserId) || String(payload.memberId) === String(currentUserId)) {
        if (LifecycleState.isActive() && sessionReady) {
          setTimeout(() => {
            if (typeof syncGroupsFromServer === 'function') syncGroupsFromServer().catch(() => {});
          }, 300);
        }
      }
      MessageRouter.handleMemberAdded({
        payload: {
          groupId: payload.groupId,
          member: payload.member || {
            userId: payload.userId || payload.memberId
          }
        }
      });
    };
    if (window.wsService && window.wsService.on) {
      ['GROUP_MEMBER_ADDED', 'group:member:joined'].forEach(ev => {
        if (!window.__groupCoreListenersRegistered.has('ws:' + ev)) {
          window.__groupCoreListenersRegistered.add('ws:' + ev);
          window.wsService.on(ev, _handleMemberAddedSocket);
        }
      });
    }
    if (window.KynectaRealtime && window.KynectaRealtime.on) {
      ['GROUP_MEMBER_ADDED', 'group:member:joined'].forEach(ev => {
        if (!window.__groupCoreListenersRegistered.has('rt:' + ev)) {
          window.__groupCoreListenersRegistered.add('rt:' + ev);
          window.KynectaRealtime.on(ev, _handleMemberAddedSocket);
        }
      });
    }

    // BUGFIX: window.__groupCoreRefreshInvitations was referenced below (twice) but
    // never defined anywhere in the codebase, so both "typeof === 'function'" checks
    // always failed and neither branch ever refreshed anything -- an invitation
    // arriving via the kyn: custom event or the parent postMessage relay never showed
    // up until the invites panel was manually closed and reopened.
    if (typeof window.__groupCoreRefreshInvitations !== 'function') {
      window.__groupCoreRefreshInvitations = function () {
        try {
          if (document.getElementById('inviteBody') && typeof window.loadReceivedInvites === 'function') window.loadReceivedInvites();
        } catch (_) {}
        try {
          if (typeof window.renderGroupInvitesSecure === 'function') window.renderGroupInvitesSecure();
        } catch (_) {}
      };
    }

    // PHASE14 FIX P1: Listen for group invitation received socket event
    // Backend emits 'group:invitation:received' but group-core had no listener.
    if (!window.__groupCoreListenersRegistered.has('p14:group:invitation:received')) {
      window.__groupCoreListenersRegistered.add('p14:group:invitation:received');
      window.addEventListener('kyn:group:invitation:received', function (evt) {
        const d = evt.detail || {};
        if (typeof window.__groupCoreRefreshInvitations === 'function') {
          window.__groupCoreRefreshInvitations();
        }
        try {
          window.dispatchEvent(new CustomEvent('groupInvitationReceived', {
            detail: d
          }));
        } catch (_) {}
      });
      window.addEventListener('message', function (evt) {
        if (!evt.data || typeof evt.data !== 'object') return;
        if (evt.data.type === 'REALTIME_EVENT:group:invitation:received') {
          const d = evt.data.payload || {};
          if (typeof window.__groupCoreRefreshInvitations === 'function') {
            window.__groupCoreRefreshInvitations();
          }
          try {
            window.dispatchEvent(new CustomEvent('groupInvitationReceived', {
              detail: d
            }));
          } catch (_) {}
        }
      });
    }

    // P1 FIX: Disappearing messages — clear UI when server fires expired event
    if (!window.__groupCoreListenersRegistered.has('p1:group:messages:disappeared')) {
      window.__groupCoreListenersRegistered.add('p1:group:messages:disappeared');
      window.addEventListener('kyn:group:messages:disappeared', function (evt) {
        const {
          groupId
        } = evt.detail || {};
        if (!groupId) return;
        const activeGid = window._activeGroupId;
        if (String(groupId) === String(activeGid)) {
          // Reload messages to reflect deletions
          if (typeof loadGroupChatMessages === 'function') {
            loadGroupChatMessages(groupId).catch(() => {});
          }
        }
      });
    }

    // P1 FIX: Pinned messages — refresh pinned banner in group header
    if (!window.__groupCoreListenersRegistered.has('p1:group:message:pinned')) {
      window.__groupCoreListenersRegistered.add('p1:group:message:pinned');
      window.addEventListener('kyn:group:message:pinned', function (evt) {
        const {
          groupId,
          messageId
        } = evt.detail || {};
        if (!groupId) return;
        // Update local group record
        const group = GroupCore.getGroupById(groupId);
        if (group) {
          if (!Array.isArray(group.pinnedMessageIds)) group.pinnedMessageIds = [];
          if (!group.pinnedMessageIds.includes(messageId)) group.pinnedMessageIds.push(messageId);
          GroupCore.updateGroupInLists(group);
        }
        // Show banner toast
        try {
          if (typeof showToast === 'function') showToast('📌 A message was pinned', 'info');
        } catch (_) {}
      });
      window.addEventListener('kyn:group:message:unpinned', function (evt) {
        const {
          groupId,
          messageId
        } = evt.detail || {};
        if (!groupId) return;
        const group = GroupCore.getGroupById(groupId);
        if (group && Array.isArray(group.pinnedMessageIds)) {
          group.pinnedMessageIds = group.pinnedMessageIds.filter(id => id !== messageId);
          GroupCore.updateGroupInLists(group);
        }
      });
    }

    // P2 FIX: Poll closed — update UI
    if (!window.__groupCoreListenersRegistered.has('p2:group:poll:closed')) {
      window.__groupCoreListenersRegistered.add('p2:group:poll:closed');
      window.addEventListener('kyn:group:poll:closed', function (evt) {
        const {
          groupId,
          pollId
        } = evt.detail || {};
        if (!groupId) return;
        try {
          // Update any visible poll UI
          const pollEl = document.querySelector(`[data-poll-id="${pollId}"]`);
          if (pollEl) {
            pollEl.classList.add('poll-closed');
            const badge = pollEl.querySelector('.poll-status');
            if (badge) badge.textContent = 'Closed';
          }
          if (typeof showToast === 'function') showToast('📊 A poll has closed', 'info');
        } catch (_) {}
      });
    }

    // P2 FIX: Settings updated — sync moderation engine
    if (!window.__groupCoreListenersRegistered.has('p2:group:settings:updated')) {
      window.__groupCoreListenersRegistered.add('p2:group:settings:updated');
      window.addEventListener('kyn:group:settings:updated', function (evt) {
        const {
          groupId,
          settings
        } = evt.detail || {};
        if (!groupId || !settings) return;
        const group = GroupCore.getGroupById(groupId);
        if (group) {
          Object.assign(group, settings);
          GroupCore.updateGroupInLists(group);
          // Re-sync moderation engine
          const modEng = window.__GroupModerationEngine;
          if (modEng?.syncFromGroup) modEng.syncFromGroup(group);
        }
      });
    }

    // P2 FIX: Group verified — update verified badge in UI
    if (!window.__groupCoreListenersRegistered.has('p2:group:verified')) {
      window.__groupCoreListenersRegistered.add('p2:group:verified');
      window.addEventListener('kyn:group:verified', function (evt) {
        const {
          groupId
        } = evt.detail || {};
        if (!groupId) return;
        const group = GroupCore.getGroupById(groupId);
        if (group) {
          group.isVerified = true;
          GroupCore.updateGroupInLists(group);
        }
        if (String(groupId) === String(window._activeGroupId)) {
          const badge = document.querySelector('.group-verified-badge');
          if (badge) badge.style.display = 'inline-flex';
        }
      });
    }
  }

  // ✅ ENHANCED: Handle real-time group member events
  function handleGroupMemberEvent(eventName, data) {
    // member event received

    try {
      const {
        groupId,
        memberId,
        role,
        userId,
        member
      } = data || {};
      if (!groupId || !memberId) {
        console.warn('[GroupsCore] Invalid member event data:', data);
        return;
      }

      // Update local group data
      const groupIndex = groups.findIndex(g => g.id === groupId);
      if (groupIndex === -1) return;
      const group = groups[groupIndex];
      if (!group) return;
      switch (eventName) {
        case 'group:member_added':
        case 'group:member_joined':
          if (member && !group.members.find(m => m.id === member.id)) {
            group.members.push(member);
          }
          // member added
          break;
        case 'group:member_removed':
        case 'group:member_left':
          {
            // CRITICAL FIX: Only remove from members list, NOT from myGroups
            // unless the event explicitly says the current user left (leaveGroup action)
            group.members = group.members.filter(m => m.id !== memberId);
            // Check if this is the current user being removed by someone else
            const _myId = session && (session.userId || session.user && session.user.id);
            if (_myId && String(memberId) === String(_myId) && !data._selfLeave) {
              // Current user was removed by admin — update myGroups
              if (typeof myGroups !== 'undefined') {
                setMyGroups(myGroups.filter(g => g.id !== groupId));
              }
              if (GroupCore && GroupCore.myGroups) {
                GroupCore.myGroups = GroupCore.myGroups.filter(g => g.id !== groupId);
              }
            }
            break;
          }
        case 'group:member_role_changed':
          const memberToUpdate = group.members.find(m => m.id === memberId);
          if (memberToUpdate && role) {
            memberToUpdate.role = role;
          }
          // role changed
          break;
      }

      // Emit events for UI updates
      window.dispatchEvent(new CustomEvent('group:updated', {
        detail: {
          group,
          eventName,
          member,
          groupId
        }
      }));

      // Emit to EventBus for cross-module sync
      if (window.EventBus?.emit) {
        window.EventBus.emit('group:member_updated', {
          group,
          eventName,
          member,
          groupId
        });
      }

      // Update UI if this group is currently active
      if (currentChatGroup && currentChatGroup.id === groupId) {
        renderGroupMembers();
      }
    } catch (error) {
      console.error('[GroupsCore] Failed to handle member event:', error);
    }
  }

  // Initialize real-time listeners
  setupGroupRealtimeListeners();
  window.addEventListener('message', event => {
    try {
      const data = event.data;

      // ── OFFLINE-FIRST: Apply per-key setting changes immediately ──
      if (data && (data.type === 'SETTING_CHANGED' || data.type === 'SETTINGS_UPDATED')) {
        const payload = data.payload || data;
        if (data.type === 'SETTING_CHANGED' && payload.section && payload.key !== undefined) {
          const {
            section,
            key,
            value
          } = payload;
          applySettingToGroupModule(section, key, value);
          window.dispatchEvent(new CustomEvent('settingChanged', {
            detail: {
              section,
              key,
              value,
              timestamp: Date.now()
            }
          }));
          debugLog(`Setting changed: ${section}.${key} = ${value}`);
        }
        if (data.type === 'SETTINGS_UPDATED' && payload.settings) {
          const s = payload.settings;
          Object.entries(s).forEach(([sec, secVal]) => {
            if (secVal && typeof secVal === 'object') Object.entries(secVal).forEach(([k, v]) => applySettingToGroupModule(sec, k, v));
          });
          window.dispatchEvent(new CustomEvent('settingsUpdated', {
            detail: {
              settings: s,
              timestamp: Date.now()
            }
          }));
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

export {
    DEBUG,
    GroupCore,
    LifecycleState,
    MODULE_NAME,
    MODULE_VERSION,
    MessageRouter,
    ParentMessaging,
    SafeStorage,
    adminGroups,
    apiRequest,
    authCheckComplete,
    authReady,
    backgroundSyncRunning,
    currentChatGroup,
    currentUser,
    debugLog,
    groupInvites,
    groups,
    isMobile,
    joinedGroups,
    moduleInitialized,
    myGroups,
    parentReady,
    requestSession,
    safeSend,
    selectedGroup,
    sendChildReady,
    session,
    sessionReady,
    sessionReceived,
    setAdminGroups,
    setAuthCheckComplete,
    setAuthReady,
    setBackgroundSyncRunning,
    setCurrentChatGroup,
    setGroupInvites,
    setGroups,
    setIsMobile,
    setJoinedGroups,
    setModuleInitialized,
    setMyGroups,
    setSelectedGroup,
    setSessionReadyFlag,
    setSyncIntervalId,
    syncIntervalId,
    userData
};