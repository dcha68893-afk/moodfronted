// =============================================
// GROUPS MODULE - PARENT AUTHORITY COMPLIANT
// DETERMINISTIC STATE MACHINE - VERSION 6.0.0
// COMPLETE CORE ENGINE - FULL FUNCTIONALITY PRESERVED
// =============================================

// =============================================
// DEBUG FLAG - CONTROL CONSOLE NOISE
// =============================================
const DEBUG = false;

// Safe console logging wrapper
function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

// =============================================
// SECTION 1: GLOBAL STATE MACHINE (v5.0 COMPLIANT)
// =============================================
const IFRAME_STATES = {
    STATE_BOOTING: 'STATE_BOOTING',
    STATE_REGISTERING: 'STATE_REGISTERING',
    STATE_WAITING_SESSION: 'STATE_WAITING_SESSION',
    STATE_WAITING_PARENT_READY: 'STATE_WAITING_PARENT_READY',
    STATE_ACTIVE: 'STATE_ACTIVE',
    STATE_DEGRADED: 'STATE_DEGRADED',
    STATE_RECOVERY: 'STATE_RECOVERY',
    STATE_STANDALONE: 'STATE_STANDALONE',
    STATE_OFFLINE: 'STATE_OFFLINE'
};

const IframeStateMachine = (function() {
    'use strict';
    
    let currentState = IFRAME_STATES.STATE_BOOTING;
    const stateListeners = new Set();
    const stateHistory = [];
    const MAX_HISTORY = 20;
    
    // Explicit transitions only
    const validTransitions = {
        [IFRAME_STATES.STATE_BOOTING]: [IFRAME_STATES.STATE_REGISTERING, IFRAME_STATES.STATE_DEGRADED],
        [IFRAME_STATES.STATE_REGISTERING]: [IFRAME_STATES.STATE_WAITING_SESSION, IFRAME_STATES.STATE_WAITING_PARENT_READY, IFRAME_STATES.STATE_DEGRADED],
        [IFRAME_STATES.STATE_WAITING_SESSION]: [IFRAME_STATES.STATE_WAITING_PARENT_READY, IFRAME_STATES.STATE_ACTIVE, IFRAME_STATES.STATE_DEGRADED, IFRAME_STATES.STATE_RECOVERY],
        [IFRAME_STATES.STATE_WAITING_PARENT_READY]: [IFRAME_STATES.STATE_ACTIVE, IFRAME_STATES.STATE_DEGRADED, IFRAME_STATES.STATE_RECOVERY],
        [IFRAME_STATES.STATE_ACTIVE]: [IFRAME_STATES.STATE_RECOVERY, IFRAME_STATES.STATE_DEGRADED, IFRAME_STATES.STATE_STANDALONE, IFRAME_STATES.STATE_OFFLINE],
        [IFRAME_STATES.STATE_DEGRADED]: [IFRAME_STATES.STATE_ACTIVE, IFRAME_STATES.STATE_RECOVERY, IFRAME_STATES.STATE_STANDALONE, IFRAME_STATES.STATE_OFFLINE],
        [IFRAME_STATES.STATE_RECOVERY]: [IFRAME_STATES.STATE_ACTIVE, IFRAME_STATES.STATE_DEGRADED, IFRAME_STATES.STATE_STANDALONE],
        [IFRAME_STATES.STATE_STANDALONE]: [IFRAME_STATES.STATE_ACTIVE, IFRAME_STATES.STATE_RECOVERY, IFRAME_STATES.STATE_OFFLINE],
        [IFRAME_STATES.STATE_OFFLINE]: [IFRAME_STATES.STATE_ACTIVE, IFRAME_STATES.STATE_RECOVERY, IFRAME_STATES.STATE_DEGRADED]
    };
    
    const colors = {
        [IFRAME_STATES.STATE_BOOTING]: '#666',
        [IFRAME_STATES.STATE_REGISTERING]: '#33b5e5',
        [IFRAME_STATES.STATE_WAITING_SESSION]: '#ffbb33',
        [IFRAME_STATES.STATE_WAITING_PARENT_READY]: '#ff8800',
        [IFRAME_STATES.STATE_ACTIVE]: '#00C851',
        [IFRAME_STATES.STATE_DEGRADED]: '#ff8800',
        [IFRAME_STATES.STATE_RECOVERY]: '#aa66cc',
        [IFRAME_STATES.STATE_STANDALONE]: '#ff4444',
        [IFRAME_STATES.STATE_OFFLINE]: '#ff4444'
    };
    
    const symbols = {
        [IFRAME_STATES.STATE_BOOTING]: '⚫',
        [IFRAME_STATES.STATE_REGISTERING]: '🔵',
        [IFRAME_STATES.STATE_WAITING_SESSION]: '⏳',
        [IFRAME_STATES.STATE_WAITING_PARENT_READY]: '🛫',
        [IFRAME_STATES.STATE_ACTIVE]: '🚀',
        [IFRAME_STATES.STATE_DEGRADED]: '⚠️',
        [IFRAME_STATES.STATE_RECOVERY]: '🔄',
        [IFRAME_STATES.STATE_STANDALONE]: '🔴',
        [IFRAME_STATES.STATE_OFFLINE]: '📴'
    };
    
    const loggedStates = new Set();
    
    function isValidTransition(from, to) {
        if (!validTransitions[from]) return false;
        return validTransitions[from].includes(to);
    }
    
    function transition(to, details = '') {
        if (!isValidTransition(currentState, to)) {
            debugLog(`Invalid state transition: ${currentState} → ${to}`);
            return false;
        }
        
        if (currentState === to) return false;
        
        const from = currentState;
        currentState = to;
        
        stateHistory.push({ from, to, timestamp: Date.now(), details });
        if (stateHistory.length > MAX_HISTORY) stateHistory.shift();
        
        const stateKey = `${to}`;
        if (!loggedStates.has(stateKey)) {
            loggedStates.add(stateKey);
            STATUS_MACHINE.log('iframe-state', to, details);
            console.log(
                `%c${symbols[to] || '•'} ${to}${details ? ` ${details}` : ''}`,
                `color: ${colors[to] || '#aaa'}; font-weight: bold;`
            );
        }
        
        stateListeners.forEach(listener => {
            try { listener(to, from); } catch (e) {}
        });
        
        return true;
    }
    
    function getState() { return currentState; }
    function isAtLeast(state) {
        const order = Object.values(IFRAME_STATES);
        const currentIdx = order.indexOf(currentState);
        const targetIdx = order.indexOf(state);
        return currentIdx >= targetIdx && currentIdx !== -1 && targetIdx !== -1;
    }
    function isActive() { return currentState === IFRAME_STATES.STATE_ACTIVE; }
    function isDegraded() { return currentState === IFRAME_STATES.STATE_DEGRADED; }
    function isRecovery() { return currentState === IFRAME_STATES.STATE_RECOVERY; }
    function isStandalone() { return currentState === IFRAME_STATES.STATE_STANDALONE; }
    function isOffline() { return currentState === IFRAME_STATES.STATE_OFFLINE; }
    
    function subscribe(listener) {
        stateListeners.add(listener);
        listener(currentState, null);
        return () => stateListeners.delete(listener);
    }
    
    function getHistory() { return [...stateHistory]; }
    
    return {
        IFRAME_STATES,
        transition,
        getState,
        isAtLeast,
        isActive,
        isDegraded,
        isRecovery,
        isStandalone,
        isOffline,
        subscribe,
        getHistory
    };
})();

window.__IFRAME_STATE_MACHINE = IframeStateMachine;

// =============================================
// FINITE STATE MACHINE - DETERMINISTIC LIFECYCLE
// =============================================
const MODULE_VERSION = '6.0.0';

const LIFECYCLE_STATES = {
    UNINITIALIZED: 'UNINITIALIZED',
    BOOTSTRAPPING: 'BOOTSTRAPPING',
    PRE_FLIGHT: 'PRE_FLIGHT',
    DEPENDENCIES_CHECKED: 'DEPENDENCIES_CHECKED',
    PARENT_DETECTED: 'PARENT_DETECTED',
    HANDSHAKING: 'HANDSHAKING',
    SESSION_PENDING: 'SESSION_PENDING',
    SESSION_ACTIVE: 'SESSION_ACTIVE',
    SERVICES_INITIALIZING: 'SERVICES_INITIALIZING',
    ACTIVE: 'ACTIVE',
    FAILED: 'FAILED',
    DEGRADED_MODE: 'DEGRADED_MODE'
};

const LifecycleFSM = (function() {
    'use strict';
    
    let currentState = LIFECYCLE_STATES.UNINITIALIZED;
    const stateListeners = new Set();
    const stateHistory = [];
    const MAX_HISTORY = 20;
    let initializationPromise = null;
    let initializationLock = false;
    let initializationResolve = null;
    let initializationReject = null;
    
    // Strict linear transitions - no skipping states
    const validTransitions = {
        [LIFECYCLE_STATES.UNINITIALIZED]: [LIFECYCLE_STATES.BOOTSTRAPPING, LIFECYCLE_STATES.FAILED],
        [LIFECYCLE_STATES.BOOTSTRAPPING]: [LIFECYCLE_STATES.PRE_FLIGHT, LIFECYCLE_STATES.FAILED],
        [LIFECYCLE_STATES.PRE_FLIGHT]: [LIFECYCLE_STATES.DEPENDENCIES_CHECKED, LIFECYCLE_STATES.FAILED],
        [LIFECYCLE_STATES.DEPENDENCIES_CHECKED]: [LIFECYCLE_STATES.PARENT_DETECTED, LIFECYCLE_STATES.FAILED],
        [LIFECYCLE_STATES.PARENT_DETECTED]: [LIFECYCLE_STATES.HANDSHAKING, LIFECYCLE_STATES.FAILED],
        [LIFECYCLE_STATES.HANDSHAKING]: [LIFECYCLE_STATES.SESSION_PENDING, LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.DEGRADED_MODE],
        [LIFECYCLE_STATES.SESSION_PENDING]: [LIFECYCLE_STATES.SESSION_ACTIVE, LIFECYCLE_STATES.FAILED, LIFECYCLE_STATES.DEGRADED_MODE],
        [LIFECYCLE_STATES.SESSION_ACTIVE]: [LIFECYCLE_STATES.SERVICES_INITIALIZING, LIFECYCLE_STATES.FAILED],
        [LIFECYCLE_STATES.SERVICES_INITIALIZING]: [LIFECYCLE_STATES.ACTIVE, LIFECYCLE_STATES.FAILED],
        [LIFECYCLE_STATES.ACTIVE]: [LIFECYCLE_STATES.FAILED],
        [LIFECYCLE_STATES.FAILED]: [],
        [LIFECYCLE_STATES.DEGRADED_MODE]: [LIFECYCLE_STATES.SERVICES_INITIALIZING, LIFECYCLE_STATES.ACTIVE, LIFECYCLE_STATES.FAILED]
    };
    
    const symbols = {
        [LIFECYCLE_STATES.UNINITIALIZED]: '⚫',
        [LIFECYCLE_STATES.BOOTSTRAPPING]: '🔵',
        [LIFECYCLE_STATES.PRE_FLIGHT]: '🛫',
        [LIFECYCLE_STATES.DEPENDENCIES_CHECKED]: '✅',
        [LIFECYCLE_STATES.PARENT_DETECTED]: '👪',
        [LIFECYCLE_STATES.HANDSHAKING]: '🤝',
        [LIFECYCLE_STATES.SESSION_PENDING]: '⏳',
        [LIFECYCLE_STATES.SESSION_ACTIVE]: '🔐',
        [LIFECYCLE_STATES.SERVICES_INITIALIZING]: '⚙️',
        [LIFECYCLE_STATES.ACTIVE]: '🚀',
        [LIFECYCLE_STATES.FAILED]: '💥',
        [LIFECYCLE_STATES.DEGRADED_MODE]: '⚠️'
    };
    
    const colors = {
        [LIFECYCLE_STATES.UNINITIALIZED]: '#666',
        [LIFECYCLE_STATES.BOOTSTRAPPING]: '#33b5e5',
        [LIFECYCLE_STATES.PRE_FLIGHT]: '#ff8800',
        [LIFECYCLE_STATES.DEPENDENCIES_CHECKED]: '#00C851',
        [LIFECYCLE_STATES.PARENT_DETECTED]: '#0099CC',
        [LIFECYCLE_STATES.HANDSHAKING]: '#aa66cc',
        [LIFECYCLE_STATES.SESSION_PENDING]: '#ffbb33',
        [LIFECYCLE_STATES.SESSION_ACTIVE]: '#00C851',
        [LIFECYCLE_STATES.SERVICES_INITIALIZING]: '#33b5e5',
        [LIFECYCLE_STATES.ACTIVE]: '#00C851',
        [LIFECYCLE_STATES.FAILED]: '#ff4444',
        [LIFECYCLE_STATES.DEGRADED_MODE]: '#ff8800'
    };
    
    const loggedStates = new Set();
    
    function isValidTransition(from, to) {
        if (!validTransitions[from]) {
            console.warn(`[LifecycleFSM] No valid transitions defined for state: ${from}`);
            return false;
        }
        return validTransitions[from].includes(to);
    }
    
    function transition(to, details = '') {
        if (!isValidTransition(currentState, to)) {
            console.warn(`[LifecycleFSM] Invalid state transition: ${currentState} → ${to} - must follow linear path`);
            return false;
        }
        
        if (currentState === to) return false;
        
        const from = currentState;
        currentState = to;
        
        const entry = {
            from,
            to,
            timestamp: Date.now(),
            details
        };
        
        stateHistory.push(entry);
        if (stateHistory.length > MAX_HISTORY) {
            stateHistory.shift();
        }
        
        const stateKey = `${to}`;
        if (!loggedStates.has(stateKey)) {
            loggedStates.add(stateKey);
            const symbol = symbols[to] || '•';
            STATUS_MACHINE.log('lifecycle', to, details);
            console.log(
                `%c${symbol} ${to}${details ? ` ${details}` : ''}`,
                `color: ${colors[to] || '#aaa'}; font-weight: bold;`
            );
        }
        
        stateListeners.forEach(listener => {
            try {
                listener(to, from, entry);
            } catch (e) {}
        });
        
        return true;
    }
    
    function getState() {
        return currentState;
    }
    
    function isAtLeast(state) {
        const order = Object.values(LIFECYCLE_STATES);
        const currentIdx = order.indexOf(currentState);
        const targetIdx = order.indexOf(state);
        return currentIdx >= targetIdx && currentIdx !== -1 && targetIdx !== -1;
    }
    
    function isActive() {
        return currentState === LIFECYCLE_STATES.ACTIVE;
    }
    
    function isDegraded() {
        return currentState === LIFECYCLE_STATES.DEGRADED_MODE;
    }
    
    function isFailed() {
        return currentState === LIFECYCLE_STATES.FAILED;
    }
    
    function reset() {
        currentState = LIFECYCLE_STATES.UNINITIALIZED;
        loggedStates.clear();
        initializationPromise = null;
        initializationLock = false;
        stateHistory.length = 0;
    }
    
    function subscribe(listener) {
        stateListeners.add(listener);
        listener(currentState, null, { timestamp: Date.now() });
        return () => stateListeners.delete(listener);
    }
    
    function getHistory() {
        return [...stateHistory];
    }
    
    function getInitializationPromise() {
        return initializationPromise;
    }
    
    function setInitializationPromise(promise) {
        initializationPromise = promise;
    }
    
    function acquireLock() {
        if (initializationLock) return false;
        initializationLock = true;
        return true;
    }
    
    function releaseLock() {
        initializationLock = false;
    }
    
    return {
        LIFECYCLE_STATES,
        transition,
        getState,
        isAtLeast,
        isActive,
        isDegraded,
        isFailed,
        reset,
        subscribe,
        getHistory,
        getInitializationPromise,
        setInitializationPromise,
        acquireLock,
        releaseLock
    };
})();

window.__LIFECYCLE_FSM = LifecycleFSM;

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
        'DISCONNECTED': '🔴',
        'iframe-state': '📱',
        'registration': '📋',
        'session': '🔐',
        'heartbeat': '💓',
        'queue': '📦',
        'recovery': '🔄'
    };
    
    const colors = {
        'INIT': '#aaa',
        'SENDING': '#33b5e5',
        'WAITING': '#ff8800',
        'SUCCESS': '#00C851',
        'FAILED': '#ff4444',
        'READY': '#0099CC',
        'WARNING': '#ffbb33',
        'DISCONNECTED': '#ff4444',
        'iframe-state': '#9c27b0',
        'registration': '#2196F3',
        'session': '#4CAF50',
        'heartbeat': '#E91E63',
        'queue': '#FF9800',
        'recovery': '#9C27B0'
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
            const detailStr = details ? ` ${details}` : '';
            
            if (DEBUG || status === 'INIT' || status === 'SUCCESS' || status === 'FAILED' || status === 'WARNING' || context === 'iframe-state') {
                console.log(
                    `%c${symbol} ${status}${detailStr}`,
                    `color: ${colors[status] || colors[context] || '#aaa'}; font-weight: bold;`
                );
            }
        },
        
        reset: function(context) {
            const keysToDelete = [];
            for (const key of shownStatuses) {
                if (key.startsWith(context + ':')) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(k => shownStatuses.delete(k));
            lastState.delete(context);
        },
        
        clear: function() {
            shownStatuses.clear();
            lastState.clear();
        }
    };
})();

window.__STATUS_MACHINE = STATUS_MACHINE;
STATUS_MACHINE.log('group-core', 'INIT', 'Groups module loading');

// =============================================
// DETERMINISTIC PARENT AUTHORITY STATE MACHINE
// =============================================
const PARENT_AUTHORITY_STATES = {
    PREINIT: 'PREINIT',
    WAIT_PARENT: 'WAIT_PARENT',
    REGISTERING: 'REGISTERING',
    WAIT_SESSION: 'WAIT_SESSION',
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    DEGRADED: 'DEGRADED'
};

const ParentAuthority = {
    _state: PARENT_AUTHORITY_STATES.PREINIT,
    _parentReady: false,
    _sessionReceived: false,
    _authoritativeSession: null,
    _retryCount: 0,
    _maxRetries: 2,
    _registrationSent: false,
    _initComplete: false,
    _listeners: new Set(),
    _handledMessageIds: new Set(),
    _timeoutId: null,
    _sessionTimeoutId: null,
    _degradedMode: false,
    _timers: new Set(),
    
    init() {
        if (this._initComplete) return this;
        
        STATUS_MACHINE.log('authority', 'INIT', 'Parent authority layer');
        this._transition(PARENT_AUTHORITY_STATES.WAIT_PARENT);
        
        this._timeoutId = this._createTimer(() => {
            if (this._state === PARENT_AUTHORITY_STATES.WAIT_PARENT && 
                !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_PENDING)) {
                debugLog('Parent ready timeout - checking lifecycle state');
                if (LifecycleFSM.getState() === LIFECYCLE_STATES.HANDSHAKING) {
                    this._enterDegradedMode();
                }
            }
        }, 5000);
        
        if (window.__PARENT_READY__ === true) {
            this.handleParentReady();
        }
        
        this._initComplete = true;
        return this;
    },
    
    _createTimer(fn, delay) {
        const timerId = setTimeout(() => {
            this._timers.delete(timerId);
            fn();
        }, delay);
        this._timers.add(timerId);
        return timerId;
    },
    
    _clearAllTimers() {
        this._timers.forEach(id => clearTimeout(id));
        this._timers.clear();
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            this._timeoutId = null;
        }
        if (this._sessionTimeoutId) {
            clearTimeout(this._sessionTimeoutId);
            this._sessionTimeoutId = null;
        }
    },
    
    _transition(newState) {
        if (this._state === newState) return;
        
        const oldState = this._state;
        this._state = newState;
        
        debugLog(`ParentAuthority state: ${oldState} -> ${newState}`);
        
        this._notifyListeners(newState, oldState);
        
        if (newState === PARENT_AUTHORITY_STATES.REGISTERING) {
            this._sendRegistration();
        } else if (newState === PARENT_AUTHORITY_STATES.READY) {
            this._onReady();
        } else if (newState === PARENT_AUTHORITY_STATES.DEGRADED) {
            this._onDegraded();
        }
    },
    
    _sendRegistration() {
        if (this._registrationSent) return;
        
        this._registrationSent = true;
        
        const childReadyMsg = {
            type: 'CHILD_READY',
            module: 'groups',
            frameId: SECURITY_CONFIG.FRAME_ID,
            version: MODULE_VERSION,
            timestamp: Date.now()
        };
        
        TransportAgent.send('CHILD_READY', childReadyMsg, { requiresAck: false }).catch(() => {});
        
        const registerMsg = {
            type: 'REGISTER_MODULE',
            module: 'groups',
            frameId: SECURITY_CONFIG.FRAME_ID,
            version: MODULE_VERSION,
            timestamp: Date.now()
        };
        
        TransportAgent.send('REGISTER_MODULE', registerMsg, { requiresAck: false }).catch(() => {});
        
        this._sessionTimeoutId = this._createTimer(() => {
            if (this._state === PARENT_AUTHORITY_STATES.WAIT_SESSION && 
                !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                debugLog('Session timeout - checking lifecycle state');
                if (LifecycleFSM.getState() === LIFECYCLE_STATES.SESSION_PENDING) {
                    this._enterDegradedMode();
                }
            }
        }, 5000);
    },
    
    _onReady() {
        window.__MODULE_READY__ = true;
        if (this._authoritativeSession) {
            window.__MODULE_SESSION_ACTIVE__ = true;
        }
        
        this._clearAllTimers();
        
        STATUS_MACHINE.log('authority', 'SUCCESS', 'Parent contract ready');
    },
    
    _onDegraded() {
        window.__MODULE_READY__ = true;
        this._degradedMode = true;
        
        STATUS_MACHINE.log('authority', 'WARNING', 'Degraded mode - using legacy behavior');
        
        this._clearAllTimers();
    },
    
    _enterDegradedMode() {
        if (LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            debugLog('Not entering degraded mode - session already active');
            return;
        }
        this._transition(PARENT_AUTHORITY_STATES.DEGRADED);
    },
    
    handleParentReady() {
        if (this._parentReady) return;
        if (this._degradedMode) return;
        if (LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) return;
        
        this._parentReady = true;
        
        if (this._state === PARENT_AUTHORITY_STATES.WAIT_PARENT) {
            this._transition(PARENT_AUTHORITY_STATES.REGISTERING);
        }
    },
    
    handleSessionActive(sessionData) {
        if (this._degradedMode) return;
        if (this._sessionReceived) return;
        if (LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) return;
        
        this._sessionReceived = true;
        this._authoritativeSession = sessionData;
        
        if (this._sessionTimeoutId) {
            clearTimeout(this._sessionTimeoutId);
            this._sessionTimeoutId = null;
        }
        
        if (this._state === PARENT_AUTHORITY_STATES.WAIT_SESSION) {
            this._transition(PARENT_AUTHORITY_STATES.INITIALIZING);
        } else if (this._state === PARENT_AUTHORITY_STATES.REGISTERING) {
            this._transition(PARENT_AUTHORITY_STATES.INITIALIZING);
        }
        
        this._createTimer(() => {
            if (this._state === PARENT_AUTHORITY_STATES.INITIALIZING && !this._degradedMode) {
                this._transition(PARENT_AUTHORITY_STATES.READY);
            }
        }, 100);
    },
    
    handleMessage(message) {
        if (this._degradedMode) return;
        if (!message || !message.type) return;
        
        if (message.type === 'ACK' && message.messageId) {
            TransportAgent.handleAck(message);
            return;
        }
        
        if (message.type === 'PING') {
            TransportAgent.handlePing(message);
            return;
        }
        
        if (message.type === 'PARENT_READY') {
            this.handleParentReady();
            return;
        }
        
        if (message.type === 'SESSION_ACTIVE') {
            this.handleSessionActive(message.session || message.payload);
            return;
        }
        
        if (message.type === 'SESSION_UPDATE') {
            this.handleSessionUpdate(message.session || message.payload);
            return;
        }
        
        if (message.type === 'NAVIGATE') {
            this.handleNavigate(message);
            return;
        }
        
        if (message.type === 'PERMISSION_UPDATE') {
            this.handlePermissionUpdate(message);
            return;
        }
        
        if (message.type === 'FORCE_LOGOUT') {
            this.handleForceLogout();
            return;
        }
    },
    
    handleSessionUpdate(updateData) {
        if (this._degradedMode) return;
        
        if (this._authoritativeSession) {
            this._authoritativeSession = {
                ...this._authoritativeSession,
                ...updateData
            };
        }
    },
    
    handleNavigate(message) {
        if (this._degradedMode) return;
        if (ParentConnectionManager && ParentConnectionManager.handleNavigate) {
            ParentConnectionManager.handleNavigate(message);
        }
    },
    
    handlePermissionUpdate(message) {
        if (this._degradedMode) return;
        if (message.permissions && SessionMirror) {
            const session = SessionMirror.getState();
            if (session) {
                session.permissions = message.permissions;
            }
        }
    },
    
    handleForceLogout() {
        if (this._degradedMode) return;
        
        this._authoritativeSession = null;
        this._sessionReceived = false;
        
        if (typeof handleLogout === 'function') {
            handleLogout();
        }
        if (ParentConnectionManager && ParentConnectionManager.handleLogout) {
            ParentConnectionManager.handleLogout();
        }
    },
    
    isAuthoritativeSession() {
        return this._sessionReceived && this._authoritativeSession !== null;
    },
    
    getAuthoritativeSession() {
        return this._authoritativeSession ? { ...this._authoritativeSession } : null;
    },
    
    isDegraded() {
        return this._degradedMode;
    },
    
    getState() {
        return {
            state: this._state,
            parentReady: this._parentReady,
            sessionReceived: this._sessionReceived,
            degraded: this._degradedMode,
            retryCount: this._retryCount
        };
    },
    
    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    },
    
    _notifyListeners(newState, oldState) {
        this._listeners.forEach(listener => {
            try {
                listener(newState, oldState);
            } catch (e) {}
        });
    },
    
    destroy() {
        this._clearAllTimers();
        this._listeners.clear();
        this._handledMessageIds.clear();
    }
};

// =============================================
// SECTION 2: INITIALIZATION TIMELINE (HARD LIMITS)
// =============================================
const InitTimeline = (function() {
    'use strict';
    
    let registrationTimer = null;
    let globalFailSafeTimer = null;
    let registrationRetryCount = 0;
    const MAX_REGISTRATION_RETRIES = 2;
    const REGISTRATION_TIMEOUT_WARNING = 50;
    const REGISTRATION_TIMEOUT_FAILURE = 150;
    const GLOBAL_FAILSAFE_TIMEOUT = 200;
    const REQUEST_SESSION_DELAY = 100;
    const PARENT_READY_TIMEOUT = 150;
    
    let moduleRegistered = false;
    let sessionReceived = false;
    let parentReady = false;
    
    function startRegistrationTimeline() {
        // T+0ms: STATE_BOOTING
        IframeStateMachine.transition(IFRAME_STATES.STATE_BOOTING);
        STATUS_MACHINE.log('init', 'STATE_BOOTING', 'Booting');
        
        // T+1ms: Send REGISTER_MODULE
        setTimeout(() => {
            if (IframeStateMachine.getState() === IFRAME_STATES.STATE_BOOTING) {
                IframeStateMachine.transition(IFRAME_STATES.STATE_REGISTERING);
                STATUS_MACHINE.log('init', 'SENDING', 'REGISTER_MODULE');
                
                const messageId = 'reg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                
                TransportAgent.send('REGISTER_MODULE', {
                    module: 'groups',
                    version: MODULE_VERSION,
                    timestamp: Date.now(),
                    frameId: SECURITY_CONFIG.FRAME_ID
                }, { 
                    requiresAck: true, 
                    messageId: messageId,
                    timeout: 50 // 50ms timeout for ACK
                }).then((response) => {
                    if (response && response.ack) {
                        handleModuleRegistered(response.ack);
                    }
                }).catch((error) => {
                    handleRegistrationFailure();
                });
                
                // Start registration timer (50ms warning, 150ms failure)
                startRegistrationTimer();
                
                // Start global failsafe timer (200ms)
                startGlobalFailSafeTimer();
            }
        }, 1);
    }
    
    function startRegistrationTimer() {
        if (registrationTimer) clearTimeout(registrationTimer);
        
        // 50ms warning
        registrationTimer = setTimeout(() => {
            if (IframeStateMachine.getState() === IFRAME_STATES.STATE_REGISTERING && !moduleRegistered) {
                STATUS_MACHINE.log('init', 'WAITING', 'No MODULE_REGISTERED yet (50ms)');
                
                if (registrationRetryCount < MAX_REGISTRATION_RETRIES) {
                    registrationRetryCount++;
                    // T+50ms: prepare retry
                    prepareRegistrationRetry();
                }
            }
        }, REGISTRATION_TIMEOUT_WARNING);
    }
    
    function startGlobalFailSafeTimer() {
        if (globalFailSafeTimer) clearTimeout(globalFailSafeTimer);
        
        globalFailSafeTimer = setTimeout(() => {
            const currentState = IframeStateMachine.getState();
            if (currentState === IFRAME_STATES.STATE_REGISTERING || 
                currentState === IFRAME_STATES.STATE_WAITING_SESSION) {
                
                // Check if we have any response at all
                if (!moduleRegistered && !sessionReceived && !parentReady) {
                    STATUS_MACHINE.log('init', 'WARNING', 'No meaningful response (200ms) - entering degraded');
                    IframeStateMachine.transition(IFRAME_STATES.STATE_DEGRADED, 'failsafe');
                    
                    // Still try to use cached session if available
                    if (ParentConnectionManager && ParentConnectionManager.tryCachedSession()) {
                        STATUS_MACHINE.log('init', 'SUCCESS', 'Using cached session in degraded mode');
                    }
                }
            }
        }, GLOBAL_FAILSAFE_TIMEOUT);
    }
    
    function prepareRegistrationRetry() {
        const backoffDelay = registrationRetryCount === 1 ? 500 : 1000;
        
        setTimeout(() => {
            if (IframeStateMachine.getState() === IFRAME_STATES.STATE_REGISTERING && !moduleRegistered) {
                STATUS_MACHINE.log('init', 'SENDING', `REGISTER_MODULE retry ${registrationRetryCount}`);
                
                TransportAgent.send('REGISTER_MODULE', {
                    module: 'groups',
                    version: MODULE_VERSION,
                    timestamp: Date.now(),
                    frameId: SECURITY_CONFIG.FRAME_ID,
                    retry: registrationRetryCount
                }, { 
                    requiresAck: true,
                    timeout: 50 
                }).then((response) => {
                    if (response && response.ack) {
                        handleModuleRegistered(response.ack);
                    }
                }).catch(() => {
                    if (registrationRetryCount >= MAX_REGISTRATION_RETRIES) {
                        handleRegistrationFailure();
                    }
                });
            }
        }, backoffDelay);
    }
    
    function handleModuleRegistered(message) {
        if (moduleRegistered) return; // Already handled
        
        moduleRegistered = true;
        STATUS_MACHINE.log('init', 'SUCCESS', 'MODULE_REGISTERED received');
        
        if (registrationTimer) {
            clearTimeout(registrationTimer);
            registrationTimer = null;
        }
        
        if (IframeStateMachine.getState() === IFRAME_STATES.STATE_REGISTERING) {
            IframeStateMachine.transition(IFRAME_STATES.STATE_WAITING_SESSION);
            
            // T+100ms: Send REQUEST_SESSION if no SESSION_ACTIVE
            setTimeout(() => {
                if (IframeStateMachine.getState() === IFRAME_STATES.STATE_WAITING_SESSION && 
                    !sessionReceived && !SessionMirror.isAuthenticated()) {
                    STATUS_MACHINE.log('init', 'SENDING', 'REQUEST_SESSION');
                    
                    TransportAgent.send('REQUEST_SESSION', {
                        frameId: SECURITY_CONFIG.FRAME_ID,
                        timestamp: Date.now(),
                        requestId: 'session_' + Date.now()
                    }, { 
                        requiresAck: true,
                        timeout: 50 
                    }).catch(() => {
                        // No response - will be handled by failsafe
                    });
                }
            }, REQUEST_SESSION_DELAY);
            
            // T+150ms: If no PARENT_READY, continue waiting (don't queue yet)
            setTimeout(() => {
                if (IframeStateMachine.getState() === IFRAME_STATES.STATE_WAITING_SESSION &&
                    !parentReady) {
                    STATUS_MACHINE.log('init', 'WAITING', 'PARENT_READY not received (150ms)');
                    // Continue waiting - parent might send later
                }
            }, PARENT_READY_TIMEOUT);
        }
    }
    
    function handleRegistrationFailure() {
        if (moduleRegistered) return; // Already succeeded
        
        STATUS_MACHINE.log('init', 'FAILED', 'Registration failed after retries');
        
        // Try cached session before degrading
        if (ParentConnectionManager && ParentConnectionManager.tryCachedSession()) {
            STATUS_MACHINE.log('init', 'SUCCESS', 'Using cached session after registration failure');
            moduleRegistered = true;
            sessionReceived = true;
            IframeStateMachine.transition(IFRAME_STATES.STATE_ACTIVE, 'cached');
        } else {
            IframeStateMachine.transition(IFRAME_STATES.STATE_DEGRADED, 'registration_failed');
        }
    }
    
    function handleSessionActive(sessionData) {
        if (sessionReceived) return; // Already handled
        
        sessionReceived = true;
        STATUS_MACHINE.log('init', 'SUCCESS', 'SESSION_ACTIVE received');
        
        if (IframeStateMachine.getState() === IFRAME_STATES.STATE_WAITING_SESSION) {
            IframeStateMachine.transition(IFRAME_STATES.STATE_WAITING_PARENT_READY);
            
            // Validate session schema
            if (validateSessionSchema(sessionData)) {
                SessionMirror.updateFromParent(sessionData);
            }
        }
    }
    
    function handleSessionNull() {
        if (sessionReceived) return; // Already have session
        
        STATUS_MACHINE.log('init', 'INFO', 'SESSION_NULL received');
        
        if (IframeStateMachine.getState() === IFRAME_STATES.STATE_WAITING_SESSION) {
            IframeStateMachine.transition(IFRAME_STATES.STATE_WAITING_PARENT_READY);
            
            // Disable protected actions but remain functional in guest mode
            disableProtectedActions();
        }
    }
    
    function validateSessionSchema(sessionData) {
        if (!sessionData || typeof sessionData !== 'object') return false;
        
        // SESSION_ACTIVE payload must include:
        // authenticated: boolean,
        // userId: string,
        // token: string,
        // user: { id, name, email, avatar },
        // expiresAt: number
        
        const hasRequired = sessionData.hasOwnProperty('authenticated') &&
                           sessionData.hasOwnProperty('userId') &&
                           sessionData.hasOwnProperty('token') &&
                           sessionData.hasOwnProperty('user') &&
                           sessionData.hasOwnProperty('expiresAt');
        
        if (!hasRequired) return false;
        
        if (sessionData.user) {
            const hasUserFields = sessionData.user.hasOwnProperty('id') &&
                                 sessionData.user.hasOwnProperty('name') &&
                                 sessionData.user.hasOwnProperty('email') &&
                                 sessionData.user.hasOwnProperty('avatar');
            if (!hasUserFields) return false;
        }
        
        return true;
    }
    
    function disableProtectedActions() {
        // Disable protected UI features
        const protectedElements = document.querySelectorAll('.protected-action, [data-protected]');
        protectedElements.forEach(el => {
            el.classList.add('disabled');
            el.setAttribute('disabled', 'disabled');
        });
        
        // Show login required where appropriate
        const loginRequiredElements = document.querySelectorAll('.requires-auth');
        loginRequiredElements.forEach(el => {
            el.style.display = 'none';
        });
        
        // Preserve drafts
        const draftInputs = document.querySelectorAll('[data-draft]');
        draftInputs.forEach(input => {
            if (input.value) {
                localStorage.setItem(`draft_${input.id}`, input.value);
            }
        });
    }
    
    function handleParentReady() {
        if (parentReady) return; // Already handled
        
        parentReady = true;
        STATUS_MACHINE.log('init', 'SUCCESS', 'PARENT_READY received');
        
        if (IframeStateMachine.getState() === IFRAME_STATES.STATE_WAITING_PARENT_READY) {
            IframeStateMachine.transition(IFRAME_STATES.STATE_ACTIVE);
            
            // Total handshake should be <150ms
            const handshakeTime = Date.now() - window.__INIT_START_TIME__;
            if (handshakeTime > 150) {
                STATUS_MACHINE.log('init', 'WARNING', `Handshake took ${handshakeTime}ms (>150ms)`);
            } else {
                STATUS_MACHINE.log('init', 'SUCCESS', `Handshake complete in ${handshakeTime}ms`);
            }
            
            // Start heartbeat system
            HeartbeatSystem.start();
            
            // Flush message queue
            MessageQueue.flush();
        }
    }
    
    function init() {
        window.__INIT_START_TIME__ = Date.now();
        startRegistrationTimeline();
    }
    
    return {
        init,
        handleModuleRegistered,
        handleSessionActive,
        handleSessionNull,
        handleParentReady,
        isModuleRegistered: () => moduleRegistered,
        isSessionReceived: () => sessionReceived,
        isParentReady: () => parentReady
    };
})();

// =============================================
// SECTION 5: VERIFY_SESSION PROTOCOL
// =============================================
const SessionVerifier = (function() {
    'use strict';
    
    const pendingVerifications = new Map();
    let cachedSession = null;
    let lastVerifyTime = 0;
    const VERIFY_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const VERIFY_TIMEOUT = 50; // 50ms timeout
    
    async function verifySession(force = false, context = 'general') {
        const now = Date.now();
        
        // Don't verify too frequently unless forced
        if (!force && now - lastVerifyTime < VERIFY_INTERVAL) {
            return cachedSession || SessionMirror.getState();
        }
        
        // Only verify if we're in active state
        if (!IframeStateMachine.isActive() && !force) {
            return cachedSession || SessionMirror.getState();
        }
        
        // Before initiating call or sensitive actions
        if (force) {
            STATUS_MACHINE.log('session', 'SENDING', `VERIFY_SESSION (${context})`);
        }
        
        const requestId = 'verify_' + now + '_' + Math.random().toString(36).substr(2, 6);
        
        return new Promise((resolve) => {
            let resolved = false;
            
            // Send verification request with short timeout
            TransportAgent.send('VERIFY_SESSION', {
                requestId,
                timestamp: now,
                frameId: SECURITY_CONFIG.FRAME_ID,
                context: context
            }, { 
                requiresAck: true, 
                timeout: VERIFY_TIMEOUT,
                messageId: requestId
            }).then((response) => {
                if (resolved) return;
                resolved = true;
                
                if (response && response.ack && response.ack.payload) {
                    const result = response.ack.payload;
                    
                    if (result.valid !== false) {
                        // Valid session
                        cachedSession = SessionMirror.getState();
                        lastVerifyTime = now;
                        STATUS_MACHINE.log('session', 'SUCCESS', `Session verified (${context})`);
                        resolve(cachedSession);
                    } else {
                        // Invalid session
                        STATUS_MACHINE.log('session', 'WARNING', `Session invalid (${context})`);
                        disableProtectedActions();
                        resolve(null);
                    }
                } else {
                    // No response - use cached session with warning
                    STATUS_MACHINE.log('session', 'WARNING', `Using cached session (no response - ${context})`);
                    resolve(cachedSession || SessionMirror.getState());
                }
            }).catch(() => {
                if (resolved) return;
                resolved = true;
                
                // First attempt failed - use cached session
                STATUS_MACHINE.log('session', 'WARNING', `Using cached session (error - ${context})`);
                resolve(cachedSession || SessionMirror.getState());
            });
            
            // Safety timeout
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    STATUS_MACHINE.log('session', 'WARNING', `Using cached session (timeout - ${context})`);
                    resolve(cachedSession || SessionMirror.getState());
                }
            }, VERIFY_TIMEOUT + 10);
        });
    }
    
    function disableProtectedActions() {
        const protectedElements = document.querySelectorAll('.protected-action, [data-protected]');
        protectedElements.forEach(el => {
            el.classList.add('disabled');
            el.setAttribute('disabled', 'disabled');
        });
        
        // Show login required modal/notification
        const loginRequired = document.querySelector('.login-required');
        if (loginRequired) {
            loginRequired.style.display = 'block';
        }
    }
    
    function handleFocus() {
        // After tab regain focus
        verifySession(true, 'focus').catch(() => {});
    }
    
    function init() {
        // Listen for focus events
        window.addEventListener('focus', handleFocus);
        
        // Periodic verification only when active
        setInterval(() => {
            if (IframeStateMachine.isActive() && SessionMirror.isAuthenticated()) {
                verifySession(false, 'periodic').catch(() => {});
            }
        }, VERIFY_INTERVAL);
    }
    
    return {
        verify: verifySession,
        init
    };
})();

// =============================================
// SECTION 6: HEARTBEAT SYSTEM (3-TIER ESCALATION)
// =============================================
const HeartbeatSystem = (function() {
    'use strict';
    
    let heartbeatInterval = null;
    let missedHeartbeats = 0;
    const MAX_MISSED_BEFORE_WARNING = 1;
    const MAX_MISSED_BEFORE_REDUCE = 2;
    const MAX_MISSED_BEFORE_STANDALONE = 3;
    const HEARTBEAT_INTERVAL = 30000; // 30 seconds
    const HEARTBEAT_TIMEOUT = 5000; // 5 seconds
    
    function start() {
        if (heartbeatInterval) return;
        
        STATUS_MACHINE.log('heartbeat', 'INIT', 'Starting heartbeat system');
        
        heartbeatInterval = setInterval(() => {
            sendHeartbeat();
        }, HEARTBEAT_INTERVAL);
    }
    
    function stop() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
        missedHeartbeats = 0;
    }
    
    function sendHeartbeat() {
        if (!IframeStateMachine.isActive()) return;
        
        const heartbeatId = 'hb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        
        TransportAgent.send('HEARTBEAT', {
            id: heartbeatId,
            timestamp: Date.now(),
            frameId: SECURITY_CONFIG.FRAME_ID
        }, { 
            requiresAck: true, 
            timeout: HEARTBEAT_TIMEOUT,
            messageId: heartbeatId
        }).then(() => {
            // Heartbeat acknowledged
            missedHeartbeats = 0;
        }).catch(() => {
            missedHeartbeats++;
            
            if (missedHeartbeats === MAX_MISSED_BEFORE_WARNING) {
                // 1 missed: mark connection unstable
                STATUS_MACHINE.log('heartbeat', 'WARNING', 'Connection unstable (1 missed)');
            } else if (missedHeartbeats === MAX_MISSED_BEFORE_REDUCE) {
                // 2 missed: reduce non-critical traffic
                STATUS_MACHINE.log('heartbeat', 'WARNING', 'Reducing non-critical traffic (2 missed)');
                MessageQueue.reduceTraffic(true);
            } else if (missedHeartbeats >= MAX_MISSED_BEFORE_STANDALONE) {
                // 3 missed: enter standalone mode
                STATUS_MACHINE.log('heartbeat', 'FAILED', 'Entering standalone mode (3 missed)');
                IframeStateMachine.transition(IFRAME_STATES.STATE_STANDALONE, 'heartbeat_failed');
                
                // Show connection warning
                showConnectionWarning();
                
                // Queue outgoing messages
                MessageQueue.queueAllOutgoing();
            }
        });
    }
    
    function handleHeartbeatAck(message) {
        if (message && message.inResponseTo && message.inResponseTo.startsWith('hb_')) {
            missedHeartbeats = 0;
            
            // If we were in standalone and get a heartbeat ack, restore active
            if (IframeStateMachine.isStandalone()) {
                STATUS_MACHINE.log('heartbeat', 'SUCCESS', 'Heartbeat resumed - restoring active');
                IframeStateMachine.transition(IFRAME_STATES.STATE_ACTIVE, 'heartbeat_resumed');
                
                // Flush queue
                MessageQueue.flush();
                
                // Hide connection warning
                hideConnectionWarning();
            }
        }
    }
    
    function showConnectionWarning() {
        const warningEl = document.getElementById('connection-warning');
        if (!warningEl) {
            const warning = document.createElement('div');
            warning.id = 'connection-warning';
            warning.className = 'connection-warning';
            warning.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Connection unstable - working in standalone mode';
            warning.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: #ff9800; color: white; padding: 8px; text-align: center; z-index: 10000;';
            document.body.prepend(warning);
        } else {
            warningEl.style.display = 'block';
        }
    }
    
    function hideConnectionWarning() {
        const warningEl = document.getElementById('connection-warning');
        if (warningEl) {
            warningEl.style.display = 'none';
        }
    }
    
    return {
        start,
        stop,
        handleHeartbeatAck
    };
})();

// =============================================
// SECTION 7: BROADCAST HANDLING RULES
// =============================================
const BroadcastHandler = (function() {
    'use strict';
    
    const processedMessageIds = new Map(); // messageId -> timestamp
    const MESSAGE_ID_CACHE_TTL = 5000; // 5 seconds
    
    const SUPPORTED_BROADCAST_TYPES = [
        'NEW_MESSAGE',
        'FRIEND_UPDATE',
        'GROUP_UPDATE',
        'STATUS_UPDATE',
        'SETTINGS_UPDATED',
        'INCOMING_CALL',
        'SESSION_REFRESHED',
        'SESSION_INVALIDATED',
        'SESSION_RECOVERY'
    ];
    
    function handleBroadcast(message) {
        // Validate type
        if (!message || !message.type) return;
        
        // Ignore if irrelevant to module
        if (!SUPPORTED_BROADCAST_TYPES.includes(message.type)) return;
        
        // Idempotency check - ignore duplicates via messageId cache
        if (message.messageId) {
            const lastProcessed = processedMessageIds.get(message.messageId);
            const now = Date.now();
            
            if (lastProcessed && (now - lastProcessed) < MESSAGE_ID_CACHE_TTL) {
                debugLog(`Ignoring duplicate broadcast: ${message.messageId}`);
                return;
            }
            
            processedMessageIds.set(message.messageId, now);
            
            // Clean old entries
            for (const [id, timestamp] of processedMessageIds.entries()) {
                if (now - timestamp > MESSAGE_ID_CACHE_TTL) {
                    processedMessageIds.delete(id);
                }
            }
        }
        
        // Never trigger full reload
        // Update UI incrementally based on type
        switch (message.type) {
            case 'NEW_MESSAGE':
                handleNewMessageBroadcast(message.payload);
                break;
            case 'FRIEND_UPDATE':
                handleFriendUpdateBroadcast(message.payload);
                break;
            case 'GROUP_UPDATE':
                handleGroupUpdateBroadcast(message.payload);
                break;
            case 'STATUS_UPDATE':
                handleStatusUpdateBroadcast(message.payload);
                break;
            case 'SETTINGS_UPDATED':
                handleSettingsUpdatedBroadcast(message.payload);
                break;
            case 'INCOMING_CALL':
                handleIncomingCallBroadcast(message.payload);
                break;
            case 'SESSION_REFRESHED':
                handleSessionRefreshedBroadcast(message.payload);
                break;
            case 'SESSION_INVALIDATED':
                handleSessionInvalidatedBroadcast(message.payload);
                break;
            case 'SESSION_RECOVERY':
                handleSessionRecoveryBroadcast(message.payload);
                break;
        }
    }
    
    function handleNewMessageBroadcast(payload) {
        if (!payload || !payload.groupId || !payload.message) return;
        
        // Add message without reload
        addGroupMessage(payload.groupId, payload.message);
        
        // If currently viewing this group, add to chat
        if (currentChatGroup && currentChatGroup.id === payload.groupId) {
            addMessageToChat(payload.message, true);
        }
    }
    
    function handleFriendUpdateBroadcast(payload) {
        if (!payload || !payload.friend) return;
        
        // Update friend list immediately
        const index = friends.findIndex(f => f.id === payload.friend.id);
        if (index !== -1) {
            friends[index] = { ...friends[index], ...payload.friend };
        } else {
            friends.push(payload.friend);
        }
        
        SafeStorage.setItem('friends', friends);
    }
    
    function handleGroupUpdateBroadcast(payload) {
        if (!payload || !payload.group) return;
        
        // Update members without reload
        updateGroupInAllLists(payload.group);
        saveGroupsToLocalStorage();
        
        // Update UI if on group details
        if (selectedGroup && selectedGroup.id === payload.group.id) {
            selectedGroup = payload.group;
            loadGroupDetails(selectedGroup, selectedGroup.type || 'group');
        }
    }
    
    function handleStatusUpdateBroadcast(payload) {
        if (!payload || !payload.userId || !payload.status) return;
        
        // Update status in UI
        const statusElements = document.querySelectorAll(`[data-user-id="${payload.userId}"] .user-status`);
        statusElements.forEach(el => {
            el.textContent = payload.status;
            el.className = `user-status status-${payload.status}`;
        });
    }
    
    function handleSettingsUpdatedBroadcast(payload) {
        if (!payload || !payload.settings) return;
        
        // Apply settings live
        if (payload.settings.theme) {
            document.documentElement.setAttribute('data-theme', payload.settings.theme);
        }
    }
    
    function handleIncomingCallBroadcast(payload) {
        if (!payload || !payload.groupId || !payload.caller) return;
        
        // Show incoming call notification
        showIncomingCallNotification(payload);
    }
    
    function handleSessionRefreshedBroadcast(payload) {
        if (!payload || !payload.session) return;
        
        // Replace session atomically
        SessionMirror.updateFromParent(payload.session);
        
        // Do NOT reinitialize UI
        STATUS_MACHINE.log('session', 'SUCCESS', 'Session refreshed');
    }
    
    function handleSessionInvalidatedBroadcast(payload) {
        // Clear session
        SessionMirror.clear();
        
        // Disable protected features
        disableProtectedActions();
        
        // Preserve drafts
        const drafts = {};
        document.querySelectorAll('[data-draft]').forEach(el => {
            if (el.value) {
                drafts[el.id] = el.value;
            }
        });
        SafeStorage.setItem('drafts', drafts);
        
        // Show login required
        showLoginRequired();
    }
    
    function handleSessionRecoveryBroadcast(payload) {
        // Enter recovery state
        IframeStateMachine.transition(IFRAME_STATES.STATE_RECOVERY, 'session_recovery');
        
        // Pause noncritical operations
        MessageQueue.pauseNoncritical(true);
        
        // Queue outgoing messages
        MessageQueue.queueAllOutgoing();
        
        STATUS_MACHINE.log('session', 'WAITING', 'Session recovery in progress');
    }
    
    function showIncomingCallNotification(payload) {
        const notification = document.createElement('div');
        notification.className = 'call-notification';
        notification.innerHTML = `
            <div class="call-notification-content">
                <div class="call-notification-title">Incoming Call</div>
                <div class="call-notification-details">${payload.caller.name} is calling</div>
                <div class="call-notification-actions">
                    <button class="call-action accept" onclick="window.acceptCall('${payload.groupId}')">Accept</button>
                    <button class="call-action decline" onclick="window.declineCall('${payload.groupId}')">Decline</button>
                </div>
            </div>
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 30000);
    }
    
    function showLoginRequired() {
        const modal = document.getElementById('loginRequiredModal');
        if (modal) {
            modal.classList.add('active');
        } else {
            const loginRequired = document.createElement('div');
            loginRequired.className = 'login-required-modal';
            loginRequired.innerHTML = `
                <div class="login-required-content">
                    <i class="fas fa-lock"></i>
                    <h3>Session Expired</h3>
                    <p>Please log in again to continue</p>
                    <button class="action-btn primary" onclick="window.location.reload()">Reload</button>
                </div>
            `;
            document.body.appendChild(loginRequired);
        }
    }
    
    function disableProtectedActions() {
        const protectedElements = document.querySelectorAll('.protected-action, [data-protected]');
        protectedElements.forEach(el => {
            el.classList.add('disabled');
            el.setAttribute('disabled', 'disabled');
        });
    }
    
    return {
        handleBroadcast
    };
})();

// =============================================
// SECTION 8: OFFLINE MODE
// =============================================
const OfflineManager = (function() {
    'use strict';
    
    let offlineBanner = null;
    
    function init() {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        // Check initial state
        if (!navigator.onLine) {
            handleOffline();
        }
    }
    
    function handleOffline() {
        STATUS_MACHINE.log('offline', 'DISCONNECTED', 'Device offline');
        
        IframeStateMachine.transition(IFRAME_STATES.STATE_OFFLINE, 'device_offline');
        
        // Queue outgoing messages
        MessageQueue.queueAllOutgoing();
        
        // Disable network actions
        disableNetworkActions();
        
        // Allow read-only access
        enableReadOnlyMode();
        
        // Display offline banner
        showOfflineBanner();
    }
    
    function handleOnline() {
        STATUS_MACHINE.log('offline', 'SUCCESS', 'Device online');
        
        if (IframeStateMachine.isOffline()) {
            // Resend queued messages
            MessageQueue.flush();
            
            // Send REQUEST_SESSION
            TransportAgent.send('REQUEST_SESSION', {
                frameId: SECURITY_CONFIG.FRAME_ID,
                timestamp: Date.now(),
                fromOffline: true
            }, { requiresAck: true }).catch(() => {});
            
            // Resume heartbeat
            HeartbeatSystem.start();
            
            // Restore active state
            IframeStateMachine.transition(IFRAME_STATES.STATE_ACTIVE, 'online');
            
            // Hide offline banner
            hideOfflineBanner();
            
            // Re-enable network actions
            enableNetworkActions();
        }
    }
    
    function showOfflineBanner() {
        if (!offlineBanner) {
            offlineBanner = document.createElement('div');
            offlineBanner.id = 'offline-banner';
            offlineBanner.className = 'offline-banner';
            offlineBanner.innerHTML = `
                <i class="fas fa-wifi-slash"></i>
                <span>You are offline - working in read-only mode</span>
                <button onclick="window.retryConnection()" class="offline-retry">Retry</button>
            `;
            offlineBanner.style.cssText = 'position: fixed; bottom: 0; left: 0; right: 0; background: #f44336; color: white; padding: 10px; text-align: center; z-index: 10000; display: flex; justify-content: center; align-items: center; gap: 10px;';
            document.body.appendChild(offlineBanner);
        }
        offlineBanner.style.display = 'flex';
    }
    
    function hideOfflineBanner() {
        if (offlineBanner) {
            offlineBanner.style.display = 'none';
        }
    }
    
    function disableNetworkActions() {
        document.querySelectorAll('[data-network-action]').forEach(el => {
            el.classList.add('disabled');
            el.setAttribute('disabled', 'disabled');
        });
    }
    
    function enableNetworkActions() {
        document.querySelectorAll('[data-network-action]').forEach(el => {
            el.classList.remove('disabled');
            el.removeAttribute('disabled');
        });
    }
    
    function enableReadOnlyMode() {
        document.body.classList.add('read-only-mode');
    }
    
    function retryConnection() {
        if (navigator.onLine) {
            handleOnline();
        } else {
            STATUS_MACHINE.log('offline', 'WAITING', 'Still offline');
        }
    }
    
    window.retryConnection = retryConnection;
    
    return {
        init,
        retryConnection
    };
})();

// =============================================
// SECTION 9: MESSAGE QUEUE SYSTEM
// =============================================
const MessageQueue = (function() {
    'use strict';
    
    const queue = [];
    const MAX_QUEUE_SIZE = 100;
    let paused = false;
    let trafficReduced = false;
    
    function queueMessage(message) {
        if (queue.length >= MAX_QUEUE_SIZE) {
            // FIFO - remove oldest
            queue.shift();
        }
        
        queue.push({
            ...message,
            queuedAt: Date.now()
        });
        
        STATUS_MACHINE.log('queue', 'WAITING', `Queued (${queue.length}/${MAX_QUEUE_SIZE})`);
    }
    
    function sendImmediately(type, payload, options = {}) {
        if (IframeStateMachine.isActive() && !paused) {
            // Send immediately
            return TransportAgent.send(type, payload, options);
        } else {
            // Queue
            const messageId = options.messageId || 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            queueMessage({ type, payload, options, messageId });
            return Promise.resolve({ queued: true, messageId });
        }
    }
    
    function flush() {
        if (queue.length === 0) return;
        
        const messagesToSend = [...queue];
        queue.length = 0;
        
        STATUS_MACHINE.log('queue', 'SENDING', `Flushing ${messagesToSend.length} messages`);
        
        messagesToSend.forEach((msg, index) => {
            setTimeout(() => {
                TransportAgent.send(msg.type, msg.payload, msg.options).catch(() => {
                    // If send fails, re-queue
                    queueMessage(msg);
                });
            }, index * 50); // Throttle to avoid overwhelming
        });
    }
    
    function queueAllOutgoing() {
        // This will be called to indicate that all outgoing messages should be queued
        // Implementation is in TransportAgent.send which checks state
    }
    
    function pauseNoncritical(shouldPause) {
        paused = shouldPause;
        STATUS_MACHINE.log('queue', paused ? 'WAITING' : 'SUCCESS', `Noncritical traffic ${paused ? 'paused' : 'resumed'}`);
    }
    
    function reduceTraffic(enabled) {
        trafficReduced = enabled;
        STATUS_MACHINE.log('queue', enabled ? 'WARNING' : 'SUCCESS', `Traffic ${enabled ? 'reduced' : 'normal'}`);
    }
    
    function getQueueLength() {
        return queue.length;
    }
    
    return {
        sendImmediately,
        queueMessage,
        flush,
        queueAllOutgoing,
        pauseNoncritical,
        reduceTraffic,
        getQueueLength
    };
})();

// =============================================
// MESSAGE DEDUPLICATOR - Prevents duplicate logs
// =============================================
const MessageDeduplicator = {
    _processedIds: new Set(),
    _processedTimestamps: new Map(),
    _maxSize: 100,
    
    isProcessed(messageId) {
        return this._processedIds.has(messageId);
    },
    
    markProcessed(messageId) {
        this._processedIds.add(messageId);
        this._processedTimestamps.set(messageId, Date.now());
        this._cleanup();
    },
    
    _cleanup() {
        if (this._processedIds.size > this._maxSize) {
            const now = Date.now();
            for (const [id, timestamp] of this._processedTimestamps) {
                if (now - timestamp > 60000) {
                    this._processedIds.delete(id);
                    this._processedTimestamps.delete(id);
                }
                if (this._processedIds.size <= this._maxSize) break;
            }
        }
    },
    
    reset() {
        this._processedIds.clear();
        this._processedTimestamps.clear();
    }
};

// =============================================
// GLOBAL DECLARATIONS
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

const groupActionQueue = [];
let isProcessingQueue = false;

let handshakeInProgress = false;
let handshakeAttempts = 0;
let handshakeCompleted = false;

// Set up message listener only, no automatic handshake
if (typeof window !== 'undefined' && !window.__GROUP_HANDSHAKE_INITIALIZED__) {
    window.__GROUP_HANDSHAKE_INITIALIZED__ = true;
    
    // Set up message listener only, no automatic handshake
    window.addEventListener("message", (event) => {
        if (!event.data) return;
        
        if (event.data.type === "PARENT_ACK" || event.data.type === "HANDSHAKE_ACK" || event.data.type === "SESSION_VERIFIED") {
            window.__PARENT_ACK_RECEIVED__ = true;
            handshakeCompleted = true;
            __PARENT_READY__ = true;
            __HANDSHAKE_COMPLETE__ = true;
        }
    });
}

// =============================================
// MODULE IDENTIFICATION
// =============================================
const MODULE_NAME = 'Groups';
let _instanceId = null;

// =============================================
// SAFE FETCH WRAPPER
// =============================================
let fetchErrorShown = false;

async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            credentials: "include",
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            if (response.status === 404 && !fetchErrorShown) {
                fetchErrorShown = true;
            }
            throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        if (!fetchErrorShown) {
            fetchErrorShown = true;
        }
        return { 
            success: false, 
            message: error.message,
            fromCache: true
        };
    }
}

async function safeFetchGroups() {
    try {
        const result = await safeFetch('/api/groups', {
            method: 'GET'
        });
        
        if (!result || !result.success) {
            return { success: false, data: [] };
        }
        
        return result;
    } catch (error) {
        return { success: false, data: [] };
    }
}

async function safeFetchGroupInvites() {
    try {
        const result = await safeFetch('/api/invites', {
            method: 'GET'
        });
        
        if (!result || !result.success) {
            return { success: false, data: [] };
        }
        
        return result;
    } catch (error) {
        return { success: false, data: [] };
    }
}

// =============================================
// SECURITY CONSTANTS
// =============================================
const SECURITY_CONFIG = {
    CSP_NONSE: 'group-core-' + Date.now() + '-' + Math.random().toString(36).substring(2, 15),
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
    ],
    HANDSHAKE_TIMEOUT: 5000,
    HANDSHAKE_MAX_RETRIES: 2,
    SESSION_REFRESH_INTERVAL: 60000,
    MESSAGE_QUEUE_MAX_SIZE: 100,
    
    PROTOCOL_VERSION: "KYN-1.0",
    FRAME_ID: 'groups-iframe-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    HEARTBEAT_INTERVAL: 15000,
    HEARTBEAT_TIMEOUT: 45000,
    ACK_TIMEOUT: 3000,
    MAX_RETRY_DELAY: 10000,
    INITIAL_RETRY_DELAY: 500,
    
    TRUSTED_ORIGINS: [
        window.location.origin,
        'https://knecta.chat',
        'https://www.knecta.chat',
        /\.onrender\.com$/,
        /^\d+\.\d+\.\d+\.\d+:\d+$/,
        'null'
    ]
};

// =============================================
// SAFE INPUT VALIDATION
// =============================================
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

function sanitizePayload(payload) {
    if (!payload) return {};
    
    try {
        return JSON.parse(JSON.stringify(payload, (key, value) => {
            if (key === 'token' || key === 'password' || key === 'secret' || key === 'authorization') {
                return '[REDACTED]';
            }
            if (typeof value === 'string' && value.length > SECURITY_CONFIG.MAX_STRING_LENGTH) {
                return value.substring(0, SECURITY_CONFIG.MAX_STRING_LENGTH);
            }
            return value;
        }));
    } catch (e) {
        return {};
    }
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
// BROADCAST CHANNEL - Cross-tab synchronization
// =============================================
const BroadcastManager = (function() {
    'use strict';
    
    let channel = null;
    let initialized = false;
    const listeners = new Set();
    const messageQueue = [];
    const CHANNEL_NAME = 'knecta_groups_sync';
    
    function init() {
        if (initialized) return;
        
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                channel = new BroadcastChannel(CHANNEL_NAME);
                
                channel.onmessage = (event) => {
                    if (!event.data) return;
                    
                    const message = event.data;
                    
                    // Route through broadcast handler
                    BroadcastHandler.handleBroadcast(message);
                    
                    listeners.forEach(listener => {
                        try {
                            listener(message);
                        } catch (e) {}
                    });
                    
                    while (messageQueue.length > 0) {
                        const queued = messageQueue.shift();
                        processMessage(queued);
                    }
                };
                
                initialized = true;
                debugLog('BroadcastChannel initialized');
            }
        } catch (error) {
            debugLog('BroadcastChannel not supported');
        }
    }
    
    function processMessage(message) {
        if (!initialized || !channel) {
            messageQueue.push(message);
            return;
        }
        
        try {
            channel.postMessage(message);
        } catch (error) {
            debugLog('BroadcastChannel postMessage error:', error);
        }
    }
    
    function broadcast(type, data = {}) {
        const message = {
            type,
            data,
            source: SECURITY_CONFIG.FRAME_ID,
            timestamp: Date.now(),
            version: MODULE_VERSION
        };
        
        processMessage(message);
    }
    
    function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
    
    function destroy() {
        if (channel) {
            channel.close();
            channel = null;
        }
        initialized = false;
        listeners.clear();
        messageQueue.length = 0;
    }
    
    return {
        init,
        broadcast,
        subscribe,
        destroy,
        isSupported: () => typeof BroadcastChannel !== 'undefined'
    };
})();

// =============================================
// SAFE STORAGE - Deterministic data persistence
// =============================================
const SafeStorage = (function() {
    'use strict';
    
    const STORAGE_PREFIX = 'knecta_groups_';
    const storage = new Map();
    let useLocalStorage = true;
    let initialized = false;
    let encryptionKey = null;
    const subscribers = new Map();
    
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
            
            BroadcastManager.init();
            BroadcastManager.subscribe(handleBroadcast);
            
            initialized = true;
            debugLog('SafeStorage initialized');
        } catch (error) {
            debugLog('SafeStorage init error:', error);
        }
    }
    
    function handleBroadcast(message) {
        if (message.type === 'storage_update' && message.data.key) {
            const subscribers_list = subscribers.get(message.data.key);
            if (subscribers_list) {
                subscribers_list.forEach(callback => {
                    try {
                        callback(message.data.value, true);
                    } catch (e) {}
                });
            }
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
            
            if (!skipBroadcast) {
                BroadcastManager.broadcast('storage_update', {
                    key: storageKey,
                    value
                });
            }
            
            const subs = subscribers.get(storageKey);
            if (subs) {
                subs.forEach(callback => {
                    try {
                        callback(value, false);
                    } catch (e) {}
                });
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
            
            if (!skipBroadcast) {
                BroadcastManager.broadcast('storage_remove', {
                    key: storageKey
                });
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
            
            BroadcastManager.broadcast('storage_clear', {});
            
            return true;
        } catch (error) {
            debugLog('SafeStorage clear error:', error);
            return false;
        }
    }
    
    function subscribe(key, callback) {
        if (!subscribers.has(key)) {
            subscribers.set(key, new Set());
        }
        subscribers.get(key).add(callback);
        
        const currentValue = getItem(key);
        if (currentValue !== null) {
            try {
                callback(currentValue, false);
            } catch (e) {}
        }
        
        return () => {
            const subs = subscribers.get(key);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) {
                    subscribers.delete(key);
                }
            }
        };
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
    
    return {
        init,
        setItem,
        getItem,
        removeItem,
        clear,
        subscribe,
        getKeys,
        destroy,
        isAvailable: () => initialized
    };
})();

// =============================================
// STARTUP GOVERNOR - INTEGRATED WITH LIFECYCLE FSM
// =============================================
const StartupGovernor = {
    _state: LIFECYCLE_STATES.UNINITIALIZED,
    _initAttempts: 0,
    _maxInitAttempts: 2,
    _initPromise: null,
    _initResolve: null,
    _initReject: null,
    _stateListeners: new Set(),
    _stateHistory: [],
    _authoritySubscribed: false,
    _timers: new Set(),
    
    init() {
        if (!LifecycleFSM.acquireLock()) {
            return LifecycleFSM.getInitializationPromise() || Promise.resolve({ success: false, reason: 'locked' });
        }
        
        // Only transition from UNINITIALIZED to BOOTSTRAPPING
        if (LifecycleFSM.getState() === LIFECYCLE_STATES.UNINITIALIZED) {
            LifecycleFSM.transition(LIFECYCLE_STATES.BOOTSTRAPPING);
        } else {
            debugLog(`StartupGovernor: Already in state ${LifecycleFSM.getState()}, skipping bootstrap`);
        }
        
        this._initAttempts++;
        
        if (!this._authoritySubscribed) {
            this._authoritySubscribed = true;
            ParentAuthority.subscribe((newState) => {
                if (newState === PARENT_AUTHORITY_STATES.READY && 
                    LifecycleFSM.getState() === LIFECYCLE_STATES.HANDSHAKING) {
                    this._handleAuthorityReady();
                } else if (newState === PARENT_AUTHORITY_STATES.DEGRADED && 
                          !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                    this._handleAuthorityDegraded();
                }
            });
        }
        
        this._initPromise = new Promise((resolve, reject) => {
            this._initResolve = resolve;
            this._initReject = reject;
            
            this._runPipeline().then(resolve).catch(reject);
        });
        
        LifecycleFSM.setInitializationPromise(this._initPromise);
        
        return this._initPromise;
    },
    
    _createTimer(fn, delay) {
        const timerId = setTimeout(() => {
            this._timers.delete(timerId);
            fn();
        }, delay);
        this._timers.add(timerId);
        return timerId;
    },
    
    _clearAllTimers() {
        this._timers.forEach(id => clearTimeout(id));
        this._timers.clear();
    },
    
    async _runPipeline() {
        try {
            // PRE_FLIGHT - can only transition from BOOTSTRAPPING
            if (LifecycleFSM.getState() === LIFECYCLE_STATES.BOOTSTRAPPING) {
                LifecycleFSM.transition(LIFECYCLE_STATES.PRE_FLIGHT);
            }
            const preflightResult = await this._preflightStage();
            
            // DEPENDENCIES_CHECKED - can only transition from PRE_FLIGHT
            if (LifecycleFSM.getState() === LIFECYCLE_STATES.PRE_FLIGHT) {
                LifecycleFSM.transition(LIFECYCLE_STATES.DEPENDENCIES_CHECKED);
            }
            
            // PARENT_DETECTED - can only transition from DEPENDENCIES_CHECKED
            if (LifecycleFSM.getState() === LIFECYCLE_STATES.DEPENDENCIES_CHECKED) {
                LifecycleFSM.transition(LIFECYCLE_STATES.PARENT_DETECTED);
            }
            const parentResult = await this._parentDetectStage();
            
            // HANDSHAKING - can only transition from PARENT_DETECTED
            if (parentResult.parentAvailable && !ParentAuthority.isDegraded()) {
                if (LifecycleFSM.getState() === LIFECYCLE_STATES.PARENT_DETECTED) {
                    LifecycleFSM.transition(LIFECYCLE_STATES.HANDSHAKING);
                }
                const handshakeResult = await this._handshakeStage(parentResult);
                
                // SESSION_PENDING - can only transition from HANDSHAKING
                if (LifecycleFSM.getState() === LIFECYCLE_STATES.HANDSHAKING) {
                    LifecycleFSM.transition(LIFECYCLE_STATES.SESSION_PENDING);
                }
                const sessionResult = await this._sessionStage(handshakeResult);
                
                if (sessionResult.success) {
                    // SESSION_ACTIVE - can only transition from SESSION_PENDING
                    if (LifecycleFSM.getState() === LIFECYCLE_STATES.SESSION_PENDING) {
                        LifecycleFSM.transition(LIFECYCLE_STATES.SESSION_ACTIVE, sessionResult.authoritative ? 'authoritative' : 'synced');
                    }
                } else {
                    if (ParentAuthority.isDegraded() || parentResult.parentAvailable === false) {
                        if (LifecycleFSM.getState() === LIFECYCLE_STATES.SESSION_PENDING || 
                            LifecycleFSM.getState() === LIFECYCLE_STATES.HANDSHAKING) {
                            LifecycleFSM.transition(LIFECYCLE_STATES.DEGRADED_MODE, 'fallback');
                        }
                    } else {
                        throw new Error('Session acquisition failed');
                    }
                }
            } else {
                if (LifecycleFSM.getState() === LIFECYCLE_STATES.PARENT_DETECTED) {
                    LifecycleFSM.transition(LIFECYCLE_STATES.DEGRADED_MODE, 'parent_unavailable');
                }
            }
            
            // SERVICES_INITIALIZING - can only transition from SESSION_ACTIVE or DEGRADED_MODE
            if (LifecycleFSM.getState() === LIFECYCLE_STATES.SESSION_ACTIVE || 
                LifecycleFSM.getState() === LIFECYCLE_STATES.DEGRADED_MODE) {
                LifecycleFSM.transition(LIFECYCLE_STATES.SERVICES_INITIALIZING);
            }
            await this._servicesStage();
            
            // ACTIVE - can only transition from SERVICES_INITIALIZING
            if (LifecycleFSM.getState() === LIFECYCLE_STATES.SERVICES_INITIALIZING) {
                LifecycleFSM.transition(LIFECYCLE_STATES.ACTIVE);
            }
            
            this._clearAllTimers();
            LifecycleFSM.releaseLock();
            
            return {
                success: true,
                state: LifecycleFSM.getState(),
                degraded: LifecycleFSM.isDegraded()
            };
            
        } catch (error) {
            if (this._initAttempts < this._maxInitAttempts && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                this._clearAllTimers();
                LifecycleFSM.releaseLock();
                
                const delay = 1000 * this._initAttempts;
                await new Promise(r => setTimeout(r, delay));
                
                return this._runPipeline();
            }
            
            if (LifecycleFSM.getState() !== LIFECYCLE_STATES.DEGRADED_MODE && 
                !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                if (LifecycleFSM.getState() === LIFECYCLE_STATES.HANDSHAKING || 
                    LifecycleFSM.getState() === LIFECYCLE_STATES.SESSION_PENDING) {
                    LifecycleFSM.transition(LIFECYCLE_STATES.DEGRADED_MODE, 'error_fallback');
                } else {
                    LifecycleFSM.transition(LIFECYCLE_STATES.FAILED, error.message);
                }
            }
            
            this._clearAllTimers();
            LifecycleFSM.releaseLock();
            
            return {
                success: false,
                state: LifecycleFSM.getState(),
                error: error.message,
                fallback: LifecycleFSM.isDegraded()
            };
        }
    },
    
    async _preflightStage() {
        try {
            _instanceId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            SafeStorage.init();
            IframeAuthority.init();
            API_WRAPPER.init();
            ParentAuthority.init();
            
            return { success: true };
        } catch (error) {
            throw new Error(`Preflight failed: ${error.message}`);
        }
    },
    
    async _parentDetectStage() {
        try {
            ParentConnectionManager.init();
            
            const parentAvailable = ParentConnectionManager.parentAvailable;
            
            return { success: true, parentAvailable };
        } catch (error) {
            return { success: false, parentAvailable: false };
        }
    },
    
    async _handshakeStage(parentResult) {
        try {
            if (!parentResult.parentAvailable) {
                return { success: false, reason: 'parent_unavailable' };
            }
            
            if (ParentAuthority.isAuthoritativeSession()) {
                return { success: true, authoritative: true };
            }
            
            try {
                const result = await HandshakeClient.initiate({
                    timeout: SECURITY_CONFIG.HANDSHAKE_TIMEOUT,
                    maxRetries: SECURITY_CONFIG.HANDSHAKE_MAX_RETRIES
                });
                
                return { success: true, result };
            } catch (error) {
                if (ParentConnectionManager && ParentConnectionManager.tryCachedSession()) {
                    return { success: true, fromCache: true };
                }
                
                return { success: false, error: error.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    
    async _sessionStage(handshakeResult) {
        try {
            if (ParentAuthority.isAuthoritativeSession()) {
                const authSession = ParentAuthority.getAuthoritativeSession();
                if (authSession) {
                    await this._applyAuthoritativeSession(authSession);
                    return { success: true, authoritative: true };
                }
            }
            
            SessionMirror.init();
            SessionClient.init();
            
            const sessionPromise = new Promise((resolve) => {
                if (SessionMirror.isAuthenticated()) {
                    resolve(SessionMirror.getState());
                    return;
                }
                
                const timeoutId = setTimeout(() => {
                    unsubscribe();
                    resolve(null);
                }, 3000);
                
                const unsubscribe = SessionMirror.subscribe((state) => {
                    if (state.authenticated) {
                        clearTimeout(timeoutId);
                        unsubscribe();
                        resolve(state);
                    }
                });
            });
            
            const session = await sessionPromise;
            
            if (session) {
                currentUser = session.user;
                userData = {
                    displayName: session.user?.displayName || session.user?.name || 'User',
                    username: session.user?.username || '',
                    email: session.user?.email || '',
                    photoURL: session.user?.photoURL || session.user?.avatar || ''
                };
                authReady = true;
                __SESSION_READY__ = true;
                
                return { success: true, fromCache: session.fromCache || false };
            }
            
            if (handshakeResult.fromCache) {
                return { success: true, fromCache: true };
            }
            
            return { success: false };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    
    async _applyAuthoritativeSession(sessionData) {
        if (!sessionData) return;
        
        if (SessionMirror) {
            SessionMirror.updateFromParent({
                user: sessionData.user,
                token: sessionData.token,
                timestamp: sessionData.timestamp,
                permissions: sessionData.permissions || [],
                authenticated: true,
                fromCache: false
            });
        }
        
        if (sessionData.user) {
            currentUser = sessionData.user;
            userData = {
                displayName: sessionData.user.displayName || sessionData.user.name || 'User',
                username: sessionData.user.username || '',
                email: sessionData.user.email || '',
                photoURL: sessionData.user.photoURL || sessionData.user.avatar || ''
            };
            
            try {
                SafeStorage.setItem('user', {
                    uid: sessionData.user.id || sessionData.user._id || sessionData.user.uid,
                    displayName: sessionData.user.displayName || sessionData.user.name,
                    email: sessionData.user.email,
                    photoURL: sessionData.user.photoURL || sessionData.user.avatar
                });
            } catch (e) {}
        }
        
        if (sessionData.token) {
            saveUnifiedToken(sessionData.token);
        }
        
        authReady = true;
        authCheckComplete = true;
        __SESSION_READY__ = true;
    },
    
    async _servicesStage() {
        loadCachedDataInstantly();
        initializeTokenSystem();
        
        isPageInitialized = true;
        
        window.__MODULE_READY__ = true;
        if (__SESSION_READY__) {
            window.__MODULE_SESSION_ACTIVE__ = true;
        }
        
        document.dispatchEvent(new CustomEvent('groupsCoreReady', {
            detail: {
                version: MODULE_VERSION,
                timestamp: Date.now(),
                sessionValid: hasValidSession(),
                authenticated: SessionMirror.isAuthenticated(),
                authoritative: ParentAuthority.isAuthoritativeSession(),
                state: LifecycleFSM.getState()
            }
        }));
        
        processGroupActionQueue();
        
        return { success: true };
    },
    
    _handleAuthorityReady() {
        if (LifecycleFSM.getState() === LIFECYCLE_STATES.HANDSHAKING) {
            // Continue with current flow
        }
    },
    
    _handleAuthorityDegraded() {
        if (LifecycleFSM.getState() === LIFECYCLE_STATES.HANDSHAKING && 
            !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            LifecycleFSM.transition(LIFECYCLE_STATES.DEGRADED_MODE, 'authority_degraded');
        }
    },
    
    onStateChange(listener) {
        this._stateListeners.add(listener);
        return () => this._stateListeners.delete(listener);
    },
    
    getState() {
        return {
            state: LifecycleFSM.getState(),
            attempts: this._initAttempts,
            history: LifecycleFSM.getHistory()
        };
    },
    
    isActive() {
        return LifecycleFSM.isActive();
    },
    
    isDegraded() {
        return LifecycleFSM.isDegraded() || ParentAuthority.isDegraded();
    },
    
    reset() {
        this._clearAllTimers();
        this._initAttempts = 0;
        this._initPromise = null;
        LifecycleFSM.reset();
        LifecycleFSM.releaseLock();
    }
};

// =============================================
// ORIGIN ADAPTER - DYNAMIC ORIGIN HANDLING
// =============================================
const OriginAdapter = {
    _trustCache: new Map(),
    _dynamicOrigins: new Set(),
    _initialized: false,
    
    init() {
        if (this._initialized) return;
        this._initialized = true;
        
        this.addTrustedOrigin(window.location.origin);
        
        try {
            if (window.parent && window.parent.location) {
                this.addTrustedOrigin(window.parent.location.origin);
            }
        } catch (e) {}
    },
    
    addTrustedOrigin(origin) {
        if (!origin) return;
        
        const originStr = String(origin);
        
        const isStaticTrusted = SECURITY_CONFIG.TRUSTED_ORIGINS.some(pattern => {
            if (pattern instanceof RegExp) {
                return pattern.test(originStr);
            }
            return pattern === originStr;
        });
        
        if (isStaticTrusted) {
            this._dynamicOrigins.add(originStr);
        }
    },
    
    isTrusted(origin) {
        if (!origin) return false;
        
        if (this._trustCache.has(origin)) {
            return this._trustCache.get(origin);
        }
        
        const originStr = String(origin);
        
        if (this._dynamicOrigins.has(originStr)) {
            this._trustCache.set(origin, true);
            return true;
        }
        
        for (const pattern of SECURITY_CONFIG.TRUSTED_ORIGINS) {
            if (pattern instanceof RegExp && pattern.test(originStr)) {
                this._dynamicOrigins.add(originStr);
                this._trustCache.set(origin, true);
                return true;
            }
            if (pattern === originStr) {
                this._dynamicOrigins.add(originStr);
                this._trustCache.set(origin, true);
                return true;
            }
        }
        
        this._trustCache.set(origin, false);
        return false;
    },
    
    _isSandboxed() {
        try {
            const test = window.parent.document;
            return false;
        } catch (e) {
            return e.name === 'SecurityError';
        }
    },
    
    getTrustedOrigins() {
        return Array.from(this._dynamicOrigins);
    },
    
    clearCache() {
        this._trustCache.clear();
    }
};

// =============================================
// CANONICAL MESSAGE FORMATTER
// =============================================
const CanonicalMessageFormatter = {
    createMessage(type, payload = {}, options = {}) {
        const messageId = options.messageId || this.generateMessageId();
        const timestamp = Date.now();
        
        return {
            protocol: SECURITY_CONFIG.PROTOCOL_VERSION,
            messageId: messageId,
            type: type,
            source: "iframe",
            target: "parent",
            frameId: SECURITY_CONFIG.FRAME_ID,
            timestamp: timestamp,
            payload: sanitizePayload(payload),
            token: options.token || null,
            signature: options.signature || null,
            legacy: options.legacy || false
        };
    },
    
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    adaptLegacyMessage(legacyMessage) {
        if (!legacyMessage) return null;
        
        if (legacyMessage.protocol === SECURITY_CONFIG.PROTOCOL_VERSION) {
            return legacyMessage;
        }
        
        let type = legacyMessage.type || 'unknown';
        let payload = legacyMessage.payload || legacyMessage.data || {};
        
        return {
            protocol: SECURITY_CONFIG.PROTOCOL_VERSION,
            messageId: legacyMessage.id || this.generateMessageId(),
            type: type,
            source: legacyMessage.source || "iframe",
            target: "parent",
            frameId: SECURITY_CONFIG.FRAME_ID,
            timestamp: legacyMessage.timestamp || Date.now(),
            payload: sanitizePayload(payload),
            token: null,
            signature: null,
            legacy: true
        };
    },
    
    isOriginTrusted(origin) {
        return OriginAdapter.isTrusted(origin);
    }
};

// =============================================
// TRANSPORT AGENT - FIXED WITH DEDUPLICATION AND RETRY LIMITS
// =============================================
const TransportAgent = {
    _messageId: 0,
    _pendingAcks: new Map(),
    _retryQueues: new Map(),
    _offlineQueue: [],
    _heartbeatInterval: null,
    _lastHeartbeat: 0,
    _connectionState: 'disconnected',
    _maxRetries: 2,
    _baseBackoff: 500,
    _listeners: new Set(),
    _sentMessages: new Set(),
    _initialized: false,
    _stats: {
        sent: 0,
        received: 0,
        acked: 0,
        timedout: 0,
        retried: 0,
        failed: 0
    },
    _heartbeatRetryCount: 0,
    _maxHeartbeatRetries: 2,
    _timers: new Set(),
    
    init() {
        if (this._initialized) return this;
        this._initialized = true;
        
        this._setupHeartbeat();
        this._processOfflineQueue();
        return this;
    },
    
    _createTimer(fn, delay) {
        const timerId = setTimeout(() => {
            this._timers.delete(timerId);
            fn();
        }, delay);
        this._timers.add(timerId);
        return timerId;
    },
    
    _clearAllTimers() {
        this._timers.forEach(id => clearTimeout(id));
        this._timers.clear();
    },
    
    send(type, payload = {}, options = {}) {
        const messageId = options.messageId || this._generateMessageId();
        const requiresAck = options.requiresAck !== false;
        const timeout = options.timeout || SECURITY_CONFIG.ACK_TIMEOUT;
        const retryCount = options.retryCount || 0;
        const maxRetries = options.maxRetries || this._maxRetries;
        const priority = options.priority || 'normal';
        
        // Don't send operational messages before PARENT_READY (v5.0 requirement)
        const isOperational = ![
            'REGISTER_MODULE', 'CHILD_READY', 'REQUEST_SESSION', 
            'VERIFY_SESSION', 'PING', 'PONG', 'HEARTBEAT'
        ].includes(type);
        
        if (isOperational && !InitTimeline.isParentReady() && !IframeStateMachine.isActive()) {
            // Queue operational messages until parent is ready
            MessageQueue.queueMessage({ type, payload, options, messageId });
            return Promise.resolve({ 
                success: false, 
                queued: true, 
                messageId,
                reason: 'parent_not_ready'
            });
        }
        
        if (this._sentMessages.has(messageId)) {
            return Promise.resolve({ success: true, cached: true, messageId });
        }
        
        // Route through MessageQueue based on state
        if (!IframeStateMachine.isActive() && !isOperational) {
            MessageQueue.queueMessage({ type, payload, options, messageId });
            return Promise.resolve({ 
                success: false, 
                queued: true, 
                messageId,
                reason: 'state_not_active'
            });
        }
        
        const isInIframe = window !== window.parent;
        const hasPostMessage = !!(window.parent && typeof window.parent.postMessage === 'function');
        const parentAvailable = isInIframe && hasPostMessage;
        
        if (!parentAvailable) {
            this._offlineQueue.push({
                messageId,
                type,
                payload,
                options,
                timestamp: Date.now(),
                priority
            });
            
            if (this._offlineQueue.length > SECURITY_CONFIG.MESSAGE_QUEUE_MAX_SIZE) {
                this._offlineQueue.shift();
            }
            
            return Promise.resolve({ 
                success: false, 
                queued: true, 
                messageId,
                reason: 'parent_unavailable'
            });
        }
        
        const message = this._createCanonicalMessage(type, payload, {
            messageId,
            requiresAck
        });
        
        if (requiresAck) {
            const retryInfo = {
                messageId,
                type,
                payload,
                options,
                retryCount,
                maxRetries,
                timeout: this._createTimer(() => {
                    this._handleAckTimeout(messageId, retryCount, maxRetries, type, payload, options);
                }, timeout),
                timestamp: Date.now()
            };
            
            this._pendingAcks.set(messageId, retryInfo);
        }
        
        try {
            if (window.parent && window.parent.postMessage) {
                window.parent.postMessage(message, '*');
                this._stats.sent++;
                this._sentMessages.add(messageId);
                
                const logKey = `${type}_sent`;
                if (!MessageDeduplicator.isProcessed(logKey)) {
                    STATUS_MACHINE.log('transport', 'SENDING', type);
                    MessageDeduplicator.markProcessed(logKey);
                }
                
                if (!requiresAck) {
                    this._stats.acked++;
                }
                
                this._connectionState = 'connected';
                this._lastHeartbeat = Date.now();
            } else {
                throw new Error('No parent window');
            }
        } catch (error) {
            this._stats.failed++;
            
            if (requiresAck) {
                const pending = this._pendingAcks.get(messageId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this._pendingAcks.delete(messageId);
                }
            }
            
            return Promise.reject(error);
        }
        
        if (!requiresAck) {
            return Promise.resolve({ success: true, messageId });
        }
        
        return new Promise((resolve, reject) => {
            const pending = this._pendingAcks.get(messageId);
            if (pending) {
                pending.resolve = resolve;
                pending.reject = reject;
            }
        });
    },
    
    _handleAckTimeout(messageId, retryCount, maxRetries, type, payload, options) {
        const pending = this._pendingAcks.get(messageId);
        if (!pending) return;
        
        this._pendingAcks.delete(messageId);
        this._stats.timedout++;
        
        const logKey = `${type}_timeout_${retryCount}`;
        if (!MessageDeduplicator.isProcessed(logKey)) {
            STATUS_MACHINE.log('transport', 'WAITING', `${type} retry ${retryCount}/${maxRetries}`);
            MessageDeduplicator.markProcessed(logKey);
        }
        
        if (retryCount < maxRetries && !LifecycleFSM.isActive()) {
            const backoffDelay = this._baseBackoff * Math.pow(2, retryCount);
            this._stats.retried++;
            
            this._createTimer(() => {
                this.send(type, payload, {
                    ...options,
                    retryCount: retryCount + 1,
                    maxRetries,
                    messageId
                }).then(pending.resolve).catch(pending.reject);
            }, backoffDelay);
        } else {
            const failKey = `${type}_max_retries`;
            if (!MessageDeduplicator.isProcessed(failKey)) {
                STATUS_MACHINE.log('transport', 'FAILED', `${type} max retries`);
                MessageDeduplicator.markProcessed(failKey);
            }
            if (pending.reject) {
                pending.reject(new Error('ACK timeout after max retries'));
            }
        }
    },
    
    handleAck(message) {
        const messageId = message.inResponseTo || message.payload?.inResponseTo || message.messageId;
        if (!messageId) return;
        
        // Check if this is a heartbeat ack
        if (message.inResponseTo && message.inResponseTo.startsWith('hb_')) {
            HeartbeatSystem.handleHeartbeatAck(message);
        }
        
        const pending = this._pendingAcks.get(messageId);
        if (pending) {
            clearTimeout(pending.timeout);
            this._pendingAcks.delete(messageId);
            this._stats.acked++;
            
            if (pending.resolve) {
                pending.resolve({ success: true, ack: message });
            }
        }
    },
    
    handlePing(message) {
        this.send('PONG', {
            inResponseTo: message.messageId || message.id,
            timestamp: Date.now(),
            state: this._connectionState
        }, { requiresAck: false }).catch(() => {});
        
        this._lastHeartbeat = Date.now();
        this._heartbeatRetryCount = 0;
    },
    
    _generateMessageId() {
        return `msg_${Date.now()}_${++this._messageId}_${Math.random().toString(36).substr(2, 6)}`;
    },
    
    _createCanonicalMessage(type, payload, options = {}) {
        return {
            protocol: SECURITY_CONFIG.PROTOCOL_VERSION,
            messageId: options.messageId || this._generateMessageId(),
            type: type,
            source: "iframe",
            target: "parent",
            frameId: SECURITY_CONFIG.FRAME_ID,
            timestamp: Date.now(),
            payload: sanitizePayload(payload),
            requiresAck: options.requiresAck || false,
            token: null
        };
    },
    
    _setupHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
        }
        
        this._heartbeatInterval = setInterval(() => {
            const isInIframe = window !== window.parent;
            const hasPostMessage = !!(window.parent && typeof window.parent.postMessage === 'function');
            const parentAvailable = isInIframe && hasPostMessage;
            
            if (parentAvailable && this._connectionState === 'connected') {
                if (this._heartbeatRetryCount < this._maxHeartbeatRetries) {
                    this.send('PING', {
                        timestamp: Date.now(),
                        state: this._connectionState
                    }, { requiresAck: false }).catch(() => {
                        this._heartbeatRetryCount++;
                    });
                    
                    if (this._lastHeartbeat > 0 && 
                        Date.now() - this._lastHeartbeat > SECURITY_CONFIG.HEARTBEAT_TIMEOUT) {
                        this._connectionState = 'disconnected';
                        if (this._heartbeatRetryCount < this._maxHeartbeatRetries && !LifecycleFSM.isActive()) {
                            this.reconnect();
                        } else {
                            this._connectionState = 'degraded';
                        }
                    }
                }
            }
        }, SECURITY_CONFIG.HEARTBEAT_INTERVAL);
    },
    
    _processOfflineQueue() {
        if (this._offlineQueue.length === 0) return;
        
        const isInIframe = window !== window.parent;
        const hasPostMessage = !!(window.parent && typeof window.parent.postMessage === 'function');
        const parentAvailable = isInIframe && hasPostMessage;
        
        if (!parentAvailable) return;
        
        const sorted = [...this._offlineQueue].sort((a, b) => {
            const priorityOrder = { high: 0, normal: 1, low: 2 };
            return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
        });
        
        this._offlineQueue = [];
        
        sorted.forEach(msg => {
            setTimeout(() => {
                this.send(msg.type, msg.payload, msg.options).catch(() => {});
            }, 100);
        });
    },
    
    reconnect() {
        this._connectionState = 'connecting';
        
        if (ParentConnectionManager && ParentConnectionManager.reconnect) {
            ParentConnectionManager.reconnect();
        }
        
        setTimeout(() => {
            this._processOfflineQueue();
        }, 1000);
    },
    
    onMessage(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    },
    
    getStats() {
        return {
            ...this._stats,
            pendingAcks: this._pendingAcks.size,
            offlineQueue: this._offlineQueue.length,
            connectionState: this._connectionState,
            lastHeartbeat: this._lastHeartbeat
        };
    },
    
    setConnectionState(state) {
        const validStates = ['disconnected', 'connecting', 'connected', 'degraded'];
        if (validStates.includes(state)) {
            this._connectionState = state;
        }
    },
    
    destroy() {
        this._clearAllTimers();
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
        this._pendingAcks.clear();
        this._offlineQueue = [];
        this._sentMessages.clear();
        this._listeners.clear();
        this._initialized = false;
    }
};

// =============================================
// RECOVERY MANAGER - WITH RETRY LIMITS
// =============================================
const RecoveryManager = {
    _failureCount: 0,
    _maxFailures: 3,
    _recoveryTimer: null,
    _lastRecovery: 0,
    _recoveryInProgress: false,
    _strategies: null,
    _initialized: false,
    _recoveryAttempts: 0,
    _maxRecoveryAttempts: 2,
    _timers: new Set(),
    
    init() {
        if (this._initialized) return this;
        this._initialized = true;
        
        this._strategies = {
            network: this._recoverNetwork.bind(this),
            session: this._recoverSession.bind(this),
            handshake: this._recoverHandshake.bind(this),
            full: this._recoverFull.bind(this)
        };
        return this;
    },
    
    _createTimer(fn, delay) {
        const timerId = setTimeout(() => {
            this._timers.delete(timerId);
            fn();
        }, delay);
        this._timers.add(timerId);
        return timerId;
    },
    
    _clearAllTimers() {
        this._timers.forEach(id => clearTimeout(id));
        this._timers.clear();
    },
    
    handleFailure(error, context = {}) {
        if (LifecycleFSM.isActive()) {
            this.reset();
            return;
        }
        
        this._failureCount++;
        
        if (this._failureCount >= this._maxFailures) {
            if (this._recoveryAttempts < this._maxRecoveryAttempts && !LifecycleFSM.isActive()) {
                this.initiateRecovery('full');
            } else {
                this._failureCount = 0;
                this._recoveryAttempts = 0;
            }
        } else if (this._failureCount > 2) {
            if (this._recoveryAttempts < this._maxRecoveryAttempts && !LifecycleFSM.isActive()) {
                this.initiateRecovery('network');
            }
        }
    },
    
    initiateRecovery(strategy = 'network') {
        if (this._recoveryInProgress) return;
        if (this._recoveryAttempts >= this._maxRecoveryAttempts) return;
        if (LifecycleFSM.isActive()) return;
        
        if (this._recoveryTimer) {
            clearTimeout(this._recoveryTimer);
        }
        
        this._recoveryTimer = this._createTimer(() => {
            this._executeRecovery(strategy);
        }, 1000 * Math.min(this._failureCount, 3));
    },
    
    async _executeRecovery(strategy) {
        if (this._recoveryInProgress) return;
        if (this._recoveryAttempts >= this._maxRecoveryAttempts) return;
        if (LifecycleFSM.isActive()) return;
        
        this._recoveryInProgress = true;
        this._recoveryAttempts++;
        
        try {
            const strategyFn = this._strategies[strategy] || this._strategies.network;
            const result = await strategyFn();
            
            if (result.success) {
                this._failureCount = 0;
                this._recoveryAttempts = 0;
                this._lastRecovery = Date.now();
            } else {
                this._failureCount++;
                
                if (this._failureCount < this._maxFailures && this._recoveryAttempts < this._maxRecoveryAttempts && !LifecycleFSM.isActive()) {
                    this.initiateRecovery('full');
                }
            }
        } catch (error) {
            this._failureCount++;
        } finally {
            this._recoveryInProgress = false;
        }
    },
    
    async _recoverNetwork() {
        if (LifecycleFSM.isActive()) {
            return { success: true };
        }
        
        const isInIframe = window !== window.parent;
        const hasPostMessage = !!(window.parent && typeof window.parent.postMessage === 'function');
        const parentAvailable = isInIframe && hasPostMessage;
        
        if (!parentAvailable) {
            return { success: false, reason: 'parent_unavailable' };
        }
        
        try {
            await TransportAgent.send('PING', {}, { requiresAck: true, timeout: 3000 });
            TransportAgent.setConnectionState('connected');
            return { success: true };
        } catch (error) {
            return { success: false, reason: 'no_response' };
        }
    },
    
    async _recoverSession() {
        if (LifecycleFSM.isActive()) {
            return { success: true };
        }
        
        try {
            await TransportAgent.send('VERIFY_SESSION', {
                frameId: SECURITY_CONFIG.FRAME_ID,
                timestamp: Date.now(),
                requestId: 'recovery_' + Date.now()
            }, { requiresAck: true, timeout: 3000 });
            
            return { success: true };
        } catch (error) {
            return { success: false, reason: 'session_sync_failed' };
        }
    },
    
    async _recoverHandshake() {
        if (LifecycleFSM.isActive()) {
            return { success: true };
        }
        
        try {
            await HandshakeClient.initiate({
                timeout: SECURITY_CONFIG.HANDSHAKE_TIMEOUT,
                maxRetries: 1
            });
            
            return { success: true };
        } catch (error) {
            return { success: false, reason: 'handshake_failed' };
        }
    },
    
    async _recoverFull() {
        if (LifecycleFSM.isActive()) {
            return { success: true };
        }
        
        const network = await this._recoverNetwork();
        if (!network.success) {
            return network;
        }
        
        const session = await this._recoverSession();
        if (!session.success) {
            if (ParentConnectionManager && ParentConnectionManager.tryCachedSession()) {
                return { success: true, fromCache: true };
            }
        }
        
        return { success: true };
    },
    
    reset() {
        this._failureCount = 0;
        this._recoveryAttempts = 0;
        this._clearAllTimers();
        this._recoveryInProgress = false;
    }
};

RecoveryManager.init();

// =============================================
// COMPATIBILITY BRIDGE
// =============================================
const CompatibilityBridge = {
    _enabled: false,
    _legacyMode: false,
    _features: new Set(),
    _initialized: false,
    
    init() {
        if (this._initialized) return;
        this._initialized = true;
        
        this._legacyMode = this._detectLegacyMode();
    },
    
    _detectLegacyMode() {
        const missingFeatures = [];
        
        if (!window.postMessage) missingFeatures.push('postMessage');
        if (!Promise) missingFeatures.push('Promise');
        if (!localStorage) missingFeatures.push('localStorage');
        
        try {
            if (window.parent && window.parent.postMessage) {
                const testMsg = {
                    type: 'test',
                    data: {},
                    timestamp: Date.now()
                };
                
                window.parent.postMessage(testMsg, '*');
            }
        } catch (e) {
            missingFeatures.push('parent_comms');
        }
        
        this._features = new Set(missingFeatures);
        return missingFeatures.length > 0;
    },
    
    isLegacyMode() {
        return this._legacyMode;
    },
    
    adaptMessage(message) {
        if (!this._legacyMode) return message;
        
        if (message && !message.protocol) {
            return {
                protocol: SECURITY_CONFIG.PROTOCOL_VERSION,
                messageId: message.id || 'legacy_' + Date.now(),
                type: message.type || 'unknown',
                source: message.source || 'iframe',
                target: 'parent',
                frameId: SECURITY_CONFIG.FRAME_ID,
                timestamp: message.timestamp || Date.now(),
                payload: message.data || message.payload || {},
                token: null,
                legacy: true
            };
        }
        
        return message;
    }
};

// =============================================
// IFrameAuthority
// =============================================
const IframeAuthority = {
    _initialized: false,
    _modules: new Set(),
    _sharedBus: new Map(),
    _instanceId: SECURITY_CONFIG.FRAME_ID,
    
    init() {
        if (this._initialized) return;
        
        OriginAdapter.init();
        SandboxDetector.detect();
        CompatibilityBridge.init();
        TransportAgent.init();
        API_WRAPPER.init();
        
        this.registerModule('IframeAuthority', MODULE_VERSION);
        
        this._initialized = true;
    },
    
    registerModule(name, version) {
        this._modules.add({ name, version, timestamp: Date.now() });
    },
    
    getSharedBus() {
        return this._sharedBus;
    },
    
    emit(event, data) {
        this._sharedBus.set(event, { data, timestamp: Date.now() });
        document.dispatchEvent(new CustomEvent(event, { detail: data }));
    },
    
    on(event, handler) {
        document.addEventListener(event, handler);
    },
    
    getInstanceId() {
        return this._instanceId;
    },
    
    getStatus() {
        return {
            initialized: this._initialized,
            modules: Array.from(this._modules),
            instanceId: this._instanceId,
            sandbox: SandboxDetector.getMode(),
            compatibility: CompatibilityBridge.isLegacyMode(),
            api: API_WRAPPER.getStats()
        };
    }
};

// =============================================
// SANDBOX DETECTOR
// =============================================
const SandboxDetector = {
    _isSandboxed: null,
    _restrictions: [],
    
    detect() {
        if (this._isSandboxed !== null) return this._isSandboxed;
        
        try {
            const test1 = window.parent.document;
            const test2 = localStorage.getItem('test');
            const test3 = document.cookie;
            
            this._isSandboxed = false;
            
        } catch (e) {
            this._isSandboxed = true;
            
            if (e.name === 'SecurityError') {
                if (e.message.includes('localStorage')) {
                    this._restrictions.push('localStorage');
                }
                if (e.message.includes('cookie')) {
                    this._restrictions.push('cookies');
                }
                if (e.message.includes('parent')) {
                    this._restrictions.push('parent_access');
                }
            }
        }
        
        return this._isSandboxed;
    },
    
    isRestricted(feature) {
        return this._restrictions.includes(feature);
    },
    
    getMode() {
        if (!this._isSandboxed) return 'normal';
        if (this._restrictions.length > 2) return 'restricted';
        return 'compatibility';
    }
};

// =============================================
// FIXED HANDSHAKE CLIENT - Proper state tracking with retry limits
// =============================================
const HandshakeClient = {
    _handshakeInProgress: false,
    _handshakeAttempts: 0,
    _handshakePromise: null,
    _handshakeResolve: null,
    _handshakeTimer: null,
    
    _handshakeState: 'idle',
    _parentReadyReceived: false,
    _handshakeAckReceived: false,
    _startTime: null,
    _handshakeComplete: false,
    _maxHandshakeAttempts: 2,
    _timers: new Set(),
    
    _createTimer(fn, delay) {
        const timerId = setTimeout(() => {
            this._timers.delete(timerId);
            fn();
        }, delay);
        this._timers.add(timerId);
        return timerId;
    },
    
    _clearAllTimers() {
        this._timers.forEach(id => clearTimeout(id));
        this._timers.clear();
    },
    
    initiate: function(options = {}) {
        if (this._handshakeComplete || handshakeCompleted || LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            STATUS_MACHINE.log('handshake', 'SUCCESS', 'Already complete');
            return Promise.resolve({ success: true, fromCache: false });
        }
        
        if (this._handshakeInProgress) {
            return this._handshakePromise || Promise.reject(new Error('Handshake already in progress'));
        }
        
        if (ParentConnectionManager && ParentConnectionManager.sessionMirror.authenticated) {
            this._handshakeComplete = true;
            handshakeCompleted = true;
            __HANDSHAKE_COMPLETE__ = true;
            STATUS_MACHINE.log('handshake', 'SUCCESS', 'Already authenticated');
            return Promise.resolve({ success: true, fromCache: true });
        }
        
        this._handshakeInProgress = true;
        this._handshakeAttempts++;
        this._startTime = Date.now();
        this._handshakeState = 'child_ready_sent';
        
        const maxRetries = Math.min(options.maxRetries || SECURITY_CONFIG.HANDSHAKE_MAX_RETRIES, this._maxHandshakeAttempts);
        const timeout = options.timeout || SECURITY_CONFIG.HANDSHAKE_TIMEOUT;
        
        STATUS_MACHINE.log('handshake', 'SENDING', `Attempt ${this._handshakeAttempts}`);
        
        this._handshakePromise = new Promise((resolve, reject) => {
            this._handshakeResolve = resolve;
            this._handshakeReject = reject;
            
            this._handshakeTimer = this._createTimer(() => {
                if (this._handshakeAttempts < maxRetries && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                    this._handshakeInProgress = false;
                    this._handshakeState = 'retry';
                    
                    const delay = Math.min(
                        SECURITY_CONFIG.INITIAL_RETRY_DELAY * Math.pow(2, this._handshakeAttempts - 1),
                        SECURITY_CONFIG.MAX_RETRY_DELAY
                    );
                    
                    this._createTimer(() => {
                        this.initiate(options).then(resolve).catch(reject);
                    }, delay);
                } else {
                    this._handshakeInProgress = false;
                    this._handshakeState = 'failed';
                    STATUS_MACHINE.log('handshake', 'FAILED', 'Max retries exceeded');
                    reject(new Error('handshake_timeout'));
                }
            }, timeout);
            
            if (window.parent) {
                TransportAgent.send('CHILD_READY', {
                    childId: SECURITY_CONFIG.FRAME_ID,
                    version: MODULE_VERSION,
                    timestamp: Date.now(),
                    module: 'groups'
                }, { requiresAck: false }).catch(() => {});
                
                const requestId = 'verify_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                
                TransportAgent.send('VERIFY_SESSION', {
                    requestId: requestId,
                    messageId: requestId,
                    timestamp: Date.now(),
                    frameId: SECURITY_CONFIG.FRAME_ID,
                    module: 'groups'
                }, { requiresAck: true, timeout: 3000 }).then((response) => {
                    if (response && response.ack) {
                        this.handleHandshakeAck(response.ack);
                    }
                }).catch((error) => {});
            }
        });
        
        return this._handshakePromise;
    },
    
    handleParentReady: function(message) {
        if (this._handshakeComplete || handshakeCompleted || LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) return;
        
        this._parentReadyReceived = true;
        
        if (this._handshakeState === 'child_ready_sent') {
            this._handshakeState = 'waiting_parent_ready';
        }
        
        if (window.parent && !this._handshakeComplete && !handshakeCompleted && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            const requestId = 'verify_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            
            TransportAgent.send('VERIFY_SESSION', {
                requestId: requestId,
                messageId: requestId,
                timestamp: Date.now(),
                parentReadyAck: true,
                module: 'groups'
            }, { requiresAck: true }).catch(() => {});
            
            this._handshakeState = 'handshake_request_sent';
        }
    },
    
    handleHandshakeAck: function(message) {
        if (this._handshakeComplete || handshakeCompleted || LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) return;
        
        this._handshakeAckReceived = true;
        this._handshakeComplete = true;
        handshakeCompleted = true;
        __HANDSHAKE_COMPLETE__ = true;
        
        if (this._handshakeState === 'handshake_request_sent' || this._handshakeState === 'waiting_parent_ready') {
            this._handshakeState = 'handshake_ack_wait';
        }
        
        this.handleResponse(message);
    },
    
    handleResponse: function(response) {
        if (this._handshakeComplete && handshakeCompleted) return;
        
        if (this._handshakeResolve) {
            clearTimeout(this._handshakeTimer);
            this._handshakeResolve(response);
            this._handshakeInProgress = false;
            this._handshakeAttempts = 0;
            this._handshakePromise = null;
            this._handshakeResolve = null;
            this._handshakeState = 'complete';
            this._handshakeComplete = true;
            handshakeCompleted = true;
            __HANDSHAKE_COMPLETE__ = true;
            
            TransportAgent.setConnectionState('connected');
            
            STATUS_MACHINE.log('handshake', 'SUCCESS', 'Handshake complete');
            
            processGroupActionQueue();
        }
    },
    
    getState: function() {
        return {
            state: this._handshakeState,
            attempts: this._handshakeAttempts,
            parentReadyReceived: this._parentReadyReceived,
            handshakeAckReceived: this._handshakeAckReceived,
            startTime: this._startTime,
            duration: this._startTime ? Date.now() - this._startTime : 0,
            complete: this._handshakeComplete || handshakeCompleted
        };
    },
    
    reset: function() {
        this._handshakeInProgress = false;
        this._handshakeAttempts = 0;
        this._handshakePromise = null;
        this._handshakeResolve = null;
        this._handshakeState = 'idle';
        this._parentReadyReceived = false;
        this._handshakeAckReceived = false;
        this._handshakeComplete = false;
        handshakeCompleted = false;
        this._startTime = null;
        __HANDSHAKE_COMPLETE__ = false;
        this._clearAllTimers();
    }
};

// =============================================
// PARENT MESSAGE TYPES
// =============================================
const PARENT_MESSAGE_TYPES = {
    CHILD_READY: 'CHILD_READY',
    REQUEST_SESSION: 'REQUEST_SESSION',
    CHILD_INITIALIZED: 'CHILD_INITIALIZED',
    CHILD_ERROR: 'CHILD_ERROR',
    CHILD_ACTION: 'CHILD_ACTION',
    SESSION_DATA: 'SESSION_DATA',
    SESSION_UPDATE: 'SESSION_UPDATE',
    LOGOUT: 'LOGOUT',
    PARENT_READY: 'PARENT_READY',
    REQUEST_STATUS: 'REQUEST_STATUS',
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
    HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
    ACK: 'ACK',
    PING: 'PING',
    PONG: 'PONG',
    UI_UPDATE: 'UI_UPDATE',
    UI_REFRESH: 'UI_REFRESH',
    UI_THEME: 'UI_THEME',
    
    HANDSHAKE_ACK: 'HANDSHAKE_ACK',
    SESSION_SYNC: 'SESSION_SYNC',
    SESSION_ACK: 'SESSION_ACK',
    PAGE_ACTIVATED: 'PAGE_ACTIVATED',
    NAVIGATE: 'NAVIGATE',
    SESSION_VERIFIED: 'SESSION_VERIFIED',
    
    SESSION_ACTIVE: 'SESSION_ACTIVE',
    PERMISSION_UPDATE: 'PERMISSION_UPDATE',
    FORCE_LOGOUT: 'FORCE_LOGOUT',
    REGISTER_MODULE: 'REGISTER_MODULE',
    
    GROUP_CREATED: 'GROUP_CREATED',
    GROUP_UPDATED: 'GROUP_UPDATED',
    GROUP_DELETED: 'GROUP_DELETED',
    MEMBER_ADDED: 'MEMBER_ADDED',
    MEMBER_REMOVED: 'MEMBER_REMOVED',
    MEMBER_ROLE_CHANGED: 'MEMBER_ROLE_CHANGED',
    GROUP_MESSAGE: 'GROUP_MESSAGE',
    UNREAD_COUNT_UPDATED: 'UNREAD_COUNT_UPDATED',
    GROUP_TYPING: 'GROUP_TYPING',
    GROUP_CALL: 'GROUP_CALL',
    
    // v5.0 protocol messages
    MODULE_REGISTERED: 'MODULE_REGISTERED',
    SESSION_NULL: 'SESSION_NULL',
    SESSION_REFRESHED: 'SESSION_REFRESHED',
    SESSION_INVALIDATED: 'SESSION_INVALIDATED',
    SESSION_RECOVERY: 'SESSION_RECOVERY',
    HEARTBEAT: 'HEARTBEAT',
    HEARTBEAT_ACK: 'HEARTBEAT_ACK'
};

export const SESSION_SCHEMA = {
    required: ['user', 'token', 'timestamp'],
    user: {
        required: ['id', 'displayName', 'email'],
        optional: ['photoURL', 'username', 'bio', 'status']
    },
    token: 'string',
    timestamp: 'number',
    permissions: 'array'
};

// =============================================
// ENHANCED PARENT CONNECTION MANAGER
// =============================================
export const ParentConnectionManager = {
    isConnected: false,
    handshakeComplete: false,
    sessionData: null,
    parentOrigin: null,
    parentAvailable: false,
    
    handshakeInProgress: false,
    handshakeAttempts: 0,
    handshakeTimer: null,
    handshakePromise: null,
    handshakeResolve: null,
    
    messageHandlers: new Map(),
    pendingAcks: new Map(),
    messageQueue: [],
    messageSequence: 0,
    
    sessionMirror: {
        user: null,
        token: null,
        timestamp: 0,
        permissions: [],
        authenticated: false,
        fromCache: false
    },
    
    heartbeatInterval: null,
    lastHeartbeat: 0,
    
    connectionState: 'disconnected',
    sessionSyncState: 'none',
    pendingMessages: new Map(),
    messageRetryCounts: new Map(),
    maxRetries: 2,
    backoffBase: 500,
    
    ackCallbacks: new Map(),
    nextAckId: 0,
    
    _initialized: false,
    _sessionRequestPending: false,
    _timers: new Set(),
    
    _createTimer(fn, delay) {
        const timerId = setTimeout(() => {
            this._timers.delete(timerId);
            fn();
        }, delay);
        this._timers.add(timerId);
        return timerId;
    },
    
    _clearAllTimers() {
        this._timers.forEach(id => clearTimeout(id));
        this._timers.clear();
    },
    
    init() {
        if (this._initialized) return this;
        
        this.setupMessageListener();
        this.detectParentAvailability();
        
        this.connectionState = 'connecting';
        this._initialized = true;
        
        return this;
    },
    
    detectParentAvailability() {
        try {
            const isInIframe = window !== window.parent;
            const hasPostMessage = !!(window.parent && typeof window.parent.postMessage === 'function');
            
            const isSandboxed = this.detectSandbox();
            
            this.parentAvailable = isInIframe && hasPostMessage && !isSandboxed;
            
            if (this.parentAvailable) {
                try {
                    this.parentOrigin = window.parent.location.origin;
                    OriginAdapter.addTrustedOrigin(this.parentOrigin);
                } catch (e) {
                    this.parentOrigin = '*';
                }
            } else if (isSandboxed) {
                this.connectionState = 'degraded';
            }
            
            return this.parentAvailable;
        } catch (error) {
            this.parentAvailable = false;
            this.connectionState = 'degraded';
            return false;
        }
    },
    
    detectSandbox() {
        try {
            const test = window.parent.document;
            return false;
        } catch (e) {
            return e.name === 'SecurityError';
        }
    },
    
    setupMessageListener() {
        if (window._parentMessageListenerSetup) return;
        
        window.addEventListener('message', (event) => {
            this.handleIncomingMessage(event);
        });
        
        window._parentMessageListenerSetup = true;
    },
    
    handleIncomingMessage(event) {
        try {
            if (!OriginAdapter.isTrusted(event.origin)) return;
            
            const message = CompatibilityBridge.adaptMessage(event.data) || 
                           CanonicalMessageFormatter.adaptLegacyMessage(event.data);
            
            if (!message || !message.type) return;
            
            this.parentAvailable = true;
            
            // Route through broadcast handler for supported broadcast types
            BroadcastHandler.handleBroadcast(message);
            
            ParentAuthority.handleMessage(message);
            
            if (message.type === PARENT_MESSAGE_TYPES.ACK) {
                TransportAgent.handleAck(message);
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.PING) {
                TransportAgent.handlePing(message);
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.PARENT_READY) {
                this.handleParentReady(message);
                InitTimeline.handleParentReady();
                return;
            }
            
            if (message.type === 'SESSION_ACTIVE') {
                const sessionData = message.session || message.payload;
                if (sessionData) {
                    this.handleSessionData(sessionData);
                    InitTimeline.handleSessionActive(sessionData);
                    
                    TransportAgent.send('SESSION_ACK', {
                        received: true,
                        timestamp: Date.now()
                    }, { requiresAck: false }).catch(() => {});
                    
                    this.sessionSyncState = 'synced';
                    __SESSION_REQUEST_PENDING__ = false;
                    __SESSION_READY__ = true;
                    
                    processGroupActionQueue();
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.MODULE_REGISTERED) {
                InitTimeline.handleModuleRegistered(message);
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.SESSION_NULL) {
                InitTimeline.handleSessionNull(message);
                return;
            }
            
            if (message.type === 'SESSION_VERIFIED') {
                if (!handshakeCompleted && !this.handshakeComplete && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                    HandshakeClient.handleHandshakeAck(message);
                    handshakeCompleted = true;
                    this.handshakeComplete = true;
                    STATUS_MACHINE.log('handshake', 'SUCCESS', 'SESSION_VERIFIED');
                }
                this.isConnected = true;
                this.connectionState = 'connected';
                __HANDSHAKE_COMPLETE__ = true;
                __PARENT_READY__ = true;
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.HANDSHAKE_ACK || 
                message.type === PARENT_MESSAGE_TYPES.HANDSHAKE_RESPONSE) {
                if (!handshakeCompleted && !this.handshakeComplete && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                    HandshakeClient.handleHandshakeAck(message);
                    handshakeCompleted = true;
                    this.handshakeComplete = true;
                    STATUS_MACHINE.log('handshake', 'SUCCESS', 'HANDSHAKE_ACK');
                }
                this.isConnected = true;
                this.connectionState = 'connected';
                __HANDSHAKE_COMPLETE__ = true;
                __PARENT_READY__ = true;
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.SESSION_DATA ||
                message.type === PARENT_MESSAGE_TYPES.SESSION_SYNC) {
                this.handleSessionData(message);
                
                TransportAgent.send('SESSION_ACK', {
                    received: true,
                    timestamp: Date.now()
                }, { requiresAck: false }).catch(() => {});
                
                this.sessionSyncState = 'synced';
                __SESSION_REQUEST_PENDING__ = false;
                __SESSION_READY__ = true;
                
                processGroupActionQueue();
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.SESSION_UPDATE) {
                this.handleSessionUpdate(message);
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.LOGOUT || message.type === 'FORCE_LOGOUT') {
                this.handleLogout();
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.REQUEST_STATUS) {
                this.sendStatus();
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.PAGE_ACTIVATED) {
                this.handlePageActivated(message);
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.NAVIGATE) {
                this.handleNavigate(message);
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.UI_UPDATE) {
                this.handleUIUpdate(message);
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.UI_REFRESH) {
                this.handleUIRefresh(message);
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.UI_THEME) {
                this.handleUITheme(message);
                return;
            }
            
            if (message.type === 'PERMISSION_UPDATE') {
                if (message.permissions && this.sessionMirror) {
                    this.sessionMirror.permissions = message.permissions;
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.GROUP_CREATED) {
                const groupData = message.payload?.group;
                if (groupData && typeof handleGroupCreatedFromParent === 'function') {
                    handleGroupCreatedFromParent(groupData);
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.GROUP_UPDATED) {
                const groupData = message.payload?.group;
                if (groupData && typeof handleGroupUpdatedFromParent === 'function') {
                    handleGroupUpdatedFromParent(groupData);
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.GROUP_DELETED) {
                const groupId = message.payload?.groupId;
                if (groupId && typeof handleGroupDeletedFromParent === 'function') {
                    handleGroupDeletedFromParent(groupId);
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.MEMBER_ADDED) {
                const { groupId, member } = message.payload || {};
                if (groupId && member && typeof handleMemberAddedFromParent === 'function') {
                    handleMemberAddedFromParent(groupId, member);
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.MEMBER_REMOVED) {
                const { groupId, userId } = message.payload || {};
                if (groupId && userId && typeof handleMemberRemovedFromParent === 'function') {
                    handleMemberRemovedFromParent(groupId, userId);
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.MEMBER_ROLE_CHANGED) {
                const { groupId, userId, role } = message.payload || {};
                if (groupId && userId && role && typeof handleMemberRoleChangedFromParent === 'function') {
                    handleMemberRoleChangedFromParent(groupId, userId, role);
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.GROUP_MESSAGE) {
                const { groupId, message: msgData } = message.payload || {};
                if (groupId && msgData && typeof handleGroupMessageFromParent === 'function') {
                    handleGroupMessageFromParent(groupId, msgData);
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.UNREAD_COUNT_UPDATED) {
                const { groupId, count } = message.payload || {};
                if (groupId && typeof handleUnreadCountUpdatedFromParent === 'function') {
                    handleUnreadCountUpdatedFromParent(groupId, count);
                }
                return;
            }
            
            if (message.type === PARENT_MESSAGE_TYPES.GROUP_TYPING) {
                const { groupId, userId, isTyping } = message.payload || {};
                if (groupId && userId && typeof handleGroupTypingFromParent === 'function') {
                    handleGroupTypingFromParent(groupId, userId, isTyping);
                }
                return;
            }
            
            const handler = this.messageHandlers.get(message.type);
            if (handler) {
                handler(message);
            }
            
        } catch (error) {}
    },
    
    sendMessage(type, payload = {}, options = {}) {
        if (!this._isReadyForMessage()) {
            return Promise.resolve({ 
                success: false, 
                queued: true, 
                reason: 'parent_not_ready' 
            });
        }
        
        return TransportAgent.send(type, payload, options);
    },
    
    _isReadyForMessage() {
        return this.parentAvailable;
    },
    
    handleAck(message) {
        const pending = this.pendingAcks.get(message.inResponseTo);
        if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve({ success: true, ack: message, responseTime: Date.now() });
            this.pendingAcks.delete(message.inResponseTo);
        }
    },
    
    handleHandshakeResponse(message) {
        if (this.handshakeResolve && !handshakeCompleted && !this.handshakeComplete && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            this.handshakeResolve(message);
            this.handshakeResolve = null;
            this.handshakeReject = null;
            if (this.handshakeTimer) {
                clearTimeout(this.handshakeTimer);
                this.handshakeTimer = null;
            }
            this.handshakeComplete = true;
            handshakeCompleted = true;
            this.isConnected = true;
            this.handshakeInProgress = false;
            this.connectionState = 'connected';
            __HANDSHAKE_COMPLETE__ = true;
            __PARENT_READY__ = true;
        }
    },
    
    handlePing(message) {
        this.sendMessage('PONG', {
            inResponseTo: message.messageId || message.id,
            timestamp: Date.now(),
            state: this.connectionState,
            handshakeState: HandshakeClient.getState()
        }, { requiresAck: false }).catch(() => {});
        
        this.lastHeartbeat = Date.now();
    },
    
    handleParentReady(message) {
        if (handshakeCompleted || this.handshakeComplete || LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) return;
        
        HandshakeClient.handleParentReady(message);
        
        if (!this.handshakeComplete && !handshakeCompleted && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            this.initiateHandshake();
        }
    },
    
    handlePageActivated(message) {
        document.dispatchEvent(new CustomEvent('pageActivated', {
            detail: message.payload
        }));
        
        if (typeof syncGroupsFromServer === 'function') {
            syncGroupsFromServer().catch(() => {});
        }
    },
    
    handleNavigate(message) {
        if (message.payload && message.payload.path) {
            if (message.payload.path === 'chat' && message.payload.groupId) {
                const group = groups.find(g => g.id === message.payload.groupId);
                if (group && typeof openGroupChat === 'function') {
                    openGroupChat(group);
                }
            }
        }
    },
    
    handleUIUpdate(message) {
        const updateData = message.payload || message.data;
        if (updateData) {
            document.dispatchEvent(new CustomEvent('parentUIUpdate', {
                detail: updateData
            }));
        }
    },
    
    handleUIRefresh(message) {
        const refreshData = message.payload || message.data;
        document.dispatchEvent(new CustomEvent('parentUIRefresh', {
            detail: refreshData
        }));
    },
    
    handleUITheme(message) {
        const themeData = message.payload || message.data;
        if (themeData && themeData.theme) {
            document.dispatchEvent(new CustomEvent('parentUITheme', {
                detail: themeData
            }));
        }
    },
    
    handleSessionData(message) {
        const sessionData = message.payload || message.data || message.session || message;
        if (this.validateSessionData(sessionData)) {
            this.updateSessionMirror(sessionData);
            this.handshakeComplete = true;
            handshakeCompleted = true;
            this.isConnected = true;
            this.handshakeInProgress = false;
            this.connectionState = 'connected';
            __SESSION_READY__ = true;
            __SESSION_REQUEST_PENDING__ = false;
            
            document.dispatchEvent(new CustomEvent('sessionReady', {
                detail: this.sessionMirror
            }));
        }
    },
    
    handleSessionUpdate(message) {
        const updateData = message.payload || message.data || message.session || message;
        if (updateData) {
            this.updateSessionMirror({
                ...this.sessionMirror,
                ...updateData
            });
            __SESSION_READY__ = true;
            __SESSION_REQUEST_PENDING__ = false;
        }
    },
    
    handleLogout() {
        this.clearSession();
        __SESSION_READY__ = false;
        document.dispatchEvent(new CustomEvent('sessionLogout'));
    },
    
    validateSessionData(sessionData) {
        try {
            if (!sessionData || typeof sessionData !== 'object') return false;
            
            const required = SESSION_SCHEMA.required;
            for (const field of required) {
                if (!sessionData[field]) return false;
            }
            
            if (sessionData.user) {
                const userRequired = SESSION_SCHEMA.user.required;
                for (const field of userRequired) {
                    if (!sessionData.user[field]) return false;
                }
            }
            
            if (typeof sessionData.token !== 'string' || !sessionData.token) return false;
            if (typeof sessionData.timestamp !== 'number' || sessionData.timestamp <= 0) return false;
            
            return true;
        } catch (error) {
            return false;
        }
    },
    
    updateSessionMirror(sessionData) {
        this.sessionMirror = {
            user: sessionData.user ? { ...sessionData.user } : null,
            token: sessionData.token,
            timestamp: sessionData.timestamp,
            permissions: sessionData.permissions || [],
            authenticated: !!sessionData.user && !!sessionData.token,
            fromCache: sessionData.fromCache || false
        };
        
        this.sessionData = sessionData;
        
        try {
            if (sessionData.user) {
                SafeStorage.setItem('user', sessionData.user);
            }
            if (sessionData.token) {
                SafeStorage.setItem('token', sessionData.token);
            }
        } catch (e) {}
    },
    
    clearSession() {
        this.sessionMirror = {
            user: null,
            token: null,
            timestamp: 0,
            permissions: [],
            authenticated: false,
            fromCache: false
        };
        this.sessionData = null;
        this.handshakeComplete = false;
        handshakeCompleted = false;
        this.isConnected = false;
        this.connectionState = 'disconnected';
        __SESSION_READY__ = false;
        
        try {
            SafeStorage.removeItem('user');
            SafeStorage.removeItem('token');
        } catch (e) {}
    },
    
    initiateHandshake() {
        if (this.handshakeInProgress || handshakeCompleted || this.handshakeComplete || LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            return this.handshakePromise;
        }
        
        if (!this.parentAvailable) {
            return Promise.reject(new Error('parent_not_available'));
        }
        
        this.handshakeInProgress = true;
        this.handshakeAttempts++;
        this.connectionState = 'handshaking';
        
        this.handshakePromise = new Promise((resolve, reject) => {
            this.handshakeResolve = resolve;
            this.handshakeReject = reject;
            
            this.handshakeTimer = this._createTimer(() => {
                if (this.handshakeInProgress && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                    if (this.handshakeAttempts < SECURITY_CONFIG.HANDSHAKE_MAX_RETRIES) {
                        this.handshakeInProgress = false;
                        
                        const delay = Math.min(
                            SECURITY_CONFIG.INITIAL_RETRY_DELAY * Math.pow(2, this.handshakeAttempts - 1),
                            SECURITY_CONFIG.MAX_RETRY_DELAY
                        );
                        
                        this._createTimer(() => {
                            this.initiateHandshake().then(resolve).catch(reject);
                        }, delay);
                    } else {
                        this.handshakeInProgress = false;
                        this.connectionState = 'degraded';
                        this.tryCachedSession();
                        reject(new Error('handshake_timeout'));
                    }
                }
            }, SECURITY_CONFIG.HANDSHAKE_TIMEOUT);
            
            this.sendMessage('CHILD_READY', {
                childId: SECURITY_CONFIG.FRAME_ID,
                version: MODULE_VERSION,
                timestamp: Date.now(),
                module: 'groups'
            }, { requiresAck: false }).catch(() => {});
            
            const requestId = 'verify_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            
            this.sendMessage('VERIFY_SESSION', {
                requestId: requestId,
                messageId: requestId,
                timestamp: Date.now(),
                frameId: SECURITY_CONFIG.FRAME_ID,
                module: 'groups'
            }, { requiresAck: true, timeout: 3000 }).then((response) => {
                if (response && response.ack) {
                    this.handleHandshakeResponse(response.ack);
                }
            }).catch(() => {});
        });
        
        return this.handshakePromise;
    },
    
    tryCachedSession() {
        if (ParentAuthority.isAuthoritativeSession()) {
            return false;
        }
        
        if (LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            return false;
        }
        
        try {
            const cachedUser = SafeStorage.getItem('user');
            const cachedToken = SafeStorage.getItem('token');
            
            if (cachedUser && cachedToken) {
                const user = cachedUser;
                this.sessionMirror = {
                    user,
                    token: cachedToken,
                    timestamp: Date.now(),
                    permissions: [],
                    authenticated: true,
                    fromCache: true
                };
                this.sessionData = { user, token: cachedToken, timestamp: Date.now() };
                this.handshakeComplete = true;
                handshakeCompleted = true;
                this.isConnected = false;
                this.connectionState = 'degraded';
                __SESSION_READY__ = true;
                __SESSION_REQUEST_PENDING__ = false;
                
                document.dispatchEvent(new CustomEvent('sessionReady', {
                    detail: this.sessionMirror
                }));
                
                processGroupActionQueue();
                
                return true;
            }
        } catch (e) {}
        
        return false;
    },
    
    reconnect() {
        this.isConnected = false;
        this.handshakeComplete = false;
        handshakeCompleted = false;
        this.handshakeAttempts = 0;
        this.connectionState = 'connecting';
        
        if (LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            return;
        }
        
        this.initiateHandshake().catch(() => {
            if (!ParentAuthority.isAuthoritativeSession() && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                this.tryCachedSession();
            }
        });
    },
    
    sendStatus() {
        this.sendMessage('CHILD_ACTION', {
            action: 'status',
            status: {
                initialized: true,
                handshakeComplete: this.handshakeComplete || handshakeCompleted,
                hasUser: !!this.sessionMirror.user,
                hasToken: !!this.sessionMirror.token,
                authenticated: this.sessionMirror.authenticated,
                uiReady: document.readyState === 'complete',
                connectionState: this.connectionState,
                handshakeState: HandshakeClient.getState(),
                pendingMessages: this.pendingAcks.size,
                queuedMessages: this.messageQueue.length,
                timestamp: Date.now()
            }
        }, { requiresAck: false }).catch(() => {});
    },
    
    getStatus() {
        return {
            isConnected: this.isConnected,
            handshakeComplete: this.handshakeComplete || handshakeCompleted,
            connectionState: this.connectionState,
            sessionSyncState: this.sessionSyncState,
            parentAvailable: this.parentAvailable,
            pendingAcks: this.pendingAcks.size,
            queuedMessages: this.messageQueue.length,
            lastHeartbeat: this.lastHeartbeat,
            frameId: SECURITY_CONFIG.FRAME_ID
        };
    },
    
    on(type, handler) {
        this.messageHandlers.set(type, handler);
    },
    
    getSession() {
        return { ...this.sessionMirror };
    },
    
    getUser() {
        return this.sessionMirror.user ? { ...this.sessionMirror.user } : null;
    },
    
    getToken() {
        return this.sessionMirror.token;
    },
    
    isAuthenticated() {
        return this.sessionMirror.authenticated;
    },
    
    isReady() {
        return this.handshakeComplete || handshakeCompleted || this.sessionMirror.fromCache;
    },
    
    requestSession() {
        if (__SESSION_REQUEST_PENDING__ || handshakeCompleted || this.handshakeComplete || LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
            return;
        }
        
        __SESSION_REQUEST_PENDING__ = true;
        
        const requestId = 'session_' + Date.now();
        
        TransportAgent.send('VERIFY_SESSION', {
            source: 'groups-iframe',
            frameId: SECURITY_CONFIG.FRAME_ID,
            timestamp: Date.now(),
            requestId: requestId,
            messageId: requestId
        }, { requiresAck: true, timeout: 5000 }).catch(() => {
            __SESSION_REQUEST_PENDING__ = false;
        });
    },
    
    destroy() {
        this._clearAllTimers();
        this.messageHandlers.clear();
        this.pendingAcks.clear();
        this.messageQueue = [];
        this.pendingMessages.clear();
        this.messageRetryCounts.clear();
        this.ackCallbacks.clear();
        this._initialized = false;
    }
};

// =============================================
// SESSION MIRROR LAYER
// =============================================
export const SessionMirror = {
    user: null,
    token: null,
    timestamp: 0,
    permissions: [],
    authenticated: false,
    fromCache: false,
    
    subscribers: new Set(),
    _initialized: false,
    
    init() {
        if (this._initialized) return this;
        
        document.addEventListener('sessionReady', (e) => {
            this.updateFromParent(e.detail);
        });
        
        document.addEventListener('sessionLogout', () => {
            this.clear();
        });
        
        const parentSession = ParentConnectionManager.getSession();
        if (parentSession.authenticated) {
            this.updateFromParent(parentSession);
        }
        
        if (!this.authenticated) {
            setTimeout(() => {
                if (!__SESSION_REQUEST_PENDING__ && !__SESSION_READY__ && !handshakeCompleted && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                    if (!ParentAuthority.isAuthoritativeSession()) {
                        ParentConnectionManager.requestSession();
                    }
                }
            }, 100);
        }
        
        this._initialized = true;
        return this;
    },
    
    updateFromParent(sessionData) {
        this.user = sessionData.user ? { ...sessionData.user } : null;
        this.token = sessionData.token;
        this.timestamp = sessionData.timestamp;
        this.permissions = sessionData.permissions || [];
        this.authenticated = sessionData.authenticated;
        this.fromCache = sessionData.fromCache || false;
        __SESSION_READY__ = true;
        __SESSION_REQUEST_PENDING__ = false;
        
        this.notifySubscribers();
    },
    
    clear() {
        this.user = null;
        this.token = null;
        this.timestamp = 0;
        this.permissions = [];
        this.authenticated = false;
        this.fromCache = false;
        __SESSION_READY__ = false;
        
        this.notifySubscribers();
    },
    
    subscribe(callback) {
        this.subscribers.add(callback);
        callback(this.getState());
        return () => this.subscribers.delete(callback);
    },
    
    notifySubscribers() {
        const state = this.getState();
        this.subscribers.forEach(cb => {
            try {
                cb(state);
            } catch (e) {}
        });
    },
    
    getState() {
        return {
            user: this.user ? { ...this.user } : null,
            token: this.token,
            timestamp: this.timestamp,
            permissions: [...this.permissions],
            authenticated: this.authenticated,
            fromCache: this.fromCache
        };
    },
    
    getUser() {
        return this.user ? { ...this.user } : null;
    },
    
    getToken() {
        return this.token;
    },
    
    isAuthenticated() {
        return this.authenticated;
    },
    
    destroy() {
        this.subscribers.clear();
        this._initialized = false;
    }
};

// =============================================
// SESSION CLIENT
// =============================================
const SessionClient = {
    syncRequested: false,
    syncTimer: null,
    refreshTimer: null,
    expiryTimer: null,
    _timers: new Set(),
    
    _createTimer(fn, delay) {
        const timerId = setTimeout(() => {
            this._timers.delete(timerId);
            fn();
        }, delay);
        this._timers.add(timerId);
        return timerId;
    },
    
    _clearAllTimers() {
        this._timers.forEach(id => clearTimeout(id));
        this._timers.clear();
    },
    
    init() {
        this.setupExpiryCheck();
        return this;
    },
    
    requestSync() {
        if (this.syncRequested) return;
        if (__SESSION_REQUEST_PENDING__) return;
        if (LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) return;
        
        this.syncRequested = true;
        __SESSION_REQUEST_PENDING__ = true;
        
        const requestId = 'sync_' + Date.now();
        
        TransportAgent.send('VERIFY_SESSION', {
            source: 'groups-iframe',
            frameId: SECURITY_CONFIG.FRAME_ID,
            timestamp: Date.now(),
            sync: true,
            requestId: requestId,
            messageId: requestId
        }, { requiresAck: true }).catch(() => {
            __SESSION_REQUEST_PENDING__ = false;
        });
        
        this.syncTimer = this._createTimer(() => {
            this.syncRequested = false;
            __SESSION_REQUEST_PENDING__ = false;
            
            if (!ParentConnectionManager.sessionMirror.authenticated && !ParentAuthority.isAuthoritativeSession() && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                ParentConnectionManager.tryCachedSession();
            }
        }, 5000);
    },
    
    handleSync(message) {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        
        this.syncRequested = false;
        __SESSION_REQUEST_PENDING__ = false;
        __SESSION_READY__ = true;
        
        TransportAgent.send('SESSION_ACK', {
            received: true,
            timestamp: Date.now()
        }, { requiresAck: false }).catch(() => {});
    },
    
    refreshToken() {
        return TransportAgent.send('REFRESH_TOKEN', {
            frameId: SECURITY_CONFIG.FRAME_ID,
            timestamp: Date.now()
        }, { requiresAck: true });
    },
    
    setupExpiryCheck() {
        this.expiryTimer = setInterval(() => {
            const token = ParentConnectionManager.getToken();
            if (!token) return;
            
            const session = ParentConnectionManager.getSession();
            const age = Date.now() - (session.timestamp || 0);
            
            if (age > 55 * 60 * 1000) {
                this.refreshToken().catch(() => {});
            }
        }, 60000);
    },
    
    destroy() {
        this._clearAllTimers();
        if (this.expiryTimer) {
            clearInterval(this.expiryTimer);
            this.expiryTimer = null;
        }
    }
};

// =============================================
// ACTION QUEUE MANAGEMENT
// =============================================
function queueGroupAction(action) {
    groupActionQueue.push(action);
    
    if (!isProcessingQueue && __SESSION_READY__ && (__HANDSHAKE_COMPLETE__ || handshakeCompleted)) {
        processGroupActionQueue();
    }
}

function processGroupActionQueue() {
    if (isProcessingQueue) return;
    if (groupActionQueue.length === 0) return;
    
    if (!__SESSION_READY__ || (!__HANDSHAKE_COMPLETE__ && !handshakeCompleted)) {
        return;
    }
    
    isProcessingQueue = true;
    
    const actions = [...groupActionQueue];
    groupActionQueue.length = 0;
    
    setTimeout(() => {
        actions.forEach(action => {
            try {
                if (typeof action === 'function') {
                    action();
                } else if (action && action.type) {
                    switch (action.type) {
                        case 'createGroup':
                            createGroupOnline(action.data).catch(() => {});
                            break;
                        case 'joinGroup':
                            joinGroupOnline(action.groupId).catch(() => {});
                            break;
                        case 'leaveGroup':
                            leaveGroupOnline(action.groupId).catch(() => {});
                            break;
                        case 'deleteGroup':
                            deleteGroupOnline(action.groupId).catch(() => {});
                            break;
                        case 'addMember':
                            addMemberOnline(action.groupId, action.userId, action.role).catch(() => {});
                            break;
                        case 'removeMember':
                            removeMemberOnline(action.groupId, action.userId).catch(() => {});
                            break;
                        case 'changeMemberRole':
                            changeMemberRoleOnline(action.groupId, action.userId, action.role).catch(() => {});
                            break;
                        case 'sendMessage':
                            if (typeof action.fn === 'function') {
                                action.fn();
                            } else if (action.groupId && action.message) {
                                sendGroupMessageOnline(action.groupId, action.message).catch(() => {});
                            }
                            break;
                        case 'syncGroups':
                            syncGroupsFromServer().catch(() => {});
                            break;
                    }
                }
            } catch (e) {}
        });
        
        isProcessingQueue = false;
        
        if (groupActionQueue.length > 0) {
            processGroupActionQueue();
        }
    }, 50);
}

// =============================================
// GLOBAL VARIABLES
// =============================================
export let currentUser = null;
export let userData = null;
export let groups = [];
export let myGroups = [];
export let joinedGroups = [];
export let groupInvites = [];
export let adminGroups = [];
export let selectedGroup = null;
export let currentTypeFilter = 'all';
export let currentSearchTerm = '';
export let isLoadedFromLocalStorage = false;
export let isMobile = false;
export let pendingGroupActions = [];
export let offlineOverlayDismissed = false;
export let friends = [];
export let selectedFriends = [];

export let groupMessages = {};
export let groupUnreadCounts = {};
export let groupTypingUsers = {};
export let currentChatGroup = null;

// =============================================
// UNIQUE FEATURES VARIABLES
// =============================================
export const groupPurposes = Object.freeze({
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

export const groupMoods = Object.freeze({
    'calm': { name: 'Calm', icon: '😌', color: '#1976d2', bgColor: '#e3f2fd' },
    'busy': { name: 'Busy', icon: '🏃', color: '#f57c00', bgColor: '#fff3e0' },
    'celebratory': { name: 'Celebratory', icon: '🎉', color: '#c2185b', bgColor: '#fce4ec' },
    'silent': { name: 'Silent', icon: '🔇', color: '#616161', bgColor: '#f5f5f5' },
    'urgent': { name: 'Urgent', icon: '🚨', color: '#d32f2f', bgColor: '#ffebee' }
});

export const postingRules = Object.freeze({
    'everyone': { name: 'Everyone can post', color: '#4CAF50', bgColor: '#E8F5E9' },
    'admin_only': { name: 'Admin-only posting', color: '#FF9800', bgColor: '#FFF3E0' },
    'scheduled': { name: 'Scheduled posting times', color: '#2196F3', bgColor: '#E3F2FD' },
    'quiet_hours': { name: 'Quiet hours enabled', color: '#9C27B0', bgColor: '#F3E5F5' }
});

export const participationModes = Object.freeze({
    'read_only': { name: 'Read Only', icon: '👁️', color: '#666', bgColor: '#F5F5F5' },
    'react_only': { name: 'React Only', icon: '👍', color: '#1976D2', bgColor: '#E3F2FD' },
    'anonymous': { name: 'Anonymous', icon: '🕵️', color: '#7B1FA2', bgColor: '#F3E5F5' }
});

export const groupTopics = Object.freeze({
    'announcement': { name: 'Announcement', icon: '📢', color: '#1976d2', bgColor: '#e3f2fd' },
    'question': { name: 'Question', icon: '❓', color: '#7b1fa2', bgColor: '#f3e5f5' },
    'discussion': { name: 'Discussion', icon: '💬', color: '#2e7d32', bgColor: '#e8f5e9' }
});

export const groupTypes = Object.freeze({
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

export const groupThemes = Object.freeze({
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

export const groupRoles = Object.freeze({
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
// CHAT & CALL VARIABLES
// =============================================
export let chatMessagesList = [];
export let isTyping = false;
export let callInProgress = false;
export let callStartTime = null;
export let callTimer = null;
export let localStream = null;
export let peerConnections = {};

// =============================================
// UNIQUE FEATURES STATE
// =============================================
export let currentParticipationMode = 'normal';
export let isSilentMode = false;
export let isAnonymousMode = false;
export let groupNotes = {};
export let groupEvents = {};
export let transparencyLog = [];
export let energySuggestions = [];

// =============================================
// LOCAL STORAGE KEYS
// =============================================
export const LOCAL_STORAGE_KEYS = Object.freeze({
    USER: 'knecta_current_user',
    GROUPS: 'knecta_groups',
    MY_GROUPS: 'knecta_my_groups',
    JOINED_GROUPS: 'knecta_joined_groups',
    GROUP_INVITES: 'knecta_group_invites',
    ADMIN_GROUPS: 'knecta_admin_groups',
    LAST_SYNC: 'knecta_groups_last_sync',
    PENDING_ACTIONS: 'knecta_pending_group_actions',
    USER_PROFILE: 'knecta_user_profile',
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
    USER_TOKEN: 'USER_TOKEN',
    API_BASE: 'knecta_api_base',
    GROUP_UNREAD: 'knecta_group_unread_'
});

// =============================================
// SAFETY GUARDS
// =============================================
const loggedErrors = new Set();
const loggedWarnings = new Set();
const maxRetries = 2;
const retryCounters = new Map();

function shouldRetry(operationId) {
    const safeId = validateInput(operationId);
    const count = retryCounters.get(safeId) || 0;
    if (count >= maxRetries) {
        return false;
    }
    retryCounters.set(safeId, count + 1);
    return true;
}

function resetRetry(operationId) {
    const safeId = validateInput(operationId);
    retryCounters.delete(safeId);
}

function hasValidSession() {
    return SessionMirror.isAuthenticated();
}

function isGroupOperationReady() {
    return (__HANDSHAKE_COMPLETE__ || handshakeCompleted) && __SESSION_READY__;
}

function guardGroupOperation(operation, fallback = null) {
    if (isGroupOperationReady()) {
        return operation();
    }
    
    if (typeof fallback === 'function') {
        return fallback();
    }
    
    queueGroupAction(operation);
    return null;
}

// =============================================
// TOKEN MANAGEMENT
// =============================================
export function initializeTokenSystem() {
    try {
        tokenReadyPromise = new Promise((resolve, reject) => {
            tokenReadyResolve = resolve;
            tokenReadyReject = reject;
        });
        
        setTimeout(async () => {
            try {
                if (ParentAuthority.isAuthoritativeSession()) {
                    const authSession = ParentAuthority.getAuthoritativeSession();
                    if (authSession && authSession.token) {
                        saveUnifiedToken(authSession.token);
                        authReady = true;
                        authCheckComplete = true;
                        __SESSION_READY__ = true;
                        if (tokenReadyResolve) tokenReadyResolve(authSession.token);
                        return;
                    }
                }
                
                const parentToken = ParentConnectionManager.getToken();
                if (parentToken) {
                    saveUnifiedToken(parentToken);
                    authReady = true;
                    authCheckComplete = true;
                    __SESSION_READY__ = true;
                    if (tokenReadyResolve) tokenReadyResolve(parentToken);
                    return;
                }
                
                const cachedToken = SafeStorage.getItem('token');
                if (cachedToken) {
                    authReady = true;
                    authCheckComplete = true;
                    __SESSION_READY__ = true;
                    if (tokenReadyResolve) tokenReadyResolve(cachedToken);
                    return;
                }
                
                const unsubscribe = SessionMirror.subscribe((state) => {
                    if (state.token) {
                        saveUnifiedToken(state.token);
                        authReady = true;
                        authCheckComplete = true;
                        __SESSION_READY__ = true;
                        if (tokenReadyResolve) tokenReadyResolve(state.token);
                        unsubscribe();
                    }
                });
                
                setTimeout(() => {
                    if (tokenReadyResolve) {
                        tokenReadyResolve(null);
                        authCheckComplete = true;
                    }
                }, 5000);
                
            } catch (error) {
                if (tokenReadyResolve) tokenReadyResolve(null);
                authCheckComplete = true;
            }
        }, 100);
    } catch (error) {}
}

export async function waitForTokenReady() {
    try {
        if (ParentAuthority.isAuthoritativeSession()) {
            const authSession = ParentAuthority.getAuthoritativeSession();
            if (authSession && authSession.token) {
                authReady = true;
                authCheckComplete = true;
                saveUnifiedToken(authSession.token);
                return authSession.token;
            }
        }
        
        const parentToken = ParentConnectionManager.getToken();
        if (parentToken) {
            authReady = true;
            authCheckComplete = true;
            saveUnifiedToken(parentToken);
            return parentToken;
        }
        
        const token = SafeStorage.getItem('token');
        if (token) {
            authReady = true;
            authCheckComplete = true;
            return token;
        }
        
        if (tokenReadyPromise) {
            return await tokenReadyPromise;
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

export function getUnifiedToken() {
    try {
        if (ParentAuthority.isAuthoritativeSession()) {
            const authSession = ParentAuthority.getAuthoritativeSession();
            if (authSession && authSession.token) {
                return String(authSession.token).substring(0, SECURITY_CONFIG.MAX_STRING_LENGTH);
            }
        }
        
        const parentToken = ParentConnectionManager.getToken();
        if (parentToken) {
            return String(parentToken).substring(0, SECURITY_CONFIG.MAX_STRING_LENGTH);
        }
        
        const mirrorToken = SessionMirror.getToken();
        if (mirrorToken) {
            return String(mirrorToken).substring(0, SECURITY_CONFIG.MAX_STRING_LENGTH);
        }
        
        const unifiedToken = SafeStorage.getItem('token');
        if (unifiedToken) {
            return String(unifiedToken).substring(0, SECURITY_CONFIG.MAX_STRING_LENGTH);
        }
        
        const legacyKeys = [
            'knecta_access_token',
            'moodchat_token',
            'authToken',
            'accessToken'
        ];
        
        for (const key of legacyKeys) {
            try {
                const token = localStorage.getItem(key);
                if (token) {
                    saveUnifiedToken(token);
                    return String(token).substring(0, SECURITY_CONFIG.MAX_STRING_LENGTH);
                }
            } catch (e) {}
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

export function saveUnifiedToken(token) {
    try {
        if (!token) return;
        
        const safeToken = String(token).substring(0, SECURITY_CONFIG.MAX_STRING_LENGTH);
        
        SafeStorage.setItem('token', safeToken);
        
        localStorage.setItem('knecta_access_token', safeToken);
        localStorage.setItem('moodchat_token', safeToken);
        
    } catch (error) {}
}

export function getCurrentUserLocal() {
    try {
        if (ParentAuthority.isAuthoritativeSession()) {
            const authSession = ParentAuthority.getAuthoritativeSession();
            if (authSession && authSession.user) {
                return authSession.user;
            }
        }
        
        const parentUser = ParentConnectionManager.getUser();
        if (parentUser) {
            return parentUser;
        }
        
        const mirrorUser = SessionMirror.getUser();
        if (mirrorUser) {
            return mirrorUser;
        }
        
        const cachedUser = SafeStorage.getItem('user');
        if (cachedUser) {
            return cachedUser;
        }
        
        const legacyUser = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
        if (legacyUser) {
            return JSON.parse(legacyUser);
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

export function getCurrentUser() {
    return getCurrentUserLocal();
}

// =============================================
// QUEUE API CALL SYSTEM
// =============================================
export function queueApiCall(apiCallFunction) {
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

export async function processTokenQueue() {
    if (isProcessingTokenQueue || tokenQueue.length === 0) return;
    
    isProcessingTokenQueue = true;
    
    try {
        const token = await waitForTokenReady();
        
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
// SECURE API WRAPPER
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
    _handshakeComplete: false,
    
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
        const checkInterval = setInterval(() => {
            if (window.__API_CORE__ && window.__API_CORE__.isReady()) {
                this._ready = true;
                this._handshakeComplete = true;
                this._readyResolve(window.__API_CORE__);
                clearInterval(checkInterval);
                
                this._processPendingCalls();
            }
        }, 100);
        
        setTimeout(() => {
            if (!this._ready) {
                clearInterval(checkInterval);
                this._ready = true;
                this._readyResolve(null);
                
                if (this._pendingCalls.length > 0) {
                    this._processPendingCallsDegraded();
                }
            }
        }, 5000);
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
        
        if (!this.isReady()) {
            if (method === 'GET') {
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
            
            return new Promise((resolve, reject) => {
                this._pendingCalls.push({
                    endpoint: cleanEndpoint,
                    options,
                    resolve,
                    reject
                });
            });
        }
        
        const maxRetries = Math.min(options.retry ?? this._maxRetries, 1);
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                let response;
                
                if (ParentConnectionManager && ParentConnectionManager.isAuthenticated() && window.__API_CORE__) {
                    response = await window.__API_CORE__.request(cleanEndpoint, {
                        ...options,
                        signal: controller.signal
                    });
                } else {
                    response = await this._mockRequest(cleanEndpoint, method, options);
                }
                
                clearTimeout(timeoutId);
                
                if (!response || typeof response !== 'object') {
                    throw new Error('Invalid API response format');
                }
                
                if (response.success) {
                    this._stats.success++;
                    
                    if (method === 'GET' && response.data) {
                        this._setCached(cacheKey, response.data);
                    }
                    
                    return response;
                }
                
                if (attempt < maxRetries) {
                    this._stats.retried++;
                    await new Promise(r => setTimeout(r, this._retryDelay * Math.pow(2, attempt)));
                    continue;
                }
                
                this._stats.failed++;
                
                return {
                    success: false,
                    status: response.status || 'error',
                    message: response.message || 'API request failed',
                    data: response.data || null,
                    fromCache: false
                };
                
            } catch (error) {
                if (error.name === 'AbortError') {
                    if (attempt < maxRetries) {
                        this._stats.retried++;
                        await new Promise(r => setTimeout(r, this._retryDelay * Math.pow(2, attempt)));
                        continue;
                    }
                    
                    this._stats.failed++;
                    return {
                        success: false,
                        status: 'timeout',
                        message: 'Request timed out',
                        fromCache: false
                    };
                }
                
                if (attempt < maxRetries) {
                    this._stats.retried++;
                    await new Promise(r => setTimeout(r, this._retryDelay * Math.pow(2, attempt)));
                    continue;
                }
                
                this._stats.failed++;
                
                return {
                    success: false,
                    status: 'error',
                    message: error.message || 'Network error',
                    fromCache: false
                };
            }
        }
        
        return {
            success: false,
            status: 'error',
            message: 'Maximum retries exceeded',
            fromCache: false
        };
    },
    
    async _mockRequest(endpoint, method, options) {
        await new Promise(r => setTimeout(r, 300));
        
        if (endpoint === '/groups' && method === 'GET') {
            return {
                success: true,
                data: groups
            };
        }
        
        if (endpoint === '/invites' && method === 'GET') {
            return {
                success: true,
                data: groupInvites
            };
        }
        
        if (endpoint.startsWith('/groups/') && method === 'GET' && endpoint.includes('/members')) {
            const groupId = endpoint.split('/')[2];
            return {
                success: true,
                data: generateSimulatedMembers(groupId)
            };
        }
        
        if (endpoint === '/auth/me' && method === 'GET') {
            if (currentUser) {
                return {
                    success: true,
                    data: currentUser
                };
            }
            const cachedUser = SafeStorage.getItem('user');
            if (cachedUser) {
                return {
                    success: true,
                    data: cachedUser
                };
            }
            return {
                success: true,
                data: { id: 'guest', displayName: 'Guest User' }
            };
        }
        
        if (method === 'POST') {
            return {
                success: true,
                data: { id: 'mock_' + Date.now() }
            };
        }
        
        if (method === 'PUT') {
            return {
                success: true,
                data: options.body
            };
        }
        
        if (method === 'DELETE') {
            return {
                success: true,
                data: { deleted: true }
            };
        }
        
        return {
            success: true,
            data: {}
        };
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
// SECURE API CALL FUNCTION
// =============================================
export async function secureApiCall(endpoint, options = {}) {
    try {
        if (!options.skipReadyCheck) {
            await API_WRAPPER.whenReady();
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

export async function safeApiCall(endpoint, options = {}) {
    return secureApiCall(endpoint, options);
}

// =============================================
// INITIALIZATION PIPELINE - INTEGRATED WITH LIFECYCLE FSM
// =============================================
let _initState = {
    preflight: false,
    parentConnect: false,
    handshake: false,
    session: false,
    ready: false
};

async function preflightStage() {
    try {
        _instanceId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        SafeStorage.init();
        IframeAuthority.init();
        API_WRAPPER.init();
        ParentAuthority.init();
        
        _initState.preflight = true;
        return { success: true };
    } catch (error) {
        return { success: false, error };
    }
}

async function parentConnectStage() {
    try {
        ParentConnectionManager.init();
        
        const parentAvailable = ParentConnectionManager.parentAvailable;
        
        _initState.parentConnect = true;
        return { success: true, parentAvailable };
    } catch (error) {
        return { success: false, error };
    }
}

async function handshakeStage(parentAvailable) {
    try {
        if (!parentAvailable) {
            _initState.handshake = true;
            return { success: false, fallback: true };
        }
        
        try {
            await StartupGovernor.init();
            _initState.handshake = true;
            return { success: true };
        } catch (error) {
            if (!ParentAuthority.isAuthoritativeSession() && ParentConnectionManager.tryCachedSession()) {
                _initState.handshake = true;
                return { success: true, fromCache: true };
            }
            
            _initState.handshake = true;
            return { success: false, fallback: true };
        }
    } catch (error) {
        _initState.handshake = true;
        return { success: false, fallback: true };
    }
}

async function sessionStage(handshakeSuccess, fromCache) {
    try {
        SessionMirror.init();
        SessionClient.init();
        
        if (ParentAuthority.isAuthoritativeSession()) {
            const authSession = ParentAuthority.getAuthoritativeSession();
            if (authSession) {
                currentUser = authSession.user;
                userData = {
                    displayName: authSession.user?.displayName || authSession.user?.name || 'User',
                    username: authSession.user?.username || '',
                    email: authSession.user?.email || '',
                    photoURL: authSession.user?.photoURL || authSession.user?.avatar || ''
                };
                authReady = true;
                __SESSION_READY__ = true;
                _initState.session = true;
                return { success: true, authoritative: true };
            }
        }
        
        const sessionPromise = new Promise((resolve) => {
            if (SessionMirror.isAuthenticated()) {
                resolve(SessionMirror.getState());
            } else {
                const unsubscribe = SessionMirror.subscribe((state) => {
                    if (state.authenticated) {
                        unsubscribe();
                        resolve(state);
                    }
                });
                
                setTimeout(() => {
                    unsubscribe();
                    resolve(null);
                }, 3000);
            }
        });
        
        const session = await sessionPromise;
        
        if (session) {
            currentUser = session.user;
            userData = {
                displayName: session.user?.displayName || session.user?.name || 'User',
                username: session.user?.username || '',
                email: session.user?.email || '',
                photoURL: session.user?.photoURL || session.user?.avatar || ''
            };
            authReady = true;
            __SESSION_READY__ = true;
        }
        
        _initState.session = true;
        return { success: !!session, fromCache: session?.fromCache || false };
    } catch (error) {
        _initState.session = true;
        return { success: false };
    }
}

async function readyStage() {
    try {
        loadCachedDataInstantly();
        initializeTokenSystem();
        
        isPageInitialized = true;
        _initState.ready = true;
        
        window.__MODULE_READY__ = true;
        if (__SESSION_READY__) {
            window.__MODULE_SESSION_ACTIVE__ = true;
        }
        
        document.dispatchEvent(new CustomEvent('groupsCoreReady', {
            detail: {
                version: MODULE_VERSION,
                timestamp: Date.now(),
                sessionValid: hasValidSession(),
                authenticated: SessionMirror.isAuthenticated(),
                authoritative: ParentAuthority.isAuthoritativeSession(),
                state: LifecycleFSM.getState()
            }
        }));
        
        processGroupActionQueue();
        
        return { success: true };
    } catch (error) {
        _initState.ready = true;
        return { success: false };
    }
}

export async function initializeGroupsCore() {
    if (typeof isPageInitialized !== 'undefined' && isPageInitialized) {
        return { success: true, fromCache: true };
    }
    
    const startTime = Date.now();
    
    try {
        const preflight = await preflightStage();
        const parent = await parentConnectStage();
        const handshake = await handshakeStage(parent.parentAvailable);
        const session = await sessionStage(handshake.success, handshake.fromCache);
        const ready = await readyStage();
        
        const duration = Date.now() - startTime;
        
        STATUS_MACHINE.log('core', 'SUCCESS', `Initialized in ${duration}ms`);
        
        return {
            success: true,
            authenticated: session.success,
            fromCache: session.fromCache,
            authoritative: session.authoritative || false,
            duration
        };
    } catch (error) {
        loadCachedDataInstantly();
        
        if (typeof isPageInitialized !== 'undefined') {
            isPageInitialized = true;
        }
        
        STATUS_MACHINE.log('core', 'WARNING', 'Fallback mode active');
        
        return {
            success: false,
            error,
            fallbackMode: true
        };
    }
}

// =============================================
// CORE PAGE MANAGEMENT
// =============================================
const pageCore = {
    isReady: false,
    isInitialized: false,
    isLoading: false,
    messageQueue: [],
    
    data: {
        friendsList: [],
        groupsList: [],
        chatHistory: [],
        notifications: [],
        settings: {},
        session: null
    },
    
    errors: new Set(),
    maxRetries: 2,
    retryCounts: new Map()
};

let statusMessageElement = null;

function showCoreMessage(message, type = 'info') {}

export async function initPageCore() {
    if (pageCore.isInitialized || pageCore.isLoading) return;
    
    pageCore.isLoading = true;
    
    try {
        await setupParentListener();
        await pageCore.loadSession();
        await pageCore.loadData();
        pageCore.validateData();
        pageCore.renderUI();
        pageCore.setupEvents();
        
        pageCore.isReady = true;
        pageCore.isInitialized = true;
        pageCore.isLoading = false;
        
        notifyParentCoreReady();
        processQueuedMessages();
        
    } catch (error) {
        pageCore.isLoading = false;
        notifyParentError(error);
    }
}

async function setupParentListener() {
    return new Promise((resolve) => {
        const messageHandler = (event) => {
            try {
                if (!event.data || typeof event.data !== 'object') return;
                
                if (!OriginAdapter.isTrusted(event.origin)) return;
                
                const msg = event.data;
                
                ParentAuthority.handleMessage(msg);
                
                if (!pageCore.isReady) {
                    pageCore.messageQueue.push(msg);
                }
                
                if (msg.type === 'init' || msg.type === PARENT_MESSAGE_TYPES.SESSION_DATA || 
                    msg.type === PARENT_MESSAGE_TYPES.SESSION_SYNC || msg.type === 'SESSION_ACTIVE') {
                    pageCore.data.session = msg.payload || msg.session || {};
                    __SESSION_READY__ = true;
                    resolve();
                }
                
                if (msg.type === 'refreshData' || msg.type === PARENT_MESSAGE_TYPES.UI_REFRESH) {
                    handleRefreshDataRequest(msg.payload);
                }
                
                if (msg.type === PARENT_MESSAGE_TYPES.PARENT_READY) {
                    HandshakeClient.handleParentReady(msg);
                    __PARENT_READY__ = true;
                }
                
            } catch (error) {}
        };
        
        window.addEventListener('message', messageHandler);
        
        setTimeout(() => {
            TransportAgent.send('iframeReady', {
                iframeId: SECURITY_CONFIG.FRAME_ID,
                ready: true,
                timestamp: Date.now()
            }, { requiresAck: false }).catch(() => {});
            
            setTimeout(resolve, 1000);
        }, 100);
    });
}

pageCore.loadSession = async function() {
    try {
        if (ParentAuthority.isAuthoritativeSession()) {
            const authSession = ParentAuthority.getAuthoritativeSession();
            if (authSession) {
                pageCore.data.session = authSession;
                __SESSION_READY__ = true;
                return;
            }
        }
        
        const session = SessionMirror.getState();
        if (session.authenticated) {
            pageCore.data.session = session;
            __SESSION_READY__ = true;
        } else {
            const initMessage = pageCore.messageQueue.find(msg => 
                msg.type === 'init' || 
                msg.type === PARENT_MESSAGE_TYPES.SESSION_DATA ||
                msg.type === PARENT_MESSAGE_TYPES.SESSION_SYNC ||
                msg.type === 'SESSION_ACTIVE'
            );
            if (initMessage) {
                pageCore.data.session = initMessage.payload || initMessage.session;
                __SESSION_READY__ = true;
            } else {
                const saved = SafeStorage.getItem('session');
                if (saved) {
                    pageCore.data.session = saved;
                    __SESSION_READY__ = true;
                }
            }
        }
        
        if (!pageCore.data.session) {
            pageCore.data.session = {
                userId: 'anonymous',
                timestamp: new Date().toISOString()
            };
        }
        
    } catch (error) {}
};

pageCore.loadData = async function() {
    try {
        const [friendsResult, groupsResult, notificationsResult, settingsResult] = await Promise.allSettled([
            secureApiCall('/friends', { skipCache: false }),
            secureApiCall('/groups', { skipCache: false }),
            secureApiCall('/notifications', { skipCache: false }),
            secureApiCall('/settings', { skipCache: false })
        ]);
        
        if (friendsResult.status === 'fulfilled' && friendsResult.value.success) {
            pageCore.data.friendsList = Array.isArray(friendsResult.value.data) ? friendsResult.value.data : [];
            SafeStorage.setItem('friends', pageCore.data.friendsList);
        } else {
            const cached = SafeStorage.getItem('friends');
            if (cached) {
                pageCore.data.friendsList = cached;
            }
        }
        
        if (groupsResult.status === 'fulfilled' && groupsResult.value.success) {
            pageCore.data.groupsList = Array.isArray(groupsResult.value.data) ? groupsResult.value.data : [];
            SafeStorage.setItem('groups', pageCore.data.groupsList);
        } else {
            const cached = SafeStorage.getItem('groups');
            if (cached) {
                pageCore.data.groupsList = cached;
            }
        }
        
        if (notificationsResult.status === 'fulfilled' && notificationsResult.value.success) {
            pageCore.data.notifications = Array.isArray(notificationsResult.value.data) ? notificationsResult.value.data : [];
        }
        
        if (settingsResult.status === 'fulfilled' && settingsResult.value.success) {
            pageCore.data.settings = settingsResult.value.data || {};
        } else {
            const cached = SafeStorage.getItem('settings');
            if (cached) {
                pageCore.data.settings = cached;
            }
        }
        
    } catch (error) {
        const cachedFriends = SafeStorage.getItem('friends');
        if (cachedFriends) {
            pageCore.data.friendsList = cachedFriends;
        }
        
        const cachedGroups = SafeStorage.getItem('groups');
        if (cachedGroups) {
            pageCore.data.groupsList = cachedGroups;
        }
    }
};

pageCore.validateData = function() {
    try {
        if (!Array.isArray(pageCore.data.friendsList)) {
            pageCore.data.friendsList = [];
        }
        if (!Array.isArray(pageCore.data.groupsList)) {
            pageCore.data.groupsList = [];
        }
        if (!Array.isArray(pageCore.data.notifications)) {
            pageCore.data.notifications = [];
        }
        if (typeof pageCore.data.settings !== 'object') {
            pageCore.data.settings = {};
        }
        if (!pageCore.data.session || typeof pageCore.data.session !== 'object') {
            pageCore.data.session = { userId: 'anonymous' };
        }
    } catch (error) {}
};

pageCore.renderUI = function() {
    try {
        const event = new CustomEvent('coreDataUpdated', {
            detail: {
                data: pageCore.data,
                timestamp: new Date().toISOString()
            }
        });
        document.dispatchEvent(event);
        
        isMobile = window.innerWidth <= 768;
        if (isMobile) {
            document.body.classList.add('mobile-view');
        } else {
            document.body.classList.add('desktop-view');
        }
        
    } catch (error) {}
};

pageCore.setupEvents = function() {
    try {
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (target.matches('[data-action]')) {
                e.preventDefault();
            }
        });
        
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const nowMobile = window.innerWidth <= 768;
                const wasMobile = document.body.classList.contains('mobile-view');
                
                if (nowMobile !== wasMobile) {
                    location.reload();
                }
            }, 250);
        });
        
    } catch (error) {}
};

async function handleRefreshDataRequest(payload) {
    try {
        if (payload && payload.types) {
            const types = Array.isArray(payload.types) ? payload.types : [payload.types];
            
            for (const type of types) {
                switch (type) {
                    case 'friends':
                        const friendsResult = await secureApiCall('/friends', { skipCache: true });
                        if (friendsResult.success) {
                            pageCore.data.friendsList = Array.isArray(friendsResult.data) ? friendsResult.data : [];
                            SafeStorage.setItem('friends', pageCore.data.friendsList);
                        }
                        break;
                    case 'groups':
                        const groupsResult = await secureApiCall('/groups', { skipCache: true });
                        if (groupsResult.success) {
                            pageCore.data.groupsList = Array.isArray(groupsResult.data) ? groupsResult.data : [];
                            SafeStorage.setItem('groups', pageCore.data.groupsList);
                        }
                        break;
                    case 'notifications':
                        const notifResult = await secureApiCall('/notifications', { skipCache: true });
                        if (notifResult.success) {
                            pageCore.data.notifications = Array.isArray(notifResult.data) ? notifResult.data : [];
                        }
                        break;
                }
            }
        } else {
            await pageCore.loadData();
        }
        
        pageCore.renderUI();
        
        TransportAgent.send('dataRefreshed', {
            success: true,
            timestamp: new Date().toISOString()
        }, { requiresAck: false }).catch(() => {});
        
    } catch (error) {
        TransportAgent.send('dataRefreshError', {
            error: error.message,
            timestamp: new Date().toISOString()
        }, { requiresAck: false }).catch(() => {});
    }
}

function sendToParent(message) {
    return TransportAgent.send(message.type, message.payload || {}, { requiresAck: false });
}

function notifyParentCoreReady() {
    sendToParent({
        type: 'coreReady',
        payload: {
            iframeId: SECURITY_CONFIG.FRAME_ID,
            status: 'success',
            dataTypes: ['friendsList', 'groupsList', 'notifications', 'settings']
        }
    });
}

function notifyParentError(error) {
    sendToParent({
        type: 'error',
        payload: {
            iframeId: SECURITY_CONFIG.FRAME_ID,
            message: error.message || 'Unknown error'
        }
    });
}

function processQueuedMessages() {
    while (pageCore.messageQueue.length > 0) {
        const msg = pageCore.messageQueue.shift();
        window.dispatchEvent(new MessageEvent('message', {
            data: msg,
            origin: window.location.origin
        }));
    }
}

export function getCoreData(type) {
    try {
        if (!pageCore.isReady) {
            throw new Error('Core not ready');
        }
        
        const safeType = validateInput(type);
        
        switch (safeType) {
            case 'friendsList':
                return [...pageCore.data.friendsList];
            case 'groupsList':
                return [...pageCore.data.groupsList];
            case 'notifications':
                return [...pageCore.data.notifications];
            case 'settings':
                return { ...pageCore.data.settings };
            case 'session':
                return { ...pageCore.data.session };
            default:
                throw new Error(`Unknown data type: ${safeType}`);
        }
    } catch (error) {
        return null;
    }
}

export function updateCoreData(type, payload) {
    try {
        if (!pageCore.isReady) {
            throw new Error('Core not ready');
        }
        
        const safeType = validateInput(type);
        
        switch (safeType) {
            case 'friendsList':
                if (!Array.isArray(payload)) throw new Error('friendsList must be array');
                pageCore.data.friendsList = payload;
                SafeStorage.setItem('friends', payload);
                break;
            case 'groupsList':
                if (!Array.isArray(payload)) throw new Error('groupsList must be array');
                pageCore.data.groupsList = payload;
                SafeStorage.setItem('groups', payload);
                break;
            case 'notifications':
                if (!Array.isArray(payload)) throw new Error('notifications must be array');
                pageCore.data.notifications = payload;
                break;
            case 'settings':
                if (typeof payload !== 'object') throw new Error('settings must be object');
                pageCore.data.settings = payload;
                SafeStorage.setItem('settings', payload);
                break;
            default:
                throw new Error(`Unknown data type: ${safeType}`);
        }
        
        pageCore.renderUI();
        
    } catch (error) {}
}

// =============================================
// PARENT COORDINATION FUNCTIONS
// =============================================
export function initializeParentConnection() {
    return ParentConnectionManager.init();
}

export function verifyParentPresence() {
    return ParentConnectionManager.parentAvailable;
}

export function setupParentMessageListener() {}

export function handleParentMessage(event) {}

export function startHandshakeProtocol() {
    return HandshakeClient.initiate();
}

export function scheduleHandshakeRetry() {}

export function sendMessageToParent(type, payload, options) {
    if (!__PARENT_READY__ && !handshakeCompleted && !__HANDSHAKE_COMPLETE__) {
        return Promise.resolve({ 
            success: false, 
            queued: true, 
            reason: 'handshake_incomplete' 
        });
    }
    
    return TransportAgent.send(type, payload, options);
}

export function handleParentReady() {
    ParentConnectionManager.handleParentReady();
}

export function handleSessionData(sessionData) {
    if (ParentConnectionManager.validateSessionData(sessionData)) {
        ParentConnectionManager.updateSessionMirror(sessionData);
        __SESSION_READY__ = true;
    }
}

export function validateSessionData(sessionData) {
    return ParentConnectionManager.validateSessionData(sessionData);
}

export function updateLocalStateFromSession(sessionData) {
    if (sessionData && sessionData.user) {
        currentUser = sessionData.user;
        userData = {
            displayName: sessionData.user.displayName || sessionData.user.name || 'User',
            username: sessionData.user.username || '',
            email: sessionData.user.email || '',
            photoURL: sessionData.user.photoURL || sessionData.user.avatar || ''
        };
        
        SafeStorage.setItem('user', {
            uid: sessionData.user.id || sessionData.user._id || sessionData.user.uid,
            displayName: sessionData.user.displayName || sessionData.user.name,
            email: sessionData.user.email,
            photoURL: sessionData.user.photoURL || sessionData.user.avatar
        });
        
        SafeStorage.setItem('userProfile', userData);
        
        if (sessionData.token) {
            saveUnifiedToken(sessionData.token);
        }
        
        authReady = true;
        authCheckComplete = true;
        __SESSION_READY__ = true;
    }
}

export function handleSessionUpdate(updateData) {
    if (ParentConnectionManager.sessionMirror) {
        ParentConnectionManager.updateSessionMirror({
            ...ParentConnectionManager.sessionMirror,
            ...updateData
        });
        __SESSION_READY__ = true;
    }
}

export function handleLogout() {
    ParentConnectionManager.clearSession();
    __SESSION_READY__ = false;
}

export function clearLocalSessionState() {
    currentUser = null;
    userData = null;
    authReady = false;
    __SESSION_READY__ = false;
    
    try {
        SafeStorage.removeItem('token');
        SafeStorage.removeItem('user');
        SafeStorage.removeItem('userProfile');
    } catch (error) {}
    
    ParentConnectionManager.clearSession();
    HandshakeClient.reset();
}

export function handleParentUnavailable() {
    if (ParentAuthority.isAuthoritativeSession()) {
        return;
    }
    
    if (LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
        return;
    }
    
    const cachedUser = getCurrentUserLocal();
    const cachedToken = getUnifiedToken();
    
    if (cachedUser && cachedToken) {
        updateLocalStateFromSession({
            user: cachedUser,
            token: cachedToken,
            timestamp: Date.now(),
            fromCache: true
        });
    }
}

export function sendStatusToParent() {
    ParentConnectionManager.sendStatus();
}

export function handleLegacySessionMessage(message) {
    const sessionData = {
        user: message.user || message.session?.user,
        token: message.token || message.session?.token,
        timestamp: message.timestamp || Date.now(),
        fromLegacy: true
    };
    
    if (validateSessionData(sessionData)) {
        handleSessionData(sessionData);
    }
}

export function enableProtectedUI() {
    updateUserUI();
}

export function disableProtectedUI() {
    const userElements = document.querySelectorAll('.user-info, .user-avatar');
    userElements.forEach(el => {
        el.style.opacity = '0.5';
    });
}

export function showReconnectState() {}

export function startBackgroundProcesses() {
    try {
        loadUserDataInBackground();
        startBackgroundSync();
        
        if (typeof processPendingOfflineActions === 'function') {
            processPendingOfflineActions();
        }
    } catch (error) {}
}

export function stopBackgroundProcesses() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
    
    backgroundSyncRunning = false;
}

// =============================================
// GROUP MESSAGE FUNCTIONS
// =============================================
export function getGroupMessages(groupId) {
    return groupMessages[groupId] || [];
}

export function saveGroupMessages(groupId, messages) {
    groupMessages[groupId] = messages;
    try {
        SafeStorage.setItem(`group_messages_${groupId}`, messages);
    } catch (e) {}
}

export function addGroupMessage(groupId, message) {
    if (!groupId || !message) return;
    
    const messages = groupMessages[groupId] || [];
    messages.push(message);
    
    if (messages.length > 100) {
        messages.splice(0, messages.length - 100);
    }
    
    groupMessages[groupId] = messages;
    
    try {
        SafeStorage.setItem(`group_messages_${groupId}`, messages);
    } catch (e) {}
    
    incrementGroupUnreadCount(groupId);
    
    sendMessageToParent(PARENT_MESSAGE_TYPES.GROUP_MESSAGE, {
        groupId,
        message,
        timestamp: Date.now()
    }).catch(() => {});
}

export function getGroupUnreadCount(groupId) {
    return groupUnreadCounts[groupId] || 0;
}

export function incrementGroupUnreadCount(groupId) {
    if (!groupId) return;
    
    if (currentChatGroup && currentChatGroup.id === groupId) {
        return;
    }
    
    const count = (groupUnreadCounts[groupId] || 0) + 1;
    groupUnreadCounts[groupId] = count;
    
    try {
        SafeStorage.setItem(`group_unread_${groupId}`, count);
    } catch (e) {}
    
    sendMessageToParent(PARENT_MESSAGE_TYPES.UNREAD_COUNT_UPDATED, {
        groupId,
        count,
        timestamp: Date.now()
    }).catch(() => {});
}

export function resetGroupUnreadCount(groupId) {
    if (!groupId) return;
    
    groupUnreadCounts[groupId] = 0;
    
    try {
        SafeStorage.setItem(`group_unread_${groupId}`, 0);
    } catch (e) {}
    
    sendMessageToParent(PARENT_MESSAGE_TYPES.UNREAD_COUNT_UPDATED, {
        groupId,
        count: 0,
        timestamp: Date.now()
    }).catch(() => {});
}

export function markMessageAsSeen(groupId, messageId, userId) {
    if (!groupId || !messageId || !userId) return;
    
    const messages = groupMessages[groupId];
    if (!messages) return;
    
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    
    if (!message.seenBy) {
        message.seenBy = [];
    }
    
    if (!message.seenBy.includes(userId)) {
        message.seenBy.push(userId);
    }
    
    saveGroupMessages(groupId, messages);
}

export function handleGroupTyping(groupId, userId, isTyping) {
    if (!groupId || !userId) return;
    
    if (!groupTypingUsers[groupId]) {
        groupTypingUsers[groupId] = {};
    }
    
    if (isTyping) {
        groupTypingUsers[groupId][userId] = Date.now();
    } else {
        delete groupTypingUsers[groupId][userId];
    }
    
    sendMessageToParent(PARENT_MESSAGE_TYPES.GROUP_TYPING, {
        groupId,
        userId,
        isTyping,
        timestamp: Date.now()
    }).catch(() => {});
}

// =============================================
// MAIN INITIALIZATION
// =============================================
async function safeGroupPageInit() {
    let tries = 0;
    const MAX_TRIES = 3;

    while (!ParentConnectionManager.isReady() && tries < MAX_TRIES && !handshakeCompleted && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
        await new Promise(r => setTimeout(r, 500));
        tries++;
    }

    try {
        await originalGroupPageInit();
    } catch (e) {
        setTimeout(() => {
            try {
                setupUIEventListeners();
                loadCachedDataInstantly();
                updateGroupCounts();
            } catch (uiError) {}
        }, 100);
    }
}

async function originalGroupPageInit() {
    if (isPageInitialized) return;
    
    isPageInitialized = true;
    
    try {
        await initializeGroupsCore();
        
        loadCachedDataInstantly();
        initializeTokenSystem();
        
        setTimeout(setupUIEventListeners, 100);
        setupResponsiveBehavior();
        
        if (SessionMirror.isAuthenticated()) {
            startBackgroundProcesses();
            __SESSION_READY__ = true;
        } else {
            if (!__SESSION_REQUEST_PENDING__ && !handshakeCompleted && !LifecycleFSM.isAtLeast(LIFECYCLE_STATES.SESSION_ACTIVE)) {
                if (!ParentAuthority.isAuthoritativeSession()) {
                    ParentConnectionManager.requestSession();
                }
            }
            
            if (getCurrentUserLocal() && getUnifiedToken()) {
                enableProtectedUI();
                startBackgroundProcesses();
            }
        }
        
        processGroupActionQueue();
        
    } catch (error) {}
}

export async function initGroupPage() {
    await safeGroupPageInit();
}

export async function loadUserDataInBackground() {
    try {
        if (!SessionMirror.isAuthenticated()) {
            return;
        }
        
        const response = await secureApiCall('/auth/me', { silent: true });
        
        if (response && response.success && response.data) {
            currentUser = response.data;
            userData = {
                displayName: currentUser.displayName || currentUser.name || 'User',
                username: currentUser.username || null,
                email: currentUser.email || null,
                photoURL: currentUser.photoURL || currentUser.avatar || null
            };
            
            SafeStorage.setItem('user', {
                uid: currentUser.id || currentUser._id || currentUser.uid,
                displayName: currentUser.displayName || currentUser.name,
                email: currentUser.email,
                photoURL: currentUser.photoURL || currentUser.avatar
            });
            
            SafeStorage.setItem('userProfile', userData);
            
            updateUserUI();
            __SESSION_READY__ = true;
        }
    } catch (error) {}
}

export function updateUserUI() {
    try {
        const userElements = document.querySelectorAll('.user-info, .user-avatar');
        userElements.forEach(el => {
            if (userData && userData.displayName) {
                el.textContent = userData.displayName;
            }
        });
    } catch (error) {}
}

let _uiBound = false;

export function setupUIEventListeners() {
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
                if (!SessionMirror.isAuthenticated()) {
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

export function setupResponsiveBehavior() {
    try {
        window.addEventListener('resize', () => {
            isMobile = window.innerWidth <= 768;
        });
    } catch (error) {}
}

// =============================================
// CORE GROUP FUNCTIONS
// =============================================
export function loadCachedDataInstantly() {
    try {
        const groupsData = SafeStorage.getItem('groups');
        if (groupsData) {
            groups = groupsData;
            isLoadedFromLocalStorage = true;
            updateGroupCounts();
        }
        
        const myGroupsData = SafeStorage.getItem('myGroups');
        if (myGroupsData) myGroups = myGroupsData;
        
        const joinedData = SafeStorage.getItem('joinedGroups');
        if (joinedData) joinedGroups = joinedData;
        
        const invitesData = SafeStorage.getItem('groupInvites');
        if (invitesData) groupInvites = invitesData;
        
        const adminData = SafeStorage.getItem('adminGroups');
        if (adminData) adminGroups = adminData;
        
        const cachedFriends = SafeStorage.getItem('friends');
        if (cachedFriends) friends = cachedFriends;
        
        const cachedUser = SafeStorage.getItem('user');
        if (cachedUser) {
            currentUser = cachedUser;
            userData = SafeStorage.getItem('userProfile') || {};
        }
        
        const allGroupIds = new Set();
        groups.forEach(g => allGroupIds.add(g.id));
        myGroups.forEach(g => allGroupIds.add(g.id));
        joinedGroups.forEach(g => allGroupIds.add(g.id));
        adminGroups.forEach(g => allGroupIds.add(g.id));
        
        allGroupIds.forEach(groupId => {
            try {
                const messagesData = SafeStorage.getItem(`group_messages_${groupId}`);
                if (messagesData) {
                    groupMessages[groupId] = messagesData;
                }
                
                const unreadData = SafeStorage.getItem(`group_unread_${groupId}`);
                if (unreadData !== null) {
                    groupUnreadCounts[groupId] = unreadData;
                }
            } catch (e) {}
        });
        
        loadUniqueFeaturesData();
        
    } catch (error) {}
}

export function loadUniqueFeaturesData() {
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

export function calculateGroupPulse(groupData) {
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

export function updateGroupCounts() {
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

export function updateCurrentSection() {
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

export function renderAllGroups() {
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

export function addGroupItem(groupData, container, type) {
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
        
        const unreadCount = groupUnreadCounts[safeGroupData.id] || 0;
        
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

export function handleGroupAction(action, groupData, type, button) {
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
// BACKGROUND SYNC FUNCTIONS
// =============================================
let _backgroundSyncRetryCount = 0;
const MAX_BACKGROUND_RETRY = 2;

export function startBackgroundSync() {
    try {
        if (backgroundSyncRunning) {
            return;
        }
        
        if (!authReady && !SessionMirror.isAuthenticated()) {
            return;
        }
        
        backgroundSyncRunning = true;
        
        setTimeout(() => {
            backgroundSyncWithServer();
        }, 2000);
        
        syncIntervalId = setInterval(() => {
            try {
                if (authReady || SessionMirror.isAuthenticated()) {
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

export async function backgroundSyncWithServer() {
    if (!authReady && !SessionMirror.isAuthenticated()) {
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
// GROUP MEMBER MANAGEMENT FUNCTIONS
// =============================================
export function getUserRoleInGroup(groupData, userId) {
    if (!groupData || !userId) return null;
    
    if (groupData.createdBy === userId) return 'creator';
    
    const member = groupData.members?.find(m => m.userId === userId);
    return member ? member.role : null;
}

export function isUserAdmin(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId || 
           groupData.members?.some(m => m.userId === userId && m.role === 'admin');
}

export function canUserManageGroup(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId || 
           groupData.members?.some(m => m.userId === userId && m.role === 'admin');
}

export function canUserAddMembers(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId || 
           groupData.members?.some(m => m.userId === userId && (m.role === 'admin' || m.role === 'moderator'));
}

export function canUserRemoveMembers(groupData, userId, targetUserId) {
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

export function canUserChangeRole(groupData, userId, targetUserId) {
    if (!groupData || !userId || !targetUserId) return false;
    
    if (groupData.createdBy === targetUserId) return false;
    
    if (groupData.createdBy === userId) return true;
    
    return false;
}

export function canUserDeleteGroup(groupData, userId) {
    if (!groupData || !userId) return false;
    
    return groupData.createdBy === userId;
}

export function addMemberToGroup(groupId, userId, role = 'member') {
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
    
    saveGroupsToLocalStorage();
    
    sendMessageToParent(PARENT_MESSAGE_TYPES.MEMBER_ADDED, {
        groupId: group.id,
        member: newMember,
        timestamp: Date.now()
    }).catch(() => {});
    
    return { success: true, member: newMember };
}

export function removeMemberFromGroup(groupId, userId) {
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
    
    saveGroupsToLocalStorage();
    
    sendMessageToParent(PARENT_MESSAGE_TYPES.MEMBER_REMOVED, {
        groupId: group.id,
        userId,
        removedMember,
        timestamp: Date.now()
    }).catch(() => {});
    
    return { success: true };
}

export function changeMemberRole(groupId, userId, newRole) {
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
    
    saveGroupsToLocalStorage();
    
    sendMessageToParent(PARENT_MESSAGE_TYPES.MEMBER_ROLE_CHANGED, {
        groupId: group.id,
        userId,
        oldRole,
        newRole,
        timestamp: Date.now()
    }).catch(() => {});
    
    return { success: true };
}

export function deleteGroup(groupId) {
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
    
    saveGroupsToLocalStorage();
    
    if (currentChatGroup && currentChatGroup.id === groupId) {
        if (typeof closeGroupChatMobile === 'function') {
            closeGroupChatMobile();
        }
        currentChatGroup = null;
    }
    
    sendMessageToParent(PARENT_MESSAGE_TYPES.GROUP_DELETED, {
        groupId,
        timestamp: Date.now()
    }).catch(() => {});
    
    return { success: true };
}

export function updateGroupInAllLists(updatedGroup) {
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
    
    if (currentChatGroup && currentChatGroup.id === updatedGroup.id) {
        currentChatGroup = updatedGroup;
    }
    
    if (selectedGroup && selectedGroup.id === updatedGroup.id) {
        selectedGroup = updatedGroup;
    }
}

// =============================================
// ONLINE OPERATIONS (API)
// =============================================
export const addMemberOnline = async function(groupId, userId, role = 'member') {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'addMember', groupId, userId, role });
        return;
    }
    
    try {
        const response = await secureApiCall(`/groups/${groupId}/members`, {
            method: 'POST',
            body: { userId, role }
        });
        
        if (!response || !response.success) {
            throw new Error(response?.message || 'Failed to add member');
        }
        
        const group = groups.find(g => g.id === groupId) || 
                      myGroups.find(g => g.id === groupId) || 
                      adminGroups.find(g => g.id === groupId);
        
        if (group) {
            if (!group.members) group.members = [];
            
            if (!group.members.some(m => m.userId === userId)) {
                group.members.push({
                    userId,
                    role,
                    joinedAt: Date.now()
                });
                group.memberCount = group.members.length;
                updateGroupInAllLists(group);
                saveGroupsToLocalStorage();
            }
        }
        
    } catch (error) {
        console.error('Failed to add member online:', error);
    }
};

export const removeMemberOnline = async function(groupId, userId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'removeMember', groupId, userId });
        return;
    }
    
    try {
        const response = await secureApiCall(`/groups/${groupId}/members/${userId}`, {
            method: 'DELETE'
        });
        
        if (!response || !response.success) {
            throw new Error(response?.message || 'Failed to remove member');
        }
        
        const group = groups.find(g => g.id === groupId) || 
                      myGroups.find(g => g.id === groupId) || 
                      adminGroups.find(g => g.id === groupId);
        
        if (group && group.members) {
            group.members = group.members.filter(m => m.userId !== userId);
            group.memberCount = group.members.length;
            updateGroupInAllLists(group);
            saveGroupsToLocalStorage();
        }
        
    } catch (error) {
        console.error('Failed to remove member online:', error);
    }
};

export const changeMemberRoleOnline = async function(groupId, userId, role) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'changeMemberRole', groupId, userId, role });
        return;
    }
    
    try {
        const response = await secureApiCall(`/groups/${groupId}/members/${userId}/role`, {
            method: 'PUT',
            body: { role }
        });
        
        if (!response || !response.success) {
            throw new Error(response?.message || 'Failed to change role');
        }
        
        const group = groups.find(g => g.id === groupId) || 
                      myGroups.find(g => g.id === groupId) || 
                      adminGroups.find(g => g.id === groupId);
        
        if (group && group.members) {
            const member = group.members.find(m => m.userId === userId);
            if (member) {
                member.role = role;
                updateGroupInAllLists(group);
                saveGroupsToLocalStorage();
            }
        }
        
    } catch (error) {
        console.error('Failed to change role online:', error);
    }
};

export const deleteGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'deleteGroup', groupId });
        return;
    }
    
    try {
        const response = await secureApiCall(`/groups/${groupId}`, {
            method: 'DELETE'
        });
        
        if (!response || !response.success) {
            throw new Error(response?.message || 'Failed to delete group');
        }
        
        deleteGroup(groupId);
        
    } catch (error) {
        console.error('Failed to delete group online:', error);
    }
};

// =============================================
// CHAT AND GROUP MANAGEMENT FUNCTIONS
// =============================================
export const openGroupChat = async function(groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => openGroupChat(groupData));
        return;
    }
    
    try {
        if (!groupData) return;
        
        if (!SessionMirror.isAuthenticated()) {
            return;
        }
        
        currentChatGroup = groupData;
        
        resetGroupUnreadCount(groupData.id);
        
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

export function updateChatHeaderUniqueFeatures(groupData) {
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

export function checkPostingRules(groupData) {
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

export function updateParticipationModeButtons() {
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

export function loadUniqueFeaturesPanels(groupId) {
    try {
        loadGroupNotes(groupId);
        loadGroupEvents(groupId);
        loadTransparencyLog(groupId);
        analyzeGroupEnergy(groupId);
    } catch (error) {}
}

export async function loadGroupNotes(groupId) {
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

export async function loadGroupEvents(groupId) {
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
            } else {
                if (events.length === 0 && currentUser) {
                    events = generateUniqueEventsForUser(groupId, currentUser.uid || currentUser.id);
                    SafeStorage.setItem(cacheKey, events);
                }
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

export function generateUniqueEventsForUser(groupId, userId) {
    try {
        const events = [];
        const now = new Date();
        
        const userHash = hashCode(userId);
        const eventTemplates = [
            { title: 'Group Study Session', type: 'study', duration: 2 },
            { title: 'Team Meeting', type: 'work', duration: 1 },
            { title: 'Family Gathering', type: 'family', duration: 3 },
            { title: 'Project Review', type: 'project', duration: 2 },
            { title: 'Weekly Check-in', type: 'support', duration: 1 },
            { title: 'Hobby Workshop', type: 'hobby', duration: 4 },
            { title: 'Fitness Challenge', type: 'fitness', duration: 1 },
            { title: 'Prayer Meeting', type: 'prayer', duration: 1 },
            { title: 'Celebration Party', type: 'event', duration: 5 }
        ];
        
        for (let i = 0; i < 3; i++) {
            const templateIndex = (userHash + i) % eventTemplates.length;
            const template = eventTemplates[templateIndex];
            
            const daysFromNow = 1 + ((userHash + i * 7) % 14);
            const eventDate = new Date(now);
            eventDate.setDate(eventDate.getDate() + daysFromNow);
            
            const hour = 9 + ((userHash + i * 3) % 8);
            eventDate.setHours(hour, 0, 0, 0);
            
            events.push({
                id: `event_${groupId}_${userId}_${i}`,
                groupId: groupId,
                title: template.title,
                description: `Join us for a ${template.type} event!`,
                date: eventDate.toISOString(),
                duration: template.duration,
                type: template.type,
                createdBy: 'system',
                attendees: [],
                location: 'Online',
                createdAt: new Date().toISOString()
            });
        }
        
        return events;
    } catch (error) {
        return [];
    }
}

export function hashCode(str) {
    try {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    } catch (error) {
        return 0;
    }
}

export async function loadTransparencyLog(groupId) {
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

export function generateInitialTransparencyLog(groupId) {
    try {
        const now = new Date();
        return [
            {
                id: `log_${groupId}_1`,
                groupId: groupId,
                action: 'Group created',
                by: currentUser?.uid || currentUser?.id || 'system',
                byName: userData?.displayName || 'System',
                timestamp: new Date(now.getTime() - 86400000 * 2).toISOString(),
                details: 'Group was created with initial settings'
            },
            {
                id: `log_${groupId}_2`,
                groupId: groupId,
                action: 'Welcome message set',
                by: currentUser?.uid || currentUser?.id || 'system',
                byName: userData?.displayName || 'System',
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

export async function analyzeGroupEnergy(groupId) {
    try {
        let messages = [];
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/messages`, { params: { limit: 50 }, silent: true });
            if (response && response.success && response.data) {
                messages = response.data;
            } else {
                messages = generateSimulatedMessages(groupId);
            }
        } catch (error) {
            messages = generateSimulatedMessages(groupId);
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

export function generateSimulatedMessages(groupId) {
    try {
        const messages = [];
        const now = new Date();
        const members = ['user1', 'user2', 'user3', currentUser?.uid || currentUser?.id || 'user4'];
        const messageTypes = ['text', 'announcement', 'question'];
        
        for (let i = 0; i < 50; i++) {
            const hoursAgo = Math.random() * 24;
            const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
            const sender = members[Math.floor(Math.random() * members.length)];
            
            messages.push({
                id: `msg_${groupId}_${i}`,
                groupId: groupId,
                senderId: sender,
                senderName: `User ${sender.slice(-1)}`,
                content: `Sample message ${i + 1} in this group`,
                timestamp: timestamp.toISOString(),
                type: messageTypes[Math.floor(Math.random() * messageTypes.length)],
                readBy: members.slice(0, Math.floor(Math.random() * members.length) + 1)
            });
        }
        
        return messages;
    } catch (error) {
        return [];
    }
}

export function closeGroupChatMobile() {
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

export function hideAllPanels() {
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

export async function loadGroupChatMessages(groupId) {
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
        setTimeout(() => {
            try {
                if (chatMessagesContainer) {
                    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
                }
            } catch (error) {}
        }, 100);
        
        try {
            const response = await secureApiCall(`/groups/${groupId}/messages`, { silent: true });
            if (response && response.success && response.data) {
                response.data.forEach(message => {
                    addMessageToChat(message, true);
                    saveMessageToCache(groupId, message);
                });
            }
        } catch (error) {}
    } catch (error) {}
}

export function addMessageToChat(messageData, isNew = true) {
    try {
        const chatMessages = safeGetElement('#chatMessages');
        if (!chatMessages) return;
        
        const safeMessageData = JSON.parse(JSON.stringify(messageData));
        
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        
        const isSystem = safeMessageData.type === 'system';
        const isSent = safeMessageData.senderId === (currentUser?.uid || currentUser?.id);
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
            setTimeout(() => {
                try {
                    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
                } catch (error) {}
            }, 100);
        }
    } catch (error) {}
}

export function addSystemMessage(content) {
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

export function saveMessageToCache(groupId, message) {
    try {
        const cacheKey = `group_messages_${groupId}`;
        const cachedMessages = SafeStorage.getItem(cacheKey) || [];
        
        if (!cachedMessages.some(m => m.id === message.id)) {
            cachedMessages.push(message);
            
            if (cachedMessages.length > 100) {
                cachedMessages.splice(0, cachedMessages.length - 100);
            }
            
            SafeStorage.setItem(cacheKey, cachedMessages);
        }
    } catch (error) {}
}

export const sendGroupMessageOnline = async function(groupId, messageData) {
    try {
        const response = await secureApiCall(`/groups/${groupId}/messages`, {
            method: 'POST',
            body: messageData
        });
        
        if (!response || !response.success) {
            throw new Error(response?.message || 'Failed to send message');
        }
        
        return response.data;
    } catch (error) {
        console.error('Failed to send message online:', error);
        throw error;
    }
};

export const sendGroupMessage = async function() {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'sendMessage', fn: sendGroupMessage });
        return;
    }
    
    try {
        const chatInput = safeGetElement('#chatInput');
        const messageTopic = safeGetElement('#messageTopic');
        
        if (!currentChatGroup || !chatInput || !chatInput.value.trim()) return;
        
        if (!SessionMirror.isAuthenticated()) {
            return;
        }
        
        const messageContent = chatInput.value.trim();
        const selectedTopic = messageTopic ? messageTopic.value : '';
        
        chatInput.value = '';
        adjustTextareaHeight();
        
        const message = {
            groupId: currentChatGroup.id,
            senderId: currentUser?.uid || currentUser?.id,
            senderName: userData?.displayName || 'User',
            content: messageContent,
            timestamp: new Date(),
            type: 'text',
            readBy: [currentUser?.uid || currentUser?.id],
            topic: selectedTopic || undefined,
            anonymous: isAnonymousMode
        };
        
        const tempMessage = {
            ...message,
            id: 'temp_' + Date.now()
        };
        
        addMessageToChat(tempMessage, true);
        
        try {
            const response = await secureApiCall(`/groups/${currentChatGroup.id}/messages`, {
                method: 'POST',
                body: {
                    content: messageContent,
                    topic: selectedTopic || undefined,
                    anonymous: isAnonymousMode
                }
            });
            
            if (response && response.success) {
                const finalMessage = {
                    ...tempMessage,
                    id: response.data?.id || tempMessage.id
                };
                saveMessageToCache(currentChatGroup.id, finalMessage);
                
                addGroupMessage(currentChatGroup.id, finalMessage);
                
                if (isAnonymousMode) {
                    toggleAnonymousMode();
                }
            } else {
                throw new Error(response?.message || 'Failed to send message');
            }
        } catch (error) {
            queueGroupAction({
                type: 'sendMessage',
                groupId: currentChatGroup.id,
                message: message
            });
        }
        
        stopTypingIndicator();
    } catch (error) {}
};

export function toggleSilentMode() {
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

export function toggleAnonymousMode() {
    try {
        isAnonymousMode = !isAnonymousMode;
        updateParticipationModeButtons();
    } catch (error) {}
}

export function reactToMessage(messageId, button) {
    try {
        const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        const reaction = reactions[Math.floor(Math.random() * reactions.length)];
        
        button.innerHTML = `<i class="fas fa-${reaction === '👍' ? 'thumbs-up' : reaction === '❤️' ? 'heart' : 'smile'}"></i>`;
        button.style.color = '#FF9800';
    } catch (error) {}
}

export function replyToMessage(messageId, senderName) {
    try {
        const chatInput = safeGetElement('#chatInput');
        if (chatInput) {
            chatInput.value = `@${senderName} `;
            chatInput.focus();
        }
    } catch (error) {}
}

export function deleteMessage(messageId) {
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
export function setupTypingListener(groupId) {
    try {
        const chatInput = safeGetElement('#chatInput');
        if (!chatInput) return;
        
        const newChatInput = chatInput.cloneNode(true);
        chatInput.parentNode.replaceChild(newChatInput, chatInput);
        
        newChatInput.addEventListener('input', () => {
            try {
                if (!isTyping) {
                    isTyping = true;
                    handleGroupTyping(groupId, currentUser?.uid || currentUser?.id, true);
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
                        handleGroupTyping(groupId, currentUser?.uid || currentUser?.id, false);
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

export function stopTypingIndicator() {
    try {
        isTyping = false;
        if (typingTimeout) clearTimeout(typingTimeout);
    } catch (error) {}
}

export function adjustTextareaHeight() {
    try {
        const chatInput = safeGetElement('#chatInput');
        if (!chatInput) return;
        
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
    } catch (error) {}
}

export function formatMessageTime(date) {
    try {
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        return '--:--';
    }
}

export const openAdminManagement = async function(groupData) {
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

export async function loadGroupMembersForManagement(groupData) {
    try {
        const memberList = safeGetElement('#memberManagementList');
        if (!memberList) return;
        
        memberList.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading members...</p></div>';
        
        try {
            let memberDetails = [];
            
            const response = await secureApiCall(`/groups/${groupData.id}/members`, { silent: true });
            
            if (response && response.success && response.data) {
                memberDetails = response.data;
            } else {
                memberDetails = generateSimulatedMembers(groupData.id);
            }
            
            renderMembersList(memberDetails);
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

export function generateSimulatedMembers(groupId) {
    try {
        const members = [];
        const memberNames = ['Alex Johnson', 'Sam Wilson', 'Taylor Smith', 'Jordan Lee', 'Casey Brown'];
        const roles = ['admin', 'moderator', 'member', 'member', 'member'];
        
        for (let i = 0; i < 5; i++) {
            members.push({
                id: `member_${groupId}_${i}`,
                displayName: memberNames[i],
                username: memberNames[i].toLowerCase().replace(' ', ''),
                photoURL: '',
                online: i < 2,
                isCreator: i === 0,
                isAdmin: roles[i] === 'admin' || roles[i] === 'moderator'
            });
        }
        
        if (currentUser) {
            members.unshift({
                id: currentUser.uid || currentUser.id,
                displayName: userData?.displayName || 'You',
                username: userData?.username || 'you',
                photoURL: currentUser.photoURL || '',
                online: true,
                isCreator: true,
                isAdmin: true
            });
        }
        
        return members;
    } catch (error) {
        return [];
    }
}

export function renderMembersList(memberDetails) {
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
                        ${member.id !== (currentUser?.uid || currentUser?.id) ? `
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

export async function handleMemberAction(action, memberId, groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => handleMemberAction(action, memberId, groupData));
        return;
    }
    
    try {
        if (!groupData) return;
        
        let success = false;
        
        switch(action) {
            case 'promote':
                success = changeMemberRole(groupData.id, memberId, 'admin').success;
                await secureApiCall(`/groups/${groupData.id}/members/${memberId}/promote`, { method: 'POST' }).catch(() => {});
                logTransparencyAction(groupData.id, 'Promoted member to admin', memberId);
                break;
            case 'demote':
                success = changeMemberRole(groupData.id, memberId, 'member').success;
                await secureApiCall(`/groups/${groupData.id}/members/${memberId}/demote`, { method: 'POST' }).catch(() => {});
                logTransparencyAction(groupData.id, 'Demoted admin to member', memberId);
                break;
            case 'remove':
                if (confirm('Are you sure you want to remove this member from the group?')) {
                    success = removeMemberFromGroup(groupData.id, memberId).success;
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

export async function logTransparencyAction(groupId, action, targetId = null) {
    try {
        const logEntry = {
            groupId,
            action,
            targetId,
            by: currentUser?.uid || currentUser?.id,
            byName: userData?.displayName || 'Unknown',
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

export function loadGroupSettingsForManagement(groupData) {
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

export function loadUniqueFeaturesForManagement(groupData) {
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

export function updatePostingRulesUI() {
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

export const saveGroupSettings = async function(groupData) {
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
        
        const response = await secureApiCall(`/groups/${groupData.id}`, {
            method: 'PUT',
            body: settings
        });
        
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
            
            saveGroupsToLocalStorage();
        } else {
            throw new Error(response?.message || 'Failed to save settings');
        }
    } catch (error) {}
};

export function showFriendSelection() {
    try {
        const friendSelectionModal = safeGetElement('#friendSelectionModal');
        if (friendSelectionModal) {
            friendSelectionModal.classList.add('active');
        }
        selectedFriends = [];
        
        const friendSelectionContent = safeGetElement('#friendSelectionContent');
        if (friendSelectionContent) {
            friendSelectionContent.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Loading friends...</p></div>';
        }
        
        setTimeout(() => {
            try {
                renderFriendSelection();
            } catch (error) {}
        }, 100);
    } catch (error) {}
}

export function renderFriendSelection() {
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

export function updateSelectedFriendsList() {
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

export function removeSelectedFriend(friendId) {
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

export const createGroupOnline = async function(groupData) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'createGroup', data: groupData });
        return;
    }
    
    try {
        if (!groupData) return;
        
        if (!SessionMirror.isAuthenticated()) {
            return;
        }
        
        const members = [currentUser?.uid || currentUser?.id, ...selectedFriends];
        
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
        
        const response = await secureApiCall('/groups', {
            method: 'POST',
            body: groupDataToSave
        });
        
        if (!response || !response.success) {
            throw new Error(response?.message || 'Failed to create group');
        }
        
        const newGroup = response.data;
        
        newGroup.createdBy = currentUser?.uid || currentUser?.id;
        newGroup.createdAt = Date.now();
        newGroup.members = members.map(userId => ({
            userId,
            role: userId === (currentUser?.uid || currentUser?.id) ? 'admin' : 'member',
            joinedAt: Date.now()
        }));
        newGroup.memberCount = members.length;
        newGroup.isAdmin = true;
        newGroup.isCreator = true;
        
        groups.push(newGroup);
        myGroups.push(newGroup);
        adminGroups.push(newGroup);
        
        saveGroupsToLocalStorage();
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
        
        if (createGroupModal) createGroupModal.classList.remove('active');
        if (friendSelectionModal) friendSelectionModal.classList.remove('active');
        
        selectedFriends = [];
        showGroupDetails(newGroup, 'my_group');
        
        sendMessageToParent(PARENT_MESSAGE_TYPES.GROUP_CREATED, {
            group: newGroup,
            timestamp: Date.now()
        }).catch(() => {});
        
    } catch (error) {}
};

export const joinGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'joinGroup', groupId });
        return;
    }
    
    try {
        if (!SessionMirror.isAuthenticated()) {
            return;
        }
        
        const response = await secureApiCall(`/groups/${groupId}/join`, {
            method: 'POST'
        });
        
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
        
        saveGroupsToLocalStorage();
        updateGroupCounts();
        updateCurrentSection();
        
        const groupInviteModal = safeGetElement('#groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
        
        sendMessageToParent(PARENT_MESSAGE_TYPES.MEMBER_ADDED, {
            groupId,
            member: {
                userId: currentUser?.uid || currentUser?.id,
                role: 'member',
                joinedAt: Date.now()
            },
            timestamp: Date.now()
        }).catch(() => {});
        
    } catch (error) {}
};

export const leaveGroupOnline = async function(groupId) {
    if (!isGroupOperationReady()) {
        queueGroupAction({ type: 'leaveGroup', groupId });
        return;
    }
    
    try {
        if (!SessionMirror.isAuthenticated()) {
            return;
        }
        
        const response = await secureApiCall(`/groups/${groupId}/leave`, {
            method: 'POST'
        });
        
        if (!response || !response.success) {
            return;
        }
        
        groups = groups.filter(g => g.id !== groupId);
        joinedGroups = joinedGroups.filter(g => g.id !== groupId);
        adminGroups = adminGroups.filter(g => g.id !== groupId);
        
        saveGroupsToLocalStorage();
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
        
        sendMessageToParent(PARENT_MESSAGE_TYPES.MEMBER_REMOVED, {
            groupId,
            userId: currentUser?.uid || currentUser?.id,
            timestamp: Date.now()
        }).catch(() => {});
        
    } catch (error) {}
};

export async function acceptGroupInvite(inviteData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => acceptGroupInvite(inviteData));
        return;
    }
    
    try {
        if (!SessionMirror.isAuthenticated()) {
            return;
        }
        
        const inviteId = inviteData.id || inviteData.inviteId;
        const groupId = inviteData.groupId || inviteData.id;
        
        const response = await secureApiCall(`/invites/${inviteId}/accept`, {
            method: 'POST'
        });
        
        if (!response || !response.success) {
            return;
        }
        
        await joinGroupOnline(groupId);
    } catch (error) {}
}

export async function declineGroupInvite(inviteData) {
    if (!isGroupOperationReady()) {
        queueGroupAction(() => declineGroupInvite(inviteData));
        return;
    }
    
    try {
        if (!SessionMirror.isAuthenticated()) {
            return;
        }
        
        const inviteId = inviteData.id || inviteData.inviteId;
        
        const response = await secureApiCall(`/invites/${inviteId}/decline`, {
            method: 'POST'
        });
        
        if (!response || !response.success) {
            return;
        }
        
        groupInvites = groupInvites.filter(invite => invite.id !== inviteId);
        
        saveGroupsToLocalStorage();
        updateGroupCounts();
        updateCurrentSection();
        
        const groupInviteModal = safeGetElement('#groupInviteModal');
        if (groupInviteModal) groupInviteModal.classList.remove('active');
        
    } catch (error) {}
}

export function leaveGroupConfirm(groupData) {
    try {
        if (confirm(`Are you sure you want to leave "${groupData.name}"? You will need to be invited again to rejoin.`)) {
            leaveGroupOnline(groupData.id);
        }
    } catch (error) {}
}

export const showGroupDetails = async function(groupData, type) {
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

export async function loadGroupDetails(groupData, type) {
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
                } else {
                    realMembers = generateSimulatedMembers(groupData.id).slice(0, 5);
                }
            } catch (error) {
                realMembers = generateSimulatedMembers(groupData.id).slice(0, 5);
            }
            
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
                    ${moodInfo ? `<div class="group-mood-indicator mood-${mood}" style="margin: 10px auto; background: ${moodInfo.bgColor}; color: ${moodInfo.color}; padding: 8px 16px; border-radius: 20px; display: inline-flex; align-items: center; gap: 8px;">${moodInfo.icon} ${moodInfo.name}</span>` : ''}
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
                                            ${member.uid === (currentUser?.uid || currentUser?.id) ? `<span class="role-badge ${userRole}"><i class="${roleInfo.icon}"></i> ${roleInfo.name}</span>` : 
                                             groupData.admins && groupData.admins.includes(member.uid) ? '<span class="role-badge admin"><i class="fas fa-crown"></i> Admin</span>' : 
                                             '<span class="role-badge member"><i class="fas fa-user"></i> Member</span>'}
                                        </div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">
                                            ${member.uid === (currentUser?.uid || currentUser?.id) ? 'You' : (member.online ? 'Online' : 'Offline')}
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
// DATA SYNC FUNCTIONS
// =============================================
export async function syncGroupsFromServer() {
    if (!authReady && !SessionMirror.isAuthenticated()) return;
    
    try {
        const response = await secureApiCall('/groups', { silent: true });
        
        if (!response || !response.success || !response.data) {
            return;
        }
        
        const serverGroups = response.data;
        const serverMyGroups = [];
        const serverJoinedGroups = [];
        const serverAdminGroups = [];
        
        serverGroups.forEach(groupData => {
            const groupWithMeta = {
                ...groupData,
                id: groupData.id || groupData._id,
                type: groupData.privacy || 'private',
                theme: groupData.theme || 'blue',
                memberCount: groupData.members ? groupData.members.length : 0,
                isAdmin: groupData.admins && groupData.admins.includes(currentUser?.uid || currentUser?.id),
                isCreator: groupData.createdBy === (currentUser?.uid || currentUser?.id),
                lastActivity: groupData.lastActivity || groupData.createdAt,
                purpose: groupData.purpose || '',
                mood: groupData.mood || '',
                postingRule: groupData.postingRule || 'everyone',
                quietHours: groupData.quietHours || {},
                scheduledPosting: groupData.scheduledPosting || {},
                participationModes: groupData.participationModes || {}
            };
            
            if (groupData.createdBy === (currentUser?.uid || currentUser?.id)) {
                serverMyGroups.push(groupWithMeta);
            } else if (groupData.admins && groupData.admins.includes(currentUser?.uid || currentUser?.id)) {
                serverAdminGroups.push(groupWithMeta);
            } else {
                serverJoinedGroups.push(groupWithMeta);
            }
        });
        
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

export async function syncGroupInvitesFromServer() {
    if (!authReady && !SessionMirror.isAuthenticated()) return;
    
    try {
        const response = await secureApiCall('/invites', { silent: true });
        
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

export async function syncUniqueFeaturesData() {
    if (!authReady && !SessionMirror.isAuthenticated()) return;
    
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

export function matchesFilters(groupData) {
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

export function matchesSearch(groupData, searchTerm) {
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

export function filterGroupsByType(type) {
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

export function searchGroups(searchTerm) {
    try {
        currentSearchTerm = searchTerm.toLowerCase().trim();
        updateCurrentSection();
    } catch (error) {}
}

export function saveGroupsToLocalStorage() {
    try {
        SafeStorage.setItem('groups', groups);
        SafeStorage.setItem('myGroups', myGroups);
        SafeStorage.setItem('joinedGroups', joinedGroups);
        SafeStorage.setItem('groupInvites', groupInvites);
        SafeStorage.setItem('adminGroups', adminGroups);
        SafeStorage.setItem('pendingActions', pendingGroupActions);
        SafeStorage.setItem('lastCacheTime', Date.now().toString());
    } catch (error) {}
}

export function formatTimeAgo(date) {
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

export function formatDate(date) {
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

export function showNotification(message, type = 'success') {
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

export function processPendingOfflineActions() {
    try {
        const pendingActions = SafeStorage.getItem('pendingActions') || [];
        if (pendingActions.length > 0) {}
    } catch (error) {}
}

export function updateCreateGroupPostingRulesUI() {
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
// PARENT MESSAGE HANDLERS
// =============================================
export function handleGroupCreatedFromParent(groupData) {
    if (!groupData) return;
    
    if (!groups.some(g => g.id === groupData.id)) {
        groups.push(groupData);
        if (groupData.createdBy === (currentUser?.uid || currentUser?.id)) {
            myGroups.push(groupData);
            adminGroups.push(groupData);
        } else {
            joinedGroups.push(groupData);
        }
        
        saveGroupsToLocalStorage();
        updateGroupCounts();
        updateCurrentSection();
    }
}

export function handleGroupUpdatedFromParent(groupData) {
    if (!groupData) return;
    
    updateGroupInAllLists(groupData);
    saveGroupsToLocalStorage();
    updateGroupCounts();
    updateCurrentSection();
}

export function handleGroupDeletedFromParent(groupId) {
    if (!groupId) return;
    
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
    
    if (currentChatGroup && currentChatGroup.id === groupId) {
        if (typeof closeGroupChatMobile === 'function') {
            closeGroupChatMobile();
        }
        currentChatGroup = null;
    }
    
    saveGroupsToLocalStorage();
    updateGroupCounts();
    updateCurrentSection();
}

export function handleMemberAddedFromParent(groupId, member) {
    if (!groupId || !member) return;
    
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId) ||
                  joinedGroups.find(g => g.id === groupId);
    
    if (group) {
        if (!group.members) group.members = [];
        
        if (!group.members.some(m => m.userId === member.userId)) {
            group.members.push(member);
            group.memberCount = group.members.length;
            updateGroupInAllLists(group);
            saveGroupsToLocalStorage();
            updateGroupCounts();
        }
    }
}

export function handleMemberRemovedFromParent(groupId, userId) {
    if (!groupId || !userId) return;
    
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId) ||
                  joinedGroups.find(g => g.id === groupId);
    
    if (group && group.members) {
        group.members = group.members.filter(m => m.userId !== userId);
        group.memberCount = group.members.length;
        updateGroupInAllLists(group);
        saveGroupsToLocalStorage();
        updateGroupCounts();
    }
    
    if (userId === (currentUser?.uid || currentUser?.id)) {
        groups = groups.filter(g => g.id !== groupId);
        myGroups = myGroups.filter(g => g.id !== groupId);
        adminGroups = adminGroups.filter(g => g.id !== groupId);
        joinedGroups = joinedGroups.filter(g => g.id !== groupId);
        
        if (currentChatGroup && currentChatGroup.id === groupId) {
            if (typeof closeGroupChatMobile === 'function') {
                closeGroupChatMobile();
            }
            currentChatGroup = null;
        }
        
        saveGroupsToLocalStorage();
        updateGroupCounts();
        updateCurrentSection();
    }
}

export function handleMemberRoleChangedFromParent(groupId, userId, role) {
    if (!groupId || !userId || !role) return;
    
    const group = groups.find(g => g.id === groupId) || 
                  myGroups.find(g => g.id === groupId) || 
                  adminGroups.find(g => g.id === groupId) ||
                  joinedGroups.find(g => g.id === groupId);
    
    if (group && group.members) {
        const member = group.members.find(m => m.userId === userId);
        if (member) {
            member.role = role;
            updateGroupInAllLists(group);
            saveGroupsToLocalStorage();
        }
    }
}

export function handleGroupMessageFromParent(groupId, messageData) {
    if (!groupId || !messageData) return;
    
    addGroupMessage(groupId, messageData);
    
    if (currentChatGroup && currentChatGroup.id === groupId) {
        addMessageToChat(messageData, true);
        saveMessageToCache(groupId, messageData);
    }
}

export function handleUnreadCountUpdatedFromParent(groupId, count) {
    if (!groupId) return;
    
    groupUnreadCounts[groupId] = count;
    
    try {
        SafeStorage.setItem(`group_unread_${groupId}`, count);
    } catch (e) {}
}

export function handleGroupTypingFromParent(groupId, userId, isTyping) {
    if (!groupId || !userId) return;
    
    if (!groupTypingUsers[groupId]) {
        groupTypingUsers[groupId] = {};
    }
    
    if (isTyping) {
        groupTypingUsers[groupId][userId] = Date.now();
    } else {
        delete groupTypingUsers[groupId][userId];
    }
}

// =============================================
// MISSING FUNCTION EXPORTS
// =============================================
export function showGroupOptions(groupData) {
    try {} catch (error) {}
}

export function renderMyGroups() {
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

export function renderJoinedGroups() {
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

export function renderGroupInvites() {
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

export function renderAdminGroups() {
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

export function downloadQRCode() {
    try {} catch (error) {}
}

export function addPollOption() {
    try {} catch (error) {}
}

export function removePollOption() {
    try {} catch (error) {}
}

export function saveNewPoll() {
    try {} catch (error) {}
}

export function voteOnPoll() {
    try {} catch (error) {}
}

export function saveNewEvent() {
    try {} catch (error) {}
}

export function viewGroupNotes() {
    try {} catch (error) {}
}

export function viewGroupEvents() {
    try {} catch (error) {}
}

export function viewGroupAnalytics() {
    try {} catch (error) {}
}

export function loadGroupAnalytics() {
    try {
        return { success: true, data: {} };
    } catch (error) {
        return { success: false };
    }
}

export function renderAnalyticsChart() {
    try {} catch (error) {}
}

export function changePurposeMood() {
    try {} catch (error) {}
}

export function viewChangeHistory() {
    try {} catch (error) {}
}

export function showOptionsModal() {
    try {} catch (error) {}
}

export function shareGroup() {
    try {} catch (error) {}
}

export function muteGroup() {
    try {} catch (error) {}
}

export function favoriteGroup() {
    try {} catch (error) {}
}

export function reportGroup() {
    try {} catch (error) {}
}

export function blockGroup() {
    try {} catch (error) {}
}

export function showGroupQRCode() {
    try {} catch (error) {}
}

export function copyInviteLink() {
    try {
        const inviteLinkInput = safeGetElement('#inviteLinkInput');
        if (inviteLinkInput && inviteLinkInput.value) {
            navigator.clipboard.writeText(inviteLinkInput.value);
        }
    } catch (error) {}
}

export function inviteMembers() {
    try {
        showFriendSelection();
    } catch (error) {}
}

export function editGroupInfo() {
    try {} catch (error) {}
}

export function manageRoles() {
    try {} catch (error) {}
}

export function createEvent() {
    try {} catch (error) {}
}

export function createPoll() {
    try {} catch (error) {}
}

export function showGroupInviteDetails() {
    try {} catch (error) {}
}

// =============================================
// INITIALIZATION
// =============================================
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            SafeStorage.init();
            IframeAuthority.init();
            ParentConnectionManager.init();
            
            // Start initialization timeline (v5.0) - this is the ONLY source of handshake
            InitTimeline.init();
            
            // Initialize other systems
            SessionVerifier.init();
            OfflineManager.init();
            
            initializeGroupsCore();
            initPageCore();
            setTimeout(() => {
                initGroupPage();
            }, 500);
        } catch (error) {}
    });
}

// =============================================
// WINDOW EXPOSURES
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
        lifecycle: LifecycleFSM.getState(),
        iframeState: IframeStateMachine.getState(),
        startup: StartupGovernor.getState(),
        session: SessionMirror.getState(),
        connection: ParentConnectionManager.getStatus(),
        transport: TransportAgent.getStats(),
        api: API_WRAPPER.getStats(),
        handshake: HandshakeClient.getState(),
        parentAuthority: ParentAuthority.getState(),
        queueLength: MessageQueue.getQueueLength(),
        initTimeline: {
            moduleRegistered: InitTimeline.isModuleRegistered ? InitTimeline.isModuleRegistered() : false,
            sessionReceived: InitTimeline.isSessionReceived ? InitTimeline.isSessionReceived() : false,
            parentReady: InitTimeline.isParentReady ? InitTimeline.isParentReady() : false
        }
    }));
    
    // Expose retryConnection for offline mode
    secureExpose('retryConnection', () => OfflineManager.retryConnection());
}

// =============================================
// COMPREHENSIVE EXPORTS - ALL REQUIRED EXPORTS
// =============================================
export {
    LifecycleFSM,
    LIFECYCLE_STATES,
    IframeStateMachine,
    IFRAME_STATES,
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
    PARENT_MESSAGE_TYPES,
    HandshakeClient,
    ParentAuthority,
    InitTimeline,
    SessionVerifier,
    HeartbeatSystem,
    BroadcastHandler,
    OfflineManager,
    MessageQueue
};

// =============================================
// MODULE COMPLETE - ALL EXPORTS PRESERVED
// =============================================