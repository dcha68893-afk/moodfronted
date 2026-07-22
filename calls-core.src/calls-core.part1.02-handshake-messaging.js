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



    



