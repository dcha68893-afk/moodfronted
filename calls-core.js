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



        console.log(`[${module}] ℹ️ ${message}`, data ? data : '');



    }



    



    function logWarn(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_warnLogs.has(key)) {



            const lastTime = _warnLogs.get(key);



            if (Date.now() - lastTime < 10000) return;



        }



        _warnLogs.set(key, Date.now());



        setTimeout(() => _warnLogs.delete(key), 10000);



        console.warn(`[${module}] ⚠️ ${message}`, data ? data : '');



    }



    



    function logError(module, message, error = null, data = null) {



        const key = `${module}:${message}`;



        if (_errorLogs.has(key)) {



            const lastTime = _errorLogs.get(key);



            if (Date.now() - lastTime < 30000) return;



        }



        _errorLogs.set(key, Date.now());



        setTimeout(() => _errorLogs.delete(key), 30000);



        console.error(`[${module}] 🔴 ${message}`, error ? error : '', data ? data : '');



    }



    



    function logSuccess(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_successLogs.has(key)) {



            const lastTime = _successLogs.get(key);



            if (Date.now() - lastTime < 5000) return;



        }



        _successLogs.set(key, Date.now());



        setTimeout(() => _successLogs.delete(key), 5000);



        console.log(`[${module}] ✅ ${message}`, data ? data : '');



    }



    



    function logSending(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_sendingLogs.has(key)) {



            const lastTime = _sendingLogs.get(key);



            if (Date.now() - lastTime < 2000) return;



        }



        _sendingLogs.set(key, Date.now());



        setTimeout(() => _sendingLogs.delete(key), 2000);



        console.log(`[${module}] 📤 ${message}`, data ? data : '');



    }



    



    function logReady(module, message, data = null) {



        const key = `${module}:${message}`;



        if (_readyLogs.has(key)) {



            const lastTime = _readyLogs.get(key);



            if (Date.now() - lastTime < 30000) return;



        }



        _readyLogs.set(key, Date.now());



        setTimeout(() => _readyLogs.delete(key), 30000);



        console.log(`[${module}] 🔵 ${message}`, data ? data : '');



    }



    



    function logState(module, fromState, toState, reason = '') {



        const key = `${module}:${fromState}→${toState}`;



        if (_stateLogs.has(key)) {



            const lastTime = _stateLogs.get(key);



            if (Date.now() - lastTime < 1000) return;



        }



        _stateLogs.set(key, Date.now());



        setTimeout(() => _stateLogs.delete(key), 1000);



        console.log(`[${module}] 📊 ${fromState} → ${toState}${reason ? ` (${reason})` : ''}`);



    }



    



    function logSession(module, message, data = null) {



        const key = `${module}:session:${message}`;



        if (_sessionLogs.has(key)) {



            const lastTime = _sessionLogs.get(key);



            if (Date.now() - lastTime < 10000) return;



        }



        _sessionLogs.set(key, Date.now());



        setTimeout(() => _sessionLogs.delete(key), 10000);



        console.log(`[${module}] 🎫 ${message}`, data ? data : '');



    }



    



    function logHeartbeat(module, message, data = null) {



        const key = `${module}:heartbeat:${message}`;



        if (_heartbeatLogs.has(key)) {



            const lastTime = _heartbeatLogs.get(key);



            if (Date.now() - lastTime < 2000) return;



        }



        _heartbeatLogs.set(key, Date.now());



        setTimeout(() => _heartbeatLogs.delete(key), 2000);



        console.log(`[${module}] 💓 ${message}`, data ? data : '');



    }



    



    function logCall(module, message, data = null) {



        const key = `${module}:call:${message}`;



        if (_callLogs.has(key)) {



            const lastTime = _callLogs.get(key);



            if (Date.now() - lastTime < 1000) return;



        }



        _callLogs.set(key, Date.now());



        setTimeout(() => _callLogs.delete(key), 1000);



        console.log(`[${module}] 📞 ${message}`, data ? data : '');



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
                    var activeCallId = window.callsState && (window.callsState.activeCallId || window.callsState.serverCallId);
                    if (activeCallId && window.__PeerConnectionManager) {
                        logInfo(MODULE, 'Triggering ICE restart after network recovery');
                        setTimeout(function() {
                            try { window.__PeerConnectionManager.restartICEForAll && window.__PeerConnectionManager.restartICEForAll(); } catch(_e) {}
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



                



                return { success: true, facingMode: newMode };



                



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



                this._notifyListeners('screen_share_started', { stream: screenStream });



                



                return { success: true, stream: screenStream };



                



            } catch (error) {



                logError(MODULE, 'Failed to start screen share', error);



                return { success: false, error: error.message };



            }



        },



        



        stopScreenShare: function() {



            callsState.screenSharing = false;



            this._notifyListeners('screen_share_ended', {});



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



        this._iceCandidates.push(event.candidate);



        this._notifyListeners('ice_candidate', { candidate: event.candidate });



        



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
            var _icePayload = {
                callId: this._currentCallId,
                candidate: event.candidate,
                targetUserId: _iceRemoteUserId,
                remoteUserId: _iceRemoteUserId,
                timestamp: Date.now()
            };
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'ICE_CANDIDATE', payload: _icePayload, source: 'calls-core-direct' }, '*');
            }
            // Also emit directly via socket for lowest latency
            var _iceSock = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
            if (_iceSock && typeof _iceSock.emit === 'function' && _iceRemoteUserId) {
                _iceSock.emit('call:ice_candidate', {
                    callId: this._currentCallId, targetUserId: _iceRemoteUserId, candidate: event.candidate,
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



                    this._notifyListeners('ice_connected', { state });

                    // FIX: also fire 'call_connected' so UIEventHandlers.handleCallConnected
                    // runs on BOTH sides and transitions them to the in-call screen
                    this._notifyListeners('call_connected', {
                        callId: callsState.activeCallId,
                        callType: callsState.callType || 'voice',
                        callerName: (callsState.callData && (callsState.callData.callerName || callsState.callData.fromUserName)) || ''
                    });

                } else if (state === 'failed') {



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
                    if (window.UIState) window.UIState.hasRemoteAudio = true;
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
                    if (window.UIState) window.UIState.hasRemoteVideo = true;
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



                logInfo(MODULE, 'ICE candidate added');



            } catch (error) {



                logError(MODULE, 'Failed to add ICE candidate', error);



            }



        },



        



        handleIceFailure: function() {



            logWarn(MODULE, 'ICE connection failed');



            



            if (this._iceRestartCount < CONFIG.MAX_ICE_RESTARTS) {



                this._iceRestartCount++;



                



                logInfo(MODULE, `Attempting ICE restart (${this._iceRestartCount}/${CONFIG.MAX_ICE_RESTARTS})`);



                



                this.createOffer({ iceRestart: true })



                    .then(offer => {



                        IframeTransport.sendAction('SIGNAL_OFFER', {



                            offer: offer,



                            callId: this._currentCallId,



                            iceRestart: true



                        }).catch(() => {});



                    })



                    .catch(error => {



                        logError(MODULE, 'ICE restart failed', error);



                    });



            } else {



                logError(MODULE, 'Max ICE restarts reached, call may fail');



                this._notifyListeners('call_failed', { reason: 'ice_failed' });



                notifyListeners('call_failed', { reason: 'ice_failed', callId: this._currentCallId });



            }



        },



        



        close: function() {
            if (this._connectionTimeout) {
                clearTimeout(this._connectionTimeout);
                this._connectionTimeout = null;
            }
            if (this._peerConnection) {
                // Remove all listeners before closing to prevent stale callbacks
                try { this._peerConnection.ontrack = null; } catch(e) {}
                try { this._peerConnection.onicecandidate = null; } catch(e) {}
                try { this._peerConnection.oniceconnectionstatechange = null; } catch(e) {}
                try { this._peerConnection.onnegotiationneeded = null; } catch(e) {}
                try { this._peerConnection.close(); } catch(e) {}
                this._peerConnection = null;
                window.__callsPeerConnection = null;
                window.dispatchEvent(new CustomEvent('call:ended', {}));
            }
            // ✅ FIX: Clear remote audio/video streams so second call starts fresh
            if (this._remoteAudioStream) {
                this._remoteAudioStream.getTracks().forEach(function(t){ try{t.stop();}catch(e){} });
                this._remoteAudioStream = null;
            }
            if (this._remoteVideoStream) {
                this._remoteVideoStream.getTracks().forEach(function(t){ try{t.stop();}catch(e){} });
                this._remoteVideoStream = null;
            }
            // Clear DOM elements
            var remAudio = document.getElementById('remoteAudio');
            if (remAudio) { remAudio.srcObject = null; remAudio.load(); }
            var remVideo = document.getElementById('remoteVideo');
            if (remVideo) { remVideo.srcObject = null; remVideo.style.display = 'none'; }

            // FIX-008: Also clear local video element — missing in original, caused black screen on 2nd call
            var locVideo = document.getElementById('localVideo') || document.getElementById('local-video') || document.querySelector('[data-local-video]');
            if (locVideo && (locVideo.tagName === 'VIDEO' || locVideo.tagName === 'AUDIO')) {
                locVideo.srcObject = null;
                try { locVideo.load(); } catch(_) {}
            }
            // Stop local stream tracks if not already done by MediaManager
            if (callsState && callsState.localStream) {
                try { callsState.localStream.getTracks().forEach(function(t){ try{t.stop();}catch(_){} }); } catch(_) {}
                callsState.localStream = null;
            }
            // Stop remote stream tracks
            if (callsState && callsState.remoteStream) {
                try { callsState.remoteStream.getTracks().forEach(function(t){ try{t.stop();}catch(_){} }); } catch(_) {}
                callsState.remoteStream = null;
            }

            this._iceCandidates = [];
            this._iceRestartCount = 0;
            this._remoteStreams.clear();
            this._dataChannel = null;
            this._currentCallId = null;
            // PHASE10: Clear ICE disconnect timer so second call doesn't get stale recovery
            if (this._iceDisconnectTimer) {
                clearTimeout(this._iceDisconnectTimer);
                this._iceDisconnectTimer = null;
            }
            // PHASE10: Null out stale remote streams so second call gets fresh tracks
            this._remoteAudioStream = null;
            this._remoteVideoStream = null;
            // PHASE10: Clear stale srcObject from DOM elements so second call renders correctly
            try {
                const remoteAudio = document.getElementById('remoteAudio');
                if (remoteAudio) { remoteAudio.srcObject = null; remoteAudio.load(); }
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo) { remoteVideo.srcObject = null; remoteVideo.load(); }
                // Restore avatar visibility for next call
                const avatarWrap = document.getElementById('incallAvatarWrap');
                if (avatarWrap) avatarWrap.style.display = '';
                const inCallScreen = document.getElementById('inCallScreen');
                if (inCallScreen) inCallScreen.classList.remove('video-active');
            } catch(_) {}
            console.log('[WebRTCManager] ✅ PHASE10 Full cleanup done — ready for next call');
        },



        



        setCurrentCallId: function(callId) {



            this._currentCallId = callId;



        },



        



        setConnectionTimeout: function(timeoutMs) {



            if (this._connectionTimeout) clearTimeout(this._connectionTimeout);



            this._connectionTimeout = setTimeout(() => {



                // Don't timeout if receiver has accepted — TURN relay may need more time
                const _acceptedStates = ['connected','in-call','in_call','connecting'];
                if (!_acceptedStates.includes(callsState.callState) && !window.__callReceiverAccepted) {



                    logWarn(MODULE, 'Connection timeout reached');



                    this._notifyListeners('call_timeout', {});



                    notifyListeners('call_timeout', { callId: this._currentCallId });



                }



            }, timeoutMs);



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



                hasPeerConnection: !!this._peerConnection,



                iceConnectionState: this._peerConnection?.iceConnectionState || 'new',



                signalingState: this._peerConnection?.signalingState || 'stable',



                connectionState: this._peerConnection?.connectionState || 'new',



                iceCandidates: this._iceCandidates.length,



                iceRestartCount: this._iceRestartCount,



                remoteStreams: this._remoteStreams.size,



                hasDataChannel: !!this._dataChannel,



                dataChannelState: this._dataChannel?.readyState || 'closed',



                currentCallId: this._currentCallId,



                initialized: this._initialized



            };



        }



    };



    



    WebRTCManager.initialize();



    



    // ==================== SINGLE ACTIVE CALL ENFORCEMENT ====================



    // CRITICAL: Only one active call at a time



    function enforceSingleActiveCall() {



        if (callsState.callActive && callsState.activeCall) {



            logWarn(MODULE, 'Call blocked - another call already active', { activeCallId: callsState.activeCallId });



            return false;



        }



        return true;



    }



    



    function setActiveCall(callId, callType, participants) {



    // FIXED RACE: forceResetCallState clears callActive synchronously but



    // sometimes JS microtask ordering means callActive is still true by the



    // time we arrive here.  A truly stale block only applies when BOTH



    // callActive===true AND activeCallId is a non-empty string different from



    // the incoming callId.  All other stale-flag cases are self-healed below.



    if (callsState.callActive && callsState.activeCallId && callsState.activeCallId !== callId) {



        // Extra safety: if the stale call is old (>60s), force-clear it rather than block



        const staleAge = callsState.callStartTime ? Date.now() - callsState.callStartTime : Infinity;



        if (staleAge < 60000) {



            logWarn(MODULE, 'Cannot set active call - another call already active', { existing: callsState.activeCallId });



            return false;



        }



        logWarn(MODULE, 'Stale call detected (>60s old) — force-clearing before new call', { existing: callsState.activeCallId });



        resetCallState();



        callsState.callActive = false;



        callsState.activeCallId = null;



    }



    



    // If there's a stale call with the same ID, or callActive with no ID, clean it first



    if ((callsState.activeCallId === callId && callsState.callActive) ||



        (callsState.callActive && !callsState.activeCallId)) {



        logWarn(MODULE, 'Stale call state detected, resetting before new call', { callId });



        resetCallState();



        callsState.callActive = false;



        callsState.activeCallId = null;



    }



    



    callsState.activeCall = {



        callId: callId,



        type: callType,



        participants: participants,



        startTime: Date.now(),



        state: 'initiating'



    };



    callsState.activeCallId = callId;



    callsState.callActive = true;



    callsState.callType = callType;



    callsState.callParticipants = participants;



    callsState.callStartTime = Date.now();



    callsState.callState = 'initiating';

    // CALLMANAGER BRIDGE: create CM session for outgoing call
    try {
        var _smOut = window.__CallStateMachine;
        var _CSOut = window.CALL_STATE;
        if (_smOut && _CSOut && callId) {
            if (!_smOut.getSession(callId)) {
                _smOut.createSession(callId, callType || 'audio', null, true);
                _smOut.transition(callId, _CSOut.OUTGOING);
            }
        }
    } catch(_outBE) {}


    



    logCall(MODULE, 'Active call set', { callId, callType });



    return true;



}



    



    function clearActiveCall() {



        callsState.activeCall = null;



        callsState.activeCallId = null;



        callsState.callActive = false;



        callsState.callType = null;



        callsState.callParticipants = [];



        callsState.callStartTime = null;



        callsState.callState = 'idle';



        callsState.connectionState = 'new';



        callsState.signalingState = 'new';



        



        // Clear any pending timers



        if (callsState.callInvitationTimer) {



            clearTimeout(callsState.callInvitationTimer);



            callsState.callInvitationTimer = null;



        }



        



        logCall(MODULE, 'Active call cleared');



    }



    



    function resetCallState() {
    // CALLMANAGER BRIDGE: notify CM to clean up before we reset local state
    try {
        var _cmReset = window.__CallManager;
        if (_cmReset) {
            var _resetId = callsState.activeCallId || callsState.serverCallId || callsState.localCallId;
            if (_resetId) {
                var _resetSession = window.__CallStateMachine && window.__CallStateMachine.getSession(_resetId);
                if (_resetSession && !_resetSession.isTerminal()) {
                    _cmReset.endCall(_resetId, 'reset');
                }
            }
            if (typeof _cmReset._stopCallTimer === 'function') _cmReset._stopCallTimer();
            _cmTimerDelegated = false;
        }
    } catch(_crErr) {}
    callsState.callActive = false;
    callsState.callState = 'idle';
    callsState.activeCallId = null;
    callsState.activeCall = null;
    callsState.callType = null;
    callsState.callParticipants = [];
    callsState.callStartTime = null;
    callsState.connectionState = 'new';
    callsState.signalingState = 'new';
    // ✅ FIX: Clear caller flags and pending queues on reset
    callsState._isCaller = false;
    window.__callerCallId = null;
    window.__pendingOfferPayload = null;
    window.__pendingAnswerPayload = null;



    callsState.callData = null;



    callsState.pendingCallReturnTo = null;



    callsState.pendingCallSource = null;



    callsState.serverCallId = null;



    callsState.localCallId = null;







    if (callsState.callInvitationTimer) {



        clearTimeout(callsState.callInvitationTimer);



        callsState.callInvitationTimer = null;



    }







    if (MediaManager && MediaManager.stopLocalStream) { try { MediaManager.stopLocalStream(); } catch(e) {} }



    if (WebRTCManager && WebRTCManager.close) { try { WebRTCManager.close(); } catch(e) {} }







    callsState.remoteStream = null;



    if (callsState.remoteStreams) callsState.remoteStreams.clear();



    callsState.iceCandidates = [];



    callsState.iceRestartCount = 0;







    // Also end the session manager so next call can start fresh



    try {



        const mgr = window.KynectaCallSession;



        if (mgr && mgr.isActive) mgr.end('force_reset');



    } catch(e) {}







    // Unlock governor transition lock so next call isn't blocked

    if (typeof CallsStateGovernor !== 'undefined' && CallsStateGovernor) {
        CallsStateGovernor._transitionLock = false;
    }

    // ── PHASE15 FIX-PHASE-C: Post-call UI restoration ──────────────────────
    // After a call ends: restore sidebar, release media, navigate back.
    try {
        // Stop lingering video/audio elements
        var _vcEls = document.querySelectorAll('video, audio');
        _vcEls.forEach(function(el) {
            try {
                if (el.srcObject) {
                    el.srcObject.getTracks && el.srcObject.getTracks().forEach(function(t){t.stop();});
                    el.srcObject = null;
                }
                el.load();
            } catch(_) {}
        });
        // Restore main UI
        if (typeof window.showScreen === 'function') { window.showScreen('idle'); }
        // Restore sidebar / nav visibility
        document.querySelectorAll('.sidebar, .chat-list-container, .mobile-nav-bar').forEach(function(el) {
            try { el.style.display = ''; el.classList.remove('hidden', 'd-none'); } catch(_) {}
        });
        // Remove in-call body class
        try { document.body.classList.remove('call-screen-active', 'in-call-active'); } catch(_) {}
        // Tell parent frame to restore the pre-call screen
        var _returnTarget = (callsState && (callsState.pendingCallReturnTo || callsState.pendingCallSource)) || 'conversations';
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _returnTarget, timestamp: Date.now() }, '*');
            }
        } catch(_) {}
        console.log('[CallsCore] PHASE15 ✅ Post-call UI restored to: ' + _returnTarget);
    } catch(_restoreErr) {
        console.warn('[CallsCore] Post-call restore error:', _restoreErr && _restoreErr.message);
    }
    // ── END PHASE15 FIX-PHASE-C ──────────────────────────────────────────────
}







    // ==================== CALL STATE GOVERNOR (REAL) ====================



    const CallsStateGovernor = {



        _currentState: CALLS_STATE.INIT,



        _previousState: null,



        _transitionLock: false,



        _staleCallCleanupInterval: null,



        _stateChangeListeners: new Set(),



        _moduleRegistered: false,



        _sessionReceived: false,



        _parentReadyReceived: false,



        _session: null,



        _token: null,



        _verificationInProgress: false,



        _lastVerificationTime: 0,



        _lastVerificationResult: true,



        _validSessionConfirmed: false,



        



        initialize: function() {



            this._currentState = CALLS_STATE.INIT;



            this._previousState = null;



            this._moduleRegistered = false;



            this._sessionReceived = false;



            this._parentReadyReceived = false;



            this._session = null;



            this._token = null;



            this._validSessionConfirmed = false;



            



            callsState.registered = false;



            callsState.parentReady = false;



            callsState.session = null;



            callsState.sessionStatus = 'pending';



            callsState.token = null;



            callsState.verified = false;



            callsState.verificationLock = false;



            callsState.webrtcInitialized = false;



            callsState.recoveryMode = false;



            callsState.sessionReceived = false;



            callsState.childReadySent = false;



            callsState.registrationSent = false;



            validSessionConfirmed = false;



            transitionTo(LifecycleState.INITIALIZING);



            



            // Start stale call cleanup



            this._startStaleCallCleanup();



            



            logInfo(MODULE, 'Calls State Governor initialized');



            return this;



        },



        



        transition: function(newState, reason = '') {



            if (this._transitionLock) {



                return false;



            }



            



            const oldState = this._currentState;



            if (oldState === newState) return false;



            



            const isLegal = this._isLegalTransition(oldState, newState);



            



            if (!isLegal) {



                logWarn(MODULE, `Illegal state transition: ${oldState} → ${newState}`);



                return false;



            }



            



            this._previousState = oldState;



            this._currentState = newState;



            



            logState(MODULE, oldState, newState, reason);



            this._notifyListeners('state', { oldState, newState, reason });



            



            this._handleStateActions(newState);



            



            return true;



        },



        



        _isLegalTransition: function(from, to) {



            const legalTransitions = {



                [CALLS_STATE.INIT]: [CALLS_STATE.REGISTERING, CALLS_STATE.ACTIVE, CALLS_STATE.CALL_READY], // CALL_READY added for direct call initiation



                [CALLS_STATE.REGISTERING]: [CALLS_STATE.REGISTERED, CALLS_STATE.SESSION_PENDING],



                [CALLS_STATE.REGISTERED]: [CALLS_STATE.SESSION_PENDING, CALLS_STATE.REGISTERING],



                [CALLS_STATE.SESSION_PENDING]: [CALLS_STATE.SESSION_RECEIVED],



                [CALLS_STATE.SESSION_RECEIVED]: [CALLS_STATE.ACTIVE],



                [CALLS_STATE.ACTIVE]: [CALLS_STATE.CALL_READY, CALLS_STATE.SESSION_RECEIVED],



                [CALLS_STATE.CALL_READY]: [CALLS_STATE.IN_CALL, CALLS_STATE.ACTIVE],



                [CALLS_STATE.IN_CALL]: [CALLS_STATE.CALL_READY, CALLS_STATE.TERMINATED],



                [CALLS_STATE.TERMINATED]: [CALLS_STATE.INIT, CALLS_STATE.ACTIVE] // ACTIVE added for recovery



            };



            return legalTransitions[from] ? legalTransitions[from].includes(to) : false;



        },



        



        _handleStateActions: function(state) {



            switch (state) {



                case CALLS_STATE.ACTIVE:



                    break;



                case CALLS_STATE.IN_CALL:



                    break;



                case CALLS_STATE.TERMINATED:



                    break;



                default:



                    break;



            }



        },



        



        handleModuleRegistered: function() {



            if (this._moduleRegistered) return;



            



            this._moduleRegistered = true;



            callsState.registered = true;



            logSuccess(MODULE, 'MODULE_REGISTERED received');



            



            if (this._currentState === CALLS_STATE.REGISTERING) {



                this.transition(CALLS_STATE.REGISTERED, 'module_registered');



            }



            



            this.transition(CALLS_STATE.SESSION_PENDING, 'waiting_for_session');



        },



        



        handleSessionActive: function(sessionData) {



            if (!sessionData || typeof sessionData !== 'object') {



                logError(MODULE, 'Invalid session data', null, sessionData);



                return;



            }



            



            const candidateSession = {



                authenticated: sessionData.authenticated === true,



                userId: sessionData.userId || sessionData.user?.id,



                token: sessionData.token || sessionData.jwt || sessionData.accessToken,



                user: sessionData.user || {},



                expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),



                version: sessionData.version || 1,



                sessionId: sessionData.sessionId || Date.now()



            };



            



            // CRITICAL: Validate session before accepting



            if (!__isValidSession(candidateSession)) {



                console.warn(`[${MODULE}] handleSessionActive rejected - invalid session`, {



                    hasToken: !!candidateSession.token,



                    userId: candidateSession.userId,



                    authenticated: candidateSession.authenticated



                });



                return;



            }



            



            this._session = candidateSession;



            this._token = candidateSession.token;



            callsState.session = candidateSession;



            callsState.token = candidateSession.token;



            callsState.sessionStatus = 'valid';



            this._validSessionConfirmed = true;



            validSessionConfirmed = true;



            



            if (!this._sessionReceived) {



                this._sessionReceived = true;



                callsState.sessionReceived = true;



                logSession(MODULE, 'SESSION_ACTIVE received', { 



                    authenticated: candidateSession.authenticated,



                    userId: candidateSession.userId,



                    sessionId: candidateSession.sessionId



                });



                



                if (this._currentState === CALLS_STATE.SESSION_PENDING || this._currentState === CALLS_STATE.REGISTERED) {



                    this.transition(CALLS_STATE.SESSION_RECEIVED, 'session_active');



                }



                



                if (this._parentReadyReceived) {



                    this.transition(CALLS_STATE.ACTIVE, 'parent_ready_after_session');



                }



                



                window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {



                    detail: { core: window.callCore, timestamp: Date.now() }



                }));



                



                window.dispatchEvent(new CustomEvent('MODULE_READY', {



                    detail: { module: MODULE_NAME, timestamp: Date.now() }



                }));



            }



        },



        



        handleSessionNull: function() {



            logInfo(MODULE, 'SESSION_NULL received - no authenticated session');



            



            this._session = {



                authenticated: false,



                userId: null,



                token: null,



                user: {},



                expiresAt: 0,



                version: 1



            };



            this._token = null;



            callsState.session = null;



            callsState.token = null;



            callsState.sessionReceived = false;



            callsState.sessionStatus = 'invalid';



            this._validSessionConfirmed = false;



            validSessionConfirmed = false;



            



            if (!this._sessionReceived) {



                this._sessionReceived = true;



                



                if (this._currentState === CALLS_STATE.SESSION_PENDING || this._currentState === CALLS_STATE.REGISTERED) {



                    this.transition(CALLS_STATE.SESSION_RECEIVED, 'session_null');



                }



            }



        },



        



        handleParentReady: function() {



            if (this._parentReadyReceived) return;



            



            this._parentReadyReceived = true;



            callsState.parentReady = true;



            logSuccess(MODULE, 'PARENT_READY received');



            



            if (this._currentState === CALLS_STATE.SESSION_RECEIVED && this._validSessionConfirmed) {



                this.transition(CALLS_STATE.ACTIVE, 'parent_ready');



            } else if (this._currentState === CALLS_STATE.SESSION_PENDING) {



                logInfo(MODULE, 'PARENT_READY received before session - waiting for SESSION_ACTIVE');



            } else if (this._currentState === CALLS_STATE.SESSION_RECEIVED && !this._validSessionConfirmed) {



                logWarn(MODULE, 'PARENT_READY received but session is invalid - waiting for valid session');



            }



        },



        



        verifySession: function(force = false) {



            return new Promise((resolve) => {



                const now = Date.now();



                if (!force && now - this._lastVerificationTime < 5000) {



                    logInfo(MODULE, 'Verification skipped - cooldown', { 



                        lastVerification: this._lastVerificationTime 



                    });



                    resolve({ valid: callsState.verified, cached: true });



                    return;



                }



                



                if (callsState.verificationLock) {



                    logInfo(MODULE, 'Verification already in progress, waiting');



                    



                    const checkInterval = setInterval(() => {



                        if (!callsState.verificationLock) {



                            clearInterval(checkInterval);



                            resolve({ valid: callsState.verified, cached: true });



                        }



                    }, 50);



                    



                    



if (Date.now() - lastVerificationTime < VERIFICATION_COOLDOWN) {



    console.log('[calls] Skipping verification - cooldown active');



    return;



}



lastVerificationTime = Date.now();



                    setTimeout(() => {



                        clearInterval(checkInterval);



                        resolve({ valid: callsState.verified, cached: true, timeout: true });



                    }, 1000);



                    



                    return;



                }



                



                // ==================== CRITICAL FIX: Fall back to callsState.session if this._session is null ====================



                // Use callsState.session as fallback for session data



                if (!callsState.session || !__isValidSession(callsState.session)) {



                    resolve({ valid: false, reason: 'no_token' });



                    return;



                }



                



                // Use this._session if available and valid, otherwise fall back to callsState.session



                const sess = (this._session && this._session.authenticated) ? this._session : callsState.session;



                



                if (sess && sess.authenticated && sess.expiresAt > Date.now()) {



                    // Sync this._session if it was null but we have a valid callsState.session



                    if (!this._session) {



                        this._session = sess;



                        this._token = sess.token;



                    }



                    



                    const timeSinceLast = Date.now() - this._lastVerificationTime;



                    if (force || timeSinceLast > 30000) {



                        this._performVerification().then(result => {



                            resolve(result);



                        }).catch(() => {



                            resolve({ valid: true, cached: true });



                        });



                    } else {



                        resolve({ valid: true, cached: true });



                    }



                } else {



                    resolve({ valid: false, reason: 'no_session' });



                }



            });



        },



        



        _performVerification: function() {



    return new Promise((resolve) => {



        if (!assertActive('VERIFY_SESSION')) {



            resolve({ valid: callsState.verified, cached: true });



            return;



        }



        



        callsState.verificationLock = true;



        this._verificationInProgress = true;



        



        const requestId = `verify_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;



        let responded = false;



        let timeoutId = null;



        



        logSending(MODULE, 'VERIFY_SESSION sent', { requestId });



        



        // Set a safety timeout to prevent hanging promises



        const safetyTimeout = setTimeout(() => {



            if (!responded) {



                responded = true;



                logWarn(MODULE, 'VERIFY_SESSION safety timeout triggered', { requestId });



                



                callsState.verificationLock = false;



                this._verificationInProgress = false;



                



                // Fall back to cached session validity



                const sess = (this._session && this._session.authenticated) ? this._session : callsState.session;



                if (sess && sess.authenticated && sess.expiresAt > Date.now()) {



                    logWarn(MODULE, 'Using cached session after safety timeout');



                    callsState.verified = true;



                    if (callsState.session) {



                        validSessionConfirmed = true;



                    }



                    resolve({ valid: true, cached: true, timeout: true });



                } else {



                    resolve({ valid: false, reason: 'timeout', cached: false });



                }



            }



        }, 8000); // 8 second safety timeout



        



        // Register the pending request with MessageRegistry



        MessageRegistry.register(requestId, 'VERIFY_SESSION', { timeout: 5000 })



            .then((response) => {



                if (responded) return;



                responded = true;



                clearTimeout(safetyTimeout);



                



                this._verificationInProgress = false;



                this._lastVerificationTime = Date.now();



                



                // Extract validity from response - handle multiple response formats



                let isValid = false;



                if (response) {



                    isValid = response.payload?.valid === true || 



                              response.result?.valid === true || 



                              response.valid === true ||



                              (response.payload && response.payload.authenticated === true);



                }



                



                this._lastVerificationResult = isValid;



                



                callsState.verified = isValid;



                callsState.verificationLock = false;



                



                if (isValid && callsState.session) {



                    validSessionConfirmed = true;



                }



                



                logSuccess(MODULE, isValid ? 'Session verified' : 'Session verification failed');



                resolve({ valid: isValid, verified: true, requestId: requestId });



            })



            .catch((error) => {



                if (responded) return;



                responded = true;



                clearTimeout(safetyTimeout);



                



                logWarn(MODULE, 'Verification error', { requestId, error: error?.message });



                



                callsState.verificationLock = false;



                this._verificationInProgress = false;



                



                // Fall back to cached session validity



                const sess = (this._session && this._session.authenticated) ? this._session : callsState.session;



                if (sess && sess.authenticated && sess.expiresAt > Date.now()) {



                    logWarn(MODULE, 'Using cached session after error');



                    callsState.verified = true;



                    if (callsState.session) {



                        validSessionConfirmed = true;



                    }



                    resolve({ valid: true, cached: true, error: true });



                } else {



                    resolve({ valid: false, reason: error?.message || 'verification_error', cached: false });



                }



            });



        



        // Send the verification request to parent



        safeSend('VERIFY_SESSION', {



            requestId: requestId,



            timestamp: Date.now()



        }, false).catch((error) => {



            if (responded) return;



            responded = true;



            clearTimeout(safetyTimeout);



            



            logError(MODULE, 'Failed to send VERIFY_SESSION', error);



            callsState.verificationLock = false;



            this._verificationInProgress = false;



            resolve({ valid: false, reason: 'send_failed', error: error?.message });



        });



    });



},







// Add this helper method to clean up stale call states



_clearStaleCallState: function() {



    // If a call has been active for more than 60 seconds without being connected,



    // it's likely stale - clean it up



    if (callsState.callActive && callsState.callStartTime) {



        const callDuration = Date.now() - callsState.callStartTime;



        // Allow 120s for TURN relay connection; also skip if receiver has accepted
        // PHASE15 FIX: Added 'starting', 'initiated', 'ringing', 'incoming' to safe states.
        // callsState.callState is set to 'starting' when the call is accepted and media
        // streams are being set up, and 'connected' only after RTCPeerConnection fires
        // 'connected'. The previous list was missing 'starting' and 'initiated', causing
        // live calls to be auto-terminated if connection took > 120s (common on TURN relays).
        const _ACTIVE_CALL_STATES = new Set(['connected','in-call','in_call','connecting','starting','initiated','ringing','incoming','in_progress']);
        if (callDuration > 120000 && !_ACTIVE_CALL_STATES.has(callsState.callState)) {



            logWarn(MODULE, 'Cleaning up stale call state', {



                callId: callsState.activeCallId,



                state: callsState.callState,



                duration: callDuration



            });

            var _staleReturnTarget = (callsState && (callsState.pendingCallReturnTo || callsState.pendingCallSource)) || 'conversations';

            resetCallState();

            // ── FIX: Without this, a stale/frozen call screen cleaned up after
            // 120s left the user stuck looking at a dead call UI with no nav.
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _staleReturnTarget, timestamp: Date.now() }, '*');
                }
            } catch (_e) {}

        }



    }



    



    // Also check for calls that have been in 'initiating' state for too long



    if (callsState.callState === 'initiating' && callsState.callStartTime) {



        const callDuration = Date.now() - callsState.callStartTime;



        if (callDuration > 300000) { // PHASE15 FIX: 300s (5min) — was 120s which killed calls on slow TURN relays



            logWarn(MODULE, 'Cleaning up stale initiating call', {



                callId: callsState.activeCallId,



                duration: callDuration



            });

            var _staleInitReturnTarget = (callsState && (callsState.pendingCallReturnTo || callsState.pendingCallSource)) || 'conversations';

            resetCallState();

            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _staleInitReturnTarget, timestamp: Date.now() }, '*');
                }
            } catch (_e) {}

        }



    }



    



    // Clean up incoming call data that's been waiting too long



    if (callsState.callData && callsState.callState === 'incoming') {



        const incomingCallAge = Date.now() - (callsState.callData.timestamp || callsState.callData.createdAt || Date.now());



        if (incomingCallAge > 40000) {



            logWarn(MODULE, 'Cleaning up stale incoming call data', {



                callId: callsState.callData.callId,



                age: incomingCallAge



            });



            callsState.callData = null;



            callsState.callState = 'idle';



            if (callsState.activeCallId === callsState.callData?.callId) {



                callsState.activeCallId = null;



            }



        }



    }



},







// Start stale call cleanup interval - call this in initialize()



_startStaleCallCleanup: function() {



    if (this._staleCallCleanupInterval) {



        clearInterval(this._staleCallCleanupInterval);



    }



    this._staleCallCleanupInterval = setInterval(() => {



        this._clearStaleCallState();



    }, 10000); // Check every 10 seconds



},







initiateCall: async function(callType, participants = []) {



    // CRITICAL: Force cleanup of any stale call state first



    if (callsState.callActive === true || callsState.activeCallId !== null || callsState.callState !== 'idle') {



        logWarn(MODULE, 'Cleaning up stale call state before initiating', { 



            callActive: callsState.callActive,



            activeCallId: callsState.activeCallId,



            callState: callsState.callState



        });



        



        // Force reset everything



        resetCallState();



        callsState.callActive = false;



        callsState.callState = 'idle';



        callsState.activeCallId = null;



        callsState.activeCall = null;



        callsState.callType = null;



        callsState.callParticipants = [];



        callsState.callStartTime = null;



        callsState.serverCallId = null;



        callsState.localCallId = null;



        



        if (callsState.callInvitationTimer) {



            clearTimeout(callsState.callInvitationTimer);



            callsState.callInvitationTimer = null;



        }



        



        if (MediaManager) MediaManager.stopLocalStream();



        if (WebRTCManager) WebRTCManager.close();



        



        // CRITICAL FIX: Also fix governor state — INIT→CALL_READY is illegal.



        // After cleanup, governor must be in ACTIVE so ACTIVE→CALL_READY works.



        this._transitionLock = false;



        if (this._currentState !== CALLS_STATE.ACTIVE) {



            this._previousState = this._currentState;



            this._currentState = CALLS_STATE.ACTIVE;



        }



        



        // Small delay to ensure cleanup completes



        await new Promise(resolve => setTimeout(resolve, 100));



    }



    



    // ✅ FIX: Force-clear any remaining stale state instead of aborting
    // Previous behavior: abort if callActive/activeCallId still set after cleanup
    // New behavior: force-clear and continue (the user explicitly started a new call)
    if (callsState.callActive === true || callsState.activeCallId !== null) {
        logWarn(MODULE, 'Force-clearing stale call state for new call');
        callsState.callActive   = false;
        callsState.callState    = 'idle';
        callsState.activeCallId = null;
        callsState.activeCall   = null;
        callsState.serverCallId = null;
        callsState.localCallId  = null;
        callsState._isCaller    = false;
        window.__callerCallId   = null;
        window.__pendingOfferPayload = null;
        window.__pendingAnswerPayload = null;
        // Close PC if still open
        if (WebRTCManager && WebRTCManager._peerConnection) {
            try { WebRTCManager._peerConnection.close(); } catch(e) {}
            WebRTCManager._peerConnection = null;
        }
    }





    



    if (!assertActive('initiateCall')) {



        logWarn(MODULE, 'Cannot initiate call - not in ACTIVE state', { currentState });



        this._notifyListeners('call_blocked', { reason: 'not_active' });



        return { success: false, reason: 'not_active' };



    }



    



    if (!parentReady) {



        logWarn(MODULE, 'Cannot initiate call - parent not ready');



        this._notifyListeners('call_blocked', { reason: 'parent_not_ready' });



        return { success: false, reason: 'parent_not_ready' };



    }



    



    if (callsState.recoveryMode) {



        logWarn(MODULE, 'Cannot initiate call - recovery mode active', { currentState });



        this._notifyListeners('call_blocked', { reason: 'recovery' });



        return { success: false, reason: 'recovery' };



    }



    



    // Check for valid session



    const activeSession = (this._session && this._session.authenticated) ? this._session : callsState.session;



    const activeToken = this._token || callsState.token;



    



    if (!activeSession || !activeSession.authenticated) {



        logWarn(MODULE, 'Call blocked - no valid session');



        this._notifyListeners('call_blocked', { reason: 'no_valid_session' });



        return { success: false, reason: 'no_valid_session' };



    }



    



    if (!activeToken) {



        logWarn(MODULE, 'Call blocked - no token');



        this._notifyListeners('call_blocked', { reason: 'no_token' });



        return { success: false, reason: 'no_token' };



    }



    



    // Sync session



    if (!this._session) {



        this._session = activeSession;



        this._token = activeToken;



        logInfo(MODULE, 'Synced CallsStateGovernor session from callsState');



    }



    



    const permCheck = await PermissionManager.checkPermissions({

        audio: CONFIG.AUDIO_CONSTRAINTS,

        video: callType === 'video'



    });



    



    if (!permCheck.success) {



        logWarn(MODULE, 'Call blocked - permission check failed', { error: permCheck.error });



        this._notifyListeners('permission_denied', { error: permCheck.error });



        return { success: false, reason: 'permission_denied', error: permCheck.error };



    }



    



    const verifyResult = await this.verifySession(true);



    



    if (!verifyResult.valid) {



        logWarn(MODULE, 'Call blocked - session verification failed', verifyResult);



        return { success: false, reason: 'verification_failed' };



    }



    



    callsState.verified = true;



    



    try {



        const constraints = {



            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },



            video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false



        };



        



        const streamResult = await MediaManager.getLocalStream(constraints);



        



        if (!streamResult.success) {



            throw new Error(streamResult.error || 'Failed to get media stream');



        }



        



        const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;



        



        // Sync call origin from global flag set by calls-ui before initiateCall



        if (window.__pendingCallReturnTo && !callsState.pendingCallReturnTo) {



            callsState.pendingCallReturnTo = window.__pendingCallReturnTo;



        }



        



        // Set active call
        setActiveCall(callId, callType, participants);

        // ✅ FIX: Mark as caller so isCaller check in handleCallAccepted always works
        callsState._isCaller = true;
        window.__callerCallId = callId;
        console.log('[CallsCore] Caller flag set for callId:', callId);

        // Set up WebRTC
        WebRTCManager.createPeerConnection();



        WebRTCManager.addStream(streamResult.stream);



        WebRTCManager.setCurrentCallId(callId);



        WebRTCManager.setConnectionTimeout(CONFIG.CALL_CONNECTION_TIMEOUT);



        



        const isGroupCall = Array.isArray(participants) && participants.length > 1;



        



        logCall(MODULE, 'Sending CALL_INITIATE to parent', { callId, callType, participants, isGroupCall });



        



        // ── LOCAL-FIRST: create local call record immediately ──────────────



        (function _saveLocalCallRecord() {



            const store = window.KynectaCallLocalStore;



            if (!store) return;



            store.save({



                id: callId,



                serverId: null,



                callerId: callsState.session?.userId || null,



                receiverId: (!isGroupCall && participants[0]) ? (typeof participants[0] === 'object' ? participants[0].id : parseInt(participants[0])) : null,



                type: callType,



                status: 'initiated',



                isLocalOnly: true,



                isGroupCall: isGroupCall,



                participants: participants.map(p => typeof p === 'object' ? p.id : parseInt(p)),



                createdAt: Date.now()



            }).catch(() => {});



        })();







        // ── SESSION MANAGER: register outgoing session ──────────────────────



        // ✅ FIX: Pre-warm AppCache before calling startOutgoing so



        // callSession.manager.js _createLocalHistory never hits "AppCache never became available"



        (async function _registerSession() {



            const mgr = window.KynectaCallSession;



            if (!mgr || mgr.isActive) return;



            try {



                // Give AppCache a chance to initialise (max 2s, non-blocking)



                if (window.AppCache && typeof window.AppCache.ready === 'function') {



                    try { await Promise.race([



                        window.AppCache.ready(),



                        new Promise(r => setTimeout(r, 2000))



                    ]); } catch(_) {}



                } else if (window.KynectaCache && typeof window.KynectaCache.ready === 'function') {



                    try { await Promise.race([



                        window.KynectaCache.ready(),



                        new Promise(r => setTimeout(r, 2000))



                    ]); } catch(_) {}



                }



                mgr.startOutgoing({



                    callerId: callsState.session?.userId,



                    receiverId: (!isGroupCall && participants[0]) ? (typeof participants[0] === 'object' ? participants[0].id : parseInt(participants[0])) : null,



                    callType: callType,



                    localCallId: callId,



                    participants: participants



                });



            } catch(e) { console.warn('[CallsCore] Session mgr start failed:', e.message); }



        })();







        // ── RETRY ENGINE: send CALL_INITIATE with auto-retry ────────────────



        const _signalPayload = {



            callId: callId,



            callType: callType,



            participantIds: isGroupCall ? participants.map(p => typeof p === 'object' ? p.id : parseInt(p)) : null,



            calleeId: (!isGroupCall && participants[0]) ? (typeof participants[0] === 'object' ? participants[0].id : parseInt(participants[0])) : null,



            isGroupCall: isGroupCall,



            returnTo: callsState.pendingCallReturnTo || window.__pendingCallOrigin || 'calls',



            callSource: callsState.pendingCallSource || 'calls',



            timestamp: Date.now()



        };







        let result;



        const retryEngine = window.KynectaCallRetry;



        if (retryEngine && !retryEngine.isActive) {



            result = await new Promise((resolve) => {



                retryEngine.execute(



                    async (attempt) => {



                        logCall(MODULE, `call:initiate attempt ${attempt}`, { callId });



                        const r = await safeSend('call:initiate', { ..._signalPayload, timestamp: Date.now() }, true);



                        if (r && r.success !== false) return { success: true, ...r };



                        throw new Error(r?.reason || r?.error || 'signal_failed');



                    },



                    (successResult) => resolve(successResult),



                    (failInfo)      => resolve({ success: false, reason: failInfo.reason || 'retries_exhausted' }),



                    { label: 'call:initiate', maxAttempts: 3, baseDelay: 3000 }



                );



            });



        } else {



            // Fallback: direct send (no retry available or already retrying)



            result = await safeSend('call:initiate', _signalPayload, true);



        }







        if (result.success === false) {



            resetCallState();



            callsState.callActive = false;



            callsState.callState = 'idle';



            callsState.activeCallId = null;



            // Update local history to failed



            const store = window.KynectaCallLocalStore;



            if (store) store.updateStatus(callId, 'failed').catch(() => {});



            // Clear session



            const mgr = window.KynectaCallSession;



            if (mgr && mgr.isActive) mgr.end('failed');



            throw new Error(result.reason || result.error || 'Failed to initiate call');



        }



        



        // Set invitation timeout (3 minutes)
        callsState.callInvitationTimer = setTimeout(() => {
            if (callsState.callState === 'initiating') {
                logWarn(MODULE, 'Call invitation timed out (3 min) — recording as no_answer on caller side');
                // Caller side: no_answer = outgoing unanswered (NOT missed)
                this.endCall(callId, { status: 'no_answer' });
                this._notifyListeners('call_timeout', { callId, status: 'no_answer' });
                notifyListeners('call_timeout', { callId, status: 'no_answer' });
                // Signal parent to record receiver-side missed call
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'RECORD_MISSED_CALL',
                        payload: { callId, timestamp: Date.now() }
                    }, '*');
                }
            }
        }, CONFIG.CALL_INVITATION_TIMEOUT);



        



        this.transition(CALLS_STATE.CALL_READY, 'call_initiated');



        



        logSuccess(MODULE, 'Call initiated', { type: callType, callId, isGroupCall });



        



        return { 



            success: true, 



            callId,



            stream: streamResult.stream



        };



        



    } catch (error) {



        logError(MODULE, 'Failed to initiate call', error);



        resetCallState();



        callsState.callActive = false;



        callsState.callState = 'idle';



        callsState.activeCallId = null;



        return { success: false, reason: error.message };



    }



},



        



        acceptCall: async function(callId) {



            // CRITICAL: Single active call enforcement



            if (!enforceSingleActiveCall()) {



                logWarn(MODULE, 'Cannot accept call - another call already active');



                this._notifyListeners('call_blocked', { reason: 'call_active' });



                return { success: false, reason: 'call_active' };



            }



            



            if (!assertActive('acceptCall')) {



                return { success: false, reason: 'not_active' };



            }



            



            // CRITICAL: Verify valid session before accepting call



            // Use callsState.session as fallback



            const activeSession = (this._session && this._session.authenticated) ? this._session : callsState.session;



            if (!activeSession || !__isValidSession(activeSession)) {



                logWarn(MODULE, 'Cannot accept call - no valid session');



                return { success: false, reason: 'no_valid_session' };



            }



            



            logCall(MODULE, 'Accepting call', { callId });



            



            try {



                // Determine call type from callData if available



                const callType = callsState.callData?.callType || 'voice';



                const constraints = {


                    // FIX: use full audio constraints (echo cancel, noise suppress) on callee side
                    audio: CONFIG.AUDIO_CONSTRAINTS,


                    video: callType === 'video'



                };



                



                const streamResult = await MediaManager.getLocalStream(constraints);



                



                if (!streamResult.success) {



                    throw new Error(streamResult.error || 'Failed to get media stream');



                }



                



                // Set active call



                setActiveCall(callId, callType, []);



                



                // Set up WebRTC



                WebRTCManager.createPeerConnection();



                WebRTCManager.addStream(streamResult.stream);



                WebRTCManager.setCurrentCallId(callId);



                WebRTCManager.setConnectionTimeout(CONFIG.CALL_CONNECTION_TIMEOUT);



                



                // ── Bug 1 fix: send call:accept as a direct postMessage type



                // so chat.html's dedicated call:accept handler fires it to



                // POST /calls/:id/answer on the backend. ───────────────────────



                const result = await safeSend('call:accept', {



                    callId,



                    timestamp: Date.now()



                }, false);  // no ack needed — backend confirms via ws event



                // We don't block on result here; if send failed the call will timeout



                



                this.transition(CALLS_STATE.IN_CALL, 'call_accepted');

                // FIX: notify UI so handleCallAccepted fires on receiver side
                this._notifyListeners('call_accepted', {
                    callId,
                    callType,
                    callerName: (callsState.callData && (callsState.callData.callerName || callsState.callData.fromUserName)) || ''
                });

                // NOTE: Do NOT postMessage CALL_ACCEPTED to parent here.
                // The parent chat.html would re-open the calls panel showing the idle
                // 'Ready to Connect' screen over the in-call screen.
                // The caller's iframe receives CALL_ACCEPTED via the backend WebSocket.

                return { success: true };



                



            } catch (error) {



                logError(MODULE, 'Failed to accept call', error);



                resetCallState();



                return { success: false, reason: error.message };



            }



        },



        



        rejectCall: async function(callId, reason = 'declined') {



            if (!assertActive('rejectCall')) {



                return { success: false, reason: 'not_active' };



            }



            



            logCall(MODULE, 'Rejecting call', { callId, reason });



            



            try {



                // ── Bug 1 fix: send CALL_REJECT as direct postMessage type



                // so chat.html's CALL_REJECT handler hits POST /calls/:id/reject ──



                safeSend('CALL_REJECT', {



                    callId,



                    reason,



                    timestamp: Date.now()



                }, false);







                if (callsState.activeCallId === callId) {



                    var _rejReturnTarget = (callsState && (callsState.pendingCallReturnTo || callsState.pendingCallSource)) || 'conversations';

                    resetCallState();

                    // ── FIX: rejectCall() never told the parent to navigate back —
                    // the receiver declining an incoming call was left stuck on
                    // whatever screen happened to be showing.
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _rejReturnTarget, timestamp: Date.now() }, '*');
                        }
                    } catch (_e) {}

                }



                



                return { success: true };



                



            } catch (error) {



                logError(MODULE, 'Failed to reject call', error);



                return { success: false, reason: error.message };



            }



        },



endCall: async function(callId, options = {}) {



    if (!callId && callsState.activeCallId) {



        callId = callsState.activeCallId;



    }



    



    if (!callId) {



        logWarn(MODULE, 'No active call to end');



        return { success: false, reason: 'no_active_call' };



    }



    



    const duration = options.duration || 



        (callsState.callStartTime ? Math.floor((Date.now() - callsState.callStartTime) / 1000) : 0);



    



    const status = options.status || 



        (callsState.callState === 'connected' && duration > 0 ? 'completed' : 



         callsState.callState === 'incoming' ? 'missed' : 



         callsState.callState === 'initiating' ? 'cancelled' : 'failed');



    



    logCall(MODULE, 'Ending call', { callId, duration, status });



    



    try {



        // Use server UUID (real DB id) if available; fall back to passed callId



        // callsState.serverCallId is set in handleCallInitiated when parent responds



        let numericCallId = callsState.serverCallId || callId;



        // Strip local call_TIMESTAMP_random format if no server UUID available



        if (numericCallId && typeof numericCallId === 'string' && numericCallId.startsWith('call_')) {



            // Still local ID — no server UUID was received. Use whatever we have.



            // The chat.html __callIdMap will translate it via the API_REQUEST intercept.



            numericCallId = numericCallId; // keep as-is; chat.html translates it



        }



        



        // ── Bug 5 fix: send CALL_ENDED as direct postMessage type



        // so chat.html's CALL_ENDED handler POSTs to /calls/:id/end ──────────



        safeSend('CALL_ENDED', {



            callId: numericCallId,



            duration: duration,



            status: status,



            timestamp: Date.now()



        }, false);



        



        // Send API request directly



        if (window.parent && window.parent !== window && numericCallId) {



            window.parent.postMessage({



                type: 'API_REQUEST',



                payload: {



                    endpoint: `/calls/${numericCallId}/end`,



                    method: 'POST',



                    body: { duration, status },



                    requestId: `end_call_${Date.now()}`



                }



            }, '*');



        }



        



        // ── FIX: Capture the return target BEFORE resetCallState() wipes it.
        // endCall() never sent POST_CALL_RESTORE — the only function that did
        // (clearActiveCall) was dead code, never called from anywhere. This is
        // why the caller/receiver never navigated back to their origin page
        // after hanging up; the screen just sat in the calls module forever.
        var _ecReturnTarget = (callsState && (callsState.pendingCallReturnTo || callsState.pendingCallSource)) || 'conversations';

        // CRITICAL: Reset ALL call state variables



        resetCallState();



        callsState.callActive = false;



        callsState.callState = 'idle';



        callsState.activeCallId = null;



        callsState.activeCall = null;



        callsState.callType = null;



        callsState.callParticipants = [];



        callsState.callStartTime = null;



        callsState.connectionState = 'new';



        callsState.signalingState = 'new';

        // ── FIX: Now actually tell the parent to navigate back to where this
        // user was before the call started/was received.
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _ecReturnTarget, timestamp: Date.now() }, '*');
            }
        } catch (_e) {}



        



        // Clear any pending timers



        if (callsState.callInvitationTimer) {



            clearTimeout(callsState.callInvitationTimer);



            callsState.callInvitationTimer = null;



        }



        



        // Clean up media and WebRTC



        MediaManager.stopLocalStream();



        WebRTCManager.close();



        



        if (this._currentState === CALLS_STATE.IN_CALL) {



            this.transition(CALLS_STATE.CALL_READY, 'call_ended');



        }



        



        this._notifyListeners('call_ended', { callId, duration, status });



        notifyListeners('call_ended', { callId, duration, status });



        



        // Force refresh of call history



        setTimeout(() => {



            if (window.parent && window.parent !== window) {



                window.parent.postMessage({



                    type: 'REFRESH_CALL_HISTORY',



                    payload: { userId: callsState.session?.userId, timestamp: Date.now() }



                }, '*');



            }



            if (typeof loadCallHistory === 'function') {



                loadCallHistory();



            }



        }, 500);



        



        return { success: true, duration, status };



        



    } catch (error) {



        logError(MODULE, 'Failed to end call', error);



        resetCallState();



        callsState.callActive = false;



        callsState.callState = 'idle';



        callsState.activeCallId = null;



        return { success: false, reason: error.message };



    }



},







        handleIncomingCall: function(callData) {



            logCall(MODULE, 'Incoming call received (Governor)', callData);







            // ── FIX: Do NOT block on parentReady or assertActive here.



            // This method is called from notifyListeners which may fire before



            // the lifecycle is fully ACTIVE (e.g. after SW reload). Blocking



            // here is the second silent drop-point for incoming calls.



            const blockedStates = [LifecycleState.BOOT, LifecycleState.INITIALIZING];



            if (blockedStates.includes(currentState)) {



                logWarn(MODULE, `Governor.handleIncomingCall: blocked (${currentState})`);



                return;



            }



            // Auto-promote if session available



            if (currentState !== LifecycleState.ACTIVE) {



                const sess = (this._session && this._session.authenticated) ? this._session : callsState.session;



                if (sess && sess.authenticated) {



                    logWarn(MODULE, 'Governor.handleIncomingCall: auto-promoting to ACTIVE');



                    currentState = LifecycleState.ACTIVE;



                } else {



                    logWarn(MODULE, 'Governor.handleIncomingCall: no session — dropping');



                    return;



                }



            }







            // CRITICAL: Check for valid session using fallback



            const activeSession = (this._session && this._session.authenticated) ? this._session : callsState.session;



            if (!activeSession || !__isValidSession(activeSession) || activeSession.expiresAt <= Date.now()) {



                logWarn(MODULE, 'Incoming call rejected - session invalid');



                return;



            }



            



            if (callsState.recoveryMode) {



                logWarn(MODULE, 'Incoming call queued - recovery mode active');



                return;



            }



            



            // CRITICAL: Check for existing active call



            if (callsState.callActive) {



                logWarn(MODULE, 'Incoming call rejected - already in a call');



                



                // Bug 1 fix: use direct CALL_REJECT message so parent hits backend



                safeSend('CALL_REJECT', {



                    callId: callData.callId,



                    reason: 'busy',



                    timestamp: Date.now()



                }, false);



                return;



            }



            



            this.verifySession().then(result => {



                if (!result.valid) {



                    logWarn(MODULE, 'Incoming call rejected - verification failed');



                    return;



                }



                



                // CRITICAL FIX: Set activeCallId for incoming calls



                callsState.callData = callData;



                callsState.callState = 'incoming';



                callsState.activeCallId = callData.callId || callData.id || callsState.activeCallId;  // ← CRITICAL: Set activeCallId for incoming calls



                callsState.callActive = false; // Not yet active until answered



                this._notifyListeners('incoming_call', callData);



                notifyListeners('incoming_call', callData);



            });



        },



        



        getState: function() {



            return this._currentState;



        },



        



        getSession: function() {



            return this._session ? { ...this._session } : null;



        },



        



        isActive: function() {



            return this._currentState === CALLS_STATE.ACTIVE && this._validSessionConfirmed;



        },



        



        isCallReady: function() {



            return this._currentState === CALLS_STATE.CALL_READY;



        },



        



        isInCall: function() {



            return this._currentState === CALLS_STATE.IN_CALL;



        },



        



        canInitiateCall: function() {



            const activeSession = (this._session && this._session.authenticated) ? this._session : callsState.session;



            const activeToken = this._token || callsState.token;



            



            return this._currentState === CALLS_STATE.ACTIVE && 



                   activeSession && 



                   __isValidSession(activeSession) &&



                   activeSession.expiresAt > Date.now() &&



                   callsState.verified &&



                   callsState.parentReady &&



                   !callsState.recoveryMode &&



                   !callsState.callActive;



        },



        



        addListener: function(listener) {



            if (typeof listener === 'function') this._stateChangeListeners.add(listener);



        },



        



        removeListener: function(listener) {



            this._stateChangeListeners.delete(listener);



        },



        



        _notifyListeners: function(event, data) {



            this._stateChangeListeners.forEach(listener => {



                try { listener(event, data); } catch (e) {}



            });



        },



        



      reset: function() {



    this._clearTimers();



    if (this._staleCallCleanupInterval) {



        clearInterval(this._staleCallCleanupInterval);



        this._staleCallCleanupInterval = null;



    }



            this._currentState = CALLS_STATE.INIT;



            this._previousState = null;



            this._moduleRegistered = false;



            this._sessionReceived = false;



            this._parentReadyReceived = false;



            this._session = null;



            this._token = null;



            this._verificationInProgress = false;



            this._validSessionConfirmed = false;



            resetCallState();



            callsState.registered = false;



            callsState.parentReady = false;



            callsState.session = null;



            callsState.sessionStatus = 'pending';



            callsState.token = null;



            callsState.verified = false;



            callsState.verificationLock = false;



            callsState.recoveryMode = false;



            callsState.sessionReceived = false;



            callsState.childReadySent = false;



            callsState.registrationSent = false;



            validSessionConfirmed = false;



            transitionTo(LifecycleState.INITIALIZING);



            



            MediaManager.stopLocalStream();



            WebRTCManager.close();



        },



        



        _clearTimers: function() {



            if (callsState.callInvitationTimer) {



                clearTimeout(callsState.callInvitationTimer);



                callsState.callInvitationTimer = null;



            }



        }



    };



    



    CallsStateGovernor.initialize();



    



    // ==================== V5 STATE GOVERNOR (Compatibility) ====================



    const V5StateGovernor = {



        _currentV5State: V5_STATE.BOOTING,



        



        initialize: function() {



            logInfo(MODULE, 'V5StateGovernor initialized (compatibility)');



            return this;



        },



        



        transition: function(newV5State, reason = '') {



            const mapping = {



                [V5_STATE.BOOTING]: CALLS_STATE.INIT,



                [V5_STATE.REGISTERING]: CALLS_STATE.REGISTERING,



                [V5_STATE.WAITING_SESSION]: CALLS_STATE.REGISTERED,



                [V5_STATE.WAITING_PARENT_READY]: CALLS_STATE.SESSION_RECEIVED,



                [V5_STATE.ACTIVE]: CALLS_STATE.ACTIVE,



                [V5_STATE.DEGRADED]: CALLS_STATE.TERMINATED,



                [V5_STATE.STANDALONE]: CALLS_STATE.TERMINATED,



                [V5_STATE.OFFLINE]: CALLS_STATE.TERMINATED



            };



            



            const callsState = mapping[newV5State] || CALLS_STATE.INIT;



            CallsStateGovernor.transition(callsState, reason);



            return true;



        },



        



        startRegistration: function() {



            CallsStateGovernor.startHandshake();



        },



        



        handleModuleRegistered: function() {



            CallsStateGovernor.handleModuleRegistered();



        },



        



        handleSessionActive: function(sessionData) {



            CallsStateGovernor.handleSessionActive(sessionData);



        },



        



        handleSessionNull: function() {



            CallsStateGovernor.handleSessionNull();



        },



        



        handleParentReady: function() {



            CallsStateGovernor.handleParentReady();



        },



        



        handleHeartbeatAck: function() {



        },



        



        handleOnline: function() {



        },



        



        handleOffline: function() {



        },



        



        verifySession: function(force) {



            return CallsStateGovernor.verifySession(force);



        },



        



        queueMessage: function(message) {



        },



        



        canSendOperational: function() {



            return CallsStateGovernor.isActive() && CallsStateGovernor._parentReadyReceived;



        },



        



        getState: function() {



            const callsState = CallsStateGovernor.getState();



            const mapping = {



                [CALLS_STATE.INIT]: V5_STATE.BOOTING,



                [CALLS_STATE.REGISTERING]: V5_STATE.REGISTERING,



                [CALLS_STATE.REGISTERED]: V5_STATE.WAITING_SESSION,



                [CALLS_STATE.SESSION_RECEIVED]: V5_STATE.WAITING_PARENT_READY,



                [CALLS_STATE.ACTIVE]: V5_STATE.ACTIVE,



                [CALLS_STATE.CALL_READY]: V5_STATE.ACTIVE,



                [CALLS_STATE.IN_CALL]: V5_STATE.ACTIVE,



                [CALLS_STATE.TERMINATED]: V5_STATE.DEGRADED



            };



            return mapping[callsState] || V5_STATE.BOOTING;



        },



        



        isActive: function() {



            return CallsStateGovernor.isActive();



        },



        



        isDegraded: function() {



            return CallsStateGovernor.getState() === CALLS_STATE.TERMINATED;



        },



        



        isOffline: function() {



            return !navigator.onLine;



        },



        



        addListener: function(listener) {



            CallsStateGovernor.addListener(listener);



        },



        



        removeListener: function(listener) {



            CallsStateGovernor.removeListener(listener);



        },



        



        reset: function() {



            CallsStateGovernor.reset();



        }



    };



    



    V5StateGovernor.initialize();



    



    // ==================== STATE GOVERNOR ====================



    const StateGovernor = {



        _currentState: STATE.UNINITIALIZED,



        _previousState: null,



        _stateLock: false,



        _transitionLock: false,



        _stateChangeListeners: new Set(),



        _initializationPromise: null,



        _initializationResolve: null,



        _initializationReject: null,



        _sessionPromise: null,



        _sessionResolve: null,



        _sessionReject: null,



        _sessionTimeoutId: null,



        _initialized: false,



        _sessionActive: false,



        _fatalError: null,



        _allowTransitions: true,



        _validSessionConfirmed: false,



        



        initialize: function() {



            if (this._initializationPromise) return this._initializationPromise;



            



            this._initializationPromise = new Promise((resolve, reject) => {



                this._initializationResolve = resolve;



                this._initializationReject = reject;



            });



            



            this._transition(STATE.UNINITIALIZED, STATE.BOOTSTRAPPING, 'initialize');



            return this._initializationPromise;



        },



        



        _transition: function(newState, reason = '') {



            if (!this._allowTransitions) {



                return false;



            }



            



            if (this._stateLock || this._transitionLock) {



                return false;



            }



            



            const oldState = this._currentState;



            if (oldState === newState) return false;



            



            if (!this._isLegalTransition(oldState, newState)) {



                logWarn(MODULE, `Illegal state transition: ${oldState} → ${newState}`);



                return false;



            }



            



            this._previousState = oldState;



            this._currentState = newState;



            



            this._updateDerivedState(newState);



            



            logState(MODULE, oldState, newState, reason);



            



            this._notifyListeners('state', { oldState, newState, reason });



            



            this._resolvePromisesForState(newState);



            



            return true;



        },



        



        transition: function(newState, reason = '') {



            return this._transition(newState, reason);



        },



        



        _isLegalTransition: function(from, to) {



            if (to === STATE.ERROR_RECOVERABLE || to === STATE.ERROR_FATAL) return true;



            if (to === STATE.RECOVERING) return from === STATE.ERROR_RECOVERABLE || from === STATE.ERROR_FATAL;



            



            const forwardTransitions = {



                [STATE.UNINITIALIZED]: [STATE.BOOTSTRAPPING],



                [STATE.BOOTSTRAPPING]: [STATE.REGISTERING, STATE.ERROR_RECOVERABLE],



                [STATE.REGISTERING]: [STATE.REGISTERED, STATE.ERROR_RECOVERABLE],



                [STATE.REGISTERED]: [STATE.SESSION_PENDING, STATE.ERROR_RECOVERABLE],



                [STATE.SESSION_PENDING]: [STATE.SESSION_ACTIVE, STATE.ERROR_RECOVERABLE],



                [STATE.SESSION_ACTIVE]: [STATE.SERVICES_INITIALIZING, STATE.ERROR_RECOVERABLE],



                [STATE.SERVICES_INITIALIZING]: [STATE.ACTIVE, STATE.ERROR_RECOVERABLE],



                [STATE.ACTIVE]: [STATE.SUSPENDED, STATE.DEGRADED, STATE.ERROR_RECOVERABLE],



                [STATE.SUSPENDED]: [STATE.ACTIVE, STATE.DEGRADED, STATE.ERROR_RECOVERABLE],



                [STATE.DEGRADED]: [STATE.RECOVERING, STATE.ERROR_RECOVERABLE],



                [STATE.RECOVERING]: [STATE.BOOTSTRAPPING, STATE.ERROR_FATAL],



                [STATE.ERROR_RECOVERABLE]: [STATE.RECOVERING, STATE.ERROR_FATAL],



                [STATE.ERROR_FATAL]: [STATE.RECOVERING]



            };



            



            return forwardTransitions[from] ? forwardTransitions[from].includes(to) : false;



        },



        



        _updateDerivedState: function(state) {



            switch (state) {



                case STATE.SESSION_ACTIVE:



                    this._sessionActive = true;



                    break;



                case STATE.ACTIVE:



                    this._initialized = true;



                    break;



                case STATE.ERROR_FATAL:



                    this._fatalError = true;



                    break;



            }



        },



        



        _resolvePromisesForState: function(state) {



            if (state === STATE.ACTIVE && this._initializationResolve) {



                this._initializationResolve({ success: true, state: STATE.ACTIVE });



                this._initializationResolve = null;



                this._initializationReject = null;



            }



            



            if (state === STATE.SESSION_ACTIVE && this._sessionResolve) {



                this._sessionResolve({ success: true });



                this._sessionResolve = null;



                this._sessionReject = null;



            }



            



            if (state === STATE.ERROR_FATAL) {



                if (this._initializationReject) {



                    this._initializationReject(new Error('Initialization failed: fatal error'));



                    this._initializationResolve = null;



                    this._initializationReject = null;



                }



                if (this._sessionReject) {



                    this._sessionReject(new Error('Session acquisition failed: fatal error'));



                    this._sessionResolve = null;



                    this._sessionReject = null;



                }



            }



        },



        



        lock: function() {



            if (this._stateLock) return false;



            this._stateLock = true;



            return true;



        },



        



        unlock: function() {



            this._stateLock = false;



        },



        



        transitionLock: function() {



            if (this._transitionLock) return false;



            this._transitionLock = true;



            return true;



        },



        



        transitionUnlock: function() {



            this._transitionLock = false;



        },



        



        disableTransitions: function() {



            this._allowTransitions = false;



        },



        



        enableTransitions: function() {



            this._allowTransitions = true;



        },



        



        getState: function() { return this._currentState; },



        isInitialized: function() { return this._initialized; },



        isSessionActive: function() { return this._sessionActive; },



        hasFatalError: function() { return this._fatalError; },



        



        waitForSession: function(timeout = 5000) {



            if (this._sessionActive) {



                logInfo(MODULE, 'Session already active, resolving immediately');



                return Promise.resolve({ success: true, immediate: true });



            }



            



            if (callsState.session && __isValidSession(callsState.session)) {



                logInfo(MODULE, 'Valid session found in callsState');



                this._sessionActive = true;



                this._validSessionConfirmed = true;



                return Promise.resolve({ success: true, fromState: true });



            }



            



            if (this._fatalError) {



                return Promise.reject(new Error('Fatal error occurred'));



            }



            



            if (this._sessionPromise) {



                logInfo(MODULE, 'Returning existing session promise');



                return this._sessionPromise;



            }



            



            logInfo(MODULE, `Creating new session promise with timeout ${timeout}ms`);



            



            this._sessionPromise = new Promise((resolve) => {



                this._sessionResolve = resolve;



                



                this._sessionTimeoutId = setTimeout(() => {



                    if (callsState.session && __isValidSession(callsState.session)) {



                        logInfo(MODULE, 'Session became valid during timeout');



                        this._sessionActive = true;



                        this._validSessionConfirmed = true;



                        callsState.sessionReceived = true;



                        callsState.sessionStatus = 'valid';



                        if (this._sessionResolve) {



                            this._sessionResolve({ success: true, delayed: true });



                        }



                    } else {



                        logWarn(MODULE, `Session acquisition timeout after ${timeout}ms - continuing with pending state`);



                        if (this._sessionResolve) {



                            this._sessionResolve({ success: true, pending: true, timeout: true });



                        }



                    }



                    



                    this._sessionPromise = null;



                    this._sessionResolve = null;



                    this._sessionReject = null;



                    this._sessionTimeoutId = null;



                }, timeout);



            });



            



            return this._sessionPromise;



        },



        



        addListener: function(listener) {



            if (typeof listener === 'function') this._stateChangeListeners.add(listener);



        },



        



        removeListener: function(listener) {



            this._stateChangeListeners.delete(listener);



        },



        



        _notifyListeners: function(event, data) {



            this._stateChangeListeners.forEach(listener => {



                try { listener(event, data); } catch (e) {}



            });



        },



        



        reset: function() {



            this._currentState = STATE.UNINITIALIZED;



            this._previousState = null;



            this._initialized = false;



            this._sessionActive = false;



            this._validSessionConfirmed = false;



            this._fatalError = null;



            this._initializationPromise = null;



            this._initializationResolve = null;



            this._initializationReject = null;



            this._sessionPromise = null;



            this._sessionResolve = null;



            this._sessionReject = null;



            if (this._sessionTimeoutId) {



                clearTimeout(this._sessionTimeoutId);



                this._sessionTimeoutId = null;



            }



        }



    };



    



    // ==================== IFRAME SESSION CLIENT ====================



    const IframeSessionClient = {



        _session: null,



        _token: null,



        _userId: null,



        _expiresAt: null,



        _state: 'pending',



        _valid: false,



        _guestMode: false,



        _refreshTimer: null,



        _checkTimer: null,



        _listeners: new Set(),



        _expiryWarningSent: false,



        _usingCachedSession: false,



        _tokenReceived: false,



        _processingToken: false,



        _sessionPromise: null,



        _sessionResolve: null,



        _sessionReject: null,



        _initLock: false,



        _lastSessionId: null,



        



        initialize: function() {



            if (this._initLock) return this;



            this._initLock = true;



            



            this._state = 'pending';



            this._valid = false;



            



            this._setupListeners();



            this._startRefreshTimer();



            this._startCheckTimer();



            



            logReady(MODULE, 'IframeSessionClient initialized', { state: this._state });



            return this;



        },



        



        _resolveSessionPromise: function() {



            if (this._sessionResolve) {



                this._sessionResolve({ success: true });



                this._sessionResolve = null;



                this._sessionReject = null;



                this._sessionPromise = null;



            }



        },



        



        _rejectSessionPromise: function(error) {



            if (this._sessionReject) {



                this._sessionReject(error);



                this._sessionResolve = null;



                this._sessionReject = null;



                this._sessionPromise = null;



            }



        },



        



        waitForSession: function(timeout = 5000) {



            if (this._valid) {



                return Promise.resolve({ success: true });



            }



            



            if (this._sessionPromise) {



                return this._sessionPromise;



            }



            



            this._sessionPromise = new Promise((resolve, reject) => {



                this._sessionResolve = resolve;



                this._sessionReject = reject;



                



                setTimeout(() => {



                    if (this._sessionPromise && this._sessionReject) {



                        this._sessionReject(new Error('Session acquisition timeout'));



                        this._sessionResolve = null;



                        this._sessionReject = null;



                        this._sessionPromise = null;



                        logSession(MODULE, 'acquisition timeout');



                    }



                }, timeout);



            });



            



            return this._sessionPromise;



        },



        



        _setupListeners: function() {



        },



        



        _handleSessionUpdate: function(data) {



            let updated = false;



            let hadToken = !!this._token;



            



            // Session deduplication



            const sessionId = data.sessionId || data.id;



            if (sessionId && this._lastSessionId === sessionId) {



                logInfo(MODULE, 'Duplicate session update ignored', { sessionId });



                return;



            }



            if (sessionId) {



                this._lastSessionId = sessionId;



            }



            



            // CRITICAL: Validate session data



            if (data.token && (!data.userId || data.userId === 'user' || data.userId === 0)) {



                logWarn(MODULE, 'Session update rejected - invalid userId', { userId: data.userId });



                return;



            }



            



            if (data.token) {



                this._token = data.token;



                this._tokenReceived = true;



                updated = true;



                logSession(MODULE, 'token received');



            }



            



            if (data.userId || data.user?.id) {



                const newUserId = data.userId || data.user?.id;



                // Reject invalid userId



                if (newUserId === 'user' || newUserId === 0) {



                    logWarn(MODULE, 'Session update rejected - invalid userId', { userId: newUserId });



                    return;



                }



                this._userId = newUserId;



                updated = true;



            }



            



            if (data.expires || data.expiry) {



                this._expiresAt = data.expires || data.expiry;



                updated = true;



            }



            



            if (data.authenticated !== undefined) {



                this._valid = data.authenticated;



                this._state = data.authenticated ? 'valid' : 'invalid';



                updated = true;



            }



            



            if (updated) {



                this._updateSession();



                this._expiryWarningSent = false;



                this._usingCachedSession = false;



                



                this._notifyListeners('update', data);



                



                if (this._sessionResolve) {



                    logSession(MODULE, 'resolving promise from update');



                    this._sessionResolve({ success: true, fromUpdate: true });



                    this._sessionResolve = null;



                    this._sessionReject = null;



                    this._sessionPromise = null;



                }



                



                logSession(MODULE, 'updated from parent' + (hadToken ? ' (refresh)' : ''));



            }



        },



        



        _handleTokenUpdate: function(data) {



            if (this._processingToken) return;



            this._processingToken = true;



            



            try {



                if (!data || !data.token) return;



                if (this._token === data.token) return;



                



                // CRITICAL: Only update if we have valid session context



                if (this._userId && this._userId !== 'user' && this._userId !== 0) {



                    this._token = data.token;



                    this._tokenReceived = true;



                    this._expiresAt = data.expires || data.expiry || (Date.now() + 3600000);



                    this._state = 'valid';



                    this._valid = true;



                    



                    this._updateSession();



                    



                    this._notifyListeners('token', data);



                    this._resolveSessionPromise();



                    logSession(MODULE, 'updated from parent');



                } else {



                    logWarn(MODULE, 'Token update rejected - no valid userId context');



                }



                



            } finally {



                setTimeout(() => { this._processingToken = false; }, 500);



            }



        },



        



        _handleAuthError: function() {



            this.clear();



        },



        



        _updateSession: function() {



            this._session = {



                token: this._token,



                userId: this._userId,



                expiresAt: this._expiresAt,



                valid: this._valid,



                guestMode: this._guestMode,



                sessionId: this._lastSessionId



            };



            



            this._state = this._valid ? 'valid' : 'invalid';



            this._valid = true;



            



            callsState.session = this._session;



            callsState.token = this._token;



            callsState.sessionStatus = this._state;



        },



        



        clear: function() {



            this._session = null;



            this._token = null;



            this._userId = null;



            this._expiresAt = null;



            this._valid = false;



            this._guestMode = false;



            this._state = 'invalid';



            this._usingCachedSession = false;



            this._tokenReceived = false;



            this._lastSessionId = null;



            



            this._notifyListeners('clear', {});



            this._expiryWarningSent = false;



            



            this._rejectSessionPromise(new Error('Session cleared'));



            



            callsState.session = null;



            callsState.token = null;



            callsState.sessionReceived = false;



            callsState.sessionStatus = 'invalid';



            validSessionConfirmed = false;



            



            logInfo(MODULE, 'Session cleared');



        },



        



        _startRefreshTimer: function() {



            if (this._refreshTimer) clearTimeout(this._refreshTimer);



            



            if (!this._expiresAt) return;



            



            const now = Date.now();



            const timeUntilExpiry = this._expiresAt - now;



            const refreshTime = Math.max(0, timeUntilExpiry - 600000);



            



            if (refreshTime <= 0) {



                return;



            }



            



            this._refreshTimer = setTimeout(() => {



                logInfo(MODULE, 'Session expiry approaching - requesting refresh');



                if (parentReady && currentState === LifecycleState.ACTIVE) {



                    SessionClient.requestSession();



                }



            }, refreshTime);



        },



        



        _startCheckTimer: function() {



            if (this._checkTimer) clearInterval(this._checkTimer);



            



            this._checkTimer = setInterval(() => {



                if (this._expiresAt && this._expiresAt < Date.now()) {



                    if (!this._expiryWarningSent) {



                        this._expiryWarningSent = true;



                        this._notifyListeners('expired', {});



                    }



                    



                    this.clear();



                    if (parentReady && currentState === LifecycleState.ACTIVE) {



                        SessionClient.requestSession();



                    }



                } else if (this._expiresAt && (this._expiresAt - Date.now()) < 600000 && !this._expiryWarningSent) {



                    this._expiryWarningSent = true;



                    this._notifyListeners('expiring', { timeLeft: this._expiresAt - Date.now() });



                }



            }, 120000);



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



        



        getSession: function() { return this._session ? { ...this._session } : null; },



        getToken: function() { return this._token; },



        getUserId: function() { return this._userId; },



        getState: function() { return this._state; },



        



        isValid: function() {



            if (!this._token || this._token.length < 10) {



                return false;



            }



            



            if (this._expiresAt && this._expiresAt < Date.now()) {



                return false;



            }



            



            if (!this._userId || this._userId === 'user' || this._userId === 0) {



                return false;



            }



            



            return this._valid;



        },



        



        isDemoMode: function() { return false; },



        isGuestMode: function() { return this._guestMode; },



        getTimeRemaining: function() { return this._expiresAt ? Math.max(0, this._expiresAt - Date.now()) : 0; },



        



        cleanup: function() {



            if (this._refreshTimer) {



                clearTimeout(this._refreshTimer);



                this._refreshTimer = null;



            }



            if (this._checkTimer) {



                clearInterval(this._checkTimer);



                this._checkTimer = null;



            }



            this._listeners.clear();



        }



    };



    



    IframeSessionClient.initialize();



    



    // ==================== RELIABILITY ENGINE ====================



    const ReliabilityEngine = {



        _circuitBreakers: new Map(),



        _retryCounters: new Map(),



        _backoffBase: 500,



        _maxRetries: 1,



        _offlineQueue: [],



        _online: navigator.onLine,



        _listeners: new Set(),



        _sessionActive: false,



        



        initialize: function() {



            this._setupListeners();



            logReady(MODULE, 'ReliabilityEngine initialized');



            return this;



        },



        



        _setupListeners: function() {



            window.addEventListener('online', () => {



                this._online = true;



                this._processOfflineQueue();



            });



            



            window.addEventListener('offline', () => {



                this._online = false;



            });



        },



        



        getCircuitBreaker: function(name) {



            if (!this._circuitBreakers.has(name)) {



                this._circuitBreakers.set(name, new CircuitBreaker(name));



            }



            return this._circuitBreakers.get(name);



        },



        



        canRetry: function(key) {



            return false;



        },



        



        incrementRetry: function(key) {



            return 1;



        },



        



        resetRetry: function(key) {



            this._retryCounters.delete(key);



        },



        



        recordFailure: function(key) {



            const breaker = this.getCircuitBreaker(key);



            breaker.failure();



        },



        



        getBackoffDelay: function(key) {



            return 0;



        },



        



        executeWithRetry: async function(fn, key, options = {}) {



            try {



                return await fn();



            } catch (error) {



                this.recordFailure(key);



                throw error;



            }



        },



        



        queueOffline: function(operation) {



            this._offlineQueue.push({ ...operation, timestamp: Date.now() });



            this._notifyListeners('queued', { type: operation.type });



        },



        



        _processOfflineQueue: function() {



            if (this._offlineQueue.length === 0) return;



            



            const queue = [...this._offlineQueue];



            this._offlineQueue = [];



            



            queue.forEach(operation => {



                try {



                    if (operation.execute) {



                        operation.execute().catch(() => {



                            logWarn(MODULE, 'Offline operation failed', { type: operation.type });



                        });



                    }



                } catch (e) {



                    logWarn(MODULE, 'Offline operation error', e);



                }



            });



        },



        



        setSessionActive: function(active) {



            this._sessionActive = active;



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



                circuitBreakers: this._circuitBreakers.size,



                retryCounters: this._retryCounters.size,



                offlineQueueSize: this._offlineQueue.length,



                sessionActive: this._sessionActive



            };



        }



    };



    



    class CircuitBreaker {



        constructor(name) {



            this.name = name;



            this.failureThreshold = 1;



            this.resetTimeout = 30000;



            this.state = 'CLOSED';



            this.failureCount = 0;



            this.lastFailureTime = null;



            this.nextAttemptTime = null;



        }



        



        success() {



            this.state = 'CLOSED';



            this.failureCount = 0;



        }



        



        failure() {



            this.failureCount++;



            this.lastFailureTime = Date.now();



            



            if (this.failureCount >= this.failureThreshold) {



                this.state = 'OPEN';



                this.nextAttemptTime = Date.now() + this.resetTimeout;



            }



        }



        



        canExecute() {



            if (this.state === 'CLOSED') return true;



            



            if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTime) {



                this.state = 'HALF_OPEN';



                return true;



            }



            



            return this.state === 'HALF_OPEN';



        }



        



        getState() { return this.state; }



    }



    



    ReliabilityEngine.initialize();



    



    // ==================== RECOVERY MANAGER ====================



    const RecoveryManager = {



        _recoveryInProgress: false,



        _recoveryAttempts: 0,



        _maxRecoveryAttempts: 1,



        _recoveryBackoff: 5000,



        _lastCheckpoint: null,



        _checkpoints: [],



        _recoveryTimer: null,



        _listeners: new Set(),



        _recoveryPromise: null,



        



        initialize: function() {



            this._recoveryAttempts = 0;



            this._recoveryInProgress = false;



            this._loadLastCheckpoint();



            logReady(MODULE, 'RecoveryManager initialized');



            return this;



        },



        



        createCheckpoint: function(name, data = {}) {



            // CRITICAL: Never store call state in checkpoints



            const checkpoint = {



                name,



                timestamp: Date.now(),



                state: StateGovernor.getState(),



                sessionValid: IframeSessionClient.isValid(),



                environment: 'production',



                data: { ...data, callState: undefined } // Strip call state



            };



            



            this._checkpoints.push(checkpoint);



            if (this._checkpoints.length > 10) this._checkpoints.shift();



            this._lastCheckpoint = checkpoint;



            



            this._saveCheckpoint();



            



            logInfo(MODULE, `Checkpoint created: ${name}`);



            return checkpoint;



        },



        



        _saveCheckpoint: function() {



            if (this._lastCheckpoint) {



                const safeCheckpoint = {



                    name: this._lastCheckpoint.name,



                    timestamp: this._lastCheckpoint.timestamp,



                    state: this._lastCheckpoint.state



                };



                SafeStorage.set('checkpoint', safeCheckpoint);



            }



        },



        



        _loadLastCheckpoint: function() {



            try {



                SafeStorage.get('checkpoint').then(stored => {



                    if (stored) {



                        this._lastCheckpoint = stored;



                        logInfo(MODULE, 'Loaded last checkpoint', stored);



                    }



                }).catch(() => {});



            } catch (error) {



                logWarn(MODULE, 'Failed to load checkpoint', error);



            }



        },



        



        recover: async function() {



            if (this._recoveryPromise) return this._recoveryPromise;



            



            if (this._recoveryInProgress) {



                return { success: false, reason: 'in_progress' };



            }



            



            if (this._recoveryAttempts >= this._maxRecoveryAttempts) {



                logWarn(MODULE, 'Max recovery attempts reached');



                return { success: false, reason: 'max_attempts' };



            }



            



            this._recoveryInProgress = true;



            this._recoveryAttempts++;



            



            logInfo(MODULE, `Starting recovery (attempt ${this._recoveryAttempts})`);



            this._notifyListeners('start', { attempt: this._recoveryAttempts });



            



            this._recoveryPromise = (async () => {



                try {



                    if (!navigator.onLine) {



                        logWarn(MODULE, 'Recovery: Offline, waiting for network');



                        await this._waitForNetwork();



                    }



                    



                    if (!window.parent || window.parent === window) {



                        logWarn(MODULE, 'Recovery: No parent window');



                        this._recoveryInProgress = false;



                        this._notifyListeners('failed', { reason: 'no_parent' });



                        return { success: false, reason: 'no_parent' };



                    }



                    



                    safeSend('RECOVERY_REQUEST', {



                        module: MODULE_NAME,



                        timestamp: Date.now(),



                        attempts: this._recoveryAttempts



                    }, { requireAck: false }).catch(() => {});



                    



                    logInfo(MODULE, 'Recovery request sent, waiting for parent');



                    



                    this._recoveryAttempts = 0;



                    this._recoveryInProgress = false;



                    



                    logSuccess(MODULE, 'Recovery request sent');



                    this._notifyListeners('request_sent', {});



                    



                    return { success: true, requested: true };



                    



                } catch (error) {



                    logError(MODULE, 'Recovery failed', error);



                    this._recoveryInProgress = false;



                    this._notifyListeners('failed', { error: error.message });



                    return { success: false, reason: error.message };



                } finally {



                    this._recoveryPromise = null;



                }



            })();



            



            return this._recoveryPromise;



        },



        



        _waitForNetwork: function() {



            return new Promise((resolve) => {



                if (navigator.onLine) {



                    resolve();



                    return;



                }



                const handler = () => {



                    window.removeEventListener('online', handler);



                    resolve();



                };



                window.addEventListener('online', handler);



                setTimeout(() => {



                    window.removeEventListener('online', handler);



                    resolve();



                }, 60000);



            });



        },



        



        scheduleRecovery: function(delay = 5000) {



            if (this._recoveryTimer) clearTimeout(this._recoveryTimer);



            



            this._recoveryTimer = setTimeout(() => {



                if (currentState !== LifecycleState.ACTIVE && !callsState.inPassiveMode) {



                    this.recover();



                }



            }, delay);



        },



        



        cancelRecovery: function() {



            if (this._recoveryTimer) {



                clearTimeout(this._recoveryTimer);



                this._recoveryTimer = null;



            }



            if (this._recoveryPromise) this._recoveryPromise = null;



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



                recoveryInProgress: this._recoveryInProgress,



                recoveryAttempts: this._recoveryAttempts,



                maxRecoveryAttempts: this._maxRecoveryAttempts,



                lastCheckpoint: this._lastCheckpoint ? {



                    name: this._lastCheckpoint.name,



                    timestamp: this._lastCheckpoint.timestamp,



                    state: this._lastCheckpoint.state



                } : null,



                checkpoints: this._checkpoints.length



            };



        }



    };



    



    RecoveryManager.initialize();



    



    // ==================== COMPATIBILITY BRIDGE ====================



    const CompatibilityBridge = {



        _legacyMode: false,



        _parentCapabilities: new Set(),



        _detected: false,



        _version: CONFIG.VERSION,



        



        detect: function() {



            if (this._detected) return this._legacyMode;



            



            try {



                const parentProtocol = window.parent?.__PROTOCOL_VERSION__;



                



                if (parentProtocol && parentProtocol >= 'KYN-6.0') {



                    this._legacyMode = false;



                    this._parentCapabilities.add('modern_protocol');



                    logInfo(MODULE, 'Modern parent protocol detected', { version: parentProtocol });



                } else {



                    this._legacyMode = false;



                }



            } catch (e) {



                this._legacyMode = false;



            }



            



            this._detected = true;



            



            logInfo(MODULE, `Compatibility bridge: ${this._legacyMode ? 'legacy' : 'modern'} mode`);



            return this._legacyMode;



        },



        



        adaptOutgoing: function(message) {



            return message;



        },



        



        adaptIncoming: function(rawMessage) {



            if (!rawMessage || typeof rawMessage !== 'object') return null;



            return rawMessage;



        },



        



        supports: function(feature) {



            this.detect();



            return this._parentCapabilities.has(feature);



        },



        



        getStatus: function() {



            return {



                legacyMode: this._legacyMode,



                capabilities: Array.from(this._parentCapabilities),



                version: this._version



            };



        }



    };



    



    CompatibilityBridge.detect();



    



    // ==================== DIAGNOSTICS AGENT ====================



    const DiagnosticsAgent = {



        _enabled: window.__IFRAME_DEBUG__ || false,



        _metrics: {



            messagesSent: 0,



            messagesReceived: 0,



            handshakeAttempts: 0,



            handshakeSuccesses: 0,



            sessionUpdates: 0,



            errors: 0,



            retries: 0,



            recoveries: 0,



            stateChanges: 0,



            callStartTime: 0,



            callEndReason: null,



            recoveryTriggers: 0,



            sessionRefreshes: 0,



            callsInitiated: 0,



            callsAccepted: 0,



            callsRejected: 0,



            callsEnded: 0,



            callsFailed: 0,



            signalingMessagesSent: 0,



            signalingMessagesReceived: 0



        },



        _history: [],



        _startTime: Date.now(),



        _snapshots: [],



        _maxHistory: 100,



        _maxSnapshots: 20,



        



        enable: function() {



            this._enabled = true;



            this._startTime = Date.now();



            logInfo(MODULE, 'DiagnosticsAgent enabled');



        },



        



        disable: function() { this._enabled = false; },



        



        record: function(name, data = {}) {



            if (!this._enabled) return;



            



            if (this._metrics.hasOwnProperty(name)) this._metrics[name]++;



            



            if (name === 'call_start') {



                this._metrics.callStartTime = Date.now();



                this._metrics.callEndReason = null;



                this._metrics.callsInitiated++;



            }



            if (name === 'call_accept') {



                this._metrics.callsAccepted++;



            }



            if (name === 'call_reject') {



                this._metrics.callsRejected++;



            }



            if (name === 'call_end') {



                this._metrics.callsEnded++;



                if (data.reason) this._metrics.callEndReason = data.reason;



            }



            if (name === 'call_fail') {



                this._metrics.callsFailed++;



            }



            if (name === 'recovery_trigger') {



                this._metrics.recoveryTriggers++;



            }



            if (name === 'session_refresh') {



                this._metrics.sessionRefreshes++;



            }



            if (name === 'signaling_send') {



                this._metrics.signalingMessagesSent++;



            }



            if (name === 'signaling_recv') {



                this._metrics.signalingMessagesReceived++;



            }



            



            const entry = {



                name,



                data,



                timestamp: Date.now(),



                state: {



                    coreState: StateGovernor.getState(),



                    sessionValid: IframeSessionClient.isValid(),



                    online: navigator.onLine,



                    visible: !document.hidden,



                    v5State: V5StateGovernor ? V5StateGovernor.getState() : 'unknown',



                    tokenValid: !!callsState.token,



                    lifecycleState: currentState,



                    callActive: callsState.callActive,



                    callState: callsState.callState,



                    inPassiveMode: false



                }



            };



            



            this._history.push(entry);



            if (this._history.length > this._maxHistory) this._history.shift();



        },



        



        snapshot: function(label) {



            if (!this._enabled) return;



            



            const snapshot = {



                label,



                timestamp: Date.now(),



                metrics: { ...this._metrics },



                state: {



                    coreState: StateGovernor.getState(),



                    sessionValid: IframeSessionClient.isValid(),



                    online: navigator.onLine,



                    visible: !document.hidden,



                    v5State: V5StateGovernor ? V5StateGovernor.getState() : 'unknown',



                    tokenValid: !!callsState.token,



                    lifecycleState: currentState,



                    callActive: callsState.callActive,



                    callState: callsState.callState,



                    inPassiveMode: false



                },



                environment: { environment: ENVIRONMENT.current },



                transport: IframeTransport.getStatus(),



                handshake: { state: 'unknown' },



                session: IframeSessionClient.isValid() ? {



                    valid: true,



                    timeRemaining: IframeSessionClient.getTimeRemaining()



                } : { valid: false },



                recovery: RecoveryManager.getStatus(),



                callsState: { 



                    ...callsState,



                    localStream: !!callsState.localStream,



                    remoteStream: !!callsState.remoteStream,



                    remoteStreams: callsState.remoteStreams.size



                }



            };



            



            this._snapshots.push(snapshot);



            if (this._snapshots.length > this._maxSnapshots) this._snapshots.shift();



        },



        



        getReport: function() {



            const uptime = Date.now() - this._startTime;



            



            return {



                uptime,



                metrics: { ...this._metrics },



                history: this._history.slice(-10),



                snapshots: this._snapshots.slice(-5),



                state: {



                    coreState: StateGovernor.getState(),



                    sessionValid: IframeSessionClient.isValid(),



                    online: navigator.onLine,



                    visible: !document.hidden,



                    v5State: V5StateGovernor ? V5StateGovernor.getState() : 'unknown',



                    tokenValid: !!callsState.token,



                    lifecycleState: currentState,



                    callActive: callsState.callActive,



                    callState: callsState.callState,



                    inPassiveMode: false



                },



                environment: { environment: ENVIRONMENT.current },



                transport: IframeTransport.getStatus(),



                session: IframeSessionClient.isValid() ? {



                    valid: true,



                    timeRemaining: IframeSessionClient.getTimeRemaining()



                } : { valid: false },



                recovery: RecoveryManager.getStatus(),



                callsState: { 



                    ...callsState,



                    localStream: !!callsState.localStream,



                    remoteStream: !!callsState.remoteStream,



                    remoteStreams: callsState.remoteStreams.size



                }



            };



        },



        



        reset: function() {



            this._metrics = {



                messagesSent: 0,



                messagesReceived: 0,



                handshakeAttempts: 0,



                handshakeSuccesses: 0,



                sessionUpdates: 0,



                errors: 0,



                retries: 0,



                recoveries: 0,



                stateChanges: 0,



                callStartTime: 0,



                callEndReason: null,



                recoveryTriggers: 0,



                sessionRefreshes: 0,



                callsInitiated: 0,



                callsAccepted: 0,



                callsRejected: 0,



                callsEnded: 0,



                callsFailed: 0,



                signalingMessagesSent: 0,



                signalingMessagesReceived: 0



            };



            this._history = [];



            this._snapshots = [];



            this._startTime = Date.now();



        }



    };



    



    if (window.__IFRAME_DEBUG__) DiagnosticsAgent.enable();



    



    // ==================== MULTI-MODULE COORDINATOR ====================



    const MultiModuleCoordinator = {



        _modules: new Map(),



        _authority: null,



        _initialized: false,



        



        initialize: function() {



            if (this._initialized) return this;



            



            this._authority = {



                environment: ENVIRONMENT,



                storage: SafeStorage,



                transport: IframeTransport,



                session: IframeSessionClient,



                reliability: ReliabilityEngine,



                recovery: RecoveryManager,



                compatibility: CompatibilityBridge,



                diagnostics: DiagnosticsAgent,



                origin: OriginSecurity,



                state: StateGovernor,



                v5State: V5StateGovernor,



                callsState: callsState,



                webRTC: WebRTCManager,



                media: MediaManager,



                callsGovernor: CallsStateGovernor



            };



            



            this._initialized = true;



            logReady(MODULE, 'MultiModuleCoordinator initialized');



            



            return this;



        },



        



        register: function(name, module) {



            if (this._modules.has(name)) {



                logWarn(MODULE, `Module ${name} already registered, overriding`);



            }



            this._modules.set(name, module);



            logInfo(MODULE, `Module registered: ${name}`);



        },



        



        get: function(name) {



            return this._authority?.[name] || this._modules.get(name);



        },



        



        getAuthority: function() { return this._authority; },



        



        getStatus: function() {



            const status = { authority: {}, modules: {} };



            



            if (this._authority) {



                Object.keys(this._authority).forEach(key => {



                    const module = this._authority[key];



                    if (module && typeof module.getStatus === 'function') {



                        status.authority[key] = module.getStatus();



                    } else {



                        status.authority[key] = { available: !!module };



                    }



                });



            }



            



            this._modules.forEach((module, name) => {



                if (module && typeof module.getStatus === 'function') {



                    status.modules[name] = module.getStatus();



                } else {



                    status.modules[name] = { available: !!module };



                }



            });



            



            return status;



        }



    };



    



    MultiModuleCoordinator.initialize();



    



    // Replace the entire UIFailsafe object in calls-core.js (around line 5200)







const UIFailsafe = {



    _enabled: true,



    _fallbackMode: false,



    _disabledButtons: new Set(),



    _disabledInputs: new Set(),



    _originalStates: new Map(),



    _listeners: new Set(),



    _lastMessageShown: null,



    _notificationContainer: null,



    



    initialize: function() {



        // Create notification container if it doesn't exist



        this._ensureNotificationContainer();



        logReady(MODULE, 'UIFailsafe initialized');



        return this;



    },



    



    _ensureNotificationContainer: function() {



        if (this._notificationContainer && document.body.contains(this._notificationContainer)) {



            return this._notificationContainer;



        }



        



        let container = document.getElementById('call-notification-container');



        if (!container) {



            container = document.createElement('div');



            container.id = 'call-notification-container';



            container.style.cssText = `



                position: fixed;



                top: 20px;



                right: 20px;



                z-index: 10000;



                display: flex;



                flex-direction: column;



                gap: 10px;



                max-width: 350px;



                pointer-events: none;



            `;



            document.body.appendChild(container);



        }



        



        // Add styles if not present



        if (!document.getElementById('call-notification-styles')) {



            const style = document.createElement('style');



            style.id = 'call-notification-styles';



            style.textContent = `



                @keyframes callNotifySlideIn {



                    from { transform: translateX(100%); opacity: 0; }



                    to { transform: translateX(0); opacity: 1; }



                }



                @keyframes callNotifySlideOut {



                    from { transform: translateX(0); opacity: 1; }



                    to { transform: translateX(100%); opacity: 0; }



                }



                .call-notification {



                    pointer-events: auto;



                    transition: all 0.3s ease;



                    animation: callNotifySlideIn 0.3s ease;



                }



                .call-notification-removing {



                    animation: callNotifySlideOut 0.3s ease forwards;



                }



            `;



            document.head.appendChild(style);



        }



        



        this._notificationContainer = container;



        return container;



    },



    



    // Replace the showFallbackMessage method in UIFailsafe (around line 5900-5950)







showFallbackMessage: function(message, type = 'warning') {



    // Prevent duplicate notifications



    const messageKey = `${type}:${message}`;



    const now = Date.now();



    



    if (this._lastMessageShown && this._lastMessageShown.key === messageKey && 



        (now - this._lastMessageShown.time) < 3000) {



        return;



    }



    



    this._lastMessageShown = { key: messageKey, time: now };



    



    // Get or create notification container



    let container = document.getElementById('call-notification-container');



    if (!container) {



        container = document.createElement('div');



        container.id = 'call-notification-container';



        container.style.cssText = `



            position: fixed;



            top: 20px;



            right: 20px;



            z-index: 10000;



            display: flex;



            flex-direction: column;



            gap: 10px;



            max-width: 350px;



        `;



        document.body.appendChild(container);



    }



    



    // Check for existing similar notification



    const existing = container.querySelector(`.call-notification[data-message="${message.replace(/"/g, '&quot;')}"]`);



    if (existing) {



        // Update existing notification



        const titleEl = existing.querySelector('.call-notification-title');



        if (titleEl) titleEl.textContent = type.charAt(0).toUpperCase() + type.slice(1);



        if (existing._timeout) clearTimeout(existing._timeout);



        existing._timeout = setTimeout(() => existing.remove(), 4000);



        return;



    }



    



    // Colors



    const colors = {



        success: '#4caf50',



        error: '#f44336', 



        warning: '#ff9800',



        info: '#2196f3'



    };



    



    // Create notification element



    const notification = document.createElement('div');



    notification.className = `call-notification call-notification-${type}`;



    notification.setAttribute('data-message', message);



    notification.style.cssText = `



        background: ${colors[type] || colors.info};



        color: white;



        border-radius: 8px;



        padding: 12px 16px;



        box-shadow: 0 4px 12px rgba(0,0,0,0.15);



        display: flex;



        align-items: center;



        justify-content: space-between;



        min-width: 250px;



        animation: slideInRight 0.3s ease;



    `;



    



    notification.innerHTML = `



        <div style="flex: 1;">



            <div class="call-notification-title" style="font-weight: bold; margin-bottom: 4px;">${type.charAt(0).toUpperCase() + type.slice(1)}</div>



            <div class="call-notification-message" style="font-size: 14px;">${this._escapeHtml(message)}</div>



        </div>



        <button class="call-notification-close" style="



            background: transparent;



            border: none;



            color: white;



            cursor: pointer;



            font-size: 16px;



            padding: 4px 8px;



            margin-left: 12px;



            opacity: 0.7;



        ">&times;</button>



    `;



    



    // Close button handler



    const closeBtn = notification.querySelector('.call-notification-close');



    if (closeBtn) {



        closeBtn.onclick = () => {



            if (notification._timeout) clearTimeout(notification._timeout);



            notification.remove();



        };



    }



    



    // Auto remove after 4 seconds



    notification._timeout = setTimeout(() => {



        if (notification.parentNode) notification.remove();



    }, 4000);



    



    container.appendChild(notification);



},







_escapeHtml: function(text) {



    if (!text) return '';



    return text



        .replace(/&/g, '&amp;')



        .replace(/</g, '&lt;')



        .replace(/>/g, '&gt;')



        .replace(/"/g, '&quot;')



        .replace(/'/g, '&#39;');



},



    



    _escapeHtml: function(text) {



        if (!text) return '';



        const div = document.createElement('div');



        div.textContent = text;



        return div.innerHTML;



    },



    



    _removeNotification: function(notification) {



        if (!notification || !notification.parentNode) return;



        if (notification._timeout) clearTimeout(notification._timeout);



        notification.classList.add('call-notification-removing');



        setTimeout(() => {



            if (notification.parentNode) notification.remove();



        }, 300);



    },



    



    clearAllNotifications: function() {



        if (this._notificationContainer) {



            const notifications = this._notificationContainer.querySelectorAll('.call-notification');



            notifications.forEach(notification => this._removeNotification(notification));



        }



        this._lastMessageShown = null;



    },



    



    enableFallbackMode: function() {



        if (this._fallbackMode) return;



        this._fallbackMode = true;



        this._notifyListeners('fallback', { enabled: true });



        logWarn(MODULE, 'UI fallback mode enabled');



    },



    



    disableFallbackMode: function() {



        if (!this._fallbackMode) return;



        this._fallbackMode = false;



        this._restoreUI();



        this._notifyListeners('fallback', { enabled: false });



        logInfo(MODULE, 'UI fallback mode disabled');



    },



    



    protectButton: function(button, fallbackHandler) {



        if (!button) return;



        const id = button.id || `btn-${Date.now()}-${Math.random()}`;



        this._originalStates.set(id, { disabled: button.disabled, onclick: button.onclick });



        



        const originalClick = button.onclick;



        button.onclick = (e) => {



            if (this._fallbackMode) {



                if (fallbackHandler) {



                    fallbackHandler(e);



                } else {



                    e.preventDefault();



                    e.stopPropagation();



                }



            } else if (originalClick) {



                originalClick.call(button, e);



            }



        };



        this._disabledButtons.add(id);



    },



    



    protectInput: function(input, fallbackValue) {



        if (!input) return;



        const id = input.id || `input-${Date.now()}-${Math.random()}`;



        this._originalStates.set(id, { disabled: input.disabled, value: input.value, oninput: input.oninput });



        



        const originalInput = input.oninput;



        input.oninput = (e) => {



            if (this._fallbackMode) {



                e.preventDefault();



                e.stopPropagation();



                if (fallbackValue !== undefined) input.value = fallbackValue;



            } else if (originalInput) {



                originalInput.call(input, e);



            }



        };



        this._disabledInputs.add(id);



    },



    



    _restoreUI: function() {



        this._originalStates.forEach((state, id) => {



            const element = document.getElementById(id);



            if (element) {



                if (state.disabled !== undefined) element.disabled = state.disabled;



                if (state.value !== undefined) element.value = state.value;



                if (state.onclick) element.onclick = state.onclick;



                if (state.oninput) element.oninput = state.oninput;



            }



        });



        this._originalStates.clear();



        this._disabledButtons.clear();



        this._disabledInputs.clear();



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



            enabled: this._enabled,



            fallbackMode: this._fallbackMode,



            protectedButtons: this._disabledButtons.size,



            protectedInputs: this._disabledInputs.size



        };



    }



};



    



    UIFailsafe.initialize();







    /**



     * _showCallNotification — safe toast helper.



     * Tries UIFailsafe.showFallbackMessage first (richest UI),



     * then falls back to a simple DOM toast so the user ALWAYS sees the message.



     * This fixes the "not implemented" / silent-failure path where UIFailsafe



     * was not ready and the else-branch only did console.warn.



     */



    function _showCallNotification(message, type) {



        type = type || 'info';



        try {



            if (typeof UIFailsafe !== 'undefined' && UIFailsafe && typeof UIFailsafe.showFallbackMessage === 'function') {



                UIFailsafe.showFallbackMessage(message, type);



                return;



            }



        } catch (_) {}







        // DOM fallback — always works even if UIFailsafe isn't ready



        try {



            const colors = { success: '#4caf50', error: '#f44336', warning: '#ff9800', info: '#2196f3' };



            const icons  = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };



            let container = document.getElementById('call-notification-container');



            if (!container) {



                container = document.createElement('div');



                container.id = 'call-notification-container';



                container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;max-width:360px;pointer-events:none;';



                document.body.appendChild(container);



            }



            const toast = document.createElement('div');



            toast.style.cssText = `background:${colors[type]||colors.info};color:#fff;border-radius:10px;padding:12px 16px;box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px;pointer-events:auto;font-size:14px;font-family:system-ui,sans-serif;`;



            toast.innerHTML = `<span style="font-size:18px;flex-shrink:0">${icons[type]||icons.info}</span><span style="flex:1">${message}</span><span style="cursor:pointer;opacity:.7;font-size:18px;margin-left:8px" onclick="this.parentElement.remove()">&times;</span>`;



            container.appendChild(toast);



            setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity .4s'; setTimeout(()=>toast.remove(), 400); }, 4500);



        } catch (domErr) {



            console.warn('[CallsCore] _showCallNotification DOM fallback failed:', message, domErr);



        }



    }







    // ==================== NAVIGATION GUARD ====================



    const NavigationGuard = {



        _currentPath: window.location.pathname,



        _currentHash: window.location.hash,



        _navigationInProgress: false,



        _pendingNavigation: null,



        _listeners: new Set(),



        



        initialize: function() {



            this._setupListeners();



            logReady(MODULE, 'NavigationGuard initialized');



            return this;



        },



        



        _setupListeners: function() {



            const originalPushState = history.pushState;



            const originalReplaceState = history.replaceState;



            



            history.pushState = (...args) => {



                if (this.shouldBlockNavigation()) {



                    return false;



                }



                this._handleNavigation('pushState', args);



                return originalPushState.apply(history, args);



            };



            



            history.replaceState = (...args) => {



                if (this.shouldBlockNavigation()) {



                    return false;



                }



                this._handleNavigation('replaceState', args);



                return originalReplaceState.apply(history, args);



            };



            



            window.addEventListener('popstate', () => {



                if (this.shouldBlockNavigation()) {



                    return false;



                }



                this._handleNavigation('popstate', {});



            });



            



            window.addEventListener('hashchange', () => {



                if (this.shouldBlockNavigation()) {



                    return false;



                }



                this._handleNavigation('hashchange', { hash: window.location.hash });



            });



        },



        



        shouldBlockNavigation: function() {



            return callsState.callActive === true;



        },



        



        _handleNavigation: function(type, data) {



            if (this._navigationInProgress) {



                this._pendingNavigation = { type, data };



                return;



            }



            



            const oldPath = this._currentPath;



            const oldHash = this._currentHash;



            



            this._currentPath = window.location.pathname;



            this._currentHash = window.location.hash;



            



            this._notifyListeners('navigation', {



                type, oldPath, newPath: this._currentPath, oldHash, newHash: this._currentHash, data



            });



        },



        



        guard: function(callback) {



            this.addListener((event, data) => {



                if (event === 'navigation') callback(data);



            });



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



        



        getCurrentPath: function() { return this._currentPath; },



        getCurrentHash: function() { return this._currentHash; },



        getStatus: function() {



            return {



                currentPath: this._currentPath,



                currentHash: this._currentHash,



                navigationInProgress: this._navigationInProgress,



                hasPendingNavigation: !!this._pendingNavigation,



                blockActive: callsState.callActive



            };



        }



    };



    



    NavigationGuard.initialize();



    



    // ==================== LIFECYCLE CONTROLLER ====================



    const LifecycleController = {



        _initializationPromise: null,



        _initializationLock: false,



        _pipelineCompleted: false,



        _pipelineStage: null,



        _pipelineStartTime: 0,



        _pipelineResults: {},



        _listeners: new Set(),



        _handshakeCompleted: false,



        _sessionAcquired: false,



        _pipelineAttempts: 0,



        _maxPipelineAttempts: 1,



        



        initialize: function() {



            logReady(MODULE, 'LifecycleController initialized');



            return this;



        },



        



        runDeterministicPipeline: async function() {



            if (this._initializationPromise) {



                return this._initializationPromise;



            }



            



            if (this._initializationLock) {



                logWarn(MODULE, 'Pipeline already running, waiting');



                return new Promise(resolve => {



                    const checkInterval = setInterval(() => {



                        if (this._pipelineCompleted || !this._initializationLock) {



                            clearInterval(checkInterval);



                            resolve(this._pipelineResults);



                        }



                    }, 100);



                });



            }



            



            this._pipelineAttempts++;



            if (this._pipelineAttempts > this._maxPipelineAttempts) {



                logWarn(MODULE, 'Max pipeline attempts reached, completing');



                this._pipelineResults = { success: true, degraded: true };



                this._pipelineCompleted = true;



                return this._pipelineResults;



            }



            



            this._initializationLock = true;



            this._pipelineStartTime = Date.now();



            this._pipelineResults = {};



            



            this._initializationPromise = this._executePipeline();



            



            return this._initializationPromise;



        },



        



        _executePipeline: async function() {



            try {



                logInfo(MODULE, 'Starting deterministic pipeline');



                



                StateGovernor.enableTransitions();



                



                const pipelineResult = await SessionPipeline.run();



                



                this._pipelineResults = pipelineResult;



                this._pipelineCompleted = true;



                this._initializationLock = false;



                



                if (pipelineResult.success) {



                    logSuccess(MODULE, `Deterministic pipeline completed in ${pipelineResult.duration || 0}ms`, { degraded: pipelineResult.degraded });



                    



                    window.dispatchEvent(new CustomEvent('core.ready', {



                        detail: {



                            timestamp: Date.now(),



                            version: CONFIG.VERSION,



                            environment: ENVIRONMENT.current,



                            duration: pipelineResult.duration || 0,



                            degraded: pipelineResult.degraded || false



                        }



                    }));



                    



                    return pipelineResult;



                } else {



                    throw new Error(pipelineResult.error || 'Pipeline failed');



                }



                



            } catch (error) {



                logError(MODULE, 'Pipeline execution failed', error);



                this._initializationLock = false;



                StateGovernor._currentState = STATE.ERROR_FATAL;



                RecoveryManager.scheduleRecovery();



                



                this._pipelineResults.success = false;



                this._pipelineResults.error = error.message;



                return this._pipelineResults;



            } finally {



                StateGovernor.disableTransitions();



            }



        },



        



        getPipelineStatus: function() {



            return {



                stage: this._pipelineStage,



                completed: this._pipelineCompleted,



                locked: this._initializationLock,



                startTime: this._pipelineStartTime,



                duration: this._pipelineStartTime ? Date.now() - this._pipelineStartTime : 0,



                results: this._pipelineResults



            };



        },



        



        reset: function() {



            this._initializationPromise = null;



            this._initializationLock = false;



            this._pipelineCompleted = false;



            this._pipelineStage = null;



            this._pipelineStartTime = 0;



            this._pipelineResults = {};



            this._handshakeCompleted = false;



            this._sessionAcquired = false;



            this._pipelineAttempts = 0;



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



        }



    };



    



    LifecycleController.initialize();



    



    // ==================== SESSION PIPELINE ====================



    const SessionPipeline = {



        _stages: [



            'preflight',



            'dependencyCheck',



            'parentDetection',



            'handshake',



            'sessionSync',



            'serviceInit',



            'ready'



        ],



        _currentStage: null,



        _stageResults: {},



        _stageAttempts: {},



        _maxAttempts: 1,



        _pipelineInProgress: false,



        _pipelineCompleted: false,



        _pipelineDegraded: false,



        _pipelineStartTime: 0,



        _pipelineEndTime: 0,



        _listeners: new Set(),



        



        initialize: function() {



            this._reset();



            logReady(MODULE, 'SessionPipeline initialized');



            return this;



        },



        



        _reset: function() {



            this._currentStage = null;



            this._stageResults = {};



            this._stageAttempts = {};



            this._pipelineInProgress = false;



            this._pipelineCompleted = false;



            this._pipelineDegraded = false;



        },



        



        run: async function() {



            if (this._pipelineInProgress) {



                logPipeline(MODULE, 'pipeline', 'already in progress');



                return this._waitForCompletion();



            }



            



            if (this._pipelineCompleted) {



                logPipeline(MODULE, 'pipeline', 'already completed', { degraded: this._pipelineDegraded });



                return { success: true, completed: true, degraded: this._pipelineDegraded };



            }



            



            this._pipelineInProgress = true;



            this._pipelineStartTime = Date.now();



            this._pipelineDegraded = false;



            



            logPipeline(MODULE, 'pipeline', 'start');



            



            for (const stage of this._stages) {



                this._currentStage = stage;



                this._stageAttempts[stage] = 0;



                



                logPipeline(MODULE, stage, 'start');



                



                const stageResult = await this._executeStageWithRetry(stage);



                this._stageResults[stage] = stageResult;



                



                if (stageResult.success) {



                    logPipeline(MODULE, stage, 'success', { attempt: stageResult.attempt });



                } else {



                    logPipeline(MODULE, stage, 'fail', { attempt: stageResult.attempt, error: stageResult.error });



                    



                    const criticalStages = ['preflight', 'dependencyCheck'];



                    



                    if (criticalStages.includes(stage)) {



                        logPipeline(MODULE, 'pipeline', 'critical failure', { stage });



                        this._pipelineInProgress = false;



                        return { success: false, stage, error: stageResult.error };



                    }



                    



                    this._pipelineDegraded = true;



                    



                    if (stage === 'sessionSync') {



                        logPipeline(MODULE, 'pipeline', 'continuing in degraded mode', { stage });



                    } else {



                        logPipeline(MODULE, 'pipeline', 'continuing despite failure', { stage });



                    }



                }



            }



            



            this._pipelineCompleted = true;



            this._pipelineInProgress = false;



            this._pipelineEndTime = Date.now();



            



            const duration = this._pipelineEndTime - this._pipelineStartTime;



            



            logPipeline(MODULE, 'pipeline', 'complete', { 



                degraded: this._pipelineDegraded,



                duration: duration + 'ms'



            });



            



            return { success: true, degraded: this._pipelineDegraded, duration };



        },



        



        _runPreflight: async function() {



            const capabilities = {



                postMessage: typeof window.postMessage === 'function',



                addEventListener: typeof window.addEventListener === 'function',



                Promise: typeof Promise !== 'undefined'



            };



            



            const missing = Object.entries(capabilities)



                .filter(([_, available]) => !available)



                .map(([name]) => name);



            



            if (missing.length > 0) {



                logWarn(MODULE, 'Preflight: missing capabilities', { missing });



                return { success: false, error: `Missing: ${missing.join(', ')}` };



            }



            



            return { success: true, capabilities, readyState: document.readyState };



        },



        



        _runDependencyCheck: async function() {



            const dependencies = {



                window: typeof window !== 'undefined',



                document: typeof document !== 'undefined',



                navigator: typeof navigator !== 'undefined',



                mediaDevices: typeof navigator.mediaDevices !== 'undefined'



            };



            



            const missing = Object.entries(dependencies)



                .filter(([_, available]) => !available)



                .map(([name]) => name);



            



            if (missing.length > 0) {



                return { success: false, error: `Missing dependencies: ${missing.join(', ')}` };



            }



            



            return { success: true, dependencies };



        },



        



        _runParentDetection: async function() {



            const parentDetected = !!(window.parent && window.parent !== window);



            let sameOrigin = false;



            let parentOrigin = null;



            



            if (parentDetected) {



                try {



                    parentOrigin = window.parent.location.origin;



                    sameOrigin = window.location.origin === parentOrigin;



                } catch (e) {



                    sameOrigin = false;



                }



            }



            



            logInfo(MODULE, 'Parent detection', { parentDetected, sameOrigin, parentOrigin });



            



            return { 



                success: true, 



                parentDetected, 



                sameOrigin, 



                parentOrigin 



            };



        },



        



        _runHandshake: async function() {



            try {



                sendChildReady();



                return { success: true };



            } catch (error) {



                logError(MODULE, 'Handshake failed', error);



                return { success: true, degraded: true, error: error.message };



            }



        },



        



        _runSessionSync: async function() {



            if (IframeSessionClient && IframeSessionClient.isValid()) {



                logSession(MODULE, 'already valid');



                return { success: true, cached: true };



            }



            



            try {



                SessionClient.requestSession();



                



                const sessionResult = await StateGovernor.waitForSession(5000);



                



                if (sessionResult && sessionResult.success) {



                    logSession(MODULE, 'acquired');



                    return { success: true };



                }



            } catch (error) {



                logSession(MODULE, 'failed', error.message);



            }



            



            return { success: true, pending: true, error: 'Session sync failed - continuing with pending state' };



        },



        



        _runServiceInit: async function() {



            return { success: true };



        },



        



        _waitForCompletion: function() {



            return new Promise((resolve) => {



                const checkInterval = setInterval(() => {



                    if (!this._pipelineInProgress) {



                        clearInterval(checkInterval);



                        resolve({ 



                            success: this._pipelineCompleted, 



                            degraded: this._pipelineDegraded,



                            stages: this._stageResults 



                        });



                    }



                }, 100);



                



                setTimeout(() => {



                    clearInterval(checkInterval);



                    resolve({ 



                        success: this._pipelineCompleted, 



                        degraded: this._pipelineDegraded,



                        timeout: true 



                    });



                }, 30000);



            });



        },



        



        getStatus: function() {



            return {



                currentStage: this._currentStage,



                pipelineInProgress: this._pipelineInProgress,



                pipelineCompleted: this._pipelineCompleted,



                pipelineDegraded: this._pipelineDegraded,



                startTime: this._pipelineStartTime,



                endTime: this._pipelineEndTime,



                duration: this._pipelineEndTime ? this._pipelineEndTime - this._pipelineStartTime : 0,



                stages: this._stageResults,



                attempts: { ...this._stageAttempts }



            };



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



        }



    };



    



    function logPipeline(module, stage, status, data = null) {



        const key = `${module}:pipeline:${stage}:${status}`;



        const icon = status === 'start' ? '🚀' : status === 'success' ? '✅' : status === 'fail' ? '❌' : '⏳';



        console.log(`[${module}] ${icon} Pipeline stage: ${stage} - ${status}`, data ? data : '');



    }



    



    SessionPipeline.initialize();



    



    // ==================== CALL SIGNALING HANDLERS (REAL) ====================



    



    function handleIncomingCall(callData) {

        // ── FIX: Capture the receiver's origin page (tagged by chat.html as
        // _receiverReturnTo) so that after this call ends, POST_CALL_RESTORE
        // navigates back to where the receiver actually was — not always
        // 'conversations'/'messages'. Only set once per call (first message wins).
        try {
            if (callData && callData._receiverReturnTo && !callsState.pendingCallReturnTo) {
                callsState.pendingCallReturnTo = callData._receiverReturnTo;
            }
        } catch (_e) {}

        // ── Multi-tab guard: only the leader tab handles incoming calls ────────
        // Other tabs suppress the UI but keep the call record for history.
        if (typeof _isActiveCallTab === 'function' && !_isActiveCallTab()) {
            logInfo(MODULE, '[multi-tab] Suppressing call:incoming — not the active call tab');
            // Notify the call broadcast channel so the leader knows another tab received it
            if (_callBroadcast) {
                try { _callBroadcast.postMessage({ type: 'CALL_INCOMING_SUPPRESSED', callId: callData && callData.callId, tabId: _tabId }); } catch(_e) {}
            }
            return;
        }




        logCall(MODULE, 'handleIncomingCall', callData);



        console.log('[CallsCore] 📞 RECEIVED incoming call event:', JSON.stringify({



            callId: callData && (callData.callId || callData.id),



            callerName: callData && callData.callerName,



            callType: callData && (callData.callType || callData.type),



            state: currentState



        }));







        // ── FIX: NEVER block incoming calls on parentReady or assertActive.



        // Service worker reloads and delayed handshakes reset lifecycle state.



        // Only hard-block if the module has not started initialising at all.



        const blockedStates = [LifecycleState.BOOT, LifecycleState.INITIALIZING];



        if (blockedStates.includes(currentState)) {



            logWarn(MODULE, `Incoming call ignored — module not yet initialised (state: ${currentState})`);



            return;



        }







        // Auto-promote: if we have a valid session but lifecycle is still



        // WAIT_PARENT (e.g. after a SW reload), force-promote to ACTIVE so



        // the incoming call is not silently dropped.



        if (currentState !== LifecycleState.ACTIVE) {



            const sess = callsState.session || (CallsStateGovernor && CallsStateGovernor._session);



            if (sess && sess.authenticated) {



                logWarn(MODULE, `Auto-promoting ${currentState} → ACTIVE to handle incoming call`);



                currentState = LifecycleState.ACTIVE;



            } else {



                logWarn(MODULE, `Cannot auto-promote — no valid session (state: ${currentState}). Incoming call dropped.`);



                return;



            }



        }







        // ── DEDUP: ignore duplicate incoming events for the same call ────────



        const incomingId = callData.callId || callData.id;



        if (callsState.activeCallId && callsState.activeCallId === incomingId && callsState.callState === 'incoming') {



            return; // already processing this call



        }







        // CRITICAL: Check for existing GENUINELY active call (not just stale state)



        // Only block if we're actually in a call (in-call state), not idle/ended stale



        if (callsState.callActive && callsState.callState === 'in-call') {



            logWarn(MODULE, 'Incoming call rejected - already in a call (in-call state)');



            safeSend('CALL_REJECT', {



                callId: callData.callId,



                reason: 'busy',



                timestamp: Date.now()



            }, false);



            return;



        }







        // If stale state from a previous call, reset it first



        if (callsState.callActive && callsState.callState !== 'in-call') {



            logWarn(MODULE, 'Resetting stale call state before incoming call');



            callsState.callActive = false;



            callsState.callState = 'idle';



            callsState.activeCallId = null;



        }







        // CRITICAL FIX: Set activeCallId for incoming calls



        
        // FIX-PHASE15: Normalize callerName from all payload shapes.
        // Backend may send: callData.callerName, callData.caller.username,
        // callData.caller.displayName, or callData.fromUserName.
        if (!callData.callerName || callData.callerName === 'Unknown') {
            var _c = callData.caller || {};
            var _first = _c.firstName || '';
            var _last  = _c.lastName  || '';
            var _full  = (_first + (_last ? ' ' + _last : '')).trim();
            callData.callerName = _full
                || _c.displayName || _c.username
                || callData.fromUserName || callData.senderName
                || (callData.callerId ? ('User ' + callData.callerId) : 'Unknown Caller');
        }
        if (!callData.callerAvatar) {
            callData.callerAvatar = (callData.caller && callData.caller.avatar) || null;
        }
        if (!callData.callType && callData.type) callData.callType = callData.type;

        callsState.callData = callData;



        callsState.callState = 'incoming';


        // CALLMANAGER BRIDGE: create CM session for incoming call
        try {
            var _smInc = window.__CallStateMachine;
            var _CSInc = window.CALL_STATE;
            if (_smInc && _CSInc) {
                var _incId = callsState.activeCallId;
                if (_incId && !_smInc.getSession(_incId)) {
                    _smInc.createSession(_incId, (callData && callData.callType) || 'audio', (callData && callData.callerId), false);
                    _smInc.transition(_incId, _CSInc.INCOMING);
                    if (callData && callData.callerName) { var _is = _smInc.getSession(_incId); if(_is) _is.peerName = callData.callerName; }
                }
            }
        } catch(_incBE) {}

        callsState.activeCallId = callData.callId || callData.id || callsState.activeCallId;  // ← CRITICAL: Set activeCallId for incoming calls







        // ── SESSION MANAGER: register incoming session ──────────────────────



        (function _registerIncomingSession() {



            const mgr = window.KynectaCallSession;



            if (!mgr || mgr.isActive) return;



            try {



                mgr.startIncoming({



                    callId:      callData.callId,



                    callerId:    callData.callerId,



                    callType:    callData.callType || callData.type || 'audio',



                    callerName:  callData.callerName,



                    callerAvatar:callData.callerAvatar,



                    isGroupCall: callData.isGroupCall || false



                });



            } catch(e) { console.warn('[CallsCore] Session mgr incoming failed:', e.message); }



        })();







        // ── LOCAL-FIRST: record ringing immediately ─────────────────────────



        (function _saveIncomingLocally() {



            const store = window.KynectaCallLocalStore;



            if (!store) return;



            const id = callData.callId || callData.id;



            if (!id) return;



            store.save({



                id, serverId: id,



                callerId: callData.callerId || null,



                receiverId: callsState.session?.userId || null,



                type: callData.callType || callData.type || 'audio',



                status: 'ringing',



                callerName: callData.callerName || null,



                callerAvatar: callData.callerAvatar || null,



                isLocalOnly: false,



                createdAt: callData.timestamp || Date.now()



            }).catch(() => {});



        })();







        // FIX-PHASE15: Enrich callData before notifying so ALL listeners
        // (calls-ui.js, callOverlay.manager.js, etc.) get callerName populated.
        var _enrichedCall = Object.assign({}, callData, {
            callerName:   callData.callerName   || (callData.caller && (callData.caller.username || callData.caller.displayName)) || ('User ' + callData.callerId),
            callerAvatar: callData.callerAvatar || (callData.caller && callData.caller.avatar) || null,
            callType:     callData.callType     || callData.type || 'audio',
        });
        notifyListeners('incoming_call', _enrichedCall);

        // FIX-CALL-ACK: Emit call:received to backend so caller gets confirmation
        // and the 20-second no-answer timer is cleared on the server side.
        try {
            var _ackSocket = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
            if (_ackSocket && typeof _ackSocket.emit === 'function') {
                _ackSocket.emit('call:received', {
                    callId:   callData.callId || callData.id,
                    callerId: callData.callerId || callData.caller,
                });
                console.log('[CallsCore] ✅ call:received ack sent to server');
            }
        } catch(_ackErr) { console.warn('[CallsCore] call:received ack failed', _ackErr); }
    }



    function handleCallInitiated(callData) {



    logCall(MODULE, 'handleCallInitiated', callData);



    



    // Offline fix: backend returned success:false + offline:true



    // Show call UI anyway for 3 minutes with ringtone even if receiver is offline



    if (callData.offline === true || (callData.success === false && callData.offline)) {



        logWarn(MODULE, 'Receiver is offline - showing call UI for 3 minutes', callData);







        // Continue with call flow but mark receiver as offline



        callData.receiverOnline = false;



        callData.success = true; // Force success to show UI



        



        // Show notification that user is offline but continue



        const offlineMsg = callData.error || callData.message || 'User is currently offline. Call will display for 3 minutes.';



        _showCallNotification(offlineMsg, 'info');



        



        // Continue to normal call UI flow below



    }







    // CRITICAL: Check if the call initiation was successful



    if (callData.success === false || callData.error) {



        logWarn(MODULE, 'Call initiation failed, cleaning up', { 



            error: callData.error, 



            callId: callData.callId 



        });



        



        // Clean up the call state



        if (callsState.activeCallId === callData.callId || callsState.callActive) {



            resetCallState();



            callsState.callActive = false;



            callsState.callState = 'idle';



            callsState.activeCallId = null;



            callsState.serverCallId = null;



            callsState.localCallId = null;



        }



        



        // CRITICAL FIX: Restore governor to ACTIVE so next call attempt works



        if (CallsStateGovernor) {



            CallsStateGovernor._transitionLock = false;



            CallsStateGovernor._previousState = CallsStateGovernor._currentState;



            CallsStateGovernor._currentState = CALLS_STATE.ACTIVE;



        }



        



        // Clear any pending invitation timer



        if (callsState.callInvitationTimer) {



            clearTimeout(callsState.callInvitationTimer);



            callsState.callInvitationTimer = null;



        }



        



        // Notify UI of failure



        notifyListeners('call_initiation_failed', { 



            callId: callData.callId, 



            error: callData.error || 'Call initiation failed'



        });



        



        // Show error notification



        _showCallNotification(callData.error || 'Failed to start call', 'error');



        return;



    }



    



    // Success path — callData.callId is the real server UUID from /calls/start



    callsState.callData = callData;



    callsState.callState = 'initiated';



    // If server returned a real UUID (not our local call_ string), use it



    const serverCallId = callData.callId || callData.id || callData.serverCallId;



    const localCallId = callData.localCallId || callsState.activeCallId;



    callsState.activeCallId = serverCallId || localCallId;



    callsState.localCallId = localCallId;   // keep local id for reference



    callsState.serverCallId = serverCallId; // real DB UUID







    // ── SESSION MANAGER: link server ID ──────────────────────────────────



    (function _linkServerId() {



        const mgr = window.KynectaCallSession;



        if (mgr && mgr.isActive && serverCallId) mgr.setServerCallId(serverCallId);



        // Also link in local store



        const store = window.KynectaCallLocalStore;



        if (store && localCallId && serverCallId && localCallId !== serverCallId) {



            store.linkServerId(localCallId, serverCallId).catch(() => {});



        }



    })();



    callsState.callParticipants = callData.participants || callData.call?.participants || [];



    callsState.callStartTime = Date.now();



    callsState.callType = callData.callType || callData.call?.type;



    callsState.callActive = true;



    



    if (callsState.callInvitationTimer) {



        clearTimeout(callsState.callInvitationTimer);



        callsState.callInvitationTimer = null;



    }



    



    notifyListeners('call_initiated', callData);



    



    // Show success notification


    // FIX-NAME: resolve callee display name for the calling screen.
    // Server returns callerName (our own name), not the callee's name.
    // Read from UIState.pendingCallUser (set by calls-ui.js before initiation)
    // or from window.__activePeerName (set by __dispatchCallToIframe in chat.html
    // frame — but that is the parent frame's window, so read it via sessionStorage
    // which IS shared between parent and iframe on same origin).
    let _resolvedCalleeName = callData.calleeName
        || (window.UIState && window.UIState.pendingCallUser && window.UIState.pendingCallUser.userName)
        || window.__activePeerName;
    // sessionStorage is same-origin shared across frames
    if (!_resolvedCalleeName) {
        try {
            const _pendingCall = JSON.parse(sessionStorage.getItem('pending_call') || '{}');
            _resolvedCalleeName = _pendingCall.userName || _pendingCall.name || '';
        } catch(_) {}
    }
    _resolvedCalleeName = _resolvedCalleeName || 'User';
    // Update calling screen name element if it still shows a placeholder
    try {
        ['callingName','callingContactName'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el && (!el.textContent || el.textContent === 'User' || el.textContent === 'Calling...' || el.textContent === '')) {
                el.textContent = _resolvedCalleeName;
            }
        });
    } catch(_ne) {}
    window.__activePeerName = _resolvedCalleeName;
    _showCallNotification(`${callData.callType === 'video' ? 'Video' : 'Voice'} call started with ${_resolvedCalleeName}`, 'success');

    _showCallNotification(`Voice call started with ${userName}`, 'success');



}







    function handleCallAccepted(callData) {



        logCall(MODULE, 'handleCallAccepted', callData);



        



        const acceptedCallId = callData && (callData.callId || callData.id);
        if (acceptedCallId) {
            callsState.activeCallId = acceptedCallId;
            callsState.serverCallId = callsState.serverCallId || acceptedCallId;
        }
        if (callData && (callData.callType || callData.type)) {
            callsState.callType = callData.callType || callData.type;
        }
        callsState.callState = 'connecting';
        callsState.callActive = true;



        notifyListeners('call_accepted', callData);







        // ── CRITICAL FIX: Start WebRTC negotiation ──────────────────────────



        // The caller must create and send an SDP offer immediately after the



        // receiver accepts. Without this, WebRTC never connects → no audio.



        // Only the CALLER side creates the offer (not the receiver).



        // ✅ FIX: Use multiple sources for currentUserId
        const currentUserId = (callsState.session && callsState.session.userId)
            || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.userId)
            || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.user && window.__CHILD_SESSION__.user.id)
            || null;

        // ✅ FIX: isCaller with robust fallbacks
        const _isCallerByUserId = !!(currentUserId && callData && callData.callerId &&
            String(callData.callerId) === String(currentUserId));
        const _isCallerByState  = !!(callsState._isCaller === true);
        const _isCallerByInit   = !!(window.__callerCallId && callData &&
            (callData.callId || callData.id) &&
            String(window.__callerCallId) === String(callData.callId || callData.id));
        const isCaller = _isCallerByUserId || _isCallerByState || _isCallerByInit;

        console.log('[CallsCore] isCaller:', { isCaller, currentUserId, callerId: callData && callData.callerId });







        if (!isCaller) {



            console.log('[CallsCore] ℹ️ CALL ACCEPTED received on receiver side — waiting for caller offer');

            // C-08 FIX: For GROUP calls the receiver also needs to join the
            // signaling mesh immediately on accept, because the caller-side
            // 1:1 WebRTCManager path only opens one connection (to the first
            // acceptor). GroupCallEngine.joinGroupCall() builds the N-way mesh
            // correctly for every participant regardless of caller/callee role.
            if (callData && (callData.isGroupCall || callData.type === 'group')) {
                const _gce = window.__GroupCallEngine || window.GroupCall;
                if (_gce && typeof _gce.joinGroupCall === 'function') {
                    const _gcCallId   = callData.callId || callsState.activeCallId;
                    const _gcGroupId  = callData.groupId || _gcCallId;
                    const _gcLocalUid = String(
                        (callsState.session && callsState.session.userId) ||
                        (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.userId) || ''
                    );
                    if (_gcCallId && _gcLocalUid) {
                        console.log('[CallsCore] 🔀 GROUP CALL — receiver joining mesh via GroupCallEngine', _gcCallId);
                        _gce.joinGroupCall(_gcGroupId, _gcCallId, _gcLocalUid, {
                            callType: callData.callType || callData.type || 'audio',
                        }).catch(function(e) {
                            console.warn('[CallsCore] GroupCallEngine.joinGroupCall (receiver) failed:', e.message);
                        });
                    }
                }
            }

            return;



        }



        // C-08 FIX (CALLER SIDE): when this is a group call, the caller must
        // join the mesh engine rather than opening a single 1:1 WebRTC
        // connection. Previously every group call fell through to
        // WebRTCManager.createOffer() which only opens one PeerConnection
        // (to whoever accepted first) and ignores all other participants.
        // GroupCallEngine.joinGroupCall() builds the correct N-way mesh.
        if (callData && (callData.isGroupCall || callData.type === 'group') && isCaller) {
            var _gce2 = window.__GroupCallEngine || window.GroupCall;
            if (_gce2 && typeof _gce2.joinGroupCall === 'function') {
                var _gcCallId2   = callData.callId || callsState.activeCallId || callsState.serverCallId;
                var _gcGroupId2  = callData.groupId || _gcCallId2;
                var _gcLocalUid2 = String(currentUserId || '');
                if (_gcCallId2 && _gcLocalUid2) {
                    console.log('[CallsCore] 🔀 GROUP CALL — caller joining mesh via GroupCallEngine', _gcCallId2);
                    _gce2.joinGroupCall(_gcGroupId2, _gcCallId2, _gcLocalUid2, {
                        callType: callData.callType || callData.type || 'audio',
                    }).catch(function(e) {
                        console.warn('[CallsCore] GroupCallEngine.joinGroupCall (caller) failed:', e.message);
                    });
                    return; // GroupCallEngine handles all WebRTC from here
                }
            }
            // GroupCallEngine not available — fall through to single-peer path
            // (degraded but better than silent failure)
            console.warn('[CallsCore] GroupCallEngine not available for group call — degrading to single-peer');
        }

        if (WebRTCManager._peerConnection && callsState.callActive) {

            console.log('[CallsCore] ✅ CALL ACCEPTED — creating SDP offer for WebRTC');

            // FIX: Resolve the target user (receiver) for the offer.
            // callsState.activeCall.participants[0] is set when startCall() is called.
            // Also check callData fields as fallback.
            var _resolveOfferTarget = function() {
                if (callsState.activeCall && callsState.activeCall.participants && callsState.activeCall.participants.length > 0) {
                    var p = callsState.activeCall.participants[0];
                    return typeof p === 'object' ? (p.id || p.userId) : p;
                }
                return callData && (callData.receiverId || callData.calleeId || callData.targetUserId || callData.remoteUserId) || null;
            };

            WebRTCManager.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })



                .then(function(offer) {

                    const callId = callsState.serverCallId || callsState.activeCallId || (callData && callData.callId);

                    // FIX: targetUserId MUST be in the payload — backend silently drops offer if missing.
                    // Resolve from participants (set at startCall) or callData fields.
                    var _resolvedTarget = (function() {
                        if (callsState.activeCall && callsState.activeCall.participants && callsState.activeCall.participants.length > 0) {
                            var p = callsState.activeCall.participants[0];
                            return typeof p === 'object' ? (p.id || p.userId) : p;
                        }
                        return (callData && (callData.receiverId || callData.calleeId || callData.targetUserId || callData.remoteUserId)) || null;
                    })();

                    var _offerPayload = {
                        callId: callId,
                        offer: offer,
                        targetUserId: _resolvedTarget,
                        remoteUserId: _resolvedTarget,
                        timestamp: Date.now()
                    };
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'SIGNAL_OFFER', payload: _offerPayload, source: 'calls-core-direct' }, '*');
                    }
                    // FIX-CALL-DIRECT: Emit directly via Socket.IO for lowest latency
                    var _directSocket = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
                    var _offerId = callId;
                    var _offTarget = _resolvedTarget;
                    if (_directSocket && typeof _directSocket.emit === 'function' && _offTarget) {
                        _directSocket.emit('call:webrtc_offer', {
                            callId: _offerId, targetUserId: _offTarget,
                            offer: offer,
                        });
                        console.log('[CallsCore] ✅ OFFER sent via Socket.IO to targetUserId:', _offTarget);
                    } else {
                        safeSend('SIGNAL_OFFER', _offerPayload, false);
                        console.log('[CallsCore] ✅ OFFER sent via safeSend (no direct socket). targetUserId:', _offTarget);
                    }



                })



                .catch(function(e) {



                    logError(MODULE, 'createOffer failed after call_accepted', e);



                });



        } else {



            logWarn(MODULE, 'handleCallAccepted: no peer connection — offer NOT sent', {



                hasPeerConn: !!WebRTCManager._peerConnection,



                callActive:  callsState.callActive



            });



        }



    }



    



    function handleCallStarted(callData) {
            // SCREEN MANAGER: switch to calling screen
            if (typeof window.showScreen === "function") { window.showScreen("calling"); }
            var __ov = document.getElementById("callOverlay"); if (__ov) __ov.setAttribute("data-state", "idle");



        logCall(MODULE, 'handleCallStarted', callData);



        



        callsState.callState = 'starting';



        notifyListeners('call_started', callData);



    }



    



    function handleCallConnected(callData) {
            // SCREEN MANAGER: switch to in-call screen
            if (typeof window.showScreen === "function") { window.showScreen("in-call"); }
            var __ov = document.getElementById("callOverlay"); if (__ov) __ov.setAttribute("data-state", "idle");



        logCall(MODULE, 'handleCallConnected', callData);



        



        callsState.callState = 'connected';



        callsState.callActive = true;



        callsState.callStartTime = callsState.callStartTime || Date.now();

        // CALLMANAGER BRIDGE: delegate connected event so CM owns the timer
        try {
            var _cm2 = window.__CallManager;
            var _sm2 = window.__CallStateMachine;
            var _CS2 = window.CALL_STATE;
            if (_cm2 && _sm2 && _CS2) {
                var _cid2 = callsState.activeCallId || callsState.serverCallId || callsState.localCallId;
                if (_cid2) {
                    if (!_sm2.getSession(_cid2)) {
                        _sm2.createSession(_cid2, callsState.callType || 'audio', null, !!callsState._isCaller);
                        _sm2.transition(_cid2, _CS2.OUTGOING);
                        _sm2.transition(_cid2, _CS2.CONNECTING);
                    }
                    var _isVid2 = !!(callsState.callType === 'video');
                    _cm2.onConnected(_cid2, _isVid2);
                    _cmTimerDelegated = true;
                }
            }
        } catch(_be2) {}







        // ── SESSION MANAGER: mark connected ──────────────────────────────────



        const mgr = window.KynectaCallSession;



        if (mgr && mgr.isActive) mgr.markConnected();







        // ── LOCAL-FIRST: update status to connected ───────────────────────────



        (function _markConnectedLocally() {



            const store = window.KynectaCallLocalStore;



            if (!store) return;



            const id = callData.callId || callsState.activeCallId;



            if (!id) return;



            store.updateStatus(id, 'connected').catch(() => {});



        })();







        notifyListeners('call_connected', callData);



    }



    



    function handleCallRejected(callData) {



        logCall(MODULE, 'handleCallRejected', callData);



        



        resetCallState();



        notifyListeners('call_rejected', callData);



    }



    



    function handleCallEnded(callData) {
            // FIX-020: Guaranteed ringtone stop — must run BEFORE anything else
            // to prevent ringtone looping when UI reset path fails
            try {
                if (window._incomingRingtone) {
                    window._incomingRingtone.pause();
                    window._incomingRingtone.currentTime = 0;
                    window._incomingRingtone = null;
                }
                if (window._callerRingtone) {
                    window._callerRingtone.pause();
                    window._callerRingtone.currentTime = 0;
                    window._callerRingtone = null;
                }
                if (window._callRingTimer)    { clearInterval(window._callRingTimer);    window._callRingTimer    = null; }
                if (window._outgoingRingTimer) { clearInterval(window._outgoingRingTimer); window._outgoingRingTimer = null; }
                // Also stop any HTMLAudioElement playing call tones
                document.querySelectorAll('audio[data-call-tone]').forEach(function(a) {
                    try { a.pause(); a.currentTime = 0; } catch(_) {}
                });
            } catch(_) {}

            // SCREEN MANAGER: call ended — go idle then navigate back
            if (typeof window.showScreen === "function") { window.showScreen("idle"); }
            var __ov2 = document.getElementById("callOverlay"); if (__ov2) __ov2.setAttribute("data-state", "idle");
            // Stop all media tracks immediately on call end
            if (window.UIState && window.UIState.localStream) {
                try { window.UIState.localStream.getTracks().forEach(function(t) { t.stop(); }); } catch(e) {}
                window.UIState.localStream = null;
            }
            // Clear caller flag on call end
            if (window.callsState) window.callsState._isCaller = false;
            window.__callerCallId = null;



        logCall(MODULE, 'handleCallEnded', callData);







        // ── SESSION MANAGER: end session ─────────────────────────────────────



        (function _endSession() {



            const mgr = window.KynectaCallSession;



            if (mgr && mgr.isActive) {



                const status = callData.status || 'ended';



                mgr.end(status);



            }



        })();







        // ── LOCAL-FIRST: finalize local history record ──────────────────────



        (function _finalizeLocally() {



            const store = window.KynectaCallLocalStore;



            if (!store) return;



            const id = callData.callId || callsState.activeCallId;



            if (!id) return;



            const status = callData.status || 'ended';



            const duration = callData.duration || 



                (callsState.callStartTime ? Math.floor((Date.now() - callsState.callStartTime) / 1000) : 0);



            store.updateStatus(id, status, { duration, endedAt: Date.now() }).catch(() => {});



        })();



        



        // ── FIX: This is the remote-hangup path (other party ended the call via
        // WebSocket). The comment above said "go idle then navigate back" but
        // resetCallState() wiped pendingCallReturnTo without ever telling the
        // parent to navigate — so whichever side received this event (caller
        // if receiver hung up, or vice versa) was left stuck on the call screen.
        var _hceReturnTarget = (callsState && (callsState.pendingCallReturnTo || callsState.pendingCallSource)) || 'conversations';

        resetCallState();

        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _hceReturnTarget, timestamp: Date.now() }, '*');
            }
        } catch (_e) {}

        notifyListeners('call_ended', callData);



    }



    



// ADD THIS FUNCTION RIGHT AFTER handleCallEnded



function handleCallForceEnd(callData) {



    logCall(MODULE, 'Force ending call', callData);



    



    // Immediately reset all call state



    resetCallState();



    callsState.callActive = false;



    callsState.callState = 'idle';



    callsState.activeCallId = null;



    callsState.activeCall = null;



    callsState.callType = null;



    callsState.callParticipants = [];



    callsState.callStartTime = null;



    callsState.connectionState = 'new';



    callsState.signalingState = 'new';



    callsState.callData = null;



    



    // Clear timers



    if (callsState.callInvitationTimer) {



        clearTimeout(callsState.callInvitationTimer);



        callsState.callInvitationTimer = null;



    }



    



    // Clean up media



    if (MediaManager && MediaManager.stopLocalStream) {



        MediaManager.stopLocalStream();



    }



    if (WebRTCManager && WebRTCManager.close) {



        WebRTCManager.close();



    }



    



    // Notify UI to close



    notifyListeners('call_force_ended', callData);



    notifyListeners('call_ended', callData);



    



    // Force UI update



    if (typeof UIBridge !== 'undefined' && UIBridge._closeCallUI) {



        UIBridge._closeCallUI();



    }



    



    console.log('[CallsCore] Call force ended by remote user');



}







function handleCallFailed(callData) {



    logCall(MODULE, 'handleCallFailed', callData);



    



    resetCallState();



    notifyListeners('call_failed', callData);



}







    function handleCallFailed(callData) {



        logCall(MODULE, 'handleCallFailed', callData);



        



        resetCallState();



        notifyListeners('call_failed', callData);



    }



    



    function handleCallTimeout(callData) {



        logCall(MODULE, 'handleCallTimeout', callData);



        



        resetCallState();



        notifyListeners('call_timeout', callData);



    }







// Real-time message handlers for instant messaging and status updates



function _handleRealtimeMessage(messageData) {



    console.log('[CallsCore] Received real-time message:', messageData);



    



    // Forward to message system if available



    if (window.MessagesCore && window.MessagesCore.addMessage) {



        window.MessagesCore.addMessage(messageData);



    }



    



    // Show notification if not in chat



    if (document.hidden || !window.location.href.includes('chat.html')) {



        if (window.showNotification) {



            window.showNotification(`New message from ${messageData.senderName}: ${messageData.text}`, 'message');



        }



    }



}







function _handleUserStatus(statusData) {



    console.log('[CallsCore] User status update:', statusData);



    



    // Update online status indicators



    updateOnlineStatusIndicators(statusData.userId, statusData.status === 'online');



    



    // Update call UI if user is in current call



    if (callsState.activeCallId && callsState.participants) {



        const participant = callsState.participants.find(p => p.id === statusData.userId);



        if (participant) {



            participant.online = statusData.status === 'online';



            updateCallUI();



        }



    }



    



    // Dispatch event for other components



    window.dispatchEvent(new CustomEvent('user_online_status', {



        detail: { userId: statusData.userId, isOnline: statusData.status === 'online' }



    }));



}







function _handleCallStatus(callData) {



    console.log('[CallsCore] Call status update:', callData);



    



    switch (callData.type) {



        case 'call_initiated':



            handleCallInitiated(callData);



            break;



        case 'call_accepted':



            handleCallAccepted(callData);
            // SCREEN MANAGER: directly switch to in-call screen, bypassing callOverlay
            if (typeof window.showScreen === "function") { window.showScreen("in-call"); }
            var __ov = document.getElementById("callOverlay"); if (__ov) __ov.setAttribute("data-state", "idle");



            break;



        case 'call_started':



            handleCallStarted(callData);



            break;



        case 'call_connected':



            handleCallConnected(callData);



            break;



        case 'call_rejected':



            handleCallRejected(callData);



            break;



        case 'call_ended':



            handleCallEnded(callData);



            break;



        case 'incoming_call':



            handleIncomingCall(callData);



            break;



        default:



            console.log('[CallsCore] Unknown call status:', callData.type);



    }



}







function _handleOnlineUsers(usersData) {



    console.log('[CallsCore] Online users update:', usersData);



    



    if (usersData.users && Array.isArray(usersData.users)) {



        usersData.users.forEach(user => {



            _handleUserStatus({



                type: 'user_status',



                userId: user.id,



                status: 'online',



                lastSeen: user.lastSeen



            });



        });



    }



}







function _handleTyping(typingData) {



    console.log('[CallsCore] Typing indicator:', typingData);



    



    // Update typing indicators in chat



    if (window.MessagesCore && window.MessagesCore.showTyping) {



        window.MessagesCore.showTyping(typingData.userId, typingData.isTyping);



    }



}







function _handleAuthSuccess(authData) {



    console.log('[CallsCore] Authentication successful:', authData);



    



    // Update connection status



    if (window.KynectaRealtime) {



        window.KynectaRealtime._authenticated = true;



        window.KynectaRealtime._state = 'authenticated';



    }



}







function _handleAuthError(authData) {



    console.error('[CallsCore] Authentication failed:', authData);



    



    // Show error notification



    if (window.showNotification) {



        window.showNotification('Authentication failed. Please log in again.', 'error');



    }



}







function updateOnlineStatusIndicators(userId, isOnline) {



    // Update all online/offline indicators for this user



    const indicators = document.querySelectorAll(`[data-user-id="${userId}"] .online-status, [data-user-id="${userId}"] .status-indicator`);



    



    indicators.forEach(indicator => {



        if (isOnline) {



            indicator.classList.add('online');



            indicator.classList.remove('offline');



            indicator.title = 'Online';



        } else {



            indicator.classList.add('offline');



            indicator.classList.remove('online');



            indicator.title = 'Offline';



        }



    });



}







function updateCallUI() {
    // Drive screen transitions through the injected window.showScreen manager
    // This replaces the callsUI delegation which was triggering the call panel overlay.
    var state = (window.callsState && window.callsState.callState) || "idle";
    if (typeof window.showScreen === "function") {
        if (state === "initiating" || state === "ringing") {
            window.showScreen("calling");
        } else if (state === "connected" || state === "in-call" || state === "connecting") {
            window.showScreen("in-call");
        } else if (state === "idle") {
            window.showScreen("idle");
        }
    } else if (window.callsUI && window.callsUI.updateCallUI) {
        // Fallback only if showScreen not yet available
        window.callsUI.updateCallUI();
    }
    // Always suppress callOverlay
    var overlay = document.getElementById("callOverlay");
    if (overlay) overlay.setAttribute("data-state", "idle");
}










// Expose handlers globally for WebSocket integration



window.CallHandlers = {



    _handleRealtimeMessage,



    _handleUserStatus,



    _handleCallStatus,



    _handleOnlineUsers,



    _handleTyping,



    _handleAuthSuccess,



    _handleAuthError



};







    function handleCallBusy(callData) {



        logCall(MODULE, 'handleCallBusy', callData);



        



        resetCallState();



        notifyListeners('call_busy', callData);



    }



    



    // WebRTC Signaling Handlers (Real)



    async function handleSignalOffer(payload) {



    logCall(MODULE, 'handleSignalOffer', { callId: payload.callId });



    



    // ✅ FIX: Force callsState.callActive = true when offer arrives on receiver side
    // so the offer is never dropped due to inactive state guard
    const _validOfferStates = ['initiating','initiated','incoming','connecting','in-call',
                               'starting','ringing','connected','in_call','in-progress',
                               'accepted','answering','call_ready'];
    // ✅ FIX: Queue offer if call not active yet — receiver may get offer before acceptCall completes
    if (!callsState.callActive && !_validOfferStates.includes(callsState.callState)) {
        if (!window.__pendingOfferPayload) {
            window.__pendingOfferPayload = payload;
            window.__pendingOfferRetries = 0;
            var _offerRetryInterval = setInterval(function() {
                window.__pendingOfferRetries = (window.__pendingOfferRetries || 0) + 1;
                if (callsState.callActive || _validOfferStates.includes(callsState.callState)) {
                    clearInterval(_offerRetryInterval);
                    var _q = window.__pendingOfferPayload; window.__pendingOfferPayload = null;
                    if (_q) handleSignalOffer(_q);
                } else if (window.__pendingOfferRetries >= 15) {
                    clearInterval(_offerRetryInterval);
                    callsState.callActive = true;
                    var _q2 = window.__pendingOfferPayload; window.__pendingOfferPayload = null;
                    if (_q2) handleSignalOffer(_q2);
                }
            }, 200);
        }
        logWarn(MODULE, 'Signal offer queued — callState:', callsState.callState);
        return;
    }
    if (!callsState.callActive && _validOfferStates.includes(callsState.callState)) {
        callsState.callActive = true;
        console.log('[CallsCore] handleSignalOffer: forced callActive=true (state:', callsState.callState, ')');
    }



    



    if (!WebRTCManager._peerConnection) {



        // Receiver may not have set up PC yet if acceptCall hasn't finished



        logWarn(MODULE, 'No peer connection for signal offer — attempting to create one');



        try {



            const constraints = { audio: CONFIG.AUDIO_CONSTRAINTS, video: callsState.callType === 'video' };



            const streamResult = await MediaManager.getLocalStream(constraints);



            if (streamResult.success) {



                WebRTCManager.createPeerConnection();



                WebRTCManager.addStream(streamResult.stream);



                WebRTCManager.setCurrentCallId(callsState.activeCallId);



                console.log('[CallsCore] ✅ Peer connection created for incoming offer');



            } else {



                logError(MODULE, 'Could not get local stream for offer handling');



                return;



            }



        } catch (e) {



            logError(MODULE, 'Failed to create peer connection for offer', e);



            return;



        }



    }



    



    try {



        await WebRTCManager.setRemoteDescription(payload.offer);



        console.log('[CallsCore] Remote description (offer) set');







        const answer = await WebRTCManager.createAnswer();



        



        // FIXED: Send as direct message type, not as ACTION



        // FIX: targetUserId MUST be in the answer payload — the backend routes the
        // answer back to the original caller. payload.callerId is the caller's ID.
        var _answerTargetId = (payload && (payload.callerId || payload.callerId)) ||
                              (callsState.callData && callsState.callData.callerId) || null;
        var _answerPayload = {
            callId: payload.callId || callsState.activeCallId,
            answer: answer,
            targetUserId: _answerTargetId,
            remoteUserId: _answerTargetId,
            timestamp: Date.now()
        };
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'SIGNAL_ANSWER', payload: _answerPayload, source: 'calls-core-direct' }, '*');
        }
        // Also emit directly via Socket.IO for reliability
        var _directSockAns = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
        if (_directSockAns && typeof _directSockAns.emit === 'function' && _answerTargetId) {
            _directSockAns.emit('call:webrtc_answer', {
                callId: _answerPayload.callId, targetUserId: _answerTargetId, answer: answer,
            });
            console.log('[CallsCore] ✅ ANSWER sent via Socket.IO to caller:', _answerTargetId);
        } else {
            safeSend('SIGNAL_ANSWER', _answerPayload, false);
            console.log('[CallsCore] ✅ ANSWER sent via safeSend. targetUserId:', _answerTargetId);
        }
        DiagnosticsAgent.record('signaling_send');



        



    } catch (error) {



        logError(MODULE, 'Failed to handle signal offer', error);



    }



}



    async function handleSignalAnswer(payload) {



        logCall(MODULE, 'handleSignalAnswer', { callId: payload.callId });



        



        // FIX: allow all valid mid-call states for signal answer too
        const _validAnsStates = ['initiating','initiated','connecting','in-call',
                                  'in_call','starting','ringing','connected',
                                  'in-progress','accepted','answering','call_ready','incoming'];
        if (!callsState.callActive && !_validAnsStates.includes(callsState.callState)) {



            logWarn(MODULE, 'Signal answer received but no active call');



            return;



        }



        



        // ✅ FIX: Queue answer if no peer connection yet (timing issue)
        if (!WebRTCManager._peerConnection) {
            if (!window.__pendingAnswerPayload) {
                window.__pendingAnswerPayload = payload;
                var _ansRetries = 0;
                var _ansInterval = setInterval(function() {
                    _ansRetries++;
                    if (WebRTCManager._peerConnection) {
                        clearInterval(_ansInterval);
                        var q = window.__pendingAnswerPayload; window.__pendingAnswerPayload = null;
                        if (q) handleSignalAnswer(q);
                    } else if (_ansRetries >= 15) {
                        clearInterval(_ansInterval);
                        window.__pendingAnswerPayload = null;
                        logWarn(MODULE, 'Answer dropped: no peer connection after 3s');
                    }
                }, 200);
            }
            logWarn(MODULE, 'Signal answer queued — waiting for peer connection');
            return;
        }



        



        try {



            await WebRTCManager.setRemoteDescription(payload.answer);



            DiagnosticsAgent.record('signaling_recv');



            console.log('[CallsCore] ✅ ANSWER RECEIVED — remote description set');







            // Flush any ICE candidates that arrived before the answer was set



            if (callsState.iceCandidates && callsState.iceCandidates.length > 0) {



                console.log('[CallsCore] Flushing', callsState.iceCandidates.length, 'queued ICE candidates');



                const queued = callsState.iceCandidates.splice(0);



                for (const candidate of queued) {



                    try { await WebRTCManager.addIceCandidate(candidate); } catch (_) {}



                }



            }



        } catch (error) {



            logError(MODULE, 'Failed to handle signal answer', error);



        }



    }



    



    async function handleIceCandidate(payload) {



    logCall(MODULE, 'handleIceCandidate', { callId: payload.callId });



    



    // ✅ FIX: Accept ICE candidates in all transitional states including 'incoming' and 'ringing'
    const _validIceStates = ['initiating','initiated','incoming','ringing','connecting','in-call','in_call','connected','starting'];
    if (!callsState.callActive && !_validIceStates.includes(callsState.callState)) {
        // Queue the candidate for later rather than dropping it
        if (!callsState.iceCandidates) callsState.iceCandidates = [];
        callsState.iceCandidates.push(payload.candidate);
        logWarn(MODULE, 'ICE candidate queued (no active call yet) — state:', callsState.callState);
        return;
    }



    



    if (!WebRTCManager._peerConnection) {



        logWarn(MODULE, 'No peer connection for ICE candidate — queueing');



        // Queue the candidate if remote description not yet set



        callsState.iceCandidates.push(payload.candidate);



        return;



    }



    



    try {



        await WebRTCManager.addIceCandidate(payload.candidate);



        DiagnosticsAgent.record('signaling_recv');



        console.log('[CallsCore] ✅ ICE CANDIDATE applied from remote peer');



        // NOTE: Do NOT re-forward received ICE candidates — that causes a loop.



        // Outbound ICE candidates are sent in WebRTCManager._setupPeerConnectionListeners



        // via the onicecandidate callback.



    } catch (error) {



        logError(MODULE, 'Failed to add ICE candidate', error);



    }



}



    



    function handleRemoteStreamAdded(payload) {



        if (payload.stream) {



            callsState.remoteStream = payload.stream;



            logCall(MODULE, 'Remote stream added');



            notifyListeners('remote_stream_added', payload);



        }



    }



    



    function handleRemoteStreamRemoved(payload) {



        callsState.remoteStream = null;



        logCall(MODULE, 'Remote stream removed');



        notifyListeners('remote_stream_removed', payload);



    }



    



    function handleInitData(message) {



        const data = message.payload || message.data || {};



        



        logSuccess(MODULE, 'Received module init data', {



            hasSession: !!(data.session || data.user)



        });



        



        if (data.session) {



            // Validate session before applying



            if (__isValidSession(data.session)) {



                callsState.session = data.session;



                if (data.session.token) callsState.token = data.session.token;



                callsState.sessionReceived = true;



                callsState.sessionStatus = 'valid';



                validSessionConfirmed = true;



            } else {



                logWarn(MODULE, 'Init data session rejected - invalid', data.session);



            }



        } else if (data.user) {



            const candidateSession = {



                user: data.user,



                token: data.token,



                authenticated: data.authenticated !== false,



                userId: data.user.id,



                expiresAt: data.expiresAt || Date.now() + 3600000



            };



            if (__isValidSession(candidateSession)) {



                callsState.session = candidateSession;



                if (data.token) callsState.token = data.token;



                if (data.user && data.token) {



                    callsState.sessionReceived = true;



                    callsState.sessionStatus = 'valid';



                    validSessionConfirmed = true;



                }



            } else {



                logWarn(MODULE, 'Init data session rejected - invalid user data');



            }



        }



        



        if (data.isPremium !== undefined) {



            callsState.isPremium = data.isPremium;



        }



        



        if (data.premiumFeatures) {



            callsState.premiumFeatures = { ...callsState.premiumFeatures, ...data.premiumFeatures };



        }



        



        callsState.initialized = true;



        



        notifyListeners('module_ready', {



            session: callsState.session,



            isPremium: callsState.isPremium



        });



        



        logSuccess(MODULE, 'Module initialization complete');



    }



    



    // ==================== NOTIFICATION SYSTEM ====================



    const listeners = new Set();



    



    function notifyListeners(event, data) {



        listeners.forEach(listener => {



            try { listener(event, data); } catch (e) {}



        });



    }



    



    // ==================== UI BRIDGE ====================



    const UIBridge = {



        _initialized: false,



_acceptCallHandler: null,



_rejectCallHandler: null,



_endCallHandler: null,



_muteCallHandler: null,



_videoCallHandler: null,



        _eventListeners: new Map(),



        _elements: new Map(),



        



        initialize: function() {



            if (this._initialized) return this;



            



            document.addEventListener('DOMContentLoaded', () => {



                this._setupEventListeners();



                this._attachCallControls();



            });



            



            if (document.readyState === 'complete' || document.readyState === 'interactive') {



                setTimeout(() => {



                    this._setupEventListeners();



                    this._attachCallControls();



                }, 100);



            }



            



            this._initialized = true;



            logReady(MODULE, 'UIBridge initialized');



            return this;



        },



        



        _setupEventListeners: function() {



            this._attachCallButtons();



            this._attachMediaControls();



            this._attachMoodControls();



            this._attachChatInputs();



        },



        



        _attachCallButtons: function() {



            const callButtons = document.querySelectorAll('[data-action="start-call"], .start-call-btn, #startCallBtn');



            callButtons.forEach(button => {



                const callType = button.dataset.callType || button.getAttribute('data-call-type') || 'voice';



                const targetUserId = button.dataset.targetUserId || button.getAttribute('data-target-user-id');



                



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('start-call')) {



                        notifyListeners('session_required', { action: 'start-call' });



                        return;



                    }



                    if (!callsState.session || !__isValidSession(callsState.session)) {



                        notifyListeners('session_required', { action: 'start-call' });



                        return;



                    }



                    window.callCore.startCall(targetUserId, callType).catch(error => {



                        logError(MODULE, 'Call initiation failed', error);



                        notifyListeners('call_error', { error: error.message });



                    });



                };



                



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



        },



        



        _attachCallControls: function() {



    // Accept call button



    const acceptBtn = document.getElementById('acceptCallBtn') || 



                      document.querySelector('[data-action="accept-call"]') ||



                      document.querySelector('.accept-call-btn');



    if (acceptBtn) {



        acceptBtn.removeEventListener('click', this._acceptCallHandler);



        this._acceptCallHandler = (e) => {



            e.preventDefault();



            if (!window.callCore || !window.callCore.isCoreReady()) {



                console.warn('[Calls UI] Core not ready to accept call');



                return;



            }



            const callId = window._currentIncomingCallId || callsState.activeCallId;



            if (callId) {



                window.callCore.answerCall(callId).then(result => {



                    if (result.success) {



                        console.log('[Calls UI] Call accepted');



                    } else {



                        console.error('[Calls UI] Failed to accept call', result);



                    }



                });



            }



        };



        acceptBtn.addEventListener('click', this._acceptCallHandler);



    }



    



    // Reject/Decline call button



    // calls.html uses id="declineCallBtn"; keep rejectCallBtn as legacy fallback



    const rejectBtn = document.getElementById('declineCallBtn') ||



                      document.getElementById('rejectCallBtn') || 



                      document.querySelector('[data-action="reject-call"]') ||



                      document.querySelector('.reject-call-btn');



    if (rejectBtn) {



        rejectBtn.removeEventListener('click', this._rejectCallHandler);



        this._rejectCallHandler = (e) => {



            e.preventDefault();



            if (!window.callCore) return;



            const callId = window._currentIncomingCallId || callsState.activeCallId;



            if (callId) {



                window.callCore.declineCall(callId, 'declined').then(result => {



                    if (result.success) {



                        console.log('[Calls UI] Call rejected');



                        this._closeCallUI();



                    }



                });



            } else {



                if (window.callCore.resetCallState) {



                    window.callCore.resetCallState();



                }



                this._closeCallUI();



            }



        };



        rejectBtn.addEventListener('click', this._rejectCallHandler);



    }



    



    // End/Hangup call button



    const endCallBtn = document.getElementById('endCallBtn') || 



                       document.querySelector('[data-action="end-call"]') ||



                       document.querySelector('.end-call-btn');



    if (endCallBtn) {



        endCallBtn.removeEventListener('click', this._endCallHandler);



        this._endCallHandler = (e) => {



            e.preventDefault();



            if (!window.callCore) return;



            const callId = callsState.activeCallId;



            if (callId) {



                window.callCore.endCall(callId).then(result => {



                    if (result.success) {



                        console.log('[Calls UI] Call ended');



                        this._closeCallUI();



                    }



                });



            } else {



                if (window.callCore.resetCallState) {



                    window.callCore.resetCallState();



                }



                this._closeCallUI();



            }



        };



        endCallBtn.addEventListener('click', this._endCallHandler);



    }



    



    // Mute button



    const muteBtn = document.getElementById('muteCallBtn') || 



                    document.querySelector('[data-action="mute-call"]') ||



                    document.querySelector('.mute-call-btn');



    if (muteBtn) {



        muteBtn.removeEventListener('click', this._muteCallHandler);



        this._muteCallHandler = (e) => {



            e.preventDefault();



            if (window.callCore && window.callCore.toggleMic) {



                const result = window.callCore.toggleMic();



                const isMuted = !callsState.micEnabled;



                muteBtn.classList.toggle('active', isMuted);



                muteBtn.querySelector('i')?.classList.toggle('fa-microphone-slash', isMuted);



                muteBtn.querySelector('i')?.classList.toggle('fa-microphone', !isMuted);



            }



        };



        muteBtn.addEventListener('click', this._muteCallHandler);



    }



    



    // Video toggle button



    const videoBtn = document.getElementById('videoCallBtn') || 



                     document.querySelector('[data-action="toggle-video"]') ||



                     document.querySelector('.toggle-video-btn');



    if (videoBtn) {



        videoBtn.removeEventListener('click', this._videoCallHandler);



        this._videoCallHandler = (e) => {



            e.preventDefault();



            if (window.callCore && window.callCore.toggleCamera) {



                window.callCore.toggleCamera();



                const isVideoOn = callsState.cameraEnabled;



                videoBtn.classList.toggle('active', isVideoOn);



            }



        };



        videoBtn.addEventListener('click', this._videoCallHandler);



    }



},







_closeCallUI: function() {



    // Hide incoming call modal — calls.html uses #incomingCallModal (not #callModal)



    const incomingModal = document.getElementById('incomingCallModal') ||



                          document.getElementById('callModal') ||



                          document.querySelector('.incoming-call-modal') ||



                          document.querySelector('.call-modal') ||



                          document.querySelector('.call-overlay');



    if (incomingModal) {



        incomingModal.style.display = 'none';



        incomingModal.classList.remove('active');



        incomingModal.classList.add('hidden');



    }







    // Also hide the new-call modal if open



    const newCallModal = document.getElementById('newCallModal');



    if (newCallModal) {



        newCallModal.classList.remove('active');



    }







    // Remove active class from call container so it collapses back



    const callContainer = document.getElementById('callContainer') ||



                          document.querySelector('.call-container');



    if (callContainer) {



        callContainer.classList.remove('active');



    }







    // Reset incoming call tracking



    window._currentIncomingCallId = null;



},







        



        _attachMediaControls: function() {



            const micButtons = document.querySelectorAll('[data-action="toggle-mic"], .toggle-mic-btn, #toggleMicBtn');



            micButtons.forEach(button => {



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('toggle-mic')) return;



                    window.callCore.toggleMic();



                };



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



            



            const cameraButtons = document.querySelectorAll('[data-action="toggle-camera"], .toggle-camera-btn, #toggleCameraBtn');



            cameraButtons.forEach(button => {



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('toggle-camera')) return;



                    window.callCore.toggleCamera();



                };



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



            



            const switchCameraButtons = document.querySelectorAll('[data-action="switch-camera"], .switch-camera-btn, #switchCameraBtn');



            switchCameraButtons.forEach(button => {



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('switch-camera')) return;



                    window.callCore.switchCamera();



                };



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



            



            const screenShareButtons = document.querySelectorAll('[data-action="screen-share"], .screen-share-btn, #screenShareBtn');



            screenShareButtons.forEach(button => {



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('screen-share')) return;



                    if (callsState.screenSharing) {



                        window.callCore.stopScreenShare();



                    } else {



                        window.callCore.startScreenShare();



                    }



                };



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



        },



        



        _attachMoodControls: function() {



            const moodButtons = document.querySelectorAll('[data-action="set-mood"], .set-mood-btn');



            moodButtons.forEach(button => {



                const mood = button.dataset.mood || button.getAttribute('data-mood');



                if (!mood) return;



                



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('set-mood')) return;



                    window.callCore.setMood(mood);



                };



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



            



            const intentionButtons = document.querySelectorAll('[data-action="set-intention"], .set-intention-btn');



            intentionButtons.forEach(button => {



                const intention = button.dataset.intention || button.getAttribute('data-intention');



                if (!intention) return;



                



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('set-intention')) return;



                    window.callCore.setIntention(intention);



                };



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



            



            const focusModeButtons = document.querySelectorAll('[data-action="toggle-focus"], .toggle-focus-btn, #toggleFocusBtn');



            focusModeButtons.forEach(button => {



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('toggle-focus')) return;



                    window.callCore.toggleFocusMode();



                };



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



            



            const reactionButtons = document.querySelectorAll('[data-action="send-reaction"], .send-reaction-btn');



            reactionButtons.forEach(button => {



                const reaction = button.dataset.reaction || button.getAttribute('data-reaction');



                if (!reaction) return;



                



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('send-reaction')) return;



                    window.callCore.sendReaction(reaction);



                };



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



        },



        



        _attachChatInputs: function() {



            const chatInputs = document.querySelectorAll('[data-action="send-message"], .chat-input, #chatInput');



            chatInputs.forEach(input => {



                const handler = (e) => {



                    if (e.key === 'Enter' && !e.shiftKey) {



                        e.preventDefault();



                        if (!assertActive('send-message')) return;



                        const message = input.value.trim();



                        if (message) {



                            window.callCore.sendChatMessage(message);



                            input.value = '';



                        }



                    }



                };



                input.removeEventListener('keydown', handler);



                input.addEventListener('keydown', handler);



                this._eventListeners.set(input, { type: 'keydown', handler });



            });



            



            const sendButtons = document.querySelectorAll('[data-action="send-chat"], .send-chat-btn, #sendChatBtn');



            sendButtons.forEach(button => {



                const handler = (e) => {



                    e.preventDefault();



                    if (!assertActive('send-chat')) return;



                    const input = document.querySelector('[data-action="send-message"], .chat-input, #chatInput');



                    if (input) {



                        const message = input.value.trim();



                        if (message) {



                            window.callCore.sendChatMessage(message);



                            input.value = '';



                        }



                    }



                };



                button.removeEventListener('click', handler);



                button.addEventListener('click', handler);



                this._eventListeners.set(button, { type: 'click', handler });



            });



        },



        



        cleanup: function() {



            this._eventListeners.forEach((listener, element) => {



                element.removeEventListener(listener.type, listener.handler);



            });



            this._eventListeners.clear();



            this._elements.clear();



        },



        



        getStatus: function() {



            return {



                initialized: this._initialized,



                eventListeners: this._eventListeners.size



            };



        }



    };



    



    UIBridge.initialize();



    



    // ==================== INITIALIZATION SEQUENCE ====================



    function initializeModule() {



        if (initializationLock) {



            console.warn(`[${MODULE_NAME}][LIFECYCLE] Initialization already in progress`);



            return;



        }



        



        initializationLock = true;



        



        console.log(`[${MODULE_NAME}][LIFECYCLE] Starting initialization`);



        



        // Only transition if we're in BOOT state



        if (currentState === LifecycleState.BOOT) {



            transitionTo(LifecycleState.INITIALIZING, 'module_start');



        }



        



        logInfo(MODULE_NAME, 'Initializing module');



        



        // Setup message listener (already set up in IframeTransport)



        



        // Only transition if we're in INITIALIZING state



        if (currentState === LifecycleState.INITIALIZING) {



            transitionTo(LifecycleState.READY, 'init_complete');



            logSuccess(MODULE_NAME, 'READY');



        }



        



        // Send CHILD_READY exactly once - only in READY state



        if (currentState === LifecycleState.READY && !childReadySent) {



            sendChildReady();



        } else {



            console.warn(`[${MODULE_NAME}][LIFECYCLE] Cannot send CHILD_READY - not in READY state (current: ${currentState})`);



        }



        



        initializationLock = false;



        



        logSuccess(MODULE_NAME, `Initialization complete - state: ${currentState}`);



    }



    



    // ==================== MESSAGE HANDLER ====================



    window.addEventListener('message', (event) => {



        setTimeout(() => {



            try {



                if (!isValidOrigin(event.origin)) {



                    logWarn(MODULE_NAME, 'Invalid origin', { origin: event.origin });



                    return;



                }



                



                const msg = event.data;



                



                if (!msg || typeof msg !== 'object') return;



                



                if (msg.type === 'HANDSHAKE_RETRY') {



                    logInfo(MODULE_NAME, 'Received HANDSHAKE_RETRY - ignoring');



                    return;



                }



                



                if (!validateMessage(msg)) {



                    logWarn(MODULE_NAME, 'Invalid message format', msg);



                    return;



                }



                



                if (msg.messageId && MessageGuard.isDuplicate(msg.messageId)) {



                    logInfo(MODULE_NAME, 'Duplicate message ignored', { messageId: msg.messageId });



                    return;



                }



                



                if (msg.source && msg.source !== 'parent') {



                    return;



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



                if (msg.type === MESSAGE_TYPES.PARENT_READY) {



                    handleParentReady(msg);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.HEARTBEAT) {



                    logHeartbeat(MODULE_NAME, 'Heartbeat received');



                    sendHeartbeatAck(msg.messageId);



                    return;



                }



                



                // Handle API_RESPONSE



                if (msg.type === MESSAGE_TYPES.API_RESPONSE) {



                    const requestId = msg.requestId || msg.payload?.requestId;



                    if (requestId && MessageRegistry._pendingMessages.has(requestId)) {



                        const pending = MessageRegistry._pendingMessages.get(requestId);



                        if (pending && pending.resolve && !pending.resolved) {



                            clearTimeout(pending.timeoutId);



                            pending.resolve({



                                success: msg.success !== false,



                                data: msg.payload?.data || msg.data,



                                error: msg.payload?.error || msg.error,



                                requestId: requestId



                            });



                            pending.resolved = true;



                            MessageRegistry._pendingMessages.delete(requestId);



                        }



                    }



                    return;



                }



                



                if (msg.type === 'MODULE_REGISTERED') {



                    logSuccess(MODULE_NAME, 'MODULE_REGISTERED received');



                    callsState.registered = true;



                    



                    window.dispatchEvent(new CustomEvent('MODULE_READY', {



                        detail: { module: MODULE_NAME, timestamp: Date.now() }



                    }));



                    



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.MODULE_INIT_DATA) {



                    handleInitData(msg);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.SESSION_ACTIVE || 



                    msg.type === MESSAGE_TYPES.SESSION_DATA ||



                    msg.type === MESSAGE_TYPES.SESSION_SYNC) {



                    



                    const sessionData = msg.payload || msg.data || {};



                    if (sessionData.token) {



                        // Session deduplication



                        const sessionId = sessionData.sessionId || sessionData.id;



                        if (sessionId && callsState.lastSessionId === sessionId) {



                            logInfo(MODULE, 'Duplicate session message ignored', { sessionId });



                            return;



                        }



                        



                        // CRITICAL: Validate session before accepting



                        const candidateSession = {



                            token: sessionData.token,



                            userId: sessionData.userId || sessionData.user?.id,



                            user: sessionData.user || {},



                            expiresAt: sessionData.expiresAt || sessionData.expiry || (Date.now() + 3600000),



                            authenticated: sessionData.authenticated !== false,



                            sessionId: sessionId || Date.now()



                        };



                        



                        if (!__isValidSession(candidateSession)) {



                            logWarn(MODULE, 'Session message rejected - invalid session data');



                            return;



                        }



                        



                        if (sessionId) {



                            callsState.lastSessionId = sessionId;



                        }



                        



                        callsState.session = candidateSession;



                        callsState.token = candidateSession.token;



                        callsState.sessionReceived = true;



                        callsState.sessionStatus = 'valid';



                        validSessionConfirmed = true;



                        logSession(MODULE_NAME, 'Session received', { sessionId });



                        



                        sessionRequestAttempts = 0;



                        



                        window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {



                            detail: { core: window.callCore, timestamp: Date.now() }



                        }));



                    }



                    



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.SESSION_NULL) {



                    callsState.session = null;



                    callsState.token = null;



                    callsState.sessionReceived = false;



                    callsState.sessionStatus = 'invalid';



                    callsState.lastSessionId = null;



                    validSessionConfirmed = false;



                    logSession(MODULE_NAME, 'SESSION_NULL received');



                    return;



                }



                



                // ==================== CALL SIGNALING HANDLERS ====================



                // ── FIX: accept all naming variants ──



                if (msg.type === MESSAGE_TYPES.CALL_INCOMING ||



                    msg.type === 'CALL_INCOMING' ||



                    msg.type === 'incoming_call' ||



                    msg.type === 'call_incoming') {



                    console.log('[CallsCore] 📞 CALL_INCOMING (msg router) received, routing to handleIncomingCall');



                    handleIncomingCall(msg.payload || msg.data || msg);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.CALL_INITIATED) {



                    handleCallInitiated(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.CALL_ACCEPT) {



                    handleCallAccepted(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.CALL_STARTED) {



                    handleCallStarted(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.CALL_CONNECTED) {



                    handleCallConnected(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.CALL_REJECTED) {



                    handleCallRejected(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.CALL_ENDED) {



                    handleCallEnded(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.CALL_FAILED) {



                    handleCallFailed(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.CALL_TIMEOUT) {



                    handleCallTimeout(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.CALL_BUSY) {



                    handleCallBusy(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.SIGNAL_OFFER) {



                    handleSignalOffer(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.SIGNAL_ANSWER) {



                    handleSignalAnswer(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.ICE_CANDIDATE) {



                    handleIceCandidate(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.REMOTE_STREAM_ADDED) {



                    handleRemoteStreamAdded(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === MESSAGE_TYPES.REMOTE_STREAM_REMOVED) {



                    handleRemoteStreamRemoved(msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'FRIEND_UPDATE' || msg.type === 'CONTACTS_UPDATE') {



                    notifyListeners('contacts_update', msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'CALL_HISTORY_UPDATE') {



                    notifyListeners('call_history_update', msg.payload || msg.data);



                    return;



                }



                



// ── OFFLINE-FIRST: Apply per-key setting changes immediately ──



if (msg.type === 'SETTING_CHANGED' || msg.type === 'SETTINGS_UPDATED') {



    const data = msg.payload || msg.data || {};







    if (msg.type === 'SETTING_CHANGED' && data.section && data.key !== undefined) {



        const { section, key, value } = data;



        applySettingToCallsModule(section, key, value);



        if (data.premium !== undefined) callsState.isPremium = data.premium;



        if (data.premiumFeatures) callsState.premiumFeatures = { ...callsState.premiumFeatures, ...data.premiumFeatures };



        window.dispatchEvent(new CustomEvent('settingChanged', { detail: { section, key, value, timestamp: Date.now() } }));



        notifyListeners('setting_changed', { section, key, value });



        return;



    }







    if (msg.type === 'SETTINGS_UPDATED' && data.settings) {



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



                



                if (msg.type === 'USER_LOGGED_OUT') {



                    resetCallState();



                    callsState.session = null;



                    callsState.token = null;



                    callsState.verified = false;



                    callsState.sessionReceived = false;



                    callsState.sessionStatus = 'invalid';



                    callsState.lastSessionId = null;



                    validSessionConfirmed = false;



                    notifyListeners('logout', {});



                    return;



                }



                



                if (msg.type === 'SESSION_REFRESHED') {



                    const data = msg.payload || msg.data;



                    if (data && data.token) {



                        // Only update token if we have a valid session



                        if (validSessionConfirmed && callsState.session && __isValidSession(callsState.session)) {



                            callsState.token = data.token;



                            if (callsState.session) {



                                callsState.session.token = data.token;



                            }



                            DiagnosticsAgent.record('session_refresh');



                        }



                    }



                    return;



                }



                



                if (msg.type === 'NEW_MESSAGE') {



                    notifyListeners('new_message', msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'STATUS_UPDATE') {



                    notifyListeners('status_update', msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'GROUP_UPDATE') {



                    notifyListeners('group_update', msg.payload || msg.data);



                    return;



                }



                



                if (msg.type === 'AUTH_ERROR' || msg.type === 'SESSION_ERROR') {



                    logWarn(MODULE, 'Auth error received, refreshing session');



                    refreshSession();



                    return;



                }



                



            } catch (error) {



                logError(MODULE_NAME, 'Error handling message', error);



            }



        }, 0);



    });



    



    // ==================== PUBLIC API ====================



    window.callCore = {



        moduleName: MODULE_NAME,



        version: CONFIG.VERSION,



        



        getLifecycleState: function() {



            return currentState;



        },



        



        isCoreReady: function() {



            return currentState === LifecycleState.ACTIVE &&



                   callsState.registered && 



                   callsState.sessionReceived && 



                   callsState.sessionStatus === 'valid' &&



                   callsState.parentReady &&



                   validSessionConfirmed &&



                   __isValidSession(callsState.session);



        },



        



        getState: function() {



            return {



                lifecycleState: currentState,



                registered: callsState.registered,



                initialized: callsState.initialized,



                parentReady: callsState.parentReady,



                coreReady: this.isCoreReady(),



                callState: callsState.callState,



                callActive: callsState.callActive,



                activeCallId: callsState.activeCallId,



                micEnabled: callsState.micEnabled,



                cameraEnabled: callsState.cameraEnabled,



                cameraFacingMode: callsState.cameraFacingMode,



                screenSharing: callsState.screenSharing,



                hasLocalStream: !!callsState.localStream,



                hasRemoteStream: !!callsState.remoteStream,



                deviceInitialized: MediaManager._deviceCheckDone,



                isPremium: callsState.isPremium,



                currentMood: callsState.currentMood,



                currentIntention: callsState.currentIntention,



                currentFocusMode: callsState.currentFocusMode,



                callParticipants: callsState.callParticipants,



                callStartTime: callsState.callStartTime,



                callDuration: callsState.callStartTime ? Math.floor((Date.now() - callsState.callStartTime) / 1000) : 0,



                callType: callsState.callType,



                sessionReceived: callsState.sessionReceived,



                sessionStatus: callsState.sessionStatus,



                degraded: callsState.degraded,



                governorState: CallsStateGovernor.getState(),



                webRTC: WebRTCManager.getStatus(),



                childReadySent: callsState.childReadySent,



                registrationSent: callsState.registrationSent,



                parentReady: parentReady,



                queuedMessages: messageQueue.length,



                signalingState: callsState.signalingState,



                connectionState: callsState.connectionState,



                sessionValid: validSessionConfirmed && __isValidSession(callsState.session),



                callData: callsState.callData



            };



        },



        



        getCallsState: function() {



            return { ...callsState };



        },



        



        resetCallState: function() {



            resetCallState();



            logInfo(MODULE, 'Call state manually reset');



            return { success: true };



        },



        



        getCallState: function() {



            return {



                callActive: callsState.callActive,



                callState: callsState.callState,



                activeCallId: callsState.activeCallId,



                callType: callsState.callType,



                callStartTime: callsState.callStartTime,



                callParticipants: [...callsState.callParticipants],



                callData: callsState.callData



            };



        },







        forceResetCallState: function() {



    console.log('[CallsCore] Force resetting call state');



    



    // Reset all call state variables



    resetCallState();



    callsState.callActive = false;



    callsState.callState = 'idle';



    callsState.activeCallId = null;



    callsState.activeCall = null;



    callsState.callType = null;



    callsState.callParticipants = [];



    callsState.callStartTime = null;



    callsState.connectionState = 'new';



    callsState.signalingState = 'new';



    callsState.callData = null;



    callsState.serverCallId = null;



    callsState.localCallId = null;



    



    // Clear any pending timers



    if (callsState.callInvitationTimer) {



        clearTimeout(callsState.callInvitationTimer);



        callsState.callInvitationTimer = null;



    }



    



    // Clean up media and WebRTC



    if (MediaManager && MediaManager.stopLocalStream) {



        MediaManager.stopLocalStream();



    }



    if (WebRTCManager && WebRTCManager.close) {



        WebRTCManager.close();



    }



    



    // CRITICAL FIX: Restore CallsStateGovernor to ACTIVE so ACTIVE→CALL_READY



    // transition works on the next call attempt. Without this, governor stays



    // in INIT after a force-reset and the INIT→CALL_READY transition is illegal.



    if (CallsStateGovernor) {



        CallsStateGovernor._transitionLock = false;



        // Only force to ACTIVE if we're in a state that's past REGISTERING



        // (i.e. the session was previously valid). This avoids skipping auth.



        const nonTerminalStates = [



            CALLS_STATE.CALL_READY,



            CALLS_STATE.IN_CALL,



            CALLS_STATE.TERMINATED,



            CALLS_STATE.ACTIVE



        ];



        if (nonTerminalStates.includes(CallsStateGovernor._currentState) ||



            CallsStateGovernor._currentState === CALLS_STATE.INIT) {



            CallsStateGovernor._previousState = CallsStateGovernor._currentState;



            CallsStateGovernor._currentState = CALLS_STATE.ACTIVE;



        }



    }



    



    return { success: true };



},



clearActiveCall: function() {



    callsState.callActive = false;



    callsState.callState = 'idle';



    callsState.activeCallId = null;



    callsState.activeCall = null;



    callsState.callType = null;



    callsState.callParticipants = [];



    callsState.callStartTime = null;



    callsState.connectionState = 'new';



    callsState.signalingState = 'new';



    callsState.callData = null;



    



    if (callsState.callInvitationTimer) {



        clearTimeout(callsState.callInvitationTimer);



        callsState.callInvitationTimer = null;



    }



    



    if (WebRTCManager && WebRTCManager.close) WebRTCManager.close();



    if (MediaManager && MediaManager.stopLocalStream) MediaManager.stopLocalStream();



    



    console.log('[CallsCore] Active call cleared');



    return { success: true };



},







        getSession: function() {



            return callsState.session && __isValidSession(callsState.session) ? { ...callsState.session } : null;



        },



        



        getSessionStatus: function() {



            return callsState.sessionStatus;



        },



        



        isAuthenticated: function() {



            return callsState.sessionStatus === 'valid' && 



                   !!(callsState.session && __isValidSession(callsState.session) && callsState.session.authenticated);



        },



        



        authorizedFetch: function(url, options = {}) {



            if (!callsState.session || !__isValidSession(callsState.session)) {



                logWarn(MODULE, 'Blocking API call: session not ready');



                return Promise.reject(new Error('Session not ready'));



            }



            



            if (!this.isCoreReady() && !options.bypassReadyCheck) {



                logWarn(MODULE, 'Blocking API call: core not ready');



                return Promise.reject(new Error('Core not ready'));



            }



            



            const headers = {



                ...(options.headers || {}),



                'Authorization': `Bearer ${callsState.session.token}`,



                'Content-Type': 'application/json'



            };



            



            return fetch(url, {



                ...options,



                headers



            }).then(response => {



                if (response.status === 401) {



                    logWarn(MODULE, 'Received 401 Unauthorized, refreshing session');



                    refreshSession();



                }



                return response;



            });



        },



        



        checkPermissions: function(required) {



            return PermissionManager.checkPermissions(required);



        },



        



        requestPermissions: function(required) {



            return PermissionManager.requestPermissions(required);



        },



        



        startCall: function(targetUserId, callType = 'voice', options = {}) {



            if (!assertActive('startCall')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            if (callsState.callActive) {



                // CRITICAL FIX: If the active call is stale (>90s old with no connection),



                // auto-reset instead of blocking. This prevents the "already in call" loop



                // caused by backend cleanup not propagating to frontend state.



                const callAge = callsState.callStartTime ? Date.now() - callsState.callStartTime : Infinity;



                const hasLiveMedia = !!callsState.localStream || !!callsState.remoteStream;



                const looksDisconnected = !['connected', 'connecting'].includes(callsState.connectionState) &&



                    !['connected', 'ongoing', 'active', 'in_call', 'initiating', 'ringing', 'incoming'].includes(callsState.callState);



                if (callAge > 90000 || (!hasLiveMedia && looksDisconnected)) {



                    logWarn(MODULE, 'Stale callActive detected (>90s), auto-resetting before new call', { callAge, callId: callsState.activeCallId });



                    if (window.callCore && window.callCore.forceResetCallState) {



                        window.callCore.forceResetCallState();



                    } else {



                        resetCallState();



                        callsState.callActive = false;



                        callsState.callState = 'idle';



                        callsState.activeCallId = null;



                        if (CallsStateGovernor) {



                            CallsStateGovernor._transitionLock = false;



                            CallsStateGovernor._currentState = CALLS_STATE.ACTIVE;



                        }



                    }



                } else {



                    logWarn(MODULE, 'Cannot start call - another call already active');



                    return Promise.resolve({ success: false, reason: 'call_active' });



                }



            }



            



            if (!callsState.session || !__isValidSession(callsState.session)) {



                logWarn(MODULE, 'Cannot start call - no valid session');



                return Promise.resolve({ success: false, reason: 'no_valid_session' });



            }



            



            DiagnosticsAgent.record('call_start');



            



            // Convert targetUserId to participants array



            const participants = targetUserId ? [targetUserId] : [];



            



            return CallsStateGovernor.initiateCall(callType, participants);



        },



        



        startGroupCall: function(participants = [], callType = 'voice', options = {}) {



            if (!assertActive('startGroupCall')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            if (callsState.callActive) {



                const callAge = callsState.callStartTime ? Date.now() - callsState.callStartTime : Infinity;



                if (callAge > 90000) {



                    logWarn(MODULE, 'Stale callActive on group call (>90s), auto-resetting');



                    resetCallState();



                    callsState.callActive = false;



                    callsState.callState = 'idle';



                    callsState.activeCallId = null;



                    if (CallsStateGovernor) { CallsStateGovernor._transitionLock = false; CallsStateGovernor._currentState = CALLS_STATE.ACTIVE; }



                } else {



                    return Promise.resolve({ success: false, reason: 'call_active' });



                }



            }



            



            if (!callsState.session || !__isValidSession(callsState.session)) {



                return Promise.resolve({ success: false, reason: 'no_valid_session' });



            }



            



            // FIX (Forensic Audit P1): Premium gate removed. groupCalls.enabled=true by default.
            // Keep gate logic for future premium-only features but not group calls.
            if (!callsState.isPremium && !callsState.premiumFeatures.groupCalls) {
                // groupCalls is now always true; this branch should not be reached.
                // Log warning in case premiumFeatures gets set externally to false.
                console.warn('[Calls] groupCalls gate triggered but should be open — check premiumFeatures state');



                return { success: false, reason: 'premium_required' };



            }



            



            DiagnosticsAgent.record('call_start');



            



            return CallsStateGovernor.initiateCall(callType, participants);



        },



        



        answerCall: function(callId) {



            if (!assertActive('answerCall')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            if (callsState.callActive) {



                return Promise.resolve({ success: false, reason: 'call_active' });



            }



            



            if (!callsState.session || !__isValidSession(callsState.session)) {



                return Promise.resolve({ success: false, reason: 'no_valid_session' });



            }



            



            DiagnosticsAgent.record('call_accept');



            



            return CallsStateGovernor.acceptCall(callId);



        },



        



        declineCall: function(callId, reason = 'declined') {



            if (!assertActive('declineCall')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            DiagnosticsAgent.record('call_reject');



            



            return CallsStateGovernor.rejectCall(callId, reason);



        },



        



        endCall: function(callId) {



            if (!assertActive('endCall')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            DiagnosticsAgent.record('call_end', { reason: 'user_ended' });



            



            return CallsStateGovernor.endCall(callId);



        },



        



        toggleMic: function() {



            if (!assertActive('toggleMic')) {



                return false;



            }



            



            const newState = !callsState.micEnabled;



            const result = MediaManager.toggleMic(newState);



            



            if (result) {



                IframeTransport.sendAction('TOGGLE_MIC', {



                    enabled: newState,



                    timestamp: Date.now()



                });



            }



            



            return result;



        },



        



        toggleCamera: function() {



            if (!assertActive('toggleCamera')) {



                return false;



            }



            



            const newState = !callsState.cameraEnabled;



            const result = MediaManager.toggleCamera(newState);



            



            if (result) {



                IframeTransport.sendAction('TOGGLE_CAMERA', {



                    enabled: newState,



                    timestamp: Date.now()



                });



            }



            



            return result;



        },



        



        switchCamera: function() {



            if (!assertActive('switchCamera')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            return MediaManager.switchCamera().then(result => {



                if (result.success) {



                    IframeTransport.sendAction('SWITCH_CAMERA', {



                        facingMode: result.facingMode,



                        timestamp: Date.now()



                    });



                }



                return result;



            });



        },



        



        startScreenShare: function() {



            if (!assertActive('startScreenShare')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            



            if (!callsState.isPremium && !callsState.premiumFeatures.screenSharing) {



                notifyListeners('premium_required', { feature: 'screenSharing' });



                return Promise.resolve({ success: false, reason: 'premium_required' });



            }



            



            return MediaManager.startScreenShare().then(result => {



                if (result.success) {



                    IframeTransport.sendAction('START_SCREEN_SHARE', {



                        timestamp: Date.now()



                    });



                }



                return result;



            });



        },



        



        stopScreenShare: function() {



            if (!assertActive('stopScreenShare')) return;



            



            MediaManager.stopScreenShare();



            IframeTransport.sendAction('STOP_SCREEN_SHARE', {



                timestamp: Date.now()



            });



        },



        



        getLocalStream: function(constraints) {



            return MediaManager.getLocalStream(constraints);



        },



        



        stopLocalStream: function() {



            MediaManager.stopLocalStream();



        },



        



        enumerateDevices: function() {



            return MediaManager.enumerateDevices();



        },



        



        getWebRTCManager: function() {



            return WebRTCManager;



        },



        



        sendDataChannelMessage: function(data) {



            return WebRTCManager.sendData(data);



        },



        



        setMood: function(mood) {



            if (!assertActive('setMood')) return;



            



            callsState.currentMood = mood;



            IframeTransport.sendAction('SET_MOOD', {



                mood,



                timestamp: Date.now()



            });



            notifyListeners('mood_updated', { mood });



        },



        



        setIntention: function(intention) {



            if (!assertActive('setIntention')) return;



            



            callsState.currentIntention = intention;



            IframeTransport.sendAction('SET_INTENTION', {



                intention,



                timestamp: Date.now()



            });



            notifyListeners('intention_updated', { intention });



        },



        



        toggleFocusMode: function() {



            if (!assertActive('toggleFocusMode')) return;



            



            const newState = !callsState.currentFocusMode;



            callsState.currentFocusMode = newState;



            IframeTransport.sendAction('TOGGLE_FOCUS_MODE', {



                enabled: newState,



                timestamp: Date.now()



            });



            notifyListeners('focus_mode_toggled', { enabled: newState });



        },



        



        sendReaction: function(reaction) {



            if (!assertActive('sendReaction')) return;



            



            IframeTransport.sendAction('SEND_REACTION', {



                reaction,



                timestamp: Date.now()



            });



        },



        



        sendChatMessage: function(message) {

            if (!assertActive('sendChatMessage')) return;

            var _chatTs = Date.now();
            var _chatCallId = callsState.activeCallId || callsState.serverCallId;

            // Primary: data channel (low-latency real-time)
            IframeTransport.sendAction('SEND_CHAT_MESSAGE', {
                message: message,
                timestamp: _chatTs
            });

            // Persistence: relay via WebSocket so messages survive ICE restart
            try {
                var _sock = (window.KynectaRealtime && window.KynectaRealtime._socket)
                            || window.__appSocket;
                if (_sock && _sock.connected && _chatCallId) {
                    _sock.emit('call:chat_message', {
                        callId:    _chatCallId,
                        message:   message,
                        timestamp: _chatTs,
                        senderId:  callsState.userId || (callsState.session && callsState.session.userId)
                    });
                }
            } catch (_e) {}
        },



        



        saveNotes: function(notes) {



            if (!assertActive('saveNotes')) return;



            



            IframeTransport.sendAction('SAVE_NOTES', {



                notes,



                timestamp: Date.now()



            });



        },



        



        startWhiteboard: function() {

            if (!assertActive('startWhiteboard')) return;

            // Whiteboard: draw-over-canvas, synced via data channel
            // Creates an overlay canvas, sends draw events as data channel messages.
            if (callsState._whiteboardActive) {
                // Toggle off
                callsState._whiteboardActive = false;
                var existing = document.getElementById('kyn-whiteboard-overlay');
                if (existing) existing.remove();
                IframeTransport.sendAction('WHITEBOARD_EVENT', { action: 'stop', timestamp: Date.now() });
                notifyListeners('whiteboard_stopped', {});
                return;
            }

            callsState._whiteboardActive = true;
            IframeTransport.sendAction('WHITEBOARD_EVENT', { action: 'start', timestamp: Date.now() });

            // Build the whiteboard overlay
            var videoContainer = document.getElementById('remoteVideo') ||
                                 document.getElementById('callVideoContainer') ||
                                 document.body;

            var wb = document.createElement('div');
            wb.id = 'kyn-whiteboard-overlay';
            wb.setAttribute('role', 'application');
            wb.setAttribute('aria-label', 'Shared whiteboard');
            wb.style.cssText = [
                'position:absolute', 'top:0', 'left:0', 'width:100%', 'height:100%',
                'z-index:1000', 'pointer-events:auto'
            ].join(';');

            var canvas = document.createElement('canvas');
            canvas.id = 'kyn-whiteboard-canvas';
            canvas.style.cssText = 'width:100%;height:100%;cursor:crosshair;touch-action:none;';
            canvas.setAttribute('aria-label', 'Drawing canvas');

            // Toolbar
            var toolbar = document.createElement('div');
            toolbar.style.cssText = [
                'position:absolute', 'top:8px', 'left:8px', 'z-index:10',
                'display:flex', 'gap:6px', 'background:rgba(0,0,0,0.65)',
                'border-radius:8px', 'padding:6px 10px'
            ].join(';');
            toolbar.innerHTML = [
                '<button id="wb-pen"    aria-label="Pen"   style="background:#6366f1;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">Pen</button>',
                '<button id="wb-eraser" aria-label="Erase" style="background:#374151;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">Eraser</button>',
                '<button id="wb-clear"  aria-label="Clear" style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">Clear</button>',
                '<input  id="wb-color"  type="color" value="#ffffff" title="Color" style="width:28px;height:28px;border:none;cursor:pointer;border-radius:4px;">',
                '<button id="wb-close"  aria-label="Close whiteboard" style="background:#374151;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">✕</button>',
            ].join('');

            wb.appendChild(canvas);
            wb.appendChild(toolbar);

            var target = videoContainer;
            if (target !== document.body) target.style.position = 'relative';
            target.appendChild(wb);

            // Size canvas to container
            var _resizeCanvas = function() {
                var rect = canvas.getBoundingClientRect();
                canvas.width  = rect.width  || 640;
                canvas.height = rect.height || 480;
            };
            _resizeCanvas();
            window.addEventListener('resize', _resizeCanvas);

            var ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 3;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'round';

            var _drawing   = false;
            var _tool      = 'pen';
            var _lastX = 0, _lastY = 0;

            function _getPos(e) {
                var rect = canvas.getBoundingClientRect();
                var src  = e.touches ? e.touches[0] : e;
                return { x: src.clientX - rect.left, y: src.clientY - rect.top };
            }

            function _draw(x0, y0, x1, y1, color, width, tool) {
                ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
                ctx.strokeStyle = color;
                ctx.lineWidth   = tool === 'eraser' ? 24 : width;
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
                ctx.globalCompositeOperation = 'source-over';
            }

            function _sendDrawEvent(x0, y0, x1, y1) {
                var evt = { action: 'draw', x0: x0, y0: y0, x1: x1, y1: y1,
                            color: ctx.strokeStyle, width: ctx.lineWidth, tool: _tool };
                IframeTransport.sendAction('WHITEBOARD_EVENT', evt);
            }

            canvas.addEventListener('pointerdown', function(e) {
                _drawing = true;
                var pos = _getPos(e);
                _lastX = pos.x; _lastY = pos.y;
                canvas.setPointerCapture(e.pointerId);
            });
            canvas.addEventListener('pointermove', function(e) {
                if (!_drawing) return;
                var pos = _getPos(e);
                _draw(_lastX, _lastY, pos.x, pos.y, ctx.strokeStyle, ctx.lineWidth, _tool);
                _sendDrawEvent(_lastX, _lastY, pos.x, pos.y);
                _lastX = pos.x; _lastY = pos.y;
            });
            canvas.addEventListener('pointerup',   function() { _drawing = false; });
            canvas.addEventListener('pointerleave', function() { _drawing = false; });

            // Toolbar handlers
            document.getElementById('wb-pen')    .addEventListener('click', function() { _tool = 'pen'; });
            document.getElementById('wb-eraser') .addEventListener('click', function() { _tool = 'eraser'; });
            document.getElementById('wb-color')  .addEventListener('input', function(e) { ctx.strokeStyle = e.target.value; });
            document.getElementById('wb-clear')  .addEventListener('click', function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                IframeTransport.sendAction('WHITEBOARD_EVENT', { action: 'clear' });
            });
            document.getElementById('wb-close')  .addEventListener('click', function() {
                window.callCore && window.callCore.startWhiteboard(); // toggle off
            });

            // Receive remote draw events
            var _wbListener = function(e) {
                var msg = e.detail || e.data;
                if (!msg || msg.type !== 'WHITEBOARD_EVENT') return;
                var d = msg.data || msg;
                if (d.action === 'draw')  _draw(d.x0, d.y0, d.x1, d.y1, d.color, d.width, d.tool);
                if (d.action === 'clear') ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (d.action === 'stop')  { wb.remove(); window.removeEventListener('kyn:datachannel:message', _wbListener); }
            };
            window.addEventListener('kyn:datachannel:message', _wbListener);

            notifyListeners('whiteboard_started', {});
        },



        



        createPoll: function(question, options) {

            if (!assertActive('createPoll')) return;

            if (!question || !Array.isArray(options) || options.length < 2) {
                logError(MODULE, 'createPoll: question and at least 2 options are required');
                return;
            }

            var pollId = 'poll_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
            var poll = {
                pollId:    pollId,
                question:  String(question).substring(0, 280),
                options:   options.slice(0, 8).map(function(o, idx) {
                    return { id: String(idx), text: String(o).substring(0, 120), votes: [] };
                }),
                createdBy: callsState.userId || callsState.session && callsState.session.userId,
                createdAt: Date.now(),
                active:    true,
            };

            // Store locally
            if (!callsState.polls) callsState.polls = {};
            callsState.polls[pollId] = poll;

            // Broadcast via data channel (real-time) AND socket (persistence)
            IframeTransport.sendAction('POLL_EVENT', { action: 'create', poll: poll });

            try {
                var sock = (window.KynectaRealtime && window.KynectaRealtime._socket) || window.__appSocket;
                var cid  = callsState.activeCallId || callsState.serverCallId;
                if (sock && sock.connected && cid) {
                    sock.emit('call:poll_event', { callId: cid, action: 'create', poll: poll });
                }
            } catch(_e) {}

            notifyListeners('poll_created', { poll: poll });
            return pollId;
        },

        votePoll: function(pollId, optionId) {

            if (!assertActive('votePoll')) return;

            var poll = callsState.polls && callsState.polls[pollId];
            if (!poll || !poll.active) { logWarn(MODULE, 'votePoll: poll not found or inactive'); return; }

            var option = poll.options.find(function(o) { return o.id === String(optionId); });
            if (!option) { logWarn(MODULE, 'votePoll: invalid optionId'); return; }

            var myId = String(callsState.userId || (callsState.session && callsState.session.userId));

            // Remove previous vote from all options (one vote per person)
            poll.options.forEach(function(o) {
                o.votes = o.votes.filter(function(v) { return v !== myId; });
            });

            // Add vote
            option.votes.push(myId);

            var votePayload = { pollId: pollId, optionId: String(optionId), voterId: myId, timestamp: Date.now() };

            // Broadcast vote
            IframeTransport.sendAction('POLL_EVENT', { action: 'vote', vote: votePayload });

            try {
                var sock = (window.KynectaRealtime && window.KynectaRealtime._socket) || window.__appSocket;
                var cid  = callsState.activeCallId || callsState.serverCallId;
                if (sock && sock.connected && cid) {
                    sock.emit('call:poll_event', { callId: cid, action: 'vote', vote: votePayload });
                }
            } catch(_e) {}

            notifyListeners('poll_voted', { poll: poll, votePayload: votePayload });
        },

        closePoll: function(pollId) {

            if (!assertActive('closePoll')) return;

            var poll = callsState.polls && callsState.polls[pollId];
            if (!poll) return;
            poll.active = false;

            IframeTransport.sendAction('POLL_EVENT', { action: 'close', pollId: pollId });

            try {
                var sock = (window.KynectaRealtime && window.KynectaRealtime._socket) || window.__appSocket;
                var cid  = callsState.activeCallId || callsState.serverCallId;
                if (sock && sock.connected && cid) {
                    sock.emit('call:poll_event', { callId: cid, action: 'close', pollId: pollId });
                }
            } catch(_e) {}

            notifyListeners('poll_closed', { pollId: pollId, results: poll });
        },

        getPolls: function() {
            return callsState.polls ? Object.values(callsState.polls) : [];
        },




        



        getDevices: function() {



            return { ...callsState.mediaDevices };



        },



        



        hasAudioInput: function() {



            return callsState.mediaDevices.audioInput.length > 0;



        },



        



        hasVideoInput: function() {



            return callsState.mediaDevices.videoInput.length > 0;



        },



        



        isPremium: function() {



            return callsState.isPremium;



        },



        



        hasPremiumFeature: function(feature) {



            return callsState.isPremium || callsState.premiumFeatures[feature];



        },



        



        createCallLink: function(callType = 'voice') {



            if (!assertActive('createCallLink')) return;



            



            if (!callsState.isPremium && !callsState.premiumFeatures.callLinks) {



                notifyListeners('premium_required', { feature: 'callLinks' });



                return;



            }



            IframeTransport.sendAction('CREATE_CALL_LINK', {



                callType,



                timestamp: Date.now()



            });



        },



        



        addListener: function(listener) {



            if (typeof listener === 'function') listeners.add(listener);



        },



        



        removeListener: function(listener) {



            listeners.delete(listener);



        },



        



        addMediaListener: function(listener) {



            MediaManager.addListener(listener);



        },



        



        removeMediaListener: function(listener) {



            MediaManager.removeListener(listener);



        },



        



        addWebRTCListener: function(listener) {



            WebRTCManager.addListener(listener);



        },



        



        removeWebRTCListener: function(listener) {



            WebRTCManager.removeListener(listener);



        },



        



        setRecoveryMode: function(mode) {



            callsState.recoveryMode = mode;



        },



        



        verifyBeforeCall: function() {



            return CallsStateGovernor.verifySession(true);



        },



        



        getPipelineStatus: function() {



            return SessionPipeline ? SessionPipeline.getStatus() : null;



        },



        



        getDiagnostics: function() {



            return DiagnosticsAgent.getReport();



        },



        



        StateGovernor: StateGovernor,



        V5StateGovernor: V5StateGovernor,



        CallsStateGovernor: CallsStateGovernor,



        



        sendToParent: function(type, payload, options) {



            if (!assertActive('sendToParent')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            return safeSend(type, payload, options?.requireAck || false);



        },



        



        sendAction: function(action, payload) {



            if (!assertActive('sendAction')) {



                return Promise.resolve({ success: false, reason: 'not_active' });



            }



            return IframeTransport.sendAction(action, payload);



        },



        



        initCall: function(callType, participants) {



            return CallsStateGovernor.initiateCall(callType, participants);



        },



        



        cleanup: function() {



            logInfo(MODULE_NAME, 'Cleaning up call core');



            



            resetCallState();



            MediaManager.stopLocalStream();



            WebRTCManager.close();



            IframeTransport.cleanup();



            IframeSessionClient.cleanup();



            RecoveryManager.cancelRecovery();



            UIBridge.cleanup();



            StorageProxy.cleanup();



            MessageGuard.cleanup();



            



            messageQueue.length = 0;



            



            resetCallState();



            



            listeners.clear();



        },



        



        reinitialize: function() {



            this.cleanup();



            initialize();



        },



        



        isReady: function() {



            return this.isCoreReady();



        },



        



        waitForReady: function(timeout = 5000) {



            return new Promise((resolve) => {



                if (this.isReady()) {



                    resolve(true);



                    return;



                }



                



                const start = Date.now();



                const checkInterval = setInterval(() => {



                    if (this.isReady()) {



                        clearInterval(checkInterval);



                        resolve(true);



                    } else if (Date.now() - start > timeout) {



                        clearInterval(checkInterval);



                        resolve(false);



                    }



                }, 100);



            });



        },



        



        getParentReady: function() {



            return parentReady;



        },



        



        getQueuedMessages: function() {



            return [...messageQueue];



        },



        



        flushQueue: function() {



            flushQueue();



        },



        



        MessageRegistry: MessageRegistry,



        IframeTransport: IframeTransport,



        OriginSecurity: OriginSecurity,



        SafeStorage: SafeStorage,



        PermissionManager: PermissionManager,



        WebRTCManager: WebRTCManager,



        MediaManager: MediaManager,



        CallsStateGovernor: CallsStateGovernor,



        SessionClient: IframeSessionClient,



        NavigationGuard: NavigationGuard,



        ReliabilityEngine: ReliabilityEngine,



        RecoveryManager: RecoveryManager,



        CompatibilityBridge: CompatibilityBridge,



        DiagnosticsAgent: DiagnosticsAgent,



        MultiModuleCoordinator: MultiModuleCoordinator,



        UIFailsafe: UIFailsafe,



        LifecycleController: LifecycleController,



        SessionPipeline: SessionPipeline,



        UIBridge: UIBridge,



        StorageProxy: StorageProxy,



        MessageGuard: MessageGuard,



        SessionClientLegacy: SessionClient,



        



        // Additional utility methods



        isInCall: function() {



            return callsState.callActive && callsState.callState === 'connected';



        },



        



        getCallDuration: function() {



            if (!callsState.callStartTime) return 0;



            return Math.floor((Date.now() - callsState.callStartTime) / 1000);



        },



        



        getActiveCallId: function() {



            return callsState.activeCallId;



        },



        



        getCallParticipants: function() {



            return [...callsState.callParticipants];



        },



        



        // API request helper



        apiRequest: function(endpoint, method = 'GET', data = null, options = {}) {



            return sendApiRequest(endpoint, method, data, options);



        },



        



        // Endpoint normalization helper



        normalizeEndpoint: function(endpoint) {



            return normalizeEndpoint(endpoint);



        }



    };



    



    // ==================== MODULE CORE CONTROLLER ====================



    const ModuleCoreController = {



        _startTime: Date.now(),



        _initializationPromise: null,



        _initialized: false,



        _listeners: new Set(),



        



        start: function() {



            if (this._initializationPromise) return this._initializationPromise;



            



            this._initializationPromise = this._executeInitializationSequence();



            return this._initializationPromise;



        },



        



        _executeInitializationSequence: async function() {



            try {



                logInfo(MODULE, 'ModuleCoreController starting initialization sequence');



                



                OriginSecurity.initialize();



                this._notifyListeners('security_initialized', {});



                



                IframeTransport.initialize();



                this._notifyListeners('connection_initialized', {});



                



                MessageRegistry.initialize();



                this._notifyListeners('dispatcher_initialized', {});



                



                ReliabilityEngine.initialize();



                this._notifyListeners('reliability_initialized', {});



                



                IframeSessionClient.initialize();



                this._notifyListeners('session_initialized', {});



                



                UIBridge.initialize();



                this._notifyListeners('ui_initialized', {});



                



                LifecycleController.initialize();



                this._notifyListeners('lifecycle_initialized', {});



                



                this._initialized = true;



                logSuccess(MODULE, 'ModuleCoreController initialization complete');



                



                return { success: true };



                



            } catch (error) {



                logError(MODULE, 'ModuleCoreController initialization failed', error);



                throw error;



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



                startTime: this._startTime,



                uptime: Date.now() - this._startTime,



                initialized: this._initialized



            };



        }



    };



    



    ModuleCoreController.start();

    // ── Expose WebRTC signal entry points that calls.html calls directly ──
    // These MUST exist on window.callCore or video signals are silently dropped
    window.callCore.handleRemoteOffer  = function(payload) { handleSignalOffer(payload);  };
    window.callCore.handleRemoteAnswer = function(payload) { handleSignalAnswer(payload); };
    window.callCore.handleIceCandidate = window.callCore.handleIceCandidate ||
                                         function(payload) { handleIceCandidate(payload); };



    



    // ==================== INITIALIZATION ====================



    function initialize() {



        logInfo(MODULE, 'Initializing call core module');



        



        MediaManager.initialize().catch(error => {



            logError(MODULE, 'Media manager initialization failed', error);



        });



        



        logSuccess(MODULE, 'Call core module initialized');



    }



    



    if (document.readyState === 'loading') {



        document.addEventListener('DOMContentLoaded', () => initializeModule());



    } else {



        initializeModule();



    }







    // ✅ FIX: Bridge DOM CustomEvents dispatched by app.realtime.socket.js.



    //



    // calls-core.js ONLY listens to window.postMessage (source === 'parent').



    // But app.realtime.socket.js dispatches call events as CustomEvents:



    //   window.dispatchEvent(new CustomEvent('kyn:call:incoming', { detail: payload }))



    //   document.dispatchEvent(new CustomEvent('call:incoming', { detail: payload }))



    //



    // Without this bridge those events are silently dropped and calls never ring.



    // Each handler normalises the payload and calls the existing internal function.



    (function _installCallEventBridge() {



        // Map: kyn: event name → internal handler function



        const CALL_EVENT_MAP = [



            // incoming / initiated



            { event: 'kyn:call:incoming',   fn: (d) => handleIncomingCall(d) },



            { event: 'kyn:incoming_call',    fn: (d) => handleIncomingCall(d) },



            { event: 'kyn:call_incoming',    fn: (d) => handleIncomingCall(d) },



            { event: 'kyn:call:initiated',   fn: (d) => handleCallInitiated(d) },



            { event: 'kyn:call_initiated',   fn: (d) => handleCallInitiated(d) },



            // accepted / started / connected



            { event: 'kyn:call:accepted',    fn: (d) => handleCallAccepted(d) },



            { event: 'kyn:call_accepted',    fn: (d) => handleCallAccepted(d) },



            { event: 'kyn:call_answered',    fn: (d) => handleCallAccepted(d) },



            { event: 'kyn:call:started',     fn: (d) => handleCallStarted(d) },



            { event: 'kyn:call:connected',   fn: (d) => handleCallConnected(d) },



            // rejected / cancelled / ended



            { event: 'kyn:call:rejected',    fn: (d) => handleCallRejected(d) },



            { event: 'kyn:call_rejected',    fn: (d) => handleCallRejected(d) },

            // C-09 FIX: server-side dedup window blocked the call:initiate;
            // treat it identically to a rejection so the outgoing-call UI
            // resets to idle and the user sees a toast rather than staying
            // stuck on the calling screen forever.
            { event: 'kyn:call:dedup_rejected', fn: (d) => {
                logWarn(MODULE, 'call:initiate rate-limited by server', d);
                handleCallRejected({ ...d, reason: 'rate_limited' });
                notifyListeners('call_dedup_rejected', d);
            }},

            // FEAT-01 FIX: call:busy was dispatched by server but had no
            // registered CustomEvent listener, so handleCallBusy was only
            // reachable via postMessage (not the WebSocket path). Register it
            // here so the outgoing call UI resets immediately on busy signal.
            { event: 'kyn:call:busy',      fn: (d) => handleCallBusy(d) },
            { event: 'kyn:call_busy',      fn: (d) => handleCallBusy(d) },
            // FEAT-01: call:waiting lets the callee UI show "Tap to switch" banner
            { event: 'kyn:call:waiting',   fn: (d) => { notifyListeners('call_waiting', d); } },
            { event: 'kyn:call_waiting',   fn: (d) => { notifyListeners('call_waiting', d); } },

            // FEAT-02 FIX: this device is a second logged-in device. The user
            // accepted the call on their other device. Dismiss the incoming
            // call ring UI here without doing anything else (the other device
            // owns the actual WebRTC session).
            { event: 'kyn:call:accepted_elsewhere', fn: (d) => {
                logInfo && logInfo(MODULE, 'Call accepted on another device — dismissing ring', d);
                const _callId = d && d.callId;
                // Use handleCallRejected to reset the incoming call UI cleanly
                // (it clears the ringing overlay, stops ringtone, resets state)
                // but we pass reason='accepted_elsewhere' so the UX copy differs.
                handleCallRejected({ ...d, reason: 'accepted_elsewhere' });
                notifyListeners('call_accepted_elsewhere', d);
            }},



            { event: 'kyn:call:cancelled',   fn: (d) => handleCallEnded(d) },



            { event: 'kyn:call_cancelled',   fn: (d) => handleCallEnded(d) },



            { event: 'kyn:call:ended',       fn: (d) => handleCallEnded(d) },



            { event: 'kyn:call_ended',       fn: (d) => handleCallEnded(d) },



            { event: 'kyn:call_force_ended', fn: (d) => handleCallEnded(d) },



            // failed



            { event: 'kyn:call:failed',      fn: (d) => handleCallFailed(d) },



        ];







        CALL_EVENT_MAP.forEach(({ event, fn }) => {



            window.addEventListener(event, function (evt) {



                if (!evt.detail) return;



                console.log(`[${MODULE_NAME}] 📞 DOM bridge event [${event}]`, evt.detail);



                try { fn(evt.detail); } catch (e) {



                    console.warn(`[${MODULE_NAME}] Call event bridge error (${event}):`, e.message);



                }



            });



        });







        // Also listen on KynectaRealtime singleton directly (in case the kyn: events



        // were already emitted before this script loaded)



        function _bindRealtime() {



            const rt = window.KynectaRealtime;



            if (!rt || !rt.on || rt.__callsCoreBound) return;



            rt.__callsCoreBound = true;

            // FIX-RECONNECT-REBIND: Reset bound flag on disconnect so listeners re-register
            // after the next reconnect. Without this, call events are silently dropped
            // after the first disconnect because listeners were cleared but the flag stays true.
            if (!rt.__callsCoreBoundDisconnectWired) {
                rt.__callsCoreBoundDisconnectWired = true;
                rt.on('disconnect', function() { rt.__callsCoreBound = false; });
                rt.on('connect', function() { rt.__callsCoreBound = false; setTimeout(_bindRealtime, 150); });
            }







            const RT_MAP = [



                ['call:incoming',  (p) => handleIncomingCall(p)],



                ['incoming_call',  (p) => handleIncomingCall(p)],



                ['call:initiated', (p) => handleCallInitiated(p)],



                ['call:accepted',  (p) => handleCallAccepted(p)],



                ['call_accepted',  (p) => handleCallAccepted(p)],



                ['call_answered',  (p) => handleCallAccepted(p)],



                ['call:started',   (p) => handleCallStarted(p)],



                ['call:connected', (p) => handleCallConnected(p)],



                ['call:rejected',  (p) => handleCallRejected(p)],



                ['call_rejected',  (p) => handleCallRejected(p)],



                ['call:ended',     (p) => handleCallEnded(p)],



                ['call_ended',     (p) => handleCallEnded(p)],



                ['call_force_ended',(p) => handleCallEnded(p)],



                ['call_cancelled', (p) => handleCallEnded(p)],



                ['call:failed',    (p) => handleCallFailed(p)],

                // FIX-CALL-ACK: New signaling events from patched backend
                ['call:no_answer',      (p) => {
                    console.warn('[CallsCore] 📵 call:no_answer — user did not answer', p);
                    if (typeof handleCallFailed === 'function') handleCallFailed({ ...p, reason: 'no_answer' });
                    else if (typeof resetCallState === 'function') resetCallState();
                }],
                ['call:receiver_offline', (p) => {
                    console.warn('[CallsCore] 📵 call:receiver_offline', p);
                    if (typeof handleCallFailed === 'function') handleCallFailed({ ...p, reason: 'receiver_offline' });
                    else if (typeof resetCallState === 'function') resetCallState();
                }],
                ['call:receiver_ack', (p) => {
                    // Receiver confirmed ring is showing — stop "failed to reach" guard
                    console.log('[CallsCore] ✅ call:receiver_ack — receiver is ringing', p);
                    if (typeof setCallingStatus === 'function') setCallingStatus('ringing');
                }],
                ['call:webrtc_offer', (p) => {
                    // Direct Socket.IO WebRTC offer (bypassed postMessage)
                    console.log('[CallsCore] 📡 call:webrtc_offer received via Socket.IO');
                    if (typeof handleRemoteOffer === 'function') handleRemoteOffer(p.offer || p, p.callerId);
                    else if (typeof handleSignalOffer === 'function') handleSignalOffer(p);
                }],
                ['user_online_status', (p) => {
                    // Response to check_user_online — used by UI before sending a message
                    EventBus && EventBus.emit && EventBus.emit('user:online_status', p);
                }],

            ];



            RT_MAP.forEach(([evtName, handler]) => {



                rt.on(evtName, (payload) => {



                    console.log(`[${MODULE_NAME}] 📞 KynectaRealtime event [${evtName}]`, payload);



                    try { handler(payload); } catch (e) {



                        console.warn(`[${MODULE_NAME}] KynectaRealtime call handler error (${evtName}):`, e.message);



                    }



                });



            });



            console.log(`[${MODULE_NAME}] ✅ Bound to KynectaRealtime call events`);



        }



        _bindRealtime();



        window.addEventListener('kyn:realtimeReady', _bindRealtime, { once: false });

        // FIX: Listen for TURN credentials pushed by server after call initiate/accept
        // Without this, the hardcoded free TURN servers are always used and may fail
        window.addEventListener('kyn:turn:config', function(e) {
            const servers = e.detail?.servers || e.detail?.iceServers;
            if (Array.isArray(servers) && servers.length) {
                window.__kynTURNServers = servers;
                console.log('[CallsCore] ✅ TURN config received from server — ICE servers updated:', servers.length);
            }
        });
        // Also handle via postMessage bridge from parent frame
        window.addEventListener('message', function(e) {
            if (e.data && (e.data.event === 'turn:config' || e.data.type === 'TURN_CONFIG')) {
                const servers = e.data.payload?.servers || e.data.servers;
                if (Array.isArray(servers) && servers.length) {
                    window.__kynTURNServers = servers;
                    console.log('[CallsCore] ✅ TURN config received via postMessage bridge');
                }
            }
        });

        // FIX: Proactively prefetch ICE/TURN config from /api/calls/ice-config when session is ready.
        // Previously window.__kynTURNServers was only set if the server emitted turn:config via socket
        // after a call started — meaning the first call always used free fallback TURN servers.
        // Now we prefetch on session ready so fresh TURN credentials are available before any call.
        function _prefetchIceConfig(token) {
            if (!token) return;
            if (window.__kynTURNServers && window.__kynTURNServers.length) return;
            try {
                var baseUrl = (
                    window.__API_BASE_URL ||
                    window.__kynApiBase ||
                    window.__apiBaseUrl ||
                    (window.parent && window.parent.__apiBaseUrl) ||
                    (window.parent && window.parent.__getApiBase && window.parent.__getApiBase()) ||
                    'https://moodchat-fy56.onrender.com'
                ).replace(/\/+$/, '');
                fetch(baseUrl + '/api/calls/ice-config', {
                    method: 'GET',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
                }).then(function(r) { return r.ok ? r.json() : null; })
                  .then(function(data) {
                      if (data && Array.isArray(data.iceServers) && data.iceServers.length) {
                          var turnOnly = data.iceServers.filter(function(s) {
                              return s.urls && (String(s.urls).indexOf('turn:') === 0 || String(s.urls).indexOf('turns:') === 0);
                          });
                          if (turnOnly.length) {
                              window.__kynTURNServers = turnOnly;
                              console.log('[CallsCore] ✅ ICE config prefetched —', turnOnly.length, 'TURN server(s) cached');
                              window.dispatchEvent(new CustomEvent('kyn:turn:config', { detail: { iceServers: turnOnly } }));
                          }
                      }
                  }).catch(function() {});
            } catch(_) {}
        }
        window.addEventListener('sessionUpdated', function(e) {
            var token = (e.detail && e.detail.token) || (callsState && callsState.session && callsState.session.token) || null;
            _prefetchIceConfig(token);
        });
        var _existingToken = (callsState && callsState.session && callsState.session.token) || (window.__CHILD_SESSION__ && window.__CHILD_SESSION__.token);
        if (_existingToken) setTimeout(function() { _prefetchIceConfig(_existingToken); }, 2000);







        console.log(`[${MODULE_NAME}] ✅ Call event DOM bridge installed`);



    })();



    



    window.addEventListener('beforeunload', () => {
        // FIX: Skip cleanup if this is a PWA service-worker-triggered reload.
        // When the user taps "Refresh" in the update banner, pwa-manager sets
        // pwa_update_acknowledged in sessionStorage before reloading. We must
        // not send CALL_ENDED in that case — the call is still alive.
        var _isPwaReload = false;
        try { _isPwaReload = !!sessionStorage.getItem('pwa_update_acknowledged'); } catch(_) {}
        if (_isPwaReload) {
            console.log('[calls-core] beforeunload: skipping cleanup — PWA update reload');
            return;
        }
        if (window.callCore && window.callCore.cleanup) {
            var _cs = window.callsState;
            var _callInProgress = _cs && (_cs.callActive || _cs.callState === 'in-call' || _cs.callState === 'connected' || _cs.callState === 'initiating');
            if (!_callInProgress) {
                window.callCore.cleanup();
            } else {
                console.log('[calls-core] beforeunload: skipping cleanup — call in progress');
            }
        }
    });



    



    if (typeof module !== 'undefined' && module.exports) {



        module.exports = window.callCore;



    }



    



    logSuccess(MODULE, 'Call core module loaded');



    



})();











// ── TOP-LEVEL: accessible from all closures ──────────────────────────────────



function applySettingToCallsModule(section, key, value) {



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



    if (section === 'notifications') {



        if (key === 'soundEnabled' || key === 'notificationSound') window.__notificationSoundEnabled = value;



        if (key === 'vibrationEnabled' || key === 'notificationVibration') window.__vibrationEnabled = value;



        if (key === 'callNotifications' || key === 'enableNotifications') window.__callNotificationsEnabled = value;



        if (key === 'messageNotifications') window.__messageNotificationsEnabled = value;



        if (key === 'groupNotifications') window.__groupNotificationsEnabled = value;



        if (key === 'mentionNotifications') window.__mentionNotificationsEnabled = value;



        if (key === 'desktopEnabled') window.__desktopNotificationsEnabled = value;



    }



    if (section === 'privacy') {



        if (key === 'onlineStatus') window.__showOnlineStatus = value;



        if (key === 'lastSeen') window.__showLastSeen = value;



        if (key === 'readReceipts') { window.__readReceiptsEnabled = value; document.documentElement.setAttribute('data-read-receipts', value ? 'true' : 'false'); }



        if (key === 'typingIndicators') { window.__typingIndicatorsEnabled = value; document.documentElement.setAttribute('data-typing-indicators', value ? 'true' : 'false'); }



        if (key === 'whoCanAddMe') window.__whoCanAddMe = value;



        if (key === 'canMessageMe') window.__canMessageMe = value;



        if (key === 'contactDiscovery') window.__contactDiscovery = value;



    }



    if (section === 'calls') {



        if (key === 'ringtone' || key === 'callRingtone') window.__callRingtone = value;



        if (key === 'videoEnabled' || key === 'cameraOnStart') window.__videoEnabled = value;



        if (key === 'audioEnabled') window.__audioEnabled = value;



        if (key === 'allowIncomingCalls' || key === 'whoCanCallMe') window.__allowIncomingCalls = value;



        if (key === 'vibrateOnCall' || key === 'callVibration') window.__callVibration = value;



        if (key === 'videoQuality') window.__videoQuality = value;



        if (key === 'voiceQuality') window.__voiceQuality = value;



        if (key === 'allowScreenShare') window.__allowScreenShare = value;



        // Sync the in-page settings panel toggle checkboxes



        const callsToggleMap = {



            emotionalContext: 'emotionalContextToggle',



            emotionalContextEnabled: 'emotionalContextToggle',



            callIntention: 'callIntentionToggle',



            callIntentionEnabled: 'callIntentionToggle',



            inCallChat: 'inCallChatToggle',



            inCallChatEnabled: 'inCallChatToggle',



            whiteboard: 'whiteboardToggle',



            whiteboardEnabled: 'whiteboardToggle',



            polls: 'pollsToggle',



            pollsEnabled: 'pollsToggle',



            sharedNotes: 'notesToggle',



            notesEnabled: 'notesToggle',



            focusMode: 'focusModeToggle',



            focusModeEnabled: 'focusModeToggle',



            liveReactions: 'liveReactionsToggle',



            liveReactionsEnabled: 'liveReactionsToggle'



        };



        var toggleId = callsToggleMap[key];



        if (toggleId) {



            var toggleEl = document.getElementById(toggleId);



            if (toggleEl) toggleEl.checked = !!value;



        }



    }



    if (section === 'chat') {



        if (key === 'enterToSend' || key === 'enterKeySends') window.__enterToSend = value;



        if (key === 'showTimestamps') { window.__showTimestamps = value; document.documentElement.setAttribute('data-show-timestamps', value ? 'true' : 'false'); }



        if (key === 'mediaAutoDownload') window.__mediaAutoDownload = value;



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



    if (section === 'friends') {



        if (key === 'showOnlineStatus') window.__showOnlineStatus = value;



    }



}



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



                try { applySettingToCallsModule(section, keyEntry[0], keyEntry[1]); } catch(e) {}



            });



        });



        console.log('[calls-core] ✅ Settings bootstrapped from cache');



    } catch(e) {}



    window.addEventListener('online', function() {



        try {



            window.parent && window.parent.postMessage({ type: 'CHILD_READY', module: 'calls', source: 'calls', timestamp: Date.now() }, '*');



        } catch(e) {}



    });



})();



// =============================================



// JOIN-VIA-LINK HANDLER



// When user opens a call link (?call=xxx&type=video), auto-initiate the call



// =============================================



(function handleJoinViaLink() {



    try {



        const params = new URLSearchParams(window.location.search);



        const callParam = params.get('call');



        const typeParam = params.get('type') || 'audio';



        const tokenParam = params.get('token');



        const callIdParam = params.get('callId');







        if (!callParam && !callIdParam) return; // Not a join-via-link page load







        // Wait for module to be fully initialized before acting



        function attemptJoin(attempts) {



            if (attempts <= 0) {



                console.warn('[calls-core] Join-via-link: module not ready after waiting');



                return;



            }



            const core = window.callCore;



            if (!core || !core.isReady || !core.isReady()) {



                setTimeout(() => attemptJoin(attempts - 1), 500);



                return;



            }







            if (callIdParam) {



                // Joining an existing in-progress call by callId



                console.log('[calls-core] Join-via-link: joining existing call', callIdParam);



                // Notify parent to handle the join API call



                try {



                    window.parent.postMessage({



                        type: 'JOIN_CALL_VIA_LINK',



                        payload: {



                            callId: callIdParam,



                            token: tokenParam,



                            callType: typeParam,



                            timestamp: Date.now()



                        }



                    }, '*');



                } catch(e) {}



            } else if (callParam) {



                // callParam is a generated random ID — we need to start a new call



                // This path handles when recipient opens a link that just has a random ID



                // The link holder will already be waiting in the call



                console.log('[calls-core] Join-via-link: starting call from link', callParam, typeParam);



                // Notify parent / chat.html to orchestrate the call start



                try {



                    window.parent.postMessage({



                        type: 'JOIN_CALL_VIA_LINK',



                        payload: {



                            linkCallId: callParam,



                            callType: typeParam,



                            token: tokenParam,



                            timestamp: Date.now()



                        }



                    }, '*');



                } catch(e) {}



            }



        }







        // Start trying after 1s to allow module init



        setTimeout(() => attemptJoin(10), 1000);



    } catch(e) {



        console.warn('[calls-core] Join-via-link error:', e.message);



    }



})()
