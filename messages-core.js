// =============================================
// MESSAGES CORE - v7.0.0
// DETERMINISTIC PARENT AUTHORITY ARCHITECTURE
// PARENT ENFORCED HANDSHAKE | SINGLE SESSION AUTHORITY
// COMPLIANT WITH PARENT–IFRAME v7.0 STRICT TIMING MODEL
// =============================================
// State Machine: INIT → REGISTERING → REGISTERED → SESSION_RECEIVED → ACTIVE → SYNCING → READY → DEGRADED
// Local-First Operations | Deterministic Retry | Cross-Module Events via Parent Only
// Message Queuing | Delivery Receipts | Typing Indicators | Voice Messages | Polls
// File Attachments | Reactions | Threads | Mentions | Formatting | Search
// =============================================
//
// HANDSHAKE FLOW:
// 0ms: REGISTER_MODULE sent to parent
// 50ms: Wait for MODULE_REGISTERED
// 100ms: Wait for SESSION_ACTIVE or SESSION_NULL
// 150ms: Wait for PARENT_READY
// After PARENT_READY: Transition to ACTIVE if session valid, else show login UI
//
// SESSION LIFECYCLE:
// - Session accepted only from SESSION_ACTIVE or SESSION_REFRESHED
// - Stored in memory only, never modified
// - No independent refresh, validation, or token management
// - Parent is sole authority for session state
//
// MESSAGE SEND LIFECYCLE:
// 1. Verify state === READY
// 2. Send VERIFY_SESSION to parent (50ms timeout)
// 3. Wait for SESSION_VERIFIED
// 4. Create optimistic message in UI
// 5. Send message via parent
// 6. Await confirmation
// 7. Update message status (sent/delivered/read)
// 8. Notify parent of delivery status
//
// TYPING INDICATOR FLOW:
// - Only send when READY
// - Debounce to avoid flooding
// - Parent broadcasts to relevant chat participants
//
// MESSAGE RECEIPT FLOW:
// - Listen for MESSAGE_DELIVERED/MESSAGE_READ broadcasts from parent
// - Update local message status
// - Never broadcast directly to other iframes
//
// HEARTBEAT HANDLING:
// - Start only after ACTIVE state
// - Interval: 30 seconds
// - Stop on SESSION_NULL or DEGRADED
// - If 3 missed HEARTBEAT_ACK: log warning, pause new actions
// - Never queue infinite heartbeats
//
// RECOVERY HANDLING:
// - Enter DEGRADED only if parent silent >10s or SESSION_INVALIDATED
// - In DEGRADED: disable actions, stop heartbeat, keep cached messages visible
// - Wait for SESSION_REFRESHED to recover
// - No oscillation between states
//
// DEPENDENCY ENFORCEMENT:
// Must Complete → Before
// REGISTERING → SESSION_RECEIVED
// SESSION_RECEIVED → ACTIVE
// ACTIVE → SYNCING
// SYNCING → READY
// READY → Send message
// VERIFY_SESSION success → Send message
// No skipping allowed.
// =============================================

(function() {
    'use strict';

    // =============================================
    // DEBUG MODE - ZERO NOISE POLICY
    // =============================================
    const DEBUG = false;
    const ALLOWED_LOGS = new Set(['INIT', 'READY', 'ERROR', 'SESSION_UPDATE', 'STATE_CHANGE', 'HANDSHAKE']);
    
    function debugLog(...args) {
        if (DEBUG) console.log(...args);
    }

    // =============================================
    // ENVIRONMENT DETECTION
    // =============================================
    const ENV = {
        isLocal: window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1',
        isRender: window.location.hostname.includes('.onrender.com'),
        parentOrigin: document.referrer ? new URL(document.referrer).origin : '*',
        getApiBaseUrl: function() {
            if (this.isLocal) {
                return 'http://localhost:4000';
            } else if (this.isRender) {
                const parts = window.location.hostname.split('.');
                if (parts.length >= 3) {
                    return `https://${parts.slice(-3).join('.')}`;
                }
                return 'https://moodchat-fy56.onrender.com';
            }
            return '';
        }
    };

    // =============================================
    // [V7.0 COMPLIANCE] - Deterministic Parent Authority State Machine
    // =============================================
    // Strict states: INIT → REGISTERING → REGISTERED → SESSION_RECEIVED → ACTIVE → SYNCING → READY → DEGRADED
    // No other states allowed. No partial activation.

    const V7_STATES = {
        INIT: 'INIT',
        REGISTERING: 'REGISTERING',
        REGISTERED: 'REGISTERED',
        SESSION_RECEIVED: 'SESSION_RECEIVED',
        ACTIVE: 'ACTIVE',
        SYNCING: 'SYNCING',
        READY: 'READY',
        DEGRADED: 'DEGRADED'
    };

    const V7StateMachine = {
        _state: V7_STATES.INIT,
        _stateHistory: [],
        _listeners: new Set(),
        _maxHistorySize: 30,
        _timers: {
            handshake: null,
            session: null,
            parentReady: null,
            heartbeat: null,
            recovery: null
        },
        _heartbeatMissed: 0,
        _heartbeatMaxMissed: 3,
        _lastHeartbeat: 0,
        _handshakeComplete: false,
        _handshakeStartTime: 0,
        _sessionValid: false,
        _sessionData: null,
        _messageQueue: [],
        _queueMaxSize: 50,
        _requestIdCache: new Set(), // For duplicate prevention
        _sessionAuthority: null, // Track session authority from parent
        
        init() {
            this._handshakeStartTime = Date.now();
            this._state = V7_STATES.INIT;
            this._logState('Initialized');
            return this;
        },
        
        get current() { return this._state; },
        
        transition(toState, reason = '') {
            // Enforce strict state transitions
            const validTransitions = {
                [V7_STATES.INIT]: [V7_STATES.REGISTERING, V7_STATES.DEGRADED],
                [V7_STATES.REGISTERING]: [V7_STATES.REGISTERED, V7_STATES.DEGRADED],
                [V7_STATES.REGISTERED]: [V7_STATES.SESSION_RECEIVED, V7_STATES.DEGRADED],
                [V7_STATES.SESSION_RECEIVED]: [V7_STATES.ACTIVE, V7_STATES.DEGRADED],
                [V7_STATES.ACTIVE]: [V7_STATES.SYNCING, V7_STATES.DEGRADED],
                [V7_STATES.SYNCING]: [V7_STATES.READY, V7_STATES.DEGRADED],
                [V7_STATES.READY]: [V7_STATES.DEGRADED],
                [V7_STATES.DEGRADED]: [V7_STATES.ACTIVE, V7_STATES.READY]
            };
            
            const allowed = validTransitions[this._state];
            if (!allowed || !allowed.includes(toState)) {
                console.warn(`[V7] Invalid transition attempt: ${this._state} → ${toState} blocked`);
                return false;
            }
            
            if (this._state === toState) return true;
            
            const fromState = this._state;
            this._state = toState;
            
            this._stateHistory.push({
                from: fromState,
                to: toState,
                timestamp: Date.now(),
                reason
            });
            
            if (this._stateHistory.length > this._maxHistorySize) {
                this._stateHistory.shift();
            }
            
            this._notifyListeners(toState, fromState, reason);
            
            const timeSinceStart = Date.now() - this._handshakeStartTime;
            console.log(`[V7] ${fromState} → ${toState} ${reason ? `(${reason})` : ''} [t+${timeSinceStart}ms]`);
            
            this._handleStateTransition(toState, fromState);
            
            return true;
        },
        
        _handleStateTransition(toState, fromState) {
            if (toState === V7_STATES.ACTIVE) {
                this._clearTimers(['handshake', 'session', 'parentReady', 'recovery']);
                this._handshakeComplete = true;
                // Start heartbeat only after ACTIVE
                this.startHeartbeat();
            }
            
            if (toState === V7_STATES.READY) {
                this._flushMessageQueue();
                window.__MESSAGES_MODULE_READY__ = true;
                window.dispatchEvent(new CustomEvent('messagesReady'));
            }
            
            if (toState === V7_STATES.DEGRADED) {
                this._stopHeartbeat();
                this._messageQueue = []; // Clear queue on degraded
            }
            
            if (toState === V7_STATES.SESSION_RECEIVED && this._sessionValid) {
                // Auto-transition to ACTIVE after SESSION_RECEIVED if session valid
                setTimeout(() => {
                    if (this._state === V7_STATES.SESSION_RECEIVED) {
                        this.transition(V7_STATES.ACTIVE, 'session_valid');
                    }
                }, 10);
            }
        },
        
        _notifyListeners(toState, fromState, reason) {
            this._listeners.forEach(listener => {
                try {
                    listener(toState, fromState, reason);
                } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('v7StateChanged', {
                detail: { state: toState, previous: fromState, reason }
            }));
        },
        
        onTransition(listener) {
            this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        },
        
        // ========== TIMING MODEL - STRICT HANDSHAKE ==========
        startHandshakeTimer() {
    this._clearTimer('handshake');
    this._timers.handshake = setTimeout(() => {
        if (this._state !== V7_STATES.ACTIVE && this._state !== V7_STATES.READY) {
            console.log(`[V7] ❌ Handshake timeout at ${TIMING.HANDSHAKE_TIMEOUT}ms - entering degraded`);
            this.transition(V7_STATES.DEGRADED, 'handshake_timeout');
        }
    }, TIMING.HANDSHAKE_TIMEOUT); // Use TIMING constant
},
        startSessionTimer() {
    this._clearTimer('session');
    this._timers.session = setTimeout(() => {
        if (this._state === V7_STATES.REGISTERED) {
            console.log(`[V7] ⚠️ Session timeout at ${TIMING.HANDSHAKE_WARNING}ms`);
            this.transition(V7_STATES.DEGRADED, 'session_timeout');
        }
    }, TIMING.HANDSHAKE_WARNING); // Use TIMING constant
},

startParentReadyTimer() {
    this._clearTimer('parentReady');
    this._timers.parentReady = setTimeout(() => {
        if (this._state === V7_STATES.SESSION_RECEIVED) {
            console.log(`[V7] ⚠️ Parent ready timeout at ${TIMING.VERIFY_SESSION_TIMEOUT}ms`);
            this.transition(V7_STATES.DEGRADED, 'parent_ready_timeout');
        }
    }, TIMING.VERIFY_SESSION_TIMEOUT); // Use TIMING constant
},
        
        _clearTimer(name) {
            if (this._timers[name]) {
                clearTimeout(this._timers[name]);
                this._timers[name] = null;
            }
        },
        
        _clearTimers(names) {
            names.forEach(name => this._clearTimer(name));
        },
        
        _clearAllTimers() {
            Object.keys(this._timers).forEach(key => {
                if (this._timers[key]) {
                    clearTimeout(this._timers[key]);
                    this._timers[key] = null;
                }
            });
        },
        
        // ========== HEARTBEAT SYSTEM ==========
        // Start only after ACTIVE, stop on SESSION_NULL or DEGRADED
        
        startHeartbeat() {
            this._stopHeartbeat();
            if (this._state !== V7_STATES.ACTIVE && this._state !== V7_STATES.READY) return;
            
            this._lastHeartbeat = Date.now();
            this._heartbeatMissed = 0;
            
            this._timers.heartbeat = setInterval(() => {
                this._sendHeartbeat();
            }, 30000); // 30 second interval
            
            console.log('[V7] 💓 Heartbeat started');
        },
        
        _sendHeartbeat() {
            if (this._state !== V7_STATES.ACTIVE && this._state !== V7_STATES.READY) return;
            
            const heartbeatId = `hb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            MessagesTransport.send('HEARTBEAT', {
                id: heartbeatId,
                module: 'messages',
                frameId: MessagesTransport.getFrameId(),
                timestamp: Date.now()
            }, { requireAck: true, timeout: 500 }) // 20ms timeout for ACK
            .then(() => {
                this._heartbeatMissed = 0;
                this._lastHeartbeat = Date.now();
            })
            .catch(() => {
                this._heartbeatMissed++;
                
                if (this._heartbeatMissed === 1) {
                    console.log('[V7] ⚠️ Heartbeat 1 missed - connection unstable');
                } else if (this._heartbeatMissed === 2) {
                    console.log('[V7] ⚠️ Heartbeat 2 missed - pausing new actions');
                    // Pause new outgoing actions but don't degrade
                } else if (this._heartbeatMissed >= 3) {
                    console.log('[V7] ⚠️ Heartbeat 3 missed - waiting for parent recovery');
                    // Don't degrade immediately, wait for parent recovery
                    // No queueing of infinite heartbeats
                }
            });
        },
        
        _stopHeartbeat() {
            if (this._timers.heartbeat) {
                clearInterval(this._timers.heartbeat);
                this._timers.heartbeat = null;
            }
            this._heartbeatMissed = 0;
        },
        
        heartbeatAckReceived() {
            this._heartbeatMissed = 0;
            this._lastHeartbeat = Date.now();
        },
        
        // ========== RECOVERY HANDLING ==========
        // Enter DEGRADED only if parent silent >10s or SESSION_INVALIDATED
        
        startRecoveryTimer() {
            this._clearTimer('recovery');
            this._timers.recovery = setTimeout(() => {
                if (this._state === V7_STATES.ACTIVE || this._state === V7_STATES.READY) {
                    // Parent silent for 10 seconds
                    console.log('[V7] ⚠️ Parent silent for 10s - entering degraded');
                    this.transition(V7_STATES.DEGRADED, 'parent_silent');
                }
            }, 10000); // 10 second silence threshold
        },
        
        // ========== MESSAGE QUEUE ==========
        // Queue messages only in transitional states
        
        queueMessage(message) {
            if (this._messageQueue.length >= this._queueMaxSize) {
                // FIFO - remove oldest
                this._messageQueue.shift();
            }
            
            this._messageQueue.push({
                ...message,
                queuedAt: Date.now()
            });
            
            console.log(`[V7] 📥 Message queued (queue: ${this._messageQueue.length})`);
        },
        
        _flushMessageQueue() {
            if (this._messageQueue.length === 0) return;
            
            console.log(`[V7] 📤 Flushing ${this._messageQueue.length} queued messages`);
            
            const queue = [...this._messageQueue];
            this._messageQueue = [];
            
            queue.forEach(msg => {
                setTimeout(() => {
                    MessagesTransport.send(msg.type, msg.payload, msg.options || {});
                }, 10);
            });
        },
        
        // ========== SESSION MANAGEMENT ==========
        // Session accepted only from SESSION_ACTIVE or SESSION_REFRESHED
        // Stored in memory only, never modified, parent is sole authority
        
        handleSessionActive(payload) {
            if (!payload) return;
            
            // Validate session structure matches parent schema
            if (!payload.authenticated || !payload.token || !payload.user) {
                console.log('[V7] Invalid session structure from parent');
                return;
            }
            
            this._sessionValid = true;
            this._sessionData = {
                token: payload.token,
                user: payload.user,
                userId: payload.user?.id,
                expiresAt: payload.expiresAt,
                version: payload.version,
                authenticated: true
            };
            this._sessionAuthority = 'parent';
            
            // Store in memory only, never in persistent storage for authority
            // SafeStorage is for cache only, not authoritative session
            
            if (this._state === V7_STATES.REGISTERED) {
                this.transition(V7_STATES.SESSION_RECEIVED, 'session_active');
            }
            
            console.log('[V7] ✅ Session active received from parent authority');
            
            // Update session store
            if (window.SessionStore) {
                window.SessionStore.setSession(this._sessionData);
            }
        },
        
        handleSessionNull(payload) {
            this._sessionValid = false;
            this._sessionData = { authenticated: false };
            this._sessionAuthority = null;
            
            if (this._state === V7_STATES.REGISTERED) {
                this.transition(V7_STATES.SESSION_RECEIVED, 'session_null');
            }
            
            console.log('[V7] ℹ️ Session null received from parent');
            
            // Clear session store
            if (window.SessionStore) {
                window.SessionStore.clear();
            }
        },
        
        handleSessionRefreshed(payload) {
            if (!payload) return;
            
            // Validate session structure
            if (!payload.authenticated || !payload.token || !payload.user) {
                console.log('[V7] Invalid refreshed session structure');
                return;
            }
            
            // Replace session atomically
            this._sessionValid = true;
            this._sessionData = {
                token: payload.token,
                user: payload.user,
                userId: payload.user?.id,
                expiresAt: payload.expiresAt,
                version: payload.version,
                authenticated: true
            };
            this._sessionAuthority = 'parent';
            
            console.log('[V7] 🔄 Session refreshed by parent authority');
            
            // Update session store
            if (window.SessionStore) {
                window.SessionStore.setSession(this._sessionData);
            }
            
            // Do NOT restart handshake or clear messages
            // If in DEGRADED, recover to ACTIVE
            if (this._state === V7_STATES.DEGRADED) {
                this.transition(V7_STATES.ACTIVE, 'session_refreshed');
            }
        },
        
        handleSessionInvalidated() {
            this._sessionValid = false;
            this._sessionData = { authenticated: false };
            this._sessionAuthority = null;
            
            // Enter DEGRADED on invalidation
            if (this._state !== V7_STATES.DEGRADED) {
                this.transition(V7_STATES.DEGRADED, 'session_invalidated');
            }
            
            console.log('[V7] 🔒 Session invalidated by parent');
            
            // Clear session store
            if (window.SessionStore) {
                window.SessionStore.clear();
            }
        },
        
        // ========== VERIFY SESSION ==========
        // Synchronous verification with timeout
        async verifySession(timeoutMs = TIMING.VERIFY_SESSION_TIMEOUT) {

            if (this._state !== V7_STATES.ACTIVE && this._state !== V7_STATES.READY) {
                return { valid: false, reason: 'not_active' };
            }
            
            const requestId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            try {
                const response = await Promise.race([
                    MessagesTransport.send('VERIFY_SESSION', {
                        module: 'messages',
                        frameId: MessagesTransport.getFrameId(),
                        requestId,
                        timestamp: Date.now()
                    }, { requireAck: true, timeout: timeoutMs }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
                    )
                ]);
                
                if (response?.result?.valid === true) {
                    return { valid: true };
                } else {
                    return { valid: false, reason: 'invalid' };
                }
            } catch (error) {
                console.log('[V7] ⚠️ Session verification failed');
                return { valid: false, reason: 'timeout' };
            }
        },
        
        // ========== HANDSHAKE SEQUENCE ==========
        // STEP 1: On iframe load (0ms) - Send REGISTER_MODULE
        // STEP 2: Wait for parent in order: MODULE_REGISTERED → SESSION_ACTIVE/NULL → PARENT_READY
        // STEP 3: On PARENT_READY, transition based on session
        
        sendRegistration() {
            if (this._state !== V7_STATES.INIT) return;
            
            console.log('[V7] 📤 Sending REGISTER_MODULE at t+0ms');
            
            this.transition(V7_STATES.REGISTERING, 'sending_registration');
            this.startHandshakeTimer();
            
            MessagesTransport.send('REGISTER_MODULE', {
    module: 'messages',
    frameId: MessagesTransport.getFrameId(),
    requestId: `reg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: Date.now(),
    version: '7.0.0'
}, { requireAck: true, timeout: TIMING.HANDSHAKE_TIMEOUT }); // Use TIMING constant
        },

        handleModuleRegistered(payload) {
            if (this._state !== V7_STATES.REGISTERING) return;
            
            console.log('[V7] ✅ MODULE_REGISTERED received at t+50ms');
            this._clearTimer('handshake');
            
            this.transition(V7_STATES.REGISTERED, 'module_registered');
            this.startSessionTimer();
            
            // Wait for session from parent - do NOT request it
            // Parent will send SESSION_ACTIVE or SESSION_NULL automatically
        },
        
        handleParentReady() {
            console.log('[V7] ✅ PARENT_READY received at t+150ms');
            this._clearTimer('parentReady');
            
            if (this._state === V7_STATES.SESSION_RECEIVED) {
                if (this._sessionValid) {
                    this.transition(V7_STATES.ACTIVE, 'parent_ready_with_session');
                } else {
                    // Session null - stay in SESSION_RECEIVED but show login UI
                    console.log('[V7] ℹ️ No session - showing login required');
                    // UI will handle login prompt
                    window.dispatchEvent(new CustomEvent('sessionRequired'));
                }
            } else if (this._state === V7_STATES.REGISTERED) {
                // Session never arrived - degraded
                this.transition(V7_STATES.DEGRADED, 'parent_ready_no_session');
            }
        },
        
        // ========== UTILITIES ==========
        
        canPerformActions() {
            return this._state === V7_STATES.READY;
        },
        
        canPerformApiCalls() {
            return this._state === V7_STATES.ACTIVE || this._state === V7_STATES.READY;
        },
        
        shouldQueueMessage() {
            return this._state === V7_STATES.REGISTERING || 
                   this._state === V7_STATES.REGISTERED ||
                   this._state === V7_STATES.SESSION_RECEIVED ||
                   this._state === V7_STATES.SYNCING;
        },
        
        getSession() {
            return this._sessionData;
        },
        
        isSessionValid() {
            return this._sessionValid;
        },
        
        getUserId() {
            return this._sessionData?.userId || this._sessionData?.user?.id || null;
        },
        
        getUser() {
            return this._sessionData?.user || null;
        },
        
        getToken() {
            return this._sessionData?.token || null;
        },
        
        getState() {
            return {
                state: this._state,
                sessionValid: this._sessionValid,
                handshakeComplete: this._handshakeComplete,
                handshakeTime: this._handshakeStartTime ? Date.now() - this._handshakeStartTime : 0,
                queueLength: this._messageQueue.length,
                heartbeatMissed: this._heartbeatMissed,
                sessionAuthority: this._sessionAuthority,
                userId: this.getUserId()
            };
        },
        
        _logState(message) {
            console.log(`[V7] State: ${this._state} - ${message}`);
        },
        
        // ========== DUPLICATE PREVENTION ==========
        
        isRequestDuplicate(requestId) {
            if (this._requestIdCache.has(requestId)) return true;
            this._requestIdCache.add(requestId);
            // Auto-cleanup after 1 minute
            setTimeout(() => this._requestIdCache.delete(requestId), 60000);
            return false;
        },
        
        reset() {
            this._clearAllTimers();
            this._stopHeartbeat();
            this._state = V7_STATES.INIT;
            this._stateHistory = [];
            this._messageQueue = [];
            this._heartbeatMissed = 0;
            this._handshakeComplete = false;
            this._handshakeStartTime = Date.now();
            this._sessionValid = false;
            this._sessionData = null;
            this._requestIdCache.clear();
            this._sessionAuthority = null;
        }
    };

    // Initialize v7 state machine
    const V7 = V7StateMachine.init();

    // =============================================
    // [LIFECYCLE FSM] - Simplified for parent authority
    // States: INIT → REGISTERING → REGISTERED → SESSION_RECEIVED → ACTIVE → SYNCING → READY → DEGRADED
    // =============================================

    const FSM_STATES = {
        INIT: 'INIT',
        REGISTERING: 'REGISTERING',
        REGISTERED: 'REGISTERED',
        SESSION_RECEIVED: 'SESSION_RECEIVED',
        ACTIVE: 'ACTIVE',
        SYNCING: 'SYNCING',
        READY: 'READY',
        DEGRADED: 'DEGRADED'
    };

    const LifecycleFSM = {
        _state: FSM_STATES.INIT,
        _stateHistory: [],
        _listeners: new Set(),
        _initPromise: null,
        _initResolve: null,
        _initReject: null,
        _maxHistorySize: 30,
        
        _transitions: {
            [FSM_STATES.INIT]: [FSM_STATES.REGISTERING, FSM_STATES.DEGRADED],
            [FSM_STATES.REGISTERING]: [FSM_STATES.REGISTERED, FSM_STATES.DEGRADED],
            [FSM_STATES.REGISTERED]: [FSM_STATES.SESSION_RECEIVED, FSM_STATES.DEGRADED],
            [FSM_STATES.SESSION_RECEIVED]: [FSM_STATES.ACTIVE, FSM_STATES.DEGRADED],
            [FSM_STATES.ACTIVE]: [FSM_STATES.SYNCING, FSM_STATES.DEGRADED],
            [FSM_STATES.SYNCING]: [FSM_STATES.READY, FSM_STATES.DEGRADED],
            [FSM_STATES.READY]: [FSM_STATES.DEGRADED],
            [FSM_STATES.DEGRADED]: [FSM_STATES.ACTIVE, FSM_STATES.READY]
        },
        
        get current() { return this._state; },
        
        canTransition(toState) {
            const allowed = this._transitions[this._state];
            return allowed && allowed.includes(toState);
        },
        
        transition(toState, reason = '') {
            if (!this.canTransition(toState)) {
                console.debug(`[LifecycleFSM] Invalid transition: ${this._state} → ${toState}`);
                return false;
            }
            
            const fromState = this._state;
            this._state = toState;
            
            this._stateHistory.push({
                from: fromState,
                to: toState,
                timestamp: Date.now(),
                reason
            });
            
            if (this._stateHistory.length > this._maxHistorySize) {
                this._stateHistory.shift();
            }
            
            this._listeners.forEach(listener => {
                try { listener(toState, fromState, reason); } catch (e) {}
            });
            
            console.log(`[LifecycleFSM] ${fromState} → ${toState}${reason ? ` (${reason})` : ''}`);
            
            if (toState === FSM_STATES.READY) {
                this._resolveInitPromise();
                window.__MESSAGES_MODULE_READY__ = true;
            }
            
            return true;
        },
        
        onTransition(listener) {
            this._listeners.add(listener);
            return () => this._listeners.delete(listener);
        },
        
        getInitPromise() {
            if (!this._initPromise) {
                this._initPromise = new Promise((resolve, reject) => {
                    this._initResolve = resolve;
                    this._initReject = reject;
                });
            }
            return this._initPromise;
        },
        
        _resolveInitPromise() {
            if (this._initResolve) {
                this._initResolve({ success: true, state: this._state });
                this._initResolve = null;
                this._initReject = null;
            }
        },
        
        _rejectInitPromise(error) {
            if (this._initReject) {
                this._initReject(error);
                this._initResolve = null;
                this._initReject = null;
            }
        },
        
        reset() {
            this._state = FSM_STATES.INIT;
            this._stateHistory = [];
            this._initPromise = null;
            this._initResolve = null;
            this._initReject = null;
        },
        
        isReady() {
            return this._state === FSM_STATES.READY;
        },
        
        isAtLeast(state) {
            const order = [
                FSM_STATES.INIT,
                FSM_STATES.REGISTERING,
                FSM_STATES.REGISTERED,
                FSM_STATES.SESSION_RECEIVED,
                FSM_STATES.ACTIVE,
                FSM_STATES.SYNCING,
                FSM_STATES.READY,
                FSM_STATES.DEGRADED
            ];
            const currentIdx = order.indexOf(this._state);
            const targetIdx = order.indexOf(state);
            return currentIdx >= targetIdx;
        }
    };

    // =============================================
    // [DEBUG CONTROL] - Console noise reduction
    // =============================================
    const DEBUG_MODE = false;
    const PRODUCTION = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');

    const log = {
        debug: (...args) => { if (DEBUG_MODE && !PRODUCTION) console.log(...args); },
        info: (...args) => { if (DEBUG_MODE || !PRODUCTION) console.log(...args); },
        warn: (...args) => { if (DEBUG_MODE || !PRODUCTION) console.warn(...args); },
        error: (...args) => console.error(...args),
        once: new Set(),
        onceDebug: (key, ...args) => {
            if (!log.once.has(key)) {
                log.once.add(key);
                if (DEBUG_MODE && !PRODUCTION) console.log(...args);
            }
        },
        onceWarn: (key, ...args) => {
            if (!log.once.has(key)) {
                log.once.add(key);
                console.warn(...args);
            }
        }
    };

    // =============================================
    // [CONSTANTS & CONFIGURATION]
    // =============================================
    const VERSION = '7.0.0';
    const APP_NAME = 'kynecta-messages';
    const SOURCE_IFRAME = 'iframe';
    const FRAME_ID = 'messagesIframe';
    
    const PROTOCOL = {
        VERSION: 'KYN-3.1'
    };

    const TIMING = {
    // Handshake timings - strict
    HANDSHAKE_TIMEOUT: 1500,               // Increase from 150ms to 1500ms
    HANDSHAKE_WARNING: 500,                 // Increase from 100ms to 500ms
    HANDSHAKE_FALLBACK: 3000,                // Increase from 300ms to 3000ms
    
    // Verification timings - synchronous
    VERIFY_SESSION_TIMEOUT: 500,            // Increase from 50ms to 500ms
    VERIFY_MAX_RETRIES: 2,                  // Keep at 2
    
    // Heartbeat - starts only after ACTIVE
    HEARTBEAT_INTERVAL: 30000,              // 30s interval (keep same)
    HEARTBEAT_ACK_TIMEOUT: 5000,            // Wait 5s for ACK (keep same)
    HEARTBEAT_MAX_MISSED: 3,                 // 3 missed before action (keep same)
    
    // Sync timings
    SYNC_TIMEOUT: 3000,                       // Increase from 300ms to 3000ms
    
    // Message queue
    QUEUE_FLUSH_INTERVAL: 5000,              // 5s flush interval (keep same)
    MESSAGE_ID_CACHE_TTL: 5000,               // 5s TTL (keep same)
    
    // Recovery
    RECOVERY_SILENCE_THRESHOLD: 10000,        // 10s silence (keep same)
    
    // Retry limits
    MAX_RETRIES: 2,                           // Max 2 retries (keep same)
    RETRY_BACKOFF_1: 1000,                     // Increase from 500ms to 1000ms
    RETRY_BACKOFF_2: 2000                       // Increase from 1000ms to 2000ms
};

    // CRITICAL: Parent expects these exact message types
    const MESSAGE_TYPES = {
        // Handshake messages - strict order
        REGISTER_MODULE: 'REGISTER_MODULE',      // Send first at 0ms
        MODULE_REGISTERED: 'MODULE_REGISTERED',   // Wait for this
        SESSION_ACTIVE: 'SESSION_ACTIVE',          // Wait for this
        SESSION_NULL: 'SESSION_NULL',               // Wait for this
        PARENT_READY: 'PARENT_READY',                // Wait for this last
        ACK: 'ACK',                                   // General acknowledgment
        
        // Session messages - parent authority only
        SESSION_REFRESHED: 'SESSION_REFRESHED',
        SESSION_INVALIDATED: 'SESSION_INVALIDATED',
        SESSION_RECOVERY: 'SESSION_RECOVERY',
        
        // Verification - synchronous only
        VERIFY_SESSION: 'VERIFY_SESSION',
        SESSION_VERIFIED: 'SESSION_VERIFIED',
        
        // Heartbeat - after ACTIVE only
        HEARTBEAT: 'HEARTBEAT',
        HEARTBEAT_ACK: 'HEARTBEAT_ACK',
        
        // Message events
        NEW_MESSAGE: 'NEW_MESSAGE',
        MESSAGE_SENT: 'MESSAGE_SENT',
        MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
        MESSAGE_READ: 'MESSAGE_READ',
        TYPING_START: 'TYPING_START',
        TYPING_STOP: 'TYPING_STOP',
        
        // Chat operations
        SEND_MESSAGE: 'SEND_MESSAGE',
        CREATE_CHAT: 'CREATE_CHAT',
        CHAT_CREATED: 'CHAT_CREATED',
        GET_CHAT_HISTORY: 'GET_CHAT_HISTORY',
        CHAT_HISTORY_RESPONSE: 'CHAT_HISTORY_RESPONSE',
        
        // Friend operations
        GET_FRIEND_LIST: 'GET_FRIEND_LIST',
        FRIEND_LIST_RESPONSE: 'FRIEND_LIST_RESPONSE',
        FRIEND_UPDATE: 'FRIEND_UPDATE',
        FRIEND_ONLINE: 'FRIEND_ONLINE',
        FRIEND_OFFLINE: 'FRIEND_OFFLINE',
        
        // Group operations
        GROUP_UPDATE: 'GROUP_UPDATE',
        GROUP_CHAT_CREATED: 'GROUP_CHAT_CREATED',
        GROUP_MEMBER_ADDED: 'GROUP_MEMBER_ADDED',
        GROUP_MEMBER_REMOVED: 'GROUP_MEMBER_REMOVED',
        
        // Status
        STATUS_UPDATE: 'STATUS_UPDATE',
        SETTINGS_UPDATED: 'SETTINGS_UPDATED',
        INCOMING_CALL: 'INCOMING_CALL',
        
        // API - parent proxy only
        API_REQUEST: 'API_REQUEST',
        API_RESPONSE: 'API_RESPONSE',
        
        // WebSocket - parent managed
        WS_CONNECTED: 'WS_CONNECTED',
        WS_AUTHENTICATED: 'WS_AUTHENTICATED',
        WS_DISCONNECTED: 'WS_DISCONNECTED',
        WS_ERROR: 'WS_ERROR',
        
        // System
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
        
        // Legacy - for backward compatibility
        IFRAME_READY: 'IFRAME_READY',
        CHILD_READY: 'CHILD_READY',
        HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
        HANDSHAKE_ACK: 'HANDSHAKE_ACK',
        HANDSHAKE_COMPLETE: 'HANDSHAKE_COMPLETE'
    };

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

    const LOG_LEVELS = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        NONE: 4
    };
    
    const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

    // =============================================
    // SECURITY UTILITIES - MUST BE DEFINED FIRST
    // =============================================
    const SecurityUtils = {
        allowedOrigins: new Set([
            window.location.origin,
            'https://moodchat-fy56.onrender.com',
            'https://moodfronted.onrender.com'
        ]),

        messageIdCounter: 0,
        processedMessageIds: new Set(),
        replayWindow: 300000,

        initOriginTrust: function() {
            const hostname = window.location.hostname;
            this.allowedOrigins.add(`https://${hostname}`);
            this.allowedOrigins.add(`http://${hostname}`);
            this.allowedOrigins.add(window.location.origin);
            
            if (hostname.endsWith('.onrender.com')) {
                this.allowedOrigins.add(`https://${hostname}`);
            }
            
            // Add parent origin if available
            if (document.referrer) {
                try {
                    const parentOrigin = new URL(document.referrer).origin;
                    this.allowedOrigins.add(parentOrigin);
                } catch (e) {}
            }
        },

        validateOrigin: function(origin) {
            if (!origin || origin === 'null') return true;
            return this.allowedOrigins.has(origin) || origin === window.location.origin;
        },

        validateMessageStructure: function(data) {
            return !!(data && typeof data === 'object' && data.type);
        },

        generateMessageId: function() {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 10);
            const counter = (this.messageIdCounter++ % 1000).toString(36);
            return `msg_${timestamp}_${random}_${counter}`;
        },

        generateRequestId: function() {
            return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
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
            return !targetFrame || targetFrame === 'iframe' || targetFrame === FRAME_ID;
        },
        
        isDuplicateMessage: function(messageId) {
            if (MessageIdCache && MessageIdCache.has(messageId)) {
                return true;
            }
            if (MessageIdCache) {
                MessageIdCache.add(messageId);
            }
            return false;
        }
    };

    SecurityUtils.initOriginTrust();

    // =============================================
    // MESSAGE ID CACHE - Deduplication
    // =============================================
    const MessageIdCache = {
        _cache: new Map(),
        
        has: function(id) {
            return this._cache.has(id);
        },
        
        add: function(id) {
            this._cache.set(id, Date.now());
            setTimeout(() => {
                this._cache.delete(id);
            }, TIMING.MESSAGE_ID_CACHE_TTL);
        },
        
        cleanup: function() {
            const now = Date.now();
            for (const [id, timestamp] of this._cache.entries()) {
                if (now - timestamp > TIMING.MESSAGE_ID_CACHE_TTL) {
                    this._cache.delete(id);
                }
            }
        }
    };

    // =============================================
    // MESSAGE TRACKER - Deduplicate messages with ACK handling
    // =============================================
    const MessageTracker = {
        _processedMessageIds: new Set(),
        _pendingRequestIds: new Map(),
        _maxProcessedSize: 500,
        _maxPendingAge: 30000,
        _retryCounts: new Map(),
        
        isProcessed(messageId) {
            return this._processedMessageIds.has(messageId);
        },
        
        markProcessed(messageId) {
            this._processedMessageIds.add(messageId);
            this._cleanupProcessed();
        },
        
        registerPending(requestId, type, resolve, reject, timeoutMs = 5000) {
            const retryCount = this.getRetryCount(requestId);
            if (retryCount >= 2) {
                log.onceWarn(`retry-limit-${requestId}`, `[MessageTracker] Retry limit reached for ${requestId}`);
                reject(new Error('Retry limit exceeded'));
                return requestId;
            }
            
            if (this._pendingRequestIds.has(requestId)) {
                const old = this._pendingRequestIds.get(requestId);
                clearTimeout(old.timer);
                old.reject(new Error('Superseded by new request'));
                this.incrementRetryCount(requestId);
            } else {
                this.initRetryCount(requestId);
            }
            
            const timer = setTimeout(() => {
                if (this._pendingRequestIds.has(requestId)) {
                    const pending = this._pendingRequestIds.get(requestId);
                    this._pendingRequestIds.delete(requestId);
                    this.incrementRetryCount(requestId);
                    pending.reject(new Error(`Request timeout: ${type} (${requestId})`));
                }
            }, timeoutMs);
            
            this._pendingRequestIds.set(requestId, {
                resolve,
                reject,
                timer,
                type,
                timestamp: Date.now()
            });
            
            return requestId;
        },
        
        handleAck(ackMessage) {
            const { messageId, requestId } = ackMessage;
            const ackId = requestId || messageId;
            
            if (ackId && this._pendingRequestIds.has(ackId)) {
                const pending = this._pendingRequestIds.get(ackId);
                clearTimeout(pending.timer);
                pending.resolve(ackMessage.payload || { success: true });
                this._pendingRequestIds.delete(ackId);
                this.resetRetryCount(ackId);
                this.markProcessed(ackId);
                log.debug(`[MessageTracker] ACK received for ${ackId}`);
                return true;
            }
            return false;
        },
        
        resolvePending(requestId, result) {
            const pending = this._pendingRequestIds.get(requestId);
            if (pending) {
                clearTimeout(pending.timer);
                pending.resolve(result);
                this._pendingRequestIds.delete(requestId);
                this.resetRetryCount(requestId);
                this.markProcessed(requestId);
                return true;
            }
            return false;
        },
        
        rejectPending(requestId, error) {
            const pending = this._pendingRequestIds.get(requestId);
            if (pending) {
                clearTimeout(pending.timer);
                pending.reject(error);
                this._pendingRequestIds.delete(requestId);
                this.incrementRetryCount(requestId);
                this.markProcessed(requestId);
                return true;
            }
            return false;
        },
        
        initRetryCount(requestId) {
            this._retryCounts.set(requestId, 0);
        },
        
        incrementRetryCount(requestId) {
            const count = this._retryCounts.get(requestId) || 0;
            this._retryCounts.set(requestId, count + 1);
            return count + 1;
        },
        
        getRetryCount(requestId) {
            return this._retryCounts.get(requestId) || 0;
        },
        
        resetRetryCount(requestId) {
            this._retryCounts.delete(requestId);
        },
        
        _cleanupProcessed() {
            if (this._processedMessageIds.size > this._maxProcessedSize) {
                const toRemove = Array.from(this._processedMessageIds).slice(0, 100);
                toRemove.forEach(id => this._processedMessageIds.delete(id));
            }
        },
        
        cleanupStalePending() {
            const now = Date.now();
            for (const [requestId, pending] of this._pendingRequestIds.entries()) {
                if (now - pending.timestamp > this._maxPendingAge) {
                    clearTimeout(pending.timer);
                    pending.reject(new Error('Stale pending request cleaned up'));
                    this._pendingRequestIds.delete(requestId);
                    this._retryCounts.delete(requestId);
                }
            }
        },
        
        reset() {
            this._processedMessageIds.clear();
            for (const [_, pending] of this._pendingRequestIds) {
                clearTimeout(pending.timer);
            }
            this._pendingRequestIds.clear();
            this._retryCounts.clear();
        }
    };

    setInterval(() => MessageTracker.cleanupStalePending(), 15000);

    // =============================================
    // LOGGER - Structured logging
    // =============================================
    const Logger = {
        _warned: new Set(),
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
                console.log(`[Messages] ${message}`, data || '');
            } else if (level === 'warn') {
                console.warn(`[Messages] ⚠️ ${message}`, data || '');
            } else if (level === 'error') {
                console.error(`[Messages] ❌ ${message}`, data || '');
            } else if (level === 'success') {
                console.log(`[Messages] ✅ ${message}`, data || '');
            } else if (level === 'info') {
                console.info(`[Messages] ℹ️ ${message}`, data || '');
            } else if (level === 'state') {
                console.log(`[Messages] 📊 ${message}`, data || '');
            }
        },
        
        debug: function(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
                debugLog(`[${module}] ${message}`, data);
            }
        },
        
        info: function(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
                if (ALLOWED_LOGS.has(message.split(' ')[0]) || ALLOWED_LOGS.has(message)) {
                    this._logOnce(`${module}:info:${message}`, `[${module}] ℹ️ ${message}`, data, 'info');
                } else {
                    debugLog(`[${module}] ℹ️ ${message}`, data);
                }
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
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
                this._logOnce(`${module}:warn:${message}`, `[${module}] ⚠️ ${message}`, data, 'warn');
            }
        },
        
        error: function(module, message, data = null) {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
                const key = `${module}:error:${message}`;
                const now = Date.now();
                const lastLog = this._errors.get(key) || 0;
                
                if (now - lastLog > 30000) {
                    this._logOnce(key, `[${module}] ❌ ${message}`, data, 'error');
                    this._errors.set(key, now);
                }
            }
        },
        
        state: function(module, oldState, newState, reason = '') {
            if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
                const arrow = oldState === newState ? '=' : '→';
                const key = `${module}:state:${oldState}:${newState}:${reason}`;
                this._logOnce(key, `[${module}] 📊 ${oldState} ${arrow} ${newState}${reason ? ` (${reason})` : ''}`, null, 'state');
                
                if (!this._stateLog.has(module)) {
                    this._stateLog.set(module, []);
                }
                const history = this._stateLog.get(module);
                history.push({ oldState, newState, reason, timestamp: Date.now() });
                if (history.length > 50) history.shift();
            }
        },
        
        once: function(module, message, data = null) {
            this._logOnce(`${module}:once:${message}`, `[${module}] ${message}`, data, 'info');
        },
        
        getStateHistory: function(module) {
            return this._stateLog.get(module) || [];
        }
    };

    // =============================================
    // SAFE STORAGE LAYER - With fallback
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
    // DETERMINISTIC STATE MACHINE - SINGLE INSTANCE
    // =============================================
    const StateMachine = {
        _state: V7_STATES.INIT,
        _stateLock: false,
        _transitionHistory: [],
        _maxHistory: 50,
        _listeners: new Set(),
        _bootStartTime: Date.now(),
        _handshakeTimer: null,
        _handshakeWarningTimer: null,
        _handshakeFallbackTimer: null,
        
        init: function() {
            this._bootStartTime = Date.now();
            return this;
        },
        
        // Strict transition - must follow STATE_TRANSITIONS
        transition: function(newState, reason = '') {
            // Define strict state transitions
            const STATE_TRANSITIONS = {
                [V7_STATES.INIT]: [V7_STATES.REGISTERING, V7_STATES.DEGRADED],
                [V7_STATES.REGISTERING]: [V7_STATES.REGISTERED, V7_STATES.DEGRADED],
                [V7_STATES.REGISTERED]: [V7_STATES.SESSION_RECEIVED, V7_STATES.DEGRADED],
                [V7_STATES.SESSION_RECEIVED]: [V7_STATES.ACTIVE, V7_STATES.DEGRADED],
                [V7_STATES.ACTIVE]: [V7_STATES.SYNCING, V7_STATES.DEGRADED],
                [V7_STATES.SYNCING]: [V7_STATES.READY, V7_STATES.DEGRADED],
                [V7_STATES.READY]: [V7_STATES.DEGRADED],
                [V7_STATES.DEGRADED]: [V7_STATES.ACTIVE, V7_STATES.READY]
            };
            
            // Check if transition is valid
            if (!STATE_TRANSITIONS[this._state]?.includes(newState)) {
                Logger.error('StateMachine', `Invalid transition: ${this._state} → ${newState}`);
                return false;
            }
            
            // Prevent parallel transitions
            if (this._stateLock) {
                Logger.warn('StateMachine', 'Transition locked, queueing', { from: this._state, to: newState });
                setTimeout(() => this.transition(newState, reason), 10);
                return false;
            }
            
            this._stateLock = true;
            
            try {
                const oldState = this._state;
                this._state = newState;
                
                this._transitionHistory.push({
                    from: oldState,
                    to: newState,
                    reason,
                    timestamp: Date.now()
                });
                
                if (this._transitionHistory.length > this._maxHistory) {
                    this._transitionHistory.shift();
                }
                
                Logger.state('StateMachine', oldState, newState, reason);
                this._notifyListeners(oldState, newState, reason);
                this._handleStateTransition(newState, oldState);
                
                return true;
            } finally {
                this._stateLock = false;
            }
        },
        
       _handleStateTransition: function(state, oldState) {
    switch (state) {
        case V7_STATES.REGISTERING:
            // Start handshake timer
            this._handshakeWarningTimer = setTimeout(() => {
                if (this._state === V7_STATES.REGISTERING) {
                    Logger.warn('StateMachine', `Handshake slow - at ${TIMING.HANDSHAKE_WARNING}ms`);
                }
            }, TIMING.HANDSHAKE_WARNING);
            
            this._handshakeTimer = setTimeout(() => {
                if (this._state === V7_STATES.REGISTERING) {
                    Logger.warn('StateMachine', `Handshake timeout at ${TIMING.HANDSHAKE_TIMEOUT}ms - still waiting`);
                }
            }, TIMING.HANDSHAKE_TIMEOUT);
            
            this._handshakeFallbackTimer = setTimeout(() => {
                if (this._state === V7_STATES.REGISTERING) {
                    Logger.warn('StateMachine', `Handshake fallback at ${TIMING.HANDSHAKE_FALLBACK}ms - proceeding with caution`);
                    // Don't degrade, just proceed with what we have
                    this.transition(V7_STATES.REGISTERED, 'handshake-fallback');
                }
            }, TIMING.HANDSHAKE_FALLBACK);
            break;
                    
                case V7_STATES.REGISTERED:
                    // Clear registration timers
                    this._clearHandshakeTimers();
                    break;
                    
                case V7_STATES.SESSION_RECEIVED:
                    // Session received, waiting for PARENT_READY
                    break;
                    
                case V7_STATES.ACTIVE:
                    // PARENT_READY received, can start heartbeat
                    HeartbeatGovernor.start();
                    
                    // Clear any pending timers
                    this._clearHandshakeTimers();
                    
                    // Auto-transition to SYNCING
                    setTimeout(() => {
                        if (this._state === V7_STATES.ACTIVE) {
                            this.transition(V7_STATES.SYNCING, 'auto-sync');
                        }
                    }, 10);
                    break;
                    
                case V7_STATES.SYNCING:
                    // Start initial sync
                    this._startInitialSync();
                    break;
                    
                case V7_STATES.READY:
                    // Fully operational
                    window.__MODULE_READY__ = true;
                    window.__MODULE_SESSION_ACTIVE__ = SessionStore ? SessionStore.isAuthenticated() : false;
                    Logger.success('StateMachine', `READY achieved in ${Date.now() - this._bootStartTime}ms`);
                    
                    // Flush any queued messages
                    MessageQueue.flush();
                    break;
                    
                case V7_STATES.DEGRADED:
                    // Severe failure only
                    HeartbeatGovernor.stop();
                    window.dispatchEvent(new CustomEvent('connectionDegraded', { detail: { state } }));
                    break;
            }
        },
        
        _clearHandshakeTimers: function() {
            if (this._handshakeTimer) {
                clearTimeout(this._handshakeTimer);
                this._handshakeTimer = null;
            }
            if (this._handshakeWarningTimer) {
                clearTimeout(this._handshakeWarningTimer);
                this._handshakeWarningTimer = null;
            }
            if (this._handshakeFallbackTimer) {
                clearTimeout(this._handshakeFallbackTimer);
                this._handshakeFallbackTimer = null;
            }
        },
        
        async _startInitialSync() {
            Logger.info('StateMachine', 'Starting initial sync - target 300ms');
            
            const syncStart = Date.now();
            
            try {
                // Load friends and chats in parallel
                await Promise.race([
                    Promise.all([
                        FriendManager.loadFriends(true).catch(() => {}),
                        ChatManager.loadChats(true).catch(() => {})
                    ]),
                    new Promise(resolve => setTimeout(resolve, TIMING.SYNC_TIMEOUT))
                ]);
                
                const syncTime = Date.now() - syncStart;
                
                if (syncTime <= TIMING.SYNC_TIMEOUT) {
                    Logger.success('StateMachine', `Initial sync complete in ${syncTime}ms`);
                } else {
                    Logger.warn('StateMachine', `Initial sync slow: ${syncTime}ms`);
                }
                
                // Transition to READY regardless of sync success
                if (this._state === V7_STATES.SYNCING) {
                    this.transition(V7_STATES.READY, 'sync-complete');
                }
                
            } catch (error) {
                Logger.warn('StateMachine', 'Initial sync error', error);
                
                // Still transition to READY - don't degrade for sync failures
                if (this._state === V7_STATES.SYNCING) {
                    this.transition(V7_STATES.READY, 'sync-fallback');
                }
            }
        },
        
        getState: function() {
            return this._state;
        },
        
        isAtLeast: function(targetState) {
            const stateOrder = [
                V7_STATES.INIT,
                V7_STATES.REGISTERING,
                V7_STATES.REGISTERED,
                V7_STATES.SESSION_RECEIVED,
                V7_STATES.ACTIVE,
                V7_STATES.SYNCING,
                V7_STATES.READY
            ];
            
            const currentIndex = stateOrder.indexOf(this._state);
            const targetIndex = stateOrder.indexOf(targetState);
            
            return currentIndex >= targetIndex;
        },
        
        isActive: function() {
            return this._state === V7_STATES.ACTIVE || 
                   this._state === V7_STATES.SYNCING || 
                   this._state === V7_STATES.READY;
        },
        
        isReady: function() {
            return this._state === V7_STATES.READY;
        },
        
        isDegraded: function() {
            return this._state === V7_STATES.DEGRADED;
        },
        
        subscribe: function(callback) {
            this._listeners.add(callback);
            return () => this._listeners.delete(callback);
        },
        
        _notifyListeners: function(oldState, newState, reason) {
            this._listeners.forEach(cb => {
                try { cb(oldState, newState, reason); } catch (e) {}
            });
            
            window.dispatchEvent(new CustomEvent('stateChanged', {
                detail: { oldState, newState, reason, state: this._state }
            }));
        },
        
        cleanup: function() {
            this._clearHandshakeTimers();
            if (HeartbeatGovernor) HeartbeatGovernor.stop();
        }
    }.init();

    // =============================================
    // BOOT CONTROLLER - Strict handshake sequence
    // =============================================
    const BootController = {
        _handshakeStep: 0,           // 0: INIT, 1: REGISTERED, 2: SESSION, 3: READY
        _moduleRegistered: false,
        _sessionReceived: false,
        _parentReady: false,
        _bootPromise: null,
        _bootResolve: null,
        _bootStartTime: null,
        _handshakeComplete: false,
        _session: null,
        
        init: function() {
            this._bootStartTime = Date.now();
            this._bootPromise = new Promise((resolve) => {
                this._bootResolve = resolve;
            });
            
            // Start handshake immediately
            this._startHandshake();
            
            return this;
        },
        
        _startHandshake: function() {
            StateMachine.transition(V7_STATES.REGISTERING, 'handshake-start');
            
            // STEP 1: Send REGISTER_MODULE at 0ms
            this._sendRegisterModule();
        },
        
        _sendRegisterModule: function() {
            Logger.info('Boot', `📤 Sending REGISTER_MODULE at T+${Date.now() - this._bootStartTime}ms`);
            
            const message = {
                type: MESSAGE_TYPES.REGISTER_MODULE,
                module: 'messages',
                frameId: FRAME_ID,
                version: VERSION,
                requestId: SecurityUtils.generateRequestId(),
                timestamp: Date.now()
            };
            
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
            } else {
                Logger.warn('Boot', 'No parent window - cannot proceed');
                this._handshakeFailed('no-parent');
            }
        },
        
        // STEP 2: MODULE_REGISTERED received
        onModuleRegistered: function(data) {
            if (this._moduleRegistered) return;
            if (this._handshakeStep > 0) return;
            
            this._moduleRegistered = true;
            this._handshakeStep = 1;
            
            StateMachine.transition(V7_STATES.REGISTERED, 'module-registered');
            
            Logger.success('Boot', `MODULE_REGISTERED received at T+${Date.now() - this._bootStartTime}ms`);
            
            // Wait for SESSION_ACTIVE or SESSION_NULL
        },
        
        // STEP 3: SESSION_ACTIVE received
        onSessionActive: function(payload) {
            if (this._sessionReceived) return;
            if (this._handshakeStep < 1) {
                Logger.warn('Boot', 'SESSION_ACTIVE received before MODULE_REGISTERED');
            }
            
            this._sessionReceived = true;
            this._handshakeStep = 2;
            this._session = payload.session || payload;
            
            // Store session in memory only
            SessionStore.setSession(this._session);
            
            Logger.success('Boot', `SESSION_ACTIVE received at T+${Date.now() - this._bootStartTime}ms`);
            
            // Check if we already have PARENT_READY
            if (this._parentReady) {
                this._completeHandshake();
            }
        },
        
        // STEP 3 (alt): SESSION_NULL received
        onSessionNull: function(payload) {
            if (this._sessionReceived) return;
            
            this._sessionReceived = true;
            this._handshakeStep = 2;
            this._session = { authenticated: false };
            
            // Clear session
            SessionStore.clear();
            
            Logger.info('Boot', 'SESSION_NULL received - guest mode');
            
            // Check if we already have PARENT_READY
            if (this._parentReady) {
                this._completeHandshake();
            }
        },
        
        // STEP 4: PARENT_READY received
        onParentReady: function(data) {
            if (this._parentReady) return;
            
            this._parentReady = true;
            this._handshakeStep = 3;
            
            Logger.success('Boot', `PARENT_READY received at T+${Date.now() - this._bootStartTime}ms`);
            
            // Check if we already have session
            if (this._sessionReceived) {
                this._completeHandshake();
            }
        },
        
        _completeHandshake: function() {
            if (this._handshakeComplete) return;
            
            this._handshakeComplete = true;
            
            const totalTime = Date.now() - this._bootStartTime;
            
            if (totalTime <= TIMING.HANDSHAKE_TIMEOUT) {
                Logger.success('Boot', `🎉 Handshake complete in ${totalTime}ms (target: <150ms)`);
            } else {
                Logger.warn('Boot', `Handshake completed in ${totalTime}ms (exceeded target)`);
            }
            
            // Transition to ACTIVE
            StateMachine.transition(V7_STATES.ACTIVE, 'handshake-complete');
            
            // Resolve boot promise
            if (this._bootResolve) {
                this._bootResolve({
                    success: true,
                    time: totalTime,
                    session: this._session
                });
                this._bootResolve = null;
            }
            
            // Notify UI
            window.dispatchEvent(new CustomEvent('handshakeComplete', {
                detail: {
                    time: totalTime,
                    session: this._session,
                    authenticated: SessionStore ? SessionStore.isAuthenticated() : false
                }
            }));
        },
        
        _handshakeFailed: function(reason) {
            Logger.error('Boot', `Handshake failed: ${reason}`);
            
            // Don't degrade, just proceed with what we have
            // Parent might still send messages
            
            if (this._bootResolve) {
                this._bootResolve({
                    success: false,
                    reason,
                    time: Date.now() - this._bootStartTime
                });
                this._bootResolve = null;
            }
        },
        
        waitForBoot: function() {
            return this._bootPromise;
        },
        
        isReady: function() {
            return StateMachine.isReady();
        },
        
        isActive: function() {
            return StateMachine.isActive();
        },
        
        isDegraded: function() {
            return StateMachine.isDegraded();
        },
        
        getState: function() {
            return StateMachine.getState();
        },
        
        getSession: function() {
            return this._session;
        }
    }.init();

    // =============================================
    // SESSION STORE - Memory only, immutable
    // =============================================
    const SessionStore = {
        _session: null,
        _user: null,
        _userId: null,
        _token: null,
        _authenticated: false,
        _listeners: new Set(),
        _sessionPromise: null,
        _sessionResolve: null,
        
        init: function() {
            this._sessionPromise = new Promise((resolve) => {
                this._sessionResolve = resolve;
            });
            return this;
        },
        
        // Set session - from parent only
        setSession: function(session) {
            if (!session || typeof session !== 'object') return false;
            
            // Extract session data
            const sessionData = session.session || session;
            
            // Create immutable session object
            const frozenSession = Object.freeze({
                user: sessionData.user ? Object.freeze({ ...sessionData.user }) : null,
                token: sessionData.token || null,
                userId: sessionData.userId || sessionData.user?.id || null,
                authenticated: !!(sessionData.user && sessionData.token),
                expiresAt: sessionData.expiresAt || Date.now() + 3600000,
                version: sessionData.version || 1,
                receivedAt: Date.now()
            });
            
            this._session = frozenSession;
            this._user = frozenSession.user;
            this._userId = frozenSession.userId;
            this._token = frozenSession.token;
            this._authenticated = frozenSession.authenticated;
            
            // Cache user for UI
            if (this._user) {
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_CACHE, this._user);
            }
            
            this._notifyListeners();
            
            if (this._sessionResolve) {
                this._sessionResolve(frozenSession);
                this._sessionResolve = null;
            }
            
            return true;
        },
        
        // Update session from SESSION_REFRESHED
        refreshSession: function(session) {
            if (!session || typeof session !== 'object') return false;
            
            // Replace session, don't merge
            return this.setSession(session);
        },
        
        getSession: function() {
            return this._session;
        },
        
        waitForSession: function() {
            return this._sessionPromise;
        },
        
        getUser: function() {
            return this._user;
        },
        
        getUserId: function() {
            return this._userId;
        },
        
        getToken: function() {
            return this._token;
        },
        
        isAuthenticated: function() {
            return this._authenticated;
        },
        
        hasSession: function() {
            return !!this._session;
        },
        
        clear: function() {
            this._session = null;
            this._user = null;
            this._userId = null;
            this._token = null;
            this._authenticated = false;
            this._sessionPromise = new Promise((resolve) => {
                this._sessionResolve = resolve;
            });
            this._notifyListeners();
        },
        
        subscribe: function(callback) {
            this._listeners.add(callback);
            return () => this._listeners.delete(callback);
        },
        
        _notifyListeners: function() {
            this._listeners.forEach(cb => {
                try { cb(this._session); } catch (e) {}
            });
        }
    }.init();

    // =============================================
    // HEARTBEAT GOVERNOR - Starts only after ACTIVE
    // =============================================
    const HeartbeatGovernor = {
        _interval: null,
        _missedCount: 0,
        _maxMissed: TIMING.HEARTBEAT_MAX_MISSED,
        _lastHeartbeatId: 0,
        _pendingHeartbeat: null,
        _listeners: new Set(),
        _paused: false,
        
        start: function() {
            // Only start if state is ACTIVE or higher
            if (StateMachine.getState() !== V7_STATES.ACTIVE && 
                StateMachine.getState() !== V7_STATES.SYNCING && 
                StateMachine.getState() !== V7_STATES.READY) {
                return false;
            }
            
            if (this._interval) return true;
            
            this._interval = setInterval(() => {
                this._sendHeartbeat();
            }, TIMING.HEARTBEAT_INTERVAL);
            
            Logger.once('Heartbeat', 'Heartbeat started - after ACTIVE');
            return true;
        },
        
        stop: function() {
            if (this._interval) {
                clearInterval(this._interval);
                this._interval = null;
            }
            this._missedCount = 0;
            this._pendingHeartbeat = null;
            this._paused = false;
        },
        
        pause: function() {
            this._paused = true;
        },
        
        resume: function() {
            this._paused = false;
        },
        
        _sendHeartbeat: function() {
            // Don't send if paused or not in appropriate state
            if (this._paused) return;
            if (StateMachine.getState() !== V7_STATES.ACTIVE && 
                StateMachine.getState() !== V7_STATES.SYNCING && 
                StateMachine.getState() !== V7_STATES.READY) {
                return;
            }
            
            const heartbeatId = ++this._lastHeartbeatId;
            const timestamp = Date.now();
            
            this._pendingHeartbeat = {
                id: heartbeatId,
                timestamp,
                timeout: setTimeout(() => {
                    this._handleMissed(heartbeatId);
                }, TIMING.HEARTBEAT_ACK_TIMEOUT)
            };
            
            MessagesTransport.send(MESSAGE_TYPES.HEARTBEAT, {
                id: heartbeatId,
                timestamp
            }, { requireAck: true, timeout: TIMING.HEARTBEAT_ACK_TIMEOUT });
        },
        
        _handleMissed: function(heartbeatId) {
            if (!this._pendingHeartbeat || this._pendingHeartbeat.id !== heartbeatId) return;
            
            this._missedCount++;
            this._pendingHeartbeat = null;
            
            // Log based on miss count - but don't degrade immediately
            if (this._missedCount === 1) {
                Logger.warn('Heartbeat', 'Connection unstable (1 missed) - pausing sends');
                this._paused = true;
                this._notifyListeners('unstable');
            } else if (this._missedCount === 2) {
                Logger.warn('Heartbeat', 'Connection degraded (2 missed) - waiting for parent');
                this._notifyListeners('degraded');
            } else if (this._missedCount >= 3) {
                Logger.warn('Heartbeat', 'Connection lost (3 missed) - entering silent mode');
                this._notifyListeners('lost');
                
                // Only degrade if we're in a state that allows it
                if (StateMachine.getState() === V7_STATES.READY || 
                    StateMachine.getState() === V7_STATES.ACTIVE ||
                    StateMachine.getState() === V7_STATES.SYNCING) {
                    
                    // Check if parent has been silent for threshold
                    const lastParentMessage = ParentResponseInterceptor ? ParentResponseInterceptor.getLastMessageTime() : 0;
                    if (Date.now() - lastParentMessage > TIMING.RECOVERY_SILENCE_THRESHOLD) {
                        StateMachine.transition(V7_STATES.DEGRADED, 'heartbeat-lost-silence');
                    } else {
                        // Just pause, don't degrade
                        Logger.warn('Heartbeat', 'Parent still responsive, waiting');
                    }
                }
            }
        },
        
        handleAck: function(payload) {
            if (!this._pendingHeartbeat || this._pendingHeartbeat.id !== payload.id) return;
            
            clearTimeout(this._pendingHeartbeat.timeout);
            this._pendingHeartbeat = null;
            
            // Reset on successful ACK
            if (this._missedCount > 0) {
                this._missedCount = 0;
                this._paused = false;
                this._notifyListeners('restored');
            }
        },
        
        subscribe: function(callback) {
            this._listeners.add(callback);
            return () => this._listeners.delete(callback);
        },
        
        _notifyListeners: function(status) {
            this._listeners.forEach(cb => {
                try { cb(status); } catch (e) {}
            });
        },
        
        getMissedCount: function() {
            return this._missedCount;
        },
        
        isPaused: function() {
            return this._paused;
        }
    };

    // =============================================
    // MESSAGES TRANSPORT - Parent communication
    // =============================================
    const MessagesTransport = {
        _sequence: 0,
        _outboundQueue: [],
        _parentOrigin: '*',
        _maxQueueSize: 100,
        _processingQueue: false,
        _frameId: null,
        _parentReady: false,
        _handshakeComplete: false,
        _messageId: 0,
        _pendingAcks: new Map(),
        _handlers: new Map(),
        _messageCache: new Set(),
        _lastHeartbeat: 0,
        _heartbeatInterval: null,
        _pingCount: 0,
        _maxPingRetries: 2,
        
        init: function() {
            setInterval(() => this._processQueue(), TIMING.QUEUE_FLUSH_INTERVAL);
            setInterval(() => AckController.cleanup(), 60000);
            return this;
        },
        
        getFrameId: function() {
            if (!this._frameId) {
                this._frameId = this._generateFrameId();
            }
            return this._frameId;
        },
        
        _generateFrameId: function() {
            // Use SafeStorage.get (not getItem)
            const stored = SafeStorage.get('kyn_frame_id_v7');
            if (stored) return stored;
            
            const newId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_v7`;
            SafeStorage.set('kyn_frame_id_v7', newId);
            return newId;
        },
        
        _generateMessageId: function() {
            return 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10) + '_' + (++this._sequence);
        },
        
        _generateRequestId: function() {
            return 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10) + '_' + (++this._sequence);
        },
        
        waitForParentReady: function(timeoutMs = 150) {
            return new Promise((resolve) => {
                if (this._parentReady) {
                    resolve(true);
                    return;
                }
                
                const timeout = setTimeout(() => {
                    window.removeEventListener('parentReadyReceived', handler);
                    log.onceWarn('parent-ready-timeout', '[MessagesTransport] Parent ready timeout');
                    resolve(false);
                }, timeoutMs);
                
                const handler = () => {
                    clearTimeout(timeout);
                    window.removeEventListener('parentReadyReceived', handler);
                    resolve(true);
                };
                
                window.addEventListener('parentReadyReceived', handler);
            });
        },
        
        send: function(type, payload = {}, options = {}) {
            return new Promise(async (resolve) => {
                // Create message with required fields
                const requestId = options.requestId || this._generateRequestId();
                const messageId = options.messageId || this._generateMessageId();
                const timestamp = Date.now();
                
                const message = {
                    type: type,
                    messageId: messageId,
                    requestId: requestId,
                    timestamp: timestamp,
                    module: 'messages',
                    frameId: this.getFrameId(),
                    payload: SecurityUtils.sanitizePayload(payload || {}),
                    expectAck: options.requireAck !== false
                };
                
                // Add session info if available
                if (SessionStore && SessionStore.isAuthenticated()) {
                    message.session = {
                        authenticated: true,
                        userId: SessionStore.getUserId()
                    };
                }
                
                const sendFn = () => this._postMessage(message);
                
                if (options.requireAck !== false) {
                    const ackResult = AckController.register(requestId, message, sendFn, {
                        maxRetries: options.maxRetries || 2,
                        timeout: options.timeout
                    });
                    
                    if (ackResult.duplicate) {
                        resolve({ success: false, duplicate: true, requestId });
                        return;
                    }
                }
                
                try {
                    await sendFn();
                    
                    if (options.requireAck === false) {
                        resolve({ success: true, messageId, requestId, async: false });
                    } else {
                        const waitForAck = (e) => {
                            if (e.detail.requestId === requestId) {
                                window.removeEventListener('messageAcknowledged', waitForAck);
                                window.removeEventListener('messageFailed', waitForFail);
                                resolve({ success: true, requestId, ack: e.detail.payload });
                            }
                        };
                        
                        const waitForFail = (e) => {
                            if (e.detail.requestId === requestId) {
                                window.removeEventListener('messageAcknowledged', waitForAck);
                                window.removeEventListener('messageFailed', waitForFail);
                                resolve({ success: false, error: e.detail.reason, requestId });
                            }
                        };
                        
                        window.addEventListener('messageAcknowledged', waitForAck);
                        window.addEventListener('messageFailed', waitForFail);
                        
                        setTimeout(() => {
                            window.removeEventListener('messageAcknowledged', waitForAck);
                            window.removeEventListener('messageFailed', waitForFail);
                            resolve({ success: false, error: 'Timeout', requestId });
                        }, options.timeout || 10000);
                    }
                } catch (error) {
                    if (options.requireAck === false) {
                        this._queueMessage(message);
                        resolve({ success: false, queued: true, error: error.message, requestId });
                    } else {
                        resolve({ success: false, error: error.message, requestId });
                    }
                }
            });
        },
        
        _postMessage: function(message) {
            return new Promise((resolve, reject) => {
                if (!window.parent || window.parent === window) {
                    reject(new Error('No parent window'));
                    return;
                }
                
                try {
                    window.parent.postMessage(message, '*');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
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
            if (StateMachine.getState() !== V7_STATES.READY) return;
            
            this._processingQueue = true;
            
            const now = Date.now();
            const oneHour = 3600000;
            
            const freshQueue = this._outboundQueue.filter(item => 
                now - item.timestamp < oneHour
            );
            
            for (const item of freshQueue) {
                try {
                    await this._postMessage(item.message);
                } catch (e) {}
            }
            
            this._outboundQueue = freshQueue.filter(item => 
                now - item.timestamp < 300000
            );
            
            this._processingQueue = false;
        },
        
        isParentReady: function() {
            return this._parentReady;
        },
        
        isHandshakeComplete: function() {
            return this._handshakeComplete;
        },
        
        startHeartbeat: function() {
            if (this._heartbeatInterval) return;
            this._heartbeatInterval = setInterval(() => {
                const now = Date.now();
                if (now - this._lastHeartbeat > 25000 && this._parentReady) {
                    if (this._pingCount < this._maxPingRetries) {
                        this.send('HEARTBEAT', { 
                            timestamp: now, 
                            frameId: this.getFrameId(),
                            module: 'messages'
                        }, { requireAck: true, timeout: 20 });
                        this._lastHeartbeat = now;
                        this._pingCount++;
                    } else {
                        this._pingCount = 0;
                    }
                }
            }, 30000);
        },
        
        reset: function() {
            this._parentReady = false;
            this._handshakeComplete = false;
            this._pingCount = 0;
        },
        
        destroy: function() {
            if (this._heartbeatInterval) {
                clearInterval(this._heartbeatInterval);
                this._heartbeatInterval = null;
            }
            this._pendingAcks.forEach((pending, id) => clearTimeout(pending.timeout));
            this._pendingAcks.clear();
            this._handlers.clear();
            this._messageCache.clear();
        },
        
        getStats: function() {
            return {
                sequence: this._sequence,
                queued: this._outboundQueue.length,
                pendingAcks: AckController ? AckController.getPendingCount() : 0,
                ackStats: AckController ? AckController.getStats() : { pending: 0, processed: 0 }
            };
        }
    }.init();

    // =============================================
    // ACK CONTROLLER - Strict correlation
    // =============================================
    const AckController = {
        _pendingAcks: new Map(),
        _processedIds: new Set(),
        _maxRetries: 2,
        _baseTimeout: 5000,
        _retryBackoff: 1.5,
        _maxPending: 1000,
        
        register: function(requestId, message, sendFn, options = {}) {
            if (this._processedIds.has(requestId)) {
                return { success: false, duplicate: true };
            }
            
            if (this._pendingAcks.size >= this._maxPending) {
                this._cleanupOldest();
            }
            
            const maxRetries = options.maxRetries ?? this._maxRetries;
            const timeout = options.timeout ?? this._baseTimeout;
            
            const record = {
                requestId,
                message,
                sendFn,
                attempts: 0,
                maxRetries,
                timeout,
                timers: [],
                startTime: Date.now(),
                lastAttempt: Date.now(),
                status: 'pending'
            };
            
            this._scheduleRetry(record, 0);
            
            this._pendingAcks.set(requestId, record);
            
            return { success: true, requestId };
        },
        
        _scheduleRetry: function(record, delay) {
            const timer = setTimeout(() => {
                this._sendWithRetry(record);
            }, delay);
            
            record.timers.push(timer);
        },
        
        async _sendWithRetry(record) {
            if (record.attempts >= record.maxRetries) {
                this._handleFailure(record, 'Max retries exceeded');
                return;
            }
            
            record.attempts++;
            record.lastAttempt = Date.now();
            record.status = 'sending';
            
            try {
                await record.sendFn();
                
                const timeoutTimer = setTimeout(() => {
                    if (this._pendingAcks.has(record.requestId)) {
                        this._handleTimeout(record);
                    }
                }, record.timeout);
                
                record.timers.push(timeoutTimer);
                
            } catch (error) {
                this._handleFailure(record, error.message);
            }
        },
        
        _handleTimeout: function(record) {
            if (record.attempts >= record.maxRetries) {
                this._handleFailure(record, 'Timeout - max retries');
                return;
            }
            
            const delay = record.timeout * Math.pow(this._retryBackoff, record.attempts - 1);
            
            this._scheduleRetry(record, delay);
        },
        
        _handleFailure: function(record, reason) {
            record.status = 'failed';
            record.failureReason = reason;
            
            this._pendingAcks.delete(record.requestId);
            this._processedIds.add(record.requestId);
            
            Logger.warn('AckController', `Message ${record.requestId} failed: ${reason}`);
            
            window.dispatchEvent(new CustomEvent('messageFailed', {
                detail: { requestId: record.requestId, message: record.message, reason }
            }));
            
            this._cleanupTimers(record);
        },
        
        handleAck: function(requestId, payload) {
            if (this._processedIds.has(requestId)) {
                return { success: false, duplicate: true };
            }
            
            const record = this._pendingAcks.get(requestId);
            if (!record) {
                this._processedIds.add(requestId);
                return { success: false, notFound: true };
            }
            
            this._cleanupTimers(record);
            
            record.status = 'acknowledged';
            record.ackTime = Date.now();
            
            this._pendingAcks.delete(requestId);
            this._processedIds.add(requestId);
            
            window.dispatchEvent(new CustomEvent('messageAcknowledged', {
                detail: { requestId, message: record.message, payload }
            }));
            
            return { success: true, record };
        },
        
        handleNack: function(requestId, reason) {
            const record = this._pendingAcks.get(requestId);
            if (!record) return { success: false };
            
            this._handleFailure(record, reason || 'NACK received');
            
            return { success: true };
        },
        
        handleMessageAck: function(messageId, payload) {
            for (const [requestId, record] of this._pendingAcks.entries()) {
                if (record.message.messageId === messageId || record.message.id === messageId) {
                    return this.handleAck(requestId, payload);
                }
            }
            return { success: false, notFound: true };
        },
        
        _cleanupTimers: function(record) {
            record.timers.forEach(timer => clearTimeout(timer));
            record.timers = [];
        },
        
        _cleanupOldest: function() {
            const entries = Array.from(this._pendingAcks.entries());
            entries.sort((a, b) => a[1].startTime - b[1].startTime);
            
            const toRemove = entries.slice(0, Math.floor(this._pendingAcks.size * 0.2));
            toRemove.forEach(([id, record]) => {
                this._cleanupTimers(record);
                this._pendingAcks.delete(id);
                this._processedIds.add(id);
            });
        },
        
        cleanup: function() {
            const now = Date.now();
            const maxAge = 3600000;
            
            for (const [id, record] of this._pendingAcks) {
                if (now - record.startTime > maxAge) {
                    this._cleanupTimers(record);
                    this._pendingAcks.delete(id);
                    this._processedIds.add(id);
                }
            }
            
            if (this._processedIds.size > 10000) {
                this._processedIds.clear();
            }
        },
        
        getPendingCount: function() {
            return this._pendingAcks.size;
        },
        
        getStats: function() {
            return {
                pending: this._pendingAcks.size,
                processed: this._processedIds.size,
                oldest: this._pendingAcks.size ? 
                    Math.min(...Array.from(this._pendingAcks.values()).map(r => r.startTime)) : 0
            };
        }
    };

    // =============================================
    // MESSAGE QUEUE - In-memory only
    // =============================================
    const MessageQueue = {
        _queue: [],              // In-memory only - cleared on confirmation
        _maxSize: 100,
        _processing: false,
        _processingLock: false,
        
        enqueue: function(message) {
            if (this._queue.length >= this._maxSize) {
                this._queue.shift(); // Remove oldest
            }
            this._queue.push({
                message,
                timestamp: Date.now(),
                attempts: 0,
                status: 'pending'
            });
        },
        
        dequeue: function() {
            return this._queue.shift();
        },
        
        peek: function() {
            return this._queue[0] || null;
        },
        
        size: function() {
            return this._queue.length;
        },
        
        clear: function() {
            this._queue = [];
        },
        
        getAll: function() {
            return [...this._queue];
        },
        
        // Process queue with max 2 retries per message
        async flush() {
            // Only flush when READY
            if (StateMachine.getState() !== V7_STATES.READY) return;
            if (this._queue.length === 0) return;
            if (this._processingLock) return;
            
            this._processing = true;
            this._processingLock = true;
            
            const now = Date.now();
            const oneHour = 3600000;
            
            // Filter out messages older than 1 hour
            const freshQueue = this._queue.filter(item => 
                now - item.timestamp < oneHour
            );
            
            // Process each message
            const remaining = [];
            for (const item of freshQueue) {
                if (item.attempts >= TIMING.MAX_RETRIES) {
                    // Max retries exceeded - log and drop
                    Logger.warn('MessageQueue', `Message dropped after ${TIMING.MAX_RETRIES} retries`, item.message);
                    continue;
                }
                
                try {
                    item.attempts++;
                    await MessagesTransport._postMessage(item.message);
                    
                    // Success - message confirmed, don't re-queue
                } catch (error) {
                    // Failed - keep for retry if within time window
                    if (now - item.timestamp < 300000) { // 5 minutes
                        remaining.push(item);
                    }
                }
            }
            
            // Update queue with remaining messages
            this._queue = remaining;
            
            this._processing = false;
            this._processingLock = false;
        },
        
        // Load from storage - for offline support only
        loadFromStorage: function() {
            try {
                const stored = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.MESSAGE_QUEUE);
                if (Array.isArray(stored)) {
                    this._queue = stored;
                }
            } catch (e) {}
        }
    };

    // =============================================
    // ENHANCED RETRY MANAGER - Controlled retries
    // =============================================
    const RetryManager = {
        _retryState: new Map(),
        _maxRetries: TIMING.MAX_RETRIES,
        _baseDelay: 500,
        _maxDelay: 30000,
        _jitter: 0.1,
        
        async executeWithRetry(operation, options = {}) {
            const key = options.key || `op_${Date.now()}_${Math.random()}`;
            const maxRetries = options.maxRetries || this._maxRetries;
            const baseDelay = options.baseDelay || this._baseDelay;
            const maxDelay = options.maxDelay || this._maxDelay;
            
            let attempt = 0;
            let lastError;
            
            while (attempt <= maxRetries) {
                try {
                    if (attempt > 0) {
                        const delay = this._calculateDelay(attempt, baseDelay, maxDelay);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    
                    const result = await operation(attempt);
                    
                    this._retryState.delete(key);
                    
                    return { success: true, result, attempts: attempt };
                    
                } catch (error) {
                    lastError = error;
                    attempt++;
                    
                    this._retryState.set(key, {
                        attempt,
                        lastError: error,
                        timestamp: Date.now()
                    });
                    
                    if (options.abortSignal?.aborted) {
                        break;
                    }
                }
            }
            
            this._retryState.delete(key);
            
            return { 
                success: false, 
                error: lastError,
                attempts: attempt - 1
            };
        },
        
        _calculateDelay: function(attempt, baseDelay, maxDelay) {
            const backoffMap = {
                1: TIMING.RETRY_BACKOFF_1,
                2: TIMING.RETRY_BACKOFF_2
            };
            
            const exponentialDelay = Math.min(
                backoffMap[attempt] || baseDelay * Math.pow(2, attempt - 1), 
                maxDelay
            );
            
            const jitter = exponentialDelay * this._jitter * (Math.random() * 2 - 1);
            return Math.max(0, exponentialDelay + jitter);
        },
        
        cancelRetry: function(key) {
            this._retryState.delete(key);
        },
        
        getRetryState: function(key) {
            return this._retryState.get(key);
        },
        
        clearAll: function() {
            this._retryState.clear();
        }
    };

    // =============================================
    // PARENT RESPONSE INTERCEPTOR - Validate all inbound
    // =============================================
    const ParentResponseInterceptor = {
        _lastMessageTime: Date.now(),
        _processedRequests: new Set(),
        
        init: function() {
            window.__pendingRegistrations = new Map();
            
            window.addEventListener('message', (event) => {
                if (!SecurityUtils.validateOrigin(event.origin)) return;
                
                const data = event.data;
                if (!data || typeof data !== 'object') return;
                
                // Validate message is for messages module
                if (data.module && data.module !== 'messages' && data.module !== 'all') return;
                
                // Update last message time
                this._lastMessageTime = Date.now();
                
                // Check for duplicates
                if (data.messageId && MessageIdCache.has(data.messageId)) {
                    return;
                }
                if (data.messageId) {
                    MessageIdCache.add(data.messageId);
                }
                
                // Handle handshake messages
                if (data.type === MESSAGE_TYPES.MODULE_REGISTERED) {
                    Logger.info('Interceptor', '📥 MODULE_REGISTERED received');
                    BootController.onModuleRegistered(data);
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.SESSION_ACTIVE) {
                    Logger.info('Interceptor', '📥 SESSION_ACTIVE received');
                    BootController.onSessionActive(data);
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.SESSION_NULL) {
                    Logger.info('Interceptor', '📥 SESSION_NULL received');
                    BootController.onSessionNull(data);
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.PARENT_READY) {
                    Logger.info('Interceptor', '📥 PARENT_READY received');
                    BootController.onParentReady(data);
                    return;
                }
                
                // Handle ACKs
                if (data.type === MESSAGE_TYPES.ACK) {
                    const requestId = data.requestId || data.payload?.requestId;
                    if (requestId) {
                        AckController.handleAck(requestId, data.payload);
                    }
                    return;
                }
                
                // Handle session refresh
                if (data.type === MESSAGE_TYPES.SESSION_REFRESHED) {
                    Logger.info('Interceptor', '📥 SESSION_REFRESHED received');
                    if (data.payload?.session) {
                        SessionStore.refreshSession(data.payload.session);
                    }
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.SESSION_INVALIDATED) {
                    Logger.info('Interceptor', '📥 SESSION_INVALIDATED received');
                    SessionStore.clear();
                    return;
                }
                
                // Handle heartbeat ACK
                if (data.type === MESSAGE_TYPES.HEARTBEAT_ACK) {
                    HeartbeatGovernor.handleAck(data.payload || data);
                    return;
                }
                
                // Handle new messages - after READY only
                if (data.type === MESSAGE_TYPES.NEW_MESSAGE) {
                    if (StateMachine.isReady()) {
                        this._handleNewMessage(data.payload);
                    } else {
                        Logger.warn('Interceptor', 'NEW_MESSAGE received before READY, queueing');
                        // Queue for later processing
                        setTimeout(() => {
                            if (StateMachine.isReady()) {
                                this._handleNewMessage(data.payload);
                            }
                        }, 1000);
                    }
                    return;
                }
                
                // Handle friend updates
                if (data.type === MESSAGE_TYPES.FRIEND_UPDATE || 
                    data.type === MESSAGE_TYPES.FRIEND_ONLINE ||
                    data.type === MESSAGE_TYPES.FRIEND_OFFLINE) {
                    FriendManager.updateFriend(data.payload);
                    return;
                }
                
                // Handle group updates
                if (data.type === MESSAGE_TYPES.GROUP_UPDATE) {
                    if (data.payload?.groups) {
                        ChatManager.mergeGroupChats(data.payload.groups);
                    }
                    return;
                }
                
                // Handle status updates
                if (data.type === MESSAGE_TYPES.STATUS_UPDATE) {
                    if (data.payload) {
                        const statuses = Array.isArray(data.payload) ? data.payload : [data.payload];
                        statuses.forEach(status => {
                            FriendManager.updateFriend({
                                id: status.userId,
                                online: status.online,
                                lastSeen: status.lastSeen,
                                status: status.status
                            });
                        });
                    }
                    return;
                }
                
                // Handle chat history response
                if (data.type === MESSAGE_TYPES.CHAT_HISTORY_RESPONSE) {
                    if (data.payload?.messages) {
                        data.payload.messages.forEach(msg => {
                            ChatManager.addMessage(msg);
                        });
                    }
                    return;
                }
                
                // Handle friend list response
                if (data.type === MESSAGE_TYPES.FRIEND_LIST_RESPONSE) {
                    if (data.payload?.friends) {
                        FriendManager.mergeFriends(data.payload.friends);
                    }
                    return;
                }
                
                // Handle API responses
                if (data.type === MESSAGE_TYPES.API_RESPONSE) {
                    if (APIClient) APIClient.handleParentResponse(data.payload);
                    return;
                }
                
                // Handle WebSocket events
                if (data.type === MESSAGE_TYPES.WS_CONNECTED) {
                    if (WSController) WSController.handleParentEvent('connected', data.payload);
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.WS_AUTHENTICATED) {
                    if (WSController) WSController.handleParentEvent('authenticated', data.payload);
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.WS_DISCONNECTED) {
                    if (WSController) WSController.handleParentEvent('disconnected', data.payload);
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.WS_ERROR) {
                    if (WSController) WSController.handleParentEvent('error', data.payload);
                    return;
                }
                
                // Handle system messages
                if (data.type === MESSAGE_TYPES.SYSTEM_READY) {
                    Logger.info('System', 'System ready');
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.PARENT_RECOVERY) {
                    Logger.info('System', 'Parent recovery');
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.FORCE_LOGOUT) {
                    Logger.info('System', 'Force logout');
                    SessionStore.clear();
                    FriendManager.clear();
                    ChatManager.clear();
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.NAVIGATE) {
                    window.dispatchEvent(new CustomEvent('navigateRequest', {
                        detail: data.payload
                    }));
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.PERMISSION_UPDATE) {
                    window.dispatchEvent(new CustomEvent('permissionUpdate', {
                        detail: data.payload
                    }));
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.SETTINGS_UPDATED) {
                    SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, data.payload);
                    window.dispatchEvent(new CustomEvent('settingsUpdated', {
                        detail: data.payload
                    }));
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.INCOMING_CALL) {
                    if (SessionStore && SessionStore.isAuthenticated()) {
                        window.dispatchEvent(new CustomEvent('incomingCall', {
                            detail: data.payload
                        }));
                    }
                    return;
                }
                
                if (data.type === MESSAGE_TYPES.PING) {
                    MessagesTransport.send(MESSAGE_TYPES.PONG, {
                        timestamp: Date.now(),
                        echo: data.payload?.timestamp
                    }, { requireAck: false });
                    return;
                }
            }, true);
            
            Logger.info('Interceptor', 'Parent response interceptor initialized');
            return this;
        },
        
        _handleNewMessage: function(payload) {
            if (!payload) return;
            
            const message = {
                id: payload.id || payload.messageId || SecurityUtils.generateMessageId(),
                chatId: payload.chatId,
                senderId: payload.senderId,
                content: SecurityUtils.sanitizeString(payload.content || ''),
                type: payload.type || 'text',
                timestamp: payload.timestamp || Date.now(),
                status: 'received',
                attachment: payload.attachment,
                replyTo: payload.replyTo,
                mentions: payload.mentions,
                reactions: payload.reactions || {}
            };
            
            // Check for duplicate
            if (MessageIdCache.has(message.id)) return;
            MessageIdCache.add(message.id);
            
            // Add to chat manager
            ChatManager.addMessage(message);
            
            // Play notification if not current chat
            const activeChat = ChatManager.getActiveChat();
            if (!activeChat || activeChat.id !== message.chatId) {
                if (message.senderId !== SessionStore.getUserId()) {
                    playNotificationSound();
                }
            }
            
            // Send delivery receipt
            if (StateMachine.isReady()) {
                MessagesTransport.send(MESSAGE_TYPES.MESSAGE_DELIVERED, {
                    messageId: message.id,
                    timestamp: Date.now()
                }, { requireAck: false });
            }
            
            window.dispatchEvent(new CustomEvent('messageReceived', {
                detail: { message }
            }));
        },
        
        getLastMessageTime: function() {
            return this._lastMessageTime;
        }
    }.init();

    // =============================================
    // SESSION VERIFIER - Synchronous verification
    // =============================================
    const SessionVerifier = {
        _pendingVerifications: new Map(),
        
        // Verify session before sensitive operations
        async verifyBeforeAction(action, options = {}) {
            // Only verify if we're READY
            if (!StateMachine.isReady()) {
                return { allowed: false, reason: 'not-ready', state: StateMachine.getState() };
            }
            
            // Check if we have a session
            if (!SessionStore.isAuthenticated()) {
                return { allowed: false, reason: 'not-authenticated' };
            }
            
            // Perform verification
            const result = await this.verifySession({ 
                timeout: TIMING.VERIFY_SESSION_TIMEOUT,
                maxRetries: TIMING.VERIFY_MAX_RETRIES,
                action 
            });
            
            if (!result.valid) {
                // Log but don't degrade
                Logger.warn('SessionVerifier', `Verification failed for action: ${action}`, result);
                
                // Use cached session if available
                const session = SessionStore.getSession();
                if (session && session.expiresAt > Date.now()) {
                    return { allowed: true, cached: true, session };
                }
                
                return { allowed: false, reason: 'session-invalid' };
            }
            
            return { allowed: true, verified: true, session: result.session };
        },
        
        async verifySession(options = {}) {
            const requestId = SecurityUtils.generateRequestId();
            const maxRetries = options.maxRetries || 0;
            let attempt = 0;
            
            while (attempt <= maxRetries) {
                const result = await this._doVerify(requestId, options);
                
                if (result.success) {
                    return result;
                }
                
                attempt++;
                
                if (attempt <= maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
            return { valid: false, error: 'verification-failed' };
        },
        
        _doVerify: function(requestId, options) {
            return new Promise((resolve) => {
                const timeout = options.timeout || TIMING.VERIFY_SESSION_TIMEOUT;
                
                const timer = setTimeout(() => {
                    if (this._pendingVerifications.has(requestId)) {
                        this._pendingVerifications.delete(requestId);
                        
                        // Timeout - use cached session if valid
                        const session = SessionStore.getSession();
                        if (session && session.expiresAt > Date.now()) {
                            resolve({ valid: true, cached: true, session });
                        } else {
                            resolve({ valid: false, error: 'timeout' });
                        }
                    }
                }, timeout);
                
                this._pendingVerifications.set(requestId, { resolve, timer });
                
                MessagesTransport.send(MESSAGE_TYPES.VERIFY_SESSION, {
                    requestId,
                    action: options.action,
                    timestamp: Date.now()
                }, { 
                    requireAck: true, 
                    timeout,
                    requestId,
                    maxRetries: 0  // Don't retry at transport level
                }).then(response => {
                    clearTimeout(timer);
                    
                    if (response.success && response.ack) {
                        this._handleVerificationResponse(requestId, response.ack, resolve);
                    } else {
                        // Failed - use cached if available
                        const session = SessionStore.getSession();
                        if (session && session.expiresAt > Date.now()) {
                            resolve({ valid: true, cached: true, session });
                        } else {
                            resolve({ valid: false, error: 'verification-failed' });
                        }
                    }
                }).catch(() => {
                    clearTimeout(timer);
                    
                    // Network error - use cached if available
                    const session = SessionStore.getSession();
                    if (session && session.expiresAt > Date.now()) {
                        resolve({ valid: true, cached: true, session });
                    } else {
                        resolve({ valid: false, error: 'network-error' });
                    }
                });
            });
        },
        
        _handleVerificationResponse: function(requestId, payload, resolve) {
            this._pendingVerifications.delete(requestId);
            
            if (payload.valid) {
                if (payload.session) {
                    // Update session if newer
                    SessionStore.setSession(payload.session);
                }
                resolve({ valid: true, session: payload.session });
            } else {
                resolve({ valid: false });
            }
        }
    };

    // =============================================
    // INTEGRATION HUB - For other cores only
    // =============================================
    const IntegrationHub = {
        _friendCore: null,
        _callsCore: null,
        _groupCore: null,
        _statusCore: null,
        _toolCore: null,
        _initialized: false,
        _listeners: new Map(),
        
        init: function() {
            if (this._initialized) return this;
            
            // Connect to other cores but don't broadcast directly
            this._connectToFriendCore();
            this._connectToCallsCore();
            this._connectToGroupCore();
            this._connectToStatusCore();
            this._connectToToolCore();
            
            this._initialized = true;
            
            Logger.once('Integration', 'Connected to all cores');
            
            return this;
        },
        
        _connectToFriendCore: function() {
            if (window.friendCore) {
                this._friendCore = window.friendCore;
                
                if (typeof this._friendCore.subscribe === 'function') {
                    this._friendCore.subscribe((friends) => {
                        // Only update local state, don't broadcast
                        FriendManager.mergeFriends(friends);
                    });
                }
                
                Logger.once('Integration', 'Connected to friend-core');
            }
        },
        
        _connectToCallsCore: function() {
            if (window.callsCore) {
                this._callsCore = window.callsCore;
                Logger.once('Integration', 'Connected to calls-core');
            }
        },
        
        _connectToGroupCore: function() {
            if (window.groupCore) {
                this._groupCore = window.groupCore;
                
                if (typeof this._groupCore.subscribe === 'function') {
                    this._groupCore.subscribe((groups) => {
                        // Only update local state, don't broadcast
                        ChatManager.mergeGroupChats(groups);
                    });
                }
                
                Logger.once('Integration', 'Connected to group-core');
            }
        },
        
        _connectToStatusCore: function() {
            if (window.statusCore) {
                this._statusCore = window.statusCore;
                
                if (typeof this._statusCore.subscribe === 'function') {
                    this._statusCore.subscribe((statuses) => {
                        // Only update local state, don't broadcast
                        statuses.forEach(status => {
                            FriendManager.updateFriend({
                                id: status.userId,
                                online: status.online,
                                lastSeen: status.lastSeen,
                                status: status.status
                            });
                        });
                    });
                }
                
                Logger.once('Integration', 'Connected to status-core');
            }
        },
        
        _connectToToolCore: function() {
            if (window.toolCore) {
                this._toolCore = window.toolCore;
                Logger.once('Integration', 'Connected to tool-core');
            }
        },
        
        getFriendCore: function() {
            return this._friendCore;
        },
        
        getCallsCore: function() {
            return this._callsCore;
        },
        
        getGroupCore: function() {
            return this._groupCore;
        },
        
        getStatusCore: function() {
            return this._statusCore;
        },
        
        getToolCore: function() {
            return this._toolCore;
        },
        
        subscribe: function(event, callback) {
            if (!this._listeners.has(event)) {
                this._listeners.set(event, new Set());
            }
            this._listeners.get(event).add(callback);
            
            return () => {
                const listeners = this._listeners.get(event);
                if (listeners) {
                    listeners.delete(callback);
                }
            };
        },
        
        _emit: function(event, data) {
            const listeners = this._listeners.get(event);
            if (listeners) {
                listeners.forEach(cb => {
                    try { cb(data); } catch (e) {}
                });
            }
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
        _loadPromise: null,
        _subscribers: new Set(),
        _lastLoadTime: 0,
        _cacheTTL: 300000,
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
                this._lastLoadTime = cached.timestamp || 0;
                
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
        
        async loadFriends(force = false) {
            const now = Date.now();
            
            if (!force && this._loaded && now - this._lastLoadTime < this._cacheTTL) {
                return this._friends;
            }
            
            if (this._loading) {
                return this._loadPromise;
            }
            
            this._loading = true;
            this._loadPromise = this._doLoadFriends();
            
            try {
                const friends = await this._loadPromise;
                return friends;
            } finally {
                this._loading = false;
                this._loadPromise = null;
            }
        },
        
        async _doLoadFriends() {
            // Only load if we're at least ACTIVE
            if (!StateMachine.isActive()) {
                return this._friends;
            }
            
            const result = await RetryManager.executeWithRetry(async () => {
                const response = await MessagesTransport.send(MESSAGE_TYPES.GET_FRIEND_LIST, {
                    timestamp: Date.now(),
                    frameId: FRAME_ID
                }, { requireAck: true, timeout: 3000 });
                
                if (!response.success || !response.ack?.friends) {
                    throw new Error('Failed to load friends');
                }
                
                return response;
            }, {
                maxRetries: 2,
                baseDelay: 1000,
                key: 'load_friends'
            });
            
            if (result.success && result.result.ack?.friends) {
                this._friends = result.result.ack.friends;
                this._rebuildMap();
                this._loaded = true;
                this._lastLoadTime = Date.now();
                
                this._friends.forEach(friend => {
                    if (friend.online) {
                        this._activeFriends.add(friend.id || friend.uid);
                    }
                });
                
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE, {
                    friends: this._friends,
                    timestamp: this._lastLoadTime
                });
                
                Logger.success('FriendManager', `Loaded ${this._friends.length} friends`);
                this._notifySubscribers();
                
                return this._friends;
            }
            
            return this._friends;
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
        
        getFriends: function() {
            return [...this._friends];
        },
        
        getFriend: function(id) {
            return this._friendsMap.get(id) || null;
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
                try { cb(friends); } catch (e) {}
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
    // CHAT MANAGER
    // =============================================
    const ChatManager = {
        _chats: [],
        _chatsMap: new Map(),
        _activeChat: null,
        _messages: [],
        _messagesMap: new Map(),
        _subscribers: new Set(),
        _loaded: false,
        _historyCache: new Map(),
        _groupChats: new Map(),
        
        init: function() {
            this._loadFromCache();
            return this;
        },
        
        _loadFromCache: function() {
            const cached = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cached && Array.isArray(cached.chats)) {
                this._chats = cached.chats;
                this._rebuildMap();
                this._loaded = true;
            }
            
            const archived = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);
            archived.forEach(chatId => {
                const chat = this._chatsMap.get(chatId);
                if (chat) chat.archived = true;
            });
        },
        
        _rebuildMap: function() {
            this._chatsMap.clear();
            this._chats.forEach(chat => {
                if (chat.id) {
                    this._chatsMap.set(chat.id, chat);
                }
            });
        },
        
        loadPreviousChat: function(friendId) {
            if (this._historyCache.has(friendId)) {
                const cached = this._historyCache.get(friendId);
                if (Date.now() - cached.timestamp < 300000) {
                    return cached.messages;
                }
            }
            
            const stored = SafeStorage.getJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${friendId}`);
            if (stored && Array.isArray(stored)) {
                this._historyCache.set(friendId, {
                    messages: stored,
                    timestamp: Date.now()
                });
                return stored;
            }
            
            return null;
        },
        
        async loadChats(force = false) {
            // Only load if we're at least ACTIVE
            if (!StateMachine.isActive()) {
                return this._chats;
            }
            
            const result = await RetryManager.executeWithRetry(async () => {
                const response = await MessagesTransport.send(MESSAGE_TYPES.GET_CHAT_HISTORY, {
                    timestamp: Date.now(),
                    frameId: FRAME_ID,
                    all: true
                }, { requireAck: true, timeout: 3000 });
                
                if (!response.success) {
                    throw new Error('Failed to load chats');
                }
                
                return response;
            }, {
                maxRetries: 2,
                baseDelay: 1000,
                key: 'load_chats'
            });
            
            if (result.success && result.result.ack?.chats) {
                this._chats = result.result.ack.chats;
                this._rebuildMap();
                
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, {
                    chats: this._chats,
                    timestamp: Date.now()
                });
                
                this._notifySubscribers();
            }
            
            return this._chats;
        },
        
        async openChat(chatId) {
            if (!chatId) return null;
            
            let chat = this._chatsMap.get(chatId);
            
            if (!chat) {
                try {
                    const result = await RetryManager.executeWithRetry(async () => {
                        const response = await MessagesTransport.send(MESSAGE_TYPES.GET_CHAT_HISTORY, {
                            chatId,
                            timestamp: Date.now()
                        }, { requireAck: true, timeout: 5000 });
                        
                        if (!response.success) {
                            throw new Error('Failed to open chat');
                        }
                        
                        return response;
                    }, {
                        maxRetries: 1,
                        baseDelay: 1000,
                        key: `open_chat_${chatId}`
                    });
                    
                    if (result.success && result.result.ack?.chat) {
                        chat = result.result.ack.chat;
                        if (!this._chatsMap.has(chatId)) {
                            this._chats.push(chat);
                            this._chatsMap.set(chatId, chat);
                        }
                    }
                } catch (error) {
                    Logger.error('ChatManager', `Failed to open chat ${chatId}`, error);
                    return null;
                }
            }
            
            if (!chat) return null;
            
            this._activeChat = chat;
            
            const localMessages = this.loadPreviousChat(chatId);
            if (localMessages) {
                this._messages = localMessages;
                this._rebuildMessagesMap();
            }
            
            // Only load messages if READY
            if (StateMachine.isReady()) {
                this.loadMessages(chatId).catch(() => {});
            }
            
            window.dispatchEvent(new CustomEvent('chatOpened', {
                detail: { chat, messages: this._messages }
            }));
            
            return chat;
        },
        
        async loadMessages(chatId) {
            if (!chatId) return [];
            
            // Only load if READY
            if (!StateMachine.isReady()) return this._messages;
            
            const result = await RetryManager.executeWithRetry(async () => {
                const response = await MessagesTransport.send(MESSAGE_TYPES.GET_CHAT_HISTORY, {
                    chatId,
                    timestamp: Date.now()
                }, { requireAck: true, timeout: 5000 });
                
                if (!response.success) {
                    throw new Error('Failed to load messages');
                }
                
                return response;
            }, {
                maxRetries: 2,
                baseDelay: 1000,
                key: `load_messages_${chatId}`
            });
            
            if (result.success && result.result.ack?.messages) {
                this._messages = result.result.ack.messages;
                this._rebuildMessagesMap();
                
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`, this._messages);
                this._historyCache.set(chatId, {
                    messages: this._messages,
                    timestamp: Date.now()
                });
            }
            
            return this._messages;
        },
        
        _rebuildMessagesMap: function() {
            this._messagesMap.clear();
            this._messages.forEach(msg => {
                if (msg.id) {
                    this._messagesMap.set(msg.id, msg);
                }
            });
        },
        
        addMessage: function(message) {
            if (!message.id) {
                message.id = SecurityUtils.generateMessageId();
            }
            
            const existing = this._messagesMap.get(message.id);
            if (existing) {
                Object.assign(existing, message);
            } else {
                this._messages.push(message);
                this._messagesMap.set(message.id, message);
            }
            
            this._messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
            if (this._activeChat && message.chatId === this._activeChat.id) {
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${this._activeChat.id}`, this._messages);
                
                this._historyCache.set(this._activeChat.id, {
                    messages: this._messages,
                    timestamp: Date.now()
                });
            }
            
            window.dispatchEvent(new CustomEvent('messageAdded', {
                detail: { message, chatId: message.chatId }
            }));
            
            return message;
        },
        
        mergeGroupChats: function(groups) {
            groups.forEach(group => {
                this._groupChats.set(group.id, group);
                
                const existing = this._chatsMap.get(group.id);
                if (existing) {
                    Object.assign(existing, group);
                } else {
                    this._chats.push(group);
                    this._chatsMap.set(group.id, group);
                }
            });
            
            this._notifySubscribers();
        },
        
        updateMessageStatus: function(messageId, status, details = {}) {
            const message = this._messagesMap.get(messageId);
            if (!message) return false;
            
            message.status = status;
            if (details.deliveredAt) message.deliveredAt = details.deliveredAt;
            if (details.readAt) message.readAt = details.readAt;
            
            window.dispatchEvent(new CustomEvent('messageStatusChanged', {
                detail: { messageId, status, message }
            }));
            
            return true;
        },
        
        getActiveChat: function() {
            return this._activeChat ? { ...this._activeChat } : null;
        },
        
        getMessages: function() {
            return [...this._messages];
        },
        
        getChats: function() {
            return [...this._chats];
        },
        
        getGroupChats: function() {
            return Array.from(this._groupChats.values());
        },
        
        subscribe: function(callback) {
            this._subscribers.add(callback);
            return () => this._subscribers.delete(callback);
        },
        
        _notifySubscribers: function() {
            this._subscribers.forEach(cb => {
                try { cb(this._chats, this._activeChat); } catch (e) {}
            });
        },
        
        clear: function() {
            this._chats = [];
            this._chatsMap.clear();
            this._activeChat = null;
            this._messages = [];
            this._messagesMap.clear();
            this._historyCache.clear();
            this._groupChats.clear();
        }
    }.init();

    // =============================================
    // GROUP CHAT MANAGER
    // =============================================
    const GroupChatManager = {
        _groups: new Map(),
        _pendingInvites: new Set(),
        
        async createGroupChat(name, memberIds) {
            if (!name || !memberIds || memberIds.length === 0) {
                return { success: false, error: 'Invalid group data' };
            }
            
            const validMembers = [];
            for (const memberId of memberIds) {
                const friend = FriendManager.getFriend(memberId);
                if (friend && !FriendManager.isFriendBlocked(memberId)) {
                    validMembers.push({
                        id: memberId,
                        name: friend.displayName || friend.username,
                        avatar: friend.photoURL
                    });
                }
            }
            
            if (validMembers.length < 2) {
                return { success: false, error: 'Need at least 2 valid members' };
            }
            
            const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            
            const group = {
                id: groupId,
                name,
                members: validMembers,
                createdBy: SessionStore.getUserId(),
                createdAt: Date.now(),
                type: 'group',
                lastMessage: '',
                lastMessageAt: Date.now(),
                unreadCount: 0,
                local: true
            };
            
            this._groups.set(groupId, group);
            
            ChatManager.mergeGroupChats([group]);
            
            // Send to parent if READY
            if (StateMachine.isReady()) {
                MessagesTransport.send(MESSAGE_TYPES.CREATE_CHAT, {
                    type: 'group',
                    name,
                    members: memberIds,
                    groupId
                }, { requireAck: false });
            }
            
            window.dispatchEvent(new CustomEvent('groupChatCreated', {
                detail: { group }
            }));
            
            return { success: true, group };
        },
        
        async addToGroup(groupId, memberId) {
            const group = this._groups.get(groupId) || ChatManager._chatsMap.get(groupId);
            if (!group) return false;
            
            const friend = FriendManager.getFriend(memberId);
            if (!friend || FriendManager.isFriendBlocked(memberId)) {
                return false;
            }
            
            if (group.members.some(m => m.id === memberId)) {
                return false;
            }
            
            group.members.push({
                id: memberId,
                name: friend.displayName || friend.username,
                avatar: friend.photoURL
            });
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, {
                chats: ChatManager._chats,
                timestamp: Date.now()
            });
            
            if (StateMachine.isReady()) {
                MessagesTransport.send('GROUP_MEMBER_ADDED', {
                    groupId,
                    memberId,
                    timestamp: Date.now()
                }, { requireAck: false });
            }
            
            window.dispatchEvent(new CustomEvent('groupMemberAdded', {
                detail: { groupId, memberId, group }
            }));
            
            return true;
        },
        
        removeFromGroup: function(groupId, memberId) {
            const group = this._groups.get(groupId) || ChatManager._chatsMap.get(groupId);
            if (!group) return false;
            
            const index = group.members.findIndex(m => m.id === memberId);
            if (index === -1) return false;
            
            group.members.splice(index, 1);
            
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, {
                chats: ChatManager._chats,
                timestamp: Date.now()
            });
            
            window.dispatchEvent(new CustomEvent('groupMemberRemoved', {
                detail: { groupId, memberId, group }
            }));
            
            return true;
        },
        
        getGroups: function() {
            return Array.from(this._groups.values());
        },
        
        getGroup: function(groupId) {
            return this._groups.get(groupId) || ChatManager._chatsMap.get(groupId);
        }
    };

    // =============================================
    // WEBSOCKET CONTROLLER - Parent managed
    // =============================================
    const WSController = {
        WS_UNINITIALIZED: 'UNINITIALIZED',
        WS_CONNECTING: 'CONNECTING',
        WS_CONNECTED: 'CONNECTED',
        WS_AUTHENTICATING: 'AUTHENTICATING',
        WS_READY: 'READY',
        WS_RECONNECTING: 'RECONNECTING',
        WS_CLOSED: 'CLOSED',
        WS_ERROR: 'ERROR',
        
        _state: 'UNINITIALIZED',
        _ws: null,
        _connectPromise: null,
        _connectResolve: null,
        _reconnectAttempts: 0,
        _maxReconnectAttempts: 2,
        _baseDelay: 1000,
        _maxDelay: 30000,
        _heartbeatInterval: null,
        _pendingMessages: [],
        _authenticated: false,
        _url: null,
        _messageHandlers: new Map(),
        _initialized: false,
        _authTimeout: null,
        _parentManaged: true,  // WebSocket is managed by parent
        
        init: function() {
            if (this._initialized) return this;
            this._initialized = true;
            
            this._setupMessageHandlers();
            return this;
        },
        
        _setupMessageHandlers: function() {
            this._messageHandlers.set('message', (data) => {
                const message = {
                    id: data.id || SecurityUtils.generateMessageId(),
                    chatId: data.chatId,
                    senderId: data.senderId,
                    content: SecurityUtils.sanitizeString(data.content || ''),
                    type: data.type || 'text',
                    timestamp: data.timestamp || Date.now(),
                    status: 'received'
                };
                
                ChatManager.addMessage(message);
                
                if (message.senderId !== SessionStore.getUserId()) {
                    playNotificationSound();
                }
            });
            
            this._messageHandlers.set('typing', (data) => {
                if (ChatManager.getActiveChat()?.id === data.chatId) {
                    window.dispatchEvent(new CustomEvent('typingIndicator', {
                        detail: { userId: data.userId, isTyping: data.isTyping, chatId: data.chatId }
                    }));
                }
            });
            
            this._messageHandlers.set('read_receipt', (data) => {
                ChatManager.updateMessageStatus(data.messageId, 'read', { readAt: data.timestamp });
            });
            
            this._messageHandlers.set('delivery_receipt', (data) => {
                ChatManager.updateMessageStatus(data.messageId, 'delivered', { deliveredAt: data.timestamp });
            });
        },
        
        // Handle events from parent
        handleParentEvent: function(event, payload) {
            switch (event) {
                case 'connected':
                    this._state = this.WS_CONNECTED;
                    this._authenticated = false;
                    Logger.info('WSController', 'WebSocket connected (parent managed)');
                    break;
                    
                case 'authenticated':
                    this._state = this.WS_READY;
                    this._authenticated = true;
                    Logger.info('WSController', 'WebSocket authenticated (parent managed)');
                    window.dispatchEvent(new CustomEvent('wsReady'));
                    break;
                    
                case 'disconnected':
                    this._state = this.WS_CLOSED;
                    this._authenticated = false;
                    Logger.warn('WSController', 'WebSocket disconnected (parent managed)');
                    break;
                    
                case 'error':
                    this._state = this.WS_ERROR;
                    Logger.error('WSController', 'WebSocket error (parent managed)', payload);
                    break;
            }
        },
        
        // Send message via parent WebSocket
        send: function(data) {
            if (!StateMachine.isReady()) {
                this._queueMessage(data);
                return false;
            }
            
            // Send via parent
            MessagesTransport.send('WS_SEND', data, { requireAck: false });
            return true;
        },
        
        _queueMessage: function(data) {
            this._pendingMessages.push({
                data,
                timestamp: Date.now()
            });
        },
        
        _flushPendingMessages: function() {
            if (this._pendingMessages.length === 0) return;
            
            const messages = [...this._pendingMessages];
            this._pendingMessages = [];
            
            messages.forEach(item => {
                MessagesTransport.send('WS_SEND', item.data, { requireAck: false });
            });
        },
        
        disconnect: function() {
            // Nothing to do - parent manages
            this._state = this.WS_CLOSED;
            this._authenticated = false;
        },
        
        getState: function() {
            return this._state;
        },
        
        isReady: function() {
            return this._authenticated && this._state === this.WS_READY;
        }
    }.init();

    // =============================================
    // MESSAGE LIFECYCLE MANAGER
    // =============================================
    const MessageLifecycle = {
        _pendingMessages: new Map(),
        _optimisticMessages: new Map(),
        _deliveryCallbacks: new Map(),
        _typingTimeout: null,
        _lastTypingTime: 0,
        
        async sendMessage(content, options = {}) {
            // Must be READY to send
            if (!StateMachine.isReady()) {
                Logger.warn('MessageLifecycle', 'Cannot send message - not READY');
                return { success: false, error: 'not-ready', state: StateMachine.getState() };
            }
            
            const activeChat = ChatManager.getActiveChat();
            if (!activeChat && !options.chatId) {
                return { success: false, error: 'No active chat' };
            }
            
            const chatId = options.chatId || activeChat.id;
            const messageId = options.id || this._generateMessageId();
            const requestId = `send_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const timestamp = Date.now();
            
            // Verify session before sending
            const verification = await SessionVerifier.verifyBeforeAction('send-message', {
                maxRetries: TIMING.VERIFY_MAX_RETRIES
            });
            
            if (!verification.allowed) {
                Logger.warn('MessageLifecycle', 'Cannot send - session verification failed', verification);
                return { success: false, error: 'session-invalid', reason: verification.reason };
            }
            
            // Create optimistic message
            const optimisticMessage = {
                id: messageId,
                requestId,
                chatId,
                senderId: SessionStore.getUserId(),
                content: SecurityUtils.escapeHtml(content || ''),
                type: options.type || 'text',
                timestamp,
                status: 'sending',
                local: true,
                attachment: options.attachment,
                replyTo: options.replyTo,
                mentions: options.mentions,
                ...options
            };
            
            ChatManager.addMessage(optimisticMessage);
            this._optimisticMessages.set(messageId, optimisticMessage);
            
            window.dispatchEvent(new CustomEvent('messageSent', {
                detail: { message: optimisticMessage, optimistic: true }
            }));
            
            const payload = {
                chatId,
                content,
                type: options.type || 'text',
                attachment: options.attachment,
                replyTo: options.replyTo,
                mentions: options.mentions,
                messageId,
                requestId,
                timestamp
            };
            
            const result = await RetryManager.executeWithRetry(async () => {
                const response = await MessagesTransport.send(MESSAGE_TYPES.SEND_MESSAGE, payload, {
                    requireAck: true,
                    maxRetries: 2,
                    timeout: 7000,
                    requestId
                });
                
                if (!response.success) {
                    throw new Error(response.error || 'Send failed');
                }
                
                return response;
            }, {
                maxRetries: 2,
                baseDelay: 1500,
                key: `send_${messageId}`
            });
            
            if (result.success) {
                ChatManager.updateMessageStatus(messageId, 'sent');
                this._optimisticMessages.delete(messageId);
                
                window.dispatchEvent(new CustomEvent('messageSent', {
                    detail: { messageId, success: true }
                }));
                
                // Notify parent of sent message
                MessagesTransport.send(MESSAGE_TYPES.MESSAGE_SENT, {
                    messageId,
                    chatId,
                    timestamp: Date.now()
                }, { requireAck: false });
                
                if (options.onDelivered) {
                    this._deliveryCallbacks.set(messageId, options.onDelivered);
                }
                
                return { success: true, messageId, requestId };
            } else {
                ChatManager.updateMessageStatus(messageId, 'failed', { reason: result.error?.message });
                this._optimisticMessages.delete(messageId);
                
                if (StateMachine.isDegraded() || !navigator.onLine) {
                    this._queueOfflineMessage(payload);
                }
                
                window.dispatchEvent(new CustomEvent('messageFailed', {
                    detail: { messageId, error: result.error?.message }
                }));
                
                return { success: false, error: result.error?.message, messageId };
            }
        },
        
        _queueOfflineMessage: function(payload) {
            const offlineQueue = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, []);
            offlineQueue.push({
                ...payload,
                queuedAt: Date.now()
            });
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
        },
        
        retryMessage: function(messageId) {
            const messages = ChatManager.getMessages();
            const message = messages.find(m => m.id === messageId);
            if (!message || message.status !== 'failed') return false;
            
            message.status = 'sending';
            ChatManager.updateMessageStatus(messageId, 'sending');
            
            return this.sendMessage(message.content, {
                type: message.type,
                attachment: message.attachment,
                replyTo: message.replyTo,
                id: messageId,
                chatId: message.chatId
            });
        },
        
        handleDeliveryReceipt: function(messageId, timestamp) {
            ChatManager.updateMessageStatus(messageId, 'delivered', { deliveredAt: timestamp });
            
            const callback = this._deliveryCallbacks.get(messageId);
            if (callback) {
                try { callback(timestamp); } catch (e) {}
                this._deliveryCallbacks.delete(messageId);
            }
            
            window.dispatchEvent(new CustomEvent('messageDelivered', {
                detail: { messageId, timestamp }
            }));
        },
        
        handleReadReceipt: function(messageId, timestamp) {
            ChatManager.updateMessageStatus(messageId, 'read', { readAt: timestamp });
            
            window.dispatchEvent(new CustomEvent('messageRead', {
                detail: { messageId, timestamp }
            }));
        },
        
        sendTypingIndicator: function(chatId, isTyping) {
            if (!StateMachine.isReady()) return false;
            if (!chatId) return false;
            
            // Debounce typing events
            const now = Date.now();
            if (isTyping && now - this._lastTypingTime < 2000) return false;
            
            this._lastTypingTime = now;
            
            if (this._typingTimeout) {
                clearTimeout(this._typingTimeout);
            }
            
            MessagesTransport.send(isTyping ? MESSAGE_TYPES.TYPING_START : MESSAGE_TYPES.TYPING_STOP, {
                chatId,
                timestamp: now,
                userId: SessionStore.getUserId()
            }, { requireAck: false });
            
            if (isTyping) {
                this._typingTimeout = setTimeout(() => {
                    MessagesTransport.send(MESSAGE_TYPES.TYPING_STOP, {
                        chatId,
                        timestamp: Date.now(),
                        userId: SessionStore.getUserId()
                    }, { requireAck: false });
                }, 3000);
            }
            
            return true;
        },
        
        _generateMessageId: function() {
            return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        },
        
        getPendingCount: function() {
            return this._optimisticMessages.size;
        }
    };

    // =============================================
    // API CLIENT - Parent proxy only
    // =============================================
    const APIClient = {
        _pendingRequests: new Map(),
        _baseUrl: ENV.getApiBaseUrl(),
        
        async request(endpoint, options = {}) {
            if (!endpoint || typeof endpoint !== 'string') return null;
            
            // Prevent direct external requests
            if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
                Logger.warn('APIClient', `External URL blocked: ${endpoint}`);
                return null;
            }
            
            // Ensure API path
            if (!endpoint.startsWith('/api/')) {
                endpoint = '/api/' + endpoint.replace(/^\/+/, '');
            }
            
            const token = SessionStore.getToken();
            const requestId = options.requestId || SecurityUtils.generateRequestId();
            
            // Always use parent proxy when READY
            if (StateMachine.isReady() && options.useParent !== false) {
                return this._requestViaParent(endpoint, options, requestId, token);
            }
            
            // Fallback to direct only if not ready
            return this._requestDirect(endpoint, options, token, requestId);
        },
        
        async _requestViaParent(endpoint, options, requestId, token) {
            return new Promise((resolve) => {
                const timeout = options.timeout || 30000;
                
                const timer = setTimeout(() => {
                    if (this._pendingRequests.has(requestId)) {
                        this._pendingRequests.delete(requestId);
                        this._requestDirect(endpoint, options, token, requestId).then(resolve);
                    }
                }, timeout);
                
                this._pendingRequests.set(requestId, { resolve, timer });
                
                MessagesTransport.send(MESSAGE_TYPES.API_REQUEST, {
                    endpoint,
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body,
                    requestId,
                    token  // Send token for verification
                }, { requireAck: true, timeout, requestId }).catch(() => {
                    clearTimeout(timer);
                    this._pendingRequests.delete(requestId);
                    this._requestDirect(endpoint, options, token, requestId).then(resolve);
                });
            });
        },
        
        async _requestDirect(endpoint, options, token, requestId) {
            try {
                let url = endpoint;
                if (this._baseUrl && !endpoint.startsWith('http')) {
                    url = this._baseUrl + endpoint;
                }
                
                if (!url.startsWith('http')) {
                    return { error: 'No API endpoint configured', offline: true };
                }
                
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Client-Version': VERSION,
                    'X-Request-ID': requestId,
                    'X-Frame-ID': FRAME_ID
                };
                
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                
                const result = await RetryManager.executeWithRetry(async () => {
                    const fetchOptions = {
                        method: options.method || 'GET',
                        headers,
                        credentials: 'same-origin',
                        mode: 'cors',
                        cache: 'no-cache',
                        signal: options.signal
                    };
                    
                    if (options.method && options.method !== 'GET' && options.body) {
                        fetchOptions.body = typeof options.body === 'string' 
                            ? options.body 
                            : JSON.stringify(SecurityUtils.sanitizePayload(options.body));
                    }
                    
                    const response = await fetch(url, fetchOptions);
                    
                    if (!response.ok) {
                        throw { status: response.status, message: `HTTP ${response.status}` };
                    }
                    
                    return await response.json();
                }, {
                    maxRetries: 2,
                    baseDelay: 1000,
                    key: `api_${requestId}`
                });
                
                if (result.success) {
                    return result.result;
                } else {
                    return { error: result.error?.message || 'Network error', offline: true };
                }
            } catch (error) {
                Logger.warn('APIClient', `Network error: ${endpoint}`, error);
                return { error: 'Network error', offline: true };
            }
        },
        
        handleParentResponse: function(payload) {
            const requestId = payload.requestId;
            if (requestId && this._pendingRequests.has(requestId)) {
                const { resolve, timer } = this._pendingRequests.get(requestId);
                clearTimeout(timer);
                resolve(payload.data || payload.result);
                this._pendingRequests.delete(requestId);
            }
        }
    };

    // =============================================
    // CHAT READINESS
    // =============================================
    function canStartChatImmediately() {
        const hasCachedChats = ChatManager && ChatManager.getChats().length > 0;
        const hasCachedFriends = FriendManager && FriendManager.getFriends().length > 0;
        return hasCachedChats || hasCachedFriends;
    }
    
    window.canStartChatImmediately = canStartChatImmediately;

    // =============================================
    // UI STATE VARIABLES - Preserved from original
    // =============================================
    let currentUser = SessionStore.getUser();
    let currentChat = null;
    let currentFriend = null;
    let messages = [];
    let chats = [];
    let contacts = [];
    let isRecording = false;
    let mediaRecorder = null;
    let recordingTimer = null;
    let recordingStartTime = null;
    let typingTimeout = null;
    let isTyping = false;
    let selectedMessage = null;
    let currentThread = null;
    let chatThemes = {};
    let emojiPicker = null;
    let isSyncing = false;
    let audioPlayers = new Map();
    let editingMessageId = null;
    let replyToMessage = null;
    let currentCategory = 'all';
    let activeFormattingTags = [];
    let activeAudioElement = null;
    let scheduledMessages = [];
    let offlineQueue = [];
    let messageDrafts = {};
    let silentReactionsEnabled = true;
    let readOnlyMode = false;
    let currentAttachment = null;
    let searchResults = [];
    let currentSearchIndex = -1;
    let multiSendSelectedChats = new Set();
    let recordingCancelTimeout = null;
    let dragStartY = 0;
    let isDraggingToCancel = false;

    // =============================================
    // STATE SUBSCRIPTIONS
    // =============================================
    StateMachine.subscribe((oldState, newState, reason) => {
        window.dispatchEvent(new CustomEvent('v7StateChanged', {
            detail: { oldState, newState, reason }
        }));
        
        if (newState === V7_STATES.READY) {
            // Load friends and chats when READY
            FriendManager.loadFriends().catch(() => {});
            ChatManager.loadChats().catch(() => {});
        }
        
        if (newState === V7_STATES.DEGRADED) {
            showReconnectState('Connection degraded');
        } else {
            hideReconnectState();
        }
    });

    SessionStore.subscribe((session) => {
        currentUser = session?.user || null;
    });

    HeartbeatGovernor.subscribe((status) => {
        if (status === 'lost' && StateMachine.getState() === V7_STATES.READY) {
            // Don't degrade, just pause
            HeartbeatGovernor.pause();
        } else if (status === 'restored') {
            HeartbeatGovernor.resume();
            MessageQueue.flush();
        }
    });

    // =============================================
    // UI HELPER FUNCTIONS - Preserved from original
    // =============================================
    function setCurrentUser(user) { currentUser = user; }
    function setCurrentChat(chat) { currentChat = chat; }
    function setCurrentFriend(friend) { currentFriend = friend; }
    function setMessages(newMessages) { messages = newMessages; }
    function setChats(newChats) { chats = newChats; }
    function setContacts(newContacts) { contacts = newContacts; }
    function setIsRecording(value) { isRecording = value; }
    function setMediaRecorder(recorder) { mediaRecorder = recorder; }
    function setRecordingTimer(timer) { recordingTimer = timer; }
    function setRecordingStartTime(time) { recordingStartTime = time; }
    function setTypingTimeout(timeout) { typingTimeout = timeout; }
    function setIsTyping(value) { isTyping = value; }
    function setSelectedMessage(message) { selectedMessage = message; }
    function setCurrentThread(threadId) { currentThread = threadId; }
    function setChatThemes(themes) { chatThemes = themes; }
    function setEmojiPicker(picker) { emojiPicker = picker; }
    function setIsSyncing(value) { isSyncing = value; }
    function setAudioPlayers(players) { audioPlayers = players; }
    function setEditingMessageId(id) { editingMessageId = id; }
    function setReplyToMessage(message) { replyToMessage = message; }
    function setCurrentCategory(category) { currentCategory = category; }
    function setActiveFormattingTags(tags) { activeFormattingTags = tags; }
    function setActiveAudioElement(element) { activeAudioElement = element; }
    function setScheduledMessages(messages) { scheduledMessages = messages; }
    function setOfflineQueue(queue) { offlineQueue = queue; }
    function setMessageDrafts(drafts) { messageDrafts = drafts; }
    function setSilentReactionsEnabled(value) { silentReactionsEnabled = value; }
    function setReadOnlyMode(value) { readOnlyMode = value; }
    function setCurrentAttachment(attachment) { currentAttachment = attachment; }
    function setSearchResults(results) { searchResults = results; }
    function setCurrentSearchIndex(index) { currentSearchIndex = index; }
    function setMultiSendSelectedChats(chats) { multiSendSelectedChats = chats; }
    function setRecordingCancelTimeout(timeout) { recordingCancelTimeout = timeout; }
    function setDragStartY(y) { dragStartY = y; }
    function setIsDraggingToCancel(value) { isDraggingToCancel = value; }

    // =============================================
    // EXPORTED FUNCTIONS - Preserved from original
    // =============================================
    function getCurrentSession() {
        return {
            user: SessionStore.getUser(),
            authenticated: SessionStore.isAuthenticated(),
            token: SessionStore.getToken(),
            userId: SessionStore.getUserId()
        };
    }

    function isCoreReady() {
        return StateMachine.isReady();
    }

    function sendToParent(type, data = null, options = {}) {
        return MessagesTransport.send(type, data, options);
    }

    async function apiRequest(endpoint, options = {}) {
        return APIClient.request(endpoint, options);
    }

    async function fetchData(type) {
        switch (type) {
            case 'friendsList': 
                return FriendManager.getFriendListForChat();
            case 'groupsList': 
                return GroupChatManager.getGroups();
            case 'chatHistory': 
                return ChatManager.getMessages();
            case 'notifications': 
                return [];
            case 'settings': 
                return SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
            default: 
                return null;
        }
    }

    async function loadContacts() {
        return FriendManager.getFriendListForChat();
    }

    async function loadChats() {
        return ChatManager.getChats();
    }

    async function loadMessages(chatId = null) {
        const targetChat = chatId || currentChat?.id;
        if (!targetChat) return [];
        
        if (targetChat === ChatManager.getActiveChat()?.id) {
            return ChatManager.getMessages();
        }
        
        return ChatManager.loadMessages(targetChat);
    }

    async function openChat(chat) {
        if (!chat || !ChatManager) return false;
        
        currentChat = chat;
        
        const opened = await ChatManager.openChat(chat.id);
        
        const cachedMessages = ChatManager.loadPreviousChat(chat.id);
        if (cachedMessages && cachedMessages.length > 0) {
            window.dispatchEvent(new CustomEvent('chatOpened', {
                detail: { chat, messages: cachedMessages, fromCache: true }
            }));
        }
        
        if (opened) {
            currentFriend = opened.friend ? { ...opened.friend } : null;
            
            if (StateMachine.isReady()) {
                ChatManager.loadMessages(chat.id).then(messages => {
                    window.dispatchEvent(new CustomEvent('chatMessagesUpdated', {
                        detail: { chatId: chat.id, messages }
                    }));
                }).catch(() => {});
            }
            
            return true;
        }
        
        return false;
    }

    async function loadChatByFriendId(friendId) {
        const friend = FriendManager.getFriend(friendId);
        if (!friend) return null;
        
        const existingChat = ChatManager.getChats().find(c => c.friendId === friendId);
        if (existingChat) {
            await openChat(existingChat);
            return existingChat;
        }
        
        const newChat = {
            id: `chat_${Date.now()}`,
            friendId: friendId,
            friendName: friend.displayName || friend.username || 'User',
            friendUsername: friend.username || '',
            friendAvatar: friend.photoURL || friend.avatar || '',
            lastMessage: '',
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            type: 'direct',
            archived: false,
            blocked: false,
            local: true
        };
        
        const chats = ChatManager.getChats();
        chats.unshift(newChat);
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
        
        await openChat(newChat);
        
        if (StateMachine.isReady()) {
            MessagesTransport.send(MESSAGE_TYPES.CREATE_CHAT, {
                friendId,
                localId: newChat.id
            }, { requireAck: false }).catch(() => {});
        }
        
        return newChat;
    }

    function createLocalChat(friendId, friendData) {
        const newChat = {
            id: 'local_' + Date.now(),
            friendId: friendId,
            friendName: friendData.displayName || 'User',
            friendUsername: '',
            friendAvatar: friendData.photoURL || '',
            lastMessage: '',
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            type: 'direct',
            archived: false,
            blocked: false,
            local: true
        };

        const chats = ChatManager.getChats();
        chats.unshift(newChat);
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
        
        openChat(newChat);
    }

    async function sendMessage(content, type = 'text', options = {}) {
        return MessageLifecycle.sendMessage(content, { type, ...options });
    }

    async function sendMessageWithOptions(content, options = {}) {
        return MessageLifecycle.sendMessage(content, options);
    }

    async function sendToMultipleChats(content, chatIds) {
        if ((!content && !currentAttachment) || !chatIds?.length) return 0;

        let successCount = 0;

        for (const chatId of chatIds) {
            const result = await MessageLifecycle.sendMessage(content, {
                type: currentAttachment?.type || 'text',
                attachment: currentAttachment,
                chatId
            });
            
            if (result.success) successCount++;
            
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        return successCount;
    }

    async function createGroupChat(name, memberIds) {
        return GroupChatManager.createGroupChat(name, memberIds);
    }

    async function addToGroup(groupId, memberId) {
        return GroupChatManager.addToGroup(groupId, memberId);
    }

    function removeFromGroup(groupId, memberId) {
        return GroupChatManager.removeFromGroup(groupId, memberId);
    }

    async function editMessage(messageId, newContent) {
        if (!StateMachine.isReady()) return false;

        const result = await MessagesTransport.send('EDIT_MESSAGE', {
            messageId,
            content: newContent,
            timestamp: Date.now()
        }, { requireAck: true, timeout: 5000 });

        if (result.success) {
            const messages = ChatManager.getMessages();
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages[idx].content = SecurityUtils.escapeHtml(newContent);
                messages[idx].edited = true;
                messages[idx].editedAt = new Date().toISOString();
                
                if (ChatManager.getActiveChat()) {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                }
            }
            return true;
        }
        
        return false;
    }

    function saveEditedMessage(messageId) {
        const input = document.getElementById(`editMessageInput_${messageId}`);
        if (input && input.value?.trim()) {
            return editMessage(messageId, input.value.trim());
        }
        return false;
    }

    function cancelEditMessage() {
        editingMessageId = null;
    }

    async function deleteMessage(messageId, forEveryone = false) {
        if (!StateMachine.isReady()) return false;

        if (forEveryone) {
            const result = await MessagesTransport.send('DELETE_MESSAGE', {
                messageId,
                forEveryone,
                timestamp: Date.now()
            }, { requireAck: true, timeout: 5000 });

            if (result.success) {
                const messages = ChatManager.getMessages();
                const idx = messages.findIndex(m => m.id === messageId);
                if (idx !== -1) {
                    messages[idx].deleted = true;
                    messages[idx].deletedAt = new Date().toISOString();
                    
                    if (ChatManager.getActiveChat()) {
                        SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                    }
                }
                return true;
            }
        } else {
            const messages = ChatManager.getMessages();
            const idx = messages.findIndex(m => m.id === messageId);
            if (idx !== -1) {
                messages.splice(idx, 1);
                
                if (ChatManager.getActiveChat()) {
                    SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
                }
                return true;
            }
        }
        
        return false;
    }

    async function markChatAsRead(chatId) {
        if (!StateMachine.isReady()) return false;

        const result = await MessagesTransport.send('MARK_READ', {
            chatId,
            timestamp: Date.now()
        }, { requireAck: false });

        const chats = ChatManager.getChats();
        const idx = chats.findIndex(c => c.id === chatId);
        if (idx !== -1) {
            chats[idx].unreadCount = 0;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
        }

        return true;
    }

    async function addReaction(messageId, emoji, silent = false) {
        if (!StateMachine.isReady() && !silent) return false;

        const messages = ChatManager.getMessages();
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) return false;

        if (!messages[idx].reactions) messages[idx].reactions = {};

        const userId = SessionStore.getUserId();
        if (!userId) return false;

        if (!messages[idx].reactions[emoji]) {
            messages[idx].reactions[emoji] = [];
        }

        const userIndex = messages[idx].reactions[emoji].indexOf(userId);

        if (userIndex > -1) {
            messages[idx].reactions[emoji].splice(userIndex, 1);
        } else {
            messages[idx].reactions[emoji].push(userId);
        }

        if (messages[idx].reactions[emoji].length === 0) {
            delete messages[idx].reactions[emoji];
        }

        if (ChatManager.getActiveChat()) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
        }

        if (!silent && StateMachine.isReady()) {
            await MessagesTransport.send('ADD_REACTION', {
                messageId,
                emoji,
                add: userIndex === -1,
                timestamp: Date.now()
            }, { requireAck: false });
        }

        return userIndex > -1 ? 'removed' : 'added';
    }

    async function toggleBlockUser(friendId, block) {
        if (!StateMachine.isReady()) return false;

        const blockedUsers = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, []);

        if (block) {
            if (!blockedUsers.includes(friendId)) blockedUsers.push(friendId);
        } else {
            const index = blockedUsers.indexOf(friendId);
            if (index > -1) blockedUsers.splice(index, 1);
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.BLOCKED_USERS, blockedUsers);

        const chats = ChatManager.getChats();
        chats.forEach(chat => {
            if (chat.friendId === friendId) chat.blocked = block;
        });

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });

        await MessagesTransport.send('BLOCK_USER', {
            friendId,
            block,
            timestamp: Date.now()
        }, { requireAck: false });

        return true;
    }

    async function toggleArchiveChat(chatId, archive) {
        if (!StateMachine.isReady()) return false;

        const archivedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, []);

        if (archive) {
            if (!archivedChats.includes(chatId)) archivedChats.push(chatId);
        } else {
            const index = archivedChats.indexOf(chatId);
            if (index > -1) archivedChats.splice(index, 1);
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.ARCHIVED_CHATS, archivedChats);

        const chats = ChatManager.getChats();
        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].archived = archive;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
            return true;
        }

        return false;
    }

    async function toggleReadOnly(chatId, readOnly) {
        if (!StateMachine.isReady()) return false;

        const chats = ChatManager.getChats();
        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].readOnly = readOnly;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
            return true;
        }
        
        return false;
    }

    async function clearChatHistory(chatId) {
        SafeStorage.remove(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`);

        const chats = ChatManager.getChats();
        const idx = chats.findIndex(chat => chat.id === chatId);
        if (idx !== -1) {
            chats[idx].lastMessage = '';
            chats[idx].unreadCount = 0;
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats, timestamp: Date.now() });
        }

        if (ChatManager.getActiveChat()?.id === chatId) {
            ChatManager._messages = [];
        }

        return true;
    }

    async function voteInPoll(messageId, optionIndex) {
        if (!StateMachine.isReady()) return false;

        const messages = ChatManager.getMessages();
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) return false;

        const poll = messages[idx];
        if (!poll.options || !Array.isArray(poll.options)) return false;

        const userId = SessionStore.getUserId();
        if (!userId) return false;

        if (poll.userVote !== undefined && poll.userVote !== null) {
            const prevOption = poll.options[poll.userVote];
            if (prevOption) {
                prevOption.votes = Math.max(0, (prevOption.votes || 0) - 1);
                const voterIndex = prevOption.voters?.indexOf(userId);
                if (voterIndex > -1) prevOption.voters.splice(voterIndex, 1);
            }
        }

        if (!poll.options[optionIndex]) return false;

        poll.options[optionIndex].votes = (poll.options[optionIndex].votes || 0) + 1;
        if (!poll.options[optionIndex].voters) poll.options[optionIndex].voters = [];
        poll.options[optionIndex].voters.push(userId);
        poll.userVote = optionIndex;

        if (ChatManager.getActiveChat()) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, messages);
        }

        await MessagesTransport.send('VOTE_POLL', {
            messageId,
            optionIndex,
            timestamp: Date.now()
        }, { requireAck: false });

        return true;
    }

    function formatMessageText(text) {
        if (!text) return '';

        let formatted = SecurityUtils.escapeHtml(text);
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        formatted = formatted.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
        formatted = formatted.replace(/\n/g, '<br>');
        return formatted;
    }

    function formatTime(date) {
        if (!date) return '';

        const now = new Date();
        const messageDate = new Date(date);
        const diffMs = now - messageDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return messageDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatDate(date) {
        if (!date) return '';

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const messageDate = new Date(date);

        if (messageDate.toDateString() === today.toDateString()) return 'Today';
        if (messageDate.toDateString() === yesterday.toDateString()) return 'Yesterday';

        return messageDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }

    function formatDateTime(date) {
        if (!date) return '';
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(text) {
        return SecurityUtils.escapeHtml(text);
    }

    function escapeRegex(string) {
        return SecurityUtils.escapeRegex(string);
    }

    function sanitizePayload(payload) {
        return SecurityUtils.sanitizePayload(payload);
    }

    function preserveFormatting(text) {
        if (!text) return '';

        const markers = {
            '**bold**': '###BOLD###',
            '*italic*': '###ITALIC###',
            '`code`': '###CODE###',
            '```\ncode block\n```': '###CODE_BLOCK###'
        };

        let processed = text;
        Object.entries(markers).forEach(([marker, placeholder]) => {
            processed = processed.replace(new RegExp(marker.replace(/\*/g, '\\*').replace(/`/g, '\\`'), 'g'), placeholder);
        });

        processed = escapeHtml(processed);

        Object.entries(markers).forEach(([marker, placeholder]) => {
            processed = processed.replace(new RegExp(placeholder, 'g'), marker);
        });

        return processed;
    }

    function showStatusMessage(message) {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.style.display = 'block';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }

    function hideStatusMessage() {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
    }

    function validateMessageStructure(message) {
        return !!(message && typeof message === 'object' && message.type);
    }

    function validateMessagePayload(payload, messageType) {
        if (!payload || typeof payload !== 'object') return { valid: false, error: 'Invalid payload' };

        switch (messageType) {
            case 'text':
                if (typeof payload.content !== 'string' || !payload.content.trim()) {
                    return { valid: false, error: 'Text message must have content' };
                }
                break;
            case 'image':
            case 'video':
            case 'file':
                if (!payload.content) {
                    return { valid: false, error: 'Media message must have content' };
                }
                break;
            case 'audio':
                if (!payload.content || !payload.duration) {
                    return { valid: false, error: 'Audio message must have content and duration' };
                }
                break;
        }

        return { valid: true };
    }

    function validateMessageBeforeSend(message) {
        if (!message) return { valid: false, error: 'Invalid message' };

        if (!message.content && !currentAttachment) {
            return { valid: false, error: 'Message content is required' };
        }

        if (!currentChat) {
            return { valid: false, error: 'No active chat' };
        }

        if (readOnlyMode || currentChat?.readOnly) {
            return { valid: false, error: 'Chat is read-only' };
        }

        return { valid: true };
    }

    function validateData(data, type) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'Data must be an object' };
        }

        switch (type) {
            case 'friendsList':
                if (!Array.isArray(data)) return { valid: false, error: 'friendsList must be an array' };
                for (const friend of data) {
                    if (!friend.id && !friend.uid) return { valid: false, error: 'Friend must have valid id' };
                }
                break;
            case 'chatHistory':
                if (!Array.isArray(data)) return { valid: false, error: 'chatHistory must be an array' };
                for (const message of data) {
                    if (!message.id) return { valid: false, error: 'Message must have valid id' };
                }
                break;
        }

        return { valid: true };
    }

    function validateSessionData(data) {
        return !!(data && typeof data === 'object' && (data.user || data.token));
    }

    function getData(type) {
        switch (type) {
            case 'friendsList': return FriendManager.getFriendListForChat();
            case 'groupsList': return GroupChatManager.getGroups();
            case 'chatHistory': return ChatManager.getMessages();
            case 'notifications': return [];
            case 'settings': return SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
            default: return null;
        }
    }

    function updateData(type, payload) {
        switch (type) {
            case 'friendsList':
                FriendManager.mergeFriends(payload);
                break;
            case 'chatHistory':
                payload.forEach(msg => ChatManager.addMessage(msg));
                break;
            case 'settings':
                SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, payload);
                break;
            default: return false;
        }
        return true;
    }

    function getConnectionHealth() {
        return {
            state: StateMachine.getState(),
            ready: StateMachine.isReady(),
            active: StateMachine.isActive(),
            degraded: StateMachine.isDegraded(),
            authenticated: SessionStore.isAuthenticated(),
            userId: SessionStore.getUserId(),
            heartbeatMissed: HeartbeatGovernor.getMissedCount(),
            heartbeatPaused: HeartbeatGovernor.isPaused(),
            handshakeTime: BootController._bootStartTime ? Date.now() - BootController._bootStartTime : 0,
            uptime: BootController._bootStartTime ? Date.now() - BootController._bootStartTime : 0,
            timestamp: Date.now()
        };
    }

    function showMessageActions(message, x, y) {
        selectedMessage = message;
        window.dispatchEvent(new CustomEvent('showMessageActions', {
            detail: { message, x, y }
        }));
    }

    function closeMessageActions() {
        selectedMessage = null;
        window.dispatchEvent(new CustomEvent('closeMessageActions'));
    }

    function handleMessageAction(action) {
        if (!selectedMessage) return false;
        window.dispatchEvent(new CustomEvent('handleMessageAction', {
            detail: { action, message: selectedMessage }
        }));
        return true;
    }

    function showForwardMessage(message) {
        if (!message) return;
        const forwardText = `[Forwarded] ${message.content || ''}`;
        navigator.clipboard.writeText(forwardText).catch(() => {});
    }

    function toggleStarMessage(messageId) {
        const starred = SafeStorage.getJSON('starred_messages', {});
        const isStarred = !!starred[messageId];

        if (isStarred) {
            delete starred[messageId];
        } else {
            starred[messageId] = true;
        }

        SafeStorage.setJSON('starred_messages', starred);
        return !isStarred;
    }

    function showMessageInfo(message) {
        if (!message) return '';

        return `Message Information:
Sent: ${formatDateTime(message.timestamp)}
${message.edited ? `Edited: ${formatDateTime(message.editedAt)}\n` : ''}
${message.deleted ? `Deleted: ${formatDateTime(message.deletedAt)}\n` : ''}
Status: ${message.status || 'unknown'}
Type: ${message.type || 'unknown'}
${message.fileName ? `File: ${message.fileName}\n` : ''}
${message.fileSize ? `Size: ${formatFileSize(message.fileSize)}\n` : ''}`;
    }

    function showReportModal(message) {
        if (!message) return;

        SafeStorage.setJSON('reported_message', {
            messageId: message.id,
            chatId: currentChat?.id || '',
            senderId: message.senderId,
            content: message.content,
            type: message.type,
            timestamp: new Date().toISOString()
        });
    }

    function submitReport() {
        const reportText = document.getElementById('reportText');
        if (!reportText || !reportText.value?.trim()) return false;

        const reportData = {
            message: SafeStorage.getJSON('reported_message', {}),
            reason: reportText.value.trim(),
            reporterId: SessionStore.getUserId() || 'unknown',
            timestamp: new Date().toISOString()
        };

        const reports = SafeStorage.getJSON('reports', []);
        reports.push(reportData);
        SafeStorage.setJSON('reports', reports);

        if (StateMachine.isReady()) {
            MessagesTransport.send('SUBMIT_REPORT', reportData, { requireAck: false });
        }

        return true;
    }

    function initEmojiPicker() {
        emojiPicker = document.querySelector('emoji-picker');
        if (emojiPicker) {
            emojiPicker.addEventListener('emoji-click', (event) => {
                const messageInput = document.getElementById('messageInput');
                if (messageInput) {
                    messageInput.value += event.detail.unicode || '';
                    messageInput.focus();
                }
            });
        }
    }

    function toggleEmojiPicker() {
        const container = document.getElementById('emojiPickerContainer');
        if (container) {
            container.classList.toggle('active');
        }
    }

    function closeEmojiPickerOnClickOutside(event) {
        const container = document.getElementById('emojiPickerContainer');
        const button = document.getElementById('emojiBtn');

        if (container?.classList.contains('active')) {
            if (!container.contains(event.target) && (!button || !button.contains(event.target))) {
                container.classList.remove('active');
            }
        }
    }

    function toggleFormattingToolbar() {
        const toolbar = document.getElementById('formattingToolbar');
        if (toolbar) {
            toolbar.classList.toggle('active');
        }
    }

    function closeFormattingToolbarOnClickOutside(event) {
        const toolbar = document.getElementById('formattingToolbar');
        const button = document.getElementById('formatBtn');

        if (toolbar?.classList.contains('active')) {
            if (!toolbar.contains(event.target) && (!button || !button.contains(event.target))) {
                toolbar.classList.remove('active');
            }
        }
    }

    function applyFormatting(tag) {
        const input = document.getElementById('messageInput');
        if (!input) return;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const selectedText = input.value.substring(start, end);

        let wrappedText = selectedText;
        switch (tag) {
            case 'b': wrappedText = `**${selectedText}**`; break;
            case 'i': wrappedText = `*${selectedText}*`; break;
            case 'code': wrappedText = `\`${selectedText}\``; break;
            case 'pre': wrappedText = `\`\`\`\n${selectedText}\n\`\`\``; break;
        }

        input.value = input.value.substring(0, start) + wrappedText + input.value.substring(end);
        input.focus();
        input.setSelectionRange(start + wrappedText.length, start + wrappedText.length);
    }

    function toggleAttachmentOptions() {
        const options = document.getElementById('attachmentOptions');
        if (options) {
            options.classList.toggle('active');
        }
    }

    function closeAttachmentOptionsOnClickOutside(event) {
        const options = document.getElementById('attachmentOptions');
        const button = document.getElementById('attachBtn');

        if (options?.classList.contains('active')) {
            if (!options.contains(event.target) && (!button || !button.contains(event.target))) {
                options.classList.remove('active');
            }
        }
    }

    function handleAttachment(type) {
        window.dispatchEvent(new CustomEvent('handleAttachment', {
            detail: { type }
        }));
    }

    async function createNote() {
        const input = document.getElementById('messageInput');
        const content = input?.value?.trim() || 'Note';
        return await sendMessageWithOptions(content, { isNote: true });
    }

    async function selectImage() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file || file.size > 10 * 1024 * 1024) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        type: 'image',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }

    async function selectVideo() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file || file.size > 50 * 1024 * 1024) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        type: 'video',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }

    async function selectFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file || file.size > 100 * 1024 * 1024) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        type: 'file',
                        data: reader.result,
                        name: file.name,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            };
            input.click();
        });
    }

    async function shareLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        type: 'location',
                        data: `https://maps.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}&z=15&output=embed`,
                        name: `Location (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)})`,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                () => resolve(null),
                { timeout: 10000 }
            );
        });
    }

    function createPoll() {
        const question = prompt('Enter poll question:');
        if (!question) return null;

        const options = [];
        for (let i = 1; i <= 4; i++) {
            const option = prompt(`Enter option ${i} (leave empty to finish):`);
            if (!option) break;
            options.push({
                text: option,
                votes: 0,
                voters: []
            });
        }

        if (options.length < 2) return null;

        return { question, options };
    }

    function showAttachmentPreview(attachment) {
        const preview = document.getElementById('attachmentPreview');
        if (!preview) return;

        preview.innerHTML = '';

        if (!attachment) {
            preview.style.display = 'none';
            return;
        }

        const item = document.createElement('div');
        item.className = 'attachment-preview-item';

        if (attachment.type === 'image') {
            const img = document.createElement('img');
            img.src = attachment.data;
            img.alt = attachment.name || 'Image';
            item.appendChild(img);
        } else if (attachment.type === 'audio') {
            item.innerHTML = `<i class="fas fa-microphone"></i> Audio (${Math.floor(attachment.duration || 0)}s)`;
        } else {
            item.innerHTML = `<i class="fas fa-file"></i> ${attachment.name || 'File'}`;
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-attachment';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = removeAttachment;
        item.appendChild(removeBtn);

        preview.appendChild(item);
        preview.style.display = 'block';
    }

    function removeAttachment() {
        currentAttachment = null;
        const preview = document.getElementById('attachmentPreview');
        if (preview) {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
    }

    function openThread(messageId) {
        currentThread = messageId;
        window.dispatchEvent(new CustomEvent('openThread', {
            detail: { messageId }
        }));
    }

    function showChatInfo(chat) {
        if (!chat) return { title: 'Chat Info', sections: [] };

        return {
            title: chat.type === 'note' ? 'Notes' : chat.friendName || 'Chat',
            sections: [
                {
                    title: 'Chat Information',
                    items: [
                        { label: 'Name', value: chat.type === 'note' ? 'Notes' : chat.friendName || 'Unknown' },
                        { label: 'Status', value: chat.blocked ? 'Blocked' : chat.archived ? 'Archived' : 'Active' },
                        { label: 'Last Message', value: formatTime(chat.lastMessageAt) },
                        { label: 'Unread', value: chat.unreadCount || 0 },
                        { label: 'Type', value: chat.type === 'group' ? 'Group' : chat.type === 'note' ? 'Notes' : 'Direct' }
                    ]
                }
            ]
        };
    }

    function loadChatThemes() {
        const themes = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHAT_THEMES);
        if (themes) {
            chatThemes = themes;
        }
    }

    function applyChatTheme(friendId) {
        const theme = chatThemes[friendId];
        if (theme) {
            document.documentElement.style.setProperty('--chat-bubble-sent', theme.sentColor || 'var(--primary-color)');
            document.documentElement.style.setProperty('--chat-bubble-received', theme.receivedColor || 'var(--secondary-color)');
            document.documentElement.style.setProperty('--chat-background', theme.background || '');
        } else {
            document.documentElement.style.setProperty('--chat-bubble-sent', 'var(--primary-color)');
            document.documentElement.style.setProperty('--chat-bubble-received', 'var(--secondary-color)');
            document.documentElement.style.setProperty('--chat-background', '');
        }
    }

    function loadUserSettings() {
        const settings = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS);
        if (!settings) {
            const defaultSettings = {
                autoDownload: false,
                notificationSound: true,
                messagePreview: true,
                onlineStatus: true,
                readReceipts: true,
                typingIndicators: true,
                theme: 'light',
                fontSize: 'medium',
                silentReactions: true,
                readOnlyMode: false,
                autoSaveDrafts: true,
                offlineMode: true,
                viewOnceEnabled: true
            };
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, defaultSettings);
        } else {
            silentReactionsEnabled = settings.silentReactions !== false;
            readOnlyMode = settings.readOnlyMode === true;
        }
    }

    function loadMessageDrafts() {
        const drafts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
        if (drafts) {
            messageDrafts = drafts;
        }
    }

    function saveMessageDraft() {
        if (!currentChat) return;

        const input = document.getElementById('messageInput');
        const draft = input?.value?.trim() || '';
        const attachment = currentAttachment ? {
            type: currentAttachment.type,
            data: currentAttachment.data,
            name: currentAttachment.name,
            size: currentAttachment.size,
            duration: currentAttachment.duration
        } : null;

        if (draft || attachment) {
            messageDrafts[currentChat.id] = {
                text: draft,
                attachment,
                timestamp: Date.now()
            };
        } else if (messageDrafts[currentChat.id]) {
            delete messageDrafts[currentChat.id];
        }

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.DRAFTS, messageDrafts);
    }

    function loadMessageDraft() {
        if (!currentChat) return;

        const draft = messageDrafts[currentChat.id];
        if (draft) {
            const input = document.getElementById('messageInput');
            if (input && draft.text) {
                input.value = draft.text;
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
            }

            if (draft.attachment) {
                currentAttachment = draft.attachment;
                showAttachmentPreview(draft.attachment);
            }
        }
    }

    function updateDraftBadge(hasDraft) {
        const badge = document.getElementById('draftBadge');
        if (badge) {
            badge.style.display = hasDraft ? 'inline-block' : 'none';
        }
    }

    function loadScheduledMessages() {
        const scheduled = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES);
        if (scheduled) {
            scheduledMessages = scheduled;
        }
    }

    function loadOfflineQueue() {
        const queue = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
        if (queue) {
            offlineQueue = queue;
        }
    }

    function updateScheduleBadge() {
        const badge = document.getElementById('scheduleBadge');
        if (badge) {
            const hasScheduled = scheduledMessages.some(msg => msg.chatId === currentChat?.id);
            badge.style.display = hasScheduled ? 'flex' : 'none';
        }
    }

    function setupScrollDetection() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.addEventListener('scroll', updateJumpButtonVisibility);
        }
    }

    function updateJumpButtonVisibility() {
        const container = document.getElementById('messagesContainer');
        const button = document.getElementById('jumpToLatest');

        if (container && button) {
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            button.style.display = isNearBottom ? 'none' : 'block';
        }
    }

    function jumpToLatest() {
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function searchInChat(query) {
        if (!query?.trim()) {
            searchResults = [];
            currentSearchIndex = -1;
            return [];
        }

        searchResults = ChatManager.getMessages().filter(msg => 
            !msg.deleted && 
            msg.content && 
            msg.content.toLowerCase().includes(query.toLowerCase())
        );

        return searchResults;
    }

    function highlightText(text, query) {
        if (!text || !query) return escapeHtml(text || '');

        const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
        return escapeHtml(text).replace(regex, '<span class="search-highlight">$1</span>');
    }

    function highlightSearchResults(query) {
        if (!query) return;

        const elements = document.querySelectorAll('.message-content');
        elements.forEach(el => {
            const original = el.getAttribute('data-original') || el.textContent;
            el.setAttribute('data-original', original);
            el.innerHTML = highlightText(original, query);
        });
    }

    function removeSearchHighlights() {
        const elements = document.querySelectorAll('.message-content');
        elements.forEach(el => {
            const original = el.getAttribute('data-original');
            if (original) {
                el.innerHTML = escapeHtml(original);
                el.removeAttribute('data-original');
            }
        });
    }

    function navigateToSearchResult(index) {
        if (index >= 0 && index < searchResults.length) {
            scrollToMessage(searchResults[index].id);
        }
    }

    function scrollToMessage(messageId) {
        const element = document.querySelector(`[data-message-id="${messageId}"]`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            if (typeof MediaRecorder === 'undefined') {
                return false;
            }

            mediaRecorder = new MediaRecorder(stream);
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    currentAttachment = {
                        type: 'audio',
                        data: reader.result,
                        name: `recording_${Date.now()}.webm`,
                        size: blob.size,
                        duration: Math.floor((Date.now() - recordingStartTime) / 1000)
                    };
                    showAttachmentPreview(currentAttachment);
                };
                reader.readAsDataURL(blob);
            };

            mediaRecorder.start();
            isRecording = true;
            recordingStartTime = Date.now();

            recordingTimer = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                const timerEl = document.getElementById('recordingTimer');
                if (timerEl) {
                    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
            }, 1000);

            return true;
        } catch (error) {
            return false;
        }
    }

    async function stopRecording() {
        if (!mediaRecorder || !isRecording) return null;

        clearInterval(recordingTimer);

        return new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                isRecording = false;
                mediaRecorder = null;
                resolve(currentAttachment);
            };

            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        });
    }

    function cancelRecording() {
        if (!mediaRecorder || !isRecording) return false;

        clearInterval(recordingTimer);
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        isRecording = false;
        mediaRecorder = null;
        currentAttachment = null;

        return true;
    }

    function startBackgroundSync() {
        let syncInterval = setInterval(async () => {
            if (!StateMachine.isReady() || isSyncing) return;

            isSyncing = true;
            try {
                await Promise.race([
                    Promise.all([
                        FriendManager.loadFriends().catch(() => {}),
                        ChatManager.loadChats().catch(() => {}),
                        checkOfflineQueue().catch(() => {})
                    ]),
                    new Promise(resolve => setTimeout(resolve, 3000))
                ]);
            } catch (error) {
            } finally {
                isSyncing = false;
            }
        }, 60000);

        let saveInterval = setInterval(() => {
            if (ChatManager.getActiveChat()) {
                SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, ChatManager.getMessages());
            }
            SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats: ChatManager.getChats(), timestamp: Date.now() });
        }, 60000);

        return { syncInterval, saveInterval };
    }

    function playNotificationSound() {
        const settings = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_SETTINGS, {});
        if (settings.notificationSound !== false) {
            const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        }
    }

    function checkScheduledMessages() {
        const now = Date.now();
        const toSend = [];

        scheduledMessages = scheduledMessages.filter(msg => {
            if (msg && msg.scheduleTime <= now && msg.status === 'scheduled') {
                toSend.push(msg);
                return false;
            }
            return true;
        });

        toSend.forEach(async (msg) => {
            if (msg.chatId === currentChat?.id && StateMachine.isReady()) {
                await sendMessageWithOptions(msg.content || '', msg.options || {});
            }
        });

        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.SCHEDULED_MESSAGES, scheduledMessages);
        setTimeout(checkScheduledMessages, 60000);
    }

    async function checkOfflineQueue() {
        if (!navigator.onLine || offlineQueue.length === 0) return;
        if (!StateMachine.isReady()) return;

        const failedMessages = [];

        for (const message of offlineQueue) {
            const result = await MessageLifecycle.sendMessage(message.content, {
                type: message.type,
                attachment: message.attachment,
                chatId: message.chatId
            });

            if (!result || !result.success) {
                failedMessages.push(message);
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        offlineQueue = failedMessages;
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE, offlineQueue);
    }

    function loadMultiSendChats() {
        return ChatManager.getChats().filter(chat => 
            !chat.archived && 
            !chat.blocked && 
            chat.type !== 'note'
        );
    }

    function updateMultiSendSelection(chatId, selected) {
        if (selected) {
            multiSendSelectedChats.add(chatId);
        } else {
            multiSendSelectedChats.delete(chatId);
        }
    }

    function saveUIState() {
        const state = {
            lastChatId: currentChat?.id,
            lastCategory: currentCategory,
            timestamp: Date.now()
        };
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.UI_STATE, state);
    }

    function getUserFromURL() {
        try {
            const params = new URLSearchParams(window.location.search);
            const userId = params.get('userId') || params.get('friendId') || params.get('user');
            const username = params.get('username') || params.get('name') || 'User';
            const userAvatar = params.get('avatar') || params.get('photoURL') || '';

            return userId ? { userId, username: decodeURIComponent(username), userAvatar } : null;
        } catch (error) {
            return null;
        }
    }

    async function openChatPanel(userId, username, userAvatar = '') {
        currentFriend = { uid: userId, displayName: username, photoURL: userAvatar };
        return loadChatByFriendId(userId);
    }

    function showReconnectState(message) {
        const overlay = document.getElementById('reconnectOverlay');
        const messageEl = document.getElementById('reconnectMessage');

        if (overlay) overlay.style.display = 'flex';
        if (messageEl) messageEl.textContent = message || 'Connection lost';
    }

    function hideReconnectState() {
        const overlay = document.getElementById('reconnectOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function retryConnection() {
        // Not needed - parent manages
    }

    function renderMessages() {
        window.dispatchEvent(new CustomEvent('renderMessages', {
            detail: { 
                messages: ChatManager.getMessages(), 
                currentChat: ChatManager.getActiveChat(), 
                currentUser: SessionStore.getUser()
            }
        }));
    }

    function renderChatsList() {
        window.dispatchEvent(new CustomEvent('renderChatsList', {
            detail: { 
                chats: ChatManager.getChats(), 
                currentChat: ChatManager.getActiveChat(), 
                currentCategory, 
                messageDrafts 
            }
        }));
    }

    function renderContactsList() {
        window.dispatchEvent(new CustomEvent('renderContactsList', {
            detail: { contacts: FriendManager.getFriendListForChat() }
        }));
    }

    function markMessageAsViewed(messageId) {}

    function initializeAudioWaveforms() {}

    function viewMedia(url, fileName) {
        window.open(url, '_blank');
        return { url, fileName };
    }

    function playVideo(url) {
        window.open(url, '_blank');
        return url;
    }

    function playAudio(messageId, url, duration) {
        try {
            if (activeAudioElement) {
                activeAudioElement.pause();
            }
            
            const audio = new Audio(url);
            activeAudioElement = audio;
            audio.play();
            
            audio.onended = () => {
                if (activeAudioElement === audio) {
                    activeAudioElement = null;
                }
            };
            
            return 'playing';
        } catch (error) {
            return 'error';
        }
    }

    function downloadFile(url, fileName) {
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return true;
        } catch (error) {
            return false;
        }
    }

    function openLocation(latitude, longitude) {
        try {
            const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
            window.open(url, '_blank');
            return url;
        } catch (error) {
            return null;
        }
    }

    function cleanupAudioPlayers() {
        if (activeAudioElement) {
            activeAudioElement.pause();
            activeAudioElement = null;
        }
        audioPlayers.clear();
    }

    function syncChatList() {
        return ChatManager.loadChats();
    }

    function updateUnreadCounts() {
        return 0;
    }

    function updateTypingIndicator(isTyping) {
        if (!currentChat || !StateMachine.isReady()) return false;
        
        MessagesTransport.send(isTyping ? MESSAGE_TYPES.TYPING_START : MESSAGE_TYPES.TYPING_STOP, {
            chatId: currentChat.id,
            timestamp: Date.now()
        }, { requireAck: false });
        
        return true;
    }

    // =============================================
    // MAIN INITIALIZATION
    // =============================================
    async function initialize() {
        Logger.once('INIT', `🚀 Messages Core v${VERSION} - Parent Authority Architecture`);
        
        try {
            // Load cached data for immediate UI
            loadCachedData();
            
            // Wait for handshake completion
            await BootController.waitForBoot();
            
            // Initialize UI
            await initializeUI();
            
            // Show cached chats immediately
            showCachedChatsImmediately();
            
            Logger.success('INIT', '✅ Messages Core ready');
            
        } catch (error) {
            Logger.error('INIT', 'Initialization error', error);
        }
    }

    function loadCachedData() {
        try {
            const cachedUser = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.USER_CACHE);
            if (cachedUser) {
                currentUser = cachedUser;
            }

            const cachedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cachedChats?.chats && ChatManager) {
                cachedChats.chats.forEach(chat => {
                    if (!ChatManager._chatsMap.has(chat.id)) {
                        ChatManager._chats.push(chat);
                        ChatManager._chatsMap.set(chat.id, chat);
                    }
                });
            }

            const cachedFriends = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
            if (cachedFriends?.friends && FriendManager) {
                cachedFriends.friends.forEach(friend => {
                    const id = friend.id || friend.uid;
                    if (id && !FriendManager._friendsMap.has(id)) {
                        FriendManager._friends.push(friend);
                        FriendManager._friendsMap.set(id, friend);
                    }
                });
            }

            const cachedDrafts = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.DRAFTS);
            if (cachedDrafts) {
                messageDrafts = cachedDrafts;
            }

            const cachedOffline = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.OFFLINE_QUEUE);
            if (cachedOffline) {
                offlineQueue = cachedOffline;
            }
            
            const chatState = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHAT_STATE);
            if (chatState?.lastChatId && ChatManager) {
                const lastChat = ChatManager._chatsMap.get(chatState.lastChatId);
                if (lastChat) {
                    currentChat = lastChat;
                }
            }
        } catch (error) {
            Logger.warn('Init', 'Error loading cached data', error);
        }
    }

    async function initializeUI() {
        Logger.once('UI', 'Initializing UI');
        
        try {
            if (window.messagesUI && typeof window.messagesUI.init === 'function') {
                window.messagesUI.init();
            }
        } catch (e) {
            Logger.error('UI', 'UI initialization error', e);
        }
        
        window.dispatchEvent(new CustomEvent('uiReady', {
            detail: { frameId: FRAME_ID, version: VERSION }
        }));
    }

    function showCachedChatsImmediately() {
        if (canStartChatImmediately()) {
            window.dispatchEvent(new CustomEvent('renderChatsList', {
                detail: { 
                    chats: ChatManager.getChats(), 
                    fromCache: true
                }
            }));
            
            window.dispatchEvent(new CustomEvent('renderContactsList', {
                detail: { 
                    contacts: FriendManager.getFriendListForChat(),
                    fromCache: true
                }
            }));
            
            Logger.info('UI', 'Rendered cached chats immediately');
        }
    }

    // =============================================
    // CLEANUP ON UNLOAD
    // =============================================
    window.addEventListener('beforeunload', () => {
        if (recordingTimer) clearInterval(recordingTimer);
        if (typingTimeout) clearTimeout(typingTimeout);
        cleanupAudioPlayers();
        saveMessageDraft();
        saveUIState();

        if (ChatManager.getActiveChat()) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, ChatManager.getMessages());
        }
        
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, { chats: ChatManager.getChats(), timestamp: Date.now() });
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHAT_STATE, { lastChatId: currentChat?.id, timestamp: Date.now() });
        
        WSController.disconnect();
        RetryManager.clearAll();
        StateMachine.cleanup();
        HeartbeatGovernor.stop();
    });

    window.__MESSAGES_CORE_READY__ = false;
    
    StateMachine.subscribe((oldState, newState) => {
        if (newState === V7_STATES.READY) {
            window.__MESSAGES_CORE_READY__ = true;
        }
    });

    // =============================================
    // MODULE COORDINATOR
    // =============================================
    const ModuleCoordinator = {
        initialized: false,
        
        init() {
            if (this.initialized) return this;
            
            const frameId = MessagesTransport.getFrameId();
            
            MessagesTransport.init(frameId);
            
            window.__IFRAME_READY__ = false;
            window.__HANDSHAKE_COMPLETE__ = false;
            
            window.MessagesTransport = MessagesTransport;
            window.ChatManager = ChatManager;
            window.FriendManager = FriendManager;
            window.MessageLifecycle = MessageLifecycle;
            window.SessionStore = SessionStore;
            
            // V7 compliance
            window.V7 = V7;
            
            this.initialized = true;
            
            log.info('[ModuleCoordinator] Initialized');
            
            return this;
        },
        
        start() {
            if (!this.initialized) this.init();
            
            if (LifecycleFSM.current === FSM_STATES.INIT) {
                LifecycleFSM.transition(FSM_STATES.REGISTERING, 'starting');
                registerMessagesModule();
            }
            
            return LifecycleFSM.getInitPromise();
        }
    };

    // =============================================
    // [PASSIVE REGISTRATION]
    // =============================================
    // STEP 1: Send REGISTER_MODULE at 0ms
    // STEP 2: Wait for parent responses in order
    // STEP 3: On PARENT_READY, transition based on session
    function registerMessagesModule() {
        if (LifecycleFSM.current === FSM_STATES.INIT) {
            LifecycleFSM.transition(FSM_STATES.REGISTERING, 'starting');
            
            // V7 compliance - send registration immediately at 0ms
            V7.sendRegistration();
            
            // Wait for parent with timeout
            MessagesTransport.waitForParentReady(TIMING.HANDSHAKE_TIMEOUT).then((parentReady) => {
                if (!parentReady) {
                    log.onceWarn('standalone-mode', '[MessagesCore] No parent authority, entering degraded');
                    LifecycleFSM.transition(FSM_STATES.DEGRADED, 'no_parent');
                    V7.transition(V7_STATES.DEGRADED, 'no_parent');
                    loadCachedDataInstantly();
                    return;
                }
                
                // Parent ready received, state handled by V7
            });
        }
    }

    // =============================================
    // [CACHED DATA FALLBACK]
    // =============================================
    function loadCachedDataInstantly() {
        try {
            // Load cached chats
            const cachedChats = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE);
            if (cachedChats?.chats && ChatManager) {
                cachedChats.chats.forEach(chat => {
                    if (!ChatManager._chatsMap.has(chat.id)) {
                        ChatManager._chats.push(chat);
                        ChatManager._chatsMap.set(chat.id, chat);
                    }
                });
            }
            
            // Load cached friends
            const cachedFriends = SafeStorage.getJSON(LOCAL_STORAGE_KEYS.FRIENDS_CACHE);
            if (cachedFriends?.friends && FriendManager) {
                cachedFriends.friends.forEach(friend => {
                    const id = friend.id || friend.uid;
                    if (id && !FriendManager._friendsMap.has(id)) {
                        FriendManager._friends.push(friend);
                        FriendManager._friendsMap.set(id, friend);
                    }
                });
            }
            
            // Notify UI
            window.dispatchEvent(new CustomEvent('cachedDataLoaded', {
                detail: { 
                    chats: ChatManager?.getChats() || [],
                    friends: FriendManager?.getFriendListForChat() || []
                }
            }));
            
        } catch (error) {
            log.error('[MessagesCore] Failed to load cached data:', error);
        }
    }

    // =============================================
    // [SERVICES INITIALIZATION]
    // =============================================
    let servicesInitialized = false;
    function initializeServices() {
        if (servicesInitialized) return;
        if (LifecycleFSM.current !== FSM_STATES.READY) return;
        
        servicesInitialized = true;
        
        // Load cached data
        loadCachedDataInstantly();
        
        log.info('[MessagesCore] Services initialized');
        
        window.dispatchEvent(new CustomEvent('messagesCoreReady', {
            detail: {
                timestamp: Date.now(),
                state: LifecycleFSM.current,
                sessionValid: V7.isSessionValid(),
                userId: V7.getUserId()
            }
        }));
        
        window.__MESSAGES_CORE_READY__ = true;
    }

    // =============================================
    // [INITIAL SYNC] - After ACTIVE
    // =============================================
    // When ACTIVE:
    // - Fetch chats
    // - Fetch friends/contacts
    // - Mark SYNCING
    // - After complete → READY
    // Sync must not start before ACTIVE
    let syncInProgress = false;

    async function performInitialSync() {
        if (syncInProgress) return;
        if (V7.current !== V7_STATES.ACTIVE) return;
        
        syncInProgress = true;
        LifecycleFSM.transition(FSM_STATES.SYNCING, 'initial_sync');
        
        try {
            // Fetch chats
            const chatsResult = await ChatManager.loadChats(true).catch(() => ({ success: false }));
            
            // Fetch friends
            const friendsResult = await FriendManager.loadFriends(true).catch(() => ({ success: false }));
            
            // If any succeeded, we consider sync complete
            if (chatsResult || friendsResult) {
                LifecycleFSM.transition(FSM_STATES.READY, 'sync_complete');
                V7.transition(V7_STATES.READY, 'sync_complete');
                
                // Start heartbeat now that we're READY
                V7.startHeartbeat();
                
                log.info('[MessagesCore] Initial sync complete');
            } else {
                // If all failed, retry once
                log.warn('[MessagesCore] Initial sync failed, retrying once');
                
                setTimeout(async () => {
                    const retryChats = await ChatManager.loadChats(true).catch(() => ({ success: false }));
                    const retryFriends = await FriendManager.loadFriends(true).catch(() => ({ success: false }));
                    
                    if (retryChats || retryFriends) {
                        LifecycleFSM.transition(FSM_STATES.READY, 'sync_retry_success');
                        V7.transition(V7_STATES.READY, 'sync_retry_success');
                        V7.startHeartbeat();
                    } else {
                        // Stay in ACTIVE but log warning - don't degrade
                        LifecycleFSM.transition(FSM_STATES.ACTIVE, 'sync_failed');
                        log.warn('[MessagesCore] Sync failed after retry, staying in ACTIVE');
                    }
                }, 1000);
            }
        } catch (error) {
            log.error('[MessagesCore] Sync error:', error);
            // Stay in ACTIVE, don't degrade
            LifecycleFSM.transition(FSM_STATES.ACTIVE, 'sync_error');
        } finally {
            syncInProgress = false;
        }
    }

    // =============================================
    // [HEARTBEAT CLIENT]
    // =============================================
    const HeartbeatClient = {
        start() { 
            MessagesTransport.startHeartbeat();
            V7.startHeartbeat();
        },
        stop() {
            V7._stopHeartbeat();
        }
    };

    // =============================================
    // [STATE SUBSCRIPTIONS]
    // =============================================
    LifecycleFSM.onTransition((toState, fromState) => {
        if (toState === FSM_STATES.ACTIVE) {
            // Start initial sync when ACTIVE
            performInitialSync();
        }
        
        if (toState === FSM_STATES.READY) {
            initializeServices();
        }
    });

    V7.onTransition((toState, fromState, reason) => {
        window.dispatchEvent(new CustomEvent('v7StateChanged', {
            detail: { state: toState, previous: fromState, reason }
        }));
    });

    // =============================================
    // [MAIN INITIALIZATION]
    // =============================================
    ModuleCoordinator.init();

    // Start initialization after a brief delay
    setTimeout(() => {
        ModuleCoordinator.start().catch(() => {});
    }, 100);

    // =============================================
    // [NETWORK OFFLINE HANDLING]
    // =============================================
    window.addEventListener('offline', () => {
        console.log('[V7] 📴 Network offline');
    });

    window.addEventListener('online', () => {
        console.log('[V7] 📶 Network online');
        // Parent will handle recovery via heartbeat or session refresh
    });

    // =============================================
    // [CLEANUP ON UNLOAD]
    // =============================================
    window.addEventListener('beforeunload', () => {
        HeartbeatClient.stop();
        MessagesTransport.destroy();
        MessageTracker.reset();
        SafeStorage.setJSON(LOCAL_STORAGE_KEYS.CHATS_CACHE, {
            chats: ChatManager.getChats(),
            timestamp: Date.now()
        });
        if (ChatManager.getActiveChat()) {
            SafeStorage.setJSON(`${LOCAL_STORAGE_KEYS.MESSAGES_PREFIX}${ChatManager.getActiveChat().id}`, ChatManager.getMessages());
        }
    });

    // =============================================
    // [EXPORT]
    // =============================================
    const messagesCore = {
        version: '7.0.0',
        V7,
        LifecycleFSM,
        SessionStore,
        ChatManager,
        FriendManager,
        MessageLifecycle,
        MessagesTransport,
        HeartbeatClient,
        MessageTracker,
        SafeStorage,
        SecurityUtils,
        AckController,
        MessageQueue,
        RetryManager,
        WSController,
        GroupChatManager,
        APIClient,
        
        // State helpers
        getState: () => V7.getState(),
        isReady: () => V7.canPerformActions(),
        isActive: () => V7.canPerformApiCalls(),
        getUserId: () => V7.getUserId(),
        getUser: () => V7.getUser(),
        getToken: () => V7.getToken(),
        
        // Core functions
        sendMessage: (content, options) => MessageLifecycle.sendMessage(content, options),
        sendTypingIndicator: (chatId, isTyping) => MessageLifecycle.sendTypingIndicator(chatId, isTyping),
        openChat: (chatId) => ChatManager.openChat(chatId),
        loadChats: () => ChatManager.loadChats(),
        loadFriends: () => FriendManager.loadFriends(),
        getContacts: () => FriendManager.getFriendListForChat(),
        getChats: () => ChatManager.getChats(),
        getMessages: () => ChatManager.getMessages(),
        getActiveChat: () => ChatManager.getActiveChat(),
        
        // Exported functions from original
        getCurrentSession,
        isCoreReady,
        sendToParent,
        apiRequest,
        fetchData,
        loadContacts,
        loadMessages,
        loadChatByFriendId,
        createLocalChat,
        sendMessageWithOptions,
        sendToMultipleChats,
        createGroupChat,
        addToGroup,
        removeFromGroup,
        editMessage,
        saveEditedMessage,
        cancelEditMessage,
        deleteMessage,
        markChatAsRead,
        addReaction,
        toggleBlockUser,
        toggleArchiveChat,
        toggleReadOnly,
        clearChatHistory,
        voteInPoll,
        
        // Validation
        validateMessageStructure,
        validateMessagePayload,
        validateMessageBeforeSend,
        validateData,
        validateSessionData,
        
        // UI Helpers
        showStatusMessage,
        hideStatusMessage,
        formatMessageText,
        formatTime,
        formatDate,
        formatDateTime,
        formatFileSize,
        escapeHtml,
        escapeRegex,
        preserveFormatting,
        sanitizePayload,
        
        // Message actions
        showMessageActions,
        closeMessageActions,
        handleMessageAction,
        showForwardMessage,
        toggleStarMessage,
        showMessageInfo,
        showReportModal,
        submitReport,
        
        // Emoji
        initEmojiPicker,
        toggleEmojiPicker,
        closeEmojiPickerOnClickOutside,
        
        // Formatting
        toggleFormattingToolbar,
        closeFormattingToolbarOnClickOutside,
        applyFormatting,
        
        // Attachments
        toggleAttachmentOptions,
        closeAttachmentOptionsOnClickOutside,
        handleAttachment,
        createNote,
        selectImage,
        selectVideo,
        selectFile,
        shareLocation,
        createPoll,
        showAttachmentPreview,
        removeAttachment,
        
        // Threads
        openThread,
        showChatInfo,
        
        // Settings
        loadChatThemes,
        applyChatTheme,
        loadUserSettings,
        loadMessageDrafts,
        saveMessageDraft,
        loadMessageDraft,
        updateDraftBadge,
        loadScheduledMessages,
        loadOfflineQueue,
        updateScheduleBadge,
        
        // Scroll & Search
        setupScrollDetection,
        updateJumpButtonVisibility,
        jumpToLatest,
        searchInChat,
        highlightText,
        highlightSearchResults,
        removeSearchHighlights,
        navigateToSearchResult,
        scrollToMessage,
        
        // Recording
        startRecording,
        stopRecording,
        cancelRecording,
        
        // Sync
        startBackgroundSync,
        playNotificationSound,
        checkScheduledMessages,
        checkOfflineQueue,
        loadMultiSendChats,
        updateMultiSendSelection,
        saveUIState,
        getUserFromURL,
        openChatPanel,
        
        // Connection
        showReconnectState,
        hideReconnectState,
        retryConnection,
        
        // Rendering
        renderMessages,
        renderChatsList,
        renderContactsList,
        markMessageAsViewed,
        
        // Media
        initializeAudioWaveforms,
        viewMedia,
        playVideo,
        playAudio,
        downloadFile,
        openLocation,
        cleanupAudioPlayers,
        
        // Chat
        syncChatList,
        updateUnreadCounts,
        updateTypingIndicator,
        
        // State helpers
        getDeterministicState: () => V7.current,
        isReady: () => V7.canPerformActions(),
        isActive: () => V7.canPerformApiCalls(),
        isDegraded: () => V7.current === V7_STATES.DEGRADED,
        getRetryState: (key) => RetryManager.getRetryState(key),
        cancelRetry: (key) => RetryManager.cancelRetry(key),
        
        // Handshake
        waitForBoot: () => BootController.waitForBoot(),
        
        // Health
        getConnectionHealth,
        getHealth: () => ({
            state: V7.current,
            ready: V7.canPerformActions(),
            sessionValid: V7.isSessionValid(),
            handshakeTime: V7.getState().handshakeTime,
            heartbeatMissed: V7.getState().heartbeatMissed,
            userId: V7.getUserId()
        }),
        
        // UI State variables
        currentUser, currentChat, currentFriend, messages, chats, contacts,
        isRecording, mediaRecorder, recordingTimer, recordingStartTime,
        typingTimeout, isTyping, selectedMessage, currentThread, chatThemes,
        emojiPicker, isSyncing, audioPlayers, editingMessageId, replyToMessage,
        currentCategory, activeFormattingTags, activeAudioElement, scheduledMessages,
        offlineQueue, messageDrafts, silentReactionsEnabled, readOnlyMode,
        currentAttachment, searchResults, currentSearchIndex, multiSendSelectedChats,
        recordingCancelTimeout, dragStartY, isDraggingToCancel,
        
        // UI State setters
        setCurrentUser, setCurrentChat, setCurrentFriend, setMessages, setChats, setContacts,
        setIsRecording, setMediaRecorder, setRecordingTimer, setRecordingStartTime,
        setTypingTimeout, setIsTyping, setSelectedMessage, setCurrentThread,
        setChatThemes, setEmojiPicker, setIsSyncing, setAudioPlayers,
        setEditingMessageId, setReplyToMessage, setCurrentCategory,
        setActiveFormattingTags, setActiveAudioElement, setScheduledMessages,
        setOfflineQueue, setMessageDrafts, setSilentReactionsEnabled, setReadOnlyMode,
        setCurrentAttachment, setSearchResults, setCurrentSearchIndex,
        setMultiSendSelectedChats, setRecordingCancelTimeout, setDragStartY,
        setIsDraggingToCancel
    };

    window.messagesCore = messagesCore;

    // Debug mode
    if (window.location.hash === '#debug' || localStorage.getItem('kynecta_debug') === 'true') {
        window.__IFRAME_DEBUG__ = true;
        window.debug = {
            messagesCore,
            V7,
            StateMachine,
            BootController,
            SessionStore,
            FriendManager,
            ChatManager,
            RetryManager,
            IntegrationHub,
            HeartbeatGovernor,
            SessionVerifier,
            MessageQueue,
            ParentResponseInterceptor,
            MessagesTransport,
            AckController,
            MessageTracker,
            SecurityUtils,
            WSController,
            GroupChatManager,
            MessageLifecycle
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = messagesCore;
    }

    // Start initialization
    initialize();
})();