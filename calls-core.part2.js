/**
 * PART 2/3 — API & OPERATIONS
 * API gateway, data loading, core operations
 */
didate added');



            } catch (error) {



                logError(MODULE, 'Failed to add ICE candidate', error);



            }



        },



        



        handleIceFailure: function() {

            // FIX: guard against being invoked with no active peer connection
            // (e.g. window.callsCoreRestartICE fired from a tab-visibility or
            // network-restore event when no call is connected, or right as a
            // call is ending). Without this, createOffer() always threw "No
            // peer connection" and logged it as a spurious error.
            if (!this._peerConnection) {
                logInfo(MODULE, 'ICE restart skipped — no active peer connection');
                return;
            }



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



        // FIX-ROOT-CAUSE-45S-FORCE-END: no counterpart to setConnectionTimeout
        // existed anywhere — the only thing that could stop this timer from
        // firing was the reactive callState/__callReceiverAccepted check
        // above running at the exact moment it fired, 45 seconds after being
        // set. That's fragile: anything that transiently left callState out
        // of _acceptedStates around that moment (confirmed live: duplicate
        // 'call:incoming' delivery re-running handleIncomingCall mid-call and
        // resetting callState back to 'incoming' after the receiver had
        // already accepted) would force-end an already-connected call with no
        // direct way to prevent it. Call this explicitly the moment accept
        // actually succeeds, so the timer is cancelled outright instead of
        // hoping the reactive check saves it later.
        clearConnectionTimeout: function() {
            if (this._connectionTimeout) {
                clearTimeout(this._connectionTimeout);
                this._connectionTimeout = null;
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



    



    // FIX (call self-terminates right after Accept / dark screen): this used to also
    // treat "activeCallId === callId && callActive" as stale and call resetCallState().
    // But that combination is the NORMAL state during acceptCall() — handleSignalOffer()
    // legitimately sets callActive=true (and activeCallId is already set to this callId
    // from handleIncomingCall) the moment the early WebRTC offer arrives, BEFORE the user
    // taps Accept. Calling resetCallState() here stopped the just-acquired local media
    // stream, closed the WebRTC peer connection, and told CallManager to end the call —
    // all mid-flight while acceptCall() was still setting up the SAME call. That's why the
    // receiver's screen went dark almost immediately after accepting. Only a genuinely
    // orphaned callActive flag (true with no matching id at all) is truly stale here; a
    // matching id is call continuation, not staleness, and must not be torn down.



    if (callsState.callActive && !callsState.activeCallId) {



        logWarn(MODULE, 'Stale call state detected (orphaned callActive flag), resetting before new call', { callId });



        resetCallState();



        callsState.callActive = false;



        callsState.activeCallId = null;



    } else if (callsState.activeCallId === callId && callsState.callActive) {



        logCall(MODULE, 'Continuing existing active call session (not stale) — skipping teardown', { callId });



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
                _smOut.createSession(callId, callType || 'audio', (participants && participants[0]) || null, true);
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
    // FIX-ROOT-CAUSE-45S-FORCE-END: reset the accepted flag here too, or it
    // would stay stuck true for every subsequent call, permanently disabling
    // the no-answer timeout guard's second layer of protection.
    window.__callReceiverAccepted = false;
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
    // FIX: clear the handleCallAccepted dedup set (see that function) here
    // so it doesn't grow forever and a fresh call always starts clean.
    if (callsState._acceptedCallIds) callsState._acceptedCallIds.clear();
    // FIX: clear the handleCallConnected dedup set (see that function) too.
    if (callsState._connectedCallIds) callsState._connectedCallIds.clear();
    // FIX: clear the handleSignalOffer dedup set (see that function) too.
    if (callsState._processedOfferKeys) callsState._processedOfferKeys.clear();
    if (callsState._processedAnswerKeys) callsState._processedAnswerKeys.clear();
    if (callsState._processedIceKeys) callsState._processedIceKeys.clear();







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
                window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _returnTarget, chatUserId: callsState.pendingCallReturnChatUserId || null, chatUserName: callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
            }
        } catch(_) {}
        console.log('[CallsCore] PHASE15 ✅ Post-call UI restored to: ' + _returnTarget);
    } catch(_restoreErr) {
        console.warn('[CallsCore] Post-call restore error:', _restoreErr && _restoreErr.message);
    }
    // ── END PHASE15 FIX-PHASE-C ──────────────────────────────────────────────
}







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



    



/**
 * PART 7/8 — RELIABILITY & ORCHESTRATION
 * Reliability engine, recovery manager, compatibility bridge, diagnostics agent, multi-module coordinator, navigation guard, lifecycle controller, session pipeline, and another set of real call-signaling handlers used during orchestration.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
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



        console.log(`[${module}] ${icon} Pipeline stage: ${stage} - ${status}`, data ? data : '', _buildStructuredLog(module, `pipeline:${stage}:${status}`, data));



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
            // FIX (call-end return navigation — receiver side): also carry the
            // SPECIFIC chat that was open, if any, so returning after the call
            // reopens that exact conversation instead of just the chat list.
            if (callData && callData._receiverReturnChatUserId && !callsState.pendingCallReturnChatUserId) {
                callsState.pendingCallReturnChatUserId = callData._receiverReturnChatUserId;
                callsState.pendingCallReturnChatName = callData._receiverReturnChatName || null;
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

        // ── PRIVACY ENFORCEMENT: whoCanCallMe / autoReject ──────────────────
        // FIX: settings.calls.autoReject and settings.privacy/calls.whoCanCallMe
        // were propagated all the way down to this page (as window.AppSettings
        // data and as data-calls-* attributes) but nothing ever actually checked
        // them before letting an incoming call ring through — the settings were
        // cosmetic. We enforce the two cases we can check with certainty here:
        //   - autoReject === true            → reject every incoming call
        //   - whoCanCallMe === 'nobody'       → reject every incoming call
        // The 'friends'-only tier is deliberately NOT enforced here: it would
        // require a reliable cross-iframe friends-list lookup this file doesn't
        // have, and incorrectly rejecting a real friend is worse than today's
        // no-op. Both settings still fail open (no data → call proceeds normally).
        try {
            const _callsCfg = (window.AppSettings && window.AppSettings.get('calls')) || {};
            const _whoCanCall = _callsCfg.whoCanCallMe
                || document.documentElement.getAttribute('data-calls-who-can-call');
            const _autoReject = _callsCfg.autoReject === true
                || document.documentElement.getAttribute('data-calls-auto-reject') === 'true';

            if (_autoReject || _whoCanCall === 'nobody') {
                logWarn(MODULE, 'Incoming call auto-rejected by privacy setting', { autoReject: _autoReject, whoCanCallMe: _whoCanCall });
                safeSend('CALL_REJECT', {
                    callId: callData.callId,
                    reason: _autoReject ? 'auto_reject_enabled' : 'calls_restricted',
                    timestamp: Date.now()
                }, false);
                return;
            }
        } catch (_privacyErr) {
            // Fail open — never let a settings-read error block a legitimate call
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
        || (window.callsUI && window.callsUI.UIState && window.callsUI.UIState.pendingCallUser && window.callsUI.UIState.pendingCallUser.userName) // FIX: was window.UIState (never assigned)
        || window.__activePeerName;
    // sessionStorage is same-origin shared across frames
    if (!_resolvedCalleeName) {
        try {
            const _pendingCall = JSON.parse(sessionStorage.getItem('pending_call') || '{}');
            _resolvedCalleeName = _pendingCall.userName || _pendingCall.name || '';
        } catch(_) {}
    }
    _resolvedCalleeName = _resolvedCalleeName || 'User';
    // Update calling screen name el
