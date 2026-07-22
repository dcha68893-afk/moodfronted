/**
 * PART 6/8 — STATE GOVERNORS
 * Call state governor, legacy V5 state governor (compatibility), the current state governor, and the iframe session client that governors talk to.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
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



                [CALLS_STATE.INIT]: [CALLS_STATE.REGISTERING, CALLS_STATE.ACTIVE, CALLS_STATE.CALL_READY, CALLS_STATE.IN_CALL], // CALL_READY added for direct call initiation; IN_CALL added so accept can formalize the FSM even if lifecycle was still INIT



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
                    window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _staleReturnTarget, chatUserId: callsState.pendingCallReturnChatUserId || null, chatUserName: callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
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
                    window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _staleInitReturnTarget, chatUserId: callsState.pendingCallReturnChatUserId || null, chatUserName: callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
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







initiateCall: async function(callType, participants = [], options = {}) {



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
        let _activeCallWasSet = setActiveCall(callId, callType, participants);
        if (!_activeCallWasSet) {
            // setActiveCall refused because callsState still thinks a previous
            // call is active — a known race with the stale-state auto-reset
            // above (see its own comment: JS microtask ordering can mean
            // callActive is still true here). Force-clear and retry once
            // instead of silently continuing to negotiate WebRTC for callId
            // while callsState.activeCallId still points at the old call —
            // that inconsistency is what was causing the call to visually
            // start (both sides), then self-terminate seconds later.
            logWarn(MODULE, 'setActiveCall failed — force-clearing stale state and retrying once', { callId });
            if (window.callCore && window.callCore.forceResetCallState) {
                window.callCore.forceResetCallState();
            } else {
                callsState.activeCallId = null;
                callsState.callActive = false;
            }
            _activeCallWasSet = setActiveCall(callId, callType, participants);
            if (!_activeCallWasSet) {
                logError(MODULE, 'Unable to start call — previous call session would not clear', { callId });
                throw new Error('Another call is still ending. Please try again in a moment.');
            }
        }

        // ✅ FIX: Mark as caller so isCaller check in handleCallAccepted always works
        callsState._isCaller = true;
        window.__callerCallId = callId;
        console.log('[CallsCore] Caller flag set for callId:', callId);

        // Set up WebRTC
        WebRTCManager.createPeerConnection();



        WebRTCManager.addStream(streamResult.stream);



        WebRTCManager.setCurrentCallId(callId);



        WebRTCManager.setConnectionTimeout(CONFIG.CALL_CONNECTION_TIMEOUT);



        



        const isGroupCall = !!options.isGroupCall || (Array.isArray(participants) && participants.length > 1);



        



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
            groupId: options.groupId || null,



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



                let _activeCallWasSet2 = setActiveCall(callId, callType, []);
                if (!_activeCallWasSet2) {
                    logWarn(MODULE, 'setActiveCall failed — force-clearing stale state and retrying once', { callId });
                    if (window.callCore && window.callCore.forceResetCallState) {
                        window.callCore.forceResetCallState();
                    } else {
                        callsState.activeCallId = null;
                        callsState.callActive = false;
                    }
                    _activeCallWasSet2 = setActiveCall(callId, callType, []);
                    if (!_activeCallWasSet2) {
                        logError(MODULE, 'Unable to start call — previous call session would not clear', { callId });
                        throw new Error('Another call is still ending. Please try again in a moment.');
                    }
                }



                



                // Set up WebRTC



                // FIX-ROOT-CAUSE-45S-FORCE-END (2nd layer): this flag is read
                // by WebRTCManager's connection-timeout guard but was never
                // set anywhere in the codebase, so it could never actually
                // protect anything. Set it now that acceptance has genuinely
                // reached WebRTC setup, independent of whatever callsState
                // says at the moment the timer happens to fire.
                window.__callReceiverAccepted = true;



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
                            window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _rejReturnTarget, chatUserId: callsState.pendingCallReturnChatUserId || null, chatUserName: callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
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
                window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _ecReturnTarget, chatUserId: callsState.pendingCallReturnChatUserId || null, chatUserName: callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
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



    



