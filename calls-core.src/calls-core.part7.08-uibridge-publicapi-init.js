/**
 * PART 8/8 — UI BRIDGE, PUBLIC API & INIT
 * Notification system, UI bridge, initialization sequence, top-level message handler (with its own PARENT_READY/signaling handling), the public API surface, the module core controller, final initialization, and the closing of the outer IIFE.
 *
 * This file is a SOURCE FRAGMENT of calls-core.js, not a standalone script.
 * It shares the single closure of the original module and must be concatenated
 * in numeric order (part 0..7) — see build.js — before it is served to the browser.
 * Do NOT <script src> this file directly on its own; it will throw ReferenceErrors
 * for symbols defined in the other parts of the same closure.
 */
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



                



                if (msg.type === MESSAGE_TYPES.CALL_INITIATED_ACK) {

                    handleCallInitiatedAck(msg.payload || msg.data);

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



            



            // FIX-GROUP-CALL-NOTICE: thread options (groupId/isGroupCall) through
            // instead of dropping them, so group calls keep their group context.
            return CallsStateGovernor.initiateCall(callType, participants, options);



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



            



            // FIX (call self-ends right after Accept): this used to check bare
            // callsState.callActive, but handleSignalOffer() legitimately sets
            // that flag true the moment the incoming WebRTC offer arrives --
            // which happens BEFORE the receiver taps Accept, not after. That
            // meant a real Accept tap hit this guard and returned
            // {success:false, reason:'call_active'} even though no call had
            // actually been accepted yet, so CallsStateGovernor.acceptCall()
            // (which sends the real accept signal) never ran. calls-ui.js
            // treats any failure here as "accepted anyway" and shows the
            // in-call screen regardless -- so the receiver saw an in-call
            // screen while the caller/server never got a genuine accept,
            // and the call died shortly after. Match the same, more precise
            // check enforceSingleActiveCall() already uses elsewhere: only
            // block when a genuinely DIFFERENT call is already active.
            if (callsState.callActive && callsState.activeCall && callsState.activeCallId && callsState.activeCallId !== callId) {



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

                    // FIX-CAMERA-SWITCH-FROZEN-REMOTE: actually push the new
                    // camera track to the live peer connection's sender.
                    // Previously only the local preview updated and the
                    // remote party's video froze on the old camera.
                    if (typeof window.callsCoreReplaceVideoTrack === 'function') {
                        window.callsCoreReplaceVideoTrack(result.track);
                    }




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

                    // FIX-SCREENSHARE-NEVER-SENT: actually push the screen
                    // capture track to the live peer connection's video
                    // sender. Previously only the local preview updated and
                    // the remote party never received the shared screen.
                    if (typeof window.callsCoreReplaceVideoTrack === 'function' && result.track) {
                        window.callsCoreReplaceVideoTrack(result.track);
                    }

                    IframeTransport.sendAction('START_SCREEN_SHARE', {

                        timestamp: Date.now()

                    });

                }

                return result;

            });
        },



        



        stopScreenShare: function() {



            if (!assertActive('stopScreenShare')) return;



            



            var _stopResult = MediaManager.stopScreenShare();

            // FIX-SCREENSHARE-NEVER-SENT: revert the peer connection's video
            // sender back to the camera track that was active before sharing
            // started. Without this, ending screen share left the remote
            // party's video frozen on the last screen-share frame forever.
            if (typeof window.callsCoreReplaceVideoTrack === 'function' && _stopResult && _stopResult.revertTrack) {
                window.callsCoreReplaceVideoTrack(_stopResult.revertTrack);
            }

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
    window.callCore.resolveCallId = resolveCallId;
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
            // FIX: server can reject call:initiate with call:error (e.g. the callee's
            // whoCanCallMe privacy setting blocks this caller) — there was no listener
            // for this event at all, so the caller was left stuck on the "calling..."
            // screen forever with no feedback. Reuse the same failed-call reset path
            // used elsewhere in this map (handleCallFailed resets outgoing UI to idle).
            { event: 'kyn:call:error', fn: (d) => {
                logWarn(MODULE, 'call:initiate rejected by server', d);
                handleCallFailed({ ...d, reason: (d && d.code) || 'call_error' });
                notifyListeners('call_error', d);
            }},

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



            // FIX-GROUP-HOST-ONLY-END: when the host ends a group call for everyone,
            // GroupCallEngine tears down the mesh/media, but the visible call screen
            // and bottom-nav restore still go through the same handleCallEnded() path
            // as every other call-ended reason — otherwise non-host participants would
            // be left on a dark call screen even though their media was already released.
            { event: 'kyn:group:call:ended_by_host', fn: (d) => handleCallEnded({ ...d, reason: 'host_ended' }) },

            // FIX-ROOT-CAUSE-NO-HOST-TRANSFER: paired with the backend fix in
            // CallSignalingService.js — when the host leaves/disconnects a
            // group call, the server now promotes another participant and
            // emits this event. Without a listener here, the newly-promoted
            // host's own client never learned about it: GroupCallEngine's
            // isHost() stayed frozen at whatever was passed into
            // joinGroupCall() at join time, so their End-for-everyone/mute/
            // remove controls would stay hidden even though the server would
            // now accept those actions from them.
            { event: 'kyn:group:call:host_changed', fn: (d) => {
                const _gce = window.__GroupCallEngine || window.GroupCall;
                if (_gce && typeof _gce.setHost === 'function' && d && d.newHostId) {
                    _gce.setHost(d.newHostId);
                }
            } },



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
                rt.on('connect', function() {
                    rt.__callsCoreBound = false;
                    setTimeout(_bindRealtime, 150);

                    // FIX-STATE-RECONCILE (Phase 20): the backend already fully
                    // implements call:resync / call:resync_response — verified
                    // in CallSignalingService.js — but nothing in this frontend
                    // ever called it. Without this, a socket that drops and
                    // reconnects mid-call has no way to find out the call ended
                    // (or a participant left) while it was offline; it just
                    // keeps showing a call that the server has already torn
                    // down, with no path back to a correct idle state short of
                    // the user manually hanging up.
                    try {
                        var _resyncCallId = callsState.activeCallId || callsState.serverCallId || callsState.localCallId;
                        if (_resyncCallId && callsState.callActive) {
                            logCall(MODULE, 'Reconnected mid-call — requesting state resync', _resyncCallId);
                            rt.emit('call:resync', { callId: _resyncCallId });
                        }
                    } catch (_) {}
                });

                rt.on('call:resync_response', function(resp) {
                    try {
                        if (!resp || !resp.callId) return;
                        // Ignore a resync response for a call we've since moved
                        // on from (e.g. it arrived late, after the user already
                        // hung up and started a new call).
                        if (typeof _isStaleCallEvent === 'function' && _isStaleCallEvent(resp)) return;

                        var roomActive = resp.roomState && resp.roomState.active;
                        if (!roomActive) {
                            logWarn(MODULE, 'call:resync_response — server reports call no longer active, force-ending locally', resp.callId);
                            handleCallForceEnd({ callId: resp.callId, reason: 'resync_call_ended' });
                            return;
                        }

                        var myId = callsState.session && callsState.session.userId;
                        var stillParticipant = !myId || !Array.isArray(resp.participants)
                            || resp.participants.some(function(p) { return String(p && (p.userId || p.id || p)) === String(myId); });
                        if (!stillParticipant) {
                            logWarn(MODULE, 'call:resync_response — server no longer lists us as a participant, force-ending locally', resp.callId);
                            handleCallForceEnd({ callId: resp.callId, reason: 'resync_removed' });
                            return;
                        }

                        logCall(MODULE, 'call:resync_response — state confirmed consistent', resp.callId);
                    } catch (_) {}
                });
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

                // FIX-MULTI-DEVICE-RING: backend already emits these three events
                // (CallSignalingService.js) but nothing in this file was listening
                // for them, so: (1) other devices kept ringing forever after the
                // call was accepted on one device, (2) callers got no feedback when
                // the callee was already on another call, and (3) callers got no
                // feedback when a rapid repeat call attempt was rate-limited — in
                // both (2) and (3) the outgoing-call UI stayed stuck indefinitely.
                ['call:accepted_elsewhere', (p) => {
                    console.log('[CallsCore] 📴 call:accepted_elsewhere — dismissing ring on this device', p);
                    handleCallAcceptedElsewhere(p);
                }],
                ['call:busy', (p) => {
                    console.warn('[CallsCore] 📵 call:busy — target is in another call', p);
                    if (typeof handleCallFailed === 'function') handleCallFailed({ ...p, reason: 'busy' });
                    else if (typeof resetCallState === 'function') resetCallState();
                }],
                ['call:dedup_rejected', (p) => {
                    console.warn('[CallsCore] 📵 call:dedup_rejected — rate limited', p);
                    if (typeof handleCallFailed === 'function') handleCallFailed({ ...p, reason: 'rate_limited' });
                    else if (typeof resetCallState === 'function') resetCallState();
                }],
                ['call:waiting', (p) => {
                    // Informational: callee is already in a call and could optionally
                    // accept/decline this one as call-waiting. No dedicated call-waiting
                    // UI exists yet — surface it on the EventBus so one can be added
                    // without another silent-drop of a real backend event.
                    console.log('[CallsCore] ℹ️ call:waiting', p);
                    EventBus && EventBus.emit && EventBus.emit('call:waiting', p);
                }],

            ];



            // FIX-LISTENER-DEDUP: _bindRealtime() can run again on every
            // 'connect' event (see the reconnect handler above, and the
            // window 'kyn:realtimeReady' listener below). rt.on() only
            // dedupes by exact function reference, and every call to this
            // function previously created brand-new anonymous closures for
            // each RT_MAP entry, so nothing ever matched and the old
            // listeners were never removed — they just kept accumulating,
            // one full extra set per reconnect. Track the exact wrapped
            // handler we registered for each event so it can be explicitly
            // unbound before the new one goes on.
            if (!rt.__callsCoreRtHandlers) rt.__callsCoreRtHandlers = new Map();

            RT_MAP.forEach(([evtName, handler]) => {

                const prevWrapped = rt.__callsCoreRtHandlers.get(evtName);
                if (prevWrapped) {
                    try { rt.off(evtName, prevWrapped); } catch (_) {}
                }

                const wrapped = (payload) => {

                    console.log(`[${MODULE_NAME}] 📞 KynectaRealtime event [${evtName}]`, payload);

                    try { handler(payload); } catch (e) {

                        console.warn(`[${MODULE_NAME}] KynectaRealtime call handler error (${evtName}):`, e.message);

                    }

                };

                rt.__callsCoreRtHandlers.set(evtName, wrapped);
                rt.on(evtName, wrapped);

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



        if (key === 'mediaAutoDownload' || key === 'autoDownloadMedia') window.__mediaAutoDownload = value;



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



        // FIX (Security settings audit): this module runs inside an
        // iframe and has no access to the auth session or logout — writing
        // __sessionTimeout here did nothing because nothing (in this frame
        // or any other) ever read it. The actual inactivity timeout is now
        // enforced by SESSION_COORDINATOR in the parent frame's
        // app.core.session.js, which reads the saved value straight from
        // localStorage('knecta_settings_cache').security.sessionTimeout.
        if (key === 'sessionTimeout') window.__sessionTimeout = value; // kept for any legacy readers; not the enforcement path



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
