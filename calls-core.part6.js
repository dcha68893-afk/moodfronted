/**
 * calls-core.part6.js — PART 6/8 — STATE GOVERNORS
 * Call state governor, legacy V5 state governor (compatibility), the current state governor, and the iframe session client that governors talk to.
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

    // ==================== CALL STATE GOVERNOR (REAL) ====================



    window.__CallsCoreShared.CallsStateGovernor = {



        _currentState: window.__CallsCoreShared.CALLS_STATE.INIT,



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



            this._currentState = window.__CallsCoreShared.CALLS_STATE.INIT;



            this._previousState = null;



            this._moduleRegistered = false;



            this._sessionReceived = false;



            this._parentReadyReceived = false;



            this._session = null;



            this._token = null;



            this._validSessionConfirmed = false;



            



            window.__CallsCoreShared.callsState.registered = false;



            window.__CallsCoreShared.callsState.parentReady = false;



            window.__CallsCoreShared.callsState.session = null;



            window.__CallsCoreShared.callsState.sessionStatus = 'pending';



            window.__CallsCoreShared.callsState.token = null;



            window.__CallsCoreShared.callsState.verified = false;



            window.__CallsCoreShared.callsState.verificationLock = false;



            window.__CallsCoreShared.callsState.webrtcInitialized = false;



            window.__CallsCoreShared.callsState.recoveryMode = false;



            window.__CallsCoreShared.callsState.sessionReceived = false;



            window.__CallsCoreShared.callsState.childReadySent = false;



            window.__CallsCoreShared.callsState.registrationSent = false;



            window.__CallsCoreShared.validSessionConfirmed = false;



            window.__CallsCoreShared.transitionTo(window.__CallsCoreShared.LifecycleState.INITIALIZING);



            



            // Start stale call cleanup



            this._startStaleCallCleanup();



            



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Calls State Governor initialized');



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



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, `Illegal state transition: ${oldState} → ${newState}`);



                return false;



            }



            



            this._previousState = oldState;



            this._currentState = newState;



            



            window.__CallsCoreShared.logState(window.__CallsCoreShared.MODULE, oldState, newState, reason);



            this._notifyListeners('state', { oldState, newState, reason });



            



            this._handleStateActions(newState);



            



            return true;



        },



        



        _isLegalTransition: function(from, to) {



            const legalTransitions = {



                [window.__CallsCoreShared.CALLS_STATE.INIT]: [window.__CallsCoreShared.CALLS_STATE.REGISTERING, window.__CallsCoreShared.CALLS_STATE.ACTIVE, window.__CallsCoreShared.CALLS_STATE.CALL_READY, window.__CallsCoreShared.CALLS_STATE.IN_CALL], // CALL_READY added for direct call initiation; IN_CALL added so accept can formalize the FSM even if lifecycle was still INIT



                [window.__CallsCoreShared.CALLS_STATE.REGISTERING]: [window.__CallsCoreShared.CALLS_STATE.REGISTERED, window.__CallsCoreShared.CALLS_STATE.SESSION_PENDING],



                [window.__CallsCoreShared.CALLS_STATE.REGISTERED]: [window.__CallsCoreShared.CALLS_STATE.SESSION_PENDING, window.__CallsCoreShared.CALLS_STATE.REGISTERING],



                [window.__CallsCoreShared.CALLS_STATE.SESSION_PENDING]: [window.__CallsCoreShared.CALLS_STATE.SESSION_RECEIVED],



                [window.__CallsCoreShared.CALLS_STATE.SESSION_RECEIVED]: [window.__CallsCoreShared.CALLS_STATE.ACTIVE],



                [window.__CallsCoreShared.CALLS_STATE.ACTIVE]: [window.__CallsCoreShared.CALLS_STATE.CALL_READY, window.__CallsCoreShared.CALLS_STATE.SESSION_RECEIVED],



                [window.__CallsCoreShared.CALLS_STATE.CALL_READY]: [window.__CallsCoreShared.CALLS_STATE.IN_CALL, window.__CallsCoreShared.CALLS_STATE.ACTIVE],



                [window.__CallsCoreShared.CALLS_STATE.IN_CALL]: [window.__CallsCoreShared.CALLS_STATE.CALL_READY, window.__CallsCoreShared.CALLS_STATE.TERMINATED],



                [window.__CallsCoreShared.CALLS_STATE.TERMINATED]: [window.__CallsCoreShared.CALLS_STATE.INIT, window.__CallsCoreShared.CALLS_STATE.ACTIVE] // ACTIVE added for recovery



            };



            return legalTransitions[from] ? legalTransitions[from].includes(to) : false;



        },



        



        _handleStateActions: function(state) {



            switch (state) {



                case window.__CallsCoreShared.CALLS_STATE.ACTIVE:



                    break;



                case window.__CallsCoreShared.CALLS_STATE.IN_CALL:



                    break;



                case window.__CallsCoreShared.CALLS_STATE.TERMINATED:



                    break;



                default:



                    break;



            }



        },



        



        handleModuleRegistered: function() {



            if (this._moduleRegistered) return;



            



            this._moduleRegistered = true;



            window.__CallsCoreShared.callsState.registered = true;



            window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'MODULE_REGISTERED received');



            



            if (this._currentState === window.__CallsCoreShared.CALLS_STATE.REGISTERING) {



                this.transition(window.__CallsCoreShared.CALLS_STATE.REGISTERED, 'module_registered');



            }



            



            this.transition(window.__CallsCoreShared.CALLS_STATE.SESSION_PENDING, 'waiting_for_session');



        },



        



        handleSessionActive: function(sessionData) {



            if (!sessionData || typeof sessionData !== 'object') {



                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Invalid session data', null, sessionData);



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



            if (!window.__CallsCoreShared.__isValidSession(candidateSession)) {



                console.warn(`[${window.__CallsCoreShared.MODULE}] handleSessionActive rejected - invalid session`, {



                    hasToken: !!candidateSession.token,



                    userId: candidateSession.userId,



                    authenticated: candidateSession.authenticated



                });



                return;



            }



            



            this._session = candidateSession;



            this._token = candidateSession.token;



            window.__CallsCoreShared.callsState.session = candidateSession;



            window.__CallsCoreShared.callsState.token = candidateSession.token;



            window.__CallsCoreShared.callsState.sessionStatus = 'valid';



            this._validSessionConfirmed = true;



            window.__CallsCoreShared.validSessionConfirmed = true;



            



            if (!this._sessionReceived) {



                this._sessionReceived = true;



                window.__CallsCoreShared.callsState.sessionReceived = true;



                window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'SESSION_ACTIVE received', { 



                    authenticated: candidateSession.authenticated,



                    userId: candidateSession.userId,



                    sessionId: candidateSession.sessionId



                });



                



                if (this._currentState === window.__CallsCoreShared.CALLS_STATE.SESSION_PENDING || this._currentState === window.__CallsCoreShared.CALLS_STATE.REGISTERED) {



                    this.transition(window.__CallsCoreShared.CALLS_STATE.SESSION_RECEIVED, 'session_active');



                }



                



                if (this._parentReadyReceived) {



                    this.transition(window.__CallsCoreShared.CALLS_STATE.ACTIVE, 'parent_ready_after_session');



                }



                



                window.dispatchEvent(new CustomEvent('CALLS_CORE_READY', {



                    detail: { core: window.callCore, timestamp: Date.now() }



                }));



                



                window.dispatchEvent(new CustomEvent('MODULE_READY', {



                    detail: { module: window.__CallsCoreShared.MODULE_NAME, timestamp: Date.now() }



                }));



            }



        },



        



        handleSessionNull: function() {



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'SESSION_NULL received - no authenticated session');



            



            this._session = {



                authenticated: false,



                userId: null,



                token: null,



                user: {},



                expiresAt: 0,



                version: 1



            };



            this._token = null;



            window.__CallsCoreShared.callsState.session = null;



            window.__CallsCoreShared.callsState.token = null;



            window.__CallsCoreShared.callsState.sessionReceived = false;



            window.__CallsCoreShared.callsState.sessionStatus = 'invalid';



            this._validSessionConfirmed = false;



            window.__CallsCoreShared.validSessionConfirmed = false;



            



            if (!this._sessionReceived) {



                this._sessionReceived = true;



                



                if (this._currentState === window.__CallsCoreShared.CALLS_STATE.SESSION_PENDING || this._currentState === window.__CallsCoreShared.CALLS_STATE.REGISTERED) {



                    this.transition(window.__CallsCoreShared.CALLS_STATE.SESSION_RECEIVED, 'session_null');



                }



            }



        },



        



        handleParentReady: function() {



            if (this._parentReadyReceived) return;



            



            this._parentReadyReceived = true;



            window.__CallsCoreShared.callsState.parentReady = true;



            window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'PARENT_READY received');



            



            if (this._currentState === window.__CallsCoreShared.CALLS_STATE.SESSION_RECEIVED && this._validSessionConfirmed) {



                this.transition(window.__CallsCoreShared.CALLS_STATE.ACTIVE, 'parent_ready');



            } else if (this._currentState === window.__CallsCoreShared.CALLS_STATE.SESSION_PENDING) {



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'PARENT_READY received before session - waiting for SESSION_ACTIVE');



            } else if (this._currentState === window.__CallsCoreShared.CALLS_STATE.SESSION_RECEIVED && !this._validSessionConfirmed) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'PARENT_READY received but session is invalid - waiting for valid session');



            }



        },



        



        verifySession: function(force = false) {



            return new Promise((resolve) => {



                const now = Date.now();



                if (!force && now - this._lastVerificationTime < 5000) {



                    window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Verification skipped - cooldown', { 



                        lastVerification: this._lastVerificationTime 



                    });



                    resolve({ valid: window.__CallsCoreShared.callsState.verified, cached: true });



                    return;



                }



                



                if (window.__CallsCoreShared.callsState.verificationLock) {



                    window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Verification already in progress, waiting');



                    



                    const checkInterval = setInterval(() => {



                        if (!window.__CallsCoreShared.callsState.verificationLock) {



                            clearInterval(checkInterval);



                            resolve({ valid: window.__CallsCoreShared.callsState.verified, cached: true });



                        }



                    }, 50);



                    



                    



if (Date.now() - window.__CallsCoreShared.lastVerificationTime < window.__CallsCoreShared.VERIFICATION_COOLDOWN) {



    console.log('[calls] Skipping verification - cooldown active');



    return;



}



window.__CallsCoreShared.lastVerificationTime = Date.now();



                    setTimeout(() => {



                        clearInterval(checkInterval);



                        resolve({ valid: window.__CallsCoreShared.callsState.verified, cached: true, timeout: true });



                    }, 1000);



                    



                    return;



                }



                



                // ==================== CRITICAL FIX: Fall back to callsState.session if this._session is null ====================



                // Use callsState.session as fallback for session data



                if (!window.__CallsCoreShared.callsState.session || !window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                    resolve({ valid: false, reason: 'no_token' });



                    return;



                }



                



                // Use this._session if available and valid, otherwise fall back to callsState.session



                const sess = (this._session && this._session.authenticated) ? this._session : window.__CallsCoreShared.callsState.session;



                



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



        if (!window.__CallsCoreShared.assertActive('VERIFY_SESSION')) {



            resolve({ valid: window.__CallsCoreShared.callsState.verified, cached: true });



            return;



        }



        



        window.__CallsCoreShared.callsState.verificationLock = true;



        this._verificationInProgress = true;



        



        const requestId = `verify_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;



        let responded = false;



        let timeoutId = null;



        



        window.__CallsCoreShared.logSending(window.__CallsCoreShared.MODULE, 'VERIFY_SESSION sent', { requestId });



        



        // Set a safety timeout to prevent hanging promises



        const safetyTimeout = setTimeout(() => {



            if (!responded) {



                responded = true;



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'VERIFY_SESSION safety timeout triggered', { requestId });



                



                window.__CallsCoreShared.callsState.verificationLock = false;



                this._verificationInProgress = false;



                



                // Fall back to cached session validity



                const sess = (this._session && this._session.authenticated) ? this._session : window.__CallsCoreShared.callsState.session;



                if (sess && sess.authenticated && sess.expiresAt > Date.now()) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Using cached session after safety timeout');



                    window.__CallsCoreShared.callsState.verified = true;



                    if (window.__CallsCoreShared.callsState.session) {



                        window.__CallsCoreShared.validSessionConfirmed = true;



                    }



                    resolve({ valid: true, cached: true, timeout: true });



                } else {



                    resolve({ valid: false, reason: 'timeout', cached: false });



                }



            }



        }, 8000); // 8 second safety timeout



        



        // Register the pending request with MessageRegistry



        window.__CallsCoreShared.MessageRegistry.register(requestId, 'VERIFY_SESSION', { timeout: 5000 })



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



                



                window.__CallsCoreShared.callsState.verified = isValid;



                window.__CallsCoreShared.callsState.verificationLock = false;



                



                if (isValid && window.__CallsCoreShared.callsState.session) {



                    window.__CallsCoreShared.validSessionConfirmed = true;



                }



                



                window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, isValid ? 'Session verified' : 'Session verification failed');



                resolve({ valid: isValid, verified: true, requestId: requestId });



            })



            .catch((error) => {



                if (responded) return;



                responded = true;



                clearTimeout(safetyTimeout);



                



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Verification error', { requestId, error: error?.message });



                



                window.__CallsCoreShared.callsState.verificationLock = false;



                this._verificationInProgress = false;



                



                // Fall back to cached session validity



                const sess = (this._session && this._session.authenticated) ? this._session : window.__CallsCoreShared.callsState.session;



                if (sess && sess.authenticated && sess.expiresAt > Date.now()) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Using cached session after error');



                    window.__CallsCoreShared.callsState.verified = true;



                    if (window.__CallsCoreShared.callsState.session) {



                        window.__CallsCoreShared.validSessionConfirmed = true;



                    }



                    resolve({ valid: true, cached: true, error: true });



                } else {



                    resolve({ valid: false, reason: error?.message || 'verification_error', cached: false });



                }



            });



        



        // Send the verification request to parent



        window.__CallsCoreShared.safeSend('VERIFY_SESSION', {



            requestId: requestId,



            timestamp: Date.now()



        }, false).catch((error) => {



            if (responded) return;



            responded = true;



            clearTimeout(safetyTimeout);



            



            window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Failed to send VERIFY_SESSION', error);



            window.__CallsCoreShared.callsState.verificationLock = false;



            this._verificationInProgress = false;



            resolve({ valid: false, reason: 'send_failed', error: error?.message });



        });



    });



},







// Add this helper method to clean up stale call states



_clearStaleCallState: function() {



    // If a call has been active for more than 60 seconds without being connected,



    // it's likely stale - clean it up

    // BUGFIX (ReferenceError: _ACTIVE_CALL_STATES is not defined): this Set
    // used to be declared with `const` INSIDE the first `if` block below.
    // Because `const`/`let` are block-scoped in JS, that made it invisible
    // to the second, sibling `if` block further down in this same function
    // (the "initiating" stale-call check), which also references it. Any
    // call that reached that second check threw an uncaught ReferenceError
    // and skipped its stale-call cleanup entirely. Hoisting the declaration
    // to the top of the function makes it visible to both blocks.
    const _ACTIVE_CALL_STATES = new Set(['connected','in-call','in_call','connecting','starting','initiated','initiating','ringing','incoming','in_progress']);



    if (window.__CallsCoreShared.callsState.callActive && window.__CallsCoreShared.callsState.callStartTime) {



        const callDuration = Date.now() - window.__CallsCoreShared.callsState.callStartTime;



        // Allow 120s for TURN relay connection; also skip if receiver has accepted
        // PHASE15 FIX: Added 'starting', 'initiated', 'ringing', 'incoming' to safe states.
        // callsState.callState is set to 'starting' when the call is accepted and media
        // streams are being set up, and 'connected' only after RTCPeerConnection fires
        // 'connected'. The previous list was missing 'starting' and 'initiated', causing
        // live calls to be auto-terminated if connection took > 120s (common on TURN relays).
        //
        // FIX-ROOT-CAUSE-2MIN-CALL-DROP-2 (found via forensic log analysis):
        // The ONLY place that ever sets callsState.callState to this string is
        // line ~3647 of calls-core.part5.js, and the literal value it writes is
        // 'initiating' (present continuous) — NOT 'initiated' (past tense).
        // Because this set only listed 'initiated', a call that was still
        // legitimately negotiating (callState === 'initiating') was NEVER
        // recognized as "safe" by this first, general 120s check. It was only
        // meant to be governed by the SECOND, dedicated check further down in
        // this same function, which allows 'initiating' calls a full 300s
        // (5 min) before cleanup — but that second check never got a chance to
        // run, because this first 120s check fired first and reset the call.
        // This is the exact "call ends itself after ~2 minutes even though
        // we're still talking" bug reproduced in the console log: state was
        // 'initiating' and duration was ~125000ms when "Cleaning up stale call
        // state" fired. Adding 'initiating' here restores the intent described
        // in the FIX-ROOT-CAUSE-2MIN-CALL-DROP comment below: this 120s check
        // should never fire for a call still in initiating/negotiating states —
        // only the dedicated 'initiating' timeout (300s) below should.
        // (_ACTIVE_CALL_STATES is declared once at the top of this function
        // — see BUGFIX comment there — so both this block and the sibling
        // 'initiating' block below it can both see it now.)

        // FIX-ROOT-CAUSE-2MIN-CALL-DROP: the app tracks call state in THREE
        // separate places that are not guaranteed to stay in sync —
        // window.__CallsCoreShared.callsState.callState (checked below),
        // window.UIState.callState (calls-ui.js), and window.callsState
        // (calls.html's own global). If a genuinely connected call ever left
        // this specific tracker's callState string out of _ACTIVE_CALL_STATES
        // — e.g. a transient value, a missed update on this tracker while
        // another tracker correctly shows 'connected' — this 120s timer would
        // silently end an active, still-in-progress call out from under two
        // people who are actively talking. That is the "call ends itself
        // after ~2 minutes even though we're still talking" bug.
        //
        // window.__CallsCoreShared.callsState._connectedCallIds (populated in
        // handleCallConnected, cleared on resetCallState) is the one place
        // that durably remembers "this callId has genuinely connected at
        // least once" — independent of whatever any single callState string
        // currently says. Treat it as authoritative: once a call has
        // connected, this stale-cleanup timer must never end it. It also
        // cross-checks the other two trackers directly as a second layer, so
        // a fix to one tracker's state naming can't silently reopen this bug.
        const _activeCallIdNow = window.__CallsCoreShared.callsState.activeCallId;
        const _hasConnectedOnce = !!(
            _activeCallIdNow &&
            window.__CallsCoreShared.callsState._connectedCallIds &&
            window.__CallsCoreShared.callsState._connectedCallIds.has(_activeCallIdNow)
        );
        const _otherTrackerSaysActive = _ACTIVE_CALL_STATES.has(
            (window.UIState && window.UIState.callState) || ''
        ) || _ACTIVE_CALL_STATES.has(
            (window.callsState && window.callsState.callState) || ''
        );

        if (callDuration > 120000 && !_hasConnectedOnce && !_otherTrackerSaysActive && !_ACTIVE_CALL_STATES.has(window.__CallsCoreShared.callsState.callState)) {



            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cleaning up stale call state', {



                callId: window.__CallsCoreShared.callsState.activeCallId,



                state: window.__CallsCoreShared.callsState.callState,



                duration: callDuration



            });

            var _staleReturnTarget = (window.__CallsCoreShared.callsState && (window.__CallsCoreShared.callsState.pendingCallReturnTo || window.__CallsCoreShared.callsState.pendingCallSource)) || 'conversations';

            window.__CallsCoreShared.resetCallState();

            // ── FIX: Without this, a stale/frozen call screen cleaned up after
            // 120s left the user stuck looking at a dead call UI with no nav.
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _staleReturnTarget, chatUserId: window.__CallsCoreShared.callsState.pendingCallReturnChatUserId || null, chatUserName: window.__CallsCoreShared.callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
                }
            } catch (_e) {}

        }



    }



    



    // Also check for calls that have been in 'initiating' state for too long



    if (window.__CallsCoreShared.callsState.callState === 'initiating' && window.__CallsCoreShared.callsState.callStartTime) {



        const callDuration = Date.now() - window.__CallsCoreShared.callsState.callStartTime;

        // Same safety net as the block above: if this callId has genuinely
        // connected at least once, never auto-end it here either, no matter
        // what this tracker's callState string currently says.
        const _activeCallIdNow2 = window.__CallsCoreShared.callsState.activeCallId;
        const _hasConnectedOnce2 = !!(
            _activeCallIdNow2 &&
            window.__CallsCoreShared.callsState._connectedCallIds &&
            window.__CallsCoreShared.callsState._connectedCallIds.has(_activeCallIdNow2)
        );
        // FIX-ROOT-CAUSE-5MIN-CALL-DROP: this check only ever looked at
        // _hasConnectedOnce2, unlike the 120s check above it which also
        // cross-checks window.UIState.callState, window.callsState.callState,
        // and now _cmTimerDelegated (set the moment CallManager takes over
        // owning the call-duration timer for a connected call — see
        // calls-core.part7.js's CALLMANAGER BRIDGE). If THIS tracker's
        // callState string ever fails to advance past 'initiating' while the
        // call is genuinely connected and every other tracker/CallManager
        // knows it, this was the one stale-call check with no safety net —
        // it would silently end an active, in-progress call ~5 minutes after
        // it started ringing. Apply the same cross-tracker guard here.
        const _otherTrackerSaysActive2 = _ACTIVE_CALL_STATES.has(
            (window.UIState && window.UIState.callState) || ''
        ) || _ACTIVE_CALL_STATES.has(
            (window.callsState && window.callsState.callState) || ''
        );
        const _cmOwnsTimer2 = !!window.__CallsCoreShared._cmTimerDelegated;

        if (callDuration > 300000 && !_hasConnectedOnce2 && !_otherTrackerSaysActive2 && !_cmOwnsTimer2) { // PHASE15 FIX: 300s (5min) — was 120s which killed calls on slow TURN relays



            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cleaning up stale initiating call', {



                callId: window.__CallsCoreShared.callsState.activeCallId,



                duration: callDuration



            });

            var _staleInitReturnTarget = (window.__CallsCoreShared.callsState && (window.__CallsCoreShared.callsState.pendingCallReturnTo || window.__CallsCoreShared.callsState.pendingCallSource)) || 'conversations';

            window.__CallsCoreShared.resetCallState();

            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _staleInitReturnTarget, chatUserId: window.__CallsCoreShared.callsState.pendingCallReturnChatUserId || null, chatUserName: window.__CallsCoreShared.callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
                }
            } catch (_e) {}

        }



    }



    



    // Clean up incoming call data that's been waiting too long
    if (window.__CallsCoreShared.callsState.callData && window.__CallsCoreShared.callsState.callState === 'incoming') {

        const incomingCallAge = Date.now() - (window.__CallsCoreShared.callsState.callData.timestamp || window.__CallsCoreShared.callsState.callData.createdAt || Date.now());

        if (incomingCallAge > 40000) {

            var _staleIncomingCallId = window.__CallsCoreShared.callsState.callData.callId;

            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cleaning up stale incoming call data', {
                callId: _staleIncomingCallId,
                age: incomingCallAge
            });

            // FIX-5-STALE-INCOMING-PARTIAL-CLEANUP: this block used to only
            // null callData/callState/activeCallId directly, unlike the
            // sibling "stale initiating" block right above it, which
            // correctly routes through resetCallState() (clears the
            // invitation timer, WebRTCManager/MediaManager, session flags,
            // ReliabilityEngine retry state, etc.) and tells the parent to
            // navigate back via POST_CALL_RESTORE. An unanswered incoming
            // call rarely has a live peer connection yet, but it can still
            // hold a pending callInvitationTimer and other session state
            // that this partial cleanup silently left behind. Also, the old
            // code compared activeCallId against callData?.callId AFTER
            // already nulling callData on the previous line, so that check
            // could never match — capture the id first instead.
            var _staleIncomingReturnTarget = (window.__CallsCoreShared.callsState && (window.__CallsCoreShared.callsState.pendingCallReturnTo || window.__CallsCoreShared.callsState.pendingCallSource)) || 'conversations';

            window.__CallsCoreShared.resetCallState();

            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _staleIncomingReturnTarget, chatUserId: window.__CallsCoreShared.callsState.pendingCallReturnChatUserId || null, chatUserName: window.__CallsCoreShared.callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
                }
            } catch (_e) {}

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



    if (window.__CallsCoreShared.callsState.callActive === true || window.__CallsCoreShared.callsState.activeCallId !== null || window.__CallsCoreShared.callsState.callState !== 'idle') {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cleaning up stale call state before initiating', { 



            callActive: window.__CallsCoreShared.callsState.callActive,



            activeCallId: window.__CallsCoreShared.callsState.activeCallId,



            callState: window.__CallsCoreShared.callsState.callState



        });



        



        // Force reset everything



        window.__CallsCoreShared.resetCallState();



        window.__CallsCoreShared.callsState.callActive = false;



        window.__CallsCoreShared.callsState.callState = 'idle';



        window.__CallsCoreShared.callsState.activeCallId = null;



        window.__CallsCoreShared.callsState.activeCall = null;



        window.__CallsCoreShared.callsState.callType = null;



        window.__CallsCoreShared.callsState.callParticipants = [];



        window.__CallsCoreShared.callsState.callStartTime = null;



        window.__CallsCoreShared.callsState.serverCallId = null;



        window.__CallsCoreShared.callsState.localCallId = null;



        



        if (window.__CallsCoreShared.callsState.callInvitationTimer) {



            clearTimeout(window.__CallsCoreShared.callsState.callInvitationTimer);



            window.__CallsCoreShared.callsState.callInvitationTimer = null;



        }



        



        if (window.__CallsCoreShared.MediaManager) window.__CallsCoreShared.MediaManager.stopLocalStream();



        if (window.__CallsCoreShared.WebRTCManager) window.__CallsCoreShared.WebRTCManager.close();



        



        // CRITICAL FIX: Also fix governor state — INIT→CALL_READY is illegal.



        // After cleanup, governor must be in ACTIVE so ACTIVE→CALL_READY works.



        this._transitionLock = false;



        if (this._currentState !== window.__CallsCoreShared.CALLS_STATE.ACTIVE) {



            this._previousState = this._currentState;



            this._currentState = window.__CallsCoreShared.CALLS_STATE.ACTIVE;



        }



        



        // Small delay to ensure cleanup completes



        await new Promise(resolve => setTimeout(resolve, 100));



    }



    



    // ✅ FIX: Force-clear any remaining stale state instead of aborting
    // Previous behavior: abort if callActive/activeCallId still set after cleanup
    // New behavior: force-clear and continue (the user explicitly started a new call)
    if (window.__CallsCoreShared.callsState.callActive === true || window.__CallsCoreShared.callsState.activeCallId !== null) {
        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Force-clearing stale call state for new call');
        window.__CallsCoreShared.callsState.callActive   = false;
        window.__CallsCoreShared.callsState.callState    = 'idle';
        window.__CallsCoreShared.callsState.activeCallId = null;
        window.__CallsCoreShared.callsState.activeCall   = null;
        window.__CallsCoreShared.callsState.serverCallId = null;
        window.__CallsCoreShared.callsState.localCallId  = null;
        window.__CallsCoreShared.callsState._isCaller    = false;
        window.__callerCallId   = null;
        window.__pendingOfferPayload = null;
        window.__pendingAnswerPayload = null;
        // Close PC if still open
        if (window.__CallsCoreShared.WebRTCManager && window.__CallsCoreShared.WebRTCManager._peerConnection) {
            try { window.__CallsCoreShared.WebRTCManager._peerConnection.close(); } catch(e) {}
            window.__CallsCoreShared.WebRTCManager._peerConnection = null;
        }
    }





    



    if (!window.__CallsCoreShared.assertActive('initiateCall')) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cannot initiate call - not in ACTIVE state', { currentState: window.__CallsCoreShared.currentState });



        this._notifyListeners('call_blocked', { reason: 'not_active' });



        return { success: false, reason: 'not_active' };



    }



    



    if (!window.__CallsCoreShared.parentReady) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cannot initiate call - parent not ready');



        this._notifyListeners('call_blocked', { reason: 'parent_not_ready' });



        return { success: false, reason: 'parent_not_ready' };



    }



    



    if (window.__CallsCoreShared.callsState.recoveryMode) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cannot initiate call - recovery mode active', { currentState: window.__CallsCoreShared.currentState });



        this._notifyListeners('call_blocked', { reason: 'recovery' });



        return { success: false, reason: 'recovery' };



    }



    



    // Check for valid session



    const activeSession = (this._session && this._session.authenticated) ? this._session : window.__CallsCoreShared.callsState.session;



    const activeToken = this._token || window.__CallsCoreShared.callsState.token;



    



    if (!activeSession || !activeSession.authenticated) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Call blocked - no valid session');



        this._notifyListeners('call_blocked', { reason: 'no_valid_session' });



        return { success: false, reason: 'no_valid_session' };



    }



    



    if (!activeToken) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Call blocked - no token');



        this._notifyListeners('call_blocked', { reason: 'no_token' });



        return { success: false, reason: 'no_token' };



    }



    



    // Sync session



    if (!this._session) {



        this._session = activeSession;



        this._token = activeToken;



        window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Synced CallsStateGovernor session from callsState');



    }



    



    const permCheck = await window.__CallsCoreShared.PermissionManager.checkPermissions({

        audio: window.__CallsCoreShared.getAudioConstraints(),

        video: callType === 'video'



    });



    



    if (!permCheck.success) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Call blocked - permission check failed', { error: permCheck.error });



        this._notifyListeners('permission_denied', { error: permCheck.error });



        return { success: false, reason: 'permission_denied', error: permCheck.error };



    }



    



    const verifyResult = await this.verifySession(true);



    



    if (!verifyResult.valid) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Call blocked - session verification failed', verifyResult);



        return { success: false, reason: 'verification_failed' };



    }



    



    window.__CallsCoreShared.callsState.verified = true;



    



    try {



        const constraints = {



            audio: window.__CallsCoreShared.getAudioConstraints(),



            video: window.__CallsCoreShared.getVideoConstraints(callType)



        };



        



        const streamResult = await window.__CallsCoreShared.MediaManager.getLocalStream(constraints);



        



        if (!streamResult.success) {



            throw new Error(streamResult.error || 'Failed to get media stream');



        }



        



        const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;



        



        // Sync call origin from global flag set by calls-ui before initiateCall



        if (window.__pendingCallReturnTo && !window.__CallsCoreShared.callsState.pendingCallReturnTo) {



            window.__CallsCoreShared.callsState.pendingCallReturnTo = window.__pendingCallReturnTo;



        }



        



        // Set active call
        let _activeCallWasSet = window.__CallsCoreShared.setActiveCall(callId, callType, participants);
        if (!_activeCallWasSet) {
            // setActiveCall refused because callsState still thinks a previous
            // call is active — a known race with the stale-state auto-reset
            // above (see its own comment: JS microtask ordering can mean
            // callActive is still true here). Force-clear and retry once
            // instead of silently continuing to negotiate WebRTC for callId
            // while callsState.activeCallId still points at the old call —
            // that inconsistency is what was causing the call to visually
            // start (both sides), then self-terminate seconds later.
            window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'setActiveCall failed — force-clearing stale state and retrying once', { callId });
            if (window.callCore && window.callCore.forceResetCallState) {
                window.callCore.forceResetCallState();
            } else {
                window.__CallsCoreShared.callsState.activeCallId = null;
                window.__CallsCoreShared.callsState.callActive = false;
            }
            _activeCallWasSet = window.__CallsCoreShared.setActiveCall(callId, callType, participants);
            if (!_activeCallWasSet) {
                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Unable to start call — previous call session would not clear', { callId });
                throw new Error('Another call is still ending. Please try again in a moment.');
            }
        }

        // ✅ FIX: Mark as caller so isCaller check in handleCallAccepted always works
        window.__CallsCoreShared.callsState._isCaller = true;
        window.__callerCallId = callId;
        console.log('[CallsCore] Caller flag set for callId:', callId);

        // Set up WebRTC
        window.__CallsCoreShared.WebRTCManager.createPeerConnection();



        window.__CallsCoreShared.WebRTCManager.addStream(streamResult.stream);



        window.__CallsCoreShared.WebRTCManager.setCurrentCallId(callId);



        // FIX-PREMATURE-45S-END-WHILE-RINGING: setConnectionTimeout used to be
        // armed here, the moment the caller starts dialing — well before the
        // receiver has even seen the incoming call. That gave every outgoing
        // call a hard 45s deadline instead of the intended 3-minute ring
        // window (the frontend's own startRingTimer in calls-ui.js and the
        // backend's RING_TIMEOUT_MS both already correctly implement that
        // 3-minute no-answer timeout). If nobody answered within 45s, this
        // fired 'call_timeout' and tore the call down over 2 minutes early.
        // The connection timeout is a WebRTC/ICE negotiation safety net, not
        // a ring timeout — it's now armed in handleCallAccepted() instead, so
        // it only starts counting once there is actually a connection being
        // negotiated.



        



        const isGroupCall = !!options.isGroupCall || (Array.isArray(participants) && participants.length > 1);



        



        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Sending CALL_INITIATE to parent', { callId, callType, participants, isGroupCall });



        



        // ── LOCAL-FIRST: create local call record immediately ──────────────



        (function _saveLocalCallRecord() {



            const store = window.KynectaCallLocalStore;



            if (!store) return;



            store.save({



                id: callId,



                serverId: null,



                callerId: window.__CallsCoreShared.callsState.session?.userId || null,



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



                    callerId: window.__CallsCoreShared.callsState.session?.userId,



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



            returnTo: window.__CallsCoreShared.callsState.pendingCallReturnTo || window.__pendingCallOrigin || 'calls',



            callSource: window.__CallsCoreShared.callsState.pendingCallSource || 'calls',



            timestamp: Date.now()



        };







        let result;



        const retryEngine = window.KynectaCallRetry;



        if (retryEngine && !retryEngine.isActive) {



            result = await new Promise((resolve) => {



                retryEngine.execute(



                    async (attempt) => {



                        window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, `call:initiate attempt ${attempt}`, { callId });



                        const r = await window.__CallsCoreShared.safeSend('call:initiate', { ..._signalPayload, timestamp: Date.now() }, true);



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



            result = await window.__CallsCoreShared.safeSend('call:initiate', _signalPayload, true);



        }







        if (result.success === false) {



            window.__CallsCoreShared.resetCallState();



            window.__CallsCoreShared.callsState.callActive = false;



            window.__CallsCoreShared.callsState.callState = 'idle';



            window.__CallsCoreShared.callsState.activeCallId = null;



            // Update local history to failed



            const store = window.KynectaCallLocalStore;



            if (store) store.updateStatus(callId, 'failed').catch(() => {});



            // Clear session



            const mgr = window.KynectaCallSession;



            if (mgr && mgr.isActive) mgr.end('failed');



            throw new Error(result.reason || result.error || 'Failed to initiate call');



        }



        



        // Set invitation timeout (3 minutes)
        window.__CallsCoreShared.callsState.callInvitationTimer = setTimeout(() => {
            if (window.__CallsCoreShared.callsState.callState === 'initiating') {
                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Call invitation timed out (3 min) — recording as no_answer on caller side');
                // Caller side: no_answer = outgoing unanswered (NOT missed)
                this.endCall(callId, { status: 'no_answer' });
                this._notifyListeners('call_timeout', { callId, status: 'no_answer' });
                window.__CallsCoreShared.notifyListeners('call_timeout', { callId, status: 'no_answer' });
                // Signal parent to record receiver-side missed call
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'RECORD_MISSED_CALL',
                        payload: { callId, timestamp: Date.now() }
                    }, '*');
                }
            }
        }, window.__CallsCoreShared.CONFIG.CALL_INVITATION_TIMEOUT);



        



        this.transition(window.__CallsCoreShared.CALLS_STATE.CALL_READY, 'call_initiated');



        



        window.__CallsCoreShared.logSuccess(window.__CallsCoreShared.MODULE, 'Call initiated', { type: callType, callId, isGroupCall });



        



        return { 



            success: true, 



            callId,



            stream: streamResult.stream



        };



        



    } catch (error) {



        window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Failed to initiate call', error);



        window.__CallsCoreShared.resetCallState();



        window.__CallsCoreShared.callsState.callActive = false;



        window.__CallsCoreShared.callsState.callState = 'idle';



        window.__CallsCoreShared.callsState.activeCallId = null;



        return { success: false, reason: error.message };



    }



},



        



        acceptCall: async function(callId, uiCallType) {



            // CRITICAL: Single active call enforcement



            if (!window.__CallsCoreShared.enforceSingleActiveCall()) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cannot accept call - another call already active');



                this._notifyListeners('call_blocked', { reason: 'call_active' });



                return { success: false, reason: 'call_active' };



            }



            



            if (!window.__CallsCoreShared.assertActive('acceptCall')) {



                return { success: false, reason: 'not_active' };



            }



            



            // CRITICAL: Verify valid session before accepting call



            // Use callsState.session as fallback



            const activeSession = (this._session && this._session.authenticated) ? this._session : window.__CallsCoreShared.callsState.session;



            if (!activeSession || !window.__CallsCoreShared.__isValidSession(activeSession)) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Cannot accept call - no valid session');



                return { success: false, reason: 'no_valid_session' };



            }



            



            window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Accepting call', { callId });



            



            try {



                // Determine call type -- prefer the UI's own determination (which
                // accept button the receiver actually tapped) since callData.callType
                // from the backend payload can be missing/stale. Silently discarding
                // this and falling back to 'voice' meant getUserMedia() never
                // requested a camera for what the receiver intended as a video call,
                // so the caller received an audio-only track and saw a permanently
                // black remote video area despite the call otherwise connecting fine.
                const callType = (uiCallType === 'video' || uiCallType === 'voice')
                    ? uiCallType
                    : (window.__CallsCoreShared.callsState.callData?.callType || 'voice');



                const constraints = {


                    // FIX: live settings-aware constraints (echo cancel, noise suppress, video quality)
                    audio: window.__CallsCoreShared.getAudioConstraints(),


                    video: window.__CallsCoreShared.getVideoConstraints(callType)



                };



                



                const streamResult = await window.__CallsCoreShared.MediaManager.getLocalStream(constraints);



                



                if (!streamResult.success) {



                    throw new Error(streamResult.error || 'Failed to get media stream');



                }



                



                // Set active call



                let _activeCallWasSet2 = window.__CallsCoreShared.setActiveCall(callId, callType, []);
                if (!_activeCallWasSet2) {
                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'setActiveCall failed — force-clearing stale state and retrying once', { callId });
                    if (window.callCore && window.callCore.forceResetCallState) {
                        window.callCore.forceResetCallState();
                    } else {
                        window.__CallsCoreShared.callsState.activeCallId = null;
                        window.__CallsCoreShared.callsState.callActive = false;
                    }
                    _activeCallWasSet2 = window.__CallsCoreShared.setActiveCall(callId, callType, []);
                    if (!_activeCallWasSet2) {
                        window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Unable to start call — previous call session would not clear', { callId });
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



                window.__CallsCoreShared.WebRTCManager.createPeerConnection();



                window.__CallsCoreShared.WebRTCManager.addStream(streamResult.stream);



                window.__CallsCoreShared.WebRTCManager.setCurrentCallId(callId);



                window.__CallsCoreShared.WebRTCManager.setConnectionTimeout(window.__CallsCoreShared.CONFIG.CALL_CONNECTION_TIMEOUT);



                



                // ── Bug 1 fix: send call:accept as a direct postMessage type



                // so chat.html's dedicated call:accept handler fires it to



                // POST /calls/:id/answer on the backend. ───────────────────────



                const result = await window.__CallsCoreShared.safeSend('call:accept', {



                    callId,



                    timestamp: Date.now()



                }, false);  // no ack needed — backend confirms via ws event



                // We don't block on result here; if send failed the call will timeout



                



                this.transition(window.__CallsCoreShared.CALLS_STATE.IN_CALL, 'call_accepted');

                // FIX: notify UI so handleCallAccepted fires on receiver side
                this._notifyListeners('call_accepted', {
                    callId,
                    callType,
                    callerName: (window.__CallsCoreShared.callsState.callData && (window.__CallsCoreShared.callsState.callData.callerName || window.__CallsCoreShared.callsState.callData.fromUserName)) || ''
                });

                // NOTE: Do NOT postMessage CALL_ACCEPTED to parent here.
                // The parent chat.html would re-open the calls panel showing the idle
                // 'Ready to Connect' screen over the in-call screen.
                // The caller's iframe receives CALL_ACCEPTED via the backend WebSocket.

                return { success: true };



                



            } catch (error) {



                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Failed to accept call', error);



                window.__CallsCoreShared.resetCallState();



                return { success: false, reason: error.message };



            }



        },



        



        rejectCall: async function(callId, reason = 'declined') {



            if (!window.__CallsCoreShared.assertActive('rejectCall')) {



                return { success: false, reason: 'not_active' };



            }



            



            window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Rejecting call', { callId, reason });



            



            try {



                // ── Bug 1 fix: send CALL_REJECT as direct postMessage type



                // so chat.html's CALL_REJECT handler hits POST /calls/:id/reject ──



                window.__CallsCoreShared.safeSend('CALL_REJECT', {



                    callId,



                    reason,



                    timestamp: Date.now()



                }, false);







                if (window.__CallsCoreShared.callsState.activeCallId === callId) {



                    var _rejReturnTarget = (window.__CallsCoreShared.callsState && (window.__CallsCoreShared.callsState.pendingCallReturnTo || window.__CallsCoreShared.callsState.pendingCallSource)) || 'conversations';

                    window.__CallsCoreShared.resetCallState();

                    // ── FIX: rejectCall() never told the parent to navigate back —
                    // the receiver declining an incoming call was left stuck on
                    // whatever screen happened to be showing.
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _rejReturnTarget, chatUserId: window.__CallsCoreShared.callsState.pendingCallReturnChatUserId || null, chatUserName: window.__CallsCoreShared.callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
                        }
                    } catch (_e) {}

                }



                



                return { success: true };



                



            } catch (error) {



                window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Failed to reject call', error);



                return { success: false, reason: error.message };



            }



        },



endCall: async function(callId, options = {}) {


    // FIX-DUPLICATE-CALL-ON-END: window.KynectaCallRetry.execute() (used by
    // the call:initiate signal above) retries sending call:initiate up to
    // 3 times over up to 25s whenever an attempt doesn't get a clean ack —
    // but nothing anywhere in the codebase ever called .cancel() on it.
    // If the user ends/hangs up the call while a retry is still pending
    // (e.g. the first call:initiate ack was slow/dropped), the queued
    // retry fires call:initiate AGAIN after the call was already ended,
    // which the backend/other side sees as a brand-new incoming call —
    // exactly the "call restarts right after I end it" symptom. Cancel
    // any in-flight retry as the very first thing endCall does.
    if (window.KynectaCallRetry && window.KynectaCallRetry.isActive) {
        window.KynectaCallRetry.cancel('call_ended');
    }

    if (!callId && window.__CallsCoreShared.callsState.activeCallId) {



        callId = window.__CallsCoreShared.callsState.activeCallId;



    }



    



    if (!callId) {



        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'No active call to end');



        return { success: false, reason: 'no_active_call' };



    }



    



    const duration = options.duration || 



        (window.__CallsCoreShared.callsState.callStartTime ? Math.floor((Date.now() - window.__CallsCoreShared.callsState.callStartTime) / 1000) : 0);



    



    const status = options.status || 



        (window.__CallsCoreShared.callsState.callState === 'connected' && duration > 0 ? 'completed' : 



         window.__CallsCoreShared.callsState.callState === 'incoming' ? 'missed' : 



         window.__CallsCoreShared.callsState.callState === 'initiating' ? 'cancelled' : 'failed');



    



    window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Ending call', { callId, duration, status });



    



    try {



        // FIX-ROOT-CAUSE-STALE-ROOM: this function only ever ended the call via
        // the REST /calls/:id/end route and a postMessage to chat.html. Most
        // real-time 1:1 calls are started over the socket 'call:initiate' path
        // (CallSignalingService, in-memory only) and use a local, non-UUID id
        // like "call_1780799144203_x021is" — the REST route explicitly no-ops
        // for anything that isn't a UUID (see routes/calls.js's _looksLikeUUID
        // check), which its own comment says is intentional because "that path
        // is now ended over its own socket 'call:end' event instead." That
        // socket emit was never actually added here, so for the common case
        // the server-side call room in CallSignalingService._rooms was NEVER
        // closed on a normal hangup — it just sat there marked active forever
        // (or until the socket disconnected). The practical symptom: calling
        // the same person again shortly after hanging up hits the stale room's
        // busy/participant bookkeeping and can reopen or re-ring the "ended"
        // call instead of starting a clean new one. Emit call:end directly so
        // the server room is actually torn down every time, regardless of
        // which id format is in play — CallSignalingService keys its rooms by
        // this exact local callId, so this always matches.
        try {
            var _endSock = window.__socket || window.__io || (window.KynectaRealtime && window.KynectaRealtime._socket);
            if (_endSock && typeof _endSock.emit === 'function' && callId) {
                _endSock.emit('call:end', { callId: callId, reason: options.status || 'ended' });
            }
        } catch (_endSockErr) {}



        // Use server UUID (real DB id) if available; fall back to passed callId



        // callsState.serverCallId is set in handleCallInitiated when parent responds



        let numericCallId = window.__CallsCoreShared.callsState.serverCallId || callId;



        // Strip local call_TIMESTAMP_random format if no server UUID available



        if (numericCallId && typeof numericCallId === 'string' && numericCallId.startsWith('call_')) {



            // Still local ID — no server UUID was received. Use whatever we have.



            // The chat.html __callIdMap will translate it via the API_REQUEST intercept.



            numericCallId = numericCallId; // keep as-is; chat.html translates it



        }



        



        // ── Bug 5 fix: send CALL_ENDED as direct postMessage type



        // so chat.html's CALL_ENDED handler POSTs to /calls/:id/end ──────────



        window.__CallsCoreShared.safeSend('CALL_ENDED', {



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
        var _ecReturnTarget = (window.__CallsCoreShared.callsState && (window.__CallsCoreShared.callsState.pendingCallReturnTo || window.__CallsCoreShared.callsState.pendingCallSource)) || 'conversations';

        // CRITICAL: Reset ALL call state variables



        window.__CallsCoreShared.resetCallState();



        window.__CallsCoreShared.callsState.callActive = false;



        window.__CallsCoreShared.callsState.callState = 'idle';



        window.__CallsCoreShared.callsState.activeCallId = null;



        window.__CallsCoreShared.callsState.activeCall = null;



        window.__CallsCoreShared.callsState.callType = null;



        window.__CallsCoreShared.callsState.callParticipants = [];



        window.__CallsCoreShared.callsState.callStartTime = null;



        window.__CallsCoreShared.callsState.connectionState = 'new';



        window.__CallsCoreShared.callsState.signalingState = 'new';

        // ── FIX: Now actually tell the parent to navigate back to where this
        // user was before the call started/was received.
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'POST_CALL_RESTORE', returnTo: _ecReturnTarget, chatUserId: window.__CallsCoreShared.callsState.pendingCallReturnChatUserId || null, chatUserName: window.__CallsCoreShared.callsState.pendingCallReturnChatName || null, timestamp: Date.now() }, '*');
            }
        } catch (_e) {}



        



        // Clear any pending timers



        if (window.__CallsCoreShared.callsState.callInvitationTimer) {



            clearTimeout(window.__CallsCoreShared.callsState.callInvitationTimer);



            window.__CallsCoreShared.callsState.callInvitationTimer = null;



        }



        



        // Clean up media and WebRTC



        window.__CallsCoreShared.MediaManager.stopLocalStream();



        window.__CallsCoreShared.WebRTCManager.close();



        



        if (this._currentState === window.__CallsCoreShared.CALLS_STATE.IN_CALL) {



            this.transition(window.__CallsCoreShared.CALLS_STATE.CALL_READY, 'call_ended');



        }



        



        this._notifyListeners('call_ended', { callId, duration, status });



        window.__CallsCoreShared.notifyListeners('call_ended', { callId, duration, status });



        



        // Force refresh of call history



        setTimeout(() => {



            if (window.parent && window.parent !== window) {



                window.parent.postMessage({



                    type: 'REFRESH_CALL_HISTORY',



                    payload: { userId: window.__CallsCoreShared.callsState.session?.userId, timestamp: Date.now() }



                }, '*');



            }



            if (typeof loadCallHistory === 'function') {



                loadCallHistory();



            }



        }, 500);



        



        return { success: true, duration, status };



        



    } catch (error) {



        window.__CallsCoreShared.logError(window.__CallsCoreShared.MODULE, 'Failed to end call', error);



        window.__CallsCoreShared.resetCallState();



        window.__CallsCoreShared.callsState.callActive = false;



        window.__CallsCoreShared.callsState.callState = 'idle';



        window.__CallsCoreShared.callsState.activeCallId = null;



        return { success: false, reason: error.message };



    }



},







        handleIncomingCall: function(callData) {



            window.__CallsCoreShared.logCall(window.__CallsCoreShared.MODULE, 'Incoming call received (Governor)', callData);







            // ── FIX: Do NOT block on parentReady or assertActive here.



            // This method is called from notifyListeners which may fire before



            // the lifecycle is fully ACTIVE (e.g. after SW reload). Blocking



            // here is the second silent drop-point for incoming calls.



            const blockedStates = [window.__CallsCoreShared.LifecycleState.BOOT, window.__CallsCoreShared.LifecycleState.INITIALIZING];



            if (blockedStates.includes(window.__CallsCoreShared.currentState)) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, `Governor.handleIncomingCall: blocked (${window.__CallsCoreShared.currentState})`);



                return;



            }



            // Auto-promote if session available



            if (window.__CallsCoreShared.currentState !== window.__CallsCoreShared.LifecycleState.ACTIVE) {



                const sess = (this._session && this._session.authenticated) ? this._session : window.__CallsCoreShared.callsState.session;



                if (sess && sess.authenticated) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Governor.handleIncomingCall: auto-promoting to ACTIVE');



                    window.__CallsCoreShared.currentState = window.__CallsCoreShared.LifecycleState.ACTIVE;



                } else {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Governor.handleIncomingCall: no session — dropping');



                    return;



                }



            }







            // CRITICAL: Check for valid session using fallback



            const activeSession = (this._session && this._session.authenticated) ? this._session : window.__CallsCoreShared.callsState.session;



            if (!activeSession || !window.__CallsCoreShared.__isValidSession(activeSession) || activeSession.expiresAt <= Date.now()) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Incoming call rejected - session invalid');



                return;



            }



            



            if (window.__CallsCoreShared.callsState.recoveryMode) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Incoming call queued - recovery mode active');



                return;



            }



            



            // CRITICAL: Check for existing active call



            if (window.__CallsCoreShared.callsState.callActive) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Incoming call rejected - already in a call');



                



                // Bug 1 fix: use direct CALL_REJECT message so parent hits backend



                window.__CallsCoreShared.safeSend('CALL_REJECT', {



                    callId: callData.callId,



                    reason: 'busy',



                    timestamp: Date.now()



                }, false);



                return;



            }



            



            this.verifySession().then(result => {



                if (!result.valid) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Incoming call rejected - verification failed');



                    return;



                }



                



                // CRITICAL FIX: Set activeCallId for incoming calls



                window.__CallsCoreShared.callsState.callData = callData;



                window.__CallsCoreShared.callsState.callState = 'incoming';



                window.__CallsCoreShared.callsState.activeCallId = callData.callId || callData.id || window.__CallsCoreShared.callsState.activeCallId;  // ← CRITICAL: Set activeCallId for incoming calls



                window.__CallsCoreShared.callsState.callActive = false; // Not yet active until answered



                this._notifyListeners('incoming_call', callData);



                window.__CallsCoreShared.notifyListeners('incoming_call', callData);



            });



        },



        



        getState: function() {



            return this._currentState;



        },



        



        getSession: function() {



            return this._session ? { ...this._session } : null;



        },



        



        isActive: function() {



            return this._currentState === window.__CallsCoreShared.CALLS_STATE.ACTIVE && this._validSessionConfirmed;



        },



        



        isCallReady: function() {



            return this._currentState === window.__CallsCoreShared.CALLS_STATE.CALL_READY;



        },



        



        isInCall: function() {



            return this._currentState === window.__CallsCoreShared.CALLS_STATE.IN_CALL;



        },



        



        canInitiateCall: function() {



            const activeSession = (this._session && this._session.authenticated) ? this._session : window.__CallsCoreShared.callsState.session;



            const activeToken = this._token || window.__CallsCoreShared.callsState.token;



            



            return this._currentState === window.__CallsCoreShared.CALLS_STATE.ACTIVE && 



                   activeSession && 



                   window.__CallsCoreShared.__isValidSession(activeSession) &&



                   activeSession.expiresAt > Date.now() &&



                   window.__CallsCoreShared.callsState.verified &&



                   window.__CallsCoreShared.callsState.parentReady &&



                   !window.__CallsCoreShared.callsState.recoveryMode &&



                   !window.__CallsCoreShared.callsState.callActive;



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



            this._currentState = window.__CallsCoreShared.CALLS_STATE.INIT;



            this._previousState = null;



            this._moduleRegistered = false;



            this._sessionReceived = false;



            this._parentReadyReceived = false;



            this._session = null;



            this._token = null;



            this._verificationInProgress = false;



            this._validSessionConfirmed = false;



            window.__CallsCoreShared.resetCallState();



            window.__CallsCoreShared.callsState.registered = false;



            window.__CallsCoreShared.callsState.parentReady = false;



            window.__CallsCoreShared.callsState.session = null;



            window.__CallsCoreShared.callsState.sessionStatus = 'pending';



            window.__CallsCoreShared.callsState.token = null;



            window.__CallsCoreShared.callsState.verified = false;



            window.__CallsCoreShared.callsState.verificationLock = false;



            window.__CallsCoreShared.callsState.recoveryMode = false;



            window.__CallsCoreShared.callsState.sessionReceived = false;



            window.__CallsCoreShared.callsState.childReadySent = false;



            window.__CallsCoreShared.callsState.registrationSent = false;



            window.__CallsCoreShared.validSessionConfirmed = false;



            window.__CallsCoreShared.transitionTo(window.__CallsCoreShared.LifecycleState.INITIALIZING);



            



            window.__CallsCoreShared.MediaManager.stopLocalStream();



            window.__CallsCoreShared.WebRTCManager.close();



        },



        



        _clearTimers: function() {



            if (window.__CallsCoreShared.callsState.callInvitationTimer) {



                clearTimeout(window.__CallsCoreShared.callsState.callInvitationTimer);



                window.__CallsCoreShared.callsState.callInvitationTimer = null;



            }



        }



    };



    



    window.__CallsCoreShared.CallsStateGovernor.initialize();



    



    // ==================== V5 STATE GOVERNOR (Compatibility) ====================



    window.__CallsCoreShared.V5StateGovernor = {



        _currentV5State: window.__CallsCoreShared.V5_STATE.BOOTING,



        



        initialize: function() {



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'V5StateGovernor initialized (compatibility)');



            return this;



        },



        



        transition: function(newV5State, reason = '') {



            const mapping = {



                [window.__CallsCoreShared.V5_STATE.BOOTING]: window.__CallsCoreShared.CALLS_STATE.INIT,



                [window.__CallsCoreShared.V5_STATE.REGISTERING]: window.__CallsCoreShared.CALLS_STATE.REGISTERING,



                [window.__CallsCoreShared.V5_STATE.WAITING_SESSION]: window.__CallsCoreShared.CALLS_STATE.REGISTERED,



                [window.__CallsCoreShared.V5_STATE.WAITING_PARENT_READY]: window.__CallsCoreShared.CALLS_STATE.SESSION_RECEIVED,



                [window.__CallsCoreShared.V5_STATE.ACTIVE]: window.__CallsCoreShared.CALLS_STATE.ACTIVE,



                [window.__CallsCoreShared.V5_STATE.DEGRADED]: window.__CallsCoreShared.CALLS_STATE.TERMINATED,



                [window.__CallsCoreShared.V5_STATE.STANDALONE]: window.__CallsCoreShared.CALLS_STATE.TERMINATED,



                [window.__CallsCoreShared.V5_STATE.OFFLINE]: window.__CallsCoreShared.CALLS_STATE.TERMINATED



            };



            



            const callsState = mapping[newV5State] || window.__CallsCoreShared.CALLS_STATE.INIT;



            window.__CallsCoreShared.CallsStateGovernor.transition(callsState, reason);



            return true;



        },



        



        startRegistration: function() {



            window.__CallsCoreShared.CallsStateGovernor.startHandshake();



        },



        



        handleModuleRegistered: function() {



            window.__CallsCoreShared.CallsStateGovernor.handleModuleRegistered();



        },



        



        handleSessionActive: function(sessionData) {



            window.__CallsCoreShared.CallsStateGovernor.handleSessionActive(sessionData);



        },



        



        handleSessionNull: function() {



            window.__CallsCoreShared.CallsStateGovernor.handleSessionNull();



        },



        



        handleParentReady: function() {



            window.__CallsCoreShared.CallsStateGovernor.handleParentReady();



        },



        



        handleHeartbeatAck: function() {



        },



        



        handleOnline: function() {



        },



        



        handleOffline: function() {



        },



        



        verifySession: function(force) {



            return window.__CallsCoreShared.CallsStateGovernor.verifySession(force);



        },



        



        queueMessage: function(message) {



        },



        



        canSendOperational: function() {



            return window.__CallsCoreShared.CallsStateGovernor.isActive() && window.__CallsCoreShared.CallsStateGovernor._parentReadyReceived;



        },



        



        getState: function() {



            const callsState = window.__CallsCoreShared.CallsStateGovernor.getState();



            const mapping = {



                [window.__CallsCoreShared.CALLS_STATE.INIT]: window.__CallsCoreShared.V5_STATE.BOOTING,



                [window.__CallsCoreShared.CALLS_STATE.REGISTERING]: window.__CallsCoreShared.V5_STATE.REGISTERING,



                [window.__CallsCoreShared.CALLS_STATE.REGISTERED]: window.__CallsCoreShared.V5_STATE.WAITING_SESSION,



                [window.__CallsCoreShared.CALLS_STATE.SESSION_RECEIVED]: window.__CallsCoreShared.V5_STATE.WAITING_PARENT_READY,



                [window.__CallsCoreShared.CALLS_STATE.ACTIVE]: window.__CallsCoreShared.V5_STATE.ACTIVE,



                [window.__CallsCoreShared.CALLS_STATE.CALL_READY]: window.__CallsCoreShared.V5_STATE.ACTIVE,



                [window.__CallsCoreShared.CALLS_STATE.IN_CALL]: window.__CallsCoreShared.V5_STATE.ACTIVE,



                [window.__CallsCoreShared.CALLS_STATE.TERMINATED]: window.__CallsCoreShared.V5_STATE.DEGRADED



            };



            return mapping[callsState] || window.__CallsCoreShared.V5_STATE.BOOTING;



        },



        



        isActive: function() {



            return window.__CallsCoreShared.CallsStateGovernor.isActive();



        },



        



        isDegraded: function() {



            return window.__CallsCoreShared.CallsStateGovernor.getState() === window.__CallsCoreShared.CALLS_STATE.TERMINATED;



        },



        



        isOffline: function() {



            return !navigator.onLine;



        },



        



        addListener: function(listener) {



            window.__CallsCoreShared.CallsStateGovernor.addListener(listener);



        },



        



        removeListener: function(listener) {



            window.__CallsCoreShared.CallsStateGovernor.removeListener(listener);



        },



        



        reset: function() {



            window.__CallsCoreShared.CallsStateGovernor.reset();



        }



    };



    



    window.__CallsCoreShared.V5StateGovernor.initialize();



    



    // ==================== STATE GOVERNOR ====================



    window.__CallsCoreShared.StateGovernor = {



        _currentState: window.__CallsCoreShared.STATE.UNINITIALIZED,



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



            



            this._transition(window.__CallsCoreShared.STATE.UNINITIALIZED, window.__CallsCoreShared.STATE.BOOTSTRAPPING, 'initialize');



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



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, `Illegal state transition: ${oldState} → ${newState}`);



                return false;



            }



            



            this._previousState = oldState;



            this._currentState = newState;



            



            this._updateDerivedState(newState);



            



            window.__CallsCoreShared.logState(window.__CallsCoreShared.MODULE, oldState, newState, reason);



            



            this._notifyListeners('state', { oldState, newState, reason });



            



            this._resolvePromisesForState(newState);



            



            return true;



        },



        



        transition: function(newState, reason = '') {



            return this._transition(newState, reason);



        },



        



        _isLegalTransition: function(from, to) {



            if (to === window.__CallsCoreShared.STATE.ERROR_RECOVERABLE || to === window.__CallsCoreShared.STATE.ERROR_FATAL) return true;



            if (to === window.__CallsCoreShared.STATE.RECOVERING) return from === window.__CallsCoreShared.STATE.ERROR_RECOVERABLE || from === window.__CallsCoreShared.STATE.ERROR_FATAL;



            



            const forwardTransitions = {



                [window.__CallsCoreShared.STATE.UNINITIALIZED]: [window.__CallsCoreShared.STATE.BOOTSTRAPPING],



                [window.__CallsCoreShared.STATE.BOOTSTRAPPING]: [window.__CallsCoreShared.STATE.REGISTERING, window.__CallsCoreShared.STATE.ERROR_RECOVERABLE],



                [window.__CallsCoreShared.STATE.REGISTERING]: [window.__CallsCoreShared.STATE.REGISTERED, window.__CallsCoreShared.STATE.ERROR_RECOVERABLE],



                [window.__CallsCoreShared.STATE.REGISTERED]: [window.__CallsCoreShared.STATE.SESSION_PENDING, window.__CallsCoreShared.STATE.ERROR_RECOVERABLE],



                [window.__CallsCoreShared.STATE.SESSION_PENDING]: [window.__CallsCoreShared.STATE.SESSION_ACTIVE, window.__CallsCoreShared.STATE.ERROR_RECOVERABLE],



                [window.__CallsCoreShared.STATE.SESSION_ACTIVE]: [window.__CallsCoreShared.STATE.SERVICES_INITIALIZING, window.__CallsCoreShared.STATE.ERROR_RECOVERABLE],



                [window.__CallsCoreShared.STATE.SERVICES_INITIALIZING]: [window.__CallsCoreShared.STATE.ACTIVE, window.__CallsCoreShared.STATE.ERROR_RECOVERABLE],



                [window.__CallsCoreShared.STATE.ACTIVE]: [window.__CallsCoreShared.STATE.SUSPENDED, window.__CallsCoreShared.STATE.DEGRADED, window.__CallsCoreShared.STATE.ERROR_RECOVERABLE],



                [window.__CallsCoreShared.STATE.SUSPENDED]: [window.__CallsCoreShared.STATE.ACTIVE, window.__CallsCoreShared.STATE.DEGRADED, window.__CallsCoreShared.STATE.ERROR_RECOVERABLE],



                [window.__CallsCoreShared.STATE.DEGRADED]: [window.__CallsCoreShared.STATE.RECOVERING, window.__CallsCoreShared.STATE.ERROR_RECOVERABLE],



                [window.__CallsCoreShared.STATE.RECOVERING]: [window.__CallsCoreShared.STATE.BOOTSTRAPPING, window.__CallsCoreShared.STATE.ERROR_FATAL],



                [window.__CallsCoreShared.STATE.ERROR_RECOVERABLE]: [window.__CallsCoreShared.STATE.RECOVERING, window.__CallsCoreShared.STATE.ERROR_FATAL],



                [window.__CallsCoreShared.STATE.ERROR_FATAL]: [window.__CallsCoreShared.STATE.RECOVERING]



            };



            



            return forwardTransitions[from] ? forwardTransitions[from].includes(to) : false;



        },



        



        _updateDerivedState: function(state) {



            switch (state) {



                case window.__CallsCoreShared.STATE.SESSION_ACTIVE:



                    this._sessionActive = true;



                    break;



                case window.__CallsCoreShared.STATE.ACTIVE:



                    this._initialized = true;



                    break;



                case window.__CallsCoreShared.STATE.ERROR_FATAL:



                    this._fatalError = true;



                    break;



            }



        },



        



        _resolvePromisesForState: function(state) {



            if (state === window.__CallsCoreShared.STATE.ACTIVE && this._initializationResolve) {



                this._initializationResolve({ success: true, state: window.__CallsCoreShared.STATE.ACTIVE });



                this._initializationResolve = null;



                this._initializationReject = null;



            }



            



            if (state === window.__CallsCoreShared.STATE.SESSION_ACTIVE && this._sessionResolve) {



                this._sessionResolve({ success: true });



                this._sessionResolve = null;



                this._sessionReject = null;



            }



            



            if (state === window.__CallsCoreShared.STATE.ERROR_FATAL) {



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



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Session already active, resolving immediately');



                return Promise.resolve({ success: true, immediate: true });



            }



            



            if (window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Valid session found in callsState');



                this._sessionActive = true;



                this._validSessionConfirmed = true;



                return Promise.resolve({ success: true, fromState: true });



            }



            



            if (this._fatalError) {



                return Promise.reject(new Error('Fatal error occurred'));



            }



            



            if (this._sessionPromise) {



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Returning existing session promise');



                return this._sessionPromise;



            }



            



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, `Creating new session promise with timeout ${timeout}ms`);



            



            this._sessionPromise = new Promise((resolve) => {



                this._sessionResolve = resolve;



                



                this._sessionTimeoutId = setTimeout(() => {



                    if (window.__CallsCoreShared.callsState.session && window.__CallsCoreShared.__isValidSession(window.__CallsCoreShared.callsState.session)) {



                        window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Session became valid during timeout');



                        this._sessionActive = true;



                        this._validSessionConfirmed = true;



                        window.__CallsCoreShared.callsState.sessionReceived = true;



                        window.__CallsCoreShared.callsState.sessionStatus = 'valid';



                        if (this._sessionResolve) {



                            this._sessionResolve({ success: true, delayed: true });



                        }



                    } else {



                        window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, `Session acquisition timeout after ${timeout}ms - continuing with pending state`);



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



            this._currentState = window.__CallsCoreShared.STATE.UNINITIALIZED;



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



    window.__CallsCoreShared.IframeSessionClient = {



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



            



            window.__CallsCoreShared.logReady(window.__CallsCoreShared.MODULE, 'IframeSessionClient initialized', { state: this._state });



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



                        window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'acquisition timeout');



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



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Duplicate session update ignored', { sessionId });



                return;



            }



            if (sessionId) {



                this._lastSessionId = sessionId;



            }



            



            // CRITICAL: Validate session data



            if (data.token && (!data.userId || data.userId === 'user' || data.userId === 0)) {



                window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Session update rejected - invalid userId', { userId: data.userId });



                return;



            }



            



            if (data.token) {



                this._token = data.token;



                this._tokenReceived = true;



                updated = true;



                window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'token received');



            }



            



            if (data.userId || data.user?.id) {



                const newUserId = data.userId || data.user?.id;



                // Reject invalid userId



                if (newUserId === 'user' || newUserId === 0) {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Session update rejected - invalid userId', { userId: newUserId });



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



                    window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'resolving promise from update');



                    this._sessionResolve({ success: true, fromUpdate: true });



                    this._sessionResolve = null;



                    this._sessionReject = null;



                    this._sessionPromise = null;



                }



                



                window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'updated from parent' + (hadToken ? ' (refresh)' : ''));



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



                    window.__CallsCoreShared.logSession(window.__CallsCoreShared.MODULE, 'updated from parent');



                } else {



                    window.__CallsCoreShared.logWarn(window.__CallsCoreShared.MODULE, 'Token update rejected - no valid userId context');



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



            



            window.__CallsCoreShared.callsState.session = this._session;



            window.__CallsCoreShared.callsState.token = this._token;



            window.__CallsCoreShared.callsState.sessionStatus = this._state;



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



            



            window.__CallsCoreShared.callsState.session = null;



            window.__CallsCoreShared.callsState.token = null;



            window.__CallsCoreShared.callsState.sessionReceived = false;



            window.__CallsCoreShared.callsState.sessionStatus = 'invalid';



            window.__CallsCoreShared.validSessionConfirmed = false;



            



            window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Session cleared');



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



                window.__CallsCoreShared.logInfo(window.__CallsCoreShared.MODULE, 'Session expiry approaching - requesting refresh');



                if (window.__CallsCoreShared.parentReady && window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.ACTIVE) {



                    window.__CallsCoreShared.SessionClient.requestSession();



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



                    if (window.__CallsCoreShared.parentReady && window.__CallsCoreShared.currentState === window.__CallsCoreShared.LifecycleState.ACTIVE) {



                        window.__CallsCoreShared.SessionClient.requestSession();



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



    



    window.__CallsCoreShared.IframeSessionClient.initialize();



    

})();
