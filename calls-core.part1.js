/**
 * PART 1/3 — BOOTSTRAP & CORE STATE
 * Module guard, lifecycle, session validation, core state
 */
/**
 * PART 1/8 — BOOTSTRAP & SESSION
 * Module guard/registration, session validation (__isValidSession), sandbox StorageProxy, sandbox SessionClient. Establishes the module's identity and secure session handling before anything else runs.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
// calls-core.js



// ==================== CALL IFRAME CORE MODULE - DETERMINISTIC LIFECYCLE ====================



// Version: 9.1.0 - CRITICAL FIXES: Stale call state recovery, illegal state transitions, auto-cleanup



// ============================================================================================







(function() {



    'use strict';







    const MODULE_NAME = 'calls';  // EXACT module name per contract



    if (window.registerModuleInit && !window.registerModuleInit('calls-core')) {



        console.warn('[calls] calls-core already initialized, skipping duplicate boot');



        return;



    }



    



    // ==================== SESSION VALIDATION GUARD (CRITICAL PATCH) ====================



function __isValidSession(session) {



    if (!session) return false;



    



    if (!session.token || typeof session.token !== 'string' || session.token.length < 10) {



        return false;



    }



    



    let userId = session.userId;



    if (!userId && session.user) {



        userId = session.user.id || session.user.userId;



    }



    if (!userId && session.userData) {



        userId = session.userData.id || session.userData.userId;



    }



    



    if (userId === undefined || userId === null) {



        return false;



    }



    



    if (typeof userId === 'string') {



        const trimmedUserId = userId.trim();



        if (trimmedUserId === '' || trimmedUserId === 'user' || trimmedUserId === 'default' || 



            trimmedUserId === 'null' || trimmedUserId === 'undefined') {



            return false;



        }



    }



    



    if (typeof userId === 'number' && userId === 0) {



        return false;



    }



    



    if (session.authenticated !== true) {



        return false;



    }



    



    if (session.expiresAt && session.expiresAt < Date.now()) {



        return false;



    }



    



    return true;



}







    // ==================== SANDBOX-COMPLIANT STORAGE PROXY ====================



    // CRITICAL: No direct localStorage/sessionStorage access in sandboxed iframe



    // NOTE: Storage is ONLY for non-critical UI preferences, NEVER for call state



    const StorageProxy = {



        _pendingRequests: new Map(),



        _requestId: 0,



        



        _generateRequestId() {



            return `storage_${++this._requestId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;



        },



        



        get(key, defaultValue = null) {



            return new Promise((resolve) => {



                const requestId = this._generateRequestId();



                



                const timeout = setTimeout(() => {



                    if (this._pendingRequests.has(requestId)) {



                        this._pendingRequests.delete(requestId);



                        resolve(defaultValue);



                        // Only warn once per key to avoid repeated noise on page load
                        const _warnKey = '_storageTimeoutWarn_' + key;
                        if (!window[_warnKey]) { window[_warnKey] = true; console.warn('[' + MODULE_NAME + '][StorageProxy] GET timeout for key: ' + key + ' (once only)'); }



                    }



                // FIX (Issue 6): Increased timeout to handle slow parent init
                }, 8000);



                



                this._pendingRequests.set(requestId, { resolve, timeout, key });



                



                try {



                    window.parent.postMessage({



                        type: 'STORAGE_GET',



                        key: key,



                        requestId: requestId,



                        module: MODULE_NAME,



                        timestamp: Date.now()



                    }, '*');



                } catch (error) {



                    clearTimeout(timeout);



                    this._pendingRequests.delete(requestId);



                    console.error(`[${MODULE_NAME}][StorageProxy] Failed to send storage get request`, error);



                    resolve(defaultValue);



                }



            });



        },



        



        set(key, value) {



            try {



                window.parent.postMessage({



                    type: 'STORAGE_SET',



                    key: key,



                    value: value,



                    module: MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                return true;



            } catch (error) {



                console.error(`[${MODULE_NAME}][StorageProxy] Failed to send storage set request`, error);



                return false;



            }



        },



        



        remove(key) {



            try {



                window.parent.postMessage({



                    type: 'STORAGE_REMOVE',



                    key: key,



                    module: MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                return true;



            } catch (error) {



                console.error(`[${MODULE_NAME}][StorageProxy] Failed to send storage remove request`, error);



                return false;



            }



        },



        



        clear() {



            try {



                window.parent.postMessage({



                    type: 'STORAGE_CLEAR',



                    module: MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                return true;



            } catch (error) {



                console.error(`[${MODULE_NAME}][StorageProxy] Failed to send storage clear request`, error);



                return false;



            }



        },



        



        handleStorageResponse(event) {



            if (!event.data || event.data.type !== 'STORAGE_RESULT') return false;



            



            const { requestId, key, value, error } = event.data;



            const pending = this._pendingRequests.get(requestId);



            



            if (pending) {



                clearTimeout(pending.timeout);



                this._pendingRequests.delete(requestId);



                



                if (error) {



                    console.warn(`[${MODULE_NAME}][StorageProxy] Storage error for key ${key}:`, error);



                    pending.resolve(null);



                } else {



                    pending.resolve(value);



                }



                return true;



            }



            



            return false;



        },



        



        cleanup() {



            for (const [requestId, pending] of this._pendingRequests) {



                clearTimeout(pending.timeout);



                this._pendingRequests.delete(requestId);



            }



        }



    };



    



    // ==================== SANDBOX-COMPLIANT SESSION CLIENT ====================



    // CRITICAL: No direct token access, always request from parent



    const SessionClient = {



        _session: null,



        _token: null,



        _userId: null,



        _isAuthenticated: false,



        _pendingRequests: new Map(),



        _requestId: 0,



        _listeners: new Set(),



        _lastSessionId: null,



        _validSessionSet: false,  // Track if we already have a valid session



        



        _generateRequestId() {



            return `session_${++this._requestId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;



        },



        



        requestSession() {



            try {



                window.parent.postMessage({



                    type: 'REQUEST_SESSION',



                    module: MODULE_NAME,



                    timestamp: Date.now()



                }, '*');



                console.log(`[${MODULE_NAME}][SessionClient] Session requested from parent`);



            } catch (error) {



                console.error(`[${MODULE_NAME}][SessionClient] Failed to request session`, error);



            }



        },



        



        getSession() {



            return this._session ? { ...this._session } : null;



        },



        



        getToken() {



            return this._token;



        },



        



        getUserId() {



            return this._userId;



        },



        



        isAuthenticated() {



            return this._isAuthenticated && !!this._token && this._validSessionSet;



        },



        



        handleSessionMessage(event) {



            if (!event.data) return false;



            



            const message = event.data;



            



            // CRITICAL: Session deduplication using sessionId



            const sessionId = message.sessionId || message.payload?.sessionId || message.data?.sessionId;



            if (sessionId && this._lastSessionId === sessionId) {



                console.log(`[${MODULE_NAME}][SessionClient] Duplicate session message ignored (sessionId: ${sessionId})`);



                return true;



            }



            



            // Handle different session message types



            if (message.type === 'SESSION_DATA' || message.type === 'SESSION_ACTIVE') {



                const sessionData = message.payload || message.data || message;



                



                // ==================== CRITICAL: SESSION VALIDATION ====================



                // Extract and validate session data



                const candidateSession = {



                    token: sessionData.token || sessionData.jwt || sessionData.accessToken,



                    userId: sessionData.userId || sessionData.user?.id,



                    user: sessionData.user || {},



                    expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),



                    authenticated: sessionData.authenticated !== false,



                    sessionId: sessionId || Date.now()



                };



                



                // REJECT INVALID SESSION IMMEDIATELY



                if (!__isValidSession(candidateSession)) {



                    console.warn(`[${MODULE_NAME}][SessionClient] Rejected invalid session data`, {



                        hasToken: !!candidateSession.token,



                        userId: candidateSession.userId,



                        authenticated: candidateSession.authenticated



                    });



                    return true;



                }



                



                // IMMUTABLE SESSION PROTECTION: Prevent overwriting valid session with invalid data



                if (this._validSessionSet && this._session && __isValidSession(this._session)) {



                    if (!__isValidSession(candidateSession)) {



                        console.warn(`[${MODULE_NAME}][SessionClient] Prevented session downgrade - keeping existing valid session`);



                        return true;



                    }



                }



                



                // Safe update



                this._session = candidateSession;



                this._token = this._session.token;



                this._userId = this._session.userId;



                this._isAuthenticated = this._session.authenticated && !!this._token;



                this._validSessionSet = true;



                



                if (sessionId) {



                    this._lastSessionId = sessionId;



                }



                



                this._notifyListeners('session_updated', this._session);



                



                console.log(`[${MODULE_NAME}][SessionClient] Valid session received:`, {



                    authenticated: this._isAuthenticated,



                    userId: this._userId,



                    sessionId: this._session.sessionId



                });



                



                return true;



            }



            



            if (message.type === 'SESSION_NULL' || message.type === 'SESSION_INVALID') {



                this._session = null;



                this._token = null;



                this._userId = null;



                this._isAuthenticated = false;



                this._lastSessionId = null;



                this._validSessionSet = false;



                



                this._notifyListeners('session_invalid', {});



                console.log(`[${MODULE_NAME}][SessionClient] Session invalidated`);



                



                return true;



            }



            



            if (message.type === 'TOKEN_UPDATE' || message.type === 'SESSION_REFRESHED') {



                const tokenData = message.payload || message.data;



                if (tokenData && tokenData.token) {



                    // Only update token if we have a valid session



                    if (this._validSessionSet && this._session && __isValidSession(this._session)) {



                        this._token = tokenData.token;



                        this._session.token = tokenData.token;



                        this._isAuthenticated = true;



                        this._notifyListeners('token_updated', { token: this._token });



                        console.log(`[${MODULE_NAME}][SessionClient] Token refreshed`);



                    } else {



                        console.warn(`[${MODULE_NAME}][SessionClient] Token refresh ignored - no valid session`);



                    }



                }



                return true;



            }



            



            if (message.type === 'AUTH_ERROR') {



                this._session = null;



                this._token = null;



                this._userId = null;



                this._isAuthenticated = false;



                this._lastSessionId = null;



                this._validSessionSet = false;



                this._notifyListeners('auth_error', message.payload || {});



                console.warn(`[${MODULE_NAME}][SessionClient] Auth error received`);



                return true;



            }



            



            return false;



        },



        



        addListener(listener) {



            if (typeof listener === 'function') {



                this._listeners.add(listener);



            }



        },



        



        removeListener(listener) {



            this._listeners.delete(listener);



        },



        



        _notifyListeners(event, data) {



            this._listeners.forEach(listener => {



                try {



                    listener(event, data);



                } catch (error) {



                    console.error(`[${MODULE_NAME}][SessionClient] Listener error:`, error);



                }



            });



        },



        



        cleanup() {



            this._pendingRequests.clear();



            this._listeners.clear();



            this._validSessionSet = false;



        }



    };



    



/**
 * PART 2/8 — HANDSHAKE & MESSAGING PLUMBING
 * Message dedup, lifecycle state defs, strict state management, CHILD_READY/PARENT_READY handshake, module activation, safe UI init, async data loading, message queue, ID generation, endpoint normalization, standardized message sender, safe API request, queue flush, module registration, session request.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
    // ==================== MESSAGE DEDUPLICATION ====================



    const MessageGuard = {



        _seenMessages: new Map(), // Store with timestamp for TTL



        _maxSize: 1000,



        _ttlMs: 30000, // 30 seconds TTL



        _cleanupInterval: null,



        



        initialize() {



            this._cleanupInterval = setInterval(() => {



                const now = Date.now();



                for (const [messageId, timestamp] of this._seenMessages.entries()) {



                    if (now - timestamp > this._ttlMs) {



                        this._seenMessages.delete(messageId);



                    }



                }



                if (this._seenMessages.size > this._maxSize) {



                    const toDelete = this._seenMessages.size - this._maxSize;



                    let deleted = 0;



                    for (const [messageId] of this._seenMessages) {



                        if (deleted >= toDelete) break;



                        this._seenMessages.delete(messageId);



                        deleted++;



                    }



                }



            }, 60000);



        },



        



        isDuplicate(messageId) {



            if (!messageId) return false;



            if (this._seenMessages.has(messageId)) return true;



            this._seenMessages.set(messageId, Date.now());



            return false;



        },



        



        cleanup() {



            if (this._cleanupInterval) {



                clearInterval(this._cleanupInterval);



                this._cleanupInterval = null;



            }



            this._seenMessages.clear();



        }



    };



    



    MessageGuard.initialize();



    



    // ==================== LIFECYCLE STATE DEFINITIONS ====================



    // CRITICAL: VALID FLOW ONLY: BOOT → INITIALIZING → READY → WAIT_PARENT → ACTIVE



    const LifecycleState = {



        BOOT: 'BOOT',



        INITIALIZING: 'INITIALIZING',



        READY: 'READY',



        WAIT_PARENT: 'WAIT_PARENT',



        ACTIVE: 'ACTIVE',



        ERROR: 'ERROR'



    };



    



    // ==================== STRICT STATE MANAGEMENT ====================



    const VALID_TRANSITIONS = {



        [LifecycleState.BOOT]: [LifecycleState.INITIALIZING],



        [LifecycleState.INITIALIZING]: [LifecycleState.READY, LifecycleState.ERROR],



        [LifecycleState.READY]: [LifecycleState.WAIT_PARENT],



        [LifecycleState.WAIT_PARENT]: [LifecycleState.ACTIVE, LifecycleState.ERROR],



        [LifecycleState.ACTIVE]: [LifecycleState.ERROR],



        [LifecycleState.ERROR]: []



    };



    



    // Internal state - MUST be defined before any function that uses it



    let currentState = LifecycleState.BOOT;



    let childReadySent = false;



    let parentReadyReceived = false;



    let parentReadyPromiseResolve = null;



    let parentReadyPromise = new Promise(resolve => { parentReadyPromiseResolve = resolve; });



    



    // Backward compatibility variables



    let childReadySentCompat = false;



    let parentReadyReceivedCompat = false;



    



    // Additional state variables



    let parentReady = false;



    let initializationLock = false;



    let moduleInitialized = false;



    let validSessionConfirmed = false;  // Track if valid session has been received



    



let lastVerificationTime = 0;



const VERIFICATION_COOLDOWN = 5000;







    // ==================== STRICT STATE MANAGEMENT ====================



    function transitionTo(nextState, reason = '') {



        // CRITICAL: Prevent duplicate transitions to same state



        if (currentState === nextState) {



            console.log(`[${MODULE_NAME}][LIFECYCLE] Already in state ${nextState}, ignoring transition`);



            return true;



        }



        



        // Check if transition is valid



        if (!VALID_TRANSITIONS[currentState] || !VALID_TRANSITIONS[currentState].includes(nextState)) {



            console.error(`[${MODULE_NAME}][LIFECYCLE][CRITICAL] Invalid state transition: ${currentState} → ${nextState} (blocked)`, reason);



            return false;



        }



        



        const previousState = currentState;



        console.log(`[${MODULE_NAME}][LIFECYCLE] 📊 ${previousState} → ${nextState}${reason ? ` (${reason})` : ''}`);



        currentState = nextState;



        



        // Emit state change event



        window.dispatchEvent(new CustomEvent('module_state_change', {



            detail: { 



                module: MODULE_NAME, 



                from: previousState, 



                to: nextState, 



                timestamp: Date.now(),



                reason 



            }



        }));



        



        return true;



    }



    



    // ==================== STATE ASSERTION HELPER ====================



    function assertActive(actionName) {



        if (currentState !== LifecycleState.ACTIVE) {



            console.warn(`[${MODULE_NAME}][LIFECYCLE] Blocked action "${actionName}" — not ACTIVE (current: ${currentState})`);



            return false;



        }



        return true;



    }



    



    function assertState(expectedState, actionName) {



        if (currentState !== expectedState) {



            console.warn(`[${MODULE_NAME}][LIFECYCLE] Action "${actionName}" requires state ${expectedState} (current: ${currentState})`);



            return false;



        }



        return true;



    }



    



    // ==================== EXACTLY-ONCE CHILD_READY ====================



    function sendChildReady() {



        // CRITICAL: Only send CHILD_READY in READY state, exactly once



        if (currentState !== LifecycleState.READY) {



            console.warn(`[${MODULE_NAME}][LIFECYCLE] Cannot send CHILD_READY — invalid state: ${currentState} (requires READY)`);



            return false;



        }



        



        if (childReadySent) {



            console.warn(`[${MODULE_NAME}][LIFECYCLE] CHILD_READY already sent — skipping`);



            return false;



        }



        



        childReadySent = true;



        childReadySentCompat = true;



        if (typeof callsState !== 'undefined' && callsState) {



            callsState.childReadySent = true;



        }



        



        try {



            // EXACT format per contract



            window.parent.postMessage({



                type: 'CHILD_READY',



                module: MODULE_NAME,



                version: CONFIG.VERSION,



                timestamp: Date.now(),



                messageId: `child_ready_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`



            }, '*');



            



            console.log(`[${MODULE_NAME}][LIFECYCLE] ✅ CHILD_READY sent exactly once`);



            



            // Transition to WAIT_PARENT



            transitionTo(LifecycleState.WAIT_PARENT, 'child_ready_sent');

            // FIX-WAIT_PARENT: 5-second safety timeout — force ACTIVE if PARENT_READY never arrives
            if (!window.__waitParentTimeout) {
                window.__waitParentTimeout = setTimeout(function() {
                    window.__waitParentTimeout = null;
                    if (typeof currentState !== 'undefined' && currentState === LifecycleState.WAIT_PARENT) {
                        console.warn('[' + MODULE_NAME + '] WAIT_PARENT timeout — forcing ACTIVE to unblock queue');
                        try { transitionTo(LifecycleState.ACTIVE, 'wait_parent_timeout_forced'); } catch(_) {
                            currentState = LifecycleState.ACTIVE;
                        }
                        if (typeof flushQueue === 'function') flushQueue();
                    }
                }, 5000);
            }

            return true;

        } catch (error) {



            console.error(`[${MODULE_NAME}][LIFECYCLE] Failed to send CHILD_READY`, error);



            childReadySent = false;



            childReadySentCompat = false;



            if (typeof callsState !== 'undefined' && callsState) {



                callsState.childReadySent = false;



            }



            return false;



        }



    }



    



    // ==================== PARENT_READY HANDLER (STRICT WITH SESSION VALIDATION) ====================



  function handleParentReady(message) {



    // CRITICAL: Only accept PARENT_READY in WAIT_PARENT state



    if (currentState !== LifecycleState.WAIT_PARENT) {



        // Silent — duplicates are expected on navigation, no need to spam console



        return;



    }



    



    if (parentReadyReceived) {



        // Silent — already handled



        return;



    }



    



    parentReadyReceived = true;



    parentReadyReceivedCompat = true;



    parentReady = true;



    if (typeof callsState !== 'undefined' && callsState) {



        callsState.parentReady = true;



    }



    



    // Extract session data from message - handle different message structures



    let sessionData = message.payload?.session || message.session || message.payload || {};



    



    // Log what we received for debugging



    console.log(`[${MODULE_NAME}][handleParentReady] Session data received:`, {



        hasPayload: !!message.payload,



        hasSessionInPayload: !!message.payload?.session,



        hasDirectSession: !!message.session,



        sessionDataKeys: Object.keys(sessionData)



    });



    



    // Apply session if present and VALID



    if (sessionData && Object.keys(sessionData).length > 0) {



        // CRITICAL: Make sure userId is extracted correctly



        // SessionData might be the raw session from parent or might be wrapped



        let userId = sessionData.userId;



        if (!userId && sessionData.user) {



            userId = sessionData.user.id || sessionData.user.userId;



        }



        if (!userId && sessionData.id && typeof sessionData.id === 'number') {



            userId = sessionData.id;



        }



        



        // Create a properly formatted session object



        const formattedSession = {



            token: sessionData.token || sessionData.jwt || sessionData.accessToken,



            userId: userId,



            user: sessionData.user || { id: userId, userId: userId },



            expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),



            authenticated: sessionData.authenticated !== false,



            sessionId: sessionData.sessionId || sessionData.id || Date.now()



        };



        



        console.log(`[${MODULE_NAME}][handleParentReady] Formatted session:`, {



            hasToken: !!formattedSession.token,



            userId: formattedSession.userId,



            authenticated: formattedSession.authenticated,



            sessionId: formattedSession.sessionId



        });



        



        // Apply the formatted session



        const applyResult = applySession(formattedSession);



        



        // CRITICAL: WAIT_PARENT → ACTIVE ONLY IF session is valid



        if (applyResult && validSessionConfirmed && __isValidSession(callsState.session)) {



            // Transition to ACTIVE only with valid session



            transitionTo(LifecycleState.ACTIVE, 'parent_ready_received_with_valid_session');



            



            if (parentReadyPromiseResolve) {



                parentReadyPromiseResolve();



            }



            



            // Flush any queued messages



            flushQueue();



            



            // Activate module



            onModuleActive();



            



            console.log(`[${MODULE_NAME}][LIFECYCLE] ✅ PARENT_READY processed, module ACTIVE with valid session`);



        } else {



            // Stay in WAIT_PARENT - session not valid yet



            console.log(`[${MODULE_NAME}][LIFECYCLE] ⏳ WAIT_PARENT: Session not valid yet, awaiting valid session`);



            // Request session if needed



            if (!callsState.session || !__isValidSession(callsState.session)) {



                SessionClient.requestSession();



            }



        }



    } else {



        // No session data, request it



        console.log(`[${MODULE_NAME}][LIFECYCLE] ⏳ WAIT_PARENT: No session data, requesting session`);



        SessionClient.requestSession();



    }



}



    



function applySession(sessionData) {



    if (!sessionData) return false;



    



    // The sessionData should already be formatted when coming from handleParentReady



    // But handle the case where it's not



    let token = sessionData.token || sessionData.jwt || sessionData.accessToken;



    



    if (token && typeof callsState !== 'undefined' && callsState) {



        // Extract userId - it should be at root level now



        let userId = sessionData.userId;



        if (!userId && sessionData.user) {



            userId = sessionData.user.id || sessionData.user.userId;



        }



        



        // If we still don't have userId, but we have sessionData.id, use that



        if (!userId && sessionData.id) {



            userId = sessionData.id;



        }



        



        // Log for debugging



        console.log(`[${MODULE_NAME}][applySession] Processing session:`, {



            hasToken: !!token,



            userId: userId,



            hasUserObject: !!sessionData.user,



            sessionDataKeys: Object.keys(sessionData)



        });



        



        // Create candidate session with validated userId



        const candidateSession = {



            token: token,



            user: sessionData.user || { id: userId, userId: userId },



            userId: userId,



            expiresAt: sessionData.expiresAt || (Date.now() + 3600000),



            authenticated: sessionData.authenticated !== false,



            sessionId: sessionData.sessionId || Date.now()



        };



        



        // CRITICAL: Validate session before applying



        if (!__isValidSession(candidateSession)) {



            console.warn(`[${MODULE_NAME}][LIFECYCLE] Rejected invalid session in applySession`, {



                hasToken: !!candidateSession.token,



                userId: candidateSession.userId,



                authenticated: candidateSession.authenticated,



                rawUserId: userId



            });



            return false;



        }



        



        // IMMUTABLE SESSION PROTECTION: Prevent overwriting valid session



        if (callsState.session && __isValidSession(callsState.session)) {



            if (!__isValidSession(candidateSession)) {



                console.warn(`[${MODULE_NAME}][LIFECYCLE] Prevented session downgrade in applySession`);



                return false;



            }



        }



        



        // Session deduplication



        if (callsState.lastSessionId === candidateSession.sessionId) {



            console.log(`[${MODULE_NAME}][applySession] Duplicate session ignored`);



            return false;



        }



        



        callsState.lastSessionId = candidateSession.sessionId;



        callsState.session = candidateSession;



        callsState.token = token;



        callsState.sessionStatus = 'valid';



        callsState.sessionReceived = true;



        validSessionConfirmed = true;



        



        console.log(`[${MODULE_NAME}][LIFECYCLE] Valid session applied:`, {



            authenticated: candidateSession.authenticated,



            userId: candidateSession.userId,



            sessionId: candidateSession.sessionId



        });



        



        // If we're in WAIT_PARENT and now have valid session, try to activate



        if (currentState === LifecycleState.WAIT_PARENT && parentReady && !parentReadyReceived) {



            // This handles session arriving before PARENT_READY



            console.log(`[${MODULE_NAME}][LIFECYCLE] Valid session received while in WAIT_PARENT, ready for activation when PARENT_READY arrives`);



        } else if (currentState === LifecycleState.WAIT_PARENT && parentReadyReceived) {



            // Session arrived after PARENT_READY but while still in WAIT_PARENT



            transitionTo(LifecycleState.ACTIVE, 'valid_session_received_after_parent_ready');



            



            if (parentReadyPromiseResolve) {



                parentReadyPromiseResolve();



            }



            



            flushQueue();



            onModuleActive();



            



            console.log(`[${MODULE_NAME}][LIFECYCLE] ✅ Module activated after valid session received`);



        }



        



        return true;



    }



    



    return false;



}



    



    // ==================== MODULE ACTIVATION HOOK ====================



    function onModuleActive() {



        console.log(`[${MODULE_NAME}][LIFECYCLE] Module ACTIVE — safe zone entered`);



        



        // Request session from parent if needed (safety check)



        if (typeof callsState !== 'undefined' && callsState && (!callsState.session || !__isValidSession(callsState.session))) {



            SessionClient.requestSession();



        }



        



        // Register module with parent



        setTimeout(() => {



            if (currentState === LifecycleState.ACTIVE) {



                registerModule();



            }



        }, 100);



        



        // Initialize UI and other async features



        initUISafely();



        loadDataAsync();



        



        // Notify listeners



        window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {

            detail: { core: window.callCore, timestamp: Date.now() }

        }));

        // ── PENDING INCOMING CALL REPLAY ─────────────────────────────────
        // If a call:incoming event arrived before the module was ACTIVE,
        // chat.html stores it in window.__pendingIncomingCallData.
        // Replay it now that we're active so the receiver sees it.
        setTimeout(function() {
            const pending = window.__pendingIncomingCallData;
            if (pending && pending.callId) {
                console.log('[CallsCore] 🔔 Replaying pending incoming call after module became ACTIVE:', pending.callId);
                window.__pendingIncomingCallData = null;
                handleIncomingCall(pending);
            }
        }, 200);



        



        window.dispatchEvent(new CustomEvent('MODULE_READY', {



            detail: { module: MODULE_NAME, timestamp: Date.now() }



        }));



    }



    



    // ==================== SAFE UI INITIALIZATION ====================



    function initUISafely() {



        try {



            // Initialize media manager safely



            if (typeof MediaManager !== 'undefined' && MediaManager) {



                MediaManager.initialize().catch(error => {



                    logError(MODULE, 'Media manager initialization failed', error);



                });



            }



            



            // Initialize UI bridge



            if (typeof UIBridge !== 'undefined' && UIBridge) {



                UIBridge.initialize();



            }



            



            console.log(`[${MODULE_NAME}][LIFECYCLE] UI initialized safely`);



        } catch (error) {



            logError(MODULE, 'UI initialization failed', error);



        }



    }



    



    // ==================== ASYNC DATA LOADING ====================



    function loadDataAsync() {



        setTimeout(() => {



            if (currentState === LifecycleState.ACTIVE) {



                // Load any async data needed (non-call related only)



            }



        }, 500);



    }



    



    // ==================== MESSAGE QUEUE SYSTEM ====================



    const messageQueue = [];



    



    // ==================== ID GENERATION ====================



    function generateId() {



        return 'msg_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();



    }



    



    function generateRequestId() {



        return 'req_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();



    }



    



    // ==================== ENDPOINT NORMALIZATION ====================



    function normalizeEndpoint(endpoint) {



        if (!endpoint || typeof endpoint !== 'string') {



            return '';



        }



        



        let normalized = endpoint.trim();



        



        // Remove /api prefix if present



        if (normalized.startsWith('/api/')) {



            normalized = normalized.substring(4);



        } else if (normalized.startsWith('api/')) {



            normalized = '/' + normalized.substring(3);



        }



        



        // Ensure starts with /



        if (!normalized.startsWith('/')) {



            normalized = '/' + normalized;



        }



        



        // Remove double slashes



        normalized = normalized.replace(/\/+/g, '/');



        



        return normalized;



    }



    



    // ==================== STANDARDIZED MESSAGE SENDER ====================



    function sendMessage(type, payload = {}, requireAck = false) {



        // CRITICAL: Only allow messages in ACTIVE state



        if (currentState !== LifecycleState.ACTIVE) {



            console.warn(`[${MODULE_NAME}] Cannot send ${type} - invalid state: ${currentState} (requires ACTIVE)`);



            return Promise.resolve({ success: false, reason: 'invalid_state' });



        }



        



        const messageId = generateId();



        const requestId = generateRequestId();



        



        // ENFORCE EXACT PROTOCOL SCHEMA with deduplication



        const message = {



            type: type,



            id: messageId,



            requestId: requestId,



            source: MODULE_NAME,



            target: 'parent',



            timestamp: Date.now(),



            payload: payload,



            messageId: messageId



        };



        



        // Check for duplicate sending



        if (MessageGuard.isDuplicate(messageId)) {



            console.warn(`[${MODULE_NAME}] Duplicate message blocked: ${type} (${messageId})`);



            return Promise.resolve({ success: false, reason: 'duplicate' });



        }



        



        console.log(`[${MODULE_NAME}] 📤 ${type}`, { messageId, requestId });



        



        // SAFE POSTMESSAGE WRAPPER



        try {



            window.parent.postMessage(message, '*');



        } catch (error) {



            console.error(`[${MODULE_NAME}] Failed to send message ${type}:`, error);



            return Promise.resolve({ success: false, reason: 'postmessage_failed', error: error.message });



        }



        



        if (requireAck) {



            return new Promise((resolve) => {



                const timeoutId = setTimeout(() => {



                    resolve({ success: true, messageId, requestId, timeout: true });



                }, 3000);



                



                // Store timeout ID for cleanup



                if (typeof MessageRegistry !== 'undefined' && MessageRegistry) {



                    MessageRegistry._pendingMessages.set(messageId, { timeoutId });



                }



            });



        }



        



        return Promise.resolve({ success: true, messageId, requestId });



    }



    



    // ==================== SAFE API REQUEST ====================



    function sendApiRequest(endpoint, method = 'GET', data = null, options = {}) {



        if (!assertActive('API_REQUEST')) {



            return Promise.resolve({ success: false, reason: 'not_active', error: 'Module not active' });



        }



        



        // Validate and normalize endpoint



        const normalizedEndpoint = normalizeEndpoint(endpoint);



        if (!normalizedEndpoint) {



            console.error(`[${MODULE_NAME}] Invalid API endpoint: ${endpoint}`);



            return Promise.resolve({ success: false, reason: 'invalid_endpoint', error: 'Endpoint is required' });



        }



        



        const requestId = options.requestId || generateRequestId();



        



        const message = {



            type: 'API_REQUEST',



            id: generateId(),



            requestId: requestId,



            source: MODULE_NAME,



            target: 'parent',



            timestamp: Date.now(),



            payload: {



                endpoint: normalizedEndpoint,



                method: method.toUpperCase(),



                data: data || null,



                headers: options.headers || {},



                timeout: options.timeout || 10000



            },



            messageId: generateId()



        };



        



        console.log(`[${MODULE_NAME}] 📤 API_REQUEST: ${method} ${normalizedEndpoint}`);



        



        // SAFE POSTMESSAGE WRAPPER



        try {



            window.parent.postMessage(message, '*');



        } catch (error) {



            console.error(`[${MODULE_NAME}] Failed to send API request:`, error);



            return Promise.resolve({ success: false, reason: 'postmessage_failed', error: error.message });



        }



        



        // Return promise with timeout



        return new Promise((resolve) => {



            const timeoutId = setTimeout(() => {



                console.warn(`[${MODULE_NAME}] API request timeout: ${method} ${normalizedEndpoint}`);



                resolve({ 



                    success: false, 



                    reason: 'timeout', 



                    error: 'API request timeout',



                    requestId: requestId



                });



            }, options.timeout || 10000);



            



            // Store for response handling



            if (typeof MessageRegistry !== 'undefined' && MessageRegistry) {



                MessageRegistry._pendingMessages.set(requestId, { 



                    timeoutId, 



                    resolve,



                    type: 'API_REQUEST',



                    endpoint: normalizedEndpoint



                });



            }



        });



    }



    



    // ==================== SAFE SEND WITH QUEUE ====================



    function safeSend(type, payload = {}, requireAck = false) {



        // CRITICAL: No outbound messages before ACTIVE except CHILD_READY



        if (type !== 'CHILD_READY' && currentState !== LifecycleState.ACTIVE) {



            console.log(`[${MODULE_NAME}] Queueing ${type} - not ACTIVE (current: ${currentState})`);



            const queuedMessage = { type, payload, requireAck, timestamp: Date.now() };



            messageQueue.push(queuedMessage);



            



            return new Promise((resolve) => {



                queuedMessage.resolve = resolve;



            });



        }



        



        // Special handling for API_REQUEST



        if (type === 'API_REQUEST') {



            const endpoint = payload.endpoint || payload.url;



            const method = payload.method || 'GET';



            const data = payload.data || payload.body;



            return sendApiRequest(endpoint, method, data, payload);



        }



        



        return sendMessage(type, payload, requireAck);



    }



    



    // ==================== FLUSH QUEUE ====================



    function flushQueue() {



        if (messageQueue.length === 0) return;



        



        console.log(`[${MODULE_NAME}] Flushing ${messageQueue.length} queued messages`);



        



        while (messageQueue.length) {



            const queued = messageQueue.shift();



            let result;



            



            if (queued.type === 'API_REQUEST') {



                const endpoint = queued.payload.endpoint || queued.payload.url;



                const method = queued.payload.method || 'GET';



                const data = queued.payload.data || queued.payload.body;



                result = sendApiRequest(endpoint, method, data, queued.payload);



            } else {



                result = sendMessage(queued.type, queued.payload, queued.requireAck);



            }



            



            if (queued.resolve) {



                result.then(queued.resolve).catch(queued.resolve);



            }



        }



    }



    



    // ==================== REGISTER MODULE ====================



    let registrationSent = false;



    



    function registerModule() {



        if (!assertActive('REGISTER_MODULE')) {



            return;



        }



        



        if (registrationSent) {



            return; // already registered — silent



        }



        



        if (!parentReady) {



            console.warn(`[${MODULE_NAME}] Cannot register - parent not ready`);



            return;



        }



        



        registrationSent = true;



        if (typeof callsState !== 'undefined' && callsState) {



            callsState.registrationSent = true;



        }



        



        safeSend('REGISTER_MODULE', {



            moduleName: MODULE_NAME,



            version: CONFIG.VERSION,



            capabilities: [



                'voice',



                'video',



                'screenShare',



                'whiteboard',



                'polls',



                'notes'



            ]



        }, false);



        



        console.log(`[${MODULE_NAME}] ✅ REGISTER_MODULE sent`);



        if (typeof callsState !== 'undefined' && callsState) {



            callsState.registered = true;



        }



        



        window.dispatchEvent(new CustomEvent('MODULE_READY', {



            detail: { module: MODULE_NAME, timestamp: Date.now() }



        }));



    }



    



    // ==================== REQUEST SESSION ====================



    let sessionRequestAttempts = 0;



    const MAX_SESSION_REQUESTS = 3;



    let sessionRequestTimer = null;



    



    function requestSession() {



        if (!assertActive('REQUEST_SESSION')) {



            return;



        }



        



        if (!parentReady) {



            console.warn(`[${MODULE_NAME}] Cannot request session - parent not ready`);



            return;



        }



        



        if (typeof IframeTransport !== 'undefined' && IframeTransport && IframeTransport._sessionRequested) return;



        



        if (typeof callsState !== 'undefined' && callsState && callsState.session && __isValidSession(callsState.session)) {



            sessionRequestAttempts = 0;



        }



        



        if (typeof IframeTransport !== 'undefined' && IframeTransport) {



            IframeTransport._sessionRequested = true;



        }



        sessionRequestAttempts++;



        



        if (typeof IframeTransport !== 'undefined' && IframeTransport && IframeTransport._sessionRequestTimer) {



            clearTimeout(IframeTransport._sessionRequestTimer);



        }



        



        if (typeof IframeTransport !== 'undefined' && IframeTransport) {



            IframeTransport._sessionRequestTimer = setTimeout(() => {



                if (IframeTransport) IframeTransport._sessionRequested = false;



            }, 10000);



        }



        



        safeSend('REQUEST_SESSION', {



            timestamp: Date.now(),



            frameId: window.name || 'calls-iframe',



            attempt: sessionRequestAttempts



        }, false).catch(() => {});



        



        console.log(`[${MODULE_NAME}] 📤 REQUEST_SESSION sent (attempt ${sessionRequestAttempts})`);



    }



    



    function refreshSession() {



        if (!assertActive('refreshSession')) return;



        



        console.log(`[${MODULE_NAME}] 🔄 Refreshing session due to auth failure`);



        



        if (typeof callsState !== 'undefined' && callsState) {



            callsState.session = null;



            callsState.token = null;



            callsState.verified = false;



            callsState.sessionReceived = false;



            callsState.sessionStatus = 'pending';



            validSessionConfirmed = false;



        }



        



        // Storage is ONLY for UI preferences, never for call state



        StorageProxy.set('session_state', 'invalid');



        



        const delay = Math.min(1000 * Math.pow(2, sessionRequestAttempts), 10000);



        



        setTimeout(() => {



            if (typeof IframeTransport !== 'undefined' && IframeTransport) {



                IframeTransport._sessionRequested = false;



            }



            if (currentState === LifecycleState.ACTIVE) {



                SessionClient.requestSession();



            }



        }, delay);



    }



    



    function sendHeartbeatAck(originalMessageId) {



        if (!assertActive('HEARTBEAT_ACK')) return;



        if (!parentReady) return;



        



        safeSend('HEARTBEAT_ACK', {



            ackId: originalMessageId,



            module: MODULE_NAME,



            timestamp: Date.now()



        });



    }



    



/**
 * PART 3/8 — CORE STATE & LOGGING
 * Global call state structure (callsState), clean logging system, the calls state machine, and message type constants shared by every other part.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
    // ==================== GLOBAL CALL STATE STRUCTURE ====================



    // CRITICAL: Call state is in-memory ONLY - no storage dependency



    const callsState = {



        moduleName: MODULE_NAME,



        lifecycleState: LifecycleState.INITIALIZING,



        registered: false,



        parentReady: false,



        parentOrigin: null,



        parentOriginLocked: false,



        initialized: false,



        session: null,



        sessionStatus: 'pending',



        token: null,



        verified: false,



        verificationLock: false,



        heartbeatEnabled: false,



        webrtcInitialized: false,



        recoveryMode: false,



        sessionReceived: false,



        



        // ==================== CALL STATE (IN-MEMORY ONLY) ====================



        // CRITICAL: No storage for call state - single active call enforcement



        activeCall: null,           // { callId, type, participants, startTime, state }



        activeCallId: null,



        callActive: false,



        callState: 'idle',          // idle, initiating, ringing, connecting, connected, ended, failed, incoming



        callParticipants: [],



        callStartTime: null,



        callDuration: 0,



        callType: null,



        callInvitationTimer: null,



        callInvitationTimeout: 30000,



        callData: null,             // Store incoming call data



        



        // WebRTC state (in-memory only)



        peerConnection: null,



        iceCandidates: [],



        iceRestartCount: 0,



        maxIceRestarts: 3,



        pendingSignals: [],



        signalingState: 'new',



        connectionState: 'new',



        



        localStream: null,



        remoteStream: null,



        remoteStreams: new Map(),



        micEnabled: true,



        cameraEnabled: false,



        cameraFacingMode: 'user',



        screenSharing: false,



        mediaDevices: {



            audioInput: [],



            videoInput: [],



            audioOutput: []



        },



        



        // UI state (in-memory only)



        currentMood: 'neutral',



        currentIntention: 'quick',



        currentFocusMode: false,



        currentPanel: 'participants',



        



        isPremium: false,



        premiumFeatures: {



            // FIX (Forensic Audit P1): groupCalls was hard-blocked (false) with no activation
            // path, making group calls unavailable to all users. Enabled by default.
            // Premium gate retained only for advanced features (whiteboard, polls).
            groupCalls: true,



            screenSharing: false,



            whiteboard: false,



            polls: false,



            relationshipInsights: false,



            callLinks: false



        },



        



        childReadySent: false,



        registrationSent: false,



        



        processedMessageIds: new Set(),



        lastMessageCleanup: Date.now(),



        degraded: false,



        



        // Session deduplication



        lastSessionId: null



    };

    // FIX: expose the real callsState so code outside this closure (e.g. the
    // global updateCallUI() function below, and defensive `window.callsState &&`
    // reads elsewhere in this file) can actually see live call state instead
    // of always reading undefined. The most severe consequence of this being
    // missing: updateCallUI() always fell through to its "idle" branch and
    // force-navigated the user OFF their active call screen on every
    // participant presence update received during a live call.
    window.callsState = callsState;

    // ══════════════════════════════════════════════════════════════════════════
    // CALLMANAGER BRIDGE — Single Source of Truth Integration
    //
    // Intercepts every write to callsState.callState / callsState.callActive
    // and syncs them to the central CallManager / CallStateMachine so both
    // systems stay consistent without a full rewrite of this file.
    //
    // Legacy state → CALL_STATE mapping:
    //   idle / ended / failed / rejected / missed / busy / timeout → terminal
    //   initiating / initiated → OUTGOING
    //   incoming → INCOMING   |  ringing → RINGING
    //   connecting / starting → CONNECTING
    //   connected / in-call → CONNECTED_AUDIO (CallManager upgrades to VIDEO)
    //   reconnecting → RECONNECTING
    // ══════════════════════════════════════════════════════════════════════════
    (function _installCallManagerBridge() {
        var _legacyToCS = {
            idle: 'IDLE', initiating: 'OUTGOING', initiated: 'OUTGOING',
            incoming: 'INCOMING', ringing: 'RINGING',
            connecting: 'CONNECTING', starting: 'CONNECTING', negotiating: 'NEGOTIATING',
            connected: 'CONNECTED_AUDIO', 'in-call': 'CONNECTED_AUDIO',
            reconnecting: 'RECONNECTING', failed: 'FAILED', ended: 'ENDED',
            rejected: 'REJECTED', missed: 'MISSED', busy: 'BUSY', timeout: 'TIMEOUT',
        };

        var _rawCallState  = callsState.callState;
        var _rawCallActive = callsState.callActive;

        Object.defineProperty(callsState, 'callState', {
            get: function() { return _rawCallState; },
            set: function(v) {
                if (_rawCallState === v) return;
                _rawCallState = v;
                try {
                    var sm = window.__CallStateMachine;
                    var CS = window.CALL_STATE;
                    if (!sm || !CS) return;
                    var target = CS[_legacyToCS[v] || ''];
                    if (!target) return;
                    var callId = callsState.activeCallId || callsState.serverCallId || callsState.localCallId;
                    if (!callId) return;
                    var session = sm.getSession(callId);
                    if (!session || session.isTerminal() || session.state === target) return;
                    sm.transition(callId, target);
                } catch (_) {}
            },
            enumerable: true, configurable: true
        });

        Object.defineProperty(callsState, 'callActive', {
            get: function() { return _rawCallActive; },
            set: function(v) {
                _rawCallActive = v;
                if (!v) {
                    try {
                        var cm = window.__CallManager;
                        if (cm && typeof cm._stopCallTimer === 'function') cm._stopCallTimer();
                    } catch (_) {}
                }
            },
            enumerable: true, configurable: true
        });
    })();

    // ══════════════════════════════════════════════════════════════════════════
    // OUTGOING CALL BRIDGE — ensure CallManager session created on initiate
    // ══════════════════════════════════════════════════════════════════════════
    var _cmTimerDelegated = false;

    // ==================== CLEAN LOGGING SYSTEM ====================



    const _infoLogs = new Map();



    const _warnLogs = new Map();



    const _errorLogs = new Map();



    const _successLogs = new Map();



    const _sendingLogs = new Map();



    const _readyLogs = new Map();



    const _stateLogs = new Map();



    const _sessionLogs = new Map();



    const _heartbeatLogs = new Map();



    const _callLogs = new Map();



    



    function logInfo(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_infoLogs.has(key)) {



            const lastTime = _infoLogs.get(key);



            if (Date.now() - lastTime < 5000) return;



        }



        _infoLogs.set(key, Date.now());



        setTimeout(() => _infoLogs.delete(key), 5000);



        console.log(`[${module}] ℹ️ ${message}`, data ? data : '', _buildStructuredLog(module, message, data));



    }



    



    // FIX-STRUCTURED-LOGGING (Phase 13): every log line now also carries a
    // structured record with timestamp, callId, userId, socketId, event, and
    // state -- the fields explicitly required -- alongside the existing
    // human-readable emoji line (kept as-is so nothing that scans console
    // output for the old format breaks). Dedup-by-time-window logic in each
    // of the four functions below is unchanged.
    function _buildStructuredLog(module, message, extra) {
        var callId = null;
        try {
            callId = (extra && (extra.callId || extra.id))
                || (typeof callsState !== 'undefined' && callsState && callsState.activeCallId)
                || null;
        } catch (_) {}

        var userId = null;
        try {
            userId = (typeof callsState !== 'undefined' && callsState && callsState.session && callsState.session.userId)
                || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.userId)
                || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.user && window.__CHILD_SESSION__.user.id)
                || null;
        } catch (_) {}

        var socketId = null;
        try {
            var _sock = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
            socketId = (_sock && _sock.id) || null;
        } catch (_) {}

        var state = null;
        try {
            state = (typeof callsState !== 'undefined' && callsState && callsState.callState) || null;
        } catch (_) {}

        return {
            timestamp: new Date().toISOString(),
            module:    module,
            event:     message,
            callId:    callId,
            userId:    userId,
            socketId:  socketId,
            state:     state,
        };
    }

    function logWarn(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_warnLogs.has(key)) {



            const lastTime = _warnLogs.get(key);



            if (Date.now() - lastTime < 10000) return;



        }



        _warnLogs.set(key, Date.now());



        setTimeout(() => _warnLogs.delete(key), 10000);



        console.warn(`[${module}] ⚠️ ${message}`, data ? data : '', _buildStructuredLog(module, message, data));



    }



    



    function logError(module, message, error = null, data = null) {



        const key = `${module}:${message}`;



        if (_errorLogs.has(key)) {



            const lastTime = _errorLogs.get(key);



            if (Date.now() - lastTime < 30000) return;



        }



        _errorLogs.set(key, Date.now());



        setTimeout(() => _errorLogs.delete(key), 30000);



        console.error(`[${module}] 🔴 ${message}`, error ? error : '', data ? data : '', _buildStructuredLog(module, message, data));



    }



    



    function logSuccess(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_successLogs.has(key)) {



            const lastTime = _successLogs.get(key);



            if (Date.now() - lastTime < 5000) return;



        }



        _successLogs.set(key, Date.now());



        setTimeout(() => _successLogs.delete(key), 5000);



        console.log(`[${module}] ✅ ${message}`, data ? data : '', _buildStructuredLog(module, message, data));



    }



    



    function logSending(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_sendingLogs.has(key)) {



            const lastTime = _sendingLogs.get(key);



            if (Date.now() - lastTime < 2000) return;



        }



        _sendingLogs.set(key, Date.now());



        setTimeout(() => _sendingLogs.delete(key), 2000);



        console.log(`[${module}] 📤 ${message}`, data ? data : '', _buildStructuredLog(module, message, data));



    }



    



    function logReady(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_readyLogs.has(key)) {



            const lastTime = _readyLogs.get(key);



            if (Date.now() - lastTime < 30000) return;



        }



        _readyLogs.set(key, Date.now());



        setTimeout(() => _readyLogs.delete(key), 30000);



        console.log(`[${module}] 🔵 ${message}`, data ? data : '', _buildStructuredLog(module, message, data));



    }



    



    function logState(module, fromState, toState, reason = '') {



        const key = `${module}:${fromState}→${toState}`;



        if (_stateLogs.has(key)) {



            const lastTime = _stateLogs.get(key);



            if (Date.now() - lastTime < 1000) return;



        }



        _stateLogs.set(key, Date.now());



        setTimeout(() => _stateLogs.delete(key), 1000);



        console.log(`[${module}] 📊 ${fromState} → ${toState}${reason ? ` (${reason})` : ''}`, _buildStructuredLog(module, `${fromState}->${toState}`, { reason }));



    }



    



    function logSession(module, message, data = null) {



        const key = `${module}:session:${message}`;



        if (_sessionLogs.has(key)) {



            const lastTime = _sessionLogs.get(key);



            if (Date.now() - lastTime < 10000) return;



        }



        _sessionLogs.set(key, Date.now());



        setTimeout(() => _sessionLogs.delete(key), 10000);



        console.log(`[${module}] 🎫 ${message}`, data ? data : '', _buildStructuredLog(module, message, data));



    }



    



    function logHeartbeat(module, message, data = null) {



        const key = `${module}:heartbeat:${message}`;



        if (_heartbeatLogs.has(key)) {



            const lastTime = _heartbeatLogs.get(key);



            if (Date.now() - lastTime < 2000) return;



        }



        _heartbeatLogs.set(key, Date.now());



        setTimeout(() => _heartbeatLogs.delete(key), 2000);



        console.log(`[${module}] 💓 ${message}`, data ? data : '', _buildStructuredLog(module, message, data));



    }



    



    function logCall(module, message, data = null) {



        const key = `${module}:call:${message}`;



        if (_callLogs.has(key)) {



            const lastTime = _callLogs.get(key);



            if (Date.now() - lastTime < 1000) return;



        }



        _callLogs.set(key, Date.now());



        setTimeout(() => _callLogs.delete(key), 1000);



        console.log(`[${module}] 📞 ${message}`, data ? data : '', _buildStructuredLog(module, message, data));



    }



    



    const MODULE = 'CallsCore';



    



    // ==================== CALLS STATE MACHINE ====================



    const CALLS_STATE = {



        INIT: 'INIT',



        REGISTERING: 'REGISTERING',



        REGISTERED: 'REGISTERED',



        SESSION_PENDING: 'SESSION_PENDING',



        SESSION_RECEIVED: 'SESSION_RECEIVED',



        ACTIVE: 'ACTIVE',



        CALL_READY: 'CALL_READY',



        IN_CALL: 'IN_CALL',



        TERMINATED: 'TERMINATED'



    };



    



    // V5 state mapping for backward compatibility



    const V5_STATE = {



        BOOTING: 'BOOTING',



        REGISTERING: 'REGISTERING',



        WAITING_SESSION: 'WAITING_SESSION',



        WAITING_PARENT_READY: 'WAITING_PARENT_READY',



        ACTIVE: 'ACTIVE',



        DEGRADED: 'DEGRADED',



        RECOVERY: 'RECOVERY',



        STANDALONE: 'STANDALONE',



        OFFLINE: 'OFFLINE'



    };



    



    const STATE = {



        UNINITIALIZED: 'UNINITIALIZED',



        BOOTSTRAPPING: 'BOOTSTRAPPING',



        REGISTERING: 'REGISTERING',



        REGISTERED: 'REGISTERED',



        SESSION_PENDING: 'SESSION_PENDING',



        SESSION_ACTIVE: 'SESSION_ACTIVE',



        SERVICES_INITIALIZING: 'SERVICES_INITIALIZING',



        ACTIVE: 'ACTIVE',



        ERROR_RECOVERABLE: 'ERROR_RECOVERABLE',



        ERROR_FATAL: 'ERROR_FATAL',



        RECOVERING: 'RECOVERING',



        INIT: 'INIT',



        PREFLIGHT: 'PREFLIGHT',



        DEPENDENCY: 'DEPENDENCY',



        PARENT_DETECT: 'PARENT_DETECT',



        SYNC: 'SYNC',



        PERMISSIONS: 'PERMISSIONS',



        READY: 'READY',



        SUSPENDED: 'SUSPENDED',



        DEGRADED: 'DEGRADED',



        DESTROYED: 'DESTROYED',



        HANDSHAKE_IDLE: 'HANDSHAKE_IDLE',



        HANDSHAKE_WAITING: 'HANDSHAKE_WAITING',



        HANDSHAKE_IN_PROGRESS: 'HANDSHAKE_IN_PROGRESS',



        HANDSHAKE_FAILED: 'HANDSHAKE_FAILED',



        SESSION_IDLE: 'SESSION_IDLE',



        SESSION_WAITING: 'SESSION_WAITING',



        SESSION_VALID: 'SESSION_VALID',



        SESSION_EXPIRED: 'SESSION_EXPIRED',



        SESSION_ERROR: 'SESSION_ERROR'



    };



    



    const CallCoreState = {



        IDLE: 'IDLE',



        WAITING_PARENT: 'WAITING_PARENT',



        WAITING_SESSION: 'WAITING_SESSION',



        SYNCED: 'SYNCED',



        ACTIVE: 'ACTIVE',



        ERROR: 'ERROR',



        RECOVERING: 'RECOVERING'



    };



    



    // ==================== MESSAGE TYPES ====================



    const MESSAGE_TYPES = {



        CHILD_READY: 'CHILD_READY',



        PARENT_READY: 'PARENT_READY',



        REGISTER_MODULE: 'REGISTER_MODULE',



        MODULE_REGISTERED: 'MODULE_REGISTERED',



        MODULE_READY: 'MODULE_READY',



        MODULE_INIT_DATA: 'MODULE_INIT_DATA',



        



        HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',



        HANDSHAKE_ACK: 'HANDSHAKE_ACK',



        HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',



        HANDSHAKE_RETRY: 'HANDSHAKE_RETRY',



        



        REQUEST_SESSION: 'REQUEST_SESSION',



        SESSION_ACTIVE: 'SESSION_ACTIVE',



        SESSION_NULL: 'SESSION_NULL',



        SESSION_RESPONSE: 'SESSION_RESPONSE',



        SESSION_DATA: 'SESSION_DATA',



        SESSION_UPDATE: 'SESSION_UPDATE',



        SESSION_SYNC: 'SESSION_SYNC',



        SESSION_ACK: 'SESSION_ACK',



        VERIFY_SESSION: 'VERIFY_SESSION',



        SESSION_VERIFIED: 'SESSION_VERIFIED',



        SESSION_REFRESHED: 'SESSION_REFRESHED',



        SESSION_INVALIDATED: 'SESSION_INVALIDATED',



        SESSION_RECOVERY: 'SESSION_RECOVERY',



        



        HEARTBEAT: 'HEARTBEAT',



        HEARTBEAT_ACK: 'HEARTBEAT_ACK',



        



        ACK: 'ACK',



        



        API_REQUEST: 'API_REQUEST',



        API_RESPONSE: 'API_RESPONSE',



        



        PAGE_ACTIVATED: 'PAGE_ACTIVATED',



        NAVIGATE: 'NAVIGATE',



        



        PARENT_RECOVERY: 'PARENT_RECOVERY',



        REQUEST_RESYNC: 'REQUEST_RESYNC',



        PARENT_CRASH_RECOVERY: 'PARENT_CRASH_RECOVERY',



        RECOVERY_REQUEST: 'RECOVERY_REQUEST',



        



        AUTH_ERROR: 'AUTH_ERROR',



        SESSION_ERROR: 'SESSION_ERROR',



        



        ACTION: 'ACTION',



        



        // ==================== CALL SIGNALING (REAL BACKEND) ====================



        CALL_INITIATE: 'call:initiate',

        CALL_INITIATED_ACK: 'call:initiated_ack',

        CALL_INCOMING: 'call:incoming',



        CALL_ACCEPT: 'call:accept',



        CALL_REJECT: 'call:reject',



        CALL_INITIATED: 'call:initiated',



        CALL_CONNECTING: 'call:connecting',



        CALL_STARTED: 'call:started',



        CALL_CONNECTED: 'call:connected',



        CALL_ENDED: 'CALL_ENDED',



        CALL_REJECTED: 'CALL_REJECTED',



        CALL_FAILED: 'CALL_FAILED',



        CALL_TIMEOUT: 'CALL_TIMEOUT',



        CALL_BUSY: 'CALL_BUSY',



        CALL_FORCE_ENDED: 'CALL_FORCE_ENDED',



        



        // WebRTC Signaling (must go through parent → backend)



        SIGNALING_MESSAGE: 'SIGNALING_MESSAGE',



        SIGNAL_OFFER: 'SIGNAL_OFFER',



        SIGNAL_ANSWER: 'SIGNAL_ANSWER',



        ICE_CANDIDATE: 'ICE_CANDIDATE',



        



        REMOTE_STREAM_ADDED: 'REMOTE_STREAM_ADDED',



        REMOTE_STREAM_REMOVED: 'REMOTE_STREAM_REMOVED',



        



        AUDIO_MUTED: 'AUDIO_MUTED',



        VIDEO_MUTED: 'VIDEO_MUTED',



        MIC_TOGGLED: 'MIC_TOGGLED',



        CAMERA_TOGGLED: 'CAMERA_TOGGLED',



        CAMERA_SWITCHED: 'CAMERA_SWITCHED',



        SCREEN_SHARE_STARTED: 'SCREEN_SHARE_STARTED',



        SCREEN_SHARE_ENDED: 'SCREEN_SHARE_ENDED',



        



        MOOD_UPDATE: 'MOOD_UPDATE',



        INTENTION_UPDATE: 'INTENTION_UPDATE',



        REACTION: 'REACTION',



        



        DATA_SYNC_COMPLETE: 'DATA_SYNC_COMPLETE',



        CONTACTS_UPDATE: 'CONTACTS_UPDATE',



        CALL_HISTORY_UPDATE: 'CALL_HISTORY_UPDATE',



        



        REQUEST_TOKEN: 'REQUEST_TOKEN',



        TOKEN_RESPONSE: 'TOKEN_RESPONSE',



        TOKEN_UPDATE: 'TOKEN_UPDATE',



        



        IFRAME_READY: 'IFRAME_READY',



        IFRAME_STATE_CHANGE: 'IFRAME_STATE_CHANGE',



        IFRAME_SUSPENDED: 'IFRAME_SUSPENDED',



        IFRAME_ACTIVE: 'IFRAME_ACTIVE',



        IFRAME_DESTROYED: 'IFRAME_DESTROYED',



        



        NETWORK_RESTORED: 'NETWORK_RESTORED',



        NETWORK_LOST: 'NETWORK_LOST',



        



        USER_LOGGED_OUT: 'USER_LOGGED_OUT',



        USER_LOGGED_IN: 'USER_LOGGED_IN',



        



        NEW_MESSAGE: 'NEW_MESSAGE',



        FRIEND_UPDATE: 'FRIEND_UPDATE',



        GROUP_UPDATE: 'GROUP_UPDATE',



        STATUS_UPDATE: 'STATUS_UPDATE',



        SETTINGS_UPDATED: 'SETTINGS_UPDATED',



        



        STORAGE_GET: 'STORAGE_GET',



        STORAGE_SET: 'STORAGE_SET',



        STORAGE_REMOVE: 'STORAGE_REMOVE',



        STORAGE_CLEAR: 'STORAGE_CLEAR',



        STORAGE_RESULT: 'STORAGE_RESULT'



    };



    



    // ═══ Multi-Tab Call Conflict Prevention ═════════════════════════════════
    // Uses BroadcastChannel so only ONE tab handles calls at a time.
    // When another tab becomes the active call handler (leader), this tab
    // suppresses incoming call UI and defers all call operations.
    // ─────────────────────────────────────────────────────────────────────────
    var _tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var _isCallLeader = false;
    var _callBroadcast = null;
    var _callLeaderHeartbeatTimer = null;
    var _leaderTimestamp = 0;

    (function _initTabLeader() {
        try {
            if (typeof BroadcastChannel === 'undefined') {
                _isCallLeader = true; // Fallback: no BroadcastChannel, act as leader
                return;
            }
            _callBroadcast = new BroadcastChannel('kyn_call_tab_leader');

            _callBroadcast.onmessage = function(e) {
                var msg = e.data;
                if (!msg || !msg.type) return;
                if (msg.type === 'CALL_LEADER_CLAIM' && msg.tabId !== _tabId) {
                    // Another tab claimed leadership — yield
                    _isCallLeader = false;
                    clearInterval(_callLeaderHeartbeatTimer);
                } else if (msg.type === 'CALL_LEADER_HEARTBEAT' && msg.tabId !== _tabId) {
                    _leaderTimestamp = Date.now();
                    _isCallLeader = false;
                } else if (msg.type === 'CALL_LEADER_RELEASE' && msg.tabId !== _tabId) {
                    // Previous leader released — race to claim
                    _tryClaimLeader();
                } else if (msg.type === 'CALL_LEADER_QUERY') {
                    if (_isCallLeader) {
                        _callBroadcast.postMessage({ type: 'CALL_LEADER_HEARTBEAT', tabId: _tabId, ts: Date.now() });
                    }
                }
            };

            function _tryClaimLeader() {
                setTimeout(function() {
                    var now = Date.now();
                    if (now - _leaderTimestamp > 3000) { // No heartbeat for 3s → claim
                        _isCallLeader = true;
                        _callBroadcast.postMessage({ type: 'CALL_LEADER_CLAIM', tabId: _tabId, ts: now });
                        clearInterval(_callLeaderHeartbeatTimer);
                        _callLeaderHeartbeatTimer = setInterval(function() {
                            if (_isCallLeader && _callBroadcast) {
                                _callBroadcast.postMessage({ type: 'CALL_LEADER_HEARTBEAT', tabId: _tabId, ts: Date.now() });
                            }
                        }, 1500);
                    }
                }, Math.random() * 200); // Random jitter to avoid simultaneous claims
            }

            // Query for existing leader first
            _callBroadcast.postMessage({ type: 'CALL_LEADER_QUERY', tabId: _tabId });
            setTimeout(function() {
                if (!_isCallLeader && (Date.now() - _leaderTimestamp > 2000)) {
                    _tryClaimLeader();
                }
            }, 500);

            // Release leader on tab close
            window.addEventListener('beforeunload', function() {
                if (_isCallLeader && _callBroadcast) {
                    _callBroadcast.postMessage({ type: 'CALL_LEADER_RELEASE', tabId: _tabId });
                }
                if (_callBroadcast) { try { _callBroadcast.close(); } catch(_) {} }
            });

        } catch(err) {
            _isCallLeader = true; // Fail-open: always be leader if BroadcastChannel errors
        }
    })();

    // Helper: should this tab handle a call event?
    function _isActiveCallTab() { return _isCallLeader; }

/**
 * PART 4/8 — TRANSPORT & SIGNALING
 * Configuration, environment detection, helpers, origin security, safe storage, message registry, iframe transport layer, and the real call-signaling message handlers that ride on top of it.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
    // ==================== CONFIGURATION ====================



    const CONFIG = {



        VERSION: '9.0.4',



        PROTOCOL_VERSION: 'KYN-9.0',

        // FIX: Centralised audio constraints used by ALL call paths (caller + callee + reconnect).
        // Previously callee used plain `audio: true` which skips echo cancellation on many devices,
        // causing echo feedback and occasional null audio tracks on Android WebView.
        AUDIO_CONSTRAINTS: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl:  true,
            sampleRate:       48000,
            channelCount:     1,
        },

        


        PARENT_READY_TIMEOUT: 20000,



        REGISTRATION_TIMEOUT: 5000,



        



        MAX_REGISTRATION_ATTEMPTS: 1,



        MAX_CHILD_READY_ATTEMPTS: 1,



        MAX_SESSION_REQUESTS: 3,



        



        HEARTBEAT_ACK_TIMEOUT: 1000,



        



        ICE_RESTART_TIMEOUT: 5000,



        MAX_ICE_RESTARTS: 3,



        



        CALL_INVITATION_TIMEOUT: 180000,  // 3 minutes ring timeout



        // ✅ FIX: Raised from 15s → 45s. The WebSocket may take a few retries



        // to connect (exponential backoff). Giving it more time prevents the



        // "Connection timeout reached" teardown while the socket is still reconnecting.



        CALL_CONNECTION_TIMEOUT: 45000,



        



        STORAGE_PREFIX: 'calls_core_',



        



        TRUSTED_DOMAINS: [



            'moodchat-fy56.onrender.com',



            'moodfronted.onrender.com',



            'localhost',



            '127.0.0.1'



        ],



        



        MESSAGE_CACHE_MAX_SIZE: 1000,



        MESSAGE_CACHE_TTL: 30000,



        



        MAX_QUEUE_SIZE: 100,



        



        MAX_MESSAGES_PER_SECOND: 50,



        MESSAGE_WINDOW_MS: 1000,



        



        CHILD_READY_MAX_RETRIES: 1,



        CHILD_READY_RETRY_DELAY: 100



    };



    



    // ==================== ENVIRONMENT DETECTION ====================



    const ENVIRONMENT = {



        current: null,



        isDevelopment: false,



        isProduction: false,



        



        detect: function() {



            const hostname = window.location.hostname;



            



            if (hostname === 'localhost' || hostname === '127.0.0.1' || 



                hostname.startsWith('192.168.') || hostname.startsWith('10.')) {



                this.current = 'development';



                this.isDevelopment = true;



                this.isProduction = false;



            }



            else if (hostname.endsWith('.onrender.com')) {



                this.current = 'production';



                this.isDevelopment = false;



                this.isProduction = true;



            }



            else {



                this.current = 'production';



                this.isDevelopment = false;



                this.isProduction = true;



            }



            



            logInfo(MODULE, `Environment detected: ${this.current}`);



            return this;



        }



    };



    



    ENVIRONMENT.detect();



    



    // ==================== HELPER FUNCTIONS ====================



    function isValidOrigin(origin) {



        if (!origin) return true;



        // Relaxed during init - strict after activation



        if (typeof currentState !== 'undefined' && currentState !== LifecycleState.ACTIVE) return true;



        return CONFIG.TRUSTED_DOMAINS.some(domain => 



            origin.includes(domain) || origin === `http://${domain}` || origin === `https://${domain}`



        );



    }



    



    const processedMessages = new Set();



    



    function isDuplicate(id) {



        if (processedMessages.has(id)) return true;



        processedMessages.add(id);



        if (processedMessages.size > CONFIG.MESSAGE_CACHE_MAX_SIZE) {



            processedMessages.clear();



        }



        return false;



    }



    



    function validateMessage(msg) {



        return (



            msg &&



            typeof msg.type === 'string' &&



            (msg.source === undefined || typeof msg.source === 'string') &&



            (msg.messageId === undefined || typeof msg.messageId === 'string')



        );



    }



    



    // ==================== ORIGIN SECURITY ====================



    const OriginSecurity = {



        _trustedOrigins: new Set(),



        _trustedDomains: new Set(CONFIG.TRUSTED_DOMAINS),



        _strictMode: true,



        _cache: new Map(),



        



        initialize: function() {



            this._addTrustedOrigin(window.location.origin);



            try {



                if (window.parent && window.parent !== window && window.parent.location) {



                    this._addTrustedOrigin(window.parent.location.origin);



                }



            } catch (e) {}



            



            CONFIG.TRUSTED_DOMAINS.forEach(domain => {



                if (domain.includes('.')) this._trustedDomains.add(domain);



            });



            



            logReady(MODULE, 'OriginSecurity initialized');



            return this;



        },



        



        _addTrustedOrigin: function(origin) {



            if (!origin) return;



            try {



                const url = new URL(origin);



                this._trustedOrigins.add(origin);



                



                const parts = url.hostname.split('.');



                if (parts.length > 2) {



                    const domain = parts.slice(-2).join('.');



                    this._trustedDomains.add(domain);



                }



            } catch (e) {}



        },



        



        isTrusted: function(origin) {



            if (!origin) return false;



            if (this._cache.has(origin)) return this._cache.get(origin);



            



            let trusted = false;



            



            if (this._trustedOrigins.has(origin)) trusted = true;



            



            if (!trusted) {



                try {



                    const url = new URL(origin);



                    const hostname = url.hostname;



                    



                    for (const domain of this._trustedDomains) {



                        if (hostname === domain || hostname.endsWith('.' + domain)) {



                            trusted = true;



                            break;



                        }



                    }



                } catch (e) {}



            }



            



            this._cache.set(origin, trusted);



            setTimeout(() => this._cache.delete(origin), 60000);



            return trusted;



        },



        



        validateEvent: function(event) {



            if (!event || !event.origin) return false;



            // Relaxed during init



            if (typeof currentState !== 'undefined' && currentState !== LifecycleState.ACTIVE) return true;



            return this.isTrusted(event.origin);



        },



        



        lockParentOrigin: function(origin) {



            if (!callsState.parentOriginLocked && origin) {



                callsState.parentOrigin = origin;



                callsState.parentOriginLocked = true;



                logInfo(MODULE, 'Parent origin locked', { origin });



            }



        },



        



        getTargetOrigin: function() {



            if (callsState.parentOriginLocked && callsState.parentOrigin) {



                return callsState.parentOrigin;



            }



            try {



                if (window.parent && window.parent.location) {



                    return window.parent.location.origin;



                }



            } catch (e) {}



            return '*';



        },



        



        getMode: function() {



            return {



                strictMode: this._strictMode,



                trustedOrigins: this._trustedOrigins.size,



                trustedDomains: this._trustedDomains.size,



                parentLocked: callsState.parentOriginLocked



            };



        }



    };



    



    OriginSecurity.initialize();



    



    // ==================== SAFE STORAGE (SANDBOX-COMPLIANT) ====================



    // CRITICAL: No direct localStorage access in sandboxed iframe



    // NOTE: Storage is ONLY for UI preferences, NEVER for call state



    const SafeStorage = {



        _memory: new Map(),



        _strategy: 'proxy',



        _available: true,



        



        initialize: function() {



            logReady(MODULE, `SafeStorage initialized (${this._strategy})`);



            return this;



        },



        



        get: async function(key, fallback = null) {



            // CRITICAL: Never store or retrieve call state from storage



            if (key === 'session' || key.includes('token') || key.includes('call')) {



                console.warn(`[${MODULE}] SafeStorage.get('${key}') blocked - use session/call from memory only`);



                return fallback;



            }



            



            const fullKey = CONFIG.STORAGE_PREFIX + key;



            



            try {



                // Use StorageProxy for sandbox-compliant storage



                const value = await StorageProxy.get(fullKey);



                return value !== null ? this._deserialize(value) : fallback;



            } catch (e) {



                console.warn(`[${MODULE}] SafeStorage.get failed for ${key}:`, e);



                return fallback;



            }



        },



        



        set: function(key, value) {



            // CRITICAL: Never store call state to storage



            if (key === 'session' || key.includes('token') || key.includes('call')) {



                console.warn(`[${MODULE}] SafeStorage.set('${key}') blocked - use session/call from memory only`);



                return false;



            }



            



            const fullKey = CONFIG.STORAGE_PREFIX + key;



            const serialized = this._serialize(value);



            



            try {



                StorageProxy.set(fullKey, serialized);



                return true;



            } catch (e) {



                console.warn(`[${MODULE}] SafeStorage.set failed for ${key}:`, e);



                return false;



            }



        },



        



        remove: function(key) {



            const fullKey = CONFIG.STORAGE_PREFIX + key;



            try {



                StorageProxy.remove(fullKey);



                return true;



            } catch (e) {



                console.warn(`[${MODULE}] SafeStorage.remove failed for ${key}:`, e);



                return false;



            }



        },



        



        clear: function() {



            try {



                StorageProxy.clear();



                this._memory.clear();



                return true;



            } catch (e) {



                console.warn(`[${MODULE}] SafeStorage.clear failed:`, e);



                return false;



            }



        },



        



        _serialize: function(value) {



            if (value === undefined) return 'undefined';



            if (value === null) return 'null';



            try {



                return JSON.stringify(value);



            } catch (e) {



                return String(value);



            }



        },



        



        _deserialize: function(str) {



            if (str === 'undefined') return undefined;



            if (str === 'null') return null;



            try {



                return JSON.parse(str);



            } catch (e) {



                return str;



            }



        },



        



        getStrategy: function() { return this._strategy; },



        isAvailable: function() { return this._available; }



    };



    



    SafeStorage.initialize();



    



    // ==================== MESSAGE REGISTRY ====================



    const MessageRegistry = {



        _pendingMessages: new Map(),



        _processedMessages: new Set(),



        _ackTimeout: 3000,



        _cleanupTimer: null,



        _messageRateCounter: 0,



        _messageRateResetTimer: null,



        



        initialize: function() {



            this._startCleanup();



            this._startRateLimiting();



            logReady(MODULE, 'MessageRegistry initialized');



            return this;



        },



        



        _startCleanup: function() {



            if (this._cleanupTimer) clearInterval(this._cleanupTimer);



            this._cleanupTimer = setInterval(() => this._cleanup(), 30000);



        },



        



        _startRateLimiting: function() {



            this._messageRateCounter = 0;



            if (this._messageRateResetTimer) clearInterval(this._messageRateResetTimer);



            this._messageRateResetTimer = setInterval(() => {



                this._messageRateCounter = 0;



            }, CONFIG.MESSAGE_WINDOW_MS);



        },



        



        _cleanup: function() {



            const now = Date.now();



            



            for (const [messageId, pending] of this._pendingMessages) {



                if (pending.expiry && pending.expiry < now) {



                    this._failWithReason(messageId, 'expired');



                } else if (pending.timeoutId && !pending.resolved) {



                    // Clean up timeout promises



                    clearTimeout(pending.timeoutId);



                    if (pending.resolve) {



                        pending.resolve({ success: false, reason: 'timeout', error: 'Request timeout' });



                        pending.resolved = true;



                    }



                    this._pendingMessages.delete(messageId);



                }



            }



            



            if (this._processedMessages.size > CONFIG.MESSAGE_CACHE_MAX_SIZE) {



                this._processedMessages.clear();



            }



            



            if (callsState.processedMessageIds.size > CONFIG.MESSAGE_CACHE_MAX_SIZE) {



                callsState.processedMessageIds.clear();



            }



        },



        



        register: function(messageId, type, options = {}) {



            if (this._processedMessages.has(messageId)) {



                return Promise.resolve({ success: true, cached: true });



            }



            



            if (this._messageRateCounter >= CONFIG.MAX_MESSAGES_PER_SECOND) {



                logWarn(MODULE, 'Message rate limit exceeded', { type, messageId });



                return Promise.reject(new Error('Rate limit exceeded'));



            }



            this._messageRateCounter++;



            



            for (const [id, pending] of this._pendingMessages) {



                if (pending.originalId === messageId || pending.options?.originalId === messageId) {



                    return pending.promise;



                }



            }



            



            const timeout = options.timeout || this._ackTimeout;



            



            let resolve, reject;



            const promise = new Promise((res, rej) => {



                resolve = res;



                reject = rej;



            });



            



            const timer = setTimeout(() => {



                this._failWithReason(messageId, 'timeout');



            }, timeout);



            



            this._pendingMessages.set(messageId, {



                type,



                resolve,



                reject,



                timer,



                expiry: Date.now() + timeout,



                options,



                originalId: messageId,



                promise,



                resolved: false



            });



            



            return promise;



        },



        



        acknowledge: function(messageId, payload = {}) {



            this._processedMessages.add(messageId);



            



            let pending = this._pendingMessages.get(messageId);



            



            if (!pending) {



                for (const [id, p] of this._pendingMessages.entries()) {



                    if (p.options && p.options.originalId === messageId) {



                        pending = p;



                        break;



                    }



                }



            }



            



            if (pending && !pending.resolved) {



                clearTimeout(pending.timer);



                pending.resolve(payload);



                pending.resolved = true;



                this._pendingMessages.delete(pending.originalId || messageId);



                return true;



            }



            



            return false;



        },



        



        _failWithReason: function(messageId, reason) {



            const pending = this._pendingMessages.get(messageId);



            if (!pending || pending.resolved) return;



            



            clearTimeout(pending.timer);



            pending.reject(new Error(`Message failed: ${reason}`));



            pending.resolved = true;



            this._pendingMessages.delete(messageId);



        },



        



        hasPending: function(messageId) {



            return this._pendingMessages.has(messageId);



        },



        



        getPendingCount: function() {



            return this._pendingMessages.size;



        },



        



        isProcessed: function(messageId) {



            return this._processedMessages.has(messageId) || 



                   callsState.processedMessageIds.has(messageId);



        },



        



        reset: function() {



            for (const [messageId, pending] of this._pendingMessages) {



                if (!pending.resolved) {



                    clearTimeout(pending.timer);



                    pending.reject(new Error('Registry reset'));



                    pending.resolved = true;



                }



            }



            this._pendingMessages.clear();



            this._processedMessages.clear();



        }



    };



    



    MessageRegistry.initialize();



    



    // ==================== IFRAME TRANSPORT ====================



    const IframeTransport = {



        _messageId: 0,



        _queue: [],



        _processing: false,



        _online: navigator.onLine,



        _listeners: new Set(),



        _targetOrigin: OriginSecurity.getTargetOrigin(),



        _sessionRequested: false,



        _sessionRequestTimer: null,



        _sessionActive: false,



        _messageHandler: null,



        _rateLimitCounter: 0,



        _rateLimitResetTimer: null,



        _initialized: false,



        



        initialize: function() {



            if (this._initialized) return this;



            this._setupMessageHandler();



            this._setupListeners();



            this._startRateLimiting();



            this._initialized = true;



            logReady(MODULE, 'IframeTransport initialized');



            return this;



        },



        



        _startRateLimiting: function() {



            this._rateLimitCounter = 0;



            if (this._rateLimitResetTimer) clearInterval(this._rateLimitResetTimer);



            this._rateLimitResetTimer = setInterval(() => {



                this._rateLimitCounter = 0;



            }, CONFIG.MESSAGE_WINDOW_MS);



        },



        



        _setupMessageHandler: function() {



            if (this._messageHandler) {



                window.removeEventListener('message', this._messageHandler);



            }



            



            this._messageHandler = (event) => {



                setTimeout(() => this.handleIncoming(event), 0);



            };



            



            window.addEventListener('message', this._messageHandler);



            



            logInfo(MODULE, 'Message handler installed');



        },



        



        _setupListeners: function() {




            window.addEventListener('online', () => {

                this._online = true;

                this._notifyListeners('online', {});

                logInfo(MODULE, 'Network online — attempting call recovery if active');

                // If a call is active, trigger ICE restart to recover the connection
                try {
                    // FIX: window.callsState was never actually exposed (always undefined),
                    // so this recovery path never ran. Use the real in-scope callsState.
                    var activeCallId = callsState && (callsState.activeCallId || callsState.serverCallId);
                    if (activeCallId) {
                        logInfo(MODULE, 'Triggering ICE restart after network recovery');
                        setTimeout(function() {
                            // FIX: window.__PeerConnectionManager is a separate, unpopulated
                            // shadow WebRTC engine (no real sessions registered in it) —
                            // calling it here was a silent no-op. WebRTCManager owns the
                            // actual live peer connection for this call; restart it directly.
                            try { WebRTCManager.handleIceFailure && WebRTCManager.handleIceFailure(); } catch(_e) {}
                        }, 800); // Short delay to let network stabilise
                    }
                } catch(_e) {}

            });




            



            window.addEventListener('offline', () => {



                this._online = false;



                this._notifyListeners('offline', {});



                logWarn(MODULE, 'Network offline');



            });



        },



        



        _generateMessageId: function() {



            return `${Date.now()}-${++this._messageId}-${Math.random().toString(36).substring(2, 9)}`;



        },



        



        _validateMessage: function(type, payload, options) {



            if (!this._canSend()) {



                return { valid: false, reason: 'cannot_send' };



            }



            



            if (this._rateLimitCounter >= CONFIG.MAX_MESSAGES_PER_SECOND) {



                logWarn(MODULE, 'Send rate limit exceeded', { type });



                return { valid: false, reason: 'rate_limit' };



            }



            



            return { valid: true };



        },



        



        _canSend: function() {



            const allowedStates = [



                LifecycleState.ACTIVE



            ];



            



            return allowedStates.includes(currentState) && 



                   this._online && 



                   window.parent && 



                   window.parent !== window;



        },



        



        send: function(type, payload = {}, options = {}) {



            return safeSend(type, payload, options.requireAck || false);



        },



        



        sendAction: function(action, payload = {}) {



            if (!assertActive(action)) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            return this.send('ACTION', {



                action: action,



                data: payload,



                timestamp: Date.now()



            }, { requireAck: false });



        },



        



        sendChildReady: function() {



            return sendChildReady();



        },



        



        requestSessionFromParent: function() {



            if (currentState === LifecycleState.ACTIVE) {



                SessionClient.requestSession();



            } else {



                console.warn(`[${MODULE_NAME}] Cannot request session - not ACTIVE (current: ${currentState})`);



            }



        },



        



        handleIncoming: function(event) {



            try {



                if (!OriginSecurity.validateEvent(event)) {



                    logWarn(MODULE, 'Invalid origin', { origin: event.origin });



                    return;



                }



                



                const message = event.data;



                



                if (!message || typeof message !== 'object') return;



                if (!validateMessage(message)) {



                    logWarn(MODULE, 'Invalid message format', message);



                    return;



                }



                



                // Use MessageGuard for deduplication



                if (message.messageId && MessageGuard.isDuplicate(message.messageId)) {



                    logInfo(MODULE, 'Duplicate message ignored', { messageId: message.messageId });



                    return;



                }



                



                if (message.source && message.source !== 'parent') {



                    return;



                }



                



                OriginSecurity.lockParentOrigin(event.origin);



                



                if (message.messageId) {



                    callsState.processedMessageIds.add(message.messageId);



                }



                



                // Handle storage responses



                if (StorageProxy.handleStorageResponse(event)) {



                    return;



                }



                



                // Handle session messages



                if (SessionClient.handleSessionMessage(event)) {



                    return;



                }



                



                // ==================== CRITICAL: PARENT_READY HANDLER ====================



                if (message.type === MESSAGE_TYPES.PARENT_READY) {



                    handleParentReady(message);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.ACK) {



                    const ackId = message.payload?.ackId || message.ackId || message.messageId;



                    if (ackId) {



                        MessageRegistry.acknowledge(ackId, message.payload);



                    }



                    return;



                }



                



                // Handle API_RESPONSE



                if (message.type === MESSAGE_TYPES.API_RESPONSE) {



                    const requestId = message.requestId || message.payload?.requestId;



                    if (requestId && MessageRegistry._pendingMessages.has(requestId)) {



                        const pending = MessageRegistry._pendingMessages.get(requestId);



                        if (pending && pending.resolve && !pending.resolved) {



                            clearTimeout(pending.timeoutId);



                            pending.resolve({



                                success: message.success !== false,



                                data: message.payload?.data || message.data,



                                error: message.payload?.error || message.error,



                                requestId: requestId



                            });



                            pending.resolved = true;



                            MessageRegistry._pendingMessages.delete(requestId);



                        }



                    }



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.HEARTBEAT) {



                    this._handleHeartbeat(message);



                    return;



                }



                



                if (message.type === 'MODULE_REGISTERED') {



                    this._handleModuleRegistered(message);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.SESSION_SYNC) {



                    this._handleSessionSync(message);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.MODULE_INIT_DATA) {



                    handleInitData(message);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.SESSION_RESPONSE || 



                    message.type === MESSAGE_TYPES.SESSION_DATA || 



                    message.type === MESSAGE_TYPES.SESSION_ACTIVE) {



                    



                    this._handleSessionMessage(message);



                    return;



                }



                



                if (message.type === 'SESSION_NULL') {



                    callsState.session = null;



                    callsState.token = null;



                    callsState.sessionReceived = false;



                    callsState.sessionStatus = 'invalid';



                    validSessionConfirmed = false;



                    this._sessionActive = false;



                    logSession(MODULE, 'SESSION_NULL received');



                    return;



                }



                



                if (message.type === 'VERIFY_RESPONSE' || message.type === 'SESSION_VERIFIED') {



    const requestId = message.requestId || message.payload?.requestId || message.messageId || message.id;



    const isValid = message.payload?.valid === true || message.valid === true;



    



    // Update state



    callsState.verified = isValid;



    callsState.verificationLock = false;



    



    // CRITICAL: Properly resolve the pending promise in MessageRegistry



    if (requestId && MessageRegistry._pendingMessages.has(requestId)) {



        const pending = MessageRegistry._pendingMessages.get(requestId);



        if (pending && pending.resolve && !pending.resolved) {



            clearTimeout(pending.timeoutId);



            pending.resolve({



                success: true,



                payload: { valid: isValid },



                result: { valid: isValid }



            });



            pending.resolved = true;



            MessageRegistry._pendingMessages.delete(requestId);



        }



    } else if (requestId) {



        // Fallback to acknowledge method



        MessageRegistry.acknowledge(requestId, { valid: isValid });



    }



    



    // Also update validSessionConfirmed if needed



    if (isValid && callsState.session) {



        validSessionConfirmed = true;



    }



    



    logInfo(MODULE, `VERIFY_RESPONSE received: ${isValid ? 'valid' : 'invalid'}`);



    return;



}



                



                // ==================== CALL SIGNALING HANDLERS (REAL) ====================



                // ── FIX: accept all naming variants from banner-bridge, ws-bridge, and direct WS ──



                if (message.type === MESSAGE_TYPES.CALL_INCOMING ||



                    message.type === 'CALL_INCOMING' ||



                    message.type === 'incoming_call' ||



                    message.type === 'call_incoming') {



                    console.log('[CallsCore] 📞 CALL_INCOMING message received, routing to handleIncomingCall');



                    handleIncomingCall(message.payload || message.data || message);



                    return;



                }



                



                // Bug 4: AUTO_ACCEPT_CALL sent by parent banner → accept the call



                if (message.type === 'AUTO_ACCEPT_CALL') {



                    const callId = (message.payload || {}).callId || callsState.activeCallId;



                    if (callId && window.callCore && window.callCore.answerCall) {



                        logCall(MODULE, 'AUTO_ACCEPT_CALL received from parent banner', { callId });



                        window.callCore.answerCall(callId).catch(e => {



                            logError(MODULE, 'AUTO_ACCEPT answerCall failed', e);



                        });



                    }



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.CALL_INITIATED) {



                    handleCallInitiated(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.CALL_ACCEPT) {



                    handleCallAccepted(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.CALL_STARTED) {



                    handleCallStarted(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.CALL_CONNECTED) {



                    handleCallConnected(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.CALL_REJECTED) {



                    handleCallRejected(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.CALL_ENDED) {



                    handleCallEnded(message.payload || message.data);



                    return;



                }



                



                // FIXED: Handle CALL_CANCELLED so cancelling immediately clears receiver UI



                if (message.type === 'CALL_CANCELLED' || message.type === 'call:cancelled' || message.type === 'call_cancelled') {



                    handleCallForceEnd(message.payload || message.data || {});



                    notifyListeners('call_cancelled', message.payload || message.data || {});



                    return;



                }



                



if (message.type === 'CALL_FORCE_END' || message.type === 'call:force_end') {



    handleCallForceEnd(message.payload || message.data);



    return;



}







if (message.type === MESSAGE_TYPES.CALL_FAILED) {



    handleCallFailed(message.payload || message.data);



    return;



}







                if (message.type === MESSAGE_TYPES.CALL_FAILED) {



                    handleCallFailed(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.CALL_TIMEOUT) {



                    handleCallTimeout(message.payload || message.data);



                    return;



                }



                



                // CALL_FORCE_ENDED: backend cleaned up a stale call, reset UI immediately



                if (message.type === 'CALL_FORCE_ENDED' || message.type === MESSAGE_TYPES.CALL_FORCE_ENDED) {



                    logWarn(MODULE, 'Received CALL_FORCE_ENDED — resetting call state', message.payload);



                    resetCallState();



                    callsState.callActive = false;



                    callsState.callState = 'idle';



                    callsState.activeCallId = null;



                    callsState.serverCallId = null;



                    callsState.callData = null;



                    if (CallsStateGovernor) {



                        CallsStateGovernor._transitionLock = false;



                        CallsStateGovernor._currentState = CALLS_STATE.ACTIVE;



                    }



                    notifyListeners('call_force_ended', message.payload || {});



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.CALL_BUSY) {



                    handleCallBusy(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.CALL_INITIATED_ACK) {

                    handleCallInitiatedAck(message.payload || message.data);

                    return;

                }

                // WebRTC Signaling (real)



                if (message.type === MESSAGE_TYPES.SIGNAL_OFFER) {



                    handleSignalOffer(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.SIGNAL_ANSWER) {



                    handleSignalAnswer(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.ICE_CANDIDATE) {



                    handleIceCandidate(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.REMOTE_STREAM_ADDED) {



                    handleRemoteStreamAdded(message.payload || message.data);



                    return;



                }



                



                if (message.type === MESSAGE_TYPES.REMOTE_STREAM_REMOVED) {



                    handleRemoteStreamRemoved(message.payload || message.data);



                    return;



                }



                



                if (message.type === 'FRIEND_UPDATE' || message.type === 'CONTACTS_UPDATE') {



                    notifyListeners('contacts_update', message.payload || message.data);



                    return;



                }



                



                if (message.type === 'CALL_HISTORY_UPDATE') {



                    notifyListeners('call_history_update', message.payload || message.data);



                    return;



                }



                



                // ── OFFLINE-FIRST: Apply per-key setting changes immediately ──



if (message.type === 'SETTING_CHANGED' || message.type === 'SETTINGS_UPDATED') {



    const data = message.payload || message.data || {};







    if (message.type === 'SETTING_CHANGED' && data.section && data.key !== undefined) {



        const { section, key, value } = data;



        applySettingToCallsModule(section, key, value);



        // Keep premium feature updates



        if (data.premium !== undefined) callsState.isPremium = data.premium;



        if (data.premiumFeatures) callsState.premiumFeatures = { ...callsState.premiumFeatures, ...data.premiumFeatures };



        window.dispatchEvent(new CustomEvent('settingChanged', { detail: { section, key, value, timestamp: Date.now() } }));



        notifyListeners('setting_changed', { section, key, value });



        return;



    }







    if (message.type === 'SETTINGS_UPDATED' && data.settings) {



        const s = data.settings;



        Object.entries(s).forEach(([sec, secVal]) => {



            if (secVal && typeof secVal === 'object')



                Object.entries(secVal).forEach(([k, v]) => applySettingToCallsModule(sec, k, v));



        });



        if (s.premium !== undefined) callsState.isPremium = s.premium;



        if (s.premiumFeatures) callsState.premiumFeatures = { ...callsState.premiumFeatures, ...s.premiumFeatures };



        window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: { settings: s, timestamp: Date.now() } }));



        notifyListeners('settings_update', s);



        return;



    }



    return;



}







                if (message.type === 'USER_LOGGED_OUT') {



                    // Clean up call state on logout



                    resetCallState();



                    callsState.session = null;



                    callsState.token = null;



                    callsState.verified = false;



                    callsState.sessionReceived = false;



                    callsState.sessionStatus = 'invalid';



                    validSessionConfirmed = false;



                    this._sessionActive = false;



                    notifyListeners('logout', {});



                    return;



                }



                



                if (message.type === 'SESSION_REFRESHED') {



                    if ((message.payload || message.data) && (message.payload || message.data).token) {



                        const data = message.payload || message.data;



                        // Only update token if we have a valid session



                        if (validSessionConfirmed && callsState.session && __isValidSession(callsState.session)) {



                            callsState.token = data.token;



                            if (callsState.session) {



                                callsState.session.token = data.token;



                            }



                        }



                    }



                    return;



                }



                



                if (message.type === 'SESSION_INVALIDATED') {



                    resetCallState();



                    callsState.session = null;



                    callsState.token = null;



                    callsState.sessionReceived = false;



                    callsState.sessionStatus = 'invalid';



                    validSessionConfirmed = false;



                    this._sessionActive = false;



                    return;



                }



                



                if (message.type === 'NEW_MESSAGE' && (message.payload || message.data)) {



                    notifyListeners('new_message', message.payload || message.data);



                    return;



                }



                



                if (message.type === 'STATUS_UPDATE' && (message.payload || message.data)) {



                    notifyListeners('status_update', message.payload || message.data);



                    return;



                }



                



                if (message.type === 'GROUP_UPDATE' && (message.payload || message.data)) {



                    notifyListeners('group_update', message.payload || message.data);



                    return;



                }



                



                this._notifyListeners('received', { type: message.type, data: message });



            } catch (error) {



                logError(MODULE, 'Error handling incoming message', error);



            }



        },



        



        _handleHeartbeat: function(message) {



            if (!assertActive('HEARTBEAT')) return;



            



            logHeartbeat(MODULE, 'Heartbeat received from parent');



            



            safeSend('HEARTBEAT_ACK', {



                ackId: message.messageId,



                module: MODULE_NAME,



                timestamp: Date.now()



            });



        },



        



        _handleModuleRegistered: function(message) {



            if (callsState.registered) {



                logInfo(MODULE, 'Already registered, ignoring duplicate');



                return;



            }



            



            logSuccess(MODULE, 'MODULE_REGISTERED received');



            callsState.registered = true;



            



            if (message.expectAck) {



                safeSend('ACK', {



                    ackId: message.messageId



                }, false).catch(() => {});



            }



            



            if (currentState === LifecycleState.ACTIVE) {



                setTimeout(() => {



                    SessionClient.requestSession();



                }, 100);



            }



        },



        



        _handleSessionSync: function(message) {



            const sessionData = message.payload || message.data || {};



            



            logSession(MODULE, 'SESSION_SYNC received', {



                hasToken: !!(sessionData.token || sessionData.jwt)



            });



            



            const token = sessionData.token || sessionData.jwt || sessionData.accessToken;



            if (token) {



                const candidateSession = {



                    token: token,



                    user: sessionData.user || { id: sessionData.userId },



                    userId: sessionData.userId || sessionData.user?.id,



                    expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),



                    authenticated: sessionData.authenticated !== false



                };



                



                // CRITICAL: Validate session before applying



                if (!__isValidSession(candidateSession)) {



                    console.warn(`[${MODULE}] SESSION_SYNC rejected - invalid session data`);



                    return;



                }



                



                callsState.session = candidateSession;



                callsState.token = token;



                callsState.sessionStatus = 'valid';



                callsState.sessionReceived = true;



                validSessionConfirmed = true;



                this._sessionActive = true;



                



                safeSend('SESSION_ACK', {



                    status: 'synced',



                    timestamp: Date.now()



                }, false).catch(() => {});



                



                window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {



                    detail: { core: window.callCore, timestamp: Date.now() }



                }));



                



                window.dispatchEvent(new CustomEvent('MODULE_READY', {



                    detail: { module: MODULE_NAME, timestamp: Date.now() }



                }));



            }



        },



        



      _handleSessionMessage: function(message) {



    this._sessionRequested = false;



    if (this._sessionRequestTimer) {



        clearTimeout(this._sessionRequestTimer);



        this._sessionRequestTimer = null;



    }



    



    const requestId = message.requestId || message.payload?.requestId || message.id;



    if (requestId) {



        MessageRegistry.acknowledge(requestId, message.payload);



    }



    



    // CRITICAL FIX: Extract session data from all possible locations



    let sessionData = message.payload || message.data || message;



    



    // If sessionData has a 'session' property, use that (some messages wrap it)



    if (sessionData.session) {



        sessionData = sessionData.session;



    }



    



    // If sessionData has a 'payload' property with session, use that



    if (sessionData.payload && sessionData.payload.session) {



        sessionData = sessionData.payload.session;



    }



    



    logSession(MODULE, 'Session message received from parent', { 



        hasToken: !!(sessionData.token || sessionData.jwt || sessionData.accessToken),



        hasRootUserId: !!sessionData.userId,



        hasUserIdInUser: !!(sessionData.user && (sessionData.user.id || sessionData.user.userId)),



        sessionDataKeys: Object.keys(sessionData)



    });



    



    const token = sessionData.token || sessionData.jwt || sessionData.accessToken;



    if (token) {



        // CRITICAL: Extract userId from various possible locations



        let userId = sessionData.userId;



        if (!userId && sessionData.user) {



            userId = sessionData.user.id || sessionData.user.userId;



        }



        if (!userId && sessionData.userData) {



            userId = sessionData.userData.id || sessionData.userData.userId;



        }



        if (!userId && sessionData.id && typeof sessionData.id === 'number') {



            userId = sessionData.id;



        }



        



        // Log what we found



        console.log(`[${MODULE_NAME}][_handleSessionMessage] Extracted userId:`, userId);



        



        const candidateSession = {



            token: token,



            user: sessionData.user || { id: userId, userId: userId },



            userId: userId,



            expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),



            authenticated: sessionData.authenticated !== false,



            sessionId: sessionData.sessionId || sessionData.id || Date.now()



        };



        



        // CRITICAL: Validate session before applying



        if (!__isValidSession(candidateSession)) {



            console.warn(`[${MODULE_NAME}][LIFECYCLE] Session message rejected - invalid session data`, {



                hasToken: !!candidateSession.token,



                userId: candidateSession.userId,



                authenticated: candidateSession.authenticated,



                rawUserId: userId,



                sessionDataKeys: Object.keys(sessionData)



            });



            return;



        }



        



        // IMMUTABLE SESSION PROTECTION



        if (callsState.session && __isValidSession(callsState.session)) {



            if (!__isValidSession(candidateSession)) {



                console.warn(`[${MODULE_NAME}][LIFECYCLE] Prevented session downgrade`);



                return;



            }



        }



        



        // Session deduplication



        const sessionId = candidateSession.sessionId;



        if (sessionId && callsState.lastSessionId === sessionId) {



            logInfo(MODULE, 'Duplicate session message ignored', { sessionId });



            return;



        }



        



        if (sessionId) {



            callsState.lastSessionId = sessionId;



        }



        



        callsState.session = candidateSession;



        callsState.token = token;



        callsState.sessionStatus = 'valid';



        callsState.sessionReceived = true;



        validSessionConfirmed = true;



        



        logSession(MODULE, 'Session activated', { 



            authenticated: candidateSession.authenticated,



            userId: candidateSession.userId,



            sessionId: candidateSession.sessionId



        });



        



        // If we're in WAIT_PARENT and have parent ready, transition to ACTIVE



        if (currentState === LifecycleState.WAIT_PARENT && parentReadyReceived) {



            transitionTo(LifecycleState.ACTIVE, 'session_received_after_parent_ready');



            flushQueue();



            onModuleActive();



            console.log(`[${MODULE_NAME}][LIFECYCLE] ✅ Module activated after valid session received`);



        }



        



        window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {



            detail: { core: window.callCore, timestamp: Date.now() }



        }));



        



        window.dispatchEvent(new CustomEvent('MODULE_READY', {



            detail: { module: MODULE_NAME, timestamp: Date.now() }



        }));



    }



},







        _processQueue: function() {



            if (this._processing) return;



            if (this._queue.length === 0) return;



            



            this._processing = true;



            



            const now = Date.now();



            const validQueue = this._queue.filter(item => {



                return now - item.timestamp < 30000;



            });



            



            this._queue = [];



            



            validQueue.forEach(item => {



                this.send(item.type, item.payload, item.options)



                    .then(item.resolve)



                    .catch(item.reject);



            });



            



            this._processing = false;



        },



        



        addListener: function(listener) {



            if (typeof listener === 'function') this._listeners.add(listener);



        },



        



        removeListener: function(listener) {



            this._listeners.delete(listener);



        },



        



        _notifyListeners: function(event, data) {



            this._listeners.forEach(listener => {



                try { listener(event, data); } catch (e) {}



            });



        },



        



        getStatus: function() {



            return {



                online: this._online,



                queueSize: this._queue.length,



                pendingAcks: MessageRegistry.getPendingCount(),



                targetOrigin: this._targetOrigin,



                sessionRequested: this._sessionRequested,



                sessionActive: this._sessionActive,



                rateLimitCounter: this._rateLimitCounter,



                parentReady: parentReady,



                messageQueueSize: messageQueue.length



            };



        },



        



        cleanup: function() {



            if (this._sessionRequestTimer) {



                clearTimeout(this._sessionRequestTimer);



                this._sessionRequestTimer = null;



            }



            if (this._rateLimitResetTimer) {



                clearInterval(this._rateLimitResetTimer);



                this._rateLimitResetTimer = null;



            }



            if (this._messageHandler) {



                window.removeEventListener('message', this._messageHandler);



                this._messageHandler = null;



            }



            this._queue = [];



            messageQueue.length = 0;



            MessageRegistry.reset();



            this._listeners.clear();



            this._initialized = false;



        }



    };



    



    IframeTransport.initialize();



    



/**
 * PART 5/8 — MEDIA & WEBRTC
 * Permission manager, media manager, the real WebRTC manager, and single-active-call enforcement.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
    // ==================== PERMISSION MANAGER ====================



    const PermissionManager = {



        checkPermissions: async function(required = { audio: true, video: false }) {



            try {



                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {



                    return { 



                        success: false, 



                        error: 'Media devices not supported',



                        permissions: { audio: false, video: false }



                    };



                }



                



                const devices = await navigator.mediaDevices.enumerateDevices();



                



                const hasAudioInput = devices.some(d => d.kind === 'audioinput');



                const hasVideoInput = devices.some(d => d.kind === 'videoinput');



                



                if (required.audio && !hasAudioInput) {



                    return { 



                        success: false, 



                        error: 'No microphone found',



                        permissions: { audio: false, video: hasVideoInput }



                    };



                }



                



                if (required.video && !hasVideoInput) {



                    return { 



                        success: false, 



                        error: 'No camera found',



                        permissions: { audio: hasAudioInput, video: false }



                    };



                }



                



                if (required.audio || required.video) {



                    try {



                        const testStream = await navigator.mediaDevices.getUserMedia({



                            audio: required.audio,



                            video: required.video



                        });



                        



                        testStream.getTracks().forEach(track => track.stop());



                        



                        return { 



                            success: true, 



                            permissions: { 



                                audio: required.audio, 



                                video: required.video 



                            }



                        };



                    } catch (permError) {



                        let errorMessage = 'Permission denied';



                        if (permError.name === 'NotAllowedError') {



                            errorMessage = 'Microphone or camera access denied';



                        } else if (permError.name === 'NotFoundError') {



                            errorMessage = 'Required device not found';



                        }



                        



                        return { 



                            success: false, 



                            error: errorMessage,



                            permissions: { audio: false, video: false }



                        };



                    }



                }



                



                return { 



                    success: true, 



                    permissions: { audio: hasAudioInput, video: hasVideoInput }



                };



                



            } catch (error) {



                logError(MODULE, 'Permission check failed', error);



                return { 



                    success: false, 



                    error: error.message,



                    permissions: { audio: false, video: false }



                };



            }



        },



        



        requestPermissions: async function(required = { audio: true, video: false }) {



            try {



                const stream = await navigator.mediaDevices.getUserMedia(required);



                stream.getTracks().forEach(track => track.stop());



                return { success: true };



            } catch (error) {



                return { 



                    success: false, 



                    error: error.message 



                };



            }



        }



    };



    



    // ==================== MEDIA MANAGER ====================



    const MediaManager = {



        _stream: null,



        _audioTracks: [],



        _videoTracks: [],



        _listeners: new Set(),



        _deviceCheckDone: false,



        _initialized: false,



        



        initialize: async function() {



            if (this._initialized) return { success: true };



            



            try {



                logInfo(MODULE, 'Initializing media manager');



                



                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {



                    logWarn(MODULE, 'Media devices not fully supported');



                    return { success: false, error: 'Media devices not supported' };



                }



                



                this._initialized = true;



                return { success: true, deferred: true };



                



            } catch (error) {



                logError(MODULE, 'Media manager initialization failed', error);



                return { success: false, error: error.message };



            }



        },



        



        enumerateDevices: async function() {



            try {



                const devices = await navigator.mediaDevices.enumerateDevices();



                



                callsState.mediaDevices = {



                    audioInput: devices.filter(d => d.kind === 'audioinput'),



                    videoInput: devices.filter(d => d.kind === 'videoinput'),



                    audioOutput: devices.filter(d => d.kind === 'audiooutput')



                };



                



                this._deviceCheckDone = true;



                



                logSuccess(MODULE, 'Media devices enumerated', {



                    audioInput: callsState.mediaDevices.audioInput.length,



                    videoInput: callsState.mediaDevices.videoInput.length



                });



                



                return { success: true, devices: callsState.mediaDevices };



            } catch (error) {



                logError(MODULE, 'Device enumeration failed', error);



                return { success: false, error: error.message };



            }



        },



        



        getLocalStream: async function(constraints = { audio: true, video: false }) {



            try {



                logInfo(MODULE, 'Getting local media stream', constraints);



                



                if (!this._deviceCheckDone) {



                    await this.enumerateDevices();



                }



                



                this.stopLocalStream();



                



                const stream = await navigator.mediaDevices.getUserMedia(constraints);



                



                this._stream = stream;



                this._audioTracks = stream.getAudioTracks();



                this._videoTracks = stream.getVideoTracks();



                



                callsState.localStream = stream;



                callsState.micEnabled = this._audioTracks.length > 0;



                callsState.cameraEnabled = this._videoTracks.length > 0;



                



                logSuccess(MODULE, 'Local media stream acquired', {



                    audio: this._audioTracks.length > 0,



                    video: this._videoTracks.length > 0



                });



                



                this._notifyListeners('local_stream_ready', { stream });



                



                return { success: true, stream };



                



            } catch (error) {



                logError(MODULE, 'Failed to get local media stream', error);



                



                let errorMessage = 'Could not access media devices';



                if (error.name === 'NotAllowedError') {



                    errorMessage = 'Microphone or camera access denied';



                } else if (error.name === 'NotFoundError') {



                    errorMessage = 'Required device not found';



                } else if (error.name === 'NotReadableError') {



                    errorMessage = 'Device in use by another application';



                }



                



                this._notifyListeners('stream_error', { error: errorMessage });



                



                return { success: false, error: errorMessage };



            }



        },



        



        toggleMic: function(enabled) {



            if (this._audioTracks.length === 0) {



                logWarn(MODULE, 'No audio tracks to toggle');



                return false;



            }



            



            try {



                this._audioTracks.forEach(track => {



                    track.enabled = enabled;



                });



                



                callsState.micEnabled = enabled;



                



                logInfo(MODULE, `Microphone ${enabled ? 'enabled' : 'disabled'}`);



                this._notifyListeners('mic_toggled', { enabled });



                



                return true;



                



            } catch (error) {



                logError(MODULE, 'Failed to toggle microphone', error);



                return false;



            }



        },



        



        toggleCamera: function(enabled) {



            if (this._videoTracks.length === 0) {



                logWarn(MODULE, 'No video tracks to toggle');



                return false;



            }



            



            try {



                this._videoTracks.forEach(track => {



                    track.enabled = enabled;



                });



                



                callsState.cameraEnabled = enabled;



                



                logInfo(MODULE, `Camera ${enabled ? 'enabled' : 'disabled'}`);



                this._notifyListeners('camera_toggled', { enabled });



                



                return true;



                



            } catch (error) {



                logError(MODULE, 'Failed to toggle camera', error);



                return false;



            }



        },



        



        switchCamera: async function() {



            if (this._videoTracks.length === 0) {



                logWarn(MODULE, 'No video tracks to switch');



                return { success: false, error: 'No video tracks' };



            }



            



            try {



                const newMode = callsState.cameraFacingMode === 'user' ? 'environment' : 'user';



                



                const currentConstraints = {



                    audio: this._audioTracks.length > 0,



                    video: {



                        facingMode: newMode,



                        width: { ideal: 1280 },



                        height: { ideal: 720 }



                    }



                };



                



                this._videoTracks.forEach(track => track.stop());



                



                const newStream = await navigator.mediaDevices.getUserMedia(currentConstraints);



                const newVideoTracks = newStream.getVideoTracks();



                



                if (this._stream) {



                    this._videoTracks.forEach(track => {



                        this._stream.removeTrack(track);



                    });



                    



                    newVideoTracks.forEach(track => {



                        this._stream.addTrack(track);



                    });



                }



                



                this._videoTracks = newVideoTracks;



                callsState.cameraFacingMode = newMode;



                



                logSuccess(MODULE, `Camera switched to ${newMode} mode`);



                this._notifyListeners('camera_switched', { facingMode: newMode });



                



                // FIX-CAMERA-SWITCH-FROZEN-REMOTE: return the new track itself.
                // Previously this only updated the LOCAL stream/preview -- nothing
                // ever called sender.replaceTrack() on the active RTCPeerConnection,
                // so after switching cameras the remote party kept receiving the
                // last frame from the old (now-stopped) camera track for the rest
                // of the call. Returning it here lets the caller push it to the
                // real peer connection (see window.callsCoreReplaceVideoTrack below).
                return { success: true, facingMode: newMode, track: newVideoTracks[0] || null };



                



            } catch (error) {



                logError(MODULE, 'Failed to switch camera', error);



                return { success: false, error: error.message };



            }



        },



        



        startScreenShare: async function() {



            try {



                if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {



                    return { success: false, error: 'Screen sharing not supported' };



                }



                



                const screenStream = await navigator.mediaDevices.getDisplayMedia({



                    video: true,



                    audio: true



                });



                



                callsState.screenSharing = true;

                // FIX-SCREENSHARE-NEVER-SENT: previously this just captured the
                // screen and returned it -- nothing ever pushed the screen track
                // to the peer connection's video sender, so the remote party
                // never saw the shared screen at all, only the local preview.
                // Store the screen stream/track and the camera track being
                // replaced so stopScreenShare() can properly release the
                // capture AND revert the sender back to the camera.
                this._screenStream = screenStream;
                var screenTrack = screenStream.getVideoTracks()[0] || null;
                this._preShareCameraTrack = (this._videoTracks && this._videoTracks[0]) || null;

                // If the user stops sharing via the browser's own "Stop sharing"
                // control (not our button), react the same way our stopScreenShare
                // button does: release the capture and revert to camera.
                if (screenTrack) {
                    screenTrack.addEventListener('ended', () => {
                        if (callsState.screenSharing) {
                            MediaManager.stopScreenShare();
                            if (typeof window.callsCoreReplaceVideoTrack === 'function' && this._preShareCameraTrack) {
                                window.callsCoreReplaceVideoTrack(this._preShareCameraTrack);
                            }
                            this._notifyListeners('screen_share_ended', {});
                        }
                    });
                }

                this._notifyListeners('screen_share_started', { stream: screenStream });

                return { success: true, stream: screenStream, track: screenTrack };



                



            } catch (error) {



                logError(MODULE, 'Failed to start screen share', error);



                return { success: false, error: error.message };



            }



        },



        



        stopScreenShare: function() {

            callsState.screenSharing = false;

            // FIX-SCREENSHARE-NEVER-SENT: previously this never actually
            // stopped the getDisplayMedia capture tracks -- the browser's
            // screen-sharing indicator/capture kept running in the background
            // indefinitely after "stopping" screen share. Now release it, and
            // hand back the camera track that was active before sharing
            // started so the caller can revert the peer connection's sender.
            var revertTrack = this._preShareCameraTrack || null;
            if (this._screenStream) {
                this._screenStream.getTracks().forEach(function(t) { try { t.stop(); } catch (_) {} });
                this._screenStream = null;
            }
            this._preShareCameraTrack = null;

            this._notifyListeners('screen_share_ended', {});

            return { success: true, revertTrack: revertTrack };

        },



        



        stopLocalStream: function() {



            if (this._stream) {



                this._stream.getTracks().forEach(track => {



                    track.stop();



                });



                this._stream = null;



                this._audioTracks = [];



                this._videoTracks = [];



                



                callsState.localStream = null;



                callsState.micEnabled = true;



                callsState.cameraEnabled = false;



                callsState.screenSharing = false;



                



                logInfo(MODULE, 'Local stream stopped');



                this._notifyListeners('local_stream_stopped', {});



            }



        },



        



        addListener: function(listener) {



            if (typeof listener === 'function') this._listeners.add(listener);



        },



        



        removeListener: function(listener) {



            this._listeners.delete(listener);



        },



        



        _notifyListeners: function(event, data) {



            this._listeners.forEach(listener => {



                try { listener(event, data); } catch (e) {}



            });



        },



        



        getStatus: function() {



            return {



                hasStream: !!this._stream,



                audioTracks: this._audioTracks.length,



                videoTracks: this._videoTracks.length,



                micEnabled: callsState.micEnabled,



                cameraEnabled: callsState.cameraEnabled,



                cameraFacingMode: callsState.cameraFacingMode,



                screenSharing: callsState.screenSharing,



                devices: callsState.mediaDevices,



                deviceCheckDone: this._deviceCheckDone,



                initialized: this._initialized



            };



        }



    };



    



    MediaManager.initialize().catch(error => {



        logError(MODULE, 'Media manager initialization failed', error);



    });



    



    // ==================== WEBRTC MANAGER (REAL) ====================



    const WebRTCManager = {



        _peerConnection: null,



        _iceCandidates: [],



        _iceRestartCount: 0,



        _remoteStreams: new Map(),



        _dataChannel: null,



        _listeners: new Set(),



        _currentCallId: null,



        _connectionTimeout: null,



        _initialized: false,



        



        initialize: function() {



            if (this._initialized) return;



            this._initialized = true;



            logInfo(MODULE, 'WebRTC manager initialized');



        },



        



        createPeerConnection: function(config = {}) {



            try {




                // FIX-SINGLE-SESSION-AUTHORITY (Phase 15): this used to
                // unconditionally create a fresh RTCPeerConnection every time
                // it was called, with no check for an existing one -- the
                // single choke point all peer-connection creation flows
                // through had zero protection against being invoked twice
                // for the same call (a rapid double-tap on Accept before
                // callActive flips true, or the dual accept-listener-pipeline
                // race documented elsewhere in this file for
                // handleCallAccepted). Each duplicate call silently orphaned
                // the previous RTCPeerConnection -- never closed, its ICE
                // gathering and any acquired media continuing to run in the
                // background -- while this._peerConnection got overwritten
                // with a second, competing connection. For the same call,
                // there must be exactly one. If a live, non-terminal
                // connection already exists, return it instead of creating
                // a second one. If the existing one is already
                // closed/failed, close it explicitly first (belt-and-suspenders
                // against any listener/reference still expecting a close
                // event) before creating the real replacement.
                if (this._peerConnection) {
                    var _existingState = this._peerConnection.connectionState || this._peerConnection.iceConnectionState;
                    if (_existingState && _existingState !== 'closed' && _existingState !== 'failed') {
                        logWarn(MODULE, 'createPeerConnection: a live connection already exists for this call -- reusing it instead of creating a duplicate', { state: _existingState });
                        return this._peerConnection;
                    }
                    try { this._peerConnection.close(); } catch (_) {}
                }

                const pcConfig = {



                    // FIX: use server-pushed TURN credentials if available, else free fallback
                    iceServers: (function() {
                        const _stun = [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' },
                        ];
                        const _turnFallback = [
                            { urls: 'turn:openrelay.metered.ca:80',              username: 'openrelayproject', credential: 'openrelayproject' },
                            { urls: 'turn:openrelay.metered.ca:443',             username: 'openrelayproject', credential: 'openrelayproject' },
                            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
                        ];
                        const serverTURN = window.__kynTURNServers;
                        return serverTURN && serverTURN.length
                            ? [..._stun, ...serverTURN]
                            : [..._stun, ..._turnFallback];
                    })(),



                    iceCandidatePoolSize: 10,

                    iceTransportPolicy: 'all',



                    ...config



                };



                



                this._peerConnection = new RTCPeerConnection(pcConfig);
                // FIX BUG-3: expose for adaptive-bitrate.js
                window.__callsPeerConnection = this._peerConnection;
                // FIX: hook for AdaptiveBitrateEngine.js's CallRecoveryEngine (tab-visibility,
                // network-change, socket-reconnect recovery) to trigger a restart on THIS real
                // connection, rather than a separate/unused WebRTC engine creating its own.
                window.callsCoreRestartICE = function(callId) {
                    if (callId && WebRTCManager._currentCallId && String(callId) !== String(WebRTCManager._currentCallId)) {
                        return Promise.resolve(); // stale request for a call that's no longer active
                    }
                    return Promise.resolve(WebRTCManager.handleIceFailure());
                };
                // FIX-CAMERA-SWITCH-FROZEN-REMOTE: MediaManager.switchCamera() only
                // ever updated the local stream/preview. This pushes the freshly
                // acquired track onto the active peer connection's real video
                // sender via replaceTrack(), so the remote party actually sees the
                // new camera instead of a frozen frame from the old (stopped) one.
                window.callsCoreReplaceVideoTrack = function(newTrack) {
                    if (!newTrack) return;
                    var pc = WebRTCManager._peerConnection;
                    if (!pc) return;
                    pc.getSenders().forEach(function(sender) {
                        if (sender.track && sender.track.kind === 'video') {
                            sender.replaceTrack(newTrack).catch(function() {});
                        }
                    });
                };
                // FIX: hook for AdaptiveBitrateEngine.js's CallRecoveryEngine tab-visibility
                // recovery. DeviceMediaManager.recoverTracks() is a no-op in this app (its
                // internal stream reference is never populated — calls-ui.js's UIState owns
                // the real one). This does the same job against the real stream and the real
                // peer connection: reacquire any ended tracks, then replaceTrack() on this
                // connection's actual senders so the remote party receives the recovered
                // media (not just a local preview refresh).
                window.callsCoreRecoverMedia = async function() {
                    try {
                        var ui = window.callsUI && window.callsUI.UIState;
                        var stream = ui && ui.localStream;
                        if (!stream) return;
                        var videoEnded = stream.getVideoTracks().some(function(t) { return t.readyState === 'ended'; });
                        var audioEnded = stream.getAudioTracks().some(function(t) { return t.readyState === 'ended'; });
                        if (!videoEnded && !audioEnded) return;

                        var hasVideo = stream.getVideoTracks().length > 0;
                        var hasAudio = stream.getAudioTracks().length > 0;
                        var newStream = await navigator.mediaDevices.getUserMedia({ audio: hasAudio, video: hasVideo });

                        var pc = WebRTCManager._peerConnection;
                        if (pc) {
                            pc.getSenders().forEach(function(sender) {
                                if (!sender.track) return;
                                var newTrack = sender.track.kind === 'audio'
                                    ? newStream.getAudioTracks()[0]
                                    : newStream.getVideoTracks()[0];
                                if (newTrack) sender.replaceTrack(newTrack).catch(function() {});
                            });
                        }

                        stream.getTracks().forEach(function(t) { if (t.readyState === 'ended') t.stop(); });
                        ui.localStream = newStream;
                        logInfo(MODULE, 'Recovered local media tracks after backgrounding/device interruption');
                    } catch (err) {
                        logWarn(MODULE, 'Media recovery failed', err && err.message);
                    }
                };
                window.dispatchEvent(new CustomEvent('call:connected', { detail: { pc: this._peerConnection } }));



                



                this._setupPeerConnectionListeners();



                



                logSuccess(MODULE, 'Peer connection created');



                



                return this._peerConnection;



                



            } catch (error) {



                logError(MODULE, 'Failed to create peer connection', error);



                throw error;



            }



        },



        



        _setupPeerConnectionListeners: function() {



            if (!this._peerConnection) return;



            this._peerConnection.onicecandidate = (event) => {



    if (event.candidate) {



        // FIX-ICE-DATACLONEERROR: event.candidate is a live RTCIceCandidate
        // instance. Passing it directly to postMessage() throws
        // "DataCloneError: Failed to execute 'postMessage': RTCIceCandidate
        // object could not be cloned" in this browser. That throw happened
        // BEFORE the socket.emit fallback below in source order, so it
        // aborted the whole handler early -- meaning NO ice candidate ever
        // reached the other peer via ANY transport, guaranteeing ICE
        // negotiation would time out and fail (the direct cause of the
        // "ICE connection failed" / "Max ICE restarts reached" cascade that
        // ends the call). Convert to a plain JSON-serializable object up
        // front (the spec-correct way to pass an RTCIceCandidate across a
        // boundary) and use that everywhere below instead of the raw
        // instance.
        var _iceCandidateJSON = (typeof event.candidate.toJSON === 'function')
            ? event.candidate.toJSON()
            : {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                usernameFragment: event.candidate.usernameFragment
            };

        this._iceCandidates.push(event.candidate);



        this._notifyListeners('ice_candidate', { candidate: _iceCandidateJSON });



        

        // FIX: Include targetUserId in ICE candidate payload.
        // Resolve remote user from callsState so backend can route to correct peer.
        if (this._currentCallId) {
            var _iceRemoteUserId = (function() {
                if (callsState._isCaller) {
                    // Caller sends ICE to receiver (participants[0])
                    if (callsState.activeCall && callsState.activeCall.participants && callsState.activeCall.participants.length > 0) {
                        var p = callsState.activeCall.participants[0];
                        return typeof p === 'object' ? (p.id || p.userId) : p;
                    }
                } else {
                    // Receiver sends ICE back to caller
                    return (callsState.callData && callsState.callData.callerId) || null;
                }
                return null;
            })();
            // FIX-CALLID-RECONCILE: prefer the server-reconciled callId (see
            // resolveCallId()/handleCallInitiatedAck below) over the raw
            // local id, so ICE candidates carry the same id the remote
            // side's active call is keyed on instead of a stale pre-ack
            // local id that the far end has no way to recognize.
            var _iceCallId = (typeof resolveCallId === 'function') ? resolveCallId(this._currentCallId) : this._currentCallId;
            var _icePayload = {
                callId: _iceCallId,
                candidate: _iceCandidateJSON,
                targetUserId: _iceRemoteUserId,
                remoteUserId: _iceRemoteUserId,
                timestamp: Date.now()
            };
            // FIX-ICE-DATACLONEERROR: wrapped in try/catch so a clone
            // failure on this transport can never prevent the socket.emit
            // fallback right below from still running.
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'ICE_CANDIDATE', payload: _icePayload, source: 'calls-core-direct' }, '*');
                }
            } catch (_postErr) {
                logWarn(MODULE, 'ICE_CANDIDATE postMessage failed, relying on socket transport', _postErr && _postErr.message);
            }
            // Also emit directly via socket for lowest latency
            var _iceSock = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
            if (_iceSock && typeof _iceSock.emit === 'function' && _iceRemoteUserId) {
                _iceSock.emit('call:ice_candidate', {
                    callId: _iceCallId, targetUserId: _iceRemoteUserId, candidate: _iceCandidateJSON,
                });
            } else {
                safeSend('ICE_CANDIDATE', _icePayload, false);
            }
        }



    }



};



            



            this._peerConnection.oniceconnectionstatechange = () => {



                const state = this._peerConnection.iceConnectionState;



                callsState.signalingState = state;



                logInfo(MODULE, `ICE connection state: ${state}`);



                



                if (state === 'connected' || state === 'completed') {



                    // Clear connection timeout



                    if (this._connectionTimeout) {



                        clearTimeout(this._connectionTimeout);



                        this._connectionTimeout = null;



                    }



                    // FIX-ICE-STALE-TIMER: ICE recovered on its own (transient blip) —
                    // cancel the pending 5s "still disconnected" recovery timer set in
                    // the 'disconnected' branch below. Without this, a connection that
                    // healed itself in under 5s still got hit with a spurious
                    // handleIceFailure() restart 5s later, because that timer only
                    // checks iceConnectionState at fire-time and was never cancelled on
                    // successful recovery — only full call cleanup cleared it, which is
                    // too late (mid-call, not at call end).
                    if (this._iceDisconnectTimer) {
                        clearTimeout(this._iceDisconnectTimer);
                        this._iceDisconnectTimer = null;
                    }



                    this._notifyListeners('ice_connected', { state });

                    // FIX: also fire 'call_connected' so UIEventHandlers.handleCallConnected
                    // runs on BOTH sides and transitions them to the in-call screen
                    this._notifyListeners('call_connected', {
                        callId: callsState.activeCallId,
                        callType: callsState.callType || 'voice',
                        callerName: (callsState.callData && (callsState.callData.callerName || callsState.callData.fromUserName)) || ''
                    });

                } else if (state === 'failed') {



                    // FIX-ICE-STALE-TIMER: cancel any pending 5s disconnect-recovery
                    // timer so it can't fire handleIceFailure() a second time for the
                    // same failure a few seconds after we already triggered it here.
                    if (this._iceDisconnectTimer) {
                        clearTimeout(this._iceDisconnectTimer);
                        this._iceDisconnectTimer = null;
                    }



                    this.handleIceFailure();



                    this._notifyListeners('ice_failed', { state });



                } else if (state === 'disconnected') {
                    logWarn(MODULE, 'ICE disconnected - attempting PHASE10 recovery');
                    this._notifyListeners('ice_disconnected', { state });
                    // PHASE10-FIX: Attempt ICE restart on disconnect (not just on failed)
                    // Give 5s for transient network hiccup before escalating to restart
                    if (!this._iceDisconnectTimer) {
                        this._iceDisconnectTimer = setTimeout(() => {
                            this._iceDisconnectTimer = null;
                            const currentIceState = this._peerConnection?.iceConnectionState;
                            if (currentIceState === 'disconnected' || currentIceState === 'failed') {
                                logWarn(MODULE, 'PHASE10: ICE still disconnected after 5s — triggering restart');
                                this.handleIceFailure();
                            }
                        }, 5000);
                    }



                }



                



                this._notifyListeners('ice_state', { state });



            };



            



            this._peerConnection.onconnectionstatechange = () => {



                const state = this._peerConnection.connectionState;



                callsState.connectionState = state;



                logInfo(MODULE, `Connection state: ${state}`);



                



                if (state === 'connected') {



                    // REAL connection established



                    callsState.callState = 'connected';



                    callsState.callActive = true;



                    this._notifyListeners('call_connected', { callId: this._currentCallId });



                    



                    // Notify UI



                    notifyListeners('call_connected', { callId: this._currentCallId });



                    



                    // Clear connection timeout



                    if (this._connectionTimeout) {



                        clearTimeout(this._connectionTimeout);



                        this._connectionTimeout = null;



                    }



                } else if (state === 'failed') {



                    this._notifyListeners('call_failed', { reason: 'connection_failed' });



                    notifyListeners('call_failed', { reason: 'connection_failed', callId: this._currentCallId });



                } else if (state === 'closed') {



                    this._notifyListeners('call_ended', {});



                }



                



                this._notifyListeners('connection_state', { state });



            };



            



            this._peerConnection.onsignalingstatechange = () => {



                const state = this._peerConnection.signalingState;



                logInfo(MODULE, `Signaling state: ${state}`);



                this._notifyListeners('signaling_state', { state });



            };



            



            this._peerConnection.ontrack = (event) => {

                console.log('[CallsCore] 🎵 ONTRACK CALLED - Received remote track', {
                    track: event.track ? event.track.kind : 'null',
                    trackId: event.track ? event.track.id : 'null',
                    streams: event.streams ? event.streams.length : 0,
                    streamId: event.streams[0] ? event.streams[0].id : 'null'
                });

                const track  = event.track;
                const stream = event.streams[0] || new MediaStream([track]);

                // ── Route by track kind: audio → remoteAudio, video → remoteVideo ──
                // Using event.track.kind prevents assigning a video+audio stream to
                // <audio> (which silently drops playback) and ensures both sides hear
                // each other.
                if (track.kind === 'audio') {
                    // Build (or reuse) a dedicated audio-only stream for the <audio> element
                    if (!this._remoteAudioStream) {
                        this._remoteAudioStream = new MediaStream();
                    }
                    // Remove any stale audio tracks from a previous session
                    this._remoteAudioStream.getAudioTracks().forEach(t => {
                        this._remoteAudioStream.removeTrack(t);
                    });
                    this._remoteAudioStream.addTrack(track);

                    let remoteAudio = document.getElementById('remoteAudio');
                    if (!remoteAudio) {
                        remoteAudio = document.createElement('audio');
                        remoteAudio.id = 'remoteAudio';
                        remoteAudio.autoplay = true;
                        remoteAudio.setAttribute('playsinline', '');
                        remoteAudio.style.display = 'none';
                        document.body.appendChild(remoteAudio);
                    }
                    // Apply per-user volume preference
                    remoteAudio.volume = (typeof window.__remoteVolume === 'number') ? window.__remoteVolume : 1.0;
                    remoteAudio.srcObject = this._remoteAudioStream;
                    remoteAudio.play().catch(function(playErr) {
                        console.warn('[CallsCore] Remote audio autoplay blocked, retrying on gesture', playErr.message);
                        const retryPlay = function() {
                            remoteAudio.play().catch(function() {});
                            document.removeEventListener('click',      retryPlay);
                            document.removeEventListener('touchstart', retryPlay);
                        };
                        document.addEventListener('click',      retryPlay, { once: true });
                        document.addEventListener('touchstart', retryPlay, { once: true });
                    });
                    console.log('[CallsCore] ✅ AUDIO TRACK routed → #remoteAudio (audio-only stream)');
                    // ✅ FIX: Notify UI that remote stream arrived — triggers transitionToInCall if not already shown
                    if (window.callsUI && window.callsUI.UIState) window.callsUI.UIState.hasRemoteAudio = true; // FIX: was window.UIState (never assigned)
                    // Retry play after short delay (browser autoplay policies)
                    setTimeout(function() {
                        if (remoteAudio && remoteAudio.srcObject && remoteAudio.paused) {
                            remoteAudio.play().catch(function(){});
                        }
                    }, 800);
                    setTimeout(function() {
                        if (remoteAudio && remoteAudio.srcObject && remoteAudio.paused) {
                            remoteAudio.play().catch(function(){});
                        }
                    }, 2000);
                }

                if (track.kind === 'video') {
                    // Build (or reuse) a dedicated video stream for the <video> element
                    if (!this._remoteVideoStream) {
                        this._remoteVideoStream = new MediaStream();
                    }
                    this._remoteVideoStream.getVideoTracks().forEach(t => {
                        this._remoteVideoStream.removeTrack(t);
                    });
                    this._remoteVideoStream.addTrack(track);

                    let remoteVideo = document.getElementById('remoteVideo');
                    if (!remoteVideo) {
                        remoteVideo = document.createElement('video');
                        remoteVideo.id = 'remoteVideo';
                        remoteVideo.autoplay = true;
                        remoteVideo.setAttribute('playsinline', '');
                        // FIX: must start muted for autoplay policy; unmuted after play() resolves
                        remoteVideo.muted = true;
                        remoteVideo.style.cssText = 'width:100%;height:100%;object-fit:cover;background:#000;';
                        const wrap = document.getElementById('incallAvatarWrap');
                        const parent = wrap ? wrap.parentNode : document.body;
                        parent.appendChild(remoteVideo);
                        console.log('[CallsCore] Created <video id="remoteVideo">');
                    }
                    remoteVideo.srcObject = this._remoteVideoStream;
                    // ✅ FIX: Ensure remoteVideo is inside inCallScreen and properly styled
                    const _inCallScreen = document.getElementById('inCallScreen');
                    if (_inCallScreen && !_inCallScreen.contains(remoteVideo)) {
                        _inCallScreen.style.position = 'relative';
                        _inCallScreen.insertBefore(remoteVideo, _inCallScreen.firstChild);
                    }
                    remoteVideo.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:10;border-radius:inherit;display:block;';
                    // Hide avatar, show video
                    const avatarWrap = document.getElementById('incallAvatarWrap');
                    if (avatarWrap) avatarWrap.style.display = 'none';
                    const _inCallBg = document.getElementById('inCallScreen');
                    if (_inCallBg) _inCallBg.classList.add('video-active');
                    // FIX: muted=true first so autoplay policy allows it, then unmute once playing
                    remoteVideo.muted = true;
                    remoteVideo.play().then(function() {
                        remoteVideo.muted = false; // restore audio after autoplay succeeds
                    }).catch(function(videoPlayErr) {
                        const retryVideoPlay = function() {
                            remoteVideo.play().then(function() { remoteVideo.muted = false; }).catch(function() {});
                            document.removeEventListener('click',      retryVideoPlay);
                            document.removeEventListener('touchstart', retryVideoPlay);
                            document.removeEventListener('touchend',   retryVideoPlay);
                        };
                        document.addEventListener('click',      retryVideoPlay, { once: true });
                        document.addEventListener('touchstart', retryVideoPlay, { once: true });
                        document.addEventListener('touchend',   retryVideoPlay, { once: true });
                    });
                    // ✅ FIX: Notify MasterFix that remote video arrived
                    if (window.callsUI && window.callsUI.UIState) window.callsUI.UIState.hasRemoteVideo = true; // FIX: was window.UIState (never assigned)
                    // Retry play after delays (autoplay policy)
                    [300, 800, 2000].forEach(function(ms) {
                        setTimeout(function() {
                            if (remoteVideo && remoteVideo.srcObject && remoteVideo.paused) {
                                remoteVideo.play().catch(function(){});
                            }
                        }, ms);
                    });
                    console.log('[CallsCore] ✅ VIDEO TRACK routed → #remoteVideo (fullscreen in inCallScreen)');
                    // ✅ FIX: Notify calls.html master fix that remote video arrived
                    try { window.dispatchEvent(new CustomEvent('kyn:remoteVideoArrived')); } catch(e) {}
                }

                if (stream) {



                    this._remoteStreams.set(stream.id, stream);



                    callsState.remoteStreams.set(stream.id, stream);



                    callsState.remoteStream = stream;

                    logSuccess(MODULE, 'Remote stream added');

                    this._notifyListeners('remote_stream_added', { stream, track: event.track });



                    notifyListeners('remote_stream_added', { stream });



                }



            };



            



            this._peerConnection.ondatachannel = (event) => {



                this._dataChannel = event.channel;



                this._setupDataChannel(this._dataChannel);



                this._notifyListeners('data_channel', { channel: event.channel });



            };



        },



        



        _setupDataChannel: function(channel) {



            channel.onopen = () => {



                logInfo(MODULE, 'Data channel opened');



                this._notifyListeners('data_channel_open', {});



            };



            



            channel.onclose = () => {



                logInfo(MODULE, 'Data channel closed');



                this._notifyListeners('data_channel_close', {});



            };



            



            channel.onmessage = (event) => {



                try {



                    const data = JSON.parse(event.data);



                    this._notifyListeners('data_message', data);



                } catch (e) {



                    logError(MODULE, 'Failed to parse data channel message', e);



                }



            };



            



            channel.onerror = (error) => {



                logError(MODULE, 'Data channel error', error);



                this._notifyListeners('data_channel_error', { error });



            };



        },



        



        createDataChannel: function(label = 'chat') {



            if (!this._peerConnection) {



                logError(MODULE, 'No peer connection to create data channel');



                return null;



            }



            



            try {



                this._dataChannel = this._peerConnection.createDataChannel(label);



                this._setupDataChannel(this._dataChannel);



                return this._dataChannel;



            } catch (error) {



                logError(MODULE, 'Failed to create data channel', error);



                return null;



            }



        },



        



        sendData: function(data) {



            if (!this._dataChannel || this._dataChannel.readyState !== 'open') {



                logWarn(MODULE, 'Data channel not open');



                return false;



            }



            



            try {



                this._dataChannel.send(JSON.stringify(data));



                return true;



            } catch (error) {



                logError(MODULE, 'Failed to send data', error);



                return false;



            }



        },



        



        addStream: function(stream) {

            if (!this._peerConnection) return false;

            

            console.log('[CallsCore] 🎤 Adding local stream to peer connection', {
                audioTracks: stream.getAudioTracks().length,
                videoTracks: stream.getVideoTracks().length,
                totalTracks: stream.getTracks().length
            });

            try {
                stream.getTracks().forEach(track => {
                    console.log('[CallsCore] Adding track:', {
                        kind: track.kind,
                        id: track.id,
                        enabled: track.enabled,
                        readyState: track.readyState
                    });
                    this._peerConnection.addTrack(track, stream);
                });

                console.log('[CallsCore] ✅ Local stream added to peer connection successfully');
                return true;

            } catch (error) {
                logError(MODULE, 'Failed to add stream to peer connection', error);
                return false;
            }

        },



        



        removeStream: function(stream) {



            if (!this._peerConnection) return false;



            



            try {



                const senders = this._peerConnection.getSenders();



                senders.forEach(sender => {



                    if (sender.track && stream.getTracks().includes(sender.track)) {



                        this._peerConnection.removeTrack(sender);



                    }



                });



                return true;



            } catch (error) {



                logError(MODULE, 'Failed to remove stream from peer connection', error);



                return false;



            }



        },



        



        createOffer: async function(options = {}) {



            if (!this._peerConnection) throw new Error('No peer connection');



            

            console.log('[CallsCore] 📞 Creating WebRTC offer with options:', options);



            try {



                const offer = await this._peerConnection.createOffer(options);



                console.log('[CallsCore] ✅ WebRTC offer created successfully');



                await this._peerConnection.setLocalDescription(offer);



                console.log('[CallsCore] ✅ Local description set for offer');



                return offer;



            } catch (error)  {



                logError(MODULE, 'Failed to create offer', error);



                throw error;



            }



        },



        



        createAnswer: async function(options = {}) {



            if (!this._peerConnection) throw new Error('No peer connection');



            



            try {



                const answer = await this._peerConnection.createAnswer(options);



                await this._peerConnection.setLocalDescription(answer);



                return answer;



            } catch (error) {



                logError(MODULE, 'Failed to create answer', error);



                throw error;



            }



        },



        



        setRemoteDescription: async function(description) {



            if (!this._peerConnection) throw new Error('No peer connection');



            try {



                await this._peerConnection.setRemoteDescription(description);



                logInfo(MODULE, 'Remote description set');



                // FIX-ICE: Drain queued ICE candidates now that remoteDescription is set



                const queued = this._iceCandidates && this._iceCandidates.splice(0);



                if (queued && queued.length > 0) {



                    logInfo(MODULE, `Draining ${queued.length} queued ICE candidates`);



                    for (const c of queued) {



                        try { await this._peerConnection.addIceCandidate(c); } catch(_) {}



                    }



                }



            } catch (error) {



                logError(MODULE, 'Failed to set remote description', error);



                throw error;



            }



        },



        



        addIceCandidate: async function(candidate) {



            if (!this._peerConnection) return;



            // FIX-ICE: Only add ICE candidates AFTER remoteDescription is set.



            // Adding before causes "InvalidStateError: cannot add ICE candidate" which



            // silently breaks the connection. Queue instead and drain after setRemoteDescription.



            if (!this._peerConnection.remoteDescription || !this._peerConnection.remoteDescription.type) {



                if (!this._iceCandidates) this._iceCandidates = [];



                this._iceCandidates.push(candidate);



                logInfo(MODULE, 'ICE candidate queued (waiting for remoteDescription)');



                return;



            }



            try {



                await this._peerConnection.addIceCandidate(candidate);



                logInfo(MODULE, 'ICE can
