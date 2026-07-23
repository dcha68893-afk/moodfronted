/**
 * calls-core.part2.js — PART 2/8 — HANDSHAKE & MESSAGING PLUMBING
 * Message dedup, lifecycle state defs, strict state management, CHILD_READY/PARENT_READY handshake, module activation, safe UI init, async data loading, message queue, ID generation, endpoint normalization, standardized message sender, safe API request, queue flush, module registration, session request.
 *
 * This file is SELF-CONTAINED: it runs in its own IIFE and shares state with
 * the other 7 calls-core.partN.js files through window.__CallsCoreShared, not
 * through a JS closure. Load all 8 files, in numeric order, as plain classic
 * <script> tags (no type="module", no defer/async) — see calls.html.
 */
(function () {

    'use strict';

    var __CC = window.__CallsCoreShared = window.__CallsCoreShared || {};
    if (__CC.__aborted) { return; }

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



    window.__CallsCoreShared.MessageGuard = {



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



    



    window.__CallsCoreShared.MessageGuard.initialize();



    



    // ==================== LIFECYCLE STATE DEFINITIONS ====================



    // CRITICAL: VALID FLOW ONLY: BOOT → INITIALIZING → READY → WAIT_PARENT → ACTIVE



    window.__CallsCoreShared.LifecycleState = {



        BOOT: 'BOOT',



        INITIALIZING: 'INITIALIZING',



        READY: 'READY',



        WAIT_PARENT: 'WAIT_PARENT',



        ACTIVE: 'ACTIVE',



        ERROR: 'ERROR'



    };



    



    // ==================== STRICT STATE MANAGEMENT ====================



    const VALID_TRANSITIONS = {



        [window.__CallsCoreShared.LifecycleState.BOOT]: [window.__CallsCoreShared.LifecycleState.INITIALIZING],



        [window.__CallsCoreShared.LifecycleState.INITIALIZING]: [window.__CallsCoreShared.LifecycleState.READY, window.__CallsCoreShared.LifecycleState.ERROR],



        [window.__CallsCoreShared.LifecycleState.READY]: [window.__CallsCoreShared.LifecycleState.WAIT_PARENT],



        [window.__CallsCoreShared.LifecycleState.WAIT_PARENT]: [window.__CallsCoreShared.LifecycleState.ACTIVE, window.__CallsCoreShared.LifecycleState.ERROR],



        [window.__CallsCoreShared.LifecycleState.ACTIVE]: [window.__CallsCoreShared.LifecycleState.ERROR],



        [window.__CallsCoreShared.LifecycleState.ERROR]: []



    };



    



    // Internal state - MUST be defined before any function that uses it



    window.__CallsCoreShared.currentState = window.__CallsCoreShared.LifecycleState.BOOT;



    window.__CallsCoreShared.childReadySent = false;



    window.__CallsCoreShared.parentReadyReceived = false;



    let parentReadyPromiseResolve = null;



    let parentReadyPromise = new Promise(resolve => { parentReadyPromiseResolve = resolve; });



    



    // Backward compatibility variables



    let childReadySentCompat = false;



    let parentReadyReceivedCompat = false;



    



    // Additional state variables



    window.__CallsCoreShared.parentReady = false;



    window.__CallsCoreShared.initializationLock = false;



    let moduleInitialized = false;



    window.__CallsCoreShared.validSessionConfirmed = false;  // Track if valid session has been received



    



window.__CallsCoreShared.lastVerificationTime = 0;



window.__CallsCoreShared.VERIFICATION_COOLDOWN = 5000;







    // ==================== STRICT STATE MANAGEMENT ====================



    window.__CallsCoreShared.transitionTo = function transitionTo(nextState, reason = '') {



        // CRITICAL: Prevent duplicate transitions to same state



        if (window.__CallsCoreShared.currentState === nextState) {



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Already in state ${nextState}, ignoring transition`);



            return true;



        }



        



        // Check if transition is valid



        if (!VALID_TRANSITIONS[window.__CallsCoreShared.currentState] || !VALID_TRANSITIONS[window.__CallsCoreShared.currentState].includes(nextState)) {



            console.error(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE][CRITICAL] Invalid state transition: ${window.__CallsCoreShared.currentState} → ${nextState} (blocked)`, reason);



            return false;



        }



        



        const previousState = window.__CallsCoreShared.currentState;



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] 📊 ${previousState} → ${nextState}${reason ? ` (${reason})` : ''}`);



        window.__CallsCoreShared.currentState;



        



        // Emit state change event



        window.dispatchEvent(new CustomEvent('module_state_change', {



            detail: { 



                module: window.__CallsCoreShared.MODULE_NAME, 



                from: previousState, 



                to: nextState, 



                timestamp: Date.now(),



                reason 



            }



        }));



        



        return true;



    };



    



    // ==================== STATE ASSERTION HELPER ====================



    window.__CallsCoreShared.assertActive = function assertActive(actionName) {



        if (window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.ACTIVE) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Blocked action "${actionName}" — not ACTIVE (current: ${window.__CallsCoreShared.currentState})`);



            return false;



        }



        return true;



    };



    



    function assertState(expectedState, actionName) {



        if (window.__CallsCoreShared.currentState !== expectedState) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Action "${actionName}" requires state ${expectedState} (current: ${window.__CallsCoreShared.currentState})`);



            return false;



        }



        return true;



    }



    



    // ==================== EXACTLY-ONCE CHILD_READY ====================



    window.__CallsCoreShared.sendChildReady = function sendChildReady() {



        // CRITICAL: Only send CHILD_READY in READY state, exactly once



        if (window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.READY) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Cannot send CHILD_READY — invalid state: ${window.__CallsCoreShared.currentState} (requires READY)`);



            return false;



        }



        



        if (window.__CallsCoreShared.childReadySent) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] CHILD_READY already sent — skipping`);



            return false;



        }



        



        window.__CallsCoreShared.childReadySent;



        childReadySentCompat = true;



        if (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState) {



            window.__CallsCoreShared.callsState.childReadySent = true;



        }



        



        try {



            // EXACT format per contract



            window.parent.postMessage({



                type: 'CHILD_READY',



                module: window.__CallsCoreShared.MODULE_NAME,



                version: window.__CallsCoreShared.CONFIG.VERSION,



                timestamp: Date.now(),



                messageId: `child_ready_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`



            }, '*');



            



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] ✅ CHILD_READY sent exactly once`);



            



            // Transition to WAIT_PARENT



            window.__CallsCoreShared.transitionTo(window.__CallsCoreShared.LifecycleState.WAIT_PARENT, 'child_ready_sent');

            // FIX-WAIT_PARENT: 5-second safety timeout — force ACTIVE if PARENT_READY never arrives
            if (!window.__waitParentTimeout) {
                window.__waitParentTimeout = setTimeout(function() {
                    window.__waitParentTimeout = null;
                    if (typeof window.__CallsCoreShared.currentState !== 'undefined' && window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.WAIT_PARENT) {
                        console.warn('[' + window.__CallsCoreShared.MODULE_NAME + '] WAIT_PARENT timeout — forcing ACTIVE to unblock queue');
                        try { window.__CallsCoreShared.transitionTo(window.__CallsCoreShared.LifecycleState.ACTIVE, 'wait_parent_timeout_forced'); } catch(_) {
                            window.__CallsCoreShared.currentStatered.LifecycleState.ACTIVE;
                        }
                        if (typeof window.__CallsCoreShared.flushQueue === 'function') window.__CallsCoreShared.flushQueue();
                    }
                }, 5000);
            }

            return true;

        } catch (error) {



            console.error(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Failed to send CHILD_READY`, error);



            window.__CallsCoreShared.childReadySent;



            childReadySentCompat = false;



            if (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState) {



                window.__CallsCoreShared.callsState.childReadySent = false;



            }



            return false;



        }



    };



    



    // ==================== PARENT_READY HANDLER (STRICT WITH SESSION VALIDATION) ====================



  window.__CallsCoreShared.handleParentReady = function handleParentReady(message) {



    // CRITICAL: Only accept PARENT_READY in WAIT_PARENT state



    if (window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.WAIT_PARENT) {



        // Silent — duplicates are expected on navigation, no need to spam console



        return;



    }



    



    if (window.__CallsCoreShared.parentReadyReceived) {



        // Silent — already handled



        return;



    }



    



    window.__CallsCoreShared.parentReadyReceived;



    parentReadyReceivedCompat = true;



    window.__CallsCoreShared.parentReady;



    if (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState) {



        window.__CallsCoreShared.callsState.parentReady = true;



    }



    



    // Extract session data from message - handle different message structures



    let sessionData = message.payload?.session || message.session || message.payload || {};



    



    // Log what we received for debugging



    console.log(`[${window.__CallsCoreShared.MODULE_NAME}][handleParentReady] Session data received:`, {



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



        



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}][handleParentReady] Formatted session:`, {



            hasToken: !!formattedSession.token,



            userId: formattedSession.userId,



            authenticated: formattedSession.authenticated,



            sessionId: formattedSession.sessionId



        });



        



        // Apply the formatted session



        const applyResult = applySession(formattedSession);



        



        // CRITICAL: WAIT_PARENT → ACTIVE ONLY IF session is valid



        if (applyResult && window.__CallsCoreShared.validSessionConfirmed && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



            // Transition to ACTIVE only with valid session



            window.__CallsCoreShared.transitionTo(window.__CallsCoreShared.LifecycleState.ACTIVE, 'parent_ready_received_with_valid_session');



            



            if (parentReadyPromiseResolve) {



                parentReadyPromiseResolve();



            }



            



            // Flush any queued messages



            window.__CallsCoreShared.flushQueue();



            



            // Activate module



            window.__CallsCoreShared.onModuleActive();



            



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] ✅ PARENT_READY processed, module ACTIVE with valid session`);



        } else {



            // Stay in WAIT_PARENT - session not valid yet



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] ⏳ WAIT_PARENT: Session not valid yet, awaiting valid session`);



            // Request session if needed



            if (!window.__CallsCoreShared.callsState.session || !window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                window.__CallsCoreShared.SessionClient.requestSession();



            }



        }



    } else {



        // No session data, request it



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] ⏳ WAIT_PARENT: No session data, requesting session`);



        window.__CallsCoreShared.SessionClient.requestSession();



    }



};



    



function applySession(sessionData) {



    if (!sessionData) return false;



    



    // The sessionData should already be formatted when coming from handleParentReady



    // But handle the case where it's not



    let token = sessionData.token || sessionData.jwt || sessionData.accessToken;



    



    if (token && typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState) {



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



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}][applySession] Processing session:`, {



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



        if (!window.__CallsCoreShared.__isValidSession(candidateSession)) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Rejected invalid session in applySession`, {



                hasToken: !!candidateSession.token,



                userId: candidateSession.userId,



                authenticated: candidateSession.authenticated,



                rawUserId: userId



            });



            return false;



        }



        



        // IMMUTABLE SESSION PROTECTION: Prevent overwriting valid session



        if (window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



            if (!window.__CallsCoreShared.__isValidSession(candidateSession)) {



                console.warn(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Prevented session downgrade in applySession`);



                return false;



            }



        }



        



        // Session deduplication



        if (window.__CallsCoreShared.callsState.lastSessionId === candidateSession.sessionId) {



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}][applySession] Duplicate session ignored`);



            return false;



        }



        



        window.__CallsCoreShared.callsState.lastSessionId = candidateSession.sessionId;



        window.__CallsCoreShared.callsState.session = candidateSession;



        window.__CallsCoreShared.callsState.token = token;



        window.__CallsCoreShared.callsState.sessionStatus = 'valid';



        window.__CallsCoreShared.callsState.sessionReceived = true;



        window.__CallsCoreShared.validSessionConfirmed;



        



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Valid session applied:`, {



            authenticated: candidateSession.authenticated,



            userId: candidateSession.userId,



            sessionId: candidateSession.sessionId



        });



        



        // If we're in WAIT_PARENT and now have valid session, try to activate



        if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.WAIT_PARENT && window.__CallsCoreShared.parentReady && !window.__CallsCoreShared.parentReadyReceived) {



            // This handles session arriving before PARENT_READY



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Valid session received while in WAIT_PARENT, ready for activation when PARENT_READY arrives`);



        } else if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.WAIT_PARENT && window.__CallsCoreShared.parentReadyReceived) {



            // Session arrived after PARENT_READY but while still in WAIT_PARENT



            window.__CallsCoreShared.transitionTo(window.__CallsCoreShared.LifecycleState.ACTIVE, 'valid_session_received_after_parent_ready');



            



            if (parentReadyPromiseResolve) {



                parentReadyPromiseResolve();



            }



            



            window.__CallsCoreShared.flushQueue();



            window.__CallsCoreShared.onModuleActive();



            



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] ✅ Module activated after valid session received`);



        }



        



        return true;



    }



    



    return false;



}



    



    // ==================== MODULE ACTIVATION HOOK ====================



    window.__CallsCoreShared.onModuleActive = function onModuleActive() {



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] Module ACTIVE — safe zone entered`);



        



        // Request session from parent if needed (safety check)



        if (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState && (!window.__CallsCoreShared.callsState.session || !window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session))) {



            window.__CallsCoreShared.SessionClient.requestSession();



        }



        



        // Register module with parent



        setTimeout(() => {



            if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.ACTIVE) {



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
                window.__CallsCoreShared.handleIncomingCall(pending);
            }
        }, 200);



        



        window.dispatchEvent(new CustomEvent('MODULE_READY', {



            detail: { module: window.__CallsCoreShared.MODULE_NAME, timestamp: Date.now() }



        }));



    };



    



    // ==================== SAFE UI INITIALIZATION ====================



    function initUISafely() {



        try {



            // Initialize media manager safely



            if (typeof window.__CallsCoreShared.MediaManager !== 'undefined' && window.__CallsCoreShared.MediaManager) {



                window.__CallsCoreShared.MediaManager.initialize().catch(error => {



                    window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Media manager initialization failed', error);



                });



            }



            



            // Initialize UI bridge



            if (typeof window.__CallsCoreShared.UIBridge !== 'undefined' && window.__CallsCoreShared.UIBridge) {



                window.__CallsCoreShared.UIBridge.initialize();



            }



            



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}][LIFECYCLE] UI initialized safely`);



        } catch (error) {



            window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'UI initialization failed', error);



        }



    }



    



    // ==================== ASYNC DATA LOADING ====================



    function loadDataAsync() {



        setTimeout(() => {



            if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.ACTIVE) {



                // Load any async data needed (non-call related only)



            }



        }, 500);



    }



    



    // ==================== MESSAGE QUEUE SYSTEM ====================



    window.__CallsCoreShared.messageQueue = [];



    



    // ==================== ID GENERATION ====================



    function generateId() {



        return 'msg_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();



    }



    



    function generateRequestId() {



        return 'req_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();



    }



    



    // ==================== ENDPOINT NORMALIZATION ====================



    window.__CallsCoreShared.normalizeEndpoint = function normalizeEndpoint(endpoint) {



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



    };



    



    // ==================== STANDARDIZED MESSAGE SENDER ====================



    function sendMessage(type, payload = {}, requireAck = false) {



        // CRITICAL: Only allow messages in ACTIVE state



        if (window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.ACTIVE) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}] Cannot send ${type} - invalid state: ${window.__CallsCoreShared.currentState} (requires ACTIVE)`);



            return Promise.resolve({ success: false, reason: 'invalid_state' });



        }



        



        const messageId = generateId();



        const requestId = generateRequestId();



        



        // ENFORCE EXACT PROTOCOL SCHEMA with deduplication



        const message = {



            type: type,



            id: messageId,



            requestId: requestId,



            source: window.__CallsCoreShared.MODULE_NAME,



            target: 'parent',



            timestamp: Date.now(),



            payload: payload,



            messageId: messageId



        };



        



        // Check for duplicate sending



        if (window.__CallsCoreShared.MessageGuard.isDuplicate(messageId)) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}] Duplicate message blocked: ${type} (${messageId})`);



            return Promise.resolve({ success: false, reason: 'duplicate' });



        }



        



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}] 📤 ${type}`, { messageId, requestId });



        



        // SAFE POSTMESSAGE WRAPPER



        try {



            window.parent.postMessage(message, '*');



        } catch (error) {



            console.error(`[${window.__CallsCoreShared.MODULE_NAME}] Failed to send message ${type}:`, error);



            return Promise.resolve({ success: false, reason: 'postmessage_failed', error: error.message });



        }



        



        if (requireAck) {



            return new Promise((resolve) => {



                const timeoutId = setTimeout(() => {



                    resolve({ success: true, messageId, requestId, timeout: true });



                }, 3000);



                



                // Store timeout ID for cleanup



                if (typeof window.__CallsCoreShared.MessageRegistry !== 'undefined' && window.__CallsCoreShared.MessageRegistry) {



                    window.__CallsCoreShared.MessageRegistry._pendingMessages.set(messageId, { timeoutId });



                }



            });



        }



        



        return Promise.resolve({ success: true, messageId, requestId });



    }



    



    // ==================== SAFE API REQUEST ====================



    window.__CallsCoreShared.sendApiRequest = function sendApiRequest(endpoint, method = 'GET', data = null, options = {}) {



        if (!window.__CallsCoreShared.assertActive('API_REQUEST')) {



            return Promise.resolve({ success: false, reason: 'not_active', error: 'Module not active' });



        }



        



        // Validate and normalize endpoint



        const normalizedEndpoint = window.__CallsCoreShared.normalizeEndpoint(endpoint);



        if (!normalizedEndpoint) {



            console.error(`[${window.__CallsCoreShared.MODULE_NAME}] Invalid API endpoint: ${endpoint}`);



            return Promise.resolve({ success: false, reason: 'invalid_endpoint', error: 'Endpoint is required' });



        }



        



        const requestId = options.requestId || generateRequestId();



        



        const message = {



            type: 'API_REQUEST',



            id: generateId(),



            requestId: requestId,



            source: window.__CallsCoreShared.MODULE_NAME,



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



        



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}] 📤 API_REQUEST: ${method} ${normalizedEndpoint}`);



        



        // SAFE POSTMESSAGE WRAPPER



        try {



            window.parent.postMessage(message, '*');



        } catch (error) {



            console.error(`[${window.__CallsCoreShared.MODULE_NAME}] Failed to send API request:`, error);



            return Promise.resolve({ success: false, reason: 'postmessage_failed', error: error.message });



        }



        



        // Return promise with timeout



        return new Promise((resolve) => {



            const timeoutId = setTimeout(() => {



                console.warn(`[${window.__CallsCoreShared.MODULE_NAME}] API request timeout: ${method} ${normalizedEndpoint}`);



                resolve({ 



                    success: false, 



                    reason: 'timeout', 



                    error: 'API request timeout',



                    requestId: requestId



                });



            }, options.timeout || 10000);



            



            // Store for response handling



            if (typeof window.__CallsCoreShared.MessageRegistry !== 'undefined' && window.__CallsCoreShared.MessageRegistry) {



                window.__CallsCoreShared.MessageRegistry._pendingMessages.set(requestId, { 



                    timeoutId, 



                    resolve,



                    type: 'API_REQUEST',



                    endpoint: normalizedEndpoint



                });



            }



        });



    };



    



    // ==================== SAFE SEND WITH QUEUE ====================



    window.__CallsCoreShared.safeSend = function safeSend(type, payload = {}, requireAck = false) {



        // CRITICAL: No outbound messages before ACTIVE except CHILD_READY



        if (type !== 'CHILD_READY' && window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.ACTIVE) {



            console.log(`[${window.__CallsCoreShared.MODULE_NAME}] Queueing ${type} - not ACTIVE (current: ${window.__CallsCoreShared.currentState})`);



            const queuedMessage = { type, payload, requireAck, timestamp: Date.now() };



            window.__CallsCoreShared.messageQueue.push(queuedMessage);



            



            return new Promise((resolve) => {



                queuedMessage.resolve = resolve;



            });



        }



        



        // Special handling for API_REQUEST



        if (type === 'API_REQUEST') {



            const endpoint = payload.endpoint || payload.url;



            const method = payload.method || 'GET';



            const data = payload.data || payload.body;



            return window.__CallsCoreShared.sendApiRequest(endpoint, method, data, payload);



        }



        



        return sendMessage(type, payload, requireAck);



    };



    



    // ==================== FLUSH QUEUE ====================



    window.__CallsCoreShared.flushQueue = function flushQueue() {



        if (window.__CallsCoreShared.messageQueue.length === 0) return;



        



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}] Flushing ${window.__CallsCoreShared.messageQueue.length} queued messages`);



        



        while (window.__CallsCoreShared.messageQueue.length) {



            const queued = window.__CallsCoreShared.messageQueue.shift();



            let result;



            



            if (queued.type === 'API_REQUEST') {



                const endpoint = queued.payload.endpoint || queued.payload.url;



                const method = queued.payload.method || 'GET';



                const data = queued.payload.data || queued.payload.body;



                result = window.__CallsCoreShared.sendApiRequest(endpoint, method, data, queued.payload);



            } else {



                result = sendMessage(queued.type, queued.payload, queued.requireAck);



            }



            



            if (queued.resolve) {



                result.then(queued.resolve).catch(queued.resolve);



            }



        }



    };



    



    // ==================== REGISTER MODULE ====================



    let registrationSent = false;



    



    function registerModule() {



        if (!window.__CallsCoreShared.assertActive('REGISTER_MODULE')) {



            return;



        }



        



        if (registrationSent) {



            return; // already registered — silent



        }



        



        if (!window.__CallsCoreShared.parentReady) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}] Cannot register - parent not ready`);



            return;



        }



        



        registrationSent = true;



        if (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState) {



            window.__CallsCoreShared.callsState.registrationSent = true;



        }



        



        window.__CallsCoreShared.safeSend('REGISTER_MODULE', {



            moduleName: window.__CallsCoreShared.MODULE_NAME,



            version: window.__CallsCoreShared.CONFIG.VERSION,



            capabilities: [



                'voice',



                'video',



                'screenShare',



                'whiteboard',



                'polls',



                'notes'



            ]



        }, false);



        



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}] ✅ REGISTER_MODULE sent`);



        if (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState) {



            window.__CallsCoreShared.callsState.registered = true;



        }



        



        window.dispatchEvent(new CustomEvent('MODULE_READY', {



            detail: { module: window.__CallsCoreShared.MODULE_NAME, timestamp: Date.now() }



        }));



    }



    



    // ==================== REQUEST SESSION ====================



    window.__CallsCoreShared.sessionRequestAttempts = 0;



    const MAX_SESSION_REQUESTS = 3;



    let sessionRequestTimer = null;



    



    function requestSession() {



        if (!window.__CallsCoreShared.assertActive('REQUEST_SESSION')) {



            return;



        }



        



        if (!window.__CallsCoreShared.parentReady) {



            console.warn(`[${window.__CallsCoreShared.MODULE_NAME}] Cannot request session - parent not ready`);



            return;



        }



        



        if (typeof window.__CallsCoreShared.IframeTransport !== 'undefined' && window.__CallsCoreShared.IframeTransport && window.__CallsCoreShared.IframeTransport._sessionRequested) return;



        



        if (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState && window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



            window.__CallsCoreShared.sessionRequestAttempts;



        }



        



        if (typeof window.__CallsCoreShared.IframeTransport !== 'undefined' && window.__CallsCoreShared.IframeTransport) {



            window.__CallsCoreShared.IframeTransport._sessionRequested = true;



        }



        window.__CallsCoreShared.sessionRequestAttemptsed.sessionRequestAttempts;



        



        if (typeof window.__CallsCoreShared.IframeTransport !== 'undefined' && window.__CallsCoreShared.IframeTransport && window.__CallsCoreShared.IframeTransport._sessionRequestTimer) {



            clearTimeout(window.__CallsCoreShared.IframeTransport._sessionRequestTimer);



        }



        



        if (typeof window.__CallsCoreShared.IframeTransport !== 'undefined' && window.__CallsCoreShared.IframeTransport) {



            window.__CallsCoreShared.IframeTransport._sessionRequestTimer = setTimeout(() => {



                if (window.__CallsCoreShared.IframeTransport) window.__CallsCoreShared.IframeTransport._sessionRequested = false;



            }, 10000);



        }



        



        window.__CallsCoreShared.safeSend('REQUEST_SESSION', {



            timestamp: Date.now(),



            frameId: window.name || 'calls-iframe',



            attempt: window.__CallsCoreShared.sessionRequestAttempts



        }, false).catch(() => {});



        



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}] 📤 REQUEST_SESSION sent (attempt ${window.__CallsCoreShared.sessionRequestAttempts})`);



    }



    



    window.__CallsCoreShared.refreshSession = function refreshSession() {



        if (!window.__CallsCoreShared.assertActive('refreshSession')) return;



        



        console.log(`[${window.__CallsCoreShared.MODULE_NAME}] 🔄 Refreshing session due to auth failure`);



        



        if (typeof window.__CallsCoreShared.callsState !== 'undefined' && window.__CallsCoreShared.callsState) {



            window.__CallsCoreShared.callsState.session = null;



            window.__CallsCoreShared.callsState.token = null;



            window.__CallsCoreShared.callsState.verified = false;



            window.__CallsCoreShared.callsState.sessionReceived = false;



            window.__CallsCoreShared.callsState.sessionStatus = 'pending';



            window.__CallsCoreShared.validSessionConfirmed;



        }



        



        // Storage is ONLY for UI preferences, never for call state



        window.__CallsCoreShared.StorageProxy.set('session_state', 'invalid');



        



        const delay = Math.min(1000 * Math.pow(2, window.__CallsCoreShared.sessionRequestAttempts), 10000);



        



        setTimeout(() => {



            if (typeof window.__CallsCoreShared.IframeTransport !== 'undefined' && window.__CallsCoreShared.IframeTransport) {



                window.__CallsCoreShared.IframeTransport._sessionRequested = false;



            }



            if (window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.ACTIVE) {



                window.__CallsCoreShared.SessionClient.requestSession();



            }



        }, delay);



    };



    



    window.__CallsCoreShared.sendHeartbeatAck = function sendHeartbeatAck(originalMessageId) {



        if (!window.__CallsCoreShared.assertActive('HEARTBEAT_ACK')) return;



        if (!window.__CallsCoreShared.parentReady) return;



        



        window.__CallsCoreShared.safeSend('HEARTBEAT_ACK', {



            ackId: originalMessageId,



            module: window.__CallsCoreShared.MODULE_NAME,



            timestamp: Date.now()



        });



    };



    

})();
